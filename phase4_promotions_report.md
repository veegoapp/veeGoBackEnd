# VeeGo Backend — Phase 4: Promotions & Driver Incentives Report

---

## Bug Fixes

### Fix 1 — `GET /api/promo` exposed to all authenticated users
**File:** `artifacts/api-server/src/routes/promo.ts` line 37  
**What was wrong:** The list endpoint had no `requireRole("admin")` guard. Any authenticated rider or driver could call it and read your entire promo catalog — codes, discount values, usage counts, and expiry dates.  
**What changed:** Added `requireRole("admin")` to the `GET /promo` handler.

### Fix 2 — Shuttle booking promo silently ignored invalid codes
**File:** `artifacts/api-server/src/routes/bookings.ts` lines 133–195  
**What was wrong:** If a promo code was inactive, expired, or over limit, the booking quietly proceeded at full price with no error. The rider had no way to know their coupon was ignored.  
**What changed:** Replaced the silent `if (promo && promo.isActive)` guard with explicit early-return errors matching the behavior in rides.ts: `400 Promo code not found or inactive`, `400 Promo code has expired`, `400 Promo code usage limit reached`.

### Fix 3 — Non-atomic `usedCount` increment in shuttle bookings
**File:** `artifacts/api-server/src/routes/bookings.ts` lines 168–180  
**What was wrong:** The old code read `promo.usedCount` before the transaction, then wrote `promo.usedCount + 1` (a literal). Two concurrent bookings could both read `usedCount = 5`, both pass the `5 < 10` check, and both write `6`, bypassing the global limit.  
**What changed:** Replaced with `SET used_count = used_count + 1 WHERE max_usage IS NULL OR used_count < max_usage`, then checked the `.returning()` array length. Returns 400 if the limit was hit between the pre-check and the update.

### Fix 4 — Commission settings disconnected from ride commission
**Files:** `artifacts/api-server/src/routes/admin.ts` lines 94–103; `artifacts/api-server/src/routes/rides.ts` lines 1332–1340, 1512–1519  
**What was wrong:** The admin dashboard saved commission settings to key `"commission"` (a JSON blob) via `saveSetting`. Ride completion read from a completely separate key `"driver_commission_rate"` (a decimal string). These were never in sync — any admin change had zero effect on actual ride commission.  
**What changed:**
- Admin `PATCH /admin/settings/commission` now calls `saveSetting("driver_commission_rate", ...)` in addition to saving the `"commission"` JSON blob — both keys stay in sync.
- Ride completion now calls `loadSetting("commission", ...)` and uses `appCommission / 100`, so it reads from the same source as the admin panel.

### Fix 5 — Peak bonus rate hardcoded in two places
**File:** `artifacts/api-server/src/routes/rides.ts` lines 1347–1349, 1524–1527  
**What was wrong:** `0.20` (20% peak bonus) was hardcoded in both the PATCH and POST completion handlers. Changing it required a code deployment.  
**What changed:** Both handlers now call `loadSetting("commission", {})` and use `peakBonusRate ?? 0.20`. The `peakBonusRate` field is now part of `CommissionSettings` and is configurable via `PATCH /admin/settings/commission` (`peakBonusRate: 0.0–1.0`).

---

## Promo Code System — What Changed

### New fields added to `promo_codes` table
**File:** `lib/db/src/schema/promoCodes.ts`

| Field | Type | Purpose |
|---|---|---|
| `per_user_limit` | `integer` nullable | Max times a single user can redeem this code. `null` = unlimited per user. |
| `applicable_service` | `text` not null default `"all"` | Service restriction: `"all"` \| `"car"` \| `"shuttle"` \| `"bike"` \| `"delivery"` \| `"scooter"` |
| `min_ride_amount` | `numeric(10,2)` nullable | Minimum fare required before discount applies. `null` = no minimum. |

### New `promo_code_usages` table
**File:** `lib/db/src/schema/promoCodeUsages.ts`

| Field | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `promo_code_id` | integer FK → promo_codes | CASCADE on delete |
| `user_id` | integer FK → users | CASCADE on delete |
| `used_at` | timestamp with tz | defaultNow |

Indexes: on `promo_code_id`, `user_id`, and composite `(promo_code_id, user_id)`.  
Used to count how many times a specific user has used a specific code, enabling `perUserLimit` enforcement.

### Shared validation logic (order of checks)
Both shuttle bookings (`bookings.ts`) and ride requests (`rides.ts`) now validate in this order:
1. Code exists and `isActive = true` → 400
2. `expiryDate` not past → 400
3. Global `maxUsage` not reached → 400
4. `applicableService` matches current service type → 400
5. `minRideAmount` ≤ current fare → 400
6. Per-user usage count < `perUserLimit` → 400
7. Atomic `usedCount` increment with SQL guard → 400 if race lost
8. Insert row into `promo_code_usages` (inside same transaction)

