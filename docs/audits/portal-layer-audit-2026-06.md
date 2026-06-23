# Portal Layer Audit — Capability, Parity, MCP & Observability

**Date:** 2026-06-23 · **Scope:** Portal admin/editor, public-facing renderings, API, MCP, analytics/telemetry
**Method:** Code inspection only (5 parallel read-only agents traced data source → API → MCP → Admin UI → Public UI). No parity assumed; every layer enumerated from source.

> Source counts (authoritative from code): **473 MCP tools** (`tests/unit/mcp-tool-registry-baseline.test.ts`) · **~550 portal API route handlers** across 70+ resource groups (`app/api/portal/**`) · **~47 Brain pages + ~30 other portal feature areas** (`app/portal/**`) · **~40 public end-user capabilities** (`app/sites`, `app/s`, `app/book`, `app/(public)`, etc.).

---

## 1. Executive Summary

SimplerDevelopment is a mature, **API-first, MCP-first** multi-tenant SaaS. The MCP surface (473 tools) and the REST API (~550 handlers) are the two broadest layers and are largely in lockstep for the agentic-content domains (CMS, CRM, email, store, projects, surveys, decks, brain). The **public-facing layer is a thin, token-gated rendering + conversion surface**, and the **admin/editor UI is the richest interactive layer** — particularly the visual block editor, which has no API/MCP equivalent for granular block manipulation (the whole block tree round-trips as `posts.content`).

**Three headline findings:**

1. **Observability is lopsided.** MCP usage is *well* instrumented (per-call telemetry → daily rollups → admin dashboard at `app/admin/mcp-usage`). But there is **zero first-party analytics on the authenticated portal itself** (page views, feature adoption, searches, CTA clicks) and **no per-endpoint API metrics** (volume/error-rate/latency) beyond Sentry at a 10% trace sample. You can answer "which MCP tool is most expensive" but not "which portal feature does anyone actually use."

2. **Two latent data risks ship today.** (a) `app/api/cron/mcp-cleanup` (14-day raw-event TTL) **is not registered in `vercel.json`** → `mcp_tool_calls` grows unbounded. (b) `mcpToolCallDailyRollups.totalEstimatedTokens` is `integer` (4-byte) → overflow risk for high-volume tenants over long windows.

