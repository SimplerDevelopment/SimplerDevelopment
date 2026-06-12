---
type: spec
domain: go-to-market
status: in-review
date: 2026-06-12
sources:
  - lib/data/solutions.ts
  - app/(pages)/solutions/page.tsx
  - lib/billing/domain-catalog.ts
  - lib/billing/entitlements.ts
  - lib/onboarding/demo-seed.ts
---

# PRD — SimplerDevelopment Market-Ready Makeover

> **Product Requirements Document** for taking SimplerDevelopment.com and all 19 sold solution domains to ready-to-market status, portal-first. Derived from [[Go-To-Market — Self-Serve SaaS]] (locked strategy) + the 2026-06-12 25-agent inventory audit (`feat/market-ready-makeover`).
> Companion architecture doc: [[Market-Ready Product — ARD]].

## 1. Problem & objective

SimplerDevelopment sells **19 integrated tools** on `/solutions` (ai-connect, websites, ecommerce, publishing, email-marketing, crm, contracts, invoicing, booking, surveys, experiments, project-management, help-desk, company-brain, ai-chatbot, automations, pitch-decks, agency, hosting). The platform is ~357k LOC and mostly built, but it grew as an agency tool: quality is uneven across domains, some marketing claims outrun the product, and the self-serve first hour has rough edges.

**Objective:** every domain sold on `/solutions` must be *credible and usable by a cold self-serve customer in their first hour* — or be re-scoped/re-labeled until it is. No false claims, no dead ends, one coherent portal.

**Definition of done (release bar):**
1. Every `/solutions` claim is true in the product (verified per-domain), or the claim is rewritten.
2. A stranger can sign up → pay → activate → use each purchased module without human help.
3. `tsc --noEmit`, `bun run lint`, unit suite, `bun test:tenancy`, and `bun test:critical` are green.
4. The portal feels like one product: consistent navigation, empty states, loading/error states, and module gating in `saas` mode.

## 2. Users & ICP (locked)

Pro-services teams of 5–50 (agencies, consultancies, advisory/accounting). Personas:
- **Self-serve owner** (primary): signs up with a card, expects SaaS polish, hour-one value.
- **Team member seat**: invited, lands in an already-configured workspace.
- **Agency operator** (Scale): white-label, manages sub-clients.

## 3. Strategy constraints (locked — do not relitigate)

- Positioning: AI-native ops, the in-app agentic chat is the wedge.
- Pricing: 3 per-seat tiers (Starter/Growth/Scale), AI-metered axis, BYOK = Scale-only unlock. À-la-carte modules survive underneath, not on the public pricing page.
- Trial: both/and — 14-day card trial AND cardless free-credit grant.
- Activation: demo-seeded workspace → agent-led "set up YOUR business".
- Sequencing: Phase 0 beachhead → Phase 1 private beta → Phase 2 public launch.

## 4. Domain readiness requirements (from the 2026-06-12 audit)

Full data: [[Market-Ready Audit — Synthesis 2026-06-12]] (readiness matrix, top-15 blockers, rewrite list, quick wins, false-claims table). Verdict at audit time: **NOT READY — 31 blockers, 67 majors, all 19 domains `partial`.**

Per-domain requirement (uniform): every blocker closed, every false claim made true or rewritten, domain reachable from portal nav, golden path usable by a stranger in hour one. Highest-leverage domain asks:

- **contracts** — build the missing portal UI (list + create + nav); validate `DROPBOX_SIGN_CLIENT_ID`.
- **help-desk** — nav entry; email the client on staff reply; correct the LISTEN/NOTIFY claim.
- **ai-chatbot** — rename to Live Chat (no AI shipped); nav entry; create-widget button.
- **automations** — emit the missing trigger events (top 3 first); replace ticket-stub preset actions with real ones; label visual workflows beta; cron-backed delays.
- **booking** — monetization settings card (waivers/deposits/gift certs — API exists); explain the approval gate.
- **invoicing** — send email on "sent"; overdue cron; surface the services-checkout buy button.
- **experiments** — wire `applyAbToDeckSlides` into public deck renders; visual variant editor (rewrite).
- **pitch-decks** — remove "PDF export" claim; entitlement-guard mutation routes.
- **company-brain** — soften the Google Workspace auto-capture claim until shared-app OAuth ships; widen Brain search whitelist to all 8 types.
- **hosting** — DNS-verify cron over the existing logic; honest copy meanwhile.
- **agency** — apply `agencyPrimaryColor` (dead setting); tier-gate white-label in the API.
- **surveys / project-management / experiments** — minor: honest copy + small last-mile fixes (file field type, CRM auto-route contact upsert, time-log tenancy join).

