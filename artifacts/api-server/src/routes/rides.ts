import { Router } from "express";
import type { Request } from "express";
import {
  db,
  ridesTable,
  rideEventsTable,
  ridePricingTable,
  usersTable,
  driversTable,
  walletTransactionsTable,
  driverEarningsTable,
  zonesTable,
  zonePricingTable,
  settingsTable,
  paymentsTable,
  ratingsTable,
  promoCodesTable,
} from "@workspace/db";
import { jobQueue } from "../lib/jobQueue";
import { getCurrentSurge } from "../lib/surge-pricing";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS } from "../lib/socket-events";
import { z } from "zod";
import * as dispatchManager from "../lib/dispatch-manager";
import rateLimit from "express-rate-limit";

const RIDE_REQUEST_WINDOW_MS = parseInt(process.env.RIDE_REQUEST_RATE_WINDOW_MS ?? "120000", 10);
const RIDE_REQUEST_MAX       = parseInt(process.env.RIDE_REQUEST_RATE_MAX        ?? "3",      10);

const rideRequestLimiter = rateLimit({
  windowMs:  RIDE_REQUEST_WINDOW_MS,
  max:       RIDE_REQUEST_MAX,
  keyGenerator: (req: Request) => `user:${req.user!.id}`,
  standardHeaders: true,
  legacyHeaders:   false,
  validate:  { xForwardedForHeader: false },
  handler: (_req, res) => {
    const retryAfterSeconds = Math.ceil(RIDE_REQUEST_WINDOW_MS / 1000);
    res.status(429).json({
      error: `Too many ride requests. You can request at most ${RIDE_REQUEST_MAX} rides per ${retryAfterSeconds / 60} minutes.`,
      retryAfterSeconds,
    });
  },
  skip: (req: Request) => !req.user,
});

const router = Router();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

function parsePricing(p: Record<string, unknown>) {
  return {
    ...p,
    baseFare: parseFloat(p.baseFare as string),
    perKmRate: parseFloat(p.perKmRate as string),
    perMinuteRate: parseFloat(p.perMinuteRate as string),
    minimumFare: parseFloat(p.minimumFare as string),
  };
}

function parseRide(r: Record<string, unknown>) {
  return {
    ...r,
    distanceKm: r.distanceKm != null ? parseFloat(r.distanceKm as string) : null,
    estimatedPrice: r.estimatedPrice != null ? parseFloat(r.estimatedPrice as string) : null,
    finalPrice: r.finalPrice != null ? parseFloat(r.finalPrice as string) : null,
  };
}

// ─── ADMIN: PRICING ──────────────────────────────────────────────────────────

router.get("/admin/rides/pricing", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(ridePricingTable).orderBy(ridePricingTable.vehicleType);
    res.json({ data: rows.map((r) => parsePricing(r as unknown as Record<string, unknown>)) });
  } catch {
    res.status(500).json({ error: "Failed to fetch pricing" });
  }
});

const UpdatePricingBody = z.object({
  baseFare: z.number().positive().optional(),
  perKmRate: z.number().nonnegative().optional(),
  perMinuteRate: z.number().nonnegative().optional(),
  minimumFare: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});

router.patch("/admin/rides/pricing/:vehicleType", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const vehicleType = req.params.vehicleType as string;
    if (!["car", "bike"].includes(vehicleType)) {
      res.status(400).json({ error: "vehicleType must be 'car' or 'bike'" });
      return;
    }
    const parsed = UpdatePricingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
      return;
    }
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.baseFare !== undefined) updates.baseFare = d.baseFare.toString();
    if (d.perKmRate !== undefined) updates.perKmRate = d.perKmRate.toString();
    if (d.perMinuteRate !== undefined) updates.perMinuteRate = d.perMinuteRate.toString();
    if (d.minimumFare !== undefined) updates.minimumFare = d.minimumFare.toString();
    if (d.isActive !== undefined) updates.isActive = d.isActive;

    const [updated] = await db
      .update(ridePricingTable)
      .set(updates as any)
      .where(eq(ridePricingTable.vehicleType, vehicleType))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Pricing not found for vehicle type" });
      return;
    }
    res.json({ data: parsePricing(updated as unknown as Record<string, unknown>) });
  } catch {
    res.status(500).json({ error: "Failed to update pricing" });
  }
});

// ─── ADMIN: RIDES ─────────────────────────────────────────────────────────────

router.get("/admin/rides", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const { vehicleType, status, driverId, passengerId, page = "1", limit = "20" } =
      req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [];
    if (vehicleType) conditions.push(eq(ridesTable.vehicleType, vehicleType));
    if (status) conditions.push(eq(ridesTable.status, status));
    if (driverId) conditions.push(eq(ridesTable.driverId, parseInt(driverId)));
    if (passengerId) conditions.push(eq(ridesTable.passengerId, parseInt(passengerId)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(ridesTable).where(where),
      db
        .select({
          ride: ridesTable,
          passenger: { id: usersTable.id, name: usersTable.name, phone: usersTable.phone },
          driver: { id: driversTable.id, name: driversTable.name, phone: driversTable.phone },
        })
        .from(ridesTable)
        .leftJoin(usersTable, eq(ridesTable.passengerId, usersTable.id))
        .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
        .where(where)
        .orderBy(desc(ridesTable.createdAt))
        .limit(limitNum)
        .offset(offset),
    ]);

    const total = countRows[0]?.count ?? 0;
    res.json({
      data: rows.map((r) => ({
        ...parseRide(r.ride as unknown as Record<string, unknown>),
        passenger: r.passenger,
        driver: r.driver,
      })),
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch rides" });
  }
});

