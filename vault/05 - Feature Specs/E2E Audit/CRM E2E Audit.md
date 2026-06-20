---
kanban-plugin: board
type: spec
domain: crm
status: active
date: 2026-06-17
sources:
  - lib/db/schema/crm.ts
  - tests/e2e/admin-crm.spec.ts
---

## To Test

- [ ] Two-way email sync with Gmail/Outlook
- [ ] Sequences / email cadences from CRM
- [ ] AI deal assistant (scoring, next-best-action)
- [ ] Signed → onboarded lifecycle flow end-to-end
- [ ] GET + PUT /api/portal/crm/notification-preferences — read and update per-user delivery preferences (instant / digest_daily / off) for each NOTIFICATION_TYPE
- [ ] GET /api/portal/crm/notifications/[id] and DELETE /api/portal/crm/notifications/[id] — single-notification read and dismiss
- [ ] POST /api/portal/crm/notifications/mark-all-read — mark-all-read route (distinct from bulk PUT { all: true })
- [ ] GET /api/portal/crm/contacts/[id]/emails — list emails associated with a contact
- [ ] POST /api/portal/crm/contacts/[id]/send-email — send an email directly to a contact from CRM
- [ ] POST /api/portal/crm/contacts/[id]/score — manually adjust a contact's score; verify score field updates
- [ ] GET /api/portal/crm/deals/[id]/artifacts and GET /api/portal/crm/deals/[id]/artifacts/available — list linked artifacts and available artifacts for a deal
- [ ] POST + DELETE /api/portal/crm/deals/[id]/artifacts — link and unlink an artifact to a deal
- [ ] PUT + DELETE /api/portal/crm/pipelines/[id] — rename and delete a pipeline
- [ ] PUT + DELETE /api/portal/crm/pipelines/[id]/stages/[stageId] — update and delete an individual pipeline stage
- [ ] Cross-tenant isolation: contact/company/deal created by tenant A is not visible to tenant B (401/404)

## Testing


## Blocked


## Passed

- [ ] CRM dashboard renders for entitled tenant ✓ (Phase 2 MCP pass — screenshot audit-03-crm.png)
- [ ] Contact / deal CRUD for entitled tenant ✓
- [ ] Native e-sign + proposals as lifecycle objects ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No two-way email sync — sequences/cadences missing (most-used CRM surface) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No AI deal assistant / forecasting — see [[Competitive Gap Analysis 2026-06]]
- [ ] crmContractTemplates table exists in schema but no /api/portal/crm/contract-templates route — feature is dark
- [ ] contacts/[id]/send-email route exists but no e2e tests and no integration with Gmail MCP or outbound email provider — functionality is unverified end-to-end


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
