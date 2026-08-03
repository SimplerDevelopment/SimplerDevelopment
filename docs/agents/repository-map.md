# Repository Map

Annotated directory tree for the SimplerDevelopment monorepo (~357k LOC). Written for human developers and AI agents. Use this file to orient yourself before diving into code.

**Siblings:** [project-map.md](./project-map.md) · [architecture-for-agents.md](./architecture-for-agents.md) · [ai-overview.md](./ai-overview.md) · [api-index.md](./api-index.md) · [tool-reference.md](./tool-reference.md) · [glossary.md](./glossary.md) · [/llms.txt](/llms.txt)

---

## Root

```
/
├── app/                  Next.js App Router — all routes live here (see below)
├── components/           Shared UI components (portal, sites, blocks, editor)
├── lib/                  Domain logic, DB, MCP, AI/Brain, integrations
├── tests/                Vitest unit + integration + Playwright E2E suites
├── scripts/              One-off and CI utility scripts (seed, migrate, audit)
├── drizzle/              ⛔ Generated SQL migrations — DO NOT hand-edit
├── docs/                 Guides, agent docs, API reference, skill docs
├── vault/                Obsidian knowledge vault (domain maps, ADRs, specs)
├── workers/              Standalone long-running servers (realtime collab, email inbound)
├── packages/             Shared packages (sdk/, starter/)
├── public/               Static assets served at /
├── extension/            Browser extension (MV3 Vite/React — separate tsconfig)
├── config/               App-level config (feature flags, tier definitions)
├── contexts/             React context providers
├── hooks/                Shared React hooks
├── types/                Global TypeScript type declarations
├── middleware.ts          Site-resolver + auth middleware (runs on every request)
├── next.config.ts         Build config — relaxed on dev branch (see CLAUDE.md)
├── drizzle.config.ts      Drizzle ORM config
├── vitest.config.ts       Vitest config
└── playwright.config.ts   Playwright config
```

---

## app/ — Next.js Route Tree

Three audience segments, three separate trees. Never mix cross-audience concerns.

