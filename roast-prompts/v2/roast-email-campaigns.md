# Roast V2: Email & Campaigns — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

SD's Email & Campaigns domain covers two tightly coupled concerns: campaign email (per-tenant marketing lists, subscriber management, block-built HTML campaigns, A/B subject-line testing, scheduling, resume-safe dispatch, and open/click/bounce tracking) and transactional email (event-driven sends for orders, bookings, invites, and MCP approval notifications, each with per-website template overrides).

The repositioned headline: **AI-agent-safe email infrastructure**. Not a Mailchimp alternative.

That means three things concretely: (1) BYOK-first architecture — SD orchestrates campaign sends and transactional sends against the tenant's own Resend account and sending reputation, never pooling on a shared platform sender; (2) every irreversible action (campaign schedule, send) routes through the approval gate so an AI agent cannot blast a live list without a human click; (3) inbound email — a Cloudflare Email Worker + Claude agentic loop — closes the attribution loop by parsing replies into platform actions and auto-ingesting forwarded email into Company Brain meeting records.

The BYOK-default pivot and the Resend billing API wiring are committed, scoped work being closed as GO-LIVE BLOCKERs (see Constraints). The approval-gate and Brain-inbound paths already ship.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS who need to send marketing campaigns on behalf of their clients and trigger transactional emails from the same platform that runs their store, bookings, and CRM — without pooling client sending reputation on a shared provider.
- **End user:** The agency's clients and their end-customers (subscribers, buyers, booking guests).
- **Monetization:** Bundled into the SD subscription tier. BYOK is the default and primary path — agencies bring their own Resend key, SD orchestrates without touching their reputation or absorbing per-send COGS. A platform-managed (non-BYOK) fallback path exists for tenants without a Resend account, but it will not onboard live volume until the real Resend billing API is wired (currently stub mode — a GO-LIVE BLOCKER; see Constraints). The BYOK default means the platform's email margin story is orchestration value, not volume reselling.

## The edge

- **BYOK-first reputation isolation.** SD never pools tenant sending on a shared domain. Each agency's campaigns run through their own Resend account, their own domain reputation, and their own suppression lists. The 2025 multi-tenant inbox-rate collapse — where one bad-hygiene tenant tanks shared placement — is structurally prevented, not mitigated. No point tool offers this by default because most earn margin on volume reselling.
- **AI-agent-safe approval gating.** Campaign create, schedule, and send all route through `stageOrApply`, holding mutations in a pending-change queue when approval is required. A rogue agent cannot blast a live list without a human click. This is a real differentiator: Mailchimp, Klaviyo, and ConvertKit are designed for humans only. As agencies hand AI agents increasing access to platform writes, email is the highest-stakes surface — and the gate is already wired.
- **Brain inbound ingestion as headline demo.** The Cloudflare Email Worker + Claude agentic loop means a reply to a campaign email can trigger platform actions. The dedicated `brain+<token>@simplerdevelopment.com` address turns forwarded emails into Company Brain meeting records automatically. This closes an attribution loop no point tool closes: outbound campaign → reply → CRM record → Brain context, in one platform, with no Zapier chain.
- **One data model across every send event.** Campaign sends, order confirmations, booking reminders, survey follow-ups, and MCP approval notifications all run through the same Resend proxy, the same render pipeline (`render-blocks-to-email.ts`), and the same per-website template override system. Point tools require integrating each of these separately.
- **Brand-injected rendering baked in.** `apply-branding-to-blocks.ts` pulls the active branding profile and injects fonts, colours, and logo into every block-built email before render — no manual style overrides per campaign.

## Constraints

- Solo founder / tiny team; SD is a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- **GO-LIVE BLOCKER 1 — BYOK to default architecture (real code work, not done):** Currently BYOK is opt-in (billing perk). Before onboarding any agency on the platform-managed path, BYOK must become the default so that platform-managed sending is the narrow opt-out, not the default. This is a routing and configuration change in the Resend proxy layer — scoped and committed, not yet shipped.
- **GO-LIVE BLOCKER 2 — Resend billing API wiring (real code work, not done):** The `resend-usage-sync` cron that rolls send counts into billing events is currently in stub mode. No non-BYOK volume goes live until the real Resend billing API integration is wired and usage events are flowing through to SD billing. This is called out explicitly in the existing codebase; it is a scoped engineering task, not a positioning change.
- No standalone ambition and no feature-parity race with Mailchimp, Klaviyo, or ConvertKit. The brief is BYOK orchestration + approval gating + Brain attribution — not list-growth tooling, not A/B split-test automation, not deliverability consulting.

## Roast it on two lenses

1. **Earns its place in the suite?** With BYOK as default architecture and the approval gate live, this is genuinely differentiated: agencies get cross-channel email (campaign + transactional + inbound) with reputation isolation and human-in-the-loop AI safety in one platform — none of which point tools offer in combination. The open question is whether the two BLOCKERs ship fast enough that no real agency is onboarded prematurely, and whether the Brain inbound demo is compelling enough in-context to close the deliverability objection.
2. **Could it stand alone?** No standalone ambition — bundled retention layer. The edge is entirely derivative of co-location (shared approval queue with CRM writes, shared Brain with inbound replies, shared branding pipeline with the CMS). Spun out it is a Resend wrapper with no moat.

## Riskiest assumption to pressure-test

The original V1 assumption — that agencies will trust SD's shared sending reputation over Mailchimp/Klaviyo where their domain reputation already lives — is abandoned. The reframed posture flips it: agencies adopt SD email orchestration *because* SD never touches their sending reputation. The remaining test is narrower and falsifiable: **does inbox placement hold when SD orchestrates but the client owns the Resend account and warm domain?**

Cheapest test: take one real agency's already-warm domain, send identical campaign content through SD's BYOK path and natively from their existing tool, and compare inbox placement via a seed-list tool (GlockApps or mail-tester.com). 48 hours, near-zero cost. If placement holds, the deliverability objection is empirically dead; if it degrades, something in SD's orchestration layer (headers, DKIM pass-through, bounce handling) needs diagnosis before any agency email goes to a real list.
