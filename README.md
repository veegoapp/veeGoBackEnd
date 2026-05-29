# ShuttleOps / VeeGo — Backend + Admin Dashboard

This project runs two services:
- **API Server** — Express REST API + Socket.IO on port **8080**
- **Admin Dashboard** — React + Vite on port **5000** (shown in Replit preview)

---

## Secrets to add before pressing Run

Go to **Tools → Secrets** and add these two:

| Secret | Required | Example value |
|--------|----------|---------------|
| `NEON_DATABASE_URL` | ✅ Yes | `postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |
| `SESSION_SECRET` | ✅ Yes | `change-me-to-any-long-random-string-32chars+` |

> **Get a free Postgres DB:** https://neon.tech → create project → copy connection string

---

## How to run

1. Add the two secrets above
2. Press the **Run** button

**What happens on first run (automatic):**
1. `pnpm install` — installs all dependencies
2. `drizzle-kit push` — creates all database tables
3. Seed script — creates default admin, driver, routes, buses, trips
4. Both services start

Subsequent runs skip steps 1–3 and go straight to starting services.

---

## Seed credentials

| Role   | Email                  | Password    |
|--------|------------------------|-------------|
| Admin  | admin@shuttleops.com   | password123 |
| Driver | driver@shuttleops.com  | password123 |
| User   | alice@example.com      | password123 |

---

## Notes

- Admin Dashboard talks to the API via Vite's `/api` proxy (→ localhost:8080)
- CORS accepts `*.replit.dev`, `*.kirk.replit.dev`, `*.expo.dev` automatically
- Socket.IO path: `/api/socket.io`
- After this project is deployed, use its `.replit.app` URL as `BACKEND_URL` in the passenger/driver apps
