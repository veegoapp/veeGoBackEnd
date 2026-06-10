# Phase 2 — Mobile Apps Impact Report

## Overview

Phase 2 applies five backend fixes. No new endpoints were added. Impacts range from stricter validation errors that mobile apps must now handle (Fixes 1, 4), to corrected status values on existing queries (Fixes 3, 5), to a changed auto-cancel window (Fix 2).

---

## Passenger App

### Fix 2 — `POST /bookings` auto-cancel timing window (shuttle-job.ts)

**Affected flow:** Background job that auto-cancels trips with fewer passengers than the vehicle minimum threshold.

**What changed:**
- The job now cancels underfilled trips **10 hours** before departure (previously 8 hours).
- The cancel reason string in the trip record now says "…10 hours before departure" instead of "…8 hours before departure".

**What the passenger app should now expect:**
- A passenger may still be able to book a shuttle trip for up to 10 hours before departure (instead of up to 8 hours). The booking creation itself is not blocked, but if the trip still hasn't reached the vehicle threshold at the 10-hour mark, it will be cancelled.
- When an auto-cancelled trip notification arrives via `NOTIFICATION_NEW` (category `"trip"`, title `"Shuttle Trip Cancelled"`), it triggers a full wallet refund — no change there.
- Any screen that displays `trip.cancelReason` will now read `"…minimum passenger threshold not met 10 hours before departure"`.

---

### Fix 3 — `PATCH /bookings/:id/cancel` — active trips cannot revert (bookings.ts)

**Endpoint:** `PATCH /bookings/:id/cancel`

**What changed:**
- An explicit live trip-status check is now performed within the cancellation transaction.
- If the trip is already in `active`, `driver_assigned`, `boarding`, `completed`, or `cancelled` status, no trip-status modification is attempted. The passenger's booking is still cancelled and their wallet is still refunded — only the "should the trip status change?" logic is guarded.
- Previously the rule was enforced only by a code comment. Now it is enforced in code: the trip's status is fetched inside the transaction, and any future recalculation is gated on the trip being in `scheduled` or `waiting_driver` state.

**What the passenger app should now expect:**
- The response shape for `PATCH /bookings/:id/cancel` is **unchanged** — the same refunded booking object is returned.
- A trip that has already become `active` will remain `active` even if a cancellation drops the passenger count below the vehicle threshold. Passengers should not see an active trip revert to `scheduled` or `waiting_driver` after their cancellation.
- The booking cancellation and refund continue to work identically for the passenger — only the trip's status is protected.

---

## Driver App

### Fix 1 — `POST /shuttle/route-bookings/:id/confirm-renewal` wrapped in a transaction (shuttleBookings.ts)

**Endpoint:** `POST /shuttle/route-bookings/:id/confirm-renewal`

**What changed:**
- The confirmation logic is now wrapped in a single database transaction. Previously, the booking update + next-week booking insert ran first (atomically), and then trip-linking ran as a separate non-atomic step.
- A new early failure path has been added: if the time slot record cannot be found inside the transaction, the entire operation is rolled back and the endpoint returns:
  ```
  HTTP 400
  { "error": "Time slot record not found — cannot link trips. Renewal aborted." }
  ```
- On success, the response shape is **unchanged**: `{ ok: true, currentBooking: {...}, nextWeekBooking: {...} }`.

**What the driver app should now expect:**
- The renewal confirm endpoint can now return a new 400 error with the message `"Time slot record not found — cannot link trips. Renewal aborted."` The driver app should display this message if received.
- On success, the response is identical to before — same fields, same structure.
- There is no longer a risk of a partially-confirmed renewal (booking active but trips unlinked), so the driver app can reliably show the driver's assigned trips for next week immediately after a successful confirm-renewal response.

---

### Fix 2 — Auto-cancel timing window (shuttle-job.ts)

**Affected flow:** Background job that notifies the driver when their trip is auto-cancelled.

**What changed:**
- Same as the passenger-side change: the job fires at **10 hours** before departure instead of 8.

**What the driver app should now expect:**
- The `NOTIFICATION_NEW` socket event (category `"trip"`, title `"Trip Cancelled — Low Bookings"`) will arrive at most 10 hours before departure (previously up to 8 hours before).
- Any screen that displays `trip.cancelReason` will now read `"…minimum passenger threshold not met 10 hours before departure"`.

---

### Fix 4 — `POST /shuttle/route-bookings` — full-week validation (shuttleBookings.ts)

**Endpoint:** `POST /shuttle/route-bookings`

**What changed:**
- A new validation step is now executed before the booking is created.
- The API queries the trips table and checks that all 5 Egyptian working days (Sunday through Thursday) have at least one trip for the requested route, time slot, and week. Previously only a single trip anywhere in the week was required.
- If any working day is missing a trip for the slot, the endpoint returns:
  ```
  HTTP 400
  { "error": "This slot does not have trips for the full week." }
  ```
- If all 5 days are covered, booking proceeds exactly as before.

**What the driver app should now expect:**
- `POST /shuttle/route-bookings` can now return a new 400 error with the message `"This slot does not have trips for the full week."` The driver app should display this clearly — the week/slot combination is not bookable until the admin schedules all 5 days.
- The driver app should treat this differently from a 409 conflict: it means the slot is not yet available (not that it is taken), so the appropriate UX is a message like "This time slot is not fully scheduled for the selected week" rather than "Slot is taken."
- The available-weeks/available-slots response from the server should be the source of truth for which weeks and slots can be booked; slots that fail this check should ideally not be shown by the server's availability endpoint.

---

### Fix 5 — Auto-expire renewal + reset next-week trips (shuttle-renewal-job.ts)

**Affected flow:** Background job that expires `pending_renewal` bookings whose 10-hour deadline has passed.

**What changed:**
- When a `pending_renewal` booking is expired by the background job, a new step now runs: **the next week's trips** (current booking `weekStart + 7 days`) that are still assigned to the expired driver for that route are reset to `driverId = null`, `busId = null`, `status = "waiting_driver"`.
- The existing expiry notification (`NOTIFICATION_NEW`, category `"shuttle"`, title `"Route Slot Expired"`) is still sent — no change to the notification shape.
- The `weekStart` and `weekEnd` fields are now also returned from the expiry query (internal only, not exposed to clients).

**What the driver app should now expect:**
- After receiving the `"Route Slot Expired"` notification, if the driver fetches their assigned trips for next week, those trips will no longer appear — they will be in `waiting_driver` status with no driver assigned.
- The driver app should treat a `"Route Slot Expired"` notification as a signal to refresh the driver's trip assignment list. Previously, an expired driver might still see next-week trips erroneously listed as assigned.
- Other drivers querying available slots for next week will now see the slot as open immediately after the expired driver's deadline passes.
