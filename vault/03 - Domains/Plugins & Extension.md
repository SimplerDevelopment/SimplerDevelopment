---
type: domain-map
domain: plugins-extension
status: active
date: 2026-06-10
sources:
  - lib/db/schema/plugins.ts
  - lib/plugins/jwt.ts
  - lib/plugins/kms.ts
  - lib/plugins/manifest.ts
  - lib/plugins/manifest-schema.ts
  - lib/plugins/proxy.ts
  - lib/plugins/entitlement.ts
  - lib/plugins/callback-auth.ts
  - lib/plugins/load-user-apps.ts
  - lib/plugins/rate-limit.ts
  - lib/plugins/handlers/postcaptain-tools/brain.ts
  - lib/plugins/handlers/postcaptain-tools/briefs.ts
  - lib/plugins/handlers/postcaptain-tools/dispatch.ts
  - lib/plugins/handlers/postcaptain-tools/jobs.ts
  - lib/plugins/handlers/postcaptain-tools/runner.ts
  - lib/plugins/handlers/postcaptain-tools/complete.ts
  - lib/plugins/handlers/postcaptain-tools/competitor-brain.ts
  - lib/plugins/handlers/postcaptain-tools/scripts.ts
  - lib/plugins/handlers/postcaptain-tools/drafts.ts
  - lib/plugins/handlers/postcaptain-tools/schedule.ts
  - lib/plugins/handlers/postcaptain-tools/fire-due-jobs.ts
  - lib/plugins/handlers/postcaptain-tools/cron-auth.ts
  - lib/plugins/handlers/registry.ts
  - lib/extension/extract.ts
  - lib/extension/with-auth.ts
  - extension/src/popup/App.tsx
  - extension/src/sidepanel/App.tsx
  - extension/vite.config.ts
  - extension/tsconfig.json
  - .planning/plugin-registry-spec.md
  - app/portal/apps/page.tsx
  - app/portal/apps/[appId]/layout.tsx
  - app/portal/apps/[appId]/[[...slug]]/page.tsx
  - app/api/portal/plugins/scripts/route.ts
  - app/api/plugin-callback/[appId]/[...path]/route.ts
  - app/api/cron/plugin-jobs-tick/route.ts
  - app/api/cron/plugin-runs-drain/route.ts
  - app/api/extension/v1/extract/route.ts
  - app/api/extension/v1/auth/
  - app/api/extension/v1/crm/
  - app/api/extension/v1/notes/route.ts
  - app/api/extension/v1/notes/related/route.ts
  - app/api/extension/v1/search/route.ts
  - app/api/extension/v1/tags/route.ts
  - app/api/extension/v1/tasks/route.ts
  - app/api/extension/v1/activity/
  - tests/unit/plugins-jwt.test.ts
  - tests/unit/plugins-kms.test.ts
  - tests/unit/plugins-callback-auth.test.ts
  - tests/unit/plugins-manifest.test.ts
  - tests/unit/plugins-dispatch.test.ts
  - tests/unit/plugins-runner.test.ts
  - tests/unit/plugins-manifest-schema.test.ts
  - tests/unit/plugins-schedule.test.ts
  - tests/integration/api/plugins/tenancy.test.ts
  - tests/e2e/plugin-postcaptain-tools.spec.ts
---

# Domain: Plugins & Extension

## Purpose

Two distinct but related extension mechanisms for the SimplerDevelopment platform:

**Plugins (Registered Apps)** — a federation layer that lets independently-deployed Next.js applications ("plugins") embed inside the portal under `/portal/apps/<slug>/*`. The portal proxies requests to the remote plugin origin, injecting a short-lived HMAC-SHA256 JWT (delivered as the `sd-plugin-tenant` cookie for the iframe flow; as an `x-sd-tenant` header for cron dispatch calls) that carries tenant identity and scopes. Plugins call back to `/api/plugin-callback/<appId>/<route>` using the same JWT. The portal remains the source of truth for auth, billing/entitlement, nav, and audit. The first and current canonical plugin is **Postcaptain Tools** (content research briefs + AI blog drafts).

**Browser Extension** — a standalone Vite + React browser extension (MV3) in the `extension/` directory. It is self-contained and intentionally excluded from the main Next.js `tsconfig.json`. The extension lets users capture web page context, create CRM contacts/companies, log activity, and write Brain notes from any browser tab, authenticated via a separate `/api/extension/v1/` REST surface. AI extraction is handled server-side by `lib/extension/extract.ts` using Claude Haiku.

## Key entry points

