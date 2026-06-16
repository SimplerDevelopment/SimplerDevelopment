---
type: spec
domain: billing
status: planned
date: 2026-06-16
sources:
  - lib/billing/recompute-subscription.ts
  - lib/billing/seats.ts
  - lib/billing/entitlements.ts
  - lib/billing/domain-catalog.ts
  - lib/db/schema/sites.ts
  - app/admin/clients/[id]/plan/page.tsx
  - app/admin/clients/[id]/page.tsx
  - app/admin/layout.tsx
  - app/admin/subscriptions/page.tsx
  - app/admin/portal-services/page.tsx
  - components/admin/AdminNav.tsx
  - app/portal/PortalShell.tsx
  - tests/unit/components-batch-39c.test.tsx
---

# Feature: Admin Billing Parity — Full Management (v1)

## Overview

The ~5-week market-ready makeover rewrote the client portal and billing model (à-la-carte per-domain modules, volume discount baked into computed Stripe `price_data` line items via `lib/billing/recompute-subscription.ts`, per-seat pricing via `lib/billing/seats.ts`, `billingMode` agency|saas|byok, entitlements in `lib/billing/entitlements.ts`). The internal admin panel (`app/admin/**`) was NOT updated in parallel. A review found the admin plan page was broken (slug mismatch — fixed in commit 78952443), a change-plan corruption footgun (fixed), wrong MRR (fixed), and that admin is otherwise blind to the new model with no way to manage it.

This feature brings admin to full parity: staff can SEE and MANAGE a client's à-la-carte billing — modules, seats, comps, and BYOK grants — all routed through the same reconciler the portal uses. Scope is operational billing visibility and management; cosmetic/design refresh and blanket error-hardening of all admin pages are explicitly out of scope.

Audience: admin panel only (`app/admin/**`). Portal regression-checks required.

## Domain context

Read first: [[Billing & Stripe]]. Related specs: [[Per-Domain SaaS Billing & BYOK]], [[Self-Serve Signup Funnel & Module Onboarding]].

Key invariants:
- `recomputeClientSubscription` in `lib/billing/recompute-subscription.ts` is the single writer to Stripe. Admin must not duplicate Stripe-mutation logic — every write path must call this reconciler.
- Volume discount is a line-item-level computation inside the reconciler. The new comp `percent_off` coupon is an account-level Stripe coupon applied on top — they coexist; do not conflate them.
- Tenancy: all access resolves via `clientId`. Existing `requireStaffSession()` auth guard must gate every new admin endpoint.
- Schema changes that add nullable columns to `clients` are additive; no backfill required.

## Decision log (10 decisions — locked via design interview 2026-06-16)

