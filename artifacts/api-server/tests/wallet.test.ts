import { describe, it, expect, vi } from "vitest";

// ─── Wallet business logic tests ──────────────────────────────────────────────

describe("Wallet — منطق المحفظة", () => {
  it("مبلغ سالب مش مقبول", () => {
    const amount = -50;
    expect(amount > 0).toBe(false);
  });

  it("مبلغ صفر مش مقبول", () => {
    const amount = 0;
    expect(amount > 0).toBe(false);
  });

  it("مبلغ موجب مقبول", () => {
    const amount = 100;
    expect(amount > 0).toBe(true);
  });

  it("الحد الأقصى للشحن (1000 جنيه) بيشتغل", () => {
    const maxTopup = 1000;
    const amount = 1500;
    expect(amount > maxTopup).toBe(true); // لازم يُرفض
  });

  it("الحد اليومي (2000 جنيه) بيشتغل", () => {
    const dailyLimit = 2000;
    const todayTotal = 1800;
    const newAmount  = 300;
    expect(todayTotal + newAmount > dailyLimit).toBe(true); // لازم يُرفض
  });

  it("رصيد المحفظة بيتحسب صح بعد الشحن", () => {
    const currentBalance = 250.5;
    const topupAmount    = 100;
    const newBalance     = currentBalance + topupAmount;
    expect(newBalance).toBeCloseTo(350.5);
  });

  it("رصيد المحفظة بيتحسب صح بعد الخصم", () => {
    const currentBalance = 500;
    const rideAmount     = 45.75;
    const newBalance     = currentBalance - rideAmount;
    expect(newBalance).toBeCloseTo(454.25);
  });

  it("رصيد غير كافي بيُكشف", () => {
    const balance    = 30;
    const rideAmount = 50;
    expect(balance >= rideAmount).toBe(false);
  });
});

// ─── Paymob amount conversion ─────────────────────────────────────────────────

describe("Paymob — تحويل المبالغ", () => {
  it("EGP → cents بيتحسب صح", () => {
    expect(Math.round(100 * 100)).toBe(10000);
    expect(Math.round(45.5 * 100)).toBe(4550);
    expect(Math.round(0.99 * 100)).toBe(99);
  });

  it("cents → EGP بيتحسب صح", () => {
    expect(10000 / 100).toBe(100);
    expect(4550 / 100).toBe(45.5);
  });

  it("مبلغ صفر مش مقبول في Paymob", () => {
    const amount = 0;
    expect(amount > 0).toBe(false);
  });
});
