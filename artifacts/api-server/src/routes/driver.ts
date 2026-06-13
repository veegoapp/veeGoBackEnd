import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, driversTable, tripsTable, bookingsTable, driverEarningsTable, tripStationProgressTable, stationsTable, notificationsTable, tripEventsTable, busesTable, driverDocumentsTable, settingsTable, rideEventsTable, driverLocationsTable, ratingsTable, shuttleOffencesTable, walletTransactionsTable, ridesTable, driverDuplicateAlertsTable } from "@workspace/db";
import { jobQueue } from "../lib/jobQueue";
import { eq, and, or, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { signAccessToken, signRefreshToken } from "../lib/jwt";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
import { checkCriminalRecordThreshold } from "../lib/criminal-record";
import { updateBonusProgressAfterRide } from "../lib/bonus-targets";
import { z } from "zod";

const router = Router();

function fmtDriver(d: Record<string, unknown>) {
  return { ...d, rating: typeof d.rating === "string" ? parseFloat(d.rating as string) : d.rating };
}
function fmtEarning(e: Record<string, unknown>) {
  return { ...e, amount: typeof e.amount === "string" ? parseFloat(e.amount as string) : e.amount };
}
function fmtTrip(t: Record<string, unknown>) {
  return { ...t, price: typeof t.price === "string" ? parseFloat(t.price as string) : t.price };
}
function fmtBooking(b: Record<string, unknown>) {
  return { ...b, totalPrice: typeof b.totalPrice === "string" ? parseFloat(b.totalPrice as string) : b.totalPrice };
}

const DriverLoginBody = z.object({
  credential: z.string().min(1),
  password: z.string().min(1),
});

const DriverRegisterBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),
  password: z.string().min(8),
  licenseNumber: z.string().optional(),
  nationalId: z.string().optional(),
});

const UpdateStatusBody = z.object({
  status: z.enum(["offline", "online", "busy", "suspended"]).optional(),
});

const LocationBody = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().optional(),
  heading: z.number().optional(),
  tripId: z.number().optional(),
});

const CancelTripBody = z.object({
  reason: z.string().min(1),
});

// ─── DRIVER AUTH ─────────────────────────────────────────────────────────────

router.post("/driver/auth/register", async (req, res): Promise<void> => {
  try {
    const parsed = DriverRegisterBody.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      const field = first?.path[0] ? `${String(first.path[0])}: ` : "";
      res.status(400).json({ error: `${field}${first?.message ?? "Invalid data"}` });
      return;
    }

    const { name, email, phone, password, licenseNumber, nationalId } = parsed.data;

    // Check email uniqueness
    const [existingEmail] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existingEmail) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    // Check phone uniqueness
    const [existingPhone] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, phone));

    if (existingPhone) {
      res.status(409).json({ error: "An account with this phone number already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [user] = await db.insert(usersTable).values({
      name,
      email,
      phone,
      password: hashedPassword,
      role: "driver",
    }).returning();

    const [driver] = await db.insert(driversTable).values({
      userId: user.id,
      name,
      phone,
      licenseNumber: licenseNumber ?? null,
      nationalId: nationalId ?? null,
    }).returning();

    // Fix 3: Multi-account fraud detection — check for nationalId duplicates (non-fatal, non-blocking)
    if (nationalId) {
      try {
        const existingDrivers = await db
          .select({ id: driversTable.id })
          .from(driversTable)
          .where(and(
            eq(driversTable.nationalId, nationalId),
            sql`${driversTable.id} != ${driver.id}`,
          ));

        for (const existing of existingDrivers) {
          await db.insert(driverDuplicateAlertsTable).values({
            newDriverId: driver.id,
            existingDriverId: existing.id,
            matchType: "national_id",
          });
        }

        if (existingDrivers.length > 0) {
          const io = getIO();
          if (io) {
            io.to("admin:room").emit("admin:duplicate_driver_alert", {
              newDriverId: driver.id,
              matchCount: existingDrivers.length,
              matchType: "national_id",
            });
          }
        }
      } catch (_dupErr) {
        // Duplicate detection is non-fatal; registration already succeeded
      }
    }

    const payload = { userId: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

    const { password: _, refreshToken: __, ...safeUser } = user;
    res.status(201).json({
      accessToken,
      refreshToken,
      user: { ...safeUser, walletBalance: parseFloat(safeUser.walletBalance) },
      driver: fmtDriver(driver as Record<string, unknown>),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

router.post("/driver/auth/login", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const parsed = DriverLoginBody.safeParse({ ...body, credential: body.credential ?? body.email });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { credential, password } = parsed.data;
  const [user] = await db.select()
    .from(usersTable)
    .where(
      sql`(${usersTable.email} = ${credential} OR ${usersTable.phone} = ${credential}) AND ${usersTable.role} = 'driver'`
    );

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: "Invalid driver credentials" });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ error: "Account is suspended" });
    return;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.userId, user.id));
  if (!driver) {
    res.status(403).json({ error: "No driver profile found for this account" });
    return;
  }

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

  const { password: _, refreshToken: __, ...safeUser } = user;
  res.json({
    accessToken,
    refreshToken,
    user: { ...safeUser, walletBalance: parseFloat(safeUser.walletBalance) },
    driver: fmtDriver(driver as Record<string, unknown>),
  });
});

