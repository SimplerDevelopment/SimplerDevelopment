---
type: adr
domain: billing
status: accepted
date: 2026-07-09
sources:
  - lib/portal-auth.ts
  - scripts/seed-domain-modules.ts
  - scripts/seed-services.ts
  - lib/billing/domain-catalog.ts
  - tests/unit/lib/portal-auth-service-category.test.ts
---

# ADR: Alias `booking`/`bookings` at the Entitlement Gate Rather Than Flipping 42 Call-Site Literals

## Status

Accepted. Implemented on `fix/bookings-service-slug` (PR #80, pending merge as of survey 172, 2026-07-09) — all CI green including `bun test:tenancy` and critical e2e.

## Context

OBQA-021 (referenced as an open blocker in the [[Agency, Onboarding & Branding]] domain map since the OBQA-inline-9 ship) tracked a bug where the bookings module's inline setup form 403'd with an upsell prompt for clients who had actually paid for it.

Root cause: a naming mismatch between two independent sources of truth for the same concept.

- The billed catalog row is seeded by `scripts/seed-domain-modules.ts`, which writes `category: domain.key` from `FEATURE_DOMAINS` in `lib/billing/domain-catalog.ts`. The bookings domain's key is `'bookings'` (plural) — matching the SKU/slug vocabulary used everywhere else in the domain catalog (websites, crm, email, ... bookings).
- All 42 booking and gift-certificate write routes/MCP tools (`app/api/portal/tools/booking/*`, `app/api/portal/tools/gift-certificates/*`, and their MCP equivalents) call `requireService(clientId, 'booking')` (singular) — the same vocabulary used by the *legacy* dev seed, `scripts/seed-services.ts`, which still mints a singular `'booking'` category row for local/demo environments.
- `hasServiceAccess()` in `lib/portal-auth.ts` used strict string equality (`s.category === category`) to match a client's active subscription rows against the requested category. `'bookings' !== 'booking'`, so a client who paid for the bookings module via the domain-catalog checkout path was never recognized as entitled by any of the 42 gates — 403 + upsell on every write, despite an active paid subscription.

This is not a missing-gate bug (the pattern from [[ADR paid-module-entitlement-vs-scope-gating]] was followed correctly — every route had both a scope check and an entitlement check). It's a precision bug: the entitlement check ran, but its equality test was too strict to recognize a legitimate synonym.

## Decision

Add a `serviceCategoryMatches(subscribedCategory, requestedCategory)` alias helper inside `lib/portal-auth.ts` and use it in place of strict equality everywhere `hasServiceAccess` compares categories. The helper treats `'booking'` and `'bookings'` as equivalent (plus the existing `'bundle'` wildcard match), and is the single choke point for both:

- REST: `authorizePortal({ requireService })` (which delegates to `hasServiceAccess`)
- MCP: `requireService(ctx.clientId, category)`

### Why alias, not rename

The alternative — flipping the 42 call sites from `'booking'` to `'bookings'` (or the reverse) — was rejected. `scripts/seed-services.ts` is a legacy dev/demo seed still in active use for local and demo instances; it mints the singular `'booking'` category row and was out of scope to touch in this fix. A literal flip in either direction would have fixed one seed path and broken the other — trading a "paying subscriber locked out" bug for a "local dev environment locked out" bug. Aliasing at the single read-time choke point (`hasServiceAccess`) fixes both call paths without touching either seed script or any of the 42 call sites.

### Regression coverage

`tests/unit/lib/portal-auth-service-category.test.ts` (new, ships with PR #80) unit-locks `serviceCategoryMatches` — asserts the `booking`/`bookings` alias in both directions, the `bundle` wildcard, and that unrelated categories (e.g. `store` vs `esign`) still fail closed.

## Consequences

**Easier:** Any future domain-catalog key that drifts from an older singular/plural call-site vocabulary can be added to the same alias helper without touching call sites. The fix is a single-file, single-function change.

**Harder:** `serviceCategoryMatches` is now an implicit synonym table that reviewers must know to check when adding a new domain-catalog key — a naming drift between `FEATURE_DOMAINS` keys and `requireService`/`hasServiceAccess` call-site strings will silently need a new alias entry rather than surfacing as an obvious typo. There is no lint or test today that flags a *new* category-name drift before it ships as a support ticket; only the two categories discovered via OBQA-021 are covered.

**New invariant created:** `hasServiceAccess` / `authorizePortal({ requireService })` / MCP `requireService` must always resolve category equality through `serviceCategoryMatches`, never raw `===`. Do not revert to strict equality without re-auditing `scripts/seed-services.ts` (legacy singular categories) against `lib/billing/domain-catalog.ts` (current plural `FEATURE_DOMAINS` keys) for other latent mismatches.

## Alternatives considered

**Flip the 42 call sites to `'bookings'` (rejected):** Simpler in isolation, but breaks `scripts/seed-services.ts`'s legacy dev/demo seed path, which was out of scope to touch and is still relied on for local/demo environments.

**Rename the domain-catalog key to `'booking'` (rejected):** Would fix the mismatch from the other direction but breaks the plural vocabulary convention used by every other `FEATURE_DOMAINS` key (`websites`, `crm`, `email`, ...), and risks the same class of drift resurfacing wherever `domain.key` is read elsewhere (e.g. `WIZARD_TIERS` in `lib/onboarding/module-segments.ts` keys off the same plural vocabulary).

**Migrate `client_services` rows in the DB to normalize existing category values (deferred):** Would eliminate the need for the alias going forward but requires a data migration across all environments and does not protect against the same class of mismatch reappearing for a different domain key. Not pursued for this fix; the alias is cheaper and covers both existing seed paths without a migration.

## Related

- Domain map: [[Billing & Stripe]] (gotcha 10), [[Agency, Onboarding & Branding]] (OBQA-inline-9 bullet)
- ADR: [[ADR paid-module-entitlement-vs-scope-gating]] — the entitlement-gate pattern this bug lived inside without violating
- Helper: `lib/portal-auth.ts` — `serviceCategoryMatches`, `hasServiceAccess`
- Test: `tests/unit/lib/portal-auth-service-category.test.ts` (new)
- Ticket: OBQA-021
