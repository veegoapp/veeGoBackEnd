import { db, tripsTable, bookingsTable, usersTable, notificationsTable, walletTransactionsTable, paymentsTable } from "@workspace/db";
import { and, inArray, lt, gte, sql, eq } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";

const SHUTTLE_MIN_REQUIRED = 7;
const SHUTTLE_LOOKAHEAD_HOURS = 8;
const JOB_INTERVAL_MS = 15 * 60 * 1000;

export async function runShuttleStatusJob(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + SHUTTLE_LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const trips = await db
    .select({ id: tripsTable.id, status: tripsTable.status, departureTime: tripsTable.departureTime })
    .from(tripsTable)
    .where(
      and(
        inArray(tripsTable.status, ["scheduled", "active"]),
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

  const toCancel: number[] = [];
  const toActivate: number[] = [];

  for (const trip of trips) {
    const booked = bookedMap.get(trip.id) ?? 0;
    if (booked < SHUTTLE_MIN_REQUIRED) {
      toCancel.push(trip.id);
    } else if (trip.status === "scheduled") {
      toActivate.push(trip.id);
    }
  }

  if (toCancel.length > 0) {
    await db
      .update(tripsTable)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelReason: "Insufficient bookings — trip cancelled automatically (fewer than 7 riders within 8 hours of departure)",
      })
      .where(inArray(tripsTable.id, toCancel));

    for (const tripId of toCancel) {
      await cancelBookingsForTrip(tripId);
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

export async function cancelBookingsForTrip(tripId: number): Promise<void> {
  // Atomic CTE: transitions bookings from pending/confirmed → cancelled+refunded
  // in a single statement. Whichever caller wins the UPDATE owns the rows;
  // any concurrent caller gets zero rows back and issues zero refunds.
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
        body:   "Your shuttle trip has been cancelled. Your wallet has been fully refunded.",
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
