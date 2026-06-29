---
type: feature-inventory
subtype: api-mcp-surface
date: 2026-06-27
sources: lib/mcp/, lib/oauth/, lib/auth.ts, app/api/, public/openapi.yaml, docs/api/
status: draft
---

# API + MCP Capability Surface

Developer-facing inventory for the OSS / dev-platform readiness leg of the launch mission.

## 1. MCP Tools

- **Endpoint:** `POST /api/mcp` — MCP Streamable HTTP (not SSE). Route at `app/api/mcp/`.
- **Credentials:** `sd_mcp_` portal API keys (SHA-256 hashed in `portal_api_keys`) and `sd_oauth_` OAuth 2.0 tokens (`lib/oauth/server.ts`, RFC 8707 audience binding).
- **Scope model:** per-tool `hasScope(ctx.scopes, ...)` guard in every registrar — a missing guard is a tenancy bug caught by the baseline test. ~50 named scopes (`<domain>:read`/`:write` + `email:send`, `brain:approve`, `approvals:manage`), `*` wildcard grants all. Unscoped: `whoami`, `list_workflows`, `get_workflow`.
- **Tool count:** **450 tools** under `*` scope, locked by `tests/unit/mcp-tool-registry-baseline.test.ts` (drift fails pre-push). Grew ~3.4x from a prior 131 baseline.

### Tool families (largest first)
| Namespace | Count | What |
|---|---|---|
| `brain_*` | 156 | Company Brain: notes, tasks, meetings, documents (versions/acks/required-reads), decisions, glossary, goals, initiatives, org-units, people+expertise, playbooks+runs, review queue, saved searches, topics tree, RAG search, CRM read-lens |
| `kanban_*` | 39 | columns, cards, labels, checklists, blockers, assignees, files, time logs, templates, recurrences, sprint proposals |
| `crm_*` | 34 | contacts, companies, deals, pipelines+stages, activities, deal comments+artifacts, custom fields+values, saved views, scoring rules |
| `store_*` | 28 | products+variants+options, inventory, categories, orders, discounts, customer messages, reviews, settings, analytics |
| `email_*` | 20 | campaigns, lists, segments, subscribers, templates, analytics |
| `post_types_*` | 13 | custom post type registry + per-type fields + render code/Liquid template |
| `decks_*` | 13 | decks CRUD, slides, HTML upload/zip, analytics |
| `posts_*` | 10 | CMS posts CRUD, fork, HTML upload, revisions, taxonomy |
| `projects_*` | 8 | projects CRUD, artifacts, members, suggested projects |
| `booking_pages_*`/`bookings_*` | 9 | booking pages + records, cancel, analytics |
| `branding_*` | 9 | brand profiles CRUD, messaging, contrast, audit |
| `block_templates_*`/`surveys_*` | 7 each | reusable blocks; survey builder |
| `nav_*`/`tickets_*`/`website_*` | 6 each | nav tree; tickets; per-site domains+env vars |
| `automations_*`/`media_*`/`sites_*`/`chat_*`/`proposals_*` | ~5 each | |
| `team_*`/`ai_*`/`approvals_*`/`linkedin_*`/`contracts_*`/`sprints_*` | 4 each | |
| `taxonomies_*`/`service_*`/`billing/invoices_*` | ~3 each | |
| `hosting_*`/`integrations_*`/`gift_certificates_*`/`profile_*`/`client_*`/`notifications_*` | 2 each | |

### MCP resources / prompts
- **Resources (4):** `blocks://schema`, `brand://default` (branding:read), `catalog://services` (services:read), `portal://capabilities`.
- **Prompts (3):** `draft-page` (sites:write), `triage-tickets` (tickets:read), `weekly-digest` (projects:read).
- **Approval-link pattern:** most live-content write tools mint an approval URL (`lib/mcp/approvals.ts`) for human click-through; metadata/draft ops mutate immediately.

## 2. REST API Surface
All surfaces share `{ success, data | message }` envelope.

- **REST v1 (headless, authed):** `/api/v1/sites/{siteId}/...`, `sd_live_` Bearer key (`lib/api-key-middleware.ts`), 60 req/min sliding window, CORS `*`, rate-limit headers on 429. **Read surface** — posts, pages, categories, tags, media, blocks, products, product-categories, branding, config, navigation (all GET; no write routes confirmed).
- **Public (unauthed):** `/api/public/...` — booking availability/requests, gift cert redemption, live-chat, published content by slug, A/B event recording.
- **Portal internal (session cookie):** `/api/portal/...` — ~60 route groups (`authorizePortal`, clientId from session + site-resolver). Not for third parties.
- **Other:** `/api/mcp`, `/api/stripe`, `/api/webhooks/{dropbox-sign,easypost,printful}`, `/api/google-webhook`, `/api/microsoft-webhook`, `/api/cron/`, `/api/health`, `/api/extension/`.

## 3. Auth
- **NextAuth v5**, JWT strategy (`lib/auth.ts`), httpOnly cookie, 7-day maxAge / 1-day idle refresh. Cookie domain `.simplerdevelopment.com` in prod (see middleware self-host blocker in OSS audit).
- **Providers:** Credentials (bcryptjs, 10 rounds) + optional TOTP; Google OAuth.
- **MFA/TOTP:** shipped — `lib/totp.ts`, `mfaEnabled`/`totpSecret` on users; setup/verify-and-enable/disable endpoints; UI `/portal/settings/security`. Fail-closed, no enumeration.
- **Brute-force:** per-IP 10 attempts / 15 min (`lib/security/rate-limit.ts`), `DISABLE_AUTH_RATE_LIMIT=1` for E2E only.
- **Roles:** portal `admin`/`editor`; MCP/API governed by key scopes.
- **OAuth 2.0 server:** full auth-code flow (`lib/oauth/server.ts`), RFC 8707 resource indicators, scopes in `lib/oauth/scopes.ts`.

## 4. Extensibility points
- **Block registry** (`lib/blocks/registry.ts`) — 47 built-in types; new types via `simplerdev-block-type` lockstep across 5 files. `emailOnly` flag filters the email picker.
- **Custom post types** — per-tenant types with custom field schemas + editable render code/Liquid template (`post_types_*`).
- **CRM custom fields** — per-client definitions + values.
- **Automations/Workflows** — rules + ReactFlow visual builder (durable Postgres queue).
- **Outbound project webhooks** — SSRF-guarded (`lib/ssrf-guard.ts`), per project.
- **Inbound webhooks** — Stripe, Dropbox Sign, EasyPost, Printful, Google, Microsoft.

## 5. Gaps vs a public dev-platform baseline
| Gap | Status |
|---|---|
| OpenAPI spec | EXISTS — `public/openapi.yaml` (OpenAPI 3.1, 1590 lines) covers v1 REST only |
| Public/Portal API in spec | Gap — not covered |
| SDK / client library | **Missing** — no npm package, no generated SDK |
| API changelog / versioning | **Missing** |
| MCP-specific rate limiting | Not documented/confirmed |
| Public OAuth app self-serve console | `/api/portal/oauth-clients` exists; no public dev console |
| Webhook delivery guarantees | Project webhooks lack retry/signing-secret/delivery-log (in scanned file) |
| API docs site | `docs/api/` reference exists (auth, cms, media, blocks, commerce, site-config + MCP) but not obviously published |

**Bottom line:** highly machine-actionable via 450 MCP tools + v1 OpenAPI; main dev-platform gaps are no SDK, no API changelog, no public OAuth console, and OpenAPI coverage limited to v1 REST.
