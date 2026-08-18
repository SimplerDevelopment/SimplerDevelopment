---
type: spec
domain: agency-onboarding-branding
status: proposed
date: 2026-06-17
sources:
  - lib/db/schema/snapshots.ts
  - lib/db/schema/billing.ts
  - lib/plugins/entitlement.ts
  - lib/onboarding/service.ts
  - lib/billing/usage-rollup.ts
  - lib/billing/metered-items.ts
  - lib/stripe/index.ts
  - app/api/portal/onboarding/route.ts
---

# Feature: White-Label SaaS Resell

## Overview

A complete agency-resell layer on top of SD's existing multi-tenancy, snapshots, metered billing, and entitlement primitives: (1) **cloneable onboarding snapshot** — an agency defines a template tenant, locks it as a snapshot, and new sub-clients spawn from it; (2) **tiered feature entitlement gating** — agencies control which SD features each sub-client can access; (3) **Stripe usage rebilling** — the platform bills the agency, the agency marks up and re-bills their clients, keeping margin. This is the biggest strategic opportunity in the gap report and the prerequisite for "SD resold by agencies."

Competitive context: **GoHighLevel** is the primary target — its entire business model is agency white-label SaaS resell. Gap #5 in [[Competitive Gap Analysis 2026-06]] and the centerpiece of Strategic Opportunity #1.

## Domain context

Read first: [[Agency Onboarding Branding]]. Invariants:

- Multi-tenancy is already foundational: all data is keyed by `clientId` / `siteId`. The resell layer adds a new "agency" tier above the existing client tier — not a parallel system.
- Snapshots already exist (`lib/db/schema/snapshots.ts`) as portable site-state. The template tenant model extends this concept to full-tenant configuration snapshots.
- Entitlement primitives exist at `lib/plugins/entitlement.ts` and `lib/brain/entitlement.ts` — this spec extends them to a first-class feature-gate system.
- Stripe metered billing, usage rollup, and Connect are already present (`lib/billing/usage-rollup.ts`, `lib/billing/metered-items.ts`, `lib/stripe/index.ts`). Rebilling routes usage through the agency's Stripe account.
- Onboarding flow is at `lib/onboarding/service.ts` + `app/api/portal/onboarding/route.ts` — the template-spawn path extends this.
- Tenancy invariant extends: sub-client rows must be scoped to both `clientId` (sub-client) and `agencyId` (parent agency). Run `bun test:tenancy` after every schema change.

## Problem

Agencies cannot currently white-label SD. There is no concept of a parent agency account, no way to clone a configured tenant as a starting point for new clients, no way to restrict which features a sub-client sees, and no way to automatically bill the agency for all sub-client usage so they can apply margin. This means SD cannot be resold by the highest-leverage distribution channel (agencies), and GoHighLevel wins that market by default.

## Goal

- An agency admin can designate a configured tenant as an onboarding template and provision new sub-clients from it with one action.
- Feature entitlement gating: agency admin controls which SD feature modules each sub-client tier can access (e.g. "Starter: CMS + Bookings; Growth: + CRM + Email; Pro: all").
- All sub-client metered usage rolls up to the agency's Stripe account for consolidated billing; the agency can view per-sub-client usage breakdown and set markup.
- Sub-clients log into a white-labeled portal (agency branding: logo, color scheme, custom domain) with no visible SD branding unless the agency enables it.
- Provisioning a new sub-client from a template takes under 5 minutes end-to-end (automated snapshot clone + Brain seed + user invite).

## Proposed approach

### Schema additions

