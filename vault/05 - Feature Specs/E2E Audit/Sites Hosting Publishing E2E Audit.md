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

- [ ] True staging environment + publish-to-prod flow — needs spec
- [ ] Automated backup creation on publish — needs spec
- [ ] Auto-rollback on failed publish — needs spec
- [ ] Scheduled post auto-publish (cron wiring) — needs spec
- [ ] Environment env-var CRUD: POST /environments/:envId/vars creates a var, GET lists it, DELETE removes it — needs spec
- [ ] Environment backup create: POST /environments/:envId/backup persists snapshot including env vars — needs spec
- [ ] Environment restore: POST /environments/:envId/restore replaces current env vars from backup snapshot — needs spec
- [ ] Environment sync to Vercel: POST /environments/:envId/sync returns success shape even without real Vercel creds — needs spec
- [ ] Environment copy: POST /environments/:envId/copy duplicates env vars to another environment — needs spec
- [ ] Domain DNS verify: POST /websites/:id/domains/:domainId/verify returns verified:false (no real CNAME) not 5xx — needs spec
- [ ] Domain PATCH/DELETE: update isPrimary flag and remove a specific domain record from /websites/:id/domains/:domainId — needs spec
- [ ] API key delete: DELETE /websites/:id/api-keys/:keyId removes key from masked list — needs spec
- [ ] Custom code draft-then-publish lifecycle: write draftCustomCss via MCP tool, then POST /sites/:id/publish-custom-code copies draft to live — needs spec
- [ ] Preview code unlock: POST /api/sites/unlock with valid previewCode sets signed cookie and allows access to non-public site — needs spec
- [ ] publicAccess gate: site with publicAccess=false returns 403/noindex wall; toggling to true allows public render — needs spec
- [ ] Site tracking settings: PATCH site tracking fields (gaMeasurementId, gtmContainerId) persists and GET reflects updated values — needs spec

## Testing


## Blocked


## Passed

- [ ] Site renders for entitled tenant via domain resolver ✓
- [ ] Public booking form /book/[slug] renders end-to-end ✓ (Phase 2)
- [ ] ✓ verified 2026-06-20: nav menu add/edit/nest persistence verified; all 18 publishing @critical tests pass
- [ ] ✓ verified 2026-06-20 — Publishing permissions grant/revoke: POST /publishing/permissions/grant adds a permission key, /revoke removes it, GET /publishing/permissions lists it (portal-publishing.spec.ts)
- [ ] ✓ verified 2026-06-20 — Publishing calendar: GET /publishing/calendar returns { success, data } envelope with scheduled cards in date range (portal-publishing.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No true staging environment (preview token ≠ staging branch) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No automated backups / auto-rollback on failed publish — see [[Competitive Gap Analysis 2026-06]]
- [ ] Scheduled auto-publish cron not wired to CMS posts — see [[Competitive Gap Analysis 2026-06]]
- [x] RESOLVED: Publishing API routes 500'd instead of 307/403 — getPublishingSession() now resolves active client via membership + routes re-throw redirect() so unauth emits 307 — see [[00 - E2E Audit Index]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
