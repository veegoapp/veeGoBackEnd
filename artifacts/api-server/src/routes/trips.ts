import { Router } from "express";
import { db, tripsTable, busesTable, routesTable, driversTable, bookingsTable, usersTable, walletTransactionsTable, notificationsTable } from "@workspace/db";
import { eq, sql, and, inArray, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole } from "../middlewares/auth";
import {
  ListTripsQueryParams,
  GetTripParams,
  CreateTripBody,
  UpdateTripParams,
  UpdateTripBody,
  CancelTripParams,
} from "@workspace/api-zod";

const router = Router();

function formatTrip(t: Record<string, unknown>) {
  return {
    ...t,
    price: typeof t.price === "string" ? parseFloat(t.price) : t.price,
    availableSeats: t.availableSeats,
    totalSeats: t.totalSeats,
  };
}

router.get("/trips", async (req, res): Promise<void> => {
  const parsed = ListTripsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { routeId, status, date, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (routeId) conditions.push(eq(tripsTable.routeId, routeId));
  if (status) conditions.push(eq(tripsTable.status, status as "scheduled" | "active" | "completed" | "cancelled"));
  if (date) conditions.push(sql`DATE(${tripsTable.departureTime}) = ${date}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select().from(tripsTable).where(where).limit(limit).offset(offset).orderBy(tripsTable.departureTime),
    db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(where),
  ]);

  res.json({ data: data.map(t => formatTrip(t as Record<string, unknown>)), total: countResult[0].count, page, limit });
});

router.post("/trips", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateTripBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const bus = await db.select({ capacity: busesTable.capacity }).from(busesTable).where(eq(busesTable.id, parsed.data.busId));
  if (!bus[0]) { res.status(404).json({ error: "Bus not found" }); return; }

  // Treat naive datetime strings (no timezone offset) as Cairo time (UTC+3)
  const parseCairoTime = (dt: string) => {
    if (/[Z+\-]\d{2}:?\d{2}$/.test(dt) || dt.endsWith("Z")) return new Date(dt);
    return new Date(`${dt}:00+03:00`.replace(/:00:00\+/, ":00+"));
  };

  const [trip] = await db.insert(tripsTable).values({
    ...parsed.data,
    departureTime: parseCairoTime(parsed.data.departureTime),
    arrivalTime: parseCairoTime(parsed.data.arrivalTime),
    price: String(parsed.data.price),
    totalSeats: bus[0].capacity,
    availableSeats: bus[0].capacity,
  }).returning();

  res.status(201).json(formatTrip(trip as Record<string, unknown>));
});

router.get("/trips/:id", async (req, res): Promise<void> => {
  const params = GetTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, params.data.id));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  res.json(formatTrip(trip as Record<string, unknown>));
});

router.patch("/trips/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTripBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const parseCairoTime = (dt: string) => {
    if (/[Z+\-]\d{2}:?\d{2}$/.test(dt) || dt.endsWith("Z")) return new Date(dt);
    return new Date(`${dt}:00+03:00`.replace(/:00:00\+/, ":00+"));
  };

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.departureTime) updateData.departureTime = parseCairoTime(parsed.data.departureTime);
  if (parsed.data.arrivalTime) updateData.arrivalTime = parseCairoTime(parsed.data.arrivalTime);
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);

  const [updated] = await db.update(tripsTable).set(updateData).where(eq(tripsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Trip not found" }); return; }
  res.json(formatTrip(updated as Record<string, unknown>));
});

// ─── Helper: refund all confirmed/pending bookings for a trip ─────────────────
async function refundTripBookings(tx: typeof db, tripId: number): Promise<void> {
  const affectedBookings = await tx
    .select({
      id: bookingsTable.id,
      userId: bookingsTable.userId,
      totalPrice: bookingsTable.totalPrice,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.tripId, tripId),
        inArray(bookingsTable.status, ["confirmed", "pending"]),
      ),
    );

  if (affectedBookings.length === 0) return;

  for (const booking of affectedBookings) {
    const refundAmount = String(booking.totalPrice);

    // Refund wallet balance
    await tx
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance + ${refundAmount}` })
      .where(eq(usersTable.id, booking.userId));

    // Create wallet transaction record
    await tx.insert(walletTransactionsTable).values({
      userId: booking.userId,
      amount: refundAmount,
      type: "refund",
      description: "Trip cancelled by admin - refund / تم إلغاء الرحلة من قبل الإدارة - استرداد المبلغ",
    });

    // Update booking status to cancelled
    await tx
      .update(bookingsTable)
      .set({ status: "cancelled" })
      .where(eq(bookingsTable.id, booking.id));

    // Create notification for passenger
    await tx.insert(notificationsTable).values({
      userId: booking.userId,
      title: "Trip Cancelled / تم إلغاء الرحلة",
      body: "Your trip has been cancelled and your money has been refunded. / تم إلغاء رحلتك وتم استرداد المبلغ.",
    });
  }
}

