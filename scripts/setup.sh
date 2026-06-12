#!/bin/bash
set -e

echo "========================================="
echo " Veego App - Starting up"
echo "========================================="

# Ensure a DB URL is available
if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "ERROR: No database URL found."
  echo "Please set NEON_DATABASE_URL in your Replit Secrets."
  exit 1
fi

echo "[1/4] Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "[2/4] Pushing database schema to Neon..."
pnpm --filter @workspace/db run push

echo "[3/4] Building API server..."
cd artifacts/api-server
pnpm run build
cd ../..

echo "[4/4] Starting services..."

# Start API server
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

# Start Admin dashboard dev server
cd artifacts/admin-dashboard
PORT=5000 BASE_PATH=/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
ADMIN_PID=$!
cd ../..

echo "========================================="
echo " API:        https://$REPLIT_DEV_DOMAIN/api"
echo " Dashboard:  https://$REPLIT_DEV_DOMAIN/"
echo "========================================="
echo "All services running. Press Ctrl+C to stop."

# Keep running until dashboard exits
wait $ADMIN_PID
