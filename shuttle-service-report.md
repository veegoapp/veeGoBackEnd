# Shuttle Service Refactor Report

**Date:** 2026-06-05  
**Scope:** Shuttle service only — Car and Motorcycle services were NOT modified.

---

## 1. Files Changed (Shuttle Only)

| File | Change Type |
|------|-------------|
| `artifacts/api-server/src/routes/schedules.ts` | Modified |
| `artifacts/api-server/src/routes/bookings.ts` | Modified |
| `artifacts/api-server/src/routes/shuttle.ts` | Rewritten |
| `artifacts/api-server/src/lib/shuttle-job.ts` | **New file** |
| `artifacts/api-server/src/index.ts` | Modified (import + startup call) |

---

## 2. Logic Removed (Shuttle Only)

### From `shuttle.ts`
- `POST /shuttle/lines/:id/book` — Driver claiming a weekly time slot
- `POST /shuttle/lines/:id/activate` — Admin activating a line (advances trip to "boarding")
- `POST /shuttle/lines/:id/complete` — Admin marking active trips as completed
- `POST /shuttle/stops/:id/board` — Driver marking arrival at a stop
- `POST /shuttle/trips/:id/board-stop` — Driver recording stop progress
- `GET /shuttle/driver/bookings` — Driver's own shuttle bookings list

### From `schedules.ts`
- Trips are no longer generated with `status: "waiting_driver"` (removed)
- Variable capacity (`defaultCapacity`) for shuttle trips removed — replaced with fixed 14 seats
- Old `waiting` / `assigned` trip stat fields removed from schedule stats response

### Booking logic (from `bookings.ts`)
- `seatCount > 1` allowed per booking (shuttle now enforces exactly 1 seat per rider)
- `status: "confirmed"` on create removed — shuttle bookings start as `"pending"`

---

## 3. Logic Added (Shuttle Only)

### `schedules.ts`
- New trips generated with `status: "scheduled"` (represents OPEN state)
- Fixed capacity: `totalSeats = 14`, `availableSeats = 14` for all schedule-generated trips
- Schedule trip stats now report `open` (count of scheduled/waiting_driver) and `active` instead of `waiting`/`assigned`

### `bookings.ts`
- **Seat limit:** `seatCount` must equal `1` for every shuttle booking
- **Duplicate guard:** Same user cannot book the same trip twice (returns `409`)
- **Booking status:** Set to `"pending"` instead of `"confirmed"` on create
- **Auto-activation:** After each booking, total booked seats are counted; if `>= 7`, the trip is immediately promoted to `"active"` within the same transaction
- **Cancel revert:** When a booking is cancelled, remaining seats are recounted; if `< 7`, the trip is reverted from `"active"` back to `"scheduled"` (OPEN)
- **Booking response:** Includes a `shuttle` block with `{ totalSeats, bookedSeats, availableSeats, minRequired, shuttleStatus, message }`

### `shuttle.ts`
- `GET /shuttle/lines` now returns `openTrips`, `activeTrips`, `totalSeats: 14`, `minRequired: 7` per route
- `GET /shuttle/lines/:id` now returns booked seat counts per trip, with full shuttle metadata per trip
- All trip responses include `shuttleStatus`, `bookedSeats`, `availableSeats`, `minRequired`, `message`
- Status filter for passenger-facing endpoints updated to `["scheduled", "active"]` (OPEN + ACTIVE)

### `shuttle-job.ts` (new)
- Runs every **15 minutes**
- Scans trips with status `"scheduled"` or `"active"` departing within the next **8 hours**
- If `bookedSeats < 7` → cancels trip + cancels all bookings + refunds wallets + sends push notifications
- If `bookedSeats >= 7` and trip is still `"scheduled"` → promotes to `"active"`
- Wallet refunds and notifications use the same atomic DB patterns as the booking cancel endpoint
- Runs once on startup, then on the 15-minute interval

---

## 4. Updated Shuttle APIs Only

### `GET /shuttle/lines`
List all active shuttle routes with demand stats.

**Auth:** None  
**Query params:** None

**Response:**
```json
{
  "data": [
    {
      "id": 4,
      "name": "Ain Shams → El Maadi #1",
      "fromLocation": "Mazlaqan Ain Shams",
      "toLocation": "Misr Helwan Agriculture Rd",
      "estimatedDuration": 57,
      "basePrice": 25.0,
      "isActive": true,
      "stationCount": 6,
      "totalTrips": 3,
      "openTrips": 2,
      "activeTrips": 1,
      "totalSeats": 14,
      "minRequired": 7
    }
  ],
  "total": 1
}
```

---

### `GET /shuttle/lines/:id`
Route detail with per-trip booking stats.

**Auth:** None

