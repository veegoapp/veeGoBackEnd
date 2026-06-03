# Backend API Contract

**Base URL:** `https://0f7ebc97-871a-44da-9afe-1004df3f3f52-00-etsuj4iud2kt.worf.replit.dev`  
**REST prefix:** `/api` (all REST endpoints below are relative to `/api`)  
**WebSocket path:** `/api/socket.io`  
**Generated from:** actual source code audit — June 2026

---

## Table of Contents

1. [Authentication & Conventions](#1-authentication--conventions)
2. [Health](#2-health)
3. [Auth Endpoints](#3-auth-endpoints)
4. [Rides (On-demand)](#4-rides-on-demand)
5. [Routes & Stations](#5-routes--stations)
6. [Trips (Shuttle)](#6-trips-shuttle)
7. [Bookings](#7-bookings)
8. [Drivers — Admin Management](#8-drivers--admin-management)
9. [Driver — Self-Service (role: driver)](#9-driver--self-service-role-driver)
10. [Driver Documents](#10-driver-documents)
11. [Users — Admin Management](#11-users--admin-management)
12. [User Locations](#12-user-locations)
13. [Ratings](#13-ratings)
14. [Payments](#14-payments)
15. [Wallet](#15-wallet)
16. [Notifications](#16-notifications)
17. [Support Tickets](#17-support-tickets)
18. [Chat](#18-chat)
19. [Zones](#19-zones)
20. [Zone Pricing](#20-zone-pricing)
21. [Promo Codes](#21-promo-codes)
22. [Shuttle](#22-shuttle)
23. [Buses](#23-buses)
24. [Vehicles](#24-vehicles)
25. [Earnings](#25-earnings)
26. [Dashboard](#26-dashboard)
27. [Service Controls](#27-service-controls)
28. [Staff & Roles](#28-staff--roles)
29. [Suggestions](#29-suggestions)
30. [Audit Logs](#30-audit-logs)
31. [Admin Analytics](#31-admin-analytics)
32. [WebSocket Events](#32-websocket-events)

---

## 1. Authentication & Conventions

### Authentication

All protected endpoints require a JWT Bearer token:

```
Authorization: Bearer <accessToken>
```

Login returns two tokens:
- `accessToken` — short-lived; used in `Authorization` header
- `refreshToken` — long-lived; used to obtain new access tokens

### Role Values

| Role | Description |
|------|-------------|
| `passenger` | Default registered user |
| `driver` | Driver account |
| `admin` | Administrator/staff |

### Common Error Shapes

```jsonc
// 400 Bad Request
{ "error": "Validation message or field description" }

// 401 Unauthorized
{ "error": "Unauthorized" }

// 403 Forbidden
{ "error": "Forbidden" }

// 404 Not Found
{ "error": "Resource not found" }

// 409 Conflict
{ "error": "Description of conflict" }

// 500 Internal Server Error
{ "error": "Description" }
```

### Pagination

Most list endpoints support:

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `page` | int | `1` | 1-indexed page number |
| `limit` | int | `20` | Results per page (max 100) |

Paginated responses return:
```jsonc
{ "data": [...], "total": 123, "page": 1, "limit": 20 }
```

### Numeric Money Fields

All monetary amounts are stored as strings in the database but **parsed to `float`** in all API responses. Always send numeric values (not strings) in request bodies.

---

## 2. Health

No authentication required.

### `GET /health`
```jsonc
// 200 OK
{ "status": "ok", "timestamp": "2026-06-03T00:00:00.000Z" }
```

### `GET /healthz`
```jsonc
// 200 OK
{ "status": "ok" }
```

### `GET /health/db`
```jsonc
// 200 OK
{
  "status": "ok",
  "database": "connected",
  "latencyMs": 12,
  "provider": "neon",
  "timestamp": "2026-06-03T00:00:00.000Z"
}

// 503 Service Unavailable
{
  "status": "error",
  "database": "disconnected",
  "error": "connection refused",
  "timestamp": "2026-06-03T00:00:00.000Z"
}
```

---

## 3. Auth Endpoints

### `POST /auth/register`
**Auth:** None

**Request:**
```jsonc
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "password": "securepass123"
}
```

**Response `201`:**
```jsonc
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+1234567890",
    "role": "passenger",
    "createdAt": "2026-06-03T00:00:00.000Z"
  }
}
```

---

### `POST /auth/register/driver`
**Auth:** None

**Request:**
```jsonc
{
  "name": "John Driver",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "securepass123",
  "vehicleType": "car",          // "car" | "motorcycle" | "van" | "minibus"
  "plateNumber": "ABC-1234",
  "make": "Toyota",
  "model": "Camry",
  "year": 2020,
  "color": "White"
}
```

**Response `201`:**
```jsonc
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": 2, "role": "driver", ... },
  "driver": { "id": 1, "userId": 2, "status": "pending", ... }
}
```

---

### `POST /auth/login`
**Auth:** None  
**Note:** Both `email` and `credential` field names are accepted for the identifier.

**Request:**
```jsonc
{
  "email": "jane@example.com",   // OR "credential": "jane@example.com"
  "password": "securepass123"
}
```

**Response `200`:**
```jsonc
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+1234567890",
    "role": "passenger",
    "walletBalance": "150.00",
    "createdAt": "2026-06-03T00:00:00.000Z"
  }
}
```

---

### `POST /auth/refresh`
**Auth:** None (uses refresh token)

**Request:**
```jsonc
{ "refreshToken": "eyJ..." }
```

**Response `200`:**
```jsonc
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

---

### `POST /auth/logout`
**Auth:** Required

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "message": "Logged out successfully" }
```

---

### `GET /auth/me`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "id": 1,
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "role": "passenger",
  "walletBalance": "150.00",
  "isBlocked": false,
  "createdAt": "2026-06-03T00:00:00.000Z"
}
```

---

### `PATCH /auth/me`
**Auth:** Required

**Request (all fields optional):**
```jsonc
{
  "name": "Jane Smith",
  "phone": "+0987654321",
  "email": "new@example.com"
}
```

**Response `200`:** Updated user object (same shape as `GET /auth/me`)

---

### `POST /auth/change-password`
**Auth:** Required

**Request:**
```jsonc
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456"
}
```

**Response `200`:**
```jsonc
{ "message": "Password changed successfully" }
```

---

### `POST /auth/forgot-password`
**Auth:** None

**Request:**
```jsonc
{ "email": "jane@example.com" }
```

**Response `200`:**
```jsonc
{ "message": "If the email exists, a reset link has been sent" }
```

---

### `POST /auth/reset-password`
**Auth:** None

**Request:**
```jsonc
{
  "token": "reset-token-from-email",
  "newPassword": "newpass789"
}
```

**Response `200`:**
```jsonc
{ "message": "Password reset successfully" }
```

---

## 4. Rides (On-demand)

Ride statuses: `searching` → `driver_assigned` → `driver_arrived` → `active` → `completed` | `cancelled`

### `POST /rides`
**Auth:** Required (passenger)

**Request:**
```jsonc
{
  "pickupLatitude": 24.7136,
  "pickupLongitude": 46.6753,
  "dropoffLatitude": 24.6877,
  "dropoffLongitude": 46.7219,
  "pickupAddress": "Riyadh, Al Olaya",
  "dropoffAddress": "Riyadh, Al Nakheel",
  "vehicleType": "car",          // "car" | "motorcycle" | "van"
  "paymentMethod": "wallet",     // "wallet" | "cash"
  "promoCode": "SAVE10"          // optional
}
```

**Response `201`:**
```jsonc
{
  "id": 42,
  "userId": 1,
  "status": "searching",
  "vehicleType": "car",
  "pickupLatitude": "24.7136",
  "pickupLongitude": "46.6753",
  "dropoffLatitude": "24.6877",
  "dropoffLongitude": "46.7219",
  "pickupAddress": "Riyadh, Al Olaya",
  "dropoffAddress": "Riyadh, Al Nakheel",
  "estimatedPrice": 25.50,
  "paymentMethod": "wallet",
  "createdAt": "2026-06-03T10:00:00.000Z"
}
```

---

### `GET /rides`
**Auth:** Required  
**Note:** Passengers see own rides; admins see all rides.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status |
| `page` | int | Page number |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [ { "id": 42, "status": "completed", ... } ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

### `GET /rides/:id`
**Auth:** Required

**Response `200`:** Full ride object including driver info if assigned:
```jsonc
{
  "id": 42,
  "status": "driver_assigned",
  "driver": {
    "id": 1,
    "name": "Ahmed Ali",
    "phone": "+966501234567",
    "rating": 4.8,
    "vehicle": { "plateNumber": "ABC-1234", "make": "Toyota", "model": "Camry", "color": "White" }
  },
  "estimatedPrice": 25.50,
  "actualPrice": null,
  ...
}
```

---

### `POST /rides/:id/cancel`
**Auth:** Required (passenger cancels own ride; admin cancels any)

**Request:**
```jsonc
{ "reason": "Changed my mind" }   // optional
```

**Response `200`:**
```jsonc
{ "id": 42, "status": "cancelled", ... }
```

---

### `POST /rides/:id/rate`
**Auth:** Required (passenger)

**Request:**
```jsonc
{
  "rating": 5,           // 1–5
  "comment": "Great ride!"  // optional
}
```

**Response `200`:**
```jsonc
{ "ok": true, "rideId": 42, "rating": 5 }
```

---

### `GET /rides/:id/driver-location`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "latitude": 24.7100,
  "longitude": 46.6800,
  "updatedAt": "2026-06-03T10:05:00.000Z"
}
```

---

### `POST /rides/:id/accept` _(Driver)_
**Auth:** Required (role: driver)

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "id": 42, "status": "driver_assigned", "driverId": 1, ... }
```

---

### `POST /rides/:id/arrived` _(Driver)_
**Auth:** Required (role: driver)

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "id": 42, "status": "driver_arrived", ... }
```

---

### `POST /rides/:id/start` _(Driver)_
**Auth:** Required (role: driver)

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "id": 42, "status": "active", ... }
```

---

### `POST /rides/:id/complete` _(Driver)_
**Auth:** Required (role: driver)

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "id": 42, "status": "completed", "actualPrice": 25.50, ... }
```

---

### `POST /rides/:id/cancel` _(Driver cancel)_
**Auth:** Required (role: driver)

**Request:**
```jsonc
{ "reason": "Passenger not found" }  // optional
```

**Response `200`:**
```jsonc
{ "id": 42, "status": "cancelled", ... }
```

---

## 5. Routes & Stations

Shuttle route management. Several endpoints are **public** (no auth required).

### `GET /routes`
**Auth:** None (public)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Filter by route name (ILIKE) |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "name": "City Center → Airport",
      "fromLocation": "City Center",
      "toLocation": "Airport",
      "estimatedDuration": 45,
      "basePrice": 15.00,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 5
}
```

---

### `POST /routes`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "name": "City Center → Airport",
  "fromLocation": "City Center",
  "toLocation": "Airport",
  "estimatedDuration": 45,    // minutes
  "basePrice": 15.00,
  "isActive": true             // optional, default true
}
```

**Response `201`:** Route object with `basePrice` as float.

---

### `GET /routes/:id`
**Auth:** None (public)

**Response `200`:** Single route object.  
**Response `404`:** `{ "error": "Route not found" }`

---

### `PATCH /routes/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "name": "Updated Name",
  "fromLocation": "...",
  "toLocation": "...",
  "estimatedDuration": 50,
  "basePrice": 18.00,
  "isActive": false
}
```

**Response `200`:** Updated route object.

---

### `DELETE /routes/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

### `GET /routes/:id/stations`
**Auth:** None (public)

**Response `200`:** Array of station objects ordered by `order`:
```jsonc
[
  {
    "id": 1,
    "routeId": 1,
    "name": "Main Station",
    "latitude": "24.7136",
    "longitude": "46.6753",
    "order": 1,
    "direction": "outbound",
    "segmentPrice": 5.00,
    "createdAt": "..."
  }
]
```

---

### `POST /routes/:id/stations`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "name": "New Station",
  "latitude": 24.7200,
  "longitude": 46.6900,
  "order": 3,
  "direction": "outbound",      // "outbound" | "return", default "outbound"
  "segmentPrice": 5.00          // optional
}
```

**Response `201`:** Station object with `segmentPrice` as float or null.

---

### `PATCH /routes/:id/stations/:stationId`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "name": "Renamed Station",
  "latitude": 24.7205,
  "longitude": 46.6905,
  "order": 4,
  "direction": "return",
  "segmentPrice": 6.50
}
```

**Response `200`:** Updated station object.

---

### `DELETE /routes/:id/stations/:stationId`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

## 6. Trips (Shuttle)

Trip statuses: `scheduled` → `boarding` | `driver_assigned` → `active` → `completed` | `cancelled`

### `GET /trips`
**Auth:** None (public)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `routeId` | int | Filter by route |
| `status` | string | Filter by status |
| `from` | ISO date | Departure time from |
| `to` | ISO date | Departure time to |
| `page` | int | Page number |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 10,
      "routeId": 1,
      "busId": 2,
      "driverId": 3,
      "departureTime": "2026-06-03T07:00:00.000Z",
      "arrivalTime": "2026-06-03T07:45:00.000Z",
      "availableSeats": 18,
      "totalSeats": 20,
      "price": 15.00,
      "status": "scheduled",
      "isActive": true,
      "routeName": "City Center → Airport",
      "fromLocation": "City Center",
      "toLocation": "Airport"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 20
}
```

---

### `POST /trips`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "routeId": 1,
  "busId": 2,
  "driverId": 3,
  "departureTime": "2026-06-03T07:00:00.000Z",
  "arrivalTime": "2026-06-03T07:45:00.000Z",
  "availableSeats": 20,
  "totalSeats": 20,
  "price": 15.00,
  "status": "scheduled",         // optional, default "scheduled"
  "isActive": true,              // optional, default true
  "recurringType": "weekdays",   // optional
  "weekdays": "0,1,2,3,4"       // optional (Sun=0 ... Sat=6)
}
```

**Response `201`:** Trip object.

---

### `GET /trips/:id`
**Auth:** Required

**Response `200`:** Trip object with route and driver details.

---

### `PATCH /trips/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):** Same fields as POST.

**Response `200`:** Updated trip object.

---

### `DELETE /trips/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

### `POST /trips/:id/board`
**Auth:** Required

Marks a passenger as boarded on a trip. Uses `userId` from JWT.

**Request:**
```jsonc
{ "bookingId": 5 }  // optional; if omitted, infers from userId
```

**Response `200`:**
```jsonc
{
  "ok": true,
  "tripId": 10,
  "bookingId": 5,
  "status": "boarded"
}
```

---

### `GET /trips/:id/progress`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "tripId": 10,
  "status": "active",
  "currentStation": { "id": 3, "name": "Midpoint Stop", "order": 3 },
  "stations": [
    { "stationId": 1, "stationName": "Start", "status": "arrived", "arrivedAt": "..." },
    { "stationId": 2, "stationName": "Stop 2", "status": "arrived", "arrivedAt": "..." },
    { "stationId": 3, "stationName": "Midpoint Stop", "status": "pending" }
  ]
}
```

---

### `GET /trips/:id/events`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "tripId": 10,
  "events": [
    { "id": 1, "type": "LOCATION_UPDATE", "metadata": { ... }, "createdAt": "..." }
  ]
}
```

---

### `POST /trips/:id/next-station` _(Driver)_
**Auth:** Required (role: driver)

Advances the trip to the next station and emits socket events.

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{
  "ok": true,
  "tripId": 10,
  "currentStation": { "id": 4, "name": "Next Stop", "order": 4 },
  "isLastStation": false
}
```

---

## 7. Bookings

### `POST /bookings`
**Auth:** Required (any authenticated user)

Creates a booking and deducts wallet balance in a DB transaction.

**Request:**
```jsonc
{
  "tripId": 10,
  "seatCount": 2,
  "promoCode": "SAVE10"    // optional
}
```

**Response `201`:**
```jsonc
{
  "id": 55,
  "userId": 1,
  "tripId": 10,
  "seatCount": 2,
  "totalPrice": 30.00,
  "status": "confirmed",
  "paymentStatus": "paid",
  "createdAt": "2026-06-03T09:00:00.000Z"
}
```

**Error `400`:** Insufficient wallet balance, trip full, trip not bookable  
**Error `409`:** Duplicate booking

---

### `GET /bookings/:id`
**Auth:** Required

**Response `200`:** Full booking object with trip and route details.

---

### `POST /bookings/:id/cancel`
**Auth:** Required

Cancels booking and refunds wallet.

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{
  "id": 55,
  "status": "cancelled",
  "refundAmount": 30.00
}
```

---

### `GET /users/me/bookings`
**Auth:** Required

**Query params:** `page`, `limit`, `status`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 55,
      "tripId": 10,
      "seatCount": 2,
      "totalPrice": 30.00,
      "status": "confirmed",
      "trip": {
        "routeName": "City Center → Airport",
        "departureTime": "2026-06-03T07:00:00.000Z",
        "arrivalTime": "2026-06-03T07:45:00.000Z"
      }
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 20
}
```

---

## 8. Drivers — Admin Management

### `GET /drivers`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Search name/phone/email |
| `status` | string | `pending` \| `active` \| `suspended` \| `rejected` |
| `isOnline` | bool | Filter by online status |
| `page` | int | Page |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "userId": 2,
      "name": "Ahmed Ali",
      "phone": "+966501234567",
      "email": "ahmed@example.com",
      "status": "active",
      "isOnline": true,
      "isActive": true,
      "rating": 4.8,
      "totalRides": 152,
      "assignedBusId": 3,
      "currentLatitude": "24.7136",
      "currentLongitude": "46.6753",
      "createdAt": "..."
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

---

### `POST /drivers`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "userId": 2,
  "name": "Ahmed Ali",
  "phone": "+966501234567",
  "status": "active",          // optional
  "isActive": true             // optional
}
```

**Response `201`:** Driver object.

---

### `GET /drivers/:id`
**Auth:** Required (role: admin)

**Response `200`:** Full driver object.

---

### `PATCH /drivers/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "name": "Updated Name",
  "phone": "...",
  "status": "suspended",
  "isActive": false,
  "assignedBusId": 5
}
```

**Response `200`:** Updated driver object.

---

### `DELETE /drivers/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

### `PATCH /drivers/:id/status`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "status": "active",       // "pending" | "active" | "suspended" | "rejected"
  "reason": "Approved"      // optional
}
```

**Response `200`:** Updated driver object.

---

### `GET /drivers/:id/history`
**Auth:** Required (role: admin)

**Response `200`:** List of completed trips/rides for the driver.

---

### `GET /drivers/:id/earnings`
**Auth:** Required (role: admin)

**Response `200`:** Earnings summary and history for driver.

---

### `GET /drivers/:id/current-trip`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "trip": {
    "id": 10,
    "status": "active",
    "routeName": "City Center → Airport",
    ...
  }
}
// or { "trip": null } if no active trip
```

---

### `GET /drivers/:id/location`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "driverId": 1,
  "latitude": "24.7100",
  "longitude": "46.6800",
  "updatedAt": "2026-06-03T10:05:00.000Z"
}
```

---

### `POST /drivers/location`
**Auth:** Required (role: driver)

Updates the authenticated driver's current GPS coordinates.

**Request:**
```jsonc
{
  "latitude": 24.7136,
  "longitude": 46.6753,
  "accuracy": 10.5,      // optional, meters
  "heading": 90.0,       // optional, degrees
  "speed": 60.0          // optional, km/h
}
```

**Response `200`:**
```jsonc
{ "ok": true }
```

---

## 9. Driver — Self-Service (role: driver)

All endpoints in this section require `Authorization: Bearer <token>` with `role = "driver"`.

### `GET /driver/profile`

**Response `200`:**
```jsonc
{
  "id": 1,
  "userId": 2,
  "name": "Ahmed Ali",
  "phone": "+966501234567",
  "email": "ahmed@example.com",
  "status": "active",
  "isOnline": false,
  "rating": 4.8,
  "totalRides": 152,
  "assignedBusId": 3,
  "currentLatitude": "24.7136",
  "currentLongitude": "46.6753",
  "vehicle": { "plateNumber": "ABC-1234", "make": "Toyota", "model": "Camry", "year": 2020, "color": "White" }
}
```

---

### `PATCH /driver/profile`

**Request (all fields optional):**
```jsonc
{
  "name": "Ahmed Ali Updated",
  "phone": "+966507654321",
  "profilePhoto": "https://..."
}
```

**Response `200`:** Updated driver profile object.

---

### `GET /driver/status`

**Response `200`:**
```jsonc
{
  "isOnline": true,
  "status": "active",
  "currentLatitude": "24.7136",
  "currentLongitude": "46.6753"
}
```

---

### `POST /driver/status`

**Request:**
```jsonc
{
  "isOnline": true,
  "latitude": 24.7136,    // required when going online
  "longitude": 46.6753    // required when going online
}
```

**Response `200`:**
```jsonc
{ "isOnline": true, "status": "active" }
```

---

### `GET /driver/rides`

**Query params:** `status`, `page`, `limit`

**Response `200`:**
```jsonc
{
  "data": [ { "id": 42, "status": "completed", "actualPrice": 25.50, ... } ],
  "total": 152,
  "page": 1,
  "limit": 20
}
```

---

### `GET /driver/trips`

**Query params:** `status`, `page`, `limit`

**Response `200`:**
```jsonc
{
  "data": [ { "id": 10, "status": "completed", "routeName": "...", ... } ],
  "total": 80,
  "page": 1,
  "limit": 20
}
```

---

### `GET /driver/earnings`

Returns paginated earnings records for the authenticated driver.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `pending` \| `confirmed` \| `paid` |
| `page` | int | Page |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 100,
      "driverId": 1,
      "tripId": 10,
      "amount": 12.75,
      "status": "confirmed",
      "date": "2026-06-03",
      "createdAt": "..."
    }
  ],
  "total": 80,
  "page": 1,
  "limit": 20
}
```

---

### `GET /driver/earnings/history`

Alias / filtered version of driver earnings. Same query params and response shape as `GET /driver/earnings`.

---

### `GET /driver/notifications`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "userId": 2,
      "title": "New Ride Request",
      "body": "Passenger is waiting...",
      "type": "ride_request",
      "isRead": false,
      "createdAt": "..."
    }
  ]
}
```
_(Returns up to 50 most recent notifications)_

---

### `GET /driver/wallet/balance`

**Response `200`:**
```jsonc
{
  "balance": 145.50,       // confirmed earnings
  "totalPaid": 800.00,
  "totalPending": 30.00
}
```

---

### `GET /driver/settings`

**Response `200`:**
```jsonc
{
  "notifications": true,
  "language": "en"
}
```

---

### `PATCH /driver/settings`

**Request (all fields optional):**
```jsonc
{
  "notifications": false,
  "language": "ar"
}
```

**Response `200`:** Same shape as `GET /driver/settings`.

---

### `GET /driver/reviews`

**Query params:** `page`, `limit`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "rideId": 42,
      "rating": 5,
      "comment": "Excellent driver",
      "passengerId": 10,
      "createdAt": "..."
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "averageRating": 4.8
}
```

---

### `GET /driver/promotions`

Returns currently active promotions available to drivers (static data).

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": "promo_peak_hours",
      "title": "Peak Hours Bonus",
      "description": "Earn 20% extra during rush hours (7–9 am, 5–7 pm)",
      "bonusPercentage": 20,
      "validUntil": "2026-06-10T00:00:00.000Z",
      "isActive": true,
      "conditions": { "timeRanges": ["07:00-09:00", "17:00-19:00"] }
    },
    {
      "id": "promo_weekend",
      "title": "Weekend Warrior",
      "description": "Complete 10 rides this weekend for a bonus",
      "bonusAmount": 500,
      "targetRides": 10,
      "validUntil": "2026-06-05T00:00:00.000Z",
      "isActive": true,
      "conditions": { "daysOfWeek": ["saturday", "sunday"] }
    }
  ]
}
```

---

## 10. Driver Documents

Document types: `national_id_front`, `national_id_back`, `driving_license_front`, `driving_license_back`, `vehicle_license_front`, `vehicle_license_back`, `vehicle_photo`, `profile_photo`, `trip_selfie`, `criminal_record`

### `GET /driver-documents`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `verificationStatus` | string | `pending` \| `approved` \| `rejected` |
| `type` | string | Document type (see list above) |
| `page` | int | Page |
| `limit` | int | Per page (default 50, max 100) |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "driverId": 1,
      "type": "national_id_front",
      "fileUrl": "https://storage.supabase.co/...",
      "mimeType": "image/jpeg",
      "verificationStatus": "pending",
      "adminNotes": null,
      "uploadedAt": "...",
      "driver": { "name": "Ahmed Ali", "phone": "+966501234567" }
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 50
}
```

---

### `GET /driver-documents/by-driver/:driverId`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "driver": { "id": 1, "name": "Ahmed Ali", "phone": "+966501234567" },
  "documents": [
    {
      "id": 1,
      "type": "national_id_front",
      "fileUrl": "https://...",
      "verificationStatus": "approved",
      ...
    }
  ]
}
```

---

### `GET /driver-documents/stats`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "pending": 12,
  "approved": 87,
  "rejected": 5
}
```

---

### `POST /driver-documents/upload/:driverId`
**Auth:** Required (any authenticated user)  
**Content-Type:** `multipart/form-data`

**Form fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | Image file (JPEG, PNG, WebP; max 10 MB) |
| `type` | string | Yes | Document type (see list above) |

**Response `201`:**
```jsonc
{
  "id": 15,
  "driverId": 1,
  "type": "profile_photo",
  "fileUrl": "https://storage.supabase.co/...",
  "mimeType": "image/jpeg",
  "verificationStatus": "pending",
  "adminNotes": null,
  "uploadedAt": "2026-06-03T09:00:00.000Z"
}
```

---

### `PATCH /driver-documents/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "verificationStatus": "approved",   // "pending" | "approved" | "rejected"
  "adminNotes": "Looks good"
}
```

**Response `200`:** Updated document object.

---

## 11. Users — Admin Management

### `GET /users`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Search name/phone/email |
| `role` | string | `passenger` \| `driver` \| `admin` |
| `isBlocked` | bool | Filter blocked users |
| `page` | int | Page |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1234567890",
      "role": "passenger",
      "walletBalance": "150.00",
      "isBlocked": false,
      "createdAt": "..."
    }
  ],
  "total": 200,
  "page": 1,
  "limit": 20
}
```

---

### `GET /users/:id`
**Auth:** Required (role: admin)

**Response `200`:** Full user object (no password).

---

### `PATCH /users/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "name": "Jane Smith",
  "phone": "...",
  "isBlocked": true,
  "role": "admin"
}
```

**Response `200`:** Updated user object.

---

### `DELETE /users/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

## 12. User Locations

### `GET /user/locations`
**Auth:** Required

Returns saved locations for the authenticated user.

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "label": "home",
      "name": "My House",
      "address": "123 Main St",
      "latitude": 24.7136,
      "longitude": 46.6753,
      "isDefault": true,
      "createdAt": "..."
    }
  ],
  "total": 2
}
```

---

### `POST /user/locations`
**Auth:** Required

**Request:**
```jsonc
{
  "label": "home",         // "home" | "work" | "other"
  "name": "My House",
  "address": "123 Main St",
  "latitude": 24.7136,
  "longitude": 46.6753,
  "isDefault": true        // optional, default false
}
```

**Response `201`:** Location object.

---

### `PATCH /user/locations/:id`
**Auth:** Required

**Request (all fields optional):** Same fields as POST.

**Response `200`:** Updated location object.

---

### `DELETE /user/locations/:id`
**Auth:** Required

**Response `204`:** No content.

---

### `GET /admin/user-locations`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | int | Yes | User ID to query |

**Response `200`:**
```jsonc
{ "data": [...], "total": 3 }
```

---

### `GET /admin/driver-locations`
**Auth:** Required (role: admin)

Returns paginated location history for a driver.

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `driverId` | int | Yes | Driver ID |
| `page` | int | No | Page (default 1) |
| `limit` | int | No | Per page (max 200, default 50) |

**Response `200`:**
```jsonc
{ "data": [...], "total": 1000, "page": 1, "limit": 50 }
```

---

### `GET /admin/driver-locations/:driverId/latest`
**Auth:** Required (role: admin)

**Response `200`:** Single latest location record.  
**Response `404`:** `{ "error": "No location history found for this driver" }`

---

## 13. Ratings

### `POST /ratings`
**Auth:** Required (passenger)

**Request:**
```jsonc
{
  "rideId": 42,
  "driverId": 1,
  "rating": 5,             // 1–5 integer
  "comment": "Great!"      // optional
}
```

**Response `201`:**
```jsonc
{
  "ok": true,
  "rating": 5,
  "newDriverAverage": 4.82
}
```

---

### `GET /ratings/driver/:driverId`
**Auth:** Required

**Query params:** `page`, `limit`

**Response `200`:**
```jsonc
{
  "data": [
    { "rideId": 42, "rating": 5, "comment": "Great!", "createdAt": "..." }
  ],
  "total": 45,
  "average": 4.82,
  "page": 1,
  "limit": 20
}
```

---

## 14. Payments

### `POST /payments/intent`
**Auth:** Required

**Request:**
```jsonc
{
  "amount": 25.50,
  "currency": "SAR",
  "rideId": 42           // optional
}
```

**Response `201`:**
```jsonc
{
  "clientSecret": "pi_xxx_secret_yyy",
  "paymentIntentId": "pi_xxx"
}
```

---

### `POST /payments/confirm`
**Auth:** Required

**Request:**
```jsonc
{
  "paymentIntentId": "pi_xxx",
  "rideId": 42           // optional
}
```

**Response `200`:**
```jsonc
{ "ok": true, "status": "succeeded" }
```

---

### `GET /payments/history`
**Auth:** Required

**Query params:** `page`, `limit`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "amount": 25.50,
      "currency": "SAR",
      "status": "succeeded",
      "rideId": 42,
      "createdAt": "..."
    }
  ],
  "total": 20,
  "page": 1,
  "limit": 20
}
```

---

## 15. Wallet

### `GET /wallet/balance`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "balance": 150.00,
  "currency": "SAR"
}
```

---

### `POST /wallet/topup`
**Auth:** Required

**Request:**
```jsonc
{
  "amount": 100.00,
  "paymentMethod": "card"   // "card" | "bank_transfer"
}
```

**Response `200`:**
```jsonc
{
  "ok": true,
  "newBalance": 250.00,
  "transactionId": "txn_xxx"
}
```

---

### `GET /wallet/transactions`
**Auth:** Required

**Query params:** `page`, `limit`, `type`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "type": "debit",
      "amount": 30.00,
      "description": "Booking #55",
      "balanceBefore": 180.00,
      "balanceAfter": 150.00,
      "createdAt": "..."
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

---

### `POST /wallet/transfer` _(Admin)_
**Auth:** Required (role: admin)

Admin-initiated wallet credit/debit.

**Request:**
```jsonc
{
  "userId": 1,
  "amount": 50.00,
  "type": "credit",        // "credit" | "debit"
  "description": "Refund"
}
```

**Response `200`:**
```jsonc
{ "ok": true, "newBalance": 200.00 }
```

---

## 16. Notifications

### `GET /notifications`
**Auth:** Required

**Query params:** `page`, `limit`, `isRead`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "title": "Booking Confirmed",
      "body": "Your booking for trip #10 is confirmed.",
      "type": "booking_confirmed",
      "isRead": false,
      "createdAt": "..."
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

---

### `POST /notifications/:id/read`
**Auth:** Required

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "ok": true, "id": 1, "isRead": true }
```

---

### `POST /notifications/read-all`
**Auth:** Required

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "ok": true, "updatedCount": 5 }
```

---

## 17. Support Tickets

Ticket types: `complaint`, `inquiry`, `suggestion`, `technical`  
Ticket statuses: `open`, `pending`, `resolved`, `closed`  
Priorities: `low`, `medium`, `high`, `urgent`

### `POST /support/tickets`
**Auth:** Required

**Request:**
```jsonc
{
  "subject": "Overcharged for ride",
  "description": "I was charged twice for ride #42.",
  "type": "complaint",
  "priority": "high",        // optional, default "medium"
  "rideId": 42               // optional
}
```

**Response `201`:**
```jsonc
{
  "id": 7,
  "userId": 1,
  "subject": "Overcharged for ride",
  "description": "...",
  "type": "complaint",
  "status": "open",
  "priority": "high",
  "createdAt": "..."
}
```

---

### `GET /support/tickets`
**Auth:** Required  
**Note:** Passengers see own tickets; admins see all.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status |
| `type` | string | Filter by type |
| `priority` | string | Filter by priority |
| `search` | string | Search subject |
| `page` | int | Page |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [ { "id": 7, "subject": "...", "status": "open", ... } ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

---

### `GET /support/tickets/:id`
**Auth:** Required

**Response `200`:** Full ticket object with messages.

---

### `POST /support/tickets/:id/messages`
**Auth:** Required

**Request:**
```jsonc
{
  "message": "Please process my refund.",
  "attachmentUrl": "https://..."   // optional
}
```

**Response `201`:**
```jsonc
{
  "id": 20,
  "ticketId": 7,
  "userId": 1,
  "message": "Please process my refund.",
  "isStaff": false,
  "createdAt": "..."
}
```

---

### `GET /support/tickets/:id/messages`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "data": [ { "id": 20, "message": "...", "isStaff": false, ... } ],
  "total": 3
}
```

---

### `PATCH /support/tickets/:id` _(Admin)_
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "status": "resolved",
  "priority": "low",
  "assignedTo": 5   // admin user ID
}
```

**Response `200`:** Updated ticket object.

---

## 18. Chat

In-trip chat between driver and passenger.

### `GET /chat/ride/:rideId`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "rideId": 42,
      "senderId": 1,
      "senderRole": "passenger",
      "message": "I'm at the front door.",
      "createdAt": "..."
    }
  ],
  "total": 5
}
```

---

### `POST /chat/ride/:rideId`
**Auth:** Required

**Request:**
```jsonc
{ "message": "I'm at the front door." }
```

**Response `201`:**
```jsonc
{
  "id": 5,
  "rideId": 42,
  "senderId": 1,
  "senderRole": "passenger",
  "message": "I'm at the front door.",
  "createdAt": "..."
}
```

---

## 19. Zones

### `GET /zones`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "name": "Riyadh North",
      "description": "Northern district",
      "coordinates": [[24.7, 46.6], [24.8, 46.7], ...],
      "isActive": true,
      "createdAt": "..."
    }
  ],
  "total": 8
}
```

---

### `POST /zones`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "name": "Riyadh South",
  "description": "...",
  "coordinates": [[24.6, 46.5], ...],
  "isActive": true
}
```

**Response `201`:** Zone object.

---

### `GET /zones/:id`
**Auth:** Required

**Response `200`:** Single zone object.

---

### `PATCH /zones/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):** Same as POST.

**Response `200`:** Updated zone object.

---

### `DELETE /zones/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

## 20. Zone Pricing

### `GET /admin/zone-pricing`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `vehicleType` | string | `car` \| `bike` |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "zoneId": 1,
      "zoneName": "Riyadh North",
      "vehicleType": "car",
      "baseFare": 8.00,
      "perKmRate": 1.50,
      "minimumFare": 10.00,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

### `POST /admin/zone-pricing`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "zoneId": 1,
  "vehicleType": "car",       // "car" | "bike"
  "baseFare": 8.00,
  "perKmRate": 1.50,
  "minimumFare": 10.00,
  "isActive": true             // optional, default true
}
```

**Response `201`:** Zone pricing object.  
**Error `409`:** Duplicate zone + vehicleType combination.

---

### `PATCH /admin/zone-pricing/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "baseFare": 9.00,
  "perKmRate": 1.75,
  "minimumFare": 12.00,
  "isActive": false
}
```

**Response `200`:** Updated zone pricing object.

---

### `DELETE /admin/zone-pricing/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

