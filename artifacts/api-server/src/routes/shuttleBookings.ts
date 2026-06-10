import { Router } from "express";
import {
  db,
  driverShuttleBookingsTable,
  routeTimeSlotsTable,
  routesTable,
  driversTable,
  notificationsTable,
  tripsTable,
  VEHICLE_CAPACITY,
  VEHICLE_MIN_THRESHOLD,
} from "@workspace/db";
import { eq, and, inArray, desc, asc, sql, isNotNull, gte, lte, between } from "drizzle-orm";
import { z } from "zod";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
import { logger } from "../lib/logger";

const router = Router();

// ─── Week helpers ─────────────────────────────────────────────────────────────

/**
 * Given any date string "YYYY-MM-DD", returns true if it is a Sunday in UTC.
 */
function isSunday(dateStr: string): boolean {
  return new Date(dateStr + "T00:00:00Z").getUTCDay() === 0;
}

/**
 * Given a Sunday date string, returns the corresponding Thursday (end of work week).
 */
function weekEndFromStart(weekStartStr: string): string {
  const d = new Date(weekStartStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4); // Sunday + 4 = Thursday
  return d.toISOString().split("T")[0]!;
}

/**
 * Extracts the UTC date string "YYYY-MM-DD" from a Date object or ISO string.
 */
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

/**
 * Converts a UTC Date to a Cairo local "HH:MM" string (Africa/Cairo = UTC+2/+3).
 * Trips are stored in UTC; slots are stored as Cairo HH:MM — this bridges the gap.
 */
function toCairoHHMM(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).substring(0, 5); // "HH:MM"
}

/**
 * Given a trip's departureTime (a full timestamp), returns the Sunday that
 * starts the ISO work week it belongs to (Sun–Thu Egyptian work week).
 * e.g. 2026-06-23 (Tuesday) → "2026-06-21" (Sunday)
 *      2026-06-21 (Sunday)  → "2026-06-21"
 */
function tripDateToWeekStart(departureTime: Date): string {
  const day = departureTime.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const offset = day === 0 ? 0 : day; // days since last Sunday
  const sunday = new Date(departureTime);
  sunday.setUTCDate(departureTime.getUTCDate() - offset);
  sunday.setUTCHours(0, 0, 0, 0);
  return toDateStr(sunday);
}

/**
 * Formats a booking row (with joined fields) into the API response shape.
 */
function formatBooking(b: Record<string, unknown>) {
  return {
    id: b.id,
    driverId: b.driverId,
    routeId: b.routeId,
    timeSlotId: b.timeSlotId,
    weekStart: b.weekStart,
    weekEnd: b.weekEnd,
    status: b.status,
    renewalNotifiedAt: b.renewalNotifiedAt ?? null,
    renewalDeadline: b.renewalDeadline ?? null,
    renewalConfirmedAt: b.renewalConfirmedAt ?? null,
    cancelledAt: b.cancelledAt ?? null,
    cancelledBy: b.cancelledBy ?? null,
    cancelReason: b.cancelReason ?? null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    route: b.routeName != null ? {
      id: b.routeId,
      name: b.routeName,
      fromLocation: b.fromLocation,
      toLocation: b.toLocation,
    } : undefined,
    timeSlot: b.departureTime != null ? {
      id: b.timeSlotId,
      departureTime: b.departureTime,
    } : undefined,
    driver: b.driverName != null ? {
      id: b.driverId,
      name: b.driverName,
      phone: b.driverPhone,
    } : undefined,
  };
}

// ─── Shared query fragment ────────────────────────────────────────────────────

const bookingFields = {
  id: driverShuttleBookingsTable.id,
  driverId: driverShuttleBookingsTable.driverId,
  routeId: driverShuttleBookingsTable.routeId,
  timeSlotId: driverShuttleBookingsTable.timeSlotId,
  weekStart: driverShuttleBookingsTable.weekStart,
  weekEnd: driverShuttleBookingsTable.weekEnd,
  status: driverShuttleBookingsTable.status,
  renewalNotifiedAt: driverShuttleBookingsTable.renewalNotifiedAt,
  renewalDeadline: driverShuttleBookingsTable.renewalDeadline,
  renewalConfirmedAt: driverShuttleBookingsTable.renewalConfirmedAt,
  cancelledAt: driverShuttleBookingsTable.cancelledAt,
  cancelledBy: driverShuttleBookingsTable.cancelledBy,
  cancelReason: driverShuttleBookingsTable.cancelReason,
  createdAt: driverShuttleBookingsTable.createdAt,
  updatedAt: driverShuttleBookingsTable.updatedAt,
  routeName: routesTable.name,
  fromLocation: routesTable.fromLocation,
  toLocation: routesTable.toLocation,
  departureTime: routeTimeSlotsTable.departureTime,
  driverName: driversTable.name,
  driverPhone: driversTable.phone,
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEW: GET /shuttle/lines/:routeId/available-weeks
// ═══════════════════════════════════════════════════════════════════════════════
//
// The single endpoint the driver app needs to show the booking sheet.
// Returns ONLY weeks that actually have trips in the DB — no client-side
// week generation allowed. Each week contains its time slots with full
// availability and booking state for the calling driver.
//
// Response shape:
// {
//   routeId: number,
//   routeName: string,
//   weeks: [
//     {
//       weekStart: "YYYY-MM-DD",   // always a Sunday
//       weekEnd:   "YYYY-MM-DD",   // always a Thursday
//       slots: [
//         {
//           id: number,
//           departureTime: "HH:MM",
//           totalSeats: number | null,
//           availableSeats: number | null,
//           isBooked: boolean,   // this driver already has this slot this week
//           isTaken: boolean,    // another driver has this slot this week
//         }
//       ]
//     }
//   ],
//   total: number   // number of weeks returned
// }
//
router.get(
  "/shuttle/lines/:routeId/available-weeks",
  authenticate,
  async (req, res): Promise<void> => {
    const routeId = parseInt(req.params.routeId as string);
    if (isNaN(routeId)) {
      res.status(400).json({ error: "Invalid route ID" });
      return;
    }

    // ── Route existence check ──────────────────────────────────────────────
    const [route] = await db
      .select({ id: routesTable.id, name: routesTable.name })
      .from(routesTable)
      .where(eq(routesTable.id, routeId));
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    // ── Resolve calling driver's internal ID ───────────────────────────────
    const user = req.user!;
    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, user.id));
    const myDriverId = driverRow?.id ?? null;

    // ── Find all future/current trips for this route ───────────────────────
    // We look from today's date forward so we never show expired weeks.
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const upcomingTrips = await db
      .select({
        id: tripsTable.id,
        departureTime: tripsTable.departureTime,
        availableSeats: tripsTable.availableSeats,
        totalSeats: tripsTable.totalSeats,
      })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.routeId, routeId),
          gte(tripsTable.departureTime, todayUtc),
          inArray(tripsTable.status, [
            "scheduled",
            "waiting_driver",
            "driver_assigned",
          ]),
        ),
      )
      .orderBy(asc(tripsTable.departureTime));

    if (upcomingTrips.length === 0) {
      // No trips yet — nothing for the driver to book
      res.json({ routeId, routeName: route.name, weeks: [], total: 0 });
      return;
    }

    // ── Derive distinct weeks from the trips ──────────────────────────────
    // Group trips by the Sunday that starts their work week.
    const weekMap = new Map<
      string,
      { weekStart: string; weekEnd: string; trips: typeof upcomingTrips }
    >();

    for (const trip of upcomingTrips) {
      const ws = tripDateToWeekStart(trip.departureTime);
      if (!weekMap.has(ws)) {
        weekMap.set(ws, {
          weekStart: ws,
          weekEnd: weekEndFromStart(ws),
          trips: [],
        });
      }
      weekMap.get(ws)!.trips.push(trip);
    }

    // ── Fetch all active time slots for this route ─────────────────────────
    const allSlots = await db
      .select({
        id: routeTimeSlotsTable.id,
        departureTime: routeTimeSlotsTable.departureTime,
      })
      .from(routeTimeSlotsTable)
      .where(
        and(
          eq(routeTimeSlotsTable.routeId, routeId),
          eq(routeTimeSlotsTable.isActive, true),
        ),
      )
      .orderBy(asc(routeTimeSlotsTable.departureTime));

    // ── Fetch all driver bookings for these weeks ─────────────────────────
    const weekStarts = [...weekMap.keys()];
    const allBookings =
      weekStarts.length > 0
        ? await db
            .select({
              timeSlotId: driverShuttleBookingsTable.timeSlotId,
              driverId: driverShuttleBookingsTable.driverId,
              weekStart: driverShuttleBookingsTable.weekStart,
            })
            .from(driverShuttleBookingsTable)
            .where(
              and(
                eq(driverShuttleBookingsTable.routeId, routeId),
                inArray(driverShuttleBookingsTable.weekStart, weekStarts),
                inArray(driverShuttleBookingsTable.status, [
                  "active",
                  "pending_renewal",
                ]),
              ),
            )
        : [];

    // bookingKey = "weekStart:timeSlotId" → driverId who booked it
    const bookedByKey = new Map<string, number>(
      allBookings.map((b) => [`${b.weekStart}:${b.timeSlotId}`, b.driverId]),
    );

    // ── Build seat lookup per week per departure-time "HH:MM" ─────────────
    // seatKey = "weekStart:HH:MM" → { totalSeats, availableSeats }
    const seatByKey = new Map<
      string,
      { totalSeats: number; availableSeats: number }
    >();
    for (const trip of upcomingTrips) {
      const ws = tripDateToWeekStart(trip.departureTime);
      // trip.departureTime is a UTC timestamp; convert to Cairo HH:MM so it
      // matches slot.departureTime which is stored as Cairo local time.
      const hhmm = toCairoHHMM(trip.departureTime);
      const key = `${ws}:${hhmm}`;
      const existing = seatByKey.get(key);
      if (!existing) {
        seatByKey.set(key, {
          totalSeats: trip.totalSeats,
          availableSeats: trip.availableSeats,
        });
      } else {
        // Keep the most restrictive (lowest available) across the week
        seatByKey.set(key, {
          totalSeats: existing.totalSeats,
          availableSeats: Math.min(
            existing.availableSeats,
            trip.availableSeats,
          ),
        });
      }
    }

    // ── Build response ─────────────────────────────────────────────────────
    // Sort weeks chronologically
    const sortedWeeks = [...weekMap.values()].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );

    const weeks = sortedWeeks.map(({ weekStart, weekEnd }) => {
      // Only include slots that have actual trips for this week (no ghost slots).
      const slots = allSlots
        .map((slot) => {
          const bookingKey = `${weekStart}:${slot.id}`;
          const bookedDriverId = bookedByKey.get(bookingKey) ?? null;
          const seatKey = `${weekStart}:${slot.departureTime}`;
          const seats = seatByKey.get(seatKey) ?? null;

          return {
            id: slot.id,
            departureTime: slot.departureTime,
            totalSeats: seats?.totalSeats ?? null,
            availableSeats: seats?.availableSeats ?? null,
            isBooked:
              myDriverId !== null && bookedDriverId === myDriverId,
            isTaken:
              bookedDriverId !== null &&
              bookedDriverId !== myDriverId,
            _hasTrip: seats !== null,
          };
        })
        .filter((s) => s._hasTrip)
        .map(({ _hasTrip, ...s }) => s);

      return { weekStart, weekEnd, slots };
    });

    res.json({
      routeId,
      routeName: route.name,
      weeks,
      total: weeks.length,
    });
  },
);

