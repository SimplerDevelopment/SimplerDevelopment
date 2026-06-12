---
type: spec
domain: go-to-market
status: in-progress
date: 2026-06-12
sources:
  - CLAUDE.md
  - lib/billing/entitlements.ts
  - lib/active-client.ts
  - lib/db/schema
---

# ARD — SimplerDevelopment Market-Ready Makeover

> **Architecture Requirements Document** companion to [[Market-Ready Product — PRD]]. Records the architectural decisions, invariants, and execution plan for the makeover on `feat/market-ready-makeover`.

## 1. Architectural invariants (unchanged, load-bearing)

- Three route trees: `app/admin/**` (internal), `app/portal/**` (tenant UI), `app/sites/**` + `app/s/**` (public per-tenant). The makeover does not blur these.
- API pattern: NextAuth + site-resolver + `{ success, data | error }` envelope. All new/rewritten routes conform.
- Tenancy: every data access keyed by `clientId`/`siteId`; `bun test:tenancy` after any data-access change.
- Blocks are universal, never client-specific; registry in `lib/blocks/registry.ts`.
- Migrations only via `lib/db/schema/` + `bun run db:generate`; never hand-edit `drizzle/*.sql`.

## 2. Decisions made for this makeover

> Filled as decisions are made during execution. Non-obvious calls get individual ADRs in `vault/04 - ADRs/` (or inline below if small).

| # | Decision | Rationale |
|---|---|---|
| 1 | Single long-lived branch `feat/market-ready-makeover`, wave-based commits (one domain/concern per commit) | reviewability of an overnight autonomous run |
| 2 | Claims reconciliation is bidirectional: fix the product where feasible, fix the copy where not | "no false advertising" is the bar, not "build everything tonight" |

## 3. Rewrite register (from the 2026-06-12 audit — full detail in [[Market-Ready Audit — Synthesis 2026-06-12]] §3)

1. Public pricing page — rebuild from `TIERS` in `lib/billing/domain-catalog.ts` (single source of truth; no hardcoded tiers).
2. Platform Stripe webhook — full lifecycle (failure/suspension/metering), not just activation.
3. Portal navigation shell — overlay drawer → persistent desktop rail; nav registry covers every reachable page.
4. Contract PDF renderer + portal contract management UI.
5. Automation presets + delay engine — real actions; cron-scheduled deferred actions (no `setTimeout` on Vercel).
6. Experiments variant editor — visual, not raw JSON.
7. Booking SettingsPanel monetization + waivers tab (schema/API exist; UI absent).
8. Sequential ID generation — `count()+1` races → DB sequences / constraint+retry (invoices, tickets, deck slugs).
9. Stripe self-serve billing surface — Customer Portal route, real detach, credit re-grant cron.
10. Auth hardening trio — GitHub OAuth state, token encryption, shared `lib/security/rate-limit.ts`.
11. Config & SEO baseline — `config/site.ts`, `.env.example` documenting all ~50 vars.
12. `SITE_CONTACT_OVERRIDES` PII → `site_branding` columns.

Architectural pattern decisions for the rewrites:
- **Serverless-safe deferred work:** all delays/schedules go through the existing cron infrastructure + a `scheduled_actions` style table — never in-process timers.
- **Entitlement enforcement standard:** `requireService(clientId, serviceSlug)` at the API route layer (route-tree-wide), nav gating is presentation only, and gating errors fail closed.
- **Claims gate:** every entry in `lib/data/solutions.ts` must cite a reachable portal route; enforced by a unit test (claims-parity test) so marketing can't drift from product again.

## 4. Execution plan — waves

1. **Wave 0 — red gates**: typecheck/lint/unit failures on the branch → green baseline.
2. **Wave 1 — blockers**: false claims + golden-path breaks, portal-first.
3. **Wave 2 — majors**: trust-degrading gaps (empty states, dead buttons, missing CRUD legs, gating depth).
4. **Wave 3 — coherence & polish**: portal shell consistency, marketing-site reconciliation (pricing page ↔ tiers, CTAs → /signup).
5. **Gates between waves**: `tsc --noEmit` + `bun run lint` + unit; tenancy suite after any data-access wave; `bun test:critical` before declaring done.

## 5. Risks

- Overnight autonomous scope creep → waves are strictly prioritized from the audit's ranked blocker list; polish only after gates are green.
- Parallel agent edit collisions → file-disjoint assignments per worker; worktree isolation for anything overlapping.
- Schema changes at night → avoided unless a blocker demands one; if so, `db:generate` only, applied to dev DB only.