```
app/
├── admin/                Global internal admin panel (agency team only)
│   ├── login/            Admin login
│   ├── clients/          Tenant management (provision, plan, billing overrides)
│   ├── users/            Global user management
│   ├── ai-credits/       AI credit admin (grants, ledger)
│   ├── portal-ai/        Portal AI usage view
│   ├── portal-websites/  Cross-tenant website admin
│   ├── portal-hosting/   Cross-tenant hosting admin
│   ├── portal-projects/  Cross-tenant project admin
│   ├── portal-tickets/   Cross-tenant ticket admin
│   ├── portal-invoices/  Invoice admin
│   ├── crm/              CRM read-only admin mirror
│   ├── branding/         Global branding admin
│   ├── email/            Email campaigns/domains admin
│   ├── approvals/        Global MCP approval queue
│   ├── booking/          Booking admin
│   ├── subscriptions/    Stripe subscriptions admin
│   ├── automations/      Automation admin
│   ├── oauth-clients/    OAuth 2.1 client registration
│   ├── agentic-os/       🛠 Dev-only skill/cron dashboard (404 in prod)
│   └── system-health/    System health dashboard
│
├── portal/               Per-tenant client UI (all authenticated portal routes)
│   ├── dashboard/        Tenant dashboard / home
│   ├── websites/         Site list and per-site management
│   │   └── [siteId]/     Per-site settings, branding, nav, posts, store, media
│   │       └── posts/
│   │           └── [postId]/edit/  Visual block editor (⚠ iframe + postMessage)
│   ├── brain/            Company Brain / AI knowledge base (23+ sub-routes)
│   ├── crm/              CRM — contacts, companies, deals, proposals, contracts
│   ├── projects/         Project management and kanban boards
│   ├── tickets/          Support ticket system
│   ├── surveys/          Survey builder and responses
│   ├── email/            Email campaigns, lists, templates, segments
│   ├── tools/            Booking, pitch decks (sub-tools)
│   │   ├── booking/      Booking management
│   │   └── pitch-decks/  Deck editor, list, presenter mode
│   ├── inbox/            Live chat agent inbox
│   ├── automations/      Automation rules + visual workflow builder
│   ├── experiments/      A/B experiment management
│   ├── publishing/       Multi-channel publishing kanban + calendar
│   ├── hosting/          Managed hosting list and detail
│   ├── branding/         Brand profile editor and style guide
│   ├── agency/           Agency white-label settings
│   ├── media/            Global media library
│   ├── snapshots/        Site snapshot export/import
│   ├── approvals/        MCP pending change approval queue
│   ├── apps/             Plugin federation iframe shell
│   ├── onboarding/       8-step new-tenant wizard
│   ├── settings/         Account, billing, AI keys, API keys, security (MFA), integrations
│   ├── integrations/     API key management
│   ├── invoices/         Invoice detail and payment
│   ├── my-tasks/         Cross-project personal task list
│   ├── suggested-projects/ Service request catalogue
│   └── standup/          AI standup summary
│
├── sites/                Per-tenant public site renderer (SSR)
│   └── [domain]/         Public pages, storefront, designer, checkout, account
│       └── [[...slug]]/  Catch-all block renderer
│
├── s/                    Public short-form routes (surveys, slides)
│   └── [slug]/           Public survey renderer
│
├── api/                  API routes (server actions via route handlers)
│   ├── portal/           Tenant-scoped REST API (auth required)
│   │   ├── cms/          Posts, blocks, media, taxonomies, templates
│   │   ├── crm/          Contacts, companies, deals, proposals, contracts
│   │   ├── brain/        Brain notes, search, decisions, documents, playbooks
│   │   ├── surveys/      Survey CRUD and responses
│   │   ├── email/        Email campaigns, lists, subscribers
│   │   └── ...           Other portal sub-APIs
│   ├── admin/            Admin-only API routes
│   ├── storefront/       Public storefront API (cart, checkout, orders)
│   ├── extension/v1/     Browser extension API surface
│   ├── mcp/              MCP server HTTP transport endpoint
│   ├── auth/             NextAuth route handlers
│   ├── cron/             Scheduled job endpoints (called by Railway/Vercel cron)
│   ├── realtime/         SSE endpoints (chat, presence)
│   ├── google-webhook/   Google push notification webhooks
│   ├── microsoft-webhook/ Microsoft Graph change notification webhooks
│   └── plugin-callback/  Plugin federation proxy
│
├── approve/[token]/      Public MCP approval reviewer page (page-scoped token)
├── contract/[token]/     Public contract e-signer page
├── book/[slug]/          Public booking time-slot picker
├── oauth/authorize/      OAuth 2.1 consent screen
├── slides/[slug]/        Public pitch deck viewer (global URL scheme)
├── pitch-deck/[slug]/    Public pitch deck viewer (alternate URL scheme)
├── widget/chat/          Embeddable chat widget shell
├── go/                   Redirect short-links (trigger link → automation bridge)
├── install/              Browser extension install flow
└── (public)/             Marketing / landing pages
```

---

## lib/ — Domain Logic and Integrations

All business logic, DB access, and integrations. Organized by domain.

