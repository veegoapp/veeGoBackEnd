import { db, ridesTable, driversTable, rideEventsTable, rideDispatchStateTable } from "@workspace/db";
import { eq, and, sql, not, inArray } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";

const ROUND_TIMEOUT_MS = 15_000;
const MAX_RADIUS_KM    = 5;
const BATCH_SIZE       = 3;
const LOCATION_STALENESS_MINUTES = 10;

const activeTimers = new Map<number, ReturnType<typeof setTimeout>>();

function haversineKmSql(
  pickupLat: number,
  pickupLng: number,
  driverLatCol: Parameters<typeof sql>[0],
  driverLngCol: Parameters<typeof sql>[0],
) {
  return sql<number>`
    6371.0 * 2.0 * ASIN(SQRT(
      POWER(SIN((RADIANS(${driverLatCol}) - RADIANS(${pickupLat})) / 2.0), 2) +
      COS(RADIANS(${pickupLat})) * COS(RADIANS(${driverLatCol})) *
      POWER(SIN((RADIANS(${driverLngCol}) - RADIANS(${pickupLng})) / 2.0), 2)
    ))
  `;
}

interface DriverCandidate {
  id: number;
  userId: number;
  distanceKm: number;
}

async function findNextBatch(
  vehicleType: string,
  pickupLat: number,
  pickupLng: number,
  excludeDriverIds: number[],
): Promise<DriverCandidate[]> {
  const stalenessCutoff = new Date(Date.now() - LOCATION_STALENESS_MINUTES * 60 * 1000);
  const distanceExpr = haversineKmSql(pickupLat, pickupLng, driversTable.currentLatitude, driversTable.currentLongitude);

  const baseConditions = and(
    eq(driversTable.isOnline, true),
    eq(driversTable.status, "online"),
    eq(driversTable.vehicleType, vehicleType),
    sql`${driversTable.currentLatitude} IS NOT NULL`,
    sql`${driversTable.currentLongitude} IS NOT NULL`,
    sql`${driversTable.locationUpdatedAt} > ${stalenessCutoff}`,
    sql`${distanceExpr} <= ${MAX_RADIUS_KM}`,
  );

  const conditions = excludeDriverIds.length > 0
    ? and(baseConditions, not(inArray(driversTable.id, excludeDriverIds)))
    : baseConditions;

  const rows = await db
    .select({
      id:          driversTable.id,
      userId:      driversTable.userId,
      distanceKm:  distanceExpr,
    })
    .from(driversTable)
    .where(conditions)
    .orderBy(distanceExpr)
    .limit(BATCH_SIZE);

  return rows.map((r) => ({
    id:         r.id,
    userId:     r.userId,
    distanceKm: Number(r.distanceKm ?? 0),
  }));
}

function emitOfferToDrivers(
  driverUserIds: number[],
  rideId: number,
  payload: Record<string, unknown>,
): void {
  const io = getIO();
  if (!io) return;
  for (const userId of driverUserIds) {
    io.to(SOCKET_ROOMS.DRIVER(userId)).emit(SOCKET_EVENTS.RIDE_OFFER, payload);
  }
}

function emitToDrivers(
  driverUserIds: number[],
  event: string,
  payload: Record<string, unknown>,
): void {
  const io = getIO();
  if (!io) return;
  for (const userId of driverUserIds) {
    io.to(SOCKET_ROOMS.DRIVER(userId)).emit(event, payload);
  }
}

function scheduleNextRound(rideId: number, delayMs: number): void {
  cancelTimer(rideId);
  const handle = setTimeout(() => {
    advanceRound(rideId).catch((err) =>
      logger.error({ err, rideId }, "Dispatch advanceRound error"),
    );
  }, delayMs);
  activeTimers.set(rideId, handle);
}

function cancelTimer(rideId: number): void {
  const handle = activeTimers.get(rideId);
  if (handle !== undefined) {
    clearTimeout(handle);
    activeTimers.delete(rideId);
  }
}

