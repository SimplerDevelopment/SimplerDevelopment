# Portal Feature Gap Report

_Generated: 2026-05-04. Baselines: internal planning docs (`.planning/REQUIREMENTS.md`, `ROADMAP.md`, `MILESTONES.md`, `PROJECT.md`, `STATE.md`, `audits/companyBrain.md`, `audits/companyBrain-adjusted.md`, `audits/cms-blocks-audit.md`, `crm-improvements/PLAN.md`), competitor parity (trained-knowledge categorical leaders), code-reality audit (file-level scan of `app/portal/**` + `app/api/portal/**`)._

---

## How to read this

- **Implemented**: what actually exists in `app/portal/<area>` and the `/api/portal/<area>` handlers, derived from a directory scan + sampling. Page-line counts cited where useful.
- **Stated (planned)**: a feature that appears as a goal in a planning doc (or a roadmap phase) but is not built. Citations point at the doc + section.
- **Competitor parity**: features that named SaaS competitors ship by default that we don't. Trained-knowledge only — no live web check at writing time. Where I'm uncertain about a category leader I say so.
- **Stubs / half-built / TODO**: redirect-only pages, "Coming soon", missing handlers, fields with no UI, wired routes returning 501, etc. File:line citations included.
- **Gap severity**: HIGH = multiple stated features missing AND clear competitor parity gap; MED = one of those; LOW = area is essentially complete vs. its own goalposts.

The internal planning docs are dominated by the **survey-system milestone** and the **Company Brain spec**. Outside those two, "stated but not built" claims have to come from the CRM-improvements plan, the cms-blocks audit, and the README of features in `dashboard/page.tsx`. For most other areas the planning record is thin — that itself is a finding. Where this report says "no documented spec," that means there's no internal stated feature to gap-check against, only competitor parity.

---

## Summary scoreboard

