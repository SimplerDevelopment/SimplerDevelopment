---
type: spec
domain: billing
status: validating
date: 2026-06-11
sources:
  - lib/onboarding/types.ts
  - lib/onboarding/service.ts
  - app/portal/onboarding/page.tsx
  - lib/billing/domain-catalog.ts
  - app/api/portal/billing/modules/checkout/route.ts
  - app/api/stripe/webhook/route.ts
---

# Feature: Self-Serve Signup Funnel & Module Onboarding

Builds on [[Per-Domain SaaS Billing & BYOK]]. Decisions resolved via grill-me interview with Dan, 2026-06-11.

## Overview

Public self-serve funnel: sign up → choose modules → pay (trial) → product-specific
onboarding → ready to use, ending with a one-click related-module upsell. Converts
the per-domain SKU catalog into a PLG motion.

## The flow

1. **Sign up** — public `/signup`: email+password (Resend magic-link verification)
   or Google OAuth (pre-verified). Creates user + client (`billingMode='saas'`) +
   `user_onboarding` row. Deep-linkable cart: `/signup?modules=crm,email` (the
   locked-nav lock icons and marketing pages feed this).
2. **Choose products** — wizard step reusing plans-page module cards; cart with
   running total; bundle auto-suggest when cart ≥ bundle price.
3. **Payment** — ONE Stripe Checkout Session, `mode=subscription`, one line item
   per module, `trial_period_days: 14` (card required, $0 today). Webhook upserts
   one `clientServices` row per line item sharing `stripeSubscriptionId` — one
   invoice / renewal / trial clock. Stripe status `trialing` is treated as active.
4. **Product-specific onboarding** — segment registry
   (`lib/onboarding/module-segments.ts`, keyed by domain key) spliced into the
   existing wizard. v1 rich segments: websites (name site → template), crm
   (import contacts → pipeline), email (verify sender → first list), brain
   (upload docs → connect calendar), projects (first board). Other 7 modules get
   a generic "first 3 wins" fallback card.
5. **Ready to use** — dashboard gains a persistent "Get started" checklist
   rendering the same segments; modules purchased later surface their segment
   there (post-purchase activation path).
6. **Upsell finale** — up to 3 modules from catalog `promotesTo` minus owned;
   one-click "Add $X/mo" appends a line item to the live subscription
   (new add-line-item API, prorated, joins trial). Bundle-gap nudge with
   one-click swap to the bundle.
7. **Abandoners** — verified login persists into the locked-nav portal; nurture
   emails day 1/3/7; never-verified accounts purged after 7 days (cron).

## Decisions (alternatives rejected)

- Fully public signup (vs approval-gated / invite-only)
- Integrated deep-linkable wizard (vs public pricing-page-first / buy-inside-portal)
- 14-day card-required trial (vs pay-now / cardless trial à la `brainTrialUntil`)
- Single subscription, N line items (vs subscription-per-module status quo)
- Step registry + dashboard checklist hub (vs wizard-only / checklist-only)
- One-click add + bundle nudge (vs soft pointer / discount-incentivized)
- Limbo portal + nurture for abandoners (vs hard paywall / time-boxed freeze)
- Email+password AND Google (vs credentials-only / Google-only)
- Top-5 rich segments + fallback (vs all-12 bespoke / fallback-only)

## Phasing

- **Phase 1 — revenue path:** `/signup` + signup API + verification + Google
  provider with account linking; cart wizard step; multi-line-item checkout
  (`slugs[]`); webhook multi-item handling.
- **Phase 2 — activation:** segment registry; 5 rich segments + fallback;
  "Get started" dashboard checklist wired to post-signup purchases.
- **Phase 3 — growth:** add-line-item + bundle-swap APIs (plans page reuses
  both); upsell wizard step; nurture + purge crons.

## Risks / invariants

- Auth surface (signup, Google account-linking same-email cases) is the most
  sensitive change — Opus-reviewed, tenancy gates run.
- Enforce one trial per client (flag) — card requirement covers most abuse.
- Existing invited/agency clients keep the current wizard untouched; module
  segments splice only when purchases exist.
- Webhook must treat Stripe `trialing` as entitled.

## Shipped (2026-06-11)

Commits e2faf943 + 8566e8ed on `worktree/domain-walk`. Full browser-verified walkthrough through the sign-up flow to Stripe sandbox checkout confirmed working.

**Remaining validation before Shipped:**

1. Deploy to staging and verify the full funnel end-to-end against the staging Stripe environment.
2. Run `scripts/billing/sync-stripe-products.ts` per environment to provision Stripe Products/Prices; paste the resulting IDs into the `services.stripePriceId` rows for that environment.
3. Complete a test-card checkout (e.g. `4242 4242 4242 4242`) through to subscription activation to exercise the `checkout.session.completed` webhook and confirm module entitlements are written to `clientServices`.
4. **Google OAuth:** add the NextAuth callback URL (`/api/auth/callback/google`) to the allowed redirect URIs in the Google OAuth client for each environment. Ensure `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (or `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if reusing the existing workspace credential) are set in the environment — the provider is configured but the env vars must be present before the Google sign-in button is live.
