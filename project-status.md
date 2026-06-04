# Project Status Report
**Generated:** 2026-06-04  
**Stack:** Node.js · Express · PostgreSQL · Socket.io · Drizzle ORM  
**Scope:** On-demand ride-hailing backend + shuttle/trip system

---

## Table of Contents
1. [Ride Flow](#1-ride-flow)
2. [Dispatch System](#2-dispatch-system)
3. [Wallet & Payments](#3-wallet--payments)
4. [Driver Earnings](#4-driver-earnings)
5. [Ratings](#5-ratings)
6. [Promo Codes](#6-promo-codes)
7. [Cancellation Flows](#7-cancellation-flows)
8. [WebSocket Events](#8-websocket-events)
9. [Authentication & Authorization](#9-authentication--authorization)
10. [Zone Pricing & Surge](#10-zone-pricing--surge)
11. [Summary Matrix](#11-summary-matrix)

---

## 1. Ride Flow

### ✅ Fully Implemented

| Status Transition | Endpoint | Guards |
|---|---|---|
| `searching` | `POST /rides/request` | Auth, rate limit (3/2 min), wallet balance check, duplicate guard (409) |
| `driver_assigned` | `PATCH /driver/rides/:id/accept` | Driver role, race-condition safe (DB-level CAS) |
| `driver_arrived` | `PATCH /driver/rides/:id/arrived` | Driver role, ownership check |
| `active` | `PATCH /driver/rides/:id/start` | Driver role, ownership check |
| `completed` | `PATCH /driver/rides/:id/complete` | Driver role, ownership check |
| `searching` (reset) | `PATCH /driver/rides/:id/cancel` | Driver role, triggers re-dispatch |
| `cancelled` (user) | `PATCH /rides/:id/cancel` | User role, full escrow refund |

Every transition logs a corresponding record in `ride_events` (audit trail). Fields set at each stage — `driverAssignedAt`, `driverArrivedAt`, `startedAt`, `completedAt`, `finalPrice` — are populated correctly.

### ⚠️ Partial / Bugs

- **`requested` status orphan:** The passenger cancel endpoint allows cancelling rides with status `requested`, but ride creation immediately sets status to `searching`. The `requested` value appears in the cancel guard but cannot be reached in practice — it is dead code that could confuse future developers or cause issues if the initial status is ever changed.
- **Deprecated `POST` aliases:** `POST /driver/rides/:id/complete` and `POST /driver/rides/:id/start` remain active. The `complete` alias had a double-deduction bug (fixed), but keeping two live handlers for the same action is a future maintenance risk.
- **`finalPrice` always equals `estimatedPrice`:** The price is locked at request time, which is correct for the escrow model, but means dynamic pricing adjustments (e.g., actual distance deviation) are not possible. There is no mechanism to handle significant route changes.
- **`active` ride cannot be driver-cancelled:** Once a driver starts the ride (status `active`), there is no supported cancellation path for either party. The passenger cancel only allows `requested`, `searching`, or `driver_assigned`.

### ❌ Missing

- No support for ride status `active` → passenger-initiated emergency cancel.
- No `GET /rides/:id` for passengers to poll current ride state (only admin can query individual rides).
- No estimated time of arrival (ETA) update pushed during the ride.
- `perMinuteRate` field exists in `ridePricingTable` but is not used anywhere in fare calculation.

---

## 2. Dispatch System

### ✅ Fully Implemented

- **Multi-round batching:** Up to 3 drivers per round, 15-second round timeout, Haversine SQL distance filtering within 5 km.
- **Driver eligibility:** `isOnline = true`, `status = 'online'`, matching `vehicleType`, location not stale (> 10 min old).
- **Exhaustion fallback:** When all nearby drivers have been notified and none accepted, `notifiedIds` resets to `[]` and the cycle restarts from the full driver pool.
- **`onAccepted`:** Cancels the round timer, marks dispatch state `completed`, emits `ride:no_longer_available` to all other drivers in the current round.
- **`onCancelled`:** Cancels timer, marks dispatch state `cancelled`, notifies current-round drivers.
- **`restartDispatch`:** Upserts dispatch state back to `active` (round 1, empty `notifiedIds`) after a driver cancels an accepted ride — implemented as an atomic upsert on the unique `rideId` constraint.
- **Startup recovery:** `recoverActiveDispatches` re-arms timers on server restart, accounting for elapsed time.

### ⚠️ Partial / Bugs

- **Infinite cycle for persistent decliner:** A driver who is online but repeatedly ignores offers will be included again after each exhaustion reset. There is no per-driver decline counter or cooldown — declined rides re-enter the same pool on the next cycle.
- **No maximum cycle count:** The exhaustion-restart cycle can repeat indefinitely. The only exit is the separate `ride-timeout.ts` job (5-minute poll), which cancels `searching` rides past the timeout window. There is a gap: a ride could theoretically cycle for up to 5 minutes while the dispatch manager never calls `cancelRideNoDrivers` on its own.
- **Socket room inconsistency:** `dispatch-manager.ts` uses `SOCKET_ROOMS.DRIVER(userId)` consistently; however, several handlers in `rides.ts` and `ride-timeout.ts` use raw strings (e.g., `` `passenger:${id}` ``). If the room naming convention ever changes, those will silently break.

### ❌ Missing

- No per-driver blacklist (declined-ride tracking across cycles).
- No maximum round/cycle cap independent of the timeout job.
- No admin visibility into live dispatch state (no endpoint to query `ride_dispatch_state` for a given ride).

---

## 3. Wallet & Payments

### ✅ Fully Implemented

- **Escrow model:** `estimatedPrice` is deducted from `walletBalance` atomically at ride request. The payment is recorded as a `wallet_transactions` entry of type `payment` (description: "payment held").
- **Refunds:** All cancellation paths (passenger cancel, timeout, no-drivers) refund the exact escrowed amount back to `walletBalance` and log a `refund` transaction.
- **Settlement:** On completion, a `payments` table record is inserted as a settlement confirmation. No second deduction occurs.
- **Driver escrow hold during re-dispatch:** When a driver cancels an accepted ride, escrow remains intact for the new driver — no refund, no deduction.
- **Wallet endpoints (passenger):** `GET /wallet`, `GET /wallet/transactions`, `POST /wallet/topup`.
- **Driver wallet endpoints:** `GET /driver/wallet/balance` (confirmed/paid/pending split), `POST /driver/earnings/payout`.
- **Admin endpoints:** `GET /admin/wallet/transactions`, `POST /admin/wallet/refund`, `GET /admin/payments`.
- **Transaction integrity:** All balance mutations are inside `db.transaction` blocks, preventing partial-failure corruption.

### ⚠️ Partial / Bugs

- **Cash and Card stubs:** `payment_method` enum supports `cash` and `card`, but the ride request flow enforces a wallet-balance check and always deducts from the wallet. Card/Cash paths have no logic beyond the enum definition.
- **`POST /wallet/topup` is simulated:** There is no real payment gateway integration. Admins or the system can credit balances, but there is no Stripe/payment-provider checkout flow.
- **No partial refund:** If `finalPrice` ever diverges from `estimatedPrice` (a future requirement), there is no mechanism to refund or charge the delta.
- **No idempotency key:** The topup endpoint has no deduplication mechanism; a network retry could double-credit a user's balance.

### ❌ Missing

- Real payment gateway integration for wallet top-ups.
- Card-on-file / card-at-ride payment path.
- Promo code discount applied to ride price (see §6).
- Cancellation fee logic (e.g., charge passenger if they cancel after driver has arrived).

---

## 4. Driver Earnings

### ✅ Fully Implemented

- **Insertion on completion:** Both `PATCH /driver/rides/:id/complete` (primary) and its deprecated `POST` alias correctly insert into `driver_earnings` with `status: 'confirmed'` inside the completion transaction.
- **Commission from settings:** Rate is read from `settingsTable` key `driver_commission_rate`, defaulting to `0.15` if absent.
- **Existing endpoints:**
  - `GET /driver/earnings` — summary (`totalEarned`, `tripCount`, last 10 records)
  - `GET /driver/earnings/history` — paginated full history
  - `GET /driver/wallet/balance` — confirmed / paid / pending split
  - `GET /earnings/summary` — dual-role (driver gets personal summary; admin gets global totals + top 10 earners)
  - `PATCH /earnings/:id/status` (admin) — transitions `confirmed` → `paid`

### ⚠️ Partial / Bugs

- **Commission semantics are inverted:** The code calculates `driverCut = finalPrice * commissionRate`. If `commissionRate` is `0.15`, the driver receives only 15% of the fare — the platform takes 85%. Industry convention is that commission is the platform's cut and the driver receives `finalPrice * (1 - commissionRate)`. This is either a critical logic bug or a non-standard naming choice that needs explicit documentation.
- **No `rideId` on `driver_earnings`:** The table has a `trip_id` column (for shuttle trips) but no `ride_id` column. Earnings from on-demand rides have no foreign key back to the `rides` table, making reconciliation and auditing difficult.
- **Manual payouts only:** There is no automated payout integration (Stripe Connect, bank transfer, etc.). Status transitions are manual admin operations.
- **Duplicate summary implementations:** `GET /driver/earnings` and `GET /earnings/summary` (driver role) both return similar summary data with slightly different field structures, creating potential for client-side confusion.

### ❌ Missing

- `rideId` column on `driver_earnings` for ride-based earnings traceability.
- Automated payout trigger/integration.
- Earnings breakdown by vehicle type or time period in driver-facing endpoints.
- Driver cancel penalty / earnings deduction when a driver cancels an accepted ride.

---

## 5. Ratings

### ✅ Fully Implemented

- **Schema:** `ratings` table supports `context` enum (`trip`/`ride`), `score` (1–5 check constraint), `comment`, `rideId` (nullable), `tripId` (nullable), and a unique index preventing duplicate ratings per rater+ride.
- **Passenger rates driver (on-demand rides):** `POST /rides/:id/rate` — validates ride is `completed`, checks `ride_events` for prior `DRIVER_RATED` event to prevent duplicates, inserts event, enqueues background job, and immediately recalculates + updates `drivers.rating`.
- **Admin endpoints:** `GET /admin/ratings` (filterable list), `GET /admin/ratings/stats` (global average + score distribution), `DELETE /admin/ratings/:id`.
- **Driver and user views:** `GET /driver/me/ratings`, `GET /user/ratings/given`.

### ⚠️ Partial / Bugs

- **Critical aggregation split:** Ratings are stored redundantly in three places: `ride_events` (for average calculation), `ratings` table (via job queue, for display), and `drivers.rating` (aggregated float). The average is computed from `ride_events`, but admin deletion targets `ratings` table records. Deleting a rating via `DELETE /admin/ratings/:id` does **not** recompute the driver's average — the displayed average will diverge from the actual record set.
- **`GET /driver/me/ratings` vs `drivers.rating` mismatch:** The rating list reads from `ratingsTable`, but the displayed average comes from `drivers.rating` (sourced from `ride_events`). After an admin deletion these will show different values.
- **Job queue for rating insertion:** The `jobQueue` processes the `ratingsTable` insert asynchronously. If the job queue fails or is restarted, ratings can be in `ride_events` but missing from `ratingsTable`.

### ❌ Missing

- **Shuttle trip ratings:** No endpoint exists for passengers to rate drivers after a shuttle trip. `ratingsTable` has `context: 'trip'` and `tripId` column, but the trigger endpoint and job queue handler for this context are never called.
- **Driver rates passenger:** No endpoint, no schema support (`users` table has no `rating` field). The `ratingsTable` schema only stores `driverId` as the subject of the rating.
- **Rating after driver cancel + re-dispatch:** If a driver cancels and a new driver completes the ride, the original driver who cancelled could still theoretically be linked to the completed ride — there is no guard preventing this.

---

## 6. Promo Codes

### ✅ Fully Implemented

- **Schema:** `promo_codes` table with `code` (unique), `discountType` (`percentage`/`fixed`), `discountValue`, `expiryDate`, `maxUsage`, `usedCount`, `isActive`.
- **Validation endpoint:** `POST /promo/validate` — checks existence, active status, expiry, and usage cap.
- **Shuttle booking integration:** Promos are applied in `POST /bookings` within a DB transaction. Percentage and fixed discounts are both handled. `usedCount` is incremented atomically.
- **Admin CRUD:** Create, list, update, delete promo codes.

### ⚠️ Partial / Bugs

- **Race condition on `usedCount`:** In `bookings.ts`, the increment is `promo.usedCount + 1` using a previously-fetched value (no `SELECT FOR UPDATE`). Under high concurrency, `maxUsage` can be exceeded.
- **Promo usage not reversed on cancellation:** If a booking is cancelled after a promo is applied, `usedCount` is not decremented. The promo slot is permanently consumed even though the discount was reversed via refund.
- **No per-user redemption limit:** A single user can redeem the same promo code multiple times until the global `maxUsage` is hit.

### ❌ Missing

- **Promo codes entirely absent from on-demand rides:** `POST /rides/request` and `POST /rides/estimate` have no `promoCode` field. The entire ride-hailing side of the platform has no discount mechanism.
- `min_order_value` constraint (prevent applying a 100-unit discount to a 10-unit ride).
- `GET /promo/my-available` — no endpoint for users to discover applicable promos.
- Per-user redemption tracking table.

---

## 7. Cancellation Flows

### ✅ Fully Implemented

| Flow | Refund | Ride Status | Socket (Passenger) | Socket (Driver) |
|---|---|---|---|---|
| **Passenger cancels** | Full escrow refund | `cancelled` | HTTP response | `ride:cancelled` |
| **Driver cancels (accepted)** | None (escrow held) | Reset to `searching` | `ride:driver_cancelled` | HTTP response |
| **Timeout job** | Full escrow refund | `cancelled` | `ride:status_update` | None |
| **No drivers found** | Full escrow refund | `cancelled` | `ride:status_update` | None |

All flows insert a `ride_events` record. All refund flows update `walletBalance` and insert a `wallet_transactions` record of type `refund`.

### ⚠️ Partial / Bugs

- **Timeout job polls every 60 seconds:** A ride that times out between polls can remain in `searching` status for up to 60 seconds past the configured timeout window before being cancelled. The dispatch cycle continues trying drivers during this window.
- **No cancellation fee:** The passenger can cancel at any point, including after a driver has arrived (`driver_arrived`), with a full refund. No penalty or cancellation fee is applied.
- **`active` rides have no cancellation path:** Once a ride is started, neither passenger nor driver can cancel via API. If either party abandons the ride, it will remain `active` indefinitely until the timeout job catches it (which only targets `searching` status) — meaning `active` rides are **never** auto-cancelled.
- **`dispatchManager.onCancelled` called conditionally:** Passenger cancel calls `onCancelled` only if the ride was in `searching` status. If cancelled during `driver_assigned`, it also calls `onCancelled` — but the dispatch state was already set to `completed` by `onAccepted`. This is handled gracefully (no crash), but emits a `ride:no_longer_available` notification attempt against an already-completed dispatch state.

### ❌ Missing

- Auto-cancellation for rides stuck in `active` status (driver or passenger abandonment).
- Cancellation fee / partial-charge logic for late-stage passenger cancellations.
- Driver cancel penalty system (strike tracking, temporary suspension after N cancellations).
- Admin-initiated force-cancel with configurable refund amount.

---

## 8. WebSocket Events

### ✅ Fully Implemented

- **Auth middleware:** JWT extracted from `socket.handshake.auth.token`; `userId` and `role` attached to `socket.data`. Unauthenticated connections are rejected.
- **Automatic room assignment on connect:**
  - `admin` → `admin:room`
  - `user` → `passenger:{userId}`
  - `driver` → `driver:{userId}` + `drivers:available:{vehicleType}` (if online)
- **Centralized constants:** `SOCKET_EVENTS` and `SOCKET_ROOMS` defined in `socket-events.ts`.
- **All critical ride lifecycle events emitted:**

| Event | Direction | Trigger |
|---|---|---|
| `ride:offer` | Server → Driver | Dispatch round start |
| `ride:offer_expired` | Server → Driver | Round timeout |
| `ride:no_longer_available` | Server → Driver | Another driver accepted |
| `ride:driver_assigned` | Server → Passenger | Driver accepts |
| `ride:driver_arrived` | Server → Passenger | Driver marks arrived |
| `ride:started` | Server → Passenger | Ride starts |
| `ride:completed` | Server → Passenger | Ride completed |
| `ride:cancelled` | Server → Driver | Passenger cancels |
| `ride:driver_cancelled` | Server → Passenger | Driver cancels accepted ride |
| `ride:status_update` | Server → Passenger | Timeout / no-drivers |
| `ride:driver_location` | Server → Passenger | Driver location update during ride |
| `service:control:changed` | Server → All | Admin toggles service |

### ⚠️ Partial / Bugs

- **Raw string inconsistency:** The `SOCKET_EVENTS` constants exist but many emission sites in `rides.ts` and `ride-timeout.ts` use raw strings (e.g., `"ride:completed"`, `"ride:driver_assigned"`). If a constant is renamed, raw-string usages will silently break.
- **Room naming raw strings:** `ride-timeout.ts` and `notifications.ts` hardcode room strings (`` `passenger:${id}` ``) instead of using `SOCKET_ROOMS.PASSENGER(id)`.
- **Duplicate events on driver arrival:** Both `ride:driver_arrived` and `ride:arrived` are emitted to the passenger at the same time in the arrived handler, which may cause double UI notifications on the client.
- **`ride:completed` payload redundancy:** The completion event sends `{ rideId, finalPrice, fare: finalPrice }` — `finalPrice` and `fare` are identical. Inconsistent with other event payload shapes.
- **No passenger-side `ride:searching` event:** When a ride is first created, no socket event is emitted to confirm the passenger that dispatch has started. The client must rely on the HTTP response alone.

### ❌ Missing

- `ride:accepted` / `ride:searching` emitted to passenger at the moment of ride creation confirmation.
- Standardized error event payloads (a generic `"error"` event is emitted without error codes).
- Driver ETA push events during transit.
- Socket event for admin when a new ride request is created (admin real-time ride feed).

---

## 9. Authentication & Authorization

### ✅ Fully Implemented

- **JWT flow:** 15-minute access tokens + 30-day refresh tokens. Refresh tokens are stored in the DB (`users.refresh_token`) and rotated on every use. Revocation works by clearing the DB column.
- **Middleware:** `authenticate` validates Bearer token, fetches user, checks `isBlocked`, populates `req.user`. `requireRole` enforces role guards. `requirePermission` supports staff-level granular permissions.
- **RBAC:** `user`, `driver`, `admin` roles. Admin users with a `staffRoleId` get scoped permissions; admins without a `staffRoleId` are treated as super-admins.
- **Driver auth:** Separate `POST /driver/auth/login` and `POST /driver/auth/register`. Driver logout sets `status: 'offline'` and `isOnline: false`.
- **OTP system:** 6-digit codes for phone verification, 10-minute expiry.
- **Password reset:** 8-character hex token via SMS, 1-hour expiry.
- **Rate limiting:** `authLimiter` (20 req / 15 min) on all auth routes. `apiLimiter` (200 req / 15 min) on all other API routes.
- **Security headers:** `helmet` and CORS with an explicit allowlist.

### ⚠️ Partial / Bugs

- **Single-secret derivation:** Access token secret is `SESSION_SECRET`; refresh token secret is `SESSION_SECRET + "-refresh"`. Both are derived from one base secret — a compromise of `SESSION_SECRET` compromises both tokens.
- **No refresh token reuse detection:** Token rotation is implemented (old token invalidated on use), but if an attacker steals and uses a refresh token before the legitimate user does, there is no mechanism to detect the replay and invalidate all sessions for that user.
- **Bcrypt round inconsistency:** User and staff registration uses 12 bcrypt rounds; driver registration uses 10 rounds.
- **Hardcoded permission list:** Valid staff permission strings are hardcoded in `staff.ts` rather than defined in a shared constant or DB table.
- **Audit log gaps:** The `audit_logs` table and route exist, but failed login attempts and auth events are only written to application logs (pino), not persisted to the audit table.

### ❌ Missing

- Refresh token reuse detection (invalidate all sessions on suspicious reuse).
- Persistent audit logging of auth events (login success/failure, password reset, token revocation).
- Account lockout after N consecutive failed login attempts.
- Two-factor authentication for admin accounts.

---

## 10. Zone Pricing & Surge

### ✅ Fully Implemented

- **Zone schema:** `zones` table (circular zone: `centerLat`, `centerLng`, `radiusKm`) + `zone_pricing` table (per `vehicleType` rates: `baseFare`, `perKmRate`, `minimumFare`).
- **Fallback:** If no zone matches the pickup, global `ride_pricing` table is used.
- **Haversine matching:** Distance from pickup to zone center calculated in-memory; first match within `radiusKm` is selected.
- **Surge pricing:** `surge_enabled` and `surge_multiplier` read from `settingsTable`. Applied after base calculation: `price = max(minimumFare, baseFare + distanceKm * perKmRate) * surgeMultiplier`.
- **Price locked at request time:** `estimatedPrice` is persisted on ride creation and not recalculated at completion, ensuring escrow consistency.
- **Admin controls:** Zones and zone pricing are fully CRUD-managed via admin routes.

### ⚠️ Partial / Bugs

- **Surge is globally applied:** The `settings` record for surge includes an `activeZoneIds` array in the admin schema type, but the ride request logic ignores this field and applies surge to all rides uniformly when `surge_enabled = true`.
- **Zone overlap — first match wins:** If a pickup falls within two overlapping zones, the zone returned first by the DB query (ordered by `zones.name` alphabetically) wins. No priority system exists (e.g., smallest radius, highest price).
- **`services` array not enforced in pricing:** `zonesTable` has a `services` column (`['car', 'bike', 'shuttle']`), but zone pricing matching filters only on `zonePricingTable.vehicleType`. A zone could be effectively disabled for a service type via `services` but still return a price if a `zone_pricing` row exists.
- **`perMinuteRate` unused:** The global `ride_pricing` table includes `perMinuteRate`, but `calcPrice()` only uses `baseFare`, `perKmRate`, and `minimumFare`. Time-based pricing is unimplemented.
- **Minimum fare applied before surge:** `minimumFare` floor is applied before the surge multiplier, meaning surge does not lift rides above the minimum — a sub-minimum-fare short ride gets the minimum fare even during surge.

### ❌ Missing

- Per-zone surge multipliers (zone-aware surge).
- Dropoff-based pricing (current model prices on pickup location only).
- `perMinuteRate` integration into fare calculation.
- Zone priority/conflict resolution rules.

---

## 11. Summary Matrix

| Area | Status | Critical Issues |
|---|---|---|
| **Ride Flow** | ✅ Mostly complete | No `active` cancel path; `perMinuteRate` unused |
| **Dispatch System** | ✅ Fully functional | No max cycle cap; declined drivers re-enter pool |
| **Wallet & Payments** | ✅ Solid escrow model | Cash/Card stubs only; no real top-up gateway |
| **Driver Earnings** | ⚠️ Works but has bugs | Commission rate likely inverted (driver gets 15%, not 85%); no `rideId` FK |
| **Ratings** | ⚠️ Partial | Aggregation uses `ride_events`, admin delete targets `ratingsTable` — averages can diverge; no shuttle ratings; no driver→passenger ratings |
| **Promo Codes** | ⚠️ Shuttle-only | Entirely absent from on-demand ride flow; race condition on `usedCount` |
| **Cancellation Flows** | ✅ Mostly complete | `active` rides never auto-cancelled; no cancellation fee; no driver penalty |
| **WebSocket Events** | ✅ Comprehensive coverage | Raw string / constant inconsistency; duplicate `driver_arrived` events |
| **Authentication** | ✅ Production-grade | Single-secret derivation; no reuse detection; bcrypt round inconsistency |
| **Zone / Surge Pricing** | ⚠️ Core works | Surge zone-scoping ignored; `perMinuteRate` unused; overlap resolution is arbitrary |

---

### Priority Fix List

**Critical (data integrity / money)**
1. `driver_earnings` commission rate semantics — verify whether `commissionRate` is the platform cut or the driver payout rate and fix accordingly.
2. Rating aggregation split — admin delete of a `ratingsTable` record should recompute `drivers.rating` from the same source.
3. Promo `usedCount` race condition — add `SELECT FOR UPDATE` or use `SET usedCount = usedCount + 1 WHERE usedCount < maxUsage`.

**High (user-facing gaps)**
4. Promo codes for on-demand rides — add `promoCode` field to `POST /rides/request`.
5. `active` ride auto-cancellation — extend the timeout job to cover `active` status.
6. Surge zone-scoping — honour `activeZoneIds` when applying the surge multiplier.

**Medium (completeness)**
7. Shuttle trip ratings endpoint.
8. Driver cancel penalty / strike system.
9. `rideId` FK on `driver_earnings`.
10. Refresh token reuse detection.

**Low (housekeeping)**
11. Replace raw socket event strings with `SOCKET_EVENTS` constants throughout `rides.ts` and `ride-timeout.ts`.
12. Remove or formally deprecate `POST /driver/rides/:id/complete`.
13. Resolve duplicate `ride:driver_arrived` + `ride:arrived` event emission.
14. Normalise bcrypt rounds (10 vs 12) across user and driver registration.
