# SimplerDevelopment 2026 — GTM Readiness Synthesis
**Audit scope:** 19 solution domains + cross-cutting concerns. **Goal lens:** a self-serve stranger pays and succeeds in hour one, portal first. **Bottom line: NOT READY.** The buy path itself (marketing → pricing → signup → checkout) is broken end-to-end, the portal's navigation hides half the product, and ~30 marketing claims are demonstrably false in code. All 19 domains report `partial`. Total: **31 blockers, 67 majors.**

---

## 1. Readiness Matrix

| Domain | Status | One-line verdict | Blockers | Majors |
|---|---|---|---|---|
| marketing-site | partial | Polished, but every CTA routes to "Book a Consultation" — zero path to the signup flow that exists | 3 | 3 |
| signup-onboarding | partial | Email signup works; Google OAuth dead, Stripe prices unseeded, expired-token dead-end strands users | 3 | 4 |
| billing-entitlements | partial | Checkout works once; failed payments never suspend, overage billing is a dead code path, gating is nav-only | 3 | 6 |
| portal-shell | partial | Coherent features behind an overlay-only sidebar that omits 8 reachable pages; entitlement errors fail open | 3 | 5 |
| auth-tenancy | partial | Architecturally solid; GitHub OAuth CSRF + plaintext tokens + unthrottled password-reset are real findings | 0 | 3 |
| contracts | partial | Working backend & signer page with literally no portal UI to create, list, or find a contract | 3 | 5 |
| invoicing | partial | Admin-creates → client-pays loop works; "sent" sends no email, hidden from the marketing site by design | 2 | 5 |
| booking | partial | Best-built domain; the entire monetization layer (price/waivers/gift certs) has no settings UI | 1 | 4 |
| surveys | partial | Genuinely shippable core; "drag-and-build" is false and CRM auto-route creates orphaned deals | 0 | 4 |
| experiments | partial | Page A/B engine is real; deck A/B silently does nothing and variants require hand-written JSON | 0 | 2 |
| project-management | partial | Closest to ready — golden path solid; time-logging blocked for the clients who'd pay for it | 0 | 1 |
| help-desk | partial | CRUD spine works; unreachable from nav, "real-time LISTEN/NOTIFY" claim is false, clients never notified of replies | 3 | 4 |
| company-brain | partial | Deep and real; the headline Google Workspace auto-capture claim requires manual platform-admin provisioning | 1 | 3 |
| ai-chatbot | partial | A good live-chat product falsely sold as AI, with no nav entry and no way to create a widget | 3 | 3 |
| automations | partial | Rule engine real for ~10 events; ~12 catalogued triggers never fire, presets file support tickets instead of sending emails, visual workflows are a demo | 2 | 5 |
| pitch-decks | partial | Strong AI generation flow; advertised PDF export does not exist, entitlement gate skipped on mutations | 1 | 1 |
| agency | partial | Domain verification + white-label work; primary color is a dead setting, no tier gate, no self-serve sub-clients | 0 | 4 |
| hosting | partial | Read-only dashboard over a fully manual staff process sold as automatic | 1 | 2 |
| dev-workflow | partial | 389 failing unit tests, typecheck OOMs as documented, coverage floors set to 0 — the launch gate itself is red | 2 | 3 |

---

## 2. Top 15 Launch Blockers
Ranked by (customer impact in first hour) × (claim falseness). Items 1–4 break the funnel before the product is even touched.

1. **The marketing site cannot sell the product.** Pricing page shows agency tiers (Launch/Grow/Scale/Enterprise) at "Custom" with "Book a Consultation" CTAs; the shipped Starter $19 / Growth $59 / Scale $119 tiers with live Stripe products are invisible. Zero `/portal/signup` links anywhere — nav, hero, solutions, pricing all route to `/contact`. Three auditors independently flagged this.
   *Files:* `app/(pages)/pricing/page.tsx`, `components/ui/Navigation.tsx`, `app/(pages)/HomeClient.tsx`, `lib/billing/domain-catalog.ts`. *Fix:* rewrite pricing page to import `TIERS` from the domain catalog with real prices and `href='/portal/signup?plan=<slug>'`; add "Get Started" to nav.

