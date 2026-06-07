import { Router } from "express";
import {
  db,
  driverShuttleBookingsTable,
  routeTimeSlotsTable,
  routesTable,
  driversTable,
  notificationsTable,
  tripsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, asc, sql, isNull, isNotNull, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
import { logger } from "../lib/logger";

const router = Router();

// ─── Week helpers ─────────────────────────────────────────────────────────────

function getUpcomingWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToAdd = day === 0 ? 7 : 7 - day;
  const sunday = new Date(now);
  sunday.setUTCDate(sunday.getUTCDate() + daysToAdd);
  sunday.setUTCHours(0, 0, 0, 0);
  return sunday;
}

function isSunday(d: Date): boolean {
  return d.getUTCDay() === 0;
}

function weekEndFromStart(weekStart: Date): Date {
  const thursday = new Date(weekStart);
  thursday.setUTCDate(thursday.getUTCDate() + 4);
  return thursday;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

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

// ─── GET /shuttle/timeslots/:routeId ─────────────────────────────────────────
// Returns all active time slots for a route with week-aware availability.
// Accepts optional ?weekStart=YYYY-MM-DD (must be a Sunday).
// Defaults to the upcoming week if not provided.
// Returns per-slot: availableSeats, totalSeats (from trips), and
// isBooked = whether THIS driver already booked the slot for that week.
router.get("/shuttle/timeslots/:routeId", authenticate, async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.routeId as string);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route ID" }); return; }

  // ── Resolve weekStart ────────────────────────────────────────────────────
  let weekStartStr: string;
  const qWeekStart = req.query.weekStart as string | undefined;
  if (qWeekStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(qWeekStart)) {
      res.status(400).json({ error: "weekStart must be YYYY-MM-DD" }); return;
    }
    weekStartStr = qWeekStart;
  } else {
    weekStartStr = toDateStr(getUpcomingWeekStart());
  }
  const weekStartDate = new Date(weekStartStr + "T00:00:00Z");
  const weekEndDate   = weekEndFromStart(weekStartDate);
  const weekEndStr    = toDateStr(weekEndDate);

  // ── Route existence check ────────────────────────────────────────────────
  const [route] = await db
    .select({ id: routesTable.id, name: routesTable.name })
    .from(routesTable)
    .where(eq(routesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  // ── Resolve calling driver's internal ID ─────────────────────────────────
  const user = req.user!;
  const [driverRow] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, user.id));

  const myDriverId = driverRow?.id ?? null;

  // ── Run all three queries in parallel ────────────────────────────────────
  const [slots, allBookings, weekTrips] = await Promise.all([

    // 1. All active time slots for the route
    db
      .select()
      .from(routeTimeSlotsTable)
      .where(and(
        eq(routeTimeSlotsTable.routeId, routeId),
        eq(routeTimeSlotsTable.isActive, true),
      ))
      .orderBy(asc(routeTimeSlotsTable.departureTime)),

    // 2. All driver bookings for this route+week (any driver)
    db
      .select({
        timeSlotId: driverShuttleBookingsTable.timeSlotId,
        driverId:   driverShuttleBookingsTable.driverId,
      })
      .from(driverShuttleBookingsTable)
      .where(and(
        eq(driverShuttleBookingsTable.routeId, routeId),
        eq(driverShuttleBookingsTable.weekStart, weekStartStr),
        inArray(driverShuttleBookingsTable.status, ["active", "pending_renewal"]),
      )),

    // 3. Trips for this route whose departure falls within the week
    //    Used to derive availableSeats and totalSeats per time slot
    db
      .select({
        departureTime: tripsTable.departureTime,
        availableSeats: tripsTable.availableSeats,
        totalSeats:     tripsTable.totalSeats,
      })
      .from(tripsTable)
      .where(and(
        eq(tripsTable.routeId, routeId),
        gte(tripsTable.departureTime, weekStartDate),
        lte(tripsTable.departureTime, new Date(weekEndStr + "T23:59:59Z")),
        inArray(tripsTable.status, ["scheduled", "active", "waiting_driver", "driver_assigned"]),
      )),
  ]);

  // ── Build lookup maps ─────────────────────────────────────────────────────

  // slotId → driverId who booked it (any driver)
  const bookedBySlot = new Map<number, number>(
    allBookings.map((b) => [b.timeSlotId, b.driverId]),
  );

  // "HH:MM" → { availableSeats, totalSeats } (lowest availableSeats across the week)
  const seatsByTime = new Map<string, { availableSeats: number; totalSeats: number }>();
  for (const trip of weekTrips) {
    const hhmm = trip.departureTime.toISOString().substring(11, 16); // "HH:MM"
    const existing = seatsByTime.get(hhmm);
    if (!existing) {
      seatsByTime.set(hhmm, { availableSeats: trip.availableSeats, totalSeats: trip.totalSeats });
    } else {
      // Keep the most restrictive (lowest) seat count for the week
      seatsByTime.set(hhmm, {
        availableSeats: Math.min(existing.availableSeats, trip.availableSeats),
        totalSeats: existing.totalSeats,
      });
    }
  }

  // ── Build response ────────────────────────────────────────────────────────
  const data = slots.map((s) => {
    const bookedDriverId = bookedBySlot.get(s.id) ?? null;
    const seats          = seatsByTime.get(s.departureTime) ?? null;
    return {
      id:             s.id,
      departureTime:  s.departureTime,
      availableSeats: seats?.availableSeats ?? null,
      totalSeats:     seats?.totalSeats     ?? null,
      // isBooked  = current driver already holds this slot for this week
      isBooked:       myDriverId !== null && bookedDriverId === myDriverId,
      // isTaken   = another driver has claimed it (slot unavailable)
      isTaken:        bookedDriverId !== null && bookedDriverId !== myDriverId,
    };
  });

  res.json({
    routeId,
    routeName: route.name,
    weekStart:  weekStartStr,
    weekEnd:    weekEndStr,
    data,
    total: data.length,
  });
});

