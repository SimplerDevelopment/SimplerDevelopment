---
type: spec
domain: validation
status: active
date: 2026-06-17
sources: []
---

# Competitive Gap Analysis — June 2026

Provenance: 21-domain research workflow, adversarially verified (Phase 3 of [[Platform E2E + Competitive Audit]]). Competitors surveyed: HubSpot, Pipedrive, Webflow, Clerk, WorkOS, Klaviyo, Pitch, Shopify, Cal.com, GoHighLevel, Zapier, n8n, PostHog, Sanity, Stripe Billing, Orb, WP Engine. Coverage caveat at end of section 4.

> **CORRECTION (2026-06-17):** Top-10 gaps **#1 (failed-payment dunning)** and **#2 (self-serve billing portal)** were flagged from a pre-`market-ready-makeover` snapshot and are **already SHIPPED on `dev`** — `app/api/portal/billing/customer-portal/route.ts` + the full dunning webhook lifecycle in `app/api/stripe/webhook/route.ts` + `lib/billing/dunning-emails.ts`. Do not re-build them; see [[Spec - Billing Dunning + Self-Serve Portal]]. Treat other gaps as candidates to similarly re-verify against current `dev` before implementing — the makeover may have closed more than this audit's snapshot reflected.
>
> **Re-verification (2026-06-17):** the 4 next-ranked specs were checked against dev — Auth MFA = real gap; Durable Automation = partial (Brain Playbooks/rules engine already durable, visual canvas is the gap); White-Label = partial (entitlement engine shipped); Predictive = absent confirmed. See each spec's "Verified against dev" section.

---

## 1. Executive Summary

The recurring "we have the primitives, not the product" pattern is the whole story. Across nearly every domain SD already owns the substrate (multi-tenancy, MCP-native authoring, an approval gate, snapshots, Stripe metering, ~26 crons, an event bus) but stops short of the packaged feature competitors ship. The biggest wins are *wiring*, not greenfield infrastructure.

The single largest strategic gap is GoHighLevel-class white-label SaaS-resell + durable automation — and it was never audited. The two load-bearing domains that decide whether SD can be *resold by agencies* (Automations & Workflows — runtime is admittedly "demo-grade, no durable queue, no retries"; and Billing & Stripe — no dunning, no customer portal, no rebilling) are exactly where GHL, the most-cited competitor, wins. This dwarfs every per-domain refinement below.

Six gaps are genuinely cross-cutting and should be built once as platform services, not N times: a predictive/ML scoring layer, a public outbound-webhook/developer API, a unified analytics/attribution engine, an SMS/non-email channel, identity-assurance (MFA + rate limiting + signer verification), and durable scheduled execution.

SD's defensible wedge is real and consistent: AI-authored + human-approved + brand-grounded, all in one tenant. The MCP-write surface plus the approval gate plus Company Brain RAG is a "governed agent ops" story no point competitor (Webflow, Clerk, Klaviyo, Pitch, Shopify) can tell. Lean in rather than chase SSO/SCIM/CDN parity.

Hard table-stakes gaps still threaten core credibility in three domains: Auth (no MFA, no audit log, no rate limiting), Billing (no dunning, no self-serve portal — silent revenue loss today), and Sites (no true staging, no automated backups/rollback). These are not differentiators; they are the cost of being taken seriously.

---

## 2. Top 10 Highest-Priority Gaps (Platform-Wide)

| # | Gap | Domain | Severity | Competitor |
|---|-----|--------|----------|------------|
| 1 | Failed-payment dunning + automatic retries (declines silently lost today) | Billing & Stripe | table-stakes | Stripe Billing, Orb |
| 2 | Customer self-serve billing portal (card/invoice/subscription management) | Billing & Stripe | table-stakes | Stripe Billing |
| 3 | Durable, retrying, branching automation runtime (current runtime is fire-and-forget, no retries) | Automations & Workflows | table-stakes | Zapier, n8n, GoHighLevel |
| 4 | Multi-factor authentication (TOTP/SMS/backup codes) | Auth & Security | table-stakes | Clerk |
| 5 | White-label SaaS-resell layer (cloneable onboarding + tiered entitlements + Stripe usage rebilling) | Agency / Billing | differentiator | GoHighLevel |
| 6 | Platform-wide audit log + RBAC + rate limiting on auth/reset endpoints | Auth & Security | table-stakes | WorkOS, Clerk |
| 7 | True staging environment + automated backups/auto-rollback on failed publish | Sites, Hosting & Publishing | table-stakes / differentiator | WP Engine, Webflow |
| 8 | Shared predictive/ML scoring layer (CRM forecasting, email CLV/churn/send-time, commerce cohorts) | Cross-cutting (CRM/Email/Storefront) | differentiator | HubSpot, Klaviyo |
| 9 | Public outbound webhooks + developer/headless content-delivery API | Cross-cutting (Bookings/CMS/CRM) | differentiator | Cal.com, Webflow, Sanity |
| 10 | Two-way email sync + sequences/cadences in CRM (the most-used CRM surface) | CRM | differentiator | HubSpot, Pipedrive |

