# Onboarding QA / UX Evaluation — SimplerDevelopment Portal

**Date:** 2026-06-13
**Branch:** `feat/market-ready-makeover`
**Environment:** local dev (`localhost:3000`), DB `simplerdev_test`
**Method:** End-to-end browser walkthrough as a first-time self-serve customer (new account `alex.qa.onboarding@example.com`), full 12-step SaaS path, desktop (1440×900) + mobile (390×844). Screenshots and server logs captured throughout.

---

## TL;DR — Overall quality: **4 / 10**

The wizard itself is **genuinely well-designed** — clean visual language, good copy, smart auto-advance, strong personalization, real working MCP-key generation, and solid mobile responsiveness. If the flow were scored on craft alone it would be an 8.

It is dragged down to a 4 by **two showstoppers that break the actual job-to-be-done**:

1. **A self-serve customer cannot pay.** Every checkout CTA fails — silently on the tier cards, with a cryptic "Module not found." on the payment step.
2. **The reward for finishing onboarding is a full-page "Oops! Something went wrong" crash** — the dashboard the user is dropped onto throws a server error.

Both trace to the same root cause: **the database schema has drifted from the Drizzle schema** (`drizzle-kit push` left columns missing). Until that's fixed, the end-to-end funnel is non-functional regardless of how polished the individual screens are.

---

## Chronological walkthrough (screenshots)

| # | Screen | File |
|---|--------|------|
| 1 | Signup page (first impression) | `01-signup.png` |
| 2 | Signup with invalid data (validation) | `02-signup-validation.png` |
| 3 | "Check your email" confirmation | `03-check-email.png` |
| 4 | Login page | `04-login.png` |
| 5 | Step 1 — Welcome | `05-step1-welcome.png` |
| 6 | Step 2 — About you (role) | `06-step2-about-you.png` |
| 7 | Step 3 — About your company | `07-step3-about-company.png` |
| 8 | Step 3 filled | `08-step3-filled.png` |
| 9 | Step 4 — Pick your tools (pricing) | `09-step4-choose-modules.png` |
| 10 | Step 4 — Customize/module grid expanded | `10-step4-customize-expanded.png` |
| 11 | Checkout failure (tier card — silent) | `11-checkout-error.png` |
| 12 | Bundle selected | `12-bundle-selected.png` |
| 13 | Step 5 — Payment / free trial | `13-step5-payment.png` |
| 14 | Payment failure ("Module not found.") | `14-payment-error.png` |
| 15 | Step 6 — Module setup | `15-step-after-skip.png` |
| 16 | Step 7 — Brand vibe | `16-step7-brand-vibe.png` |
| 17 | Step 8 — Mission | `17-step8-mission.png` |
| 18 | Mission filled via example | `18-mission-filled.png` |
| 19 | Step 9 — Features | `19-step9-features.png` |
| 20 | Step 11 — Power up with Claude (upsell auto-skipped) | `20-step10-upsell.png` |
| 21 | MCP key generated (works) | `21-mcp-key-generated.png` |
| 22 | Step 12 — Done | `22-step12-done.png` |
| 23 | **Post-onboarding dashboard — CRASH** | `23-dashboard-landing.png` |
| 24 | Mobile — Welcome | `24-mobile-welcome.png` |
| 25 | Mobile — Pricing | `25-mobile-pricing.png` |

---

## Functional bugs & defects (by severity)

### 🔴 P0 — Blockers (break the core funnel)

**BUG-1 — Dashboard crashes immediately after onboarding completes.**
After clicking "Take me to my dashboard," the user lands on a full-page **"Oops! Something went wrong"** error.
- Root cause: `getBrainProfile` → `PortalDashboardPage` runs `SELECT ... agent_preferences ... FROM brain_profiles`, but the `brain_profiles` table is **missing the `agent_preferences` column**. `PostgresError: column "agent_preferences" does not exist` → caught by the dashboard error boundary.
- Impact: the climax of the entire funnel is a crash. Maximum-damage placement.
- Evidence: `23-dashboard-landing.png`; server log line ~943/957.

