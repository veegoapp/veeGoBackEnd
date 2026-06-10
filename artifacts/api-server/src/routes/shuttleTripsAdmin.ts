import { Router } from "express";
import {
  db, tripsTable, routesTable, stationsTable, driversTable, usersTable,
  busesTable, bookingsTable, tripStationProgressTable,
  shuttleOffencesTable, walletTransactionsTable, notificationsTable,
} from "@workspace/db";
import { eq, sql, and, inArray, asc, gte, lte, desc } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
import { authenticate, requireRole } from "../middlewares/auth";

const router = Router();
const CAIRO_TZ = "Africa/Cairo";

function toCairo(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    timeZone: CAIRO_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

// ─── GET /admin/shuttle-trips ──────────────────────────────────────────────────
// Full list of shuttle trips with joined route, driver, bus, booked seat count.
// Filters: status, routeId, dateFrom, dateTo, page, limit
router.get(
  "/admin/shuttle-trips",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const { status, routeId, dateFrom, dateTo } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof eq>[] = [];
    if (status)   conditions.push(eq(tripsTable.status, status as any));
    if (routeId)  conditions.push(eq(tripsTable.routeId, parseInt(routeId)));
    if (dateFrom) conditions.push(gte(tripsTable.departureTime, new Date(dateFrom + "T00:00:00Z")));
    if (dateTo)   conditions.push(lte(tripsTable.departureTime, new Date(dateTo   + "T23:59:59Z")));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id:             tripsTable.id,
          routeId:        tripsTable.routeId,
          driverId:       tripsTable.driverId,
          busId:          tripsTable.busId,
          departureTime:  tripsTable.departureTime,
          arrivalTime:    tripsTable.arrivalTime,
          status:         tripsTable.status,
          availableSeats: tripsTable.availableSeats,
          totalSeats:     tripsTable.totalSeats,
          price:          tripsTable.price,
          scheduleId:     tripsTable.scheduleId,
          startedAt:      tripsTable.startedAt,
          completedAt:    tripsTable.completedAt,
          cancelledAt:    tripsTable.cancelledAt,
          createdAt:      tripsTable.createdAt,
          routeName:      routesTable.name,
          fromLocation:   routesTable.fromLocation,
          toLocation:     routesTable.toLocation,
          driverName:     driversTable.name,
          driverPhone:    driversTable.phone,
          driverRating:   driversTable.rating,
          busPlate:       busesTable.plateNumber,
          busModel:       busesTable.model,
          busCapacity:    busesTable.capacity,
        })
        .from(tripsTable)
        .leftJoin(routesTable,  eq(tripsTable.routeId, routesTable.id))
        .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
        .leftJoin(busesTable,   eq(tripsTable.busId, busesTable.id))
        .where(where)
        .orderBy(desc(tripsTable.departureTime))
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tripsTable)
        .where(where),
    ]);

    const tripIds = rows.map((r) => r.id);
    const bookedMap = new Map<number, number>();

    if (tripIds.length > 0) {
      const booked = await db
        .select({
          tripId:      bookingsTable.tripId,
          bookedSeats: sql<number>`coalesce(sum(${bookingsTable.seatCount}), 0)::int`,
        })
        .from(bookingsTable)
        .where(
          and(
            inArray(bookingsTable.tripId, tripIds),
            inArray(bookingsTable.status, ["pending", "confirmed", "boarded", "completed"]),
          ),
        )
        .groupBy(bookingsTable.tripId);

      for (const b of booked) bookedMap.set(b.tripId, b.bookedSeats);
    }

    const data = rows.map((r) => ({
      id:             r.id,
      scheduleId:     r.scheduleId,
      status:         r.status,
      departureTime:  r.departureTime,
      arrivalTime:    r.arrivalTime,
      price:          parseFloat(r.price as string),
      totalSeats:     r.totalSeats,
      availableSeats: r.availableSeats,
      bookedSeats:    bookedMap.get(r.id) ?? 0,
      startedAt:      r.startedAt,
      completedAt:    r.completedAt,
      cancelledAt:    r.cancelledAt,
      createdAt:      r.createdAt,
      route: {
        id:           r.routeId,
        name:         r.routeName,
        fromLocation: r.fromLocation,
        toLocation:   r.toLocation,
      },
      driver: r.driverName ? {
        id:     r.driverId,
        name:   r.driverName,
        phone:  r.driverPhone,
        rating: parseFloat(r.driverRating as string),
      } : null,
      bus: r.busPlate ? {
        id:          r.busId,
        plateNumber: r.busPlate,
        model:       r.busModel,
        capacity:    r.busCapacity,
      } : null,
    }));

    res.json({ data, total: countResult[0]?.count ?? 0, page, limit });
  },
);

