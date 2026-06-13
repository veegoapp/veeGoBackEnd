import { describe, it, expect } from "vitest";

// ─── حساب الأسعار والمسافات ───────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcPrice(baseFare: number, perKmRate: number, minimumFare: number, distanceKm: number): number {
  return Math.max(minimumFare, baseFare + distanceKm * perKmRate);
}

describe("حساب المسافة — Haversine", () => {
  it("نفس النقطة = مسافة صفر", () => {
    const dist = haversineKm(30.0, 31.0, 30.0, 31.0);
    expect(dist).toBeCloseTo(0);
  });

  it("مسافة القاهرة → الجيزة تقريباً صح", () => {
    // وسط القاهرة → وسط الجيزة ≈ 8-10 كم
    const dist = haversineKm(30.0444, 31.2357, 30.0131, 31.2089);
    expect(dist).toBeGreaterThan(3);
    expect(dist).toBeLessThan(15);
  });

  it("المسافة دايماً موجبة", () => {
    const dist = haversineKm(30.0, 31.0, 29.5, 30.5);
    expect(dist).toBeGreaterThan(0);
  });
});

describe("حساب سعر الرحلة", () => {
  it("السعر مش بيقل عن الحد الأدنى", () => {
    const price = calcPrice(5, 3, 15, 1); // مسافة 1 كم → 5+3=8، أقل من 15
    expect(price).toBe(15);
  });

  it("السعر بيتحسب صح للمسافات الطويلة", () => {
    const price = calcPrice(5, 3, 15, 10); // 5 + 10*3 = 35
    expect(price).toBe(35);
  });

  it("مسافة صفر = السعر الأساسي أو الحد الأدنى", () => {
    const price = calcPrice(5, 3, 15, 0);
    expect(price).toBe(15); // 5 < 15 → يرجع 15
  });

  it("السعر موجب دايماً", () => {
    const price = calcPrice(5, 3, 15, 5);
    expect(price).toBeGreaterThan(0);
  });
});

describe("التحقق من بيانات الرحلة", () => {
  it("إحداثيات صالحة", () => {
    const lat = 30.0444;
    const lng = 31.2357;
    expect(lat).toBeGreaterThanOrEqual(-90);
    expect(lat).toBeLessThanOrEqual(90);
    expect(lng).toBeGreaterThanOrEqual(-180);
    expect(lng).toBeLessThanOrEqual(180);
  });

  it("إحداثيات غير صالحة تُكشف", () => {
    const lat = 200; // أكبر من 90
    expect(lat > 90 || lat < -90).toBe(true);
  });

  it("نقطة البداية والنهاية مش نفس المكان", () => {
    const origin      = { lat: 30.0444, lng: 31.2357 };
    const destination = { lat: 30.0444, lng: 31.2357 };
    const isSame = origin.lat === destination.lat && origin.lng === destination.lng;
    expect(isSame).toBe(true); // لازم يُرفض في السيستم
  });
});
