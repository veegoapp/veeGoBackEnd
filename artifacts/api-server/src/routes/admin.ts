import { Router } from "express";
import { db, usersTable, tripsTable, bookingsTable, busesTable, driversTable, walletTransactionsTable, driverEarningsTable, tripEventsTable, routesTable, notificationsTable, promoCodesTable, sosEventsTable, ridesTable } from "@workspace/db";
import { loadSetting, saveSetting } from "../lib/settings";
import { getAllSurgeStates } from "../lib/surge-pricing";
import { eq, sql, and, or, ilike, desc, asc, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { jobQueue, type JobType } from "../lib/jobQueue";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
import {
  ListAdminUsersQueryParams,
  GetAdminUserParams,
  UpdateAdminUserParams,
  UpdateAdminUserBody,
  ToggleBlockUserParams,
} from "@workspace/api-zod";

// ─── Settings: default values ─────────────────────────────────────────────────

const CommissionPatchBody = z.object({
  appCommission: z.number().min(0).max(100).optional(),
  driverShare: z.number().min(0).max(100).optional(),
  payoutSchedule: z.enum(["daily", "weekly", "monthly"]).optional(),
  minimumPayout: z.number().min(0).optional(),
});

type CommissionSettings = { appCommission: number; driverShare: number; payoutSchedule: "daily" | "weekly" | "monthly"; minimumPayout: number };
const defaultCommission: CommissionSettings = { appCommission: 15, driverShare: 85, payoutSchedule: "weekly", minimumPayout: 100 };

// ─── Service settings ─────────────────────────────────────────────────────────
type ServiceType = "car" | "shuttle" | "bike";

type ServiceSettings = {
  isEnabled: boolean;
  minDriverRating: number;
  requiredLicenseTypes: string[];
  requireInsurance: boolean;
  requireBackgroundCheck: boolean;
  maxActiveRidesPerDriver: number;
};

const defaultServiceSettings: ServiceSettings = {
  isEnabled: true,
  minDriverRating: 3.5,
  requiredLicenseTypes: ["standard"],
  requireInsurance: true,
  requireBackgroundCheck: true,
  maxActiveRidesPerDriver: 1,
};

const defaultServices: Record<ServiceType, ServiceSettings> = {
  car: { ...defaultServiceSettings, requiredLicenseTypes: ["standard", "commercial"] },
  shuttle: { ...defaultServiceSettings, minDriverRating: 4.0, requiredLicenseTypes: ["commercial", "cdl"], maxActiveRidesPerDriver: 1 },
  bike: { ...defaultServiceSettings, minDriverRating: 3.0, requiredLicenseTypes: ["standard"], requireInsurance: false },
};

const ServiceSettingsPatchBody = z.object({
  isEnabled: z.boolean().optional(),
  minDriverRating: z.number().min(0).max(5).optional(),
  requiredLicenseTypes: z.array(z.string()).optional(),
  requireInsurance: z.boolean().optional(),
  requireBackgroundCheck: z.boolean().optional(),
  maxActiveRidesPerDriver: z.number().int().min(1).max(10).optional(),
});

// ─── Surge settings ───────────────────────────────────────────────────────────
type SurgeSettings = { isEnabled: boolean; multiplier: number; maxMultiplier: number; activeHoursStart: string; activeHoursEnd: string; activeZoneIds: number[]; triggerThreshold: number };
const defaultSurge: SurgeSettings = { isEnabled: false, multiplier: 1.5, maxMultiplier: 3.0, activeHoursStart: "07:00", activeHoursEnd: "09:00", activeZoneIds: [], triggerThreshold: 70 };

const SurgeSettingsPatchBody = z.object({
  isEnabled: z.boolean().optional(),
  multiplier: z.number().min(1).max(5).optional(),
  maxMultiplier: z.number().min(1).max(5).optional(),
  activeHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeZoneIds: z.array(z.number().int().positive()).optional(),
  triggerThreshold: z.number().min(0).max(100).optional(),
});

const router = Router();

router.get("/admin/settings/commission", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const settings = await loadSetting<CommissionSettings>("commission", defaultCommission);
  res.json(settings);
});

router.patch("/admin/settings/commission", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CommissionPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const current = await loadSetting<CommissionSettings>("commission", defaultCommission);
  const updated = { ...current, ...parsed.data };
  await saveSetting("commission", updated);
  res.json(updated);
});

// ─── Service settings ─────────────────────────────────────────────────────────
router.get("/admin/services/:type/settings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const type = req.params.type as ServiceType;
  if (!["car", "shuttle", "bike"].includes(type)) {
    res.status(400).json({ error: "Invalid service type" }); return;
  }
  const settings = await loadSetting<ServiceSettings>(`service:${type}`, defaultServices[type]);
  res.json(settings);
});

router.patch("/admin/services/:type/settings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const type = req.params.type as ServiceType;
  if (!["car", "shuttle", "bike"].includes(type)) {
    res.status(400).json({ error: "Invalid service type" }); return;
  }
  const parsed = ServiceSettingsPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const current = await loadSetting<ServiceSettings>(`service:${type}`, defaultServices[type]);
  const updated = { ...current, ...parsed.data };
  await saveSetting(`service:${type}`, updated);
  res.json(updated);
});

// ─── Surge pricing settings ────────────────────────────────────────────────────
router.get("/admin/surge-settings", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const config = await loadSetting<SurgeSettings>("surge", defaultSurge);
  res.json({
    ...config,
    // Live automatic surge state per vehicle type — read from the in-memory
    // store kept current by the background job (no DB round-trip).
    intervalMs: parseInt(process.env.SURGE_INTERVAL_MS ?? "300000", 10),
    liveState:  getAllSurgeStates(),
  });
});

router.patch("/admin/surge-settings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = SurgeSettingsPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const current = await loadSetting<SurgeSettings>("surge", defaultSurge);
  const updated = { ...current, ...parsed.data };
  await saveSetting("surge", updated);
  res.json({
    ...updated,
    intervalMs: parseInt(process.env.SURGE_INTERVAL_MS ?? "300000", 10),
    liveState:  getAllSurgeStates(),
  });
});

function safeUser(user: Record<string, unknown>) {
  const { password, refreshToken, ...rest } = user;
  return { ...rest, walletBalance: typeof rest.walletBalance === "string" ? parseFloat(rest.walletBalance as string) : rest.walletBalance };
}

