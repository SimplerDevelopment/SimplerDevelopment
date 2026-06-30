# lib/db — Agent Notes

Drizzle ORM schema + DB client. **All data access flows through here.**

> Token budget: keep this file <80 lines. Body in `@docs/guides/DATABASE.md`.

## Layout

- `index.ts` — DB client (singleton; Postgres + Drizzle).
- `schema/` — domain modules (one file per area: `auth`, `sites`, `cms`, `crm`, `pm`, `brain`, `store`, `email`, `surveys`, `tools`, `billing`, `approvals`, `audit`, `collab`, `trigger-links`, `ab`, `snapshots`, `workflows`, `chat`, `cronHealth`, `agenticOs`, `plugins`).
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
- `brain_embeddings`: the TABLE is declared in `lib/db/schema/brain.ts` (added so push won't drop it — we lost it once and recovered from a prod dump). pgvector index support is fragile in drizzle-kit; see the HNSW note in the schema comments before touching embedding indexes. Never run `--force` against a DB with real brain data; use journaled `bun run db:migrate`.
- The Drizzle migration tracker is currently out-of-sync with disk in prod. `bun run db:migrate` against prod fails; schema changes are hand-applied. (See memory `project_sd2026_drizzle_tracker_drift`.)
- **Never hand-`ALTER TABLE` or add a runtime TZ workaround without first editing `schema/<domain>.ts` + running `bun run db:generate`.** DDL the schema file doesn't describe is invisible to drizzle-kit and has shipped real drift (`api_keys.key` 64 vs 255 in PG; `next_run_at` left as `timestamp` not `timestamptz`). Tenant-time / cron columns must be `timestamptz`. If you must hot-patch prod DDL, open the matching schema edit + generated migration in the SAME PR.

## Pointers

- `@docs/guides/DATABASE.md` — schema docs + posts/categories/tags REST API
- `drizzle.config.ts` — driver config
- `tests/integration/` — tenancy + integration tests
