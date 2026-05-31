#!/bin/bash
set -e

if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "DB missing"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "SESSION_SECRET missing"
  exit 1
fi

echo "Installing dependencies..."
pnpm install

# API
cd artifacts/api-server
pnpm install
pnpm build
pnpm start &

cd ..

# Admin
cd artifacts/admin-dashboard
pnpm install
pnpm dev --host 0.0.0.0