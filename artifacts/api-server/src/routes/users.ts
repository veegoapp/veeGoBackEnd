/**
 * Canonical user profile endpoints.
 * GET /users/me is the preferred profile endpoint — use it instead of the deprecated GET /auth/me.
 */

import { Router } from "express";
import { db, usersTable, bookingsTable, tripsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { UpdateUserProfileBody } from "@workspace/api-zod";
import { getPermissions, safeUserResponse } from "../lib/user-helpers";
import { z } from "zod";

const router = Router();

// ─── GET /users/me — canonical "current user" endpoint ────────────────────────
// Returns the authenticated user's profile including role permissions.
// Prefer this over the deprecated GET /auth/me alias.
router.get("/users/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const permissions = await getPermissions(user.staffRoleId);
  res.json(safeUserResponse(user, permissions));
});

router.patch("/users/me", authenticate, async (req, res): Promise<void> => {
  const parsed = UpdateUserProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, req.user!.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const permissions = await getPermissions(updated.staffRoleId);
  res.json(safeUserResponse(updated, permissions));
});

// ─── Push notification token ───────────────────────────────────────────────────

const PushTokenBody = z.object({
  token: z.string().min(1, "Push token is required"),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

router.post("/users/me/push-token", authenticate, async (req, res): Promise<void> => {
  const parsed = PushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }
  await db.update(usersTable).set({ pushToken: parsed.data.token }).where(eq(usersTable.id, req.user!.id));
  res.json({ success: true, message: "Push token registered" });
});

// ─── My bookings ───────────────────────────────────────────────────────────────

router.get("/users/me/bookings", authenticate, async (req, res): Promise<void> => {
  const bookings = await db.select({
    id:            bookingsTable.id,
    userId:        bookingsTable.userId,
    tripId:        bookingsTable.tripId,
    seatCount:     bookingsTable.seatCount,
    totalPrice:    bookingsTable.totalPrice,
    status:        bookingsTable.status,
    paymentStatus: bookingsTable.paymentStatus,
    promoCodeId:   bookingsTable.promoCodeId,
    createdAt:     bookingsTable.createdAt,
    trip: {
      id:            tripsTable.id,
      routeId:       tripsTable.routeId,
      departureTime: tripsTable.departureTime,
      arrivalTime:   tripsTable.arrivalTime,
      price:         tripsTable.price,
      status:        tripsTable.status,
    },
  })
    .from(bookingsTable)
    .leftJoin(tripsTable, eq(bookingsTable.tripId, tripsTable.id))
    .where(eq(bookingsTable.userId, req.user!.id))
    .orderBy(bookingsTable.createdAt);

  res.json(bookings.map(b => ({
    ...b,
    totalPrice: parseFloat(b.totalPrice as string),
    trip: b.trip ? { ...b.trip, price: parseFloat(b.trip.price as string) } : b.trip,
  })));
});

export default router;
