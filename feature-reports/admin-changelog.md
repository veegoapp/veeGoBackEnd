# Admin Platform — API Changelog

**Project:** Shuttle/Ride Admin Platform (monorepo)
**Date:** 2026-05-31
**Scope:** Admin Dashboard (`artifacts/admin-dashboard`) + API Server (`artifacts/api-server`)
**Audience:** Internal — Admin Dashboard consumers only. No changes affect the Passenger App or Driver App.

---

## New API Endpoints

### Queue Monitor

All three endpoints are protected by `authenticate` + `requireRole("admin")`. They operate on the in-process `JobQueue` singleton and require no database migration.

---

#### `GET /api/admin/queue/status`

Returns a live snapshot of the job queue, including pending jobs, active jobs, and dead-letter queue (DLQ) entries grouped by job type.

**Response**
```json
{
  "pendingCount": 3,
  "activeCount": 1,
  "deadLetterCount": 2,
  "deadLetterQueue": [
    {
      "job": {
        "id": "uuid",
        "type": "sendNotification",
        "payload": { "..." : "..." },
        "attempts": 3,
        "maxAttempts": 3,
        "createdAt": "2026-05-31T18:00:00.000Z"
      },
      "failedAt": "2026-05-31T18:05:00.000Z",
      "reason": "Connection timeout"
    }
  ],
  "failuresByType": {
    "sendNotification": 2
  },
  "asOf": "2026-05-31T20:00:00.000Z"
}
```

**Auth:** Admin only
**Side effects:** None (read-only)

---

#### `POST /api/admin/queue/retry/:jobId`

Re-queues a single dead-letter job by its `job.id`. The job is removed from the DLQ and placed back into the pending queue with its attempt counter reset.

**URL params**

| Param | Type | Description |
|---|---|---|
| `jobId` | `string` (UUID) | The `job.id` from the DLQ entry |

**Response**
```json
{
  "success": true,
  "jobId": "uuid",
  "pendingCount": 4
}
```

**Error responses**

| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Missing jobId" }` | No `:jobId` param |
| `404` | `{ "error": "Job not found in dead-letter queue" }` | Job ID not in DLQ |

**Auth:** Admin only
**Side effects:** Removes job from DLQ, increments pending queue count

---

#### `POST /api/admin/queue/retry-all`

Re-queues every job currently in the dead-letter queue. Returns the count of successfully re-queued jobs.

**Request body:** None

**Response**
```json
{
  "success": true,
  "retriedCount": 2,
  "pendingCount": 5
}
```

**Auth:** Admin only
**Side effects:** Clears the DLQ, increments pending queue count by `retriedCount`

---

## Pre-existing Endpoints Used by Upgraded UI

The following endpoints existed before this session. No changes were made to their signatures, request/response shapes, or auth requirements. They are listed here because they power newly-built Admin Dashboard UI features.

| Endpoint | Used By | Notes |
|---|---|---|
| `PATCH /api/bookings/:id/cancel` | Bookings page — Cancel action | Unchanged |
| `POST /api/admin/wallet/refund` | Bookings page — Refund to Wallet dialog | Body: `{ userId, amount, description }` — Unchanged |
| `GET /api/admin/bookings` | Bookings page — table data | Supports `?search`, `?status`, `?fromDate`, `?toDate`, `?page`, `?limit` — Unchanged |
| `GET /api/routes` | Routes page | Unchanged |
| `POST /api/routes` | Routes page — Create route | Unchanged |
| `PATCH /api/routes/:id` | Routes page — Edit route / toggle active | Unchanged |
| `DELETE /api/routes/:id` | Routes page — Delete route | Unchanged |
| `GET /api/routes/:id/stations` | Route detail — station list | Unchanged |
| `POST /api/routes/:id/stations` | Route detail — add station | Unchanged |
| `PATCH /api/routes/:id/stations/:stationId` | Route detail — edit/reorder station | Unchanged |
| `DELETE /api/routes/:id/stations/:stationId` | Route detail — delete station | Unchanged |
| `GET /api/zones` | Zones page — map + list | Unchanged |
| `POST /api/zones` | Zones page — Create zone | Unchanged |
| `PATCH /api/zones/:id` | Zones page — Edit zone | Unchanged |
| `DELETE /api/zones/:id` | Zones page — Delete zone | Unchanged |

---

## Frontend-Only Changes (No API Impact)

These changes are confined to the Admin Dashboard SPA and have no effect on any API endpoint or on the Passenger/Driver apps.

| Area | Change |
|---|---|
| Navigation | Fixed broken `/customers` nav link and all row/detail links — now correctly route to `/users` and `/users/:id` |
| Navigation | Removed duplicate **Staff** entry from sidebar (was showing twice) |
| Navigation | Fixed Pricing sub-nav hrefs: `/pricing/car`, `/pricing/bike`, `/pricing/surge`, `/pricing/delivery` |
| Routing | Added `/pricing/:type` route in `App.tsx` so sub-nav deep links resolve correctly |
| Bookings page | Added View Details dialog, Refund to Wallet dialog, CSV export, date-range filters, status filter, debounced search, dropdown action menu per row |
| Dashboard | Added **Retry All** button to Queue Monitor card (appears only when DLQ has entries) |
| Queue Monitor | 30-second auto-refresh + manual Refresh button — display-side only |
| Routes/Zones | Verified all CRUD is DB-backed via API — no changes were needed |

---

## Database Migrations

**None required.** All new endpoints operate on the `JobQueue` in-process singleton. All CRUD endpoints used by the upgraded Bookings, Routes, and Zones pages were already backed by existing Drizzle ORM schema.

---

## Impact on Passenger App / Driver App

**None.** All new endpoints are scoped to `requireRole("admin")` and are unreachable by passenger or driver tokens. No existing passenger- or driver-facing endpoints were modified.