2. **Stripe Price IDs not seeded per environment — every module checkout returns 400** ("Not available for self-serve checkout yet"). A paying stranger literally cannot pay.
   *Files:* `app/api/portal/billing/modules/checkout/route.ts`, `scripts/billing/sync-stripe-products.ts`. *Fix:* run the sync script against staging + production; add a startup/healthcheck assertion that purchasable services have `stripePriceId`.

3. **"Continue with Google" is a dead button.** `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` absent → provider silently unregistered, but the button always renders and fails at runtime.
   *Files:* `lib/auth.ts`, `app/portal/signup/page.tsx`. *Fix:* set env vars + OAuth callback in Vercel (ops, zero code); hide the button when the provider is unregistered as a guard.

4. **Verification dead-end strands real signups.** Expired 24h token → "sign up again" → "email already exists" → stuck up to 7 days until the purge cron. No resend endpoint exists.
   *Files:* `app/api/auth/verify-email/route.ts`, `lib/signup/service.ts`. *Fix:* add `POST /api/auth/resend-verification` reissuing the token for unverified users; add an in-portal "verify your email" banner.

5. **The portal sidebar hides half the product.** No nav entries for Tickets, Invoices, Inbox, Contracts, Services, Hosting, Standup, Snapshots — four separate auditors hit this independently. The sidebar is also an overlay-only drawer with no persistent desktop rail; every navigation requires a hamburger.
   *Files:* `lib/portal-nav.ts`, `components/portal/PortalSidebar.tsx`, `app/portal/PortalLayoutClient.tsx`. *Fix:* add the missing entries today (small); convert to persistent rail (medium rewrite, see §3).

6. **Entitlement gating fails open.** Any DB/plugin error in `PortalShell.tsx` sets `gatingBypassed: true`, granting full access to everything; and gating is nav/layout-only anyway — CRM/Surveys/Projects/Websites APIs have zero entitlement enforcement, so a direct URL bypasses paywalls.
   *Files:* `app/portal/PortalShell.tsx`, `app/portal/crm/layout.tsx`, `lib/billing/entitlements.ts`. *Fix:* fail closed in the catch block (one line, today); roll `requireService` checks across API route trees (larger).

7. **Failed payments never suspend access — permanent revenue leak.** Webhook handles neither `invoice.payment_failed` nor `customer.subscription.updated`; a declined trial-end card leaves `clientServices` active forever. Compounding: `metered_subscription_items` are never provisioned at checkout, so overage billing is a silent no-op for every self-serve subscriber, and PAYG negative balances accumulate with no collection path.
   *Files:* `app/api/stripe/webhook/route.ts`, `lib/billing/usage-rollup.ts`, `lib/ai-credits.ts`. *Fix:* add `payment_failed` + `subscription.updated` handlers (suspend on past_due/unpaid); auto-provision metered items in the checkout branch.

8. **"AI Chatbot" contains no AI, no nav entry, and no create-widget UI.** `brainEnabled` is hardcoded `false`; onboarding promises "chatbot trained on your content"; the inbox is URL-only; the empty state tells you to embed a widget you cannot create. Triple-broken activation for a falsely-named product.
   *Files:* `lib/data/solutions.ts`, `lib/onboarding/types.ts`, `app/portal/inbox/page.tsx`, `lib/portal-nav.ts`. *Fix:* rename to "Live Chat" (copy, today), add nav entry + Create-widget button (API already exists).

9. **Automations silently don't run.** ~12 catalogued trigger events (subscriber added, invoice paid, form submitted, booking confirmed/cancelled, task.*, ticket replied…) are never emitted; all five email presets create *support tickets* instead of sending emails; activating a visual workflow does nothing (trigger shim, conditions always `true`); delays use `setTimeout` that Vercel kills. A first-hour user's rule will look configured and never fire.
   *Files:* `lib/automation/event-bus.ts`, `lib/automation/product-presets.ts`, `lib/workflows/trigger.ts`, `lib/automation/engine.ts`. *Fix:* emit the top 3 events (subscriber.added, booking.confirmed/cancelled), replace preset stubs with real actions, label visual workflows beta, move delays to the cron.

