# VeeGo Backend — Deep Technical Audit
**Date:** 2026-06-12  
**Scope:** `artifacts/api-server` (Node.js + Express + Drizzle ORM) + `artifacts/admin-dashboard` (React + Vite) + `lib/db` (PostgreSQL schema)

---

## 1. Project Structure

### Monorepo Layout

| Path | Purpose |
|------|---------|
| `artifacts/api-server/` | Main Express API server + Socket.io |
| `artifacts/api-server/src/index.ts` | Entry point — starts HTTP server + Socket.io |
| `artifacts/api-server/src/app.ts` | Express app config — CORS, Helmet, rate limiting, Swagger |
| `artifacts/api-server/src/routes/` | All API route handlers (32 files) |
| `artifacts/api-server/src/middlewares/auth.ts` | JWT `authenticate` + `requireRole` middleware |
| `artifacts/api-server/src/lib/` | Background jobs, dispatch, surge pricing, socket events, SMS, etc. |
| `artifacts/api-server/src/socket.ts` | Socket.io server setup + real-time event handlers |
| `artifacts/admin-dashboard/` | React + Vite admin SPA |
| `artifacts/admin-dashboard/src/pages/` | 35+ admin pages |
| `artifacts/admin-dashboard/src/api/client.ts` | Generated API client |
| `lib/db/` | Drizzle ORM schema + migrations + seed scripts |
| `lib/db/src/schema/` | 35 schema files (one table per file) |
| `lib/api-spec/openapi.yaml` | OpenAPI spec (source of truth for codegen) |
| `lib/api-client-react/` | Generated React Query hooks |
| `lib/api-zod/` | Generated Zod validation types |

### Dead / Potentially Unused Files

| File | Issue |
|------|-------|
| `artifacts/api-server/src/routes/driver.ts` → `/drivers/me` & `/drivers/me/location` | Both marked `// TODO (deprecated)` — superseded by `/driver/me` |
| `artifacts/api-server/src/lib/face-detection.ts` | Exists in lib folder; not imported anywhere in routes — dead code |
| `lib/db/src/schema/rideShareTokens.ts` | Schema defined, never used in any route |
| `lib/db/src/schema/userLocations.ts` | Schema exists; no route uses it |
| `lib/db/src/schema/serviceSettings.ts` | Duplicate settings system alongside `admin.ts` settings (two competing systems) |
| `artifacts/api-server/src/routes/locations.ts` | Unclear overlap with `driver.ts` location update |

---

## 2. Database

### Technology
- **PostgreSQL** via **Drizzle ORM** (type-safe, no raw SQL except analytics queries)
- Connection managed in `lib/db/src/index.ts` via `DATABASE_URL` environment variable
- Migrations run via `drizzle-kit`

### All Models / Tables

| Table | Key Fields | Purpose |
|-------|-----------|---------|
| `users` | id, name, email, phone, password, role (user/driver/admin), walletBalance, isVerified, isBlocked, otpCode, refreshToken, pushToken, staffRoleId | All platform users (passengers, drivers, admins) |
| `drivers` | id, userId→users, name, phone, licenseNumber, nationalId, rating, assignedBusId→buses, vehicleType, currentLat/Lng/Speed/Heading, isOnline, status, totalDispatched, totalAccepted, consecutiveRejections, cooldownUntil, checkInRequired | Driver profiles and dispatch state |
| `buses` | id, plateNumber, model, capacity, isActive, driverId | Shuttle vehicle inventory |
| `routes` | id, name, fromLocation, toLocation, estimatedDuration, basePrice, isActive | Shuttle fixed lines |
| `stations` | id, routeId→routes, name, order, lat, lng, segmentPrice | Stops along a shuttle route |
| `trips` | id, routeId, driverId, busId, departureTime, arrivalTime, status, availableSeats, totalSeats, price, vehicleType, scheduleId, recurringType, startedAt, completedAt, cancelledAt, cancelReason | Specific trip instances |
| `bookings` | id, userId, tripId, seatCount, totalPrice, status, paymentStatus, promoCodeId | Passenger shuttle bookings |
| `driverShuttleBookings` | id, driverId, routeId, timeSlotId, weekStart, weekEnd, status, renewalNotifiedAt, renewalDeadline | Driver weekly route bookings |
| `routeSchedules` | id, routeId, frequency (daily/weekdays/etc.), startTime, endTime | Recurring trip generation config |
| `routeTimeSlots` | id, routeId, departureTime (HH:MM), isActive | Fixed time slots per route (used in driver booking) |
| `rides` | id, passengerId, driverId, vehicleType, pickup/dropoff lat/lng/address, distanceKm, estimatedPrice, finalPrice, waitingCharge, status, cancelReason, timestamps | On-demand ride requests (Car/Scooter/Delivery) |
| `ridePricing` | id, vehicleType, baseFare, perKmRate, perMinuteRate, minimumFare, isActive | Global pricing per vehicle type |
| `rideDispatchState` | id, rideId, round, driversOffered | Tracks dispatch rounds for a ride |
| `rideEvents` | id, rideId, type, metadata, createdAt | Audit trail for every ride state change |
| `rideShareTokens` | id, rideId, token, expiresAt | Ride share links — **schema only, no route uses it** |
| `zones` | id, name, description, centerLat, centerLng, radiusKm, services, isActive | Geographic pricing zones |
| `zonePricing` | id, zoneId→zones, vehicleType, baseFare, perKmRate, minimumFare, isActive | Zone-specific pricing overrides |
| `payments` | id, userId, bookingId, rideId, amount, method, status, notes | All payment records |
| `walletTransactions` | id, userId, amount, type (deposit/payment/refund), description | Wallet ledger |
| `driverEarnings` | id, driverId, rideId, tripId, amount, date, status | Driver commission payouts |
| `driverDocuments` | id, driverId, type (national_id/license/criminal_record/etc.), fileUrl, mimeType, verificationStatus, adminNotes | Driver document uploads |
| `driverCheckins` | id, driverId, tripId, selfieUrl, status, createdAt | Pre-trip selfie check-ins |
| `driverLocations` | id, driverId, lat, lng, speed, heading, timestamp | Historical location log (populated via job queue) |
| `notifications` | id, userId, title, body, isRead, createdAt | In-app notifications |
| `ratings` | id, raterId, driverId, rideId, tripId, context, score, comment | Passenger ratings for rides/trips |
| `shuttleRatings` | id, userId, driverId, tripId, score, comment | Shuttle-specific ratings (duplicate of ratings?) |
| `shuttleOffences` | id, userId, actorType, offenceCount, lastAction, lastOffenceAt | No-show/offence tracking |
| `promoCodes` | id, code, discountType, discountValue, maxUsage, usedCount, expiryDate, isActive | Promotional codes |
| `auditLogs` | id, userId, action, entityType, entityId, oldData, newData, ipAddress, userAgent | Admin action trail |
| `chatMessages` | id, rideId/tripId, senderId, senderRole, content, createdAt | In-trip & support chat |
| `support` | id, userId, subject, message, status, adminReply, createdAt | Support tickets |
| `suggestions` | id, userId, content, createdAt | User suggestions |
| `settings` | key (text, PK), value | Key-value store for dynamic settings |
| `serviceControls` | id, serviceType, isEnabled, displayMode, unavailableMessage, unavailableAction, maintenanceEta, maxActiveRides | Per-service on/off controls |
| `serviceSettings` | id, serviceType, minDriverRating, requiredLicenseTypes, requireInsurance, requireBackgroundCheck, maxActiveRidesPerDriver | Per-service driver requirements |
| `serviceControlLogs` | id, serviceType, changedBy, changes, changedAt | Log of service control changes |
| `staffRoles` | id, name, permissions (jsonb) | Granular admin RBAC roles |
| `sosEvents` | id, rideId, passengerId, lat, lng, resolvedAt | SOS/panic button events |
| `tripStationProgress` | id, tripId, stationId, status, arrivedAt, completedAt | Per-station progress during active trips |
| `tripEvents` | id, tripId, type, metadata, createdAt | Shuttle trip audit trail |
| `vehicles` | id, driverId, plateNumber, make, model, year, color, vehicleType, status, isActive | Ride-hail vehicle registry (separate from buses) |
| `sosEvents` | id, rideId, passengerId, lat, lng, resolvedAt | Safety SOS events |

