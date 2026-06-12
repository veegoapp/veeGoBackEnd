#!/bin/bash
echo "Checking environment..."
if [ -z "$DATABASE_URL" ] && [ -z "$NEON_DATABASE_URL" ]; then
  echo "Please paste your database URL:"
  read DB_INPUT
  export DATABASE_URL="$DB_INPUT"
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

# Monitor both processes — if API crashes, keep dashboard alive; only exit when dashboard exits
while kill -0 $ADMIN_PID 2>/dev/null; do
  sleep 5
done
