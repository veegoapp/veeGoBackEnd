# Feature Reports — Monorepo Integration

---

## Step 1: Audit Logs

### 1. FILES MODIFIED

**Backend:**
- `artifacts/api-server/src/lib/auditLog.ts` — NEW: `writeAuditLog()` utility + `getClientIp()` helper
- `artifacts/api-server/src/routes/auditLogs.ts` — NEW: GET endpoints for admin audit log access
- `artifacts/api-server/src/routes/index.ts` — registered `auditLogsRouter`
- `artifacts/api-server/src/routes/vehicles.ts` — added `writeAuditLog` calls on POST/PATCH/DELETE
- `artifacts/api-server/src/routes/buses.ts` — added `writeAuditLog` calls on POST/PATCH/DELETE
- `artifacts/api-server/src/routes/drivers.ts` — added `writeAuditLog` calls on POST/PATCH/DELETE
- `artifacts/api-server/src/routes/zones.ts` — added `writeAuditLog` calls on POST/PATCH/DELETE
- `artifacts/api-server/src/routes/promo.ts` — added `writeAuditLog` calls on POST/PATCH/DELETE

**Frontend:**
- `artifacts/admin-dashboard/src/pages/audit-logs.tsx` — NEW: full audit logs page with table, filters, pagination, detail dialog
- `artifacts/admin-dashboard/src/App.tsx` — added import + `/audit-logs` route
- `artifacts/admin-dashboard/src/components/layout/app-layout.tsx` — added "Audit Logs" sidebar item under SYSTEM group
- `artifacts/admin-dashboard/src/locales/en/translation.json` — added `nav.auditLogs` + `auditLogs.*` keys
- `artifacts/admin-dashboard/src/locales/ar/translation.json` — added `nav.auditLogs` + `auditLogs.*` keys (Arabic)

**Migrations/Schema:**
- No schema changes required. `audit_logs` table already existed in DB schema and was pushed previously.

---

### 2. DATABASE CHANGES

| Table | Change |
|---|---|
| `audit_logs` | NOW ACTIVE — was previously created but unused |

**Schema (pre-existing):**
```
audit_logs (
  id          serial PRIMARY KEY,
  user_id     integer REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,         -- CREATE / UPDATE / DELETE
  entity_type text NOT NULL,         -- vehicle / bus / driver / zone / promo_code / ...
  entity_id   integer,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz DEFAULT now()
)
```

**Indexes:** `idx_audit_logs_user_id`, `idx_audit_logs_action`, `idx_audit_logs_entity_type`, `idx_audit_logs_created_at`

---

### 3. DISPATCH / BUSINESS LOGIC

**Audit write behavior:**
- All writes are fire-and-forget (`void writeAuditLog(...)`) — they do NOT block the main response
- Failures are caught and logged via pino logger — they do NOT surface to the API caller
- `userId` is extracted from `req.user.id` (set by `authenticate` middleware)
- `ipAddress` is resolved from `x-forwarded-for` header first, then `req.ip`
- `oldData` is fetched before mutation for UPDATE operations; null for DELETE/CREATE where not applicable
- Entities covered: `vehicle`, `bus`, `driver`, `zone`, `promo_code`

---

