import { Router } from "express";
import { db, routesTable, stationsTable, tripsTable, driversTable, busesTable, usersTable, bookingsTable, tripStationProgressTable, tripEventsTable } from "@workspace/db";
import { eq, sql, and, inArray, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS } from "../lib/socket-events";

const router = Router();

// ─── GET /shuttle/lines ────────────────────────────────────────────────────────
// Returns all active shuttle routes (lines) enriched with station count and
// upcoming/active trip statistics.
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
    // Count stations per route
    db
      .select({
        routeId: stationsTable.routeId,
        stationCount: sql<number>`count(*)::int`,
      })
      .from(stationsTable)
      .where(inArray(stationsTable.routeId, routeIds))
      .groupBy(stationsTable.routeId),

    // Count scheduled + active trips per route
    db
      .select({
        routeId: tripsTable.routeId,
        totalTrips: sql<number>`count(*)::int`,
        scheduledTrips: sql<number>`count(*) filter (where ${tripsTable.status} = 'scheduled')::int`,
        activeTrips: sql<number>`count(*) filter (where ${tripsTable.status} = 'active')::int`,
      })
      .from(tripsTable)
      .where(
        and(
          inArray(tripsTable.routeId, routeIds),
          inArray(tripsTable.status, ["scheduled", "active", "boarding"]),
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
      scheduledTrips: trips?.scheduledTrips ?? 0,
      activeTrips: trips?.activeTrips ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  res.json({ data, total: data.length });
});

// ─── GET /shuttle/assignments ──────────────────────────────────────────────────
// Returns all drivers who have a bus assigned, along with bus details and their
// current active/scheduled trip (if any).
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
          inArray(tripsTable.status, ["scheduled", "active", "boarding", "driver_assigned"]),
        ),
      )
      .orderBy(tripsTable.departureTime),
  ]);

  const busMap = new Map(buses.map((b) => [b.id, b]));
  // Keep only the soonest trip per driver
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
      bus: bus
        ? {
            id: bus.id,
            plateNumber: bus.plateNumber,
            model: bus.model,
            capacity: bus.capacity,
            isActive: bus.isActive,
          }
        : null,
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

  const [stations, activeTrips] = await Promise.all([
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
      driverId: tripsTable.driverId,
    }).from(tripsTable)
      .where(and(
        eq(tripsTable.routeId, routeId),
        inArray(tripsTable.status, ["scheduled", "active", "boarding", "driver_assigned"]),
      ))
      .orderBy(tripsTable.departureTime)
      .limit(10),
  ]);

  res.json({
    data: {
      ...route,
      basePrice: parseFloat(route.basePrice),
      stations,
      activeTrips,
      stationCount: stations.length,
    },
  });
});

// POST /shuttle/lines/:id/activate — POST is intentional here; this is an action endpoint
// that triggers a state transition (activates line + advances next trip to "boarding").
router.post("/shuttle/lines/:id/activate", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id as string);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route ID" }); return; }

  const [route] = await db.select({ id: routesTable.id, isActive: routesTable.isActive })
    .from(routesTable).where(eq(routesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Shuttle line not found" }); return; }

  await db.update(routesTable).set({ isActive: true }).where(eq(routesTable.id, routeId));

  const [nextTrip] = await db.select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(
      eq(tripsTable.routeId, routeId),
      inArray(tripsTable.status, ["scheduled", "driver_assigned"]),
    ))
    .orderBy(tripsTable.departureTime)
    .limit(1);

  let boardingTrip = null;
  if (nextTrip) {
    const [updated] = await db.update(tripsTable)
      .set({ status: "boarding" })
      .where(eq(tripsTable.id, nextTrip.id))
      .returning();
    boardingTrip = updated;
  }

  const [updatedRoute] = await db.select().from(routesTable).where(eq(routesTable.id, routeId));
  res.json({
    data:        { ...updatedRoute, basePrice: parseFloat(updatedRoute.basePrice) },
    boardingTrip: boardingTrip ?? null,
  });
});

// POST /shuttle/lines/:id/complete — action endpoint; POST is intentional (state transition, not resource creation).