**BUG-2 — Self-serve checkout is completely non-functional.**
Every plan CTA (`Choose Starter/Growth/Scale`, `Start free trial`) calls `POST /api/portal/billing/modules/checkout`, which returns **400 "Module not found."**
- Root cause: the `services` table contains only 2 rows (`monthly-maintenance`, `white-label-domain`) — **none of the actual module/tier slugs are seeded, and zero have a `stripePriceId`.** The route's `rows.length !== slugs.length` guard fires → 400.
- Impact: a self-serve customer literally cannot subscribe or start a trial. Zero conversion is possible.
- Evidence: `11-checkout-error.png`, `14-payment-error.png`; `services` table query.

**BUG-3 — `GET /api/portal/billing/modules` returns 500 on every call.**
- Root cause: query at `app/api/portal/billing/modules/route.ts:41` selects `stripe_subscription_id` from `client_services`, but that **column is missing** from the table. `PostgresError: column "stripe_subscription_id" does not exist`.
- Impact: owned-module state, trial state, and upsell recommendations can't load. The "Pick your tools" step only renders because the *catalog* is static; the live billing layer is dead. Fired 6+ times across the session.
- Evidence: server log lines 105–202; console 500s on every billing step.

> **BUG-1, BUG-2, BUG-3 share one root cause: database schema drift.** The dev DB was applied via `drizzle-kit push` (which `CLAUDE.md` notes has a broken replay), leaving it out of sync with `lib/db/schema/` in at least two tables. A clean migrate + a proper `services` seed (with Stripe price IDs) is the fix.

### 🟠 P1 — High (silent/cryptic failures, broken trust)

**BUG-4 — Tier-card checkout fails silently with zero feedback.**
`StepChooseModules.handleTierCheckout` (`components/portal/onboarding/steps/StepChooseModules.tsx:160-164`): on a non-success response it only calls `setSaving(false)` — no toast, no message, no state change. The user clicks the primary CTA and **nothing happens.**
- This is a code-level defect independent of the data gap: a declined card, Stripe outage, or any 4xx/5xx in production would fail the same silent way.

**BUG-5 — Payment step surfaces a raw internal error to the customer.**
`StepPayment` does show the failure (good) but prints the literal API string **"Module not found."** — meaningless to a customer, with no recovery path. Same 400, two different bad UXs across two steps.

### 🟡 P2 — Medium (quality / correctness)

**BUG-6 — `setState`-during-render React error, systemic across step components.**
Console: *"Cannot update a component (`OnboardingWizard`) while rendering a different component (`StepBrandVibe`)"* — and the identical error in **`StepFeatures`**. Interactive steps appear to call a parent setter during render instead of in an effect/handler. Non-crashing but a real anti-pattern flagged by React (Next.js dev overlay logged it as issues). Likely affects multiple steps.

**BUG-7 — Module-setup walks the user through tools they don't own.**
A user who selected the bundle then **skipped payment** still gets the 5-module "Get started" checklist. Its "Open →" links point at `/portal/websites` etc., which are **locked** (no subscription) and **hard-navigate out of the wizard**, abandoning the flow. The setup step should gate on actual entitlement and/or open in a new tab.

### 🟢 P3 — Low

- **BUG-8** — Signup relies on native HTML5 validation only; submitting a too-short password (`123`) produces no inline error, just a browser bubble. No custom field-level validation messaging.
- **BUG-9** — "Continue with Google" is referenced in the signup/login code paths but **not rendered** on either page (OAuth not surfaced/configured). Either wire it up or remove the dead affordance.
- **BUG-10** — Upsell step (10) silently auto-skips whenever `GET /billing/modules` fails — a real monetization surface is lost with no fallback.

---

## UX issues & recommendations

1. **Onboarding runs inside the full portal chrome.** The wizard renders with the portal sidebar (11 items, all showing 🔒 lock icons), a "Select company" switcher, and live notification bells. A focused funnel should be a distraction-free, full-screen layout. Seeing *everything locked* during setup is also demoralizing and undercuts the "you unlock them all anyway" message. **Recommend:** dedicated minimal onboarding layout (logo + progress + Skip only).

