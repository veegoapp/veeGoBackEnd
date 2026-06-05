import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { db, driversTable, tripsTable, busesTable, ridesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "./lib/jwt";
import { logger } from "./lib/logger";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./lib/socket-events";
import { getAllSurgeStates } from "./lib/surge-pricing";

export interface LocationPayload {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  tripId?: number;
}

// ── Route deviation detection ──────────────────────────────────────────────────
// Cross-track distance: perpendicular metres from point P to the great-circle
// segment A→B.  Returns a positive number regardless of which side P is on.
// Formula source: https://www.movable-type.co.uk/scripts/latlong.html
const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number { return (deg * Math.PI) / 180; }

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingRad(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return Math.atan2(y, x);
}

/**
 * Returns the perpendicular (cross-track) distance in metres from point P
 * to the great-circle segment A→B.
 */
function crossTrackMeters(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const d13 = haversineM(aLat, aLng, pLat, pLng) / EARTH_RADIUS_M; // angular dist A→P
  const θ13 = bearingRad(aLat, aLng, pLat, pLng);
  const θ12 = bearingRad(aLat, aLng, bLat, bLng);
  return Math.abs(Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12)) * EARTH_RADIUS_M);
}

/** Suppress duplicate warnings: only emit once per ride per 60-second window. */
const deviationWarnedAt = new Map<number, number>(); // rideId → epoch ms
const DEVIATION_THRESHOLD_M  = 500;
const DEVIATION_THROTTLE_MS  = 60_000;

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  const allowedOrigins: string[] = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5173",
    "http://localhost:8080",
  ];
  if (process.env.REPLIT_DEV_DOMAIN) {
    allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (
          !origin ||
          allowedOrigins.some((o) => origin.startsWith(o)) ||
          /^https:\/\/[^.]+\.replit\.dev(:\d+)?$/.test(origin) ||
          /^https:\/\/[^.]+\.kirk\.replit\.dev(:\d+)?$/.test(origin) ||
          /^https:\/\/[^.]+\.expo\.dev(:\d+)?$/.test(origin)
        ) {
          callback(null, true);
        } else {
          callback(new Error(`Socket.IO CORS: origin not allowed — ${origin}`));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/api/socket.io",
  });

  // Transport-level error handler — covers connection rejections before auth
  io.engine.on("connection_error", (err: Error & { code?: number }) => {
    logger.warn({ code: err.code, message: err.message }, "Socket.IO engine connection error");
  });

  // ── Auth middleware ─────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error("Authentication required"));
        return;
      }
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const { userId, role } = socket.data as { userId: number; role: string };
    logger.info({ socketId: socket.id, userId, role }, "Socket connected");

    // Per-socket error handler — prevents unhandled rejections on bad events
    socket.on("error", (err: Error) => {
      logger.error({ socketId: socket.id, userId, message: err.message }, "Socket error");
    });

    // ── Room assignment on connect (reconnect-safe: runs fresh each connect) ──
    if (role === "admin") {
      socket.join(SOCKET_ROOMS.ADMIN);
      logger.info({ socketId: socket.id, userId, room: SOCKET_ROOMS.ADMIN }, "Socket joined room");
    }

    if (role === "user") {
      // Personal room — ride-specific events (assigned, cancelled, etc.)
      const room = SOCKET_ROOMS.PASSENGER(userId);
      socket.join(room);
      logger.info({ socketId: socket.id, userId, room }, "Socket joined room");

      // Broadcast room — receives real-time surge updates as multipliers change.
      socket.join(SOCKET_ROOMS.PASSENGERS_ALL);
      logger.info(
        { socketId: socket.id, userId, room: SOCKET_ROOMS.PASSENGERS_ALL },
        "Socket joined passengers:all room",
      );

      // Emit the current surge snapshot immediately so the client does not have
      // to wait up to SURGE_INTERVAL_MS before seeing accurate pricing.
      const surgeStates = getAllSurgeStates();
      for (const [vehicleType, state] of Object.entries(surgeStates)) {
        socket.emit(SOCKET_EVENTS.SURGE_UPDATED, {
          vehicleType,
          multiplier:         state.multiplier,
          previousMultiplier: state.multiplier,
          tier:               state.tier,
          ratio:              parseFloat(state.ratio.toFixed(2)),
          isActive:           state.isActive,
        });
      }
    }

    if (role === "driver") {
      // FIXED: always join personal driver room so passenger-cancel events reach this driver
      const driverRoom = SOCKET_ROOMS.DRIVER(userId);
      socket.join(driverRoom);
      logger.info({ socketId: socket.id, userId, room: driverRoom }, "Driver joined personal room");

      try {
        const [driver] = await db
          .select({ id: driversTable.id, isOnline: driversTable.isOnline, vehicleType: driversTable.vehicleType })
          .from(driversTable)
          .where(eq(driversTable.userId, userId));

        if (driver?.vehicleType && driver.isOnline) {
          const room = SOCKET_ROOMS.DRIVERS_AVAILABLE(driver.vehicleType);
          socket.join(room);
          socket.data.driverId = driver.id;
          socket.data.vehicleType = driver.vehicleType;
          logger.info({ socketId: socket.id, userId, room }, "Driver joined availability room on connect");
        }
      } catch (err) {
        logger.error({ err }, "Error joining driver availability room on connect");
      }
    }

    // ── DRIVER: bulk location update (trip tracking) ────────────────────────────
    socket.on(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, async (payload: LocationPayload) => {
      if (role !== "driver") {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Forbidden" });
        return;
      }

      const { latitude, longitude, speed, heading, tripId } = payload;

      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Invalid GPS coordinates" });
        return;
      }

      try {
        const [driver] = await db
          .select({ id: driversTable.id, assignedBusId: driversTable.assignedBusId })
          .from(driversTable)
          .where(eq(driversTable.userId, userId));

        if (!driver) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: "Driver profile not found" });
          return;
        }

        await db.update(driversTable).set({
          currentLatitude: latitude,
          currentLongitude: longitude,
          currentSpeed: speed,
          currentHeading: heading,
          locationUpdatedAt: new Date(),
        }).where(eq(driversTable.id, driver.id));

        if (driver.assignedBusId) {
          await db.update(busesTable).set({
            currentLatitude: latitude,
            currentLongitude: longitude,
          }).where(eq(busesTable.id, driver.assignedBusId));
        }

        const locationBroadcast = {
          driverId: driver.id,
          userId,
          latitude,
          longitude,
          speed,
          heading,
          tripId,
          timestamp: Date.now(),
        };

        io!.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.ADMIN_TRACK_TRIP, locationBroadcast);

        if (tripId) {
          io!.to(SOCKET_ROOMS.TRIP(tripId)).emit(SOCKET_EVENTS.PASSENGER_TRIP_TRACKING, locationBroadcast);
        }

        socket.emit(SOCKET_EVENTS.DRIVER_LOCATION_ACK, { ok: true });
      } catch (err) {
        logger.error({ err }, "Error handling location update");
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Internal error" });
      }
    });

    // ── DRIVER: per-ride location update ────────────────────────────────────────
    socket.on(SOCKET_EVENTS.DRIVER_RIDE_LOCATION, async (payload: { rideId: number; latitude: number; longitude: number }) => {
      if (role !== "driver") {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Forbidden" });
        return;
      }

      const { rideId, latitude, longitude } = payload;

      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Invalid GPS coordinates" });
        return;
      }

      try {
        const [ride] = await db
          .select({
            passengerId:      ridesTable.passengerId,
            pickupLatitude:   ridesTable.pickupLatitude,
            pickupLongitude:  ridesTable.pickupLongitude,
            dropoffLatitude:  ridesTable.dropoffLatitude,
            dropoffLongitude: ridesTable.dropoffLongitude,
          })
          .from(ridesTable)
          .where(eq(ridesTable.id, rideId));

        if (!ride) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: "Ride not found" });
          return;
        }

        io!.to(SOCKET_ROOMS.PASSENGER(ride.passengerId)).emit(SOCKET_EVENTS.RIDE_DRIVER_LOCATION, {
          rideId,
          location: { latitude, longitude },
          timestamp: Date.now(),
        });

        // ── Route deviation check ──────────────────────────────────────────────
        // Compute cross-track (perpendicular) distance from the driver's current
        // position to the straight-line segment pickup→dropoff. If it exceeds
        // 500 m and we haven't warned in the last 60 seconds for this ride,
        // emit a warning to both the passenger and the admin room.
        const deviationM = crossTrackMeters(
          latitude,            longitude,
          ride.pickupLatitude, ride.pickupLongitude,
          ride.dropoffLatitude, ride.dropoffLongitude,
        );

        if (deviationM > DEVIATION_THRESHOLD_M) {
          const lastWarnedMs = deviationWarnedAt.get(rideId) ?? 0;
          const now = Date.now();

          if (now - lastWarnedMs >= DEVIATION_THROTTLE_MS) {
            deviationWarnedAt.set(rideId, now);

            const warningPayload = {
              rideId,
              driverLat:        latitude,
              driverLng:        longitude,
              deviationMeters:  Math.round(deviationM),
              detectedAt:       new Date(now).toISOString(),
            };

            io!.to(SOCKET_ROOMS.PASSENGER(ride.passengerId)).emit(SOCKET_EVENTS.RIDE_DEVIATION_WARNING, warningPayload);
            io!.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.RIDE_DEVIATION_WARNING, warningPayload);
            io!.to(SOCKET_ROOMS.DRIVER(userId)).emit(SOCKET_EVENTS.RIDE_DEVIATION_WARNING, warningPayload);

            logger.warn({ rideId, deviationM: Math.round(deviationM) }, "Route deviation warning emitted");
          }
        }
      } catch (err) {
        logger.error({ err }, "Error handling ride location update");
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Internal error" });
      }
    });

    // ── Generic join ACK — clients use this to confirm socket readiness ─────────
    // Actual room assignment happens at connection time based on role/DB state.
    socket.on(SOCKET_EVENTS.JOIN, (room: string, callback?: (ack: { ok: boolean }) => void) => {
      logger.debug({ socketId: socket.id, userId, room }, "Socket join event received (ACK only)");
      if (typeof callback === "function") {
        callback({ ok: true });
      }
    });

    // ── PASSENGER: subscribe to shuttle trip tracking ────────────────────────────
    socket.on(SOCKET_EVENTS.PASSENGER_JOIN_TRIP, (tripId: number) => {
      if (role === "user") {
        const room = SOCKET_ROOMS.TRIP(tripId);
        socket.join(room);
        logger.info({ socketId: socket.id, userId, room }, "Passenger joined trip tracking room");
      }
    });

    // ── DRIVER: trip lifecycle ───────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.DRIVER_TRIP_START, async (tripId: number) => {
      if (role !== "driver") return;
      try {
        const [trip] = await db
          .select({ id: tripsTable.id })
          .from(tripsTable)
          .where(eq(tripsTable.id, tripId));

        if (!trip) return;

        const payload = { event: "trip:started", tripId, timestamp: Date.now() };
        io!.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.ADMIN_TRACK_TRIP, payload);
        io!.to(SOCKET_ROOMS.TRIP(tripId)).emit(SOCKET_EVENTS.PASSENGER_TRIP_TRACKING, payload);
      } catch (err) {
        logger.error({ err }, "Error broadcasting trip start");
      }
    });

    socket.on(SOCKET_EVENTS.DRIVER_TRIP_COMPLETE, (_tripId: number) => {
      if (role !== "driver") return;
      const tripId = _tripId;
      const payload = { event: "trip:completed", tripId, timestamp: Date.now() };
      io!.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.ADMIN_TRACK_TRIP, payload);
      io!.to(SOCKET_ROOMS.TRIP(tripId)).emit(SOCKET_EVENTS.PASSENGER_TRIP_TRACKING, payload);
    });

    // ── DRIVER: availability status ──────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.DRIVER_STATUS_ONLINE, async () => {
      if (role !== "driver") return;
      try {
        const [driver] = await db
          .select({ id: driversTable.id, vehicleType: driversTable.vehicleType })
          .from(driversTable)
          .where(eq(driversTable.userId, userId));

        if (driver?.vehicleType) {
          const room = SOCKET_ROOMS.DRIVERS_AVAILABLE(driver.vehicleType);
          socket.join(room);
          socket.data.vehicleType = driver.vehicleType;
          logger.info({ socketId: socket.id, userId, room }, "Driver joined availability room (online)");
        }
      } catch (err) {
        logger.error({ err }, "Error joining availability room on online");
      }
    });

    socket.on(SOCKET_EVENTS.DRIVER_STATUS_OFFLINE, () => {
      if (role !== "driver") return;
      const vt = socket.data.vehicleType as string | undefined;
      if (vt) {
        const room = SOCKET_ROOMS.DRIVERS_AVAILABLE(vt);
        socket.leave(room);
        logger.info({ socketId: socket.id, userId, room }, "Driver left availability room (offline)");
      }
    });

    socket.on(SOCKET_EVENTS.DRIVER_STATUS_BUSY, () => {
      if (role !== "driver") return;
      const vt = socket.data.vehicleType as string | undefined;
      if (vt) {
        const room = SOCKET_ROOMS.DRIVERS_AVAILABLE(vt);
        socket.leave(room);
        logger.info({ socketId: socket.id, userId, room }, "Driver left availability room (busy)");
      }
    });

    socket.on("disconnect", (reason: string) => {
      logger.info({ socketId: socket.id, userId, role, reason }, "Socket disconnected");
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Remove a ride's deviation-throttle entry once it ends (completed or cancelled).
 * Call this from any ride-termination code path so the Map stays lean.
 */
export function clearDeviationState(rideId: number): void {
  deviationWarnedAt.delete(rideId);
}
