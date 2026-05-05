#!/usr/bin/env bash
# Ship Post Captain website + CY Strategies decks from staging → prod, with
# a safety backup of prod taken first. Each step is its own transaction; if
# anything fails the bundle stops and prints a recovery hint.
#
# Required env:
#   PROD_DATABASE_URL     — prod connection string
#                           (e.g. postgresql://postgres:...@metro.proxy.rlwy.net:25565/railway)
#   STAGING_DATABASE_URL  — staging connection string (= contents of .env DATABASE_URL)
#
# Optional env:
#   SKIP_BACKUP=1         — skip the pg_dump step (NOT RECOMMENDED unless you
#                           just took one manually)
#   DRY_RUN=1             — run all the .mjs scripts without --apply so they
#                           roll back; schema-sync still runs (idempotent).
#                           Use to validate end-to-end against prod without
#                           writing data.
#
# Usage:
#   PROD_DATABASE_URL='...' STAGING_DATABASE_URL='...' \
#     scripts/migrations/run-staging-to-prod-bundle.sh
#
#   # Or dry-run first:
#   DRY_RUN=1 PROD_DATABASE_URL='...' STAGING_DATABASE_URL='...' \
#     scripts/migrations/run-staging-to-prod-bundle.sh

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
PG17="/usr/local/opt/postgresql@17/bin"
PG18="/usr/local/opt/postgresql@18/bin"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# ── Pre-flight ────────────────────────────────────────────────────────────
echo "===================================================================="
echo "  Staging → Prod migration bundle"
echo "===================================================================="

if [[ -z "${PROD_DATABASE_URL:-}" ]]; then
  echo "ERROR: PROD_DATABASE_URL is required." >&2
  exit 1
fi
if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  echo "ERROR: STAGING_DATABASE_URL is required." >&2
  exit 1
fi
if [[ "$PROD_DATABASE_URL" == "$STAGING_DATABASE_URL" ]]; then
  echo "ERROR: PROD_DATABASE_URL and STAGING_DATABASE_URL point at the same DB." >&2
  exit 1
fi
if [[ "$PROD_DATABASE_URL" != *"metro.proxy.rlwy.net"* && "$PROD_DATABASE_URL" != *"tramway.proxy.rlwy.net"* ]]; then
  echo "WARNING: PROD_DATABASE_URL does not look like a known prod proxy host." >&2
  echo "         Continue? (y/N): " >&2
  read -r REPLY
  [[ "$REPLY" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

DRY_RUN_FLAG=""
APPLY_FLAG="--apply"
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "MODE: DRY RUN — .mjs scripts will roll back; schema-sync still runs (idempotent)."
  APPLY_FLAG=""
else
  echo "MODE: APPLY — schema and data changes WILL be committed to prod."
fi

# Redacted echo for verification
redact() { echo "$1" | sed 's|://[^@]*@|://[REDACTED]@|'; }
echo "PROD_DATABASE_URL    = $(redact "$PROD_DATABASE_URL")"
echo "STAGING_DATABASE_URL = $(redact "$STAGING_DATABASE_URL")"

# Detect server version for choosing pg_dump
PG_VER=$("$PG17/psql" "$PROD_DATABASE_URL" -tAc "SHOW server_version_num" | head -1)
if [[ "${PG_VER:0:2}" == "18" ]]; then
  PG_DUMP="$PG18/pg_dump"
  echo "prod server: PG 18 — using pg_dump 18"
elif [[ "${PG_VER:0:2}" == "17" ]]; then
  PG_DUMP="$PG17/pg_dump"
  echo "prod server: PG 17 — using pg_dump 17"
else
  echo "ERROR: unsupported prod PG version ($PG_VER)" >&2
  exit 1
fi

echo ""
echo "Continue? (y/N): "
read -r REPLY
[[ "$REPLY" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

# ── Step 1: safety backup ─────────────────────────────────────────────────
if [[ "${SKIP_BACKUP:-0}" != "1" ]]; then
  TS=$(date +%Y-%m-%dT%H-%M)
  BACKUP=".backups/simplerdev-realprod-pre-bundle-${TS}.dump"
  mkdir -p .backups
  echo ""
  echo "===================================================================="
  echo "  Step 1/4: pg_dump prod → $BACKUP"
  echo "===================================================================="
  echo "(this takes ~4 min for ~1.4 GB — set SKIP_BACKUP=1 to skip if you just took one)"
  time "$PG_DUMP" -Fc --no-owner --no-acl -f "$BACKUP" "$PROD_DATABASE_URL"
  ls -lh "$BACKUP"
else
  echo ""
  echo "===================================================================="
  echo "  Step 1/4: SKIPPED (SKIP_BACKUP=1)"
  echo "===================================================================="
fi

# ── Step 2: schema sync ───────────────────────────────────────────────────
echo ""
echo "===================================================================="
echo "  Step 2/4: apply schema sync (idempotent — safe to re-run)"
echo "===================================================================="
"$PG17/psql" "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/migrations/sync-prod-schema-to-staging.sql

# ── Step 3: Post Captain website mirror ───────────────────────────────────
echo ""
echo "===================================================================="
echo "  Step 3/4: mirror Post Captain website (literal mirror)"
echo "===================================================================="
SOURCE_DATABASE_URL="$STAGING_DATABASE_URL" \
  DATABASE_URL="$PROD_DATABASE_URL" \
  bun scripts/migrations/mirror-postcaptain-website.mjs $APPLY_FLAG

# ── Step 4: CY Strategies decks + survey ──────────────────────────────────
echo ""
echo "===================================================================="
echo "  Step 4/4: migrate CY Strategies decks + survey (additive)"
echo "===================================================================="
SOURCE_DATABASE_URL="$STAGING_DATABASE_URL" \
  DATABASE_URL="$PROD_DATABASE_URL" \
  bun scripts/migrations/migrate-cy-strategies.mjs $APPLY_FLAG

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo "===================================================================="
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "  DRY RUN COMPLETE — no data committed (schema sync DID commit, idempotent)"
else
  echo "  ALL STEPS COMMITTED"
fi
echo "===================================================================="
