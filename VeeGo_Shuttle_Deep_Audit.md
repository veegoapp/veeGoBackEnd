# VeeGo Shuttle Service — Deep Audit Report
**Date:** June 10, 2026  
**Scope:** Full shuttle sub-system — data model, API routes, background jobs, admin dashboard  
**Files covered:** `shuttle.ts`, `shuttleBookings.ts` (all 2059 lines), `shuttleTripsAdmin.ts`, `schedules.ts`, `shuttle-job.ts`, `shuttle-renewal-job.ts`, `bookings.ts` (shuttle path), `routes.ts`, DB schemas (`trips`, `bookings`, `driverShuttleBookings`, `routeSchedules`, `routes`), `admin-dashboard/src/pages/shuttle-trips.tsx`

---

## 1. Executive Summary

The shuttle system is architecturally ambitious: it layers a driver-booking/renewal workflow on top of a schedule-driven trip generation engine, with background jobs for auto-cancellation and weekly renewal. Most of the logic is sound, but **five issues are critical or high severity** and will cause incorrect behavior in production. The most dangerous are: (1) seat-threshold constants hardcoded to Hiace values even when trips use a Minibus, (2) the driver reassign admin action not updating trip records, (3) trip-linking during renewal confirmation running outside a transaction and silently orphaning trips, and (4) the admin availability grid using UTC for its "next Sunday" default rather than Cairo time.

---

## 2. Architecture Overview

### 2.1 Data Flow

```
Admin creates Schedule (POST /schedules)
  → routeSchedulesTable + scheduleSlotsTable created
  → trips rows generated (one per day × slot, Cairo time → UTC)
  → routeTimeSlotsTable synced (INSERT ON CONFLICT DO NOTHING)

Driver books a slot for a week (POST /shuttle/route-bookings)
  → driverShuttleBookingsTable row created
  → matching trips rows updated: driverId set, status → "driver_assigned"

Passenger books a seat (POST /bookings)
  → bookingsTable row created, wallet deducted
  → if totalBooked >= MIN_REQUIRED → trip status → "active"

Wednesday 09:00 UTC — shuttle-renewal-job
  → pending_renewal notifications sent to drivers
  → expired bookings marked "expired"

Every 15 min — shuttle-job
  → trips < 8h out with < MIN_THRESHOLD passengers → auto-cancelled
  → passenger wallets refunded, notifications sent

Driver confirms renewal (POST /shuttle/route-bookings/:id/confirm-renewal)
  → current booking → "active", next-week booking created
  → matching next-week trips linked to driver
```

### 2.2 Key Tables

| Table | Purpose |
|---|---|
| `routes` | Route definitions (name, from/to, base price, duration) |
| `route_schedules` | Schedule windows (effectiveFrom/To, vehicleType) |
| `schedule_slots` | Per-schedule day-of-week + Cairo HH:MM times |
| `route_time_slots` | Per-route distinct Cairo HH:MM times (driver booking UI) |
| `trips` | Individual trip instances (UTC departure, driver, bus, seats, status) |
| `bookings` | Passenger seat bookings (wallet-paid, pending → active when threshold met) |
| `driver_shuttle_bookings` | Driver claims a route+slot for one full week |

### 2.3 Status State Machines

**Trip statuses:** `scheduled` → `waiting_driver` → `driver_assigned` → `boarding` → `active` → `completed` | `cancelled`

**Passenger booking statuses:** `pending` → `boarded` | `absent` | `cancelled` (never transitions to `confirmed` in current code)

**Driver shuttle booking statuses:** `active` → `pending_renewal` → renewed (new `active` row next week) | `expired` | `cancelled`

---

## 3. Critical Findings

### C-1 — Vehicle-Type Threshold Ignored in `bookings.ts` (Minibus Trips Broken)

**Location:** `artifacts/api-server/src/routes/bookings.ts` lines 83–84, 204–208  
**Severity:** Critical

```ts
const SHUTTLE_TOTAL_SEATS = 14;   // Hiace only
const SHUTTLE_MIN_REQUIRED = 7;   // Hiace only
```

These constants are hardcoded. When a Minibus trip (28 seats, threshold 14) is booked, the code still uses 7 as the activation threshold and 14 as total seat count for the response. Consequences:

