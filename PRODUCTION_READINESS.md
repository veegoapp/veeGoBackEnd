# Production Readiness Report — VeeGo Admin Platform

**Date:** June 3, 2026  
**Scope:** `artifacts/api-server` (Express 5 + Drizzle ORM + Socket.IO) and `artifacts/admin-dashboard` (React + Vite)

---

## Section 1 — Must Fix Before Launch

These issues will cause data loss, security breaches, or complete service failures in production.

---

### 1.1 Uploaded files are stored on local disk and will be lost on redeploy

**What:** Driver documents (license photos, profile pictures, vehicle images) are written to an `uploads/` directory on the local filesystem via `multer`'s `diskStorage` engine.

**Where:** `artifacts/api-server/src/routes/driverDocuments.ts` (multer config), `artifacts/api-server/src/app.ts` (static serve at `/api/uploads`).

**Fix:** Move file storage to an object storage service (S3, R2, GCS, etc.) before going live. The local disk on a cloud deployment can be wiped on any redeploy, container restart, or horizontal scale event. All existing uploaded documents would be permanently deleted and `fileUrl` database records would point to nothing.

---

### 1.2 Global error handler leaks internal error messages to clients

**What:** The Express global error handler returns `err.message` directly in the JSON response body. On a database error this will expose table names, column names, constraint names, or internal query logic to any user who triggers a 500.

**Where:** `artifacts/api-server/src/app.ts` — the final `app.use((err, req, res, next) => ...)` error handler.

**Fix:** In production, return a generic message (`"An unexpected error occurred"`) and log the real error server-side only. Gate the full error on `NODE_ENV !== "production"`.

---

### 1.3 CORS allows any Replit subdomain — exploitable from third-party repls

**What:** The CORS origin whitelist uses a regex that matches any subdomain of `replit.dev`, `*.kirk.replit.dev`, and `*.expo.dev`. Any malicious app published on Replit can make authenticated cross-origin requests to the API using a victim's session cookies or tokens.

**Where:** `artifacts/api-server/src/app.ts` lines 24–41.

**Fix:** Replace the regex with an explicit allowlist of the exact domains that will serve the admin dashboard and any mobile app in production. Remove all localhost entries from the production config (gate them on `NODE_ENV !== "production"`).

---

### 1.4 Multi-step financial operations run without database transactions

**What — shuttle activation/completion:** `POST /shuttle/lines/:id/activate` and `POST /shuttle/lines/:id/complete` update rows across the `routes`, `trips`, and `bookings` tables in separate queries with no wrapping transaction. A server crash or network interruption mid-sequence can leave trips marked "completed" while their bookings remain "confirmed", or vice versa — permanent inconsistency with no recovery path.

**What — ride request:** `POST /rides` inserts a ride row and then inserts a `ride_event` row in two separate calls. If the server crashes between them, there is a ride record with no audit event.

**Where:** `artifacts/api-server/src/routes/shuttle.ts` lines 249–320; `artifacts/api-server/src/routes/rides.ts` lines 390–412.

**Fix:** Wrap every multi-table write in `db.transaction(async (tx) => { ... })`. Use the transaction-scoped `tx` client for all queries inside that block.

---

### 1.5 Race condition in wallet balance updates — double-spend possible

**What:** Ride completion deducts from the passenger wallet balance and credits driver earnings in a transaction, but does not acquire a row-level lock on the user row before reading the balance. Two concurrent ride completions for the same user (e.g. a passenger booking two rides that finish at the same second) will both read the same starting balance, and one deduction will be silently lost.

Similarly, wallet top-up in `wallet.ts` uses an `sql` increment expression but without a `FOR UPDATE` read lock, creating the same window.

**Where:** `artifacts/api-server/src/routes/rides.ts` lines 837–871; `artifacts/api-server/src/routes/wallet.ts` lines 42–72.

**Fix:** Inside any transaction that reads-then-writes a balance, first execute `SELECT ... FOR UPDATE` on the user row to serialise concurrent writes.