// ─── GET /shuttle/timeslots/:routeId ─────────────────────────────────────────
// Returns all active time slots for a route with week-aware availability.
// Accepts optional ?weekStart=YYYY-MM-DD (must be a Sunday in UTC).
// Defaults to the first upcoming week that has trips if not provided.
router.get(
  "/shuttle/timeslots/:routeId",
  authenticate,
  async (req, res): Promise<void> => {
    const routeId = parseInt(req.params.routeId as string);
    if (isNaN(routeId)) {
      res.status(400).json({ error: "Invalid route ID" });
      return;
    }

    // ── Resolve weekStart ────────────────────────────────────────────────
    let weekStartStr: string;
    const qWeekStart = req.query.weekStart as string | undefined;

    if (qWeekStart) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(qWeekStart)) {
        res
          .status(400)
          .json({ error: "weekStart must be YYYY-MM-DD" });
        return;
      }
      // Validate it is actually a Sunday in UTC
      if (!isSunday(qWeekStart)) {
        res
          .status(400)
          .json({
            error:
              "weekStart must be a Sunday (UTC). Check your timezone handling.",
          });
        return;
      }
      weekStartStr = qWeekStart;
    } else {
      // Default: derive weekStart from the earliest upcoming trip
      const todayUtc = new Date();
      todayUtc.setUTCHours(0, 0, 0, 0);
      const [firstTrip] = await db
        .select({ departureTime: tripsTable.departureTime })
        .from(tripsTable)
        .where(
          and(
            eq(tripsTable.routeId, routeId),
            gte(tripsTable.departureTime, todayUtc),
            inArray(tripsTable.status, [
              "scheduled",
              "waiting_driver",
              "driver_assigned",
            ]),
          ),
        )
        .orderBy(asc(tripsTable.departureTime))
        .limit(1);

      if (!firstTrip) {
        res.json({ routeId, weekStart: null, weekEnd: null, data: [], total: 0 });
        return;
      }
      weekStartStr = tripDateToWeekStart(firstTrip.departureTime);
    }

    const weekEndStr = weekEndFromStart(weekStartStr);
    const weekStartDate = new Date(weekStartStr + "T00:00:00Z");
    const weekEndDate = new Date(weekEndStr + "T23:59:59Z");

    // ── Route existence check ────────────────────────────────────────────
    const [route] = await db
      .select({ id: routesTable.id, name: routesTable.name })
      .from(routesTable)
      .where(eq(routesTable.id, routeId));
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    // ── Resolve calling driver's internal ID ─────────────────────────────
    const user = req.user!;
    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, user.id));
    const myDriverId = driverRow?.id ?? null;

    // ── Run all three queries in parallel ────────────────────────────────
    const [slots, allBookings, weekTrips] = await Promise.all([
      // 1. All active time slots for the route
      db
        .select()
        .from(routeTimeSlotsTable)
        .where(
          and(
            eq(routeTimeSlotsTable.routeId, routeId),
            eq(routeTimeSlotsTable.isActive, true),
          ),
        )
        .orderBy(asc(routeTimeSlotsTable.departureTime)),

      // 2. All driver bookings for this route+week (any driver)
      db
        .select({
          timeSlotId: driverShuttleBookingsTable.timeSlotId,
          driverId: driverShuttleBookingsTable.driverId,
        })
        .from(driverShuttleBookingsTable)
        .where(
          and(
            eq(driverShuttleBookingsTable.routeId, routeId),
            eq(driverShuttleBookingsTable.weekStart, weekStartStr),
            inArray(driverShuttleBookingsTable.status, [
              "active",
              "pending_renewal",
            ]),
          ),
        ),

      // 3. Trips for this route whose departure falls within the week
      db
        .select({
          departureTime: tripsTable.departureTime,
          availableSeats: tripsTable.availableSeats,
          totalSeats: tripsTable.totalSeats,
        })
        .from(tripsTable)
        .where(
          and(
            eq(tripsTable.routeId, routeId),
            gte(tripsTable.departureTime, weekStartDate),
            lte(tripsTable.departureTime, weekEndDate),
            inArray(tripsTable.status, [
              "scheduled",
              "active",
              "waiting_driver",
              "driver_assigned",
            ]),
          ),
        ),
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────
    const bookedBySlot = new Map<number, number>(
      allBookings.map((b) => [b.timeSlotId, b.driverId]),
    );

    // "HH:MM" (Cairo) → { availableSeats, totalSeats }
    // FIX: use toCairoHHMM() — trips are stored in UTC but slots use Cairo local time.
    // Using toISOString().substring(11,16) gave UTC time, causing a mismatch (e.g. "06:00" vs "09:00").
    const seatsByTime = new Map<
      string,
      { availableSeats: number; totalSeats: number }
    >();
    for (const trip of weekTrips) {
      const hhmm = toCairoHHMM(trip.departureTime);
      const existing = seatsByTime.get(hhmm);
      if (!existing) {
        seatsByTime.set(hhmm, {
          availableSeats: trip.availableSeats,
          totalSeats: trip.totalSeats,
        });
      } else {
        seatsByTime.set(hhmm, {
          availableSeats: Math.min(
            existing.availableSeats,
            trip.availableSeats,
          ),
          totalSeats: existing.totalSeats,
        });
      }
    }

    // ── Build response ────────────────────────────────────────────────────
    // Only include slots that have actual trips scheduled for this week.
    // Slots with no matching trip (seats === null) are ghost slots — skip them.
    const data = slots
      .map((s) => {
        const bookedDriverId = bookedBySlot.get(s.id) ?? null;
        const seats = seatsByTime.get(s.departureTime) ?? null;
        return {
          id: s.id,
          departureTime: s.departureTime,
          availableSeats: seats?.availableSeats ?? null,
          totalSeats: seats?.totalSeats ?? null,
          isBooked: myDriverId !== null && bookedDriverId === myDriverId,
          isTaken:
            bookedDriverId !== null && bookedDriverId !== myDriverId,
          _hasTrip: seats !== null,
        };
      })
      .filter((s) => s._hasTrip)
      .map(({ _hasTrip, ...s }) => s);

    res.json({
      routeId,
      routeName: route.name,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      data,
      total: data.length,
    });
  },
);