```
lib/
├── db/                   Drizzle ORM setup and schema
│   ├── CLAUDE.md         ⬅ Read before touching schema or migrations
│   ├── index.ts          DB client singleton
│   └── schema/           Per-domain schema modules (one file per domain)
│       ├── auth.ts       Users, sessions, accounts
│       ├── brain.ts      Notes, decisions, people, meetings, documents, playbooks
│       ├── cms.ts        Posts, block templates, media, taxonomies, branding tables
│       ├── crm.ts        Companies, contacts, deals, proposals, contracts, pipelines
│       ├── surveys.ts    Surveys, questions, responses, logic
│       ├── email.ts      Campaigns, lists, subscribers, segments, templates
│       ├── store.ts      Products, orders, customers, variants, reviews
│       ├── pm.ts         Projects, kanban cards, sprints, checklists, tickets
│       ├── billing.ts    Subscriptions, invoices, usage meters, AI credits
│       ├── ab.ts         A/B experiments, variants, events
│       ├── approvals.ts  MCP approval queue and pending changes
│       ├── automation.ts Automation rules, workflow runs, trigger links
│       ├── chat.ts       Chat widgets, conversations, messages
│       ├── collab.ts     Collaboration sessions (Yjs)
│       ├── sites.ts      Client websites, domains, nav, hosting, snapshots
│       ├── publishing.ts Publishing pipeline stages and channels
│       ├── plugins.ts    Plugin registrations and federation
│       ├── productDesigner.ts Print designer sessions and saved designs
│       └── ...           Other schema modules
│
├── blocks/               Block type registry and rendering engine
│   ├── CLAUDE.md         ⬅ "Blocks are universal" invariant — read first
│   ├── registry.ts       Master block type registry (48+ types)
│   ├── defaults.ts       Default content per block type
│   └── html-render-*.ts  HTML/email rendering engine for blocks
│
├── mcp/                  MCP server (tools, scopes, approvals, telemetry)
│   ├── CLAUDE.md         ⬅ Tool registrar pattern and scope guards
│   ├── server.ts         MCP server bootstrap + tool registration
│   ├── tools/            One file per tool family (30+ files)
│   │   ├── cms.ts        CMS + sites + media tools (42 tools)
│   │   ├── brain.ts      Brain tools (large surface, see CLAUDE.md)
│   │   ├── crm.ts        CRM tools (35+ tools)
│   │   ├── kanban.ts     Project/kanban/ticket tools (40+ tools)
│   │   ├── billing.ts    Billing tools (4 tools)
│   │   ├── email.ts      Email campaign tools (19 tools)
│   │   ├── surveys.ts    Survey tools (6 tools)
│   │   ├── bookings.ts   Booking tools (15 tools)
│   │   ├── storefront.ts Storefront tools (25+ tools)
│   │   ├── pitch-decks.ts Deck tools (12 tools)
│   │   ├── approvals.ts  Approval tools (4 tools)
│   │   ├── automations.ts Automation tools (5 tools)
│   │   ├── branding.ts   Branding tools (13+ tools)
│   │   └── ...           Other tool families
│   ├── approvals.ts      MCP approval queue logic
│   ├── pending-changes.ts Staged change management
│   └── blocks-schema.ts  blocks:// MCP resource (block JSON schema)
│
├── ai/                   AI orchestration (70% coverage floor)
│   ├── CLAUDE.md         ⬅ Read before any AI/RAG work
│   ├── agent-loop.ts     Portal AI agent loop (intent → plan → tool calls)
│   ├── models.ts         Model resolution and BYOK key logic
│   ├── portal-tools/     Portal AI tool implementations (cross-domain actions)
│   ├── brain-tools/      Brain-specific AI tool implementations
│   ├── llm.ts            LLM call wrapper (Anthropic SDK)
│   ├── evals/            LLM eval harness
│   └── mastra/           Mastra integration
│
├── brain/                Company Brain / RAG logic (70% coverage floor)
│   ├── embeddings.ts     OpenAI embedding generation and storage
│   ├── embedding-queue.ts Async embedding pipeline
│   ├── decisions.ts      Decision log logic
│   ├── documents.ts      Document management with versioning
│   ├── playbooks, goals, initiatives, people, glossary, topics, ...
│   └── mcp-sdk-adapter.ts ⚠ 5630-line god file — spawn subagent, do NOT read inline
│
├── billing/              Stripe billing logic (70% coverage floor)
│   ├── entitlements.ts   Feature-gate entitlement checks
│   ├── subscription-items.ts Subscription + seat management
│   ├── usage-rollup.ts   Usage metering aggregation
│   └── seats.ts, usage-alerts.ts, dunning-emails.ts, ...
│
├── crm/                  CRM domain logic
│   ├── contacts.ts       Contact CRUD helpers
│   ├── companies.ts      Company CRUD helpers
│   ├── notifications.ts  CRM activity notifications
│   └── inbound-email.ts  Inbound email → CRM routing
│
├── email/                Email infrastructure (Resend outbound)
│   ├── index.ts          Send-email wrapper
│   ├── campaign-send.ts  Campaign blast execution
│   ├── build-campaign-html.ts Block → HTML email renderer
│   └── invite-email.ts, booking-emails.ts, ...
│
├── google/               Google Workspace integration
│   ├── drive-changes.ts  Drive change polling
│   ├── gmail-*.ts        Gmail push sync (watch, history, attachments)
│   ├── oauth.ts          Google OAuth flow
│   └── tenant-credentials.ts Per-tenant credential resolution
│
├── oauth/                SD OAuth 2.1 authorization server
│   ├── server.ts         PKCE + dynamic client registration
│   ├── scopes.ts         Scope definitions
│   └── cimd.ts           Client integrity / metadata discovery
│
├── crypto/               AES-256-GCM secrets management
│   ├── api-key.ts        API key generation and hashing
│   └── secrets.ts        Symmetric encrypt/decrypt (BYOK AI keys, OAuth tokens)
│
├── esign/                Contract e-signature
│   ├── dropbox-sign.ts   DropboxSign embedded signing integration
│   ├── status-machine.ts Contract status transitions
│   └── contract-pdf.ts   PDF renderer (TODO: themed)
│
├── automation/           Automation engine
│   ├── engine.ts         Rule evaluation and action dispatch
│   ├── nlp-parser.ts     NLP → rule structure parser
│   └── event-bus.ts      Internal automation event bus
│
├── publishing/           Multi-channel publishing pipeline
│   ├── active-client.ts  Active channel resolver
│   └── channels/         Channel implementations (email only; social = stub)
│
├── storefront/           Storefront auth and designer routing
│   ├── customer-auth.ts  Guest/customer session management
│   └── mcp-sdk-adapter.ts Storefront MCP tool adapter
│
├── stripe/               Stripe webhook handling and Checkout
│   ├── index.ts          Stripe client
│   └── site-stripe.ts    Per-site Stripe Connect
│
├── auth.ts               NextAuth v5 config
├── active-client.ts      Site-resolver — maps request host → tenant
├── portal-auth.ts        Portal session guards
├── api-key-middleware.ts API key auth middleware
├── mcp-auth.ts           MCP bearer token auth
├── portal.ts             Portal-scope utilities
├── sites/                Public site rendering helpers
├── chat/                 Chat widget + agent inbox logic
├── realtime/             Yjs CRDT collaboration helpers
├── visual-editor/        Visual editor state + postMessage protocol
├── agency/               Agency white-label (custom domain, DNS verify)
├── surveys/              Survey logic (scoring, branching, AI summary)
├── booking/              Booking availability and capacity logic
├── ab/                   A/B experiment bucketing and stats
├── branding/             Brand profile application to blocks
├── workflows/            Visual workflow durable queue and run history
└── ...                   Many more single-file utilities (see lib/*)
```

