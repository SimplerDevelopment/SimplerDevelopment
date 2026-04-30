---
name: simplerdev-feature-scaffold
description: Scaffold a new portal-scoped or admin-global CRUD feature in the simplerdevelopment2026 repo. Creates Drizzle schema additions, REST API routes (NextAuth+site-resolver+envelope), e2e helpers, and a Playwright spec matching the repo's canonical patterns. Use when the user says 'scaffold <resource>', 'new CRUD for X', 'add a feature for X', or any request that would otherwise require hand-writing the schema + route + test stack.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# simplerdev-feature-scaffold

Scaffolds a complete CRUD feature in the simplerdevelopment2026 repo following the exact conventions already in place. Do not invent patterns — mirror the portal `categories` resource as the canonical example.

## Repo conventions (these are the constraints — do not deviate)

- **ORM**: Drizzle. Schema is a single file: `lib/db/schema.ts` (~2300 lines). APPEND to it. Never rewrite.
- **DB client**: `import { db } from '@/lib/db'`. Postgres via `postgres-js`.
- **Auth**: `import { auth } from '@/lib/auth'` (NextAuth v5). Session shape: `session.user.id` is a string; cast with `parseInt(session.user.id, 10)`.
- **Site scoping**: Portal resources use `import { resolveClientSite } from '@/lib/portal-client'` — returns `null` if the user can't access that site → respond 404.
- **Response envelope**: `{ success: true, data }` or `{ success: false, message }`. Status 401 unauth, 404 not-found-or-forbidden, 400 validation, 201 created, 500 server error.
- **Validation**: Inline trim+required checks for portal routes (matches existing style). Zod is acceptable for admin-global routes (see `app/api/categories/route.ts`).
- **Tests**: Playwright in `tests/e2e/`. Fixtures in `tests/e2e/setup/fixtures.ts` provide `clientApi`, `adminApi`, `unauthApi`. Helpers in `tests/e2e/setup/helpers.ts` — add a `createTest<Resource>` helper for every new portal resource.
- **Migrations**: `bun run db:generate` (drizzle-kit) — do **not** auto-run `db:migrate` or `db:push`. Stop and tell the user to review the generated SQL.
- **Package manager**: `bun` preferred over `npm`/`yarn`.

## Inputs to collect

Before writing any files, confirm with the user:

1. **Resource name** (singular, camelCase): e.g. `serviceArea`, `invoice`, `ticket`.
2. **Scope** — one of:
   - `portal-site` → scoped to a client website (`/api/portal/cms/websites/[siteId]/<plural>`). **Default.**
   - `portal-client` → scoped to the logged-in client, not a specific website (`/api/portal/<plural>`).
   - `admin-global` → admin-only (`/api/<plural>`).
3. **Fields** (beyond `id`, `createdAt`, `updatedAt`, and the scope FK): list of `name:type[:modifier]`. Supported types: `varchar(N)`, `text`, `integer`, `boolean`, `timestamp`, `numeric`, `json`. Modifiers: `required`, `unique`, `default=X`.
4. **Needs per-id routes?** (`GET/PUT/DELETE /[id]`) — default yes.

If the user provides a terse request (e.g. "scaffold ticket with title/priority/status"), infer reasonable defaults and show them BEFORE generating. One confirmation round, not an interrogation.

## What to generate

For `portal-site` scope with resource `serviceArea` (example), generate exactly these files:

### 1. Schema addition — APPEND to `lib/db/schema.ts`

```ts
export const serviceAreas = pgTable('service_areas', {
  id: serial('id').primaryKey(),
  // <user-defined fields here, in the same style as neighboring tables>
  websiteId: integer('website_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // uniqueIndex(...) only if a field was marked unique
]);
```

Use `Edit` with a unique anchor — append at end of file, after the last `export const`. Do not overwrite.

### 2. List + create route

`app/api/portal/cms/websites/[siteId]/service-areas/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { serviceAreas } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const data = await db
    .select()
    .from(serviceAreas)
    .where(eq(serviceAreas.websiteId, site.id))
    .orderBy(serviceAreas.createdAt);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  // <inline required-field validation here, matching categories/route.ts>

  const [row] = await db.insert(serviceAreas).values({
    // <trimmed fields>
    websiteId: site.id,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
```