**Response:**
```json
{
  "data": {
    "id": 4,
    "name": "Ain Shams → El Maadi #1",
    "basePrice": 25.0,
    "totalSeats": 14,
    "minRequired": 7,
    "stations": [ { "id": 1, "name": "Mazlaqan Ain Shams", "order": 1 } ],
    "activeTrips": [
      {
        "id": 101,
        "status": "scheduled",
        "shuttleStatus": "open",
        "departureTime": "2026-06-07T09:00:00.000Z",
        "arrivalTime": "2026-06-07T09:57:00.000Z",
        "price": 25.0,
        "totalSeats": 14,
        "bookedSeats": 4,
        "availableSeats": 10,
        "minRequired": 7,
        "message": "Needs 3 more bookings to become active"
      }
    ]
  }
}
```

---

### `POST /bookings`
Book a shuttle seat. Wallet is charged immediately.

**Auth:** Required (passenger)  
**Body:**
```json
{ "tripId": 101, "seatCount": 1, "promoCode": "SAVE10" }
```

> `seatCount` must be `1`. Any other value returns HTTP 400.

**Response `201`:**
```json
{
  "id": 55,
  "userId": 12,
  "tripId": 101,
  "seatCount": 1,
  "totalPrice": 25.0,
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

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | `seatCount` is not 1 |
| `400` | Trip not in bookable status |
| `400` | Insufficient wallet balance |
| `400` | No available seats |
| `409` | User already has a booking for this trip |
| `409` | Seat reservation race condition (safe to retry) |

---

### `PATCH /bookings/:id/cancel`
Cancel a booking. Wallet is refunded and trip status may revert to OPEN.

**Auth:** Required (own booking)

**Response `200`:**
```json
{
  "id": 55,
  "status": "cancelled",
  "paymentStatus": "refunded"
}
```

---

### `GET /shuttle/trips/:id/passengers`
Get all riders for a specific trip.

**Auth:** Required  
**Response:**
```json
{
  "tripId": 101,
  "tripStatus": "active",
  "shuttleStatus": "active",
  "totalSeats": 14,
  "bookedSeats": 8,
  "availableSeats": 6,
  "minRequired": 7,
  "data": [ { "bookingId": 55, "userName": "Ahmed Ali", "status": "pending" } ],
  "total": 8
}
```

---

## 5. Sample Shuttle API Responses

### Booking when trip has exactly 7 riders (auto-activates)

**POST `/bookings`** → `201`:
```json
{
  "id": 62,
  "tripId": 101,
  "status": "pending",
  "paymentStatus": "paid",
  "totalPrice": 25.0,
  "shuttle": {
    "totalSeats": 14,
    "bookedSeats": 7,
    "availableSeats": 7,
    "minRequired": 7,
    "shuttleStatus": "active",
    "message": "Trip is confirmed — boarding guaranteed"
  }
}
```

### Booking when trip is full (14 riders)

**POST `/bookings`** → `400`:
```json
{ "error": "Not enough available seats — this trip is fully booked" }
```

### Duplicate booking attempt

**POST `/bookings`** → `409`:
```json
{ "error": "You already have an active booking for this trip" }
```

### Schedule stats

**GET `/schedules/:id`** → `200` (relevant field):
```json
{
  "tripStats": {
    "total": 10,
    "open": 7,
    "active": 2,
    "completed": 0,
    "cancelled": 1
  }
}
```

---

## 6. Status Flow

```
Trip created by schedule
         │
         ▼
    ┌─────────┐
    │  OPEN   │  (DB: "scheduled")
    │ < 7     │  Booking status = pending
    │ booked  │  Visible and bookable by riders
    └────┬────┘
         │ bookedSeats >= 7
         │ (triggered on each POST /bookings)
         ▼
    ┌─────────┐
    │ ACTIVE  │  (DB: "active")
    │ >= 7    │  Trip is guaranteed to run
    │ booked  │  Still bookable up to 14 seats
    └────┬────┘
         │
         │  If cancellations drop back below 7: ──► OPEN again
         │  (triggered on PATCH /bookings/:id/cancel)
         │
         │ Background job: within 8 hours of departure
         ▼
    ┌─────────────┐
    │  CANCELLED  │  (DB: "cancelled")
    │  bookedSeats│  All bookings cancelled
    │   < 7       │  Wallets refunded
    └─────────────┘  Push notifications sent
```

**Background job timing:**
- Runs every **15 minutes**
- Looks ahead **8 hours** from now
- Trips still OPEN at departure − 8h are cancelled automatically

---

## 7. Confirmation: Car & Motorcycle Not Modified

| Service | Data table | Changed? |
|---------|-----------|---------|
| **Shuttle** | `tripsTable`, `bookingsTable` | ✅ Yes — as documented above |
| **Car** | `ridesTable` | ❌ No — zero changes |
| **Motorcycle** | `ridesTable` | ❌ No — zero changes |

Car and Motorcycle services use `ridesTable` (not `tripsTable`) and their own routes in `artifacts/api-server/src/routes/rides.ts`. That file was **not touched** in this refactor.

Verified by checking that:
- `rides.ts` — no changes made
- `ridesTable` — not referenced in any modified file
- `ride-timeout.ts`, `dispatch-manager.ts`, `surge-pricing.ts`, `waiting-timer.ts`, `no-show-monitor.ts` — all unchanged

---

*Report generated automatically after shuttle refactor — 2026-06-05*
