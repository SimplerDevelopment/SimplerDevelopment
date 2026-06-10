---
type: domain-map
domain: sites-hosting
status: active
date: 2026-06-10
sources:
  - lib/sites/
  - lib/publishing/
  - lib/db/schema/sites.ts
  - lib/mcp/tools/cms.ts
  - lib/mcp/tools/hosting.ts
  - app/api/portal/websites/[siteId]/google/
  - app/api/portal/hosting/[id]/route.ts
  - app/api/portal/websites/[siteId]/branding-profile/route.ts
  - app/api/portal/publishing/permissions/route.ts
  - lib/publishing/active-client.ts
---

# Domain: Sites, Hosting & Publishing

## Purpose

Manages per-tenant client websites from infrastructure provisioning through public rendering. Covers three related concerns:

- **Sites** — the `clientWebsites` record, domain resolution, subdomain/custom-domain routing, public rendering, site-tracking scripts, branding, navigation, and custom CSS/JS.
- **Hosting** — `hostedSites` (Railway-backed managed apps) and `websiteEnvironments`/`websiteEnvVars` (Vercel-backed CMS sites), HTTP request logging.
- **Publishing** — the multi-channel content-publishing workflow (kanban board + campaigns + permissions). Distinct from CMS post authoring; publishing governs the staging-and-release pipeline.

## Key entry points

| Concern | Entry point |
|---|---|
| Custom-domain request routing | `middleware.ts` (lines 153–234) |
| Site resolution by domain | `lib/actions/client-sites.ts` `getClientWebsiteByDomain()` |
| Site render root layout | `app/sites/[domain]/layout.tsx` |
| Catchall page renderer | `app/sites/[domain]/[[...slug]]/page.tsx` |
| Portal site management | `app/portal/websites/[siteId]/` |
| Portal hosting list | `app/portal/hosting/` |
| Portal publishing board | `app/portal/publishing/` |
| Snapshot export/import | `lib/snapshots/export.ts`, `lib/snapshots/import.ts` |
| Site-tracking providers | `lib/site-tracking/providers.ts` |
| Publish-side helpers | `lib/sites/publish-nav.ts`, `lib/sites/publish-custom-code.ts`, `lib/sites/publish-block-template.ts` |
| Publishing permission check | `lib/publishing/permissions.ts` |
| Publishing constants/stages | `lib/publishing/constants.ts` |
| Website provisioner | `lib/website-provisioner.ts` |
| Request-scoped cache | `lib/site-data-cache.ts` |
| Portal session tenant identity | `lib/active-client.ts` |
| Publishing tenant resolution | `lib/publishing/active-client.ts` |

## Data model

All tables defined in `lib/db/schema/sites.ts` unless noted.

| Table | Key columns | Notes |
|---|---|---|
| `client_websites` | `clientId`, `domain`, `subdomain`, `active`, `publicAccess`, `previewCode`, `customLayout`, `deploymentStatus`, `draftCustomCss/Js` | Primary site record. Draft CSS/JS staged here; `publicAccess=false` gates the public site. |
| `website_domains` | `websiteId`, `domain`, `isPrimary`, `status` | Multiple custom domains per site; `status` pending/verified/failed. |
| `website_environments` | `websiteId`, `name`, `vercelTarget` | production + staging rows per site. |
| `website_env_vars` | `environmentId`, `key`, `value`, `syncedToVercel` | Per-environment env vars. |
| `website_backups` | `environmentId`, `snapshot` | Point-in-time backup of env vars + branding + nav + store settings. |
| `hosted_sites` | `clientId`, `railwayProjectId`, `railwayServiceId`, `customDomain`, `status`, `dnsInstructions` | Railway-backed managed app hosting. |
| `http_request_logs` | `websiteId`, `method`, `path`, `statusCode`, `duration` | Traffic logs ingested from client-site middleware via `logApiKey`. |
| `site_tracking` | `websiteId`, `gaMeasurementId`, `gtmContainerId`, `metaPixelId`, `enabled`, `customHeadHtml` | 1:1 with `client_websites`; analytics + verification IDs. |
| `site_navigation` | `websiteId`, `label`, `href`, `parentId`, `sortOrder`, `draft` | Per-item draft overlay; `draft` JSON staged until nav-publish. |
| `site_branding` | `websiteId`, `logoUrl`, `primaryColor`, `navTemplate`, `typography`, `buttonStyle`, `darkMode` | Brand tokens 1:1 with site. |
| `site_snapshots` (`lib/db/schema/snapshots.ts`) | `clientId`, `sourceSiteId`, `payload`, `version`, `isPublic` | Portable export of blocks + posts + nav + custom code. |
| `publishing_campaigns` (`lib/db/schema/publishing.ts`) | `clientId`, `name`, `slug`, `color`, `status` | Cross-channel content groupings. |
| `publishing_permissions` (`lib/db/schema/publishing.ts`) | `clientId`, `userId`, `permissionKey` | Per-user stage-transition and card-action grants. |

