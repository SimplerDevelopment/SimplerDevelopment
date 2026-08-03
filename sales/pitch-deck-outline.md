---
type: sales-collateral
audience: sales-ae, founder, solutions-engineer
status: internal-draft
date: 2026-06-27
sources: roi-messaging.md, security-overview.md, technical-architecture.md, pricing-guide.md
note: Outline only. Speaker notes are brief prompts, not scripts. No invented metrics or client names.
---

# Pitch Deck Outline (12–15 Slides)

> Internal draft. Each slide entry includes a headline and 3–5 content beats. Intended as a working outline for the deck author — not a final script. No invented numbers, percentages, or client testimonials.

---

## Slide 1 — Title

**Headline:** SimplerDevelopment — The All-In-One Agency Platform

**Content beats:**
- Platform tagline (TBD per marketing)
- Date / presenter name / context (fill in per use)
- Keep sparse; let the headline do the work

---

## Slide 2 — The Problem

**Headline:** Agencies Are Managing Their Clients' Digital Presence Across Dozens of Disconnected Tools

**Content beats:**
- List the typical agency stack: CMS, CRM, project management, email, scheduling, AI — each its own vendor, login, data silo, and per-seat cost
- Cost of integration: webhook plumbing, data sync, broken handoffs between tools
- When AI enters a fragmented stack, the problem compounds: each tool's AI sees only its own slice of the data
- The buyer's team spends as much time on tooling overhead as on client work

**Visual suggestion:** A sprawling "tool logos everywhere" diagram vs. a single unified system

---

## Slide 3 — The Solution

**Headline:** One Platform. Every Tool Your Agency Needs.

**Content beats:**
- Website management, CRM, project management, email, scheduling, e-commerce, AI knowledge base — all in one
- Single login, single data model, single billing relationship
- AI that can see the whole picture, not just one tool's slice
- Human-in-the-loop approval model — AI works for you, not unilaterally

**Visual suggestion:** A single platform shell with domain icons arranged inside it

---

## Slide 4 — The Platform (Product Tour Overview)

**Headline:** 22 Integrated Product Domains, Purpose-Built for Agencies

**Content beats:**
- CMS + Block Editor with 48 built-in block types; visual drag-and-drop editor
- CRM: contacts, companies, deals, proposals, e-signed contracts
- Company Brain: per-tenant AI knowledge base with semantic search, decisions, playbooks, org chart
- Projects + Kanban: sprint boards, tickets, time logging, reports
- Email: campaigns, subscriber lists, A/B subject testing, segment-based sends
- And more: bookings, e-commerce, surveys, pitch decks, automations, branding

**Visual suggestion:** Screenshot collage or module grid (12 cards matching the billing UI)

---

## Slide 5 — Company Brain (AI Knowledge Base)

**Headline:** Every Client Gets an AI That Knows Their Business

**Content beats:**
- Per-tenant knowledge base: notes, decisions, documents, people, meetings, playbooks, goals, glossary
- Semantic search powered by OpenAI embeddings stored in PostgreSQL (pgvector)
- AI agent with intent classification, planning, and groundedness checks — explicitly says "I don't know" rather than hallucinating
- Meeting transcripts, slide edits, and AI-generated notes go through a human-review queue before being committed — AI assists, humans decide
- BYOK: tenants with enterprise AI pricing can use their own Anthropic or OpenAI keys

---

## Slide 6 — MCP + AI Agent Integrations

**Headline:** 450 MCP Tools — Connect Any AI Agent to the Full Platform

**Content beats:**
- SimplerDevelopment is a first-class MCP server: `POST /api/mcp` exposes 450 tools across all platform domains
- Covers: brain (156 tools), kanban (39), CRM (34), store (28), email (20), decks (13), CMS (10), and more
- AI coding agents (Claude, etc.) can operate across the entire platform through a single authenticated endpoint
- Scoped credentials: issue a key that can read CRM but cannot send email; or propose Brain notes but not approve them
- Approval-link pattern: AI-authored writes mint a one-time URL; a human clicks to confirm before changes go live

**Visual suggestion:** Architecture diagram — AI agent → MCP endpoint → platform domains

---

## Slide 7 — Technical Architecture

**Headline:** Modern, Proven Stack — Self-Host or Hosted

**Content beats:**
- Next.js 16.1.1 App Router + React 19 + TypeScript 5 + Drizzle ORM + PostgreSQL
- Three-tier route architecture: admin panel (staff), portal (tenant), public sites (visitors)
- pgvector for semantic search; Yjs CRDT for real-time collaboration
- Deployed on Vercel + Postgres (Railway / Neon / Supabase / self-managed)
- Apache 2.0 license — self-hosted deployments are fully supported with no restriction

**Visual suggestion:** Simplified three-tier architecture diagram

---

## Slide 8 — Multi-Tenant Isolation

**Headline:** Every Client's Data Is Isolated at the Database Level

