---
type: domain-map
domain: crm
status: active
date: 2026-06-09
sources:
  - lib/crm/
  - lib/db/schema/crm.ts
---

# Domain: CRM

## Purpose

Full-featured customer relationship management layer for each tenant (client). Manages companies, contacts, deals (kanban pipeline), proposals, e-signed contracts, activities, notifications, lead scoring, custom fields, and analytics. Data is strictly scoped to `clientId` — no cross-tenant reads.

---

## Key entry points

| Layer | Path | Notes |
|---|---|---|
| Schema | `lib/db/schema/crm.ts` | All CRM tables; ~490 lines |
| Library helpers | `lib/crm/contacts.ts` | `upsertContactByEmail` — used by brain pipeline |
| Library helpers | `lib/crm/companies.ts` | `findCompanyByDomain` — domain-match lookup |
| Library helpers | `lib/crm/default-pipeline.ts` | `ensureDefaultPipeline` — idempotent seed |
| Library helpers | `lib/crm/notifications.ts` | `createCrmNotification`, `notifyAllClientUsers`, `notifyApprovers` |
| Library helpers | `lib/crm/extract-mentions.ts` | `extractMentions` — parses `@[name](userId)` in deal comments |
| Library helpers | `lib/crm/parse.ts` | `parseDisplayName`, `normalizeDomain`, `domainFromEmail` |
| MCP tools | `lib/mcp/tools/crm.ts` | ~1670 lines; god file — do not read into main thread |
| Portal UI | `app/portal/crm/` | Dashboard, contacts, deals, companies, proposals, contracts, settings |
| Portal API | `app/api/portal/crm/` | ~50 route files; all return `{ success, data | error }` |
| Cron | `app/api/cron/stale-crm-deals/` | Weekly stale-deal detection + notifications |
| Brain integration | `lib/brain/classify-crm.ts` | Email pipeline auto-upserts contacts + proposes CRM links |
| Extension API | `app/api/extension/v1/crm/` | Browser extension: contacts, companies, deals endpoints |
| Public proposal view | `app/api/proposals/[token]/route.ts` | Token-gated public read/sign |

---

## Data model

### `crmCompanies` — tenancy key: `clientId`
Key columns: `id`, `clientId`, `name`, `domain`, `industry`, `size`, `latitude`/`longitude` (WGS84), `revenue`, `employeeCount`, `foundedYear`.

### `crmContacts` — tenancy key: `clientId`
Key columns: `id`, `clientId`, `companyId` (FK → `crmCompanies`, nullable), `firstName`, `lastName`, `email`, `status` (`active|inactive|lead|customer`), `source`, `ownerId` (FK → `users`), `score` (integer, lead scoring), `seniority`, `department`, `lastContactedAt`.

### `crmPipelines` / `crmPipelineStages` — tenancy key: `clientId` / `pipelineId`
Pipeline is the container; stages hold `sortOrder`, `probability` (0–100), `color`. Default seed: Lead → Qualified → Proposal → Negotiation → Closed Won/Lost (via `ensureDefaultPipeline`).

### `crmDeals` — tenancy key: `clientId`
Key columns: `id`, `clientId`, `pipelineId`, `stageId`, `contactId`, `companyId`, `title`, `value` (cents), `status` (`open|won|lost`), `ownerId`, `recurringValue` (cents MRR), `billingCycle` (`monthly|quarterly|annual|one-time`), `expectedCloseDate`, `closedAt`.

### `crmActivities` — tenancy key: `clientId`
Types: `call|email|meeting|note|task`. Links to contact, deal, or company. Tracks `dueDate` and `completedAt`.

### `crmProposals` / `crmProposalTemplates` — tenancy key: `clientId`
Sections (typed JSON), line items, fees, validity window. Client-facing access via `clientToken` (unique secret). Status lifecycle: `draft → sent → viewed → accepted|declined|expired`. Tracks view count, signed IP, signature data (base64 PNG).

### `crmContracts` / `crmContractSigners` / `crmContractSigningEvents` / `crmContractTemplates` — tenancy key: `clientId`
Extends proposals with per-signer signing order, DropboxSign e-sign integration (`esignProvider`, `esignProviderRequestId`), `documentHash` (SHA-256 tamper detection), and a full `esignWebhookEvents` audit trail.

### Supporting tables
- `crmTags` / `crmContactTags` — per-tenant tags on contacts
- `crmDealArtifacts` — links deals to external artifacts (website, email campaign, pitch deck, proposal, booking, survey, project)
- `crmDealComments` — threaded comments with `@[name](userId)` mention syntax
- `crmCustomFields` / `crmCustomFieldValues` — per-entity custom fields (`contact|company|deal`); unique index on `(customFieldId, entityId, entityType)` for upsert
- `crmScoringRules` — configurable point rules per event type (form_submitted, booking_made, email_opened, proposal_viewed, etc.)
- `crmSavedViews` — saved filter sets per entity type with `isDefault` flag
- `crmNotifications` / `notificationPreferences` — in-app notification rows; delivery modes `instant|digest_daily|off`
- `crmEnrichmentConfig` / `crmEnrichmentLog` — data enrichment config and audit log per tenant

