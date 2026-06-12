# VeeGo Admin Dashboard — Backend vs. Frontend Audit Report

**Audited against:** Phase 1–4 Backend Implementation Reports  
**Frontend source:** `artifacts/admin-dashboard/src/`  
**Date:** 2025

---

## 1. Disconnect Summary Table

| # | Feature | Backend Endpoint(s) | Frontend Status | Missing Route / File |
|---|---------|---------------------|-----------------|----------------------|
| 1 | Wallet Top-Up Limits (max per-request & daily) | `PATCH /admin/settings/wallet-limits` | ❌ Completely Invisible | No control in `settings.tsx` or anywhere else |
| 2 | Auto-Activation Banner on 8th Document Approval | `PATCH /driver-documents/:id` (side-effect) | ⚠️ Partially Missing | UI element missing in `driver-verification.tsx` |
| 3 | Refund Outcome Visibility on Trip Cancel/Delete | `PATCH /trips/:id/cancel`, `DELETE /trips/:id` | ⚠️ Partially Missing | No post-action refund summary in `trips.tsx` |
| 4 | Shuttle Vehicle Types Management (hiace / minibus) | `GET/POST /admin/shuttle/vehicle-types`, `GET/PATCH/DELETE /admin/shuttle/vehicle-types/:id` | ❌ Completely Invisible | No dedicated page; not in `buses.tsx` or `App.tsx` |
| 5 | Criminal Record Enforcement — trip count, manual check, suspension reason | `POST /admin/drivers/:id/check-criminal-record` | ❌ Completely Invisible | Nothing in `driver-detail.tsx` |
| 6 | Duplicate Driver Fraud Alerts | `GET /admin/duplicate-alerts`, `PATCH /admin/duplicate-alerts/:id/resolve` | ❌ Completely Invisible | No page, no route in `App.tsx` |
| 7 | Vehicle Colors Management | `GET /vehicle-catalog/colors`, (admin CRUD implied) | ❌ Completely Invisible | Not in `VehicleCatalogTab.tsx`; only brands & models exist |
| 8 | Dynamic System Global Settings (dispatch radius, timeout, fees) | `GET /admin/settings`, `PATCH /admin/settings`, `GET /admin/settings/:key` | ❌ Completely Invisible | `settings.tsx` has no "System" tab; none of the seeded keys are exposed |
| 9a | Per-Driver Commission Override | `PATCH /api/admin/drivers/:id/commission` | ❌ Completely Invisible | Not in `driver-detail.tsx` or `finance-commission.tsx` |
| 9b | Commission Exemption Periods (CRUD) | `GET/POST/PATCH/DELETE /api/admin/commission-exemptions` | ❌ Completely Invisible | No page, no route in `App.tsx` |
| 9c | Milestone Bonus Targets (CRUD + Progress) | `GET/POST/PATCH/DELETE /api/admin/bonus-targets`, `/admin/bonus-targets/:id/progress`, `/admin/drivers/:id/bonus-progress` | ❌ Completely Invisible | No page, no route in `App.tsx` |

**Legend:** ✅ Fully Visible · ⚠️ Partially Missing · ❌ Completely Invisible

---

## 2. Deep-Dive: Completely Invisible Features

---

### Feature 1 — Wallet Top-Up Limits

**Backend:** `PATCH /api/admin/settings/wallet-limits` accepts `{ wallet_max_topup, wallet_daily_topup_limit }`.  
**Current frontend gap:** `wallet.tsx` only shows the transaction ledger and a manual-refund dialog. `settings.tsx` has three tabs (General, App Info, Staff) — none touch wallet limits.

**What needs to be built:**
- A new **"Wallet Limits"** card in `settings.tsx` (or a dedicated section in `/finance/wallet`) containing:
  - A numeric input for **Max Top-Up per Request (EGP)** — reads current value via `GET /admin/settings/wallet_max_topup`; saves via `PATCH /admin/settings/wallet-limits`.
  - A numeric input for **Daily Top-Up Limit (EGP)** — same read/write pattern.
  - A Save button with a mutation and toast confirmation.
- Current defaults (1,000 EGP / 2,000 EGP) should be shown as placeholder values until the first server response arrives.

---

### Feature 2 — Auto-Activation Banner on 8th Document Approval