2. **Conflicting free-vs-paid messaging.** Step 9 subtitle says *"Pick the tools you want to try. (You unlock them all anyway.)"* — directly after a paywall and a sidebar full of locks. Pick one truth and tell it consistently.

3. **Signup first impression is generic.** No value proposition, no trust signals, no mention of the free trial. For a self-serve top-of-funnel, add a one-line "what this is" + "14-day free trial, no charge today."

4. **Progress bar stalls during module-setup.** The top bar sits at "Step 6 of 12 / 50%" across all 5 module sub-screens. The "Module X of 5" sub-label helps, but the macro bar feeling frozen for 5 screens reads as "stuck."

5. **Copy polish on the done screen.** *"Want to start with build a website?"* — the feature label isn't grammatically reflowed/capitalized ("…by building a website?").

6. **Minor mobile:** the "Most popular" badge slightly clips the Growth card's top edge at 390px.

### What's genuinely good (keep it)
- Clean, consistent visual system; good use of cards, icons (Material), and spacing.
- Smart interactions: role tiles auto-advance; mission example-prompts fill the field; CTA labels adapt ("Skip this" → "Continue", "All set").
- Strong personalization ("Hey Alex"), clear 2-minute promise, always-available "Skip for now" and "Back".
- **MCP key generation works flawlessly** — one-time reveal, "copy this now" warning, copy button, config snippet.
- **Data persistence is solid** — every answer (role, size, industry, tones, color, mission, features, MCP key id) round-trips correctly through reopen.
- **Mobile responsiveness is strong** — cards stack, targets are tappable, header collapses.
- Graceful degradations exist (upsell auto-skip; payment step shows *an* error).

---

## Top 5 improvements to maximize completion & conversion

1. **Run the migrations / fix schema drift (unblocks BUG-1, BUG-2, BUG-3).** Bring the DB in line with `lib/db/schema/` (`client_services.stripe_subscription_id`, `brain_profiles.agent_preferences`, and any others) and **seed `services` with real Stripe price IDs.** Nothing else matters until checkout works and the dashboard loads. Add a smoke test that asserts `/billing/modules` 200s and the dashboard renders for a fresh account.

2. **Never let a checkout CTA fail silently.** Give `StepChooseModules.handleTierCheckout` the same (better) error UI as everywhere else, and replace raw API strings ("Module not found.") with a human, recoverable message + retry/contact path. This is a permanent production safeguard, not just a dev-data fix.

3. **Guarantee a safe post-onboarding landing.** The dashboard must degrade gracefully (skeleton/empty state), never a server crash — wrap optional data loads (brain profile, billing) so one missing row can't 500 the whole page. The first 5 seconds after "You're all set" decide retention.

4. **Give onboarding its own focused layout.** Drop the locked sidebar / company switcher / notification chrome; resolve the "you unlock them all anyway" vs. paywall contradiction. Reduce cognitive load and the "everything's locked" deflation.

5. **Fix the systemic `setState`-in-render pattern** across step components (BUG-6) and gate module-setup on real entitlement with non-abandoning links (BUG-7). These remove console errors and a dead-end navigation that silently drops users out of the funnel.

---

## Fixes applied (2026-06-13, same session)

Verified live in-browser after each change; `tsc --noEmit` and `eslint` both clean on all touched files.

