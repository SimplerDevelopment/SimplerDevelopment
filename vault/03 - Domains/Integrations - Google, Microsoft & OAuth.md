---
type: domain-map
domain: integrations
status: active
date: 2026-06-09
sources:
  - lib/google/
  - lib/microsoft/
  - lib/oauth/
---

# Domain: Integrations (Google, Microsoft & OAuth)

## Purpose

Connects tenant users to external identity and collaboration platforms — Google Workspace (Gmail, Drive, Calendar, Contacts) and Microsoft 365 / Teams (transcripts). Also hosts the platform-level OAuth 2.1 authorization server that issues scoped access tokens to MCP clients (Claude.ai, Claude Code, self-service portal API keys). Each surface is independently gated so a tenant can hold only the scopes their plan warrants.

---

## Key Entry Points

| File | Role |
|---|---|
| `lib/google/oauth.ts` | Core Google OAuth helpers: `buildAuthUrl`, `exchangeCode`, `refreshIfExpired`, `revoke`. Two-tier design — SD-owned env creds vs. per-tenant creds. |
| `lib/google/tenant-credentials.ts` | Resolves enterprise-tier per-tenant GCP credentials from `google_workspace_tenant_credentials`; decrypts `oauthClientSecretEncrypted` via `lib/crypto/secrets.ts`. |
| `lib/google/scopes.ts` | Canonical surface enum: `identity | gmail | calendar | drive | contacts`. |
| `lib/google/gmail-watch.ts` | `startGmailWatch` / stop — Pub/Sub subscription management per user mailbox. |
| `lib/google/gmail-history.ts` | History-based incremental Gmail sync (delta from `gmailHistoryId` watermark). |
| `lib/google/gmail-attachments.ts` | Attachment download helpers for Gmail sync. |
| `lib/google/drive-changes.ts` | Drive incremental change polling and push-channel helpers. |
| `lib/google/oauth-state.ts` | CSRF-bound state token for Google OAuth round-trips. |
| `lib/microsoft/oauth.ts` | Microsoft Identity Platform v2.0 OAuth: `buildAuthUrl`, `exchangeCode`, `refreshIfExpired`, `revoke` (no-op — no programmatic MS revocation endpoint). Single SD-owned Azure AD multi-tenant app registration. |
| `lib/microsoft/scopes.ts` | Surface enum: `identity | transcripts`. |
| `lib/microsoft/graph-client.ts` | Raw-fetch Graph API client (no MSAL dependency). |
| `lib/microsoft/transcripts-watch.ts` | Graph change-notification subscription: `createTranscriptsSubscription`, `renewTranscriptsSubscription`, `deleteTranscriptsSubscription`. |
| `lib/microsoft/transcripts-fetch.ts` | Paged transcript fetch with delta-token watermark. |
| `lib/microsoft/transcripts-sync.ts` | Orchestrates full transcript ingestion for one user connection. |
| `lib/microsoft/oauth-state.ts` | CSRF-bound state token for Microsoft OAuth round-trips. |
| `lib/oauth/server.ts` | SD OAuth 2.1 authorization server primitives: `generateAuthCode`, `generateAccessToken`, `generateClientSecret`, `verifyPkceS256`, PKCE, CIMD fetch, redirect-URI validation. |
| `lib/oauth/cimd.ts` | Client ID Metadata Document fetcher (Claude.ai connector discovery). |
| `lib/oauth/scopes.ts` | MCP scope definitions for the SD OAuth server. |
| `lib/crypto/secrets.ts` | AES-256-GCM encrypt/decrypt for `oauthClientSecretEncrypted` in `google_workspace_tenant_credentials`. Key: `WORKSPACE_TENANT_SECRETS_KEY` env var (64 hex chars). |
| `lib/mcp/tools/integrations.ts` | MCP tool registrar: `integrations_list`, `integrations_revoke`. |

---

## Data Model

All tables live in `lib/db/schema/tools.ts` and `lib/db/schema/audit.ts`.

**Google Workspace**

