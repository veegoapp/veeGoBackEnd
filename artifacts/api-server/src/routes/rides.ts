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
  promoCodeUsagesTable,
  driverCommissionExemptionsTable,
  sosEventsTable,
  rideShareTokensTable,
  serviceControlsTable,
  carCategoriesTable,
  vehiclesTable,
} from "@workspace/db";
import { loadSetting } from "../lib/settings";
import { updateBonusProgressAfterRide } from "../lib/bonus-targets";
import crypto from "crypto";
import { jobQueue } from "../lib/jobQueue";
import { getCurrentSurge } from "../lib/surge-pricing";
import { startWaitingTimer, stopWaitingTimer } from "../lib/waiting-timer";
import { startNoShowTimer, stopNoShowTimer } from "../lib/no-show-monitor";
import { isCurrentlyPeakHour } from "../lib/peak-hours";
import { checkCriminalRecordThreshold } from "../lib/criminal-record";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { getAllowedDriverCategorySlugs } from "../lib/car-category";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO, clearDeviationState } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
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
    if (!["car", "bike", "delivery", "scooter"].includes(vehicleType)) {
      res.status(400).json({ error: "vehicleType must be 'car', 'bike', 'delivery', or 'scooter'" });
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
  vehicleType: z.enum(["car", "bike", "delivery", "scooter"]),
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
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data", code: "INVALID_REQUEST" });
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

    // For car rides, also include per-category pricing
    let categories: Array<{
      slug: string; name: string; estimatedPrice: number;
      baseFare: number; perKmRate: number; perMinuteRate: number; minimumFare: number;
    }> | undefined;
    if (vehicleType === "car") {
      const carCats = await db
        .select()
        .from(carCategoriesTable)
        .where(eq(carCategoriesTable.isActive, true))
        .orderBy(asc(carCategoriesTable.sortOrder));
      if (carCats.length > 0) {
        categories = carCats.map((cat) => {
          let catPrice = calcPrice(
            parseFloat(cat.baseFare),
            parseFloat(cat.perKmRate),
            parseFloat(cat.minimumFare),
            distanceKm,
          );
          if (isSurge) catPrice *= surgeMultiplier;
          return {
            slug: cat.slug,
            name: cat.name,
            estimatedPrice: parseFloat(catPrice.toFixed(2)),
            baseFare: parseFloat(cat.baseFare),
            perKmRate: parseFloat(cat.perKmRate),
            perMinuteRate: parseFloat(cat.perMinuteRate),
            minimumFare: parseFloat(cat.minimumFare),
          };
        });
      }
    }

    res.json({
      data: {
        distanceKm:             parseFloat(distanceKm.toFixed(3)),
        estimatedDurationMinutes,
        estimatedPrice:         parseFloat(estimatedPrice.toFixed(2)),
        surgeActive:            isSurge,
        surgeMultiplier:        isSurge ? surgeMultiplier : 1,
        pricingSource,
        ...(categories ? { categories } : {}),
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to calculate estimate", code: "INTERNAL_ERROR" });
  }
});

// ─── PASSENGER: ESTIMATE (GET alias — reads query params) ────────────────────
// GET /rides/estimate?pickupLat=&pickupLng=&dropoffLat=&dropoffLng=&serviceType=
// Returns: { estimatedPrice, currency, distanceKm, durationMinutes, ... }

router.get("/rides/estimate", authenticate, async (req, res): Promise<void> => {
  try {
    const { pickupLat, pickupLng, dropoffLat, dropoffLng, serviceType } = req.query;

    const pickupLatitude  = parseFloat(pickupLat  as string);
    const pickupLongitude = parseFloat(pickupLng  as string);
    const dropoffLatitude = parseFloat(dropoffLat as string);
    const dropoffLongitude = parseFloat(dropoffLng as string);
    const vehicleType     = serviceType as string;

    if (
      isNaN(pickupLatitude)  || isNaN(pickupLongitude) ||
      isNaN(dropoffLatitude) || isNaN(dropoffLongitude)
    ) {
      res.status(400).json({
        error: "pickupLat, pickupLng, dropoffLat, dropoffLng must be valid numbers",
        code: "INVALID_REQUEST",
      });
      return;
    }
    if (!["car", "bike", "delivery", "scooter"].includes(vehicleType)) {
      res.status(400).json({
        error: "serviceType must be one of: car, bike, delivery, scooter",
        code: "INVALID_REQUEST",
      });
      return;
    }

    const parsed = EstimateBody.safeParse({
      vehicleType,
      pickupLatitude,
      pickupLongitude,
      dropoffLatitude,
      dropoffLongitude,
    });
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.errors[0]?.message ?? "Invalid parameters",
        code: "INVALID_REQUEST",
      });
      return;
    }

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
    for (const zp of zonePricings) {
      const distToCenter = haversineKm(pickupLatitude, pickupLongitude, zp.centerLat, zp.centerLng);
      if (distToCenter <= zp.radiusKm) {
        activePricing = { baseFare: zp.baseFare, perKmRate: zp.perKmRate, minimumFare: zp.minimumFare };
        break;
      }
    }

    if (!activePricing) {
      const [globalPricing] = await db
        .select()
        .from(ridePricingTable)
        .where(and(eq(ridePricingTable.vehicleType, vehicleType), eq(ridePricingTable.isActive, true)));
      if (!globalPricing) {
        res.status(404).json({ error: "Pricing not available for this service type", code: "PRICING_UNAVAILABLE" });
        return;
      }
      activePricing = globalPricing;
    }

    const distanceKm = haversineKm(pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude);
    const durationMinutes = Math.max(1, Math.round((distanceKm / 30) * 60));
    let estimatedPrice = calcPrice(
      parseFloat(activePricing.baseFare),
      parseFloat(activePricing.perKmRate),
      parseFloat(activePricing.minimumFare),
      distanceKm,
    );

    const surge = getCurrentSurge(vehicleType);
    if (surge.isActive) estimatedPrice = estimatedPrice * surge.multiplier;

    res.json({
      estimatedPrice:  parseFloat(estimatedPrice.toFixed(2)),
      currency:        "EGP",
      distanceKm:      parseFloat(distanceKm.toFixed(3)),
      durationMinutes,
      surgeActive:     surge.isActive,
      surgeMultiplier: surge.isActive ? surge.multiplier : 1,
    });
  } catch {
    res.status(500).json({ error: "Failed to calculate estimate", code: "INTERNAL_ERROR" });
  }
});

