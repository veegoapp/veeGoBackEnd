import { Router } from "express";
import {
  db, routesTable, stationsTable, tripsTable, driversTable,
  busesTable, usersTable, bookingsTable, driverShuttleBookingsTable,
  walletTransactionsTable, notificationsTable, driverEarningsTable, shuttleRatingsTable,
  shuttleOffencesTable,
} from "@workspace/db";
import { eq, sql, and, inArray, asc, gte, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";

const router = Router();

// ── Phase 3 Fix 5: Per-station 1-minute countdown timers ──────────────────────
// Key: "tripId:stationId" (or "tripId" if stationId not provided)
// Prevents double-starting the same station's timer within a single boarding session.
const stationTimers = new Map<string, ReturnType<typeof setTimeout>>();

const SHUTTLE_TOTAL_SEATS = 14;
const SHUTTLE_MIN_REQUIRED = 7;
const CAIRO_TZ = "Africa/Cairo";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuttleStatus(dbStatus: string): "open" | "active" | "cancelled" {
  if (dbStatus === "active" || dbStatus === "waiting_driver") return "active";
  if (dbStatus === "cancelled") return "cancelled";
  return "open";
}

function formatShuttleTrip(trip: Record<string, unknown>, bookedSeats: number) {
  const status = shuttleStatus(String(trip.status ?? "scheduled"));
  const available = SHUTTLE_TOTAL_SEATS - bookedSeats;
  const needed = Math.max(0, SHUTTLE_MIN_REQUIRED - bookedSeats);
  return {
    ...trip,
    price: typeof trip.price === "string" ? parseFloat(trip.price) : trip.price,
    totalSeats: SHUTTLE_TOTAL_SEATS,
    availableSeats: available,
    bookedSeats,
    minRequired: SHUTTLE_MIN_REQUIRED,
    shuttleStatus: status,
    message:
      status === "active"
        ? "Trip is confirmed — boarding guaranteed"
        : status === "cancelled"
        ? "Trip has been cancelled"
        : `Needs ${needed} more booking${needed !== 1 ? "s" : ""} to become active`,
  };
}

/**
 * Converts a UTC Date to "HH:MM" string in Cairo local time.
 * Used to display trip departure times as the admin entered them.
 */
function toCairoHHMM(utcDate: Date): string {
  return utcDate.toLocaleString("en-US", {
    timeZone: CAIRO_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Returns the Sunday (Cairo) that starts the work week for a given UTC Date.
 * Result is a "YYYY-MM-DD" string representing the Cairo-local Sunday.
 */
function tripDateToWeekStart(utcDate: Date): string {
  // Format the Cairo local date + weekday, then subtract days back to Sunday.
  const cairoDateStr = utcDate.toLocaleString("en-US", {
    timeZone: CAIRO_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Parse Cairo weekday
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dowStr = cairoDateStr.substring(0, 3);
  const dow = dowMap[dowStr] ?? 0;

  // Get Cairo date parts
  const cairoParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utcDate); // "YYYY-MM-DD"

  // Subtract `dow` days to get to Sunday
  const cairoDate = new Date(cairoParts + "T00:00:00Z");
  cairoDate.setUTCDate(cairoDate.getUTCDate() - dow);
  return cairoDate.toISOString().split("T")[0]!;
}

// ─── GET /shuttle/lines ────────────────────────────────────────────────────────
// Returns all active shuttle routes.
// timeslots now come from tripsTable (not routeTimeSlotsTable) so they always
// reflect exactly what the admin scheduled — no more ghost or missing slots.
router.get("/shuttle/lines", authenticate, async (req, res): Promise<void> => {
  const routes = await db
    .select({
      id: routesTable.id,
      name: routesTable.name,
      fromLocation: routesTable.fromLocation,
      toLocation: routesTable.toLocation,
      estimatedDuration: routesTable.estimatedDuration,
      basePrice: routesTable.basePrice,
      isActive: routesTable.isActive,
      createdAt: routesTable.createdAt,
      updatedAt: routesTable.updatedAt,
    })
    .from(routesTable)
    .where(eq(routesTable.isActive, true))
    .orderBy(routesTable.name);

  if (routes.length === 0) {
    res.json({ data: [], total: 0 });
    return;
  }

  const routeIds = routes.map((r) => r.id);
  const now = new Date();

  // ── Fetch upcoming trips for all routes ──────────────────────────────────
  // We need trips from today onward so we can derive available weeks + slots.
  const upcomingTrips = await db
    .select({
      id: tripsTable.id,
      routeId: tripsTable.routeId,
      departureTime: tripsTable.departureTime,
      availableSeats: tripsTable.availableSeats,
      totalSeats: tripsTable.totalSeats,
      status: tripsTable.status,
    })
    .from(tripsTable)
    .where(
      and(
        inArray(tripsTable.routeId, routeIds),
        gte(tripsTable.departureTime, now),
        inArray(tripsTable.status, ["scheduled", "waiting_driver", "driver_assigned"]),
      ),
    )
    .orderBy(asc(tripsTable.departureTime));

  // ── Station counts ───────────────────────────────────────────────────────
  const stationCounts = await db
    .select({
      routeId: stationsTable.routeId,
      stationCount: sql<number>`count(*)::int`,
    })
    .from(stationsTable)
    .where(inArray(stationsTable.routeId, routeIds))
    .groupBy(stationsTable.routeId);

  const stationMap = new Map(stationCounts.map((s) => [s.routeId, s.stationCount]));

  // ── Resolve calling driver (for isBooked flag) ───────────────────────────
  // We need to know which slots are already booked by the current driver.
  // Bookings are keyed by (routeId, weekStart, timeSlotId) — but since we're
  // replacing timeSlotId with trip-derived slots, we key by (routeId, weekStart, HH:MM).
  // For the lines list we only show the nearest upcoming week per route.
  const user = (req as unknown as { user?: { id: number } }).user;

  // ── Build per-route data ─────────────────────────────────────────────────
  // Group trips by routeId, then derive the nearest week and its slots.
  const tripsByRoute = new Map<number, typeof upcomingTrips>();
  for (const trip of upcomingTrips) {
    const list = tripsByRoute.get(trip.routeId) ?? [];
    list.push(trip);
    tripsByRoute.set(trip.routeId, list);
  }

  // Fetch driver bookings for routes that have upcoming trips
  const routesWithTrips = [...tripsByRoute.keys()];
  const driverBookings =
    routesWithTrips.length > 0 && user
      ? await db
          .select({
            routeId: driverShuttleBookingsTable.routeId,
            weekStart: driverShuttleBookingsTable.weekStart,
            timeSlotId: driverShuttleBookingsTable.timeSlotId,
            driverId: driverShuttleBookingsTable.driverId,
          })
          .from(driverShuttleBookingsTable)
          .where(
            and(
              inArray(driverShuttleBookingsTable.routeId, routesWithTrips),
              inArray(driverShuttleBookingsTable.status, ["active", "pending_renewal"]),
            ),
          )
      : [];

  // bookingKey = "routeId:weekStart:HH:MM" → driverId
  // We'll use this to mark isBooked on each slot
  const bookingMap = new Map<string, number>(
    driverBookings.map((b) => {
      // We store weekStart in the booking; we'll match by weekStart + departureTime HH:MM
      // But timeSlotId is from routeTimeSlotsTable which we're removing.
      // For now keep it simple: mark route as booked if any active booking exists.
      return [`${b.routeId}:${b.weekStart}`, b.driverId];
    }),
  );

  const data = routes.map((r) => {
    const routeTrips = tripsByRoute.get(r.id) ?? [];

    // Derive nearest week for this route
    let nearestWeekStart: string | null = null;
    if (routeTrips.length > 0) {
      nearestWeekStart = tripDateToWeekStart(routeTrips[0]!.departureTime);
    }

    // Build unique slots from trips in the nearest week
    const slotsMap = new Map<string, { hhmm: string; availableSeats: number; isTaken: boolean }>();
    for (const trip of routeTrips) {
      const ws = tripDateToWeekStart(trip.departureTime);
      if (ws !== nearestWeekStart) continue;
      const hhmm = toCairoHHMM(trip.departureTime);
      if (!slotsMap.has(hhmm)) {
        slotsMap.set(hhmm, {
          hhmm,
          availableSeats: trip.availableSeats,
          isTaken: false,
        });
      }
    }

    const isBookedThisWeek =
      nearestWeekStart !== null &&
      bookingMap.has(`${r.id}:${nearestWeekStart}`);

    const slots = [...slotsMap.values()]
      .sort((a, b) => a.hhmm.localeCompare(b.hhmm))
      .map((s) => ({
        departureTime: s.hhmm,
        availableSeats: s.availableSeats,
        isBooked: isBookedThisWeek,
      }));

    const totalTrips = routeTrips.length;
    const openTrips = routeTrips.filter((t) => t.status === "scheduled").length;
    const activeTrips = routeTrips.filter((t) =>
      ["waiting_driver", "driver_assigned"].includes(t.status),
    ).length;

    return {
      id: r.id,
      name: r.name,
      from: r.fromLocation,
      to: r.toLocation,
      fromLocation: r.fromLocation,
      toLocation: r.toLocation,
      estimatedDuration: r.estimatedDuration,
      basePrice: parseFloat(r.basePrice),
      isActive: r.isActive,
      stationCount: stationMap.get(r.id) ?? 0,
      totalTrips,
      openTrips,
      activeTrips,
      totalSeats: SHUTTLE_TOTAL_SEATS,
      minRequired: SHUTTLE_MIN_REQUIRED,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      upcomingWeekStart: nearestWeekStart,
      // timeslots derived from actual trips — no routeTimeSlotsTable
      timeslots: slots,
      timeSlots: slots, // alias for backwards compat
      availableSlots: slots.filter((s) => !s.isBooked).length,
      totalSlots: slots.length,
    };
  });

  res.json({ data, total: data.length });
});

// ─── GET /shuttle/assignments ──────────────────────────────────────────────────
router.get("/shuttle/assignments", authenticate, async (_req, res): Promise<void> => {
  const drivers = await db
    .select({
      driverId: driversTable.id,
      driverName: driversTable.name,
      driverPhone: driversTable.phone,
      driverStatus: driversTable.status,
      isOnline: driversTable.isOnline,
      isActive: driversTable.isActive,
      rating: driversTable.rating,
      userId: driversTable.userId,
      assignedBusId: driversTable.assignedBusId,
    })
    .from(driversTable)
    .where(and(eq(driversTable.isActive, true)))
    .orderBy(driversTable.name);

  const assignedDrivers = drivers.filter((d) => d.assignedBusId != null);
  if (assignedDrivers.length === 0) {
    res.json({ data: [], total: 0 });
    return;
  }

  const busIds = [...new Set(assignedDrivers.map((d) => d.assignedBusId as number))];
  const driverIds = assignedDrivers.map((d) => d.driverId);

  const [buses, activeTrips] = await Promise.all([
    db
      .select({
        id: busesTable.id,
        plateNumber: busesTable.plateNumber,
        model: busesTable.model,
        capacity: busesTable.capacity,
        isActive: busesTable.isActive,
      })
      .from(busesTable)
      .where(inArray(busesTable.id, busIds)),

    db
      .select({
        driverId: tripsTable.driverId,
        tripId: tripsTable.id,
        routeId: tripsTable.routeId,
        status: tripsTable.status,
        departureTime: tripsTable.departureTime,
        arrivalTime: tripsTable.arrivalTime,
        availableSeats: tripsTable.availableSeats,
        totalSeats: tripsTable.totalSeats,
        routeName: routesTable.name,
        fromLocation: routesTable.fromLocation,
        toLocation: routesTable.toLocation,
      })
      .from(tripsTable)
      .leftJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
      .where(
        and(
          inArray(tripsTable.driverId, driverIds),
          inArray(tripsTable.status, ["scheduled", "active"]),
        ),
      )
      .orderBy(tripsTable.departureTime),
  ]);

  const busMap = new Map(buses.map((b) => [b.id, b]));
  const tripMap = new Map<number, (typeof activeTrips)[0]>();
  for (const trip of activeTrips) {
    if (!tripMap.has(trip.driverId!)) tripMap.set(trip.driverId!, trip);
  }

  const data = assignedDrivers.map((d) => {
    const bus = busMap.get(d.assignedBusId as number);
    const trip = tripMap.get(d.driverId);
    return {
      driverId: d.driverId,
      driverName: d.driverName,
      driverPhone: d.driverPhone,
      driverStatus: d.driverStatus,
      isOnline: d.isOnline,
      rating: parseFloat(d.rating),
      userId: d.userId,
      bus: bus ?? null,
      currentTrip: trip
        ? {
            id: trip.tripId,
            routeId: trip.routeId,
            routeName: trip.routeName,
            fromLocation: trip.fromLocation,
            toLocation: trip.toLocation,
            status: trip.status,
            departureTime: trip.departureTime,
            arrivalTime: trip.arrivalTime,
            availableSeats: trip.availableSeats,
            totalSeats: trip.totalSeats,
          }
        : null,
    };
  });

  res.json({ data, total: data.length });
});

// ─── GET /shuttle/lines/:id ────────────────────────────────────────────────────
router.get("/shuttle/lines/:id", async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id as string);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route ID" }); return; }

  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Shuttle line not found" }); return; }

  const [stations, upcomingTrips] = await Promise.all([
    db.select().from(stationsTable)
      .where(eq(stationsTable.routeId, routeId))
      .orderBy(stationsTable.order),

    db.select({
      id: tripsTable.id,
      status: tripsTable.status,
      departureTime: tripsTable.departureTime,
      arrivalTime: tripsTable.arrivalTime,
      availableSeats: tripsTable.availableSeats,
      totalSeats: tripsTable.totalSeats,
      price: tripsTable.price,
      scheduleId: tripsTable.scheduleId,
    }).from(tripsTable)
      .where(and(
        eq(tripsTable.routeId, routeId),
        inArray(tripsTable.status, ["scheduled", "active", "waiting_driver"]),
      ))
      .orderBy(tripsTable.departureTime)
      .limit(20),
  ]);

  const tripIds = upcomingTrips.map((t) => t.id);
  const bookedCounts =
    tripIds.length > 0
      ? await db
          .select({
            tripId: bookingsTable.tripId,
            bookedSeats: sql<number>`coalesce(sum(${bookingsTable.seatCount}), 0)::int`,
          })
          .from(bookingsTable)
          .where(
            and(
              inArray(bookingsTable.tripId, tripIds),
              inArray(bookingsTable.status, ["pending", "confirmed"]),
            ),
          )
          .groupBy(bookingsTable.tripId)
      : [];

  const bookedMap = new Map(bookedCounts.map((b) => [b.tripId, b.bookedSeats]));

  const formattedTrips = upcomingTrips.map((t) => {
    const booked = bookedMap.get(t.id) ?? 0;
    return formatShuttleTrip(t as Record<string, unknown>, booked);
  });

  res.json({
    data: {
      ...route,
      basePrice: parseFloat(route.basePrice),
      stations,
      activeTrips: formattedTrips,
      stationCount: stations.length,
      totalSeats: SHUTTLE_TOTAL_SEATS,
      minRequired: SHUTTLE_MIN_REQUIRED,
    },
  });
});

// ─── GET /shuttle/trips/:id/passengers ────────────────────────────────────────
router.get("/shuttle/trips/:id/passengers", authenticate, async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [trip] = await db
    .select({ id: tripsTable.id, status: tripsTable.status, routeId: tripsTable.routeId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const bookings = await db
    .select({
      bookingId:     bookingsTable.id,
      userId:        bookingsTable.userId,
      seatCount:     bookingsTable.seatCount,
      totalPrice:    bookingsTable.totalPrice,
      status:        bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      createdAt:     bookingsTable.createdAt,
      userName:      usersTable.name,
      userPhone:     usersTable.phone,
      userEmail:     usersTable.email,
    })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(
      and(
        eq(bookingsTable.tripId, tripId),
        inArray(bookingsTable.status, ["pending", "confirmed", "boarded", "absent", "completed"]),
      ),
    )
    .orderBy(bookingsTable.createdAt);

  const bookedSeats = bookings.reduce((sum, b) => sum + b.seatCount, 0);

  res.json({
    tripId,
    tripStatus: trip.status,
    shuttleStatus: shuttleStatus(trip.status),
    totalSeats: SHUTTLE_TOTAL_SEATS,
    bookedSeats,
    availableSeats: SHUTTLE_TOTAL_SEATS - bookedSeats,
    minRequired: SHUTTLE_MIN_REQUIRED,
    data: bookings.map((b) => ({ ...b, totalPrice: parseFloat(b.totalPrice as string) })),
    total: bookings.length,
  });
});

// ─── GET /shuttle/lines/:id/passengers ────────────────────────────────────────
router.get("/shuttle/lines/:id/passengers", authenticate, async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id as string);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid line ID" }); return; }

  const [activeTrip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.routeId, routeId),
        inArray(tripsTable.status, ["active", "scheduled", "waiting_driver"]),
      ),
    )
    .orderBy(tripsTable.departureTime)
    .limit(1);

  if (!activeTrip) { res.status(404).json({ error: "No upcoming trip found for this shuttle line" }); return; }

  const bookings = await db
    .select({
      bookingId:     bookingsTable.id,
      userId:        bookingsTable.userId,
      seatCount:     bookingsTable.seatCount,
      totalPrice:    bookingsTable.totalPrice,
      status:        bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      createdAt:     bookingsTable.createdAt,
      userName:      usersTable.name,
      userPhone:     usersTable.phone,
      userEmail:     usersTable.email,
    })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(
      and(
        eq(bookingsTable.tripId, activeTrip.id),
        inArray(bookingsTable.status, ["pending", "confirmed", "boarded", "absent", "completed"]),
      ),
    )
    .orderBy(bookingsTable.createdAt);

  res.json({
    tripId: activeTrip.id,
    routeId,
    data: bookings.map((b) => ({ ...b, totalPrice: parseFloat(b.totalPrice as string) })),
    total: bookings.length,
  });
});

