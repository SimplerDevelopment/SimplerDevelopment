#!/usr/bin/env bash
# Tenancy gate with drift-proof DB resolution.
#
#   1. DATABASE_URL_TEST set → use it verbatim (CI injects its service DB).
#   2. Otherwise → self-provision the local PG17 test DB (start-local-db.sh),
#      ensure extensions, and sync the schema (drizzle-kit push) so a stale
#      local schema can't fail the suite.
#
# Ambient DATABASE_URL is NEVER consulted — that's exactly how tenancy runs
# used to silently execute against remote Railway/staging DBs and time out.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL_TEST:-}" ]; then
  ./scripts/start-local-db.sh
  LOCAL="postgresql://${USER}@localhost:5432/simplerdev_test"
  PSQL="$(command -v psql || echo /usr/local/opt/postgresql@17/bin/psql)"
  "$PSQL" "$LOCAL" -q -c 'CREATE EXTENSION IF NOT EXISTS vector' -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm' -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto'
  echo ">> syncing schema to the local test DB (drizzle-kit push)"
  DRIZZLE_DATABASE_URL="$LOCAL" DATABASE_URL="$LOCAL" npx drizzle-kit push --force >/dev/null
  export DATABASE_URL_TEST="$LOCAL"
fi

# The test runner reads DATABASE_URL too — pin it to the SAME test DB so no
# code path can fall through to an ambient (possibly remote) URL.
export DATABASE_URL="$DATABASE_URL_TEST"

exec scripts/test.sh --layer=integration --tag=tenancy --no-coverage
