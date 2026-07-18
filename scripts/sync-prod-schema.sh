#!/usr/bin/env bash
# =============================================================================
# sync-prod-schema.sh — Additive-only schema sync for production Postgres
#
# PURPOSE
#   Brings a LIVE database up to the schema defined in a TARGET database by
#   applying ONLY:
#     • CREATE TABLE  — for tables present in TARGET but missing in LIVE
#     • ALTER TABLE … ADD COLUMN IF NOT EXISTS  — for columns present in
#       TARGET but missing on tables that already exist in LIVE
#
#   This script NEVER drops, renames, or modifies any existing object.
#   It will ABORT before touching the live DB if any DROP statement is
#   detected in the generated SQL (safety net against logic bugs).
#
# USAGE
#   TARGET_DATABASE_URL="postgres://..." \
#   LIVE_DATABASE_URL="postgres://..."   \
#   bash scripts/sync-prod-schema.sh
#
# ENVIRONMENT
#   TARGET_DATABASE_URL  (required) Connection string for the reference/target DB
#   LIVE_DATABASE_URL    (required) Connection string for the production/live DB
#   PGDUMP               (optional) Path to pg_dump binary; default: pg_dump
#                        Must be >= the server major version of both databases.
#
# MANUAL REMOVALS
#   Intentional column/table removals MUST be performed by hand with a backup —
#   this script will never generate DROP statements and therefore will not
#   propagate deletions automatically.
# =============================================================================
set -euo pipefail

TARGET="${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
LIVE="${LIVE_DATABASE_URL:?set LIVE_DATABASE_URL}"
PGDUMP="${PGDUMP:-pg_dump}"   # must be >= the TARGET/LIVE server major version

# Working directory — cleaned up on exit
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SQL="$WORK/sync.sql"
: > "$SQL"

echo "=== Additive-only schema sync ==="
echo "TARGET: ${TARGET%%@*}@…  (credentials redacted)"
echo "LIVE:   ${LIVE%%@*}@…  (credentials redacted)"
echo

# -----------------------------------------------------------------------------
# 1) Tables present in TARGET but missing in LIVE → dump their full CREATE DDL
# -----------------------------------------------------------------------------
psql "$TARGET" -tA -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1" \
  > "$WORK/t_target"

psql "$LIVE" -tA -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1" \
  > "$WORK/t_live"

comm -23 "$WORK/t_target" "$WORK/t_live" > "$WORK/t_missing"

targs=()
while IFS= read -r t; do
  [ -n "$t" ] && targs+=(-t "public.$t")
done < "$WORK/t_missing"

if [ "${#targs[@]}" -gt 0 ]; then
  echo "Missing tables to CREATE: $(wc -l < "$WORK/t_missing" | tr -d ' ')"
  cat "$WORK/t_missing"
  echo
  "$PGDUMP" "$TARGET" --schema-only --no-owner --no-privileges "${targs[@]}" >> "$SQL"
else
  echo "No missing tables."
fi

# -----------------------------------------------------------------------------
# 2) Columns present in TARGET but missing on shared tables in LIVE
#    → emit ALTER TABLE … ADD COLUMN IF NOT EXISTS
# -----------------------------------------------------------------------------
psql "$TARGET" -tA -F. -c \
  "SELECT table_name, column_name
   FROM information_schema.columns
   WHERE table_schema='public'
   ORDER BY 1, 2" \
  > "$WORK/c_target"

psql "$LIVE" -tA -F. -c \
  "SELECT table_name, column_name
   FROM information_schema.columns
   WHERE table_schema='public'
   ORDER BY 1, 2" \
  > "$WORK/c_live"

# Exclude columns that belong to wholly-missing tables (they'll be created in §1)
comm -23 "$WORK/c_target" "$WORK/c_live" \
  | grep -vF -f <(sed 's/$/./' "$WORK/t_missing") \
  > "$WORK/c_missing" || true

missing_col_count=0
while IFS=. read -r tbl col; do
  [ -z "$tbl" ] && continue
  missing_col_count=$((missing_col_count + 1))

  # Retrieve type, NOT NULL flag, and default expression from TARGET
  line=$(psql "$TARGET" -tA -c \
    "SELECT format_type(a.atttypid, a.atttypmod)
          || '|' || a.attnotnull
          || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
     FROM pg_attribute      a
     JOIN pg_class          c ON c.oid = a.attrelid
     JOIN pg_namespace      n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef   d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = 'public'
       AND c.relname = '$tbl'
       AND a.attname = '$col'
       AND a.attnum  > 0")

  typ="${line%%|*}"
  rest="${line#*|}"
  nn="${rest%%|*}"
  dfl="${rest#*|}"

  stmt="ALTER TABLE public.\"$tbl\" ADD COLUMN IF NOT EXISTS \"$col\" $typ"
  [ -n "$dfl" ] && stmt="$stmt DEFAULT $dfl"
  # Only re-assert NOT NULL when there is a default — otherwise the statement
  # would fail on existing rows that have no value for the new column.
  [ "$nn" = "t" ] && [ -n "$dfl" ] && stmt="$stmt NOT NULL"

  echo "$stmt;" >> "$SQL"
done < "$WORK/c_missing"

if [ "$missing_col_count" -gt 0 ]; then
  echo "Missing columns to ADD: $missing_col_count"
else
  echo "No missing columns."
fi

# -----------------------------------------------------------------------------
# 3) Safety net — ABORT if any DROP statement appears in the generated SQL
# -----------------------------------------------------------------------------
if grep -iqE '(^|[^_a-zA-Z])DROP[[:space:]]' "$SQL"; then
  echo ""
  echo "ABORT: DROP detected in generated SQL — refusing to apply."
  echo "Offending lines:"
  grep -inE '(^|[^_a-zA-Z])DROP[[:space:]]' "$SQL" || true
  exit 1
fi

# -----------------------------------------------------------------------------
# 4) Apply atomically — all-or-nothing via a single transaction
# -----------------------------------------------------------------------------
if [ -s "$SQL" ]; then
  echo ""
  echo "Applying additive schema changes (atomic transaction):"
  echo "  CREATE TABLE statements : $(grep -c '^CREATE TABLE' "$SQL" || echo 0)"
  echo "  ADD COLUMN statements   : $(grep -c 'ADD COLUMN'   "$SQL" || echo 0)"
  echo ""
  psql "$LIVE" -v ON_ERROR_STOP=1 --single-transaction -f "$SQL"
  echo ""
  echo "=== Schema sync complete. ==="
else
  echo ""
  echo "=== Schema already in sync; nothing to do. ==="
fi
