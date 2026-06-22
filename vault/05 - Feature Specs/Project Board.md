---
kanban-plugin: board
type: index
date: 2026-06-17
---

## Backlog

- [ ] Unify AI tool surfaces (MCP 431 / Brain 12 / portal ~15 → one source of truth) — see [[Unify AI Tool Surfaces]]
- [ ] Wire `enqueueWorkflowRunsForTrigger` to live CRM events — see [[Automations & Workflows]]
- [ ] Implement `send_email` / `add_to_list` action kinds in the visual workflow runtime — see [[Automations & Workflows]]
- [ ] Scheduled-campaign dispatcher (campaigns can be scheduled but nothing sends them) — see [[Email & Campaigns]]
- [ ] Sync `emailSegments.subscriberCount` after subscriber mutations — see [[Email & Campaigns]]
- [ ] Storefront checkout golden-path E2E — see [[Storefront & Commerce]]
- [ ] Encrypt user-level Google/Microsoft refresh tokens at rest — see [[Integrations - Google, Microsoft & OAuth]]
- [ ] Microsoft token revocation is a local-only no-op — revoke upstream — see [[Integrations - Google, Microsoft & OAuth]]
- [ ] Wire `chat_widgets.brainEnabled` to actual Brain retrieval — see [[Chat, Realtime & Voice]]
- [ ] Themed contract PDF renderer (TODO in `lib/esign/contract-pdf.ts`) — see [[E-Sign & Approvals]]
- [ ] Auth MFA + audit log + rate limiting `[verified: real gap; rate-limit quick-win shipped]` — see [[Spec - Auth MFA + Audit Log + Rate Limiting]]
- [ ] Durable automation runtime `[verified: partial — finish visual canvas + retries]` — see [[Spec - Durable Automation Runtime]]
- [ ] White-label SaaS resell `[verified: partial — entitlement engine exists; rebilling/snapshot/enforcement remain]` — see [[Spec - White-Label SaaS Resell]]
- [ ] Predictive scoring layer `[verified: absent — greenfield L]` — see [[Spec - Predictive Scoring Layer]]
- [ ] Audit follow-ups: env-doctor + sharded-coverage + gap-to-backlog agents; fix `verify-db-target` switchyard guard; harden `/approve` (410 on stale pending-change) — see [[ADR proposed-audit-agents-and-workflows]] · [[00 - E2E Audit Index]]
- [ ] CRM email engagement: sequences/cadences (Phase 2) + Outlook (Phase 3) `[2026-06-22: Phase 1 Gmail two-way email threads SHIPPED c2c0886c; Phase 2 next — mirror survey_email_sequences]` — see [[Spec - CRM Email Sync + Sequences]] · [[CRM E2E Audit]]
- [ ] Bookings scheduling depth: reschedule flow + Google-Calendar free/busy pre-check + SMS reminder channel `[verified 2026-06-21 real-gap]` — see [[Bookings Services E2E Audit]]
- [ ] E-sign assurance: signer identity verification (OTP/KBA) + automated signature-reminder cron `[verified 2026-06-21 real-gap; esign plumbing exists, additive]` — see [[ESign Approvals E2E Audit]]
- [ ] Pitch-deck sharing: viewer analytics (views/time-on-slide) + shared-link access control (password/expiry) + portal-facing deck-fork route/button `[verified 2026-06-21; publish approval gate shipped, fork exists MCP-only]` — see [[Pitch Decks Product Designer E2E Audit]]
- [ ] Company Brain ingestion + ACL: auto-ingest connectors (Slack/Confluence/SharePoint) + cross-source ACL-aware retrieval `[verified 2026-06-21 real-gap]` — see [[Company Brain AI E2E Audit]]
- [ ] Email automation depth: branching/drip journeys + deliverability testing (inbox/spam) + embedded list-growth forms `[verified 2026-06-21; approval-vs-send gate already shipped]` — see [[Email Campaigns E2E Audit]]
- [ ] CMS content modeling: reference/relational fields + scheduled post auto-publish (cron wiring) `[verified 2026-06-21; post + block-template fork already shipped (MCP)]` — see [[CMS Blocks E2E Audit]]
- [ ] Sites publishing safety: publish-to-prod content promotion + automated backup on publish + auto-rollback on failed publish `[verified 2026-06-21; true staging env already shipped]` — see [[Sites Hosting Publishing E2E Audit]]
- [ ] Storefront conversion: abandoned-cart recovery + automatic jurisdiction-based tax calculation `[verified 2026-06-21; wallet checkout already shipped via Stripe PaymentElement]` — see [[Storefront Commerce E2E Audit]]
- [ ] Surveys in-form fields: payment field + e-signature field `[verified 2026-06-21 real-gap]` — see [[Surveys E2E Audit]]
- [ ] Plugins ecosystem: self-serve/admin install-uninstall lifecycle + marketplace browse/install UI `[verified 2026-06-21; runtime + entitlements + consumer view already shipped]` — see [[Plugins Extension E2E Audit]]
- [ ] Public developer surface: API-key auth on the headless content API `[2026-06-22: site-level outbound webhooks SHIPPED (d90587fd); this remaining half needs the target "headless content API" pinned down first]` — see [[Integrations E2E Audit]]
- [ ] A/B testing statistical rigor: sequential / valid-peeking stats + sample-ratio-mismatch (SRM) guardrail `[verified 2026-06-21 real-gap]` — see [[AB Testing E2E Audit]]
- [ ] Tickets: post-resolution CSAT (score + prompt-after-resolution) `[verified 2026-06-21; burndown/velocity + ticket SLA already shipped]` — see [[Projects Tickets Kanban E2E Audit]]
- [ ] Visual editor: in-canvas AI section generation `[verified 2026-06-21; scroll/timeline blocks already shipped]` — see [[Visual Editor E2E Audit]]
- [ ] Agentic OS: agent-action audit trail `[verified 2026-06-21; GET /automations/[id] + ai-conversations DELETE/PATCH shipped this session]` — see [[00 - E2E Audit Index]]

