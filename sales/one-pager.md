---
type: sales-collateral
document: one-pager
phase: 19
date: 2026-06-27
status: internal-draft
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
  - marketing/feature-pages/
---

# SimplerDevelopment — Platform One-Pager

## What It Is

SimplerDevelopment is a multi-tenant agency SaaS platform that lets a software agency run its own back office and deliver complete white-label digital infrastructure to every client — from one deployment, one codebase, and one Postgres database.

A single platform install serves three audiences simultaneously: an internal agency-admin panel, a per-tenant client portal, and per-tenant public-facing websites. Clients get their own isolated workspace with no overlap and no shared data.

---

## Who It Is For

**Software agencies** that want to deliver managed digital services to clients without stitching together a separate website platform, a separate CRM, a separate email tool, a separate project management system, and a separate AI knowledge base. Every module is already integrated and pre-wired when a client is provisioned.

**Clients (tenants)** who want to manage their own website, sales pipeline, bookings, campaigns, and team knowledge from one portal — without depending on an agency developer for every change.

**Developer and AI teams** building automations, agents, or integrations who need a programmatic surface across the full platform without managing separate API connections per tool.

---

## The Platform: One Deployment, 22 Domains

Instead of paying for and integrating separate products for each concern, the entire agency stack is consolidated in one platform. The 22 product domains cover every layer of a client's digital operation:

| Domain cluster | What's included |
|---|---|
| **Website & Content** | Sites with custom domains and branding, visual block editor (47+ block types), custom post types, media library, content calendar |
| **CRM & Sales** | Contacts, companies, configurable deal pipelines, proposal builder, DropboxSign e-signature contracts, lead scoring, activity log, browser extension |
| **AI Knowledge Base** | Company Brain — notes, decisions, versioned documents, playbooks, goals, initiatives, org chart, glossary, semantic search via OpenAI embeddings |
| **Marketing** | Email campaigns with A/B subject-line testing, subscriber lists and segments, survey forms with branching logic and CRM routing, pitch deck builder |
| **Commerce** | White-label storefront, product variants, Stripe checkout, EasyPost shipping labels, Printful print-on-demand fulfillment, discount codes, order management |
| **Scheduling** | Booking pages with availability and Stripe payments, Zoom meeting links, Google Calendar sync, gift certificates, check-in |
| **Project Management** | Kanban boards, sprints, backlogs, time logging, dependencies, velocity and burndown reports, support tickets with SLA tracking |
| **Automation** | Event-driven automation rules (NLP creation), scheduled rules, tracked trigger links |
| **Realtime & Chat** | Live visitor chat widget with agent inbox, real-time multi-user collaboration in the editor and pitch decks |
| **Integrations** | Google Workspace (Gmail, Drive, Calendar, Contacts), Microsoft 365/Teams, Stripe, Resend, DropboxSign, EasyPost, Printful, Zoom, OpenAI |
| **Auth & Security** | NextAuth v5 sessions, TOTP multi-factor authentication, OAuth 2.1 authorization server (PKCE), AES-256-GCM BYOK AI key encryption, per-tenant isolation |
| **AI Agent Surface** | 450 MCP tools across all domains, accessible via a single endpoint with scoped OAuth 2.1 tokens |

This is a consolidation story: where an agency previously subscribed to a website builder, a CRM, an email platform, a project management tool, a scheduling tool, and an AI workspace separately, SimplerDevelopment delivers all of them under one white-label roof.

---

## Top Differentiators

**1. Multi-tenancy built in, not bolted on.**
Each client is a fully isolated tenant with their own data, their own sites, their own CRM contacts and deals, and their own AI knowledge base. An agency provisions a new client in minutes; data never bleeds across tenants by design.

**2. Company Brain — AI knowledge that stays grounded.**
Every tenant gets a structured AI knowledge base with semantic search (OpenAI embeddings + pgvector). Notes, decisions with rationale history, versioned documents with required-read acknowledgments, playbooks with run tracking, and an org chart — all queryable by an AI agent with groundedness checks built in. This is not a generic AI chat wrapper; it is a purpose-built knowledge graph per client.

**3. MCP-native: 450 tools, one endpoint.**
The entire platform is exposed as a Model Context Protocol server at a single HTTP endpoint. AI clients such as Claude.ai connect via OAuth 2.1 and get access to 450 tools covering every domain — without separate integrations. Live-content mutations require a human approval click before they take effect, so agents can draft and stage without autonomous publishing risk.

**4. BYOK for AI and payments.**
Tenants can supply their own OpenAI key (encrypted AES-256-GCM at rest) and their own Stripe keys. Agencies who want to pass AI costs directly to clients or allow clients to use their own payment infrastructure can do so without platform changes.

**5. Self-hostable on standard infrastructure.**
The platform runs on any Next.js host (Vercel or equivalent) with a Postgres database (Railway, Neon, Supabase, or self-hosted). No proprietary infrastructure lock-in. The dev branch is optimized for fast iteration; main enforces strict type and lint gates.

---

## Pricing Model

SimplerDevelopment uses a modular billing model:

- **À-la-carte module subscriptions** — tenants activate only the modules they use; inactive domains carry no subscription cost.
- **Volume discounts** — pricing adjusts as usage or seat counts scale.
- **Per-seat pricing** — team member seats on multi-user plans are billed per seat.
- **All-in-one bundle** — a single bundled tier is available for teams that want the full platform at a predictable rate.
- **AI credit packs** — Company Brain and AI generation features draw from a credit balance, purchasable separately or included at volume tiers.
- **BYOK** — tenants who supply their own OpenAI key route AI usage directly to their own account, outside the credit system.

**Specific pricing: see current pricing at `[pricing URL]`** — no figures are included in this document.

---

## Call to Action

**Book a demo:** See the full platform live, including a multi-tenant provisioning walkthrough and Company Brain in action.

**Start the onboarding wizard:** Existing agency accounts can provision a new client tenant in minutes from the admin panel.

**Explore the API:** Developers and AI teams can connect a Claude.ai (or any MCP-compatible) client to `POST /api/mcp` using a scoped OAuth 2.1 token. Full tool reference available in the developer docs.