---

### 1.6 Driver slot booking has a race condition — double-booking possible

**What:** `POST /shuttle/lines/:id/book` checks for schedule conflicts and then inserts a booking in two separate operations with no transaction and no row lock. Two drivers submitting at the same millisecond will both pass the conflict check and both be booked into the same slot.

**Where:** `artifacts/api-server/src/routes/shuttle.ts` lines 538–578.

**Fix:** Wrap the conflict check and the insert in a single transaction and use `SELECT ... FOR UPDATE` on the relevant slot row, or add a unique database constraint that makes the second insert fail and handle the error gracefully.

---

### 1.7 Several route handlers have no try/catch — unhandled rejections crash the process

**What:** Multiple route handlers perform database operations without any error handling. An unexpected database error (connection drop, constraint violation, timeout) will throw an unhandled promise rejection. In Node.js this either crashes the process or triggers a deprecation warning that silently swallows the error depending on the version.

**Where (non-exhaustive):**
- `artifacts/api-server/src/routes/zones.ts` — `GET /zones/:id` and `DELETE /zones/:id`
- `artifacts/api-server/src/routes/bookings.ts` — `GET /bookings/:id`

**Fix:** Wrap every async route handler body in `try/catch` and forward to `next(err)`. Consider a higher-order `asyncHandler` wrapper to enforce this uniformly.

---

### 1.8 `requirePermission` middleware exists but is never applied to admin routes

**What:** `artifacts/api-server/src/middlewares/auth.ts` defines a `requirePermission(permission)` middleware for fine-grained staff access control. However, every route in `artifacts/api-server/src/routes/admin.ts` only uses `requireRole("admin")`. This means every staff account with the `admin` role — regardless of their assigned permissions — can perform any administrative action: blocking users, issuing wallet refunds, changing commission rates, reading full passenger timelines, etc.

**Where:** All routes in `artifacts/api-server/src/routes/admin.ts`.

**Fix:** Replace blanket `requireRole("admin")` calls with specific `requirePermission("...")` checks that match the action being performed. The middleware is already written — it just needs to be applied.

---

### 1.9 Schema migrations use `drizzle-kit push` — destructive in production

**What:** The project uses `drizzle-kit push`, which introspects the schema and applies the diff directly to the live database. This approach can silently drop columns, rename things, or delete data when the schema changes. There is no migration history and no way to roll back.

**Where:** `lib/db/package.json` — `"push": "drizzle-kit push"`.

**Fix:** Switch to `drizzle-kit generate` + `drizzle-kit migrate` (or a migration runner like `db-migrate` or `flyway`) before launch. Generate the initial migration from the current schema, and treat all future schema changes as versioned, reviewed SQL files.

---

### 1.10 OTP endpoint has no rate limiting — brute-forceable in minutes

**What:** The `/auth/verify-otp` endpoint accepts a 6-digit code. There are 1,000,000 possible codes. The general `apiLimiter` allows 200 requests per 15 minutes per IP. An attacker can enumerate all codes for a target phone number in approximately 83 hours from a single IP — much less from multiple IPs. There is no per-phone-number attempt counter.

**Where:** `artifacts/api-server/src/routes/auth.ts` — OTP verification handler.

**Fix:** Add a per-phone-number rate limit (e.g. 5 attempts before a 10-minute lockout) stored in Redis or in the database, separate from and in addition to the IP-based limiter. Lock the OTP after first use regardless.

---

## Section 2 — Should Fix Soon

These issues will not destroy data, but they will cause visible failures, confused users, or make debugging in production very difficult.

---

### 2.1 No React Error Boundaries — one component crash kills the entire dashboard

**What:** There are zero `ErrorBoundary` components in the frontend. If any component throws during render (e.g. a chart receives unexpected data shape, the map library fails to load, a `new Date()` call gets `null`), the entire dashboard goes blank. The user sees a white screen with no explanation.