router.get("/admin/rides/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) {
      res.status(400).json({ error: "Invalid ride ID" });
      return;
    }

    const [row] = await db
      .select({
        ride: ridesTable,
        passenger: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          phone: usersTable.phone,
        },
        driver: {
          id: driversTable.id,
          name: driversTable.name,
          phone: driversTable.phone,
          rating: driversTable.rating,
        },
      })
      .from(ridesTable)
      .leftJoin(usersTable, eq(ridesTable.passengerId, usersTable.id))
      .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
      .where(eq(ridesTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }

    const events = await db
      .select()
      .from(rideEventsTable)
      .where(eq(rideEventsTable.rideId, id))
      .orderBy(rideEventsTable.createdAt);

    res.json({
      data: {
        ...parseRide(row.ride as unknown as Record<string, unknown>),
        passenger: row.passenger,
        driver: row.driver
          ? { ...row.driver, rating: typeof row.driver.rating === "string" ? parseFloat(row.driver.rating as string) : row.driver.rating }
          : row.driver,
        events,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch ride" });
  }
});

// ─── PASSENGER: ESTIMATE ─────────────────────────────────────────────────────

const EstimateBody = z.object({
  vehicleType: z.enum(["car", "bike"]),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  dropoffLatitude: z.number().min(-90).max(90),
  dropoffLongitude: z.number().min(-180).max(180),
});

// FIXED: zone pricing + surge pricing in ride estimate
router.post("/rides/estimate", authenticate, async (req, res): Promise<void> => {
  try {
    const parsed = EstimateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
      return;
    }
    const { vehicleType, pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude } = parsed.data;

    // FIXED: apply zone pricing — look up zones and zone-specific rates for pickup location
    const zonePricings = await db
      .select({
        baseFare:    zonePricingTable.baseFare,
        perKmRate:   zonePricingTable.perKmRate,
        minimumFare: zonePricingTable.minimumFare,
        centerLat:   zonesTable.centerLat,
        centerLng:   zonesTable.centerLng,
        radiusKm:    zonesTable.radiusKm,
        zoneName:    zonesTable.name,
      })
      .from(zonePricingTable)
      .innerJoin(zonesTable, eq(zonePricingTable.zoneId, zonesTable.id))
      .where(and(
        eq(zonePricingTable.vehicleType, vehicleType),
        eq(zonePricingTable.isActive, true),
        eq(zonesTable.isActive, true),
      ));

    let activePricing: { baseFare: string; perKmRate: string; minimumFare: string } | null = null;
    let pricingSource = "global";

    for (const zp of zonePricings) {
      const distToCenter = haversineKm(pickupLatitude, pickupLongitude, zp.centerLat, zp.centerLng);
      if (distToCenter <= zp.radiusKm) {
        activePricing = { baseFare: zp.baseFare, perKmRate: zp.perKmRate, minimumFare: zp.minimumFare };
        pricingSource = `zone:${zp.zoneName}`;
        break;
      }
    }

    if (!activePricing) {
      const [globalPricing] = await db
        .select()
        .from(ridePricingTable)
        .where(and(eq(ridePricingTable.vehicleType, vehicleType), eq(ridePricingTable.isActive, true)));
      if (!globalPricing) {
        res.status(404).json({ error: "Pricing not available for this vehicle type" });
        return;
      }
      activePricing = globalPricing;
    }

    const distanceKm = haversineKm(pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude);
    const estimatedDurationMinutes = Math.max(1, Math.round((distanceKm / 30) * 60));
    let estimatedPrice = calcPrice(
      parseFloat(activePricing.baseFare),
      parseFloat(activePricing.perKmRate),
      parseFloat(activePricing.minimumFare),
      distanceKm,
    );

    // Automatic surge pricing — O(1) read from the in-memory store kept current
    // by the background job; no DB round-trip required here.
    const surge = getCurrentSurge(vehicleType);
    const surgeMultiplier = surge.multiplier;
    const isSurge = surge.isActive;
    if (isSurge) estimatedPrice = estimatedPrice * surgeMultiplier;

    res.json({
      data: {
        distanceKm:             parseFloat(distanceKm.toFixed(3)),
        estimatedDurationMinutes,
        estimatedPrice:         parseFloat(estimatedPrice.toFixed(2)),
        surgeActive:            isSurge,
        surgeMultiplier:        isSurge ? surgeMultiplier : 1,
        pricingSource,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to calculate estimate" });
  }
});

// ─── PASSENGER: REQUEST ───────────────────────────────────────────────────────

const RequestRideBody = z.object({
  vehicleType: z.enum(["car", "bike"]),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  pickupAddress: z.string().min(1),
  dropoffLatitude: z.number().min(-90).max(90),
  dropoffLongitude: z.number().min(-180).max(180),
  dropoffAddress: z.string().min(1),
  promoCode: z.string().optional(),
});

router.post("/rides/request", authenticate, requireRole("user"), rideRequestLimiter, async (req, res): Promise<void> => {
  try {
    const parsed = RequestRideBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
      return;
    }
    const {
      vehicleType,
      pickupLatitude,
      pickupLongitude,
      pickupAddress,
      dropoffLatitude,
      dropoffLongitude,
      dropoffAddress,
      promoCode,
    } = parsed.data;
    const userId = req.user!.id;

    const [activeRide] = await db
      .select({ id: ridesTable.id, status: ridesTable.status })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.passengerId, userId),
          sql`${ridesTable.status} IN ('searching', 'driver_assigned')`,
        ),
      )
      .limit(1);

    if (activeRide) {
      res.status(409).json({
        error: "You already have an active ride request",
        activeRideId: activeRide.id,
        activeStatus: activeRide.status,
      });
      return;
    }

    const [[user], zonePricings] = await Promise.all([
      db
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId)),
      db
        .select({
          baseFare:    zonePricingTable.baseFare,
          perKmRate:   zonePricingTable.perKmRate,
          minimumFare: zonePricingTable.minimumFare,
          centerLat:   zonesTable.centerLat,
          centerLng:   zonesTable.centerLng,
          radiusKm:    zonesTable.radiusKm,
          zoneName:    zonesTable.name,
        })
        .from(zonePricingTable)
        .innerJoin(zonesTable, eq(zonePricingTable.zoneId, zonesTable.id))
        .where(and(
          eq(zonePricingTable.vehicleType, vehicleType),
          eq(zonePricingTable.isActive, true),
          eq(zonesTable.isActive, true),
        )),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let activePricing: { baseFare: string; perKmRate: string; minimumFare: string } | null = null;
    let pricingSource = "global";

    for (const zp of zonePricings) {
      const distToCenter = haversineKm(pickupLatitude, pickupLongitude, zp.centerLat, zp.centerLng);
      if (distToCenter <= zp.radiusKm) {
        activePricing = { baseFare: zp.baseFare, perKmRate: zp.perKmRate, minimumFare: zp.minimumFare };
        pricingSource = `zone:${zp.zoneName}`;
        break;
      }
    }

    if (!activePricing) {
      const [globalPricing] = await db
        .select()
        .from(ridePricingTable)
        .where(and(eq(ridePricingTable.vehicleType, vehicleType), eq(ridePricingTable.isActive, true)));
      if (!globalPricing) {
        res.status(404).json({ error: "Pricing not available for this vehicle type" });
        return;
      }
      activePricing = globalPricing;
    }

    const distanceKm = haversineKm(pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude);
    const estimatedDurationMinutes = Math.max(1, Math.round((distanceKm / 30) * 60));

    let estimatedPrice = calcPrice(
      parseFloat(activePricing.baseFare),
      parseFloat(activePricing.perKmRate),
      parseFloat(activePricing.minimumFare),
      distanceKm,
    );

    // Automatic surge pricing — O(1) in-memory read; no extra DB round-trip.
    const surge = getCurrentSurge(vehicleType);
    const surgeMultiplier = surge.multiplier;
    const isSurge = surge.isActive;
    if (isSurge) estimatedPrice = estimatedPrice * surgeMultiplier;

    // ── Promo code validation & discount ──────────────────────────────────────
    let promoId: number | null = null;
    let discountAmount = 0;
    let discountedPrice = estimatedPrice;

    if (promoCode) {
      const [promo] = await db
        .select()
        .from(promoCodesTable)
        .where(eq(promoCodesTable.code, promoCode));

      if (!promo || !promo.isActive) {
        res.status(400).json({ error: "Promo code not found or inactive" });
        return;
      }
      if (promo.expiryDate && new Date(promo.expiryDate) < new Date()) {
        res.status(400).json({ error: "Promo code has expired" });
        return;
      }
      if (promo.maxUsage !== null && promo.usedCount >= promo.maxUsage) {
        res.status(400).json({ error: "Promo code usage limit reached" });
        return;
      }

      const discountValue = parseFloat(promo.discountValue as string);
      if (promo.discountType === "percentage") {
        discountAmount = parseFloat(((estimatedPrice * discountValue) / 100).toFixed(2));
      } else {
        discountAmount = parseFloat(Math.min(discountValue, estimatedPrice).toFixed(2));
      }
      discountedPrice = parseFloat((estimatedPrice - discountAmount).toFixed(2));
      promoId = promo.id;
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (parseFloat(user.walletBalance as string) < discountedPrice) {
      res.status(402).json({
        error: "Insufficient wallet balance",
        required: parseFloat(discountedPrice.toFixed(2)),
        balance: parseFloat(user.walletBalance as string),
      });
      return;
    }

    const [ride] = await db.transaction(async (tx) => {
      // Atomically increment usedCount only if under the limit.
      // This prevents a race condition where two concurrent requests both
      // pass the pre-check and then both increment past maxUsage.
      if (promoId !== null) {
        const updated = await tx
          .update(promoCodesTable)
          .set({ usedCount: sql`used_count + 1` })
          .where(
            and(
              eq(promoCodesTable.id, promoId),
              sql`(max_usage IS NULL OR used_count < max_usage)`,
            ),
          )
          .returning({ id: promoCodesTable.id });

        if (updated.length === 0) {
          throw Object.assign(new Error("Promo code usage limit reached"), { code: "PROMO_LIMIT_REACHED" });
        }
      }

      const [r] = await tx
        .insert(ridesTable)
        .values({
          passengerId: userId,
          vehicleType,
          pickupLatitude,
          pickupLongitude,
          pickupAddress,
          dropoffLatitude,
          dropoffLongitude,
          dropoffAddress,
          distanceKm: distanceKm.toFixed(3),
          estimatedDurationMinutes,
          estimatedPrice: discountedPrice.toFixed(2),
          status: "searching",
        })
        .returning();

      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance - ${discountedPrice}` })
        .where(eq(usersTable.id, userId));

      const txDescription = promoCode
        ? `Ride #${r.id} — payment held (promo ${promoCode}: -${discountAmount.toFixed(2)})`
        : `Ride #${r.id} — payment held`;

      await tx.insert(walletTransactionsTable).values({
        userId,
        amount: discountedPrice.toFixed(2),
        type: "payment",
        description: txDescription,
      });

      return [r];
    });

    await db.insert(rideEventsTable).values({
      rideId: ride.id,
      type: "RIDE_REQUESTED",
      metadata: {
        passengerId:     userId,
        vehicleType,
        pricingSource,
        surgeActive:     isSurge,
        surgeMultiplier: isSurge ? surgeMultiplier : 1,
        ...(promoCode ? { promoCode, discountAmount } : {}),
      },
    });

    dispatchManager.startDispatch(
      ride.id,
      userId,
      pickupLatitude,
      pickupLongitude,
      vehicleType,
      {
        rideId:         ride.id,
        vehicleType,
        pickupAddress,
        dropoffAddress,
        distanceKm:     parseFloat(distanceKm.toFixed(3)),
        estimatedPrice: discountedPrice,
      },
    ).catch((err) => console.error("Dispatch start error", err));

    res.status(201).json({ data: parseRide(ride as unknown as Record<string, unknown>) });
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "PROMO_LIMIT_REACHED") {
      res.status(409).json({ error: "Promo code usage limit reached" });
      return;
    }
    res.status(500).json({ error: "Failed to create ride request" });
  }
});

