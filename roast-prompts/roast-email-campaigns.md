# Roast: Email & Campaigns — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SD's Email & Campaigns domain covers two tightly coupled concerns: campaign email (per-tenant marketing lists, subscriber management, block-built HTML campaigns, A/B subject-line testing, scheduling, resume-safe dispatch, and open/click/bounce tracking) and transactional email (event-driven sends for orders, bookings, invites, and MCP approval notifications, each with per-website template overrides). Outbound delivery runs through Resend (with BYOK key support so agencies can route sends through their own Resend accounts). An inbound path — powered by a Cloudflare Email Worker — parses and forwards incoming mail into a Claude agentic loop, and a dedicated address (`brain+<token>@simplerdevelopment.com`) ingests email directly into Company Brain meeting records.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS who need to send marketing campaigns on behalf of their clients and trigger transactional emails from the same platform that runs their store, bookings, and CRM.
- **End user:** The agency's clients and their end-customers (subscribers, buyers, booking guests).
- **Monetization:** Bundled into the SD subscription tier; metered usage via a `resend-usage-sync` cron that rolls send counts into billing events (currently in stub mode — wiring the real Resend billing API is an open TODO). BYOK mode waives platform COGS; non-BYOK sends are a per-send cost center that justifies usage-based billing.

## The edge
- **One data model across every send event.** Campaign sends, order confirmation emails, booking reminders, survey follow-ups, and MCP approval notifications all run through the same Resend proxy, the same render pipeline (`render-blocks-to-email.ts`), and the same per-website template override system. Point tools require integrating each of these separately.
- **Brand-injected rendering baked in.** `apply-branding-to-blocks.ts` pulls the active branding profile (fonts, colours, logo) and injects it into every block-built email before render — no manual style overrides per campaign.
- **Approval-gated irreversible actions.** Campaign create, schedule, and send all route through `stageOrApply`, which holds mutations in a pending-change queue when approval is required. A rogue AI agent cannot blast a live list without a human click. This is a real differentiator versus point tools designed for humans only.
- **AI-native inbound.** The Cloudflare Email Worker + Claude agentic loop means a reply to a campaign email can trigger platform actions. The Brain ingestion path turns forwarded emails into meeting records automatically — something Mailchimp cannot do at any price.
- **BYOK Resend key support.** Agencies on the `byok` billing mode bring their own sending reputation and Resend account; the platform orchestrates without touching their quota or inflating their COGS.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Mailchimp, Klaviyo, ConvertKit, Beehiiv, Customer.io.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
Agencies will trust SD's email infrastructure (and its Resend-backed sending reputation) over Mailchimp, Klaviyo, or ConvertKit — where their subscriber lists, domain reputation, and deliverability history already live — simply because campaigns now share a platform with their CRM and store.