// ─── POST /shuttle/route-bookings ─────────────────────────────────────────────
// Driver books a route+timeslot for a specific week (Sunday–Thursday).
// The weekStart MUST be a real Sunday in UTC — validated server-side.
// Prevents double-booking via unique DB constraint + explicit pre-check.
const BookRouteBody = z.object({
  routeId: z.number().int().positive(),
  timeSlotId: z.number().int().positive(),
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
});

router.post(
  "/shuttle/route-bookings",
  authenticate,
  async (req, res): Promise<void> => {
    const driver = req.user;
    if (!driver || driver.role !== "driver") {
      res
        .status(403)
        .json({ error: "Only drivers can book shuttle routes" });
      return;
    }

    const parsed = BookRouteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { routeId, timeSlotId, weekStart } = parsed.data;

    // ── Validate weekStart is a real Sunday in UTC ─────────────────────
    if (!isSunday(weekStart)) {
      res.status(400).json({
        error:
          "weekStart must be a Sunday (UTC). Ensure you are sending the date " +
          "derived from the server's available-weeks response, not computed client-side.",
      });
      return;
    }

    const weekEnd = weekEndFromStart(weekStart);
    const weekStartDate = new Date(weekStart + "T00:00:00Z");
    const weekEndDate = new Date(weekEnd + "T23:59:59Z");

    // ── Resolve driver ─────────────────────────────────────────────────
    const [driverRow] = await db
      .select({ id: driversTable.id, assignedBusId: driversTable.assignedBusId })
      .from(driversTable)
      .where(eq(driversTable.userId, driver.id));
    if (!driverRow) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    // ── Validate time slot belongs to this route and is active ─────────
    const [slot] = await db
      .select({
        id: routeTimeSlotsTable.id,
        routeId: routeTimeSlotsTable.routeId,
        departureTime: routeTimeSlotsTable.departureTime,
      })
      .from(routeTimeSlotsTable)
      .where(
        and(
          eq(routeTimeSlotsTable.id, timeSlotId),
          eq(routeTimeSlotsTable.isActive, true),
        ),
      );
    if (!slot) {
      res.status(404).json({ error: "Time slot not found or inactive" });
      return;
    }
    if (slot.routeId !== routeId) {
      res
        .status(400)
        .json({ error: "Time slot does not belong to that route" });
      return;
    }

    // ── Validate ALL 5 working days (Sun–Thu) have trips for this slot ──
    // A driver must commit to the full week; a partial week is not bookable.
    type DowRow = { dow: number };
    const coveredDowsResult = await db.execute<DowRow>(sql`
      SELECT DISTINCT
        EXTRACT(DOW FROM departure_time AT TIME ZONE 'Africa/Cairo')::int AS dow
      FROM trips
      WHERE route_id         = ${routeId}
        AND departure_time  >= ${weekStartDate}
        AND departure_time  <= ${weekEndDate}
        AND status          IN ('scheduled', 'waiting_driver', 'driver_assigned')
        AND to_char(departure_time AT TIME ZONE 'Africa/Cairo', 'HH24:MI') = ${slot.departureTime}
    `);
    const coveredSet = new Set(coveredDowsResult.rows.map((r) => r.dow));
    const WORK_DAYS = [0, 1, 2, 3, 4]; // Sunday=0 … Thursday=4
    const allCovered = WORK_DAYS.every((d) => coveredSet.has(d));
    if (!allCovered) {
      res.status(400).json({
        error: "This slot does not have trips for the full week.",
      });
      return;
    }

    // ── Check for existing booking (pre-check before DB unique constraint) ──
    const [conflict] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        driverId: driverShuttleBookingsTable.driverId,
      })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.routeId, routeId),
          eq(driverShuttleBookingsTable.timeSlotId, timeSlotId),
          eq(driverShuttleBookingsTable.weekStart, weekStart),
          inArray(driverShuttleBookingsTable.status, [
            "active",
            "pending_renewal",
          ]),
        ),
      );
    if (conflict) {
      const msg =
        conflict.driverId === driverRow.id
          ? "You already have an active booking for this route+timeslot this week"
          : "That route+timeslot is already booked for this week";
      res.status(409).json({ error: msg });
      return;
    }

    // ── Insert booking ─────────────────────────────────────────────────
    try {
      const [booking] = await db
        .insert(driverShuttleBookingsTable)
        .values({
          driverId: driverRow.id,
          routeId,
          timeSlotId,
          weekStart,
          weekEnd,
          status: "active",
        })
        .returning();

      // ── Link driver to matching trips for this week ────────────────────
      // Find all trips for this route+week whose Cairo local HH:MM matches
      // the booked time slot, then stamp them with this driver (and their bus).
      const weekStartDate = new Date(weekStart + "T00:00:00Z");
      const weekEndDate   = new Date(weekEnd   + "T23:59:59Z");

      const matchingTrips = await db
        .select({ id: tripsTable.id })
        .from(tripsTable)
        .where(
          and(
            eq(tripsTable.routeId, routeId),
            gte(tripsTable.departureTime, weekStartDate),
            lte(tripsTable.departureTime, weekEndDate),
            sql`to_char(${tripsTable.departureTime} AT TIME ZONE 'Africa/Cairo', 'HH24:MI') = ${slot!.departureTime}`,
            inArray(tripsTable.status, ["scheduled", "waiting_driver"]),
          ),
        );

      if (matchingTrips.length > 0) {
        const tripIds = matchingTrips.map((t) => t.id);
        await db
          .update(tripsTable)
          .set({
            driverId: driverRow.id,
            busId: driverRow.assignedBusId ?? null,
            status: "driver_assigned",
          })
          .where(inArray(tripsTable.id, tripIds));

        logger.info(
          { tripIds, driverId: driverRow.id, busId: driverRow.assignedBusId },
          "Trips linked to driver via shuttle booking",
        );
      }

      logger.info(
        {
          bookingId: booking!.id,
          driverId: driverRow.id,
          routeId,
          timeSlotId,
          weekStart,
        },
        "Driver shuttle booking created",
      );
      res.status(201).json({ ok: true, booking });
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === "23505") {
        res.status(409).json({
          error:
            "That route+timeslot was just booked by another driver. Please refresh and try again.",
        });
        return;
      }
      throw err;
    }
  },
);