---

## components/ — UI Components

```
components/
├── portal/               Portal-specific UI (all client-facing panels)
│   └── visual-editor/    ⚠ Visual editor overlay + panels — own CLAUDE.md
│       └── CLAUDE.md     ⬅ Read before any visual-editor work
├── blocks/               Block rendering components (48+ types)
├── sites/                Public site UI components
├── ui/                   Primitive design-system components (Button, Input, etc.)
├── forms/                Form field primitives
├── brain/                Brain-domain UI components
├── email/                Email campaign UI components
├── storefront/           Storefront / e-commerce components
├── visual-editor/        Shared editor primitives (not portal-specific)
├── sections/             Full-page section components for marketing
├── marketing/            Marketing / landing page components
├── pitch-deck/           Pitch deck viewer and slide components
├── content-calendar/     Publishing calendar UI
├── animations/           Animation utilities and motion components
├── seo/                  SEO meta components
└── ...
```

---

## tests/ — Test Suite

```
tests/
├── CLAUDE.md             ⬅ Layer responsibilities and gate commands — read first
├── TESTING_PLAN.md       Full test strategy (what each layer covers)
├── CI-GATES.md           Coverage floors, gate commands, CI required checks
├── unit/                 Vitest fast unit tests (no DB, no network)
│   ├── ab-*.test.ts      A/B experiment logic
│   ├── ai-*.test.ts      AI/Brain unit tests
│   ├── survey*.test.ts   Survey logic
│   └── ...
├── integration/          Vitest integration tests (need Postgres)
│   ├── brain.test.ts     Brain/RAG integration
│   ├── crm.test.ts       CRM integration
│   ├── billing.test.ts   Billing integration
│   └── ...
├── e2e/                  Playwright end-to-end tests
│   ├── admin-*.spec.ts   Admin panel golden paths
│   ├── auth-*.spec.ts    Auth / MFA flows
│   ├── brain-*.spec.ts   Brain / AI flows
│   ├── visual-editor-blocks.spec.ts  ⚠ 1871-line E2E spec
│   └── ...
├── helpers/              Shared test utilities (DB setup, auth fixtures)
├── setup.ts              Global Vitest setup
└── setup-api.ts          API-layer Vitest setup
```

**Gate commands:**
- Unit only: `bun test` (or `scripts/test.sh --layer=unit --no-coverage`)
- Integration: `bun test:integration:local`
- Critical E2E: `bun test:critical` (run before declaring work done)
- Tenancy gate: `bun test:tenancy` (run after any data-access change)

