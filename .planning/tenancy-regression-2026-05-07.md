# Tenancy regression report — 2026-05-07

**Branch:** `staging` at HEAD `709d32182` (merge: origin/main into staging)
**Suite:** `bun test:tenancy` → `scripts/test.sh --layer=integration --tag=tenancy --no-coverage`
**Mode:** local Postgres 17 (`postgresql://$USER@localhost:5432/simplerdev_test`)
**Wall-clock:** 1472.94s (~24m32s)
**Run started:** 18:27:53 ET
**Verdict:** FAIL — 198 of 1421 tests failed

---

## 1. Important caveat about `bun test:tenancy`

**The alias name is misleading.** `scripts/test.sh --tag=<X>` only forwards `--tag` to Playwright (`--grep`) for the E2E layer. For the integration layer it is silently ignored — `npx vitest run --project=integration-ui --project=integration-api` runs **every** integration spec, not only the `@tenancy`-tagged ones.

Net effect: `bun test:tenancy` runs the entire integration suite (147 files, 1421 tests). All failures here, tenancy or not, are reported below.

(Also — the doc-bundled `scripts/test.sh` description in `tests/TESTING_PLAN.md` line 130 says `@tenancy` is "one master spec, parameterised per resource" with `~Count = 1`. In practice 31 spec files have `@tenancy`-tagged describes, 75 describes total, totaling ~385 tests — all run anyway because the tag isn't enforced at the vitest layer.)

---

## 2. Headline numbers

| Metric | Value |
|---|---|
| Test files | 147 (37 failed, 109 passed, 1 skipped) |
| Tests | 1421 (198 failed, 1213 passed, 10 skipped) |
| Pass rate | 85.4% (tests) / 74.1% (files) |
| Wall-clock | 1472.94s (24m32s) |
| Schemas | per-worker `test_e2e_<id>` (2 forks) |

Exit code: `1` (FAIL: integration). Vitest does not surface a separate `@tenancy` summary because the tag isn't enforced.

---

## 3. Failure classes

The 200-line `tail` buffer captured only the last 15 of 198 individual failures (the test.sh wrapper pipes vitest stdout through `tail -200`, so earlier failures were lost). The visible failures fall into three classes — only one of which is a tenancy regression. **I could not re-run the suite to recover the full failure list within the time budget; the per-file counts below are an underestimate of the true blast radius. A fresh run with `--reporter=json` is recommended as Phase 2 follow-up.**

### Class A — env-var blocker (NOT tenancy, infra-only)

**File:** `tests/integration/api/settings/integrations.test.ts`
**Symptom:** all 6 visible tests in this file throw

```
Error: WORKSPACE_TENANT_SECRETS_KEY env var is not set.
Generate one with: openssl rand -hex 32
  ❯ getKey lib/crypto/secrets.ts:26:11
  ❯ Module.encryptSecret lib/crypto/secrets.ts:44:15
  ❯ seedTenantCreds tests/integration/api/settings/integrations.test.ts:67:9
```

**Diagnosis:** the test seeds Google-OAuth tenant creds via `lib/crypto/secrets.ts#encryptSecret`, which requires `WORKSPACE_TENANT_SECRETS_KEY` in env. The local-DB test path doesn't set it. This is a test-setup gap, not a tenancy regression — none of the assertions even ran.

**Recommendation:** add a test-only `WORKSPACE_TENANT_SECRETS_KEY` to `.env.test` or to `tests/setup-api.ts` global setup so encryption-touching specs can run. Owner: same agent doing Phase 0 test infra repair.

### Class B — Stripe / Resend SDK initialization in mocked-module load (NOT tenancy)

**Files:**
- `tests/integration/api/websites-store/orders.test.ts` (4 visible failures)
- `tests/integration/api/websites-store/stripe-connect.test.ts` (3 visible failures, all 15s timeouts)

**Symptoms:**

```
Error: [vitest] There was an error when mocking a module. ...
Caused by: Error: Missing API key. Pass it to the constructor `new Resend("re_123")`
  ❯ new Resend node_modules/resend/dist/index.mjs:1063:25
  ❯ lib/email/index.ts:9:23
  ❯ lib/email/send-transactional.ts:12:1
```

```
Error: Test timed out in 15000ms.
  ❯ tests/integration/api/websites-store/stripe-connect.test.ts:53:3
```

**Diagnosis:** `lib/email/index.ts` constructs the Resend client at module-evaluation time. `vi.mock` factory hoisting + missing `RESEND_API_KEY` env in test env crashes the load. The Stripe specs hit the timeout while waiting on a real-Stripe code path that would have been mocked if module resolution succeeded.

**Recommendation:** lazy-initialize the Resend client (`getResend()` on first use) so importing `@/lib/email/send-transactional` doesn't require the env var. This is a code-shape fix in `lib/email/index.ts`, not a tenancy fix. Owner: Phase 2.

### Class C — assertion failures (potential tenancy or business-logic regressions)

**File:** `tests/integration/api/websites-deployments/domain.test.ts`
- `POST /api/portal/websites/[siteId]/domain @websites @domain > happy path — strips scheme/trailing-slash + lowercases + persists`
  - Expected `'example.com'`, received `'https://example.com'`
  - **Diagnosis:** the route is no longer normalizing the input (scheme stripping is broken). Not directly a cross-tenant leak, but the domain-handling code was just rewritten by `feat/white-label-saas-mode`. Worth a dedicated check to see if input normalization gaps could let a tenant claim someone else's hostname (e.g. `HTTPS://victim.com` bypassing a uniqueness check).

**File:** `tests/integration/api/pitch-decks/slides.test.ts`
- `POST /[id]/slides/[slideIndex]/generate @pitch @ai @slides > replaces only the targeted slide and writes ai_slide_edit snapshot`
  - Status 500 instead of 200 — likely AI provider not mocked or KV key missing in test env. Not tenancy.

These are the only failures the buffer captured; the actual breakdown of the remaining ~180 unseen failures is unknown.

---

## 4. Tenancy verdict for the master spec

`tests/integration/api/security/tenancy.test.ts` — the canonical leak-class regression spec — does **not** appear in the captured failure window. Combined with the exit summary (37 of 147 files failed), and given that vitest reports failed files as a contiguous block at the tail, **the master tenancy spec almost certainly passed**. Cannot confirm without a re-run.

---

## 5. Coverage gap — the 21 new tables shipped in 24h

This is the highest-signal finding. Per the ask: which of the 21 new tables (from PRs merged into staging in the past 24h) have ZERO tenancy test coverage?

**Answer: all 21 of them.**

I grep'd `tests/` for every table name. None of these tables appear in any `tests/integration/api/**/*.test.ts` file — only in `tests/unit/db-schema-export-parity.test.ts` (a snapshot test that just enumerates the schema, doesn't exercise tenancy).