| Area | Implemented (rough) | Stated (planned, missing) | Competitor parity gap | Gap severity |
|---|---|---|---|---|
| approvals | List + detail + per-item approve/reject + bulk approve/reject; filter by status/entityType | _no internal spec beyond what's built_ | No notification/email on pending; no SLA; no policy rules; no diff viewer for non-block payloads | LOW |
| automations | _Top-level redirects to `/portal/brain/automations`_; engine itself is mature (NLP parse + product presets + rules + logs) | Survey scoring auto-routing (`SCORE-02`), webhook-triggered automations, scheduled triggers | Multi-step branching (Zapier paths); error-recovery handlers; rate limiting; impersonation context; sandbox/dry-run; per-customer cron schedules | MED |
| brain | All 13 routes built (relationships overlay, communications/meetings, tasks, knowledge, ask chat, calendar, prospects redirect, automations, settings, review redirect, connect-AI). Has Drive sync + Gmail thread grouping + AI review queue + industry templates | pgvector embeddings (Phase 6 of `companyBrain-adjusted.md`), Zoom/Meet recording adapters (D/E/F), confidentiality-level enforcement, audit-log retention SLAs | Bidirectional links between knowledge notes, "Relation" property type, AI-summarize-this-page, in-line @mentions of any brain entity, version history per record (vs. Notion); semantic search (vs. Glean); pgvector hybrid search (vs. Mem) | MED |
| branding | Profile CRUD, theme generation (AI), messaging (AI), block-copy (AI), audit endpoint, brand guide page, default mappings; site-level assignment | _no documented further requirements_ | Logo variant management (light/dark/icon), font foundry licensing UI, color contrast WCAG checker, brand voice training samples, asset usage analytics (vs. Frontify, Brandfolder) | LOW |
| crm | Contacts, companies, deals, proposals, contracts, activities, custom fields, saved views, scoring rules, tags, pipelines/stages, mentions, dashboard, analytics, import/export, dedupe/merge, send-email, deal artifacts, deal comments | Phase 3B notifications system (CRM-improvements/PLAN.md §3B) — schema + bell + dropdown not visible in `app/portal/crm`; recurring revenue tracking (PLAN.md §4B); email-open pixel tracking; 2-way sync (Gmail/Calendar); territory/team-routing rules | Workflow automation builder (HubSpot, Salesforce); deal forecasting/probability ML; AI call summarization; sales sequences; territory management; compound-condition rules editor | MED |
| dashboard | Service-tile launcher with rich metadata + brain widgets + recent tickets + recent invoices + open project counts + open ticket count + AI credit balance | _no documented spec_ | Drag-to-customize widgets; saved layouts; cross-product unified search; favorites/pins; activity feed (vs. Linear's home, Asana's Inbox) | LOW |
| email | Lists, segments (with rule engine), tags, templates (block editor), campaigns + send + analytics, subscribers; automations page redirects to `/portal/brain/automations?tab=presets` | Survey email follow-ups (`DIST-01/02`); A/B subject-line testing; deliverability dashboard; double opt-in confirmation flow | Drip sequences with branching (Mailchimp Customer Journeys, ActiveCampaign Automations); send-time optimization; predictive subject-line scoring; SMS bridge; unified inbox for replies; advanced segmentation operators; dynamic blocks per segment | MED |
| hosting | List of hosted sites + plan/status badges + per-site detail page (134 + ~unknown lines for `[id]`) | _no documented further requirements_ | Real-time uptime/perf monitoring (Vercel Speed Insights, Cloudflare); CDN cache controls; per-environment env vars (some of this is in `websites/[siteId]/environments`); WAF/bot rules; build-time analytics; rollback to prior deploy with one click | MED |
| invoices | Single detail page + Stripe checkout per invoice; list lives under `/portal/settings/billing` not `/portal/invoices` | Stored payment methods detach from Stripe (TODO in `app/api/portal/billing/payment-methods/route.ts:44`) | Payment plans / installments; ACH / bank transfer; multi-currency; partial payments; PDF invoice templating; tax computation; line-item refunds (vs. Stripe Billing, Chargebee) | MED |
| media | Library list + upload + per-item edit (delete, alt, caption, branding-profile assignment) + version history + restore | _no documented further requirements_ | AI alt-text generation, AI image edit (background removal, upscale), face/object recognition for tagging, focal-point picker for responsive crops, video transcoding, asset-usage report (vs. Cloudinary, Bunny Stream) | LOW |
| my-tasks | Cross-project list keyed off `kanban_cards` assigned to me; filter open vs. all; due-date sort; priority + label badges + checklist progress | Brain tasks aren't aggregated here (only kanban cards are); no calendar view; no swimlane by project; no date picker for create-from-here | Quick-add input (Linear, Asana); time-blocking integration; saved filters; today/upcoming/scheduled tabs (vs. Todoist, Things 3, Linear My Issues); mobile push reminders | MED |
| projects | Kanban board + sprints + files tab + webhooks panel + automations preset page + per-project agency/private toggle + status control + columns reorder + labels + checklist items + assignees + dependencies | Time tracking; burndown/velocity charts (sprints exist but no analytics); resource-utilization view; baseline/critical-path | Gantt view (Asana, MS Project); workload view; portfolio dashboard; goal/OKR linkage; AI breakdown of large tasks (Linear Insights, Notion Q&A); custom fields on cards; subtasks (vs. Asana, Jira) | MED |
| services | Service catalogue + active/buy CTAs + service-request form (per-service field schema) | _no documented further requirements_ | In-product service comparison matrix; bundled-discount calculator; per-service onboarding workflow; usage meters per service; trial-period management (vs. Stripe Checkout subscription bundles) | LOW |
| settings | Sub-pages: profile, billing, team, api-keys (MCP+OAuth), integrations (Google Workspace), ai (chat history + credits), support | SSO/SAML; granular role permissions matrix; audit log of admin actions; data export (GDPR); device sessions/MFA-per-device | SSO/SAML (vs. WorkOS-style platforms, Linear), audit log viewer (vs. Linear, Vanta integrations), usage limits/caps UI (vs. Stripe Customer Portal), session/device management (vs. Slack), seats vs. members billing model | MED |
| suggested-projects | List with category filter + detail + request-to-start form; admin can publish per-client or globally | _no documented further requirements_ | Internal upsell automation (predictive next-best service); price-anchoring; ROI calculator; before/after gallery; client testimonials per service tier | LOW |
| surveys | List + new (with templates) + detail (1217-line builder) + responses route + export | The vast majority of `REQUIREMENTS.md` (FOUND-01 through PDF-02) is open. Conditional UI is only an info badge (lines `components/admin/SurveyBuilder.tsx:217–293`) — no rule-builder modal, no flow diagram, no piping evaluator, no webhook config UI, no scoring-config UI, no public results page, no AI summarization, no A/B testing, no PDF certificates, no real-time SSE dashboard, no partial-response capture, no file-upload field, no email follow-ups | Logic Jump editor (Typeform); branching diagram (Qualtrics SurveyFlow, Jotform Conditional Logic); embed widgets per segment (Typeform); AI text-response themes (Qualtrics XM Discover); team workspaces; multi-language survey i18n; quotas; randomization (vs. Qualtrics, SurveyMonkey, Typeform) | HIGH |
| tickets | New ticket form + detail with thread + reply form (clients see non-internal messages, staff see all) | No assignment to specific staff member, no ticket-status workflow controls in client view, no SLA timer, no canned responses, no ticket merge | Macros/canned replies (Zendesk, Intercom); CSAT survey on close; ticket merge/split; SLA policies; round-robin assignment; live-chat fallback; AI suggested replies (vs. Intercom Fin, Zendesk AI Agents); knowledge-base deflection | HIGH |
| tools — booking | Page list + per-page detail (1200+ lines) with availability/add-ons/waivers/members/date overrides + bookings list + refunds + Google Calendar OAuth + Zoom OAuth + analytics + check-in flow + quotes (paid intake) + bulk waiver download + add-ons-from-products | _no documented further requirements_ | Group classes with capacity (Mindbody) — partially supported via groupSize but no waitlist; payment plans; package/series sales; recurring memberships beyond basic; SMS reminders (vs. Acuity, Calendly, SimplyBook.me) | LOW |
| tools — pitch-decks | List + new (template + AI generation) + detail (3250-line block-based slide editor) + presenter mode + slide-preview iframe + version history + per-slide regenerate + batch-edit + upload-html ingestion | _no documented further requirements_ | Live audience polling/Q&A (Mentimeter, Slido); analytics on viewer engagement (Pitch.com); collaborative cursors; presenter-notes teleprompter; template marketplace; smart layouts (vs. Gamma, Tome, Pitch) | LOW |
| tools — gift-certificates | List + create + status badges; redemption code generated per cert | No partial-redemption history view; no bulk-issue UI; no expiry-policy editor; no gift-card balance lookup public widget | Multi-store gift-card pooling (Shopify Plus); branded e-card design templates; Apple Wallet pass; recipient personalization (video/audio); referral/bonus credit (vs. Givex, GiftUp) | MED |
| websites — CMS | Per-site: posts list + new + edit (visual editor) + entries + categories + tags + content-types + content-type fields + content-type template + taxonomy + content calendar + media + custom code (`code/page.tsx`) + branding + navigation (with mega menu) + automations + settings + deployments (within settings) + Google connection (Search Console + Analytics) + API keys + collaborators + environments + domain + status + logs | Bidirectional internal links between posts (Brain has them — CMS doesn't); A/B page testing; SEO scoring tool inline (Yoast-style); redirect manager UI (rule list); 404 monitor; staging-vs-prod content sync | Page-level A/B testing (Optimizely, Webflow Optimize); built-in A11y scanner (Webflow Audit); collaborative real-time editing (Webflow, Wordpress.com Studio); page versioning + restore (Wix, Webflow); page comments for review workflows | MED |
| websites — store | Settings (Stripe Connect) + products (with options/variants/bulk-pricing) + orders (per-order detail) + categories + discounts + shipping (zones + rates) + analytics + per-site emails | Tax computation rules; abandoned-cart recovery flows; product reviews; subscription products; gift-card-store integration; product reviews; inventory low-stock alerts (have `lowStockItems` count but no alert flow) | Subscription products (Shopify Recharge); abandoned-cart sequences (Klaviyo, Shopify Email); product reviews (Yotpo, Loox); B2B pricing tiers; multi-currency; tax-exempt customers (vs. Shopify, WooCommerce, BigCommerce) | MED |
| websites — email-templates | Per-site transactional templates indexed by event (`store/account/booking/content` categories), enable/disable per template, block-based editor | _no documented further requirements_ | Send-test-with-real-data, deliverability check, per-event analytics breakdown, fallback chain, locale variants per template (vs. Postmark templates, Customer.io) | LOW |
| websites — nav | Mega menu builder with mega panels, columns, featured images, icons, button toggles, per-link branding | _no documented further requirements_ | Smart navigation (auto-rebuild on content change), A/B nav variants, footer/sidebar nav editor parity, sticky-on-scroll preset, multi-language (vs. Webflow Navigator) | LOW |
| websites — deployments | Provisioning status + deployment list + Vercel integration + GitHub repo connection + custom domains + verification flow + environments (vars + copy + sync + backup + restore) | _no documented further requirements_ | Per-deployment preview comments (Vercel Comments); per-PR preview URLs; rollback-on-error; build-time secrets rotation UI; per-environment domain mapping; rate-limit/firewall rules (vs. Vercel, Netlify, Cloudflare Pages) | LOW |

---

## By area

### `/portal/approvals`

**Competitors compared:** GitHub Pull Request reviews, Linear Reviews/Approvals, Notion Database review state.

**What's implemented (code reality):**
- `app/portal/approvals/page.tsx` — single 642-line client page with status filter (pending/applied/rejected/failed/expired/all), entityType filter (post, pitch_deck, pitch_deck_slides, proposal, email_campaign), per-item approve/reject UI, bulk approve/reject toolbar, expandable detail showing payload + originalSnapshot.
- API endpoints (full set): `GET /api/portal/approvals`, `GET /api/portal/approvals/[id]`, `POST /api/portal/approvals/[id]/approve`, `POST /api/portal/approvals/[id]/reject`, `POST /api/portal/approvals/bulk-approve`, `POST /api/portal/approvals/bulk-reject`.
- Tied into the `mcpPendingChanges` table — this is the human-approval queue for AI/MCP-initiated mutations (covered in `companyBrain-adjusted.md` §6 as the cross-cutting AI safety primitive).

**What's stated in planning docs but not built:**
- Nothing: this area was built without a written spec. The companyBrain doc (`companyBrain-adjusted.md` §6) references "ai_review_items" as a concept but Brain has its own queue (`brain_ai_review_items`) separate from `mcpPendingChanges`. Worth documenting; not a missing feature.

**What competitors have that we don't:**
- Side-by-side diff viewer for the proposed payload vs. the current snapshot. Today the page renders both as JSON blobs; GitHub-style structured diffs (especially for blocks JSON) would help.
- Email/Slack notifications on a pending approval. The page shows the queue, but there's no proactive nudge.
- SLA timers ("auto-approve after 24h" / "auto-reject after 7 days"). The schema has an `expired` status — there's no UI to configure the policy.
- Reviewer-assignment rules (which approver can sign off on which entity type, e.g., only admin can approve `email_campaign`).
- Conversation thread on a pending change ("why is this proposed?").

**Stubs / half-built / TODO:**
- None obvious. The implementation is complete relative to its (undocumented) goals.

**Gap severity:** LOW — it does the job; missing features are nice-to-haves, not must-haves.

---

### `/portal/automations`

**Competitors compared:** Zapier, n8n, Make, HubSpot Workflows, Mailchimp Customer Journeys.

**What's implemented (code reality):**
- `app/portal/automations/page.tsx:1–5` — **redirect-only stub** to `/portal/brain/automations`. The actual builder lives there now.
- `/portal/brain/automations/page.tsx` (882 lines): list of rules, presets browser (`PRODUCT_PRESET_GROUPS`), edit/enable/disable, execution history (`AutomationLog`), `executionCount` counters.
- API: `GET/POST /api/portal/automations`, `GET/PUT/DELETE /api/portal/automations/[id]`, `POST /api/portal/automations/parse` (NLP — Claude-backed parser of natural-language descriptions, gated on AI credits via `hasCredits`/`deductCredits`), `GET /api/portal/automations/logs`.
- Per-product preset pages also exist: `app/portal/projects/automations/page.tsx`, `app/portal/email/automations/page.tsx` (though both redirect to brain), `app/portal/websites/[siteId]/automations/page.tsx` (per-site notifications + automation settings).

**What's stated in planning docs but not built:**
- Survey scoring auto-routing — `REQUIREMENTS.md` §SCORE-02: "Scored responses can auto-route leads to CRM deals based on configurable score thresholds." Survey doesn't yet emit a scoring event; automations engine has no "create CRM deal from survey response" handler.
- Webhook-triggered rules — `REQUIREMENTS.md` §HOOK-01: "User can configure per-survey webhook URLs that receive response payloads." Inbound webhooks (a non-survey trigger source) aren't a thing; only outbound webhooks (BullMQ) are planned.
- Scheduled/cron triggers — `automation_rules` schema is event-driven only; no built-in time-based trigger (e.g. "every Monday at 9am send X").

**What competitors have that we don't:**
- **Multi-step branching** — Zapier's "Paths," HubSpot's if/then branches in workflows. Today actions are a flat array, evaluated sequentially with optional `delay`.
- **Error-recovery handlers** — Make.com's "error route" / "rollback." Today a failure logs an `errorMessage` to `automation_logs` but there's no compensating action UI.
- **Sandbox/dry-run mode** — Zapier and n8n let you replay a recent trigger sample. The closest we have is `executionCount` and audit logs.
- **Rate limiting** — per-rule throttle ("don't fire more than 5x/hour"). Not visible.
- **Marketplace of community recipes** — Zapier templates, Make scenarios. We have product presets, not a sharable library.

**Stubs / half-built / TODO:**
- The legacy `app/portal/automations/page.tsx:1–5` and `app/portal/email/automations/page.tsx:1–5` are bare redirects — fine as compatibility shims, worth documenting in nav consolidation work.

**Gap severity:** MED — the engine is mature for an in-house build but has clear feature ceilings vs. Zapier/n8n.

---

### `/portal/brain`

**Competitors compared:** Notion, Mem.ai, Glean, Obsidian, Reflect, Granola.ai (meeting AI).

**What's implemented (code reality):**
- 13 page routes, all built (full list via `find app/portal/brain -name page.tsx`):
  - `page.tsx` — dashboard (167 lines).
  - `connect/page.tsx` — Connect AI (Claude/ChatGPT/Cursor MCP setup, 296 lines).
  - `relationships/page.tsx` (530 lines) + `[id]/page.tsx` (385 lines) — overlay-style augmentation of `crm_companies`/`crm_deals` with priority/status/service-lines/staleAfter/confidentiality.
  - `communications/page.tsx` (173 lines, with Gmail-thread grouping) + `new/page.tsx` + `[id]/page.tsx` (552 lines) + `[id]/review/page.tsx` (415 lines, AI review queue with approve/reject).
  - `tasks/page.tsx` (1186 lines, full kanban with dnd-kit + tabs for review).
  - `knowledge/page.tsx` (266 lines, three-pane IDE-style shell with markdown editor + outline + backlinks + fields panel) + `[id]/page.tsx`.
  - `calendar/page.tsx` (643 lines, agenda + month view, Google Calendar source).
  - `prospects/page.tsx` — **redirect-only** to `/portal/brain/relationships?view=stale` (intentional unification with relationships).
  - `review/page.tsx` — **redirect-only** to `/portal/brain/tasks?tab=review` (also intentional).
  - `automations/page.tsx` (882 lines, the canonical home of the automations engine).
  - `ask/page.tsx` (lines unchecked, but referenced from connect/page).
  - `settings/page.tsx` (421 lines — module toggles, industry templates, confidentiality default).
- API surface: 31 routes under `/api/portal/brain/*`, including `dashboard`, `adapters`, `knowledge` (CRUD + upload + attachments + fields + backlinks), `review`, `relationships`, `communications` (CRUD + process + review), `tasks` (CRUD + promote-to-kanban), `drive-sync`, `calendar/agenda`, `calendar/events`, `crm-suggestions`, `search`, `promotion-targets`, `dataview`.
- Industry templates active (per `companyBrain-adjusted.md` §3) — wealth_advisory + generic, with module toggles and confidentiality levels.
- Drive sync adapter (`adapters` route + `drive-sync` route): the spec's Adapter D is partially in.

**What's stated in planning docs but not built:**
- **Embeddings / pgvector hybrid search** — `companyBrain-adjusted.md` §6 "Phase 6 — Embeddings (deferred, separate epic)". Today Ask Brain is keyword search only.
- **Adapter E (Google Meet recordings)** and **Adapter F (Zoom)** — `companyBrain-adjusted.md` §7. Drive watch is partial; Meet recordings = explicit follow-up; Zoom = "opportunistic."
- **Real per-record ACLs** — `companyBrain-adjusted.md` §11.3: "Real RLS / per-record ACLs are out of scope unless the product demands it." Today `confidentialityLevel` is stored but enforcement is a UI filter, not a query-level guard.
- **Audit-log retention SLAs** — same section. `brain_audit_logs` rows are written but no retention policy UI.
- **Service-entitlement billing for Brain** — `companyBrain-adjusted.md` §11.8: "Need a SKU + price for the `brain` service category before turning it on for paying clients." Not visible in `services` seed.

**What competitors have that we don't:**
- **Bidirectional links** between knowledge notes (Notion, Obsidian, Reflect). We have one-direction links + a `backlinks` panel — close, but not graph view.
- **AI summarize-this-page** scoped to a single knowledge note (Notion Q&A, Mem AI). We have meeting summaries (right approach for transcripts) but no `summarize` action on a freeform note.
- **In-line mentions of any brain entity** (`@person`, `@deal`, `@meeting`). Knowledge fields panel has structured links; mention syntax in the markdown body isn't visible.
- **Version history per note/relationship** (Notion, Obsidian Sync). `brain_audit_logs` records the action but there's no diff viewer.
- **Database property: Relation** — Notion-style typed relations between knowledge notes. The `fields` panel is custom-fields-style; multi-relation per note isn't a first-class type.
- **Semantic search ranking** (Glean, Mem) — gated on pgvector.

**Stubs / half-built / TODO:**
- `app/portal/brain/prospects/page.tsx:1–5` — redirect (intentional, not a stub).
- `app/portal/brain/review/page.tsx:1–5` — redirect (intentional).
- The settings page allows toggling `meetings`/`tasks`/`knowledge`/`prospects`/`calendar` modules — but the routes aren't gated on those toggles in the page handlers; toggling off doesn't 404 the page.

**Gap severity:** MED — most of the spec is built but the differentiator features (semantic search, real confidentiality enforcement, pgvector) are deferred.

---

### `/portal/branding`

**Competitors compared:** Frontify, Brandfolder, Bynder, Webflow Style Guides.

**What's implemented (code reality):**
- `app/portal/branding/page.tsx` (323 lines) — list of profiles + tab for site-assignments + "set default" + create.
- `[profileId]/page.tsx` (~1200+ lines based on placeholder counts) — full profile editor with primary/secondary/accent colors, fonts, voice/tone, audience, positioning, messaging tabs, AI generate-theme, AI rewrite-field, AI generate-block-copy, AI generate-messaging.
- `[profileId]/guide/page.tsx` — public brand guide.
- API: 10 endpoints — `branding`, `branding/profiles`, `branding/profiles/[id]`, `branding/audit`, `branding/defaults`, `branding/messaging`, `branding/generate-theme`, `branding/generate-messaging`, `branding/generate-block-copy`, `branding/rewrite-field`. AI-heavy.

**What's stated in planning docs but not built:**
- Nothing surfaces as a stated-but-missing feature. No internal spec.

**What competitors have that we don't:**
- **Logo variant management** (Frontify, Brandfolder) — light/dark/icon-only/horizontal/stacked variants in a single asset record. Today we store one `logoUrl` per profile.
- **Color contrast WCAG checker** — Frontify Style Guides flag combinations that fail AA/AAA. We have generate-theme but no on-edit contrast warnings.
- **Font foundry licensing UI** — Frontify Brand Portal tracks license seats per typeface.
- **Brand voice training samples** — paste 5 examples → AI fine-tunes the voice tone. Our `generate-messaging` works but doesn't feed forward into block-copy on other blocks consistently.
- **Asset usage analytics** — "this logo was used in 12 emails and 4 websites" (Brandfolder).

**Stubs / half-built / TODO:**
- None obvious from the scan.

**Gap severity:** LOW — the area is solidly built and AI-rich.

---

### `/portal/crm`

**Competitors compared:** HubSpot CRM, Pipedrive, Salesforce, Attio, Folk.

**What's implemented (code reality):**
- Pages: `page.tsx` (345-line dashboard with win-loss, revenue-by-month, pipeline funnel, top deals, MRR/ARR, activity counts), `contacts/page.tsx` (611 lines), `contacts/[id]/page.tsx`, `companies/page.tsx`, `companies/[id]/page.tsx`, `deals/page.tsx` (1469 lines!), `proposals/page.tsx` (772 lines) + `[id]`, `settings/page.tsx`, `layout.tsx`.
- 41 API routes — proposals (CRUD + send), analytics, scoring-rules CRUD, activities, proposal-templates CRUD, custom-fields CRUD + values, export, import + preview, notifications, companies CRUD, saved-views CRUD, contracts CRUD + send, contacts CRUD + merge + duplicates + titles + emails + score + send-email, deals CRUD + comments + artifacts + artifacts/available, mentions, pipelines + stages CRUD, tags CRUD, dashboard.
- Most of the CRM-improvements PLAN is in: custom fields (Phase 1A done), ownership (1B partially — ownerId on deals), dedupe (1C done), pipeline analytics (2A done), lead scoring (2B done — `crm_scoring_rules` + score on contacts), saved views (2C done), email integration (3A done — `contacts/[id]/send-email`), bulk import/export (4A done).

**What's stated in planning docs but not built:**
- **Notification system** — `crm-improvements/PLAN.md §3B`: schema `crm_notifications`, bell icon in header, dropdown UI, unread count. The API route `app/api/portal/crm/notifications/route.ts` exists but the bell-icon header dropdown isn't visible in `app/portal/crm` pages — needs to ship in `components/portal/PortalHeader` or similar.
- **Recurring revenue tracking** — `crm-improvements/PLAN.md §4B`: `recurringValue` + `billingCycle` columns on `crm_deals`. Schema not visible; MRR/ARR in dashboard is computed but unclear if it sources from a `recurringValue` column.
- **Email-open pixel tracking via CRM contact timeline** — `crm-improvements/PLAN.md §3A` mentions extending email tracking, but no per-contact email-open analytics tile in `[id]/page.tsx` per scan.

**What competitors have that we don't:**
- **Workflow automation builder** in-CRM (HubSpot Workflows, Salesforce Flow). We have automation engine but it's brain-flavored, not CRM-flavored UX.
- **Deal forecasting / probability ML** (Salesforce Einstein, HubSpot Predictive Lead Scoring) — we have a manual `score` per contact + manual scoring rules; no probability model on deals.
- **AI call summarization** (Gong, Chorus, HubSpot Conversation Intelligence) — Brain meetings does this for meetings but isn't inline on a deal.
- **Sales sequences** — multi-touch outbound (Outreach, Salesloft, HubSpot Sequences). We have email + activities, no sequences.
- **Territory management & lead routing** — round-robin, geo-based (Salesforce, HubSpot Enterprise).
- **Compound-condition rules editor** for filters — HubSpot's deep filter builder. Saved views exist but the filter primitives are simple.

**Stubs / half-built / TODO:**
- `app/api/portal/billing/payment-methods/route.ts:44` has a TODO ("Also detach from Stripe when SDK is integrated") — sits in billing not CRM, but it's the closest TODO to live spend on a CRM contact.
- `crm-improvements/PLAN.md` Phases 3B/4B stated but partially-or-not implemented as called out above.

**Gap severity:** MED — this is the most-developed area outside of Brain, but several stated CRM-improvements phases are still partially open.

---

### `/portal/dashboard`

**Competitors compared:** Linear's Home, Asana Inbox, Notion Home, Slack Activity.

**What's implemented (code reality):**
- `app/portal/dashboard/page.tsx` (367 lines) — server-rendered. Loads in parallel: services + my subscriptions, project counts, ticket counts, invoice counts, recent tickets, recent invoices, website count, email list count, booking page count, deck count, brain profile + widgets.
- Service-tile launcher with rich metadata (`SERVICE_META` for cms/email/booking/pitch-decks/project-mgmt/ai/hosting/bundle), status badges, "buy" CTAs.
- Brain dashboard widgets (`BrainDashboardWidgets` + `EnableBrainBanner`).
- AI credit balance card (`CreditBalance`).

**What's stated in planning docs but not built:**
- None — no specific spec for the dashboard.

**What competitors have that we don't:**
- **Drag-to-customize widgets** (Notion Home, Salesforce Lightning) — today the layout is fixed.
- **Saved layouts per user** — each user gets the same dashboard.
- **Cross-product unified search** — search bar that hits posts + contacts + tickets + media + deals (Notion, Glean). Brain's Ask is close but is its own page.
- **Favorites/pins** — pin a project, a deal, a website to the top.
- **Activity feed across products** — Asana Inbox aggregates @-mentions, status changes, etc.; `recentActivities` exists in CRM dashboard but not unified across the portal.

**Stubs / half-built / TODO:**
- None obvious.

**Gap severity:** LOW — covers the core use case; missing features are personalization polish.

---

### `/portal/email`

**Competitors compared:** Mailchimp, Klaviyo, ConvertKit, ActiveCampaign, Customer.io, Postmark.

**What's implemented (code reality):**
- `page.tsx` (180 lines) — overview with KPIs + recent campaigns.
- Sub-routes: `lists/page.tsx`, `templates/page.tsx` (222 lines, block editor), `campaigns/page.tsx`, `campaigns/new`, `campaigns/[id]/page.tsx` (367 lines), `automations/page.tsx` (legacy — redirects to `/portal/brain/automations?tab=presets`), `segments/page.tsx` (278 lines, rule engine with field/operator/value tuples), `analytics/page.tsx` (162 lines), `settings/page.tsx`, `editor-preview/page.tsx`, `layout.tsx`.
- API: 14 endpoints — `lists` CRUD, `tags` CRUD, `templates` CRUD, `campaigns` CRUD + send, `subscribers`, `segments` CRUD, `analytics`, `render-preview`.

**What's stated in planning docs but not built:**
- **Survey email follow-up sequences** — `REQUIREMENTS.md §DIST-01/02`: post-submission email sequences with opt-in gates. Survey integration with email is not wired (no per-survey email-sequence config UI).
- **A/B subject-line testing** — not in any planning doc but adjacent to roadmap Phase 8 (A/B testing on survey fields).

**What competitors have that we don't:**
- **Drip sequences with branching** — Mailchimp Customer Journeys, ActiveCampaign Automations. Our automations live in the brain; the email page automations is now a redirect, so the discovery story for "build a 5-touch nurture" inside email is broken.
- **Send-time optimization** (Mailchimp STO, Klaviyo) — predict best send time per recipient.
- **Predictive subject-line scoring** (Phrasee, ActiveCampaign).
- **SMS bridge** (Klaviyo, Customer.io).
- **Unified inbox for replies** (HubSpot Conversations, Front).
- **Advanced segmentation operators** (relative dates, has/hasn't done, has-tag-AND-not-tag) — our segment rule engine looks single-condition per row; AND/OR matchType exists but operators look basic.
- **Dynamic blocks per segment** within one campaign — Klaviyo's "Show this section to this segment."
- **Deliverability dashboard** (Klaviyo, Mailgun) — reputation, sender domain auth status, bounce-reason breakdown.

**Stubs / half-built / TODO:**
- `app/portal/email/automations/page.tsx:1–5` — redirect-only (intentional consolidation under brain).

**Gap severity:** MED — the area covers the basics well but is far from Mailchimp/Klaviyo parity.

---

### `/portal/hosting`

**Competitors compared:** Vercel dashboard, Netlify, Cloudflare Pages, Render, Fly.io.

**What's implemented (code reality):**
- `page.tsx` (134 lines) — list of hosted sites with plan badges (starter/pro/enterprise) + status (provisioning/active/suspended/cancelled) + per-site link.
- `[id]/page.tsx` exists; not deeply scanned.
- API: `GET /api/portal/hosting`, `GET /api/portal/hosting/[id]`.

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **Real-time uptime/perf monitoring** (Vercel Speed Insights, Cloudflare Web Analytics, RUM).
- **CDN cache controls** — purge by URL/tag (Cloudflare, Fastly).
- **WAF / bot management** (Vercel Firewall, Cloudflare WAF) — block by country, rate limit per path.
- **Build-time analytics** — bundle size, deps tree, compile time over time.
- **One-click rollback to a prior deploy** — Vercel/Netlify single-button rollback. We have deployments inside `websites/[siteId]` but not in `/portal/hosting` proper.
- **Per-environment env vars** (mostly handled in `websites/[siteId]/environments` not in hosting).

**Stubs / half-built / TODO:**
- The `[id]/page.tsx` is shipped but the area feels like a directory of hosted sites without the operational DX of a Vercel dashboard.

**Gap severity:** MED — area is real but most operational features live under `websites/[siteId]/...`, leaving `/portal/hosting` thin.

---

### `/portal/invoices`

**Competitors compared:** Stripe Customer Portal, Chargebee, FreshBooks portal, QuickBooks Customer Portal.

**What's implemented (code reality):**
- `[id]/page.tsx` (134 lines) — invoice detail with line items + Pay Invoice button (Stripe checkout).
- API: `POST /api/portal/invoices/[id]/checkout`.
- The list of invoices is at `app/portal/settings/billing/page.tsx` (220 lines) — note the asymmetry: invoices have a detail route but no top-level list route.

**What's stated in planning docs but not built:**
- `app/api/portal/billing/payment-methods/route.ts:44` — TODO: "Also detach from Stripe when SDK is integrated."

**What competitors have that we don't:**
- **Payment plans / installments** (Stripe Billing schedules, Chargebee) — split a large invoice over N payments.
- **ACH / bank transfer** (Stripe ACH, Plaid) — only card via Stripe checkout today.
- **Multi-currency** invoicing.
- **Partial payments** — pay $X of an invoice now.
- **PDF invoice templating** — branded download per profile.
- **Tax computation** — Stripe Tax, TaxJar integration.
- **Line-item refunds** — refund a single line, not the whole invoice.

**Stubs / half-built / TODO:**
- The TODO above is the only explicit one. The invoices/list-vs-detail asymmetry (no top-level `/portal/invoices` index) is also worth noting — users have to go to `/portal/settings/billing` to see all their invoices, which is a discoverability gap.

**Gap severity:** MED — basics work (detail + Stripe checkout); platform-grade features missing.

---

### `/portal/media`

**Competitors compared:** Cloudinary, Bunny Stream, Mux, ImageKit.

**What's implemented (code reality):**
- `page.tsx` (645 lines) — library list, search, filter (all/types), branding-profile filter, drag-upload, alt/caption inline edit, delete, branding-profile assign.
- API: 6 endpoints — `media` (list/CRUD), `media/[id]`, `media/upload`, `media/[id]/versions`, `media/[id]/replace`, `media/[id]/versions/[versionId]/restore`. Versioning is a real feature.

**What's stated in planning docs but not built:**
- Survey file/image upload field type (`REQUIREMENTS.md §RESP-03`) needs S3 presigned URLs with MIME validation and tenant isolation. The S3 plumbing exists in `lib/s3` and media supports versioning, but the survey field-type wrapper isn't wired in.

**What competitors have that we don't:**
- **AI alt-text generation** — Cloudinary's auto-tagging + accessibility.
- **AI image edit** — background removal, upscale, smart crop (Cloudinary, Bunny). We have AI in branding; not in media.
- **Face/object recognition tagging** (Cloudinary, AWS Rekognition).
- **Focal-point picker** for responsive crops.
- **Video transcoding** — HLS/DASH ladders, thumbnails.
- **Asset-usage report** — "this asset is referenced in 12 posts and 3 emails." `media/[id]/replace` and versioning are good, but no usage map.

**Stubs / half-built / TODO:**
- None obvious.

**Gap severity:** LOW — solid asset library; the AI features that competitors lead with would be additive.

---

### `/portal/my-tasks`

**Competitors compared:** Linear My Issues, Asana My Tasks, Todoist, Things 3, Jira My Open Issues.

**What's implemented (code reality):**
- `page.tsx` (163 lines) — fetches `/api/portal/my-tasks?openOnly=...`, groups by project, shows columnName + isDone + dueDate + priority + labels + checklist progress. Filters: open-only toggle.
- API: `GET /api/portal/my-tasks` only.

**What's stated in planning docs but not built:**
- Brain tasks (`brain_tasks` table per `companyBrain-adjusted.md` §3) live at `/portal/brain/tasks` with full kanban; My Tasks doesn't aggregate brain tasks alongside kanban cards. The user has two task inboxes.

**What competitors have that we don't:**
- **Quick-add input** (Linear `c`, Asana, Todoist quick-add) — no inline create from the My Tasks page.
- **Time-blocking integration** (Sunsama, Reclaim, Motion) — drag tasks onto calendar.
- **Saved filters** beyond open/all (e.g., "due this week," "high priority," "blocked").
- **Today/Upcoming/Scheduled tabs** (Things 3, Todoist).
- **Mobile push reminders** — no mobile shell visible at all.
- **Cross-project @mention follow-up** — no Asana Inbox-equivalent that surfaces cards mentioning me.

**Stubs / half-built / TODO:**
- The TODO is implicit: the page should show brain tasks too, or brain tasks should auto-promote to a kanban column.

**Gap severity:** MED — works for the kanban use case; doesn't aggregate the second task system (brain) or offer the workflow conveniences competitors lead with.

---

### `/portal/projects`

**Competitors compared:** Linear, Asana, Jira, ClickUp, Trello, Notion Projects.

**What's implemented (code reality):**
- `page.tsx` (252 lines) — list + agency-vs-private tab + create form.
- `[id]/page.tsx` (218 lines) — kanban board + sprints tab + files tab + settings tab. Pulls columns/cards/labels/assignees/dependencies/checklist/sprints in parallel.
- `automations/page.tsx` (68 lines) — preset list (project_created_notify, task_completed_notify, task_assigned_notify, project_status_change, task_created_crm).
- API: 9 endpoints — projects CRUD, sprints CRUD, cards CRUD, labels CRUD, files CRUD, columns CRUD + reorder, webhooks.
- Components: `KanbanBoard`, `ProjectFilesTab`, `ProjectStatusControl`, `ProjectWebhooksPanel`, `SprintPlanning`, `ProjectDescription`.

**What's stated in planning docs but not built:**
- None documented for projects specifically.

**What competitors have that we don't:**
- **Gantt / timeline view** (Asana Timeline, MS Project, Linear Timeline) — kanban only today.
- **Workload view** — Asana Workload shows assignees' planned hours per week.
- **Portfolio dashboard** — multi-project rollup (Asana Portfolios, Jira Plans).
- **Goal/OKR linkage** (Asana Goals, ClickUp Goals).
- **AI breakdown of large tasks** (Linear Insights, Notion Q&A, ClickUp Brain).
- **Custom fields on cards** — only labels + checklist + assignees + due-date today.
- **Subtasks** — unclear from scan; checklist items aren't sub-cards (no nesting).
- **Burndown / velocity charts** — `sprints` are tracked but no charting.
- **Time tracking** — no entries table visible.

**Stubs / half-built / TODO:**
- Sprint planning is built; sprint analytics isn't.

**Gap severity:** MED — covers Trello-class baselines; doesn't reach Linear/Jira polish.

---

### `/portal/services`

**Competitors compared:** Stripe Checkout subscription bundles, Squarespace add-ons.

**What's implemented (code reality):**
- `page.tsx` (201 lines) — service catalogue cards + active state + `Add Service` CTA + `Request Service` deep link.
- `[id]/request/page.tsx` (27 lines) — server-side wrapper around `<ServiceRequestForm>` consuming the per-service `surveyFields` schema.
- API: `services` (list), `services/nav`, `services/[id]/checkout`.

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **In-product service comparison matrix** — feature grid across plans.
- **Bundled-discount calculator** — "buy CMS + email = 20% off" is the bundle today, but no live preview.
- **Per-service onboarding workflow** — currently a request form, not a guided flow.
- **Usage meters per service** — show CMS posts used, emails sent, AI tokens, etc.
- **Trial-period management** — no visible trial counters.

**Stubs / half-built / TODO:**
- None.

**Gap severity:** LOW — purpose-fit for in-house upsell.

---

### `/portal/settings`

**Competitors compared:** Linear settings, Notion settings, Slack admin.

**What's implemented (code reality):**
- Sub-pages: `profile/page.tsx` (510 lines, full user + company info), `billing/page.tsx` (220 lines, invoices + payment methods), `team/page.tsx` (291 lines, invite + role change + remove), `api-keys/page.tsx` (28 lines, MCP keys + OAuth tokens), `integrations/page.tsx` (237 lines, Google Workspace OAuth scopes), `ai/page.tsx` (438 lines, AI conversations + credit ledger), `support/page.tsx` (82 lines, ticket list).
- API: profile (PATCH), team CRUD, billing.

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **SSO / SAML** (WorkOS-style, Linear SAML, Okta) — only password + Google OAuth-as-login today.
- **Granular role permissions matrix** — fixed roles (admin/member/viewer/owner) with no per-feature toggles.
- **Audit-log viewer for admin actions** — `brain_audit_logs` exists for brain; no portal-wide settings/actions log.
- **Data export (GDPR right-to-export)** — CRM has import/export; settings doesn't.
- **Device sessions / per-device MFA** — no session list (Slack, Linear).
- **Usage limits / caps UI** — credits page shows a balance, but no per-product cap controls.
- **Seats vs. members billing model** — billing shows invoices, not subscription/seat math.

**Stubs / half-built / TODO:**
- Payment-methods route TODO on Stripe SDK integration (cited above).

**Gap severity:** MED — basics solid; enterprise hooks (SSO, audit, RBAC) absent.

---

### `/portal/suggested-projects`

**Competitors compared:** in-house upsell, no obvious external category leader.

**What's implemented (code reality):**
- `page.tsx` (144 lines) — list per category (website/ecommerce/mobile/development/maintenance/branding/other) with icons and counts; pulls active suggestions visible to the client (`clientId IS NULL OR clientId = me`).
- `[id]/page.tsx` + `[id]/request/page.tsx` — detail view + request-to-start form.
- API: `GET /api/portal/suggested-projects` (list). No detail or convert-to-project route visible — the request form likely posts to a service-request or ticket route.

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **Predictive next-best-service** — based on the customer's product mix, recommend the next purchase.
- **Price-anchoring** — show savings vs. à-la-carte.
- **ROI calculator** — interactive "how much would a website redesign return?"
- **Before/after gallery** — case studies.
- **Per-tier client testimonials**.

**Stubs / half-built / TODO:**
- None obvious.

**Gap severity:** LOW — purpose-built for in-house upsell.

---

### `/portal/surveys`

**Competitors compared:** Typeform, SurveyMonkey, Qualtrics, Google Forms, Jotform.

**What's implemented (code reality):**
- `page.tsx` (155 lines) — list with status + response counts + new-survey CTA.
- `new/page.tsx` (217 lines) — template picker (NPS/CSAT/Customer Feedback/Event/Lead Qualification/Post-Meeting) + builder.
- `[id]/page.tsx` (1217 lines) — `<SurveyBuilder>` with 15 field types, multi-page support, basic skip logic, branding profile, recommendations editor.
- API: `surveys` CRUD + `[id]/responses` + `[id]/export`.
- Schema for advanced features (per `STATE.md`): `survey_partial_responses`, `survey_webhooks`, `survey_email_sequences`, `survey_variants`, `survey_ai_summaries` — Phase 1 (foundation) + Phase 2 (conditional logic UI/piping) marked done in `STATE.md`. So the data model exists for almost everything; only Phase 3+ (response management → PDF certificates) is missing.

**What's stated in planning docs but not built (the bulk of `REQUIREMENTS.md`):**
- **`LOGIC-01`** Conditional visibility UI (rule builder for `showIf`) — `components/admin/SurveyBuilder.tsx:217–293` shows a static "Conditional: depends on field {id}" badge but no rule editor. `STATE.md` claims Phase 2 complete; code reality looks earlier than that.
- **`LOGIC-02`** Piping syntax (`{Q3_answer}`) — no inline preview substitution path I can find.
- **`LOGIC-03`** Flow diagram of pages and skip logic — no `@xyflow/react` import; no diagram tab.
- **`RESP-01`** Response filter/search/date range — `[id]/responses` route exists but its filtering capabilities aren't visible.
- **`RESP-02`** Partial-response per-page capture — schema present, UI/handler not visible.
- **`RESP-03`** File-upload field type — not in `SurveyBuilder` field-type list.
- **`SCORE-01/02`** Per-field scoring + auto-routing to CRM — no scoring config.
- **`HOOK-01/02`** Per-survey webhook URLs + BullMQ retry — schema present, UI missing.
- **`DIST-01/02`** Email follow-up sequences with opt-in gates — no per-survey sequence editor.
- **`DIST-03/04`** Public results page with live charts — no `/s/[slug]/results` route I can see.
- **`REAL-01/02`** SSE-powered real-time dashboard — no SSE route.
- **`AI-01/02`** AI summarization + PII strip — `survey_ai_summaries` schema present, no UI.
- **`AB-01/02`** A/B testing — `survey_variants` schema present, no UI.
- **`PDF-01/02`** Completion certificates — no `@react-pdf/renderer` import in surveys.

**What competitors have that we don't:**
- **Logic Jump editor** — Typeform's purpose-built rule editor (drag from question to question with conditions).
- **Branching diagram** — Qualtrics SurveyFlow, Jotform Conditional Logic. (We have it as a stated goal, see LOGIC-03.)
- **Embed widgets per segment** — Typeform's pop-up/slider/standard embed per persona.
- **AI text-response themes** — Qualtrics XM Discover. (Stated as AI-01.)
- **Team workspaces / collaborative editing** — Typeform/Qualtrics multi-user editing. We have single-user editing.
- **Multi-language survey i18n** — Qualtrics, SurveyMonkey ship a translations matrix per question.
- **Quotas** ("stop accepting once 100 promoters answered") — Qualtrics.
- **Randomization** of question order — Qualtrics, SurveyMonkey.

**Stubs / half-built / TODO:**
- The `STATE.md` declares Phase 2 complete, but `SurveyBuilder.tsx:217` is a read-only badge — the rule-builder modal/panel that the goal calls for doesn't appear. Phase-state may have drifted from code reality.

**Gap severity:** HIGH — most of the active milestone in `REQUIREMENTS.md` is unimplemented in the code, and competitors are far ahead.

---

### `/portal/tickets`

**Competitors compared:** Zendesk, Intercom, Help Scout, Freshdesk.

**What's implemented (code reality):**
- `new/page.tsx` (129 lines) — subject + category + priority + body form.
- `[id]/page.tsx` (134 lines) — server-rendered thread + reply form (`<TicketReplyForm>`); clients see non-internal messages, staff see all.
- API: `GET /api/portal/tickets`, `GET /api/portal/tickets/[id]/messages`, `POST` for replies.
- The ticket **list** for clients is at `app/portal/settings/support/page.tsx`, not at `/portal/tickets/` — same asymmetry as invoices.

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **Macros / canned responses** (Zendesk, Intercom) — agents save reply templates.
- **CSAT survey on close** — auto-send a 1-5 rating after resolution. We have surveys; not wired to ticket close.
- **Ticket merge / split** — Zendesk merges duplicate tickets.
- **SLA policies** — escalate if no response in 4h (Zendesk, Freshdesk).
- **Round-robin assignment** — auto-assign by team availability.
- **Live-chat fallback** — Intercom/Drift. We have email-style tickets only.
- **AI suggested replies** (Intercom Fin, Zendesk AI Agents).
- **Knowledge-base deflection** — search relevant articles before opening a ticket.
- **In-app status workflow** (open → in_progress → waiting on customer → resolved → closed) with controls. The schema has statuses; the client UI doesn't expose transitions.

**Stubs / half-built / TODO:**
- The list-vs-detail asymmetry: no `/portal/tickets/page.tsx` index. List is at `/portal/settings/support`. Discoverability gap.

**Gap severity:** HIGH — usable but extremely thin compared to category leaders; missing SLA + assignment + workflow makes it a v0 in helpdesk terms.

---

### `/portal/tools/booking`

**Competitors compared:** Calendly, Acuity Scheduling, Cal.com, SimplyBook.me, Mindbody.

**What's implemented (code reality):**
- `page.tsx` (260 lines) — booking-page list + Google Calendar/Zoom connection state.
- `[id]/page.tsx` — large multi-tab page (lines unchecked but inferred large): availability rules, add-ons, waivers, members, date-overrides, bookings list, refunds, embed code.
- `calendar/page.tsx` (416 lines) — week/day view across all booking pages with staff color-coding.
- `checkin/page.tsx` (208 lines) — code-based check-in with today's bookings.
- `quotes/page.tsx` (117 lines) — paid intake / pre-pay quote model.
- `analytics/page.tsx` (175 lines) — revenue + bookings + add-on rollups.
- `new/page.tsx` — booking-page builder.
- `quotes/new/page.tsx` — quote creation.
- API: 30+ endpoints under `/api/portal/tools/booking/...` covering calendar, quotes, check-in, today, embed, bookings (with refund), date-overrides, add-ons (with from-products), waivers (with PDF + bulk-download), members, Google OAuth, Zoom OAuth.

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **Group classes with capacity + waitlist** (Mindbody, Acuity) — `groupSize` is supported but no waitlist.
- **Payment plans** (Mindbody, MINDBODY) — split a class fee.
- **Package / series sales** — sell a 10-class package.
- **Recurring memberships beyond basic** — Mindbody/MarianaTek-style auto-renew with prorating.
- **SMS reminders** — Acuity, SimplyBook.me. We have email reminders.
- **Round-robin + collective scheduling** — Calendly Teams.

**Stubs / half-built / TODO:**
- None obvious.

**Gap severity:** LOW — feature-rich already; gaps are class-management features for fitness/wellness verticals.

---

### `/portal/tools/pitch-decks`

**Competitors compared:** Pitch.com, Gamma, Tome, Beautiful.ai, Google Slides.

**What's implemented (code reality):**
- `[id]/page.tsx` (3250 lines) — full slide editor reusing the block system, branding-profile-driven theming, drag-drop slides via `dnd-kit`, Google Font picker, surveys-as-slides, version history.
- `[id]/presenter/page.tsx`, `[id]/slide-preview/page.tsx` — presentation modes.
- `new/page.tsx` — template + AI generation entry.
- API: 13 endpoints — `pitch-decks` CRUD, `versions` + restore, `slides/[index]/generate` (per-slide AI regenerate), `slides/batch-edit`, `upload-html` (HTML import).

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **Live audience polling / Q&A** (Mentimeter, Slido).
- **Viewer-engagement analytics** (Pitch.com sees per-slide dwell-time).
- **Collaborative cursors / multi-user editing** (Pitch, Gamma).
- **Presenter-notes teleprompter** — separate notes stream visible only to presenter.
- **Template marketplace** — Gamma's community templates.
- **Smart layouts** — Gamma/Tome auto-rebalance content as you type.

**Stubs / half-built / TODO:**
- None obvious.

**Gap severity:** LOW — for AI-assisted decks this is a strong implementation; missing features are presenter/audience interactions.

---

### `/portal/tools/gift-certificates`

**Competitors compared:** Givex, GiftUp, Square Gift Cards, Shopify Gift Cards.

**What's implemented (code reality):**
- `page.tsx` (202 lines) — list + create-cert form (amount + recipient + message).
- API: `tools/gift-certificates` CRUD + `[id]`.

**What's stated in planning docs but not built:**
- None documented.

**What competitors have that we don't:**
- **Multi-store gift-card pooling** (Shopify Plus) — redeemable across siblings.
- **Branded e-card design templates** — GiftUp's themed cards.
- **Apple Wallet / Google Pay pass** — adds the cert to mobile wallet.
- **Recipient personalization** — video/audio message attachment.
- **Referral / bonus credit** — buy $100 get $20 free (Square Gift Cards).
- **Partial-redemption history** — `remainingAmount` is shown but no per-redeem ledger UI.
- **Bulk-issue UI** — generate 50 cards for an event.

**Stubs / half-built / TODO:**
- None obvious.

**Gap severity:** MED — shippable but missing gift-card-platform-grade features.

---

### `/portal/websites` — CMS surface

**Competitors compared:** Webflow, WordPress, Wix, Squarespace, Contentful, Sanity.

**What's implemented (code reality):**
- `page.tsx` (201 lines) — site list + post counts.
- `[siteId]/page.tsx` (254 lines) — site dashboard with API keys + post stats + content types + upload-html button.
- Sub-routes (per directory listing): `posts/new`, `posts/[postId]/edit`, `entries`, `categories`, `tags`, `taxonomy`, `content-types` + `[typeId]/fields` + `[typeId]/template`, `calendar`, `code` (custom HTML/CSS injection), `branding`, `navigation` (1301-line mega-menu builder), `automations`, `media`, `settings`, `email` + `[templateId]`, `store/*`.
- API: 50+ routes under `/api/portal/websites/[siteId]/...` covering api-keys, status, logs, domain (+ verify), deployments, provision, branding, domains, branding-profile, collaborators, environments (+ vars, copy, sync, backup, restore), navigation, deployments/[id]/logs, Google (auth + Search Console + Analytics + report), and the entire store sub-tree.

**What's stated in planning docs but not built:**
- The cms-blocks audit (`audits/cms-blocks-audit.md`) is **closed** — all 47 blocks audited, dual-editor architecture confirmed, deferred items resolved as of 2026-04-26. So nothing stated-but-missing for the block layer.
- `audits/cms-blocks-handoff.md` confirms 6 wiring layers per block; renderer/preview parity verified.

**What competitors have that we don't:**
- **Page-level A/B testing** (Optimizely, Webflow Optimize).
- **Built-in A11y scanner** (Webflow Audit).
- **Collaborative real-time editing** (Webflow, WordPress Studio).
- **Page versioning + restore** (Wix, Webflow autosave history).
- **Page comments for review workflows** (Webflow Comments).
- **Bidirectional internal links** between posts (Brain has them — CMS doesn't).
- **A/B page testing** within the CMS (Optimizely, Webflow Optimize).
- **SEO scoring tool inline** (Yoast SEO for WordPress).
- **Redirect manager UI** — schema may exist; UI for rule list isn't visible.
- **404 monitor** with click-counts.
- **Staging-vs-prod content sync** (WordPress WP-Migrate Sync, Sanity dataset diffs).

**Stubs / half-built / TODO:**
- None obvious; the area is one of the most complete in the portal. Note that `cms-blocks-audit.md` is the most carefully tracked audit in the repo, which probably explains the depth.

**Gap severity:** MED — block authoring is excellent; site-management features (A/B, comments, real-time collab) are missing vs. Webflow/Wordpress.

---

### `/portal/websites/[siteId]/store` — eCommerce surface

**Competitors compared:** Shopify, WooCommerce, BigCommerce, Squarespace Commerce.

**What's implemented (code reality):**
- `store/page.tsx` (279 lines) — overview KPIs (revenue, orders today, active products, low-stock items) + recent orders.
- Sub-routes: `settings/page.tsx` (Stripe Connect), `products/page.tsx` + `[productId]` (with `bulk-pricing`, `options`, `variants` API), `discounts/page.tsx`, `shipping/page.tsx` (zones + rates), `orders/page.tsx` + `[orderId]`, `categories/page.tsx`.
- API: 25+ store routes including options/variants/bulk-pricing per product, shipping zones with rates per zone, analytics.

**What's stated in planning docs but not built:**
- None documented store-side.

**What competitors have that we don't:**
- **Subscription products** (Shopify Recharge, BigCommerce subscriptions).
- **Abandoned-cart sequences** (Klaviyo, Shopify Email).
- **Product reviews** (Yotpo, Loox).
- **B2B pricing tiers / wholesale** (Shopify B2B).
- **Multi-currency** + auto-conversion.
- **Tax-exempt customers** (B2B + nonprofits).
- **Inventory low-stock alerts** — `lowStockItems` count visible but no alert configuration.
- **Tax computation rules** (Shopify Tax, TaxJar).
- **Gift-card-store integration** — gift certs (`tools/gift-certificates`) and store don't share a redeem flow.

**Stubs / half-built / TODO:**
- None obvious.

**Gap severity:** MED — covers SMB store basics; B2B + subscription products are absent.

---

## Cross-cutting gaps

These are missing capabilities that span multiple portal areas. They are usually one feature shipped once that benefits everywhere.

1. **Global search.** No `/portal/search` route, no header-bar omnisearch. Brain Ask is close but is one product. Notion/Linear set the bar with `Cmd+K` / `Cmd+P`. Touches every area.

2. **Audit log viewer.** `brain_audit_logs` exists for the Brain; `mcpPendingChanges` history is in approvals; `automation_logs` has its own viewer. There is no portal-wide settings/admin-actions audit log (login events, role changes, key creation, billing changes). Linear/WorkOS-tier expectation.

3. **Notifications panel.** No bell icon, no unified notification list, no read-state. Asana Inbox / Linear Notifications / Slack Activity each show this works. CRM-improvements PLAN §3B specs a `crm_notifications` table — would be better as a portal-wide schema.

4. **Mobile responsiveness audit.** I scanned only desktop layouts. The settings-tab structure (`/portal/settings/profile` 510 lines, `/portal/brain/tasks` 1186 lines, `/portal/tools/pitch-decks/[id]` 3250 lines) raises a likely mobile-fit concern. No `mobile.spec.ts` keyword in the planning docs.

5. **Accessibility.** No A11y audit doc visible. CMS-blocks audit closed without an A11y pass. Links like `app/portal/branding/[profileId]` mention placeholders but no aria-label coverage check is documented.

6. **Internationalization.** No `i18n` library in the planning docs. `lib/email/website-email-events.ts` is English-only. Surveys lack a multi-language matrix (Qualtrics ships this).

7. **Dark mode.** Tailwind classes use `dark:` variants throughout (visible in approvals/branding/email/tickets pages), so dark mode appears wired. Worth verifying but seems addressed.

8. **Keyboard shortcuts.** No `<Kbd>` component or `Cmd+K` handler visible in the spot-checked pages. Linear/Notion/Superhuman set the bar.

9. **Webhook system.** Webhooks are scattered: project webhooks (`projects/[id]/webhooks`), survey webhooks (planned not built), no central webhook console. Should be a `/portal/settings/webhooks` index.

10. **Activity feed across products.** CRM dashboard has `recentActivities`; brain has its own dashboard widgets; the global dashboard is service-tile-based. No unified "things that happened today across my workspace."

11. **In-app notifications + email digest preferences.** No "what do I want to be notified about" central config. Per-product automation presets compensate but the user-facing notification-routing is fragmented.

12. **Mobile push / native app.** `PROJECT.md` mentions React Native exists with no survey screens. Portal-wide there is no mobile app coverage in the audit set.

13. **Single sign-on / SAML.** Settings → integrations covers Google Workspace OAuth but not SSO-as-login.

14. **Granular RBAC.** Roles are a fixed set (owner/admin/member/viewer). No per-feature toggles (e.g., "this user can edit websites but can't see CRM").

15. **Empty states.** Brain pages have rich empty states (per `companyBrain-adjusted.md`); CRM has banners; surveys is light; my-tasks is light. Cross-cutting empty-state design system would improve onboarding.

---

## Recommended P0 closures

Five-to-ten gaps that, if closed, would have outsized impact relative to effort. Ranked.

1. **Ship Phase 3 of the survey roadmap (Response Management).** `REQUIREMENTS.md §RESP-01/02/03`. Filter/search/date range, partial-response capture, and file-upload field. The schema is in (`survey_partial_responses`) and S3 + branding + media + visual editor are all already there. This unblocks 6 downstream phases. **Why P0:** the survey area is the most-stated and least-built; one phase moves the largest gap on the scoreboard. **Effort:** 1–2 weeks.

2. **Build the Conditional Logic UI (Phase 2 of the survey roadmap).** `STATE.md` says complete; code reality (`components/admin/SurveyBuilder.tsx:217`) is a read-only badge, not a rule builder. **Why P0:** this is *the* table-stakes survey feature per `research/FEATURES.md` and competitors lead with it. Without it, the survey product is a Google Form clone. **Effort:** 1 week if shared evaluator (FOUND-02) is real.

3. **Add notifications + audit log as cross-cutting primitives.** A `notifications` schema + bell + dropdown serves CRM (PLAN §3B), tickets (escalation), automations (rule failure), brain (review queue). Audit log similarly serves settings + billing + admin. **Why P0:** unblocks the right side of CRM-improvements PLAN, sets up SLA timers in tickets, and gives the platform an enterprise-readiness leg-up. **Effort:** 1 week for notifications, +1 week for audit log.

4. **Ticket SLA + assignment + workflow controls.** Today the client view doesn't expose status transitions or SLA timers, and there is no agent-side assignment route. **Why P0:** tickets is one of the two HIGH-severity areas in the scoreboard, and helpdesk parity is a known competitive moat. **Effort:** 1 week.

5. **Aggregate brain tasks into `/portal/my-tasks`.** Two task systems live in parallel today (`kanban_cards` and `brain_tasks`). The user has two inboxes. **Why P0:** removes confusion, lifts the brain product into the user's daily flow, and is a one-route-handler change to add a `unified=true` mode. **Effort:** 1–2 days.

6. **Wire survey webhooks (`HOOK-01/02`) and survey scoring auto-routing (`SCORE-01/02`).** Schema is there. Webhooks unlock developer-power-user use cases at near-zero implementation cost; scoring auto-routing closes the loop with the CRM and brain (deal creation from a high-score response). **Why P0:** highest roadmap-leverage-per-line-of-code in the survey set. **Effort:** 3–5 days.

7. **Global `Cmd+K` search.** A single command palette that searches posts, contacts, tickets, deals, brain notes, knowledge, media. Brain Ask is close but is its own page, requires context, and isn't keyboard-first. **Why P0:** Linear/Notion-tier UX expectation; a single command palette is the highest-impact single feature for power users. **Effort:** 1–2 weeks (including indexer plumbing; can ride on the keyword paths already wired in `/api/portal/brain/search`).

8. **Webhook console at `/portal/settings/webhooks`.** Today webhooks live in three places (projects, surveys [planned], website API keys). One console with logs + retries + signing-secret rotation would unify them. **Why P0:** simplifies the developer story for power users without rewriting any of the engines. **Effort:** 3–5 days.

9. **Build the page-versioning + restore feature for CMS pages.** `posts` has a `version` field; restore UX exists for media but not posts. Webflow/Wix lead with this. **Why P0:** highest-impact CMS competitor-parity gap. **Effort:** 1 week.

10. **Service entitlement + billing for Brain.** `companyBrain-adjusted.md` §11.8 calls this out as a GA blocker. Today Brain runs free; without a SKU + price the company can't charge for it. **Why P0:** revenue gate. **Effort:** 2–3 days (catalogue row + entitlement guard + checkout link).

---

_End of report._