---

## scripts/ — Utility Scripts

```
scripts/
├── test.sh               Unified test runner (--layer, --tag, --no-coverage)
├── seed-*.ts             Database seed scripts (dev, E2E, admin, brain, etc.)
├── billing/              Billing-specific migration scripts
├── brain/                Brain/embedding maintenance scripts
├── migrations/           One-off data migration scripts (hand-apply carefully)
├── security/             Security audit scripts
├── audits/               Audit result outputs
├── routines/             Cron routine scripts
├── start-local-db.sh     Spin up local Postgres for integration tests
├── verify-db-target.ts   Refuses to run against prod/staging URLs
├── check-doc-drift.ts    Validates that vault domain maps cite real paths
└── ...
```

---

## drizzle/ — Generated Migrations

```
drizzle/
├── 0000_baseline_2026_06_25.sql   Full schema baseline (do not edit)
├── 9001_*.sql / 9002_*.sql ...    Manual one-off migrations (hand-applied to prod)
└── meta/                          Drizzle migration metadata (do not edit)
```

**⛔ DON'T-TOUCH ZONE.** Edit `lib/db/schema/` modules, then run `bun run db:generate`. Never write SQL directly.

---

## docs/ — Documentation

```
docs/
├── agents/               Agent-readiness docs (this file and siblings)
│   ├── repository-map.md  ← you are here
│   ├── project-map.md    Domain → code location index
│   └── ...               (architecture-for-agents, ai-overview, api-index, etc.)
├── guides/               Developer how-to guides
│   ├── DATABASE.md       Drizzle setup and REST API patterns
│   ├── BLOCK_EDITOR_GUIDE.md Block JSON schema and examples
│   ├── USER_MANAGEMENT.md Auth and roles
│   ├── MCP_TOOLS.md      MCP tool reference
│   ├── BRAIN.md          Brain/RAG architecture
│   └── AB_TESTING_GUIDE.md A/B testing guide
├── skills/               SD-* skill reference docs
├── api/                  API reference
├── audits/               Audit outputs and reports
└── layers.md             Architecture layer diagram
```

---

## vault/ — Obsidian Knowledge Vault

```
vault/
├── 00 - Index.md         Vault navigation index
├── 02 - Architecture/    Architecture decision records (ADRs)
├── 03 - Domains/         Domain maps (one per product domain — 22 files)
│   └── *.md              Canonical source for: key files, schema, routes, tests, gotchas
├── 04 - Decisions/       ADRs (non-obvious decisions logged here)
├── 05 - Feature Specs/   Feature specs + Project Board (Kanban status tracker)
│   └── Project Board.md  ← canonical project status (Backlog → Shipped)
├── 06 - Validation/      Gate picking guide and test strategy docs
│   └── Gate Picking.md   "Which gate do I run?" decision guide
└── 07 - Operations/      Deploy, env, cron, migration how-tos
```

**Rule:** Domain Maps in `03 - Domains/` are the authoritative "how does X work" reference. Read the map before editing code in that domain. Update it after shipping.

---

## workers/ — Standalone Servers

```
workers/
├── realtime-server/      Yjs CRDT WebSocket server (Railway — separate deploy)
├── email-inbound/        Cloudflare Email Worker (inbound → brain/CRM routing)
└── sdk/                  Shared SDK package for workers
```

---

## God-file Warnings

These files are large — **spawn a subagent** rather than reading them into the main thread:

| File | Size | Notes |
|---|---|---|
| `lib/brain/mcp-sdk-adapter.ts` | 5630 lines | Brain MCP tool adapter |
| `tests/e2e/visual-editor-blocks.spec.ts` | 1871 lines | Visual editor E2E |
| `lib/mcp/server.ts` | Large | MCP server bootstrap |
| Any file in `lib/db/schema/` > 500 lines | Varies | Schema modules |

---

## Don't-Touch Zones

| Path | Reason |
|---|---|
| `drizzle/*.sql` | Generated — edit `lib/db/schema/` instead |
| `bun.lock` | Use `bun add` / `bun remove` |
| `worktree-agent-*` branches | Created by isolated agent sessions in other worktrees |
| Repo-root `*.png`, `_tmp-*.cjs`, `editor-snapshot.md`, `audit-verify-*.png` | Stale debug artifacts — gitignored, do not Read or commit |
| `extension/` | Separate tsconfig; excluded from main build |
