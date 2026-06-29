---
type: editorial-calendar
status: draft
date: 2026-06-27
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md
  - vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md
  - docs/agents/ai-overview.md
  - marketing/feature-pages/ (all files)
  - marketing/seo/ai-seo-plan.md
  - marketing/seo/seo-plan.md
notes: |
  Every post topic is grounded in a shipped, Active-status capability per the feature
  inventory. Status flags are honored — no posts promote dormant or fate-decision-open
  features (voice assistant, print designer, visual workflow builder pre-main-merge, SDK,
  social publishing channels). All URLs use example.com as placeholder.
---

# SimplerDevelopment — Blog Editorial Calendar

## Cadence Recommendation

**Launch-week burst (Days 1–5):** Publish all five P0 Awareness posts back-to-back
(one per day, Mon–Fri). This establishes a foundation of indexable content across the
keyword spaces most likely to drive initial traffic and AI-search citation.

**Weeks 2–5 (Consideration cluster):** Two posts per week. Prioritize the feature
tutorials and feature-release posts that convert developers and agency evaluators already
in the funnel.

**Weeks 6–16 (Developer + Automation cluster):** One to two posts per week. Stagger
MCP Tutorials and Engineering Articles so developer-audience posts alternate with
business-audience Automation Guides.

**Ongoing (Retention + Enterprise):** One post per week. Enterprise articles and
Architecture Deep Dives remain evergreen — publish these during any slow news cycle.

---

## Stage 1 — Awareness

*Goal: establish the platform's positioning, surface it in AI search, and attract
agency owners + developers discovering the problem space.*

| # | Working Title | Type | Target Audience | Primary Keyword | SEO Slug | Links To | Priority | Media Needs |
|---|---|---|---|---|---|---|---|---|
| 1 | SimplerDevelopment is open source: Apache 2.0 licensed, self-hostable, 450 MCP tools | Feature Release | Agency owners, developers | open-source agency SaaS platform | `open-source-agency-saas-platform` | `/features/ai-agent-platform` · `/docs` | P0 | Hero banner; architecture diagram (single-deployment → three audiences) |
| 2 | Self-hosting SimplerDevelopment: Vercel, Railway Postgres, and pgvector from zero | Self-Hosting Guide | Developers, devops | self-host Next.js multi-tenant SaaS | `self-host-nextjs-saas-vercel-postgres-pgvector` | `docs/agents/ai-overview.md` · `docs/agents/architecture-for-agents.md` | P0 | Terminal screenshots: bun run db:migrate, pgvector extension enable; env-var checklist |
| 3 | One platform, six tool categories: why agencies consolidate CRM, CMS, email, and more | Comparison | Agency owners, operations leads | all-in-one agency software platform | `agency-saas-all-in-one-platform-crm-cms-email` | `/solutions` · `/features/crm` · `/features/websites-cms-visual-editor` | P0 | Category comparison table (no competitor names); platform overview diagram |
| 4 | Multi-tenant SaaS architecture in Next.js: three route trees, one monorepo | Architecture Deep Dive | Developers, architects | multi-tenant SaaS architecture Next.js | `multi-tenant-saas-nextjs-app-router-architecture` | `docs/agents/architecture-for-agents.md` · `docs/agents/repository-map.md` | P0 | Route-tree diagram (admin / portal / sites); no live code screenshots needed |
| 5 | Release notes — June 2026: MFA/TOTP shipped, 450-tool MCP surface, open-source launch | Release Notes | All — existing + prospective users | SimplerDevelopment release notes | `release-notes-june-2026` | `/features/ai-agent-platform` · `/solutions/company-brain` | P0 | None required; short changelog-style post |

---

## Stage 2 — Consideration

*Goal: help evaluators understand individual modules well enough to commit. Posts in this
cluster map 1:1 to shipped feature areas.*