### Key Relationships
- `users` ← `drivers` (1:1, cascades on delete)
- `drivers` → `buses` (many:1, shuttle drivers assigned to a bus)
- `routes` → `stations` (1:many)
- `trips` → `routes`, `drivers`, `buses` (many:1 each)
- `bookings` → `trips`, `users` (many:1 each)
- `rides` → `users` (passenger), `drivers` (many:1 each)
- `walletTransactions` → `users` (many:1)
- `driverDocuments` → `drivers` (many:1)

### Missing / Flagged Models
- ❓ **`shuttleRatings`** vs **`ratings`** — two separate rating tables exist; only `ratings` is used in the driver ratings endpoint. `shuttleRatings` appears to be a legacy duplicate.
- ❌ **No `vehicleCategories` table** — the spec requires Economy / Economy Plus / Comfort categories by year range for Car service. Not implemented at the DB or API level.
- ❌ **No `vehicleBrands` / `vehicleModels` table** — spec calls for brand/model/year system; only free-text `make`/`model` fields on `vehicles`.
- ❌ **`rideShareTokens`** — schema defined but zero routes reference it.
- ❓ **`serviceSettings`** in `serviceControls.ts` vs legacy `service:${type}` key-value in `admin.ts` — two systems manage service settings simultaneously.

---

## 3. API Endpoints

> All routes are prefixed with `/api`. Admin routes require `Bearer <token>` with `role = "admin"`.

### Authentication (`auth.ts`, `driver.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| POST | `/auth/register` | None | Register a new passenger | ✅ |
| POST | `/auth/login` | None | Passenger/User login (blocks admin role) | ✅ |
| POST | `/auth/admin/login` | None | Admin-only login portal | ✅ |
| POST | `/auth/refresh` | None | Rotate access + refresh tokens | ✅ |
| GET | `/auth/me` | JWT | Deprecated alias for `GET /users/me` | ⚠️ Deprecated |
| POST | `/auth/send-otp` | None | Send OTP via SMS to phone | ⚠️ Requires `SMS_PROVIDER=twilio`; falls back to console log |
| POST | `/auth/verify-otp` | None | Verify OTP code — marks user as verified | ✅ |
| POST | `/auth/forgot-password` | None | Send password-reset code via SMS | ⚠️ Requires Twilio |
| POST | `/auth/reset-password` | None | Reset password with token | ✅ |
| POST | `/driver/auth/register` | None | Register new driver account | ✅ |
| POST | `/driver/auth/login` | None | Driver login | ✅ |
| POST | `/driver/auth/logout` | JWT(driver) | Logout + set driver offline | ✅ |

### Driver Profile & Operations (`driver.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/driver/me` | JWT(driver) | Get own driver profile | ✅ |
| PATCH | `/driver/me` | JWT(driver) | Update name, phone, license, vehicleType | ✅ |
| GET | `/driver/me/vehicle` | JWT(driver) | Get assigned bus / vehicle type | ✅ |
| GET | `/driver/me/documents` | JWT(driver) | List own uploaded documents | ✅ |
| POST | `/driver/me/documents` | JWT(driver) | Submit doc by URL (driver-side, no upload) | ⚠️ Accepts URL — no Supabase upload here |
| GET | `/driver/me/ratings` | JWT(driver) | Own ratings + earnings stats | ✅ |
| GET | `/driver/me/status` | JWT(driver) | Current online/offline/location status | ✅ |
| GET | `/driver/me/settings` | JWT(driver) | Driver settings (vehicleType, notifications) | ✅ |
| PATCH | `/driver/me/settings` | JWT(driver) | Update driver settings | ✅ |
| PATCH | `/driver/status/online` | JWT(driver) | Set driver online | ✅ |
| PATCH | `/driver/status/offline` | JWT(driver) | Set driver offline | ✅ |
| PATCH | `/driver/location` | JWT(driver) | REST fallback location update | ✅ |
| GET | `/driver/trips` | JWT(driver) | List own assigned shuttle trips | ✅ |
| GET | `/driver/trips/:id` | JWT(driver) | Trip detail with passenger manifest | ✅ |
| PATCH | `/driver/trips/:id/accept` | JWT(driver) | Accept assigned shuttle trip | ✅ |
| PATCH | `/driver/trips/:id/cancel` | JWT(driver) | Cancel an assigned trip | ✅ |
| PATCH | `/driver/trips/:id/start` | JWT(driver) | Mark trip as started (boarding) | ✅ |
| PATCH | `/driver/trips/:id/complete` | JWT(driver) | Mark trip complete + record earnings | ✅ |
| PATCH | `/driver/trips/:id/station/:stationId/arrive` | JWT(driver) | Mark arrival at station | ✅ |
| PATCH | `/driver/trips/:id/station/:stationId/complete` | JWT(driver) | Mark station boarding complete | ✅ |
| GET | `/driver/earnings` | JWT(driver) | Own earnings list | ✅ |
| GET | `/driver/earnings/summary` | JWT(driver) | Earnings summary by period | ✅ |

