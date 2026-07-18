---
name: simplerdev-db-migration
description: Safely make or review SimplerDevelopment database schema changes using Drizzle. Use when editing `lib/db/schema/**`, adding tables/columns/indexes/relations, changing tenant keys, generating migrations, reviewing `drizzle/*.sql`, handling pgvector extensions, fixing migration drift, or when the user says "add a migration", "change schema", "db generate", "Drizzle migration", "schema review", or "is this migration safe".
---

# SimplerDev DB Migration

Own database safety. Drizzle schema files are the source; generated SQL is output. Never hand-edit `drizzle/*.sql`.

## Workflow

1. Read `lib/db/CLAUDE.md` before touching schema.
2. Inspect the existing domain schema modules under `lib/db/schema/`; place new tables and relations in the nearest domain module instead of creating a catch-all file.
3. Preserve tenancy invariants. Tables that hold tenant data need the correct `clientId` and/or `siteId` linkage and query paths must filter on it.
4. Edit schema only, then run `bun run db:generate` to create migration SQL.
5. Review generated SQL for destructive operations, missing indexes, wrong nullability, enum/default mistakes, and extension assumptions.
6. Apply migrations only against a verified local/dev database with `bun run db:migrate`. Never run ad-hoc schema changes against staging or production.
7. Pick validation gates with `simplerdev-test-gate-picker`; data-access changes normally require `bun test:tenancy`.

## Hard Rules

- Do not edit existing generated migration SQL by hand.
- Do not run `drizzle-kit push` or migration commands against production/staging unless the user explicitly confirms the target and workflow.
- Do not remove/rename columns with data without a migration plan.
- Do not add nullable tenant keys as a shortcut around backfills or tests.
- Do not assume `.env` is local; verify `DATABASE_URL`.

## Reference

Read `references/drizzle-safety.md` for migration review checks, DB target verification, and common SimplerDevelopment schema patterns.