// ─── GET /shuttle/route-bookings ──────────────────────────────────────────────
// Driver's own bookings (all time, newest first).
router.get(
  "/shuttle/route-bookings",
  authenticate,
  async (req, res): Promise<void> => {
    const driver = req.user;
    if (!driver || driver.role !== "driver") {
      res
        .status(403)
        .json({ error: "Only drivers can view shuttle route bookings" });
      return;
    }

    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, driver.id));
    if (!driverRow) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const bookings = await db
      .select(bookingFields)
      .from(driverShuttleBookingsTable)
      .innerJoin(
        routesTable,
        eq(driverShuttleBookingsTable.routeId, routesTable.id),
      )
      .innerJoin(
        routeTimeSlotsTable,
        eq(
          driverShuttleBookingsTable.timeSlotId,
          routeTimeSlotsTable.id,
        ),
      )
      .innerJoin(
        driversTable,
        eq(driverShuttleBookingsTable.driverId, driversTable.id),
      )
      .where(eq(driverShuttleBookingsTable.driverId, driverRow.id))
      .orderBy(desc(driverShuttleBookingsTable.weekStart));

    res.json({ data: bookings.map(formatBooking), total: bookings.length });
  },
);

// ─── GET /shuttle/route-bookings/:id ─────────────────────────────────────────
router.get(
  "/shuttle/route-bookings/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const driver = req.user;
    if (!driver || driver.role !== "driver") {
      res
        .status(403)
        .json({ error: "Only drivers can view shuttle route bookings" });
      return;
    }

    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, driver.id));
    if (!driverRow) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [booking] = await db
      .select(bookingFields)
      .from(driverShuttleBookingsTable)
      .innerJoin(
        routesTable,
        eq(driverShuttleBookingsTable.routeId, routesTable.id),
      )
      .innerJoin(
        routeTimeSlotsTable,
        eq(
          driverShuttleBookingsTable.timeSlotId,
          routeTimeSlotsTable.id,
        ),
      )
      .innerJoin(
        driversTable,
        eq(driverShuttleBookingsTable.driverId, driversTable.id),
      )
      .where(
        and(
          eq(driverShuttleBookingsTable.id, bookingId),
          eq(driverShuttleBookingsTable.driverId, driverRow.id),
        ),
      );

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json({ data: formatBooking(booking as Record<string, unknown>) });
  },
);

// ─── DELETE /shuttle/route-bookings/:id ──────────────────────────────────────
// Driver cancels their own active booking.
router.delete(
  "/shuttle/route-bookings/:id",
  authenticate,
  async (req, res): Promise<void> => {
    const driver = req.user;
    if (!driver || driver.role !== "driver") {
      res
        .status(403)
        .json({ error: "Only drivers can cancel shuttle route bookings" });
      return;
    }

    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, driver.id));
    if (!driverRow) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [existing] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        status: driverShuttleBookingsTable.status,
        routeId: driverShuttleBookingsTable.routeId,
        timeSlotId: driverShuttleBookingsTable.timeSlotId,
        weekStart: driverShuttleBookingsTable.weekStart,
        weekEnd: driverShuttleBookingsTable.weekEnd,
      })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.id, bookingId),
          eq(driverShuttleBookingsTable.driverId, driverRow.id),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (!["active", "pending_renewal"].includes(existing.status)) {
      res.status(400).json({
        error: `Cannot cancel a booking with status '${existing.status}'`,
      });
      return;
    }

    const [updated] = await db
      .update(driverShuttleBookingsTable)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: "driver",
      })
      .where(eq(driverShuttleBookingsTable.id, bookingId))
      .returning();

    // ── Unlink driver from trips for this booking's week ───────────────
    const [cancelSlot] = await db
      .select({ departureTime: routeTimeSlotsTable.departureTime })
      .from(routeTimeSlotsTable)
      .where(eq(routeTimeSlotsTable.id, existing.timeSlotId));

    if (cancelSlot) {
      const wStart = new Date(existing.weekStart + "T00:00:00Z");
      const wEnd   = new Date(existing.weekEnd   + "T23:59:59Z");
      const tripsToUnlink = await db
        .select({ id: tripsTable.id })
        .from(tripsTable)
        .where(
          and(
            eq(tripsTable.routeId, existing.routeId),
            eq(tripsTable.driverId, driverRow.id),
            gte(tripsTable.departureTime, wStart),
            lte(tripsTable.departureTime, wEnd),
            sql`to_char(${tripsTable.departureTime} AT TIME ZONE 'Africa/Cairo', 'HH24:MI') = ${cancelSlot.departureTime}`,
            inArray(tripsTable.status, ["driver_assigned", "scheduled", "waiting_driver"]),
          ),
        );
      if (tripsToUnlink.length > 0) {
        await db
          .update(tripsTable)
          .set({ driverId: null, busId: null, status: "waiting_driver" })
          .where(inArray(tripsTable.id, tripsToUnlink.map((t) => t.id)));
      }
    }

    res.json({ ok: true, booking: updated });
  },
);