| Path | Role |
|---|---|
| `lib/db/schema/plugins.ts` | All plugin DB tables: `registeredApps`, `registeredAppSigningKeys`, `registeredAppCallbacksAudit`, `registeredAppRuns`, `registeredAppJobs`, `postcaptainBriefs`, `postcaptainDrafts` |
| `lib/plugins/jwt.ts` | `signPluginJwt` / `verifyPluginJwt` — HS256 JWT mint+verify with in-memory secret cache |
| `lib/plugins/kms.ts` | AES-256-GCM encrypt/decrypt for HMAC secrets; keyed by `PORTAL_KMS_KEY` env var |
| `lib/plugins/manifest.ts` | `fetchAndCacheManifest` — fetch+validate `sd-manifest.json`, 60s cache, stale-on-error fallback |
| `lib/plugins/manifest-schema.ts` | Zod schema for the manifest wire format |
| `lib/plugins/proxy.ts` | `loadActiveAppBySlug`, `isClientEntitled`, `buildProxyUrl` — used by `middleware.ts` |
| `lib/plugins/callback-auth.ts` | Callback JWT verification + JTI replay dedup against `registeredAppCallbacksAudit` |
| `lib/plugins/entitlement.ts` | Entitlement helpers for `visibility` model enforcement |
| `lib/plugins/load-user-apps.ts` | Per-request loader: which installed apps should appear in portal nav |
| `lib/plugins/rate-limit.ts` | Per-plugin rate limiting primitives for callback routes |
| `lib/plugins/handlers/postcaptain-tools/dispatch.ts` | Run dispatcher for Postcaptain Tools jobs |
| `lib/plugins/handlers/postcaptain-tools/runner.ts` | Execution lifecycle: `enqueueRun` / `executeRun` / `drainQueuedRuns` — CAS-based queue management for plugin runs |
| `lib/plugins/handlers/postcaptain-tools/complete.ts` | Worker completion callback; requires `postcaptain:internal:complete` scope; persists results and triggers downstream ingestion |
| `lib/plugins/handlers/postcaptain-tools/competitor-brain.ts` | Brain ingestion for completed competitor-research runs: writes `brain_notes` + drops `kanban_card_comments` on vulnerability score changes |
| `lib/plugins/handlers/postcaptain-tools/brain.ts` | Callback handler for GET `/brain/scraped-urls` — returns already-ingested source URLs for a competitor domain so the plugin can skip re-scraping (scope: `postcaptain:internal:brain:read`) |
| `lib/plugins/handlers/postcaptain-tools/briefs.ts` | Brief generation and storage handler |
| `lib/plugins/handlers/postcaptain-tools/jobs.ts` | Scheduled job management for Postcaptain |
| `lib/plugins/handlers/postcaptain-tools/scripts.ts` | Handlers for `/scripts/run` POST and `/scripts/runs` GET |
| `lib/plugins/handlers/postcaptain-tools/drafts.ts` | `/drafts` endpoint handlers |
| `lib/plugins/handlers/postcaptain-tools/schedule.ts` | `nextRunAt` computation for scheduled jobs |
| `lib/plugins/handlers/postcaptain-tools/fire-due-jobs.ts` | CAS job firing for the tick cron |
| `lib/plugins/handlers/postcaptain-tools/cron-auth.ts` | Shared Vercel `CRON_SECRET` auth check used by cron routes |
| `lib/plugins/handlers/registry.ts` | Handler registry and route dispatcher |
| `lib/extension/extract.ts` | AI page extraction (Claude Haiku) + CRM entity resolution, tenant-scoped |
| `lib/extension/with-auth.ts` | Auth middleware for extension API routes |
| `extension/vite.config.ts` | Standalone Vite build config for the browser extension |
| `extension/tsconfig.json` | Separate tsconfig — extension is excluded from the main project tsconfig |
| `.planning/plugin-registry-spec.md` | Full architecture spec: JWT contract, manifest contract, trust model, scope vocabulary (archive; cite as source of truth for protocol decisions) |

## Data model

All tables in `lib/db/schema/plugins.ts`:

- `registered_apps` — one row per installable plugin. `slug` is the unique identifier. `status` (`draft`|`active`|`disabled`) gates JWT minting. `visibility` (`allowlist`|`entitled`|`global`) drives entitlement. `defaultScopes` is the max scope set the plugin can claim. `billingServiceId` → `services` (nullable; used by `entitled` visibility mode).
- `registered_app_signing_keys` — rotatable HMAC keys per plugin. `secretEncrypted` is AES-GCM ciphertext (keyed by `PORTAL_KMS_KEY`); raw secret is never persisted. `kid` in the JWT header selects the key for verification. `status`: `active` (mint+verify) | `retiring` (verify only) | `revoked` (blocked).
- `registered_app_callbacks_audit` — every cross-origin callback. `jti` has a `UNIQUE` constraint for replay dedup: a conflict on insert = 409 replay rejection. Uses `bigserial` for high-volume audit logs.
- `registered_app_runs` — execution log + work queue. `status` lifecycle: `queued` → `running` → `succeeded`|`failed`|`cancelled`. `resultId` cross-references `postcaptain_briefs` or `postcaptain_drafts` via `kind` discriminator. `logTail` capped at 64 KB.
- `registered_app_jobs` — recurring schedules. Two modes: weekly (`dayOfWeek` + `timeUtc`) or cron (`cronExpr`, 5-field UTC). `nextRunAt` is bumped by the tick cron after each dispatch.
- `postcaptain_briefs` — research brief output. `body` is markdown; `sources` are web-search citations. `meta.vulnerability` carries competitor-research scoring (`HIGH`|`MED`|`LOW` + dimension breakdown).
- `postcaptain_drafts` — AI-generated blog post drafts. `status`: `draft`|`published-elsewhere`.