### 4. API ENDPOINTS

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/audit-logs` | admin | List audit logs, paginated (25/page default) |
| GET | `/api/admin/audit-logs/:id` | admin | Single log detail |
| GET | `/api/admin/audit-logs/distinct/actions` | admin | List distinct action values for filter dropdown |
| GET | `/api/admin/audit-logs/distinct/entity-types` | admin | List distinct entity types for filter dropdown |

**Query params for GET /admin/audit-logs:**
```
page        integer  (default: 1)
limit       integer  (default: 25, max: 100)
action      string   — filter by action (CREATE/UPDATE/DELETE)
entityType  string   — filter by entity type
userId      integer  — filter by admin user
from        datetime — filter from date (ISO 8601)
to          datetime — filter to date (ISO 8601)
```

**Response shape:**
```json
{
  "data": [{
    "id": 1,
    "userId": 5,
    "action": "CREATE",
    "entityType": "vehicle",
    "entityId": 12,
    "oldData": null,
    "newData": { "plateNumber": "ABC123", ... },
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "createdAt": "2026-05-31T10:00:00Z",
    "adminName": "John Admin",
    "adminEmail": "john@example.com"
  }],
  "total": 150,
  "page": 1,
  "limit": 25
}
```

---

### 5. SOCKET / REALTIME EVENTS

None. Audit logs are read-only/historical. No real-time events required.

---

### 6. FRONTEND IMPACT

**Admin Dashboard — new page `/audit-logs`:**
- Accessible via sidebar under SYSTEM group (above Settings)
- Table view: ID, Action badge (color-coded green/blue/red), Entity + ID, Admin name/email, IP address, Timestamp
- Filter dropdowns: by Action, by Entity Type (populated dynamically from DB)
- Clear Filters button shown when filters are active
- Pagination: 25 records/page with prev/next controls + page count
- Detail dialog: shows full before/after JSON snapshots, IP, user agent
- Refresh button for manual re-fetch
- Skeleton loading states
- Fully translated (EN + AR)

---

### 7. MANUAL TESTING STEPS

1. Log in as admin
2. Navigate to **Vehicles** → create a new vehicle
3. Navigate to **SYSTEM → Audit Logs** in sidebar
4. Verify a `CREATE / vehicle` entry appears with your admin name and IP
5. Edit the vehicle → verify an `UPDATE / vehicle` entry appears with oldData vs newData diff
6. Delete the vehicle → verify a `DELETE / vehicle` entry appears
7. Test filters: select `Action = CREATE` → only CREATE rows visible
8. Test filters: select `Entity Type = vehicle` → only vehicle rows visible
9. Click the eye icon on any row → detail dialog shows full JSON snapshots
10. Repeat steps 2-6 for: Buses (create/edit/delete), Drivers, Zones, Promo Codes
11. Verify all entries are logged correctly in audit logs page

---

## Step 2: Driver Locations + User Locations

### 1. FILES MODIFIED

**Backend:**
- `artifacts/api-server/src/routes/locations.ts` — NEW: all location endpoints (admin read + user self-service)
- `artifacts/api-server/src/routes/driver.ts` — added `driverLocationsTable` import + fire-and-forget history insert inside `PATCH /driver/location`
- `artifacts/api-server/src/routes/index.ts` — registered `locationsRouter`

**Frontend:**
- `artifacts/admin-dashboard/src/pages/driver-detail.tsx` — added "Location History" tab + `DriverLocationHistoryTab` component
- `artifacts/admin-dashboard/src/pages/user-detail.tsx` — added "Saved Locations" tab + `UserSavedLocationsTab` component
- `artifacts/admin-dashboard/src/locales/en/translation.json` — added `locations.*` keys (EN)
- `artifacts/admin-dashboard/src/locales/ar/translation.json` — added `locations.*` keys (AR)

**Migrations/Schema:**
- No schema changes required. `driver_locations` and `user_locations` tables already existed and were pushed previously.

---

### 2. DATABASE CHANGES

| Table | Change |
|---|---|
| `driver_locations` | NOW ACTIVE — every `PATCH /driver/location` call inserts a timestamped history row |
| `user_locations` | NOW ACTIVE — user self-service CRUD + admin read view |

**driver_locations schema:**
```
driver_locations (
  id          serial PRIMARY KEY,
  driver_id   integer REFERENCES drivers(id) ON DELETE CASCADE,
  latitude    real NOT NULL,
  longitude   real NOT NULL,
  speed       real,
  heading     real,
  recorded_at timestamptz DEFAULT now()
)
```

**user_locations schema:**
```
user_locations (
  id          serial PRIMARY KEY,
  user_id     integer REFERENCES users(id) ON DELETE CASCADE,
  label       text DEFAULT 'other',   -- 'home' | 'work' | 'other'
  name        text NOT NULL,
  address     text NOT NULL,
  latitude    real NOT NULL,
  longitude   real NOT NULL,
  is_default  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
)
```

---

### 3. DISPATCH / BUSINESS LOGIC

**Driver location history:**
- Every call to `PATCH /driver/location` ALSO fire-and-forgets an insert into `driver_locations`
- This does NOT block or affect the existing location update response
- History rows accumulate indefinitely, ordered by `recorded_at DESC`

**User saved locations:**
- Only one location may be `is_default = true` per user at a time
- Setting a new location as default auto-clears any previous default for that user
- Users can only modify their own saved locations (enforced by `userId = req.user.id`)

---

### 4. API ENDPOINTS

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/driver-locations?driverId=X` | admin | Paginated location history for a driver |
| GET | `/api/admin/driver-locations/:driverId/latest` | admin | Latest single location for a driver |
| GET | `/api/admin/user-locations?userId=X` | admin | All saved locations for a user |
| GET | `/api/user/locations` | user | User's own saved locations |
| POST | `/api/user/locations` | user | Create a saved location |
| PATCH | `/api/user/locations/:id` | user | Update a saved location |
| DELETE | `/api/user/locations/:id` | user | Delete a saved location |

