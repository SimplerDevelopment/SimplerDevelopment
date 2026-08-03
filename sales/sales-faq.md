---
type: sales-collateral
document: sales-faq
phase: 19
date: 2026-06-27
status: internal-draft
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
  - marketing/feature-pages/
---

# SimplerDevelopment — Sales FAQ

Answers are grounded in the current platform inventory. Pricing figures are omitted — all monetary specifics are at current pricing pages.

---

## What's Included

**Q1: What does a client tenant actually get when they're provisioned?**

A: Every provisioned tenant gets a complete, isolated workspace including:

- One or more websites with custom domains, visual block editor, branding profiles, and a media library
- A full CRM — contacts, companies, configurable deal pipelines, proposals, DropboxSign e-signature contracts, lead scoring, custom fields, and an activity log
- Company Brain — an AI knowledge base with notes, decisions, versioned documents, playbooks, goals, org chart, and semantic search
- Project management — kanban boards, sprint planning, time logging, support tickets, and a suggested-projects catalog
- Email campaigns — subscriber lists, segment builder, block-based campaign editor with A/B subject-line testing
- Survey and form builder with branching logic and CRM auto-routing
- Booking pages with availability, Stripe payment, and Google Calendar / Zoom sync
- A pitch deck builder with AI slide generation
- Automation rules for event-driven cross-domain workflows
- A live visitor chat widget with an agent inbox
- 450 MCP tools covering every domain, accessible via a single endpoint

Modules that are active per tenant are determined by the tenant's subscription plan. Inactive modules are not billed.

---

**Q2: What is not included in the current release?**

A: The following are explicitly not available in the current release:

- Social media publishing or webhook publishing channels (email campaigns are the built publishing channel)
- A self-serve OAuth developer console for registering third-party OAuth apps
- An SDK or npm client package for the platform API
- Sub-account resale (white-label is agency-to-client, not multi-level)
- Voice assistant features (built but not mounted in the portal; do not rely on this)

---

## Pricing and Billing

**Q3: How is the platform priced?**

A: The billing model has four components, all Stripe-backed:

1. **À-la-carte module subscriptions** — each product domain (CRM, email, Company Brain, storefront, bookings, etc.) can be subscribed to individually. Tenants pay only for what they activate.
2. **All-in-one bundle** — a single bundled tier activates the full platform for a flat rate, suitable for tenants who use most or all modules.
3. **Per-seat pricing** — team member seats on multi-user plans are priced per seat.
4. **AI credit packs** — Company Brain and AI generation features draw from a credit balance. Credits can be purchased separately or included at volume tiers.

Volume discounts apply as usage or seat counts scale. Specific current figures: see the pricing page.

---

**Q4: Can a client use their own Stripe account for storefront payments?**

A: Yes. Tenants can connect their own Stripe account in the store settings (BYOK Stripe mode). In BYOK mode, storefront payments go directly to the tenant's Stripe account. This is separate from the platform billing subscription, which runs through the agency's Stripe account.

---

**Q5: Does the agency control what modules each client pays for?**

A: The agency admin panel includes a "Billing & Plan" view per client where the agency can manage entitlements and apply billing overrides. Individual modules can be toggled per tenant by the agency admin.

---

## Data Ownership and Self-Hosting

**Q6: Who owns the tenant data?**

A: In the hosted model, all tenant data is stored in the agency's Postgres database. The agency owns the database; the platform does not retain a separate copy. Tenants can export their content — sites, posts, CRM records, and other data — through the portal and API.

In the self-hosted model, the operator has full control over the Postgres schema (Drizzle ORM) and all data at rest. Nothing leaves the operator's infrastructure.

---

**Q7: Can we self-host the platform?**

A: Yes. SimplerDevelopment runs on standard open-web infrastructure:

- **App layer:** Any Next.js-compatible host (Vercel, Railway, Render, or a self-managed server).
- **Database:** Any Postgres instance with the `pgvector` extension enabled (Railway, Neon, Supabase, or self-hosted). pgvector is required — Company Brain semantic search depends on it.
- **Collaboration WebSocket:** A standalone Yjs server is required for real-time multi-user editing in the visual editor and pitch decks. This is typically deployed as a separate Railway service.

