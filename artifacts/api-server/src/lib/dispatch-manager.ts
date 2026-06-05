import { db, ridesTable, driversTable, rideEventsTable, rideDispatchStateTable, usersTable, walletTransactionsTable } from "@workspace/db";
import { eq, and, sql, not, inArray } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";

const ROUND_TIMEOUT_MS           = 15_000;
const BATCH_SIZE                 = 3;
const LOCATION_STALENESS_MINUTES = 10;

// ── Feature 5: dynamic radius expansion ───────────────────────────────────────
// findNextBatch() is tried with each radius in order.
// The first radius that returns ≥ 1 driver is used; if all fail, existing
// no-drivers cancellation logic fires unchanged.
const RADIUS_STEPS_KM = [5, 8, 12] as const;

// ── Feature 3: cooldown constants ─────────────────────────────────────────────
const COOLDOWN_THRESHOLD = 3;   // consecutive rejections before cooldown
const COOLDOWN_MINUTES   = 10;  // how long the cooldown lasts

// ── Feature 4: fair ride distribution ────────────────────────────────────────
const RECENT_DISPATCH_WINDOW_MINUTES = 10;  // look-back window for the penalty
const RECENT_DISPATCH_PENALTY        = 0.1; // score deducted for recently offered drivers

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

/**
 * Finds up to BATCH_SIZE eligible drivers within the given radiusKm.
 *
 * Feature 2 — Smart Driver Selection:
 *   50%  distance       (closer = higher score, normalised over radiusKm)
 *   30%  rating         (higher star rating = higher score, normalised 1–5 → 0–1)
 *   20%  acceptance rate (totalAccepted / totalDispatched; 0.5 neutral for new drivers)
 *
 * Feature 3 — Cooldown: drivers with cooldownUntil > NOW() are excluded.
 *
 * Feature 4 — Fair distribution: drivers offered a ride within the last
 *   RECENT_DISPATCH_WINDOW_MINUTES get a -RECENT_DISPATCH_PENALTY score modifier.
 *
 * Feature 5 — Dynamic radius: the radiusKm param is supplied by
 *   findNextBatchWithExpansion(), which tries RADIUS_STEPS_KM in order.
 *   distanceScore is normalised against the actual radiusKm used so scores
 *   stay in [0,1] regardless of which radius tier is active.
 */
async function findNextBatch(
  vehicleType: string,
  pickupLat: number,
  pickupLng: number,
  excludeDriverIds: number[],
  radiusKm: number,
): Promise<DriverCandidate[]> {
  const stalenessCutoff = new Date(Date.now() - LOCATION_STALENESS_MINUTES * 60 * 1000);
  const distanceExpr    = haversineKmSql(pickupLat, pickupLng, driversTable.currentLatitude, driversTable.currentLongitude);

  // Composite score — all dimensions normalised to [0, 1], then a flat penalty modifier.
  //   distanceScore   = (radiusKm - km) / radiusKm  → 1 at pickup, 0 at radius edge
  //   ratingScore     = (rating - 1) / 4            → 0 for 1-star, 1 for 5-star
  //   acceptanceScore = accepted / dispatched        (0.5 neutral for brand-new drivers; capped at 1.0)
  //   recentPenalty   = -0.1 if offered within last RECENT_DISPATCH_WINDOW_MINUTES, else 0
  const scoreExpr = sql<number>`
    0.5 * ((${radiusKm}::float - LEAST(${distanceExpr}, ${radiusKm}::float)) / ${radiusKm}::float)
    + 0.3 * ((COALESCE(${driversTable.rating}::float, 5.0) - 1.0) / 4.0)
    + 0.2 * (CASE
               WHEN ${driversTable.totalDispatched} = 0 THEN 0.5
               ELSE LEAST(${driversTable.totalAccepted}::float / ${driversTable.totalDispatched}::float, 1.0)
             END)
    - CASE
        WHEN ${driversTable.lastDispatchedAt} IS NOT NULL
         AND ${driversTable.lastDispatchedAt} > NOW() - (${RECENT_DISPATCH_WINDOW_MINUTES} || ' minutes')::interval
        THEN ${RECENT_DISPATCH_PENALTY}::float
        ELSE 0.0
      END
  `;

  const baseConditions = and(
    eq(driversTable.isOnline, true),
    eq(driversTable.status, "online"),
    eq(driversTable.vehicleType, vehicleType),
    eq(driversTable.checkInRequired, false),
    sql`${driversTable.currentLatitude} IS NOT NULL`,
    sql`${driversTable.currentLongitude} IS NOT NULL`,
    sql`${driversTable.locationUpdatedAt} > ${stalenessCutoff}`,
    sql`${distanceExpr} <= ${radiusKm}`,
    sql`(${driversTable.cooldownUntil} IS NULL OR ${driversTable.cooldownUntil} <= NOW())`,
  );

  const conditions = excludeDriverIds.length > 0
    ? and(baseConditions, not(inArray(driversTable.id, excludeDriverIds)))
    : baseConditions;

  const rows = await db
    .select({
      id:         driversTable.id,
      userId:     driversTable.userId,
      distanceKm: distanceExpr,
      score:      scoreExpr,
    })
    .from(driversTable)
    .where(conditions)
    .orderBy(sql`${scoreExpr} DESC`)
    .limit(BATCH_SIZE);

  return rows.map((r) => ({
    id:         r.id,
    userId:     r.userId,
    distanceKm: Number(r.distanceKm ?? 0),
  }));
}

