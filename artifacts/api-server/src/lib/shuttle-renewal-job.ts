import {
  db,
  driverShuttleBookingsTable,
  routeTimeSlotsTable,
  routesTable,
  driversTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, isNull, lte, inArray, sql } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";

const JOB_INTERVAL_MS = 10 * 60 * 1000;
const RENEWAL_WINDOW_HOURS = 10;

function getNextWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const sunday = new Date(now);
  sunday.setUTCDate(sunday.getUTCDate() + daysUntilSunday);
  sunday.setUTCHours(0, 0, 0, 0);
  const thursday = new Date(sunday);
  thursday.setUTCDate(sunday.getUTCDate() + 4);
  return {
    weekStart: sunday.toISOString().split("T")[0]!,
    weekEnd: thursday.toISOString().split("T")[0]!,
  };
}

export async function runShuttleRenewalJob(): Promise<void> {
  const now = new Date();

  // ── 1. Expire pending_renewal bookings whose deadline has passed ──────────
  const expired = await db
    .update(driverShuttleBookingsTable)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(driverShuttleBookingsTable.status, "pending_renewal"),
        sql`${driverShuttleBookingsTable.renewalDeadline} < ${now.toISOString()}`,
        isNull(driverShuttleBookingsTable.renewalConfirmedAt),
      ),
    )
    .returning({
      id: driverShuttleBookingsTable.id,
      driverId: driverShuttleBookingsTable.driverId,
      routeId: driverShuttleBookingsTable.routeId,
      timeSlotId: driverShuttleBookingsTable.timeSlotId,
    });

  if (expired.length > 0) {
    logger.info({ count: expired.length }, "Expired shuttle renewal windows");

    const driverIds = [...new Set(expired.map((e) => e.driverId))];
    const drivers = await db
      .select({ id: driversTable.id, userId: driversTable.userId })
      .from(driversTable)
      .where(inArray(driversTable.id, driverIds));
    const driverUserMap = new Map(drivers.map((d) => [d.id, d.userId]));

    const io = getIO();
    for (const booking of expired) {
      const userId = driverUserMap.get(booking.driverId);
      if (!userId) continue;

      const [notif] = await db
        .insert(notificationsTable)
        .values({
          userId,
          title: "Route Slot Expired",
          body: "Your priority renewal window closed without confirmation. The route slot is now open to other drivers.",
        })
        .returning();

      if (io && notif) {
        io.to(SOCKET_ROOMS.PASSENGER(userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
          id: String(notif.id),
          category: "shuttle",
          title: notif.title,
          body: notif.body,
          time: notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
        });
      }
    }
  }

  // ── 2. Only run renewal notification logic on Wednesdays ──────────────────
  const utcDay = now.getUTCDay();
  if (utcDay !== 3) return;

  const utcHour = now.getUTCHours();
  if (utcHour < 9 || utcHour >= 10) return;

  // ── 3. Find active bookings for the current week that haven't been notified ─
  const todayStr = now.toISOString().split("T")[0]!;

  const activeBookings = await db
    .select({
      id: driverShuttleBookingsTable.id,
      driverId: driverShuttleBookingsTable.driverId,
      routeId: driverShuttleBookingsTable.routeId,
      timeSlotId: driverShuttleBookingsTable.timeSlotId,
      weekStart: driverShuttleBookingsTable.weekStart,
      weekEnd: driverShuttleBookingsTable.weekEnd,
      driverUserId: driversTable.userId,
      routeName: routesTable.name,
      departureTime: routeTimeSlotsTable.departureTime,
    })
    .from(driverShuttleBookingsTable)
    .innerJoin(driversTable, eq(driverShuttleBookingsTable.driverId, driversTable.id))
    .innerJoin(routesTable, eq(driverShuttleBookingsTable.routeId, routesTable.id))
    .innerJoin(routeTimeSlotsTable, eq(driverShuttleBookingsTable.timeSlotId, routeTimeSlotsTable.id))
    .where(
      and(
        eq(driverShuttleBookingsTable.status, "active"),
        isNull(driverShuttleBookingsTable.renewalNotifiedAt),
        sql`${driverShuttleBookingsTable.weekEnd} >= ${todayStr}`,
      ),
    );

  if (activeBookings.length === 0) return;

  const renewalDeadline = new Date(now.getTime() + RENEWAL_WINDOW_HOURS * 60 * 60 * 1000);
  const io = getIO();

  for (const booking of activeBookings) {
    await db
      .update(driverShuttleBookingsTable)
      .set({
        status: "pending_renewal",
        renewalNotifiedAt: now,
        renewalDeadline,
        updatedAt: now,
      })
      .where(eq(driverShuttleBookingsTable.id, booking.id));

    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId: booking.driverUserId,
        title: "Priority Renewal — Action Required",
        body: `You have priority to rebook route "${booking.routeName}" at ${booking.departureTime} for next week. Confirm by ${renewalDeadline.toUTCString()} or it opens to others.`,
      })
      .returning();

    if (io && notif) {
      io.to(SOCKET_ROOMS.PASSENGER(booking.driverUserId)).emit(
        SOCKET_EVENTS.NOTIFICATION_NEW,
        {
          id: String(notif.id),
          category: "shuttle_renewal",
          title: notif.title,
          body: notif.body,
          bookingId: booking.id,
          deadlineIso: renewalDeadline.toISOString(),
          time: notif.createdAt instanceof Date
            ? notif.createdAt.toISOString()
            : String(notif.createdAt),
        },
      );
    }
  }

  logger.info(
    { count: activeBookings.length, deadlineIso: renewalDeadline.toISOString() },
    "Shuttle renewal notifications sent",
  );
}

let jobTimer: ReturnType<typeof setInterval> | null = null;

export function startShuttleRenewalJob(): void {
  if (jobTimer) return;
  void runShuttleRenewalJob().catch((err) =>
    logger.error({ err }, "Shuttle renewal job failed on startup run"),
  );
  jobTimer = setInterval(() => {
    void runShuttleRenewalJob().catch((err) =>
      logger.error({ err }, "Shuttle renewal job failed"),
    );
  }, JOB_INTERVAL_MS);
  logger.info({ intervalMs: JOB_INTERVAL_MS }, "Shuttle renewal job started");
}