router.post("/driver/auth/logout", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  await db.update(usersTable).set({ refreshToken: null }).where(eq(usersTable.id, req.user!.id));
  await db.update(driversTable).set({ isOnline: false, status: "offline" }).where(eq(driversTable.userId, req.user!.id));
  res.json({ ok: true });
});

router.get("/driver/me", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select().from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }
  res.json(fmtDriver(driver as Record<string, unknown>));
});

const UpdateDriverMeBody = z.object({
  name:          z.string().min(2).optional(),
  phone:         z.string().min(6).optional(),
  vehicleType:   z.string().optional(),
  licenseNumber: z.string().optional(),
  nationalId:    z.string().optional(),
});

router.patch("/driver/me", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const parsed = UpdateDriverMeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data };
  const [updated] = await db.update(driversTable).set(updateData).where(eq(driversTable.id, driver.id)).returning();
  res.json(fmtDriver(updated as Record<string, unknown>));
});

// ─── GET /driver/me/vehicle ────────────────────────────────────────────────────

router.get("/driver/me/vehicle", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id, assignedBusId: driversTable.assignedBusId, vehicleType: driversTable.vehicleType })
    .from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  if (!driver.assignedBusId) {
    res.json({ vehicle: null, vehicleType: driver.vehicleType });
    return;
  }

  const [bus] = await db.select().from(busesTable).where(eq(busesTable.id, driver.assignedBusId));
  res.json({ vehicle: bus ?? null, vehicleType: driver.vehicleType });
});

// ─── GET /driver/me/documents ──────────────────────────────────────────────────

router.get("/driver/me/documents", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const documents = await db.select().from(driverDocumentsTable)
    .where(eq(driverDocumentsTable.driverId, driver.id))
    .orderBy(desc(driverDocumentsTable.uploadedAt));

  res.json({ data: documents, total: documents.length });
});

const validDocTypes = [
  "national_id_front", "national_id_back",
  "driving_license_front", "driving_license_back",
  "vehicle_license_front", "vehicle_license_back",
  "vehicle_photo", "profile_photo", "trip_selfie",
] as const;

const PostDriverDocumentBody = z.object({
  type:       z.enum(validDocTypes),
  fileUrl:    z.string().url(),
  mimeType:   z.string().optional(),
  adminNotes: z.string().optional(),
});

router.post("/driver/me/documents", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const parsed = PostDriverDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [doc] = await db.insert(driverDocumentsTable).values({
    driverId:           driver.id,
    type:               parsed.data.type,
    fileUrl:            parsed.data.fileUrl,
    mimeType:           parsed.data.mimeType ?? "image/jpeg",
    verificationStatus: "pending",
    adminNotes:         parsed.data.adminNotes,
  }).returning();

  res.status(201).json(doc);
});

// ─── GET /driver/me/ratings ────────────────────────────────────────────────────
// SOURCE OF TRUTH: reads individual ratings from ratingsTable (not rideEventsTable)

router.get("/driver/me/ratings", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id, rating: driversTable.rating })
    .from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [stats, ratingRows] = await Promise.all([
    db.select({
      tripCount: sql<number>`count(*)::int`,
      totalEarned: sql<string>`COALESCE(SUM(amount), '0')`,
    }).from(driverEarningsTable).where(eq(driverEarningsTable.driverId, driver.id)),
    db.select({
      id: ratingsTable.id,
      raterId: ratingsTable.raterId,
      rideId: ratingsTable.rideId,
      tripId: ratingsTable.tripId,
      context: ratingsTable.context,
      score: ratingsTable.score,
      comment: ratingsTable.comment,
      createdAt: ratingsTable.createdAt,
    })
    .from(ratingsTable)
    .where(eq(ratingsTable.driverId, driver.id))
    .orderBy(desc(ratingsTable.createdAt))
    .limit(50),
  ]);

  res.json({
    rating: parseFloat(driver.rating),
    tripCount: stats[0]?.tripCount ?? 0,
    totalEarned: parseFloat(stats[0]?.totalEarned ?? "0"),
    ratingsCount: ratingRows.length,
    ratings: ratingRows.map((r) => ({
      ...r,
      score: parseFloat(r.score as string),
    })),
  });
});

// ─── GET /driver/me/status ─────────────────────────────────────────────────────