// ─── PASSENGER: MY RIDES ─────────────────────────────────────────────────────

router.get("/rides/my", authenticate, requireRole("user"), async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { vehicleType, status, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(ridesTable.passengerId, userId)];
    if (vehicleType) conditions.push(eq(ridesTable.vehicleType, vehicleType));
    if (status) conditions.push(eq(ridesTable.status, status));

    const where = and(...conditions);

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(ridesTable).where(where),
      db
        .select()
        .from(ridesTable)
        .where(where)
        .orderBy(desc(ridesTable.createdAt))
        .limit(limitNum)
        .offset(offset),
    ]);

    res.json({
      data: rows.map((r) => parseRide(r as unknown as Record<string, unknown>)),
      meta: { total: countRows[0]?.count ?? 0, page: pageNum, limit: limitNum },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch rides" });
  }
});

// ─── PASSENGER/DRIVER/ADMIN: GET SINGLE RIDE ────────────────────────────────

router.get("/rides/:id", authenticate, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.user!.id;
    const role = req.user!.role;

    const [row] = await db
      .select({
        ride: ridesTable,
        passenger: { id: usersTable.id, name: usersTable.name, phone: usersTable.phone },
        driver: { id: driversTable.id, name: driversTable.name, phone: driversTable.phone },
      })
      .from(ridesTable)
      .leftJoin(usersTable, eq(ridesTable.passengerId, usersTable.id))
      .leftJoin(driversTable, eq(ridesTable.driverId, driversTable.id))
      .where(eq(ridesTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }

    if (role === "user" && row.ride.passengerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (role === "driver") {
      const [driver] = await db
        .select({ id: driversTable.id })
        .from(driversTable)
        .where(eq(driversTable.userId, userId));
      if (!driver || row.ride.driverId !== driver.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    res.json({
      data: {
        ...parseRide(row.ride as unknown as Record<string, unknown>),
        passenger: row.passenger,
        driver: row.driver,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch ride" });
  }
});

// ─── PASSENGER: CANCEL RIDE ──────────────────────────────────────────────────

router.patch("/rides/:id/cancel", authenticate, requireRole("user"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, id));
    if (!ride) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }
    if (ride.passengerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!["requested", "searching", "driver_assigned", "active"].includes(ride.status)) {
      res.status(400).json({ error: `Cannot cancel a ride with status '${ride.status}'` });
      return;
    }

    const escrowedAmount = ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0;

    // ── Cancellation fee — only applies when the trip is already active ────────
    // The fee is paid to the driver as compensation for the started trip.
    // Setting key: "active_ride_cancellation_fee" (stored as a numeric string).
    // Defaults to 0 if the key is absent, meaning full refund outside active rides.
    let cancellationFee = 0;
    if (ride.status === "active") {
      const [feeSetting] = await db
        .select({ value: settingsTable.value })
        .from(settingsTable)
        .where(eq(settingsTable.key, "active_ride_cancellation_fee"));
      cancellationFee = feeSetting ? parseFloat(feeSetting.value) || 0 : 0;
    }

    const refundAmount = parseFloat(Math.max(0, escrowedAmount - cancellationFee).toFixed(2));
    const actualFee    = parseFloat(Math.min(cancellationFee, escrowedAmount).toFixed(2));
    // ─────────────────────────────────────────────────────────────────────────

    // Resolve driver user-ID upfront (needed for both transaction and socket).
    let driverUserId: number | null = null;
    if (ride.driverId) {
      const [drv] = await db
        .select({ id: driversTable.id, userId: driversTable.userId })
        .from(driversTable)
        .where(eq(driversTable.id, ride.driverId));
      if (drv) driverUserId = drv.userId;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [r] = await tx
        .update(ridesTable)
        .set({ status: "cancelled", cancelReason: "passenger_cancelled", cancelledAt: new Date() })
        .where(eq(ridesTable.id, id))
        .returning();

      await tx.insert(rideEventsTable).values({
        rideId: id,
        type: "RIDE_CANCELLED",
        metadata: {
          cancelledBy:     "passenger",
          escrowedAmount,
          cancellationFee: actualFee,
          refundAmount,
        },
      });

      // Refund the passenger (possibly reduced by the cancellation fee).
      if (refundAmount > 0) {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${refundAmount}` })
          .where(eq(usersTable.id, ride.passengerId));

        await tx.insert(walletTransactionsTable).values({
          userId:      ride.passengerId,
          amount:      refundAmount.toFixed(2),
          type:        "refund",
          description: actualFee > 0
            ? `Ride #${id} cancelled — refund ${refundAmount.toFixed(2)} (fee ${actualFee.toFixed(2)} retained)`
            : `Ride #${id} cancelled — payment refunded`,
        });
      }

      // Credit the cancellation fee to the driver's earnings.
      if (actualFee > 0 && ride.driverId) {
        await tx.insert(driverEarningsTable).values({
          driverId: ride.driverId,
          amount:   actualFee.toFixed(2),
          status:   "confirmed",
        });

        // Free the driver so they can accept new rides.
        await tx
          .update(driversTable)
          .set({ status: "online" })
          .where(eq(driversTable.id, ride.driverId));
      } else if (ride.driverId) {
        // No fee but driver was active — still release them.
        await tx
          .update(driversTable)
          .set({ status: "online" })
          .where(eq(driversTable.id, ride.driverId));
      }

      return [r];
    });

    // Clean up any in-flight dispatch state for this ride.
    dispatchManager.onCancelled(id).catch((err) => console.error("Dispatch onCancelled error", err));

    // Notify the driver via WebSocket.
    const io = getIO();
    if (io && driverUserId !== null) {
      io.to(`driver:${driverUserId}`).emit(SOCKET_EVENTS.RIDE_CANCELLED, {
        rideId:          id,
        cancelledBy:     "passenger",
        reason:          "passenger_cancelled",
        cancellationFee: actualFee,
      });
    }

    res.json({
      data: {
        ...parseRide(updated as unknown as Record<string, unknown>),
        refundAmount,
        cancellationFee: actualFee,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to cancel ride" });
  }
});

// ─── DRIVER: AVAILABLE RIDES ─────────────────────────────────────────────────

router.get("/driver/rides/available", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [driver] = await db
      .select({ id: driversTable.id, isOnline: driversTable.isOnline, vehicleType: driversTable.vehicleType })
      .from(driversTable)
      .where(eq(driversTable.userId, userId));

    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }
    if (!driver.isOnline) {
      res.status(403).json({ error: "Driver must be online to view available rides" });
      return;
    }

    const conditions: ReturnType<typeof eq>[] = [eq(ridesTable.status, "searching")];
    if (driver.vehicleType) {
      conditions.push(eq(ridesTable.vehicleType, driver.vehicleType));
    }

    const rides = await db
      .select()
      .from(ridesTable)
      .where(and(...conditions))
      .orderBy(desc(ridesTable.requestedAt));

    res.json({ data: rides.map((r) => parseRide(r as unknown as Record<string, unknown>)) });
  } catch {
    res.status(500).json({ error: "Failed to fetch available rides" });
  }
});

