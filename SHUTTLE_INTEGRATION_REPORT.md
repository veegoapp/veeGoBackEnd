# SHUTTLE SYSTEM INTEGRATION MASTER REPORT

> Generated from live backend source code inspection — `artifacts/api-server/src/`, `lib/db/src/schema/`
> Base URL for all API calls: `https://<your-domain>/api`
> Socket.IO path: `/api/socket.io`

---

## 1. System Overview

### Architecture

The shuttle system is a **multi-role, real-time platform** consisting of:
- **API Server** — Express/TypeScript/Node.js, Drizzle ORM, PostgreSQL, Socket.IO
- **Admin Dashboard** — React/Vite frontend for operations management
- **Driver App** — Mobile app (external, this document targets it)
- **Passenger App** — Mobile app (external)

### Driver Flow
```
Register/Login
  → Go Online (PATCH /driver/status/online)
  → Socket: emit driver:status:online
  → Book a shuttle route+timeslot for the week (POST /shuttle/route-bookings)
  → View assigned trips (GET /driver/trips)
  → Accept trip (PATCH /driver/trips/:id/accept)
  → Upload selfie check-in for trip (POST /driver/checkin with tripId)
  → Start trip (PATCH /driver/trips/:id/start)  ← blocked until face-detected selfie exists
  → Stream location via Socket (driver:location:update or driver:ride:location)
  → Mark passengers boarded (PATCH /driver/bookings/:id/board)
  → Mark stations arrived/completed
  → Complete trip (PATCH /driver/trips/:id/complete)
  → Earnings credited automatically
  → Go Offline (PATCH /driver/status/offline)
```

### Passenger Flow
```
Register/Login
  → Browse shuttle lines (GET /shuttle/lines)
  → View line detail + upcoming trips (GET /shuttle/lines/:id)
  → Create booking (POST /bookings) — wallet charged immediately
  → Wait for trip to reach 7-seat minimum (auto-activates)
  → On trip day: join trip tracking room via Socket (passenger:join:trip)
  → Receive real-time driver location (passenger:trip:tracking)
  → Get boarding confirmation when driver scans (booking:boarded)
  → Trip completes → booking auto-completed
  → If trip cancelled: automatic full wallet refund
```

### Admin Flow
```
Login (POST /auth/admin/login)
  → Manage routes (POST/PATCH/DELETE /routes)
  → Manage time slots (POST/PATCH/DELETE /admin/shuttle/timeslots)
  → Create schedules → auto-generates trips (POST /schedules)
  → View driver shuttle bookings (GET /admin/shuttle/bookings)
  → Reassign drivers (PATCH /admin/shuttle/bookings/:id/reassign)
  → Monitor availability matrix (GET /admin/shuttle/availability)
  → View check-ins (GET /admin/checkins)
  → Monitor live tracking via Socket (admin:track:trip)
  → Manage commission, surge, service settings
```

### Route Flow
```
Admin creates route (POST /routes) → defines fromLocation, toLocation, estimatedDuration, basePrice
  → Admin adds stations (POST /routes/:id/stations) → each station has GPS + order + direction
  → Admin creates time slots (POST /admin/shuttle/timeslots) → e.g. "08:00", "09:00" per route
  → Admin creates schedule (POST /schedules) → defines vehicle type, date range, day slots
  → Schedule auto-generates trips for every matching day in the range
```

### Booking Flow (Passenger)
```
POST /bookings { tripId, seatCount: 1 }
  → DB transaction: lock trip row (SELECT FOR UPDATE)
  → Check trip status (must be scheduled/active/waiting_driver)
  → Check available seats ≥ 1
  → Check duplicate booking (same user, same trip, not cancelled)
  → Apply promo code discount if provided
  → Check wallet balance ≥ totalPrice
  → Decrement trip.availableSeats atomically
  → Insert booking (status: "pending")
  → Deduct wallet balance
  → Insert wallet transaction + payment record
  → If total booked seats ≥ 7 (SHUTTLE_MIN_REQUIRED): auto-activate trip (status → "active")
  → Return booking + shuttle summary
```

### Check-in Flow
```
Driver uploads selfie (POST /driver/checkin multipart/form-data)
  → Image uploaded to Supabase Storage
  → Face detection runs (TensorFlow.js)
  → If face detected: clears checkInRequired gate on driver, emits driver:checkin:approved
  → If no face: emits driver:checkin:rejected (driver must retake)
  → For trip start check-in: tripId must be included in form data
```

### Boarding Flow
```
Driver calls PATCH /driver/bookings/:id/board (or PATCH /shuttle/bookings/:id/board)
  → Booking status changes: "pending"/"confirmed" → "boarded"
  → Socket emits "booking:boarded" to passenger's personal room
  → Passenger app receives real-time boarding confirmation
```

### Trip Lifecycle
```
scheduled → driver_assigned → boarding → active → completed
           ↘ waiting_driver ↗           ↘ cancelled
```

### Driver Assignment Flow
```
Admin creates schedule → trips generated with driverId=NULL
  → Driver books a route+timeslot for the week (POST /shuttle/route-bookings)
    → driver_shuttle_bookings record created (status: "active")
  → Admin views availability matrix (GET /admin/shuttle/availability)
  → Admin can reassign (PATCH /admin/shuttle/bookings/:id/reassign)
  → Driver accepts trip (PATCH /driver/trips/:id/accept) → status: "driver_assigned"
  → Every Wednesday 09:00 UTC: renewal job sends pending_renewal notification
  → Driver has 10 hours to confirm renewal (POST /shuttle/route-bookings/:id/confirm-renewal)
```

### Live Tracking Flow
```
Driver connects Socket.IO with JWT token
  → Emits driver:location:update { latitude, longitude, speed, heading, tripId }
  → Server writes to drivers table + buses table
  → Broadcasts to admin:room (admin:track:trip event)
  → If tripId present: broadcasts to trip:<tripId> room (passenger:trip:tracking event)
  → Passengers who called passenger:join:trip receive driver location in real-time
  → Route deviation detection: if driver >500m off pickup→dropoff line → emits ride:deviation:warning
```

---

## 2. Database Structure

### Table: `users`
**Purpose**: All users — passengers, drivers, and admins share this table.
**Source**: `lib/db/src/schema/users.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| name | text | NO | — | Full name |
| email | text | NO | — | Unique email |
| phone | text | NO | — | Unique phone |
| password | text | NO | — | bcrypt hash |
| avatar | text | YES | NULL | Profile image URL |
| walletBalance | numeric(12,2) | NO | 0 | Wallet funds in EGP |
| role | enum | NO | "user" | "user" / "driver" / "admin" |
| staffRoleId | integer | YES | NULL | FK to staff_roles |
| isVerified | boolean | NO | false | OTP verified |
| isBlocked | boolean | NO | false | Admin-blocked flag |
| refreshToken | text | YES | NULL | Current JWT refresh token |
| otpCode | text | YES | NULL | Active OTP |
| otpExpiresAt | timestamp | YES | NULL | OTP expiry |
| passwordResetToken | text | YES | NULL | Password reset token |
| passwordResetExpiresAt | timestamp | YES | NULL | Reset token expiry |
| pushToken | text | YES | NULL | FCM/APNS push token |
| createdAt | timestamp | NO | now() | Record creation |
| updatedAt | timestamp | NO | now() | Last update |

**Indexes**: unique on email, unique on phone

---

### Table: `drivers`
**Purpose**: Driver profile data, linked 1:1 to a `users` row with role="driver".
**Source**: `lib/db/src/schema/drivers.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| userId | integer | NO | — | FK → users.id (cascade delete) |
| name | text | NO | — | Driver's display name |
| phone | text | NO | — | Contact phone |
| licenseNumber | text | YES | NULL | Driver license number |
| nationalId | text | YES | NULL | National ID number |
| rating | numeric(3,2) | NO | 5.0 | Average star rating |
| assignedBusId | integer | YES | NULL | FK → buses.id (current vehicle) |
| vehicleType | text | YES | NULL | "hiace" / "minibus" / other |
| currentLatitude | real | YES | NULL | Last GPS latitude |
| currentLongitude | real | YES | NULL | Last GPS longitude |
| currentSpeed | real | YES | NULL | Speed in km/h |
| currentHeading | real | YES | NULL | Heading in degrees |
| isOnline | boolean | NO | false | Online/offline flag |
| status | enum | NO | "offline" | "offline"/"online"/"busy"/"suspended" |
| isActive | boolean | NO | true | Account active |
| locationUpdatedAt | timestamp | YES | NULL | When GPS was last received |
| onlineSince | timestamp | YES | NULL | When driver went online this shift |
| checkInRequired | boolean | NO | false | Selfie check-in gate active |
| checkInDeadline | timestamp | YES | NULL | Deadline to complete check-in |
| lastCheckInAt | timestamp | YES | NULL | Last successful check-in time |
| totalDispatched | integer | NO | 0 | Total ride offers sent (dispatch stats) |
| totalAccepted | integer | NO | 0 | Total ride offers accepted |
| lastDispatchedAt | timestamp | YES | NULL | Last ride offer timestamp |
| consecutiveRejections | integer | NO | 0 | Back-to-back rejection counter |
| cooldownUntil | timestamp | YES | NULL | Driver blocked from dispatch until |
| createdAt | timestamp | NO | now() | — |
| updatedAt | timestamp | NO | now() | — |

**Indexes**: idx_drivers_user_id, idx_drivers_assigned_bus_id, idx_drivers_status, idx_drivers_is_online, idx_drivers_cooldown_until

---

### Table: `buses`
**Purpose**: Physical vehicles (hiace/minibus) used on shuttle routes.
**Source**: `lib/db/src/schema/buses.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| plateNumber | text | NO | — | Unique license plate |
| capacity | integer | NO | — | Max passenger seats |
| model | text | NO | — | Vehicle model description |
| currentLatitude | real | YES | NULL | GPS latitude (mirrored from driver) |
| currentLongitude | real | YES | NULL | GPS longitude |
| isActive | boolean | NO | true | Vehicle in service |
| createdAt | timestamp | NO | now() | — |
| updatedAt | timestamp | NO | now() | — |

**Unique**: plateNumber

---

### Table: `routes`
**Purpose**: Shuttle lines defining a corridor from one location to another.
**Source**: `lib/db/src/schema/routes.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| name | text | NO | — | Route display name |
| fromLocation | text | NO | — | Origin location name |
| toLocation | text | NO | — | Destination location name |
| estimatedDuration | integer | NO | — | Duration in minutes |
| basePrice | numeric(10,2) | NO | — | Base fare in EGP |
| isActive | boolean | NO | true | Whether route is bookable |
| createdAt | timestamp | NO | now() | — |
| updatedAt | timestamp | NO | now() | — |

---

### Table: `stations`
**Purpose**: Individual stops along a route (pickup/dropoff points), ordered.
**Source**: `lib/db/src/schema/routes.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| routeId | integer | NO | — | FK → routes.id (cascade delete) |
| name | text | NO | — | Station display name |
| latitude | real | NO | — | GPS latitude |
| longitude | real | NO | — | GPS longitude |
| order | integer | NO | — | Stop sequence number |
| direction | text | NO | "outbound" | "outbound" or "return" |
| segmentPrice | numeric(10,2) | YES | NULL | Price for this leg (overrides base) |
| createdAt | timestamp | NO | now() | — |

---

### Table: `route_time_slots`
**Purpose**: Fixed departure time slots available on a route (e.g. "08:00", "09:00"). Drivers claim one slot per week.
**Source**: `lib/db/src/schema/driverShuttleBookings.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| routeId | integer | NO | — | FK → routes.id (cascade delete) |
| departureTime | text | NO | — | "HH:MM" format string |
| isActive | boolean | NO | true | Slot available for booking |
| createdAt | timestamp | NO | now() | — |

**Unique**: (routeId, departureTime) — prevents duplicate slots for same time on same route
**Indexes**: idx_route_time_slots_route_id

---