**Where:** `artifacts/admin-dashboard/src/` — no ErrorBoundary exists anywhere.

**Fix:** Wrap the `<AppLayout>` and individually complex widgets (the MapLibre map, recharts charts) in React Error Boundaries that render a fallback UI ("This section failed to load. Try refreshing.") instead of crashing the page.

---

### 2.2 API query errors are invisible — users see "No data" instead of "Something went wrong"

**What:** The vast majority of `useQuery` calls in the dashboard only check `isLoading` and render the data or an empty state. They never check `isError`. When the API returns a 500, the query fails silently and the component renders as if the database were simply empty — drivers page shows "No drivers found", bookings shows "No bookings", etc. There is no way for the user or an operator to know whether the data is genuinely empty or whether the backend is on fire.

**Where:** Affects most pages: `drivers.tsx`, `users.tsx`, `bookings.tsx`, `trips.tsx`, `vehicles.tsx`, `reports.tsx`, and others.

**Fix:** Add `isError` checks to every primary data query and render a visible error state (an alert card with a "Retry" button) when `isError === true`.

---

### 2.3 Dashboard analytics fires dozens of separate COUNT queries on every load

**What:** The dashboard summary endpoint resolves via `Promise.all` with many individual `count(*)` queries — one per metric. As traffic grows, this means a single page load triggers a large fan-out of database round trips, each with its own connection overhead.

**Where:** `artifacts/api-server/src/routes/dashboard.ts`.

**Fix:** Consolidate related counts into single queries using `CASE WHEN` aggregates or CTEs. This reduces both latency and database connection pressure.

---

### 2.4 Several list endpoints have no pagination — will time out at scale

**What:** The following endpoints return every row in their table unconditionally. With real data they will become slow and then start returning 500s:

- `GET /shuttle/lines` — returns all shuttle lines
- `GET /shuttle/assignments` — returns all driver assignments  
- `GET /shuttle/trips/:id/passengers` — returns all passengers for a trip
- `GET /driver-documents` — returns all documents across all drivers
- `GET /chat/rooms` — returns all chat rooms

**Where:** `artifacts/api-server/src/routes/shuttle.ts`, `driverDocuments.ts`, `chat.ts`.

**Fix:** Add `page`/`limit` query parameters and a `total` count in the response for each of these endpoints, matching the pattern already used by the bookings and users endpoints.

---

### 2.5 Audit logs are fire-and-forget — failures are silently swallowed

**What:** All calls to `writeAuditLog(...)` are prefixed with `void` and not awaited. If the audit log write fails (e.g. database constraint violation, table full), the error is swallowed entirely. Administrative actions (blocking a user, issuing a refund, changing commission rates) may go unlogged with no indication.

**Where:** Throughout `artifacts/api-server/src/routes/admin.ts`, `zones.ts`, and others.

**Fix:** At minimum, `.catch(err => logger.error("audit log failed", err))` on every audit log call so failures are visible in server logs. For regulated operations (wallet adjustments, user blocks), consider making the audit log write part of the same transaction as the action.

---

### 2.6 JWT refresh secret is derived from session secret by string concatenation

**What:** In `lib/jwt.ts`, `REFRESH_SECRET` is set to `SESSION_SECRET + "-refresh"`. If the session secret leaks (e.g. from an env dump, a log line, or a breach), the refresh secret is immediately computable. Refresh tokens have a much longer lifetime than access tokens, so this significantly extends the blast radius of a secret compromise.

**Where:** `artifacts/api-server/src/lib/jwt.ts`.

**Fix:** Generate `REFRESH_SECRET` as a separate, independent random string in the environment, unrelated to `SESSION_SECRET`.

---

### 2.7 bcrypt cost factor is inconsistent — some passwords are weaker than others

**What:** User passwords created through the main auth flow use `bcrypt.hash(password, 12)`. Driver passwords created through `driver.ts` use `bcrypt.hash(password, 10)`. Cost factor 10 is noticeably faster to crack than 12 with modern GPU rigs.

