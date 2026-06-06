# VeeGo Backend API Contract

> **Generated:** 2026-06-06  
> **Source:** `artifacts/api-server` (Express + TypeScript, Drizzle ORM, PostgreSQL)  
> **Base URL:** All REST endpoints are prefixed with `/api` (e.g., `POST /api/auth/register`)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Error Format](#error-format)
5. [REST Endpoints](#rest-endpoints)
   - [Health](#health)
   - [Authentication](#auth-endpoints)
   - [Users (Passengers)](#users-passengers)
   - [User Locations](#user-locations)
   - [Rides](#rides)
   - [Ratings](#ratings)
   - [Tracking (Public Share Links)](#tracking-public-share-links)
   - [SOS Events](#sos-events)
   - [Drivers (Self-Service)](#drivers-self-service)
   - [Driver Trips (Shuttle)](#driver-trips-shuttle)
   - [Driver Wallet & Earnings](#driver-wallet--earnings)
   - [Driver Documents (Self & Admin)](#driver-documents-self--admin)
   - [Driver Check-In (Selfie)](#driver-check-in-selfie)
   - [Notifications](#notifications)
   - [Wallet](#wallet)
   - [Payments](#payments)
   - [Shuttle Lines & Bookings](#shuttle-lines--bookings)
   - [Routes](#routes)
   - [Trips](#trips)
   - [Buses](#buses)
   - [Vehicles](#vehicles)
   - [Schedules](#schedules)
   - [Chat](#chat)
   - [Ratings (Shared)](#ratings-shared)
   - [Promo Codes](#promo-codes)
   - [Support Tickets](#support-tickets)
   - [Zones & Zone Pricing](#zones--zone-pricing)
   - [Suggestions](#suggestions)
   - [Earnings (Admin & Driver)](#earnings-admin--driver)
   - [Service Controls](#service-controls)
   - [Dashboard (Admin)](#dashboard-admin)
   - [Admin: Users & Drivers](#admin-users--drivers)
   - [Admin: Analytics](#admin-analytics)
   - [Admin: Settings](#admin-settings)
   - [Admin: Dispatch (Peak Settings)](#admin-dispatch-peak-settings)
   - [Admin: SOS Events](#admin-sos-events)
   - [Admin: Audit Logs](#admin-audit-logs)
   - [Admin: Staff & Roles](#admin-staff--roles)
   - [Admin: Bookings](#admin-bookings)
   - [Admin: Transactions](#admin-transactions)
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
| `authenticate` | Verifies JWT, attaches `req.user = { id, role }` |
| `requireRole(...roles)` | Checks `req.user.role` against the allowed list |
| `requirePermission(perm)` | Checks staff permission; super-admins bypass this check |

### Roles on endpoints

- **No auth** — public endpoints (noted explicitly)
- **`user`** — passenger-only
- **`driver`** — driver-only
- **`admin`** — admin/staff only
- **`user | driver`** — either role accepted

---

## Rate Limiting

| Scope | Limit |
|-------|-------|
| Auth endpoints (`/auth/*`) | 20 requests / 15 minutes |
| All API endpoints | 200 requests / 15 minutes |
| Ride requests (`POST /rides`) | 3 requests / 2 minutes per user (configurable via `RIDE_RATE_LIMIT_*` env vars) |

---

## Error Format

All errors return JSON:

```json
{ "error": "Human-readable message" }
```

Some endpoints include additional fields:

```json
{ "error": "...", "code": "MACHINE_READABLE_CODE", "details": {} }
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

**Auth: any authenticated role.**

**Request body:**
```json
{ "refreshToken": "string" }
```

**Response 200:** `{ "message": "Logged out successfully" }`

---

#### `GET /api/auth/me`

Return the current user's profile.

**Auth: any authenticated role.**

**Response 200:**
```json
{
  "id": 1,
  "name": "...",
  "email": "...",
  "phone": "...",
  "role": "user|driver|admin",
  "walletBalance": 100.00,
  "isBlocked": false,
  "createdAt": "..."
}
```

---

#### `PATCH /api/auth/me`

Update the authenticated user's own profile.

**Auth: any authenticated role.**

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

**Response 200:** Updated user object (without password).

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

### Users (Passengers)

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

**Response 200:** User object.

---

#### `PATCH /api/users/:id`

Update a user's profile or block status.

**Auth: admin.**

**Request body (all optional):**
```json
{ "name": "string", "email": "string", "phone": "string", "isBlocked": false }
```

**Response 200:** Updated user object.

---

#### `GET /api/users/:id/rides`

List a user's ride history.

**Auth: admin.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...rides], "total": N }`

---

#### `POST /api/users/:id/wallet/adjust`

Adjust a user's wallet balance (admin credit/debit).

**Auth: admin.**

**Request body:**
```json
{ "amount": 50.00, "description": "string" }
```

Positive amount = credit; negative = debit.

**Response 200:** `{ "walletBalance": 150.00 }`

---

### User Locations

#### `GET /api/user/locations`

List the authenticated user's saved locations.

**Auth: user.**

**Response 200:**
```json
{ "data": [ { "id": 1, "label": "home|work|other", "name": "...", "address": "...", "latitude": 30.0, "longitude": 31.0, "isDefault": true } ], "total": 3 }
```

---

#### `POST /api/user/locations`

Save a new location.

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

Update a saved location.

**Auth: user.**

**Request body:** Any fields from the create body (all optional).

**Response 200:** Updated location object.

---

#### `DELETE /api/user/locations/:id`

Delete a saved location.

**Auth: user.**

**Response 204.**

---

#### `GET /api/admin/user-locations`

View a user's saved locations (admin).

**Auth: admin.**

**Query params:** `userId` (required, int)

**Response 200:** `{ "data": [...locations], "total": N }`

---

### Rides

Ride status lifecycle:

```
searching → driver_assigned → driver_arrived → active → completed
                                                        ↓
                              cancelled (at any pre-completed stage)
```

#### `POST /api/rides`

Request a new ride. Escrowed fare is deducted from the passenger's wallet immediately.

**Auth: user.**  
**Rate limit:** 3 requests / 2 minutes per user.

**Request body:**
```json
{
  "pickupLatitude": 30.0,
  "pickupLongitude": 31.0,
  "pickupAddress": "string",
  "dropoffLatitude": 30.1,
  "dropoffLongitude": 31.1,
  "dropoffAddress": "string",
  "vehicleType": "car | motorcycle | van | minibus",
  "distanceKm": 5.2,
  "estimatedPrice": 45.00,
  "promoCode": "string (optional)"
}
```

**Business logic:**
- Service availability is checked (service must be `isEnabled: true` and `displayMode: "live"`).
- Passenger wallet must have sufficient balance for the estimated fare.
- If a valid promo code is provided, the fare is discounted and the code's `usedCount` is incremented.
- Estimated fare is escrowed (deducted from wallet, not paid to driver yet).
- Dispatch is started immediately (notifies nearby drivers via Socket.IO).

**Response 201:**
```json
{ "data": { ...ride } }
```

---

#### `GET /api/rides`

List the authenticated passenger's rides.

**Auth: user.**

**Query params:** `page`, `limit`, `status`

**Response 200:** `{ "data": [...rides], "total": N, "page": 1, "limit": 20 }`

---

#### `GET /api/rides/active`

Get the authenticated passenger's current active ride.

**Auth: user.**

**Response 200:** `{ "data": { ...ride } }` or `{ "data": null }` if no active ride.

---

#### `GET /api/rides/:id`

Get a specific ride.

**Auth: user or admin.**

**Response 200:** `{ "data": { ...ride } }`

---

#### `GET /api/rides/:id/events`

Get the event log for a ride.

**Auth: user.**

**Response 200:** `{ "data": [...rideEvents] }`

---

#### `POST /api/rides/:id/cancel`

Passenger cancels a ride.

**Auth: user.**

**Request body:**
```json
{ "reason": "string (optional)" }
```

**Business logic:**
- Allowed statuses for cancellation: `searching`, `driver_assigned`, `driver_arrived`.
- Cancellation fees apply based on status:
  - `searching`: full refund
  - `driver_assigned`: flat fee of `cancellation_fee_assigned` setting (default 2.00 EGP)
  - `driver_arrived`: flat fee of `cancellation_fee_arrived` setting (default 5.00 EGP) + any accrued waiting charges
- Remaining escrowed amount is refunded to wallet.

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/accept`

Driver accepts (takes) a ride request.

**Auth: driver.**

**Business logic:**
- Driver must be `online` and have an active vehicle.
- Service settings are validated: minimum driver rating, insurance requirement, background check, max active rides.
- Ride is atomically set to `driver_assigned` (optimistic locking — returns 409 if another driver grabbed it first).
- Driver status set to `busy`.
- Passenger notified via Socket.IO (`ride:driver_assigned`).

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/arrived`

Driver signals they have arrived at pickup.

**Auth: driver.**

**Business logic:**
- Ride must be in `driver_assigned` status.
- Status → `driver_arrived`.
- Starts the **waiting timer** (3-minute free window, then per-minute charge).
- Starts the **no-show timer** (default 10-minute window).
- Passenger notified via Socket.IO (`ride:driver_arrived`).

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/start`

Driver starts the ride (passenger boarded).

**Auth: driver.**  
**Deprecated alias:** `POST /api/driver/rides/:id/start` (same logic, kept for backward compatibility).

**Business logic:**
- Ride must be in `driver_arrived` status.
- Stops the no-show timer and waiting timer; waiting charge is locked.
- Status → `active`.
- Passenger notified via Socket.IO (`ride:started`).

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/complete`

Driver completes the ride.

**Auth: driver.**  
**Deprecated alias:** `POST /api/driver/rides/:id/complete`

**Business logic:**
- Ride must be in `active` status.
- Final price = estimated price + waiting charge.
- Platform commission rate loaded from settings (`driver_commission_rate`, default 15%).
- Driver earnings record inserted at `(1 - commissionRate) × finalPrice`.
- Peak hours bonus: +20% of driver cut if peak hours active.
- Waiting charge additionally deducted from passenger wallet (base fare was already escrowed).
- Payment record created.
- Driver status → `online`.
- Passenger notified via Socket.IO (`ride:completed`).

**Response 200:** `{ "data": { "rideId": N, "finalPrice": N, "driverCut": N, "waitingCharge": N } }`

---

#### `PATCH /api/driver/rides/:id/decline`

Driver declines a ride offer (un-assigns themselves).

**Auth: driver.**  
**Deprecated alias:** `POST /api/driver/rides/:id/decline`

**Business logic:**
- Ride returns to `searching` status.
- Other available drivers are re-notified via Socket.IO.

**Response 200:** `{ "data": { ...updatedRide } }`

---

#### `PATCH /api/driver/rides/:id/cancel`

Driver cancels a ride they had already accepted.

**Auth: driver.**

**Business logic:**
- Allowed statuses: `driver_assigned`, `driver_arrived`.
- Ride returns to `searching`; wallet escrow remains intact.
- Passenger notified (`ride:driver_cancelled`).
- Dispatch is re-started from scratch to find a new driver.

**Response 200:** `{ "data": { "rideId": N, "status": "searching", "message": "..." } }`

---

#### `GET /api/admin/rides`

List all rides platform-wide.

**Auth: admin.**

**Query params:** `page`, `limit`, `status`, `vehicleType`, `search`

**Response 200:** `{ "data": [...rides], "total": N }`

---

#### `PATCH /api/admin/rides/:id`

Admin updates a ride (force status, assign driver, etc.).

**Auth: admin.**

**Request body (all optional):**
```json
{ "status": "string", "driverId": "number", "cancelReason": "string" }
```

**Response 200:** Updated ride object.

---

#### `GET /api/driver/rides`

List rides for the authenticated driver.

**Auth: driver.**

**Query params:** `status`, `page`, `limit`

**Response 200:** `{ "data": [...rides], "total": N }`

---

#### `GET /api/driver/rides/active`

Get the driver's currently active ride.

**Auth: driver.**

**Response 200:** `{ "data": { ...ride } }` or `{ "data": null }`.

---

### Ratings

#### `POST /api/rides/:id/rate-driver`

Passenger rates the driver after a completed ride.

**Auth: user.**

**Request body:**
```json
{ "rating": 1-5, "comment": "string (optional)" }
```

**Business logic:** Updates `drivers.rating` as the rolling average of all `DRIVER_RATED` events for that driver. Each ride can only be rated once (409 if duplicate).

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

#### `GET /api/track/:token`

Retrieve real-time ride data via a share token.

**No auth required.** Public endpoint.

**Response 200:** Ride object including driver location, status, pickup/dropoff.  
**Response 401:** Token expired or not found.

---

### SOS Events

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

### Drivers (Self-Service)

#### `GET /api/driver/profile`

Get the authenticated driver's own profile.

**Auth: driver.**

**Response 200:** Driver profile object.

---

#### `PATCH /api/driver/profile`

Update the driver's own profile.

**Auth: driver.**

**Request body (all optional):**
```json
{ "name": "string", "phone": "string", "email": "string" }
```

**Response 200:** Updated driver profile.

---

#### `GET /api/driver/status`

Get the driver's current online/offline status.

**Auth: driver.**

**Response 200:** `{ "status": "online|offline|busy", "isOnline": true }`

---

#### `PATCH /api/driver/status`

Toggle the driver online/offline.

**Auth: driver.**

**Request body:**
```json
{ "isOnline": true, "latitude": 30.0, "longitude": 31.0 }
```

**Side effects on going online:** Sets `onlineSince`, emits `driver:online` to `drivers:available:{vehicleType}` room.  
**Side effects on going offline:** Checks for active rides (blocked if any), clears online state.

**Response 200:** `{ "status": "online|offline", "isOnline": true }`

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
- Inserts a row into `driver_locations` history table.
- Emits `driver:location_updated` to the driver's Socket.IO room.
- If a ride is active, emits `ride:location_updated` to the passenger.
- Checks for route deviation (threshold: 500m); emits `ride:deviation_warning` once per 60s if exceeded.

**Response 200:** `{ "ok": true }`

---

#### `GET /api/driver/settings`

Get the driver's personal settings (notifications, language).

**Auth: driver.**

**Response 200:** `{ "notifications": true, "language": "en" }`

---

#### `PATCH /api/driver/settings`

Update driver personal settings.

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

Get ratings/reviews left for the driver by passengers.

**Auth: driver.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...reviews], "total": N, "page": N, "limit": N, "averageRating": 4.7 }`

---

#### `GET /api/driver/promotions`

Get available driver promotions (currently static/hardcoded).

**Auth: driver.**

**Response 200:** `{ "data": [ { "id": "...", "title": "...", "bonusPercentage": 20, ... } ] }`

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

**Response 200:** Driver object.

---

#### `PATCH /api/drivers/:id`

Admin updates a driver's profile or status.

**Auth: admin.**

**Request body (all optional):**
```json
{ "name": "string", "isActive": true, "isOnline": false, "status": "string" }
```

**Response 200:** Updated driver object.

---

### Driver Trips (Shuttle)

#### `GET /api/driver/trips`

List shuttle trips assigned to or available for the driver.

**Auth: driver.**

**Query params:** `page`, `limit`, `status`

**Response 200:** `{ "data": [...trips], "total": N }`

---

#### `GET /api/driver/trips/:id`

Get a specific trip.

**Auth: driver.**

**Response 200:** Trip object with bookings.

---

#### `PATCH /api/driver/trips/:id/accept`

Accept assignment to a shuttle trip.

**Auth: driver.**

**Response 200:** Updated trip object.

---

#### `PATCH /api/driver/trips/:id/reject`

Reject assignment to a shuttle trip (returns trip to `waiting_driver`).

**Auth: driver.**

**Response 200:** Updated trip object.

---

#### `PATCH /api/driver/trips/:id/start`

Start an assigned shuttle trip.

**Auth: driver.**

**Pre-condition:** A face-detected selfie check-in for this trip is required (403 if missing).

**Side effects:**
- Trip status → `active`.
- Station progress records initialized.
- `TRIP_STARTED` event inserted.
- Driver status → `busy`.

**Response 200:** Updated trip object.

---

#### `PATCH /api/driver/trips/:id/complete`

Complete an active shuttle trip.

**Auth: driver.**

**Side effects:**
- Trip status → `completed`.
- All `confirmed` bookings → `completed`.
- Driver earnings record inserted.
- Driver status → `online`.

**Response 200:** Updated trip object.

---

#### `PATCH /api/driver/trips/:id/cancel`

Cancel an assigned trip.

**Auth: driver.**

**Request body:**
```json
{ "reason": "string (required)" }
```

**Response 200:** Updated trip object.

---

#### `GET /api/driver/trips/:id/stations`

Get station progress for a trip.

**Auth: driver.**

**Response 200:** `{ "data": [ { ...station, "progress": {...}, "status": "pending|arrived|completed" } ] }`

---

#### `PATCH /api/driver/trips/:id/stations/:stationId/arrived`

Mark arrival at a station stop.

**Auth: driver.**

**Response 200:** Updated station progress record.

---

#### `PATCH /api/driver/trips/:id/stations/:stationId/completed`

Mark departure from a station stop (boarding complete).

**Auth: driver.**

**Response 200:** Updated station progress record.

---

#### `PATCH /api/driver/bookings/:id/board`

Mark a passenger as boarded (shuttle).

**Auth: driver.**

**Business logic:** Booking must be `confirmed` or `pending`; booking status → `boarded`.  
Passenger notified via Socket.IO (`booking:boarded`).

**Response 200:** Updated booking object.

---

#### `PATCH /api/driver/bookings/:id/absent`

Mark a passenger as absent (no-show on shuttle).

**Auth: driver.**

**Response 200:** Updated booking object (status → `absent`).

---

### Driver Wallet & Earnings

#### `GET /api/driver/wallet/balance`

Get the driver's current earnings balance breakdown.

**Auth: driver.**

**Response 200:**
```json
{ "balance": 250.00, "totalPaid": 1200.00, "totalPending": 50.00 }
```

- `balance` = confirmed (withdrawable) amount
- `totalPaid` = already paid out
- `totalPending` = pending confirmation

---

#### `GET /api/driver/wallet/payout-methods`

List available payout methods.

**Auth: driver.**

**Response 200:**
```json
{
  "data": [
    { "id": "bank_transfer", "name": "Bank Transfer", "description": "2-3 business days", "isAvailable": true },
    { "id": "mobile_money", "name": "Mobile Money", "description": "Instant", "isAvailable": true },
    { "id": "cash", "name": "Cash Pickup", "description": "Visit nearest office", "isAvailable": true }
  ]
}
```

---

#### `POST /api/driver/wallet/payout-methods`

Add a payout method (placeholder — not persisted to DB).

**Auth: driver.**

**Request body:**
```json
{ "type": "string", "accountNumber": "string?", "accountName": "string?", "bankName": "string?", "phoneNumber": "string?" }
```

**Response 201:** Payout method object (ephemeral).

---

#### `DELETE /api/driver/wallet/payout-methods/:id`

Remove a payout method (placeholder).

**Auth: driver.**

**Response 200:** `{ "ok": true, "deleted": "id" }`

---

#### `POST /api/driver/wallet/payout`

Request a payout from confirmed earnings.

**Auth: driver.**

**Request body:**
```json
{ "amount": 100.00, "method": "bank_transfer" }
```

**Business logic:** All confirmed earnings for the driver are marked as `paid`. Insufficient balance returns 400.

**Response 200:** `{ "ok": true, "amount": 100.00, "method": "...", "message": "..." }`

---

#### `GET /api/driver/earnings`

Get the driver's earnings summary + 10 most recent records.

**Auth: driver.**

**Response 200:**
```json
{ "totalEarned": 500.00, "tripCount": 42, "recent": [ { ...earning } ] }
```

---

#### `GET /api/driver/earnings/history`

Paginated list of driver earnings history.

**Auth: driver.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...earnings], "total": N, "page": N, "limit": N }`

---

### Driver Documents (Self & Admin)

#### `GET /api/driver-documents`

List all driver documents (for verification review).

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

Get all documents for a specific driver.

**Auth: admin.**

**Response 200:** `{ "driver": { ...driver }, "documents": [...docs] }`

---

#### `GET /api/driver-documents/stats`

Aggregated document counts by verification status.

**Auth: admin.**

**Response 200:** `{ "pending": 12, "approved": 45, "rejected": 3 }`

---

#### `POST /api/driver-documents/upload/:driverId`

Upload a document for a driver.

**Auth: any authenticated user (driver uploads their own docs).**  
**Content-Type:** `multipart/form-data`

**Form fields:**
- `file` — image file (JPEG, PNG, WebP, max 10 MB)
- `type` — document type string (see list above)

**Side effects:** Uploads to Supabase Storage; inserts record with `fileUrl`.

**Response 201:** Document record.

---

#### `PATCH /api/driver-documents/:id`

Update document verification status / admin notes.

**Auth: admin.**

**Request body (all optional):**
```json
{ "verificationStatus": "approved|rejected|pending", "adminNotes": "string" }
```

**Response 200:** Updated document record.

---

### Driver Check-In (Selfie)

#### `POST /api/checkin`

Driver submits a selfie check-in for a trip. Face detection is run on the uploaded image.

**Auth: driver.**  
**Content-Type:** `multipart/form-data`

**Form fields:**
- `selfie` — image file (JPEG, PNG, WebP, max 10 MB)
- `tripId` — string (optional, links check-in to a trip)

**Side effects:**
- Image uploaded to Supabase Storage.
- Face detection runs (AI service).
- `faceDetected: true/false` stored on check-in record.
- If a trip was blocked waiting for check-in, driver is notified.

**Response 201:**
```json
{
  "id": N,
  "driverId": N,
  "tripId": N,
  "imageUrl": "string",
  "faceDetected": true,
  "createdAt": "..."
}
```

---

#### `GET /api/checkin/status`

Get the driver's most recent check-in status for the current shift.

**Auth: driver.**

**Response 200:**
```json
{ "hasCheckedIn": true, "lastCheckIn": { ...checkIn }, "checkInRequired": false, "checkInDeadline": null }
```

---

#### `GET /api/admin/checkins`

List all driver check-in records.

**Auth: admin.**

**Query params:** `page`, `limit`, `driverId`, `tripId`, `faceDetected`

**Response 200:** Paginated check-in records.

---

### Notifications

#### `GET /api/notifications`

Get the authenticated user's notifications (most recent 50).

**Auth: user.**

**Response 200:** `{ "data": [...notifications] }`

---

#### `PATCH /api/notifications/:id/read`

Mark a notification as read.

**Auth: user.**

**Response 200:** Updated notification.

---

#### `PATCH /api/notifications/read-all`

Mark all notifications as read.

**Auth: user.**

**Response 200:** `{ "updated": N }`

---

#### `POST /api/admin/notifications/broadcast`

Send a push notification to all users, all drivers, or a specific user.

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

### Wallet

#### `GET /api/wallet/balance`

Get the authenticated user's wallet balance.

**Auth: user.**

**Response 200:** `{ "balance": 250.00 }`

---

#### `GET /api/wallet/transactions`

Get the authenticated user's wallet transaction history.

**Auth: user.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...transactions], "total": N }`

---

#### `POST /api/wallet/topup`

Top up the user's wallet.

**Auth: user.**

**Request body:**
```json
{ "amount": 100.00, "method": "card|bank|fawry" }
```

**Response 201:** Updated wallet balance.

---

#### `GET /api/admin/wallet/transactions`

List all wallet transactions platform-wide.

**Auth: admin.**

**Query params:** `page`, `limit`, `userId`, `type`

**Response 200:** Paginated transaction list with joined user info.

---

#### `POST /api/admin/wallet/adjust`

Admin adjusts a user's wallet balance.

**Auth: admin.**

**Request body:**
```json
{ "userId": N, "amount": 50.00, "description": "string" }
```

**Response 200:** `{ "walletBalance": 300.00 }`

---

### Payments

#### `GET /api/payments`

Get the authenticated user's payment history.

**Auth: user.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...payments], "total": N }`

---

#### `GET /api/admin/payments`

List all payments platform-wide.

**Auth: admin.**

**Query params:** `page`, `limit`, `status`, `userId`

**Response 200:** Paginated payment list.

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

#### `GET /api/shuttle/assignments`

Get the authenticated driver's shuttle trip assignments.

**No auth (public query, returns all active trips if no driver filter).**

**Response 200:** List of trips.

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
- Minimum 7 seats must be booked (platform-wide) for a trip to activate.
- Seat availability checked atomically.
- Fare = route `basePrice` × `seatCount` (adjusted for segment pricing if stations differ).
- Promo codes apply a percentage or fixed discount.
- Payment escrowed from wallet immediately.

**Response 201:** Booking object.

---

#### `GET /api/bookings`

List the authenticated user's shuttle bookings.

**Auth: user.**

**Query params:** `page`, `limit`, `status`

**Response 200:** `{ "data": [...bookings], "total": N }`

---

#### `GET /api/bookings/:id`

Get a specific booking.

**Auth: user.**

**Response 200:** Booking object.

---

#### `POST /api/bookings/:id/cancel`

Cancel a booking and refund the wallet.

**Auth: user.**

**Response 200:** Updated booking object.

---

#### `GET /api/admin/bookings`

List all bookings platform-wide.

**Auth: admin.**

**Query params:** `page`, `limit`, `status`, `search`

**Response 200:** Paginated bookings with joined user and route info.

---

### Routes

#### `GET /api/routes`

List all shuttle routes.

**No auth required.**

**Query params:** `search` (filters by route name)

**Response 200:** `{ "data": [...routes], "total": N }`

---

#### `POST /api/routes`

Create a new route.

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

Get a specific route.

**No auth required.**

**Response 200:** Route object.

---

#### `PATCH /api/routes/:id`

Update a route.

**Auth: admin.**

**Request body:** Any fields from the create body (all optional).

**Response 200:** Updated route.

---

#### `DELETE /api/routes/:id`

Delete a route. Also cascade-deletes all trips and bookings for the route.

**Auth: admin.**

**Response 204.**

---

#### `GET /api/routes/:id/stations`

List stations for a route ordered by `order` field.

**No auth required.**

**Response 200:** Array of station objects.

---

#### `POST /api/routes/:id/stations`

Add a station stop to a route.

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

Update a station.

**Auth: admin.**

**Request body:** Any fields from the create body (all optional).

**Response 200:** Updated station.

---

#### `DELETE /api/routes/:id/stations/:stationId`

Delete a station.

**Auth: admin.**

**Response 204.**

---

### Trips

#### `GET /api/trips`

List trips.

**No auth required.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `routeId` | int | Filter by route |
| `status` | string | `scheduled\|active\|completed\|cancelled` |
| `date` | string | Filter by date (YYYY-MM-DD) |
| `page` | int | Default 1 |
| `limit` | int | Default 20 |

**Response 200:** `{ "data": [...trips], "total": N, "page": N, "limit": N }`

---

#### `POST /api/trips`

Create a trip manually.

**Auth: admin.**

**Request body:**
```json
{
  "routeId": N,
  "busId": N,
  "driverId": N,
  "departureTime": "ISO8601",
  "arrivalTime": "ISO8601",
  "price": 15.00
}
```

Seat count is auto-set from the bus capacity.

**Response 201:** Trip object.

---

#### `GET /api/trips/:id`

Get a specific trip.

**No auth required.**

**Response 200:** Trip object.

---

#### `PATCH /api/trips/:id`

Update a trip.

**Auth: admin.**

**Request body:** Any modifiable fields (all optional).

**Response 200:** Updated trip.

---

#### `PATCH /api/trips/:id/cancel`

Cancel a trip.

**Auth: admin.**

**Response 200:** Updated trip (status → `cancelled`).

---

#### `DELETE /api/trips/:id`

Delete a trip (not allowed if `active`).

**Auth: admin.**

**Side effects:** Cascade-deletes all bookings for the trip.

**Response 204.**

---

#### `POST /api/admin/trips/:id/cancel`

Admin cancel with passenger refunds.

**Auth: admin.**

**Business logic:** Cancels the trip, then refunds all passengers with active bookings.

**Response 200:** Updated trip.

---

### Buses

#### `GET /api/buses`

List all buses.

**Auth: admin.**

**Query params:** `page`, `limit`

**Response 200:** `{ "data": [...buses], "total": N }`

---

#### `POST /api/buses`

Create a bus.

**Auth: admin.**

**Request body:**
```json
{ "plateNumber": "string", "model": "string", "capacity": 40, "isActive": true }
```

**Response 201:** Bus object.

---

#### `GET /api/buses/:id`

Get a specific bus.

**Auth: admin.**

**Response 200:** Bus object.

---

#### `PATCH /api/buses/:id`

Update a bus.

**Auth: admin.**

**Response 200:** Updated bus.

---

#### `DELETE /api/buses/:id`

Delete a bus.

**Auth: admin.**

**Response 204.**

---

### Vehicles

#### `GET /api/vehicles`

List all registered driver vehicles.

**Auth: admin.**

**Query params:** `page`, `limit`, `search`, `status` (`pending|verified|rejected|suspended`), `vehicleType`

**Response 200:** `{ "data": [ { ...vehicle, "driverName": "...", "driverPhone": "..." } ], "total": N }`

---

#### `POST /api/vehicles`

Create a vehicle record.

**Auth: admin.**

**Request body:**
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

**Response 201:** Vehicle object.

---

#### `GET /api/vehicles/:id`

Get a specific vehicle.

**Auth: admin.**

**Response 200:** Vehicle with joined driver name/phone.

---

#### `PATCH /api/vehicles/:id`

Update a vehicle.

**Auth: admin.**

**Response 200:** Updated vehicle.

---

#### `DELETE /api/vehicles/:id`

Delete a vehicle record.

**Auth: admin.**

**Response 204.**

---

### Schedules

#### `POST /api/schedules`

Create a recurring schedule for a route (auto-generates trip records).

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

**Side effects:** Generates trip rows for every matching weekday between `effectiveFrom` and `effectiveTo` (in batches of 500). Each trip gets 14 seats (`SHUTTLE_TOTAL_SEATS`).

**Response 201:** `{ "schedule": {...}, "slots": [...], "tripsCreated": N }`

---

#### `GET /api/schedules`

List all schedules (with slot and trip stats).

**Auth: admin.**

**Query params:** `routeId` (optional filter)

**Response 200:** `{ "data": [ { ...schedule, "slots": [...], "tripStats": { "total": N, "open": N, "active": N, ... } } ], "total": N }`

---

#### `GET /api/schedules/:id`

Get a specific schedule with slots and trip stats.

**Auth: admin.**

**Response 200:** Schedule object with slots and tripStats.

---

#### `PATCH /api/schedules/:id`

Update schedule metadata (does not regenerate trips).

**Auth: admin.**

**Request body (all optional):**
```json
{ "effectiveFrom": "YYYY-MM-DD", "effectiveTo": "YYYY-MM-DD", "defaultCapacity": N, "isActive": true }
```

**Response 200:** Updated schedule.

---

#### `POST /api/schedules/:id/generate`

Re-run trip generation for an existing active schedule (idempotent — skips existing trips).

**Auth: admin.**

**Response 200:** `{ "ok": true, "tripsCreated": N }`

---

#### `DELETE /api/schedules/:id`

Deactivate a schedule and cancel all future `scheduled` / `waiting_driver` trips linked to it.

**Auth: admin.**

**Response 200:** `{ "ok": true, "scheduleDeactivated": true, "futureTripsCount": N }`

---

### Chat

#### `GET /api/chat/:rideId`

Get chat messages for a ride.

**Auth: user or driver.**

**Response 200:** `{ "data": [...messages] }`

---

#### `POST /api/chat/:rideId`

Send a chat message on a ride.

**Auth: user or driver.**

**Request body:**
```json
{ "message": "string" }
```

**Side effects:** Emits real-time message to the other party via Socket.IO.

**Response 201:** Message object.

---

### Ratings (Shared)

#### `GET /api/ratings`

Get ratings/reviews for the authenticated user (driver).

**Auth: driver.**

**Response 200:** `{ "data": [...ratings], "averageRating": 4.8 }`

---

### Promo Codes

#### `GET /api/promo`

List all promo codes.

**Auth: admin.**

**Query params:** `page`, `limit`, `isActive`

**Response 200:** `{ "data": [...codes], "total": N }`

---

#### `POST /api/promo`

Create a promo code.

**Auth: admin.**

**Request body:**
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

**Response 201:** Promo code object.

---

#### `PATCH /api/promo/:id`

Update a promo code.

**Auth: admin.**

**Response 200:** Updated promo code.

---

#### `DELETE /api/promo/:id`

Delete a promo code.

**Auth: admin.**

**Response 204.**

---

#### `POST /api/promo/validate`

Validate a promo code before applying it.

**Auth: user.**

**Request body:**
```json
{ "code": "string", "amount": 100.00 }
```

**Response 200:** `{ "valid": true, "discount": 20.00, "finalAmount": 80.00 }`

---

### Support Tickets

#### `POST /api/support/tickets`

Create a support ticket.

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

#### `GET /api/support/tickets`

List support tickets.

**Auth: admin.**

**Query params:** `page`, `limit`, `status`, `priority`, `type`, `search`

**Response 200:** Paginated ticket list.

---

#### `GET /api/support/tickets/:id`

Get a specific ticket with its messages.

**Auth: admin.**

**Response 200:** Ticket object with `messages` array.

---

#### `PATCH /api/support/tickets/:id`

Update ticket status, assignment, or priority.

**Auth: admin.**

**Request body (all optional):**
```json
{ "status": "open|pending|resolved|closed", "priority": "string", "assignedTo": N }
```

**Response 200:** Updated ticket.

---

#### `POST /api/support/tickets/:id/messages`

Reply to a support ticket.

**Auth: admin.**

**Request body:**
```json
{ "message": "string" }
```

**Response 201:** Message object.

---

### Zones & Zone Pricing

#### `GET /api/zones`

List all geographic zones.

**Auth: admin.**

**Response 200:** `{ "data": [...zones] }`

---

#### `POST /api/zones`

Create a zone.

**Auth: admin.**

**Request body:**
```json
{ "name": "string", "polygon": [[lat, lng], ...] }
```

**Response 201:** Zone object.

---

#### `PATCH /api/zones/:id`

Update a zone.

**Auth: admin.**

**Response 200:** Updated zone.

---

#### `DELETE /api/zones/:id`

Delete a zone.

**Auth: admin.**

**Response 204.**

---

#### `GET /api/zone-pricing`

List zone pricing rules.

**Auth: admin.**

**Response 200:** `{ "data": [...pricingRules] }`

---

#### `POST /api/zone-pricing`

Create a zone pricing rule.

**Auth: admin.**

**Request body:**
```json
{ "zoneId": N, "vehicleType": "car|motorcycle|van|minibus", "basePrice": 10.00, "pricePerKm": 2.50 }
```

**Response 201:** Pricing rule object.

---

#### `PATCH /api/zone-pricing/:id`

Update a zone pricing rule.

**Auth: admin.**

**Response 200:** Updated rule.

---

#### `DELETE /api/zone-pricing/:id`

Delete a pricing rule.

**Auth: admin.**

**Response 204.**

---

### Suggestions

#### `GET /api/suggestions`

List route suggestions.

**Auth: admin.**

**Query params:** `page`, `limit`, `status` (`pending|approved|rejected`), `type` (`new_route|new_station|route_edit`), `search`

**Response 200:** `{ "data": [...suggestions], "total": N }`

---

#### `POST /api/suggestions`

Submit a route suggestion.

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

#### `GET /api/suggestions/:id`

Get a specific suggestion.

**Auth: admin.**

**Response 200:** Suggestion object with joined user/driver info.

---

#### `PATCH /api/suggestions/:id`

Review a suggestion.

**Auth: admin.**

**Request body:**
```json
{ "status": "pending|approved|rejected", "adminNotes": "string" }
```

**Response 200:** Updated suggestion.

---

### Earnings (Admin & Driver)

#### `GET /api/earnings/summary`

Earnings summary — role-aware.

**Auth: admin or driver.**

- **Admin response:** `{ "summary": {...totals}, "byStatus": [...], "topDrivers": [...] }`
- **Driver response:** `{ "driverId": N, "summary": {...totals}, "byStatus": [...], "recentEarnings": [...] }`

---

#### `GET /api/earnings/weekly`

Weekly breakdown — role-aware.

**Auth: admin or driver.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `weeks` | int | Number of past weeks (default 8, max 52) |
| `driverId` | int | Admin only — filter to specific driver |

**Admin response includes:** `weeklyBreakdown` + optional `driverBreakdown`  
**Driver response:** their own `weeklyBreakdown`

---

#### `GET /api/earnings`

Paginated list of all earnings records.

**Auth: admin.**

**Query params:** `page`, `limit`, `driverId`, `status` (`pending|confirmed|paid`)

**Response 200:** `{ "data": [...earnings], "total": N }`

---

#### `PATCH /api/earnings/:id/status`

Update an earning record's status.

**Auth: admin.**

**Request body:**
```json
{ "status": "confirmed | paid" }
```

**Response 200:** Updated earning record.

---

### Service Controls

Service types: `shuttle | car | motorcycle | delivery`

#### `GET /api/services/control`

Get all service controls (public-facing fields only).

**Auth: any authenticated user.**

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

#### `GET /api/services/:type/control`

Get a single service control.

**Auth: any authenticated user.**

**Response 200:** Single service control object (public fields).

---

#### `GET /api/services/:type/settings`

Get service requirement settings.

**Auth: any authenticated user.**

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

#### `GET /api/admin/services/:type/control`

Get full admin view of service control (includes change log).

**Auth: admin.**

**Response 200:** Control object + `logs` array (last 10 changes).

---

#### `PATCH /api/admin/services/:type/control`

Update service control settings.

**Auth: admin.**

**Request body (all optional):**
```json
{
  "isEnabled": true,
  "displayMode": "live | coming_soon | unavailable | maintenance",
  "unavailableMessage": "string",
  "unavailableAction": "none | show_message | hide_service",
  "activeZoneIds": [1, 2],
  "maintenanceEta": "ISO8601",
  "maxActiveRides": null
}
```

**Side effects:** Emits `service:control_changed` Socket.IO event to all connected clients and to `admin:room`.

**Response 200:** Updated control + logs.

---

#### `POST /api/admin/services/:type/control/reset`

Reset a service control to defaults.

**Auth: admin.**

**Side effects:** Same Socket.IO broadcast as PATCH.

**Response 200:** Reset control + logs.

---

#### `GET /api/admin/services/:type/settings`

Get admin view of service settings.

**Auth: admin.**

**Response 200:** Full service settings object.

---

#### `PATCH /api/admin/services/:type/settings`

Update service driver requirement settings.

**Auth: admin.**

**Request body (all optional):**
```json
{
  "minDriverRating": 4.0,
  "requiredLicenseTypes": ["B"],
  "requireInsurance": true,
  "requireBackgroundCheck": false,
  "maxActiveRidesPerDriver": 2
}
```

**Side effects:** Emits `service:settings_changed` Socket.IO event.

**Response 200:** Updated settings.

---

### Dashboard (Admin)

#### `GET /api/dashboard/summary`

High-level platform KPIs.

**Auth: admin.**

**Response 200:**
```json
{
  "routes": { "total": N, "active": N, "inactive": N },
  "stations": { "total": N },
  "trips": { "total": N, "active": N, "scheduled": N, "boarding": N, "upcoming": N, "cancelled": N },
  "fleet": { "totalBuses": N, "activeBuses": N, "totalDrivers": N, "onlineDrivers": N },
  "support": { "openTickets": N, "pendingTickets": N, "totalMessages": N },
  "verifications": { "pending": N },
  "suggestions": { "pending": N },
  "users": { "total": N, "passengers": N, "drivers": N },
  "generatedAt": "ISO8601"
}
```

---

#### `GET /api/dashboard/activity`

Recent activity feed for the admin dashboard.

**Auth: admin.**

**Response 200:**
```json
{
  "recentTickets": [...],
  "pendingDocuments": [...],
  "recentSuggestions": [...],
  "upcomingDepartures": [...],
  "activeTrips": [...],
  "recentBookings": [...]
}
```

---

#### `GET /api/dashboard/analytics`

30-day analytics charts.

**Auth: admin.**

**Response 200:**
```json
{
  "tripsPerDay": [...],
  "routePopularity": [...],
  "tripStatusBreakdown": [...],
  "driverActivity": [...],
  "busiestStations": [...],
  "bookingsPerDay": [...]
}
```

---

#### `GET /api/dashboard/today`

Today's snapshot with live/yesterday comparison.

**Auth: admin.**

**Response 200:**
```json
{
  "tripsToday": N,
  "tripsYesterday": N,
  "revenueToday": N,
  "revenueYesterday": N,
  "driversOnline": N,
  "passengersActive": N,
  "last7DaysTrips": [...],
  "last7DaysRevenue": [...],
  "activeTrips": [...],
  "generatedAt": "ISO8601"
}
```

---

### Admin: Users & Drivers

#### `DELETE /api/admin/users/:id`

Delete a user account with cascade.

**Auth: admin.**

**Cascade order:** Nulls driver references in trips/rides → deletes rides, bookings, wallet transactions, notifications, SOS events, driver record, user.

**Response 200:** `{ "success": true, "deleted": N }`

---

#### `DELETE /api/admin/drivers/:id`

Delete a driver account with cascade.

**Auth: admin.**

**Cascade order:** Nulls driver references in trips/rides → deletes rides, bookings, wallet transactions, notifications, SOS events, driver record, user account.

**Response 200:** `{ "success": true }`

---

### Admin: Analytics

#### `GET /api/admin/analytics/rides`

Ride analytics (status breakdown, vehicle type distribution, revenue, top passengers, daily activity).

**Auth: admin.**

**Response 200:** Multi-dimensional ride analytics object.

---

#### `GET /api/admin/analytics/drivers`

Driver analytics (active count, average rating, top drivers by rides/earnings, daily registrations).

**Auth: admin.**

**Response 200:** Driver analytics object.

---

#### `GET /api/admin/analytics/passengers`

Passenger analytics (new registrations, active users, top spenders, top cancellers, daily activity).

**Auth: admin.**

**Response 200:** Passenger analytics object.

---

#### `GET /api/admin/analytics/services`

Service type analytics (booking counts, revenue, monthly breakdown by service type).

**Auth: admin.**

**Response 200:**
```json
{ "serviceUsage": [...], "serviceRevenue": [...], "serviceMonthly": [...] }
```

---

#### `GET /api/admin/analytics/promo`

Promo code analytics (top codes, discount totals, monthly impact).

**Auth: admin.**

**Response 200:**
```json
{ "topPromos": [...], "totalPromoBookings": N, "revenueOnPromoBookings": N, "monthlyImpact": [...] }
```

---

#### `GET /api/admin/analytics/complaints`

Support ticket analytics (type/status breakdown, average resolution time, priority breakdown, 30-day trend).

**Auth: admin.**

**Response 200:**
```json
{ "typeBreakdown": [...], "avgResolutionHours": N, "priorityBreakdown": [...], "trend": [...] }
```

---

### Admin: Settings

#### `GET /api/admin/settings`

Get all platform settings (key-value pairs).

**Auth: admin.**

**Response 200:** `{ "data": [ { "key": "...", "value": "..." } ] }`

---

#### `PATCH /api/admin/settings`

Update one or more platform settings.

**Auth: admin.**

**Request body:**
```json
{ "key1": "value1", "key2": "value2" }
```

**Known setting keys:**

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `driver_commission_rate` | float | `0.15` | Platform commission (15% default) |
| `waiting_charge_per_minute` | float | `2.00` | EGP per minute after free window |
| `max_waiting_charge` | float | `20.00` | Cap on waiting charge |
| `cancellation_fee_assigned` | float | `2.00` | Fee when driver is assigned |
| `cancellation_fee_arrived` | float | `5.00` | Fee when driver has arrived |
| `no_show_timeout_minutes` | int | `10` | Minutes before no-show triggers |
| `dispatch_peak_windows` | JSON | `[{7,9},{17,19}]` | Peak hour windows |
| `dispatch_drivers_per_round` | int | `3` | Batch size off-peak |
| `dispatch_drivers_per_round_peak` | int | `5` | Batch size during peak |
| `dispatch_radius_steps_km` | JSON | `[5,8,12]` | Search radius expansion off-peak |
| `dispatch_radius_steps_km_peak` | JSON | `[3,5,8]` | Search radius expansion during peak |

**Response 200:** Updated settings.

---

#### `GET /api/admin/settings/app`

Get app-level settings (name, support contacts, social links, policy URLs).

**Auth: admin.**

**Response 200:**
```json
{
  "appName": "ShuttleOps",
  "supportEmail": "support@shuttleops.com",
  "supportPhone": "+20-100-000-0000",
  "facebookUrl": "",
  "twitterUrl": "",
  "instagramUrl": "",
  "privacyPolicyUrl": "",
  "termsUrl": ""
}
```

---

#### `PATCH /api/admin/settings/app`

Update app settings (partial update).

**Auth: admin.**  
**Deprecated alias:** `PUT /api/admin/settings/app` (same logic, PATCH semantics).

**Request body:** Any fields from app settings (all optional).

**Response 200:** Updated app settings.

---

### Admin: Dispatch (Peak Settings)

#### `GET /api/admin/dispatch/peak-settings`

Get all five dispatch/peak-hours settings with a live `isPeak` flag.

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

Update any subset of the five dispatch settings.

**Auth: admin.**

**Request body (all optional):**
```json
{
  "dispatch_peak_windows": [{"startHour": 7, "endHour": 9}],
  "dispatch_drivers_per_round": 3,
  "dispatch_drivers_per_round_peak": 5,
  "dispatch_radius_steps_km": [5, 8, 12],
  "dispatch_radius_steps_km_peak": [3, 5, 8]
}
```

**Note:** Changes take effect within 60 seconds (dispatch-manager cache TTL).

**Response 200:** `{ "success": true, "updated": ["key1", "key2"], "note": "..." }`

---

### Admin: SOS Events

#### `GET /api/admin/sos-events`

List SOS emergency events.

**Auth: admin.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | `active\|resolved` | Filter |
| `from` | ISO date | Inclusive lower bound |
| `to` | ISO date | Inclusive upper bound |
| `limit` | int | Max 200, default 50 |
| `offset` | int | Default 0 |

**Response 200:**
```json
{
  "data": [ { "id": N, "userId": N, "rideId": N, "role": "passenger|driver", "latitude": N, "longitude": N, "triggeredAt": "...", "status": "active|resolved", "notes": null, "userName": "...", "userPhone": "..." } ],
  "meta": { "limit": 50, "offset": 0, "returned": N }
}
```

---

#### `POST /api/admin/sos-events/:id/resolve`

Resolve an SOS event.

**Auth: admin.**

**Request body:**
```json
{ "notes": "string (optional)" }
```

**Response 200:** `{ "data": { ...updatedSosEvent } }`

---

### Admin: Audit Logs

#### `GET /api/admin/audit-logs`

Paginated list of admin audit log entries.

**Auth: admin.**

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Max 100, default 25 |
| `action` | string | Filter by action (CREATE, UPDATE, DELETE) |
| `entityType` | string | Filter by entity type (bus, vehicle, etc.) |
| `userId` | int | Filter by admin user |
| `from` | ISO datetime | Range start |
| `to` | ISO datetime | Range end |

**Response 200:** `{ "data": [...logs], "total": N, "page": N, "limit": N }`

---

#### `GET /api/admin/audit-logs/:id`

Get a specific audit log entry.

**Auth: admin.**

**Response 200:** Audit log with `oldData`, `newData`, `ipAddress`, `userAgent`.

---

#### `GET /api/admin/audit-logs/distinct/actions`

Get distinct action values for filter dropdowns.

**Auth: admin.**

**Response 200:** `["CREATE", "DELETE", "UPDATE"]`

---

#### `GET /api/admin/audit-logs/distinct/entity-types`

Get distinct entity type values.

**Auth: admin.**

**Response 200:** `["bus", "vehicle", "driver", ...]`

---

### Admin: Staff & Roles

#### `GET /api/admin/permissions/all`

List all available permission strings.

**Auth: admin.**

**Response 200:** `{ "permissions": ["view_dashboard", "edit_routes", ...] }`

Full permission list: `view_dashboard`, `view_routes`, `edit_routes`, `view_trips`, `edit_trips`, `view_drivers`, `edit_drivers`, `view_buses`, `edit_buses`, `view_passengers`, `edit_passengers`, `view_bookings`, `edit_bookings`, `view_wallet`, `edit_wallet`, `view_support`, `edit_support`, `view_suggestions`, `view_verification`, `edit_verification`, `view_analytics`, `view_staff`, `edit_staff`, `view_settings`, `edit_settings`, `view_promo`, `edit_promo`, `view_live_tracking`, `view_driver_analytics`, `view_notifications`

---

#### `GET /api/admin/roles`

List all staff roles.

**Auth: admin.**

**Response 200:** `{ "data": [...roles], "total": N }`

---

#### `POST /api/admin/roles`

Create a staff role.

**Auth: admin.**

**Request body:**
```json
{ "name": "string", "description": "string (optional)", "permissions": ["view_dashboard", ...] }
```

**Response 201:** Role object.

---

#### `PATCH /api/admin/roles/:id`

Update a staff role.

**Auth: admin.**

**Request body:** Any fields from create (all optional).

**Response 200:** Updated role.

---

#### `DELETE /api/admin/roles/:id`

Delete a staff role. Removes the role assignment from all users who had it.

**Auth: admin.**

**Response 200:** `{ "success": true }`

---

#### `GET /api/admin/staff`

List all admin users.

**Auth: admin.**

**Query params:** `search`

**Response 200:** `{ "data": [ { ...adminUser, "staffRole": { ...role } } ], "total": N }`

---

#### `POST /api/admin/staff`

Create a new admin/staff user.

**Auth: admin.**

**Request body:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "password": "string (min 8)",
  "staffRoleId": "number (optional)"
}
```

**Response 201:** Created admin user (without password).

---

#### `PATCH /api/admin/staff/:id`

Update a staff user's profile, role assignment, or block status.

**Auth: admin.**

**Request body (all optional):**
```json
{ "name": "string", "email": "string", "phone": "string", "staffRoleId": N, "isBlocked": false, "password": "string" }
```

**Response 200:** Updated staff user.

---

#### `DELETE /api/admin/staff/:id`

Delete a staff/admin user. Cannot delete your own account.

**Auth: admin.**

**Response 200:** `{ "success": true }`

---

### Admin: Bookings

#### `GET /api/admin/bookings`

List all shuttle bookings with passenger, trip, and route details.

**Auth: admin.**

**Query params:** `page`, `limit`, `status`, `search`

**Response 200:** Paginated bookings list.

---

### Admin: Transactions

#### `GET /api/admin/transactions`

Alias for wallet transactions list with joined user info.

**Auth: admin.**

**Query params:** `page`, `limit`

**Response 200:** Paginated transactions with user details.

---

### Admin: Location History

#### `GET /api/admin/driver-locations`

Paginated GPS location history for a driver.

**Auth: admin.**

**Query params:** `driverId` (required), `page`, `limit` (max 200)

**Response 200:** `{ "data": [...locations], "total": N, "page": N, "limit": N }`

---

#### `GET /api/admin/driver-locations/:driverId/latest`

Get the most recent GPS location for a driver.

**Auth: admin.**

**Response 200:** Single location record.

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

### Events: Rides

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `ride:new_request` | `drivers:available:{vehicleType}` | `{ rideId, vehicleType, pickupAddress, dropoffAddress, distanceKm, estimatedPrice }` |
| `ride:driver_assigned` | `passenger:{userId}` | `{ rideId, driverId, driverName, driver: { name, phone, vehicle, rating }, eta }` |
| `ride:driver_arrived` | `passenger:{userId}` | `{ rideId, driverId }` |
| `ride:started` | `passenger:{userId}` | `{ rideId, driverId }` |
| `ride:completed` | `passenger:{userId}` | `{ rideId, finalPrice, fare, waitingCharge }` |
| `ride:cancelled` | `passenger:{userId}` | `{ rideId, reason }` |
| `ride:driver_cancelled` | `passenger:{userId}` | `{ rideId, message }` |
| `ride:location_updated` | `passenger:{userId}` | `{ rideId, driverId, latitude, longitude, heading }` |
| `ride:deviation_warning` | `admin:room` + `passenger:{userId}` | `{ rideId, driverId, latitude, longitude, deviationM }` |
| `ride:timeout` | `passenger:{userId}` | `{ rideId }` |
| `ride:offer_expired` | `driver:{userId}` | `{ rideId }` |

### Events: Waiting Timer

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `ride:free_window_ended` | `passenger:{userId}` | `{ rideId, ratePerMinute }` |
| `ride:waiting_charge_updated` | `passenger:{userId}` + `driver:{userId}` | `{ rideId, chargedMinutes, totalCharge, ratePerMinute }` |
| `ride:waiting_charge_capped` | `passenger:{userId}` + `driver:{userId}` | `{ rideId, totalCharge, maxCharge }` |

### Events: No-Show

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `ride:no_show` | `passenger:{userId}` + `driver:{userId}` + `admin:room` | `{ rideId, arrivedFlatFee, waitingCharge, totalFee, refundAmount }` |

### Events: Driver Status

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `driver:location_updated` | `driver:{userId}` | `{ latitude, longitude, heading }` |
| `driver:online` | `drivers:available:{vehicleType}` | `{ driverId }` |
| `driver:offline` | `drivers:available:{vehicleType}` | `{ driverId }` |

### Events: Driver Check-In

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `driver:checkin_required` | `driver:{userId}` | `{ driverId, deadline: ISO8601 }` |
| `driver:checkin_rejected` | `driver:{userId}` | `{ driverId, reason: "No check-in within deadline" }` |

### Events: Shuttle / Bookings

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `booking:boarded` | `passenger:{userId}` | `{ bookingId, tripId, timestamp }` |
| `trip:activated` | `admin:room` + `passengers:all` | `{ tripId }` |
| `trip:cancelled` | `admin:room` + `passengers:all` | `{ tripId }` |

### Events: Surge Pricing

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `surge:update` | All connected clients | `{ vehicleType, multiplier, tier: "none|low|medium|high", ratio, isActive }` |

### Events: Service Controls

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `service:control_changed` | All clients + `admin:room` | `{ serviceType, isEnabled, displayMode, unavailableMessage, unavailableAction, activeZoneIds, maintenanceEta, changedBy, changedAt }` |
| `service:settings_changed` | All clients + `admin:room` | `{ serviceType, minDriverRating, requiredLicenseTypes, requireInsurance, requireBackgroundCheck, maxActiveRidesPerDriver, changedBy, changedAt }` |

### Events: SOS

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `sos:triggered` | `admin:room` | `{ sosId, rideId, userId, role, latitude, longitude, notes, triggeredAt }` |

### Events: Chat

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `chat:message` | `trip:{tripId}` or passenger/driver rooms | `{ rideId, senderId, message, timestamp }` |

---

## Background Jobs

All background jobs start automatically at server boot.

### Ride Timeout Job (`lib/ride-timeout.ts`)

**Interval:** Every 60 seconds  
**Env var:** `RIDE_TIMEOUT_MINUTES` (default: `5`)

Scans for rides stuck in `searching` status beyond the timeout window. For each timed-out ride:
1. Sets status → `cancelled` (reason: `"timeout"`)
2. Refunds the escrowed fare to the passenger's wallet
3. Emits `ride:timeout` to `passenger:{userId}`

---

### Dispatch Manager (`lib/dispatch-manager.ts`)

**Recovery:** Runs once at startup to re-dispatch rides in `searching` status  
**Round timeout:** 15 seconds per dispatch round

Handles all ride dispatch logic:
- **Dynamic radius expansion:** Searches at expanding radius steps (configurable off-peak/peak)
- **Peak hours mode:** Uses different batch sizes and tighter radius steps during peak windows
- **Cooldown:** Drivers who decline 3 consecutive rides are cooled down for 10 minutes
- **Fair distribution:** Drivers recently offered a ride in the past 10 minutes get a scoring penalty
- **Driver scoring:** Factors distance, rating, and recency into priority
- **Round timeout:** After 15s with no acceptance, the offer expires and the next batch of drivers is notified

---

### Surge Pricing Job (`lib/surge-pricing.ts`)

**Interval:** Every 5 minutes (configurable via `SURGE_INTERVAL_MS`)  
**Vehicle types evaluated:** `car`, `bike`

Calculates the demand/supply ratio (searching rides ÷ online drivers) per vehicle type and sets a surge tier:

| Ratio | Tier | Multiplier |
|-------|------|-----------|
| < 2.0 | `none` | 1.0× |
| 2.0 – 3.0 | `low` | 1.3× |
| 3.0 – 5.0 | `medium` | 1.6× |
| ≥ 5.0 | `high` | 2.0× |

Surge state is persisted to DB settings and broadcast via `surge:update` Socket.IO event.

---

### Waiting Timer (`lib/waiting-timer.ts`)

**Triggered:** When driver arrives at pickup (`PATCH /driver/rides/:id/arrived`)  
**Free window:** 3 minutes  
**Charge tick:** Every 60 seconds after free window

Charges the passenger per minute after the free window expires:
- Rate: `waiting_charge_per_minute` setting (default: 2.00 EGP/min)
- Cap: `max_waiting_charge` setting (default: 20.00 EGP)
- Emits `ride:free_window_ended`, `ride:waiting_charge_updated`, `ride:waiting_charge_capped`
- Waiting charge is locked in at ride-start and added to final price on completion

---

### No-Show Monitor (`lib/no-show-monitor.ts`)

**Triggered:** When driver arrives at pickup (in parallel with waiting timer)  
**Timeout:** `no_show_timeout_minutes` setting (default: 10 minutes)

If the passenger does not board within the window:
1. Stops waiting timer and captures accrued charge
2. Charges cancellation fee (`cancellation_fee_arrived` setting, default 5.00 EGP) + waiting charge
3. Refunds remainder of escrow to passenger
4. Sets ride to `cancelled`, driver to `online`
5. Creates driver earnings record for the no-show fee
6. Emits `ride:no_show` to all parties and `admin:room`

---

### Check-In Monitor (`lib/checkin-monitor.ts`)

**Interval:** Every 60 seconds  
**Phase 1 prompt after:** `CHECKIN_PROMPT_HOURS` env var (default: 10 hours online)  
**Phase 2 deadline:** `CHECKIN_DEADLINE_MINUTES` env var (default: 30 minutes)

**Phase 1 (Prompt):** Finds drivers online ≥ N hours without a recent face-detected check-in. Sets `checkInRequired = true`, assigns a deadline, emits `driver:checkin_required`.

**Phase 2 (Enforce):** Finds drivers with an expired `checkInDeadline`. Sets them offline, clears check-in state, emits `driver:checkin_rejected`.

---

### Shuttle Status Job (`lib/shuttle-job.ts`)

**Interval:** Every 15 minutes  
**Look-ahead window:** 8 hours

Evaluates all `scheduled` or `active` trips departing within the next 8 hours:
- **Trips with < 7 bookings** → set to `cancelled`; passengers refunded via wallet
- **`scheduled` trips with ≥ 7 bookings** → set to `active`
- Emits `trip:cancelled` or `trip:activated` Socket.IO events

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Secret for JWT signing |
| `JWT_REFRESH_SECRET` | Yes | — | Secret for refresh token signing |
| `PORT` | No | `8080` | HTTP server port |
| `SUPABASE_URL` | Yes (for file uploads) | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (for file uploads) | — | Supabase service role key |
| `SUPABASE_BUCKET` | No | `uploads` | Supabase storage bucket name |
| `RIDE_TIMEOUT_MINUTES` | No | `5` | Minutes before un-accepted rides are cancelled |
| `RIDE_RATE_LIMIT_WINDOW_MS` | No | `120000` | Ride request rate limit window |
| `RIDE_RATE_LIMIT_MAX` | No | `3` | Max ride requests per window |
| `SURGE_INTERVAL_MS` | No | `300000` | Surge pricing recalculation interval |
| `CHECKIN_PROMPT_HOURS` | No | `10` | Hours online before check-in prompt |
| `CHECKIN_DEADLINE_MINUTES` | No | `30` | Minutes to complete check-in after prompt |
| `REPLIT_DEV_DOMAIN` | No | — | Used to construct share-link URLs in Replit environment |
