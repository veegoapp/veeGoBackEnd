# VeeGo Phase 2 — Implementation Report

**Date:** 2026-06-12  
**Status:** ✅ All 4 fixes complete, build passing, server running

---

## Fix 1 — Shuttle Vehicle Types (Dynamic Capacity)

**Problem:** Shuttle seat capacity and minimum-required thresholds were hardcoded as constants (`SHUTTLE_TOTAL_SEATS = 14`, `SHUTTLE_MIN_REQUIRED = 7`), making it impossible to support different bus sizes.

**Solution:**

| File | Change |
|---|---|
| `lib/db/src/schema/shuttleVehicleTypes.ts` | New table: `shuttle_vehicle_types` (id, name, capacity, minThreshold, isActive) |
| `lib/db/src/schema/buses.ts` | Added `vehicleTypeId` FK → `shuttle_vehicle_types.id` |
| `lib/db/src/schema/index.ts` | Export new schema + `shuttleVehicleTypes` re-exported |
| `artifacts/api-server/src/routes/shuttleVehicleTypes.ts` | 5 CRUD endpoints: `GET/POST /admin/shuttle/vehicle-types`, `GET/PATCH/DELETE /admin/shuttle/vehicle-types/:id` |
| `artifacts/api-server/src/routes/index.ts` | Registered `shuttleVehicleTypesRouter` |
| `artifacts/api-server/src/routes/shuttle.ts` | Removed hardcoded constants; replaced with `VEHICLE_CAPACITY[vehicleType]` and `VEHICLE_MIN_THRESHOLD[vehicleType]` lookups from `@workspace/db`; `vehicleType` added to all trip select queries; `formatShuttleTrip()`, `/shuttle/lines`, `/shuttle/lines/:id`, and `/shuttle/trips/:id/passengers` responses are now vehicle-type-aware |

**Vehicle types supported:**
- `hiace` — 14 seats, min 7 required
- `minibus` — 28 seats, min 14 required

---

## Fix 2 — Criminal Record Enforcement After 30 Trips

**Problem:** Drivers completing ≥30 trips/rides without an approved criminal record document were not being automatically suspended. No reactivation path existed when the document was later approved.

**Solution:**

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/criminal-record.ts` | New shared lib: `checkCriminalRecordThreshold(driverId, driverUserId)` — counts completed trips + rides, compares against configurable `criminal_record_trip_threshold` setting (default 30), suspends driver and sends socket notification if threshold exceeded without approved criminal record |
| `artifacts/api-server/src/routes/driver.ts` | Calls `checkCriminalRecordThreshold` after `PATCH /driver/trips/:id/complete` earnings insert (non-fatal try/catch) |
| `artifacts/api-server/src/routes/rides.ts` | Calls `checkCriminalRecordThreshold` after both `PATCH /driver/rides/:id/complete` and `POST /driver/rides/:id/complete` (non-fatal try/catch) |
| `artifacts/api-server/src/routes/driverDocuments.ts` | Auto-reactivation: when `criminal_record` document status is set to `approved` and driver is `suspended` → sets driver status to `offline`, inserts reactivation notification, emits `driver:account:reactivated` + `notification:new` socket events |
| `artifacts/api-server/src/routes/admin.ts` | New endpoint `POST /admin/drivers/:id/check-criminal-record` — manually triggers threshold check for a driver, returns `{ totalCompletedTripsAndRides, threshold, hasCriminalRecordApproved, suspended }` |

**Threshold is configurable** via `settings` table key `criminal_record_trip_threshold`.

---

## Fix 3 — Duplicate Driver Fraud Detection

**Problem:** Drivers could register multiple accounts using the same national ID with no alerting mechanism.

**Solution:**

| File | Change |
|---|---|
| `lib/db/src/schema/driverDuplicateAlerts.ts` | New table: `driver_duplicate_alerts` (id, newDriverId, existingDriverId, matchType, resolvedAt, resolvedBy, notes, createdAt) |
| `lib/db/src/schema/index.ts` | Exported new schema |
| `artifacts/api-server/src/routes/driver.ts` | On `POST /auth/driver/register`: after driver creation, queries for other drivers sharing the same `nationalId`; inserts an alert row per match; emits `admin:duplicate_driver_alert` to `admin:room` socket (entirely non-blocking — registration always succeeds) |
| `artifacts/api-server/src/routes/admin.ts` | `GET /admin/duplicate-alerts` — paginated list with `?resolved=true/false&matchType=national_id` filters |
| `artifacts/api-server/src/routes/admin.ts` | `PATCH /admin/duplicate-alerts/:id/resolve` — marks alert resolved (`resolvedAt`, `resolvedBy`, optional `notes`) |

**Design decision:** Detection is non-fatal and non-blocking — a duplicate alert is recorded even if it cannot be written (try/catch), and it never prevents registration. Investigation is left to admin review.

---

## Fix 4 — Delivery Service

**Problem:** The ride-hailing service had no delivery vehicle type. Passengers could not request package delivery, and no delivery-specific pricing or recipient metadata existed.

**Solution:**

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/rides.ts` | Added `"delivery"` to `EstimateBody` and `RequestRideBody` vehicle-type enums; `RequestRideBody` has a `superRefine` that requires `recipientName` + `recipientPhone` when `vehicleType === "delivery"`; both fields saved to `ridesTable` on insert (`recipientName`, `recipientPhone` columns already in schema) |
| `artifacts/api-server/src/routes/rides.ts` | `PATCH /admin/rides/pricing/:vehicleType` already accepted `"delivery"` after the enum was extended |
| `lib/db/src/schema/rides.ts` | `recipientName` / `recipientPhone` columns confirmed present |
| `artifacts/api-server/src/index.ts` | Server startup seeds delivery pricing row (`vehicle_type = 'delivery'`, baseFare=5.00, perKmRate=3.00, perMinuteRate=0.50, minimumFare=15.00, `isActive=true`) using `onConflictDoNothing()` — idempotent |

**Delivery pricing defaults:**
| Field | Value |
|---|---|
| Base fare | 5.00 EGP |
| Per-km rate | 3.00 EGP |
| Per-minute rate | 0.50 EGP |
| Minimum fare | 15.00 EGP |

---

## Database Changes

All schema changes applied via `pnpm --filter @workspace/db run push`:

- `shuttle_vehicle_types` — new table
- `buses.vehicle_type_id` — new FK column
- `driver_duplicate_alerts` — new table
- `rides.recipient_name`, `rides.recipient_phone` — confirmed existing

---

## API Surface Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/shuttle/vehicle-types` | admin | List all shuttle vehicle types |
| `POST` | `/admin/shuttle/vehicle-types` | admin | Create vehicle type |
| `GET` | `/admin/shuttle/vehicle-types/:id` | admin | Get single vehicle type |
| `PATCH` | `/admin/shuttle/vehicle-types/:id` | admin | Update vehicle type |
| `DELETE` | `/admin/shuttle/vehicle-types/:id` | admin | Delete vehicle type |
| `GET` | `/admin/duplicate-alerts` | admin | List driver duplicate alerts |
| `PATCH` | `/admin/duplicate-alerts/:id/resolve` | admin | Resolve a duplicate alert |
| `POST` | `/admin/drivers/:id/check-criminal-record` | admin | Manual criminal record threshold check |
| `POST` | `/rides/request` | user | Request ride (now supports `delivery` type) |
| `POST` | `/rides/estimate` | user | Estimate fare (now supports `delivery` type) |
| `PATCH` | `/admin/rides/pricing/:vehicleType` | admin | Update pricing (`delivery` now valid) |
