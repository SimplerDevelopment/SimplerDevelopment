---
type: domain-map
domain: auth-security
status: active
date: 2026-06-09
sources:
  - lib/auth.ts
  - lib/mcp-auth.ts
  - lib/active-client.ts
  - lib/security/assert-owned.ts
  - lib/security/token-hash.ts
  - lib/security/sanitize-html.ts
  - lib/security/block-allowlist.ts
  - lib/crypto/api-key.ts
  - lib/crypto/secrets.ts
  - lib/db/schema/auth.ts
  - types/next-auth.d.ts
  - middleware.ts
  - docs/guides/USER_MANAGEMENT.md
---

# Domain: Auth & Security

## Purpose

Handles all authentication, session management, role-based access control, API key issuance and validation, at-rest encryption of secrets, and tenant-ownership guards. Coverage floor: **90% lines / 80% functions** on `lib/crypto/**` (per `tests/CI-GATES.md` — every encryption branch matters). The MCP auth path (`lib/mcp-auth.ts`) adds a second bearer-token surface orthogonal to the session cookie path.

## Key entry points

| File | Role |
|---|---|
| `lib/auth.ts` | NextAuth v5 config: Credentials provider, JWT strategy, `authorized` callback, cookie config, 1-min DB re-validation throttle |
| `middleware.ts` | Edge-layer dispatcher: site-resolver, auth guard (`authorized` callback), plugin-proxy JWT mint, dev-CORS headers |
| `lib/mcp-auth.ts` | MCP bearer-token resolution: `resolvePortalApiKey`, `resolveOAuthToken`, `hasScope`, `generatePortalApiKey` |
| `lib/active-client.ts` | `getActiveClientId()` — reads `sd-active-client` cookie to resolve the active tenant for portal requests |
| `lib/security/assert-owned.ts` | Tenant-ownership guards (`assertPipelineInClient`, `assertContactInClient`, `assertUserVisibleToClient`, etc.) — throw `OwnershipError` on FK mass-assignment |
| `lib/security/token-hash.ts` | `hashToken(raw)` — SHA-256 of a 256-bit random token for at-rest storage of password-reset / invite tokens |
| `lib/security/sanitize-html.ts` | HTML sanitization helper for user-supplied content |
| `lib/security/block-allowlist.ts` | Block-type allowlist guard |
| `lib/crypto/api-key.ts` | `encryptApiKey` / `decryptApiKey` / `maskApiKey` — AES-256-GCM BYOK key encryption (env var `ENCRYPTION_KEY`) |
| `lib/crypto/secrets.ts` | `encryptSecret` / `decryptSecret` — AES-256-GCM workspace credential encryption (env var `WORKSPACE_TENANT_SECRETS_KEY`) |
| `app/api/auth/[...nextauth]/` | NextAuth catch-all handler |
| `app/api/portal/invite/` | Invite-token acceptance endpoint |
| `app/api/portal/forgot-password/` | Forgot-password flow (emails a reset link) |
| `app/api/portal/reset-password/` | Reset-password token consumption |
| `app/api/portal/change-password/` | In-session password change |
| `app/api/mcp/route.ts` | MCP bearer-token entry point — resolves `Authorization: Bearer sd_mcp_*` or `sd_oauth_*`, builds tool context |

## Data model

Tables in `lib/db/schema/auth.ts`:

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `email`, `password` (bcrypt), `role`, `active`, `inviteToken`, `passwordResetToken`, `defaultClientId` | Global users; `active=false` triggers immediate session invalidation on next re-validation |
| `apiKeys` | `clientId`, `websiteId`, `key`, `scopes`, `rateLimitPerMinute` | Site-scoped API keys (external consumers of site data) |
| `portalApiKeys` | `clientId`, `userId`, `keyHash`, `keyPreview`, `scopes`, `requireCmsApproval` | MCP bearer keys. `keyHash` is SHA-256 of the raw key. `requireCmsApproval=true` (default) gates CMS writes into `mcp_pending_changes` |
| `userOnboarding` | `userId`, `clientId`, `step`, `answers`, `completedAt` | Wizard state; incomplete blocks portal dashboard redirect |
| `userDashboardPreferences` | `userId`, `clientId`, `prefs` (jsonb) | Per-user widget layout, unique on `(userId, clientId)` |
| `githubConnections` | `userId`, `githubUserId`, `accessToken`, `scope` | GitHub OAuth credential store (one per user) |

`clientMembers` (in `lib/db/schema/sites.ts`): `clientId`, `userId`, `role` (`owner`/`admin`/`member`/`viewer`). Links portal users to tenant accounts; unique on `(clientId, userId)`.

## API surface

| Route | Method | Auth | Notes |
|---|---|---|---|
| `app/api/auth/[...nextauth]/` | POST | — | NextAuth sign-in / sign-out / session |
| `app/api/portal/auth/` | POST | session | Mobile sign-in helper |
| `app/api/portal/invite/` | POST | — | Consume invite token, activate user |
| `app/api/portal/forgot-password/` | POST | — | Email reset link |
| `app/api/portal/reset-password/` | POST | — | Consume `passwordResetToken` |
| `app/api/portal/change-password/` | POST | session | In-session change |
| `app/api/portal/api-keys/` | GET / POST / DELETE | session | Portal MCP key management |
| `app/api/mcp/route.ts` | POST | Bearer token | MCP tool dispatch |
| `app/api/users/route.ts` | GET / POST / PATCH / DELETE | session (admin) | Global user CRUD |

## MCP tools (scope-guard mechanics)

MCP tools are gated by `hasScope(ctx.scopes, required)` in every `tools/<domain>.ts` registrar. The scope format is `resource:action` (e.g. `cms:write`, `crm:read`, `projects:*`). Wildcard `"*"` in granted scopes grants all. `resource:*` grants all actions on a resource.

