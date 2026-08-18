---
type: adr
domain: validation
status: proposed
date: 2026-06-17
sources:
  - scripts/seed-admin-e2e.ts
  - scripts/verify-db-target.ts
  - scripts/reset-e2e-db.ts
  - scripts/convert-client-coverage.ts
  - lib/brain/entitlement.ts
  - lib/portal-auth.ts
  - app/approve/[token]/page.tsx
---

# ADR: Custom agents and workflows recommended by the 2026-06-17 platform audit

## Status

Proposed

## Context

The 2026-06-17 platform E2E + competitive audit (see [[Platform E2E + Competitive Audit]], [[Platform E2E Audit 2026-06-17]]) produced three categories of friction that recur across every domain: (1) environment setup was manual and fragile — blocking the audit itself; (2) the coverage pipeline OOM'd before producing any number; and (3) the competitive gap report is a static document that has no path to becoming actionable backlog. Each friction point has a well-scoped agent/workflow solution justified by the finding. These are proposed here rather than immediately built so the boss can prioritize and approve before implementation.

## Decision

Build the following seven agents/workflows, in proposed priority order. Each is gated on explicit approval.

### 1. `env-doctor` agent

**Problem (Phase 0 finding):** Bootstrapping a fresh environment required manual `CREATE EXTENSION`, manual workaround from `migrate` to `push`, and a manual entitlement seed. Without this, the first 250 e2e specs immediately 402.

**Sketch:** A single-run agent that: (a) connects to the target DB and idempotently runs `CREATE EXTENSION IF NOT EXISTS` for `vector`, `pgcrypto`, `uuid-ossp`; (b) runs `drizzle-kit push`; (c) seeds a `bundle` entitlement into `scripts/seed-admin-e2e.ts`; (d) hits `/api/health` to verify. Accepts a `--target` flag validated against `scripts/verify-db-target.ts` to refuse prod hosts.

### 2. Sharded-coverage Workflow

**Problem (Phase 1 finding):** `c8 report` on the full-suite V8 dump OOMs at 8 GB heap (exit 134). Server-side line coverage is currently unobtainable for any full run. `scripts/convert-client-coverage.ts` does not yet exist.

**Sketch:** Fan-out workflow — splits the 146-spec suite into N shards (configurable, e.g. 8), each shard gets its own `next dev` server + isolated DB clone. Per-shard V8 coverage is collected and written to `coverage/shard-N/`. A merge agent incrementally combines shard results into a single `lcov` report without loading the full V8 JSON into one process. Unblocks CI coverage gates (see `tests/CI-GATES.md`).

### 3. `gap-to-backlog` Workflow

**Problem (Phase 3 finding):** The [[Competitive Gap Analysis 2026-06]] is a static document. The top-10 platform-wide gaps and per-domain verdicts have no mechanical path into vault specs and kanban cards.

**Sketch:** Classify-and-act workflow — for each of the top-N gaps (configurable, default = top-10 from section 2 of the gap report), spawn a Sonnet spec-draft agent that: (a) creates a `vault/05 - Feature Specs/<gap-slug>.md` using the Feature Spec template; (b) adds a `- [ ]` card to the Backlog lane of [[Project Board]]; (c) links the card to the spec and the relevant domain board. Returns a summary of cards added.

### 4. Approval-robustness sweeper

**Problem (Phase 2 finding):** `/approve/[token]` 500s when the `mcp_pending_changes` / `mcp_approval_links` record references a dependency (e.g. `email_lists` row) that has since been deleted. The endpoint does not distinguish "dependency deleted" from a true server error.

**Sketch:** Two parts. (a) A one-time DB sweep: find all `mcp_pending_changes` rows whose referenced entity (post, deck, email campaign, contract, form, or booking) no longer exists; mark them `expired` with a `stale_dependency` reason. (b) A runtime guard in the approval action handler: before processing, verify all referenced entities exist; if not, return a 410 with a human-readable "this change is no longer applicable" message instead of a 500.

### 5. Browser-gap regression author

**Problem (Phase 2 finding):** The MCP browser pass exercised the public approval UI, public booking form, and Brain /ask — flows with zero permanent e2e coverage. These findings will silently regress without specs.

**Sketch:** Loop-until-green agent — for each uncovered flow (approval UI × 6 entity types, 5 public outputs, Brain /ask), generates a candidate `tests/e2e/*.spec.ts`, runs it against the dev server with entitlements seeded, and iterates until green. Terminates when all target flows have a passing spec or escalates with a triage list of flows it could not stabilize.

### 6. Competitive-watch cron

**Problem (Phase 3 finding):** The gap report is dated; competitor features ship on monthly cadences.

**Sketch:** Quarterly cron (or on-demand agent) — re-runs the 21-domain research workflow at the same depth as Phase 3, stores the output as `vault/05 - Feature Specs/Competitive Gap Analysis <YYYY-MM>.md`, and diffs confirmed gaps against the previous run. New gaps become `- [ ]` cards in [[Project Board]] Backlog; gaps that closed (we shipped the feature) are logged as won.

### 7. Entitlement-aware e2e seed fixture

**Problem (Phase 1 finding):** The canonical seed (`scripts/seed-admin-e2e.ts`) does not grant any feature subscriptions. ~250/340 suite failures are this single omission. Only the `@critical` subset is wired to pass without entitlements.

**Sketch:** Edit `scripts/seed-admin-e2e.ts` to seed a `category='bundle'` service row and a matching active `client_services` row for the test tenant (using the schema in `lib/db/schema/sites.ts`). Alternatively, add an `E2E_ENTITLE_ALL=1` env flag that the seed checks before inserting, so CI can opt in without changing the default seed for other uses. This is the lowest-effort item and unblocks the most specs.

## Consequences

Easier:
- A developer (or agent) can provision a fresh audit environment in a single command instead of a manual multi-step runbook.
- CI coverage gates (`tests/CI-GATES.md`) become obtainable for the first time.
- The competitive gap report becomes living backlog, not a static artifact.
- The public approval 500 is handled gracefully; stale pending-changes are cleaned up.
- The MCP browser flows are permanently covered by regression specs.

Harder / new invariants:
- The sharded-coverage workflow requires N parallel DB clones; each shard must be cleaned up after the run.
- The `gap-to-backlog` workflow produces vault files and kanban cards — the boss must review the generated specs before accepting them as planned work.
- Item 7 (entitlement seed) must be kept in sync whenever new service categories are added to `lib/db/schema/sites.ts`.

## Alternatives considered

**Fix the seed manually (item 7 only) and skip the rest.** Acceptable as a first step but does not address the coverage OOM, the approval robustness gap, or the competitive staleness. Implement item 7 first (lowest cost), then proceed.

**Add `VITEST`-style bypass to `hasServiceAccess`.** Would unblock the suite without seeding but creates a divergence between test and prod entitlement paths — the bypass could mask a real gating bug. Seed is the correct fix.

## Related

- Audit findings: [[Platform E2E Audit 2026-06-17]]
- Initiative spec: [[Platform E2E + Competitive Audit]]
- Competitive report: [[Competitive Gap Analysis 2026-06]]
- Per-domain boards: [[00 - E2E Audit Index]]
