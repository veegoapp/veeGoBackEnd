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

async function cancelBookingsForTrip(tripId: number): Promise<void> {
  const bookings = await db
    .select({
      id: bookingsTable.id,
      userId: bookingsTable.userId,
      totalPrice: bookingsTable.totalPrice,
      paymentStatus: bookingsTable.paymentStatus,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.tripId, tripId),
        inArray(bookingsTable.status, ["pending", "confirmed"]),
      ),
    );

  if (bookings.length === 0) return;

  await db
    .update(bookingsTable)
    .set({ status: "cancelled", paymentStatus: "refunded" })
    .where(
      and(
        eq(bookingsTable.tripId, tripId),
        inArray(bookingsTable.status, ["pending", "confirmed"]),
      ),
    );

  const io = getIO();

  for (const booking of bookings) {
    if (booking.paymentStatus === "paid") {
      await db.execute(
        sql`UPDATE users SET wallet_balance = wallet_balance + ${booking.totalPrice} WHERE id = ${booking.userId}`,
      );

      await db.insert(walletTransactionsTable).values({
        userId:      booking.userId,
        amount:      booking.totalPrice,
        type:        "refund",
        description: `Refund for booking (trip #${tripId}) — trip cancelled due to insufficient bookings`,
      });

      await db.insert(paymentsTable).values({
        userId:    booking.userId,
        bookingId: booking.id,
        amount:    booking.totalPrice,
        method:    "wallet",
        status:    "refunded",
        notes:     `Refund for booking #${booking.id} — trip #${tripId} cancelled (insufficient riders)`,
      });
    }

    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId: booking.userId,
        title:  "Shuttle Trip Cancelled",
        body:   "Your shuttle trip could not gather enough riders and has been cancelled. Your wallet has been fully refunded.",
      })
      .returning();

    if (io && notif) {
      io.to(SOCKET_ROOMS.PASSENGER(booking.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
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
