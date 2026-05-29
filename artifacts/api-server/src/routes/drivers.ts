import { Router } from "express";
import { db, driversTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import {
  ListDriversQueryParams,
  GetDriverParams,
  CreateDriverBody,
  UpdateDriverParams,
  UpdateDriverBody,
  DeleteDriverParams,
  UpdateDriverLocationBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/drivers", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListDriversQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;
  const [data, countResult] = await Promise.all([
    db.select().from(driversTable)
      .where(eq(driversTable.isActive, true))
      .limit(limit).offset(offset).orderBy(driversTable.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(driversTable)
      .where(eq(driversTable.isActive, true)),
  ]);
  res.json({
    data: data.map(d => ({ ...d, rating: parseFloat(d.rating) })),
    total: countResult[0].count,
    page,
    limit,
  });
});

router.post("/drivers", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [driver] = await db.insert(driversTable).values(parsed.data).returning();
  res.status(201).json({ ...driver, rating: parseFloat(driver.rating) });
});

// TODO (deprecated): Use GET /driver/me — canonical driver profile endpoint.
router.get("/drivers/me", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select().from(driversTable)
    .where(and(eq(driversTable.userId, req.user!.id), eq(driversTable.isActive, true)));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }
  res.json({ ...driver, rating: parseFloat(driver.rating) });
});

// TODO (deprecated): Use PATCH /driver/location — canonical driver location update endpoint.
router.patch("/drivers/me/location", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const parsed = UpdateDriverLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
    .where(and(eq(driversTable.userId, req.user!.id), eq(driversTable.isActive, true)));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }
  const [updated] = await db.update(driversTable).set({
    currentLatitude: parsed.data.latitude,
    currentLongitude: parsed.data.longitude,
  }).where(eq(driversTable.id, driver.id)).returning();
  res.json({ ...updated, rating: parseFloat(updated.rating) });
});

router.get("/drivers/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = GetDriverParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [driver] = await db.select().from(driversTable)
    .where(and(eq(driversTable.id, params.data.id), eq(driversTable.isActive, true)));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  res.json({ ...driver, rating: parseFloat(driver.rating) });
});

router.patch("/drivers/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateDriverParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(driversTable).set(parsed.data)
    .where(and(eq(driversTable.id, params.data.id), eq(driversTable.isActive, true))).returning();
  if (!updated) { res.status(404).json({ error: "Driver not found" }); return; }
  res.json({ ...updated, rating: parseFloat(updated.rating) });
});

// Soft delete — sets isActive=false instead of destroying the record
router.delete("/drivers/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteDriverParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [archived] = await db.update(driversTable)
    .set({ isActive: false, status: "suspended" })
    .where(and(eq(driversTable.id, params.data.id), eq(driversTable.isActive, true)))
    .returning({ id: driversTable.id });
  if (!archived) { res.status(404).json({ error: "Driver not found" }); return; }
  res.sendStatus(204);
});

export default router;
