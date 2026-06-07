import { Router } from "express";
import { z } from "zod";
import { db, routeSchedulesTable, scheduleSlotsTable, tripsTable, routesTable, routeTimeSlotsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { VEHICLE_CAPACITY } from "@workspace/db";

const router = Router();

const VEHICLE_TYPES = ["hiace", "minibus"] as const;
type VehicleType = (typeof VEHICLE_TYPES)[number];

// ─── Timezone helper ──────────────────────────────────────────────────────────
// All times the admin enters are treated as Cairo local time (Africa/Cairo).
// This function converts "HH:MM" Cairo time on a given UTC date to a proper
// UTC Date — no hardcoded offset, handles DST automatically via Intl.
const CAIRO_TZ = "Africa/Cairo";

function cairoTimeToUtc(utcDate: Date, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);

  // Build a date string that represents midnight of this day in Cairo
  // by using Intl to find what UTC instant corresponds to Cairo midnight.
  // We do this by binary-searching or by using the offset from a known point.

  // Step 1: get the Cairo offset at noon of this UTC day (avoids DST edge cases)
  const noonUtc = new Date(utcDate);
  noonUtc.setUTCHours(12, 0, 0, 0);

  // Format noon as Cairo local time to extract the Cairo date parts
  const cairoNoon = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(noonUtc);

  const parts = Object.fromEntries(cairoNoon.map((p) => [p.type, p.value]));
  // parts.year, parts.month, parts.day are the Cairo local date at noon

  // Step 2: construct an ISO string for the admin's chosen time in Cairo
  const cairoIso = `${parts.year}-${parts.month}-${parts.day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;

  // Step 3: parse it as Cairo local time → UTC using Intl offset trick
  // Create a Date from the ISO string (treated as LOCAL by Date constructor
  // when no Z suffix), then correct for the environment's local offset vs Cairo.
  // The safest cross-platform way: use the offset from a reference point.
  const localDate = new Date(cairoIso); // parsed as system local time

  // Get the system's UTC offset at this moment
  const systemOffsetMs = localDate.getTimezoneOffset() * 60 * 1000; // positive = behind UTC

  // Get Cairo's UTC offset at this moment using Intl
  const cairoOffsetMs = getCairoOffsetMs(localDate);

  // Correct: remove system offset, apply Cairo offset
  const utcMs = localDate.getTime() + systemOffsetMs - cairoOffsetMs;

  return new Date(utcMs);
}

/**
 * Returns Cairo's UTC offset in milliseconds at a given moment.
 * Positive = ahead of UTC (Cairo is UTC+2 or UTC+3).
 */
function getCairoOffsetMs(at: Date): number {
  // Format the date in both UTC and Cairo, then diff
  const utcStr = at.toLocaleString("en-US", { timeZone: "UTC", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const cairoStr = at.toLocaleString("en-US", { timeZone: CAIRO_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const utcParsed = new Date(utcStr);
  const cairoParsed = new Date(cairoStr);

  // cairoParsed - utcParsed = offset in ms (positive = Cairo ahead of UTC)
  return cairoParsed.getTime() - utcParsed.getTime();
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateScheduleBody = z.object({
  routeId: z.number().int().positive(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  vehicleType: z.enum(VEHICLE_TYPES),
  slots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        departureTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM (Cairo local time)"),
      }),
    )
    .min(1, "At least one slot is required"),
});

const UpdateScheduleBody = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

const BATCH_SIZE = 500;

// ─── Route time-slot sync ─────────────────────────────────────────────────────
// Ensures that every distinct Cairo HH:MM departure time in a schedule's slots
// has a matching active row in route_time_slots (used by the driver booking app).
// Uses INSERT ... ON CONFLICT DO NOTHING so existing rows are untouched.
async function syncRouteTimeSlots(
  routeId: number,
  slots: Array<{ departureTime: string }>, // Cairo HH:MM
): Promise<void> {
  const distinct = [...new Set(slots.map((s) => s.departureTime))];
  if (distinct.length === 0) return;

  await db
    .insert(routeTimeSlotsTable)
    .values(distinct.map((t) => ({ routeId, departureTime: t, isActive: true })))
    .onConflictDoNothing();
}

// ─── Trip generator ───────────────────────────────────────────────────────────
// Iterates day-by-day from effectiveFrom to effectiveTo (both Cairo dates),
// finds slots whose dayOfWeek matches, converts the admin's HH:MM Cairo time
// to UTC, and inserts trip rows. Skips duplicates.

async function generateTripsForSchedule(
  scheduleId: number,
  routeId: number,
  effectiveFrom: string,   // "YYYY-MM-DD" — treated as Cairo local date
  effectiveTo: string,     // "YYYY-MM-DD" — treated as Cairo local date
  vehicleType: VehicleType,
  slots: Array<{ dayOfWeek: number; departureTime: string }>, // departureTime = Cairo HH:MM
  estimatedDuration: number, // minutes
  basePrice: string,
): Promise<number> {
  const totalSeats = VEHICLE_CAPACITY[vehicleType];

  // Treat effectiveFrom/To as Cairo midnight → convert to UTC for DB queries
  const startUtc = cairoTimeToUtc(new Date(effectiveFrom + "T00:00:00Z"), "00:00");
  const endUtc   = cairoTimeToUtc(new Date(effectiveTo   + "T00:00:00Z"), "23:59");

  const slotsByDay = new Map<number, string[]>();
  for (const slot of slots) {
    const existing = slotsByDay.get(slot.dayOfWeek) ?? [];
    existing.push(slot.departureTime);
    slotsByDay.set(slot.dayOfWeek, existing);
  }

  // Fetch existing trips for this schedule to avoid duplicates
  const existingTrips = await db
    .select({ departureTime: tripsTable.departureTime })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.routeId, routeId),
        eq(tripsTable.scheduleId, scheduleId),
        gte(tripsTable.departureTime, startUtc),
        lte(tripsTable.departureTime, endUtc),
      ),
    );

  const existingSet = new Set(
    existingTrips.map((t) => t.departureTime.toISOString()),
  );

  const toInsert: Array<{
    routeId: number;
    scheduleId: number;
    busId: null;
    driverId: null;
    departureTime: Date;
    arrivalTime: Date;
    availableSeats: number;
    totalSeats: number;
    price: string;
    vehicleType: VehicleType;
    status: "scheduled";
    isActive: boolean;
  }> = [];

  // Walk day-by-day in Cairo time.
  // We move a cursor through UTC dates but check the Cairo day-of-week.
  const cursor = new Date(startUtc);
  cursor.setUTCHours(0, 0, 0, 0);

  const endDay = new Date(endUtc);
  endDay.setUTCHours(23, 59, 59, 999);

  while (cursor <= endDay) {
    // Get the day-of-week for this cursor in Cairo time
    const cairoDow = getCairoDayOfWeek(cursor);
    const times = slotsByDay.get(cairoDow);

    if (times) {
      for (const time of times) {
        // Convert admin's Cairo HH:MM on this cursor day → UTC
        const departure = cairoTimeToUtc(cursor, time);
        const arrival   = new Date(departure.getTime() + estimatedDuration * 60 * 1000);

        if (!existingSet.has(departure.toISOString())) {
          toInsert.push({
            routeId,
            scheduleId,
            busId: null,
            driverId: null,
            departureTime: departure,
            arrivalTime: arrival,
            availableSeats: totalSeats,
            totalSeats,
            price: basePrice,
            vehicleType,
            status: "scheduled",
            isActive: true,
          });
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (toInsert.length === 0) return 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    await db.insert(tripsTable).values(toInsert.slice(i, i + BATCH_SIZE));
  }

  return toInsert.length;
}

/**
 * Returns the day-of-week (0=Sun … 6=Sat) for a UTC Date in Cairo local time.
 */
function getCairoDayOfWeek(utcDate: Date): number {
  const cairoStr = utcDate.toLocaleString("en-US", {
    timeZone: CAIRO_TZ,
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[cairoStr] ?? utcDate.getUTCDay();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /schedules ──────────────────────────────────────────────────────────
router.post(
  "/schedules",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateScheduleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }

    const { routeId, effectiveFrom, effectiveTo, vehicleType, slots } = parsed.data;
    const capacity = VEHICLE_CAPACITY[vehicleType];

    if (new Date(effectiveTo) <= new Date(effectiveFrom)) {
      res.status(400).json({ error: "effectiveTo must be after effectiveFrom" });
      return;
    }

    const [route] = await db
      .select({
        id: routesTable.id,
        estimatedDuration: routesTable.estimatedDuration,
        basePrice: routesTable.basePrice,
      })
      .from(routesTable)
      .where(eq(routesTable.id, routeId));

    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    const [schedule] = await db
      .insert(routeSchedulesTable)
      .values({
        routeId,
        effectiveFrom,
        effectiveTo,
        vehicleType,
        defaultCapacity: capacity,
        isActive: true,
      })
      .returning();

    const slotRows = slots.map((s) => ({
      scheduleId: schedule!.id,
      dayOfWeek: s.dayOfWeek,
      departureTime: s.departureTime, // stored as Cairo HH:MM — source of truth
    }));

    const insertedSlots = await db
      .insert(scheduleSlotsTable)
      .values(slotRows)
      .returning();

    const tripsCreated = await generateTripsForSchedule(
      schedule!.id,
      routeId,
      effectiveFrom,
      effectiveTo,
      vehicleType,
      slots,
      route.estimatedDuration,
      route.basePrice,
    );

    // Keep driver-app route_time_slots in sync with this schedule's times
    await syncRouteTimeSlots(routeId, slots);

    res.status(201).json({
      schedule,
      slots: insertedSlots,
      tripsCreated,
      note: "Departure times are interpreted as Cairo local time (Africa/Cairo) and stored in UTC.",
    });
  },
);

// ─── GET /schedules ───────────────────────────────────────────────────────────
router.get(
  "/schedules",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const routeId = req.query.routeId
      ? parseInt(req.query.routeId as string)
      : undefined;

    const conditions = [];
    if (routeId && !isNaN(routeId)) {
      conditions.push(eq(routeSchedulesTable.routeId, routeId));
    }

    const schedules = await db
      .select({
        id: routeSchedulesTable.id,
        routeId: routeSchedulesTable.routeId,
        routeName: routesTable.name,
        fromLocation: routesTable.fromLocation,
        toLocation: routesTable.toLocation,
        effectiveFrom: routeSchedulesTable.effectiveFrom,
        effectiveTo: routeSchedulesTable.effectiveTo,
        vehicleType: routeSchedulesTable.vehicleType,
        defaultCapacity: routeSchedulesTable.defaultCapacity,
        isActive: routeSchedulesTable.isActive,
        createdAt: routeSchedulesTable.createdAt,
      })
      .from(routeSchedulesTable)
      .leftJoin(routesTable, eq(routeSchedulesTable.routeId, routesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(routeSchedulesTable.createdAt);

    if (schedules.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    const scheduleIds = schedules.map((s) => s.id);

    const [slots, tripCounts] = await Promise.all([
      db
        .select()
        .from(scheduleSlotsTable)
        .where(inArray(scheduleSlotsTable.scheduleId, scheduleIds))
        .orderBy(scheduleSlotsTable.dayOfWeek, scheduleSlotsTable.departureTime),

      db
        .select({
          scheduleId: tripsTable.scheduleId,
          total: sql<number>`count(*)::int`,
          waiting: sql<number>`count(*) filter (where ${tripsTable.status} IN ('scheduled', 'waiting_driver'))::int`,
          assigned: sql<number>`count(*) filter (where ${tripsTable.status} = 'driver_assigned')::int`,
          completed: sql<number>`count(*) filter (where ${tripsTable.status} = 'completed')::int`,
          cancelled: sql<number>`count(*) filter (where ${tripsTable.status} = 'cancelled')::int`,
        })
        .from(tripsTable)
        .where(inArray(tripsTable.scheduleId, scheduleIds))
        .groupBy(tripsTable.scheduleId),
    ]);

    const slotMap = new Map<number, typeof slots>();
    for (const slot of slots) {
      const arr = slotMap.get(slot.scheduleId) ?? [];
      arr.push(slot);
      slotMap.set(slot.scheduleId, arr);
    }

    const countMap = new Map(tripCounts.map((c) => [c.scheduleId, c]));

    const data = schedules.map((s) => ({
      ...s,
      slots: slotMap.get(s.id) ?? [],
      tripStats: countMap.get(s.id) ?? {
        total: 0, waiting: 0, assigned: 0, completed: 0, cancelled: 0,
      },
    }));

    res.json({ data, total: data.length });
  },
);

// ─── GET /schedules/:id ───────────────────────────────────────────────────────
router.get(
  "/schedules/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid schedule ID" });
      return;
    }

    const [schedule] = await db
      .select({
        id: routeSchedulesTable.id,
        routeId: routeSchedulesTable.routeId,
        routeName: routesTable.name,
        fromLocation: routesTable.fromLocation,
        toLocation: routesTable.toLocation,
        estimatedDuration: routesTable.estimatedDuration,
        effectiveFrom: routeSchedulesTable.effectiveFrom,
        effectiveTo: routeSchedulesTable.effectiveTo,
        vehicleType: routeSchedulesTable.vehicleType,
        defaultCapacity: routeSchedulesTable.defaultCapacity,
        isActive: routeSchedulesTable.isActive,
        createdAt: routeSchedulesTable.createdAt,
        updatedAt: routeSchedulesTable.updatedAt,
      })
      .from(routeSchedulesTable)
      .leftJoin(routesTable, eq(routeSchedulesTable.routeId, routesTable.id))
      .where(eq(routeSchedulesTable.id, id));

    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }

    const [slots, tripStats] = await Promise.all([
      db
        .select()
        .from(scheduleSlotsTable)
        .where(eq(scheduleSlotsTable.scheduleId, id))
        .orderBy(scheduleSlotsTable.dayOfWeek, scheduleSlotsTable.departureTime),

      db
        .select({
          total: sql<number>`count(*)::int`,
          waiting: sql<number>`count(*) filter (where ${tripsTable.status} IN ('scheduled', 'waiting_driver'))::int`,
          assigned: sql<number>`count(*) filter (where ${tripsTable.status} = 'driver_assigned')::int`,
          completed: sql<number>`count(*) filter (where ${tripsTable.status} = 'completed')::int`,
          cancelled: sql<number>`count(*) filter (where ${tripsTable.status} = 'cancelled')::int`,
        })
        .from(tripsTable)
        .where(eq(tripsTable.scheduleId, id)),
    ]);

    res.json({
      ...schedule,
      slots,
      tripStats: tripStats[0] ?? {
        total: 0, waiting: 0, assigned: 0, completed: 0, cancelled: 0,
      },
    });
  },
);

// ─── PATCH /schedules/:id ─────────────────────────────────────────────────────
router.patch(
  "/schedules/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid schedule ID" });
      return;
    }

    const parsed = UpdateScheduleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }

    const [existing] = await db
      .select()
      .from(routeSchedulesTable)
      .where(eq(routeSchedulesTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }

    const [updated] = await db
      .update(routeSchedulesTable)
      .set(parsed.data)
      .where(eq(routeSchedulesTable.id, id))
      .returning();

    res.json(updated);
  },
);

// ─── POST /schedules/:id/generate ────────────────────────────────────────────
// Re-generates trips for a schedule (e.g. after extending effectiveTo).
router.post(
  "/schedules/:id/generate",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid schedule ID" });
      return;
    }

    const [schedule] = await db
      .select({
        id: routeSchedulesTable.id,
        routeId: routeSchedulesTable.routeId,
        effectiveFrom: routeSchedulesTable.effectiveFrom,
        effectiveTo: routeSchedulesTable.effectiveTo,
        vehicleType: routeSchedulesTable.vehicleType,
        defaultCapacity: routeSchedulesTable.defaultCapacity,
        isActive: routeSchedulesTable.isActive,
        estimatedDuration: routesTable.estimatedDuration,
        basePrice: routesTable.basePrice,
      })
      .from(routeSchedulesTable)
      .leftJoin(routesTable, eq(routeSchedulesTable.routeId, routesTable.id))
      .where(eq(routeSchedulesTable.id, id));

    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }

    if (!schedule.isActive) {
      res.status(400).json({ error: "Cannot generate trips for an inactive schedule" });
      return;
    }

    const slots = await db
      .select()
      .from(scheduleSlotsTable)
      .where(eq(scheduleSlotsTable.scheduleId, id));

    if (slots.length === 0) {
      res.status(400).json({ error: "Schedule has no time slots defined" });
      return;
    }

    const tripsCreated = await generateTripsForSchedule(
      schedule.id,
      schedule.routeId,
      schedule.effectiveFrom,
      schedule.effectiveTo,
      schedule.vehicleType as VehicleType,
      slots,
      schedule.estimatedDuration!,
      schedule.basePrice!,
    );

    // Keep driver-app route_time_slots in sync with this schedule's times
    await syncRouteTimeSlots(schedule.routeId, slots);

    res.json({ ok: true, tripsCreated });
  },
);

// ─── DELETE /schedules/:id ────────────────────────────────────────────────────
router.delete(
  "/schedules/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid schedule ID" });
      return;
    }

    const [existing] = await db
      .select({ id: routeSchedulesTable.id })
      .from(routeSchedulesTable)
      .where(eq(routeSchedulesTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }

    await db
      .update(routeSchedulesTable)
      .set({ isActive: false })
      .where(eq(routeSchedulesTable.id, id));

    const now = new Date();
    const cancelledCount = await db
      .update(tripsTable)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelReason: "Schedule deactivated by admin",
      })
      .where(
        and(
          eq(tripsTable.scheduleId, id),
          inArray(tripsTable.status, ["waiting_driver", "scheduled"]),
          gte(tripsTable.departureTime, now),
        ),
      );

    res.json({
      ok: true,
      scheduleDeactivated: true,
      futureTripsCount: cancelledCount.rowCount ?? 0,
    });
  },
);

export default router;