// ─── Queue status ─────────────────────────────────────────────────────────────
router.get("/admin/queue/status", authenticate, requireRole("admin"), (_req, res): void => {
  const dlq = jobQueue.deadLetterQueue;

  const failuresByType = dlq.reduce<Record<string, number>>((acc, entry) => {
    const t = entry.job.type as string;
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  const recentDeadLetters = dlq
    .slice(-20)
    .reverse()
    .map((entry) => ({
      jobId: entry.job.id,
      type: entry.job.type,
      attempt: entry.job.attempt,
      maxAttempts: entry.job.maxAttempts,
      lastError: entry.lastError,
      failedAt: new Date(entry.failedAt).toISOString(),
      createdAt: new Date(entry.job.createdAt).toISOString(),
    }));

  res.json({
    pendingCount: jobQueue.pendingCount,
    deadLetterCount: dlq.length,
    failuresByType,
    recentDeadLetters,
    asOf: new Date().toISOString(),
  });
});

// ─── Retry a dead-letter job ──────────────────────────────────────────────────
router.post("/admin/queue/retry/:jobId", authenticate, requireRole("admin"), (req, res): void => {
  const { jobId } = req.params;
  if (!jobId) { res.status(400).json({ error: "Missing jobId" }); return; }
  const ok = jobQueue.retryFromDLQ(jobId);
  if (!ok) { res.status(404).json({ error: "Job not found in dead-letter queue" }); return; }
  res.json({ success: true, jobId, pendingCount: jobQueue.pendingCount });
});

// ─── Retry all dead-letter jobs ───────────────────────────────────────────────
router.post("/admin/queue/retry-all", authenticate, requireRole("admin"), (_req, res): void => {
  const dlq = jobQueue.deadLetterQueue;
  let retriedCount = 0;
  for (const entry of dlq) {
    if (jobQueue.retryFromDLQ(entry.job.id)) retriedCount++;
  }
  res.json({ success: true, retriedCount, pendingCount: jobQueue.pendingCount });
});

// Analytics
router.get("/admin/analytics", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const [
    userCount,
    activeTripCount,
    bookingStats,
    revenueStat,
    activeBuses,
    activeDrivers,
    revenueByDay,
    recentBookings,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
    db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(eq(tripsTable.status, "active")),
    db.select({
      status: bookingsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(bookingsTable).groupBy(bookingsTable.status),
    db.select({ total: sql<number>`sum(total_price)::float` }).from(bookingsTable).where(eq(bookingsTable.status, "confirmed")),
    db.select({ count: sql<number>`count(*)::int` }).from(busesTable).where(eq(busesTable.isActive, true)),
    db.select({ count: sql<number>`count(*)::int` }).from(driversTable).where(eq(driversTable.isActive, true)),
    db.execute(sql`
      SELECT 
        DATE(created_at)::text as date,
        SUM(total_price)::float as revenue,
        COUNT(*)::int as bookings
      FROM bookings
      WHERE status = 'confirmed' AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
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
    }).from(bookingsTable).orderBy(bookingsTable.createdAt).limit(10),
  ]);

  const bookingsByStatus = { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
  for (const s of bookingStats) {
    bookingsByStatus[s.status as keyof typeof bookingsByStatus] = s.count;
  }

  res.json({
    totalUsers: userCount[0].count,
    activeTrips: activeTripCount[0].count,
    totalBookings: Object.values(bookingsByStatus).reduce((a, b) => a + b, 0),
    totalRevenue: revenueStat[0].total ?? 0,
    activeBuses: activeBuses[0].count,
    activeDrivers: activeDrivers[0].count,
    bookingsByStatus,
    revenueByDay: revenueByDay.rows,
    recentBookings: recentBookings.map(b => ({ ...b, totalPrice: parseFloat(b.totalPrice) })),
  });
});

// Users management
router.get("/admin/users", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListAdminUsersQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { search, role, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) conditions.push(ilike(usersTable.name, `%${search}%`));
  if (role) conditions.push(eq(usersTable.role, role as "user" | "driver" | "admin"));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select().from(usersTable).where(where).limit(limit).offset(offset).orderBy(usersTable.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(where),
  ]);

  res.json({ data: data.map(u => safeUser(u as Record<string, unknown>)), total: countResult[0].count, page, limit });
});

// ─── GET /admin/drivers — list all drivers with user info ────────────────────
router.get("/admin/drivers", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const page  = Math.max(1, parseInt((req.query.page  as string) ?? "1")  || 1);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20") || 20));
  const offset = (page - 1) * limit;

  const search = req.query.search ? String(req.query.search).trim() : null;
  const status = req.query.status ? String(req.query.status).trim() : null;

  const conditions = [];
  if (search) conditions.push(
    or(
      ilike(usersTable.name,  `%${search}%`),
      ilike(usersTable.email, `%${search}%`),
      ilike(usersTable.phone, `%${search}%`),
    )
  );
  if (status) conditions.push(eq(driversTable.status, status as "offline" | "online" | "busy" | "suspended"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select({
      id:               driversTable.id,
      userId:           driversTable.userId,
      name:             driversTable.name,
      phone:            driversTable.phone,
      email:            usersTable.email,
      licenseNumber:    driversTable.licenseNumber,
      nationalId:       driversTable.nationalId,
      rating:           driversTable.rating,
      vehicleType:      driversTable.vehicleType,
      assignedBusId:    driversTable.assignedBusId,
      isOnline:         driversTable.isOnline,
      status:           driversTable.status,
      isActive:         driversTable.isActive,
      isBlocked:        usersTable.isBlocked,
      walletBalance:    usersTable.walletBalance,
      totalDispatched:  driversTable.totalDispatched,
      totalAccepted:    driversTable.totalAccepted,
      createdAt:        driversTable.createdAt,
    })
      .from(driversTable)
      .leftJoin(usersTable, eq(driversTable.userId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(driversTable.createdAt)),
    db.select({ count: sql<number>`count(*)::int` })
      .from(driversTable)
      .leftJoin(usersTable, eq(driversTable.userId, usersTable.id))
      .where(where),
  ]);

  res.json({ data, total: countResult[0].count, page, limit });
});

// ─── Search users by name/phone/email (must come before /:id) ────────────────
router.get("/admin/users/search", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ data: [] }); return; }
  const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, role: usersTable.role })
    .from(usersTable)
    .where(or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.phone, `%${q}%`), ilike(usersTable.email, `%${q}%`)))
    .limit(10);
  res.json({ data: users });
});

router.get("/admin/users/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = GetAdminUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(safeUser(user as Record<string, unknown>));
});

router.patch("/admin/users/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateAdminUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(safeUser(updated as Record<string, unknown>));
});

router.patch("/admin/users/:id/toggle-block", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ToggleBlockUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [user] = await db.select({ isBlocked: usersTable.isBlocked }).from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db.update(usersTable).set({ isBlocked: !user.isBlocked }).where(eq(usersTable.id, params.data.id)).returning();
  res.json(safeUser(updated as Record<string, unknown>));
});

// Driver analytics
router.get("/admin/driver-analytics", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const [
    totalDrivers,
    onlineDrivers,
    busyDrivers,
    suspendedDrivers,
    earningsTotals,
    topEarners,
    recentEarnings,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(driversTable),
    db.select({ count: sql<number>`count(*)::int` }).from(driversTable).where(eq(driversTable.status, "online")),
    db.select({ count: sql<number>`count(*)::int` }).from(driversTable).where(eq(driversTable.status, "busy")),
    db.select({ count: sql<number>`count(*)::int` }).from(driversTable).where(eq(driversTable.status, "suspended")),
    db.select({
      total: sql<number>`COALESCE(SUM(amount), 0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(driverEarningsTable),
    db.execute(sql`
      SELECT d.id, d.name, d.rating,
             COALESCE(SUM(e.amount), 0)::float as total_earnings,
             COUNT(e.id)::int as trip_count
      FROM drivers d
      LEFT JOIN driver_earnings e ON e.driver_id = d.id
      GROUP BY d.id, d.name, d.rating
      ORDER BY total_earnings DESC
      LIMIT 10
    `),
    db.select().from(driverEarningsTable).orderBy(desc(driverEarningsTable.date)).limit(20),
  ]);

  res.json({
    totalDrivers: totalDrivers[0].count,
    onlineDrivers: onlineDrivers[0].count,
    busyDrivers: busyDrivers[0].count,
    suspendedDrivers: suspendedDrivers[0].count,
    totalEarningsPaid: earningsTotals[0].total,
    totalTripsCompleted: earningsTotals[0].count,
    topEarners: topEarners.rows,
    recentEarnings: recentEarnings.map(e => ({ ...e, amount: parseFloat(e.amount as string) })),
  });
});

// Online drivers list (for live tracking)
router.get("/admin/drivers/live", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const drivers = await db.select({
    id: driversTable.id,
    name: driversTable.name,
    phone: driversTable.phone,
    status: driversTable.status,
    isOnline: driversTable.isOnline,
    rating: driversTable.rating,
    currentLatitude: driversTable.currentLatitude,
    currentLongitude: driversTable.currentLongitude,
    currentSpeed: driversTable.currentSpeed,
    currentHeading: driversTable.currentHeading,
    assignedBusId: driversTable.assignedBusId,
    updatedAt: driversTable.updatedAt,
  }).from(driversTable).where(eq(driversTable.isActive, true));

  const activeTrips = await db.select({
    id: tripsTable.id,
    driverId: tripsTable.driverId,
    routeId: tripsTable.routeId,
    status: tripsTable.status,
    departureTime: tripsTable.departureTime,
    arrivalTime: tripsTable.arrivalTime,
  }).from(tripsTable).where(eq(tripsTable.status, "active"));

  const tripsByDriver = new Map(activeTrips.map(t => [t.driverId, t]));

  res.json({
    data: drivers.map(d => ({
      ...d,
      rating: parseFloat(d.rating as string),
      activeTrip: tripsByDriver.get(d.id) ?? null,
    })),
    total: drivers.length,
  });
});

// ─── Driver dispatch stats ────────────────────────────────────────────────────

/**
 * GET /admin/drivers/dispatch-stats
 * Returns every driver's smart-dispatch metrics: offer counts, acceptance rate,
 * consecutive-rejection streak, and live cooldown status.
 * Supports ?search=name|phone and ?status=online|offline|… filters + pagination.
 */
router.get("/admin/drivers/dispatch-stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt((req.query.page  as string) ?? "1")   || 1);
    const limit  = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? "50") || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string | undefined)?.trim() ?? "";
    const status = req.query.status as string | undefined;

    const conditions = [eq(driversTable.isActive, true)];
    if (search) {
      conditions.push(
        or(
          ilike(driversTable.name,  `%${search}%`),
          ilike(driversTable.phone, `%${search}%`),
        )!,
      );
    }
    if (status && ["online", "offline", "busy", "suspended"].includes(status)) {
      conditions.push(eq(driversTable.status, status as "online" | "offline" | "busy" | "suspended"));
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id:                    driversTable.id,
        name:                  driversTable.name,
        phone:                 driversTable.phone,
        status:                driversTable.status,
        rating:                driversTable.rating,
        totalDispatched:       driversTable.totalDispatched,
        totalAccepted:         driversTable.totalAccepted,
        consecutiveRejections: driversTable.consecutiveRejections,
        cooldownUntil:         driversTable.cooldownUntil,
      })
        .from(driversTable)
        .where(where)
        .orderBy(desc(driversTable.totalDispatched))
        .limit(limit)
        .offset(offset),

      db.select({ total: sql<number>`count(*)::int` }).from(driversTable).where(where),
    ]);

    const now = Date.now();

    res.json({
      data: rows.map((d) => {
        const dispatched       = d.totalDispatched ?? 0;
        const accepted         = d.totalAccepted   ?? 0;
        const acceptanceRate   = dispatched === 0 ? null : parseFloat((accepted / dispatched).toFixed(4));
        const cooldownUntilMs  = d.cooldownUntil ? new Date(d.cooldownUntil).getTime() : null;
        const cooldownActive   = cooldownUntilMs !== null && cooldownUntilMs > now;
        const cooldownRemainingSeconds = cooldownActive ? Math.ceil((cooldownUntilMs! - now) / 1000) : 0;

        return {
          id:                      d.id,
          name:                    d.name,
          phone:                   d.phone,
          status:                  d.status,
          rating:                  parseFloat(d.rating as string),
          totalDispatched:         dispatched,
          totalAccepted:           accepted,
          acceptanceRate,
          consecutiveRejections:   d.consecutiveRejections ?? 0,
          cooldownUntil:           d.cooldownUntil ?? null,
          cooldownActive,
          cooldownRemainingSeconds,
        };
      }),
      total,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch driver dispatch stats" });
  }
});