## API surface

**Plugin proxy / portal embedding:**

| Endpoint | Purpose |
|---|---|
| `app/portal/apps/[appId]/[[...slug]]/page.tsx` | Portal page that hosts the plugin iframe proxy |
| `app/api/portal/plugins/scripts/route.ts` | Returns the flat (plugin, script) pair list for the active client — powers the automation builder "Run a plugin script" picker |
| `app/api/plugin-callback/[appId]/[...path]/route.ts` | Inbound plugin callbacks — JWT-verified, JTI-deduped, tenant-re-checked |

**Cron workers:**

| Endpoint | Purpose |
|---|---|
| `app/api/cron/plugin-jobs-tick/route.ts` | Per-minute scheduler: CAS-claims `registered_app_jobs` where `enabled=true AND nextRunAt<=now()`, enqueues runs |
| `app/api/cron/plugin-runs-drain/route.ts` | Per-minute drain: CAS-claims `queued` runs, dispatches to the registered handler, transitions status |

**Browser Extension REST API (`/api/extension/v1/`):**

| Route | Purpose |
|---|---|
| `app/api/extension/v1/auth/` (`test/` probe route) | Token exchange / session check |
| `app/api/extension/v1/extract/route.ts` | AI page extraction via `lib/extension/extract.ts` |
| `app/api/extension/v1/crm/` (`companies/`, `contacts/`, `deals/`) | CRM contact/company creation from page context |
| `app/api/extension/v1/notes/route.ts` | Create Brain notes from captured page content |
| `app/api/extension/v1/notes/related/route.ts` | Duplicate-save detection: returns exact + same-origin Brain note matches for a URL; powers the extension popup badge |
| `app/api/extension/v1/search/route.ts` | Cross-domain search (CRM + Brain) |
| `app/api/extension/v1/tags/route.ts` | Tag management |
| `app/api/extension/v1/tasks/route.ts` | Task creation from page context |
| `app/api/extension/v1/activity/` (`recent/`) | Activity log entries |
| `app/api/extension/v1/related-records/route.ts` | Related CRM/Brain entity lookup |

## MCP tools

No dedicated MCP tool registrar for the plugins domain itself. Plugin execution is triggered via the `registered_app_runs` queue (REST + cron), not via MCP. Postcaptain Tools exposes its own MCP surface from within the plugin's remote origin.

## UI surfaces

**Portal:**
- `app/portal/apps/page.tsx` — installed apps gallery / directory
- `app/portal/apps/[appId]/layout.tsx` — per-app shell layout (loads manifest nav, injects JWT)
- `app/portal/apps/[appId]/[[...slug]]/page.tsx` — catch-all proxy page rendering the plugin iframe

**Browser Extension (`extension/` — standalone Vite project):**
- `extension/src/popup/App.tsx` — popup UI (quick capture, auth status)
- `extension/src/sidepanel/App.tsx` — side panel UI (full CRM/Brain interaction)
- `extension/src/background/service-worker.ts` — MV3 service worker
- `extension/src/content/content-script.ts` — single content script for page extraction (injected into tabs)
- `extension/src/options/` — options/settings page
- `extension/src/manifest.ts` — MV3 manifest builder consumed by `extension/vite.config.ts`
- `extension/src/lib/` — shared extension utilities: `api.ts` (typed fetch wrapper), `messages.ts` (cross-context message types), `page-extract.ts` (client-side extraction helpers), `storage.ts`, `types.ts`

## Tests & gates

