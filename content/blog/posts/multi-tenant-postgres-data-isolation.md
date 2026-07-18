---
title: "Multi-Tenant Postgres Isolation with Drizzle ORM"
slug: "multi-tenant-postgres-isolation-drizzle"
description: "How we enforce per-tenant data isolation in a 22-domain Postgres schema using clientId, Drizzle ORM, session-derived identity, and a tenancy regression gate."
date: 2026-06-27
tags:
  - postgres
  - drizzle
  - multi-tenant
  - architecture
  - security
  - nextjs
author: "SimplerDevelopment Team"
draft: true
---

Multi-tenant SaaS on a single Postgres cluster raises one question above all others: how do you guarantee that a request for Tenant A never returns Tenant B's data? The answer sounds simple — filter every query — but the failure modes are subtle enough that we have shipped tenant data leaks in production before our current system existed. This post describes what we built, why we made the choices we did, and the specific footguns that will trip you even when you think you have it right.

---

## The isolation model we chose — and why not RLS

Postgres row-level security (RLS) is the canonical answer to this problem, and for good reason: it enforces isolation at the database layer, so application bugs cannot bypass it. We evaluated it seriously and chose not to use it, for three reasons specific to our stack.

First, RLS requires setting a per-connection role or a session-level configuration parameter (`SET app.current_tenant = ...`) before each query. In a serverless or connection-pooled environment (we use PgBouncer in transaction mode), connection state does not persist between requests. Correctly threading the tenant identity into every pooled connection adds ceremony that is easy to get wrong, and the failure mode — queries running without the RLS policy active — is silent.

Second, our domain logic already knows the tenant. The session carries `clientId` from the moment the request enters the application. Pushing that knowledge down to Postgres via a session parameter means passing the same information twice and trusting that both copies stay in sync.

Third, RLS policies are DDL — they live in the database alongside the schema but are invisible to the ORM. When a developer reads a Drizzle query, they see the application-level filter or they do not. With RLS, a missing application filter looks like a complete query; the bug is invisible until you check the database directly. We want bugs to be visible.

The trade-off is clear: we accept full responsibility for filtering every query in application code, in exchange for filtering logic that lives where domain logic lives, that is visible in code review, and that is testable at the integration layer.

### Two concepts, two identifiers

The tenancy model has exactly two concepts:

| Identifier | Meaning |
|---|---|
| `clientId` | Identifies a **tenant** — the business or organization using the portal |
| `siteId` | Identifies one **website** belonging to a client; one client can have multiple sites |

Every tenant-scoped table in the schema carries `clientId` and/or `siteId` as non-null columns. Every query against those tables must include an explicit equality filter on the relevant identifier. There is no implicit scoping.

### The three audience trees and their isolation contracts

Every route in the application belongs to exactly one of three trees, each with a distinct isolation contract:

**`app/admin/**`** — internal staff panel. Operates across all tenants at once. There is no `clientId` filter unless the page is explicitly doing a cross-tenant view. Every React Server Component in this tree calls `requireStaffSession()` manually — there is no centralized middleware guard, so every new admin page must add it explicitly.

**`app/portal/**`** — per-tenant client UI. `clientId` is always derived from the NextAuth v5 session via `lib/active-client.ts`. It is never read from a URL query parameter. The URL's `[siteId]` segment in `app/portal/websites/[siteId]/**` must be cross-checked against the resolver; trusting the URL alone produces a data leak.

**`app/sites/**` + `app/s/**`** — public site renderer. Tenant identity is resolved from the request `Host` header by the middleware and `lib/sites/host-resolver.ts`. No auth is required for public pages; the renderer reads only published content.

---

## Session-derived identity — the core rule

The single most important rule in the codebase:

> **`clientId` comes from `lib/active-client.ts`, never from a URL query parameter.**

URL parameters can be forged. A request with `?clientId=102` in the query string is just a number typed by whoever made the request. If your handler reads that number and uses it to filter a database query, you have handed every authenticated user the ability to read any tenant's data.

