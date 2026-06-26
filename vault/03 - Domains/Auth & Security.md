---
type: domain-map
domain: auth-security
status: active
date: 2026-06-25
sources:
  - lib/auth.ts
  - lib/mcp-auth.ts
  - lib/active-client.ts
  - lib/security/assert-owned.ts
  - lib/security/rate-limit.ts
  - lib/security/token-hash.ts
  - lib/security/sanitize-html.ts
  - lib/security/block-allowlist.ts
  - lib/crypto/api-key.ts
  - lib/crypto/secrets.ts
  - lib/db/schema/auth.ts
  - lib/db/schema/audit.ts
  - lib/oauth/server.ts
  - lib/oauth/scopes.ts
  - lib/oauth/cimd.ts
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
| `app/oauth/token/route.ts` | OAuth 2.1 token endpoint (RFC 6749) — exchanges auth codes for `sd_oauth_*` access tokens |
| `app/oauth/register/route.ts` | Dynamic Client Registration (RFC 7591) — issues `oauth_clients` records |
| `app/oauth/authorize/page.tsx` + `app/oauth/authorize/decision/route.ts` | User consent screen + decision POST |
| `app/.well-known/oauth-authorization-server/route.ts` | RFC 8414 authorization server metadata discovery |
| `app/.well-known/oauth-protected-resource/route.ts` | Protected resource metadata |
| `app/.well-known/openid-configuration/route.ts` | OpenID Connect discovery document |
| `lib/oauth/server.ts` | OAuth 2.1 server core logic (code generation, token exchange, PKCE validation) |
| `lib/oauth/scopes.ts` | Scope definitions and helpers |
| `lib/oauth/cimd.ts` | Client identity and metadata helpers |
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

### OAuth 2.1 server tables (`lib/db/schema/audit.ts`)

| Table | Key columns | Notes |
|---|---|---|
| `oauthClients` | `clientId` (public `oc_…` identifier), `redirectUris`, `tokenEndpointAuthMethod`, `clientSecretHash`, `ownerClientId` | `tokenEndpointAuthMethod='none'` for PKCE-only public clients (default MCP web case); `ownerClientId` scopes self-service portal clients to a single tenant; NULL = global/admin-minted client |
| `oauthAuthorizationCodes` | `codeHash` (SHA-256, single-use), `oauthClientId`, `userId`, `clientId`, `scopes`, `codeChallenge`, `codeChallengeMethod`, `resource` | RFC 7636 PKCE required for public clients; S256 only; `resource` is the RFC 8707 resource indicator (MCP server URL) |
| `oauthAccessTokens` | `tokenHash` (SHA-256 of `sd_oauth_…` raw token), `tokenPreview`, `oauthClientId`, `userId`, `clientId`, `scopes`, `revokedAt` | Only the hash is stored; raw token surfaces once at issuance |

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
| `app/api/portal/oauth-clients/route.ts` | GET / POST | session | Portal self-service OAuth client list/create |
| `app/api/portal/oauth-clients/[id]/route.ts` | GET / PATCH / DELETE | session | Portal self-service OAuth client read/update/delete |
| `app/api/portal/oauth-tokens/route.ts` | GET / DELETE | session | List and revoke issued OAuth access tokens |
| `app/api/portal/impersonate/status/route.ts` | GET | session (admin) | Check active admin impersonation session |
| `app/api/portal/impersonate/stop/route.ts` | POST | session (admin) | End admin impersonation session |
| `app/api/admin/oauth-clients/route.ts` | GET / POST | session (admin) | Admin OAuth client list/create |
| `app/api/admin/oauth-clients/[id]/route.ts` | GET / PATCH / DELETE | session (admin) | Admin OAuth client read/update/delete |
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
| Portal reset-password | `app/portal/reset-password/page.tsx` | Token arrives as query param (`?token=`), consumed once |
| Portal invite acceptance | `app/portal/invite/[token]/` | Public; activates invited user; token in URL segment |
| Admin login | `app/admin/login/` | Separate page; `signOut({ callbackUrl: '/admin/login' })` from admin flows |
| Portal API keys | `app/portal/settings/api-keys/` | Issue / revoke `sd_mcp_*` keys, configure scopes |
| Admin user management | `app/admin/users/` | Global user CRUD, role assignment |
| Portal team settings | `app/portal/settings/team/` | `clientMembers` management (invite / remove) |
| OAuth consent screen | `app/oauth/authorize/page.tsx` | Public load; session required for the decision POST; shown when a third-party client (e.g. Claude.ai) requests portal access |
| Admin OAuth clients | `app/admin/oauth-clients/page.tsx` | Admin-only; lists and manages registered OAuth client registrations |

## Rate limiting

`lib/security/rate-limit.ts` (134 lines) exposes two helpers:

- `checkRateLimit(key, limit, windowMs): Promise<boolean>` — returns `false` → caller should return 429. Backed by `@upstash/ratelimit` sliding-window algorithm via `@upstash/redis` (HTTP). A module-level `Map` memoizes one `Ratelimit` instance per distinct `(limit, windowMs)` pair.
- `getClientIp(req): string` — extracts the real client IP from `X-Forwarded-For` / `X-Real-IP`.

