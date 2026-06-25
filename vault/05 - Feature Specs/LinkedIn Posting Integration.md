---
type: spec
domain: integrations
status: in-progress
date: 2026-06-25
tags: [linkedin, integrations, publishing, social]
sources:
  - lib/publishing/constants.ts
  - components/portal/publishing/PublishingCalendar.tsx
  - lib/brain/classify-notes.ts
  - lib/mcp/tools/integrations.ts
  - lib/db/schema/tools.ts
  - lib/microsoft/oauth.ts
  - lib/microsoft/oauth-state.ts
  - lib/crypto/secrets.ts
  - lib/mcp/approvals.ts
  - app/api/cron/process-scheduled-posts/route.ts
  - lib/publishing/channels/email.ts
  - tests/unit/mcp-tool-registry-baseline.test.ts
  - lib/linkedin/oauth.ts
  - lib/linkedin/oauth-state.ts
  - lib/linkedin/connections.ts
  - lib/linkedin/api.ts
  - app/api/portal/integrations/linkedin/connect/route.ts
  - app/api/portal/integrations/linkedin/callback/route.ts
  - app/api/portal/integrations/linkedin/disconnect/route.ts
  - app/api/portal/integrations/linkedin/status/route.ts
  - app/api/cron/process-linkedin-posts/route.ts
  - app/portal/settings/integrations/page.tsx
---

# LinkedIn Posting Integration — Feature Spec

Status: IN PROGRESS. Phase A committed; pending migration repair, tenancy gate, and LinkedIn developer app credentials before end-to-end validation.

## Build status (2026-06-25)

Commits: `44a9c5ec` (foundation), `60792532` (complete Phase A). Typecheck clean project-wide; MCP registry baseline 14/14.

### BUILT

- **Schema:** `linkedin_user_connections` + `linkedin_posts` tables (tokens AES-256-GCM encrypted; cron-time cols `timestamptz`).
- **`lib/linkedin/oauth.ts`** + **`lib/linkedin/oauth-state.ts`** + **`lib/linkedin/connections.ts`** — OIDC flow, optional-refresh handling, encrypted upsert/refresh/revoke.
- **`lib/linkedin/api.ts`** — REST Posts API client, TEXT posts only (verified vs `li-lms-2026-06`); image/video/document upload throws an explicit `NotImplemented` (TODO).
- **OAuth routes:** `app/api/portal/integrations/linkedin/{connect,callback,disconnect,status}` — CSRF-bound.
- **MCP tools:** `linkedin_status` / `linkedin_post_create` / `linkedin_post_update` / `linkedin_post_list` — DRAFT-ONLY (no publish/schedule via MCP), scope-guarded (`linkedin:read` / `linkedin:write`), tenant-scoped.
- **Cron:** `app/api/cron/process-linkedin-posts` (`*/5`) with CAS double-fire guard + per-row error isolation; `vercel.json` updated.
- **UI:** Connect LinkedIn card in `app/portal/settings/integrations/page.tsx`.
- **`.env.example`:** `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` + optional `LINKEDIN_API_VERSION`.
- **Skill (separate):** `/linkedin-weekly-drafts` generates the draft batch.

### REMAINING / BLOCKERS

- **Migration NOT generated** — pre-existing drizzle-kit meta snapshot collision (0004/0070/0072); must be hand-authored or generated after the meta journal is repaired (DB-ops task). Schema source-of-truth is in place.
- **`bun test:tenancy` NOT run locally** (no DB) — REQUIRED before merge (new tenant tables).
- **End-to-end OAuth/posting UNTESTED** — pends Dan creating the LinkedIn developer app + `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`.
- **Media upload** (image/video/document) not implemented (text-only MVP).
- **Publishing-board channel adapter** (`lib/publishing/channels/linkedin.ts`) deferred (Phase 2; not a clean clone of the 276-line email adapter).
- **Minor:** `disconnect` exists in both the route and a settings server action — reconcile later.

Related: [[OSS Launch Playbook]] (shares the same go-to-market effort).

## Goal

Auto-draft → review in the Publishing Calendar → schedule → SimplerDevelopment publishes to a connected LinkedIn account via API. Part of the OSS go-to-market effort (see [[OSS Launch Playbook]]): Dan Coyle's personal profile is the primary distribution engine; the SimplerDevelopment company page has weak organic reach (~5% of feeds, verified) and stays on LinkedIn's native scheduler.

## Scope decision (DECIDED)

