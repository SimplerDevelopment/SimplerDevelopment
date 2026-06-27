---
status: planned
created: 2026-06-27
owner: dan
tags: [release, testing, harness, e2e, tenancy]
---

# Release Stabilization — Get dev (= prod) Green

**Context:** `dev` is the de-facto production line (the live site deploys from it). The 21/21-roast feature work is already live there. A production-readiness QA pass ran both gates and came back red — but investigation shows the red is **substantially a test-harness/environment artifact, not product regressions.** This note scopes the work to get the gates trustworthy and green.

## TL;DR finding

The QA gates failed for **two harness root causes** plus **a few genuinely stale tests** — not 32 product bugs.

| Symptom | Count | Root cause | Class |
|---|---|---|---|
| Critical-e2e hard failures (surveys, dashboard-smoke, bookings, env-var, invoices, singletons) | 32 | **e2e ran against the remote Railway proxy DB** (`bun test:critical` starts `npm run dev` with no local-DB override → reads `.env.local` = acela). High latency → 60s fixture-seed timeouts + cascade 404s. | Harness |
| Tenancy/integration "failures" | 171 | **Per-worker `CREATE DATABASE` collision race** in `tests/helpers/test-bootstrap.ts`: `WORKER_ID = VITEST_POOL_ID ?? VITEST_WORKER_ID ?? '0'`; reused pool ids → two workers race the same `test_e2e_<wt>_w<id>` name → `pg_database_datname` duplicate-key. | Harness |
| `gap-approve-token-tenancy-coverage` ×3 (flagged "security") | 3 | **NOT a leak.** Cross-tenant token correctly returns the styled 404 page ("Page Not Found"); test asserts old copy "Not found". Security behavior is correct. | Stale test |
| cov-u41 (AB cross-tenant), cov-u61 (prod-gate), misc singletons | few | TBD after a valid run — likely test-data/seed or stale assertions. | TBD |

**Evidence:** failure modes are timeouts (`beforeAll hook timeout 60000ms`, `waiting for getByTitle('Edit')`) and `expect 200 / received 404` — the fingerprint of a slow remote DB starving fixture seeding, not assertion-level product mismatches. Typecheck is at baseline (306 pre-existing errors, all in the unrelated `simplerdevelopment-agents/` sub-project; **0 new** from the roast work).

## Plan (waves)

### Wave 0 — Harness fixes (highest leverage; do first)
1. **Add `test:e2e:local` + `test:critical:local`** package.json scripts mirroring `test:integration:local`: boot `scripts/start-local-db.sh`, apply schema to `simplerdev_test` (drizzle-kit push or migration replay), seed `db:seed:admin-e2e`, set `DATABASE_URL=postgresql://$USER@localhost:5432/simplerdev_test`, then run the e2e layer. Document in `tests/CLAUDE.md` as the real QA gate.
2. **Fix the per-worker DB collision race** in `tests/helpers/test-bootstrap.ts`: make `PER_WORKER_DB` collision-proof (append `process.pid` and/or a random suffix, or guard `applyTestSchema()`'s DROP+CREATE so a reused pool id can't race). Verify with a high-`--workers` integration run.

### Wave 1 — Re-run gates against the fixed harness
Run `bun test:critical:local` + `bun test:tenancy` (local) to get the **true** red list. Expectation: the large majority of the 203 failures clear.

### Wave 2 — Triage the genuine residual
For each failure that survives a valid run, classify: regression / stale-test / test-data / real-bug. Known so far:
- **Stale test:** update `gap-approve-token-tenancy-coverage` to assert the new 404 behavior (the route correctly refuses — keep that, fix the assertion).
- Re-check cov-u41 / cov-u61 / bookings / env-var (the env-var 404s may be fixture/provisioning, or my intentional `requireService('websites')` gate needing the test to seed the entitlement).

### Wave 3 — Lock it in
Declare `bun test:critical:local` the QA gate of record; optionally wire a CI job that runs both gates against a service-container Postgres so the suite can't silently rot again.

## Out of scope
- The dev→main merge (602 commits / 3,349 files): moot — dev is prod.
- The drizzle baseline rebaseline: separate; the manual `9004` migration already activates the roast deltas and applies cleanly out-of-band.

## Wave 0 + 1 results (2026-06-27) — DONE

- **Race fix** (`tests/helpers/test-bootstrap.ts`, `_p${pid}`): tenancy gate **171 → 19 failed** (396 passed), zero duplicate-key errors.
- **Local-e2e variants** (`test:critical:local` + `scripts/prepare-e2e-local.sh`): critical e2e **540/32 (remote) → 617 passed / 19 failed / 4 flaky** locally (22.5 min, no 60s timeouts). Confirms the e2e red was overwhelmingly the remote-DB latency artifact.
- **No roast-work regressions**: every failure in a roast-touched domain (bookings ×3, AB cov-u41) is `Expected 200 / Received 404` — a missing-fixture/seed-gap downstream, not a 500/constraint error.

## True residual (Wave 2) — 19 e2e + 18 tenancy, characterized

**Dominant root cause = seed/test-data completeness, not product bugs:**
- **Entitlements not granted to test tenants** → 403 then downstream failures. `tests/helpers/session.ts` `sessionForNewClientUser` seeds no `client_services`. Hits the ~40 routes the prior entitlement-hardening effort gated (CRM ×16 tenancy; likely invoices/ecommerce/agency e2e). One central fix (grant standard services in the helper, or per-spec) clears many.
- **Missing pre-seeded fixtures** → 404. e2e specs assume seeded constants (`SEED_SLUG`/`SEED_PAGE_ID` booking page, etc.) that `seed-admin-e2e.ts` doesn't fully create. Bookings ×3, AB cov-u41 are this.
- **Integration template missing `brain_embeddings`** (2 tenancy) → trigger references a table the migration-replay template lacks (the push-synced local e2e DB has it; the replay template doesn't).
- **Resolved this session:** OAuth scrub test (now asserts via `decryptMaybe`).

**Genuine maybe-product items to verify (small):** surveys-detail editing ×5 (`element not found` on Edit affordance — UI regression vs stale selector?), cov-u61 agentic-OS prod-gate, admin-agentic-os run-drawer. These need a look, not assumed seed-gaps.

## Done when
`bun test:critical:local` and `bun test:tenancy` both pass (or every residual failure is a documented, accepted skip with a tracking note) against a local Postgres.
