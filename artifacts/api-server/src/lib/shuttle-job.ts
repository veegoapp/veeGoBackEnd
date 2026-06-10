import {
  db,
  tripsTable,
  bookingsTable,
  usersTable,
  notificationsTable,
  walletTransactionsTable,
  paymentsTable,
  driversTable,
  VEHICLE_MIN_THRESHOLD,
} from "@workspace/db";
import { and, inArray, lt, gte, sql, eq } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";

const SHUTTLE_LOOKAHEAD_HOURS = 10;
const JOB_INTERVAL_MS = 15 * 60 * 1000;

export async function runShuttleStatusJob(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + SHUTTLE_LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const trips = await db
    .select({
      id: tripsTable.id,
      status: tripsTable.status,
      departureTime: tripsTable.departureTime,
      vehicleType: tripsTable.vehicleType,
      totalSeats: tripsTable.totalSeats,
      driverId: tripsTable.driverId,
    })
    .from(tripsTable)
    .where(
      and(
        inArray(tripsTable.status, ["scheduled", "active", "waiting_driver"]),
        gte(tripsTable.departureTime, now),
        lt(tripsTable.departureTime, cutoff),
      ),
    );

  if (trips.length === 0) return;

  const tripIds = trips.map((t) => t.id);

  const bookedCounts = await db
    .select({
      tripId: bookingsTable.tripId,
      bookedSeats: sql<number>`coalesce(sum(${bookingsTable.seatCount}), 0)::int`,
    })
    .from(bookingsTable)
    .where(
      and(
        inArray(bookingsTable.tripId, tripIds),
        inArray(bookingsTable.status, ["pending", "confirmed"]),
      ),
    )
    .groupBy(bookingsTable.tripId);

  const bookedMap = new Map(bookedCounts.map((b) => [b.tripId, b.bookedSeats]));

  const toCancel: { id: number; driverId: number | null; vehicleType: string }[] = [];
  const toActivate: number[] = [];

  for (const trip of trips) {
    const booked = bookedMap.get(trip.id) ?? 0;
    const vt = (trip.vehicleType ?? "hiace") as "hiace" | "minibus";
    const threshold = VEHICLE_MIN_THRESHOLD[vt];

    if (booked < threshold) {
      toCancel.push({ id: trip.id, driverId: trip.driverId, vehicleType: vt });
    } else if (trip.status === "scheduled") {
      toActivate.push(trip.id);
    }
  }

  if (toCancel.length > 0) {
    const cancelIds = toCancel.map((t) => t.id);

    await db
      .update(tripsTable)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelReason: "Insufficient bookings — trip auto-cancelled (minimum passenger threshold not met 10 hours before departure)",
      })
      .where(inArray(tripsTable.id, cancelIds));

    for (const trip of toCancel) {
      await cancelBookingsForTrip(trip.id);

      if (trip.driverId) {
        await notifyDriver(trip.driverId, trip.id);
      }
    }
  }

  if (toActivate.length > 0) {
    await db
      .update(tripsTable)
      .set({ status: "active" })
      .where(inArray(tripsTable.id, toActivate));
  }

  logger.info({ cancelled: toCancel.length, activated: toActivate.length }, "Shuttle status job completed");
}

async function notifyDriver(driverId: number, tripId: number): Promise<void> {
  const io = getIO();
  const [driver] = await db
    .select({ userId: driversTable.userId })
    .from(driversTable)
    .where(eq(driversTable.id, driverId));

  if (!driver) return;

  const [notif] = await db
    .insert(notificationsTable)
    .values({
      userId: driver.userId,
      title: "Trip Cancelled — Low Bookings",
      body: `Trip #${tripId} has been automatically cancelled due to insufficient passenger bookings before departure.`,
    })
    .returning();

  if (io && notif) {
    io.to(SOCKET_ROOMS.PASSENGER(driver.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
      id: String(notif.id),
      category: "trip",
      title: notif.title,
      body: notif.body,
      time: notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
    });
  }
}

export async function cancelBookingsForTrip(tripId: number): Promise<void> {
  type RefundRow = { id: number; user_id: number; total_price: string; payment_status: string };
  const refundResult = await db.execute<RefundRow>(sql`
    WITH cancelled AS (
      UPDATE bookings
      SET    status         = 'cancelled',
             payment_status = 'refunded'
      WHERE  trip_id = ${tripId}
        AND  status IN ('pending', 'confirmed')
      RETURNING id, user_id, total_price, payment_status
    )
    SELECT * FROM cancelled
  `);

  const bookings = refundResult.rows;
  if (bookings.length === 0) return;

  const io = getIO();

  for (const booking of bookings) {
    if (booking.payment_status === "paid") {
      await db.execute(
        sql`UPDATE users SET wallet_balance = wallet_balance + ${booking.total_price} WHERE id = ${booking.user_id}`,
      );

      await db.insert(walletTransactionsTable).values({
        userId:      booking.user_id,
        amount:      booking.total_price,
        type:        "refund",
        description: `Refund for booking #${booking.id} (trip #${tripId}) — trip cancelled`,
      });

      await db.insert(paymentsTable).values({
        userId:    booking.user_id,
        bookingId: booking.id,
        amount:    booking.total_price,
        method:    "wallet",
        status:    "refunded",
        notes:     `Refund for booking #${booking.id} — trip #${tripId} cancelled`,
      });
    }

    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId: booking.user_id,
        title:  "Shuttle Trip Cancelled",
        body:   "Your shuttle trip has been cancelled due to low bookings. Your wallet has been fully refunded.",
      })
      .returning();

    if (io && notif) {
      io.to(SOCKET_ROOMS.PASSENGER(booking.user_id)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
        id:       String(notif.id),
        category: "trip",
        title:    notif.title,
        body:     notif.body,
        time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
      });
    }
  }
}

let jobTimer: ReturnType<typeof setInterval> | null = null;

export function startShuttleJob(): void {
  if (jobTimer) return;
  void runShuttleStatusJob().catch((err) =>
    logger.error({ err }, "Shuttle status job failed on startup run"),
  );
  jobTimer = setInterval(() => {
    void runShuttleStatusJob().catch((err) =>
      logger.error({ err }, "Shuttle status job failed"),
    );
  }, JOB_INTERVAL_MS);
  logger.info({ intervalMs: JOB_INTERVAL_MS }, "Shuttle status job started");
}
