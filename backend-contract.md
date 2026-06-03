# Backend API Contract

> **Base URL:** All REST endpoints are prefixed with `/api`  
> **Example:** `POST /api/auth/register`  
> **Socket.IO path:** `/api/socket.io`  
> **Auth:** `Authorization: Bearer <jwt>` header on all authenticated routes  
> **Roles:** `user` (passenger) · `driver` · `admin`  
> **Error shape:** `{ "error": "string message" }`  
> **Monetary values:** Stored as strings in DB; returned as **floats** in responses  
> **Pagination shape:** `{ data: [...], total: number, page: number, limit: number }`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Users (Passenger)](#2-users-passenger)
3. [Driver Profile](#3-driver-profile)
4. [Rides (On-demand)](#4-rides-on-demand)
5. [Wallet](#5-wallet)
6. [Shuttle / Bus Bookings](#6-shuttle--bus-bookings)
7. [Payments](#7-payments)
8. [Notifications](#8-notifications)
9. [Zones & Zone Pricing](#9-zones--zone-pricing)
10. [Service Controls](#10-service-controls)
11. [Ratings](#11-ratings)
12. [Support & Chat](#12-support--chat)
13. [Promo Codes](#13-promo-codes)
14. [Routes & Stations (Shuttle)](#14-routes--stations-shuttle)
15. [Trips (Shuttle)](#15-trips-shuttle)
16. [Buses](#16-buses)
17. [Bookings (Shuttle)](#17-bookings-shuttle)
18. [Driver Documents](#18-driver-documents)
19. [Vehicles](#19-vehicles)
20. [Locations](#20-locations)
21. [Suggestions](#21-route-suggestions)
22. [Audit Logs](#22-audit-logs)
23. [Staff](#23-staff)
24. [Earnings (Admin)](#24-earnings-admin)
25. [Drivers (Admin)](#25-drivers-admin)
26. [Admin General](#26-admin-general)
27. [Dashboard (Admin)](#27-dashboard-admin)
28. [Health Check](#28-health-check)
29. [WebSocket Events](#29-websocket-events)
30. [Push Notifications](#30-push-notifications)
31. [Deprecated Aliases](#31-deprecated-aliases)

---

## 1. Authentication

### `POST /api/auth/register`
Register a new passenger or driver account.

**Auth:** None

**Request body:**
```json
{
  "name": "string (required)",
  "email": "string (valid email, required)",
  "password": "string (min 6 chars, required)",
  "phone": "string (optional)",
  "role": "user | driver (default: user)"
}
```

**Response `201`:**
```json
{
  "token": "jwt_string",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "phone": null,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Errors:** `400` email already in use · `400` validation failure

---

### `POST /api/auth/login`
Log in and receive a JWT.

**Auth:** None

**Request body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response `200`:**
```json
{
  "token": "jwt_string",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "phone": null
  }
}
```

**Errors:** `401` invalid credentials

---

### `GET /api/auth/me` *(deprecated — use `GET /api/users/me`)*
Returns the currently authenticated user.

**Auth:** Bearer token (any role)

**Response `200`:** same user object as register/login.

---

## 2. Users (Passenger)

### `GET /api/users/me`
Get the authenticated user's profile.

**Auth:** Bearer token (any role)

**Response `200`:**
```json
{
  "id": 1,
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "role": "user",
  "avatarUrl": null,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### `PATCH /api/users/me`
Update the authenticated user's profile.

**Auth:** Bearer token (any role)

**Request body (all optional):**
```json
{
  "name": "string",
  "phone": "string",
  "avatarUrl": "string (URL)"
}
```

**Response `200`:** Updated user object.

---

### `PATCH /api/users/me/password`
Change password.

**Auth:** Bearer token (any role)

**Request body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string (min 6 chars)"
}
```

**Response `200`:** `{ "message": "Password updated" }`

**Errors:** `400` incorrect current password

---

### `GET /api/users` *(Admin)*
List all users with pagination.

**Auth:** Bearer token — `admin`

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 100) |
| `search` | string | — | Filter by name or email |
| `role` | `user\|driver\|admin` | — | Filter by role |

**Response `200`:** Paginated user objects.

---

### `GET /api/users/:id` *(Admin)*
Get a single user by ID.

**Auth:** Bearer token — `admin`

**Response `200`:** User object.

**Errors:** `404` not found

---

### `PATCH /api/users/:id` *(Admin)*
Update any user.

**Auth:** Bearer token — `admin`

**Request body (all optional):**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "user | driver | admin",
  "isActive": true
}
```

**Response `200`:** Updated user object.

---

### `DELETE /api/users/:id` *(Admin)*
Delete a user.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

## 3. Driver Profile

### `GET /api/driver/me`
Get the authenticated driver's profile.

**Auth:** Bearer token — `driver`

**Response `200`:**
```json
{
  "id": 10,
  "userId": 5,
  "name": "Ahmed Ali",
  "phone": "+201001234567",
  "email": "ahmed@example.com",
  "status": "online",
  "isOnline": true,
  "isActive": true,
  "rating": 4.8,
  "vehicleType": "car",
  "vehiclePlate": "ABC-123",
  "vehicleModel": "Toyota Corolla",
  "vehicleColor": "White",
  "currentLatitude": 30.0444,
  "currentLongitude": 31.2357,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### `PATCH /api/driver/me`
Update the driver's own profile.

**Auth:** Bearer token — `driver`

**Request body (all optional):**
```json
{
  "name": "string",
  "phone": "string",
  "vehicleType": "car | bike",
  "vehiclePlate": "string",
  "vehicleModel": "string",
  "vehicleColor": "string"
}
```

**Response `200`:** Updated driver object.

---

### `PATCH /api/driver/status`
Set online / offline status.

**Auth:** Bearer token — `driver`

**Request body:**
```json
{ "isOnline": true }
```

**Response `200`:** `{ "isOnline": true, "status": "online" }`

---

### `PATCH /api/driver/location`
Push the driver's current GPS coordinates.

**Auth:** Bearer token — `driver`

**Request body:**
```json
{
  "latitude": 30.0444,
  "longitude": 31.2357,
  "heading": 90,
  "speed": 45.5
}
```

**Response `200`:** `{ "ok": true }`

**Side effects:** Broadcasts `driver:location_updated` to the socket room `drivers:available:{vehicleType}` and `admin:room`.

---

### `GET /api/driver/trips`
List the driver's own trips (shuttle trips assigned to them).

**Auth:** Bearer token — `driver`

**Query params:** `status`, `page` (default 1), `limit` (default 20)

**Response `200`:** Paginated trip objects.

---

### `GET /api/driver/trips/:id`
Get a single trip assigned to this driver.

**Auth:** Bearer token — `driver`

**Response `200`:** Trip object.

---

### `PATCH /api/driver/trips/:id/accept`
Accept an assigned shuttle trip.

**Auth:** Bearer token — `driver`

**Response `200`:** Updated trip object (status → `driver_assigned`).

---

### `PATCH /api/driver/trips/:id/reject`
Reject an assigned shuttle trip (returns trip to `waiting_driver`).

**Auth:** Bearer token — `driver`

**Response `200`:** Updated trip object.

---

### `PATCH /api/driver/trips/:id/start`
Start a shuttle trip (status `driver_assigned` or `boarding` → `active`).

**Auth:** Bearer token — `driver`

**Response `200`:** Updated trip object.

**Side effects:** Creates a `TRIP_STARTED` trip event; initialises station progress records; sets driver status to `busy`.

---

### `PATCH /api/driver/trips/:id/complete`
Complete a shuttle trip (status `active` → `completed`).

**Auth:** Bearer token — `driver`

**Response `200`:** Updated trip object.

**Side effects:** Creates `TRIP_COMPLETED` event; sets driver status back to `online`; marks confirmed bookings as `completed`; creates a `driverEarnings` record (commission rate read from settings key `driver_commission_rate`, default 15%).

---

### `PATCH /api/driver/trips/:id/cancel`
Cancel a shuttle trip.

**Auth:** Bearer token — `driver`

**Request body:**
```json
{ "reason": "string (required)" }
```

**Response `200`:** Updated trip object (status → `cancelled`).

**Side effects:** Creates `TRIP_CANCELLED` event; sets driver status back to `online`.

---

### `GET /api/driver/trips/:id/stations`
Get the station list with progress for a trip.

**Auth:** Bearer token — `driver`

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Station A",
      "order": 1,
      "progress": { "status": "pending", "arrivedAt": null, "completedAt": null },
      "status": "pending",
      "expectedPassengers": 4
    }
  ]
}
```

---

### `PATCH /api/driver/trips/:id/stations/:stationId/arrived`
Mark a station as arrived.

**Auth:** Bearer token — `driver`

**Response `200`:** Station progress record.

---

### `PATCH /api/driver/trips/:id/stations/:stationId/completed`
Mark a station as completed (departed).

**Auth:** Bearer token — `driver`

**Response `200`:** Station progress record.

---

### `PATCH /api/driver/bookings/:id/board`
Mark a passenger booking as boarded.

**Auth:** Bearer token — `driver`

**Response `200`:** Updated booking object.

**Side effects:** Emits `booking:boarded` to `passenger:{userId}` socket room.

---

### `PATCH /api/driver/bookings/:id/absent`
Mark a passenger as absent (no-show).

**Auth:** Bearer token — `driver`

**Response `200`:** Updated booking object (status → `absent`).

---

### `GET /api/driver/wallet/balance`
Get the driver's wallet balance.

**Auth:** Bearer token — `driver`

**Response `200`:**
```json
{
  "balance": 250.00,
  "totalPaid": 1800.00,
  "totalPending": 50.00
}
```

---

### `GET /api/driver/wallet/payout-methods`
List available payout methods.

**Auth:** Bearer token — `driver`

**Response `200`:**
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

### `POST /api/driver/wallet/payout-methods`
Add a payout method.

**Auth:** Bearer token — `driver`

**Request body:**
```json
{
  "type": "string (required)",
  "accountNumber": "string (optional)",
  "accountName": "string (optional)",
  "bankName": "string (optional)",
  "phoneNumber": "string (optional)"
}
```

**Response `201`:** Created payout method object.

---

### `DELETE /api/driver/wallet/payout-methods/:id`
Remove a payout method.

**Auth:** Bearer token — `driver`

**Response `200`:** `{ "ok": true, "deleted": "method_id" }`

---

### `POST /api/driver/wallet/payout`
Request a payout.

**Auth:** Bearer token — `driver`

**Request body:**
```json
{
  "amount": 100.00,
  "method": "bank_transfer"
}
```

**Response `200`:**
```json
{
  "ok": true,
  "amount": 100.00,
  "method": "bank_transfer",
  "message": "Payout request submitted successfully"
}
```

**Errors:** `400` insufficient balance (includes `available` field)

---

### `GET /api/driver/earnings`
Get earnings summary and 10 most recent records.

**Auth:** Bearer token — `driver`

**Response `200`:**
```json
{
  "totalEarned": 2050.00,
  "tripCount": 42,
  "recent": [
    { "id": 1, "tripId": 99, "amount": 48.75, "status": "confirmed", "date": "2026-06-03" }
  ]
}
```

---

### `GET /api/driver/earnings/history`
Paginated earnings history.

**Auth:** Bearer token — `driver`

**Query params:** `page` (default 1), `limit` (default 20)

**Response `200`:** Paginated earning objects.

---

### `GET /api/driver/notifications`
Last 50 notifications for the driver.

**Auth:** Bearer token — `driver`

**Response `200`:** `{ "data": [...notificationObjects] }`

---

### `GET /api/driver/settings`
Get driver-specific app settings.

**Auth:** Bearer token — `driver`

**Response `200`:**
```json
{
  "notifications": true,
  "language": "en"
}
```

---

### `PATCH /api/driver/settings`
Update driver-specific app settings.

**Auth:** Bearer token — `driver`

**Request body (all optional):**
```json
{
  "notifications": true,
  "language": "ar"
}
```

**Response `200`:** Updated settings object.

---

### `GET /api/driver/reviews`
Get ratings/reviews received by the driver.

**Auth:** Bearer token — `driver`

**Query params:** `page` (default 1), `limit` (default 20, max 50)

**Response `200`:** Paginated review objects from ride events.

---

## 4. Rides (On-demand)

### `POST /api/rides/request`
Request an on-demand ride.

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "pickupLatitude": 30.0444,
  "pickupLongitude": 31.2357,
  "pickupAddress": "123 Main St",
  "dropoffLatitude": 30.0600,
  "dropoffLongitude": 31.2500,
  "dropoffAddress": "456 Other St",
  "vehicleType": "car | bike",
  "promoCode": "SAVE10 (optional)"
}
```

**Response `201`:** Ride object.

**Side effects:** Emits `ride:new_request` to `drivers:available:{vehicleType}` socket room.

---

### `GET /api/rides`
List the authenticated user's ride history.

**Auth:** Bearer token — `user`

**Query params:** `page`, `limit`, `status`

**Response `200`:** Paginated ride objects.

---

### `GET /api/rides/:id`
Get a single ride.

**Auth:** Bearer token — `user` (own rides) or `admin`

**Response `200`:** Ride object.

---

### `PATCH /api/rides/:id/cancel`
Cancel a pending ride (passenger-initiated).

**Auth:** Bearer token — `user`

**Request body:**
```json
{ "reason": "string (optional)" }
```

**Response `200`:** Updated ride object (status → `cancelled`).

---

### `PATCH /api/rides/:id/accept` *(Driver)*
Accept a ride request.

**Auth:** Bearer token — `driver`

**Response `200`:** Updated ride object (status → `accepted`).

**Side effects:** Emits `ride:accepted` to `passenger:{userId}` socket room.

---

### `PATCH /api/rides/:id/arrived` *(Driver)*
Mark driver as arrived at pickup.

**Auth:** Bearer token — `driver`

**Response `200`:** Updated ride object (status → `arrived`).

**Side effects:** Emits `ride:driver_arrived` to `passenger:{userId}` socket room.

---

### `PATCH /api/rides/:id/start` *(Driver)*
Start the ride.

**Auth:** Bearer token — `driver`

**Response `200`:** Updated ride object (status → `in_progress`).

**Side effects:** Emits `ride:started` to `passenger:{userId}` socket room.

---

### `PATCH /api/rides/:id/complete` *(Driver)*
Complete the ride.

**Auth:** Bearer token — `driver`

**Response `200`:** Updated ride object with final fare (status → `completed`).

**Side effects:** Emits `ride:completed` to `passenger:{userId}` socket room; deducts fare from wallet if applicable; creates `TRIP_COMPLETED` event.

---

### `PATCH /api/rides/:id/cancel` *(Driver)*
Cancel an accepted ride.

**Auth:** Bearer token — `driver`

**Request body:**
```json
{ "reason": "string" }
```

**Response `200`:** Updated ride object (status → `cancelled`).

**Side effects:** Emits `ride:cancelled` to `passenger:{userId}` socket room.

---

### `GET /api/rides/all` *(Admin)*
List all rides across all users.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `status`, `vehicleType`, `driverId`, `userId`

**Response `200`:** Paginated ride objects.

---

### `POST /api/rides/:id/rate`
Rate a completed ride (passenger rates driver).

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "rating": 5,
  "comment": "Great ride! (optional)"
}
```

**Response `200`:** `{ "ok": true }`

---

## 5. Wallet

### `GET /api/wallet/balance`
Get the authenticated user's wallet balance.

**Auth:** Bearer token — `user`

**Response `200`:**
```json
{
  "balance": 150.00,
  "currency": "EGP"
}
```

---

### `GET /api/wallet/transactions`
Paginated transaction history.

**Auth:** Bearer token — `user`

**Query params:** `page` (default 1), `limit` (default 20)

**Response `200`:** Paginated transaction objects:
```json
{
  "data": [
    {
      "id": 1,
      "type": "credit | debit",
      "amount": 50.00,
      "description": "Wallet top-up",
      "createdAt": "2026-06-03T12:00:00.000Z"
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 20
}
```

---

### `POST /api/wallet/topup`
Add funds to the user's wallet (initiates payment).

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "amount": 100.00,
  "paymentMethod": "card | mobile_money"
}
```

**Response `200`:** `{ "ok": true, "newBalance": 250.00 }`

---

### `GET /api/wallet/admin` *(Admin)*
List all wallets / transaction overview.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `userId`

**Response `200`:** Paginated wallet/transaction objects.

---

## 6. Shuttle / Bus Bookings

> These endpoints deal with pre-scheduled shuttle trips (bus service).

### `GET /api/shuttle/trips`
List available shuttle trips for passengers to book.

**Auth:** None

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `routeId` | int | Filter by route |
| `date` | string (YYYY-MM-DD) | Filter by departure date |
| `page` | int | Default 1 |
| `limit` | int | Default 20 |

**Response `200`:** Paginated trip objects with route and available seat info.

---

### `GET /api/shuttle/trips/:id`
Get a single shuttle trip with full details.

**Auth:** None

**Response `200`:** Trip object including route, bus, driver, and station info.

---

### `POST /api/shuttle/book`
Book seats on a shuttle trip.

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "tripId": 42,
  "seatCount": 2,
  "boardingStationId": 5,
  "alightingStationId": 8,
  "promoCode": "SAVE10 (optional)"
}
```

**Response `201`:** Booking object.

---

### `GET /api/shuttle/bookings`
List the authenticated user's shuttle bookings.

**Auth:** Bearer token — `user`

**Query params:** `page`, `limit`, `status`

**Response `200`:** Paginated booking objects.

---

### `GET /api/shuttle/bookings/:id`
Get a single booking.

**Auth:** Bearer token — `user`

**Response `200`:** Booking object.

---

### `PATCH /api/shuttle/bookings/:id/cancel`
Cancel a shuttle booking.

**Auth:** Bearer token — `user`

**Response `200`:** Updated booking object (status → `cancelled`).

---

### `GET /api/shuttle/routes`
List all shuttle routes (public).

**Auth:** None

**Query params:** `search` (name filter)

**Response `200`:** `{ "data": [...routeObjects], "total": 10 }`

---

## 7. Payments

### `POST /api/payments/initiate`
Initiate a payment session.

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "amount": 100.00,
  "currency": "EGP",
  "type": "wallet_topup | booking | ride",
  "referenceId": 42
}
```

**Response `200`:**
```json
{
  "paymentId": "pay_abc123",
  "redirectUrl": "https://payment-gateway.example.com/...",
  "expiresAt": "2026-06-03T13:00:00.000Z"
}
```

---

### `POST /api/payments/webhook`
Payment gateway webhook callback.

**Auth:** None (verified via gateway signature header)

**Request body:** Gateway-specific payload.

**Response `200`:** `{ "received": true }`

**Side effects:** Updates payment status; credits wallet or activates booking.

---

### `GET /api/payments/:id`
Get payment status.

**Auth:** Bearer token — `user`

**Response `200`:**
```json
{
  "id": "pay_abc123",
  "status": "pending | completed | failed",
  "amount": 100.00,
  "type": "wallet_topup",
  "createdAt": "2026-06-03T12:00:00.000Z"
}
```

---

### `GET /api/payments` *(Admin)*
List all payments.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `status`, `userId`

**Response `200`:** Paginated payment objects.

---

## 8. Notifications

### `GET /api/notifications`
Get the authenticated user's notifications (latest 50).

**Auth:** Bearer token — `user` or `driver`

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Ride confirmed",
      "body": "Your driver is on the way",
      "type": "ride_update",
      "isRead": false,
      "createdAt": "2026-06-03T12:00:00.000Z"
    }
  ]
}
```

---

### `PATCH /api/notifications/:id/read`
Mark a notification as read.

**Auth:** Bearer token — any role

**Response `200`:** Updated notification object.

---

### `PATCH /api/notifications/read-all`
Mark all notifications as read.

**Auth:** Bearer token — any role

**Response `200`:** `{ "ok": true }`

---

### `POST /api/notifications/send` *(Admin)*
Send a push notification to a user.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "userId": 10,
  "title": "string",
  "body": "string",
  "type": "string (optional)"
}
```

**Response `201`:** Notification object.

**Side effects:** Emits `notification:new` to `passenger:{userId}` socket room.

---

## 9. Zones & Zone Pricing

### `GET /api/zones`
List all delivery/ride zones.

**Auth:** None

**Response `200`:** `{ "data": [...zoneObjects] }`

Each zone object:
```json
{
  "id": 1,
  "name": "Zone A",
  "isActive": true,
  "polygon": [[30.0, 31.0], [30.1, 31.0], [30.1, 31.1], [30.0, 31.1]],
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### `POST /api/zones` *(Admin)*
Create a zone.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "name": "string",
  "polygon": "[[lat,lng], ...]",
  "isActive": true
}
```

**Response `201`:** Zone object.

---

### `PATCH /api/zones/:id` *(Admin)*
Update a zone.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated zone object.

---

### `DELETE /api/zones/:id` *(Admin)*
Delete a zone.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

### `GET /api/zone-pricing`
List zone pricing rules.

**Auth:** None

**Response `200`:** `{ "data": [...pricingObjects] }`

Each pricing object:
```json
{
  "id": 1,
  "zoneId": 1,
  "vehicleType": "car | bike",
  "baseFare": 10.00,
  "perKmRate": 2.50,
  "perMinuteRate": 0.50,
  "minimumFare": 15.00,
  "surgePricing": false,
  "surgeMultiplier": 1.0
}
```

---

### `POST /api/zone-pricing` *(Admin)*
Create a pricing rule.

**Auth:** Bearer token — `admin`

**Response `201`:** Pricing object.

---

### `PATCH /api/zone-pricing/:id` *(Admin)*
Update a pricing rule.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated pricing object.

---

### `DELETE /api/zone-pricing/:id` *(Admin)*
Delete a pricing rule.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

## 10. Service Controls

Manage which on-demand services are active.

**Service types:** `shuttle` · `car` · `motorcycle` · `delivery`

### `GET /api/service-controls`
Get the current status of all services.

**Auth:** None

**Response `200`:**
```json
{
  "data": [
    { "id": 1, "service": "car", "isActive": true, "updatedAt": "2026-06-03T00:00:00.000Z" }
  ]
}
```

---

### `PATCH /api/service-controls/:service` *(Admin)*
Enable or disable a service.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{ "isActive": false }
```

**Response `200`:** Updated service control object.

---

## 11. Ratings

### `POST /api/ratings`
Submit a rating (passenger rates driver after a ride/trip).

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "driverId": 10,
  "rideId": 55,
  "rating": 5,
  "comment": "Excellent service"
}
```

**Response `201`:** Rating object.

**Side effects:** Recalculates and updates driver's average rating in `driversTable`.

---

### `GET /api/ratings`
List ratings (own if passenger, received if driver).

**Auth:** Bearer token — `user` or `driver`

**Query params:** `page`, `limit`

**Response `200`:** Paginated rating objects.

---

### `GET /api/ratings/driver/:driverId`
Get all ratings for a specific driver.

**Auth:** Bearer token — `admin`

**Response `200`:** Paginated rating objects.

---

## 12. Support & Chat

### `POST /api/support/tickets`
Open a support ticket.

**Auth:** Bearer token — any role

**Request body:**
```json
{
  "subject": "string",
  "message": "string",
  "type": "general | billing | technical | driver | ride",
  "priority": "low | medium | high (default: medium)"
}
```

**Response `201`:** Ticket object.

---

### `GET /api/support/tickets`
List the authenticated user's support tickets.

**Auth:** Bearer token — any role

**Query params:** `page`, `limit`, `status`

**Response `200`:** Paginated ticket objects.

---

### `GET /api/support/tickets/:id`
Get a ticket with its messages.

**Auth:** Bearer token — any role (own tickets) or `admin`

**Response `200`:**
```json
{
  "id": 1,
  "subject": "Payment issue",
  "status": "open | pending | closed",
  "priority": "medium",
  "type": "billing",
  "messages": [
    { "id": 1, "body": "I was charged twice", "sender": "user", "createdAt": "..." }
  ],
  "createdAt": "..."
}
```

---

### `POST /api/support/tickets/:id/messages`
Add a message to a ticket.

**Auth:** Bearer token — any role (own tickets) or `admin`

**Request body:**
```json
{ "body": "string" }
```

**Response `201`:** Message object.

---

### `PATCH /api/support/tickets/:id` *(Admin)*
Update ticket status or priority.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "status": "open | pending | closed",
  "priority": "low | medium | high"
}
```

**Response `200`:** Updated ticket object.

---

### `GET /api/support/tickets/all` *(Admin)*
List all support tickets.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `status`, `type`, `priority`, `search`

**Response `200`:** Paginated ticket objects with user info.

---

### `GET /api/chat/:ticketId/messages`
Get messages for a support ticket (chat view).

**Auth:** Bearer token — any role (own tickets) or `admin`

**Response `200`:** `{ "data": [...messageObjects] }`

---

### `POST /api/chat/:ticketId/messages`
Send a chat message on a ticket.

**Auth:** Bearer token — any role (own tickets) or `admin`

**Request body:**
```json
{ "body": "string" }
```

**Response `201`:** Message object.

---

## 13. Promo Codes

### `POST /api/promo/validate`
Validate a promo code.

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "code": "SAVE10",
  "amount": 100.00
}
```

**Response `200`:**
```json
{
  "valid": true,
  "discountType": "percentage | fixed",
  "discountValue": 10,
  "discountAmount": 10.00,
  "finalAmount": 90.00
}
```

**Errors:** `400` invalid/expired/usage-limit-exceeded

---

### `GET /api/promo` *(Admin)*
List all promo codes.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `isActive`

**Response `200`:** Paginated promo objects.

---

### `POST /api/promo` *(Admin)*
Create a promo code.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "code": "SAVE10",
  "discountType": "percentage | fixed",
  "discountValue": 10,
  "minOrderAmount": 50.00,
  "maxUses": 100,
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "isActive": true
}
```

**Response `201`:** Promo code object.

---

### `PATCH /api/promo/:id` *(Admin)*
Update a promo code.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated promo object.

---

### `DELETE /api/promo/:id` *(Admin)*
Delete a promo code.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

## 14. Routes & Stations (Shuttle)

### `GET /api/routes`
List all shuttle routes.

**Auth:** None

**Query params:** `search` (name filter, case-insensitive)

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Cairo–Alexandria",
      "fromLocation": "Cairo",
      "toLocation": "Alexandria",
      "basePrice": 75.00,
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### `GET /api/routes/:id`
Get a single route.

**Auth:** None

**Response `200`:** Route object (same shape, `basePrice` as float).

**Errors:** `404` not found

---

### `POST /api/routes` *(Admin)*
Create a route.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "name": "string",
  "fromLocation": "string",
  "toLocation": "string",
  "basePrice": 75.00,
  "isActive": true
}
```

**Response `201`:** Route object.

---

### `PATCH /api/routes/:id` *(Admin)*
Update a route.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated route object.

---

### `DELETE /api/routes/:id` *(Admin)*
Delete a route.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

### `GET /api/routes/:id/stations`
List stations on a route (ordered by `order` field).

**Auth:** None

**Response `200`:**
```json
[
  {
    "id": 1,
    "routeId": 1,
    "name": "Tahrir Square",
    "latitude": 30.0444,
    "longitude": 31.2357,
    "order": 1,
    "direction": "outbound",
    "segmentPrice": 10.00
  }
]
```

---

### `POST /api/routes/:id/stations` *(Admin)*
Add a station to a route.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "name": "string",
  "latitude": 30.0444,
  "longitude": 31.2357,
  "order": 1,
  "direction": "outbound | return (default: outbound)",
  "segmentPrice": 10.00
}
```

**Response `201`:** Station object.

---

### `PATCH /api/routes/:id/stations/:stationId` *(Admin)*
Update a station.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated station object.

---

### `DELETE /api/routes/:id/stations/:stationId` *(Admin)*
Delete a station.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

## 15. Trips (Shuttle)

> Admin-managed scheduled shuttle trips.

### `GET /api/trips` *(Admin)*
List all trips.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `status`, `routeId`, `driverId`, `date`

**Response `200`:** Paginated trip objects.

---

### `GET /api/trips/:id` *(Admin)*
Get a single trip.

**Auth:** Bearer token — `admin`

**Response `200`:** Trip object with route, bus, driver, booking count, and station progress.

---

### `POST /api/trips` *(Admin)*
Create a scheduled trip.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "routeId": 1,
  "busId": 3,
  "driverId": 10,
  "departureTime": "2026-07-01T08:00:00.000Z",
  "arrivalTime": "2026-07-01T12:00:00.000Z",
  "price": 75.00,
  "totalSeats": 45
}
```

**Response `201`:** Trip object. Status defaults to `scheduled` or `waiting_driver` if no driver assigned.

---

### `PATCH /api/trips/:id` *(Admin)*
Update a trip.

**Auth:** Bearer token — `admin`

**Request body (all optional):**
```json
{
  "driverId": 10,
  "busId": 3,
  "departureTime": "2026-07-01T09:00:00.000Z",
  "arrivalTime": "2026-07-01T13:00:00.000Z",
  "status": "scheduled | waiting_driver | driver_assigned | boarding | active | completed | cancelled",
  "price": 80.00,
  "totalSeats": 45,
  "cancelReason": "string"
}
```

**Response `200`:** Updated trip object.

---

### `DELETE /api/trips/:id` *(Admin)*
Delete a trip.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

### `PATCH /api/trips/:id/assign-driver` *(Admin)*
Assign a driver to a trip.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{ "driverId": 10 }
```

**Response `200`:** Updated trip object (status → `driver_assigned`).

**Side effects:** Emits `trip:assigned` to `driver:{driverId}` socket room.

---

### `GET /api/trips/:id/events` *(Admin)*
Get all event history for a trip.

**Auth:** Bearer token — `admin`

**Response `200`:** `{ "data": [...eventObjects] }`

---

### `GET /api/trips/:id/bookings` *(Admin)*
Get bookings for a trip.

**Auth:** Bearer token — `admin`

**Response `200`:** `{ "data": [...bookingObjects] }`

---

## 16. Buses

### `GET /api/buses` *(Admin)*
List all buses.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `isActive`, `search`

**Response `200`:** Paginated bus objects:
```json
{
  "data": [
    {
      "id": 1,
      "plateNumber": "ABC-1234",
      "model": "Mercedes Sprinter",
      "capacity": 45,
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 5
}
```

---

### `GET /api/buses/:id` *(Admin)*
Get a single bus.

**Auth:** Bearer token — `admin`

**Response `200`:** Bus object. **Errors:** `404`

---

### `POST /api/buses` *(Admin)*
Create a bus.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "plateNumber": "string",
  "model": "string",
  "capacity": 45,
  "isActive": true
}
```

**Response `201`:** Bus object.

---

### `PATCH /api/buses/:id` *(Admin)*
Update a bus.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated bus object.

---

### `DELETE /api/buses/:id` *(Admin)*
Delete a bus.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

## 17. Bookings (Shuttle)

### `GET /api/bookings` *(Admin)*
List all shuttle bookings.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `status`, `tripId`, `userId`

**Response `200`:** Paginated booking objects:
```json
{
  "data": [
    {
      "id": 1,
      "tripId": 42,
      "userId": 5,
      "seatCount": 2,
      "totalPrice": 150.00,
      "status": "pending | confirmed | boarded | completed | cancelled | absent",
      "boardingStationId": 3,
      "alightingStationId": 7,
      "promoCode": null,
      "createdAt": "2026-06-03T12:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

### `GET /api/bookings/:id` *(Admin)*
Get a single booking.

**Auth:** Bearer token — `admin`

**Response `200`:** Booking object. **Errors:** `404`

---

### `PATCH /api/bookings/:id` *(Admin)*
Update a booking (e.g., manually change status).

**Auth:** Bearer token — `admin`

**Response `200`:** Updated booking object.

---

### `DELETE /api/bookings/:id` *(Admin)*
Delete a booking.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

## 18. Driver Documents

### `GET /api/driver-documents`
List documents for the authenticated driver (or all documents for admin with query param).

**Auth:** Bearer token — `driver` or `admin`

**Query params:** `driverId` (admin only), `type`, `verificationStatus`

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "driverId": 10,
      "type": "national_id_front",
      "fileUrl": "https://...",
      "verificationStatus": "pending | approved | rejected",
      "rejectionReason": null,
      "uploadedAt": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

**Document types:** `national_id_front` · `national_id_back` · `driving_license_front` · `driving_license_back` · `vehicle_license_front` · `vehicle_license_back` · `vehicle_photo` · `profile_photo` · `trip_selfie` · `criminal_record`

---

### `POST /api/driver-documents/upload/:driverId`
Upload a driver document (file upload).

**Auth:** Bearer token — `driver` or `admin`

**Content-Type:** `multipart/form-data`

**Form fields:**
| Field | Type | Constraints |
|-------|------|-------------|
| `file` | File | Required. JPEG/PNG/WebP only. Max **10 MB**. |
| `type` | string | One of the 10 document types above. |

**Response `201`:**
```json
{
  "id": 1,
  "driverId": 10,
  "type": "national_id_front",
  "fileUrl": "https://supabase-storage-url/...",
  "verificationStatus": "pending",
  "uploadedAt": "2026-06-03T12:00:00.000Z"
}
```

**Errors:** `400` unsupported file type · `400` file too large · `404` driver not found

**Storage:** Supabase Storage bucket. File path: `driver-documents/{driverId}/{type}/{timestamp}.{ext}`

---

### `PATCH /api/driver-documents/:id/verify` *(Admin)*
Approve or reject a document.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "verificationStatus": "approved | rejected",
  "rejectionReason": "string (required if rejected)"
}
```

**Response `200`:** Updated document object.

---

### `DELETE /api/driver-documents/:id`
Delete a document.

**Auth:** Bearer token — `driver` (own) or `admin`

**Response `204`:** No content.

---

## 19. Vehicles

### `GET /api/vehicles`
List vehicles for the authenticated driver.

**Auth:** Bearer token — `driver`

**Response `200`:** `{ "data": [...vehicleObjects] }`

Vehicle object:
```json
{
  "id": 1,
  "driverId": 10,
  "type": "car | bike",
  "make": "Toyota",
  "model": "Corolla",
  "year": 2022,
  "color": "White",
  "plateNumber": "ABC-123",
  "isActive": true
}
```

---

### `POST /api/vehicles`
Add a vehicle.

**Auth:** Bearer token — `driver`

**Request body:**
```json
{
  "type": "car | bike",
  "make": "string",
  "model": "string",
  "year": 2022,
  "color": "string",
  "plateNumber": "string"
}
```

**Response `201`:** Vehicle object.

---

### `PATCH /api/vehicles/:id`
Update a vehicle.

**Auth:** Bearer token — `driver` (own) or `admin`

**Response `200`:** Updated vehicle object.

---

### `DELETE /api/vehicles/:id`
Delete a vehicle.

**Auth:** Bearer token — `driver` (own) or `admin`

**Response `204`:** No content.

---

## 20. Locations

### `GET /api/user/locations`
Get the authenticated user's saved locations.

**Auth:** Bearer token — `user`

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "userId": 5,
      "label": "home | work | other",
      "name": "My Home",
      "address": "123 Main St, Cairo",
      "latitude": 30.0444,
      "longitude": 31.2357,
      "isDefault": true,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 2
}
```

---

### `POST /api/user/locations`
Save a new location.

**Auth:** Bearer token — `user`

**Request body:**
```json
{
  "label": "home | work | other (default: other)",
  "name": "string",
  "address": "string",
  "latitude": 30.0444,
  "longitude": 31.2357,
  "isDefault": false
}
```

**Response `201`:** Location object.

**Note:** If `isDefault: true`, all other locations for this user are set to `isDefault: false` first.

---

### `PATCH /api/user/locations/:id`
Update a saved location.

**Auth:** Bearer token — `user`

**Request body:** Any fields from the create body (all optional).

**Response `200`:** Updated location object. **Errors:** `404`

---

### `DELETE /api/user/locations/:id`
Delete a saved location.

**Auth:** Bearer token — `user`

**Response `204`:** No content. **Errors:** `404`

---

### `GET /api/admin/driver-locations` *(Admin)*
Paginated GPS location history for a driver.

**Auth:** Bearer token — `admin`

**Query params:**
| Param | Type | Required | Default |
|-------|------|----------|---------|
| `driverId` | int | ✓ | — |
| `page` | int | — | 1 |
| `limit` | int | — | 50 (max 200) |

**Response `200`:** Paginated location records ordered by `recordedAt` descending.

---

### `GET /api/admin/driver-locations/:driverId/latest` *(Admin)*
Get the latest GPS location for a driver.

**Auth:** Bearer token — `admin`

**Response `200`:** Single location record. **Errors:** `404`

---

### `GET /api/admin/user-locations` *(Admin)*
Get saved locations for a specific user.

**Auth:** Bearer token — `admin`

**Query params:** `userId` (required, int)

**Response `200`:** `{ "data": [...locationObjects], "total": 3 }`

---

## 21. Route Suggestions

### `POST /api/suggestions`
Submit a route suggestion (public — no auth required).

**Auth:** None

**Request body:**
```json
{
  "type": "new_route | new_station | route_edit",
  "title": "string",
  "description": "string",
  "startLocation": "string (optional)",
  "endLocation": "string (optional)",
  "userId": 5,
  "driverId": 10
}
```

**Response `201`:** Suggestion object.

---

### `GET /api/suggestions` *(Admin)*
List all suggestions with user/driver info.

**Auth:** Bearer token — `admin`

**Query params:**
| Param | Type |
|-------|------|
| `page` | int (default 1) |
| `limit` | int (default 20, max 100) |
| `status` | `pending\|approved\|rejected` |
| `type` | `new_route\|new_station\|route_edit` |
| `search` | string (title filter) |

**Response `200`:** Paginated suggestion objects with embedded `user` and `driver` sub-objects.

---

### `GET /api/suggestions/:id` *(Admin)*
Get a single suggestion.

**Auth:** Bearer token — `admin`

**Response `200`:** Suggestion object. **Errors:** `404`

---

### `PATCH /api/suggestions/:id` *(Admin)*
Update suggestion status or add admin notes.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "status": "pending | approved | rejected",
  "adminNotes": "string (optional)"
}
```

**Response `200`:** Updated suggestion object.

---

## 22. Audit Logs

### `GET /api/audit-logs` *(Admin)*
List admin audit logs.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `action`, `adminId`, `startDate`, `endDate`

**Response `200`:** Paginated audit log objects:
```json
{
  "data": [
    {
      "id": 1,
      "adminId": 2,
      "action": "UPDATE_TRIP",
      "entityType": "trip",
      "entityId": 42,
      "changes": {},
      "createdAt": "2026-06-03T12:00:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

## 23. Staff

### `GET /api/staff` *(Admin)*
List all staff/admin accounts.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `search`

**Response `200`:** Paginated staff objects.

---

### `POST /api/staff` *(Admin)*
Create a staff account.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "role": "admin"
}
```

**Response `201`:** Staff user object.

---

### `PATCH /api/staff/:id` *(Admin)*
Update a staff member.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated staff object.

---

### `DELETE /api/staff/:id` *(Admin)*
Remove a staff member.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

## 24. Earnings (Admin)

### `GET /api/earnings` *(Admin)*
List all driver earnings records.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `driverId`, `status`

**Response `200`:** Paginated earning objects:
```json
{
  "data": [
    {
      "id": 1,
      "driverId": 10,
      "tripId": 42,
      "amount": 48.75,
      "status": "pending | confirmed | paid",
      "date": "2026-06-03"
    }
  ],
  "total": 200
}
```

---

### `GET /api/earnings/summary` *(Admin)*
Earnings summary totals.

**Auth:** Bearer token — `admin`

**Response `200`:**
```json
{
  "totalEarned": 50000.00,
  "totalPaid": 40000.00,
  "totalPending": 10000.00,
  "driverCount": 15
}
```

---

## 25. Drivers (Admin)

### `GET /api/drivers` *(Admin)*
List all driver profiles.

**Auth:** Bearer token — `admin`

**Query params:** `page`, `limit`, `status`, `isOnline`, `isActive`, `search`

**Response `200`:** Paginated driver objects.

---

### `GET /api/drivers/:id` *(Admin)*
Get a single driver profile.

**Auth:** Bearer token — `admin`

**Response `200`:** Driver object. **Errors:** `404`

---

### `PATCH /api/drivers/:id` *(Admin)*
Update a driver profile.

**Auth:** Bearer token — `admin`

**Response `200`:** Updated driver object.

---

### `DELETE /api/drivers/:id` *(Admin)*
Delete a driver profile.

**Auth:** Bearer token — `admin`

**Response `204`:** No content.

---

### `GET /api/drivers/me` *(Deprecated — use `GET /api/driver/me`)*
### `PATCH /api/drivers/me/location` *(Deprecated — use `PATCH /api/driver/location`)*

---

## 26. Admin General

### `GET /api/admin/settings`
Get all application settings.

**Auth:** Bearer token — `admin`

**Response `200`:** `{ "data": [{ "key": "string", "value": "string" }] }`

---

### `PATCH /api/admin/settings`
Update one or more settings keys.

**Auth:** Bearer token — `admin`

**Request body:**
```json
{
  "driver_commission_rate": "0.15",
  "surge_multiplier_max": "3.0"
}
```

**Response `200`:** Updated settings array.

---

### `GET /api/admin/overview`
Platform-wide stats overview.

**Auth:** Bearer token — `admin`

**Response `200`:** Counts of users, drivers, rides, bookings, revenue, etc.

---

## 27. Dashboard (Admin)

### `GET /api/dashboard/summary` *(Admin)*
Complete platform summary with live counts.

**Auth:** Bearer token — `admin`

**Response `200`:**
```json
{
  "routes": { "total": 12, "active": 10, "inactive": 2 },
  "stations": { "total": 80 },
  "trips": {
    "total": 500,
    "active": 3,
    "scheduled": 15,
    "boarding": 1,
    "upcoming": 18,
    "cancelled": 12
  },
  "fleet": {
    "totalBuses": 20,
    "activeBuses": 18,
    "totalDrivers": 35,
    "onlineDrivers": 12
  },
  "support": { "openTickets": 5, "pendingTickets": 3, "totalMessages": 120 },
  "verifications": { "pending": 7 },
  "suggestions": { "pending": 4 },
  "users": { "total": 800, "passengers": 765, "drivers": 35 },
  "generatedAt": "2026-06-03T12:00:00.000Z"
}
```

---

### `GET /api/dashboard/activity` *(Admin)*
Recent platform activity snapshot (up to 8 items each).

**Auth:** Bearer token — `admin`

**Response `200`:**
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

### `GET /api/dashboard/analytics` *(Admin)*
Aggregated analytics for the past 30 days.

**Auth:** Bearer token — `admin`

**Response `200`:**
```json
{
  "tripsPerDay": [{ "date": "2026-06-01", "trips": 12, "completed": 11, "cancelled": 1 }],
  "routePopularity": [{ "id": 1, "name": "Cairo–Alex", "tripCount": 45, "activeCount": 2 }],
  "tripStatusBreakdown": [{ "status": "completed", "count": 300 }],
  "driverActivity": [{ "id": 10, "name": "Ahmed", "tripCount": 22, "rating": 4.8 }],
  "busiestStations": [{ "name": "Tahrir", "routeName": "Cairo–Alex", "tripCount": 45 }],
  "bookingsPerDay": [{ "date": "2026-06-01", "bookings": 35, "revenue": 2625.00 }]
}
```

---

### `GET /api/dashboard/today` *(Admin)*
Today's KPIs vs yesterday, live trip map data.

**Auth:** Bearer token — `admin`

**Response `200`:**
```json
{
  "tripsToday": 8,
  "tripsYesterday": 6,
  "revenueToday": 600.00,
  "revenueYesterday": 450.00,
  "driversOnline": 12,
  "passengersActive": 30,
  "last7DaysTrips": [{ "date": "2026-05-28", "trips": 7 }],
  "last7DaysRevenue": [{ "date": "2026-05-28", "revenue": 525.00 }],
  "activeTrips": [
    {
      "id": 1,
      "status": "active",
      "departureTime": "...",
      "arrivalTime": "...",
      "routeName": "Cairo–Alex",
      "fromLocation": "Cairo",
      "toLocation": "Alexandria",
      "driverName": "Ahmed",
      "latitude": 30.05,
      "longitude": 31.25,
      "driverStatus": "busy"
    }
  ],
  "generatedAt": "2026-06-03T12:00:00.000Z"
}
```

---

## 28. Health Check

### `GET /api/health`
Server liveness probe.

**Auth:** None

**Response `200`:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-03T12:00:00.000Z"
}
```

---

## 29. WebSocket Events

**Connection:** `io("wss://<host>", { path: "/api/socket.io", auth: { token: "<jwt>" } })`

On connect the server resolves the JWT, identifies the user role, and auto-joins rooms.

### Auto-joined Rooms

| Room | Who joins |
|------|-----------|
| `passenger:{userId}` | Authenticated passengers |
| `driver:{userId}` | Authenticated drivers |
| `drivers:available:{vehicleType}` | Online drivers (joined/left when `isOnline` changes) |
| `admin:room` | Admin users |
| `trip:{tripId}` | Joined manually via `trip:join` event |

---

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `trip:join` | `{ tripId: number }` | Join a specific trip room for live updates |
| `trip:leave` | `{ tripId: number }` | Leave a trip room |
| `driver:location` | `{ latitude, longitude, heading?, speed? }` | Push live driver location (drivers only) |
| `ride:accept` | `{ rideId: number }` | Driver accepts a ride (alternative to REST) |
| `ride:update_status` | `{ rideId, status }` | Driver updates ride status |
| `message:send` | `{ ticketId, body }` | Send a support chat message |

---

### Server → Client Events

#### Ride Events (emitted to `passenger:{userId}`)

| Event | Payload |
|-------|---------|
| `ride:new_request` | New ride broadcast to `drivers:available:{type}` |
| `ride:accepted` | `{ rideId, driver: { id, name, phone, location } }` |
| `ride:driver_arrived` | `{ rideId, timestamp }` |
| `ride:started` | `{ rideId, timestamp }` |
| `ride:completed` | `{ rideId, fare, timestamp }` |
| `ride:cancelled` | `{ rideId, reason, timestamp }` |

#### Driver Events

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `ride:new_request` | `drivers:available:{vehicleType}` | Full ride request object |
| `trip:assigned` | `driver:{driverId}` | `{ tripId, trip: {...} }` |
| `driver:location_updated` | `drivers:available:{vehicleType}`, `admin:room` | `{ driverId, latitude, longitude, heading, speed }` |

#### Booking Events

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `booking:boarded` | `passenger:{userId}` | `{ bookingId, tripId, timestamp }` |

#### Trip Events (emitted to `trip:{tripId}`)

| Event | Payload |
|-------|---------|
| `trip:status_changed` | `{ tripId, status, timestamp }` |
| `trip:station_arrived` | `{ tripId, stationId, timestamp }` |
| `trip:station_completed` | `{ tripId, stationId, timestamp }` |

#### Notification Events

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `notification:new` | `passenger:{userId}` | `{ id, title, body, type, createdAt }` |

#### Support / Chat Events

| Event | Emitted To | Payload |
|-------|-----------|---------|
| `message:new` | `ticket:{ticketId}` room | `{ id, ticketId, body, sender, createdAt }` |

---

## 30. Push Notifications

Push notifications are delivered in two ways:

1. **In-app (Socket.IO):** `notification:new` event emitted to `passenger:{userId}` room whenever `POST /api/notifications/send` is called or an automatic trigger fires (e.g., ride accepted, booking confirmed).

2. **Push notification record:** A row is persisted in the `notifications` table so it appears in `GET /api/notifications` / `GET /api/driver/notifications` even when the client was offline.

**Automatic notification triggers:**

| Trigger | Recipient | Title |
|---------|-----------|-------|
| Ride accepted by driver | Passenger | "Driver on the way" |
| Driver arrived at pickup | Passenger | "Driver has arrived" |
| Ride started | Passenger | "Your ride has started" |
| Ride completed | Passenger | "Ride completed" |
| Booking boarded | Passenger | "You're on board!" |
| Trip assigned to driver | Driver | "New trip assigned" |
| Admin manual send | Any user | Custom title |

---

## 31. Deprecated Aliases

The following routes still work but are deprecated. Use the recommended replacements.

| Deprecated | Recommended |
|-----------|-------------|
| `GET /api/auth/me` | `GET /api/users/me` |
| `GET /api/drivers/me` | `GET /api/driver/me` |
| `PATCH /api/drivers/me/location` | `PATCH /api/driver/location` |

---

*Last updated: 2026-06-03. Reflects actual implemented code in `artifacts/api-server/src/`.*
