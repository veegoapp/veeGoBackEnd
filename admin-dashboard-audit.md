# Admin Dashboard — Exhaustive Audit Report

**Date:** 2026-06-05  
**Scope:** `artifacts/admin-dashboard/src/pages/` — all 31 pages  
**Auditor:** Agent analysis of source code (no runtime execution)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Layers](#2-api-layers)
3. [Page-by-Page Audit](#3-page-by-page-audit)
4. [Bugs & Confirmed Defects](#4-bugs--confirmed-defects)
5. [Dead Buttons / Fake Functionality](#5-dead-buttons--fake-functionality)
6. [Missing Backend Endpoints](#6-missing-backend-endpoints)
7. [Data: Live vs Mocked](#7-data-live-vs-mocked)
8. [Real-Time / WebSocket Usage](#8-real-time--websocket-usage)
9. [Authentication Flow](#9-authentication-flow)
10. [Complete Endpoint Inventory](#10-complete-endpoint-inventory)
11. [Summary & Priority Recommendations](#11-summary--priority-recommendations)

---

## 1. Architecture Overview

| Item | Detail |
|---|---|
| Framework | React + Vite + TypeScript |
| Routing | Wouter |
| Server state | TanStack Query (React Query v5) |
| UI components | Radix UI / shadcn primitives |
| Maps | Leaflet / react-leaflet (live-tracking, route-detail, zones) |
| Realtime | Socket.IO client (`useAdminSocket` hook) |
| i18n | react-i18next |
| Base URL | Read from `VITE_API_URL` env var, falls back to `http://localhost:3000` |
| Auth token storage | `localStorage` (`adminToken`, `adminRefreshToken`, `adminUser`) |
| Generated API client | `@workspace/api-client-react` — typed hooks for a subset of endpoints |

---

## 2. API Layers

There are **two distinct HTTP layers** used throughout the dashboard. Code that mixes them can cause subtle cache-invalidation mismatches.

### 2.1 `adminFetch` (manual wrapper) — `src/lib/api.ts`

Adds `Authorization: Bearer <token>` header automatically. Used by the majority of pages. Calls are NOT tracked by the generated-client query key system, so `queryClient.invalidateQueries({ queryKey: getXxxQueryKey() })` will **not** invalidate these.

### 2.2 Generated Client Hooks — `@workspace/api-client-react`

Auto-generated typed hooks. Configured in `main.tsx` via `setAuthTokenGetter`. The bearer token getter is wired at app startup, so auth is consistent with `adminFetch`. These hooks have their own query keys (`getXxxQueryKey()`).

**Pages that mix both layers:**

| Page | Generated hooks used | Also uses adminFetch |
|---|---|---|
| `users.tsx` | `useListAdminUsers`, `useToggleBlockUser` | ✗ |
| `drivers.tsx` | `useListDrivers`, `useCreateDriver`, `useUpdateDriver` | ✓ (driver analytics) |
| `vehicles.tsx` | `useListBuses`, `useListVehicles`, `useCreateVehicle`, `useUpdateVehicle`, `useDeleteVehicle` | ✗ |
| `trips.tsx` | `useListTrips`, `useCreateTrip`, `useCancelTrip`, `useUpdateTrip` | ✓ (DELETE trips — **buggy**) |
| `routes.tsx` | `useListRoutes`, `useCreateRoute`, `useUpdateRoute`, `useDeleteRoute` | ✗ |
| `pricing.tsx` | ✗ | ✓ |
| `wallet.tsx` | `useAdminRefund` (refund form) | ✓ (transaction list) |
| `promo.tsx` | `useListPromoCodes`, `useCreatePromoCode`, `useUpdatePromoCode`, `useDeletePromoCode` | ✓ (alternate fetch) |
| `route-detail.tsx` | `useGetRoute`, `useGetRouteStations`, `useAddStation`, `useUpdateStation`, `useDeleteStation` | ✗ |
| `live-tracking.tsx` | `useGetAdminDriversLive` | ✓ (fallback polling) |

---

## 3. Page-by-Page Audit

### 3.1 Login (`/login`)

**Purpose:** Admin authentication gate.

| Element | Type | API call | Status |
|---|---|---|---|
| Credential field (email/phone) | Input | — | Live |
| Password field | Input | — | Live |
| Sign In button | Submit | `POST /auth/admin/login` | Live |

**Notes:**
- Accepts `{ credential, password }`. Backend returns `{ accessToken, refreshToken, user }`.
- Token stored in `localStorage` as `adminToken` and `adminRefreshToken`.
- `user.staffRoleId` and `user.permissions` array are stored and used for permission gating throughout the dashboard.
- No "Forgot password" link — intentional or missing feature.
- No "Remember me" toggle — token always persists in localStorage.

---

### 3.2 Dashboard (`/dashboard`)

**Purpose:** High-level KPIs, recent activity, analytics charts.

| Element | Type | API call | Live? |
|---|---|---|---|
| Summary KPI cards (users, drivers, trips, revenue) | Query | `GET /dashboard/summary` | Live |
| Analytics chart section | Query | `GET /admin/analytics` | Live |
| Dashboard analytics (alternate) | Query | `GET /dashboard/analytics` | Live |
| Activity feed | Query | `GET /dashboard/activity` | Live |
| Export / Download buttons (if present) | Button | None | Client-side only |

**Notes:**
- Two separate analytics endpoints called: `/admin/analytics` and `/dashboard/analytics`. Likely redundant — backend may return overlapping data.
- No polling interval configured on dashboard queries; data is stale until the user navigates away and back.

---

### 3.3 Users (`/users`)

**Purpose:** Paginated list of all passengers/users with block/unblock action.

| Element | Type | API call | Live? |
|---|---|---|---|
| User table (paginated) | Query | `useListAdminUsers` → `GET /admin/users` | Live |
| Search input | Filter | Passed as query param | Live |
| Block/Unblock toggle per row | Mutation | `useToggleBlockUser` → `PATCH /admin/users/:id/toggle-block` | Live |
| View user → `/users/:id` link | Navigation | — | Live |

---

### 3.4 User Detail (`/users/:id`)

**Purpose:** Full profile, booking history, wallet transactions, support tickets, saved locations.

| Element | Type | API call | Live? |
|---|---|---|---|
| User profile data | Query | `GET /admin/users/:userId` | Live |
| Booking history (paginated) | Query | `GET /bookings?userId=:id&page=:p&limit=8` | Live |
| Wallet transactions (paginated) | Query | `GET /admin/wallet/transactions?userId=:id&page=:p&limit=8` | Live |
| Support tickets (paginated) | Query | `GET /support/tickets?userId=:id&page=:p&limit=8` | Live |
| Saved Locations tab | Query | `GET /admin/user-locations?userId=:id` | Live |
| Promo picker (opens modal) | Query | `GET /promo?limit=50` (on modal open) | Live |
| Edit user (name/email/phone/role) | Mutation | `PATCH /admin/users/:userId` | Live |
| Block / Unblock | Mutation | `PATCH /admin/users/:userId/toggle-block` | Live |
| Add Balance | Mutation | `POST /admin/wallet/refund` | Live |
| Send Message (push notification) | Mutation | `POST /notifications` | Live |
| Send Promo → Notify button | Mutation | `POST /notifications` (sends promo code as notification text) | Live |
| Send Promo → Copy button | Clipboard | `navigator.clipboard.writeText(code)` | Client-only |
| **Add Note button** | Dialog | **None — toast only, no API call** | **DEAD** |
| Delete Account | Mutation | `DELETE /admin/users/:userId` | Live |

---

### 3.5 Drivers (`/drivers`)

**Purpose:** Driver roster with create/edit/delete, analytics summary.

| Element | Type | API call | Live? |
|---|---|---|---|
| Driver table | Query | `useListDrivers` → `GET /drivers` | Live |
| Driver analytics panel | Query | `GET /admin/driver-analytics` | Live |
| Add Driver form | Mutation | `useCreateDriver` → `POST /drivers` | Live |
| Edit Driver | Mutation | `useUpdateDriver` → `PATCH /drivers/:id` | Live |
| Delete Driver | Mutation | `adminFetch DELETE /admin/drivers/:id` | Live |
| View driver → `/drivers/:id` | Navigation | — | Live |

---

### 3.6 Driver Detail (`/drivers/:id`)

**Purpose:** Full driver profile, documents, trip history, block/send-message actions.

| Element | Type | API call | Live? |
|---|---|---|---|
| Driver profile | Query | `GET /drivers/:id` | Live |
| Driver documents | Query | `GET /driver-documents/by-driver/:id` | Live |
| Driver's trip list | Query | `GET /admin/trips?driverId=:id` | Live |
| Block / Unblock | Mutation | `PATCH /admin/users/:userId` (using driverId as userId) | Live |
| Edit driver fields | Mutation | `PATCH /drivers/:id` | Live |
| Approve/Reject document | Mutation | `PATCH /driver-documents/:docId` | Live |
| Send Message | Mutation | `POST /notifications` | Live |
| Send Promo | Mutation | `POST /notifications` (same pattern as user-detail) | Live |
| **Add Note button** | Dialog | **None — toast only, no API call** | **DEAD** |
| Delete Account | Mutation | `DELETE /admin/drivers/:id` | Live |

---

### 3.7 Driver Verification (`/driver-verification`)

**Purpose:** Queue of pending driver document submissions for approval/rejection.

| Element | Type | API call | Live? |
|---|---|---|---|
| Pending docs list | Query | `GET /driver-documents` | Live |
| Document stats (counts) | Query | `GET /driver-documents/stats` | Live |
| Approve document | Mutation | `PATCH /driver-documents/:id` `{ status: "approved" }` | Live |
| Reject document | Mutation | `PATCH /driver-documents/:id` `{ status: "rejected", notes }` | Live |

---

### 3.8 Bookings (`/bookings`)

**Purpose:** Paginated list of all bookings with filter and cancel action.

| Element | Type | API call | Live? |
|---|---|---|---|
| Bookings table (paginated) | Query | `GET /admin/bookings` | Live |
| Search / filter bar | Filter | Query params on same endpoint | Live |
| Cancel booking | Mutation | `PATCH /bookings/:id/cancel` | Live |
| View trip link | Navigation | `/trips/:tripId` | Live |
| View user link | Navigation | `/users/:userId` | Live |

---

### 3.9 Trips (`/trips`)

**Purpose:** Trip management — list, create, edit, cancel, delete.

| Element | Type | API call | Live? |
|---|---|---|---|
| Trip table (paginated) | Query | `useListTrips` → `GET /trips` | Live |
| Create trip form | Mutation | `useCreateTrip` → `POST /trips` | Live |
| Edit trip | Mutation | `useUpdateTrip` → `PATCH /trips/:id` | Live |
| Cancel trip | Mutation | `useCancelTrip` → `PATCH /trips/:id/cancel` | Live |
| **Delete trip** | Mutation | `adminFetch('/api/trips/${id}', DELETE)` | **BUG — spurious `/api/` prefix** |

---

### 3.10 Trip Detail (`/trips/:id`)

**Purpose:** Full trip view with bookings, refund per-booking, cancel, delete.

| Element | Type | API call | Live? |
|---|---|---|---|
| Trip data (polled every 15 s) | Query | `GET /trips/:id` | Live |
| Route info | Query | `GET /routes/:routeId` | Live |
| Driver info | Query | `GET /drivers/:driverId` | Live |
| Bus info | Query | `GET /buses/:busId` | Live |
| Bookings list | Query | `GET /bookings?tripId=:id&limit=50` | Live |
| Cancel trip | Mutation | `PATCH /trips/:id/cancel` | Live |
| Delete trip | Mutation | `DELETE /trips/:id` | Live |
| Refund booking | Mutation | `POST /admin/bookings/:bookingId/refund` | Live |
| **Add Note button** | Dialog | **None — toast only, no API call** | **DEAD** |

---

### 3.11 Payments (`/payments`)

**Purpose:** Payout management for drivers; booking payment overview.

| Element | Type | API call | Live? |
|---|---|---|---|
| Payout list | Query | `GET /admin/payouts` | Live |
| Confirm payout | Mutation | `PATCH /admin/payouts/:driverId/confirm` | Live |
| Booking payment list | Query | `GET /admin/bookings` (with payment filter) | Live |
| Manual refund form | Mutation | `POST /admin/wallet/refund` | Live |

---

### 3.12 Wallet (`/wallet`)

**Purpose:** Global wallet transaction ledger with filtering and manual refund issuance.

| Element | Type | API call | Live? |
|---|---|---|---|
| Transaction table (paginated) | Query | `GET /admin/wallet/transactions` with filters | Live |
| Search filter (name/description) | Filter | `?search=` query param | Live |
| User ID filter | Filter | `?userId=` query param | Live |
| Type filter (deposit/payment/refund) | Filter | `?type=` query param | Live |
| Date range (from/to) | Filter | `?dateFrom=&dateTo=` query params | Live |
| Clear filters button | UI | — | Live |
| Issue Manual Refund button | Mutation | `useAdminRefund` → `POST /admin/wallet/refund` | Live |

**Notes:**
- Mixed API layers: transaction list uses `adminFetch`, refund mutation uses generated `useAdminRefund`. Cache invalidation calls both `getListAllTransactionsQueryKey()` and `["wallet-transactions"]` to handle this.

---

### 3.13 Live Tracking (`/live-tracking`)

**Purpose:** Real-time map of active driver positions.

| Element | Type | API call | Live? |
|---|---|---|---|
| Driver position markers | WebSocket + Query | Socket.IO `driver:location` events + `useGetAdminDriversLive` → `GET /admin/drivers/live` | Live |
| Fallback polling | Query | `GET /admin/drivers/live` every 30 s if socket disconnected | Live |
| Driver info panel (click) | UI | From in-memory socket data | Live |
| Connection status indicator | UI | Socket.IO `connect`/`disconnect` events | Live |

---

### 3.14 Routes (`/routes`)

**Purpose:** Route CRUD — list, create, edit, delete. Links to route-detail for stations.

| Element | Type | API call | Live? |
|---|---|---|---|
| Route table | Query | `useListRoutes` → `GET /routes` | Live |
| Create route | Mutation | `useCreateRoute` → `POST /routes` | Live |
| Edit route | Mutation | `useUpdateRoute` → `PATCH /routes/:id` | Live |
| Delete route | Mutation | `useDeleteRoute` → `DELETE /routes/:id` | Live |
| View route detail | Navigation | `/routes/:id` | Live |

---

### 3.15 Route Detail (`/routes/:id`)

**Purpose:** Station management (Leaflet map), trip scheduling within the route, full CRUD.

| Element | Type | API call | Live? |
|---|---|---|---|
| Route info | Query | `useGetRoute` → `GET /routes/:id` | Live |
| Station list | Query | `useGetRouteStations` → `GET /routes/:id/stations` | Live |
| Add station (map click or form) | Mutation | `useAddStation` → `POST /routes/:id/stations` | Live |
| Edit station | Mutation | `useUpdateStation` → `PATCH /routes/:id/stations/:stationId` | Live |
| Delete station | Mutation | `useDeleteStation` → `DELETE /routes/:id/stations/:stationId` | Live |
| Trip schedule within route | Query | `GET /schedules?routeId=:id` | Live |
| Create schedule | Mutation | `POST /schedules` | Live |
| Generate trips from schedule | Mutation | `POST /schedules/:id/generate` | Live |
| Delete schedule | Mutation | `DELETE /schedules/:id` | Live |
| Leaflet map (station pins) | Map | OpenStreetMap tiles | Live (tiles from OSM CDN) |

---

### 3.16 Vehicles (`/vehicles`)

**Purpose:** Bus/vehicle fleet management.

| Element | Type | API call | Live? |
|---|---|---|---|
| Bus list | Query | `useListBuses` → `GET /buses` | Live |
| Vehicle list | Query | `useListVehicles` → `GET /vehicles` | Live |
| Add vehicle | Mutation | `useCreateVehicle` → `POST /vehicles` | Live |
| Edit vehicle | Mutation | `useUpdateVehicle` → `PATCH /vehicles/:id` | Live |
| Delete vehicle | Mutation | `useDeleteVehicle` → `DELETE /vehicles/:id` | Live |

---

### 3.17 Pricing (`/pricing`)

**Purpose:** Manage per-service-type base pricing, zone-based pricing, and surge settings.

| Element | Type | API call | Live? |
|---|---|---|---|
| Ride pricing list | Query | `GET /admin/rides/pricing` | Live |
| Edit ride price (per type) | Mutation | `PATCH /admin/rides/pricing/:type` | Live |
| Zone pricing list | Query | `GET /admin/zone-pricing` | Live |
| Edit zone price | Mutation | `PATCH /admin/zone-pricing/:id` | Live |
| Delete zone price | Mutation | `DELETE /admin/zone-pricing/:id` | Live |
| Add zone price | Mutation | `POST /admin/zone-pricing` | Live |
| Surge settings | Query | `GET /admin/surge-settings` | Live |
| Save surge settings | Mutation | `PATCH /admin/surge-settings` | Live |
| Commission rate | Query | `GET /admin/settings/commission` | Live |
| Save commission | Mutation | `PATCH /admin/settings/commission` | Live |

---

### 3.18 Audit Logs (`/audit-logs`)

**Purpose:** Searchable/filterable log of all admin actions.

| Element | Type | API call | Live? |
|---|---|---|---|
| Audit log table (paginated) | Query | `GET /admin/audit-logs` | Live |
| Action filter (distinct values) | Query | `GET /admin/audit-logs/distinct/actions` | Live |
| Entity type filter | Query | `GET /admin/audit-logs/distinct/entity-types` | Live |
| Date range filter | Filter | `?dateFrom=&dateTo=` | Live |
| Search filter | Filter | `?search=` | Live |
| Export button (if present) | Button | None | Client-side (if present) |

---

### 3.19 Chat Inbox (`/chat-inbox`)

**Purpose:** Monitor and participate in trip chat threads between drivers and passengers.

| Element | Type | API call | Live? |
|---|---|---|---|
| Chat stats | Query | `GET /admin/chat/stats` | Live |
| Chat thread list | Query | `GET /admin/chat?limit=50` | Live |
| Chat messages for a trip | Query | `GET /admin/chat/trip/:id` | Live |
| Send admin message | Mutation | `POST /admin/chat/trip/:id` | Live |
| New chat notification | WebSocket | Socket.IO `admin:new-chat-message` event | Live |
| Incoming chat message in thread | WebSocket | Socket.IO `trip:chat-message` event | Live |

---

### 3.20 Notifications (`/notifications`)

**Purpose:** Send broadcast or targeted push notifications; view notification history.

| Element | Type | API call | Live? |
|---|---|---|---|
| Notification history list | Query | `GET /admin/notifications/history` | Live |
| User search (for targeted send) | Query | `GET /admin/users/search?q=` | Live |
| Send targeted notification | Mutation | `POST /notifications` `{ userId, title, body }` | Live |
| Send broadcast notification | Mutation | `POST /admin/notifications/broadcast` `{ title, body }` | Live |

---

### 3.21 Promo Codes (`/promo`)

**Purpose:** Promo code CRUD.

| Element | Type | API call | Live? |
|---|---|---|---|
| Promo list | Query | `useListPromoCodes` + `adminFetch GET /promo?limit=50` | Live (both) |
| Create promo | Mutation | `useCreatePromoCode` → `POST /promo` | Live |
| Edit promo | Mutation | `useUpdatePromoCode` → `PATCH /promo/:id` | Live |
| Delete promo | Mutation | `useDeletePromoCode` → `DELETE /promo/:id` | Live |

**Notes:**
- Both the generated hook (`useListPromoCodes`) and a manual `adminFetch` to `/promo?limit=50` are used on this page. The generated hook is the primary list; the manual fetch is used for the in-page promo picker widget.

---

### 3.22 Ratings (`/ratings`)

**Purpose:** View and moderate trip/driver ratings.

| Element | Type | API call | Live? |
|---|---|---|---|
| Ratings list | Query | `GET /admin/ratings` | Live |
| Rating stats | Query | `GET /admin/ratings/stats` | Live |
| Delete rating | Mutation | `DELETE /admin/ratings/:id` | Live |

---

### 3.23 Reports (`/reports`)

**Purpose:** 7 sub-report views — Revenue, Trips, Drivers, Complaints, Driver Performance, Zone Performance, Custom.

| Element | Type | API call | Live? |
|---|---|---|---|
| Revenue report | Query | `GET /admin/analytics/revenue` | Live |
| Trips report | Query | `GET /admin/analytics/trips` | Live |
| Driver detailed analytics | Query | `GET /admin/analytics/drivers/detailed` | Live |
| Complaints report | Query | `GET /admin/analytics/complaints` | Live |
| Zone performance | Query | `GET /zones?limit=200` | Live |
| **Download CSV button** | Button | `document.createElement('a')` + Blob | **Client-side only — no server export** |
| **Print button** | Button | `window.print()` | **Client-side only** |
| Driver performance sub-report | Query | (uses driver analytics data already fetched) | Live |
| Custom report date filter | Filter | Date params passed to relevant endpoints | Live |

**Notes:**
- The "Download CSV" feature constructs a CSV blob entirely in the browser from whatever data is already loaded. It does **not** call a server export endpoint. Large datasets that exceed the page limit will produce incomplete CSVs.
- Zone Performance report calls `GET /zones?limit=200` — this is a hard-coded cap; zones beyond 200 are silently excluded.

---

### 3.24 Schedules (`/schedules`)

**Purpose:** Recurring trip schedule management.

| Element | Type | API call | Live? |
|---|---|---|---|
| Schedule list | Query | `GET /schedules` | Live |
| Create schedule | Mutation | `POST /schedules` | Live |
| Generate trips from schedule | Mutation | `POST /schedules/:id/generate` | Live |
| Delete schedule | Mutation | `DELETE /schedules/:id` | Live |

---

### 3.25 Services (`/services`)

**Purpose:** Per-service control panel (car/shuttle/bike) — enable/disable, display mode, zone restriction, maintenance mode with ETA.

| Element | Type | API call | Live? |
|---|---|---|---|
| Service status | Query | `GET /admin/services/:type/control` | Live |
| Service settings | Query | `GET /admin/services/:type/settings` | Live |
| Toggle enable/disable | Mutation | `PATCH /admin/services/:type/control` | Live |
| Reset service | Mutation | `POST /admin/services/:type/control/reset` | Live |
| Save settings | Mutation | `PATCH /admin/services/:type/settings` | Live |

---

### 3.26 Settings (`/settings`)

**Purpose:** App-wide settings — commission, app configuration, notification preferences.

| Element | Type | API call | Live? |
|---|---|---|---|
| Commission rate | Query | `GET /admin/settings/commission` | Live |
| Save commission | Mutation | `PATCH /admin/settings/commission` | Live |
| App settings (app name, etc.) | Query | `GET /admin/settings/app` | Live |
| Save app settings | Mutation | `PUT /admin/settings/app` | Live |
| **Notification preferences toggles** | LocalStorage | None — `localStorage.getItem/setItem` only | **NOT synced to backend** |

---

### 3.27 Staff (`/staff`)

**Purpose:** Internal staff user management and role/permission assignment.

| Element | Type | API call | Live? |
|---|---|---|---|
| Staff list | Query | Raw `fetch('/api/admin/staff')` | Live (but **wrong API layer**) |
| Role list | Query | Raw `fetch('/api/admin/roles')` | Live (but **wrong API layer**) |
| Create staff member | Mutation | Raw `fetch('/api/admin/staff', POST)` | Live (but **wrong API layer**) |
| Edit staff | Mutation | Raw `fetch('/api/admin/staff/:id', PATCH)` | Live (but **wrong API layer**) |
| Delete staff | Mutation | Raw `fetch('/api/admin/staff/:id', DELETE)` | Live (but **wrong API layer**) |
| Assign role | Mutation | Raw `fetch('/api/admin/staff/:id/role', PATCH)` | Live (but **wrong API layer**) |

**Critical Notes:**
- Staff page uses its own `apiFetch` helper that calls `/api/admin/staff` and `/api/admin/roles` with a hardcoded `/api/` prefix. This is **inconsistent** with every other page.
- The fetch does NOT use `adminFetch` — it does not automatically attach the Authorization header unless `apiFetch` adds it manually. Verify whether `apiFetch` in staff.tsx includes auth or if staff endpoints are accidentally unauthenticated.
- These endpoints are **not** covered by the generated client, so type safety is weaker here.

---

### 3.28 Suggestions (`/suggestions`)

**Purpose:** Review and respond to user-submitted suggestions.

| Element | Type | API call | Live? |
|---|---|---|---|
| Suggestion list | Query | `GET /suggestions` | Live |
| Suggestion detail | Query | `GET /suggestions/:id` | Live |
| Update suggestion status | Mutation | `PATCH /suggestions/:id` | Live |

---

### 3.29 Support (`/support`)

**Purpose:** Support ticket management — list, view thread, respond, change status.

| Element | Type | API call | Live? |
|---|---|---|---|
| Ticket list | Query | `GET /support/tickets` | Live |
| Support stats | Query | `GET /support/stats` | Live |
| Ticket detail | Query | `GET /support/tickets/:id` | Live |
| Update ticket (status/priority) | Mutation | `PATCH /support/tickets/:id` | Live |
| Send reply message | Mutation | `POST /support/tickets/:id/messages` | Live |

---

### 3.30 Zones (`/zones`)

**Purpose:** Geographic zone management with interactive Leaflet map.

| Element | Type | API call | Live? |
|---|---|---|---|
| Zone list | Query | `GET /zones` | Live |
| Create zone (form + map click) | Mutation | `POST /zones` | Live |
| Edit zone | Mutation | `PATCH /zones/:id` | Live |
| Delete zone | Mutation | `DELETE /zones/:id` | Live |
| Zone circles on map | Map | Leaflet `<Circle>` from zone data | Live (derived) |
| Set center by clicking map | UI | `useMapEvents` — local state only | Local (saved on submit) |

**Notes:**
- Map tiles loaded from OpenStreetMap CDN (`{s}.tile.openstreetmap.org`).
- Default center is Cairo (`[30.0444, 31.2357]`) — hardcoded.
- Leaflet icon URLs are loaded from `unpkg.com` CDN at runtime (no local asset).

---

### 3.31 Not Found (`/not-found` and catch-all)

Static 404 error page. No API calls. Returns user to `/dashboard` via a button. No issues.

---

## 4. Bugs & Confirmed Defects

### BUG-001 — Wrong URL Prefix on Trip Delete in `trips.tsx` ⚠️ HIGH

**File:** `artifacts/admin-dashboard/src/pages/trips.tsx`  
**Code:**
```ts
adminFetch(`/api/trips/${id}`, { method: 'DELETE' })
```
**Problem:** `adminFetch` already prepends `VITE_API_URL` (e.g. `http://localhost:3000`). Adding `/api/trips/` produces a URL like `http://localhost:3000/api/trips/5` instead of the correct `http://localhost:3000/trips/5`. Every other endpoint on this page (via generated hooks) uses bare paths. Delete will return 404 in production unless the backend coincidentally routes `/api/trips/:id`.

**Fix:** Change to `adminFetch(\`/trips/${id}\`, { method: 'DELETE' })`.

---

### BUG-002 — Staff Page Does Not Use `adminFetch` ⚠️ HIGH

**File:** `artifacts/admin-dashboard/src/pages/staff.tsx`  
**Problem:** Staff uses a local `apiFetch` helper that calls `/api/admin/staff` and `/api/admin/roles` directly. This deviates from every other page. Risk:
1. If `apiFetch` does not inject `Authorization: Bearer`, staff API calls may fail with 401 in production.
2. The `/api/` prefix may be wrong depending on server routing (same class of bug as BUG-001).

**Fix:** Replace `apiFetch` with `adminFetch` and normalize paths to `/admin/staff` and `/admin/roles`.

---

### BUG-003 — Trips.tsx Uses Stale `trips` List After Delete

**File:** `trips.tsx`  
**Problem:** The delete mutation uses `adminFetch` while the list is managed by the generated hook `useListTrips`. After delete, the code calls `queryClient.invalidateQueries({ queryKey: ["trips"] })` but the generated hook key may differ (e.g. `["listTrips", ...]`). The table may not refresh automatically.

**Fix:** Invalidate using the generated key: `queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() })`.

---

### BUG-004 — Zone Performance Report Hard-Capped at 200 Records ℹ️ LOW

**File:** `reports.tsx`  
**Problem:** Zone report fetches `GET /zones?limit=200`. If there are more than 200 zones, the report silently excludes them.

**Fix:** Implement server-side pagination or use a dedicated reporting endpoint that returns aggregate zone data without a fixed cap.

---

## 5. Dead Buttons / Fake Functionality

These UI elements are fully rendered and interactive (dialogs open, inputs accept text) but **no API call is ever made**. The success toast fires instantly with no backend persistence.

| # | Location | Button/Action | What Happens | Missing |
|---|---|---|---|---|
| 1 | `trip-detail.tsx` | **Add Note** | Dialog opens, user types, toast fires `"Note saved"`, data discarded | `POST /trips/:id/notes` or similar |
| 2 | `user-detail.tsx` | **Add Note** | Same as above — toast only | `POST /admin/users/:id/notes` or similar |
| 3 | `driver-detail.tsx` | **Add Note** | Same pattern | `POST /admin/drivers/:id/notes` or similar |
| 4 | `settings.tsx` | **Notification Preferences** toggles | Saved to `localStorage`, never synced | `PATCH /admin/settings/notifications` |

---

## 6. Missing Backend Endpoints

Endpoints called in the frontend that have no corresponding documented backend route, or that are assumed to exist based on the code but whose existence cannot be verified from the frontend alone.

| Endpoint | Called From | Risk |
|---|---|---|
| `POST /admin/bookings/:bookingId/refund` | `trip-detail.tsx` refund button | May not exist; no generated client hook for it |
| `GET /admin/user-locations?userId=:id` | `user-detail.tsx` Saved Locations tab | Not in generated client; no other reference |
| `POST /admin/notifications/broadcast` | `notifications.tsx` | Not in generated client |
| `GET /admin/users/search?q=` | `notifications.tsx` user search | Not in generated client |
| `GET /admin/analytics/complaints` | `reports.tsx` | Not in generated client |
| `GET /admin/driver-analytics` | `drivers.tsx` | Not in generated client |
| `GET /admin/services/:type/control` | `services.tsx` | Not in generated client |
| `PATCH /admin/services/:type/control` | `services.tsx` | Not in generated client |
| `POST /admin/services/:type/control/reset` | `services.tsx` | Not in generated client |
| `GET /admin/services/:type/settings` | `services.tsx` | Not in generated client |
| `PATCH /admin/services/:type/settings` | `services.tsx` | Not in generated client |
| `GET /admin/audit-logs/distinct/actions` | `audit-logs.tsx` | Not in generated client |
| `GET /admin/audit-logs/distinct/entity-types` | `audit-logs.tsx` | Not in generated client |
| `GET /admin/chat/stats` | `chat-inbox.tsx` | Not in generated client |
| `GET /admin/chat?limit=50` | `chat-inbox.tsx` | Not in generated client |
| `GET /admin/chat/trip/:id` | `chat-inbox.tsx` | Not in generated client |
| `POST /admin/chat/trip/:id` | `chat-inbox.tsx` | Not in generated client |
| `GET /admin/payouts` | `payments.tsx` | Not in generated client |
| `PATCH /admin/payouts/:driverId/confirm` | `payments.tsx` | Not in generated client |
| `GET /admin/notifications/history` | `notifications.tsx` | Not in generated client |
| `GET /support/stats` | `support.tsx` | Not in generated client |
| `GET /suggestions` | `suggestions.tsx` | Not in generated client |
| `GET /suggestions/:id` | `suggestions.tsx` | Not in generated client |
| `PATCH /suggestions/:id` | `suggestions.tsx` | Not in generated client |
| `POST /schedules/:id/generate` | `route-detail.tsx` | Not in generated client |
| `GET /admin/zone-pricing` | `pricing.tsx` | Not in generated client |
| `POST /admin/zone-pricing` | `pricing.tsx` | Not in generated client |
| `PATCH /admin/zone-pricing/:id` | `pricing.tsx` | Not in generated client |
| `DELETE /admin/zone-pricing/:id` | `pricing.tsx` | Not in generated client |
| `GET /admin/surge-settings` | `pricing.tsx` | Not in generated client |
| `PATCH /admin/surge-settings` | `pricing.tsx` | Not in generated client |
| `GET /admin/settings/app` | `settings.tsx` | Not in generated client |
| `PUT /admin/settings/app` | `settings.tsx` | Not in generated client |
| `GET /admin/ratings` | `ratings.tsx` | Not in generated client |
| `GET /admin/ratings/stats` | `ratings.tsx` | Not in generated client |
| `DELETE /admin/ratings/:id` | `ratings.tsx` | Not in generated client |
| `/api/admin/staff` (all CRUD) | `staff.tsx` | Wrong layer + unverified auth |
| `/api/admin/roles` (list) | `staff.tsx` | Wrong layer + unverified auth |

---

## 7. Data: Live vs Mocked

| Category | Status | Notes |
|---|---|---|
| All table/list data | **Live** | All queries hit real API endpoints |
| KPI summary cards | **Live** | `GET /dashboard/summary` |
| Charts / analytics | **Live** | Multiple `/admin/analytics/*` endpoints |
| Driver positions on map | **Live** | WebSocket + polling fallback |
| Zone circles on map | **Live** | Derived from zone API data |
| Station pins on map (route-detail) | **Live** | From `GET /routes/:id/stations` |
| Internal notes (trip/user/driver) | **Fake** | Toast only, no persistence |
| Settings → notification preferences | **Fake** | localStorage only, not persisted to server |
| Reports → CSV download | **Partial** | Client-side export of already-loaded page data only; incomplete for large datasets |
| Reports → Print | **Live** | `window.print()` — prints current view |
| Promo code picker (user/driver detail) | **Live** | Fetches `/promo?limit=50` on modal open |
| No placeholder / hardcoded mock data found | — | All empty states use real API responses |

---

## 8. Real-Time / WebSocket Usage

**Hook:** `src/hooks/useAdminSocket.ts`  
**Library:** Socket.IO client  
**URL:** `VITE_SOCKET_URL` env var (falls back to `VITE_API_URL`)

| Event | Direction | Used In | Purpose |
|---|---|---|---|
| `driver:location` | Server → Client | `live-tracking.tsx` | Update driver marker positions in real time |
| `admin:new-chat-message` | Server → Client | `chat-inbox.tsx` | Show notification badge / highlight thread |
| `trip:chat-message` | Server → Client | `chat-inbox.tsx` | Append new message to open thread |
| `connect` / `disconnect` | System | `live-tracking.tsx` | Toggle polling fallback |

**Fallback:** If the Socket.IO connection fails, `live-tracking.tsx` falls back to polling `GET /admin/drivers/live` every 30 seconds.

---

## 9. Authentication Flow

```
User submits login form
  → POST /auth/admin/login { credential, password }
  → Response: { accessToken, refreshToken, user: { id, name, email, role, staffRoleId, permissions[] } }
  → AuthContext.login() stores tokens and user in localStorage
  → setAuthTokenGetter() configures generated client to use token
  → adminFetch() reads token on every request
  → Role must be "admin" (backend enforced — passenger /auth/login blocks role=admin)
```

**Permission system:**  
`user.permissions[]` array controls which nav items and actions are visible. Permission checks use the `usePermissions` / `hasPermission` pattern from `AuthContext`. Staff users may have a subset of permissions based on their `staffRoleId`.

**Token refresh:**  
`adminFetch` in `src/lib/api.ts` includes a 401-intercept that attempts to refresh using `refreshToken` via an undocumented endpoint. If refresh fails, the user is logged out.

---

## 10. Complete Endpoint Inventory

All unique API calls made from the dashboard, organized by HTTP method:

### GET
```
/auth/admin/login                              (POST but listed here for completeness)
/dashboard/summary
/admin/analytics
/dashboard/analytics
/dashboard/activity
/admin/users                                   (generated: useListAdminUsers)
/admin/users/:id
/admin/users/search?q=
/admin/users/:id/toggle-block                  (PATCH)
/drivers                                       (generated: useListDrivers)
/drivers/:id
/admin/drivers/live                            (generated + manual polling)
/admin/driver-analytics
/driver-documents
/driver-documents/stats
/driver-documents/by-driver/:id
/admin/trips?driverId=:id
/trips                                         (generated: useListTrips)
/trips/:id
/buses                                         (generated: useListBuses)
/vehicles                                      (generated: useListVehicles)
/routes                                        (generated: useListRoutes)
/routes/:id                                    (generated: useGetRoute)
/routes/:id/stations                           (generated: useGetRouteStations)
/bookings?tripId=:id&limit=50
/bookings?userId=:id&page=:p&limit=8
/admin/bookings
/admin/payouts
/admin/wallet/transactions
/admin/wallet/transactions?userId=:id
/admin/settings/commission
/admin/settings/app
/admin/rides/pricing
/admin/zone-pricing
/admin/surge-settings
/admin/audit-logs
/admin/audit-logs/distinct/actions
/admin/audit-logs/distinct/entity-types
/admin/chat/stats
/admin/chat?limit=50
/admin/chat/trip/:id
/admin/notifications/history
/admin/ratings
/admin/ratings/stats
/admin/analytics/revenue
/admin/analytics/trips
/admin/analytics/drivers/detailed
/admin/analytics/complaints
/admin/services/:type/control
/admin/services/:type/settings
/admin/user-locations?userId=:id
/schedules
/schedules?routeId=:id
/support/tickets
/support/tickets?userId=:id
/support/tickets/:id
/support/stats
/suggestions
/suggestions/:id
/promo?limit=50
/zones
/zones?limit=200
/api/admin/staff                               (staff.tsx — wrong layer)
/api/admin/roles                               (staff.tsx — wrong layer)
```

### POST
```
/auth/admin/login
/drivers                                       (generated: useCreateDriver)
/vehicles                                      (generated: useCreateVehicle)
/trips                                         (generated: useCreateTrip)
/routes                                        (generated: useCreateRoute)
/routes/:id/stations                           (generated: useAddStation)
/promo                                         (generated: useCreatePromoCode)
/zones
/schedules
/schedules/:id/generate
/notifications                                 (targeted push)
/admin/notifications/broadcast
/admin/wallet/refund                           (manual + generated useAdminRefund)
/admin/bookings/:id/refund
/admin/chat/trip/:id
/admin/services/:type/control/reset
/api/admin/staff                               (staff.tsx — wrong layer)
```

### PATCH
```
/admin/users/:id
/admin/users/:id/toggle-block
/drivers/:id                                   (generated: useUpdateDriver)
/driver-documents/:id
/vehicles/:id                                  (generated: useUpdateVehicle)
/trips/:id                                     (generated: useUpdateTrip)
/trips/:id/cancel                              (generated: useCancelTrip)
/bookings/:id/cancel
/routes/:id                                    (generated: useUpdateRoute)
/routes/:id/stations/:stationId                (generated: useUpdateStation)
/promo/:id                                     (generated: useUpdatePromoCode)
/zones/:id
/support/tickets/:id
/suggestions/:id
/admin/settings/commission
/admin/rides/pricing/:type
/admin/zone-pricing/:id
/admin/surge-settings
/admin/services/:type/control
/admin/services/:type/settings
/admin/payouts/:driverId/confirm
/api/admin/staff/:id                           (staff.tsx — wrong layer)
/api/admin/staff/:id/role                      (staff.tsx — wrong layer)
```

### PUT
```
/admin/settings/app
```

### DELETE
```
/vehicles/:id                                  (generated: useDeleteVehicle)
/trips/:id                                     (trip-detail.tsx — correct)
/api/trips/:id                                 (trips.tsx — BUG-001, wrong prefix)
/routes/:id                                    (generated: useDeleteRoute)
/routes/:id/stations/:stationId                (generated: useDeleteStation)
/promo/:id                                     (generated: useDeletePromoCode)
/zones/:id
/admin/ratings/:id
/admin/zone-pricing/:id
/admin/drivers/:id
/admin/users/:id
/schedules/:id
/support/tickets/:id/messages                  (actually POST — listed for reference)
/api/admin/staff/:id                           (staff.tsx — wrong layer)
```

---

## 11. Summary & Priority Recommendations

### P0 — Fix Immediately (Broken Functionality)

| ID | Issue | File | Fix |
|---|---|---|---|
| BUG-001 | Trip delete always 404 — `/api/trips/:id` prefix | `trips.tsx` | Remove `/api/` prefix |
| BUG-002 | Staff CRUD may be unauthenticated / wrong URL | `staff.tsx` | Migrate to `adminFetch`, remove `/api/` prefix |
| BUG-003 | Query key mismatch after trip delete | `trips.tsx` | Use `getListTripsQueryKey()` for invalidation |

### P1 — Implement Missing Features

| Issue | Files | What to build |
|---|---|---|
| Internal Notes are fake | `trip-detail`, `user-detail`, `driver-detail` | `POST /trips/:id/notes`, `POST /admin/users/:id/notes`, `POST /admin/drivers/:id/notes`; store in DB; display in UI |
| Notification preferences not persisted | `settings.tsx` | `GET/PATCH /admin/settings/notifications`; remove localStorage dependency |

### P2 — Backend Endpoint Coverage Gaps

35+ endpoints called from the frontend are not part of the generated API client. While this does not break functionality (adminFetch still works), it means:
- No compile-time type safety
- No automatic cache key alignment
- Harder to refactor

**Recommendation:** Run the API codegen against all backend routes and regenerate `@workspace/api-client-react` to cover the full surface area.

### P3 — UX / Data Completeness Issues

| Issue | Impact |
|---|---|
| CSV export only exports current page data | Users expect full dataset; for large deployments, CSV will be truncated |
| Zone performance hard-capped at 200 | Silently missing data |
| Dashboard has no auto-refresh interval | KPIs become stale |
| No "Forgot password" on login page | Admin locked out scenario |
| Promo "Send" feature only copies/notifies — does not assign promo to user account | User must manually enter code |
| Booking detail view shows `Trip #N` (no trip name) | Not user-friendly; could link to trip detail |

### P4 — Code Quality

| Issue | Location |
|---|---|
| Two redundant analytics endpoints called on dashboard (`/admin/analytics` AND `/dashboard/analytics`) | `dashboard.tsx` |
| Mixed API layers (generated vs adminFetch) on same page with manual dual-invalidation | `wallet.tsx`, `promo.tsx` |
| Leaflet icon assets loaded from unpkg CDN at runtime | `zones.tsx`, `route-detail.tsx` — bundle the icons locally |
| `window.location.href = "/trips"` used for navigation after delete (bypasses Wouter SPA routing) | `trip-detail.tsx` |

---

*End of audit. Total pages analyzed: 31. Total unique endpoints catalogued: 85+.*
