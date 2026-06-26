---
type: validation
domain: validation
status: active
date: 2026-06-17
sources:
  - scripts/seed-admin-e2e.ts
  - scripts/verify-db-target.ts
  - scripts/reset-e2e-db.ts
  - scripts/convert-client-coverage.ts
  - lib/brain/entitlement.ts
  - lib/portal-auth.ts
  - lib/mcp/types.ts
  - app/approve/[token]/page.tsx
  - lib/preview-token.ts
---

# Platform E2E Audit — 2026-06-17

Branch `dev` (commit `4a5cd978`). Isolated Postgres: `simplerdev_e2e_audit`. Resend neutralized. Stripe test-mode. See [[Platform E2E + Competitive Audit]] for initiative scope and method.

Domain-map updates are a follow-up pass; this note records raw findings only.

---

## Phase 0 — Environment / Provisioning

1. **`drizzle-kit migrate` cannot bootstrap a fresh DB** (exit 1; error hidden behind spinner). `drizzle-kit push` required as workaround. Confirms documented prod tracker-drift — no clean `migrate` path for new environments.

2. **Schema requires `vector` (pgvector), `pgcrypto`, `uuid-ossp` extensions pre-installed.** Neither `migrate` nor `push` creates them. Without `vector` the push aborts mid-run; ~150 tables including `brain_embeddings` silently never get created. Any fresh-provision runbook must `CREATE EXTENSION` before running push.

3. **`scripts/verify-db-target.ts` prod-guard has a missing host.** The committed `.env` points at `$STAGING_DATABASE_URL`; only the prod-host variants are listed in the guard. A destructive command (`reset-e2e-db.ts`) would NOT be blocked against that host. Also: `reset-e2e-db.ts` loads `.env.local` without `override:true`, so `.env` precedence can defeat a local override.

---

## Phase 1 — Full E2E Suite

**146 spec files / 1,701 tests. Run time: 59 min.**

| Result | Count |
|---|---|
| Passed | 862 |
| Failed | 340 |
| Flaky | 8 |
| Skipped | 75 |
| Did not run (OOM) | 416 |

### Failure categorization

**~250 — Entitlement gating (402/403).** The canonical seed (`scripts/seed-admin-e2e.ts`) does not grant the test tenant any feature subscriptions. Domains affected: Brain, Websites, Pitch Decks, Booking, and any other domain behind `hasServiceAccess` in `lib/portal-auth.ts` or `lib/mcp/types.ts`. Error forms: `402 Payment Required`, `403`, `BRAIN_NOT_ENTITLED`, "requires an active X subscription". Note: `isBrainEntitled` in `lib/brain/entitlement.ts` has a `BRAIN_ENTITLEMENT_BYPASS=1` / `VITEST` bypass; the generic `hasServiceAccess` does not. **Fix: seed a `category='bundle'` service + active `client_services` row into `lib/db/schema/sites.ts` — this entitles all categories and unblocks the gated domains (verified).**

**~40 — Resend-neutralized.** `email-events` "sends successfully" assertions fail because Resend is in test-sandbox mode. This is by design; these are not product bugs.

**416 did-not-run.** The c8-instrumented server OOM'd late in the run, killing subsequent specs before they started.

### Coverage blocker

`c8 report` on the full-suite V8 dump OOMs even at 8 GB heap (exit 134). Server-side line coverage is currently **unobtainable** for a full run via this pipeline. `scripts/convert-client-coverage.ts` also does not yet exist. Coverage must be sharded or sampled. See [[ADR proposed-audit-agents-and-workflows]] item 2 (Sharded-coverage Workflow).

---

## Phase 2 — MCP Browser Pass

Exercised against `:3100` with a bundle entitlement seeded. Screenshots in `vault/05 - Feature Specs/E2E Audit/screenshots/`.

