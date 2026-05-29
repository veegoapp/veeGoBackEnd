import { Router } from "express";
import {
  db,
  usersTable,
  routesTable,
  stationsTable,
  tripsTable,
  driversTable,
  busesTable,
  bookingsTable,
  supportTicketsTable,
  supportMessagesTable,
  routeSuggestionsTable,
  driverDocumentsTable,
} from "@workspace/db";
import { eq, sql, and, gt, lt, gte, desc, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";

const router = Router();

router.get(
  "/dashboard/summary",
  authenticate,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    try {
      const now = new Date();

      const [
        totalRoutes,
        activeRoutes,
        totalStations,
        totalTrips,
        activeTrips,
        scheduledTrips,
        boardingTrips,
        totalBuses,
        activeBuses,
        totalDrivers,
        onlineDrivers,
        pendingVerifications,
        openTickets,
        pendingTickets,
        totalSupportMessages,
        pendingSuggestions,
        totalUsers,
        driverUsers,
        upcomingTrips,
        cancelledTrips,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(routesTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(routesTable)
          .where(eq(routesTable.isActive, true)),
        db.select({ count: sql<number>`count(*)::int` }).from(stationsTable),
        db.select({ count: sql<number>`count(*)::int` }).from(tripsTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tripsTable)
          .where(eq(tripsTable.status, "active")),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tripsTable)
          .where(eq(tripsTable.status, "scheduled")),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tripsTable)
          .where(eq(tripsTable.status, "boarding")),
        db.select({ count: sql<number>`count(*)::int` }).from(busesTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(busesTable)
          .where(eq(busesTable.isActive, true)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(driversTable)
          .where(eq(driversTable.isActive, true)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(driversTable)
          .where(eq(driversTable.isOnline, true)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(driverDocumentsTable)
          .where(eq(driverDocumentsTable.verificationStatus, "pending")),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(supportTicketsTable)
          .where(eq(supportTicketsTable.status, "open")),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(supportTicketsTable)
          .where(eq(supportTicketsTable.status, "pending")),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(supportMessagesTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(routeSuggestionsTable)
          .where(eq(routeSuggestionsTable.status, "pending")),
        db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(usersTable)
          .where(eq(usersTable.role, "driver")),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tripsTable)
          .where(
            and(
              gt(tripsTable.departureTime, now),
              inArray(tripsTable.status, ["scheduled", "driver_assigned", "waiting_driver"]),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tripsTable)
          .where(eq(tripsTable.status, "cancelled")),
      ]);

      res.json({
        routes: {
          total: totalRoutes[0].count,
          active: activeRoutes[0].count,
          inactive: totalRoutes[0].count - activeRoutes[0].count,
        },
        stations: {
          total: totalStations[0].count,
        },
        trips: {
          total: totalTrips[0].count,
          active: activeTrips[0].count,
          scheduled: scheduledTrips[0].count,
          boarding: boardingTrips[0].count,
          upcoming: upcomingTrips[0].count,
          cancelled: cancelledTrips[0].count,
        },
        fleet: {
          totalBuses: totalBuses[0].count,
          activeBuses: activeBuses[0].count,
          totalDrivers: totalDrivers[0].count,
          onlineDrivers: onlineDrivers[0].count,
        },
        support: {
          openTickets: openTickets[0].count,
          pendingTickets: pendingTickets[0].count,
          totalMessages: totalSupportMessages[0].count,
        },
        verifications: {
          pending: pendingVerifications[0].count,
        },
        suggestions: {
          pending: pendingSuggestions[0].count,
        },
        users: {
          total: totalUsers[0].count,
          passengers: totalUsers[0].count - driverUsers[0].count,
          drivers: driverUsers[0].count,
        },
        generatedAt: now.toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch dashboard summary" });
    }
  },
);

router.get(
  "/dashboard/activity",
  authenticate,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    try {
      const now = new Date();

      const [
        recentTickets,
        pendingDocuments,
        recentSuggestions,
        upcomingDepartures,
        activeTripsData,
        recentBookings,
      ] = await Promise.all([
        db
          .select({
            id: supportTicketsTable.id,
            subject: supportTicketsTable.subject,
            status: supportTicketsTable.status,
            priority: supportTicketsTable.priority,
            type: supportTicketsTable.type,
            createdAt: supportTicketsTable.createdAt,
          })
          .from(supportTicketsTable)
          .orderBy(desc(supportTicketsTable.createdAt))
          .limit(8),

        db
          .select({
            id: driverDocumentsTable.id,
            driverId: driverDocumentsTable.driverId,
            type: driverDocumentsTable.type,
            verificationStatus: driverDocumentsTable.verificationStatus,
            uploadedAt: driverDocumentsTable.uploadedAt,
            driverName: driversTable.name,
          })
          .from(driverDocumentsTable)
          .leftJoin(driversTable, eq(driverDocumentsTable.driverId, driversTable.id))
          .where(eq(driverDocumentsTable.verificationStatus, "pending"))
          .orderBy(desc(driverDocumentsTable.uploadedAt))
          .limit(8),

        db
          .select({
            id: routeSuggestionsTable.id,
            title: routeSuggestionsTable.title,
            type: routeSuggestionsTable.type,
            status: routeSuggestionsTable.status,
            startLocation: routeSuggestionsTable.startLocation,
            endLocation: routeSuggestionsTable.endLocation,
            createdAt: routeSuggestionsTable.createdAt,
          })
          .from(routeSuggestionsTable)
          .orderBy(desc(routeSuggestionsTable.createdAt))
          .limit(8),

        db
          .select({
            id: tripsTable.id,
            departureTime: tripsTable.departureTime,
            arrivalTime: tripsTable.arrivalTime,
            status: tripsTable.status,
            availableSeats: tripsTable.availableSeats,
            totalSeats: tripsTable.totalSeats,
            routeName: routesTable.name,
            fromLocation: routesTable.fromLocation,
            toLocation: routesTable.toLocation,
            driverName: driversTable.name,
          })
          .from(tripsTable)
          .leftJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
          .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
          .where(
            and(
              gt(tripsTable.departureTime, now),
              inArray(tripsTable.status, ["scheduled", "driver_assigned", "waiting_driver", "boarding"]),
            ),
          )
          .orderBy(tripsTable.departureTime)
          .limit(8),

        db
          .select({
            id: tripsTable.id,
            departureTime: tripsTable.departureTime,
            arrivalTime: tripsTable.arrivalTime,
            status: tripsTable.status,
            availableSeats: tripsTable.availableSeats,
            totalSeats: tripsTable.totalSeats,
            routeName: routesTable.name,
            fromLocation: routesTable.fromLocation,
            toLocation: routesTable.toLocation,
            driverName: driversTable.name,
          })
          .from(tripsTable)
          .leftJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
          .leftJoin(driversTable, eq(tripsTable.driverId, driversTable.id))
          .where(eq(tripsTable.status, "active"))
          .orderBy(desc(tripsTable.departureTime))
          .limit(8),

        db
          .select({
            id: bookingsTable.id,
            status: bookingsTable.status,
            totalPrice: bookingsTable.totalPrice,
            seatCount: bookingsTable.seatCount,
            createdAt: bookingsTable.createdAt,
            userName: usersTable.name,
            userEmail: usersTable.email,
          })
          .from(bookingsTable)
          .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
          .orderBy(desc(bookingsTable.createdAt))
          .limit(8),
      ]);

      res.json({
        recentTickets,
        pendingDocuments,
        recentSuggestions,
        upcomingDepartures,
        activeTrips: activeTripsData,
        recentBookings: recentBookings.map(b => ({ ...b, totalPrice: parseFloat(b.totalPrice as string) })),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch dashboard activity" });
    }
  },
);

router.get(
  "/dashboard/analytics",
  authenticate,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    try {
      const [
        tripsPerDay,
        routePopularity,
        tripStatusBreakdown,
        driverActivity,
        busiestStations,
        bookingsPerDay,
      ] = await Promise.all([
        db.execute(sql`
          SELECT
            DATE(departure_time)::text AS date,
            COUNT(*)::int AS trips,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::int AS cancelled
          FROM trips
          WHERE departure_time >= NOW() - INTERVAL '30 days'
          GROUP BY DATE(departure_time)
          ORDER BY date
        `),

        db.execute(sql`
          SELECT
            r.id,
            r.name,
            r.from_location AS "fromLocation",
            r.to_location AS "toLocation",
            COUNT(t.id)::int AS "tripCount",
            SUM(CASE WHEN t.status = 'active' THEN 1 ELSE 0 END)::int AS "activeCount"
          FROM routes r
          LEFT JOIN trips t ON t.route_id = r.id
          GROUP BY r.id, r.name, r.from_location, r.to_location
          ORDER BY "tripCount" DESC
          LIMIT 10
        `),

        db.execute(sql`
          SELECT
            status,
            COUNT(*)::int AS count
          FROM trips
          GROUP BY status
          ORDER BY count DESC
        `),

        db.execute(sql`
          SELECT
            d.id,
            d.name,
            COUNT(t.id)::int AS "tripCount",
            d.rating::float AS rating,
            d.is_online AS "isOnline",
            d.status
          FROM drivers d
          LEFT JOIN trips t ON t.driver_id = d.id
          WHERE d.is_active = true
          GROUP BY d.id, d.name, d.rating, d.is_online, d.status
          ORDER BY "tripCount" DESC
          LIMIT 10
        `),

        db.execute(sql`
          SELECT
            s.name,
            r.name AS "routeName",
            COUNT(t.id)::int AS "tripCount"
          FROM stations s
          JOIN routes r ON r.id = s.route_id
          LEFT JOIN trips t ON t.route_id = r.id
          GROUP BY s.id, s.name, r.name
          ORDER BY "tripCount" DESC
          LIMIT 10
        `),

        db.execute(sql`
          SELECT
            DATE(created_at)::text AS date,
            COUNT(*)::int AS bookings,
            SUM(total_price)::float AS revenue
          FROM bookings
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY DATE(created_at)
          ORDER BY date
        `),
      ]);

      res.json({
        tripsPerDay: tripsPerDay.rows,
        routePopularity: routePopularity.rows,
        tripStatusBreakdown: tripStatusBreakdown.rows,
        driverActivity: driverActivity.rows,
        busiestStations: busiestStations.rows,
        bookingsPerDay: bookingsPerDay.rows,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch dashboard analytics" });
    }
  },
);

router.get(
  "/dashboard/today",
  authenticate,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
      const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

      const [
        tripsToday,
        tripsYesterday,
        revenueToday,
        revenueYesterday,
        onlineDrivers,
        activePassengers,
        last7DaysTrips,
        last7DaysRevenue,
        activeTripsWithDrivers,
      ] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tripsTable)
          .where(and(gte(tripsTable.departureTime, todayStart), lt(tripsTable.departureTime, tomorrowStart))),

        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tripsTable)
          .where(and(gte(tripsTable.departureTime, yesterdayStart), lt(tripsTable.departureTime, todayStart))),

        db
          .select({ total: sql<number>`COALESCE(SUM(total_price), 0)::float` })
          .from(bookingsTable)
          .where(and(gte(bookingsTable.createdAt, todayStart), lt(bookingsTable.createdAt, tomorrowStart))),

        db
          .select({ total: sql<number>`COALESCE(SUM(total_price), 0)::float` })
          .from(bookingsTable)
          .where(and(gte(bookingsTable.createdAt, yesterdayStart), lt(bookingsTable.createdAt, todayStart))),

        db
          .select({ count: sql<number>`count(*)::int` })
          .from(driversTable)
          .where(eq(driversTable.isOnline, true)),

        db.execute(sql`
          SELECT COUNT(DISTINCT b.user_id)::int AS count
          FROM bookings b
          JOIN trips t ON t.id = b.trip_id
          WHERE t.status IN ('active', 'boarding')
        `),

        db.execute(sql`
          SELECT
            DATE(departure_time)::text AS date,
            COUNT(*)::int AS trips
          FROM trips
          WHERE departure_time >= NOW() - INTERVAL '7 days'
          GROUP BY DATE(departure_time)
          ORDER BY date
        `),

        db.execute(sql`
          SELECT
            DATE(created_at)::text AS date,
            COALESCE(SUM(total_price), 0)::float AS revenue
          FROM bookings
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at)
          ORDER BY date
        `),

        db.execute(sql`
          SELECT
            t.id,
            t.status,
            t.departure_time AS "departureTime",
            t.arrival_time AS "arrivalTime",
            r.name AS "routeName",
            r.from_location AS "fromLocation",
            r.to_location AS "toLocation",
            d.name AS "driverName",
            d.current_latitude AS "latitude",
            d.current_longitude AS "longitude",
            d.status AS "driverStatus"
          FROM trips t
          LEFT JOIN routes r ON r.id = t.route_id
          LEFT JOIN drivers d ON d.id = t.driver_id
          WHERE t.status IN ('active', 'boarding')
          ORDER BY t.departure_time DESC
          LIMIT 50
        `),
      ]);

      res.json({
        tripsToday: tripsToday[0].count,
        tripsYesterday: tripsYesterday[0].count,
        revenueToday: revenueToday[0].total,
        revenueYesterday: revenueYesterday[0].total,
        driversOnline: onlineDrivers[0].count,
        passengersActive: (activePassengers.rows[0] as { count: number })?.count ?? 0,
        last7DaysTrips: last7DaysTrips.rows,
        last7DaysRevenue: last7DaysRevenue.rows,
        activeTrips: activeTripsWithDrivers.rows,
        generatedAt: now.toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch today's dashboard data" });
    }
  },
);

export default router;