/**
 * Feature 5 — Dynamic radius expansion.
 *
 * Tries each radius in RADIUS_STEPS_KM in ascending order and returns the
 * first result set with ≥ 1 driver. If all radii return empty, returns an
 * empty drivers array with the last radius used (caller handles no-drivers).
 *
 * At most 3 DB queries in the worst case; 1 in the happy path.
 */
async function findNextBatchWithExpansion(
  vehicleType: string,
  pickupLat: number,
  pickupLng: number,
  excludeDriverIds: number[],
): Promise<{ drivers: DriverCandidate[]; radiusUsedKm: number }> {
  for (const radiusKm of RADIUS_STEPS_KM) {
    const drivers = await findNextBatch(vehicleType, pickupLat, pickupLng, excludeDriverIds, radiusKm);
    if (drivers.length > 0) {
      if (radiusKm > RADIUS_STEPS_KM[0]) {
        logger.info({ radiusKm, driverCount: drivers.length }, "Dispatch radius expanded — drivers found beyond default 5 km");
      }
      return { drivers, radiusUsedKm: radiusKm };
    }
  }
  return { drivers: [], radiusUsedKm: RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1] };
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
    const [ride] = await tx
      .select({ estimatedPrice: ridesTable.estimatedPrice })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId));

    await tx
      .update(ridesTable)
      .set({ status: "cancelled", cancelReason: "no_drivers", cancelNote: "No available drivers found within 5 km", cancelledAt: new Date() })
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.status, "searching")));

    await tx.insert(rideEventsTable).values({
      rideId,
      type: "RIDE_CANCELLED",
      metadata: { reason: "no_drivers" },
    });

    const escrowed = ride?.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0;
    if (escrowed > 0) {
      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${escrowed}` })
        .where(eq(usersTable.id, passengerId));

      await tx.insert(walletTransactionsTable).values({
        userId:      passengerId,
        amount:      escrowed.toFixed(2),
        type:        "refund",
        description: `Ride #${rideId} cancelled (no drivers) — payment refunded`,
      });
    }
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

/**
 * Sends the current batch of offers and schedules the next round timer.
 *
 * Feature 2: increments totalDispatched for every driver receiving an offer.
 * This is a fire-and-forget stat update — a missed increment on crash is
 * acceptable for a statistical counter.
 */
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

  // Feature 2 + 4: track offer count and stamp the last-dispatched time in one update.
  // lastDispatchedAt drives the -0.1 recency penalty in findNextBatch() so recently
  // offered drivers are deprioritised for RECENT_DISPATCH_WINDOW_MINUTES minutes.
  if (batchDriverIds.length > 0) {
    db.update(driversTable)
      .set({
        totalDispatched:  sql`${driversTable.totalDispatched} + 1`,
        lastDispatchedAt: sql`NOW()`,
      })
      .where(inArray(driversTable.id, batchDriverIds))
      .catch((err) => logger.error({ err, rideId, batchDriverIds }, "Failed to update totalDispatched / lastDispatchedAt"));
  }

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

  const { drivers: batch, radiusUsedKm } = await findNextBatchWithExpansion(vehicleType, pickupLat, pickupLng, []);

  if (batch.length === 0) {
    await cancelRideNoDrivers(rideId, passengerId);
    return;
  }

  logger.info({ rideId, radiusUsedKm }, "Dispatch started");
  await dispatchBatch(rideId, batch, offerPayload, []);
}