| Flow | Result | Screenshot |
|---|---|---|
| Login → portal dashboard | Pass | `audit-01-dashboard.png` |
| CRM dashboard | Pass | `audit-03-crm.png` |
| Pitch decks (→ /portal/crm/proposals?tab=decks) | Pass | `audit-04-pitch-decks.png` |
| Booking management | Pass | `audit-05-booking.png` |
| Brain /portal/brain/ask | Pass with 1 console error | `audit-02-brain-ask.png` |
| Public approval UI /approve/[token] | 500 on confirm (see below) | `audit-06-approval-ui.png`, `audit-07-approval-approved.png` |
| Public booking form /book/[slug] | Pass | `audit-08-public-booking.png` |

### Approval UI finding (Phase 2)

The public approval page fully rendered: pending-change payload, PENDING badge, Reject/Approve buttons, confirmation modal (reviewer name + note input). On confirm: **raw 500**. Root cause in this run: a stale staged change referenced a deleted `email_lists` row (env artifact, record #20). However, the **real product finding** is robustness — the public `/approve` endpoint 500s on any orphaned or stale dependency instead of returning a graceful "this change is no longer applicable" state. This is a genuine product bug independent of the seeding artifact.

---

## Real bugs to triage

| # | Symptom | Location hint | Category |
|---|---|---|---|
| 1 | `app/approve/[token]` 500s on orphaned pending-change dependency | `app/approve/[token]/page.tsx` + approval action handler | Product bug — see [[ESign Approvals E2E Audit]] |
| 2 | `/portal/brain/ask` console error (1 error, UI still renders) | `app/portal/brain/ask/page.tsx` | Product bug — see [[Company Brain AI E2E Audit]] |
| 3 | `clientApi.postText is not a function` | Test-helper code | Test bug (helper missing method) |
| 4 | "Publishing project not found after bootstrap" | PM / publishing flow | Product or seed bug — see [[Projects Tickets Kanban E2E Audit]] |
| 5 | "No project columns available for test" | PM / Kanban setup | Product or seed bug — see [[Projects Tickets Kanban E2E Audit]] |
| 6 | Several `TypeError: Cannot read properties of undefined (reading 'id')` | Various specs | Mixed — needs per-case triage |

---

## Follow-ups

- [ ] Fix entitlement seed: add `category='bundle'` row to `scripts/seed-admin-e2e.ts` — unblocks ~250 failing specs
- [ ] Harden `app/approve/[token]` endpoint: graceful 410/422 on orphaned dependencies
- [ ] Fix `verify-db-target.ts`: add staging proxy host (`$STAGING_DATABASE_URL`) to blocked-host list
- [ ] Fix `reset-e2e-db.ts`: load `.env.local` with `override:true`
- [ ] Triage `clientApi.postText is not a function` in test helpers
- [ ] Investigate `/portal/brain/ask` console error
- [ ] Implement sharded coverage workflow — see [[ADR proposed-audit-agents-and-workflows]]
- [ ] Codify remaining MCP browser flows as permanent e2e specs — see [[ADR proposed-audit-agents-and-workflows]]
- [ ] Update 21 domain maps (deferred — follow-up pass to avoid drift-check risk)

## Coverage result (follow-up, post-entitlement-fix)

Sharded run (shard 1/4 = 426 tests; **356 passed / 33 failed / 11 did-not-run**, ~91% — the bundle-entitlement seed fix cleared the 402 cascade). `c8 report` still OOM'd at 8 GB, but **succeeded at 12 GB heap with `--src lib --src app` + text-summary**:

- **Lines / Statements: 87.94%** (3619/4115)
- **Branches: 99.62%** (531/533)
- **Functions: 21.12%** (15/71)

Caveats: this is the 1/4 shard, and the denominator is small (4115 statements) because the Turbopack dev-server V8 dump only source-maps a subset of files back to `lib`/`app` source — so it is **hot-path coverage of what the shard exercised**, not whole-codebase coverage. The 8.3 GB V8 dump per shard is the real bottleneck; a whole-codebase number requires source-instrumentation (Istanbul/babel-plugin) rather than server-V8 + sourcemap. This refines ADR item "sharded-coverage workflow": it must also solve dump-volume, not just shard the run.
