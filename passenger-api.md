# Passenger Mobile App — Server API Reference

> All endpoints verified directly against server source code.  
> Base URL: your `EXPO_PUBLIC_API_URL` env var **must end with `/api`**  
> Example: `https://your-server.replit.app/api`

---

## Authentication

Every protected request must include:

```
Authorization: Bearer <accessToken>
```

The `accessToken` is returned by login and register. It expires; use `POST /auth/refresh` to renew it silently.

---

## 1. Auth

### Register
```
POST /auth/register
```
**Body**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "password": "string (min 6 chars)"
}
```
**Response 201**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": {
    "id": 1,
    "name": "string",
    "email": "string",
    "phone": "string",
    "role": "user",
    "walletBalance": 0,
    "isVerified": false,
    "isBlocked": false,
    "createdAt": "ISO8601"
  }
}
```

---

### Login
```
POST /auth/login
```
**Body** — send either `email` or `credential`; both are accepted
```json
{
  "email": "string",
  "password": "string"
}
```
**Response 200** — same shape as register response

> ⚠️ The token key is `accessToken`, **not** `token`. Store it as `data.accessToken`.

---

### Refresh Token
```
POST /auth/refresh
```
**Body**
```json
{ "refreshToken": "string" }
```
**Response 200**
```json
{
  "accessToken": "string",
  "refreshToken": "string"
}
```
Call this when any request returns `401`. On success update stored tokens; on failure redirect to login.

---

### Logout
```
POST /auth/logout
```
**Body**
```json
{ "refreshToken": "string" }
```
**Response 200** `{ "ok": true }`

---

### Send OTP (phone verification)
```
POST /auth/send-otp
```
**Body** `{ "phone": "string" }`  
**Response 200** `{ "success": true, "message": "string" }`

---

### Verify OTP
```
POST /auth/verify-otp
```
**Body**
```json
{ "phone": "string", "otp": "string" }
```
**Response 200** — same shape as login response (returns tokens + user)

---

### Forgot Password
```
POST /auth/forgot-password
```
**Body** `{ "phone": "string" }`  
**Response 200** `{ "success": true, "message": "string" }`

---

### Reset Password
```
POST /auth/reset-password
```
**Body**
```json
{ "token": "string", "password": "string" }
```
**Response 200** `{ "success": true, "message": "string" }`

---

## 2. User Profile

### Get My Profile
```
GET /users/me
```
**Response 200**
```json
{
  "id": 1,
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "user",
  "avatarUrl": "string | null",
  "walletBalance": 0.00,
  "isVerified": false,
  "isBlocked": false,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

### Update My Profile
```
PATCH /users/me
```
**Body** — all fields optional
```json
{
  "name": "string",
  "phone": "string",
  "avatarUrl": "string"
}
```
> Only these three fields are accepted. Sending `email` or `dob` has no effect.

**Response 200** — updated profile (same shape as GET /users/me)

---

### Register Push Notification Token
```
POST /users/me/push-token
```
**Body**
```json
{
  "token": "string",
  "platform": "ios | android | web"
}
```
**Response 200** `{ "success": true, "message": "Push token registered" }`

---

## 3. Wallet

### Get Balance
```
GET /wallet
```
**Response 200**
```json
{ "userId": 1, "balance": 250.00 }
```

---

### Top Up Wallet
```
POST /wallet/topup
```
**Body**
```json
{ "amount": 100 }
```
**Response 200**
```json
{
  "transaction": {
    "id": 1,
    "userId": 1,
    "amount": 100.00,
    "type": "deposit",
    "description": "Wallet top-up — 100 EGP",
    "createdAt": "ISO8601"
  },
  "balance": 350.00
}
```

---

### Get Transaction History
```
GET /wallet/transactions?page=1&limit=20
```
**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "amount": 100.00,
      "type": "deposit | payment | refund",
      "description": "string",
      "createdAt": "ISO8601"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

## 4. Car Ride

### Request a Ride
```
POST /rides/request
```
Requires role `user`. Backend deducts fare from wallet on completion.

**Body** — all fields are flat (no nested objects)
```json
{
  "vehicleType": "car | bike",
  "pickupLatitude": 30.0444,
  "pickupLongitude": 31.2357,
  "pickupAddress": "string",
  "dropoffLatitude": 30.0626,
  "dropoffLongitude": 31.2497,
  "dropoffAddress": "string"
}
```
**Response 201**
```json
{
  "id": 1,
  "passengerId": 1,
  "vehicleType": "car",
  "status": "searching",
  "pickupAddress": "string",
  "dropoffAddress": "string",
  "pickupLatitude": 30.0444,
  "pickupLongitude": 31.2357,
  "dropoffLatitude": 30.0626,
  "dropoffLongitude": 31.2497,
  "distanceKm": "5.200",
  "estimatedDurationMinutes": 10,
  "estimatedPrice": "45.00",
  "createdAt": "ISO8601"
}
```
**Response 402** if wallet balance is insufficient:
```json
{
  "error": "Insufficient wallet balance",
  "required": 45.00,
  "balance": 20.00
}
```

---

### Get Ride Status
```
GET /rides/:id
```
**Response 200** — ride object with current status and driver details if assigned

---

### Cancel Ride
```
PATCH /rides/:id/cancel
```
**Body** (optional)
```json
{ "reason": "string" }
```
**Response 200** — updated ride object with `status: "cancelled"`

---

### Ride Status Values (actual backend values)

| Status | Meaning |
|--------|---------|
| `searching` | Looking for a driver |
| `driver_assigned` | Driver accepted, on the way |
| `driver_arrived` | Driver is at pickup location |
| `active` | Trip in progress |
| `completed` | Trip finished, fare charged |
| `cancelled` | Cancelled by passenger or system |

> Use these exact strings for status comparisons in your TypeScript types.

---

## 5. Shuttle

### List All Routes
```
GET /shuttle/lines
```
No auth required.

**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "name": "string",
      "origin": "string",
      "destination": "string",
      "price": "25.00",
      "isActive": true,
      "stationCount": 5,
      "scheduledTrips": 3,
      "activeTrips": 1
    }
  ],
  "total": 10
}
```