| File | Layer | Coverage |
|---|---|---|
| `tests/unit/plugins-jwt.test.ts` | unit | `signPluginJwt`, `verifyPluginJwt`, algorithm rejection, replay dedup shape |
| `tests/unit/plugins-kms.test.ts` | unit | AES-GCM round-trip, PORTAL_KMS_KEY enforcement, dev-fallback warning |
| `tests/unit/plugins-callback-auth.test.ts` | unit | Callback JWT verification path |
| `tests/unit/plugins-manifest.test.ts` | unit | Manifest fetch, cache, stale-on-error, id-mismatch, scope-superset |
| `tests/unit/plugins-manifest-schema.test.ts` | unit | Zod manifest schema validation |
| `tests/unit/plugins-dispatch.test.ts` | unit | Run dispatcher logic |
| `tests/unit/plugins-runner.test.ts` | unit | Run execution lifecycle |
| `tests/unit/plugins-schedule.test.ts` | unit | Job scheduling and `nextRunAt` computation |
| `tests/unit/plugins-competitor-brain.test.ts` | unit | Competitor research brain handler |
| `tests/integration/api/plugins/tenancy.test.ts` | integration | Cross-tenant data isolation |
| `tests/e2e/plugin-postcaptain-tools.spec.ts` | e2e | End-to-end Postcaptain Tools golden path |

Run `bun test:tenancy` after any change to `lib/db/schema/plugins.ts` or the callback/run tables.

## Cross-domain dependencies

- **[[Auth & Security]]** — Plugin JWT signing/verification builds on NextAuth session resolution (`lib/extension/with-auth.ts`). `PORTAL_KMS_KEY` is a required production secret alongside `NEXTAUTH_SECRET`. The extension API routes use the same session model as the portal.
- **[[Company Brain & AI]]** — `lib/extension/extract.ts` calls `searchBrain` and `resolveClientApiKey` (BYOK support). Postcaptain's `competitor-brain.ts` writes ingested competitor-research results into `brain_notes`; `brain.ts` is the read-only dedup helper for that pipeline.
- **[[CRM]]** — Extension API creates CRM contacts/companies/activity directly. Postcaptain competitor research writes to `postcaptain_briefs` which references `clients`.
- **[[Billing & Stripe]]** — Plugin entitlement with `visibility: 'entitled'` checks `client_services` → `services`; `billingServiceId` on the plugin row links to the Stripe product gate.
- **[[Automations & Workflows]]** — `registeredAppJobs` uses `cron-parser` (same library as `lib/automation/schedule.ts`) for cron expression evaluation.

## Invariants & gotchas

- **`PORTAL_KMS_KEY` is required in production.** `lib/plugins/kms.ts` hard-fails on startup if the env var is absent and `NODE_ENV === 'production'`. The dev fallback (32 zero bytes) must never reach a deployed environment.
- **JWT TTL is 60 seconds (callback/cron path); iframe cookie is session-bounded.** The portal mints the JWT as a 60-second token for cron dispatch callbacks (carried in the `x-sd-tenant` header by `dispatch.ts`). For the iframe proxy flow, `middleware.ts` sets the JWT as the `sd-plugin-tenant` cookie scoped to the apex domain — its effective lifetime is bounded by the next page load, not the 60-second callback TTL. The plugin echoes back the SAME token for callback verification. Do not increase the callback TTL without reviewing the threat model in `.planning/plugin-registry-spec.md`.
- **JTI uniqueness is the replay dedup gate.** The `registered_app_callbacks_audit.jti` column has a `UNIQUE` constraint. A plugin that retries a callback with the same JWT will receive a 409. Plugins must re-request a fresh JWT for each retry.
- **Manifest scope check is a subset gate.** `manifest.requiredScopes` must be covered by `registered_apps.defaultScopes`. A plugin cannot escalate by listing additional scopes in its manifest — the portal rejects the manifest entirely with `scope-superset`. The `isScopeCovered` function in `lib/plugins/manifest.ts` handles wildcard scopes (e.g. `foo:bar:*`).
- **The extension is excluded from the main tsconfig.** `extension/tsconfig.json` is a completely separate TypeScript project. Do not import from `extension/` in the main Next.js app or vice versa.
- **Plugin rows with `status != 'active'` do not receive JWTs.** `lib/plugins/proxy.ts` (`loadActiveAppBySlug`) returns `null` for `draft` or `disabled` rows, and the middleware will 404 the proxy route.
- **`registeredAppCallbacksAudit` uses `bigserial`.** Audit volume can grow large; do not add unindexed full-table queries. Existing indexes cover `(appId, clientId)` and `ts`.
- **Cron workers use CAS (Compare-And-Swap) for concurrency safety.** Both tick and drain routes update `status` conditionally to avoid double-firing when multiple serverless instances run simultaneously.

## Planning notes

The plugin system was designed to support Postcaptain Tools as the first tenant. The architecture was specified in `.planning/plugin-registry-spec.md` (archive — skim for contract details, not for current status). Iframes were chosen over module federation (build-time coupling) or top-level routing (blast radius). The browser extension was built as a companion tool to the portal's CRM and Company Brain features, not as a plugin host itself. It communicates with a dedicated `/api/extension/v1/` REST surface rather than the portal MCP endpoint.

## Related

- [[Auth & Security]]
- [[Company Brain & AI]]
- [[CRM]]
- [[Billing & Stripe]]
- [[Automations & Workflows]]
- [[Bookings & Services]]
