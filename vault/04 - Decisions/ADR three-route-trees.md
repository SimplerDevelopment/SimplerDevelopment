---
type: adr
domain: architecture
status: accepted
date: 2026-06-09
sources:
  - CLAUDE.md (root) — "Three audiences, three route trees" invariant
  - vault/02 - Architecture/Route Trees & Audiences.md
  - .planning/agentic-os.md — domain descriptions (admin/portal/sites distinction)
---

# ADR: Three audience-scoped route trees — admin, portal, sites

## Status

Accepted — backfilled 2026-06-09 from root `CLAUDE.md` architecture invariants.

## Context

SimplerDevelopment serves three distinct audiences with incompatible auth models,
data-access scopes, and UI conventions:

- **Internal operators** (the SimplerDevelopment team) need a global admin panel that
  can view and manage any tenant.
- **Client users** (each tenant's staff) need a per-tenant management portal scoped
  to their own data only.
- **End-users and the public** visit per-tenant client-facing websites that have no
  portal auth and must serve content as fast as possible.

Mixing these audiences in a flat route tree would require per-route audience checks,
risk cross-tenant data leaks, and make the auth middleware impossible to reason about.

## Decision

Three audience-specific route subtrees, each with its own auth model:

| Audience | Route prefix | Auth model |
|---|---|---|
| Internal (our team) | `app/admin/**` | Global; super-admin guard |
| Tenant staff | `app/portal/**` | Per-tenant; site-resolver + `lib/active-client.ts` |
| Public end-users | `app/sites/**` and `app/s/**` | None (public) or per-site token |

Rules:
- **Never mix audience logic.** A portal route must not contain admin-only logic;
  an admin route must never resolve a `clientId` from the request as if it were a
  portal route.
- **API routes under each tree follow the same partition.** Portal API routes go in
  `app/api/portal/**` (or under `app/portal/`); admin-only APIs live under
  `app/admin/`.
- **Tenant resolution is the portal's job.** Use `lib/active-client.ts` +
  site-resolver middleware. Do not implement ad-hoc tenant lookup in individual
  route handlers.
- New resources use `simplerdev-feature-scaffold` to produce the correct lockstep of
  schema + route + envelope pattern in the right tree. Do not hand-roll.

## Consequences

- Auth middleware can be applied at the subtree level (`app/portal/` gets portal
  middleware; `app/admin/` gets super-admin middleware) without per-route checks.
- A misplaced file (e.g. an admin utility accidentally placed in `app/portal/`) is
  caught by the architecture boundary check (`bunx depcruise`) in the CI gate.
- The `app/s/**` alias for `app/sites/**` exists for short-URL routing; both are
  public-facing and carry no auth.

## Alternatives considered

Rationale not recorded in writing; inferred: a flat route tree with per-route audience
checks was the alternative. The three-tree approach was established early and is
treated as a foundational invariant in `CLAUDE.md`.

## Related

- [[Route Trees & Audiences]]
- [[Auth & Roles]]
- [[Auth & Security]]
