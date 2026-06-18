---
type: adr
domain: sites-hosting
status: accepted
date: 2026-06-12
sources:
  - .env
  - .env.local
  - scripts/migrations/goscribble/setup-client.ts
---

# ADR: Client-site migrations must target metro (live prod DB) via a DATABASE_URL shell override — not the default .env

## Status

Accepted — discovered during Scribble (goscribble.ai) migration, 2026-06-12.

## Context

The repo's `.env` `DATABASE_URL` points at `switchyard.proxy.rlwy.net:47063`. Despite Railway's service labeling, switchyard is the **staging** Postgres instance. The **live production** DB is `metro.proxy.rlwy.net:25565`, which is what the deployed Vercel app reads at runtime.

This is documented (but easy to miss) in `.env.local`:

```
# DATABASE_URL=postgresql://...@metro.proxy.rlwy.net:25565/railway  # metro — LIVE PRODUCTION Postgres-iShF (do not use locally without intent)
```

During the first Scribble migration run, the default `.env` was in effect. The `setup-client.ts` provisioner and all `import-*.ts` scripts ran successfully and returned IDs — but those records (userId 5, clientId 4, websiteId 3, post IDs 25–36) landed on **switchyard**, not metro. The Vercel deployment therefore showed no Scribble tenant. The migration was re-run with a `DATABASE_URL` shell override pointing at metro, producing the live IDs (userId 337, clientId 149, websiteId 409, post IDs 1675–1686).

Additional finding: metro's `store_settings` table has **schema drift** — it is missing `fulfillment_provider` and several other columns present in the Drizzle schema. The `setup-client.ts` provisioner now wraps the `store_settings` insert in a best-effort / try-catch so it does not abort the migration on metro. The row is inserted on staging (where the schema is current) but skipped gracefully on metro until a migration is applied to close the drift.

## Decision

**All client-site migrations destined for the live application must be run with a shell `DATABASE_URL` override targeting metro:**

```bash
DATABASE_URL="postgresql://postgres:<pw>@metro.proxy.rlwy.net:25565/railway" \
  bun run scripts/migrations/<client>/run-all.ts
```

Do not rely on the `.env` default for production migration work. The default `.env` value is intentionally pointed at staging so that day-to-day local development does not accidentally write to production.

The `setup-client.ts` provisioner for future migrations should wrap any schema-drift-sensitive inserts (e.g. `store_settings`) in best-effort blocks so that schema lag on metro does not abort an otherwise valid provisioning run.

## Consequences

- Migration scripts always need an explicit `DATABASE_URL` override when targeting metro. This should be documented in each migration's `WORKER-BRIEF.md`.
- IDs returned by a staging run are not valid for production — they must be discarded and the migration re-run against metro.
- Staging records created by mistaken runs are harmless (switchyard has no Vercel domain), but create noise; clean them up when convenient.
- The schema drift on metro's `store_settings` must be resolved via a proper Drizzle migration (`bun run db:generate` + `bun run db:migrate` against metro) — the best-effort skip is a temporary workaround, not a permanent fix.

## Alternatives considered

- **Change the .env default to metro** — rejected: too dangerous. Local development and agent sessions would write to live prod by default. The current default (staging) is the safe choice; production writes must be intentional and explicit.
- **Provide a migration-specific `.env.migration`** — viable but adds file-management overhead. The shell override is simpler and requires no extra files to track or rotate.

## Related

- [[Scribble Site Migration]]
- [[Sites, Hosting & Publishing]]
- [[ADR migration-store-settings-preflight]]
- [[ADR site-migration-qa-via-local-dryrun]]