| # | Working Title | Type | Target Audience | Primary Keyword | SEO Slug | Links To | Priority | Media Needs |
|---|---|---|---|---|---|---|---|---|
| 6 | Building client websites with 47 block types and a live-preview visual editor | Feature Release | Agency admins, end-user clients | visual block editor website builder | `block-based-visual-editor-47-block-types` | `/features/websites-cms-visual-editor` · `/solutions/websites` | P0 | GIF: dragging a block into the editor and seeing the live iframe update (~8 s); screenshot: block picker left panel |
| 7 | Getting started with Company Brain: notes, decisions, and documents in your AI knowledge base | Tutorial | Agency admins, client portal users | AI knowledge base getting started | `company-brain-getting-started-notes-decisions-documents` | `/features/company-brain` · `/solutions/company-brain` | P0 | Screenshots: note creation, decision log entry, Ask Brain chat with cited answer |
| 8 | Per-tenant CRM with proposals and e-signed contracts: setup and end-to-end workflow | Feature Release | Agency clients, sales teams | CRM with proposals and e-signature | `crm-proposals-esign-contracts-workflow` | `/features/crm` · `/solutions/crm` · `/solutions/contracts` | P1 | Screenshots: deals kanban, proposal builder, contract signer view |
| 9 | Setting up a booking page with Stripe payments and Google Calendar sync | Tutorial | Agency clients, service businesses | online booking page Stripe Google Calendar | `booking-page-stripe-google-calendar-setup-tutorial` | `/features/bookings-scheduling` · `/solutions/booking` | P1 | Screenshots: time-slot picker (public view), booking page settings, confirmation email |
| 10 | Email campaigns inside the portal: subscriber lists, A/B subject lines, and open tracking | Feature Release | Agency clients, email marketers | email marketing platform for agencies | `email-campaigns-ab-subject-lines-open-tracking` | `/features/email-campaigns` · `/solutions/email-marketing` | P1 | Screenshots: campaign builder, A/B config panel, analytics dashboard |
| 11 | Building a multi-page survey with branching logic and automatic CRM deal routing | Tutorial | Agency admins, growth teams | survey form builder with CRM integration | `survey-branching-logic-crm-deal-routing-tutorial` | `/features/surveys-forms` · `/solutions/surveys` | P1 | Screenshots: branching flow diagram panel, live public form, CRM deal auto-created on submission |
| 12 | White-label e-commerce on every client website: products, variants, and Stripe checkout | Feature Release | Agency clients, e-commerce merchants | white-label ecommerce platform | `white-label-ecommerce-storefront-stripe-checkout` | `/features/storefront-commerce` · `/solutions/ecommerce` | P1 | Screenshots: product list in portal, public storefront page, order management |
| 13 | AI-assisted pitch deck creation: generating slides and reviewing with version history | AI Workflows | Agency admins, sales teams | AI pitch deck generator | `ai-pitch-deck-slide-generation-version-history` | `/features/pitch-decks` · `/solutions/pitch-decks` | P1 | GIF: prompt → AI slide generation (~10 s); screenshot: version history panel |

---

## Stage 3 — Developer

*Goal: capture developers evaluating the MCP surface, building agents, or self-hosting.
These posts are the highest AI-search citation opportunities (Perplexity, Claude).*

