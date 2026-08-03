---
type: plan
phase: 12
area: AI-SEO / GEO (Generative Engine Optimization)
date: 2026-06-27
status: draft
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md
  - vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
  - llms.txt
---

# AI-SEO Plan — SimplerDevelopment (Phase 12)

This plan covers how to make the public marketing site and developer docs easy for AI search engines (ChatGPT, Perplexity, Claude, Google AI Overviews) to understand, cite, and act on. It is a planning document — it contains no app code edits.

---

## 1. Principles: How AI-Search Citation Differs from Classic SEO

Classic SEO optimizes for keyword ranking signals (backlinks, page speed, meta tags). AI search — also called Generative Engine Optimization (GEO) — operates differently. The search engine is a language model that reads pages, extracts claims, and re-synthesizes answers. To be cited:

| Classic SEO lever | AI-search equivalent |
|---|---|
| Keyword density | **Extractable atomic claims** — one crisp sentence per fact so an LLM can quote it directly |
| Backlink authority | **Cited source structure** — the page reads like a reference document, not a sales pitch |
| Meta description | **Opening paragraph** — the first 200 words must contain the complete definition/answer; LLMs read top-down |
| Sitemaps | **`/llms.txt` index** — a machine-readable table of contents for agent-accessible documents |
| Schema markup (classic) | **JSON-LD + semantic HTML** — FAQPage, SoftwareApplication, BreadcrumbList; `<article>`, `<section>`, `<dl>` |
| Freshness (crawl date) | **Explicit date stamps** — `dateModified` in JSON-LD and visible on the page so the model can assess recency |
| Long-tail keywords | **Definitional clarity** — define every domain term on first use; models favor self-contained pages |
| Internal links (PageRank) | **Concept-graph traversal** — every page links to and from related concepts so a model can follow the knowledge graph |

**The four AI-search citation tests a page must pass:**

1. **The lift test** — can an LLM quote a complete, accurate sentence directly from the page without editing it?
2. **The definition test** — does the page define its subject in the first paragraph?
3. **The evidence test** — are claims supported by verifiable specifics (numbers, file paths, standard names)?
4. **The freshness test** — does the page carry an explicit `dateModified` timestamp?

---

## 2. `/llms.txt` — Machine-Readable Site Index

### What exists now

A root-level `llms.txt` exists at the repo root. It follows the emerging `/llms.txt` convention (a plain-text or Markdown file listing the documents an AI agent should read to understand the project). The current file covers:

- Agent-readiness docs (`ai-overview.md`, `architecture-for-agents.md`, `repository-map.md`, `project-map.md`, `glossary.md`)
- Developer and API surface docs
- Project docs (README, CLAUDE.md, CONTRIBUTING.md, SECURITY.md)
- A "Notes for AI agents" section with load-bearing invariants

### What to do

**Step 1 — Serve it on the public marketing site at `/llms.txt`.** The repo-root file documents the codebase for coding agents; the marketing site needs its own `/llms.txt` pointing at public-facing content (feature pages, pricing, API docs, blog, glossary, guides).

**Step 2 — Create an optional `/llms-full.txt`** that inline-expands the most important documents for models with large context windows (Perplexity Deep Research, ChatGPT-o1, Claude Opus). Include the full AI overview, glossary, and the citable facts block (see Section 6). Cap at ~20 000 tokens to stay within practical one-shot limits.

**Recommended marketing-site `/llms.txt` structure:**

```
# SimplerDevelopment

> Multi-tenant agency SaaS: websites + CMS, CRM, AI Company Brain (RAG),
> automations, commerce, bookings, email campaigns — all controllable via
> a 450-tool MCP server. Apache-2.0. Self-hostable on any Next.js host + Postgres.

## Product overview
- [What is SimplerDevelopment](/about): Platform summary and target audience.
- [Feature overview](/features): The 22 product domains, each with a one-paragraph description.
- [Pricing](/pricing): Module subscription model, à-la-carte and bundle options.

## Developer docs
- [API reference](/docs/api): REST v1 (OpenAPI 3.1), public endpoints, MCP tools.
- [MCP tool catalog](/docs/mcp): All 450 tools by namespace, credential/scope model, approval-link pattern.
- [Getting started](/docs/getting-started): Installation, environment setup, first MCP connection.
- [Glossary](/docs/glossary): ~42 domain terms (tenant, block, Company Brain, scope guard, BYOK, …).

## Comparison and positioning
- [Agency SaaS overview](/features/agency-saas): How the platform differs from single-purpose tools.

## Optional: full inline content
- [/llms-full.txt](/llms-full.txt)
```

