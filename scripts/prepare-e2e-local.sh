#!/usr/bin/env bash
# Prepare a fast LOCAL Postgres for the e2e suite so `bun test:critical:local`
# / `bun test:e2e:local` don't run the app server against the remote Railway DB
# (high latency → fixture-seed timeouts + cascade 404s — see the Release
# Stabilization spec). Mirrors the intent of `test:integration:local`, but e2e
# has no globalSetup template build, so we apply schema + seed directly here.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

LOCAL="postgresql://${USER}@localhost:5432/simplerdev_test"

./scripts/start-local-db.sh

echo ">> syncing schema to local (drizzle-kit push --force)"
# DRIZZLE_DATABASE_URL survives drizzle.config.ts's `.env.local` override, so
# this targets the LOCAL DB regardless of what `.env.local` points at.
DRIZZLE_DATABASE_URL="$LOCAL" DATABASE_URL="$LOCAL" npx drizzle-kit push --force

echo ">> seeding e2e admin/client fixture"
DATABASE_URL="$LOCAL" npx tsx scripts/seed-admin-e2e.ts

echo ">> local e2e DB ready: $LOCAL"