/**
 * POST /admin/drivers/:id/clear-cooldown
 * Manually lifts a driver's cooldown and resets their consecutive-rejection streak.
 * Use when a driver contacts support to explain a legitimate reason for ignoring offers.
 */
router.post("/admin/drivers/:id/clear-cooldown", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const driverId = parseInt(req.params.id as string);
    if (isNaN(driverId)) { res.status(400).json({ error: "Invalid driver id" }); return; }

    const [driver] = await db
      .select({ id: driversTable.id, name: driversTable.name, userId: driversTable.userId, cooldownUntil: driversTable.cooldownUntil })
      .from(driversTable).where(eq(driversTable.id, driverId));
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    const hadActiveCooldown = driver.cooldownUntil !== null && new Date(driver.cooldownUntil).getTime() > Date.now();

    await db.update(driversTable)
      .set({ cooldownUntil: null, consecutiveRejections: 0 })
      .where(eq(driversTable.id, driverId));

    // Notify the driver app immediately so it can update its UI without polling.
    // The payload tells the app whether this was an active cooldown or a precautionary
    // reset, so it can show the appropriate message (e.g. "You're back in the pool").
    const io = getIO();
    if (io) {
      io.to(SOCKET_ROOMS.DRIVER(driver.userId)).emit(SOCKET_EVENTS.DRIVER_COOLDOWN_CLEARED, {
        driverId,
        hadActiveCooldown,
        clearedAt:   new Date().toISOString(),
        clearedBy:   "admin",
      });
    }

    res.json({
      success: true,
      message: `Cooldown cleared for driver ${driver.name}`,
      driverId,
      hadActiveCooldown,
    });
  } catch {
    res.status(500).json({ error: "Failed to clear driver cooldown" });
  }
});

