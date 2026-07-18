#!/usr/bin/env bash
# diff-coverage.sh — Changed-line coverage gate (CURRENTLY DISABLED).
#
# Goal: fail CI when CHANGED lines are below a coverage threshold.
# This approach is cheap, undodgeable, and never penalizes untouched legacy
# code — it only measures coverage on lines that were actually modified in
# this PR/commit, making it far more meaningful than a repo-wide floor.
#
# WHY THIS IS DISABLED:
#   Integration coverage emission is broken under vitest 4.0.18: when any
#   test fails during an integration run, vitest does not flush lcov output,
#   producing an empty or partial report. Enabling this gate under those
#   conditions would produce false negatives (blocking good changes because
#   the coverage file is absent/incomplete). See tests/CLAUDE.md for the
#   current coverage state and the memory key `project_sd2026_coverage_state`.
#   Re-enable once the vitest bug is resolved or we migrate off the broken
#   version.
#
# INTENDED FUTURE IMPLEMENTATION (steps to wire this up):
#   1. Emit lcov:
#        bun run test:coverage
#      This runs scripts/test.sh (all layers, coverage on) and produces:
#        coverage/vitest/unit/lcov.info
#        coverage/vitest/integration/lcov.info
#        coverage/server/lcov.info   (V8 → lcov via c8)
#      Merge them into a single lcov.info with lcov --add-tracefile or genhtml.
#
#   2. Diff HEAD against merge-base to get changed lines:
#        BASE=$(git merge-base HEAD origin/main)
#        git diff "$BASE"...HEAD --unified=0 > /tmp/pr.diff
#      (Replace `origin/main` with the actual base branch if different.)
#
#   3. Map changed lines against lcov and compute changed-line coverage:
#      Option A — diff-cover (Python):
#        pip install diff-cover
#        diff-cover coverage/merged.info --compare-branch=origin/main \
#          --fail-under=70
#      Option B — custom awk/python script that reads the diff + lcov and
#        counts DA (line) records for changed lines only.
#
#   4. Exit non-zero if changed-line coverage is under threshold.
#      Recommended starting threshold: 70% (matches the floor on lib/billing,
#      lib/ai, lib/agency, lib/esign, lib/chat per tests/CI-GATES.md).
#      Ratchet upward as coverage improves.
#
#   5. Wire into CI (e.g. GitHub Actions) as a required status check, running
#      AFTER the test suite step so the lcov files are already present.
#
# Once all of the above is in place, remove the `exit 0` at the bottom and
# uncomment (or add) the implementation.

set -uo pipefail

echo "diff-coverage: not yet enabled."
echo "Reason: vitest 4.0.18 integration coverage emission is broken — enabling"
echo "this gate now would produce false negatives (empty/partial lcov when any"
echo "integration test fails). See tests/CLAUDE.md and memory key"
echo "'project_sd2026_coverage_state' for current status."
echo ""
echo "This script is a no-op placeholder. It exits 0 so CI is not blocked."
echo "Re-enable once the vitest blocker is resolved."

exit 0
