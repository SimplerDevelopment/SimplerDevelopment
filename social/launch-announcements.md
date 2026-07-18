# Launch Announcements

> Drafts for maintainer (@yourhandle) to review and post. Replace all placeholder handles
> with real ones before posting. All facts verified against inventory as of 2026-06-27.

---

## GitHub — Release notes (v1.0 / initial public release)

> Tone: technical, release-note style. Readers are developers evaluating whether to
> self-host or contribute.

---

### SimplerDevelopment — Initial public release

**Multi-tenant agency SaaS platform. Apache-2.0. Self-hostable.**

This is the initial open-source release of a production codebase: a single Next.js 16.1.1 monorepo that serves a global agency-admin panel, per-tenant client portals, and per-tenant public-facing websites from one deployment.

#### What ships in this release

**Platform surface**
- 22 product domains: websites + CMS, visual block editor, CRM, Company Brain (RAG), kanban + sprints + tickets, email campaigns, bookings + scheduling, storefront + commerce, surveys, pitch decks, event-driven automations, e-sign + approval queue, branding, Stripe billing, auth + TOTP/MFA, Google Workspace integration, A/B testing, live chat, plugin federation.
- 47 built-in block types stored as typed JSON in `posts.content`.
- Visual block editor: iframe preview + Yjs CRDT real-time collaboration + postMessage protocol between host shell and preview frame.
- Company Brain AI knowledge base: notes, decisions, versioned documents, tasks, meetings, people, goals, initiatives, playbooks, glossary, topic tree, org chart — semantic search via OpenAI embeddings + pgvector.

**MCP server**
- 450 MCP tools at `POST /api/mcp` (Streamable HTTP) across all product domains.
- Tool families: `brain_*` (156), `kanban_*` (39), `crm_*` (34), `store_*` (28), `email_*` (20), `post_types_*` (13), `decks_*` (13), and more.
- Auth: `sd_mcp_` portal API keys (SHA-256 hashed) or `sd_oauth_` OAuth 2.1 tokens (RFC 8707 + PKCE).
- ~50 named scopes (`brain:read`, `crm:write`, `email:send`, etc.); `*` wildcard grants all tools.
- 4 MCP resources: `blocks://schema`, `brand://default`, `catalog://services`, `portal://capabilities`.
- 3 MCP prompts: `draft-page`, `triage-tickets`, `weekly-digest`.
- Approval-link pattern: live-content write tools mint a tokenized `/approve/[token]/` URL; content is not published until a human clicks through.
- Tool count is locked by `tests/unit/mcp-tool-registry-baseline.test.ts` — drift fails the pre-push hook.

**REST API**
- `/api/v1/` — Bearer `sd_live_` key, 60 req/min, CORS `*`. OpenAPI 3.1 spec at `/openapi.yaml` (1590 lines). Read surface: posts, pages, categories, tags, media, blocks, products, branding, navigation.
- `/api/public/` — unauthenticated: booking availability, gift certificate redemption, live chat, A/B event recording, published content by slug.

**Auth + security**
- NextAuth v5 (App Router), JWT strategy.
- TOTP/MFA: enroll at Portal → Settings → Security. Disable requires password re-verification (fail-closed).
- Brute-force protection: 10 attempts / 15 min via Upstash Redis.
- AES-256-GCM encryption for BYOK AI and Stripe keys.

**Integrations**
- Google Workspace (Gmail push/sync, Drive change polling, Calendar availability, Contacts sync)
- Microsoft 365/Teams (transcript ingestion via Graph change notifications)
- Stripe (subscriptions, Checkout, webhooks, BYOK per-tenant)
- Resend (transactional + campaign email)
- Cloudflare Email Worker (inbound email → Brain review queue)
- Dropbox Sign (e-signatures on CRM contracts)
- EasyPost (live shipping labels)
- Printful (print-on-demand fulfillment)
- Zoom (meeting link generation for bookings)
- OpenAI (embeddings, AI generation)