// ─── POST /shuttle/route-bookings ─────────────────────────────────────────────
// Driver books a route+timeslot for the upcoming week (Sunday–Thursday).
// Prevents double-booking via unique DB constraint + explicit pre-check.
const BookRouteBody = z.object({
  routeId: z.number().int().positive(),
  timeSlotId: z.number().int().positive(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD (a Sunday)"),
});

router.post("/shuttle/route-bookings", authenticate, async (req, res): Promise<void> => {
  const driver = req.user;
  if (!driver || driver.role !== "driver") {
    res.status(403).json({ error: "Only drivers can book shuttle routes" });
    return;
  }

  const parsed = BookRouteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { routeId, timeSlotId, weekStart } = parsed.data;

  const weekStartDate = new Date(weekStart + "T00:00:00Z");
  if (!isSunday(weekStartDate)) {
    res.status(400).json({ error: "weekStart must be a Sunday (day of week = 0)" });
    return;
  }

  const minAllowed = toDateStr(getUpcomingWeekStart());
  if (weekStart < minAllowed) {
    res.status(400).json({ error: `weekStart must be the upcoming week (${minAllowed} or later)` });
    return;
  }

  const weekEnd = toDateStr(weekEndFromStart(weekStartDate));

  const [driverRow] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, driver.id));
  if (!driverRow) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [slot] = await db
    .select({ id: routeTimeSlotsTable.id, routeId: routeTimeSlotsTable.routeId })
    .from(routeTimeSlotsTable)
    .where(and(eq(routeTimeSlotsTable.id, timeSlotId), eq(routeTimeSlotsTable.isActive, true)));
  if (!slot) { res.status(404).json({ error: "Time slot not found or inactive" }); return; }
  if (slot.routeId !== routeId) { res.status(400).json({ error: "Time slot does not belong to that route" }); return; }

  const [conflict] = await db
    .select({ id: driverShuttleBookingsTable.id, driverId: driverShuttleBookingsTable.driverId })
    .from(driverShuttleBookingsTable)
    .where(
      and(
        eq(driverShuttleBookingsTable.routeId, routeId),
        eq(driverShuttleBookingsTable.timeSlotId, timeSlotId),
        eq(driverShuttleBookingsTable.weekStart, weekStart),
        inArray(driverShuttleBookingsTable.status, ["active", "pending_renewal"]),
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

    logger.info({ bookingId: booking!.id, driverId: driverRow.id, routeId, timeSlotId, weekStart }, "Driver shuttle booking created");
    res.status(201).json({ ok: true, booking });
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      res.status(409).json({ error: "That route+timeslot was just booked by another driver" });
      return;
    }
    throw err;
  }
});