---

### Get Single Route
```
GET /shuttle/lines/:id
```
No auth required.

**Response 200**
```json
{
  "id": 1,
  "name": "string",
  "origin": "string",
  "destination": "string",
  "price": "25.00",
  "isActive": true,
  "stations": [...],
  "activeTrips": [...],
  "stationCount": 5
}
```

---

### Get My Shuttle Bookings
```
GET /users/me/bookings
```
**Response 200** — array of booking objects
```json
[
  {
    "id": 1,
    "userId": 1,
    "tripId": 5,
    "seatCount": 2,
    "totalPrice": 50.00,
    "status": "confirmed | pending | cancelled",
    "paymentStatus": "paid | unpaid | refunded",
    "promoCodeId": null,
    "createdAt": "ISO8601",
    "trip": {
      "id": 5,
      "routeId": 1,
      "departureTime": "ISO8601",
      "arrivalTime": "ISO8601",
      "price": 25.00,
      "status": "scheduled | active | completed | cancelled"
    }
  }
]
```

---

## 6. Promotions

### List Available Promos
```
GET /promo
```
Any authenticated user can call this (not admin-only).

**Response 200** — array of promo objects
```json
[
  {
    "id": 1,
    "code": "SAVE20",
    "discountType": "percentage | fixed",
    "discountValue": "20.00",
    "maxUses": 100,
    "usedCount": 45,
    "expiresAt": "ISO8601",
    "isActive": true
  }
]
```

---

### Validate a Promo Code
```
POST /promo/validate
```
**Body**
```json
{ "code": "SAVE20" }
```
**Response 200** — the promo object if valid, or 404 if not found / expired

---

## 7. Trip Chat (Shuttle)

