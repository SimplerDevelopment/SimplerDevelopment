# AI Overview — SimplerDevelopment

> Agent / LLM entry point. Factual, no marketing copy. Status flags are accurate as of 2026-06-27.
> Cross-links: [glossary](./glossary.md) · [architecture](./architecture-for-agents.md) · [repository map](./repository-map.md) · [API index](./api-index.md) · [tool reference](./tool-reference.md) · [workflow reference](./workflow-reference.md) · [/llms.txt](/llms.txt)

---

## What This Is

SimplerDevelopment is a multi-tenant agency SaaS platform built on Next.js 16.1.1 (App Router) + Postgres. A single deployment serves three audiences from one monorepo: an internal agency-admin panel, a per-tenant client portal, and per-tenant public-facing websites. The platform covers content management (48+ block types, visual editor, custom post types), CRM (contacts/companies/deals/proposals/contracts), Company Brain AI knowledge base with RAG (notes, decisions, documents, goals, playbooks, org chart, semantic search), marketing (email campaigns, surveys, pitch decks, A/B testing), commerce (white-label storefront, bookings/scheduling), project management (kanban, sprints, tickets), automations (event-driven rules + visual workflow builder), and Stripe billing — all under a single MCP surface of 450 tools. It is not a no-code builder; every tenant customization happens through structured JSON (blocks, post types, branding profiles) rather than freeform HTML.

---

## Core Purpose

The platform lets a software agency operate its own back office and deliver white-label digital infrastructure to its clients. The agency admin provisions tenants, manages billing, and monitors the whole system. Each client (tenant) gets a portal where they manage their own website(s), CRM, knowledge base, projects, email campaigns, store, and bookings. The agency and its clients can also drive the entire platform programmatically via the MCP tool surface or the REST v1 API.

---

## Target Audiences

| Audience | Where they live | What they do |
|---|---|---|
| **Agency admin** | `app/admin/**` | Provisions tenants, manages billing, reviews MCP approvals, monitors platform health |
| **Client (tenant user)** | `app/portal/**` | Manages their site, CRM, Brain, projects, email, store, bookings |
| **Public visitor** | `app/sites/**`, `app/s/**`, `app/book/**` | Views published content, submits forms, books appointments, shops |
| **Developer / AI agent** | `/api/mcp`, `/api/v1/` | Drives the platform programmatically via MCP tools or REST API |

Portal users have one of two roles within their tenant: `admin` or `editor`. Scope-guarded MCP/API tokens carry named scopes (`brain:read`, `crm:write`, etc.) that restrict access at the tool level.

---

## Open-Source vs Hosted-SaaS Value Props

**Self-hosted / open-source:**
- Full control over Postgres schema (Drizzle ORM, migrations in `drizzle/`), hosting topology (Vercel or any Next.js host), and data residency.
- pgvector extension required on every database for Company Brain embeddings.
- BYOK (Bring Your Own Key) supported for AI providers and Stripe.
- The dev branch relaxes type/lint gates to allow fast iteration; `main`/`staging` enforce strict hooks.

**Hosted SaaS:**
- Agency-managed deployment; clients get a portal without any infrastructure concern.
- Stripe billing for à-la-carte module subscriptions, AI credit packs, and per-seat pricing.
- White-label: custom portal domain, color/typography overrides, agency branding (Scale tier only; sub-account resale UI not yet built).
- Scale-tier features are entitlement-gated via the billing module; individual modules can be toggled per tenant.

---

## AI and MCP Capabilities

### MCP Surface

The platform exposes a **Model Context Protocol (MCP)** endpoint at `POST /api/mcp` (Streamable HTTP). Under a wildcard scope, **450 tools** are available across all product domains. The tool count is locked by a baseline test (`tests/unit/mcp-tool-registry-baseline.test.ts`) — any drift fails the pre-push hook.

See [tool reference](./tool-reference.md) for the full list. The largest families:

| Namespace | Count | Domain |
|---|---|---|
| `brain_*` | 156 | Company Brain / RAG |
| `kanban_*` | 39 | Projects and kanban |
| `crm_*` | 34 | CRM |
| `store_*` | 28 | Commerce |
| `email_*` | 20 | Email campaigns |
| `post_types_*` | 13 | Custom post types |
| `decks_*` | 13 | Pitch decks |
| `posts_*` | 10 | CMS posts |

MCP auth: `sd_mcp_` portal API keys (SHA-256 hashed) or `sd_oauth_` OAuth 2.1 tokens (RFC 8707 audience binding, PKCE). ~50 named scopes control per-tool access.

**MCP resources (4):** `blocks://schema`, `brand://default`, `catalog://services`, `portal://capabilities`.

