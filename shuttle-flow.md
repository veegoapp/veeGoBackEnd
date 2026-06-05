# Shuttle Trip Scheduling & Booking Flow

A complete reference for how shuttle lines, stations, trips, and bookings work — from admin creation through passenger booking to driver execution.

---

## 1. Admin Side — Creating Lines, Stations, and Scheduled Trips

### 1.1 Create a Shuttle Line (Route)

**Endpoint:** `POST /routes`
**Auth:** Admin JWT required
**Request body:**
```json
{
  "name": "Cairo → Alexandria",
  "fromLocation": "Cairo",
  "toLocation": "Alexandria",
  "estimatedDuration": 120,
  "basePrice": 75.00,
  "isActive": true
}
```
**Response:** The created route object with a numeric `id`.

**Notes:**
- `estimatedDuration` is in **minutes**.
- `basePrice` is stored as a decimal string in the DB and returned as a float.
- `isActive` defaults to `true`.

---

### 1.2 Add Stations to a Line

**Endpoint:** `POST /routes/:id/stations`
**Auth:** Admin JWT required
**Request body:**
```json
{
  "name": "Cairo Station",
  "order": 1,
  "latitude": 30.0626,
  "longitude": 31.2497,
  "direction": "outbound",
  "segmentPrice": null
}
```
**Response:** The created station object.

**Notes:**
- `order` determines stop sequence (ascending).
- `direction` is `"outbound"` or `"return"`.
- `segmentPrice` (optional) overrides the route's `basePrice` for passengers boarding at this specific station.
- Update via `PATCH /routes/:id/stations/:stationId`.
- Delete via `DELETE /routes/:id/stations/:stationId`.
- List all stations via `GET /routes/:id/stations` (ordered by `order`).

---

### 1.3 Schedule Trips via a Recurring Schedule

This is the primary way an admin pre-generates trips for an entire date range.

**Endpoint:** `POST /schedules`
**Auth:** Admin JWT required
**Request body:**
```json
{
  "routeId": 1,
  "effectiveFrom": "2026-06-01",
  "effectiveTo": "2026-08-31",
  "defaultCapacity": 40,
  "slots": [
    { "dayOfWeek": 0, "departureTime": "07:00" },
    { "dayOfWeek": 0, "departureTime": "14:00" },
    { "dayOfWeek": 1, "departureTime": "07:00" }
  ]
}
```
**Response:**
```json
{
  "schedule": { "id": 5, "routeId": 1, "effectiveFrom": "...", "effectiveTo": "...", "defaultCapacity": 40, "isActive": true, ... },
  "slots": [ ... ],
  "tripsCreated": 74
}
```

**What happens internally:**
1. A `route_schedules` record is created.
2. One `schedule_slots` record is created per slot (stores `dayOfWeek` + `departureTime`).
3. `generateTripsForSchedule()` iterates every calendar day from `effectiveFrom` to `effectiveTo`, finds which days match the configured `dayOfWeek` values, computes the exact UTC `departureTime` and `arrivalTime` (= departure + `estimatedDuration` minutes), and batch-inserts trip rows (up to 500 at a time).
4. All auto-generated trips start with status **`waiting_driver`** — no driver or bus is assigned yet.

**`dayOfWeek` values:** 0 = Sunday, 1 = Monday … 6 = Saturday.

---

### 1.4 Manually Create a Single Trip (Admin)

**Endpoint:** `POST /trips`
**Auth:** Admin JWT required
**Request body:**
```json
{
  "routeId": 1,
  "busId": 3,
  "driverId": 7,
  "departureTime": "2026-06-10T07:00:00Z",
  "arrivalTime": "2026-06-10T09:00:00Z",
  "price": 75.00,
  "status": "scheduled"
}
```
**Response:** The created trip. `totalSeats` and `availableSeats` are set automatically from the bus's `capacity`.

---

### 1.5 Regenerate Trips for an Existing Schedule

