# VeeGo Passenger App — Frontend Integration Audit: Backend Verdicts

> **Date:** 2026-06-06  
> **Verified against:** `artifacts/api-server/src/routes/`, `artifacts/api-server/src/lib/socket-events.ts`, `artifacts/api-server/src/socket.ts`  
> **Note:** Several findings in this audit turned out to be errors in the original contract document, not bugs in either the frontend or backend. The contract has been corrected in parallel with this report.

---

## Summary Table

| ID | Finding | Verdict |
|----|---------|---------|
| F-001 | Ride request path `/rides/request` vs `/rides` | **CONTRACT GAP** — frontend is correct |
| F-002 | Fare estimate `POST /rides/estimate` missing from docs | **CONTRACT GAP** — endpoint exists |
| F-003 | Rate driver `/rides/:id/rate` vs `/rides/:id/rate-driver` | **FRONTEND BUG** |
| F-004 | Cancel ride PATCH vs POST | **CONTRACT GAP** — frontend is correct |
| F-005 | User profile `/users/me` vs `/auth/me` | **CONTRACT GAP** — frontend is correct |
| F-006 | Chat `/trips/:id/chat` vs `/chat/:rideId` | **CONTRACT GAP** — frontend is correct |
| F-007 | Cancel booking PATCH vs POST | **CONTRACT GAP** — frontend is correct |
| F-008 | `GET /promo` has no role guard | **CONTRACT GAP + BACKEND BUG** |
| F-009 | Forgot password not documented | **CONTRACT GAP** — endpoint exists |
| S-001 | `service:control:changed` vs `service:control_changed` | **CONTRACT GAP** — frontend is correct |
| S-002 | `ride:driver_location` vs `ride:location_updated` | **CONTRACT GAP** — frontend is correct |
| S-003 | Join trip event name and payload shape | **CONTRACT GAP** — frontend is correct |
| S-004 | Waiting charge events not listened to | **SHARED** |
| S-005 | `surge:updated` not listened to | **SHARED** |
| B-001 | SOS endpoint — no UI | **BACKEND COMPLETE, no frontend** |
| B-005 | `POST /promo/validate` not called | **FRONTEND BUG** |
| B-007 | `POST /wallet/topup` not wired | **FRONTEND BUG** |

---

## REST Endpoints — Detailed Verdicts

### F-001 — Ride Request Path
**Frontend calls:** `POST /rides/request`  
**Contract said:** `POST /api/rides`

**Verdict: CONTRACT GAP — frontend is correct.**

The actual backend handler is:
```typescript
router.post("/rides/request", authenticate, requireRole("user"), rideRequestLimiter, ...)
// rides.ts line 368
```

There is **no** `POST /rides` handler anywhere in the codebase. The contract documentation was wrong. The frontend was calling the right path all along. Contract has been corrected to `POST /api/rides/request`.

---

### F-002 — Fare Estimate
**Frontend calls:** `POST /rides/estimate`  
**Contract said:** (undocumented)

**Verdict: CONTRACT GAP — endpoint exists and is production-ready.**

The backend has a fully implemented handler:
```typescript
router.post("/rides/estimate", authenticate, ...)
// rides.ts line 272
```

It accepts `{ vehicleType, pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude }`, applies zone-specific pricing, calculates haversine distance, and applies the live surge multiplier from in-memory state. Response:
```json
{
  "data": {
    "distanceKm": 5.123,
    "estimatedDurationMinutes": 10,
    "estimatedPrice": 45.50,
    "surgeActive": false,
    "surgeMultiplier": 1,
    "pricingSource": "zone:Downtown"
  }
}
```

This endpoint should **stay** in the frontend flow. It is required before `POST /rides/request` (which does not recompute fare — it uses the client-provided `estimatedPrice` for escrow). Contract has been updated to document it.

---

### F-003 — Rate Driver Path
**Frontend calls:** `POST /rides/:id/rate`  
**Contract says:** `POST /api/rides/:id/rate-driver`

**Verdict: FRONTEND BUG.**

The backend handler is strictly at:
```typescript
router.post("/rides/:id/rate-driver", authenticate, requireRole("user"), ...)
// rides.ts line 1558
```

`/rides/:id/rate` is a clean **404**. Express will not match it against the rate-driver handler because the suffix is different. The frontend must change the path from `/rides/:id/rate` to `/rides/:id/rate-driver`.

---

### F-004 — Cancel Ride — HTTP Method
**Frontend calls:** `PATCH /rides/:id/cancel`  
**Contract said:** `POST /api/rides/:id/cancel`

**Verdict: CONTRACT GAP — frontend is correct.**

