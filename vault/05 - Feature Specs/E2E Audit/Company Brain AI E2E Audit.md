---
kanban-plugin: board
type: spec
domain: company-brain-ai
status: active
date: 2026-06-17
sources:
  - lib/brain/entitlement.ts
  - app/portal/brain/ask/page.tsx
  - lib/db/schema/brain.ts
---

## To Test

- [ ] Auto-ingest connectors (Slack, Confluence, SharePoint)
- [ ] ACL-aware retrieval (per-tenant scoping enforced)
- [ ] Brain RAG → approval queue → publish loop
- [ ] Governance entities: decisions, playbooks, goals CRUD
- [ ] review-items approve mutation: POST /brain/review-items/[id]/approve commits AI-generated content to canonical data
- [ ] review-items reject mutation: POST /brain/review-items/[id]/reject discards a pending review item
- [ ] saved-searches CRUD lifecycle: create → list → update → delete a saved search filter
- [ ] brain note custom fields: POST /brain/knowledge/[id]/fields creates a field value; PATCH updates it; DELETE removes it
- [ ] topics attach + for-entity: POST /brain/topics/attach links a topic to a note/decision/initiative; GET /topics/for-entity returns attached topics
- [ ] topics merge: POST /brain/topics/[id]/merge re-parents children and re-attaches entities then deletes source
- [ ] org-unit merge: POST /brain/org-units/[id]/merge moves members and children to target then deletes source
- [ ] task promote-to-kanban: POST /brain/tasks/[id]/promote-to-kanban creates a Kanban card and links back to the brain task
- [ ] knowledge trash empty: POST /brain/knowledge/trash/empty hard-deletes all soft-deleted notes for the tenant
- [ ] dataview structured query: GET /brain/dataview returns a cross-entity tabular result given a valid query payload
- [ ] meeting full lifecycle: create via paste adapter → GET detail → PUT update → DELETE a real meeting (not 404 stubs)

## Testing


## Blocked


## Passed

- [ ] Brain decisions/documents/glossary/initiatives/knowledge specs — pass with BRAIN_ENTITLEMENT_BYPASS ✓
- [ ] "Connect AI" state renders for non-entitled tenant ✓
- [ ] ✓ verified 2026-06-20: brain/ask page loads clean (hydration fix applied)
- [ ] ✓ verified 2026-06-20: knowledge note create→edit→delete→404 lifecycle verified
- [ ] ✓ verified 2026-06-20: brain-agent SSE stream verified

## Gaps Found

- [ ] e2e seed lacks entitlements (402 / BRAIN_NOT_ENTITLED) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No auto-ingest connectors (Slack/Confluence/SharePoint) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No ACL-aware retrieval across tenant boundaries — see [[Competitive Gap Analysis 2026-06]]
- [ ] review-items approve/reject have no e2e mutation test — GET /review list is covered but no spec drives approve or reject through the human review queue
- [ ] meetings detail lifecycle is stub-only — only 404 probes exist for PUT/DELETE; no spec creates a real meeting then updates/deletes it via the [id] routes
- [ ] brain note custom fields (/knowledge/[id]/fields) have no e2e coverage despite real routes and schema existing in brain.ts
- [x] RESOLVED: /portal/brain/ask console pageerror — window.origin read moved out of render into useEffect — `app/portal/brain/ask/page.tsx`
- [x] RESOLVED: brain knowledge GET returned 200 for soft-deleted notes — now 404 — `app/api/portal/brain/knowledge/[id]/route.ts`


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
