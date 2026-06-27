# Architecture for Agents

> **Purpose.** This document lets an AI coding agent (or a new human contributor) understand how SimplerDevelopment is structured in minutes. It covers the three audience trees, request lifecycle, tenancy model, data layer, auth, AI/RAG layer, and extension points. Read this before opening any code files. All facts are derived from authoritative in-repo sources; nothing is invented.

**See also:** [`./repository-map.md`](./repository-map.md) · [`./ai-overview.md`](./ai-overview.md) · [`./api-index.md`](./api-index.md) · [`./tool-reference.md`](./tool-reference.md) · [`./glossary.md`](./glossary.md) · [`/llms.txt`](/llms.txt)

---

## 1. What this system is

SimplerDevelopment is a **multi-tenant SaaS platform** with four integrated layers:

| Layer | What it is |
|---|---|
| Admin panel | Internal staff UI — manages all tenants, billing, AI, platform health |
| Client portal | Per-tenant UI — each client manages their own site, CRM, Brain, projects |
| Per-tenant public sites | The websites each client publishes to their own custom domain |
| API / MCP surface | REST v1 + 450-tool MCP server for automation and AI-agent integrations |

**Stack at a glance:** Next.js 16.1.1 App Router · React 19 · TypeScript 5 · Tailwind 4 · Drizzle ORM + Postgres/pgvector · NextAuth v5 (JWT strategy) · Bun (package manager and runtime). Lock file: `bun.lock` — always use `bun`, never `npm`.

**Scale:** ~357 k lines — app 157 k / lib 81 k / components 119 k.

---

## 2. The three route trees (three audiences)

There are exactly three audience trees. Every route belongs to one of them.

```
app/
├── admin/**          ← global internal staff panel (no tenant scope)
├── portal/**         ← per-tenant client UI (scoped to one tenant)
└── sites/**          ← per-tenant public sites (custom-domain rendered)
    └── (app/s/**)    ← short-form alias for the same renderer
```

### Admin (`app/admin/**`)

- **Who:** Our internal staff (`admin` / `employee` roles only).
- **Scope:** Operates across **all** tenants at once — no `clientId`/`siteId` filter unless explicitly cross-tenant viewing.
- **Auth guard:** Individual RSC pages call `requireStaffSession()` (checks `role === 'admin' || role === 'employee'`). There is **no** centralized middleware guard for this subtree — every new RSC page must add it manually.
- **API routes:** `/api/admin/**` — two sub-namespaces:
  - `/api/admin/portal/**` — cross-tenant views of portal data.
  - `/api/admin/<feature>` — platform-level (dashboard, email, agentic-os, oauth-clients, system-health).
- **Reference:** `app/admin/CLAUDE.md`

### Portal (`app/portal/**`)

- **Who:** Individual tenant clients (`client` role).
- **Scope:** Scoped to the active tenant. Tenant identity comes from the session + site-resolver — **never** from a URL query param.
- **Key invariant:** For `app/portal/websites/[siteId]/**`, the URL's `[siteId]` must be cross-checked against the resolver. Trusting the URL alone causes data leaks.
- **API routes:** `/api/portal/**` — every handler uses `authorizePortal`, derives `clientId` from the session + site-resolver, and returns the `{ success, data | error }` envelope.
- **Reference:** `app/portal/CLAUDE.md`

### Public sites (`app/sites/**` + `app/s/**`)

- **Who:** End visitors to any client's public-facing website.
- **Scope:** Resolved by the request's `Host` header — the middleware matches the host to a tenant and rewrites the request to `/sites/[domain]/[...slug]`.
- **No auth required** for public pages; the site renderer reads published content only.
- Block content is stored as JSON in `posts.content` and rendered server-side.

---

## 3. Request lifecycle

Every inbound request passes through this pipeline before a route handler runs.