**Endpoint:** `POST /schedules/:id/generate`
**Auth:** Admin JWT required
**Body:** _(empty)_

Re-runs trip generation for the schedule's full date range, skipping any departure times already in the DB (idempotent).

---

### 1.6 Activate a Shuttle Line

**Endpoint:** `POST /shuttle/lines/:id/activate`
**Auth:** Admin JWT required

Sets `routes.isActive = true` and advances the next `scheduled` or `driver_assigned` trip on that line to **`boarding`** status.

---

### 1.7 Complete All Active Trips on a Line

**Endpoint:** `POST /shuttle/lines/:id/complete`
**Auth:** Admin JWT required

Sets all `active`, `boarding`, and `driver_assigned` trips on that line to **`completed`**, and marks all `confirmed` or `boarded` bookings as **`completed`**.

---

### 1.8 Cancel a Trip

**Endpoint:** `PATCH /trips/:id/cancel`
**Auth:** Admin JWT required

Sets the trip's status to **`cancelled`**. Does not automatically refund bookings — a separate cancellation flow on bookings handles that.

---

### 1.9 Deactivate a Schedule

**Endpoint:** `DELETE /schedules/:id`
**Auth:** Admin JWT required

- Marks the schedule `isActive = false`.
- Cancels all **future** `waiting_driver` or `scheduled` trips linked to that schedule (sets their status to `cancelled`, sets `cancelReason = "Schedule deactivated by admin"`).
- Trips already `active`, `completed`, or `cancelled` are untouched.

---

## 2. Database — Key Tables and Fields

### `routes` (Shuttle Lines)
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `name` | text | e.g. "Cairo → Alexandria" |
| `fromLocation` | text | Origin label |
| `toLocation` | text | Destination label |
| `estimatedDuration` | int | Minutes |
| `basePrice` | numeric string | Default ticket price |
| `isActive` | boolean | Whether the line is open for booking |
| `createdAt` / `updatedAt` | timestamp | |

---

### `stations`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `routeId` | int FK → routes | |
| `name` | text | Stop name |
| `order` | int | Sequence within the route |
| `latitude` / `longitude` | float | GPS coordinates |
| `direction` | enum | `outbound` or `return` |
| `segmentPrice` | numeric string \| null | Per-stop price override |

---

### `route_schedules`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `routeId` | int FK → routes | |
| `effectiveFrom` / `effectiveTo` | date | Date range (YYYY-MM-DD) |
| `defaultCapacity` | int | Seats for auto-generated trips |
| `isActive` | boolean | |
| `createdAt` / `updatedAt` | timestamp | |

---

### `schedule_slots`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `scheduleId` | int FK → route_schedules | |
| `dayOfWeek` | int | 0 = Sun … 6 = Sat |
| `departureTime` | text | "HH:MM" |

---

### `trips`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `routeId` | int FK → routes | |
| `scheduleId` | int FK \| null | Set when auto-generated |
| `busId` | int FK \| null | Assigned bus |
| `driverId` | int FK \| null | Assigned driver |
| `departureTime` | timestamp UTC | |
| `arrivalTime` | timestamp UTC | |
| `availableSeats` | int | Decremented on booking, incremented on cancellation |
| `totalSeats` | int | Bus capacity snapshot |
| `price` | numeric string | Per-seat price |
| `status` | enum | See §5 |
| `recurringType` | text \| null | `"weekdays"` for driver self-booked trips |
| `weekdays` | text \| null | `"0,1,2,3,4"` for Sun–Thu |
| `startedAt` / `completedAt` / `cancelledAt` / `acceptedAt` | timestamp | Event timestamps |
| `cancelReason` / `cancelNote` | text | Populated on cancellation |
| `isActive` | boolean | |

---

### `bookings`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `userId` | int FK → users | Passenger |
| `tripId` | int FK → trips | |
| `seatCount` | int | Seats reserved |
| `totalPrice` | numeric string | After any promo discount |
| `status` | enum | See §5 |
| `paymentStatus` | enum | `pending`, `paid`, `refunded` |
| `promoCodeId` | int \| null | Applied promo |
| `createdAt` | timestamp | |