router.post("/shuttle/lines/:id/complete", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id as string);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route ID" }); return; }

  const [route] = await db.select({ id: routesTable.id }).from(routesTable).where(eq(routesTable.id, routeId));
  if (!route) { res.status(404).json({ error: "Shuttle line not found" }); return; }

  const activeTrips = await db.select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(
      eq(tripsTable.routeId, routeId),
      inArray(tripsTable.status, ["active", "boarding", "driver_assigned"]),
    ));

  if (activeTrips.length === 0) {
    res.json({ ok: true, completedTrips: 0, message: "No active trips to complete" });
    return;
  }

  const tripIds = activeTrips.map(t => t.id);
  const now = new Date();

  await db.update(tripsTable)
    .set({ status: "completed", completedAt: now })
    .where(inArray(tripsTable.id, tripIds));

  await db.update(bookingsTable)
    .set({ status: "completed" })
    .where(and(
      inArray(bookingsTable.tripId, tripIds),
      inArray(bookingsTable.status, ["confirmed", "boarded"]),
    ));

  res.json({ ok: true, completedTrips: tripIds.length });
});

// ─── POST /shuttle/stops/:id/board ────────────────────────────────────────────

router.post("/shuttle/stops/:id/board", authenticate, async (req, res): Promise<void> => {
  const stationId = parseInt(req.params.id as string);
  if (isNaN(stationId)) { res.status(400).json({ error: "Invalid stop ID" }); return; }

  const tripId = parseInt(req.body?.tripId);
  if (isNaN(tripId)) { res.status(400).json({ error: "tripId is required" }); return; }

  const [station] = await db.select({ id: stationsTable.id, routeId: stationsTable.routeId })
    .from(stationsTable).where(eq(stationsTable.id, stationId));
  if (!station) { res.status(404).json({ error: "Stop not found" }); return; }

  const [trip] = await db.select({ id: tripsTable.id, status: tripsTable.status, driverId: tripsTable.driverId })
    .from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  if (!["active", "boarding"].includes(trip.status)) {
    res.status(400).json({ error: `Cannot board at stop for trip with status '${trip.status}'` });
    return;
  }

  await db.insert(tripStationProgressTable)
    .values({ tripId, stationId, status: "arrived", arrivedAt: new Date() })
    .onConflictDoUpdate({
      target: [tripStationProgressTable.tripId, tripStationProgressTable.stationId],
      set: { status: "arrived", arrivedAt: new Date() },
    });

  await db.insert(tripEventsTable).values({
    tripId,
    type: "LOCATION_UPDATE",
    metadata: { stationId, event: "boarding" },
  });

  const [progress] = await db.select().from(tripStationProgressTable)
    .where(and(
      eq(tripStationProgressTable.tripId, tripId),
      eq(tripStationProgressTable.stationId, stationId),
    ));

  res.json({ ok: true, stationId, tripId, progress });
});

// FIXED: GET /shuttle/trips/:id/passengers — returns booked passengers with boarding status
router.get("/shuttle/trips/:id/passengers", authenticate, async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [trip] = await db.select({ id: tripsTable.id, status: tripsTable.status, routeId: tripsTable.routeId })
    .from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const bookings = await db.select({
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
        inArray(bookingsTable.status, ["confirmed", "boarded", "absent", "completed"]),
      ),
    )
    .orderBy(bookingsTable.createdAt);

  res.json({
    tripId,
    tripStatus: trip.status,
    data: bookings.map(b => ({
      ...b,
      totalPrice: parseFloat(b.totalPrice as string),
      boarded:    b.status === "boarded",
    })),
    total: bookings.length,
  });
});

// FIXED: POST /shuttle/trips/:id/board-stop — marks a stop as reached and updates passenger boarding status
router.post("/shuttle/trips/:id/board-stop", authenticate, async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const stationId = parseInt(req.body?.stationId);
  if (isNaN(stationId)) { res.status(400).json({ error: "stationId is required" }); return; }

  const [trip] = await db.select({ id: tripsTable.id, status: tripsTable.status })
    .from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  if (!["active", "boarding"].includes(trip.status)) {
    res.status(400).json({ error: `Cannot board-stop for trip with status '${trip.status}'` });
    return;
  }

  const [station] = await db.select({ id: stationsTable.id, name: stationsTable.name })
    .from(stationsTable).where(eq(stationsTable.id, stationId));
  if (!station) { res.status(404).json({ error: "Station not found" }); return; }

  await db.insert(tripStationProgressTable)
    .values({ tripId, stationId, status: "arrived", arrivedAt: new Date() })
    .onConflictDoUpdate({
      target: [tripStationProgressTable.tripId, tripStationProgressTable.stationId],
      set:    { status: "arrived", arrivedAt: new Date() },
    });

  await db.insert(tripEventsTable).values({
    tripId,
    type:     "LOCATION_UPDATE",
    metadata: { stationId, stationName: station.name, event: "board_stop" },
  });

  const [progress] = await db.select().from(tripStationProgressTable)
    .where(and(
      eq(tripStationProgressTable.tripId, tripId),
      eq(tripStationProgressTable.stationId, stationId),
    ));

  const boardedPassengers = await db.select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.tripId, tripId), eq(bookingsTable.status, "boarded")));

  res.json({
    ok:               true,
    tripId,
    stationId,
    stationName:      station.name,
    progress,
    boardedPassengers: boardedPassengers[0]?.count ?? 0,
  });
});