1. **Driver**: operational billing visibility is the spine of this feature; cheap security + cleanup are folded in opportunistically. Cosmetic/design refresh is explicitly out of scope.
2. **Scope**: full management — admin can manage a client's à-la-carte plan, seats, and comps equivalently to the portal self-serve surface.
3. **Write-path architecture**: REUSE `recomputeClientSubscription` as the single writer. Admin API endpoints mutate `clientServices` rows then call the reconciler. Admin is a rich UI over existing billing logic — never duplicate Stripe-mutation logic in the admin layer.
4. **Seat override**: add `clients.billable_seats_override` (nullable int). When non-null it is used as the billed seat count; null = derived by `countBillableSeats` in `lib/billing/seats.ts` as today. No automatic backfill.
5. **Comp / pricing**: full comp via existing `billingMode='agency'` (unchanged). PLUS a new `clients.comp_discount_percent` (nullable int, 0–100) applied as a per-client Stripe `percent_off` coupon that the reconciler preserves across recomputes — kept separate from the line-item volume discount. Per-module comp and flat negotiated-price override are **deferred** (see non-goals).
6. **BYOK grant**: add `clients.byok_eligible_override` (nullable bool). `getClientEntitlements` in `lib/billing/entitlements.ts` computes `byokEligible = derivedByok || override`. This is the admin/sales grant switch for the BYOK contact-sales flow (BYOK is Scale-only per ADR `byok-inversion-scale-only`).
7. **Placement**: expand `app/admin/clients/[id]/plan/page.tsx` (384) into the full "Billing & Plan" management surface. The `app/admin/clients/[id]/page.tsx` (1322) billing tab becomes a read-only summary that deep-links to the plan page.
8. **Auth shell**: convert `app/admin/layout.tsx` (66) from a client component to an RSC server shell gating on `requireStaffSession()` + redirect, rendering the existing client chrome inside — mirroring `app/portal/PortalShell.tsx` (75).
9. **Resilience**: targeted, not blanket. A global `app/admin/error.tsx` route boundary + a small `fetchJsonSafe` helper applied to the billing pages we touch + the 2–3 worst-offender pages (dashboard, service-requests). NOT a sweep of all ~20 admin pages.
10. **Migration**: the three new `clients` override fields (`billable_seats_override`, `comp_discount_percent`, `byok_eligible_override`) ship as one additive migration generated via `bun run db:generate` from `lib/db/schema/sites.ts` (445). No hand-edited SQL.

## Cards (C1–C9)

See [[Project Board]] for current lane. Cards are sequenced below: Foundation first, then API, then UI; cleanup cards (C7–C9) are parallel to C3–C6.

### Foundation

**C1 — Schema: admin billing overrides migration**
Add to `clients` table in `lib/db/schema/sites.ts` (445):
- `billable_seats_override` — `integer`, nullable
- `comp_discount_percent` — `integer`, nullable, 0–100
- `byok_eligible_override` — `boolean`, nullable

Run `bun run db:generate`. Do not hand-edit `drizzle/*.sql`.

AC: columns are nullable, additive, no backfill required; migration applies cleanly to staging and prod.

**C2 — Wire overrides into billing logic**
- `countBillableSeats` in `lib/billing/seats.ts` (39): when `billable_seats_override` is non-null, return it directly instead of deriving from `countBillableSeats`.
- `getClientEntitlements` in `lib/billing/entitlements.ts` (101): `byokEligible = derivedByok || byokEligibleOverride ?? false`.
- `recomputeClientSubscription` in `lib/billing/recompute-subscription.ts` (198): when `comp_discount_percent` is non-null, apply/update the Stripe `percent_off` coupon on the customer before recomputing line items; when null, remove the coupon if present. The coupon must coexist with the volume-discount line items (they are separate mechanisms).

AC: comp % nets correctly on the Stripe invoice preview; clearing the override removes the coupon; portal seat display and BYOK gates respect overrides (regression-test the portal, not just admin).

### API

**C3 — Admin billing-management API**
New routes under `app/api/admin/portal/clients/[id]/billing/` (staff-guarded via `requireStaffSession()`):

| Route | Action |
|---|---|
| `modules/[slug]/route.ts` PUT/DELETE | Add or remove a module (`clientServices` upsert/delete → reconciler) |
| `bundle/route.ts` PUT | Swap to the bundle SKU |
| `seats/route.ts` PUT | Set or clear `billable_seats_override` |
| `comp/route.ts` PUT | Set or clear `comp_discount_percent` |
| `byok-override/route.ts` PUT | Set or clear `byok_eligible_override` |
| `mode/route.ts` PUT | Set `billingMode` (agency|saas|byok) |

Every route: validate input → mutate `clientServices` / `clients` row → call `recomputeClientSubscription` → return updated billing state.

AC: input validation with clear error messages; write actions emit an audit log entry; no direct Stripe item juggling outside the reconciler; staff-auth enforced on every route.

### UI

**C4 — Plan page → "Billing & Plan" management surface**
Expand `app/admin/clients/[id]/plan/page.tsx` (384) into a full management surface:

Read view:
- Active modules list (name, slug, status, monthly cost)
- Seats: derived count vs. override, per-seat charge, override input
- Volume-discount tier + dollar amount (from `computeAccountBilling`)
- Comp %: current value, set/clear control
- Bundle: current status, swap-to-bundle action
- BYOK override: current value, toggle
- MRR breakdown via `computeAccountBilling`

Management controls wired to C3 API routes.

AC: full breakdown shown; all management actions reflect immediately after recompute response; billingMode switcher retained from current page.

**C5 — Client-detail billing tab: read summary + stale category maps**
Two changes to `app/admin/clients/[id]/page.tsx` (1322):
1. Billing tab → read-only summary (active modules, seat count, volume-discount %, comp %, MRR) with a "Manage" deep-link to the plan page.
2. Fix stale `categoryColor` / `categoryIcon` maps in `app/admin/subscriptions/page.tsx` (559) and `app/admin/portal-services/page.tsx` (342) to derive from the domain catalog (`lib/billing/domain-catalog.ts`) so new module subscriptions render with correct color and icon rather than gray/iconless fallbacks.

AC: billing tab shows accurate summary; no gray or iconless module rows on subscriptions or portal-services pages.

**C6 — Subscriptions page model-awareness**
Update `app/admin/subscriptions/page.tsx` (559) to surface à-la-carte multi-item subscriptions clearly: label module bundles vs. single-item plans; identify clients with N-item subscriptions. Change-plan is already guarded (existing fix).

AC: multi-item subscriptions are legible to staff; bundle clients are visually distinct from single-module clients.

### Folded-in (parallel to C3–C6)

**C7 — RSC admin auth shell**
Convert `app/admin/layout.tsx` (66) from a client component to a server component:
- Gate on `requireStaffSession()` + redirect to `/login` if unauthenticated.
- Render existing client chrome (sidebar, nav) inside the RSC shell.
- Pattern: mirror `app/portal/PortalShell.tsx` (75).

AC: unauthenticated request to any `/admin/*` route redirects server-side without a client round-trip; staff chrome is visually unchanged.

**C8 — Targeted admin resilience**
- Add `app/admin/error.tsx` as a global route boundary (friendly retry UI, not an infinite spinner).
- Add a `fetchJsonSafe` helper (throw-safe fetch + typed JSON parse) in `lib/admin/fetch.ts` or similar; apply it to the billing pages touched in C4/C5 and the 2–3 worst-offender pages (admin dashboard, service-requests).
- Not a blanket sweep of all ~20 admin pages.

AC: a 500 on any admin page shows a friendly retry UI; no infinite spinner; touched billing pages handle fetch errors gracefully.

**C9 — Cleanup: delete dead AdminNav**
Remove `components/admin/AdminNav.tsx` (117) and its stale unit test references in `tests/unit/components-batch-39c.test.tsx`.

AC: no remaining `import` or `require` references to `AdminNav`; `bun run lint` and `tsc --noEmit` pass; unit tests green.

## Deferred (explicit non-goals for v1)

- Per-module comp (free a specific module while billing others at full rate)
- Flat negotiated-price override (override the dollar amount of a module line item)
- Blanket fetch-error hardening of all ~20 admin pages
- Admin design-language refresh / visual overhaul
- Admin-facing usage meters (portal already has these via `components/portal/billing/UsageMeters.tsx`)

## Technical design

### Database changes

One migration from `lib/db/schema/sites.ts` (445). New nullable columns on `clients`:

```
billable_seats_override   integer    null   -- overrides derived seat count when set
comp_discount_percent     integer    null   -- 0–100; applied as Stripe percent_off coupon
byok_eligible_override    boolean    null   -- OR'd with derived byokEligible in entitlements
```

Generate with `bun run db:generate`. Apply with `bun run db:migrate`. Never hand-edit `drizzle/*.sql`.

### Billing logic changes

