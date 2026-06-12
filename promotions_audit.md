# Promotions & Incentives Audit

> Codebase snapshot: June 2026  
> Files audited: `lib/db/src/schema/promoCodes.ts`, `lib/db/src/schema/bookings.ts`, `lib/db/src/schema/rides.ts`, `lib/db/src/schema/drivers.ts`, `lib/db/src/schema/driverEarnings.ts`, `lib/db/src/schema/settings.ts`, `artifacts/api-server/src/routes/promo.ts`, `artifacts/api-server/src/routes/bookings.ts`, `artifacts/api-server/src/routes/rides.ts`, `artifacts/api-server/src/routes/admin.ts`, `artifacts/api-server/src/routes/earnings.ts`

---

## What EXISTS and works ✅

### Promo Code Schema
**Table:** `promo_codes` (`lib/db/src/schema/promoCodes.ts`)  
Fields:
| Field | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `code` | text UNIQUE | |
| `discount_type` | enum | `percentage` or `fixed` |
| `discount_value` | numeric(10,2) | |
| `expiry_date` | timestamp with tz | nullable |
| `max_usage` | integer | nullable = unlimited |
| `used_count` | integer | default 0 |
| `is_active` | boolean | default true |
| `created_at` | timestamp | |
| `updated_at` | timestamp | auto-updated |

### Admin Promo CRUD (`artifacts/api-server/src/routes/promo.ts`)
- `POST /api/promo` — admin creates a promo code ✅
- `PATCH /api/promo/:id` — admin updates (can set `isActive: false` to deactivate mid-run) ✅
- `DELETE /api/promo/:id` — admin deletes a promo ✅
- All write operations are audit-logged via `writeAuditLog` ✅

### Promo Validation Endpoint
- `POST /api/promo/validate` — any authenticated user can pre-validate a code before checkout ✅
  - Checks: active status, expiry date, global usage limit ✅

### Promo on Shuttle Bookings (`artifacts/api-server/src/routes/bookings.ts`)
- Rider can supply `promoCode` string in `POST /api/bookings` body ✅
- Both `percentage` and `fixed` discount types are applied correctly ✅  
- `promoCodeId` is stored on the `bookings` row for later traceability ✅
- Checked fields: `isActive`, `expiryDate`, `maxUsage` ✅

### Promo on Ride Requests (`artifacts/api-server/src/routes/rides.ts`)
- Rider can supply `promoCode` in `POST /api/rides/request` body ✅
- Discount is validated: active, expiry, max_usage ✅
- Atomic `usedCount` increment with SQL guard prevents race conditions:  
  `WHERE max_usage IS NULL OR used_count < max_usage` (lines 591–604) ✅
- Discount information is logged in `ride_events` metadata and wallet transaction description ✅
- Free rides (100% percentage or fixed ≥ price) result in `discountedPrice = 0` — wallet deduction of 0 works ✅

### Admin Promo Analytics (`artifacts/api-server/src/routes/admin.ts` line 1054)
- `GET /api/admin/analytics/promo` shows:
  - Top promos by usage count and gross revenue ✅
  - Total promo bookings count ✅
  - Monthly promo booking breakdown ✅

### Commission System — Global Rate
- Stored in `settings` table under key `driver_commission_rate` (e.g. value `"0.15"`) ✅
- Default fallback: 15% platform cut, 85% driver (`rides.ts` lines 1284, 1431) ✅
- Applied at ride completion: `finalPrice × commissionRate` = platform cut ✅
- Driver cut = `finalPrice − platformCut` ✅

### Peak Hours Bonus
- On ride completion: if `isCurrentlyPeakHour()` is true, driver gets +20% of their cut ✅
- Recorded as a separate `driver_earnings` row with `notes: "peak_hours_bonus"` ✅

### Admin Commission Settings UI Endpoint
- `GET /api/admin/settings/commission` — returns `{ appCommission, driverShare, payoutSchedule, minimumPayout }` ✅
- `PATCH /api/admin/settings/commission` — updates those values ✅

### Driver Earnings Visibility
- `GET /api/earnings/summary` — admin sees all drivers' totals; driver sees their own ✅
- `GET /api/earnings/weekly` — weekly breakdown with optional driverId filter ✅
- `GET /api/earnings` — admin paginated list with driverId/status filters ✅
- `PATCH /api/earnings/:id/status` — admin marks earnings as confirmed/paid ✅

---

## What EXISTS but is broken or incomplete ⚠️

### 1. Commission settings are split across two disconnected keys
**File:** `artifacts/api-server/src/routes/admin.ts` line 95 vs `rides.ts` lines 1278–1284  
**Problem:** The admin commission endpoint saves to settings key `"commission"` (a JSON blob: `{appCommission, driverShare, ...}`). But ride completion reads from a completely different key: `"driver_commission_rate"` (a plain decimal string like `"0.15"`). These are **never in sync**.  
**Effect:** Admin changing commission via the dashboard has **zero effect** on actual ride commission. It always falls back to the hardcoded default of `0.15`.