### Table: `driver_shuttle_bookings`
**Purpose**: Records which driver has claimed a route+timeslot for a given week. One driver per slot per week.
**Source**: `lib/db/src/schema/driverShuttleBookings.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| driverId | integer | NO | — | FK → drivers.id (cascade delete) |
| routeId | integer | NO | — | FK → routes.id (cascade delete) |
| timeSlotId | integer | NO | — | FK → route_time_slots.id (cascade delete) |
| weekStart | date | NO | — | Sunday date of the booking week (YYYY-MM-DD) |
| weekEnd | date | NO | — | Thursday date of the booking week |
| status | enum | NO | "active" | "active"/"cancelled"/"pending_renewal"/"expired" |
| renewalNotifiedAt | timestamp | YES | NULL | When renewal notification was sent |
| renewalDeadline | timestamp | YES | NULL | Deadline for driver to confirm renewal |
| renewalConfirmedAt | timestamp | YES | NULL | When driver confirmed renewal |
| cancelledAt | timestamp | YES | NULL | Cancellation timestamp |
| cancelledBy | text | YES | NULL | "driver" or "admin" |
| cancelReason | text | YES | NULL | Cancellation reason text |
| createdAt | timestamp | NO | now() | — |
| updatedAt | timestamp | NO | now() | — |

**Unique**: (routeId, timeSlotId, weekStart) — one driver per slot per week
**Indexes**: idx_dsb_driver_id, idx_dsb_route_id, idx_dsb_time_slot_id, idx_dsb_week_start, idx_dsb_status

---

### Table: `route_schedules`
**Purpose**: A schedule defines which vehicle type runs on a route during a date range, and the time slots per day.
**Source**: `lib/db/src/schema/routeSchedules.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| routeId | integer | NO | — | FK → routes.id (cascade delete) |
| effectiveFrom | date | NO | — | Schedule start date (YYYY-MM-DD) |
| effectiveTo | date | NO | — | Schedule end date (inclusive) |
| vehicleType | enum | NO | "hiace" | "hiace" (14 seats) or "minibus" (28 seats) |
| defaultCapacity | integer | NO | 14 | Vehicle capacity used for trip generation |
| isActive | boolean | NO | true | Whether schedule generates trips |
| createdAt | timestamp | NO | now() | — |
| updatedAt | timestamp | NO | now() | — |

**Vehicle capacities**: hiace=14 seats, min_threshold=7; minibus=28 seats, min_threshold=14

---

### Table: `schedule_slots`
**Purpose**: Day-of-week + time entries within a schedule. Used to generate individual trip records.
**Source**: `lib/db/src/schema/routeSchedules.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| scheduleId | integer | NO | — | FK → route_schedules.id (cascade delete) |
| dayOfWeek | integer | NO | — | 0=Sunday, 1=Monday, …, 6=Saturday |
| departureTime | text | NO | — | "HH:MM" |
| createdAt | timestamp | NO | now() | — |

**Unique**: (scheduleId, dayOfWeek, departureTime)

---

### Table: `trips`
**Purpose**: Individual shuttle departure instances. Auto-generated by schedules, one per scheduled time+day.
**Source**: `lib/db/src/schema/trips.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| routeId | integer | NO | — | FK → routes.id |
| scheduleId | integer | YES | NULL | FK → route_schedules.id (set null on delete) |
| busId | integer | YES | NULL | FK → buses.id (assigned vehicle) |
| driverId | integer | YES | NULL | FK → drivers.id (assigned driver) |
| departureTime | timestamp | NO | — | Exact departure date+time (UTC) |
| arrivalTime | timestamp | NO | — | Estimated arrival date+time |
| availableSeats | integer | NO | — | Remaining bookable seats |
| totalSeats | integer | NO | — | Vehicle capacity |
| price | numeric(10,2) | NO | — | Per-seat fare in EGP |
| status | enum | NO | "scheduled" | See trip status values below |
| isActive | boolean | NO | true | — |
| recurringType | enum | NO | "one_time" | "one_time"/"daily"/"weekdays"/"weekends"/"custom" |
| weekdays | text | YES | NULL | Comma-separated days for custom recurrence |
| vehicleType | enum | NO | "hiace" | "hiace" or "minibus" |
| cancelReason | text | YES | NULL | Why trip was cancelled |
| acceptedAt | timestamp | YES | NULL | When driver accepted |
| arrivedAt | timestamp | YES | NULL | When driver arrived at pickup |
| startedAt | timestamp | YES | NULL | When trip started |
| completedAt | timestamp | YES | NULL | When trip completed |
| cancelledAt | timestamp | YES | NULL | When trip was cancelled |
| createdAt | timestamp | NO | now() | — |
| updatedAt | timestamp | NO | now() | — |

**Trip Status Values**:
- `scheduled` — created, no driver assigned, open for bookings
- `waiting_driver` — needs driver assignment
- `driver_assigned` — driver accepted
- `boarding` — passengers boarding (currently treated same as driver_assigned)
- `active` — trip in progress OR threshold reached (≥7 bookings)
- `completed` — trip finished
- `cancelled` — trip cancelled (auto or manual)

**Bookable statuses**: scheduled, active, waiting_driver
**Indexes**: idx_trips_route_id, idx_trips_bus_id, idx_trips_driver_id, idx_trips_status, idx_trips_departure_time

---

### Table: `bookings`
**Purpose**: Passenger seat reservations on a specific trip.
**Source**: `lib/db/src/schema/bookings.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| userId | integer | NO | — | FK → users.id (passenger) |
| tripId | integer | NO | — | FK → trips.id |
| seatCount | integer | NO | — | Number of seats (always 1 for shuttle) |
| totalPrice | numeric(10,2) | NO | — | Amount paid (after discount) |
| status | enum | NO | "confirmed" | See booking status values |
| paymentStatus | enum | NO | "paid" | "pending"/"paid"/"refunded" |
| promoCodeId | integer | YES | NULL | FK → promo_codes.id |
| createdAt | timestamp | NO | now() | — |
| updatedAt | timestamp | NO | now() | — |

**Booking Status Values**:
- `pending` — booked, trip not yet active (below threshold)
- `confirmed` — trip is active, seat confirmed
- `boarded` — passenger physically boarded the shuttle
- `absent` — driver marked passenger as no-show
- `completed` — trip completed successfully
- `cancelled` — booking cancelled (wallet refunded)

**Indexes**: idx_bookings_user_id, idx_bookings_trip_id, idx_bookings_status, idx_bookings_promo_code_id

---

### Table: `driver_checkins`
**Purpose**: Selfie check-in records for face verification before a driver can start a trip.
**Source**: `lib/db/src/schema/driverCheckins.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| driverId | integer | NO | — | FK → drivers.id (cascade delete) |
| tripId | integer | YES | NULL | FK → trips.id (set null on delete) — present for shuttle_trip_start |
| checkInType | enum | NO | — | "shuttle_trip_start" or "periodic_online" |
| imageUrl | text | NO | — | Supabase Storage public URL of selfie |
| faceDetected | boolean | NO | false | Whether face was detected by AI |
| submittedAt | timestamp | NO | now() | When selfie was submitted |
| createdAt | timestamp | NO | now() | — |

**Indexes**: idx_driver_checkins_driver_id, idx_driver_checkins_trip_id, idx_driver_checkins_type, idx_driver_checkins_submitted, composite(driverId, faceDetected, submittedAt)

---

### Table: `trip_station_progress`
**Purpose**: Tracks per-trip per-station arrival/completion status as driver moves through stops.
**Source**: `lib/db/src/schema/tripStationProgress.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| tripId | integer | NO | — | FK → trips.id (cascade delete) |
| stationId | integer | NO | — | FK → stations.id (cascade delete) |
| status | enum | NO | "pending" | "pending"/"arrived"/"completed" |
| arrivedAt | timestamp | YES | NULL | When driver arrived at station |
| completedAt | timestamp | YES | NULL | When driver departed/completed station |
| createdAt | timestamp | NO | now() | — |

**Unique**: (tripId, stationId)

---

### Table: `driver_earnings`
**Purpose**: Per-trip earnings record for the driver (after platform commission).
**Source**: `lib/db/src/schema/driverEarnings.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| driverId | integer | NO | — | FK → drivers.id |
| tripId | integer | YES | NULL | FK → trips.id |
| amount | numeric(10,2) | NO | — | Driver's cut after commission |
| status | enum | NO | — | "pending"/"confirmed"/"paid" |
| date | timestamp | NO | now() | Earning date |
| createdAt | timestamp | NO | now() | — |

**Commission logic**: `driverCut = tripPrice × (1 - commissionRate)`. Default `commissionRate = 0.15` (15% platform cut).

---

### Table: `trip_events`
**Purpose**: Audit log of trip lifecycle transitions.
**Source**: `lib/db/src/schema/tripEvents.ts`

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| tripId | integer | NO | — | FK → trips.id |
| type | text | NO | — | Event type string (see below) |
| metadata | jsonb | YES | NULL | Event-specific payload |
| createdAt | timestamp | NO | now() | — |

**Event types**: `DRIVER_ACCEPTED`, `TRIP_STARTED`, `TRIP_COMPLETED`, `TRIP_CANCELLED`, `LOCATION_UPDATE`

---

### Table: `notifications`
**Purpose**: In-app notification inbox for all users.

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| userId | integer | NO | — | FK → users.id |
| title | text | NO | — | Notification title |
| body | text | NO | — | Notification body text |
| isRead | boolean | NO | false | Read state |
| createdAt | timestamp | NO | now() | — |

---

### Table: `wallet_transactions`
**Purpose**: Ledger of all wallet credits and debits.

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| userId | integer | NO | — | FK → users.id |
| amount | numeric(10,2) | NO | — | Transaction amount |
| type | text | NO | — | "payment" / "refund" / "topup" |
| description | text | YES | NULL | Human-readable description |
| createdAt | timestamp | NO | now() | — |

---

### Table: `payments`
**Purpose**: Payment records linked to bookings.

| Field | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| id | serial | NO | auto | Primary key |
| userId | integer | NO | — | FK → users.id |
| bookingId | integer | YES | NULL | FK → bookings.id |
| amount | numeric(10,2) | NO | — | Payment amount |
| method | text | NO | — | "wallet" / "card" |
| status | text | NO | — | "completed" / "refunded" / "failed" |
| notes | text | YES | NULL | Internal notes |
| createdAt | timestamp | NO | now() | — |

---

## 3. Routes / Lines

Routes are stored in the `routes` table. There is no seed data visible in the source — routes are created by admins via API.

**Available fields when listing routes** (`GET /shuttle/lines`):

```json
{
  "id": 1,
  "name": "Route Name",
  "fromLocation": "Origin",
  "toLocation": "Destination",
  "estimatedDuration": 45,
  "basePrice": 25.00,
  "isActive": true,
  "stationCount": 5,
  "totalTrips": 10,
  "openTrips": 3,
  "activeTrips": 2,
  "totalSeats": 14,
  "minRequired": 7,
  "timeSlots": [
    { "id": 1, "departureTime": "08:00", "isBooked": false },
    { "id": 2, "departureTime": "09:00", "isBooked": true }
  ],
  "availableSlots": 1,
  "totalSlots": 2,
  "upcomingWeekStart": "2026-06-08"
}
```

**Direction logic**: Each station has a `direction` field ("outbound" or "return"). Outbound stations are ordered ascending; return stations represent the reverse path. Both directions share the same route record.

**Status mapping** (computed, not stored):
- DB `status = "active"` or `"waiting_driver"` → shuttleStatus = `"active"` (boarding guaranteed)
- DB `status = "cancelled"` → shuttleStatus = `"cancelled"`
- All other → shuttleStatus = `"open"` (still collecting bookings)

**Constants**:
- `SHUTTLE_TOTAL_SEATS = 14` (hiace default)
- `SHUTTLE_MIN_REQUIRED = 7` (trip activates when 7 seats are booked)
- Minibus: capacity=28, threshold=14

---

## 4. Scheduled Trips

Trips are auto-generated by the schedule system (`POST /schedules`). Each `schedule_slots` entry produces one trip per matching calendar day in the `effectiveFrom`→`effectiveTo` range.

**To view scheduled trips**: `GET /trips?status=scheduled&routeId=N`