### Admin — Drivers (`drivers.ts`, `admin.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/drivers` | JWT(admin) | List all active drivers (paginated) | ✅ |
| POST | `/drivers` | JWT(admin) | Create driver record | ✅ |
| GET | `/drivers/me` | JWT(driver) | **Deprecated** — use `/driver/me` | 🗑️ |
| PATCH | `/drivers/me/location` | JWT(driver) | **Deprecated** — use `/driver/location` | 🗑️ |
| GET | `/drivers/:id` | JWT(admin) | Get driver by ID | ✅ |
| PATCH | `/drivers/:id` | JWT(admin) | Update driver | ✅ |
| DELETE | `/drivers/:id` | JWT(admin) | Soft-delete driver (sets isActive=false) | ✅ |
| GET | `/admin/drivers` | JWT(admin) | Full driver list with user info joined | ✅ |
| GET | `/admin/drivers/live` | JWT(admin) | All active drivers + active trip info | ✅ |
| GET | `/admin/drivers/dispatch-stats` | JWT(admin) | Dispatch metrics per driver | ✅ |
| POST | `/admin/drivers/:id/clear-cooldown` | JWT(admin) | Manually clear dispatch cooldown | ✅ |
| POST | `/admin/drivers/:id/suspend` | JWT(admin) | Suspend driver | ✅ |
| POST | `/admin/drivers/:id/unsuspend` | JWT(admin) | Reactivate driver | ✅ |
| POST | `/admin/drivers/:id/force-offline` | JWT(admin) | Force driver offline | ✅ |
| GET | `/admin/driver-analytics` | JWT(admin) | Driver stats, top earners, recent earnings | ✅ |

### Shuttle — Passenger / Driver Facing (`shuttle.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/shuttle/lines` | JWT | All active routes with upcoming trips & driver booking status | ✅ |
| GET | `/shuttle/assignments` | None | All drivers with assigned bus + current trip | ⚠️ No auth guard |
| GET | `/shuttle/lines/:id` | None | Route detail with stations + upcoming trips | ✅ |
| GET | `/shuttle/trips/:id/passengers` | JWT | Passenger manifest for a trip | ✅ |
| GET | `/shuttle/lines/:id/passengers` | JWT | Passenger manifest via line ID | ✅ |
| POST | `/shuttle/bookings/:id/board` | JWT | Mark passenger as boarded + fire 1-min station timer | ✅ |
| POST | `/shuttle/trips/:id/rate` | JWT | Rate a completed shuttle trip | ✅ |
| GET | `/shuttle/timeslots/:routeId` | JWT | Available time slots for a route (week-aware) | ✅ |
| GET | `/shuttle/lines/:routeId/available-weeks` | JWT | Weeks with actual trips for driver booking | ✅ |
| POST | `/shuttle/route-bookings` | JWT(driver) | Driver books a weekly route+timeslot | ✅ |
| GET | `/shuttle/route-bookings` | JWT(driver) | Driver's own bookings | ✅ |
| DELETE | `/shuttle/route-bookings/:id` | JWT(driver) | Driver cancels own booking | ✅ |
| PATCH | `/shuttle/route-bookings/:id/renew` | JWT(driver) | Confirm priority renewal | ✅ |

### Shuttle — Admin (`shuttleTripsAdmin.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/admin/shuttle-trips` | JWT(admin) | All trips with joined route/driver/bus/seats | ✅ |
| GET | `/admin/shuttle-trips/:id` | JWT(admin) | Full trip detail: route, stations, passengers, progress | ✅ |
| GET | `/admin/shuttle/cash-debts` | JWT(admin) | Passengers with negative wallet balance | ✅ |
| PATCH | `/admin/shuttle/cash-debts/:userId/collect` | JWT(admin) | Mark cash debt as collected | ✅ |
| GET | `/admin/shuttle/offences` | JWT(admin) | All shuttle offences with filters | ✅ |
| PATCH | `/admin/shuttle/offences/:userId/reset` | JWT(admin) | Reset offence count | ✅ |
| GET | `/admin/shuttle/route-bookings` | JWT(admin) | All driver route bookings | ✅ |
| POST | `/admin/shuttle/route-bookings/:id/reassign` | JWT(admin) | Reassign booking to different driver | ✅ |

### Trips CRUD (`trips.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/trips` | None | List trips with filters | ✅ |
| POST | `/trips` | JWT(admin) | Create trip (reads bus capacity) | ✅ |
| GET | `/trips/:id` | None | Get trip by ID | ✅ |
| PATCH | `/trips/:id` | JWT(admin) | Update trip | ✅ |
| PATCH | `/trips/:id/cancel` | JWT(admin) | Cancel trip (no refund logic here) | ⚠️ Does not auto-refund bookings |
| DELETE | `/trips/:id` | JWT(admin) | Delete trip + its bookings | ⚠️ No refund on delete |

### Bookings (`bookings.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/bookings` | JWT(admin) | List all bookings | ✅ |
| POST | `/bookings` | JWT | Create booking — wallet deducted, auto-activation at minRequired | ✅ |
| GET | `/bookings/:id` | JWT | Get own booking (or any if admin) | ✅ |
| PATCH | `/bookings/:id/cancel` | JWT | Cancel booking + auto-refund to wallet | ✅ |

### Rides — On-Demand (`rides.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/admin/rides` | JWT(admin) | List all rides with passenger/driver | ✅ |
| GET | `/admin/rides/:id` | JWT(admin) | Ride detail + events | ✅ |
| GET | `/admin/rides/pricing` | JWT(admin) | Global pricing config | ✅ |
| PATCH | `/admin/rides/pricing/:vehicleType` | JWT(admin) | Update pricing (car or bike only) | ⚠️ Scooter/delivery have no separate pricing |
| POST | `/rides/estimate` | JWT | Price estimate with zone + surge pricing | ✅ |
| POST | `/rides/request` | JWT(user) | Request ride — wallet held, dispatch started | ✅ |
| PATCH | `/rides/:id/cancel` | JWT | Cancel searching/assigned ride + refund | ✅ |
| GET | `/rides` | JWT | List own rides (passenger) | ✅ |
| GET | `/rides/:id` | JWT | Get own ride detail | ✅ |
| POST | `/rides/:id/sos` | JWT | Trigger SOS event | ✅ |
| POST | `/rides/:id/rate` | JWT | Rate completed ride | ✅ |
| GET | `/driver/rides` | JWT(driver) | Driver's own ride history | ✅ |
| GET | `/driver/rides/:id` | JWT(driver) | Driver ride detail | ✅ |
| PATCH | `/driver/rides/:id/accept` | JWT(driver) | Accept dispatched ride offer | ✅ |
| PATCH | `/driver/rides/:id/reject` | JWT(driver) | Reject dispatched ride | ✅ |
| PATCH | `/driver/rides/:id/arrived` | JWT(driver) | Mark arrived at pickup | ✅ |
| PATCH | `/driver/rides/:id/start` | JWT(driver) | Start ride (departs pickup) | ✅ |
| PATCH | `/driver/rides/:id/complete` | JWT(driver) | Complete ride + release held funds | ✅ |
| PATCH | `/driver/rides/:id/cancel` | JWT(driver) | Driver cancels ride | ✅ |