## 5. Cross-cutting requirements (from the audit)

1. **Buy path works end-to-end** (P0): pricing page rebuilt from `TIERS` (`lib/billing/domain-catalog.ts:466`) with real prices + `/portal/signup` CTAs; "Get Started" in marketing nav; resend-verification endpoint + banner; Google button hidden when provider unregistered; Stripe price seeding is ops (run sync script on staging/prod) + a healthcheck assertion.
2. **Portal shell** (P0): all reachable pages in `lib/portal-nav.ts`; persistent desktop nav rail (rewrite); entitlement gating fails CLOSED; `requireService` enforced at the API layer, not just nav.
3. **Stripe lifecycle complete** (P0): `invoice.payment_failed` (grace + notify, no hard cutoff), `customer.subscription.updated`, `trial_will_end`; metered-item auto-provision at checkout; real payment-method detach; Customer Portal session route.
4. **Security hardening** (P0/P1): GitHub OAuth state nonce; shared rate-limit util on auth endpoints; tenancy one-liners (booking calendar filter, time-log DELETE join, active-user filter); move hardcoded client PII out of `app/sites/[domain]/layout.tsx`.
5. **Honest marketing** (P0): `lib/data/solutions.ts` claims reconciled (~30 false); `config/site.ts` rewritten off agency positioning; `og.jpg` shipped; About/hero tool-count consistency.
6. **Green pipeline** (P0, gates everything): typecheck OOM fixed; 389 failing unit tests triaged to green; coverage floors restored.
7. **No silent no-ops** (P1): every configurable thing either works or is labeled beta/coming-soon; serverless-hostile in-memory state (setTimeout delays, in-memory rate limiters) moved to cron/DB-backed patterns.

## 6. Out of scope (this makeover)

- Net-new domains not sold on `/solutions`.
- Phase 2 viral mechanics (referral credits, template gallery) unless trivially unblocked.
- Live-mode Stripe runs against prod (env work, not code).
- Mobile native apps.

## 7. Success metrics

Inherited from [[Go-To-Market — Self-Serve SaaS]]: activation ≥40%, time-to-aha <10min, 0 manual interventions per signup, 0 bill-shock complaints, tenancy suite green.

## 7b. Open decisions for Dan (escalated 2026-06-12)

1. **Metered-overage billing**: auto-provisioning `metered_subscription_items` needs per-meter Stripe price IDs that exist nowhere — add a `stripeOveragePriceIds` JSON column on `services` or a hardcoded catalog map, then a LIVE-mode sync run. Until decided, overage accrues but never bills.
2. **Email sender defaults**: persisting From/Reply-To needs a storage decision (no suitable metadata column found); the settings form is still local-state-only.
3. **Ops (zero code, blocks go-live)**: run `sync-stripe-products.ts` LIVE on staging/prod; set `AUTH_GOOGLE_ID/SECRET` + callback in Vercel; set `DROPBOX_SIGN_CLIENT_ID`.
4. **Still red**: 6 pre-existing `oauth_clients`/google-integration tenancy test failures (untouched tonight — needs its own focused session); signup rate-limiting/bot protection beyond the resend endpoint.
5. **SCHEMA DRIFT (P0, found 2026-06-12 evening)**: `clients.billing_mode` is defined in `lib/db/schema/sites.ts:40` but **no migration in `drizzle/` ever carried it** — it reached dev/staging via `drizzle-kit push` only. Fresh-DB migration replay is broken (also the known `brain_notes` ordering bug), which blocks CI integration testing and any new environment. Needs a deliberate catch-up-migration strategy (`db:generate` + guarded `IF NOT EXISTS` reconciliation against envs where the column already exists) — not auto-run tonight because it changes prod migration behavior.

## 8. Release plan

Work executes on `feat/market-ready-makeover` in waves (see ARD §Execution): blockers → majors → polish, portal-first, with test gates between waves. PR target: `main` (via `feat/gtm-launch` consolidation if needed).