// ─── POST /shuttle/lines/:id/book ─────────────────────────────────────────────
// Driver books a weekly recurring slot on a shuttle line.
// Body: { weekStart: "YYYY-MM-DD", weekEnd: "YYYY-MM-DD", departureTime: "HH:MM" }
// Rules:
//   • Only drivers with an assigned bus can book.
//   • A slot (route + week + time) can only be held by one driver.
//   • Creates a trip record in "scheduled" status.
router.post("/shuttle/lines/:id/book", authenticate, async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id as string);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid route ID" }); return; }

  const { weekStart, weekEnd, departureTime } = req.body as {
    weekStart?: string;
    weekEnd?: string;
    departureTime?: string;
  };

  // Validate required fields
  if (!weekStart || !weekEnd || !departureTime) {
    res.status(400).json({ error: "weekStart, weekEnd, and departureTime are required" });
    return;
  }

  // Validate allowed time slots (Sun–Thu schedule)
  const ALLOWED_SLOTS = ["07:00", "08:00", "09:00", "10:00", "13:00", "14:00", "15:00", "16:00"];
  if (!ALLOWED_SLOTS.includes(departureTime)) {
    res.status(400).json({ error: `Invalid time slot. Allowed slots: ${ALLOWED_SLOTS.join(", ")}` });
    return;
  }

  // Validate date range
  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekEnd);
  if (isNaN(weekStartDate.getTime()) || isNaN(weekEndDate.getTime())) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    return;
  }
  if (weekEndDate <= weekStartDate) {
    res.status(400).json({ error: "weekEnd must be after weekStart" });
    return;
  }

  // Resolve authenticated driver profile
  const [driver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.userId, req.user!.id));

  if (!driver) {
    res.status(403).json({ error: "Driver profile not found. Contact your administrator." });
    return;
  }

  if (!driver.assignedBusId) {
    res.status(422).json({
      error: "No bus assigned to your account. Please contact your administrator to assign a bus before booking.",
    });
    return;
  }

  // Resolve route and bus
  const [[route], [bus]] = await Promise.all([
    db.select().from(routesTable).where(eq(routesTable.id, routeId)),
    db.select().from(busesTable).where(eq(busesTable.id, driver.assignedBusId)),
  ]);

  if (!route) { res.status(404).json({ error: "Shuttle line not found" }); return; }
  if (!route.isActive) { res.status(400).json({ error: "This shuttle line is currently inactive" }); return; }
  if (!bus) { res.status(422).json({ error: "Assigned bus not found. Contact your administrator." }); return; }

  // Build full departure datetime: weekStart date + HH:MM
  const [hours, minutes] = departureTime.split(":").map(Number);
  const departureDateTime = new Date(weekStartDate);
  departureDateTime.setUTCHours(hours, minutes, 0, 0);
  const arrivalDateTime = new Date(departureDateTime.getTime() + Number(route.estimatedDuration) * 60 * 1000);

  // Conflict check: any live trip on this route in this week at this time slot
  const conflicts = await db
    .select({ id: tripsTable.id, driverId: tripsTable.driverId })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.routeId, routeId),
        sql`DATE(departure_time AT TIME ZONE 'UTC') >= ${weekStart}::date`,
        sql`DATE(departure_time AT TIME ZONE 'UTC') <= ${weekEnd}::date`,
        sql`TO_CHAR(departure_time AT TIME ZONE 'UTC', 'HH24:MI') = ${departureTime}`,
        sql`status != 'cancelled'`,
      ),
    );

  if (conflicts.length > 0) {
    const isMine = conflicts.some((c) => c.driverId === driver.id);
    res.status(409).json({
      error: isMine
        ? "You have already booked this slot for this week."
        : "This time slot is already taken by another driver for this week.",
    });
    return;
  }

  // Create the trip — recurring weekdays (Sun–Thu = 0,1,2,3,4)
  const [trip] = await db
    .insert(tripsTable)
    .values({
      routeId,
      busId: driver.assignedBusId,
      driverId: driver.id,
      departureTime: departureDateTime,
      arrivalTime: arrivalDateTime,
      availableSeats: bus.capacity,
      totalSeats: bus.capacity,
      price: route.basePrice,
      status: "scheduled",
      isActive: true,
      recurringType: "weekdays",
      weekdays: "0,1,2,3,4",
    })
    .returning();

  res.status(201).json({
    ok: true,
    booking: {
      id: trip.id,
      routeId: trip.routeId,
      routeName: route.name,
      fromLocation: route.fromLocation,
      toLocation: route.toLocation,
      departureTime: trip.departureTime,
      arrivalTime: trip.arrivalTime,
      weekStart,
      weekEnd,
      departureSlot: departureTime,
      status: trip.status,
      availableSeats: trip.availableSeats,
      totalSeats: trip.totalSeats,
      bus: {
        id: bus.id,
        plateNumber: bus.plateNumber,
        model: bus.model,
        capacity: bus.capacity,
      },
    },
  });
});