router.get("/driver/me/status", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({
    id: driversTable.id,
    status: driversTable.status,
    isOnline: driversTable.isOnline,
    isActive: driversTable.isActive,
    currentLatitude: driversTable.currentLatitude,
    currentLongitude: driversTable.currentLongitude,
    currentSpeed: driversTable.currentSpeed,
    currentHeading: driversTable.currentHeading,
  }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }
  res.json(driver);
});

// ─── GET /driver/me/settings ───────────────────────────────────────────────────

router.get("/driver/me/settings", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id, vehicleType: driversTable.vehicleType })
    .from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const allSettings = await db.select().from(settingsTable)
    .where(sql`${settingsTable.key} LIKE ${"driver_" + driver.id + "_%"}`);

  const prefix = `driver_${driver.id}_`;
  const settingsMap = Object.fromEntries(allSettings.map(s => [s.key.slice(prefix.length), s.value]));

  res.json({ vehicleType: driver.vehicleType, ...settingsMap });
});

// ─── PATCH /driver/me/settings ─────────────────────────────────────────────────

const DriverSettingsBody = z.object({
  vehicleType: z.string().optional(),
  notifications: z.boolean().optional(),
});

router.patch("/driver/me/settings", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const parsed = DriverSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

  const [driver] = await db.select({ id: driversTable.id, vehicleType: driversTable.vehicleType })
    .from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const { vehicleType, notifications } = parsed.data;

  if (vehicleType !== undefined) {
    await db.update(driversTable).set({ vehicleType }).where(eq(driversTable.id, driver.id));
  }

  if (notifications !== undefined) {
    const key = `driver_${driver.id}_notifications`;
    await db.insert(settingsTable)
      .values({ key, value: String(notifications) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(notifications) } });
  }

  const [updated] = await db.select({ id: driversTable.id, vehicleType: driversTable.vehicleType })
    .from(driversTable).where(eq(driversTable.id, driver.id));
  const allSettings = await db.select().from(settingsTable)
    .where(sql`${settingsTable.key} LIKE ${"driver_" + driver.id + "_%"}`);
  const prefix = `driver_${driver.id}_`;
  const settingsMap = Object.fromEntries(allSettings.map(s => [s.key.slice(prefix.length), s.value]));

  res.json({ vehicleType: updated.vehicleType, ...settingsMap });
});

// ─── DRIVER STATUS ────────────────────────────────────────────────────────────

router.patch("/driver/status/online", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id, status: driversTable.status, onlineSince: driversTable.onlineSince })
    .from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }
  if (driver.status === "suspended") { res.status(403).json({ error: "Account suspended" }); return; }

  // Set onlineSince only when transitioning from offline (not from busy→online mid-shift)
  const now = new Date();
  const onlineSince = driver.status === "offline" ? now : (driver.onlineSince ?? now);

  const [updated] = await db.update(driversTable)
    .set({ isOnline: true, status: "online", onlineSince })
    .where(eq(driversTable.id, driver.id))
    .returning();
  res.json(fmtDriver(updated as Record<string, unknown>));
});

router.patch("/driver/status/offline", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id })
    .from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [updated] = await db.update(driversTable)
    .set({
      isOnline:        false,
      status:          "offline",
      onlineSince:     null,
      checkInRequired: false,
      checkInDeadline: null,
    })
    .where(eq(driversTable.id, driver.id))
    .returning();
  res.json(fmtDriver(updated as Record<string, unknown>));
});

// ─── DRIVER LOCATION (REST fallback) ─────────────────────────────────────────

router.patch("/driver/location", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const parsed = LocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [updated] = await db.update(driversTable).set({
    currentLatitude: parsed.data.latitude,
    currentLongitude: parsed.data.longitude,
    currentSpeed: parsed.data.speed,
    currentHeading: parsed.data.heading,
    locationUpdatedAt: new Date(),
  }).where(eq(driversTable.id, driver.id)).returning();

  jobQueue.enqueue("driver_location", {
    driverId: driver.id,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    speed: parsed.data.speed ?? null,
    heading: parsed.data.heading ?? null,
  });

  if (parsed.data.tripId) {
    const tripId = parsed.data.tripId;
    const cutoff = new Date(Date.now() - 10_000);
    const [recent] = await db.select({ id: tripEventsTable.id })
      .from(tripEventsTable)
      .where(
        and(
          eq(tripEventsTable.tripId, tripId),
          eq(tripEventsTable.type, "LOCATION_UPDATE"),
          sql`${tripEventsTable.createdAt} > ${cutoff}`
        )
      )
      .limit(1);

    if (!recent) {
      await db.insert(tripEventsTable).values({
        tripId,
        type: "LOCATION_UPDATE",
        metadata: {
          lat: parsed.data.latitude,
          lng: parsed.data.longitude,
          speed: parsed.data.speed ?? null,
        },
      });
    }

    // Emit shuttle:driver:location to all passengers subscribed to this trip room.
    // Fires regardless of trip status — covers pre-departure, boarding, and active phases.
    const io = getIO();
    if (io) {
      io.to(SOCKET_ROOMS.TRIP(tripId)).emit(SOCKET_EVENTS.SHUTTLE_DRIVER_LOCATION, {
        tripId,
        lat:     parsed.data.latitude,
        lng:     parsed.data.longitude,
        heading: parsed.data.heading ?? null,
      });
    }
  }

  res.json(fmtDriver(updated as Record<string, unknown>));
});

