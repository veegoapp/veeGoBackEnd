import { Router } from "express";
import { db, tripsTable, busesTable, routesTable, driversTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
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

  const [trip] = await db.insert(tripsTable).values({
    ...parsed.data,
    departureTime: new Date(parsed.data.departureTime),
    arrivalTime: new Date(parsed.data.arrivalTime),
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

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.departureTime) updateData.departureTime = new Date(parsed.data.departureTime);
  if (parsed.data.arrivalTime) updateData.arrivalTime = new Date(parsed.data.arrivalTime);
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);

  const [updated] = await db.update(tripsTable).set(updateData).where(eq(tripsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Trip not found" }); return; }
  res.json(formatTrip(updated as Record<string, unknown>));
});

router.patch("/trips/:id/cancel", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = CancelTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [updated] = await db.update(tripsTable).set({ status: "cancelled" }).where(eq(tripsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Trip not found" }); return; }
  res.json(formatTrip(updated as Record<string, unknown>));
});

export default router;