// ─── POST /shuttle/route-bookings/:id/confirm-renewal ─────────────────────────
// Driver confirms priority renewal — creates a booking for the next week.
router.post(
  "/shuttle/route-bookings/:id/confirm-renewal",
  authenticate,
  async (req, res): Promise<void> => {
    const driver = req.user;
    if (!driver || driver.role !== "driver") {
      res
        .status(403)
        .json({ error: "Only drivers can confirm shuttle renewals" });
      return;
    }

    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const [driverRow] = await db
      .select({ id: driversTable.id, assignedBusId: driversTable.assignedBusId })
      .from(driversTable)
      .where(eq(driversTable.userId, driver.id));
    if (!driverRow) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [booking] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        driverId: driverShuttleBookingsTable.driverId,
        routeId: driverShuttleBookingsTable.routeId,
        timeSlotId: driverShuttleBookingsTable.timeSlotId,
        weekStart: driverShuttleBookingsTable.weekStart,
        status: driverShuttleBookingsTable.status,
        renewalDeadline: driverShuttleBookingsTable.renewalDeadline,
        renewalConfirmedAt:
          driverShuttleBookingsTable.renewalConfirmedAt,
      })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.id, bookingId),
          eq(driverShuttleBookingsTable.driverId, driverRow.id),
        ),
      );

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.status !== "pending_renewal") {
      res.status(400).json({
        error: `Cannot confirm renewal for booking with status '${booking.status}'`,
      });
      return;
    }
    if (booking.renewalConfirmedAt) {
      res.status(400).json({ error: "Renewal already confirmed" });
      return;
    }

    const now = new Date();
    if (
      booking.renewalDeadline &&
      new Date(booking.renewalDeadline) < now
    ) {
      res.status(400).json({
        error:
          "Renewal window has expired — slot is now open to others",
      });
      return;
    }

    // ── Derive next week start from the current booking's weekStart ───
    // Next week = current weekStart + 7 days (still a Sunday)
    const currentWeekStartDate = new Date(
      booking.weekStart + "T00:00:00Z",
    );
    const nextWeekStartDate = new Date(currentWeekStartDate);
    nextWeekStartDate.setUTCDate(currentWeekStartDate.getUTCDate() + 7);
    const nextWeekStartStr = toDateStr(nextWeekStartDate);
    const nextWeekEndStr = weekEndFromStart(nextWeekStartStr);

    // ── Validate next week has trips for this route ───────────────────
    const nextWeekEndDate = new Date(nextWeekEndStr + "T23:59:59Z");
    const [nextTripExists] = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.routeId, booking.routeId),
          gte(tripsTable.departureTime, nextWeekStartDate),
          lte(tripsTable.departureTime, nextWeekEndDate),
          inArray(tripsTable.status, [
            "scheduled",
            "waiting_driver",
            "driver_assigned",
          ]),
        ),
      )
      .limit(1);

    if (!nextTripExists) {
      res.status(400).json({
        error:
          "No trips are scheduled for next week on this route yet. " +
          "Renewal will be available once the admin schedules next week's trips.",
      });
      return;
    }

    // ── Check no conflict for next week ───────────────────────────────
    const [slotConflict] = await db
      .select({ id: driverShuttleBookingsTable.id })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.routeId, booking.routeId),
          eq(
            driverShuttleBookingsTable.timeSlotId,
            booking.timeSlotId,
          ),
          eq(
            driverShuttleBookingsTable.weekStart,
            nextWeekStartStr,
          ),
          inArray(driverShuttleBookingsTable.status, [
            "active",
            "pending_renewal",
          ]),
        ),
      );
    if (slotConflict) {
      res
        .status(409)
        .json({ error: "That slot is already booked for next week" });
      return;
    }

    // ── Confirm renewal + create next-week booking + link trips — single tx ──
    let renewalResult: {
      updated: typeof driverShuttleBookingsTable.$inferSelect;
      newBooking: typeof driverShuttleBookingsTable.$inferSelect;
    };
    try {
      renewalResult = await db.transaction(async (tx) => {
        // Fetch slot departure time first; throw so the transaction rolls back
        // if the slot row is missing (prevents orphaned booking with no trips).
        const [renewalSlot] = await tx
          .select({ departureTime: routeTimeSlotsTable.departureTime })
          .from(routeTimeSlotsTable)
          .where(eq(routeTimeSlotsTable.id, booking.timeSlotId));

        if (!renewalSlot) {
          throw new Error("SLOT_MISSING");
        }

        const [updated] = await tx
          .update(driverShuttleBookingsTable)
          .set({ renewalConfirmedAt: now, status: "active", updatedAt: now })
          .where(eq(driverShuttleBookingsTable.id, bookingId))
          .returning();

        const [nextBooking] = await tx
          .insert(driverShuttleBookingsTable)
          .values({
            driverId: driverRow.id,
            routeId: booking.routeId,
            timeSlotId: booking.timeSlotId,
            weekStart: nextWeekStartStr,
            weekEnd: nextWeekEndStr,
            status: "active",
          })
          .returning();

        const nwStart = new Date(nextWeekStartStr + "T00:00:00Z");
        const nwEnd   = new Date(nextWeekEndStr   + "T23:59:59Z");
        const renewalTrips = await tx
          .select({ id: tripsTable.id })
          .from(tripsTable)
          .where(
            and(
              eq(tripsTable.routeId, booking.routeId),
              gte(tripsTable.departureTime, nwStart),
              lte(tripsTable.departureTime, nwEnd),
              sql`to_char(${tripsTable.departureTime} AT TIME ZONE 'Africa/Cairo', 'HH24:MI') = ${renewalSlot.departureTime}`,
              inArray(tripsTable.status, ["scheduled", "waiting_driver"]),
            ),
          );

        if (renewalTrips.length > 0) {
          await tx
            .update(tripsTable)
            .set({
              driverId: driverRow.id,
              busId: driverRow.assignedBusId ?? null,
              status: "driver_assigned",
            })
            .where(inArray(tripsTable.id, renewalTrips.map((t) => t.id)));
        }

        return { updated: updated!, newBooking: nextBooking! };
      });
    } catch (err) {
      if (err instanceof Error && err.message === "SLOT_MISSING") {
        res.status(400).json({
          error:
            "Time slot record not found — cannot link trips. Renewal aborted.",
        });
        return;
      }
      throw err;
    }

    res.json({
      ok: true,
      currentBooking: renewalResult.updated,
      nextWeekBooking: renewalResult.newBooking,
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /admin/shuttle/bookings ──────────────────────────────────────────────
router.get(
  "/admin/shuttle/bookings",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(
      1,
      parseInt((req.query.page as string) ?? "1") || 1,
    );
    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt((req.query.limit as string) ?? "50") || 50,
      ),
    );
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.week) {
      conditions.push(
        eq(
          driverShuttleBookingsTable.weekStart,
          req.query.week as string,
        ),
      );
    }
    if (req.query.routeId) {
      const rid = parseInt(req.query.routeId as string);
      if (!isNaN(rid))
        conditions.push(
          eq(driverShuttleBookingsTable.routeId, rid),
        );
    }
    if (req.query.driverId) {
      const did = parseInt(req.query.driverId as string);
      if (!isNaN(did))
        conditions.push(
          eq(driverShuttleBookingsTable.driverId, did),
        );
    }
    if (req.query.status) {
      conditions.push(
        eq(
          driverShuttleBookingsTable.status,
          req.query.status as
            | "active"
            | "cancelled"
            | "pending_renewal"
            | "expired",
        ),
      );
    }

    const where =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [bookings, countResult] = await Promise.all([
      db
        .select(bookingFields)
        .from(driverShuttleBookingsTable)
        .innerJoin(
          routesTable,
          eq(driverShuttleBookingsTable.routeId, routesTable.id),
        )
        .innerJoin(
          routeTimeSlotsTable,
          eq(
            driverShuttleBookingsTable.timeSlotId,
            routeTimeSlotsTable.id,
          ),
        )
        .innerJoin(
          driversTable,
          eq(
            driverShuttleBookingsTable.driverId,
            driversTable.id,
          ),
        )
        .where(where)
        .orderBy(
          desc(driverShuttleBookingsTable.weekStart),
          asc(driverShuttleBookingsTable.routeId),
        )
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(driverShuttleBookingsTable)
        .where(where),
    ]);

    res.json({
      data: bookings.map(formatBooking),
      total: countResult[0]!.count,
      page,
      limit,
    });
  },
);

// ─── GET /admin/shuttle/bookings/:id ─────────────────────────────────────────
router.get(
  "/admin/shuttle/bookings/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const [booking] = await db
      .select(bookingFields)
      .from(driverShuttleBookingsTable)
      .innerJoin(
        routesTable,
        eq(driverShuttleBookingsTable.routeId, routesTable.id),
      )
      .innerJoin(
        routeTimeSlotsTable,
        eq(
          driverShuttleBookingsTable.timeSlotId,
          routeTimeSlotsTable.id,
        ),
      )
      .innerJoin(
        driversTable,
        eq(driverShuttleBookingsTable.driverId, driversTable.id),
      )
      .where(eq(driverShuttleBookingsTable.id, bookingId));

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json({
      data: formatBooking(booking as Record<string, unknown>),
    });
  },
);

// ─── PATCH /admin/shuttle/bookings/:id/reassign ───────────────────────────────
const ReassignBody = z.object({ driverId: z.number().int().positive() });