## 21. Promo Codes

### `GET /promo/codes`
**Auth:** Required (role: admin)

**Query params:** `page`, `limit`, `isActive`, `search`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "code": "SAVE10",
      "discountType": "percentage",   // "percentage" | "fixed"
      "discountValue": 10.00,
      "minOrderAmount": 20.00,
      "maxUses": 100,
      "usedCount": 34,
      "isActive": true,
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "createdAt": "..."
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### `POST /promo/codes`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "code": "SUMMER20",
  "discountType": "percentage",
  "discountValue": 20.00,
  "minOrderAmount": 15.00,     // optional
  "maxUses": 500,              // optional
  "expiresAt": "2026-09-01T00:00:00.000Z"  // optional
}
```

**Response `201`:** Promo code object.

---

### `GET /promo/codes/:id`
**Auth:** Required (role: admin)

**Response `200`:** Single promo code object.

---

### `PATCH /promo/codes/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):** Same as POST.

**Response `200`:** Updated promo code object.

---

### `DELETE /promo/codes/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

### `POST /promo/validate`
**Auth:** Required

**Request:**
```jsonc
{
  "code": "SAVE10",
  "orderAmount": 30.00
}
```

**Response `200`:**
```jsonc
{
  "valid": true,
  "discountAmount": 3.00,
  "finalAmount": 27.00,
  "promo": { "code": "SAVE10", "discountType": "percentage", "discountValue": 10 }
}
```

