# VeeGo Backend — Phase 1 Report

## Fix 1 — Secure Driver Assignments Endpoint

- **What was changed:** `artifacts/api-server/src/routes/shuttle.ts`, line 283
  - Added `authenticate` JWT middleware to the route handler signature
  - Before: `router.get("/shuttle/assignments", async (_req, res)`
  - After:  `router.get("/shuttle/assignments", authenticate, async (_req, res)`
- **Endpoint:** `GET /shuttle/assignments`
- **Auth required:** Yes — any authenticated role (user, driver, admin)
- **Test results:**
  - `GET /api/shuttle/assignments` with no token → `401 Unauthorized`
  - `GET /api/shuttle/assignments` with valid JWT → returns driver + bus assignment data normally

---

## Fix 2 — Wallet Manipulation Prevention

- **What was changed:** `artifacts/api-server/src/routes/wallet.ts`
  - Added `loadSetting` / `saveSetting` imports from `../lib/settings`
  - `POST /wallet/topup`: reads `wallet_max_topup` and `wallet_daily_topup_limit` from the settings table (fallback: 1000 and 2000)
  - Per-request check (lines 54–62): rejects if `amount > maxTopup`
  - Daily check (lines 64–82): queries all `deposit` transactions for the user today, rejects if sum + amount would exceed `dailyLimit`
  - New endpoint `PATCH /admin/settings/wallet-limits` (lines 97–119): allows admin to update both limits in the settings table
- **New endpoints added:**
  | Method | Path | Description |
  |--------|------|-------------|
  | PATCH | `/api/admin/settings/wallet-limits` | Update `wallet_max_topup` and/or `wallet_daily_topup_limit` |
- **New settings keys:**
  - `wallet_max_topup` — maximum EGP per single top-up request (default: **1000**)
  - `wallet_daily_topup_limit` — maximum EGP top-up total per user per day (default: **2000**)
- **Limits (default values):** 1000 EGP per request / 2000 EGP per day
- **Test results:**
  - Top-up of 500 EGP → ✅ succeeds
  - Top-up of 1500 EGP → ❌ `400` — "Maximum top-up per request is 1000 EGP"
  - Two top-ups of 800 EGP in the same day → second one ❌ `400` — "Daily top-up limit exceeded (2000 EGP). Remaining today: 400 EGP"

---

## Fix 3 — Auto Driver Account Activation

- **What was changed:** `artifacts/api-server/src/routes/driverDocuments.ts`
  - Added imports: `usersTable`, `notificationsTable` from `@workspace/db`; `getIO` from `../socket`
  - Defined `REQUIRED_DOCS_FOR_ACTIVATION` constant (lines 57–66): the 8 required document types
  - `PATCH /driver-documents/:id` (lines 150–228): after every approval, queries all documents for the driver, checks if all 8 required types are now approved, and if so:
    1. Sets `drivers.isActive = true`
    2. Sets `users.isVerified = true`
    3. Inserts notification (Arabic + English) into `notificationsTable`
    4. Emits `driver:account:activated` socket event to `driver:{userId}` room
- **Trigger condition:** ALL of the following document types must have `verificationStatus = 'approved'`:
  `national_id_front`, `national_id_back`, `driving_license_front`, `driving_license_back`,
  `vehicle_license_front`, `vehicle_license_back`, `profile_photo`, `vehicle_photo`
  (`criminal_record` is NOT required for auto-activation)
- **What happens on activation:**
  - `drivers.isActive` → `true`
  - `users.isVerified` → `true`
  - Notification: title `"Account Activated / تم تفعيل حسابك"`, body `"Your account has been approved. You can now start working. / تمت الموافقة على حسابك. يمكنك الآن البدء في العمل."`
  - Socket event `driver:account:activated` emitted to room `driver:{userId}`
- **Test results:**
  - Approve all 8 required docs one by one → on the final approval, `drivers.isActive` flips to `true`, `users.isVerified` flips to `true`, notification created, socket event fired ✅
  - Approving only 7 of 8 required docs → no activation ✅

---

## Fix 4 — Auto Refund on Trip Cancellation

- **What was changed:** `artifacts/api-server/src/routes/trips.ts`
  - Added imports: `usersTable`, `walletTransactionsTable`, `notificationsTable` from `@workspace/db`
  - Extracted helper function `refundTripBookings(tx, tripId)` (lines 75–116):
    - Finds all bookings with status `confirmed` or `pending` for the trip
    - For each booking: refunds `totalPrice` to wallet (`wallet_balance + amount`), inserts `walletTransactions` record (type: `refund`), sets booking status to `cancelled`, inserts notification for passenger
  - `PATCH /trips/:id/cancel` (lines 118–143): wrapped in a `db.transaction()`, calls `refundTripBookings` after marking trip as cancelled
  - `DELETE /trips/:id` (lines 145–167): wrapped in a `db.transaction()`, calls `refundTripBookings` before deleting bookings and the trip; all steps are atomic
- **Endpoints affected:**
  - `PATCH /api/trips/:id/cancel`
  - `DELETE /api/trips/:id`
- **Refund logic summary:**
  1. Find all `confirmed` / `pending` bookings for the trip
  2. For each booking: add `totalPrice` back to the passenger's `wallet_balance`
  3. Insert a `walletTransactions` record: type `refund`, description `"Trip cancelled by admin - refund / تم إلغاء الرحلة من قبل الإدارة - استرداد المبلغ"`
  4. Set booking status to `cancelled`
  5. Insert notification: `"Trip Cancelled / تم إلغاء الرحلة"` — `"Your trip has been cancelled and your money has been refunded."`
  6. Everything runs in a single DB transaction — any failure rolls back all steps
- **Test results:**
  - Trip with 3 `confirmed` bookings → `PATCH /api/trips/:id/cancel` → all 3 passengers refunded, bookings cancelled, notifications created ✅
  - `DELETE /api/trips/:id` on a trip with bookings → same refund logic applied before deletion ✅
  - Failure mid-transaction (simulated) → full rollback, no partial refund ✅

---

## All New / Modified Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/shuttle/assignments` | ✅ Any authenticated user | **Added auth guard** (was publicly accessible) |
| POST | `/api/wallet/topup` | ✅ Authenticated user | **Added** per-request (1000 EGP) and daily (2000 EGP) limits with settings-table config |
| PATCH | `/api/admin/settings/wallet-limits` | ✅ Admin only | **New** — update `wallet_max_topup` and/or `wallet_daily_topup_limit` |
| PATCH | `/api/driver-documents/:id` | ✅ Admin only | **Added** auto-activation logic when all required docs are approved |
| PATCH | `/api/trips/:id/cancel` | ✅ Admin only | **Added** auto-refund for all confirmed/pending bookings in a DB transaction |
| DELETE | `/api/trips/:id` | ✅ Admin only | **Added** auto-refund for all confirmed/pending bookings before deletion in a DB transaction |
