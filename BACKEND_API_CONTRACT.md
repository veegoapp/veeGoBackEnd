# VeeGo Backend API Contract

> **Generated:** 2026-06-06 · **Audited & corrected:** 2026-06-06  
> **Source:** `artifacts/api-server` (Express + TypeScript, Drizzle ORM, PostgreSQL)  
> **Base URL:** All REST endpoints are prefixed with `/api` (e.g., `POST /api/auth/register`)  
> **Audit note:** See `FRONTEND_AUDIT_VERDICTS.md` for the full cross-check that produced this corrected version.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Error Format](#error-format)
5. [REST Endpoints](#rest-endpoints)
   - [Health](#health)
   - [Auth Endpoints](#auth-endpoints)
   - [Users (Canonical Profile)](#users-canonical-profile)
   - [User Saved Locations](#user-saved-locations)
   - [Rides — Fare Estimate](#rides--fare-estimate)
   - [Rides — Passenger](#rides--passenger)
   - [Rides — Driver Actions](#rides--driver-actions)
   - [Rides — Admin](#rides--admin)
   - [Ratings](#ratings)
   - [Tracking (Public Share Links)](#tracking-public-share-links)
   - [SOS Events](#sos-events)
   - [Driver Self-Service](#driver-self-service)
   - [Driver Trips (Shuttle)](#driver-trips-shuttle)
   - [Driver Wallet & Earnings](#driver-wallet--earnings)
   - [Driver Documents](#driver-documents)
   - [Driver Check-In (Selfie)](#driver-check-in-selfie)
   - [Notifications](#notifications)
   - [Wallet (Passenger)](#wallet-passenger)
   - [Payments](#payments)
   - [Shuttle Lines & Bookings](#shuttle-lines--bookings)
   - [Routes](#routes)
   - [Trips](#trips)
   - [Buses](#buses)
   - [Vehicles](#vehicles)
   - [Schedules](#schedules)
   - [Chat (Shuttle Trips Only)](#chat-shuttle-trips-only)
   - [Promo Codes](#promo-codes)
   - [Support Tickets](#support-tickets)
   - [Zones & Zone Pricing](#zones--zone-pricing)
   - [Suggestions](#suggestions)
   - [Earnings](#earnings)
   - [Service Controls](#service-controls)
   - [Dashboard (Admin)](#dashboard-admin)
   - [Admin: Users & Drivers](#admin-users--drivers)
   - [Admin: Analytics](#admin-analytics)
   - [Admin: Settings](#admin-settings)
   - [Admin: Dispatch / Peak Settings](#admin-dispatch--peak-settings)
   - [Admin: SOS Events](#admin-sos-events)
   - [Admin: Audit Logs](#admin-audit-logs)
   - [Admin: Staff & Roles](#admin-staff--roles)
   - [Admin: Bookings & Transactions](#admin-bookings--transactions)
   - [Admin: Location History](#admin-location-history)
6. [Socket.IO Events](#socketio-events)
7. [Background Jobs](#background-jobs)
8. [Environment Variables](#environment-variables)

---

## Overview

VeeGo is a ride-sharing and shuttle platform with three actor roles:

| Role | Description |
|------|-------------|
| `user` | Passenger (books rides, shuttle trips) |
| `driver` | Driver (accepts rides, runs shuttle trips) |
| `admin` | Platform admin / staff |

The server uses:
- **Express** with TypeScript
- **Drizzle ORM** + **PostgreSQL**
- **Socket.IO** for real-time events
- **Supabase Storage** for file uploads (driver documents, selfies)
- **JWT** for authentication (access + refresh token pair)

---

## Authentication

All protected endpoints require:

```
Authorization: Bearer <access_token>
```

Tokens are obtained via `POST /api/auth/login` or `POST /api/auth/admin/login`.

### Middleware

| Middleware | Description |
|-----------|-------------|
| `authenticate` | Verifies JWT; attaches `req.user = { id, role }` |
| `requireRole(...roles)` | Checks `req.user.role` against the allowed list |
| `requirePermission(perm)` | Checks staff permission; super-admins bypass this check |

### Roles on endpoints

- **No auth** — public endpoints (noted explicitly)
- **`user`** — passenger-only
- **`driver`** — driver-only
- **`admin`** — admin/staff only
- **`any`** — any authenticated role

---

## Rate Limiting

| Scope | Limit |
|-------|-------|
| Auth endpoints (`/auth/*`) | 20 requests / 15 minutes |
| All API endpoints | 200 requests / 15 minutes |
| Ride requests (`POST /rides/request`) | 3 requests / 2 minutes per user (configurable via `RIDE_RATE_LIMIT_*` env vars) |

---

## Error Format

All errors return JSON:

```json
{ "error": "Human-readable message" }
```

Some endpoints include additional fields:

```json
{ "error": "...", "details": {} }
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| 400 | Validation error / bad request |
| 401 | Missing or invalid token |
| 403 | Forbidden (wrong role or ownership) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, wrong state) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## REST Endpoints

### Health

#### `GET /api/health`

No auth required.

**Response 200:**
```json
{ "status": "ok", "timestamp": "2026-06-06T12:00:00.000Z" }
```

---

### Auth Endpoints

#### `POST /api/auth/register`

Register a new passenger account.

**No auth required.**

**Request body:**
```json
{
  "name": "string (required)",
  "email": "string (required, email)",
  "phone": "string (required)",
  "password": "string (required, min 8 chars)"
}
```

**Response 201:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": { "id": 1, "name": "...", "email": "...", "phone": "...", "role": "user" }
}
```

---

#### `POST /api/auth/login`

Passenger / driver login. **Blocks `role=admin` users** (they must use `/auth/admin/login`).

**No auth required.**

**Request body:**
```json
{ "email": "string", "password": "string" }
```

**Response 200:** Same shape as `/auth/register`.

**Error 403** if account is blocked. **Error 403** if role is `admin`.

---

#### `POST /api/auth/admin/login`

Admin-only login endpoint.

**No auth required.**

**Request body:**
```json
{ "email": "string", "password": "string" }
```

**Response 200:** Same shape as `/auth/register`. Token payload includes `role: "admin"`.

---

#### `POST /api/auth/refresh`

Exchange a refresh token for a new access token.

**No auth required.**

**Request body:**
```json
{ "refreshToken": "string" }
```

**Response 200:**
```json
{ "accessToken": "string", "refreshToken": "string" }
```

---

#### `POST /api/auth/logout`

Invalidate the current refresh token.

**Auth: any.**

**Request body:**
```json
{ "refreshToken": "string" }
```

**Response 200:** `{ "message": "Logged out successfully" }`

---

#### `GET /api/auth/me` *(deprecated)*

Returns the current user's profile. **Deprecated — use `GET /api/users/me` instead.**  
Both paths return identical payloads today; `/auth/me` may be removed in a future release.

**Auth: any.**

---

#### `PATCH /api/auth/me` *(deprecated)*

Update the authenticated user's profile. **Deprecated — use `PATCH /api/users/me` instead.**

**Auth: any.**

**Request body (all optional):**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "currentPassword": "string (required when changing password)",
  "newPassword": "string"
}
```

---

#### `POST /api/auth/driver/register`

Register a new driver account.

**No auth required.**

**Request body:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "password": "string (min 8)",
  "vehicleType": "car | motorcycle | van | minibus",
  "plateNumber": "string",
  "make": "string",
  "model": "string",
  "year": "number",
  "color": "string"
}
```

**Response 201:** Same shape as `/auth/register`.

---

#### `POST /api/auth/forgot-password`

Initiate a phone-based password reset. Sends a one-time reset code via SMS.

**No auth required.**

**Request body:**
```json
{ "phone": "string (min 5 chars)" }
```

**Business logic:**
- Always returns a success response to prevent phone number enumeration.
- If the phone is registered: generates an 8-character uppercase hex token, stores it in `users.passwordResetToken` with a 1-hour expiry, and sends it via SMS.
- If the phone is not registered: silently returns success.

**Response 200:**
```json
{ "success": true, "message": "If this phone is registered, a reset code has been sent" }
```

---

#### `POST /api/auth/reset-password`

Confirm a reset token and set a new password.

**No auth required.**

**Request body:**
```json
{
  "phone": "string",
  "token": "string (6+ chars, the code from SMS)",
  "newPassword": "string (min 8 chars)"
}
```

**Business logic:**
- Validates token against `users.passwordResetToken` and checks expiry.
- On success: hashes the new password, clears the reset token, and invalidates any existing refresh token.

**Response 200:**
```json
{ "success": true, "message": "Password updated successfully. Please log in with your new password." }
```

**Error 400:** Invalid phone, invalid token, or token expired.

---

### Users (Canonical Profile)

> **These are the canonical user profile endpoints.** The old `/auth/me` and `/auth/me` paths are deprecated aliases that still work today.

#### `GET /api/users/me`

Get the authenticated user's own profile, including role permissions.

**Auth: any.**

**Response 200:**
```json
{
  "id": 1,
  "name": "...",
  "email": "...",
  "phone": "...",
  "role": "user | driver | admin",
  "walletBalance": 100.00,
  "isBlocked": false,
  "permissions": ["view_dashboard", "..."],
  "createdAt": "..."
}
```

---

#### `PATCH /api/users/me`

Update the authenticated user's own profile.

**Auth: any.**

**Request body (all optional):**
```json
{ "name": "string", "email": "string", "phone": "string" }
```

**Response 200:** Updated user object (same shape as GET).

---

#### `POST /api/users/me/push-token`

Register a device push notification token for the authenticated user.

**Auth: any.**

**Request body:**
```json
{
  "token": "string (required)",
  "platform": "ios | android | web (optional)"
}
```

**Response 200:** `{ "success": true, "message": "Push token registered" }`

---

#### `GET /api/users/me/bookings`

Get the authenticated user's shuttle bookings with trip details.

**Auth: any.**

**Response 200:** Array of booking objects, each including a nested `trip` object.

---

#### `GET /api/users`

List all users (passengers).

**Auth: admin.**

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 100) |
| `search` | string | — | Filter by name/email/phone |
| `isBlocked` | boolean | — | Filter by block status |

**Response 200:**
```json
{ "data": [ { ...user } ], "total": 50, "page": 1, "limit": 20 }
```

---

#### `GET /api/users/:id`

Get a single user.

**Auth: admin.**

---

#### `PATCH /api/users/:id`

Update a user's profile or block status.

**Auth: admin.**

**Request body (all optional):**
```json
{ "name": "string", "email": "string", "phone": "string", "isBlocked": false }
```

---

#### `GET /api/users/:id/rides`

List a user's ride history.

**Auth: admin.**

**Query params:** `page`, `limit`

---

#### `POST /api/users/:id/wallet/adjust`

Admin credit/debit of a user's wallet. Positive = credit; negative = debit.

**Auth: admin.**

**Request body:**
```json
{ "amount": 50.00, "description": "string" }
```

**Response 200:** `{ "walletBalance": 150.00 }`

---

### User Saved Locations

#### `GET /api/user/locations`

**Auth: user.**

**Response 200:**
```json
{
  "data": [
    { "id": 1, "label": "home | work | other", "name": "...", "address": "...", "latitude": 30.0, "longitude": 31.0, "isDefault": true }
  ],
  "total": 3
}
```

---

#### `POST /api/user/locations`

**Auth: user.**

**Request body:**
```json
{
  "label": "home | work | other",
  "name": "string",
  "address": "string",
  "latitude": "number (-90 to 90)",
  "longitude": "number (-180 to 180)",
  "isDefault": false
}
```

If `isDefault: true`, all other locations for the user are set to `isDefault: false`.

**Response 201:** Location object.

---

#### `PATCH /api/user/locations/:id`

**Auth: user.** All fields optional.

**Response 200:** Updated location object.

---

#### `DELETE /api/user/locations/:id`

**Auth: user.**

**Response 204.**

---

#### `GET /api/admin/user-locations`

**Auth: admin.**

**Query params:** `userId` (required, int)

**Response 200:** `{ "data": [...locations], "total": N }`

---

### Rides — Fare Estimate

#### `POST /api/rides/estimate`

Calculate a fare estimate before booking. Applies zone-specific pricing and the live surge multiplier. **Call this before `POST /rides/request`.**

**Auth: any authenticated user.**

**Request body:**
```json
{
  "vehicleType": "car | bike",
  "pickupLatitude": 30.0,
  "pickupLongitude": 31.0,
  "dropoffLatitude": 30.1,
  "dropoffLongitude": 31.1
}
```

**Business logic:**
1. Looks up all active zone-pricing rules for the given `vehicleType`.
2. Finds which zone (if any) contains the pickup point using haversine distance to each zone's center.
3. Falls back to global ride pricing if no zone matches.
4. Returns 404 if no pricing exists for the vehicle type.
5. Applies the current surge multiplier from the in-memory surge state (no DB round-trip).

**Response 200:**
```json
{
  "data": {
    "distanceKm": 5.123,
    "estimatedDurationMinutes": 10,
    "estimatedPrice": 45.50,
    "surgeActive": false,
    "surgeMultiplier": 1,
    "pricingSource": "zone:Downtown | global"
  }
}
```

**Error 404:** No active pricing configured for the vehicle type.

---

### Rides — Passenger

Ride status lifecycle:
```
searching → driver_assigned → driver_arrived → active → completed
                                               ↓
                  cancelled (from any pre-completed status)
```

#### `POST /api/rides/request`

Request a new ride. The estimated fare is escrowed from the passenger's wallet immediately.

**Auth: user.**  
**Rate limit:** 3 requests / 2 minutes per user.

**Request body:**
```json
{
  "vehicleType": "car | bike",
  "pickupLatitude": 30.0,
  "pickupLongitude": 31.0,
  "pickupAddress": "string",
  "dropoffLatitude": 30.1,
  "dropoffLongitude": 31.1,
  "dropoffAddress": "string",
  "promoCode": "string (optional)"
}
```

**Business logic:**
- Service must be enabled (`isEnabled: true`, `displayMode: "live"`).
- Wallet balance must cover the estimated fare (computed fresh using the same zone+surge logic as `/rides/estimate`).
- If a valid promo code is provided, the fare is discounted; `promoCode.usedCount` is incremented.
- The estimated fare is escrowed (deducted from wallet; not paid to driver until ride completion).
- Dispatch starts immediately — nearby drivers are notified via Socket.IO.

**Response 201:**
```json
{ "data": { ...ride } }
```

---

#### `GET /api/rides/my`

List the authenticated passenger's own rides.

**Auth: user.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by ride status |
| `vehicleType` | string | Filter by vehicle type |
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 100 |

**Response 200:**
```json
{ "data": [...rides], "meta": { "total": N, "page": 1, "limit": 20 } }
```

---

#### `GET /api/rides/active`

Get the passenger's currently active ride (any non-terminal status).

**Auth: user.**

**Response 200:** `{ "data": { ...ride } }` or `{ "data": null }`.

---

#### `GET /api/rides/:id`

Get a specific ride. Accessible by the ride's passenger, its driver, or any admin.

**Auth: any.**

**Response 200:** `{ "data": { ...ride } }`

---

#### `GET /api/rides/:id/events`

Get the event log for a ride.

**Auth: user.**

**Response 200:** `{ "data": [...rideEvents] }`

---

#### `PATCH /api/rides/:id/cancel`

Passenger cancels a ride.

**Auth: user.**

**Request body:**
```json
{ "reason": "string (optional)" }
```

**Allowed statuses:** `searching`, `driver_assigned`, `driver_arrived`

**Cancellation fees:**
| Status at cancellation | Fee |
|----------------------|-----|
| `searching` | Full refund (no fee) |
| `driver_assigned` | `cancellation_fee_assigned` setting (default 2.00 EGP) |
| `driver_arrived` | `cancellation_fee_arrived` setting (default 5.00 EGP) + accrued waiting charge |

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `POST /api/rides/:id/share`

Generate a shareable tracking link for an active ride (idempotent — returns existing token if still valid).

**Auth: user (must be ride's passenger).**

**Ride must be in status:** `requested | driver_arrived | in_progress`

**Response 201:**
```json
{ "token": "string", "url": "https://.../api/track/<token>", "expiresAt": "ISO8601" }
```

Token TTL: 24 hours.

---

#### `POST /api/rides/:id/sos`

Trigger an SOS emergency signal during an active ride.

**Auth: user or driver (must be a party to the ride).**

**Ride must be in status:** `driver_arrived | in_progress`

**Request body:**
```json
{
  "latitude": 30.0,
  "longitude": 31.0,
  "notes": "string (optional, max 500 chars)"
}
```

**Side effects:** Immediately emits `sos:triggered` to the `admin:room` Socket.IO room.

**Response 201:** `{ "sosId": N, "message": "SOS received" }`

---

### Rides — Driver Actions

#### `PATCH /api/driver/rides/:id/accept`

Driver accepts a ride offer.

**Auth: driver.**

**Business logic:**
- Driver must be `online` with an active vehicle.
- Service settings validated: minimum driver rating, insurance/background-check requirements, max active rides.
- Atomically sets ride → `driver_assigned` (returns 409 if another driver grabbed it first).
- Driver status → `busy`.
- Passenger notified via Socket.IO `ride:driver_assigned`.

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/arrived`

Driver signals arrival at pickup.

**Auth: driver.**

**Business logic:**
- Ride must be `driver_assigned`.
- Status → `driver_arrived`.
- Starts the **waiting timer** (3-minute free window, then per-minute charge).
- Starts the **no-show timer** (default 10-minute window).
- Passenger notified via `ride:driver_arrived`.

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/start`

Driver starts the ride (passenger boarded).

**Auth: driver.**  
*(Backward-compat alias: `POST /api/driver/rides/:id/start` — same logic.)*

**Business logic:**
- Ride must be `driver_arrived`.
- Stops both timers; waiting charge is locked.
- Status → `active`.
- Passenger notified via `ride:started`.

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/complete`

Driver completes the ride.

**Auth: driver.**  
*(Backward-compat alias: `POST /api/driver/rides/:id/complete` — same logic.)*

**Business logic:**
- Ride must be `active`.
- `finalPrice = estimatedPrice + waitingCharge`
- Platform commission deducted (`driver_commission_rate` setting, default 15%).
- Peak hours bonus: +20% of driver cut if peak hours are active.
- Driver earnings record inserted.
- Waiting charge deducted from passenger wallet (base fare was already escrowed).
- Driver status → `online`.
- Passenger notified via `ride:completed`.

**Response 200:** `{ "data": { "rideId": N, "finalPrice": N, "driverCut": N, "waitingCharge": N } }`

---

#### `POST /api/driver/rides/:id/decline`

Driver declines a ride offer.

**Auth: driver.**  
*(Backward-compat; prefer the PATCH variant.)*

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/cancel`

Driver cancels a ride they had already accepted (re-dispatches to another driver).

**Auth: driver.**

**Allowed statuses:** `driver_assigned`, `driver_arrived`

**Business logic:**
- Ride → `searching`; driver → `online`.
- Wallet escrow stays intact; no refund issued.
- Passenger notified via `ride:driver_cancelled`.
- Dispatch re-started from scratch.

**Response 200:** `{ "data": { "rideId": N, "status": "searching", "message": "..." } }`

---

#### `GET /api/driver/rides`

List the driver's own rides.

**Auth: driver.**

**Query params:** `status`, `page`, `limit`

**Response 200:** `{ "data": [...rides], "total": N }`

---

#### `GET /api/driver/rides/active`

Get the driver's currently active ride.

**Auth: driver.**

**Response 200:** `{ "data": { ...ride } }` or `{ "data": null }`.

---

#### `GET /api/driver/rides/available`

List rides currently searching for a driver (for manual dispatch / admin view).

**Auth: driver.**

**Response 200:** Array of available ride objects.

---

### Rides — Admin

#### `GET /api/admin/rides`

List all rides platform-wide.

**Auth: admin.**

**Query params:** `page`, `limit`, `status`, `vehicleType`, `search`

**Response 200:** `{ "data": [...rides], "total": N }`

---

#### `GET /api/admin/rides/:id`

Get a single ride (admin view, includes full driver and passenger data).

**Auth: admin.**

---

#### `PATCH /api/admin/rides/:id`

Admin force-updates a ride (status, driver assignment, cancel reason, etc.).

**Auth: admin.**

**Request body (all optional):**
```json
{ "status": "string", "driverId": "number", "cancelReason": "string" }
```

---

#### `GET /api/admin/rides/pricing`

List all ride pricing tiers (per vehicle type).

**Auth: admin.**

**Response 200:** Array of pricing objects with `vehicleType`, `baseFare`, `perKmRate`, `minimumFare`, `isActive`.

---

#### `PATCH /api/admin/rides/pricing/:vehicleType`

Update pricing for a specific vehicle type.

**Auth: admin.**

**Request body (all optional):**
```json
{ "baseFare": 5.00, "perKmRate": 2.50, "minimumFare": 8.00, "isActive": true }
```

**Response 200:** Updated pricing object.

---

### Ratings

#### `POST /api/rides/:id/rate-driver`

Passenger rates the driver after a completed ride.

**Auth: user.**

**Request body:**
```json
{ "rating": 1-5, "comment": "string (optional)" }
```

**Business logic:** Recalculates and updates `drivers.rating` as the rolling average of all `DRIVER_RATED` events. Returns 409 if the ride was already rated.

**Response 201:** `{ "ok": true, "rideId": N, "rating": N }`

---

#### `POST /api/driver/rides/:id/rate-rider`

Driver rates the passenger after a completed ride.

**Auth: driver.**

**Request body:**
```json
{ "rating": 1-5, "comment": "string (optional)" }
```

**Response 201:** `{ "ok": true, "rideId": N, "rating": N }`

---

### Tracking (Public Share Links)

#### `GET /api/track/:token`

Retrieve real-time ride data via a share token. **No auth required.** Public endpoint.

**Response 200:** Ride object including driver location, status, pickup/dropoff, estimated ETA.  
**Response 401:** Token expired or not found.

---

### SOS Events

*(See also Admin: SOS Events for the admin management endpoints.)*

The `POST /api/rides/:id/sos` passenger/driver endpoint is documented in [Rides — Passenger](#rides--passenger) above.

---

### Driver Self-Service

#### `GET /api/driver/profile`

**Auth: driver.**

**Response 200:** Driver profile object.

---

#### `PATCH /api/driver/profile`

**Auth: driver.**

**Request body (all optional):**
```json
{ "name": "string", "phone": "string", "email": "string" }
```

**Response 200:** Updated driver profile.

---

#### `GET /api/driver/status`

**Auth: driver.**

**Response 200:** `{ "status": "online | offline | busy", "isOnline": true }`

---

#### `PATCH /api/driver/status`

Toggle the driver online/offline.

**Auth: driver.**

**Request body:**
```json
{ "isOnline": true, "latitude": 30.0, "longitude": 31.0 }
```

**Side effects on going online:** Sets `onlineSince`, emits `driver:status:online`.  
**Side effects on going offline:** Blocked if driver has an active ride; clears online state.

**Response 200:** `{ "status": "online | offline", "isOnline": true }`

---

#### `PATCH /api/driver/location`

Update the driver's current GPS location.

**Auth: driver.**

**Request body:**
```json
{ "latitude": 30.0, "longitude": 31.0, "heading": 90.0 }
```

**Side effects:**
- Updates `drivers.currentLatitude/Longitude`.
- Inserts a row into `driver_locations` history.
- Emits `driver:location:ack` to the driver's own socket.
- If a ride is active, emits `ride:driver_location` to the passenger.
- Checks for route deviation (threshold: 500 m); emits `ride:deviation:warning` to admin + passenger (throttled to once per 60 s).

**Response 200:** `{ "ok": true }`

---

#### `GET /api/driver/settings`

**Auth: driver.**

**Response 200:** `{ "notifications": true, "language": "en" }`

---

#### `PATCH /api/driver/settings`

**Auth: driver.**

**Request body (all optional):**
```json
{ "notifications": true, "language": "ar" }
```

**Response 200:** Updated settings.

---

#### `GET /api/driver/notifications`

Get the driver's notification list (last 50).

**Auth: driver.**

**Response 200:** `{ "data": [...notifications] }`

---

#### `GET /api/driver/reviews`

Get passenger ratings/reviews left for the driver.

**Auth: driver.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...reviews], "total": N, "page": N, "limit": N, "averageRating": 4.7 }`

---

#### `GET /api/driver/promotions`

Get available driver promotions (currently static/hardcoded).

**Auth: driver.**

**Response 200:** `{ "data": [ { "id": "promo_peak_hours", "bonusPercentage": 20, ... }, { "id": "promo_weekend", ... } ] }`

---

#### `GET /api/drivers`

List all drivers.

**Auth: admin.**

**Query params:** `page`, `limit`, `search`, `status` (`online|offline|busy`), `isActive`, `vehicleType`

**Response 200:** `{ "data": [...drivers], "total": N }`

---

#### `GET /api/drivers/:id`

Get a single driver's full profile.

**Auth: admin.**

---

#### `PATCH /api/drivers/:id`

Admin updates a driver.

**Auth: admin.**

**Request body (all optional):**
```json
{ "name": "string", "isActive": true, "isOnline": false, "status": "string" }
```

---

### Driver Trips (Shuttle)

#### `GET /api/driver/trips`

**Auth: driver.**

**Query params:** `page`, `limit`, `status`

**Response 200:** `{ "data": [...trips], "total": N }`

---

#### `GET /api/driver/trips/:id`

**Auth: driver.**

**Response 200:** Trip object with bookings.

---

#### `PATCH /api/driver/trips/:id/accept`

**Auth: driver.**

**Response 200:** Updated trip.

---

#### `PATCH /api/driver/trips/:id/reject`

**Auth: driver.**

**Response 200:** Updated trip (status → `waiting_driver`).

---

#### `PATCH /api/driver/trips/:id/start`

Start an assigned shuttle trip.

**Auth: driver.**

**Pre-condition:** A face-detected selfie check-in for this trip is required (403 if missing).

**Side effects:** Trip → `active`; station progress initialized; `TRIP_STARTED` event inserted; driver → `busy`.

**Response 200:** Updated trip.

---

#### `PATCH /api/driver/trips/:id/complete`

**Auth: driver.**

**Side effects:** Trip → `completed`; confirmed bookings → `completed`; driver earnings inserted; driver → `online`.

**Response 200:** Updated trip.

---

#### `PATCH /api/driver/trips/:id/cancel`

**Auth: driver.**

**Request body:** `{ "reason": "string (required)" }`

**Response 200:** Updated trip.

---

#### `GET /api/driver/trips/:id/stations`

**Auth: driver.**

**Response 200:** `{ "data": [ { ...station, "progress": {...}, "status": "pending | arrived | completed" } ] }`

---

#### `PATCH /api/driver/trips/:id/stations/:stationId/arrived`

**Auth: driver.**

**Response 200:** Updated station progress.

---

#### `PATCH /api/driver/trips/:id/stations/:stationId/completed`

**Auth: driver.**

**Response 200:** Updated station progress.

---

#### `PATCH /api/driver/bookings/:id/board`

Mark a passenger as boarded.

**Auth: driver.**

**Business logic:** Booking must be `confirmed` or `pending`. Status → `boarded`. Passenger notified via `booking:boarded`.

**Response 200:** Updated booking.

---

#### `PATCH /api/driver/bookings/:id/absent`

Mark a passenger as absent (no-show on shuttle).

**Auth: driver.**

**Response 200:** Updated booking (status → `absent`).

---

### Driver Wallet & Earnings

#### `GET /api/driver/wallet/balance`

**Auth: driver.**

**Response 200:**
```json
{ "balance": 250.00, "totalPaid": 1200.00, "totalPending": 50.00 }
```

---

#### `GET /api/driver/wallet/payout-methods`

**Auth: driver.**

**Response 200:** List of `bank_transfer`, `mobile_money`, `cash` payout method objects.

---

#### `POST /api/driver/wallet/payout-methods`

Add a payout method (placeholder; not persisted to DB).

**Auth: driver.**

---

#### `DELETE /api/driver/wallet/payout-methods/:id`

Remove a payout method (placeholder).

**Auth: driver.**

---

#### `POST /api/driver/wallet/payout`

Request a payout from confirmed earnings.

**Auth: driver.**

**Request body:**
```json
{ "amount": 100.00, "method": "bank_transfer" }
```

**Business logic:** All confirmed earnings for the driver are marked as `paid`. Returns 400 if balance is insufficient.

**Response 200:** `{ "ok": true, "amount": 100.00, "method": "...", "message": "..." }`

---

#### `GET /api/driver/earnings`

Earnings summary + 10 most recent records.

**Auth: driver.**

**Response 200:**
```json
{ "totalEarned": 500.00, "tripCount": 42, "recent": [ { ...earning } ] }
```

---

#### `GET /api/driver/earnings/history`

Paginated earnings history.

**Auth: driver.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...earnings], "total": N, "page": N, "limit": N }`

---

### Driver Documents

#### `GET /api/driver-documents`

**Auth: admin.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Pagination |
| `limit` | int | Max 100 |
| `verificationStatus` | `pending\|approved\|rejected` | Filter |
| `type` | string | Document type filter |

Document types: `national_id_front`, `national_id_back`, `driving_license_front`, `driving_license_back`, `vehicle_license_front`, `vehicle_license_back`, `vehicle_photo`, `profile_photo`, `trip_selfie`, `criminal_record`

**Response 200:** `{ "data": [ { ...doc, "driver": { "name": "...", "phone": "..." } } ], "total": N }`

---

#### `GET /api/driver-documents/by-driver/:driverId`

**Auth: admin.**

**Response 200:** `{ "driver": { ...driver }, "documents": [...docs] }`

---

#### `GET /api/driver-documents/stats`

**Auth: admin.**

**Response 200:** `{ "pending": 12, "approved": 45, "rejected": 3 }`

---

#### `POST /api/driver-documents/upload/:driverId`

Upload a document.

**Auth: any authenticated user.**  
**Content-Type:** `multipart/form-data`

**Form fields:**
- `file` — image (JPEG, PNG, WebP, max 10 MB)
- `type` — document type string

**Response 201:** Document record with `fileUrl`.

---

#### `PATCH /api/driver-documents/:id`

Update verification status or admin notes.

**Auth: admin.**

**Request body (all optional):**
```json
{ "verificationStatus": "approved | rejected | pending", "adminNotes": "string" }
```

**Response 200:** Updated document record.

---

### Driver Check-In (Selfie)

#### `POST /api/checkin`

Submit a selfie check-in. Face detection is run on the uploaded image.

**Auth: driver.**  
**Content-Type:** `multipart/form-data`

**Form fields:**
- `selfie` — image (JPEG, PNG, WebP, max 10 MB)
- `tripId` — string (optional)

**Response 201:**
```json
{ "id": N, "driverId": N, "tripId": N, "imageUrl": "string", "faceDetected": true, "createdAt": "..." }
```

---

#### `GET /api/checkin/status`

**Auth: driver.**

**Response 200:**
```json
{ "hasCheckedIn": true, "lastCheckIn": { ...checkIn }, "checkInRequired": false, "checkInDeadline": null }
```

---

#### `GET /api/admin/checkins`

**Auth: admin.**

**Query params:** `page`, `limit`, `driverId`, `tripId`, `faceDetected`

**Response 200:** Paginated check-in records.

---

### Notifications

#### `GET /api/notifications`

**Auth: user.**

**Response 200:** `{ "data": [...notifications] }` (last 50)

---

#### `PATCH /api/notifications/:id/read`

**Auth: user.**

**Response 200:** Updated notification.

---

#### `PATCH /api/notifications/read-all`

**Auth: user.**

**Response 200:** `{ "updated": N }`

---

#### `POST /api/admin/notifications/broadcast`

**Auth: admin.**

**Request body:**
```json
{
  "title": "string",
  "message": "string",
  "target": "all_users | all_drivers | user",
  "userId": "number (required when target='user')"
}
```

**Response 201:** `{ "sent": N }`

---

### Wallet (Passenger)

#### `GET /api/wallet`

Get the authenticated user's wallet details.

**Auth: any.**

**Response 200:** `{ "balance": 250.00, ... }`

---

#### `GET /api/wallet/balance`

Alias for wallet balance only.

**Auth: any.**

**Response 200:** `{ "balance": 250.00 }`

---

#### `GET /api/wallet/transactions`

**Auth: any.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...transactions], "total": N }`

---

#### `POST /api/wallet/topup`

Top up the user's wallet balance.

**Auth: any.**

**Request body:**
```json
{ "amount": 100.00 }
```

**Business logic:** Atomically increments `users.walletBalance` and inserts a `wallet_transactions` record with type `"deposit"`.

**Response 200:**
```json
{
  "transaction": { "id": N, "amount": 100.00, "type": "deposit", "description": "Wallet top-up — 100 EGP", "createdAt": "..." },
  "balance": 350.00
}
```

---

### Payments

#### `GET /api/payments`

**Auth: user.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...payments], "total": N }`

---

### Shuttle Lines & Bookings

#### `GET /api/shuttle/lines`

List all shuttle routes with upcoming trip counts.

**No auth required.**

**Response 200:**
```json
{ "data": [ { "id": 1, "name": "...", "fromLocation": "...", "toLocation": "...", "basePrice": 15.00, "upcomingTrips": 3 } ] }
```

---

#### `GET /api/shuttle/lines/:id`

Get a specific shuttle line with upcoming trips.

**No auth required.**

**Response 200:** Route object with `trips` array.

---

#### `POST /api/bookings`

Book seats on a shuttle trip.

**Auth: user.**

**Request body:**
```json
{
  "tripId": N,
  "seatCount": 2,
  "pickupStationId": N,
  "dropoffStationId": N,
  "promoCode": "string (optional)"
}
```

**Business logic:**
- Seat availability checked atomically.
- Fare = route `basePrice` × `seatCount` (adjusted for station-segment pricing if applicable).
- Payment escrowed from wallet immediately.

**Response 201:** Booking object.

---

#### `GET /api/bookings`

List all bookings.

**Auth: admin.**

**Query params:** `page`, `limit`, `status`, `search`

---

#### `GET /api/bookings/:id`

Get a specific booking.

**Auth: user or admin.**

---

#### `PATCH /api/bookings/:id/cancel`

Cancel a booking and refund the wallet.

**Auth: user.**

**Response 200:** Updated booking object.

---

### Routes

#### `GET /api/routes`

**No auth required.**

**Query params:** `search`

**Response 200:** `{ "data": [...routes], "total": N }`

---

#### `POST /api/routes`

**Auth: admin.**

**Request body:**
```json
{
  "name": "string",
  "fromLocation": "string",
  "toLocation": "string",
  "basePrice": 15.00,
  "estimatedDuration": 45,
  "isActive": true
}
```

**Response 201:** Created route.

---

#### `GET /api/routes/:id`

**No auth required.**

---

#### `PATCH /api/routes/:id`

**Auth: admin.** All fields optional.

---

#### `DELETE /api/routes/:id`

**Auth: admin.**

**Side effects:** Cascade-deletes all trips and bookings for this route.

**Response 204.**

---

#### `GET /api/routes/:id/stations`

**No auth required.**

**Response 200:** Array of station objects ordered by `order` field.

---

#### `POST /api/routes/:id/stations`

**Auth: admin.**

**Request body:**
```json
{
  "name": "string",
  "latitude": 30.0,
  "longitude": 31.0,
  "order": 1,
  "direction": "outbound | return",
  "segmentPrice": 5.00
}
```

**Response 201:** Station object.

---

#### `PATCH /api/routes/:id/stations/:stationId`

**Auth: admin.** All fields optional.

---

#### `DELETE /api/routes/:id/stations/:stationId`

**Auth: admin.**

**Response 204.**

---

### Trips

#### `GET /api/trips`

**No auth required.**

**Query params:** `routeId`, `status`, `date` (YYYY-MM-DD), `page`, `limit`

---

#### `POST /api/trips`

**Auth: admin.**

**Request body:**
```json
{ "routeId": N, "busId": N, "driverId": N, "departureTime": "ISO8601", "arrivalTime": "ISO8601", "price": 15.00 }
```

Seat count auto-set from bus capacity.

**Response 201:** Trip object.

---

#### `GET /api/trips/:id`

**No auth required.**

---

#### `PATCH /api/trips/:id`

**Auth: admin.** All modifiable fields optional.

---

#### `PATCH /api/trips/:id/cancel`

**Auth: admin.**

**Response 200:** Updated trip (status → `cancelled`).

---

#### `DELETE /api/trips/:id`

**Auth: admin.** Not allowed if status is `active`.

**Side effects:** Cascade-deletes all bookings for the trip.

**Response 204.**

---

#### `POST /api/admin/trips/:id/cancel`

Admin cancel with automatic passenger refunds.

**Auth: admin.**

**Business logic:** Cancels the trip and refunds all passengers with active bookings.

---

### Buses

#### `GET /api/buses` — **Auth: admin.**

#### `POST /api/buses` — **Auth: admin.**

```json
{ "plateNumber": "string", "model": "string", "capacity": 40, "isActive": true }
```

#### `GET /api/buses/:id` — **Auth: admin.**

#### `PATCH /api/buses/:id` — **Auth: admin.**

#### `DELETE /api/buses/:id` — **Auth: admin.**

All bus mutations are audit-logged via `writeAuditLog`.

---

### Vehicles

#### `GET /api/vehicles`

**Auth: admin.**

**Query params:** `page`, `limit`, `search`, `status` (`pending|verified|rejected|suspended`), `vehicleType`

**Response 200:** `{ "data": [ { ...vehicle, "driverName": "...", "driverPhone": "..." } ], "total": N }`

---

#### `POST /api/vehicles` — **Auth: admin.**

```json
{
  "driverId": N,
  "plateNumber": "string",
  "make": "string",
  "model": "string",
  "year": 2022,
  "color": "string",
  "vehicleType": "car | motorcycle | van | minibus",
  "status": "pending | verified | rejected | suspended",
  "isActive": true
}
```

#### `GET /api/vehicles/:id` — **Auth: admin.**

#### `PATCH /api/vehicles/:id` — **Auth: admin.**

#### `DELETE /api/vehicles/:id` — **Auth: admin.**

All vehicle mutations are audit-logged via `writeAuditLog`.

---

### Schedules

#### `POST /api/schedules`

Create a recurring schedule (auto-generates trip records).

**Auth: admin.**

**Request body:**
```json
{
  "routeId": N,
  "effectiveFrom": "YYYY-MM-DD",
  "effectiveTo": "YYYY-MM-DD",
  "defaultCapacity": 40,
  "slots": [
    { "dayOfWeek": 0, "departureTime": "07:30" }
  ]
}
```

`dayOfWeek`: 0=Sunday … 6=Saturday.

**Response 201:** `{ "schedule": {...}, "slots": [...], "tripsCreated": N }`

---

#### `GET /api/schedules`

**Auth: admin.**

**Query params:** `routeId` (optional filter)

**Response 200:** `{ "data": [ { ...schedule, "slots": [...], "tripStats": {...} } ], "total": N }`

---

#### `GET /api/schedules/:id` — **Auth: admin.**

#### `PATCH /api/schedules/:id` — **Auth: admin.** Does not regenerate trips.

#### `POST /api/schedules/:id/generate`

Re-run trip generation for an existing schedule (idempotent).

**Auth: admin.**

**Response 200:** `{ "ok": true, "tripsCreated": N }`

---

#### `DELETE /api/schedules/:id`

Deactivates the schedule and cancels all future `scheduled`/`waiting_driver` trips linked to it.

**Auth: admin.**

**Response 200:** `{ "ok": true, "scheduleDeactivated": true, "futureTripsCount": N }`

---

### Chat (Shuttle Trips Only)

> **Important:** Chat is available only on **shuttle trips** (the `trips` table, identified by `tripId`). There is no in-ride chat for on-demand rides. `tripId` and `rideId` are distinct identifiers from separate tables and services.

#### `GET /api/trips/:id/chat`

Retrieve chat messages for a shuttle trip.

**Auth: user or driver (must be a party to the trip).**

**Response 200:** `{ "data": [...messages] }`

---

#### `POST /api/trips/:id/chat`

Send a chat message on a shuttle trip.

**Auth: user or driver.**

**Request body:**
```json
{ "message": "string (min 1, max 2000 chars)" }
```

**Side effects:** Emits `trip:chat:message` Socket.IO event to `trip:{tripId}` room and `admin:chat:new` to `admin:room`.

**Response 201:** Message object.

---

#### `GET /api/admin/chat` — All chat messages (admin). **Auth: admin.**

#### `GET /api/admin/chat/stats` — Chat statistics. **Auth: admin.**

#### `GET /api/admin/chat/trip/:id` — Messages for a specific trip. **Auth: admin.**

#### `POST /api/admin/chat/trip/:id` — Admin sends a message to a trip chat. **Auth: admin.**

#### `PATCH /api/admin/chat/messages/:id/read` — Mark message as read. **Auth: admin.**

---

### Promo Codes

> **Access control note:** `GET /api/promo` currently has **no role guard** — any authenticated user can call it and receive the full admin promo list. A `requireRole("admin")` guard should be added. Passengers should use `POST /api/promo/validate` instead.

#### `POST /api/promo/validate`

Validate a specific promo code. **Use this for the passenger checkout flow.**

**Auth: any.**

**Request body:**
```json
{ "code": "string" }
```

**Response 200:** Promo code details (type, discount value, expiry) if valid.  
**Error 404:** Code not found or inactive.  
**Error 400:** Expired or usage limit reached.

---

#### `GET /api/promo`

List all promo codes. *(Should be admin-only — role guard currently missing. See note above.)*

**Auth: any (bug — should be admin).**

**Query params:** `page`, `limit`

---

#### `POST /api/promo` — **Auth: admin.**

```json
{
  "code": "string",
  "discountType": "percentage | fixed",
  "discountValue": 20,
  "maxUsage": 100,
  "expiresAt": "ISO8601",
  "isActive": true
}
```

#### `PATCH /api/promo/:id` — **Auth: admin.**

#### `DELETE /api/promo/:id` — **Auth: admin.** Response 204.

---

### Support Tickets

#### `POST /api/support/tickets`

**No auth required.** Public endpoint.

**Request body:**
```json
{
  "subject": "string",
  "message": "string",
  "type": "complaint | suggestion | inquiry | technical",
  "priority": "low | medium | high | urgent",
  "name": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)"
}
```

**Response 201:** Ticket object.

---

#### `GET /api/support/tickets` — **Auth: admin.**

**Query params:** `page`, `limit`, `status`, `priority`, `type`, `search`

---

#### `GET /api/support/tickets/:id` — **Auth: admin.**

**Response 200:** Ticket object with `messages` array.

---

#### `PATCH /api/support/tickets/:id` — **Auth: admin.**

```json
{ "status": "open | pending | resolved | closed", "priority": "string", "assignedTo": N }
```

---

#### `POST /api/support/tickets/:id/messages` — **Auth: admin.**

```json
{ "message": "string" }
```

**Response 201:** Message object.

---

### Zones & Zone Pricing

#### `GET /api/zones` — **Auth: admin.**

#### `POST /api/zones` — **Auth: admin.**

```json
{ "name": "string", "polygon": [[lat, lng], ...] }
```

#### `PATCH /api/zones/:id` — **Auth: admin.**

#### `DELETE /api/zones/:id` — **Auth: admin.** Response 204.

---

#### `GET /api/zone-pricing` — **Auth: admin.**

#### `POST /api/zone-pricing` — **Auth: admin.**

```json
{ "zoneId": N, "vehicleType": "car | motorcycle | van | minibus", "basePrice": 10.00, "perKmRate": 2.50 }
```

#### `PATCH /api/zone-pricing/:id` — **Auth: admin.**

#### `DELETE /api/zone-pricing/:id` — **Auth: admin.** Response 204.

---

### Suggestions

#### `POST /api/suggestions`

**No auth required.** Public endpoint.

**Request body:**
```json
{
  "type": "new_route | new_station | route_edit",
  "title": "string",
  "description": "string",
  "startLocation": "string (optional)",
  "endLocation": "string (optional)",
  "userId": "number (optional)",
  "driverId": "number (optional)"
}
```

**Response 201:** Suggestion object.

---

#### `GET /api/suggestions` — **Auth: admin.** Query params: `page`, `limit`, `status`, `type`, `search`

#### `GET /api/suggestions/:id` — **Auth: admin.**

#### `PATCH /api/suggestions/:id` — **Auth: admin.**

```json
{ "status": "pending | approved | rejected", "adminNotes": "string" }
```

---

### Earnings

#### `GET /api/earnings/summary`

Role-aware earnings summary.

**Auth: admin or driver.**

- **Admin:** `{ "summary": {...totals}, "byStatus": [...], "topDrivers": [...] }`
- **Driver:** `{ "driverId": N, "summary": {...totals}, "byStatus": [...], "recentEarnings": [...] }`

---

#### `GET /api/earnings/weekly`

Weekly breakdown.

**Auth: admin or driver.**

**Query params:** `weeks` (default 8, max 52), `driverId` (admin only)

---

#### `GET /api/earnings`

Paginated all earnings records.

**Auth: admin.**

**Query params:** `page`, `limit`, `driverId`, `status` (`pending|confirmed|paid`)

---

#### `PATCH /api/earnings/:id/status`

**Auth: admin.**

```json
{ "status": "confirmed | paid" }
```

---

### Service Controls

Service types: `shuttle | car | motorcycle | delivery`

#### `GET /api/services/control` — **Auth: any.**

Returns public-facing fields for all service types.

**Response 200:**
```json
{
  "data": [
    {
      "serviceType": "car",
      "isEnabled": true,
      "displayMode": "live | coming_soon | unavailable | maintenance",
      "unavailableMessage": null,
      "unavailableAction": "none | show_message | hide_service",
      "activeZoneIds": [],
      "maintenanceEta": null
    }
  ]
}
```

---

#### `GET /api/services/:type/control` — **Auth: any.** Single service type.

#### `GET /api/services/:type/settings` — **Auth: any.**

**Response 200:**
```json
{
  "serviceType": "car",
  "minDriverRating": 0.0,
  "requiredLicenseTypes": [],
  "requireInsurance": false,
  "requireBackgroundCheck": false,
  "maxActiveRidesPerDriver": 1
}
```

---

#### `GET /api/admin/services/:type/control` — **Auth: admin.** Includes change log.

#### `PATCH /api/admin/services/:type/control`

**Auth: admin.**

```json
{
  "isEnabled": true,
  "displayMode": "live | coming_soon | unavailable | maintenance",
  "unavailableMessage": "string",
  "unavailableAction": "none | show_message | hide_service",
  "activeZoneIds": [1, 2],
  "maintenanceEta": "ISO8601"
}
```

**Side effects:** Emits `service:control:changed` to all connected clients and `admin:room`.

---

#### `POST /api/admin/services/:type/control/reset`

Reset to defaults.

**Auth: admin.**

**Side effects:** Same broadcast as PATCH.

---

#### `GET /api/admin/services/:type/settings` — **Auth: admin.**

#### `PATCH /api/admin/services/:type/settings`

**Auth: admin.**

```json
{
  "minDriverRating": 4.0,
  "requiredLicenseTypes": ["B"],
  "requireInsurance": true,
  "requireBackgroundCheck": false,
  "maxActiveRidesPerDriver": 2
}
```

**Side effects:** Emits `service:settings:changed`.

---

### Dashboard (Admin)

#### `GET /api/dashboard/summary` — **Auth: admin.**

High-level platform KPIs (routes, stations, trips, fleet, support, verifications, users).

#### `GET /api/dashboard/activity` — **Auth: admin.**

Recent activity feed (tickets, pending documents, suggestions, departures, active trips, bookings).

#### `GET /api/dashboard/analytics` — **Auth: admin.**

30-day analytics (trips/day, route popularity, status breakdown, driver activity, busiest stations, bookings/day).

#### `GET /api/dashboard/today` — **Auth: admin.**

Today's snapshot with yesterday comparison and 7-day trend arrays.

---

### Admin: Users & Drivers

#### `DELETE /api/admin/users/:id`

Delete a user account with full cascade.

**Auth: admin.**

**Cascade order:** Nulls driver refs in trips/rides → deletes rides, bookings, wallet transactions, notifications, SOS events, driver record, user.

**Response 200:** `{ "success": true, "deleted": N }`

---

#### `DELETE /api/admin/drivers/:id`

Delete a driver account with full cascade.

**Auth: admin.**

**Response 200:** `{ "success": true }`

---

### Admin: Analytics

#### `GET /api/admin/analytics/rides` — Ride status, vehicle type, revenue, top passengers, daily activity.

#### `GET /api/admin/analytics/drivers` — Active count, avg rating, top drivers.

#### `GET /api/admin/analytics/passengers` — Registrations, active users, top spenders.

#### `GET /api/admin/analytics/services` — Booking counts and revenue by service type.

#### `GET /api/admin/analytics/promo` — Promo code usage and discount impact.

#### `GET /api/admin/analytics/complaints` — Support ticket type/status breakdown and resolution time.

All analytics endpoints: **Auth: admin.**

---

### Admin: Settings

#### `GET /api/admin/settings` — **Auth: admin.**

All platform key-value settings.

---

#### `PATCH /api/admin/settings` — **Auth: admin.**

```json
{ "key1": "value1", "key2": "value2" }
```

**Known setting keys:**

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `driver_commission_rate` | float | `0.15` | Platform commission (15%) |
| `waiting_charge_per_minute` | float | `2.00` | EGP/min after free window |
| `max_waiting_charge` | float | `20.00` | Cap on waiting charge |
| `cancellation_fee_assigned` | float | `2.00` | Fee when driver is assigned |
| `cancellation_fee_arrived` | float | `5.00` | Fee when driver has arrived |
| `no_show_timeout_minutes` | int | `10` | Minutes before no-show triggers |
| `dispatch_peak_windows` | JSON | `[{7,9},{17,19}]` | Peak hour windows |
| `dispatch_drivers_per_round` | int | `3` | Batch size off-peak |
| `dispatch_drivers_per_round_peak` | int | `5` | Batch size during peak |
| `dispatch_radius_steps_km` | JSON | `[5,8,12]` | Radius expansion off-peak |
| `dispatch_radius_steps_km_peak` | JSON | `[3,5,8]` | Radius expansion during peak |

---

#### `GET /api/admin/settings/app` — **Auth: admin.**

App-level settings (name, support contacts, social links, policy URLs).

#### `PATCH /api/admin/settings/app` — **Auth: admin.** Partial update.

*(Deprecated alias: `PUT /api/admin/settings/app` — same behaviour.)*

---

### Admin: Dispatch / Peak Settings

#### `GET /api/admin/dispatch/peak-settings`

**Auth: admin.**

**Response 200:**
```json
{
  "isPeak": false,
  "serverHour": 14,
  "settings": {
    "dispatch_peak_windows": [{"startHour": 7, "endHour": 9}, {"startHour": 17, "endHour": 19}],
    "dispatch_drivers_per_round": 3,
    "dispatch_drivers_per_round_peak": 5,
    "dispatch_radius_steps_km": [5, 8, 12],
    "dispatch_radius_steps_km_peak": [3, 5, 8]
  },
  "active": { "driversPerRound": 3, "radiusSteps": [5, 8, 12] }
}
```

---

#### `PUT /api/admin/dispatch/peak-settings`

**Auth: admin.**

Any subset of the five dispatch settings may be updated. Changes take effect within 60 seconds (cache TTL).

```json
{
  "dispatch_peak_windows": [{"startHour": 7, "endHour": 9}],
  "dispatch_drivers_per_round": 3,
  "dispatch_drivers_per_round_peak": 5,
  "dispatch_radius_steps_km": [5, 8, 12],
  "dispatch_radius_steps_km_peak": [3, 5, 8]
}
```

**Response 200:** `{ "success": true, "updated": ["key1", ...], "note": "..." }`

---

### Admin: SOS Events

#### `GET /api/admin/sos-events`

**Auth: admin.**

**Query params:** `status` (`active|resolved`), `from` (ISO date), `to` (ISO date), `limit` (max 200, default 50), `offset`

**Response 200:**
```json
{
  "data": [ { "id": N, "userId": N, "rideId": N, "role": "passenger | driver", "latitude": N, "longitude": N, "triggeredAt": "...", "status": "active | resolved", "notes": null, "userName": "...", "userPhone": "..." } ],
  "meta": { "limit": 50, "offset": 0, "returned": N }
}
```

---

#### `POST /api/admin/sos-events/:id/resolve`

**Auth: admin.**

**Request body:**
```json
{ "notes": "string (optional)" }
```

**Response 200:** `{ "data": { ...updatedSosEvent } }`

---

### Admin: Audit Logs

#### `GET /api/admin/audit-logs`

**Auth: admin.**

**Query params:** `page`, `limit` (max 100), `action` (CREATE/UPDATE/DELETE), `entityType`, `userId`, `from`, `to`

---

#### `GET /api/admin/audit-logs/:id` — Full entry with `oldData`, `newData`, `ipAddress`, `userAgent`.

#### `GET /api/admin/audit-logs/distinct/actions` — `["CREATE", "DELETE", "UPDATE"]`

#### `GET /api/admin/audit-logs/distinct/entity-types` — `["bus", "vehicle", ...]`

---

### Admin: Staff & Roles

#### `GET /api/admin/permissions/all`

**Auth: admin.**

Full permission list: `view_dashboard`, `view_routes`, `edit_routes`, `view_trips`, `edit_trips`, `view_drivers`, `edit_drivers`, `view_buses`, `edit_buses`, `view_passengers`, `edit_passengers`, `view_bookings`, `edit_bookings`, `view_wallet`, `edit_wallet`, `view_support`, `edit_support`, `view_suggestions`, `view_verification`, `edit_verification`, `view_analytics`, `view_staff`, `edit_staff`, `view_settings`, `edit_settings`, `view_promo`, `edit_promo`, `view_live_tracking`, `view_driver_analytics`, `view_notifications`

---

#### `GET /api/admin/roles` — **Auth: admin.**

#### `POST /api/admin/roles` — **Auth: admin.**

```json
{ "name": "string", "description": "string (optional)", "permissions": ["view_dashboard", ...] }
```

#### `PATCH /api/admin/roles/:id` — **Auth: admin.**

#### `DELETE /api/admin/roles/:id` — **Auth: admin.** Removes role assignment from all users.

---

#### `GET /api/admin/staff` — **Auth: admin.** Query: `search`

#### `POST /api/admin/staff` — **Auth: admin.**

```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "password": "string (min 8)",
  "staffRoleId": "number (optional)"
}
```

#### `PATCH /api/admin/staff/:id` — **Auth: admin.**

```json
{ "name": "string", "email": "string", "phone": "string", "staffRoleId": N, "isBlocked": false, "password": "string" }
```

#### `DELETE /api/admin/staff/:id` — **Auth: admin.** Cannot delete your own account.

---

### Admin: Bookings & Transactions

#### `GET /api/admin/bookings` — All shuttle bookings with passenger, trip, and route details. **Auth: admin.**

#### `GET /api/admin/payments` — All payments. **Auth: admin.** Query: `page`, `limit`, `status`, `userId`

#### `GET /api/admin/wallet/transactions` — All wallet transactions with user info. **Auth: admin.**

#### `POST /api/admin/wallet/adjust` — Admin wallet credit/debit. **Auth: admin.**

```json
{ "userId": N, "amount": 50.00, "description": "string" }
```

#### `POST /api/admin/wallet/refund` — Admin issues a wallet refund. **Auth: admin.**

---

### Admin: Location History

#### `GET /api/admin/driver-locations`

Paginated GPS history for a driver.

**Auth: admin.**

**Query params:** `driverId` (required), `page`, `limit` (max 200)

---

#### `GET /api/admin/driver-locations/:driverId/latest`

Most recent GPS location for a driver.

**Auth: admin.**

---

---

## Socket.IO Events

**Connection:** `wss://<host>/api/socket.io`  
**Authentication:** `socket.handshake.auth.token` — same JWT as REST API.

### Rooms

| Room | Members |
|------|---------|
| `admin:room` | All authenticated admins |
| `passengers:all` | All authenticated passengers |
| `passenger:{userId}` | Individual passenger |
| `driver:{userId}` | Individual driver |
| `drivers:available:{vehicleType}` | Online drivers for a vehicle type (e.g., `drivers:available:car`) |
| `trip:{tripId}` | All parties to a shuttle trip |

---

### Events: Rides (Server → Passenger)

| Event string | Payload |
|-------------|---------|
| `ride:driver_assigned` | `{ rideId, driverId, driverName, driver: { name, phone, vehicle, rating }, eta }` |
| `ride:driver_arrived` | `{ rideId, driverId }` |
| `ride:started` | `{ rideId, driverId }` |
| `ride:completed` | `{ rideId, finalPrice, fare, waitingCharge }` |
| `ride:cancelled` | `{ rideId, reason }` |
| `ride:driver_cancelled` | `{ rideId, message }` |
| `ride:no_show_cancelled` | `{ rideId, arrivedFlatFee, waitingCharge, totalFee, refundAmount }` |
| `ride:driver_location` | `{ rideId, driverId, latitude, longitude, heading }` |
| `ride:deviation:warning` | `{ rideId, driverId, latitude, longitude, deviationM }` |

---

### Events: Waiting Timer (Server → Passenger + Driver)

| Event string | When emitted | Payload |
|-------------|-------------|---------|
| `ride:waiting:charge:started` | Free window (3 min) ends | `{ rideId, ratePerMinute }` |
| `ride:waiting:charge:updated` | Every minute while charging | `{ rideId, chargedMinutes, totalCharge, ratePerMinute }` |
| `ride:waiting:charge:capped` | Maximum charge reached | `{ rideId, totalCharge, maxCharge }` |

> **These events are live and emit today.** Passengers without UI listeners are being charged silently.

---

### Events: Dispatch (Server → Available Drivers)

| Event string | Payload |
|-------------|---------|
| `ride:offer` | `{ rideId, vehicleType, pickupAddress, dropoffAddress, distanceKm, estimatedPrice }` |
| `ride:new_request` | Same as above |
| `ride:offer_expired` | `{ rideId }` |
| `ride:no_longer_available` | `{ rideId }` |
| `ride:status_update` | `{ rideId, status }` |

---

### Events: Driver (Server → Driver)

| Event string | Payload |
|-------------|---------|
| `driver:location:ack` | Acknowledgement of location update |
| `driver:checkin:required` | `{ driverId, deadline: ISO8601 }` |
| `driver:checkin:approved` | `{ driverId }` |
| `driver:checkin:rejected` | `{ driverId, reason: "No check-in within deadline" }` |
| `driver:cooldown:cleared` | `{ driverId }` — admin lifted dispatch cooldown |

---

### Events: Shuttle (Server → Trip Room / Passengers)

| Event string | Emitted To | Payload |
|-------------|-----------|---------|
| `booking:boarded` | `passenger:{userId}` | `{ bookingId, tripId, timestamp }` |
| `passenger:trip:tracking` | `trip:{tripId}` | Trip tracking data |
| `trip:chat:message` | `trip:{tripId}` | Chat message object |
| `admin:chat:new` | `admin:room` | New chat message notification |
| `admin:track:trip` | `admin:room` | Trip tracking update |

---

### Events: Surge Pricing (Server → All Passengers)

| Event string | Payload |
|-------------|---------|
| `surge:updated` | `{ vehicleType, multiplier, tier: "none\|low\|medium\|high", ratio, isActive }` |

---

### Events: Service Controls (Server → All Clients)

| Event string | Payload |
|-------------|---------|
| `service:control:changed` | `{ serviceType, isEnabled, displayMode, unavailableMessage, unavailableAction, activeZoneIds, maintenanceEta, changedBy, changedAt }` |
| `service:settings:changed` | `{ serviceType, minDriverRating, requiredLicenseTypes, requireInsurance, requireBackgroundCheck, maxActiveRidesPerDriver, changedBy, changedAt }` |

---

### Events: SOS (Server → Admin)

| Event string | Payload |
|-------------|---------|
| `sos:triggered` | `{ sosId, rideId, userId, role, latitude, longitude, notes, triggeredAt }` |

---

### Client → Server Events

| Event string | Sender | Payload | Description |
|-------------|--------|---------|-------------|
| `driver:location:update` | driver | `{ latitude, longitude, heading }` | GPS update (also accepted as `driver:ride:location`) |
| `driver:status:online` | driver | — | Driver going online |
| `driver:status:offline` | driver | — | Driver going offline |
| `driver:status:busy` | driver | — | Driver marked busy |
| `passenger:join:trip` | user | bare `tripId` (number) | Subscribe to shuttle trip tracking room |
| `driver:trip:start` | driver | bare `tripId` (number) | Signal trip started via socket |
| `driver:trip:complete` | driver | bare `tripId` (number) | Signal trip completed via socket |
| `join` | any | — | Generic room join |

> **Payload note on `passenger:join:trip`:** The handler accepts a bare number (`(tripId: number) => {}`), not an object `{ tripId }`. Send the number directly.

---

## Background Jobs

All jobs start automatically at server boot.

### Ride Timeout (`lib/ride-timeout.ts`)

**Interval:** 60 s  
**Env var:** `RIDE_TIMEOUT_MINUTES` (default 5)

Scans for rides stuck in `searching` beyond the timeout. For each:
1. Status → `cancelled` (reason: `timeout`)
2. Escrowed fare refunded to passenger wallet
3. Emits `ride:cancelled` to `passenger:{userId}`

---

### Dispatch Manager (`lib/dispatch-manager.ts`)

**Startup:** Recovers in-flight `searching` rides immediately.  
**Round timeout:** 15 s per dispatch round.

- **Dynamic radius expansion:** `[5, 8, 12]` km off-peak; `[3, 5, 8]` km during peak.
- **Peak hours mode:** Larger batch size (5 vs 3) and tighter radius steps.
- **Cooldown:** 3 consecutive rejections → 10-minute dispatch cooldown for that driver.
- **Fair distribution penalty:** Drivers offered a ride within the past 10 minutes get a score deduction.
- **Driver scoring:** Factors distance, rating, and recency.
- **Settings cache:** Peak settings are cached for 60 s; `PUT /admin/dispatch/peak-settings` takes effect within one cache TTL.

---

### Surge Pricing (`lib/surge-pricing.ts`)

**Interval:** 5 min (configurable via `SURGE_INTERVAL_MS`).  
**Vehicle types:** `car`, `bike`.

Demand/supply ratio = searching rides ÷ online drivers:

| Ratio | Tier | Multiplier |
|-------|------|-----------|
| < 2.0 | `none` | 1.0× |
| 2.0 – 3.0 | `low` | 1.3× |
| 3.0 – 5.0 | `medium` | 1.6× |
| ≥ 5.0 | `high` | 2.0× (hard cap) |

State persisted to DB settings; broadcast via `surge:updated`.

---

### Waiting Timer (`lib/waiting-timer.ts`)

**Trigger:** When driver marks arrival (`PATCH /driver/rides/:id/arrived`).

- **Free window:** 3 minutes before charges begin.
- **Charge rate:** `waiting_charge_per_minute` setting (default 2.00 EGP/min).
- **Cap:** `max_waiting_charge` setting (default 20.00 EGP).
- **Events emitted:** `ride:waiting:charge:started`, `ride:waiting:charge:updated` (every minute), `ride:waiting:charge:capped`.
- Waiting charge is locked on ride-start and added to final price on completion.

---

### No-Show Monitor (`lib/no-show-monitor.ts`)

**Trigger:** Alongside waiting timer on driver arrival.  
**Timeout:** `no_show_timeout_minutes` setting (default 10 min).

If passenger doesn't board within the window:
1. Stops waiting timer; captures accrued charge.
2. Total fee = `cancellation_fee_arrived` (default 5.00) + waiting charge.
3. Refund = escrowed amount − total fee (floored at 0).
4. Ride → `cancelled`; driver → `online`; driver earnings record inserted for the fee.
5. Emits `ride:no_show_cancelled` to both parties and `admin:room`.

---

### Check-In Monitor (`lib/checkin-monitor.ts`)

**Interval:** 60 s.  
**Phase 1 prompt after:** `CHECKIN_PROMPT_HOURS` env var (default 10 h online).  
**Phase 2 deadline:** `CHECKIN_DEADLINE_MINUTES` env var (default 30 min).

**Phase 1:** Drivers online ≥ N hours without a recent face-detected check-in → `checkInRequired = true`, deadline set, `driver:checkin:required` emitted.  
**Phase 2:** Expired deadline → driver forced offline, `driver:checkin:rejected` emitted.

---

### Shuttle Status Job (`lib/shuttle-job.ts`)

**Interval:** 15 min.  
**Look-ahead:** 8 hours.

Evaluates `scheduled` / `active` trips departing within 8 hours:
- **< 7 bookings** → trip cancelled; passengers refunded.
- **`scheduled` with ≥ 7 bookings** → trip activated.
- Emits `trip:cancelled` or `trip:activated` (via Socket.IO to admin + `passengers:all`).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Access token signing secret |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token signing secret |
| `PORT` | No | `8080` | HTTP server port |
| `SUPABASE_URL` | For uploads | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For uploads | — | Supabase service role key |
| `SUPABASE_BUCKET` | No | `uploads` | Supabase storage bucket name |
| `RIDE_TIMEOUT_MINUTES` | No | `5` | Minutes before un-accepted rides are cancelled |
| `RIDE_RATE_LIMIT_WINDOW_MS` | No | `120000` | Ride request rate limit window (ms) |
| `RIDE_RATE_LIMIT_MAX` | No | `3` | Max ride requests per window |
| `SURGE_INTERVAL_MS` | No | `300000` | Surge pricing recalculation interval (ms) |
| `CHECKIN_PROMPT_HOURS` | No | `10` | Hours online before check-in prompt |
| `CHECKIN_DEADLINE_MINUTES` | No | `30` | Minutes to complete check-in after prompt |
| `REPLIT_DEV_DOMAIN` | No | — | Used to construct share-link URLs in Replit |
