import { Router } from "express";
import { db, paymentsTable, usersTable, bookingsTable, ridesTable } from "@workspace/db";
import { eq, desc, and, sql, gte, lte, ilike } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { writeAuditLog } from "../lib/auditLog";
import { z } from "zod";

const router = Router();

// ─── Query helpers ────────────────────────────────────────────────────────────

const ListPaymentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["pending", "completed", "failed", "refunded"]).optional(),
  method: z.enum(["wallet", "cash", "card"]).optional(),
  userId: z.coerce.number().int().positive().optional(),
  bookingId: z.coerce.number().int().positive().optional(),
  rideId: z.coerce.number().int().positive().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const UpdatePaymentBody = z.object({
  status: z.enum(["pending", "completed", "failed", "refunded"]).optional(),
  notes: z.string().optional(),
  transactionRef: z.string().optional(),
});

// ─── GET /admin/payments ──────────────────────────────────────────────────────

router.get("/admin/payments", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListPaymentsQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { page, limit, status, method, userId, bookingId, rideId, from, to } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status)    conditions.push(eq(paymentsTable.status, status));
  if (method)    conditions.push(eq(paymentsTable.method, method));
  if (userId)    conditions.push(eq(paymentsTable.userId, userId));
  if (bookingId) conditions.push(eq(paymentsTable.bookingId, bookingId));
  if (rideId)    conditions.push(eq(paymentsTable.rideId, rideId));
  if (from)      conditions.push(gte(paymentsTable.createdAt, new Date(from)));
  if (to)        conditions.push(lte(paymentsTable.createdAt, new Date(to)));

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: paymentsTable.id,
        userId: paymentsTable.userId,
        bookingId: paymentsTable.bookingId,
        rideId: paymentsTable.rideId,
        amount: paymentsTable.amount,
        method: paymentsTable.method,
        status: paymentsTable.status,
        transactionRef: paymentsTable.transactionRef,
        notes: paymentsTable.notes,
        createdAt: paymentsTable.createdAt,
        updatedAt: paymentsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.phone,
      })
      .from(paymentsTable)
      .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
      .where(where)
      .orderBy(desc(paymentsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentsTable)
      .where(where),
  ]);

  res.json({ data: rows, total: countResult[0].count, page, limit });
});

// ─── GET /admin/payments/summary ──────────────────────────────────────────────

router.get("/admin/payments/summary", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalAmount: sql<number>`coalesce(sum(amount::numeric), 0)`,
      completedCount: sql<number>`count(*) filter (where status = 'completed')::int`,
      completedAmount: sql<number>`coalesce(sum(amount::numeric) filter (where status = 'completed'), 0)`,
      refundedCount: sql<number>`count(*) filter (where status = 'refunded')::int`,
      refundedAmount: sql<number>`coalesce(sum(amount::numeric) filter (where status = 'refunded'), 0)`,
      pendingCount: sql<number>`count(*) filter (where status = 'pending')::int`,
      failedCount: sql<number>`count(*) filter (where status = 'failed')::int`,
      walletCount: sql<number>`count(*) filter (where method = 'wallet')::int`,
      cashCount: sql<number>`count(*) filter (where method = 'cash')::int`,
      cardCount: sql<number>`count(*) filter (where method = 'card')::int`,
    })
    .from(paymentsTable);

  res.json(stats);
});

// ─── GET /admin/payments/:id ──────────────────────────────────────────────────

router.get("/admin/payments/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid payment ID" }); return; }

  const [row] = await db
    .select({
      id: paymentsTable.id,
      userId: paymentsTable.userId,
      bookingId: paymentsTable.bookingId,
      rideId: paymentsTable.rideId,
      amount: paymentsTable.amount,
      method: paymentsTable.method,
      status: paymentsTable.status,
      transactionRef: paymentsTable.transactionRef,
      notes: paymentsTable.notes,
      createdAt: paymentsTable.createdAt,
      updatedAt: paymentsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.phone,
    })
    .from(paymentsTable)
    .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
    .where(eq(paymentsTable.id, id));

  if (!row) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json(row);
});

// ─── PATCH /admin/payments/:id ────────────────────────────────────────────────

router.patch("/admin/payments/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid payment ID" }); return; }

  const parsed = UpdatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!Object.keys(parsed.data).length) { res.status(400).json({ error: "No fields to update" }); return; }

  const [before] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!before) { res.status(404).json({ error: "Payment not found" }); return; }

  const [updated] = await db
    .update(paymentsTable)
    .set(parsed.data)
    .where(eq(paymentsTable.id, id))
    .returning();

  void writeAuditLog(req, "UPDATE", "payment", id, before, updated);

  res.json(updated);
});

export default router;