async function cancelRideNoDrivers(rideId: number, passengerId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(ridesTable)
      .set({ status: "cancelled", cancelReason: "no_drivers", cancelNote: "No available drivers found within 5 km", cancelledAt: new Date() })
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.status, "searching")));

    await tx.insert(rideEventsTable).values({
      rideId,
      type: "RIDE_CANCELLED",
      metadata: { reason: "no_drivers" },
    });
  });

  await db
    .update(rideDispatchStateTable)
    .set({ status: "cancelled" })
    .where(eq(rideDispatchStateTable.rideId, rideId));

  const io = getIO();
  if (io) {
    io.to(SOCKET_ROOMS.PASSENGER(passengerId)).emit(SOCKET_EVENTS.RIDE_STATUS_UPDATE, {
      rideId,
      status: "cancelled",
      reason: "no_drivers",
      message: "No available drivers were found nearby. Please try again.",
    });
  }

  logger.info({ rideId, passengerId }, "Ride cancelled — no drivers within 5 km");
}

async function dispatchBatch(
  rideId: number,
  batch: DriverCandidate[],
  offerPayload: Record<string, unknown>,
  notifiedIds: number[],
): Promise<void> {
  const batchDriverIds  = batch.map((d) => d.id);
  const batchUserIds    = batch.map((d) => d.userId);
  const newNotifiedIds  = [...notifiedIds, ...batchDriverIds];

  await db
    .update(rideDispatchStateTable)
    .set({
      currentRoundIds: batchDriverIds,
      notifiedIds:     newNotifiedIds,
      roundStartedAt:  new Date(),
      currentRound:    sql`${rideDispatchStateTable.currentRound} + 1`,
    })
    .where(eq(rideDispatchStateTable.rideId, rideId));

  emitOfferToDrivers(batchUserIds, rideId, { ...offerPayload, expiresInSeconds: ROUND_TIMEOUT_MS / 1000 });
  scheduleNextRound(rideId, ROUND_TIMEOUT_MS);

  logger.info({ rideId, batchDriverIds, batchUserIds }, "Dispatch round started");
}

export async function startDispatch(
  rideId:      number,
  passengerId: number,
  pickupLat:   number,
  pickupLng:   number,
  vehicleType: string,
  offerPayload: Record<string, unknown>,
): Promise<void> {
  await db.insert(rideDispatchStateTable).values({
    rideId,
    currentRound:    1,
    notifiedIds:     [],
    currentRoundIds: [],
    roundStartedAt:  new Date(),
    status:          "active",
  });

  const batch = await findNextBatch(vehicleType, pickupLat, pickupLng, []);

  if (batch.length === 0) {
    await cancelRideNoDrivers(rideId, passengerId);
    return;
  }

  await dispatchBatch(rideId, batch, offerPayload, []);
}

export async function advanceRound(rideId: number): Promise<void> {
  const [ride] = await db
    .select({ id: ridesTable.id, status: ridesTable.status, passengerId: ridesTable.passengerId, vehicleType: ridesTable.vehicleType, pickupLatitude: ridesTable.pickupLatitude, pickupLongitude: ridesTable.pickupLongitude, pickupAddress: ridesTable.pickupAddress, dropoffAddress: ridesTable.dropoffAddress, distanceKm: ridesTable.distanceKm, estimatedPrice: ridesTable.estimatedPrice })
    .from(ridesTable)
    .where(eq(ridesTable.id, rideId));

  if (!ride || ride.status !== "searching") {
    cancelTimer(rideId);
    return;
  }

  const [state] = await db
    .select()
    .from(rideDispatchStateTable)
    .where(eq(rideDispatchStateTable.rideId, rideId));

  if (!state || state.status !== "active") {
    cancelTimer(rideId);
    return;
  }

  const currentRoundUserIds = await resolveUserIds(state.currentRoundIds as number[]);
  emitToDrivers(currentRoundUserIds, SOCKET_EVENTS.RIDE_OFFER_EXPIRED, { rideId, reason: "round_expired" });

  const offerPayload = {
    rideId,
    vehicleType:    ride.vehicleType,
    pickupAddress:  ride.pickupAddress,
    dropoffAddress: ride.dropoffAddress,
    distanceKm:     Number(ride.distanceKm ?? 0),
    estimatedPrice: Number(ride.estimatedPrice ?? 0),
  };

  let notifiedIds = state.notifiedIds as number[];
  let batch = await findNextBatch(ride.vehicleType, ride.pickupLatitude, ride.pickupLongitude, notifiedIds);

  if (batch.length === 0 && notifiedIds.length > 0) {
    logger.info({ rideId }, "Dispatch exhaustion — restarting cycle from beginning");
    notifiedIds = [];

    await db
      .update(rideDispatchStateTable)
      .set({ notifiedIds: [] })
      .where(eq(rideDispatchStateTable.rideId, rideId));

    batch = await findNextBatch(ride.vehicleType, ride.pickupLatitude, ride.pickupLongitude, []);
  }

  if (batch.length === 0) {
    await cancelRideNoDrivers(rideId, ride.passengerId);
    return;
  }

  await dispatchBatch(rideId, batch, offerPayload, notifiedIds);
}