// ─── POST /shuttle/bookings/:id/board ─────────────────────────────────────────
router.post("/shuttle/bookings/:id/board", authenticate, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.id as string);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [booking] = await db
    .select({ id: bookingsTable.id, userId: bookingsTable.userId, tripId: bookingsTable.tripId, status: bookingsTable.status })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));

  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (!["confirmed", "pending"].includes(booking.status)) {
    res.status(400).json({ error: `Cannot board booking with status '${booking.status}'` });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "boarded" })
    .where(eq(bookingsTable.id, bookingId))
    .returning({ id: bookingsTable.id, userId: bookingsTable.userId, tripId: bookingsTable.tripId, status: bookingsTable.status });

  const timestamp = new Date().toISOString();
  const io = getIO();
  if (io) {
    io.to(`passenger:${booking.userId}`).emit(SOCKET_EVENTS.BOOKING_BOARDED, {
      bookingId:   String(booking.id),
      passengerId: String(booking.userId),
      timestamp,
    });
  }

  // ── Phase 3 Fix 5: 1-minute station timer ─────────────────────────────────
  // stationId is an optional integer in the request body. The driver app should
  // send it when boarding passengers at a specific stop so the timeout payload
  // can reference the station. If omitted, the timer key falls back to tripId only
  // (meaning only one timer fires per trip regardless of station).
  const rawStationId = req.body?.stationId;
  const stationId    = typeof rawStationId === "number" ? rawStationId : null;
  const timerKey     = stationId != null
    ? `${booking.tripId}:${stationId}`
    : `${booking.tripId}`;

  if (!stationTimers.has(timerKey) && io) {
    // Resolve the driver's userId to emit to their personal room
    const [tripRow] = await db
      .select({ driverId: tripsTable.driverId })
      .from(tripsTable)
      .where(eq(tripsTable.id, booking.tripId));

    if (tripRow?.driverId) {
      const [driverRow] = await db
        .select({ userId: driversTable.userId })
        .from(driversTable)
        .where(eq(driversTable.id, tripRow.driverId));

      if (driverRow) {
        const timer = setTimeout(() => {
          stationTimers.delete(timerKey);
          io.to(SOCKET_ROOMS.DRIVER(driverRow.userId)).emit(SOCKET_EVENTS.SHUTTLE_STATION_TIMEOUT, {
            tripId:    booking.tripId,
            stationId: stationId ?? null,
          });
        }, 60_000);
        stationTimers.set(timerKey, timer);
      }
    }
  }

  res.json({ ok: true, booking: updated, timestamp });
});