**Full trip object**:
```json
{
  "id": 42,
  "routeId": 1,
  "scheduleId": 3,
  "busId": null,
  "driverId": null,
  "departureTime": "2026-06-10T08:00:00.000Z",
  "arrivalTime": "2026-06-10T08:45:00.000Z",
  "availableSeats": 14,
  "totalSeats": 14,
  "price": 25.00,
  "status": "scheduled",
  "vehicleType": "hiace",
  "isActive": true,
  "recurringType": "one_time",
  "weekdays": null,
  "cancelReason": null,
  "acceptedAt": null,
  "startedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

**Days of operation**: Defined in `schedule_slots.dayOfWeek` (0=Sunday → 6=Saturday). The week runs **Sunday → Thursday** for driver shuttle bookings.

**Assigned vehicle / driver**: Set at trip level via `busId` and `driverId`. Trips from schedules start as `NULL` for both — drivers self-assign via shuttle route bookings and then accept trips.

---

## 5. Booking Lifecycle

### State Machine

```
[Passenger creates booking]
  POST /bookings → status: "pending", paymentStatus: "paid"
  (wallet debited immediately; trip stays "scheduled" until 7 bookings)

  IF total bookings ≥ SHUTTLE_MIN_REQUIRED (7):
    trip.status → "active"
    (all existing "pending" bookings remain "pending" but trip is now confirmed)

[Driver accepts trip]
  PATCH /driver/trips/:id/accept → trip.status: "driver_assigned"

[Driver starts trip]
  PATCH /driver/trips/:id/start (requires face-detected selfie for this tripId)
    → trip.status: "active", driver.status: "busy"
    → tripStationProgress rows created for all stations

[Driver boards passenger]
  PATCH /driver/bookings/:id/board
    → booking.status: "pending"/"confirmed" → "boarded"
    → Socket emits "booking:boarded" to passenger

[Trip completes]
  PATCH /driver/trips/:id/complete
    → trip.status: "completed"
    → all "confirmed" bookings → "completed"
    → driver earnings record created
    → driver.status: "online"

[Cancellations]
  Passenger: PATCH /bookings/:id/cancel
    → booking.status: "cancelled", paymentStatus: "refunded"
    → trip.availableSeats restored
    → wallet refunded (if paymentStatus was "paid")
    → NOTE: active trips NEVER revert to "scheduled" on cancellation

  Auto-cancel (shuttle-job.ts, runs every 15 min):
    → If trip departing within 8 hours has booked seats < vehicleType threshold
    → All pending/confirmed bookings cancelled + wallets refunded
    → Passengers notified via Socket (notification:new)
    → Driver notified via Socket (notification:new)
```

### Validation Rules

| Rule | Enforcement |
|---|---|
| seatCount must equal 1 | Enforced in POST /bookings |
| No duplicate booking (same user + trip) | SQL check before insert |
| Trip must be scheduled/active/waiting_driver | Status check with row lock |
| Wallet balance ≥ totalPrice | Row-level check in transaction |
| Cannot book cancelled/completed trip | Status validation |
| Cannot cancel already-cancelled booking | Status check |
| Cannot start trip without selfie | driver_checkins query check |
| Cannot accept trip not assigned to you | driverId ownership check |

### Status Values Summary

**booking.status**: `pending` → `confirmed` → `boarded` → `completed` | `cancelled` | `absent`

**trip.status**: `scheduled` → `waiting_driver` → `driver_assigned` → `boarding` → `active` → `completed` | `cancelled`

**paymentStatus**: `pending` → `paid` → `refunded`

---

## 6. API Documentation

> **Authentication**: All protected endpoints require `Authorization: Bearer <accessToken>` header.
> Roles: `user` (passenger), `driver`, `admin`

---

### Authentication Endpoints

---

#### `POST /auth/register`
**Purpose**: Register a new passenger account.
**Auth**: None
**Request Body**:
```json
{ "name": "John Doe", "email": "john@example.com", "phone": "01012345678", "password": "password123" }
```
**Response**: `{ accessToken, refreshToken, user }`
**Tables**: users

---

#### `POST /auth/login`
**Purpose**: Passenger login (email or phone + password). Blocked for admin role.
**Auth**: None
**Request Body**:
```json
{ "email": "john@example.com", "password": "password123" }
```
**Response**: `{ accessToken, refreshToken, user }`
**Tables**: users

---

#### `POST /auth/admin/login`
**Purpose**: Admin login. Only role=admin accounts succeed.
**Auth**: None
**Request Body**: `{ "email": "admin@example.com", "password": "..." }`
**Response**: `{ accessToken, refreshToken, user }`
**Tables**: users

---

#### `POST /driver/auth/register`
**Purpose**: Register a new driver account.
**Auth**: None
**Request Body**:
```json
{ "name": "Ali Hassan", "email": "ali@example.com", "phone": "01098765432", "password": "password123", "licenseNumber": "LIC123", "nationalId": "NID456" }
```
**Response**: `{ accessToken, refreshToken, user, driver }`
**Tables**: users, drivers

---

#### `POST /driver/auth/login`
**Purpose**: Driver login via email/phone + password.
**Auth**: None
**Request Body**:
```json
{ "credential": "ali@example.com", "password": "password123" }
```
**Response**: `{ accessToken, refreshToken, user, driver }`
**Tables**: users, drivers

---

#### `POST /driver/auth/logout`
**Purpose**: Driver logout — clears refresh token, sets driver offline.
**Auth**: Driver JWT
**Response**: `{ ok: true }`
**Tables**: users, drivers

---

#### `POST /auth/refresh`
**Purpose**: Refresh access token using refresh token.
**Auth**: None
**Request Body**: `{ "refreshToken": "..." }`
**Response**: `{ accessToken, refreshToken }`

---

#### `POST /auth/verify-otp`
**Purpose**: Verify OTP code for phone/email verification.
**Auth**: User JWT
**Request Body**: `{ "code": "123456" }`

---

#### `POST /auth/forgot-password`
**Purpose**: Initiate password reset.
**Auth**: None
**Request Body**: `{ "email": "..." }`

---

### Shuttle Line Endpoints

---

#### `GET /shuttle/lines`
**Purpose**: List all active shuttle routes with station counts, trip stats, and time slot availability.
**Auth**: User/Driver JWT (authenticate middleware)
**Query Params**: None
**Response**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "Line A",
      "fromLocation": "Cairo",
      "toLocation": "Alexandria",
      "estimatedDuration": 180,
      "basePrice": 50.00,
      "isActive": true,
      "stationCount": 4,
      "totalTrips": 20,
      "openTrips": 8,
      "activeTrips": 3,
      "totalSeats": 14,
      "minRequired": 7,
      "timeSlots": [
        { "id": 1, "departureTime": "08:00", "isBooked": false },
        { "id": 2, "departureTime": "15:00", "isBooked": true }
      ],
      "availableSlots": 1,
      "totalSlots": 2,
      "upcomingWeekStart": "2026-06-08"
    }
  ],
  "total": 1
}
```
**Tables**: routes, stations, trips, route_time_slots, driver_shuttle_bookings
**Used By**: Passenger app, Driver app

---

#### `GET /shuttle/lines/:id`
**Purpose**: Get a single shuttle line with its stations and upcoming trips (up to 10).
**Auth**: None (public)
**Path Params**: `id` — route ID
**Response**:
```json
{
  "data": {
    "id": 1,
    "name": "Line A",
    "fromLocation": "Cairo",
    "toLocation": "Alexandria",
    "basePrice": 50.00,
    "stationCount": 4,
    "totalSeats": 14,
    "minRequired": 7,
    "stations": [...],
    "activeTrips": [
      {
        "id": 42,
        "status": "scheduled",
        "departureTime": "2026-06-10T08:00:00Z",
        "arrivalTime": "2026-06-10T11:00:00Z",
        "availableSeats": 14,
        "totalSeats": 14,
        "price": 50.00,
        "bookedSeats": 0,
        "shuttleStatus": "open",
        "message": "Needs 7 more bookings to become active"
      }
    ]
  }
}
```
**Tables**: routes, stations, trips, bookings
**Used By**: Passenger app, Driver app

---

#### `GET /shuttle/assignments`
**Purpose**: List all drivers who have an assigned bus, with their current trip info.
**Auth**: None (public — no authenticate middleware)
**Response**:
```json
{
  "data": [
    {
      "driverId": 5,
      "driverName": "Ali Hassan",
      "driverPhone": "01098765432",
      "driverStatus": "online",
      "isOnline": true,
      "rating": 4.8,
      "bus": { "id": 2, "plateNumber": "ABC-123", "model": "Toyota Hiace", "capacity": 14, "isActive": true },
      "currentTrip": {
        "id": 42,
        "routeName": "Line A",
        "status": "active",
        "departureTime": "...",
        "availableSeats": 7
      }
    }
  ],
  "total": 1
}
```
**Tables**: drivers, buses, trips, routes
**Used By**: Admin dashboard, Passenger app (tracking view)

---

#### `GET /shuttle/trips/:id/passengers`
**Purpose**: Get all passengers booked on a specific trip.
**Auth**: Authenticated
**Path Params**: `id` — trip ID
**Response**:
```json
{
  "tripId": 42,
  "tripStatus": "active",
  "shuttleStatus": "active",
  "totalSeats": 14,
  "bookedSeats": 9,
  "availableSeats": 5,
  "minRequired": 7,
  "data": [
    {
      "bookingId": 101,
      "userId": 33,
      "userName": "John Doe",
      "userPhone": "01012345678",
      "userEmail": "john@example.com",
      "seatCount": 1,
      "totalPrice": 50.00,
      "status": "boarded",
      "paymentStatus": "paid",
      "createdAt": "..."
    }
  ],
  "total": 9
}
```
**Tables**: trips, bookings, users
**Used By**: Driver app (passenger manifest)

---

#### `GET /shuttle/lines/:id/passengers`
**Purpose**: Get all passengers for the next upcoming trip on a line.
**Auth**: Authenticated
**Path Params**: `id` — route ID
**Tables**: trips, bookings, users
**Used By**: Driver app

---

#### `POST /shuttle/bookings/:id/board`
**Purpose**: Mark a passenger as boarded (alternative to driver endpoint — same logic, admin/any auth).
**Auth**: Authenticated
**Path Params**: `id` — booking ID
**Response**: `{ ok: true, booking: {...}, timestamp: "..." }`
**Socket Emitted**: `booking:boarded` → `passenger:<userId>`
**Tables**: bookings
**Used By**: Admin dashboard, Driver app

---

### Booking Endpoints

---

#### `POST /bookings`
**Purpose**: Passenger creates a shuttle booking. Wallet is charged immediately. Trip auto-activates if threshold reached.
**Auth**: User JWT (role=user)
**Request Body**:
```json
{ "tripId": 42, "seatCount": 1, "promoCode": "SAVE10" }
```
**Response** (201):
```json
{
  "id": 101,
  "userId": 33,
  "tripId": 42,
  "seatCount": 1,
  "totalPrice": 45.00,
  "status": "pending",
  "paymentStatus": "paid",
  "shuttle": {
    "totalSeats": 14,
    "bookedSeats": 5,
    "availableSeats": 9,
    "minRequired": 7,
    "shuttleStatus": "open",
    "message": "Needs 2 more bookings to become active"
  }
}
```
**Error Responses**:
- `400` — seatCount ≠ 1, trip not bookable, insufficient seats, insufficient wallet balance
- `404` — trip not found
- `409` — duplicate booking for this user+trip
**Tables**: bookings, trips, users, promo_codes, wallet_transactions, payments
**Used By**: Passenger app

---

#### `GET /bookings`
**Purpose**: Admin list of all bookings with user and trip details.
**Auth**: Admin JWT
**Query Params**: `userId`, `tripId`, `status`, `page`, `limit`
**Tables**: bookings, users, trips
**Used By**: Admin dashboard

---

#### `GET /bookings/:id`
**Purpose**: Get a single booking. Passengers can only see their own.
**Auth**: User/Driver/Admin JWT
**Tables**: bookings
**Used By**: Passenger app, Admin dashboard

---

#### `PATCH /bookings/:id/cancel`
**Purpose**: Cancel a booking. Auto-refunds wallet if payment was "paid".
**Auth**: User/Admin JWT (passengers can only cancel their own)
**Response**: updated booking object
**Tables**: bookings, trips, users, wallet_transactions, payments
**Used By**: Passenger app, Admin dashboard

---