**MCP prompts (3):** `draft-page`, `triage-tickets`, `weekly-digest`.

**Approval-link pattern:** live-content write tools mint a tokenized URL (`/approve/[token]/`) for human click-through before content goes live. Metadata/draft operations mutate immediately without an approval step.

### Company Brain / RAG

Company Brain is a per-tenant AI knowledge base. Core data types: notes, decisions, documents (with version history and required-read acknowledgments), tasks, meetings, people, goals, initiatives, playbooks (with run history), glossary, topics tree, org chart, and relationships. Semantic search uses OpenAI embeddings stored in pgvector. The Brain agent combines intent classification, planning, a tool execution loop, and groundedness checks.

A separate **Portal AI assistant** handles cross-domain actions (CMS, CRM, projects) through a tool-based chat interface.

**Status:** Embedding pipeline is async and can lag note creation. Voice assistant meeting-mode integration is built but dormant — the widget is not mounted in the portal layout.

### REST API

- **`/api/v1/`** — headless, Bearer `sd_live_` key, 60 req/min, CORS `*`. Read-only surface confirmed (posts, pages, categories, tags, media, blocks, products, branding, navigation). OpenAPI 3.1 spec at `public/openapi.yaml` (1590 lines, v1 only).
- **`/api/public/`** — unauthenticated. Booking availability, gift certificate redemption, live chat, A/B event recording, published content by slug.
- **`/api/portal/`** — session-cookie auth, internal use only, not for third parties.

See [API index](./api-index.md) for route groups. Known gaps: no SDK, no API changelog, no public OAuth developer console, OpenAPI coverage limited to v1 REST.

---

## Integrations

| Integration | Purpose | Status |
|---|---|---|
| **Google Workspace** | Gmail push/sync, Drive polling, Calendar availability, Contacts sync | Active — user-level tokens; org-level connection not yet populated |
| **Microsoft 365 / Teams** | Transcript ingestion via Graph change notifications | Active — BYO-app credentials phase 3+ |
| **Stripe** | Subscriptions, Checkout, webhooks, BYOK payment processing per tenant | Active |
| **Resend** | Transactional + campaign outbound email | Active |
| **Cloudflare Email Worker** | Inbound email routing to Brain review queue | Active |
| **Dropbox Sign** | E-signature on CRM contracts (embedded + per-signer links) | Active |
| **EasyPost** | Live shipping label generation for storefront orders | Active — no integration tests |
| **Printful** | Print-on-demand fulfillment | Active — no integration tests |
| **Zoom** | Meeting link generation for bookings | Token-only; no calendar write-back |
| **OpenAI** | Embeddings (Brain RAG), AI generation (canvas, slides, content) | Active |
| **Upstash Redis** | Auth rate limiting (fail-open) | Active |

Publishing channels: email only is built. Social and webhook publishing channels are not yet implemented.

---

## Extensibility

| Extension point | Mechanism |
|---|---|
| **Block types** | Add to `lib/blocks/registry.ts` + 4 lockstep files via `simplerdev-block-type` skill. 47 built-in types; universally available to all tenants. |
| **Custom post types** | Per-tenant types with custom field schemas + editable Liquid render templates (`post_types_*` MCP tools). |
| **CRM custom fields** | Per-tenant field definitions + values via `crm_custom_fields_*` and `crm_custom_field_values_*` tools. |
| **Automations** | Event-driven rules (NLP creation) + ReactFlow visual workflow builder (durable Postgres queue, exponential-backoff retries). |
| **Plugins** | Federation: independently-deployed Next.js apps embed under `/portal/apps/<slug>/` via HMAC-JWT proxy. |
| **Outbound webhooks** | Per-project SSRF-guarded webhooks (no retry/signing-secret/delivery-log yet). |
| **Inbound webhooks** | Stripe, Dropbox Sign, EasyPost, Printful, Google, Microsoft. |

---

## Self-Host vs Hosted Topology

```
Next.js app  →  Vercel (or any Next.js host)
                  ↓
             Postgres + pgvector  (Railway / Neon / Supabase / self-hosted)
             Yjs WebSocket server (Railway — for visual editor + pitch deck collaboration)
```

- Production branch: `main`. All other branches deploy as Previews automatically.
- Each environment has its own isolated Postgres. Never share a database between environments.
- `DATABASE_URL` must point at the correct DB before running any migration or `psql` command.
- pgvector (`vector` extension) is required on every database — Company Brain embeddings will fail without it.

See [architecture](./architecture-for-agents.md) and [repository map](./repository-map.md) for the full directory layout and route-tree breakdown.
