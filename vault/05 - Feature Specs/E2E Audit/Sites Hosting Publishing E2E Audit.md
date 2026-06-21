---
kanban-plugin: board
type: spec
domain: sites-hosting-publishing
status: active
date: 2026-06-17
sources:
  - lib/db/schema/sites.ts
  - lib/db/schema/publishing.ts
---

## To Test

- [ ] API key delete: DELETE /websites/:id/api-keys/:keyId removes key from masked list — needs spec (BUG: generateApiKey() in lib/api-keys.ts emits 'sd_live_' + 64 hex chars = 72 chars, but api_keys.key is varchar(64) — POST /websites/:id/api-keys 500s on DB constraint violation, blocking the delete flow test.)

## Testing


## Blocked


## Passed

- [ ] Site renders for entitled tenant via domain resolver ✓
- [ ] Public booking form /book/[slug] renders end-to-end ✓ (Phase 2)
- [ ] ✓ verified 2026-06-20: nav menu add/edit/nest persistence verified; all 18 publishing @critical tests pass
- [ ] ✓ verified 2026-06-20 — Publishing permissions grant/revoke: POST /publishing/permissions/grant adds a permission key, /revoke removes it, GET /publishing/permissions lists it (portal-publishing.spec.ts)
- [ ] ✓ verified 2026-06-20 — Publishing calendar: GET /publishing/calendar returns { success, data } envelope with scheduled cards in date range (portal-publishing.spec.ts)
- [ ] ✓ verified 2026-06-20 — Environment env-var CRUD: POST /environments/:envId/vars creates a var, GET lists it, DELETE removes it (cov-u11.spec.ts)
- [ ] ✓ verified 2026-06-20 — Environment backup create: POST /environments/:envId/backup persists snapshot including env vars (cov-u11.spec.ts)
- [ ] ✓ verified 2026-06-20 — Environment restore: POST /environments/:envId/restore replaces current env vars from backup snapshot (cov-u11.spec.ts)
- [ ] ✓ verified 2026-06-20 — Environment sync to Vercel: POST /environments/:envId/sync returns success shape even without real Vercel creds (cov-u11.spec.ts)
- [ ] ✓ verified 2026-06-20 — Environment copy: POST /environments/:envId/copy duplicates env vars to another environment (cov-u12.spec.ts)
- [ ] ✓ verified 2026-06-20 — Domain DNS verify: POST /websites/:id/domains/:domainId/verify returns verified:false (no real CNAME) not 5xx (cov-u12.spec.ts)
- [ ] ✓ verified 2026-06-20 — Domain PATCH/DELETE: update isPrimary flag and remove a specific domain record from /websites/:id/domains/:domainId (cov-u12.spec.ts)
- [ ] ✓ verified 2026-06-20 — Custom code draft-then-publish lifecycle: write draftCustomCss via MCP tool, then POST /sites/:id/publish-custom-code copies draft to live (cov-u13.spec.ts)
- [ ] ✓ verified 2026-06-20 — Preview code unlock: POST /api/sites/unlock with valid previewCode sets signed cookie and allows access to non-public site (cov-u13.spec.ts)
- [ ] ✓ verified 2026-06-20 — publicAccess gate: site with publicAccess=false returns 403/noindex wall; toggling to true allows public render (cov-u13.spec.ts)
- [ ] ✓ verified 2026-06-20 — Site tracking settings: PATCH site tracking fields (gaMeasurementId, gtmContainerId) persists and GET reflects updated values (cov-u13.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No true staging environment (preview token ≠ staging branch) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No automated backups / auto-rollback on failed publish — see [[Competitive Gap Analysis 2026-06]]
- [ ] Scheduled auto-publish cron not wired to CMS posts — see [[Competitive Gap Analysis 2026-06]]
- [x] RESOLVED: Publishing API routes 500'd instead of 307/403 — getPublishingSession() now resolves active client via membership + routes re-throw redirect() so unauth emits 307 — see [[00 - E2E Audit Index]]
- [ ] GAP (no implementation): True staging environment + publish-to-prod flow
- [ ] GAP (no implementation): Automated backup creation on publish
- [ ] GAP (no implementation): Auto-rollback on failed publish
- [ ] GAP (no implementation): Scheduled post auto-publish (cron wiring)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