```
Request arrives
      │
      ▼
middleware.ts
  ├── Dev CORS preflight (localhost:8081) → short-circuit 204
  ├── Is host an APP hostname? ─── No ──▶ Tenant site path:
  │                                         1. isPlausibleTenantHost() → 404 on bad Host
  │                                         2. resolveCustomDomain() → rewrite to /portal (agency white-label)
  │                                         3. isKnownSiteHost() DB lookup → 404 if unknown
  │                                         4. Rewrite to /sites/[domain]/[...slug]
  │                                            (sets x-site-domain, x-site-pathname headers)
  │
  ├── /portal/apps/<slug>/* → Plugin proxy handler:
  │     1. auth() — session required or redirect to login
  │     2. getPortalClient() — resolve active clientId
  │     3. loadActiveAppBySlug() + isClientEntitled()
  │     4. signPluginJwt() — mint 10-min tenancy JWT
  │     5. Set sd-plugin-tenant cookie; render iframe catch-all
  │
  └── App hostname — normal NextAuth middleware → auth check
            │
            ▼
      Route handler
        (portal handlers)
            │
            ▼
      lib/active-client.ts + site-resolver
        Derive clientId / siteId from session
            │
            ▼
      Business logic / DB query (always filtered by clientId/siteId)
            │
            ▼
      { success: true, data: ... }
      or
      { success: false, error: "..." }   ← uniform envelope; never throw naked objects
```

**Key files:**
- `middleware.ts` — host routing, CORS, plugin proxy, NextAuth passthrough
- `lib/active-client.ts` — active tenant resolution (call once per request; result is cached in the request scope)
- `lib/sites/host-resolver.ts` — DB lookup that validates custom domains

---

## 4. Tenancy model

Tenancy is the hardest constraint in the codebase. Violating it produces a data leak.

| Concept | Meaning |
|---|---|
| `clientId` | Identifies a tenant (the business using the portal) |
| `siteId` | Identifies one website belonging to a client; one client can have multiple sites |
| Scope guard | Every MCP tool calls `hasScope(ctx.scopes, ...)` before executing — missing guard = tenancy bug |
| `clientId` on every table | Every tenant-scoped DB table carries `clientId` and/or `siteId`; queries **must** filter on it |

**Rules:**
1. Never read `clientId` from a URL query param. Derive it from the session via `lib/active-client.ts`.
2. For `app/portal/websites/[siteId]/**`, cross-check the URL's `[siteId]` against the resolver.
3. Never write `if (clientId === <number>)` in route code — that belongs in `lib/branding/` or a feature flag.
4. After any data-access change, run `bun test:tenancy` (integration tenancy suite). Tenancy leaks have shipped before.

---

## 5. Data layer

### Drizzle ORM + Postgres

- **Client:** `lib/db/index.ts` — singleton Drizzle + Postgres client.
- **Schema:** `lib/db/schema/` — one file per domain (`auth`, `sites`, `cms`, `crm`, `pm`, `brain`, `store`, `email`, `surveys`, `tools`, `billing`, `approvals`, `audit`, `collab`, `trigger-links`, `ab`, `snapshots`, `workflows`, `chat`, `cronHealth`, `agenticOs`, `plugins`).
- **Import rule:** always import from `@/lib/db/schema`, never from a specific module file.
- **pgvector:** the `vector` extension must be enabled on every Postgres database. The `brain_embeddings` table uses an HNSW index managed outside Drizzle schema (see footguns below).

### Migration workflow

```
1. Edit  lib/db/schema/<domain>.ts
2. Run   bun run db:generate    → emits drizzle/<NNNN>_*.sql
3. Run   bun run db:migrate     → applies locally; auto-refuses prod URLs
4. Never hand-edit drizzle/*.sql — regenerate instead
```

**Do not hand-`ALTER TABLE`** outside of a schema edit + generated migration — DDL not in schema becomes invisible to Drizzle and creates silent drift.

### Known footguns

| Footgun | Detail |
|---|---|
| Correlated subquery interpolation | In `` sql`...` `` correlated subqueries, hard-code `table.column` for outer refs; `${table.col}` interpolation emits unqualified names and silently returns 0 |
| HNSW index on brain_embeddings | Managed via `drizzle/0061_brain_embeddings.sql`; `drizzle-kit push --force` silently drops it — never run `--force` against a DB with real brain data |
| `timestamptz` for cron/time columns | All time-tracking and cron columns must be `timestamptz`, not `timestamp` |
| Drizzle migration tracker drift | In prod the migration tracker is out-of-sync; schema changes are hand-applied against the production DB outside the deploy pipeline |

---

## 6. Auth

### NextAuth v5 (JWT strategy)

