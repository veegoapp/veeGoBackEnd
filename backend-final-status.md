# VeeGo Backend — Final Comprehensive Status Report

**Generated:** 2026-06-05  
**Stack:** Node.js · Express 5 · PostgreSQL · Drizzle ORM · Socket.IO · TypeScript (pnpm monorepo)  
**Target Market:** Egypt (Cairo default coordinates)

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Complete | Fully implemented and production-ready |
| ⚠️ Partial | Core logic exists but has known gaps |
| ❌ Missing | Not implemented |

---

## 1. Ride Flow

**Overall: ✅ Complete**

### State Machine
Rides progress through a well-defined status lifecycle:

```
searching → driver_assigned → driver_arrived → active → completed
                                                       ↘ cancelled (any stage)
```

### What's Complete
- **Ride request** (`POST /rides/request`): validates input, checks for existing active rides, calculates pricing (base + per-km via `haversineKm`/`calcPrice`), validates promo codes, checks wallet balance, escrows fare, and kicks off dispatch.
- **Dispatch engine** (`dispatch-manager.ts`): composite driver scoring (50% distance, 30% rating, 20% acceptance rate), dynamic radius expansion in steps (5 km → 8 km → 12 km), batched offers in 15-second rounds, cooldown system (3 consecutive ignores = 10-minute cooldown).
- **Driver accept** (`PATCH /driver/rides/:id/accept`): transitions to `driver_assigned`, marks driver `busy`, stops dispatch timer.
- **Driver arrived** (`PATCH /driver/rides/:id/arrived`): transitions to `driver_arrived`, starts waiting charge timer.
- **Ride start** (`PATCH /driver/rides/:id/start`): transitions to `active`, locks waiting charge accumulation.
- **Ride complete** (`PATCH /driver/rides/:id/complete`): computes final fare (base + waiting charge), handles commission split, credits driver earnings, releases driver.
- **Passenger cancel** (`PATCH /rides/:id/cancel`): applies correct fee (flat if driver arrived, waiting charge if applicable), refunds escrow minus fees.
- **Driver cancel** (`PATCH /driver/rides/:id/cancel`): unassigns driver, auto-triggers re-dispatch.
- **Dispatch recovery** (`recoverActiveDispatches`): re-hydrates in-progress dispatches on server restart.

### What's Partial / Missing
- ⚠️ **No automatic ride completion** — if a driver forgets to tap "Complete", the ride stays `active` indefinitely. No timeout/auto-complete fallback.
- ❌ **Multi-stop rides** — only single pickup/dropoff supported.
- ❌ **Scheduled/future rides** — entirely on-demand; no booking-ahead flow.
- ⚠️ **Partial payment failure recovery** — `complete` endpoint is transactional but complex rollback scenarios (e.g., earnings insert succeeds, wallet debit fails) are minimally handled.

---

## 2. Dispatch

**Overall: ✅ Complete**

### What's Complete
- Multi-round driver search with configurable `batchSize` and `radiusSteps`.
- Driver scoring algorithm with distance, rating, and acceptance rate weights.
- Per-driver offer timeout (15 s per round) tracked via in-memory timers with DB persistence fallback.
- Penalty applied to drivers recently offered the same ride (prevents re-offering too quickly).
- Configurable via admin settings (`dispatch_batch_size`, `dispatch_radius_steps`, `dispatch_peak_windows`).
- Admin endpoint to view queue state and flush stuck dispatches (`/admin/dispatch/status`, `/admin/dispatch/:rideId/flush`).

### What's Partial / Missing
- ⚠️ **No true "no drivers available" notification to passenger** — dispatch fails silently after all rounds; passenger must poll or wait for a push notification.
- ❌ **Driver preference/type matching beyond vehicle type** — e.g., no female-driver-preferred flag.

---

## 3. Wallet

**Overall: ✅ Complete**

### What's Complete
- Balance stored as `numeric(12, 2)` in `users.wallet_balance`.
- **Top-up** (`POST /wallet/topup`): increments balance, inserts `deposit` record in `wallet_transactions`.
- **Payment deduction**: atomic `FOR UPDATE` lock on user row at ride request and shuttle booking to prevent double-spend.
- **Escrow model**: fare held at ride request, settled (or refunded) at completion/cancellation.
- **Refunds**: admin manual refund (`POST /admin/wallet/refund`) and automatic on cancellation.
- Transaction history with types: `deposit`, `payment`, `refund`.

