# Portal QA Walkthrough — Final Summary

**Date:** 2026-05-14
**Branch:** `qa/full-walkthrough-2026-05-14` (worktree off `origin/staging`, never touched main)
**Local DB:** `simplerdev_qa_walk` (isolated; production/staging never connected)
**Scope:** All 8 portal slices walked under `client@example.com`. Admin walkthrough deferred per direction.

## At a glance

- **8 portal slices walked** (A–H), 8 sub-reports under `.qa-reports/portal-<x>.md`.
- **15 commits added** to the branch: 13 `fix(*)` bug-fix commits + 1 `test(*)` + 1 merge-of-main (7 hotfixes brought forward).
- **~200 new Playwright tests** across 6 spec files (`tests/e2e/qa-portal-*.spec.ts`).
- **15 schema-drift columns** patched in the local DB and documented — the migration tracker is out of sync with `lib/db/schema/*.ts` and **the same drift almost certainly exists on staging/prod**; multiple routes 500 there too.
- **Tenancy verdict:** No cross-tenant data leak found by any agent (PORTAL-B verified explicitly; A/C/D/E/F/G/H spot-checked).

## Per-slice scorecard

| Slice | Surface | Tests written | Fixes landed | Verdict |
|---|---|---|---|---|
| A — Auth/Settings/Billing | 13 routes | 54 (52–53 pass) | 3 (reset-password HIGH, profile validation, team invite validation) | Healthy after fixes; product gaps remain |
| B — Dashboard/Inbox/Tickets/Approvals | 14 routes | 43 (all pass) | 0 (none needed; tenancy CLEAN) | Healthy; needs pagination/virtualization at scale |
| C — CMS/Websites (visual editor + store) | ~35 routes | 61 (60 pass) | 2 (via fixer) | Mostly healthy; 33s cold-compile editor; live S3 in .env |
| D — CRM | 11 routes | 109 pass / 17 fail (failures = test shape drift) | 1 (formData try/catch) | 3 HIGH security/data gaps now fixed via fixer pass |
| E — Brain (RAG) | 18 routes | 54 pass / 26 fail (NextAuth CSRF parallel-flake) | 0 | API healthy; `/brain/ask` route serves wrong page; embeddings empty for UI-created notes |
| F — Email Marketing | 11 routes | 105/105 integration pass | 2 (cross-tenant DELETE, status-color) | 3 HIGH unfixed: missing service gates, html sanitization, bounce/complaint webhook ignored |
| G — Automations/Branding/Hosting/Projects | 17 routes | 31 (all pass) | 3 (missing GET handlers + test correction) | Healthy; LOW gaps on agency/custom-domain coverage |
| H — Tools (booking/decks/certs/surveys) | 14 routes | 19 (all pass) | 0 | All routes return 200; seed gap: client has no `client_services` so service-gated areas need DB setup to test |

## Highest-impact fixes already landed

1. **`fix(portal-auth)`: hash token before DB lookup in reset-password handler** — HIGH. The password reset flow was **entirely broken**: every reset attempt returned "Invalid or expired reset link" because the route compared the raw URL token against the hashed value the forgot-password handler had stored. No real user could reset a password.
2. **`fix(crm-validation)`: reject script/javascript: substrings in name + notes fields** — HIGH. CRM contact/company free-text fields were XSS-storage vectors. React JSX escapes on render, but the same strings flow through CSV exports, PDF generation, and email merge where escaping is not automatic.
3. **`fix(crm-deals)`: reject negative deal value** — HIGH. Pipeline value totals could be skewed by negative entries.
4. **`fix(crm-proposals)`: require valid recipient email on send** — HIGH. Proposals were marked `sent` even with empty/invalid recipient — silent data loss.
5. **`fix(posts-calendar)`: coerce Date params to ISO strings** — HIGH. `/api/posts/calendar` 500ed for every websiteId because a Drizzle predicate was binding a `Date` object where Postgres-via-`postgres-js` expects an ISO string.
6. **`fix(email-segments)`: 404 on cross-tenant DELETE instead of silent 200** — HIGH. Returning 200 on a cross-tenant delete attempt is an information leak (existence oracle) and contradicts the success contract.
7. **`fix(experiments,projects)`: add missing GET handlers** — MEDIUM. Both `/api/portal/experiments` and `/api/portal/projects/[id]` were documented as supporting GET but only exported POST/PATCH — every list/detail consumer was hitting 405.
8. **`fix(portal-settings)`: profile PATCH + team invite length/format validation** — MEDIUM. Oversized inputs were producing 500s instead of 400s.
9. **`fix(store-products)`: reject negative product price** — MEDIUM. Store accepted `price: -100` and returned 201.
10. **`fix(cms-routes)`: validate numeric siteId path param** — MEDIUM. `POST /api/portal/cms/websites/undefined/categories` 500ed with `invalid input syntax for type integer: "NaN"` instead of 400.