**Maintenance rule:** `/llms.txt` must be updated whenever a major feature ships or a doc page is added. Treat it as a sitemap for AI, not a one-time artifact.

---

## 3. Machine-Readable Content: Semantic HTML + Structured Data

AI models parse DOM structure. Pages written with semantic HTML are easier to chunk, summarize, and cite than pages built entirely from generic `<div>` elements.

### 3.1 Semantic HTML patterns

**Feature and overview pages:**

```html
<article itemscope itemtype="https://schema.org/SoftwareApplication">
  <h1 itemprop="name">SimplerDevelopment</h1>
  <p itemprop="description">
    Multi-tenant agency SaaS platform that delivers websites, CRM, AI knowledge base,
    automations, commerce, bookings, and email campaigns — controllable via 450 MCP tools.
  </p>
  <section aria-label="Key capabilities">
    <h2>What the platform does</h2>
    <!-- ... -->
  </section>
</article>
```

**Glossary / definition pages** — use `<dl>` for term–definition pairs. AI models recognize this structure as definitional content and will quote `<dt>/<dd>` pairs in answer snippets:

```html
<dl>
  <dt id="company-brain">Company Brain</dt>
  <dd>
    The per-tenant AI knowledge base. Stores notes, decisions, documents
    (with versioned drafts and acknowledgment tracking), tasks, meetings,
    people, goals, initiatives, playbooks, a glossary, a topic tree, an
    org chart, and relationships. Semantic search is powered by OpenAI
    embeddings stored in pgvector. 156 MCP tools under the
    <code>brain_*</code> namespace.
  </dd>

  <dt id="mcp-tool">MCP Tool</dt>
  <dd>
    A named, schema-validated callable function exposed over the MCP
    endpoint at <code>POST /api/mcp</code>. 450 tools are available
    under the wildcard scope. Each tool carries a scope guard that
    enforces tenant isolation.
  </dd>

  <dt id="block">Block</dt>
  <dd>
    The atomic unit of page content. A block is a JSON object with a
    <code>type</code> string and a typed <code>data</code> payload.
    47 built-in block types are registered in the shared block registry;
    every block type is available to all tenants.
  </dd>
</dl>
```

Draw these definitions verbatim from `docs/agents/glossary.md` so the public glossary and the agent-facing glossary stay in sync.

**Guide / tutorial pages** — wrap each logical step in a `<section>` with a descriptive `aria-label`:

```html
<section aria-label="Connect Claude.ai to SimplerDevelopment via MCP">
  <h2>Connect Claude.ai via MCP</h2>
  <ol>
    <li>Generate an API key at <strong>Portal → Settings → API Keys</strong>.</li>
    <li>Add the MCP server URL (<code>https://example.com/api/mcp</code>) to your Claude.ai project.</li>
    <li>Call <code>whoami</code> (no scope required) to confirm the connection.</li>
  </ol>
</section>
```

### 3.2 JSON-LD structured data

