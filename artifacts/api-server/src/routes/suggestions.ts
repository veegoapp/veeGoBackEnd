import { Router } from "express";
import { db, routeSuggestionsTable, usersTable, driversTable } from "@workspace/db";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const CreateSuggestionBody = z.object({
  type: z.enum(["new_route", "new_station", "route_edit"]),
  title: z.string().min(1),
  description: z.string().min(1),
  startLocation: z.string().optional(),
  endLocation: z.string().optional(),
  userId: z.number().int().optional(),
  driverId: z.number().int().optional(),
});

const ListSuggestionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  type: z.enum(["new_route", "new_station", "route_edit"]).optional(),
  search: z.string().optional(),
});

const UpdateSuggestionBody = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  adminNotes: z.string().optional(),
});

router.get("/suggestions", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListSuggestionsQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page, limit, status, type, search } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (status) conditions.push(eq(routeSuggestionsTable.status, status));
  if (type) conditions.push(eq(routeSuggestionsTable.type, type));
  if (search) conditions.push(ilike(routeSuggestionsTable.title, `%${search}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select({
      suggestion: routeSuggestionsTable,
      userName: usersTable.name,
      userEmail: usersTable.email,
      driverName: driversTable.name,
    })
      .from(routeSuggestionsTable)
      .leftJoin(usersTable, eq(routeSuggestionsTable.userId, usersTable.id))
      .leftJoin(driversTable, eq(routeSuggestionsTable.driverId, driversTable.id))
      .where(where)
      .orderBy(desc(routeSuggestionsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(routeSuggestionsTable).where(where),
  ]);

  const data = rows.map(({ suggestion, userName, userEmail, driverName }) => ({
    ...suggestion,
    user: suggestion.userId ? { name: userName, email: userEmail } : null,
    driver: suggestion.driverId ? { name: driverName } : null,
  }));

  res.json({ data, total: countResult[0].count, page, limit });
});

router.post("/suggestions", async (req, res): Promise<void> => {
  const parsed = CreateSuggestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [suggestion] = await db.insert(routeSuggestionsTable).values(parsed.data).returning();
  res.status(201).json(suggestion);
});

router.get("/suggestions/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select({
    suggestion: routeSuggestionsTable,
    userName: usersTable.name,
    userEmail: usersTable.email,
    driverName: driversTable.name,
  })
    .from(routeSuggestionsTable)
    .leftJoin(usersTable, eq(routeSuggestionsTable.userId, usersTable.id))
    .leftJoin(driversTable, eq(routeSuggestionsTable.driverId, driversTable.id))
    .where(eq(routeSuggestionsTable.id, id));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    ...row.suggestion,
    user: row.suggestion.userId ? { name: row.userName, email: row.userEmail } : null,
    driver: row.suggestion.driverId ? { name: row.driverName } : null,
  });
});

router.patch("/suggestions/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateSuggestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(routeSuggestionsTable).set(parsed.data).where(eq(routeSuggestionsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
