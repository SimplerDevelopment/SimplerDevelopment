---
type: domain-map
domain: agency
status: active
date: 2026-06-09
sources:
  - lib/agency/
  - lib/branding/
  - lib/onboarding/
---

# Domain: Agency, Onboarding & Branding

## Purpose

Covers the full tenant lifecycle from first login through ongoing brand management:

1. **Signup / user creation** — admin provisions a `clients` row + owner `users` row; or self-serve via invite.
2. **Onboarding wizard** — 8-step guided flow (`welcome` → `done`) that captures role, company, brand vibe, mission, and feature intent. Answers are mirrored into `branding_profiles` and `branding_messaging` so downstream tools have context from day one.
3. **Brand profile management** — structured color palette, typography, logos, button presets, and messaging (tagline, elevator pitch, tone). Multiple named profiles per client; one marked `isDefault`.
4. **Agency / white-label** — Scale-tier clients map a custom domain to the portal, override chrome (name, logo, accent color), and enable white-label routing via DNS TXT verification.

Everything in this domain is keyed by `clientId`. See [[Tenancy & Site Resolution]].

---

## Key entry points

| Area | File |
|---|---|
| Onboarding wizard types + step catalog | `lib/onboarding/types.ts` |
| Onboarding persistence service | `lib/onboarding/service.ts` |
| Custom-domain resolver (hot path, cached) | `lib/agency/custom-domain.ts` |
| DNS TXT ownership verification | `lib/agency/dns-verify.ts` |
| Branding utility library (palette, contrast, CSS vars, etc.) | `lib/branding/` |
| Branding MCP SDK adapter | `lib/branding/mcp-sdk-adapter.ts` |
| Active client cookie resolver | `lib/active-client.ts` |
| Clients + white-label schema | `lib/db/schema/sites.ts` |
| Branding profiles + messaging schema | `lib/db/schema/cms.ts` (lines 292–400+) |
| Onboarding state schema | `lib/db/schema/auth.ts` (`userOnboarding`) |

---

## Data model

### `clients` (`lib/db/schema/sites.ts`)

The root tenant record. One row per paying tenant.

| Column | Notes |
|---|---|
| `id` | PK — `clientId` throughout the codebase |
| `userId` | Owner user (unique FK → `users`) |
| `company`, `phone`, `website`, `address` | Public business info |
| `stripeCustomerId` | Billing link |
| `emailPrefix` | AI email gateway address prefix |
| `defaultWebsiteId` | Which site drives the subdomain |
| `customDomain` | Verified custom portal domain (agency white-label) |
| `customDomainVerifiedAt` | NULL = domain not active; non-null = routing live |
| `customDomainVerificationToken` | Random token placed in DNS TXT `_simplerdev.<domain>` |
| `whiteLabelEnabled` | Gate: cannot be true until `customDomainVerifiedAt` is set |
| `agencyName`, `agencyLogoUrl`, `agencyPrimaryColor` | Portal chrome overrides |
| `brainTrialUntil` | Self-serve brain trial entitlement |

### `client_members` (`lib/db/schema/sites.ts`)

Many-users-per-client join table. Roles: `owner`, `admin`, `member`, `viewer`.

### `user_onboarding` (`lib/db/schema/auth.ts`)

One row per user. `completedAt = NULL` → dashboard redirects back to wizard. `answers` JSON column holds raw wizard responses; structured data is also mirrored downstream immediately on save.

### `branding_profiles` (`lib/db/schema/cms.ts`)

One or more per client. Fields: colors (primary/secondary/accent/bg/text + dark-mode overrides), nav template/position, heading/body fonts, `typography` JSON, logo variants (square/rect/icon), `borderRadius`, `linkColor`, `buttonStyle` JSON, `buttonPresets` JSON array, `faviconUrl`, `ogImageUrl`. One row has `isDefault = true`.

### `branding_messaging` (`lib/db/schema/cms.ts`)

Linked 1:1 to a `branding_profiles` row. Fields: `tagline`, `missionStatement`, `visionStatement`, `valueProposition`, `toneOfVoice`, `brandPersonality`, `writingStyle`, `elevatorPitch`, `boilerplate`, `keyDifferentiators` (JSON array), `targetAudience`, `industry`, `yearFounded`, `companySize`, `headquarters`.

### `custom_domain_history` (`lib/db/schema/sites.ts`)

Append-only audit trail for domain mutations (`added`, `verified`, `removed`). Independent of the `clients` row so history survives row updates.

---

## API surface

### Portal (tenant-scoped)