**Product / software application (add to every marketing page):**

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SimplerDevelopment",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "USD",
    "description": "Modular subscriptions with à-la-carte and bundle pricing"
  },
  "featureList": [
    "Multi-tenant white-label websites",
    "CRM with contacts, companies, deals, proposals, and e-signed contracts",
    "Company Brain AI knowledge base with RAG and semantic search",
    "450-tool MCP server",
    "Visual block editor with 47 built-in block types",
    "Email campaigns, surveys, pitch decks, A/B testing",
    "Bookings, commerce, kanban project management",
    "Automations (event-driven rules and visual workflow builder)",
    "Self-hostable on any Next.js host and Postgres database"
  ],
  "license": "https://www.apache.org/licenses/LICENSE-2.0",
  "dateModified": "2026-06-27"
}
```

**FAQ pages** — wrap Q&A blocks in FAQPage schema so AI Overviews and Perplexity can surface individual answers:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is SimplerDevelopment?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "SimplerDevelopment is a multi-tenant agency SaaS platform that lets a software agency run its own back office and deliver white-label digital infrastructure to clients. It covers website publishing, CRM, AI knowledge base, automations, email campaigns, commerce, bookings, and project management — all controllable via a 450-tool MCP server."
      }
    },
    {
      "@type": "Question",
      "name": "Can I self-host SimplerDevelopment?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. SimplerDevelopment is Apache-2.0 licensed and self-hostable on any Next.js host (such as Vercel) connected to a Postgres database. The pgvector extension is required on the database for Company Brain semantic search. BYOK (Bring Your Own Key) is supported for both AI providers and Stripe."
      }
    },
    {
      "@type": "Question",
      "name": "What is the MCP server?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The platform exposes a Model Context Protocol (MCP) endpoint at POST /api/mcp. Under a wildcard scope, 450 tools are available across all product domains. Tools are authenticated via sd_mcp_ portal API keys or OAuth 2.1 tokens with PKCE."
      }
    },
    {
      "@type": "Question",
      "name": "What is Company Brain?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Company Brain is a per-tenant AI knowledge base with notes, decisions, documents, tasks, meetings, people, goals, initiatives, playbooks, a glossary, a topic tree, and an org chart. Semantic search uses OpenAI embeddings stored in pgvector. 156 MCP tools are available under the brain_* namespace."
      }
    }
  ]
}
```

**BreadcrumbList** — add to every docs page so AI can position the content in the site hierarchy:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Docs", "item": "/docs" },
    { "@type": "ListItem", "position": 2, "name": "MCP", "item": "/docs/mcp" },
    { "@type": "ListItem", "position": 3, "name": "Tool Reference", "item": "/docs/mcp/tools" }
  ]
}
```

---

## 4. Comparison Content: Category Positioning (Not Competitor Matrices)

**Hard rule: do not fabricate competitor feature comparisons.** AI models check claims against their training data and will downgrade or contradict pages with inaccurate competitive claims. Stating that "Product X lacks Y" without current verification is factually risky. The correct strategy is **category positioning** — define the problem space and explain which categories of tool the platform replaces within one platform, without naming competitors or claiming superiority.

### 4.1 Category framing

The platform spans six discrete product categories that agencies typically stitch together from separate vendors:

| Category | What the platform provides |
|---|---|
| Website builder / CMS | Visual block editor, 47 built-in block types, custom post types with Liquid render templates, per-tenant public sites |
| CRM | Contacts, companies, deals (kanban pipeline), proposals, e-signed contracts, activities, lead scoring, custom fields |
| AI knowledge base | Company Brain: notes, decisions, documents, playbooks, org chart, semantic search via pgvector RAG, 156 MCP tools |
| Project management | Kanban boards, sprints, epics/stories, time logging, support tickets, SLA tracking |
| Marketing | Email campaigns (A/B subject lines, block-based templates), surveys with branching logic, pitch decks, A/B testing |
| Commerce | White-label storefront, product variants, Stripe checkout, bookings/scheduling, print-on-demand fulfillment (EasyPost, Printful) |

**Do not** present this table as a competitor comparison matrix. Present it as "what category of problem we solve." Example copy:

> "Instead of subscribing to a website builder, a CRM, a knowledge base, a project-management tool, and an email platform separately — each with its own billing, login, and API — SimplerDevelopment provides all of these in a single multi-tenant platform controllable from one API surface: 450 MCP tools and a REST v1 API with an OpenAPI 3.1 spec."

### 4.2 What not to claim

The following capabilities are **not** selling points because they are incomplete, dormant, or have open fate decisions:

- Social publishing channels (not built — email only)
- Voice assistant (built but not mounted/shipped)
- Print designer (fate decision open — invest/defer/cut)
- Visual workflow builder (on dev branch, not merged to main)
- Microsoft 365 BYO-app credentials (phase 3+, not yet implemented)
- SDK / client library (not built)
- API changelog (not built)
- Public OAuth developer console (not built)

---

## 5. Knowledge-Graph Relationships: Concept Map + Internal Linking

AI models benefit from being able to traverse a concept graph. The pattern already established in `docs/agents/` (every file opens with cross-links to related files) should be replicated in the public docs.

### 5.1 Concept map

```
Installation
  └── Configuration (env vars, DATABASE_URL, pgvector)
        └── Auth
              ├── Portal login (NextAuth v5, TOTP/MFA)
              ├── API keys (sd_live_, sd_mcp_)
              └── OAuth 2.1 (PKCE, sd_oauth_ tokens, ~50 named scopes)
                    └── MCP Server (POST /api/mcp, 450 tools)
                          ├── Company Brain (brain_*, 156 tools, RAG/pgvector)
                          ├── CRM (crm_*, 34 tools)
                          ├── CMS / Posts (posts_*, 10 tools; post_types_*, 13 tools)
                          ├── Kanban / Projects (kanban_*, 39 tools; projects_*, 8 tools)
                          ├── Email Campaigns (email_*, 20 tools)
                          ├── Commerce / Store (store_*, 28 tools)
                          ├── Bookings (booking_pages_*, bookings_*, 9 tools)
                          ├── Surveys (surveys_*, 6 tools)
                          ├── Pitch Decks (decks_*, 13 tools)
                          └── Approvals (approvals_*, 4 tools — human-in-loop gate)