// ─── DRIVER: ACCEPT RIDE ──────────────────────────────────────────────────────

router.patch("/driver/rides/:id/accept", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db
      .select({ id: driversTable.id, name: driversTable.name, phone: driversTable.phone, vehicleType: driversTable.vehicleType, rating: driversTable.rating })
      .from(driversTable)
      .where(eq(driversTable.userId, userId));
    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId));
    if (!ride) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }
    if (ride.status !== "searching") {
      res.status(409).json({ error: `Ride is no longer available (status: ${ride.status})` });
      return;
    }

    const [updated] = await db
      .update(ridesTable)
      .set({ status: "driver_assigned", driverId: driver.id, driverAssignedAt: new Date() })
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.status, "searching")))
      .returning();

    if (!updated) {
      res.status(409).json({ error: "Ride was just taken by another driver" });
      return;
    }

    await Promise.all([
      db.update(driversTable).set({ status: "busy" }).where(eq(driversTable.id, driver.id)),
      db.insert(rideEventsTable).values({
        rideId,
        type: "DRIVER_ASSIGNED",
        metadata: { driverId: driver.id, driverName: driver.name },
      }),
      dispatchManager.onAccepted(rideId, driver.id),
    ]);

    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_DRIVER_ASSIGNED, {
        rideId,
        driverId: driver.id,
        driverName: driver.name,
        driver: {
          name: driver.name,
          phone: driver.phone ?? "",
          vehicle: driver.vehicleType ?? "",
          rating: driver.rating != null ? parseFloat(driver.rating as string) : 5.0,
        },
        eta: 5,
      });
    }

    res.json({ data: parseRide(updated as unknown as Record<string, unknown>) });
  } catch {
    res.status(500).json({ error: "Failed to accept ride" });
  }
});