### Driver Endpoints

---

#### `GET /driver/me`
**Purpose**: Get the authenticated driver's full profile.
**Auth**: Driver JWT
**Response**: full drivers table row (with rating as float)
**Tables**: drivers

---

#### `PATCH /driver/me`
**Purpose**: Update driver profile fields.
**Auth**: Driver JWT
**Request Body** (all optional): `{ name, phone, vehicleType, licenseNumber, nationalId }`
**Tables**: drivers

---

#### `GET /driver/me/vehicle`
**Purpose**: Get the driver's currently assigned bus.
**Auth**: Driver JWT
**Response**: `{ vehicle: { id, plateNumber, model, capacity, isActive }, vehicleType: "hiace" }`
**Tables**: drivers, buses

---

#### `GET /driver/me/documents`
**Purpose**: List all documents submitted by the driver.
**Auth**: Driver JWT
**Tables**: driver_documents

---

#### `POST /driver/me/documents`
**Purpose**: Upload a document (selfie, license, vehicle photo, etc.).
**Auth**: Driver JWT
**Request Body**:
```json
{
  "type": "national_id_front",
  "fileUrl": "https://...",
  "mimeType": "image/jpeg"
}
```
**Valid types**: `national_id_front`, `national_id_back`, `driving_license_front`, `driving_license_back`, `vehicle_license_front`, `vehicle_license_back`, `vehicle_photo`, `profile_photo`, `trip_selfie`
**Tables**: driver_documents

---

#### `GET /driver/me/ratings`
**Purpose**: Get driver's average rating, trip count, total earned, and recent individual ratings.
**Auth**: Driver JWT
**Response**: `{ rating, tripCount, totalEarned, ratingsCount, ratings: [...] }`
**Tables**: drivers, driver_earnings, ratings

---

#### `GET /driver/me/status`
**Purpose**: Get driver's current availability status and GPS location.
**Auth**: Driver JWT
**Response**: `{ id, status, isOnline, isActive, currentLatitude, currentLongitude, currentSpeed, currentHeading }`
**Tables**: drivers

---

#### `GET /driver/me/settings`
**Purpose**: Get driver's app settings (vehicle type, notification preferences).
**Auth**: Driver JWT
**Tables**: drivers, settings

---

#### `PATCH /driver/me/settings`
**Purpose**: Update driver's settings.
**Auth**: Driver JWT
**Request Body** (all optional): `{ vehicleType: "hiace", notifications: true }`
**Tables**: drivers, settings

---

#### `PATCH /driver/status/online`
**Purpose**: Set driver status to online. Marks onlineSince if transitioning from offline.
**Auth**: Driver JWT
**Response**: updated driver object
**Tables**: drivers

---

#### `PATCH /driver/status/offline`
**Purpose**: Set driver status to offline. Clears check-in gate and onlineSince.
**Auth**: Driver JWT
**Tables**: drivers

---

#### `PATCH /driver/location`
**Purpose**: REST fallback for GPS updates (prefer Socket.IO for real-time tracking).
**Auth**: Driver JWT
**Request Body**: `{ latitude, longitude, speed?, heading?, tripId? }`
**Tables**: drivers, trip_events

---

#### `GET /driver/trips`
**Purpose**: List all trips assigned to the driver.
**Auth**: Driver JWT
**Query Params**: `status` (scheduled/active/completed/etc.), `page`, `limit`
**Response**: `{ data: [trips...], total, page, limit }`
**Tables**: trips

---

#### `GET /driver/trips/:id`
**Purpose**: Get single trip detail with passenger list.
**Auth**: Driver JWT
**Response**: trip object + `bookings: [{ id, passengerName, passengerPhone, passengerAvatar }]`
**Tables**: trips, bookings, users

---

#### `PATCH /driver/trips/:id/accept`
**Purpose**: Driver accepts an assigned trip. Status: `scheduled`/`waiting_driver` → `driver_assigned`.
**Auth**: Driver JWT
**Tables**: trips, trip_events

---

#### `PATCH /driver/trips/:id/reject`
**Purpose**: Driver rejects a trip. Clears driverId so trip goes to `waiting_driver` again.
**Auth**: Driver JWT
**Tables**: trips

---

#### `PATCH /driver/trips/:id/start`
**Purpose**: Start an accepted trip. **Requires a face-detected selfie for this specific tripId** (shuttle_trip_start check-in). Status: `driver_assigned`/`boarding` → `active`.
**Auth**: Driver JWT
**Error** (403): `"Selfie check-in required"` if no matching face-detected driver_checkins row exists.
**Tables**: trips, drivers, trip_events, trip_station_progress, stations

---

#### `PATCH /driver/trips/:id/complete`
**Purpose**: Complete an active trip. Computes and records driver earnings.
**Auth**: Driver JWT
**Tables**: trips, bookings, driver_earnings, trip_events, drivers, settings

---

#### `PATCH /driver/trips/:id/cancel`
**Purpose**: Driver cancels a trip with a reason.
**Auth**: Driver JWT
**Request Body**: `{ "reason": "Vehicle breakdown" }`
**Tables**: trips, trip_events, drivers

---

#### `GET /driver/trips/:id/stations`
**Purpose**: Get all stations for a trip with current progress status.
**Auth**: Driver JWT
**Response**: `{ data: [{ id, name, latitude, longitude, order, status, arrivedAt, completedAt, expectedPassengers }] }`
**Tables**: stations, trip_station_progress, bookings

---

#### `PATCH /driver/trips/:id/stations/:stationId/arrived`
**Purpose**: Mark driver as arrived at a specific station.
**Auth**: Driver JWT
**Tables**: trip_station_progress

---

#### `PATCH /driver/trips/:id/stations/:stationId/completed`
**Purpose**: Mark driver as departed from a specific station.
**Auth**: Driver JWT
**Tables**: trip_station_progress

---

#### `PATCH /driver/bookings/:id/board`
**Purpose**: Driver boards a passenger. Changes booking status to "boarded". Emits Socket event.
**Auth**: Driver JWT
**Path Params**: `id` — booking ID
**Socket Emitted**: `booking:boarded` → `passenger:<userId>`
**Tables**: bookings, trips

---

#### `PATCH /driver/bookings/:id/absent`
**Purpose**: Driver marks a passenger as absent (no-show).
**Auth**: Driver JWT
**Tables**: bookings, trips

---

#### `GET /driver/earnings`
**Purpose**: Summary of driver's total earnings + last 10 records.
**Auth**: Driver JWT
**Response**: `{ totalEarned, tripCount, recent: [...] }`
**Tables**: driver_earnings

---

#### `GET /driver/earnings/history`
**Purpose**: Paginated earnings history.
**Auth**: Driver JWT
**Query Params**: `page`, `limit`
**Tables**: driver_earnings

---

#### `GET /driver/wallet/balance`
**Purpose**: Get driver's available, paid, and pending wallet balance.
**Auth**: Driver JWT
**Response**: `{ balance, totalPaid, totalPending }`
**Tables**: driver_earnings

---

#### `GET /driver/wallet/payout-methods`
**Purpose**: List available payout methods (static list).
**Auth**: Driver JWT
**Response**: `{ data: [{ id, name, description, isAvailable }] }`

---

#### `POST /driver/wallet/payout`
**Purpose**: Request a payout. Marks confirmed earnings as paid.
**Auth**: Driver JWT
**Request Body**: `{ "amount": 500.00, "method": "bank_transfer" }`
**Tables**: driver_earnings

---

#### `GET /driver/notifications`
**Purpose**: Get last 50 notifications for the driver.
**Auth**: Driver JWT
**Tables**: notifications

---

#### `GET /driver/reviews`
**Purpose**: Paginated list of passenger reviews/ratings received by driver.
**Auth**: Driver JWT
**Tables**: ride_events (type=DRIVER_RATED)

---

### Check-in Endpoints

---

#### `POST /driver/checkin`
**Purpose**: Driver submits a selfie for face-detection check-in. Uploads to Supabase Storage.
**Auth**: Driver JWT
**Content-Type**: `multipart/form-data`
**Form Fields**:
- `file` (required) — image file (jpeg/png/webp, max 8 MB)
- `tripId` (optional) — numeric string; include for `shuttle_trip_start` type check-in
**Response** (201):
```json
{
  "id": 55,
  "driverId": 5,
  "tripId": 42,
  "checkInType": "shuttle_trip_start",
  "imageUrl": "https://supabase.../checkins/driver_5/shuttle_trip_start/...",
  "faceDetected": true,
  "submittedAt": "2026-06-10T07:45:00Z",
  "message": "Check-in accepted"
}
```
**Socket Emitted**:
- If `faceDetected=true`: `driver:checkin:approved` → `driver:<userId>`
- If `faceDetected=false`: `driver:checkin:rejected` → `driver:<userId>`
**Tables**: driver_checkins, drivers
**Used By**: Driver app (required before PATCH /driver/trips/:id/start)

---

#### `GET /driver/checkin/status`
**Purpose**: Get the driver's current check-in gate state and 5 most recent check-ins.
**Auth**: Driver JWT
**Response**:
```json
{
  "checkInRequired": false,
  "checkInDeadline": null,
  "lastCheckInAt": "2026-06-10T07:45:00Z",
  "isOnline": true,
  "onlineSince": "2026-06-10T07:30:00Z",
  "recentCheckins": [...]
}
```
**Tables**: drivers, driver_checkins

---

### Shuttle Driver Booking Endpoints (Weekly Route Booking)

---

#### `GET /shuttle/timeslots/:routeId`
**Purpose**: List all active time slots for a route with booking status for the upcoming week.
**Auth**: Driver JWT
**Path Params**: `routeId`
**Response**:
```json
{
  "routeId": 1,
  "routeName": "Line A",
  "weekStart": "2026-06-08",
  "data": [
    {
      "id": 1,
      "routeId": 1,
      "departureTime": "08:00",
      "isActive": true,
      "isBooked": true,
      "bookedByDriverId": 5,
      "bookedByDriverName": "Ali Hassan"
    },
    {
      "id": 2,
      "departureTime": "09:00",
      "isActive": true,
      "isBooked": false,
      "bookedByDriverId": null,
      "bookedByDriverName": null
    }
  ],
  "total": 2
}
```
**Tables**: route_time_slots, driver_shuttle_bookings, drivers
**Used By**: Driver app

---

#### `POST /shuttle/route-bookings`
**Purpose**: Driver books a route+timeslot for the upcoming week. Only one driver per slot per week.
**Auth**: Driver JWT (role=driver)
**Request Body**:
```json
{
  "routeId": 1,
  "timeSlotId": 2,
  "weekStart": "2026-06-08"
}
```
**Validations**:
- `weekStart` must be a Sunday
- `weekStart` must be the upcoming week or later
- Slot must be active and belong to the specified route
- No existing active/pending_renewal booking for that route+slot+week
**Response** (201):
```json
{
  "ok": true,
  "booking": {
    "id": 10,
    "driverId": 5,
    "routeId": 1,
    "timeSlotId": 2,
    "weekStart": "2026-06-08",
    "weekEnd": "2026-06-12",
    "status": "active"
  }
}
```
**Error**: `409` if slot already taken
**Tables**: driver_shuttle_bookings, route_time_slots, drivers
**Used By**: Driver app

---

#### `GET /shuttle/route-bookings`
**Purpose**: Driver's own shuttle route bookings (all time, newest first).
**Auth**: Driver JWT (role=driver)
**Response**: `{ data: [bookings with route+timeslot+driver info...], total }`
**Tables**: driver_shuttle_bookings, routes, route_time_slots, drivers
**Used By**: Driver app

---

#### `GET /shuttle/route-bookings/:id`
**Purpose**: Get a single route booking detail.
**Auth**: Driver JWT (role=driver)
**Tables**: driver_shuttle_bookings, routes, route_time_slots, drivers
**Used By**: Driver app

---

#### `DELETE /shuttle/route-bookings/:id`
**Purpose**: Driver cancels their own active route booking.
**Auth**: Driver JWT (role=driver)
**Allowed statuses**: active, pending_renewal
**Response**: `{ ok: true, booking: updated }`
**Tables**: driver_shuttle_bookings
**Used By**: Driver app

---