// ─── POST /shuttle/ratings ─────────────────────────────────────────────────────
// Fix 1: Rate after trip — passenger rates driver; driver rates boarded passengers.
// One rating per (tripId, raterId) enforced by uniqueIndex + pre-check.
router.post("/shuttle/ratings", authenticate, async (req, res): Promise<void> => {
  const { tripId, rateeId, stars } = req.body ?? {};

  if (!Number.isInteger(tripId) || tripId <= 0) {
    res.status(400).json({ error: "tripId must be a positive integer" }); return;
  }
  if (!Number.isInteger(rateeId) || rateeId <= 0) {
    res.status(400).json({ error: "rateeId must be a positive integer" }); return;
  }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    res.status(400).json({ error: "stars must be an integer between 1 and 5" }); return;
  }

  const raterId  = req.user!.id;
  const userRole = req.user!.role;

  const [existing] = await db
    .select({ id: shuttleRatingsTable.id })
    .from(shuttleRatingsTable)
    .where(and(eq(shuttleRatingsTable.tripId, tripId), eq(shuttleRatingsTable.raterId, raterId)));

  if (existing) { res.status(400).json({ error: "Already rated." }); return; }

  const [trip] = await db
    .select({ id: tripsTable.id, driverId: tripsTable.driverId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  if (userRole === "user") {
    if (!trip.driverId) { res.status(400).json({ error: "No driver assigned to this trip" }); return; }

    const [driverRow] = await db
      .select({ userId: driversTable.userId })
      .from(driversTable)
      .where(eq(driversTable.id, trip.driverId));

    if (!driverRow || driverRow.userId !== rateeId) {
      res.status(403).json({ error: "You can only rate the driver of your trip" }); return;
    }

    const [booking] = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.tripId, tripId), eq(bookingsTable.userId, raterId)));

    if (!booking) { res.status(403).json({ error: "You were not a passenger on this trip" }); return; }

  } else if (userRole === "driver") {
    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, raterId));

    if (!driverRow || trip.driverId !== driverRow.id) {
      res.status(403).json({ error: "You are not the driver of this trip" }); return;
    }

    const [booking] = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.tripId, tripId),
        eq(bookingsTable.userId, rateeId),
        inArray(bookingsTable.status, ["boarded", "completed"]),
      ));

    if (!booking) {
      res.status(403).json({ error: "You can only rate passengers who boarded your trip" }); return;
    }
  } else {
    res.status(403).json({ error: "Only passengers and drivers can submit shuttle ratings" }); return;
  }

  const [rating] = await db
    .insert(shuttleRatingsTable)
    .values({ tripId, raterId, rateeId, stars })
    .returning();

  // When a passenger rates the driver, recalculate the driver's average rating.
  // Passenger records have no aggregate rating column on usersTable.
  if (userRole === "user" && trip.driverId) {
    await db.execute(
      sql`
        UPDATE drivers
        SET    rating = (
          SELECT AVG(sr.stars)::numeric(3, 2)
          FROM   shuttle_ratings sr
          WHERE  sr.ratee_id = ${rateeId}
        )
        WHERE  id = ${trip.driverId}
      `,
    );
  }

  res.status(201).json({ ok: true, rating });
});