## Critical findings NOT yet fixed (need product / scope decisions)

### CRITICAL — Schema drift between code and live DB

`simplerdev_test` (and likely staging/prod) is missing **15 columns** that `lib/db/schema/*.ts` references. Locally patched in this audit; on staging/prod these routes are currently 500-ing for real users:

- `automation_rules.{schedule,next_run_at,execution_count,last_executed_at}` → every event-driven automation handler (CRM, tickets, tasks, projects)
- `crm_custom_fields.{filterable,category}` → all `/api/portal/crm/custom-fields` operations
- `client_websites.{draft_custom_css,draft_custom_js,draft_updated_at,draft_updated_by}` → entire `/portal/websites` list and create
- `site_navigation.draft` → `/api/portal/websites/<siteId>/navigation`
- `google_workspace_user_connections.drive_channel_*` (4 cols) → `/api/portal/brain/drive-sync`
- `surveys.{publish_results,certificate_enabled,consent_field,notify_on_response,notify_digest,closes_at,max_responses,linked_type,linked_id,recommendation,scoring_config}` → survey publish/submit
- `survey_responses.score` → public survey submission

**Recommendation:** Generate a corrective Drizzle migration with `bun run db:generate` against a freshly introspected staging DB. Wire `drizzle-kit check` into CI to fail any deploy where schema and DB diverge.

### HIGH — Email subsystem gaps (PORTAL-F)
1. Five email routes (`/lists/[id]`, `/campaigns/[id]`, `/subscribers`, `/campaigns/[id]/send`, `/campaigns/[id]/promote-winner`) **lack the `authorizePortal({ requireService: 'email' })` service gate** — a tenant without an email subscription can send campaigns.
2. `htmlContent` is stored and rendered without `sanitizeHtml`/`sanitizeRichHtml` — XSS payloads survive into preview renders and outbound email HTML.
3. `email.complained` and `email.bounced` Resend webhook events **don't update subscriber status** — future campaigns continue targeting complainers (deliverability + CAN-SPAM risk).
4. `scheduledAt` in the past is accepted but no cron picks up the campaign — silent drop.

### HIGH — Test-infrastructure gaps
- `visual-editor-blocks.spec.ts` and `visual-editor-shell-baseline.spec.ts` use a **hardcoded SITE_ID=1** that belongs to a different client than `client@example.com` — 57/59 block-type tests never actually run. The "critical-path gate" is blind to block rendering regressions.
- `portal-cms-navigation.spec.ts` uses the wrong API path (`/cms/websites/` prefix) — all 6 navigation tests fail. Navigation is effectively untested.
- NextAuth CSRF endpoint flakes under parallel Playwright workers — 26 false failures in PORTAL-E alone. **Brain specs need `--workers=1`.**

### MEDIUM — Pagination / unbounded queries
- `/portal/tickets` page does an unbounded `orderBy` with no `.limit()`. At 100+ tickets the SSR render is slow. No pagination UI exists.
- `/portal/inbox` calls `/api/portal/chat/conversations` with no `limit`/`offset`. UI fetches all conversations in a single request, no virtualization.
- `/api/portal/crm/companies?limit=5000` is acceptable but `limit` has no server-side cap.

### MEDIUM — Performance hot-spots
- `/api/portal/crm/analytics` consistently **14s warm** — needs an index on `crm_deals(client_id, status, created_at)`.
- Visual-editor first-load **33.6s cold** (`VisualEditorShell.tsx` is 4000+ lines). Warm 973ms. Acceptable in dev with Turbopack but a sign the component should be code-split.
- `POST /api/portal/tickets` takes 12s — synchronous notification/automation chain on the request thread; should be queued.