### Wallet (`wallet.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/wallet` | JWT | Current wallet balance | ✅ |
| GET | `/wallet/transactions` | JWT | Own transaction history | ✅ |
| POST | `/wallet/topup` | JWT | Top-up wallet (no payment gateway — free top-up) | ⚠️ No payment gateway — any user can self-top-up |
| GET | `/admin/wallet/transactions` | JWT(admin) | All transactions with filters | ✅ |
| POST | `/admin/wallet/refund` | JWT(admin) | Admin manual refund | ✅ |

### Routes (Shuttle Lines) (`routes.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/routes` | JWT(admin) | List routes | ✅ |
| POST | `/routes` | JWT(admin) | Create route | ✅ |
| GET | `/routes/:id` | JWT(admin) | Get route + stations | ✅ |
| PATCH | `/routes/:id` | JWT(admin) | Update route | ✅ |
| DELETE | `/routes/:id` | JWT(admin) | Delete route | ✅ |
| POST | `/routes/:id/stations` | JWT(admin) | Add station to route | ✅ |
| PATCH | `/routes/:routeId/stations/:stationId` | JWT(admin) | Update station | ✅ |
| DELETE | `/routes/:routeId/stations/:stationId` | JWT(admin) | Delete station | ✅ |

### Buses (`buses.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/buses` | JWT(admin) | List buses | ✅ |
| POST | `/buses` | JWT(admin) | Create bus | ✅ |
| GET | `/buses/:id` | JWT(admin) | Get bus | ✅ |
| PATCH | `/buses/:id` | JWT(admin) | Update bus | ✅ |
| DELETE | `/buses/:id` | JWT(admin) | Delete bus | ✅ |

### Vehicles (Car/Scooter Registry) (`vehicles.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/vehicles` | JWT(admin) | List vehicles with driver info | ✅ |
| POST | `/vehicles` | JWT(admin) | Register vehicle | ✅ |
| GET | `/vehicles/:id` | JWT(admin) | Get vehicle | ✅ |
| PATCH | `/vehicles/:id` | JWT(admin) | Update vehicle | ✅ |
| DELETE | `/vehicles/:id` | JWT(admin) | Delete vehicle | ✅ |

### Users (`users.ts`, `admin.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/users/me` | JWT | Own user profile + permissions | ✅ |
| PATCH | `/users/me` | JWT | Update own profile | ✅ |
| GET | `/admin/users` | JWT(admin) | Paginated user list with search/role filter | ✅ |
| GET | `/admin/users/search` | JWT(admin) | Quick user search | ✅ |
| GET | `/admin/users/:id` | JWT(admin) | Get user by ID | ✅ |
| PATCH | `/admin/users/:id` | JWT(admin) | Update user | ✅ |
| PATCH | `/admin/users/:id/toggle-block` | JWT(admin) | Block / unblock user | ✅ |

### Document Upload (`driverDocuments.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/driver-documents` | JWT(admin) | List all docs with filters | ✅ |
| GET | `/driver-documents/stats` | JWT(admin) | Pending/approved/rejected counts | ✅ |
| GET | `/driver-documents/by-driver/:driverId` | JWT(admin) | All docs for a driver | ✅ |
| POST | `/driver-documents/upload/:driverId` | JWT | Upload file to Supabase storage | ⚠️ Depends on `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| PATCH | `/driver-documents/:id` | JWT(admin) | Approve/reject document | ✅ |

### Notifications (`notifications.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/notifications` | JWT | Own notifications (paginated) | ✅ |
| POST | `/notifications` | JWT(admin) | Create notification for a user | ✅ |
| PATCH | `/notifications/:id/read` | JWT | Mark notification as read | ✅ |
| PATCH | `/notifications/read-all` | JWT | Mark all notifications as read | ✅ |
| GET | `/admin/notifications/history` | JWT(admin) | All notifications history | ✅ |
| POST | `/admin/notifications/broadcast` | JWT(admin) | Broadcast with targeting filters | ✅ |

### Pricing & Zones

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/zones` | JWT(admin) | List geographic zones | ✅ |
| POST | `/zones` | JWT(admin) | Create zone | ✅ |
| GET | `/zones/:id` | JWT(admin) | Get zone | ✅ |
| PATCH | `/zones/:id` | JWT(admin) | Update zone | ✅ |
| DELETE | `/zones/:id` | JWT(admin) | Delete zone | ✅ |
| GET | `/zone-pricing` | JWT(admin) | List zone pricing rules | ✅ |
| POST | `/zone-pricing` | JWT(admin) | Create zone pricing rule | ✅ |
| PATCH | `/zone-pricing/:id` | JWT(admin) | Update zone pricing rule | ✅ |
| DELETE | `/zone-pricing/:id` | JWT(admin) | Delete zone pricing rule | ✅ |

### Service Controls (`serviceControls.ts`)

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/services/control` | JWT | All service controls (public shape) | ✅ |
| GET | `/services/:type/control` | JWT | Single service control | ✅ |
| GET | `/services/:type/settings` | JWT | Single service settings | ✅ |
| GET | `/admin/services/:type/control` | JWT(admin) | Admin view + change logs | ✅ |
| PATCH | `/admin/services/:type/control` | JWT(admin) | Toggle service on/off | ✅ |
| POST | `/admin/services/:type/control/reset` | JWT(admin) | Reset to defaults | ✅ |
| GET | `/admin/services/:type/settings` | JWT(admin) | Admin service settings | ✅ |
| PATCH | `/admin/services/:type/settings` | JWT(admin) | Update driver requirements | ✅ |

### Admin — Analytics & Dashboard

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/admin/analytics` | JWT(admin) | KPIs: users, revenue, bookings by status, revenueByDay | ✅ |
| GET | `/admin/driver-analytics` | JWT(admin) | Driver stats + top earners | ✅ |
| GET | `/dashboard` | JWT(admin) | Summary stats (may overlap with analytics) | ✅ |
| GET | `/admin/settings/commission` | JWT(admin) | Commission settings | ✅ |
| PATCH | `/admin/settings/commission` | JWT(admin) | Update commission | ✅ |
| GET | `/admin/surge-settings` | JWT(admin) | Surge config + live state | ✅ |
| PATCH | `/admin/surge-settings` | JWT(admin) | Update surge config | ✅ |
| GET | `/admin/queue/status` | JWT(admin) | Background job queue status + dead-letter queue | ✅ |
| POST | `/admin/queue/retry/:jobId` | JWT(admin) | Retry single dead-letter job | ✅ |
| POST | `/admin/queue/retry-all` | JWT(admin) | Retry all dead-letter jobs | ✅ |

### Other Routes

