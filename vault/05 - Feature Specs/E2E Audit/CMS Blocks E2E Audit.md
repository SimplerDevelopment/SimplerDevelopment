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

- [ ] Reference fields between post types
- [ ] Scheduled auto-publish (cron wired to CMS posts)
- [ ] MCP-authored post → approval queue → publish flow
- [ ] Block type registry: all registered types render correctly
- [ ] Block template CRUD lifecycle: create → update → publish (draft to live) → delete
- [ ] Block template fork: fork a platform-global template, customize, publish as tenant-private copy
- [ ] Post fork (A/B variant): POST /api/portal/cms/websites/[siteId]/posts/[id]/fork creates a linked copy with parentPostId set
- [ ] Post-type template: GET/PUT content-types/[typeId]/template round-trips block-tree JSON wrapper
- [ ] Post custom field values: set + retrieve values on a post via /api/posts/[id]/custom-fields
- [ ] Post SEO fields: create post with seoTitle, metaDescription, ogImage, canonicalUrl; verify retrieval
- [ ] Per-site custom code: PUT /code, POST /code/publish, POST /code/discard lifecycle
- [ ] Per-site tracking configuration: GET/PUT /tracking round-trips provider keys
- [ ] HTML import (upload-html): POST /posts/upload-html creates a post from raw HTML with blocks parsed
- [ ] Cross-tenant post isolation: a request from tenant B for a post owned by tenant A's site returns 403/404

## Testing


## Blocked


## Passed

- [ ] CMS post CRUD for entitled tenant ✓
- [ ] Block JSON persistence and retrieval ✓
- [ ] ✓ verified 2026-06-20: nav menu add/edit/nest persistence verified end-to-end

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No reference fields / relational content linking — see [[Competitive Gap Analysis 2026-06]]
- [ ] Scheduled auto-publish not wired: cron exists, CMS hookup missing — see [[Competitive Gap Analysis 2026-06]]
- [ ] Navigation publish/publish_all MCP tools have no e2e coverage — nav_publish and nav_publish_all exist in lib/mcp/tools/cms.ts but only flat CRUD is tested in portal-cms-navigation.spec.ts
- [x] RESOLVED: insertLevel() dropped new menu items whose parent is an existing DB row — fixed — `app/api/portal/websites/[siteId]/navigation/route.ts`


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