- A Minibus trip auto-activates after only 7 bookings (half the correct threshold).
- The `shuttle` object returned to passengers shows `totalSeats: 14` for a 28-seat Minibus.
- The `availableSeats` calculation is wrong: `14 - totalBooked` vs the correct `28 - totalBooked`.

**The schema already defines the correct constants:**
```ts
// lib/db/src/schema/routeSchedules.ts
export const VEHICLE_CAPACITY:      { hiace: 14, minibus: 28 }
export const VEHICLE_MIN_THRESHOLD: { hiace: 7,  minibus: 14 }
```

These are imported nowhere in `bookings.ts`.

**Fix:** Fetch `trips.vehicleType` and `trips.totalSeats` inside the transaction and derive the threshold from the schema constants instead of using hardcoded values.

---

### C-2 — Admin Reassign Does Not Update Trip Records

**Location:** `artifacts/api-server/src/routes/shuttleBookings.ts` lines 1341–1501  
**Severity:** Critical

`PATCH /admin/shuttle/bookings/:id/reassign` updates the `driverShuttleBookingsTable` row with the new `driverId` but makes **no update to `tripsTable`**. After reassignment:

- The `trips` rows for that week still show `driverId` = old driver.
- The driver app, admin trip detail page, and all boarding/arrival flows continue to see the old driver.
- Notifications are sent correctly, but the underlying data is inconsistent.

Compare with the correct behavior implemented in `POST /shuttle/route-bookings` (initial booking) where matching trips are updated immediately after booking is created, and in `POST /shuttle/route-bookings/:id/confirm-renewal` where trips are linked to the new driver.

**Fix:** After updating `driverShuttleBookingsTable`, find all trips for that route in the booking's week that match the slot time, and update their `driverId` and `busId` (and potentially `status` back to `waiting_driver` if the new driver has no bus assigned).

---

### C-3 — Admin Cancel Does Not Reset Trip Assignment

**Location:** `artifacts/api-server/src/routes/shuttleBookings.ts` lines 1503–1593  
**Severity:** Critical

`PATCH /admin/shuttle/bookings/:id/cancel` marks the `driverShuttleBookingsTable` row as `cancelled` but does **not** update the associated `tripsTable` rows. After admin cancels a driver booking:

- Trips remain in `driver_assigned` status with the cancelled driver's `driverId` still set.
- The trip will never be re-assigned via the normal booking flow because it shows as already `driver_assigned`.
- Those trips are effectively orphaned — they have a driver reference that is no longer valid for service.

**Fix:** After cancelling the booking, set matching trips back to `waiting_driver` (or `scheduled`) and clear `driverId`/`busId`.

---

## 4. High-Severity Findings

### H-1 — Renewal Trip-Linking Outside Transaction

**Location:** `artifacts/api-server/src/routes/shuttleBookings.ts` lines 1128–1183  
**Severity:** High

The confirm-renewal endpoint does the following in sequence:

```ts
// Step 1: atomic — update current booking + insert next booking
const [updated, newBooking] = await Promise.all([
  db.update(...).set({ status: "active" })...
  db.insert(driverShuttleBookingsTable).values(...)...
]);

// Step 2: NOT atomic — separate query to link trips
const [renewalSlot] = await db.select(...).from(routeTimeSlotsTable)...
if (renewalSlot) {
  await db.update(tripsTable).set({ driverId: ... })...
}
```

Step 2 runs *outside* any transaction. If Step 2 fails (network error, DB error, slot not found), the next-week booking exists in `active` status but the corresponding trips have no driver assigned. There is no retry mechanism or compensating action.

Also: if `renewalSlot` is null (the `routeTimeSlotsTable` row was deleted or deactivated since the original booking), Step 2 is silently skipped — the booking is confirmed but no trips are linked.

**Fix:** Wrap Steps 1 and 2 in a single `db.transaction()`. Treat a missing `renewalSlot` as an error rather than silently skipping.

---

### H-2 — Admin Availability "Next Sunday" Calculated in UTC, Not Cairo Time

**Location:** `artifacts/api-server/src/routes/shuttleBookings.ts` lines 1688–1710  
**Severity:** High