### What's Partial / Missing
- ❌ **External payment gateway integration** (Stripe, Fawry, Vodafone Cash etc.) — top-up is currently admin-only; no self-service top-up via payment provider.
- ❌ **Withdrawal for drivers** — no flow to move earnings out to a bank account or mobile wallet.

---

## 4. Driver Earnings

**Overall: ⚠️ Partial**

### What's Complete
- Commission calculated at ride completion: `driverEarning = finalPrice × (1 − commissionRate)`, where `commissionRate` defaults to 15% but is configurable via settings.
- Cancellation fees credited to driver if they had already arrived.
- Earnings stored in `driver_earnings` table with `confirmed` status.
- Admin can manually mark earnings as `paid` (`PATCH /admin/earnings/:id`).
- `GET /driver/earnings` lets drivers view their history.

### What's Partial / Missing
- ❌ **Shuttle/trip earnings** — no equivalent earning calculation when a driver completes a shuttle `trip` via bookings; earnings logic is ride-centric only.
- ❌ **Automated payout** — no logic to aggregate `confirmed` earnings and transfer to a driver's wallet balance or external account; purely manual admin action.
- ⚠️ **Earning adjustments** — no mechanism for admin to adjust or dispute an earning record (only status update).

---

## 5. Ratings

**Overall: ✅ Complete**

### What's Complete
- **Submission** (`POST /rides/:id/rate`): validates ride is completed, validates caller is the passenger, records a `DRIVER_RATED` event in `ride_events`, enqueues a `rating` job via `jobQueue`.
- **Average recalculation**: on every new rating, all `DRIVER_RATED` events for the driver are fetched and the average is recomputed and written back to `drivers.rating`.
- **Admin delete** (`DELETE /admin/ratings/:id`): removes rating and triggers the same average recalculation.
- Schema supports both `ride` and `trip` (shuttle) context in `ratings` table.

### What's Partial / Missing
- ⚠️ **Shuttle rating submission** — schema supports it but no dedicated `POST /trips/:id/rate` endpoint was found; only ride ratings have a submission flow.
- ❌ **Passenger-rated-by-driver** — one-directional only; drivers cannot rate passengers.
- ❌ **In-app rating reminders** — no push notification prompting passengers to rate after completion.

---

## 6. Promo Codes

**Overall: ✅ Complete**

### What's Complete
- Schema supports `percentage` and `fixed` discount types, `expiry_date`, `max_usage`, and `is_active` flag.
- Validation and application fully integrated into ride request flow with atomic usage counter increment (prevents race conditions).
- `discountedPrice` computed and stored on the ride record; promo code ID stored for audit.
- Full admin CRUD (`POST/GET/PATCH/DELETE /admin/promo-codes`).
- Admin analytics endpoint: usage stats, total discount given.

### What's Partial / Missing
- ❌ **User-specific codes** — no per-user assignment; all codes are global.
- ❌ **First-ride-only restriction** — no flag to limit a code to a user's first ride.
- ❌ **Minimum fare threshold** — no minimum ride value check before applying a code.

---

## 7. Cancellation Policy

**Overall: ⚠️ Partial**

### What's Complete (On-Demand Rides)
- Fee logic in `PATCH /rides/:id/cancel`:
  - No fee if cancelled before driver is assigned.
  - Flat `cancellation_fee_arrived` (configurable) if driver has already arrived.
  - `active_ride_cancellation_fee` for cancelling an in-progress ride.
- Escrow refund minus applicable fee returned to passenger wallet.
- Cancellation fee credited to driver if driver had arrived.
- Driver cancellation triggers automatic re-dispatch at no cost to passenger.

### What's Partial / Missing
- ⚠️ **Shuttle/trip cancellations** — basic status update to `cancelled` exists, but no fee/refund logic equivalent to the ride cancellation flow.
- ❌ **Automated no-show cancellation** — no server-side timer that auto-cancels if a passenger is unreachable after N minutes at pickup, despite waiting charge being tracked.
- ❌ **Cancellation rate penalties** — no mechanism to penalise users/drivers with high cancellation rates (e.g., temporary ban, reduced priority).

---

## 8. WebSocket Events

**Overall: ✅ Complete**

### Connection & Rooms
- JWT authenticated at handshake via `io.use` middleware.
- Room structure: `admin:room`, `passenger:{userId}`, `driver:{userId}`, `drivers:available:{vehicleType}`, `trip:{tripId}`, `passengers:all`.

### Events Reference

