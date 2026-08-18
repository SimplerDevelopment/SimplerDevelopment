---
type: decision
domain: validation
status: accepted
date: 2026-07-13
sources:
  - .github/workflows/e2e-domains.yml
---

# ADR: Per-Domain E2E Matrix (nightly, not per-PR)

## Context

The repo had a fast `@critical` e2e gate on every PR, but no broad per-domain
regression coverage — hundreds of non-`@critical` specs were never run in CI, so
real bugs hid behind them. We wanted "critical paths for every feature domain,
running simultaneously in GitHub Actions."

## Decision

Add a **matrix job, one leg per domain** (`.github/workflows/e2e-domains.yml`),
each running that domain's specs by tag. Run it **nightly + on-demand**, not on
every PR.

### Why nightly, not per-PR
23 full-build e2e legs on every PR would multiply runner minutes and slow every
merge. Nightly gives the coverage; PRs keep the fast `@critical` + `@security`
gates. One line (`pull_request:` in `on:`) promotes it later.

### Why reuse existing `@<domain>` tags (not a new `@dom:` scheme)
~90% of specs already carried a domain tag; reuse + OR-combined synonyms avoided
re-tagging ~258 specs. Verified every leg maps to real tests (no empty legs).

### Capability failures: scoped env vs skip-guard (not global dummies)
- Scoped ephemeral env in the workflow when it only affects its own routes
  (`SEED_DB_URL`, `PLUGINS_CALLBACK_ORIGIN_BYPASS`, `REALTIME_JWT_SECRET`).
- Skip-guard when the service isn't available (S3, Stripe, AI).
- **Rejected: a global dummy `STRIPE_SECRET_KEY`** — it would break the passing
  no-key-path billing tests. Skip-guard the 4 signature tests instead.

## Consequences

Nightly runner cost (23 builds/night). Accepted for the coverage. The first
green-up (2026-07-13, 7 → 23/23 legs) surfaced **10 real production bugs** that
unit tests + the `@critical` gate had never caught:

1. Storefront login/forgot/reset rate-limit was a no-op (missing `await` on
   `checkRateLimit`) — brute-force/enumeration gap. **security**
2. CMS custom-field cascade-delete orphaned sub-fields (`parentId` has no FK,
   route didn't cascade). **data integrity**
3. CRM "Send Proposal" 400'd ~2 months (spurious required `recipientEmail`).
4. Brain playbooks stalled after step 1 (`advanceRun` only chained `branch`
   steps, never task/wait).
5. Brain agent returned a bare 500 on missing AI key (should be 402).
6. Email `PATCH /tags/[id]` never implemented (405).
7. Email campaign-send bare 500 when no transport (envelope violation).
8. Sign-out no-op'd under `NODE_ENV=production` + `AUTH_INSECURE_COOKIES=1`
   (cleared the wrong cookie name).
9. Notification writes were fire-and-forget → `revalidateTag` no-op'd → stale
   cache (Next 16 route-handler revalidateTag is eventual, not immediate).
10. credits/purchase + pitch-decks batch-edit gated input validation behind AI/
    Stripe config → 500 instead of 400/404.

**Process lesson:** triage a red leg before "fixing the test" — split real-bug /
stale-test / capability-env (fan out one investigator per domain group). About
half the surfaced failures were genuine bugs.

**Open follow-ups:** 4 other CRM notification emitters share the fire-and-forget
pattern (#9); `ProductDesigner` double-mounts `LeftPanel` (duplicate testid).
