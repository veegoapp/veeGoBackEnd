# ShuttleOps — Backend API + Admin Dashboard

A full-stack shuttle management platform consisting of:

- **API Server** — Express.js REST API + Socket.IO, running on port `8080`
- **Admin Dashboard** — React + Vite SPA, running on port `5000`

Designed to serve three clients: admin dashboard, driver mobile app, and passenger mobile app — all consuming the same REST API.

---

## Project Structure

```
├── artifacts/
│   ├── api-server/          # Express API server (TypeScript)
│   └── admin-dashboard/     # React admin panel (Vite + Tailwind)
├── lib/
│   ├── db/                  # Drizzle ORM schema + migrations
│   ├── api-spec/            # OpenAPI specification
│   ├── api-zod/             # Shared Zod validation schemas
│   └── api-client-react/    # Generated React Query hooks
├── scripts/
│   └── seed.ts              # Optional DB seed script
├── .env.example             # Environment variable template
└── pnpm-workspace.yaml      # pnpm monorepo config
```

---

## Prerequisites

- **Node.js** v20+
- **pnpm** v9+ (`npm install -g pnpm`)
- **PostgreSQL** database — [Neon](https://neon.tech) (free tier works)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `NEON_DATABASE_URL` | ✅ Yes | Neon PostgreSQL connection string |
| `DATABASE_URL` | ✅ Yes (fallback) | Standard PostgreSQL URL (used if Neon URL not set) |
| `SESSION_SECRET` | ✅ Yes | Long random string for signing JWT tokens (32+ chars) |
| `SMS_PROVIDER` | No | `twilio` or `console` (default: `console`) |
| `TWILIO_ACCOUNT_SID` | If Twilio | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | If Twilio | Twilio auth token |
| `TWILIO_FROM_NUMBER` | If Twilio | Twilio sender number (e.g. `+1234567890`) |
| `NODE_ENV` | No | `development` or `production` (default: `development`) |
| `LOG_LEVEL` | No | `info`, `debug`, `warn` (default: `info`) |
| `PORT` | No | API server port (default: `8080`) |

> **Get a free Neon DB:** https://neon.tech → New Project → copy the connection string

---

## Install Dependencies

```bash
pnpm install
```

---

## Database Setup

Push the schema to your database (creates all tables):

```bash
pnpm --filter @workspace/db run push
```

**Optional — seed with demo data:**

```bash
./lib/db/node_modules/.bin/tsx --tsconfig tsconfig.json scripts/seed.ts
```

Seed credentials:

| Role | Email | Password |
|---|---|---|
| Admin | admin@shuttleops.com | Admin@123 |
| Dispatcher | dispatch@shuttleops.com | Staff@123 |
| Driver | emeka.driver@shuttleops.com | Driver@123 |
| Passenger | alice@example.com | Alice@123 |

---

## Running Locally

### API Server (port 8080)

```bash
pnpm --filter @workspace/api-server run dev
```

### Admin Dashboard (port 5000)

```bash
pnpm --filter @workspace/admin-dashboard run dev
```

The dashboard proxies `/api` requests to `http://localhost:8080` automatically via Vite config — no extra configuration needed.

### Run Both Together (Replit)

Press **Run** — both services start automatically via the configured workflows.

---

## API

- **Base URL (local):** `http://localhost:8080/api`
- **Swagger docs:** `http://localhost:8080/api/docs`
- **OpenAPI JSON:** `http://localhost:8080/api/openapi.json`

Authentication uses **JWT Bearer tokens**. Obtain a token via:

```
POST /api/auth/login
{ "credential": "phone_or_email", "password": "..." }
```

Include the returned `accessToken` in all subsequent requests:

```
Authorization: Bearer <accessToken>
```

---

## Connecting Mobile Apps (Driver / Passenger)

Set the API base URL in the mobile app to your deployed server URL:

```
https://your-deployed-api.com/api
```

- CORS is pre-configured to accept `*.replit.dev`, `*.expo.dev`, and `localhost` origins.
- Socket.IO path: `/api/socket.io`

---

## Building for Production

```bash
# Build API server
pnpm --filter @workspace/api-server run build

# Build admin dashboard
pnpm --filter @workspace/admin-dashboard run build
```

---

## Notes

- The system starts **empty** — no data is inserted automatically on startup.
- Run the seed script manually if you need demo data.
- Secrets are never committed — see `.gitignore` and `.env.example`.
- `uploads/` (driver documents) is git-ignored and must be persisted separately in production (object storage recommended).