### Difference in behavior: shuttle vs rides

| Aspect | Shuttle (`bookings.ts`) | Rides (`rides.ts`) |
|---|---|---|
| `applicableService` check | Checks for `"all"` or `"shuttle"` | Checks for `"all"` or exact `vehicleType` |
| `promoCodeId` stored | On `bookings.promo_code_id` (pre-existing) | Now on `rides.promo_code_id` (new field, new index) |
| Discount base | `tripRow.price × seatCount` | `estimatedPrice` after surge but before wallet deduction |

### All promo endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/promo/validate` | any authenticated | Pre-validate a code before checkout |
| `GET` | `/api/promo` | admin | List all promo codes (paginated) |
| `POST` | `/api/promo` | admin | Create new promo code |
| `PATCH` | `/api/promo/:id` | admin | Update promo (can deactivate mid-run) |
| `DELETE` | `/api/promo/:id` | admin | Delete promo code |
| `GET` | `/api/admin/analytics/promo` | admin | Usage stats, top promos, monthly impact |

---

## Driver Incentives System — What Was Built

### Per-Driver Commission Override

**How it works:** A new `commission_rate` column was added to the `drivers` table. At ride completion, the commission resolution priority is:

1. **Active exemption period** → 0% commission (see below)
2. **Driver's personal `commissionRate`** → use that decimal (e.g. `0.10` = driver keeps 90%)
3. **Global setting** → `appCommission` from `settings` table key `"commission"`, divided by 100

Setting `commissionRate = null` (via the endpoint) removes the override and falls back to global.

**File:** `lib/db/src/schema/drivers.ts` — `commissionRate: numeric(5,4)` nullable  
**Endpoint:** `PATCH /api/admin/drivers/:id/commission`  
**Body:** `{ commissionRate: 0.10 }` (0–1 decimal) or `{ commissionRate: null }` to clear

### Commission Exemption Periods

**Table:** `driver_commission_exemptions`
| Field | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `driver_id` | integer FK → drivers | CASCADE on delete |
| `starts_at` | timestamp with tz | |
| `ends_at` | timestamp with tz | |
| `reason` | text nullable | |
| `is_active` | boolean | default true; set false to cancel |
| `created_at` | timestamp | |
| `updated_at` | timestamp | auto-updated |

**How it works:** At ride completion, before calculating commission, both the PATCH and POST handlers query for an active exemption for this driver where `NOW() BETWEEN starts_at AND ends_at AND is_active = true`. If found, `commissionRate = 0` — the driver keeps 100% of the fare. The `driver_earnings` row type is set to `"commission_exemption_saving"` instead of `"ride"` so it's distinguishable.

**Priority order:** Exemption (0%) → personal rate → global rate

**Endpoints:**

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/commission-exemptions` | admin | List all (optional `?driverId=N` filter) |
| `POST` | `/api/admin/commission-exemptions` | admin | Create exemption period |
| `PATCH` | `/api/admin/commission-exemptions/:id` | admin | Update dates/reason/isActive |
| `DELETE` | `/api/admin/commission-exemptions/:id` | admin | Hard delete |

### Milestone Bonus System

**Table: `driver_bonus_targets`**
| Field | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | Display name (e.g. "Complete 50 Car Rides") |
| `description` | text nullable | |
| `service_type` | text | `"all"` \| `"car"` \| `"shuttle"` \| `"bike"` \| `"delivery"` \| `"scooter"` \| `"ride"` |
| `target_type` | text | `"ride_count"` or `"earnings_amount"` |
| `target_value` | numeric(12,2) | e.g. `50` rides or `1000.00` EGP earned |
| `bonus_amount` | numeric(10,2) | EGP credited to driver wallet when completed |
| `starts_at` | timestamp with tz | Target window start |
| `ends_at` | timestamp with tz | Target window end |
| `is_active` | boolean | Admin can deactivate mid-run |
| `is_deleted` | boolean | Soft delete flag |

**Table: `driver_bonus_progress`**
| Field | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `driver_id` | integer FK → drivers | CASCADE on delete |
| `target_id` | integer FK → driver_bonus_targets | CASCADE on delete |
| `current_value` | numeric(12,2) | Running count or earnings total |
| `is_completed` | boolean | Set to true on first completion only |
| `completed_at` | timestamp nullable | |
| Unique | `(driver_id, target_id)` | One progress row per driver per target |

**How progress is tracked — rides vs shuttle:**
- Rides (`rides.ts`): After both PATCH and POST `/driver/rides/:id/complete`, calls `updateBonusProgressAfterRide(driverId, vehicleType, finalPrice)` (non-fatal, fire-and-forget)
- Shuttle: tracked via `service_type = "shuttle"` or `"all"` targets — shuttle completion in `driver.ts` will need the same hook added (not in scope for this phase, noted for Phase 5)
- `ride` service_type matches car/bike/delivery/scooter (not shuttle)

**Bonus payout flow** (`artifacts/api-server/src/lib/bonus-targets.ts`):
1. Find all active targets where `NOW() BETWEEN starts_at AND ends_at`
2. Filter by `serviceType` match
3. Upsert `driver_bonus_progress` (increment by 1 for ride_count, or by `finalPrice` for earnings_amount)
4. If `currentValue >= targetValue` AND not already completed:
   - Set `isCompleted = true`, `completedAt = now`
   - In a transaction: credit `bonusAmount` to driver's wallet + insert `walletTransactions` (type: `bonus`) + insert `driverEarnings` (type: `milestone_bonus`)
   - Send `notifications` row + emit `driver:bonus:completed` socket event

**Endpoints:**

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/bonus-targets` | admin | All targets with enrollment + completion stats |
| `POST` | `/api/admin/bonus-targets` | admin | Create new target |
| `PATCH` | `/api/admin/bonus-targets/:id` | admin | Update target (can deactivate mid-run) |
| `DELETE` | `/api/admin/bonus-targets/:id` | admin | Soft delete |
| `GET` | `/api/admin/bonus-targets/:id/progress` | admin | Per-driver progress for a target |
| `GET` | `/api/admin/drivers/:id/bonus-progress` | admin | All bonus progress for one driver |
| `GET` | `/api/driver/bonus-targets` | driver | Active targets with my current progress |

