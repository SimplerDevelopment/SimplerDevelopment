---
type: architecture
domain: platform
status: active
date: 2026-06-09
sources:
  - lib/active-client.ts
  - lib/portal-client.ts
  - middleware.ts
  - lib/db/CLAUDE.md
  - app/portal/CLAUDE.md
  - CLAUDE.md
  - tests/integration/api/security/tenancy.test.ts
  - lib/db/schema/index.ts
---

# Tenancy & Site Resolution

This platform is multi-tenant. Every piece of client-owned data is keyed by `clientId` and/or `siteId`. A query that forgets the tenant filter is a cross-tenant data leak — the highest-severity bug class in the repo.

## Data keying

The two primary tenant keys:

- **`clientId`** — identifies the client company (the paying account). All top-level tenant data (tickets, CRM records, brain content, billing) is scoped by `clientId`.
- **`siteId`** — identifies a single website within a client account. A client can have multiple sites. Website-specific data (posts, blocks, branding, hosting config) is scoped by `siteId` (which implies `clientId`).

Every tenant-scoped table in `lib/db/schema/` carries one or both columns. Adding a new table that holds tenant data **requires** adding `clientId` (and `siteId` if site-specific) in the same PR.

## Resolution in the portal (authenticated context)

Two layers work together to resolve the active tenant for every portal request:

### Layer 1 — `lib/active-client.ts` (cookie read)

```ts
// Read the active client ID from the `sd-active-client` cookie.
export async function getActiveClientId(): Promise<number | null>

// Parse the same cookie from a raw Cookie header string (API-route variant).
export function parseActiveClientId(cookieHeader: string | null): number | null
```

This is a **thin cookie reader only**. It does not verify membership. Use it only in middleware-adjacent code where you cannot call DB. For authenticated route handlers, use `getPortalClient` instead.

### Layer 2 — `lib/portal-client.ts` (`getPortalClient`)

```ts
export const getPortalClient = cache(async (userId: number, preferredClientId?: number) => { ... })
```

- Reads the `sd-active-client` cookie to find the preferred company.
- Verifies the user is a member of that client via a DB lookup (`clientMembers` table).
- Handles staff impersonation via the `sd_impersonate_client_id` cookie (re-verifies role from DB, never trusts ambient JWT).
- Wrapped in `React.cache` — deduplicated to one DB query per request.

**Rule:** in any portal API route or server component that needs the client identity, call `getPortalClient(userId)`. Never trust the URL alone.

## Resolution for public sites (unauthenticated context)

Handled entirely in `middleware.ts` at the edge:

1. Incoming request hostname is checked against `APP_HOSTNAMES` (the known app domains).
2. If the hostname is **not** an app hostname:
   - Host header is validated by `isPlausibleTenantHost()` (rejects IPs, short labels, metadata hostnames) — defense against SSRF/host-header injection.
   - `resolveCustomDomain(bareHost)` from `lib/agency/custom-domain.ts` is called. If matched to a registered agency portal domain, the request is rewritten to `/portal` with an `x-agency-client-id` header.
   - Otherwise, the request is rewritten to `app/sites/[domain]/...` with `x-site-pathname` and `x-site-domain` headers. The site renderer resolves the tenant from the domain segment in the rewritten path.
3. `*.simplerdevelopment.com` subdomains with `/portal` in the path → `308` redirect to the canonical app URL so portal session/auth work correctly.

The rewrite path is `app/sites/[domain]` — domain segment is the tenant identifier for public-site rendering.

## The `[siteId]` URL param is NOT authoritative

For routes under `app/portal/websites/[siteId]/**`, the `[siteId]` in the URL is **navigation only**. A portal user may have multiple sites. The route handler must cross-check the param against `getPortalClient(userId)` to verify the user actually owns that site. Trusting the URL alone is a tenancy leak.

## What a tenancy leak looks like

A tenancy leak occurs when:
- A query reads or writes data for a `clientId` that was not verified against the authenticated user.
- A route returns records from all clients instead of filtering by the active client.
- A `[siteId]` param is trusted without membership verification.

Common trigger: forgetting `where(eq(table.clientId, client.id))` in a `db.select().from(table)`.

## The regression gate

After **any** data-access change, run:

```
bun test:tenancy
# alias for: scripts/test.sh --layer=integration --tag=tenancy --no-coverage
```

The tenancy integration suite lives at `tests/integration/api/security/tenancy.test.ts` (and related files under `tests/integration/`). Each test seeds data in tenant B, invokes an endpoint as tenant A, and asserts the response is properly filtered or rejected. These are the load-bearing multi-tenancy regression tests — a failure means a live data-leak regression.

## Rules for new tables

Per `lib/db/CLAUDE.md`:

1. Add `clientId` (and `siteId` if site-scoped) to the new schema module in `lib/db/schema/<domain>.ts`.
2. Import from `@/lib/db/schema` barrel — never import directly from a schema module.
3. Run `bun run db:generate` to emit the migration SQL. **Never hand-edit `drizzle/*.sql`**.
4. Add a tenancy test fixture for the new table in the same PR.

## Related notes

- [[Auth & Roles]] — session types, `getPortalClient` in auth context, impersonation
- [[Sites, Hosting & Publishing]] — how `siteId` maps to provisioned hostnames, DNS, and publishing