// ─── DRIVER TRIPS ─────────────────────────────────────────────────────────────

// FIXED: pagination for GET /driver/trips
router.get("/driver/trips", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? "20") || 20));
  const offset = (page - 1) * limit;

  const conditions = [eq(tripsTable.driverId, driver.id)];
  if (status) {
    conditions.push(eq(tripsTable.status, status as "scheduled" | "active" | "completed" | "cancelled" | "waiting_driver" | "driver_assigned" | "boarding"));
  }

  const [trips, countResult] = await Promise.all([
    db.select().from(tripsTable)
      .where(and(...conditions))
      .orderBy(desc(tripsTable.departureTime))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(and(...conditions)),
  ]);

  res.json({ data: trips.map(t => fmtTrip(t as Record<string, unknown>)), total: countResult[0]?.count ?? 0, page, limit });
});

router.get("/driver/trips/:id", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select().from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not found or not assigned to you" }); return; }

  const bookings = await db
    .select({
      id: bookingsTable.id,
      passengerName: usersTable.name,
      passengerPhone: usersTable.phone,
      passengerAvatar: usersTable.avatar,
    })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(eq(bookingsTable.tripId, tripId));

  res.json({ ...fmtTrip(trip as Record<string, unknown>), bookings });
});

router.patch("/driver/trips/:id/accept", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select().from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  if (!["scheduled", "waiting_driver"].includes(trip.status)) {
    res.status(400).json({ error: `Cannot accept trip in status: ${trip.status}` });
    return;
  }

  const now = new Date();
  const [updated] = await db.update(tripsTable).set({ status: "driver_assigned", acceptedAt: now })
    .where(eq(tripsTable.id, tripId)).returning();

  await db.insert(tripEventsTable).values({
    tripId,
    type: "DRIVER_ACCEPTED",
    metadata: { driverId: driver.id },
  });

  res.json(fmtTrip(updated as Record<string, unknown>));
});

router.patch("/driver/trips/:id/reject", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select().from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  if (!["scheduled", "waiting_driver", "driver_assigned"].includes(trip.status)) {
    res.status(400).json({ error: `Cannot reject trip in status: ${trip.status}` });
    return;
  }

  // FIXED: clear driverId so another driver can be assigned
  const [updated] = await db.update(tripsTable).set({ status: "waiting_driver", driverId: sql`NULL` })
    .where(eq(tripsTable.id, tripId)).returning();
  res.json(fmtTrip(updated as Record<string, unknown>));
});

router.patch("/driver/trips/:id/start", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select().from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(driversTable.id, driver.id)));
  const [assignedTrip] = await db.select().from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!assignedTrip) { res.status(404).json({ error: "Trip not assigned to you" }); return; }
  if (!["driver_assigned", "boarding"].includes(assignedTrip.status)) {
    res.status(400).json({ error: `Cannot start trip in status: ${assignedTrip.status}` });
    return;
  }

  // ── Check-in gate: require a face-detected selfie for this trip ──────────────
  const { driverCheckInsTable } = await import("@workspace/db");
  const [checkin] = await db
    .select({ id: driverCheckInsTable.id })
    .from(driverCheckInsTable)
    .where(
      and(
        eq(driverCheckInsTable.driverId, driver.id),
        eq(driverCheckInsTable.tripId,   tripId),
        eq(driverCheckInsTable.faceDetected, true),
      ),
    )
    .limit(1);

  if (!checkin) {
    res.status(403).json({
      error: "Selfie check-in required",
      message: "You must complete a face-detected selfie check-in for this trip before starting it.",
    });
    return;
  }

  await db.update(driversTable).set({ status: "busy" }).where(eq(driversTable.id, driver.id));
  const startNow = new Date();
  const [updated] = await db.update(tripsTable).set({ status: "active", startedAt: startNow })
    .where(eq(tripsTable.id, tripId)).returning();

  await db.insert(tripEventsTable).values({
    tripId,
    type: "TRIP_STARTED",
    metadata: { driverId: driver.id },
  });

  const stations = await db.select().from(stationsTable)
    .where(eq(stationsTable.routeId, updated.routeId))
    .orderBy(stationsTable.order);

  await db.insert(tripStationProgressTable).values(
    stations.map(s => ({ tripId, stationId: s.id, status: "pending" as const }))
  ).onConflictDoNothing();

  res.json(fmtTrip(updated as Record<string, unknown>));
});

