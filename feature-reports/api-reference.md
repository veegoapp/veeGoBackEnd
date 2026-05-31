# API Reference

**Base URL:** `/api`  
**Generated:** 2026-05-31  
**Server:** Express/Node.js (port 8080)  
**Authentication:** Bearer JWT token via `Authorization: Bearer <token>` header

---

## Auth Levels

| Level | Description |
|-------|-------------|
| **Public** | No authentication required |
| **User** | Valid JWT required (any role) |
| **Admin** | Valid JWT required + `role: "admin"` |
| **Driver** | Valid JWT required + `role: "driver"` |

---

## Table of Contents

1. [Health](#1-health)
2. [Authentication](#2-authentication)
3. [Users — Self-service](#3-users--self-service)
4. [Driver — Self-service](#4-driver--self-service)
5. [Admin — Dashboard](#5-admin--dashboard)
6. [Admin — Users](#6-admin--users)
7. [Admin — Drivers](#7-admin--drivers)
8. [Admin — Driver Documents](#8-admin--driver-documents)
9. [Admin — Buses](#9-admin--buses)
10. [Admin — Vehicles](#10-admin--vehicles)
11. [Admin — Earnings](#11-admin--earnings)
12. [Admin — Routes & Stations](#12-admin--routes--stations)
13. [Admin — Trips](#13-admin--trips)
14. [Admin — Bookings](#14-admin--bookings)
15. [Admin — Rides](#15-admin--rides)
16. [Admin — Wallet](#16-admin--wallet)
17. [Admin — Payments](#17-admin--payments)
18. [Admin — Promo Codes](#18-admin--promo-codes)
19. [Admin — Notifications](#19-admin--notifications)
20. [Admin — Support Tickets](#20-admin--support-tickets)
21. [Admin — Ratings](#21-admin--ratings)
22. [Admin — Service Controls](#22-admin--service-controls)
23. [Admin — Zone Pricing](#23-admin--zone-pricing)
24. [Admin — Audit Logs](#24-admin--audit-logs)
25. [Admin — Staff & Roles](#25-admin--staff--roles)
26. [Admin — Queue](#26-admin--queue)
27. [Admin — Suggestions](#27-admin--suggestions)
28. [Shuttle — Public](#28-shuttle--public)
29. [Locations](#29-locations)
30. [Chat](#30-chat)
31. [Notifications — User](#31-notifications--user)
32. [Deprecated Endpoints](#32-deprecated-endpoints)

---

## 1. Health

### `GET /health`
**Auth:** Public  
**Description:** Basic liveness check.  
**Response:**
```json
{ "status": "ok", "timestamp": "2026-05-31T12:00:00.000Z" }
```

---

### `GET /healthz`
**Auth:** Public  
**Description:** Minimal liveness probe (for load balancers).  
**Response:**
```json
{ "status": "ok" }
```

---

### `GET /health/db`
**Auth:** Public  
**Description:** Database connectivity check with latency measurement.  
**Response (200):**
```json
{
  "status": "ok",
  "database": "connected",
  "latencyMs": 12,
  "provider": "neon",
  "timestamp": "2026-05-31T12:00:00.000Z"
}
```
**Response (503):**
```json
{ "status": "error", "database": "disconnected", "error": "...", "timestamp": "..." }
```

---

## 2. Authentication

### `POST /auth/register`
**Auth:** Public  
**Description:** Register a new user account.  
**Body:**
```json
{
  "name": "string (min 1)",
  "email": "string (valid email)",
  "phone": "string (min 1)",
  "password": "string (min 8)",
  "role": "user | driver | admin (default: user)"
}
```
**Response (201):**
```json
{
  "user": { "id": 1, "name": "...", "email": "...", "phone": "...", "role": "user" },
  "accessToken": "JWT",
  "refreshToken": "JWT"
}
```

---

### `POST /auth/login`
**Auth:** Public  
**Description:** Authenticate with email and password.  
**Body:**
```json
{ "email": "string", "password": "string" }
```
**Response (200):**
```json
{
  "user": { "id": 1, "name": "...", "email": "...", "role": "..." },
  "accessToken": "JWT",
  "refreshToken": "JWT"
}
```
**Errors:** `401` invalid credentials, `403` account blocked.

---

### `POST /auth/refresh`
**Auth:** Public  
**Description:** Exchange a refresh token for a new access token.  
**Body:**
```json
{ "refreshToken": "string" }
```
**Response (200):**
```json
{ "accessToken": "JWT" }
```

---

### `POST /auth/logout`
**Auth:** User  
**Description:** Invalidate the current refresh token.  
**Body:**
```json
{ "refreshToken": "string" }
```
**Response (200):**
```json
{ "ok": true }
```

---

## 3. Users — Self-service

### `GET /users/me`
**Auth:** User  
**Description:** Get the authenticated user's own profile.  
**Response:**
```json
{
  "id": 1, "name": "...", "email": "...", "phone": "...",
  "role": "user", "walletBalance": "50.00", "createdAt": "..."
}
```

---

### `PATCH /users/me`
**Auth:** User  
**Description:** Update own profile fields.  
**Body (all optional):**
```json
{ "name": "string", "email": "string", "phone": "string" }
```
**Response:** Updated user object (without password).

---

### `POST /users/me/change-password`
**Auth:** User  
**Description:** Change own password.  
**Body:**
```json
{ "currentPassword": "string", "newPassword": "string (min 8)" }
```
**Response (200):**
```json
{ "ok": true }
```
**Errors:** `400` wrong current password.

---

### `GET /user/locations`
**Auth:** User  
**Description:** List the authenticated user's saved locations.  
**Response:**
```json
{ "data": [ { "id": 1, "label": "home", "name": "...", "address": "...", "latitude": 0.0, "longitude": 0.0, "isDefault": true } ], "total": 1 }
```

---

### `POST /user/locations`
**Auth:** User  
**Description:** Save a new location.  
**Body:**
```json
{
  "label": "home | work | other (default: other)",
  "name": "string",
  "address": "string",
  "latitude": 0.0,
  "longitude": 0.0,
  "isDefault": false
}
```
**Response (201):** Created location object.

---

### `PATCH /user/locations/:id`
**Auth:** User  
**Description:** Update a saved location (only owner can update).  
**Body:** Partial fields from `POST /user/locations`.  
**Response:** Updated location object.  
**Errors:** `404` not found or not owned by user.

---

### `DELETE /user/locations/:id`
**Auth:** User  
**Description:** Delete a saved location (only owner can delete).  
**Response:** `204 No Content`  
**Errors:** `404` not found or not owned by user.

---

### `GET /user/ratings/given`
**Auth:** User  
**Description:** List all ratings this user has submitted.  
**Response:**
```json
{
  "data": [
    { "id": 1, "driverId": 2, "tripId": 3, "context": "trip", "score": "4.5", "comment": "...", "driverName": "..." }
  ],
  "total": 1
}
```

---

## 4. Driver — Self-service

### `GET /driver/me`
**Auth:** Driver  
**Description:** Get own driver profile.  
**Response:** Full driver profile object including `rating`, `isOnline`, `status`, `assignedBusId`, etc.

---

### `PATCH /driver/me`
**Auth:** Driver  
**Description:** Update own driver profile (name, phone, etc.).  
**Body (all optional):**
```json
{ "name": "string", "phone": "string", "profileImage": "string (url)" }
```
**Response:** Updated driver object.

---

### `PATCH /driver/location`
**Auth:** Driver  
**Description:** Update own real-time GPS location. Broadcasts to socket room.  
**Body:**
```json
{ "latitude": 30.0, "longitude": 31.0, "accuracy": 10.0 }
```
**Response:**
```json
{ "ok": true, "latitude": 30.0, "longitude": 31.0 }
```

---

### `PATCH /driver/status`
**Auth:** Driver  
**Description:** Update driver availability status.  
**Body:**
```json
{ "status": "available | busy | offline | on_trip" }
```
**Response:** Updated driver object.

---

### `POST /driver/go-online`
**Auth:** Driver  
**Description:** Mark driver as online and available.  
**Response:**
```json
{ "ok": true, "isOnline": true }
```

---

### `POST /driver/go-offline`
**Auth:** Driver  
**Description:** Mark driver as offline.  
**Response:**
```json
{ "ok": true, "isOnline": false }
```

---

### `GET /driver/trips`
**Auth:** Driver  
**Description:** List trips assigned to the authenticated driver.  
**Query:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Page size (max 50) |
| `status` | string | — | Filter by trip status |

**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

### `GET /driver/trips/:id`
**Auth:** Driver  
**Description:** Get a specific trip assigned to the authenticated driver.  
**Response:** Full trip object with route and station details.  
**Errors:** `403` trip not assigned to this driver, `404` not found.

---

### `POST /driver/trips/:id/start`
**Auth:** Driver  
**Description:** Start a trip (transitions status to `active`).  
**Response:** Updated trip object.

---

### `POST /driver/trips/:id/complete`
**Auth:** Driver  
**Description:** Complete a trip (transitions status to `completed`).  
**Response:** Updated trip object.

---

### `GET /earnings/summary`
**Auth:** Driver or Admin  
**Description:** Returns earnings summary. Drivers see their own data; admins see all drivers.  
**Response (Driver):**
```json
{
  "driverId": 1,
  "summary": { "totalEarnings": 0.0, "totalPaid": 0.0, "totalPending": 0.0, "totalConfirmed": 0.0, "totalRecords": 0 },
  "byStatus": [ { "status": "pending", "count": 0, "total": 0.0 } ],
  "recentEarnings": [...]
}
```
**Response (Admin):**
```json
{
  "summary": { "totalEarnings": 0.0, "totalPaid": 0.0, "totalPending": 0.0, "totalConfirmed": 0.0, "totalRecords": 0 },
  "byStatus": [...],
  "topDrivers": [ { "driverId": 1, "driverName": "...", "tripCount": 0, "totalEarned": 0.0, "totalPaid": 0.0 } ]
}
```

---

### `GET /earnings/weekly`
**Auth:** Driver or Admin  
**Description:** Weekly earnings breakdown. Drivers see own; admins see all or filter by `driverId`.  
**Query:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `weeks` | int | 8 | Number of past weeks (max 52) |
| `driverId` | int | — | Admin only: filter to a specific driver |

**Response:**
```json
{
  "weeks": 8,
  "driverId": null,
  "weeklyBreakdown": [ { "week_start": "2026-05-25", "trip_count": 5, "total_earned": 250.0, "paid": 200.0, "pending": 50.0, "confirmed": 0.0 } ],
  "driverBreakdown": [...]
}
```

---

## 5. Admin — Dashboard

### `GET /dashboard/summary`
**Auth:** Admin  
**Description:** Aggregated platform-wide counts for routes, trips, fleet, support, users.  
**Response:**
```json
{
  "routes": { "total": 0, "active": 0, "inactive": 0 },
  "stations": { "total": 0 },
  "trips": { "total": 0, "active": 0, "scheduled": 0, "boarding": 0, "upcoming": 0, "cancelled": 0 },
  "fleet": { "totalBuses": 0, "activeBuses": 0, "totalDrivers": 0, "onlineDrivers": 0 },
  "support": { "openTickets": 0, "pendingTickets": 0, "totalMessages": 0 },
  "verifications": { "pending": 0 },
  "suggestions": { "pending": 0 },
  "users": { "total": 0, "passengers": 0, "drivers": 0 },
  "generatedAt": "..."
}
```

---

### `GET /dashboard/activity`
**Auth:** Admin  
**Description:** Recent activity feed: latest 8 of each category.  
**Response:**
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

### `GET /dashboard/analytics`
**Auth:** Admin  
**Description:** 30-day analytics: trips per day, route popularity, status breakdown, driver activity, busiest stations, bookings/revenue per day.  
**Response:**
```json
{
  "tripsPerDay": [ { "date": "2026-05-31", "trips": 10, "completed": 8, "cancelled": 1 } ],
  "routePopularity": [ { "id": 1, "name": "...", "fromLocation": "...", "toLocation": "...", "tripCount": 0, "activeCount": 0 } ],
  "tripStatusBreakdown": [ { "status": "active", "count": 5 } ],
  "driverActivity": [ { "id": 1, "name": "...", "tripCount": 0, "rating": 4.8, "isOnline": true, "status": "..." } ],
  "busiestStations": [ { "name": "...", "routeName": "...", "tripCount": 0 } ],
  "bookingsPerDay": [ { "date": "...", "bookings": 0, "revenue": 0.0 } ]
}
```

---

### `GET /dashboard/today`
**Auth:** Admin  
**Description:** Today's KPIs vs. yesterday, live driver map data, 7-day sparklines.  
**Response:**
```json
{
  "tripsToday": 0,
  "tripsYesterday": 0,
  "revenueToday": 0.0,
  "revenueYesterday": 0.0,
  "driversOnline": 0,
  "passengersActive": 0,
  "last7DaysTrips": [ { "date": "...", "trips": 0 } ],
  "last7DaysRevenue": [ { "date": "...", "revenue": 0.0 } ],
  "activeTrips": [ { "id": 1, "status": "active", "departureTime": "...", "routeName": "...", "driverName": "...", "latitude": 0.0, "longitude": 0.0 } ],
  "generatedAt": "..."
}
```

---

## 6. Admin — Users

### `GET /admin/users`
**Auth:** Admin  
**Description:** Paginated list of all users with optional filters.  
**Query:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Page size (max 100) |
| `role` | string | — | Filter: `user`, `driver`, `admin` |
| `search` | string | — | Search by name or email |
| `isBlocked` | boolean | — | Filter blocked/unblocked |

**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

### `GET /admin/users/:id`
**Auth:** Admin  
**Description:** Get a single user by ID.  
**Response:** Full user object (no password/refreshToken).  
**Errors:** `404`

---

### `PATCH /admin/users/:id`
**Auth:** Admin  
**Description:** Update a user's profile fields.  
**Body (all optional):**
```json
{ "name": "string", "email": "string", "phone": "string", "role": "user | driver | admin", "isBlocked": false }
```
**Response:** Updated user object.

---

### `POST /admin/users/:id/block`
**Auth:** Admin  
**Description:** Block a user account.  
**Response:**
```json
{ "ok": true }
```

---

### `POST /admin/users/:id/unblock`
**Auth:** Admin  
**Description:** Unblock a user account.  
**Response:**
```json
{ "ok": true }
```

---

### `DELETE /admin/users/:id`
**Auth:** Admin  
**Description:** Permanently delete a user.  
**Response:** `204 No Content`

---

## 7. Admin — Drivers

### `GET /admin/drivers`
**Auth:** Admin  
**Description:** Paginated list of all driver profiles.  
**Query:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Page size (max 100) |
| `search` | string | — | Search by name/phone |
| `status` | string | — | `active`, `inactive`, `suspended` |
| `isOnline` | boolean | — | Filter online/offline |

**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

### `GET /admin/drivers/:id`
**Auth:** Admin  
**Description:** Get a single driver profile by ID (joins user data).  
**Response:** Full driver object.  
**Errors:** `404`

---

### `PATCH /admin/drivers/:id`
**Auth:** Admin  
**Description:** Update a driver profile.  
**Body (all optional):**
```json
{
  "name": "string", "phone": "string", "isActive": true,
  "isOnline": false, "status": "active | inactive | suspended",
  "assignedBusId": 1, "rating": "4.5"
}
```
**Response:** Updated driver object.

---

### `POST /admin/drivers/:id/block`
**Auth:** Admin  
**Description:** Suspend/block a driver.  
**Response:**
```json
{ "ok": true }
```

---

### `POST /admin/drivers/:id/unblock`
**Auth:** Admin  
**Description:** Reinstate a suspended driver.  
**Response:**
```json
{ "ok": true }
```

---

### `GET /admin/driver-locations`
**Auth:** Admin  
**Description:** Paginated location history for a specific driver.  
**Query:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `driverId` | int | Yes | Driver ID |
| `page` | int | No | Default 1 |
| `limit` | int | No | Default 50, max 200 |

**Response:**
```json
{ "data": [ { "id": 1, "driverId": 1, "latitude": 0.0, "longitude": 0.0, "recordedAt": "..." } ], "total": 0, "page": 1, "limit": 50 }
```

---

### `GET /admin/driver-locations/:driverId/latest`
**Auth:** Admin  
**Description:** Most recent location record for a specific driver.  
**Response:** Single location object.  
**Errors:** `404` no location history found.

---

## 8. Admin — Driver Documents

### `GET /driver-documents`
**Auth:** Admin  
**Description:** Paginated list of all driver documents with optional filters.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 50, max 100 |
| `verificationStatus` | string | `pending`, `approved`, `rejected` |
| `type` | string | Document type (see below) |

**Document types:** `national_id_front`, `national_id_back`, `driving_license_front`, `driving_license_back`, `vehicle_license_front`, `vehicle_license_back`, `vehicle_photo`, `profile_photo`, `trip_selfie`, `criminal_record`

**Response:**
```json
{ "data": [ { "...doc fields...", "driver": { "name": "...", "phone": "..." } } ], "total": 0, "page": 1, "limit": 50 }
```

---

### `GET /driver-documents/by-driver/:driverId`
**Auth:** Admin  
**Description:** All documents for a specific driver, grouped by type.  
**Response:**
```json
{ "driver": { "id": 1, "name": "...", "phone": "..." }, "documents": [...] }
```

---

### `POST /driver-documents/upload/:driverId`
**Auth:** User (any authenticated)  
**Description:** Upload a document image for a driver. Accepts `multipart/form-data`.  
**Form fields:**

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Image file (JPEG, PNG, WebP; max 10 MB) |
| `type` | string | Document type (see list above) |

**Response (201):** Created document object with `fileUrl`.

---

### `PATCH /driver-documents/:id`
**Auth:** Admin  
**Description:** Update verification status and/or admin notes on a document.  
**Body (all optional):**
```json
{ "verificationStatus": "pending | approved | rejected", "adminNotes": "string" }
```
**Response:** Updated document object.

---

### `GET /driver-documents/stats`
**Auth:** Admin  
**Description:** Count of documents by verification status.  
**Response:**
```json
{ "pending": 0, "approved": 0, "rejected": 0 }
```

---

## 9. Admin — Buses

### `GET /buses`
**Auth:** Admin  
**Description:** Paginated list of all buses.  
**Query:**

| Param | Type | Default |
|-------|------|---------|
| `page` | int | 1 |
| `limit` | int | 20 |

**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

### `POST /buses`
**Auth:** Admin  
**Description:** Create a new bus.  
**Body:**
```json
{
  "plateNumber": "string",
  "model": "string",
  "capacity": 30,
  "isActive": true
}
```
**Response (201):** Created bus object. Also writes an audit log entry.

---

### `GET /buses/:id`
**Auth:** Admin  
**Description:** Get a bus by ID.  
**Response:** Bus object.  
**Errors:** `404`

---

### `PATCH /buses/:id`
**Auth:** Admin  
**Description:** Update a bus.  
**Body:** Partial of create body fields.  
**Response:** Updated bus object. Also writes an audit log entry.

---

### `DELETE /buses/:id`
**Auth:** Admin  
**Description:** Delete a bus.  
**Response:** `204 No Content`. Also writes an audit log entry.

---

## 10. Admin — Vehicles

### `GET /vehicles`
**Auth:** Admin  
**Description:** Paginated list of all vehicles (ride-hailing, not shuttle buses).  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 100 |
| `search` | string | Search by plate, make, or model |
| `status` | string | `pending`, `verified`, `rejected`, `suspended` |
| `vehicleType` | string | `car`, `motorcycle`, `van`, `minibus` |

**Response:**
```json
{
  "data": [
    {
      "id": 1, "driverId": 1, "plateNumber": "...", "make": "Toyota", "model": "Camry",
      "year": 2022, "color": "White", "vehicleType": "car", "status": "verified",
      "isActive": true, "driverName": "...", "driverPhone": "..."
    }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `POST /vehicles`
**Auth:** Admin  
**Description:** Create a new vehicle record.  
**Body:**
```json
{
  "driverId": 1,
  "plateNumber": "string",
  "make": "string",
  "model": "string",
  "year": 2022,
  "color": "string",
  "vehicleType": "car | motorcycle | van | minibus",
  "status": "pending | verified | rejected | suspended (default: pending)",
  "isActive": true
}
```
**Response (201):** Created vehicle object.

---

### `GET /vehicles/:id`
**Auth:** Admin  
**Description:** Get a vehicle by ID (includes driver info).  
**Errors:** `404`

---

### `PATCH /vehicles/:id`
**Auth:** Admin  
**Description:** Update a vehicle's fields.  
**Body:** Partial of create body (excluding `driverId`).  
**Response:** Updated vehicle object.

---

### `DELETE /vehicles/:id`
**Auth:** Admin  
**Description:** Delete a vehicle record.  
**Response:** `204 No Content`

---

## 11. Admin — Earnings

### `GET /earnings`
**Auth:** Admin  
**Description:** Paginated list of all driver earning records.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 100 |
| `driverId` | int | Filter by driver |
| `status` | string | `pending`, `confirmed`, `paid` |

**Response:**
```json
{
  "data": [
    { "id": 1, "driverId": 1, "tripId": 2, "amount": 50.0, "status": "pending", "date": "...", "driverName": "..." }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `PATCH /earnings/:id/status`
**Auth:** Admin  
**Description:** Update an earning record's status.  
**Body:**
```json
{ "status": "confirmed | paid" }
```
**Response:** Updated earning object.  
**Errors:** `404`

---

## 12. Admin — Routes & Stations

### `GET /routes`
**Auth:** Admin  
**Description:** Paginated list of all shuttle routes.  
**Query:**

| Param | Type | Default |
|-------|------|---------|
| `page` | int | 1 |
| `limit` | int | 20 |
| `isActive` | boolean | — |
| `search` | string | — |

**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

### `POST /routes`
**Auth:** Admin  
**Description:** Create a new shuttle route.  
**Body:**
```json
{
  "name": "string",
  "fromLocation": "string",
  "toLocation": "string",
  "estimatedDuration": 60,
  "basePrice": "15.00",
  "isActive": true
}
```
**Response (201):** Created route object.

---

### `GET /routes/:id`
**Auth:** Admin  
**Description:** Get a route by ID including its stations.  
**Response:** Route object + `stations` array.

---

### `PATCH /routes/:id`
**Auth:** Admin  
**Description:** Update a route.  
**Body:** Partial of create body fields.  
**Response:** Updated route object.

---

### `DELETE /routes/:id`
**Auth:** Admin  
**Description:** Delete a route.  
**Response:** `204 No Content`

---

### `GET /stations`
**Auth:** Admin  
**Description:** List all stations, optionally filtered by route.  
**Query:** `routeId` (int, optional)  
**Response:**
```json
{ "data": [...], "total": 0 }
```

---

### `POST /stations`
**Auth:** Admin  
**Description:** Create a station on a route.  
**Body:**
```json
{ "routeId": 1, "name": "string", "latitude": 0.0, "longitude": 0.0, "order": 1 }
```
**Response (201):** Created station object.

---

### `PATCH /stations/:id`
**Auth:** Admin  
**Description:** Update a station.  
**Body:** Partial of create body.  
**Response:** Updated station object.

---

### `DELETE /stations/:id`
**Auth:** Admin  
**Description:** Delete a station.  
**Response:** `204 No Content`

---

## 13. Admin — Trips

### `GET /trips`
**Auth:** Admin  
**Description:** Paginated list of all trips with filters.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20 |
| `routeId` | int | Filter by route |
| `driverId` | int | Filter by driver |
| `status` | string | `scheduled`, `boarding`, `active`, `completed`, `cancelled`, `driver_assigned` |
| `from` | datetime | Filter departure >= date |
| `to` | datetime | Filter departure <= date |

**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

### `POST /trips`
**Auth:** Admin  
**Description:** Create a new trip.  
**Body:**
```json
{
  "routeId": 1,
  "busId": 1,
  "driverId": 1,
  "departureTime": "2026-06-01T07:00:00Z",
  "arrivalTime": "2026-06-01T08:00:00Z",
  "totalSeats": 30,
  "availableSeats": 30,
  "price": "15.00",
  "status": "scheduled"
}
```
**Response (201):** Created trip object.

---

### `GET /trips/:id`
**Auth:** Admin  
**Description:** Get a single trip with full details (route, driver, bus).  
**Errors:** `404`

---

### `PATCH /trips/:id`
**Auth:** Admin  
**Description:** Update a trip's fields.  
**Body:** Partial of create body fields.  
**Response:** Updated trip object.

---

### `DELETE /trips/:id`
**Auth:** Admin  
**Description:** Delete a trip record.  
**Response:** `204 No Content`

---

### `POST /trips/:id/start`
**Auth:** Admin  
**Description:** Start a trip (status → `active`). Emits socket event.  
**Response:** Updated trip object.

---

### `POST /trips/:id/complete`
**Auth:** Admin  
**Description:** Complete a trip (status → `completed`). Marks all boarded bookings completed.  
**Response:** Updated trip object.

---

### `POST /trips/:id/cancel`
**Auth:** Admin  
**Description:** Cancel a trip and all associated bookings.  
**Response:** Updated trip object.

---

### `GET /trips/:id/bookings`
**Auth:** Admin  
**Description:** All bookings associated with a trip.  
**Response:**
```json
{ "data": [...], "total": 0 }
```

---

### `GET /trips/:id/events`
**Auth:** Admin  
**Description:** All event log entries for a trip (location updates, status changes, etc.).  
**Response:**
```json
{ "data": [ { "id": 1, "tripId": 1, "type": "LOCATION_UPDATE", "metadata": {}, "createdAt": "..." } ], "total": 0 }
```

---

## 14. Admin — Bookings

### `GET /admin/bookings`
**Auth:** Admin  
**Description:** Paginated list of all bookings with filters.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20 |
| `status` | string | `pending`, `confirmed`, `cancelled`, `completed`, `boarded`, `absent` |
| `userId` | int | Filter by user |
| `tripId` | int | Filter by trip |
| `from` | date | Filter created >= date |
| `to` | date | Filter created <= date |

**Response:**
```json
{
  "data": [
    {
      "id": 1, "userId": 1, "tripId": 2, "seatCount": 1, "totalPrice": "15.00",
      "status": "confirmed", "paymentStatus": "paid", "createdAt": "...",
      "userName": "...", "userEmail": "...", "userPhone": "..."
    }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `GET /admin/bookings/:id`
**Auth:** Admin  
**Description:** Get a booking by ID.  
**Errors:** `404`

---

### `PATCH /admin/bookings/:id/status`
**Auth:** Admin  
**Description:** Change the status of a booking.  
**Body:**
```json
{ "status": "confirmed | cancelled | completed | boarded | absent" }
```
**Response:** Updated booking object.

---

### `POST /bookings`
**Auth:** User  
**Description:** Create a new booking (passenger self-service).  
**Body:**
```json
{ "tripId": 1, "seatCount": 1, "paymentMethod": "wallet | cash" }
```
**Response (201):** Created booking object.  
**Errors:** `400` insufficient seats or funds, `409` already booked.

---

### `GET /bookings/:id`
**Auth:** User  
**Description:** Get own booking by ID.  
**Errors:** `403` not owner, `404`

---

### `PATCH /bookings/:id/cancel`
**Auth:** User  
**Description:** Cancel own booking. Refunds wallet if applicable.  
**Response:** Updated booking object.

---

## 15. Admin — Rides

### `GET /admin/rides`
**Auth:** Admin  
**Description:** Paginated list of on-demand ride requests.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20 |
| `status` | string | `pending`, `accepted`, `active`, `completed`, `cancelled` |
| `userId` | int | Filter by passenger |
| `driverId` | int | Filter by driver |

**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

### `GET /admin/rides/:id`
**Auth:** Admin  
**Description:** Get a ride by ID with full details.  
**Errors:** `404`

---

### `PATCH /admin/rides/:id/status`
**Auth:** Admin  
**Description:** Override a ride's status.  
**Body:**
```json
{ "status": "pending | accepted | active | completed | cancelled" }
```
**Response:** Updated ride object.

---

### `POST /rides/request`
**Auth:** User  
**Description:** Request an on-demand ride.  
**Body:**
```json
{
  "pickupLatitude": 30.0, "pickupLongitude": 31.0,
  "dropoffLatitude": 30.1, "dropoffLongitude": 31.1,
  "vehicleType": "car | motorcycle",
  "paymentMethod": "wallet | cash"
}
```
**Response (201):** Created ride object with estimated fare.

---

### `GET /rides/:id`
**Auth:** User  
**Description:** Get own ride by ID.  
**Response:** Ride object with driver location if active.

---

### `PATCH /rides/:id/status`
**Auth:** Driver  
**Description:** Driver updates a ride's status (accept, start, complete, cancel).  
**Body:**
```json
{ "status": "accepted | active | completed | cancelled" }
```
**Response:** Updated ride object.

---

## 16. Admin — Wallet

### `GET /wallet/balance`
**Auth:** User  
**Description:** Get own wallet balance.  
**Response:**
```json
{ "userId": 1, "balance": "50.00" }
```

---

### `GET /wallet/transactions`
**Auth:** User  
**Description:** Paginated list of own wallet transactions.  
**Query:** `page`, `limit`  
**Response:**
```json
{ "data": [ { "id": 1, "type": "credit | debit | refund", "amount": "25.00", "description": "...", "createdAt": "..." } ], "total": 0 }
```

---

### `POST /admin/wallet/refund`
**Auth:** Admin  
**Description:** Refund an amount to a user's wallet.  
**Body:**
```json
{ "userId": 1, "amount": 25.00, "description": "Refund for booking #123" }
```
**Response:**
```json
{ "ok": true, "newBalance": "75.00" }
```

---

### `POST /admin/wallet/credit`
**Auth:** Admin  
**Description:** Credit an arbitrary amount to a user's wallet (promotional credit, manual adjustment).  
**Body:**
```json
{ "userId": 1, "amount": 10.00, "description": "Promotional credit" }
```
**Response:**
```json
{ "ok": true, "newBalance": "60.00" }
```

---

### `GET /admin/wallet/transactions`
**Auth:** Admin  
**Description:** Paginated list of all wallet transactions across all users.  
**Query:** `page`, `limit`, `userId`, `type`  
**Response:**
```json
{ "data": [...], "total": 0, "page": 1, "limit": 20 }
```

---

## 17. Admin — Payments

### `GET /admin/payments`
**Auth:** Admin  
**Description:** Paginated list of payment records with filters.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 25, max 100 |
| `status` | string | `pending`, `completed`, `failed`, `refunded` |
| `method` | string | `wallet`, `cash`, `card` |
| `userId` | int | Filter by user |
| `bookingId` | int | Filter by booking |
| `rideId` | int | Filter by ride |
| `from` | ISO datetime | Created after |
| `to` | ISO datetime | Created before |

**Response:**
```json
{
  "data": [
    {
      "id": 1, "userId": 1, "bookingId": 2, "rideId": null,
      "amount": "25.00", "method": "wallet", "status": "completed",
      "transactionRef": "...", "notes": null,
      "userName": "...", "userEmail": "...", "userPhone": "..."
    }
  ],
  "total": 0, "page": 1, "limit": 25
}
```

---

### `GET /admin/payments/summary`
**Auth:** Admin  
**Description:** Aggregate payment statistics across all records.  
**Response:**
```json
{
  "total": 0,
  "totalAmount": 0.0,
  "completedCount": 0, "completedAmount": 0.0,
  "refundedCount": 0, "refundedAmount": 0.0,
  "pendingCount": 0,
  "failedCount": 0,
  "walletCount": 0, "cashCount": 0, "cardCount": 0
}
```

---

### `GET /admin/payments/:id`
**Auth:** Admin  
**Description:** Get a single payment record by ID.  
**Response:** Full payment object with user info.  
**Errors:** `404`

---

### `PATCH /admin/payments/:id`
**Auth:** Admin  
**Description:** Update payment status, notes, or transaction reference.  
**Body (all optional):**
```json
{
  "status": "pending | completed | failed | refunded",
  "notes": "string",
  "transactionRef": "string"
}
```
**Response:** Updated payment object. Writes an audit log entry.

---

## 18. Admin — Promo Codes

### `GET /promo`
**Auth:** User  
**Description:** Paginated list of promo codes.  
**Query:** `page` (default 1), `limit` (default 20)  
**Response:**
```json
{
  "data": [
    { "id": 1, "code": "SAVE10", "discountType": "percentage", "discountValue": 10, "isActive": true, "expiryDate": "...", "maxUsage": 100, "usedCount": 5 }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `POST /promo/validate`
**Auth:** User  
**Description:** Validate a promo code (checks active, not expired, not usage-exceeded).  
**Body:**
```json
{ "code": "SAVE10" }
```
**Response:** Promo code object if valid.  
**Errors:** `404` not found/inactive, `400` expired or usage limit reached.

---

### `POST /promo`
**Auth:** Admin  
**Description:** Create a new promo code.  
**Body:**
```json
{
  "code": "string",
  "discountType": "percentage | fixed",
  "discountValue": 10,
  "isActive": true,
  "expiryDate": "2026-12-31T23:59:59Z",
  "maxUsage": 100
}
```
**Response (201):** Created promo code. Writes audit log.

---

### `PATCH /promo/:id`
**Auth:** Admin  
**Description:** Update a promo code.  
**Body:** Partial of create body.  
**Response:** Updated promo code. Writes audit log.

---

### `DELETE /promo/:id`
**Auth:** Admin  
**Description:** Delete a promo code.  
**Response:** `204 No Content`. Writes audit log.

---

## 19. Admin — Notifications

### `GET /admin/notifications/history`
**Auth:** Admin  
**Description:** Paginated list of all notifications sent across all users.  
**Query:** `page` (default 1), `limit` (default 20, max 50)  
**Response:**
```json
{
  "data": [
    {
      "id": 1, "userId": 2, "title": "...", "body": "...", "isRead": false, "createdAt": "...",
      "user": { "id": 2, "name": "...", "email": "...", "role": "user" }
    }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `POST /notifications`
**Auth:** Admin  
**Description:** Send a notification to a specific user.  
**Body:**
```json
{ "userId": 1, "title": "string", "body": "string" }
```
**Response (201):** Created notification object.

---

### `POST /admin/notifications/broadcast`
**Auth:** Admin  
**Description:** Broadcast a notification to a targeted audience. Emits real-time socket events.  
**Body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | required | Notification title |
| `body` | string | required | Notification body |
| `target` | string | `"all"` | `all`, `users`, `drivers`, `specific` |
| `userId` | int | — | Required when `target = "specific"` |
| `includeBlocked` | boolean | `false` | Include blocked accounts |
| `minRating` | float | — | Drivers only: minimum rating filter |
| `minTripCount` | int | — | Users only: minimum trip count filter |

**Response:**
```json
{ "sent": 42 }
```
or if no matches:
```json
{ "sent": 0, "message": "No users matched the filters" }
```

---

## 20. Admin — Support Tickets

### `GET /support/tickets`
**Auth:** Admin  
**Description:** Paginated list of support tickets with filters.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 100 |
| `status` | string | `open`, `pending`, `resolved`, `closed` |
| `priority` | string | `low`, `medium`, `high` |
| `type` | string | `passenger`, `driver` |
| `search` | string | Search subject |
| `userId` | int | Filter by user |

**Response:**
```json
{
  "data": [
    { "id": 1, "subject": "...", "status": "open", "priority": "medium", "type": "passenger",
      "user": { "name": "...", "email": "..." }, "driver": null, "createdAt": "..." }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `POST /support/tickets`
**Auth:** Public  
**Description:** Create a new support ticket (no auth required — used by mobile apps pre-login).  
**Body:**
```json
{
  "subject": "string",
  "message": "string",
  "type": "passenger | driver (default: passenger)",
  "priority": "low | medium | high (default: medium)",
  "userId": 1,
  "driverId": null
}
```
**Response (201):** Created ticket object.

---

### `GET /support/tickets/:id`
**Auth:** Admin  
**Description:** Get a single ticket with all messages.  
**Response:**
```json
{
  "id": 1, "subject": "...", "status": "open",
  "user": { "name": "...", "email": "..." },
  "driver": { "name": "...", "phone": "..." },
  "messages": [
    { "id": 1, "ticketId": 1, "senderType": "admin", "senderId": 1, "message": "...", "createdAt": "..." }
  ]
}
```

---

### `PATCH /support/tickets/:id`
**Auth:** Admin  
**Description:** Update ticket status or priority.  
**Body (all optional):**
```json
{ "status": "open | pending | resolved | closed", "priority": "low | medium | high" }
```
**Response:** Updated ticket object.

---

### `POST /support/tickets/:id/messages`
**Auth:** Admin  
**Description:** Reply to a ticket. Automatically advances open tickets to `pending` status.  
**Body:**
```json
{
  "message": "string",
  "senderType": "admin | passenger | driver (default: admin)"
}
```
**Response (201):** Created message object.

---

### `GET /support/stats`
**Auth:** Admin  
**Description:** Ticket counts grouped by status.  
**Response:**
```json
{ "open": 3, "pending": 1, "resolved": 10, "closed": 5 }
```

---

## 21. Admin — Ratings

### `GET /admin/ratings`
**Auth:** Admin  
**Description:** Paginated list of all driver ratings with filters.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 25, max 100 |
| `driverId` | int | Filter by driver |
| `raterId` | int | Filter by rater (user) |
| `context` | string | `trip`, `ride` |
| `minScore` | float | Min score (1–5) |
| `maxScore` | float | Max score (1–5) |
| `from` | ISO datetime | Created after |
| `to` | ISO datetime | Created before |

**Response:**
```json
{
  "data": [
    {
      "id": 1, "raterId": 2, "driverId": 3, "tripId": 4, "rideId": null,
      "context": "trip", "score": "4.5", "comment": "Great driver",
      "raterName": "...", "raterEmail": "...", "driverName": "..."
    }
  ],
  "total": 0, "page": 1, "limit": 25
}
```

---

### `GET /admin/ratings/stats`
**Auth:** Admin  
**Description:** Overall rating statistics and score distribution.  
**Response:**
```json
{
  "total": 0,
  "avgScore": 4.5,
  "tripCount": 0,
  "rideCount": 0,
  "distribution": [ { "score": 5, "count": 10 }, { "score": 4, "count": 8 } ]
}
```

---

### `GET /admin/ratings/:id`
**Auth:** Admin  
**Description:** Get a single rating by ID.  
**Errors:** `404`

---

### `DELETE /admin/ratings/:id`
**Auth:** Admin  
**Description:** Delete a rating record. Writes audit log.  
**Response:** `204 No Content`

---

## 22. Admin — Service Controls

Service controls toggle/configure the availability of platform services: `shuttle`, `car`, `motorcycle`, `delivery`.

### `GET /admin/services/:type/control`
**Auth:** Admin  
**Path param:** `type` — one of `shuttle`, `car`, `motorcycle`, `delivery`  
**Description:** Get the current control settings and last 10 change logs for a service type. Auto-creates a default entry if none exists.  
**Response:**
```json
{
  "serviceType": "shuttle",
  "isEnabled": true,
  "displayMode": "live",
  "unavailableMessage": null,
  "unavailableAction": "none",
  "activeZoneIds": [],
  "maintenanceEta": null,
  "maxActiveRides": null,
  "logs": [
    { "id": 1, "serviceType": "shuttle", "changedBy": 1, "changedAt": "...", "changes": { "isEnabled": { "before": false, "after": true } } }
  ]
}
```

---

### `PATCH /admin/services/:type/control`
**Auth:** Admin  
**Description:** Update one or more settings for a service. Broadcasts `service:control:changed` via Socket.IO.  
**Body (all optional):**
```json
{
  "isEnabled": true,
  "displayMode": "live | coming_soon | unavailable | maintenance",
  "unavailableMessage": "string | null",
  "unavailableAction": "none | show_message | hide_service",
  "activeZoneIds": [1, 2],
  "maintenanceEta": "2026-06-01T08:00:00Z | null",
  "maxActiveRides": 50
}
```
**Response:** Updated control object + last 10 logs.

---

### `POST /admin/services/:type/control/reset`
**Auth:** Admin  
**Description:** Reset a service's control settings to defaults (`isEnabled: true`, `displayMode: "live"`, etc.). Broadcasts socket event.  
**Response:** Reset control object + last 10 logs.

---

### `GET /services/control`
**Auth:** User  
**Description:** Public-facing endpoint — returns current control state for all service types (public fields only, no admin-only fields).  
**Response:**
```json
{
  "data": [
    { "serviceType": "shuttle", "isEnabled": true, "displayMode": "live", "unavailableMessage": null, "unavailableAction": "none", "activeZoneIds": [], "maintenanceEta": null }
  ]
}
```

---

### `GET /services/:type/control`
**Auth:** User  
**Description:** Public-facing control state for a single service type.  
**Response:** Single service control object (public fields only).

---

## 23. Admin — Zone Pricing

### `GET /admin/zone-pricing`
**Auth:** Admin  
**Description:** List all zone pricing entries, optionally filtered by vehicle type.  
**Query:** `vehicleType` — `car` or `bike`  
**Response:**
```json
{
  "data": [
    { "id": 1, "zoneId": 2, "zoneName": "Downtown", "vehicleType": "car", "baseFare": 5.0, "perKmRate": 2.5, "minimumFare": 8.0, "isActive": true }
  ]
}
```

---

### `POST /admin/zone-pricing`
**Auth:** Admin  
**Description:** Create a zone pricing rule.  
**Body:**
```json
{ "zoneId": 1, "vehicleType": "car | bike", "baseFare": 5.0, "perKmRate": 2.5, "minimumFare": 8.0, "isActive": true }
```
**Response (201):** Created pricing rule.  
**Errors:** `409` duplicate zone+vehicleType combination.

---

### `PATCH /admin/zone-pricing/:id`
**Auth:** Admin  
**Description:** Update a pricing rule (can update fares and `isActive`; cannot change zone or vehicle type).  
**Body (all optional):**
```json
{ "baseFare": 6.0, "perKmRate": 3.0, "minimumFare": 9.0, "isActive": false }
```
**Response:** Updated pricing rule.  
**Errors:** `404`

---

### `DELETE /admin/zone-pricing/:id`
**Auth:** Admin  
**Description:** Delete a pricing rule.  
**Response:** `204 No Content`

---

## 24. Admin — Audit Logs

### `GET /admin/audit-logs`
**Auth:** Admin  
**Description:** Paginated, filterable audit trail of admin actions.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 25, max 100 |
| `action` | string | e.g. `CREATE`, `UPDATE`, `DELETE` |
| `entityType` | string | e.g. `promo_code`, `vehicle`, `payment` |
| `userId` | int | Filter by admin who made the change |
| `from` | ISO datetime | Filter after |
| `to` | ISO datetime | Filter before |

**Response:**
```json
{
  "data": [
    {
      "id": 1, "userId": 1, "action": "UPDATE", "entityType": "vehicle", "entityId": 5,
      "oldData": { "status": "pending" }, "newData": { "status": "verified" },
      "ipAddress": "192.168.1.1", "userAgent": "...", "createdAt": "...",
      "adminName": "...", "adminEmail": "..."
    }
  ],
  "total": 0, "page": 1, "limit": 25
}
```

---

### `GET /admin/audit-logs/:id`
**Auth:** Admin  
**Description:** Get a single audit log entry.  
**Errors:** `404`

---

### `GET /admin/audit-logs/distinct/actions`
**Auth:** Admin  
**Description:** List all distinct action values present in the audit log (useful for filter dropdowns).  
**Response:**
```json
["CREATE", "DELETE", "UPDATE"]
```

---

### `GET /admin/audit-logs/distinct/entity-types`
**Auth:** Admin  
**Description:** List all distinct entity type values in the audit log.  
**Response:**
```json
["bus", "payment", "promo_code", "vehicle"]
```

---

## 25. Admin — Staff & Roles

### `GET /admin/permissions/all`
**Auth:** Admin  
**Description:** List all available permission strings that can be assigned to roles.  
**Response:**
```json
{
  "permissions": [
    "view_dashboard", "view_routes", "edit_routes", "view_trips", "edit_trips",
    "view_drivers", "edit_drivers", "view_buses", "edit_buses",
    "view_passengers", "edit_passengers", "view_bookings", "edit_bookings",
    "view_wallet", "edit_wallet", "view_support", "edit_support",
    "view_suggestions", "view_verification", "edit_verification",
    "view_analytics", "view_staff", "edit_staff", "view_settings", "edit_settings",
    "view_promo", "edit_promo", "view_live_tracking", "view_driver_analytics",
    "view_notifications"
  ]
}
```

---

### `GET /admin/roles`
**Auth:** Admin  
**Description:** List all staff roles.  
**Response:**
```json
{ "data": [ { "id": 1, "name": "Dispatcher", "description": "...", "permissions": ["view_dashboard", "view_trips"] } ], "total": 1 }
```

---

### `POST /admin/roles`
**Auth:** Admin  
**Description:** Create a new staff role.  
**Body:**
```json
{ "name": "string", "description": "string (optional)", "permissions": ["view_dashboard"] }
```
**Response (201):** Created role object.

---

### `PATCH /admin/roles/:id`
**Auth:** Admin  
**Description:** Update a role's name, description, or permissions.  
**Body (all optional):**
```json
{ "name": "string", "description": "string", "permissions": ["view_dashboard", "edit_trips"] }
```
**Response:** Updated role object.

---

### `DELETE /admin/roles/:id`
**Auth:** Admin  
**Description:** Delete a role. All staff users assigned this role will have their `staffRoleId` cleared.  
**Response:**
```json
{ "success": true }
```

---

### `GET /admin/staff`
**Auth:** Admin  
**Description:** List all admin/staff users with their assigned role.  
**Query:** `search` — filter by name  
**Response:**
```json
{ "data": [ { "id": 1, "name": "...", "email": "...", "role": "admin", "staffRole": { "id": 1, "name": "Dispatcher", "permissions": [...] } } ], "total": 1 }
```

---

### `POST /admin/staff`
**Auth:** Admin  
**Description:** Create a new staff (admin) user account.  
**Body:**
```json
{
  "name": "string",
  "email": "string (unique)",
  "phone": "string",
  "password": "string (min 8)",
  "staffRoleId": 1
}
```
**Response (201):** Staff user object (no password field).  
**Errors:** `400` email already in use.

---

### `PATCH /admin/staff/:id`
**Auth:** Admin  
**Description:** Update a staff user.  
**Body (all optional):**
```json
{
  "name": "string", "email": "string", "phone": "string",
  "staffRoleId": 1, "isBlocked": false, "password": "string (min 8)"
}
```
**Response:** Updated staff user (no password field).

---

## 26. Admin — Queue

### `GET /admin/queue/status`
**Auth:** Admin  
**Description:** Get the status of the background job queue (pending jobs, processing counts, failed jobs).  
**Response:**
```json
{
  "pending": 0,
  "processing": 0,
  "failed": 2,
  "jobs": [
    { "id": "abc123", "name": "send_notification", "status": "failed", "attempts": 3, "createdAt": "..." }
  ]
}
```

---

### `POST /admin/queue/retry-all`
**Auth:** Admin  
**Description:** Retry all failed jobs in the queue.  
**Response:**
```json
{ "ok": true, "retried": 2 }
```

---

## 27. Admin — Suggestions

### `GET /suggestions`
**Auth:** Admin  
**Description:** Paginated list of route suggestions from users/drivers.  
**Query:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 100 |
| `status` | string | `pending`, `approved`, `rejected` |
| `type` | string | `new_route`, `new_station`, `route_edit` |
| `search` | string | Search by title |

**Response:**
```json
{
  "data": [
    {
      "id": 1, "type": "new_route", "title": "...", "description": "...",
      "startLocation": "...", "endLocation": "...", "status": "pending",
      "user": { "name": "...", "email": "..." }, "driver": null
    }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `POST /suggestions`
**Auth:** Public  
**Description:** Submit a new route suggestion (no auth required).  
**Body:**
```json
{
  "type": "new_route | new_station | route_edit",
  "title": "string",
  "description": "string",
  "startLocation": "string (optional)",
  "endLocation": "string (optional)",
  "userId": 1,
  "driverId": null
}
```
**Response (201):** Created suggestion object.

---

### `GET /suggestions/:id`
**Auth:** Admin  
**Description:** Get a single suggestion with submitter details.  
**Errors:** `404`

---

### `PATCH /suggestions/:id`
**Auth:** Admin  
**Description:** Update a suggestion's status or add admin notes.  
**Body (all optional):**
```json
{ "status": "pending | approved | rejected", "adminNotes": "string" }
```
**Response:** Updated suggestion object.

---

## 28. Shuttle — Public

Shuttle endpoints are primarily public (no auth required unless noted).

### `GET /shuttle/lines`
**Auth:** Public  
**Description:** All active shuttle lines enriched with station counts and trip statistics.  
**Response:**
```json
{
  "data": [
    {
      "id": 1, "name": "Route A", "fromLocation": "City Center", "toLocation": "Airport",
      "estimatedDuration": 60, "basePrice": 15.0, "isActive": true,
      "stationCount": 5, "totalTrips": 3, "scheduledTrips": 2, "activeTrips": 1
    }
  ],
  "total": 1
}
```

---

### `GET /shuttle/lines/:id`
**Auth:** Public  
**Description:** Get a shuttle line with its stations and upcoming trips.  
**Response:**
```json
{
  "data": {
    "id": 1, "name": "...", "fromLocation": "...", "toLocation": "...",
    "basePrice": 15.0, "isActive": true, "stationCount": 5,
    "stations": [ { "id": 1, "name": "Stop A", "order": 1, "latitude": 0.0, "longitude": 0.0 } ],
    "activeTrips": [ { "id": 1, "status": "boarding", "departureTime": "...", "availableSeats": 20 } ]
  }
}
```

---

### `POST /shuttle/lines/:id/activate`
**Auth:** Admin  
**Description:** Activate a shuttle line and advance the next scheduled trip to `boarding` status.  
**Response:**
```json
{
  "data": { "...route fields..." },
  "boardingTrip": { "id": 1, "status": "boarding" }
}
```

---

### `POST /shuttle/lines/:id/complete`
**Auth:** Admin  
**Description:** Mark all active/boarding trips on a line as `completed`. Also completes associated bookings.  
**Response:**
```json
{ "ok": true, "completedTrips": 2 }
```

---

### `POST /shuttle/lines/:id/book`
**Auth:** Driver  
**Description:** Driver books a weekly recurring slot on a shuttle line. Driver must have an assigned bus.  
**Body:**
```json
{
  "weekStart": "2026-06-01",
  "weekEnd": "2026-06-07",
  "departureTime": "07:00"
}
```
**Allowed time slots:** `07:00`, `08:00`, `09:00`, `10:00`, `13:00`, `14:00`, `15:00`, `16:00`  
**Response (201):**
```json
{
  "ok": true,
  "booking": {
    "id": 1, "routeId": 1, "routeName": "...", "fromLocation": "...", "toLocation": "...",
    "departureTime": "...", "arrivalTime": "...",
    "weekStart": "2026-06-01", "weekEnd": "2026-06-07", "departureSlot": "07:00",
    "status": "scheduled", "availableSeats": 30, "totalSeats": 30,
    "bus": { "id": 1, "plateNumber": "...", "model": "...", "capacity": 30 }
  }
}
```
**Errors:** `409` slot already taken, `422` no bus assigned.

---

### `GET /shuttle/lines/:id/passengers`
**Auth:** User  
**Description:** Alias for the most recent active/boarding trip's passenger list on this line. Useful for the driver app.  
**Response:** Same shape as `GET /shuttle/trips/:id/passengers`.

---

### `GET /shuttle/assignments`
**Auth:** Public  
**Description:** All active drivers who have a bus assigned, with their bus details and current trip.  
**Response:**
```json
{
  "data": [
    {
      "driverId": 1, "driverName": "...", "driverPhone": "...", "isOnline": true, "rating": 4.8,
      "bus": { "id": 1, "plateNumber": "...", "model": "...", "capacity": 30 },
      "currentTrip": { "id": 1, "routeName": "...", "status": "boarding", "departureTime": "..." }
    }
  ],
  "total": 1
}
```

---

### `GET /shuttle/trips/:id/passengers`
**Auth:** User  
**Description:** List passengers booked on a trip with boarding status.  
**Response:**
```json
{
  "tripId": 1,
  "tripStatus": "boarding",
  "data": [
    {
      "bookingId": 1, "userId": 2, "seatCount": 1, "totalPrice": 15.0,
      "status": "confirmed", "boarded": false,
      "userName": "...", "userPhone": "...", "userEmail": "..."
    }
  ],
  "total": 5
}
```

---

### `POST /shuttle/trips/:id/board-stop`
**Auth:** User  
**Description:** Mark a station as reached by a trip. Records station progress and emits trip events.  
**Body:**
```json
{ "stationId": 1 }
```
**Response:**
```json
{
  "ok": true, "tripId": 1, "stationId": 1, "stationName": "Stop B",
  "progress": { "...tripStationProgress fields..." },
  "boardedPassengers": 12
}
```

---

### `POST /shuttle/stops/:id/board`
**Auth:** User  
**Description:** Record that a bus has arrived at a stop (stop-level boarding event).  
**Body:**
```json
{ "tripId": 1 }
```
**Response:**
```json
{ "ok": true, "stationId": 1, "tripId": 1, "progress": { "..." } }
```

---

## 29. Locations

### `GET /admin/user-locations`
**Auth:** Admin  
**Description:** All saved locations for a specific user.  
**Query:** `userId` (int, required)  
**Response:**
```json
{ "data": [...], "total": 0 }
```

---

## Admin — Zones

### `GET /zones`
**Auth:** Admin  
**Description:** Paginated list of all geographic zones.  
**Query:** `page` (default 1), `limit` (default 100, max 200)  
**Response:**
```json
{
  "data": [
    { "id": 1, "name": "Downtown", "description": "City centre zone", "centerLat": 30.05, "centerLng": 31.23, "radiusKm": 5.0, "services": ["car", "shuttle"], "isActive": true, "createdAt": "..." }
  ],
  "total": 0, "page": 1, "limit": 100
}
```

---

### `POST /zones`
**Auth:** Admin  
**Description:** Create a new zone.  
**Body:**
```json
{
  "name": "string",
  "description": "string (optional)",
  "centerLat": 30.05,
  "centerLng": 31.23,
  "radiusKm": 5.0,
  "services": ["car", "shuttle", "bike"],
  "isActive": true
}
```
**Response (201):** Created zone object. Writes audit log.

---

### `GET /zones/locate`
**Auth:** Admin  
**Description:** Find the zone that contains a given GPS coordinate. Returns the matching zone ID (and full zone record) for the supplied latitude/longitude point.  
**Query:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | float | Yes | Latitude (−90 to 90) |
| `lng` | float | Yes | Longitude (−180 to 180) |

**Response (200):**
```json
{ "zoneId": 3, "zone": { "id": 3, "name": "Airport", "centerLat": 30.12, "centerLng": 31.40, "radiusKm": 8.0, "services": ["car", "shuttle"], "isActive": true } }
```
**Response (404):** No zone matched the coordinates.
```json
{ "error": "No zone found for the given coordinates" }
```

---

### `GET /zones/:id`
**Auth:** Admin  
**Description:** Get a zone by ID.  
**Errors:** `404`

---

### `PATCH /zones/:id`
**Auth:** Admin  
**Description:** Update a zone's fields.  
**Body:** Partial of create body.  
**Response:** Updated zone object. Writes audit log.  
**Errors:** `404`

---

### `DELETE /zones/:id`
**Auth:** Admin  
**Description:** Delete a zone.  
**Response:** `204 No Content`. Writes audit log.

---

## 30. Chat

Chat is scoped to trips. All messages are stored against a `tripId`.

### `GET /trips/:id/chat`
**Auth:** User  
**Description:** Get full chat history for a trip, ordered chronologically.  
**Path param:** `id` — trip ID  
**Response:**
```json
{ "data": [ { "id": 1, "tripId": 1, "senderId": 2, "senderType": "passenger", "message": "...", "isRead": false, "createdAt": "..." } ], "total": 5 }
```

---

### `POST /trips/:id/chat`
**Auth:** User  
**Description:** Send a chat message in a trip. Emits `trip:chat:message` to the trip room and `admin:chat:new` to the admin room.  
**Path param:** `id` — trip ID  
**Body:**
```json
{ "message": "string (max 2000 chars)" }
```
**Response (201):** Created message object. `senderType` is derived from the JWT role (`passenger`, `driver`, or `admin`).  
**Errors:** `404` trip not found.

---

### `GET /admin/chat`
**Auth:** Admin  
**Description:** List all trip conversations grouped by trip, newest message first.  
**Query:** `page` (default 1), `limit` (default 20, max 50)  
**Response:**
```json
{
  "data": [
    {
      "trip_id": 1, "trip_status": "active",
      "user_name": "...", "user_email": "...",
      "driver_name": "...", "driver_phone": "...",
      "last_message": "Are you close?", "last_sender_type": "passenger",
      "last_message_at": "...", "unread_count": 2, "total_messages": 8
    }
  ],
  "total": 0, "page": 1, "limit": 20
}
```

---

### `GET /admin/chat/stats`
**Auth:** Admin  
**Description:** Aggregate chat stats: total messages, unread count, number of trip conversations.  
**Response:**
```json
{ "totalMessages": 0, "unreadMessages": 0, "tripConversations": 0 }
```

---

### `GET /admin/chat/trip/:id`
**Auth:** Admin  
**Description:** All messages for a specific trip. Also marks all unread messages in the trip as read.  
**Response:**
```json
{ "tripId": 1, "tripStatus": "active", "messages": [...], "total": 8 }
```

---

### `POST /admin/chat/trip/:id`
**Auth:** Admin  
**Description:** Admin sends a message into a trip chat. Emits `trip:chat:message` to the trip socket room.  
**Body:**
```json
{ "message": "string (max 2000 chars)" }
```
**Response (201):** Created message object with `senderType: "admin"`.

---

### `PATCH /admin/chat/messages/:id/read`
**Auth:** Admin  
**Description:** Mark a single chat message as read.  
**Response:** Updated message object.  
**Errors:** `404` message not found.

---

## 31. Notifications — User

### `GET /notifications`
**Auth:** User  
**Description:** Paginated list of own notifications.  
**Query:** `page` (default 1), `limit` (default 20, max 100)  
**Response:**
```json
{ "data": [ { "id": 1, "title": "...", "body": "...", "isRead": false, "createdAt": "..." } ], "total": 0, "page": 1, "limit": 20 }
```

---

### `PATCH /notifications/read-all`
**Auth:** User  
**Description:** Mark all own notifications as read.  
**Response:**
```json
{ "ok": true }
```

---

### `PATCH /notifications/:id/read`
**Auth:** User  
**Description:** Mark a single notification as read.  
**Response:** Updated notification object.  
**Errors:** `404`

---

## 32. Deprecated Endpoints

The following endpoints are still functional but deprecated. Use the replacements listed.

| Deprecated | Replacement | Notes |
|-----------|-------------|-------|
| `GET /auth/me` | `GET /users/me` | Same data, prefer `/users/me` |
| `GET /drivers/me` | `GET /driver/me` | Singular `driver` route |
| `PATCH /drivers/me/location` | `PATCH /driver/location` | Singular `driver` route |

---

## Error Response Format

All error responses use the following shape:

```json
{ "error": "Human-readable error message" }
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request / validation failure |
| `401` | Missing or invalid authentication token |
| `403` | Authenticated but insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict (duplicate, already exists) |
| `422` | Unprocessable (business rule violation) |
| `500` | Internal server error |
| `503` | Service unavailable (e.g. DB down) |

---

## WebSocket / Real-time Events

The server exposes Socket.IO at the root URL. The following events are emitted server → client:

| Event | Room | Payload Description |
|-------|------|---------------------|
| `notification:new` | `passenger:<userId>` | New notification object |
| `service:control:changed` | `admin` + broadcast | Service control update payload |
| `message:new` | Chat room | New chat message |
| `ride:updated` | Ride room | Ride status change |
| `driver:location` | Trip/ride room | Driver GPS update |
| `trip:status` | Trip room | Trip status change |