`lib/active-client.ts` derives the active tenant from the NextAuth v5 JWT session cookie. The JWT is `httpOnly`, signed, and cannot be altered by the client. Portal route handlers call `authorizePortal`, which in turn calls `lib/active-client.ts` and returns the verified `clientId`. The result is cached in the request scope — call it once per request, reuse the result.

A typical portal API route looks like this:

```typescript
// app/api/portal/posts/route.ts
import { authorizePortal } from "@/lib/auth/authorize-portal";
import { db } from "@/lib/db";
import { schema } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { clientId } = await authorizePortal(req);

  const posts = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.clientId, clientId));

  return Response.json({ success: true, data: posts });
}
```

The `clientId` in the `.where()` clause is authoritative — it came from the session, not from the request body or URL. The response envelope (`{ success: true, data }` or `{ success: false, error }`) is uniform across all API surfaces.

### The site-resolver middleware path

For the public site renderer, `middleware.ts` performs host routing before any route handler runs:

1. `isPlausibleTenantHost()` short-circuits on obviously invalid hostnames, returning 404 before touching the database.
2. `resolveCustomDomain()` checks whether the host belongs to a portal-style agency white-label and rewrites accordingly.
3. `isKnownSiteHost()` does a database lookup to validate the domain and resolve its tenant.
4. On success, the middleware rewrites the request to `/sites/[domain]/[...slug]` and sets `x-site-domain` and `x-site-pathname` headers for downstream handlers.

The guard in step one is not just a performance optimization — it prevents the database from being used as an oracle for probing valid tenant domains.

---

## Schema layout — one file per domain

The schema lives in `lib/db/schema/`, with one file per domain:

`auth`, `sites`, `cms`, `crm`, `pm`, `brain`, `store`, `email`, `surveys`, `tools`, `billing`, `approvals`, `audit`, `collab`, `trigger-links`, `ab`, `snapshots`, `workflows`, `chat`, `cronHealth`, `agenticOs`, `plugins`

There are two hard rules for working in the schema:

**Import rule:** always import from `@/lib/db/schema`, never from a specific module file like `@/lib/db/schema/cms`. The barrel export ensures that Drizzle sees all relation definitions together. Split imports produce subtle relation-resolution errors.

**Column rule:** every new tenant-scoped table must include `clientId` and/or `siteId` as non-null columns. If a table contains data that belongs to a tenant, it is tenant-scoped, without exception.

### The migration workflow

```
1. Edit   lib/db/schema/<domain>.ts
2. Run    bun run db:generate   → emits drizzle/<NNNN>_*.sql
3. Run    bun run db:migrate    → applies locally; auto-refuses prod URLs
4. Never hand-edit drizzle/*.sql — regenerate instead
```

`db:migrate` checks `DATABASE_URL` against known production URL patterns and aborts if it matches. This guard exists because the failure mode of accidentally migrating against production is catastrophic and not immediately visible.

DDL applied to the database outside of this workflow — a hand-typed `ALTER TABLE` in a psql session, for example — becomes invisible to `drizzle-kit`. The next `db:generate` will re-emit the column as if it does not exist, and the next `db:migrate` will try to add it again. The silent schema drift this creates is much harder to debug than the original inconvenience of using the workflow.

---

## Known footguns

### Correlated subquery interpolation

When writing correlated subqueries in Drizzle's `` sql`...` `` template tag, outer table column references must be hard-coded as `table.column` strings, not interpolated as `${table.col}`:

```typescript
// Wrong — ${outerTable.col} emits an unqualified column name
sql`(SELECT COUNT(*) FROM child WHERE child.parent_id = ${outerTable.id})`

// Correct — hard-code the outer table reference
sql`(SELECT COUNT(*) FROM child WHERE child.parent_id = outer_table.id)`
```

The interpolated form emits an unqualified column name. When the outer table goes out of scope in the query planner, Postgres silently returns 0 instead of an error. This produces incorrect counts with no obvious signal.

### HNSW index on `brain_embeddings`