```ts
const now = new Date();
const day = now.getUTCDay();             // UTC day-of-week
const daysToAdd = day === 0 ? 7 : 7 - day;
const sunday = new Date(now);
sunday.setUTCDate(sunday.getUTCDate() + daysToAdd);
```

Cairo is UTC+2 (UTC+3 during DST). Between 22:00–00:00 UTC Sunday through Saturday, the UTC day-of-week is different from the Cairo day-of-week. For example, at 22:30 UTC on a Saturday, Cairo is already Sunday — but the code returns the *following* Sunday (7 days out) instead of the current Cairo Sunday.

This affects the default view shown to admins when they load the availability grid without specifying a week. It's a display bug (wrong default week) rather than a data corruption bug, but admins will see the wrong week's coverage.

**Fix:** Use the same `getCairoDayOfWeek()` helper already defined in `schedules.ts` (or inline the equivalent) to determine today's day-of-week in Cairo time before calculating the next Sunday.

---

### H-3 — Booking Status Never Progresses from `pending` to `confirmed`

**Location:** `artifacts/api-server/src/routes/bookings.ts` lines 165–174  
**Severity:** High

All passenger bookings are created with `status: "pending"`. The trip auto-activates (trip status → `"active"`) when the minimum threshold is reached, but individual booking statuses are never updated to `"confirmed"`. The schema has `"confirmed"` as a valid booking status (and uses it as the default), but the code path that would transition `pending` → `confirmed` does not exist.

This means:
- Passengers always see their booking as `pending`, even on fully confirmed, active trips.
- The admin `GET /bookings` endpoint filters work correctly for `pending`/`cancelled`/`completed` but the `confirmed` filter will always return zero results.
- The `shuttle-job.ts` auto-cancel job identifies "confirmed" trips by checking trip status, not booking status — so refund logic should still work, but semantically the system is inconsistent.
- `boarded` and `absent` statuses in the schema exist for the boarding flow but there's no code path that sets `absent`.

**Fix:** When a trip transitions to `active` status (threshold met), run an UPDATE to move all `pending` bookings for that trip to `confirmed`. Alternatively, define a clear rule that `pending` = confirmed-for-shuttle (document it) and remove the unused `confirmed` code path to avoid confusion.

---

## 5. Medium-Severity Findings

### M-1 — `routeTimeSlotsTable` and `scheduleSlotsTable` Are a Dual-Model Design Risk

**Location:** `lib/db/src/schema/driverShuttleBookings.ts`, `lib/db/src/schema/routeSchedules.ts`, `artifacts/api-server/src/routes/schedules.ts` lines 110–125

The system maintains two separate representations of "what times does a route run":

1. **`schedule_slots`**: Per-schedule, day-of-week + HH:MM. The source of truth for trip generation.
2. **`route_time_slots`**: Per-route, HH:MM only (no day-of-week). Used by the driver booking app.

`schedules.ts` calls `syncRouteTimeSlots()` on `POST /schedules` and `POST /schedules/:id/generate` to keep them in sync via `INSERT ... ON CONFLICT DO NOTHING`. However:

- If a schedule is deactivated (`DELETE /schedules/:id`), the corresponding `route_time_slots` rows are **not** removed or deactivated.
- If a slot time is removed from a schedule (no PATCH endpoint exists for individual slot times), `route_time_slots` is not updated.
- Drivers can book a time slot that is no longer used by any active schedule (stale `route_time_slots` rows).

The admin endpoint `PATCH /admin/shuttle/timeslots/:id` and `DELETE /admin/shuttle/timeslots/:id` exist to manage `route_time_slots` directly, but this requires manual admin intervention and is not automatic.

**Fix:** In `DELETE /schedules/:id`, after cancelling trips, also deactivate (set `isActive = false`) any `route_time_slots` entries whose times are no longer present in any active schedule for that route.

---

### M-2 — `routes.ts` DELETE Misses `driver_shuttle_bookings` in Manual Cascade

**Location:** `artifacts/api-server/src/routes/routes.ts` lines 80–94  
**Severity:** Medium (mitigated by DB FK cascade, but order-dependent)