/**
 * POST /admin/drivers/:id/reset-dispatch-stats
 * Resets totalDispatched, totalAccepted, and consecutiveRejections to 0.
 * Useful when onboarding a driver to a new region or after a data-quality fix.
 */
router.post("/admin/drivers/:id/reset-dispatch-stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const driverId = parseInt(req.params.id as string);
    if (isNaN(driverId)) { res.status(400).json({ error: "Invalid driver id" }); return; }

    const [driver] = await db.select({ id: driversTable.id, name: driversTable.name })
      .from(driversTable).where(eq(driversTable.id, driverId));
    if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

    await db.update(driversTable)
      .set({ totalDispatched: 0, totalAccepted: 0, consecutiveRejections: 0, cooldownUntil: null })
      .where(eq(driversTable.id, driverId));

    res.json({
      success: true,
      message: `Dispatch stats reset for driver ${driver.name}`,
      driverId,
    });
  } catch {
    res.status(500).json({ error: "Failed to reset dispatch stats" });
  }
});

// Shuttle trips by driver (for DriverDetailPanel activity tab)
router.get("/admin/trips", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const driverId = req.query.driverId ? parseInt(req.query.driverId as string) : null;
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? "100") || 100));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (driverId && !isNaN(driverId)) conditions.push(eq(tripsTable.driverId, driverId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db.select({
      id: tripsTable.id,
      driverId: tripsTable.driverId,
      routeId: tripsTable.routeId,
      busId: tripsTable.busId,
      status: tripsTable.status,
      departureTime: tripsTable.departureTime,
      arrivalTime: tripsTable.arrivalTime,
      availableSeats: tripsTable.availableSeats,
      totalSeats: tripsTable.totalSeats,
      price: tripsTable.price,
      createdAt: tripsTable.createdAt,
    }).from(tripsTable).where(where).orderBy(desc(tripsTable.departureTime)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(where),
  ]);

  res.json({
    data: rows.map(r => ({ ...r, price: parseFloat(r.price as string) })),
    meta: { total: count, page, limit, pages: Math.ceil(count / limit) },
  });
});

// Full trip timeline for legal/safety reconstruction
router.get("/admin/trips/:id/full-timeline", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const [events, driver, bus, route, bookings] = await Promise.all([
    db.select().from(tripEventsTable)
      .where(eq(tripEventsTable.tripId, tripId))
      .orderBy(asc(tripEventsTable.createdAt)),
    db.select({
      id: driversTable.id,
      name: driversTable.name,
      phone: driversTable.phone,
      licenseNumber: driversTable.licenseNumber,
      nationalId: driversTable.nationalId,
      rating: driversTable.rating,
      status: driversTable.status,
    }).from(driversTable).where(eq(driversTable.id, trip.driverId)),
    db.select({
      id: busesTable.id,
      plateNumber: busesTable.plateNumber,
      model: busesTable.model,
      capacity: busesTable.capacity,
    }).from(busesTable).where(eq(busesTable.id, trip.busId)),
    db.select({
      id: routesTable.id,
      name: routesTable.name,
      fromLocation: routesTable.fromLocation,
      toLocation: routesTable.toLocation,
    }).from(routesTable).where(eq(routesTable.id, trip.routeId)),
    db.select({
      id: bookingsTable.id,
      userId: bookingsTable.userId,
      seatCount: bookingsTable.seatCount,
      totalPrice: bookingsTable.totalPrice,
      status: bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      createdAt: bookingsTable.createdAt,
    }).from(bookingsTable).where(eq(bookingsTable.tripId, tripId)),
  ]);

  const passengerIds = [...new Set(bookings.map(b => b.userId))];
  const passengers = passengerIds.length > 0
    ? await db.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
      }).from(usersTable).where(sql`${usersTable.id} = ANY(${passengerIds})`)
    : [];

  const driverRecord = driver[0] ?? null;
  const driverUserId = driverRecord
    ? (await db.select({ userId: driversTable.userId }).from(driversTable).where(eq(driversTable.id, driverRecord.id)))[0]?.userId
    : null;

  const driverUser = driverUserId
    ? (await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, driverUserId)))[0]
    : null;

  res.json({
    trip: {
      ...trip,
      price: parseFloat(trip.price),
    },
    driver: driverRecord
      ? { ...driverRecord, rating: parseFloat(driverRecord.rating as string), user: driverUser }
      : null,
    vehicle: bus[0] ?? null,
    route: route[0] ?? null,
    passengers: passengers,
    bookings: bookings.map(b => ({ ...b, totalPrice: parseFloat(b.totalPrice as string) })),
    timeline: events,
    summary: {
      totalEvents: events.length,
      locationSnapshots: events.filter(e => e.type === "LOCATION_UPDATE").length,
      lifecycleEvents: events.filter(e => e.type !== "LOCATION_UPDATE").length,
    },
  });
});

// ─── Payouts per driver ───────────────────────────────────────────────────────
router.get("/admin/payouts", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const commission = await loadSetting<CommissionSettings>("commission", defaultCommission);
  const rows = await db.execute(sql`
    SELECT
      d.id                                                           AS driver_id,
      d.name                                                         AS driver_name,
      d.phone                                                        AS driver_phone,
      d.rating::float                                                AS rating,
      COUNT(e.id)::int                                               AS total_trips,
      COALESCE(SUM(e.amount), 0)::float                              AS gross_amount,
      COALESCE(SUM(e.amount), 0)::float * ${commission.appCommission} / 100  AS commission_amount,
      COALESCE(SUM(e.amount), 0)::float * ${commission.driverShare}   / 100  AS driver_share,
      CASE
        WHEN COUNT(e.id) = 0                                                       THEN 'no_earnings'
        WHEN COUNT(CASE WHEN e.status IN ('pending','confirmed') THEN 1 END) > 0   THEN 'pending'
        ELSE 'paid'
      END                                                            AS payout_status,
      MAX(e.date)                                                    AS last_earning_date
    FROM drivers d
    LEFT JOIN driver_earnings e ON e.driver_id = d.id
    GROUP BY d.id, d.name, d.phone, d.rating
    ORDER BY gross_amount DESC
  `);
  res.json({ data: rows.rows, total: rows.rows.length });
});

