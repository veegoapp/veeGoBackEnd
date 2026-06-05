import { Router } from "express";
import { z } from "zod";
import { db, routesTable, stationsTable, tripsTable, bookingsTable } from "@workspace/db";
import { eq, ilike, and, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import {
  ListRoutesQueryParams,
  GetRouteParams,
  CreateRouteBody,
  UpdateRouteBody,
  UpdateRouteParams,
  DeleteRouteParams,
  GetRouteStationsParams,
  AddStationParams,
  AddStationBody,
  UpdateStationParams,
  UpdateStationBody,
  DeleteStationParams,
} from "@workspace/api-zod";

const router = Router();

const AddStationBodyExt = AddStationBody.extend({
  direction: z.enum(["outbound", "return"]).default("outbound"),
  segmentPrice: z.coerce.number().min(0).nullable().optional(),
});

const UpdateStationBodyExt = UpdateStationBody.extend({
  direction: z.enum(["outbound", "return"]).optional(),
  segmentPrice: z.coerce.number().min(0).nullable().optional(),
});

function stationOut(s: any) {
  return {
    ...s,
    segmentPrice: s.segmentPrice != null ? parseFloat(s.segmentPrice) : null,
  };
}

router.get("/routes", async (req, res): Promise<void> => {
  const search = req.query.search as string | undefined;
  const where = search ? ilike(routesTable.name, `%${search}%`) : undefined;
  const data = await db.select().from(routesTable).where(where).orderBy(routesTable.createdAt);
  res.json({
    data: data.map(r => ({ ...r, basePrice: parseFloat(r.basePrice) })),
    total: data.length,
  });
});

router.post("/routes", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateRouteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [route] = await db.insert(routesTable).values({
    ...parsed.data,
    basePrice: String(parsed.data.basePrice),
  }).returning();
  res.status(201).json({ ...route, basePrice: parseFloat(route.basePrice) });
});

router.get("/routes/:id", async (req, res): Promise<void> => {
  const params = GetRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, params.data.id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  res.json({ ...route, basePrice: parseFloat(route.basePrice) });
});

router.patch("/routes/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateRouteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.basePrice !== undefined) updateData.basePrice = String(parsed.data.basePrice);
  const [updated] = await db.update(routesTable).set(updateData).where(eq(routesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Route not found" }); return; }
  res.json({ ...updated, basePrice: parseFloat(updated.basePrice) });
});

router.delete("/routes/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const routeId = params.data.id;
  // Delete bookings for trips on this route, then delete trips, then delete route
  const trips = await db.select({ id: tripsTable.id }).from(tripsTable).where(eq(tripsTable.routeId, routeId));
  if (trips.length > 0) {
    const tripIds = trips.map(t => t.id);
    await db.delete(bookingsTable).where(inArray(bookingsTable.tripId, tripIds));
    await db.delete(tripsTable).where(eq(tripsTable.routeId, routeId));
  }
  const [deleted] = await db.delete(routesTable).where(eq(routesTable.id, routeId)).returning();
  if (!deleted) { res.status(404).json({ error: "Route not found" }); return; }
  res.sendStatus(204);
});

router.get("/routes/:id/stations", async (req, res): Promise<void> => {
  const params = GetRouteStationsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const stations = await db.select().from(stationsTable)
    .where(eq(stationsTable.routeId, params.data.id))
    .orderBy(stationsTable.order);
  res.json(stations.map(stationOut));
});

router.post("/routes/:id/stations", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = AddStationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AddStationBodyExt.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { segmentPrice, ...rest } = parsed.data;
  const [station] = await db.insert(stationsTable).values({
    ...rest,
    routeId: params.data.id,
    segmentPrice: segmentPrice != null ? String(segmentPrice) : null,
  }).returning();
  res.status(201).json(stationOut(station));
});

router.patch("/routes/:id/stations/:stationId", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateStationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateStationBodyExt.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { segmentPrice, ...rest } = parsed.data;
  const setData: Record<string, unknown> = { ...rest };
  if (segmentPrice !== undefined) setData.segmentPrice = segmentPrice != null ? String(segmentPrice) : null;
  const [updated] = await db.update(stationsTable).set(setData)
    .where(and(eq(stationsTable.id, params.data.stationId), eq(stationsTable.routeId, params.data.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Station not found" }); return; }
  res.json(stationOut(updated));
});

router.delete("/routes/:id/stations/:stationId", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteStationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db.delete(stationsTable)
    .where(and(eq(stationsTable.id, params.data.stationId), eq(stationsTable.routeId, params.data.id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Station not found" }); return; }
  res.sendStatus(204);
});

export default router;