| Direction | Event | Purpose |
|-----------|-------|---------|
| S→C | `ride:offer` | Dispatch offer sent to driver |
| S→C | `ride:offer_expired` | Offer timed out, clean up driver UI |
| S→C | `ride:no_longer_available` | Ride taken by another driver |
| S→C | `ride:driver_assigned` | Passenger notified driver accepted |
| S→C | `ride:driver_arrived` | Passenger notified driver at pickup |
| S→C | `ride:started` | Ride is underway |
| S→C | `ride:completed` | Ride finished |
| S→C | `ride:cancelled` | Ride cancelled (passenger side) |
| S→C | `ride:driver_cancelled` | Driver cancelled, re-dispatching |
| S→C | `ride:driver_location` | Live driver GPS during ride |
| C→S | `driver:location:update` | General driver GPS heartbeat |
| C→S | `driver:ride:location` | GPS during active ride |
| S→C | `ride:deviation:warning` | Route deviation alert (passenger + admin) |
| S→C | `sos:triggered` | SOS alert broadcast to admin room |
| S→C | `surge:updated` | Surge multiplier changed (all passengers) |
| S→C | `notification:new` | Push notification (admin-broadcast) |
| C→S | `driver:trip:start` | Shuttle trip start signal |
| C→S | `driver:trip:complete` | Shuttle trip complete signal |
| C→S | `passenger:join:trip` | Passenger subscribes to shuttle tracking |
| S→C | `passenger:trip:tracking` | Shuttle live location |
| S→C | `admin:track:trip` | Admin dashboard live tracking |

### What's Partial / Missing
- ⚠️ **In-app chat** — `trip:chat:message` and `admin:chat:new` event constants exist but socket handler logic for relaying chat messages between passenger and driver is not implemented.
- ⚠️ **SOS socket trigger** — SOS is REST-only (`POST /rides/:id/sos`); there is no socket-based SOS trigger path for cases where the REST call might fail.

---

## 9. Authentication

**Overall: ✅ Complete**

### What's Complete
- **JWT**: 15-minute access tokens + 30-day refresh tokens, stored in `users.refresh_token` for revocation. Full rotation at `/auth/refresh`, revocation at logout.
- **OTP/SMS**: 6-digit code, 10-minute expiry, sent via Twilio (production) or console log (development). `/auth/send-otp` → `/auth/verify-otp`.
- **Password reset**: SMS-based 4-character hex token via `/auth/forgot-password` → `/auth/reset-password`.
- **RBAC**: Three roles — `user` (rider), `driver`, `admin`. Granular staff permissions stored as `text[]` in `staff_roles` table. Super-admins (no `staffRoleId`) bypass all permission checks.
- **Middleware**: `authenticate` (validates Bearer token, checks user exists and not blocked), `requireRole(...roles)`, `requirePermission(perm)`.
- **Security**: `bcryptjs` with 12 rounds, `isBlocked` and `isVerified` checks on every authenticated request, `express-rate-limit` on auth routes, `helmet` headers.

### What's Partial / Missing
- ⚠️ **Access token blacklisting** — relies on DB refresh token comparison only; a stolen access token remains valid for its full 15-minute window (no Redis-based blacklist).
- ⚠️ **Rate limiting granularity** — global rate limiter applied but no per-user or per-IP adaptive throttling on OTP endpoints specifically.
- ❌ **Social / OAuth login** — no Google, Apple, or Facebook sign-in.
- ❌ **MFA beyond OTP** — no TOTP-based 2FA for admin accounts.

---

## 10. Surge Pricing

**Overall: ✅ Complete**

### What's Complete
- Background job (default every 5 minutes) calculates demand/supply ratios per vehicle type.
- Four tiers: `none` (1.0×), `low` (1.3×), `medium` (1.6×), `high` (2.0×).
- Thresholds are configurable via admin settings (`surge_low_threshold`, `surge_medium_threshold`, `surge_high_threshold`).
- Multipliers applied synchronously at fare estimation and ride request.
- Real-time `surge:updated` WebSocket event broadcast to `passengers:all` room on state change.
- Admin can view live surge states and toggle the engine on/off (`GET/POST /admin/surge-settings`).
- Surge multiplier stored on the ride record for audit.

### What's Partial / Missing
- ⚠️ **Zone-specific surge** — surge is per vehicle type globally, not per geographic zone; high-demand in one part of Cairo affects pricing city-wide.
- ❌ **Passenger surge warning acknowledgement** — no mechanism to require passengers to explicitly accept a surge price before requesting.