## Planned

- [ ] Self-Serve SaaS GTM Launch (Phase 0 → public) — see [[Go-To-Market — Self-Serve SaaS]] · board [[GTM Launch Board]]
- [ ] Visual-Editor / Block-Authoring Agent (first hub-and-spoke specialist; prerequisites now met — intent router shadow v1 + real tracing both shipped) — see [[Visual-Editor Agent]]

## In Progress

- [ ] Portal Intent Router — shadow v1 shipped (Haiku classifier now routes domains + model in one call); collecting `portal.route` accuracy data, then flip `ROUTER_MODE` to `'active'` — see [[Portal Intent Router]]

## Validating

- [ ] `sd-create-short` skill — branded feature shorts (MP4) for LinkedIn + blog — built + pipeline validated locally; first real production run (incl. portal upload) pending — see [[sd-create-short]]
- [ ] Multi-Agent Security Hardening (kagenti-inspired) — Phase 1 + Phase 2 implemented (PR #42); unit-green; awaiting CI critical-e2e + prod migration/backfill — see [[Multi-Agent Security Hardening (kagenti-inspired)]]
- [ ] Per-Domain SaaS Billing & BYOK — see [[Per-Domain SaaS Billing & BYOK]]
- [ ] Self-Serve Signup Funnel & Module Onboarding — see [[Self-Serve Signup Funnel & Module Onboarding]]
- [ ] Per-seat pricing + computed line items — staging Stripe test-mode verification required; run `create-seat-product.ts` and populate `SEAT_SKU.stripeProductId` — see [[ADR per-seat-pricing-computed-line-items]] · [[Billing & Stripe]]
- [ ] **EPIC: Admin Billing Parity — Full Management** — code-complete (C1–C9); pending: `/admin/login` smoke-test, override/comp/module POST paths in Stripe TEST mode, `bun test:tenancy`, hand-apply `scripts/migrations/admin-billing-overrides.sql` to staging/prod — see [[Admin Billing Parity — Full Management]] · [[ADR admin-billing-overrides-comp-coupon]]
- [ ] C1 — Schema: admin billing overrides migration (`billable_seats_override`, `comp_discount_percent`, `byok_eligible_override` on `clients`) — see [[Admin Billing Parity — Full Management]]
- [ ] C2 — Wire overrides into billing logic (seats, entitlements, reconciler comp coupon) — see [[Admin Billing Parity — Full Management]]
- [ ] C3 — Admin billing-management API (modules, bundle, seats, comp, byok-override, mode routes) — see [[Admin Billing Parity — Full Management]]
- [ ] C4 — Plan page → "Billing & Plan" full management surface — see [[Admin Billing Parity — Full Management]]
- [ ] C5 — Client-detail billing tab: read summary + fix stale category maps — see [[Admin Billing Parity — Full Management]]
- [ ] C6 — Subscriptions page model-awareness (multi-item subs legible) — see [[Admin Billing Parity — Full Management]]
- [ ] C7 — RSC admin auth shell (convert `app/admin/layout.tsx` to server component) — see [[Admin Billing Parity — Full Management]]
- [ ] C8 — Targeted admin resilience (`app/admin/error.tsx` + `fetchJsonSafe`) — see [[Admin Billing Parity — Full Management]]
- [ ] C9 — Cleanup: delete dead `AdminNav` + stale unit test refs — see [[Admin Billing Parity — Full Management]]


## Shipped

**Complete**
- [x] Repo cleanup + docs consolidation + README rewrite (2026-06-09)
- [x] In-repo Obsidian vault: scaffold + 50-note knowledge sweep (2026-06-10)
- [x] Scribble (goscribble.ai) site migration — LIVE at https://scribble.simplerdevelopment.com, all 12 pages 200 (2026-06-12) — see [[Scribble Site Migration]]
- [x] Approval page WYSIWYG preview + page-scoped token (2026-06-16) — live-site iframe in public approval flow; scoped HMAC prevents site-wide token leak — see [[ADR approval-preview-page-scoped-token]] · [[E-Sign & Approvals]]
- [x] Platform E2E + Competitive Audit (2026-06-17) — 146-spec suite + MCP browser pass + 21-domain gap analysis — see [[Platform E2E + Competitive Audit]] · [[00 - E2E Audit Index]]
- [x] Auth rate-limit quick-win (2026-06-17) — per-IP throttle on login + mobile sign-in + `/oauth/token` (verified 429 after 10) — see [[Spec - Auth MFA + Audit Log + Rate Limiting]]
- [x] Billing customer-portal graceful error (2026-06-17) — 502 + actionable message when Stripe portal config absent (was raw 500)
- [x] AI provider-abstraction seam + dev unit-suite repair (2026-06-17) — provider-agnostic `lib/ai/llm.ts` / `agent-loop.ts` / `models.ts`; executePortalTool single-ctx collapse; automation scope-gate; roi-calculator lockstep; 28 539 passed / 0 failed — see [[ADR executePortalTool single-ctx parameter]] · [[Company Brain & AI]] · [[Automations & Workflows]] · [[CMS & Blocks]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
