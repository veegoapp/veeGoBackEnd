# Phase 3 Report

## Overview

Phase 3 delivered four fixes to the VeeGo ride-hailing backend. All changes compile cleanly (esbuild), the DB schema has been pushed, and the server starts without errors.

---

## Fix 1 — Vehicle Catalog (brands, models, colors)

**New DB tables:** `vehicle_brands`, `vehicle_models`, `vehicle_colors`

**New schema files:**
- `lib/db/src/schema/vehicleBrands.ts` — `vehicleBrandsTable` (id, name, nameAr, country, isChinese, logoUrl, isActive)
- `lib/db/src/schema/vehicleModels.ts` — `vehicleModelsTable` (id, brandId FK, name, nameAr, isActive)
- `lib/db/src/schema/vehicleColors.ts` — `vehicleColorsTable` (id, nameAr, nameEn, hexCode, isActive)

**FK columns added to `vehicles`:** `brandId`, `modelId`, `colorId`, `categoryId` (all nullable)

**New route:** `artifacts/api-server/src/routes/vehicleCatalog.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/vehicle-catalog/brands` | public JWT | List active brands |
| GET | `/vehicle-catalog/brands/:id/models` | public JWT | List active models for brand |
| GET | `/vehicle-catalog/colors` | public JWT | List active colors |
| POST | `/admin/vehicle-catalog/brands` | admin | Create brand |
| PATCH | `/admin/vehicle-catalog/brands/:id` | admin | Update brand |
| DELETE | `/admin/vehicle-catalog/brands/:id` | admin | Delete brand |
| POST | `/admin/vehicle-catalog/models` | admin | Create model |
| PATCH | `/admin/vehicle-catalog/models/:id` | admin | Update model |
| DELETE | `/admin/vehicle-catalog/models/:id` | admin | Delete model |

**`POST /vehicles` / `PATCH /vehicles/:id`:** now accept optional `brandId`, `modelId`, `colorId`; auto-resolves `categoryId` via `resolveCarCategory(year, brandId)` whenever `vehicleType = "car"`.

**Startup seed:** 10 standard vehicle colors seeded on first boot via `onConflictDoNothing`.

---

## Fix 2 — Car Categories & Dispatch Filtering

**New DB table:** `car_categories`  
Schema: `id`, `slug` (unique), `name`, `minYear`, `maxYear` (nullable), `baseFare`, `perKmRate`, `perMinuteRate`, `minimumFare`, `isActive`, `sortOrder`

**New lib:** `artifacts/api-server/src/lib/car-category.ts`
- `resolveCarCategory(year, brandId?)` → `{ categoryId, slug, name }` (uses Chinese brand flag for alternate year ranges)
- `getAllowedDriverCategorySlugs(slug)` → cascade list (economy → all three; economy_plus → two; comfort → itself)

**Cascade dispatch logic:**

| Requested Category | Drivers eligible from |
|--------------------|----------------------|
| economy | economy, economy_plus, comfort |
| economy_plus | economy_plus, comfort |
| comfort | comfort |

**Dispatch engine changes (`dispatch-manager.ts`):**
- `findNextBatch` accepts `allowedCategorySlugs?: string[]`; applies an `INNER JOIN` subquery on `vehicle_categories` when set
- `allowedCategorySlugs` is threaded through `findNextBatchWithExpansion`, `startDispatch`, `restartDispatch`, and `advanceRound`
- `advanceRound` reads `ride.requestedCategory` and recomputes slugs on every round automatically

**Estimate endpoint (`POST /rides/estimate`):**  
When `vehicleType = "car"`, the response now includes a `categories` array with per-category pricing (uses `carCategoriesTable` rates, surge-adjusted).

**Request endpoint (`POST /rides/request`):**  
Accepts optional `categorySlug`; stores it in `rides.requestedCategory`; passes the cascade slug list to `startDispatch`.

**Admin endpoints:**
- `GET /admin/car-categories` — list
- `POST /admin/car-categories` — create
- `PATCH /admin/car-categories/:id` — update
- `DELETE /admin/car-categories/:id` — delete

**Startup seed:** economy / economy_plus / comfort seeded with default rates on first boot.

---

## Fix 3 — Scooter Ride Type

**Changes:**
- `EstimateBody` and `RequestRideBody` enums now accept `"scooter"` as `vehicleType`
- `PATCH /admin/rides/pricing/:vehicleType` now accepts `"scooter"`
- Service type map: `scooter → "motorcycle"` (controls service-availability enforcement)
- Dispatch uses `vehicleType = "motorcycle"` when ride is `"scooter"` (both `startDispatch` and `restartDispatch`)
- Driver available rides (`GET /driver/rides/available`): motorcycle drivers now see both `"motorcycle"` AND `"scooter"` rides via `IN ('motorcycle', 'scooter')` filter

**Startup seed:** scooter pricing row (`baseFare: 3.00, perKmRate: 2.00, perMinuteRate: 0.30, minimumFare: 8.00`) seeded via `onConflictDoNothing`.

---

## Fix 4 — Remove serviceSettingsTable reads/writes

**Problem:** All driver-requirements enforcement (min rating, insurance, background check, max active rides) read directly from `service_settings` table, coupling ride acceptance to that legacy table.

**What changed:**

| File | Change |
|------|--------|
| `routes/rides.ts` | Removed entire ~75-line "driver requirements enforcement" block from `PATCH /driver/rides/:id/accept` |
| `routes/serviceControls.ts` | Removed `ensureServiceSettings()`, `DEFAULT_SETTINGS`, `mapSettings()`; GET/PATCH `/admin/services/:type/settings` and public GET `/services/:type/settings` migrated to `loadSetting`/`saveSetting` with key `service_req:{type}` |

**New key-value storage key:** `service_req:{internalType}` (e.g. `service_req:car`)  
**Default shape:**
```json
{
  "minDriverRating": 0,
  "requiredLicenseTypes": [],
  "requireInsurance": false,
  "requireBackgroundCheck": false,
  "maxActiveRidesPerDriver": 1
}
```

**Unified settings endpoints (new in `admin.ts`):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/settings` | List all key/value settings rows |
| PATCH | `/admin/settings` | Upsert `{ key, value }` (raw string) |
| GET | `/admin/settings/:key` | Get single setting by key |

**Startup seed:** 6 default settings keys seeded (`commission_rate`, `dispatch_radius_km`, `dispatch_max_radius_km`, `dispatch_offer_timeout_seconds`, `no_show_fee_egp`, `cancellation_grace_hours`).

The `service_settings` DB table itself is preserved (no destructive migration).

---

## Build & Runtime Status

- `pnpm --filter @workspace/db run push` — ✅ applied (new tables: `vehicle_brands`, `vehicle_models`, `vehicle_colors`, `car_categories`; FK columns on `vehicles`, `requestedCategory` on `rides`)
- `pnpm --filter @workspace/api-server run build` — ✅ clean (no TypeScript errors)
- Server startup — ✅ all seed runs, dispatch recovery succeeds, server listens on port 8080