router.patch("/driver/trips/:id/complete", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select().from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not assigned to you" }); return; }
  if (trip.status !== "active") {
    res.status(400).json({ error: `Cannot complete trip in status: ${trip.status}` });
    return;
  }

  const completeNow = new Date();
  const [updated] = await db.update(tripsTable).set({ status: "completed", completedAt: completeNow })
    .where(eq(tripsTable.id, tripId)).returning();

  await db.insert(tripEventsTable).values({
    tripId,
    type: "TRIP_COMPLETED",
    metadata: { driverId: driver.id },
  });

  await db.update(driversTable).set({ status: "online" }).where(eq(driversTable.id, driver.id));

  await db.update(bookingsTable)
    .set({ status: "completed" })
    .where(and(eq(bookingsTable.tripId, tripId), eq(bookingsTable.status, "confirmed")));

  const tripPrice = parseFloat(updated.price);
  // commissionRate is the PLATFORM cut (e.g. 0.15 = 15%).
  // Driver receives the remainder: tripPrice * (1 - commissionRate).
  const [commissionSetting] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "driver_commission_rate"));
  const commissionRate = commissionSetting ? parseFloat(commissionSetting.value) || 0.15 : 0.15;
  const platformCut = parseFloat((tripPrice * commissionRate).toFixed(2));
  const driverCut   = parseFloat((tripPrice - platformCut).toFixed(2));
  await db.insert(driverEarningsTable).values({
    driverId: driver.id,
    tripId,
    amount: driverCut.toFixed(2),
    status: "confirmed",
  });

  // Bonus progress update for shuttle trip (non-fatal)
  updateBonusProgressAfterRide(driver.id, "shuttle", driverCut).catch(
    (err) => console.error("Bonus progress update error (shuttle complete):", err),
  );

  // Criminal record enforcement after threshold trips/rides (non-fatal)
  try {
    await checkCriminalRecordThreshold(driver.id, req.user!.id);
  } catch (_crimErr) {
    // Non-fatal; trip completion already saved
  }

  // Fix 1: Send post-trip rating request notifications (non-fatal).
  // Passengers who boarded/completed → prompt to rate the driver.
  // Driver (req.user!) → prompt to rate each passenger.
  try {
    const io = getIO();

    const passengersToRate = await db
      .select({ userId: bookingsTable.userId })
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.tripId, tripId),
        inArray(bookingsTable.status, ["boarded", "completed"]),
      ));

    // Notify passengers to rate driver
    for (const { userId } of passengersToRate) {
      const [notif] = await db
        .insert(notificationsTable)
        .values({
          userId,
          title: "How was your trip?",
          body:  `Your shuttle trip has ended. Please rate your driver (1–5 stars). Trip #${tripId}.`,
        })
        .returning();

      if (io && notif) {
        io.to(SOCKET_ROOMS.PASSENGER(userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
          id:       String(notif.id),
          category: "rating",
          title:    notif.title,
          body:     notif.body,
          tripId,
          time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
        });
      }
    }

    // Notify driver to rate passengers
    if (passengersToRate.length > 0) {
      const [driverNotif] = await db
        .insert(notificationsTable)
        .values({
          userId: req.user!.id,
          title:  "Rate your passengers",
          body:   `Trip #${tripId} is complete. You can now rate your ${passengersToRate.length} passenger${passengersToRate.length !== 1 ? "s" : ""}.`,
        })
        .returning();

      if (io && driverNotif) {
        io.to(SOCKET_ROOMS.DRIVER(req.user!.id)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
          id:       String(driverNotif.id),
          category: "rating",
          title:    driverNotif.title,
          body:     driverNotif.body,
          tripId,
          time:     driverNotif.createdAt instanceof Date ? driverNotif.createdAt.toISOString() : String(driverNotif.createdAt),
        });
      }
    }
  } catch (err) {
    // Rating notifications are non-fatal — trip completion is already saved above
  }

  res.json(fmtTrip(updated as Record<string, unknown>));
});

router.patch("/driver/trips/:id/cancel", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const parsed = CancelTripBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Cancellation reason is required" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select().from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not assigned to you" }); return; }
  if (["completed", "cancelled"].includes(trip.status)) {
    res.status(400).json({ error: `Cannot cancel trip in status: ${trip.status}` });
    return;
  }

  const cancelNow = new Date();
  const [updated] = await db.update(tripsTable)
    .set({ status: "cancelled", cancelReason: parsed.data.reason, cancelledAt: cancelNow })
    .where(eq(tripsTable.id, tripId)).returning();

  await db.insert(tripEventsTable).values({
    tripId,
    type: "TRIP_CANCELLED",
    metadata: { driverId: driver.id, reason: parsed.data.reason },
  });

  await db.update(driversTable).set({ status: "online" }).where(eq(driversTable.id, driver.id));

  res.json(fmtTrip(updated as Record<string, unknown>));
});