// ─── GET /admin/shuttle-trips/:id ─────────────────────────────────────────────
// Full trip detail: route + stations, driver, bus, passengers, station progress.
router.get(
  "/admin/shuttle-trips/:id",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const tripId = parseInt(req.params.id as string);
    if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

    const [trip] = await db
      .select({
        id:             tripsTable.id,
        routeId:        tripsTable.routeId,
        driverId:       tripsTable.driverId,
        busId:          tripsTable.busId,
        departureTime:  tripsTable.departureTime,
        arrivalTime:    tripsTable.arrivalTime,
        status:         tripsTable.status,
        availableSeats: tripsTable.availableSeats,
        totalSeats:     tripsTable.totalSeats,
        price:          tripsTable.price,
        scheduleId:     tripsTable.scheduleId,
        acceptedAt:     tripsTable.acceptedAt,
        startedAt:      tripsTable.startedAt,
        completedAt:    tripsTable.completedAt,
        cancelledAt:    tripsTable.cancelledAt,
        cancelReason:   tripsTable.cancelReason,
        recurringType:  tripsTable.recurringType,
        createdAt:      tripsTable.createdAt,
        updatedAt:      tripsTable.updatedAt,
        routeName:      routesTable.name,
        fromLocation:   routesTable.fromLocation,
        toLocation:     routesTable.toLocation,
        estimatedDuration: routesTable.estimatedDuration,
        driverName:     driversTable.name,
        driverPhone:    driversTable.phone,
        driverRating:   driversTable.rating,
        driverStatus:   driversTable.status,
        busPlate:       busesTable.plateNumber,
        busModel:       busesTable.model,
        busCapacity:    busesTable.capacity,
      })
      .from(tripsTable)
      .leftJoin(routesTable,  eq(tripsTable.routeId, routesTable.id))
      .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
      .leftJoin(busesTable,   eq(tripsTable.busId, busesTable.id))
      .where(eq(tripsTable.id, tripId));

    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

    const [stations, stationProgress, bookings] = await Promise.all([
      db
        .select()
        .from(stationsTable)
        .where(eq(stationsTable.routeId, trip.routeId))
        .orderBy(asc(stationsTable.order)),

      db
        .select({
          stationId:   tripStationProgressTable.stationId,
          status:      tripStationProgressTable.status,
          arrivedAt:   tripStationProgressTable.arrivedAt,
          completedAt: tripStationProgressTable.completedAt,
        })
        .from(tripStationProgressTable)
        .where(eq(tripStationProgressTable.tripId, tripId)),

      db
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
            inArray(bookingsTable.status, ["pending", "confirmed", "boarded", "absent", "completed", "cancelled"]),
          ),
        )
        .orderBy(bookingsTable.createdAt),
    ]);

    const progressMap = new Map(stationProgress.map((p) => [p.stationId, p]));
    const enrichedStations = stations.map((s) => ({
      ...s,
      segmentPrice: s.segmentPrice ? parseFloat(s.segmentPrice) : null,
      progress: progressMap.get(s.id) ?? null,
    }));

    const bookedSeats = bookings
      .filter((b) => ["pending", "confirmed", "boarded", "completed"].includes(b.status))
      .reduce((sum, b) => sum + b.seatCount, 0);

    res.json({
      data: {
        id:            trip.id,
        scheduleId:    trip.scheduleId,
        status:        trip.status,
        departureTime: trip.departureTime,
        arrivalTime:   trip.arrivalTime,
        price:         parseFloat(trip.price as string),
        totalSeats:    trip.totalSeats,
        availableSeats: trip.availableSeats,
        bookedSeats,
        recurringType: trip.recurringType,
        acceptedAt:    trip.acceptedAt,
        startedAt:     trip.startedAt,
        completedAt:   trip.completedAt,
        cancelledAt:   trip.cancelledAt,
        cancelReason:  trip.cancelReason,
        createdAt:     trip.createdAt,
        updatedAt:     trip.updatedAt,
        route: {
          id:                trip.routeId,
          name:              trip.routeName,
          fromLocation:      trip.fromLocation,
          toLocation:        trip.toLocation,
          estimatedDuration: trip.estimatedDuration,
          stations:          enrichedStations,
        },
        driver: trip.driverName ? {
          id:     trip.driverId,
          name:   trip.driverName,
          phone:  trip.driverPhone,
          rating: parseFloat(trip.driverRating as string),
          status: trip.driverStatus,
        } : null,
        bus: trip.busPlate ? {
          id:          trip.busId,
          plateNumber: trip.busPlate,
          model:       trip.busModel,
          capacity:    trip.busCapacity,
        } : null,
        passengers: bookings.map((b) => ({
          bookingId:     b.bookingId,
          userId:        b.userId,
          userName:      b.userName ?? "—",
          userPhone:     b.userPhone ?? "—",
          userEmail:     b.userEmail ?? "—",
          seatCount:     b.seatCount,
          totalPrice:    parseFloat(b.totalPrice as string),
          status:        b.status,
          paymentStatus: b.paymentStatus,
          createdAt:     b.createdAt,
        })),
        totalPassengers: bookings.length,
      },
    });
  },
);

