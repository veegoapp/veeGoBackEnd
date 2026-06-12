import { Router } from "express";
import { db, driverBonusTargetsTable, driverBonusProgressTable, driversTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

function fmtTarget(t: Record<string, unknown>) {
  return {
    ...t,
    targetValue: typeof t.targetValue === "string" ? parseFloat(t.targetValue as string) : t.targetValue,
    bonusAmount: typeof t.bonusAmount === "string" ? parseFloat(t.bonusAmount as string) : t.bonusAmount,
  };
}

function fmtProgress(p: Record<string, unknown>) {
  return {
    ...p,
    currentValue: typeof p.currentValue === "string" ? parseFloat(p.currentValue as string) : p.currentValue,
  };
}

const CreateBonusTargetBody = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  serviceType: z.enum(["all", "car", "bike", "delivery", "scooter", "shuttle", "ride"]).default("all"),
  targetType: z.enum(["ride_count", "earnings_amount"]),
  targetValue: z.number().positive(),
  bonusAmount: z.number().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const UpdateBonusTargetBody = z.object({
  name: z.string().min(1).optional(),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  serviceType: z.enum(["all", "car", "bike", "delivery", "scooter", "shuttle", "ride"]).optional(),
  targetType: z.enum(["ride_count", "earnings_amount"]).optional(),
  targetValue: z.number().positive().optional(),
  bonusAmount: z.number().positive().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

// ─── ADMIN: list all targets with enrollment + completion stats ───────────────
router.get("/admin/bonus-targets", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const targets = await db
    .select()
    .from(driverBonusTargetsTable)
    .where(eq(driverBonusTargetsTable.isDeleted, false))
    .orderBy(desc(driverBonusTargetsTable.createdAt));

  const stats = await db.execute(sql`
    SELECT
      target_id,
      COUNT(*)::int            AS drivers_enrolled,
      SUM(CASE WHEN is_completed THEN 1 ELSE 0 END)::int AS drivers_completed
    FROM driver_bonus_progress
    GROUP BY target_id
  `);

  const statsMap = new Map(
    (stats.rows as { target_id: number; drivers_enrolled: number; drivers_completed: number }[]).map((r) => [
      r.target_id,
      { driversEnrolled: r.drivers_enrolled, driversCompleted: r.drivers_completed },
    ]),
  );

  res.json({
    data: targets.filter(t => !t.isDeleted).map((t) => ({
      ...fmtTarget(t as Record<string, unknown>),
      ...(statsMap.get(t.id) ?? { driversEnrolled: 0, driversCompleted: 0 }),
    })),
  });
});

// ─── ADMIN: create target ─────────────────────────────────────────────────────
router.post("/admin/bonus-targets", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateBonusTargetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

  const [target] = await db
    .insert(driverBonusTargetsTable)
    .values({
      ...parsed.data,
      targetValue: String(parsed.data.targetValue),
      bonusAmount: String(parsed.data.bonusAmount),
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
    })
    .returning();

  res.status(201).json(fmtTarget(target as Record<string, unknown>));
});

// ─── ADMIN: update target ─────────────────────────────────────────────────────
router.patch("/admin/bonus-targets/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateBonusTargetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.targetValue !== undefined) updateData.targetValue = String(parsed.data.targetValue);
  if (parsed.data.bonusAmount !== undefined) updateData.bonusAmount = String(parsed.data.bonusAmount);
  if (parsed.data.startsAt !== undefined) updateData.startsAt = new Date(parsed.data.startsAt);
  if (parsed.data.endsAt !== undefined) updateData.endsAt = new Date(parsed.data.endsAt);

  const [updated] = await db
    .update(driverBonusTargetsTable)
    .set(updateData)
    .where(and(eq(driverBonusTargetsTable.id, id), eq(driverBonusTargetsTable.isDeleted, false)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Bonus target not found" }); return; }
  res.json(fmtTarget(updated as Record<string, unknown>));
});

// ─── ADMIN: soft delete target ────────────────────────────────────────────────
router.delete("/admin/bonus-targets/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .update(driverBonusTargetsTable)
    .set({ isDeleted: true, isActive: false })
    .where(and(eq(driverBonusTargetsTable.id, id), eq(driverBonusTargetsTable.isDeleted, false)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Bonus target not found" }); return; }
  res.json({ success: true, id });
});

// ─── ADMIN: per-driver progress for a target ─────────────────────────────────
router.get("/admin/bonus-targets/:id/progress", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [target] = await db
    .select()
    .from(driverBonusTargetsTable)
    .where(eq(driverBonusTargetsTable.id, id));
  if (!target) { res.status(404).json({ error: "Bonus target not found" }); return; }

  const progress = await db.execute(sql`
    SELECT
      p.id,
      p.driver_id   AS "driverId",
      d.name        AS "driverName",
      d.phone       AS "driverPhone",
      p.current_value::float AS "currentValue",
      p.is_completed AS "isCompleted",
      p.completed_at AS "completedAt",
      p.updated_at   AS "updatedAt"
    FROM driver_bonus_progress p
    JOIN drivers d ON d.id = p.driver_id
    WHERE p.target_id = ${id}
    ORDER BY p.current_value DESC
  `);

  res.json({ target: fmtTarget(target as Record<string, unknown>), progress: progress.rows });
});

// ─── ADMIN: all bonus progress for a specific driver ─────────────────────────
router.get("/admin/drivers/:id/bonus-progress", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const driverId = parseInt(req.params.id as string);
  if (isNaN(driverId)) { res.status(400).json({ error: "Invalid driver id" }); return; }

  const [driver] = await db.select({ id: driversTable.id, name: driversTable.name }).from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  const progress = await db.execute(sql`
    SELECT
      p.id,
      p.target_id   AS "targetId",
      t.name        AS "targetName",
      t.target_type AS "targetType",
      t.target_value::float  AS "targetValue",
      t.bonus_amount::float  AS "bonusAmount",
      t.service_type AS "serviceType",
      t.starts_at    AS "startsAt",
      t.ends_at      AS "endsAt",
      t.is_active    AS "isActive",
      p.current_value::float AS "currentValue",
      p.is_completed  AS "isCompleted",
      p.completed_at  AS "completedAt"
    FROM driver_bonus_progress p
    JOIN driver_bonus_targets t ON t.id = p.target_id
    WHERE p.driver_id = ${driverId}
    ORDER BY p.updated_at DESC
  `);

  res.json({ driver, progress: progress.rows });
});

// ─── DRIVER: active targets with my current progress ─────────────────────────
router.get("/driver/bonus-targets", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, userId));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const now = new Date();
  const rows = await db.execute(sql`
    SELECT
      t.id,
      t.name,
      t.description,
      t.service_type  AS "serviceType",
      t.target_type   AS "targetType",
      t.target_value::float  AS "targetValue",
      t.bonus_amount::float  AS "bonusAmount",
      t.starts_at     AS "startsAt",
      t.ends_at       AS "endsAt",
      COALESCE(p.current_value::float, 0) AS "currentValue",
      COALESCE(p.is_completed, false)     AS "isCompleted",
      p.completed_at                      AS "completedAt"
    FROM driver_bonus_targets t
    LEFT JOIN driver_bonus_progress p
      ON p.target_id = t.id AND p.driver_id = ${driver.id}
    WHERE t.is_active = true
      AND t.is_deleted = false
      AND t.starts_at <= ${now}
      AND t.ends_at   >= ${now}
    ORDER BY t.ends_at ASC
  `);

  res.json({ data: rows.rows });
});

export default router;