---

## API surface

All routes under `app/api/portal/crm/` return `{ success, data | error }` and resolve tenant via `lib/active-client.ts`.

| Resource | Route | Methods |
|---|---|---|
| Contacts | `app/api/portal/crm/contacts/route.ts` | GET, POST |
| Contact detail | `app/api/portal/crm/contacts/[id]/route.ts` | GET, PATCH, DELETE |
| Contact send-email | `app/api/portal/crm/contacts/[id]/send-email/route.ts` | POST |
| Contact score | `app/api/portal/crm/contacts/[id]/score/route.ts` | POST |
| Contact dedup | `app/api/portal/crm/contacts/duplicates/route.ts` | GET |
| Contact merge | `app/api/portal/crm/contacts/merge/route.ts` | POST |
| Companies | `app/api/portal/crm/companies/route.ts` | GET, POST |
| Company detail | `app/api/portal/crm/companies/[id]/route.ts` | GET, PATCH, DELETE |
| Pipelines | `app/api/portal/crm/pipelines/route.ts` | GET, POST |
| Pipeline stages | `app/api/portal/crm/pipelines/[id]/stages/route.ts` | GET, POST |
| Deals | `app/api/portal/crm/deals/route.ts` | GET, POST |
| Deal detail | `app/api/portal/crm/deals/[id]/route.ts` | GET, PATCH, DELETE |
| Deal comments | `app/api/portal/crm/deals/[id]/comments/route.ts` | GET, POST |
| Deal artifacts | `app/api/portal/crm/deals/[id]/artifacts/route.ts` | GET, POST, DELETE |
| Proposals | `app/api/portal/crm/proposals/route.ts` | GET, POST |
| Proposal send | `app/api/portal/crm/proposals/[id]/send/route.ts` | POST |
| Contracts | `app/api/portal/crm/contracts/route.ts` | GET, POST |
| Contract sign-url | `app/api/portal/crm/contracts/[id]/sign-url/route.ts` | GET |
| Contract e-sign | `app/api/portal/crm/contracts/[id]/send-for-signature/route.ts` | POST |
| Custom fields | `app/api/portal/crm/custom-fields/route.ts` | GET, POST |
| Custom field values | `app/api/portal/crm/custom-fields/values/route.ts` | PUT (upsert) |
| Notifications | `app/api/portal/crm/notifications/route.ts` | GET |
| Analytics | `app/api/portal/crm/analytics/route.ts` | GET |
| Import | `app/api/portal/crm/import/route.ts` | POST |
| Export | `app/api/portal/crm/export/route.ts` | GET |
| Saved views | `app/api/portal/crm/saved-views/route.ts` | GET, POST |
| Scoring rules | `app/api/portal/crm/scoring-rules/route.ts` | GET, POST |
| Dashboard | `app/api/portal/crm/dashboard/route.ts` | GET |

Public (unauthenticated) proposal/contract signing: `app/api/proposals/[token]/route.ts`.

---

## MCP tools

All tools registered in `lib/mcp/tools/crm.ts` via `registerCrmTools()`. Scopes: `crm:read` / `crm:write`.

**Contacts:** `crm_contacts_search`, `crm_contacts_create`, `crm_contacts_update`

**Companies:** `crm_companies_search`, `crm_companies_create`, `crm_companies_update`

**Deals:** `crm_deals_list`, `crm_deals_get`, `crm_deals_create`, `crm_deals_update`, `crm_deals_move_stage`, `crm_deals_delete`

**Deal collaboration:** `crm_deal_comments_list`, `crm_deal_comments_create`, `crm_deal_comments_delete`, `crm_deal_artifacts_list`, `crm_deal_artifact_link`, `crm_deal_artifact_toggle_pin`, `crm_deal_artifact_unlink`

**Pipelines:** `crm_pipelines_list`, `crm_pipelines_create`, `crm_pipelines_update`, `crm_pipelines_add_stage`, `crm_pipelines_update_stage`

**Activities:** `crm_activities_list`, `crm_activities_create`

**Proposals:** `proposals_list`, `proposals_get`, `proposals_create`, `proposals_update`, `proposals_send`

**Contracts:** `contracts_list`, `contracts_get`, `contracts_create`, `contracts_void`

**Custom fields:** `crm_custom_fields_list`, `crm_custom_fields_create`, `crm_custom_fields_update`, `crm_custom_fields_delete`, `crm_custom_field_values_get`, `crm_custom_field_values_set`

**Views / scoring:** `crm_saved_views_list`, `crm_scoring_rules_list`

Most write tools use the approval-flow pattern (`stageOrApply`) rather than mutating directly — they emit a pending-change URL the user must confirm.

---

## UI surfaces

| Page | Route |
|---|---|
| CRM dashboard | `app/portal/crm/page.tsx` |
| Contacts list | `app/portal/crm/contacts/page.tsx` |
| Contact detail | `app/portal/crm/contacts/[id]/page.tsx` |
| Companies list | `app/portal/crm/companies/page.tsx` |
| Company detail | `app/portal/crm/companies/[id]/page.tsx` |
| Deals kanban | `app/portal/crm/deals/page.tsx` |
| Proposals list | `app/portal/crm/proposals/page.tsx` |
| Proposal detail / builder | `app/portal/crm/proposals/[id]/page.tsx` |
| Contract detail | `app/portal/crm/contracts/[id]/page.tsx` |
| Settings (custom fields, scoring, pipelines, notifications) | `app/portal/crm/settings/page.tsx` |