**Response `400`:**
```jsonc
{ "valid": false, "error": "Code expired" }
```

---

## 22. Shuttle

Shuttle-specific endpoints for lines (routes), stops (stations), and boarding management.

### `GET /shuttle/lines`
**Auth:** None (public)

Returns all **active** shuttle routes enriched with station counts and trip statistics.

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "name": "City Center → Airport",
      "fromLocation": "City Center",
      "toLocation": "Airport",
      "estimatedDuration": 45,
      "basePrice": 15.00,
      "isActive": true,
      "stationCount": 8,
      "totalTrips": 3,
      "scheduledTrips": 2,
      "activeTrips": 1,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 4
}
```

---

### `GET /shuttle/lines/:id`
**Auth:** None (public)

Returns a single shuttle line with its stations and up to 10 upcoming/active trips.

**Response `200`:**
```jsonc
{
  "data": {
    "id": 1,
    "name": "City Center → Airport",
    "basePrice": 15.00,
    "stationCount": 8,
    "stations": [ { "id": 1, "name": "Main Station", "order": 1, ... } ],
    "activeTrips": [
      {
        "id": 10,
        "status": "boarding",
        "departureTime": "...",
        "arrivalTime": "...",
        "availableSeats": 12,
        "totalSeats": 20
      }
    ]
  }
}
```

---

### `GET /shuttle/assignments`
**Auth:** None (public)

Returns all active drivers with a bus assigned, including their bus details and current/nearest trip.

**Response `200`:**
```jsonc
{
  "data": [
    {
      "driverId": 1,
      "driverName": "Ahmed Ali",
      "driverPhone": "+966501234567",
      "driverStatus": "active",
      "isOnline": true,
      "rating": 4.8,
      "userId": 2,
      "bus": {
        "id": 3,
        "plateNumber": "BUS-001",
        "model": "Hyundai County",
        "capacity": 25,
        "isActive": true
      },
      "currentTrip": {
        "id": 10,
        "routeId": 1,
        "routeName": "City Center → Airport",
        "fromLocation": "City Center",
        "toLocation": "Airport",
        "status": "boarding",
        "departureTime": "...",
        "arrivalTime": "...",
        "availableSeats": 12,
        "totalSeats": 25
      }
    }
  ],
  "total": 5
}
```

---

### `POST /shuttle/lines/:id/activate`
**Auth:** Required (role: admin)

Activates a shuttle line and advances its next scheduled trip to `"boarding"` status.

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{
  "data": { "id": 1, "isActive": true, "basePrice": 15.00, ... },
  "boardingTrip": { "id": 10, "status": "boarding", ... }
}
```