#### `POST /shuttle/route-bookings/:id/confirm-renewal`
**Purpose**: Driver confirms priority renewal. Creates a new booking for next week, marks current booking as `active` (renewal confirmed).
**Auth**: Driver JWT (role=driver)
**Path Params**: `id` — current booking ID (must be `pending_renewal`)
**Response**:
```json
{
  "ok": true,
  "currentBooking": { "id": 10, "status": "active", "renewalConfirmedAt": "..." },
  "nextWeekBooking": { "id": 11, "weekStart": "2026-06-15", "status": "active" }
}
```
**Errors**:
- `400` — booking not in pending_renewal status
- `400` — renewal already confirmed
- `400` — renewal window expired
- `409` — slot already booked for next week
**Tables**: driver_shuttle_bookings
**Used By**: Driver app

---

### Schedule Endpoints (Admin)

---

#### `POST /schedules`
**Purpose**: Create a schedule for a route. Auto-generates all trips for the date range.
**Auth**: Admin JWT
**Request Body**:
```json
{
  "routeId": 1,
  "effectiveFrom": "2026-06-01",
  "effectiveTo": "2026-06-30",
  "vehicleType": "hiace",
  "slots": [
    { "dayOfWeek": 0, "departureTime": "08:00" },
    { "dayOfWeek": 1, "departureTime": "08:00" }
  ]
}
```
**Response**: `{ schedule, slots, tripsCreated: 8 }`
**Tables**: route_schedules, schedule_slots, trips

---

#### `GET /schedules`
**Purpose**: List all schedules with slot and trip stats.
**Auth**: Admin JWT
**Query Params**: `routeId`
**Tables**: route_schedules, routes, schedule_slots, trips

---

#### `GET /schedules/:id`
**Purpose**: Get single schedule with its slots and trip statistics.
**Auth**: Admin JWT
**Tables**: route_schedules, routes, schedule_slots, trips

---

#### `PATCH /schedules/:id`
**Purpose**: Update schedule dates or active status.
**Auth**: Admin JWT
**Request Body** (all optional): `{ effectiveFrom, effectiveTo, isActive }`
**Tables**: route_schedules

---

#### `POST /schedules/:id/generate`
**Purpose**: Manually regenerate trips for a schedule (skips already-existing ones).
**Auth**: Admin JWT
**Response**: `{ ok: true, tripsCreated: N }`
**Tables**: route_schedules, schedule_slots, routes, trips

---

#### `DELETE /schedules/:id`
**Purpose**: Deactivates schedule and cancels all future unassigned trips.
**Auth**: Admin JWT
**Response**: `{ ok: true, scheduleDeactivated: true, futureTripsCount: N }`
**Tables**: route_schedules, trips

---

### Route Management Endpoints (Admin)

---

#### `GET /routes`
**Purpose**: List all routes (no auth required).
**Query Params**: `search` (name filter)
**Tables**: routes

---

#### `POST /routes`
**Purpose**: Create a new route.
**Auth**: Admin JWT
**Request Body**: `{ name, fromLocation, toLocation, estimatedDuration, basePrice, isActive? }`
**Tables**: routes

---

#### `GET /routes/:id`
**Purpose**: Get a single route.
**Auth**: None
**Tables**: routes

---

#### `PATCH /routes/:id`
**Purpose**: Update a route.
**Auth**: Admin JWT
**Tables**: routes

---

#### `DELETE /routes/:id`
**Purpose**: Delete a route and cascade-delete its trips and bookings.
**Auth**: Admin JWT
**Tables**: routes, trips, bookings

---

#### `GET /routes/:id/stations`
**Purpose**: List all stations for a route ordered by sequence.
**Auth**: None
**Tables**: stations

---

#### `POST /routes/:id/stations`
**Purpose**: Add a stop to a route.
**Auth**: Admin JWT
**Request Body**: `{ name, latitude, longitude, order, direction?, segmentPrice? }`
**Tables**: stations

---

#### `PATCH /routes/:id/stations/:stationId`
**Purpose**: Update a station.
**Auth**: Admin JWT
**Tables**: stations

---

#### `DELETE /routes/:id/stations/:stationId`
**Purpose**: Remove a station from a route.
**Auth**: Admin JWT
**Tables**: stations

---

### Trip Management Endpoints

---

#### `GET /trips`
**Purpose**: List trips with optional filters.
**Auth**: None (public)
**Query Params**: `routeId`, `status`, `date` (YYYY-MM-DD), `page`, `limit`
**Tables**: trips

---

#### `POST /trips`
**Purpose**: Manually create a single trip.
**Auth**: Admin JWT
**Request Body**: `{ routeId, busId, driverId?, departureTime, arrivalTime, price }`
**Tables**: trips, buses

---

#### `GET /trips/:id`
**Purpose**: Get a single trip.
**Auth**: None
**Tables**: trips

---

#### `PATCH /trips/:id`
**Purpose**: Update a trip.
**Auth**: Admin JWT
**Tables**: trips

---

#### `PATCH /trips/:id/cancel`
**Purpose**: Admin cancels a trip.
**Auth**: Admin JWT
**Tables**: trips

---

#### `DELETE /trips/:id`
**Purpose**: Delete a trip (not allowed if active).
**Auth**: Admin JWT
**Tables**: trips, bookings

---

### Admin Shuttle Management Endpoints

---

#### `GET /admin/shuttle/bookings`
**Purpose**: List all driver shuttle bookings with filters.
**Auth**: Admin JWT
**Query Params**: `week` (YYYY-MM-DD), `routeId`, `driverId`, `status`, `page`, `limit`
**Tables**: driver_shuttle_bookings, routes, route_time_slots, drivers

---

#### `GET /admin/shuttle/bookings/:id`
**Purpose**: Get single driver shuttle booking detail.
**Auth**: Admin JWT
**Tables**: driver_shuttle_bookings, routes, route_time_slots, drivers

---

#### `PATCH /admin/shuttle/bookings/:id/reassign`
**Purpose**: Reassign a booking to a different driver. Notifies both old and new driver via Socket.
**Auth**: Admin JWT
**Request Body**: `{ "driverId": 7 }`
**Socket Emitted**: `shuttle:booking:reassigned` → both old and new driver rooms
**Tables**: driver_shuttle_bookings, drivers

---

#### `PATCH /admin/shuttle/bookings/:id/cancel`
**Purpose**: Admin cancels a driver shuttle booking. Notifies driver via Socket.
**Auth**: Admin JWT
**Request Body** (optional): `{ "reason": "Driver complaint" }`
**Socket Emitted**: `notification:new` → driver's passenger room
**Tables**: driver_shuttle_bookings, drivers, notifications

---

#### `PATCH /admin/shuttle/bookings/:id/extend-window`
**Purpose**: Extend a driver's priority renewal deadline by N hours.
**Auth**: Admin JWT
**Request Body**: `{ "hours": 24 }`
**Socket Emitted**: `notification:new` with `shuttle_renewal` category → driver
**Tables**: driver_shuttle_bookings, drivers, notifications

---

#### `GET /admin/shuttle/availability`
**Purpose**: Availability matrix showing all routes × all time slots × booking status for a week.
**Auth**: Admin JWT
**Query Params**: `week` (YYYY-MM-DD, defaults to upcoming week)
**Response**:
```json
{
  "weekStart": "2026-06-08",
  "data": [
    {
      "routeId": 1,
      "routeName": "Line A",
      "fromLocation": "Cairo",
      "toLocation": "Alexandria",
      "weekStart": "2026-06-08",
      "totalSlots": 2,
      "bookedSlots": 1,
      "availableSlots": 1,
      "slots": [
        {
          "slotId": 1,
          "departureTime": "08:00",
          "isActive": true,
          "isBooked": true,
          "booking": {
            "id": 10,
            "driverId": 5,
            "driverName": "Ali Hassan",
            "driverPhone": "01098765432",
            "status": "active",
            "renewalNotifiedAt": null,
            "renewalDeadline": null
          }
        }
      ]
    }
  ],
  "total": 1
}
```
**Tables**: routes, route_time_slots, driver_shuttle_bookings, drivers

---

#### `GET /admin/shuttle/renewal-history`
**Purpose**: History of all bookings that had a renewal notification sent.
**Auth**: Admin JWT
**Query Params**: `page`, `limit`
**Tables**: driver_shuttle_bookings, routes, route_time_slots, drivers

---

#### `GET /admin/shuttle/timeslots`
**Purpose**: List all time slots, optionally filtered by routeId.
**Auth**: Admin JWT
**Query Params**: `routeId`
**Tables**: route_time_slots, routes

---

#### `POST /admin/shuttle/timeslots`
**Purpose**: Create a new time slot for a route.
**Auth**: Admin JWT
**Request Body**: `{ "routeId": 1, "departureTime": "10:00", "isActive": true }`
**Response** (201): `{ ok: true, slot: { id, routeId, departureTime, isActive, createdAt } }`
**Error**: `409` if time slot already exists for that route
**Tables**: route_time_slots

---

#### `PATCH /admin/shuttle/timeslots/:id`
**Purpose**: Update a time slot's departure time or active status.
**Auth**: Admin JWT
**Request Body** (at least one): `{ "departureTime": "10:30", "isActive": false }`
**Tables**: route_time_slots

---

#### `DELETE /admin/shuttle/timeslots/:id`
**Purpose**: Delete a time slot. Blocked if active bookings exist.
**Auth**: Admin JWT
**Error**: `409` if active/pending_renewal bookings reference this slot
**Tables**: route_time_slots, driver_shuttle_bookings

---

#### `GET /admin/checkins`
**Purpose**: List all driver check-ins with filters.
**Auth**: Admin JWT
**Query Params**: `driverId`, `faceDetected` (true/false), `checkInType`, `since` (ISO date), `page`, `limit`
**Tables**: driver_checkins, drivers

---

## 7. Driver APIs — Complete Integration Guide

### Authentication
```
POST /driver/auth/register   → create account
POST /driver/auth/login      → get tokens
POST /driver/auth/logout     → clear session
```
Store `accessToken` and `refreshToken`. Attach `Authorization: Bearer <accessToken>` to every protected call.

### Profile & Status
```
GET  /driver/me              → full profile
PATCH /driver/me             → update name/phone/vehicleType/license/nationalId
GET  /driver/me/status       → online status + GPS
GET  /driver/me/vehicle      → assigned bus details
GET  /driver/me/settings     → notification settings, vehicleType
PATCH /driver/me/settings    → update settings
```

### Going Online/Offline
```
PATCH /driver/status/online  → set online (emit driver:status:online via Socket)
PATCH /driver/status/offline → set offline (emit driver:status:offline via Socket)
```
**Important**: After calling `PATCH /driver/status/online`, also emit `driver:status:online` via Socket to join the `drivers:available:<vehicleType>` room.

### Viewing & Booking Shuttle Routes (Weekly)
```
1. GET  /shuttle/lines              → see all active routes + available time slots for upcoming week
2. GET  /shuttle/timeslots/:routeId → see which slots are free for a given route
3. POST /shuttle/route-bookings     → claim a route+timeslot for the week
4. GET  /shuttle/route-bookings     → see all my bookings
5. DELETE /shuttle/route-bookings/:id → cancel my booking
```

### Confirming Renewal (Every Wednesday)
```
1. Receive notification:new socket event with category="shuttle_renewal"
2. GET /shuttle/route-bookings/:id → verify status is "pending_renewal"
3. POST /shuttle/route-bookings/:id/confirm-renewal → confirm for next week
   (must be done before renewalDeadline, default 10 hours from notification)
```

### Trip Workflow (Day-Of)

