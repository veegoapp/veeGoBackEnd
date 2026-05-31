#!/bin/bash
set -e
echo "Checking environment..."
if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "Please paste your database URL:"
  read DB_INPUT
  export NEON_DATABASE_URL="$DB_INPUT"
fi
echo "Installing dependencies once..."
pnpm install
echo "Starting API server..."
cd artifacts/api-server
pnpm build
PORT=8080 pnpm start &
API_PID=$!
cd ../..
echo "Starting Admin dashboard..."
cd artifacts/admin-dashboard
pnpm dev --host 0.0.0.0 &
ADMIN_PID=$!
cd ../..
echo "========================================="
echo "API URL: https://$REPLIT_DEV_DOMAIN/api"
echo "========================================="
echo "All services running..."
wait $API_PID $ADMIN_PID