REST v1 API (/api/v1/)
  └── OpenAPI 3.1 spec (/openapi.yaml)
        └── Read surface: posts, pages, categories, tags, media, products, branding, navigation
Deployment
  ├── Vercel (or any Next.js host)
  ├── Postgres + pgvector (Railway / Neon / Supabase / self-hosted)
  └── Yjs WebSocket server (collaboration — separate Railway service)
Integrations
  ├── Google Workspace (Gmail, Drive, Calendar, Contacts)
  ├── Microsoft 365 / Teams (transcript ingestion)
  ├── Stripe (subscriptions, Checkout, BYOK per-tenant payments)
  ├── Resend (transactional + campaign email)
  ├── Cloudflare Email Worker (inbound routing to Brain review queue)
  ├── Dropbox Sign (e-signatures on CRM contracts)
  ├── EasyPost (live shipping labels)
  ├── Printful (print-on-demand fulfillment)
  ├── Zoom (meeting links for bookings)
  └── OpenAI (embeddings, AI generation)
Troubleshooting
  ├── Tenancy bugs → run bun test:tenancy (clientId/siteId scoping)
  ├── Brain embeddings → check pgvector extension and async pipeline lag
  ├── MCP tool drift → mcp-tool-registry-baseline.test.ts (pre-push hook)
  └── Scheduled campaigns → no dispatcher cron yet (known gap)
```

### 5.2 How to express the graph in HTML and structured data

**Internal links:** every docs page should carry a "See also" section (matching the `docs/agents/` cross-link pattern). Example:

```html
<nav aria-label="Related documentation">
  <h3>See also</h3>
  <ul>
    <li><a href="/docs/mcp">MCP tool reference</a></li>
    <li><a href="/docs/api">REST API index</a></li>
    <li><a href="/docs/glossary#company-brain">Company Brain definition</a></li>
    <li><a href="/docs/getting-started#auth">Authentication</a></li>
  </ul>
</nav>
```

**JSON-LD WebPage with relatedLink:**

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "MCP Tool Reference",
  "description": "The 450-tool MCP surface by family, credential model, and the approval-link pattern.",
  "relatedLink": [
    "https://example.com/docs/api",
    "https://example.com/docs/glossary",
    "https://example.com/docs/getting-started"
  ],
  "dateModified": "2026-06-27"
}
```

**Anchor IDs on every defined term.** The glossary page must use stable `id` attributes on each `<dt>` so AI systems and human readers can deep-link to specific definitions (e.g. `/docs/glossary#company-brain`, `/docs/glossary#mcp-tool`).

---

## 6. Citable Facts Block

The following are crisp, factual, quotable statements about the platform. Each is verifiable in the source documents referenced in the header. Place a version of this block on the About page, the AI/MCP feature page, and in `/llms.txt` / `/llms-full.txt`.