```
Step 1: View your assigned trips
  GET /driver/trips?status=driver_assigned

Step 2: Accept a trip
  PATCH /driver/trips/:id/accept

Step 3: Upload selfie check-in (REQUIRED before starting trip)
  POST /driver/checkin (multipart/form-data, file + tripId)
  → Listen for driver:checkin:approved or driver:checkin:rejected via Socket
  → If rejected, retake selfie and resubmit

Step 4: Start the trip
  PATCH /driver/trips/:id/start
  → Will return 403 if no face-detected check-in exists for this trip

Step 5: Begin location streaming via Socket
  Emit: driver:location:update { latitude, longitude, speed, heading, tripId }

Step 6: Mark stations as you arrive/depart
  GET  /driver/trips/:id/stations           → see station list + progress
  PATCH /driver/trips/:id/stations/:stationId/arrived
  PATCH /driver/trips/:id/stations/:stationId/completed

Step 7: Board passengers as they get on
  GET  /shuttle/trips/:id/passengers        → see passenger manifest
  PATCH /driver/bookings/:id/board          → mark each passenger boarded
  PATCH /driver/bookings/:id/absent         → mark no-shows

Step 8: Complete the trip
  PATCH /driver/trips/:id/complete
  → Earnings auto-calculated and credited

Step 9: View earnings
  GET /driver/earnings
  GET /driver/wallet/balance
```

### Rejecting or Cancelling
```
PATCH /driver/trips/:id/reject   → send trip back to waiting_driver pool
PATCH /driver/trips/:id/cancel   → cancel with { reason: "..." }
```

### Earnings & Payout
```
GET  /driver/earnings             → summary
GET  /driver/earnings/history     → full paginated history
GET  /driver/wallet/balance       → available/paid/pending balance
GET  /driver/wallet/payout-methods → available payout methods
POST /driver/wallet/payout        → request payout { amount, method }
```

---

## 8. Passenger APIs

### Route Browsing
```
GET /shuttle/lines          → all active routes (requires auth)
GET /shuttle/lines/:id      → route detail + stations + upcoming trips (no auth)
GET /routes                 → all routes (no auth, includes inactive)
GET /routes/:id             → single route
GET /routes/:id/stations    → stops ordered by sequence
```

### Booking
```
POST /bookings              → create booking (wallet charged immediately)
  Body: { tripId, seatCount: 1, promoCode?: "CODE" }

GET  /bookings              → admin only; passengers use /bookings/:id
GET  /bookings/:id          → get own booking
PATCH /bookings/:id/cancel  → cancel and get wallet refund
```

### Tracking
```
Socket event: emit passenger:join:trip with tripId
→ Receive passenger:trip:tracking events with driver location
```

### Check Shuttle Status
```
GET /shuttle/lines/:id      → check shuttleStatus ("open"/"active"/"cancelled")
                              check bookedSeats, availableSeats, minRequired
```

---

## 9. Admin APIs

### Route Management
```
GET    /routes                  → list all routes
POST   /routes                  → create route
GET    /routes/:id              → get route
PATCH  /routes/:id              → update route
DELETE /routes/:id              → delete route (cascades trips+bookings)

GET    /routes/:id/stations     → list stations
POST   /routes/:id/stations     → add station
PATCH  /routes/:id/stations/:sid → update station
DELETE /routes/:id/stations/:sid → remove station
```

### Schedule & Trip Management
```
GET    /schedules               → list schedules
POST   /schedules               → create schedule (auto-generates trips)
GET    /schedules/:id           → schedule detail + trip stats
PATCH  /schedules/:id           → update schedule dates/status
POST   /schedules/:id/generate  → re-generate trips for a schedule
DELETE /schedules/:id           → deactivate schedule + cancel future trips

GET    /trips                   → list all trips (filterable)
POST   /trips                   → create manual trip
GET    /trips/:id               → trip detail
PATCH  /trips/:id               → update trip
PATCH  /trips/:id/cancel        → cancel trip
DELETE /trips/:id               → delete trip (not if active)
```

### Driver Shuttle Booking Management
```
GET    /admin/shuttle/bookings                       → all route bookings (filterable)
GET    /admin/shuttle/bookings/:id                   → single booking
PATCH  /admin/shuttle/bookings/:id/reassign          → move booking to different driver
PATCH  /admin/shuttle/bookings/:id/cancel            → cancel booking
PATCH  /admin/shuttle/bookings/:id/extend-window     → extend renewal deadline
GET    /admin/shuttle/availability                   → weekly availability matrix
GET    /admin/shuttle/renewal-history                → renewal notification history
```

### Time Slot Management
```
GET    /admin/shuttle/timeslots         → list all time slots
POST   /admin/shuttle/timeslots         → create time slot
PATCH  /admin/shuttle/timeslots/:id     → update time slot
DELETE /admin/shuttle/timeslots/:id     → delete time slot (if no active bookings)
```

### Passenger Boarding (Admin)
```
GET    /shuttle/trips/:id/passengers    → passenger manifest for trip
GET    /shuttle/lines/:id/passengers    → passengers for next trip on a line
POST   /shuttle/bookings/:id/board      → mark passenger boarded
```

### Booking Management
```
GET    /bookings                         → list all bookings (filterable)
GET    /bookings/:id                     → single booking
PATCH  /bookings/:id/cancel              → cancel booking + refund
```

### Check-in Monitoring
```
GET    /admin/checkins                   → all driver check-ins (filterable)
```

### User & Driver Management
```
GET    /admin/users                      → list all users
GET    /admin/users/:id                  → user detail
PATCH  /admin/users/:id                  → update user
POST   /admin/users/:id/toggle-block     → block/unblock user
GET    /drivers                          → list all drivers
GET    /drivers/:id                      → driver detail
```

### Settings
```
GET    /admin/settings/commission        → commission rates
PATCH  /admin/settings/commission        → update commission
GET    /admin/services/:type/settings    → service settings (car/shuttle/bike)
PATCH  /admin/services/:type/settings    → update service settings
GET    /admin/settings/surge             → surge pricing settings
PATCH  /admin/settings/surge             → update surge settings
```

---

## 10. Socket.IO Events

**Connection**: `io(BASE_URL, { path: "/api/socket.io", auth: { token: accessToken } })`

**Authentication**: JWT token passed in handshake auth. All connections require a valid token.

**Room Assignment on Connect** (automatic, no client action needed):
- `admin` role → joins `admin:room`
- `user` role → joins `passenger:<userId>` and `passengers:all`
- `driver` role → joins `driver:<userId>`; if online → also joins `drivers:available:<vehicleType>`

---

### Client → Server Events

---

#### `driver:location:update`
**Direction**: Driver → Server
**Payload**:
```json
{
  "latitude": 30.0444,
  "longitude": 31.2357,
  "speed": 60.5,
  "heading": 180.0,
  "tripId": 42
}
```
**Trigger**: Called repeatedly during active shift/trip (GPS loop)
**Effect**:
- Updates `drivers.currentLatitude/Longitude/Speed/Heading/locationUpdatedAt`
- Updates `buses.currentLatitude/Longitude` (if driver has assigned bus)
- Broadcasts `admin:track:trip` to admin room
- If `tripId` provided: broadcasts `passenger:trip:tracking` to `trip:<tripId>` room
- Emits `driver:location:ack` back to driver socket
**Consumer**: Admin dashboard real-time tracking, Passenger trip tracking

---

#### `driver:ride:location`
**Direction**: Driver → Server
**Payload**:
```json
{ "rideId": 7, "latitude": 30.0444, "longitude": 31.2357 }
```
**Trigger**: During an on-demand ride (not shuttle)
**Effect**:
- Sends `ride:driver_location` to `passenger:<passengerId>`
- Route deviation check: if >500m off pickup→dropoff line, emits `ride:deviation:warning` (once per 60s)
**Consumer**: Passenger app (on-demand rides)

---

#### `driver:trip:start`
**Direction**: Driver → Server
**Payload**: `tripId` (number)
**Trigger**: When driver starts a shuttle trip (supplemental to REST call)
**Effect**: Broadcasts `admin:track:trip` + `passenger:trip:tracking` with `{ event: "trip:started", tripId }`

---

#### `driver:trip:complete`
**Direction**: Driver → Server
**Payload**: `tripId` (number)
**Trigger**: When driver completes a trip (supplemental)
**Effect**: Broadcasts `admin:track:trip` + `passenger:trip:tracking` with `{ event: "trip:completed", tripId }`

---

#### `driver:status:online`
**Direction**: Driver → Server
**Payload**: None
**Trigger**: After calling `PATCH /driver/status/online`
**Effect**: Driver joins `drivers:available:<vehicleType>` room (for ride dispatch)

---

#### `driver:status:offline`
**Direction**: Driver → Server
**Payload**: None
**Trigger**: After calling `PATCH /driver/status/offline`
**Effect**: Driver leaves `drivers:available:<vehicleType>` room

---

#### `driver:status:busy`
**Direction**: Driver → Server
**Payload**: None
**Trigger**: When driver is occupied with a ride
**Effect**: Driver leaves availability room

---

#### `passenger:join:trip`
**Direction**: Passenger → Server
**Payload**: `tripId` (number)
**Trigger**: Passenger opens trip tracking view
**Effect**: Passenger socket joins `trip:<tripId>` room and receives subsequent `passenger:trip:tracking` events

---

#### `join`
**Direction**: Any → Server
**Payload**: `room` (string)
**Callback**: `{ ok: true }`
**Trigger**: Generic join request (used for ACK confirmation of socket readiness)
**Note**: Actual room joining for business logic happens automatically on connect — this is ACK-only

---

### Server → Client Events

---

#### `booking:boarded`
**Direction**: Server → Passenger
**Room**: `passenger:<userId>`
**Payload**:
```json
{
  "bookingId": "101",
  "passengerId": "33",
  "timestamp": "2026-06-10T08:15:00Z"
}
```
**Trigger**: When driver calls `PATCH /driver/bookings/:id/board` or `POST /shuttle/bookings/:id/board`
**Consumer**: Passenger app — show "You're boarded!" confirmation

---

#### `passenger:trip:tracking`
**Direction**: Server → Trip room members
**Room**: `trip:<tripId>`
**Payload** (location update):
```json
{
  "driverId": 5,
  "userId": 12,
  "latitude": 30.0444,
  "longitude": 31.2357,
  "speed": 60.5,
  "heading": 180.0,
  "tripId": 42,
  "timestamp": 1749550000000
}
```
**Payload** (trip lifecycle):
```json
{ "event": "trip:started", "tripId": 42, "timestamp": 1749550000000 }
{ "event": "trip:completed", "tripId": 42, "timestamp": 1749550000000 }
```
**Trigger**: On every `driver:location:update` with a tripId, and on trip start/complete socket events
**Consumer**: Passenger app live tracking map

---

#### `admin:track:trip`
**Direction**: Server → Admin room
**Room**: `admin:room`
**Payload**: Same as `passenger:trip:tracking` — driver GPS or lifecycle event
**Trigger**: Every driver location update; every trip start/complete
**Consumer**: Admin dashboard live map

---

#### `notification:new`
**Direction**: Server → User/Driver
**Room**: `passenger:<userId>` (used for both passenger and driver personal rooms)
**Payload**:
```json
{
  "id": "55",
  "category": "shuttle",
  "title": "Priority Renewal — Action Required",
  "body": "You have priority to rebook route \"Line A\" at 08:00 for next week...",
  "bookingId": 10,
  "deadlineIso": "2026-06-11T19:00:00Z",
  "time": "2026-06-10T09:00:00Z"
}
```
**Category values**: `"shuttle"`, `"shuttle_renewal"`, `"trip"`, and others
**Trigger**:
- Shuttle renewal job (every Wednesday 09:00 UTC): sends `shuttle_renewal` to drivers
- Trip auto-cancellation job: sends `trip` to passengers and drivers
- Admin reassign/cancel booking: sends `shuttle` to drivers
- Admin extend renewal window: sends `shuttle_renewal` to driver
**Consumer**: Driver app, Passenger app — notification inbox + push

---

#### `shuttle:booking:created`
**Direction**: Server → Driver
**Room**: `driver:<userId>`
**Trigger**: When a new shuttle route booking is confirmed
**Payload**: booking details
**Consumer**: Driver app

---

#### `shuttle:booking:cancelled`
**Direction**: Server → Driver
**Room**: `driver:<userId>` (via `passenger:<userId>` room in practice)
**Trigger**: Admin cancels a driver shuttle booking
**Consumer**: Driver app

---

#### `shuttle:renewal:confirmed`
**Direction**: Server → Driver
**Room**: driver room
**Trigger**: Driver confirms priority renewal
**Consumer**: Driver app

---