---

## 3. Per-Domain Verdict

| Domain | Biggest gap | Our edge |
|--------|-------------|----------|
| Agency, Onboarding & Branding | No SaaS-resell layer (cloneable onboarding + entitlements + rebilling) | Onboarding auto-seeds an AI Company Brain; brand profile drives the whole produce-on-brand pipeline |
| Auth & Security | No MFA / audit log / rate limiting (hard table-stakes) | Built-in OAuth 2.1 server + scoped `sd_mcp_*` agent tokens — MCP-native auth |
| Sites, Hosting & Publishing | No true staging + automated backups/auto-rollback | Multi-backend (Vercel+Railway) provisioning; snapshots as portable site-state |
| CMS & Blocks | No reference fields / scheduled auto-publish (cron not wired) | MCP-write + native human-approval queue on agent-authored content |
| Visual Editor | No in-canvas AI section generation; no scroll/timeline interactions | MCP-driven authoring + approval-iframe client sign-off, brand-grounded |
| Company Brain & AI | No auto-ingest connectors (Slack/Confluence/SharePoint) + no ACL-aware retrieval | Mandatory human-approval review queue; structured governance entities (decisions/playbooks/goals) |
| CRM | No two-way email sync / sequences / AI deal assistant | Native e-sign + proposals as lifecycle objects; signed-to-onboarded in one tenant |
| E-Sign & Approvals | No signer identity verification (OTP/KBA); no reminder nudges | WYSIWYG live-artifact preview (approve exactly what publishes) across 6 entity types |
| Email & Campaigns | No branching journeys / deliverability testing / list-growth forms | Approval-vs-send governance gate; shared block builder across web + email |
| Storefront & Commerce | No abandoned-cart recovery / auto tax / wallet checkout | Designer + Printful POD wired into one order pipeline inside the portal |
| Bookings & Services | No external-calendar free/busy check (double-book risk); no reschedule/SMS | Gift certs, waivers, add-ons, approval-gated publish; commerce-native scheduling |
| Pitch Decks & Designer | No viewer analytics / access control on shared decks | Draft/live approval gate; decks are first-class blocks sharing brand + media |
| Surveys | No in-form payment or e-signature field | Native route-to-CRM, scoring, A/B, post-submit sequences — no Zapier hop |
| Projects, Tickets & Kanban | No burndown/velocity reporting, no SLA/CSAT on tickets | Time logs, recurrences, templates, dependencies all in base tier (no tier-gating) |
| AB Testing | No sequential/valid-peeking stats + SRM guardrail (false-positive hole) | Experiments on rendered CMS/decks via the same visual editor, auto-scoped per tenant |
| Automations & Workflows | Non-durable runtime: no retries, no branching, no loops | Plain-English→rule parser native; tracked trigger-links as a workflow entry point |
| Billing & Stripe | No dunning + no self-serve portal (active revenue leak) | Metered usage rollup + AI credit ledger + Connect/BYOK already in place |

See per-domain boards: [[Agency Onboarding Branding E2E Audit]] · [[Auth Security E2E Audit]] · [[Sites Hosting Publishing E2E Audit]] · [[CMS Blocks E2E Audit]] · [[Visual Editor E2E Audit]] · [[Company Brain AI E2E Audit]] · [[CRM E2E Audit]] · [[ESign Approvals E2E Audit]] · [[Email Campaigns E2E Audit]] · [[Storefront Commerce E2E Audit]] · [[Bookings Services E2E Audit]] · [[Pitch Decks Product Designer E2E Audit]] · [[Surveys E2E Audit]] · [[Projects Tickets Kanban E2E Audit]] · [[AB Testing E2E Audit]] · [[Automations Workflows E2E Audit]] · [[Billing Stripe E2E Audit]] · [[Chat Realtime Voice E2E Audit]] · [[Integrations E2E Audit]] · [[Plugins Extension E2E Audit]] · [[Agentic OS E2E Audit]]