// ─── DRIVER: ARRIVED ─────────────────────────────────────────────────────────

router.patch("/driver/rides/:id/arrived", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, userId));
    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) {
      res.status(404).json({ error: "Ride not found or not assigned to you" });
      return;
    }
    if (ride.status !== "driver_assigned") {
      res.status(400).json({ error: `Cannot mark arrived for ride with status '${ride.status}'` });
      return;
    }

    const [updated] = await db
      .update(ridesTable)
      .set({ status: "driver_arrived", driverArrivedAt: new Date() })
      .where(eq(ridesTable.id, rideId))
      .returning();

    await db.insert(rideEventsTable).values({
      rideId,
      type: "DRIVER_ARRIVED",
      metadata: { driverId: driver.id },
    });

    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_DRIVER_ARRIVED, { rideId, driverId: driver.id });
    }

    res.json({ data: parseRide(updated as unknown as Record<string, unknown>) });
  } catch {
    res.status(500).json({ error: "Failed to update ride" });
  }
});

// ─── DRIVER: START RIDE ──────────────────────────────────────────────────────

router.patch("/driver/rides/:id/start", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, userId));
    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) {
      res.status(404).json({ error: "Ride not found or not assigned to you" });
      return;
    }
    if (ride.status !== "driver_arrived") {
      res.status(400).json({ error: `Cannot start ride with status '${ride.status}'` });
      return;
    }

    const [updated] = await db
      .update(ridesTable)
      .set({ status: "active", startedAt: new Date() })
      .where(eq(ridesTable.id, rideId))
      .returning();

    await db.insert(rideEventsTable).values({
      rideId,
      type: "RIDE_STARTED",
      metadata: { driverId: driver.id },
    });

    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STARTED, { rideId, driverId: driver.id });
    }

    res.json({ data: parseRide(updated as unknown as Record<string, unknown>) });
  } catch {
    res.status(500).json({ error: "Failed to start ride" });
  }
});

