import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate } from "../middlewares/auth";
import { getPermissions, safeUserResponse } from "../lib/user-helpers";
import { logger } from "../lib/logger";
import { sendSms, generateOtp } from "../lib/sms";
import {
  RegisterBody,
  LoginBody,
  RefreshTokenBody,
} from "@workspace/api-zod";
import { z } from "zod";

const router = Router();


router.post("/auth/register", async (req, res): Promise<void> => {
  logger.info({
    msg: "[register] incoming request body",
    body: { ...req.body, password: req.body?.password ? "[REDACTED]" : undefined },
  });

  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    logger.info({ msg: "[register] validation failed", issues: parsed.error.issues });
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, phone, password } = parsed.data;

  const [existing] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.email, email), eq(usersTable.phone, phone)));

  if (existing) {
    res.status(400).json({ error: "Email or phone already registered" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    name,
    email,
    phone,
    password: hashedPassword,
    role: "user",
  }).returning();

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

  res.status(201).json({
    accessToken,
    refreshToken,
    user: safeUserResponse(user, []),
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const normalized = { ...body, credential: body.credential ?? body.email };

  const parsed = LoginBody.safeParse(normalized);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join(", ");
    res.status(400).json({ error: message });
    return;
  }

  const { credential, password } = parsed.data;
  const [user] = await db.select()
    .from(usersTable)
    .where(or(eq(usersTable.email, credential), eq(usersTable.phone, credential)));

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.role === "admin") {
    res.status(403).json({ error: "Admin accounts must use the admin login portal" });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ error: "Account is blocked" });
    return;
  }

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

  const permissions = await getPermissions(user.staffRoleId);
  res.status(200).json({
    accessToken,
    refreshToken,
    user: safeUserResponse(user, permissions),
  });
});

// ─── POST /auth/admin/login — admin dashboard only ────────────────────────────
// Accepts only users with role = "admin". Passenger and driver credentials
// are explicitly rejected to prevent cross-role session confusion.
router.post("/auth/admin/login", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const normalized = { ...body, credential: body.credential ?? body.email };

  const parsed = LoginBody.safeParse(normalized);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join(", ");
    res.status(400).json({ error: message });
    return;
  }

  const { credential, password } = parsed.data;
  const [user] = await db.select()
    .from(usersTable)
    .where(or(eq(usersTable.email, credential), eq(usersTable.phone, credential)));

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.role !== "admin") {
    res.status(403).json({ error: "Access denied. Admin accounts only." });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ error: "Account is blocked" });
    return;
  }

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

  const permissions = await getPermissions(user.staffRoleId);
  res.status(200).json({
    accessToken,
    refreshToken,
    user: safeUserResponse(user, permissions),
  });
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const parsed = RefreshTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const { refreshToken } = parsed.data;
    const payload = verifyRefreshToken(refreshToken);

    const [user] = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId));

    if (!user || user.refreshToken !== refreshToken) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const newPayload = { userId: user.id, role: user.role };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    await db.update(usersTable).set({ refreshToken: newRefreshToken }).where(eq(usersTable.id, user.id));

    const permissions = await getPermissions(user.staffRoleId);
    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: safeUserResponse(user, permissions),
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// TODO (deprecated): Use GET /users/me — returns an identical payload including permissions.
// This alias is kept for backward compatibility.
router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await db.select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const permissions = await getPermissions(user.staffRoleId);
  res.json(safeUserResponse(user, permissions));
});

// ─── OTP: Send ────────────────────────────────────────────────────────────────

const SendOtpBody = z.object({
  phone: z.string().min(5),
});

router.post("/auth/send-otp", async (req, res): Promise<void> => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  const { phone } = parsed.data;

  const [user] = await db.select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.phone, phone));

  if (!user) {
    res.status(404).json({ error: "No account found with this phone number" });
    return;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.update(usersTable)
    .set({ otpCode: otp, otpExpiresAt: expiresAt })
    .where(eq(usersTable.id, user.id));

  try {
    await sendSms(phone, `Your ShuttleOps verification code is: ${otp}. Expires in 10 minutes.`);
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to send OTP SMS");
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
    return;
  }

  logger.info({ userId: user.id }, "OTP sent");
  res.json({ success: true, message: "OTP sent to your phone number" });
});

// ─── OTP: Verify ─────────────────────────────────────────────────────────────

const VerifyOtpBody = z.object({
  phone: z.string().min(5),
  otp: z.string().length(6),
});

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  const { phone, otp } = parsed.data;

  const [user] = await db.select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone));

  if (!user) {
    res.status(404).json({ error: "No account found with this phone number" });
    return;
  }

  if (!user.otpCode || user.otpCode !== otp) {
    res.status(400).json({ error: "Invalid OTP code" });
    return;
  }

  if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
    res.status(400).json({ error: "OTP has expired. Please request a new one." });
    return;
  }

  await db.update(usersTable)
    .set({ isVerified: true, otpCode: null, otpExpiresAt: null })
    .where(eq(usersTable.id, user.id));

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

  const permissions = await getPermissions(user.staffRoleId);

  logger.info({ userId: user.id }, "OTP verified — user now verified");
  res.json({
    success: true,
    accessToken,
    refreshToken,
    user: safeUserResponse({ ...user, isVerified: true }, permissions),
  });
});

// ─── Password Reset: Request ──────────────────────────────────────────────────

const ForgotPasswordBody = z.object({
  phone: z.string().min(5),
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  const { phone } = parsed.data;

  const [user] = await db.select({ id: usersTable.id, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.phone, phone));

  if (!user) {
    res.json({ success: true, message: "If this phone is registered, a reset code has been sent" });
    return;
  }

  const resetToken = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ passwordResetToken: resetToken, passwordResetExpiresAt: expiresAt })
    .where(eq(usersTable.id, user.id));

  try {
    await sendSms(phone, `Your ShuttleOps password reset code is: ${resetToken}. Expires in 1 hour.`);
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to send password reset SMS");
    res.status(500).json({ error: "Failed to send reset code. Please try again." });
    return;
  }

  logger.info({ userId: user.id }, "Password reset code sent");
  res.json({ success: true, message: "If this phone is registered, a reset code has been sent" });
});

// ─── Password Reset: Confirm ──────────────────────────────────────────────────

const ResetPasswordBody = z.object({
  phone: z.string().min(5),
  token: z.string().min(6),
  newPassword: z.string().min(8),
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  const { phone, token, newPassword } = parsed.data;

  const [user] = await db.select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone));

  if (!user) {
    res.status(400).json({ error: "Invalid phone or reset token" });
    return;
  }

  if (!user.passwordResetToken || user.passwordResetToken !== token) {
    res.status(400).json({ error: "Invalid reset token" });
    return;
  }

  if (!user.passwordResetExpiresAt || new Date() > user.passwordResetExpiresAt) {
    res.status(400).json({ error: "Reset token has expired. Please request a new one." });
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await db.update(usersTable)
    .set({
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      refreshToken: null,
    })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, "Password reset successful");
  res.json({ success: true, message: "Password updated successfully. Please log in with your new password." });
});

export default router;
