---
type: architecture
domain: platform
status: active
date: 2026-06-09
sources:
  - app/api/portal/tickets/route.ts
  - app/api/portal/clients/route.ts
  - app/portal/CLAUDE.md
  - CLAUDE.md
  - lib/active-client.ts
  - lib/portal-client.ts
  - lib/api/parse-params.ts
---

# API Envelope & Route Patterns

All portal API routes follow a strict three-part contract: NextAuth session auth, tenant resolution via `lib/portal-client.ts`, and a `{ success, data | error }` JSON envelope. Deviating from any part breaks portal client wrappers and violates the architecture invariants.

## The envelope

Every handler under `app/api/portal/**` returns JSON in this shape:

```ts
// Success
{ success: true, data: <payload> }

// Failure
{ success: false, message: string }
```

HTTP status codes follow standard semantics: `200` for success, `401` for unauthenticated, `404` for not-found, `400` for validation errors. The `success` boolean is always present.

Real example from `app/api/portal/tickets/route.ts`:

```ts
// Auth check
const session = await auth();
if (!session?.user?.id)
  return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

// Tenant resolution
const userId = parseInt(session.user.id, 10);
const client = await getPortalClient(userId);
if (!client)
  return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

// Scoped query
const data = await db.select().from(supportTickets)
  .where(eq(supportTickets.clientId, client.id));
return NextResponse.json({ success: true, data });
```

Note: `app/api/portal/clients/route.ts` returns `{ clients, activeClientId }` (a legacy shape predating the envelope convention). New routes must use `{ success, data }`.

## The lockstep: auth → tenant → query → envelope

Every new portal route handler must follow this four-step sequence:

1. **Authenticate** — call `auth()` from `lib/auth`. Check `session?.user?.id`; return `401` on null. Some endpoints also accept bearer tokens via `resolvePortalFromCurrentRequest()` from `lib/mcp-auth.ts` (mobile / API-key callers).
2. **Resolve tenant** — call `getPortalClient(userId)` from `lib/portal-client.ts`. This reads the `sd-active-client` cookie (set by the portal client-switcher) and verifies the user is a member of that client. **Never read `clientId` from a query param or request body** — always derive it from the resolver.
3. **Query with tenant scope** — all reads and writes must filter on `client.id` (and `siteId` where applicable). An unscoped query is a tenancy leak.
4. **Return envelope** — wrap in `{ success: true, data }` or `{ success: false, message }`.

`simplerdev-feature-scaffold` generates this lockstep automatically. Prefer it over hand-rolling.

## Admin routes (`app/api/admin/**`)

Admin routes do **not** scope by tenant. They authenticate with `requireStaffSession()` (role check) but intentionally query across all clients. They use the same `{ success, data | error }` envelope convention where new routes are concerned.

## Public routes (`app/api/public/**` and `app/api/blocks`, etc.)

No session auth. These serve unauthenticated web traffic (public booking, block metadata, previews). They still return JSON but do not follow the tenant-resolver step.

## Common deviations to avoid

| Anti-pattern | Correct approach |
|---|---|
| Reading `clientId` from `req.json()` or `params` | Derive from `getPortalClient(userId)` |
| Returning a raw array `[]` | Wrap: `{ success: true, data: [] }` |
| Omitting the `success` boolean | Always include it |
| Calling `auth()` without checking the return | Guard with `if (!session?.user?.id)` |
| Skipping `getPortalClient` and using `getActiveClientId` alone | `getActiveClientId` only reads the cookie; it does not verify membership. Use `getPortalClient` for auth-bearing routes. |

## Error handling and validation

- Validation errors → `400` + `{ success: false, message: '<field> is required' }`. Validate before touching the DB.
- DB errors → let them bubble to Next.js default error handling (they become 500s); do not swallow.
- Utility `lib/api/parse-params.ts` — shared param-parsing helpers for route handlers.

## Related notes

- [[Route Trees & Audiences]] — which tree an API route belongs to and why