router.patch("/admin/payouts/:driverId/confirm", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const driverId = parseInt(req.params.driverId as string);
  if (isNaN(driverId)) { res.status(400).json({ error: "Invalid driver ID" }); return; }
  const result = await db
    .update(driverEarningsTable)
    .set({ status: "paid" })
    .where(and(
      eq(driverEarningsTable.driverId, driverId),
      or(eq(driverEarningsTable.status, "pending"), eq(driverEarningsTable.status, "confirmed")),
    ))
    .returning({ id: driverEarningsTable.id });
  res.json({ success: true, driverId, updated: result.length });
});

// ─── Revenue analytics (period-aware) ────────────────────────────────────────
router.get("/admin/analytics/revenue", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = (req.query.period as string) ?? "daily";
  const period = raw === "weekly" ? "weekly" : raw === "monthly" ? "monthly" : "daily";

  const tsQuery =
    period === "weekly"
      ? sql`SELECT DATE_TRUNC('week', created_at)::date::text AS period, COALESCE(SUM(total_price),0)::float AS revenue, COUNT(*)::int AS bookings FROM bookings WHERE created_at > NOW() - INTERVAL '84 days' GROUP BY DATE_TRUNC('week', created_at) ORDER BY period`
      : period === "monthly"
      ? sql`SELECT TO_CHAR(created_at,'YYYY-MM') AS period, COALESCE(SUM(total_price),0)::float AS revenue, COUNT(*)::int AS bookings FROM bookings WHERE created_at > NOW() - INTERVAL '365 days' GROUP BY TO_CHAR(created_at,'YYYY-MM') ORDER BY period`
      : sql`SELECT DATE(created_at)::text AS period, COALESCE(SUM(total_price),0)::float AS revenue, COUNT(*)::int AS bookings FROM bookings WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY period`;

  const [timeSeries, totals, driverPaid] = await Promise.all([
    db.execute(tsQuery),
    db.execute(sql`SELECT COALESCE(SUM(total_price),0)::float AS total_revenue, COUNT(*)::int AS total_bookings FROM bookings`),
    db.execute(sql`SELECT COALESCE(SUM(amount),0)::float AS total FROM driver_earnings WHERE status = 'paid'`),
  ]);

  const commission = await loadSetting<CommissionSettings>("commission", defaultCommission);
  const totalRevenue = (totals.rows[0] as Record<string,number>).total_revenue ?? 0;
  res.json({
    timeSeries: timeSeries.rows,
    totalRevenue,
    totalBookings: (totals.rows[0] as Record<string,number>).total_bookings ?? 0,
    totalDriverPaid: (driverPaid.rows[0] as Record<string,number>).total ?? 0,
    estimatedCommission: totalRevenue * commission.appCommission / 100,
    commissionRate: commission.appCommission,
    driverShareRate: commission.driverShare,
    period,
  });
});

// ─── Trips analytics (peak hours, status breakdown) ──────────────────────────
router.get("/admin/analytics/trips", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [peakHours, tripTotals, dailyBookings] = await Promise.all([
    db.execute(sql`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS bookings
      FROM bookings
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int                                              AS total,
        COUNT(CASE WHEN status = 'completed'  THEN 1 END)::int    AS completed,
        COUNT(CASE WHEN status = 'cancelled'  THEN 1 END)::int    AS cancelled,
        COUNT(CASE WHEN status = 'active'     THEN 1 END)::int    AS active,
        COUNT(CASE WHEN status = 'scheduled'  THEN 1 END)::int    AS scheduled
      FROM trips
    `),
    db.execute(sql`
      SELECT DATE(created_at)::text AS date,
             COUNT(*)::int          AS bookings,
             COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed,
             COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled
      FROM bookings
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `),
  ]);

  res.json({
    peakHours: peakHours.rows,
    tripTotals: tripTotals.rows[0] ?? {},
    dailyBookings: dailyBookings.rows,
  });
});

// ─── Drivers detailed analytics ───────────────────────────────────────────────
router.get("/admin/analytics/drivers/detailed", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [byRevenue, byTrips, byRating, byCancellations] = await Promise.all([
    db.execute(sql`
      SELECT d.id, d.name, d.rating::float AS rating, d.status,
             COALESCE(SUM(e.amount),0)::float AS total_earnings, COUNT(e.id)::int AS trip_count
      FROM drivers d LEFT JOIN driver_earnings e ON e.driver_id = d.id
      GROUP BY d.id, d.name, d.rating, d.status ORDER BY total_earnings DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT d.id, d.name, d.rating::float AS rating, d.status,
             COALESCE(SUM(e.amount),0)::float AS total_earnings, COUNT(e.id)::int AS trip_count
      FROM drivers d LEFT JOIN driver_earnings e ON e.driver_id = d.id
      GROUP BY d.id, d.name, d.rating, d.status ORDER BY trip_count DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT d.id, d.name, d.rating::float AS rating, d.status,
             COALESCE(SUM(e.amount),0)::float AS total_earnings, COUNT(e.id)::int AS trip_count
      FROM drivers d LEFT JOIN driver_earnings e ON e.driver_id = d.id
      GROUP BY d.id, d.name, d.rating, d.status ORDER BY d.rating DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT d.id, d.name, d.rating::float AS rating,
             COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END)::int AS cancellations,
             COUNT(b.id)::int AS total_bookings
      FROM drivers d
      LEFT JOIN trips t ON t.driver_id = d.id
      LEFT JOIN bookings b ON b.trip_id = t.id
      GROUP BY d.id, d.name, d.rating ORDER BY cancellations DESC LIMIT 10
    `),
  ]);

  res.json({ byRevenue: byRevenue.rows, byTrips: byTrips.rows, byRating: byRating.rows, byCancellations: byCancellations.rows });
});

// ─── Admin alerts summary (bell) ─────────────────────────────────────────────
router.get("/admin/alerts/summary", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [openTickets, pendingPayouts, suspendedDrivers] = await Promise.all([
    db.execute(sql`
      SELECT st.id, st.subject, st.priority, st.type, st.created_at,
             u.name AS user_name
      FROM support_tickets st
      LEFT JOIN users u ON u.id = st.user_id
      WHERE st.status = 'open'
      ORDER BY st.created_at DESC
      LIMIT 10
    `),
    db.execute(sql`
      SELECT d.id, u.name, SUM(de.amount)::float AS total_pending
      FROM driver_earnings de
      JOIN drivers d ON d.id = de.driver_id
      JOIN users u ON u.id = d.user_id
      WHERE de.status = 'pending'
      GROUP BY d.id, u.name
      ORDER BY total_pending DESC
      LIMIT 5
    `),
    db.execute(sql`
      SELECT d.id, u.name
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.status = 'suspended'
      LIMIT 5
    `),
  ]);

  const alerts: { id: string; type: string; title: string; subtitle: string; priority?: string; createdAt: string }[] = [
    ...(openTickets.rows as { id: number; subject: string; priority: string; type: string; created_at: string; user_name: string | null }[]).map((t) => ({
      id: `ticket-${t.id}`,
      type: "complaint",
      title: `Open complaint: ${t.subject}`,
      subtitle: t.user_name ? `From ${t.user_name}` : "Unknown user",
      priority: t.priority,
      createdAt: t.created_at as string,
    })),
    ...(pendingPayouts.rows as { id: number; name: string; total_pending: number }[]).map((p) => ({
      id: `payout-${p.id}`,
      type: "payout",
      title: `Pending payout: ${p.name}`,
      subtitle: `${parseFloat(String(p.total_pending)).toFixed(2)} EGP awaiting confirmation`,
      createdAt: new Date().toISOString(),
    })),
    ...(suspendedDrivers.rows as { id: number; name: string }[]).map((d) => ({
      id: `suspended-${d.id}`,
      type: "suspension",
      title: `Driver suspended: ${d.name}`,
      subtitle: "Review and take action",
      createdAt: new Date().toISOString(),
    })),
  ];

  res.json({ total: alerts.length, alerts });
});

