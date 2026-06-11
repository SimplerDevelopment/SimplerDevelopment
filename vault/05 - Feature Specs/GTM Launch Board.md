---
kanban-plugin: board
type: index
domain: go-to-market
date: 2026-06-11
---

> Launch board for [[Go-To-Market — Self-Serve SaaS]]. Lanes are phases (sequencing decision #7). Cards are concrete work items derived from the 2026-06-11 codebase review. Check off `- [x]` or drag to **Done** as they ship.

## Phase 0 — Beachhead (existing clients)

- [ ] Lock the 3 tiers (Starter/Growth/Scale): features, per-seat price, included AI credit allowance — see [[Go-To-Market — Self-Serve SaaS]]
- [ ] Create Stripe Products/Prices for the 3 tiers (+ credit→$ rate)
- [ ] Build demo-workspace seeder — sample contacts/deals/draft site/projects for new tenants
- [ ] Implement one-time free-credit grant on account creation (no card)
- [ ] FIX revenue-integrity: grant monthly AI credits on **renewal** (`invoice.paid`), not only initial checkout — `app/api/stripe/webhook/route.ts`
- [ ] FIX revenue-integrity: handle `invoice.payment_failed` — dunning / grace period / notify
- [ ] FIX revenue-integrity: auto-provision `metered_subscription_items` at checkout so overage actually bills
- [ ] FIX revenue-integrity: collect pay-as-you-go overage debt (tracked in `lib/ai-credits.ts`, never invoiced)
- [ ] Per-action credit-cost transparency in the AI chat UI ("this run ≈ N credits")
- [ ] User-set spend caps + budget alerts (anti-bill-shock guardrail)
- [ ] Convert existing agency clients to `saas` mode; onboard onto tier + credit model
- [ ] Fix 9 pre-existing `oauth_clients` tenancy failures; get `bun test:tenancy` green
- [ ] Instrument activation analytics: time-to-aha, credit-burn/trial, first-workflow-completion
- [ ] Capture first case studies / testimonials from converted clients

## Phase 1 — Private Beta (invite-only cold funnel)

- [ ] Build public signup route `/signup` — create user+client+owner, email verification
- [ ] Auto-set `billingMode='saas'` on self-signup (not the `agency` default)
- [ ] Stripe-triggered provisioning: checkout → account + subscription end-to-end, **zero human touch**
- [ ] Public 3-tier pricing page `/pricing` — "HubSpot power without the cliff" messaging
- [ ] Stripe Customer Portal (payment methods, invoices, manage sub); fix payment-method detach stub
- [ ] Waitlist + invite-gating system
- [ ] Post-signup activation flow: demo workspace → agent-led "set up YOUR business"
- [ ] Onboarding wizard creates a starter site (or fold into agent-led setup)
- [ ] Abuse protection: signup rate-limit, bot protection, free-credit-grant abuse caps
- [ ] Beta funnel instrumentation (signup→activation→trial→paid) + in-app feedback

## Phase 2 — Public Launch (PLG + viral)

- [ ] Referral-credits mechanic — referrer + referee credit grants + tracking
- [ ] Shareable agent artifacts — "made with" attribution on built pages/sites/decks, linking back
- [ ] Public template/recipe gallery — SEO surface + shareable agentic workflows
- [ ] Wire streaming/mobile chat to `PORTAL_TOOLS` — agentic wedge on mobile (`/stream` is text-only today)
- [ ] Landing page refresh (AI-native positioning) + demo video + "vs HubSpot" comparison page
- [ ] Product Hunt launch-moment prep
- [ ] List as an MCP server / in AI-tool directories (ecosystem angle)
- [ ] Lifecycle emails — credit-depletion → convert, activation nudges
- [ ] Verify provisioning / shared-hosting path scales for self-serve volume — `lib/website-provisioner.ts`

## Later / Post-Launch

- [ ] Encrypt user-level Google/MS refresh tokens at rest (unblocks import) — see [[Integrations - Google, Microsoft & OAuth]]
- [ ] Google/email/CSV import as a Brain-feeding "deepen" activation step
- [ ] Deeper API-level module gating in `saas` mode (currently nav/layout only)
- [ ] Expand in-app agent tool coverage (store domain, deeper kanban) toward MCP parity
- [ ] White-label / agency sub-account resale (Scale-tier expansion)
- [ ] Annual billing option
- [ ] Niche-first vertical landing (wealth-advisory Brain template) — if the niche sub-play is pursued

## Done

- [x] GTM strategy locked via `/grill-me` (9 forks) + plan authored + board scaffolded (2026-06-11)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false,false]}
```
%%
