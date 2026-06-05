# Shuttle Rider API Contract (FINAL)

> **Version:** 1.0 — Production-ready for Rider mobile app integration  
> **Base URL:** `/api` (all endpoints below are relative to this prefix)  
> **Auth:** Bearer token required on all authenticated endpoints — pass via `Authorization: Bearer <token>` header

---

## 1. Overview

The Shuttle service operates on a **demand-based booking model**. Each shuttle trip holds a maximum of **14 seats**. A trip starts in the `open` state and only becomes `active` (boarding guaranteed) once at least **7 passengers** have booked. If a trip fails to reach 7 bookings within 8 hours of departure, it is automatically cancelled and all passengers are fully refunded to their wallet.

---

## 2. Trip Status Flow

```
OPEN ──(≥7 bookings)──► ACTIVE ──(departure / admin / auto-cancel)──► CANCELLED
```

**Rules (strict — no exceptions):**
- `OPEN` → trip exists, fewer than 7 confirmed bookings, departure not guaranteed
- `ACTIVE` → trip has ≥ 7 bookings, boarding is guaranteed; **this state NEVER reverts to OPEN**
- `CANCELLED` → trip did not meet minimum riders within 8 h of departure, OR admin cancelled; all passengers are refunded automatically

---

## 3. APIs

---

### GET /shuttle/lines

Returns all active shuttle routes with trip statistics.

**Auth:** Not required

**Request:**
```
GET /api/shuttle/lines
```

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Maadi → Nasr City",
      "fromLocation": "Maadi",
      "toLocation": "Nasr City",
      "estimatedDuration": 45,
      "basePrice": 25.00,
      "isActive": true,
      "stationCount": 4,
      "totalTrips": 3,
      "openTrips": 2,
      "activeTrips": 1,
      "totalSeats": 14,
      "minRequired": 7,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-06-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

| Field | Description |
|---|---|
| `openTrips` | Trips currently in `open` state (need more bookings) |
| `activeTrips` | Trips currently in `active` state (guaranteed) |
| `totalSeats` | Always 14 |
| `minRequired` | Always 7 |

---

### GET /shuttle/lines/:id

Returns a single shuttle route with its stations and upcoming trips.

**Auth:** Not required

**Request:**
```
GET /api/shuttle/lines/1
```

**Response `200`:**
```json
{
  "data": {
    "id": 1,
    "name": "Maadi → Nasr City",
    "fromLocation": "Maadi",
    "toLocation": "Nasr City",
    "estimatedDuration": 45,
    "basePrice": 25.00,
    "isActive": true,
    "stationCount": 4,
    "totalSeats": 14,
    "minRequired": 7,
    "stations": [
      { "id": 1, "name": "Maadi Metro", "order": 1 },
      { "id": 2, "name": "Ring Road", "order": 2 }
    ],
    "activeTrips": [
      {
        "id": 101,
        "status": "scheduled",
        "shuttleStatus": "open",
        "departureTime": "2025-06-10T07:30:00.000Z",
        "arrivalTime": "2025-06-10T08:15:00.000Z",
        "price": 25.00,
        "totalSeats": 14,
        "bookedSeats": 4,
        "availableSeats": 10,
        "minRequired": 7,
        "message": "Needs 3 more bookings to become active"
      },
      {
        "id": 102,
        "status": "active",
        "shuttleStatus": "active",
        "departureTime": "2025-06-10T08:30:00.000Z",
        "arrivalTime": "2025-06-10T09:15:00.000Z",
        "price": 25.00,
        "totalSeats": 14,
        "bookedSeats": 9,
        "availableSeats": 5,
        "minRequired": 7,
        "message": "Trip is confirmed — boarding guaranteed"
      }
    ]
  }
}
```

**`shuttleStatus` values:**

