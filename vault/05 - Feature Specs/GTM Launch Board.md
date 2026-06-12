---
kanban-plugin: board
type: index
domain: go-to-market
date: 2026-06-11
---

> Launch board for [[Go-To-Market — Self-Serve SaaS]]. Lanes are phases. **Reassessed 2026-06-11 after merging the self-serve signup funnel into dev** (and applying its migration to the dev DB): much of Phase 1 is now built — but on an à-la-carte + card-trial model that diverges from the GTM plan. **Work the Reconcile lane first.**

## Reconcile — shipped funnel vs GTM strategy (decide first)

- [x] **Pricing model — FULLY SHIPPED on dev (2026-06-11)** — 3 tiers (`plan-*`) over the module machinery; `TierPlans` cards primary on the plans page + signup wizard (à-la-carte behind a "Customize" toggle); tier SKUs seeded in dev's TEST Stripe; checkout wired (select tier → Stripe subscription + 14-day card trial). Remaining: run `sync-stripe-products.ts` in LIVE mode for staging/prod + backfill catalog IDs. — see [[Self-Serve Signup Funnel & Module Onboarding]]
- [x] **Trial mechanic — both/and SHIPPED (2026-06-11)** — 14-day card-required trial (built) = paid-conversion path; cardless free-credit grant at signup (`grantSignupCredits`, verify-gated) = viral $0 door. Both live.
- [x] **Activation — demo-seeder SHIPPED (2026-06-11)** — `seedDemoWorkspace` at signup (sample company/contacts/deals + project, tenant-scoped, idempotent, non-blocking, both signup paths). Funnel's per-module onboarding kept. Remaining: agent-led "set up YOUR business" layered on the seeded demo.
- [x] **BYOK-Scale gating SHIPPED (2026-06-11)** — `byokEligible` on entitlements (only Scale/bundle/bypass); byok-mode entry gated in the admin route, so the metering waiver is now Scale-only. STILL OPEN: the marked-up metered-AI overage wiring + per-action credit cost (Phase 0).

## Phase 0 — Beachhead (existing clients)

- [ ] Lock the 3 tiers (Starter/Growth/Scale): features, per-seat price, included AI credit allowance — see [[Go-To-Market — Self-Serve SaaS]]
- [x] Create Stripe Products/Prices for the tiers — DONE on dev (test mode) via the extended `sync-stripe-products.ts`; staging/prod still need a LIVE-mode run
- [ ] Apply BYOK inversion: gate metering-waiver to the Scale tier + marked-up overage on Starter/Growth (profit-center model)
- [x] Build demo-workspace seeder — DONE (`lib/onboarding/demo-seed.ts`, hooked into signup both paths; sample CRM + project, tenant-scoped)
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