- Strategy: JWT, httpOnly cookie, 7-day max age / 1-day idle refresh.
- Cookie domain: `.example.com` in production (configured via `NEXT_PUBLIC_APP_URL`).
- Source: `lib/auth.ts`

### Login providers

| Provider | Detail |
|---|---|
| Credentials | Email + password (bcryptjs, 10 rounds); optional TOTP second factor |
| Google OAuth | Social sign-in via NextAuth Google provider |

### MFA / TOTP

- Shipped. Source: `lib/totp.ts`.
- Fields on users: `mfaEnabled`, `totpSecret`.
- Setup / verify / disable endpoints + UI at `/portal/settings/security`.
- Fail-closed, no enumeration.

### Brute-force protection

- Per-IP: 10 attempts / 15 min. Source: `lib/security/rate-limit.ts`.
- Bypass for E2E only: `DISABLE_AUTH_RATE_LIMIT=1`.

### Roles

| Role | Where |
|---|---|
| `admin` | Staff — full admin panel access |
| `employee` | Staff — admin panel access (subset of admin) |
| `client` — `admin` sub-role | Portal client with admin rights for their tenant |
| `client` — `editor` sub-role | Portal client with editor rights for their tenant |

API/MCP authorization is governed by **key scopes**, not roles.

### OAuth 2.0 server

- Full authorization-code flow. Source: `lib/oauth/server.ts`.
- RFC 8707 resource indicators.
- ~50 named scopes (`<domain>:read` / `<domain>:write`, `email:send`, `brain:approve`, `approvals:manage`). `*` wildcard grants all.
- Scope definitions: `lib/oauth/scopes.ts`.

### MCP / API key types

| Prefix | Type | Auth path |
|---|---|---|
| `sd_mcp_` | Portal API key | SHA-256 hashed in `portal_api_keys` table |
| `sd_oauth_` | OAuth 2.0 bearer token | Issued by `lib/oauth/server.ts` |
| `sd_live_` | REST v1 headless key | `lib/api-key-middleware.ts`; 60 req/min sliding window |

---

## 7. API surfaces

All surfaces share the `{ success, data | message }` response envelope.

| Surface | Base path | Auth | Notes |
|---|---|---|---|
| MCP (Streamable HTTP) | `POST /api/mcp` | `sd_mcp_` or `sd_oauth_` bearer | 450 tools; scope-gated; approval-link pattern for writes |
| REST v1 (headless, read-only) | `/api/v1/sites/{siteId}/...` | `sd_live_` bearer | OpenAPI 3.1 spec in `public/openapi.yaml`; GET only confirmed |
| Public (unauthenticated) | `/api/public/...` | None | Booking, gift cert, live chat, published content by slug, A/B events |
| Portal internal | `/api/portal/...` | Session cookie | ~60 route groups; not for third parties |
| Webhooks | `/api/webhooks/...` | Per-provider signing | Stripe, Dropbox Sign, EasyPost, Printful |
| Google / Microsoft | `/api/google-webhook`, `/api/microsoft-webhook` | OAuth signature | Workspace push notifications |

### MCP tool surface

The MCP server (`lib/mcp/server.ts`) exposes **450 tools** locked by `tests/unit/mcp-tool-registry-baseline.test.ts`. Drift (tool added/removed/renamed without updating `EXPECTED_TOOLS`) fails pre-push CI.

**Top tool families:**

| Namespace | Count | Domain |
|---|---|---|
| `brain_*` | 156 | Company Brain: notes, tasks, meetings, documents, decisions, glossary, goals, initiatives, org-units, people, playbooks, topics, RAG search |
| `kanban_*` | 39 | Board columns, cards, labels, checklists, blockers, assignees, time logs, sprints |
| `crm_*` | 34 | Contacts, companies, deals, pipelines, activities, custom fields |
| `store_*` | 28 | Products, inventory, orders, discounts, reviews, settings |
| `email_*` | 20 | Campaigns, lists, segments, subscribers, templates |
| `post_types_*` | 13 | Custom post type registry, fields, render code |
| `decks_*` | 13 | Slide decks CRUD, HTML upload |
| `posts_*` | 10 | CMS posts CRUD, fork, revisions, taxonomies |

**Approval-link pattern:** Most live-content write tools (`brain_*`, `crm_*`, CMS) mint an approval URL (`lib/mcp/approvals.ts`) instead of mutating immediately. The user clicks the URL in their browser to confirm. Metadata / draft operations mutate immediately.