---

### `POST /shuttle/lines/:id/complete`
**Auth:** Required (role: admin)

Completes all active/boarding trips for a line and marks confirmed/boarded bookings as completed.

**Request:** _(empty body)_

**Response `200`:**
```jsonc
{ "ok": true, "completedTrips": 2 }
```

---

### `POST /shuttle/lines/:id/book`
**Auth:** Required (role: driver — must have an assigned bus)

Allows a driver to book a weekly recurring slot on a shuttle line.

**Request:**
```jsonc
{
  "weekStart": "2026-06-08",
  "weekEnd": "2026-06-12",
  "departureTime": "07:00"    // must be one of: "07:00","08:00","09:00","10:00","13:00","14:00","15:00","16:00"
}
```

**Response `201`:**
```jsonc
{
  "ok": true,
  "booking": {
    "id": 10,
    "routeId": 1,
    "routeName": "City Center → Airport",
    "fromLocation": "City Center",
    "toLocation": "Airport",
    "departureTime": "2026-06-08T07:00:00.000Z",
    "arrivalTime": "2026-06-08T07:45:00.000Z",
    "weekStart": "2026-06-08",
    "weekEnd": "2026-06-12",
    "departureSlot": "07:00",
    "status": "scheduled",
    "availableSeats": 25,
    "totalSeats": 25,
    "bus": { "id": 3, "plateNumber": "BUS-001", "model": "Hyundai County", "capacity": 25 }
  }
}
```