// ─── Passenger analytics ──────────────────────────────────────────────────────
router.get("/admin/analytics/passengers", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [topByTrips, topBySpending, topByCancellations, activityByDay, totalPassengers] = await Promise.all([
    db.execute(sql`
      SELECT u.id, u.name, u.email, u.phone, u.wallet_balance::float,
             COUNT(b.id)::int AS total_bookings,
             COALESCE(SUM(b.total_price), 0)::float AS total_spent,
             COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END)::int AS cancellations
      FROM users u
      LEFT JOIN bookings b ON b.user_id = u.id
      WHERE u.role = 'user'
      GROUP BY u.id, u.name, u.email, u.phone, u.wallet_balance
      ORDER BY total_bookings DESC
      LIMIT 10
    `),
    db.execute(sql`
      SELECT u.id, u.name, u.email,
             COUNT(b.id)::int AS total_bookings,
             COALESCE(SUM(b.total_price), 0)::float AS total_spent,
             COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END)::int AS cancellations
      FROM users u
      LEFT JOIN bookings b ON b.user_id = u.id
      WHERE u.role = 'user'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_spent DESC
      LIMIT 10
    `),
    db.execute(sql`
      SELECT u.id, u.name, u.email,
             COUNT(b.id)::int AS total_bookings,
             COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END)::int AS cancellations,
             COALESCE(SUM(b.total_price), 0)::float AS total_spent
      FROM users u
      LEFT JOIN bookings b ON b.user_id = u.id
      WHERE u.role = 'user'
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) > 0
      ORDER BY cancellations DESC
      LIMIT 10
    `),
    db.execute(sql`
      SELECT DATE(b.created_at)::text AS date,
             COUNT(DISTINCT b.user_id)::int AS active_passengers,
             COUNT(b.id)::int AS bookings
      FROM bookings b
      WHERE b.created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(b.created_at)
      ORDER BY date
    `),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "user")),
  ]);

  res.json({
    totalPassengers: totalPassengers[0].count,
    topByTrips: topByTrips.rows,
    topBySpending: topBySpending.rows,
    topByCancellations: topByCancellations.rows,
    activityByDay: activityByDay.rows,
  });
});

// ─── Service analytics ────────────────────────────────────────────────────────
router.get("/admin/analytics/services", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [serviceUsage, serviceRevenue, serviceMonthly] = await Promise.all([
    db.execute(sql`
      SELECT t.recurring_type AS service_type,
             COUNT(b.id)::int AS total_bookings,
             COUNT(CASE WHEN b.status = 'completed' THEN 1 END)::int AS completed,
             COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END)::int AS cancelled,
             COUNT(DISTINCT b.user_id)::int AS unique_passengers
      FROM trips t
      JOIN bookings b ON b.trip_id = t.id
      GROUP BY t.recurring_type
      ORDER BY total_bookings DESC
    `),
    db.execute(sql`
      SELECT t.recurring_type AS service_type,
             COALESCE(SUM(b.total_price), 0)::float AS total_revenue,
             COALESCE(AVG(b.total_price), 0)::float AS avg_fare,
             COUNT(b.id)::int AS bookings
      FROM trips t
      JOIN bookings b ON b.trip_id = t.id
      WHERE b.status IN ('completed','confirmed')
      GROUP BY t.recurring_type
      ORDER BY total_revenue DESC
    `),
    db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', b.created_at), 'Mon YYYY') AS month,
             t.recurring_type AS service_type,
             COUNT(b.id)::int AS bookings,
             COALESCE(SUM(b.total_price), 0)::float AS revenue
      FROM trips t
      JOIN bookings b ON b.trip_id = t.id
      WHERE b.created_at > NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', b.created_at), t.recurring_type
      ORDER BY DATE_TRUNC('month', b.created_at), t.recurring_type
    `),
  ]);

  res.json({
    serviceUsage: serviceUsage.rows,
    serviceRevenue: serviceRevenue.rows,
    serviceMonthly: serviceMonthly.rows,
  });
});

// ─── Promo code analytics ──────────────────────────────────────────────────────
router.get("/admin/analytics/promo", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [topPromos, discountTotals, monthlyImpact] = await Promise.all([
    db.execute(sql`
      SELECT pc.id, pc.code, pc.discount_type, pc.discount_value::float,
             pc.used_count, pc.max_usage,
             pc.is_active,
             COALESCE(SUM(b.total_price), 0)::float AS gross_revenue_on_promo_bookings,
             COUNT(b.id)::int AS bookings_with_promo
      FROM promo_codes pc
      LEFT JOIN bookings b ON b.promo_code_id = pc.id
      GROUP BY pc.id, pc.code, pc.discount_type, pc.discount_value, pc.used_count, pc.max_usage, pc.is_active
      ORDER BY pc.used_count DESC
      LIMIT 15
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total_promo_bookings,
             COALESCE(SUM(b.total_price), 0)::float AS revenue_on_promo_bookings
      FROM bookings b
      WHERE b.promo_code_id IS NOT NULL
    `),
    db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', b.created_at), 'Mon YYYY') AS month,
             COUNT(b.id)::int AS promo_bookings,
             COALESCE(SUM(b.total_price), 0)::float AS revenue
      FROM bookings b
      WHERE b.promo_code_id IS NOT NULL
        AND b.created_at > NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', b.created_at)
      ORDER BY DATE_TRUNC('month', b.created_at)
    `),
  ]);

  const totals = discountTotals.rows[0] as { total_promo_bookings: number; revenue_on_promo_bookings: number };
  res.json({
    topPromos: topPromos.rows,
    totalPromoBookings: totals.total_promo_bookings,
    revenueOnPromoBookings: totals.revenue_on_promo_bookings,
    monthlyImpact: monthlyImpact.rows,
  });
});

// ─── App settings (persisted to DB) ──────────────────────────────────────────