- `google_workspace_client_connections` — one org-level connection per tenant (`clientId` unique). Holds tokens, `gmailHistoryId`, `driveStartPageToken`, `calendarSyncToken`, `contactsSyncToken`, `syncSettings` (aggressiveness, storeBodies). Populated via the legacy `/api/portal/google/callback` route.
- `google_workspace_user_connections` — per-user connection within a tenant. Adds `gmailWatchExpiration`, Drive channel columns (`driveChannelId`, `driveChannelResourceId`, `driveChannelExpiration`, `driveChannelToken`). Unique index on `(clientId, userId)`.
- `google_workspace_tenant_credentials` — enterprise-tier only. One row per client holding their GCP project ID, encrypted OAuth client secret (`oauthClientSecretEncrypted`), `pubsubTopic`, `pubsubVerificationToken` (unique index — used for Pub/Sub webhook routing), `consentScreenUserType`, and `status` (`pending | configured | active | revoked`). Standard-tier tenants have no row.

**Microsoft Teams**

- `microsoft_teams_user_connections` — per-user delegated grant. Fields: `microsoftTenantId`, `microsoftUserId` (oid claim), `microsoftAccountEmail`, tokens, `subscriptionId`, `subscriptionResource`, `subscriptionExpiration`, `subscriptionClientState` (Graph webhook HMAC secret), `deltaToken` watermark. Unique index on `(clientId, userId)` and `subscriptionId`.

**SD OAuth 2.1 Server**

Tables in `lib/db/schema/audit.ts`:
- `oauth_clients` — registered MCP clients. `clientId` (public, `oc_…` prefix), `redirectUris`, `tokenEndpointAuthMethod` (`none` for PKCE-public / `client_secret_basic` / `client_secret_post`), `clientSecretHash` (SHA-256 only; raw secret shown once). `ownerClientId` nullable — null = global admin client, non-null = portal self-service key scoped to one tenant.
- `oauth_authorization_codes` — single-use codes. `codeHash` (SHA-256), `codeChallenge` / `codeChallengeMethod` (PKCE S256), `resource` (RFC 8707 resource indicator for MCP server URL). Expires after one use via `consumedAt`.
- `oauth_access_tokens` — issued bearer tokens (`sd_oauth_…`). `tokenHash`, `tokenPreview`, scoped by `clientId` + `userId`, optional `expiresAt`, `revokedAt`.

---

## API Surface

**Google connect / callback / status / disconnect**

| Route | Method | Purpose |
|---|---|---|
| `app/api/portal/integrations/google/connect/route.ts` | GET | Builds Google authorize URL, writes state, redirects. |
| `app/api/portal/integrations/google/callback/route.ts` | GET | Validates state + CSRF, exchanges code, upserts `google_workspace_user_connections`. |
| `app/api/portal/integrations/google/status/route.ts` | GET | Returns tier + active connection (no tokens). |
| `app/api/portal/integrations/google/disconnect/route.ts` | POST | Best-effort revoke at Google, scrubs tokens, sets `revokedAt`. |
| `app/api/portal/google/callback/route.ts` | GET | Legacy org-level callback (client connection, not user). |

**Microsoft connect / callback / status / disconnect**

| Route | Method | Purpose |
|---|---|---|
| `app/api/portal/integrations/microsoft/connect/route.ts` | GET | Builds Microsoft v2.0 authorize URL with `prompt=consent`. |
| `app/api/portal/integrations/microsoft/callback/route.ts` | GET | Exchanges code, decodes ID-token for oid/tid, upserts `microsoft_teams_user_connections`. |
| `app/api/portal/integrations/microsoft/status/route.ts` | GET | Returns connection row (no tokens). |
| `app/api/portal/integrations/microsoft/disconnect/route.ts` | POST | Marks connection revoked locally (MS has no programmatic revocation). |

**Webhooks / push channels**

| Route | Method | Purpose |
|---|---|---|
| `app/api/google-webhook/pubsub/route.ts` | POST | Receives Gmail Pub/Sub pushes; routes by `pubsubVerificationToken` to tenant. |
| `app/api/google-webhook/drive/route.ts` | POST | Receives Drive push channel notifications; validates `X-Goog-Channel-Token`. |
| `app/api/microsoft-webhook/transcripts/route.ts` | POST | Microsoft Graph change-notification for Teams transcripts; validates `clientState`. |
| `app/api/microsoft-webhook/lifecycle/route.ts` | POST | Graph subscription lifecycle events (reauthorization challenges). |

**Watch-renewal crons** (schedules from `vercel.json`)