**Error `409`:** Slot already taken by this driver or another driver.  
**Error `422`:** No bus assigned to driver.

---

### `GET /shuttle/lines/:id/passengers`
**Auth:** Required

Resolves the most recent active/boarding trip for the given route and returns its passenger list.

**Response `200`:** Same shape as `GET /shuttle/trips/:id/passengers`.

---

### `GET /shuttle/trips/:id/passengers`
**Auth:** Required

**Response `200`:**
```jsonc
{
  "tripId": 10,
  "tripStatus": "active",
  "data": [
    {
      "bookingId": 55,
      "userId": 1,
      "seatCount": 2,
      "totalPrice": 30.00,
      "status": "boarded",
      "paymentStatus": "paid",
      "boarded": true,
      "userName": "Jane Doe",
      "userPhone": "+1234567890",
      "userEmail": "jane@example.com",
      "createdAt": "..."
    }
  ],
  "total": 18
}
```

---

### `POST /shuttle/stops/:id/board`
**Auth:** Required

Marks a station as "arrived" and logs the boarding event for a trip.

**Request:**
```jsonc
{ "tripId": 10 }
```

**Response `200`:**
```jsonc
{
  "ok": true,
  "stationId": 3,
  "tripId": 10,
  "progress": {
    "tripId": 10,
    "stationId": 3,
    "status": "arrived",
    "arrivedAt": "2026-06-03T07:20:00.000Z"
  }
}
```

