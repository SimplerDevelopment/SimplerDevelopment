# Drizzle Safety

## Source Of Truth

- Edit `lib/db/schema/**`.
- Generate SQL with `bun run db:generate`.
- Treat `drizzle/*.sql` as generated output. Review it; do not hand-edit it.

## DB Target Check

Before applying migrations:

1. Inspect `DATABASE_URL` / `DATABASE_URL_TEST`.
2. Confirm the hostname/database is local or an isolated dev DB.
3. Do not rely on `.env` naming. A local file may point at a remote DB.
4. Use `bun run db:migrate`, which runs `db:verify-target`.

## Schema Review

- Tenant-owned tables need `clientId` and/or `siteId` and indexes that match access paths.
- Foreign keys should reflect ownership boundaries; avoid cross-tenant joins through unscoped IDs.
- Add indexes for list, search, dashboard, and resolver queries.
- Defaults and nullability should match existing creation flows.
- For enum-like fields, check UI forms, API validation, MCP schemas, and tests.
- pgvector-backed tables require extension availability and dimension consistency.

## Generated SQL Review

- Look for `DROP`, `ALTER COLUMN SET NOT NULL`, `RENAME`, type changes, and backfill requirements.
- Confirm generated table/column names match conventions.
- Confirm indexes and constraints are present.
- For destructive operations, stop and propose a two-step migration/backfill plan.

## Validation

- Run `bun run typecheck`.
- Run affected integration tests.
- Run `bun test:tenancy` when query paths or tenant-owned tables change.
- For production-sensitive migrations, document rollback/forward-fix expectations in the PR or release notes.
