#!/bin/bash
set -e

# ── Validate required secrets ──────────────────────────────────────────────
if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "ERROR: NEON_DATABASE_URL (or DATABASE_URL) secret is not set."
  echo ""
  echo "  Go to Tools → Secrets in Replit and add:"
  echo "    NEON_DATABASE_URL = postgres://user:pass@host/dbname?sslmode=require"
  echo ""
  echo "  Tip: get a free Postgres DB at https://neon.tech"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "ERROR: SESSION_SECRET secret is not set."
  echo ""
  echo "  Go to Tools → Secrets in Replit and add:"
  echo "    SESSION_SECRET = any-long-random-string-at-least-32-chars"
  exit 1
fi

# ── First-time setup ───────────────────────────────────────────────────────
if [ ! -f .setup_done ]; then
  echo "=== [1/3] Installing dependencies (first run only) ==="
  pnpm install

  echo "=== [2/3] Pushing database schema ==="
  pnpm --filter @workspace/db run push

  echo "=== [3/3] Seeding database ==="
  pnpm --filter @workspace/db run seed

  touch .setup_done
  echo "=== First-time setup complete! ==="
  echo ""
else
  echo "=== Setup already done, starting services directly ==="
fi

# ── Start API server (background) ─────────────────────────────────────────
echo "=== Starting API server on :8080 ==="
PORT=8080 pnpm --filter @workspace/api-server run dev &

# ── Start Admin Dashboard (foreground — Replit preview) ───────────────────
echo "=== Starting Admin Dashboard on :5000 ==="
exec env PORT=5000 pnpm --filter @workspace/admin-dashboard run dev
