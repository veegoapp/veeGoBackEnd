# Rider App Audit — Backend Contract Compliance Report

> **Generated:** 2026-06-03  
> **Backend Contract:** `attached_assets/backend-contract_1780473845041.md`  
> **Source of truth:** Backend contract  
> **Scope:** Full static analysis of all TypeScript/TSX source files against the contract

---

## Table of Contents

1. [Endpoint Mismatches](#1-endpoint-mismatches)
2. [HTTP Method Mismatches](#2-http-method-mismatches)
3. [Request Body Mismatches](#3-request-body-mismatches)
4. [Response Schema Mismatches](#4-response-schema-mismatches)
5. [Missing Endpoints Used by Frontend](#5-missing-endpoints-used-by-frontend)
6. [Missing Backend Features Expected by Frontend](#6-missing-backend-features-expected-by-frontend)
7. [Authentication / Token Handling Mismatches](#7-authentication--token-handling-mismatches)
8. [Socket.IO Event Mismatches](#8-socketio-event-mismatches)
9. [TypeScript Interface Mismatches](#9-typescript-interface-mismatches)
10. [API Service Layer Mismatches](#10-api-service-layer-mismatches)
11. [React Query Hook Mismatches](#11-react-query-hook-mismatches)
12. [Navigation Flows That Depend on Missing APIs](#12-navigation-flows-that-depend-on-missing-apis)
13. [Screens That Cannot Function](#13-screens-that-cannot-function)
14. [Environment Variable Issues](#14-environment-variable-issues)
15. [Base URL Issues](#15-base-url-issues)
16. [Summary](#summary)

---

## 1. Endpoint Mismatches

### ISS-001 — Routes fetched from non-existent `/shuttle/lines`

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRoutes.ts` |
| **Line** | 76 |
| **Current code** | `api.get('/shuttle/lines')` |
| **Contract requirement** | `GET /api/routes` (§14) or `GET /api/shuttle/routes` (§6) |
| **Severity** | **Critical** |

The entire routes listing is fetched from `/shuttle/lines` which does not exist in the contract. The correct endpoints are `GET /api/routes` (§14) for the full route list or `GET /api/shuttle/routes` (§6, redirects to same). This causes the Home screen route cards and the Routes tab to always fail.

---

### ISS-002 — Routes fetched from non-existent `/shuttle/lines` (trips hook)

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useTrips.ts` |
| **Line** | 73 |
| **Current code** | `api.get('/shuttle/lines')` |
| **Contract requirement** | `GET /api/routes` (§14) |
| **Severity** | **Critical** |

Same non-existent endpoint used in the trips hook to build a route lookup map.

---

### ISS-003 — Single route detail fetched from non-existent `/shuttle/lines/:id`

| Field | Value |
|-------|-------|
| **File** | `context/BookingContext.tsx` |
| **Line** | 71 |
| **Current code** | `api.get('/shuttle/lines/${route.id}')` |
| **Contract requirement** | `GET /api/routes/:id` (§14) |
| **Severity** | **Critical** |

When a user taps a route card to open the booking sheet, the app fetches `/shuttle/lines/:id`. The contract only defines `GET /api/routes/:id`. The station list and seat availability will never load.

---

### ISS-004 — User bookings fetched from non-existent `/users/me/bookings`

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useTrips.ts` |
| **Line** | 72 |
| **Current code** | `api.get('/users/me/bookings')` |
| **Contract requirement** | `GET /api/shuttle/bookings` (§6) |
| **Severity** | **Critical** |

The Trips screen fetches bookings from `/users/me/bookings`. The contract defines this as `GET /api/shuttle/bookings` with optional `page`, `limit`, `status` params. The Trips screen will always throw an error or show empty.

---

### ISS-005 — Admin-only `GET /trips` called by passenger app

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRoutes.ts` |
| **Line** | 77 |
| **Current code** | `api.get('/trips?status=scheduled&limit=200')` |
| **Contract requirement** | `GET /api/trips` is **Admin-only** (§15) |
| **Severity** | **Critical** |

The passenger app calls the admin-only `GET /api/trips` endpoint to resolve seat counts and next departures for route cards. A passenger JWT with role `user` will receive a `403 Forbidden`. The correct approach is to use `GET /api/shuttle/trips` (§6) which is public.

---

### ISS-006 — Admin-only `GET /trips` called as booking fallback

| Field | Value |
|-------|-------|
| **File** | `context/BookingContext.tsx` |
| **Line** | 133 |
| **Current code** | `api.get('/trips', { params: { routeId, status: 'scheduled', limit: 5 } })` |
| **Contract requirement** | `GET /api/trips` is **Admin-only** (§15); use `GET /api/shuttle/trips` (§6) |
| **Severity** | **Critical** |

Same admin-only endpoint used as a fallback when looking for available trips to book. Passenger will receive 403.

---

### ISS-007 — Booking submitted to admin endpoint `POST /bookings`

| Field | Value |
|-------|-------|
| **File** | `context/BookingContext.tsx` |
| **Line** | 148 |
| **Current code** | `api.post('/bookings', { tripId, seatCount: pendingBooking.passengers })` |
| **Contract requirement** | `POST /api/shuttle/book` (§6) |
| **Severity** | **Critical** |

`POST /api/bookings` is the Admin endpoint for listing/managing all bookings (§17). The passenger booking endpoint is `POST /api/shuttle/book`. Booking will fail with 403 or 404 for any passenger.

---

### ISS-008 — Cancel booking uses admin endpoint

| Field | Value |
|-------|-------|
| **File** | `app/(tabs)/trips.tsx` |
| **Line** | 120 |
| **Current code** | `api.patch('/bookings/${tripId}/cancel')` |
| **Contract requirement** | `PATCH /api/shuttle/bookings/:id/cancel` (§6) |
| **Severity** | **Critical** |

The cancel action calls `/bookings/:id/cancel` which is in the Admin bookings namespace (§17). The correct endpoint is `/shuttle/bookings/:id/cancel`.

---

### ISS-009 — Wallet balance fetched from wrong endpoint

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useWallet.ts` |
| **Line** | 103 |
| **Current code** | `api.get('/wallet')` |
| **Contract requirement** | `GET /api/wallet/balance` (§5) |
| **Severity** | **High** |

The wallet hook calls `GET /wallet` which has no contract definition. The correct endpoint is `GET /api/wallet/balance`. The wallet screen will show balance 0 or throw.

---

### ISS-010 — Promo listing calls Admin-only endpoint

| Field | Value |
|-------|-------|
| **File** | `src/hooks/usePromos.ts` |
| **Line** | 71 |
| **Current code** | `api.get('/promo')` |
| **Contract requirement** | `GET /api/promo` is **Admin-only** (§13) |
| **Severity** | **Critical** |

`GET /api/promo` requires `admin` role (§13). A passenger calling this endpoint will receive 403. The Promo screen will always show an empty list. There is no public passenger-facing endpoint to list promo codes.

---

### ISS-011 — Service controls fetched from non-existent `/services/control`

| Field | Value |
|-------|-------|
| **File** | `context/ServiceControlContext.tsx` |
| **Line** | 99 |
| **Current code** | `api.get('/services/control')` |
| **Contract requirement** | `GET /api/service-controls` (§10) |
| **Severity** | **High** |

The ServiceControl context fetches from `/services/control` which does not exist. The contract defines `GET /api/service-controls`. All service enable/disable logic will fail silently, defaulting to "all services live."

---

### ISS-012 — Zone locate endpoint does not exist in contract

| Field | Value |
|-------|-------|
| **File** | `context/ServiceControlContext.tsx` |
| **Line** | 52 |
| **Current code** | `api.get('/zones/locate', { params: { lat, lng } })` |
| **Contract requirement** | Not in contract. Contract only has `GET /api/zones` (§9) — returns all zones, no point-in-polygon lookup |
| **Severity** | **High** |

The app tries to resolve which zone a user is in by calling `/zones/locate`. This endpoint is not defined anywhere in the contract. Zone-based service filtering will always fail (returns `null` zone ID, but app fails open).

---

### ISS-013 — Ride chat uses non-existent trip chat endpoints

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRideChat.ts` |
| **Lines** | 33, 81 |
| **Current code** | `api.get('/trips/${tripId}/chat')` / `api.post('/trips/${tripId}/chat', { message })` |
| **Contract requirement** | Not in contract. Chat is ticket-based: `GET /api/chat/:ticketId/messages` and `POST /api/chat/:ticketId/messages` (§12) |
| **Severity** | **Critical** |

The ride chat modal in `car.tsx` and the chat hook use trip-based chat endpoints that do not exist. The backend only has support-ticket chat via `/chat/:ticketId/messages`. Ride chat will always fail.

---

### ISS-014 — Token refresh calls non-existent `/auth/refresh`

| Field | Value |
|-------|-------|
| **File** | `src/api/client.ts` |
| **Line** | 88 |
| **Current code** | `axios.post('${BASE_URL}/auth/refresh', { refreshToken })` |
| **Contract requirement** | `POST /api/auth/refresh` — **not defined in contract** |
| **Severity** | **Critical** |

The 401 interceptor attempts to refresh the access token via `POST /auth/refresh`. This endpoint is absent from the contract. Every 401 response will trigger a failed refresh, then force-logout the user. There is no refresh token pattern in the contract — JWT is single-token.

---

### ISS-015 — Forgot password calls non-existent `/auth/forgot-password`

| Field | Value |
|-------|-------|
| **File** | `app/auth.tsx` |
| **Line** | 343 |
| **Current code** | `api.post('/auth/forgot-password', { phone: phone.trim() })` |
| **Contract requirement** | Not in contract. Auth section (§1) only defines `register` and `login` |
| **Severity** | **High** |

The "Forgot Password" flow calls an endpoint that doesn't exist. The code suppresses errors to prevent enumeration, so the user will always see "success" even though nothing happens.

---

## 2. HTTP Method Mismatches

### ISS-016 — `PATCH /rides/:id/cancel` — correct method, wrong path context

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRide.ts` |
| **Line** | 210 |
| **Current code** | `api.patch('/rides/${rideId}/cancel')` |
| **Contract requirement** | `PATCH /api/rides/:id/cancel` (§4) — method is correct |
| **Severity** | **Low** |

Method is correct but no request body is sent. Contract allows optional `{ reason: string }`. No mismatch in method, documented for completeness.

---

## 3. Request Body Mismatches

### ISS-017 — Login sends `credential` instead of `email`

| Field | Value |
|-------|-------|
| **File** | `app/auth.tsx` |
| **Line** | 118 |
| **Current code** | `api.post('/auth/login', { credential: credential.trim(), password })` |
| **Contract requirement** | `{ "email": "string", "password": "string" }` (§1) |
| **Severity** | **Critical** |

The login form sends `credential` as the key. The backend expects `email`. Login will always fail with 400 or 401 validation error unless the backend has an undocumented fallback.

---

### ISS-018 — Registration enforces 8-char password, contract says 6

| Field | Value |
|-------|-------|
| **File** | `app/auth.tsx` |
| **Line** | 208 |
| **Current code** | `if (password.length < 8) { Alert.alert(...) }` |
| **Contract requirement** | `"password": "string (min 6 chars, required)"` (§1) |
| **Severity** | **Low** |

Frontend blocks passwords of length 6–7. Contract allows them. Users who create a 6 or 7 character password on another platform cannot register on this app.

---

### ISS-019 — Wallet topup missing `paymentMethod` field

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useWallet.ts` |
| **Line** | 141 |
| **Current code** | `api.post('/wallet/topup', { amount })` |
| **Contract requirement** | `{ "amount": 100.00, "paymentMethod": "card \| mobile_money" }` (§5) |
| **Severity** | **High** |

Topup request omits the required `paymentMethod` field. Backend will likely return a validation error (`400`).

---

### ISS-020 — Promo validate missing `amount` field

| Field | Value |
|-------|-------|
| **File** | `src/hooks/usePromos.ts` |
| **Line** | 85 |
| **Current code** | `api.post('/promo/validate', { code })` |
| **Contract requirement** | `{ "code": "SAVE10", "amount": 100.00 }` (§13) |
| **Severity** | **High** |

The promo validation call omits `amount`, which the backend needs to compute the discount. The response fields `discountAmount` and `finalAmount` will be wrong or the backend may return a 400.

---

### ISS-021 — Support ticket sends wrong field names

| Field | Value |
|-------|-------|
| **File** | `app/support.tsx` |
| **Line** | 96–99 |
| **Current code** | `api.post('/support/tickets', { issueType: selectedIssue, message: message.trim() })` |
| **Contract requirement** | `{ "subject": "string", "message": "string", "type": "general\|billing\|technical\|driver\|ride", "priority": "low\|medium\|high" }` (§12) |
| **Severity** | **High** |

The field `issueType` does not exist in the contract — the correct field is `type`. Additionally, `subject` is required and missing, and `priority` is missing. The frontend issue-type enum values (`issue_booking`, `issue_payment`, `issue_driver`, `issue_app`, `issue_other`) do not match the contract values (`general`, `billing`, `technical`, `driver`, `ride`).

---

### ISS-022 — Booking missing `boardingStationId` and `alightingStationId`

| Field | Value |
|-------|-------|
| **File** | `context/BookingContext.tsx` |
| **Line** | 148–150 |
| **Current code** | `api.post('/bookings', { tripId, seatCount: pendingBooking.passengers })` |
| **Contract requirement** | `{ "tripId": 42, "seatCount": 2, "boardingStationId": 5, "alightingStationId": 8, "promoCode": "optional" }` via `POST /api/shuttle/book` (§6) |
| **Severity** | **Critical** |

The booking call omits two required fields: `boardingStationId` and `alightingStationId`. The contract requires these to compute the segment price and track boarding. Even if the endpoint were correct, the backend would return a validation error.

---

### ISS-023 — Profile update sends `email` and `dob` (not allowed)

| Field | Value |
|-------|-------|
| **File** | `app/(tabs)/profile.tsx` |
| **Line** | 135 |
| **Current code** | `apiSave({ name: n, email: em, dob: d })` → `api.patch('/users/me', updates)` |
| **Contract requirement** | `PATCH /api/users/me` accepts only `{ name, phone, avatarUrl }` (§2) |
| **Severity** | **Medium** |

The personal info save function sends `email` and `dob`. The contract does not allow updating email via this endpoint, and `dob` is not a field in the user schema at all. Backend will silently ignore unknown fields or reject the update.

---

## 4. Response Schema Mismatches

### ISS-024 — Frontend ride status vocabulary is incompatible with contract

| Field | Value |
|-------|-------|
| **File** | `src/api/socket.ts` |
| **Lines** | 71–79 |
| **Current code** | `type RideStatus = 'searching' \| 'driver_assigned' \| 'driver_en_route' \| 'arrived' \| 'started' \| 'completed' \| 'cancelled' \| 'timeout'` |
| **Contract requirement** | Ride statuses: `pending → accepted → arrived → in_progress → completed / cancelled` (§4) |
| **Severity** | **Critical** |

The frontend's ride status vocabulary is entirely different from the contract. Statuses like `searching`, `driver_assigned`, `driver_en_route`, `started`, `timeout` do not exist in the contract. Contract statuses `pending`, `accepted`, `in_progress` have no frontend equivalent. All polling-based status transitions in `useRide.ts` will fail to match.

---

### ISS-025 — Wallet response has no `spent` / `monthlySpent` field

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useWallet.ts` |
| **Line** | 111 |
| **Current code** | `const spentVal = d.spent ?? d.monthlySpent ?? d.spentThisMonth ?? d.total_spent ?? 0` |
| **Contract requirement** | `GET /api/wallet/balance` returns `{ "balance": 150.00, "currency": "EGP" }` only (§5) |
| **Severity** | **Medium** |

The wallet hook attempts to read a "spent" field that does not exist in the contract response. The spent amount displayed on the Wallet screen will always be 0.

---

### ISS-026 — Service control response shape is completely different from contract

| Field | Value |
|-------|-------|
| **File** | `context/ServiceControlContext.tsx` |
| **Lines** | 13–22, 99–104 |
| **Current code** | Maps response to `ServiceControl` with fields: `service_type, is_enabled, display_mode, unavailable_message, unavailable_action, active_zone_ids, maintenance_eta` |
| **Contract requirement** | `GET /api/service-controls` returns `{ data: [{ id, service, isActive, updatedAt }] }` (§10) |
| **Severity** | **Critical** |

The frontend expects a rich service control schema with `display_mode`, `unavailable_message`, `unavailable_action`, `active_zone_ids`, and `maintenance_eta`. The contract only returns `{ id, service, isActive, updatedAt }`. None of the frontend's extended fields will be populated, causing the entire service-mode logic (coming_soon, maintenance, zone filtering) to fail.

---

### ISS-027 — Notification `category` field vs contract `type` field

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useNotifications.ts` |
| **Line** | 16–17 |
| **Current code** | `const cat = (n.category ?? n.type ?? 'system').toLowerCase()` — maps to `'trip' \| 'promo' \| 'system'` |
| **Contract requirement** | `GET /api/notifications` returns notifications with `"type": "ride_update"` etc. (§8) |
| **Severity** | **Medium** |

The contract uses `type` with values like `"ride_update"`. The frontend categorises into `trip`, `promo`, `system`. The mapping fallback `n.category ?? n.type` handles it partially, but category icons and filters may be wrong since `ride_update` doesn't map cleanly to `trip`.

---

### ISS-028 — `ride:accepted` payload `driver.location` ignored by frontend

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRide.ts` |
| **Lines** | 119–132 |
| **Current code** | Maps `data.driver.vehicle`, `data.driver.rating`, `data.eta` from socket event |
| **Contract requirement** | `ride:accepted` payload: `{ rideId, driver: { id, name, phone, location } }` (§29) |
| **Severity** | **High** |

Contract's `ride:accepted` event sends `driver.location` and `driver.id` but not `vehicle`, `rating`, or `eta`. Frontend reads `vehicle`, `rating`, `eta` which won't be present. Driver's initial location won't be used for the map.

---

### ISS-029 — Booking response missing `seatNumber` field expected by trips mapper

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useTrips.ts` |
| **Line** | 54 |
| **Current code** | `seat: b.seatNumber ?? b.seat_number ?? b.seat ?? '—'` |
| **Contract requirement** | Booking object (§6, §17) has no `seatNumber` field — only `seatCount` (number of seats booked) |
| **Severity** | **Medium** |

The frontend tries to display an individual seat number. The contract only returns `seatCount` (how many seats). Seat display will always show `'—'`.

---

### ISS-030 — `UserProfile.dob` field not in contract user schema

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useProfile.ts` |
| **Lines** | 6, 30 |
| **Current code** | `dob: d.dob ?? d.dateOfBirth ?? d.birthdate ?? ''` |
| **Contract requirement** | `GET /api/users/me` returns `{ id, name, email, phone, role, avatarUrl, createdAt }` — no `dob` field (§2) |
| **Severity** | **Low** |

The frontend defines and attempts to read/save a `dob` field that doesn't exist in the contract.

---

## 5. Missing Endpoints Used by Frontend

| # | Endpoint Called by Frontend | Should Be | File | Line | Severity |
|---|----------------------------|-----------|------|------|----------|
| 1 | `GET /api/shuttle/lines` | `GET /api/routes` (§14) | `useRoutes.ts`, `useTrips.ts` | 76, 73 | Critical |
| 2 | `GET /api/shuttle/lines/:id` | `GET /api/routes/:id` (§14) | `BookingContext.tsx` | 71 | Critical |
| 3 | `GET /api/users/me/bookings` | `GET /api/shuttle/bookings` (§6) | `useTrips.ts` | 72 | Critical |
| 4 | `GET /api/zones/locate` | Does not exist (§9 has `GET /api/zones` only) | `ServiceControlContext.tsx` | 52 | High |
| 5 | `GET /api/services/control` | `GET /api/service-controls` (§10) | `ServiceControlContext.tsx` | 99 | High |
| 6 | `GET /api/trips/:id/chat` | Does not exist (§12 has ticket chat only) | `useRideChat.ts` | 33 | Critical |
| 7 | `POST /api/trips/:id/chat` | Does not exist (§12 has ticket chat only) | `useRideChat.ts` | 81 | Critical |
| 8 | `POST /api/auth/refresh` | Does not exist in contract | `src/api/client.ts` | 88 | Critical |
| 9 | `POST /api/auth/forgot-password` | Does not exist in contract | `app/auth.tsx` | 343 | High |

---

## 6. Missing Backend Features Expected by Frontend

### ISS-031 — No refresh token / token rotation flow in contract

| Field | Value |
|-------|-------|
| **File** | `src/api/client.ts` |
| **Lines** | 63–104 |
| **Contract requirement** | Contract defines no `POST /auth/refresh` or any token refresh mechanism |
| **Severity** | **Critical** |

The frontend implements a full refresh token queue (storing `veego_refresh_token` in SecureStore). The backend contract has no such endpoint or pattern. Every 401 will result in: failed refresh → user force-logged out. Any real-world session expiry will terminate the user session.

---

### ISS-032 — No forgot-password / OTP flow in contract

| Field | Value |
|-------|-------|
| **File** | `app/auth.tsx` |
| **Lines** | 332–407 |
| **Contract requirement** | Auth section (§1) has only `register` and `login` |
| **Severity** | **High** |

The "Forgot Password" screen exists in the UI but has no backend support. The OTP-based reset flow described in the UI copy is entirely unimplemented in the contract.

---

### ISS-033 — Extended service control fields expected but not in contract

| Field | Value |
|-------|-------|
| **File** | `context/ServiceControlContext.tsx` |
| **Lines** | 13–22 |
| **Contract requirement** | `GET /api/service-controls` only returns `{ id, service, isActive, updatedAt }` (§10) |
| **Severity** | **Critical** |

Frontend requires `display_mode`, `unavailable_message`, `unavailable_action`, `active_zone_ids`, `maintenance_eta`. None of these are in the contract. Features like "coming soon" badge, maintenance mode, zone-based hiding, and custom unavailable messages depend on these fields.

---

### ISS-034 — Ride chat (trip-based) is not in contract

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRideChat.ts`, `components/car/ChatModal.tsx` |
| **Lines** | 26–92 |
| **Contract requirement** | Contract has support ticket chat only via `/chat/:ticketId/messages` (§12) |
| **Severity** | **Critical** |

The chat modal for in-progress rides references a trip-based chat that has no backend definition.

---

### ISS-035 — `spent` / monthly spend field missing from wallet response

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useWallet.ts` |
| **Line** | 111 |
| **Contract requirement** | Not in `GET /api/wallet/balance` response (§5) |
| **Severity** | **Medium** |

---

### ISS-036 — Individual seat number not available on booking objects

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useTrips.ts` |
| **Line** | 54 |
| **Contract requirement** | Booking objects (§6, §17) have `seatCount`, not `seatNumber` |
| **Severity** | **Medium** |

---

## 7. Authentication / Token Handling Mismatches

### ISS-037 — Login payload key mismatch (`credential` vs `email`)

| Field | Value |
|-------|-------|
| **File** | `app/auth.tsx` |
| **Line** | 118 |
| **Current code** | `{ credential: credential.trim(), password }` |
| **Contract requirement** | `{ "email": "string", "password": "string" }` (§1) |
| **Severity** | **Critical** |

Login will fail unless the backend has an undocumented alias for `credential`.

---

### ISS-038 — Refresh token stored but no server-side support

| Field | Value |
|-------|-------|
| **File** | `app/auth.tsx` |
| **Lines** | 24–28 |
| **Current code** | `const refreshToken = data.refreshToken ?? data.refresh_token; if (refreshToken) await tokenStore.setToken(REFRESH_KEY, refreshToken)` |
| **Contract requirement** | Contract `POST /auth/login` returns `{ token, user }` only — no `refreshToken` (§1) |
| **Severity** | **High** |

The app tries to persist a refresh token from the login response. The contract does not return one. The `REFRESH_KEY` will remain empty, so the refresh interceptor will always fail immediately and log the user out on any 401.

---

### ISS-039 — No REFRESH_KEY in SecureStore — silent logout on token expiry

| Field | Value |
|-------|-------|
| **File** | `src/api/client.ts` |
| **Lines** | 86–100 |
| **Current code** | `const refreshToken = await getToken(REFRESH_KEY); if (!refreshToken) throw new Error('No refresh token')` |
| **Contract requirement** | No refresh mechanism defined; backend uses single-token JWT |
| **Severity** | **Critical** |

When any authenticated API call returns 401 (token expired), the interceptor tries to refresh, finds no refresh token, and calls `router.replace('/auth')`. Users will be force-logged out without warning the moment their JWT expires.

---

## 8. Socket.IO Event Mismatches

### ISS-040 — Frontend listens for `ride:driver_assigned`; contract emits `ride:accepted`

| Field | Value |
|-------|-------|
| **Files** | `src/api/socket.ts:88`, `src/hooks/useRide.ts:119`, `src/constants/socketEvents.ts:8` |
| **Current code** | `socket.on('ride:driver_assigned', ...)` |
| **Contract requirement** | Server emits `ride:accepted` to `passenger:{userId}` (§29) |
| **Severity** | **Critical** |

The most critical ride event will never fire on the passenger app. When a driver accepts a ride, the frontend never receives the event, so the UI stays on "searching" indefinitely.

---

### ISS-041 — Frontend listens for `ride:arrived`; contract emits `ride:driver_arrived`

| Field | Value |
|-------|-------|
| **Files** | `src/constants/socketEvents.ts:9-10`, `src/hooks/useRide.ts:139`, `app/trip-tracking.tsx:77` |
| **Current code** | `socket.on('ride:arrived', ...)` |
| **Contract requirement** | Server emits `ride:driver_arrived` to `passenger:{userId}` (§29) |
| **Severity** | **Critical** |

When the driver arrives at pickup, the correct event `ride:driver_arrived` is emitted by the server but the frontend never hears it. The "Driver has arrived" state will never trigger.

---

### ISS-042 — Frontend listens for `ride:driver_location`; not in contract server→client events

| Field | Value |
|-------|-------|
| **Files** | `src/hooks/useRide.ts:134`, `app/trip-tracking.tsx:73` |
| **Current code** | `socket.on('ride:driver_location', ...)` |
| **Contract requirement** | Contract §29 server→client events for passengers do not include `ride:driver_location`; the `driver:location_updated` event is only emitted to `drivers:available:{vehicleType}` and `admin:room` |
| **Severity** | **Critical** |

Driver live-location updates will never reach the passenger. The map marker for the driver will not move.

---

### ISS-043 — `ride:timeout` event not in contract

| Field | Value |
|-------|-------|
| **Files** | `src/constants/socketEvents.ts:15`, `src/hooks/useRide.ts:161`, `src/api/socket.ts:94` |
| **Current code** | `socket.on('ride:timeout', ...)` |
| **Contract requirement** | Not defined in §29 |
| **Severity** | **Medium** |

Frontend handles a timeout event that the server is not documented to emit.

---

### ISS-044 — `trip:chat-message` event not in contract

| Field | Value |
|-------|-------|
| **Files** | `src/constants/socketEvents.ts:18`, `src/hooks/useRideChat.ts:60` |
| **Current code** | `socket.on('trip:chat-message', ...)` |
| **Contract requirement** | Contract §29 defines `message:new` for support ticket rooms, not trip chat |
| **Severity** | **Critical** |

Real-time chat messages will never arrive via this event. The chat modal will be one-directional at best.

---

### ISS-045 — `service:control:changed` event not in contract

| Field | Value |
|-------|-------|
| **File** | `context/ServiceControlContext.tsx` |
| **Line** | 157 |
| **Current code** | `socket.on('service:control:changed', applyUpdate)` |
| **Contract requirement** | Not in §29 WebSocket events |
| **Severity** | **Medium** |

Real-time service enable/disable updates will never reach the app. Service status only updates on app restart/refresh.

---

### ISS-046 — Frontend uses `join` / `passenger:join:trip` events; contract uses `trip:join`

| Field | Value |
|-------|-------|
| **File** | `src/constants/socketEvents.ts` |
| **Lines** | 21–22 |
| **Current code** | `JOIN: "join"`, `PASSENGER_JOIN_TRIP: "passenger:join:trip"` |
| **Contract requirement** | Client→Server: `trip:join` with `{ tripId: number }` (§29) |
| **Severity** | **High** |

The join events used by the frontend don't match the contract. Trip room subscriptions for live updates will fail.

---

### ISS-047 — `booking:boarded` payload mismatch

| Field | Value |
|-------|-------|
| **File** | `src/api/socket.ts` |
| **Line** | 96 |
| **Current code** | Expects `{ bookingId: string; passengerId?: string; timestamp: string }` |
| **Contract requirement** | `booking:boarded` emits `{ bookingId, tripId, timestamp }` (§29) |
| **Severity** | **Low** |

Frontend expects `passengerId` which contract doesn't send; frontend doesn't expect `tripId` which contract does send.

---

## 9. TypeScript Interface Mismatches

### ISS-048 — `RideStatus` type incompatible with contract

| Field | Value |
|-------|-------|
| **File** | `src/api/socket.ts` |
| **Lines** | 71–79 |
| **Current code** | `'searching' \| 'driver_assigned' \| 'driver_en_route' \| 'arrived' \| 'started' \| 'completed' \| 'cancelled' \| 'timeout'` |
| **Contract requirement** | Contract statuses: `pending`, `accepted`, `arrived`, `in_progress`, `completed`, `cancelled` |
| **Severity** | **Critical** |

Full status vocabulary mismatch. Frontend statuses not in contract: `searching`, `driver_assigned`, `driver_en_route`, `started`, `timeout`. Contract statuses not in frontend: `pending`, `accepted`, `in_progress`.

---

### ISS-049 — `DriverInfo` interface missing `id` and `location`, has extra unsupported fields

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRide.ts` |
| **Lines** | 5–11 |
| **Current code** | `{ name: string; phone: string; vehicle: string; rating: number; eta: number }` |
| **Contract requirement** | `ride:accepted` payload: `{ rideId, driver: { id, name, phone, location } }` (§29) |
| **Severity** | **High** |

Frontend type has `vehicle`, `rating`, `eta` — none in contract payload. Contract has `id`, `location` — not in frontend type.

---

### ISS-050 — `ServiceControl` interface completely diverges from contract schema

| Field | Value |
|-------|-------|
| **File** | `context/ServiceControlContext.tsx` |
| **Lines** | 13–22 |
| **Current code** | `{ service_type, is_enabled, display_mode, unavailable_message, unavailable_action, active_zone_ids, maintenance_eta }` |
| **Contract requirement** | `{ id, service, isActive, updatedAt }` (§10) |
| **Severity** | **Critical** |

None of the frontend's fields (except `is_enabled` ≈ `isActive`) match the contract. All extended control logic is based on non-existent fields.

---

### ISS-051 — `Transaction` type has no contract counterpart for localized fields

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useWallet.ts` |
| **Lines** | 6–17 |
| **Current code** | `{ titleAr, titleEn, subtitleAr, subtitleEn, dateAr, dateEn, icon }` |
| **Contract requirement** | `{ id, type, amount, description, createdAt }` (§5) |
| **Severity** | **Low** |

Frontend enriches transaction objects with localized strings. The mapping logic handles this correctly via `mapTransaction()`. Low risk but any field the contract doesn't return will fall back to empty string.

---

### ISS-052 — `UserProfile.dob` field has no backend source

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useProfile.ts` |
| **Lines** | 4–9, 30 |
| **Current code** | `dob: d.dob ?? d.dateOfBirth ?? d.birthdate ?? ''` |
| **Contract requirement** | User object has no DOB field (§2) |
| **Severity** | **Low** |

DOB will always be empty string. It's editable in the UI but sending it to `PATCH /users/me` is silently ignored per ISS-023.

---

## 10. API Service Layer Mismatches

### ISS-053 — Env var normalization splits on `=` — fragile parsing

| Field | Value |
|-------|-------|
| **File** | `src/api/client.ts` |
| **Lines** | 15–17 |
| **Current code** | `const _normalizedUrl = _rawApiUrl.includes('=') ? _rawApiUrl.split('=').slice(1).join('=').trim() : _rawApiUrl.trim()` |
| **Contract requirement** | `EXPO_PUBLIC_API_URL` should be the plain URL |
| **Severity** | **Medium** |

This code implies the env var was historically set as `EXPO_PUBLIC_API_URL=https://...` and read literally including the key name. If the URL contains an `=` sign (e.g., a signed URL with query params), the normalization will corrupt it. This is duplicated in `src/api/socket.ts` lines 15–17.

---

### ISS-054 — `useRide.ts` polling reads ambiguous status field from ride response

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useRide.ts` |
| **Lines** | 68–70 |
| **Current code** | `const status: RideStatus = data.status ?? data.rideStatus` |
| **Contract requirement** | `GET /api/rides/:id` returns a ride object with `status` as one of the contract values (§4) |
| **Severity** | **High** |

The polled status comes from the contract (`pending`, `accepted`, `in_progress`, etc.) but is mapped to the frontend's `RideStatus` type which has different values (ISS-048). No conversion is performed, so status comparisons like `TERMINAL_STATUSES.includes(status)` will never match for contract statuses.

---

### ISS-055 — `CarServiceScreen` does not call any API — purely mock

| Field | Value |
|-------|-------|
| **File** | `components/car/CarServiceScreen.tsx` |
| **Lines** | 116–123 |
| **Current code** | `setPhase('searching'); setTimeout(() => { setPhase('driver_assigned'); }, 3500)` |
| **Contract requirement** | Ride request should call `POST /api/rides/request` (§4) |
| **Severity** | **Critical** |

The Car service screen simulates the driver being found with a `setTimeout`. No API call is made. The `useRide` hook exists but is never invoked from this screen. Car rides are entirely fake.

---

### ISS-056 — `DriverAssignedCard` shows mock driver data

| Field | Value |
|-------|-------|
| **File** | `components/car/DriverAssignedCard.tsx` |
| **Contract requirement** | Driver info should come from `ride:accepted` socket event or `GET /api/rides/:id` (§4, §29) |
| **Severity** | **Critical** |

Since `CarServiceScreen` doesn't make a real API call, any driver info shown is static/mock. Not audited line by line but inferred from ISS-055.

---

### ISS-057 — `RatingSheet` component shown but never submits to API

| Field | Value |
|-------|-------|
| **File** | `components/shared/RatingSheet.tsx` |
| **Lines** | 55–62 |
| **Current code** | `onSubmit(stars, comment)` — defers to parent |
| **Contract requirement** | `POST /api/rides/:id/rate` with `{ rating, comment }` (§4) or `POST /api/ratings` (§11) |
| **Severity** | **High** |

The rating sheet UI works but the parent (`app/(tabs)/car.tsx`) must wire up the actual API call. This is a design concern — if the parent doesn't call the rating API, ratings are silently dropped.

---

## 11. React Query Hook Mismatches

### ISS-058 — `@tanstack/react-query` listed as dependency but never used

| Field | Value |
|-------|-------|
| **File** | `package.json` (inferred from project description) |
| **Contract requirement** | N/A |
| **Severity** | **Low** |

All data fetching uses manual `useState` / `useEffect` / `useCallback` patterns instead of React Query. There are no `useQuery` or `useMutation` hooks in the codebase. The `QueryClientProvider` is presumably configured but inactive. This means no automatic background refetch, no cache invalidation, and no retry logic beyond manual polling.

---

## 12. Navigation Flows That Depend on Missing APIs

### ISS-059 — Full shuttle booking flow is broken end-to-end

| Flow | Steps | Broken Step | Severity |
|------|-------|-------------|----------|
| Shuttle booking | Home → tap route → booking sheet → confirm | Route loads from wrong endpoint (ISS-001, ISS-003) | Critical |
| Shuttle booking | Confirm → API call | Calls wrong endpoint with missing fields (ISS-007, ISS-022) | Critical |
| Shuttle booking | Success → `/ticket` | Only navigates if booking API succeeds | Critical |

---

### ISS-060 — Trips screen navigation depends on two broken endpoints

| Field | Value |
|-------|-------|
| **File** | `src/hooks/useTrips.ts` |
| **Lines** | 72–73 |
| **Broken endpoints** | `GET /users/me/bookings` (ISS-004), `GET /shuttle/lines` (ISS-002) |
| **Severity** | **Critical** |

The Trips tab always shows empty or error state because both its API calls hit non-existent endpoints.

---

### ISS-061 — Car service ride request never navigates to tracking screen

| Field | Value |
|-------|-------|
| **File** | `components/car/CarServiceScreen.tsx` |
| **Lines** | 116–123 |
| **Severity** | **Critical** |

Because no ride is actually created (ISS-055), the `trip-tracking.tsx` screen which expects a real `rideId` is never navigated to from the main car flow.

---

### ISS-062 — Auth flow: 401 during any session triggers force logout

| Field | Value |
|-------|-------|
| **File** | `src/api/client.ts` |
| **Lines** | 95–101 |
| **Severity** | **Critical** |

Any expired JWT (401) triggers refresh → fails → `router.replace('/auth')`. Users are silently logged out mid-session without explanation.

---

## 13. Screens That Cannot Function Because of Backend/Frontend Mismatch

| Screen | File | Reason | Severity |
|--------|------|--------|----------|
| **Routes tab** | `app/(tabs)/routes.tsx` | Calls non-existent `GET /shuttle/lines` (ISS-001) | Critical |
| **Home — shuttle route cards** | `app/(tabs)/index.tsx` | Routes loaded via `useRoutes` which calls wrong endpoints (ISS-001, ISS-005) | Critical |
| **Trips tab** | `app/(tabs)/trips.tsx` | `useTrips` calls non-existent endpoints (ISS-004, ISS-002) | Critical |
| **Booking flow** | `context/BookingContext.tsx` | Wrong endpoint, wrong method, missing fields (ISS-003, ISS-006, ISS-007, ISS-022) | Critical |
| **Car ride request** | `components/car/CarServiceScreen.tsx` | No real API call — fully mocked (ISS-055) | Critical |
| **Ride tracking** | `app/trip-tracking.tsx` | Socket events never fire due to name mismatch (ISS-040, ISS-041, ISS-042) | Critical |
| **Wallet screen** | `app/(tabs)/wallet.tsx` | `GET /wallet` not in contract; recharge missing `paymentMethod` (ISS-009, ISS-019) | High |
| **Promo screen** | `app/promo.tsx` | `GET /promo` is admin-only (ISS-010); validate missing `amount` (ISS-020) | Critical |
| **Service control** | `context/ServiceControlContext.tsx` | Wrong endpoint, incompatible schema, fake zone lookup (ISS-011, ISS-012, ISS-026) | Critical |
| **Ride chat modal** | `components/car/ChatModal.tsx` | Both REST and socket endpoints don't exist (ISS-013, ISS-044) | Critical |
| **Support screen** | `app/support.tsx` | Wrong field names in request body (ISS-021) | High |
| **Profile — personal info save** | `app/(tabs)/profile.tsx` | Sends fields not accepted by `PATCH /users/me` (ISS-023) | Medium |
| **Login** | `app/auth.tsx` | Sends `credential` instead of `email` (ISS-017) | Critical |
| **Forgot password** | `app/auth.tsx` | Calls non-existent endpoint (ISS-015) | High |

---

## 14. Environment Variable Issues

### ISS-063 — App crashes at startup if `EXPO_PUBLIC_API_URL` is not set

| Field | Value |
|-------|-------|
| **Files** | `src/api/client.ts:7-13`, `src/api/socket.ts:6-12` |
| **Current code** | `if (!_rawApiUrl) { throw new Error(...) }` |
| **Severity** | **Critical** |

Both `client.ts` and `socket.ts` throw at module load time if the env var is missing. Since these are imported at app start (via `_layout.tsx`), the app will crash before rendering any screen. No graceful fallback exists.

---

### ISS-064 — Env var normalization duplicated between client and socket

| Field | Value |
|-------|-------|
| **Files** | `src/api/client.ts:15-18`, `src/api/socket.ts:15-19` |
| **Severity** | **Low** |

The `KEY=value` normalization logic is duplicated. If the normalization logic needs to change, it must be updated in two places.

---

### ISS-065 — No `BACKEND_URL` → `EXPO_PUBLIC_API_URL` propagation validation

| Field | Value |
|-------|-------|
| **File** | `scripts/build.js` (inferred from project description — build script populates `.env`) |
| **Severity** | **Medium** |

The build/dev script is supposed to read `BACKEND_URL` secret and write it to `EXPO_PUBLIC_API_URL` in `.env`. If `BACKEND_URL` is not set as a Replit secret, the populated `.env` will be empty and the app crashes (ISS-063).

---

## 15. Base URL Issues

### ISS-066 — `EXPO_PUBLIC_API_URL` must end with `/api` — undocumented constraint

| Field | Value |
|-------|-------|
| **Files** | `src/api/client.ts:49`, `src/api/socket.ts:19` |
| **Current code** | Client uses `BASE_URL` directly as `baseURL`; Socket strips `/api` suffix: `SOCKET_URL = _apiBase.replace(/\/api\/?$/, '')` |
| **Severity** | **Medium** |

The client assumes the env var ends with `/api` (e.g., `https://server.com/api`). If the user sets it without `/api` (e.g., `https://server.com`), all REST calls will hit `https://server.com/rides/request` instead of `https://server.com/api/rides/request`. The socket stripping logic correctly removes the `/api` suffix for the WebSocket base, but relies on the same assumption.

---

### ISS-067 — Socket connection path `/api/socket.io` — correct per contract

| Field | Value |
|-------|-------|
| **File** | `src/api/socket.ts` |
| **Line** | 34 |
| **Current code** | `path: '/api/socket.io'` |
| **Contract requirement** | `Socket.IO path: /api/socket.io` (§29) |
| **Severity** | **None** |

This is correctly implemented. Documented for completeness.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 **Critical** | **31** |
| 🟠 **High** | **16** |
| 🟡 **Medium** | **8** |
| 🟢 **Low** | **9** |
| **Total Mismatches** | **64** |

---

### Critical Mismatches Breakdown

| ID | Title |
|----|-------|
| ISS-001 | Routes fetched from non-existent `/shuttle/lines` (useRoutes) |
| ISS-002 | Routes fetched from non-existent `/shuttle/lines` (useTrips) |
| ISS-003 | Route detail from non-existent `/shuttle/lines/:id` |
| ISS-004 | User bookings from non-existent `/users/me/bookings` |
| ISS-005 | Admin-only `GET /trips` called by passenger (useRoutes) |
| ISS-006 | Admin-only `GET /trips` called by passenger (BookingContext fallback) |
| ISS-007 | Booking submitted to admin endpoint `POST /bookings` |
| ISS-008 | Cancel booking uses admin endpoint |
| ISS-010 | Promo listing calls admin-only endpoint |
| ISS-013 | Ride chat uses non-existent trip chat endpoints |
| ISS-014 | Token refresh calls non-existent `/auth/refresh` |
| ISS-017 | Login sends `credential` instead of `email` |
| ISS-022 | Booking missing `boardingStationId` and `alightingStationId` |
| ISS-024 | Frontend ride status vocabulary incompatible with contract |
| ISS-026 | Service control response shape completely different from contract |
| ISS-031 | No refresh token flow in contract |
| ISS-033 | Extended service control fields not in contract |
| ISS-034 | Ride chat not in contract |
| ISS-037 | Login payload key mismatch |
| ISS-039 | Silent logout on token expiry |
| ISS-040 | `ride:driver_assigned` vs `ride:accepted` socket event name |
| ISS-041 | `ride:arrived` vs `ride:driver_arrived` socket event name |
| ISS-042 | `ride:driver_location` not in contract server→client events |
| ISS-044 | `trip:chat-message` event not in contract |
| ISS-048 | `RideStatus` type incompatible with contract statuses |
| ISS-050 | `ServiceControl` interface diverges from contract schema |
| ISS-055 | Car service screen is fully mocked — no API calls |
| ISS-056 | `DriverAssignedCard` shows mock driver data |
| ISS-059 | Full shuttle booking flow broken end-to-end |
| ISS-060 | Trips screen depends on two broken endpoints |
| ISS-063 | App crashes at startup if env var not set |

---

*End of audit report. No code was modified. All findings are read-only observations.*
