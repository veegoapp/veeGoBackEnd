import { Router } from "express";
import { db, bookingsTable, tripsTable, usersTable, promoCodesTable, walletTransactionsTable, paymentsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import {
  ListBookingsQueryParams,
  GetBookingParams,
  CreateBookingBody,
  CancelBookingParams,
} from "@workspace/api-zod";

const router = Router();

function formatBooking(b: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    ...b,
    totalPrice: typeof b.totalPrice === "string" ? parseFloat(b.totalPrice as string) : b.totalPrice,
  };
  if (out.user && typeof out.user === "object") {
    const u = out.user as Record<string, unknown>;
    out.user = { ...u, walletBalance: typeof u.walletBalance === "string" ? parseFloat(u.walletBalance as string) : u.walletBalance };
  }
  return out;
}

router.get("/bookings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { userId, tripId, status, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (userId) conditions.push(eq(bookingsTable.userId, userId));
  if (tripId) conditions.push(eq(bookingsTable.tripId, tripId));
  if (status) conditions.push(eq(bookingsTable.status, status as "pending" | "confirmed" | "cancelled" | "completed"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select({
      id: bookingsTable.id,
      userId: bookingsTable.userId,
      tripId: bookingsTable.tripId,
      seatCount: bookingsTable.seatCount,
      totalPrice: bookingsTable.totalPrice,
      status: bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      promoCodeId: bookingsTable.promoCodeId,
      createdAt: bookingsTable.createdAt,
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
    })
      .from(bookingsTable)
      .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(bookingsTable.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(bookingsTable).where(where),
  ]);

  res.json({ data: data.map(b => formatBooking(b as Record<string, unknown>)), total: countResult[0].count, page, limit });
});

router.post("/bookings", authenticate, async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { tripId, seatCount, promoCode: promoCodeStr } = parsed.data;

  const result = await db.transaction(async (tx) => {
    // SELECT FOR UPDATE: lock the trip row to prevent concurrent overbooking
    const tripResult = await tx.execute(
      sql`SELECT id, status, available_seats, price FROM trips WHERE id = ${tripId} FOR UPDATE`
    );

    type TripRow = { id: number; status: string; available_seats: number; price: string };
    const tripRow = tripResult.rows[0] as TripRow | undefined;

    if (!tripRow) return { error: "Trip not found", status: 404 };
    if (tripRow.status !== "scheduled" && tripRow.status !== "active") {
      return { error: "Trip is not available for booking", status: 400 };
    }
    if (tripRow.available_seats < seatCount) {
      return { error: "Not enough available seats", status: 400 };
    }

    let totalPrice = parseFloat(tripRow.price) * seatCount;
    let promoCodeId: number | undefined;

    if (promoCodeStr) {
      const [promo] = await tx.select().from(promoCodesTable).where(eq(promoCodesTable.code, promoCodeStr));
      if (promo && promo.isActive) {
        if (!promo.expiryDate || new Date(promo.expiryDate) > new Date()) {
          if (!promo.maxUsage || promo.usedCount < promo.maxUsage) {
            if (promo.discountType === "percentage") {
              totalPrice = totalPrice * (1 - parseFloat(promo.discountValue) / 100);
            } else {
              totalPrice = Math.max(0, totalPrice - parseFloat(promo.discountValue));
            }
            promoCodeId = promo.id;
            await tx.update(promoCodesTable).set({ usedCount: promo.usedCount + 1 }).where(eq(promoCodesTable.id, promo.id));
          }
        }
      }
    }

    // FIXED: check wallet balance before confirming the booking
    const userResult = await tx.execute(
      sql`SELECT id, wallet_balance FROM users WHERE id = ${req.user!.id} FOR UPDATE`
    );
    type UserRow = { id: number; wallet_balance: string };
    const userRow = userResult.rows[0] as UserRow | undefined;
    if (!userRow) return { error: "User not found", status: 404 };
    if (parseFloat(userRow.wallet_balance) < totalPrice) {
      return {
        error: `Insufficient wallet balance. Required: ${totalPrice.toFixed(2)} EGP, available: ${parseFloat(userRow.wallet_balance).toFixed(2)} EGP`,
        status: 400,
      };
    }

    // Decrement using the locked row's value to prevent race conditions
    await tx.execute(
      sql`UPDATE trips SET available_seats = available_seats - ${seatCount} WHERE id = ${tripId} AND available_seats >= ${seatCount}`
    );

    // Verify the update actually affected a row (double-check seats were available)
    const verifyResult = await tx.execute(
      sql`SELECT available_seats FROM trips WHERE id = ${tripId}`
    );
    const updatedSeats = (verifyResult.rows[0] as { available_seats: number } | undefined)?.available_seats;
    if (updatedSeats === undefined || updatedSeats < 0) {
      return { error: "Seat reservation failed — seats may have just been taken", status: 409 };
    }

    const [booking] = await tx.insert(bookingsTable).values({
      userId: req.user!.id,
      tripId,
      seatCount,
      totalPrice: String(totalPrice),
      status: "confirmed",
      paymentStatus: "paid",
      promoCodeId,
    }).returning();

    // FIXED: deduct wallet balance atomically inside the same transaction
    await tx.execute(
      sql`UPDATE users SET wallet_balance = wallet_balance - ${totalPrice} WHERE id = ${req.user!.id}`
    );

    // FIXED: record the wallet deduction as a payment transaction
    await tx.insert(walletTransactionsTable).values({
      userId:      req.user!.id,
      amount:      String(totalPrice),
      type:        "payment",
      description: `Booking #${booking.id} — trip #${tripId} (${seatCount} seat${seatCount > 1 ? "s" : ""})`,
    });

    await tx.insert(paymentsTable).values({
      userId:    req.user!.id,
      bookingId: booking.id,
      amount:    String(totalPrice),
      method:    "wallet",
      status:    "completed",
      notes:     `Booking #${booking.id} — trip #${tripId} (${seatCount} seat${seatCount > 1 ? "s" : ""})`,
    });

    return { booking };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }

  res.status(201).json(formatBooking(result.booking as Record<string, unknown>));
});

