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

- [ ] Two-way email sync with Gmail/Outlook — needs spec
- [ ] Sequences / email cadences from CRM — needs spec
- [ ] AI deal assistant (scoring, next-best-action) — needs spec
- [ ] Signed → onboarded lifecycle flow end-to-end — needs spec
- [ ] GET + PUT /api/portal/crm/notification-preferences — read and update per-user delivery preferences (instant / digest_daily / off) for each NOTIFICATION_TYPE — needs spec
- [ ] GET /api/portal/crm/notifications/[id] and DELETE /api/portal/crm/notifications/[id] — single-notification read and dismiss — needs spec
- [ ] POST /api/portal/crm/notifications/mark-all-read — mark-all-read route (distinct from bulk PUT { all: true }) — needs spec
- [ ] GET /api/portal/crm/contacts/[id]/emails — list emails associated with a contact — needs spec
- [ ] POST /api/portal/crm/contacts/[id]/send-email — send an email directly to a contact from CRM — needs spec
- [ ] POST /api/portal/crm/contacts/[id]/score — manually adjust a contact's score; verify score field updates — needs spec
- [ ] GET /api/portal/crm/deals/[id]/artifacts and GET /api/portal/crm/deals/[id]/artifacts/available — list linked artifacts and available artifacts for a deal — needs spec
- [ ] POST + DELETE /api/portal/crm/deals/[id]/artifacts — link and unlink an artifact to a deal — needs spec
- [ ] PUT + DELETE /api/portal/crm/pipelines/[id] — rename and delete a pipeline — needs spec
- [ ] PUT + DELETE /api/portal/crm/pipelines/[id]/stages/[stageId] — update and delete an individual pipeline stage — needs spec
- [ ] Cross-tenant isolation: contact/company/deal created by tenant A is not visible to tenant B (401/404) — needs spec

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
