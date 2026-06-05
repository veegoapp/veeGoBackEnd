/**
 * Centralized socket event name constants.
 * This is the single source of truth for all socket event strings.
 * Mirror any changes here into the passenger-app and driver-app constants files.
 */

export const SOCKET_EVENTS = {
  // ── Server → Passenger ──────────────────────────────────────────────────────
  RIDE_DRIVER_ASSIGNED:    "ride:driver_assigned",
  RIDE_DRIVER_ARRIVED:     "ride:driver_arrived",
  WAITING_CHARGE_STARTED:  "ride:waiting:charge:started",
  WAITING_CHARGE_UPDATED:  "ride:waiting:charge:updated",
  WAITING_CHARGE_CAPPED:   "ride:waiting:charge:capped",
  RIDE_DRIVER_LOCATION:  "ride:driver_location",
  RIDE_STARTED:          "ride:started",
  RIDE_COMPLETED:        "ride:completed",
  RIDE_CANCELLED:         "ride:cancelled",
  RIDE_DRIVER_CANCELLED:   "ride:driver_cancelled",
  RIDE_NO_SHOW_CANCELLED:  "ride:no_show_cancelled",
  NOTIFICATION_NEW:      "notification:new",
  BOOKING_BOARDED:       "booking:boarded",

  // ── Server → Available Drivers ───────────────────────────────────────────────
  RIDE_OFFER:                  "ride:offer",
  RIDE_NEW_REQUEST:            "ride:new_request",
  RIDE_OFFER_EXPIRED:          "ride:offer_expired",
  RIDE_NO_LONGER_AVAILABLE:    "ride:no_longer_available",
  RIDE_STATUS_UPDATE:          "ride:status_update",

  // ── Server → Admin room ──────────────────────────────────────────────────────
  ADMIN_TRACK_TRIP:      "admin:track:trip",

  // ── Server → Trip subscribers ────────────────────────────────────────────────
  PASSENGER_TRIP_TRACKING: "passenger:trip:tracking",
  TRIP_CHAT_MESSAGE:       "trip:chat:message",

  // ── Server → Admin room ──────────────────────────────────────────────────────
  ADMIN_NEW_CHAT_MESSAGE:  "admin:chat:new",

  // ── Server → All passengers (broadcast) ─────────────────────────────────────
  SURGE_UPDATED:           "surge:updated",

  // ── Server → All authenticated clients (broadcast) ───────────────────────────
  SERVICE_CONTROL_CHANGED: "service:control:changed",

  // ── Server → Driver (check-in) ───────────────────────────────────────────────
  DRIVER_CHECKIN_REQUIRED: "driver:checkin:required",
  DRIVER_CHECKIN_APPROVED: "driver:checkin:approved",
  DRIVER_CHECKIN_REJECTED: "driver:checkin:rejected",

  // ── Server → Driver (dispatch) ───────────────────────────────────────────────
  // Sent when an admin manually lifts a driver's dispatch cooldown so the driver
  // app can immediately update its UI without waiting for the next poll.
  DRIVER_COOLDOWN_CLEARED: "driver:cooldown:cleared",

  // ── Server → Admin + Passenger (safety) ─────────────────────────────────────
  SOS_TRIGGERED:           "sos:triggered",
  RIDE_DEVIATION_WARNING:  "ride:deviation:warning",

  // ── Server → Socket direct ───────────────────────────────────────────────────
  DRIVER_LOCATION_ACK:   "driver:location:ack",
  ERROR:                 "error",

  // ── Client → Server ─────────────────────────────────────────────────────────
  DRIVER_LOCATION_UPDATE: "driver:location:update",
  DRIVER_RIDE_LOCATION:   "driver:ride:location",
  JOIN:                   "join",
  PASSENGER_JOIN_TRIP:    "passenger:join:trip",
  DRIVER_TRIP_START:      "driver:trip:start",
  DRIVER_TRIP_COMPLETE:   "driver:trip:complete",
  DRIVER_STATUS_ONLINE:   "driver:status:online",
  DRIVER_STATUS_OFFLINE:  "driver:status:offline",
  DRIVER_STATUS_BUSY:     "driver:status:busy",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Room name builders — always construct room strings through these helpers. */
export const SOCKET_ROOMS = {
  ADMIN:            "admin:room",
  PASSENGERS_ALL:   "passengers:all",
  PASSENGER:        (userId: number)      => `passenger:${userId}`,
  DRIVER:           (userId: number)      => `driver:${userId}`,
  DRIVERS_AVAILABLE:(vehicleType: string) => `drivers:available:${vehicleType}`,
  TRIP:             (tripId: number)      => `trip:${tripId}`,
} as const;
