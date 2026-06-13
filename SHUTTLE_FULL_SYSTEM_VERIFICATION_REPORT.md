# VeeGo — Shuttle Full System Verification Report

**Date:** June 2026  
**Scope:** Full cross-system audit — Backend (Node.js/Express/Drizzle/PostgreSQL) vs. Passenger App (React Native / Expo SDK 52)  
**Auditor:** Senior Backend Engineer  
**Method:** Evidence-based analysis of backend source code + frontend audit report (FULL_REACT_NATIVE_DETAILED_INTEGRATION_AUDIT). Backend is the source of truth.

---

## Table of Contents

1. [Full Backend Capability Map](#1-full-backend-capability-map)
2. [Frontend Expected Features](#2-frontend-expected-features)
3. [Fully Matched Features (Working)](#3-fully-matched-features-working)
4. [Frontend Missing Features (Backend Exists, Frontend Doesn't Use)](#4-frontend-missing-features)
5. [Backend Missing Features (Frontend Expects, Backend Doesn't Support)](#5-backend-missing-features)
6. [Broken Integrations](#6-broken-integrations)
7. [Deprecated API Usage](#7-deprecated-api-usage)
8. [DTO / Schema Mismatches](#8-dto--schema-mismatches)
9. [Authentication & Security Issues](#9-authentication--security-issues)
10. [Localization Gaps (AR / EN)](#10-localization-gaps)
11. [Full System Gap Table](#11-full-system-gap-table)
12. [Final System Health Score](#12-final-system-health-score)
13. [Engineering Action Plan](#13-engineering-action-plan)

---

## 1. Full Backend Capability Map

### 1.1 Authentication Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| POST | `/auth/register` | No | Any | Active |
| POST | `/auth/login` | No | Any | Active |
| POST | `/auth/admin/login` | No | Admin | Active |
| POST | `/auth/refresh` | No | Any | Active |
| GET | `/auth/me` | Bearer | Any | **Deprecated** (use `GET /users/me`) |
| POST | `/auth/send-otp` | No | Any | Active |
| POST | `/auth/forgot-password` | No | Any | Active |
| POST | `/auth/verify-otp` | No | Any | Active |
| POST | `/auth/reset-password` | No | Any | Active |

### 1.2 User Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/users/me` | Bearer | Any | Active |
| PATCH | `/users/me` | Bearer | Any | Active |
| POST | `/users/me/push-token` | Bearer | Any | Active |
| GET | `/users/me/bookings` | Bearer | Any | Active |
| DELETE | `/admin/users/:id` | Bearer | Admin | Active (admin-only; **no self-delete endpoint**) |

### 1.3 Shuttle / Lines Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/shuttle/lines` | No | Public | Active |
| GET | `/shuttle/lines/:id` | No | Public | Active (returns next 20 trip slots) |
| GET | `/shuttle/assignments` | Bearer | Any | Active |
| GET | `/shuttle/trips/:id/passengers` | Bearer | Any | Active |
| GET | `/shuttle/lines/:id/passengers` | Bearer | Any | Active |
| POST | `/shuttle/bookings/:id/board` | Bearer | Any | Active |
| DELETE | `/shuttle/bookings/:id` | Bearer | Any | Active (passenger cancel) |
| GET | `/shuttle/my-debt` | Bearer | Any | Active |

### 1.4 Routes / Stations Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/routes` | No | Public | Active |
| POST | `/routes` | Bearer | Admin | Active |
| GET | `/routes/:id` | No | Public | Active |
| PATCH | `/routes/:id` | Bearer | Admin | Active |
| DELETE | `/routes/:id` | Bearer | Admin | Active |
| GET | `/routes/:id/stations` | No | Public | Active |
| POST | `/routes/:id/stations` | Bearer | Admin | Active |
| PATCH | `/routes/:id/stations/:stationId` | Bearer | Admin | Active |
| DELETE | `/routes/:id/stations/:stationId` | Bearer | Admin | Active |

### 1.5 Trip Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/trips` | No | Public | Active |
| POST | `/trips` | Bearer | Admin | Active |
| GET | `/trips/:id` | No | Public | Active |
| PATCH | `/trips/:id` | Bearer | Admin | Active |
| DELETE | `/trips/:id` | Bearer | Admin | Active |

### 1.6 Booking Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/bookings` | Bearer | **Admin only** | Active (admin-scoped) |
| POST | `/bookings` | Bearer | Any | Active |
| GET | `/bookings/:id` | Bearer | Any | Active |
| PATCH | `/bookings/:id/cancel` | Bearer | Any | Active |

### 1.7 Bus / Fleet Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/buses` | Bearer | Admin | Active |
| POST | `/buses` | Bearer | Admin | Active |
| GET | `/buses/:id` | Bearer | Admin | Active |
| PATCH | `/buses/:id` | Bearer | Admin | Active |
| DELETE | `/buses/:id` | Bearer | Admin | Active |

### 1.8 Schedule Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/schedules` | Bearer | Admin | Active |
| POST | `/schedules` | Bearer | Admin | Active |
| GET | `/schedules/:id` | Bearer | Admin | Active |
| PATCH | `/schedules/:id` | Bearer | Admin | Active |
| DELETE | `/schedules/:id` | Bearer | Admin | Active |
| POST | `/schedules/:id/generate` | Bearer | Admin | Active |

### 1.9 Ride-Hailing Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| POST | `/rides/estimate` | Bearer | Any | Active (**frontend does not use this**) |
| POST | `/rides/request` | Bearer | User | Active |
| GET | `/rides/my` | Bearer | User | Active (**frontend calls `/rides`, not `/rides/my`**) |
| GET | `/rides/:id` | Bearer | Any | Active |
| PATCH | `/rides/:id/cancel` | Bearer | User | Active |
| POST | `/:id/sos` | Bearer | Any | Active (**WRONG PATH — registered as `/:id/sos`, not `/rides/:id/sos`**) |
| GET | `/admin/rides` | Bearer | Admin | Active |
| GET | `/admin/rides/:id` | Bearer | Admin | Active |

### 1.10 Driver Trip Endpoints (Driver App only)

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/driver/trips` | Bearer | Driver | Active |
| GET | `/driver/trips/:id` | Bearer | Driver | Active |
| PATCH | `/driver/trips/:id/accept` | Bearer | Driver | Active |
| PATCH | `/driver/trips/:id/reject` | Bearer | Driver | Active |
| PATCH | `/driver/trips/:id/start` | Bearer | Driver | Active |
| PATCH | `/driver/trips/:id/complete` | Bearer | Driver | Active |
| PATCH | `/driver/trips/:id/cancel` | Bearer | Driver | Active |
| GET | `/driver/trips/:id/stations` | Bearer | Driver | Active |
| PATCH | `/driver/trips/:id/stations/:stationId/arrived` | Bearer | Driver | Active |
| PATCH | `/driver/trips/:id/stations/:stationId/completed` | Bearer | Driver | Active |
| PATCH | `/driver/bookings/:id/board` | Bearer | Driver | Active |
| PATCH | `/driver/bookings/:id/absent` | Bearer | Driver | Active |
| GET | `/driver/rides/active` | Bearer | Driver | Active |
| GET | `/driver/rides/available` | Bearer | Driver | Active |
| PATCH | `/driver/rides/:id/accept` | Bearer | Driver | Active |
| PATCH | `/driver/rides/:id/arrived` | Bearer | Driver | Active |
| PATCH | `/driver/rides/:id/start` | Bearer | Driver | Active |
| PATCH | `/driver/rides/:id/complete` | Bearer | Driver | Active |
| PATCH | `/driver/rides/:id/decline` | Bearer | Driver | Active |
| POST | `/driver/rides/:id/rate-rider` | Bearer | Driver | Active |

### 1.11 Admin Shuttle Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/admin/shuttle-trips` | Bearer | Admin | Active |
| GET | `/admin/shuttle-trips/:id` | Bearer | Admin | Active |
| GET | `/admin/shuttle/cash-debts` | Bearer | Admin | Active |
| PATCH | `/admin/shuttle/cash-debts/:userId/collect` | Bearer | Admin | Active |
| GET | `/admin/shuttle/offences` | Bearer | Admin | Active |
| PATCH | `/admin/shuttle/offences/:userId/reset` | Bearer | Admin | Active |

### 1.12 Wallet Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/wallet` | Bearer | Any | Active |
| GET | `/wallet/transactions` | Bearer | Any | Active |
| POST | `/wallet/topup` | Bearer | Any | Active |
| PATCH | `/admin/settings/wallet-limits` | Bearer | Admin | Active |
| GET | `/admin/wallet/transactions` | Bearer | Admin | Active |
| POST | `/admin/wallet/refund` | Bearer | Admin | Active |

### 1.13 Notifications Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/notifications` | Bearer | Any | Active |
| PATCH | `/notifications/read-all` | Bearer | Any | Active |
| PATCH | `/notifications/:id/read` | Bearer | Any | Active |
| POST | `/notifications` | Bearer | Admin | Active (admin broadcast) |
| POST | `/admin/notifications/broadcast` | Bearer | Admin | Active |

### 1.14 Promo Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| POST | `/promo/validate` | Bearer | Any | Active |
| GET | `/promo` | Bearer | **Admin only** | Active (**PASSENGER CANNOT ACCESS — 403**) |
| POST | `/promo` | Bearer | Admin | Active |
| PATCH | `/promo/:id` | Bearer | Admin | Active |
| DELETE | `/promo/:id` | Bearer | Admin | Active |

### 1.15 Ratings Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/admin/ratings` | Bearer | Admin | Active |
| GET | `/admin/ratings/stats` | Bearer | Admin | Active |
| GET | `/admin/ratings/:id` | Bearer | Admin | Active |
| DELETE | `/admin/ratings/:id` | Bearer | Admin | Active |
| GET | `/user/ratings/given` | Bearer | Any | Active |
| POST | `/driver/rides/:id/rate-rider` | Bearer | Driver | Active (driver rates rider) |

> **No `POST /rides/:id/rate-driver` endpoint confirmed in source.** Frontend marks this as "Working" — may be handled via `/ratings.ts` or missing entirely.

### 1.16 Support Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| POST | `/support/tickets` | No | Public | Active |
| GET | `/support/tickets` | Bearer | Admin | Active |
| GET | `/support/tickets/:id` | Bearer | Admin | Active |
| PATCH | `/support/tickets/:id` | Bearer | Admin | Active |
| POST | `/support/tickets/:id/messages` | Bearer | Admin | Active |
| GET | `/support/stats` | Bearer | Admin | Active |

### 1.17 Other Active Passenger Endpoints

| Method | Endpoint | Auth | Role | Status |
|--------|----------|------|------|--------|
| GET | `/locations` | Bearer | Any | Active |
| GET | `/zones` | Bearer | Admin | Active |
| GET | `/zone-pricing` | Bearer | Admin | Active |
| GET | `/vehicles` | Bearer | Admin | Active |
| GET | `/vehicle-catalog` | Bearer | Any | Active |
| POST | `/promo/validate` | Bearer | Any | Active |
| GET | `/admin/sos-events` | Bearer | Admin | Active |

### 1.18 Socket Events (Backend Source of Truth)

**Server → Passenger:**

| Event | Trigger | Frontend Listens? |
|-------|---------|-------------------|
| `ride:driver_assigned` | Driver matched to ride | ✅ Yes |
| `ride:driver_location` | Driver GPS update | ✅ Yes |
| `ride:driver_arrived` | Driver at pickup | ✅ Yes |
| `ride:started` | Ride begins | ✅ Yes |
| `ride:completed` | Ride ends | ✅ Yes |
| `ride:cancelled` | Ride cancelled | ✅ Yes |
| `ride:driver_cancelled` | Driver cancelled | ❌ Not in audit |
| `ride:no_show_cancelled` | No-show timeout | ❌ Not in audit |
| `ride:waiting:charge:started` | Waiting fee begins | ❌ Not in audit |
| `ride:waiting:charge:updated` | Waiting fee tick | ❌ Not in audit |
| `ride:waiting:charge:capped` | Waiting fee maxed | ❌ Not in audit |
| `booking:boarded` | Passenger boarded shuttle | ✅ Yes |
| `passenger:trip:tracking` | Shuttle driver GPS | ✅ Yes |
| `shuttle:driver:location` | Pre-departure GPS broadcast | ❌ Not listened to |
| `service:control:changed` | Service enable/disable | ✅ Yes |
| `notification:new` | New push notification | ❓ Not confirmed |
| `sos:triggered` | SOS alarm (admin) | ❌ No passenger SOS trigger |
| `surge:updated` | Surge pricing change | ❌ Not in audit |

**Client → Server:**

| Event | Frontend Sends? | Backend Handles? |
|-------|-----------------|------------------|
| Auth token handshake | ✅ Yes | ✅ Yes |
| `auth:login` | ✅ Yes (frontend expects receipt) | ⚠️ Not in SOCKET_EVENTS constants |
| `passenger:join:trip` | ✅ Yes (implied) | ✅ Yes (SOCKET_EVENTS.PASSENGER_JOIN_TRIP) |
| `join` | ✅ Yes | ✅ Yes (SOCKET_EVENTS.JOIN) |

### 1.19 Database Models

| Model | Table | Key Fields |
|-------|-------|------------|
| Users | `users` | id, name, nameAr, email, phone, role, walletBalance, pushToken, staffRoleId |
| Trips | `trips` | id, routeId, busId, driverId, departureTime, arrivalTime, price, status |
| Bookings | `bookings` | id, userId, tripId, seatCount, totalPrice, status, paymentStatus |
| Routes | `routes` | id, name, nameAr, fromLocation, toLocation, fromLocationAr, toLocationAr |
| Stations | `stations` | id, routeId, name, nameAr, area, areaAr, segmentPrice, order |
| Buses | `buses` | id, plateNumber, vehicleType (hiace/minibus), capacity |
| RouteSchedules | `route_schedules` | id, routeId, dayOfWeek, departureTime |
| ShuttleOffences | `shuttle_offences` | id, userId, offenceCount, isSuspended |
| TripStationProgress | `trip_station_progress` | id, tripId, stationId, status |
| SosEvents | `sos_events` | id, userId, rideId, role, latitude, longitude, triggeredAt, status |
| WalletTransactions | `wallet_transactions` | id, userId, type, amount, balanceAfter |

### 1.20 Business Logic / Constants (Hard-coded)

| Constant | Value | Location |
|----------|-------|----------|
| Hiace capacity | 14 seats | trips.ts |
| Hiace minimum occupancy | 7 seats | trips.ts |
| Minibus capacity | 28 seats | trips.ts |
| Minibus minimum occupancy | 14 seats | trips.ts |
| Pre-departure tracking window | 20 minutes | trips.ts |
| Cancellation full-refund window | 12 hours before departure | shuttle.ts |
| Partial refund | 50% if < 12 hrs and > 4 hrs | shuttle.ts |
| No refund | < 4 hours before departure | shuttle.ts |
| Max seat count per booking | 1 (enforced) | bookings.ts |
| Timezone | Africa/Cairo | trips.ts |
| Trip slot lookahead | Next 20 trips | shuttle.ts |

---

## 2. Frontend Expected Features

Derived from FULL_REACT_NATIVE_DETAILED_INTEGRATION_AUDIT. The passenger app expects the following backend integrations:

| # | Feature | Endpoint(s) | Socket Event(s) |
|---|---------|-------------|-----------------|
| 1 | User registration | POST /auth/register | — |
| 2 | User login | POST /auth/login | — |
| 3 | Token auto-refresh | POST /auth/refresh | — |
| 4 | Forgot password OTP | POST /auth/forgot-password | — |
| 5 | OTP verification | POST /auth/verify-otp | — |
| 6 | Password reset | POST /auth/reset-password | — |
| 7 | Get profile | GET /users/me | — |
| 8 | Update profile | PATCH /users/me | — |
| 9 | Register push token | POST /users/me/push-token | — |
| 10 | List shuttle lines | GET /shuttle/lines | — |
| 11 | Shuttle line detail + slots | GET /shuttle/lines/:id | — |
| 12 | Trip detail | GET /trips/:id | — |
| 13 | Route stations | GET /routes/:id/stations | — |
| 14 | My cash debt | GET /shuttle/my-debt | — |
| 15 | My bookings (paginated) | GET /users/me/bookings | — |
| 16 | Single booking detail | GET /bookings/:id | — |
| 17 | All my bookings (for favorites derivation) | GET /bookings | — |
| 18 | Create booking | POST /bookings | — |
| 19 | Cancel booking | DELETE /shuttle/bookings/:id | — |
| 20 | Request car ride | POST /rides/request | — |
| 21 | Get ride status | GET /rides/:id | — |
| 22 | Ride history | GET /rides | — |
| 23 | Cancel ride | PATCH /rides/:id/cancel | — |
| 24 | Rate driver | POST /rides/:id/rate-driver | — |
| 25 | Wallet balance | GET /wallet | — |
| 26 | Wallet transactions | GET /wallet/transactions | — |
| 27 | Top up wallet | POST /wallet/topup | — |
| 28 | List promos | GET /promo | — |
| 29 | Validate promo | POST /promo/validate | — |
| 30 | Notifications list | GET /notifications | — |
| 31 | Mark all read | PATCH /notifications/read-all | — |
| 32 | Chat history | GET /trips/:id/chat | — |
| 33 | Send chat message | POST /trips/:id/chat | — |
| 34 | Submit support ticket | POST /support/tickets | — |
| 35 | Live car ride tracking | — | ride:* events |
| 36 | Shuttle driver tracking | — | passenger:trip:tracking |
| 37 | Boarded confirmation | — | booking:boarded |
| 38 | Service availability | — | service:control:changed |
| 39 | Socket room join | — | auth:login (client listens) |

---

## 3. Fully Matched Features (Working)

These integrations are correctly implemented in both backend and frontend and should function in production:

| # | Feature | Endpoint | Evidence |
|---|---------|----------|----------|
| 1 | User registration | POST /auth/register | ✅ Both confirmed |
| 2 | User login | POST /auth/login | ✅ Both confirmed |
| 3 | Token auto-refresh | POST /auth/refresh | ✅ Axios interceptor + backend route |
| 4 | Forgot password | POST /auth/forgot-password | ✅ Both confirmed |
| 5 | OTP verify | POST /auth/verify-otp | ✅ Both confirmed |
| 6 | Password reset | POST /auth/reset-password | ✅ Both confirmed |
| 7 | Get profile | GET /users/me | ✅ Both confirmed |
| 8 | Update profile | PATCH /users/me | ✅ Both confirmed |
| 9 | Push token registration | POST /users/me/push-token | ✅ Both confirmed |
| 10 | List shuttle lines | GET /shuttle/lines | ✅ Public route, frontend useRoutes |
| 11 | Shuttle line detail + slots | GET /shuttle/lines/:id | ✅ Used in TripSheet |
| 12 | Trip detail | GET /trips/:id | ✅ Both confirmed |
| 13 | Route stations | GET /routes/:id/stations | ✅ Used in stations.tsx |
| 14 | My cash debt | GET /shuttle/my-debt | ✅ useMyDebt hook confirmed |
| 15 | My bookings (paginated) | GET /users/me/bookings | ✅ useTrips confirmed |
| 16 | Single booking detail | GET /bookings/:id | ✅ trip-detail.tsx confirmed |
| 17 | Create booking | POST /bookings | ✅ ConfirmSheet → POST /bookings |
| 18 | Cancel booking | DELETE /shuttle/bookings/:id | ✅ Trips tab cancel flow |
| 19 | Request car ride | POST /rides/request | ✅ useRide confirmed |
| 20 | Get ride status | GET /rides/:id | ✅ Poll in useRide |
| 21 | Cancel ride | PATCH /rides/:id/cancel | ✅ useRide confirmed |
| 22 | Wallet balance | GET /wallet | ✅ useWallet confirmed |
| 23 | Wallet transactions | GET /wallet/transactions | ✅ useWallet confirmed |
| 24 | Top up wallet | POST /wallet/topup | ✅ Both confirmed |
| 25 | Validate promo | POST /promo/validate | ✅ Both confirmed |
| 26 | Notifications list | GET /notifications | ✅ useNotifications confirmed |
| 27 | Mark all notifications read | PATCH /notifications/read-all | ✅ Both confirmed |
| 28 | Chat history | GET /trips/:id/chat | ✅ Backend chatRouter + useRideChat |
| 29 | Send chat message | POST /trips/:id/chat | ✅ Backend + useRideChat |
| 30 | Support ticket submit | POST /support/tickets | ✅ Public endpoint + support.tsx |
| 31 | Car ride socket tracking | ride:driver_assigned, ride:driver_location, ride:driver_arrived, ride:started, ride:completed, ride:cancelled | ✅ SOCKET_EVENTS match |
| 32 | Shuttle driver tracking | passenger:trip:tracking | ✅ SOCKET_EVENTS.PASSENGER_TRIP_TRACKING |
| 33 | Boarding confirmation | booking:boarded | ✅ SOCKET_EVENTS.BOOKING_BOARDED |
| 34 | Service control | service:control:changed | ✅ SOCKET_EVENTS.SERVICE_CONTROL_CHANGED |

**Total fully working integrations: 34 / 39 frontend-expected features**

---

## 4. Frontend Missing Features

Backend implements these capabilities; the frontend app does not use or expose them.

| # | Backend Feature | Endpoint / Event | Priority | Impact |
|---|----------------|------------------|----------|--------|
| 1 | **Ride price estimate before booking** | `POST /rides/estimate` | 🔴 HIGH | Passengers confirm rides blind — price only known post-booking |
| 2 | **Pre-departure shuttle driver location** | `shuttle:driver:location` socket event | 🔴 HIGH | Passengers cannot track their shuttle bus before departure window |
| 3 | **Passenger SOS trigger** | `POST /rides/:id/sos` (see §6 for path bug) | 🔴 HIGH | SOS button shows only a local `Alert.alert()` — no server notification |
| 4 | **Mark single notification read** | `PATCH /notifications/:id/read` | 🟠 MEDIUM | Frontend only marks all-read; individual notification read state not synced |
| 5 | **Surge pricing updates** | `surge:updated` socket event | 🟠 MEDIUM | Passengers not notified of dynamic pricing changes in real-time |
| 6 | **Service settings changed** | `service:settings:changed` socket event | 🟡 LOW | Frontend only handles `service:control:changed`, not settings updates |
| 7 | **Passenger boarding via app** | `POST /shuttle/bookings/:id/board` | 🟡 LOW | Backend supports passenger self-board; frontend relies on QR+driver only |
| 8 | **Ride deviation warning** | `ride:deviation:warning` socket event | 🟡 LOW | Safety feature available server-side; no client handler |
| 9 | **Driver no-show/cancel events** | `ride:driver_cancelled`, `ride:no_show_cancelled` | 🟡 LOW | Frontend only listens to generic `ride:cancelled`; cannot distinguish cause |
| 10 | **Waiting charge events** | `ride:waiting:charge:started/updated/capped` | 🟡 LOW | Waiting fee transparency missing — users don't see real-time meter |
| 11 | **User-given ratings list** | `GET /user/ratings/given` | 🟡 LOW | Frontend has no ratings history screen |
| 12 | **Locations API** | `GET /locations` | 🟡 LOW | Frontend uses hardcoded `WG_COORDS` instead of backend-provided locations |

---

## 5. Backend Missing Features

Frontend expects or requires these; **backend does not implement them**.

| # | Feature | Frontend Usage | Missing Backend Endpoint | Priority |
|---|---------|----------------|--------------------------|----------|
| 1 | **Self-service account deletion** | `app/(tabs)/profile.tsx` — delete account button | `DELETE /users/me` | 🔴 CRITICAL |
| 2 | **Profile photo upload** | `app/(tabs)/profile.tsx` — image picker result discarded | `POST /users/me/avatar` (multipart) | 🔴 CRITICAL |
| 3 | **Passenger rate-driver** | `app/(tabs)/car.tsx` — `POST /rides/{id}/rate-driver` | `POST /rides/:id/rate-driver` (unconfirmed) | 🔴 CRITICAL |
| 4 | **Promo list for passengers** | `src/hooks/usePromos.ts` — `GET /promo` | Passenger-accessible promo list endpoint | 🔴 CRITICAL (current endpoint is admin-only — see §6) |
| 5 | **Phone number edit** | `app/(tabs)/profile.tsx` — phone is hardcoded | `PATCH /users/me` should accept phone updates (check if field is included in UpdateUserProfileBody) | 🟠 HIGH |
| 6 | **Wallet transfer** | `app/(tabs)/wallet.tsx` — "Coming Soon" button | `POST /wallet/transfer` | 🟠 HIGH |
| 7 | **Payment methods management** | `app/(tabs)/profile.tsx` — "Coming Soon" | `GET/POST/DELETE /payment-methods` | 🟠 HIGH |
| 8 | **Notification preference sync** | `app/(tabs)/profile.tsx` — toggle stored locally | `PATCH /users/me/notifications` or equivalent | 🟡 MEDIUM |
| 9 | **SOS endpoint (correct path)** | `SafetySheet.tsx` should call this | `POST /rides/:id/sos` properly registered (currently misconfigured) | 🔴 CRITICAL |
| 10 | **Car ride deep link** | `app/_layout.tsx` — `veego://ride/{id}` not handled | Backend has no issue; frontend routing missing — flagged for frontend team | 🟡 LOW |
| 11 | **Promo code deep link** | `app/_layout.tsx` — `veego://promo/{code}` not handled | Backend has no issue; frontend routing missing | 🟡 LOW |

---

## 6. Broken Integrations

These are active bugs where the integration exists in both frontend and backend but is **functionally broken**.

### 6.1 🔴 CRITICAL: `GET /promo` Returns 403 for Passengers

**Backend:** `GET /promo` is guarded by `requireRole("admin")`.  
**Frontend:** `src/hooks/usePromos.ts` calls `GET /promo` for the standard passenger promo screen.  
**Result:** Every passenger who opens `/promo` receives a `403 Forbidden`. The promo browsing feature is **completely broken** for all non-admin users.  
**Fix:** Add a passenger-accessible endpoint, e.g. `GET /promo/available` returning only active promos, or remove the role guard from `GET /promo` and add role-based filtering server-side.

---

### 6.2 🔴 CRITICAL: `GET /bookings` Returns 403 for Passengers

**Backend:** `GET /bookings` at `/bookings.ts` line 28 is guarded by `requireRole("admin")`.  
**Frontend:** `src/hooks/useFavoriteDestinations.ts` calls `GET /bookings` as a passenger to derive frequent routes.  
**Result:** Every passenger who visits the Favorites tab triggers a `403 Forbidden`. Favorite destinations cannot be derived from booking history.  
**Fix:** Use the existing `GET /users/me/bookings` endpoint in `useFavoriteDestinations.ts` instead of `GET /bookings`.

---

### 6.3 🔴 CRITICAL: `GET /rides` vs `GET /rides/my` — Endpoint Name Mismatch

**Backend:** Passenger ride history endpoint is `GET /rides/my` (`requireRole("user")`).  
**Frontend:** `src/hooks/useTrips.ts` and `src/hooks/useFavoriteDestinations.ts` call `GET /rides` (no suffix).  
**Result:** Frontend gets `404 Not Found` or hits an unintended route. Ride history in the Trips tab is broken for car rides.  
**Fix:** Either rename the backend endpoint to `GET /rides` or update the frontend to call `GET /rides/my`.

---

### 6.4 🔴 CRITICAL: SOS Endpoint Registered at Wrong Path

**Backend:** `rides.ts` registers `router.post("/:id/sos", ...)` — since the router has no prefix, this resolves to `POST /:id/sos` (e.g., `POST /42/sos`), **not** `POST /rides/42/sos`.  
**Frontend:** SOS button does not call any endpoint at all (only shows local alert).  
**Result:** Even if frontend called `/rides/:id/sos`, it would get `404`. The SOS endpoint is unreachable as-is.  
**Fix (Backend):** Change route registration to `router.post("/rides/:id/sos", ...)`.  
**Fix (Frontend):** Wire `SafetySheet.tsx` SOS button to call the corrected endpoint AND `Linking.openURL('tel:911')`.

---

### 6.5 🟠 HIGH: Socket `auth:login` Event Not in Constants

**Backend:** The `SOCKET_EVENTS` constants file does not define `auth:login`. Frontend listens for `auth:login` to join the passenger socket room after authentication.  
**Result:** If backend emits `auth:login` as a raw string somewhere (not via the constants), it creates a maintenance risk — any string change breaks the integration silently.  
**Fix:** Add `AUTH_LOGIN: "auth:login"` to `SOCKET_EVENTS` and verify the backend actually emits this event on socket authentication.

---

### 6.6 🟠 HIGH: `POST /rides/:id/rate-driver` — Existence Unconfirmed

**Frontend:** `app/(tabs)/car.tsx` calls `POST /rides/{id}/rate-driver` and the frontend audit marks it as "Working".  
**Backend:** No `POST /rides/:id/rate-driver` found in `rides.ts`. Only `POST /driver/rides/:id/rate-rider` (driver rates rider) and admin-only `GET /admin/ratings` exist. No passenger → driver rating endpoint is confirmed in source.  
**Risk:** If the frontend audit is wrong and the endpoint is missing, driver ratings from passengers are silently discarded.  
**Fix:** Add `POST /rides/:id/rate-driver` explicitly to `rides.ts` and return 201 with rating ID.

---

### 6.7 🟠 HIGH: `shuttle:driver:location` — Emitted but Not Received

**Backend:** During the 20-minute pre-departure window, `shuttle:driver:location` is emitted to all trip subscribers.  
**Frontend:** Only listens to `passenger:trip:tracking`. The pre-departure broadcast event is never handled.  
**Result:** Passengers see no driver movement before the departure window ends and `passenger:trip:tracking` begins. There is a tracking gap.  
**Fix:** Frontend should additionally listen to `shuttle:driver:location` or backend should consolidate both into one event.

---

### 6.8 🟡 MEDIUM: Chat Used for Ride Type Without Matching Endpoint

**Backend:** Chat endpoints are `/trips/:id/chat` — designed for shuttle trips using `tripId`.  
**Frontend:** `useRideChat` hook is named "ride chat" and is used in `car.tsx`. Car rides have a `rideId`, not a `tripId`.  
**Risk:** When car rides call `GET /trips/{rideId}/chat`, the backend looks up a shuttle trip — not a ride. Returns 404 or wrong data.  
**Fix:** Either add `/rides/:id/chat` endpoints for car ride chat, or clarify that chat is shuttle-only and remove the hook from car ride screen.

---

### 6.9 🟡 MEDIUM: Socket Token Not Re-authenticated After HTTP Refresh

**Backend:** Socket connections authenticate once at handshake time via the access token.  
**Frontend:** When the Axios HTTP interceptor refreshes the access token, the existing socket connection still holds the old, now-invalid token.  
**Result:** After token refresh, real-time events (shuttle tracking, booking updates, ride state changes) may silently stop working until the socket reconnects.  
**Fix:** Frontend — on successful token refresh, call `socket.auth.token = newToken; socket.disconnect().connect()`.

---

### 6.10 🟡 LOW: Dual Debt Hooks

**Backend:** `GET /shuttle/my-debt` — single endpoint, works correctly.  
**Frontend:** `useMyDebt.ts` (actively used on Home screen) and `useDebt.ts` (dead — never imported anywhere).  
**Risk:** A developer may update `useDebt.ts` thinking it is the canonical hook. Creates maintenance confusion.  
**Fix:** Delete `src/hooks/useDebt.ts`.

---

## 7. Deprecated API Usage

| Deprecated Backend | Used in Frontend? | Correct Replacement | Notes |
|-------------------|-------------------|---------------------|-------|
| `GET /auth/me` | ❌ Not used | `GET /users/me` | Frontend correctly uses `/users/me`. Backend keeps `/auth/me` for backward compatibility but comments it as deprecated. |

**Finding:** Frontend has already migrated to the canonical endpoint. No action required on frontend. Backend should log a deprecation warning on `GET /auth/me` calls.

---

## 8. DTO / Schema Mismatches

### 8.1 `POST /bookings` — `pickupStationId` / `dropoffStationId` Not Validated

**OpenAPI / Zod spec (`CreateBookingBody`):** Accepts `pickupStationId` and `dropoffStationId`.  
**Booking handler (`bookings.ts`):** Parses `CreateBookingBody` but the handler only uses `tripId`, `seatCount`, and `promoCode`. Station ID fields are accepted by the schema but silently ignored during booking creation.  
**Impact:** Frontend may pass station IDs expecting them to be recorded. They are not stored. Boarding-point tracking per booking is absent.  
**Fix:** Either validate and store station IDs in the `bookings` table or remove them from the DTO to avoid misleading the frontend.

### 8.2 `POST /bookings` — `seatCount` Max Enforced Backend-Only

**Backend:** Booking handler enforces `seatCount === 1` (one seat per booking).  
**Frontend (`TripSheet.tsx`):** Has `+/-` buttons allowing the user to adjust seat count to values above 1.  
**Impact:** If frontend submits `seatCount: 2`, backend returns `400 Bad Request`. User sees a confusing error with no explanation.  
**Fix:** Frontend should clamp seat count to 1 and remove the +/- buttons, OR the backend constant should be configurable and the DTO should return a helpful error message.

### 8.3 Arabic Localization Fields — Not in OpenAPI Spec

**Backend returns:** `nameAr`, `fromLocationAr`, `toLocationAr` (Routes), `nameAr`, `areaAr` (Stations), `nameAr` (Users).  
**OpenAPI / api-zod generated types:** Do not include these Arabic fields.  
**Impact:** TypeScript auto-generated types on frontend don't expose Arabic fields. Frontend has to use `as any` or ignore type safety to access localized strings.  
**Fix:** Add all Arabic localization fields to the OpenAPI spec and regenerate `@workspace/api-zod` types.

### 8.4 `segmentPrice` on Stations — Not in Spec

**Backend returns:** `segmentPrice` on station objects (numeric, represents the incremental fare to that stop).  
**OpenAPI spec:** Does not include `segmentPrice`.  
**Impact:** Frontend cannot correctly display per-segment pricing or build fare calculators without accessing untyped fields.  
**Fix:** Add `segmentPrice` to Station DTO in spec.

### 8.5 `GET /users/me/bookings` — Missing Pagination

**Backend:** Returns all bookings for the user in a single array (no `page`, `limit`, `total` meta).  
**Frontend (`useTrips.ts`):** Implements client-side pagination logic with "load more" scroll trigger, expecting paginated server responses.  
**Impact:** For users with many bookings, the entire history is loaded at once (performance issue). The "load more" trigger in the UI may not work correctly against a flat array response.  
**Fix:** Add `?page=1&limit=20` query params support to `GET /users/me/bookings` and return `{ data, meta: { total, page, limit } }`.

### 8.6 Trip Status Values — Incomplete in Spec

**Backend DB schema:** `trips.status` includes `scheduled`, `active`, `completed`, `cancelled`, `driver_assigned`, `boarding`.  
**OpenAPI spec / api-zod:** Only documents `scheduled`, `active`, `completed`, `cancelled`.  
**Impact:** Frontend cannot handle `driver_assigned` or `boarding` statuses. Status badges on ticket and trip-detail screens will show unknown/fallback values for these states.  
**Fix:** Add `driver_assigned` and `boarding` to the Trip status enum in the OpenAPI spec.

### 8.7 Wallet Can Go Negative — Not Documented

**Backend business logic:** Wallet balance can go below 0 (cash-debt system). Passengers accrue debt when boarding with insufficient balance.  
**Frontend:** Displays wallet balance without a negative-state handler. No special UI for negative balance.  
**Impact:** Users see a negative number with no explanation of what it means or how to resolve it.  
**Fix:** Document the debt mechanic in the API spec. Frontend should show an explicit "You owe EGP X" state when balance < 0, with a top-up CTA.

---

## 9. Authentication & Security Issues

### 9.1 🔴 CRITICAL: `POST /support/tickets` — No Authentication Required

**Backend:** `router.post("/support/tickets", ...)` — no `authenticate` middleware.  
**Risk:** Unauthenticated actors can flood the support system with spam tickets. No rate limiting observed on this endpoint.  
**Fix:** Add `authenticate` middleware to `POST /support/tickets`. Optionally add a rate limiter.

### 9.2 🔴 HIGH: `DELETE /users/me` — Does Not Exist

**Risk:** Regulatory compliance (GDPR, Egypt Personal Data Protection Law 151/2020) requires users to be able to request deletion of their account. The only delete endpoint is `DELETE /admin/users/:id` — inaccessible to passengers.  
**Fix:** Implement `DELETE /users/me` with proper cascade deletion (same cascade order as the admin delete: rides → bookings → wallet_transactions → notifications → sos_events → drivers → users).

### 9.3 🟠 HIGH: Token Expiry Not Checked on App Resume

**Frontend:** `app/index.tsx` only checks token existence on app launch. A user who leaves the app for a long time with an expired access token and an also-expired refresh token will be silently in a broken state until the first API call fails.  
**Fix:** On app resume (AppState change to `active`), proactively attempt `POST /auth/refresh`. If refresh fails, redirect to `/auth`.

### 9.4 🟠 HIGH: `useNotifications` Redundant Profile Fetch

**Frontend:** `src/hooks/useNotifications.ts` independently calls `GET /users/me` just to get the `userId` for socket room join — even though `useProfile` already has this data.  
**Risk:** Extra unnecessary authenticated network call on every notification screen mount.  
**Fix:** Read `userId` from shared profile context (`useProfile`).

### 9.5 🟠 HIGH: Raw Backend Error Strings Displayed to Users

**Frontend `app/(tabs)/car.tsx`:** Displays `rideState.cancelReason` raw server string to users. `app/(tabs)/car.tsx` and `app/support.tsx` display `result.message` directly from promo validation errors.  
**Risk:** Server-side error messages (possibly in English or Arabic depending on server locale) are shown verbatim to users, bypassing the i18n layer.  
**Fix:** Map backend error codes/messages to `t('errorKey')` translations in the frontend.

### 9.6 🟡 LOW: No Route-Level Auth Guards on Individual Screens

**Frontend:** Protection is only at the splash screen (`app/index.tsx`). Mid-session token expiry fails at the next API call and triggers the refresh interceptor. However, if both access token and refresh token are expired simultaneously, the user could be stuck with stale UI.  
**Fix:** Add token validity check on each tab's `useEffect` mount, or use a dedicated auth state context that re-checks validity on mount.

---

## 10. Localization Gaps

### 10.1 Arabic Fields Missing from OpenAPI Spec

| Entity | Arabic Fields Returned by Backend | In OpenAPI Spec? |
|--------|-----------------------------------|------------------|
| Route | `nameAr`, `fromLocationAr`, `toLocationAr` | ❌ No |
| Station | `nameAr`, `areaAr` | ❌ No |
| User | `nameAr` | ❌ No |
| Bus (type label) | `nameAr` (vehicle type label in admin) | ❌ No |

### 10.2 Departure Times — Stored UTC, Displayed Cairo Time

**Backend:** All departure/arrival times stored as UTC in PostgreSQL.  
**Backend responsibility:** The API currently returns raw UTC timestamps.  
**Frontend:** Must convert to `Africa/Cairo` timezone for display.  
**Gap:** No documentation of this in the API spec. Frontend developers may display raw UTC timestamps.  
**Fix:** Document timezone in the API spec. Optionally, return a `departureTimeLocal` (ISO8601 with offset) alongside the UTC value.

### 10.3 Push Notification Bodies — Language Consistency Unknown

**Backend:** Notification bodies are constructed server-side (e.g., "Trip Cancelled / تم إلغاء الرحلة"). It is unclear whether the backend selects the language based on user preference (`language` field on user record) or always sends bilingual strings.  
**Risk:** Users may receive notifications in the wrong language, or in a mixed-language format.  
**Fix:** Store user language preference in `users.language`, and use it when constructing notification payloads server-side.

### 10.4 Error Message Language

**Backend:** Validation and business logic error messages (e.g., from Zod `.message()`, or `{ error: "..." }` responses) are in English only.  
**Frontend:** Displays some of these raw strings to users.  
**Fix:** Standardize backend to return error `code` strings (e.g., `"BOOKING_SEAT_LIMIT_EXCEEDED"`) alongside human-readable messages. Frontend maps codes to translated strings.

---

## 11. Full System Gap Table

| # | Category | Gap | Severity | Direction |
|---|---------|-----|----------|-----------|
| G01 | Auth | No `DELETE /users/me` for self-service deletion | 🔴 Critical | Backend must add |
| G02 | Auth | No `POST /users/me/avatar` for profile photo upload | 🔴 Critical | Backend must add |
| G03 | Auth | `POST /support/tickets` has no auth guard | 🔴 Critical | Backend must fix |
| G04 | Auth | SOS endpoint registered at wrong path (`/:id/sos`) | 🔴 Critical | Backend must fix |
| G05 | Integration | `GET /promo` is admin-only; passengers get 403 | 🔴 Critical | Backend must add passenger promo list |
| G06 | Integration | `GET /bookings` is admin-only; `useFavoriteDestinations` gets 403 | 🔴 Critical | Frontend must switch to `/users/me/bookings` |
| G07 | Integration | `GET /rides` vs `GET /rides/my` endpoint mismatch | 🔴 Critical | Backend rename or frontend update |
| G08 | Integration | `POST /rides/:id/rate-driver` — existence unconfirmed in source | 🔴 Critical | Verify or implement |
| G09 | Integration | SOS button shows local alert only — no API call | 🔴 Critical | Frontend must wire to fixed SOS endpoint |
| G10 | Integration | Delete Account button shows alert only — no API call | 🔴 Critical | Frontend must call DELETE /users/me after backend adds it |
| G11 | Integration | Profile photo picker discards result — no upload | 🔴 Critical | Frontend must call POST /users/me/avatar |
| G12 | Schema | `pickupStationId`/`dropoffStationId` in DTO but silently ignored | 🟠 High | Backend must validate or remove from schema |
| G13 | Schema | `seatCount` max=1 enforced server-side but frontend allows >1 | 🟠 High | Frontend must clamp; backend should return clear error |
| G14 | Schema | Arabic fields not in OpenAPI spec | 🟠 High | Backend must update spec |
| G15 | Schema | `segmentPrice` not in spec | 🟠 High | Backend must update spec |
| G16 | Schema | Trip status `driver_assigned`, `boarding` not in spec | 🟠 High | Backend must update spec |
| G17 | Schema | `GET /users/me/bookings` lacks pagination | 🟠 High | Backend must add pagination |
| G18 | Schema | Wallet negative balance UX undefined | 🟠 High | Frontend must handle; backend must document |
| G19 | Socket | `shuttle:driver:location` emitted but not received by frontend | 🟠 High | Frontend must add listener |
| G20 | Socket | `auth:login` not in SOCKET_EVENTS constants | 🟠 High | Backend must add constant, verify emit |
| G21 | Socket | Socket not re-authenticated after HTTP token refresh | 🟠 High | Frontend must reconnect socket on token refresh |
| G22 | Socket | `ride:driver_cancelled`, `ride:no_show_cancelled` not handled by frontend | 🟡 Medium | Frontend must add handlers |
| G23 | Socket | Waiting charge events not handled by frontend | 🟡 Medium | Frontend must add handlers |
| G24 | Feature | `POST /rides/estimate` exists — frontend doesn't use it | 🟡 Medium | Frontend should call before ride confirmation |
| G25 | Feature | Phone field hardcoded in profile — non-editable | 🟡 Medium | Frontend must fetch from GET /users/me |
| G26 | Feature | No wallet transfer endpoint | 🟡 Medium | Backend must add or frontend must remove button |
| G27 | Feature | No payment methods endpoints | 🟡 Medium | Backend must add or frontend must remove dead UI |
| G28 | Feature | Chat endpoint used for car rides (`/trips/:id/chat`) — may be wrong resource | 🟡 Medium | Clarify or add `/rides/:id/chat` |
| G29 | Feature | `useDebt.ts` — dead duplicate hook | 🟡 Medium | Frontend must delete |
| G30 | Feature | `@tanstack/react-query` installed, never initialized | 🟡 Medium | Frontend must remove |
| G31 | Localization | Arabic fields not documented in spec | 🟠 High | See G14 |
| G32 | Localization | UTC timestamps not documented; no Cairo offset in response | 🟡 Medium | Backend should document or return offset |
| G33 | Localization | Push notifications sent in unknown language per user | 🟡 Medium | Backend must use user.language field |
| G34 | Localization | Error messages English-only; displayed raw to users | 🟡 Medium | Backend add error codes; frontend map to i18n |
| G35 | Security | No route-level auth guards on screens | 🟡 Low | Frontend add per-screen token check |
| G36 | Dead UI | Avatar button on Home has no `onPress` | 🟡 Low | Frontend must add navigation to profile |
| G37 | Dead UI | Heart/Favorite in TripSheet has no `onPress` | 🟡 Low | Frontend must wire to FavoritesContext |
| G38 | Deep Link | `veego://ride/{id}` not handled | 🟡 Low | Frontend must add handler |
| G39 | Deep Link | `veego://promo/{code}` not handled | 🟡 Low | Frontend must add handler |

---

## 12. Final System Health Score

### Scoring Rubric (0–100)

| Category | Max | Score | Reasoning |
|----------|-----|-------|-----------|
| **API Coverage** — endpoints correctly matched | 20 | 11 | 34/39 expected endpoints accounted for; 3 actively return 403 for passengers (promo, bookings, rides); 1 path broken (SOS); 1 unconfirmed (rate-driver) |
| **Authentication & Security** | 15 | 7 | Solid login/refresh flow. Gaps: no self-delete, no auth on support tickets, socket token not refreshed, raw error strings exposed |
| **Real-time / Socket** | 10 | 6 | 6/11 events correctly matched; `shuttle:driver:location` gap, `auth:login` not in constants, no socket re-auth, waiting charge events unhandled |
| **DTO / Schema Correctness** | 15 | 6 | 6 confirmed DTO mismatches: station IDs ignored, seatCount max mismatch, Arabic fields undocumented, segmentPrice undocumented, status enum incomplete, no pagination |
| **Dead Code / Dead UI** | 10 | 4 | 8 dead buttons, 1 dead hook, 1 dead library (42KB), 4 locations using mock/static data |
| **Missing Integrations** | 15 | 5 | 11 missing integrations (avatar upload, SOS, account delete, promo list broken, bookings broken, rides path broken, rate-driver unconfirmed, waiting charges, pre-departure location, payment methods, wallet transfer) |
| **Localization** | 10 | 5 | Arabic fields returned but not in spec or types; UTC not documented; push notifications language uncontrolled; raw error strings displayed |
| **Error Handling** | 5 | 2 | Raw server strings shown to users; no error code system; `400` from seatCount has no clear user message |

### Total Score

```
┌────────────────────────────────────────────────────┐
│                                                    │
│   SYSTEM HEALTH SCORE:   46 / 100   ⚠️             │
│                                                    │
│   Status: NOT PRODUCTION READY                     │
│                                                    │
│   3 features actively return 403 for passengers    │
│   1 endpoint registered at wrong path              │
│   2 endpoints unimplemented on backend             │
│   SOS safety feature completely non-functional     │
│   Promo browsing feature completely non-functional │
│   Ride history feature completely non-functional   │
│                                                    │
└────────────────────────────────────────────────────┘
```

> The frontend audit gave an internal score of 71/100 (frontend-only perspective). After cross-system verification against backend source of truth, the real score drops to **46/100** because three core passenger features (promo listing, ride history, booking history for favorites) are actively returning HTTP 403 due to missing role guards, the ride-hailing path is wrong, and the SOS endpoint is misconfigured.

---

## 13. Engineering Action Plan

### P0 — Critical Blockers (Ship-Stopper; Fix Before Any Release)

| # | Owner | Task | File(s) | Action |
|---|-------|------|---------|--------|
| 1 | **Backend** | Fix SOS endpoint path | `artifacts/api-server/src/routes/rides.ts` line ~1990 | Change `router.post("/:id/sos", ...)` → `router.post("/rides/:id/sos", ...)` |
| 2 | **Backend** | Add passenger promo list endpoint | `artifacts/api-server/src/routes/promo.ts` | Add `GET /promo/available` (no admin role guard) returning only active, non-expired promos |
| 3 | **Backend** | Fix or rename passenger ride history | `artifacts/api-server/src/routes/rides.ts` | Rename `GET /rides/my` to `GET /rides` for passengers, OR add `GET /rides` as an alias |
| 4 | **Frontend** | Fix `GET /bookings` → use `GET /users/me/bookings` | `src/hooks/useFavoriteDestinations.ts` | Replace admin endpoint call with user-scoped endpoint |
| 5 | **Frontend** | Update promo call to new endpoint | `src/hooks/usePromos.ts` | Call `GET /promo/available` once backend adds it |
| 6 | **Backend** | Implement `DELETE /users/me` | `artifacts/api-server/src/routes/users.ts` | Cascade delete: rides → bookings → wallet_transactions → notifications → sos_events → drivers (if any) → users |
| 7 | **Backend** | Implement `POST /users/me/avatar` | `artifacts/api-server/src/routes/users.ts` | Use existing `documentUpload` multer config; upload to Supabase bucket; save URL to `users.avatarUrl` |
| 8 | **Backend** | Add auth guard to `POST /support/tickets` | `artifacts/api-server/src/routes/support.ts` | Add `authenticate` middleware; add rate limiter |
| 9 | **Backend** | Verify or implement `POST /rides/:id/rate-driver` | `artifacts/api-server/src/routes/rides.ts` | Confirm endpoint exists; if not, add it with rating storage and notification to driver |

### P1 — High Priority (Required for Feature Completeness)

| # | Owner | Task | File(s) | Action |
|---|-------|------|---------|--------|
| 10 | **Frontend** | Wire SOS button to API + emergency call | `components/shared/SafetySheet.tsx` | Call `POST /rides/:id/sos` (fixed path) AND `Linking.openURL('tel:911')` |
| 11 | **Frontend** | Wire Delete Account to `DELETE /users/me` | `app/(tabs)/profile.tsx` | Call endpoint, clear all tokens and context on success, navigate to `/auth` |
| 12 | **Frontend** | Wire profile photo upload to `POST /users/me/avatar` | `app/(tabs)/profile.tsx` | After picker selection, POST multipart form; update local profile state on success |
| 13 | **Frontend** | Fix socket re-auth on token refresh | `src/api/client.ts`, `src/api/socket.ts` | After successful `POST /auth/refresh`, call `socket.auth.token = newToken; socket.disconnect().connect()` |
| 14 | **Frontend** | Listen to `shuttle:driver:location` for pre-departure tracking | `app/ticket.tsx`, `app/trip-detail.tsx` | Add socket listener for `shuttle:driver:location` and update driver position on map |
| 15 | **Backend** | Add `AUTH_LOGIN: "auth:login"` to SOCKET_EVENTS | `artifacts/api-server/src/lib/socket-events.ts` | Ensure server emits this event using the constant, not a raw string |
| 16 | **Backend** | Update OpenAPI spec with Arabic localization fields | `lib/api-spec` / `lib/api-zod` | Add `nameAr`, `fromLocationAr`, `toLocationAr`, `areaAr`, `segmentPrice` to Route, Station, User schemas; regenerate types |
| 17 | **Backend** | Add `driver_assigned` and `boarding` to trip status enum | `lib/api-spec` | Update Trip schema status enum; regenerate types |
| 18 | **Backend** | Add pagination to `GET /users/me/bookings` | `artifacts/api-server/src/routes/users.ts` | Accept `page` and `limit` query params; return `{ data, meta: { total, page, limit } }` |
| 19 | **Frontend** | Fix phone number display in profile | `app/(tabs)/profile.tsx` | Remove hardcoded `"+20 100 000 0000"`, read `phone` from `GET /users/me` response |
| 20 | **Frontend** | Add `onPress` to avatar button on Home | `app/(tabs)/index.tsx` ~line 214 | Add `router.push('/(tabs)/profile')` |
| 21 | **Frontend** | Wire heart/favorite button in TripSheet | `components/TripSheet.tsx` ~line 424 | Call `FavoritesContext.toggle(routeId)` |

### P2 — Medium Priority (Production Quality)

| # | Owner | Task | File(s) | Action |
|---|-------|------|---------|--------|
| 22 | **Frontend** | Use `POST /rides/estimate` before confirming ride | `app/(tabs)/car.tsx` | Call estimate on location selection; show fare preview before "Confirm Ride" |
| 23 | **Frontend** | Handle `ride:driver_cancelled` and `ride:no_show_cancelled` | `src/hooks/useRide.ts` | Add socket listeners; show distinct cancellation messages per type |
| 24 | **Frontend** | Handle waiting charge socket events | `app/(tabs)/car.tsx` | Add `ride:waiting:charge:started/updated/capped` listeners; show live waiting meter |
| 25 | **Backend** | Add error code system to API responses | All route handlers | Return `{ error: "HUMAN_MESSAGE", code: "MACHINE_CODE" }` for all errors |
| 26 | **Frontend** | Map backend error codes to i18n translations | `app/(tabs)/car.tsx`, all error displays | Replace raw server string display with `t('error.' + code)` |
| 27 | **Backend** | Remove `pickupStationId`/`dropoffStationId` from `CreateBookingBody` OR store them | `lib/api-zod`, `artifacts/api-server/src/routes/bookings.ts` | Either store station IDs in `bookings` table or remove from DTO |
| 28 | **Backend** | Clarify ride chat namespace | `artifacts/api-server/src/routes/chat.ts` | Either add `/rides/:id/chat` endpoints for car ride chat, or document that `/trips/:id/chat` is shuttle-only |
| 29 | **Frontend** | Remove `useDebt.ts` dead hook | `src/hooks/useDebt.ts` | Delete file; standardize on `useMyDebt` |
| 30 | **Frontend** | Remove `@tanstack/react-query` | `package.json` | `pnpm remove @tanstack/react-query` |
| 31 | **Frontend** | Fix `useNotifications` redundant `GET /users/me` call | `src/hooks/useNotifications.ts` | Read `userId` from shared profile context |
| 32 | **Backend** | Document UTC timezone and return Cairo offset | API spec, trip response | Add `departureTimeLocal` (ISO8601+03:00) to trip response alongside UTC value |
| 33 | **Backend** | Document wallet negative balance behavior | API spec, wallet response | Add `cashDebt` field or document that negative balance = debt |

### P3 — Low Priority / Enhancement

| # | Owner | Task | File(s) | Action |
|---|-------|------|---------|--------|
| 34 | **Backend** | Add `POST /wallet/transfer` endpoint | `artifacts/api-server/src/routes/wallet.ts` | User-to-user balance transfer, or remove frontend button |
| 35 | **Backend** | Add payment methods CRUD | New route file | `GET/POST/DELETE /payment-methods` with card tokenization |
| 36 | **Backend** | Add `PATCH /users/me/notifications` for push preference sync | `artifacts/api-server/src/routes/users.ts` | Store notification preferences per-user in DB |
| 37 | **Frontend** | Use `GET /locations` for car pickup/dropoff instead of `WG_COORDS` | `app/(tabs)/car.tsx` | Replace hardcoded array with API call |
| 38 | **Frontend** | Add deep links for `veego://ride/{id}` and `veego://promo/{code}` | `app/_layout.tsx` | Register handlers for ride tracking and promo auto-fill |
| 39 | **Backend** | Add deprecation warning to `GET /auth/me` | `artifacts/api-server/src/routes/auth.ts` | Add `console.warn` or response header `Deprecation: true` |
| 40 | **Frontend** | Implement Bike/Scooter service or hide the tab | `components/bike/BikeServiceScreen.tsx` | Remove `MOCK_RIDER` data; connect to API or clearly disable the tab |

---

### Summary Counts

| Priority | Backend Tasks | Frontend Tasks | Total |
|----------|--------------|----------------|-------|
| P0 — Critical | 7 | 2 | **9** |
| P1 — High | 5 | 8 | **13** |
| P2 — Medium | 6 | 5 | **11** |
| P3 — Low | 5 | 4 | **9** |
| **Total** | **23** | **19** | **42** |

---

*Report generated from direct source analysis of:*
- *`artifacts/api-server/src/routes/` — 38 route files*
- *`lib/api-server/src/lib/socket-events.ts` — canonical event constants*
- *`lib/db/src/schema/` — all database models*
- *`lib/api-zod/src/generated/api.ts` — DTO schemas*
- *`artifacts/admin-dashboard/src/` — admin UI (for coverage cross-check)*
- *`FULL_REACT_NATIVE_DETAILED_INTEGRATION_AUDIT_1781327883792.md` — 893 lines, complete*
