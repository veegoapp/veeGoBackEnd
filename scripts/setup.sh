#!/bin/bash
set -e

echo "Checking environment..."

if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "DB missing"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "SESSION_SECRET missing"
  exit 1
fi

echo "Installing dependencies once..."
pnpm install

echo "Starting API server..."
cd artifacts/api-server
pnpm build
pnpm start &
API_PID=$!

cd ../..

echo "Starting Admin dashboard..."
cd artifacts/admin-dashboard
pnpm dev --host 0.0.0.0 &
ADMIN_PID=$!

cd ../..

echo "All services running..."

wait $API_PID $ADMIN_PID