## API surface

| Route | Method(s) | Purpose |
|---|---|---|
| `app/api/portal/sites/[siteId]/export/route.ts` | GET | Download site snapshot JSON |
| `app/api/portal/snapshots/route.ts` | GET, POST | List / create snapshots |
| `app/api/portal/snapshots/[id]/route.ts` | GET, DELETE | Single snapshot |
| `app/api/portal/snapshots/[id]/import/route.ts` | POST | Import snapshot into a site |
| `app/api/portal/snapshots/[id]/download/route.ts` | GET | Download snapshot payload |
| `app/api/portal/websites/[siteId]/domains/route.ts` | GET, POST | Custom domains for a site |
| `app/api/portal/websites/[siteId]/domains/[domainId]/route.ts` | PATCH, DELETE | Update / remove a domain |
| `app/api/portal/websites/[siteId]/domains/[domainId]/verify/route.ts` | POST | Trigger DNS verification |
| `app/api/portal/websites/[siteId]/navigation/route.ts` | GET, POST, PATCH, DELETE | Nav item CRUD |
| `app/api/portal/websites/[siteId]/navigation/publish-all/route.ts` | POST | Publish all staged nav drafts |
| `app/api/portal/websites/[siteId]/navigation/[itemId]/publish/route.ts` | POST | Publish a single nav item draft |
| `app/api/portal/websites/[siteId]/branding/route.ts` | GET, PATCH | Site branding tokens |
| `app/api/portal/websites/[siteId]/branding-profile/route.ts` | GET, PATCH | Branding profile (agency overrides) |
| `app/api/portal/websites/[siteId]/google/auth/route.ts` | GET, POST | Google OAuth initiation for property linking |
| `app/api/portal/websites/[siteId]/google/status/route.ts` | GET | Google connection status |
| `app/api/portal/websites/[siteId]/google/disconnect/route.ts` | POST | Disconnect Google property |
| `app/api/portal/websites/[siteId]/google/analytics/route.ts` | GET | Google Analytics property info |
| `app/api/portal/websites/[siteId]/google/analytics/report/route.ts` | GET | Google Analytics report data |
| `app/api/portal/websites/[siteId]/google/search-console/route.ts` | GET | Google Search Console data |
| `app/api/portal/websites/[siteId]/status/route.ts` | GET | Deployment status |
| `app/api/portal/websites/[siteId]/provision/route.ts` | POST | Trigger Vercel provisioning |
| `app/api/portal/websites/[siteId]/deployments/route.ts` | GET | Deployment history |
| `app/api/portal/websites/[siteId]/logs/route.ts` | GET | HTTP request logs |
| `app/api/portal/websites/[siteId]/environments/route.ts` | GET, POST | Environments list/create; per-env CRUD lives at `environments/[envId]/vars/`, `environments/[envId]/backup/`, `environments/[envId]/restore/`, `environments/[envId]/sync/`, `environments/[envId]/copy/` |
| `app/api/portal/websites/[siteId]/api-keys/route.ts` | GET, POST | Log-ingestion API keys |
| `app/api/portal/websites/[siteId]/api-keys/[keyId]/route.ts` | DELETE | Remove a single log-ingestion API key |
| `app/api/portal/hosting/route.ts` | GET, POST | Railway hosted sites |
| `app/api/portal/hosting/[id]/route.ts` | GET, PATCH, DELETE | Single hosted-site detail |
| `app/api/portal/publishing/campaigns/route.ts` | GET, POST | Campaigns |
| `app/api/portal/publishing/campaigns/[id]/route.ts` | PATCH, DELETE | Campaign mutations |
| `app/api/portal/publishing/permissions/route.ts` | GET | List publishing permissions |
| `app/api/portal/publishing/permissions/grant/route.ts` | POST | Grant a publishing permission |
| `app/api/portal/publishing/permissions/revoke/route.ts` | POST | Revoke a publishing permission |
| `app/api/portal/publishing/calendar/route.ts` | GET | Calendar view data |
| `app/api/portal/publishing/channels/email/route.ts` | POST | Email channel dispatch |
| `app/api/sites/[siteId]/navigation/route.ts` | GET | Public site navigation for client-side rendering |
| `app/api/sites/unlock/route.ts` | POST | Redeem preview access code |
| `app/api/public/websites/[siteId]/posts/route.ts` | GET | Public website listing |