router.patch(
  "/admin/shuttle/bookings/:id/reassign",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const parsed = ReassignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { driverId } = parsed.data;

    const [existing] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        status: driverShuttleBookingsTable.status,
        driverId: driverShuttleBookingsTable.driverId,
        routeId: driverShuttleBookingsTable.routeId,
        weekStart: driverShuttleBookingsTable.weekStart,
        weekEnd: driverShuttleBookingsTable.weekEnd,
        routeName: routesTable.name,
        departureTime: routeTimeSlotsTable.departureTime,
      })
      .from(driverShuttleBookingsTable)
      .innerJoin(
        routesTable,
        eq(driverShuttleBookingsTable.routeId, routesTable.id),
      )
      .innerJoin(
        routeTimeSlotsTable,
        eq(
          driverShuttleBookingsTable.timeSlotId,
          routeTimeSlotsTable.id,
        ),
      )
      .where(eq(driverShuttleBookingsTable.id, bookingId));
    if (!existing) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const [newDriverRow] = await db
      .select({
        id: driversTable.id,
        userId: driversTable.userId,
        name: driversTable.name,
        assignedBusId: driversTable.assignedBusId,
      })
      .from(driversTable)
      .where(
        and(
          eq(driversTable.id, driverId),
          eq(driversTable.isActive, true),
        ),
      );
    if (!newDriverRow) {
      res
        .status(404)
        .json({ error: "Target driver not found or inactive" });
      return;
    }

    const [updated] = await db
      .update(driverShuttleBookingsTable)
      .set({
        driverId,
        status: "active",
        renewalNotifiedAt: null,
        renewalDeadline: null,
        renewalConfirmedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(driverShuttleBookingsTable.id, bookingId))
      .returning();

    // ── Sync trips: reassign to new driver ────────────────────────────
    const weekStartDate = new Date(existing.weekStart + "T00:00:00Z");
    const weekEndDate   = new Date(existing.weekEnd   + "T23:59:59Z");
    const reassignTrips = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.routeId, existing.routeId),
          gte(tripsTable.departureTime, weekStartDate),
          lte(tripsTable.departureTime, weekEndDate),
          sql`to_char(${tripsTable.departureTime} AT TIME ZONE 'Africa/Cairo', 'HH24:MI') = ${existing.departureTime}`,
          inArray(tripsTable.status, [
            "scheduled",
            "waiting_driver",
            "driver_assigned",
          ]),
        ),
      );
    if (reassignTrips.length > 0) {
      const newBusId = newDriverRow.assignedBusId ?? null;
      await db
        .update(tripsTable)
        .set({
          driverId: newDriverRow.id,
          busId: newBusId,
          status: newBusId ? "driver_assigned" : "waiting_driver",
        })
        .where(
          inArray(tripsTable.id, reassignTrips.map((t) => t.id)),
        );
    }

    const io = getIO();
    if (existing.driverId !== driverId) {
      const [oldDriverRow] = await db
        .select({ userId: driversTable.userId })
        .from(driversTable)
        .where(eq(driversTable.id, existing.driverId));

      if (oldDriverRow) {
        const [oldNotif] = await db
          .insert(notificationsTable)
          .values({
            userId: oldDriverRow.userId,
            title: "Route Booking Reassigned",
            body: `Your booking for route "${existing.routeName}" at ${existing.departureTime} (week of ${existing.weekStart}) has been reassigned to another driver by an administrator.`,
          })
          .returning();
        if (io && oldNotif) {
          io.to(
            SOCKET_ROOMS.PASSENGER(oldDriverRow.userId),
          ).emit(SOCKET_EVENTS.SHUTTLE_BOOKING_REASSIGNED, {
            bookingId,
            role: "removed",
            routeName: existing.routeName,
            departureTime: existing.departureTime,
            weekStart: existing.weekStart,
          });
          io.to(
            SOCKET_ROOMS.PASSENGER(oldDriverRow.userId),
          ).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
            id: String(oldNotif.id),
            category: "shuttle",
            title: oldNotif.title,
            body: oldNotif.body,
            time:
              oldNotif.createdAt instanceof Date
                ? oldNotif.createdAt.toISOString()
                : String(oldNotif.createdAt),
          });
        }
      }
    }

    const [newNotif] = await db
      .insert(notificationsTable)
      .values({
        userId: newDriverRow.userId,
        title: "Route Booking Assigned",
        body: `You have been assigned to route "${existing.routeName}" at ${existing.departureTime} for the week of ${existing.weekStart}.`,
      })
      .returning();
    if (io && newNotif) {
      io.to(SOCKET_ROOMS.PASSENGER(newDriverRow.userId)).emit(
        SOCKET_EVENTS.SHUTTLE_BOOKING_REASSIGNED,
        {
          bookingId,
          role: "assigned",
          routeName: existing.routeName,
          departureTime: existing.departureTime,
          weekStart: existing.weekStart,
        },
      );
      io.to(SOCKET_ROOMS.PASSENGER(newDriverRow.userId)).emit(
        SOCKET_EVENTS.NOTIFICATION_NEW,
        {
          id: String(newNotif.id),
          category: "shuttle",
          title: newNotif.title,
          body: newNotif.body,
          time:
            newNotif.createdAt instanceof Date
              ? newNotif.createdAt.toISOString()
              : String(newNotif.createdAt),
        },
      );
    }

    res.json({ ok: true, booking: updated });
  },
);

// ─── PATCH /admin/shuttle/bookings/:id/cancel ────────────────────────────────
const CancelBody = z.object({ reason: z.string().optional() });

router.patch(
  "/admin/shuttle/bookings/:id/cancel",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const parsed = CancelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        status: driverShuttleBookingsTable.status,
        driverId: driverShuttleBookingsTable.driverId,
        routeId: driverShuttleBookingsTable.routeId,
        weekStart: driverShuttleBookingsTable.weekStart,
        weekEnd: driverShuttleBookingsTable.weekEnd,
      })
      .from(driverShuttleBookingsTable)
      .where(eq(driverShuttleBookingsTable.id, bookingId));
    if (!existing) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (existing.status === "cancelled") {
      res
        .status(400)
        .json({ error: "Booking is already cancelled" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(driverShuttleBookingsTable)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: "admin",
        cancelReason: parsed.data.reason ?? null,
        updatedAt: now,
      })
      .where(eq(driverShuttleBookingsTable.id, bookingId))
      .returning();

    // ── Sync trips: clear driver assignment ───────────────────────────
    const cancelWeekStart = new Date(existing.weekStart + "T00:00:00Z");
    const cancelWeekEnd   = new Date(existing.weekEnd   + "T23:59:59Z");
    await db
      .update(tripsTable)
      .set({
        driverId: null,
        busId: null,
        status: "waiting_driver",
      })
      .where(
        and(
          eq(tripsTable.routeId, existing.routeId),
          eq(tripsTable.driverId, existing.driverId),
          gte(tripsTable.departureTime, cancelWeekStart),
          lte(tripsTable.departureTime, cancelWeekEnd),
          inArray(tripsTable.status, [
            "waiting_driver",
            "driver_assigned",
          ]),
        ),
      );

    const [driver] = await db
      .select({ userId: driversTable.userId })
      .from(driversTable)
      .where(eq(driversTable.id, existing.driverId));

    if (driver) {
      const [notif] = await db
        .insert(notificationsTable)
        .values({
          userId: driver.userId,
          title: "Route Booking Cancelled",
          body: parsed.data.reason
            ? `Your shuttle booking was cancelled by admin: ${parsed.data.reason}`
            : "Your shuttle booking has been cancelled by an administrator.",
        })
        .returning();
      const io = getIO();
      if (io && notif) {
        io.to(SOCKET_ROOMS.PASSENGER(driver.userId)).emit(
          SOCKET_EVENTS.NOTIFICATION_NEW,
          {
            id: String(notif.id),
            category: "shuttle",
            title: notif.title,
            body: notif.body,
            time:
              notif.createdAt instanceof Date
                ? notif.createdAt.toISOString()
                : String(notif.createdAt),
          },
        );
      }
    }

    res.json({ ok: true, booking: updated });
  },
);

// ─── PATCH /admin/shuttle/bookings/:id/extend-window ─────────────────────────
const ExtendWindowBody = z.object({
  hours: z.number().int().min(1).max(72),
});

router.patch(
  "/admin/shuttle/bookings/:id/extend-window",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const parsed = ExtendWindowBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        status: driverShuttleBookingsTable.status,
        renewalDeadline: driverShuttleBookingsTable.renewalDeadline,
        driverId: driverShuttleBookingsTable.driverId,
      })
      .from(driverShuttleBookingsTable)
      .where(eq(driverShuttleBookingsTable.id, bookingId));
    if (!existing) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (existing.status !== "pending_renewal") {
      res.status(400).json({
        error: `Cannot extend window for booking with status '${existing.status}'`,
      });
      return;
    }

    const base = existing.renewalDeadline
      ? new Date(existing.renewalDeadline)
      : new Date();
    const newDeadline = new Date(
      base.getTime() + parsed.data.hours * 60 * 60 * 1000,
    );

    const [updated] = await db
      .update(driverShuttleBookingsTable)
      .set({ renewalDeadline: newDeadline, updatedAt: new Date() })
      .where(eq(driverShuttleBookingsTable.id, bookingId))
      .returning();

    const [driver] = await db
      .select({ userId: driversTable.userId })
      .from(driversTable)
      .where(eq(driversTable.id, existing.driverId));

    if (driver) {
      const [notif] = await db
        .insert(notificationsTable)
        .values({
          userId: driver.userId,
          title: "Renewal Window Extended",
          body: `Your priority renewal window has been extended. New deadline: ${newDeadline.toUTCString()}`,
        })
        .returning();
      const io = getIO();
      if (io && notif) {
        io.to(SOCKET_ROOMS.PASSENGER(driver.userId)).emit(
          SOCKET_EVENTS.NOTIFICATION_NEW,
          {
            id: String(notif.id),
            category: "shuttle_renewal",
            title: notif.title,
            body: notif.body,
            bookingId,
            deadlineIso: newDeadline.toISOString(),
            time:
              notif.createdAt instanceof Date
                ? notif.createdAt.toISOString()
                : String(notif.createdAt),
          },
        );
      }
    }

    res.json({ ok: true, booking: updated });
  },
);