type AppSettings = { appName: string; supportEmail: string; supportPhone: string; facebookUrl: string; twitterUrl: string; instagramUrl: string; privacyPolicyUrl: string; termsUrl: string };
const defaultAppSettings: AppSettings = { appName: "ShuttleOps", supportEmail: "support@shuttleops.com", supportPhone: "+20-100-000-0000", facebookUrl: "", twitterUrl: "", instagramUrl: "", privacyPolicyUrl: "", termsUrl: "" };

const AppSettingsPutBody = z.object({
  appName:          z.string().min(1).optional(),
  supportEmail:     z.string().email().optional(),
  supportPhone:     z.string().optional(),
  facebookUrl:      z.string().optional(),
  twitterUrl:       z.string().optional(),
  instagramUrl:     z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  termsUrl:         z.string().optional(),
});

router.get("/admin/settings/app", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const settings = await loadSetting<AppSettings>("app", defaultAppSettings);
  res.json(settings);
});

// TODO (deprecated): Use PATCH /admin/settings/app — PUT semantics imply a full replacement,
// but this handler performs a merge (partial update), which is PATCH semantics.
router.put("/admin/settings/app", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = AppSettingsPutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const current = await loadSetting<AppSettings>("app", defaultAppSettings);
  const updated = { ...current, ...parsed.data };
  await saveSetting("app", updated);
  res.json(updated);
});

// PATCH /admin/settings/app — preferred canonical method for partial settings update
router.patch("/admin/settings/app", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = AppSettingsPutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const current = await loadSetting<AppSettings>("app", defaultAppSettings);
  const updated = { ...current, ...parsed.data };
  await saveSetting("app", updated);
  res.json(updated);
});

// ─── GET /admin/transactions — alias for /admin/wallet/transactions ───────────
router.get("/admin/transactions", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const page  = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20") || 20));
  const offset = (page - 1) * limit;

  const [data, countResult] = await Promise.all([
    db
      .select({
        id:          walletTransactionsTable.id,
        userId:      walletTransactionsTable.userId,
        amount:      walletTransactionsTable.amount,
        type:        walletTransactionsTable.type,
        description: walletTransactionsTable.description,
        createdAt:   walletTransactionsTable.createdAt,
        user: {
          id:            usersTable.id,
          name:          usersTable.name,
          email:         usersTable.email,
          phone:         usersTable.phone,
          role:          usersTable.role,
          walletBalance: usersTable.walletBalance,
        },
      })
      .from(walletTransactionsTable)
      .leftJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(walletTransactionsTable),
  ]);

  res.json({
    data: data.map(t => ({ ...t, amount: parseFloat(t.amount as string) })),
    total: countResult[0].count,
    page,
    limit,
  });
});

// ─── POST /admin/trips/:id/cancel — alias for PATCH /trips/:id/cancel ─────────
router.post("/admin/trips/:id/cancel", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }
  const [trip] = await db.select({ id: tripsTable.id, status: tripsTable.status }).from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  if (!["scheduled", "active", "boarding", "driver_assigned"].includes(trip.status)) {
    res.status(400).json({ error: `Cannot cancel trip with status '${trip.status}'` }); return;
  }
  const [updated] = await db.update(tripsTable).set({ status: "cancelled" }).where(eq(tripsTable.id, tripId)).returning();
  res.json(updated);
});

// ─── Delete user account ──────────────────────────────────────────────────────
router.delete("/admin/users/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (!deleted) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true, deleted: deleted.id });
});

// ─── Delete driver account ────────────────────────────────────────────────────
router.delete("/admin/drivers/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const driver = await db.select({ userId: driversTable.userId }).from(driversTable).where(eq(driversTable.id, id)).limit(1);
  if (!driver[0]) { res.status(404).json({ error: "Driver not found" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, driver[0].userId));
  res.json({ success: true });
});

// ─── Bookings list ─────────────────────────────────────────────────────────────
router.get("/admin/bookings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const page   = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
  const limit  = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20") || 20));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const search = String(req.query.search ?? "").trim();

  const conditions: ReturnType<typeof eq>[] = [];
  if (status && status !== "all") conditions.push(eq(bookingsTable.status, status as "pending" | "confirmed" | "completed" | "cancelled"));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.execute(sql`
      SELECT b.id, b.trip_id, b.user_id, b.seat_count, b.total_price::float,
             b.status, b.payment_status, b.created_at,
             b.promo_code_id,
             u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
             t.recurring_type AS service_type, t.departure_time, t.arrival_time
      FROM bookings b
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN trips t ON t.id = b.trip_id
      WHERE (${search} = '' OR u.name ILIKE ${'%' + search + '%'} OR u.phone ILIKE ${'%' + search + '%'} OR CAST(b.id AS text) LIKE ${'%' + search + '%'})
        ${status && status !== "all" ? sql`AND b.status = ${status}` : sql``}
      ORDER BY b.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM bookings b
      LEFT JOIN users u ON u.id = b.user_id
      WHERE (${search} = '' OR u.name ILIKE ${'%' + search + '%'} OR u.phone ILIKE ${'%' + search + '%'} OR CAST(b.id AS text) LIKE ${'%' + search + '%'})
        ${status && status !== "all" ? sql`AND b.status = ${status}` : sql``}
    `),
  ]);

  const total = (countResult.rows[0] as { count: number }).count;
  res.json({ data: data.rows, total, page, limit });
});

