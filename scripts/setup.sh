#!/bin/bash
set -e

# check secrets only
if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "DB missing"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "SESSION_SECRET missing"
  exit 1
fi

echo "Dependencies installing..."
pnpm install

echo "Setup complete (no servers started)"