**Content beats:**
- Every tenant-scoped table carries a `clientId`/`siteId` column; all queries filter on it
- `clientId` is always derived from the authenticated session — never from a URL parameter that could be forged
- Dedicated tenancy integration test suite runs after every data-access change
- Three distinct audience tiers with no shared route handlers: admin (staff), portal (tenant), public sites (visitor)

---

## Slide 9 — Security

**Headline:** Defense in Depth — From Auth to Encryption to Disclosure

**Content beats:**
- NextAuth v5 JWT sessions, httpOnly cookies, bcryptjs password hashing (10 rounds)
- TOTP multi-factor authentication (shipped) — fail-closed, no enumeration
- OAuth 2.1 authorization server with PKCE (RFC 7636), RFC 8707 audience binding, ~50 named scopes
- AES-256-GCM encryption for BYOK AI keys at rest
- Per-IP brute-force protection (10 attempts / 15 min); REST API rate limiting (60 req/min)
- SSRF guard on all outbound webhooks
- Coordinated vulnerability disclosure: security@simplerdevelopment.com, 72-hour acknowledgment, 30-day disclosure window

**Roadmap items to note honestly:** MCP-specific rate limiting, refresh token encryption, full edge host-header validation — all on the near-term roadmap.

---

## Slide 10 — Agency White-Label and Customization

**Headline:** Your Brand, Your Portal — Delivered to Every Client

**Content beats:**
- Scale-tier agencies can deploy the portal under their own custom domain
- Branded chrome overrides: replace the platform UI with your agency's branding
- Clients see your product, not a third-party tool
- Per-tenant branding profiles (colors, typography, logos, messaging) managed from the portal
- 48+ block types; custom post types with editable Liquid templates per tenant

---

## Slide 11 — Extensibility and Integrations

**Headline:** Built to Extend — Plugins, Webhooks, and Third-Party Integrations

**Content beats:**
- Plugin federation: independently-deployed apps embed inside the portal via HMAC-JWT proxy
- Browser extension (MV3) for CRM capture and Brain notes from any web page
- Inbound webhooks: Stripe, Dropbox Sign, EasyPost, Printful, Google Workspace, Microsoft 365
- Outbound project webhooks with SSRF protection
- Google Calendar sync, Gmail push, Drive polling, Microsoft 365 transcript ingestion
- CRM custom fields per tenant; custom content types per tenant

---

## Slide 12 — Pricing Model

**Headline:** Pay for What You Use — Modules, Seats, and AI Credits

**Content beats:**
- À-la-carte module subscriptions: activate only the product domains you need
- Volume discounts applied automatically as module count or usage scales
- Per-seat line item: separately metered from module subscriptions
- AI credits: purchased or granted; BYOK option removes platform credit dependency
- All-in-one bundle available for buyers who want the full platform at a single rate
- All pricing configurable; see current pricing sheet for figures

---

## Slide 13 — Self-Host vs. Hosted

**Headline:** You Choose Your Infrastructure

**Content beats:**
- **Hosted:** Vercel + managed Postgres (Railway / Neon / Supabase). Preview environments auto-deploy from every branch. No infrastructure management required.
- **Self-hosted:** Apache 2.0 license; run on your own cloud account. Full source access. Bring your own Postgres with pgvector. Wire your own Stripe, Resend, and AI keys.
- Both paths are supported; self-hosting does require operational capability (database provisioning, pgvector extension, one-time environment setup scripts)

---

## Slide 14 — Why Now

**Headline:** The AI-Agent Era Requires a Platform That Was Built for It

**Content beats:**
- The shift to AI-agent workflows is already underway. Tools that cannot be controlled via MCP will require custom integration work per integration.
- SimplerDevelopment ships 450 MCP tools today, locked by automated tests so the surface doesn't regress.
- The approval-link pattern lets buyers experiment with agentic workflows without giving AI agents unilateral write access — a requirement for enterprise buyers not yet ready for full automation.
- Apache 2.0 licensing means no vendor lock-in risk; buyers who self-host own their deployment.

---

## Slide 15 — Call to Action

**Headline:** Start With What You Need. Grow Into the Rest.

**Content beats:**
- Options: hosted trial, self-hosted evaluation, or a guided solutions-engineering call
- Contact: [fill in per AE]
- QR code / link to current pricing sheet
- Reiterate: no lock-in — Apache 2.0, self-host any time

---

## Appendix Notes for the Deck Author

- No client names, example domains, or fabricated testimonials. Keep it generic.
- No invented metrics ("reduces tool count by X%", "saves N hours per week"). Use qualitative language only.
- Roadmap items (visual workflow builder, scheduled email dispatcher, MCP rate limiting) should not appear as current capabilities. If a prospect asks, confirm the roadmap but do not represent them as shipped.
- The Print Designer domain has an open fate decision (invest/defer/cut). Do not include it in the platform tour slide.
- Voice assistant is built but not shipped. Do not include it.
- AB testing for email and surveys is not yet wired. Do not call it out as a capability in those domains.
