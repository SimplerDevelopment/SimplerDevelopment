---
type: architecture
domain: auth-security
status: active
date: 2026-06-09
sources:
  - lib/auth.ts
  - middleware.ts
  - lib/mcp-auth.ts
  - lib/active-client.ts
  - lib/db/schema/auth.ts
  - types/next-auth.d.ts
  - docs/guides/USER_MANAGEMENT.md
---

# Auth & Roles

How a request is authenticated end-to-end, what roles exist, and what each role can reach.

## End-to-end request flow (session path)

```
Browser request
    │
    ▼
middleware.ts  (matches all routes except _next/static, _next/image, favicon.ico)
    │
    ├─ Non-app hostname? ──► site-resolver → rewrite to /sites/[domain]/[...slug]
    │   (custom domain: → resolveCustomDomain → rewrite to /portal if agency match)
    │
    ├─ /portal/apps/<slug>/* ──► handlePluginRoute()
    │     1. auth() — verify session
    │     2. getPortalClient(userId) — resolve active clientId
    │     3. loadActiveAppBySlug(slug) — plugin registry
    │     4. isClientEntitled(clientId, app) — entitlement gate
    │     5. signPluginJwt(...) — mint 10-min tenancy JWT → sd-plugin-tenant cookie
    │
    └─ App hostname, non-plugin route ──► auth() — NextAuth authorized callback
          │
          ├─ /admin/* (not /admin/login)
          │     • !isLoggedIn → 401 (no redirect — admin flows handle their own login URL)
          │     • role === 'client' → redirect /portal/dashboard
          │     • else → allow
          │
          ├─ /portal/* (not login / forgot-password / reset-password / invite/*)
          │     • !isLoggedIn → redirect /portal/login?callbackUrl=<safe-same-origin-path>
          │     • isLoggedIn → allow
          │
          └─ /portal/login (already logged in) → redirect callbackUrl (safe-validated)
```

`safeCallbackUrl` in `lib/auth.ts` rejects absolute URLs and protocol-relative URLs, ensuring open-redirect is not possible via the `callbackUrl` parameter.

## Session / JWT model

NextAuth v5 uses a **JWT strategy** (no server-side session store).

- Cookie: `__Secure-authjs.session-token` (prod) / `authjs.session-token` (dev)
- Domain: `.simplerdevelopment.com` in production — shared across all subdomains
- Max age: 7 days; idle-refresh: once per 24 hours
- JWT payload additions (see `types/next-auth.d.ts`):
  - `role: string` — stamped at sign-in from `users.role`; refreshed on every DB re-validation
  - `checkedAt?: number` — epoch ms of the last DB re-validation; used to throttle checks

**DB re-validation throttle (in `lib/auth.ts` `jwt` callback):** On every request that carries a token, if `Date.now() - checkedAt > 60_000 ms`, a single indexed PK lookup on `users` checks `active` and re-stamps `role`. Returning `null` from the callback immediately invalidates the session. On transient DB error the existing token is kept (fail-open for availability). Tokens minted before this logic (no `checkedAt`) are re-validated on their very next request.

## Role model

### Global roles (column `users.role` in `lib/db/schema/auth.ts`)

| Role | Default | Access |
|---|---|---|
| `admin` | No | Full access to `/admin/**` and `/portal/**`; can manage all users, clients, and billing |
| `editor` | Yes (DB default) | Access to `/portal/**`; blocked from `/admin/**`; can edit content for assigned clients |
| `employee` | No | Same gate as `editor`; used as a staff sub-role for display and `assertUserVisibleToClient` checks |
| `client` | No | Portal only; explicitly blocked from `/admin` (redirected to `/portal/dashboard`) |

The `authorized` callback in `lib/auth.ts` enforces the admin-tree block at the middleware layer — no route handler needs to repeat the check. Client users cannot reach any `/admin` route regardless of URL manipulation.

### Tenant membership roles (column `clientMembers.role` in `lib/db/schema/sites.ts`)

A user may belong to multiple tenants. `clientMembers` links `users` ↔ `clients` with an inner role (`owner`, `admin`, `member`, `viewer`). This is orthogonal to the global `users.role`:

- `owner` / `admin` — full control within the tenant account
- `member` — standard collaborator access
- `viewer` — read-only within the tenant

`lib/security/assert-owned.ts` uses `clientMembers` to gate FK writes: a user is "visible to a client" if they are a `clientMembers` row for that client OR if their global role is `admin`/`editor`/`employee`.

## Active-client resolution

The active tenant for a portal request is resolved by `lib/active-client.ts` via the `sd-active-client` cookie (set when the user selects a client context in the portal). This is separate from the session JWT — a user can switch clients without re-authenticating. `users.defaultClientId` stores the preferred client for multi-client users and is the fallback when no cookie is present.

## MCP / bearer-token scope model

MCP clients (Claude Desktop, Claude Code, custom agents) authenticate with a bearer token:

```
Authorization: Bearer sd_mcp_<32-byte-hex>    ← portal API key
Authorization: Bearer sd_oauth_<...>           ← OAuth-issued token
```

Both are resolved by `lib/mcp-auth.ts` (`resolvePortalApiKey` / `resolveOAuthToken`) to a `PortalMcpContext`:

```ts
interface PortalMcpContext {
  userId: number;
  client: Client;      // resolved from portalApiKeys.clientId
  scopes: string[];    // from portalApiKeys.scopes
  keyId: number;
}
```

Every tool in `lib/mcp/tools/<domain>.ts` calls `hasScope(ctx.scopes, required)` before executing. Scope format: `resource:action` (`cms:write`, `crm:read`, `projects:*`). Wildcard `"*"` grants all; `resource:*` grants all actions on one resource.

`portalApiKeys.requireCmsApproval` (default `true`) causes CMS-write tools to stage changes into `mcp_pending_changes` rather than applying directly. This is a per-key flag, off by explicit admin opt-out only.

## Where tenancy keys enter the picture

Once `PortalMcpContext.client` is resolved (or `getActiveClientId()` is read from the cookie for session requests), all data access must filter on `clientId`. See the tenancy rule in `.claude/rules/tenancy.md` and [[Tenancy & Site Resolution]].

The `lib/security/assert-owned.ts` helpers enforce ownership of FKs supplied in request bodies — e.g. asserting a `pipelineId` belongs to the active client before a CRM write. These are the last line of defense against cross-tenant writes via mass-assignment.

## Encryption surfaces

Two separate AES-256-GCM key universes (see [[Auth & Security]] for storage format):

| Purpose | Module | Env var |
|---|---|---|
| BYOK AI provider keys (`client_api_keys`) | `lib/crypto/api-key.ts` | `ENCRYPTION_KEY` |
| Workspace tenant OAuth credentials | `lib/crypto/secrets.ts` | `WORKSPACE_TENANT_SECRETS_KEY` |

Password-reset and invite tokens are SHA-256 hashed at rest (`lib/security/token-hash.ts`). The raw token only travels in the email; the DB stores only the hash.

## Related

- [[Auth & Security]] — domain map: entry points, data model, API surface, tests
- [[Tenancy & Site Resolution]] — `clientId`/`siteId` keying, active-client cookie, middleware rewrite
- [[Route Trees & Audiences]] — admin / portal / sites route split and invariants
- [[MCP Server]] — tool registrar pattern, `hasScope`, token-budget rules
