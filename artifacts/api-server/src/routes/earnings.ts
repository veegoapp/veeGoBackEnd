import { Router } from "express";
import { db, driverEarningsTable, driversTable, tripsTable, routesTable } from "@workspace/db";
import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

function fmtEarning(e: Record<string, unknown>) {
  return { ...e, amount: typeof e.amount === "string" ? parseFloat(e.amount as string) : e.amount };
}

// ─── GET /earnings/summary ─────────────────────────────────────────────────────
// Admin: overall earnings summary across all drivers.
// Driver: their own earnings summary.
router.get("/earnings/summary", authenticate, async (req, res): Promise<void> => {
  const role = req.user!.role;

  if (role === "admin") {
    const [totals, byStatus, topDrivers] = await Promise.all([
      db.select({
        totalEarnings: sql<number>`COALESCE(SUM(amount), 0)::float`,
        totalPaid:     sql<number>`COALESCE(SUM(CASE WHEN status = 'paid'      THEN amount ELSE 0 END), 0)::float`,
        totalPending:  sql<number>`COALESCE(SUM(CASE WHEN status = 'pending'   THEN amount ELSE 0 END), 0)::float`,
        totalConfirmed:sql<number>`COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0)::float`,
        totalRecords:  sql<number>`COUNT(*)::int`,
      }).from(driverEarningsTable),

      db.select({
        status: driverEarningsTable.status,
        count:  sql<number>`COUNT(*)::int`,
        total:  sql<number>`COALESCE(SUM(amount), 0)::float`,
      }).from(driverEarningsTable).groupBy(driverEarningsTable.status),

      db.execute(sql`
        SELECT
          d.id            AS "driverId",
          d.name          AS "driverName",
          COUNT(e.id)::int AS "tripCount",
          COALESCE(SUM(e.amount), 0)::float AS "totalEarned",
          COALESCE(SUM(CASE WHEN e.status = 'paid' THEN e.amount ELSE 0 END), 0)::float AS "totalPaid"
        FROM driver_earnings e
        JOIN drivers d ON d.id = e.driver_id
        GROUP BY d.id, d.name
        ORDER BY "totalEarned" DESC
        LIMIT 10
      `),
    ]);

    res.json({
      summary: totals[0],
      byStatus,
      topDrivers: topDrivers.rows,
    });
    return;
  }

  // Driver: own summary
  const [driver] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, req.user!.id));

  if (!driver) {
    res.status(404).json({ error: "Driver profile not found" });
    return;
  }

  const [totals, byStatus, recent] = await Promise.all([
    db.select({
      totalEarnings:  sql<number>`COALESCE(SUM(amount), 0)::float`,
      totalPaid:      sql<number>`COALESCE(SUM(CASE WHEN status = 'paid'      THEN amount ELSE 0 END), 0)::float`,
      totalPending:   sql<number>`COALESCE(SUM(CASE WHEN status = 'pending'   THEN amount ELSE 0 END), 0)::float`,
      totalConfirmed: sql<number>`COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0)::float`,
      totalRecords:   sql<number>`COUNT(*)::int`,
    }).from(driverEarningsTable).where(eq(driverEarningsTable.driverId, driver.id)),

    db.select({
      status: driverEarningsTable.status,
      count:  sql<number>`COUNT(*)::int`,
      total:  sql<number>`COALESCE(SUM(amount), 0)::float`,
    }).from(driverEarningsTable)
      .where(eq(driverEarningsTable.driverId, driver.id))
      .groupBy(driverEarningsTable.status),

    db.select({
      id:        driverEarningsTable.id,
      amount:    driverEarningsTable.amount,
      status:    driverEarningsTable.status,
      date:      driverEarningsTable.date,
      tripId:    driverEarningsTable.tripId,
      createdAt: driverEarningsTable.createdAt,
    }).from(driverEarningsTable)
      .where(eq(driverEarningsTable.driverId, driver.id))
      .orderBy(desc(driverEarningsTable.createdAt))
      .limit(10),
  ]);

  res.json({
    driverId: driver.id,
    summary: totals[0],
    byStatus,
    recentEarnings: recent.map(e => fmtEarning(e as Record<string, unknown>)),
  });
});

// ─── GET /earnings/weekly ──────────────────────────────────────────────────────
// Admin: weekly earnings breakdown for all drivers over the past N weeks.
// Driver: their own weekly breakdown.
// Query params:
//   weeks  (int, default 8)  — how many past weeks to include
//   driverId (int, admin only) — filter to a specific driver
const WeeklyQuerySchema = z.object({
  weeks:    z.coerce.number().int().min(1).max(52).default(8),
  driverId: z.coerce.number().int().positive().optional(),
});