The `brain_embeddings` table uses a pgvector HNSW index for semantic search. This index is managed outside the Drizzle schema definition via `drizzle/0061_brain_embeddings.sql`. Because `drizzle-kit` does not know about it, running `drizzle-kit push --force` will silently drop the index, degrading semantic search performance without any migration record. Never run `--force` against a database that has real embedding data.

### Timestamp type discipline

All time-tracking and cron-related columns must use `timestamptz`, not bare `timestamp`. A `timestamp` column has no timezone information; comparisons across timezone boundaries produce incorrect results that are difficult to reproduce in development (where the server and developer timezone often match) but surface in production.

### Migration tracker drift

In the current production environment, the Drizzle migration tracker is not in sync with the applied schema. Schema changes have been applied directly to the production database outside the deploy pipeline. Every hand-applied change should be documented with a comment recording what was applied and when, so that future `db:generate` runs can be interpreted correctly.

---

## The tenancy regression test gate

Running `bun test:tenancy` executes the integration tenancy suite — a set of tests specifically targeting cross-tenant data access paths.

**This is mandatory, not optional, after any data-access change.** The gate exists because tenancy leaks have shipped to production before it was in place. The test suite spins up a local Postgres instance (`bun test:integration:local`), seeds two distinct tenant fixtures, and asserts that every tested route and MCP tool handler returns only the requesting tenant's data.

The suite catches three specific failure modes:

1. **Missing `clientId` filter** — a Drizzle query that selects from a tenant-scoped table without an `.where(eq(...clientId, clientId))` clause.
2. **Unvalidated `siteId` URL parameter** — a `[siteId]` route that uses the URL segment directly without cross-checking it against `lib/active-client.ts`.
3. **Unthreaded `clientId` in MCP tool handlers** — a tool handler that calls into the data layer without passing `clientId` through, causing the query to run without a tenant filter.

---

## Common mistakes and how to catch them early

| Mistake | How to catch it |
|---|---|
| Reading `clientId` from `req.query` | Code review; tenancy integration test |
| Forgetting `siteId` cross-check in `[siteId]` routes | `bun test:tenancy` |
| Hand-editing `drizzle/*.sql` | CI diff check — generated files should not show manual edits |
| Running `drizzle-kit push --force` | Avoid; use `bun run db:migrate` only |
| Using bare `timestamp` instead of `timestamptz` | Schema review; integration tests that cross timezone boundaries |
| Skipping `bun test:tenancy` after a data-access change | Pre-push gate + PR checklist |
| New MCP tool handler missing scope guard | MCP baseline test (`tests/unit/mcp-tool-registry-baseline.test.ts`) |

The response envelope contract is part of this picture too. All API surfaces return `{ success: true, data: ... }` or `{ success: false, error: "..." }`. Handlers that throw naked objects produce inconsistent error shapes that break automated clients. Auth failures return 401, missing tenant returns 404, insufficient scope returns 403 — all inside the envelope.

---

## Summary

Application-level tenancy filtering is not simpler than RLS in the sense of requiring less discipline — it requires more. Every developer touching the data layer must know the rules, every query must be audited in code review, and the regression gate must run on every relevant change. What it buys in return is filtering logic that is visible, testable, and co-located with domain logic, without the operational complexity of per-connection session configuration in a pooled environment.

The critical invariants:

- `clientId` comes from `lib/active-client.ts`, not the URL.
- Every tenant-scoped table has `clientId` and/or `siteId`; every query filters on it.
- The `[siteId]` URL segment in portal routes is cross-checked, not trusted.
- `bun run db:migrate` is the only path for schema changes — no hand-edits, no `--force`.
- `bun test:tenancy` runs after every data-access change, without exception.

---

*For the full tenancy invariants and request lifecycle, see the [architecture overview for agents](/docs/agents/architecture-for-agents#4-tenancy-model). For Drizzle setup and the full schema layout, see the [database guide](/docs/guides/DATABASE).*

---

**Ready to build on a platform where multi-tenant isolation is wired in from day one?** SimplerDevelopment ships with the isolation model, the regression gate, and the migration workflow already in place — no RLS configuration required. [Get started →](/)