---

### `POST /shuttle/trips/:id/board-stop`
**Auth:** Required

Marks a trip as having reached a given station and logs the event.

**Request:**
```jsonc
{ "stationId": 4 }
```

**Response `200`:**
```jsonc
{
  "ok": true,
  "tripId": 10,
  "stationId": 4,
  "stationName": "Stop 4",
  "progress": { "tripId": 10, "stationId": 4, "status": "arrived", "arrivedAt": "..." },
  "boardedPassengers": 15
}
```

---

## 23. Buses

### `GET /buses`
**Auth:** Required (role: admin)

**Query params:** `page`, `limit`

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "plateNumber": "BUS-001",
      "model": "Hyundai County",
      "capacity": 25,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

---

### `POST /buses`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "plateNumber": "BUS-002",
  "model": "Toyota Coaster",
  "capacity": 30,
  "isActive": true     // optional
}
```

**Response `201`:** Bus object.

---

### `GET /buses/:id`
**Auth:** Required (role: admin)

**Response `200`:** Single bus object.  
**Response `404`:** `{ "error": "Bus not found" }`

---

### `PATCH /buses/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):** Same as POST.

**Response `200`:** Updated bus object.

---

### `DELETE /buses/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

## 24. Vehicles

Vehicle types: `car`, `motorcycle`, `van`, `minibus`  
Vehicle statuses: `pending`, `verified`, `rejected`, `suspended`

### `GET /vehicles`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Search plate/make/model |
| `status` | string | Vehicle status filter |
| `vehicleType` | string | Type filter |
| `page` | int | Page |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "driverId": 1,
      "plateNumber": "ABC-1234",
      "make": "Toyota",
      "model": "Camry",
      "year": 2020,
      "color": "White",
      "vehicleType": "car",
      "status": "verified",
      "isActive": true,
      "driverName": "Ahmed Ali",
      "driverPhone": "+966501234567",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 20
}
```

---

### `POST /vehicles`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "driverId": 1,
  "plateNumber": "XYZ-9999",
  "make": "Honda",
  "model": "Civic",
  "year": 2022,
  "color": "Blue",
  "vehicleType": "car",
  "status": "pending",   // optional
  "isActive": true       // optional
}
```

**Response `201`:** Vehicle object.

---

### `GET /vehicles/:id`
**Auth:** Required (role: admin)

**Response `200`:** Vehicle object with `driverName` and `driverPhone`.

---

### `PATCH /vehicles/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "plateNumber": "...",
  "make": "...",
  "model": "...",
  "year": 2023,
  "color": "Red",
  "vehicleType": "motorcycle",
  "status": "verified",
  "isActive": true
}
```

**Response `200`:** Updated vehicle object.

---

### `DELETE /vehicles/:id`
**Auth:** Required (role: admin)

**Response `204`:** No content.

---

## 25. Earnings

Earning statuses: `pending`, `confirmed`, `paid`

### `GET /earnings/summary`
**Auth:** Required (admin or driver)

**Admin response `200`:**
```jsonc
{
  "summary": {
    "totalEarnings": 15000.00,
    "totalPaid": 12000.00,
    "totalPending": 1500.00,
    "totalConfirmed": 1500.00,
    "totalRecords": 850
  },
  "byStatus": [
    { "status": "paid", "count": 700, "total": 12000.00 }
  ],
  "topDrivers": [
    { "driverId": 1, "driverName": "Ahmed Ali", "tripCount": 152, "totalEarned": 2280.00, "totalPaid": 2000.00 }
  ]
}
```

**Driver response `200`:**
```jsonc
{
  "driverId": 1,
  "summary": {
    "totalEarnings": 2280.00,
    "totalPaid": 2000.00,
    "totalPending": 150.00,
    "totalConfirmed": 130.00,
    "totalRecords": 152
  },
  "byStatus": [ { "status": "paid", "count": 133, "total": 2000.00 } ],
  "recentEarnings": [
    { "id": 100, "amount": 15.00, "status": "confirmed", "date": "2026-06-03", "tripId": 10, "createdAt": "..." }
  ]
}
```

---

### `GET /earnings/weekly`
**Auth:** Required (admin or driver)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `weeks` | int | Past weeks to include (1–52, default 8) |
| `driverId` | int | Admin only — filter to specific driver |

**Response `200`:**
```jsonc
{
  "weeks": 8,
  "driverId": null,
  "weeklyBreakdown": [
    {
      "week_start": "2026-04-06",
      "trip_count": 48,
      "total_earned": 720.00,
      "paid": 600.00,
      "pending": 60.00,
      "confirmed": 60.00
    }
  ],
  "driverBreakdown": [            // admin only when no driverId filter
    { "driverId": 1, "driverName": "Ahmed Ali", "totalEarned": 720.00, "tripCount": 48 }
  ]
}
```

---

### `GET /earnings`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `driverId` | int | Filter by driver |
| `status` | string | `pending` \| `confirmed` \| `paid` |
| `page` | int | Page |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 100,
      "driverId": 1,
      "tripId": 10,
      "amount": 15.00,
      "status": "confirmed",
      "date": "2026-06-03",
      "createdAt": "...",
      "driverName": "Ahmed Ali",
      "driverPhone": "+966501234567"
    }
  ],
  "total": 850,
  "page": 1,
  "limit": 20
}
```

---