// ─── GET /admin/shuttle/availability ─────────────────────────────────────────
router.get(
  "/admin/shuttle/availability",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    let weekStart: string;
    if (req.query.week) {
      weekStart = req.query.week as string;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        res.status(400).json({ error: "week must be YYYY-MM-DD" });
        return;
      }
    } else {
      // Default to the next Sunday from today (UTC)
      const now = new Date();
      const day = now.getUTCDay();
      const daysToAdd = day === 0 ? 7 : 7 - day;
      const sunday = new Date(now);
      sunday.setUTCDate(sunday.getUTCDate() + daysToAdd);
      sunday.setUTCHours(0, 0, 0, 0);
      weekStart = sunday.toISOString().split("T")[0]!;
    }

    const [routes, slots, bookings] = await Promise.all([
      db
        .select({
          id: routesTable.id,
          name: routesTable.name,
          fromLocation: routesTable.fromLocation,
          toLocation: routesTable.toLocation,
        })
        .from(routesTable)
        .where(eq(routesTable.isActive, true))
        .orderBy(asc(routesTable.name)),

      db
        .select({
          id: routeTimeSlotsTable.id,
          routeId: routeTimeSlotsTable.routeId,
          departureTime: routeTimeSlotsTable.departureTime,
          isActive: routeTimeSlotsTable.isActive,
        })
        .from(routeTimeSlotsTable)
        .orderBy(
          asc(routeTimeSlotsTable.routeId),
          asc(routeTimeSlotsTable.departureTime),
        ),

      db
        .select({
          id: driverShuttleBookingsTable.id,
          routeId: driverShuttleBookingsTable.routeId,
          timeSlotId: driverShuttleBookingsTable.timeSlotId,
          status: driverShuttleBookingsTable.status,
          driverId: driverShuttleBookingsTable.driverId,
          driverName: driversTable.name,
          driverPhone: driversTable.phone,
          renewalDeadline: driverShuttleBookingsTable.renewalDeadline,
          renewalNotifiedAt:
            driverShuttleBookingsTable.renewalNotifiedAt,
        })
        .from(driverShuttleBookingsTable)
        .innerJoin(
          driversTable,
          eq(driverShuttleBookingsTable.driverId, driversTable.id),
        )
        .where(
          and(
            eq(driverShuttleBookingsTable.weekStart, weekStart),
            inArray(driverShuttleBookingsTable.status, [
              "active",
              "pending_renewal",
            ]),
          ),
        ),
    ]);

    const bookingMap = new Map(
      bookings.map((b) => [`${b.routeId}:${b.timeSlotId}`, b]),
    );

    const slotsByRoute = new Map<number, typeof slots>();
    for (const s of slots) {
      const list = slotsByRoute.get(s.routeId) ?? [];
      list.push(s);
      slotsByRoute.set(s.routeId, list);
    }

    const data = routes.map((r) => {
      const routeSlots = (slotsByRoute.get(r.id) ?? []).map((s) => {
        const booking = bookingMap.get(`${r.id}:${s.id}`);
        return {
          slotId: s.id,
          departureTime: s.departureTime,
          isActive: s.isActive,
          isBooked: !!booking,
          booking: booking
            ? {
                id: booking.id,
                driverId: booking.driverId,
                driverName: booking.driverName,
                driverPhone: booking.driverPhone,
                status: booking.status,
                renewalNotifiedAt: booking.renewalNotifiedAt ?? null,
                renewalDeadline: booking.renewalDeadline ?? null,
              }
            : null,
        };
      });
      const totalSlots = routeSlots.filter((s) => s.isActive).length;
      const bookedSlots = routeSlots.filter((s) => s.isBooked).length;
      return {
        routeId: r.id,
        routeName: r.name,
        fromLocation: r.fromLocation,
        toLocation: r.toLocation,
        weekStart,
        totalSlots,
        bookedSlots,
        availableSlots: totalSlots - bookedSlots,
        slots: routeSlots,
      };
    });

    res.json({ weekStart, data, total: data.length });
  },
);

// ─── GET /admin/shuttle/renewal-history ──────────────────────────────────────
router.get(
  "/admin/shuttle/renewal-history",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(
      1,
      parseInt((req.query.page as string) ?? "1") || 1,
    );
    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt((req.query.limit as string) ?? "50") || 50,
      ),
    );
    const offset = (page - 1) * limit;

    const [bookings, countResult] = await Promise.all([
      db
        .select(bookingFields)
        .from(driverShuttleBookingsTable)
        .innerJoin(
          routesTable,
          eq(driverShuttleBookingsTable.routeId, routesTable.id),
        )
        .innerJoin(
          routeTimeSlotsTable,
          eq(
            driverShuttleBookingsTable.timeSlotId,
            routeTimeSlotsTable.id,
          ),
        )
        .innerJoin(
          driversTable,
          eq(
            driverShuttleBookingsTable.driverId,
            driversTable.id,
          ),
        )
        .where(isNotNull(driverShuttleBookingsTable.renewalNotifiedAt))
        .orderBy(desc(driverShuttleBookingsTable.renewalNotifiedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(driverShuttleBookingsTable)
        .where(
          isNotNull(driverShuttleBookingsTable.renewalNotifiedAt),
        ),
    ]);

    res.json({
      data: bookings.map(formatBooking),
      total: countResult[0]!.count,
      page,
      limit,
    });
  },
);

// ─── Admin: Time Slot Management ─────────────────────────────────────────────

router.get(
  "/admin/shuttle/timeslots",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.routeId) {
      const rid = parseInt(req.query.routeId as string);
      if (!isNaN(rid))
        conditions.push(eq(routeTimeSlotsTable.routeId, rid));
    }

    const slots = await db
      .select({
        id: routeTimeSlotsTable.id,
        routeId: routeTimeSlotsTable.routeId,
        departureTime: routeTimeSlotsTable.departureTime,
        isActive: routeTimeSlotsTable.isActive,
        createdAt: routeTimeSlotsTable.createdAt,
        routeName: routesTable.name,
        fromLocation: routesTable.fromLocation,
        toLocation: routesTable.toLocation,
      })
      .from(routeTimeSlotsTable)
      .innerJoin(
        routesTable,
        eq(routeTimeSlotsTable.routeId, routesTable.id),
      )
      .where(
        conditions.length > 0 ? and(...conditions) : undefined,
      )
      .orderBy(
        asc(routeTimeSlotsTable.routeId),
        asc(routeTimeSlotsTable.departureTime),
      );

    res.json({ data: slots, total: slots.length });
  },
);

const CreateSlotBody = z.object({
  routeId: z.number().int().positive(),
  departureTime: z
    .string()
    .regex(
      /^\d{2}:\d{2}$/,
      "departureTime must be HH:MM (e.g. 08:00)",
    ),
  isActive: z.boolean().optional().default(true),
});

router.post(
  "/admin/shuttle/timeslots",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateSlotBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [route] = await db
      .select({ id: routesTable.id })
      .from(routesTable)
      .where(eq(routesTable.id, parsed.data.routeId));
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    try {
      const [slot] = await db
        .insert(routeTimeSlotsTable)
        .values(parsed.data)
        .returning();
      res.status(201).json({ ok: true, slot });
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === "23505") {
        res.status(409).json({
          error:
            "A time slot with that departure time already exists for this route",
        });
        return;
      }
      throw err;
    }
  },
);