| Bug | Status | Fix |
|---|---|---|
| **BUG-1** dashboard crash | ✅ Fixed (2 layers) | (a) Healed schema drift: added `brain_profiles.agent_preferences` + created missing `user_dashboard_preferences` table. (b) **Hardened `app/portal/dashboard/page.tsx`** with a `safe()` wrapper so every optional widget/count/pref load degrades to its fallback instead of 500-ing the whole page. Dashboard now renders fully (screenshot `27-dashboard-working.png`). |
| **BUG-3** `/billing/modules` 500 | ✅ Fixed | Added missing `client_services.stripe_subscription_id` column. Endpoint now returns 200. |
| **BUG-4** silent tier-card checkout | ✅ Fixed | `StepChooseModules.handleTierCheckout` now sets a `checkoutError` state and renders a friendly, role-aware message (passes through intentional 403 policy messages). No more silent failure (screenshot `28-checkout-error-fixed.png`). |
| **BUG-5** cryptic "Module not found." | ✅ Fixed | `StepPayment` no longer leaks raw internal strings — shows a recoverable message for 400/500, still surfaces intentional 403 policy messages. |
| **BUG-6** setState-in-render | ✅ Fixed | `StepFeatures.toggle` + `StepBrandVibe.toggleTone` now compute the next value and call both setters from the event handler instead of inside the `setState` updater. React error gone in both (verified — console clean on toggle). |
| **BUG-2** self-serve checkout 400 | ◑ Partially fixed | Seeded the 13 module/bundle `services` rows **with their real Stripe price IDs** (`scripts/seed-domain-modules.ts` → local `simplerdev_test`). The module/bundle checkout path is now data-complete and will work the moment a Stripe key is present. **Two gaps remain, both out of code scope:** (1) `STRIPE_SECRET_KEY` is unset in dev → any checkout still returns "Stripe not configured" until test keys are added; (2) the **headline tier cards** (`plan-starter/growth/scale`) have **no `stripePriceId` in the catalog and no tier→SKU mapping** — they were never wired to Stripe. Wiring them is a **product decision** (create tier Stripe products, or map tiers→modules), deliberately not guessed at here. |

### UX pass (second round)

| Item | Status | Fix |
|---|---|---|
| Free-vs-paid copy contradiction | ✅ Fixed | Features-step subtitle changed from "Pick the tools you want to try. (You unlock them all anyway.)" → "Pick what you want to explore first — we'll tailor your setup around it." (`OnboardingWizard.tsx`). Verified live (`30-features-newcopy.png`). |
| Done-screen grammar | ✅ Fixed | "Want to start with build a website?" → "First stop: Build a website." (proper casing, reads naturally for all feature labels — `StepDone.tsx`). Verified (`31-done-newcopy.png`). |
| Signup value prop | ✅ Fixed | "Get started — it only takes a minute." → "Websites, CRM, and AI in one place — free to start, no card required." (accurate: signup is free, card only at checkout — `signup/page.tsx`). Verified (`29-signup-valueprop.png`). |
| Mobile "Most popular" badge clip | ✅ Fixed | Added `pt-3` to the `TierPlans` grid so the overhanging badge always has clearance. |
| **BUG-7** "Open →" abandons wizard | ⓘ Was wrong | The module-setup links **already** use `target="_blank" rel="noopener noreferrer"` — they open in a new tab and don't abandon the wizard. My original finding was incorrect; no change needed. The "shows tools you didn't buy" half is mild (step is opt-in/skippable) — left as-is to avoid risky entitlement gating. |
| **BUG-9** Google button missing | ⓘ Not a bug | The Google OAuth button is intentionally gated on `isGoogleAuthEnabled` (renders only when the provider is configured). Correct behavior; no change. |
| Progress-bar stall in module-setup | ⏸ Deferred | Advancing the macro bar across the 5 module sub-screens requires lifting sub-step state into the wizard's progress math — a deeper change for marginal benefit (the "Module X of 5" sub-label already shows position). Left for a focused follow-up. |

### Issues discovered during the fix work — now fixed (third round)

| Issue | Status | Fix |
|---|---|---|
| **Duplicate sidebar nav entry (medium, prod-relevant)** | ✅ Fixed | The sidebar injected service nav items without deduping against the base nav, so "Pitches & Proposals" rendered twice (both → `/portal/tools/pitch-decks`) → React duplicate-key error. `PortalSidebar.tsx` now filters injected services against a `seenHrefs` set (base nav + already-injected). Verified: "Pitches & Proposals" appears once, all 10 other services remain, console clean. |
| **dnd-kit hydration mismatch (low)** | ✅ Fixed | Added a stable `id="dashboard-widget-board"` to the dashboard `WidgetBoard`'s `DndContext` so dnd-kit stops auto-generating non-deterministic `aria-describedby` ids. Dashboard console now **0 errors / 0 warnings**. |
| **BUG-8** signup password native-only validation | ✅ Fixed | The "Minimum 8 characters" hint now turns into a live red **"Password must be at least 8 characters (N/8)."** as soon as a too-short password is typed (`signup/page.tsx`). Verified (`33-signup-password-validation.png`). |