| Route | Schedule | Purpose |
|---|---|---|
| `app/api/cron/renew-gmail-watches/route.ts` | `47 3 * * *` | Re-subscribes Gmail watches nearing 7-day expiry. |
| `app/api/cron/renew-drive-watches/route.ts` | `13 4 * * *` | Re-opens Drive push channels nearing expiry (channels can be as short as 1 day). |
| `app/api/cron/renew-microsoft-subscriptions/route.ts` | `*/25 * * * *` | Re-creates Graph subscriptions before the 60-minute hard cap expires. |
| `app/api/cron/drive-sync/route.ts` | `*/10 * * * *` | Polls Drive changes API and queues ingestion for Brain. |

**SD OAuth 2.1 authorization server**

- `app/api/portal/oauth-clients/route.ts` — create / list tenant-owned MCP clients.
- `app/api/portal/oauth-clients/[id]/route.ts` — rotate secret / delete.
- `app/api/portal/integrations/api-keys/route.ts` / `[id]/route.ts` — alternate API-key management surface.
- `app/api/admin/oauth-clients/route.ts` / `[id]/route.ts` — global admin registration (Claude.ai connector).
- `app/api/portal/oauth-tokens/route.ts` — token introspection / revocation endpoint.

**Booking / Calendar OAuth** (auxiliary)

- `app/api/portal/tools/booking/google/auth/route.ts` — initiates Calendar OAuth for booking pages.
- `app/api/portal/tools/booking/google/callback/route.ts` — exchanges code for Calendar token.
- `app/api/portal/tools/booking/google/disconnect/route.ts` — revokes Calendar token.
- `app/api/portal/websites/[siteId]/google/auth/route.ts` — Google Analytics OAuth initiation.
- `app/api/portal/websites/[siteId]/google/analytics/route.ts` — Analytics data fetch.

---

## MCP Tools

Registered in `lib/mcp/tools/integrations.ts` by `registerIntegrationsTools(server, ctx)`:

| Tool name | Scope required | Description |
|---|---|---|
| `integrations_list` | `integrations:read` | Lists connected providers (currently Google only). Returns `tier` (standard/enterprise), `tenantStatus`, and connection metadata without tokens. |
| `integrations_revoke` | `integrations:write` | Disconnects a provider (currently `google` only). Best-effort remote revoke + local token scrub. |

---

## UI Surfaces

| Path | Description |
|---|---|
| `app/portal/settings/integrations/page.tsx` | Primary integrations settings page — Google and Microsoft connect/disconnect UI. |
| `app/portal/integrations/api-keys/page.tsx` | Self-service OAuth client (API key) management — create, list, rotate secret, delete. |
| `app/portal/tools/booking/[id]/_components/SettingsPanel.tsx` | Google Calendar connect button embedded inside booking page settings. |

---

## Tests & Gates

| File | Layer | Coverage |
|---|---|---|
| `tests/integration/api/integrations-oauth.test.ts` | integration `@integrations @oauth @security` | Full connect/callback/status happy + sad paths; CSRF binding, missing code, 409 on standard-tier, 502 on upstream failure. |
| `tests/integration/api/settings/integrations.test.ts` | integration `@integrations @tenancy` | Cross-user and cross-tenant isolation for status + disconnect; token-scrub verification. |
| `tests/integration/api/settings/oauth-clients.test.ts` | integration `@settings @oauth-clients @tenancy` | CRUD on `oauth_clients`; secret shown once, hash stored; cross-tenant 404 guard; GET projection never leaks secret hash. |
| `tests/unit/api-cron-drive-watches-and-ms-lifecycle-routes.test.ts` | unit | Drive watch renewal: auth guards, env fallbacks, connection filtering by scope, token-refresh-on-renew, channel stop-before-restart. |
| `tests/unit/api-cron-renew-ms-subs-route.test.ts` | unit | Microsoft subscription renewal cron. |
| `tests/unit/api-admin-plan-and-google-callback-routes.test.ts` | unit | Admin plan route + legacy Google org-level callback. |
| `tests/integration/api/websites-deployments/google-analytics.test.ts` | integration | Google Analytics OAuth + reporting. |
| `tests/integration/api/booking/zoom-integration.test.ts` | integration | Zoom OAuth token flow (booking tool). |

Run the tenancy gate after any data-access change: `bun test:tenancy`.

---

## Cross-Domain Dependencies

