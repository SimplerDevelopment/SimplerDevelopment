---
type: sales-collateral
audience: technical-buyer, solutions-engineer, enterprise-architect
status: internal-draft
date: 2026-06-27
sources: docs/agents/architecture-for-agents.md, FEATURE-INVENTORY-api-mcp.md, FEATURE-INVENTORY-domains.md
---

# Technical Architecture

> Internal draft. All claims are grounded in the current codebase. Intended for solutions engineers and technical buyers, not for verbatim publication.

---

## Platform Overview

SimplerDevelopment is a **multi-tenant agency SaaS platform** that consolidates website publishing, CRM, project management, AI knowledge management, e-commerce, email marketing, scheduling, and developer automation into a single system. Each tenant operates in full isolation: their data, sites, AI knowledge base, and credentials are scoped by an immutable `clientId` derived from the authenticated session.

The platform is approximately 357,000 lines of TypeScript across application routes, library code, and component layers.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.1 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Language | TypeScript 5 |
| ORM | Drizzle ORM |
| Database | PostgreSQL + pgvector extension |
| Auth | NextAuth v5 (JWT strategy) |
| Runtime / Package manager | Bun |
| Realtime collaboration | Yjs CRDT over WebSocket (standalone Railway service) |
| AI embeddings | OpenAI `text-embedding-3-*` |
| AI inference | Anthropic Claude (Haiku / Sonnet / Opus tiers, surface-dependent) |
| Email delivery | Resend |
| Payments | Stripe (Checkout + webhooks) |
| E-signature | Dropbox Sign |
| Shipping | EasyPost |
| License | Apache 2.0 |

---

## Three-Tier Route Architecture

Every route in the system belongs to exactly one of three audience trees. This is a hard architectural invariant — routes do not cross trees.

```
app/
├── admin/**     — internal staff panel (cross-tenant, staff roles only)
├── portal/**    — per-tenant client UI (scoped to one tenant)
└── sites/**     — per-tenant public-facing websites (custom-domain rendered)
    └── (app/s/** — short alias)
```

### Admin tier

The internal staff panel operates across all tenants simultaneously. It provides billing management, client provisioning, AI-credit administration, OAuth client management, and system health monitoring. Access requires a staff-level session (`admin` or `employee` role). There is no publicly accessible URL for this tier.

### Portal tier

Each tenant client manages their account through an isolated portal instance. The active tenant is resolved from the session — never from a URL parameter — ensuring that a tenant cannot access another tenant's data by manipulating a URL. The portal covers all product domains: CMS, CRM, Brain, projects, email, store, bookings, surveys, decks, automations, branding, and integrations.

### Public sites tier

Per-tenant websites render on each client's custom domain. Incoming requests to an unknown or unregistered host return a 404. The middleware resolves the `Host` header to a `siteId`, rewrites the request to the shared site renderer, and serves published block content server-side. No authentication is required for public site visitors.

---

## Request Pipeline

Every inbound request passes through a single `middleware.ts` before any route handler runs:

1. **CORS preflight** — short-circuited for local development origins.
2. **Host resolution** — if the request hostname is not the platform's own domain, it is treated as a tenant custom domain. A valid domain resolves to a `siteId` and rewrites to the sites renderer. An unrecognized host returns 404.
3. **Plugin proxy** — portal plugin routes (`/portal/apps/<slug>/*`) authenticate the session, resolve the tenant, verify entitlement, mint a short-lived HMAC-signed tenant JWT, and render an iframe shell.
4. **NextAuth passthrough** — all other app-domain requests proceed through the NextAuth session check.
5. **Route handler** — portal handlers call `authorizePortal`, derive `clientId` from the session via `lib/active-client.ts`, execute business logic with the `clientId` filter applied, and return a `{ success, data | error }` envelope. This envelope is uniform across all API surfaces.

---

## Data Layer

### PostgreSQL + Drizzle ORM

All application state is stored in PostgreSQL. The schema is managed entirely through Drizzle ORM migrations generated from TypeScript schema files in `lib/db/schema/` — one file per domain (`auth`, `sites`, `cms`, `crm`, `pm`, `brain`, `store`, `email`, `surveys`, `billing`, `approvals`, `audit`, and others). Hand-editing generated SQL is prohibited; schema changes always go through the `db:generate` → `db:migrate` pipeline.

**Tenancy enforcement:** Every tenant-scoped table carries a `clientId` and/or `siteId` column. All queries must filter on these. The constraint is validated by the tenancy integration test suite.

### pgvector (Semantic Search)

The `vector` PostgreSQL extension (pgvector) must be enabled on every database. The `brain_embeddings` table stores OpenAI embedding vectors indexed with an **HNSW index** for approximate nearest-neighbor search. This powers the Company Brain's semantic search across notes, documents, meeting transcripts, decisions, and glossary entries.

---

## AI and RAG Layer

### Company Brain

The Company Brain is a per-tenant AI knowledge base with a multi-stage agent pipeline:

1. **Classifier** — routes the user's question to the appropriate tool or domain.
2. **Planner** — selects which Brain data tools to call.
3. **Tool execution** — calls `lib/brain/*` data layer; all results are sanitized (`sanitizeToolResult`) before entering the LLM context.
4. **Grounder** — checks response groundedness. If the model cannot ground its answer in retrieved data, it returns an explicit "I don't know" rather than hallucinating.
5. **Human-review queue** — AI-generated content (meeting extractions, note proposals) enters `brainAiReviewItems` before being committed to canonical data. AI is not the source of truth.