**Endpoints covered** (all `await checkRateLimit(...)` calls):

| Endpoint | Key pattern | Limit |
|---|---|---|
| `lib/auth.ts` credentials login | `{ip}:login` | 10 / 15 min |
| `app/api/auth/signup/route.ts` | `{ip}:signup` | 5 / 1 hour |
| `app/api/portal/auth/mobile-sign-in/route.ts` | `{ip}:mobile-sign-in` | 10 / 15 min |
| `app/api/portal/forgot-password/route.ts` | `{ip}:forgot-password` | 5 / 15 min |
| `app/api/portal/reset-password/route.ts` | `{ip}:reset-password` | 5 / 15 min |
| `app/api/portal/change-password/route.ts` | `{ip}:change-password` | 5 / 15 min |
| `app/api/portal/invite/accept/route.ts` | `{ip}:invite-accept` | 10 / 15 min |
| `app/api/surveys/[slug]/route.ts` | `{ip}:survey-submit` | 20 / 1 min |
| `app/oauth/token/route.ts` | `{ip}:oauth-token` | 30 / 15 min |

**Fail-open:** a 1-second `Promise.race` wraps the Upstash call. On timeout or error the helper logs `console.warn` and returns `true` (allow). When `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent the client constructor throws and the same fail-open path triggers — no hard availability dependency.

**Bypasses:** `DISABLE_AUTH_RATE_LIMIT=1` env var OR `NODE_ENV=test` skips all checks (used in `tests/unit/lib/rate-limit.test.ts`).

See [[ADR rate-limit-upstash-redis]] for the decision record (Upstash vs Railway Redis, fail-open rationale, no `Retry-After` header, preserved call signature).

## Tests & gates

| Suite | File / tag | What it covers |
|---|---|---|
| Unit — auth | `tests/unit/auth.test.ts` | NextAuth callbacks, JWT re-validation, `safeCallbackUrl` |
| Unit — rate-limit | `tests/unit/lib/rate-limit.test.ts` | In-memory enforcement + fail-open on Upstash error |
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
- **Google Workspace / OAuth** — `oauthAccessTokens` table; `sd_oauth_` tokens from the OAuth server (`lib/oauth/server.ts`) share the same `resolveOAuthToken` path
- **Billing** — `portalApiKeys.requireCmsApproval` interacts with the approvals workflow; see [[Billing & Stripe]]
- **Plugins** — `lib/plugins/jwt.ts` mints short-lived tenancy JWTs for the plugin iframe handoff; separate from the session JWT

## Invariants & gotchas

- **JWT is stateless; active checks are throttled, not per-request.** A deleted/deactivated user keeps a valid session for up to 60 seconds (`REVALIDATE_MS`). The throttle is intentional (avoids a DB hit on every request); fail-open on transient DB errors preserves availability.
- **Session cookie is shared across all `*.simplerdevelopment.com` subdomains.** Cookie name is `__Secure-authjs.session-token` in production, `authjs.session-token` in dev. Portal paths on a client subdomain are 308-redirected to the canonical app domain so auth stays correct.
- **Two separate AES-256-GCM key universes.** `ENCRYPTION_KEY` (BYOK AI keys in `client_api_keys`) and `WORKSPACE_TENANT_SECRETS_KEY` (workspace OAuth credentials). They must never share a key material.
- **Password-reset and invite tokens are SHA-256 hashed at rest** (`lib/security/token-hash.ts`). Raw token only travels in the email link; DB stores only the hash.
- **`client` role users are blocked from `/admin`** in the `authorized` callback — they are redirected to `/portal/dashboard`. Admin routes require `admin` or `editor` role.
- **MCP CMS writes default to staged approval.** `requireCmsApproval=true` is the safe default on all new `portalApiKeys` rows. Bypassing this is an explicit per-key opt-out by an admin.
- **Every credential-mutating endpoint must call `await checkRateLimit(...)`** (enforced by `.claude/rules/auth-surface.md`). The limiter is Upstash Redis (HTTP, serverless-safe) with a 1-second fail-open fallback — see [[ADR rate-limit-upstash-redis]]. Adding a new auth/password/token endpoint without wiring the limiter is a security regression.
- **Host header validation before tenant rewrite** (`isPlausibleTenantHost`). Rejects raw IPs, hostnames without a dot, and labels with invalid characters. A fuller DB-lookup fix is tracked as Wave 3.

## Planning notes

- Wave 3: move middleware to Node runtime to enable DB lookup of the Host header against `clientSites` / `clientWebsites` (currently not Edge-safe; tracked in `middleware.ts` comment on `isPlausibleTenantHost`).
- OAuth 2.1 server (`lib/oauth/server.ts`) is fully shipped: token, register, authorize/consent, and `.well-known` discovery endpoints are all live. See Key entry points section for the full route list.

## Related

- [[Auth & Roles]] — architecture note: end-to-end request authentication flow
- [[Tenancy & Site Resolution]] — how `clientId` is resolved and enforced
- [[MCP Server]] — tool registrar pattern, scope guards
- [[Route Trees & Audiences]] — admin / portal / sites route split
