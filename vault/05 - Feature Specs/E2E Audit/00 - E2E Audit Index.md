---
kanban-plugin: board
type: index
domain: validation
status: active
date: 2026-06-20
sources: []
---

2026-06-20 COVERAGE AUTHORING: wrote + verified specs for the needs-spec backlog (fan-out: 82 agents, ~4-card units, prod server @ DB_POOL_MAX=24). NEW STATE: **Passed 272** (each backed by a spec that passes — 760 new coverage tests green, 0 fail / 5 flaky in the consolidated run), **Gaps Found 184** (incl. ~45 features confirmed NOT implemented), **To Test 46** (genuinely hard/unstable, kept honest). 8 real product BUGS surfaced by the new tests (flagged on their boards):
- CRM notifications [id]: only PATCH; GET/DELETE 405 (interface mismatch)
- CRM pipeline stage [stageId]: only DELETE; PUT 405
- Surveys: allowMultiple=false NOT enforced — 2nd same-email submit returns 201
- Sites API keys: generateApiKey emits 72 chars but api_keys.key is varchar(64) → POST 500
- Automations: condition-node action undefined → workflow_step_logs NOT NULL fail → runs always fail
- ESign: orphaned/applied pending-change returns 500 not graceful 4xx
- Plugins/Cron: plugin-jobs-tick TZ mismatch (NY vs UTC) → due jobs never claimed

2026-06-20 RECONCILIATION (earlier): boards first re-filed to reality (80 Passed / 299 needs-spec) before the authoring pass above closed most of the backlog.

2026-06-20: @critical prod-mode gate (`scripts/test.sh --mode=prod`) is GREEN — **577 passed / 0 failed** (1 flaky ab-experiment UI row passed on retry; 30 dev-only skipped). From 35 pass at session start. presenter crash + api-keys/booking/survey #418 + collab-WS smoke filter all fixed; tenancy gate 415/0. Latest canonical gate fixes: api-keys #418 hydration (product) + route-smoke now ignores collab-WS connection-refused noise (the ws://localhost:3030 realtime server isn't part of the e2e harness). Remaining blips (ab-experiment row, agency-branding PATCH) are flaky-on-retry only. PROD-MODE made runnable: AUTH_TRUST_HOST=true (Auth.js rejects untrusted localhost in prod) + skip dev-only Agentic OS (isLocalDev gate → 404 in prod) + route-smoke /portal/login accepts the /portal/onboarding redirect (un-onboarded user lands there). Remaining run-level blips (ab-experiment UI row, integrations/api-keys smoke) are flaky-on-retry only — each passes in isolation.

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
- [ ] FIXED: prod-mode (`--mode=prod`) e2e now runnable — `scripts/test.sh` exports `AUTH_TRUST_HOST=true` (Auth.js v5 rejects untrusted localhost Host in prod → every sign-in 500'd); `admin-agentic-os` spec probes the API and `test.skip()`s when it 404s (Agentic OS is a dev-only `isLocalDev` feature)

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
- [x] RESOLVED: route-smoke `GET /portal/login` failed because an authenticated client with incomplete onboarding is bounced to `/portal/onboarding` (the onboarding specs leave client@example.com mid-wizard). The smoke check now accepts `/portal/onboarding` as a valid clean-load landing — see [[Auth Security E2E Audit]]
- [x] RESOLVED (real prod hydration bug): route-smoke `/portal/settings/api-keys` threw React #418 (server text didn't match client) — the MCP endpoint `<code>` read `window.location.origin` during render. Now defaults to '' (SSR + first paint both render `/api/mcp`) and fills the origin in `useEffect` — `app/portal/settings/api-keys/page.tsx` — see [[Auth Security E2E Audit]]
- [ ] OPEN (flaky-only): ab-experiment "UI experiment row" + agency-white-label branding PATCH blip under full-suite load but pass in isolation (and on retry) — timing, not product bugs
- [x] RESOLVED (preemptive #418): `tools/booking/[id]` + `surveys/[id]` carried the same `window.location.origin`-in-render pattern — both moved to the useEffect-origin pattern before they could smoke-fail
- [x] RESOLVED (real bug): `/portal/tools/pitch-decks/[id]/presenter` threw `TypeError: …reading 'blocks'` for a 0-slide deck (`deck.slides[current]` undefined → `slide.blocks`) — added an empty-deck guard
- [x] VALIDATED: tenancy gate (integration `--tag=tenancy`) run against an isolated LOCAL DB (never staging) → **415 passed / 0 failed**. Confirms the publishing/booking/brain/nav data-access changes introduce no cross-tenant leaks.
- [ ] SCOPE NOTE: the strict 270-route `@portal-smoke` spec is a firehose surfacing a *backlog* of per-page prod-console-cleanliness issues (hydration mismatches, optional-feature WS noise, presenter crash) as the seed fills out. The ~547 feature-flow @critical tests are green. Driving portal-smoke to literal-zero is a worthwhile SEPARATE cleanup initiative (audit every client page for prod console cleanliness), not part of this E2E-audit pass.
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
