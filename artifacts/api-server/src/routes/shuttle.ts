import { Router } from "express";
import { db, routesTable, stationsTable, tripsTable, driversTable, busesTable, usersTable, bookingsTable } from "@workspace/db";
import { eq, sql, and, inArray, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS } from "../lib/socket-events";

const router = Router();

const SHUTTLE_TOTAL_SEATS = 14;
const SHUTTLE_MIN_REQUIRED = 7;

function shuttleStatus(dbStatus: string): "open" | "active" | "cancelled" {
  if (dbStatus === "active") return "active";
  if (dbStatus === "cancelled") return "cancelled";
  return "open";
}

function formatShuttleTrip(
  trip: Record<string, unknown>,
  bookedSeats: number,
) {
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

// ─── GET /shuttle/lines ────────────────────────────────────────────────────────
// Returns all active shuttle routes with station counts and booking stats.
router.get("/shuttle/lines", async (_req, res): Promise<void> => {
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

  const [stationCounts, tripStats] = await Promise.all([
    db
      .select({
        routeId: stationsTable.routeId,
        stationCount: sql<number>`count(*)::int`,
      })
      .from(stationsTable)
      .where(inArray(stationsTable.routeId, routeIds))
      .groupBy(stationsTable.routeId),

    db
      .select({
        routeId: tripsTable.routeId,
        openTrips: sql<number>`count(*) filter (where ${tripsTable.status} = 'scheduled')::int`,
        activeTrips: sql<number>`count(*) filter (where ${tripsTable.status} = 'active')::int`,
        totalTrips: sql<number>`count(*)::int`,
      })
      .from(tripsTable)
      .where(
        and(
          inArray(tripsTable.routeId, routeIds),
          inArray(tripsTable.status, ["scheduled", "active"]),
        ),
      )
      .groupBy(tripsTable.routeId),
  ]);

  const stationMap = new Map(stationCounts.map((s) => [s.routeId, s.stationCount]));
  const tripMap = new Map(tripStats.map((t) => [t.routeId, t]));

  const data = routes.map((r) => {
    const trips = tripMap.get(r.id);
    return {
      id: r.id,
      name: r.name,
      fromLocation: r.fromLocation,
      toLocation: r.toLocation,
      estimatedDuration: r.estimatedDuration,
      basePrice: parseFloat(r.basePrice),
      isActive: r.isActive,
      stationCount: stationMap.get(r.id) ?? 0,
      totalTrips: trips?.totalTrips ?? 0,
      openTrips: trips?.openTrips ?? 0,
      activeTrips: trips?.activeTrips ?? 0,
      totalSeats: SHUTTLE_TOTAL_SEATS,
      minRequired: SHUTTLE_MIN_REQUIRED,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  res.json({ data, total: data.length });
});

// ─── GET /shuttle/assignments ──────────────────────────────────────────────────
router.get("/shuttle/assignments", async (_req, res): Promise<void> => {
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
    if (!tripMap.has(trip.driverId)) {
      tripMap.set(trip.driverId, trip);
    }
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
        inArray(tripsTable.status, ["scheduled", "active"]),
      ))
      .orderBy(tripsTable.departureTime)
      .limit(10),
  ]);

  // Fetch booked seat counts for all upcoming trips
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
    data: bookings.map((b) => ({
      ...b,
      totalPrice: parseFloat(b.totalPrice as string),
    })),
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
        inArray(tripsTable.status, ["active", "scheduled"]),
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
    data: bookings.map((b) => ({
      ...b,
      totalPrice: parseFloat(b.totalPrice as string),
    })),
    total: bookings.length,
  });
});

// ─── POST /shuttle/bookings/:id/board — mark passenger as boarded ─────────────
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
      bookingId: String(booking.id),
      passengerId: String(booking.userId),
      timestamp,
    });
  }

  res.json({ ok: true, booking: updated, timestamp });
});

export default router;
