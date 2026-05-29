import { Router } from "express";
import { db, walletTransactionsTable, usersTable } from "@workspace/db";
import { eq, sql, and, gte, lte, ilike, or } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import {
  ListWalletTransactionsQueryParams,
  ListAllTransactionsQueryParams,
  AdminRefundBody,
} from "@workspace/api-zod";
import { z } from "zod";

const router = Router();

router.get("/wallet", authenticate, async (req, res): Promise<void> => {
  const [user] = await db.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ userId: req.user!.id, balance: parseFloat(user.walletBalance) });
});

router.get("/wallet/transactions", authenticate, async (req, res): Promise<void> => {
  const parsed = ListWalletTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;
  const [data, countResult] = await Promise.all([
    db.select().from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, req.user!.id)).limit(limit).offset(offset).orderBy(walletTransactionsTable.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, req.user!.id)),
  ]);
  res.json({
    data: data.map(t => ({ ...t, amount: parseFloat(t.amount) })),
    total: countResult[0].count,
    page,
    limit,
  });
});

// FIXED: real wallet top-up endpoint — inserts a deposit transaction and updates the balance
const WalletTopupBody = z.object({
  amount: z.number().positive("Amount must be a positive number"),
});

router.post("/wallet/topup", authenticate, async (req, res): Promise<void> => {
  const parsed = WalletTopupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid amount" });
    return;
  }
  const { amount } = parsed.data;

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      walletBalance: sql`wallet_balance + ${String(amount)}`,
    }).where(eq(usersTable.id, req.user!.id));

    const [txn] = await tx.insert(walletTransactionsTable).values({
      userId:      req.user!.id,
      amount:      String(amount),
      type:        "deposit",
      description: `Wallet top-up — ${amount} EGP`,
    }).returning();

    const [user] = await tx
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    res.json({
      transaction: { ...txn, amount: parseFloat(txn.amount) },
      balance: user ? parseFloat(user.walletBalance) : 0,
    });
  });
});

router.get("/admin/wallet/transactions", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListAllTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { userId, type, page = 1, limit = 20 } = parsed.data;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const search = req.query.search as string | undefined;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (userId) conditions.push(eq(walletTransactionsTable.userId, userId));
  if (type) conditions.push(eq(walletTransactionsTable.type, type as "deposit" | "payment" | "refund"));
  if (dateFrom) conditions.push(gte(walletTransactionsTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(walletTransactionsTable.createdAt, new Date(dateTo + "T23:59:59.999Z")));
  if (search) conditions.push(or(ilike(usersTable.name, `%${search}%`), ilike(walletTransactionsTable.description, `%${search}%`))!);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select({
      id: walletTransactionsTable.id,
      userId: walletTransactionsTable.userId,
      amount: walletTransactionsTable.amount,
      type: walletTransactionsTable.type,
      description: walletTransactionsTable.description,
      createdAt: walletTransactionsTable.createdAt,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        role: usersTable.role,
        walletBalance: usersTable.walletBalance,
        isVerified: usersTable.isVerified,
        isBlocked: usersTable.isBlocked,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      },
    }).from(walletTransactionsTable)
      .leftJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(walletTransactionsTable.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(walletTransactionsTable).where(where),
  ]);

  res.json({
    data: data.map(t => ({
      ...t,
      amount: parseFloat(t.amount),
      user: t.user ? { ...t.user, walletBalance: typeof t.user.walletBalance === "string" ? parseFloat(t.user.walletBalance as string) : t.user.walletBalance } : t.user,
    })),
    total: countResult[0].count,
    page,
    limit,
  });
});

router.post("/admin/wallet/refund", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = AdminRefundBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { userId, amount, description } = parsed.data;

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      walletBalance: sql`wallet_balance + ${String(amount)}`,
    }).where(eq(usersTable.id, userId));

    const [txn] = await tx.insert(walletTransactionsTable).values({
      userId,
      amount: String(amount),
      type: "refund",
      description,
    }).returning();

    res.json({ ...txn, amount: parseFloat(txn.amount) });
  });
});

export default router;