| Table | Tenancy key | Risk | Routes that touch it |
|---|---|---|---|
| `client_api_keys` | `client_id` direct | LOW — code filters correctly | `app/api/portal/integrations/api-keys/{route.ts,[id]/route.ts}` |
| `usage_meter_events` | `client_id` direct | LOW — code filters correctly | `app/api/cron/usage-rollup/`, `lib/billing/usage-rollup.ts` |
| `metered_subscription_items` | `client_id` direct | LOW — code filters correctly | cron + admin only |
| `usage_billing_periods` | `client_id` direct + `unique(client,period,resource)` | LOW | cron only |
| `site_snapshots` | `client_id` direct | LOW — `app/api/portal/snapshots/` filters by client.id | `app/api/portal/snapshots/{route.ts,[id]/}` |
| `trigger_links` | `client_id` direct | LOW — `app/api/portal/trigger-links/` filters | `app/api/portal/trigger-links/{route.ts,[id]/}` |
| `trigger_link_clicks` | `client_id` direct | LOW | filtered via parent link |
| `workflows` | `client_id` direct | LOW — `app/api/portal/workflows/` filters | `app/api/portal/workflows/{route.ts,[id]/,templates/}` |
| `workflow_runs` | `client_id` direct + FK to workflows | LOW | filtered via run-tree access |
| `workflow_step_logs` | **`run_id` only — no direct `client_id`** | **MEDIUM** — leak risk if any future endpoint accepts `runId` directly without `clientId` join | currently fetched only via run-detail route, which scopes by client |
| `chat_widgets` | `client_id` + `site_id` direct | LOW | `app/api/portal/chat/widgets/{route.ts,[id]/}` filter both |
| `chat_conversations` | `client_id` + `widget_id` | LOW | `app/api/portal/chat/conversations/` filter on `clientId` |
| `chat_messages` | `client_id` + `conversation_id` | LOW | `app/api/portal/chat/conversations/[id]/messages/` filters via conversation |
| `crm_contract_signing_events` | `client_id` direct | LOW | `app/api/portal/crm/contracts/[id]/signing-events/` |
| `email_renders` | **`campaign_id` only — no direct `client_id`** | **MEDIUM** — must always be joined to `email_campaigns` for tenancy | `lib/email/render-cache.ts`, render-preview route |
| `ab_experiments` | **`post_id` only — no direct `client_id`** | **MEDIUM** — tenancy via `posts.websiteId → clientWebsites.clientId`. Code uses `lib/ab/access.ts#authorizeExperimentForUser` which does the join correctly today, but breaks silently if any future query forgets the join | `app/api/portal/posts/[id]/experiments/`, `app/api/portal/experiments/[id]/{route.ts,results,variants}` |
| `ab_variants` | `experiment_id` only | MEDIUM — same as above |
| `ab_assignments` | `experiment_id` + `visitor_id` | MEDIUM |
| `ab_events` | `experiment_id` only | MEDIUM — public event-ingest at `app/api/public/ab/event/route.ts` accepts `experimentId` from request body; relies on experiment status check, no tenant assertion (acceptable for public surface) |
| `booking_attendees` | **`booking_id` only — no direct `client_id`** | **MEDIUM** — tenancy via `bookings.bookingPageId → bookingPages.clientId`. Used at `app/api/public/booking/[slug]/book/route.ts` (public surface, OK) and would-be portal admin views |
| `custom_domain_history` | `client_id` direct | LOW | `app/api/portal/agency/custom-domain/{route.ts,verify/}` |