// ─── GET /shuttle/my-trips ─────────────────────────────────────────────────────
// Fix 2: Paginated shuttle trip history for the authenticated passenger.
router.get("/shuttle/my-trips", authenticate, requireRole("user"), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const page   = Math.max(1, parseInt(String(req.query.page  ?? "1")));
  const limit  = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"))));
  const offset = (page - 1) * limit;

  const [bookings, countRow] = await Promise.all([
    db
      .select({
        bookingId:     bookingsTable.id,
        tripId:        bookingsTable.tripId,
        bookingStatus: bookingsTable.status,
        paymentStatus: bookingsTable.paymentStatus,
        totalPrice:    bookingsTable.totalPrice,
        tripStatus:    tripsTable.status,
        departureTime: tripsTable.departureTime,
        routeId:       tripsTable.routeId,
        driverId:      tripsTable.driverId,
      })
      .from(bookingsTable)
      .innerJoin(tripsTable, eq(bookingsTable.tripId, tripsTable.id))
      .where(eq(bookingsTable.userId, userId))
      .orderBy(desc(tripsTable.departureTime))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingsTable)
      .where(eq(bookingsTable.userId, userId)),
  ]);

  const total = countRow[0]?.count ?? 0;

  if (bookings.length === 0) {
    res.json({ data: [], total, page, limit }); return;
  }

  const tripIds   = [...new Set(bookings.map((b) => b.tripId))];
  const routeIds  = [...new Set(bookings.map((b) => b.routeId))];
  const driverIds = [...new Set(bookings.map((b) => b.driverId).filter(Boolean) as number[])];

  const [routes, drivers, myRatings] = await Promise.all([
    routeIds.length > 0
      ? db.select({ id: routesTable.id, name: routesTable.name })
          .from(routesTable).where(inArray(routesTable.id, routeIds))
      : Promise.resolve([] as { id: number; name: string }[]),

    driverIds.length > 0
      ? db.select({ id: driversTable.id, name: driversTable.name, rating: driversTable.rating })
          .from(driversTable).where(inArray(driversTable.id, driverIds))
      : Promise.resolve([] as { id: number; name: string; rating: string }[]),

    tripIds.length > 0
      ? db
          .select({ tripId: shuttleRatingsTable.tripId, stars: shuttleRatingsTable.stars })
          .from(shuttleRatingsTable)
          .where(and(inArray(shuttleRatingsTable.tripId, tripIds), eq(shuttleRatingsTable.raterId, userId)))
      : Promise.resolve([] as { tripId: number; stars: number }[]),
  ]);

  const routeMap  = new Map(routes.map((r) => [r.id, r.name]));
  const driverMap = new Map(drivers.map((d) => [d.id, d]));
  const ratingMap = new Map(myRatings.map((r) => [r.tripId, r.stars]));

  const data = bookings.map((b) => ({
    tripId:          b.tripId,
    bookingId:       b.bookingId,
    routeName:       routeMap.get(b.routeId) ?? null,
    date:            b.departureTime.toISOString().split("T")[0],
    departureTime:   b.departureTime.toISOString(),
    driverName:      b.driverId ? (driverMap.get(b.driverId)?.name ?? null) : null,
    driverRating:    b.driverId ? parseFloat(String(driverMap.get(b.driverId)?.rating ?? "0")) : null,
    status:          b.bookingStatus,
    ticketPrice:     parseFloat(String(b.totalPrice)),
    paymentStatus:   b.paymentStatus,
    passengerRating: ratingMap.get(b.tripId) ?? null,
  }));

  res.json({ data, total, page, limit });
});

