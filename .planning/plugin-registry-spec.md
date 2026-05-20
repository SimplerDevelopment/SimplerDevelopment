# Plugin Registry — In-repo spec

> **Source of truth for the plugin/remote-app architecture.** Worker agents executing the rollout MUST read this file plus `~/.claude/plans/optimized-shimmying-turtle.md` (the implementation plan). The plan file owns dispatch + phasing; this file owns the long-lived contracts (manifest schema, JWT claims, callback envelope, scope vocabulary, threat model).

## What this is

A way to plug **independently-deployed Next.js applications** ("plugins") into the SimplerDevelopment portal under `/portal/apps/<id>/*`, with the same drop-in feel that block types have in the CMS. Each plugin:

- Lives in its own git repo, deployed to its own origin
- Publishes a manifest at `<host>/sd-manifest.json`
- Is reachable inside the portal via reverse-proxy
- Receives tenancy via a short-lived signed JWT (`x-sd-tenant` header)
- Calls back to the portal's `/api/plugin-callback/<id>/<route>` using that same JWT

The portal stays the source of truth for: auth, billing/entitlement, nav, audit, run history. The plugin owns: its own UI, its own deploy pipeline, its own version cadence.

## Why

Federation lets us:

1. Build client-specific tooling (like Postcaptain Tools — the first plugin) without bloating the portal route tree
2. Iterate plugin code on a separate Vercel project — different release cadence, different surface, smaller blast radius
3. Eventually open the contract for third-party authors

Iframes were rejected (deep-linking broken, postMessage tax). Module federation rejected (build-time coupling defeats the point).

## Trust model (read this carefully)

- **Portal mints; plugin verifies.** Plugins never sign tokens. The portal owns the signing keys.
- **One token, two directions.** The JWT in `x-sd-tenant` (portal→plugin) is the SAME token the plugin sends back as `Authorization: Bearer …` on callbacks. TTL is **60 seconds** to bound replay.
- **HMAC-SHA256, per-app rotated keys.** Each `registered_apps` row has 1+ `registered_app_signing_keys`; one is `active`, others `retiring` (valid for verify until TTL), or `revoked`. Rotation = insert new active, mark old retiring, drop after retirement window.
- **Tenancy is double-checked.** JWT claims (`clientId`, `siteId`, `scopes`) are validated; THEN the portal callback handler re-loads the client row, re-checks `clientServices`, and re-checks `allowed_client_ids`. JWT alone never grants authority.
- **No ambient credentials cross-origin.** The proxy strips `Cookie` and `Authorization` before forwarding to the plugin. Plugin uses ONLY the JWT.
- **CSRF n/a.** Callbacks are cross-origin with JWT-only auth. Portal additionally validates `Origin` matches `app.host_url` origin.

## JWT contract

```ts
interface PluginJwtHeader {
  alg: 'HS256';
  typ: 'JWT';
  kid: string;   // signing key id; portal looks up secret by kid for verify
}

interface PluginJwtClaims {
  iss: 'simplerdev-portal';
  aud: string;           // app.slug
  sub: string;           // userId stringified
  clientId: number;
  siteId: number | null;
  scopes: string[];      // from app.default_scopes ∩ user's actual grants
  jti: string;           // crypto.randomUUID() — recorded in audit for replay dedup
  iat: number;           // unix seconds
  exp: number;           // iat + 60
}
```

**Verification MUST**:
- Reject `alg: none` and any non-HS256 algorithm
- Look up signing key by `kid`; reject if status is `revoked`
- Verify `iss === 'simplerdev-portal'`
- Verify `aud` matches the expected app slug
- Verify `exp > now`
- For callbacks: insert `jti` into `registered_app_callbacks_audit` with `UNIQUE(jti)` → conflict means replay → 409

## Manifest contract

Served by the plugin at `<host_url>/sd-manifest.json`. Zod-validated by `lib/plugins/manifest.ts`.

```ts
{
  id: string,                      // MUST equal registered_apps.slug
  version: string,                 // SemVer
  nav: Array<{
    label: string,
    href: string,                  // MUST start with /
    icon: string,                  // material icon name
    keywords?: string[],           // for portal cmd-k palette
  }>,
  requiredScopes: string[],        // MUST be subset of registered_apps.default_scopes
  callbacks: Array<{
    method: 'GET'|'POST'|'PATCH'|'DELETE',
    path: string,                  // '/scripts/run'
    scope: string,                 // required scope for this callback
  }>,
  publishedAt: string,             // ISO-8601 timestamp
}
```

