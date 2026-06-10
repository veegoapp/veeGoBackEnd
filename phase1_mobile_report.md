# Phase 1 — Mobile Apps Impact Report

## Overview

Phase 1 applies three backend fixes to the shuttle service. No new endpoints were added and no request shapes changed. All impacts are either **response field value corrections** (Fix 1) or **downstream state corrections** that mobile apps will observe the next time they query trip or assignment data (Fixes 2 & 3).

---

## Passenger App

### Fix 1 — `POST /bookings` (vehicle-type threshold)

**Endpoint:** `POST /bookings`

**What changed:**  
The `shuttle` object in the 201 response now uses the actual capacity and threshold of the trip's vehicle type instead of always using Hiace defaults.

| Field | Before (hardcoded) | After (vehicle-aware) |
|---|---|---|
| `shuttle.totalSeats` | Always `14` | `14` (Hiace) or `28` (Minibus) |
| `shuttle.minRequired` | Always `7` | `7` (Hiace) or `14` (Minibus) |
| `shuttle.availableSeats` | `14 - bookedSeats` | `totalSeats - bookedSeats` |
| `shuttle.shuttleStatus` | `"active"` after 7 bookings regardless of vehicle | `"active"` after the correct threshold for the vehicle |
| `shuttle.message` | "Needs X more bookings" counted against 7 | Counts against the correct threshold |

**What the passenger app should now expect:**  
- For Hiace trips: all values are identical to before.
- For Minibus trips: `totalSeats` will be `28`, `minRequired` will be `14`, `availableSeats` will be up to `28`. The trip will no longer show as `active` (confirmed) prematurely — it correctly needs 14 passengers before it activates.
- The passenger app should display `shuttle.totalSeats` and `shuttle.minRequired` from the response rather than relying on hardcoded client-side constants.

---

### Fix 3 — Trip state after admin cancels a driver booking

**Affected endpoints (read-only, state now corrected):**  
- Any endpoint that returns trip data for a trip whose driver booking was admin-cancelled, e.g. `GET /shuttle/trips/:id` (if it exists), or any trip list endpoint the passenger app uses to display trip status.

**What changed:**  
Previously, when an admin cancelled a driver booking, the associated `trips` rows kept `status: "driver_assigned"` and still referenced the old driver. Now, after cancellation, those trips are immediately updated:

| Trip field | Before fix | After fix |
|---|---|---|
| `status` | `"driver_assigned"` | `"waiting_driver"` |
| `driverId` | old driver's ID | `null` |
| `busId` | old bus ID | `null` |

**What the passenger app should now expect:**  
- A trip that had an admin-cancelled driver booking will no longer show an assigned driver. It will show `driver: null` and `status: "waiting_driver"` until a new driver books and is assigned.
- If the passenger app displays driver name/phone on the trip detail screen, it should handle `driver: null` gracefully (this was already possible but will now occur after admin cancellations).

---

## Driver App

### Fix 2 — `PATCH /admin/shuttle/bookings/:id/reassign` (trips synced on reassign)

**Endpoint:** `PATCH /admin/shuttle/bookings/:id/reassign` *(admin-initiated)*  
**Socket event received by drivers:** `SHUTTLE_BOOKING_REASSIGNED` *(unchanged, already fired by existing code)*

**What changed:**  
Previously, when an admin reassigned a driver booking to a new driver, the `trips` table was never updated — trips kept the old driver's ID. Now, immediately after the booking row is updated, all matching trips for that route and week are reassigned to the new driver.

| Trip field | Before fix | After fix |
|---|---|---|
| `driverId` | old driver's ID (stale) | new driver's ID |
| `busId` | old bus ID (stale) | new driver's `assignedBusId` (or `null`) |
| `status` | `"driver_assigned"` (stale) | `"driver_assigned"` if new driver has a bus; `"waiting_driver"` if no bus |

**What the old (removed) driver should now expect:**  
- Any endpoint that lists their assigned trips will no longer include the reassigned week's trips. The socket event `SHUTTLE_BOOKING_REASSIGNED` with `role: "removed"` already fires (unchanged) — but now the trip data returned by subsequent queries will also reflect this correctly.

**What the new (assigned) driver should now expect:**  
- The affected trips will appear in their assigned trip list immediately after reassignment.
- The socket event `SHUTTLE_BOOKING_REASSIGNED` with `role: "assigned"` already fires (unchanged) — but now the underlying trip data matches what the notification says.
- If the new driver has no bus assigned (`assignedBusId` is null), the trips will be in `"waiting_driver"` status rather than `"driver_assigned"`. The driver app should handle both statuses as "this trip is yours to operate."

---

### Fix 3 — `PATCH /admin/shuttle/bookings/:id/cancel` (trips reset on cancel)

**Endpoint:** `PATCH /admin/shuttle/bookings/:id/cancel` *(admin-initiated)*  
**Socket event received by driver:** `NOTIFICATION_NEW` with category `"shuttle"` *(unchanged, already fired)*

**What changed:**  
Previously, when an admin cancelled a driver's booking, the `trips` table was never touched. Now, matching trips for the cancelled driver's route and week are immediately reset.

| Trip field | Before fix | After fix |
|---|---|---|
| `driverId` | cancelled driver's ID (stale) | `null` |
| `busId` | old bus ID (stale) | `null` |
| `status` | `"driver_assigned"` (stale, permanently stuck) | `"waiting_driver"` |

**What the affected driver should now expect:**  
- After receiving the "Route Booking Cancelled" notification, any subsequent query to their assigned trips will no longer show the cancelled week's trips. Before this fix, those trips would erroneously remain in their assignment list.
- The driver app should not assume that a cancellation notification means their trip list will be unchanged — it should refetch trip/assignment data on receipt of any `NOTIFICATION_NEW` with `category: "shuttle"`.
