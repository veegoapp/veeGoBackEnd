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
  echo "=== [1/3] Installing dependencies ==="
  pnpm install
else
  echo "=== [1/3] Skipping install — node_modules already exists ==="
fi

# ── Push database schema ───────────────────────────────────────────────────
echo "=== [2/3] Pushing database schema ==="
pnpm --filter @workspace/db run push

# ── Seed database (skip if already seeded) ────────────────────────────────
if [ ! -f .seed_done ]; then
  echo "=== [3/3] Seeding database ==="
  pnpm --filter @workspace/db run seed
  touch .seed_done
  echo "=== Seeding complete ==="
else
  echo "=== [3/3] Skipping seed — already seeded ==="
fi

echo ""
echo "=== Setup complete. Services are managed by Replit workflows. ==="