**MCP resources (4):** `blocks://schema`, `brand://default`, `catalog://services`, `portal://capabilities`.

**MCP prompts (3):** `draft-page`, `triage-tickets`, `weekly-digest` — user-triggered slash-command workflows; each returns a message template, not a direct execution.

---

## 8. AI and RAG layer

All AI work lives in `lib/ai/` and `lib/brain/`. See `lib/ai/CLAUDE.md` for full detail.

### Company Brain (agent + RAG)

```
Portal request (chat or Brain agent)
      │
      ▼
lib/ai/brain-tools/classifier.ts   ← classifies intent, routes to tools
      │
      ▼
lib/ai/brain-tools/planner.ts      ← selects which Brain tools to call
      │
      ▼
executeBrainTool()                 ← calls lib/brain/* data layer
  → sanitizeToolResult()           ← strips keys/tokens/PII before LLM sees it
      │
      ▼
lib/ai/brain-tools/grounder.ts     ← checkGroundedness(); if uncertain → explicit "I don't know"
      │
      ▼
Response streamed to portal
```

### Embeddings

- Provider: OpenAI (`text-embedding-3-*`).
- Stored in `brain_embeddings` table (pgvector HNSW index).
- Used for semantic search across notes, documents, and Brain content.

### Mandatory invariants for any AI call

1. **`resolveClientApiKey(clientId, provider)`** before any Anthropic/OpenAI call. Never read `process.env.ANTHROPIC_API_KEY` directly — the resolver handles BYOK vs. platform keys with per-tenant key rotation.
2. **`checkAiPlanGate(clientId)`** before making AI calls on behalf of a client. Starter-tier clients without BYOK are rejected with 402/403. Skipping this silently bills the platform.
3. **`recordAiUsage()`** after every call (fire-and-forget, never `await` in the critical path).
4. **AI is never the source of truth.** Meeting extractions, slide edits, and Brain notes flow through the `brainAiReviewItems` human-review queue before being committed.

### Model assignments (as of 2026-06)

| Surface | Model |
|---|---|
| Brain classifier / planner / grounder | `claude-haiku-4-5-20251001` |
| Portal chatbot classifier + intent router | `claude-haiku-4-5-20251001` |
| Portal chatbot (simple route) | `claude-haiku-4-5-20251001` |
| Portal chatbot (complex route) | `claude-sonnet-4-6` |
| Portal chatbot stream (mobile) | `claude-opus-4-7` |
| Meeting transcript processor | `claude-sonnet-4-5` |
| Brain eval runner | `claude-sonnet-4-6` |
| Embeddings | OpenAI `text-embedding-3-*` |

---

## 9. Extension points

| Extension | How |
|---|---|
| **Block types** | Add to `lib/blocks/registry.ts` in lockstep across 5 files — use `simplerdev-block-type` skill, never hand-roll. Blocks are universal (never client-specific). |
| **Custom post types** | Per-tenant types with custom field schemas and editable Liquid render templates. `post_types_*` MCP tools manage the full lifecycle. |
| **CRM custom fields** | Per-client definitions + values (`crm_custom_fields_*` MCP tools). |
| **Automations / Workflows** | Rules + ReactFlow visual builder persisted to a durable Postgres queue. `automations_*` MCP tools. |
| **Plugins** | Registered apps (`lib/plugins/`) proxied at `/portal/apps/<slug>/` via a short-lived tenancy JWT (iframe handoff pattern). Entitlement-gated. |
| **Outbound webhooks** | Per-project; SSRF-guarded via `lib/ssrf-guard.ts`. |
| **MCP tools** | Add via `simplerdev-mcp-tool` skill — handler + Zod schema + scope guard + telemetry in lockstep. Baseline test must be updated. |
| **MCP resources** | Currently 4; add in `lib/mcp/tools/resources.ts`. |
| **MCP prompts** | Currently 3; add in `lib/mcp/tools/prompts.ts`. Keep small — not a mirror of the skill catalogue. |

---

## 10. Load-bearing invariants

Breaking these causes data leaks, prod 500s, or security regressions.

