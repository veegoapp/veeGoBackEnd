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

---

## Step 5: Production Hardening + Chat Completion

### 1. FILES MODIFIED

**Backend:**
- `artifacts/api-server/src/lib/jobQueue.ts` — NEW: in-memory job queue with enqueue, retry (max 3 attempts), exponential backoff (1s → 5s → 15s), dead-letter storage (last 500)
- `artifacts/api-server/src/lib/auditLog.ts` — UPDATED: `writeAuditLog()` now enqueues via `jobQueue.enqueue("audit_log", entry)` instead of direct DB insert
- `artifacts/api-server/src/lib/trace.ts` — NEW: `generateTraceId()` (UUID v4), `traceMiddleware` that assigns `req.traceId` on every request
- `artifacts/api-server/src/app.ts` — added `traceMiddleware` to middleware chain + import
- `artifacts/api-server/src/index.ts` — added `registerDefaultHandlers()` call on startup (registers audit_log, driver_location, rating, payment queue handlers)
- `artifacts/api-server/src/routes/driver.ts` — UPDATED: `void db.insert(driverLocationsTable)` → `jobQueue.enqueue("driver_location", payload)` · fixed `GET /driver/me/ratings` to read from `ratingsTable` (not `rideEventsTable`)
- `artifacts/api-server/src/routes/rides.ts` — UPDATED: `void db.insert(ratingsTable)` → `jobQueue.enqueue("rating", payload)`
- `lib/db/src/schema/ratings.ts` — UPDATED: added `uniqueIndex("uq_rating_rater_ride").on(table.raterId, table.rideId)` DB constraint
- `artifacts/api-server/vitest.config.ts` — NEW: vitest configuration (node environment, setup file, coverage)
- `artifacts/api-server/package.json` — added `"test"`, `"test:watch"`, `"test:coverage"` scripts
- `artifacts/api-server/tests/setup.ts` — NEW: vitest global setup (vi.clearAllMocks)
- `artifacts/api-server/tests/auditLogs.test.ts` — NEW: audit log tests
- `artifacts/api-server/tests/payments.test.ts` — NEW: payment job queue tests
- `artifacts/api-server/tests/ratings.test.ts` — NEW: ratings job queue + dedup tests

**Frontend:**
- `artifacts/admin-dashboard/src/pages/chat-inbox.tsx` — NEW: full admin chat inbox page
- `artifacts/admin-dashboard/src/App.tsx` — added `/chat-inbox` route + `ChatInbox` import
- `artifacts/admin-dashboard/src/components/layout/app-layout.tsx` — added "Chat Inbox" item to SYSTEM nav group with MessageSquare icon
- `artifacts/admin-dashboard/src/locales/en/translation.json` — added `nav.chatInbox: "Chat Inbox"`
- `artifacts/admin-dashboard/src/locales/ar/translation.json` — added `nav.chatInbox: "صندوق المحادثات"`

---

### 2. JOB QUEUE SYSTEM

**File:** `artifacts/api-server/src/lib/jobQueue.ts`

**Architecture:**
- In-memory queue (array) with a single async worker loop per process
- Worker uses `setImmediate` to avoid blocking the event loop on startup
- Jobs that are not yet due (scheduledAt > now) are re-queued with a short sleep

**Retry / backoff:**
| Attempt | Delay before retry |
|---|---|
| 1st failure | 1 second |
| 2nd failure | 5 seconds |
| 3rd failure (final) | Moved to dead letter queue |

**Dead letter queue:**
- Capped at 500 entries (oldest evicted first)
- Accessible via `jobQueue.deadLetterQueue` for monitoring
- Errors logged at `logger.error` level with job ID, type, and error message

**Job types registered:**
| Type | Handler action |
|---|---|
| `audit_log` | Insert into `audit_logs` table |
| `driver_location` | Insert into `driver_locations` table |
| `rating` | Insert into `ratings` table |
| `payment` | Insert into `payments` table (for non-transactional use) |

**Handlers are registered lazily** via `registerDefaultHandlers()` called once on server startup, after DB connection is verified.

---

### 3. RATINGS DATA CONSISTENCY FIX

**Problem:** `GET /driver/me/ratings` read rating counts from `rideEventsTable` (event log) instead of `ratingsTable` (source of truth).

**Fix:**
- `GET /driver/me/ratings` now queries `ratingsTable WHERE driver_id = ?` (up to 50 most recent, ordered newest first)
- Response now includes `ratingsCount` (integer) and full `ratings[]` array with id, score, comment, context, rideId, tripId, createdAt
- Average rating is still sourced from `drivers.rating` (pre-computed on each ride rating event)

**DB constraint added:**
```sql
CREATE UNIQUE INDEX uq_rating_rater_ride ON ratings(rater_id, ride_id);
```
- Prevents duplicate ratings at the DB level
- Postgres allows multiple NULL `ride_id` values under this constraint (correct behaviour for trip ratings where `ride_id IS NULL`)

---

### 4. OBSERVABILITY TRACE SYSTEM