The actual backend handler uses **PATCH**:
```typescript
router.patch("/rides/:id/cancel", authenticate, requireRole("user"), ...)
// rides.ts line 727
```

A `POST` to this path returns **404**. The contract document incorrectly listed the method as POST. Frontend was right. Contract corrected.

---

### F-005 — User Profile Path
**Frontend calls:** `GET /users/me` and `PATCH /users/me`  
**Contract said:** `GET /api/auth/me` and `PATCH /api/auth/me`

**Verdict: CONTRACT GAP — frontend is calling the canonical (correct) paths.**

`/users/me` is the **preferred** endpoint, explicitly documented in the source:
```typescript
/**
 * GET /users/me is the preferred profile endpoint —
 * use it instead of the deprecated GET /auth/me.
 */
// users.ts lines 1–4
```

`GET /auth/me` and `PATCH /auth/me` exist but are **deprecated aliases**. Both paths work today, but the canonical path is `/users/me`. The original contract documented the deprecated aliases. Contract has been updated to list `/users/me` as primary with `/auth/me` noted as deprecated.

Additionally, two more undocumented endpoints in users.ts were found:
- `POST /users/me/push-token` — registers a device push notification token
- `GET /users/me/bookings` — returns the authenticated user's shuttle bookings (with trip details)

Both are now added to the contract.

---

### F-006 — In-Ride Chat Path and tripId vs rideId
**Frontend calls:** `GET /trips/:id/chat` and `POST /trips/:id/chat`  
**Contract said:** `GET /api/chat/:rideId` and `POST /api/chat/:rideId`

**Verdict: CONTRACT GAP — frontend is calling the correct paths.**

The actual chat routes in `chat.ts`:
```typescript
router.post("/trips/:id/chat", authenticate, ...)   // line 20
router.get("/trips/:id/chat", authenticate, ...)    // line 59
```

There are **no routes** at `/chat/:rideId`. That path returns 404.

**Critical clarification on tripId vs rideId:**

These are **different identifiers for different tables and different services:**

| Identifier | Table | Service |
|-----------|-------|---------|
| `rideId` | `rides` | On-demand rides (taxi/car/bike) |
| `tripId` | `trips` | Shuttle trips (fixed routes) |

**Chat only exists for shuttle trips** — there is no in-ride chat for on-demand rides. If the passenger app has a chat screen on an on-demand ride, that screen should either be removed or the product team needs to decide whether to build that feature. The backend has no `/chat/:rideId` endpoint and none is planned.

---

### F-007 — Cancel Shuttle Booking — HTTP Method
**Frontend calls:** `PATCH /bookings/:id/cancel`  
**Contract said:** `POST /api/bookings/:id/cancel`

**Verdict: CONTRACT GAP — frontend is correct.**

```typescript
router.patch("/bookings/:id/cancel", authenticate, ...)
// bookings.ts line 251
```

It is **PATCH**, not POST. A `POST` to this path is a 404. Contract corrected.

---

### F-008 — `GET /promo` Role Guard
**Frontend calls:** `GET /promo` (should be admin-only per contract)  
**Contract said:** Admin-only; passenger flow should use `POST /promo/validate`

**Verdict: CONTRACT GAP + BACKEND BUG.**

```typescript
router.get("/promo", authenticate, ...)   // NO requireRole("admin")
// promo.ts line 34
```

`GET /promo` has **no role guard**. Any authenticated user — passenger, driver, admin — can call it and receive the full promo code list including `maxUsage`, `usedCount`, `expiryDate`, and internal fields. This is a **backend access control bug**. The contract incorrectly documented it as admin-only.

**Action needed:**
1. **Backend:** Add `requireRole("admin")` to `GET /promo` immediately.
2. **Frontend:** Stop calling `GET /promo` for passenger flow. Use `POST /promo/validate` with the specific code the user typed instead.

---

### F-009 — Forgot Password
**Frontend calls:** `POST /auth/forgot-password`  
**Contract said:** (undocumented — implied not to exist)

**Verdict: CONTRACT GAP — endpoint exists and is fully functional.**

```typescript
router.post("/auth/forgot-password", ...)  // auth.ts line 317
```

Accepts `{ phone: string }`. Generates an 8-character uppercase hex reset token, stores it in `users.passwordResetToken` with a 1-hour expiry, and sends an SMS via the `sendSms` utility. Returns the same success response whether or not the phone is registered (prevents enumeration).

A companion endpoint also exists and was undocumented:

```typescript
router.post("/auth/reset-password", ...)  // auth.ts line 362
```

