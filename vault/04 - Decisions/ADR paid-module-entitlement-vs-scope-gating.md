---
type: adr
domain: billing
status: accepted
date: 2026-06-24
sources:
  - lib/portal-auth.ts
  - lib/billing/entitlements.ts
  - lib/storefront/mcp-sdk-adapter.ts
  - lib/ai/portal-tools/scopes.ts
  - app/api/portal/websites/[siteId]/store/
  - tests/unit/paid-module-entitlement-guard.test.ts
---

# ADR: Paid-Module Entitlement vs Scope Gating — Two Separate Gates, Both Required

## Status

Accepted

## Context

Several paid modules (store, esign, hosting, booking, pitch-decks) have write surfaces that were gated by scope/auth checks (`hasScope` / `auth()` / `requireScope`) but not by billing entitlements. A client without an active subscription could call these write surfaces and mutate paid-module data. This is NOT a cross-tenant leak — all paths remained `clientId`-scoped — but it is a billing bypass: an unsubscribed client could use paid features without paying.

The bug was discovered by the nightly guardrail-distillation loop (finding #1 from `.claude/distill/guardrail-proposals-2026-06-24.md`), which surfaced it as the highest-priority structural gap across the write surface.

Scope/auth gating and entitlement gating address orthogonal concerns:
- **Scope** (`hasScope` / `requireScope`) = "does this API key or role have *permission* to call this tool/route?"
- **Entitlement** (`requireService(clientId, category)` for MCP, `authorizePortal({ requireService })` / `hasServiceAccess` for REST) = "is this client's subscription *active* for this paid module?"

Both are required on every paid-module write surface. Either gate alone is insufficient.

## Decision

### Rule (binding)

Every paid-module write route and MCP write tool must pass BOTH:

1. Auth/scope gate — verifies caller identity and key permissions.
2. Entitlement gate — verifies the client's subscription includes the module.

The idiomatic patterns are:

**MCP write tools:** add `requireService(ctx.clientId, 'store' | 'esign' | 'hosting' | 'booking' | 'pitchDecks')` (or the module-specific helper, e.g. `requireStore()` in `lib/storefront/mcp-sdk-adapter.ts`) at the top of each handler, after scope is verified.

**REST write routes (portal):** use `authorizePortal({ requireService: 'store' | ... })` in `lib/portal-auth.ts`, or call `hasServiceAccess(clientId, category)` from `lib/billing/entitlements.ts` if the route already resolves the client via a custom path.

### The `resolveStoreSite` pattern

For store sub-resource routes, where 21 individual route handlers would each need a per-handler entitlement check, the accepted solution is the `resolveStoreSite` helper in `lib/portal-auth.ts` (168 lines). It wraps `resolveClientSite` and adds `hasServiceAccess('store')` in a single call. A route that swaps `resolveClientSite` for `resolveStoreSite` automatically gates on subscription, and an unsubscribed client falls through to the existing not-found/403 path without any additional per-handler code.

This pattern was applied to 21 store sub-resource routes in commits `c7cb86a3` and `fe4e1f66`. Three routes were intentionally left ungated by this helper:
- `store/stripe/test` — Stripe key connectivity diagnostic (pre-activation onboarding).
- `store/stripe-connect` onboarding routes — needed before a subscription is active.
- `store/easypost/test` — EasyPost key diagnostic.

These allowlist exceptions are asserted by `tests/unit/paid-module-entitlement-guard.test.ts` (85 lines).

### MCP store write tools

A `requireStore()` helper in `lib/storefront/mcp-sdk-adapter.ts` (947 lines) gates all 16 store-adapter write tools. Additionally, `booking_pages_create`, `booking_pages_update`, and `decks_fork` received equivalent module-specific entitlement guards (commit `8d0df3bf`).

### Regression test

`tests/unit/paid-module-entitlement-guard.test.ts` scans the store write surface and asserts:
- All store write routes call `resolveStoreSite` or `hasServiceAccess`.
- All MCP store write tools call `requireStore()`.
- The three explicitly ungated routes appear on the allow-list.

## Consequences

**Easier:** Adding a new paid-module write route has a clear, enforced pattern. The regression test will catch any new route that skips the gate. The `resolveStoreSite` helper eliminates ~40 per-handler guard calls that would otherwise be needed.

**Harder:** Routes that use a custom site-resolver (e.g., `resolveClientSite` plus custom logic) must explicitly call `hasServiceAccess` — they cannot rely on `resolveStoreSite` automatically. Code reviewers must check both the scope gate and the entitlement gate when reviewing new paid-module routes; the `.claude/rules/tenancy.md` reviewer persona now includes this as an explicit bullet.

**New invariants created:**
- `resolveStoreSite` is the canonical resolver for all store sub-resource portal routes. Do not revert to `resolveClientSite` on store routes without adding an explicit `hasServiceAccess` call.
- The three intentionally ungated routes (`stripe/test`, `stripe-connect/*`, `easypost/test`) must remain on the allow-list in the regression test. Any new diagnostic/onboarding route that needs to bypass the entitlement gate must be explicitly added to the allow-list with a comment.
- Media write routes now require `member+` role (converted from plain `auth()` to `authorizePortal` in commit `fe4e1f66`). This is a behavior change — verify downstream callers if adding new media write paths.

## Alternatives considered

**Per-handler entitlement check (rejected):** Adding `hasServiceAccess` inline in each of the 21 store sub-resource handlers would work but creates 21 points of potential omission. The `resolveStoreSite` helper consolidates the gate at the resolver layer, which is harder to accidentally skip.

**Middleware-level gate (deferred):** A Next.js middleware that intercepts all `/api/portal/websites/[siteId]/store/` routes and checks entitlement before the handler runs would be the most robust approach. Not implemented because the middleware would need to read the DB (the session resolver already does this), and the current pattern is sufficient until route count grows significantly.

**Auto-flag via lint rule (future):** A custom ESLint rule that detects `resolveClientSite` in a store-path route file and requires either `resolveStoreSite` or an explicit `hasServiceAccess` call. Proposed as a future guardrail candidate in `.claude/distill/guardrail-proposals-2026-06-24.md`.

## Related

- Domain map: [[Billing & Stripe]], [[Storefront & Commerce]]
- ADR: [[ADR per-domain-billing-rides-services-catalog]]
- Test: `tests/unit/paid-module-entitlement-guard.test.ts` (85)
- Helper: `lib/portal-auth.ts` (168) — `resolveStoreSite`
- Distillation source: `.claude/distill/guardrail-proposals-2026-06-24.md`
- Caveat: DB-backed entitlement gates (`bun test:tenancy` + portal-auth integration tests) NOT yet run as of 2026-06-24. Required before merging `worktree/study-guide` since ~40 data-access routes changed.
