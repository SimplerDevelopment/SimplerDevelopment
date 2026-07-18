#!/usr/bin/env bash
# =============================================================================
# check-schema-drift.sh — read-only preflight for NON-ADDITIVE schema drift.
#
# WHY
#   prod-schema-sync.yml applies ADDITIVE changes (CREATE TABLE / ADD COLUMN)
#   to prod automatically. It is blind to changes it cannot safely make:
#     • a shared column whose TYPE changed in the code (text → integer, …)
#     • a shared column the code now requires NOT NULL that is nullable in prod
#   The additive sync silently skips these, so the deployed code and the live DB
#   diverge — the schema-mismatch outage class (claude-mem S487). This check
#   FAILS when such drift exists, so it can block the PR to main BEFORE the
#   concurrent deploy+sync ever runs. It is a preflight, not an applier: it
#   only runs SELECTs against LIVE and never writes.
#
# USAGE
#   TARGET_DATABASE_URL="postgres://…"  # code's schema, built into a temp DB
#   LIVE_DATABASE_URL="postgres://…"    # production (read-only here)
#   bash scripts/check-schema-drift.sh
#
#   Self-check (no DB needed):  bash scripts/check-schema-drift.sh --selftest
#
# EXIT
#   0 = no blocking drift (additive-only pending changes are reported, not blocked)
#   1 = blocking non-additive drift found (or a self-test failure)
# =============================================================================
set -uo pipefail

# --- portable column dump: "table.column|type|notnull" for real tables -------
# format_type() gives a canonical type string so text vs varchar(n) vs int are
# comparable across the two DBs the same way drizzle-kit would render them.
COLUMN_QUERY="
SELECT c.relname || '.' || a.attname || '|'
    || format_type(a.atttypid, a.atttypmod) || '|'
    || a.attnotnull
FROM pg_attribute a
JOIN pg_class     c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum  > 0
  AND NOT a.attisdropped
ORDER BY 1;"

# classify TARGET_FILE LIVE_FILE  → prints one BLOCK line per non-additive drift;
# returns the number of blocking findings. Pure text join, no DB, bash-3.2 safe
# (macOS ships bash 3.2 — no associative arrays), so it is unit-testable offline.
classify() {
  local tgt="$1" live="$2"
  # join on the "table.column" key; emit  key|targetType|targetNN|liveType|liveNN
  join -t'|' -j1 -o '0,1.2,1.3,2.2,2.3' "$tgt" "$live" 2>/dev/null | awk -F'|' '
    $2 != $4 { print "BLOCK type-change  " $1 ": live=[" $4 "] code=[" $2 "]"; n++ }
    $2 == $4 && $3 == "t" && $5 == "f" {
      print "BLOCK new-not-null " $1 ": code requires NOT NULL, live column is nullable"; n++ }
    END { exit (n > 0 ? 1 : 0) }
  '
}

# --- self-test: feed synthetic dumps, assert the classifier's verdicts --------
selftest() {
  local d; d="$(mktemp -d)"; trap 'rm -rf "$d"' RETURN
  # LIVE (prod) baseline
  printf '%s\n' \
    'users.id|integer|t' \
    'users.email|text|t' \
    'users.age|text|f' \
    'posts.title|text|f' \
    'posts.slug|text|f' > "$d/live"
  # TARGET (code): age retyped text→integer (BLOCK), slug now NOT NULL (BLOCK),
  #                new column posts.views (additive → must NOT block),
  #                users.email unchanged (must NOT block)
  printf '%s\n' \
    'users.id|integer|t' \
    'users.email|text|t' \
    'users.age|integer|f' \
    'posts.title|text|f' \
    'posts.slug|text|t' \
    'posts.views|integer|f' > "$d/tgt"
  sort -o "$d/live" "$d/live"; sort -o "$d/tgt" "$d/tgt"

  local out; out="$(classify "$d/tgt" "$d/live")"
  echo "$out" | grep -q 'type-change  users.age'   || { echo "selftest FAIL: missed type change"; return 1; }
  echo "$out" | grep -q 'new-not-null posts.slug'  || { echo "selftest FAIL: missed new NOT NULL"; return 1; }
  echo "$out" | grep -q 'posts.views'              && { echo "selftest FAIL: blocked additive column"; return 1; }
  echo "$out" | grep -q 'users.email'              && { echo "selftest FAIL: flagged unchanged column"; return 1; }
  [ "$(echo "$out" | grep -c '^BLOCK')" = "2" ]    || { echo "selftest FAIL: wrong blocking count"; return 1; }

  # No-drift case: identical dumps → zero blocking, classify returns 0
  classify "$d/live" "$d/live" >/dev/null && : || { echo "selftest FAIL: false positive on identical"; return 1; }
  echo "check-schema-drift selftest: OK"
}

if [ "${1:-}" = "--selftest" ]; then
  selftest; exit $?
fi

# --- live run ----------------------------------------------------------------
TARGET="${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
LIVE="${LIVE_DATABASE_URL:?set LIVE_DATABASE_URL}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

echo "=== Schema-drift preflight (non-additive, read-only) ==="
echo "TARGET (code): ${TARGET%%@*}@…   LIVE (prod): ${LIVE%%@*}@…"
echo

psql "$TARGET" -tA -c "$COLUMN_QUERY" | sort > "$WORK/tgt"
psql "$LIVE"   -tA -c "$COLUMN_QUERY" | sort > "$WORK/live"

# INFO: additive-only pending (in code, absent in prod) — the auto-sync handles
# these, so report but do not block.
cut -d'|' -f1 "$WORK/tgt"  | sort -u > "$WORK/tgt_keys"
cut -d'|' -f1 "$WORK/live" | sort -u > "$WORK/live_keys"
additive="$(comm -23 "$WORK/tgt_keys" "$WORK/live_keys" | grep -c . || true)"
echo "INFO: $additive additive column(s) pending (auto-sync will add on deploy)."

findings="$(classify "$WORK/tgt" "$WORK/live")"
if [ -n "$findings" ]; then
  echo
  echo "$findings"
  echo
  echo "✖ Non-additive schema drift — the additive prod-schema-sync will NOT apply these."
  echo "  Deployed code would diverge from the live DB. Perform a hand-written, backed-up"
  echo "  migration on prod for each item BEFORE merging, or revert the schema change."
  exit 1
fi

echo "✓ No non-additive drift — safe for the additive sync to reconcile."
exit 0
