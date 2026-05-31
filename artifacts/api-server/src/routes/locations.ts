import { Router } from "express";
import { db, driverLocationsTable, userLocationsTable, driversTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

// ─── DRIVER LOCATIONS (admin read) ───────────────────────────────────────────

const DriverLocationQuery = z.object({
  driverId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get("/admin/driver-locations", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = DriverLocationQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { driverId, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(driverLocationsTable)
      .where(eq(driverLocationsTable.driverId, driverId))
      .orderBy(desc(driverLocationsTable.recordedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(driverLocationsTable)
      .where(eq(driverLocationsTable.driverId, driverId)),
  ]);

  res.json({ data: rows, total: countResult[0].count, page, limit });
});

// Latest single location for a driver
router.get("/admin/driver-locations/:driverId/latest", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const driverId = parseInt(req.params.driverId as string);
  if (isNaN(driverId)) { res.status(400).json({ error: "Invalid driver ID" }); return; }

  const [row] = await db
    .select()
    .from(driverLocationsTable)
    .where(eq(driverLocationsTable.driverId, driverId))
    .orderBy(desc(driverLocationsTable.recordedAt))
    .limit(1);

  if (!row) { res.status(404).json({ error: "No location history found for this driver" }); return; }
  res.json(row);
});

// ─── USER LOCATIONS (admin read) ─────────────────────────────────────────────

const UserLocationQuery = z.object({
  userId: z.coerce.number().int().positive(),
});

const UserLocationIdParam = z.object({ id: z.coerce.number().int().positive() });

router.get("/admin/user-locations", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = UserLocationQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const rows = await db
    .select()
    .from(userLocationsTable)
    .where(eq(userLocationsTable.userId, parsed.data.userId))
    .orderBy(desc(userLocationsTable.isDefault), userLocationsTable.createdAt);

  res.json({ data: rows, total: rows.length });
});

// ─── USER LOCATIONS (user self-service) ──────────────────────────────────────

const CreateUserLocationBody = z.object({
  label: z.enum(["home", "work", "other"]).default("other"),
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});

const UpdateUserLocationBody = CreateUserLocationBody.partial();

router.get("/user/locations", authenticate, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(userLocationsTable)
    .where(eq(userLocationsTable.userId, req.user!.id))
    .orderBy(desc(userLocationsTable.isDefault), userLocationsTable.createdAt);
  res.json({ data: rows, total: rows.length });
});

router.post("/user/locations", authenticate, async (req, res): Promise<void> => {
  const parsed = CreateUserLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.isDefault) {
    await db
      .update(userLocationsTable)
      .set({ isDefault: false })
      .where(eq(userLocationsTable.userId, req.user!.id));
  }

  const [location] = await db
    .insert(userLocationsTable)
    .values({ ...parsed.data, userId: req.user!.id })
    .returning();

  res.status(201).json(location);
});

router.patch("/user/locations/:id", authenticate, async (req, res): Promise<void> => {
  const params = UserLocationIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateUserLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.isDefault) {
    await db
      .update(userLocationsTable)
      .set({ isDefault: false })
      .where(eq(userLocationsTable.userId, req.user!.id));
  }

  const [updated] = await db
    .update(userLocationsTable)
    .set(parsed.data)
    .where(and(
      eq(userLocationsTable.id, params.data.id),
      eq(userLocationsTable.userId, req.user!.id),
    ))
    .returning();

  if (!updated) { res.status(404).json({ error: "Location not found" }); return; }
  res.json(updated);
});

router.delete("/user/locations/:id", authenticate, async (req, res): Promise<void> => {
  const params = UserLocationIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db
    .delete(userLocationsTable)
    .where(and(
      eq(userLocationsTable.id, params.data.id),
      eq(userLocationsTable.userId, req.user!.id),
    ))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Location not found" }); return; }
  res.sendStatus(204);
});

export default router;