// ─── GET /shuttle/driver/my-trips ──────────────────────────────────────────────
// Fix 3: Paginated shuttle trip history for the authenticated driver.
router.get("/shuttle/driver/my-trips", authenticate, requireRole("driver"), async (req, res): Promise<void> => {
  const [driver] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, req.user!.id));
  if (!driver) { res.status(404).json({ error: "Driver profile not found" }); return; }

  const page   = Math.max(1, parseInt(String(req.query.page  ?? "1")));
  const limit  = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"))));
  const offset = (page - 1) * limit;

  const [trips, countRow] = await Promise.all([
    db
      .select({
        id:            tripsTable.id,
        status:        tripsTable.status,
        departureTime: tripsTable.departureTime,
        routeId:       tripsTable.routeId,
      })
      .from(tripsTable)
      .where(eq(tripsTable.driverId, driver.id))
      .orderBy(desc(tripsTable.departureTime))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tripsTable)
      .where(eq(tripsTable.driverId, driver.id)),
  ]);

  const total = countRow[0]?.count ?? 0;

  if (trips.length === 0) {
    res.json({ data: [], total, page, limit }); return;
  }

  const tripIds  = trips.map((t) => t.id);
  const routeIds = [...new Set(trips.map((t) => t.routeId))];

  const [routes, bookingStats, earningsRows] = await Promise.all([
    routeIds.length > 0
      ? db.select({ id: routesTable.id, name: routesTable.name })
          .from(routesTable).where(inArray(routesTable.id, routeIds))
      : Promise.resolve([] as { id: number; name: string }[]),

    db
      .select({
        tripId:  bookingsTable.tripId,
        total:   sql<number>`count(*)::int`,
        boarded: sql<number>`count(*) filter (where ${bookingsTable.status} = 'boarded')::int`,
        absent:  sql<number>`count(*) filter (where ${bookingsTable.status} = 'absent')::int`,
      })
      .from(bookingsTable)
      .where(inArray(bookingsTable.tripId, tripIds))
      .groupBy(bookingsTable.tripId),

    db
      .select({ tripId: driverEarningsTable.tripId, amount: driverEarningsTable.amount })
      .from(driverEarningsTable)
      .where(and(
        eq(driverEarningsTable.driverId, driver.id),
        inArray(driverEarningsTable.tripId, tripIds),
      )),
  ]);

  const routeMap    = new Map(routes.map((r) => [r.id, r.name]));
  const statsMap    = new Map(bookingStats.map((s) => [s.tripId, s]));
  const earningsMap = new Map(earningsRows.map((e) => [e.tripId, parseFloat(String(e.amount))]));

  const data = trips.map((t) => {
    const stats = statsMap.get(t.id);
    return {
      tripId:            t.id,
      routeName:         routeMap.get(t.routeId) ?? null,
      date:              t.departureTime.toISOString().split("T")[0],
      departureTime:     t.departureTime.toISOString(),
      totalPassengers:   stats?.total   ?? 0,
      boardedPassengers: stats?.boarded ?? 0,
      absentPassengers:  stats?.absent  ?? 0,
      earnings:          earningsMap.get(t.id) ?? 0,
      status:            t.status,
    };
  });

  res.json({ data, total, page, limit });
});

