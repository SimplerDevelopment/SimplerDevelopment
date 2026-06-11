---
kanban-plugin: board
type: index
domain: go-to-market
date: 2026-06-11
---

> Launch board for [[Go-To-Market — Self-Serve SaaS]]. Lanes are phases. **Reassessed 2026-06-11 after merging the self-serve signup funnel into dev** (and applying its migration to the dev DB): much of Phase 1 is now built — but on an à-la-carte + card-trial model that diverges from the GTM plan. **Work the Reconcile lane first.**

## Reconcile — shipped funnel vs GTM strategy (decide first)

- [ ] **Pricing model** — funnel ships an à-la-carte module cart + bundle; GTM plan locked **3 per-seat tiers**. Reconcilable: present Starter/Growth/Scale as curated tier-bundles *over* the existing module machinery (plan already keeps modules underneath). — see [[Self-Serve Signup Funnel & Module Onboarding]]
- [ ] **Trial mechanic — DECIDED 2026-06-11: both/and** — keep the built 14-day card-required trial as the paid-conversion path; ADD a cardless free-credit grant as the viral/referral $0 door. (Card-trial is built; the cardless credit-grant is new Phase-0 work.)
- [ ] **Activation** — funnel ships per-module onboarding segments; GTM plan wants demo-workspace → agent-led setup. Complementary: keep the built segments, layer demo-seed + agent-led on top.
- [ ] **Metered-AI + BYOK layer** — funnel is module-subscription only; the metered-credit model + BYOK-Scale-unlock (`lib/ai-credits.ts`) still needs wiring onto it.

## Phase 0 — Beachhead (existing clients)

- [ ] Lock the 3 tiers (Starter/Growth/Scale): features, per-seat price, included AI credit allowance — see [[Go-To-Market — Self-Serve SaaS]]
- [ ] Create Stripe Products/Prices for the tiers — funnel shipped `scripts/billing/sync-stripe-products.ts` to provision; tiers still need defining
- [ ] Apply BYOK inversion: gate metering-waiver to the Scale tier + marked-up overage on Starter/Growth (profit-center model)
- [ ] Build demo-workspace seeder — sample contacts/deals/draft site/projects (reuse sd-agent-super's brain demo-seed factory)
- [ ] FIX revenue-integrity: handle `invoice.payment_failed` — grace + notify (do NOT flip status; `entitlements.ts` gates on `status='active'`, so a flip cuts access)
- [ ] FIX revenue-integrity: auto-provision `metered_subscription_items` at checkout so overage actually bills
- [ ] FIX revenue-integrity: collect pay-as-you-go overage debt (`lib/ai-credits.ts`)
- [ ] Per-action credit-cost transparency in the AI chat UI
- [ ] User-set spend caps + budget alerts (anti-bill-shock guardrail)
- [ ] Convert existing agency clients to `saas` mode
- [ ] Fix 9 pre-existing `oauth_clients` tenancy failures; get `bun test:tenancy` green
- [ ] Instrument activation analytics (Sentry spans now exist via sd-agent — extend with funnel + `portal.route` events)

## Phase 1 — Private Beta (cold funnel)

- [ ] Public 3-tier pricing page `/pricing` — reconcile with the built module wizard (see Reconcile lane)
- [ ] Stripe Customer Portal (payment methods, invoices, manage sub); fix payment-method detach stub
- [ ] Waitlist + invite-gating system
- [ ] Demo-workspace → agent-led "set up YOUR business" (layer onto the built per-module onboarding segments)
- [ ] Verify onboarding's `websites` segment actually provisions a starter site
- [ ] Abuse protection: signup rate-limit + bot protection (purge-unverified cron already shipped)
- [ ] Google OAuth go-live: add callback URL + set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` per environment (provider built; env vars missing)
- [ ] Beta funnel instrumentation: signup → activation → trial → paid

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

- [ ] Flip the Haiku intent-router from shadow → active once `portal.route` accuracy data is in
- [ ] Encrypt user-level Google/MS refresh tokens at rest (unblocks import) — see [[Integrations - Google, Microsoft & OAuth]]
- [ ] Google/email/CSV import as a Brain-feeding "deepen" activation step
- [ ] Deeper API-level module gating in `saas` mode (currently nav/layout only)
- [ ] Expand in-app agent tool coverage (store domain, deeper kanban) toward MCP parity
- [ ] White-label / agency sub-account resale (Scale-tier expansion)
- [ ] Annual billing option
- [ ] Niche-first vertical landing (wealth-advisory Brain template) — if the niche sub-play is pursued

## Done

- [x] **Self-serve signup funnel** — public `/signup` (email+password + Google OAuth), email verification, `billingMode='saas'` provisioning, deep-link module cart, multi-item **card-required trial** checkout, per-module onboarding segments, one-click upsell, purge-unverified cron (merged to dev 2026-06-11; à-la-carte model — see Reconcile)
- [x] Dev DB: applied `002_signup_funnel.sql` (users email-verify + `google_id`, `clients.trial_used_at`) (2026-06-11)
- [x] FIX revenue-integrity: monthly AI credits re-granted on **renewal** (`invoice.paid`) — merged (2026-06-11)
- [x] AI cost optimization: Haiku intent-router for the chat wedge (shadow) + real Sentry agent spans — merged via sd-agent (2026-06-11)
- [x] Consolidated all recent work into dev (funnel + sd-agent + fallow tooling) + cut `feat/gtm-launch` (2026-06-11)
- [x] GTM strategy locked via `/grill-me` (9 forks) + plan authored + board scaffolded (2026-06-11)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false,false]}
```
%%