| Method | Path | Auth | Description | Status |
|--------|------|------|-------------|--------|
| GET | `/health` | None | Health check | ✅ |
| GET | `/admin/audit-logs` | JWT(admin) | Paginated audit log | ✅ |
| GET/POST/PATCH | `/promo` | JWT(admin) | Promo code CRUD | ✅ |
| POST | `/promo/validate` | JWT | Validate promo code | ✅ |
| GET/POST/PATCH | `/schedules` | JWT(admin) | Route schedule CRUD | ✅ |
| GET/POST/PATCH/DELETE | `/staff` | JWT(admin) | Staff role management | ✅ |
| GET/POST/PATCH | `/ratings` | JWT | Ratings CRUD + admin list | ✅ |
| GET/POST/PATCH | `/support` | JWT | Support ticket system | ✅ |
| GET/POST | `/chat` | JWT | Trip/ride chat messages | ✅ |
| GET | `/track/:tripId` | JWT | Real-time trip tracking subscribe | ✅ |
| GET/POST | `/suggestions` | JWT | User suggestions | ✅ |
| GET | `/checkin` | JWT(admin) | Driver check-in management | ✅ |
| POST | `/checkin/:driverId/approve` | JWT(admin) | Approve driver check-in | ✅ |
| POST | `/checkin/:driverId/reject` | JWT(admin) | Reject driver check-in | ✅ |
| GET | `/payments` | JWT(admin) | All payments | ✅ |
| GET | `/earnings` | JWT(admin) | All driver earnings | ✅ |

---

## 4. Socket / Real-Time

### Architecture
- **Socket.io** attached to the HTTP server
- Rooms: `admin:room`, `passenger:{userId}`, `driver:{userId}`, `drivers:available:{vehicleType}`, `trip:{tripId}`, `passengers:all`
- Clients authenticate via `JOIN` event sending their JWT token

### Event Reference

| Event Name | Direction | Description | Status |
|------------|-----------|-------------|--------|
| `join` | C→S | Client sends JWT to authenticate + join personal room | ✅ |
| `driver:location:update` | C→S | Driver sends bulk location update (GPS stream) | ✅ |
| `driver:ride:location` | C→S | Driver sends location update specifically for an active ride | ✅ |
| `passenger:join:trip` | C→S | Passenger subscribes to trip tracking room | ✅ |
| `driver:trip:start` | C→S | Driver marks trip start via socket | ✅ |
| `driver:trip:complete` | C→S | Driver marks trip complete via socket | ✅ |
| `driver:status:online/offline/busy` | C→S | Driver status change via socket | ✅ |
| `ride:driver_assigned` | S→Passenger | Driver accepted ride | ✅ |
| `ride:driver_arrived` | S→Passenger | Driver at pickup | ✅ |
| `ride:driver_location` | S→Passenger | Live driver location during ride | ✅ |
| `ride:started` | S→Passenger | Ride began | ✅ |
| `ride:completed` | S→Passenger | Ride ended | ✅ |
| `ride:cancelled` | S→Passenger | Ride cancelled | ✅ |
| `ride:driver_cancelled` | S→Passenger | Driver cancelled | ✅ |
| `ride:no_show_cancelled` | S→Passenger | Ride cancelled due to no-show | ✅ |
| `ride:waiting:charge:started/updated/capped` | S→Passenger | Waiting time charge events | ✅ |
| `ride:offer` | S→Driver | New ride offer dispatched to driver | ✅ |
| `ride:offer_expired` | S→Driver | Offer window expired | ✅ |
| `ride:no_longer_available` | S→Driver | Ride was taken by another driver | ✅ |
| `ride:status_update` | S→Driver | General ride status update | ✅ |
| `ride:deviation:warning` | S→Admin+Passenger | Driver went >500m off route | ✅ |
| `notification:new` | S→Passenger/Driver | Push a new in-app notification | ✅ |
| `booking:boarded` | S→Passenger | Passenger marked as boarded on shuttle | ✅ |
| `admin:track:trip` | S→Admin | Live trip tracking update | ✅ |
| `passenger:trip:tracking` | S→TripRoom | Broadcast driver location to trip subscribers | ✅ |
| `trip:chat:message` | S→TripRoom | New chat message in trip | ✅ |
| `admin:chat:new` | S→Admin | New chat message alert | ✅ |
| `surge:updated` | S→All Passengers | Surge pricing changed | ✅ |
| `service:control:changed` | S→All | Service enabled/disabled | ✅ |
| `service:settings:changed` | S→All | Service settings changed | ✅ |
| `driver:checkin:required` | S→Driver | Check-in selfie prompt | ✅ |
| `driver:checkin:approved/rejected` | S→Driver | Check-in result | ✅ |
| `driver:cooldown:cleared` | S→Driver | Dispatch cooldown lifted | ✅ |
| `driver:location:ack` | S→Driver | Location update acknowledged | ✅ |
| `shuttle:booking:created/cancelled/reassigned` | S→Driver | Driver weekly booking events | ✅ |
| `shuttle:renewal:confirmed` | S→Driver | Priority renewal confirmed | ✅ |
| `shuttle:driver:location` | S→Passenger | Driver location during 20-min pre-departure window | ✅ |
| `shuttle:checkin:required` | S→Driver | Pre-trip selfie required | ✅ |
| `shuttle:station:timeout` | S→Driver | 1-min station boarding timeout alert | ✅ |
| `sos:triggered` | S→Admin+Passenger | SOS event fired | ✅ |
| `error` | S→Client | Socket error | ✅ |

### Missing Socket Events
- ❌ **No push notifications** (FCM/APNs) — `users.pushToken` field exists but is never used to send actual mobile push notifications. All "push" is socket-only (in-app only).

---

## 5. Authentication & Security

### Implementation
- **JWT** with dual tokens: short-lived access token (HS256) + long-lived refresh token
- Refresh tokens stored in DB (`users.refreshToken`); rotation on each refresh
- Role-based: `user`, `driver`, `admin`
- Granular staff permissions via `staffRoles` table (JSONB `permissions` array)
- `requirePermission(permission)` middleware for sub-admin access control

### Auth Guard Coverage

| Route Group | Guard | Notes |
|-------------|-------|-------|
| Passenger auth routes | None (open) | Correct |
| `/admin/*` routes | `authenticate` + `requireRole("admin")` | ✅ Correct |
| `/driver/*` routes | `authenticate` + `requireRole("driver")` | ✅ Correct |
| `/shuttle/assignments` | **None** | ❌ Exposes all driver names, phones, bus info publicly |
| `/trips` (GET) | None | ⚠️ Trip list + details are public with no auth |
| `/shuttle/lines` (GET) | JWT | ✅ |
| `/shuttle/lines/:id` (GET) | None | ⚠️ Route detail including stations — publicly accessible |