Accepts `{ phone, token, newPassword }`. Validates the token, resets the password, clears the token and refresh token. **Both endpoints are now documented in the contract.**

---

## Socket.IO Events — Detailed Verdicts

### S-001 — Service Control Event Name
**Frontend listens:** `service:control:changed`  
**Contract said:** `service:control_changed`

**Verdict: CONTRACT GAP — frontend is correct.**

```typescript
SERVICE_CONTROL_CHANGED: "service:control:changed"
// socket-events.ts line 44
```

The server emits `service:control:changed` (all colons). The contract had a mixed-format name with an underscore. Contract corrected.

Similarly: `SERVICE_SETTINGS_CHANGED: "service:settings:changed"` — also uses colons throughout.

---

### S-002 — Driver Location Event Name
**Frontend listens:** `ride:driver_location`  
**Contract said:** `ride:location_updated`

**Verdict: CONTRACT GAP — frontend is correct.**

```typescript
RIDE_DRIVER_LOCATION: "ride:driver_location"
// socket-events.ts line 14
```

The server emits `ride:driver_location`. The name `ride:location_updated` does not exist anywhere in the backend. Contract corrected.

---

### S-003 — Passenger Join Trip Event
**Audit claim:** Frontend emits `passenger:join:trip` (bare number); backend expects `passenger:join_trip` with `{ tripId: number }`

**Verdict: CONTRACT GAP — frontend and backend agree; the audit team's description of backend expectations was incorrect on both counts.**

Actual backend:
```typescript
// Event name defined as:
PASSENGER_JOIN_TRIP: "passenger:join:trip"      // socket-events.ts line 69

// Handler registered as:
socket.on(SOCKET_EVENTS.PASSENGER_JOIN_TRIP, (tripId: number) => {  // socket.ts line 349
```

- Event name: `passenger:join:trip` with colons — **matches what frontend emits.**
- Payload: bare `number` — **matches what frontend sends.**

No fix needed on either side. The audit finding was based on incorrect assumptions about the backend. The only gap was that the contract did not document client→server events clearly.

---

### S-004 — Waiting Charge Events
**Frontend:** not listening to `ride:free_window_ended` or `ride:waiting_charge_updated`

**Verdict: SHARED — frontend is missing listeners AND all three event names in the contract were wrong.**

The actual event names emitted by the waiting timer:

| Constant | Actual event string emitted |
|----------|---------------------------|
| `WAITING_CHARGE_STARTED` | **`ride:waiting:charge:started`** |
| `WAITING_CHARGE_UPDATED` | **`ride:waiting:charge:updated`** |
| `WAITING_CHARGE_CAPPED` | **`ride:waiting:charge:capped`** |

None of these match the names `ride:free_window_ended` or `ride:waiting_charge_updated` referenced in the audit. The contract also had wrong names (`ride:free_window_ended`, `ride:waiting_charge_updated`, `ride:waiting_charge_capped`).

**These events are live and emitting today.** Every passenger whose driver has been waiting for more than 3 minutes is being charged per minute with **zero UI feedback**. This is the most urgent UX gap in this audit.

**Frontend action required — listen for:**
- `ride:waiting:charge:started` → show "Free waiting period ended, charges now applying at X EGP/min"
- `ride:waiting:charge:updated` → update a running charge counter in the UI
- `ride:waiting:charge:capped` → show "Maximum waiting charge (20 EGP) reached"

---

### S-005 — Surge Pricing Event
**Frontend:** not listening to `surge:update`  
**Contract said:** `surge:update`

**Verdict: SHARED — event name in contract was wrong AND frontend isn't listening.**

```typescript
SURGE_UPDATED: "surge:updated"   // socket-events.ts line 41
```

The event is `surge:updated` (with a `d`), not `surge:update`. The surge pricing background job is **live** and emits this every 5 minutes. Passengers requesting rides during surge see the multiplied price only if they call `POST /rides/estimate` first — but if the surge level changes while they're on a screen, they have no way to know.

**Frontend action required:** Listen to `surge:updated`; update the vehicle selection screen's price estimates when a surge change arrives.

---

## Backend-Only Coverage Gaps

### B-001 — `POST /rides/:id/sos`
**Verdict: BACKEND COMPLETE — no frontend UI.**

The SOS endpoint is fully implemented:
- Validates that the caller is the passenger or assigned driver
- Ride must be in `driver_arrived` or `in_progress` status  
- Inserts a `sos_events` row with location, role, notes, and timestamp
- Emits `sos:triggered` to `admin:room` immediately

**An emergency safety feature with no activation UI is a liability, not just a gap.** Recommend adding an SOS button to the active ride screen as the highest-priority UI addition.

