# VeeGo Shuttle System — Backend Audit Report

**Generated:** 2026-06-10  
**Scope:** Full codebase review — API Server (`artifacts/api-server`) + Admin Dashboard (`artifacts/admin-dashboard`)  
**Stack:** Node.js / Express 5 / TypeScript / Drizzle ORM / PostgreSQL / Socket.IO / React + Vite / TailwindCSS

---

## 1. System Overview

VeeGo is a multi-service ride and shuttle platform serving two primary use cases:

1. **On-demand rides** — Passenger-initiated car/bike hailing with real-time driver dispatch, surge pricing, and wallet-based payment.
2. **Shuttle service** — Fixed-route, scheduled bus trips with seat booking, driver assignment, and weekly scheduling.

The system is structured as a **pnpm monorepo** with four packages:

| Package | Purpose |
|---|---|
| `@workspace/api-server` | Express 5 REST API + Socket.IO server |
| `@workspace/admin-dashboard` | React + Vite admin SPA |
| `@workspace/db` | Drizzle ORM schema + migrations |
| `@workspace/api-client-react` | Auto-generated typed React Query client (Orval) |
| `@workspace/api-zod` | Auto-generated Zod validation types |
| `@workspace/api-spec` | OpenAPI 3 spec (source for code generation) |

The server targets **Express 5** (async error forwarding enabled). The database is PostgreSQL accessed through Drizzle ORM. Real-time communication is handled via **Socket.IO 4**.

---

## 2. Backend Server Status

### ✅ Implemented (Fully Working)

#### Authentication & Authorization
- `POST /auth/register` — User registration with bcrypt password hashing; returns JWT access + refresh tokens.
- `POST /auth/login` — Passenger login; explicitly rejects admin accounts (must use `/auth/admin/login`).
- `POST /auth/admin/login` — Admin-only login portal; rejects non-admin roles.
- `POST /auth/refresh` — Refresh token rotation (single-use, stored in DB).
- `GET /auth/me` — Returns current user profile + permissions.
- `POST /auth/send-otp` / `POST /auth/verify-otp` — SMS-based OTP flow for phone verification.
- `POST /auth/forgot-password` / `POST /auth/reset-password` — SMS-based password reset via token.
- JWT middleware (`authenticate`) with DB-backed user existence + block check on every request.
- Role-based access control (`requireRole`) for `user`, `driver`, `admin`.
- Permission-based access control (`requirePermission`) for staff sub-roles with granular permissions array.
- Super-admin seeded at startup via `seedSuperAdmin()`.

#### Ride Hailing (On-Demand)
- `POST /rides/estimate` — Price estimation with zone pricing, global fallback, surge multiplier, and duration estimate.
- `POST /rides/request` — Full ride creation: service availability check, duplicate active-ride guard, zone/global pricing, surge, promo code validation, wallet escrow (atomic transaction), ride event logging.
- Promo code race-condition protection via atomic `UPDATE … WHERE used_count < max_usage`.
- Rate limiting on ride requests (configurable via env vars, default 3 per 2 min per user).
- `POST /rides/:id/cancel` — Passenger cancellation with wallet refund.
- `GET /rides/active` / `GET /rides/:id` — Passenger ride status endpoints.
- Full ride lifecycle events: `RIDE_REQUESTED`, `RIDE_CANCELLED`, `DRIVER_ASSIGNED`, `DRIVER_ARRIVED`, `RIDE_STARTED`, `RIDE_COMPLETED`.
- SOS event triggering and ride deviation warning events.
- Ride share tokens for passenger-to-contact tracking.

#### Smart Dispatch Engine (`dispatch-manager.ts`)
- **5 implemented dispatch features:**
  1. **Batch dispatch** — Up to N drivers offered simultaneously per round (15 s timeout).
  2. **Smart scoring** — 50% distance + 30% rating + 20% acceptance rate composite score.
  3. **Driver cooldown** — 3 consecutive rejections triggers 10-min cooldown; resets on acceptance.
  4. **Fair distribution** — Recent-dispatch penalty (−0.1) deprioritises drivers offered within last 10 min.
  5. **Dynamic radius expansion** — Tries radius steps (5 km → 8 km → 12 km) until drivers found.