router.get("/bookings/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (req.user!.role !== "admin" && booking.userId !== req.user!.id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  res.json(formatBooking(booking as Record<string, unknown>));
});

// FIXED: auto-refund on booking cancellation — credits wallet balance in the same transaction
router.patch("/bookings/:id/cancel", authenticate, async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const result = await db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
    if (!booking) return { error: "Booking not found", status: 404 };
    if (req.user!.role !== "admin" && booking.userId !== req.user!.id) return { error: "Forbidden", status: 403 };
    if (booking.status === "cancelled") return { error: "Booking already cancelled", status: 400 };

    const [updated] = await tx.update(bookingsTable)
      .set({ status: "cancelled", paymentStatus: "refunded" })
      .where(eq(bookingsTable.id, params.data.id))
      .returning();

    await tx.execute(
      sql`UPDATE trips SET available_seats = available_seats + ${booking.seatCount} WHERE id = ${booking.tripId}`
    );

    // FIXED: refund wallet balance when the booking was paid
    if (booking.paymentStatus === "paid") {
      await tx.update(usersTable).set({
        walletBalance: sql`wallet_balance + ${booking.totalPrice}`,
      }).where(eq(usersTable.id, booking.userId));

      await tx.insert(walletTransactionsTable).values({
        userId:      booking.userId,
        amount:      booking.totalPrice,
        type:        "refund",
        description: `Refund for booking #${booking.id} (trip #${booking.tripId})`,
      });

      await tx.insert(paymentsTable).values({
        userId:    booking.userId,
        bookingId: booking.id,
        amount:    booking.totalPrice,
        method:    "wallet",
        status:    "refunded",
        notes:     `Refund for booking #${booking.id} (trip #${booking.tripId})`,
      });
    }

    return { booking: updated };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }

  res.json(formatBooking(result.booking as Record<string, unknown>));
});

export default router;