router.get("/earnings/weekly", authenticate, async (req, res): Promise<void> => {
  const parsed = WeeklyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid query" });
    return;
  }

  const { weeks, driverId: queryDriverId } = parsed.data;
  const role = req.user!.role;

  let targetDriverId: number | null = null;

  if (role === "driver") {
    const [driver] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, req.user!.id));
    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }
    targetDriverId = driver.id;
  } else if (role === "admin" && queryDriverId) {
    targetDriverId = queryDriverId;
  }

  const driverFilter = targetDriverId
    ? sql`AND driver_id = ${targetDriverId}`
    : sql``;

  const weeklyRows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('week', date), 'YYYY-MM-DD') AS week_start,
      COUNT(*)::int                                    AS trip_count,
      COALESCE(SUM(amount), 0)::float                  AS total_earned,
      COALESCE(SUM(CASE WHEN status = 'paid'      THEN amount ELSE 0 END), 0)::float AS paid,
      COALESCE(SUM(CASE WHEN status = 'pending'   THEN amount ELSE 0 END), 0)::float AS pending,
      COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0)::float AS confirmed
    FROM driver_earnings
    WHERE date >= NOW() - (${weeks} || ' weeks')::interval
    ${driverFilter}
    GROUP BY DATE_TRUNC('week', date)
    ORDER BY week_start ASC
  `);

  // Admin without a driverId filter: also include per-driver breakdown
  let driverBreakdown = null;
  if (role === "admin" && !queryDriverId) {
    const breakdown = await db.execute(sql`
      SELECT
        d.id   AS "driverId",
        d.name AS "driverName",
        COALESCE(SUM(e.amount), 0)::float AS "totalEarned",
        COUNT(e.id)::int                  AS "tripCount"
      FROM driver_earnings e
      JOIN drivers d ON d.id = e.driver_id
      WHERE e.date >= NOW() - (${weeks} || ' weeks')::interval
      GROUP BY d.id, d.name
      ORDER BY "totalEarned" DESC
    `);
    driverBreakdown = breakdown.rows;
  }

  res.json({
    weeks,
    driverId: targetDriverId,
    weeklyBreakdown: weeklyRows.rows,
    ...(driverBreakdown !== null ? { driverBreakdown } : {}),
  });
});

// ─── GET /earnings (admin: paginated list of all earnings records) ─────────────
const ListEarningsQuery = z.object({
  driverId: z.coerce.number().int().positive().optional(),
  status:   z.enum(["pending", "confirmed", "paid"]).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

router.get("/earnings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListEarningsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid query" });
    return;
  }

  const { driverId, status, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (driverId) conditions.push(eq(driverEarningsTable.driverId, driverId));
  if (status)   conditions.push(eq(driverEarningsTable.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select({
      id:         driverEarningsTable.id,
      driverId:   driverEarningsTable.driverId,
      tripId:     driverEarningsTable.tripId,
      amount:     driverEarningsTable.amount,
      status:     driverEarningsTable.status,
      date:       driverEarningsTable.date,
      createdAt:  driverEarningsTable.createdAt,
      driverName: driversTable.name,
      driverPhone:driversTable.phone,
    })
      .from(driverEarningsTable)
      .leftJoin(driversTable, eq(driverEarningsTable.driverId, driversTable.id))
      .where(where)
      .orderBy(desc(driverEarningsTable.createdAt))
      .limit(limit)
      .offset(offset),

    db.select({ count: sql<number>`count(*)::int` })
      .from(driverEarningsTable)
      .where(where),
  ]);

  res.json({
    data: rows.map(r => fmtEarning(r as Record<string, unknown>)),
    total: countResult[0].count,
    page,
    limit,
  });
});

// ─── PATCH /earnings/:id/status (admin: mark as paid/confirmed) ───────────────
const UpdateEarningStatusBody = z.object({
  status: z.enum(["confirmed", "paid"]),
});

router.patch("/earnings/:id/status", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid earning ID" }); return; }

  const parsed = UpdateEarningStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid status" }); return; }

  const [updated] = await db
    .update(driverEarningsTable)
    .set({ status: parsed.data.status })
    .where(eq(driverEarningsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Earning record not found" }); return; }
  res.json(fmtEarning(updated as Record<string, unknown>));
});

export default router;
