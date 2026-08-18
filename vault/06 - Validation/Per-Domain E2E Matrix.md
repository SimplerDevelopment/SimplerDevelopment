---
type: playbook
domain: validation
status: active
date: 2026-07-13
sources:
  - .github/workflows/e2e-domains.yml
  - .github/workflows/ci.yml
  - scripts/test.sh
  - tests/e2e/setup/fixtures.ts
---

# Per-Domain E2E Matrix

A nightly GitHub Actions **matrix job — one parallel leg per feature domain** —
that runs each domain's Playwright e2e specs by tag. Complements the fast
`@critical` and `@security` gates on every PR: those keep merges quick; the
matrix gives broad per-domain regression coverage without multiplying PR CI cost.

## Where it lives

- Workflow: `.github/workflows/e2e-domains.yml` (23 legs).
- Triggers: **`schedule` (07:00 UTC nightly) + `workflow_dispatch`** — NOT
  `pull_request` (23 full builds per PR would multiply runner minutes). Promote
  to a pre-merge gate by adding `pull_request:` to `on:` and marking the
  `E2E <domain>` checks required.
- Each leg is a byte-for-byte parameterization of the proven `e2e-critical`
  recipe (pgvector service → `drizzle-kit push` → `seed-admin-e2e.ts` → build →
  `next start` → `scripts/test.sh --layer=e2e --tag=@<domain>`), `fail-fast:
  false` so one red leg never aborts the others.

## Domain → tag mapping

Reuses the `@<domain>` tags already present in the specs; synonyms are OR'd in a
single `--grep` regex (Playwright `--tag` → `--grep`): `@store|@ecommerce`,
`@chat|@realtime|@voice`, `@bookings?`, `@pm|@projects|@kanban`. Every leg maps
to real tests — verify no empty legs before adding one.

## Capability env (the load-bearing gotcha)

Many "failures" are just infra the prod-build/no-external-service matrix can't
provide. Two ways to handle them:

- **Set scoped ephemeral env in the workflow** when it only affects its own
  routes: `SEED_DB_URL` (plugins psql seeders), `PLUGINS_CALLBACK_ORIGIN_BYPASS`,
  `REALTIME_JWT_SECRET` (realtime routes 503 without it). **Do NOT set a global
  dummy Stripe key** — it breaks the passing no-key-path billing tests.
- **Add a capability skip-guard** when the service genuinely isn't available:
  S3 upload-html, Stripe webhook-signature + checkout (JUL9-014), the brain-agent
  SSE tests (self-skip on the graceful 402), `/api/test/email-events` (404'd in
  prod builds — probe POST, not the ungated GET). Skip guards keep the tests
  runnable locally where the capability exists.

## What it caught (2026-07-13 green-up: 7 → 23/23)

The matrix's first runs surfaced **10 real production bugs** behind never-gated
specs — evidence the breadth pays for itself. See `vault/04 - Decisions/ADR
per-domain-e2e-matrix.md` for the full list; headline ones:

- **Storefront rate-limit was a no-op** — `if (!checkRateLimit(...))` missing
  `await` negated a Promise (always truthy), so login/forgot/reset-password had
  no working 429 (brute-force/enumeration gap).
- **CMS custom-field cascade-delete** — deleting a repeater orphaned its
  sub-fields (`parentId` has no DB FK; the DELETE route didn't cascade).
- CRM "Send Proposal" 400'd for ~2 months; brain playbooks stalled after step 1;
  sign-out no-op'd under the e2e cookie config; several validation-order 500s.

Rule of thumb when a leg is red: **triage before "fixing the test"** — split
real-bug vs stale-test vs capability-env (fan out one investigator per domain
group). ~½ of the surfaced failures were genuine bugs, not test debt.

## Related

- [[E2E Patterns]] · [[Gate Picking]] · [[CI-GATES|tests/CI-GATES.md]]
- `tests/CLAUDE.md` — layer responsibilities
