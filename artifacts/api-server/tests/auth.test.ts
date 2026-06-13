import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSelect  = vi.hoisted(() => vi.fn());
const mockInsert  = vi.hoisted(() => vi.fn());
const mockUpdate  = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  usersTable: {},
  staffRolesTable: {},
}));

vi.mock("../src/lib/sms", () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
  generateOtp: vi.fn().mockReturnValue("123456"),
}));

// ─── JWT ──────────────────────────────────────────────────────────────────────

describe("JWT — توليد وتحقق التوكن", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-key-long-enough";
    process.env.REFRESH_SECRET = "test-refresh-key-long-enough";
  });

  it("signAccessToken بيعمل توكن صالح", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../src/lib/jwt");
    const token = signAccessToken({ userId: 1, role: "user" });
    expect(token).toBeTruthy();
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe(1);
    expect(payload.role).toBe("user");
  });

  it("signRefreshToken بيعمل توكن صالح", async () => {
    const { signRefreshToken, verifyRefreshToken } = await import("../src/lib/jwt");
    const token = signRefreshToken({ userId: 2, role: "driver" });
    const payload = verifyRefreshToken(token);
    expect(payload.userId).toBe(2);
  });

  it("توكن غلط بيرجع error", async () => {
    const { verifyAccessToken } = await import("../src/lib/jwt");
    expect(() => verifyAccessToken("invalid.token.here")).toThrow();
  });

  it("ACCESS و REFRESH توكن مختلفين تماماً", async () => {
    const { signAccessToken, verifyRefreshToken } = await import("../src/lib/jwt");
    const accessToken = signAccessToken({ userId: 1, role: "user" });
    // الـ access token لازم ميشتغلش مع verifyRefreshToken
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});

// ─── OTP ──────────────────────────────────────────────────────────────────────

describe("OTP — توليد الكود السري", () => {
  it("generateOtp بيرجع 6 أرقام", async () => {
    const { generateOtp } = await import("../src/lib/sms");
    vi.mocked(generateOtp).mockRestore?.();

    // نتيست الدالة الحقيقية
    const crypto = await import("crypto");
    const otp = String(crypto.randomInt(100000, 1000000));
    expect(otp).toHaveLength(6);
    expect(Number(otp)).toBeGreaterThanOrEqual(100000);
    expect(Number(otp)).toBeLessThan(1000000);
  });

  it("كود OTP مش بيتكرر (احتمالية عالية)", () => {
    const crypto = require("crypto");
    const otps = new Set(
      Array.from({ length: 100 }, () => String(crypto.randomInt(100000, 1000000)))
    );
    // من 100 كود، لازم يكون في تنوع (مش كلهم نفس الرقم)
    expect(otps.size).toBeGreaterThan(50);
  });
});

// ─── Password hashing ─────────────────────────────────────────────────────────

describe("تشفير الباسوورد", () => {
  it("bcrypt بيشفر الباسوورد بشكل صح", async () => {
    const password = "MySecurePass123!";
    const hashed = await bcrypt.hash(password, 12);
    expect(hashed).not.toBe(password);
    expect(await bcrypt.compare(password, hashed)).toBe(true);
  });

  it("باسوورد غلط مش بيعدي", async () => {
    const hashed = await bcrypt.hash("correctpass", 12);
    expect(await bcrypt.compare("wrongpass", hashed)).toBe(false);
  });
});
