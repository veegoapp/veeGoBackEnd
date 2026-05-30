#!/bin/bash
set -e

echo "Checking secrets..."

if [ -z "$DATABASE_URL" ] && [ -z "$NEON_DATABASE_URL" ]; then
  echo "Missing DATABASE_URL"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "Missing SESSION_SECRET"
  exit 1
fi

echo "Installing dependencies..."
if [ ! -d node_modules ]; then
  pnpm install
fi

# ── API SERVER (fixed port 8080 only) ──
echo "Starting API server..."
(
  export PORT=8080
  export HOST=0.0.0.0
  pnpm --filter @workspace/api-server run build
  node artifacts/api-server/dist/index.mjs
) &

# ── ADMIN DASHBOARD (completely separate port) ──
echo "Starting admin dashboard..."
(
  export PORT=3000
  pnpm --filter @workspace/admin-dashboard run dev
)

wait