// ─── TRIP STATIONS ────────────────────────────────────────────────────────────

router.get("/driver/trips/:id/stations", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select({ id: tripsTable.id, routeId: tripsTable.routeId })
    .from(tripsTable).where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const stations = await db.select().from(stationsTable)
    .where(eq(stationsTable.routeId, trip.routeId))
    .orderBy(stationsTable.order);

  const progress = await db.select().from(tripStationProgressTable)
    .where(eq(tripStationProgressTable.tripId, tripId));

  const progressMap = new Map(progress.map(p => [p.stationId, p]));

  const bookingCountResult = await db.select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable).where(eq(bookingsTable.tripId, tripId));
  const totalBookings = bookingCountResult[0]?.count ?? 0;

  const result = stations.map(s => ({
    ...s,
    progress: progressMap.get(s.id) ?? null,
    status: progressMap.get(s.id)?.status ?? "pending",
    expectedPassengers: Math.ceil(totalBookings / stations.length),
  }));

  res.json({ data: result });
});

router.patch("/driver/trips/:id/stations/:stationId/arrived", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  const stationId = parseInt(req.params.stationId as string);
  if (isNaN(tripId) || isNaN(stationId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select({ id: tripsTable.id }).from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  await db.insert(tripStationProgressTable)
    .values({ tripId, stationId, status: "arrived", arrivedAt: new Date() })
    .onConflictDoUpdate({
      target: [tripStationProgressTable.tripId, tripStationProgressTable.stationId],
      set: { status: "arrived", arrivedAt: new Date() },
    });

  const [updated] = await db.select().from(tripStationProgressTable)
    .where(and(eq(tripStationProgressTable.tripId, tripId), eq(tripStationProgressTable.stationId, stationId)));

  res.json(updated);
});

router.patch("/driver/trips/:id/stations/:stationId/completed", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  const stationId = parseInt(req.params.stationId as string);
  if (isNaN(tripId) || isNaN(stationId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [trip] = await db.select({ id: tripsTable.id }).from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.driverId, driver.id)));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  await db.insert(tripStationProgressTable)
    .values({ tripId, stationId, status: "completed", arrivedAt: new Date(), completedAt: new Date() })
    .onConflictDoUpdate({
      target: [tripStationProgressTable.tripId, tripStationProgressTable.stationId],
      set: { status: "completed", completedAt: new Date() },
    });

  const [updated] = await db.select().from(tripStationProgressTable)
    .where(and(eq(tripStationProgressTable.tripId, tripId), eq(tripStationProgressTable.stationId, stationId)));

  res.json(updated);
});

// ─── PASSENGER BOARDING ───────────────────────────────────────────────────────

router.patch("/driver/bookings/:id/board", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.id as string);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const [trip] = await db.select({ id: tripsTable.id, driverId: tripsTable.driverId })
    .from(tripsTable).where(eq(tripsTable.id, booking.tripId));
  if (!trip || trip.driverId !== driver.id) {
    res.status(403).json({ error: "Not your trip" });
    return;
  }

  if (!["confirmed", "pending"].includes(booking.status)) {
    res.status(400).json({ error: `Cannot board passenger in status: ${booking.status}` });
    return;
  }

  const [updated] = await db.update(bookingsTable).set({ status: "boarded" })
    .where(eq(bookingsTable.id, bookingId)).returning();

  const io = getIO();
  if (io) {
    io.to(`passenger:${booking.userId}`).emit(SOCKET_EVENTS.BOOKING_BOARDED, {
      bookingId: updated.id,
      tripId:    updated.tripId,
      timestamp: new Date().toISOString(),
    });
  }

  res.json(fmtBooking(updated as Record<string, unknown>));
});