### BUG-2 status update — tier→Stripe decision MADE + implemented

Now that the duplicate-nav bug is fixed, seeding the catalog is safe — so I **re-seeded the 13 module/bundle services (with their real catalog Stripe price IDs) and kept them**. The module/bundle checkout path is data-complete.

**The tier-card product decision is now made.** Reading the billing internals showed the platform is **already tier-aware end-to-end** — `getClientEntitlements` (entitlements.ts:81–86) grants a whole tier's domain set + BYOK from a single `clientServices` row whose `services.category` equals the tier slug, and the Stripe webhook (webhook/route.ts:296–356) upserts that row generically for any `serviceId`. So the architecture had already chosen the model; the tier cards were just never finished.

**Decision:** each tier (Starter/Growth/Scale) = **its own Stripe Product + one monthly recurring Price**, represented as a `services` row with `slug = category = plan-{key}`. Checkout makes a single-line-item subscription; entitlements grant the tier's curated domains. (Tiers can't reuse module prices — their advertised $19/$59/$119 are discounted bundles that don't equal the sum of their modules.)

**Implemented this session:**
- `scripts/create-tier-stripe-products.ts` — creates (or reuses, via `lookup_key`) the 3 Stripe products + monthly prices; refuses live keys; prints the price IDs to paste into `TIERS` in `domain-catalog.ts`.
- `scripts/seed-tiers.ts` — seeds the `plan-*` services from the catalog (`category = slug`), backfilling `stripePriceId` once present. (Ran it: the 3 tier services exist in dev.)
- `app/api/portal/services/nav/route.ts` — excludes `plan-*` categories so seeded tiers don't render as à-la-carte "request a service" nav rows.

**Verified end-to-end (the part that needs no Stripe):** inserting a simulated `plan-growth` subscription unlocked **exactly Growth's 8 domains** in the live sidebar (Websites/CRM/Projects/Brain/Email/Surveys + Automations/Bookings) while Publishing and Pitches & Proposals (not in Growth) stayed locked; dashboard showed "Your Services: Growth — Active". Then reverted.

**Operator runbook to go live (the only steps that need credentials):**
1. Set `STRIPE_SECRET_KEY` (test) in the env.
2. `tsx scripts/create-tier-stripe-products.ts` → paste the 3 product/price IDs into the `TIERS` entries in `lib/billing/domain-catalog.ts`.
3. `tsx scripts/seed-tiers.ts` (backfills the price IDs onto the `plan-*` service rows).
4. Tier checkout then works through the existing checkout route + webhook + entitlements — no further code changes.

**Still open (lowest severity, not yet addressed):** BUG-10 (upsell silently auto-skips when its `/billing/modules` call fails — graceful but loses a monetization surface), and the onboarding-chrome recommendation (the wizard renders inside the full locked portal shell rather than a focused layout).

**Schema-drift caveat:** the dev DB (`simplerdev_test`) was healed surgically for the columns/table the onboarding→dashboard path hit. Broader drift may exist elsewhere — a clean `bun run db:migrate` rebuild (NOT `drizzle-kit push --force`, which silently drops the `brain_embeddings` HNSW index per `lib/db/CLAUDE.md`) is the proper long-term sync.

**Gates run:** `tsc --noEmit` (0 errors), `eslint` on all 5 changed files (clean), live browser re-verification of each fix. The dashboard edit is read-only (added try/catch wrappers around existing queries; **no tenant filter changed**), so tenancy posture is unchanged — the full `bun test:tenancy` suite was not run for this resilience-only change.

## Coverage notes
- Could not exercise a *successful* paid checkout (Stripe not seeded in this env) — verified the failure paths instead.
- The upsell step (10) never rendered (auto-skipped due to BUG-3); its content is unverified.
- Findings on BUG-1/2/3 are environment-rooted (schema/seed); whether production is affected depends on whether prod migrations are fully applied — **this should be verified before any go-to-market claim of "self-serve onboarding works end-to-end."**
