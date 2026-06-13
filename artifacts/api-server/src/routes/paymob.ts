import { Router } from "express";
import { db, paymentsTable, usersTable, walletTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { createPaymobSession, verifyPaymobWebhook, type PaymobWebhookPayload } from "../lib/paymob";
import { logger } from "../lib/logger";
import { z } from "zod";

const router = Router();

// ─── POST /payments/paymob/initiate ──────────────────────────────────────────
// المستخدم يطلب دفع عن طريق Paymob — بيرجعله رابط الـ iframe

const InitiateBody = z.object({
  amountEGP: z.number().positive("المبلغ لازم يكون أكبر من صفر"),
  type: z.enum(["wallet_topup", "ride", "booking"]),
  referenceId: z.number().int().positive().optional(),
});

router.post("/payments/paymob/initiate", authenticate, async (req, res): Promise<void> => {
  const parsed = InitiateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "بيانات غلط" });
    return;
  }

  const { amountEGP, type, referenceId } = parsed.data;

  // جيب بيانات المستخدم للفواتير
  const [user] = await db
    .select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  if (!user) {
    res.status(404).json({ error: "المستخدم مش موجود" });
    return;
  }

  // إنشاء معرف فريد للعملية
  const merchantOrderId = `${type}-u${req.user!.id}-${Date.now()}`;

  try {
    const session = await createPaymobSession({
      amountEGP,
      merchantOrderId,
      billing: {
        name: user.name,
        email: user.email ?? "noemail@example.com",
        phone: user.phone,
      },
    });

    // سجل العملية كـ pending في الداتا بيز
    await db.insert(paymentsTable).values({
      userId: req.user!.id,
      amount: String(amountEGP),
      method: "card",
      status: "pending",
      transactionRef: merchantOrderId,
      notes: `Paymob ${type}${referenceId ? ` ref:${referenceId}` : ""}`,
      ...(type === "booking" && referenceId ? { bookingId: referenceId } : {}),
      ...(type === "ride"    && referenceId ? { rideId: referenceId }    : {}),
    });

    res.json({
      iframeUrl: session.iframeUrl,
      merchantOrderId,
    });
  } catch (err) {
    logger.error({ err }, "Paymob initiate error");
    res.status(500).json({ error: "فشل في إنشاء جلسة الدفع، حاول تاني" });
  }
});

// ─── POST /payments/paymob/webhook ───────────────────────────────────────────
// Paymob بيبعت هنا نتيجة الدفع تلقائياً

router.post("/payments/paymob/webhook", async (req, res): Promise<void> => {
  try {
    const hmac = req.query["hmac"] as string;
    if (!hmac) {
      res.status(400).json({ error: "HMAC مش موجود" });
      return;
    }

    const payload = req.body as PaymobWebhookPayload;

    // تحقق إن الطلب جاي من Paymob فعلاً
    if (!verifyPaymobWebhook(payload, hmac)) {
      logger.warn({ hmac }, "Paymob webhook HMAC invalid");
      res.status(401).json({ error: "HMAC غلط" });
      return;
    }

    const { obj } = payload;
    const merchantOrderId = obj.order.merchant_order_id;
    const success = obj.success && !obj.error_occured && !obj.pending;
    const amountEGP = obj.amount_cents / 100;

    // حدّث حالة الدفع في الداتا بيز
    const [payment] = await db
      .update(paymentsTable)
      .set({
        status: success ? "completed" : "failed",
        transactionRef: String(obj.id),
      })
      .where(eq(paymentsTable.transactionRef, merchantOrderId))
      .returning();

    // لو الدفع ناجح وكان wallet topup — ابعت للـ wallet
    if (success && payment && payment.notes?.includes("wallet_topup")) {
      await db.transaction(async (tx) => {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${String(amountEGP)}` })
          .where(eq(usersTable.id, payment.userId));

        await tx.insert(walletTransactionsTable).values({
          userId: payment.userId,
          amount: String(amountEGP),
          type: "deposit",
          description: `شحن محفظة عن طريق Paymob — ${amountEGP} جنيه`,
        });
      });

      logger.info({ userId: payment.userId, amountEGP }, "Wallet topped up via Paymob");
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Paymob webhook error");
    res.status(500).json({ error: "خطأ في معالجة الـ webhook" });
  }
});

export default router;