**Rule:** every fact here must remain true at publish time. Before publishing, verify against the current inventory. Remove or caveat any item whose status has changed (see Section 4.2 for known gaps).

---

**Platform facts (all verified in inventory as of 2026-06-27):**

- SimplerDevelopment is a **multi-tenant agency SaaS platform** — one deployment serves an internal agency panel, per-tenant client portals, and per-tenant public websites from a single Next.js monorepo.
- The platform is **Apache-2.0 licensed** and **self-hostable** on any Next.js host connected to a Postgres database.
- **BYOK (Bring Your Own Key) is supported** for both AI providers (OpenAI) and Stripe payment processing.
- The platform exposes **450 MCP tools** at `POST /api/mcp` (Streamable HTTP). The tool count is enforced by a baseline test that fails the pre-push hook if the count drifts.
- **MCP authentication** uses either `sd_mcp_` portal API keys (SHA-256 hashed) or `sd_oauth_` OAuth 2.1 tokens issued by a built-in authorization server implementing RFC 8707 resource indicators and RFC 7636 PKCE.
- **~50 named scopes** control per-tool access (e.g. `brain:read`, `crm:write`, `email:send`). A `*` wildcard scope grants access to all 450 tools.
- The **Company Brain AI knowledge base** has **156 MCP tools** under the `brain_*` namespace. Semantic search uses OpenAI embeddings stored in Postgres via the pgvector extension.
- Company Brain stores: notes, decisions, documents (with version history and required-read acknowledgments), tasks, meetings, people, goals, initiatives, playbooks (with run history), a glossary, a topic tree, an org chart, and relationship graphs.
- The CMS supports **47 built-in block types** registered in a shared block registry available to all tenants. Post content is stored as a JSON block tree (`{ blocks: Block[], version: '1.0' }`).
- The platform spans **22 product domains**: sites/hosting/publishing, CMS/blocks, visual editor, CRM, Company Brain/AI, projects/tickets/kanban, bookings/services, email/campaigns, commerce/storefront, print designer, surveys, pitch decks, e-sign/approvals, automations/workflows, agency/onboarding/branding, billing/Stripe, auth/security/MFA, Google/Microsoft/OAuth integrations, A/B testing, chat/realtime/voice, plugins/browser extension, and agentic OS.
- A **REST v1 API** is available at `/api/v1/` (Bearer `sd_live_` key, 60 requests/minute, CORS `*`). An **OpenAPI 3.1 specification** is served at `/openapi.yaml`.
- **TOTP / MFA** is available on every portal account. Users enroll at Portal → Settings → Security. Disable requires password re-verification (fail-closed).
- **Tenant isolation** is enforced at the database level: every tenant-scoped data row carries a `clientId` foreign key. A tenancy regression gate (`bun test:tenancy`) runs after every data-access change.
- Live-content MCP write tools use an **approval-link pattern**: the tool mints a tokenized URL (`/approve/[token]/`) for human click-through before content goes live. Metadata and draft operations mutate immediately.
- **Integrations** include: Google Workspace, Microsoft 365/Teams, Stripe, Resend, Cloudflare Email Worker, Dropbox Sign, EasyPost, Printful, Zoom, and OpenAI.

---

## 7. Per-Page AI-Readiness Checklist

Apply this checklist to every public marketing page and every developer docs page before publishing.

### Content structure

- [ ] **Opening paragraph contains the complete definition.** The subject of the page is defined in the first 200 words without requiring the reader to follow a link.
- [ ] **Every claim is an atomic sentence.** Each factual claim can be quoted by an LLM without editing or combining with another sentence.
- [ ] **Specifics over generalities.** Numbers, filenames, endpoint paths, and standard names are used instead of vague adjectives ("robust", "powerful", "comprehensive").
- [ ] **Domain terms are defined on first use** and linked to the glossary page anchor (e.g. `<a href="/docs/glossary#company-brain">Company Brain</a>`).
- [ ] **Status is stated explicitly for partial/dormant features.** Any feature not fully shipped says so plainly (see Section 4.2 for the current list).