- PHASE A (this spec): personal-profile posting only, via the self-serve `w_member_social` scope ("Share on LinkedIn" product). Feasible without LinkedIn partner approval. Covers the high-reach path.
- Company-page (organization) posting needs `w_organization_social` + Community Management API + LinkedIn Marketing Developer Platform partner approval (a real gate) — OUT OF SCOPE for now; company page stays manual/native-scheduled.

## Architecture (decided)

- System of record: dedicated `linkedin_posts` table (mirrors `emailCampaigns` draft/scheduled shape). NOT overloaded Brain notes. Brain `linkedin-draft` notes (`lib/brain/classify-notes.ts`) and the sd-create-short skill output become SOURCES that promote into a `linkedin_posts` row.
- Publish trigger: dedicated 5-minute cron `process-linkedin-posts` (mirrors `app/api/cron/process-scheduled-posts/route.ts` (61 lines)). Simpler than routing through the automations engine.
- Auth: clone the MICROSOFT OAuth flow (`lib/microsoft/oauth.ts`, `lib/microsoft/oauth-state.ts`) — it uses platform-level env-var app credentials, like LinkedIn would. Tokens AES-256-GCM encrypted via `lib/crypto/secrets.ts` (`encryptSecret`/`decryptSecret`). Connection rows keyed by `(clientId, userId)` — multi-tenant safe.
- Write safety: schedule/publish go through the existing approval-URL pattern (`lib/mcp/approvals.ts`); scope-guard (`linkedin:read` / `linkedin:write`) on every MCP tool.

## Existing scaffolding (Phase-2 hooks already in repo)

- `lib/publishing/constants.ts:54` — `linkedin_draft` artifact type reserved ("lands in Phase 2 alongside the LinkedIn OAuth + posting worker").
- `components/portal/publishing/PublishingCalendar.tsx:137` — LinkedIn channel already styled (brand blue, icon, label).
- `lib/brain/classify-notes.ts` — `linkedin-draft` is a first-class Brain note `ContentTypeSlug`.
- `lib/mcp/tools/integrations.ts:130` — `integrations_list` / `integrations_revoke` MCP tools; array-of-providers shape ready to slot in `linkedin`.

## Atomic units (for plan-then-delegate)

| # | Unit | Reuse template | Dep |
|---|---|---|---|
| 1 | `linkedin_user_connections` + `linkedin_posts` schema + migration | `microsoftTeamsUserConnections` (`lib/db/schema/tools.ts:560`), `emailCampaigns` | — |
| 2 | `lib/linkedin/oauth.ts` + `oauth-state.ts` | `lib/microsoft/oauth.ts`, `lib/microsoft/oauth-state.ts` | — |
| 3 | OAuth routes connect/callback/disconnect/status | `app/api/portal/integrations/microsoft/*` | 1,2 |
| 4 | `lib/linkedin/api.ts` — REST Posts API + media upload + token refresh | new (LinkedIn `/rest/posts`) | 1 |
| 5 | `linkedin_*` MCP tools + integrations enum + EXPECTED_TOOLS baseline test | `lib/mcp/tools/integrations.ts`; `tests/unit/mcp-tool-registry-baseline.test.ts` | 1 |
| 6 | cron `process-linkedin-posts` + `vercel.json` + `lib/publishing/channels/linkedin.ts` | `app/api/cron/process-scheduled-posts`, `lib/publishing/channels/email.ts` | 1,4 |
| 7 | Publishing Calendar wiring + Connect LinkedIn settings button | `components/portal/publishing/PublishingCalendar.tsx` | 1,5 |
| 8 | (optional) `sd-create-short` → `linkedin_post_create` auto-draft | `.claude/skills/sd-create-short` | 4,5 |

## Manual prerequisite (Dan)

Create a LinkedIn app at developer.linkedin.com → add "Share on LinkedIn" + "Sign In with LinkedIn (OpenID Connect)" products → set redirect URI → add `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` to env.

## Gates

`bun test:tenancy` (new data-access), `tsc`, MCP registry baseline test, `bun test:critical` before done.

## Known unknowns (verify at build)

LinkedIn refresh-token availability + lifetime; the media (video) multi-step upload flow; current REST API version header; exact 2026 product/scope names.

## Related

Weekly auto-drafting routine (the content side, to be built after the strategy research lands) will create `linkedin_posts` draft rows from Dan's recent work (git commits, shipped features). Automation level chosen: auto-draft → human review + schedule (no unattended publishing).