### OTP / SMS
- OTP flow is **real** — generates a 6-digit code, stores in DB with 10-minute expiry
- SMS delivery requires `SMS_PROVIDER=twilio` + Twilio credentials
- Default (no config): SMS falls back to `console.log` — **OTPs are NOT delivered in production without Twilio credentials**
- Password reset uses the same SMS mechanism

### Security Issues
| # | Issue | Severity |
|---|-------|----------|
| 1 | `GET /shuttle/assignments` has no auth guard — exposes driver names, phones, bus assignments | 🔴 High |
| 2 | `POST /wallet/topup` accepts any positive amount with no payment gateway — users can self-add unlimited funds | 🔴 High |
| 3 | `GET /trips` and `GET /shuttle/lines/:id` are publicly accessible without authentication | 🟡 Medium |
| 4 | SMS OTP silently falls back to console log when Twilio is not configured — no error surface to the operator | 🟡 Medium |
| 5 | `PATCH /admin/rides/pricing/:vehicleType` only accepts `car` or `bike` — scooter/delivery pricing cannot be updated via API | 🟡 Medium |
| 6 | Refresh tokens are stored plaintext in the DB (not hashed) | 🟡 Medium |

---

## 6. Services Implementation Status

### 6.1 Shuttle (Shatel)

| Feature | Status | Notes |
|---------|--------|-------|
| Routes (Lines) CRUD | ✅ Fully built | `/routes`, `/shuttle/lines` |
| Stations per route | ✅ Fully built | Ordered, with optional `segmentPrice` |
| Trip scheduling (admin creates trips) | ✅ Fully built | Departure/arrival times, bus assignment |
| Recurring trip schedules | ⚠️ Partial | `routeSchedules` schema exists; auto-generation from schedules is in `shuttle-renewal-job.ts` — not fully verified end-to-end |
| Seat capacity (HiAce=14, MiniBus=28) | ⚠️ Partial | `VEHICLE_CAPACITY` constants exist in DB; shuttle.ts hardcodes `SHUTTLE_TOTAL_SEATS=14` and `SHUTTLE_MIN_REQUIRED=7` — does not use dynamic vehicle type lookup in all places |
| Minimum passenger auto-activation (7/14) | ✅ Built | `bookings.ts`: when `totalBooked >= shuttleMinRequired`, trip flips to `active` |
| 10-hour cancellation rule | ✅ Built | `shuttle-job.ts`: trips within 10-hour window that don't meet minimum are auto-cancelled |
| Driver weekly booking system | ✅ Built | `shuttleBookings.ts` — full week-slot booking with conflict detection |
| Driver conflict detection (time+geo) | ✅ Built | DB constraint + pre-check in `shuttleBookings.ts` |
| Driver trip transfer/reassignment | ✅ Built | `/admin/shuttle/route-bookings/:id/reassign` |
| Station arrival/completion tracking | ✅ Built | `tripStationProgress` table + driver endpoints |
| 1-min station boarding timer | ✅ Built | In-memory `stationTimers` Map + Socket event |
| Driver check-in (selfie 10-min before) | ✅ Built | `checkin-monitor.ts` + `/checkin` routes |
| No-show detection (passenger/driver) | ✅ Built | `no-show-monitor.ts` + `driver-noshow-monitor.ts` |
| Shuttle offences tracking | ✅ Built | `shuttleOffences` table + admin endpoints |
| Cash debt management | ✅ Built | `/admin/shuttle/cash-debts` |
| Priority renewal for drivers | ✅ Built | `shuttle-renewal-job.ts` + renewal endpoints |
| Service toggle from admin | ✅ Built | `serviceControls` with type=`shuttle` |

### 6.2 Car Service

| Feature | Status | Notes |
|---------|--------|-------|
| Ride request + dispatch | ✅ Fully built | Full smart dispatch with radius expansion, cooldown, fair distribution |
| Price estimate | ✅ Built | Zone pricing + global fallback + surge multiplier |
| Promo code support | ✅ Built | Both percentage and flat discount |
| Surge pricing | ✅ Built | Background job updates in-memory state every 5 minutes |
| Waiting time charge | ✅ Built | `waiting-timer.ts` |
| No-show timer | ✅ Built | `no-show-monitor.ts` |
| Ride deviation warning | ✅ Built | Socket event `ride:deviation:warning` |
| Zone pricing | ✅ Built | `zonePricing` table + haversine radius check |
| Car category system (Economy/Plus/Comfort by year) | ❌ Missing | Not implemented — only generic `vehicleType: "car"` |
| Vehicle brand/model/year lookup | ❌ Missing | Free-text `make`/`model` only |
| Service toggle from admin | ✅ Built | `serviceControls` with type=`car` |
| Cash payment mode | ❌ Missing | No cash payment logic — wallet-only |

### 6.3 Scooter Service

| Feature | Status | Notes |
|---------|--------|-------|
| Basic ride flow | ✅ Built | Uses same `rides` table with `vehicleType="bike"` |
| Pricing | ⚠️ Partial | `ridePricing` endpoint only accepts `car` or `bike`; scooter effectively maps to `bike` |
| Service toggle | ✅ Built | `serviceControls` with type=`scooter` / internal=`motorcycle` |
| Dedicated features | ❌ None | No scooter-specific logic differentiated from Car |

### 6.4 Delivery Service

| Feature | Status | Notes |
|---------|--------|-------|
| Basic ride flow | ⚠️ Partial | `serviceTypeMap` maps `delivery` → `delivery` in service control check, but `rides/request` only accepts `vehicleType: "car" or "bike"` — delivery rides cannot actually be requested |
| Service toggle | ✅ Built | `serviceControls` with type=`delivery` |
| Delivery-specific logic (parcel, recipient, etc.) | ❌ Missing | No dedicated delivery fields or flows |

---

## 7. Admin Dashboard

### Pages Inventory