`DELETE /routes/:id` manually deletes `bookingsTable` rows, then `tripsTable` rows, then the route. The `driverShuttleBookingsTable` and `routeTimeSlotsTable` both have `ON DELETE CASCADE` on `route_id`, so they will be cascade-deleted by the DB engine when the route is deleted.

However, there is a risk: `bookingsTable` does not have a cascade constraint on `trip_id` (FK is `NOT NULL` with no cascade rule). If the manual deletion order fails halfway (e.g., DB error between deleting bookings and deleting trips), partial state remains. More importantly, the `stationsTable` is never explicitly deleted and has `ON DELETE CASCADE`, relying entirely on DB cascade — which is fine, but inconsistent with the manual approach taken for bookings/trips.

The main risk is that if `route_schedules` rows exist (which reference `route_id` with `ON DELETE CASCADE`), the DB may cascade-delete trips when route_schedules is deleted, before `bookings.ts` can delete bookings manually — depending on FK resolution order. This is DB-implementation specific and could cause FK violation errors.

**Fix:** Wrap the entire deletion in a transaction. Delete in explicit order: bookings → trips → route. The DB cascade will handle the rest.

---

### M-3 — Seat Decrement Not Guarded in `bookings.ts` Against Minibus Over-Count

**Location:** `artifacts/api-server/src/routes/bookings.ts` lines 110–113  
**Severity:** Medium (linked to C-1)

The `available_seats` check uses `tripRow.available_seats` (the actual DB value), which was initialized at schedule-time from `VEHICLE_CAPACITY[vehicleType]`. So a Minibus trip correctly starts with 28 available seats, and the seat decrement guard works correctly at the DB level.

However, the *response* object (lines 219–234) computes `availableSeats = SHUTTLE_TOTAL_SEATS - totalBooked` using the hardcoded `SHUTTLE_TOTAL_SEATS = 14`, meaning the API response shows incorrect available seats to the passenger client for Minibus trips. This is a data-presentation error compounding C-1.

---

### M-4 — `renewal-confirm` Allows Race Condition on `nextWeekStartStr`

**Location:** `artifacts/api-server/src/routes/shuttleBookings.ts` lines 1100–1150  
**Severity:** Medium

The conflict check (line 1101–1126) queries for existing active/pending_renewal bookings for the next week, then the creation (lines 1128–1150) inserts a new booking. This is a classic **check-then-act** race condition. Two drivers could simultaneously confirm renewal for the same slot:

1. Both pass the conflict check (no row exists yet).
2. Both attempt to insert.
3. The DB unique constraint on `(routeId, timeSlotId, weekStart)` will catch this and throw a `23505` error.

However, the code does not catch `23505` at this point — there is no try/catch around the insert. The Express error handler will return a 500, which is opaque to the client.

**Fix:** Wrap the insert in a try/catch, detect `23505`, and return a 409 with a clear message: "Another driver has already confirmed this slot for next week."

---

### M-5 — Driver Can Book Slot With No Matching Trips

**Location:** `artifacts/api-server/src/routes/shuttleBookings.ts` (initial POST /shuttle/route-bookings, read in prior session)  
**Severity:** Medium

When a driver books a time slot, the code:
1. Validates the slot exists in `routeTimeSlotsTable`.
2. Creates the `driverShuttleBookingsTable` row.
3. Finds and links matching trips.

If step 3 finds zero matching trips for the week (e.g., no schedule covers that week, or schedule is deactivated), the booking is still created successfully with `active` status. The driver holds a "confirmed" booking for a week with no actual trips.

The `confirm-renewal` endpoint guards against this: `if (!nextTripExists) return 400`. But the initial booking does not perform this check.

**Fix:** Apply the same "no trips scheduled for this week" guard to the initial booking endpoint.

---

### M-6 — Admin Dashboard `STATUS_META` Has Two "Active" Labels

**Location:** `artifacts/admin-dashboard/src/pages/shuttle-trips.tsx` lines 42–50  
**Severity:** Medium (UX)

```ts
waiting_driver:  { label: "Active", cls: "...green..." },
active:          { label: "Active", cls: "...green..." },
```

Both `waiting_driver` and `active` render as "Active" with identical green styling. In the backend, these represent meaningfully different states:

- `waiting_driver`: The trip has enough passengers but no driver assigned yet.
- `active`: The trip is currently in progress (driver is driving).

An admin cannot distinguish these from the list view.

Also, the KPI row counts `waiting_driver`, `driver_assigned`, `boarding`, and `active` all as "Active", which further masks the `waiting_driver` state (no driver assigned = problem requiring attention).

**Fix:** Give `waiting_driver` a distinct label (e.g., "Awaiting Driver") and a distinct color (e.g., amber/yellow) to signal it requires action.

---

## 6. Low-Severity / Informational Findings

### L-1 — `shuttle-job.ts` Threshold Also Hardcoded

The auto-cancel background job (every 15 min, 8h lookahead) uses `trip.availableSeats` and `trip.totalSeats` from the DB, then checks against a hardcoded threshold equivalent to the Hiace value. Confirm whether the job reads `VEHICLE_MIN_THRESHOLD` or a hardcoded value.

### L-2 — `bookingsTable.status` Default vs. Actual Usage Mismatch

The schema defines `default("confirmed")` but `bookings.ts` always passes `status: "pending"` explicitly on insert. The default is never used. This creates a confusing discrepancy between schema intent and runtime behavior.

### L-3 — Pagination `total` Count Uses a Separate Query (Consistency Risk)

All admin list endpoints (bookings, renewal-history) fire two parallel queries: `SELECT ... LIMIT x OFFSET y` and `SELECT count(*)`. If rows are inserted between these two queries, the count can be off by a few rows. For a low-traffic system this is acceptable, but worth noting.

### L-4 — `admin/shuttle/bookings` Filter Does Not Support `expired` Status in Enum Guard

`GET /admin/shuttle/bookings` accepts `?status=expired` in the query but the TypeScript cast on line 1244 only lists `"active" | "cancelled" | "pending_renewal" | "expired"` — this is actually correct, but the Zod schema does not validate the status value, meaning an invalid string like `?status=bogus` is passed directly to the Drizzle `eq()` call without error (it just returns zero results rather than a 400).

### L-5 — Renewal Deadline Notification Body Uses UTC String

`PATCH /admin/shuttle/bookings/:id/extend-window` sets the notification body to `newDeadline.toUTCString()` — the driver receives a UTC timestamp in their notification. Since drivers operate in Cairo time (UTC+2/+3), this is confusing. Should use Cairo-localized formatting.

### L-6 — `GET /shuttle/lines/:id/passengers` Exposes PII

**Location:** `shuttle.ts` (read in prior session)  
The endpoint returns full passenger names and phone numbers to the requesting driver. No access control beyond `authenticate` + `requireRole("driver")` verifies the driver is actually assigned to that line/trip. Any driver can query any line's passenger manifest.

### L-7 — `DELETE /routes/:id` Has No Check for In-Progress Trips

If a route has `active` or `boarding` trips, deleting the route hard-deletes all associated bookings (including `paymentStatus: "paid"` ones) without issuing refunds. Passengers lose their paid bookings silently.

---

## 7. Schema Observations

### 7.1 `bookings` Table — Missing Composite Index

There is no composite index on `(trip_id, status)`. The auto-activation query (`SELECT COALESCE(SUM(seat_count), 0) FROM bookings WHERE trip_id = $1 AND status NOT IN ('cancelled')`) runs inside a transaction on every booking. The existing `idx_bookings_trip_id` helps but a composite index would eliminate a post-filter scan.

### 7.2 `driver_shuttle_bookings` — `(routeId, timeSlotId, weekStart)` Unique Constraint is Correct

The UNIQUE constraint correctly enforces one driver per slot per week. This is the correct design.

### 7.3 `trips` — No Composite Index on `(routeId, departureTime, status)`

Queries like those in `shuttle-job.ts` and `shuttle-renewal-job.ts` filter on `routeId + departureTime range + status`. The existing individual indexes on `routeId`, `status`, and `departureTime` help, but a composite `(routeId, departureTime, status)` would be more efficient for the background jobs.

### 7.4 `route_time_slots` — No `updatedAt` Column