| # | Working Title | Type | Target Audience | Primary Keyword | SEO Slug | Links To | Priority | Media Needs |
|---|---|---|---|---|---|---|---|---|
| 14 | Connecting Claude.ai to your SimplerDevelopment portal via MCP | MCP Tutorial | Developers, AI practitioners | connect Claude MCP server | `connect-claude-ai-mcp-simplerdevelopment-portal` | `/features/ai-agent-platform` · `docs/agents/tool-reference.md` | P0 | Screenshot: OAuth consent screen; screenshot: Claude.ai calling `whoami` tool; 5-line curl snippet |
| 15 | The 450-tool MCP surface: scope model, the approval-link pattern, and your first tool call | MCP Tutorial | Developers, AI engineers | MCP server 450 tools scope model | `mcp-server-450-tools-scope-model-approval-link-pattern` | `/features/ai-agent-platform` · `docs/agents/tool-reference.md` · `docs/agents/glossary.md` | P0 | Architecture diagram: MCP client → POST /api/mcp → tool namespaces → approval link → reviewer; curl example |
| 16 | Building a read-only AI agent with scoped sd\_mcp\_ tokens | MCP Tutorial | Developers | scoped MCP token read-only AI agent | `mcp-read-only-ai-agent-scoped-tokens-tutorial` | `/features/ai-agent-platform` · `docs/agents/tool-reference.md` | P1 | Code snippet: token issuance + tool call with `:read` scope; screenshot: API key settings page |
| 17 | The Company Brain MCP namespace: 156 brain\_\* tools for querying your knowledge base from an AI agent | MCP Tutorial | Developers, AI practitioners | Company Brain MCP tools brain namespace | `company-brain-mcp-156-brain-tools-guide` | `/features/company-brain` · `/features/ai-agent-platform` · `docs/agents/tool-reference.md` | P1 | Tool-family table (brain\_\* sub-namespaces); code snippet: `brain_search` call |
| 18 | OAuth 2.1 with PKCE in a Next.js SaaS: auth-code flow, RFC 8707 audience binding, and ~50 named scopes | Engineering Article | Security engineers, developers | OAuth 2.1 PKCE Next.js SaaS implementation | `oauth-21-pkce-nextjs-saas-rfc8707-named-scopes` | `/features/ai-agent-platform` · `docs/agents/ai-overview.md` | P1 | Sequence diagram: auth-code flow with PKCE; no live screenshots required |
| 19 | Tenant isolation by clientId: how per-tenant data scoping works in SimplerDevelopment | Architecture Deep Dive | Developers, architects | multi-tenant data isolation clientId | `multi-tenant-data-isolation-clientid-row-level-scoping` | `docs/agents/architecture-for-agents.md` · `docs/agents/glossary.md` | P1 | Schema diagram: clientId FK on representative tables; no live screenshots |
| 20 | The approval-link pattern: how MCP live-content writes go through human review before taking effect | Engineering Article | Developers, AI practitioners | MCP human-in-the-loop approval pattern | `mcp-approval-link-human-in-the-loop-content-review` | `/features/ai-agent-platform` · `/solutions/company-brain` | P1 | Diagram: MCP tool → approvalUrl → reviewer click → live; screenshot: portal approval queue |
| 21 | Drizzle ORM + pgvector: storing and querying OpenAI embeddings in Postgres | Engineering Article | Developers | Drizzle ORM pgvector OpenAI embeddings Postgres | `drizzle-orm-pgvector-openai-embeddings-postgres-semantic-search` | `/features/company-brain` · `docs/agents/ai-overview.md` | P1 | Code snippet: embedding insert + cosine similarity query via Drizzle |
| 22 | Locking the MCP tool registry: how a baseline test prevents silent tool-count drift on every push | Engineering Article | Platform engineers, developers | MCP tool registry test baseline | `mcp-tool-registry-baseline-test-prevent-drift` | `/features/ai-agent-platform` · `docs/agents/tool-reference.md` | P2 | Code snippet: baseline test assertion; CI badge / hook output |
| 23 | Configuring pgvector on Railway, Neon, and Supabase for Company Brain semantic search | Self-Hosting Guide | Developers, devops | pgvector setup Railway Neon Supabase | `pgvector-setup-railway-neon-supabase-company-brain` | `/features/company-brain` · `docs/agents/ai-overview.md` | P1 | Terminal screenshots: `CREATE EXTENSION vector;` on each provider; env-var checklist |
| 24 | Block JSON schema: how 47 block types share one registry and render to web and email | Architecture Deep Dive | Developers, content engineers | block JSON schema CMS registry | `block-json-schema-registry-47-block-types-universal` | `/features/websites-cms-visual-editor` · `docs/guides/BLOCK_EDITOR_GUIDE.md` | P2 | Schema excerpt snippet; diagram: block registry → site renderer + email renderer |
| 25 | Migrating a client site to SimplerDevelopment's block-based CMS from an existing platform | Migration Guide | Agency developers, admins | migrate CMS to block-based publishing | `migrate-existing-cms-to-block-based-simplerdevelopment` | `/features/websites-cms-visual-editor` · `/solutions/websites` | P2 | Before/after: raw HTML page vs. block JSON representation; migration checklist |

---

## Stage 4 — Automation & AI Workflows

*Goal: demonstrate cross-domain automation that is grounded in shipped capabilities
(event-driven rules + durable visual workflow builder once on main; MCP tool-driven flows).*

| # | Working Title | Type | Target Audience | Primary Keyword | SEO Slug | Links To | Priority | Media Needs |
|---|---|---|---|---|---|---|---|---|
| 26 | Creating automation rules with natural language: trigger → condition → action in plain English | Automation Guide | Agency admins, portal users | no-code automation rules natural language | `automation-rules-natural-language-trigger-condition-action` | `/features/automations-workflows` · `/solutions/automations` | P1 | GIF: typing rule description in NLP bar → rule appears in list (~12 s); screenshot: rule detail |
| 27 | End-to-end automation: survey submission → CRM deal creation → confirmation email | Automation Guide | Agency admins, growth teams | event-driven automation CRM email | `automation-survey-submission-crm-deal-email-end-to-end` | `/features/automations-workflows` · `/features/surveys-forms` · `/features/email-campaigns` | P1 | Diagram: event chain; screenshots of each step in the portal |
| 28 | Using the portal AI assistant for cross-domain actions: updating CRM, CMS, and projects in one chat | AI Workflows | Agency admins, portal users | portal AI assistant cross-domain | `portal-ai-assistant-crm-cms-projects-cross-domain-actions` | `/features/ai-agent-platform` · `/features/company-brain` | P2 | Screenshots: portal AI chat window calling a CRM tool and a CMS tool in sequence |
| 29 | Driving automations via MCP: reading, creating, and toggling rules with the automations\_\* tool family | MCP Tutorial | Developers | MCP automation tools API | `mcp-automations-tools-create-toggle-list-tutorial` | `/features/ai-agent-platform` · `/features/automations-workflows` · `docs/agents/tool-reference.md` | P2 | Code snippet: `automations_create` + `automations_toggle` calls; tool-response JSON |