// ─── GET /shuttle/route-bookings ──────────────────────────────────────────────
// Driver's own bookings (all time, newest first).
router.get("/shuttle/route-bookings", authenticate, async (req, res): Promise<void> => {
  const driver = req.user;
  if (!driver || driver.role !== "driver") {
    res.status(403).json({ error: "Only drivers can view shuttle route bookings" });
    return;
  }

  const [driverRow] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, driver.id));
  if (!driverRow) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const bookings = await db
    .select(bookingFields)
    .from(driverShuttleBookingsTable)
    .innerJoin(routesTable, eq(driverShuttleBookingsTable.routeId, routesTable.id))
    .innerJoin(routeTimeSlotsTable, eq(driverShuttleBookingsTable.timeSlotId, routeTimeSlotsTable.id))
    .innerJoin(driversTable, eq(driverShuttleBookingsTable.driverId, driversTable.id))
    .where(eq(driverShuttleBookingsTable.driverId, driverRow.id))
    .orderBy(desc(driverShuttleBookingsTable.weekStart));

  res.json({ data: bookings.map(formatBooking), total: bookings.length });
});

// ─── GET /shuttle/route-bookings/:id ─────────────────────────────────────────
router.get("/shuttle/route-bookings/:id", authenticate, async (req, res): Promise<void> => {
  const driver = req.user;
  if (!driver || driver.role !== "driver") {
    res.status(403).json({ error: "Only drivers can view shuttle route bookings" });
    return;
  }

  const bookingId = parseInt(req.params.id as string);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [driverRow] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, driver.id));
  if (!driverRow) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [booking] = await db
    .select(bookingFields)
    .from(driverShuttleBookingsTable)
    .innerJoin(routesTable, eq(driverShuttleBookingsTable.routeId, routesTable.id))
    .innerJoin(routeTimeSlotsTable, eq(driverShuttleBookingsTable.timeSlotId, routeTimeSlotsTable.id))
    .innerJoin(driversTable, eq(driverShuttleBookingsTable.driverId, driversTable.id))
    .where(
      and(
        eq(driverShuttleBookingsTable.id, bookingId),
        eq(driverShuttleBookingsTable.driverId, driverRow.id),
      ),
    );

  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  res.json({ data: formatBooking(booking as Record<string, unknown>) });
});