### Semantic HTML

- [ ] Page is wrapped in `<article>` or `<main>`.
- [ ] Major sections use `<section aria-label="...">` with a descriptive label.
- [ ] Definition content uses `<dl><dt><dd>` (not tables or bullet points).
- [ ] Code references use `<code>` inline and `<pre><code>` for blocks.
- [ ] Navigation uses `<nav aria-label="...">`.
- [ ] "See also" cross-links are in a `<nav aria-label="Related documentation">` block at the end.

### Structured data (JSON-LD in `<script type="application/ld+json">`)

- [ ] **SoftwareApplication** schema on the homepage and feature overview page.
- [ ] **FAQPage** schema on any page with Q&A blocks.
- [ ] **BreadcrumbList** schema on every docs page.
- [ ] **TechArticle** with `dateModified` and `relatedLink` on every docs page.
- [ ] **dateModified** matches the last real content update (not the deploy date).

### Citability

- [ ] The page contains at least one sentence that passes the **lift test** (an LLM can quote it verbatim to answer a realistic question about the platform).
- [ ] The page is listed in `/llms.txt` if it is a major feature page or developer guide.
- [ ] No claims contradict the feature inventory status flags.

### Freshness

- [ ] Visible `Last updated: YYYY-MM-DD` or equivalent date on the page.
- [ ] `dateModified` in JSON-LD reflects that same date.
- [ ] The page is reviewed and updated whenever the corresponding feature ships a significant change.

### `/llms.txt` hygiene

- [ ] New major feature pages are added to the marketing-site `/llms.txt`.
- [ ] New developer guide pages are added to the repo-root `llms.txt`.
- [ ] `/llms-full.txt` is regenerated from the latest AI overview, glossary, and citable facts block after any significant content update.

---

## Appendix A: Priority Page Matrix

The following pages have the highest AI-citation upside and should be built or updated first.

| Page | Current state | AI-SEO priority | Key structured data to add |
|---|---|---|---|
| Homepage | Exists (marketing) | Critical | SoftwareApplication, FAQPage |
| `/features` or `/features/overview` | Likely exists | Critical | SoftwareApplication, featureList |
| `/docs/glossary` | Based on `docs/agents/glossary.md` | Critical | DefinedTermSet → dl/dt/dd per term |
| `/docs/mcp` or `/docs/api/mcp` | Based on `docs/agents/tool-reference.md` | High | TechArticle, BreadcrumbList |
| `/docs/getting-started` | Unknown | High | TechArticle, HowTo |
| `/docs/api` | Based on `docs/agents/api-index.md` | High | TechArticle, BreadcrumbList |
| `/features/company-brain` | Unknown | High | FAQPage, SoftwareApplication |
| `/features/crm` | Unknown | Medium | FAQPage |
| `/features/automations` | Unknown | Medium | FAQPage |
| `/pricing` | Exists (marketing) | Medium | Offer schema |
| `/llms.txt` (marketing site) | **Does not exist yet** | Critical | n/a (plain text/Markdown) |
| `/llms-full.txt` | **Does not exist yet** | Medium | n/a |

---

## Appendix B: `/llms-full.txt` Content Outline

The full inline document should contain, in order:

1. **Platform summary** (from `docs/agents/ai-overview.md` — adapted for marketing audience, stripped of repo-internal invariants)
2. **Citable facts block** (verbatim from Section 6)
3. **Glossary** (all ~42 terms from `docs/agents/glossary.md`, adapted for public audience — remove internal file paths)
4. **Feature overview** (22 domains, one paragraph each — drawn from feature inventory; omit any domain where status is dormant or fate decision open)
5. **API surface summary** (REST v1 + MCP, from `docs/agents/api-index.md`)
6. **Integration list** (drawn from `docs/agents/ai-overview.md` integration table)
7. **FAQ block** (the four Q&A pairs from Section 3.2, plus 4–6 more)
8. **Links** (pointer back to full docs at `/docs`)

Target length: 8 000–15 000 tokens. Label the file clearly: "This file is intended for AI language models and automated agents. It contains a curated, factual summary of SimplerDevelopment. Last updated: YYYY-MM-DD."
