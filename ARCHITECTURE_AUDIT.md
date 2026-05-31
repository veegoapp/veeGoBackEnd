# ShuttleOps Architecture Audit

**Generated:** 2026-05-30  
**Auditor:** Automated Code Analysis  
**Status:** Read-only analysis — no code modified

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Communication Map](#2-communication-map)
3. [API Inventory](#3-api-inventory)
4. [Authentication Flow](#4-authentication-flow)
5. [Admin Dashboard Data Flow](#5-admin-dashboard-data-flow)
6. [Database Audit](#6-database-audit)
7. [Booking Flow Trace](#7-booking-flow-trace)
8. [User Flow Trace](#8-user-flow-trace)
9. [Failure Points](#9-failure-points)
10. [Final Architecture Diagram](#10-final-architecture-diagram)

---

## 1. Repository Structure

### Monorepo Layout

```
shuttleops-backend/
├── artifacts/
│   ├── api-server/          ← Backend REST + WebSocket server
│   └── admin-dashboard/     ← React admin SPA
├── lib/
│   ├── db/                  ← Shared database layer (Drizzle ORM)
│   ├── api-spec/            ← OpenAPI spec + Orval codegen config
│   ├── api-client-react/    ← Generated React Query hooks + customFetch
│   └── api-zod/             ← Shared Zod validation schemas
├── scripts/
│   └── setup.sh             ← Run button entrypoint
├── .replit                  ← Replit config (ports, workflows, run command)
└── pnpm-workspace.yaml      ← Monorepo workspace definition
```

### Applications

#### `@workspace/api-server` — `artifacts/api-server/`

| Field | Value |
|---|---|
| Purpose | REST API + WebSocket server for all clients |
| Runtime | Node.js 20, Express 5 |
| Entry file | `src/index.ts` → builds to `dist/index.mjs` |
| Port | `8080` (env: `PORT`) |
| Build | `node ./build.mjs` (esbuild) |
| Start | `PORT=8080 node --enable-source-maps ./dist/index.mjs` |

**Dependencies:**
- `express` ^5.2.1 — HTTP framework
- `socket.io` ^4.8.3 — WebSocket (real-time driver location)
- `@workspace/db` — shared DB layer
- `@workspace/api-zod` — shared Zod schemas
- `jsonwebtoken` ^9.0.3 — JWT auth
- `bcryptjs` ^3.0.3 — password hashing
- `pino` / `pino-http` — structured logging
- `helmet` — HTTP security headers
- `express-rate-limit` — rate limiting
- `swagger-ui-express` + `swagger-jsdoc` — API docs at `/api/docs`
- `multer` — file uploads (driver documents)
- `cors` — CORS policy

---

#### `@workspace/admin-dashboard` — `artifacts/admin-dashboard/`

| Field | Value |
|---|---|
| Purpose | Admin SPA — manages users, trips, drivers, bookings |
| Runtime | React 19, Vite 7, TypeScript |
| Entry file | `src/main.tsx` |
| Port | `22133` (Replit-assigned workflow) / `5000` (setup.sh default) |
| Build output | `dist/public/` |
| Dev command | `PORT=${PORT:-5000} BASE_PATH=${BASE_PATH:-/} vite --host 0.0.0.0` |

**Dependencies:**
- `@workspace/api-client-react` — generated API hooks
- `@tanstack/react-query` ^5 — data fetching
- `wouter` ^3.3.5 — SPA routing
- `tailwindcss` ^4 + Radix UI — UI components
- `socket.io-client` — WebSocket (live driver tracking)
- `leaflet` + `maplibre-gl` — maps
- `i18next` + `react-i18next` — internationalisation
- `recharts` — analytics charts
- `xlsx` — spreadsheet export

---

#### `@workspace/db` — `lib/db/`

| Field | Value |
|---|---|
| Purpose | Shared database layer; schema definitions, migrations, seeding |
| Runtime | Node.js, Drizzle ORM, `pg` driver |
| Entry file | `src/index.ts` |
| DB | PostgreSQL (Neon serverless or standard) |
| Schema dir | `src/schema/` |

**Env vars:** `NEON_DATABASE_URL` (preferred) or `DATABASE_URL`

---

#### `@workspace/api-client-react` — `lib/api-client-react/`

| Field | Value |
|---|---|
| Purpose | Auto-generated React Query hooks + `customFetch` HTTP client |
| Runtime | React 19 (peer dep) |
| Entry file | `src/index.ts` |
| Generated from | `@workspace/api-spec` via Orval |

Key exports: `customFetch`, `setBaseUrl`, `setAuthTokenGetter`, all `use*` hooks.

---

#### `@workspace/api-zod` — `lib/api-zod/`

| Field | Value |
|---|---|
| Purpose | Shared Zod schemas for request/response validation |
| Runtime | Node.js (used by api-server) / bundled into client |

---

#### `@workspace/api-spec` — `lib/api-spec/`

| Field | Value |
|---|---|
| Purpose | OpenAPI spec + Orval codegen config |
| Runtime | Dev-only tooling |

---

### Port Map

| Local Port | External Port | Service |
|---|---|---|
| `8080` | `8080` | API Server |
| `5000` | `80` | Admin Dashboard (setup.sh) |
| `22133` | `3000` | Admin Dashboard (Replit workflow) |

---

## 2. Communication Map

### Protocol Overview

```
Passenger App (Expo/React Native)
    │
    │  HTTPS  POST /api/auth/login
    │  HTTPS  GET  /api/trips
    │  HTTPS  POST /api/bookings
    │  HTTPS  GET  /api/rides/my
    ▼
API Server (Express — port 8080)
    │
    ├── HTTP → PostgreSQL (via @workspace/db / Drizzle ORM)
    └── WebSocket (socket.io) → Driver App / Admin Dashboard


Admin Dashboard (Vite SPA — port 22133)
    │
    │  Relative HTTP (proxied by Vite dev server)
    │  /api/* → http://localhost:8080
    ▼
API Server (Express — port 8080)
    │
    └── HTTP → PostgreSQL

Driver App (Expo/React Native) — external repo
    │
    │  HTTPS  POST /api/driver/auth/login
    │  HTTPS  PATCH /api/driver/location
    │  WebSocket — emits driver_location events
    ▼
API Server
```

### Admin Dashboard Request Flow

```
1. User action in React component
2. React Query hook (generated via Orval) OR adminFetch()
3. customFetch() — prepends base URL (null → relative), attaches Bearer token
4. Browser fetch() → GET /api/admin/users?...
5. Vite dev server proxy: /api/* → http://localhost:8080
6. Express router matches /api/admin/users
7. authenticate middleware → verifies JWT → loads user from DB
8. requireRole("admin") → checks req.user.role
9. Handler queries DB via Drizzle ORM → returns JSON
10. Response flows back through proxy → React Query cache update → UI re-render
```

### WebSocket Flow (Real-time Driver Tracking)

```
Driver App
  └── socket.emit("driver_location", { lat, lng, heading, speed })
        ↓
  API Server (socket.io)
  └── Broadcast to admin room: socket.to("admin").emit("driver_location", data)
        ↓
  Admin Dashboard (live-tracking.tsx)
  └── useAdminSocket() → listens for "driver_location" → updates map markers
```

### API → Database Flow

```
Express Route Handler
  └── import { db } from "@workspace/db"
        ↓
  Drizzle ORM query (db.select / db.insert / db.update / db.delete)
        ↓
  pg.Pool → TCP connection to PostgreSQL
        ↓
  Neon PostgreSQL (cloud) or standard PostgreSQL
```

---

## 3. API Inventory

All routes are mounted under `/api` prefix (configured in `artifacts/api-server/src/app.ts` line 112).

### Health

| Method | Path | Auth | Role | File |
|---|---|---|---|---|
| GET | `/api/health` | No | — | `health.ts` |
| GET | `/api/healthz` | No | — | `health.ts` |
| GET | `/api/health/db` | No | — | `health.ts` |

### Authentication (`auth.ts`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| POST | `/api/auth/register` | No | — | Passenger signup |
| POST | `/api/auth/login` | No | — | Accepts `email` or `credential` field |
| POST | `/api/auth/refresh` | No | — | Rotating refresh token |
| GET | `/api/auth/me` | Yes | any | Deprecated — use `/api/users/me` |
| POST | `/api/auth/send-otp` | No | — | Sends SMS OTP |
| POST | `/api/auth/verify-otp` | No | — | Verifies OTP, marks user verified |
| POST | `/api/auth/forgot-password` | No | — | Sends SMS reset code |
| POST | `/api/auth/reset-password` | No | — | Resets password with token |

### User (`users.ts`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/api/users/me` | Yes | any | Canonical profile endpoint |
| PATCH | `/api/users/me` | Yes | any | Update own profile |
| POST | `/api/users/me/push-token` | Yes | any | Register Expo push token |
| GET | `/api/users/me/bookings` | Yes | any | Own booking history |

### Admin — Users (`admin.ts`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/api/admin/users` | Yes | admin | Paginated user list, filterable by role |
| GET | `/api/admin/users/search` | Yes | admin | Search users by query |
| GET | `/api/admin/users/:id` | Yes | admin | Single user detail |
| PATCH | `/api/admin/users/:id` | Yes | admin | Update user |
| PATCH | `/api/admin/users/:id/toggle-block` | Yes | admin | Block/unblock user |
| DELETE | `/api/admin/users/:id` | Yes | admin | Delete user |

### Admin — Analytics & Dashboard (`admin.ts`, `dashboard.ts`)

| Method | Path | Auth | Role | File |
|---|---|---|---|---|
| GET | `/api/admin/analytics` | Yes | admin | `admin.ts` |
| GET | `/api/admin/analytics/revenue` | Yes | admin | `admin.ts` |
| GET | `/api/admin/driver-analytics` | Yes | admin | `admin.ts` |
| GET | `/api/admin/drivers/live` | Yes | admin | `admin.ts` |
| GET | `/api/admin/trips` | Yes | admin | `admin.ts` |
| GET | `/api/admin/trips/:id/full-timeline` | Yes | admin | `admin.ts` |
| GET | `/api/admin/payouts` | Yes | admin | `admin.ts` |
| PATCH | `/api/admin/payouts/:driverId/confirm` | Yes | admin | `admin.ts` |
| GET | `/api/dashboard/summary` | Yes | admin | `dashboard.ts` |
| GET | `/api/dashboard/activity` | Yes | admin | `dashboard.ts` |
| GET | `/api/dashboard/analytics` | Yes | admin | `dashboard.ts` |
| GET | `/api/dashboard/today` | Yes | admin | `dashboard.ts` |

### Admin — Settings (`admin.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/admin/settings/commission` | Yes | admin |
| PATCH | `/api/admin/settings/commission` | Yes | admin |
| GET | `/api/admin/services/:type/settings` | Yes | admin |
| PATCH | `/api/admin/services/:type/settings` | Yes | admin |
| GET | `/api/admin/surge-settings` | Yes | admin |
| PATCH | `/api/admin/surge-settings` | Yes | admin |

### Bookings (`bookings.ts`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/api/bookings` | Yes | admin | Admin list (all bookings) |
| GET | `/api/admin/bookings` | Yes | admin | Used by dashboard UI |
| POST | `/api/bookings` | Yes | any | Passenger creates booking |
| GET | `/api/bookings/:id` | Yes | any | Get single booking |
| PATCH | `/api/bookings/:id/cancel` | Yes | any | Cancel booking |

### Routes & Stations (`routes.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/routes` | No | — |
| POST | `/api/routes` | Yes | admin |
| GET | `/api/routes/:id` | No | — |
| PATCH | `/api/routes/:id` | Yes | admin |
| DELETE | `/api/routes/:id` | Yes | admin |
| GET | `/api/routes/:id/stations` | No | — |
| POST | `/api/routes/:id/stations` | Yes | admin |
| PATCH | `/api/routes/:id/stations/:stationId` | Yes | admin |
| DELETE | `/api/routes/:id/stations/:stationId` | Yes | admin |

### Trips (`trips.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/trips` | No | — |
| POST | `/api/trips` | Yes | admin |
| GET | `/api/trips/:id` | No | — |
| PATCH | `/api/trips/:id` | Yes | admin |
| PATCH | `/api/trips/:id/cancel` | Yes | admin |

### Drivers (`drivers.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/drivers` | Yes | admin |
| POST | `/api/drivers` | Yes | admin |
| GET | `/api/drivers/me` | Yes | driver |
| PATCH | `/api/drivers/me/location` | Yes | driver |
| GET | `/api/drivers/:id` | Yes | admin |
| PATCH | `/api/drivers/:id` | Yes | admin |
| DELETE | `/api/drivers/:id` | Yes | admin |

### Driver App (`driver.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| POST | `/api/driver/auth/register` | No | — |
| POST | `/api/driver/auth/login` | No | — |
| POST | `/api/driver/auth/logout` | Yes | driver |
| GET | `/api/driver/me` | Yes | driver |
| PATCH | `/api/driver/me` | Yes | driver |
| GET | `/api/driver/me/vehicle` | Yes | driver |
| GET | `/api/driver/me/documents` | Yes | driver |
| POST | `/api/driver/me/documents` | Yes | driver |
| GET | `/api/driver/me/ratings` | Yes | driver |
| GET | `/api/driver/me/status` | Yes | driver |
| GET | `/api/driver/me/settings` | Yes | driver |
| PATCH | `/api/driver/me/settings` | Yes | driver |
| PATCH | `/api/driver/status/online` | Yes | driver |
| PATCH | `/api/driver/status/offline` | Yes | driver |
| PATCH | `/api/driver/location` | Yes | driver |
| GET | `/api/driver/trips` | Yes | driver |
| GET | `/api/driver/trips/:id` | Yes | driver |
| PATCH | `/api/driver/trips/:id/accept` | Yes | driver |
| PATCH | `/api/driver/trips/:id/reject` | Yes | driver |
| PATCH | `/api/driver/trips/:id/start` | Yes | driver |
| PATCH | `/api/driver/trips/:id/complete` | Yes | driver |
| PATCH | `/api/driver/trips/:id/cancel` | Yes | driver |
| GET | `/api/driver/trips/:id/stations` | Yes | driver |
| PATCH | `/api/driver/trips/:id/stations/:stationId/arrived` | Yes | driver |
| PATCH | `/api/driver/trips/:id/stations/:stationId/completed` | Yes | driver |
| PATCH | `/api/driver/bookings/:id/board` | Yes | driver |
| PATCH | `/api/driver/bookings/:id/absent` | Yes | driver |
| GET | `/api/driver/wallet/payout-methods` | Yes | driver |
| POST | `/api/driver/wallet/payout-methods` | Yes | driver |
| DELETE | `/api/driver/wallet/payout-methods/:id` | Yes | driver |
| POST | `/api/driver/wallet/payout` | Yes | driver |
| GET | `/api/driver/earnings` | Yes | driver |
| GET | `/api/driver/earnings/history` | Yes | driver |
| GET | `/api/driver/notifications` | Yes | driver |
| GET | `/api/driver/wallet/balance` | Yes | driver |
| GET | `/api/driver/settings` | Yes | driver |
| PATCH | `/api/driver/settings` | Yes | driver |
| GET | `/api/driver/reviews` | Yes | driver |
| GET | `/api/driver/promotions` | Yes | driver |

### On-Demand Rides (`rides.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/admin/rides/pricing` | Yes | admin |
| PATCH | `/api/admin/rides/pricing/:vehicleType` | Yes | admin |
| GET | `/api/admin/rides` | Yes | admin |
| GET | `/api/admin/rides/:id` | Yes | admin |
| POST | `/api/rides/estimate` | Yes | any |
| POST | `/api/rides/request` | Yes | user |
| GET | `/api/rides/my` | Yes | user |
| GET | `/api/rides/:id` | Yes | any |
| PATCH | `/api/rides/:id/cancel` | Yes | user |
| GET | `/api/driver/rides/available` | Yes | driver |
| PATCH | `/api/driver/rides/:id/accept` | Yes | driver |
| PATCH | `/api/driver/rides/:id/arrived` | Yes | driver |
| PATCH | `/api/driver/rides/:id/start` | Yes | driver |
| PATCH | `/api/driver/rides/:id/complete` | Yes | driver |
| PATCH | `/api/driver/rides/:id/cancel` | Yes | driver |
| POST | `/api/driver/rides/:id/start` | Yes | driver |
| POST | `/api/driver/rides/:id/complete` | Yes | driver |
| POST | `/api/driver/rides/:id/decline` | Yes | driver |
| POST | `/api/driver/rides/:id/rate-rider` | Yes | driver |
| POST | `/api/rides/:id/rate-driver` | Yes | user |

### Buses (`buses.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/buses` | Yes | admin |
| POST | `/api/buses` | Yes | admin |
| GET | `/api/buses/:id` | Yes | admin |
| PATCH | `/api/buses/:id` | Yes | admin |
| DELETE | `/api/buses/:id` | Yes | admin |

### Wallet (`wallet.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/wallet` | Yes | any |
| GET | `/api/wallet/transactions` | Yes | any |
| POST | `/api/wallet/topup` | Yes | any |
| GET | `/api/admin/wallet/transactions` | Yes | admin |
| POST | `/api/admin/wallet/refund` | Yes | admin |

### Promo Codes (`promo.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| POST | `/api/promo/validate` | Yes | any |
| GET | `/api/promo` | Yes | any |
| POST | `/api/promo` | Yes | admin |
| PATCH | `/api/promo/:id` | Yes | admin |
| DELETE | `/api/promo/:id` | Yes | admin |

### Notifications (`notifications.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/notifications` | Yes | any |
| GET | `/api/admin/notifications/history` | Yes | admin |
| POST | `/api/notifications` | Yes | admin |
| POST | `/api/admin/notifications/broadcast` | Yes | admin |
| PATCH | `/api/notifications/read-all` | Yes | any |
| PATCH | `/api/notifications/:id/read` | Yes | any |

### Staff & Roles (`staff.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/admin/permissions/all` | Yes | admin |
| GET | `/api/admin/roles` | Yes | admin |
| POST | `/api/admin/roles` | Yes | admin |
| PATCH | `/api/admin/roles/:id` | Yes | admin |
| DELETE | `/api/admin/roles/:id` | Yes | admin |
| GET | `/api/admin/staff` | Yes | admin |
| POST | `/api/admin/staff` | Yes | admin |
| PATCH | `/api/admin/staff/:id` | Yes | admin |

### Zones & Pricing (`zones.ts`, `zonePricing.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/zones` | Yes | admin |
| POST | `/api/zones` | Yes | admin |
| GET | `/api/zones/:id` | Yes | admin |
| PATCH | `/api/zones/:id` | Yes | admin |
| DELETE | `/api/zones/:id` | Yes | admin |
| GET | `/api/admin/zone-pricing` | Yes | admin |
| POST | `/api/admin/zone-pricing` | Yes | admin |
| PATCH | `/api/admin/zone-pricing/:id` | Yes | admin |
| DELETE | `/api/admin/zone-pricing/:id` | Yes | admin |

### Earnings (`earnings.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/earnings/summary` | Yes | any |
| GET | `/api/earnings/weekly` | Yes | any |
| GET | `/api/earnings` | Yes | admin |
| PATCH | `/api/earnings/:id/status` | Yes | admin |

### Driver Documents (`driverDocuments.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/driver-documents` | Yes | admin |
| GET | `/api/driver-documents/stats` | Yes | admin |
| GET | `/api/driver-documents/by-driver/:driverId` | Yes | admin |
| POST | `/api/driver-documents/upload/:driverId` | Yes | any |
| PATCH | `/api/driver-documents/:id` | Yes | admin |

### Support (`support.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/support/tickets` | Yes | any |
| GET | `/api/support/stats` | Yes | admin |
| GET | `/api/support/tickets/:id` | Yes | any |
| GET | `/api/support/tickets/:id/messages` | Yes | any |

### Suggestions (`suggestions.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/suggestions` | Yes | any |
| GET | `/api/suggestions/:id` | Yes | any |

### Shuttle (`shuttle.ts`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/api/shuttle/lines` | No | — |
| GET | `/api/shuttle/assignments` | No | — |
| GET | `/api/shuttle/lines/:id` | No | — |
| POST | `/api/shuttle/lines/:id/activate` | Yes | admin |
| POST | `/api/shuttle/lines/:id/complete` | Yes | admin |
| POST | `/api/shuttle/stops/:id/board` | Yes | any |
| GET | `/api/shuttle/trips/:id/passengers` | Yes | any |
| POST | `/api/shuttle/trips/:id/board-stop` | Yes | any |
| POST | `/api/shuttle/lines/:id/book` | Yes | any |
| GET | `/api/shuttle/lines/:id/passengers` | Yes | any |

**Total endpoints: ~145**

---

## 4. Authentication Flow

### Files Involved

| File | Role |
|---|---|
| `artifacts/api-server/src/lib/jwt.ts` | Token signing/verification |
| `artifacts/api-server/src/middlewares/auth.ts` | Request-level auth + RBAC |
| `artifacts/api-server/src/routes/auth.ts` | Login/register/refresh endpoints |
| `artifacts/api-server/src/routes/driver.ts` | Driver login/register |
| `artifacts/admin-dashboard/src/contexts/AuthContext.tsx` | Frontend token management |
| `artifacts/admin-dashboard/src/lib/api.ts` | adminFetch — attaches Bearer token |
| `lib/api-client-react/src/custom-fetch.ts` | customFetch — attaches Bearer token |

### Login Flow

```
Client → POST /api/auth/login  { credential: "email@x.com", password: "..." }
                                                    (or "email" field, normalized server-side)
  ↓
LoginBody.safeParse(body)           ← Zod validation
  ↓
db.select from usersTable WHERE email = credential OR phone = credential
  ↓
bcrypt.compare(password, user.password)
  ↓
if user.isBlocked → 403
  ↓
signAccessToken({ userId, role })   ← expires 15m, signed with SESSION_SECRET
signRefreshToken({ userId, role })  ← expires 30d, signed with SESSION_SECRET + "-refresh"
  ↓
db.update usersTable SET refreshToken = newToken
  ↓
Response: { accessToken, refreshToken, user }
```

### JWT Signing (`jwt.ts`)

```ts
ACCESS_SECRET  = process.env.SESSION_SECRET ?? "shuttle-access-secret"   // ⚠️ insecure fallback
REFRESH_SECRET = (process.env.SESSION_SECRET ?? "shuttle-refresh-secret") + "-refresh"

signAccessToken  → jwt.sign({ userId, role }, ACCESS_SECRET, { expiresIn: "15m" })
signRefreshToken → jwt.sign({ userId, role }, REFRESH_SECRET, { expiresIn: "30d" })
```

### authenticate Middleware (`auth.ts`)

```
Request arrives at protected endpoint
  ↓
Check Authorization: Bearer <token>  → 401 if missing
  ↓
verifyAccessToken(token)             → 401 if invalid/expired
  ↓
db.select { id, role, isBlocked, staffRoleId } WHERE id = payload.userId
  ↓
if !user                → 401
if user.isBlocked       → 403
if admin && staffRoleId → load permissions from staff_roles table
  ↓
req.user = { id, role, permissions, staffRoleId }
  ↓
next()
```

### requireRole Middleware

```ts
requireRole("admin")
  → if !req.user       → 401
  → if role !== "admin" → 403
  → next()
```

### requirePermission Middleware (granular admin RBAC)

```ts
requirePermission("view_bookings")
  → if role !== "admin"       → 403
  → if staffRoleId === null   → next() (Super Admin, bypasses all checks)
  → if !permissions.includes("view_bookings") → 403
  → next()
```

### Refresh Token Flow

```
Client → POST /api/auth/refresh  { refreshToken: "..." }
  ↓
verifyRefreshToken(token)   ← validates signature + expiry
  ↓
db.select WHERE id = payload.userId
  ↓
if user.refreshToken !== incoming token → 401 (reuse detection)
  ↓
signAccessToken(new payload)
signRefreshToken(new payload)         ← rotating — old token invalidated
  ↓
db.update SET refreshToken = newRefreshToken
  ↓
Response: { accessToken, refreshToken, user }
```

### Token Storage (Frontend)

| App | Storage | Method |
|---|---|---|
| Admin Dashboard | `localStorage` | `accessToken`, `refreshToken` keys |
| Passenger App | External (not in repo) | Likely AsyncStorage |
| Driver App | External (not in repo) | Likely AsyncStorage |

### Security Notes

| Issue | Severity | Detail |
|---|---|---|
| Insecure JWT fallback | High | If `SESSION_SECRET` unset, uses `"shuttle-access-secret"` hardcoded |
| localStorage token storage | Medium | XSS-susceptible; no HttpOnly cookie |
| No token reuse detection | Medium | DB check prevents reuse but no family invalidation |
| Short reset token entropy | Low | `crypto.randomBytes(4).hex()` = 8 hex chars |
| No CSRF protection | Low | JSON-only API; no form submission risk |

---

## 5. Admin Dashboard Data Flow

### Route → Component → Hook → Endpoint

| Route | Component File | Primary Hook | API Endpoint |
|---|---|---|---|
| `/login` | `pages/login.tsx` | `useLogin` | `POST /api/auth/login` |
| `/dashboard` | `pages/dashboard.tsx` | `useQuery` (adminFetch) | `GET /api/dashboard/summary`, `/api/admin/analytics`, `/api/admin/drivers/live`, `/api/dashboard/activity` |
| `/users` | `pages/users.tsx` | `useListAdminUsers` | `GET /api/admin/users?role=user` |
| `/users/:id` | `pages/user-detail.tsx` | `useQuery` (adminFetch) | `GET /api/admin/users/:id`, `/api/admin/bookings?userId=:id`, `/api/admin/wallet/transactions?userId=:id` |
| `/routes` | `pages/routes.tsx` | `useListRoutes`, `useCreateRoute` | `GET /api/routes`, `POST /api/routes`, `PATCH /api/routes/:id`, `DELETE /api/routes/:id` |
| `/routes/:id` | `pages/route-detail.tsx` | `useGetRoute`, `useGetRouteStations` | `GET /api/routes/:id`, `GET /api/routes/:id/stations`, `POST /api/trips`, etc. |
| `/trips` | `pages/trips.tsx` | `useListTrips`, `useCreateTrip` | `GET /api/trips`, `POST /api/trips`, `PATCH /api/trips/:id` |
| `/trips/:id` | `pages/trip-detail.tsx` | `useQuery` (adminFetch) | `GET /api/trips/:id`, `GET /api/bookings?tripId=:id`, `PATCH /api/admin/trips/:id/cancel` |
| `/drivers` | `pages/drivers.tsx` | `useListDrivers`, `useCreateDriver` | `GET /api/drivers`, `POST /api/drivers`, `PATCH /api/drivers/:id` |
| `/drivers/:id` | `pages/driver-detail.tsx` | `useQuery` (adminFetch) | `GET /api/drivers/:id`, `GET /api/admin/users/:userId`, `GET /api/driver-documents/by-driver/:id` |
| `/driver-verification` | `pages/driver-verification.tsx` | `useQuery` (adminFetch) | `GET /api/driver-documents`, `GET /api/driver-documents/stats`, `PATCH /api/driver-documents/:id` |
| `/buses` | `pages/buses.tsx` | `useListBuses`, `useCreateBus` | `GET /api/buses`, `POST /api/buses`, `PATCH /api/buses/:id`, `DELETE /api/buses/:id` |
| `/bookings` | `pages/bookings.tsx` | `useQuery` (adminFetch) | `GET /api/admin/bookings` |
| `/wallet` | `pages/wallet.tsx` | `useQuery`, `useAdminRefund` | `GET /api/admin/wallet/transactions`, `POST /api/admin/wallet/refund` |
| `/payments` | `pages/payments.tsx` | `useQuery` (adminFetch) | `GET /api/admin/wallet/transactions`, `GET /api/admin/payouts`, `GET /api/admin/settings/commission` |
| `/promo` | `pages/promo.tsx` | `useListPromoCodes`, `useCreatePromoCode` | `GET /api/promo`, `POST /api/promo`, `PATCH /api/promo/:id`, `DELETE /api/promo/:id` |
| `/pricing` | `pages/pricing.tsx` | `useQuery` (adminFetch) | `GET /api/admin/rides/pricing`, `GET /api/admin/zone-pricing`, `GET /api/admin/surge-settings` |
| `/zones` | `pages/zones.tsx` | `useQuery`, `useMutation` | `GET /api/zones`, `POST /api/zones`, `PATCH /api/zones/:id`, `DELETE /api/zones/:id` |
| `/live-tracking` | `pages/live-tracking.tsx` | `useGetAdminDriversLive`, `useAdminSocket` | `GET /api/admin/drivers/live` + WebSocket `driver_location` |
| `/support` | `pages/support.tsx` | `useQuery` (adminFetch) | `GET /api/support/tickets`, `GET /api/support/stats` |
| `/notifications` | `pages/notifications.tsx` | `useQuery`, `useMutation` | `GET /api/notifications`, `POST /api/notifications` |
| `/reports` | `pages/reports.tsx` | `useQuery` (adminFetch) | `GET /api/admin/analytics/revenue`, `/api/admin/analytics/trips`, `/api/admin/analytics/drivers/detailed`, etc. |
| `/staff` | `pages/staff.tsx` | `useQuery`, `useMutation` | `GET /api/admin/staff`, `GET /api/admin/roles`, `PATCH /api/admin/staff/:id/toggle-block` |
| `/settings` | `pages/settings.tsx` | `useQuery`, `useMutation` | `GET /api/admin/settings`, `PATCH /api/admin/settings/*` |
| `/services` | `pages/services.tsx` | `useQuery`, `useMutation` | `GET /api/admin/services`, `PATCH /api/admin/services/:id` |
| `/suggestions` | `pages/suggestions.tsx` | `useQuery` (adminFetch) | `GET /api/suggestions`, `GET /api/suggestions/:id` |

### ⚠️ Known Routing Bug

The sidebar nav in `app-layout.tsx` links to `/customers` (line 202), but **no `/customers` route exists in `App.tsx`**.

```
Sidebar: href="/customers"
App.tsx routes: /users, /users/:id   ← only these exist
                                     ← /customers falls to <NotFound />
```

Additionally, users.tsx links `onClick → window.location.href = /customers/:id` and dropdown links to `/customers/:id`, but App.tsx only defines `/users/:id`.

---

## 6. Database Audit

### Connection Layer

**Single shared connection — `lib/db/src/index.ts`:**

```ts
const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
// Throws if neither is set — no silent fallback

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
```

### Services Using `@workspace/db`

| Service | Import | Usage |
|---|---|---|
| `api-server` | `import { db, usersTable, ... } from "@workspace/db"` | All route handlers |
| `lib/db` scripts | Direct pool access | Seed, reset, migrations (CLI only) |

No other service directly accesses the database. All reads/writes go through the single `db` export.

### Schema Overview

| Table | Primary Key | Key Relations |
|---|---|---|
| `users` | `id` serial | → `drivers` (1:1), → `bookings` (1:N), → `wallet_transactions` (1:N), → `rides` (1:N) |
| `drivers` | `id` serial | → `users.id` (FK, cascade), → `buses.id` (FK) |
| `buses` | `id` serial | — |
| `routes` | `id` serial | → `stations` (1:N), → `trips` (1:N) |
| `stations` | `id` serial | → `routes.id` (FK, cascade) |
| `trips` | `id` serial | → `routes.id`, `buses.id`, `drivers.id` (FK) |
| `bookings` | `id` serial | → `users.id`, `trips.id`, `promo_codes.id` (FK) |
| `rides` | `id` serial | → `users.id` (passenger), `drivers.id` (FK) |
| `wallet_transactions` | `id` serial | → `users.id` (FK) |
| `promo_codes` | `id` serial | — |
| `zones` | `id` serial | — |
| `zone_pricing` | `id` serial | → `zones` |
| `ride_pricing` | `id` serial | — |
| `staff_roles` | `id` serial | — |
| `support_tickets` | `id` serial | → `users.id` |
| `support_messages` | `id` serial | → `support_tickets.id` |
| `notifications` | `id` serial | → `users.id` |
| `driver_documents` | `id` serial | → `drivers.id` |
| `driver_earnings` | `id` serial | → `drivers.id` |
| `ride_events` | `id` serial | → `rides.id` |
| `trip_events` | `id` serial | → `trips.id` |
| `trip_station_progress` | `id` serial | → `trips.id`, `stations.id` |
| `route_suggestions` | `id` serial | → `users.id` |
| `settings` | `id` serial | — |

### Dependency Graph

```
@workspace/api-server
    └── @workspace/db ←── NEON_DATABASE_URL / DATABASE_URL
            └── drizzle-orm
                    └── pg (node-postgres Pool)
                            └── PostgreSQL (Neon cloud)

@workspace/admin-dashboard
    └── @workspace/api-client-react
            └── customFetch → HTTP → api-server → @workspace/db

@workspace/db
    └── drizzle-kit (dev — push/generate)
```

---

## 7. Booking Flow Trace

### Shuttle Trip Booking (Passenger)

```
1. PASSENGER APP
   User browses trips → GET /api/trips
   Selects trip → GET /api/trips/:id
   Taps "Book" → POST /api/bookings
     Body: { tripId, seatCount, promoCodeId? }

2. API SERVER — POST /api/bookings (bookings.ts)
   authenticate → req.user set
   Validate body (Zod)
   Check trip exists + is active
   Check available seats
   Calculate total price (basePrice × seatCount, apply promo)
   Deduct from user.walletBalance (or mark payment pending)
   db.insert(bookingsTable, { userId, tripId, seatCount, totalPrice, status: "confirmed" })
   db.update(tripsTable SET availableSeats = availableSeats - seatCount)
   db.insert(walletTransactions, { userId, amount: -price, type: "payment" })
   Response: { booking }

3. DATABASE
   bookings row created
   trips.availableSeats decremented
   wallet_transactions row created
   users.walletBalance decremented

4. ADMIN DASHBOARD — /bookings page
   useQuery → GET /api/admin/bookings (bookings.ts)
   authenticate + requireRole("admin")
   JOIN bookings + users + trips → return paginated list
   Display in table with customer name, trip, status, price
```

### On-Demand Ride Booking (Passenger)

```
1. PASSENGER APP
   POST /api/rides/estimate  → get price quote
   POST /api/rides/request   → create ride (status: "requested")

2. API SERVER
   Finds available online drivers in vicinity
   Emits socket event to driver(s): ride_request

3. DRIVER APP (WebSocket)
   Receives ride_request
   PATCH /api/driver/rides/:id/accept → status: "accepted"
   Emits: driver_location updates

4. PASSENGER APP (WebSocket)
   Receives driver_assigned, driver_location updates
   Shows driver on map

5. Ride completion:
   PATCH /api/driver/rides/:id/complete
   → Calculate final price
   → Deduct from passenger wallet
   → Credit driver earnings
   → Create wallet_transactions
```

---

## 8. User Flow Trace

### Signup → DB → Admin Visibility

```
1. SIGNUP
   POST /api/auth/register
   Body: { name, email, phone, password }

   Zod validates RegisterBody
   Check email/phone uniqueness in usersTable
   bcrypt.hash(password, 12)
   db.insert(usersTable, { name, email, phone, password: hash, role: "user" })
   Sign access + refresh tokens
   db.update SET refreshToken
   Response: { accessToken, refreshToken, user }

2. CLIENT STORAGE
   Admin Dashboard: localStorage.setItem("accessToken", ...)
   Passenger App: AsyncStorage (external)

3. DATABASE RECORD
   users table:
     id, name, email, phone, password(hashed), role="user",
     walletBalance=0, isVerified=false, isBlocked=false, refreshToken

4. ADMIN DASHBOARD VISIBILITY
   /users page (actually routed as /users, broken nav link /customers)
   → useListAdminUsers({ role: "user" })
   → GET /api/admin/users?role=user&page=1&limit=10
   → authenticate + requireRole("admin")
   → db.select from usersTable WHERE role = "user"
   → Paginated response → rendered in table

5. BLOCKING / MANAGEMENT
   Admin: PATCH /api/admin/users/:id/toggle-block
   → db.update SET isBlocked = !isBlocked
   → User's next request: authenticate finds isBlocked=true → 403
```

---

## 9. Failure Points

### 404 — Route Not Found

| Trigger | Cause | Location |
|---|---|---|
| `GET /customers` | Nav links to `/customers`, App.tsx only defines `/users` | `App.tsx` + `app-layout.tsx` |
| `GET /customers/:id` | Row click/detail link uses `/customers/:id`, route is `/users/:id` | `users.tsx` line 151, 187 |
| `GET /api/*` (non-existent) | Express 404 handler returns `{ error: "Not found" }` | `app.ts` line 139 |
| Any unregistered API path | Falls through all routers to 404 catch-all | `app.ts` |

### 401 — Unauthorized

| Trigger | Cause |
|---|---|
| Missing `Authorization` header | `authenticate` middleware rejects |
| Expired access token (>15 min) | `verifyAccessToken` throws |
| Invalid token signature | JWT verification fails (wrong secret) |
| User deleted from DB after token issued | User not found in DB during auth |
| Token signed with old secret (after secret rotation) | Signature mismatch |

### 403 — Forbidden

| Trigger | Cause |
|---|---|
| Non-admin hits `/api/admin/*` | `requireRole("admin")` rejects |
| Driver hits passenger endpoints | Role mismatch |
| Blocked user makes any request | `authenticate` checks `isBlocked` |
| Staff admin missing specific permission | `requirePermission()` rejects |

### 500 — Server Errors

| Trigger | Likely Cause |
|---|---|
| DB query failure | Connection timeout (Neon cold start), schema mismatch |
| Missing `SESSION_SECRET` silently | jwt.ts uses insecure default — tokens still generated but with weak secret |
| Missing `PORT` env var | Server throws at startup and exits |
| Core tables missing | `verifyCoreTables()` at startup exits process |
| Unhandled async error in route | Express 5 auto-forwards to global error handler → `{ error: message }` |

### 502 — Proxy Errors

| Trigger | Cause |
|---|---|
| Admin dashboard can't reach API | API server not running on port 8080 |
| Port 8080 EADDRINUSE | setup.sh orphan process blocking workflow |
| API server crash during request | Process exits → Vite proxy returns 502 |
| Network timeout to Neon DB | DB connection retried (5x, 2s delay) → eventual 503 |

### Other Failure Points

| Issue | Detail |
|---|---|
| `SESSION_SECRET` unset on restart | Tokens signed with hardcoded default become invalid after restart if secret is now set |
| Vite proxy only in dev | `vite preview` (production preview) also has proxy config but `vite build` output has none — production needs a reverse proxy |
| `setBaseUrl` never called in admin dashboard | `customFetch` uses relative URLs — correct for web, but means any SSR or non-browser context would break |
| `driver.ts` has duplicate ride endpoints | `POST /driver/rides/:id/start` and `PATCH /driver/rides/:id/start` both exist — potential routing ambiguity |

---

## 10. Final Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHUTTLEOPS SYSTEM                            │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐    ┌──────────────────────┐
│   Passenger App      │    │   Driver App          │
│   (Expo / RN)        │    │   (Expo / RN)         │
│   [external repo]    │    │   [external repo]     │
└──────────┬───────────┘    └────────────┬──────────┘
           │ HTTPS                        │ HTTPS + WebSocket
           │ /api/auth/*                  │ /api/driver/*
           │ /api/bookings                │ /api/driver/rides/*
           │ /api/trips                   │ PATCH /api/driver/location
           │ /api/rides/*                 │
           ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    API SERVER                                     │
│              artifacts/api-server/                               │
│              Express 5 · Node 20 · Port 8080                     │
│                                                                  │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │  REST API   │  │   WebSocket    │  │    Middleware         │  │
│  │  ~145 routes│  │   socket.io    │  │  CORS · Helmet       │  │
│  │  /api/*     │  │   driver_loc   │  │  Rate Limit · Auth   │  │
│  └─────────────┘  └────────────────┘  └──────────────────────┘  │
│                                                                  │
│  JWT (15m access + 30d refresh) · bcrypt · pino logging         │
│  Swagger docs at /api/docs                                      │
└─────────────────────┬────────────────────┬───────────────────────┘
                      │                    │ WebSocket
                      │ Drizzle ORM        │ (admin room)
                      │ pg.Pool            │
                      ▼                    ▼
┌──────────────────────────┐   ┌──────────────────────┐
│  PostgreSQL (Neon)       │   │  Admin Dashboard      │
│  lib/db/                 │   │  artifacts/           │
│                          │   │  admin-dashboard/     │
│  Tables (24+):           │   │  React 19 · Vite 7    │
│  users, drivers, buses   │   │  Port 22133 (workflow)│
│  routes, stations, trips │   │  Port 5000 (setup.sh) │
│  bookings, rides         │   │                       │
│  wallet_transactions     │   │  Pages: 26            │
│  promo_codes, zones      │   │  ↓ Vite proxy         │
│  staff_roles, settings   │   │  /api/* → :8080       │
│  notifications, support  │   │                       │
│  driver_documents        │   │  Auth: localStorage   │
│  ride_pricing, earnings  │   │  Map: Leaflet/MapLibre│
│  zone_pricing, etc.      │   │  i18n: i18next        │
└──────────────────────────┘   └──────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                  SHARED LIBRARIES                                 │
│                                                                  │
│  lib/db/              → Drizzle schema + pool + migrations       │
│  lib/api-zod/         → Shared Zod request/response schemas      │
│  lib/api-client-react/→ Generated React Query hooks + fetch      │
│  lib/api-spec/        → OpenAPI spec + Orval codegen config      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                  STARTUP (Run Button)                             │
│                                                                  │
│  scripts/setup.sh                                                │
│    1. Validate NEON_DATABASE_URL / DATABASE_URL                  │
│    2. Validate SESSION_SECRET                                     │
│    3. pnpm install (if no node_modules)                          │
│    4. PORT=8080 pnpm --filter @workspace/api-server run start &  │
│    5. pnpm --filter @workspace/admin-dashboard run dev           │
│                                                                  │
│  ⚠ Conflict: Replit workflow also starts both services           │
│    → Port 8080 EADDRINUSE on workflow restart                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Appendix — Known Issues Summary

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | High | Nav `/customers` link → NotFound (route is `/users`) | `App.tsx`, `app-layout.tsx` |
| 2 | High | `SESSION_SECRET` fallback to hardcoded string | `jwt.ts` lines 10–11 |
| 3 | High | setup.sh + Replit workflow both bind port 8080 → EADDRINUSE | `setup.sh`, `.replit` |
| 4 | Medium | `localStorage` token storage (XSS risk) | `AuthContext.tsx` |
| 5 | Medium | No token family invalidation on refresh reuse | `auth.ts` refresh endpoint |
| 6 | Medium | `driver.ts` has duplicate START ride endpoints (PATCH + POST) | `driver.ts` / `rides.ts` |
| 7 | Low | `/api/auth/me` deprecated (kept for BC) | `auth.ts` |
| 8 | Low | Production build has no reverse proxy for `/api/*` | Deployment config |
| 9 | Low | `debug logging` left in `adminFetch` (console.group) | `src/lib/api.ts` |