**GET /admin/driver-locations query params:**
```
driverId  integer  REQUIRED
page      integer  (default: 1)
limit     integer  (default: 50, max: 200)
```

---

### 5. SOCKET / REALTIME EVENTS

None. Location history is read-only/historical. Real-time location updates continue via existing WebSocket `driver:location` events on the driver router.

---

### 6. FRONTEND IMPACT

**Driver Detail page — new "Location History" tab:**
- Table: Latitude, Longitude, Speed (km/h), Heading (degrees), Timestamp
- Paginated: 50 records/page with prev/next controls
- Empty state shown when no history exists
- Skeleton loading
- Fully translated (EN + AR)

**User Detail page — new "Saved Locations" tab:**
- Table: Label (home/work/other with icon), Name, Address, Coordinates, Default badge, Created date
- Non-paginated (typically ≤10 locations per user)
- Default location highlighted with green badge
- Empty state shown when user has no saved locations
- Skeleton loading
- Fully translated (EN + AR)

---

### 7. MANUAL TESTING STEPS

**Driver Location History:**
1. Log in as a driver (mobile app or API) and call `PATCH /driver/location` with lat/lng/speed/heading
2. In Admin Dashboard, navigate to any Driver Detail page
3. Click the **Location History** tab
4. Verify location rows appear with correct coordinates, speed, heading, and timestamp
5. Call `PATCH /driver/location` multiple times → verify new rows accumulate (newest first)
6. Test pagination if > 50 rows exist

**User Saved Locations:**
1. Log in as a user and call `POST /user/locations` to create home/work/other locations
2. In Admin Dashboard, navigate to any User Detail page
3. Click the **Saved Locations** tab
4. Verify saved locations appear with correct label icon, name, address, coordinates
5. The default location (if any) should show a green "Default" badge
6. Create a second location with `isDefault: true` → verify the first default is cleared

---

## Step 3: Payments

### 1. FILES MODIFIED

**Backend:**
- `artifacts/api-server/src/routes/payments.ts` — NEW: admin payments endpoints (list, summary, detail, PATCH status)
- `artifacts/api-server/src/routes/bookings.ts` — added `paymentsTable` import + insert on booking confirmation (completed) + cancellation (refunded)
- `artifacts/api-server/src/routes/rides.ts` — added `paymentsTable` import + insert in both PATCH and POST (legacy) ride completion flows
- `artifacts/api-server/src/routes/index.ts` — registered `paymentsRouter`

**Frontend:**
- `artifacts/admin-dashboard/src/pages/payments.tsx` — added `PaymentLedgerView` component + tab navigation bar (Payment Ledger | Wallets | Driver Payouts | Commission)

**Migrations/Schema:**
- No schema changes required. `payments` table already existed and was pushed previously.

---

### 2. DATABASE CHANGES

| Table | Change |
|---|---|
| `payments` | NOW ACTIVE — written on every booking payment, booking refund, and completed ride |