---

## 11. Waiting Charge

**Overall: ✅ Complete**

### What's Complete
- Timer starts when driver marks `arrived` (`PATCH /driver/rides/:id/arrived`).
- **Free window**: 3 minutes (configurable via `FREE_WINDOW_MINUTES`).
- **Rate**: configurable via `waiting_charge_per_minute` setting (default 2.00 EGP/min).
- Timer stops when ride starts (`PATCH /driver/rides/:id/start`).
- Wall-clock time used for accuracy (not just tick counts).
- Accumulated charge stored in `rides.waitingCharge` and deducted from passenger wallet at completion.
- **Restart recovery**: `initWaitingTimers()` re-hydrates all active timers from DB on server boot.
- Real-time updates sent to passenger via Socket.IO during wait.

### What's Partial / Missing
- ❌ **Waiting charge cap** — no maximum limit; a very long wait could result in an unexpectedly large charge with no ceiling.
- ❌ **Passenger notification on charge start** — timer start event is tracked but no explicit push notification is sent when the free window expires and billing begins.

---

## 12. Selfie Check-in (Driver Verification)

**Overall: ✅ Complete**

### What's Complete
- `POST /driver/checkin`: accepts image upload via `multer`, stores to Supabase Storage bucket (`uploads`), runs face detection via TensorFlow.js / `@vladmandic/face-api` WASM backend.
- Supported check-in types: `shuttle_trip_start` and `periodic_online`.
- `checkInRequired` and `checkInDeadline` flags on driver record gate dispatch eligibility.
- Check-in monitor (`checkin-monitor.ts`): background process that flags drivers overdue for periodic check-in and emits alerts.
- Real-time: emits `DRIVER_CHECKIN_APPROVED` or `DRIVER_CHECKIN_REJECTED` via Socket.IO.
- Admin view: `GET /admin/checkins` with filtering by driver, type, date range, and result.

### What's Partial / Missing
- ⚠️ **Liveness detection** — face detection confirms a face is present but does not verify liveness (anti-spoofing); a photo of the driver could pass.
- ⚠️ **Enrollment / reference photo** — it is not fully clear whether check-in compares against a stored reference photo or simply checks that a face is detectable.
- ❌ **Automatic driver suspension** on repeated failed check-ins (currently emits rejection but does not auto-offline the driver).

---

## 13. SOS

**Overall: ✅ Complete** *(as of this build)*

### What's Complete
- **Trigger** (`POST /rides/:id/sos`): validates caller is passenger or assigned driver of an active ride, records event in `sos_events` with GPS coordinates, role, and ride ID.
- Immediately emits `sos:triggered` to `admin:room` with full context.
- Schema tracks: `user_id`, `ride_id`, `role`, `latitude`, `longitude`, `triggered_at`, `status`, `notes`.
- **Admin list** (`GET /admin/sos-events`): filterable by status, date range, with joined user and ride details.
- **Admin resolve** (`POST /admin/sos-events/:id/resolve`): marks status as `resolved`, records `resolved_by_id` (admin user ID) and `resolved_at` timestamp, accepts optional resolution notes. Returns `409` if already resolved.

### What's Partial / Missing
- ⚠️ **Route deviation → SOS escalation** — deviation warnings are emitted but there is no automatic SOS escalation if deviation is sustained.
- ❌ **SMS/push alert to emergency contacts** — SOS only notifies in-app admins; no integration to SMS family members or third-party emergency services.
- ❌ **Socket-based SOS trigger** — trigger is REST-only; if network conditions prevent an HTTP call, there is no WS fallback path.

---

## 14. Route Deviation

**Overall: ⚠️ Partial**

### What's Complete
- Cross-track distance calculation (perpendicular distance from current GPS to straight line between pickup and dropoff).
- Threshold: 500 m.
- Throttle: maximum one warning per 60 seconds per ride (prevents event flooding).
- Emits `ride:deviation:warning` to both `passenger:{userId}` and `admin:room`.
- Warning includes ride ID, current coordinates, and deviation distance.

### What's Missing
- ⚠️ **Straight-line only** — deviation is measured against the direct pickup-to-dropoff vector, not the actual routed path. Will produce false positives on curved roads, ring roads, and known detours.
- ❌ **OSRM / route polyline integration** — no actual route geometry fetched or stored; comparison against a real path is not implemented.
- ❌ **Sustained deviation escalation** — a single spike triggers a warning, but if the driver stays off-route for several minutes there is no escalation to SOS or forced route correction.
- ❌ **Driver notification on deviation** — warning is sent to passenger and admin but not to the driver themselves.