10. **Contracts are invisible.** Full backend + polished public signer page, but no list page, no Create UI, no nav entry — the feature is API-only. Plus `DROPBOX_SIGN_CLIENT_ID` silently empty-strings, breaking embedded signing.
    *Files:* `lib/portal-nav.ts`, `app/portal/crm/contracts/[id]/page.tsx`, `lib/esign/dropbox-sign.ts`. *Fix:* build `/portal/crm/contracts` list+create page, add nav entry, validate the env var at startup.

11. **Help desk: clients are never told staff replied, and the "real-time LISTEN/NOTIFY inbox" claim is false** (LISTEN/NOTIFY powers the chat widget, tickets use `router.refresh()`). Also unreachable from nav.
    *Files:* `app/api/portal/tickets/[id]/messages/route.ts`, `lib/data/solutions.ts`, `lib/portal-nav.ts`. *Fix:* Resend email on non-internal staff reply (existing infra), nav entry, correct the claim.

12. **Booking monetization is unreachable.** "Waivers, deposits & gift certificates" are marketed; schema + API support them; the Settings panel exposes none of it — a paying customer cannot charge for bookings. Plus new pages sit `inactive` pending an unexplained admin approval, so the shared link 404s with no guidance.
    *Files:* `app/portal/tools/booking/[id]/_components/SettingsPanel.tsx`, `app/portal/tools/booking/page.tsx`. *Fix:* add a monetization card to SettingsPanel (fields + PUT handler already exist); explain the approval gate inline.

13. **Company Brain's "connect Google Workspace and capture meetings/emails automatically" is false for every self-serve signup** — requires a platform admin to hand-insert `google_workspace_tenant_credentials` (GCP project, OAuth secret, Pub/Sub topic). Calendar sync is shipped with a visible "coming in Phase C" banner.
    *Files:* `lib/google/tenant-credentials.ts`, `app/portal/settings/integrations/page.tsx`. *Fix:* short term, soften the claim and the connect button; long term, shared-app OAuth flow.

14. **Hosting's "DNS goes live automatically" is false and the customer path is a support ticket.** No polling cron exists — verification is a manual admin endpoint; provisioning is hand-typed Railway IDs. A buyer waits in "provisioning" indefinitely.
    *Files:* `app/api/admin/portal/hosting/[id]/verify-dns/route.ts`, `app/portal/hosting/page.tsx`, `lib/data/solutions.ts`. *Fix:* 15-min cron calling the existing verify logic; fix the claim copy meanwhile.

15. **Every social share is broken and search snippets sell the old agency.** `og.jpg` doesn't exist in `/public`; `config/site.ts` description is "Design, Dev, and Automation Agency" with n8n/Three.js keywords; About page says "8+ tools" vs 18/19 elsewhere; pitch-decks dashboard advertises a nonexistent "PDF export."
    *Files:* `config/site.ts`, `public/`, `app/(pages)/about/page.tsx`, `app/portal/dashboard/page.tsx`. *Fix:* ship a 1200×630 og.jpg, rewrite siteConfig copy, fix the stat, delete the PDF-export string.

**Launch-process meta-blocker:** the dev gate itself is red — 389 failing unit tests across 26 files and `bun run typecheck` OOMs on the default heap, so none of the above can be shipped through the documented pipeline until fixed (`tests/unit/hooks-use-*`, `package.json` typecheck script).

---

## 3. Rewrite List
Components needing genuine rewrites, deduplicated (flagged-by count in parens):