#### `shuttle:booking:reassigned`
**Direction**: Server → Old Driver + New Driver
**Room**: `passenger:<userId>` for each
**Payload**:
```json
{
  "bookingId": 10,
  "role": "unassigned",
  "routeName": "Line A",
  "departureTime": "08:00",
  "weekStart": "2026-06-08"
}
```
Role is `"unassigned"` for old driver, `"assigned"` for new driver.
**Trigger**: Admin calls `PATCH /admin/shuttle/bookings/:id/reassign`
**Consumer**: Driver app — update booking list UI

---

#### `driver:checkin:approved`
**Direction**: Server → Driver
**Room**: `driver:<userId>`
**Payload**:
```json
{ "checkinId": 55, "checkInType": "shuttle_trip_start", "submittedAt": "2026-06-10T07:45:00Z" }
```
**Trigger**: Driver submits selfie and face is detected
**Consumer**: Driver app — allow user to proceed to PATCH /driver/trips/:id/start

---

#### `driver:checkin:rejected`
**Direction**: Server → Driver
**Room**: `driver:<userId>`
**Payload**:
```json
{
  "checkinId": 56,
  "checkInType": "shuttle_trip_start",
  "submittedAt": "...",
  "reason": "No face detected in the image — please retake your selfie in a well-lit area."
}
```
**Trigger**: Driver submits selfie but no face is detected
**Consumer**: Driver app — show error and allow retry

---

#### `driver:checkin:required`
**Direction**: Server → Driver
**Room**: `driver:<userId>`
**Trigger**: Check-in monitor sets `checkInRequired=true` on the driver (periodic check)
**Consumer**: Driver app — show check-in prompt

---

#### `driver:location:ack`
**Direction**: Server → Driver (direct socket)
**Payload**: `{ ok: true }`
**Trigger**: After processing `driver:location:update`
**Consumer**: Driver app — confirm GPS was received

---

#### `surge:updated`
**Direction**: Server → All passengers
**Room**: `passengers:all`
**Payload**:
```json
{
  "vehicleType": "car",
  "multiplier": 1.5,
  "previousMultiplier": 1.0,
  "tier": "moderate",
  "ratio": 0.72,
  "isActive": true
}
```
**Trigger**: Surge pricing recalculation interval; also sent immediately on passenger connect
**Consumer**: Passenger app — show surge indicator on booking screen

---

#### `service:control:changed`
**Direction**: Server → All connected clients
**Trigger**: Admin changes service availability (enable/disable car/shuttle/bike)
**Consumer**: All apps

---

#### `service:settings:changed`
**Direction**: Server → All connected clients
**Trigger**: Admin updates service settings
**Consumer**: All apps

---

#### `driver:cooldown:cleared`
**Direction**: Server → Driver
**Room**: `driver:<userId>`
**Trigger**: Admin manually clears a driver's dispatch cooldown
**Consumer**: Driver app — refresh availability status

---

#### `ride:driver_assigned`
**Direction**: Server → Passenger
**Room**: `passenger:<userId>`
**Trigger**: On-demand ride: driver accepted
**Consumer**: Passenger app (on-demand rides)

---

#### `ride:driver_arrived`
**Direction**: Server → Passenger
**Trigger**: On-demand ride: driver arrived at pickup
**Consumer**: Passenger app

---

#### `ride:started`
**Direction**: Server → Passenger
**Trigger**: On-demand ride started
**Consumer**: Passenger app

---

#### `ride:completed`
**Direction**: Server → Passenger
**Trigger**: On-demand ride completed
**Consumer**: Passenger app

---

#### `ride:cancelled`
**Direction**: Server → Passenger
**Trigger**: On-demand ride cancelled
**Consumer**: Passenger app

---

#### `ride:driver_cancelled`
**Direction**: Server → Passenger
**Trigger**: Driver cancelled the on-demand ride
**Consumer**: Passenger app

---

#### `ride:driver_location`
**Direction**: Server → Passenger
**Room**: `passenger:<userId>`
**Payload**: `{ rideId, location: { latitude, longitude }, timestamp }`
**Trigger**: `driver:ride:location` event from driver (on-demand rides)
**Consumer**: Passenger app (on-demand tracking)

---

#### `ride:deviation:warning`
**Direction**: Server → Passenger + Admin + Driver
**Payload**:
```json
{
  "rideId": 7,
  "driverLat": 30.05,
  "driverLng": 31.25,
  "deviationMeters": 623,
  "detectedAt": "2026-06-10T08:30:00Z"
}
```
**Trigger**: Driver location >500m from pickup→dropoff line (throttled to once per 60s per ride)
**Consumer**: Passenger app (safety alert), Admin dashboard, Driver app (self-warning)

---

#### `ride:offer`
**Direction**: Server → Available Driver pool
**Room**: `drivers:available:<vehicleType>`
**Trigger**: New on-demand ride dispatched
**Consumer**: Driver app (on-demand rides)

---

#### `sos:triggered`
**Direction**: Server → Admin + Passenger
**Trigger**: SOS event triggered during a ride
**Consumer**: Admin dashboard, Passenger app

---

#### `error`
**Direction**: Server → Client (direct socket)
**Payload**: `{ message: "..." }`
**Trigger**: Invalid payload, auth error, or internal error in socket handler
**Consumer**: All apps — show error message

---

### Socket Room Reference

| Room | Members | Events Received |
|---|---|---|
| `admin:room` | All admin sockets | `admin:track:trip`, `admin:chat:new`, `ride:deviation:warning`, `sos:triggered` |
| `passenger:<userId>` | Single passenger | `booking:boarded`, `ride:*`, `notification:new`, `surge:updated`, `shuttle:booking:*` |
| `passengers:all` | All passenger sockets | `surge:updated`, `service:control:changed` |
| `driver:<userId>` | Single driver | `driver:checkin:*`, `driver:cooldown:cleared`, `shuttle:booking:*`, `notification:new` |
| `drivers:available:<type>` | Online drivers of that vehicle type | `ride:offer`, `ride:new_request`, `ride:offer_expired` |
| `trip:<tripId>` | Passengers who joined | `passenger:trip:tracking` |

---

## 11. Driver App Integration Checklist

| Feature | Backend Ready? | Endpoint | Socket Event | Notes |
|---|---|---|---|---|
| Register | ✅ | POST /driver/auth/register | — | Returns tokens + driver profile |
| Login | ✅ | POST /driver/auth/login | — | credential = email or phone |
| Logout | ✅ | POST /driver/auth/logout | — | Clears token + sets offline |
| View Profile | ✅ | GET /driver/me | — | Full driver record |
| Update Profile | ✅ | PATCH /driver/me | — | name, phone, vehicleType, license |
| View Assigned Vehicle | ✅ | GET /driver/me/vehicle | — | Returns bus details |
| Upload Documents | ✅ | POST /driver/me/documents | — | 9 document types |
| View Documents | ✅ | GET /driver/me/documents | — | — |
| Go Online | ✅ | PATCH /driver/status/online | driver:status:online | Emit socket event after REST call |
| Go Offline | ✅ | PATCH /driver/status/offline | driver:status:offline | — |
| Browse Shuttle Lines | ✅ | GET /shuttle/lines | — | Shows available time slots |
| View Time Slots | ✅ | GET /shuttle/timeslots/:routeId | — | Shows booked/free slots |
| Book Weekly Slot | ✅ | POST /shuttle/route-bookings | — | Claim route+timeslot for week |
| View My Bookings | ✅ | GET /shuttle/route-bookings | — | All weekly bookings |
| View Booking Detail | ✅ | GET /shuttle/route-bookings/:id | — | Single booking with route info |
| Cancel Booking | ✅ | DELETE /shuttle/route-bookings/:id | — | Only active/pending_renewal |
| Confirm Renewal | ✅ | POST /shuttle/route-bookings/:id/confirm-renewal | — | Creates next-week booking |
| Renewal Notification | ✅ | — | notification:new (category=shuttle_renewal) | Includes bookingId + deadline |
| View Assigned Trips | ✅ | GET /driver/trips | — | Filterable by status |
| View Trip Detail | ✅ | GET /driver/trips/:id | — | Includes passenger list |
| Accept Trip | ✅ | PATCH /driver/trips/:id/accept | — | scheduled/waiting_driver → driver_assigned |
| Reject Trip | ✅ | PATCH /driver/trips/:id/reject | — | Clears driverId |
| Selfie Check-in (periodic) | ✅ | POST /driver/checkin (no tripId) | driver:checkin:approved / rejected | Type: periodic_online |
| Selfie Check-in (trip) | ✅ | POST /driver/checkin (with tripId) | driver:checkin:approved / rejected | Type: shuttle_trip_start |
| Check-in Status | ✅ | GET /driver/checkin/status | — | checkInRequired, deadline, history |
| Start Trip | ✅ | PATCH /driver/trips/:id/start | driver:trip:start (emit) | Requires face-detected selfie for tripId |
| Stream GPS | ✅ | — | driver:location:update (emit) | Broadcasts to admin + trip room |
| View Stations | ✅ | GET /driver/trips/:id/stations | — | With progress status |
| Mark Arrived at Station | ✅ | PATCH /driver/trips/:id/stations/:sid/arrived | — | — |
| Mark Departed Station | ✅ | PATCH /driver/trips/:id/stations/:sid/completed | — | — |
| View Passenger Manifest | ✅ | GET /shuttle/trips/:id/passengers | — | Full booking list |
| Board Passenger | ✅ | PATCH /driver/bookings/:id/board | booking:boarded (emitted to pax) | — |
| Mark Passenger Absent | ✅ | PATCH /driver/bookings/:id/absent | — | — |
| Complete Trip | ✅ | PATCH /driver/trips/:id/complete | driver:trip:complete (emit) | Auto-calculates earnings |
| Cancel Trip | ✅ | PATCH /driver/trips/:id/cancel | — | Requires reason |
| View Earnings Summary | ✅ | GET /driver/earnings | — | Total + recent 10 |
| View Earnings History | ✅ | GET /driver/earnings/history | — | Paginated |
| View Wallet Balance | ✅ | GET /driver/wallet/balance | — | confirmed/paid/pending |
| View Payout Methods | ✅ | GET /driver/wallet/payout-methods | — | Static list |
| Request Payout | ✅ | POST /driver/wallet/payout | — | Marks earnings as paid |
| View Notifications | ✅ | GET /driver/notifications | notification:new (real-time) | Last 50 |
| View Ratings | ✅ | GET /driver/me/ratings | — | Avg + recent ratings |
| View Reviews | ✅ | GET /driver/reviews | — | From ride_events |
| Shuttle Reassignment Alert | ✅ | — | shuttle:booking:reassigned | Role: "unassigned" or "assigned" |
| Booking Cancelled Alert | ✅ | — | shuttle:booking:cancelled | Admin cancellation |
| Deviation Warning | ✅ | — | ride:deviation:warning | >500m off route |

---

## 12. Rider App Integration Checklist

| Feature | Backend Ready? | Endpoint | Socket Event | Notes |
|---|---|---|---|---|
| Register | ✅ | POST /auth/register | — | — |
| Login | ✅ | POST /auth/login | — | Blocked for role=admin |
| Logout | ✅ | POST /auth/logout | — | — |
| Browse Shuttle Lines | ✅ | GET /shuttle/lines | — | Requires auth |
| View Line Detail + Stations | ✅ | GET /shuttle/lines/:id | — | No auth needed |
| View Upcoming Trips | ✅ | GET /shuttle/lines/:id | — | activeTrips array in response |
| Check Trip Availability | ✅ | GET /trips?routeId=N&status=scheduled | — | Also via shuttle/lines/:id |
| Create Booking | ✅ | POST /bookings | — | Wallet charged; 1 seat only |
| View Booking | ✅ | GET /bookings/:id | — | — |
| Cancel Booking | ✅ | PATCH /bookings/:id/cancel | — | Auto-refund if paid |
| Apply Promo Code | ✅ | POST /bookings (promoCode field) | — | — |
| Trip Live Tracking | ✅ | — | passenger:trip:tracking | After emit passenger:join:trip |
| Subscribe to Trip Room | ✅ | — | emit passenger:join:trip | Send tripId |
| Boarding Confirmation | ✅ | — | booking:boarded | From driver's board action |
| Trip Auto-Cancel Alert | ✅ | — | notification:new (category=trip) | Wallet refunded |
| Surge Pricing Update | ✅ | — | surge:updated | On connect + on change |
| View Wallet Balance | ✅ | GET /auth/me or user profile | — | walletBalance in user object |
| View Wallet Transactions | ✅ | GET /wallet/transactions | — | Debit/credit/refund history |