---

## All New / Modified Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/promo` | **admin only** (was: any auth) | List promo codes |
| `PATCH` | `/api/admin/settings/commission` | admin | Now also accepts `peakBonusRate`; syncs `driver_commission_rate` key |
| `PATCH` | `/api/admin/drivers/:id/commission` | admin | Set/clear per-driver commission rate |
| `GET` | `/api/admin/commission-exemptions` | admin | List commission exemption periods |
| `POST` | `/api/admin/commission-exemptions` | admin | Create exemption period |
| `PATCH` | `/api/admin/commission-exemptions/:id` | admin | Update exemption |
| `DELETE` | `/api/admin/commission-exemptions/:id` | admin | Delete exemption |
| `GET` | `/api/admin/bonus-targets` | admin | List targets with stats |
| `POST` | `/api/admin/bonus-targets` | admin | Create target |
| `PATCH` | `/api/admin/bonus-targets/:id` | admin | Update target |
| `DELETE` | `/api/admin/bonus-targets/:id` | admin | Soft delete target |
| `GET` | `/api/admin/bonus-targets/:id/progress` | admin | Per-driver progress |
| `GET` | `/api/admin/drivers/:id/bonus-progress` | admin | All progress for one driver |
| `GET` | `/api/driver/bonus-targets` | driver | My active targets + progress |

---

## All New / Modified DB Tables

| Table | Status | Key New Fields |
|---|---|---|
| `promo_codes` | Modified | `per_user_limit int`, `applicable_service text default "all"`, `min_ride_amount numeric(10,2)` |
| `promo_code_usages` | **New** | `promo_code_id FK`, `user_id FK`, `used_at` — tracks per-user redemptions |
| `rides` | Modified | `promo_code_id int FK → promo_codes`, index `idx_rides_promo_code_id` |
| `drivers` | Modified | `commission_rate numeric(5,4)` nullable — per-driver commission override |
| `driver_earnings` | Modified | `ride_id int` nullable — links earnings to specific rides; `type text default "ride"` — enum: `ride`, `trip`, `peak_bonus`, `milestone_bonus`, `manual_adjustment`, `commission_exemption_saving` |
| `driver_commission_exemptions` | **New** | `driver_id FK`, `starts_at`, `ends_at`, `reason`, `is_active` |
| `driver_bonus_targets` | **New** | `name`, `service_type`, `target_type`, `target_value`, `bonus_amount`, `starts_at`, `ends_at`, `is_active`, `is_deleted` |
| `driver_bonus_progress` | **New** | `driver_id FK`, `target_id FK`, `current_value`, `is_completed`, `completed_at`; unique `(driver_id, target_id)` |

---

## New Source Files

| File | Purpose |
|---|---|
| `lib/db/src/schema/promoCodeUsages.ts` | Schema for per-user promo tracking table |
| `lib/db/src/schema/driverCommissionExemptions.ts` | Schema for commission exemption periods |
| `lib/db/src/schema/driverBonusTargets.ts` | Schema for admin-defined bonus targets |
| `lib/db/src/schema/driverBonusProgress.ts` | Schema for per-driver progress tracking |
| `artifacts/api-server/src/lib/bonus-targets.ts` | Shared helper: post-ride bonus progress update, wallet credit, notification |
| `artifacts/api-server/src/routes/bonusTargets.ts` | All bonus target admin + driver endpoints |
| `artifacts/api-server/src/routes/commissionExemptions.ts` | Commission exemption CRUD endpoints |