router.patch("/driver/bookings/:id/absent", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.id as string);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const [trip] = await db.select({ id: tripsTable.id, driverId: tripsTable.driverId })
    .from(tripsTable).where(eq(tripsTable.id, booking.tripId));
  if (!trip || trip.driverId !== driver.id) {
    res.status(403).json({ error: "Not your trip" });
    return;
  }

  const [updated] = await db.update(bookingsTable).set({ status: "absent" })
    .where(eq(bookingsTable.id, bookingId)).returning();

  // ── Phase 3 Fix 1: Passenger no-show warning + fine logic ─────────────────
  try {
    const passengerUserId = booking.userId;
    const ticketPrice     = booking.totalPrice; // numeric string from DB

    // Look up current offence count BEFORE incrementing
    const [existing] = await db
      .select({ offenceCount: shuttleOffencesTable.offenceCount })
      .from(shuttleOffencesTable)
      .where(
        and(
          eq(shuttleOffencesTable.userId, passengerUserId),
          eq(shuttleOffencesTable.actorType, "passenger"),
        ),
      );

    const prevCount = existing?.offenceCount ?? 0;
    const newCount  = prevCount + 1;
    const action    = newCount === 1 ? "warning" : "fined";

    await db
      .insert(shuttleOffencesTable)
      .values({
        userId:        passengerUserId,
        actorType:     "passenger",
        offenceCount:  1,
        lastAction:    action,
        lastOffenceAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [shuttleOffencesTable.userId, shuttleOffencesTable.actorType],
        set: {
          offenceCount:  sql`${shuttleOffencesTable.offenceCount} + 1`,
          lastAction:    action,
          lastOffenceAt: new Date(),
        },
      });

    const io = getIO();

    if (newCount === 1) {
      // First offence — warning only, no financial penalty
      const [notif] = await db
        .insert(notificationsTable)
        .values({
          userId: passengerUserId,
          title:  "Absent Mark — First Warning",
          body:   "You were marked absent on your shuttle trip. This is your first warning. A repeat no-show will result in the ticket price being deducted from your wallet.",
        })
        .returning();

      if (io && notif) {
        io.to(SOCKET_ROOMS.PASSENGER(passengerUserId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
          id:       String(notif.id),
          category: "trip",
          title:    notif.title,
          body:     notif.body,
          time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
        });
      }
    } else {
      // Second offence or more — deduct ticket price (allow negative balance)
      await db.execute(
        sql`UPDATE users SET wallet_balance = wallet_balance - ${ticketPrice} WHERE id = ${passengerUserId}`,
      );

      await db.insert(walletTransactionsTable).values({
        userId:      passengerUserId,
        amount:      `-${ticketPrice}`,
        type:        "payment",
        description: `No-show fine for booking #${booking.id} (trip #${booking.tripId}) — ticket price deducted`,
      });

      const [notif] = await db
        .insert(notificationsTable)
        .values({
          userId: passengerUserId,
          title:  "Absent Mark — Fine Applied",
          body:   `You were marked absent on your shuttle trip. The ticket price (${parseFloat(String(ticketPrice)).toFixed(2)} EGP) has been deducted from your wallet.`,
        })
        .returning();

      if (io && notif) {
        io.to(SOCKET_ROOMS.PASSENGER(passengerUserId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
          id:       String(notif.id),
          category: "trip",
          title:    notif.title,
          body:     notif.body,
          time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
        });
      }
    }
  } catch (err) {
    // Non-fatal — still return the updated booking even if offence tracking fails
    console.error("No-show offence tracking failed:", err);
  }

  res.json(fmtBooking(updated as Record<string, unknown>));
});

// ─── DRIVER WALLET: PAYOUT METHODS ───────────────────────────────────────────

router.get("/driver/wallet/payout-methods", authenticate, requireRole("driver"), async (_req, res): Promise<void> => {
  res.json({
    data: [
      { id: "bank_transfer", name: "Bank Transfer", description: "2-3 business days", isAvailable: true },
      { id: "mobile_money", name: "Mobile Money", description: "Instant", isAvailable: true },
      { id: "cash", name: "Cash Pickup", description: "Visit nearest office", isAvailable: true },
    ],
  });
});

const AddPayoutMethodBody = z.object({
  type:          z.string().min(1),
  accountNumber: z.string().optional(),
  accountName:   z.string().optional(),
  bankName:      z.string().optional(),
  phoneNumber:   z.string().optional(),
});

router.post("/driver/wallet/payout-methods", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const parsed = AddPayoutMethodBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }
  res.status(201).json({
    id: `${parsed.data.type}_${Date.now()}`,
    ...parsed.data,
    isAvailable: true,
    createdAt: new Date().toISOString(),
  });
});

router.delete("/driver/wallet/payout-methods/:id", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const methodId = req.params.id;
  if (!methodId) { res.status(400).json({ error: "Invalid method ID" }); return; }
  res.json({ ok: true, deleted: methodId });
});

// ─── DRIVER WALLET: PAYOUT ────────────────────────────────────────────────────

const PayoutBody = z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
});