// ─── DRIVER: COMPLETE RIDE ───────────────────────────────────────────────────

router.patch("/driver/rides/:id/complete", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, userId));
    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) {
      res.status(404).json({ error: "Ride not found or not assigned to you" });
      return;
    }
    if (ride.status !== "active") {
      res.status(400).json({ error: `Cannot complete ride with status '${ride.status}'` });
      return;
    }

    const distanceKm = ride.distanceKm ? parseFloat(ride.distanceKm as string) : 0;

    // Use the stored estimatedPrice (which already reflects correct zone + surge pricing
    // applied at request time). The wallet was escrowed for exactly this amount, so we
    // do NOT deduct from the wallet again here.
    const finalPrice = ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0;

    const [commissionSetting] = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, "driver_commission_rate"));
    // commissionRate is the PLATFORM cut (e.g. 0.15 = 15%).
    // Driver receives the remainder: (1 - commissionRate).
    const commissionRate = commissionSetting ? parseFloat(commissionSetting.value) || 0.15 : 0.15;
    const platformCut = parseFloat((finalPrice * commissionRate).toFixed(2));
    const driverCut   = parseFloat((finalPrice - platformCut).toFixed(2));

    await db.transaction(async (tx) => {
      await tx
        .update(ridesTable)
        .set({ status: "completed", completedAt: new Date(), finalPrice: finalPrice.toFixed(2) })
        .where(eq(ridesTable.id, rideId));

      // Wallet was already escrowed at ride request — no deduction here.
      // The paymentsTable record below is the settlement confirmation.
      await tx.insert(paymentsTable).values({
        userId: ride.passengerId,
        rideId: rideId,
        amount: finalPrice.toFixed(2),
        method: "wallet",
        status: "completed",
        notes:  `Ride #${rideId} (${ride.vehicleType}) — ${distanceKm.toFixed(1)} km`,
      });

      await tx.insert(driverEarningsTable).values({
        driverId: driver.id,
        amount:   driverCut.toFixed(2),
        status:   "confirmed",
      });

      await tx.update(driversTable).set({ status: "online" }).where(eq(driversTable.id, driver.id));
    });

    await db.insert(rideEventsTable).values({
      rideId,
      type: "RIDE_COMPLETED",
      metadata: { driverId: driver.id, finalPrice },
    });

    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_COMPLETED, { rideId, finalPrice, fare: finalPrice });
    }

    res.json({ data: { rideId, finalPrice, driverCut } });
  } catch {
    res.status(500).json({ error: "Failed to complete ride" });
  }
});

// TODO (deprecated): POST /driver/rides/:id/start — use PATCH /driver/rides/:id/start.
// This POST alias is kept for backward compatibility.