`portalApiKeys.requireCmsApproval` controls whether CMS-write tools land directly or are staged into `mcp_pending_changes` for staff review. Default is `true` (all new keys are gated). Flipping it off requires an explicit admin action per key.

Two bearer token namespaces exist:
- `sd_mcp_` prefix — portal API keys issued through the portal settings UI
- `sd_oauth_` prefix — OAuth-issued access tokens (see `oauthAccessTokens` table)

Both resolve to a `PortalMcpContext { userId, client, scopes, keyId }` and are treated identically downstream by tool registrars.

## UI surfaces

| Surface | Path | Notes |
|---|---|---|
| Portal login | `app/portal/login/page.tsx` | Default `signIn` page; shared session domain `.simplerdevelopment.com` |
| Portal forgot-password | `app/portal/forgot-password/page.tsx` | Public; no session required |
| Portal reset-password | `app/portal/reset-password/[token]/` | Token in URL, consumed once |
| Portal invite acceptance | `app/portal/invite/` | Public; activates invited user |
| Admin login | `app/admin/login/` | Separate page; `signOut({ callbackUrl: '/admin/login' })` from admin flows |
| Portal API keys | `app/portal/settings/api-keys/` | Issue / revoke `sd_mcp_*` keys, configure scopes |
| Admin user management | `app/admin/users/` | Global user CRUD, role assignment |
| Portal team settings | `app/portal/settings/team/` | `clientMembers` management (invite / remove) |

## Tests & gates

| Suite | File / tag | What it covers |
|---|---|---|
| Unit — auth | `tests/unit/auth.test.ts` | NextAuth callbacks, JWT re-validation, `safeCallbackUrl` |
| Unit — crypto | `tests/unit/crypto/api-key.test.ts` | `encryptApiKey` / `decryptApiKey` / `maskApiKey` round-trips and error branches |
| Unit — crypto | `tests/unit/crypto/secrets.test.ts` | `encryptSecret` / `decryptSecret` round-trips |
| Unit — mcp-auth | `tests/unit/lib-mcp-auth-and-microsoft-oauth-state.test.ts` | `resolvePortalApiKey`, `hasScope`, OAuth token resolution |
| Unit — portal auth | `tests/unit/lib-portal-and-storefront-auth.test.ts` | Portal session + storefront auth helpers |
| Unit — MCP registry | `tests/unit/mcp-tool-registry-baseline.test.ts` | Every tool has a scope guard; tool set is stable |
| Integration — tenancy | tag `tenancy` | Cross-tenant data-access regression; run after any data-access change |

Coverage floor: **90% lines / 80% functions** on `lib/crypto/**` (enforced in `tests/CI-GATES.md`).

## Cross-domain dependencies

- **Tenancy / site resolution** — `lib/active-client.ts` + `middleware.ts` feed `clientId` into every authenticated request; see [[Tenancy & Site Resolution]]
- **MCP server** — `lib/mcp/server.ts` consumes `PortalMcpContext` from `lib/mcp-auth.ts`; see [[MCP Server]]
- **Google Workspace / OAuth** — `oauthAccessTokens` table; `sd_oauth_` tokens from the OAuth server (`lib/oauth-server`) share the same `resolveOAuthToken` path
- **Billing** — `portalApiKeys.requireCmsApproval` interacts with the approvals workflow; see [[Billing & Stripe]]
- **Plugins** — `lib/plugins/jwt.ts` mints short-lived tenancy JWTs for the plugin iframe handoff; separate from the session JWT

## Invariants & gotchas

- **JWT is stateless; active checks are throttled, not per-request.** A deleted/deactivated user keeps a valid session for up to 60 seconds (`REVALIDATE_MS`). The throttle is intentional (avoids a DB hit on every request); fail-open on transient DB errors preserves availability.
- **Session cookie is shared across all `*.simplerdevelopment.com` subdomains.** Cookie name is `__Secure-authjs.session-token` in production, `authjs.session-token` in dev. Portal paths on a client subdomain are 308-redirected to the canonical app domain so auth stays correct.
- **Two separate AES-256-GCM key universes.** `ENCRYPTION_KEY` (BYOK AI keys in `client_api_keys`) and `WORKSPACE_TENANT_SECRETS_KEY` (workspace OAuth credentials). They must never share a key material.
- **Password-reset and invite tokens are SHA-256 hashed at rest** (`lib/security/token-hash.ts`). Raw token only travels in the email link; DB stores only the hash.
- **`client` role users are blocked from `/admin`** in the `authorized` callback — they are redirected to `/portal/dashboard`. Admin routes require `admin` or `editor` role.
- **MCP CMS writes default to staged approval.** `requireCmsApproval=true` is the safe default on all new `portalApiKeys` rows. Bypassing this is an explicit per-key opt-out by an admin.
- **Host header validation before tenant rewrite** (`isPlausibleTenantHost`). Rejects raw IPs, hostnames without a dot, and labels with invalid characters. A fuller DB-lookup fix is tracked as Wave 3.

## Planning notes

- Wave 3: move middleware to Node runtime to enable DB lookup of the Host header against `clientSites` / `clientWebsites` (currently not Edge-safe; tracked in `middleware.ts` comment on `isPlausibleTenantHost`).
- OAuth server (`lib/oauth-server`) and `oauthAccessTokens` scope is partially documented; deeper coverage warranted if OAuth client management is extended.

## Related

- [[Auth & Roles]] — architecture note: end-to-end request authentication flow
- [[Tenancy & Site Resolution]] — how `clientId` is resolved and enforced
- [[MCP Server]] — tool registrar pattern, scope guards
- [[Route Trees & Audiences]] — admin / portal / sites route split