1. **Public pricing page** `app/(pages)/pricing/page.tsx` (×3: marketing, billing, signup) — entire tier structure is hardcoded and wrong (names, prices, count, CTAs). Rewrite against `TIERS` from `lib/billing/domain-catalog.ts`.
2. **Platform Stripe webhook** `app/api/stripe/webhook/route.ts` (×2: billing, signup) — handles 3 event types; needs `payment_failed`, `subscription.updated`, `trial_will_end`, and metered-item auto-provisioning. Currently a structural revenue leak.
3. **Portal navigation shell** `PortalLayoutClient.tsx` + `PortalSidebar.tsx` + `lib/portal-nav.ts` (×4 implicated) — convert overlay drawer to persistent desktop rail with content margin; add Support & Billing group (Tickets/Invoices/Inbox) and Contracts/Hosting entries.
4. **Contract PDF renderer** `lib/esign/contract-pdf.ts` — self-documented stub: unbranded plain text with a cents-treated-as-dollars pricing bug. Mirror the `/contract/[token]` themed view.
5. **Portal contract management UI** `app/portal/crm/contracts/` — detail page only exposes the DropboxSign single-signer path; needs list page, create flow, native multi-signer send, signer management.
6. **Automation presets + delay engine** `lib/automation/product-presets.ts`, `lib/automation/engine.ts` — all five presets stub real actions with `create_support_ticket`; `setTimeout` delays must become cron-scheduled deferred actions.
7. **Experiments variant editor** `components/portal/ExperimentDetailClient.tsx` — raw JSON textarea makes the feature unusable for non-technical buyers; needs a visual/seeded editor.
8. **Booking SettingsPanel monetization + Waivers tab** `app/portal/tools/booking/[id]/_components/` — schema and API complete, UI absent; required to make three marketing claims true.
9. **Sequential ID generation (shared pattern)** — `count()+1` races in invoice numbers (`app/api/admin/portal/invoices/route.ts`) and ticket numbers (`app/api/portal/tickets/route.ts`); replace with DB sequences or constraint+retry.
10. **Stripe self-serve billing surface** — no Customer Portal session route, payment-method DELETE skips Stripe detach, no monthly credit re-grant cron. `app/portal/settings/billing/`, `lib/ai-credits.ts`.
11. **Auth hardening trio** (auth-tenancy) — GitHub OAuth state validation + token encryption (`app/api/portal/github/*`, `lib/db/schema/auth.ts`) and a shared `lib/security/rate-limit.ts` applied to forgot/reset/change-password.
12. **Config & SEO baseline** — `config/site.ts` (stale agency copy, broken ogImage) and `.env.example` (4 of ~50 vars documented); both are the documented source of truth and both lie.
13. **`SITE_CONTACT_OVERRIDES`** in `app/sites/[domain]/layout.tsx` — hardcoded client PII in git; move to `site_branding` columns.
14. **Agency branding completion** — apply `agencyPrimaryColor` as a CSS variable (currently a dead setting) and replace URL-only logo input with media-library upload.

---

## 4. Quick-Win List
High-leverage small fixes, deduplicated and grouped:

**Navigation & discoverability (one file, huge payoff)**
- Add `lib/portal-nav.ts` entries: Tickets, Invoices, Inbox, Contracts (+Hosting/Services). Single edit clears blockers from 4 auditors.
- Hamburger button `absolute` → `fixed` so it survives scroll.
- "Create widget" button on `/portal/inbox` empty state (API exists).
- Add "Get Started" → `/portal/signup` to the marketing nav.

**One-line security/tenancy/integrity fixes**
- `PortalShell.tsx` catch block: `gatingBypassed: false` (fail closed).
- Booking calendar route: add `bookingPageId IN (pageIds)` filter — closes a cross-tenant leak.
- `requireService` guards: hosting detail route, surveys SSR list page, booking `bookings` sub-route, pitch-decks per-deck mutation routes (copy existing pattern).
- `filterUserIdsVisibleToClient`: add `WHERE active = true`.
- Brain search route: expand 4-type whitelist to all 8 — CRM search instantly works.
- Wire `applyAbToDeckSlides` into both public deck renderers (~5 lines each) — deck A/B stops being a silent no-op.
- `revalidateTag(CUSTOM_DOMAIN_TAG)` drop invalid second arg.
- Tenancy join on time-log DELETE.