router.post("/driver/rides/:id/start", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, userId));
    if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

    const [ride] = await db.select().from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) { res.status(404).json({ error: "Ride not found or not assigned to you" }); return; }
    if (ride.status !== "driver_arrived") {
      res.status(400).json({ error: `Cannot start ride with status '${ride.status}'` });
      return;
    }

    const [updated] = await db.update(ridesTable)
      .set({ status: "active", startedAt: new Date() })
      .where(eq(ridesTable.id, rideId))
      .returning();

    await db.insert(rideEventsTable).values({ rideId, type: "RIDE_STARTED", metadata: { driverId: driver.id } });

    const io = getIO();
    if (io) io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STARTED, { rideId, driverId: driver.id });

    res.json({ data: parseRide(updated as unknown as Record<string, unknown>) });
  } catch {
    res.status(500).json({ error: "Failed to start ride" });
  }
});

// TODO (deprecated): POST /driver/rides/:id/complete — use PATCH /driver/rides/:id/complete.
// This POST alias is kept for backward compatibility.

router.post("/driver/rides/:id/complete", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, userId));
    if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

    const [ride] = await db.select().from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) { res.status(404).json({ error: "Ride not found or not assigned to you" }); return; }
    if (ride.status !== "active") {
      res.status(400).json({ error: `Cannot complete ride with status '${ride.status}'` });
      return;
    }

    const distanceKm = ride.distanceKm ? parseFloat(ride.distanceKm as string) : 0;

    // Use the stored estimatedPrice — wallet was escrowed at request time for exactly this
    // amount, so we must NOT recalculate from ridePricingTable or deduct from wallet again.
    const finalPrice = ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0;

    const [commissionSettingPost] = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, "driver_commission_rate"));
    // commissionRatePost is the PLATFORM cut (e.g. 0.15 = 15%).
    // Driver receives the remainder: (1 - commissionRatePost).
    const commissionRatePost = commissionSettingPost ? parseFloat(commissionSettingPost.value) || 0.15 : 0.15;
    const platformCutPost = parseFloat((finalPrice * commissionRatePost).toFixed(2));
    const driverCut       = parseFloat((finalPrice - platformCutPost).toFixed(2));

    await db.transaction(async (tx) => {
      await tx.update(ridesTable)
        .set({ status: "completed", completedAt: new Date(), finalPrice: finalPrice.toFixed(2) })
        .where(eq(ridesTable.id, rideId));

      // Wallet was already escrowed at ride request — no deduction here.
      // The paymentsTable record is the settlement confirmation.
      await tx.insert(paymentsTable).values({
        userId:  ride.passengerId,
        rideId:  rideId,
        amount:  finalPrice.toFixed(2),
        method:  "wallet",
        status:  "completed",
        notes:   `Ride #${rideId} (${ride.vehicleType}) — ${distanceKm.toFixed(1)} km`,
      });
      await tx.insert(driverEarningsTable).values({ driverId: driver.id, amount: driverCut.toFixed(2), status: "confirmed" });
      await tx.update(driversTable).set({ status: "online" }).where(eq(driversTable.id, driver.id));
    });

    await db.insert(rideEventsTable).values({ rideId, type: "RIDE_COMPLETED", metadata: { driverId: driver.id, finalPrice } });

    const io = getIO();
    if (io) io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_COMPLETED, { rideId, finalPrice, fare: finalPrice });

    res.json({ data: { rideId, finalPrice, driverCut } });
  } catch {
    res.status(500).json({ error: "Failed to complete ride" });
  }
});

// TODO (deprecated): POST /driver/rides/:id/decline — use PATCH /driver/rides/:id/decline.
// This POST alias is kept for backward compatibility.

router.post("/driver/rides/:id/decline", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, userId));
    if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

    const [ride] = await db.select().from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) { res.status(404).json({ error: "Ride not found or not assigned to you" }); return; }
    if (!["driver_assigned", "searching"].includes(ride.status)) {
      res.status(400).json({ error: `Cannot decline ride with status '${ride.status}'` });
      return;
    }

    const [updated] = await db.update(ridesTable)
      .set({ status: "searching", driverId: null, driverAssignedAt: null })
      .where(eq(ridesTable.id, rideId))
      .returning();

    await Promise.all([
      db.update(driversTable).set({ status: "online" }).where(eq(driversTable.id, driver.id)),
      db.insert(rideEventsTable).values({ rideId, type: "RIDE_DECLINED", metadata: { driverId: driver.id } }),
    ]);

    const io = getIO();
    if (io) {
      io.to(`drivers:available:${ride.vehicleType}`).emit(SOCKET_EVENTS.RIDE_NEW_REQUEST, {
        rideId,
        vehicleType: ride.vehicleType,
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        distanceKm: ride.distanceKm ? parseFloat(ride.distanceKm as string) : null,
        estimatedPrice: ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : null,
      });
    }

    res.json({ data: parseRide(updated as unknown as Record<string, unknown>) });
  } catch {
    res.status(500).json({ error: "Failed to decline ride" });
  }
});

// ─── DRIVER: POST /driver/rides/:id/rate-rider ────────────────────────────────

const RateRiderBody = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