// ─── PASSENGER: REQUEST ───────────────────────────────────────────────────────

const RequestRideBody = z.object({
  vehicleType: z.enum(["car", "bike", "delivery", "scooter"]),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  pickupAddress: z.string().min(1),
  dropoffLatitude: z.number().min(-90).max(90),
  dropoffLongitude: z.number().min(-180).max(180),
  dropoffAddress: z.string().min(1),
  promoCode: z.string().optional(),
  categorySlug: z.string().optional(),
  recipientName: z.string().min(1).optional(),
  recipientPhone: z.string().min(1).optional(),
}).superRefine((data, ctx) => {
  if (data.vehicleType === "delivery") {
    if (!data.recipientName) ctx.addIssue({ code: "custom", message: "recipientName is required for delivery", path: ["recipientName"] });
    if (!data.recipientPhone) ctx.addIssue({ code: "custom", message: "recipientPhone is required for delivery", path: ["recipientPhone"] });
  }
});

router.post("/rides/request", authenticate, requireRole("user"), rideRequestLimiter, async (req, res): Promise<void> => {
  try {
    const parsed = RequestRideBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data", code: "INVALID_REQUEST" });
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
      categorySlug,
      recipientName,
      recipientPhone,
    } = parsed.data;
    const userId = req.user!.id;

    // ── Service availability enforcement ─────────────────────────────────────
    const serviceTypeMap: Record<string, "car" | "motorcycle" | "delivery" | "shuttle"> = {
      car: "car", bike: "car", motorcycle: "motorcycle", delivery: "delivery", scooter: "motorcycle",
    };
    const serviceType = serviceTypeMap[vehicleType];
    if (serviceType) {
      const [control] = await db
        .select({ isEnabled: serviceControlsTable.isEnabled, unavailableMessage: serviceControlsTable.unavailableMessage })
        .from(serviceControlsTable)
        .where(eq(serviceControlsTable.serviceType, serviceType));
      if (control && !control.isEnabled) {
        res.status(503).json({
          error: control.unavailableMessage ?? "This service is currently unavailable. Please try again later.",
          code: "SERVICE_DISABLED",
        });
        return;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

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
        code: "RIDE_ALREADY_ACTIVE",
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
      res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
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
        res.status(404).json({ error: "Pricing not available for this vehicle type", code: "PRICING_UNAVAILABLE" });
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
      // Applicable service check — "all" allows any service type
      const applicableService = (promo.applicableService as string | null) ?? "all";
      if (applicableService !== "all" && applicableService !== vehicleType) {
        res.status(400).json({ error: `Promo code is only valid for ${applicableService} rides` });
        return;
      }
      // Minimum ride amount check
      if (promo.minRideAmount !== null) {
        const minAmount = parseFloat(promo.minRideAmount as string);
        if (estimatedPrice < minAmount) {
          res.status(400).json({ error: `Promo code requires a minimum ride amount of ${minAmount.toFixed(2)} EGP` });
          return;
        }
      }
      // Per-user usage limit check
      if (promo.perUserLimit !== null) {
        const [{ userUseCount }] = await db
          .select({ userUseCount: sql<number>`count(*)::int` })
          .from(promoCodeUsagesTable)
          .where(and(eq(promoCodeUsagesTable.promoCodeId, promo.id), eq(promoCodeUsagesTable.userId, userId)));
        if (userUseCount >= promo.perUserLimit) {
          res.status(400).json({ error: "You have already used this promo code the maximum number of times" });
          return;
        }
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

        // Record per-user promo usage inside the same transaction
        await tx.insert(promoCodeUsagesTable).values({ promoCodeId: promoId, userId });
      }

      const [r] = await tx
        .insert(ridesTable)
        .values({
          passengerId: userId,
          vehicleType,
          requestedCategory: vehicleType === "car" && categorySlug ? categorySlug : null,
          pickupLatitude,
          pickupLongitude,
          pickupAddress,
          dropoffLatitude,
          dropoffLongitude,
          dropoffAddress,
          ...(vehicleType === "delivery" ? { recipientName: recipientName ?? null, recipientPhone: recipientPhone ?? null } : {}),
          distanceKm: distanceKm.toFixed(3),
          estimatedDurationMinutes,
          estimatedPrice: discountedPrice.toFixed(2),
          promoCodeId: promoId ?? undefined,
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

    const dispatchVehicleType = vehicleType === "scooter" ? "motorcycle" : vehicleType;
    const dispatchCategorySlugs = vehicleType === "car" && categorySlug
      ? getAllowedDriverCategorySlugs(categorySlug)
      : undefined;

    dispatchManager.startDispatch(
      ride.id,
      userId,
      pickupLatitude,
      pickupLongitude,
      dispatchVehicleType,
      {
        rideId:         ride.id,
        vehicleType,
        pickupAddress,
        dropoffAddress,
        distanceKm:     parseFloat(distanceKm.toFixed(3)),
        estimatedPrice: discountedPrice,
      },
      dispatchCategorySlugs,
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
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ride ID", code: "INVALID_REQUEST" });
      return;
    }
    const userId = req.user!.id;
    const role   = req.user!.role;

    // ── Main ride row — joins passenger, driver, promo code, vehicle ─────────
    const [row] = await db
      .select({
        ride: ridesTable,
        passenger: {
          id:    usersTable.id,
          name:  usersTable.name,
          phone: usersTable.phone,
        },
        driver: {
          id:                driversTable.id,
          name:              driversTable.name,
          phone:             driversTable.phone,
          rating:            driversTable.rating,
          vehicleType:       driversTable.vehicleType,
          currentLatitude:   driversTable.currentLatitude,
          currentLongitude:  driversTable.currentLongitude,
          currentHeading:    driversTable.currentHeading,
          locationUpdatedAt: driversTable.locationUpdatedAt,
        },
        vehicle: {
          plateNumber: vehiclesTable.plateNumber,
          make:        vehiclesTable.make,
          model:       vehiclesTable.model,
          year:        vehiclesTable.year,
          color:       vehiclesTable.color,
        },
        promo: {
          code:          promoCodesTable.code,
          discountType:  promoCodesTable.discountType,
          discountValue: promoCodesTable.discountValue,
        },
      })
      .from(ridesTable)
      .leftJoin(usersTable,      eq(ridesTable.passengerId, usersTable.id))
      .leftJoin(driversTable,    eq(ridesTable.driverId,    driversTable.id))
      .leftJoin(vehiclesTable,   and(
        eq(vehiclesTable.driverId, driversTable.id),
        eq(vehiclesTable.isActive, true),
      ))
      .leftJoin(promoCodesTable, eq(ridesTable.promoCodeId, promoCodesTable.id))
      .where(eq(ridesTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Ride not found", code: "RIDE_NOT_FOUND" });
      return;
    }

    // ── Access control ────────────────────────────────────────────────────────
    if (role === "user" && row.ride.passengerId !== userId) {
      res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      return;
    }

    if (role === "driver") {
      const [driver] = await db
        .select({ id: driversTable.id })
        .from(driversTable)
        .where(eq(driversTable.userId, userId));
      if (!driver || row.ride.driverId !== driver.id) {
        res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
        return;
      }
    }

    // ── Fetch events + passenger rating in parallel ───────────────────────────
    const [events, ratingRow] = await Promise.all([
      db
        .select({
          id:        rideEventsTable.id,
          type:      rideEventsTable.type,
          metadata:  rideEventsTable.metadata,
          createdAt: rideEventsTable.createdAt,
        })
        .from(rideEventsTable)
        .where(eq(rideEventsTable.rideId, id))
        .orderBy(rideEventsTable.createdAt),
      db
        .select({
          id:        ratingsTable.id,
          score:     ratingsTable.score,
          comment:   ratingsTable.comment,
          createdAt: ratingsTable.createdAt,
        })
        .from(ratingsTable)
        .where(and(eq(ratingsTable.rideId, id), eq(ratingsTable.raterId, row.ride.passengerId)))
        .limit(1),
    ]);

    const rideBase = parseRide(row.ride as unknown as Record<string, unknown>);

    res.json({
      data: {
        ...rideBase,

        // ── Passenger ──────────────────────────────────────────────────────
        passenger: row.passenger ?? null,

        // ── Driver (null until assigned) ───────────────────────────────────
        driver: row.driver?.id != null
          ? {
              id:           row.driver.id,
              name:         row.driver.name,
              phone:        row.driver.phone,
              rating:       row.driver.rating != null ? parseFloat(row.driver.rating as string) : null,
              vehicleType:  row.driver.vehicleType ?? null,
              location:     row.driver.currentLatitude != null
                ? {
                    lat:              row.driver.currentLatitude,
                    lng:              row.driver.currentLongitude,
                    heading:          row.driver.currentHeading ?? null,
                    updatedAt:        row.driver.locationUpdatedAt ?? null,
                  }
                : null,
            }
          : null,

        // ── Vehicle (null until driver assigned and vehicle registered) ────
        vehicle: row.vehicle?.plateNumber != null
          ? {
              plateNumber: row.vehicle.plateNumber,
              make:        row.vehicle.make,
              model:       row.vehicle.model,
              year:        row.vehicle.year,
              color:       row.vehicle.color,
            }
          : null,

        // ── Applied promo code ─────────────────────────────────────────────
        promoCode: row.promo?.code != null
          ? {
              code:          row.promo.code,
              discountType:  row.promo.discountType,
              discountValue: row.promo.discountValue != null
                ? parseFloat(row.promo.discountValue as string)
                : null,
            }
          : null,

        // ── Timeline events ────────────────────────────────────────────────
        events: events.map((e) => ({
          id:        e.id,
          type:      e.type,
          metadata:  e.metadata ?? null,
          createdAt: e.createdAt,
        })),

        // ── Passenger rating for this ride (null if not rated yet) ─────────
        rating: ratingRow[0]
          ? {
              score:     parseFloat(ratingRow[0].score as string),
              comment:   ratingRow[0].comment ?? null,
              createdAt: ratingRow[0].createdAt,
            }
          : null,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch ride", code: "INTERNAL_ERROR" });
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
    if (!["requested", "searching", "driver_assigned", "driver_arrived", "active"].includes(ride.status)) {
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

    // ── Arrived flat fee — charged whenever driver has arrived, regardless of
    // how long the passenger waited (applies within AND after the free window).
    // Setting key: "cancellation_fee_arrived" (default: 5.00).
    // This compensates the driver for travelling to the pickup point.
    let arrivedFlatFee = 0;
    if (ride.status === "driver_arrived") {
      const [arrivedFeeSetting] = await db
        .select({ value: settingsTable.value })
        .from(settingsTable)
        .where(eq(settingsTable.key, "cancellation_fee_arrived"));
      arrivedFlatFee = arrivedFeeSetting ? parseFloat(arrivedFeeSetting.value) ?? 5.00 : 5.00;
      if (isNaN(arrivedFlatFee) || arrivedFlatFee < 0) arrivedFlatFee = 5.00;
      cancellationFee = arrivedFlatFee;
    }

    // ── Waiting charge — accrued time after the 3-minute free window ──────────
    // stopWaitingTimer returns 0 if still within the free window, so the rules
    // collapse naturally:
    //   within 3 min  → waitingChargeAmount = 0  → total fee = arrivedFlatFee only
    //   after  3 min  → waitingChargeAmount > 0  → total fee = arrivedFlatFee + accrued
    // Cancel the no-show timer — passenger is cancelling manually.
    stopNoShowTimer(id);

    let waitingChargeAmount = 0;
    if (ride.status === "driver_arrived") {
      const { waitingCharge } = stopWaitingTimer(id);
      waitingChargeAmount = waitingCharge;

      // Fallback: if the in-memory timer was lost (server restart race before
      // initWaitingTimers finished), recompute directly from the DB timestamp.
      if (waitingCharge === 0 && ride.driverArrivedAt) {
        const elapsedMs      = Date.now() - new Date(ride.driverArrivedAt).getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60_000);
        const chargedMinutes = Math.max(0, elapsedMinutes - 3);
        if (chargedMinutes > 0) {
          const [rateSetting] = await db
            .select({ value: settingsTable.value })
            .from(settingsTable)
            .where(eq(settingsTable.key, "waiting_charge_per_minute"));
          const rate = rateSetting ? parseFloat(rateSetting.value) || 2.00 : 2.00;
          waitingChargeAmount = parseFloat((chargedMinutes * rate).toFixed(2));
        }
      }
    }

    const refundAmount = parseFloat(Math.max(0, escrowedAmount - cancellationFee - waitingChargeAmount).toFixed(2));
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
        .set({
          status:       "cancelled",
          cancelReason: "passenger_cancelled",
          cancelledAt:  new Date(),
          // Persist the waiting charge so the record is auditable.
          ...(waitingChargeAmount > 0 ? { waitingCharge: waitingChargeAmount.toFixed(2) } : {}),
        })
        .where(eq(ridesTable.id, id))
        .returning();

      await tx.insert(rideEventsTable).values({
        rideId: id,
        type: "RIDE_CANCELLED",
        metadata: {
          cancelledBy:          "passenger",
          escrowedAmount,
          cancellationFee:      actualFee,
          arrivedFlatFee,
          waitingCharge:        waitingChargeAmount,
          totalDriverCompensation: parseFloat((actualFee + waitingChargeAmount).toFixed(2)),
          refundAmount,
        },
      });

      // Refund the passenger (reduced by cancellation fee and/or waiting charge).
      if (refundAmount > 0) {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${refundAmount}` })
          .where(eq(usersTable.id, ride.passengerId));

        await tx.insert(walletTransactionsTable).values({
          userId:      ride.passengerId,
          amount:      refundAmount.toFixed(2),
          type:        "refund",
          description: (arrivedFlatFee > 0 && waitingChargeAmount > 0)
            ? `Ride #${id} cancelled — refund ${refundAmount.toFixed(2)} (arrived fee ${arrivedFlatFee.toFixed(2)} + waiting ${waitingChargeAmount.toFixed(2)} retained)`
            : arrivedFlatFee > 0
              ? `Ride #${id} cancelled — refund ${refundAmount.toFixed(2)} (arrived fee ${arrivedFlatFee.toFixed(2)} retained)`
              : waitingChargeAmount > 0
                ? `Ride #${id} cancelled — refund ${refundAmount.toFixed(2)} (waiting charge ${waitingChargeAmount.toFixed(2)} retained)`
                : actualFee > 0
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
      }

      // Credit the waiting charge to the driver — compensation for their time.
      if (waitingChargeAmount > 0 && ride.driverId) {
        await tx.insert(driverEarningsTable).values({
          driverId: ride.driverId,
          amount:   waitingChargeAmount.toFixed(2),
          status:   "confirmed",
        });
      }

      // Release the driver so they can accept new rides.
      if (ride.driverId) {
        await tx
          .update(driversTable)
          .set({ status: "online" })
          .where(eq(driversTable.id, ride.driverId));
      }

      return [r];
    });

    // Clean up any in-flight dispatch state for this ride.
    dispatchManager.onCancelled(id).catch((err) => console.error("Dispatch onCancelled error", err));
    clearDeviationState(id);

    // Notify the driver via WebSocket.
    const io = getIO();
    if (io) {
      if (driverUserId !== null) {
        io.to(`driver:${driverUserId}`).emit(SOCKET_EVENTS.RIDE_CANCELLED, {
          rideId:          id,
          cancelledBy:     "passenger",
          reason:          "passenger_cancelled",
          cancellationFee: actualFee,
        });
      }
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId:         id,
        status:         "cancelled",
        previousStatus: ride.status,
        timestamp:      new Date().toISOString(),
        meta: { cancelledBy: "passenger", refundAmount, cancellationFee: actualFee },
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

// ─── DRIVER: ACTIVE RIDE ─────────────────────────────────────────────────────

router.get("/driver/rides/active", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  try {
    const [driver] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, req.user!.id));

    if (!driver) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    const [ride] = await db
      .select()
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.driverId, driver.id),
          sql`${ridesTable.status} IN ('driver_assigned', 'arrived', 'in_trip')`,
        ),
      )
      .orderBy(desc(ridesTable.requestedAt))
      .limit(1);

    if (!ride) {
      res.status(404).json({ error: "No active ride found" });
      return;
    }

    res.json({ data: parseRide(ride as unknown as Record<string, unknown>) });
  } catch {
    res.status(500).json({ error: "Failed to fetch active ride" });
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
    if (driver.vehicleType === "motorcycle") {
      conditions.push(sql`${ridesTable.vehicleType} IN ('motorcycle', 'scooter')` as unknown as ReturnType<typeof eq>);
    } else if (driver.vehicleType) {
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
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId,
        status:         "driver_assigned",
        previousStatus: "searching",
        timestamp:      new Date().toISOString(),
        meta: { driverId: driver.id, driverName: driver.name },
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
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId,
        status:         "driver_arrived",
        previousStatus: "driver_assigned",
        timestamp:      new Date().toISOString(),
        meta: { driverId: driver.id },
      });
    }

    // Start server-side waiting timer. Free window begins now; passenger is
    // notified via WebSocket when it expires and per-minute charging begins.
    // Start no-show timer in parallel — fires if ride doesn't move to active
    // within the configured window (default 10 min).
    const arrivedNow = new Date();
    await Promise.all([
      startWaitingTimer(rideId, ride.passengerId, arrivedNow),
      startNoShowTimer(rideId, arrivedNow),
    ]);

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

    // Waiting ends when the ride starts — lock the charge now and clear all timers.
    stopNoShowTimer(rideId);
    const { waitingCharge: lockedWaitingCharge } = stopWaitingTimer(rideId);
    const [updated] = await db
      .update(ridesTable)
      .set({ status: "active", startedAt: new Date(), waitingCharge: lockedWaitingCharge.toFixed(2) })
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
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId,
        status:         "active",
        previousStatus: "driver_arrived",
        timestamp:      new Date().toISOString(),
        meta: { driverId: driver.id },
      });
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

    // Base fare was escrowed at request time. Waiting charge is an additional
    // amount locked at ride-start (stored in ride.waitingCharge).
    const waitingCharge = ride.waitingCharge ? parseFloat(ride.waitingCharge as string) : 0;
    const finalPrice = (ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0) + waitingCharge;

    // Commission priority: active exemption (0%) > driver personal rate > global rate.
    const now = new Date();
    const [activeExemption] = await db
      .select({ id: driverCommissionExemptionsTable.id })
      .from(driverCommissionExemptionsTable)
      .where(and(
        eq(driverCommissionExemptionsTable.driverId, driver.id),
        eq(driverCommissionExemptionsTable.isActive, true),
        sql`${driverCommissionExemptionsTable.startsAt} <= ${now}`,
        sql`${driverCommissionExemptionsTable.endsAt} >= ${now}`,
      ))
      .limit(1);

    const [driverRow] = await db
      .select({ commissionRate: driversTable.commissionRate })
      .from(driversTable)
      .where(eq(driversTable.id, driver.id));

    let commissionRate: number;
    if (activeExemption) {
      commissionRate = 0;
    } else if (driverRow?.commissionRate !== null && driverRow?.commissionRate !== undefined) {
      commissionRate = parseFloat(driverRow.commissionRate as string);
    } else {
      const commissionSettings = await loadSetting<{ appCommission: number }>("commission", { appCommission: 15 });
      commissionRate = commissionSettings.appCommission / 100;
    }

    const platformCut = parseFloat((finalPrice * commissionRate).toFixed(2));
    const driverCut   = parseFloat((finalPrice - platformCut).toFixed(2));

    // Check peak hours before entering the transaction (async settings read).
    const isPeak = await isCurrentlyPeakHour();
    const commissionSettings = await loadSetting<{ peakBonusRate?: number }>("commission", {});
    const peakBonusRate = commissionSettings.peakBonusRate ?? 0.20;
    const peakBonus = isPeak ? parseFloat((driverCut * peakBonusRate).toFixed(2)) : 0;

    await db.transaction(async (tx) => {
      await tx
        .update(ridesTable)
        .set({ status: "completed", completedAt: new Date(), finalPrice: finalPrice.toFixed(2) })
        .where(eq(ridesTable.id, rideId));

      // Waiting charge is an extra deduction beyond the escrowed base fare.
      if (waitingCharge > 0) {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance - ${waitingCharge}` })
          .where(eq(usersTable.id, ride.passengerId));
        await tx.insert(walletTransactionsTable).values({
          userId:      ride.passengerId,
          amount:      waitingCharge.toFixed(2),
          type:        "payment",
          description: `Ride #${rideId} — waiting charge`,
        });
      }

      // Base fare was escrowed at ride request — no additional base deduction here.
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
        rideId:   rideId,
        amount:   driverCut.toFixed(2),
        type:     activeExemption ? "commission_exemption_saving" : "ride",
        status:   "confirmed",
      });

      if (peakBonus > 0) {
        await tx.insert(driverEarningsTable).values({
          driverId: driver.id,
          rideId:   rideId,
          amount:   peakBonus.toFixed(2),
          type:     "peak_bonus",
          status:   "confirmed",
          notes:    "peak_hours_bonus",
        });
      }

      await tx.update(driversTable).set({ status: "online" }).where(eq(driversTable.id, driver.id));
    });

    // Update bonus target progress (non-fatal)
    updateBonusProgressAfterRide(driver.id, ride.vehicleType, finalPrice).catch(
      (err) => console.error("Bonus progress update error (PATCH complete):", err),
    );

    await db.insert(rideEventsTable).values({
      rideId,
      type: "RIDE_COMPLETED",
      metadata: { driverId: driver.id, finalPrice, waitingCharge },
    });

    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_COMPLETED, { rideId, finalPrice, fare: finalPrice, waitingCharge });
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId,
        status:         "completed",
        previousStatus: "active",
        timestamp:      new Date().toISOString(),
        meta: { finalPrice, waitingCharge },
      });
    }
    clearDeviationState(rideId);

    // Fix 2: Criminal record enforcement after threshold trips/rides
    try {
      await checkCriminalRecordThreshold(driver.id, userId);
    } catch (_crimErr) {
      // Non-fatal; ride completion already saved
    }

    res.json({ data: { rideId, finalPrice, driverCut, waitingCharge } });
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
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STARTED, { rideId, driverId: driver.id });
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId,
        status:         "active",
        previousStatus: "driver_arrived",
        timestamp:      new Date().toISOString(),
        meta: { driverId: driver.id },
      });
    }

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

    // Base fare escrowed at request time; waiting charge locked at ride-start.
    const waitingCharge = ride.waitingCharge ? parseFloat(ride.waitingCharge as string) : 0;
    const finalPrice = (ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0) + waitingCharge;

    // Commission priority: active exemption (0%) > driver personal rate > global rate.
    const nowPost = new Date();
    const [activeExemptionPost] = await db
      .select({ id: driverCommissionExemptionsTable.id })
      .from(driverCommissionExemptionsTable)
      .where(and(
        eq(driverCommissionExemptionsTable.driverId, driver.id),
        eq(driverCommissionExemptionsTable.isActive, true),
        sql`${driverCommissionExemptionsTable.startsAt} <= ${nowPost}`,
        sql`${driverCommissionExemptionsTable.endsAt} >= ${nowPost}`,
      ))
      .limit(1);

    const [driverRowPost] = await db
      .select({ commissionRate: driversTable.commissionRate })
      .from(driversTable)
      .where(eq(driversTable.id, driver.id));

    let commissionRatePost: number;
    if (activeExemptionPost) {
      commissionRatePost = 0;
    } else if (driverRowPost?.commissionRate !== null && driverRowPost?.commissionRate !== undefined) {
      commissionRatePost = parseFloat(driverRowPost.commissionRate as string);
    } else {
      const commissionSettingsPost = await loadSetting<{ appCommission: number }>("commission", { appCommission: 15 });
      commissionRatePost = commissionSettingsPost.appCommission / 100;
    }

    const platformCutPost = parseFloat((finalPrice * commissionRatePost).toFixed(2));
    const driverCut       = parseFloat((finalPrice - platformCutPost).toFixed(2));

    const isPeakPost = await isCurrentlyPeakHour();
    const commissionSettingsPost2 = await loadSetting<{ peakBonusRate?: number }>("commission", {});
    const peakBonusRatePost = commissionSettingsPost2.peakBonusRate ?? 0.20;
    const peakBonusPost = isPeakPost ? parseFloat((driverCut * peakBonusRatePost).toFixed(2)) : 0;

    await db.transaction(async (tx) => {
      await tx.update(ridesTable)
        .set({ status: "completed", completedAt: new Date(), finalPrice: finalPrice.toFixed(2) })
        .where(eq(ridesTable.id, rideId));

      if (waitingCharge > 0) {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance - ${waitingCharge}` })
          .where(eq(usersTable.id, ride.passengerId));
        await tx.insert(walletTransactionsTable).values({
          userId:      ride.passengerId,
          amount:      waitingCharge.toFixed(2),
          type:        "payment",
          description: `Ride #${rideId} — waiting charge`,
        });
      }

      await tx.insert(paymentsTable).values({
        userId:  ride.passengerId,
        rideId:  rideId,
        amount:  finalPrice.toFixed(2),
        method:  "wallet",
        status:  "completed",
        notes:   `Ride #${rideId} (${ride.vehicleType}) — ${distanceKm.toFixed(1)} km`,
      });
      await tx.insert(driverEarningsTable).values({
        driverId: driver.id,
        rideId:   rideId,
        amount:   driverCut.toFixed(2),
        type:     activeExemptionPost ? "commission_exemption_saving" : "ride",
        status:   "confirmed",
      });
      if (peakBonusPost > 0) {
        await tx.insert(driverEarningsTable).values({
          driverId: driver.id,
          rideId:   rideId,
          amount:   peakBonusPost.toFixed(2),
          type:     "peak_bonus",
          status:   "confirmed",
          notes:    "peak_hours_bonus",
        });
      }
      await tx.update(driversTable).set({ status: "online" }).where(eq(driversTable.id, driver.id));
    });

    // Update bonus target progress (non-fatal)
    updateBonusProgressAfterRide(driver.id, ride.vehicleType, finalPrice).catch(
      (err) => console.error("Bonus progress update error (POST complete):", err),
    );

    await db.insert(rideEventsTable).values({ rideId, type: "RIDE_COMPLETED", metadata: { driverId: driver.id, finalPrice, waitingCharge } });

    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_COMPLETED, { rideId, finalPrice, fare: finalPrice, waitingCharge });
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId,
        status:         "completed",
        previousStatus: "active",
        timestamp:      new Date().toISOString(),
        meta: { finalPrice, waitingCharge },
      });
    }
    clearDeviationState(rideId);

    // Fix 2: Criminal record enforcement after threshold trips/rides
    try {
      await checkCriminalRecordThreshold(driver.id, userId);
    } catch (_crimErr) {
      // Non-fatal; ride completion already saved
    }

    res.json({ data: { rideId, finalPrice, driverCut, waitingCharge } });
  } catch {
    res.status(500).json({ error: "Failed to complete ride" });
  }
});

