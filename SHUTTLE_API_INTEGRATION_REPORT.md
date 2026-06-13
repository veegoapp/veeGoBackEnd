# Shuttle Service API Integration Report

**Platform:** VeeGo  
**Report Date:** June 13, 2026  
**Audience:** Frontend developers building the React Native passenger application  
**Base URL:** All paths are relative to `/api`. In production: `https://<domain>/api`

---

## Table of Contents

1. [Authentication Overview](#1-authentication-overview)
2. [Data Models & DTOs](#2-data-models--dtos)
3. [Localization Fields (Arabic / English)](#3-localization-fields-arabic--english)
4. [Vehicle Types & Capacity Constants](#4-vehicle-types--capacity-constants)
5. [Shuttle Lines](#5-shuttle-lines)
6. [Routes](#6-routes)
7. [Stations](#7-stations)
8. [Buses](#8-buses)
9. [Schedules](#9-schedules)
10. [Trips](#10-trips)
11. [Bookings (Reservations & Ticketing)](#11-bookings-reservations--ticketing)
12. [Seat Selection Notes](#12-seat-selection-notes)
13. [Passenger-Specific Shuttle APIs](#13-passenger-specific-shuttle-apis)
14. [Driver-Specific Shuttle APIs](#14-driver-specific-shuttle-apis)
15. [Admin Shuttle APIs](#15-admin-shuttle-apis)
16. [Real-Time Events (Socket.IO)](#16-real-time-events-socketio)
17. [Trip Status State Machine](#17-trip-status-state-machine)
18. [Booking Status State Machine](#18-booking-status-state-machine)
19. [Cancellation & Refund Policy](#19-cancellation--refund-policy)
20. [Deprecated Endpoints & Replacements](#20-deprecated-endpoints--replacements)
21. [Backend Changes Not Yet Reflected in Frontend](#21-backend-changes-not-yet-reflected-in-frontend)
22. [Complete Endpoint Index](#22-complete-endpoint-index)

---

## 1. Authentication Overview

All protected endpoints require a JWT Bearer token in the `Authorization` header.

```
Authorization: Bearer <access_token>
```

**Obtain tokens:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Passenger / driver login — returns `accessToken` |
| `POST` | `/auth/admin/login` | Admin login — returns `accessToken` with `role: "admin"` |

**Roles:**
| Role | Description |
|------|-------------|
| `user` | Passenger (books seats, cancels, views bookings) |
| `driver` | Shuttle driver (accepts/rejects trips, boards passengers) |
| `admin` | Operations staff (full CRUD on all entities) |

**Rate limits:**
- Auth endpoints: 20 req / 15 min  
- All API endpoints: 200 req / 15 min  
- `POST /rides/request`: 3 req / 2 min per user  

**Security notation in this document:**
- 🔓 = Public (no auth required)
- 🔐 = Any authenticated user
- 👤 = `role: user` (passenger) only
- 🚌 = `role: driver` only
- 🔑 = `role: admin` only

---

## 2. Data Models & DTOs

### 2.1 Route

```typescript
interface Route {
  id: number;
  name: string;              // English
  nameAr: string | null;     // Arabic
  fromLocation: string;      // English departure city/area
  fromLocationAr: string | null; // Arabic
  toLocation: string;        // English destination
  toLocationAr: string | null;   // Arabic
  estimatedDuration: number; // minutes
  basePrice: number;         // EGP (float, already parsed from DB numeric)
  isActive: boolean;
  stationCount: number;      // computed, included in list responses
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
}
```

### 2.2 Station

```typescript
interface Station {
  id: number;
  routeId: number;
  name: string;              // English
  nameAr: string | null;     // Arabic
  latitude: number;
  longitude: number;
  order: number;             // ascending, 1-based
  direction: "outbound" | "return";
  segmentPrice: number | null; // EGP, partial-route pricing
  createdAt: string;         // ISO 8601
}
```

### 2.3 Trip

```typescript
interface Trip {
  id: number;
  routeId: number;
  scheduleId: number | null;
  busId: number | null;
  driverId: number | null;
  departureTime: string;     // ISO 8601 UTC
  arrivalTime: string;       // ISO 8601 UTC
  availableSeats: number;
  totalSeats: number;
  price: number;             // EGP (float)
  status: TripStatus;
  isActive: boolean;
  recurringType: "one_time" | "daily" | "weekdays" | "weekends" | "custom";
  weekdays: string | null;
  vehicleType: "hiace" | "minibus";
  cancelReason: string | null;
  acceptedAt: string | null; // ISO 8601 UTC
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type TripStatus =
  | "scheduled"       // created, waiting for enough bookings
  | "waiting_driver"  // min seats reached, no driver assigned yet
  | "driver_assigned" // driver accepted
  | "boarding"        // driver at first station
  | "active"          // trip in progress
  | "completed"       // trip finished
  | "cancelled";      // cancelled by driver or admin
```

### 2.4 Booking

```typescript
interface Booking {
  id: number;
  userId: number;
  tripId: number;
  seatCount: number;          // always 1 for shuttle bookings
  totalPrice: number;         // EGP (float, after promo if any)
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  promoCodeId: number | null;
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
}

type BookingStatus =
  | "pending"    // booked, trip not yet active (waiting for min seat threshold)
  | "confirmed"  // trip is active, booking confirmed
  | "boarded"    // passenger scanned/boarded by driver
  | "absent"     // no-show — passenger did not board
  | "completed"  // trip completed
  | "cancelled"; // booking was cancelled

type PaymentStatus = "pending" | "paid" | "refunded";
```

### 2.5 Bus

```typescript
interface Bus {
  id: number;
  plateNumber: string;
  capacity: number;
  model: string;
  vehicleTypeId: number | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 2.6 RouteSchedule

```typescript
interface RouteSchedule {
  id: number;
  routeId: number;
  routeName: string;       // joined from routes table
  fromLocation: string;
  toLocation: string;
  effectiveFrom: string;   // YYYY-MM-DD (Cairo local date)
  effectiveTo: string;     // YYYY-MM-DD (Cairo local date)
  vehicleType: "hiace" | "minibus";
  defaultCapacity: number;
  isActive: boolean;
  slots: ScheduleSlot[];
  tripStats: ScheduleTripStats;
  createdAt: string;
  updatedAt: string;
}

interface ScheduleSlot {
  id: number;
  scheduleId: number;
  dayOfWeek: number;          // 0=Sunday … 6=Saturday
  departureTime: string;      // "HH:MM" — Cairo local time (Africa/Cairo)
  createdAt: string;
}

interface ScheduleTripStats {
  total: number;
  waiting: number;      // scheduled + waiting_driver
  assigned: number;     // driver_assigned
  completed: number;
  cancelled: number;
}
```

### 2.7 TripStationProgress

```typescript
interface TripStationProgress {
  id: number;
  tripId: number;
  stationId: number;
  status: "pending" | "arrived" | "completed";
  arrivedAt: string | null;   // ISO 8601 UTC
  completedAt: string | null; // ISO 8601 UTC
  createdAt: string;
}
```

### 2.8 ShuttleOffence

```typescript
interface ShuttleOffence {
  id: number;
  userId: number;
  actorType: "passenger" | "driver";
  offenceCount: number;
  lastAction: "warning" | "fined" | "suspended";
  lastOffenceAt: string;  // ISO 8601 UTC
  createdAt: string;
  updatedAt: string;
}
```

### 2.9 Shuttle Line Response (from `/shuttle/lines`)

```typescript
interface ShuttleLine {
  id: number;
  name: string;
  nameAr: string | null;
  from: string;             // alias for fromLocation
  to: string;               // alias for toLocation
  fromLocation: string;
  fromLocationAr: string | null;
  toLocation: string;
  toLocationAr: string | null;
  estimatedDuration: number;
  basePrice: number;        // EGP
  isActive: boolean;
  stationCount: number;
  totalTrips: number;
  openTrips: number;        // status = "scheduled"
  activeTrips: number;      // status in ["waiting_driver", "driver_assigned"]
  totalSeats: number;       // from vehicle capacity constant
  minRequired: number;      // minimum bookings to activate trip
  upcomingWeekStart: string | null;  // YYYY-MM-DD
  timeslots: TimeSlot[];    // derived from upcoming trips
  timeSlots: TimeSlot[];    // same as timeslots (backwards-compat alias)
  availableSlots: number;
  totalSlots: number;
  createdAt: string;
  updatedAt: string;
}

interface TimeSlot {
  departureTime: string;    // "HH:MM" — Cairo local time
  availableSeats: number;
  isBooked: boolean;        // true if driver has already booked this slot
}
```

### 2.10 POST /bookings — Extended Response

When a booking is created, the response wraps the `Booking` object with a `shuttle` metadata block:

```typescript
interface CreateBookingResponse extends Booking {
  shuttle: {
    totalSeats: number;
    bookedSeats: number;
    availableSeats: number;
    minRequired: number;
    shuttleStatus: "open" | "active";
    message: string;  // human-readable status message
  };
}
```

---

## 3. Localization Fields (Arabic / English)

The following fields carry **both** an English value and an optional Arabic (`Ar`-suffixed) counterpart. Always display the Arabic value when the app locale is Arabic; fall back to English if the Arabic field is `null`.

| Entity | English Field | Arabic Field |
|--------|--------------|--------------|
| Route | `name` | `nameAr` |
| Route | `fromLocation` | `fromLocationAr` |
| Route | `toLocation` | `toLocationAr` |
| Station | `name` | `nameAr` |

**Notification bodies** returned from trip cancellation are bilingual strings separated by ` / `:

```
"Trip Cancelled / تم إلغاء الرحلة"
"Your trip has been cancelled and your money has been refunded. / تم إلغاء رحلتك وتم استرداد المبلغ."
```

Parse on the ` / ` separator to display the right half for Arabic users.

---

## 4. Vehicle Types & Capacity Constants

These are hard-coded platform constants (not fetched from the API):

| Vehicle Type | Total Seats | Min Bookings to Activate Trip |
|-------------|-------------|-------------------------------|
| `hiace` | 14 | 7 |
| `minibus` | 28 | 14 |

The `vehicleType` field is present on `Trip` objects. Use these constants to show seat maps and progress indicators without an extra API call.

---

## 5. Shuttle Lines

> Shuttle Lines are a **passenger-facing view** over Routes. They return derived data about upcoming trips, available time slots, and booking status. They do **not** replace the `/routes` endpoints used for admin management.

### 5.1 List Shuttle Lines

**`GET /shuttle/lines`** 🔓 (public, no auth required)

Returns all active routes with upcoming trip counts and derived weekly time-slot data.

**Query Parameters:** None

**Response `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Cairo – New Cairo",
      "nameAr": "القاهرة – القاهرة الجديدة",
      "from": "Cairo",
      "to": "New Cairo",
      "fromLocation": "Cairo",
      "fromLocationAr": "القاهرة",
      "toLocation": "New Cairo",
      "toLocationAr": "القاهرة الجديدة",
      "estimatedDuration": 45,
      "basePrice": 25.00,
      "isActive": true,
      "stationCount": 4,
      "totalTrips": 12,
      "openTrips": 5,
      "activeTrips": 3,
      "totalSeats": 14,
      "minRequired": 7,
      "upcomingWeekStart": "2026-06-15",
      "timeslots": [
        { "departureTime": "07:00", "availableSeats": 8, "isBooked": false },
        { "departureTime": "09:00", "availableSeats": 14, "isBooked": false }
      ],
      "timeSlots": [
        { "departureTime": "07:00", "availableSeats": 8, "isBooked": false },
        { "departureTime": "09:00", "availableSeats": 14, "isBooked": false }
      ],
      "availableSlots": 2,
      "totalSlots": 2,
      "createdAt": "2026-01-10T08:00:00.000Z",
      "updatedAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 5.2 Get Shuttle Line Detail

**`GET /shuttle/lines/:id`** 🔓 (public, no auth required)

Returns a single route with its stations and the next 20 upcoming trips.

**Path Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `id` | integer | Route / shuttle line ID |

**Response `200`:**

```json
{
  "data": {
    "id": 1,
    "name": "Cairo – New Cairo",
    "nameAr": "القاهرة – القاهرة الجديدة",
    "fromLocation": "Cairo",
    "fromLocationAr": "القاهرة",
    "toLocation": "New Cairo",
    "toLocationAr": "القاهرة الجديدة",
    "estimatedDuration": 45,
    "basePrice": 25.00,
    "isActive": true,
    "stationCount": 3,
    "totalSeats": 14,
    "minRequired": 7,
    "stations": [
      {
        "id": 10,
        "routeId": 1,
        "name": "Tahrir Square",
        "nameAr": "ميدان التحرير",
        "latitude": 30.0444,
        "longitude": 31.2357,
        "order": 1,
        "direction": "outbound",
        "segmentPrice": null,
        "createdAt": "2026-01-10T08:00:00.000Z"
      }
    ],
    "activeTrips": [
      {
        "id": 55,
        "status": "scheduled",
        "departureTime": "2026-06-15T05:00:00.000Z",
        "arrivalTime": "2026-06-15T05:45:00.000Z",
        "availableSeats": 14,
        "totalSeats": 14,
        "price": 25.00,
        "scheduleId": 3,
        "vehicleType": "hiace"
      }
    ],
    "createdAt": "2026-01-10T08:00:00.000Z",
    "updatedAt": "2026-06-01T10:00:00.000Z"
  }
}
```

**Errors:**

| Code | Body | Meaning |
|------|------|---------|
| 400 | `{ "error": "Invalid route ID" }` | Non-integer path param |
| 404 | `{ "error": "Shuttle line not found" }` | Route does not exist |

---

## 6. Routes

Routes are the underlying data model for shuttle lines. Public read, admin write.

### 6.1 List Routes

**`GET /routes`** 🔓

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `search` | string | Case-insensitive name filter |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Cairo – New Cairo",
      "nameAr": "القاهرة – القاهرة الجديدة",
      "fromLocation": "Cairo",
      "fromLocationAr": "القاهرة",
      "toLocation": "New Cairo",
      "toLocationAr": "القاهرة الجديدة",
      "estimatedDuration": 45,
      "basePrice": 25.00,
      "isActive": true,
      "stationCount": 3,
      "createdAt": "2026-01-10T08:00:00.000Z",
      "updatedAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 6.2 Get Route

**`GET /routes/:id`** 🔓

**Response `200`:** Single `Route` object (same fields as above, no `stationCount`).

**Error `404`:** `{ "error": "Route not found" }`

---

### 6.3 Create Route

**`POST /routes`** 🔑

**Request Body:**

```json
{
  "name": "Cairo – New Cairo",
  "nameAr": "القاهرة – القاهرة الجديدة",
  "fromLocation": "Cairo",
  "fromLocationAr": "القاهرة",
  "toLocation": "New Cairo",
  "toLocationAr": "القاهرة الجديدة",
  "basePrice": 25,
  "estimatedDuration": 45,
  "isActive": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | English route name |
| `nameAr` | string | ❌ | Arabic route name |
| `fromLocation` | string | ✅ | English departure label |
| `fromLocationAr` | string | ❌ | Arabic departure label |
| `toLocation` | string | ✅ | English destination label |
| `toLocationAr` | string | ❌ | Arabic destination label |
| `basePrice` | number | ✅ | Ticket price in EGP |
| `estimatedDuration` | integer | ❌ | Duration in minutes |
| `isActive` | boolean | ❌ | Default `true` |

**Response `201`:** Created `Route` object.

---

### 6.4 Update Route

**`PATCH /routes/:id`** 🔑

**Request Body:** Any subset of the fields from Create Route.

**Response `200`:** Updated `Route` object.

---

### 6.5 Delete Route

**`DELETE /routes/:id`** 🔑

Cascade-deletes all bookings and trips belonging to this route.

**Response `204`:** No body.

---

## 7. Stations

Stations are ordered stops along a route.

### 7.1 List Stations for Route

**`GET /routes/:id/stations`** 🔓

Returns stations ordered by `order` ascending.

**Response `200`:** Array of `Station` objects.

```json
[
  {
    "id": 10,
    "routeId": 1,
    "name": "Tahrir Square",
    "nameAr": "ميدان التحرير",
    "latitude": 30.0444,
    "longitude": 31.2357,
    "order": 1,
    "direction": "outbound",
    "segmentPrice": null,
    "createdAt": "2026-01-10T08:00:00.000Z"
  },
  {
    "id": 11,
    "routeId": 1,
    "name": "Maadi",
    "nameAr": "المعادي",
    "latitude": 29.9626,
    "longitude": 31.2497,
    "order": 2,
    "direction": "outbound",
    "segmentPrice": 15.00,
    "createdAt": "2026-01-10T08:00:00.000Z"
  }
]
```

---

### 7.2 Add Station

**`POST /routes/:id/stations`** 🔑

**Request Body:**

```json
{
  "name": "Maadi",
  "nameAr": "المعادي",
  "latitude": 29.9626,
  "longitude": 31.2497,
  "order": 2,
  "direction": "outbound",
  "segmentPrice": 15
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | English station name |
| `nameAr` | string | ❌ | Arabic station name |
| `latitude` | number | ✅ | GPS latitude |
| `longitude` | number | ✅ | GPS longitude |
| `order` | integer | ✅ | Position in route (1-based) |
| `direction` | `"outbound"` \| `"return"` | ❌ | Default `"outbound"` |
| `segmentPrice` | number \| null | ❌ | Partial-route ticket price in EGP |

**Response `201`:** Created `Station` object.

---

### 7.3 Update Station

**`PATCH /routes/:id/stations/:stationId`** 🔑

**Request Body:** Any subset of station fields (including `nameAr`, `direction`, `segmentPrice`).

**Response `200`:** Updated `Station` object.

---

### 7.4 Delete Station

**`DELETE /routes/:id/stations/:stationId`** 🔑

**Response `204`:** No body.

---

## 8. Buses

Buses are the physical vehicles assigned to trips.

### 8.1 List Buses

**`GET /buses`** 🔑

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Page size |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "plateNumber": "ABC-1234",
      "capacity": 14,
      "model": "Toyota Hiace",
      "vehicleTypeId": null,
      "currentLatitude": null,
      "currentLongitude": null,
      "isActive": true,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-06-01T08:00:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### 8.2 Get Bus

**`GET /buses/:id`** 🔑

**Response `200`:** Single `Bus` object.

---

### 8.3 Create Bus

**`POST /buses`** 🔑 (audit-logged)

**Request Body:**

```json
{
  "plateNumber": "ABC-1234",
  "model": "Toyota Hiace",
  "capacity": 14,
  "isActive": true
}
```

| Field | Type | Required |
|-------|------|----------|
| `plateNumber` | string | ✅ |
| `model` | string | ✅ |
| `capacity` | integer | ✅ |
| `isActive` | boolean | ❌ |

**Response `201`:** Created `Bus` object.

---

### 8.4 Update Bus

**`PATCH /buses/:id`** 🔑 (audit-logged)

**Request Body:** Any subset of bus fields.

**Response `200`:** Updated `Bus` object.

---

### 8.5 Delete Bus

**`DELETE /buses/:id`** 🔑 (audit-logged)

**Response `204`:** No body.

---

## 9. Schedules

Schedules define recurring weekly patterns that **auto-generate Trip rows** for a date range. All times are in **Cairo local time (Africa/Cairo)** and stored as UTC in the database.

### 9.1 List Schedules

**`GET /schedules`** 🔑

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `routeId` | integer | Filter by route |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "routeId": 1,
      "routeName": "Cairo – New Cairo",
      "fromLocation": "Cairo",
      "toLocation": "New Cairo",
      "effectiveFrom": "2026-06-01",
      "effectiveTo": "2026-08-31",
      "vehicleType": "hiace",
      "defaultCapacity": 14,
      "isActive": true,
      "slots": [
        { "id": 1, "scheduleId": 1, "dayOfWeek": 0, "departureTime": "07:00", "createdAt": "..." },
        { "id": 2, "scheduleId": 1, "dayOfWeek": 1, "departureTime": "07:00", "createdAt": "..." }
      ],
      "tripStats": {
        "total": 30,
        "waiting": 10,
        "assigned": 5,
        "completed": 15,
        "cancelled": 0
      },
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 9.2 Create Schedule

**`POST /schedules`** 🔑

Creates a schedule **and immediately auto-generates all Trip rows** for the given date range.

**Request Body:**

```json
{
  "routeId": 1,
  "effectiveFrom": "2026-07-01",
  "effectiveTo": "2026-09-30",
  "vehicleType": "hiace",
  "slots": [
    { "dayOfWeek": 0, "departureTime": "07:00" },
    { "dayOfWeek": 1, "departureTime": "07:00" },
    { "dayOfWeek": 3, "departureTime": "09:00" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `routeId` | integer | ✅ | Target route |
| `effectiveFrom` | string | ✅ | Start date `YYYY-MM-DD` (Cairo local date) |
| `effectiveTo` | string | ✅ | End date `YYYY-MM-DD` (Cairo local date) |
| `vehicleType` | `"hiace"` \| `"minibus"` | ✅ | Vehicle type determines seat count |
| `slots` | array | ✅ | At least one slot required |
| `slots[].dayOfWeek` | integer | ✅ | 0=Sunday, 1=Monday, …, 6=Saturday |
| `slots[].departureTime` | string | ✅ | `"HH:MM"` Cairo local time |

**Response `201`:**

```json
{
  "schedule": { "id": 5, "routeId": 1, "effectiveFrom": "2026-07-01", "effectiveTo": "2026-09-30", "vehicleType": "hiace", "defaultCapacity": 14, "isActive": true, "createdAt": "..." },
  "slots": [
    { "id": 10, "scheduleId": 5, "dayOfWeek": 0, "departureTime": "07:00" }
  ],
  "tripsCreated": 45,
  "note": "Departure times are interpreted as Cairo local time (Africa/Cairo) and stored in UTC."
}
```

**Important:** `effectiveTo` must be strictly after `effectiveFrom`.

---

### 9.3 Get Schedule

**`GET /schedules/:id`** 🔑

**Response `200`:** Single schedule object with `slots` array and `tripStats`.

---

### 9.4 Update Schedule

**`PATCH /schedules/:id`** 🔑

Updates metadata only. **Does NOT regenerate trips.** Use `POST /schedules/:id/generate` to regenerate.

**Request Body:**

```json
{
  "effectiveFrom": "2026-07-01",
  "effectiveTo": "2026-10-31",
  "isActive": true
}
```

**Response `200`:** Updated schedule row.

---

### 9.5 Deactivate Schedule

**`DELETE /schedules/:id`** 🔑

Sets `isActive = false` and **cancels all future unstarted trips** belonging to this schedule.

**Response `200`:**

```json
{
  "ok": true,
  "scheduleDeactivated": true,
  "futureTripsCount": 23
}
```

---

### 9.6 Re-generate Trips

**`POST /schedules/:id/generate`** 🔑

Re-runs trip generation for a schedule (idempotent — skips already-created trips). Use after extending `effectiveTo`.

**Response `200`:**

```json
{
  "ok": true,
  "tripsCreated": 12
}
```

---

## 10. Trips

Trips are individual journey instances tied to a route and schedule.

### 10.1 List Trips

**`GET /trips`** 🔓

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `routeId` | integer | Filter by route |
| `status` | string | Filter by `TripStatus` |
| `date` | string | Filter by date `YYYY-MM-DD` (matches `departureTime` date) |
| `page` | integer | Default 1 |
| `limit` | integer | Default 20 |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 55,
      "routeId": 1,
      "scheduleId": 3,
      "busId": null,
      "driverId": null,
      "departureTime": "2026-06-15T05:00:00.000Z",
      "arrivalTime": "2026-06-15T05:45:00.000Z",
      "availableSeats": 14,
      "totalSeats": 14,
      "price": 25.00,
      "status": "scheduled",
      "isActive": true,
      "recurringType": "one_time",
      "weekdays": null,
      "vehicleType": "hiace",
      "cancelReason": null,
      "acceptedAt": null,
      "arrivedAt": null,
      "startedAt": null,
      "completedAt": null,
      "cancelledAt": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### 10.2 Get Trip

**`GET /trips/:id`** 🔓

**Response `200`:** Single `Trip` object.

**Error `404`:** `{ "error": "Trip not found" }`

---

### 10.3 Create Trip (Admin)

**`POST /trips`** 🔑

Manually create a trip (outside of schedules).

**Request Body:**

```json
{
  "routeId": 1,
  "busId": 2,
  "driverId": 5,
  "departureTime": "2026-06-20T05:00:00.000Z",
  "arrivalTime": "2026-06-20T05:45:00.000Z",
  "price": 25
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `routeId` | integer | ✅ | |
| `busId` | integer | ❌ | `totalSeats` is derived from bus capacity |
| `driverId` | integer | ❌ | |
| `departureTime` | ISO 8601 | ✅ | |
| `arrivalTime` | ISO 8601 | ❌ | |
| `price` | number | ❌ | Defaults to route `basePrice` |

**Response `201`:** Created `Trip` object.

---

### 10.4 Update Trip (Admin)

**`PATCH /trips/:id`** 🔑

**Request Body:** Any subset of trip fields (all optional).

**Response `200`:** Updated `Trip` object.

---

### 10.5 Delete Trip (Admin)

**`DELETE /trips/:id`** 🔑

Refunds all confirmed/pending bookings before deletion. Cannot delete an `active` trip — cancel it first.

**Response `204`:** No body.

---

### 10.6 Cancel Trip (Admin)

**`PATCH /trips/:id/cancel`** 🔑

**Response `200`:** Cancelled `Trip` object. Also refunds all confirmed/pending bookings.

---

### 10.7 Admin Cancel Trip with Full Refunds

**`POST /admin/trips/:id/cancel`** 🔑

Preferred admin cancel route. Cancels the trip and issues wallet refunds with bilingual notifications to all affected passengers.

**Response `200`:** Updated `Trip` object.

---

## 11. Bookings (Reservations & Ticketing)

Bookings represent a passenger's reservation on a shuttle trip.

> **Shuttle rule:** each passenger books exactly **1 seat per booking**. Requests with `seatCount != 1` are rejected with `400`.

### 11.1 Create Booking (Book a Seat)

**`POST /bookings`** 🔐

Payment is deducted atomically from the passenger's **wallet balance** at booking time. The booking is created as `status: "pending"` and transitions to `"confirmed"` automatically if the trip's minimum seat threshold is met.

**Request Body:**

```json
{
  "tripId": 55,
  "seatCount": 1,
  "promoCode": "SUMMER10"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tripId` | integer | ✅ | Target trip |
| `seatCount` | integer | ✅ | Must be `1` |
| `promoCode` | string | ❌ | Optional promo code string |

**Validation rules:**
- `seatCount` must equal `1`.
- Trip status must be `"scheduled"`, `"active"`, or `"waiting_driver"`.
- Passenger cannot have an existing active booking for the same trip.
- Wallet balance must be ≥ `totalPrice`.
- If promo code is provided:
  - Must be active and not expired.
  - Must not have exceeded usage limits.
  - `applicableService` must be `"all"` or `"shuttle"`.

**Response `201`:**

```json
{
  "id": 101,
  "userId": 42,
  "tripId": 55,
  "seatCount": 1,
  "totalPrice": 22.50,
  "status": "pending",
  "paymentStatus": "paid",
  "promoCodeId": 3,
  "createdAt": "2026-06-13T10:00:00.000Z",
  "updatedAt": "2026-06-13T10:00:00.000Z",
  "shuttle": {
    "totalSeats": 14,
    "bookedSeats": 8,
    "availableSeats": 6,
    "minRequired": 7,
    "shuttleStatus": "active",
    "message": "Trip is confirmed — boarding guaranteed"
  }
}
```

**Errors:**

| Code | Body | Meaning |
|------|------|---------|
| 400 | `"Shuttle bookings allow exactly 1 seat per booking."` | seatCount ≠ 1 |
| 400 | `"Trip is not available for booking"` | Wrong trip status |
| 400 | `"This trip is fully booked."` | No available seats |
| 400 | `"Insufficient wallet balance. Required: X EGP, available: Y EGP"` | Wallet too low |
| 409 | `"You already have an active booking for this trip"` | Duplicate booking |
| 409 | `"Seat reservation failed — seats may have just been taken"` | Race condition |

**Side effects:**
- Wallet balance decremented immediately.
- `WalletTransaction` row created (type: `"payment"`).
- `Payment` row created.
- If `bookedSeats >= minRequired`, trip status auto-transitions to `"active"`.
- Booking confirmation push notification sent.

---

### 11.2 Get Booking

**`GET /bookings/:id`** 🔐

Passengers can only fetch their own bookings. Admins can fetch any.

**Response `200`:** Single `Booking` object.

**Errors:** `403 Forbidden` if passenger tries to access another user's booking.

---

### 11.3 Cancel Booking (Admin / Passenger)

**`PATCH /bookings/:id/cancel`** 🔐

Cancels the booking. If `paymentStatus` was `"paid"`, wallet is **immediately refunded**.

> **⚠️ Note on cancellation endpoint duplication:** there are two cancel endpoints for bookings (see [Section 20](#20-deprecated-endpoints--replacements)). Use `DELETE /shuttle/bookings/:id` for passenger self-cancellation in the React Native app.

**Response `200`:** Updated `Booking` with `status: "cancelled"` and `paymentStatus: "refunded"`.

---

### 11.4 Cancel Booking — Passenger Self-Service (Preferred)

**`DELETE /shuttle/bookings/:id`** 👤

**Time-based refund policy:**
- Cancelled **> 12 hours** before departure → **full refund** to wallet.
- Cancelled **≤ 12 hours** before departure → **no refund**.

Cannot cancel a booking in status `boarded`, `completed`, or `absent`.

**Response `200`:**

```json
{
  "ok": true,
  "bookingId": 101,
  "refunded": true
}
```

**Errors:**

| Code | Body |
|------|------|
| 400 | `"Booking is already cancelled"` |
| 400 | `"Cannot cancel a booking with status 'boarded'"` |
| 403 | `"You can only cancel your own bookings"` |
| 404 | `"Booking not found"` |
| 404 | `"Trip not found"` |

**Side effects:**
- Push notification sent confirming cancellation with refund status.
- `availableSeats` on the trip incremented.

---

### 11.5 Get My Bookings

**`GET /users/me/bookings`** 🔐

Returns the authenticated passenger's complete booking history with joined trip data.

**Response `200`:**

```json
[
  {
    "id": 101,
    "userId": 42,
    "tripId": 55,
    "seatCount": 1,
    "totalPrice": 22.50,
    "status": "pending",
    "paymentStatus": "paid",
    "promoCodeId": null,
    "createdAt": "2026-06-13T10:00:00.000Z",
    "updatedAt": "2026-06-13T10:00:00.000Z",
    "trip": {
      "id": 55,
      "routeId": 1,
      "departureTime": "2026-06-15T05:00:00.000Z",
      "arrivalTime": "2026-06-15T05:45:00.000Z",
      "price": 25.00,
      "status": "scheduled"
    }
  }
]
```

---

### 11.6 Admin: List All Bookings

**`GET /bookings`** 🔑

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `userId` | integer | Filter by passenger |
| `tripId` | integer | Filter by trip |
| `status` | string | Filter by `BookingStatus` |
| `page` | integer | Default 1 |
| `limit` | integer | Default 20 |

**Response `200`:** Paginated list with joined `user` and `trip` objects.

---

### 11.7 Admin: List All Bookings with Full Details

**`GET /admin/bookings`** 🔑

Same as `GET /bookings` but with additional join detail. Supports same query params.

---

## 12. Seat Selection Notes

The VeeGo shuttle does **not** implement per-seat map selection. Seat assignments are positional/FIFO — the system tracks:

- `availableSeats` (integer) on each `Trip` — decremented on booking, incremented on cancellation.
- Each booking represents exactly 1 seat (`seatCount: 1`).
- The frontend should display `availableSeats` and `totalSeats` to show capacity progress.
- Use the `shuttle` block in the booking creation response for real-time seat counts after booking.

**Suggested UI pattern:**

```
[███████░░░░░░░] 8/14 seats booked  (min: 7 for trip activation)
```

If `bookedSeats < minRequired`, show: _"Needs X more bookings to activate"_  
If `shuttleStatus === "active"`, show: _"Trip confirmed — boarding guaranteed"_

---

## 13. Passenger-Specific Shuttle APIs

### 13.1 Get My Debt

**`GET /shuttle/my-debt`** 👤

Returns the authenticated passenger's outstanding cash debt (negative wallet balance) and offence count.

**Response `200` (no debt):**

```json
{
  "hasDebt": false,
  "debtAmount": 0,
  "offenceCount": 0
}
```

**Response `200` (has debt):**

```json
{
  "hasDebt": true,
  "debtAmount": 25.00,
  "offenceCount": 2
}
```

> Show a **prominent debt banner** in the app whenever `hasDebt === true`. The passenger cannot book new trips while they have an outstanding debt (wallet balance < 0).

---

### 13.2 Shuttle Driver Location (Real-Time)

Use the Socket.IO event `shuttle:driver:location` (see [Section 16](#16-real-time-events-socketio)) to receive live bus GPS updates during an active trip.

---

## 14. Driver-Specific Shuttle APIs

All driver APIs require `role: driver` and `Authorization: Bearer <driver_token>`.

### 14.1 List My Trips

**`GET /driver/trips`** 🚌

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `status` | string | Filter by `TripStatus` |
| `page` | integer | Default 1 |
| `limit` | integer | Default 20, max 100 |

**Response `200`:**

```json
{
  "data": [ /* Trip objects */ ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### 14.2 Get Trip Detail (with Passengers)

**`GET /driver/trips/:id`** 🚌

Returns the trip object plus a `bookings` array with passenger names and phone numbers.

**Response `200`:**

```json
{
  "id": 55,
  "status": "driver_assigned",
  "departureTime": "2026-06-15T05:00:00.000Z",
  "bookings": [
    {
      "id": 101,
      "passengerName": "Ahmed Hassan",
      "passengerPhone": "+201001234567",
      "passengerAvatar": null
    }
  ]
}
```

---

### 14.3 Accept Trip Assignment

**`PATCH /driver/trips/:id/accept`** 🚌

Transitions trip status from `"scheduled"` / `"waiting_driver"` → `"driver_assigned"`.

**Response `200`:** Updated `Trip` object (with `acceptedAt` timestamp set).

**Error `400`:** `"Cannot accept trip in status: <status>"`

---

### 14.4 Reject Trip Assignment

**`PATCH /driver/trips/:id/reject`** 🚌

Clears the driver assignment and returns trip to `"waiting_driver"` status so another driver can be assigned.

**Response `200`:** Updated `Trip` object (`driverId` cleared).

---

### 14.5 Start Trip

**`PATCH /driver/trips/:id/start`** 🚌

Transitions trip to `"active"`. **Requires a face-detected selfie check-in first.**

**Response `200`:** Updated `Trip` object (with `startedAt` set).

**Response `403`:**

```json
{
  "error": "Selfie check-in required",
  "message": "You must complete a face-detected selfie check-in for this trip before starting it."
}
```

**Side effects:**
- Driver status set to `"busy"`.
- `TripStationProgress` rows created for all stations (status: `"pending"`).
- `TRIP_STARTED` event logged.

---

### 14.6 Complete Trip

**`PATCH /driver/trips/:id/complete`** 🚌

Transitions trip to `"completed"`. Only valid when status is `"active"`.

**Response `200`:** Updated `Trip` object (with `completedAt` set).

**Side effects:**
- Driver status set to `"online"`.
- All `confirmed` bookings set to `completed`.
- Driver earnings row created (trip price minus platform commission).
- Rating request notifications sent to passengers.

---

### 14.7 Cancel Trip (Driver)

**`PATCH /driver/trips/:id/cancel`** 🚌

**Request Body:**

```json
{
  "reason": "Vehicle breakdown"
}
```

**Response `200`:** Updated `Trip` object (with `cancelledAt` and `cancelReason` set).

**Error `400`:** `"Cannot cancel trip in status: completed"`

---

### 14.8 Get Station Progress

**`GET /driver/trips/:id/stations`** 🚌

Returns all stations for the trip's route with their progress status.

**Response `200`:**

```json
{
  "data": [
    {
      "id": 10,
      "routeId": 1,
      "name": "Tahrir Square",
      "nameAr": "ميدان التحرير",
      "latitude": 30.0444,
      "longitude": 31.2357,
      "order": 1,
      "direction": "outbound",
      "segmentPrice": null,
      "progress": {
        "stationId": 10,
        "status": "arrived",
        "arrivedAt": "2026-06-15T05:03:00.000Z",
        "completedAt": null
      },
      "status": "arrived",
      "expectedPassengers": 3
    }
  ]
}
```

---

### 14.9 Mark Station Arrived

**`PATCH /driver/trips/:id/stations/:stationId/arrived`** 🚌

Marks the driver has physically arrived at the station. Sets `status: "arrived"` with `arrivedAt` timestamp.

**Response `200`:** Updated `TripStationProgress` object.

---

### 14.10 Mark Station Completed (Boarding Done)

**`PATCH /driver/trips/:id/stations/:stationId/completed`** 🚌

Marks boarding at this station complete — driver is departing. Sets `status: "completed"` with `completedAt` timestamp.

**Response `200`:** Updated `TripStationProgress` object.

---

### 14.11 Board Passenger

**`PATCH /driver/bookings/:id/board`** 🚌

Marks a passenger as boarded. Booking transitions `"confirmed"` / `"pending"` → `"boarded"`.

**Response `200`:** Updated `Booking` object.

**Side effects:**
- `booking:boarded` Socket.IO event emitted to the passenger's room.

---

### 14.12 Mark Passenger Absent (No-Show)

**`PATCH /driver/bookings/:id/absent`** 🚌

Marks a passenger as absent (no-show). Booking transitions to `"absent"`.

**Response `200`:** Updated `Booking` object.

> **⚠️ Important:** Marking absent triggers the shuttle offence system. After a configurable threshold of no-shows, the passenger may be warned, fined, or suspended.

---

## 15. Admin Shuttle APIs

### 15.1 List All Shuttle Trips (Rich View)

**`GET /admin/shuttle-trips`** 🔑

Returns trips with joined route, driver, bus, and real booked seat count.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `status` | string | `TripStatus` filter |
| `routeId` | integer | Filter by route |
| `dateFrom` | string | `YYYY-MM-DD` lower bound |
| `dateTo` | string | `YYYY-MM-DD` upper bound |
| `page` | integer | Default 1 |
| `limit` | integer | Default 20, max 100 |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 55,
      "scheduleId": 3,
      "status": "driver_assigned",
      "departureTime": "2026-06-15T05:00:00.000Z",
      "arrivalTime": "2026-06-15T05:45:00.000Z",
      "price": 25.00,
      "totalSeats": 14,
      "availableSeats": 6,
      "bookedSeats": 8,
      "startedAt": null,
      "completedAt": null,
      "cancelledAt": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "route": {
        "id": 1,
        "name": "Cairo – New Cairo",
        "fromLocation": "Cairo",
        "toLocation": "New Cairo"
      },
      "driver": {
        "id": 5,
        "name": "Mohamed Ali",
        "phone": "+201009876543",
        "rating": 4.8
      },
      "bus": {
        "id": 2,
        "plateNumber": "ABC-1234",
        "model": "Toyota Hiace",
        "capacity": 14
      }
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

---

### 15.2 Get Shuttle Trip Detail (Admin)

**`GET /admin/shuttle-trips/:id`** 🔑

Full detail including route stations with progress, all passengers, and station progress.

**Response `200`:**

```json
{
  "data": {
    "id": 55,
    "status": "active",
    "departureTime": "2026-06-15T05:00:00.000Z",
    "arrivalTime": "2026-06-15T05:45:00.000Z",
    "price": 25.00,
    "totalSeats": 14,
    "availableSeats": 6,
    "bookedSeats": 8,
    "acceptedAt": "2026-06-14T18:00:00.000Z",
    "startedAt": "2026-06-15T05:02:00.000Z",
    "completedAt": null,
    "cancelledAt": null,
    "cancelReason": null,
    "route": {
      "id": 1,
      "name": "Cairo – New Cairo",
      "fromLocation": "Cairo",
      "toLocation": "New Cairo",
      "estimatedDuration": 45,
      "stations": [
        {
          "id": 10,
          "name": "Tahrir Square",
          "nameAr": "ميدان التحرير",
          "order": 1,
          "latitude": 30.0444,
          "longitude": 31.2357,
          "segmentPrice": null,
          "progress": {
            "stationId": 10,
            "status": "completed",
            "arrivedAt": "2026-06-15T05:03:00.000Z",
            "completedAt": "2026-06-15T05:08:00.000Z"
          }
        }
      ]
    },
    "driver": { "id": 5, "name": "Mohamed Ali", "phone": "+20...", "rating": 4.8, "status": "busy" },
    "bus": { "id": 2, "plateNumber": "ABC-1234", "model": "Toyota Hiace", "capacity": 14 },
    "passengers": [
      {
        "bookingId": 101,
        "userId": 42,
        "userName": "Ahmed Hassan",
        "userPhone": "+201001234567",
        "userEmail": "ahmed@example.com",
        "seatCount": 1,
        "totalPrice": 22.50,
        "status": "boarded",
        "paymentStatus": "paid",
        "createdAt": "2026-06-13T10:00:00.000Z"
      }
    ],
    "totalPassengers": 8
  }
}
```

---

### 15.3 Get Passengers for a Trip

**`GET /shuttle/trips/:id/passengers`** 🔐

**Response `200`:**

```json
{
  "tripId": 55,
  "tripStatus": "active",
  "shuttleStatus": "active",
  "totalSeats": 14,
  "bookedSeats": 8,
  "availableSeats": 6,
  "minRequired": 7,
  "data": [
    {
      "bookingId": 101,
      "userId": 42,
      "seatCount": 1,
      "totalPrice": 22.50,
      "status": "boarded",
      "paymentStatus": "paid",
      "createdAt": "...",
      "userName": "Ahmed Hassan",
      "userPhone": "+201001234567",
      "userEmail": "ahmed@example.com"
    }
  ],
  "total": 8
}
```

---

### 15.4 Get Passengers for a Line (by Route)

**`GET /shuttle/lines/:id/passengers`** 🔐

Returns passengers for the nearest upcoming trip on this route.

**Response `200`:**

```json
{
  "tripId": 55,
  "routeId": 1,
  "data": [ /* same passenger objects */ ],
  "total": 8
}
```

**Error `404`:** `"No upcoming trip found for this shuttle line"`

---

### 15.5 Board Passenger (via Shuttle Route)

**`POST /shuttle/bookings/:id/board`** 🔐

Alternate boarding endpoint accessible on the shuttle router.

**Response `200`:** Updated `Booking` object with `status: "boarded"`.

---

### 15.6 Driver-Bus Assignments

**`GET /shuttle/assignments`** 🔐

Returns all active drivers with their assigned bus and current trip.

**Response `200`:**

```json
{
  "data": [
    {
      "driverId": 5,
      "driverName": "Mohamed Ali",
      "driverPhone": "+20...",
      "driverStatus": "busy",
      "isOnline": true,
      "rating": 4.8,
      "userId": 12,
      "bus": { "id": 2, "plateNumber": "ABC-1234", "model": "Toyota Hiace", "capacity": 14, "isActive": true },
      "currentTrip": {
        "id": 55,
        "routeId": 1,
        "routeName": "Cairo – New Cairo",
        "fromLocation": "Cairo",
        "toLocation": "New Cairo",
        "status": "active",
        "departureTime": "2026-06-15T05:00:00.000Z",
        "arrivalTime": "2026-06-15T05:45:00.000Z",
        "availableSeats": 6,
        "totalSeats": 14
      }
    }
  ],
  "total": 3
}
```

---

### 15.7 List Cash Debts (Passengers with Negative Wallet)

**`GET /admin/shuttle/cash-debts`** 🔑

**Response `200`:**

```json
{
  "data": [
    {
      "userId": 42,
      "name": "Ahmed Hassan",
      "phone": "+201001234567",
      "debtAmount": 25.00,
      "numberOfOffences": 2,
      "lastOffenceDate": "2026-06-10T08:00:00.000Z"
    }
  ],
  "total": 3
}
```

---

### 15.8 Collect Cash Debt

**`PATCH /admin/shuttle/cash-debts/:userId/collect`** 🔑

Resets passenger wallet balance to 0 and creates a wallet transaction record.

**Response `200`:**

```json
{
  "ok": true,
  "collected": 25.00,
  "userId": 42
}
```

**Side effects:**
- Wallet balance set to `0`.
- `WalletTransaction` created (type: `"deposit"`).
- Push notification sent to passenger.

---

### 15.9 List Shuttle Offences

**`GET /admin/shuttle/offences`** 🔑

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `actorType` | `"passenger"` \| `"driver"` \| `"all"` | Filter by actor |
| `lastAction` | `"warning"` \| `"fined"` \| `"suspended"` \| `"all"` | Filter by action |
| `dateFrom` | string | `YYYY-MM-DD` lower bound on `lastOffenceAt` |
| `dateTo` | string | `YYYY-MM-DD` upper bound on `lastOffenceAt` |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "userId": 42,
      "name": "Ahmed Hassan",
      "phone": "+201001234567",
      "actorType": "passenger",
      "offenceCount": 3,
      "lastAction": "fined",
      "lastOffenceAt": "2026-06-10T08:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 15.10 Reset Offence Record

**`PATCH /admin/shuttle/offences/:userId/reset`** 🔑

Deletes all offence rows for the specified user (full reset).

**Response `200`:**

```json
{
  "ok": true,
  "resetCount": 1,
  "userId": 42
}
```

---

### 15.11 Trip Group Chat

**`GET /trips/:id/chat`** 🔐

Returns all chat messages for a shuttle trip. The `id` here is a **trip ID**, not a ride ID. This chat only exists for shuttle trips.

**`POST /trips/:id/chat`** 🔐

Send a message to the trip group chat.

---

## 16. Real-Time Events (Socket.IO)

Connect to Socket.IO at the root of the API server. Authenticate using the same JWT token via the `auth` handshake:

```javascript
const socket = io("https://<domain>", {
  auth: { token: accessToken }
});
```

**Rooms to join:**

| Room Pattern | Who joins |
|---|---|
| `passenger:<userId>` | Authenticated passenger |
| `driver:<userId>` | Authenticated driver |
| `trip:<tripId>` | Anyone tracking a specific trip |
| `admin:ops` | Admin |

---

### Shuttle-Related Events

#### Server → Passenger

| Event | Payload | Description |
|-------|---------|-------------|
| `booking:boarded` | `{ bookingId, tripId, timestamp }` | Driver scanned passenger aboard |
| `shuttle:driver:location` | `{ tripId, lat, lng, timestamp }` | Live GPS update from bus during active trip |
| `notification:new` | `{ id, category, title, body, time }` | In-app notification (booking confirmation, cancellation, refund, etc.) |

#### Server → Driver

| Event | Payload | Description |
|-------|---------|-------------|
| `shuttle:booking:created` | Booking data | New passenger booked on driver's route |
| `shuttle:booking:cancelled` | Booking data | A booking on driver's route was cancelled |
| `shuttle:renewal:confirmed` | Renewal data | Driver's route renewal was confirmed |
| `shuttle:booking:reassigned` | Assignment data | Admin reassigned a booking to/from this driver |
| `shuttle:checkin:required` | `{ tripId }` | Selfie check-in required before trip start |
| `shuttle:station:timeout` | `{ tripId, stationId }` | Driver has not marked a station as arrived within the expected window |

#### Server → Admin

| Event | Payload | Description |
|-------|---------|-------------|
| `admin:track:trip` | Trip tracking data | Live trip position update |

#### Client → Server (Driver)

| Event | Payload | Description |
|-------|---------|-------------|
| `driver:trip:start` | `{ tripId }` | Driver starts trip |
| `driver:trip:complete` | `{ tripId }` | Driver completes trip |
| `passenger:join:trip` | `{ tripId }` | Join trip tracking room |
| `passenger:trip:tracking` | tracking data | Passenger real-time tracking |
| `trip:chat:message` | `{ tripId, message }` | Send trip chat message |

---

## 17. Trip Status State Machine

```
[scheduled] ──→ [waiting_driver] ──→ [driver_assigned] ──→ [boarding] ──→ [active] ──→ [completed]
     │                │                      │                                │
     └────────────────┴──────────────────────┴────────────────────────────────┴──→ [cancelled]
```

| Transition | Triggered by | Endpoint |
|-----------|-------------|----------|
| `scheduled` → `waiting_driver` | Admin assigns driver | `PATCH /trips/:id` |
| `scheduled` → `active` | Booking count reaches `minRequired` | Auto on `POST /bookings` |
| `waiting_driver` → `driver_assigned` | Driver accepts | `PATCH /driver/trips/:id/accept` |
| `driver_assigned` → `active` | Driver starts trip | `PATCH /driver/trips/:id/start` |
| `active` → `completed` | Driver completes trip | `PATCH /driver/trips/:id/complete` |
| Any → `cancelled` | Driver or admin cancels | `/driver/trips/:id/cancel` or `/trips/:id/cancel` |

> **Note:** A trip in `active` or `driver_assigned` status is considered **immutable** for seat-count purposes. Passenger cancellations on active trips do not revert trip status.

---

## 18. Booking Status State Machine

```
[pending] ──→ [confirmed] ──→ [boarded] ──→ [completed]
     │               │                  └──→ [absent]
     └───────────────┴──→ [cancelled]
```

| Status | Meaning | Refundable |
|--------|---------|------------|
| `pending` | Booked, trip not yet active | ✅ Full refund |
| `confirmed` | Trip active, boarding imminent | ✅ Full refund (> 12h rule via `DELETE /shuttle/bookings/:id`) |
| `boarded` | Physically boarded the bus | ❌ |
| `absent` | No-show — did not board | ❌ Offence recorded |
| `completed` | Trip completed, booking closed | ❌ |
| `cancelled` | Cancelled by passenger or admin | Depends on method and timing |

---

## 19. Cancellation & Refund Policy

| Scenario | Refund |
|----------|--------|
| Admin cancels trip (`POST /admin/trips/:id/cancel`) | Full wallet refund to all passengers |
| Passenger cancels via `DELETE /shuttle/bookings/:id` > 12h before departure | Full wallet refund |
| Passenger cancels via `DELETE /shuttle/bookings/:id` ≤ 12h before departure | No refund |
| Admin cancels booking (`PATCH /bookings/:id/cancel`) | Full wallet refund if `paymentStatus === "paid"` |
| Passenger no-show (marked `absent`) | No refund + offence recorded |

---

## 20. Deprecated Endpoints & Replacements

| Deprecated | Replacement | Reason |
|-----------|------------|--------|
| `PATCH /trips/:id/cancel` | `POST /admin/trips/:id/cancel` | The old endpoint does not issue passenger refunds automatically. The new `POST` endpoint handles full refund flow with bilingual notifications. |
| `pickupStationId` / `dropoffStationId` in `POST /bookings` body | Not required | These fields appear in the OpenAPI spec but are **not validated or stored** in the actual route handler. The backend uses the route's station order. Do not include them — they will be silently ignored. |
| `timeSlots` field on shuttle line | `timeslots` | Both are returned for backwards compatibility. Use `timeslots`. |

---

## 21. Backend Changes Not Yet Reflected in Frontend

The following backend behaviours are confirmed in the server code but may not yet be handled correctly in frontend applications:

### 21.1 Booking Status is `"pending"` (not `"confirmed"`) After Creation

**Impact:** The `POST /bookings` response returns `status: "pending"` when the trip has not yet reached `minRequired` bookings. Frontends that check `status === "confirmed"` to show a "confirmed" badge will incorrectly show the booking as unconfirmed. The booking transitions to `"confirmed"` automatically when the trip activates — **no separate confirmation call is needed.** Listen for the `notification:new` Socket.IO event with `category: "booking"` to notify the user when their booking is confirmed.

### 21.2 New Trip Statuses in the State Machine

The DB schema includes two statuses (`"driver_assigned"`, `"boarding"`) that are **not listed in the OpenAPI spec's `Trip.status` enum**. Frontend code checking `status === "active"` to determine if a trip is "running" will miss the `"driver_assigned"` and `"boarding"` intermediate states. Update status checks to use:

```typescript
const isAssigned = ["driver_assigned", "boarding", "active"].includes(trip.status);
const isBookable = ["scheduled", "waiting_driver", "driver_assigned"].includes(trip.status);
```

### 21.3 `DELETE /shuttle/bookings/:id` — New Endpoint

The preferred passenger self-cancel endpoint is `DELETE /shuttle/bookings/:id`. It implements the 12-hour refund window policy. The older `PATCH /bookings/:id/cancel` always issues a full refund with no time check — **use the `DELETE` endpoint in the passenger app** to enforce correct policy.

### 21.4 Vehicle Type Capacities are Hard-Coded Constants

`totalSeats` on a trip is populated from the vehicle type enum constant (`hiace: 14`, `minibus: 28`), **not from the bus's `capacity` field** (which may differ). When displaying seat availability, always use the trip's `totalSeats` field — not the bus's `capacity`.

### 21.5 Arabic Localization Fields Not in OpenAPI Spec

The OpenAPI spec's `Route` and `Station` schemas do not list `nameAr`, `fromLocationAr`, `toLocationAr`. These fields **are in the database and returned by the API**. Use them for Arabic locale support.

### 21.6 `segmentPrice` on Stations Not in OpenAPI Spec

The OpenAPI spec does not document `segmentPrice` on `Station`. This field exists for partial-route pricing (e.g., boarding at a middle station). If the `segmentPrice` is non-null, it overrides the route's `basePrice` for passengers who board at that station.

### 21.7 Wallet Balance May Go Negative (Cash Debt)

When a driver marks a passenger `absent`, the backend can charge the passenger's wallet even if the balance goes negative. The passenger owes a **cash debt** recoverable via `GET /shuttle/my-debt`. Frontends should:
1. Check `hasDebt` on app launch and show a persistent banner.
2. Block new bookings when `walletBalance < 0` (the API will reject with a wallet error anyway).

### 21.8 `POST /schedules` Creates All Future Trips Atomically

Creating a schedule immediately generates all trip rows for the full date range. For a 3-month schedule with a daily 07:00 slot, that is ~90 trips inserted in one request. The response includes `tripsCreated` to confirm the count. This is by design and should not require frontend polling.

### 21.9 Departure Times Stored in UTC, Displayed in Cairo Time

All `departureTime` and `arrivalTime` values are returned as **UTC ISO 8601 strings**. Display them in **Africa/Cairo (UTC+2/UTC+3 DST)** timezone. The server never returns pre-formatted times except in certain notification bodies. Use a library like `date-fns-tz` or `Intl.DateTimeFormat` with `timeZone: "Africa/Cairo"`.

```typescript
const cairoTime = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(trip.departureTime));
```

---

## 22. Complete Endpoint Index

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `GET` | `/shuttle/lines` | ❌ | — | List shuttle lines (public) |
| `GET` | `/shuttle/lines/:id` | ❌ | — | Get shuttle line detail (public) |
| `GET` | `/shuttle/assignments` | ✅ | any | Driver-bus assignments |
| `GET` | `/shuttle/trips/:id/passengers` | ✅ | any | Passengers for a trip |
| `GET` | `/shuttle/lines/:id/passengers` | ✅ | any | Passengers for a line's next trip |
| `POST` | `/shuttle/bookings/:id/board` | ✅ | any | Board a passenger |
| `DELETE` | `/shuttle/bookings/:id` | ✅ | user | Passenger cancels their booking |
| `GET` | `/shuttle/my-debt` | ✅ | user | Get passenger debt & offence count |
| `GET` | `/routes` | ❌ | — | List routes |
| `POST` | `/routes` | ✅ | admin | Create route |
| `GET` | `/routes/:id` | ❌ | — | Get route |
| `PATCH` | `/routes/:id` | ✅ | admin | Update route |
| `DELETE` | `/routes/:id` | ✅ | admin | Delete route (cascade) |
| `GET` | `/routes/:id/stations` | ❌ | — | List stations |
| `POST` | `/routes/:id/stations` | ✅ | admin | Add station |
| `PATCH` | `/routes/:id/stations/:stationId` | ✅ | admin | Update station |
| `DELETE` | `/routes/:id/stations/:stationId` | ✅ | admin | Delete station |
| `GET` | `/trips` | ❌ | — | List trips |
| `POST` | `/trips` | ✅ | admin | Create trip |
| `GET` | `/trips/:id` | ❌ | — | Get trip |
| `PATCH` | `/trips/:id` | ✅ | admin | Update trip |
| `DELETE` | `/trips/:id` | ✅ | admin | Delete trip |
| `PATCH` | `/trips/:id/cancel` | ✅ | admin | Cancel trip *(deprecated — use POST /admin/trips/:id/cancel)* |
| `POST` | `/admin/trips/:id/cancel` | ✅ | admin | Cancel trip with full refunds |
| `GET` | `/trips/:id/chat` | ✅ | any | Get trip chat messages |
| `POST` | `/trips/:id/chat` | ✅ | any | Send trip chat message |
| `GET` | `/buses` | ✅ | admin | List buses |
| `POST` | `/buses` | ✅ | admin | Create bus |
| `GET` | `/buses/:id` | ✅ | admin | Get bus |
| `PATCH` | `/buses/:id` | ✅ | admin | Update bus |
| `DELETE` | `/buses/:id` | ✅ | admin | Delete bus |
| `GET` | `/schedules` | ✅ | admin | List schedules |
| `POST` | `/schedules` | ✅ | admin | Create schedule + auto-generate trips |
| `GET` | `/schedules/:id` | ✅ | admin | Get schedule |
| `PATCH` | `/schedules/:id` | ✅ | admin | Update schedule metadata |
| `DELETE` | `/schedules/:id` | ✅ | admin | Deactivate schedule + cancel future trips |
| `POST` | `/schedules/:id/generate` | ✅ | admin | Re-generate trips for schedule |
| `POST` | `/bookings` | ✅ | any | Book a seat on a trip |
| `GET` | `/bookings` | ✅ | admin | List all bookings |
| `GET` | `/bookings/:id` | ✅ | any | Get booking |
| `PATCH` | `/bookings/:id/cancel` | ✅ | any | Cancel booking |
| `GET` | `/admin/bookings` | ✅ | admin | List bookings (full detail) |
| `GET` | `/users/me/bookings` | ✅ | any | Get my bookings |
| `GET` | `/admin/shuttle-trips` | ✅ | admin | List trips (rich admin view) |
| `GET` | `/admin/shuttle-trips/:id` | ✅ | admin | Get trip detail with passengers |
| `GET` | `/admin/shuttle/cash-debts` | ✅ | admin | List passengers with debt |
| `PATCH` | `/admin/shuttle/cash-debts/:userId/collect` | ✅ | admin | Collect cash debt |
| `GET` | `/admin/shuttle/offences` | ✅ | admin | List shuttle offences |
| `PATCH` | `/admin/shuttle/offences/:userId/reset` | ✅ | admin | Reset offence count |
| `GET` | `/driver/trips` | ✅ | driver | List driver's trips |
| `GET` | `/driver/trips/:id` | ✅ | driver | Get trip with passenger list |
| `PATCH` | `/driver/trips/:id/accept` | ✅ | driver | Accept trip assignment |
| `PATCH` | `/driver/trips/:id/reject` | ✅ | driver | Reject trip assignment |
| `PATCH` | `/driver/trips/:id/start` | ✅ | driver | Start trip (requires check-in) |
| `PATCH` | `/driver/trips/:id/complete` | ✅ | driver | Complete trip |
| `PATCH` | `/driver/trips/:id/cancel` | ✅ | driver | Cancel trip |
| `GET` | `/driver/trips/:id/stations` | ✅ | driver | Get station progress |
| `PATCH` | `/driver/trips/:id/stations/:stationId/arrived` | ✅ | driver | Mark station arrived |
| `PATCH` | `/driver/trips/:id/stations/:stationId/completed` | ✅ | driver | Mark station boarding complete |
| `PATCH` | `/driver/bookings/:id/board` | ✅ | driver | Board passenger |
| `PATCH` | `/driver/bookings/:id/absent` | ✅ | driver | Mark passenger absent |

---

*This report was generated from a direct audit of the VeeGo backend source code (`artifacts/api-server/src/routes/`, `lib/db/src/schema/`) and the canonical OpenAPI specification (`openapi.yaml`). For discrepancies between this document and the live server, the server source code is authoritative.*