### 2. Non-atomic `usedCount` increment in shuttle bookings
**File:** `artifacts/api-server/src/routes/bookings.ts` lines 141  
```typescript
await tx.update(promoCodesTable).set({ usedCount: promo.usedCount + 1 })
```
**Problem:** `promo.usedCount` is read before the transaction, then written back as a literal. Two concurrent bookings can both read `usedCount = 5`, both check `5 < 10`, and both write `6`, effectively allowing one extra use.  
**Fix:** Use `usedCount: sql\`used_count + 1\`` with a `WHERE used_count < max_usage` guard (same as rides.ts already does correctly).

### 3. Silent promo failure in shuttle bookings
**File:** `artifacts/api-server/src/routes/bookings.ts` lines 132–144  
**Problem:** If the promo code supplied at shuttle booking is invalid, expired, or over the limit, the booking **silently proceeds at full price** with no error returned to the client. The rider has no idea the code was ignored.  
**Expected behavior:** Return a 400 error, same as rides.ts does.

### 4. Promo code ID is NOT stored on ride records
**File:** `lib/db/src/schema/rides.ts` — `ridesTable` schema  
**Problem:** `bookingsTable` has a `promo_code_id` FK column. `ridesTable` does **not**. There is no way to query "which rides used promo code X" from the database. The promo discount for a ride is only findable by scanning `ride_events.metadata` or `wallet_transactions.description` text.  
**Effect:** `GET /api/admin/analytics/promo` only counts shuttle bookings; it completely ignores ride discounts. The promo analytics are misleading.

### 5. Discount is applied to estimated price, not final price (rides)
**File:** `artifacts/api-server/src/routes/rides.ts` lines 526–573  
**Problem:** The promo discount is deducted from `estimatedPrice` at request time (before the ride happens). The `finalPrice` = `estimatedPrice + waitingCharge`. If there is a waiting charge, the rider effectively gets charged the waiting fee **on top of the already-discounted price**. The promo does not reduce the waiting charge portion. This is probably intentional but is not documented and could surprise riders.

### 6. Peak hours bonus percentage is hardcoded
**File:** `artifacts/api-server/src/routes/rides.ts` lines 1290 and 1436  
```typescript
const peakBonus = isPeak ? parseFloat((driverCut * 0.20).toFixed(2)) : 0;
```
**Problem:** 20% is hardcoded in two places (PATCH and POST completion handlers). There is no setting to adjust this from the admin panel. Changing it requires a code deployment.

### 7. `GET /api/promo` is accessible to ALL authenticated users
**File:** `artifacts/api-server/src/routes/promo.ts` line 34  
```typescript
router.get("/promo", authenticate, async (req, res) => {
```
**Problem:** No `requireRole("admin")` guard. Any logged-in rider or driver can list your entire promo catalog with codes, discount values, usage counts, and expiry dates. This is a data exposure issue.

### 8. Duplicate ride completion handlers with duplicated commission logic
**File:** `artifacts/api-server/src/routes/rides.ts` lines 1217–1362 (PATCH) and 1403–1488 (POST)  
**Problem:** The POST `/driver/rides/:id/complete` is a "deprecated alias" for PATCH, but it contains a full copy of the commission calculation logic (lines 1425–1436). If commission logic is fixed in one, the other won't get the fix. This already happened — both have the same bug where `driver_commission_rate` key is read from settings but the admin panel writes to key `"commission"`.

---

## What is MISSING entirely ❌

### Promo / Coupon — Missing Features

| Feature | Status | Notes |
|---|---|---|
| Per-user usage limit (e.g. 1 use per rider) | ❌ Missing | No `per_user_limit` field on `promo_codes` table, no `promo_code_usages` tracking table |
| Applicable service restriction (car only / shuttle only / all) | ❌ Missing | No `applicable_service` field — a coupon meant for shuttle can be applied to a car ride |
| Minimum ride amount | ❌ Missing | No `min_ride_amount` field — can apply a 50 EGP fixed coupon to a 10 EGP ride |
| View which specific riders used a specific coupon | ❌ Missing for rides | Only possible for shuttle bookings via `bookings.promo_code_id`; rides have no `promo_code_id` |
| Promo code for specific user(s) (targeted coupon) | ❌ Missing | No `user_id` or `user_ids` restriction |
| Referral / signup promo system | ❌ Missing | No referral code mechanism |

### Driver Incentives — Missing Features

| Feature | Status | Notes |
|---|---|---|
| Per-driver commission override | ❌ Missing | No `commission_rate` on `drivers` table; always uses global rate |
| Commission exemption (0% for X trips or X days) | ❌ Missing | No mechanism exists |
| Reduced commission rate for specific driver | ❌ Missing | Same — no per-driver rate override |
| Trip milestone bonus (e.g. "complete 50 trips = 200 EGP bonus") | ❌ Missing | No bonus targets table, no milestone tracking |
| Free trips system for drivers (driver pays 0 commission for N rides) | ❌ Missing | No free-trip counter or override on driver or ride level |
| Bonus type field on `driver_earnings` | ❌ Missing | Only `notes` text field distinguishes bonus types — not queryable/filterable |
| Link ride earnings to specific ride record | ❌ Missing | `driver_earnings.trip_id` references `trips` (shuttle), but ride earnings have no `ride_id` FK; only `notes` text |