// ─── GET /shuttle/lines/:id/passengers — alias for /shuttle/trips/:id/passengers
// Used by the driver app. Resolves the most recent active/boarding trip for the
// given route and returns its passenger list.
router.get("/shuttle/lines/:id/passengers", authenticate, async (req, res): Promise<void> => {
  const routeId = parseInt(req.params.id as string);
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid line ID" }); return; }

  const [activeTrip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.routeId, routeId),
        inArray(tripsTable.status, ["active", "boarding", "driver_assigned", "scheduled"]),
      ),
    )
    .orderBy(tripsTable.departureTime)
    .limit(1);

  if (!activeTrip) { res.status(404).json({ error: "No active trip found for this shuttle line" }); return; }

  const bookings = await db.select({
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
        inArray(bookingsTable.status, ["confirmed", "boarded", "absent", "completed"]),
      ),
    )
    .orderBy(bookingsTable.createdAt);

  res.json({
    tripId: activeTrip.id,
    routeId,
    data: bookings.map(b => ({
      ...b,
      totalPrice: parseFloat(b.totalPrice as string),
      boarded: b.status === "boarded",
    })),
    total: bookings.length,
  });
});

// ─── GET /shuttle/driver/bookings ─────────────────────────────────────────────
// Returns the authenticated driver's shuttle bookings (trips they created).
// Query: ?filter=upcoming|past|all  (default: upcoming)
router.get("/shuttle/driver/bookings", authenticate, async (req, res): Promise<void> => {
  const [driver] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, req.user!.id));

  if (!driver) { res.status(403).json({ error: "Driver profile not found" }); return; }

  const filter = (req.query.filter as string) ?? "upcoming";
  const validFilters = ["upcoming", "past", "all"];
  if (!validFilters.includes(filter)) {
    res.status(400).json({ error: `Invalid filter. Use: ${validFilters.join(", ")}` });
    return;
  }

  const statusFilter =
    filter === "upcoming"
      ? inArray(tripsTable.status, ["scheduled", "driver_assigned", "boarding", "active"])
      : filter === "past"
      ? inArray(tripsTable.status, ["completed", "cancelled"])
      : undefined;

  const trips = await db
    .select({
      id: tripsTable.id,
      routeId: tripsTable.routeId,
      routeName: routesTable.name,
      fromLocation: routesTable.fromLocation,
      toLocation: routesTable.toLocation,
      departureTime: tripsTable.departureTime,
      arrivalTime: tripsTable.arrivalTime,
      availableSeats: tripsTable.availableSeats,
      totalSeats: tripsTable.totalSeats,
      status: tripsTable.status,
      recurringType: tripsTable.recurringType,
      weekdays: tripsTable.weekdays,
      price: tripsTable.price,
      createdAt: tripsTable.createdAt,
    })
    .from(tripsTable)
    .leftJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .where(
      statusFilter
        ? and(eq(tripsTable.driverId, driver.id), statusFilter)
        : eq(tripsTable.driverId, driver.id),
    )
    .orderBy(desc(tripsTable.departureTime));

  res.json({
    data: trips.map((t) => ({ ...t, price: parseFloat(t.price as string) })),
    total: trips.length,
    filter,
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
