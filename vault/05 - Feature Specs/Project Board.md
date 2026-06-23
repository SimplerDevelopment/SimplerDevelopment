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
- [ ] CRM email engagement: Phase 3 Outlook GRAPH WIRING (delta-fetch + subscription/webhook + renew cron — needs a real MS tenant) + small follow-ups (event-bus auto-enroll, thread UI, send-as-user) `[2026-06-22: Phase 1 Gmail threads (c2c0886c) + Phase 2 sequences (533c6487) + Phase 3 Outlook foundation (d04c9488) SHIPPED]` — see [[Spec - CRM Email Sync + Sequences]] · [[CRM E2E Audit]]
- [ ] Bookings scheduling depth: free/busy pre-check + SMS reminders `[verified 2026-06-21 real-gap]` `[2026-06-22: P1 RESCHEDULE FLOW SHIPPED (ccbd8be9) — reschedule route + booking.rescheduled now emitted; 4 e2e. REMAINING: P2 Google freeBusy + P3 Twilio SMS (external)]` — see [[Spec - Bookings Scheduling Depth]] · [[Bookings Services E2E Audit]]
- [ ] E-sign assurance: signer identity verification (OTP/KBA — provider-side, external) `[verified 2026-06-21 real-gap; automated signature-reminder cron shipped 20059587]` — see [[ESign Approvals E2E Audit]]
- [ ] Pitch-deck sharing: shared-link access control (password/expiry) `[verified 2026-06-21; publish approval gate + deck-fork (e2ca8508) + viewer analytics (c8eba501) already shipped]` — see [[Pitch Decks Product Designer E2E Audit]]
- [ ] Company Brain ingestion + ACL: auto-ingest connectors (Slack/Confluence/SharePoint) + cross-source ACL-aware retrieval `[verified 2026-06-21 real-gap]` `[2026-06-22: DESIGN DRAFTED — shared ingestConnectorDocument + source_acl jsonb + searchSemantic userId filter; per-connector provider OAuth]` — see [[Spec - Brain Auto-Ingest Connectors]] · [[Company Brain AI E2E Audit]]
- [ ] Email automation depth: deliverability testing (inbox/spam) `[verified 2026-06-21; approval-vs-send gate already shipped]` `[2026-06-22: BRANCHING JOURNEYS SHIPPED (d72935a7) + SIGNUP FORMS SHIPPED (134130b8) — public signup → subscriber + list_join enrollment loop closed; 19 e2e total. REMAINING: P2 deliverability testing (external) + signup embed.js/double-opt-in follow-ups]` — see [[Spec - Email Branching Journeys]] · [[Email Campaigns E2E Audit]]
- [ ] Sites publishing safety: backup-on-publish + publish-to-prod promotion + auto-rollback `[verified 2026-06-21; true staging env already shipped]` `[2026-06-22: DESIGN DRAFTED — wires over existing site_snapshots/website_backups/exportSite primitives]` — see [[Spec - Sites Publishing Safety]] · [[Sites Hosting Publishing E2E Audit]]
- [ ] Storefront conversion: jurisdiction-based tax + recovery EMAIL sequence `[verified 2026-06-21; wallet checkout already shipped]` `[2026-06-22: P1 ABANDONED-CART INFRA SHIPPED (45357b97) — detection cron + recovery token/route + dead order.placed event fixed; 3 e2e. REMAINING: P2 recovery email sequence (local) + P3 tax=Stripe Tax/table (external)]` — see [[Spec - Storefront Conversion]] · [[Storefront Commerce E2E Audit]]
- [ ] Surveys in-form fields: payment field + e-signature field `[verified 2026-06-21 real-gap]` `[2026-06-22: DESIGN DRAFTED — payment/esignature field types gate completedAt; reuse resolveSiteStripe + DropboxSign; P1 local]` — see [[Spec - Surveys In-Form Payment + E-Signature]] · [[Surveys E2E Audit]]
- [ ] Plugins ecosystem: self-serve/admin install-uninstall lifecycle + marketplace browse/install UI `[verified 2026-06-21; runtime + entitlements + consumer view already shipped]` `[2026-06-22: DESIGN DRAFTED — registered_app_installs layered over entitlement.ts; 3 phases]` — see [[Spec - Plugins Ecosystem]] · [[Plugins Extension E2E Audit]]
- [ ] Public developer surface: API-key auth on the headless content API `[2026-06-22: site-level outbound webhooks SHIPPED (d90587fd)]` `[2026-06-22: PHASE 1 COMPLETE — keys hashed at rest + require-key (57abb226) + per-key scope enforcement & scope UI (e577b067); ⚠ both security holes closed. REMAINING: P2 Redis-backed rate limit + P3 write surface]` — see [[Spec - Public Developer API-Key Auth]] · [[Integrations E2E Audit]]
- [ ] Visual editor: in-canvas AI section generation `[verified 2026-06-21; scroll/timeline blocks already shipped]` `[2026-06-22: DESIGN DRAFTED — prompt → Anthropic tool_use constrained by BUILT_IN_SCHEMAS → validate/repair → insert via BLOCKS_UPDATE; P1 local (AI provider dep)]` — see [[Spec - Visual Editor AI Section Generation]] · [[Visual Editor E2E Audit]]
- [ ] Agentic OS: agent-action audit trail — runId env→header propagation + review UI `[verified 2026-06-21]` `[2026-06-22: P1 + INSTRUMENTATION SHIPPED + VERIFIED (b338800b, 86c604c8) — agent_action_logs + wrapRegisterTool writes redacted audit rows; instrumentation now has an end-to-end unit test (tool call → row, success+error) + runId typed on PortalMcpContext. REMAINING: AGENTIC_RUN_ID env→x-agentic-run-id header→ctx flow (cross-process) + admin/portal review views (P3)]` — see [[Spec - Agentic OS Audit Trail]] · [[00 - E2E Audit Index]]

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