**Write triggers:**
- `POST /bookings` (booking confirmation via wallet) → inserts `method: "wallet", status: "completed"`
- `PATCH /bookings/:id/cancel` (if booking was paid) → inserts `method: "wallet", status: "refunded"`
- `PATCH /driver/rides/:id/complete` (ride completion) → inserts `method: "wallet", status: "completed"`
- `POST /driver/rides/:id/complete` (legacy alias) → same as above

**payments schema:**
```
payments (
  id               serial PRIMARY KEY,
  user_id          integer REFERENCES users(id) ON DELETE CASCADE,
  booking_id       integer REFERENCES bookings(id) ON DELETE SET NULL,
  ride_id          integer REFERENCES rides(id) ON DELETE SET NULL,
  amount           numeric(12,2) NOT NULL,
  method           payment_method NOT NULL DEFAULT 'wallet',   -- wallet | cash | card
  status           payment_tx_status NOT NULL DEFAULT 'pending',-- pending | completed | failed | refunded
  transaction_ref  text,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
)
```

---

### 3. DISPATCH / BUSINESS LOGIC

- Payments are written INSIDE the same DB transaction as the booking/ride to ensure atomicity
- One payment record per booking (not per seat)
- One payment record per ride completion
- Refunds create a separate payment record with `status: "refunded"` (distinct from the original payment record)
- Admin can update `status` (pending→completed, pending→failed) and add `notes`/`transactionRef` for manual reconciliation

---