// ─── DRIVER: PATCH /driver/rides/:id/decline (canonical) ─────────────────────

router.patch("/driver/rides/:id/decline", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
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

    // Stop waiting charge and no-show timers — driver cancelled while arrived.
    stopNoShowTimer(rideId);
    stopWaitingTimer(rideId);
    clearDeviationState(rideId);

    // Notify passenger before re-dispatch so they know what's happening.
    const io = getIO();
    if (io) {
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_DRIVER_CANCELLED, {
        rideId,
        message: "Your driver cancelled. Finding you a new driver...",
      });
      io.to(`passenger:${ride.passengerId}`).emit(SOCKET_EVENTS.RIDE_STATUS_CHANGED, {
        rideId,
        status:         "searching",
        previousStatus: ride.status,
        timestamp:      new Date().toISOString(),
        meta: { cancelledBy: "driver", message: "Your driver cancelled. Finding you a new driver..." },
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

    const restartVehicleType = ride.vehicleType === "scooter" ? "motorcycle" : ride.vehicleType;
    await dispatchManager.restartDispatch(
      rideId,
      ride.passengerId,
      ride.pickupLatitude,
      ride.pickupLongitude,
      restartVehicleType,
      offerPayload,
    );

    res.json({ data: { rideId, status: "searching", message: "Re-dispatching to available drivers" } });
  } catch {
    res.status(500).json({ error: "Failed to cancel ride" });
  }
});

