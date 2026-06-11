# Phase 4 Mobile Report — VeeGo Shuttle System

## Overview

Phase 4 adds 7 improvements to the shuttle system: a full rating system, trip history for both
passengers and drivers, passenger cancellation with refund logic, corrected "trip full" messaging,
booking confirmation notifications, and an invite-friends background job.

---

## Fix 1 — Rating System

### New DB table: `shuttle_ratings`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| tripId | int FK→trips | cascade delete |
| raterId | int FK→users | the user submitting the rating |
| rateeId | int FK→users | the user being rated |
| stars | smallint | 1–5, enforced by CHECK constraint |
| createdAt | timestamptz | |
| uq_shuttle_rating_trip_rater | unique | (tripId, raterId) — one rating per trip per rater |

### POST /shuttle/ratings
**Auth:** `authenticate` (passenger or driver)

**Body:**
```json
{ "tripId": 42, "rateeId": 7, "stars": 5 }
```

**Rules:**
- **Passenger (role=user):** `rateeId` must equal the driver's `userId` for that trip. Passenger must have an existing booking on the trip.
- **Driver:** `rateeId` must be a user who has a `boarded` or `completed` booking on this trip. Caller must be the trip's assigned driver.
- **Deduplication:** a rater can only submit one rating per trip (returns `400 "Already rated."` on duplicates).
- **Side effect:** when a passenger rates the driver, the driver's `rating` column is recalculated as `AVG(stars)` across all shuttle ratings received.

**Trigger — rating request notifications on trip completion (`PATCH /driver/trips/:id/complete`):**
After the trip is marked complete and earnings are recorded, the server:
1. Queries all bookings with status `boarded` or `completed` for that trip.
2. Sends each passenger a `notification:new` event via Socket.IO (room `passenger:<userId>`) with `category: "rating"` and `tripId` in the payload.
3. Sends the driver (room `driver:<userId>`) a `notification:new` event prompting them to rate passengers.

Both notifications are persisted in the `notifications` table. Failures are caught and logged; they do not affect the trip completion response.

---

## Fix 2 — Passenger Trip History

### GET /shuttle/my-trips
**Auth:** `authenticate` + `requireRole("user")`

**Query params:** `page` (default 1), `limit` (default 10, max 50)

**Response:**
```json
{
  "data": [
    {
      "tripId": 42,
      "bookingId": 101,
      "routeName": "Maadi → New Cairo",
      "date": "2026-06-14",
      "departureTime": "2026-06-14T07:30:00.000Z",
      "driverName": "Ahmed Hassan",
      "driverRating": 4.7,
      "status": "boarded",
      "ticketPrice": 35.00,
      "paymentStatus": "paid",
      "passengerRating": 5
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 10
}
```

`passengerRating` is the star rating this passenger gave for that trip, or `null` if not yet rated.
Results are ordered by `departureTime DESC`.

---

## Fix 3 — Driver Trip History

### GET /shuttle/driver/my-trips
**Auth:** `authenticate` + `requireRole("driver")`

**Query params:** `page` (default 1), `limit` (default 10, max 50)

**Response:**
```json
{
  "data": [
    {
      "tripId": 42,
      "routeName": "Maadi → New Cairo",
      "date": "2026-06-14",
      "departureTime": "2026-06-14T07:30:00.000Z",
      "totalPassengers": 8,
      "boardedPassengers": 7,
      "absentPassengers": 1,
      "earnings": 245.00,
      "status": "completed"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 10
}
```

`earnings` is sourced from `driver_earnings.amount` for this driver + trip (0 if not yet recorded).

---

## Fix 4 — Passenger Cancel + Refund

### DELETE /shuttle/bookings/:id
**Auth:** `authenticate` + `requireRole("user")`