**Where:** `artifacts/api-server/src/routes/auth.ts` vs `artifacts/api-server/src/routes/driver.ts`.

**Fix:** Standardise on cost factor 12 (or higher) across all password hashing calls.

---

### 2.8 `staff.tsx` uses a private fetch implementation instead of the shared `adminFetch`

**What:** The Staff management page implements its own `apiFetch` function with its own auth header logic, bypassing the centralised `adminFetch` from `@/lib/api`. If auth handling, base URL, or error handling changes in the central client, the Staff page will not pick up the change.

**Where:** `artifacts/admin-dashboard/src/pages/staff.tsx` lines 19–34.

**Fix:** Delete the local `apiFetch` and replace all calls with the shared `adminFetch`.

---

### 2.9 Commission pricing PATCH accepts unvalidated partial updates

**What:** `PATCH /admin/rides/pricing/:vehicleType` merges the request body using `updates as any` without validating the resulting merged object. It is possible to submit `{ baseFare: -999 }` and have it saved to the database, causing all subsequent ride price calculations to return negative or nonsensical fares.

**Where:** `artifacts/api-server/src/routes/admin.ts` — the pricing update handler.

**Fix:** After merging the update, validate the complete resulting object with a Zod schema that enforces positive numbers, sensible minimums, and required fields before writing to the database.

---

## Section 3 — Nice to Have

These are real gaps but they will not break core functionality on day one.

---

### 3.1 No database-level constraint prevents seat count going negative

**What:** The booking flow correctly checks `available_seats > 0` before confirming a booking, but this check is enforced only in application code. There is no `CHECK (available_seats >= 0)` constraint in the `trips` table. A bug in any booking path (including a future one) could push seat counts below zero.

**Where:** `lib/db/src/schema/` — `trips` table definition.

**Fix:** Add `CHECK (available_seats >= 0)` to the `trips` table in the schema so the database is the final guard.

---

### 3.2 N+1 query pattern in zone pricing lookups

**What:** Some pricing-related handlers iterate over a collection and issue an individual `select` query per item inside the loop rather than loading all needed rows in a single batched query.

**Where:** `artifacts/api-server/src/routes/zonePricing.ts` lines 77 and 108.

**Fix:** Replace the per-item selects with a single `WHERE id IN (...)` query and build a lookup map before the iteration.

---

### 3.3 Development artifacts left in production code

**What:** `artifacts/admin-dashboard/src/App.tsx` contains comments in Arabic and a fire emoji (`// 🔥 مهم جدًا`, `// 🔥 ده أهم سطر في المشروع كله`). These are harmless but unprofessional in a codebase that may be reviewed by clients or auditors.

**Where:** `artifacts/admin-dashboard/src/App.tsx` lines 10 and 83–84.

**Fix:** Remove or translate the comments into English as part of a pre-launch code cleanup pass.

---

### 3.4 Staff page forms use manual state instead of Zod/react-hook-form

**What:** The Staff management page uses a plain `useState`-based form with manual validation, unlike every other form in the dashboard which uses `react-hook-form` + Zod. This makes it easier for validation to drift and harder to add fields safely.

**Where:** `artifacts/admin-dashboard/src/pages/staff.tsx` lines 358–387.

**Fix:** Refactor the staff create/edit form to use `react-hook-form` with a Zod schema, matching the pattern in `drivers.tsx` and `users.tsx`.

---

### 3.5 No application-level constraint prevents a driver from being double-assigned

**What:** The check preventing a driver from being assigned to two active trips simultaneously is handled only in route logic, not as a database unique constraint. A race condition (two simultaneous assignment requests) could bypass the check and create duplicate assignments.

**Where:** Assignment logic in `artifacts/api-server/src/routes/shuttle.ts`.

**Fix:** Add a partial unique index on `(driver_id) WHERE status IN ('active', 'pending')` to make the database enforce single active assignment per driver.

---

*End of report.*