| `shuttleStatus` | Meaning |
|---|---|
| `open` | Booking accepted, departure not yet guaranteed |
| `active` | ≥7 bookings confirmed, boarding guaranteed |
| `cancelled` | Trip cancelled, wallet refunded |

---

### POST /bookings

Creates a new shuttle booking and deducts payment from the passenger's wallet.

**Auth:** Required (passenger)

**Request:**
```
POST /api/bookings
Content-Type: application/json
Authorization: Bearer <token>

{
  "tripId": 101,
  "seatCount": 1,
  "promoCode": "SUMMER10"   // optional
}
```

> `seatCount` **must always be `1`**. Any other value returns a `400` error.

**Response `201` — booking created (trip still OPEN):**
```json
{
  "id": 55,
  "userId": 12,
  "tripId": 101,
  "seatCount": 1,
  "totalPrice": 22.50,
  "status": "pending",
  "paymentStatus": "paid",
  "promoCodeId": 3,
  "createdAt": "2025-06-10T06:00:00.000Z",
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

**Response `201` — booking created (trip just became ACTIVE):**
```json
{
  "id": 56,
  "userId": 13,
  "tripId": 101,
  "seatCount": 1,
  "totalPrice": 25.00,
  "status": "pending",
  "paymentStatus": "paid",
  "promoCodeId": null,
  "createdAt": "2025-06-10T06:05:00.000Z",
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

**Booking status after creation is always `pending`** regardless of whether the trip is open or active.

---

### PATCH /bookings/:id/cancel

Cancels an existing booking. If the booking was paid, the full amount is immediately refunded to the passenger's wallet.

**Auth:** Required (passenger cancels their own booking; admin can cancel any)

**Request:**
```
PATCH /api/bookings/55/cancel
Authorization: Bearer <token>
```

**Response `200`:**
```json
{
  "id": 55,
  "userId": 12,
  "tripId": 101,
  "seatCount": 1,
  "totalPrice": 22.50,
  "status": "cancelled",
  "paymentStatus": "refunded",
  "createdAt": "2025-06-10T06:00:00.000Z"
}
```

> **Important:** Cancelling a booking from an `active` trip does **not** revert the trip to `open`. The trip remains `active`. Refund is always immediate if `paymentStatus` was `paid`.

---

### GET /shuttle/trips/:id/passengers

Returns the passenger list for a specific trip. Useful for boarding screens.

**Auth:** Required

**Request:**
```
GET /api/shuttle/trips/101/passengers
Authorization: Bearer <token>
```

**Response `200`:**
```json
{
  "tripId": 101,
  "tripStatus": "active",
  "shuttleStatus": "active",
  "totalSeats": 14,
  "bookedSeats": 7,
  "availableSeats": 7,
  "minRequired": 7,
  "data": [
    {
      "bookingId": 55,
      "userId": 12,
      "seatCount": 1,
      "totalPrice": 22.50,
      "status": "pending",
      "paymentStatus": "paid",
      "createdAt": "2025-06-10T06:00:00.000Z",
      "userName": "Ahmed Hassan",
      "userPhone": "+201012345678",
      "userEmail": "ahmed@example.com"
    }
  ],
  "total": 7
}
```

---

## 4. Booking Rules

| Rule | Detail |
|---|---|
| Max seats per trip | **14** (hard limit enforced at DB level) |
| Seats per booking | **Always 1** — each rider books exactly one seat |
| Duplicate booking | A user cannot book the same trip twice (active bookings checked) |
| Overbooking | Impossible — seat decrement is atomic with `SELECT FOR UPDATE` + conditional `UPDATE … WHERE available_seats >= seatCount RETURNING …` |
| Payment method | Wallet only — balance must cover the full price before booking is created |

---

## 5. Business Logic Rules

| Rule | Detail |
|---|---|
| Activation threshold | Trip becomes `active` when `bookedSeats >= 7` |
| Auto-cancellation window | Job runs every 15 minutes; any `open` or `active` trip with `< 7` bookings and departure within **8 hours** is auto-cancelled |
| ACTIVE is irreversible | Once a trip reaches `active`, it **never** reverts to `open` — even if bookings are cancelled below 7 |
| Auto-refund on trip cancel | All `pending`/`confirmed` bookings are refunded atomically when a trip is cancelled (auto or admin) |
| Refund idempotency | Refund logic uses a single atomic CTE `UPDATE … RETURNING` — concurrent job runs cannot produce duplicate refunds |
| Promo codes | Applied at booking time; discount can be percentage or fixed amount; expiry and max-usage are validated |

---

## 6. Error Cases

| HTTP Status | Code / Condition | Message |
|---|---|---|
| `400` | `seatCount` is not 1 | `"Shuttle bookings allow exactly 1 seat per booking."` |
| `400` | Trip is not `scheduled` or `active` | `"Trip is not available for booking"` |
| `400` | Insufficient wallet balance | `"Insufficient wallet balance. Required: X EGP, available: Y EGP"` |
| `400` | Booking already cancelled | `"Booking already cancelled"` |
| `400` | Invalid trip or booking ID | `"Invalid trip ID"` / `"Invalid booking ID"` |
| `403` | Passenger cancelling another user's booking | `"Forbidden"` |
| `404` | Trip or booking not found | `"Trip not found"` / `"Booking not found"` |
| `409` | Duplicate booking by same user | `"You already have an active booking for this trip"` |
| `409` | Seat snatched mid-transaction (race) | `"Seat reservation failed — seats may have just been taken"` |

---

## 7. Frontend Integration Notes

### Displaying Trip Status

Map `shuttleStatus` to UI states as follows:

```
shuttleStatus === "open"
  → Yellow badge: "Open"
  → Show: "Needs X more bookings to become active"
  → CTA: "Book Now" (if availableSeats > 0)

shuttleStatus === "active"
  → Green badge: "Active"
  → Show: "Trip is confirmed — boarding guaranteed"
  → CTA: "Book Now" (if availableSeats > 0) or "Fully Booked"

shuttleStatus === "cancelled"
  → Red badge: "Cancelled"
  → Show: "Trip has been cancelled"
  → Hide booking CTA entirely
```

### Seats Counter Display

Use these fields from any trip object:

```
bookedSeats    → passengers confirmed so far (e.g. "7/14 seats taken")
availableSeats → seats still open for booking
minRequired    → 7 (activation threshold)
totalSeats     → 14 (capacity)
```

Progress bar formula:
```
fill % = (bookedSeats / totalSeats) * 100
```

Activation progress formula (for open trips):
```
activationFill % = (bookedSeats / minRequired) * 100  — cap at 100
```

### "Needs X More Bookings" Counter

The `message` field on every trip object is pre-formatted and ready to display directly:
- `"Needs 3 more bookings to become active"` (open)
- `"Trip is confirmed — boarding guaranteed"` (active)
- `"Trip has been cancelled"` (cancelled)

Alternatively, compute it yourself:
```js
const needed = Math.max(0, trip.minRequired - trip.bookedSeats);
```

### Handling the 409 Race Condition

When `POST /bookings` returns `409` with `"seats may have just been taken"`, the trip just became fully booked while the user was on the booking screen. Show: *"Sorry, those seats were just taken. Please check for another trip."*

### Booking Status After Creation

A new booking always comes back with `status: "pending"` — this is correct and expected. The booking is paid and reserved; `"pending"` simply means the trip hasn't departed yet.

### Real-time Updates

The API emits Socket.io events. Subscribe to the passenger room to receive:

| Event | Trigger |
|---|---|
| `notification:new` | Trip cancelled (with full refund notification) |
| `booking:boarded` | Passenger scanned/boarded by driver |

Connect to room `passenger:<userId>` after authentication.

---

*Generated: 2025-06-05 — Shuttle service only. Car and Motorcycle services are unaffected.*