---

## 13. Missing Integrations & Issues

### Severity: HIGH

| # | Issue | Location | Recommendation |
|---|---|---|---|
| 1 | **`GET /shuttle/assignments` has no auth** | `shuttle.ts:181` | The endpoint returns all driver names, phone numbers, ratings, and bus info with zero authentication. Add `authenticate` middleware. |
| 2 | **`driver:checkin:required` event has no visible trigger** | `socket-events.ts:49`, `checkin-monitor.ts` | The event is declared but `checkin-monitor.ts` logic is not visible in the socket handlers. The driver app must poll `GET /driver/checkin/status` as a fallback. |
| 3 | **Booking status defaults to "confirmed"** | `bookings.ts schema:25` | Schema default is `"confirmed"` but `POST /bookings` inserts `"pending"`. The schema and code are inconsistent — driver app should expect `"pending"` on new bookings. |
| 4 | **Supabase dependency for check-in upload** | `checkin.ts:18` | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars required. If not set, check-in uploads will fail silently. The driver app cannot start trips without this working. |

### Severity: MEDIUM

| # | Issue | Location | Recommendation |
|---|---|---|---|
| 5 | **Payout methods are static/mock** | `driver.ts:863-896` | `GET /driver/wallet/payout-methods` returns a hardcoded array. `POST /driver/wallet/payout` marks earnings as paid but does not actually process a payment. Driver app should present this as "request submitted" only. |
| 6 | **`POST /driver/wallet/payout-methods` and `DELETE /driver/wallet/payout-methods/:id` are no-ops** | `driver.ts:881-896` | These endpoints do not persist data. Any payout method the driver "adds" is forgotten on next request. |
| 7 | **Shuttle renewal notifications use `SOCKET_ROOMS.PASSENGER(userId)` for drivers** | `shuttle-renewal-job.ts:78`, `shuttle-job.ts:127` | The `notification:new` event is routed to the `passenger:<userId>` room, which only passengers join. Drivers join `driver:<userId>`. The driver app must listen on the correct room — it will receive this if the socket joins the passenger room too, or use the `notification:new` event on the driver personal room. **Verify your socket join logic.** |
| 8 | **`trip.status = "boarding"` is unused** | `trips.ts schema` | The enum value "boarding" exists but no endpoint transitions a trip to this state. Ignore this status value in the driver app. |
| 9 | **No QR code generation for bookings** | Entire codebase | There is no QR code API. Boarding is done by the driver tapping the booking in their manifest. The rider app cannot display a scannable QR for boarding. |

### Severity: LOW

| # | Issue | Location | Recommendation |
|---|---|---|---|
| 10 | **`GET /driver/reviews` reads from `ride_events` (JSONB metadata)** | `driver.ts:1022` | Reviews for shuttle trips are not in `ride_events`. Only on-demand ride reviews appear here. Shuttle-specific ratings should come from `GET /driver/me/ratings`. |
| 11 | **Renewal job only runs on Wednesday 09:00–10:00 UTC** | `shuttle-renewal-job.ts:91-94` | The renewal window logic only executes on Wednesdays in UTC hour 9. Ensure server timezone is UTC. |
| 12 | **`GET /shuttle/lines` filters `driverShuttleBookings` to "active" and "pending_renewal" only** | `shuttle.ts:128-133` | Expired or cancelled bookings are excluded from the slot display — this is correct behaviour but driver app should handle the case where their booking was expired and the slot is now free again. |
| 13 | **`trip.recurringType` is always "one_time"** | Schedules only create one_time trips | The enum has daily/weekdays/weekends/custom but schedules generate individual one_time trips. The driver app can ignore recurring type. |

---

## 14. Sample Payload Library

### Trip Object
```json
{
  "id": 42,
  "routeId": 1,
  "scheduleId": 3,
  "busId": 2,
  "driverId": 5,
  "departureTime": "2026-06-10T08:00:00.000Z",
  "arrivalTime": "2026-06-10T08:45:00.000Z",
  "availableSeats": 7,
  "totalSeats": 14,
  "price": 50.0,
  "status": "active",
  "vehicleType": "hiace",
  "isActive": true,
  "recurringType": "one_time",
  "weekdays": null,
  "cancelReason": null,
  "acceptedAt": "2026-06-10T07:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-10T07:00:00.000Z"
}
```

### Route Object
```json
{
  "id": 1,
  "name": "Cairo → Alexandria Express",
  "fromLocation": "Cairo (Tahrir Square)",
  "toLocation": "Alexandria (Sidi Gaber)",
  "estimatedDuration": 180,
  "basePrice": 50.0,
  "isActive": true,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

### Station Object
```json
{
  "id": 3,
  "routeId": 1,
  "name": "Giza Station",
  "latitude": 30.0131,
  "longitude": 31.2089,
  "order": 2,
  "direction": "outbound",
  "segmentPrice": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Booking Object
```json
{
  "id": 101,
  "userId": 33,
  "tripId": 42,
  "seatCount": 1,
  "totalPrice": 45.0,
  "status": "pending",
  "paymentStatus": "paid",
  "promoCodeId": null,
  "createdAt": "2026-06-09T20:00:00.000Z",
  "updatedAt": "2026-06-09T20:00:00.000Z",
  "shuttle": {
    "totalSeats": 14,
    "bookedSeats": 5,
    "availableSeats": 9,
    "minRequired": 7,
    "shuttleStatus": "open",
    "message": "Needs 2 more bookings to become active"
  }
}
```

### Driver Shuttle Booking (Weekly Route Booking)
```json
{
  "id": 10,
  "driverId": 5,
  "routeId": 1,
  "timeSlotId": 2,
  "weekStart": "2026-06-08",
  "weekEnd": "2026-06-12",
  "status": "active",
  "renewalNotifiedAt": null,
  "renewalDeadline": null,
  "renewalConfirmedAt": null,
  "cancelledAt": null,
  "cancelledBy": null,
  "cancelReason": null,
  "createdAt": "2026-06-05T10:00:00.000Z",
  "updatedAt": "2026-06-05T10:00:00.000Z",
  "route": {
    "id": 1,
    "name": "Cairo → Alexandria Express",
    "fromLocation": "Cairo (Tahrir Square)",
    "toLocation": "Alexandria (Sidi Gaber)"
  },
  "timeSlot": {
    "id": 2,
    "departureTime": "09:00"
  },
  "driver": {
    "id": 5,
    "name": "Ali Hassan",
    "phone": "01098765432"
  }
}
```

### Check-in Object
```json
{
  "id": 55,
  "driverId": 5,
  "tripId": 42,
  "checkInType": "shuttle_trip_start",
  "imageUrl": "https://your-project.supabase.co/storage/v1/object/public/uploads/checkins/driver_5/shuttle_trip_start/1749550000_abc123.jpg",
  "faceDetected": true,
  "submittedAt": "2026-06-10T07:45:00.000Z",
  "createdAt": "2026-06-10T07:45:00.000Z",
  "message": "Check-in accepted"
}
```

### Shuttle Status Socket Message (booking:boarded)
```json
{
  "bookingId": "101",
  "passengerId": "33",
  "timestamp": "2026-06-10T08:15:00.000Z"
}
```

### Notification Socket Message (shuttle_renewal)
```json
{
  "id": "200",
  "category": "shuttle_renewal",
  "title": "Priority Renewal — Action Required",
  "body": "You have priority to rebook route \"Cairo → Alexandria Express\" at 09:00 for next week. Confirm by Wed, 11 Jun 2026 19:00:00 GMT or it opens to others.",
  "bookingId": 10,
  "deadlineIso": "2026-06-11T19:00:00.000Z",
  "time": "2026-06-10T09:00:00.000Z"
}
```

### Driver Location Socket Payload
```json
{
  "driverId": 5,
  "userId": 12,
  "latitude": 30.0444,
  "longitude": 31.2357,
  "speed": 60.5,
  "heading": 182.0,
  "tripId": 42,
  "timestamp": 1749550000000
}
```

### Shuttle Booking Reassignment Socket Payload
```json
{
  "bookingId": 10,
  "role": "assigned",
  "routeName": "Cairo → Alexandria Express",
  "departureTime": "09:00",
  "weekStart": "2026-06-08"
}
```

---

## 15. Final Summary

| Component | Status | Ready For Driver App? | Ready For Rider App? |
|---|---|---|---|
| Driver Auth (register/login/logout) | ✅ Complete | ✅ Yes | N/A |
| Passenger Auth (register/login/logout) | ✅ Complete | N/A | ✅ Yes |
| Admin Auth | ✅ Complete | N/A | N/A |
| Route listing + stations | ✅ Complete | ✅ Yes | ✅ Yes |
| Time slot management | ✅ Complete | ✅ Yes (read) | ❌ Not exposed to passengers |
| Schedule generation (admin) | ✅ Complete | N/A | N/A |
| Trip listing + detail | ✅ Complete | ✅ Yes | ✅ Yes |
| Passenger booking creation | ✅ Complete | N/A | ✅ Yes |
| Booking cancellation + refund | ✅ Complete | N/A | ✅ Yes |
| Promo code support | ✅ Complete | N/A | ✅ Yes |
| Driver weekly route booking | ✅ Complete | ✅ Yes | N/A |
| Priority renewal flow | ✅ Complete | ✅ Yes (confirm-renewal endpoint) | N/A |
| Driver trip accept/reject | ✅ Complete | ✅ Yes | N/A |
| Driver selfie check-in (face detection) | ✅ Complete | ✅ Yes (Supabase required) | N/A |
| Trip start (gated by check-in) | ✅ Complete | ✅ Yes | N/A |
| Station progress tracking | ✅ Complete | ✅ Yes | N/A |
| Passenger boarding (driver side) | ✅ Complete | ✅ Yes | N/A |
| Passenger boarding (Socket notification) | ✅ Complete | N/A | ✅ Yes |
| Trip completion + earnings | ✅ Complete | ✅ Yes | N/A |
| Driver GPS streaming (Socket) | ✅ Complete | ✅ Yes | N/A |
| Passenger live trip tracking (Socket) | ✅ Complete | N/A | ✅ Yes |
| Surge pricing (Socket) | ✅ Complete | N/A | ✅ Yes |
| Driver earnings + wallet + payout | ⚠️ Partial | ⚠️ Payout is mock only | N/A |
| QR code for boarding | ❌ Not implemented | ❌ No | ❌ No |
| Driver ratings/reviews | ✅ Complete | ✅ Yes | N/A |
| Admin availability matrix | ✅ Complete | N/A | N/A |
| Admin reassign/cancel bookings | ✅ Complete | N/A | N/A |
| Admin check-in monitoring | ✅ Complete | N/A | N/A |
| Shuttle auto-cancel job (15 min) | ✅ Complete | — | ✅ Passengers refunded automatically |
| Renewal reminder job (Wed 09:00 UTC) | ✅ Complete | ✅ Yes (Socket + notification) | N/A |
| Route deviation detection | ✅ Complete (on-demand rides) | N/A | ✅ Safety alert |

### Missing for Fully Operational System

| Missing Item | Priority | Who Needs It |
|---|---|---|
| QR code generation for booking confirmation | HIGH | Passenger app, Driver app (scan-to-board flow) |
| Real payout processing (currently mock) | HIGH | Driver app |
| `driver:checkin:required` event trigger visible | MEDIUM | Driver app (periodic check-in gate) |
| Push notifications (FCM/APNS) integration | MEDIUM | All apps — `push_token` stored but no push sender found in source |
| `GET /shuttle/assignments` auth protection | MEDIUM | Security |
| `passenger:<userId>` room for driver shuttle notifications | MEDIUM | Driver app — renewal/cancel notifications route through this room |
| Booking status shown to passenger after trip activates | LOW | Passenger app — needs polling or Socket event to detect pending→confirmed transition |
| OTP phone verification flow | LOW | Passenger app — `otpCode` + `otpExpiresAt` fields exist but POST /auth/verify-otp not tested |