// ─── DELETE /shuttle/route-bookings/:id ──────────────────────────────────────
// Driver cancels their own active booking.
router.delete("/shuttle/route-bookings/:id", authenticate, async (req, res): Promise<void> => {
  const driver = req.user;
  if (!driver || driver.role !== "driver") {
    res.status(403).json({ error: "Only drivers can cancel shuttle route bookings" });
    return;
  }

  const bookingId = parseInt(req.params.id as string);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [driverRow] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, driver.id));
  if (!driverRow) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [existing] = await db
    .select({ id: driverShuttleBookingsTable.id, status: driverShuttleBookingsTable.status })
    .from(driverShuttleBookingsTable)
    .where(
      and(
        eq(driverShuttleBookingsTable.id, bookingId),
        eq(driverShuttleBookingsTable.driverId, driverRow.id),
      ),
    );
  if (!existing) { res.status(404).json({ error: "Booking not found" }); return; }
  if (!["active", "pending_renewal"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot cancel a booking with status '${existing.status}'` });
    return;
  }

  const [updated] = await db
    .update(driverShuttleBookingsTable)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: "driver" })
    .where(eq(driverShuttleBookingsTable.id, bookingId))
    .returning();

  res.json({ ok: true, booking: updated });
});

// ─── POST /shuttle/route-bookings/:id/confirm-renewal ─────────────────────────
// Driver confirms priority renewal — creates a booking for the next week.
router.post(
  "/shuttle/route-bookings/:id/confirm-renewal",
  authenticate,
  async (req, res): Promise<void> => {
    const driver = req.user;
    if (!driver || driver.role !== "driver") {
      res.status(403).json({ error: "Only drivers can confirm shuttle renewals" });
      return;
    }

    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, driver.id));
    if (!driverRow) { res.status(404).json({ error: "Driver profile not found" }); return; }

    const [booking] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        driverId: driverShuttleBookingsTable.driverId,
        routeId: driverShuttleBookingsTable.routeId,
        timeSlotId: driverShuttleBookingsTable.timeSlotId,
        weekStart: driverShuttleBookingsTable.weekStart,
        status: driverShuttleBookingsTable.status,
        renewalDeadline: driverShuttleBookingsTable.renewalDeadline,
        renewalConfirmedAt: driverShuttleBookingsTable.renewalConfirmedAt,
      })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.id, bookingId),
          eq(driverShuttleBookingsTable.driverId, driverRow.id),
        ),
      );

    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.status !== "pending_renewal") {
      res.status(400).json({ error: `Cannot confirm renewal for booking with status '${booking.status}'` });
      return;
    }
    if (booking.renewalConfirmedAt) {
      res.status(400).json({ error: "Renewal already confirmed" });
      return;
    }

    const now = new Date();
    if (booking.renewalDeadline && new Date(booking.renewalDeadline) < now) {
      res.status(400).json({ error: "Renewal window has expired — slot is now open to others" });
      return;
    }

    const nextWeekStart = getUpcomingWeekStart();
    const nextWeekStartStr = toDateStr(nextWeekStart);
    const nextWeekEndStr = toDateStr(weekEndFromStart(nextWeekStart));

    const [slotConflict] = await db
      .select({ id: driverShuttleBookingsTable.id })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.routeId, booking.routeId),
          eq(driverShuttleBookingsTable.timeSlotId, booking.timeSlotId),
          eq(driverShuttleBookingsTable.weekStart, nextWeekStartStr),
          inArray(driverShuttleBookingsTable.status, ["active", "pending_renewal"]),
        ),
      );
    if (slotConflict) {
      res.status(409).json({ error: "That slot is already booked for next week" });
      return;
    }

    const [updated, newBooking] = await Promise.all([
      db
        .update(driverShuttleBookingsTable)
        .set({ renewalConfirmedAt: now, status: "active", updatedAt: now })
        .where(eq(driverShuttleBookingsTable.id, bookingId))
        .returning(),
      db
        .insert(driverShuttleBookingsTable)
        .values({
          driverId: driverRow.id,
          routeId: booking.routeId,
          timeSlotId: booking.timeSlotId,
          weekStart: nextWeekStartStr,
          weekEnd: nextWeekEndStr,
          status: "active",
        })
        .returning(),
    ]);

    res.json({ ok: true, currentBooking: updated[0], nextWeekBooking: newBooking[0] });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /admin/shuttle/bookings ──────────────────────────────────────────────
// List all driver shuttle bookings. Filter by ?week=YYYY-MM-DD (a Sunday),
// ?routeId=N, ?driverId=N, ?status=active|cancelled|pending_renewal|expired.
router.get(
  "/admin/shuttle/bookings",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "50") || 50));
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.week) {
      conditions.push(eq(driverShuttleBookingsTable.weekStart, req.query.week as string));
    }
    if (req.query.routeId) {
      const rid = parseInt(req.query.routeId as string);
      if (!isNaN(rid)) conditions.push(eq(driverShuttleBookingsTable.routeId, rid));
    }
    if (req.query.driverId) {
      const did = parseInt(req.query.driverId as string);
      if (!isNaN(did)) conditions.push(eq(driverShuttleBookingsTable.driverId, did));
    }
    if (req.query.status) {
      conditions.push(
        eq(
          driverShuttleBookingsTable.status,
          req.query.status as "active" | "cancelled" | "pending_renewal" | "expired",
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [bookings, countResult] = await Promise.all([
      db
        .select(bookingFields)
        .from(driverShuttleBookingsTable)
        .innerJoin(routesTable, eq(driverShuttleBookingsTable.routeId, routesTable.id))
        .innerJoin(routeTimeSlotsTable, eq(driverShuttleBookingsTable.timeSlotId, routeTimeSlotsTable.id))
        .innerJoin(driversTable, eq(driverShuttleBookingsTable.driverId, driversTable.id))
        .where(where)
        .orderBy(desc(driverShuttleBookingsTable.weekStart), asc(driverShuttleBookingsTable.routeId))
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
    if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

    const [booking] = await db
      .select(bookingFields)
      .from(driverShuttleBookingsTable)
      .innerJoin(routesTable, eq(driverShuttleBookingsTable.routeId, routesTable.id))
      .innerJoin(routeTimeSlotsTable, eq(driverShuttleBookingsTable.timeSlotId, routeTimeSlotsTable.id))
      .innerJoin(driversTable, eq(driverShuttleBookingsTable.driverId, driversTable.id))
      .where(eq(driverShuttleBookingsTable.id, bookingId));

    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    res.json({ data: formatBooking(booking as Record<string, unknown>) });
  },
);

// ─── PATCH /admin/shuttle/bookings/:id/reassign ───────────────────────────────
// Manually assign a different driver to an existing booking.
const ReassignBody = z.object({ driverId: z.number().int().positive() });

router.patch(
  "/admin/shuttle/bookings/:id/reassign",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

    const parsed = ReassignBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { driverId } = parsed.data;

    const [existing] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        status: driverShuttleBookingsTable.status,
        driverId: driverShuttleBookingsTable.driverId,
        routeId: driverShuttleBookingsTable.routeId,
        weekStart: driverShuttleBookingsTable.weekStart,
        routeName: routesTable.name,
        departureTime: routeTimeSlotsTable.departureTime,
      })
      .from(driverShuttleBookingsTable)
      .innerJoin(routesTable, eq(driverShuttleBookingsTable.routeId, routesTable.id))
      .innerJoin(routeTimeSlotsTable, eq(driverShuttleBookingsTable.timeSlotId, routeTimeSlotsTable.id))
      .where(eq(driverShuttleBookingsTable.id, bookingId));
    if (!existing) { res.status(404).json({ error: "Booking not found" }); return; }

    const [newDriverRow] = await db
      .select({ id: driversTable.id, userId: driversTable.userId, name: driversTable.name })
      .from(driversTable)
      .where(and(eq(driversTable.id, driverId), eq(driversTable.isActive, true)));
    if (!newDriverRow) { res.status(404).json({ error: "Target driver not found or inactive" }); return; }

    const [updated] = await db
      .update(driverShuttleBookingsTable)
      .set({ driverId, status: "active", renewalNotifiedAt: null, renewalDeadline: null, renewalConfirmedAt: null, updatedAt: new Date() })
      .where(eq(driverShuttleBookingsTable.id, bookingId))
      .returning();

    // ── Notify old driver (if different) ──────────────────────────────────────
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
          io.to(SOCKET_ROOMS.PASSENGER(oldDriverRow.userId)).emit(SOCKET_EVENTS.SHUTTLE_BOOKING_REASSIGNED, {
            bookingId,
            role: "removed",
            routeName: existing.routeName,
            departureTime: existing.departureTime,
            weekStart: existing.weekStart,
          });
          io.to(SOCKET_ROOMS.PASSENGER(oldDriverRow.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
            id: String(oldNotif.id),
            category: "shuttle",
            title: oldNotif.title,
            body: oldNotif.body,
            time: oldNotif.createdAt instanceof Date ? oldNotif.createdAt.toISOString() : String(oldNotif.createdAt),
          });
        }
      }
    }

    // ── Notify new driver ──────────────────────────────────────────────────────
    const [newNotif] = await db
      .insert(notificationsTable)
      .values({
        userId: newDriverRow.userId,
        title: "Route Booking Assigned",
        body: `You have been assigned to route "${existing.routeName}" at ${existing.departureTime} for the week of ${existing.weekStart}.`,
      })
      .returning();
    if (io && newNotif) {
      io.to(SOCKET_ROOMS.PASSENGER(newDriverRow.userId)).emit(SOCKET_EVENTS.SHUTTLE_BOOKING_REASSIGNED, {
        bookingId,
        role: "assigned",
        routeName: existing.routeName,
        departureTime: existing.departureTime,
        weekStart: existing.weekStart,
      });
      io.to(SOCKET_ROOMS.PASSENGER(newDriverRow.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
        id: String(newNotif.id),
        category: "shuttle",
        title: newNotif.title,
        body: newNotif.body,
        time: newNotif.createdAt instanceof Date ? newNotif.createdAt.toISOString() : String(newNotif.createdAt),
      });
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
    if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

    const parsed = CancelBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existing] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        status: driverShuttleBookingsTable.status,
        driverId: driverShuttleBookingsTable.driverId,
        routeId: driverShuttleBookingsTable.routeId,
        weekStart: driverShuttleBookingsTable.weekStart,
      })
      .from(driverShuttleBookingsTable)
      .where(eq(driverShuttleBookingsTable.id, bookingId));
    if (!existing) { res.status(404).json({ error: "Booking not found" }); return; }
    if (existing.status === "cancelled") {
      res.status(400).json({ error: "Booking is already cancelled" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(driverShuttleBookingsTable)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: "admin", cancelReason: parsed.data.reason ?? null, updatedAt: now })
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
          title: "Route Booking Cancelled",
          body: parsed.data.reason
            ? `Your shuttle booking was cancelled by admin: ${parsed.data.reason}`
            : "Your shuttle booking has been cancelled by an administrator.",
        })
        .returning();
      const io = getIO();
      if (io && notif) {
        io.to(SOCKET_ROOMS.PASSENGER(driver.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
          id: String(notif.id),
          category: "shuttle",
          title: notif.title,
          body: notif.body,
          time: notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
        });
      }
    }

    res.json({ ok: true, booking: updated });
  },
);

// ─── PATCH /admin/shuttle/bookings/:id/extend-window ─────────────────────────
// Extend a driver's priority renewal deadline.
const ExtendWindowBody = z.object({
  hours: z.number().int().min(1).max(72),
});

router.patch(
  "/admin/shuttle/bookings/:id/extend-window",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

    const parsed = ExtendWindowBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existing] = await db
      .select({
        id: driverShuttleBookingsTable.id,
        status: driverShuttleBookingsTable.status,
        renewalDeadline: driverShuttleBookingsTable.renewalDeadline,
        driverId: driverShuttleBookingsTable.driverId,
      })
      .from(driverShuttleBookingsTable)
      .where(eq(driverShuttleBookingsTable.id, bookingId));
    if (!existing) { res.status(404).json({ error: "Booking not found" }); return; }
    if (existing.status !== "pending_renewal") {
      res.status(400).json({ error: `Cannot extend window for booking with status '${existing.status}'` });
      return;
    }

    const base = existing.renewalDeadline ? new Date(existing.renewalDeadline) : new Date();
    const newDeadline = new Date(base.getTime() + parsed.data.hours * 60 * 60 * 1000);

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
        io.to(SOCKET_ROOMS.PASSENGER(driver.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
          id: String(notif.id),
          category: "shuttle_renewal",
          title: notif.title,
          body: notif.body,
          bookingId,
          deadlineIso: newDeadline.toISOString(),
          time: notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
        });
      }
    }

    res.json({ ok: true, booking: updated });
  },
);

// ─── GET /admin/shuttle/availability ─────────────────────────────────────────
// Availability matrix: for a given week (query ?week=YYYY-MM-DD), returns every
// route × every active time slot with the booking (if any) occupying that slot.
// Defaults to the upcoming week when ?week is omitted.
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
        .orderBy(asc(routeTimeSlotsTable.routeId), asc(routeTimeSlotsTable.departureTime)),

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
          renewalNotifiedAt: driverShuttleBookingsTable.renewalNotifiedAt,
        })
        .from(driverShuttleBookingsTable)
        .innerJoin(driversTable, eq(driverShuttleBookingsTable.driverId, driversTable.id))
        .where(
          and(
            eq(driverShuttleBookingsTable.weekStart, weekStart),
            inArray(driverShuttleBookingsTable.status, ["active", "pending_renewal"]),
          ),
        ),
    ]);

    const bookingMap = new Map(bookings.map((b) => [`${b.routeId}:${b.timeSlotId}`, b]));

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
// All bookings that had a renewal notification sent (history of renewal events).
router.get(
  "/admin/shuttle/renewal-history",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "50") || 50));
    const offset = (page - 1) * limit;

    const [bookings, countResult] = await Promise.all([
      db
        .select(bookingFields)
        .from(driverShuttleBookingsTable)
        .innerJoin(routesTable, eq(driverShuttleBookingsTable.routeId, routesTable.id))
        .innerJoin(routeTimeSlotsTable, eq(driverShuttleBookingsTable.timeSlotId, routeTimeSlotsTable.id))
        .innerJoin(driversTable, eq(driverShuttleBookingsTable.driverId, driversTable.id))
        .where(isNotNull(driverShuttleBookingsTable.renewalNotifiedAt))
        .orderBy(desc(driverShuttleBookingsTable.renewalNotifiedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(driverShuttleBookingsTable)
        .where(isNotNull(driverShuttleBookingsTable.renewalNotifiedAt)),
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

// GET /admin/shuttle/timeslots?routeId=N — list all time slots
router.get(
  "/admin/shuttle/timeslots",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const conditions: ReturnType<typeof eq>[] = [];
    if (req.query.routeId) {
      const rid = parseInt(req.query.routeId as string);
      if (!isNaN(rid)) conditions.push(eq(routeTimeSlotsTable.routeId, rid));
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
      .innerJoin(routesTable, eq(routeTimeSlotsTable.routeId, routesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(routeTimeSlotsTable.routeId), asc(routeTimeSlotsTable.departureTime));

    res.json({ data: slots, total: slots.length });
  },
);

// POST /admin/shuttle/timeslots — create a new time slot for a route
const CreateSlotBody = z.object({
  routeId: z.number().int().positive(),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, "departureTime must be HH:MM (e.g. 08:00)"),
  isActive: z.boolean().optional().default(true),
});

router.post(
  "/admin/shuttle/timeslots",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateSlotBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [route] = await db
      .select({ id: routesTable.id })
      .from(routesTable)
      .where(eq(routesTable.id, parsed.data.routeId));
    if (!route) { res.status(404).json({ error: "Route not found" }); return; }

    try {
      const [slot] = await db
        .insert(routeTimeSlotsTable)
        .values(parsed.data)
        .returning();
      res.status(201).json({ ok: true, slot });
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === "23505") {
        res.status(409).json({ error: "A time slot with that departure time already exists for this route" });
        return;
      }
      throw err;
    }
  },
);

// PATCH /admin/shuttle/timeslots/:id — update a time slot
const UpdateSlotBody = z.object({
  departureTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/admin/shuttle/timeslots/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const slotId = parseInt(req.params.id as string);
    if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

    const parsed = UpdateSlotBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(routeTimeSlotsTable)
      .set(parsed.data)
      .where(eq(routeTimeSlotsTable.id, slotId))
      .returning();

    if (!updated) { res.status(404).json({ error: "Time slot not found" }); return; }
    res.json({ ok: true, slot: updated });
  },
);

// DELETE /admin/shuttle/timeslots/:id — deactivate or remove a time slot
router.delete(
  "/admin/shuttle/timeslots/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const slotId = parseInt(req.params.id as string);
    if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

    const [activeBookings] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(driverShuttleBookingsTable)
      .where(
        and(
          eq(driverShuttleBookingsTable.timeSlotId, slotId),
          inArray(driverShuttleBookingsTable.status, ["active", "pending_renewal"]),
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
    if (!deleted) { res.status(404).json({ error: "Time slot not found" }); return; }
    res.json({ ok: true, deleted });
  },
);

export default router;