| # | Invariant | Why |
|---|---|---|
| 1 | `drizzle/*.sql` is generated-only. Edit `lib/db/schema/`, then `bun run db:generate`. | Hand-edits become invisible to Drizzle-kit and produce schema drift. |
| 2 | Every tenant-scoped table has `clientId` and/or `siteId`. Queries must filter on it. | Cross-tenant data leaks. |
| 3 | `clientId` comes from the session + `lib/active-client.ts`, never from a URL param. | URL params can be forged. |
| 4 | Blocks are universal. No client-specific block logic. | Client forks fragment the registry and break the renderer. |
| 5 | New block type → lockstep across 5 files via `simplerdev-block-type`. | Every block hand-rolled to date has missed at least one of the five. |
| 6 | New MCP tool → lockstep (handler + Zod schema + scope guard + telemetry) via `simplerdev-mcp-tool`. | Missing scope guard = tenancy/permission leak. Baseline test catches added/removed tools. |
| 7 | Call `resolveClientApiKey` → `checkAiPlanGate` → AI call → `recordAiUsage`, in that order. | Skipping plan gate bills the platform silently. |
| 8 | `sanitizeToolResult` before any tool result reaches the LLM context (Brain tools). | PII / API keys in the model context. |
| 9 | AI output goes through human-review queue (`brainAiReviewItems`) before committing to canonical data. | AI is not the source of truth. |
| 10 | Run `bun test:tenancy` after any data-access change. | Tenancy leaks have shipped; this catches them. |
| 11 | Run `bun test:critical` before declaring any feature complete. | Golden-path E2E gate. |
| 12 | `bun.lock` changes go through `bun add` / `bun remove`, never hand-edited. | Lock file corruption. |

---

## 11. Development commands (quick reference)

| Command | Purpose |
|---|---|
| `bun dev` | Start dev server |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` — run after any non-trivial edit batch |
| `bun test` | Vitest unit layer |
| `bun test:integration:local` | Integration tests (spins up a local DB) |
| `bun test:critical` | Critical-path E2E subset — the QA gate before shipping |
| `bun test:tenancy` | Tenancy regression suite — run after any data-access change |
| `bun run db:generate` | Generate Drizzle migration from schema changes |
| `bun run db:migrate` | Apply migrations locally (refuses prod URLs) |

---

## 12. Navigation for agents

When you need to work in a specific area, read the nearest `CLAUDE.md` before opening any files.

| Area | Read first | Then |
|---|---|---|
| Portal pages / tenant UI | `app/portal/CLAUDE.md` | `docs/guides/USER_MANAGEMENT.md` |
| Admin panel | `app/admin/CLAUDE.md` | — |
| Public sites / renderer | `app/sites/**` (no nested CLAUDE.md; follow `app/portal/CLAUDE.md` patterns) | — |
| Block registry / schemas | `lib/blocks/CLAUDE.md` | `docs/guides/BLOCK_EDITOR_GUIDE.md` |
| Visual editor | `components/portal/visual-editor/CLAUDE.md` | — |
| DB schema / migrations | `lib/db/CLAUDE.md` | `docs/guides/DATABASE.md` |
| MCP server / tools | `lib/mcp/CLAUDE.md` | `docs/api/` |
| AI / Company Brain | `lib/ai/CLAUDE.md` | `lib/brain/` |
| Tests / coverage | `tests/CLAUDE.md` | `tests/CI-GATES.md` |
| Auth / roles | `docs/guides/USER_MANAGEMENT.md` | `lib/auth.ts` |
| Tenancy middleware | `middleware.ts`, `lib/active-client.ts` | — |
| Domain maps / ADRs / specs | `vault/03 - Domains/` | `vault/05 - Feature Specs/` |

**For cross-cutting "how does X work" questions:** prefer `graphify-out/` (when fresh) over grep. Otherwise spawn an `Explore` subagent — do not pull large files into the main context.

**For historical decisions and past session context:** use `claude-mem` (query via `/mem-search`).

---

*Document source: `CLAUDE.md`, `app/portal/CLAUDE.md`, `app/admin/CLAUDE.md`, `lib/blocks/CLAUDE.md`, `lib/mcp/CLAUDE.md`, `lib/db/CLAUDE.md`, `lib/ai/CLAUDE.md`, `vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md`, `middleware.ts`, `.claude/index.md`. Last updated 2026-06-27.*
