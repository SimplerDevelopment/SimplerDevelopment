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

## Testing


## Blocked


## Passed

- [ ] Brain decisions/documents/glossary/initiatives/knowledge specs — pass with BRAIN_ENTITLEMENT_BYPASS ✓
- [ ] "Connect AI" state renders for non-entitled tenant ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402 / BRAIN_NOT_ENTITLED) — see [[Platform E2E Audit 2026-06-17]]
- [ ] /portal/brain/ask renders with 1 console error (to triage) — Phase 2 finding — see [[Platform E2E Audit 2026-06-17]]
- [ ] No auto-ingest connectors (Slack/Confluence/SharePoint) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No ACL-aware retrieval across tenant boundaries — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