| Page | Data Source | Actions Working | Missing / Issues |
|------|------------|-----------------|------------------|
| `dashboard.tsx` | `GET /admin/analytics` | View only | ✅ |
| `drivers.tsx` | `GET /admin/drivers` | List, search, filter, block | ✅ |
| `driver-detail.tsx` | `GET /admin/drivers/:id` + docs | View documents, approve/reject | ✅ |
| `driver-verification.tsx` | `GET /driver-documents` | Approve/reject documents | ✅ |
| `trips.tsx` | `GET /admin/shuttle-trips` | List, filter | ✅ |
| `shuttle-trips.tsx` | `GET /admin/shuttle-trips` | List with full detail | ✅ |
| `shuttle-trip-detail.tsx` | `GET /admin/shuttle-trips/:id` | View passengers, stations | ✅ |
| `bookings.tsx` | `GET /bookings` | List, filter | ✅ |
| `routes.tsx` | `GET /routes` | CRUD routes | ✅ |
| `route-detail.tsx` | `GET /routes/:id` | View route + stations | ✅ |
| `schedules.tsx` | `GET /schedules` | CRUD schedules | ✅ |
| `buses.tsx` | `GET /buses` | CRUD buses | ✅ |
| `users.tsx` | `GET /admin/users` | List, search, block/unblock | ✅ |
| `user-detail.tsx` | `GET /admin/users/:id` | View, edit, wallet | ✅ |
| `live-tracking.tsx` | `GET /admin/drivers/live` + socket | Real-time map | ✅ |
| `payments.tsx` | `GET /payments` | View, filter | ✅ |
| `wallet.tsx` | `GET /admin/wallet/transactions` | List, refund | ✅ |
| `pricing.tsx` | `GET /admin/rides/pricing` + zone pricing | Edit global + zone pricing | ✅ |
| `zones.tsx` | `GET /zones` | CRUD zones | ✅ |
| `services.tsx` | `GET /admin/services/:type/control` | Toggle services on/off | ✅ |
| `notifications.tsx` | `GET /admin/notifications/history` | Broadcast, view history | ✅ |
| `ratings.tsx` | `GET /ratings` | View ratings | ✅ |
| `promo.tsx` | `GET /promo` | CRUD promo codes | ✅ |
| `audit-logs.tsx` | `GET /admin/audit-logs` | View log trail | ✅ |
| `reports.tsx` | `GET /admin/analytics` | Revenue charts | ✅ |
| `vehicles.tsx` | `GET /vehicles` | CRUD vehicles | ✅ |
| `staff.tsx` | `GET /staff` | Staff role management | ✅ |
| `support.tsx` | `GET /support` | Support tickets | ✅ |
| `chat-inbox.tsx` | `GET /chat` | Chat inbox | ✅ |
| `suggestions.tsx` | `GET /suggestions` | User suggestions | ✅ |
| `shuttle-cash-debts.tsx` | `GET /admin/shuttle/cash-debts` | View + collect debts | ✅ |
| `shuttle-offences.tsx` | `GET /admin/shuttle/offences` | View + reset offences | ✅ |
| `trip-detail.tsx` | Ride detail | View ride events | ✅ |
| `settings.tsx` | Commission + surge settings | Edit settings | ✅ |

### Missing Admin Features
- ❌ No UI for vehicle brand/model/year category system (Car Economy/Comfort tiers)
- ❌ No dedicated Delivery service management page
- ❌ No push notification (FCM) configuration
- ❌ No multi-account/multi-vehicle fraud detection alert UI
- ⚠️ `reports.tsx` appears to duplicate `dashboard.tsx` data

---

## 8. Vehicle & Pricing System

### Current State

| Feature | Status | Notes |
|---------|--------|-------|
| Vehicle registry (make/model/year/plate) | ✅ Built | `vehicles` table — free text make/model, integer year |
| Vehicle type enum | ✅ Built | `car`, `motorcycle`, `van`, `minibus` |
| Vehicle status workflow | ✅ Built | `pending → verified → suspended/rejected` |
| Vehicle linked to driver | ✅ Built | `vehicles.driverId` FK |
| Global per-km pricing | ✅ Built | `ridePricing` — baseFare, perKmRate, perMinuteRate, minimumFare |
| Zone-based pricing override | ✅ Built | `zonePricing` with radius-based lookup |
| Surge multiplier | ✅ Built | In-memory, background job, configurable from admin |
| Car service categories by year (Economy/Economy Plus/Comfort) | ❌ Not built | No category system exists |
| Vehicle brand/model dropdown | ❌ Not built | Free text only |
| Shuttle pricing per category | ⚠️ Partial | `stations.segmentPrice` exists but is optional |
| Hardcoded prices | ⚠️ Some | `shuttle.ts` hardcodes `SHUTTLE_TOTAL_SEATS=14`, `SHUTTLE_MIN_REQUIRED=7` regardless of vehicle type in some paths |

---

## 9. Shuttle (Shatel) Specific — Detailed

| Requirement | Status | Detail |
|-------------|--------|--------|
| Routes (Lines) + Stations | ✅ Implemented | Full CRUD + ordered stations with optional segment prices |
| Trip scheduling (dates + times) | ✅ Implemented | Admin creates trips with `departureTime`, `arrivalTime`, `price`, `busId` |
| Vehicle capacity constants | ⚠️ Partial | `VEHICLE_CAPACITY = { hiace: 14, minibus: 28 }` in DB constants; `bookings.ts` uses them correctly; `shuttle.ts` hardcodes `SHUTTLE_TOTAL_SEATS=14` |
| Minimum passenger logic (7 for HiAce, 14 for MiniBus) | ✅ Implemented | `bookings.ts` reads `VEHICLE_MIN_THRESHOLD` from DB constants |
| Pending → Active auto-flip | ✅ Implemented | In `POST /bookings` transaction when `totalBooked >= shuttleMinRequired` |
| 10-hour cancellation rule | ✅ Implemented | `shuttle-job.ts`: `SHUTTLE_LOOKAHEAD_HOURS=10` — trips within window that miss minimum get auto-cancelled with passenger refunds |
| Driver weekly booking system | ✅ Implemented | `shuttleBookings.ts` — POST `/shuttle/route-bookings` |
| Driver conflict detection (time + geography) | ✅ Implemented | DB unique constraint + explicit overlap check in booking creation |
| Driver trip transfer to another driver | ✅ Implemented | `PATCH /admin/shuttle/route-bookings/:id/reassign` |
| Priority renewal (renew before other drivers can book) | ✅ Implemented | `shuttle-renewal-job.ts` + `PATCH /shuttle/route-bookings/:id/renew` |
| Pre-trip selfie check-in | ✅ Implemented | `checkin-monitor.ts` + `driverCheckins` table |
| Station arrival/boarding flow | ✅ Implemented | `tripStationProgress` + driver `/arrive` + `/complete` endpoints |
| 1-minute station boarding timer | ✅ Implemented | In-memory `stationTimers` Map in `shuttle.ts`; fires `shuttle:station:timeout` socket event |
| Shuttle offences (no-show, late, etc.) | ✅ Implemented | `shuttleOffences` table + admin endpoints |
| Cash debt management | ✅ Implemented | Negative wallet balance = debt; admin collects via API |

---

## 10. Notifications

| Type | Mechanism | Status | Notes |
|------|-----------|--------|-------|
| In-app (socket) | Socket.io `notification:new` event | ✅ Working | Used for bookings, ride events, debt collection |
| In-app (DB) | `notifications` table | ✅ Working | Persisted, readable, mark-as-read |
| Admin broadcast | `POST /admin/notifications/broadcast` | ✅ Working | Targets all/users/drivers/specific with filters |
| SMS OTP | Twilio REST API (`lib/sms.ts`) | ⚠️ Conditional | Falls back to console.log without `SMS_PROVIDER=twilio` |
| Mobile push notifications (FCM/APNs) | None | ❌ Missing | `users.pushToken` field exists but nothing sends to it |
| Email notifications | None | ❌ Missing | No email integration at all |
| Booking confirmation | Socket + DB notification | ✅ Working | Sent on successful booking with route/departure info |
| Ride events | Socket events | ✅ Working | Driver assigned, arrived, started, completed |
| Shuttle location pre-departure | Socket `shuttle:driver:location` | ✅ Built | 20-minute pre-departure window |