---

## Recommended Fixes (Prioritized)

### P0 — Breaks existing functionality

**Fix 1: Reconnect admin commission setting to ride commission**  
`artifacts/api-server/src/routes/admin.ts` + `rides.ts`  
Change `rides.ts` to read key `"commission"` and extract `appCommission`, converting it to a rate:  
```typescript
// Instead of reading "driver_commission_rate" key:
const commissionSettings = await loadSetting("commission", { appCommission: 15, driverShare: 85 });
const commissionRate = commissionSettings.appCommission / 100;
```
Or keep `driver_commission_rate` as the canonical key and update the admin PATCH endpoint to write it alongside `"commission"`.  
Also deduplicate the two completion handlers (PATCH + POST) to share one function.

**Fix 2: Make shuttle booking promo failure return an error, not silently skip**  
`artifacts/api-server/src/routes/bookings.ts` lines 132–144  
Replace the silent skip with explicit validation before the transaction, mirroring the pattern in `rides.ts` lines 553–564.

**Fix 3: Make shuttle booking promo increment atomic**  
`artifacts/api-server/src/routes/bookings.ts` line 141  
Replace `{ usedCount: promo.usedCount + 1 }` with:  
```typescript
await tx.update(promoCodesTable)
  .set({ usedCount: sql`used_count + 1` })
  .where(and(
    eq(promoCodesTable.id, promo.id),
    sql`(max_usage IS NULL OR used_count < max_usage)`
  ));
```

### P1 — Data integrity and analytics accuracy

**Fix 4: Add `promo_code_id` to `rides` table**  
`lib/db/src/schema/rides.ts`  
Add: `promoCodeId: integer("promo_code_id").references(() => promoCodesTable.id)`  
Then set it at ride creation in `rides.ts` and include it in the promo analytics query in `admin.ts`.

**Fix 5: Restrict `GET /api/promo` to admin**  
`artifacts/api-server/src/routes/promo.ts` line 34  
Add `requireRole("admin")` to the list route.  
Keep `POST /api/promo/validate` open to all authenticated users (that one is correct).

### P2 — Missing high-value features

**Fix 6: Add per-user promo usage tracking**  
New table: `promo_code_usages` (`promo_code_id`, `user_id`, `used_at`)  
Add `per_user_limit` field to `promo_codes`.  
On redemption, insert a row and count existing rows for that user+promo before allowing.

**Fix 7: Add `applicable_service` to promo codes**  
`lib/db/src/schema/promoCodes.ts`  
Add: `applicableService: pgEnum("applicable_service", ["all", "car", "shuttle", "bike", "delivery", "scooter"])` defaulting to `"all"`.  
Enforce it in `bookings.ts` (shuttle) and `rides.ts`.

**Fix 8: Add `min_ride_amount` to promo codes**  
`lib/db/src/schema/promoCodes.ts`  
Add: `minRideAmount: numeric("min_ride_amount", { precision: 10, scale: 2 })` nullable.  
Check `estimatedPrice >= minRideAmount` before applying discount in both booking and ride flows.

**Fix 9: Add per-driver commission override**  
`lib/db/src/schema/drivers.ts`  
Add: `commissionRate: numeric("commission_rate", { precision: 5, scale: 4 })` nullable.  
In ride completion: if `driver.commissionRate` is not null, use it instead of the global setting.

**Fix 10: Add a structured bonus type to `driver_earnings`**  
`lib/db/src/schema/driverEarnings.ts`  
Add: `type: pgEnum("earning_type", ["ride", "trip", "peak_bonus", "milestone_bonus", "manual_adjustment"])`.  
This allows filtering/reporting by bonus type without parsing `notes` text.

**Fix 11: Expose peak hours bonus rate as a configurable setting**  
`artifacts/api-server/src/routes/rides.ts` lines 1290 and 1436  
Replace hardcoded `0.20` with a DB setting read (e.g. key `"peak_bonus_rate"`) and expose it via admin PATCH endpoint.

---

## Quick Reference: Hardcoded Values That Should Be Configurable

| Location | Hardcoded Value | Key to Add |
|---|---|---|
| `rides.ts` line 1284, 1431 | `0.15` commission fallback | Already in settings but disconnected (see Fix 1) |
| `rides.ts` lines 1290, 1436 | `0.20` peak hours bonus rate | `peak_bonus_rate` setting |
| `rides.ts` line 39 | `"120000"` rate limit window | `RIDE_REQUEST_RATE_WINDOW_MS` env var (already env, ok) |
| `rides.ts` line 40 | `"3"` max ride requests | `RIDE_REQUEST_RATE_MAX` env var (already env, ok) |
| `admin.ts` line 31 | `appCommission: 15, driverShare: 85` default | Should match `driver_commission_rate` key |