| Method + Path | Purpose |
|---|---|
| `GET/POST /api/portal/onboarding` | Load / save onboarding step |
| `GET/PUT /api/portal/branding` | Default branding profile CRUD |
| `GET/POST /api/portal/branding/profiles` | List / create profiles |
| `GET/PATCH/DELETE /api/portal/branding/profiles/[profileId]` | Per-profile CRUD |
| `GET/POST /api/portal/branding/messaging` | Brand messaging |
| `POST /api/portal/branding/generate-theme` | AI theme generation |
| `POST /api/portal/branding/generate-messaging` | AI copy generation |
| `POST /api/portal/branding/rewrite-field` | AI field rewrite |
| `GET /api/portal/branding/audit` | Contrast + accessibility audit |
| `GET/PUT /api/portal/branding/defaults` | Block default styles |
| `POST /api/portal/branding/generate-block-copy` | Block-level AI copy |
| `GET/PATCH /api/portal/agency/branding` | Agency chrome settings |
| `GET/POST /api/portal/agency/custom-domain` | Custom domain management |
| `POST /api/portal/agency/custom-domain/verify` | Trigger DNS TXT verification |
| `GET/PATCH /api/portal/agency/white-label` | White-label toggle + chrome |
| `GET/PATCH /api/portal/agency/chrome` | Portal chrome overrides |
| `GET/PATCH /api/portal/websites/[siteId]/branding` | Per-site branding profile assignment |
| `GET/PATCH /api/portal/websites/[siteId]/branding-profile` | Per-site profile link |

### Admin

| Method + Path | Purpose |
|---|---|
| `GET/POST /api/admin/portal/clients` | List / create clients |
| `GET/PATCH/DELETE /api/admin/portal/clients/[id]` | Client detail |
| `GET/PATCH /api/admin/portal/clients/[id]/plan` | Plan assignment |
| `GET/POST /api/admin/portal/clients/[id]/members` | Team membership |
| `POST /api/admin/portal/clients/[id]/impersonate` | Admin impersonation |

### Public / v1

| Method + Path | Purpose |
|---|---|
| `GET /api/branding/[websiteId]` | Public branding fetch for site renderer |
| `GET /api/v1/sites/[siteId]/branding` | External API branding read |

---

## MCP tools

All branding tools require `branding:read` scope. Profile and team tools carry their own scopes.

| Tool | Scope | File |
|---|---|---|
| `branding_list_profiles` | `branding:read` | `lib/branding/mcp-sdk-adapter.ts` |
| `branding_get_profile` | `branding:read` | `lib/branding/mcp-sdk-adapter.ts` |
| `branding_get_messaging` | `branding:read` | `lib/branding/mcp-sdk-adapter.ts` |
| `branding_audit` | `branding:read` | `lib/branding/mcp-sdk-adapter.ts` |
| `branding_check_contrast` | `branding:read` | `lib/branding/mcp-sdk-adapter.ts` |
| `profile_get` | `profile:read` | `lib/mcp/tools/profile.ts` |
| `profile_update` | `profile:write` | `lib/mcp/tools/profile.ts` |
| `team_list_members` | `team:read` | `lib/mcp/tools/team.ts` |
| `team_invite` | `team:write` | `lib/mcp/tools/team.ts` |
| `team_update_role` | `team:write` | `lib/mcp/tools/team.ts` |
| `team_remove_member` | `team:write` | `lib/mcp/tools/team.ts` |

MCP entry points re-export from domain adapters: `lib/mcp/tools/branding.ts` → `lib/branding/mcp-sdk-adapter.ts`.

---

## UI surfaces

| Surface | Path |
|---|---|
| Onboarding wizard | `app/portal/onboarding/page.tsx` |
| Branding profiles list | `app/portal/branding/page.tsx` |
| Brand profile editor (Colors, Typography, Buttons, Assets, Messaging) | `app/portal/branding/profiles/[profileId]/page.tsx` |
| Brand style guide | `app/portal/branding/profiles/[profileId]/guide/page.tsx` |
| Brand AI tools panel | `app/portal/branding/profiles/[profileId]/_components/AIToolsPanel.tsx` |
| Per-site branding assignment | `app/portal/websites/[siteId]/branding/page.tsx` |
| Agency / white-label settings | `app/portal/agency/page.tsx` |
| Agency branding overrides | `app/portal/agency/branding/page.tsx` |
| Agency custom domain flow | `app/portal/agency/custom-domain/page.tsx` |
| Admin client list | `app/admin/clients/page.tsx` |
| Admin client detail | `app/admin/clients/[id]/page.tsx` |
| Admin plan assignment | `app/admin/clients/[id]/plan/page.tsx` |
| Admin branding panel | `app/admin/branding/page.tsx` |

---

## Tests & gates

**Coverage floor:** `lib/agency/**/*.ts` — 70% lines/statements/functions, 60% branches (per `tests/CI-GATES.md`). `lib/branding/` and `lib/onboarding/` fall under the project-wide 60% floor.

