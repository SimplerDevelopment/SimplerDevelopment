---
kanban-plugin: board
type: index
domain: validation
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] Coverage pipeline: shard e2e suite to unblock c8 OOM — see [[ADR proposed-audit-agents-and-workflows]]
- [ ] Competitive synthesis → backlog cards (gap-to-backlog workflow) — see [[Competitive Gap Analysis 2026-06]]
- [ ] Browser-gap regression: codify all 6 approval entity types + 5 public outputs as permanent specs — see [[ADR proposed-audit-agents-and-workflows]]

## Testing

- [ ] env-doctor agent: bootstrap/validate fresh environment (extensions + push + seed + health) — see [[ADR proposed-audit-agents-and-workflows]]
- [ ] Approval-robustness sweeper: detect orphaned mcp_pending_changes — see [[ADR proposed-audit-agents-and-workflows]]

## Blocked


## Passed

- [ ] Phase 0 environment provisioning complete (isolated dev DB, pgvector workaround applied)
- [ ] Phase 1 full suite run complete: 862 pass / 340 fail / 416 did-not-run — see [[Platform E2E Audit 2026-06-17]]
- [ ] Phase 2 MCP browser pass complete (entitlements granted) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Phase 3 competitive gap analysis complete (21 domains) — see [[Competitive Gap Analysis 2026-06]]
- [x] SHIPPED: entitlement-aware e2e seed — bundle grant in seed-admin-e2e.ts (dev 190fa4b5) — see [[ADR proposed-audit-agents-and-workflows]]

## Gaps Found

- [x] Coverage (partial) OBTAINED: shard 1/4 (356 tests, post-entitlement-fix) → Lines/Stmts 87.94% (3619/4115), Branches 99.62%, Functions 21.12% — via `c8 --src lib --src app` + 12GB heap. Caveat: small denominator (Turbopack V8 dump source-maps only a subset) = hot-path coverage, not whole-codebase. Full number needs source-instrumentation. — see [[Platform E2E Audit 2026-06-17]]
- [ ] Entitlement-seed gap: ~250/340 failures are 402/403 env issue, not product bugs — see [[Platform E2E Audit 2026-06-17]]
- [ ] BUG: public `/approve/[token]` returns raw 500 on orphaned/stale pending-change dependency (should show "no longer applicable") — see [[ESign Approvals E2E Audit]]
- [ ] BUG: `/portal/brain/ask` emits a console error on load — see [[Company Brain AI E2E Audit]]
- [ ] BUG: `clientApi.postText is not a function` — e2e test-helper missing method (breaks several specs) — see [[Platform E2E Audit 2026-06-17]]
- [ ] BUG: "Publishing project not found after bootstrap" — see [[Sites Hosting Publishing E2E Audit]]
- [ ] BUG: "No project columns available for test" — see [[Projects Tickets Kanban E2E Audit]]
- [ ] BUG: 416 tests did-not-run — c8-instrumented dev server OOMs late in a full run — see [[Platform E2E Audit 2026-06-17]]
- [ ] INFRA: `drizzle-kit migrate` cannot bootstrap a fresh DB (must use `push`) — see [[Platform E2E Audit 2026-06-17]]
- [ ] INFRA: schema needs pgvector/pgcrypto/uuid-ossp pre-installed or ~150 tables silently drop — see [[Platform E2E Audit 2026-06-17]]
- [ ] INFRA: `verify-db-target` prod-guard omits the `switchyard` host the committed `.env` points at — see [[Platform E2E Audit 2026-06-17]]
- [ ] Cross-cutting competitive gaps: dunning, durable automation, MFA/audit log, SaaS-resell — see [[Competitive Gap Analysis 2026-06]]

---

## Per-Domain Boards

- [[Agency Onboarding Branding E2E Audit]]
- [[Auth Security E2E Audit]]
- [[Sites Hosting Publishing E2E Audit]]
- [[CMS Blocks E2E Audit]]
- [[Visual Editor E2E Audit]]
- [[Company Brain AI E2E Audit]]
- [[CRM E2E Audit]]
- [[ESign Approvals E2E Audit]]
- [[Email Campaigns E2E Audit]]
- [[Storefront Commerce E2E Audit]]
- [[Bookings Services E2E Audit]]
- [[Pitch Decks Product Designer E2E Audit]]
- [[Surveys E2E Audit]]
- [[Projects Tickets Kanban E2E Audit]]
- [[AB Testing E2E Audit]]
- [[Automations Workflows E2E Audit]]
- [[Billing Stripe E2E Audit]]
- [[Chat Realtime Voice E2E Audit]]
- [[Integrations E2E Audit]]
- [[Plugins Extension E2E Audit]]
- [[Agentic OS E2E Audit]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