## MCP tools

Hosting tools: `lib/mcp/tools/hosting.ts`. Site/Nav/Domain/EnvVar tools: `lib/mcp/tools/cms.ts`.

**Hosting tools** (scope `hosting:read`; provisioning is not exposed to MCP credentials):

| Tool name | Description |
|---|---|
| `hosting_list` | List Railway-hosted app sites filtered by optional status |
| `hosting_get` | Full detail for a single hosted site including DNS instructions |

**Site, navigation, domain, and env-var tools** (from `lib/mcp/tools/cms.ts`):

| Tool name | Description |
|---|---|
| `sites_list` | List client websites |
| `sites_update` | Update site settings (does not expose `previewCode`) |
| `sites_get_custom_code` | Retrieve draft custom CSS/JS for a site |
| `sites_update_custom_code` | Write draft custom CSS/JS (staged; not live until published) |
| `sites_publish_custom_code` | Publish staged custom CSS/JS to live columns |
| `nav_list` | List navigation items for a site |
| `nav_create` | Create a navigation item |
| `nav_update` | Update a navigation item |
| `nav_delete` | Delete a navigation item |
| `nav_publish` | Publish a single nav item draft to live |
| `nav_publish_all` | Publish all staged nav drafts for a site |
| `website_domains_list` | List custom domains for a site |
| `website_domains_add` | Add a custom domain |
| `website_domains_remove` | Remove a custom domain |
| `website_env_vars_list` | List environment variables for a site environment |
| `website_env_vars_set` | Set an environment variable |
| `website_env_vars_delete` | Delete an environment variable |

## UI surfaces

| Surface | Path |
|---|---|
| Website list | `app/portal/websites/` |
| New site creation | `app/portal/websites/new` |
| Website settings | `app/portal/websites/[siteId]/settings/` |
| Branding editor | `app/portal/websites/[siteId]/branding/` |
| Navigation editor | `app/portal/websites/[siteId]/navigation/` |
| Custom code editor | `app/portal/websites/[siteId]/code/` |
| Per-site content calendar | `app/portal/websites/[siteId]/calendar/` |
| Content types | `app/portal/websites/[siteId]/content-types/` |
| Taxonomy management | `app/portal/websites/[siteId]/taxonomy/` |
| Post detail | `app/portal/websites/[siteId]/posts/[postId]/` |
| Visual post editor | `app/portal/websites/[siteId]/posts/[postId]/edit/` |
| Hosting list | `app/portal/hosting/` |
| Hosting detail | `app/portal/hosting/[id]/` |
| Publishing board | `app/portal/publishing/board/` |
| Publishing calendar | `app/portal/publishing/calendar/` |
| Publishing campaigns | `app/portal/publishing/campaigns/` |
| Publishing permissions | `app/portal/publishing/permissions/` |
| Publishing tags | `app/portal/publishing/tags/` |
| Snapshots | `app/portal/snapshots/` |
| Admin: portal websites | `app/admin/portal-websites/` |
| Admin: portal hosting | `app/admin/portal-hosting/` |
| Public site render root | `app/sites/[domain]/` |
| Survey/short-link render | `app/s/[slug]/` |