/**
 * POST /rides/:id/share
 * Generates (or returns an existing valid) shareable tracking link for an active ride.
 *
 * Auth: passenger only — caller must be the ride's passenger.
 * Ride must be in an active state: requested | driver_arrived | in_progress.
 *
 * Idempotent: if a non-expired token already exists for this ride, the same
 * token is returned without creating a duplicate row.
 *
 * Returns 201 { token, url, expiresAt }.
 */
const SHARE_TTL_MS       = 24 * 60 * 60 * 1000; // 24 h
const SHAREABLE_STATUSES = ["requested", "driver_arrived", "in_progress"] as const;

router.post("/:id/share", authenticate, async (req: Request, res): Promise<void> => {
  try {
    const rideId   = parseInt(req.params.id as string);
    if (isNaN(rideId)) { res.status(400).json({ error: "Invalid ride id" }); return; }

    const callerId: number = (req as any).user.id;

    const [ride] = await db
      .select({ passengerId: ridesTable.passengerId, status: ridesTable.status })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId));

    if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
    if (ride.passengerId !== callerId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!SHAREABLE_STATUSES.includes(ride.status as any)) {
      res.status(409).json({ error: "Ride is not active", rideStatus: ride.status });
      return;
    }

    // Check for an existing valid (non-expired) token for this ride.
    const now = new Date();
    const [existing] = await db
      .select({ token: rideShareTokensTable.token, expiresAt: rideShareTokensTable.expiresAt })
      .from(rideShareTokensTable)
      .where(eq(rideShareTokensTable.rideId, rideId))
      .orderBy(desc(rideShareTokensTable.createdAt))
      .limit(1);

    if (existing && new Date(existing.expiresAt) > now) {
      const base = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:8080";
      res.status(201).json({ token: existing.token, url: `${base}/api/track/${existing.token}`, expiresAt: existing.expiresAt });
      return;
    }

    // Generate a fresh 192-bit URL-safe token.
    const token     = crypto.randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + SHARE_TTL_MS);

    await db.insert(rideShareTokensTable).values({ rideId, token, expiresAt });

    const base = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:8080";

    res.status(201).json({ token, url: `${base}/api/track/${token}`, expiresAt });
  } catch {
    res.status(500).json({ error: "Failed to generate share link" });
  }
});

