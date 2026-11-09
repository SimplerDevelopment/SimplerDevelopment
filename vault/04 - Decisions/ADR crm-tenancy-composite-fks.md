---
type: adr
domain: crm
status: accepted
date: 2026-09-30
sources:
  - lib/db/schema/crm.ts
  - lib/security/assert-owned.ts
  - drizzle/
---

# ADR: Postgres enforces CRM tenancy with composite foreign keys

## Status
Accepted — 2026-09-30 by the owner. Tracked as PUX-223 / PUX-234.

## Context
Every CRM row carries `client_id`, but every *reference between* CRM rows was a single-column foreign key (`crm_proposals.contact_id → crm_contacts.id`). Postgres therefore accepted a proposal in tenant B pointing at a contact in tenant A, and any list that joined by id alone rendered A's contact to B.

Tenancy was enforced only by each writer remembering to check — and they didn't. In one day (2026-09-30) the hunt went:
- 7 REST writers unguarded;
- then the AI-assistant tools;
- then the browser-extension API;
- then the shared note functions;
- then — after a fix that claimed "every writer" — six MCP writers, two approval replays, and a public unauthenticated proposal page.

The verification that "passed" the MCP file was an equal grep count (11 writes, 11 guards) whose pattern simply didn't match the unguarded ones. Production held zero cross-tenant references, so none of it was exploited — but the class kept regenerating faster than it was closed.

## Decision
Make the reference itself tenant-scoped, so Postgres refuses a cross-tenant pointer no matter which code path writes it.

- Each referenced CRM table gets `UNIQUE (client_id, id)` (cheap — `id` is already unique).
- Each referencing column becomes part of a composite key on the parent's tenant:
  `FOREIGN KEY (client_id, contact_id) REFERENCES crm_contacts (client_id, id)`.
- Deletes keep today's behaviour per column:
  - `ON DELETE CASCADE` stays `CASCADE`.
  - `ON DELETE SET NULL` becomes the column-list form `ON DELETE SET NULL (contact_id)`, so only the pointer is nulled and `client_id` (NOT NULL) is untouched. This needs Postgres 15+; metro runs 18.6.
- Stage → pipeline consistency gets the same shape: `(pipeline_id, stage_id) → crm_pipeline_stages (pipeline_id, id)`.
- Brain tables that point at CRM rows (`brain_notes`, `brain_meetings`, `brain_tasks`, meeting participants, relationship overlays) are covered too, since they carry `client_id`.

The code guard (`assertCrmRefsInClient`) stays: it turns a refusal into a clean 403 with the field name before the write is attempted. The database becomes the backstop that can't be forgotten.

## Rollout
1. **Verify every relation is clean on metro** before adding its constraint. The main relations were zero on 2026-09-30; re-run the counts for each table the migration touches.
2. Add the `UNIQUE (client_id, id)` constraints.
3. Add each composite FK as `NOT VALID`, then `VALIDATE CONSTRAINT` separately, so the long scan doesn't hold a write lock.
4. Drop the old single-column FKs once the composite ones validate.
5. Schema in `lib/db/schema/` (Drizzle `foreignKey` / `unique` extras) + `bun run db:generate`. The `SET NULL (col)` form and the NOT VALID / VALIDATE split go in a hand-written, guarded, re-runnable `drizzle/*_manual.sql`.
6. **Apply that file to metro by hand** — prod schema auto-sync is not running (CLAUDE.md, PR #216 pending). Verify with `pg_constraint` afterwards.
7. Add a `@tenancy` integration test that inserts a cross-tenant reference directly in SQL and expects Postgres to reject it.

## Rejected alternatives
- **Code guards only.** The status quo, and the reason this ADR exists: every new surface (MCP tool, AI tool, automation action, import) re-opens the hole until someone notices.
- **Row-level security.** Would scope reads as well, but the app connects as one DB role and would have to `SET LOCAL` the tenant on every request and every pooled connection. A much larger change, with its own failure mode (a forgotten `SET` reads nothing or everything).
- **Triggers that compare `client_id`.** Same guarantee as a composite FK, but opaque, slower, and easy to drop silently in a migration.

## Consequences
- A writer that forgets the guard now fails loudly (a constraint violation → 500) instead of silently leaking. The guard keeps that a 403 in the normal case.
- Every new CRM-referencing table must declare the composite FK; a reviewer should treat a bare `references(() => crmContacts.id)` as a bug.
- Moving a record between tenants (if ever needed) must move its references in the same transaction.
