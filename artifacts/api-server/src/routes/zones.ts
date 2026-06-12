import { Router } from "express";
import { db, zonesTable, serviceControlsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { writeAuditLog, getClientIp } from "../lib/auditLog";
import { z } from "zod";

const router = Router();

const ZoneBody = z.object({
  name: z.string().min(1, "Name is required"),
  nameAr: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionAr: z.string().optional().nullable(),
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
  } catch {
    res.status(500).json({ error: "Failed to list zones" });
  }
});

router.post("/zones", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ZoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [zone] = await db.insert(zonesTable).values(parsed.data).returning();
    void writeAuditLog({
      userId: req.user?.id,
      action: "CREATE",
      entityType: "zone",
      entityId: zone.id,
      newData: zone as unknown as Record<string, unknown>,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(201).json(zone);
  } catch {
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
    const [existing] = await db.select().from(zonesTable).where(eq(zonesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Zone not found" }); return; }
    const [updated] = await db
      .update(zonesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(zonesTable.id, params.data.id))
      .returning();
    void writeAuditLog({
      userId: req.user?.id,
      action: "UPDATE",
      entityType: "zone",
      entityId: updated.id,
      oldData: existing as unknown as Record<string, unknown>,
      newData: updated as unknown as Record<string, unknown>,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update zone" });
  }
});

router.delete("/zones/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ZoneIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid zone id" }); return; }
  try {
    const [deleted] = await db.delete(zonesTable).where(eq(zonesTable.id, params.data.id)).returning();
    if (!deleted) { res.status(404).json({ error: "Zone not found" }); return; }

    // Cleanup: remove this zone's ID from activeZoneIds in all service_controls rows
    await db.execute(
      sql`UPDATE service_controls SET active_zone_ids = array_remove(active_zone_ids, ${params.data.id}::integer)`
    );

    void writeAuditLog({
      userId: req.user?.id,
      action: "DELETE",
      entityType: "zone",
      entityId: deleted.id,
      oldData: deleted as unknown as Record<string, unknown>,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.sendStatus(204);
  } catch {
    res.status(500).json({ error: "Failed to delete zone" });
  }
});

export default router;