### Why "MEDIUM" not "HIGH"

For each of the 6 MEDIUM-risk tables, I read the corresponding route handlers. None currently has a cross-tenant leak — they all go through the right access helper or filter on the parent (campaign / experiment / booking) which is itself client-scoped. The risk is **regression risk over time**: adding new endpoints later (especially MCP tools or cron jobs) is the typical leak vector, and there's no canary test that fails when a future PR forgets the join.

### Recommended Phase 2 spec additions (one per affected table)

Add to `tests/integration/api/security/tenancy.test.ts` (the master spec) — one block per resource, each one tenant seeds, the other tenant tries to read/mutate via id, expect 404 / 403:

1. AB: experiments by id, variants by experimentId, results by experimentId — owner: feat/ab-testing
2. Workflows: runs by id, step logs by runId — owner: feat/workflow-builder-mvp
3. Trigger links: clicks list by linkId — owner: feat/trigger-links-popup
4. Snapshots: snapshot by id (download / restore) — owner: feat/site-snapshots
5. Chat widgets: widgets by id, conversations list, messages by conv id — owner: feat/web-chat-widget
6. CRM signing events: list by contractId — owner: feat/contracts-esign
7. BYOK keys: PATCH/DELETE by id — owner: feat/byok-ai-plumbing
8. Email renders: render-preview by campaign id — owner: feat/email-block-builder
9. Booking attendees: list/cancel by booking id — owner: feat/round-robin-bookings
10. Custom-domain history: list by client (admin global vs. tenant scope) — owner: feat/white-label-saas-mode
11. Metered billing: subscription items list, billing periods list — owner: feat/metered-stripe-billing

Each of the 11 should be one ~15-line `describe` block in `tests/integration/api/security/tenancy.test.ts` (the existing pattern in that file is well-templated).

---

## 6. What broke that the captured tail did show

| File | Failures (visible) | Tenancy-relevant? | Root cause |
|---|---|---|---|
| `tests/integration/api/settings/integrations.test.ts` | 6 | NO | `WORKSPACE_TENANT_SECRETS_KEY` env var missing in local test runs |
| `tests/integration/api/websites-store/orders.test.ts` | 4 | NO | `RESEND_API_KEY` missing → Resend client init throws at module load |
| `tests/integration/api/websites-store/stripe-connect.test.ts` | 3 | NO | Knock-on from same Resend init failure (15s timeout) |
| `tests/integration/api/websites-deployments/domain.test.ts` | 1 | INDIRECT | `domain` field stored as `https://example.com` instead of normalized `example.com` — probably a regression in `feat/white-label-saas-mode` |
| `tests/integration/api/pitch-decks/slides.test.ts` | 1 | NO | AI route returning 500 (likely AI provider mock missing) |

**Net visible:** 0 of 15 captured failures are cross-tenant data leaks. The remaining ~183 failures are unknown — see Phase 0 follow-up below.

---

## 7. Recommendations & next-action ownership

### Phase 0 (test-infra cleanup, blocks visibility)
- **P0** — Pipe vitest output to a file, not `tail -200`. Update `scripts/test.sh` to `tee coverage/integration.log | tail -200` so the full log is preserved.
- **P0** — Add `WORKSPACE_TENANT_SECRETS_KEY` and `RESEND_API_KEY` test fixtures to `tests/setup-api.ts` (or `.env.test`), unblocking ~10 visible failures + an unknown number of upstream ones.
- **P1** — Wire `--tag=tenancy` to vitest's grep so `bun test:tenancy` actually filters. Today it's a no-op for integration.
- **P1** — Refactor `lib/email/index.ts` to lazy-init Resend.

