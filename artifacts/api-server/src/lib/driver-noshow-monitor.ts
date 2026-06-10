/**
 * Driver No-Show Monitor
 *
 * Runs every 5 minutes. Detects shuttle trips that have passed their departure
 * time without the driver starting boarding, then:
 *
 *  1st offence  — warning notification to driver
 *  2nd offence  — deduct total passenger fares from driver wallet + notification
 *  3rd offence  — suspend driver account + notification
 *
 * Passengers are always refunded regardless of which offence it is.
 * The trip is cancelled after processing.
 */

import {
  db,
  driversTable,
  tripsTable,
  bookingsTable,
  usersTable,
  notificationsTable,
  walletTransactionsTable,
  shuttleOffencesTable,
} from "@workspace/db";
import { and, inArray, lt, sql, eq } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";

const JOB_INTERVAL_MS   = 5 * 60 * 1000;
const NO_SHOW_GRACE_MIN = 5; // minutes past departure before we declare a no-show

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendNotification(userId: number, title: string, body: string): Promise<void> {
  const [notif] = await db
    .insert(notificationsTable)
    .values({ userId, title, body })
    .returning();

  const io = getIO();
  if (io && notif) {
    io.to(SOCKET_ROOMS.DRIVER(userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
      id:       String(notif.id),
      category: "trip",
      title:    notif.title,
      body:     notif.body,
      time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
    });
    io.to(SOCKET_ROOMS.PASSENGER(userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
      id:       String(notif.id),
      category: "trip",
      title:    notif.title,
      body:     notif.body,
      time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
    });
  }
}

async function refundPassengersForTrip(tripId: number): Promise<void> {
  type RefundRow = { id: number; user_id: number; total_price: string; payment_status: string };
  const result = await db.execute<RefundRow>(sql`
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

  const io = getIO();
  for (const booking of result.rows) {
    await db.execute(
      sql`UPDATE users SET wallet_balance = wallet_balance + ${booking.total_price} WHERE id = ${booking.user_id}`,
    );

    await db.insert(walletTransactionsTable).values({
      userId:      booking.user_id,
      amount:      booking.total_price,
      type:        "refund",
      description: `Refund for booking #${booking.id} — driver did not show up for trip #${tripId}`,
    });

    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId: booking.user_id,
        title:  "Trip Cancelled — Driver No-Show",
        body:   "Your shuttle trip was cancelled because the driver did not show up. Your wallet has been fully refunded.",
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

// ─── Main job ─────────────────────────────────────────────────────────────────

