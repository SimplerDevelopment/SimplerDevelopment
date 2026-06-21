---
kanban-plugin: board
type: spec
domain: cms-blocks
status: active
date: 2026-06-17
sources:
  - lib/db/schema/cms.ts
---

## To Test

## Testing


## Blocked


## Passed

- [ ] ✓ verified 2026-06-20 — HTML import (upload-html): POST /posts/upload-html creates a post from raw HTML with blocks parsed (cov-u9.spec.ts)
- [ ] CMS post CRUD for entitled tenant ✓
- [ ] Block JSON persistence and retrieval ✓
- [ ] ✓ verified 2026-06-20: nav menu add/edit/nest persistence verified end-to-end
- [ ] ✓ verified 2026-06-20 — MCP-authored post → approval queue → publish flow (portal-mcp-approvals.spec.ts)
- [ ] ✓ verified 2026-06-20 — Block type registry: all registered types render correctly (visual-editor-blocks.spec.ts)
- [ ] ✓ verified 2026-06-20 — Post custom field values: set + retrieve values on a post via /api/posts/[id]/custom-fields (custom-fields.spec.ts)
- [ ] ✓ verified 2026-06-20 — Block template CRUD lifecycle: create → update → publish (draft to live) → delete (cms-blocks-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Post-type template: GET/PUT content-types/[typeId]/template round-trips block-tree JSON wrapper (cms-blocks-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Post SEO fields: create post with seoTitle, metaDescription, ogImage, canonicalUrl; verify retrieval (cms-blocks-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Per-site custom code: PUT /code, POST /code/publish, POST /code/discard lifecycle (cms-blocks-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Per-site tracking configuration: GET/PUT /tracking round-trips provider keys (cms-blocks-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Cross-tenant post isolation: a request from tenant B for a post owned by tenant A's site returns 403/404 (cms-blocks-coverage.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No reference fields / relational content linking — see [[Competitive Gap Analysis 2026-06]]
- [ ] Scheduled auto-publish not wired: cron exists, CMS hookup missing — see [[Competitive Gap Analysis 2026-06]]
- [ ] Navigation publish/publish_all MCP tools have no e2e coverage — nav_publish and nav_publish_all exist in lib/mcp/tools/cms.ts but only flat CRUD is tested in portal-cms-navigation.spec.ts
- [x] RESOLVED: insertLevel() dropped new menu items whose parent is an existing DB row — fixed — `app/api/portal/websites/[siteId]/navigation/route.ts`
- [ ] GAP (no implementation): Post fork (A/B variant): POST /api/portal/cms/websites/[siteId]/posts/[id]/fork creates a linked copy with parentPostId set — schema field exists (parent_post_id) but no route exists
- [ ] GAP (no implementation): Block template fork: fork a platform-global template, customize, publish as tenant-private copy — no dedicated fork endpoint; workaround is POST to /block-templates with new slug only
- [ ] Reference fields between post types — needs spec (no API endpoint; schema notes field but no route)
- [ ] Scheduled auto-publish (cron wired to CMS posts) — needs spec (cron exists in app/api/cron, CMS hookup not found)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