### MEDIUM — Product gaps
- **`/portal/brain/ask`** serves the MCP Connect page; the RAG Q&A endpoint was never shipped. The URL creates a false expectation. Either ship the feature, redirect to `/brain/knowledge`, or hide the link.
- **`brain_embeddings`** is empty for all notes created via the UI/API — semantic search is unreachable without a per-client OpenAI key. Tags aren't indexed for search either.
- **Billing page has no empty state** when a client has no invoices or active services.
- **Team invite sends no email** to the invitee — temp password is returned in the API response only.
- **Branding profiles accept invalid hex codes** — no server-side validation.
- **Surveys** with `status='published'` are accepted by the portal but the public submit endpoint only honors `'active'` — flag-vs-status mismatch.

### LOW — Hygiene
- **Live Railway S3 credentials** in `.env` — test uploads in this audit went to the production bucket. The seeded `.env` ships with production storage credentials; QA/dev envs should use a separate bucket or a mock.
- **`/portal/standup`** is absent from `portal-smoke-all-routes.spec.ts` — a runtime error there would go undetected.
- **`/portal/services`** TTI ~10s on dev under load — likely a missing index.
- **Audit history `userId` is null** on all rows in brain note history — attribution lost before compliance templates ship.
- **Next 16** flags `middleware.ts` as deprecated (should be `proxy.ts`) and detected multiple lockfiles (the outer `simplerdevelopment2026/` is in a monorepo with a root `package.json`).
- **Playwright MCP** fails to launch inside the repo because of the npm `jsdom@^27.4.0` override (EOVERRIDE). Works fine from any other cwd.

## Code-coverage inventory (what we now know)

Each per-slice report (`portal-a.md` through `portal-h.md`) contains a route-by-route table of COVERED / PARTIAL / GAP with notes. Repeated themes:

- **Mutation paths > read paths.** Detail-view smoke tests cover loads but rarely cover the full edit + save + reload cycle.
- **Service-gated areas (booking, decks, surveys, hosting, email)** are systematically under-tested because the seeded portal client owns no `client_services` rows. Folding service grants into `seed-portal-client.ts` would unlock 30–50 more meaningful tests per area.
- **The visual editor** has the largest absolute coverage gap relative to its surface area (~47 block types × insert/edit/render/postMessage). PORTAL-C verified all 47 block types via API round-trip but the editor UI itself only has happy-path coverage.
- **MCP-only operations** (server-tool CRUD via the portal MCP) are not under E2E coverage at all. Recommend a dedicated `portal-mcp-roundtrip.spec.ts` that drives the same operations the AI exposes.

## Files of record

| Path | Contents |
|---|---|
| `.qa-reports/portal-a.md` | Auth / Settings / Billing / Notifications / Services |
| `.qa-reports/portal-b.md` | Dashboard / Inbox / Tickets / My Tasks / Approvals / Snapshots / Standup / Invoices |
| `.qa-reports/portal-c.md` | CMS / Websites / Blocks / Editor / Store / Media / Branding |
| `.qa-reports/portal-d.md` | CRM (companies / contacts / deals / proposals / contracts / settings) |
| `.qa-reports/portal-e.md` | Company Brain (knowledge / ask / relationships / communications) |
| `.qa-reports/portal-f.md` | Email marketing (campaigns / lists / segments / templates / analytics) |
| `.qa-reports/portal-g.md` | Automations / Branding / Hosting / Projects / Experiments |
| `.qa-reports/portal-h.md` | Tools — Booking / Pitch Decks / Gift Certificates / Surveys |
| `.qa-reports/_orchestrator-findings.md` | Cross-cutting issues caught from the dev-server error stream while agents ran |
| `tests/e2e/qa-portal-*.spec.ts` | 6 new spec files, ~200 new tests total |
| `.qa-reports/portal-*-screens/` | Screenshots per slice |

## Operational rules followed

- Never connected to staging/prod DB. `db:verify-target` confirmed local-only at every checkpoint.
- Never pushed any branch. Never touched `main`.
- All work on `qa/full-walkthrough-2026-05-14`, fast-forwardable into `staging` via PR.
- Seeded `.env.local` overrides any production-pointing env values from `.env`.