- **Company Brain & AI** — Gmail push notifications trigger history sync; Drive cron polls `drive-changes` and feeds `app/api/portal/brain/drive-sync/route.ts` for embedding ingestion. Meeting transcripts from Microsoft Teams are ingested into the Brain document store.
- **Bookings & Services** — Google Calendar OAuth is a hard dependency for creating and checking calendar availability on booking pages. Zoom OAuth (separate token) powers virtual-meeting booking.
- **Auth & Security** — the SD OAuth 2.1 server (`lib/oauth/`) is the access-token layer for the MCP server. `NextAuth` session establishes identity before `app/api/portal/integrations/*` routes will proceed; session `userId` is baked into the CSRF state token.
- **CRM** — Google Contacts sync (`contacts` surface in `lib/google/scopes.ts`) enriches CRM contact records.

---

## Invariants & Gotchas

- **Two-tier Google model.** Standard-tier tenants have no `google_workspace_tenant_credentials` row. Any code that calls `getTenantWorkspaceCredentialsByClientId` and gets `null` must not fall back to SD's env credentials — it must abort. The design is intentional: silent fallback would cross-contaminate tenants onto SD's own OAuth app.
- **Token refresh must persist.** `refreshIfExpired` (Google) returns an optional `refreshToken`. Callers MUST write it back if present — Google rotates tokens occasionally. Microsoft always rotates; the returned `refresh_token` overwrites the stored one on every refresh.
- **Watch / subscription expiry is short.** Gmail watches expire in ~7 days (daily renewal cron at 03:47). Drive push channels can expire in as little as 1 day (daily at 04:13). Microsoft Graph subscriptions cap at 60 minutes (renewal every 25 minutes). Missing a renewal window means a gap in push coverage until the next cron run — the system falls back to delta polling but may miss events.
- **Pub/Sub routing by `pubsubVerificationToken`.** The Gmail webhook does not carry a clientId. Routing is done by matching `?token=` to `google_workspace_tenant_credentials.pubsub_verification_token` (unique index). A 401/404 on unknown token avoids triggering Pub/Sub retry storms.
- **Drive webhook auth by `X-Goog-Channel-Token`.** Channel token is stored in `google_workspace_user_connections.driveChannelToken`. Webhook handler must validate this header before processing.
- **Microsoft Graph `clientState` validation.** Stored in `microsoft_teams_user_connections.subscriptionClientState`. Graph webhook handler must reject payloads where `clientState` does not match.
- **Encryption at rest.** Only `google_workspace_tenant_credentials.oauth_client_secret_encrypted` is encrypted via AES-256-GCM (`lib/crypto/secrets.ts`, key: `WORKSPACE_TENANT_SECRETS_KEY`). User-level access tokens in `google_workspace_user_connections` and `microsoft_teams_user_connections` are stored plaintext in the DB — they are short-lived (1-hour access tokens) but the refresh tokens are long-lived and currently unencrypted.
- **Microsoft revocation is local-only.** `lib/microsoft/oauth.ts:revoke` is a no-op. Token expiry is the only real invalidation; users must visit Microsoft's consent portal to revoke app access at the source.
- **SD OAuth 2.1 PKCE.** Public clients (default MCP web flow) require S256 PKCE; confidential clients (`client_secret_basic`/`post`) may omit it. The `token_endpoint_auth_method` column controls enforcement in the token endpoint.
- **`ownerClientId` null on global OAuth clients.** Null means the client is admin-registered (e.g., the Claude.ai connector). Non-null means a portal self-service key. Authorization decision code enforces that a portal user can only grant a non-null-owner client if their tenant matches the owner.

---

## Planning Notes

- Microsoft BYO-app credential support (matching Google enterprise tier) is flagged as phase 3+; currently SD owns the single Azure AD app registration for all tenants.
- Drive and Calendar `storeBodies` sync aggressiveness is configurable per connection (`syncSettings.aggressiveness`). The Brain ingestion pipeline respects this flag.
- Refresh tokens in `google_workspace_user_connections` and `microsoft_teams_user_connections` are currently plaintext. A future hardening pass should apply the same AES-256-GCM pattern from `lib/crypto/secrets.ts` to all long-lived tokens.

---

## Related

- [[Company Brain & AI]]
- [[Bookings & Services]]
- [[Auth & Security]]