---

### B-005 — `POST /promo/validate`
**Verdict: FRONTEND BUG.**

`POST /promo/validate` is implemented and accepts `{ code: string }`. It returns promo details including the discount type and value. The frontend should call this when the user types a promo code during checkout — instead it is incorrectly calling `GET /promo` (the admin listing endpoint). Fix: replace the `GET /promo` call with `POST /promo/validate`.

---

### B-007 — `POST /wallet/topup`
**Verdict: FRONTEND BUG — backend is complete.**

The topup endpoint is fully implemented:
- Validates `amount` (positive number)
- Atomically updates `users.walletBalance`
- Inserts a `wallet_transactions` record with type `"deposit"`
- Returns `{ transaction: {...}, balance: number }`

The frontend has a top-up button that isn't connected. This needs to be wired up.

---

## Additional Undocumented Endpoints Found During This Audit

These exist in the backend but were absent from the original contract. All have been added to the updated `BACKEND_API_CONTRACT.md`:

| Endpoint | File | Notes |
|----------|------|-------|
| `POST /api/rides/estimate` | rides.ts:272 | Fare estimate with zone + surge pricing |
| `POST /api/rides/request` | rides.ts:368 | Actual ride request (contract had wrong path) |
| `GET /api/rides/my` | rides.ts:639 | Passenger's own rides (query by status/type) |
| `POST /api/auth/forgot-password` | auth.ts:317 | Phone-based password reset initiation |
| `POST /api/auth/reset-password` | auth.ts:362 | Confirm reset token + set new password |
| `GET /api/users/me` | users.ts:19 | **Canonical** profile endpoint (replaces `/auth/me`) |
| `PATCH /api/users/me` | users.ts:26 | **Canonical** profile update |
| `POST /api/users/me/push-token` | users.ts:42 | Register device push token |
| `GET /api/users/me/bookings` | users.ts:54 | Current user's shuttle bookings |
| `GET /api/admin/rides/pricing` | rides.ts:99 | List ride pricing tiers |
| `PATCH /api/admin/rides/pricing/:vehicleType` | rides.ts:116 | Update pricing for a vehicle type |
| `POST /api/admin/wallet/refund` | wallet.ts:132 | Admin issues a wallet refund |

---

## Contract Event Name Corrections Summary

All Socket.IO event names have been corrected in `BACKEND_API_CONTRACT.md`:

| Category | Wrong name (was in contract) | Correct name (from socket-events.ts) |
|----------|------------------------------|--------------------------------------|
| Service control changed | `service:control_changed` | `service:control:changed` |
| Service settings changed | `service:settings_changed` | `service:settings:changed` |
| Driver location | `ride:location_updated` | `ride:driver_location` |
| Waiting started | `ride:free_window_ended` | `ride:waiting:charge:started` |
| Waiting tick | `ride:waiting_charge_updated` | `ride:waiting:charge:updated` |
| Waiting capped | `ride:waiting_charge_capped` | `ride:waiting:charge:capped` |
| Surge update | `surge:update` | `surge:updated` |
| Driver check-in required | `driver:checkin_required` | `driver:checkin:required` |
| Driver check-in rejected | `driver:checkin_rejected` | `driver:checkin:rejected` |
| Route deviation | `ride:deviation_warning` | `ride:deviation:warning` |

---

## Priority Action List

### Immediate (before next release)
1. **Backend:** Add `requireRole("admin")` to `GET /promo` (F-008 — open to all authenticated users today)
2. **Frontend:** Fix rate-driver path: `/rides/:id/rate` → `/rides/:id/rate-driver` (F-003)
3. **Frontend:** Fix ride request path: `POST /rides` → `POST /rides/request` (F-001, if not already correct)
4. **Frontend:** Implement `ride:waiting:charge:started`, `ride:waiting:charge:updated`, `ride:waiting:charge:capped` listeners — passengers are being charged silently right now (S-004)

### High priority
5. **Frontend:** Replace `GET /promo` with `POST /promo/validate` in the promo code flow (B-005, F-008)
6. **Frontend:** Wire up `POST /wallet/topup` to the existing top-up button (B-007)
7. **Frontend:** Listen to `surge:updated` to refresh displayed fares when surge changes (S-005)
8. **Frontend:** Add SOS button to the active ride screen (B-001)

### Normal priority
9. **Frontend:** Switch profile calls to `/users/me` (canonical) away from `/auth/me` (deprecated, still works) (F-005)
10. **Frontend:** Implement password reset UI using `POST /auth/forgot-password` + `POST /auth/reset-password` (F-009)
