# lib/db — Agent Notes

Drizzle ORM schema + DB client. **All data access flows through here.**

> Token budget: keep this file <80 lines. Body in `@DATABASE.md`.

## Layout

- `index.ts` — DB client (singleton; Postgres + Drizzle).
- `schema/` — domain modules (one file per area: `auth`, `sites`, `cms`, `crm`, `pm`, `brain`, `store`, `email`, `surveys`, `tools`, `billing`, `approvals`, `audit`, `collab`, `trigger-links`, `ab`, `snapshots`, `workflows`, `chat`, `cronHealth`, `agenticOs`, `plugins`, `magamommy`).
- `schema/index.ts` — public barrel. **Import from `@/lib/db/schema`, never from a specific module.**

## Migration workflow (load-bearing — break and prod 500s)

1. Edit the relevant `schema/<domain>.ts`.
2. `bun run db:generate` — emits a new `drizzle/<NNNN>_*.sql` file. **Never hand-edit `drizzle/*.sql`** — regenerate.
3. `bun run db:migrate` — applies locally. Auto-runs `db:verify-target` to refuse prod URLs.
4. **Before merging staging → main, hand-apply the new SQL against the metro DB.** Vercel deploy does NOT run migrations. Prod = metro. See memory `feedback_sd2026_release_hand_migrate`.

## Tenancy invariants

- Every tenant-scoped table has `clientId` and/or `siteId`. **Queries must filter on it.**
- After ANY data-access change: `bun test:tenancy` (alias for the tenancy-tagged integration suite). Tenancy leaks have shipped before — that test catches them.
- New tables that hold tenant data: add `clientId` + a tenancy test fixture in the same PR.

## Drizzle footguns

- In `sql\`\`` correlated subqueries, **hard-code `table.column` for outer refs**. `${table.col}` interpolation emits unqualified column names and silently returns 0. (See memory `feedback_drizzle_correlated_subqueries`.)
- `brain_embeddings` exists in DB + code but is NOT in `lib/db/schema`. `drizzle-kit push --force` WILL drop it. Don't run `--force` against shared DBs.
- The Drizzle migration tracker is currently out-of-sync with disk in prod. `bun run db:migrate` against prod fails; schema changes are hand-applied. (See memory `project_sd2026_drizzle_tracker_drift`.)

## Pointers

- `@DATABASE.md` — schema docs + posts/categories/tags REST API
- `drizzle.config.ts` — driver config
- `tests/integration/` — tenancy + integration tests
