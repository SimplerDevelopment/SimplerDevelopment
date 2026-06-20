---
kanban-plugin: board
type: index
domain: validation
status: active
date: 2026-06-20
sources: []
---

2026-06-20: @critical 510 pass (from 35). All consistent failures fixed across 12 commits; residual ~2-4 are dev-mode compile flakiness (pass in isolation; run --mode=prod for a clean gate).

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
- [ ] RESOLVED: "BUG: clientApi.postText is not a function" — added `postText()` helper to `tests/e2e/setup/api-client.ts` — see [[Platform E2E Audit 2026-06-17]]
- [ ] RESOLVED: "BUG: No project columns available for test" (Projects Tickets Kanban) — seed now bootstraps a Publishing project + columns and wires admin client membership (`scripts/seed-admin-e2e.ts`) — see [[Projects Tickets Kanban E2E Audit]]
- [ ] RESOLVED: "Entitlement-seed gap: ~250/340 failures are 402/403" — root cause was the credential rate-limiter, not entitlements; rate-limiter fix recovered ~380 tests — see [[Platform E2E Audit 2026-06-17]]
- [ ] FIXED this session: credential brute-force limiter (`lib/auth.ts`) blocked the whole suite under localhost parallelism — added default-OFF `DISABLE_AUTH_RATE_LIMIT` env bypass, wired into `scripts/test.sh`; recovered ~380 tests
- [ ] FIXED this session: e2e seed now creates admin user + 'owner' client membership + Publishing project (`scripts/seed-admin-e2e.ts`), so adminApi `/api/portal/*` routes resolve a client
- [ ] FIXED this session: ApiClient now sets `sd-active-client` via switch-client after login (publishing/cookie-only resolvers)
- [ ] FIXED this session (real product bug): brain knowledge GET returned 200 for soft-deleted notes — now 404 (`app/api/portal/brain/knowledge/[id]/route.ts`)
- [ ] FIXED this session (real product bug): booking page POST silently dropped `price`/`enableGiftCertificates`/+25 fields on create — now forwarded (`app/api/portal/tools/booking/route.ts`); unblocked gift-cert redemption
- [ ] FIXED this session (test-only): CRM contact-merge phone field, surveys responses shape, gift-cert slug+amount, fixtures request export
- [ ] FIXED: brain/ask hydration — window.origin read moved out of render into useEffect (was a console error on load) — `app/portal/brain/ask/page.tsx`
- [ ] FIXED: websites navigation PUT — insertLevel() dropped new menu items whose parent is an existing DB row — `app/api/portal/websites/[siteId]/navigation/route.ts`
- [ ] FIXED: storefront /designs POST+GET — now mints/reads sd_design_session cookie + writes productDesigns table (was requiring sessionId in body + legacy designs table) — `app/api/storefront/[siteId]/designs/route.ts`
- [ ] FIXED: pitch-deck editor — collabActive was `ydoc!==null` (always true) permanently suppressing the unsaved-changes flag — now keyed to ws-connected — `usePitchDeckState.ts`
- [ ] FIXED: booking page POST forwarded only 7 fields, dropping price/enableGiftCertificates (+25) — fixed (also unblocked gift-cert redemption) — `app/api/portal/tools/booking/route.ts`
- [ ] FIXED: brain knowledge GET returned 200 for soft-deleted notes — now 404 — `app/api/portal/brain/knowledge/[id]/route.ts`
- [ ] FIXED: publishing — getPublishingSession resolves client via membership + routes re-throw redirect (307) instead of 500
- [ ] FIXED: e2e harness/seed — admin user + owner membership + Publishing project + onboarding-complete seeded; auth rate-limit bypass; postText/switch-client/request harness fixes; executor=0 parity

## Gaps Found

- [x] Coverage (partial) OBTAINED: shard 1/4 (356 tests, post-entitlement-fix) → Lines/Stmts 87.94% (3619/4115), Branches 99.62%, Functions 21.12% — via `c8 --src lib --src app` + 12GB heap. Caveat: small denominator (Turbopack V8 dump source-maps only a subset) = hot-path coverage, not whole-codebase. Full number needs source-instrumentation. — see [[Platform E2E Audit 2026-06-17]]
- [ ] BUG: public `/approve/[token]` returns raw 500 on orphaned/stale pending-change dependency (should show "no longer applicable") — see [[ESign Approvals E2E Audit]]
- [ ] BUG: 416 tests did-not-run — c8-instrumented dev server OOMs late in a full run — see [[Platform E2E Audit 2026-06-17]]
- [ ] INFRA: `drizzle-kit migrate` cannot bootstrap a fresh DB (must use `push`) — see [[Platform E2E Audit 2026-06-17]]
- [ ] INFRA: schema needs pgvector/pgcrypto/uuid-ossp pre-installed or ~150 tables silently drop — see [[Platform E2E Audit 2026-06-17]]
- [ ] INFRA: `verify-db-target` prod-guard omits the `switchyard` host the committed `.env` points at — see [[Platform E2E Audit 2026-06-17]]
- [ ] Cross-cutting competitive gaps: dunning, durable automation, MFA/audit log, SaaS-resell — see [[Competitive Gap Analysis 2026-06]]
- [x] RESOLVED: Publishing API routes 500'd instead of 307/403 — `getPublishingSession()` now resolves the active client via `getPortalClient` (cookie → membership → ownership) and routes re-throw `redirect()` (new `isRedirectError`) so unauth emits 307. All 18 publishing @critical tests pass — see [[Sites Hosting Publishing E2E Audit]]
- [x] RESOLVED: product-designer storefront POST `/designs` required `sessionId` in body and wrote the legacy `designs` table — now mints `sd_design_session` cookie + writes `productDesigns` table — see [[Storefront Commerce E2E Audit]]
- [ ] OPEN: Dev-mode flakiness — route-smoke + a few baseline specs blip under Turbopack compile load; run @critical with --mode=prod for a deterministic gate
- [ ] OPEN (env): realtime token route needs `REALTIME_JWT_SECRET` env var (now provided by `scripts/test.sh` for e2e runs) — see [[Chat Realtime Voice E2E Audit]]
- [ ] OPEN (UI/known, triage-only): ab-experiment results-panel views/goals baseline; agency-white-label PATCH branding; admin-portal-invoices; admin agentic-os run-drawer load-flaky — classified UI-baseline, not product bugs

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