## Tests & gates

| File | Layer | Coverage |
|---|---|---|
| `tests/unit/middleware-custom-domain.test.ts` | unit | Middleware domain rewrite logic |
| `tests/unit/agency-custom-domain.test.ts` | unit | White-label portal domain resolution |
| `tests/unit/api-portal-agency-custom-domain-route.test.ts` | unit | Custom domain route handler |
| `tests/unit/normalize-domain.test.ts` | unit | Domain normalization helpers |
| `tests/unit/lib-sites-publish-nav.test.ts` | unit | Nav draft publish helper |
| `tests/unit/snapshots-export-import.test.ts` | unit | Snapshot round-trip |
| `tests/unit/snapshots-import.test.ts` | unit | Snapshot import edge cases |
| `tests/unit/app-portal-snapshots-page.test.tsx` | unit | Snapshots portal page |
| `tests/unit/components-portal-tracking-settings-card.test.tsx` | unit | Tracking settings form |
| `tests/unit/app-sites-domain-slug-page.test.tsx` | unit | Public page renderer |
| `tests/unit/app-sites-site-nav-client.test.tsx` | unit | Site nav component |
| `tests/unit/components-portal-publishing-calendar.test.tsx` | unit | Publishing calendar |
| `tests/unit/actions-client-sites.test.ts` | unit | `getClientWebsiteByDomain` resolution |
| `tests/e2e/portal-website-infra.spec.ts` | e2e | Website provisioning flow |
| `tests/e2e/portal-website-infra-extras.spec.ts` | e2e | Additional infra flows |
| `tests/e2e/portal-hosting.spec.ts` | e2e | Hosted sites UI |
| `tests/e2e/portal-hosting-lifecycle.spec.ts` | e2e | Hosting create/cancel lifecycle |
| `tests/e2e/portal-publishing.spec.ts` | e2e | Publishing board |
| `tests/e2e/portal-cms-websites.spec.ts` | e2e | CMS + websites integration |
| `tests/e2e/portal-websites-navigation-baseline.spec.ts` | e2e | Nav baseline |
| `tests/e2e/snapshots.spec.ts` | e2e | Snapshot export/import |

## Cross-domain dependencies

- [[CMS & Blocks]] renders into this domain. Posts (`posts` table) are content authored in the CMS; the `app/sites/[domain]/[[...slug]]/page.tsx` renderer fetches them and passes block JSON to the block registry for rendering.
- [[Agency, Onboarding & Branding]] supplies branding profiles (`brandingProfiles`) and the `clients.customDomain` white-label portal domain resolved in `middleware.ts` via `lib/agency/custom-domain.ts`.
- [[Billing & Stripe]] gates `hostedSites` provisioning; `services` + `clientServices` determine which hosting plan a client has.
- [[Automations & Workflows]] can trigger on site-publish events and reads `clientWebsites` for site context.
- [[Email & Campaigns]] — the publishing email channel (`lib/publishing/channels/email.ts`) dispatches through the email domain.
- Visual Editor (`components/portal/visual-editor/`) lives in the components tree and writes back into the sites render path via the post editor at `app/portal/websites/[siteId]/posts/[postId]/edit/`.

## Invariants & gotchas

