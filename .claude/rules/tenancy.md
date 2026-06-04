---
paths:
  - "app/api/**/*.ts"
  - "lib/db/**/*.ts"
  - "lib/active-client.ts"
---

# Tenancy rules (data-access)

This is a multi-tenant SaaS. Data is keyed by `clientId` / `siteId`. A query that forgets the tenant filter is a cross-tenant data leak — the highest-severity bug class in this repo.

- **Always scope by tenant.** Every read/write of tenant-owned data must filter on the active `clientId` (and `siteId` where applicable). No unscoped `db.select().from(table)` on tenant tables.
- **Never trust the URL/param for tenant identity.** Resolve the active client/site from the session via `lib/active-client.ts` + the site-resolver middleware. A `[siteId]` route param is navigation only — cross-check it against the resolver; a user may have multiple sites.
- **API envelope:** route handlers return `{ success, data | error }`.
- **After ANY data-access change, run `bun test:tenancy`** (`scripts/test.sh --layer=integration --tag=tenancy`). It is the cross-tenant-leak regression gate.
- Schema lives in per-domain modules under `lib/db/schema/` (barrel: `@/lib/db/schema`). Never hand-edit `drizzle/*.sql` — edit the schema module, then `bun run db:generate`.