### `PATCH /earnings/:id/status`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{ "status": "paid" }    // "confirmed" | "paid"
```

**Response `200`:** Updated earning record.

---

## 26. Dashboard

All dashboard endpoints require `role: admin`.

### `GET /dashboard/summary`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "routes": { "total": 10, "active": 8, "inactive": 2 },
  "stations": { "total": 65 },
  "trips": {
    "total": 1200,
    "active": 3,
    "scheduled": 15,
    "boarding": 2,
    "upcoming": 18,
    "cancelled": 45
  },
  "fleet": {
    "totalBuses": 12,
    "activeBuses": 10,
    "totalDrivers": 35,
    "onlineDrivers": 8
  },
  "support": {
    "openTickets": 7,
    "pendingTickets": 3,
    "totalMessages": 142
  },
  "verifications": { "pending": 5 },
  "suggestions": { "pending": 3 },
  "users": { "total": 500, "passengers": 465, "drivers": 35 },
  "generatedAt": "2026-06-03T12:00:00.000Z"
}
```

---

### `GET /dashboard/activity`
**Auth:** Required (role: admin)

Returns recent activity feed (up to 8 items per category).

**Response `200`:**
```jsonc
{
  "recentTickets": [ { "id": 7, "subject": "...", "status": "open", "priority": "high", "type": "complaint", "createdAt": "..." } ],
  "pendingDocuments": [ { "id": 1, "driverId": 1, "type": "national_id_front", "verificationStatus": "pending", "driverName": "Ahmed Ali", "uploadedAt": "..." } ],
  "recentSuggestions": [ { "id": 1, "title": "...", "type": "new_route", "status": "pending", "startLocation": "...", "endLocation": "...", "createdAt": "..." } ],
  "upcomingDepartures": [ { "id": 10, "departureTime": "...", "routeName": "...", "driverName": "...", "availableSeats": 12, "totalSeats": 20, ... } ],
  "activeTrips": [ { ... } ],
  "recentBookings": [ { "id": 55, "status": "confirmed", "totalPrice": 30.00, "seatCount": 2, "userName": "Jane Doe", "userEmail": "...", "createdAt": "..." } ]
}
```

---

### `GET /dashboard/analytics`
**Auth:** Required (role: admin)

Returns analytics data for the past 30 days.

**Response `200`:**
```jsonc
{
  "tripsPerDay": [ { "date": "2026-06-01", "trips": 12, "completed": 10, "cancelled": 2 } ],
  "routePopularity": [ { "id": 1, "name": "...", "fromLocation": "...", "toLocation": "...", "tripCount": 45, "activeCount": 2 } ],
  "tripStatusBreakdown": [ { "status": "completed", "count": 800 } ],
  "driverActivity": [ { "id": 1, "name": "Ahmed Ali", "tripCount": 152, "rating": 4.8, "isOnline": true, "status": "active" } ],
  "busiestStations": [ { "name": "Main Station", "routeName": "...", "tripCount": 45 } ],
  "bookingsPerDay": [ { "date": "2026-06-01", "bookings": 25, "revenue": 375.00 } ]
}
```

---

### `GET /dashboard/today`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "tripsToday": 8,
  "tripsYesterday": 6,
  "revenueToday": 1200.00,
  "revenueYesterday": 900.00,
  "driversOnline": 5,
  "passengersActive": 18,
  "last7DaysTrips": [ { "date": "2026-05-28", "trips": 6 } ],
  "last7DaysRevenue": [ { "date": "2026-05-28", "revenue": 900.00 } ],
  "activeTrips": [
    {
      "id": 10,
      "status": "active",
      "departureTime": "...",
      "arrivalTime": "...",
      "routeName": "...",
      "fromLocation": "...",
      "toLocation": "...",
      "driverName": "Ahmed Ali",
      "latitude": "24.7100",
      "longitude": "46.6800",
      "driverStatus": "active"
    }
  ],
  "generatedAt": "2026-06-03T12:00:00.000Z"
}
```

---

## 27. Service Controls

Service types: `shuttle`, `car`, `motorcycle`, `delivery`  
Display modes: `live`, `coming_soon`, `unavailable`, `maintenance`  
Unavailable actions: `none`, `show_message`, `hide_service`

### `GET /services/control`
**Auth:** Required (any role)

Returns controls for all four service types.

**Response `200`:**
```jsonc
{
  "data": [
    {
      "serviceType": "car",
      "isEnabled": true,
      "displayMode": "live",
      "unavailableMessage": null,
      "unavailableAction": "none",
      "activeZoneIds": [1, 2, 3],
      "maintenanceEta": null
    }
  ]
}
```

---

### `GET /services/:type/control`
**Auth:** Required (any role)

Returns control for a single service type. Returns public fields only (no logs).

**Response `200`:** Single service control object (same fields as above).

---

### `GET /admin/services/:type/control`
**Auth:** Required (role: admin)

Returns full control record including the last 10 change logs.

**Response `200`:**
```jsonc
{
  "id": 1,
  "serviceType": "car",
  "isEnabled": true,
  "displayMode": "live",
  "unavailableMessage": null,
  "unavailableAction": "none",
  "activeZoneIds": [1, 2, 3],
  "maintenanceEta": null,
  "maxActiveRides": null,
  "updatedBy": 5,
  "updatedAt": "...",
  "logs": [
    {
      "id": 1,
      "serviceType": "car",
      "changedBy": 5,
      "changedAt": "...",
      "changes": { "isEnabled": { "before": false, "after": true } }
    }
  ]
}
```

---

### `PATCH /admin/services/:type/control`
**Auth:** Required (role: admin)

Updates a service control setting. Emits `service:control:changed` socket event to all clients and the admin room.

**Request (all fields optional):**
```jsonc
{
  "isEnabled": false,
  "displayMode": "maintenance",
  "unavailableMessage": "Service is down for maintenance",
  "unavailableAction": "show_message",
  "activeZoneIds": [1, 2],
  "maintenanceEta": "2026-06-03T18:00:00.000Z",
  "maxActiveRides": 50
}
```

**Response `200`:** Updated service control + last 10 logs.

---

### `POST /admin/services/:type/control/reset`
**Auth:** Required (role: admin)

Resets a service control to defaults (`isEnabled: true`, `displayMode: "live"`, all nulls). Emits socket event.

**Request:** _(empty body)_

**Response `200`:** Reset service control + last 10 logs.

---

## 28. Staff & Roles

### `GET /admin/permissions/all`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "permissions": [
    "view_dashboard", "view_routes", "edit_routes",
    "view_trips", "edit_trips", "view_drivers", "edit_drivers",
    "view_buses", "edit_buses", "view_passengers", "edit_passengers",
    "view_bookings", "edit_bookings", "view_wallet", "edit_wallet",
    "view_support", "edit_support", "view_suggestions",
    "view_verification", "edit_verification", "view_analytics",
    "view_staff", "edit_staff", "view_settings", "edit_settings",
    "view_promo", "edit_promo", "view_live_tracking",
    "view_driver_analytics", "view_notifications"
  ]
}
```

---

### `GET /admin/roles`
**Auth:** Required (role: admin)

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "name": "Support Agent",
      "description": "Handles support tickets",
      "permissions": ["view_support", "edit_support"],
      "createdAt": "..."
    }
  ],
  "total": 3
}
```

---

### `POST /admin/roles`
**Auth:** Required (role: admin)

**Request:**
```jsonc
{
  "name": "Support Agent",
  "description": "Handles support tickets",   // optional
  "permissions": ["view_support", "edit_support"]
}
```

**Response `201`:** Role object.

---

### `PATCH /admin/roles/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "name": "Senior Support Agent",
  "description": "...",
  "permissions": ["view_support", "edit_support", "view_bookings"]
}
```

**Response `200`:** Updated role object.

---

### `DELETE /admin/roles/:id`
**Auth:** Required (role: admin)

Removes the role and clears `staffRoleId` from all users holding that role.

**Response `200`:**
```jsonc
{ "success": true }
```

---

### `GET /admin/staff`
**Auth:** Required (role: admin)

**Query params:** `search` (name ILIKE)

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 5,
      "name": "Admin User",
      "email": "admin@example.com",
      "phone": "...",
      "role": "admin",
      "staffRoleId": 1,
      "staffRole": { "id": 1, "name": "Support Agent", "permissions": [...] },
      "isBlocked": false,
      "createdAt": "..."
    }
  ],
  "total": 4
}
```

---

### `POST /admin/staff`
**Auth:** Required (role: admin)

Creates a new admin/staff user.

