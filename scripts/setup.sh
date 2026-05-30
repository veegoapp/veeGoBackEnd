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

# ── Install dependencies (skip if node_modules already exists) ─────────────
if [ ! -d node_modules ]; then
  echo "=== Installing dependencies ==="
  pnpm install
else
  echo "=== Skipping install — node_modules already exists ==="
fi

# ── Start API server in background (build then start) ─────────────────────
echo "=== Starting API server ==="
(pnpm --filter @workspace/api-server run build && PORT=8080 pnpm --filter @workspace/api-server run start) &

# ── Print public API URL ───────────────────────────────────────────────────
if [ -n "$REPLIT_DEV_DOMAIN" ]; then
  FULL_API_URL="https://${REPLIT_DEV_DOMAIN}/api"
else
  FULL_API_URL="(REPLIT_DEV_DOMAIN not available)"
fi

echo ""
echo "=============================="
echo "PUBLIC API BASE URL:"
echo "/api"
echo "FULL URL: ${FULL_API_URL}"
echo "=============================="
echo ""

# ── Start admin dashboard in foreground ───────────────────────────────────
echo "=== Starting admin dashboard ==="
pnpm --filter @workspace/admin-dashboard run dev
