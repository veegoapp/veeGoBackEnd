import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymobOrderResult {
  orderId: string;
  paymentKey: string;
  iframeUrl: string;
}

export interface PaymobWebhookPayload {
  obj: {
    id: number;
    success: boolean;
    amount_cents: number;
    order: { id: number; merchant_order_id: string };
    error_occured: boolean;
    pending: boolean;
    source_data: { type: string };
  };
  hmac: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfig() {
  const apiKey     = process.env.PAYMOB_API_KEY;
  const iframeId   = process.env.PAYMOB_IFRAME_ID;
  const integrationId = process.env.PAYMOB_INTEGRATION_ID;
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;

  if (!apiKey || !iframeId || !integrationId || !hmacSecret) {
    throw new Error(
      "Paymob غير مهيأ. تأكد من وجود: PAYMOB_API_KEY, PAYMOB_IFRAME_ID, PAYMOB_INTEGRATION_ID, PAYMOB_HMAC_SECRET"
    );
  }

  return { apiKey, iframeId, integrationId, hmacSecret };
}

// ─── الخطوة 1: تسجيل الدخول والحصول على auth token ──────────────────────────

async function getAuthToken(apiKey: string): Promise<string> {
  const res = await fetch("https://accept.paymob.com/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!res.ok) throw new Error(`Paymob auth فشل: ${await res.text()}`);

  const data = await res.json() as { token: string };
  return data.token;
}

// ─── الخطوة 2: إنشاء order ──────────────────────────────────────────────────

async function createOrder(
  authToken: string,
  amountCents: number,
  merchantOrderId: string
): Promise<string> {
  const res = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: "EGP",
      merchant_order_id: merchantOrderId,
      items: [],
    }),
  });

  if (!res.ok) throw new Error(`Paymob order فشل: ${await res.text()}`);

  const data = await res.json() as { id: number };
  return String(data.id);
}

// ─── الخطوة 3: الحصول على payment key ───────────────────────────────────────

async function getPaymentKey(
  authToken: string,
  orderId: string,
  amountCents: number,
  integrationId: string,
  billing: { name: string; email: string; phone: string }
): Promise<string> {
  const res = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      currency: "EGP",
      integration_id: integrationId,
      billing_data: {
        first_name: billing.name.split(" ")[0] ?? billing.name,
        last_name: billing.name.split(" ")[1] ?? ".",
        email: billing.email,
        phone_number: billing.phone,
        apartment: "NA",
        floor: "NA",
        street: "NA",
        building: "NA",
        shipping_method: "NA",
        postal_code: "NA",
        city: "NA",
        country: "EG",
        state: "NA",
      },
    }),
  });

  if (!res.ok) throw new Error(`Paymob payment key فشل: ${await res.text()}`);

  const data = await res.json() as { token: string };
  return data.token;
}

// ─── الدالة الرئيسية: إنشاء جلسة دفع كاملة ──────────────────────────────────

export async function createPaymobSession(params: {
  amountEGP: number;
  merchantOrderId: string;
  billing: { name: string; email: string; phone: string };
}): Promise<PaymobOrderResult> {
  const { apiKey, iframeId, integrationId } = getConfig();
  const amountCents = Math.round(params.amountEGP * 100);

  const authToken   = await getAuthToken(apiKey);
  const orderId     = await createOrder(authToken, amountCents, params.merchantOrderId);
  const paymentKey  = await getPaymentKey(authToken, orderId, amountCents, integrationId, params.billing);

  const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;

  logger.info({ orderId, amountCents }, "Paymob session created");

  return { orderId, paymentKey, iframeUrl };
}

// ─── التحقق من صحة الـ webhook القادم من Paymob ──────────────────────────────

export function verifyPaymobWebhook(
  payload: PaymobWebhookPayload,
  receivedHmac: string
): boolean {
  const { hmacSecret } = getConfig();

  const { obj } = payload;
  const data = [
    obj.id,
    obj.pending,
    obj.amount_cents,
    obj.success,
    obj.error_occured,
    obj.order.id,
    obj.source_data.type,
  ].join("");

  const crypto = require("crypto") as typeof import("crypto");
  const expected = crypto.createHmac("sha512", hmacSecret).update(data).digest("hex");

  return expected === receivedHmac;
}