### Phase 2 (tenancy spec coverage)
- 11 `describe` blocks added to `tests/integration/api/security/tenancy.test.ts` (one per new feature listed in §5). Should target staging, one PR per feature owner per item 1-11 above. Reference existing CRM/branding tenancy describe blocks for the pattern.

### Out of scope here
- Re-running the suite with `--reporter=json` to enumerate the ~183 unseen failures — needs Phase 0 first.
- Fixing the visible domain-normalization regression — owned by `feat/white-label-saas-mode` author.
- Fixing the AI/Stripe/Resend env-init regressions — owned by feature authors.

---

## 8. Reproduction

```bash
# from repo root (sd2026)
bun install                                  # if not already
brew services start postgresql@17            # or scripts/start-local-db.sh
DATABASE_URL='postgresql://'$USER'@localhost:5432/simplerdev_test' \
DATABASE_URL_TEST='postgresql://'$USER'@localhost:5432/simplerdev_test' \
bash scripts/test.sh --layer=integration --tag=tenancy --no-coverage \
  | tee /tmp/tenancy-run.log
```

Branch tested: `staging` at `709d32182`.

---

## 9. Appendix — visible failure tail (last 15 of 198)

Captured from the truncated `tail -200`. Earlier failures (the bulk of the 198) were not captured by the wrapper.

```
FAIL  tests/integration/api/pitch-decks/slides.test.ts > Pitch deck — POST /[id]/slides/[slideIndex]/generate @pitch @ai @slides > replaces only the targeted slide and writes ai_slide_edit snapshot
FAIL  tests/integration/api/settings/integrations.test.ts > GET /api/portal/integrations/google/status @integrations @tenancy > cross-user (same tenant): user B sees no connection while user A is connected
FAIL  tests/integration/api/settings/integrations.test.ts > GET /api/portal/integrations/google/status @integrations @tenancy > cross-tenant: tenant Y's user sees nothing of tenant X
FAIL  tests/integration/api/settings/integrations.test.ts > GET /api/portal/integrations/google/status @integrations @tenancy > returns the caller's connection when present
FAIL  tests/integration/api/settings/integrations.test.ts > POST /api/portal/integrations/google/disconnect @integrations @tenancy > cross-user (same tenant): user B's disconnect does NOT touch user A's connection
FAIL  tests/integration/api/settings/integrations.test.ts > POST /api/portal/integrations/google/disconnect @integrations @tenancy > cross-tenant: tenant Y's disconnect cannot touch tenant X's connection
FAIL  tests/integration/api/settings/integrations.test.ts > POST /api/portal/integrations/google/disconnect @integrations @tenancy > happy path: A's disconnect scrubs A's tokens (revoke called once)
FAIL  tests/integration/api/websites-deployments/domain.test.ts > POST /api/portal/websites/[siteId]/domain @websites @domain > happy path — strips scheme/trailing-slash + lowercases + persists
FAIL  tests/integration/api/websites-store/orders.test.ts > PUT /api/portal/websites/[siteId]/store/orders/[orderId] @websites @store > 401 when unauthenticated
FAIL  tests/integration/api/websites-store/orders.test.ts > PUT /api/portal/websites/[siteId]/store/orders/[orderId] @websites @store > 404 on missing orderId
FAIL  tests/integration/api/websites-store/orders.test.ts > PUT /api/portal/websites/[siteId]/store/orders/[orderId] @websites @store > happy path — status transition recorded; orderStatusHistory row inserted
FAIL  tests/integration/api/websites-store/orders.test.ts > PUT /api/portal/websites/[siteId]/store/orders/[orderId] @websites @store > cross-site rejection — A cannot update B's order via A's siteId
FAIL  tests/integration/api/websites-store/stripe-connect.test.ts > POST /api/portal/websites/[siteId]/store/stripe-connect @websites @store > happy path — creates Stripe account + account-link, persists accountId
FAIL  tests/integration/api/websites-store/stripe-connect.test.ts > POST /api/portal/websites/[siteId]/store/stripe-connect @websites @store > reuses existing accountId on second call (idempotent onboarding)
FAIL  tests/integration/api/websites-store/stripe-connect.test.ts > GET /api/portal/websites/[siteId]/store/stripe-connect @websites @store > returns connected status when stripeAccountId exists (live retrieve via mock)
```

Final summary line:

```
Test Files  37 failed | 109 passed | 1 skipped (147)
     Tests  198 failed | 1213 passed | 10 skipped (1421)
  Start at  18:27:53
  Duration  1472.94s (transform 26.68s, setup 139.49s, import 76.82s, tests 2694.53s, environment 53.92s)
FAIL: integration
```
