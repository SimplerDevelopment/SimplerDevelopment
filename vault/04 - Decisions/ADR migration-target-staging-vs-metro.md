---
type: adr
domain: sites-hosting
status: accepted
date: 2026-06-12
sources:
  - .env
  - .env.local
  - scripts/migrations/<client>/setup-client.ts
---

# ADR: Client-site migrations must target the production DB via a DATABASE_URL shell override — not the default .env

## Status

Accepted — discovered during a client site migration, 2026-06-12.

## Context

The repo's `.env` `DATABASE_URL` points at the **staging** Postgres instance (`$STAGING_DATABASE_URL`). The **live production** DB (`$PROD_DATABASE_URL`) is what the deployed Vercel app reads at runtime.

This is documented (but easy to miss) in `.env.local`:

```
# DATABASE_URL=$PROD_DATABASE_URL  # live production DB (do not use locally without intent)
```

During the first migration run, the default `.env` was in effect. The `setup-client.ts` provisioner and all `import-*.ts` scripts ran successfully and returned IDs — but those records landed on the **staging** DB, not production. The Vercel deployment therefore showed no tenant. The migration was re-run with a `DATABASE_URL` shell override pointing at the production DB, producing the correct live IDs.

Additional finding: the production DB's `store_settings` table has **schema drift** — it is missing `fulfillment_provider` and several other columns present in the Drizzle schema. The `setup-client.ts` provisioner now wraps the `store_settings` insert in a best-effort / try-catch so it does not abort the migration on production. The row is inserted on staging (where the schema is current) but skipped gracefully on production until a migration is applied to close the drift.

## Decision

**All client-site migrations destined for the live application must be run with a shell `DATABASE_URL` override targeting the production DB:**

```bash
DATABASE_URL="$PROD_DATABASE_URL" \
  bun run scripts/migrations/<client>/run-all.ts
```

Do not rely on the `.env` default for production migration work. The default `.env` value is intentionally pointed at staging so that day-to-day local development does not accidentally write to production.

The `setup-client.ts` provisioner for future migrations should wrap any schema-drift-sensitive inserts (e.g. `store_settings`) in best-effort blocks so that schema lag on the production DB does not abort an otherwise valid provisioning run.

## Consequences

- Migration scripts always need an explicit `DATABASE_URL` override when targeting production. This should be documented in each migration's `WORKER-BRIEF.md`.
- IDs returned by a staging run are not valid for production — they must be discarded and the migration re-run against the production DB.
- Staging records created by mistaken runs are harmless (staging has no Vercel domain pointed at it), but create noise; clean them up when convenient.
- The schema drift on the production DB's `store_settings` must be resolved via a proper Drizzle migration (`bun run db:generate` + `bun run db:migrate` against production) — the best-effort skip is a temporary workaround, not a permanent fix.

## Alternatives considered

- **Change the .env default to the production DB** — rejected: too dangerous. Local development and agent sessions would write to live prod by default. The current default (staging) is the safe choice; production writes must be intentional and explicit.
- **Provide a migration-specific `.env.migration`** — viable but adds file-management overhead. The shell override is simpler and requires no extra files to track or rotate.

## Related

- [[Sites, Hosting & Publishing]]
- [[ADR migration-store-settings-preflight]]
- [[ADR site-migration-qa-via-local-dryrun]]