---

## 11. Document Upload & Driver Verification

| Feature | Status | Notes |
|---------|--------|-------|
| Document types (national_id_front/back, driving_license_front/back, vehicle_license_front/back, vehicle_photo, profile_photo, trip_selfie, criminal_record) | ✅ All supported | `driverDocuments.ts` validates against full enum |
| Supabase storage upload (multipart) | ✅ Built | `POST /driver-documents/upload/:driverId` — Multer + Supabase Storage SDK |
| Driver self-submit by URL | ✅ Built | `POST /driver/me/documents` — accepts pre-hosted URL |
| Admin review (approve/reject) | ✅ Built | `PATCH /driver-documents/:id` with `verificationStatus` + `adminNotes` |
| Admin verification queue page | ✅ Built | `driver-verification.tsx` dashboard page |
| Account activation after all docs approved | ❌ Not automated | No logic auto-activates the driver account when all required documents are approved; admin must manually update driver status |
| 30-trip threshold for criminal record requirement | ❌ Not implemented | No business rule enforces re-uploading criminal record after 30 trips |
| Multi-vehicle / multi-account alert | ❌ Not implemented | No duplicate phone/email/license detection across accounts |

---

## 12. Wallet & Payments

| Feature | Status | Notes |
|---------|--------|-------|
| Wallet balance | ✅ Working | `numeric(12,2)` field on `users` |
| Wallet top-up | ⚠️ No gateway | `POST /wallet/topup` adds any amount directly — no real payment gateway |
| Wallet deduction on booking | ✅ Working | Atomic SQL inside transaction |
| Wallet deduction on ride | ✅ Working | Estimated price held; adjusted to final on completion |
| Auto-refund on cancellation | ✅ Working | Both booking cancel and ride cancel refund wallet in same transaction |
| Admin manual refund | ✅ Working | `POST /admin/wallet/refund` |
| Transaction history | ✅ Working | `walletTransactions` table with types: deposit, payment, refund |
| `payments` table logging | ✅ Working | Every booking payment and refund logged |
| Driver earnings | ✅ Working | `driverEarnings` table; auto-created on trip/ride completion |
| Commission split | ⚠️ Partial | Commission settings exist in DB but the actual split calculation on ride completion uses a simplified calculation — not always consistent with admin-set commission rate |
| Cash-only mode | ❌ Missing | No cash payment support — wallet-only for all services |
| Card management | ❌ Missing | No card storage or payment gateway integration |
| Real payment gateway (Stripe, Paymob, etc.) | ❌ Missing | Top-up is a direct balance increment |

---

## 13. Dead Code & Unnecessary Features

| Item | Type | Issue |
|------|------|-------|
| `GET /drivers/me` and `PATCH /drivers/me/location` | Deprecated routes | Both marked TODO-deprecated; superseded by `/driver/me` equivalents |
| `lib/db/src/schema/rideShareTokens.ts` | Schema | Defined, never referenced in any route |
| `lib/db/src/schema/userLocations.ts` | Schema | Defined, never referenced in any route |
| `artifacts/api-server/src/lib/face-detection.ts` | Library file | Not imported anywhere — dead code |
| `GET /auth/me` | Route | Marked deprecated in comments; identical to `GET /users/me` |
| `shuttleRatings` table | Schema | Redundant with `ratings` table; only `ratings` is used in driver ratings endpoint |
| `admin.ts` → `/admin/services/:type/settings` (key-value settings) | Route | Conflicts with `serviceControls.ts` → `/admin/services/:type/settings` (structured DB table) — two competing implementations of the same concept |
| `lib/db/src/schema/serviceSettings.ts` | Schema | Standalone settings system parallel to the key-value `settings` table |
| `artifacts/api-server/src/routes/locations.ts` | Routes | Unclear role; overlaps with `driver.ts` location update logic |

---

## Prioritized Summary

| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | `GET /shuttle/assignments` has no authentication guard | ❌ Security hole | 🔴 High |
| 2 | `POST /wallet/topup` accepts arbitrary balance with no payment gateway | ❌ Missing | 🔴 High |
| 3 | SMS OTP silently falls back to console — real OTPs never sent without Twilio config | ⚠️ Needs config | 🔴 High |
| 4 | Mobile push notifications (FCM/APNs) not implemented — `pushToken` field unused | ❌ Missing | 🔴 High |
| 5 | `PATCH /trips/:id/cancel` and `DELETE /trips/:id` do not auto-refund passenger bookings | ❌ Broken | 🔴 High |
| 6 | Document upload depends on `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` not set in this repo | ⚠️ External dep | 🔴 High |
| 7 | Driver account not auto-activated when all documents are approved | ❌ Missing logic | 🔴 High |
| 8 | Delivery service cannot actually be requested — `vehicleType` enum excludes `delivery` in ride request | ❌ Broken | 🔴 High |
| 9 | Car service category system (Economy / Economy Plus / Comfort by year) not implemented | ❌ Missing | 🟠 Medium |
| 10 | Vehicle brand/model dropdown system not implemented — free text only | ❌ Missing | 🟠 Medium |
| 11 | `shuttle.ts` hardcodes `SHUTTLE_TOTAL_SEATS=14` regardless of vehicle type in several paths | ⚠️ Inconsistent | 🟠 Medium |
| 12 | 30-trip threshold for criminal record re-upload not enforced | ❌ Missing | 🟠 Medium |
| 13 | Multi-account / multi-vehicle fraud detection alert not implemented | ❌ Missing | 🟠 Medium |
| 14 | `GET /trips` and `GET /shuttle/lines/:id` are unauthenticated | ⚠️ Minor exposure | 🟡 Low |
| 15 | Refresh tokens stored as plaintext in DB (should be hashed) | ⚠️ Security | 🟡 Low |
| 16 | Duplicate `shuttleRatings` table alongside `ratings` table — needs consolidation | 🗑️ Dead | 🟡 Low |
| 17 | Two competing service-settings systems (`admin.ts` key-value vs `serviceControls.ts` table) | ⚠️ Debt | 🟡 Low |
| 18 | `rideShareTokens` and `userLocations` schemas exist with zero route coverage | 🗑️ Dead | 🟡 Low |
| 19 | No real payment gateway — wallet top-up is a trust-based increment | ❌ Missing | 🟡 Low (external) |
| 20 | Email notifications not implemented | ❌ Missing | 🟡 Low |