### Get Chat History
```
GET /trips/:id/chat
```
**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "tripId": 5,
      "senderId": 1,
      "senderType": "passenger | driver | admin",
      "message": "string",
      "isRead": false,
      "createdAt": "ISO8601"
    }
  ],
  "total": 12
}
```

---

### Send a Chat Message
```
POST /trips/:id/chat
```
**Body**
```json
{ "message": "string (max 2000 chars)" }
```
**Response 201** — the created message object

---

## 8. Notifications

### Get My Notifications
```
GET /notifications?page=1&limit=20
```
**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "title": "string",
      "body": "string",
      "type": "string",
      "isRead": false,
      "createdAt": "ISO8601"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### Mark One Notification as Read
```
PATCH /notifications/:id/read
```
**Response 200** — updated notification object

---

### Mark All Notifications as Read
```
PATCH /notifications/read-all
```
**Response 200** `{ "ok": true }`

---

## 9. Support

### Submit a Support Ticket
```
POST /support/tickets
```
No auth required.

**Body**
```json
{
  "subject": "string (required)",
  "message": "string (required)",
  "type": "passenger | driver",
  "priority": "low | medium | high"
}
```
`type` defaults to `"passenger"`. `priority` defaults to `"medium"`.

**Response 201** — the created ticket object

---

## 10. Service Controls

### Get Service Availability
```
GET /services/control
```
Returns the live on/off status and display config for all services.

**Response 200**
```json
{
  "data": [
    {
      "serviceType": "car | bike | shuttle",
      "isEnabled": true,
      "displayMode": "normal | maintenance | disabled",
      "unavailableMessage": "string | null",
      "unavailableAction": "string | null",
      "activeZoneIds": [1, 2],
      "maintenanceEta": "ISO8601 | null"
    }
  ]
}
```

> ⚠️ All keys are **camelCase**. Do not use snake_case when reading these fields.

---

---

## Socket.IO

### Connection
```
const socket = io(BASE_URL, {
  path: "/api/socket.io",
  auth: { token: accessToken },
});
```
- `BASE_URL` is the root server URL **without** `/api`  
- Reconnect with a fresh `accessToken` after token refresh  
- The server auto-joins the passenger to room `passenger:{userId}` on connect

---

### Client → Server Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `join` | `room: string` | Acknowledge readiness (sends back `{ ok: true }`) |
| `passenger:join:trip` | `tripId: number` | Subscribe to live tracking for a shuttle trip |

---

### Server → Passenger Events

#### Ride Events

| Event | Payload | When |
|-------|---------|------|
| `ride:driver_assigned` | `{ rideId, driverId, driverName, driver: { name, phone, vehicle, rating }, eta }` | Driver accepted the ride |
| `ride:driver_arrived` | `{ rideId, ... }` | Driver reached pickup |
| `ride:arrived` | `{ rideId, ... }` | Same moment as above (compatibility alias — listen for this one) |
| `ride:started` | `{ rideId, ... }` | Trip began |
| `ride:completed` | `{ rideId, ... }` | Trip finished, fare charged |
| `ride:cancelled` | `{ rideId, reason }` | Ride was cancelled |
| `ride:driver_location` | `{ rideId, location: { latitude, longitude }, timestamp }` | Driver position update during ride |

#### Shuttle / Trip Events

| Event | Payload | When |
|-------|---------|------|
| `trip:chat:message` | `{ id, tripId, senderId, senderType, message, isRead, createdAt }` | New chat message in a trip |

> ⚠️ The chat event name uses **colons** throughout: `trip:chat:message` — not `trip:chat-message`.

#### Service Events

| Event | Payload | When |
|-------|---------|------|
| `service:control:changed` | `{ serviceType, isEnabled, displayMode, unavailableMessage, unavailableAction, activeZoneIds, maintenanceEta }` | Admin toggled a service on/off |

#### Notification Events

| Event | Payload | When |
|-------|---------|------|
| `notification:new` | `{ id, category: "general", title, body, time }` | New push notification sent to this user |

---

## Error Responses

All errors follow this shape:
```json
{ "error": "Human-readable message" }
```

| Code | Meaning |
|------|---------|
| `400` | Validation failed — check the `error` field for details |
| `401` | Token missing or expired — refresh and retry |
| `402` | Insufficient wallet balance (ride request only) |
| `403` | Action not permitted for your role |
| `404` | Resource not found |
| `500` | Server error |

---

## Quick Setup Checklist

- [ ] Set `EXPO_PUBLIC_API_URL` to `https://your-server.replit.app/api` (must end with `/api`)
- [ ] Store `accessToken` and `refreshToken` from login/register response
- [ ] Add a request interceptor: on `401` → call `POST /auth/refresh` → retry with new token → on refresh failure → logout
- [ ] Socket path is `/api/socket.io` — pass this explicitly, it is not the default
- [ ] Socket `BASE_URL` is the server root **without** `/api`
- [ ] All service control fields are camelCase (`isEnabled`, not `is_enabled`)
- [ ] Ride status strings: `searching`, `driver_assigned`, `driver_arrived`, `active`, `completed`, `cancelled`
- [ ] Chat socket event: `trip:chat:message` (colons, not hyphen)
