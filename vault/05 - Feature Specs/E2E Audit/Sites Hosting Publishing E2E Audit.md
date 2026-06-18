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

- [ ] True staging environment + publish-to-prod flow
- [ ] Automated backup creation on publish
- [ ] Auto-rollback on failed publish
- [ ] Scheduled post auto-publish (cron wiring)

## Testing


## Blocked


## Passed

- [ ] Site renders for entitled tenant via domain resolver ✓
- [ ] Public booking form /book/[slug] renders end-to-end ✓ (Phase 2)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No true staging environment (preview token ≠ staging branch) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No automated backups / auto-rollback on failed publish — see [[Competitive Gap Analysis 2026-06]]
- [ ] Scheduled auto-publish cron not wired to CMS posts — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