router.patch("/trips/:id/cancel", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = CancelTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  let updatedTrip: ReturnType<typeof formatTrip> | null = null;

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tripsTable)
      .set({ status: "cancelled" })
      .where(eq(tripsTable.id, params.data.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    await refundTripBookings(tx as unknown as typeof db, params.data.id);

    updatedTrip = formatTrip(updated as Record<string, unknown>);
  });

  if (updatedTrip) {
    res.json(updatedTrip);
  }
});

const BulkCreateTripsBody = z.object({
  routeId:       z.number().int().positive(),
  busId:         z.number().int().positive(),
  driverId:      z.number().int().positive().optional(),
  departureHHMM: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  arrivalHHMM:   z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  price:         z.number().min(0),
  vehicleType:   z.enum(["hiace", "minibus"]).default("hiace"),
  startDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  endDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  daysOfWeek:    z.array(z.number().int().min(0).max(6)),
  skipExisting:  z.boolean().default(true),
});

router.post("/admin/trips/bulk", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = BulkCreateTripsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { routeId, busId, driverId, departureHHMM, arrivalHHMM, price, vehicleType, startDate, endDate, daysOfWeek, skipExisting } = parsed.data;

  const [bus] = await db.select({ capacity: busesTable.capacity }).from(busesTable).where(eq(busesTable.id, busId));
  if (!bus) { res.status(404).json({ error: "Bus not found" }); return; }

  const rangeStart = new Date(startDate + "T00:00:00Z");
  const rangeEnd   = new Date(endDate   + "T00:00:00Z");
  if (rangeStart > rangeEnd) { res.status(400).json({ error: "startDate must be on or before endDate" }); return; }

  const daysDiff = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000);
  if (daysDiff > 365) { res.status(400).json({ error: "Date range cannot exceed 365 days" }); return; }

  // Build list of (departureTime, arrivalTime) pairs — all Cairo times (UTC+3)
  const toInsert: { departureTime: Date; arrivalTime: Date }[] = [];
  const cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    const dow = cur.getUTCDay(); // 0=Sun … 6=Sat
    if (daysOfWeek.length === 0 || daysOfWeek.includes(dow)) {
      const dateStr = cur.toISOString().slice(0, 10);
      const dep = new Date(`${dateStr}T${departureHHMM}:00+03:00`);
      const arr = new Date(`${dateStr}T${arrivalHHMM}:00+03:00`);
      // If arrival ≤ departure it crosses midnight — shift arrival to next day
      const finalArr = arr <= dep ? new Date(arr.getTime() + 86_400_000) : arr;
      toInsert.push({ departureTime: dep, arrivalTime: finalArr });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  if (toInsert.length === 0) { res.json({ created: 0, skipped: 0 }); return; }

  let toCreate = toInsert;
  let skipped  = 0;

  if (skipExisting) {
    const existing = await db
      .select({ departureTime: tripsTable.departureTime })
      .from(tripsTable)
      .where(and(
        eq(tripsTable.routeId, routeId),
        gte(tripsTable.departureTime, toInsert[0]!.departureTime),
        lte(tripsTable.departureTime, toInsert[toInsert.length - 1]!.departureTime),
      ));
    const existingSet = new Set(existing.map(e => e.departureTime.toISOString()));
    toCreate = toInsert.filter(t => !existingSet.has(t.departureTime.toISOString()));
    skipped  = toInsert.length - toCreate.length;
  }

  if (toCreate.length === 0) { res.json({ created: 0, skipped }); return; }

  const BATCH = 50;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const chunk = toCreate.slice(i, i + BATCH);
    await db.insert(tripsTable).values(
      chunk.map(({ departureTime, arrivalTime }) => ({
        routeId,
        busId,
        ...(driverId ? { driverId } : {}),
        departureTime,
        arrivalTime,
        price: String(price),
        totalSeats: bus.capacity,
        availableSeats: bus.capacity,
        vehicleType,
        status: "scheduled" as const,
        recurringType: "one_time" as const,
      })),
    );
  }

  res.json({ created: toCreate.length, skipped });
});

router.delete("/trips/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  await db.transaction(async (tx) => {
    const [trip] = await tx
      .select({ id: tripsTable.id, status: tripsTable.status })
      .from(tripsTable)
      .where(eq(tripsTable.id, id));

    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
    if (trip.status === "active") { res.status(400).json({ error: "Cannot delete an active trip. Cancel it first." }); return; }

    // Refund all confirmed/pending bookings before deletion
    await refundTripBookings(tx as unknown as typeof db, id);

    await tx.delete(bookingsTable).where(eq(bookingsTable.tripId, id));
    await tx.delete(tripsTable).where(eq(tripsTable.id, id));

    res.sendStatus(204);
  });
});

export default router;
