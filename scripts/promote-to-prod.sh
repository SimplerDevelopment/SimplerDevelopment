#!/usr/bin/env bash
# promote-to-prod.sh — TRAILING gate for staging → production promotion.
#
# Context: in this repo "deploy" means a force-push to the staging branch.
# This script is the TRAILING gate meant to run AFTER that staging deploy.
# It gates promotion of staging to production by running the full golden-path
# and tenancy suites — suites that are deliberately kept OFF the pre-push hot
# path and ON the promotion path (recommendation #2: trailing gate pattern).
#
# Usage:
#   scripts/promote-to-prod.sh
#
# Exit codes:
#   0 — all gates passed; tree is eligible for promotion (manual step required)
#   1 — one or more gates failed; do NOT promote
set -uo pipefail

cd "$(dirname "$0")/.."

echo "============================================================"
echo "  promote-to-prod.sh — staging → production promotion gate"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================================"
echo ""

# ── Gate 1: Golden-path critical E2E ─────────────────────────────────────
echo "==> [Gate 1/2] Running critical E2E suite (bun run test:critical) ..."
echo ""
if ! bun run test:critical; then
  echo ""
  echo "============================================================"
  echo "  GATE FAILED: critical E2E suite did not pass."
  echo "  Staging is NOT being promoted to production."
  echo "  Fix the failures above, re-deploy to staging, then re-run"
  echo "  this script before promoting."
  echo "============================================================"
  exit 1
fi

echo ""
echo "  [Gate 1/2] PASSED — critical E2E suite green."
echo ""

# ── Gate 2: Tenancy regression suite ─────────────────────────────────────
echo "==> [Gate 2/2] Running tenancy regression suite (bun run test:tenancy) ..."
echo ""
if ! bun run test:tenancy; then
  echo ""
  echo "============================================================"
  echo "  GATE FAILED: tenancy regression suite did not pass."
  echo "  Staging is NOT being promoted to production."
  echo "  Fix the tenancy leak(s) above, re-deploy to staging, then"
  echo "  re-run this script before promoting."
  echo "============================================================"
  exit 1
fi

echo ""
echo "  [Gate 2/2] PASSED — tenancy suite green."
echo ""

# ── All gates passed ──────────────────────────────────────────────────────
echo "============================================================"
echo "  SUCCESS — all promotion gates passed."
echo "  Staging build is eligible for promotion to production."
echo ""
echo "  *** PROMOTION SECTION ***"
echo ""
echo "  NOTE: No production remote is wired in this repository yet."
echo "  This script is the gate — it verifies quality — but the"
echo "  actual promotion action (e.g. pushing the staging branch"
echo "  to a production branch or triggering a production deploy"
echo "  pipeline) is MANUAL until a production target is configured."
echo ""
echo "  When a production target exists, add the push/deploy command"
echo "  below this comment block and remove this notice."
echo ""
echo "  Suggested future step (not yet enabled):"
echo "    git push origin staging:production"
echo "  or trigger your CD pipeline here (Railway / Vercel / etc.)."
echo "============================================================"
exit 0
