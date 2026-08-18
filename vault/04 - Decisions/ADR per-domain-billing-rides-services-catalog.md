---
type: adr
domain: billing
status: accepted
date: 2026-06-10
sources:
  - lib/billing/domain-catalog.ts
  - lib/billing/entitlements.ts
  - lib/db/schema/billing.ts
  - lib/db/schema/sites.ts
  - scripts/billing/001_domain_saas_billing.sql
---

# ADR: Per-domain billing rides the services catalog

## Status

Accepted — 2026-06-10, commit 3357d619 "Per-Domain SaaS Billing & BYOK".

## Context

The platform needed to sell its 12 feature domains (Websites, CRM, Brain, Email, etc.)
as individually purchasable SaaS modules, plus an all-access bundle, while preserving
zero behavior change for the existing agency client base.

Three design axes had to be decided:

1. **Where does sellable-feature structure live?** Options were a new entitlements/plans
   table, new columns on `clients`, or reusing the existing `services` / `clientServices`
   tables that already drove `hasServiceAccess`.
2. **Where do prices live?** Options were hardcoded in source code, or as data in
   `services.price` + a matching Stripe Price object.
3. **What distinguishes legacy agency clients from SaaS self-serve clients?** Options
   were a separate flag, a new plan tier in the existing `clients.plan` column, or a new
   `billing_mode` column with an explicit `agency` default.
4. **When should BYOK waive metered charges?** Options were waive all meters, waive only
   COGS meters, or no automatic waiver.

## Decision

**Model sellable feature domains as `services` rows and gate via existing
`clientServices` / `hasServiceAccess` machinery — no separate entitlements table.**

Specific choices:

- **Services catalog reuse.** Each module becomes a `services` row with
  `category = <domain-key>` (e.g. `'brain'`, `'email'`). The bundle row uses
  `category = 'bundle'`. `hasServiceAccess` already short-circuits on `category =
  'bundle'` to grant all-access; this behavior is preserved unchanged.

- **`clients.billing_mode` with `'agency'` default.** Three values:
  - `'agency'` — legacy default; bypasses all module gating unconditionally so
    existing clients see no behavior change.
  - `'saas'` — gating active; access determined by subscribed `clientServices` rows.
  - `'byok'` — same as saas plus COGS-meter waiver for modules whose vendor cost lands
    on the client's own keys.
  Adding `billing_mode` as a new column (rather than repurposing `clients.plan`) keeps
  the two axes independent: plan (`starter`/`pro`/`enterprise`) governs legacy
  feature-flag entitlements; billing mode governs the new module commerce layer.

- **Prices are data; structure is code.** `services.price` + a linked Stripe Price
  object hold the live price — repricing requires no deploy. The catalog in
  `lib/billing/domain-catalog.ts` (435 lines) holds structure: meter definitions, BYOK
  provider mappings, `promotesTo` cross-promo links, and nav hrefs. If prices were
  hardcoded in the catalog, every price change would require a deploy and a cache bust.

- **BYOK waives only COGS meters.** Waived meters are those whose marginal cost lands
  directly on the client's own API keys: AI tokens (Anthropic/OpenAI), email sends
  (Resend), e-sign envelopes (Dropbox Sign). Platform infrastructure costs (hosting
  bandwidth/storage, automation compute) are not waived — their COGS lands on platform
  accounts regardless of client key configuration. This boundary is expressed in
  `lib/billing/domain-catalog.ts` via the `byokProviders` field per module: a module
  with no `byokProviders` entry has no waiveable COGS.

- **`getClientEntitlements` in `lib/billing/entitlements.ts` (83 lines)** is the
  single resolution function: it reads `billing_mode`, active `clientServices`, and
  `clients.brainTrialUntil`, and returns the effective module set. Callers do not
  inspect `billing_mode` directly.

- **Migration hand-applied.** `scripts/billing/001_domain_saas_billing.sql` was applied
  directly to staging/prod because `drizzle-kit generate` was blocked by a pre-existing
  meta snapshot collision. The schema source of truth is `lib/db/schema/billing.ts`
  and `lib/db/schema/sites.ts`; future changes must go through the normal Drizzle
  workflow.

## Consequences

- Repricing (including promotional pricing) is a database/Stripe-only operation — no
  code deploy required.
- New feature domains are added by: (a) inserting a `services` row, (b) adding a
  catalog entry in `lib/billing/domain-catalog.ts`, and (c) wiring a
  `hasServiceAccess` check at the gating callsite. No new tables or columns needed.
- `clients.billing_mode = 'agency'` is an unconditional bypass. If a client should be
  moved to metered billing, it must be explicitly switched to `'saas'` or `'byok'` via
  the admin UI at `app/admin/clients/[id]/plan/page.tsx`.
- The `usage_thresholds` and `usage_alert_events` tables (both `clientId`-keyed) must
  be included in tenancy regression runs — `bun test:tenancy` after any data-access
  change touching these tables.
- Stripe Products/Prices must be created out-of-band and their IDs pasted into the
  matching `services.stripePriceId` rows before self-serve checkout is live. Until
  that step is done, the checkout flow will error on missing price IDs.

## Alternatives considered

**Dedicated entitlements/plans table.** Rejected: would duplicate the existing
`services` / `clientServices` machinery that already handles service activation,
`hasServiceAccess`, and invoice line items. Two overlapping tables for "what the client
has access to" would create drift and dual-write risk.

**Hardcoded prices in `domain-catalog.ts`.** Rejected: repricing requires a deploy and
a cache bust. Prices as data (DB + Stripe) allow operations to reprice without an
engineering deploy.

**Reusing `clients.plan` for billing mode.** Rejected: `plan` already carries meaning
in the legacy system (`starter`/`pro`/`enterprise`). Overloading it with billing-mode
semantics would require migrating all existing callsites and would conflate two
independent concerns.

**Waive all meters under BYOK.** Rejected: platform infra COGS (hosting, compute) do
not drop to zero when a client provides their own AI or email keys. Waiving only the
COGS that genuinely move to the client's accounts keeps the economics honest.

## Related

- [[Billing & Stripe]]
- [[Per-Domain SaaS Billing & BYOK]]