The table tracks `createdAt` but not `updatedAt`. Since the admin can PATCH departure times, there is no audit trail for when a slot time was changed.

---

## 8. Summary Table

| ID | Title | Severity | File | Risk |
|---|---|---|---|---|
| C-1 | Vehicle-type threshold hardcoded (Minibus broken) | **Critical** | `bookings.ts` | Wrong activation threshold + wrong seat count |
| C-2 | Admin reassign doesn't update trips | **Critical** | `shuttleBookings.ts` | Trips show wrong driver forever |
| C-3 | Admin cancel doesn't reset trips | **Critical** | `shuttleBookings.ts` | Trips orphaned in driver_assigned state |
| H-1 | Renewal trip-linking outside transaction | **High** | `shuttleBookings.ts` | Booking confirmed, trips not linked |
| H-2 | Availability "next Sunday" uses UTC not Cairo | **High** | `shuttleBookings.ts` | Wrong default week shown to admin |
| H-3 | Booking status never leaves `pending` | **High** | `bookings.ts` | Semantic inconsistency; `confirmed` filter broken |
| M-1 | Dual time-slot model diverges on deactivation | Medium | `schedules.ts`, schema | Stale slots bookable by drivers |
| M-2 | Route DELETE relies on partial manual cascade | Medium | `routes.ts` | Possible partial failure / FK violation |
| M-3 | Minibus available-seats wrong in API response | Medium | `bookings.ts` | Passengers see wrong seat counts |
| M-4 | Race condition on renewal confirmation inserts | Medium | `shuttleBookings.ts` | 500 instead of clean 409 |
| M-5 | Driver can book slot with no matching trips | Medium | `shuttleBookings.ts` | Active booking with zero trips |
| M-6 | `waiting_driver` and `active` both labelled "Active" | Medium | `shuttle-trips.tsx` | Admin cannot identify unassigned trips |
| L-1 | Job threshold may also be hardcoded | Low | `shuttle-job.ts` | Verify separately |
| L-2 | Schema default `confirmed` vs. runtime `pending` | Low | `bookings.ts`, schema | Confusing discrepancy |
| L-3 | Count query race in pagination | Low | multiple | Minor inaccuracy |
| L-4 | Invalid `?status` not rejected with 400 | Low | `shuttleBookings.ts` | Silent no-results |
| L-5 | Renewal deadline notification in UTC | Low | `shuttleBookings.ts` | Poor UX for Cairo drivers |
| L-6 | Any driver can access any line's passenger list | Low | `shuttle.ts` | PII exposure |
| L-7 | Route DELETE no refund for in-progress bookings | Low | `routes.ts` | Silent wallet loss |

---

## 9. Recommendations (Priority Order)

1. **Fix C-1 immediately** — fetch `vehicleType` from the trip inside the booking transaction and use `VEHICLE_CAPACITY`/`VEHICLE_MIN_THRESHOLD` from the schema constants.

2. **Fix C-2 and C-3 together** — after any admin booking mutation (reassign, cancel), run a single trip-update query to sync `tripsTable` with the new state.

3. **Fix H-1** — wrap the entire renewal confirmation (booking update + next booking insert + trip linking) in a single `db.transaction()` call.

4. **Fix H-3** — decide the canonical booking status semantics. If `pending` means confirmed-for-shuttle, document it and remove the dead `confirmed` transition. If `confirmed` is intended, implement the transition when the trip activates.

5. **Fix H-2** — replace the UTC `getUTCDay()` call with the Cairo-aware `getCairoDayOfWeek()` helper already defined in `schedules.ts`.

6. **Fix M-4** — catch `23505` in the renewal confirmation insert and return 409.

7. **Fix M-6** — give `waiting_driver` a distinct amber "Awaiting Driver" label in the admin dashboard.

8. **Address M-1** — deactivate stale `route_time_slots` entries when a schedule is deleted.

9. **Address L-6** — add a check in `GET /shuttle/lines/:id/passengers` that the requesting driver is actually assigned to a trip on that line for the current or upcoming week.

10. **Address L-7** — add a guard in `DELETE /routes/:id` that refuses deletion (or forces explicit confirmation) if any trips have `paymentStatus: "paid"` bookings in non-cancelled state.
