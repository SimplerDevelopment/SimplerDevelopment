#!/usr/bin/env bash
# Reusable Fallow code-quality gate — single source of truth.
#
#   Usage: scripts/fallow-gate.sh [BASE]
#     BASE  commit-ish to attribute net-new findings against (default: HEAD).
#           Callers pass the deployed remote sha (pre-push) or HEAD (per-commit).
#
#   Exit codes (callers translate to their own block signal):
#     0  pass  — verdict ok, OR fail-open (tooling missing / runtime error).
#     1  block — fallow returned verdict "fail" (NET-NEW issues vs BASE).
#
# Only findings *introduced* by the changeset affect the verdict (audit's
# default --gate new-only); pre-existing debt is grandfathered by the saved
# snapshots in fallow-baselines/. The gate fails OPEN on any tooling problem so
# a broken/missing binary never wedges a commit or push — skips stay visible on
# stderr.
#
# Runner preference: PATH `fallow`, then `bunx fallow` (this repo is Bun-only;
# `npx` mis-resolves the platform binary on darwin). Requires jq.
#
# Version floor (FALLOW_GATE_MIN_VERSION, default 2.46.0): older binaries miss
# the uncommitted-changes inclusion fix and can silently pass audits that should
# fail. Set the env var to empty to disable the check.
set -uo pipefail

BASE="${1:-HEAD}"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$PWD}")"

if ! command -v jq >/dev/null 2>&1; then
  echo "fallow-gate: jq not on PATH — skipping audit (fail-open)." >&2
  exit 0
fi

# --- resolve a runner -------------------------------------------------------
if command -v fallow >/dev/null 2>&1; then
  RUNNER=(fallow)
  BIN_DESC="$(command -v fallow)"
elif command -v bunx >/dev/null 2>&1 && VER_PROBE="$(bunx fallow --version 2>/dev/null || true)" && [[ "$VER_PROBE" == fallow* ]]; then
  RUNNER=(bunx fallow)
  BIN_DESC="bunx fallow"
elif command -v npx >/dev/null 2>&1 && VER_PROBE="$(npx --no-install fallow --version 2>/dev/null || true)" && [[ "$VER_PROBE" == fallow* ]]; then
  RUNNER=(npx --no-install fallow)
  BIN_DESC="npx --no-install fallow"
else
  echo "fallow-gate: fallow binary not found (tried PATH, bunx, npx) — skipping (fail-open)." >&2
  exit 0
fi

# --- version floor ----------------------------------------------------------
VERSION_RAW="$("${RUNNER[@]}" --version 2>/dev/null || true)"
VERSION="${VERSION_RAW#fallow }"
VERSION="${VERSION%% *}"

MIN_VERSION="${FALLOW_GATE_MIN_VERSION-2.46.0}"
if [ -n "$MIN_VERSION" ] && [ -n "$VERSION" ]; then
  LOWER="$(printf '%s\n%s\n' "$MIN_VERSION" "$VERSION" | sort -V | head -n1)"
  if [ "$LOWER" != "$MIN_VERSION" ]; then
    {
      echo "fallow-gate: BLOCKED — $BIN_DESC is fallow $VERSION, below required $MIN_VERSION."
      echo "fallow-gate: older binaries miss the uncommitted-changes fix (v2.46.0) and can"
      echo "fallow-gate: silently pass audits that would otherwise fail. Upgrade fallow, or"
      echo "fallow-gate: set FALLOW_GATE_MIN_VERSION= to disable this check."
    } >&2
    exit 1
  fi
fi

# --- run the audit ----------------------------------------------------------
TMP_JSON="$(mktemp)"
TMP_ERR="$(mktemp)"
trap 'rm -f "$TMP_JSON" "$TMP_ERR"' EXIT

AUDIT_ARGS=(audit --base "$BASE" --format json --quiet --explain)
for pair in "dead-code-baseline:dead-code.json" "health-baseline:health.json" "dupes-baseline:dupes.json"; do
  bl_file="$ROOT/fallow-baselines/${pair##*:}"
  [ -f "$bl_file" ] && AUDIT_ARGS+=("--${pair%%:*}" "$bl_file")
done

if "${RUNNER[@]}" "${AUDIT_ARGS[@]}" >"$TMP_JSON" 2>"$TMP_ERR"; then
  STATUS=0
else
  STATUS=$?
fi

VERDICT="$(jq -r '.verdict // empty' <"$TMP_JSON" 2>/dev/null || true)"
IS_ERROR="$(jq -r '.error // false' <"$TMP_JSON" 2>/dev/null || echo false)"

if [ "$VERDICT" = "fail" ]; then
  echo "fallow-gate: BLOCKED — net-new code-quality issues (base ${BASE}, via ${BIN_DESC}):" >&2
  jq -r '.message // .summary // empty' <"$TMP_JSON" 2>/dev/null >&2 || true
  jq -e '.findings // empty' <"$TMP_JSON" >/dev/null 2>&1 \
    && jq -r '.findings[] | select(.introduced == true) | "  • [\(.kind // .category // "issue")] \(.message // .title // .description // "")"' <"$TMP_JSON" 2>/dev/null >&2 || true
  exit 1
fi

# Tooling errors fail open (visible), never block.
if [ "$STATUS" -eq 2 ] || [ "$IS_ERROR" = "true" ]; then
  MSG="$(jq -r '.message // empty' <"$TMP_JSON" 2>/dev/null || true)"
  echo "fallow-gate: audit runtime error${MSG:+ ($MSG)} — skipping (fail-open)." >&2
  exit 0
fi
if [ "$STATUS" -ne 0 ]; then
  ERR_LINE="$(sed -n '1p' "$TMP_ERR" 2>/dev/null || true)"
  echo "fallow-gate: audit exited ${STATUS}${ERR_LINE:+ ($ERR_LINE)} — skipping (fail-open)." >&2
  exit 0
fi

echo "fallow-gate: pass — no net-new code-quality issues (base ${BASE})." >&2
exit 0