**Ops / config (zero or near-zero code)**
- Run `scripts/billing/sync-stripe-products.ts` on staging + prod.
- Set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` + callback URL in Vercel.
- Add `DROPBOX_SIGN_CLIENT_ID` (+ validation), `CHAT_TOKEN_SECRET`, `OPENAI_REALTIME_*` to `.env.example`.
- Create `public/og.jpg` (1200×630); fix `config/site.ts` description/keywords.
- Commit untracked `scripts/seed-dev.ts` (already wired into `package.json`).
- `package.json` typecheck → `node --max-old-space-size=6144 node_modules/.bin/tsc --noEmit`.

**Honest-copy edits (until features ship)**
- "AI Chatbot" → "Live Chat" badge/title; drop "trained on your content" tooltip.
- "Drag-and-build" → "Visual form builder."
- "Auto-promote after DNS resolves" → "Admin-verified DNS with one-click promotion."
- Remove "PDF export" from both dashboard strings.
- About page "8+" → "19"; reconcile "eighteen tools" hero copy.
- CFD empty state: drop the cron instruction; "Microsoft Teams not enabled on this deploy" → "Contact support."

**Small functional wins**
- Email on staff ticket reply + email on invoice "sent" (Resend infra exists).
- `POST /api/auth/resend-verification` + in-portal verify banner.
- Daily overdue-invoice cron (one UPDATE statement).
- Wire existing services checkout route to a "Buy Now" button.
- `emitEvent` for `email.subscriber.added`, `booking.confirmed/cancelled`; add `fire_webhook` portal tool (copy from workflow runtime).
- `invoice.payment_failed` handler (~50 lines) + `stripe.paymentMethods.detach()` on delete.
- Render `ticket_messages.attachments`; fix `waiting` → `waiting_on_customer` filter.
- Add `file` type to portal `QuestionTypePicker`; upsert a CRM contact alongside the SCORE-02 deal.
- Tax field accepts dollars; timezone text inputs → `Intl.supportedValuesOf('timeZone')` select.
- Contract PDF cents fix (`/100` before `.toFixed(2)`); `.unique()` on `pitch_decks.slug`.
- GitHub OAuth state nonce (15–20 lines).
- Test-suite triage: schema-parity snapshot update, Anthropic mock `usage` field, `RESEND_API_KEY` stubEnv, MCP 401 assertion.
- 30s auto-refresh on running experiment results.

---

## 5. False-Advertising List
Every claim auditors marked false, with the page making it:

| Claim | Where made | Reality |
|---|---|---|
| "Branded proposal & contract builder" | /solutions (contracts), `lib/data/solutions.ts` | No create/list UI or nav entry exists |
| "Real-time view & signature tracking" | /solutions (contracts) | No list, no status columns, no refresh |
| "Send It Over — share a secure link" | /solutions/invoicing (hidden) | No email is ever sent on "sent" |
| "Generate an invoice from a won deal" | /solutions/invoicing | No deal→invoice path exists anywhere |
| "Status tracking: …overdue" | /solutions/invoicing | Overdue is never set automatically |
| "In-portal services catalog clients can purchase" | /solutions/invoicing | Checkout route exists, no UI button |
| "Waivers, deposits & gift certificates" | /solutions (booking) | Zero settings UI for any of it |
| "Drag-and-build form & survey editor" | /solutions (surveys) | Arrow-button reordering; no DnD anywhere |
| "16 field types" (portal builder) | /solutions (surveys) | Portal picker has 15; `file` missing |
| "Auto-route responses to your CRM" | /solutions (surveys) | Creates contact-less orphaned deals |
| Split-test pitch decks | experiments surface | `applyAbToDeckSlides` never called on public renders |
| "Real-time team inbox powered by Postgres LISTEN/NOTIFY" | /solutions (help-desk) | That's the chat widget; tickets use `router.refresh()` |
| "Close & Report — review response times in your dashboard" | /solutions (help-desk) | No reporting page exists |
| "Connect Google Workspace… capture meetings and emails automatically" | /solutions (company-brain) | Requires manual platform-admin credential provisioning |
| Google Calendar sync | brain settings/calendar UI | Labeled "Phase C / coming in follow-up phases" |
| "AI Chatbot" badge/slug/icon | /solutions/ai-chatbot, `lib/data/solutions.ts` | Human live chat; `brainEnabled` hardcoded false |
| "Site chatbot trained on your content" | onboarding tooltip, `lib/onboarding/types.ts` | Not implemented |
| "Rule engine wired to email & orders" | /solutions (automations) | subscriber.*, order.placed/shipped never emitted |
| "Triggers: form submitted" | /solutions (automations) | `form.submitted` never fires |
| "Actions: …fire webhook" | /solutions (automations) | Only in demo-grade visual runtime, not the rule engine |
| "Actions: create task" | /solutions (automations) | No `create_task` tool; would error |
| "Cross-tool presets (booking→deal, survey→deal)" | /solutions (automations) | Only email presets exist — which file support tickets |
| Booking triggers confirmed/cancelled/rescheduled | /solutions (automations) | Never emitted |
| "PDF export" | portal dashboard (`app/portal/dashboard/page.tsx:28`) + dashboard API | No PDF code exists |
| "Auto-promote to active after DNS resolves" / "DNS goes live automatically" | /solutions (hosting) | Manual admin endpoint; no cron |
| "Admins provision and manage from one panel" | /solutions (hosting) | Hand-typed Railway IDs; no API provisioning |
| White-label "Scale tier only" | agency branding UI | No tier check in the API — any tier can enable |
| "Eighteen connected tools" | home hero, solutions SEO | 19 exist; About page says "8+" |
| Tier names/prices ("Custom", Launch/Grow/Scale/Enterprise) | /pricing | Shipped reality is Starter/Growth/Scale at $19/$59/$119 |
| "Design, Dev, and Automation Agency" | `config/site.ts` fallback meta everywhere | Old positioning |
| og.jpg social image | `config/site.ts` → all pages | File doesn't exist |
| "Prisma" in tech stack | /apps-and-products | Project uses Drizzle |

---

## 6. Themes — Recurring Systemic Problems

1. **The funnel contradicts the GTM motion.** Marketing site, pricing page, and SEO config all still sell the agency; the self-serve machinery (tiers, checkout, signup) is built and invisible. Two parallel pricing realities exist in the same repo.
2. **Built features are undiscoverable — nav is the #1 product bug.** Tickets, Invoices, Inbox, Contracts, Hosting, Standup, Snapshots have no sidebar entry; the sidebar itself is an overlay drawer. Multiple "blockers" across domains are actually one `lib/portal-nav.ts` problem.
3. **Module gating is nav-only and fails open.** Entitlement checks live in the sidebar and a few layouts; CRM/Surveys/Projects/Websites/esign/pitch-deck-mutation APIs are unguarded, and the error fallback grants everything. Paywalls are decorative.
4. **The last-mile UI gap.** Repeated pattern: schema + API complete, UI absent — booking monetization/waivers, contract templates & native send, ticket attachments, services checkout, agency primary color. The cheapest wins in the codebase are surfacing things that already work.
5. **Marketing claims are written against the schema, not the shipped UX.** `lib/data/solutions.ts` is the single source of ~30 false claims; it needs an audit gate of its own ("claim must cite a reachable portal route").
6. **Silent no-ops everywhere.** Deck A/B never applied, 12 automation triggers never emitted, workflow activation does nothing, conditions always true, preset actions stubbed, dead color setting, no-op topicId filter. Worse than errors: users configure things that look alive and never run.
7. **Serverless-hostile in-memory state.** `setTimeout` delays, in-memory rate limiters (chat, signup), dedup `Set`s — all die or fragment on Vercel. Needs a Redis/cron-backed pattern decision once, applied everywhere.
8. **Count-based ID generation races.** Invoices, tickets, survey maxResponses, deck slugs — same footgun in four places; standardize on sequences/constraints.
9. **Stripe lifecycle is half-wired.** Activation works; failure, suspension, metering, detach, customer portal, and credit re-grants don't. The system can take money but can't stop service or bill overage.
10. **Config/env is undocumented and unseeded.** `.env.example` covers 4 of ~50 vars; Stripe prices, Google OAuth, DropboxSign client ID, chat token secret all silently absent → silent feature death rather than startup errors.
11. **Developer guts leak into customer UI.** Cron instructions, env-var messages, "Phase C" banners, `window.prompt()`/`confirm()`, raw JSON textareas, "delivery log not yet recorded" TODOs.
12. **The quality gate is fiction right now.** 389 red unit tests, typecheck OOM, coverage thresholds 0 vs documented 60/70/90 floors, no server-side CI, stale TESTING_PLAN. Fixing the product requires first fixing the pipeline that ships it.

**Recommended sequencing:** (1) repair the buy path — pricing page, signup CTAs, Stripe price seed, Google OAuth, resend-verification; (2) one nav PR + fail-closed gating; (3) honest-copy sweep of `solutions.ts` and dashboards; (4) Stripe webhook rewrite; (5) green the test suite; then domain-by-domain last-mile UI in order of matrix blocker count.