**BYOK support:** Tenants can supply their own Anthropic or OpenAI API keys. Key resolution (`resolveClientApiKey`) selects the appropriate key per tenant. An AI plan gate (`checkAiPlanGate`) is enforced before every AI call; tenants without an eligible plan or BYOK key receive a 402/403 rather than silently consuming platform credits.

### Model Assignments (as of June 2026)

| Use case | Model |
|---|---|
| Brain classifier / planner / grounder | Claude Haiku 4.5 |
| Portal chatbot (simple route) | Claude Haiku 4.5 |
| Portal chatbot (complex route) | Claude Sonnet 4.6 |
| Meeting transcript processor | Claude Sonnet 4.5 |
| Embeddings | OpenAI text-embedding-3-* |

---

## API and Automation Surface

### MCP Server (450 Tools)

The platform exposes a **Model Context Protocol (MCP) server** at `POST /api/mcp` with **450 tools** spanning all product domains. The tool count is locked by a baseline test that fails on any undocumented addition, removal, or rename.

**Top tool namespaces by count:**

| Namespace | Tools | Domain |
|---|---|---|
| `brain_*` | 156 | Company Brain — knowledge, decisions, playbooks, RAG |
| `kanban_*` | 39 | Project boards, sprints, cards, time logs |
| `crm_*` | 34 | Contacts, companies, deals, pipelines, proposals, contracts |
| `store_*` | 28 | Products, inventory, orders, discounts |
| `email_*` | 20 | Campaigns, lists, segments, subscribers |
| `post_types_*` | 13 | Custom content type registry |
| `decks_*` | 13 | Slide decks, HTML import |
| `posts_*` | 10 | CMS posts, revisions, taxonomies |

This surface enables AI coding agents, workflow automation tools, and custom integrations to operate across the full platform through a single authenticated endpoint.

### REST v1 API (Read-Only, Headless)

A versioned headless API at `/api/v1/sites/{siteId}/...` is available for third-party integrations. It exposes read-only access to posts, pages, categories, tags, media, block content, products, product categories, branding, navigation, and site config. An **OpenAPI 3.1 specification** (`public/openapi.yaml`, 1,590 lines) covers this surface.

**Rate limit:** 60 requests/minute per key.

### Public API (Unauthenticated)

`/api/public/...` provides unauthenticated access to booking availability, gift certificate redemption, live chat, published content by slug, and A/B event recording. This is the surface consumed by public site visitors.

---

## Extensibility

| Extension mechanism | How it works |
|---|---|
| **Block types** (48 built-in) | Add to the universal block registry in lockstep across 5 files. Blocks are universal — never client-specific — so the renderer handles all content uniformly. |
| **Custom post types** | Per-tenant content types with custom field schemas and editable Liquid render templates, managed via `post_types_*` MCP tools. |
| **CRM custom fields** | Per-tenant field definitions and values (`crm_custom_fields_*` MCP tools). |
| **Automations** | Event-driven rules with natural-language creation. A visual workflow builder (ReactFlow canvas, durable Postgres queue, exponential-backoff retries) is in active development. |
| **Plugins** | Independently-deployed Next.js applications embed inside the portal via an HMAC-JWT proxy at `/portal/apps/<slug>/`. Entitlement-gated per tenant. |
| **Browser extension** | MV3 extension for page capture, CRM record creation, and Brain note logging from any web page. |
| **Outbound webhooks** | Per-project webhooks with SSRF protection. |
| **Inbound webhooks** | Stripe, Dropbox Sign, EasyPost, Printful, Google Workspace, Microsoft 365. |

---

## Deployment Topology

### Hosted (Standard)

The application tier runs on **Vercel** (or any Next.js-compatible host). Every branch push other than `main` deploys as a Preview environment automatically.

The database tier runs on **PostgreSQL** — compatible with Railway, Neon, Supabase, or any self-managed Postgres. Each environment (production, staging, preview) maintains its own isolated database. The `vector` (pgvector) extension must be enabled on all databases.

Real-time collaboration (Yjs CRDT for the visual editor and pitch deck editor) runs on a **dedicated WebSocket server** deployed on Railway.

### Self-Hosted

The Apache 2.0 license permits self-hosted deployments without restriction. Self-hosters provision their own Postgres instance (with pgvector), connect a compatible Next.js host, and configure the optional Railway WebSocket service for real-time collaboration. Environment variables wire together external services (Stripe, Resend, Google OAuth, Anthropic/OpenAI keys).

**Note for self-hosters:** The platform's cookie domain is configurable via `NEXT_PUBLIC_APP_URL`. Multi-domain tenant routing requires DNS wildcard or per-domain CNAME configuration pointing to the host.

---

## Known Architectural Boundaries

The following are explicitly scoped for future releases and are not current capabilities:

- **MCP-specific rate limiting** — currently not documented or enforced separately from per-IP auth limits.
- **Full DB-lookup host-header validation at the edge** — deferred to a future wave; current middleware does not perform a database lookup on every request for unrecognized hosts.
- **Visual workflow builder on `main`** — the durable Postgres-backed workflow builder shipped to the `dev` branch as of June 2026; it is pending staging migration before merging to `main`.
- **Scheduled campaign dispatcher** — email campaigns can be scheduled but the automated send dispatcher cron is not yet active.
- **SDK / client library** — no npm package or generated SDK is currently available. Buyers integrate directly against the MCP server or the OpenAPI-described REST v1 surface.