**File:** `artifacts/api-server/src/lib/trace.ts`

**Features:**
- `generateTraceId()` — returns a UUID v4 (`crypto.randomUUID()`)
- `traceMiddleware` — Express middleware that:
  - Reads `x-trace-id` request header if provided by the caller
  - Otherwise generates a new UUID
  - Attaches to `req.traceId` (TypeScript global augmentation)
- Registered in `app.ts` after body-parser middleware
- All handlers that log errors can include `req.traceId` in log context

---

### 5. TEST AUTOMATION

**Test runner:** vitest (v4, ESM-compatible)
**Run tests:** `pnpm --filter @workspace/api-server run test`

**Test files:**

| File | Covers |
|---|---|
| `tests/auditLogs.test.ts` | `writeAuditLog` enqueues correct job type and payload; does not throw on queue failure; vehicle CREATE triggers audit_log enqueue |
| `tests/payments.test.ts` | Payment job enqueued with `completed` status on ride completion; `refunded` status on booking cancellation; booking complete creates correct job |
| `tests/ratings.test.ts` | Rating job enqueued with correct rater/driver IDs; score stored as string for DB precision; duplicate detection note; jobQueue has `enqueue` method |

**Approach:** Unit tests with `vi.mock` to isolate the job queue. DB is fully mocked — tests run without a live DB connection.

---

### 6. CHAT SYSTEM COMPLETION

**Backend (already existed, no changes needed):**
All required endpoints were already implemented in `artifacts/api-server/src/routes/chat.ts`:
- `POST /trips/:id/chat` — passenger/driver/admin sends a message
- `GET /trips/:id/chat` — trip chat history
- `GET /admin/chat` — grouped conversations list (paginated)
- `GET /admin/chat/stats` — unread counts
- `GET /admin/chat/trip/:id` — thread view + marks as read
- `POST /admin/chat/trip/:id` — admin sends into a trip
- `PATCH /admin/chat/messages/:id/read` — mark single message read
- Socket events: `trip:chat-message`, `admin:new-chat-message` broadcast on every send

**Frontend — New page `/chat-inbox`:**

**Layout:** Split-pane — conversation list (left, 320px) + message thread (right, fills remaining space)

**Conversation list:**
- Shows all trip conversations sorted by latest message descending
- Each row: Trip #N, trip status badge, passenger name + driver name, last message preview with sender prefix, time-ago timestamp, total message count
- Unread count badge (blue) shown when `unread_count > 0`
- Selected conversation has left border highlight

**Message thread:**
- Loads on conversation click via `GET /admin/chat/trip/:id`
- Messages displayed as chat bubbles: admin messages aligned right (primary color), passenger (blue tones) + driver (green tones) aligned left
- Each bubble shows sender type badge + icon + timestamp
- Auto-scrolls to bottom on new messages
- Admin reply input at the bottom (Enter to send, Shift+Enter for newline)
- Refresh button for manual re-fetch

**Real-time updates:**
- Socket.io connection established on mount with access token
- Listens for `admin:new-chat-message` and `trip:chat-message`
- On event: invalidates conversation list + stats + current thread (if event matches selected trip)
- Live indicator (pinging green dot) in page header

**Stats bar:**
- Total Messages, Unread count (highlighted in primary color), Trip Conversations
- Sourced from `GET /admin/chat/stats`, refreshed every 30 seconds

---

### 7. API ENDPOINTS (new/changed)

| Method | Endpoint | Auth | Change |
|---|---|---|---|
| GET | `/api/driver/me/ratings` | driver | FIXED: now reads from `ratingsTable` instead of `rideEventsTable`; returns `ratings[]` array |

All chat endpoints were already registered. No new backend routes added in this step.

---

### 8. MANUAL TESTING STEPS

**Job Queue:**
1. Start the API server — verify log line `"Job queue handlers registered"` appears
2. Create a vehicle in admin → verify audit log appears in Audit Logs page (job processed asynchronously)
3. Call `PATCH /driver/location` as a driver → verify a row appears in `driver_locations` table
4. Rate a driver via `POST /rides/:id/rate-driver` → verify row appears in `ratings` table

**Ratings dedup:**
1. Rate the same driver for the same ride twice → second attempt returns 409 from `rideEventsTable` check (before hitting DB constraint)
2. Verify `GET /driver/me/ratings` returns individual rating rows in the `ratings` array

**Trace system:**
1. Make any API request → check server logs for `traceId` field
2. Pass `x-trace-id: my-custom-trace` header → verify same ID echoed in server logs

**Tests:**
1. Run `pnpm --filter @workspace/api-server run test`
2. All 3 test files should pass

**Chat Inbox:**
1. Sidebar → SYSTEM → **Chat Inbox** → page loads with stats bar
2. Send a message in a trip (via `POST /trips/:id/chat`) → conversation appears in list
3. Click conversation → message thread opens, message visible
4. Type a reply as admin → hit Enter → message sent, thread updates
5. Send another message from trip → thread auto-refreshes (real-time via socket)
6. Unread badge disappears after opening conversation (marked read server-side)
