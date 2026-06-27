# Outline: Multi-Tenant Data Isolation in Postgres + Drizzle

---

## Meta

**SEO title:** Multi-Tenant Postgres Isolation with Drizzle ORM
**Meta description:** How we enforce per-tenant data isolation in a 22-domain Postgres schema using clientId, Drizzle ORM, session-derived identity, and a tenancy regression gate.
**URL slug:** `multi-tenant-postgres-isolation-drizzle`
**Target audience:** Backend engineers building multi-tenant SaaS on Postgres; Drizzle ORM users; developers migrating from row-level security to application-level isolation.
**Primary keywords:** multi-tenant Postgres isolation, Drizzle ORM tenancy, clientId siteId
**Secondary keywords:** NextAuth session, site resolver, tenancy regression test, data leak prevention

---

## Outline

### H2: The isolation model we chose — and why not RLS

- Three tenancy concepts: `clientId` (the business/tenant), `siteId` (one website within a tenant — one client can have multiple sites).
- Why application-level filtering over Postgres row-level security: simpler deployment, no per-connection role juggling, and filtering logic lives where the domain logic lives.
- The invariant: every tenant-scoped table carries `clientId` and/or `siteId`; every query must filter on it. Cross-tenant data leaks have shipped in production before — this is not theoretical.

#### H3: The three audience trees and their isolation contracts

- `app/admin/**` — internal staff; operates across **all** tenants. No `clientId` filter unless explicitly cross-tenant viewing. Every page calls `requireStaffSession()` manually.
- `app/portal/**` — per-tenant client UI. `clientId` always derived from the session via `lib/active-client.ts`. Never from a URL query param.
- `app/sites/**` — public site renderer. Tenant resolved from the request `Host` header via `lib/sites/host-resolver.ts`.

### H2: Session-derived identity — the core rule

- Rule: `clientId` comes from `lib/active-client.ts`, **never** from a URL query parameter. URL params can be forged.
- `lib/active-client.ts` is called once per request; result is cached in the request scope.
- Portal handlers call `authorizePortal` which calls `lib/active-client.ts` and derives `clientId` from the NextAuth v5 JWT session cookie.
- For `app/portal/websites/[siteId]/**`: the URL's `[siteId]` must be cross-checked against the resolver — trusting the URL alone causes a data leak.

#### H3: The site-resolver middleware path

- `middleware.ts` performs host routing: if the request host is not the app hostname, `resolveCustomDomain()` maps it to a tenant, then `isKnownSiteHost()` does a DB lookup.
- `x-site-domain` and `x-site-pathname` headers are set for downstream handlers.
- The guard `isPlausibleTenantHost()` short-circuits on obviously invalid hostnames (returns 404) before touching the DB.

### H2: Schema layout — one file per domain

- `lib/db/schema/` holds one file per domain: `auth`, `sites`, `cms`, `crm`, `pm`, `brain`, `store`, `email`, `surveys`, `tools`, `billing`, `approvals`, `audit`, `collab`, `trigger-links`, `ab`, `snapshots`, `workflows`, `chat`, `cronHealth`, `agenticOs`, `plugins`.
- Import rule: always `import from '@/lib/db/schema'` — never from a specific module file. This prevents split-import footguns.
- Every new tenant-scoped table: add `clientId` and/or `siteId` columns with non-null constraints.

#### H3: The migration workflow

```
1. Edit   lib/db/schema/<domain>.ts
2. Run    bun run db:generate   → emits drizzle/<NNNN>_*.sql
3. Run    bun run db:migrate    → applies locally; auto-refuses prod URLs
4. Never hand-edit drizzle/*.sql — regenerate instead
```

- Why "auto-refuses prod URLs": `db:migrate` checks `DATABASE_URL` against known production patterns and aborts.
- DDL hand-applied outside this workflow becomes invisible to Drizzle and creates silent schema drift.

### H2: Known footguns

#### H3: Correlated subquery interpolation

- In `` sql`...` `` correlated subqueries, hard-code `table.column` for outer table references.
- `${table.col}` interpolation emits an **unqualified** column name — silently returns 0 when the outer table goes out of scope.

#### H3: HNSW index on brain_embeddings

- Managed via `drizzle/0061_brain_embeddings.sql` — outside the Drizzle schema definition.
- `drizzle-kit push --force` silently drops the index. Never run `--force` against a database with real brain/embedding data.

#### H3: Timestamp type discipline

- All time-tracking and cron columns must be `timestamptz`, not `timestamp`. Using bare `timestamp` produces incorrect comparisons across timezone boundaries.

#### H3: Migration tracker drift

- In production, the Drizzle migration tracker is out of sync with the applied schema. Schema changes are hand-applied against the production database outside the deploy pipeline. Document every hand-apply with a comment.

### H2: The tenancy regression test gate

- `bun test:tenancy` runs the integration tenancy suite — a suite of tests specifically targeting cross-tenant data access paths.
- **Run this after any data-access change.** This is mandatory, not optional — tenancy leaks have shipped to production before this gate existed.
- The suite spins up a local test DB (`bun test:integration:local`) and seeds two tenant fixtures, then asserts that Tenant A cannot read Tenant B's records across every tested route and tool.

#### H3: What the test catches

- Missing `clientId` filter in a Drizzle query.
- `siteId` URL param accepted without cross-check against the resolver.
- MCP tool handlers that don't thread `clientId` into the data layer call.

### H2: Response envelope and error contract

- All API surfaces return `{ success: true, data: ... }` or `{ success: false, error: "..." }`.
- Never throw naked objects from a route handler. Naked throws produce inconsistent error shapes that break clients.
- Auth failures: 401 with envelope. Missing tenant: 404. Scope insufficient: 403.

### H2: Common mistakes and how to catch them early

| Mistake | Catch with |
|---|---|
| Reading `clientId` from `req.query` | Code review + tenancy test |
| Forgetting `siteId` cross-check in `[siteId]` routes | `bun test:tenancy` |
| Hand-editing `drizzle/*.sql` | CI diff check (generated files should not show manual edits) |
| Running `drizzle-kit push --force` | Avoid; use `db:migrate` only |
| Skipping `bun test:tenancy` after a data-access change | Pre-push gate + PR checklist |

---

## Key code / concepts to show

- `authorizePortal` call pattern in a portal route handler
- `lib/active-client.ts` return shape (`clientId`, `siteId`, validation logic sketch)
- Drizzle query snippet: `.where(eq(schema.posts.clientId, clientId))` — explicit filter on every query
- Schema file structure in `lib/db/schema/` — `clientId` column convention
- `bun test:tenancy` command and what a passing run looks like

---

## Internal links

- `/docs/agents/architecture-for-agents` — tenancy model section
- `/docs/guides/DATABASE` — Drizzle setup guide
- Feature page: Auth & Security (`vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` §17)

---

## CTA

**Primary:** "Try SimplerDevelopment — multi-tenant isolation built in from day one. No RLS configuration required."
**Secondary:** Link to `/docs/agents/architecture-for-agents#4-tenancy-model` for the full tenancy invariants.

---

## Screenshot / GIF requirements

1. Diagram: Three route trees (admin / portal / sites) with their isolation contracts side-by-side.
2. Diagram: Session → `active-client.ts` → `clientId` → Drizzle query → filtered result flow.
3. Screenshot: `bun test:tenancy` passing run in terminal (two tenant fixtures, cross-tenant assertions).
4. No fabricated error rates or leak counts.