**Request:**
```jsonc
{
  "name": "New Staff",
  "email": "staff@example.com",
  "phone": "+1234567890",
  "password": "securepass123",
  "staffRoleId": 1    // optional
}
```

**Response `201`:** Staff user object (no `password` or `refreshToken`).

---

### `PATCH /admin/staff/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "staffRoleId": 2,
  "isBlocked": true,
  "password": "newpass123"
}
```

**Response `200`:** Updated staff user object.

---

## 29. Suggestions

Route suggestion types: `new_route`, `new_station`, `route_edit`  
Statuses: `pending`, `approved`, `rejected`

### `GET /suggestions`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status |
| `type` | string | Filter by type |
| `search` | string | Search title (ILIKE) |
| `page` | int | Page |
| `limit` | int | Per page |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "type": "new_route",
      "title": "New route to university",
      "description": "...",
      "startLocation": "Downtown",
      "endLocation": "University",
      "status": "pending",
      "user": { "name": "Jane Doe", "email": "jane@example.com" },
      "driver": null,
      "createdAt": "..."
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

---

### `POST /suggestions`
**Auth:** None (public — no authentication required)

**Request:**
```jsonc
{
  "type": "new_route",
  "title": "New route to university",
  "description": "Students need a direct route.",
  "startLocation": "Downtown",    // optional
  "endLocation": "University",    // optional
  "userId": 1,                    // optional
  "driverId": 1                   // optional
}
```

**Response `201`:** Suggestion object.

---

### `GET /suggestions/:id`
**Auth:** Required (role: admin)

**Response `200`:** Full suggestion object with user and driver details.

---

### `PATCH /suggestions/:id`
**Auth:** Required (role: admin)

**Request (all fields optional):**
```jsonc
{
  "status": "approved",
  "adminNotes": "Will be added next quarter"
}
```

**Response `200`:** Updated suggestion object.

---

## 30. Audit Logs

Logs of admin CREATE/UPDATE/DELETE operations on entities.

### `GET /admin/audit-logs`
**Auth:** Required (role: admin)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `action` | string | `CREATE` \| `UPDATE` \| `DELETE` |
| `entityType` | string | e.g. `vehicle`, `bus`, `driver` |
| `userId` | int | Filter by admin user who made the change |
| `from` | ISO datetime | Earliest timestamp |
| `to` | ISO datetime | Latest timestamp |
| `page` | int | Page |
| `limit` | int | Per page (max 100, default 25) |

**Response `200`:**
```jsonc
{
  "data": [
    {
      "id": 1,
      "userId": 5,
      "action": "UPDATE",
      "entityType": "vehicle",
      "entityId": 3,
      "oldData": { "status": "pending" },
      "newData": { "status": "verified" },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "...",
      "adminName": "Admin User",
      "adminEmail": "admin@example.com"
    }
  ],
  "total": 200,
  "page": 1,
  "limit": 25
}
```

---

### `GET /admin/audit-logs/:id`
**Auth:** Required (role: admin)

**Response `200`:** Single audit log entry (same shape as above).

---

### `GET /admin/audit-logs/distinct/actions`
**Auth:** Required (role: admin)

**Response `200`:** Array of distinct action strings used in logs:
```jsonc
["CREATE", "DELETE", "UPDATE"]
```

---

### `GET /admin/audit-logs/distinct/entity-types`
**Auth:** Required (role: admin)

**Response `200`:** Array of distinct entity type strings:
```jsonc
["bus", "driver", "route", "vehicle"]
```

---

## 31. Admin Analytics

Located in `admin.ts`. All require `role: admin`.

### `GET /admin/analytics/drivers`

**Query params:** `page`, `limit`, `search`, `status`

**Response `200`:** Paginated driver analytics including ride counts and ratings.

---

### `GET /admin/analytics/passengers`

**Query params:** `page`, `limit`, `search`, `status`

**Response `200`:** Paginated passenger analytics including booking history.

---

### `GET /admin/analytics/complaints`

**Response `200`:**
```jsonc
{
  "typeBreakdown": [ { "type": "complaint", "status": "open", "count": 5 } ],
  "avgResolutionHours": 24.5,
  "priorityBreakdown": [ { "priority": "high", "count": 8 } ],
  "trend": [
    { "date": "2026-06-01", "opened": 3, "resolved": 2 }
  ]
}
```

---

## 32. WebSocket Events

### Connection

```
URL: wss://0f7ebc97-871a-44da-9afe-1004df3f3f52-00-etsuj4iud2kt.worf.replit.dev
Path: /api/socket.io
Auth: { auth: { token: "<accessToken>" } }
```

### Rooms

| Room | Description |
|------|-------------|
| `passenger:{userId}` | Private room for a passenger |
| `driver:{userId}` | Private room for a driver |
| `drivers:available:{vehicleType}` | Pool of available drivers by vehicle type |
| `trip:{tripId}` | All participants of a shuttle trip |
| `admin` | Admin dashboard room |

### Server → Client Events

#### On-demand Ride Events

| Event | Room | Payload |
|-------|------|---------|
| `ride:driver_assigned` | `passenger:{userId}` | `{ rideId, driverId, driverName, driverPhone, vehiclePlate, vehicleModel, vehicleColor, estimatedArrival }` |
| `ride:driver_arrived` | `passenger:{userId}` | `{ rideId, driverId, message }` |
| `ride:arrived` | `passenger:{userId}` | _Alias for `ride:driver_arrived`_ |
| `ride:started` | `passenger:{userId}` | `{ rideId, startedAt }` |
| `ride:completed` | `passenger:{userId}` | `{ rideId, actualPrice, completedAt }` |
| `ride:cancelled` | `passenger:{userId}` | `{ rideId, cancelledBy, reason }` |
| `ride:driver_location` | `passenger:{userId}` | `{ rideId, driverId, latitude, longitude, heading, speed }` |
| `ride:new_request` | `drivers:available:{vehicleType}` | `{ rideId, pickupAddress, dropoffAddress, pickupLatitude, pickupLongitude, estimatedPrice, passengerName }` |
| `ride:offer` | `driver:{userId}` | `{ rideId, ... }` |

#### Shuttle / Trip Events

| Event | Room | Payload |
|-------|------|---------|
| `booking:boarded` | `trip:{tripId}` | `{ tripId, bookingId, userId, stationId }` |
| `trip:chat:message` | `trip:{tripId}` | `{ tripId, senderId, senderRole, message, createdAt }` |

#### Notification Events

| Event | Room | Payload |
|-------|------|---------|
| `notification:new` | `passenger:{userId}` or `driver:{userId}` | `{ id, title, body, type, createdAt }` |

#### Service Control Events

| Event | Room | Payload |
|-------|------|---------|
| `service:control:changed` | broadcast (all + admin room) | `{ serviceType, isEnabled, displayMode, unavailableMessage, unavailableAction, activeZoneIds, maintenanceEta, changedBy, changedAt }` |

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `driver:location` | `{ latitude, longitude, heading?, speed?, accuracy? }` | Driver sends GPS update; server broadcasts to relevant ride |
| `driver:online` | `{ latitude, longitude, vehicleType }` | Driver goes online |
| `driver:offline` | `{}` | Driver goes offline |
| `trip:chat` | `{ tripId, message }` | Send message in trip chat room |
| `join:trip` | `{ tripId }` | Join a trip room |
| `leave:trip` | `{ tripId }` | Leave a trip room |

---

## Appendix: Status Reference

### Ride Statuses
`searching` → `driver_assigned` → `driver_arrived` → `active` → `completed` | `cancelled`

### Trip Statuses
`scheduled` → `driver_assigned` | `boarding` → `active` → `completed` | `cancelled`

### Booking Statuses
`confirmed` → `boarded` → `completed` | `cancelled` | `absent`

### Driver Statuses
`pending` | `active` | `suspended` | `rejected`

### Vehicle Statuses
`pending` | `verified` | `rejected` | `suspended`

### Document Verification Statuses
`pending` | `approved` | `rejected`

### Earning Statuses
`pending` | `confirmed` | `paid`

### Support Ticket Statuses
`open` | `pending` | `resolved` | `closed`

### Suggestion Statuses
`pending` | `approved` | `rejected`

### Service Display Modes
`live` | `coming_soon` | `unavailable` | `maintenance`