---

## Stage 5 — Enterprise & Retention

*Goal: address enterprise and security objections; keep existing agency admins informed
of governance and white-label capabilities.*

| # | Working Title | Type | Target Audience | Primary Keyword | SEO Slug | Links To | Priority | Media Needs |
|---|---|---|---|---|---|---|---|---|
| 30 | White-label portal deployment: custom domain, branding overrides, and Scale-tier setup | Enterprise Article | Agency owners, enterprise evaluators | white-label agency portal custom domain | `white-label-agency-portal-custom-domain-branding-scale-tier` | `/solutions/agency` · `/features/websites-cms-visual-editor` | P1 | Screenshots: agency branding settings, custom domain DNS verification flow |
| 31 | TOTP/MFA on every account: how SimplerDevelopment enforces two-factor authentication | Enterprise Article | Agency admins, compliance teams | TOTP MFA two-factor authentication SaaS | `totp-mfa-two-factor-authentication-portal-security` | `docs/agents/ai-overview.md` · `/solutions/company-brain` | P1 | Screenshots: MFA enrollment flow (QR code step), TOTP login field, security settings page |

---

## Priority Summary

| Priority | Count | Description |
|---|---|---|
| **P0** | 9 | Must publish at or within the first two weeks of launch |
| **P1** | 16 | Core content body — publish weeks 2–12 |
| **P2** | 6 | Evergreen depth — publish as cadence allows, no hard deadline |

---

## Media Asset Inventory

Before the launch burst, capture or commission the following assets (referenced in the
table above, consolidated here for a single production pass):

| Asset type | Count | Used in posts |
|---|---|---|
| Architecture / flow diagrams | 5 | #1, #4, #15, #20, #24 |
| GIFs (screen recordings, 6–12 s) | 4 | #6, #9 (booking), #13, #26 |
| Terminal / CLI screenshots | 3 | #2, #5 (env-var), #23 |
| Portal UI screenshots (multi-panel) | 18 | #7, #8, #9, #10, #11, #12, #14, #16, #17, #20, #26, #27, #28, #30, #31 |
| Code snippets (inline on page) | 8 | #15, #16, #17, #18, #21, #22, #24, #29 |

---

---

## DEFERRED — Needs Real Input Before Scheduling

The following post types would add significant value but **cannot be written without
real data, real customers, or a confirmed post-launch community**. Do not draft,
schedule, or publish any item in this section until the prerequisite is met.

| Deferred type | Prerequisite | Why deferred |
|---|---|---|
| **Customer / client success stories** | Named, consenting customer with measurable outcome | No customers at launch. Do not invent names, agencies, or results. |
| **Case study: "How [agency] uses SimplerDevelopment"** | Named client, real usage data, written consent | Same as above. |
| **Benchmark: performance / scale numbers** | Real load-test results or production telemetry | No published benchmarks in the inventory. Do not fabricate. |
| **Community spotlight / plugin ecosystem** | Active third-party plugin authors or a public community | Only one plugin live (Content Tools, internal). No public plugin marketplace. |
| **Year in review / retrospective** | 12+ months of production history | Platform is launching; no historical data to cite. |
| **Testimonials / quotes post** | Written permission from real users | None available at launch. |
| **"Top N agencies using SimplerDevelopment" roundup** | Actual customer list with consent | Same as above. |
| **ROI / cost-savings comparison post** | Real customer data or independently verifiable methodology | No metrics available. Do not fabricate a calculation. |

> Note on the print designer: the fate decision (invest / defer / cut) is open per the
> feature inventory. Do not publish any blog post on the print designer until that
> decision is resolved and the feature is confirmed Active on main.

> Note on the visual workflow builder: the durable Postgres-backed workflow builder is
> on the `dev` branch as of 2026-06-27 and has not merged to main. The Automation Guide
> posts (#26, #27) are scoped to the event-driven rules engine, which IS on main. A
> dedicated "Visual Workflow Builder deep dive" post should be drafted only after the
> main-branch merge is confirmed.