3. **Parity gaps are concentrated, not pervasive.** The API/MCP/Admin trio is consistent for CRUD domains. The real divergences are: (i) the **visual editor** (admin-only, no granular API/MCP), (ii) **public conversion endpoints** that bypass the authed API and write CRM side-effects from CORS-wildcard routes, (iii) **read-only RSC pages** with no GET API (so MCP/external clients can't read what the UI shows), and (iv) a handful of **MCP domains that don't exist** (tickets read-only, chat/inbox, approvals-as-end-user, analytics readback, no `media` S3 purge).

**Recommended stack for the gap:** **PostHog (self-host or cloud) for product analytics + first-party event pipeline**, keep **Sentry for errors/APM**, and **extend the existing `mcp_tool_calls`→rollup pattern** to a generic `portal_events` table rather than buying a second vendor. Rationale in §7.

---

## 2. Capability Matrix

Legend: ✅ full · ◑ partial / indirect · ❌ absent · — n/a

| Capability domain | Admin UI | Public UI | API | MCP | Notes & paths |
|---|:--:|:--:|:--:|:--:|---|
| **CMS posts/pages** | ✅ | ◑ (render only) | ✅ | ✅ | UI: `app/portal/websites/[siteId]/posts/...`; API: `/api/portal/cms/websites/[siteId]/posts`; MCP: `posts_*`; public render: `app/sites/[domain]/[[...slug]]` |
| **Visual block editor** | ✅ | ❌ | ◑ (whole-tree save only) | ◑ (whole-tree via `posts_update`) | `components/portal/visual-editor/*`; no per-block API. Editor state is client+postMessage; persistence = `PUT .../posts/[id]` |
| **Block templates** | ✅ | — | ✅ | ✅ | `block_templates_*` MCP; `/api/block-templates` |
| **Navigation** | ✅ | ◑ (rendered) | ✅ | ✅ | `nav_*` MCP (draft/publish model); `/api/portal/websites/[siteId]/navigation` |
| **Custom code (CSS/JS)** | ✅ | ◑ (injected) | ✅ | ✅ | `sites_*_custom_code` MCP |
| **Post types (CPT)** | ✅ | ◑ (rendered) | ✅ | ✅ | `post_types_*` MCP |
| **Media library** | ✅ | — | ✅ | ◑ | `media_*` MCP — **`media_delete` does NOT purge S3** (orphan risk) |
| **Branding profiles** | ✅ | ◑ (applied) | ✅ | ✅ | `branding_*` MCP incl. WCAG `branding_audit`/`branding_check_contrast` |
| **CRM contacts/companies/deals** | ✅ | — | ✅ | ✅ | `crm_*` MCP (~40 tools); `/api/portal/crm/**` |
| **Proposals / Contracts** | ✅ | ✅ (sign via token) | ✅ | ✅ | MCP `proposals_*`/`contracts_*`; public sign: `app/proposal/[token]`, `app/contract/[token]` |
| **Email marketing** | ✅ | ◑ (signup form) | ✅ | ✅ | `email_*` MCP; **`email_campaigns_send` has its own `email:send` scope** |
| **Email journeys/automations** | ✅ | — | ✅ | ❌ | `/api/portal/email/journeys` — **no MCP** |
| **Surveys** | ✅ | ✅ (take) | ✅ | ◑ (no responses submit) | `surveys_*` MCP read+author; public take: `app/s/[slug]` |
| **Booking** | ✅ | ✅ (book) | ✅ | ✅ | `booking_pages_*`/`bookings_*`; public: `app/book/[slug]` |
| **Storefront / e-commerce** | ✅ | ✅ (shop/cart/checkout) | ✅ | ◑ | `store_*` MCP (admin ops); public shop: `app/sites/[domain]/{shop,cart,checkout}` |
| **Product designer (POD)** | ✅ | ✅ | ✅ | ❌ | `app/sites/[domain]/design/[productSlug]`; rich design API; **no MCP** |
| **Gift certificates** | ✅ | ✅ (purchase) | ✅ | ◑ (issue/list only) | `gift_certificates_*` MCP; public purchase: `app/(public)/gift-certificates/[siteId]` |
| **Pitch decks** | ✅ | ✅ (view) | ✅ | ✅ | `decks_*` MCP; public: `app/pitch-deck/[slug]` (+ per-slide dwell tracking) |
| **Projects / Kanban** | ✅ | — | ✅ | ✅ | `kanban_*` + `projects_*` + `sprints_*` MCP (~50 tools) |
| **Company Brain (notes/docs/decisions/playbooks/people)** | ✅ | — | ✅ | ✅ | `brain_*` MCP (~150 tools); `/api/portal/brain/**` (entitlement-gated) |
| **Tickets / support** | ✅ | ◑ (storefront support only) | ✅ | ❌ | `/api/portal/tickets` — **no MCP tools** |
| **Chat / inbox** | ✅ | ✅ (widget) | ✅ | ❌ | `app/portal/inbox`; public widget `app/widget/chat`; **no MCP** |
| **Approvals (staged MCP writes)** | ✅ | ✅ (token approve) | ✅ | ✅ | `approvals_*` MCP; public `app/approve/[token]` |
| **Automations (rules)** | ✅ | — | ✅ | ✅ | `automations_*` MCP |
| **Workflows (visual graph)** | ✅ | — | ✅ | ❌ | `/api/portal/workflows` — **no MCP** |
| **A/B experiments** | ✅ | ◑ (events fire) | ✅ | ❌ | `/api/portal/experiments`; events `POST /api/public/ab/event`; **no MCP** |
| **Hosting** | ✅ | — | ✅ | ◑ (read-only) | `hosting_list`/`hosting_get` |
| **Integrations (Google/MS/GitHub)** | ✅ | — | ✅ | ◑ (list/revoke) | `integrations_*` (no connect via MCP — OAuth flow is UI-only) |
| **Billing / credits / invoices** | ✅ | ◑ (pay via Stripe) | ✅ | ◑ (read-only) | `invoices_*`, `ai_credits_*` MCP read-only; no checkout via MCP |
| **Team / members** | ✅ | — | ✅ | ✅ | `team_*`, `client_*` |
| **Notifications** | ✅ | — | ✅ | ❌ | `/api/portal/notifications` — **no MCP** |
| **Agency white-label** | ✅ | ◑ (applied) | ✅ | ❌ | `/api/portal/agency/**` — **no MCP** |
| **Snapshots (site backup)** | ✅ | — | ✅ | ❌ | `/api/portal/snapshots` — **no MCP** |
| **Voice (RealtimeAPI bridge)** | ✅ | — | ✅ | — | `/api/portal/voice/*` |
| **MCP usage analytics** | ✅ (admin only) | ❌ | ◑ (admin route) | ❌ | `app/admin/mcp-usage`; **clients can't see own usage; no MCP tool to read it** |

**Cross-layer observations:**
- **Admin-only (no public, no API-read):** the visual editor's per-block operations, and ~10 RSC list pages that query Drizzle directly with no GET route (Dashboard, Projects workspace, Suggested Projects, Services, Experiments, Hosting, Invoices, Tickets list, Surveys list, Brain dashboard). External clients/MCP cannot read what these pages show.
- **Public bypasses the authed API:** 8 server components read the DB directly (`app/pitch-deck/[slug]`, `app/sites/[domain]/slides/[slug]`, `app/preview/[id]`, `app/s/[slug]/results`, `app/slides/[slug]`, storefront designer gates) — see §3.
- **API-only (no UI):** all `/api/cron/**`, all `/api/webhooks/**` + `/api/{stripe,google,microsoft}-webhook`, OAuth callbacks, and utility endpoints (`resolve-subdomain`, `url-suggestions`, `analyze-site`, `preview-unlock`, `automations/parse`).
- **MCP-only (no UI equivalent surfaced as a tool):** `kanban_propose_sprint` (greedy packing algorithm, read-only) and `branding_check_contrast` exist as MCP tools but aren't first-class UI buttons.
- **Duplicate-implemented differently:** CMS reads exist three ways — RSC Drizzle (UI), `/api/portal/cms/...` (REST), `posts_*` (MCP). Survey submit writes CRM both via authed portal path and via the public CORS-wildcard `/api/surveys/[slug]` path with its own upsert logic (`upsertContactByEmail`).

---

## 3. Gap Analysis (ranked)

Effort key: **S** ≤1 day · **M** ≤1 week · **L** >1 week.

### CRITICAL

| # | Gap | Evidence | Risk | Effort |
|---|---|---|---|---|
| C1 | **`mcp-cleanup` cron not scheduled** — 14-day raw TTL never fires | `app/api/cron/mcp-cleanup/route.ts` exists; absent from `vercel.json` `crons[]` | `mcp_tool_calls` grows unbounded → storage cost + slow `getTodaySoFar`/`getRecentErrors` queries | **S** |
| C2 | **Public survey submit has amplifying side-effects with no rate limit** | `app/api/surveys/[slug]/route.ts` → on submit: `upsertContactByEmail` + `crmDeals` insert (auto-route), webhooks, follow-up emails | **CORRECTED on code review:** CRM writes ARE tenant-scoped (`survey.clientId` + `assertPipelineInClient/assertStageInClient`), and the `Access-Control-Allow-Origin:*` is correctly reasoned (public no-cred endpoint; tightening CORS is theater). The real risk is an unthrottled flood amplifying into CRM/email/webhooks. **FIXED:** added `checkRateLimit` 30/min per IP+slug (`lib/security/rate-limit.ts`). | **S** (done) |
| C4 | **`app/preview/[id]` has no visible auth guard** + direct `posts` read | Public-UI agent flagged no auth check in the page file | Potential unpublished-content disclosure (verify middleware first) | **S** (verify) / **M** (fix) |

### HIGH

| # | Gap | Evidence | Effort |
|---|---|---|---|
| H1 | **No first-party portal analytics** — page views, feature adoption, searches, CTA clicks all untracked | Analytics agent: zero portal session/event tracking | **M** (foundation) |
| H2 | **No per-API-endpoint metrics** (volume / error rate / p50-p95 latency) | `httpRequestLogs` only covers *client* sites, not portal API | **M** |
| H3 | **`totalEstimatedTokens` integer overflow** in rollups | `lib/db/schema/tools.ts` rollup cols are `integer` | **S** |
| H4 | **MCP token estimate is heuristic ±30-60%**, and `getTopTools` computes `max(p95)` across days (overstates) | `lib/mcp/telemetry.ts:estimateTokens`, `lib/mcp/usage-stats.ts:145` | **S–M** |
| H5 | **PII unredacted in audit log** — `email`, `guestName`, `contactEmail`, and raw 2KB output summaries stored | `lib/mcp/audit-redact.ts` only matches `password\|secret\|token\|key\|credential\|auth\|bearer` | **S** |
| H6 | **Read-parity gap: RSC-only pages have no GET API** | ~10 pages query Drizzle directly; MCP/external clients can't read them | **M** |
| H7 | **Tickets / Chat / Notifications / Workflows have no MCP tools** | Agentic clients can't triage support or read inbox | **M** |

### MEDIUM

| # | Gap | Evidence | Effort |
|---|---|---|---|
| M1 | **No client-facing MCP usage view** — tenants can't see their own token spend | `app/admin/mcp-usage` is staff-only | **M** |
| M2 | **No MCP→outcome attribution** — audit log records the call, not whether the staged write was approved/applied | `agentAuditLogs` has status of the *call*, not the downstream pending-change | **M** |
| M3 | **Interactive MCP sessions have `runId=null`** — multi-turn calls appear unrelated | Only `agenticOsRuns` set runId | **M** |
| M4 | **`media_delete` orphans S3 objects** | MCP tool deletes DB row only | **S** |
| M5 | **Booking & store conversion funnels invisible** — only completions land in DB | No view→slot→pay or view→cart→purchase events | **M** |
| M6 | **`httpRequestLogs` stores raw IPs, no TTL/anonymization** | `lib/db/schema/sites.ts` | **S** |
| M7 | **`customHeadHtml`/`customBodyHtml` injected with minimal sanitization** | Only `javascript:` URL block | **M** |
| M8 | **Email sender-defaults form has no save endpoint** | `/portal/email/settings` form unwired | **S** |

### LOW

| # | Gap | Effort |
|---|---|---|
| L1 | `/publishing/tags` placeholder UI (PUB-7 unimplemented) | S |
| L2 | `triggerLinkClicks.contactId` schema-present, never populated | S |
| L3 | `abEvents`, `pitchDeckViews` have no retention TTL | S |
| L4 | Integrations connect (OAuth) is UI-only — no MCP/API headless path | M |
| L5 | No rate-limiting middleware on portal/admin API → no 429 metrics | M |

---

## 4. User-Journey Comparison

### Journey A — "Publish a blog post"
| Step | Admin UI | API | MCP |
|---|---|---|---|
| Create | open `/portal/websites/[siteId]/posts/new`, build blocks visually | `POST /api/portal/cms/websites/[siteId]/posts` (full block JSON) | `posts_create` (full block JSON) |
| Edit blocks | drag/style/undo in iframe editor | ❌ no per-block op — must send whole `content` | ❌ same — `posts_update` whole tree |
| Publish | toggle status | `PUT .../posts/[id]` `{status:published}` | `posts_update` `{status}` |
| **Divergence** | Visual fidelity, undo/redo, presence | Must construct valid block JSON by hand | Same as API; **writes may stage as pending approval** (`approvals_*`) |

**Consolidation opportunity:** expose a **block-patch API/MCP** (`posts_patch_block`) so agents/integrations can edit one block without re-sending the tree — the single biggest editor-vs-API asymmetry.

### Journey B — "Capture a lead from a survey"
| Path | Steps | Data access | Output |
|---|---|---|---|
| Public take | `app/s/[slug]` → `POST /api/surveys/[slug]` | **CORS `*`**, anon; upserts CRM contact + deal | Response row + CRM side-effect |
| Admin read | `/portal/surveys/[id]` responses tab | authed `authorizePortal` | Aggregates, export |
| MCP read | `surveys_list_responses` | `surveys:read` scope | JSON answers |
| **Divergence** | Public write path has *different* validation + CORS posture than authed paths; MCP **cannot submit** a response (read-only) |

### Journey C — "Triage a support ticket"
| Path | Available? | Notes |
|---|---|---|
| Admin UI | ✅ `/portal/tickets/[id]` reply/status/SLA | full |
| API | ✅ `/api/portal/tickets/**` | full |
| MCP | ❌ | **no ticket tools** → agents can't help with support, a high-value agent workflow |

### Journey D — "Check how my AI agent is performing"
| Path | Available? | Notes |
|---|---|---|
| Admin (staff) | ✅ `app/admin/mcp-usage` | calls, tokens, cost, p95, errors |
| Client portal | ❌ | tenants have no visibility into their own MCP spend |
| API | ◑ `/api/admin/portal/mcp-usage` (staff-scoped) | not client-scoped |
| MCP | ❌ | no `usage_get` tool for an agent to self-report cost |

---

## 5. MCP Audit (deliverable 4)

**Inventory:** 473 tools across 28 domain files in `lib/mcp/tools/*` (full table in this repo's agent output; representative domains: `cms` 40+, `crm` 43, `brain` ~150, `kanban` 40, `store` 27, `email` 19, `decks` 12, `bookings` 10, `surveys` 6). 4 resources, 3 prompts.

**Auth & permissions:**
- Transport: `app/api/mcp/route.ts` → `lib/mcp/server.ts:buildMcpServer`. Client auth = **bearer `sd_mcp_…` API keys** (issued per-client, bound to clientId at issuance) **or OAuth** (`/api/portal/oauth-clients`, `/api/portal/oauth-tokens`), resolved via `lib/mcp-auth.ts`.
- **Scope model:** every tool guards a string scope (`crm:read`, `crm:write`, `sites:read/write`, `email:read/write/send`, `brain:read/write`, `store:read/write`, `projects:read/write`, `bookings:*`, `decks:*`, `branding:*`, `billing:read`, `team:*`, `approvals:read/manage`, …). `email_campaigns_send` deliberately carries a **distinct `email:send`** scope. `projects_propose_artifact_link` requires a **dual guard** (`projects:write` AND `brain:write`).
- **Write-staging:** many writes don't apply directly — they stage a **pending change** (`lib/mcp/pending-changes.ts`) surfaced via `approvals_*` and the public `app/approve/[token]` flow. `surveys_update` mints a fresh approval URL each call.

**Telemetry captured per call** (`lib/mcp/telemetry.ts:wrapRegisterTool`, monkey-patches `registerTool` — one chokepoint for all 473 tools):
- → `mcp_tool_calls` (raw, 14-day TTL): `clientId, apiKeyId, userId, toolName, requestBytes, responseBytes, estimatedTokens, durationMs, success, errorMessage`.
- → `agent_action_logs` (durable): `clientId, runId, toolName, inputsSummary` (redacted), `outputSummary` (first 2KB), `status, durationMs`.
- → injects `_meta.usage` into each response (MCP spec 2025-06-18 extension channel).

**MCP tools that SHOULD exist but don't:**
| Proposed tool(s) | Why | Effort |
|---|---|---|
| `tickets_list/get/reply/update` | agent-assisted support triage (Classify & Act pattern) | M |
| `surveys_submit_response` | let agents file structured intake on behalf of a user | S |
| `chat_conversations_list/reply` | agent inbox handling | M |
| `notifications_list/mark_read` | agents acting on their own notifications | S |
| `usage_get` (self-report MCP cost) | close Journey-D gap; agent self-throttling | S |
| `analytics_get` (read email/booking/store/deck analytics) | agents currently can't read the numbers the UI shows | M |
| `workflows_*`, `experiments_*`, `automations` already exist but no `workflows` MCP | parity | M |
| `media_purge` / fix `media_delete` to purge S3 | stop orphaning objects | S |

**Tools that duplicate API functionality:** essentially the entire CRUD surface is intentionally duplicated (REST + MCP) — this is by design and acceptable; the duplication cost is schema drift, mitigated by `tests/unit/mcp-tool-registry-baseline.test.ts`.

**MCP capabilities unavailable elsewhere:** `kanban_propose_sprint` (greedy packing), `branding_check_contrast` / `branding_audit` (WCAG), and the **draft/publish staging semantics** (`nav_*`, `block_templates_*`) are richer via MCP than the equivalent UI flows.

**Missing observability around MCP:** outcome attribution (M2), session grouping for interactive keys (M3), client-facing visibility (M1), and no real-time spike alerting (dashboard is poll-only).

---

## 6. Analytics & Monitoring Audit (deliverable 5)

### What EXISTS
**Portal/public:** per-site 3rd-party tags (GA4/GTM/Meta/Clarity/Hotjar via `siteTracking` + `lib/site-tracking/providers.ts` — data goes to *those* platforms, **none lands first-party**); A/B events (`abEvents` ← `POST /api/public/ab/event`, surfaced `app/portal/experiments/[id]`); pitch-deck views + per-slide dwell (`pitchDeckViews`); trigger-link clicks (`triggerLinkClicks` ← `app/go/[slug]`); email opens/clicks/bounces (`emailCampaigns` + `emailCampaignSends` ← Resend/Svix webhook).

**API:** billing usage rollup (`lib/billing/usage-rollup.ts` → Stripe); cron health (`cronHealth` + `withCronHealth`, surfaced `/admin/system-health`); Resend delivery sync. **No per-endpoint volume/error/latency.**

**MCP (mature):** per-call → daily rollup (`app/api/cron/mcp-rollup` → `lib/mcp/rollup.ts`) → read helpers (`lib/mcp/usage-stats.ts`) → admin dashboard (`app/admin/mcp-usage`, data via `GET /api/admin/portal/mcp-usage`): summary, today-so-far, daily series, top clients, top tools by token, slowest tools (p95), recent errors, truncation-risk badge.

**Sentry:** server + edge errors (all) + traces @ `tracesSampleRate: 0.1`; **client = errors-only** (browser tracing + replay intentionally OFF for mobile TBT). Prod-only.

### BLIND SPOTS
- Portal: page views, navigation funnels, feature adoption, DAU/MAU, in-app search (Brain/CRM) queries + zero-result rate, dashboard CTA clicks.
- API: per-endpoint metrics, rate-limit/429 metrics, queryable latency histograms.
- MCP: outcome attribution, interactive-session grouping, client-facing view, real-time alerting.
- Funnels: booking (view→slot→pay), store (view→cart→purchase).

### DATA QUALITY
Token estimate ±30-60% (heuristic divisors, `count_tokens` reconciliation never shipped); `max(p95)` mislabeled as cross-day p95; `integer` token columns overflow-prone; audit log leaks non-keyword PII; `httpRequestLogs` raw IPs + no TTL; tracking-tag IDs never validated as firing; `mcp-cleanup` unscheduled (raw events never pruned, and a late first run could delete pre-rollup events).

---

## 7. Usage Monitoring Recommendations & Event Tracking Spec (deliverables 6 + 7)

### Recommended architecture
**Adopt PostHog as the product-analytics layer; keep Sentry for errors/APM; extend the existing rollup pattern for a first-party `portal_events` spine.** Do **not** add Datadog/Mixpanel/GA4-for-portal.

| Option | Verdict | Why |
|---|---|---|
| **PostHog** | ✅ **Primary** | Self-hostable (data-residency/multi-tenant friendly), first-party event capture, funnels + retention + session replay out of the box, free tier, SQL access. Fits "compare UI vs API vs MCP" with a single event schema + `source` property. |
| **OpenTelemetry** | ✅ **For API/MCP spans** | Vendor-neutral; wrap Next route handlers + the MCP `wrapRegisterTool` chokepoint to emit spans → Sentry (already present) or an OTLP collector. Gives per-endpoint p50/p95 without a new vendor. |
| **Sentry** | ✅ **Keep** | Already wired; raise client trace sample selectively on portal routes. |
| Datadog | ❌ | Cost; overlaps Sentry+PostHog; heavy for this stage. |
| Mixpanel / GA4 | ❌ | GA4 already available *per client site*; not for first-party portal product analytics. Mixpanel duplicates PostHog. |
| Custom pipeline | ◑ **Partial** | You already *have* one for MCP — generalize it (below) rather than greenfield. |

### Event schema (standardized — one table, one `source` dimension)
Emit every event with a common envelope so UI/API/MCP are directly comparable:
```
portal_event {
  event:        string   // see catalog below
  source:       enum('ui'|'api'|'mcp'|'public')
  client_id:    bigint   // tenant
  user_id:      bigint?  // null for anon/public
  api_key_id:   bigint?  // set for api/mcp
  capability:   string   // 'cms.posts', 'crm.deals', 'booking', ...
  action:       string   // 'create'|'read'|'update'|'delete'|'publish'|'view'|'search'|'cta_click'
  object_id:    string?
  duration_ms:  int?
  success:      bool
  error_code:   string?
  props:        jsonb     // event-specific (slug, query, funnel_step, ...)
  ts:           timestamptz
}
```
Catalog (maps to the prompt's requested events):
`portal_view`, `portal_search`, `portal_cta_click`, `portal_nav`, `portal_api_request`, `portal_api_success`, `portal_api_failure`, `portal_mcp_tool_invoked`, `portal_mcp_tool_success`, `portal_mcp_tool_failure`, plus conversion events `portal_conversion` with `props.kind ∈ {booking, order, survey, contract, proposal, signup, gift_cert}`.

### Tracking architecture
1. **MCP source** — already 90% done: `wrapRegisterTool` → also emit a `portal_event{source:'mcp'}` (reuse existing write; add `capability/action` derived from tool name).
2. **API source** — one wrapper around `authorizePortal` (or Next middleware) emits `portal_api_request/success/failure` with route + status + duration. This single chokepoint also fixes the per-endpoint-metrics blind spot (H2).
3. **UI source** — thin client hook (`usePortalAnalytics`) firing `portal_view`/`portal_cta_click`/`portal_search` to PostHog **and** a batched `POST /api/portal/events`. Conversions fire server-side from the existing conversion endpoints (§2 list) so they can't be ad-blocked.
4. **Public source** — server-side emit from the 24 conversion endpoints already enumerated (booking book, checkout, survey submit, contract sign, etc.).

### Storage strategy
- **Hot path:** PostHog (cloud or self-host) for exploration/funnels/replay.
- **System-of-record:** first-party `portal_events` table (partition by month) + a `portal_event_daily_rollups` table built by **the same cron pattern as `mcp-rollup`** (`app/api/cron/mcp-rollup` is the template). Use **`bigint`** for token/count columns (fix H3 at design time).
- Retention: raw events 30-90d (scheduled cleanup — and **register it in `vercel.json` this time**), rollups forever.

### Dashboard
Extend `app/admin/mcp-usage` into `app/admin/usage` with three tabs sharing the `source` dimension:
1. **Capability usage** — matrix of capability × source (UI/API/MCP/public) × calls/trend. Answers "which capabilities are used most via UI vs API vs MCP" and "which features are never used" (zero-row = deprecation candidate).
2. **MCP outcomes** — tool → success → approved/applied funnel (closes M2).
3. **Conversions & funnels** — booking/store/survey funnels (PostHog-embedded or native).
Add a **client-facing** slice in the portal (`/portal/settings/usage`) for own-tenant MCP spend (closes M1).

### Reporting cadence
Daily rollup cron (exists); weekly stakeholder digest (reuse `claude-mem`/standup tooling or a `/api/cron` job); monthly "never-used capability" + "deprecation candidate" report driven by zero-rows in the capability matrix.

### Questions this answers
- *Most-used per channel?* → group `portal_events` by `capability,source`.
- *Never used?* → capabilities absent from the rollup over 90d.
- *Which MCP tools drive outcomes?* → MCP-outcomes funnel (tool → approved/applied).
- *What to deprecate?* → zero-usage + high-maintenance (god-file) overlap.
- *Where to invest?* → high-UI/low-API capabilities = automation/MCP candidates; high-MCP/low-UI = UI investment.

---

## 8. Prioritized Roadmap

### Quick Wins (< 1 day each)
1. **C1** Register `mcp-cleanup` in `vercel.json` (after `mcp-rollup`). *File: `vercel.json`.*
2. **H3** Migrate rollup token/count columns `integer`→`bigint` (`lib/db/schema/tools.ts` → `bun run db:generate`).
3. **H5** Extend `lib/mcp/audit-redact.ts` to redact `email|phone|guestName|contactEmail|address`; cap/hash output summaries.
4. **M4** Make `media_delete` purge S3 (or add `media_purge`).
5. **M8** Wire the email sender-defaults save endpoint (or hide the form).
6. **M6/L3** Add retention TTL + IP anonymization to `httpRequestLogs`, `abEvents`, `pitchDeckViews`.
7. **C4** Verify `app/preview/[id]` auth (check `middleware.ts`); add guard if missing.

### Medium Projects (< 1 week each)
8. **H2 + §7.2** API-source event/metric wrapper around `authorizePortal` → `portal_events` + per-endpoint p50/p95 (OTel spans → Sentry).
9. **H1 + §7.3** Portal UI analytics hook (`usePortalAnalytics`) + `POST /api/portal/events` + PostHog SDK; instrument top dashboard CTAs + Brain/CRM search.
10. **H7 + §5** Add `tickets_*`, `chat_*`, `notifications_*`, `surveys_submit_response`, `usage_get` MCP tools (use `simplerdev-mcp-tool` skill).
11. **C2** Lock down public survey CORS + add origin allowlist / rate-limit on CRM-writing public endpoints.
12. **M5** Booking + store funnel events (server-side at each step).

### Strategic Investments (> 1 week)
13. **§7 full** Unified usage pipeline: `portal_events` + daily rollups (mcp-rollup pattern) + `app/admin/usage` 3-tab dashboard + client-facing `/portal/settings/usage` (closes M1/M2/M3).
14. **Journey A** Block-patch API + MCP (`posts_patch_block`) to end the editor-vs-API asymmetry.
15. **H6** Read-parity: generate GET API routes for the ~10 RSC-only pages (or a generic read layer) so MCP/external clients see what the UI sees.
16. **PostHog rollout** with funnels/retention/replay, plus the monthly never-used / deprecation report.

---

## Appendix — Agent provenance
Five parallel read-only agents produced the underlying inventories (admin UI, public UI, API, MCP, analytics). Full per-agent tables retained in session transcript; MCP tool-by-tool table in `tool-results/bdh7yaidw.txt`. Counts verified against `tests/unit/mcp-tool-registry-baseline.test.ts` (473 tools) and route/folder enumeration.