---

### `trip_station_progress`
Tracks the bus's progress through each stop on an active trip.
| Column | Notes |
|---|---|
| `tripId` + `stationId` | Composite PK |
| `status` | `pending`, `arrived`, `completed` |
| `arrivedAt` / `completedAt` | Timestamps |

---

### `trip_events`
Append-only event log for a trip.
| Column | Notes |
|---|---|
| `tripId` | |
| `type` | `TRIP_STARTED`, `TRIP_COMPLETED`, `TRIP_CANCELLED`, `DRIVER_ACCEPTED`, `LOCATION_UPDATE`, `BOARDING_STOP` |
| `metadata` | JSON payload |

---

## 3. Passenger Side — Viewing Routes and Booking

### 3.1 List All Active Shuttle Lines

**Endpoint:** `GET /shuttle/lines`
**Auth:** None required
**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Cairo → Alexandria",
      "fromLocation": "Cairo",
      "toLocation": "Alexandria",
      "estimatedDuration": 120,
      "basePrice": 75.0,
      "isActive": true,
      "stationCount": 4,
      "totalTrips": 12,
      "scheduledTrips": 10,
      "activeTrips": 2
    }
  ],
  "total": 1
}
```
Each line is enriched with a station count and live trip statistics (scheduled + active + boarding).

---

### 3.2 Get a Single Shuttle Line Detail

**Endpoint:** `GET /shuttle/lines/:id`
**Auth:** None required
**Response:** Full route fields + `stations` array (ordered by `order`) + `activeTrips` array (up to 10 upcoming trips in statuses: `waiting_driver`, `scheduled`, `active`, `boarding`, `driver_assigned`).

---

### 3.3 List All Available Trips

**Endpoint:** `GET /trips`
**Auth:** None required
**Query params:**
| Param | Type | Notes |
|---|---|---|
| `routeId` | int | Filter by route |
| `status` | string | e.g. `scheduled`, `active` |
| `date` | string | YYYY-MM-DD — matches trips departing on this date |
| `page` | int | Default 1 |
| `limit` | int | Default 20, max configurable |

---

### 3.4 Book a Trip (Passenger)

**Endpoint:** `POST /bookings`
**Auth:** Passenger JWT required
**Request body:**
```json
{
  "tripId": 42,
  "seatCount": 2,
  "promoCode": "SUMMER10"
}
```
**Response:** The created booking object (status = `confirmed`, paymentStatus = `paid`).

**What happens inside a DB transaction (SELECT FOR UPDATE — overbooking-safe):**
1. Lock the trip row.
2. Validate trip status is `scheduled` or `active`.
3. Validate `availableSeats >= seatCount`.
4. Calculate `totalPrice = trip.price × seatCount`.
5. If `promoCode` is provided and valid (active, not expired, under usage cap): apply `percentage` or `flat` discount; increment `promo_codes.usedCount`.
6. Lock the user row; verify `wallet_balance >= totalPrice` — returns `400 Insufficient wallet balance` if not.
7. Decrement `trips.available_seats` by `seatCount`.
8. Insert `bookings` row with `status = "confirmed"`, `paymentStatus = "paid"`.
9. Deduct `totalPrice` from `users.wallet_balance`.
10. Insert a `wallet_transactions` record (type = `"payment"`).
11. Insert a `payments` record (method = `"wallet"`, status = `"completed"`).

**Error responses:**
- `404` — trip or user not found
- `400` — trip not bookable, not enough seats, or insufficient wallet balance
- `409` — concurrent seat conflict

---

### 3.5 Cancel a Booking (Passenger or Admin)

**Endpoint:** `PATCH /bookings/:id/cancel`
**Auth:** JWT (own booking or admin)

Inside a transaction:
1. Set booking `status = "cancelled"`, `paymentStatus = "refunded"`.
2. Increment `trips.available_seats` by `seatCount`.
3. If `paymentStatus` was `"paid"`: credit `users.wallet_balance`, insert `wallet_transactions` (type = `"refund"`), insert `payments` (status = `"refunded"`).

---

## 4. Driver Side — Discovering and Running Trips

### 4.1 Driver Self-Book a Shuttle Slot

A driver can proactively claim a recurring slot on a line for a given week.

**Endpoint:** `POST /shuttle/lines/:id/book`
**Auth:** Driver JWT required
**Request body:**
```json
{
  "weekStart": "2026-06-08",
  "weekEnd": "2026-06-14",
  "departureTime": "07:00"
}
```
**Rules enforced:**
- Driver must have an `assignedBusId` on their profile.
- `departureTime` must be one of the allowed slots: `07:00`, `08:00`, `09:00`, `10:00`, `13:00`, `14:00`, `15:00`, `16:00`.
- No other non-cancelled trip may exist for the same route + week + time slot.
- The route must be `isActive = true`.

**What happens:** Creates a trip with `status = "scheduled"`, `recurringType = "weekdays"`, `weekdays = "0,1,2,3,4"`. Seat count comes from the bus's `capacity`.

---

### 4.2 Driver Views Their Assigned Trips

**Endpoint:** `GET /driver/trips`
**Auth:** Driver JWT required
**Query params:** `status`, `page`, `limit`

Returns trips where `trips.driverId = driver.id`. Supports filtering by any trip status.

---

### 4.3 Driver Accepts a Trip

**Endpoint:** `PATCH /driver/trips/:id/accept`
**Auth:** Driver JWT required

- Trip must be in `scheduled` or `waiting_driver` status.
- Sets trip status to **`driver_assigned`**, records `acceptedAt`.
- Appends a `DRIVER_ACCEPTED` event to `trip_events`.

---

### 4.4 Driver Rejects a Trip

**Endpoint:** `PATCH /driver/trips/:id/reject`
**Auth:** Driver JWT required

- Clears `driverId` from the trip (sets to NULL) and sets status back to **`waiting_driver`** so another driver can be assigned.

---

### 4.5 Driver Check-In (Selfie Gate)

Before starting a trip, the driver must submit a face-detected selfie.

**Endpoint:** `POST /driver/checkin`
**Auth:** Driver JWT required
**Body:** `multipart/form-data` with:
- `file` — selfie image (JPEG/PNG/WebP, max 8 MB)
- `tripId` — numeric string (for shuttle trips)

**What happens:**
1. Selfie is uploaded to Supabase storage at `checkins/driver_{id}/shuttle_trip_start/{filename}`.
2. Face detection runs on the image buffer.
3. If face detected: clears `checkInRequired` flag and `checkInDeadline` on the driver; emits `DRIVER_CHECKIN_APPROVED` socket event.
4. If no face: emits `DRIVER_CHECKIN_REJECTED` with a reason message.
5. A `driver_check_ins` record is always inserted (`faceDetected: boolean`).

---

### 4.6 Driver Starts a Trip

**Endpoint:** `PATCH /driver/trips/:id/start`
**Auth:** Driver JWT required

**Gate:** A `driver_check_ins` record with `faceDetected = true` and the matching `tripId` must exist — returns `403 Selfie check-in required` otherwise.

**What happens:**
1. Driver status → `"busy"`.
2. Trip status → **`active`**, `startedAt = now()`.
3. `TRIP_STARTED` event inserted.
4. All stations for the route are pre-inserted into `trip_station_progress` with `status = "pending"` (idempotent via ON CONFLICT DO NOTHING).

---

### 4.7 Driver Arrives at a Station

**Endpoint:** `PATCH /driver/trips/:id/stations/:stationId/arrived`
**Auth:** Driver JWT required

Upserts the `trip_station_progress` record for that station to `status = "arrived"`, `arrivedAt = now()`.

---

### 4.8 Driver Boards a Passenger

**Endpoint:** `PATCH /driver/bookings/:id/board`
**Auth:** Driver JWT required

- Booking must be `confirmed` or `pending`, and its trip must belong to this driver.
- Sets `bookings.status = "boarded"`.
- Emits `BOOKING_BOARDED` socket event to `passenger:{userId}`.

---

### 4.9 Driver Marks a Passenger Absent

**Endpoint:** `PATCH /driver/bookings/:id/absent`
**Auth:** Driver JWT required

Sets `bookings.status = "absent"`. Used when a confirmed passenger doesn't show up.

---

### 4.10 Driver Completes a Station Stop

**Endpoint:** `PATCH /driver/trips/:id/stations/:stationId/completed`
**Auth:** Driver JWT required

Upserts the station progress to `status = "completed"`, `completedAt = now()`.

---

### 4.11 Driver Completes the Trip

**Endpoint:** `PATCH /driver/trips/:id/complete`
**Auth:** Driver JWT required

- Trip must be in `active` status.
- Sets trip status to **`completed`**, `completedAt = now()`.
- Driver status → `"online"`.
- All `confirmed` bookings for this trip are set to `"completed"`.
- `TRIP_COMPLETED` event inserted.
- Earnings calculated: `driverCut = tripPrice × (1 - commissionRate)` where `commissionRate` is read from the `settings` table (key `driver_commission_rate`, default 0.15 = 15%). A `driver_earnings` record is inserted with `status = "confirmed"`.

---

### 4.12 Driver Gets Passenger List for a Trip

**Endpoint:** `GET /shuttle/trips/:id/passengers`
**Auth:** JWT required (driver or admin)

Returns all `confirmed`, `boarded`, `absent`, and `completed` bookings for the trip, with passenger name, phone, email, and a `boarded: boolean` flag.

**Alternate (by line):** `GET /shuttle/lines/:id/passengers` — resolves the most recent active/boarding trip for that line and proxies to the same logic.

---

### 4.13 Driver Marks a Bus Stop as Reached (Board-Stop)

**Endpoint:** `POST /shuttle/trips/:id/board-stop`
**Auth:** JWT required
**Body:**
```json
{ "stationId": 3 }
```

Upserts `trip_station_progress` to `arrived`, inserts a `LOCATION_UPDATE` event with `event: "board_stop"`, and returns the count of currently `boarded` passengers.

---

## 5. Trip Lifecycle — Statuses and Transitions

### Trip Statuses

| Status | Meaning |
|---|---|
| `waiting_driver` | Auto-generated by a schedule; no driver assigned yet |
| `scheduled` | Admin-created or driver self-booked; driver assigned, not yet started |
| `driver_assigned` | Driver accepted the trip (`DRIVER_ACCEPTED`) |
| `boarding` | Line activated by admin; passengers may board (transitional pre-departure) |
| `active` | Driver has started the trip — bus is en route |
| `completed` | Trip finished (driver or admin action) |
| `cancelled` | Cancelled by admin, driver, or schedule deactivation |

### Trip Status Transition Map

```
[Schedule created]
       │
       ▼
 waiting_driver ──── Driver self-book ──────► scheduled
       │                                          │
       │ Driver assigns / accepts                 │ Driver accepts
       ▼                                          ▼
 driver_assigned ◄──────────────────────────────────
       │
       │ Admin activates line
       ▼
   boarding
       │
       │ Driver starts trip (after selfie check-in)
       ▼
    active
       │
       ├─── Driver completes ──► completed
       ├─── Driver cancels ────► cancelled
       └─── Admin completes ───► completed