**Portal MUST**:
- Cache for 60 seconds (in-memory LRU keyed by `appId`)
- On fetch failure, fall back to last cached value with `stale: true` annotation
- Reject if `manifest.id !== app.slug`
- Reject if `manifest.requiredScopes ⊄ app.defaultScopes`

## Scope vocabulary

Scope format: `<namespace>:<resource>:<action>`. Wildcard suffix `*` allowed (e.g. `postcaptain:research:*` covers `read` + `write`).

Scopes are declared on `registered_apps.defaultScopes`; the JWT mint takes intersection with the user's actual grants (today: any user with active `clientServices` row gets full plugin grants — this can tighten later via a per-user scope grants table).

**v1 scopes** for the `postcaptain-tools` plugin:

| Scope | Grants |
|---|---|
| `postcaptain:research:read` | List/get briefs, drafts, jobs, runs |
| `postcaptain:research:write` | Trigger runs, create/edit jobs, edit drafts |

## Callback envelope

All `/api/plugin-callback/<appId>/<path>` responses use the portal's standard envelope:

```ts
{ success: true, data: T }
| { success: false, error: { code: string, message: string, details?: unknown } }
```

Error codes: `unauthorized`, `forbidden`, `not_found`, `replay`, `rate_limited`, `validation_error`, `internal_error`, `plugin_disabled`.

## Rate limiting

Sliding window: 30 requests/min per `(appId, clientId)` on the callback surface. Reuses the existing rate-limiter in `lib/api-key-middleware.ts`. Excess → 429.

## Schema overview

See `lib/db/schema/plugins.ts` for the canonical types. Six tables:

1. **`registered_apps`** — one row per plugin (slug, hostUrl, manifestUrl, defaultScopes, billingServiceId, visibility, allowedClientIds, status)
2. **`registered_app_signing_keys`** — rotatable HMAC keys (kid, secretEncrypted via AES-GCM, algo, status)
3. **`registered_app_callbacks_audit`** — every callback persisted (jti unique, appId, clientId, userId, route, method, status, requestId, ts)
4. **`registered_app_runs`** — execution log (kind, args, status, startedAt, finishedAt, logTail, errorSummary, resultId)
5. **`registered_app_jobs`** — weekly schedule (dayOfWeek, timeUtc, enabled, nextRunAt, lastRunAt)
6. **`postcaptain_briefs`** + **`postcaptain_drafts`** — plugin-specific result tables (cross-referenced from runs.resultId via kind discriminator)

## Entitlement model

Plugins reuse the existing `services`/`client_services` infrastructure:

- A `services` row with `category='plugins'` is inserted per plugin (price=0 for now; Stripe-billable later)
- A `client_services` row grants that service to a specific tenant
- Layout at `app/portal/apps/[appId]/layout.tsx` mirrors `app/portal/email/layout.tsx` for the gate

`registered_apps.visibility` controls who's eligible:
- `allowlist` — only clients in `allowedClientIds`
- `entitled` — anyone with active `clientServices` row joining to `billingServiceId`
- `global` — all authenticated tenants (admin-controlled)

## Operational notes

- **Signing key storage**: plaintext secret never persisted. Encrypted with AES-GCM using `PORTAL_KMS_KEY` env var, stored in `secretEncrypted`. On rotation, both old (retiring) and new (active) keys are valid for verify; mint only uses active.
- **Cron registration**: two new entries in `vercel.json`:
  - `/api/cron/plugin-jobs-tick` every minute — fires due schedules
  - `/api/cron/plugin-runs-drain` every minute — drains queued runs
- **Long-running runs**: research/draft calls take 30-60s. Worker function `executeRun` keeps the run row in `running` state for the duration; the drain cron is idempotent (skips runs already `running`).
- **Log redaction**: before persisting `logTail`, strip patterns matching JWT, Anthropic API key (`sk-ant-…`), bearer tokens, and any env var value. Cap to 64 KB.

## Out of scope for v1

See plan file `~/.claude/plans/optimized-shimmying-turtle.md` § "Out of scope for v1". Notable deferred: multi-plugin support, cron expressions (only weekly day+time), vault sync, admin UI, streaming logs, plugin-to-plugin auth, Stripe billing for plugins, module federation.

## References

- Plan + multi-agent dispatch: `~/.claude/plans/optimized-shimmying-turtle.md`
- Existing entitlement layout to mirror: `app/portal/email/layout.tsx`
- Existing rate-limit pattern: `lib/api-key-middleware.ts`
- Existing portal-nav structure: `lib/portal-nav.ts`
- Postcaptain client id: `103` (Post Captain Consulting)
- Plugin slug for v1: `postcaptain-tools`
- Plugin host (prod target): `postcaptain-tools.simplerdevelopment.com`
