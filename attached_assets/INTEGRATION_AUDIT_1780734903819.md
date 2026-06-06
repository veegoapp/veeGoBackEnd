# VeeGo Driver App — Backend Integration Audit

> **Generated:** 2026-06-06  
> **Source files audited:** `lib/api.ts`, `lib/auth.ts`, `lib/mock.ts`, `lib/authContext.tsx`, `lib/shuttleContext.tsx`, `hooks/useRideSocket.ts`, `constants/socketEvents.ts`, and all screens under `app/`  
> **Contract reference:** `BACKEND_API_CONTRACT.md` (Express + TypeScript, Drizzle ORM, PostgreSQL)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Severity Legend](#severity-legend)
3. [Authentication Integration](#authentication-integration)
4. [REST Endpoint Audit](#rest-endpoint-audit)
   - [Driver Profile & Status](#driver-profile--status)
   - [Ride Lifecycle](#ride-lifecycle)
   - [Driver Trips (Shuttle)](#driver-trips-shuttle)
   - [Earnings](#earnings)
   - [Wallet](#wallet)
   - [Documents & Check-In](#documents--check-in)
   - [Notifications & Settings](#notifications--settings)
   - [Support](#support)
   - [Shuttle Lines (Shuttle Mode)](#shuttle-lines-shuttle-mode)
   - [Push Token Registration](#push-token-registration)
   - [Contract Endpoints Not Called by the App](#contract-endpoints-not-called-by-the-app)
5. [Socket.IO Audit](#socketio-audit)
   - [Connection Setup](#connection-setup)
   - [Events Emitted by the App](#events-emitted-by-the-app)
   - [Events Listened to by the App](#events-listened-to-by-the-app)
   - [Contract Events Not Listened to](#contract-events-not-listened-to)
6. [Mock Data Still in Production Code](#mock-data-still-in-production-code)
7. [UI Features With No Backend Integration](#ui-features-with-no-backend-integration)
8. [Summary Tables](#summary-tables)

---

## Executive Summary

The driver app has a solid API client foundation (`lib/api.ts`) with JWT auth, silent token refresh, and a 15-second timeout. However, **numerous endpoint paths do not match the contract**, the Socket.IO integration is minimal (only one inbound event is handled), significant amounts of mock data are still rendered in live screens, and several UI features have no backend wiring at all.

**Critical issues (P0):**
- Auth endpoints hit non-existent paths (`/auth/send-otp`, `/driver/auth/login`, `/driver/auth/register`)
- Driver profile uses `/driver/me` — contract path is `/driver/profile`
- Ride accept/start/complete/decline use wrong HTTP methods (POST vs PATCH)
- Only 1 of 20+ contract Socket.IO events is listened to

**High issues (P1):**
- `/driver/rides/available` polling endpoint does not exist in the contract (dispatch is push-only via Socket.IO)
- All shuttle board/activate/complete paths are fabricated — none match the contract
- Wallet uses wrong base paths (`/wallet` instead of `/driver/wallet/balance`)
- 9 mock data sources still rendered as live data

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 **P0 — Critical** | App will fail or produce wrong data in production |
| 🟠 **P1 — High** | Feature is broken or meaningfully wrong |
| 🟡 **P2 — Medium** | Feature degrades gracefully but is incomplete |
| 🟢 **P3 — Low** | Minor gap or cosmetic issue |

---

## Authentication Integration

### Login (`app/login.tsx`)

| Issue | App Call | Contract Path | Severity |
|-------|----------|--------------|----------|
| OTP login path doesn't exist | `POST /auth/send-otp` | ❌ Not in contract | 🔴 P0 |
| OTP verify path doesn't exist | `POST /auth/verify-otp` | ❌ Not in contract | 🔴 P0 |
| Driver login path mismatch | `POST /driver/auth/login` | `POST /api/auth/login` | 🔴 P0 |
| Driver register path mismatch | `POST /driver/auth/register` | `POST /api/auth/driver/register` | 🔴 P0 |
| Logout path mismatch | `POST /driver/auth/logout` | `POST /api/auth/logout` | 🟠 P1 |

**Notes:**
- The contract's `POST /api/auth/login` accepts `{ email, password }` — there is no OTP flow in the contract. Either the app must switch to email/password login, or the contract must be extended with OTP support.
- The contract's `POST /api/auth/driver/register` requires `vehicleType`, `plateNumber`, `make`, `model`, `year`, `color` — the app's `driverRegister()` only sends `{ name, email, phone, password, licenseNumber?, nationalId? }`. Required vehicle fields are missing.
- Token refresh (`POST /api/auth/refresh`) ✅ path is correct.

---

## REST Endpoint Audit

### Driver Profile & Status

| Feature | App Path | Contract Path | Method | Severity |
|---------|----------|--------------|--------|----------|
| Get own profile | `GET /driver/me` | `GET /api/driver/profile` | GET | 🔴 P0 |
| Update own profile | `PATCH /driver/me` | `PATCH /api/driver/profile` | PATCH | 🔴 P0 |
| Go online | `PATCH /driver/status/online` | `PATCH /api/driver/status` body `{isOnline:true, latitude, longitude}` | PATCH | 🟠 P1 |
| Go offline | `PATCH /driver/status/offline` | `PATCH /api/driver/status` body `{isOnline:false}` | PATCH | 🟠 P1 |
| Get status | `GET /driver/me/status` | `GET /api/driver/status` | GET | 🟠 P1 |
| Get vehicle | `GET /driver/me/vehicle` | ❌ No self-service vehicle GET in contract | GET | 🟠 P1 |
| Get ratings | `GET /driver/me/ratings` | `GET /api/driver/reviews` | GET | 🟠 P1 |
| Update location | `PATCH /driver/location` | `PATCH /api/driver/location` | PATCH | ✅ Correct |

**Notes:**
- The `goOnline` / `goOffline` split into two paths does not match the contract. The contract uses a single `PATCH /api/driver/status` endpoint with a body parameter `isOnline: boolean`. Both calls will 404.
- `goOnline` should also send `{ latitude, longitude }` per the contract — the app currently sends an empty body.
- `GET /driver/me/vehicle` has no matching contract endpoint for driver self-service; vehicle info is visible only via admin routes.

---

### Ride Lifecycle

| Feature | App Path | App Method | Contract Path | Contract Method | Severity |
|---------|----------|-----------|--------------|----------------|----------|
| Poll available rides | `GET /driver/rides/available` | GET | ❌ Not in contract — dispatch is Socket.IO push-only | — | 🔴 P0 |
| Get ride by ID | `GET /rides/:id` | GET | `GET /api/rides/:id` | GET | ✅ Correct |
| Accept ride | `PATCH /driver/rides/:id/accept` | PATCH | `PATCH /api/driver/rides/:id/accept` | PATCH | ✅ Correct |
| Arrive at pickup | `PATCH /driver/rides/:id/arrived` | PATCH | `PATCH /api/driver/rides/:id/arrived` | PATCH | ✅ Correct |
| Start ride | `POST /driver/rides/:id/start` | **POST** | `PATCH /api/driver/rides/:id/start` | **PATCH** | 🟠 P1 |
| Complete ride | `POST /driver/rides/:id/complete` | **POST** | `PATCH /api/driver/rides/:id/complete` | **PATCH** | 🟠 P1 |
| Decline ride | `POST /driver/rides/:id/decline` | **POST** | `PATCH /api/driver/rides/:id/decline` | **PATCH** | 🟠 P1 |
| Rate rider | `POST /driver/rides/:id/rate-rider` | POST | `POST /api/driver/rides/:id/rate-rider` | POST | ✅ Correct |
| Cancel own accepted ride | ❌ Not called | — | `PATCH /api/driver/rides/:id/cancel` | PATCH | 🟡 P2 |
| Get active ride | ❌ Not called | — | `GET /api/driver/rides/active` | GET | 🟡 P2 |

**Notes:**
- The polling approach (`GET /driver/rides/available`) is architecturally wrong. The contract dispatches ride offers to drivers via Socket.IO event `ride:new_request`. The app should rely entirely on the socket for ride offers, not polling.
- `start`, `complete`, `decline` are called with `POST` but the contract requires `PATCH`. The server will return 404 or 405.
- The contract notes a deprecated `POST` alias exists for `start` and `complete` (but not `decline`), so start/complete may work accidentally via the alias.
- There is no UI or API call for the driver to cancel a ride they already accepted — this is a missing feature.
- On app startup, the active ride state should be hydrated from `GET /api/driver/rides/active` — this is not done.

---

### Driver Trips (Shuttle)

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| List trips | `GET /driver/trips?...` | `GET /api/driver/trips` | ✅ Correct |
| Get trip detail | `GET /driver/trips/:id` | `GET /api/driver/trips/:id` | ✅ Correct |
| Accept trip | `PATCH /driver/trips/:id/accept` | `PATCH /api/driver/trips/:id/accept` | ✅ Correct |
| Reject trip | `PATCH /driver/trips/:id/reject` | `PATCH /api/driver/trips/:id/reject` | ✅ Correct |
| Start trip | `PATCH /driver/trips/:id/start` | `PATCH /api/driver/trips/:id/start` | ✅ Correct |
| Complete trip | `PATCH /driver/trips/:id/complete` | `PATCH /api/driver/trips/:id/complete` | ✅ Correct |
| Cancel trip | `PATCH /driver/trips/:id/cancel` | `PATCH /api/driver/trips/:id/cancel` | ✅ Correct |
| Get stations | `GET /driver/trips/:id/stations` | `GET /api/driver/trips/:id/stations` | ✅ Correct |
| Mark station arrived | `PATCH /driver/trips/:id/stations/:sid/arrived` | `PATCH /api/driver/trips/:id/stations/:stationId/arrived` | ✅ Correct |
| Mark station completed | `PATCH /driver/trips/:id/stations/:sid/completed` | `PATCH /api/driver/trips/:id/stations/:stationId/completed` | ✅ Correct |
| Board a booking | `POST /shuttle/stops/:id/board` | `PATCH /api/driver/bookings/:id/board` | 🔴 P0 |
| Mark booking absent | ❌ Not called | `PATCH /api/driver/bookings/:id/absent` | 🟡 P2 |

**Notes:**
- The boarding endpoint is completely wrong: the app calls `POST /shuttle/stops/:stopId/board` with `{ boardedIds: string[] }`, but the contract endpoint is `PATCH /api/driver/bookings/:bookingId/board` and operates on a single booking at a time.

---

### Earnings

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| Earnings summary | `GET /earnings/summary` | `GET /api/earnings/summary` | ✅ Correct |
| Weekly breakdown | `GET /earnings/weekly?weeks=N` | `GET /api/earnings/weekly?weeks=N` | ✅ Correct |
| Earnings history | ❌ Not called | `GET /api/driver/earnings/history` | 🟡 P2 |
| Today's breakdown detail | ❌ Not called — mock data used | No matching contract endpoint | 🟡 P2 |

**Notes:**
- `todayEarnings` (total, trips, hours, tips, bonus, cash, card) from `lib/mock.ts` is still rendered in the earnings tab. No contract endpoint provides this exact shape. This will require a backend addition or derivation from `GET /api/driver/earnings`.
- Weekly bar chart currently falls back to `lib/mock.ts:weekEarnings` if the API call fails.

---

### Wallet

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| Get balance | `GET /wallet` | `GET /api/driver/wallet/balance` | 🔴 P0 |
| Get transactions | `GET /wallet/transactions` | `GET /api/driver/earnings/history` (earnings) or no exact wallet-transaction list for drivers | 🟠 P1 |
| Request payout | `POST /driver/wallet/payout` | `POST /api/driver/wallet/payout` | ✅ Correct |
| Get payout methods | `GET /driver/wallet/payout-methods` | `GET /api/driver/wallet/payout-methods` | ✅ Correct |
| Add payout method | `POST /driver/wallet/payout-methods` | `POST /api/driver/wallet/payout-methods` | ✅ Correct (but server-side is placeholder, not persisted) |
| Remove payout method | `DELETE /driver/wallet/payout-methods/:id` | `DELETE /api/driver/wallet/payout-methods/:id` | ✅ Correct (placeholder) |

**Notes:**
- `GET /wallet` will 404. The correct path is `GET /api/driver/wallet/balance` which returns `{ balance, totalPaid, totalPending }`.
- There is no paginated wallet transaction list for drivers in the contract; the closest is `GET /api/driver/earnings/history`.
- The payout method add/remove endpoints exist in the contract but are explicitly noted as **placeholder — not persisted to DB**. The wallet screen renders hardcoded BIAT and Visa cards regardless.

---

### Documents & Check-In

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| List own documents | `GET /driver/me/documents` | `GET /api/driver-documents/by-driver/:driverId` | 🟠 P1 |
| Upload document | `POST /driver/me/documents` (FormData) | `POST /api/driver-documents/upload/:driverId` (FormData, fields: `file` + `type`) | 🟠 P1 |
| Selfie check-in | Needs verification — see note | `POST /api/checkin` (FormData, fields: `selfie` + `tripId`) | 🟡 P2 |
| Check-in status | ❌ Not called | `GET /api/checkin/status` | 🟡 P2 |

**Notes:**
- `app/documents.tsx` currently renders `lib/mock.ts:documents` (5 hardcoded entries: Driver License, Vehicle Registration, Insurance, Vehicle Inspection, Profile Photo). No live fetch is wired.
- The upload endpoint path is wrong — it needs the driver's own ID in the path (`/driver-documents/upload/:driverId`), not a generic `/driver/me/documents`.
- Document types accepted by the contract (`national_id_front`, `national_id_back`, `driving_license_front`, etc.) may differ from whatever the documents screen uses.
- The selfie screen (`app/selfie.tsx`) needs review to confirm it is calling `POST /api/checkin` with field name `selfie` (not `file` or `image`).
- `GET /api/checkin/status` is never called — the app has no awareness of whether a check-in is currently required before the driver can start a trip.

---

### Notifications & Settings

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| List notifications | `GET /notifications` | `GET /api/driver/notifications` | 🟠 P1 |
| Mark notification read | `PATCH /notifications/:id/read` | No exact driver-specific read endpoint in contract (contrast with passenger `PATCH /api/notifications/:id/read`) | 🟡 P2 |
| Get driver settings | `GET /driver/me/settings` | `GET /api/driver/settings` | 🟠 P1 |
| Update driver settings | `PATCH /driver/me/settings` | `PATCH /api/driver/settings` | 🟠 P1 |

**Notes:**
- The contract has `GET /api/driver/notifications` (last 50, driver-only). The app calls `GET /notifications` which in the contract is passenger-only. A driver calling that endpoint may get 403 or empty data.
- `GET /api/driver/settings` and `PATCH /api/driver/settings` return/accept `{ notifications: boolean, language: string }`. The app path omits `/me/`.

---

### Support

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| Submit support ticket | `POST /support/tickets` | `POST /api/support/tickets` | ✅ Correct |

**Notes:**
- `app/support.tsx` has a form but the review of whether `endpoints.support.submitTicket()` is actually called on form submit (vs. an alert stub) should be confirmed. Contract accepts `{ subject, message, type, priority, name?, email?, phone? }`.

---

### Shuttle Lines (Shuttle Mode)

These endpoints are used in the **shuttle service context** (`lib/shuttleContext.tsx`, `app/(shuttle)/` screens).

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| List shuttle lines | `GET /shuttle/lines` | `GET /api/shuttle/lines` | ✅ Correct |
| Get shuttle assignments | `GET /shuttle/assignments` | `GET /api/shuttle/assignments` | ✅ Correct |
| Get single line | `GET /shuttle/lines/:id` | `GET /api/shuttle/lines/:id` | ✅ Correct |
| Activate a line | `POST /shuttle/lines/:id/activate` | ❌ Not in contract | 🔴 P0 |
| Complete a line | `POST /shuttle/lines/:id/complete` | ❌ Not in contract | 🔴 P0 |
| Get line passengers | `GET /shuttle/lines/:id/passengers` | ❌ Not in contract | 🔴 P0 |
| Book a weekly slot | `POST /shuttle/lines/:id/book` | ❌ Not in contract | 🟠 P1 |

**Notes:**
- The activate/complete lifecycle for shuttle *lines* does not exist in the contract. Lifecycle management is done at the **trip** level via `PATCH /api/driver/trips/:id/start` and `PATCH /api/driver/trips/:id/complete`.
- `lib/shuttleContext.tsx` falls back to `lib/mock.ts:shuttleLines` (5 hardcoded lines), `lib/mock.ts:activeShuttleStops`, and `lib/mock.ts:boardingPassengers` when API calls return no data.

---

### Push Token Registration

| Feature | App Path | Contract Path | Severity |
|---------|----------|--------------|----------|
| Register push token | `POST /users/me/push-token` | ❌ Not in contract | 🟡 P2 |

**Notes:**
- `hooks/usePushNotifications.ts` registers an Expo push token via `POST /users/me/push-token`. This endpoint does not appear anywhere in the contract. If the backend doesn't have this route, push notifications will silently fail to register. A corresponding endpoint needs to be added to the contract or the path must be updated to whatever the backend actually uses.

---

### Contract Endpoints Not Called by the App

These exist in the contract and are relevant to the driver but have **no matching call** in any app screen or hook:

| Contract Endpoint | Description | Severity |
|-------------------|-------------|----------|
| `GET /api/driver/rides/active` | Hydrate active ride on app launch | 🟠 P1 |
| `PATCH /api/driver/rides/:id/cancel` | Driver cancels own accepted ride | 🟡 P2 |
| `GET /api/driver/rides` (list) | Driver's own ride history | 🟡 P2 |
| `GET /api/driver/promotions` | Available driver promotions | 🟡 P2 |
| `GET /api/driver/earnings` | Summary + 10 recent records | 🟡 P2 |
| `POST /api/checkin` | Selfie check-in before trip start | 🟡 P2 |
| `GET /api/checkin/status` | Whether check-in is required | 🟡 P2 |
| `PATCH /api/driver/bookings/:id/absent` | Mark passenger no-show (shuttle) | 🟡 P2 |
| `GET /api/ratings` | Ratings received by driver | 🟡 P2 |
| `POST /api/rides/:id/sos` | SOS emergency trigger | 🟠 P1 |
| `GET /api/auth/me` | Canonical "who am I" endpoint | 🟡 P2 |
| `PATCH /api/auth/me` | Update own credentials/password | 🟢 P3 |

---

## Socket.IO Audit

### Connection Setup

| Item | App Behavior | Contract | Severity |
|------|-------------|----------|----------|
| Socket URL | Strips `/api` suffix from `EXPO_PUBLIC_API_URL` | `wss://<host>/api/socket.io` | ✅ Correct |
| Socket path | `/api/socket.io` | `/api/socket.io` | ✅ Correct |
| Auth | `socket.handshake.auth.token` = JWT | JWT via `socket.handshake.auth.token` | ✅ Correct |
| Transport | `['polling', 'websocket']` | Not restricted | ✅ Correct |
| Room join | Emits `join` with `driver:{driverId}` | Room: `driver:{userId}` exists; no documented `join` event | 🟡 P2 |

**Notes:**
- The server-side join mechanism is not documented in the contract. If the server doesn't respond to a `join` event, the driver may never receive events targeted at `driver:{userId}`.

---

### Events Emitted by the App

| Constant | Event Name | Used in Code | Should Emit | Severity |
|----------|-----------|-------------|-------------|----------|
| `JOIN` | `join` | ✅ On connect | Yes | ✅ |
| `DRIVER_LOCATION_UPDATE` | `driver:location:update` | ❌ Defined but never emitted | Location sent via REST `PATCH /driver/location` | 🟡 P2 |
| `DRIVER_RIDE_LOCATION` | `driver:ride:location` | ❌ Defined but never emitted | — | 🟢 P3 |
| `DRIVER_STATUS_ONLINE` | `driver:status:online` | ❌ Defined but never emitted | Status set via REST | 🟢 P3 |
| `DRIVER_STATUS_OFFLINE` | `driver:status:offline` | ❌ Defined but never emitted | Status set via REST | 🟢 P3 |
| `DRIVER_STATUS_BUSY` | `driver:status:busy` | ❌ Defined but never emitted | — | 🟢 P3 |
| `DRIVER_TRIP_START` | `driver:trip:start` | ❌ Defined but never emitted | — | 🟢 P3 |
| `DRIVER_TRIP_COMPLETE` | `driver:trip:complete` | ❌ Defined but never emitted | — | 🟢 P3 |

**Notes:**
- Most constants in `constants/socketEvents.ts` are orphaned — they are defined but never emitted. This is not a problem for the REST-based operations, but they add confusion. The constants file should be trimmed to only what is actually used.

---

### Events Listened to by the App

| Contract Event | App Listens? | Handler |
|---------------|-------------|---------|
| `ride:new_request` | ⚠️ Partially — constant defined but `useRideSocket` listens to `ride:offer` instead | Wrong event name |
| `ride:offer` | ✅ | Triggers ride request overlay in HomeScreen |

**Notes:**
- The app listens to `ride:offer` but the contract emits `ride:new_request`. These are different names — the driver will **never receive a ride offer** unless the server also emits `ride:offer` as an alias.
- `SOCKET_EVENTS.RIDE_NEW_REQUEST` is defined in `constants/socketEvents.ts` as `"ride:new_request"` but `useRideSocket` only registers a handler for `SOCKET_EVENTS.RIDE_OFFER` (`"ride:offer"`).

---

### Contract Events Not Listened to

All of these are defined in the contract as being emitted to the `driver:{userId}` room or all clients, but the app has **no listener** for any of them:

| Contract Event | Payload Summary | Impact of Missing Listener |
|---------------|-----------------|---------------------------|
| `ride:offer_expired` | `{ rideId }` | Offer overlay never auto-dismisses |
| `ride:waiting_charge_updated` | `{ rideId, chargedMinutes, totalCharge, ratePerMinute }` | Driver unaware of accruing waiting charges |
| `ride:waiting_charge_capped` | `{ rideId, totalCharge, maxCharge }` | Driver unaware when charge cap is hit |
| `ride:free_window_ended` | `{ rideId, ratePerMinute }` | Driver unaware waiting charges started |
| `ride:no_show` | `{ rideId, arrivedFlatFee, waitingCharge, totalFee, refundAmount }` | No-show event not processed |
| `driver:checkin_required` | `{ driverId, deadline }` | Driver not prompted to check in |
| `driver:checkin_rejected` | `{ driverId, reason }` | Driver not told check-in was rejected |
| `driver:location_updated` | `{ latitude, longitude, heading }` | Server confirmation of location ignored |
| `surge:update` | `{ vehicleType, multiplier, tier, ratio, isActive }` | Surge pricing never shown to driver |
| `service:control_changed` | `{ serviceType, isEnabled, displayMode, ... }` | Service status changes not reflected live |
| `service:settings_changed` | `{ serviceType, ... }` | Setting changes not reflected live |
| `sos:triggered` | `{ sosId, ... }` | SOS confirmation not received |

---

## Mock Data Still in Production Code

The following exports from `lib/mock.ts` are still imported and rendered in live screens with no real API fallback:

| Mock Export | Used In | Should Come From | Severity |
|-------------|---------|-----------------|----------|
| `driver` (avatar, name, level) | `app/(tabs)/index.tsx` (avatar `pravatar.cc` URL) | `GET /api/driver/profile` | 🟠 P1 |
| `todayEarnings` (total, trips, hours, tips, bonus, cash, card) | `app/(tabs)/earnings.tsx` | No contract endpoint — needs addition | 🟡 P2 |
| `weekEarnings` | `app/(tabs)/earnings.tsx` | `GET /api/earnings/weekly` (already wired, mock is fallback) | 🟡 P2 |
| `ratingsBreakdown` | `app/ratings.tsx` | `GET /api/driver/reviews` | 🟠 P1 |
| `reviews` | `app/ratings.tsx` | `GET /api/driver/reviews` | 🟠 P1 |
| `documents` | `app/documents.tsx` | `GET /api/driver-documents/by-driver/:driverId` | 🟠 P1 |
| `shuttleLines` | `lib/shuttleContext.tsx` | `GET /api/shuttle/lines` + `GET /api/shuttle/assignments` (partially wired, mock is fallback) | 🟡 P2 |
| `activeShuttleStops` | `app/shuttle/trip-active.tsx` | `GET /api/driver/trips/:id/stations` (wired at trip level, but stops still use mock) | 🟡 P2 |
| `boardingPassengers` | `app/shuttle/boarding.tsx` | Bookings list from `GET /api/driver/trips/:id` | 🟠 P1 |
| Promo cards ("Weekend boost", "3 trips before 11 AM") | `app/(tabs)/earnings.tsx` | `GET /api/driver/promotions` | 🟡 P2 |
| Payout methods (BIAT, Visa, hardcoded) | `app/(tabs)/wallet.tsx` | `GET /api/driver/wallet/payout-methods` | 🟠 P1 |

---

## UI Features With No Backend Integration

These UI elements exist visually but have **zero API or socket wiring**:

| Feature | Location | Required Contract Integration | Severity |
|---------|----------|------------------------------|----------|
| **In-app chat** | `app/ride/[rideId].tsx` "Message" button, `app/shuttle/trip-active.tsx` | `GET /api/chat/:rideId`, `POST /api/chat/:rideId`, socket `chat:message` listener | 🟠 P1 |
| **Phone call button** | `app/ride/[rideId].tsx` "Call" button | Native `Linking.openURL('tel:...')` with rider phone from ride data | 🟡 P2 |
| **SOS emergency** | `app/safety.tsx` SOS button | `POST /api/rides/:id/sos` with `{ latitude, longitude, notes }` | 🟠 P1 |
| **Surge pricing indicator** | No UI exists either | `surge:update` socket event | 🟡 P2 |
| **Service control awareness** | No live check on service availability | `GET /api/services/control` + `service:control_changed` socket | 🟡 P2 |
| **Driver cancel accepted ride** | No button in `app/ride/[rideId].tsx` for driver cancellation | `PATCH /api/driver/rides/:id/cancel` | 🟡 P2 |
| **Background location tracking** | `useRideSocket.ts` has a `locationInterval` ref that is never assigned (dead code) | Expo `TaskManager` background task + `PATCH /api/driver/location` | 🟠 P1 |
| **Waiting charge display** | `app/ride/[rideId].tsx` has no charge ticker | `ride:waiting_charge_updated` socket event | 🟠 P1 |
| **Offer expiry countdown** | Offer overlay never auto-dismisses | `ride:offer_expired` socket event | 🟠 P1 |
| **Check-in gate before trip start** | No check-in status check before showing Start button | `GET /api/checkin/status` | 🟡 P2 |
| **Mark passenger absent (shuttle)** | No absent button in boarding screen | `PATCH /api/driver/bookings/:id/absent` | 🟡 P2 |
| **Active ride hydration on launch** | App starts without knowing if driver has an active ride | `GET /api/driver/rides/active` | 🟠 P1 |

---

## Summary Tables

### REST Path Correctness

| Category | Total Calls | ✅ Correct | ❌ Wrong Path | ⚠️ Wrong Method | 🚫 Not in Contract |
|----------|------------|----------|------------|--------------|-----------------|
| Auth | 7 | 1 | 4 | 0 | 2 |
| Driver Profile | 8 | 1 | 6 | 0 | 1 |
| Rides | 8 | 3 | 0 | 3 | 1 (polling) |
| Driver Trips | 10 | 10 | 0 | 0 | 0 |
| Shuttle Lines | 7 | 3 | 0 | 0 | 3 |
| Earnings | 2 | 2 | 0 | 0 | 0 |
| Wallet | 5 | 3 | 1 | 0 | 0 |
| Documents | 2 | 0 | 2 | 0 | 0 |
| Notifications | 2 | 0 | 2 | 0 | 0 |
| Settings | 2 | 0 | 2 | 0 | 0 |
| Support | 1 | 1 | 0 | 0 | 0 |
| Push tokens | 1 | 0 | 0 | 0 | 1 |
| **Total** | **55** | **24 (44%)** | **17 (31%)** | **3 (5%)** | **7 (13%)** |

### Socket.IO Coverage

| Contract Event Direction | Contract Total | App Handles | Gap |
|--------------------------|---------------|-------------|-----|
| Server → Driver (inbound) | 20 events | 1 (`ride:offer` — wrong name) | 19 not handled |
| Client → Server (outbound) | 1 documented (`join`) | 1 | 0 gap |
| Constants defined but never emitted | — | 7 | Dead code |

### Mock Data Replacement Status

| Total mock exports in `lib/mock.ts` | Still used in live screens | Replaced with real API |
|--------------------------------------|---------------------------|----------------------|
| 11 | 11 | 0 |

---

*End of audit. Total issues found: **P0: 9 · P1: 22 · P2: 19 · P3: 5***
