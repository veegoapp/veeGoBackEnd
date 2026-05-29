import { Router } from "express";
import { db, zonesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const ZoneBody = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(500).default(5),
  services: z.array(z.enum(["car", "shuttle", "bike"])).default([]),
  isActive: z.boolean().default(true),
});

const ZoneIdParam = z.object({ id: z.coerce.number().int().positive() });

router.get("/zones", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 100);
    const offset = (page - 1) * limit;
    const [data, countResult] = await Promise.all([
      db.select().from(zonesTable).limit(limit).offset(offset).orderBy(zonesTable.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(zonesTable),
    ]);
    res.json({ data, total: countResult[0].count, page, limit });
  } catch (err) {
    res.status(500).json({ error: "Failed to list zones" });
  }
});

router.post("/zones", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ZoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [zone] = await db.insert(zonesTable).values(parsed.data).returning();
    res.status(201).json(zone);
  } catch (err) {
    res.status(500).json({ error: "Failed to create zone" });
  }
});

router.get("/zones/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ZoneIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid zone id" }); return; }
  const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, params.data.id));
  if (!zone) { res.status(404).json({ error: "Zone not found" }); return; }
  res.json(zone);
});

router.patch("/zones/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ZoneIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid zone id" }); return; }
  const parsed = ZoneBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [updated] = await db
      .update(zonesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(zonesTable.id, params.data.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Zone not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update zone" });
  }
});

router.delete("/zones/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ZoneIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid zone id" }); return; }
  const [deleted] = await db.delete(zonesTable).where(eq(zonesTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Zone not found" }); return; }
  res.sendStatus(204);
});

export default router;
