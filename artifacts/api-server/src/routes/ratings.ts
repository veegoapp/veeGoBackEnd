import { Router } from "express";
import { db, ratingsTable, usersTable, driversTable } from "@workspace/db";
import { eq, desc, and, sql, gte, lte, avg } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { writeAuditLog } from "../lib/auditLog";
import { z } from "zod";

const router = Router();

// ─── Query helpers ────────────────────────────────────────────────────────────

const ListRatingsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  driverId: z.coerce.number().int().positive().optional(),
  raterId: z.coerce.number().int().positive().optional(),
  context: z.enum(["trip", "ride"]).optional(),
  minScore: z.coerce.number().min(1).max(5).optional(),
  maxScore: z.coerce.number().min(1).max(5).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

// ─── GET /admin/ratings ───────────────────────────────────────────────────────

router.get("/admin/ratings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListRatingsQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { page, limit, driverId, raterId, context, minScore, maxScore, from, to } = parsed.data;
  const offset = (page - 1) * limit;

  const rater = usersTable as typeof usersTable & { __alias?: string };
  const raterAlias = db.$with("rater").as(db.select().from(usersTable));

  const conditions = [];
  if (driverId)  conditions.push(eq(ratingsTable.driverId, driverId));
  if (raterId)   conditions.push(eq(ratingsTable.raterId, raterId));
  if (context)   conditions.push(eq(ratingsTable.context, context));
  if (minScore)  conditions.push(sql`${ratingsTable.score}::numeric >= ${minScore}`);
  if (maxScore)  conditions.push(sql`${ratingsTable.score}::numeric <= ${maxScore}`);
  if (from)      conditions.push(gte(ratingsTable.createdAt, new Date(from)));
  if (to)        conditions.push(lte(ratingsTable.createdAt, new Date(to)));

  const where = conditions.length ? and(...conditions) : undefined;

  const raterUser = db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
  }).from(usersTable).as("rater_u");

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: ratingsTable.id,
        raterId: ratingsTable.raterId,
        driverId: ratingsTable.driverId,
        tripId: ratingsTable.tripId,
        rideId: ratingsTable.rideId,
        context: ratingsTable.context,
        score: ratingsTable.score,
        comment: ratingsTable.comment,
        createdAt: ratingsTable.createdAt,
        raterName: sql<string>`rater_u.name`,
        raterEmail: sql<string>`rater_u.email`,
        driverName: driversTable.name,
        driverPhone: driversTable.phone,
        driverRating: driversTable.rating,
      })
      .from(ratingsTable)
      .leftJoin(sql`users rater_u ON rater_u.id = ${ratingsTable.raterId}`)
      .leftJoin(driversTable, eq(ratingsTable.driverId, driversTable.id))
      .where(where)
      .orderBy(desc(ratingsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(ratingsTable)
      .where(where),
  ]);

  res.json({ data: rows, total: countResult[0].count, page, limit });
});

// ─── GET /admin/ratings/stats ─────────────────────────────────────────────────

router.get("/admin/ratings/stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const [overall, byScore] = await Promise.all([
    db.select({
      total: sql<number>`count(*)::int`,
      avgScore: sql<number>`round(avg(score::numeric), 2)`,
      tripCount: sql<number>`count(*) filter (where context = 'trip')::int`,
      rideCount: sql<number>`count(*) filter (where context = 'ride')::int`,
    }).from(ratingsTable),
    db.select({
      score: sql<number>`round(score::numeric)::int`,
      count: sql<number>`count(*)::int`,
    })
      .from(ratingsTable)
      .groupBy(sql`round(score::numeric)`)
      .orderBy(sql`round(score::numeric) desc`),
  ]);

  res.json({ ...overall[0], distribution: byScore });
});

// ─── GET /admin/ratings/:id ───────────────────────────────────────────────────

router.get("/admin/ratings/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid rating ID" }); return; }

  const [row] = await db
    .select({
      id: ratingsTable.id,
      raterId: ratingsTable.raterId,
      driverId: ratingsTable.driverId,
      tripId: ratingsTable.tripId,
      rideId: ratingsTable.rideId,
      context: ratingsTable.context,
      score: ratingsTable.score,
      comment: ratingsTable.comment,
      createdAt: ratingsTable.createdAt,
      raterName: sql<string>`rater_u.name`,
      raterEmail: sql<string>`rater_u.email`,
      driverName: driversTable.name,
      driverPhone: driversTable.phone,
    })
    .from(ratingsTable)
    .leftJoin(sql`users rater_u ON rater_u.id = ${ratingsTable.raterId}`)
    .leftJoin(driversTable, eq(ratingsTable.driverId, driversTable.id))
    .where(eq(ratingsTable.id, id));

  if (!row) { res.status(404).json({ error: "Rating not found" }); return; }
  res.json(row);
});

// ─── DELETE /admin/ratings/:id ────────────────────────────────────────────────

router.delete("/admin/ratings/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid rating ID" }); return; }

  const [deleted] = await db
    .delete(ratingsTable)
    .where(eq(ratingsTable.id, id))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Rating not found" }); return; }

  void writeAuditLog(req, "DELETE", "rating", id, deleted, null);

  res.sendStatus(204);
});

// ─── USER: GET their own ratings given ───────────────────────────────────────

router.get("/user/ratings/given", authenticate, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: ratingsTable.id,
      driverId: ratingsTable.driverId,
      tripId: ratingsTable.tripId,
      rideId: ratingsTable.rideId,
      context: ratingsTable.context,
      score: ratingsTable.score,
      comment: ratingsTable.comment,
      createdAt: ratingsTable.createdAt,
      driverName: driversTable.name,
    })
    .from(ratingsTable)
    .leftJoin(driversTable, eq(ratingsTable.driverId, driversTable.id))
    .where(eq(ratingsTable.raterId, req.user!.id))
    .orderBy(desc(ratingsTable.createdAt));

  res.json({ data: rows, total: rows.length });
});

export default router;
