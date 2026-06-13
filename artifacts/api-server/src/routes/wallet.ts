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
import { loadSetting, saveSetting } from "../lib/settings";

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
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid amount", code: "INVALID_AMOUNT" });
    return;
  }
  const { amount } = parsed.data;

  // Read limits from settings table with fallbacks
  const maxTopup = await loadSetting<number>("wallet_max_topup", 1000);
  const dailyLimit = await loadSetting<number>("wallet_daily_topup_limit", 2000);

  // Check per-request limit
  if (amount > maxTopup) {
    res.status(400).json({
      error: `الحد الأقصى لعملية الشحن الواحدة هو ${maxTopup} جنيه / Maximum top-up per request is ${maxTopup} EGP`,
      code: "TOPUP_LIMIT_EXCEEDED",
    });
    return;
  }

  // Check daily limit: sum all deposits for this user today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [dailyResult] = await db
    .select({ total: sql<number>`coalesce(sum(${walletTransactionsTable.amount}::numeric), 0)::float` })
    .from(walletTransactionsTable)
    .where(
      and(
        eq(walletTransactionsTable.userId, req.user!.id),
        eq(walletTransactionsTable.type, "deposit"),
        gte(walletTransactionsTable.createdAt, startOfDay),
        lte(walletTransactionsTable.createdAt, endOfDay),
      ),
    );

  const todayTotal = dailyResult?.total ?? 0;
  if (todayTotal + amount > dailyLimit) {
    const remaining = Math.max(0, dailyLimit - todayTotal);
    res.status(400).json({
      error: `تجاوزت الحد اليومي للشحن (${dailyLimit} جنيه). المتبقي اليوم: ${remaining} جنيه / Daily top-up limit exceeded (${dailyLimit} EGP). Remaining today: ${remaining} EGP`,
      code: "DAILY_LIMIT_EXCEEDED",
    });
    return;
  }

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

const WalletLimitsBody = z.object({
  wallet_max_topup: z.number().positive().optional(),
  wallet_daily_topup_limit: z.number().positive().optional(),
});

// ─── PATCH /admin/settings/wallet-limits ──────────────────────────────────────
router.patch("/admin/settings/wallet-limits", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = WalletLimitsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, number> = {};

  if (parsed.data.wallet_max_topup !== undefined) {
    await saveSetting("wallet_max_topup", parsed.data.wallet_max_topup);
    updates.wallet_max_topup = parsed.data.wallet_max_topup;
  }
  if (parsed.data.wallet_daily_topup_limit !== undefined) {
    await saveSetting("wallet_daily_topup_limit", parsed.data.wallet_daily_topup_limit);
    updates.wallet_daily_topup_limit = parsed.data.wallet_daily_topup_limit;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No limits provided to update" });
    return;
  }

  res.json({ message: "Wallet limits updated successfully", updated: updates });
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
