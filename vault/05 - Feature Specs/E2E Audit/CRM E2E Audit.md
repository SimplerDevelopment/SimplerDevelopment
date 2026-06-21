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

- [ ] GET /api/portal/crm/notifications/[id] and DELETE /api/portal/crm/notifications/[id] — single-notification read and dismiss — needs spec (BUG: route only implements PATCH, not GET or DELETE; described interface doesn't match implementation)
- [ ] PUT + DELETE /api/portal/crm/pipelines/[id]/stages/[stageId] — update and delete an individual pipeline stage — needs spec (BUG: PUT for individual stage does not exist at this URL; only DELETE is implemented at [stageId]; individual stage update is bulk-only via PUT /pipelines/[id]/stages)

## Testing


## Blocked


## Passed

- [ ] CRM dashboard renders for entitled tenant ✓ (Phase 2 MCP pass — screenshot audit-03-crm.png)
- [ ] Contact / deal CRUD for entitled tenant ✓
- [ ] Native e-sign + proposals as lifecycle objects ✓
- [ ] ✓ verified 2026-06-20 — GET + PUT /api/portal/crm/notification-preferences — read and update per-user delivery preferences (instant / digest_daily / off) for each NOTIFICATION_TYPE (crm-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/crm/notifications/mark-all-read — mark-all-read route (distinct from bulk PUT { all: true }) (crm-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/portal/crm/contacts/[id]/emails — list emails associated with a contact (crm-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/crm/contacts/[id]/send-email — send an email directly to a contact from CRM (crm-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/crm/contacts/[id]/score — manually adjust a contact's score; verify score field updates (crm-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/portal/crm/deals/[id]/artifacts and GET /api/portal/crm/deals/[id]/artifacts/available — list linked artifacts and available artifacts for a deal (crm-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST + DELETE /api/portal/crm/deals/[id]/artifacts — link and unlink an artifact to a deal (crm-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Cross-tenant isolation: contact/company/deal created by tenant A is not visible to tenant B (401/404) (crm-coverage.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No two-way email sync — sequences/cadences missing (most-used CRM surface) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No AI deal assistant / forecasting — see [[Competitive Gap Analysis 2026-06]]
- [ ] crmContractTemplates table exists in schema but no /api/portal/crm/contract-templates route — feature is dark
- [ ] contacts/[id]/send-email route exists but no e2e tests and no integration with Gmail MCP or outbound email provider — functionality is unverified end-to-end
- [ ] GAP (no implementation): PUT + DELETE /api/portal/crm/pipelines/[id] — rename and delete a pipeline — no route.ts exists at pipelines/[id]; only pipelines/[id]/stages/* routes exist
- [ ] GAP (no implementation): Two-way email sync with Gmail/Outlook
- [ ] GAP (no implementation): Sequences / email cadences from CRM
- [ ] GAP (no implementation): AI deal assistant (scoring, next-best-action)
- [ ] GAP (no implementation): Signed → onboarded lifecycle flow end-to-end


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
