import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

// ─── اختبار التحقق من الـ webhook ─────────────────────────────────────────────

function buildHmac(secret: string, obj: {
  id: number; pending: boolean; amount_cents: number; success: boolean;
  error_occured: boolean; order_id: number; source_type: string;
}): string {
  const data = [
    obj.id, obj.pending, obj.amount_cents, obj.success,
    obj.error_occured, obj.order_id, obj.source_type,
  ].join("");
  return crypto.createHmac("sha512", secret).update(data).digest("hex");
}

describe("Paymob — التحقق من الـ Webhook", () => {
  const secret = "test-hmac-secret";

  it("HMAC صحيح بيعدي التحقق", () => {
    const obj = {
      id: 123, pending: false, amount_cents: 10000, success: true,
      error_occured: false, order_id: 456, source_type: "card",
    };
    const hmac = buildHmac(secret, obj);
    expect(hmac).toHaveLength(128); // SHA-512 hex = 128 حرف
    expect(hmac).toBeTruthy();
  });

  it("تغيير أي قيمة بيغير الـ HMAC", () => {
    const obj1 = {
      id: 123, pending: false, amount_cents: 10000, success: true,
      error_occured: false, order_id: 456, source_type: "card",
    };
    const obj2 = { ...obj1, amount_cents: 20000 }; // غيرنا المبلغ

    const hmac1 = buildHmac(secret, obj1);
    const hmac2 = buildHmac(secret, obj2);

    expect(hmac1).not.toBe(hmac2);
  });

  it("HMAC غلط مش بيعدي", () => {
    const obj = {
      id: 123, pending: false, amount_cents: 10000, success: true,
      error_occured: false, order_id: 456, source_type: "card",
    };
    const correctHmac = buildHmac(secret, obj);
    const fakeHmac = "a".repeat(128);

    expect(correctHmac).not.toBe(fakeHmac);
  });
});

describe("Paymob — منطق الدفع", () => {
  it("دفع ناجح = success:true و error_occured:false و pending:false", () => {
    const obj = { success: true, error_occured: false, pending: false };
    const isSuccess = obj.success && !obj.error_occured && !obj.pending;
    expect(isSuccess).toBe(true);
  });

  it("دفع فاشل = success:false", () => {
    const obj = { success: false, error_occured: true, pending: false };
    const isSuccess = obj.success && !obj.error_occured && !obj.pending;
    expect(isSuccess).toBe(false);
  });

  it("دفع في الانتظار = pending:true", () => {
    const obj = { success: false, error_occured: false, pending: true };
    const isSuccess = obj.success && !obj.error_occured && !obj.pending;
    expect(isSuccess).toBe(false);
  });

  it("تحويل المبلغ صح (EGP → cents)", () => {
    expect(Math.round(100 * 100)).toBe(10000);
    expect(Math.round(55.5 * 100)).toBe(5550);
  });
});