/**
 * POST /rides/:id/sos
 * Triggered by a passenger or driver during an active ride to signal an emergency.
 *
 * Validation:
 *  - Ride must exist and be in an active state (driver_arrived or in_progress).
 *  - Caller must be the ride's passenger OR the assigned driver.
 *
 * Side effects:
 *  - Inserts a row into sos_events.
 *  - Emits sos:triggered to admin:room immediately.
 *
 * Returns 201 { sosId, message }.
 */
const sosBodySchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  notes:     z.string().max(500).optional(),
});

const ACTIVE_RIDE_STATUSES = ["driver_arrived", "in_progress"] as const;

router.post("/:id/sos", authenticate, async (req: Request, res): Promise<void> => {
  try {
    const rideId = parseInt(req.params.id as string);
    if (isNaN(rideId)) { res.status(400).json({ error: "Invalid ride id" }); return; }

    const parsed = sosBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }

    const { latitude, longitude, notes } = parsed.data;
    const callerId: number = (req as any).user.id;
    const callerRole: string = (req as any).user.role;

    const [ride] = await db
      .select({
        id:          ridesTable.id,
        passengerId: ridesTable.passengerId,
        driverId:    ridesTable.driverId,
        status:      ridesTable.status,
      })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId));

    if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }

    if (!ACTIVE_RIDE_STATUSES.includes(ride.status as any)) {
      res.status(409).json({ error: "SOS can only be triggered on an active ride", rideStatus: ride.status });
      return;
    }

    // Verify the caller is a party to this ride.
    // For drivers, resolve their driverId from the drivers table.
    let role: "passenger" | "driver";

    if (ride.passengerId === callerId) {
      role = "passenger";
    } else if (callerRole === "driver") {
      const [driver] = await db
        .select({ id: driversTable.id })
        .from(driversTable)
        .where(eq(driversTable.userId, callerId));

      if (!driver || driver.id !== ride.driverId) {
        res.status(403).json({ error: "You are not a party to this ride" });
        return;
      }
      role = "driver";
    } else {
      res.status(403).json({ error: "You are not a party to this ride" });
      return;
    }

    const [sos] = await db
      .insert(sosEventsTable)
      .values({ userId: callerId, rideId, role, latitude, longitude, notes: notes ?? null })
      .returning({ id: sosEventsTable.id, triggeredAt: sosEventsTable.triggeredAt });

    const io = getIO();
    if (io) {
      io.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.SOS_TRIGGERED, {
        sosId:       sos.id,
        rideId,
        userId:      callerId,
        role,
        latitude,
        longitude,
        notes:       notes ?? null,
        triggeredAt: sos.triggeredAt,
      });
    }

    res.status(201).json({ sosId: sos.id, message: "SOS received" });
  } catch {
    res.status(500).json({ error: "Failed to record SOS" });
  }
});

export default router;