**Known gaps in this release**
- SDK / npm client library: not built.
- Social and webhook publishing channels: email only.
- Visual workflow builder: on dev branch; not merged to main.
- API changelog: not built.

#### Stack
Next.js 16.1.1 · React 19 · TypeScript 5 · Tailwind CSS 4 · Drizzle ORM · Postgres + pgvector · NextAuth v5 · Bun · Vitest · Playwright · Yjs · Stripe · Resend

#### Self-host in 5 minutes
See [README.md → Quick start](./README.md#quick-start). Requires Postgres with the `pgvector` extension. Docker Compose file included.

---

## Product Hunt

> Tone: punchy, benefits-first, scannable. Tagline ≤60 chars.

---

**Name:** SimplerDevelopment

**Tagline:** Open-source agency SaaS with a 450-tool AI agent API

**Description (≤260 chars):**
One self-hostable platform gives each client a website, CRM, AI knowledge base, email campaigns, bookings, and a storefront. Drive everything with 450 MCP tools so Claude, Cursor, or any AI agent can operate the whole system.

**Topics:** Open Source, Developer Tools, Agency, CRM, Artificial Intelligence

**Links:**
- GitHub: `https://github.com/DanielPCoyle/simplerdevelopment2026`

---

### First comment (expand technical depth)

Hey PH — builder here. A few things I'd want to know before upvoting:

**What it actually is:** A Next.js monorepo you self-host that serves three audiences from one deployment: your own admin panel, per-tenant client portals, and per-tenant public websites. Think "open-source alternative to the usual stack of a site builder + CRM + email tool + booking app + knowledge base" — minus the 5 separate subscriptions and 5 separate API integrations.

**The MCP angle:** The platform exposes 450 tools at a single `POST /api/mcp` endpoint. You connect Claude.ai (or Claude Desktop, or Cursor, or a custom agent) once via OAuth 2.1, and you can build pages, manage CRM records, send campaigns, and operate the whole system in natural language. The tool count is enforced by a test that fails the pre-push hook if anything drifts.

**The AI knowledge base:** "Company Brain" is a per-tenant RAG knowledge base: notes, decisions, versioned documents, playbooks, goals, org chart. Semantic search is OpenAI embeddings stored in pgvector. 156 of the 450 MCP tools live in that namespace alone.

**Honest gaps:** No SDK yet, no API changelog, no visual workflow builder on main (it's on dev), and the voice assistant is built but not wired up. Self-hosting requires Postgres + the pgvector extension — Docker Compose is included.

Apache-2.0. BYOK for AI providers and Stripe. Happy to answer technical questions here.

---

## Hacker News — Show HN

> Tone: understated, technical, no marketing language. No adjectives.
> Title ≤80 chars. Body states what it is and why it was built; links to README.

---

**Title:**
`Show HN: SimplerDevelopment – open-source multi-tenant agency SaaS with MCP server`

**Body:**

I open-sourced the production codebase behind a multi-tenant agency platform I've been building. Apache-2.0.

**What it is:**
A single Next.js 16.1.1 monorepo that serves three route trees from one deployment:
- `app/admin/` — internal agency admin panel
- `app/portal/` — per-tenant client portals (CRM, brain, projects, email, store, bookings)
- `app/sites/` — per-tenant public websites (block-based SSR renderer)

**The MCP piece:**
The platform ships an MCP (Model Context Protocol) server at `POST /api/mcp`. Under a wildcard scope, 450 tools are available covering all product domains. The tool count is locked by a baseline test that runs on every push. Auth is OAuth 2.1 with PKCE or SHA-256-hashed API keys; ~50 named scopes for per-tool access control.

Tool families: `brain_*` (156 — AI knowledge base), `kanban_*` (39), `crm_*` (34), `store_*` (28), `email_*` (20), and more.

**Company Brain:**
Per-tenant AI knowledge base over notes, decisions, versioned documents, playbooks, and org structure. Semantic search via OpenAI embeddings + pgvector. Live-content MCP writes route through an approval link (`/approve/[token]/`) before mutating.

**Stack:**
Next.js 16.1.1, React 19, TypeScript 5, Drizzle ORM + Postgres, NextAuth v5, Bun, Vitest, Playwright, Yjs (CRDT collab), Stripe, Resend, OpenAI.

**Self-hosting:**
Docker Compose file included. Requires Postgres with `pgvector`. Vercel or any Next.js host for the app.

**Gaps:**
No SDK, no API changelog, no public OAuth developer console. Visual workflow builder is on dev branch (not main). Voice assistant is built but not shipped.

Repo: `https://github.com/DanielPCoyle/simplerdevelopment2026`

---

## Reddit — r/selfhosted

> Tone: peer-to-peer community tone. Lead with self-hosting angle. Be honest about setup.

---

**Title:** I open-sourced a self-hostable multi-tenant agency platform with a 450-tool MCP server (Apache-2.0)

**Body:**

I've been running a multi-tenant SaaS for agencies on my own infrastructure and decided to open-source the whole codebase. Figured this community would appreciate the self-hosting angle.

**What it is:**
A single Next.js app you deploy to Vercel (or any Next.js host) connected to your own Postgres database. It serves:
- A global admin panel for you (the agency operator)
- Per-tenant client portals — each client gets a CRM, AI knowledge base, websites, email campaigns, bookings, a storefront, kanban projects, and more
- Per-tenant public websites built from typed JSON block content

**Honest self-hosting requirements:**
- Postgres 14+ with the `pgvector` extension (needed for the AI knowledge base / semantic search)
- Docker Compose file is included if you want a local Postgres fast
- A handful of secrets to generate (`openssl rand -hex 32` stuff — documented in `.env.example`)
- Optional integrations (Stripe, Google Workspace, OpenAI, Resend, etc.) stay dormant until you configure them

**The MCP piece (if you're into AI agents):**
There's a built-in Model Context Protocol server at `POST /api/mcp`. 450 tools covering every domain — you can connect Claude.ai or Claude Desktop and drive the entire system in natural language. Auth is OAuth 2.1 with PKCE or API keys, with ~50 named scopes for access control.

**License:** Apache-2.0. BYOK (bring your own key) for AI providers and Stripe — you pay your own API bills directly.

**Gaps to be aware of:**
- No SDK
- Visual workflow builder is on a dev branch, not in main yet
- Voice assistant feature is built but not shipped

Repo: `https://github.com/DanielPCoyle/simplerdevelopment2026`

Happy to answer setup questions here.

---

## Reddit — r/SaaS

> Tone: founder-to-founder. Business context and motivation. Not a product pitch.

---

**Title:** I built a multi-tenant SaaS for running an agency — now open-sourcing it (Apache-2.0)

**Body:**

I've been building a platform to run a software agency: provisioning client portals, managing their websites, CRM, projects, and billing from one place. After a year of production use I decided to open-source the whole stack.

**The core problem it solves:**
Agencies typically stitch together a site builder, a CRM, a project management tool, an email platform, a booking app, and a knowledge base — each with separate billing, logins, and API integrations. This is one Next.js codebase that puts all of that under one multi-tenant deployment.

**What each client gets when you onboard them:**
- Their own website(s) with custom domain, branding, visual block editor
- A CRM (contacts, companies, kanban deal pipeline, proposals, e-signed contracts)
- An AI knowledge base ("Company Brain") with semantic search over their notes, decisions, documents, and processes
- Email campaign tools, surveys, pitch decks, bookings, and an optional white-label storefront
- Kanban project boards and a support ticket system
- All of this accessible to AI agents via 450 MCP tools at a single endpoint

**Business model options the platform supports:**
- Self-host and white-label for your own clients
- Per-module à-la-carte subscriptions via Stripe (the billing module is included)
- AI credit packs (the billing module tracks these too)
- BYOK for AI and Stripe — your clients can connect their own keys

**What I'm looking for:** Feedback on the architecture, the MCP approach, and whether the "all-in-one agency SaaS" framing resonates with other operators. Happy to discuss what worked and what I'd do differently.

Repo: `https://github.com/DanielPCoyle/simplerdevelopment2026` (Apache-2.0)

---

## LinkedIn

> Tone: professional, business outcome framing. Agency operators and SaaS founders.
> 1200–1600 chars ideal.

---

Today I'm open-sourcing the platform I built to run a software agency.

SimplerDevelopment is a multi-tenant SaaS platform that lets an agency provision per-client portals — each with a website, CRM, AI knowledge base, email campaigns, bookings, projects, and a storefront — from a single deployment.

**Why I built it:**
Running an agency means stitching together a site builder, a CRM, a project tool, an email platform, and a knowledge base — each with separate billing and logins. I wanted one system where I could onboard a client in minutes and have everything ready: their website, their pipeline, their processes, all connected.

**What it covers (22 domains in one codebase):**
- Websites with a visual block editor and 47 built-in content block types
- CRM with configurable deal pipelines, proposal builder, and e-signed contracts (via DropboxSign)
- Company Brain: an AI knowledge base with semantic search over notes, decisions, documents, playbooks, and org structure
- Email campaigns, surveys, pitch decks, and A/B testing
- Bookings + scheduling with Stripe payments and Google Calendar sync
- Kanban projects, sprints, and a support ticket system
- Event-driven automations with natural language rule creation

**The developer angle:**
The whole platform is controllable via 450 MCP tools at a single endpoint — so an AI agent like Claude can build pages, update the CRM, send campaigns, and manage projects without touching the UI.

Apache-2.0. Self-hostable. BYOK for AI and Stripe.

GitHub: github.com/DanielPCoyle/simplerdevelopment2026

---

## X / Twitter — Thread (6–8 posts)

> Each post must stand alone. Hook first. No filler. ~280 chars each.

---

**Post 1 (hook):**
I just open-sourced the agency SaaS I've been running in production.

One Next.js app → your admin panel + per-client portals + per-client public websites.

450 MCP tools so an AI agent can drive the whole thing.

Apache-2.0. Self-hostable.

github.com/DanielPCoyle/simplerdevelopment2026

---

**Post 2 (what each client gets):**
When you onboard a client, they get:

- Their own website (visual block editor, 47 block types, custom domain)
- A full CRM (contacts, deals, proposals, e-signed contracts)
- An AI knowledge base over their notes, decisions, and processes
- Email campaigns, surveys, bookings, a storefront, kanban boards

All in one portal. No separate tools.

---

**Post 3 (MCP server):**
The MCP server is the interesting part.

450 tools. One endpoint: POST /api/mcp

Tool families:
- brain_* — 156 tools (AI knowledge base)
- kanban_* — 39
- crm_* — 34
- store_* — 28
- email_* — 20

OAuth 2.1 + PKCE. ~50 named scopes. Tool count is test-locked.

---

**Post 4 (Company Brain):**
"Company Brain" is the per-tenant AI knowledge base.

Notes, decisions, versioned documents, playbooks, goals, org chart.

Semantic search via OpenAI embeddings + pgvector.

Ask a question → intent classification → vector retrieval → grounded answer with citations.

156 MCP tools in the brain_* namespace.

---

**Post 5 (approval-link pattern):**
One design choice I want to highlight:

Live-content MCP writes don't take effect immediately.

The tool returns an approval URL. A human clicks through before the page publishes, the email sends, or the record deletes.

Draft and metadata ops mutate instantly. It's a human-in-the-loop gate, not a friction layer.

---

**Post 6 (self-hosting):**
Self-hosting setup:

1. Docker Compose up (Postgres + pgvector included)
2. bun install
3. cp .env.example .env.local → fill in 6 secrets
4. bun run db:migrate
5. bun dev

Most env vars gate optional integrations (Stripe, Google, Resend, OpenAI). The app boots without them.

---

**Post 7 (honest gaps):**
Honest gaps before you star it:

- No SDK yet
- Visual workflow builder is on dev branch (not main)
- Voice assistant is built but not wired up
- Social publishing channels: email only
- No API changelog

Open issues if you want any of these — happy to prioritize based on interest.

---

**Post 8 (CTA):**
22 product domains. 450 MCP tools. Apache-2.0.

If you're running an agency or building multi-tenant tooling, I'd love your feedback.

Repo: github.com/DanielPCoyle/simplerdevelopment2026

---

## Bluesky

> Same voice as X. Slightly more open-source / dev-forward audience.

---

**Post 1 (hook):**
Open-sourcing the agency SaaS I've been running in production.

One codebase → agency admin panel + per-client portals + per-client public websites.

Controllable via 450 MCP tools (Apache-2.0, self-hostable).

github.com/DanielPCoyle/simplerdevelopment2026

---

**Post 2 (MCP detail):**
The MCP server ships 450 tools across all product domains — Company Brain (156 tools), kanban, CRM, storefront, email campaigns, bookings, and more.

Auth: OAuth 2.1 + PKCE or SHA-256-hashed API keys. ~50 named scopes.

Connect Claude.ai or any MCP client once; drive everything in natural language.

---

**Post 3 (honest):**
Honest self-hosting requirements:
- Postgres 14+ with pgvector (for the AI knowledge base / semantic search)
- Docker Compose file included
- 6 secrets to generate; documented in .env.example

Gaps: no SDK, no API changelog, visual workflow builder is on dev branch.

Feedback welcome — especially on the MCP architecture.

---

## Dev.to — Article intro

> Full article title + opening paragraphs. The article would go on to cover the
> architecture in depth — this intro is the hook that gets readers to keep going.

---

**Title:** Building a 450-Tool MCP Server Inside a Next.js Multi-Tenant SaaS

**Intro:**

Model Context Protocol (MCP) is becoming the standard handshake between AI agents and software platforms. Most MCP implementations I've seen add a handful of tools to a single-purpose app. What happens when you need to expose an entire multi-tenant SaaS — 22 product domains, tens of thousands of lines of business logic — through a single endpoint?

I built SimplerDevelopment, an open-source multi-tenant agency SaaS, and the platform ships 450 MCP tools at `POST /api/mcp`. In this post I'll walk through:

1. How the tool registry works — and why a baseline test that locks the tool count is load-bearing infrastructure, not a nice-to-have
2. The scope model: ~50 named scopes, OAuth 2.1 with PKCE, and how a single missing scope guard becomes a tenancy bug
3. The approval-link pattern — why live-content writes route through a human click-through URL instead of mutating immediately
4. How Company Brain (the RAG knowledge base) surfaces 156 tools under one namespace without becoming a god-object
5. What I'd do differently

The codebase is Apache-2.0 on GitHub if you want to follow along with real code.

---

## Medium — Article intro

> Slightly more business-leaning framing than Dev.to. Same article could be adapted.

---

**Title:** I Open-Sourced My Agency's Operating System

**Intro:**

Running a software agency means your clients need websites, a CRM, a project board, a way to send emails to their customers, and a knowledge base for their internal processes. The usual answer is five separate SaaS subscriptions, five logins, and five sets of API credentials to manage.

I spent the past year building a different answer: a single multi-tenant platform that provisions all of that under one roof when you onboard a client. Today I'm open-sourcing it under Apache-2.0.

SimplerDevelopment is a Next.js monorepo that serves three audiences from one deployment: an internal admin panel for the agency, a per-tenant client portal (CRM, websites, brain, projects, email, bookings, store), and per-tenant public-facing websites. Every client's data is isolated at the database level by `clientId` — a tenancy regression test runs on every data-access change to verify there are no leaks.

The piece that makes it agent-native: 450 MCP tools at a single endpoint, so an AI agent like Claude can build pages, update CRM records, send campaigns, and manage the platform without touching the UI.

In this post I'll cover why I built it, the architecture decisions I'm most glad I made, and the gaps I'm still working through.