router.post("/driver/wallet/payout", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const parsed = PayoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [totals] = await db.select({
    totalConfirmed: sql<string>`COALESCE(SUM(amount), '0')`,
  }).from(driverEarningsTable)
    .where(and(eq(driverEarningsTable.driverId, driver.id), eq(driverEarningsTable.status, "confirmed")));

  const availableBalance = parseFloat(totals?.totalConfirmed ?? "0");
  if (parsed.data.amount > availableBalance) {
    res.status(400).json({ error: "Insufficient balance", available: availableBalance });
    return;
  }

  await db.update(driverEarningsTable)
    .set({ status: "paid" })
    .where(and(eq(driverEarningsTable.driverId, driver.id), eq(driverEarningsTable.status, "confirmed")));

  res.json({
    ok: true,
    amount: parsed.data.amount,
    method: parsed.data.method,
    message: "Payout request submitted successfully",
  });
});

// ─── DRIVER EARNINGS ──────────────────────────────────────────────────────────

router.get("/driver/earnings", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [totals] = await db.select({
    totalEarned: sql<string>`COALESCE(SUM(amount), 0)`,
    tripCount: sql<number>`count(*)::int`,
  }).from(driverEarningsTable).where(eq(driverEarningsTable.driverId, driver.id));

  const recent = await db.select().from(driverEarningsTable)
    .where(eq(driverEarningsTable.driverId, driver.id))
    .orderBy(desc(driverEarningsTable.date))
    .limit(10);

  res.json({
    totalEarned: parseFloat(totals?.totalEarned ?? "0"),
    tripCount: totals?.tripCount ?? 0,
    recent: recent.map(e => fmtEarning(e as Record<string, unknown>)),
  });
});

router.get("/driver/earnings/history", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const page = parseInt(req.query.page as string ?? "1");
  const limit = parseInt(req.query.limit as string ?? "20");
  const offset = (page - 1) * limit;

  const [data, countResult] = await Promise.all([
    db.select().from(driverEarningsTable)
      .where(eq(driverEarningsTable.driverId, driver.id))
      .orderBy(desc(driverEarningsTable.date))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(driverEarningsTable)
      .where(eq(driverEarningsTable.driverId, driver.id)),
  ]);

  res.json({
    data: data.map(e => fmtEarning(e as Record<string, unknown>)),
    total: countResult[0].count,
    page,
    limit,
  });
});

// ─── DRIVER NOTIFICATIONS ─────────────────────────────────────────────────────

router.get("/driver/notifications", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const notifications = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json({ data: notifications });
});

// FIXED: driver wallet balance endpoint
router.get("/driver/wallet/balance", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const [totals] = await db.select({
    totalConfirmed: sql<string>`COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), '0')`,
    totalPaid:      sql<string>`COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), '0')`,
    totalPending:   sql<string>`COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), '0')`,
  }).from(driverEarningsTable).where(eq(driverEarningsTable.driverId, driver.id));

  res.json({
    balance:      parseFloat(totals?.totalConfirmed ?? "0"),
    totalPaid:    parseFloat(totals?.totalPaid ?? "0"),
    totalPending: parseFloat(totals?.totalPending ?? "0"),
  });
});

// FIXED: driver reviews endpoint
router.get("/driver/reviews", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db.select({ id: driversTable.id, rating: driversTable.rating })
    .from(driversTable).where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const page  = Math.max(1, parseInt(req.query.page  as string ?? "1")  || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string ?? "20") || 20);
  const offset = (page - 1) * limit;

  const ratingFilter = and(
    eq(rideEventsTable.type, "DRIVER_RATED"),
    sql`(${rideEventsTable.metadata}->>'driverId')::int = ${driver.id}`,
  );

  const [reviews, countResult] = await Promise.all([
    db.select().from(rideEventsTable)
      .where(ratingFilter)
      .orderBy(desc(rideEventsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(rideEventsTable).where(ratingFilter),
  ]);

  res.json({
    data: reviews.map(r => ({
      id:        r.id,
      rideId:    r.rideId,
      ...(r.metadata as Record<string, unknown>),
      createdAt: r.createdAt,
    })),
    total:         countResult[0]?.count ?? 0,
    page,
    limit,
    averageRating: parseFloat(driver.rating),
  });
});

// FIXED: driver promotions endpoint
router.get("/driver/promotions", authenticate, requireRole("driver"), async (_req, res): Promise<void> => {
  const now = new Date();
  res.json({
    data: [
      {
        id:               "promo_peak_hours",
        title:            "Peak Hours Bonus",
        description:      "Earn 20% extra during rush hours (7–9 am, 5–7 pm)",
        bonusPercentage:  20,
        validUntil:       new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(),
        isActive:         true,
        conditions:       { timeRanges: ["07:00-09:00", "17:00-19:00"] },
      },
      {
        id:           "promo_weekend",
        title:        "Weekend Warrior",
        description:  "Complete 10 rides this weekend for a bonus",
        bonusAmount:  500,
        targetRides:  10,
        validUntil:   new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString(),
        isActive:     true,
        conditions:   { daysOfWeek: ["saturday", "sunday"] },
      },
    ],
  });
});

export default router;
