import { Router } from "express";
import { db, bookingsTable, tripsTable, usersTable, promoCodesTable, walletTransactionsTable, paymentsTable, VEHICLE_CAPACITY, VEHICLE_MIN_THRESHOLD } from "@workspace/db";
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
      trip: {
        id: tripsTable.id,
        status: tripsTable.status,
        departureTime: tripsTable.departureTime,
        arrivalTime: tripsTable.arrivalTime,
        price: tripsTable.price,
      },
    })
      .from(bookingsTable)
      .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .leftJoin(tripsTable, eq(bookingsTable.tripId, tripsTable.id))
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

  // Shuttle: each rider books exactly 1 seat
  if (seatCount !== 1) {
    res.status(400).json({ error: "Shuttle bookings allow exactly 1 seat per booking." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    // SELECT FOR UPDATE: lock the trip row to prevent concurrent overbooking
    const tripResult = await tx.execute(
      sql`SELECT id, status, available_seats, total_seats, vehicle_type, price FROM trips WHERE id = ${tripId} FOR UPDATE`
    );

    type TripRow = { id: number; status: string; available_seats: number; total_seats: number; vehicle_type: string; price: string };
    const tripRow = tripResult.rows[0] as TripRow | undefined;

    if (!tripRow) return { error: "Trip not found", status: 404 };
    const BOOKABLE_STATUSES = ["scheduled", "active", "waiting_driver"];
    if (!BOOKABLE_STATUSES.includes(tripRow.status)) {
      return { error: "Trip is not available for booking", status: 400 };
    }
    if (tripRow.available_seats < seatCount) {
      return { error: "Not enough available seats — this trip is fully booked", status: 400 };
    }

    // Derive capacity thresholds from vehicle type stored on the trip
    const vType = (tripRow.vehicle_type ?? "hiace") as "hiace" | "minibus";
    const shuttleTotalSeats  = VEHICLE_CAPACITY[vType]      ?? tripRow.total_seats;
    const shuttleMinRequired = VEHICLE_MIN_THRESHOLD[vType] ?? Math.ceil(shuttleTotalSeats / 2);

    // Shuttle: prevent duplicate booking by the same user on the same trip
    const dupResult = await tx.execute(
      sql`SELECT id FROM bookings WHERE trip_id = ${tripId} AND user_id = ${req.user!.id} AND status NOT IN ('cancelled') LIMIT 1`
    );
    if (dupResult.rows.length > 0) {
      return { error: "You already have an active booking for this trip", status: 409 };
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

    // Check wallet balance before confirming the booking
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

    // Atomically decrement seats; the WHERE guard ensures it only fires when seats remain
    const decrResult = await tx.execute(
      sql`UPDATE trips SET available_seats = available_seats - ${seatCount} WHERE id = ${tripId} AND available_seats >= ${seatCount} RETURNING available_seats`
    );
    if ((decrResult.rows as unknown[]).length === 0) {
      return { error: "Seat reservation failed — seats may have just been taken", status: 409 };
    }

    // Shuttle: booking status is PENDING (trip confirms when minRequired is met)
    const [booking] = await tx.insert(bookingsTable).values({
      userId: req.user!.id,
      tripId,
      seatCount,
      totalPrice: String(totalPrice),
      status: "pending",
      paymentStatus: "paid",
      promoCodeId,
    }).returning();

    // Deduct wallet balance atomically inside the same transaction
    await tx.execute(
      sql`UPDATE users SET wallet_balance = wallet_balance - ${totalPrice} WHERE id = ${req.user!.id}`
    );

    // Record the wallet deduction as a payment transaction
    await tx.insert(walletTransactionsTable).values({
      userId:      req.user!.id,
      amount:      String(totalPrice),
      type:        "payment",
      description: `Booking #${booking.id} — trip #${tripId} (shuttle)`,
    });

    await tx.insert(paymentsTable).values({
      userId:    req.user!.id,
      bookingId: booking.id,
      amount:    String(totalPrice),
      method:    "wallet",
      status:    "completed",
      notes:     `Booking #${booking.id} — trip #${tripId} (shuttle)`,
    });

    // Shuttle auto-activation: when bookedSeats >= minRequired, mark trip ACTIVE
    const bookedResult = await tx.execute(
      sql`SELECT COALESCE(SUM(seat_count), 0)::int AS total_booked FROM bookings WHERE trip_id = ${tripId} AND status NOT IN ('cancelled')`
    );
    type BookedRow = { total_booked: number };
    const totalBooked = (bookedResult.rows[0] as BookedRow).total_booked;
    if (totalBooked >= shuttleMinRequired) {
      await tx.execute(
        sql`UPDATE trips SET status = 'active' WHERE id = ${tripId} AND status = 'scheduled'`
      );
    }

    return { booking, totalBooked, shuttleTotalSeats, shuttleMinRequired };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }

  const booking        = formatBooking(result.booking as Record<string, unknown>);
  const totalBooked    = result.totalBooked        as number;
  const totalSeats     = result.shuttleTotalSeats  as number;
  const minRequired    = result.shuttleMinRequired as number;
  const availableSeats = totalSeats - totalBooked;
  const shuttleStatus  = totalBooked >= minRequired ? "active" : "open";
  const needed         = Math.max(0, minRequired - totalBooked);

  res.status(201).json({
    ...booking,
    shuttle: {
      totalSeats,
      bookedSeats: totalBooked,
      availableSeats,
      minRequired,
      shuttleStatus,
      message: shuttleStatus === "active"
        ? "Trip is confirmed — boarding guaranteed"
        : `Needs ${needed} more booking${needed !== 1 ? "s" : ""} to become active`,
    },
  });
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

    // NOTE: ACTIVE trips NEVER revert to OPEN/scheduled on cancellation.
    // Allowed transitions: OPEN → ACTIVE → CANCELLED only.

    // Auto-refund on booking cancellation — credits wallet balance in the same transaction
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