| Test file | What it covers |
|---|---|
| `tests/unit/agency-custom-domain.test.ts` | `resolveCustomDomain` + cache logic |
| `tests/unit/agency-dns-verify.test.ts` | DNS TXT verification |
| `tests/unit/api-portal-agency-custom-domain-route.test.ts` | Custom-domain API route |
| `tests/unit/branding-mcp-tools.test.ts` | Branding MCP handler functions |
| `tests/unit/branding-mcp-sdk-adapter.test.ts` | MCP SDK adapter registration |
| `tests/unit/branding-audit.test.ts` | Contrast audit logic |
| `tests/unit/branding-palette-extract.test.ts` | Palette extraction |
| `tests/unit/branding-copy-prompt.test.ts` | AI copy prompt construction |
| `tests/unit/branding-block-defaults.test.ts` | Block default style application |
| `tests/unit/branding-preview-blocks.test.ts` | Preview block rendering |
| `tests/unit/branding-small-helpers.test.ts` | CSS vars, contrast, typography helpers |
| `tests/unit/branding.test.ts` | Core branding utilities |
| `tests/unit/components-portal-onboarding-wizard.test.tsx` | Onboarding wizard component |
| `tests/unit/components-branding-ai-tools-panel.test.tsx` | AI tools panel component |
| `tests/unit/components-branding-buttons-tab.test.tsx` | Buttons tab component |
| `tests/unit/app-portal-website-branding-page.test.tsx` | Per-site branding page |

---

## Cross-domain dependencies

- **Tenancy** — every table in this domain carries `clientId`. The active client is resolved from a cookie via `lib/active-client.ts` and cross-checked by the site-resolver middleware. Never trust URL params alone. See [[Tenancy & Site Resolution]].
- **Sites** — `branding_profiles` can be assigned to a `clientWebsites` row; the public renderer fetches via `/api/branding/[websiteId]`. See [[Sites, Hosting & Publishing]].
- **Billing** — the `whiteLabelEnabled` flag and `brainTrialUntil` are plan-gated. The admin plan route (`/api/admin/portal/clients/[id]/plan`) manages entitlements. See [[Billing & Stripe]].
- **Auth** — `users`, `clientMembers`, invite flow, and API key scopes (`branding:read`, `team:write`, etc.) all depend on the auth layer. See [[Auth & Security]].
- **CMS / Blocks** — `branding_profiles` feeds block-default styles and AI copy generation for the block editor. See [[CMS & Blocks]].
- **Company Brain** — brand messaging context (`toneOfVoice`, `missionStatement`, `valueProposition`) is surfaced to the Brain RAG layer as tenant identity context.

---

## Invariants & gotchas

- `whiteLabelEnabled` cannot be set `true` until `customDomainVerifiedAt` is non-null. The API enforces this; the UI disables the toggle.
- Custom-domain routing is two-tier cached: 60 s in-memory per serverless instance + 5 min via `unstable_cache` tagged `custom-domain`. Mutation routes call `clearCustomDomainCache()` to invalidate both tiers immediately.
- DNS verification uses `_simplerdev.<domain>` TXT records. The verifier (`lib/agency/dns-verify.ts`) never throws — it returns `false` on any DNS failure so the API path cannot 504.
- Onboarding `completedAt = NULL` is the dashboard redirect gate. Setting it is irreversible from the wizard; staff can reopen it via `reopenOnboarding()`.
- `mirrorBrandAnswers` in `lib/onboarding/service.ts` writes to `branding_profiles` / `branding_messaging` as a fire-and-forget side effect — wizard saves are never blocked on it.
- `branding_profiles` and `branding_messaging` live in `lib/db/schema/cms.ts`, not a dedicated branding schema module — search there, not in a hypothetical `branding.ts` schema file.
- Multiple branding profiles per client are supported; only one has `isDefault = true`. The default is what the sd-create-* skills and MCP tools use when no `profileId` is supplied.

---

## Planning notes

- The `lib/branding/` utility library has no dedicated schema module (schema is in `cms.ts`). If it grows further, extracting to a dedicated `branding` schema module would reduce cross-module coupling.
- `lib/onboarding/` is minimal (2 files). The onboarding API route is at `app/api/portal/onboarding/route.ts` — service calls stay thin.
- Agency white-label is currently Scale-tier only; no UI scaffolding for sub-account resale has been built yet.
- `lib/agency/` only has 2 files — the 70% coverage floor is straightforward to maintain but must not slip as custom-domain logic grows.

---

## Related

- [[Tenancy & Site Resolution]]
- [[Sites, Hosting & Publishing]]
- [[Billing & Stripe]]
- [[Auth & Security]]
- [[CMS & Blocks]]