**Two active-client files — distinct scopes:** `lib/active-client.ts` (repo root) resolves portal session tenant identity from the `sd-active-client` cookie (used throughout `app/portal/`). `lib/publishing/active-client.ts` is a separate file scoped to the publishing sub-domain; it handles tenant resolution in the publishing pipeline, not the general portal session. Do not conflate them.

**Domain resolution (three-step):** `getClientWebsiteByDomain()` in `lib/actions/client-sites.ts` tries (1) exact match on `client_websites.domain`, (2) join through `website_domains`, (3) subdomain match against `client_websites.subdomain` for `*.simplerdevelopment.com`. Middleware rewrites the raw Host header to `/sites/{domain}/...` before Next.js routing runs; `lib/site-data-cache.ts` memoizes the DB call per React render via `cache()`.

**White-label portal domains:** When `middleware.ts` sees a host not under `*.simplerdevelopment.com`, it calls `resolveCustomDomain()` from `lib/agency/custom-domain.ts`. A match rewrites to `/portal/...` rather than `/sites/...`, sets `x-agency-client-id`, and the portal route tree picks up the client context from that header. The portal `sd-active-client` cookie (`lib/active-client.ts`) handles portal-side tenant identity independently.

**publicAccess gate:** `clientWebsites.publicAccess=false` means the site is in development. The layout emits `noindex` and the page renderer enforces an access wall. The `previewCode` field stores a marketing/share code; `app/api/sites/unlock/route.ts` sets a signed cookie to bypass the gate for that specific site before it goes public.

**Draft vs. live (two-layer):** Navigation items carry a `draft` JSON column on each `site_navigation` row; publishing a single item or all items via the navigation API copies draft to live columns. Custom CSS/JS follow the same pattern: `draftCustomCss`/`draftCustomJs` are written by the MCP tool `sites_update_custom_code`; `lib/sites/publish-custom-code.ts` copies them to the live columns.

**Snapshots are portable, hosting metadata is not:** `lib/snapshots/types.ts` `SnapshotSiteSettings` deliberately omits `vercelProjectId`, `githubRepoName`, `logApiKey`, and related infra fields — those are environment-specific and would be wrong on an imported site. Only content, nav, block templates, post types, and safe site settings travel in the payload.

**Publishing is a kanban project:** The Publishing Command Center is not a separate board system — it reuses `kanban_cards`/`kanban_columns` with `projects.system_kind = 'publishing'`. The per-client publishing project is bootstrapped on first portal visit via `lib/publishing/bootstrap.ts`. Stage keys and permission keys are string literals (not DB enums) so future custom stages require no migration.

**Tenancy:** Every query against `client_websites`, `hosted_sites`, `site_tracking`, `site_navigation`, `site_branding`, `publishing_campaigns`, and `publishing_permissions` must filter on `clientId` or `websiteId` (which is itself scoped by `clientId`). Run `bun test:tenancy` after any data-access change in this domain.

**Host-header hardening:** `isPlausibleTenantHost()` in `middleware.ts` rejects raw IPs, IPv6 literals, hosts without a dot, and label-format violations before any domain is used as a tenant identifier (GHSA-ggv3-7p47-pfv8 defense; a full DB-lookup gate is tracked as Wave 3).

## Planning notes

- `isPublic` on `site_snapshots` is flagged as a forward-looking marketplace feature with no current logic.
- Full DB-lookup gate in middleware (reject unknown hosts before rewrite) is deferred to Wave 3; requires moving middleware off the Edge runtime (Drizzle is not Edge-safe).
- Contact overrides in `app/sites/[domain]/layout.tsx` `SITE_CONTACT_OVERRIDES` are hardcoded pending branding schema gaining contact-field columns.
- Publishing email channel is the only channel implemented under `lib/publishing/channels/`; social + webhook channels are not yet built.

## Related

- [[CMS & Blocks]]
- [[Agency, Onboarding & Branding]]
- [[Billing & Stripe]]
- [[Email & Campaigns]]
- [[Automations & Workflows]]
- [[Visual Editor]]