async function resolveUserIds(driverIds: number[]): Promise<number[]> {
  if (driverIds.length === 0) return [];
  const rows = await db
    .select({ userId: driversTable.userId })
    .from(driversTable)
    .where(inArray(driversTable.id, driverIds));
  return rows.map((r) => r.userId);
}

export async function onAccepted(rideId: number, winningDriverId: number): Promise<void> {
  cancelTimer(rideId);

  const [state] = await db
    .select({ currentRoundIds: rideDispatchStateTable.currentRoundIds })
    .from(rideDispatchStateTable)
    .where(eq(rideDispatchStateTable.rideId, rideId));

  if (state) {
    const otherDriverIds = (state.currentRoundIds as number[]).filter((id) => id !== winningDriverId);
    const otherUserIds   = await resolveUserIds(otherDriverIds);
    emitToDrivers(otherUserIds, SOCKET_EVENTS.RIDE_NO_LONGER_AVAILABLE, { rideId, reason: "accepted_by_another" });

    await db
      .update(rideDispatchStateTable)
      .set({ status: "completed" })
      .where(eq(rideDispatchStateTable.rideId, rideId));
  }

  logger.info({ rideId, winningDriverId }, "Dispatch completed — ride accepted");
}

export async function onCancelled(rideId: number): Promise<void> {
  cancelTimer(rideId);

  const [state] = await db
    .select({ currentRoundIds: rideDispatchStateTable.currentRoundIds })
    .from(rideDispatchStateTable)
    .where(eq(rideDispatchStateTable.rideId, rideId));

  if (state) {
    const userIds = await resolveUserIds(state.currentRoundIds as number[]);
    emitToDrivers(userIds, SOCKET_EVENTS.RIDE_NO_LONGER_AVAILABLE, { rideId, reason: "passenger_cancelled" });

    await db
      .update(rideDispatchStateTable)
      .set({ status: "cancelled" })
      .where(eq(rideDispatchStateTable.rideId, rideId));
  }

  logger.info({ rideId }, "Dispatch cancelled — passenger cancelled");
}

export async function recoverActiveDispatches(): Promise<void> {
  const activeStates = await db
    .select()
    .from(rideDispatchStateTable)
    .where(eq(rideDispatchStateTable.status, "active"));

  if (activeStates.length === 0) {
    logger.info("Dispatch recovery: no active dispatches found");
    return;
  }

  logger.info({ count: activeStates.length }, "Dispatch recovery: recovering active dispatches");

  for (const state of activeStates) {
    const [ride] = await db
      .select({ id: ridesTable.id, status: ridesTable.status })
      .from(ridesTable)
      .where(eq(ridesTable.id, state.rideId));

    if (!ride || ride.status !== "searching") {
      await db
        .update(rideDispatchStateTable)
        .set({ status: "cancelled" })
        .where(eq(rideDispatchStateTable.rideId, state.rideId));
      logger.info({ rideId: state.rideId }, "Dispatch recovery: ride no longer searching, skipping");
      continue;
    }

    const elapsedMs  = Date.now() - new Date(state.roundStartedAt).getTime();
    const remainingMs = Math.max(2_000, ROUND_TIMEOUT_MS - elapsedMs);

    scheduleNextRound(state.rideId, remainingMs);
    logger.info({ rideId: state.rideId, remainingMs }, "Dispatch recovery: timer re-scheduled");
  }
}