**Backend:** When the 8th required document (`national_id_front`, `national_id_back`, `driving_license_front`, `driving_license_back`, `vehicle_license_front`, `vehicle_license_back`, `profile_photo`, `vehicle_photo`) transitions to `approved`, the backend atomically sets `drivers.isActive = true` and `users.isVerified = true` and fires a socket event.  
**Current frontend gap:** `driver-verification.tsx` renders document cards and approve/reject buttons correctly, but gives no indication that approving the 8th document will flip the driver live. The admin may approve without realising the driver is now immediately active.

**What needs to be built:**
- Count how many of the 8 required doc types are currently `approved` for the driver being viewed (this data is already fetched in `viewDriver.documents`).
- When exactly **7 of 8** required docs are approved and the remaining one is pending, render a **yellow alert banner** inside the driver document panel: _"Approving this document will automatically activate this driver's account."_
- After any successful approval that results in all 8 being `approved`, show a **green success callout**: _"All required documents approved — driver account has been automatically activated."_ and refresh the driver status display.

---

### Feature 3 — Refund Outcome Visibility on Trip Cancel/Delete

**Backend:** Cancelling or deleting a trip atomically refunds all confirmed/pending bookings and inserts wallet transaction records.  
**Current frontend gap:** `trips.tsx` correctly calls `PATCH /trips/:id/cancel` (via `useCancelTrip`) and `DELETE /trips/:id`, and the cancel confirmation dialog even says "bookings will be cancelled and refunded." However, the UI receives no structured response about *who* was refunded or *how much*.

**What needs to be built:**
- Modify the cancel/delete success handler to display a **toast or modal summary** showing refund outcomes. The backend `PATCH /trips/:id/cancel` should return (or an additional `GET` call can fetch) the list of refunded bookings with amounts.
- Alternatively, after cancellation, show a **"Trip Cancelled — N bookings refunded, total EGP X"** toast using the booking count and price that are already available client-side before cancellation.
- In the `trip-detail.tsx` view, add a **"Refund History"** section that lists wallet transactions of type `refund` linked to that trip, confirming refunds were processed.

---

### Feature 4 — Shuttle Vehicle Types Management

**Backend:** Table `shuttle_vehicle_types` (id, name, capacity, minThreshold, isActive) with full CRUD at `GET/POST /admin/shuttle/vehicle-types` and `GET/PATCH/DELETE /admin/shuttle/vehicle-types/:id`.  
**Current frontend gap:** `buses.tsx` has a "Vehicle Catalog" tab that renders `VehicleCatalogTab` for car brands and models — this is a completely separate concern from shuttle vehicle types. There is no UI for the `shuttle_vehicle_types` table anywhere.

**What needs to be built:**
- A new **"Shuttle Vehicle Types"** tab (or card section) inside `buses.tsx`, separate from the VehicleCatalog tab.
- A table listing all shuttle vehicle types with columns: **Name**, **Capacity (seats)**, **Min Threshold (seats)**, **Status**.
- **Add / Edit dialog** with fields: Name (e.g. "Hiace"), Capacity (integer), Min Threshold (integer, must be ≤ capacity), Active toggle.
- **Delete** with confirmation.
- All mutations wired to the `/admin/shuttle/vehicle-types` endpoints.
- This is critical for operational correctness: if new bus types are added to the fleet without a corresponding `shuttle_vehicle_types` row, seat calculations will break.

---

### Feature 5 — Criminal Record Enforcement

**Backend:** Drivers with ≥30 completed trips and no approved `criminal_record` document are auto-suspended. `POST /admin/drivers/:id/check-criminal-record` returns `{ totalCompletedTripsAndRides, threshold, hasCriminalRecordApproved, suspended }`.  
**Current frontend gap:** `driver-detail.tsx` shows status, rating, wallet balance, and documents — but nothing about the criminal record threshold or whether this enforcement caused a suspension.

**What needs to be built:**

