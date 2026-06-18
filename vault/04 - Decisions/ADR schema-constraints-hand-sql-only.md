---
type: adr
domain: billing
status: accepted
date: 2026-06-11
sources:
  - scripts/billing/002_signup_funnel.sql
  - lib/db/schema/auth.ts
  - tests/helpers/test-db.ts
  - drizzle.config.ts
---

# ADR: Schema constraints drizzle-kit push cannot apply live go in hand-SQL only

## Status

Accepted

## Context

The self-serve signup funnel (commits e2faf943 + 8566e8ed) required a `UNIQUE` constraint on `users.google_id` to prevent duplicate Google-linked accounts. When this constraint was declared via `.unique()` in `lib/db/schema/auth.ts` and applied with `drizzle-kit push --force`, drizzle-kit detected existing rows in the `users` table, raised an interactive "truncate users?" TTY prompt, and then exited 0 **without applying the constraint**. The silent failure caused 312 cascading integration-test failures downstream (the test-db heal runs drizzle-kit push; the template was missing the column constraint; tests that relied on the unique invariant produced bad data).

This is the same class of problem as the `brain_embeddings` HNSW index, which was also blocked by drizzle-kit's interactive TTY prompt and was moved to hand-SQL for the same reason.

A related root cause was also fixed in the same pass: `drizzle.config.ts` was reading `DATABASE_URL` unconditionally, ignoring `DRIZZLE_DATABASE_URL`. Programmatic callers — specifically `tests/helpers/test-db.ts` heal — set `DRIZZLE_DATABASE_URL` to point at the test database, but the config ignored it and used the app DB. The fix adds `DRIZZLE_DATABASE_URL ?? DATABASE_URL` resolution so the test heal operates on the correct target database.

## Decision

1. **Unique constraints (and any other DDL that drizzle-kit refuses to apply non-interactively on a populated table) are placed exclusively in hand-applied SQL migration files under `scripts/billing/`** — not in the Drizzle schema TypeScript. The TypeScript schema omits the `.unique()` call to avoid the TTY prompt on future `drizzle-kit push` runs.

2. **`drizzle.config.ts` must honor `DRIZZLE_DATABASE_URL` as an override.** The precedence is `DRIZZLE_DATABASE_URL ?? DATABASE_URL`. This is required for the integration-test heal path in `tests/helpers/test-db.ts` to target the correct database.

Concretely: `users.google_id` uniqueness is enforced only by `scripts/billing/002_signup_funnel.sql`. It is not declared in `lib/db/schema/auth.ts`.

## Consequences

- The unique constraint is real and enforced at the database level in all environments where `002_signup_funnel.sql` has been hand-applied.
- The Drizzle schema TypeScript does not reflect the constraint, so schema-diffing tools will show a false drift. This is a known and accepted trade-off.
- Any future migration that must add a unique or index constraint to a populated table must follow the same pattern: hand-SQL only, not `.unique()` / `.index()` in the schema file.
- The `drizzle.config.ts` fix is transparent to production; it only changes behavior for callers that set `DRIZZLE_DATABASE_URL` (primarily the test heal).

## Alternatives considered

- **Keep `.unique()` in the schema, run `drizzle-kit push` in a CI pipeline with a pre-truncated test database.** Rejected: the test template heal runs against the integration-test database which already has rows; truncation would destroy the test fixture and require a full reseed on every heal.
- **Remove the constraint entirely and rely on application-level deduplication.** Rejected: a race window exists on concurrent Google OAuth callbacks for the same email. Application-level guards are insufficient without a DB constraint.
- **Migrate to `drizzle-kit migrate` (SQL file output) instead of `push`.** Deferred: would require restructuring the entire migration workflow; scope too large for this change. This ADR records the minimum viable fix.

## Related

- Domain map: [[Billing & Stripe]]
- Spec: [[Self-Serve Signup Funnel & Module Onboarding]]
- Prior precedent: brain_embeddings HNSW index (same TTY-prompt class of problem; see `scripts/billing/001_domain_saas_billing.sql` comments)
- Files: `scripts/billing/002_signup_funnel.sql`, `lib/db/schema/auth.ts`, `tests/helpers/test-db.ts`, `drizzle.config.ts`
