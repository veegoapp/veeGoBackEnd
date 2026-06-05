# Backend Complete Reference — Veego Ride API

> **Generated:** 2026-06-05  
> **Source of truth:** Live source code — `artifacts/api-server/src/`  
> **Audience:** Passenger mobile app frontend team  
> **Base URL:** All REST paths are prefixed with `/api`. Socket.IO path is `/api/socket.io`.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Ride Flow & State Machine](#2-ride-flow--state-machine)
3. [Dispatch System](#3-dispatch-system)
4. [Wallet & Payments](#4-wallet--payments)
5. [Driver Earnings](#5-driver-earnings)
6. [Ratings](#6-ratings)
7. [Promo Codes](#7-promo-codes)
8. [Cancellation Policy](#8-cancellation-policy)
9. [WebSocket Events — Complete Reference](#9-websocket-events--complete-reference)
10. [Automatic Surge Pricing](#10-automatic-surge-pricing)
11. [Waiting Charge](#11-waiting-charge)
12. [Driver Selfie Check-in](#12-driver-selfie-check-in)
13. [SOS / Emergency](#13-sos--emergency)
14. [Route Deviation Detection](#14-route-deviation-detection)
15. [Ride Sharing / Tracking Links](#15-ride-sharing--tracking-links)
16. [Peak Hours Logic](#16-peak-hours-logic)
17. [Service Controls](#17-service-controls)
18. [Notifications](#18-notifications)
19. [Users & Profile](#19-users--profile)
20. [All Configurable Settings Keys](#20-all-configurable-settings-keys)
21. [Rate Limits & Timeouts](#21-rate-limits--timeouts)
22. [Error Reference](#22-error-reference)

---

## 1. Authentication

All authenticated endpoints require the HTTP header:

```
Authorization: Bearer <accessToken>
```

The middleware reads the token, verifies its signature, then loads the user from the DB on every request. Blocked accounts receive `403` at the middleware level regardless of endpoint.

### Token Model

- **Access token** — short-lived JWT, signed with `SESSION_SECRET`. Sent in `Authorization` header.
- **Refresh token** — longer-lived JWT, stored server-side in `users.refreshToken` column. Sent in the body of `POST /auth/refresh`.
- There is **no cookie-based session**. All auth is header-based.

---

### POST `/api/auth/register`

**Auth:** None  
**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | string | ✓ | min 1 char |
| `email` | string | ✓ | valid email |
| `phone` | string | ✓ | min 5 chars |
| `password` | string | ✓ | min 6 chars |

**Success 201:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 1,
    "name": "Ali Hassan",
    "email": "ali@example.com",
    "phone": "+201234567890",
    "role": "user",
    "avatarUrl": null,
    "isVerified": false,
    "walletBalance": 0,
    "createdAt": "2026-06-01T10:00:00Z",
    "permissions": []
  }
}
```

**Errors:**
- `400` — Validation failed (missing fields, invalid email format, password < 6 chars)
- `400` — `"Email or phone already registered"`

---

### POST `/api/auth/login`

**Auth:** None  
**Note:** The backend accepts either `credential` or `email` as the login identifier key. Both work — the server normalises them internally. The identifier is matched against both `users.email` AND `users.phone`.

**Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `credential` OR `email` | string | ✓ | email or phone number |
| `password` | string | ✓ | |

**Success 200:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 1,
    "name": "Ali Hassan",
    "email": "ali@example.com",
    "phone": "+201234567890",
    "role": "user",
    "avatarUrl": null,
    "isVerified": true,
    "walletBalance": 150.00,
    "createdAt": "2026-06-01T10:00:00Z",
    "permissions": []
  }
}
```

**Errors:**
- `400` — Validation failed
- `401` — `"Invalid credentials"`
- `403` — `"Account is blocked"`

---

### POST `/api/auth/refresh`

**Auth:** None  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | string | ✓ |

**Success 200:** Same shape as login response — new `accessToken` and rotated `refreshToken`.

**Errors:**
- `400` — Missing body
- `401` — `"Invalid refresh token"` (token not found, mismatch, or expired)

**Important:** The server rotates the refresh token on every use. Store the new `refreshToken` from the response or you will be locked out.

---

### POST `/api/auth/send-otp`

Sends a 6-digit OTP via SMS to verify phone ownership. OTP expires in 10 minutes.

**Auth:** None  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `phone` | string | ✓ (min 5 chars) |

**Success 200:**
```json
{ "success": true, "message": "OTP sent to your phone number" }
```

**Errors:**
- `404` — `"No account found with this phone number"`
- `500` — SMS delivery failed

---

### POST `/api/auth/verify-otp`

Verifies the OTP. On success, sets `users.isVerified = true` and returns tokens (auto-login).

**Auth:** None  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `phone` | string | ✓ |
| `otp` | string | ✓ (exactly 6 chars) |

**Success 200:**
```json
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { ... }
}
```

**Errors:**
- `400` — `"Invalid OTP code"` or `"OTP has expired. Please request a new one."`
- `404` — Phone not found

---

### POST `/api/auth/forgot-password`

Sends a password reset code (8-char hex token) via SMS. Expires in 1 hour. Uses stealth mode: always returns success to prevent phone enumeration.

**Auth:** None  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `phone` | string | ✓ |

**Success 200:**
```json
{ "success": true, "message": "If this phone is registered, a reset code has been sent" }
```

---

### POST `/api/auth/reset-password`

**Auth:** None  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `phone` | string | ✓ |
| `token` | string | ✓ (6+ chars — the 8-char hex code from SMS) |
| `newPassword` | string | ✓ (min 8 chars) |

**Success 200:**
```json
{ "success": true, "message": "Password updated successfully. Please log in with your new password." }
```

**Errors:**
- `400` — Invalid phone, invalid token, or token expired

**Side effect:** All existing refresh tokens for the user are invalidated (forces re-login).

---

### GET `/api/auth/me`

**Auth:** Any authenticated user  
**Deprecated** — use `GET /api/users/me` instead. Kept for backward compatibility.

**Success 200:** Same as `GET /api/users/me`.

---

## 2. Ride Flow & State Machine

### Ride Statuses

| Status | Description |
|--------|-------------|
| `searching` | Ride created, dispatch is looking for a driver |
| `driver_assigned` | A driver accepted; en route to pickup |
| `driver_arrived` | Driver arrived at pickup location |
| `active` | Ride in progress — passenger boarded |
| `completed` | Ride finished successfully |
| `cancelled` | Ride cancelled (by passenger, driver, or system) |

### Valid Transitions

```
searching
  → driver_assigned   (driver accepts via PATCH /driver/rides/:id/accept)
  → cancelled         (passenger cancels, or system cancels due to no drivers)

driver_assigned
  → driver_arrived    (driver marks arrived via PATCH /driver/rides/:id/arrived)
  → searching         (driver cancels via PATCH /driver/rides/:id/cancel → re-dispatch)
  → cancelled         (passenger cancels)

driver_arrived
  → active            (driver starts via PATCH /driver/rides/:id/start)
  → searching         (driver cancels → re-dispatch)
  → cancelled         (passenger cancels manually, or no-show timer fires)

active
  → completed         (driver completes via PATCH /driver/rides/:id/complete)
  → cancelled         (passenger cancels — cancellation fee applies)

completed → (terminal)
cancelled → (terminal)
```

---

### POST `/api/rides/estimate`

Get a price estimate before requesting a ride.

**Auth:** Any authenticated user  
**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `vehicleType` | `"car"` \| `"bike"` | ✓ | |
| `pickupLatitude` | number | ✓ | -90 to 90 |
| `pickupLongitude` | number | ✓ | -180 to 180 |
| `dropoffLatitude` | number | ✓ | -90 to 90 |
| `dropoffLongitude` | number | ✓ | -180 to 180 |

**Success 200:**
```json
{
  "data": {
    "distanceKm": 4.321,
    "estimatedDurationMinutes": 9,
    "estimatedPrice": 28.50,
    "surgeActive": true,
    "surgeMultiplier": 1.3,
    "pricingSource": "zone:Downtown"
  }
}
```

- `pricingSource` is either `"global"` or `"zone:<zoneName>"` — indicates which pricing tier was applied.
- If surge is inactive, `surgeMultiplier` is `1` and `surgeActive` is `false`.

**Errors:**
- `400` — Invalid coordinates or vehicleType
- `404` — No active pricing found for vehicle type

---

### POST `/api/rides/request`

Create a ride request. Wallet is escrowed immediately. Dispatch begins asynchronously.

**Auth:** `role = user`  
**Rate limit:** 3 requests per 2 minutes per user (see §21)  
**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `vehicleType` | `"car"` \| `"bike"` | ✓ | |
| `pickupLatitude` | number | ✓ | |
| `pickupLongitude` | number | ✓ | |
| `pickupAddress` | string | ✓ | min 1 char |
| `dropoffLatitude` | number | ✓ | |
| `dropoffLongitude` | number | ✓ | |
| `dropoffAddress` | string | ✓ | min 1 char |
| `promoCode` | string | ✗ | optional; validated immediately |

**Business rules:**
1. If the user already has a ride in `searching` or `driver_assigned` status, the request is rejected with `409`.
2. Pricing priority: zone-specific rate (pickup location inside zone radius) → global rate.
3. Surge multiplier applied if active.
4. Promo code validated: must be active, not expired, and under usage limit.
5. Discount applied before wallet check. User must have sufficient balance for the discounted price.
6. Wallet is debited atomically; a `payment` transaction is recorded.
7. Promo `usedCount` is incremented atomically (race-safe).

**Success 201:**
```json
{
  "data": {
    "id": 42,
    "passengerId": 1,
    "vehicleType": "car",
    "pickupLatitude": 30.0444,
    "pickupLongitude": 31.2357,
    "pickupAddress": "Tahrir Square",
    "dropoffLatitude": 30.0600,
    "dropoffLongitude": 31.2200,
    "dropoffAddress": "Cairo Tower",
    "distanceKm": 4.321,
    "estimatedDurationMinutes": 9,
    "estimatedPrice": 28.50,
    "status": "searching",
    "waitingCharge": null,
    "finalPrice": null,
    "requestedAt": "2026-06-05T10:00:00Z",
    "createdAt": "2026-06-05T10:00:00Z"
  }
}
```

**Errors:**
- `400` — Validation failed; promo not found/inactive/expired
- `402` — `"Insufficient wallet balance"` with `{ required, balance }`
- `404` — No active pricing for vehicle type
- `409` — Already have an active ride, or promo limit reached (race)
- `429` — Rate limit exceeded

---

### GET `/api/rides/my`

Passenger's own ride history.

**Auth:** `role = user`  
**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by ride status |
| `vehicleType` | string | — | Filter by `car` or `bike` |
| `page` | int | 1 | |
| `limit` | int | 20 | Max 100 |

**Success 200:**
```json
{
  "data": [ { ...ride } ],
  "meta": { "total": 45, "page": 1, "limit": 20 }
}
```

---

### GET `/api/rides/:id`

Get a single ride. Passengers can only fetch their own rides. Drivers can only fetch rides assigned to them.

**Auth:** Any authenticated user  
**Success 200:**
```json
{
  "data": {
    "id": 42,
    "status": "completed",
    "vehicleType": "car",
    "pickupAddress": "Tahrir Square",
    "dropoffAddress": "Cairo Tower",
    "distanceKm": 4.321,
    "estimatedPrice": 28.50,
    "finalPrice": 30.50,
    "waitingCharge": 2.00,
    "passenger": { "id": 1, "name": "Ali", "phone": "+201234567890" },
    "driver": { "id": 5, "name": "Mohamed", "phone": "+201111111111" },
    ...
  }
}
```

**Errors:**
- `403` — Forbidden (not your ride)
- `404` — Ride not found

---

### PATCH `/api/rides/:id/cancel`

Passenger cancels their own ride.

**Auth:** `role = user`  
**Body:** (optional)

| Field | Type | Required |
|-------|------|----------|
| `reason` | string | ✗ |

**Cancellable statuses:** `requested`, `searching`, `driver_assigned`, `driver_arrived`, `active`

**Success 200:**
```json
{
  "data": {
    "id": 42,
    "status": "cancelled",
    "refundAmount": 23.50,
    "cancellationFee": 5.00
  }
}
```

See §8 for full cancellation fee rules.

**Errors:**
- `400` — `"Cannot cancel a ride with status '...'"` (e.g. already completed)
- `403` — Not your ride
- `404` — Ride not found

---

### POST `/api/rides/:id/rate-driver`

Passenger rates the driver after the ride.

**Auth:** `role = user`  
**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `rating` | number | ✓ | 1–5 |
| `comment` | string | ✗ | |

**Business rules:**
- Ride must be `completed`.
- Caller must be the ride's passenger.
- Can only rate once per ride; `409` if already rated.
- Updates `drivers.rating` as a live rolling average of all ride ratings.

**Success 201:**
```json
{ "ok": true, "rideId": 42, "rating": 5 }
```

**Errors:**
- `400` — Ride not completed, or no driver assigned
- `403` — Not your ride
- `404` — Ride not found
- `409` — `"Driver already rated for this ride"`

---

### POST `/api/rides/:id/share`

Generate a public tracking link for a ride.

**Auth:** Any authenticated user (must be the ride's passenger)  
**Body:** None

**Shareable statuses:** `requested`, `driver_arrived`, `in_progress`  
**Token TTL:** 24 hours  
**Idempotent:** Returns the existing token if one exists and has not expired.

**Success 201:**
```json
{
  "token": "abc123xyz...",
  "url": "https://your-domain.com/api/track/abc123xyz...",
  "expiresAt": "2026-06-06T10:00:00Z"
}
```

**Errors:**
- `403` — Not your ride
- `404` — Ride not found
- `409` — Ride not in a shareable status

---

### POST `/api/rides/:id/sos`

Trigger SOS/emergency during an active ride.

**Auth:** Any authenticated user (must be the ride's passenger OR assigned driver)  
**Active statuses only:** `driver_arrived`, `in_progress`  
**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `latitude` | number | ✓ | -90 to 90 |
| `longitude` | number | ✓ | -180 to 180 |
| `notes` | string | ✗ | max 500 chars |

**Side effects:**
- Inserts a row into `sos_events`.
- Emits `sos:triggered` to admin room immediately via WebSocket.

**Success 201:**
```json
{ "sosId": 7, "message": "SOS received" }
```

**Errors:**
- `403` — Not a party to this ride
- `404` — Ride not found
- `409` — `"SOS can only be triggered on an active ride"`

---

### Driver-Facing Ride Endpoints (needed for context)

> These are driver actions. Document them for completeness so the passenger app knows what WebSocket events to expect.

| Method | Path | Role | Trigger | Passenger WebSocket Event |
|--------|------|------|---------|--------------------------|
| `PATCH` | `/api/driver/rides/:id/accept` | driver | Driver accepts offer | `ride:driver_assigned` |
| `PATCH` | `/api/driver/rides/:id/arrived` | driver | Driver arrives at pickup | `ride:driver_arrived` |
| `PATCH` | `/api/driver/rides/:id/start` | driver | Driver starts ride | `ride:started` |
| `PATCH` | `/api/driver/rides/:id/complete` | driver | Driver completes ride | `ride:completed` |
| `PATCH` | `/api/driver/rides/:id/cancel` | driver | Driver cancels | `ride:driver_cancelled` |
| `GET` | `/api/driver/rides/available` | driver | List searching rides | — |

---

### Admin Ride Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/rides` | admin | Paginated list — query: `vehicleType`, `status`, `driverId`, `passengerId`, `page`, `limit` |
| `GET` | `/api/admin/rides/:id` | admin | Single ride with passenger, driver, event log |
| `GET` | `/api/admin/rides/pricing` | admin | Get all vehicle pricing rows |
| `PATCH` | `/api/admin/rides/pricing/:vehicleType` | admin | Update pricing (`car` or `bike`) |

**`PATCH /api/admin/rides/pricing/:vehicleType` body:**

| Field | Type |
|-------|------|
| `baseFare` | number (positive) |
| `perKmRate` | number (≥0) |
| `perMinuteRate` | number (≥0) |
| `minimumFare` | number (positive) |
| `isActive` | boolean |

---

## 3. Dispatch System

The dispatch system runs entirely server-side and is invisible to the passenger app except through WebSocket events. Understanding it helps the passenger app know what states are possible.

### Flow

1. `POST /api/rides/request` succeeds → `dispatchManager.startDispatch()` is called asynchronously.
2. Server creates a `ride_dispatch_state` row with `status = "active"`.
3. Server queries eligible drivers within the first radius step using a composite score.
4. A batch of up to N drivers receives `ride:offer` via WebSocket.
5. If no driver accepts within **15 seconds**, the round expires:
   - `ride:offer_expired` sent to the batch.
   - Next batch (excluding already-notified drivers) is found at the next radius step.
   - If all drivers have been notified and all radii exhausted, the cycle restarts.
   - If still no drivers after restart, the ride is cancelled with reason `no_drivers` and the passenger is refunded.
6. When a driver accepts, all other drivers in the same round receive `ride:no_longer_available`.

### Driver Scoring (per dispatch round)

```
score =
  0.50 × ((radiusKm - distanceKm) / radiusKm)     -- proximity
  + 0.30 × ((rating - 1) / 4)                      -- star rating
  + 0.20 × (totalAccepted / totalDispatched)        -- acceptance rate (0.5 for new)
  - 0.10 (if offered a ride within the last 10 min) -- recency penalty
```

Drivers with `cooldownUntil > NOW()` are excluded. Cooldown triggers after 3 consecutive non-acceptances within a round; lasts 10 minutes.

### Radius Steps

Default (off-peak): `[5, 8, 12]` km  
Default (peak): `[3, 5, 8]` km  
Configurable via settings keys `dispatch_radius_steps_km` and `dispatch_radius_steps_km_peak`.

### Batch Sizes

Default off-peak: `3` drivers per round  
Default peak: `5` drivers per round  
Configurable via `dispatch_drivers_per_round` and `dispatch_drivers_per_round_peak`.

### Re-dispatch After Driver Cancel

When a driver cancels after accepting (`driver_assigned` or `driver_arrived`):
- Ride is reset to `searching`.
- Passenger receives `ride:driver_cancelled`.
- Full dispatch cycle restarts (all drivers eligible again).
- No refund — escrow remains intact.

---

## 4. Wallet & Payments

### GET `/api/wallet`

Get the authenticated user's current wallet balance.

**Auth:** Any authenticated user  
**Success 200:**
```json
{ "userId": 1, "balance": 150.00 }
```

---

### GET `/api/wallet/transactions`

Paginated list of the authenticated user's wallet transactions.

**Auth:** Any authenticated user  
**Query params:**

| Param | Type | Default |
|-------|------|---------|
| `page` | int | 1 |
| `limit` | int | 20 |

**Success 200:**
```json
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "amount": 100.00,
      "type": "deposit",
      "description": "Wallet top-up — 100 EGP",
      "createdAt": "2026-06-05T10:00:00Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

Transaction `type` values: `"deposit"`, `"payment"`, `"refund"`

---

### POST `/api/wallet/topup`

Top up the wallet balance. Inserts a deposit transaction and updates balance atomically.

**Auth:** Any authenticated user  
**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `amount` | number | ✓ | positive |

**Success 200:**
```json
{
  "transaction": {
    "id": 5,
    "userId": 1,
    "amount": 100.00,
    "type": "deposit",
    "description": "Wallet top-up — 100 EGP",
    "createdAt": "2026-06-05T10:00:00Z"
  },
  "balance": 250.00
}
```

**Errors:**
- `400` — `"Amount must be a positive number"`

---

### Admin Wallet Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/wallet/transactions` | admin | All transactions, paginated |
| `POST` | `/api/admin/wallet/refund` | admin | Manual refund to any user |

**`GET /api/admin/wallet/transactions` query params:**

| Param | Type |
|-------|------|
| `userId` | int |
| `type` | `deposit` \| `payment` \| `refund` |
| `dateFrom` | date string |
| `dateTo` | date string |
| `search` | string (searches name + description) |
| `page` | int |
| `limit` | int |

**`POST /api/admin/wallet/refund` body:**

| Field | Type | Required |
|-------|------|----------|
| `userId` | int | ✓ |
| `amount` | number | ✓ |
| `description` | string | ✓ |

---

### Admin Payment Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/payments` | admin | Paginated payment records |
| `GET` | `/api/admin/payments/summary` | admin | Aggregate totals by status/method |
| `GET` | `/api/admin/payments/:id` | admin | Single payment with user details |
| `PATCH` | `/api/admin/payments/:id` | admin | Update `status`, `notes`, `transactionRef` |

**`GET /api/admin/payments` query params:** `page`, `limit`, `status` (`pending`|`completed`|`failed`|`refunded`), `method` (`wallet`|`cash`|`card`), `userId`, `bookingId`, `rideId`, `from`, `to`

---

## 5. Driver Earnings

### GET `/api/earnings/summary`

Returns earnings summary. Behavior differs by role:
- **Admin:** platform-wide totals + top 10 drivers by earnings.
- **Driver:** own totals + breakdown by status + 10 most recent records.

**Auth:** `admin` or `driver`  
**Success 200 (driver):**
```json
{
  "driverId": 5,
  "summary": {
    "totalEarnings": 1250.00,
    "totalPaid": 1000.00,
    "totalPending": 0.00,
    "totalConfirmed": 250.00,
    "totalRecords": 48
  },
  "byStatus": [
    { "status": "confirmed", "count": 12, "total": 250.00 },
    { "status": "paid", "count": 36, "total": 1000.00 }
  ],
  "recentEarnings": [ { "id": 48, "amount": 35.50, "status": "confirmed", ... } ]
}
```

---

### GET `/api/earnings/weekly`

Weekly earnings breakdown.

**Auth:** `admin` or `driver`  
**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `weeks` | int | 8 | 1–52 |
| `driverId` | int | — | Admin only: filter to specific driver |

**Success 200:**
```json
{
  "weeks": 8,
  "driverId": 5,
  "weeklyBreakdown": [
    { "week_start": "2026-05-26", "trip_count": 12, "total_earned": 380.00, "paid": 300.00, "pending": 0, "confirmed": 80.00 }
  ]
}
```

---

### GET `/api/earnings` (Admin only)

Paginated list of all earnings records across all drivers.

**Auth:** admin  
**Query params:** `driverId`, `status` (`pending`|`confirmed`|`paid`), `page`, `limit`

---

### PATCH `/api/earnings/:id/status` (Admin only)

Mark an earnings record as `"confirmed"` or `"paid"`.

**Auth:** admin  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `status` | `"confirmed"` \| `"paid"` | ✓ |

---

### Earnings Model

When a ride completes:
- `finalPrice = estimatedPrice + waitingCharge`
- `platformCut = finalPrice × driver_commission_rate` (setting key, default 0.15 = 15%)
- `driverCut = finalPrice - platformCut`
- If peak hours: additional `peakBonus = driverCut × 0.20` (20% bonus) inserted as a separate earnings record with `notes = "peak_hours_bonus"`

---

## 6. Ratings

### POST `/api/rides/:id/rate-driver`

See §2 — Ride endpoints.

### GET `/api/user/ratings/given`

List all ratings the authenticated user has submitted.

**Auth:** Any authenticated user  
**Success 200:**
```json
{
  "data": [
    {
      "id": 1,
      "driverId": 5,
      "rideId": 42,
      "context": "ride",
      "score": "4.50",
      "comment": "Great driver",
      "createdAt": "...",
      "driverName": "Mohamed"
    }
  ],
  "total": 3
}
```

### Admin Rating Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/ratings` | admin | Paginated list — filters: `driverId`, `raterId`, `context`, `minScore`, `maxScore`, `from`, `to` |
| `GET` | `/api/admin/ratings/stats` | admin | Aggregate: total, avg score, distribution by star |
| `GET` | `/api/admin/ratings/:id` | admin | Single rating with rater and driver details |
| `DELETE` | `/api/admin/ratings/:id` | admin | Delete rating; recomputes driver average atomically |

---

## 7. Promo Codes

### POST `/api/promo/validate`

Validate a promo code without redeeming it. Use this for real-time UX feedback before requesting a ride.

**Auth:** Any authenticated user  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `code` | string | ✓ |

**Success 200:**
```json
{
  "id": 3,
  "code": "SAVE10",
  "discountType": "percentage",
  "discountValue": 10.00,
  "isActive": true,
  "expiryDate": "2026-12-31T23:59:59Z",
  "maxUsage": 500,
  "usedCount": 42
}
```

**Errors:**
- `400` — `"Promo code expired"` or `"Promo code usage limit reached"`
- `404` — `"Promo code not found or inactive"`

**Note:** This endpoint does NOT increment `usedCount`. The increment happens atomically inside `POST /rides/request`.

---

### GET `/api/promo`

List all promo codes. **No admin role required** — any authenticated user can call this.

**Auth:** Any authenticated user  
**Query params:** `page` (default 1), `limit` (default 20)

**Success 200:**
```json
{
  "data": [
    {
      "id": 3,
      "code": "SAVE10",
      "discountType": "percentage",
      "discountValue": 10.00,
      "isActive": true,
      "expiryDate": "2026-12-31T23:59:59Z",
      "maxUsage": 500,
      "usedCount": 42,
      "createdAt": "..."
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

`discountType` values: `"percentage"` | `"fixed"`

---

### Admin Promo Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/promo` | admin | Create promo code |
| `PATCH` | `/api/promo/:id` | admin | Update promo code |
| `DELETE` | `/api/promo/:id` | admin | Delete promo code |

**`POST /api/promo` body:**

| Field | Type | Required |
|-------|------|----------|
| `code` | string | ✓ |
| `discountType` | `"percentage"` \| `"fixed"` | ✓ |
| `discountValue` | number | ✓ |
| `isActive` | boolean | ✓ |
| `expiryDate` | ISO datetime string | ✗ |
| `maxUsage` | int | ✗ |

---

## 8. Cancellation Policy

### Fee Rules

The cancellation fee depends on **what status the ride was in when cancelled**:

| Ride Status at Cancel | Fee Applied |
|----------------------|-------------|
| `searching` | **Full refund** — no fee |
| `driver_assigned` | **Full refund** — no fee |
| `driver_arrived` (within free window) | `cancellation_fee_arrived` flat fee (default **5.00 EGP**) |
| `driver_arrived` (after free window) | `cancellation_fee_arrived` + accrued waiting charge |
| `active` | `active_ride_cancellation_fee` (default **0** — configurable) |

### Refund Calculation

```
refundAmount = max(0, escrowedAmount - cancellationFee - waitingChargeAmount)
```

The `escrowedAmount` is the price that was deducted at ride request time.

### Driver Compensation on Passenger Cancel

- `cancellationFee` → credited to driver earnings (status `confirmed`)
- `waitingChargeAmount` → also credited to driver earnings separately (status `confirmed`)
- Driver status reset to `online`.

### No-show Cancellation (System-triggered)

When the driver arrives and the passenger does not board within `no_show_timeout_minutes` (default 10 min), the system automatically cancels the ride:
- Same fee structure as `driver_arrived` manual cancel.
- Passenger receives `ride:cancelled` with `reason: "passenger_no_show"`.
- Driver receives `ride:no_show_cancelled` with compensation breakdown.

### Driver Cancel (After Accepting)

When the driver cancels after accepting:
- Ride resets to `searching`.
- **No fee to passenger** — escrow is preserved and dispatch restarts.
- If dispatch finds no new driver, passenger is eventually refunded fully.

### System Cancel (No Drivers Found)

- Ride status set to `cancelled`, `cancelReason = "no_drivers"`.
- **Full refund** to passenger — no fee.
- Passenger receives `ride:status_update` with `reason: "no_drivers"`.

---

## 9. WebSocket Events — Complete Reference

### Connection

```javascript
import { io } from "socket.io-client";

const socket = io("https://your-api-domain.com", {
  path: "/api/socket.io",
  auth: { token: "<accessToken>" }
});
```

**Authentication:** The server validates the access token in `socket.handshake.auth.token` on every connection. Invalid or missing token → connection rejected with `Error("Authentication required")` or `Error("Invalid token")`.

### Room Assignment on Connect

The server auto-assigns rooms based on the user's role — clients do **not** need to emit any join events for their own rooms.

| Role | Rooms Joined Automatically |
|------|---------------------------|
| `user` (passenger) | `passenger:<userId>`, `passengers:all` |
| `driver` | `driver:<userId>`, `drivers:available:<vehicleType>` (if online) |
| `admin` | `admin:room` |

### On Passenger Connect

Immediately after connection, the server emits one `surge:updated` event **per vehicle type** to the connecting socket, so the client sees current surge state without waiting for the next tick.

---

### Events: Server → Passenger

#### `ride:driver_assigned`
Driver has accepted and is en route to pickup.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "driverId": 5,
  "driverName": "Mohamed",
  "driver": {
    "name": "Mohamed",
    "phone": "+201111111111",
    "vehicle": "car",
    "rating": 4.8
  },
  "eta": 5
}
```

---

#### `ride:driver_arrived`
Driver has arrived at the pickup location.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{ "rideId": 42, "driverId": 5 }
```

---

#### `ride:started`
Ride has begun — passenger boarded.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{ "rideId": 42, "driverId": 5 }
```

---

#### `ride:completed`
Ride finished. Final price is now known.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "finalPrice": 30.50,
  "fare": 30.50,
  "waitingCharge": 2.00
}
```

---

#### `ride:cancelled`
Ride was cancelled by passenger, driver (no-show path), or system (no drivers).

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "reason": "no_drivers",
  "refundAmount": 28.50,
  "cancellationFee": 0
}
```

`reason` values: `"no_drivers"`, `"passenger_no_show"`, `"passenger_cancelled"`

---

#### `ride:driver_cancelled`
The assigned driver cancelled; dispatch is restarting automatically.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "message": "Your driver cancelled. Finding you a new driver..."
}
```

---

#### `ride:no_show_cancelled`
System-cancelled due to passenger no-show (received by **driver**, not passenger).

**Room:** `driver:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "compensation": 7.00,
  "arrivedFlatFee": 5.00,
  "waitingCharge": 2.00
}
```

---

#### `ride:status_update`
Generic status change notification (used for no-driver cancellation).

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "status": "cancelled",
  "reason": "no_drivers",
  "message": "No available drivers were found nearby. Please try again."
}
```

---

#### `ride:driver_location`
Real-time driver GPS position during a ride.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "location": { "latitude": 30.05, "longitude": 31.22 },
  "timestamp": 1717582800000
}
```

---

#### `ride:waiting:charge:started`
Waiting free window (3 min) has expired — per-minute billing begins.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "ratePerMinute": 2.00,
  "freeWindowMinutes": 3,
  "maxCharge": 20.00
}
```

---

#### `ride:waiting:charge:updated`
Emitted every 1 minute while waiting charge is accruing.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "chargedMinutes": 2,
  "runningTotal": 4.00,
  "ratePerMinute": 2.00,
  "maxCharge": 20.00
}
```

---

#### `ride:waiting:charge:capped`
Maximum waiting charge reached — billing stopped.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "maxCharge": 20.00,
  "chargedMinutes": 10
}
```

---

#### `ride:deviation:warning`
Driver has deviated more than 500 m from the direct pickup→dropoff line.

**Rooms:** `passenger:<userId>`, `admin:room`, `driver:<userId>` (all three)  
**Payload:**
```json
{
  "rideId": 42,
  "driverLat": 30.07,
  "driverLng": 31.30,
  "deviationMeters": 650,
  "detectedAt": "2026-06-05T10:15:00Z"
}
```

Throttled to once per 60 seconds per ride.

---

#### `surge:updated`
Surge multiplier changed for a vehicle type.

**Room:** `passengers:all` (broadcast to all passengers)  
**Payload:**
```json
{
  "vehicleType": "car",
  "multiplier": 1.3,
  "previousMultiplier": 1.0,
  "tier": "low",
  "ratio": 2.41,
  "isActive": true
}
```

`tier` values: `"none"` | `"low"` | `"medium"` | `"high"`

---

#### `notification:new`
New in-app notification.

**Room:** `passenger:<userId>`  
**Payload:**
```json
{
  "id": "15",
  "category": "general",
  "title": "Promo expiring soon",
  "body": "Use SAVE10 before midnight!",
  "time": "2026-06-05T10:00:00Z"
}
```

---

#### `service:control:changed`
A service type has been toggled or reconfigured by admin.

**Room:** Broadcast to **all** connected sockets (both admin room AND global emit)  
**Payload:**
```json
{
  "serviceType": "car",
  "isEnabled": false,
  "displayMode": "maintenance",
  "unavailableMessage": "Back in 2 hours",
  "unavailableAction": "show_message",
  "activeZoneIds": [],
  "maintenanceEta": "2026-06-05T12:00:00Z",
  "changedBy": 1,
  "changedAt": "2026-06-05T10:00:00Z"
}
```

---

#### `sos:triggered`
SOS was triggered. Received by admin room.

**Room:** `admin:room`  
**Payload:**
```json
{
  "sosId": 7,
  "rideId": 42,
  "userId": 1,
  "role": "passenger",
  "latitude": 30.05,
  "longitude": 31.22,
  "notes": "Driver seems unsafe",
  "triggeredAt": "2026-06-05T10:15:00Z"
}
```

---

### Events: Server → Driver

#### `ride:offer`
Dispatch is offering the driver a ride.

**Room:** `driver:<userId>`  
**Payload:**
```json
{
  "rideId": 42,
  "vehicleType": "car",
  "pickupAddress": "Tahrir Square",
  "dropoffAddress": "Cairo Tower",
  "distanceKm": 4.321,
  "estimatedPrice": 28.50,
  "expiresInSeconds": 15
}
```

---

#### `ride:offer_expired`
The driver's offer window expired (15 s).

**Room:** `driver:<userId>`  
**Payload:**
```json
{ "rideId": 42, "reason": "round_expired" }
```

---

#### `ride:no_longer_available`
Another driver accepted the ride the current driver was offered.

**Room:** `driver:<userId>`  
**Payload:**
```json
{ "rideId": 42, "reason": "accepted_by_another" }
```

Or when passenger cancels: `"reason": "passenger_cancelled"`

---

#### `ride:new_request`
A new searching ride broadcast to all available drivers of matching vehicle type (fallback/legacy).

**Room:** `drivers:available:<vehicleType>`  
**Payload:**
```json
{
  "rideId": 42,
  "vehicleType": "car",
  "pickupAddress": "Tahrir Square",
  "dropoffAddress": "Cairo Tower",
  "distanceKm": 4.321,
  "estimatedPrice": 28.50
}
```

---

#### `driver:checkin:required`
Driver has been online long enough to require a selfie check-in.

**Room:** `driver:<userId>`  
**Payload:**
```json
{
  "reason": "long_shift",
  "deadline": "2026-06-05T12:30:00Z",
  "message": "You have been online for over 10 hours. Please submit a selfie check-in within 30 minutes to continue."
}
```

---

#### `driver:checkin:approved`
Selfie check-in passed face detection.

**Room:** `driver:<userId>`  
**Payload:**
```json
{
  "checkinId": 15,
  "checkInType": "periodic_online",
  "submittedAt": "2026-06-05T10:00:00Z"
}
```

---

#### `driver:checkin:rejected`
Selfie check-in failed face detection, or deadline was missed (auto-offline).

**Room:** `driver:<userId>`  
**Payload:**
```json
{
  "checkinId": 15,
  "checkInType": "periodic_online",
  "submittedAt": "2026-06-05T10:00:00Z",
  "reason": "No face detected in the image — please retake your selfie in a well-lit area."
}
```

Auto-offline case:
```json
{
  "reason": "deadline_missed",
  "message": "You have been signed off automatically because the selfie check-in deadline passed."
}
```

---

#### `driver:cooldown:cleared`
Admin lifted the driver's dispatch cooldown.

**Room:** `driver:<userId>`  
**Payload:** (simple signal, no required fields)

---

### Events: Server → Trip Subscribers (Shuttle)

#### `passenger:trip:tracking`
Driver location update for shuttle trips.

**Room:** `trip:<tripId>`  
**Payload:**
```json
{
  "driverId": 5,
  "userId": 10,
  "latitude": 30.05,
  "longitude": 31.22,
  "speed": 45,
  "heading": 90,
  "tripId": 7,
  "timestamp": 1717582800000
}
```

Also used for lifecycle events: `{ "event": "trip:started", "tripId": 7, "timestamp": ... }` and `{ "event": "trip:completed", "tripId": 7, "timestamp": ... }`

---

#### `admin:track:trip`
Same payload as `passenger:trip:tracking`, mirrored to admin room.

**Room:** `admin:room`

---

### Events: Client → Server

#### `driver:location:update`
Driver sends their current GPS position (for shuttle trips).

**Sender:** `driver`  
**Payload:**
```json
{
  "latitude": 30.05,
  "longitude": 31.22,
  "speed": 45,
  "heading": 90,
  "tripId": 7
}
```

**Server response:** `driver:location:ack` → `{ "ok": true }`

---

#### `driver:ride:location`
Driver sends their position during a point-to-point ride (triggers passenger map update + deviation check).

**Sender:** `driver`  
**Payload:**
```json
{ "rideId": 42, "latitude": 30.05, "longitude": 31.22 }
```

---

#### `passenger:join:trip`
Passenger subscribes to shuttle trip tracking room.

**Sender:** `user`  
**Payload:** `tripId` (number)

---

#### `driver:trip:start`
Driver signals trip started.

**Sender:** `driver`  
**Payload:** `tripId` (number)

---

#### `driver:trip:complete`
Driver signals trip completed.

**Sender:** `driver`  
**Payload:** `tripId` (number)

---

#### `driver:status:online`
Driver goes online — joins `drivers:available:<vehicleType>` room.

**Sender:** `driver`  
**Payload:** (none)

---

#### `driver:status:offline`
Driver goes offline — leaves availability room.

**Sender:** `driver`  
**Payload:** (none)

---

#### `driver:status:busy`
Driver marks themselves busy — leaves availability room.

**Sender:** `driver`  
**Payload:** (none)

---

#### `join`
Generic acknowledgement event. Clients can send this to confirm socket readiness.

**Sender:** any  
**Payload:** `room` (string)  
**Callback:** `{ ok: true }`

---

#### `error`
Server-emitted error for invalid operations.

**Room:** direct to socket  
**Payload:**
```json
{ "message": "Forbidden" }
```

---

## 10. Automatic Surge Pricing

Surge pricing runs as a background job on a configurable interval (default **5 minutes**).

### Algorithm

Every tick:
1. Count `ridesTable` rows with `status = "searching"` grouped by `vehicleType` → **demand**.
2. Count `driversTable` rows with `status = "online" AND isOnline = true` grouped by `vehicleType` → **supply**.
3. Compute `ratio = demand / max(supply, 1)`. If both are 0, ratio = 0.
4. Map ratio to tier and multiplier:

| Ratio | Tier | Multiplier |
|-------|------|-----------|
| < 2.0 | `none` | 1.0× |
| 2.0 – 2.99 | `low` | 1.3× |
| 3.0 – 4.99 | `medium` | 1.6× |
| ≥ 5.0 | `high` | 2.0× (hard cap) |

5. If multiplier changed from previous tick → persist to `settings` table (key `surge_auto_<vehicleType>`) and emit `surge:updated` to `passengers:all`.

### Startup Behaviour

The server seeds in-memory surge state from `settings` at startup so there is no gap between restart and first tick. One immediate tick fires when the job starts.

### Application

Surge is applied at both `POST /rides/estimate` and `POST /rides/request` via an O(1) in-memory read — no extra DB query.

### Configuration

| Env Var | Default | Effect |
|---------|---------|--------|
| `SURGE_INTERVAL_MS` | `300000` (5 min) | How often the surge calculation runs |

---

## 11. Waiting Charge

Waiting charge accrues after the driver marks arrived (`driver_arrived` status) and the free window expires.

### Timeline

```
Driver marks arrived
       │
       ├── 3-minute free window begins
       │
[3 min elapsed]
       │
       ├── ride:waiting:charge:started emitted to passenger
       │
       ├── Per-minute billing starts (default 2.00 EGP/min)
       │   emit ride:waiting:charge:updated every 1 minute
       │
[max charge reached (default 20.00 EGP)]
       │
       └── ride:waiting:charge:capped emitted, billing stops
```

### Locking the Charge

- When the **driver starts the ride** (`PATCH /driver/rides/:id/start`): `stopWaitingTimer()` is called, the accrued charge is locked into `rides.waitingCharge`, and no-show timer is cleared.
- When the **passenger cancels** while status is `driver_arrived`: same locking mechanism; waiting charge is included in the fee calculation.

### Billing at Completion

`finalPrice = estimatedPrice (escrowed) + waitingCharge`

The base fare was already paid at request time. The waiting charge is an **additional** deduction from the passenger's wallet at completion.

### Configuration (Settings Keys)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `waiting_charge_per_minute` | number (string) | `2.00` | EGP per charged minute |
| `max_waiting_charge` | number (string) | `20.00` | Hard cap on total waiting charge |

These are snapshotted at timer start — changing them mid-ride does not affect in-progress rides.

### Restart Recovery

On server restart, the server re-hydrates in-memory timers from all rides in `driver_arrived` status using their stored `driverArrivedAt` timestamp. If the free window already elapsed, billing resumes immediately.

---

## 12. Driver Selfie Check-in

The check-in system enforces periodic identity verification for drivers during long shifts.

### Background Job

Runs every **60 seconds** (POLL_INTERVAL_MS). Two phases per sweep:

**Phase 1 — Prompt:**
- Finds online drivers whose `onlineSince` is more than `CHECKIN_PROMPT_HOURS` (default **10 hours**) ago, AND `checkInRequired = false`, AND no successful check-in since shift start.
- Sets `checkInRequired = true`, `checkInDeadline = now + DEADLINE_MINUTES` (default **30 min**).
- Emits `driver:checkin:required` to the driver.

**Phase 2 — Enforce:**
- Finds online drivers with `checkInRequired = true` AND `checkInDeadline < now`.
- Sets them offline: `isOnline = false`, `status = "offline"`.
- Emits `driver:checkin:rejected` with `reason: "deadline_missed"`.
- These drivers are excluded from dispatch (`checkInRequired = true` blocks dispatch selection).

### Driver Endpoints

#### POST `/api/driver/checkin`

**Auth:** `role = driver`  
**Content-Type:** `multipart/form-data`  
**Fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | image file | ✓ | jpeg, png, or webp; max 8 MB |
| `tripId` | string (int) | ✗ | Present for shuttle trip start check-ins |

**Flow:**
1. Uploads selfie to Supabase Storage (path: `checkins/driver_<id>/<checkInType>/<filename>`).
2. Runs face detection on the image buffer.
3. Inserts a `driver_check_ins` row.
4. If face detected: clears `checkInRequired`, `checkInDeadline`, sets `lastCheckInAt`; emits `driver:checkin:approved`.
5. If no face: emits `driver:checkin:rejected` with reason; driver must retry.

**`checkInType` values:** `"periodic_online"` (no tripId) or `"shuttle_trip_start"` (with tripId)

**Success 201:**
```json
{
  "id": 15,
  "driverId": 5,
  "checkInType": "periodic_online",
  "imageUrl": "https://...",
  "faceDetected": true,
  "submittedAt": "2026-06-05T10:00:00Z",
  "message": "Check-in accepted"
}
```

If face not detected: `"message": "No face detected — please retake your selfie"` (still 201).

---

#### GET `/api/driver/checkin/status`

**Auth:** `role = driver`  
**Success 200:**
```json
{
  "checkInRequired": true,
  "checkInDeadline": "2026-06-05T10:30:00Z",
  "lastCheckInAt": "2026-06-05T00:00:00Z",
  "isOnline": true,
  "onlineSince": "2026-06-05T00:00:00Z",
  "recentCheckins": [ { "id": 14, "faceDetected": true, ... } ]
}
```

---

#### GET `/api/admin/checkins`

**Auth:** admin  
**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `driverId` | int | Filter by driver |
| `faceDetected` | `"true"` \| `"false"` | Filter by detection result |
| `checkInType` | `"shuttle_trip_start"` \| `"periodic_online"` | |
| `since` | date string | Filter by submission time |
| `page` | int | |
| `limit` | int | Max 100 |

---

### Configuration (Environment Variables)

| Env Var | Default | Description |
|---------|---------|-------------|
| `CHECKIN_PROMPT_HOURS` | `10` | Hours online before check-in is required |
| `CHECKIN_DEADLINE_MINUTES` | `30` | Minutes to submit check-in before forced offline |
| `SUPABASE_URL` | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role key |
| `SUPABASE_BUCKET` | `"uploads"` | Storage bucket name |

---

## 13. SOS / Emergency

See §2 — `POST /api/rides/:id/sos` for the endpoint.

### What Happens

1. SOS row inserted into `sos_events` table: `userId`, `rideId`, `role` (`"passenger"` or `"driver"`), `latitude`, `longitude`, `notes`, `triggeredAt`.
2. `sos:triggered` emitted to `admin:room` immediately.
3. Response: `201 { sosId, message: "SOS received" }`.

No automatic ride cancellation — admin handles emergency response. The passenger app should show an SOS confirmation UI and a support contact.

---

## 14. Route Deviation Detection

Deviation detection runs server-side whenever the **driver** emits `driver:ride:location`.

### Algorithm

1. Compute the **cross-track (perpendicular) distance** from the driver's current position to the straight-line segment pickup→dropoff using the haversine formula.
2. If `deviationMeters > 500`:
   - Check if a warning was already sent for this ride within the last 60 seconds (throttle).
   - If not throttled, emit `ride:deviation:warning` to:
     - `passenger:<passengerId>`
     - `driver:<userId>`
     - `admin:room`

### Cleanup

`clearDeviationState(rideId)` is called when a ride is completed or cancelled to remove the throttle entry from memory.

### Passenger App Action

On receiving `ride:deviation:warning`, the passenger app should:
1. Display a warning banner with the deviation distance.
2. Offer the SOS button prominently.
3. Optionally allow the passenger to contact the driver.

---

## 15. Ride Sharing / Tracking Links

### POST `/api/rides/:id/share`

See §2.

### GET `/api/track/:token`

**Auth:** None — public endpoint  
**Usage:** Poll every few seconds from a read-only tracking page shared with 3rd parties.

**Success 200:**
```json
{
  "rideId": 42,
  "status": "driver_arrived",
  "pickup": {
    "address": "Tahrir Square",
    "latitude": 30.0444,
    "longitude": 31.2357
  },
  "dropoff": {
    "address": "Cairo Tower",
    "latitude": 30.0600,
    "longitude": 31.2200
  },
  "driver": {
    "name": "Mohamed",
    "vehicleType": "car",
    "latitude": 30.0450,
    "longitude": 31.2360,
    "locationFresh": true
  },
  "etaMinutes": 3,
  "expiresAt": "2026-06-06T10:00:00Z"
}
```

- `driver` is `null` if no driver is assigned.
- `driver.latitude`/`driver.longitude` are `null` if the driver's location is stale (> 10 min old).
- `etaMinutes` is computed as haversine(driver→dropoff) / 30 km/h. Only populated when status is `driver_arrived` or `in_progress` and location is fresh.

**Errors:**
- `400` — Invalid token
- `404` — `"Invalid or expired tracking link"` (token not found or past expiry)

---

## 16. Peak Hours Logic

### Definition

A "peak hour" is any time window configured in the `dispatch_peak_windows` settings key.

**Default windows:** `07:00–08:59` and `17:00–18:59` (server local time; `endHour` is exclusive).

### Effects

| System | Peak Effect |
|--------|------------|
| Dispatch batch size | Increases from `dispatch_drivers_per_round` to `dispatch_drivers_per_round_peak` (default 3 → 5) |
| Dispatch radius steps | Switches from `dispatch_radius_steps_km` to `dispatch_radius_steps_km_peak` (default [5,8,12] → [3,5,8] km) |
| Driver earnings | +20% peak bonus on top of driver cut, recorded as a separate earnings entry with `notes: "peak_hours_bonus"` |

### Configuration (Settings Keys)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `dispatch_peak_windows` | `[{ startHour, endHour }]` | `[{7,9},{17,19}]` | Peak time windows |
| `dispatch_drivers_per_round` | int | `3` | Batch size off-peak |
| `dispatch_drivers_per_round_peak` | int | `5` | Batch size during peak |
| `dispatch_radius_steps_km` | `number[]` | `[5, 8, 12]` | Radius expansion steps off-peak |
| `dispatch_radius_steps_km_peak` | `number[]` | `[3, 5, 8]` | Radius expansion steps during peak |

Peak settings are cached in memory for 1 minute to avoid DB hits on every dispatch round.

---

## 17. Service Controls

Service controls allow admins to enable/disable services and control their display mode in real time.

### Supported Service Types

`"shuttle"`, `"car"`, `"motorcycle"`, `"delivery"`

### GET `/api/services/control`

Get all service controls at once.

**Auth:** Any authenticated user  
**Success 200:**
```json
{
  "data": [
    {
      "serviceType": "car",
      "isEnabled": true,
      "displayMode": "live",
      "unavailableMessage": null,
      "unavailableAction": "none",
      "activeZoneIds": [],
      "maintenanceEta": null
    },
    { "serviceType": "shuttle", ... }
  ]
}
```

---

### GET `/api/services/:type/control`

Get a single service control.

**Auth:** Any authenticated user  
**`:type`:** `shuttle` | `car` | `motorcycle` | `delivery`  
**Success 200:** Single service control object (same fields as above, no `logs`).

---

### Admin Service Control Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/services/:type/control` | admin | Get control + last 10 change logs |
| `PATCH` | `/api/admin/services/:type/control` | admin | Update fields |
| `POST` | `/api/admin/services/:type/control/reset` | admin | Reset to defaults |

**`PATCH /api/admin/services/:type/control` body (all optional):**

| Field | Type | Description |
|-------|------|-------------|
| `isEnabled` | boolean | Master on/off switch |
| `displayMode` | `"live"` \| `"coming_soon"` \| `"unavailable"` \| `"maintenance"` | UI display state |
| `unavailableMessage` | string \| null | Custom message to show users |
| `unavailableAction` | `"none"` \| `"show_message"` \| `"hide_service"` | What UI does when unavailable |
| `activeZoneIds` | number[] | Zone IDs where service is available |
| `maintenanceEta` | ISO datetime string \| null | Expected restoration time |
| `maxActiveRides` | int \| null | Cap on concurrent active rides |

**Side effect:** Every PATCH and reset emits `service:control:changed` to ALL connected sockets (not just admin room).

**Defaults:**
```json
{
  "isEnabled": true,
  "displayMode": "live",
  "unavailableMessage": null,
  "unavailableAction": "none",
  "activeZoneIds": [],
  "maintenanceEta": null,
  "maxActiveRides": null
}
```

---

## 18. Notifications

### GET `/api/notifications`

List the authenticated user's notifications.

**Auth:** Any authenticated user  
**Query params:** `page` (default 1), `limit` (default 20, max 100)

**Success 200:**
```json
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "title": "Ride Completed",
      "body": "Your ride is complete. Final fare: 30.50 EGP",
      "isRead": false,
      "createdAt": "2026-06-05T10:05:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### PATCH `/api/notifications/:id/read`

Mark a single notification as read.

**Auth:** Any authenticated user  
**Success 200:** Updated notification object.  
**Errors:** `404` — notification not found.

---

### PATCH `/api/notifications/read-all`

Mark all of the authenticated user's notifications as read.

**Auth:** Any authenticated user  
**Success 200:** `{ "ok": true }`

---

### Admin Notification Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/notifications` | admin | Create a notification for a specific user |
| `POST` | `/api/admin/notifications/broadcast` | admin | Broadcast to a targeted group |
| `GET` | `/api/admin/notifications/history` | admin | All notifications, paginated |

**`POST /api/admin/notifications/broadcast` body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✓ | |
| `body` | string | ✓ | |
| `target` | `"all"` \| `"users"` \| `"drivers"` \| `"specific"` | ✓ | |
| `userId` | int | ✗ | Required when `target = "specific"` |
| `includeBlocked` | boolean | ✗ | Default false |
| `minRating` | number | ✗ | Filter drivers by minimum rating |
| `minTripCount` | int | ✗ | Filter users by minimum trip count |

Also emits `notification:new` via WebSocket to each affected user.

---

## 19. Users & Profile

### GET `/api/users/me`

Get the authenticated user's full profile including role permissions.

**Auth:** Any authenticated user  
**Success 200:**
```json
{
  "id": 1,
  "name": "Ali Hassan",
  "email": "ali@example.com",
  "phone": "+201234567890",
  "role": "user",
  "avatarUrl": null,
  "isVerified": true,
  "walletBalance": 150.00,
  "createdAt": "2026-06-01T10:00:00Z",
  "permissions": []
}
```

**Note:** Password, refreshToken, OTP fields are **never** returned.

---

### PATCH `/api/users/me`

Update the authenticated user's profile.

**Auth:** Any authenticated user  
**Allowed fields only:**

| Field | Type |
|-------|------|
| `name` | string |
| `phone` | string |
| `avatarUrl` | string \| null |

**Do NOT send:** `email`, `password`, `role`, `walletBalance`, `dob` — these are ignored or rejected.

**Success 200:** Updated user object (same shape as `GET /users/me`).

---

### POST `/api/users/me/push-token`

Register a push notification token.

**Auth:** Any authenticated user  
**Body:**

| Field | Type | Required |
|-------|------|----------|
| `token` | string | ✓ |
| `platform` | `"ios"` \| `"android"` \| `"web"` | ✗ |

**Success 200:** `{ "success": true, "message": "Push token registered" }`

---

### GET `/api/users/me/bookings`

Get the authenticated user's shuttle bookings (not ride bookings).

**Auth:** Any authenticated user  
**Success 200:** Array of booking objects, each including nested trip details.

---

## 20. All Configurable Settings Keys

Settings are stored in the `settings` table as `{ key: string, value: JSON-encoded-string }`. They are read at runtime — no server restart needed. All values are JSON-parsed on read.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `driver_commission_rate` | number | `0.15` | Platform cut (e.g. 0.15 = 15%). Driver gets `1 - rate`. |
| `active_ride_cancellation_fee` | number | `0` | Flat fee (EGP) when passenger cancels during an `active` ride |
| `cancellation_fee_arrived` | number | `5.00` | Flat fee (EGP) when passenger cancels after driver has arrived |
| `waiting_charge_per_minute` | number | `2.00` | EGP charged per minute after the 3-minute free window |
| `max_waiting_charge` | number | `20.00` | Maximum waiting charge cap per ride |
| `no_show_timeout_minutes` | number | `10` | Minutes in `driver_arrived` before auto no-show cancellation |
| `dispatch_peak_windows` | `[{startHour, endHour}]` | `[{7,9},{17,19}]` | Peak hour windows in server local time |
| `dispatch_drivers_per_round` | int | `3` | Off-peak dispatch batch size |
| `dispatch_drivers_per_round_peak` | int | `5` | Peak dispatch batch size |
| `dispatch_radius_steps_km` | `number[]` | `[5, 8, 12]` | Radius expansion steps off-peak |
| `dispatch_radius_steps_km_peak` | `number[]` | `[3, 5, 8]` | Radius expansion steps during peak |
| `surge_auto_car` | SurgeState JSON | — | Persisted surge state for cars (managed by system) |
| `surge_auto_bike` | SurgeState JSON | — | Persisted surge state for bikes (managed by system) |

**Reading settings:** All settings fall back gracefully to their defaults if the key is absent from the DB. The passenger app does not read settings directly — they affect API behaviour.

---

## 21. Rate Limits & Timeouts

### HTTP Rate Limits

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| `POST /api/rides/request` | 3 requests | 2 minutes | Per user ID |

**Rate limit response (429):**
```json
{
  "error": "Too many ride requests. You can request at most 3 rides per 2 minutes.",
  "retryAfterSeconds": 120
}
```

The limit is configurable via environment variables:

| Env Var | Default | Description |
|---------|---------|-------------|
| `RIDE_REQUEST_RATE_WINDOW_MS` | `120000` (2 min) | Window in milliseconds |
| `RIDE_REQUEST_RATE_MAX` | `3` | Max requests per window |

---

### Dispatch Timeouts

| Timeout | Value | Configuration |
|---------|-------|---------------|
| Per-round driver offer window | **15 seconds** | Hardcoded (`ROUND_TIMEOUT_MS`) |
| Driver location staleness (excluded from dispatch) | **10 minutes** | Hardcoded |
| Driver recency penalty window | **10 minutes** | Hardcoded |
| Cooldown after 3 consecutive rejections | **10 minutes** | Hardcoded |
| Cooldown threshold (rejections before cooldown) | **3** | Hardcoded |

---

### Waiting Charge Timers

| Timer | Value | Configuration |
|-------|-------|---------------|
| Free waiting window | **3 minutes** | Hardcoded |
| Billing tick interval | **1 minute** | Hardcoded |
| Maximum waiting charge | **20.00 EGP** | Setting: `max_waiting_charge` |

---

### No-show Timer

| Timer | Value | Configuration |
|-------|-------|---------------|
| No-show window (from `driverArrivedAt`) | **10 minutes** | Setting: `no_show_timeout_minutes` |

---

### Driver Check-in Monitor

| Timer | Value | Configuration |
|-------|-------|---------------|
| Sweep interval | **60 seconds** | Hardcoded |
| Shift length before prompt | **10 hours** | Env: `CHECKIN_PROMPT_HOURS` |
| Deadline window after prompt | **30 minutes** | Env: `CHECKIN_DEADLINE_MINUTES` |

---

### Ride Share Token

| Value | Duration |
|-------|----------|
| Share token TTL | **24 hours** |

---

### OTP / Password Reset

| Token | Expiry |
|-------|--------|
| OTP code (phone verify) | **10 minutes** |
| Password reset token | **1 hour** |

---

### Surge Pricing

| Interval | Value | Configuration |
|----------|-------|---------------|
| Surge recalculation interval | **5 minutes** | Env: `SURGE_INTERVAL_MS` |
| Driver location stale threshold for tracking link | **10 minutes** | Hardcoded |

---

### Route Deviation Detection

| Value | Amount |
|-------|--------|
| Deviation threshold | **500 metres** |
| Throttle window (suppress repeat warnings) | **60 seconds** per ride |

---

## 22. Error Reference

### HTTP Status Codes Used

| Code | When |
|------|------|
| `200` | Success (GET, PATCH, some POST responses) |
| `201` | Resource created (POST /rides/request, POST /auth/register, etc.) |
| `204` | Deleted with no body (DELETE /admin/ratings/:id) |
| `400` | Validation error — missing or invalid fields, expired OTP/token, wrong body shape |
| `401` | Missing/invalid/expired access token, invalid refresh token, user not found |
| `402` | Insufficient wallet balance |
| `403` | Account is blocked, or `requireRole` mismatch, or not a party to this ride |
| `404` | Resource not found (ride, user, driver, promo code, tracking token, etc.) |
| `409` | Conflict — already have an active ride, ride taken by another driver, promo limit race, already rated, ride not in shareable status, SOS on non-active ride |
| `429` | Rate limit exceeded (ride request limiter) |
| `500` | Internal server error — DB failure, SMS failure, Supabase upload failure |

### Error Body Shape

All error responses follow:
```json
{ "error": "Human-readable message" }
```

Some errors include additional fields:

```json
{ "error": "Insufficient wallet balance", "required": 28.50, "balance": 10.00 }
```

```json
{ "error": "You already have an active ride request", "activeRideId": 42, "activeStatus": "searching" }
```

```json
{ "error": "Too many ride requests. ...", "retryAfterSeconds": 120 }
```

```json
{ "error": "Ride is no longer available (status: driver_assigned)" }
```

```json
{ "error": "SOS can only be triggered on an active ride", "rideStatus": "completed" }
```