- Peak-hour awareness: different batch sizes and radius steps for peak vs. off-peak (DB-configurable).
- Dispatch cycle restart on exhaustion (all drivers notified → reset → retry).
- `recoverActiveDispatches()` called on startup to resume in-flight dispatches after server restart.
- Wallet auto-refund on `cancelRideNoDrivers`.

#### Surge Pricing (`surge-pricing.ts`)
- Background job polling every 5 minutes (configurable via `SURGE_INTERVAL_MS`).
- Demand/supply ratio calculation: searching rides ÷ online drivers per vehicle type.
- Four tiers: `none` (1.0×), `low` (1.3×), `medium` (1.6×), `high` (2.0× hard cap).
- In-memory O(1) reads for ride requests (no extra DB query at booking time).
- State persisted to DB settings table and restored on server restart.
- Real-time `surge:updated` Socket.IO broadcast to all passengers on change.

#### Shuttle Service
- `GET /shuttle/lines` — All active routes with trip-derived timeslots, seat counts, week grouping, booking flags.
- `GET /shuttle/lines/:id` — Route detail with stations and upcoming trip list.
- `GET /shuttle/trips/:id/passengers` — Passenger manifest for a specific trip.
- `POST /shuttle/bookings/:id/board` — Driver marks passenger as boarded; emits `booking:boarded` socket event.
- `GET /shuttle/assignments` — Driver ↔ bus ↔ active trip assignment list.
- Shuttle uses Cairo timezone (`Africa/Cairo`) for all departure time display.
- Seat count derived from bookings table (14 total, 7 minimum required to activate).

#### Shuttle Admin Endpoints (`shuttleTripsAdmin.ts`, `shuttleBookings.ts`)
- Full CRUD for shuttle trips with status management.
- Admin reassignment of bookings between drivers with socket notification.
- Shuttle booking cancellation with wallet refund.
- Shuttle renewal job (`shuttle-renewal-job.ts`) for weekly trip auto-generation.

#### Schedules / Routes
- Full CRUD: `GET/POST /routes`, `PATCH/DELETE /routes/:id`.
- Station management: `GET/POST /routes/:id/stations`, station reordering.
- Cascade-delete protection (FK-aware delete order documented in memory).
- `GET/POST /schedules` with `routeSchedules` table.

#### Trip Management
- `GET/POST /trips` — Admin trip creation + listing with filters.
- `PATCH /trips/:id` — Status updates: `scheduled`, `active`, `boarding`, `completed`, `cancelled`.
- `GET /trips/:id/stations` — Station progress per trip.
- Trip event log (`tripEventsTable`) for audit trail.
- Station progress tracking (`tripStationProgressTable`).

#### Driver System
- `GET/POST /drivers` — Admin driver listing + creation.
- `PATCH/DELETE /drivers/:id` — Update + delete with FK-order awareness.
- `GET /admin/drivers/live` — Live driver list with current location + active trip.
- Driver document upload + verification workflow (`driverDocuments.ts`).
- Driver earnings tracking (`earnings.ts`) with summary + history endpoints.
- Driver check-in system (selfie-based, AI face detection, Supabase storage).
- Dispatch cooldown override by admin.

#### Driver Selfie Check-In (`checkin-monitor.ts` + `checkin.ts`)
- Background monitor polling every 60 seconds.
- Phase 1: Prompts drivers online ≥ 10 hours (configurable) via socket event + sets deadline.
- Phase 2: Auto-offline drivers who miss their 30-minute check-in deadline.
- Face detection using `@vladmandic/face-api` with TensorFlow.js WASM backend.
- Selfie images uploaded to Supabase Storage.
- Admin endpoint `GET /admin/checkins` with filters.

#### User Management
- `GET /admin/users` — Paginated user list with filters.
- `PATCH /admin/users/:id` — Update name, email, phone, role, block status.
- `DELETE /admin/users/:id` — User deletion.
- `PATCH /admin/users/:id/role` — Role assignment.
- `GET /users/me` + `PATCH /users/me` — Passenger self-profile management.

#### Payments & Wallet
- `GET /admin/payments` — Paginated payment list with filters (status, method, user, date range).
- `GET /admin/payments/summary` — Aggregate stats by status + method.
- `PATCH /admin/payments/:id` — Manual status/notes override with audit log.
- `GET/POST /wallet/topup` — Wallet top-up (manual, no payment gateway).
- `GET /wallet/transactions` — Transaction history.
- Wallet balance escrow on ride request; refund on cancellation/no-drivers.