// ─── DELETE /shuttle/bookings/:id ──────────────────────────────────────────────
// Fix 4: Passenger cancels their own shuttle booking.
// > 12 h before departure → full wallet refund; ≤ 12 h → no refund.
router.delete("/shuttle/bookings/:id", authenticate, requireRole("user"), async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.id as string);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }

  const [booking] = await db
    .select({
      id:            bookingsTable.id,
      userId:        bookingsTable.userId,
      tripId:        bookingsTable.tripId,
      status:        bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      totalPrice:    bookingsTable.totalPrice,
      seatCount:     bookingsTable.seatCount,
    })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));

  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.userId !== req.user!.id) {
    res.status(403).json({ error: "You can only cancel your own bookings" }); return;
  }
  if (booking.status === "cancelled") {
    res.status(400).json({ error: "Booking is already cancelled" }); return;
  }
  if (["boarded", "completed", "absent"].includes(booking.status)) {
    res.status(400).json({ error: `Cannot cancel a booking with status '${booking.status}'` }); return;
  }

  const [trip] = await db
    .select({ id: tripsTable.id, departureTime: tripsTable.departureTime, status: tripsTable.status })
    .from(tripsTable)
    .where(eq(tripsTable.id, booking.tripId));

  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const now                 = new Date();
  const hoursUntilDeparture = (trip.departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isFullRefund        = hoursUntilDeparture > 12;

  await db
    .update(bookingsTable)
    .set({ status: "cancelled", ...(isFullRefund ? { paymentStatus: "refunded" } : {}) })
    .where(eq(bookingsTable.id, bookingId));

  await db.execute(
    sql`UPDATE trips SET available_seats = available_seats + ${booking.seatCount} WHERE id = ${booking.tripId}`,
  );

  const io = getIO();

  if (isFullRefund && booking.paymentStatus === "paid") {
    await db.execute(
      sql`UPDATE users SET wallet_balance = wallet_balance + ${booking.totalPrice} WHERE id = ${booking.userId}`,
    );

    await db.insert(walletTransactionsTable).values({
      userId:      booking.userId,
      amount:      String(booking.totalPrice),
      type:        "refund",
      description: `Refund for shuttle booking #${booking.id} (trip #${booking.tripId}) — cancelled >12h before departure`,
    });

    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId: booking.userId,
        title:  "Booking Cancelled — Refund Issued",
        body:   `Your shuttle booking (trip #${booking.tripId}) has been cancelled and ${parseFloat(String(booking.totalPrice)).toFixed(2)} EGP has been refunded to your wallet.`,
      })
      .returning();

    if (io && notif) {
      io.to(SOCKET_ROOMS.PASSENGER(booking.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
        id:       String(notif.id),
        category: "booking",
        title:    notif.title,
        body:     notif.body,
        time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
      });
    }
  } else {
    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId: booking.userId,
        title:  "Booking Cancelled — No Refund",
        body:   `Your shuttle booking (trip #${booking.tripId}) has been cancelled. No refund applies because the trip departs in less than 12 hours.`,
      })
      .returning();

    if (io && notif) {
      io.to(SOCKET_ROOMS.PASSENGER(booking.userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
        id:       String(notif.id),
        category: "booking",
        title:    notif.title,
        body:     notif.body,
        time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
      });
    }
  }

  res.json({ ok: true, bookingId, refunded: isFullRefund });
});

// ─── GET /shuttle/my-debt ──────────────────────────────────────────────────────
// Returns the authenticated passenger's current cash debt (negative wallet
// balance) and how many shuttle no-show offences they have on record.
router.get("/shuttle/my-debt", authenticate, requireRole("user"), async (req, res): Promise<void> => {
  const userId = (req as unknown as { user: { id: number } }).user.id;

  const [userRow, offenceRow] = await Promise.all([
    db
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((rows) => rows[0]),

    db
      .select({ offenceCount: shuttleOffencesTable.offenceCount })
      .from(shuttleOffencesTable)
      .where(
        and(
          eq(shuttleOffencesTable.userId, userId),
          eq(shuttleOffencesTable.actorType, "passenger"),
        ),
      )
      .then((rows) => rows[0]),
  ]);

  if (!userRow) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const balance = parseFloat(userRow.walletBalance as string);
  const offenceCount = offenceRow?.offenceCount ?? 0;

  if (balance >= 0) {
    res.json({ hasDebt: false, debtAmount: 0, offenceCount });
    return;
  }

  res.json({ hasDebt: true, debtAmount: Math.abs(balance), offenceCount });
});

export default router;