export async function runDriverNoShowJob(): Promise<void> {
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - NO_SHOW_GRACE_MIN * 60 * 1000);

  // Find trips past departure (+ grace period) that are still awaiting the driver
  const noShowTrips = await db
    .select({
      id:       tripsTable.id,
      driverId: tripsTable.driverId,
    })
    .from(tripsTable)
    .where(
      and(
        inArray(tripsTable.status, ["waiting_driver", "driver_assigned"]),
        lt(tripsTable.departureTime, graceCutoff),
      ),
    );

  if (noShowTrips.length === 0) return;

  for (const trip of noShowTrips) {
    try {
      // Cancel the trip immediately so passengers are refunded and it won't re-process
      await db
        .update(tripsTable)
        .set({
          status:       "cancelled",
          cancelledAt:  now,
          cancelReason: "Driver did not show up — trip auto-cancelled",
        })
        .where(eq(tripsTable.id, trip.id));

      // Refund all confirmed passengers regardless of offence level
      await refundPassengersForTrip(trip.id);

      if (!trip.driverId) continue;

      // ── Resolve driver's user account ──────────────────────────────────
      const [driver] = await db
        .select({ id: driversTable.id, userId: driversTable.userId, status: driversTable.status })
        .from(driversTable)
        .where(eq(driversTable.id, trip.driverId));

      if (!driver) continue;

      // ── Upsert offence row — get current count BEFORE incrementing ─────
      const [existing] = await db
        .select({ offenceCount: shuttleOffencesTable.offenceCount })
        .from(shuttleOffencesTable)
        .where(
          and(
            eq(shuttleOffencesTable.userId, driver.userId),
            eq(shuttleOffencesTable.actorType, "driver"),
          ),
        );

      const prevCount = existing?.offenceCount ?? 0;
      const newCount  = prevCount + 1;

      // Determine what action to record
      const action = newCount === 1 ? "warning" : newCount === 2 ? "fined" : "suspended";

      await db
        .insert(shuttleOffencesTable)
        .values({
          userId:       driver.userId,
          actorType:    "driver",
          offenceCount: 1,
          lastAction:   action,
          lastOffenceAt: now,
        })
        .onConflictDoUpdate({
          target: [shuttleOffencesTable.userId, shuttleOffencesTable.actorType],
          set: {
            offenceCount:  sql`${shuttleOffencesTable.offenceCount} + 1`,
            lastAction:    action,
            lastOffenceAt: now,
          },
        });

      // ── Apply enforcement by offence level ─────────────────────────────
      if (newCount === 1) {
        // First offence — warning only
        await sendNotification(
          driver.userId,
          "Missed Trip — First Warning",
          `You missed your shuttle trip #${trip.id}. This is your first warning. Repeated no-shows will result in financial penalties and account suspension.`,
        );
        logger.info({ driverId: driver.id, tripId: trip.id }, "driver-noshow: 1st offence warning issued");

      } else if (newCount === 2) {
        // Second offence — charge driver total passenger fares
        type FareRow = { total: string };
        const [fareResult] = await db.execute<FareRow>(sql`
          SELECT COALESCE(SUM(total_price), 0)::text AS total
          FROM bookings
          WHERE trip_id = ${trip.id}
            AND status IN ('pending', 'confirmed', 'cancelled')
        `);
        const totalFare = fareResult?.total ?? "0";

        if (parseFloat(totalFare) > 0) {
          await db.execute(
            sql`UPDATE users SET wallet_balance = wallet_balance - ${totalFare} WHERE id = ${driver.userId}`,
          );

          await db.insert(walletTransactionsTable).values({
            userId:      driver.userId,
            amount:      `-${totalFare}`,
            type:        "payment",
            description: `Penalty: missed shuttle trip #${trip.id} — total passenger fares deducted`,
          });
        }

        await sendNotification(
          driver.userId,
          "Missed Trip — Fare Deducted",
          `You missed your shuttle trip #${trip.id}. The total passenger fares (${totalFare} EGP) have been deducted from your wallet. This is your second warning.`,
        );
        logger.info({ driverId: driver.id, tripId: trip.id, totalFare }, "driver-noshow: 2nd offence fined");

      } else {
        // Third+ offence — suspend account
        await db
          .update(driversTable)
          .set({ status: "suspended", isActive: false, isOnline: false })
          .where(eq(driversTable.id, driver.id));

        await db
          .update(usersTable)
          .set({ isBlocked: true })
          .where(eq(usersTable.id, driver.userId));

        await sendNotification(
          driver.userId,
          "Account Suspended",
          `Your driver account has been suspended due to repeated no-shows (trip #${trip.id}). Please contact support.`,
        );
        logger.warn({ driverId: driver.id, tripId: trip.id }, "driver-noshow: 3rd+ offence — account suspended");
      }
    } catch (err) {
      logger.error({ err, tripId: trip.id }, "driver-noshow: error processing trip");
    }
  }

  logger.info({ processed: noShowTrips.length }, "driver-noshow: job completed");
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

let jobTimer: ReturnType<typeof setInterval> | null = null;

export function startDriverNoShowMonitor(): void {
  if (jobTimer) return;
  void runDriverNoShowJob().catch((err) =>
    logger.error({ err }, "driver-noshow: startup run failed"),
  );
  jobTimer = setInterval(() => {
    void runDriverNoShowJob().catch((err) =>
      logger.error({ err }, "driver-noshow: job failed"),
    );
  }, JOB_INTERVAL_MS);
  logger.info({ intervalMs: JOB_INTERVAL_MS }, "driver-noshow monitor started");
}