---

## 15. Ride Sharing (Tracking Links)

**Overall: ✅ Complete**

### What's Complete
- `POST /rides/:id/share`: generates a 192-bit URL-safe token with 24-hour TTL. Idempotent — returns existing valid token if one already exists for the ride.
- Token stored in `ride_share_tokens` table with `expiresAt` and `rideId`.
- `GET /track/:token` (public, no auth): returns real-time ride progress (status, driver location, ETA hint) for third-party viewers.
- Expired or invalid tokens return `404`.

### What's Partial / Missing
- ❌ **Mobile deep-link / share sheet integration** — backend produces the URL; mobile app UI to present a "Share ride" button and copy/send the link is a client-side concern and not yet verified.
- ❌ **Token revocation** — no endpoint to invalidate a share token early (e.g., if passenger wants to stop sharing).

---

## 16. Peak Hours Logic

**Overall: ✅ Complete** *(dispatch-focused)*

### What's Complete
- Configurable peak windows stored in settings (`dispatch_peak_windows`), defaulting to 07:00–09:00 and 17:00–19:00 Cairo time.
- During peak windows, dispatch engine automatically adjusts:
  - Larger `batchSize` (more drivers notified per round).
  - Tighter initial radius (prefer closer drivers under high demand).
- Admin can update peak window definitions via `POST /admin/peak-settings`.
- Driver-facing "Peak Hours Promo" description (20% extra) exposed via `GET /driver/incentives`.

### What's Partial / Missing
- ⚠️ **Driver earnings peak multiplier not calculated** — the 20% peak bonus is a descriptive label only; no additional line item is added to `driver_earnings` during peak windows.
- ❌ **Passenger-facing peak surcharge independent of surge** — peak hour price increases are delivered entirely through the surge pricing engine; there is no separate "peak hour fee" line item on the passenger receipt.
- ❌ **Dynamic peak window detection** — windows are statically configured; no ML or rolling-average logic to auto-detect emerging peak periods.

---

## Summary Matrix

| Feature Area | Status | Key Gap |
|---|---|---|
| Ride Flow | ✅ Complete | No auto-complete fallback, no scheduled rides |
| Dispatch | ✅ Complete | No "no drivers found" push to passenger |
| Wallet | ✅ Complete | No external payment gateway for top-up |
| Driver Earnings | ⚠️ Partial | No shuttle earnings, no automated payout |
| Ratings | ✅ Complete | No driver-rates-passenger, no shuttle submission route |
| Promo Codes | ✅ Complete | Global only — no user-specific or first-ride restrictions |
| Cancellation | ⚠️ Partial | No auto no-show, shuttle cancellation lacks fee logic |
| WebSocket Events | ✅ Complete | In-app chat handler not wired up |
| Authentication | ✅ Complete | No access token blacklist, no social login |
| Surge Pricing | ✅ Complete | Global per vehicle type — not per zone |
| Waiting Charge | ✅ Complete | No cap, no "billing started" push notification |
| Selfie Check-in | ✅ Complete | Liveness detection not verified |
| SOS | ✅ Complete | No SMS to emergency contacts, REST-only trigger |
| Route Deviation | ⚠️ Partial | Straight-line only, no real route geometry |
| Ride Sharing | ✅ Complete | No token revocation endpoint |
| Peak Hours | ✅ Complete | Driver peak bonus is label-only, not calculated |

---

## Recommended Next Steps (Priority Order)

1. **Route Deviation** — integrate OSRM or a routing API to compare against real polylines; add driver-side deviation notification.
2. **Driver Earnings — Shuttle** — add earning calculation to shuttle trip completion flow.
3. **Automated Payout** — aggregate `confirmed` earnings and credit driver wallet or initiate external transfer.
4. **Auto No-Show Cancellation** — server-side timer (e.g., 10 min after arrival with no ride start) to auto-cancel with fee.
5. **External Top-up Gateway** — integrate a payment provider (Fawry, Paymob, Stripe) for self-service wallet top-up.
6. **In-App Chat** — wire up the existing `trip:chat:message` socket event constants to a relay handler.
7. **Waiting Charge Cap** — add configurable `max_waiting_charge` to prevent runaway billing.
8. **Access Token Blacklist** — add Redis-backed invalidation for logout and password-reset scenarios.