const UpdateSlotBody = z.object({
  departureTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/admin/shuttle/timeslots/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const slotId = parseInt(req.params.id as string);
    if (isNaN(slotId)) {
      res.status(400).json({ error: "Invalid slot ID" });
      return;
    }

    const parsed = UpdateSlotBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(routeTimeSlotsTable)
      .set(parsed.data)
      .where(eq(routeTimeSlotsTable.id, slotId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Time slot not found" });
      return;
    }
    res.json({ ok: true, slot: updated });
  },
);

router.delete(
  "/admin/shuttle/timeslots/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const slotId = parseInt(req.params.id as string);
    if (isNaN(slotId)) {
      res.status(400).json({ error: "Invalid slot ID" });
      return;
    }

    const [activeBookings] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.timeSlotId, slotId),
          inArray(driverShuttleBookingsTable.status, [
            "active",
            "pending_renewal",
          ]),
        ),
      );

    if (activeBookings && activeBookings.count > 0) {
      res.status(409).json({
        error: `Cannot delete: ${activeBookings.count} active booking(s) reference this slot. Cancel them first or deactivate instead (PATCH isActive: false).`,
      });
      return;
    }

    const [deleted] = await db
      .delete(routeTimeSlotsTable)
      .where(eq(routeTimeSlotsTable.id, slotId))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Time slot not found" });
      return;
    }
    res.json({ ok: true, deleted });
  },
);

// ─── GET /shuttle/available-slots ─────────────────────────────────────────────
// Driver-only endpoint. Returns time slots for a given route and week that:
//   1. Have trips on ALL 5 working days (Sunday–Thursday)
//   2. Are NOT already booked by another driver for that week
//   3. Have only bookable trip statuses (scheduled, waiting_driver, driver_assigned)
//
// Query params:
//   routeId   — integer, required
//   weekStart — "YYYY-MM-DD" Sunday (Cairo), required
//
// Response:
// {
//   routeId:   number,
//   weekStart: "YYYY-MM-DD",
//   weekEnd:   "YYYY-MM-DD",
//   slots: [
//     {
//       id:            number,
//       departureTime: "HH:MM",
//       totalSeats:    number,
//       minRequired:   number,
//       days: [
//         { tripId: number, date: "YYYY-MM-DD", dayOfWeek: string, availableSeats: number }
//       ]
//     }
//   ]
// }

const DOW_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
};

router.get(
  "/shuttle/available-slots",
  authenticate,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    // ── Parse & validate query params ───────────────────────────────────────
    const rawRouteId = req.query.routeId as string | undefined;
    const rawWeekStart = req.query.weekStart as string | undefined;

    if (!rawRouteId || !rawWeekStart) {
      res.status(400).json({ error: "routeId and weekStart are required query parameters" });
      return;
    }

    const routeId = parseInt(rawRouteId, 10);
    if (isNaN(routeId)) {
      res.status(400).json({ error: "routeId must be a valid integer" });
      return;
    }

    // Validate weekStart is a parseable ISO date
    const weekStartDate = new Date(rawWeekStart + "T00:00:00Z");
    if (isNaN(weekStartDate.getTime())) {
      res.status(400).json({ error: "weekStart is not a valid ISO date (expected YYYY-MM-DD)" });
      return;
    }

    // Validate weekStart falls on a Sunday (reuse shared helper — same Cairo logic as POST booking)
    if (!isSunday(rawWeekStart)) {
      res.status(400).json({
        error: "weekStart must be a Sunday in Cairo time. Use the date derived from the server's available-weeks response.",
      });
      return;
    }

    const weekStart = rawWeekStart;
    const weekEnd = weekEndFromStart(weekStart);
    const weekEndDate = new Date(weekEnd + "T23:59:59Z");

    // ── Route existence check ───────────────────────────────────────────────
    const [route] = await db
      .select({ id: routesTable.id, name: routesTable.name })
      .from(routesTable)
      .where(eq(routesTable.id, routeId));
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    // ── Fetch all active time slots for this route ──────────────────────────
    const allSlots = await db
      .select({
        id: routeTimeSlotsTable.id,
        departureTime: routeTimeSlotsTable.departureTime,
      })
      .from(routeTimeSlotsTable)
      .where(
        and(
          eq(routeTimeSlotsTable.routeId, routeId),
          eq(routeTimeSlotsTable.isActive, true),
        ),
      )
      .orderBy(asc(routeTimeSlotsTable.departureTime));

    if (allSlots.length === 0) {
      res.json({ routeId, weekStart, weekEnd, slots: [] });
      return;
    }

    // ── Fetch all bookable trips for this route and week ────────────────────
    const BOOKABLE_STATUSES = ["scheduled", "waiting_driver", "driver_assigned"] as const;

    const weekTrips = await db
      .select({
        id: tripsTable.id,
        departureTime: tripsTable.departureTime,
        availableSeats: tripsTable.availableSeats,
        totalSeats: tripsTable.totalSeats,
        vehicleType: tripsTable.vehicleType,
      })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.routeId, routeId),
          gte(tripsTable.departureTime, weekStartDate),
          lte(tripsTable.departureTime, weekEndDate),
          inArray(tripsTable.status, BOOKABLE_STATUSES),
        ),
      )
      .orderBy(asc(tripsTable.departureTime));

    // ── Fetch existing bookings for this route+week (to exclude taken slots) ─
    const existingBookings = await db
      .select({
        timeSlotId: driverShuttleBookingsTable.timeSlotId,
      })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.routeId, routeId),
          eq(driverShuttleBookingsTable.weekStart, weekStart),
          inArray(driverShuttleBookingsTable.status, ["active", "pending_renewal"]),
        ),
      );

    const takenSlotIds = new Set(existingBookings.map((b) => b.timeSlotId));

    // ── Build slot → trips map (keyed by Cairo HH:MM departure time) ─────────
    // trips are stored in UTC; slot.departureTime is Cairo local HH:MM
    type TripRow = {
      id: number;
      date: string;
      dow: number;
      availableSeats: number;
      vehicleType: "hiace" | "minibus";
    };

    const slotTripsMap = new Map<string, TripRow[]>(); // "HH:MM" → trips
    for (const trip of weekTrips) {
      const hhmm = toCairoHHMM(trip.departureTime);
      if (!slotTripsMap.has(hhmm)) {
        slotTripsMap.set(hhmm, []);
      }
      slotTripsMap.get(hhmm)!.push({
        id: trip.id,
        date: toDateStr(trip.departureTime),
        dow: trip.departureTime.getUTCDay(),
        availableSeats: trip.availableSeats,
        vehicleType: trip.vehicleType as "hiace" | "minibus",
      });
    }

    // ── Filter slots: must have full-week coverage and not already taken ──────
    const WORK_DAYS = [0, 1, 2, 3, 4]; // Sunday=0 … Thursday=4
    const availableSlots = [];

    for (const slot of allSlots) {
      // Skip slots already booked by any driver this week
      if (takenSlotIds.has(slot.id)) {
        continue;
      }

      const tripsForSlot = slotTripsMap.get(slot.departureTime) ?? [];
      const coveredDows = new Set(tripsForSlot.map((t) => t.dow));

      // Must have trips on all 5 working days
      if (!WORK_DAYS.every((d) => coveredDows.has(d))) {
        continue;
      }

      // Derive capacity constants from the first trip's vehicle type
      const vehicleType = tripsForSlot[0]?.vehicleType ?? "hiace";
      const totalSeats = VEHICLE_CAPACITY[vehicleType];
      const minRequired = VEHICLE_MIN_THRESHOLD[vehicleType];

      // Sort days Sunday → Thursday and build the days array
      const days = tripsForSlot
        .filter((t) => WORK_DAYS.includes(t.dow))
        .sort((a, b) => a.dow - b.dow)
        .map((t) => ({
          tripId: t.id,
          date: t.date,
          dayOfWeek: DOW_NAMES[t.dow] ?? String(t.dow),
          availableSeats: t.availableSeats,
        }));

      availableSlots.push({
        id: slot.id,
        departureTime: slot.departureTime,
        totalSeats,
        minRequired,
        days,
      });
    }

    res.json({
      routeId,
      weekStart,
      weekEnd,
      slots: availableSlots,
    });
  },
);

export default router;