#### Promo Codes
- Full CRUD for promo codes with percentage/fixed discount types.
- Expiry date, max usage, active/inactive toggle.
- Race-condition safe atomic increment on ride request.

#### Notifications
- `GET /admin/notifications` / `POST /admin/notifications` — Admin-to-user push notifications.
- `GET /notifications` — User notification list.
- Real-time `notification:new` socket event.
- `pushToken` stored per user for future mobile push.

#### Support & Chat
- Support ticket system: create, list, update status, reply with messages.
- In-trip chat between driver and passenger (`chat.ts`) with socket relay.
- Admin chat inbox with all active conversations (`chat-inbox.tsx`).

#### Zones & Zone Pricing
- Zone CRUD with center lat/lng + radius (km).
- Per-zone pricing overrides per vehicle type.
- Zone pricing applied at ride request and estimate time (haversine proximity check).

#### Vehicles
- Separate vehicle registry (not tied to drivers).
- List, create, update, delete vehicles with type/status filters.

#### Buses
- Bus fleet CRUD: plate number, model, capacity, active status.
- Driver ↔ bus assignment via `assignedBusId` on driver record.

#### Staff & Roles
- Staff role CRUD with granular permissions array.
- Admin users can have a `staffRoleId` limiting their permissions.
- `requirePermission(permission)` middleware enforces per-route granular access.

#### Audit Logs
- `writeAuditLog()` helper used across payments, user updates, etc.
- `GET /admin/audit-logs` — Paginated audit trail.

#### Service Controls
- Enable/disable service types (`car`, `motorcycle`, `delivery`, `shuttle`) from admin.
- Broadcast `service:control:changed` + `service:settings:changed` to all clients via socket.
- Ride requests check service availability before proceeding.

#### Live Tracking
- `GET /admin/track` — Admin live driver positions.
- Socket: drivers emit `driver:location:update`; server relays to admin room and active trip passengers.
- Route deviation detection logic in `socket.ts` (referenced via `clearDeviationState`).
- SOS event emission.

#### Settings
- Generic key-value settings table (`settingsTable`).
- `loadSetting()` / `saveSetting()` helpers with typed generics.
- Used for surge state persistence, dispatch config, peak hours config.

#### Background Jobs (Server)
| Job | File | Interval |
|---|---|---|
| Surge pricing | `surge-pricing.ts` | 5 min (configurable) |
| Checkin monitor | `checkin-monitor.ts` | 60 s |
| Ride timeout | `ride-timeout.ts` | Referenced in index.ts |
| No-show monitor | `no-show-monitor.ts` | Referenced in rides.ts |
| Waiting timer | `waiting-timer.ts` | Per-ride |
| Shuttle job | `shuttle-job.ts` | Referenced in index.ts |
| Shuttle renewal job | `shuttle-renewal-job.ts` | Referenced in index.ts |
| Job queue | `jobQueue.ts` | In-process queue |

#### Ratings
- `GET /admin/ratings` — All ratings with filters.
- `POST /ratings` — Passenger submits rating after ride completion.

#### Suggestions
- Route suggestion submission by passengers.
- Admin review workflow (pending → approved/rejected).

#### Infrastructure
- CORS whitelist with Replit dev domain auto-detection.
- Helmet security headers.
- Rate limiting: 200 req/15 min global, 20 req/15 min on auth routes.
- Pino structured logging with HTTP request serialisation.
- Request trace ID middleware (`trace.ts`).
- Swagger/OpenAPI docs at `/api/docs` + JSON spec at `/api/docs/json`.
- Graceful shutdown (SIGTERM / SIGINT) with in-flight request draining (referenced in `index.ts`).
- TypeScript strict mode with ESBuild bundling.

---

### ⚠️ Partially Implemented