**A. Trip Count vs. Threshold Display** (in the Overview tab's Account Status card):
- Fetch the check result via `POST /admin/drivers/:id/check-criminal-record` on page load (or lazily on demand).
- Display a progress-style row: _"Criminal Record Compliance: 28 / 30 trips"_ with a warning badge if `> 25` trips and criminal record not yet approved.
- If `suspended = true` due to this check, show a distinct **red alert** row: _"Suspended: criminal record threshold exceeded."_

**B. Manual Trigger Button** (in the action bar):
- Add a **"Check Criminal Record"** button that calls `POST /admin/drivers/:id/check-criminal-record`.
- Display the returned data in a modal: trip count, threshold, criminal record status, whether the driver was suspended by this call.

**C. Suspension Reason Badge**:
- In the driver status section, if `driver.status === "suspended"` and the criminal record is not approved and trip count ≥ threshold, show a labeled badge: _"Suspended (criminal record)"_ instead of a generic "suspended" badge.

---

### Feature 6 — Duplicate Driver Fraud Alerts

**Backend:** Table `driver_duplicate_alerts` logs entries when two drivers share the same `nationalId`. `GET /admin/duplicate-alerts?resolved=true/false&matchType=national_id` returns paginated alerts; `PATCH /admin/duplicate-alerts/:id/resolve` closes them.  
**Current frontend gap:** No page, no route, no navigation link exists anywhere in the admin dashboard for this feature.

**What needs to be built:**
- **New page:** `src/pages/fraud-alerts.tsx` — a full management screen with:
  - **Stats strip:** total unresolved alerts count (highlighted in red/orange if > 0).
  - **Filter bar:** `resolved: true / false / all` toggle and `matchType` filter.
  - **Table columns:** Alert ID, New Driver Name / ID, Existing Driver Name / ID, Match Type, Created At, Resolved At, Notes, Actions.
  - **"Resolve" action** per row: opens a dialog with optional notes field → calls `PATCH /admin/duplicate-alerts/:id/resolve`.
  - Quick-links from each driver name to their `/drivers/:id` detail page.
- **New route** in `App.tsx`: `<Route path="/fraud-alerts" component={FraudAlerts} />`
- **Sidebar navigation link** under a "Security" or "Compliance" section with a **red badge** showing unresolved count.
- **Real-time socket support**: `useAdminSocket` already listens for events — add a handler for `admin:duplicate_driver_alert` to show a toast and increment the unresolved badge count.

---

### Feature 7 — Vehicle Colors Management

**Backend:** Table `vehicle_colors` (id, nameAr, nameEn, hexCode, isActive); seeded with 10 standard colors on startup. Endpoint: `GET /vehicle-catalog/colors`. Admin CRUD implied (consistent with brands/models pattern under `/admin/vehicle-catalog/`).  
**Current frontend gap:** `VehicleCatalogTab.tsx` renders two sections — Approved Brands and Approved Models — with no Colors section. Colors are invisible and unmanageable.

**What needs to be built:**
- Add a **third section** to `VehicleCatalogTab.tsx` titled "Approved Colors":
  - Table with columns: **Color Swatch** (small circle with `backgroundColor: hexCode`), **English Name**, **Arabic Name**, **Hex Code**, **Status**, **Actions**.
  - **Add / Edit Color dialog** with fields: English Name, Arabic Name, Hex Code (with a color picker input `type="color"`), Active toggle.
  - **Delete** with confirmation.
  - Mutations wired to admin color CRUD endpoints (following the same brand/model pattern: `POST /admin/vehicle-catalog/colors`, `PATCH /admin/vehicle-catalog/colors/:id`, `DELETE /admin/vehicle-catalog/colors/:id`).

---

### Feature 8 — Dynamic System Global Settings

**Backend:** `GET /admin/settings` returns all key-value rows; `PATCH /admin/settings` upserts `{ key, value }`. Seeded keys: `dispatch_radius_km`, `dispatch_max_radius_km`, `dispatch_offer_timeout_seconds`, `no_show_fee_egp`, `cancellation_grace_hours`. Also `wallet_max_topup`, `wallet_daily_topup_limit`, `criminal_record_trip_threshold`, `driver_commission_rate`.  
**Current frontend gap:** `settings.tsx` has only UI preferences (theme, language, notifications) and App Info (name, support email, social links). None of the operational system keys are exposed.

**What needs to be built:**
- Add a **"System"** tab to `settings.tsx` (or create a standalone page at `/settings/system`) containing a **Global Settings Panel**:

  | Setting Key | Label | Input Type | Notes |
  |---|---|---|---|
  | `dispatch_radius_km` | Dispatch Radius (km) | Number | Initial search radius for drivers |
  | `dispatch_max_radius_km` | Max Dispatch Radius (km) | Number | Expansion ceiling |
  | `dispatch_offer_timeout_seconds` | Offer Timeout (seconds) | Number | How long before offer expires |
  | `no_show_fee_egp` | No-Show Fee (EGP) | Number | Fee charged on no-show |
  | `cancellation_grace_hours` | Cancellation Grace Period (hours) | Number | Free cancellation window |
  | `criminal_record_trip_threshold` | Criminal Record Trip Threshold | Number | Auto-suspend after N trips |

- Each row: label, current value (fetched from `GET /admin/settings/:key`), editable input, Save button.
- Or a **batch edit mode**: load all settings via `GET /admin/settings`, render all fields in a form, save changed keys via individual `PATCH /admin/settings` calls.
- Changes should show a confirmation toast and invalidate the query cache.

---

### Feature 9a — Per-Driver Commission Override

**Backend:** `PATCH /api/admin/drivers/:id/commission` accepts `{ commissionRate: 0.10 }` (decimal 0–1) or `{ commissionRate: null }` to clear. Overrides global commission for that driver.  
**Current frontend gap:** `driver-detail.tsx` has no commission field. `finance-commission.tsx` only manages global rates.

**What needs to be built:**
- In `driver-detail.tsx` Overview tab, add a **"Commission Override"** row in the Account Status card:
  - Display current override (e.g. _"Personal Rate: 10% (override)"_) or _"Using global rate (15%)"_ if null.
  - **Edit button** → inline input (0–100%) + Save → calls `PATCH /admin/drivers/:id/commission` with `commissionRate: value / 100`.
  - **Clear Override button** → calls the same endpoint with `commissionRate: null`.
- Include a small info tooltip: _"This overrides the global commission rate for this driver only."_

---

### Feature 9b — Commission Exemption Periods

**Backend:** Table `driver_commission_exemptions` with full CRUD at `GET/POST/PATCH/DELETE /api/admin/commission-exemptions`. Supports `?driverId=N` filter. During an active exemption, the driver keeps 100% of their fare.  
**Current frontend gap:** No page, no route, no mention anywhere in the dashboard.

**What needs to be built:**
- **New page:** `src/pages/commission-exemptions.tsx`:
  - **Table** of all exemption periods: Driver Name, Starts At, Ends At, Reason, Active toggle, Status (active now / future / expired).
  - **Filter by driver** (search by driver ID or name).
  - **Create Exemption dialog** with fields: Driver (searchable select), Start Date/Time, End Date/Time, Reason (optional textarea), Active toggle.
  - **Edit** (PATCH) and **Delete** per row.
- **New route** in `App.tsx`: `/finance/commission-exemptions`
- **Link** from `driver-detail.tsx` — a "Manage Exemptions" button that navigates to `/finance/commission-exemptions?driverId=X`, pre-filtered for that driver.
- **Link** from `finance-commission.tsx` — an "Exemption Periods" section or button.

---

### Feature 9c — Milestone Bonus Targets (CRUD + Progress Tracking)

**Backend:** Full system with two tables — `driver_bonus_targets` and `driver_bonus_progress`. Admin CRUD at `GET/POST/PATCH/DELETE /api/admin/bonus-targets`. Progress views at `GET /admin/bonus-targets/:id/progress` (all drivers for one target) and `GET /admin/drivers/:id/bonus-progress` (all targets for one driver).  
**Current frontend gap:** Entirely absent from the dashboard. No page, no route, no navigation entry.

**What needs to be built:**

**A. Bonus Targets Management Page** (`src/pages/bonus-targets.tsx`):
- **Table** of all bonus targets: Name, Service Type, Target Type (ride count / earnings), Target Value, Bonus Amount (EGP), Window (Starts → Ends), Active status, Enrolled drivers count, Completed count.
- **Create Target dialog** with fields: Name, Description, Service Type (all / car / shuttle / bike / delivery / scooter / ride), Target Type (ride_count / earnings_amount), Target Value, Bonus Amount (EGP), Start Date/Time, End Date/Time, Active toggle.
- **Edit** (PATCH) and **Soft Delete** per row.
- **"View Progress"** button per target → opens a drill-down modal or navigates to a progress view.

**B. Target Progress View** (per target — `GET /admin/bonus-targets/:id/progress`):
- Table: Driver Name, Current Value, Target Value, Progress Bar (%), Completed (✓/✗), Completed At.
- Sortable by progress %, filterable by completed status.

**C. Per-Driver Bonus Progress** (in `driver-detail.tsx`):
- Add a **"Bonus Progress"** tab (or section in the Overview tab) using `GET /admin/drivers/:id/bonus-progress`.
- Cards or rows showing: Target Name, Service Type, Progress (current / target), Status (active / completed / expired), Bonus Amount earned.

**D. New routes** in `App.tsx`:
- `/bonus-targets`
- `/bonus-targets/:id/progress`
- (Driver-level progress rendered within `/drivers/:id`)

---

## 3. Partially Missing Features — Summary of Gaps

### Feature 2 — Auto-Activation: Missing Banner
The approval mechanism is fully wired. What is absent is:
1. A **pre-approval warning callout** when 7 of 8 docs are approved (the 8th approval will trigger activation).
2. A **post-approval success notification** displayed within the UI confirming that auto-activation occurred (beyond a generic toast).

### Feature 3 — Trip Cancellation: Missing Refund Confirmation
The cancel and delete actions are wired to the correct endpoints. What is absent is:
1. A **structured refund outcome display** after cancellation (how many bookings, total EGP refunded).
2. A **refund ledger section** in `trip-detail.tsx` listing the generated `walletTransactions` records of type `refund`.

---

## 4. Features Confirmed Fully Visible

| Feature | Evidence |
|---|---|
| Document approval / rejection workflow | `driver-verification.tsx` — full approve/reject/zoom/notes UI ✅ |
| Trip cancel wired to backend endpoint | `trips.tsx` — `useCancelTrip()` → `PATCH /trips/:id/cancel` ✅ |
| Trip delete wired to backend endpoint | `trips.tsx` — `adminFetch DELETE /trips/:id` ✅ |
| Vehicle Brands CRUD | `VehicleCatalogTab.tsx` — full create/edit/delete ✅ |
| Vehicle Models CRUD | `VehicleCatalogTab.tsx` — full create/edit/delete ✅ |
| Global commission rate settings | `finance-commission.tsx` — reads/writes `PATCH /admin/settings/commission` ✅ |
| Driver block / unblock | `driver-detail.tsx` — `PATCH /admin/users/:id/toggle-block` ✅ |
| Driver activate / suspend | `driver-detail.tsx` — `PATCH /drivers/:id` ✅ |
| Promo code CRUD | `promo.tsx` — full management screen ✅ |
| Wallet transaction ledger | `wallet.tsx` — paginated, filtered ledger ✅ |

---

## 5. Priority Build Order (Recommended)

| Priority | Feature | Impact |
|---|---|---|
| 🔴 P1 | Duplicate Driver Fraud Alerts (Feature 6) | Security — unreviewed fraud flags accumulate silently |
| 🔴 P1 | Wallet Top-Up Limits UI (Feature 1) | Operational — limits are live but unmanageable from UI |
| 🔴 P1 | Dynamic System Global Settings (Feature 8) | Operational — dispatch, radius, fees hardlocked from UI |
| 🟠 P2 | Shuttle Vehicle Types Management (Feature 4) | Data integrity — new bus types cause silent capacity bugs |
| 🟠 P2 | Criminal Record Enforcement UI (Feature 5) | Compliance — admins cannot see or trigger the enforcement |
| 🟠 P2 | Driver Commission Override (Feature 9a) | Finance — per-driver rates exist in DB but unmanageable |
| 🟡 P3 | Commission Exemption Periods (Feature 9b) | Finance — exemptions are created blind |
| 🟡 P3 | Milestone Bonus Targets (Feature 9c) | Engagement — entire incentive system invisible |
| 🟡 P3 | Vehicle Colors Management (Feature 7) | Catalog completeness |
| 🟢 P4 | Auto-Activation Banner (Feature 2) | UX clarity — functional but no admin feedback |
| 🟢 P4 | Refund Outcome Visibility (Feature 3) | UX — functional but no confirmation display |