### 4. API ENDPOINTS

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/payments` | admin | List payments, paginated + filtered |
| GET | `/api/admin/payments/summary` | admin | Aggregate stats (counts + amounts by status/method) |
| GET | `/api/admin/payments/:id` | admin | Single payment detail with user info |
| PATCH | `/api/admin/payments/:id` | admin | Update status, notes, transactionRef |

**GET /admin/payments query params:**
```
page        integer  (default: 1)
limit       integer  (default: 25, max: 100)
status      string   — pending | completed | failed | refunded
method      string   — wallet | cash | card
userId      integer
bookingId   integer
rideId      integer
from        datetime — ISO 8601
to          datetime — ISO 8601
```

---

### 5. SOCKET / REALTIME EVENTS

None. Payment records are historical. No real-time events required.

---

### 6. FRONTEND IMPACT

**Payments page — new tab structure:**
The payments page at `/payments` now has 4 tabs at the top:
1. **Payment Ledger** (new — default) — shows `paymentsTable` data
2. **Wallets** (existing) — wallet transaction history
3. **Driver Payouts** (existing) — driver earnings with payout confirmation
4. **Commission** (existing) — commission rate settings

**Payment Ledger tab:**
- Summary cards: total payments, completed (EGP), refunded (EGP), pending+failed count
- Filters: status (all/completed/pending/refunded/failed) + method (all/wallet/cash/card)
- Table: ID, user (name + email), reference (Booking#N or Ride#N), method badge with icon, status badge (color-coded), amount (green for completed, blue for refunded), date
- Detail dialog: full payment info + action buttons (pending payments can be marked completed or failed)
- Pagination: 25 records/page

---

### 7. MANUAL TESTING STEPS

1. Navigate to **Payments** in the sidebar → you should see the new 4-tab nav
2. The **Payment Ledger** tab opens by default (initially empty until bookings/rides happen)
3. Create a booking as a user → navigate back to Payment Ledger → verify a "completed / wallet" entry appears
4. Cancel the booking → verify a new "refunded / wallet" entry appears
5. Complete a ride → verify a "completed / wallet / Ride#N" entry appears
6. Test filters: select "Completed" → only completed rows show
7. Test filters: select "Wallet" method → only wallet rows show
8. Click the eye icon on any row → detail dialog shows all fields
9. On a "pending" payment → click "Mark Completed" or "Mark Failed" → verify status updates
10. Check summary cards update correctly when filters change

---

## Step 4: Ratings

### 1. FILES MODIFIED

**Backend:**
- `artifacts/api-server/src/routes/ratings.ts` — NEW: admin ratings endpoints + user endpoint
- `artifacts/api-server/src/routes/rides.ts` — added `ratingsTable` import + insert in `POST /rides/:id/rate-driver`
- `artifacts/api-server/src/routes/index.ts` — registered `ratingsRouter`

**Frontend:**
- `artifacts/admin-dashboard/src/pages/ratings.tsx` — NEW: full ratings & reviews page
- `artifacts/admin-dashboard/src/components/layout/app-layout.tsx` — added "Ratings" item to SYSTEM nav group + imported `Star` icon
- `artifacts/admin-dashboard/src/App.tsx` — added `/ratings` route + imported `Ratings` page
- `artifacts/admin-dashboard/src/locales/en/translation.json` — added `nav.ratings` + full `ratings.*` section
- `artifacts/admin-dashboard/src/locales/ar/translation.json` — same in Arabic

---

### 2. DATABASE CHANGES

| Table | Change |
|---|---|
| `ratings` | NOW ACTIVE — written on every `POST /rides/:id/rate-driver` call |

**Write trigger:**
- `POST /rides/:id/rate-driver` (user rates driver after completed ride):
  - Continues to write to `rideEventsTable` (DRIVER_RATED) — existing behavior preserved
  - NOW ALSO writes to `ratingsTable` (raterId, driverId, rideId, context: "ride", score, comment)

**ratings schema:**
```
ratings (
  id          serial PRIMARY KEY,
  rater_id    integer REFERENCES users(id) ON DELETE CASCADE,
  driver_id   integer REFERENCES drivers(id) ON DELETE CASCADE,
  trip_id     integer REFERENCES trips(id) ON DELETE SET NULL,
  ride_id     integer REFERENCES rides(id) ON DELETE SET NULL,
  context     rating_context NOT NULL DEFAULT 'trip',
  score       numeric(2,1) NOT NULL,
  comment     text,
  created_at  timestamptz DEFAULT now()
)
```

---

### 3. DISPATCH / BUSINESS LOGIC

- `ratingsTable` write is fire-and-forget (void) so it cannot block the API response
- Duplicate-rating protection enforced at `rideEventsTable` level (409) naturally prevents duplicate `ratingsTable` entries
- `GET /driver/me/ratings` was NOT changed — still reads from `rideEventsTable` (mobile app source of truth)
- `POST /driver/rides/:id/rate-rider` was NOT hooked in — `ratingsTable` has no `rider_id` column, it stores driver ratings only

---

### 4. API ENDPOINTS

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/ratings` | admin | List ratings, paginated + filtered |
| GET | `/api/admin/ratings/stats` | admin | Avg score, distribution, context counts |
| GET | `/api/admin/ratings/:id` | admin | Single rating detail |
| DELETE | `/api/admin/ratings/:id` | admin | Delete rating + audit log |
| GET | `/api/user/ratings/given` | any | User's own given ratings |

**GET /admin/ratings query params:** page, limit, driverId, raterId, context, minScore, maxScore, from, to

---

### 5. FRONTEND IMPACT

**New page: `/ratings`** — reachable from SYSTEM sidebar group (⭐ icon)

- **Summary cards:** Average Score (stars visual), Total Ratings (ride/trip badges), Score Distribution (5 mini bars)
- **Filters:** Context (all/ride/shuttle), Min score (all/4★+/3★+/1-2★)
- **Table:** ID, Passenger, Driver, Score (stars), Context badge, Comment, Date
- **Row actions:** Eye (detail dialog) + Trash (delete confirmation)
- **Detail dialog:** full rating info + Delete button for moderation
- **Pagination:** 25 records/page

---

### 6. MANUAL TESTING STEPS

1. Sidebar → **Ratings** (SYSTEM group) → page loads
2. Complete a ride as user → call `POST /rides/:id/rate-driver` `{ rating: 4, comment: "Good!" }`
3. Ratings page → new entry appears: passenger name, driver, 4-star display, "ride" badge
4. Filter "4★ and above" → entry shows; "Low scores" → entry disappears
5. Eye icon → detail dialog shows all fields correctly
6. Delete → confirmation → rating removed → total count drops
7. Audit Logs page → DELETE entry for the rating appears