#### SMS / OTP
- **Implemented:** Twilio integration is fully coded (`sms.ts`). OTP send/verify and password-reset flows use it.
- **Partial:** Defaults to `"console"` mode (logs to stdout) when `SMS_PROVIDER` env var is not set to `"twilio"`. In production, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` must be configured. **No fallback provider. No retry logic.**

#### Payment Gateway
- **Implemented:** Wallet system, manual top-up, audit trail.
- **Missing:** No real payment gateway integration (Stripe, PayMob, etc.). Wallet top-up is manual (admin or direct DB insert). Card payments (`method: "card"` is stored in the schema and displayed in admin) but no actual card processing endpoint exists.

#### Driver Document Verification (`driverDocuments.ts`)
- **Implemented:** Upload, list, update status (pending/approved/rejected), admin review page.
- **Partial:** Document image storage goes to Supabase Storage (same bucket as selfies). No OCR or automated verification. Manual admin approval only.

#### Ratings
- Rating submission endpoint exists.
- Driver average rating is stored on `driversTable.rating` but the update logic (recalculating average after new rating) is **NOT FOUND** in the ratings route. The rating column may become stale.

#### Waiting Timer / No-Show Monitor
- Both are started/stopped within `rides.ts` route handlers.
- The job files exist (`waiting-timer.ts`, `no-show-monitor.ts`) and are referenced.
- The admin dashboard does NOT have a dedicated view for waiting charges or no-show events.

#### Ride Share Tokens (`rideShareTokens.ts`)
- Schema exists. Tokens are created in `rides.ts`.
- No passenger-facing "track my ride" public page found. Feature is backend-ready but frontend consumer is NOT FOUND in the admin dashboard (expected to be in the passenger mobile app, which is not in scope here).

#### Locations Endpoint (`locations.ts`)
- `GET /locations/drivers` and `POST /locations/update` exist.
- These appear to be legacy/alternative location update paths. The primary location update is via Socket.IO (`driver:location:update`). Overlap/conflict potential.

---

### ❌ Missing / Not Implemented

#### Real Payment Processing
- No Stripe, PayMob, Fawry, or any card gateway integration.
- `method: "card"` payments cannot actually be processed through the system.

#### Driver Rating Recalculation
- No trigger or endpoint that recomputes `drivers.rating` after a new rating is submitted. The value is set at creation (default 5.0) and is only updated manually or through an undiscovered path.

#### Email Notifications
- No email sending of any kind. No SMTP, no SendGrid, no SES. All notifications are SMS (Twilio) or in-app socket events.

#### Mobile Push Notifications
- `pushToken` is stored per user but no push notification sending code exists (no FCM, no APNs).

#### Passenger App API
- Passenger-facing ride flow is implemented but assumes a **separate mobile app** (not in scope). No web passenger interface is present in this codebase.

#### Driver Mobile App
- Driver-facing Socket.IO events are fully defined. REST endpoints for driver status/location exist. But the actual **driver app** is a separate project (not in this codebase).

#### Webhook / Event Bus
- No outbound webhooks to external systems.
- No event bus (no Kafka, Redis pub/sub, etc.). All real-time is in-process Socket.IO only.

#### Multi-Server / Horizontal Scaling
- Socket.IO has **no Redis adapter configured**. Running multiple API server instances would split WebSocket state — drivers on server A would be invisible to passengers on server B.

#### Automated Testing
- `vitest` is listed as a dev dependency. Test configuration exists (`vitest` scripts in `package.json`).
- **No test files found** in the api-server `src/` directory. Test coverage = 0%.

---

## 3. Admin Dashboard Status

### ✅ Implemented Pages & Features

| Route | Page | Status |
|---|---|---|
| `/` or `/dashboard` | Dashboard | ✅ Summary cards, activity feed, analytics charts |
| `/users` | Users | ✅ Paginated list, search, block/unblock, role change |
| `/users/:id` | User Detail | ✅ Full profile, wallet balance, booking history |
| `/routes` | Routes | ✅ List, create, edit, delete shuttle routes |
| `/routes/:id` | Route Detail | ✅ Stations CRUD, trip list, map preview |
| `/trips` | Trips | ✅ Paginated list, filters, status badges |
| `/trips/:id` | Trip Detail | ✅ Station progress, passenger manifest, driver info |
| `/drivers` | Drivers | ✅ List, create, filters, online status indicator |
| `/drivers/:id` | Driver Detail | ✅ Full profile, earnings, documents, check-in history |
| `/driver-verification` | Driver Verification | ✅ Pending documents queue, approve/reject |
| `/vehicles/:serviceType` | Vehicles | ✅ Vehicle registry per service type |
| `/bookings` | Bookings | ✅ Shuttle booking list, filters, status |
| `/wallet` | Wallet | ✅ Transaction list, top-up, balance overview |
| `/payments` | Payments | ✅ Payment list, filters, status override |
| `/promo` | Promo Codes | ✅ CRUD, discount type, expiry, usage tracking |
| `/pricing/:type` | Pricing | ✅ Global ride pricing (car/bike), per-km/base/min fare |
| `/zones` | Zones | ✅ Zone CRUD with map, per-zone pricing |
| `/services` | Services | ✅ Enable/disable service types, settings |
| `/live-tracking` | Live Tracking | ✅ MapLibre map with real-time driver positions |
| `/support` | Support | ✅ Ticket list, reply, status management |
| `/notifications` | Notifications | ✅ Send push notifications, notification history |
| `/reports` | Reports | ✅ Analytics charts (recharts), CSV/Excel export |
| `/staff` | Staff | ✅ Staff role CRUD with granular permissions |
| `/settings` | Settings | ✅ System settings key-value management |
| `/audit-logs` | Audit Logs | ✅ Full audit trail table with filters |
| `/ratings` | Ratings | ✅ Rating list, driver averages |
| `/chat-inbox` | Chat Inbox | ✅ In-trip chat messages view |
| `/schedules` | Schedules | ✅ Route schedule management |
| `/buses` | Buses | ✅ Bus fleet CRUD, driver assignment |
| `/shuttle-trips` | Shuttle Trips | ✅ Admin view of all shuttle trips |
| `/shuttle-trips/:id` | Shuttle Trip Detail | ✅ Passenger manifest, boarding controls |
| `/login` | Login | ✅ Admin login form, JWT token storage |

#### Admin Dashboard Technical Features
- **Authentication:** JWT stored in `localStorage`. Token injected via `setAuthTokenGetter()` at app startup into the generated API client.
- **Auto-logout:** React Query's `QueryCache.onError` and `MutationCache.onError` detect 401 responses and call `logout()`.
- **Real-time updates:** `useAdminSocket.ts` hook connects Socket.IO client on admin login.
- **Internationalization:** `i18next` with English and Arabic locales (`src/locales/en/` + `src/locales/ar/`).
- **Dark/light theme:** `next-themes` with toggle in app layout.
- **Export:** `src/lib/export.ts` using `xlsx` library — CSV and Excel export on reports pages.
- **Currency formatting:** `src/lib/currency.ts` — localised currency display.
- **Maps:** `MapLibre GL` for live tracking map, `Leaflet` + `react-leaflet` for route maps (both present).
- **UI System:** Radix UI primitives + Tailwind CSS + shadcn/ui component set (full component library present).
- **Routing:** Wouter v3 (lightweight React router).
- **API Client:** Auto-generated TanStack Query hooks via Orval — strongly typed, matches OpenAPI spec.
- **Notification Bell:** `NotificationBell.tsx` component — real-time unread count badge.
- **Driver Detail Panel:** `DriverDetailPanel.tsx` — slide-in panel used in live tracking page.

---

### ⚠️ Partially Implemented (Dashboard)

#### Reports Page
- Charts and export buttons are present.
- Revenue analytics relies on `bookings.total_price` (shuttle only). **Ride revenue is not included** in the reports aggregate (ride payments go through the wallet/payments tables which are separate).

#### Live Tracking
- MapLibre map renders driver positions from Socket.IO updates.
- **Satellite/street tile source** needs a valid MapLibre/MapTiler API key or tile server URL to actually display map tiles. Without a configured tile source, the map background will be blank.

#### Settings Page
- Generic key-value settings UI exists.
- Some settings (dispatch config, peak hours, surge thresholds) are editable via this page, but there is **no field-level validation UI** — wrong values entered here can silently break dispatch behaviour.

#### Suggestions Page (`/suggestions` route)
- Listed in the admin pages directory (`suggestions.tsx`) but **NOT registered as a route** in `App.tsx`. The page exists but is inaccessible from the UI.

---

### ❌ Missing (Dashboard)

#### Ride Management Page
- There is **no `/rides` admin page** in `App.tsx`. The backend has full `GET /admin/rides` and `GET /admin/rides/:id` endpoints.
- Admins cannot browse, search, or view individual on-demand rides from the dashboard.

#### Driver Check-in Admin View
- `GET /admin/checkins` API exists and returns check-in data with face detection results.
- **No admin dashboard page** for reviewing selfie check-in history or manual approval overrides.

#### SOS / Safety Events
- `sosEventsTable` exists in the schema. `SOS_TRIGGERED` socket event is defined.
- **No admin SOS monitoring page** exists in the dashboard.

#### Surge Pricing Control Panel
- Surge state is calculated automatically. The backend can be configured via settings keys.
- **No dedicated surge pricing admin page** (no UI to view current surge state, force-override multiplier, or configure thresholds visually).

#### Zone Map Editing
- Zones have `centerLat`, `centerLng`, `radiusKm` fields.
- The zones page shows zone data but **no interactive map drawing tool** for defining zone boundaries.

#### Wallet Top-Up Gateway
- No UI for processing card payments or integrating a real top-up flow.

---

## 4. Database Structure

### Tables (38 total, all in PostgreSQL via Drizzle ORM)

| Table | Purpose |
|---|---|
| `users` | All users (passengers, drivers, admins). Includes wallet balance, OTP, reset token, push token, staff role. |
| `drivers` | Driver profiles. References `users`. Stores location, status, dispatch stats, check-in state, cooldown. |
| `buses` | Fleet of buses. Referenced by drivers (`assigned_bus_id`). |
| `vehicles` | Alternative vehicle registry (not directly linked to drivers). |
| `routes` | Shuttle route definitions (from/to, base price, active flag). |
| `stations` | Stops on a route, ordered. References `routes`. |
| `trips` | Scheduled shuttle trips. References `routes`, `buses`, `drivers`. |
| `trip_events` | Audit log for trip status changes. |
| `trip_station_progress` | Per-station boarding progress for active trips. |
| `bookings` | Passenger seat bookings for shuttle trips. References `users`, `trips`. |
| `driver_shuttle_bookings` | Driver's weekly slot bookings. References `drivers`, `routes`. |
| `route_schedules` | Recurring schedule definitions for routes. |
| `rides` | On-demand ride requests. References `users` (passenger), `drivers`. |
| `ride_events` | Lifecycle audit log for rides (REQUESTED, ASSIGNED, STARTED, etc.). |
| `ride_pricing` | Global pricing config per vehicle type (baseFare, perKm, perMin, minFare). |
| `ride_dispatch_state` | Per-ride dispatch state (current round, notified driver IDs, status). |
| `ride_share_tokens` | Shareable tokens for passenger ride tracking links. |
| `driver_earnings` | Per-trip driver earnings records. |
| `driver_documents` | KYC documents (license, insurance, etc.). Stores image URL + verification status. |
| `driver_checkins` | Selfie check-in history with face detection result and image URL. |
| `driver_locations` | Historical location log (secondary to real-time socket updates). |
| `user_locations` | Historical passenger location log. |
| `wallet_transactions` | Wallet credit/debit history (payment, refund, top-up, earning). |
| `payments` | Formal payment records tied to bookings or rides. |
| `promo_codes` | Discount codes with type, value, expiry, max usage, used count. |
| `notifications` | Push notification records sent to users. |
| `ratings` | Post-ride ratings from passengers. References `rides`, `users`, `drivers`. |
| `support_tickets` | Support tickets from users. |
| `support_messages` | Messages within a support ticket thread. |
| `chat_messages` | In-trip chat messages between driver and passenger. |
| `route_suggestions` | Passenger route improvement suggestions. |
| `zones` | Geographic fare zones (center + radius). |
| `zone_pricing` | Per-zone pricing overrides per vehicle type. |
| `settings` | Generic key-value config store (JSON values). |
| `service_controls` | Enable/disable flags per service type. |
| `service_settings` | Additional per-service configuration. |
| `staff_roles` | Permission sets for admin sub-accounts. |
| `audit_logs` | System-wide admin action audit trail. |
| `sos_events` | Passenger SOS triggers during rides. |

### Key Relationships

```
users ──< drivers (1:1, via user_id FK cascade-delete)
drivers >── buses (many:1, assigned_bus_id nullable)
drivers ──< trips (driver assigned per trip)
routes ──< stations (ordered, 1:many)
routes ──< trips (1:many scheduled departures)
trips ──< bookings (passengers book seats on trips)
trips ──< trip_station_progress (per-station boarding)
users ──< bookings (passenger makes booking)
users ──< rides (passenger requests ride)
drivers ──< rides (driver accepts ride)
rides ──< ride_events (lifecycle audit)
rides ──< ride_dispatch_state (1:1 dispatch tracking)
zones ──< zone_pricing (per-zone, per-vehicle-type pricing)
users ──< wallet_transactions (credit/debit history)
staff_roles ──< users (optional, for permission scoping)
```

---

## 5. Business Logic Status

### Shuttle Flow
| Step | Status |
|---|---|
| Admin creates route + stations | ✅ Fully implemented |
| Admin creates scheduled trips | ✅ Fully implemented |
| Weekly auto-renewal of trips | ✅ `shuttle-renewal-job.ts` implemented |
| Passenger books seat(s) | ✅ Fully implemented with wallet deduction |
| Trip reaches 7+ bookings → activates | ✅ Status-based logic implemented |
| Admin assigns driver to trip | ✅ `PATCH /trips/:id` with driver assignment |
| Driver completes selfie check-in | ✅ Via `/driver/checkin` + face detection |
| Driver marks passenger boarded | ✅ `POST /shuttle/bookings/:id/board` |
| Trip completed | ✅ Status update + earnings recording |
| Cancellation + refund | ✅ Admin and passenger cancellation with wallet refund |

### On-Demand Ride Flow
| Step | Status |
|---|---|
| Price estimate (zone + surge) | ✅ Fully implemented |
| Ride request (wallet escrow) | ✅ Fully implemented with promo support |
| Smart dispatch to drivers | ✅ 5-feature dispatch engine |
| Driver accepts → assigned | ✅ Implemented |
| Driver arrives at pickup | ✅ `POST /rides/:id/driver-arrived` |
| Waiting charge accumulation | ✅ `waiting-timer.ts` starts on arrival |
| Ride started | ✅ `POST /rides/:id/start` |
| Real-time location tracking | ✅ Socket.IO relay to passenger |
| Ride completed + payment | ✅ Final price calc, driver earnings, wallet settlement |
| Passenger no-show | ✅ `no-show-monitor.ts` auto-cancels with charge |
| Rating submission | ✅ `POST /ratings` |
| Driver rating recalculation | ❌ NOT IMPLEMENTED |

### Driver System
| Feature | Status |
|---|---|
| Driver registration + profile | ✅ |
| Document upload + verification | ✅ (manual admin approval) |
| Go online / offline via socket | ✅ |
| Real-time location broadcasting | ✅ |
| Dispatch scoring (5 features) | ✅ |
| Selfie check-in (periodic) | ✅ |
| Earnings tracking | ✅ |
| Cooldown / suspension | ✅ |
| Weekly shuttle slot booking | ✅ |

---

## 6. Critical Issues

### 🔴 High Severity

#### 1. No Redis Adapter for Socket.IO
**Issue:** Socket.IO server has no Redis or cluster adapter. All socket state is in-memory on a single process.  
**Impact:** Any horizontal scaling attempt (multiple API server instances behind a load balancer) will cause drivers to be invisible to passengers on other instances. Dispatch round-robin notifications will silently fail for cross-instance driver/passenger pairs.  
**Recommendation:** Install and configure `@socket.io/redis-adapter` before any multi-instance deployment.

#### 2. Supabase Dependency in Check-In Route
**Issue:** `checkin.ts` hard-requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars and creates a Supabase client at module import time. If these are not set, the server will not crash immediately — but the first check-in request will fail with an unclear error.  
**Impact:** Driver selfie check-in is completely broken without Supabase credentials, even in development.  
**Recommendation:** Add startup validation for these env vars and fail fast if missing.

#### 3. Hardcoded Super-Admin Password in Source Code
**Issue:** `lib/seed.ts` contains:  
```ts
const SUPER_ADMIN_PASSWORD = "pass123";
```  
**Impact:** Any developer or attacker with repo access can immediately log in as super-admin in any environment that hasn't changed the password.  
**Recommendation:** Read password from an environment variable (`SUPER_ADMIN_PASSWORD`) and fail if not set in production.

#### 4. Driver Rating Never Updated After Ride
**Issue:** `driversTable.rating` defaults to 5.0 and there is no code path that recalculates it when a new rating is submitted via `POST /ratings`.  
**Impact:** Driver ratings are permanently 5.0 for all drivers regardless of passenger feedback. The ratings system appears to work but has no effect on driver scores or dispatch scoring.

#### 5. No Test Coverage
**Issue:** Zero test files found despite `vitest` being configured.  
**Impact:** No automated regression protection. Business-critical logic (dispatch, surge pricing, wallet transactions) is entirely untested.

---

### 🟡 Medium Severity

#### 6. `suggestions` Page Not Routed
**Issue:** `src/pages/suggestions.tsx` exists but is not registered in `App.tsx` routes.  
**Impact:** Admins cannot access pending route suggestions from the dashboard UI.

#### 7. No Admin Ride Management Page
**Issue:** `GET /admin/rides` and `GET /admin/rides/:id` backend endpoints are fully functional but no dashboard page consumes them.  
**Impact:** On-demand ride issues (disputes, cancellations, fraud) cannot be investigated from the admin dashboard.

#### 8. Map Tile Configuration
**Issue:** `MapLibreMap.tsx` uses MapLibre GL which requires a tile server URL (typically from MapTiler, MapBox, or self-hosted). No tile API key configuration is visible in the codebase.  
**Impact:** The live tracking map will render a blank background in any environment without a preconfigured tile source.

#### 9. Wallet Top-Up Has No Payment Gateway
**Issue:** Manual wallet top-up exists but no real card payment processing. Users cannot independently add funds.  
**Impact:** The platform cannot operate commercially without an external top-up flow. This is a known gap (not an oversight).

#### 10. Card Payments Stored But Not Processable
**Issue:** `payments.method` accepts `"card"` and it appears in the admin payments filter UI, but no endpoint processes card payments.  
**Impact:** Misleading — the schema and UI suggest card support exists, but it does not.

---

### 🟢 Low Severity / Architecture Observations

#### 11. Dual Map Libraries
Both `maplibre-gl` and `leaflet` + `react-leaflet` are installed as dependencies. Both are used in different pages. This adds ~500 KB to the bundle and creates inconsistency.

#### 12. `as any` Casts in Rides Route
Multiple `as any` type casts in `rides.ts` for pricing and ride update objects bypass TypeScript's safety net. These should be typed properly.

#### 13. Settings Lack Validation
The generic settings system (`settings.ts`) stores any JSON value. Dispatch config (radius steps, batch size, peak windows) can be corrupted by entering invalid values through the settings UI with no server-side schema validation.

#### 14. Error Handling in Background Jobs
Several background jobs use fire-and-forget DB updates (`.catch(logger.error)`) for non-critical stat increments. This is acceptable for counters but should be clearly documented to avoid confusion with genuinely critical paths.

---

## 7. Final Summary

### Honest Assessment

**The VeeGo Shuttle System is a sophisticated, production-grade backend** in most respects. The core engine — smart dispatch, surge pricing, shuttle lifecycle, wallet system, and real-time communication — is **deeply implemented** and shows strong engineering quality: atomic transactions, race-condition protection, dispatch cycle recovery on restart, in-memory caching with DB persistence, and feature flags via settings.

The admin dashboard is **comprehensive** with 30+ pages covering almost every operational concern. The generated typed API client ensures the frontend stays in sync with the backend schema.

**However, the system is not yet deployable for commercial use due to:**

1. **No real payment gateway** — The wallet system exists but users cannot load funds without an external top-up mechanism.
2. **No SMS in production** — Defaults to console logging. OTP and password reset silently fail without Twilio credentials.
3. **No horizontal scaling** — Socket.IO lacks a Redis adapter, making multi-server deployment dangerous.
4. **Zero test coverage** — All business-critical paths are untested.
5. **Driver ratings non-functional** — New ratings are recorded but never applied to driver scores.
6. **Supabase required for check-in** — Feature breaks entirely without credentials.

**Overall Maturity Estimate:**
- Backend API completeness: **~85%**
- Admin Dashboard completeness: **~80%**
- Production readiness: **~55%** (blocked on payment gateway, SMS, scaling, and testing)
- Code quality: **High** — well-structured, consistently typed, good separation of concerns

---

*End of report.*
