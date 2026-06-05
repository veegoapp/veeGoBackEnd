import { Router } from "express";
import { z } from "zod";
import { db, routeSchedulesTable, scheduleSlotsTable, tripsTable, routesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";

const router = Router();

const CreateScheduleBody = z.object({
  routeId: z.number().int().positive(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  defaultCapacity: z.number().int().positive().default(40),
  slots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        departureTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
      }),
    )
    .min(1, "At least one slot is required"),
});

const UpdateScheduleBody = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  defaultCapacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

const BATCH_SIZE = 500;
const SHUTTLE_TOTAL_SEATS = 14;

async function generateTripsForSchedule(
  scheduleId: number,
  routeId: number,
  effectiveFrom: string,
  effectiveTo: string,
  defaultCapacity: number,
  slots: Array<{ dayOfWeek: number; departureTime: string }>,
  estimatedDuration: number,
  basePrice: string,
): Promise<number> {
  const start = new Date(effectiveFrom + "T00:00:00Z");
  const end = new Date(effectiveTo + "T23:59:59Z");

  const slotsByDay = new Map<number, string[]>();
  for (const slot of slots) {
    const existing = slotsByDay.get(slot.dayOfWeek) ?? [];
    existing.push(slot.departureTime);
    slotsByDay.set(slot.dayOfWeek, existing);
  }

  const existingTrips = await db
    .select({ departureTime: tripsTable.departureTime })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.routeId, routeId),
        eq(tripsTable.scheduleId, scheduleId),
        gte(tripsTable.departureTime, start),
        lte(tripsTable.departureTime, end),
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
    status: "scheduled";
    isActive: boolean;
  }> = [];

  const cursor = new Date(start);
  while (cursor <= end) {
    const dayOfWeek = cursor.getUTCDay();
    const times = slotsByDay.get(dayOfWeek);

    if (times) {
      for (const time of times) {
        const [hh, mm] = time.split(":").map(Number);
        const departure = new Date(cursor);
        departure.setUTCHours(hh, mm, 0, 0);
        const arrival = new Date(
          departure.getTime() + estimatedDuration * 60 * 1000,
        );

        if (!existingSet.has(departure.toISOString())) {
          toInsert.push({
            routeId,
            scheduleId,
            busId: null,
            driverId: null,
            departureTime: departure,
            arrivalTime: arrival,
            availableSeats: SHUTTLE_TOTAL_SEATS,
            totalSeats: SHUTTLE_TOTAL_SEATS,
            price: basePrice,
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

    const { routeId, effectiveFrom, effectiveTo, defaultCapacity, slots } =
      parsed.data;

    if (new Date(effectiveTo) <= new Date(effectiveFrom)) {
      res
        .status(400)
        .json({ error: "effectiveTo must be after effectiveFrom" });
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
      .values({ routeId, effectiveFrom, effectiveTo, defaultCapacity, isActive: true })
      .returning();

    const slotRows = slots.map((s) => ({
      scheduleId: schedule.id,
      dayOfWeek: s.dayOfWeek,
      departureTime: s.departureTime,
    }));

    const insertedSlots = await db
      .insert(scheduleSlotsTable)
      .values(slotRows)
      .returning();

    const tripsCreated = await generateTripsForSchedule(
      schedule.id,
      routeId,
      effectiveFrom,
      effectiveTo,
      defaultCapacity,
      slots,
      route.estimatedDuration,
      route.basePrice,
    );

    res.status(201).json({
      schedule,
      slots: insertedSlots,
      tripsCreated,
    });
  },
);

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
          open: sql<number>`count(*) filter (where ${tripsTable.status} IN ('scheduled', 'waiting_driver'))::int`,
          active: sql<number>`count(*) filter (where ${tripsTable.status} = 'active')::int`,
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
        total: 0,
        open: 0,
        active: 0,
        completed: 0,
        cancelled: 0,
      },
    }));

    res.json({ data, total: data.length });
  },
);

router.get(
  "/schedules/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id);
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
          open: sql<number>`count(*) filter (where ${tripsTable.status} IN ('scheduled', 'waiting_driver'))::int`,
          active: sql<number>`count(*) filter (where ${tripsTable.status} = 'active')::int`,
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
        total: 0,
        open: 0,
        active: 0,
        completed: 0,
        cancelled: 0,
      },
    });
  },
);

router.patch(
  "/schedules/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id);
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

router.post(
  "/schedules/:id/generate",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id);
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
      schedule.defaultCapacity,
      slots,
      schedule.estimatedDuration!,
      schedule.basePrice!,
    );

    res.json({ ok: true, tripsCreated });
  },
);

router.delete(
  "/schedules/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id);
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
      .set({ status: "cancelled", cancelledAt: now, cancelReason: "Schedule deactivated by admin" })
      .where(
        and(
          eq(tripsTable.scheduleId, id),
          inArray(tripsTable.status, ["waiting_driver", "scheduled"]),
          gte(tripsTable.departureTime, now),
        ),
      );

    res.json({ ok: true, scheduleDeactivated: true, futureTripsCount: cancelledCount.rowCount ?? 0 });
  },
);

export default router;
