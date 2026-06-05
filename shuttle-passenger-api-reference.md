# Shuttle Passenger App — API Reference

**Purpose:** Replace all mock/hardcoded data in the passenger app's Scheduled Trips view (and related flows) with real API calls.  
**Base URL:** All REST endpoints are prefixed with `/api` (e.g., `https://<your-domain>/api/trips`).  
**Timestamps:** All `departureTime` / `arrivalTime` values are stored and returned in **UTC**. Display them in UTC to match what the scheduler entered (do **not** convert to local time).  
**Auth header:** `Authorization: Bearer <accessToken>` (obtained from login/register).

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Routes (Shuttle Lines)](#2-routes-shuttle-lines)
3. [Trips (Scheduled Departures)](#3-trips-scheduled-departures)
4. [Bookings](#4-bookings)
5. [Wallet](#5-wallet)
6. [User Profile](#6-user-profile)
7. [Real-Time (Socket.IO)](#7-real-time-socketio)
8. [Pagination Convention](#8-pagination-convention)
9. [Error Format](#9-error-format)
10. [Key Notes for the Passenger App](#10-key-notes-for-the-passenger-app)

---

## 1. Authentication

### POST `/auth/register`
Create a new passenger account.

**Auth required:** No

**Request body:**
```json
{
  "name": "string",
  "email": "string (email)",
  "phone": "string",
  "password": "string (min 6 chars)"
}
```

**Response `201`:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": {
    "id": 1,
    "name": "Ahmed Ali",
    "email": "ahmed@example.com",
    "phone": "+201012345678",
    "role": "user",
    "walletBalance": 0.0,
    "isVerified": false,
    "isBlocked": false,
    "createdAt": "2026-06-07T09:00:00.000Z"
  }
}
```

---

### POST `/auth/login`
Log in with email or phone + password.

**Auth required:** No

**Request body:**
```json
{
  "credential": "string (email or phone)",
  "password": "string"
}
```
> `email` field is also accepted as an alias for `credential`.

**Response `200`:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": { "...same shape as register..." }
}
```

---

### POST `/auth/refresh`
Get a new access token using a refresh token.

**Auth required:** No

**Request body:**
```json
{ "refreshToken": "string" }
```

**Response `200`:**
```json
{ "accessToken": "string", "refreshToken": "string" }
```

---

### POST `/auth/logout`
Invalidate the current refresh token.

**Auth required:** Yes (Bearer token)

**Request body:**
```json
{ "refreshToken": "string" }
```

**Response `200`:**
```json
{ "ok": true }
```

---

## 2. Routes (Shuttle Lines)

### GET `/shuttle/lines`
List all **active** shuttle routes, with station counts and trip availability.  
**This is the primary endpoint for the "Browse Lines" screen.**

**Auth required:** No

**Query params:** None

**Response `200`:**
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
      "totalTrips": 9,
      "scheduledTrips": 5,
      "activeTrips": 0,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 1
}
```

---

### GET `/shuttle/lines/:id`
Get full detail for a single shuttle line, including all stops and upcoming trips.  
**Use this to render the route detail / trip list screen.**

**Auth required:** No

**URL params:** `id` — route ID (integer)

**Response `200`:**
```json
{
  "data": {
    "id": 4,
    "name": "Ain Shams → El Maadi #1",
    "fromLocation": "...",
    "toLocation": "...",
    "estimatedDuration": 57,
    "basePrice": 25.0,
    "isActive": true,
    "stationCount": 6,
    "stations": [
      {
        "id": 1,
        "routeId": 4,
        "name": "Mazlaqan Ain Shams",
        "latitude": 30.123,
        "longitude": 31.456,
        "order": 1,
        "direction": "outbound",
        "segmentPrice": null
      }
    ],
    "activeTrips": [
      {
        "id": 101,
        "status": "waiting_driver",
        "departureTime": "2026-06-07T09:00:00.000Z",
        "arrivalTime": "2026-06-07T09:57:00.000Z",
        "availableSeats": 14,
        "totalSeats": 14,
        "driverId": null
      }
    ]
  }
}
```

> `activeTrips` returns the next **10** upcoming trips with status in: `waiting_driver`, `scheduled`, `active`, `boarding`, `driver_assigned`.

---

### GET `/routes`
List all routes (including inactive). Supports search.

**Auth required:** No

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Filter by route name (partial match) |

**Response `200`:**
```json
{
  "data": [ { "id": 4, "name": "...", "basePrice": 25.0, "isActive": true, "..." } ],
  "total": 1
}
```

---

### GET `/routes/:id/stations`
Get all stops for a route, ordered by sequence.

**Auth required:** No

**Response `200`:** Array of station objects (same shape as inside `shuttle/lines/:id`).

---

## 3. Trips (Scheduled Departures)

### GET `/trips`
List trips with optional filters. **Use this to populate the "Scheduled Trips" list.**

**Auth required:** No

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `routeId` | integer | Filter by route |
| `status` | string | Filter by status (see values below) |
| `date` | string | Filter by date `YYYY-MM-DD` (matches `departureTime` date in UTC) |
| `page` | integer | Page number (default: `1`) |
| `limit` | integer | Results per page (default: `20`) |

**Trip status values:**
- `waiting_driver` — generated from schedule, no driver yet
- `scheduled` — driver assigned via booking
- `driver_assigned` — admin-assigned driver
- `boarding` — passengers boarding now
- `active` — trip is in progress
- `completed` — trip finished
- `cancelled` — trip cancelled

**Response `200`:**
```json
{
  "data": [
    {
      "id": 101,
      "routeId": 4,
      "scheduleId": 2,
      "busId": null,
      "driverId": null,
      "departureTime": "2026-06-07T09:00:00.000Z",
      "arrivalTime": "2026-06-07T09:57:00.000Z",
      "availableSeats": 14,
      "totalSeats": 14,
      "price": 25.0,
      "status": "waiting_driver",
      "isActive": true,
      "recurringType": "weekly",
      "weekdays": "0,1,2,3,4",
      "createdAt": "..."
    }
  ],
  "total": 9,
  "page": 1,
  "limit": 20
}
```

> ⚠️ **Pagination:** Default limit is 20. Pass `page` and `limit` to paginate. `total` is the unfiltered count.

---

### GET `/trips/:id`
Get full details of a single trip.

**Auth required:** No

**Response `200`:** Single trip object (same shape as above).

---

## 4. Bookings

### POST `/bookings`
Book a seat on a trip. Deducts the fare from the passenger's wallet atomically.

**Auth required:** Yes (`role: user`)

**Request body:**
```json
{
  "tripId": 101,
  "seatCount": 1,
  "promoCode": "SAVE10"
}
```
> `promoCode` is optional.

**Business rules enforced:**
- Trip must be in `scheduled` or `active` status.
- Sufficient available seats required.
- Wallet balance must cover the total fare.
- Seat decrement and wallet deduction are done in a single DB transaction (safe against race conditions).

**Response `201`:**
```json
{
  "id": 55,
  "userId": 12,
  "tripId": 101,
  "seatCount": 1,
  "totalPrice": 25.0,
  "status": "confirmed",
  "paymentStatus": "paid",
  "promoCodeId": null,
  "createdAt": "2026-06-07T08:30:00.000Z"
}
```

**Error responses:**
| Status | Reason |
|--------|--------|
| `400` | Trip not available / not enough seats |
| `400` | Insufficient wallet balance (includes amounts in message) |
| `409` | Seat reservation race condition — retry |
| `404` | Trip not found |

---

### GET `/bookings/:id`
Get details of a specific booking. Passengers can only see their own bookings.

**Auth required:** Yes

**Response `200`:** Single booking object (same shape as above).

---

### PATCH `/bookings/:id/cancel`
Cancel a booking. Automatically refunds the wallet if the booking was paid.

**Auth required:** Yes (own booking, or admin)

**Request body:** None

**Response `200`:**
```json
{
  "id": 55,
  "status": "cancelled",
  "paymentStatus": "refunded",
  "..."
}
```

> Refund is processed inside the same DB transaction — wallet balance is updated atomically.

---

### GET `/bookings` *(admin only)*
List all bookings with filters. **Not accessible to passengers.**

---

## 5. Wallet

### GET `/wallet`
Get the authenticated user's current wallet balance.

**Auth required:** Yes

**Response `200`:**
```json
{ "userId": 12, "balance": 250.0 }
```

---

### POST `/wallet/topup`
Top up the wallet balance.

**Auth required:** Yes

**Request body:**
```json
{ "amount": 100.0 }
```

**Response `200`:**
```json
{
  "transaction": {
    "id": 7,
    "userId": 12,
    "amount": 100.0,
    "type": "deposit",
    "description": "Wallet top-up — 100 EGP",
    "createdAt": "..."
  },
  "balance": 350.0
}
```

---

### GET `/wallet/transactions`
List the authenticated user's wallet transaction history.

**Auth required:** Yes

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | integer | Page number (default: `1`) |
| `limit` | integer | Per page (default: `20`) |

**Response `200`:**
```json
{
  "data": [
    {
      "id": 7,
      "amount": 100.0,
      "type": "deposit",
      "description": "Wallet top-up — 100 EGP",
      "createdAt": "..."
    },
    {
      "id": 8,
      "amount": -25.0,
      "type": "payment",
      "description": "Booking #55 — trip #101 (1 seat)",
      "createdAt": "..."
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 20
}
```

**Transaction types:** `deposit`, `payment`, `refund`

---

## 6. User Profile

### GET `/auth/me`
Get the authenticated user's profile.

**Auth required:** Yes

**Response `200`:** User object (same shape as login response `user`).

---

### PATCH `/auth/me`
Update profile fields (name, phone, etc.).

**Auth required:** Yes

**Request body:** Any subset of updatable fields (name, phone, etc.)

---

## 7. Real-Time (Socket.IO)

**Connection URL:** `wss://<your-domain>` (same host, Socket.IO path)

**Auth:** Pass the access token in the handshake:
```javascript
const socket = io("wss://<your-domain>", {
  auth: { token: "<accessToken>" }
});
```

---

### Client → Server Events

#### `passenger:join:trip`
Subscribe to live updates for a specific trip (tracking, boarding status).

```javascript
socket.emit("passenger:join:trip", tripId); // tripId: number
```

> Call this after booking a trip to receive real-time updates.

---

### Server → Client Events (Passenger-relevant)

#### `passenger:trip:tracking`
Fired when a trip the passenger is subscribed to has a progress update (e.g., bus reached a stop).

```javascript
socket.on("passenger:trip:tracking", (data) => {
  // data: { tripId, stationId, stationName, status, arrivedAt }
});
```

#### `booking:boarded`
Fired when a passenger's booking is marked as boarded.

```javascript
socket.on("booking:boarded", (data) => {
  // data: { bookingId, userId, tripId }
});
```

#### `notification:new`
General push notification event. Displayed as an in-app alert.

```javascript
socket.on("notification:new", (notification) => {
  // data: { id, title, body, type, createdAt }
});
```

#### `service:control:changed`
Broadcast when the admin toggles service availability (e.g., service paused).

```javascript
socket.on("service:control:changed", (data) => {
  // data: { serviceEnabled: boolean, message?: string }
});
```

---

## 8. Pagination Convention

All list endpoints that support pagination return:

```json
{
  "data": [...],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

- `total` — total matching records (use for building page count UI)
- `page` — current page (1-indexed)
- `limit` — records per page

To fetch the next page, increment `page`. To change page size, pass `limit` (max allowed by the server is generally `100`).

---

## 9. Error Format

All errors follow this shape:

```json
{ "error": "Human-readable error message" }
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Validation error or business rule violation |
| `401` | Missing or invalid auth token |
| `403` | Forbidden (wrong role) |
| `404` | Resource not found |
| `409` | Conflict (e.g., seat race condition — safe to retry) |
| `429` | Rate limited |
| `500` | Internal server error |

---

## 10. Key Notes for the Passenger App

### Replacing Mock Data — Recommended Call Order

**On app launch / home screen:**
1. `GET /shuttle/lines` → populate the list of available routes

**On tapping a route:**
2. `GET /shuttle/lines/:id` → get route detail + first 10 upcoming trips + stops

**For full trip list with filters (date picker, status):**
3. `GET /trips?routeId=<id>&date=YYYY-MM-DD&status=waiting_driver` → paginated trip list

**On tapping "Book" for a trip:**
4. `GET /wallet` → confirm user has sufficient balance (show balance in UI)
5. `POST /bookings` → create booking (fare is deducted atomically)

**On booking confirmation screen:**
6. Connect Socket.IO and `emit("passenger:join:trip", tripId)` → subscribe to live updates

**Wallet top-up flow:**
7. `POST /wallet/topup` → add funds, then retry booking

---

### Important Implementation Notes

| Topic | Note |
|-------|------|
| **Timestamps** | All times are stored and returned in **UTC**. Display times using UTC formatting (e.g., `toLocaleTimeString([], { timeZone: 'UTC' })`). Do NOT let the browser apply a local timezone offset. |
| **Trip availability** | Only trips with status `waiting_driver`, `scheduled`, `driver_assigned`, or `boarding` can be booked. Filter the list accordingly — `active` and `completed` trips should show as read-only. |
| **Seat count** | `availableSeats` is the live count. Always re-fetch before booking. A `409` response means the seat was taken between fetch and booking — show a "Seats just filled up, please try again" message. |
| **Wallet required** | There is no card/cash payment. The wallet **must** have sufficient funds before booking. Show the balance prominently and deep-link to the top-up screen if balance is low. |
| **No public booking list** | Passengers cannot `GET /bookings` — that is admin-only. To show "My Trips", maintain a local list of booking IDs from `POST /bookings` responses, then call `GET /bookings/:id` for each, or store them in local state. |
| **Recurring trips** | Trips generated from a weekly schedule have `recurringType: "weekly"` and `weekdays: "0,1,2,3,4"` (Sun–Thu). The `scheduleId` field links a trip back to its schedule. |
| **Socket auth** | The same `accessToken` from login is used for Socket.IO. On token refresh, reconnect the socket with the new token. |
| **Promo codes** | Pass `promoCode` in the booking body. The server validates and applies the discount automatically. |

---

*Generated: 2026-06-05 | Source: `artifacts/api-server/src/routes/`*