// ─── Complaints analytics ────────────────────────────────────────────────────
router.get("/admin/analytics/complaints", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const [typeBreakdown, avgResolution, priorityBreakdown, trend] = await Promise.all([
    db.execute(sql`SELECT type, status, COUNT(*)::int AS count FROM support_tickets GROUP BY type, status`),
    db.execute(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::float AS avg_hours
      FROM support_tickets WHERE status IN ('resolved','closed')
    `),
    db.execute(sql`SELECT priority, COUNT(*)::int AS count FROM support_tickets GROUP BY priority ORDER BY count DESC`),
    db.execute(sql`
      SELECT DATE(created_at)::text AS date,
             COUNT(*)::int AS opened,
             COUNT(CASE WHEN status IN ('resolved','closed') THEN 1 END)::int AS resolved
      FROM support_tickets
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at) ORDER BY date
    `),
  ]);

  res.json({
    typeBreakdown: typeBreakdown.rows,
    avgResolutionHours: (avgResolution.rows[0] as Record<string,number | null>)?.avg_hours ?? null,
    priorityBreakdown: priorityBreakdown.rows,
    trend: trend.rows,
  });
});

/**
 * GET /admin/dispatch/peak-settings
 * Returns the five peak-hours dispatch settings plus a live "isPeak" flag
 * showing whether peak mode is active at the current server time.
 */
router.get("/admin/dispatch/peak-settings", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  try {
    const [windows, offPeakBatch, peakBatch, offPeakRadius, peakRadius] = await Promise.all([
      loadSetting("dispatch_peak_windows",           [{ startHour: 7, endHour: 9 }, { startHour: 17, endHour: 19 }]),
      loadSetting("dispatch_drivers_per_round",      3),
      loadSetting("dispatch_drivers_per_round_peak", 5),
      loadSetting("dispatch_radius_steps_km",        [5, 8, 12]),
      loadSetting("dispatch_radius_steps_km_peak",   [3, 5, 8]),
    ]);

    const serverHour = new Date().getHours();
    const isPeak     = (windows as { startHour: number; endHour: number }[])
      .some((w) => serverHour >= w.startHour && serverHour < w.endHour);

    res.json({
      isPeak,
      serverHour,
      settings: {
        dispatch_peak_windows:           windows,
        dispatch_drivers_per_round:      offPeakBatch,
        dispatch_drivers_per_round_peak: peakBatch,
        dispatch_radius_steps_km:        offPeakRadius,
        dispatch_radius_steps_km_peak:   peakRadius,
      },
      active: {
        driversPerRound: isPeak ? peakBatch  : offPeakBatch,
        radiusSteps:     isPeak ? peakRadius : offPeakRadius,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch peak settings" });
  }
});

const peakWindowSchema = z.object({ startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24) });
const peakSettingsBodySchema = z.object({
  dispatch_peak_windows:           z.array(peakWindowSchema).min(0).optional(),
  dispatch_drivers_per_round:      z.number().int().min(1).max(20).optional(),
  dispatch_drivers_per_round_peak: z.number().int().min(1).max(20).optional(),
  dispatch_radius_steps_km:        z.array(z.number().positive()).min(1).optional(),
  dispatch_radius_steps_km_peak:   z.array(z.number().positive()).min(1).optional(),
});

/**
 * PUT /admin/dispatch/peak-settings
 * Upserts any subset of the five peak-hours settings.
 * Changes take effect within 60 seconds (the dispatch-manager's cache TTL).
 */
router.put("/admin/dispatch/peak-settings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const parsed = peakSettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const updates = parsed.data;
    const saves: Promise<void>[] = [];

    if (updates.dispatch_peak_windows           !== undefined) saves.push(saveSetting("dispatch_peak_windows",           updates.dispatch_peak_windows));
    if (updates.dispatch_drivers_per_round      !== undefined) saves.push(saveSetting("dispatch_drivers_per_round",      updates.dispatch_drivers_per_round));
    if (updates.dispatch_drivers_per_round_peak !== undefined) saves.push(saveSetting("dispatch_drivers_per_round_peak", updates.dispatch_drivers_per_round_peak));
    if (updates.dispatch_radius_steps_km        !== undefined) saves.push(saveSetting("dispatch_radius_steps_km",        updates.dispatch_radius_steps_km));
    if (updates.dispatch_radius_steps_km_peak   !== undefined) saves.push(saveSetting("dispatch_radius_steps_km_peak",   updates.dispatch_radius_steps_km_peak));

    await Promise.all(saves);

    res.json({
      success: true,
      updated: Object.keys(updates),
      note:    "Changes take effect within 60 seconds (dispatch cache TTL)",
    });
  } catch {
    res.status(500).json({ error: "Failed to update peak settings" });
  }
});

/**
 * GET /admin/sos-events
 * Returns SOS events with ride and user details.
 *
 * Query params:
 *   status   — "active" | "resolved" | omit for all
 *   from     — ISO date string, inclusive lower bound on triggered_at
 *   to       — ISO date string, inclusive upper bound on triggered_at
 *   limit    — default 50, max 200
 *   offset   — default 0
 */
router.get("/admin/sos-events", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const status  = (req.query.status  as string | undefined);
    const from    = (req.query.from    as string | undefined);
    const to      = (req.query.to      as string | undefined);
    const limit   = Math.min(parseInt((req.query.limit  as string) || "50",  10) || 50,  200);
    const offset  = Math.max(parseInt((req.query.offset as string) || "0",   10) || 0,   0);

    const conditions: ReturnType<typeof eq>[] = [];
    if (status) conditions.push(eq(sosEventsTable.status, status));

    const rows = await db
      .select({
        id:          sosEventsTable.id,
        userId:      sosEventsTable.userId,
        rideId:      sosEventsTable.rideId,
        role:        sosEventsTable.role,
        latitude:    sosEventsTable.latitude,
        longitude:   sosEventsTable.longitude,
        triggeredAt: sosEventsTable.triggeredAt,
        status:      sosEventsTable.status,
        notes:       sosEventsTable.notes,
        userName:    usersTable.name,
        userPhone:   usersTable.phone,
        rideStatus:  ridesTable.status,
        pickupAddress:  ridesTable.pickupAddress,
        dropoffAddress: ridesTable.dropoffAddress,
      })
      .from(sosEventsTable)
      .leftJoin(usersTable, eq(sosEventsTable.userId, usersTable.id))
      .leftJoin(ridesTable, eq(sosEventsTable.rideId, ridesTable.id))
      .where(
        conditions.length === 0
          ? undefined
          : conditions.length === 1
            ? conditions[0]
            : and(...conditions),
      )
      .orderBy(desc(sosEventsTable.triggeredAt))
      .limit(limit)
      .offset(offset);

    // Apply date filters in-process (avoids Drizzle sql-template complexity for
    // optional timestamp bounds while remaining safe — no raw interpolation).
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs   = to   ? new Date(to).getTime()   : null;

    const filtered = rows.filter((r) => {
      const t = new Date(r.triggeredAt).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs   !== null && t > toMs)   return false;
      return true;
    });

    res.json({ data: filtered, meta: { limit, offset, returned: filtered.length } });
  } catch {
    res.status(500).json({ error: "Failed to fetch SOS events" });
  }
});

/**
 * POST /admin/sos-events/:id/resolve
 * Marks an SOS event as resolved, records which admin resolved it and when.
 *
 * Body (optional):
 *   notes  — free-text resolution notes
 */
router.post("/admin/sos-events/:id/resolve", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid SOS event id" });
      return;
    }

    const bodySchema = z.object({ notes: z.string().optional() });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }

    const existing = await db
      .select({ id: sosEventsTable.id, status: sosEventsTable.status })
      .from(sosEventsTable)
      .where(eq(sosEventsTable.id, id))
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "SOS event not found" });
      return;
    }

    if (existing[0].status === "resolved") {
      res.status(409).json({ error: "SOS event is already resolved" });
      return;
    }

    const adminId = (req as any).user?.id as number;
    const resolvedAt = new Date();

    const [updated] = await db
      .update(sosEventsTable)
      .set({
        status:       "resolved",
        resolvedById: adminId,
        resolvedAt,
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      })
      .where(eq(sosEventsTable.id, id))
      .returning();

    res.json({ data: updated });
  } catch {
    res.status(500).json({ error: "Failed to resolve SOS event" });
  }
});

export default router;