---

## Tests & gates

| Layer | Files |
|---|---|
| Unit (route handlers) | `tests/unit/api-portal-crm-*.test.ts`, `tests/unit/api-crm-*.test.ts` (10+ files) |
| Unit (components) | `tests/unit/app-crm-*.test.tsx`, `tests/unit/components-portal-crm-*.test.tsx` |
| Unit (MCP tools) | `tests/unit/mcp-tools-crm.test.ts`, `tests/unit/ai-portal-tools-crm*.test.ts` |
| Unit (lib helpers) | `tests/unit/crm-parse.test.ts`, `tests/unit/crm-helpers.test.ts`, `tests/unit/lib-crm-notifications.test.ts` |
| Unit (brain classify) | `tests/unit/brain-classify-crm.test.ts` |
| Integration (API) | `tests/integration/api/crm/` (companies, contacts, contracts, pipelines, proposals, import, saved-views, scoring-rules, custom-field-values, deal-comments, deal-artifacts) |
| Integration (components) | `tests/integration/crm/DealFilters.test.tsx`, `tests/integration/crm/NewDealModal.test.tsx` |
| E2E | `tests/e2e/portal-crm.spec.ts`, `tests/e2e/portal-crm-deals-baseline.spec.ts`, `tests/e2e/portal-crm-mutations.spec.ts`, `tests/e2e/portal-crm-extras.spec.ts`, `tests/e2e/portal-crm-notifications.spec.ts`, `tests/e2e/mcp-crm-search.spec.ts` |

Run after any data-access change: `bun test:tenancy`. Golden-path gate: `bun test:critical`.

---

## Cross-domain dependencies

**Company Brain / email pipeline** (`lib/brain/classify-crm.ts`): inbound emails processed by the brain call `upsertContactByEmail` (`lib/crm/contacts.ts`) to auto-create contacts, then propose CRM review items (`crm_contact_classify`). Brain suggestions endpoint at `app/api/portal/brain/crm-suggestions/route.ts`.

**Surveys auto-route**: public survey submission (`app/api/surveys/[slug]/route.ts`) evaluates `survey.scoringConfig.autoRouteToCrm`. When a respondent's score meets the threshold, the handler directly inserts a `crmDeals` row into the configured pipeline stage (best-effort, non-fatal).

**Email & Campaigns** (`lib/mcp/tools/email.ts`, `app/api/portal/crm/contacts/[id]/send-email/route.ts`): CRM contacts can be emailed directly; activity auto-log planned in Phase 3 of `.planning/crm-improvements/PLAN.md`.

**Bookings**: booking submission can trigger CRM contact creation / lead scoring (via `crmScoringRules`, event type `booking_made`).

**Notifications** cross-cutting: `lib/crm/notifications.ts` is consumed by the stale-deals cron (`app/api/cron/stale-crm-deals/`), deal-stage-change handlers, proposal lifecycle, and MCP approval-flow completions.

**Extension API** (`app/api/extension/v1/crm/`): browser extension surfaces contacts, companies, and deals outside the portal UI.

---

## Invariants & gotchas

- Every table is keyed by `clientId` (FK → `clients.id`, `onDelete: cascade`). Any query missing this filter is a tenancy leak — run `bun test:tenancy` after data-access changes.
- Tenant identity comes from `lib/active-client.ts` + site-resolver middleware, never from URL params alone.
- `crmContracts.documentHash` (SHA-256) is set at send-time for tamper detection; re-sending resets it.
- `crmProposals.clientToken` and `crmContracts.clientToken` are unique 64-char secrets — they enable public (unauthenticated) signing flows. Do not log or expose them in list responses.
- `crmCustomFieldValues` has a unique index `(customFieldId, entityId, entityType)` required by the upsert path (`ON CONFLICT DO UPDATE`). Removing it causes `23P10` errors.
- `crmEnrichmentConfig.ownApiKey` stores the key as plain text — the schema has a TODO to encrypt before production.
- `crm_contacts_search` MCP handler uses raw `db.execute(sql\`SELECT *\`)` intentionally — avoids Drizzle expanding columns that may not exist on the live DB when the schema has drifted ahead (column 42703 issue).
- `notificationPreferences` absence = `instant` delivery by design — migration is non-breaking for existing tenants.

---

## Planning notes

`.planning/crm-improvements/PLAN.md` documents a 5-phase roadmap. Phases 1–4 are largely shipped (custom fields, deal ownership, dedup/merge, analytics, lead scoring, saved views, email send, notifications, import/export, recurring revenue). Phase 5 (AI deal insights, visual workflow builder, website visitor tracking) is not yet implemented.

---

## Related

[[Surveys]], [[Email & Campaigns]], [[Company Brain & AI]], [[Bookings & Scheduling]]
