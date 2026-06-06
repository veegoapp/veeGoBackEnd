# Driver App ↔ Backend API Cross-Audit Report

**Audit date:** 2026-06-06  
**Scope:** `veego-driver` (Expo React Native app, extracted from `attached_assets/veego-driver_*.zip`) vs. `artifacts/api-server` (Express/Drizzle backend)  
**Purpose:** Identify contract mismatches, missing endpoints, stale dead code, socket event gaps, and integration risks. Investigation only — no code changes made.

---

## Table of Contents

1. [Authentication & Session Management](#1-authentication--session-management)
2. [Service Type Naming & Mapping](#2-service-type-naming--mapping)
3. [Socket Event Contract](#3-socket-event-contract)
4. [Driver Online/Offline & Location Tracking](#4-driver-onlineoffline--location-tracking)
5. [Ride Lifecycle](#5-ride-lifecycle)
6. [Waiting Charge](#6-waiting-charge)
7. [Trip History & Lifecycle Actions](#7-trip-history--lifecycle-actions)
8. [Earnings](#8-earnings)
9. [Wallet & Payouts](#9-wallet--payouts)
10. [Driver Documents & KYC Onboarding](#10-driver-documents--kyc-onboarding)
11. [Shuttle Module](#11-shuttle-module)
12. [Service Control & Guard](#12-service-control--guard)
13. [Push Notifications](#13-push-notifications)
14. [Navigation & Screen Routing](#14-navigation--screen-routing)
15. [Dead Code & Legacy Artifacts](#15-dead-code--legacy-artifacts)

---

## 1. Authentication & Session Management

### 1.1 Login

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Endpoint | `POST /driver/auth/login` | `POST /driver/auth/login` | ✅ Aligned |
| Body | `{ credential, password }` | `DriverLoginBody: { credential, password }` | ✅ Aligned |
| Accepts email **or** phone as credential | Yes (`credential` field) | Yes (`OR email/phone WHERE role='driver'`) | ✅ Aligned |
| Response shape | `{ accessToken, refreshToken, user, driver }` | `{ accessToken, refreshToken, user, driver }` | ✅ Aligned |
| Suspended account handling | Not checked (no UI feedback for 403) | Returns `403 { error: "Account is suspended" }` | ⚠️ Driver app will surface a generic API error on suspension |

### 1.2 Registration

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Endpoint | `POST /driver/auth/register` | `POST /driver/auth/register` | ✅ Aligned |
| Body | `{ name, email, phone, password, licenseNumber?, nationalId? }` | Same schema | ✅ Aligned |
| Password minimum length | No client-side validation visible | `z.string().min(8)` | ⚠️ No client-side min-length guard — backend will reject short passwords with a raw error message |
| Response | `{ accessToken, refreshToken, user, driver }` | Same | ✅ Aligned |

### 1.3 Token Refresh

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Endpoint | `POST /auth/refresh` (in `api.ts` `refreshAccessToken()`) | `POST /auth/refresh` in `auth.ts` | ✅ Aligned |
| Body | `{ refreshToken }` | `RefreshTokenBody` | ✅ Aligned |
| Single-flight guard | Yes — `_refreshPromise` deduplicated | N/A | ✅ Good |
| Response expected | `{ accessToken }` | Returns `{ accessToken, refreshToken? }` | ✅ Compatible (driver app only reads `accessToken`) |

### 1.4 Logout

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Endpoint | `POST /driver/auth/logout` | `POST /driver/auth/logout` | ✅ Aligned |
| Side effects expected | Token cleared client-side | Server clears `refreshToken`, sets driver `isOnline=false` | ✅ Aligned |

---

## 2. Service Type Naming & Mapping

The driver app uses frontend display names (`CAR`, `MOTOR`, `DELIVERY`, `SHUTTLE`) and maps them to API keys before sending to the backend. This mapping is defined in both `service-select.tsx` and `serviceControlContext.tsx`.

```
Frontend (ServiceType)   API / Socket key   DB column value
CAR                  →   car              → car
MOTOR                →   scooter          → motorcycle  (service-map.ts on backend)
DELIVERY             →   delivery         → delivery
SHUTTLE              →   shuttle          → shuttle
```

| Item | Status | Notes |
|------|--------|-------|
| `MOTOR → scooter` translation present in app | ✅ | `BACKEND_TYPE_MAP` in `service-select.tsx` |
| `serviceControlContext.tsx` applies same map | ✅ | `FRONTEND_TO_BACKEND_MAP` used in `getServiceStatus()` |
| `service-map.ts` on backend maps `scooter → motorcycle` for DB | ✅ | Confirmed from prior service-naming fix |
| Socket `SERVICE_CONTROL_CHANGED` payload uses public key (`scooter`) | ✅ | Consistent across both sides |

**No issues found in this section.**

---

## 3. Socket Event Contract

### 3.1 Events Driver App Handles vs. Backend Emits

| Backend Event (socket-events.ts) | Driver App constants/socketEvents.ts | useRideSocket listens | Status |
|----------------------------------|--------------------------------------|-----------------------|--------|
| `ride:offer` | ✅ `RIDE_OFFER` | ✅ | Aligned |
| `ride:new_request` | ✅ `RIDE_NEW_REQUEST` | ✅ | Aligned |
| `ride:offer_expired` | ✅ `RIDE_OFFER_EXPIRED` | ✅ | Aligned |
| `ride:waiting:charge:started` | ✅ `WAITING_CHARGE_STARTED` | ✅ | Aligned |
| `ride:waiting:charge:updated` | ✅ `WAITING_CHARGE_UPDATED` | ✅ | Aligned |
| `ride:waiting:charge:capped` | ✅ `WAITING_CHARGE_CAPPED` | ✅ | Aligned |
| `driver:checkin:required` | ✅ `DRIVER_CHECKIN_REQUIRED` | ✅ | Aligned |
| `service:control:changed` | ✅ `SERVICE_CONTROL_CHANGED` | (serviceControlContext) | Aligned |
| `service:settings:changed` | ✅ `SERVICE_SETTINGS_CHANGED` | (serviceControlContext) | Aligned |
| `driver:location:ack` | ✅ `DRIVER_LOCATION_ACK` | ✅ | Aligned |
| `surge:updated` | ✅ `SURGE_UPDATED` | ✅ | Aligned |
| `sos:triggered` | ✅ `SOS_TRIGGERED` | ✅ | Aligned |
| `error` | ✅ `ERROR` | ✅ | Aligned |
| **`ride:no_longer_available`** | ❌ Missing | ❌ Not handled | **BUG** |
| **`ride:status_update`** | ❌ Missing | ❌ Not handled | **BUG** |
| **`driver:checkin:approved`** | ❌ Missing | ❌ Not handled | **BUG** |
| **`driver:checkin:rejected`** | ✅ `DRIVER_CHECKIN_REJECTED` | ✅ | Aligned |
| **`driver:cooldown:cleared`** | ❌ Missing | ❌ Not handled | **Bug** |
| **`ride:deviation:warning`** | ❌ Missing | ❌ Not handled | **Gap** |

### 3.2 Events Driver App Should Emit vs. Backend Expects

| Backend Event (Client→Server) | Driver App emits | Status |
|-------------------------------|-----------------|--------|
| `join` | ✅ Emitted on connect | Aligned |
| **`driver:location:update`** | ❌ **Never emitted** — app uses REST only | **Gap** |
| **`driver:ride:location`** | ❌ **Never emitted** — app uses REST only | Gap |
| `driver:status:online` | ❌ Not emitted — uses REST PATCH | Gap (REST works, but socket path unused) |
| `driver:status:offline` | ❌ Not emitted — uses REST PATCH | Gap |
| `driver:status:busy` | ❌ Not emitted | Gap |
| `driver:trip:start` | ❌ Not emitted — uses REST only | Gap |
| `driver:trip:complete` | ❌ Not emitted — uses REST only | Gap |

### 3.3 Critical Issues

**BUG — `ride:no_longer_available` not handled:**  
When a passenger cancels a ride before the driver accepts, the backend emits `ride:no_longer_available` to the driver. The driver app has no listener for this event, so the offer card remains on screen even after the ride is gone. The next action will hit a 404/409.

**BUG — `driver:checkin:approved` not handled:**  
The driver app handles `DRIVER_CHECKIN_REJECTED` but not `DRIVER_CHECKIN_APPROVED`. A driver who passes checkin gets no UI feedback; the approval is silently lost.

**BUG — `driver:cooldown:cleared` not handled:**  
Admin can clear a dispatch cooldown and the backend emits this event. The driver app will not react to it in real-time and must wait for the next manual refresh.

---

## 4. Driver Online/Offline & Location Tracking

### 4.1 Online/Offline Toggle

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Go online | `PATCH /driver/status/online` | `router.patch("/driver/status/online")` | ✅ Aligned |
| Go offline | `PATCH /driver/status/offline` | `router.patch("/driver/status/offline")` | ✅ Aligned |

### 4.2 Location Update

| Item | Driver App (`endpoints.driver.updateLocation`) | Backend (`LocationBody`) | Status |
|------|-------------------------------------------------|--------------------------|--------|
| Endpoint | `PATCH /driver/location` | `PATCH /driver/location` | ✅ Aligned |
| `latitude` | `number` | `z.number().min(-90).max(90)` | ✅ |
| `longitude` | `number` | `z.number().min(-180).max(180)` | ✅ |
| `speed` | `number \| undefined` | `z.number().optional()` | ✅ |
| `heading` | `number \| undefined` | `z.number().optional()` | ✅ |
| **`tripId`** | **`string \| undefined`** | **`z.number().optional()`** | **❌ TYPE MISMATCH** |

**BUG — `tripId` type mismatch in location update:**  
The driver app sends `tripId` as a `string` (e.g., `"42"`). The backend Zod schema expects `z.number()`. Zod's `safeParse` will reject a string as a number, silently stripping the field or returning a validation error. The location update will succeed (as `tripId` is optional and the error is non-fatal), but the trip association on the location record will never be set.

**Gap — Location not emitted via socket:**  
The backend also has a socket path for location (`driver:location:update`, `driver:ride:location`). The driver app exclusively uses the REST PATCH endpoint. This is not a bug if the backend processes REST-based location correctly, but the socket path is never exercised by the driver app.

---

## 5. Ride Lifecycle

### 5.1 Endpoint Coverage

| Action | Driver App endpoint | Backend endpoint | Status |
|--------|---------------------|-----------------|--------|
| List available | `GET /driver/rides/available` | `GET /driver/rides/available` | ✅ |
| Get by ID | `GET /rides/{rideId}` | `GET /rides/:id` | ✅ |
| Accept | `PATCH /driver/rides/{id}/accept` | `PATCH /driver/rides/:id/accept` | ✅ |
| Arrived | `PATCH /driver/rides/{id}/arrived` | `PATCH /driver/rides/:id/arrived` | ✅ |
| Start | `PATCH /driver/rides/{id}/start` | `PATCH /driver/rides/:id/start` | ✅ |
| Complete | `PATCH /driver/rides/{id}/complete` | `PATCH /driver/rides/:id/complete` | ✅ |
| **Decline** | **`POST /driver/rides/{id}/decline`** | **`POST` deprecated → use `PATCH`** | **⚠️ Deprecated** |
| Rate rider | `POST /driver/rides/{id}/rate-rider` | `POST /driver/rides/:id/rate-rider` | ✅ |
| **Get active ride** | **`GET /driver/rides/active`** | **Not found in routes** | **❌ MISSING BACKEND ENDPOINT** |

### 5.2 Issue Details

**BUG — `/driver/rides/active` does not exist on the backend:**  
`endpoints.rides.active()` is called in `app/(tabs)/index.tsx` to recover the driver's current active ride on app launch. The backend has `/driver/rides/available` but no `/driver/rides/active`. This call will return a `404`. On-app-launch ride recovery silently fails, meaning a driver who restarts the app mid-ride will see the home screen instead of the active ride screen.

**⚠️ Deprecation — `POST /driver/rides/:id/decline`:**  
The backend has a `// TODO (deprecated)` comment on the `POST` version and instructs callers to use `PATCH`. The driver app still uses `api.post(...)` for decline. The endpoint still works but will be removed in a future cleanup. The driver app should be updated to use `PATCH /driver/rides/{id}/decline`.

### 5.3 Ride Screen Phase Recovery

The `app/ride/[rideId].tsx` screen maps backend `status` strings to local `Phase` values:

```
backend status   → local Phase
"arrived"        → 'arrived'
"in_trip"        → 'in_trip'
"active"         → 'in_trip'
"in_progress"    → 'in_trip'
"completed"      → 'completed'
(any other)      → 'to_pickup'
```

**Risk:** If the backend returns a status outside this set (e.g. `"accepted"`, `"pending"`) on ride recovery, the phase defaults to `'to_pickup'`, which may not reflect actual state. The backend ride status enum should be confirmed against this map.

---

## 6. Waiting Charge

### 6.1 Architecture Issue — Duplicate Socket Connection

`useWaitingCharge` (`hooks/useWaitingCharge.ts`) creates its **own independent `socket.io` connection** at the same `SOCKET_URL`. The main socket is managed by `socketContext.tsx`. When the ride screen mounts with the driver in the `'arrived'` phase, both connections are alive simultaneously:

- `socketContext.tsx` connection: joined to `driver:{driverId}` room, handles ride offers, service control, etc.
- `useWaitingCharge` connection: also joined to `driver:{driverId}` room, handles `WAITING_CHARGE_UPDATED` and `WAITING_CHARGE_CAPPED`.

This results in **two persistent WebSocket connections from the same client to the same server room**. Effects:
1. Both connections receive all events delivered to `driver:{driverId}`. Every event (ride offers, service control changes, etc.) is duplicated to two handlers.
2. `useRideSocket` (`hooks/useRideSocket.ts`) **also** listens for `WAITING_CHARGE_UPDATED` and `WAITING_CHARGE_CAPPED` on the main socket. This means those two events trigger handlers in **both** `useRideSocket` and `useWaitingCharge` concurrently — dual state updates from the same payload.
3. Server-side connection count for the driver is doubled while `RideScreen` is mounted.

**Recommendation:** `useWaitingCharge` should subscribe to events via `socketContext` rather than create a second connection. Remove the `io(...)` call from `useWaitingCharge` and accept the existing socket via a prop or hook.

### 6.2 Event Contract

| Event | Driver App | Backend | Status |
|-------|-----------|---------|--------|
| `ride:waiting:charge:updated` | ✅ Handled in `useWaitingCharge` | ✅ Emitted | Aligned |
| `ride:waiting:charge:capped` | ✅ Handled in `useWaitingCharge` | ✅ Emitted | Aligned |
| `ride:waiting:charge:started` | ✅ In constants, handled by `useRideSocket` | ✅ Emitted | Aligned |

---

## 7. Trip History & Lifecycle Actions

### 7.1 Trip Endpoints

| Action | Driver App | Backend | Status |
|--------|-----------|---------|--------|
| List trips | `GET /driver/trips?status=&page=&limit=` | `GET /driver/trips` (driver.ts) | ✅ |
| Trip detail | `GET /driver/trips/{tripId}` | `GET /driver/trips/:id` | ✅ |
| Accept | `PATCH /driver/trips/{id}/accept` | Backend driver.ts | ✅ |
| Reject | `PATCH /driver/trips/{id}/reject` | Backend driver.ts | ✅ |
| Start | `PATCH /driver/trips/{id}/start` | Backend driver.ts | ✅ |
| Complete | `PATCH /driver/trips/{id}/complete` | Backend driver.ts | ✅ |
| Cancel | `PATCH /driver/trips/{id}/cancel` `{ reason }` | Backend driver.ts `CancelTripBody` | ✅ |
| Stations | `GET /driver/trips/{id}/stations` | Backend driver.ts | ✅ |
| Station arrived | `PATCH /driver/trips/{id}/stations/{stationId}/arrived` | Backend driver.ts | ✅ |
| Station completed | `PATCH /driver/trips/{id}/stations/{stationId}/completed` | Backend driver.ts | ✅ |

### 7.2 Navigation Bug in Trips Screen

`app/(tabs)/trips.tsx` navigates to `/trips/${trip.id}` on card tap. The Expo Router file layout has no `app/trips/[tripId].tsx` route. This is a **navigation dead-end** — tapping any trip card throws a "Route not found" error. The correct route is `app/ride/[rideId].tsx` for car rides; trips may need their own dedicated detail screen.

---

## 8. Earnings

### 8.1 Endpoint Coverage

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Summary | `GET /earnings/summary` | `GET /earnings/summary` (earnings.ts, role-aware) | ✅ Aligned |
| Weekly breakdown | `GET /earnings/weekly?weeks=4` | `GET /earnings/weekly` (earnings.ts) | ✅ Aligned |

### 8.2 Response Shape Notes

- Backend returns `amount` as a numeric (already coerced via `fmtEarning`) in the earnings list.
- `app/(tabs)/earnings.tsx` calls `parseFloat(String(...))` defensively — works with both string and number.
- **No issues found.**

---

## 9. Wallet & Payouts

### 9.1 Endpoint Coverage

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Balance | `GET /driver/wallet/balance` | `GET /driver/wallet/balance` (driver.ts line 986) | ✅ Aligned |
| Transactions | `GET /driver/earnings/history` | `GET /driver/earnings/history` (driver.ts line 949) | ✅ Aligned |
| Payout | `POST /driver/wallet/payout` | `POST /driver/wallet/payout` (driver.ts line 896) | ✅ Aligned |
| Payout methods | `GET /driver/wallet/payout-methods` | `GET /driver/wallet/payout-methods` (driver.ts line 854) | ✅ Aligned |
| Add payout method | `POST /driver/wallet/payout-methods` | `POST /driver/wallet/payout-methods` (driver.ts line 872) | ✅ Aligned |
| Remove payout method | `DELETE /driver/wallet/payout-methods/{id}` | `DELETE /driver/wallet/payout-methods/:id` (driver.ts line 883) | ✅ Aligned |

### 9.2 Semantic Mismatch — Transactions via Earnings History

`endpoints.wallet.transactions` is categorised under `wallet` in `api.ts` but calls `GET /driver/earnings/history`. The response will contain `driverEarnings` records (trip-level payouts), not `walletTransactions` records. This is functionally usable but semantically inconsistent: the wallet tab shows earnings rows styled as transactions. If proper wallet top-up/refund records from `walletTransactionsTable` are ever needed in the driver app, a separate call to `GET /wallet/transactions` would be required.

### 9.3 Balance Source

`GET /driver/wallet/balance` returns earnings-based balance (sum of confirmed/paid/pending from `driverEarningsTable`), not `users.walletBalance` from `walletTransactionsTable`. This is a separate "driver earnings wallet" from the passenger wallet system. Both exist in the DB — the driver app correctly targets the earnings-based one.

---

## 10. Driver Documents & KYC Onboarding

### 10.1 Onboarding Flow

The onboarding flow spans four screens labeled "Step 1–4":
- **Step 1** — `login.tsx` registration form (unlabeled as step 1 in UI)
- **Step 2** — `register-info.tsx` → `PATCH /driver/me`
- **Step 3** — `documents.tsx` → `GET/POST /driver/me/documents`
- **Step 4** — `selfie.tsx` → `POST /driver/me/documents` (type `selfie`)

### 10.2 Critical Issue — register-info.tsx Sends Unsupported Fields

`register-info.tsx` sends `PATCH /driver/me` with `{ name, email, dateOfBirth }`.

Backend `UpdateDriverMeBody` schema only allows:
```
name, phone, vehicleType, licenseNumber, nationalId
```

`email` and `dateOfBirth` are **not in the Drizzle schema or Zod validator**. They are silently stripped by Zod's `safeParse`. Neither field is persisted:
- The driver's email is set at registration and cannot be updated via this endpoint.
- `dateOfBirth` has no column in `driversTable`.

Additionally, the `register-info.tsx` profile photo picker lets the driver select a photo, but the selected photo is **never uploaded** — only `name/email/dateOfBirth` are sent via `PATCH /driver/me`. The photo state is dead UI.

### 10.3 Document Upload

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Upload endpoint | `POST /driver/me/documents` (raw `fetch` + `FormData`) | `POST /driver/me/documents` (driverDocuments.ts) | ✅ |
| Auth header | Sent manually with token | `authenticate` middleware | ✅ |
| List endpoint | `GET /driver/me/documents` | `GET /driver/me/documents` | ✅ |
| `Content-Type` | Omitted (browser sets `multipart/form-data` automatically with boundary) | Multer parser | ✅ |

---

## 11. Shuttle Module

### 11.1 Endpoint Coverage

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| List routes | `GET /shuttle/lines` | `GET /shuttle/lines` (shuttle.ts) | ✅ |
| Route detail | `GET /shuttle/lines/{lineId}` | `GET /shuttle/lines/:id` | ✅ |
| Activate route | `POST /shuttle/lines/{lineId}/activate` | `POST /shuttle/lines/:id/activate` | ✅ |
| Complete route | `POST /shuttle/lines/{lineId}/complete` | `POST /shuttle/lines/:id/complete` | ✅ |
| Trip passengers | `GET /shuttle/trips/{tripId}/passengers` | `GET /shuttle/trips/:id/passengers` | ✅ |
| Board booking | `POST /shuttle/bookings/{bookingId}/board` | `POST /shuttle/bookings/:id/board` | ✅ |
| Book route | `POST /shuttle/lines/{lineId}/book` `{ weekStart, weekEnd, departureTime }` | `POST /shuttle/lines/:id/book` | ✅ |
| Assignments | `GET /shuttle/assignments` | `GET /shuttle/assignments` | ✅ |

### 11.2 ShuttleContext Data Fetching Strategy

`shuttleContext.tsx` uses a two-query approach:
1. `endpoints.shuttle.lines()` → `GET /shuttle/lines` — fetches all routes (public, returns `{ data: [...] }`)
2. `endpoints.trips.list()` → `GET /driver/trips` — fetches this driver's trips to cross-reference against routes

It then correlates trips to routes by `routeId`. This is correct but has a side effect: `/shuttle/lines` **has no `authenticate` middleware** (line 45 of shuttle.ts), so it is a public endpoint. The driver app sends `Authorization` headers anyway, which is harmless but worth noting — any unauthenticated client can retrieve the full routes list.

### 11.3 Response Shape Handling

`extractRoutes()` handles three response shapes: bare array, `{ data: [...] }`, or `{ lines: [...] }`. The backend returns `{ data: [], total: 0 }` for empty results and `{ data: [...] }` otherwise — so only the `data` branch is exercised. The `lines` fallback and bare-array branches are defensive but unused.

### 11.4 Trip Detail for Bookings

`shuttleContext.tsx` calls `endpoints.trips.detail(activeTripId)` → `GET /driver/trips/{tripId}` to load the booking list for the active trip. The `BackendTrip` type expects `bookings?: { id, passengerName?, passengerPhone?, passengerAvatar? }[]`. Whether the backend trip detail endpoint eagerly includes bookings depends on the join in `driver.ts`. If bookings are not embedded in the trip detail response, `passengers` will always be empty and the boarding screen will show no passengers to check in.

---

## 12. Service Control & Guard

### 12.1 Endpoint

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Fetch | `GET /services/control` | `GET /services/control` (serviceControls.ts) | ✅ |
| Response | `{ data: ServiceControl[] }` | `{ data: [...] }` | ✅ |

### 12.2 Socket Subscription

`serviceControlContext.tsx` subscribes to `SERVICE_CONTROL_CHANGED` and `SERVICE_SETTINGS_CHANGED` via the main socket. The handler calls `refresh()` (re-fetches REST) on each event. This is correct — the socket event triggers a fresh fetch rather than relying on socket payload alone.

### 12.3 Service Guard Fail-Secure Behaviour

`useServiceGuard` returns `LOADING_BLOCKED` (displayMode `'unavailable'`) while the config is loading, and `ERROR_BLOCKED` on fetch failure. Both block access to the active service screen. This is intentional and correctly implements the spec's fail-secure requirement.

**No issues found in this section.**

---

## 13. Push Notifications

### 13.1 Registration

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| Endpoint | `POST /users/me/push-token` | Routes in users.ts | ✅ (inferred) |
| Payload | `{ token, platform: 'ios' \| 'android' \| 'web' }` | Standard Expo push token registration | ✅ |
| Timing | Registered on Expo token receipt (app startup) | N/A | ✅ |

### 13.2 In-App Notification List

| Item | Driver App | Backend | Status |
|------|-----------|---------|--------|
| List | `GET /notifications` | `GET /notifications` (notifications.ts) | ✅ |
| Mark read | `PATCH /notifications/{id}/read` | `PATCH /notifications/:id/read` | ✅ |

---

## 14. Navigation & Screen Routing

### 14.1 Trip Detail Route — MISSING

`app/(tabs)/trips.tsx` calls `router.push('/trips/${trip.id}')`. The Expo Router file tree has no `app/trips/[tripId].tsx` file. This navigates to a non-existent route and will throw a runtime navigation error.

**Affected flow:** Any driver tapping on a past/active trip in the Trips tab.

### 14.2 Messages Route — MISSING

`app/ride/[rideId].tsx` has a "Message rider" button that calls `router.push('/messages')`. There is no `app/messages.tsx` or `app/messages/` directory in the driver app. This navigates to a non-existent route.

**Affected flow:** Any driver tapping the message icon during an active ride.

### 14.3 Ride Recovery on App Launch

`app/(tabs)/index.tsx` calls `endpoints.rides.active()` → `GET /driver/rides/active` to restore an interrupted ride. As noted in §5, this endpoint does not exist on the backend. The home screen will default to the idle state even if the driver has an active ride.

### 14.4 Phase Recovery Logic — Status Enum Gap

The `ride/[rideId].tsx` status→phase map does not handle `"accepted"` or `"pending"` backend statuses. If a ride is newly accepted and the driver refreshes the app, the status `"accepted"` maps to the fallback `'to_pickup'` phase — which happens to be correct behaviour, but it is implicit rather than declared.

---

## 15. Dead Code & Legacy Artifacts

### 15.1 Unused OTP Auth Endpoints

`lib/api.ts` exposes:
```ts
endpoints.auth.sendOtp(phone)    // POST /auth/send-otp
endpoints.auth.verifyOtp(phone, otp) // POST /auth/verify-otp
```

No screen in the driver app calls either of these. All authentication goes through `driverLogin` / `driverRegister`. These endpoints appear to be leftovers from a pre-password OTP auth design. They add noise but are harmless.

### 15.2 Deprecated `POST` Decline Endpoint

`endpoints.rides.decline` uses `api.post(...)` for `POST /driver/rides/{id}/decline`. The backend marks this as `// TODO (deprecated) — use PATCH`. The POST still works but should be updated to `api.patch(...)` before the backend removes it.

### 15.3 Duplicate Driver Settings Endpoints

Backend `driver.ts` has **two** settings endpoint pairs:
- `/driver/me/settings` (GET line 321, PATCH line 342)
- `/driver/settings` (GET line 1004 "FIXED", PATCH line 1026 "FIXED")

Driver app calls `/driver/me/settings`. Both route groups are live. The "FIXED" comment on `/driver/settings` suggests it was an intentional second registration. These should be consolidated to a single canonical path.

### 15.4 Register-Info Photo Picker — Dead UI

The photo picker in `register-info.tsx` (step 2 of onboarding) allows the driver to select a profile photo. The image is stored in local state but never uploaded. The selfie upload (step 4) correctly uses `POST /driver/me/documents`. The step-2 photo picker has no upload logic and serves no functional purpose.

### 15.5 `endpoints.shuttle.assignments` — Unused

`endpoints.shuttle.assignments()` → `GET /shuttle/assignments` is defined in `api.ts` but not called from any screen or context. The `shuttleContext.tsx` fetches routes and trips directly. This endpoint is dead code in the driver app.

---

## Summary Table

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| 1 | `ride:no_longer_available` not handled — offer card stays after ride is gone | 🔴 High | `constants/socketEvents.ts`, `useRideSocket` |
| 2 | `driver:checkin:approved` not handled — approval silently lost | 🔴 High | `constants/socketEvents.ts` |
| 3 | `GET /driver/rides/active` missing on backend — app launch ride recovery fails | 🔴 High | `rides.ts` backend |
| 4 | `useWaitingCharge` creates duplicate socket connection — doubles server load, dual event handlers | 🔴 High | `hooks/useWaitingCharge.ts` |
| 5 | Trips tab navigates to `/trips/{id}` — route does not exist | 🔴 High | `app/(tabs)/trips.tsx` |
| 6 | `tripId` sent as `string` in location update — backend expects `number`, trips never linked | 🟠 Medium | `lib/api.ts` `updateLocation` |
| 7 | `register-info.tsx` sends `email` + `dateOfBirth` — both silently dropped by backend | 🟠 Medium | `app/register-info.tsx` |
| 8 | `driver:cooldown:cleared` not handled — cooldown lift not reflected in real-time | 🟠 Medium | `constants/socketEvents.ts` |
| 9 | `router.push('/messages')` in ride screen — route does not exist | 🟠 Medium | `app/ride/[rideId].tsx` |
| 10 | `POST /driver/rides/:id/decline` deprecated — should use PATCH | 🟡 Low | `lib/api.ts` |
| 11 | OTP endpoints defined but never called — dead code | 🟡 Low | `lib/api.ts` |
| 12 | Register-info photo picker never uploads — dead UI | 🟡 Low | `app/register-info.tsx` |
| 13 | `endpoints.shuttle.assignments` never called — dead endpoint reference | 🟡 Low | `lib/api.ts` |
| 14 | Duplicate `/driver/me/settings` + `/driver/settings` on backend | 🟡 Low | `artifacts/api-server/src/routes/driver.ts` |
| 15 | `GET /shuttle/lines` has no auth middleware — public route | 🟡 Low | `artifacts/api-server/src/routes/shuttle.ts` |
| 16 | `ride:deviation:warning` not handled in driver app | 🟡 Low | `constants/socketEvents.ts` |
| 17 | Shuttle bookings embedded in trip detail — may not be included in response | ℹ️ Risk | `shuttleContext.tsx` |
| 18 | Suspended account (403 from login) shows raw error, no targeted UI | ℹ️ Info | `app/login.tsx` |

---

*Report generated from direct source inspection of `/tmp/driver-app/` and `artifacts/api-server/src/`. No code changes made.*