router.post("/driver/rides/:id/rate-rider", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const parsed = RateRiderBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, userId));
    if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

    const [ride] = await db.select().from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) { res.status(404).json({ error: "Ride not found or not assigned to you" }); return; }
    if (ride.status !== "completed") {
      res.status(400).json({ error: "Can only rate rider after ride is completed" });
      return;
    }

    const alreadyRated = await db.select({ id: rideEventsTable.id }).from(rideEventsTable)
      .where(and(eq(rideEventsTable.rideId, rideId), eq(rideEventsTable.type, "RIDER_RATED")));
    if (alreadyRated.length > 0) {
      res.status(409).json({ error: "Rider already rated for this ride" });
      return;
    }

    await db.insert(rideEventsTable).values({
      rideId,
      type: "RIDER_RATED",
      metadata: { driverId: driver.id, riderId: ride.passengerId, rating: parsed.data.rating, comment: parsed.data.comment ?? null },
    });

    res.status(201).json({ ok: true, rideId, rating: parsed.data.rating });
  } catch {
    res.status(500).json({ error: "Failed to rate rider" });
  }
});

// FIXED: passenger rates driver — updates drivers.rating average
const RateDriverBody = z.object({
  rating:  z.number().min(1).max(5),
  comment: z.string().optional(),
});

router.post("/rides/:id/rate-driver", authenticate, requireRole("user"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const parsedBody = RateDriverBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.errors[0]?.message ?? "Invalid data" });
      return;
    }
    const { rating, comment } = parsedBody.data;

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId));
    if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
    if (ride.passengerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (ride.status !== "completed") {
      res.status(400).json({ error: "Can only rate driver after ride is completed" });
      return;
    }
    if (!ride.driverId) {
      res.status(400).json({ error: "No driver assigned to this ride" });
      return;
    }

    const alreadyRated = await db.select({ id: rideEventsTable.id }).from(rideEventsTable)
      .where(and(eq(rideEventsTable.rideId, rideId), eq(rideEventsTable.type, "DRIVER_RATED")));
    if (alreadyRated.length > 0) {
      res.status(409).json({ error: "Driver already rated for this ride" });
      return;
    }

    await db.insert(rideEventsTable).values({
      rideId,
      type:     "DRIVER_RATED",
      metadata: { driverId: ride.driverId, riderId: userId, rating, comment: comment ?? null },
    });

    jobQueue.enqueue("rating", {
      raterId:  userId,
      driverId: ride.driverId,
      rideId:   rideId,
      context:  "ride",
      score:    String(rating),
      comment:  comment ?? null,
    });

    // FIXED: recalculate and update drivers.rating as the average of all DRIVER_RATED events
    const allRatings = await db
      .select({ metadata: rideEventsTable.metadata })
      .from(rideEventsTable)
      .where(and(
        eq(rideEventsTable.type, "DRIVER_RATED"),
        sql`(${rideEventsTable.metadata}->>'driverId')::int = ${ride.driverId}`,
      ));

    const ratingValues = allRatings
      .map(r => (r.metadata as { rating?: number })?.rating)
      .filter((r): r is number => typeof r === "number");

    if (ratingValues.length > 0) {
      const avgRating = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
      await db.update(driversTable)
        .set({ rating: avgRating.toFixed(2) })
        .where(eq(driversTable.id, ride.driverId));
    }

    res.status(201).json({ ok: true, rideId, rating });
  } catch {
    res.status(500).json({ error: "Failed to rate driver" });
  }
});

// ─── DRIVER: CANCEL RIDE ─────────────────────────────────────────────────────

router.patch("/driver/rides/:id/cancel", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    const userId = req.user!.id;

    const [driver] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, userId));
    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(and(eq(ridesTable.id, rideId), eq(ridesTable.driverId, driver.id)));
    if (!ride) {
      res.status(404).json({ error: "Ride not found or not assigned to you" });
      return;
    }
    if (!["driver_assigned", "driver_arrived"].includes(ride.status)) {
      res.status(400).json({ error: `Cannot cancel ride with status '${ride.status}'` });
      return;
    }

    // Reset ride to searching state — unassign the driver so re-dispatch can
    // find a new one. The wallet escrow remains intact; no refund is issued.
    await db.transaction(async (tx) => {
      await tx
        .update(ridesTable)
        .set({ status: "searching", driverId: null })
        .where(eq(ridesTable.id, rideId));

      await tx
        .update(driversTable)
        .set({ status: "online" })
        .where(eq(driversTable.id, driver.id));

      await tx.insert(rideEventsTable).values({
        rideId,
        type:     "DRIVER_CANCELLED",
        metadata: { driverId: driver.id, previousStatus: ride.status },
      });
    });

    // Notify passenger before re-dispatch so they know what's happening.
    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_DRIVER_CANCELLED, {
        rideId,
        message: "Your driver cancelled. Finding you a new driver...",
      });
    }

    // Re-start the dispatch cycle from scratch (all drivers eligible again).
    const offerPayload = {
      rideId,
      vehicleType:    ride.vehicleType,
      pickupAddress:  ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      distanceKm:     Number(ride.distanceKm ?? 0),
      estimatedPrice: Number(ride.estimatedPrice ?? 0),
    };

    await dispatchManager.restartDispatch(
      rideId,
      ride.passengerId,
      ride.pickupLatitude,
      ride.pickupLongitude,
      ride.vehicleType,
      offerPayload,
    );

    res.json({ data: { rideId, status: "searching", message: "Re-dispatching to available drivers" } });
  } catch {
    res.status(500).json({ error: "Failed to cancel ride" });
  }
});

export default router;