Any non-terminal status ──── Admin cancel ──► cancelled
waiting_driver/scheduled ─── Schedule deactivated ──► cancelled
```

### Triggers for Each Transition

| From → To | Trigger |
|---|---|
| _(none)_ → `waiting_driver` | `POST /schedules` or `POST /schedules/:id/generate` |
| _(none)_ → `scheduled` | `POST /trips` (admin) or `POST /shuttle/lines/:id/book` (driver) |
| `waiting_driver` / `scheduled` → `driver_assigned` | `PATCH /driver/trips/:id/accept` |
| `driver_assigned` → `boarding` | `POST /shuttle/lines/:id/activate` |
| `driver_assigned` / `boarding` → `active` | `PATCH /driver/trips/:id/start` (requires face check-in) |
| `active` → `completed` | `PATCH /driver/trips/:id/complete` or `POST /shuttle/lines/:id/complete` |
| `driver_assigned` / `waiting_driver` → `waiting_driver` | `PATCH /driver/trips/:id/reject` (clears driverId) |
| any non-terminal → `cancelled` | `PATCH /trips/:id/cancel` (admin) or `PATCH /driver/trips/:id/cancel` (driver) or schedule deactivation |

---

### Booking Statuses

| Status | Meaning |
|---|---|
| `pending` | Created but not yet paid (rare — default flow goes straight to `confirmed`) |
| `confirmed` | Payment successful; seat reserved |
| `boarded` | Driver scanned / marked passenger as on board |
| `absent` | Passenger did not show up |
| `completed` | Trip completed; booking closed |
| `cancelled` | Passenger or admin cancelled; wallet refunded if `paymentStatus = "paid"` |

### Booking Status Transition Map

```
confirmed ──── Driver boards passenger ──► boarded
confirmed ──── Driver marks absent ──────► absent
confirmed/boarded ──── Trip completed ──► completed
confirmed/pending ──── Cancel ──────────► cancelled (+ wallet refund)
```

### Payment Status for Bookings

| Value | When |
|---|---|
| `pending` | Initial state before wallet deduction (not reached in normal flow) |
| `paid` | Wallet deducted successfully at booking creation |
| `refunded` | Booking cancelled after payment; wallet credited back |

---

## 6. Socket Events Relevant to Shuttle

| Event | Emitted to | When |
|---|---|---|
| `DRIVER_CHECKIN_APPROVED` | `driver:{userId}` | Selfie accepted (face detected) |
| `DRIVER_CHECKIN_REJECTED` | `driver:{userId}` | Selfie rejected (no face) |
| `BOOKING_BOARDED` | `passenger:{userId}` | Driver marks passenger boarded |

---

## 7. Summary Flow Diagrams

### Admin Creates a Line and Schedules Trips

```
POST /routes                     → creates route (id: N)
POST /routes/N/stations          → adds stops (repeat per station)
POST /schedules                  → creates schedule + slots + batch-inserts trips
                                    (all trips start as waiting_driver)
POST /shuttle/lines/N/activate   → opens line; first trip advances to boarding
```

### Driver Picks Up a Slot and Runs a Trip

```
POST /shuttle/lines/N/book       → driver claims a weekly slot → trip: scheduled
PATCH /driver/trips/:id/accept   → trip: driver_assigned
POST /driver/checkin             → selfie check-in (face must be detected for this tripId)
PATCH /driver/trips/:id/start    → trip: active; station progress rows created
PATCH /driver/trips/:id/stations/:s/arrived   → station: arrived
PATCH /driver/bookings/:b/board  → booking: boarded (per passenger)
PATCH /driver/trips/:id/stations/:s/completed → station: completed
PATCH /driver/trips/:id/complete → trip: completed; bookings: completed; earnings recorded
```

### Passenger Books and Rides

```
GET /shuttle/lines               → browse active lines
GET /shuttle/lines/:id           → see line detail + stations + upcoming trips
GET /trips?routeId=N&date=...    → pick a specific trip
POST /bookings                   → book seats (wallet charged in-transaction)
  → confirm via booking.status = "confirmed"
[Board bus]
  ← BOOKING_BOARDED socket event when driver scans
PATCH /bookings/:id/cancel       → cancel and get wallet refund (if trip not yet completed)
```
