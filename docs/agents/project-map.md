# Project Map — "I need to work on X → go here"

Conceptual map of all 22 product domains: where the code lives, which schema module owns the data, which MCP tool family surfaces it, and the current shipping status.

**Siblings:** [repository-map.md](./repository-map.md) · [architecture-for-agents.md](./architecture-for-agents.md) · [ai-overview.md](./ai-overview.md) · [api-index.md](./api-index.md) · [tool-reference.md](./tool-reference.md) · [glossary.md](./glossary.md) · [/llms.txt](/llms.txt)

Before editing in any domain:
1. Read the Domain Map in `vault/03 - Domains/<domain>.md` — it has key files, gotchas, and test coverage notes.
2. Read the nearest nested `CLAUDE.md` (see [repository-map.md](./repository-map.md) for which dirs have them).
3. After shipping: update the Domain Map and move the Kanban card in `vault/05 - Feature Specs/Project Board.md`.

---

## Domain Table

| # | Domain | Portal Routes | Admin Routes | lib/ subsystem | Schema module | MCP tool family | Status |
|---|---|---|---|---|---|---|---|
| 1 | [Sites, Hosting & Publishing](#1-sites-hosting--publishing) | `app/portal/websites/`, `app/portal/hosting/`, `app/portal/publishing/`, `app/portal/snapshots/` | `app/admin/portal-websites/`, `app/admin/portal-hosting/` | `lib/sites/`, `lib/publishing/` | `lib/db/schema/sites.ts`, `lib/db/schema/publishing.ts` | `sites_*`, `nav_*`, `hosting_*`, `website_domains_*`, `website_env_vars_*` | Active — social/webhook channels stubbed |
| 2 | [CMS, Posts & Blocks](#2-cms-posts--blocks) | `app/portal/websites/[siteId]/posts/`, `app/portal/media/` | `app/admin/posts/`, `app/admin/media/` | `lib/blocks/` | `lib/db/schema/cms.ts` | `posts_*`, `block_templates_*`, `taxonomies_*`, `media_*` (42 tools total) | Active |
| 3 | [Visual Editor](#3-visual-editor) | `app/portal/websites/[siteId]/posts/[postId]/edit/` | — | `lib/visual-editor/`, `components/portal/visual-editor/` | (uses cms.ts posts) | (uses CMS tools + `blocks://schema` resource) | Active |
| 4 | [CRM](#4-crm) | `app/portal/crm/` | `app/admin/crm/` | `lib/crm/` | `lib/db/schema/crm.ts` | `crm_contacts_*`, `crm_companies_*`, `crm_deals_*`, `crm_pipelines_*`, `crm_activities_*`, `proposals_*`, `contracts_*`, `crm_custom_fields_*`, `crm_saved_views_*`, `crm_scoring_rules_*` (35+ tools) | Active — Phase 5 (AI insights, visitor tracking) pending |
| 5 | [Company Brain & AI (RAG)](#5-company-brain--ai-rag) | `app/portal/brain/` (23+ sub-routes) | `app/admin/portal-ai/`, `app/admin/ai-credits/` | `lib/brain/`, `lib/ai/` | `lib/db/schema/brain.ts` | `brain_*` (large surface), `ai_conversations_*`, `ai_credits_*` | Active — embedding pipeline is async |
| 6 | [Projects, Tickets & Kanban](#6-projects-tickets--kanban) | `app/portal/projects/`, `app/portal/tickets/`, `app/portal/my-tasks/`, `app/portal/suggested-projects/` | `app/admin/portal-projects/`, `app/admin/portal-tickets/` | `lib/` (pm-*.ts files at root) | `lib/db/schema/pm.ts` | `kanban_*`, `sprints_*`, `projects_*`, `tickets_*`, `my_tasks_list`, `suggested_projects_*`, `team_*` (40+ tools) | Active — SLA business-hours not implemented |
| 7 | [Bookings & Services](#7-bookings--services) | `app/portal/tools/booking/` | `app/admin/booking/` | `lib/booking/` | `lib/db/schema/sites.ts` (booking tables) | `booking_pages_*`, `bookings_*`, `gift_certificates_*`, `service_catalog_list`, `service_requests_*` (15 tools) | Active — quote flow has thin test coverage |
| 8 | [Email & Campaigns](#8-email--campaigns) | `app/portal/email/` | `app/admin/email/` | `lib/email/` | `lib/db/schema/email.ts` | `email_lists*`, `email_subscribers_*`, `email_campaigns_*`, `email_templates_*`, `email_segments_*` (19 tools) | Active — no scheduled dispatcher cron |
| 9 | [Storefront & Commerce](#9-storefront--commerce) | `app/portal/websites/[siteId]/store/` | `app/admin/portal-ecommerce/` | `lib/storefront/`, `lib/stripe/`, `lib/shipping/`, `lib/fulfillment/` | `lib/db/schema/store.ts` | `store_products_*`, `store_orders_*`, `store_customers_*`, `store_discounts_*`, `store_reviews_*`, `store_categories_*`, `store_customer_messages_*`, `store_settings_get` (25+ tools) | Active — checkout E2E missing; EasyPost/Printful have no integration tests |
| 10 | [Print Designer](#10-print-designer) | `app/sites/[domain]/design/[productSlug]/`, `app/sites/[domain]/designer/[productSlug]/` | — | `lib/designer/` | `lib/db/schema/productDesigner.ts` (new), `lib/db/schema/store.ts` (legacy) | None | Partial — fate decision (invest/defer/cut) open |
| 11 | [Surveys](#11-surveys) | `app/portal/surveys/` | — | `lib/surveys/` | `lib/db/schema/surveys.ts` | `surveys_list`, `surveys_get`, `surveys_list_responses`, `surveys_create`, `surveys_update`, `surveys_fork` (6 tools) | Active — webhook dispatcher is fire-and-forget |
| 12 | [Pitch Decks](#12-pitch-decks) | `app/portal/tools/pitch-decks/` | — | `lib/` (pitch-deck-*.ts files) | `lib/db/schema/cms.ts` (deck tables) | `decks_list`, `decks_get`, `decks_create`, `decks_update`, `decks_fork`, `decks_add_slide`, `decks_replace_slides`, `decks_delete`, `decks_upload_html*`, `decks_publish_*` (12 tools) | Active — A/B not wired into public viewer |
| 13 | [E-Sign & Approvals](#13-e-sign--approvals) | `app/portal/approvals/` | `app/admin/approvals/` | `lib/esign/`, `lib/mcp/approvals.ts`, `lib/mcp/pending-changes.ts` | `lib/db/schema/approvals.ts` | `approvals_list`, `approvals_get`, `approvals_approve`, `approvals_reject` (4 tools) | Active — no contract template CRUD API |
| 14 | [Automations & Workflows](#14-automations--workflows) | `app/portal/automations/` | `app/admin/automations/` | `lib/automation/`, `lib/workflows/` | `lib/db/schema/automation.ts`, `lib/db/schema/workflows.ts` | `automations_list`, `automations_toggle`, `automations_create`, `automations_update`, `automations_delete` (5 tools) | Active — visual workflow engine on dev branch pending staging migration |
| 15 | [Agency, Onboarding & Branding](#15-agency-onboarding--branding) | `app/portal/onboarding/`, `app/portal/branding/`, `app/portal/agency/` | `app/admin/clients/`, `app/admin/branding/` | `lib/agency/`, `lib/branding/`, `lib/onboarding/` | `lib/db/schema/cms.ts` (branding tables), `lib/db/schema/auth.ts` (tenant tables) | `branding_*`, `profile_get`, `profile_update`, `team_*`, `client_get`, `client_update` (13+ tools) | Active — Scale-tier only for white-label |
| 16 | [Billing & Stripe](#16-billing--stripe) | `app/portal/settings/billing/`, `app/portal/settings/plans/`, `app/portal/invoices/[id]/` | `app/admin/clients/[id]/plan/`, `app/admin/portal-invoices/`, `app/admin/subscriptions/`, `app/admin/ai-credits/` | `lib/billing/`, `lib/stripe/` | `lib/db/schema/billing.ts` | `invoices_list`, `invoices_get`, `ai_credits_balance`, `ai_credits_ledger` (4 tools) | Active — seat product requires per-env Stripe setup; monthly credit re-grant cron missing |
| 17 | [Auth & Security / MFA](#17-auth--security--mfa) | `app/portal/login/`, `/forgot-password/`, `/reset-password/`, `/invite/[token]/`, `/settings/security/`, `/settings/api-keys/` | `app/admin/login/`, `app/admin/users/` | `lib/auth.ts`, `lib/portal-auth.ts`, `lib/mcp-auth.ts`, `lib/crypto/`, `lib/totp.ts` | `lib/db/schema/auth.ts` | None (scope guards underpin all tools) | Active — TOTP/MFA shipped 2026-06-26; vault domain map is stale |
| 18 | [Google, Microsoft & OAuth Integrations](#18-google-microsoft--oauth-integrations) | `app/portal/settings/integrations/`, `app/portal/integrations/api-keys/`, `app/oauth/authorize/` | `app/admin/oauth-clients/` | `lib/google/`, `lib/microsoft/`, `lib/oauth/` | `lib/db/schema/auth.ts` (token tables) | `integrations_list`, `integrations_revoke` (2 tools) | Active — org-level Google connection unpopulated; MS BYO-app deferred |
| 19 | [AB Testing](#19-ab-testing) | `app/portal/experiments/` | — | `lib/ab/` | `lib/db/schema/ab.ts` | None | Active — deck/survey targets typed but not wired |
| 20 | [Chat, Realtime & Voice](#20-chat-realtime--voice) | `app/portal/inbox/` | — | `lib/chat/`, `lib/realtime/`, `lib/voice/` (dormant) | `lib/db/schema/chat.ts`, `lib/db/schema/collab.ts` | None | Active (chat + collab); Voice built but not mounted |
| 21 | [Plugins & Browser Extension](#21-plugins--browser-extension) | `app/portal/apps/`, `app/portal/apps/[appId]/` | — | `lib/plugins/`, `lib/extension/` | `lib/db/schema/plugins.ts` | None | Active — JWT TTL is 60s (do not extend without threat model) |
| 22 | [Agentic OS](#22-agentic-os) | — | `app/admin/agentic-os/` | `lib/agentic-os/` | — | None | Dev-only (404 in prod) |

---

## Domain Detail

### 1. Sites, Hosting & Publishing

**What it is:** Per-tenant website infrastructure. Creates and manages websites (domain routing, custom CSS/JS, navigation, branding, env vars) and hosting environments (Railway-backed managed apps). Publishing is a multi-channel content staging pipeline using a hidden kanban project.

**Public render:** `app/sites/[domain]/[[...slug]]/` — SSR from block tree in `posts.content`.

**Key lib files:** `lib/sites/host-resolver.ts`, `lib/sites/publish-nav.ts`, `lib/sites/publish-custom-code.ts`, `lib/publishing/channels/`

**⚠ Known stubs:** Social and webhook publishing channels not built. `site_snapshots.isPublic` marketplace feature has no logic. Full DB-lookup middleware host-header gate deferred.

---

### 2. CMS, Posts & Blocks

**What it is:** All content management. Posts store a JSON block tree (`{ blocks: Block[], version: '1.0' }`). 48+ registered block types, post types, custom fields, taxonomies, block templates, media library, and email block templates.

**Block lockstep:** adding or changing a block type touches 9 locations. Use the `simplerdev-block-type` skill — never hand-roll.

**Key lib files:** `lib/blocks/registry.ts` (master registry), `lib/blocks/html-render-*.ts` (email renderer)

**⚠ Known stubs:** `roi-calculator` block settings panel partially wired (16 inputs not connected).

---

### 3. Visual Editor

**What it is:** Block-based WYSIWYG page builder. Portal shell owns block state; a sandboxed iframe loads the live public-site renderer. Communication uses a typed postMessage protocol.

**Before touching:** Read `components/portal/visual-editor/CLAUDE.md` and the `simplerdev-visual-editor` skill.

**God file:** `tests/e2e/visual-editor-blocks.spec.ts` (1871 lines) — spawn subagent to read.

**⚠ Known stubs:** Voice assistant widget built but not mounted in portal layout.

---

### 4. CRM

**What it is:** Full per-tenant CRM — companies, contacts, deals (kanban pipeline), proposals, e-signed contracts, activities, notifications, lead scoring, custom fields, saved views.

**Browser extension surface:** `app/api/extension/v1/crm/`

**⚠ Known stubs:** `crmEnrichmentConfig.ownApiKey` stored plaintext (TODO: encrypt). Phase 5 (AI deal insights, visitor tracking, visual workflow builder) not yet implemented.

---

### 5. Company Brain & AI (RAG)

**What it is:** Per-tenant AI knowledge base with semantic search (OpenAI embeddings via pgvector). Stores notes, decisions, people, meetings, documents, playbooks, initiatives, goals, glossary, and org chart. Portal AI assistant handles cross-domain tool-based chat.

**Coverage floor:** 70% on `lib/ai/` and `lib/brain/`.

**God file:** `lib/brain/mcp-sdk-adapter.ts` (5630 lines) — **never read inline**; always spawn a subagent.

**⚠ Known stubs:** No real OTEL instrumentation. Embedding pipeline is async (can lag note creation). Voice meeting-mode integration built but dormant.

---

### 6. Projects, Tickets & Kanban

**What it is:** Full project management — sprints, kanban boards, epics/stories/tasks, time logging, dependencies, cycle-time and burndown reports. Support ticket system with SLA tracking.

**⚠ Known stubs:** SLA engine is calendar-hours only (no business-hours math). No cycle detection in blocker graph. `parentCardId` self-FK has no DB constraint.

---

### 7. Bookings & Services

**What it is:** Per-tenant scheduling — booking pages (services, availability, add-ons), public guest slot reservation, Stripe payments, Google Calendar sync, Zoom links, gift certificates, check-in.

**Public route:** `app/book/[slug]/`

**⚠ Known stubs:** Quote flow (`booking_quotes`) has thin test coverage — treat as experimental. `booking_pages` require admin approval via token link before going live.

---

### 8. Email & Campaigns

**What it is:** Marketing email (campaigns, subscriber lists, segments, A/B subject lines, scheduling) + transactional email (booking, order, invite). Outbound via Resend; inbound via Cloudflare Email Worker (`workers/email-inbound/`).

**⚠ Known stubs:** No automated scheduled-campaign dispatcher cron. `emailSegments.subscriberCount` cache not auto-refreshed. Soft-bounce suppression is an open TODO.

---

### 9. Storefront & Commerce

**What it is:** White-label e-commerce per tenant — product catalogue, cart, Stripe checkout, order management, EasyPost shipping, Printful POD fulfillment, customer accounts, reviews, discount codes.

**Public routes:** `app/sites/[domain]/` (product pages, cart, checkout, account)

**⚠ Known stubs:** Checkout golden-path E2E missing. EasyPost and Printful have no integration tests.

---

### 10. Print Designer

**What it is:** Fabric.js canvas product customization tool (text, icons, images on product mockups). AI image/text generation in canvas. Two coexisting routes and schema tables (`store.ts` legacy vs. `productDesigner.ts` current).

**⚠ Status:** Fate decision (invest/defer/cut) is **explicitly open**. No service entitlement gate. No portal nav entry. Treat as experimental.

---

### 11. Surveys

**What it is:** Multi-page forms with branching logic, scoring, A/B variants, CRM auto-routing, post-submission email sequences, AI summary, outbound webhooks.

**Public route:** `app/s/[slug]/` (form renderer) and `app/s/[slug]/results/` (aggregate results).

**⚠ Known stubs:** `maxResponses` gate has a documented race condition. Webhook dispatcher is fire-and-forget — BullMQ upgrade is Phase 4 TODO.

---

### 12. Pitch Decks

**What it is:** AI-authored presentation tool. Block-editor-based slides with draft/live overlay, AI generation, multi-user collaboration (Yjs), version history. Three public URL schemes.

**Public routes:** `app/slides/[slug]/`, `app/pitch-deck/[slug]/`, `app/sites/[domain]/slides/[slug]/`

**⚠ Known stubs:** A/B testing (`applyAbToDeckSlides`) implemented but not called on public render paths.

---

### 13. E-Sign & Approvals

**What it is:** Two sub-systems: (1) MCP Approval Queue — AI-authored changes staged as pending changes; human reviewers approve/reject via tokenized links or the portal queue. (2) Contract E-Signature — DropboxSign embedded e-sign or native per-signer email links.

**Public routes:** `app/approve/[token]/` (reviewer), `app/contract/[token]/` (signer)

**⚠ Known stubs:** No dedicated contract template CRUD API. `contract-pdf.ts` has TODO for themed PDF renderer. Approving an `email_campaign` does not trigger send.

---

### 14. Automations & Workflows

**What it is:** Two engines: (1) Automation Rules — event-driven, one-shot trigger → conditions → actions with NLP creation and scheduled rules. (2) Visual Workflow Builder — ReactFlow canvas with durable Postgres queue, retries, dead-letter, and run history.

**⚠ Known stubs:** Visual Workflow builder shipped to `dev` branch (2026-06-25) — pending staging migration. No MCP tools for visual workflow builder. Cron drainer is single-threaded.

---

### 15. Agency, Onboarding & Branding

**What it is:** Tenant lifecycle management — admin provisioning, self-serve signup, 8-step onboarding wizard, branding profile management (colors, typography, logos, messaging), agency white-label (custom portal domain, DNS TXT verification).

**⚠ Known stubs:** Sub-account resale UI not built. `lib/branding/` has no dedicated schema file — branding tables live in `cms.ts`.

---

### 16. Billing & Stripe

**What it is:** All money — AI credits (grants, purchase, ledger), per-module à-la-carte subscriptions with volume discounts, per-seat pricing, Stripe Checkout/webhook, usage metering and rollup, usage alerts, invoice management, BYOK AI key management.

**Coverage floor:** 70% on `lib/billing/`.

**⚠ Known stubs:** Seat line item requires `scripts/billing/create-seat-product.ts` per environment (go-live dependency). Monthly credit re-grant cron missing. `usage_meters` (older) and `usage_meter_events` (newer) coexist.

---

### 17. Auth & Security / MFA

**What it is:** NextAuth v5 sessions, MCP bearer-token auth, OAuth 2.1 authorization server (PKCE, RFC 7636, dynamic client registration), AES-256-GCM BYOK key encryption, rate limiting (Upstash Redis, fail-open), TOTP/MFA.

**Note:** TOTP enrollment, login TOTP field, and MFA-disable shipped 2026-06-26. The vault domain map at `vault/03 - Domains/Auth & Security.md` has a known drift — "MFA not implemented" is stale.

**⚠ Known limits:** JWT is stateless; deactivated users keep sessions up to 60s by design. Edge middleware cannot do DB-lookup host validation (deferred to Wave 3).

---

### 18. Google, Microsoft & OAuth Integrations

**What it is:** Connects tenants to Google Workspace (Gmail push/sync, Drive polling, Calendar availability, Contacts sync) and Microsoft 365/Teams (Graph change notifications). Also hosts the SD OAuth 2.1 authorization server that issues scoped tokens to MCP clients.

**⚠ Known stubs:** No active route populates `google_workspace_client_connections` — only user-level connections via legacy route. Microsoft BYO-app credentials deferred. Refresh tokens in user-level tables stored plaintext (hardening TODO).

---

### 19. AB Testing

**What it is:** Server-side split testing for public content. FNV-1a deterministic visitor bucketing, view/goal event logging, two-proportion z-test significance dashboard. Polymorphic target model (post, deck — survey and email reserved but not wired).

**⚠ Known stubs:** Survey and email AB targets typed but not wired (`lib/ab/access.ts` returns `null`). One running experiment per target enforced by UI guard only (no DB unique constraint).

---

### 20. Chat, Realtime & Voice

**What it is:** Three real-time capabilities: (1) Visitor web chat widget with agent inbox (Postgres LISTEN/NOTIFY, SSE). (2) Yjs CRDT collaboration for visual editor and pitch decks (Railway WebSocket server in `workers/realtime-server/`). (3) OpenAI Realtime API voice assistant with CRM/Brain tools.

**⚠ Known stubs:** Voice assistant built but not mounted — no env vars documented, no E2E. Chat rate limiter is in-memory only (no horizontal scale). `brainEnabled` on `chat_widgets` is schema-only.

---

### 21. Plugins & Browser Extension

**What it is:** Two extension mechanisms: (1) Plugin federation — independently-deployed Next.js apps embed inside the portal under `/portal/apps/<slug>/*` via HMAC-JWT proxy. (2) Browser Extension (MV3 Vite/React) for page capture, CRM creation, Brain notes, and activity logging.

**⚠ Security note:** Plugin JWT TTL is 60s — do not extend without threat-model review. Extension is fully excluded from the main tsconfig.

---

### 22. Agentic OS

**What it is:** Admin-only developer dashboard for Claude Code skills, cron jobs, and subagent patterns. Fires on-demand skills as headless `claude -p` subprocesses, streams stdout as SSE.

**⚠ Dev-only:** Returns 404 on any deployed environment (`NODE_ENV !== 'development'`). In-process child map does not survive restart.

---

## Quick-Reference: Schema Module → Domain

| Schema module | Owns tables for |
|---|---|
| `lib/db/schema/auth.ts` | Users, sessions, accounts, tenant records, OAuth tokens |
| `lib/db/schema/brain.ts` | Notes, decisions, people, meetings, documents, playbooks, initiatives, goals, glossary |
| `lib/db/schema/cms.ts` | Posts, block templates, media, taxonomies, branding profiles, deck tables, nav |
| `lib/db/schema/crm.ts` | Companies, contacts, deals, proposals, contracts, pipelines, activities |
| `lib/db/schema/surveys.ts` | Surveys, questions, responses, logic rules, variants |
| `lib/db/schema/email.ts` | Campaigns, lists, subscribers, segments, templates |
| `lib/db/schema/store.ts` | Products (legacy designer included), orders, customers, variants, reviews, discounts |
| `lib/db/schema/pm.ts` | Projects, kanban cards, sprints, checklists, tickets, time logs |
| `lib/db/schema/billing.ts` | Subscriptions, subscription items, invoices, usage meters, AI credits |
| `lib/db/schema/ab.ts` | A/B experiments, variants, events, goals |
| `lib/db/schema/approvals.ts` | MCP approval queue, pending changes |
| `lib/db/schema/automation.ts` | Automation rules, trigger links, run logs |
| `lib/db/schema/chat.ts` | Chat widgets, conversations, messages |
| `lib/db/schema/collab.ts` | Yjs collaboration sessions |
| `lib/db/schema/sites.ts` | Client websites, domains, nav, hosting, snapshots, booking pages/slots |
| `lib/db/schema/publishing.ts` | Publishing pipeline stages and channel config |
| `lib/db/schema/plugins.ts` | Plugin registrations and federation metadata |
| `lib/db/schema/productDesigner.ts` | Print designer sessions and saved designs (current) |