Schema changes are managed via Drizzle ORM. Migrations are generated from the schema source files and applied with `bun run db:migrate`. Hand-editing generated SQL files is not supported.

---

## AI and BYOK

**Q8: Can a tenant use their own OpenAI API key?**

A: Yes. Tenants can supply their own OpenAI key in Settings → AI. The key is encrypted at rest using AES-256-GCM before storage. When a BYOK key is configured, Company Brain embeddings and AI generation calls use the tenant's key and count against their own OpenAI account — outside the platform's credit system.

---

**Q9: How does Company Brain's AI work?**

A: Company Brain is a per-tenant AI knowledge base, not a generic AI chat. The workflow:

1. The tenant's knowledge — notes, decisions, documents, meeting notes, glossary terms — is stored in Postgres and indexed as embedding vectors via the OpenAI Embeddings API.
2. When a user asks a question, the Brain agent classifies intent, retrieves semantically similar content via pgvector cosine similarity search, plans a response, and checks it for groundedness before answering.
3. The agent can also take actions — creating tasks, updating goals, routing review items — as part of the same conversation.

Embedding indexing is asynchronous. Keyword search is immediate; vector similarity search may lag new note creation by a short interval while embeddings are generated.

---

**Q10: What does "MCP" mean, and why does it matter?**

A: MCP (Model Context Protocol) is the open protocol that lets AI clients — such as Claude.ai, Claude Desktop, or a custom agent — call platform capabilities as structured, schema-validated tool calls. SimplerDevelopment exposes a single MCP endpoint (`POST /api/mcp`) with 450 tools covering every product domain.

This means an AI client can read CRM deal data, draft an email campaign, create a Brain note, log time on a project card, and check inventory on a storefront product — all from one connection, without the developer having to build separate integrations per domain. Access is controlled via ~50 named OAuth 2.1 scopes, so AI clients can be issued least-privilege tokens for their specific task.

---

## Security

**Q11: Does the platform support multi-factor authentication?**

A: Yes. TOTP (time-based one-time password) MFA is available. Users enroll from Settings → Security; the login flow prompts for the 6-digit code when MFA is enabled. Disabling MFA requires password re-verification. Shipped June 2026.

---

**Q12: How is tenant data isolation enforced?**

A: Every data-access handler and every MCP tool validates the active `clientId` (and `siteId` where site-scoped) before any query executes. A dedicated tenancy regression test suite runs on every push — it specifically tests for cross-tenant data leaks and is a required status check in CI. Cross-tenant reads or writes are treated as security bugs, not configuration issues.

---

## Migration and Onboarding

**Q13: How does a new client get started?**

A: After the agency provisions a client account, the client user receives an invite link and steps through an 8-step onboarding wizard in the portal. The wizard guides them through branding, site setup, team configuration, integrations, and initial content — covering the decisions needed to reach a working first site. Most clients complete the wizard in a single session.

See `sales/customer-onboarding.md` for the full onboarding journey and first-value milestones.

---

**Q14: Can existing website content be migrated into the platform?**

A: Yes. The CMS supports HTML upload for posts and pages — existing HTML content can be imported and converted to the block format. There is also a snapshot export/import system for moving site configurations between environments.

Larger structured migrations (existing CRM data, products, subscriber lists) are done via the REST v1 API or MCP tools, which accept structured JSON inputs. A site migration skill is available for guided per-site import from a source URL.

---

**Q15: What ongoing support does the platform include?**

A: Every tenant has access to a support ticket system — clients can file tickets from the portal, the agency team replies in threads, and tickets include basic SLA tracking (calendar-hour measurement).

Platform-level support commitments (uptime guarantees, response-time SLAs for the agency itself) are not specified in product documentation. Agencies requiring contractual platform-level SLAs should request current terms directly.