---

## 4. Cross-Cutting Themes

These appear in 3+ domains and should each be one platform service, not repeated builds:

1. **Predictive / ML scoring layer.** Missing identically in CRM (forecasting), Email (CLV/churn/send-time), and Storefront (cohort/benchmark). Same build, same wedge: predict on the client's own integrated first-party data grounded in Company Brain — something point tools can only approximate via external integrations.

2. **Public outbound webhooks + developer API.** SD has only internal event buses and inbound vendor receivers. Bookings, CMS (headless delivery), CRM (external sync), and Email all inherit this integration-extensibility gap. Build once at the platform layer.

3. **Unified analytics / attribution engine.** Raw events exist everywhere (Resend opens/clicks, `httpRequestLogs`, order rows) but nothing joins them to revenue. Surfaces as missing deck viewer analytics, email revenue attribution, commerce analytics, CRM forecasting, and visitor de-anonymization.

4. **SMS / non-email channel.** No Twilio path anywhere — email-only. One shared integration would close gaps in Email (SMS channel), Bookings (SMS reminders), and E-Sign (reminder nudges).

5. **Identity assurance.** MFA + rate limiting (Auth) and signer identity verification / OTP-KBA (E-Sign) are the same trust weakness in two domains — a platform-wide identity-assurance gap, not two features.

6. **Durable scheduled execution — re-framed.** SD already runs ~26 crons (per-minute `nextRunAt` scans, survey follow-ups, playbook waits, booking reminders). The genuine gap is narrow — no cron yet wires CMS post auto-publish or `email_campaign` send into the existing scheduler. These are low-effort wiring tasks, not missing infrastructure.

**Coverage caveat:** Eight domains were not audited as their own competitive pass — Automations & Workflows, Billing & Stripe, Chat/Realtime/Voice, Integrations, Projects/Tickets/Kanban, Surveys, Plugins & Extension, and Agentic OS. Two of these (Automations, Billing) hold the single biggest strategic opportunity. Two known inaccuracies follow from the gaps: the Visual Editor audit lists "no real-time co-editing" as a weakness, but Yjs CRDT collab already exists in the un-audited Chat/Realtime domain; and the Visual Editor scored "native A/B testing" as missing, but a full AB Testing engine exists in `lib/db/schema/ab.ts`. Treat those two findings as refuted.

---

## 5. Strategic Opportunities

1. **Build the GoHighLevel-killer: durable automation + white-label SaaS-resell.** Harden the workflow runtime into a durable, retrying, branching journey engine, then layer snapshot-cloneable onboarding + tiered entitlement gating + Stripe usage rebilling on top. SD already has every primitive (event bus, in-process runtime, ~26 crons, metered Stripe billing, snapshots, multi-tenancy). This simultaneously closes the deepest GHL gap and unlocks the highest-revenue business model — agencies reselling SD with margin. This is the priority that dwarfs the rest.

2. **Own "governed agent ops" as the category wedge.** Fuse the three things only SD has — MCP-write authoring, the mandatory human-approval queue, and Company Brain RAG/brand grounding — into one loop: AI generates (pages, decks, emails, SEO meta, CRM follow-ups, campaign copy), brand-correct by construction, gated by a human, logged in one audit trail. This directly answers the enterprise objection to AI/RAG (hallucinated/stale output) and is unmatched by Webflow, Clerk, Klaviyo, Pitch, or Shopify.

3. **Expose the Brain's structured entities + experiment tooling as MCP resources.** Let external AIs and SD's own agents query and act on governance objects (decisions, playbooks, goals) and run A/B tests via natural language. Leapfrogs Glean/Guru's document-centric model and PostHog's SDK-bound experimentation.

4. **Close the credibility table-stakes, fast and cheap.** Dunning + self-serve billing portal (stops active revenue leak), MFA + audit log + rate limiting (every security review filters on these), and staging + auto-backup/rollback. None are differentiators; all are the price of being credible — and several (scheduled publish, billing portal via `billingPortal.sessions.create`) are low-effort wiring against infrastructure SD already has.

5. **Build the six cross-cutting services once.** Prioritize the predictive-scoring layer and the public webhook/developer API — each unlocks features across 3-4 domains simultaneously and reinforces the "predict/integrate on your own first-party data" advantage.