// ─── GET /admin/shuttle/cash-debts ────────────────────────────────────────────
// Fix 6: Returns passengers with a negative wallet balance (no-show debt).
router.get(
  "/admin/shuttle/cash-debts",
  authenticate,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    type DebtRow = {
      user_id: number;
      name: string;
      phone: string;
      wallet_balance: string;
      offence_count: number | null;
      last_offence_at: string | null;
    };

    const rows = await db.execute<DebtRow>(sql`
      SELECT
        u.id           AS user_id,
        u.name,
        u.phone,
        u.wallet_balance,
        so.offence_count,
        so.last_offence_at
      FROM users u
      LEFT JOIN shuttle_offences so
        ON so.user_id = u.id AND so.actor_type = 'passenger'
      WHERE u.wallet_balance < 0
        AND u.role = 'user'
      ORDER BY u.wallet_balance ASC
    `);

    const data = rows.rows.map((r) => ({
      userId:           r.user_id,
      name:             r.name,
      phone:            r.phone,
      debtAmount:       Math.abs(parseFloat(r.wallet_balance)),
      numberOfOffences: r.offence_count ?? 0,
      lastOffenceDate:  r.last_offence_at ?? null,
    }));

    res.json({ data, total: data.length });
  },
);

// ─── PATCH /admin/shuttle/cash-debts/:userId/collect ─────────────────────────
// Fix 6: Admin marks a debt as collected — resets wallet balance to 0.
router.patch(
  "/admin/shuttle/cash-debts/:userId/collect",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const userId = parseInt(req.params.userId as string);
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

    const [user] = await db
      .select({ id: usersTable.id, walletBalance: usersTable.walletBalance, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const balance = parseFloat(String(user.walletBalance));
    if (balance >= 0) {
      res.status(400).json({ error: "User has no outstanding debt" });
      return;
    }

    const collected = Math.abs(balance);

    await db.execute(
      sql`UPDATE users SET wallet_balance = 0 WHERE id = ${userId}`,
    );

    await db.insert(walletTransactionsTable).values({
      userId,
      amount:      String(collected),
      type:        "deposit",
      description: "Cash debt collected by admin — balance reset to 0",
    });

    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId,
        title: "Debt Cleared",
        body:  `Your outstanding shuttle debt of ${collected.toFixed(2)} EGP has been marked as collected by the operations team.`,
      })
      .returning();

    const io = getIO();
    if (io && notif) {
      io.to(SOCKET_ROOMS.PASSENGER(userId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
        id:       String(notif.id),
        category: "wallet",
        title:    notif.title,
        body:     notif.body,
        time:     notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
      });
    }

    res.json({ ok: true, collected, userId });
  },
);

// ─── GET /admin/shuttle/offences ──────────────────────────────────────────────
// Fix 7: Returns all shuttle offences with optional filters.
// Filters: actorType (passenger|driver), lastAction (warning|fined|suspended),
//          dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)
router.get(
  "/admin/shuttle/offences",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { actorType, lastAction, dateFrom, dateTo } = req.query as Record<string, string>;

    const conditions = [];
    if (actorType && actorType !== "all")  conditions.push(eq(shuttleOffencesTable.actorType, actorType as any));
    if (lastAction && lastAction !== "all") conditions.push(eq(shuttleOffencesTable.lastAction, lastAction as any));
    if (dateFrom) conditions.push(gte(shuttleOffencesTable.lastOffenceAt, new Date(dateFrom + "T00:00:00Z")));
    if (dateTo)   conditions.push(lte(shuttleOffencesTable.lastOffenceAt, new Date(dateTo   + "T23:59:59Z")));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id:            shuttleOffencesTable.id,
        userId:        shuttleOffencesTable.userId,
        name:          usersTable.name,
        phone:         usersTable.phone,
        actorType:     shuttleOffencesTable.actorType,
        offenceCount:  shuttleOffencesTable.offenceCount,
        lastAction:    shuttleOffencesTable.lastAction,
        lastOffenceAt: shuttleOffencesTable.lastOffenceAt,
      })
      .from(shuttleOffencesTable)
      .innerJoin(usersTable, eq(usersTable.id, shuttleOffencesTable.userId))
      .where(where)
      .orderBy(desc(shuttleOffencesTable.lastOffenceAt));

    res.json({ data: rows, total: rows.length });
  },
);

// ─── PATCH /admin/shuttle/offences/:userId/reset ──────────────────────────────
// Fix 7: Admin resets the offence count for a user to 0 (removes the row).
router.patch(
  "/admin/shuttle/offences/:userId/reset",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const userId = parseInt(req.params.userId as string);
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

    const deleted = await db
      .delete(shuttleOffencesTable)
      .where(eq(shuttleOffencesTable.userId, userId))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "No offence record found for this user" });
      return;
    }

    res.json({ ok: true, resetCount: deleted.length, userId });
  },
);

export default router;