/**
 * Called when a round's 15-second timer expires with no acceptance.
 *
 * Feature 3: increments consecutiveRejections for every driver in the expired
 * round. If any driver hits COOLDOWN_THRESHOLD, their counter resets to 0 and
 * cooldownUntil is set to NOW() + COOLDOWN_MINUTES. A single bulk UPDATE with
 * CASE expressions handles all drivers atomically.
 */
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

  const expiredDriverIds    = state.currentRoundIds as number[];
  const currentRoundUserIds = await resolveUserIds(expiredDriverIds);
  emitToDrivers(currentRoundUserIds, SOCKET_EVENTS.RIDE_OFFER_EXPIRED, { rideId, reason: "round_expired" });

  // Feature 3: update consecutiveRejections for every driver in the expired round.
  // If a driver's new count reaches the threshold, lock them out for COOLDOWN_MINUTES
  // and reset their counter so the cycle starts fresh after the cooldown.
  if (expiredDriverIds.length > 0) {
    db.update(driversTable)
      .set({
        consecutiveRejections: sql`
          CASE
            WHEN ${driversTable.consecutiveRejections} + 1 >= ${COOLDOWN_THRESHOLD}
            THEN 0
            ELSE ${driversTable.consecutiveRejections} + 1
          END
        `,
        cooldownUntil: sql`
          CASE
            WHEN ${driversTable.consecutiveRejections} + 1 >= ${COOLDOWN_THRESHOLD}
            THEN NOW() + (${COOLDOWN_MINUTES} || ' minutes')::interval
            ELSE ${driversTable.cooldownUntil}
          END
        `,
      })
      .where(inArray(driversTable.id, expiredDriverIds))
      .catch((err) => logger.error({ err, rideId, expiredDriverIds }, "Failed to update consecutiveRejections"));
  }

  const offerPayload = {
    rideId,
    vehicleType:    ride.vehicleType,
    pickupAddress:  ride.pickupAddress,
    dropoffAddress: ride.dropoffAddress,
    distanceKm:     Number(ride.distanceKm ?? 0),
    estimatedPrice: Number(ride.estimatedPrice ?? 0),
  };

  let notifiedIds = state.notifiedIds as number[];
  let { drivers: batch, radiusUsedKm } = await findNextBatchWithExpansion(ride.vehicleType, ride.pickupLatitude, ride.pickupLongitude, notifiedIds);

  if (batch.length === 0 && notifiedIds.length > 0) {
    logger.info({ rideId }, "Dispatch exhaustion — restarting cycle from beginning");
    notifiedIds = [];

    await db
      .update(rideDispatchStateTable)
      .set({ notifiedIds: [] })
      .where(eq(rideDispatchStateTable.rideId, rideId));

    ({ drivers: batch, radiusUsedKm } = await findNextBatchWithExpansion(ride.vehicleType, ride.pickupLatitude, ride.pickupLongitude, []));
  }

  if (batch.length === 0) {
    await cancelRideNoDrivers(rideId, ride.passengerId);
    return;
  }

  logger.info({ rideId, radiusUsedKm }, "Dispatch round advanced");
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

/**
 * Called when a driver accepts a ride offer.
 *
 * Feature 2: increments totalAccepted for the winning driver.
 * Feature 3: resets consecutiveRejections to 0 and clears any residual cooldown
 *            so the driver starts their next dispatch cycle with a clean slate.
 */
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

  // Feature 2 + 3: reward the accepting driver — count the acceptance and
  // clear their rejection streak/cooldown.
  db.update(driversTable)
    .set({
      totalAccepted:         sql`${driversTable.totalAccepted} + 1`,
      consecutiveRejections: 0,
      cooldownUntil:         null,
    })
    .where(eq(driversTable.id, winningDriverId))
    .catch((err) => logger.error({ err, rideId, winningDriverId }, "Failed to update driver acceptance stats"));

  logger.info({ rideId, winningDriverId }, "Dispatch completed — ride accepted");
}

/**
 * Re-dispatch a ride after a driver cancels an accepted ride.
 * Resets the dispatch state to a fresh cycle (all drivers eligible again)
 * and starts a new round. The ride must already be set back to "searching"
 * with driverId cleared before this is called.
 */
export async function restartDispatch(
  rideId:       number,
  passengerId:  number,
  pickupLat:    number,
  pickupLng:    number,
  vehicleType:  string,
  offerPayload: Record<string, unknown>,
): Promise<void> {
  cancelTimer(rideId);

  // Upsert the dispatch state: reset to a fresh active cycle.
  // The row will already exist (status="completed") from the original dispatch,
  // so we update it. The upsert handles the unlikely case where no row exists.
  await db
    .insert(rideDispatchStateTable)
    .values({
      rideId,
      currentRound:    1,
      notifiedIds:     [],
      currentRoundIds: [],
      roundStartedAt:  new Date(),
      status:          "active",
    })
    .onConflictDoUpdate({
      target: rideDispatchStateTable.rideId,
      set: {
        currentRound:    1,
        notifiedIds:     [],
        currentRoundIds: [],
        roundStartedAt:  new Date(),
        status:          "active",
      },
    });

  const { drivers: batch, radiusUsedKm } = await findNextBatchWithExpansion(vehicleType, pickupLat, pickupLng, []);

  if (batch.length === 0) {
    await cancelRideNoDrivers(rideId, passengerId);
    return;
  }

  await dispatchBatch(rideId, batch, offerPayload, []);
  logger.info({ rideId, passengerId, radiusUsedKm }, "Dispatch restarted after driver cancel");
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