### 3. Per-id route (if opted in)

`app/api/portal/cms/websites/[siteId]/service-areas/[id]/route.ts` — GET/PUT/DELETE. Use the same auth + `resolveClientSite` guard. PUT should only update fields present in the body. DELETE returns `{ success: true }`.

Read `app/api/portal/cms/websites/[siteId]/categories/[id]/route.ts` first (if it exists) and mirror it line-for-line; don't reinvent.

### 4. E2E helper — APPEND to `tests/e2e/setup/helpers.ts`

```ts
export async function createTestServiceArea(api: ApiClient, siteId: number, overrides?: Record<string, string>) {
  const res = await api.post(`/api/portal/cms/websites/${siteId}/service-areas`, {
    // <default fields with Date.now() for uniqueness>
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create test service area: ${res.data?.message}`);
  const row = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/service-areas/${row.id}`).catch(() => {});
  };
  return { serviceArea: row, cleanup };
}
```

### 5. Playwright spec

`tests/e2e/portal-cms-service-areas.spec.ts` — mirror `tests/e2e/portal-cms-categories.spec.ts`. Required tests:
- `setup: create test website`
- `GET lists <resource> scoped to website`
- `POST creates a <resource>`
- `POST rejects duplicate <uniqueField>` (only if a unique field exists)
- `POST rejects missing <requiredField>`
- `PUT updates a <resource>` (if per-id route)
- `DELETE removes a <resource>` (if per-id route)
- `rejects access to non-existent website` (GET against site id 999999 → 404)
- `rejects unauthenticated access` (via `unauthApi`)

Use `test.describe.configure({ mode: 'serial' })` and the `cleanups: Array<() => Promise<void>>` pattern from the categories spec.

## Procedure

1. Parse the user's request; fill in the four inputs above. Show the plan (resource name, scope, fields, file list) and get one confirmation.
2. Read the two anchor files (always): `app/api/portal/cms/websites/[siteId]/categories/route.ts` and `tests/e2e/portal-cms-categories.spec.ts`. If `[id]/route.ts` exists for categories, read it too. These are your templates.
3. `Edit` `lib/db/schema.ts` — append the new table. Use a unique anchor (the last `export const` at the very bottom of the file) so the Edit is unambiguous.
4. `Write` the route file(s).
5. `Edit` `tests/e2e/setup/helpers.ts` — append the helper.
6. `Write` the spec file.
7. Run `bun run db:generate` from the repo root. Print the generated migration filename.
8. **STOP.** Do not run `db:migrate`. Report:
   - Files created/modified (with paths).
   - Generated migration path — tell the user to review it before running `bun run db:migrate`.
   - Next steps the skill did **not** do: admin UI page, portal UI page, navigation entry, seeding.

## Scope variants (differences from portal-site)

- **portal-client**: Drop `websiteId` column and `resolveClientSite`. Scope by `session.user.id` (store as `userId` FK to `users`). Route path `/api/portal/<plural>`. Test file `portal-<plural>.spec.ts`.
- **admin-global**: Drop site scoping entirely. Use Zod like `app/api/categories/route.ts` (the non-portal version). Add an admin-role check if `lib/auth` exposes one — check first, don't assume. Route path `/api/<plural>`. Test file `admin-<plural>.spec.ts` and use `adminApi` fixture.

## What this skill is NOT

- Not a UI generator. Admin/portal pages (`app/admin/...`, `app/portal/...`) are out of scope — flag them as next steps.
- Not a migration runner. Generate only; never `db:migrate` or `db:push` without the user.
- Not a framework. If the user wants something non-CRUD (webhook, cron, complex read model), say so and suggest hand-writing instead.

## Failure modes to watch for

- `schema.ts` append clobbering an existing export with the same name → grep first.
- Pluralization edge cases (`category` → `categories`, `tax` → `taxes`) — ask the user for the plural if non-obvious.
- Foreign keys to tables that don't exist yet — halt and ask.
- Drizzle import list missing a type (e.g. `numeric` not in the existing import at the top of schema.ts) → update the import.