**Rules:**
| Condition | Outcome |
|---|---|
| Booking not found | 404 |
| Booking belongs to another user | 403 |
| Booking already `cancelled` | 400 |
| Booking in `boarded`, `completed`, or `absent` | 400 — cannot cancel |
| Departure **> 12 h** away | Cancel + full wallet refund + `notification:new` |
| Departure **≤ 12 h** away | Cancel + no refund + `notification:new` |

**Side effects on full refund:**
- `bookings.status` → `cancelled`, `bookings.paymentStatus` → `refunded`
- `trips.available_seats` incremented by `seatCount`
- `users.wallet_balance` credited by `totalPrice`
- `wallet_transactions` row inserted (type: `refund`)
- `notifications` row inserted + `notification:new` Socket.IO event

**Response:**
```json
{ "ok": true, "bookingId": 101, "refunded": true }
```

---

## Fix 5 — Trip-Full Message

**File:** `artifacts/api-server/src/routes/bookings.ts`

The error string returned when `available_seats < seatCount` was changed from:
> `"Not enough available seats — this trip is fully booked"`

to the exact contract string:
> `"This trip is fully booked."`

---

## Fix 6 — Booking Confirmation Notification

**File:** `artifacts/api-server/src/routes/bookings.ts`

Immediately after a successful `POST /bookings`, before the `201` response is sent, the server:
1. Fetches `trip.departureTime` and `trip.routeId`.
2. Resolves the route name and the **first station** (lowest `order`) as the pickup point.
3. Inserts a `notifications` row for the passenger with:
   - **title:** `"Booking Confirmed ✓"`
   - **body:** `"Route: <name> | Date/Time: <Cairo local> | Pickup: <station> | Price: <EGP>"`
4. Emits `notification:new` on `passenger:<userId>` Socket.IO room.

This block is wrapped in `try/catch`; failures are logged but do not prevent the booking response.

---

## Fix 7 — Invite-Friends Background Notification

**File:** `artifacts/api-server/src/lib/shuttle-job.ts`

The shuttle status job (runs every 15 min) now includes a second pass (`runUnderBookedNotificationJob`) that:

1. Queries trips with status `scheduled` or `waiting_driver` whose `departureTime` is between **now + 10 h** and **now + 48 h** (beyond the auto-cancel window).
2. For each such trip where `booked < VEHICLE_MIN_THRESHOLD`:
   - Skips if already notified today (module-level `inviteNotifiedDates` Map, key: tripId → YYYY-MM-DD).
   - Fetches all `pending`/`confirmed` bookings for that trip.
   - Inserts a notification per passenger and emits `notification:new` on their Socket.IO room.
   - The socket payload includes `deep_link: "veego://shuttle/trip/<tripId>"` for direct navigation.
3. Updates `inviteNotifiedDates` after firing, so the same trip is not notified again today.

**Socket payload shape:**
```json
{
  "id": "123",
  "category": "trip",
  "title": "Help fill your trip!",
  "body": "Your trip on 14/06/2026 at 07:30 still needs more passengers. Share it with friends to make sure it runs!",
  "deep_link": "veego://shuttle/trip/42",
  "time": "2026-06-11T10:00:00.000Z"
}
```

---

## New/Modified Files

| File | Change |
|---|---|
| `lib/db/src/schema/shuttleRatings.ts` | **New** — `shuttle_ratings` table |
| `lib/db/src/schema/index.ts` | Export `shuttleRatings` |
| `artifacts/api-server/src/routes/shuttle.ts` | +4 endpoints: POST /ratings, GET /my-trips, GET /driver/my-trips, DELETE /bookings/:id |
| `artifacts/api-server/src/routes/driver.ts` | Rating request notifications on trip completion |
| `artifacts/api-server/src/routes/bookings.ts` | Fix 5 error message + Fix 6 confirmation notification |
| `artifacts/api-server/src/lib/shuttle-job.ts` | Fix 7 invite-friends notification job |

---

## Migration Note

The new `shuttle_ratings` table requires a database migration before the feature is usable.
Run the Drizzle migration to create the table:

```bash
pnpm --filter @workspace/db run migrate
```