- `lib/billing/seats.ts` (39): `countBillableSeats` — short-circuit to override when non-null.
- `lib/billing/entitlements.ts` (101): `getClientEntitlements` — OR in `byok_eligible_override`.
- `lib/billing/recompute-subscription.ts` (198): add coupon apply/clear logic for `comp_discount_percent`. The volume-discount line items (existing) and the comp coupon (new) are distinct Stripe mechanisms on the same customer — they must coexist without collision.

### API changes

New admin routes under `app/api/admin/portal/clients/[id]/billing/` (staff-guarded). Every route: mutate DB → call `recomputeClientSubscription` → return `{ success: true, data: ... }` envelope per the project API pattern.

No new MCP tools required for this feature.

### Portal / Admin UI

- `app/admin/clients/[id]/plan/page.tsx` (384) — expanded into the "Billing & Plan" management surface (C4).
- `app/admin/clients/[id]/page.tsx` (1322) — billing tab becomes read-only summary with deep-link (C5).
- `app/admin/subscriptions/page.tsx` (559) — model-aware multi-item display (C5, C6).
- `app/admin/portal-services/page.tsx` (342) — catalog-derived category color/icon (C5).
- `app/admin/layout.tsx` (66) — converted to RSC auth shell (C7).
- `app/admin/error.tsx` — new global route boundary (C8).
- `components/admin/AdminNav.tsx` (117) — deleted (C9).

### Scaffolds

`simplerdev-feature-scaffold` is not used — admin billing routes are security-sensitive and hand-rolled per the billing domain convention (same rationale as the portal billing routes in [[Per-Domain SaaS Billing & BYOK]]).

## Validation plan

Per [[Gate Picking]]:

- **Unit**: seat-override logic in `lib/billing/seats.ts`; byok-override OR in `lib/billing/entitlements.ts`; comp-coupon apply/clear in `lib/billing/recompute-subscription.ts` (including the coexistence case with volume-discount line items).
- **Integration**: each C3 API route (add/remove module, set/clear seat override, set/clear comp %, set/clear byok override, set billingMode) — verify DB mutation + reconciler call + response envelope.
- **Tenancy**: `bun test:tenancy` after C1 schema and C2 logic changes — the override fields are `clientId`-keyed; verify no cross-tenant leakage on the new admin write routes.
- **E2E**: `bun test:critical` before marking done — admin plan page loads with full breakdown; management actions persist; portal seat display + BYOK gates reflect overrides.
- **Manual / Stripe TEST mode**: verify on staging in Stripe test mode — comp coupon applied correctly; clearing it removes the coupon from the Stripe customer; volume-discount line items and comp coupon coexist on the same invoice preview.
- **Portal regression**: after C2, confirm portal seat display and BYOK gates work correctly for clients with and without overrides.

## Risks

- **Billing-sensitive writes**: every admin write reuses `recomputeClientSubscription` — this is the safety net. Do not bypass it.
- **Comp coupon / volume-discount collision**: the reconciler must apply the comp coupon at the Stripe customer level, not via a line-item discount, so it does not interfere with the per-item volume-discount `price_data`. Verify on a real Stripe test-mode invoice.
- **Portal regression**: the override fields in C2 ripple into portal-facing code paths (seat display, BYOK gates). Regression-check the portal after C2, not only admin.
- **RSC auth shell (C7)**: converting `app/admin/layout.tsx` from a client component changes the rendering boundary. Verify that any `"use client"` children still hydrate correctly.
- **AdminNav deletion (C9)**: confirm zero remaining import references before deleting.

## Completion ritual (on ship)

- Update [[Billing & Stripe]] domain map: add the three override fields to the schema section; add the new admin billing API routes to the sources list.
- ADR the override-fields + comp-coupon architectural decision (distinct from the volume-discount line items).
- Move the Project Board card to Shipped and set `status: shipped` in this spec's frontmatter.