1. **`agency_accounts`** table: `id`, `clientId` (the agency's own tenant), `name`, `stripeAccountId`, `markupPercent`, `brandingOverride` (JSONB: logo, colors, domain), `createdAt`.
2. **`agency_sub_clients`** table: `agencyId`, `clientId` (FK to existing `clients`), `tier` (string), `entitlementOverride` (JSONB), `createdAt` — the join table linking sub-clients to their parent agency.
3. **`onboarding_templates`** table: `id`, `agencyId`, `snapshotId` (FK to `lib/db/schema/snapshots.ts`), `name`, `defaultTier`, `createdAt`.
4. Extend `lib/db/schema/billing.ts`: add `agencyId` (nullable) to usage rows so the rollup can aggregate by agency.
5. Generate migration: `bun run db:generate`.

### Template tenant + snapshot clone

1. Agency admin navigates to Agency > Templates > "Create Template from Current Client." This triggers a full-tenant configuration snapshot (extending the existing snapshot mechanism in `lib/db/schema/snapshots.ts`) capturing: site configs, block library defaults, Brain settings, onboarding steps, workflow templates, and entitlement tier definitions.
2. "Provision new client" form: name, email, domain, tier selection → calls `lib/onboarding/service.ts` with a `templateId` parameter. The service: creates the `clients` row, inserts into `agency_sub_clients`, restores the template snapshot into the new tenant, seeds a Company Brain, creates a Stripe customer linked to the agency account, and sends an invite email.

### Entitlement gating

1. Extend `lib/plugins/entitlement.ts` to resolve entitlements from: (a) the sub-client's `tier`, (b) the `entitlementOverride` JSONB on `agency_sub_clients`, and (c) platform-wide defaults. Precedence: override > tier > default.
2. Define a `FEATURE_TIERS` config (TypeScript constant, not DB-driven initially) mapping tier strings to feature module arrays (e.g. `cms`, `bookings`, `crm`, `email`, `brain`, `storefront`, `esign`).
3. Gate portal navigation and API routes on the resolved entitlement set. Existing routes already check `clientId` — add `checkEntitlement(clientId, feature)` calls at the route layer using `simplerdev-feature-scaffold` patterns.
4. Agency admin UI: per-sub-client entitlement override panel (toggle individual features on/off regardless of tier).

### Usage rebilling

1. Extend `lib/billing/usage-rollup.ts`: after the per-client rollup, aggregate sub-client usage by `agencyId` and push a consolidated usage record to the agency's Stripe meter.
2. Agency billing dashboard: per-sub-client usage breakdown (AI credits, emails sent, metered items) + applied markup + invoiced amount. Data sourced from the extended usage rollup.
3. The agency's Stripe account (Connect or direct) receives the consolidated charge; the agency is responsible for re-billing their clients at whatever margin they set.

### White-label portal

1. On portal load, resolve `agencyId` from the session's `clientId` via `agency_sub_clients`. If found, overlay `agency_accounts.brandingOverride` (logo, colors) over the default SD branding — no page reload required (CSS custom properties or Tailwind class injection).
2. Custom domain for the agency-branded portal: extend the existing subdomain resolver to support `agencyId`-scoped domains.

## Scope

In scope:
- `agency_accounts`, `agency_sub_clients`, `onboarding_templates` schema.
- Template snapshot creation + sub-client provisioning from template.
- Tiered feature entitlement gating (tier config + per-client override).
- Usage rollup extension for agency-level aggregation + rebilling to Stripe.
- Agency billing dashboard (usage breakdown per sub-client).
- White-label portal branding override (logo, colors, custom domain).

Out of scope:
- Dunning / self-serve billing portal for sub-clients (see [[Spec - Billing Dunning + Self-Serve Portal]]).
- Durable automation runtime (prerequisite for multi-step onboarding journeys — see [[Spec - Durable Automation Runtime]]).
- Full SCIM/SSO for enterprise agency accounts.
- Reseller marketplace / discovery (post-MVP).

## Risks

- Tenancy leak risk is high: sub-client rows must always be readable only by the sub-client's own session or by their parent agency. Run `bun test:tenancy` after every data-access change in this feature.
- Snapshot clone fidelity: the existing snapshot mechanism captures site state; full-tenant config (Brain, workflows, entitlements) may require extensions. Audit what the snapshot currently covers before committing to the template scope.
- Stripe Connect vs. direct account for agency billing: Connect is the correct model if agencies want Stripe-managed payouts; direct account requires manual reconciliation. This is a design decision requiring Stripe account configuration.
- Feature entitlement gating retrofitted onto existing routes: every gated feature needs a route-level check added. Use `simplerdev-feature-scaffold` patterns consistently; a missed check is a gap.

## Effort

**L** (~6–10 engineer-weeks: schema + provisioning + entitlement gating across all routes + rebilling rollup + agency UI + white-label portal + tenancy tests).

## Open questions

- Stripe Connect (managed payouts to agencies) vs. direct account for rebilling — which model is right for the first agencies?
- What does the existing snapshot mechanism capture today? Full audit needed before defining template scope.
- Should tier definitions (`FEATURE_TIERS`) be DB-driven (agency-customizable) from day one, or start as a TypeScript constant and migrate later?
- First target agency partner for co-design and beta?

---

## Verified against dev (2026-06-17)

**Verdict: PARTIAL — entitlement engine shipped in the GTM makeover; three gaps remain.**

### What already shipped

The GTM market-ready makeover landed a real entitlement engine:

- `lib/billing/domain-catalog.ts` — 12 domain SKUs with plan-tier mapping (the `FEATURE_TIERS` TypeScript constant this spec proposed is already implemented).
- `lib/billing/entitlements.ts` — `getClientEntitlements(clientId)` and `isEntitledToDomain(clientId, domain)` helpers backed by plan-tier lookup.
- `/api/portal/billing/entitlements` — endpoint serving the resolved entitlement set to the portal client.

### What is genuinely unbuilt (narrowed scope — 3 gaps)

**Gap 1 — Entitlement enforcement is inconsistent (medium effort).**
The new `isEntitledToDomain` check is not yet the enforcement mechanism used by most routes. The existing `hasServiceAccess` helper in `lib/portal-auth.ts` (category-based check) is what the ~4 usages in `lib/portal-auth.ts` and `lib/mcp/types.ts` call; it does not honor plan-tier entitlements from the new engine. There is no middleware-level nav gating. The makeover built the entitlement resolver but did not retrofit it onto existing route guards.

**Gap 2 — Snapshot scope is site-content-only (medium effort).**
`lib/snapshots/` covers site content (posts, nav, post-types, CSS). CRM data, automation workflows, pipelines, bookings configuration, and email sequences are absent from snapshot scope. Cross-client snapshot apply is staff-gated in the current UI, not agency self-serve. The full-tenant template clone described in this spec's "Template tenant + snapshot clone" section remains greenfield.

**Gap 3 — Stripe usage rebilling and parent-child client schema are fully absent (large effort).**
No `agency_accounts` or `agency_sub_clients` schema exists. No parent-child `clientId` relationship in the billing schema. No per-agency usage rollup in `lib/billing/usage-rollup.ts`. No markup configuration. The Stripe Connect / rebilling path is entirely greenfield.

### Updated scope priority

Re-scope in this order: (1) retrofit `isEntitledToDomain` onto existing route guards to enforce what the engine already resolves; (2) extend snapshot scope to cover CRM/automations/pipelines for self-serve template cloning; (3) add the `agency_accounts` / `agency_sub_clients` schema + Stripe rebilling rollup.

Effort estimate shifts: the entitlement-resolver work was already done, so the total drops slightly — call it **L** (5–8 engineer-weeks) rather than the original 6–10, but the Stripe rebilling path remains the longest leg.
