---
type: domain-map
domain: surveys
status: active
date: 2026-06-09
sources:
  - lib/surveys/
  - lib/db/schema/surveys.ts
---

# Domain: Surveys

## Purpose

Multi-page, multi-field forms with branching logic, scoring, A/B variants, CRM auto-routing, post-submission email sequences, and a public recommendation engine. Surveys are first-class platform entities — every tenant gets the feature; service-guard checks prevent use by tenants without the `surveys` service flag.

---

## Key Entry Points

| Path | Role |
|---|---|
| `app/s/[slug]/page.tsx` | Public form renderer (renders `SurveyFormInline`) |
| `app/s/[slug]/results/page.tsx` | Public aggregate results page (opt-in, `publishResults=true`) |
| `app/api/surveys/[slug]/route.ts` | Public GET (fetch form) + POST (submit response); CORS-open |
| `app/api/surveys/[slug]/partial/route.ts` | Upsert in-progress partial response by sessionId |
| `app/api/surveys/[slug]/results/route.ts` | Public aggregate JSON (no individual rows exposed) |
| `app/api/surveys/[slug]/certificate/route.ts` | PDF completion certificate (opt-in, `certificateEnabled=true`) |
| `app/api/surveys/[slug]/upload/route.ts` | File field upload endpoint |
| `app/api/portal/surveys/route.ts` | Portal CRUD list + create |
| `app/api/portal/surveys/[id]/route.ts` | Portal CRUD get/update/delete |
| `app/api/portal/surveys/[id]/responses/route.ts` | Portal response listing + export |
| `app/api/portal/surveys/[id]/variants/route.ts` | A/B variant management |
| `app/api/portal/surveys/[id]/webhooks/route.ts` | Webhook CRUD |
| `app/api/portal/surveys/[id]/webhooks/[webhookId]/deliveries/route.ts` | Delivery audit log |
| `app/api/portal/surveys/[id]/email-sequences/route.ts` | Email sequence CRUD |
| `app/api/portal/surveys/[id]/ai-summary/route.ts` | Trigger / retrieve AI summary |
| `app/api/cron/process-survey-email-followups/route.ts` | Cron: send queued follow-up emails |
| `app/api/cron/surveys-zero-responses/route.ts` | Cron: nudge digest for zero-response surveys |

---

## Data Model

### `surveys` (primary)
Tenant-scoped (`clientId`). Status lifecycle: `draft` → `active` → `closed`. Key columns: `slug` (unique, public URL key), `fields` (jsonb `SurveyFieldDef[]`), `pages` (jsonb `SurveyPageDef[]`), `recommendation` (jsonb `SurveyRecommendationConfig`), `scoringConfig` (jsonb `SurveyScoringConfig`), `styling` (jsonb `SurveyStyling`), `publishResults`, `certificateEnabled`, `consentField`, `allowMultiple`, `requireEmail`, `closesAt`, `maxResponses`, `linkedType`/`linkedId` (link to email_campaign, crm_deal, pitch_deck, booking_page, website), `parentSurveyId` (fork pointer, non-FK). Index on `(clientId, updatedAt)`.

### `SurveyFieldDef` (inline JSON)
Fourteen field types: `text`, `textarea`, `number`, `email`, `phone`, `url`, `select`, `radio`, `checkbox`, `toggle`, `date`, `rating`, `heading`, `slider`, `page_break`, `file`. Each field carries: `id`, `label`, `required`, `order`, `page` (0-indexed), `showIf` (branching), `goToPage` (page-jump on option match), `conditionalOptions` (dynamic option lists), `scoring` (`FieldScoring`).

### `surveyResponses`
One row per submission: `answers` (jsonb), `respondentEmail`, `respondentName`, `source` (`link`/`email`/`embed`/`crm`/`booking`), `formName` (defaults `main`; allows custom HTML forms to share a survey row), `variantId` (FK to variant), `score` (integer, nullable when no scoring rules exist), `completedAt`.

### `surveyPartialResponses`
In-progress saves keyed on `(surveyId, sessionId)` — unique index `survey_partial_responses_survey_session_idx`. Marked `completed=true` on final submit.

### `surveyVariants`
A/B field sets per survey. Each has `weight` (integer, default 50) and `enabled`. Variant assignment via FNV-1a hash of `survey:{id}:{visitorId}` in `lib/surveys/variant-assign.ts`.

### `surveyWebhooks` + `surveyWebhookDeliveries`
Per-survey outbound webhooks with HMAC-SHA256 signing (`X-SD-Signature`). Delivery audit: one row per HTTP attempt; 3-attempt linear retry (1 s / 4 s / 16 s). Dispatcher in `lib/survey-webhooks/dispatcher.ts`; fires `response.submitted` event fire-and-forget via `setImmediate`.

### `surveyEmailSequences` + `surveyEmailSequenceSends`
Post-submission follow-up drip config (subject, bodyHtml, delayHours, optional conditionField/conditionValue). `surveyEmailSequenceSends` has unique index on `(sequenceId, surveyResponseId)` as idempotency guard — cron uses `onConflictDoNothing`.

### `surveyAiSummaries`
One-per-survey cached AI synthesis: `summary`, `sentiment`, `themes`, `perQuestion`.

---

## API Surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/surveys/[slug]` | None | Returns active survey + branding + picked variant fields |
| POST | `/api/surveys/[slug]` | None | Submit response; runs scoring + CRM auto-route + webhooks |
| POST | `/api/surveys/[slug]/partial` | None | Upsert partial response (RESP-02) |
| GET | `/api/surveys/[slug]/results` | None | Aggregate counts only; gated on `publishResults=true` |
| GET | `/api/surveys/[slug]/certificate` | None | PDF completion cert; gated on `certificateEnabled=true` |
| POST | `/api/surveys/[slug]/upload` | None | File field upload to S3 |
| GET/POST | `/api/portal/surveys` | Session | Tenant-scoped list/create |
| GET/PATCH/DELETE | `/api/portal/surveys/[id]` | Session | Full record including `recommendation`/`scoringConfig` |
| GET | `/api/portal/surveys/[id]/responses` | Session | Filtered response list; also drives CSV export |
| GET/POST/DELETE | `/api/portal/surveys/[id]/variants` | Session | A/B variant CRUD |
| GET/POST | `/api/portal/surveys/[id]/webhooks` | Session | Webhook registration |
| GET/DELETE | `/api/portal/surveys/[id]/webhooks/[id]/deliveries` | Session | Delivery audit log |
| GET/POST | `/api/portal/surveys/[id]/email-sequences` | Session | Follow-up sequence config |
| GET/POST | `/api/portal/surveys/[id]/ai-summary` | Session | AI summary trigger + retrieval |
| GET | `/api/portal/surveys/[id]/export` | Session | CSV export |
| GET/POST | `/api/portal/surveys/[id]/variants/stats` | Session | Variant performance stats |

All portal routes return `{ success, data | error }` envelope. Public routes also emit CORS headers (`Access-Control-Allow-Origin: *`) to support sandboxed iframe embeds.

---

## MCP Tools

Registered in `lib/mcp/tools/surveys.ts` via `registerSurveysTools`. All tools scope-guarded:

| Tool | Scope | Notes |
|---|---|---|
| `surveys_list` | `surveys:read` | Filtered by status; returns slim projection |
| `surveys_get` | `surveys:read` | Full row including fields/pages/recommendation |
| `surveys_list_responses` | `surveys:read` | Up to 500 rows; supports `since` ISO filter |
| `surveys_create` | `surveys:write` | Starts in `draft`; mints an approval URL (draft → active requires human approval) |
| `surveys_update` | `surveys:write` | Partial patch; re-mints approval URL on every call |
| `surveys_fork` | `surveys:write` | Clones all config into a new `draft` with `parentSurveyId` pointer |

Service guard: `requireService(clientId, 'surveys')` fires on all write tools — tenants without the surveys service receive a `service_denied` response.

---

## UI Surfaces

### Builder (portal)
- `app/portal/surveys/page.tsx` — list
- `app/portal/surveys/new/page.tsx` — creation wizard
- `app/portal/surveys/[id]/page.tsx` — tabbed detail: Overview / Edit / Responses / Flow / Share
- Key sub-components under `app/portal/surveys/[id]/_components/`: `QuestionEditor.tsx`, `QuestionList.tsx`, `QuestionTypePicker.tsx`, `SurveySettings.tsx`, `VariantsPanel.tsx`, `WebhooksPanel.tsx`, `EmailSequencesPanel.tsx`, `AiSummaryPanel.tsx`, `FlowDiagramTab.tsx`, `ResponseAnalytics.tsx`, `ResponseFiltersBar.tsx`
- Admin-side builder: `components/admin/SurveyBuilder.tsx`, `components/admin/SurveyRecommendationEditor.tsx`
- Dashboard widget: `components/portal/dashboard/widgets/SurveyResponsesWidget.tsx`

### Public `/s/<slug>`
- `app/s/[slug]/page.tsx` — renders `components/blocks/render/SurveyFormInline.tsx`; supports `?embed=1` (transparent bg, no branding footer) and `?hideTitle=1`
- `app/s/[slug]/results/page.tsx` — public aggregate results (DIST-03/DIST-04)

### Block embeds (CMS)
- `components/blocks/render/SurveyBlockRender.tsx` — embeds a survey inside a page/post block
- `components/blocks/render/SurveyInputBlockRender.tsx` — input-focused block variant
- `components/blocks/render/SurveyResultsBlockRender.tsx` — embeds the aggregate results widget
- `components/pitch-deck/SurveySlideRenderer.tsx` + `SurveyRecommendationRenderer.tsx` — pitch-deck slide integration

---

## Tests and Gates

| File | Layer | What it covers |
|---|---|---|
| `tests/unit/surveyScore.test.ts` | unit | `computeSurveyScore` — all three scoring types |
| `tests/unit/surveyLogic.test.ts` | unit | `showIf` branching, `goToPage` logic |
| `tests/unit/surveyEmailFollowupGate.test.ts` | unit | `isEligibleForFollowup`, `isTruthyAnswer`, consent gate |
| `tests/unit/survey-webhooks-dispatcher.test.ts` | unit | Retry loop, HMAC signing, SSRF guard |
| `tests/unit/surveyFlowDiagram.test.ts` | unit | Flow-diagram graph builder |
| `tests/unit/surveyPiiStrip.test.ts` | unit | PII redaction from response answers |
| `tests/unit/surveyFileUpload.test.ts` | unit | Upload validation |
| `tests/unit/surveyCertificateHelpers.test.ts` | unit | Certificate PDF helpers |
| `tests/unit/survey-response-filters.test.ts` | unit | Response filter predicates |
| `tests/unit/mcp-tools-surveys.test.ts` | unit | MCP tool registration + scope guards |
| `tests/unit/cron-survey-email-followups.test.ts` | unit | Cron worker eligibility + idempotency |
| `tests/unit/cron-surveys-zero-responses.test.ts` | unit | Zero-response nudge cron |
| `tests/unit/route-survey-*.test.ts` (×5) | unit | Public API route handlers |
| `tests/unit/components-survey-*.test.tsx` (×7) | unit | Portal UI components |
| `tests/e2e/portal-surveys.spec.ts` | e2e | Portal survey list + create |
| `tests/e2e/portal-surveys-mutations.spec.ts` | e2e | Edit / delete mutations |
| `tests/e2e/portal-surveys-detail-baseline.spec.ts` | e2e | Detail page tab baseline |
| `tests/e2e/survey-variants-lifecycle.spec.ts` | e2e | Full A/B variant flow |
| `tests/e2e/survey-branding-qa.spec.ts` | e2e | Branding profile application |

Run gates: `bun test` (unit) and `bun test:critical` (e2e golden path). No dedicated tenancy tag for surveys, but all portal routes resolve tenant via session and the data model has `clientId` on every table — covered by the global tenancy suite.

---

## Cross-Domain Dependencies

| Domain | How it couples |
|---|---|
| **CRM** | SCORE-02: on submit, if `scoringConfig.autoRouteToCrm.enabled` and `score >= minScore`, inserts a `crmDeals` row. `assertPipelineInClient` + `assertStageInClient` guards prevent cross-tenant config leakage. Surveys are also linkable to `crm_deal` / `crm_proposal` via `linkedType`/`linkedId`. |
| **Automations** | `emitEvent('survey.response_submitted', ...)` fires on every submit; the automation engine may trigger downstream actions. |
| **Email / Resend** | Follow-up sequences send via Resend. Notify-on-response uses platform email. |
| **Branding** | `brandingProfileId` FK → `brandingProfiles`; `getBrandingBySurveySlug` resolves CSS vars for public render. |
| **Blocks / CMS** | `SurveyBlockRender`, `SurveyInputBlockRender`, `SurveyResultsBlockRender` embed surveys inside website pages. Block registry entries in `lib/blocks/registry.ts`. |
| **Pitch Decks** | `surveys.recommendation` surfaces on deck slides via `SurveySlideRenderer` + `SurveyRecommendationRenderer`. |
| **Booking Pages** | Linkable via `linkedType='booking_page'`; source tracking on responses. |
| **S3** | File-type fields upload to S3 via `lib/s3/upload`; `lib/surveys/upload-validation.ts` enforces size/type limits. |

---

## Invariants and Gotchas

- **Draft → active requires approval.** `surveys_create` and `surveys_update` (MCP) mint an approval URL (`lib/mcp/approval-links.ts`). The public `/s/<slug>` route returns 403 for any survey whose `status != 'active'`. Direct portal PATCH to `status='active'` bypasses approval — the MCP path enforces it.
- **Branching: `showIf` vs `goToPage`.** `showIf` hides/shows a field (evaluated client-side). `goToPage` is an option-level page-jump on the current field — incompatible with `showIf` on the same field. The combinator on `ShowIfCondition` is `AND`-only for v1.
- **`formName` is required on POST.** Structured surveys set it to `'main'`; custom HTML forms that POST to the same survey endpoint must supply a distinct name. Missing `formName` returns 400.
- **maxResponses race condition.** The gate is checked before the transaction (pre-read), so two concurrent requests at exactly capacity can both pass. Documented in `.planning/phases/01-foundation-and-schema/01-RESEARCH.md` as Pitfall 5.
- **Scoring writes NULL, not 0, when no rules exist.** Consumers must distinguish "unscorable survey" (`score IS NULL`) from "scored zero".
- **Webhook dispatcher is fire-and-forget.** Launched via `setImmediate`; a webhook failure never fails the submission. Phase 4 plans to replace inline retries with BullMQ (TODO HOOK-02).
- **Email follow-up idempotency.** The cron uses `onConflictDoNothing` on `(sequenceId, surveyResponseId)` in `surveyEmailSequenceSends`. Two cron ticks cannot double-send.
- **`consentField` is nullable (back-compat).** When null, email presence alone gates follow-ups. When set, the answer must be truthy per `isTruthyAnswer` — missing key = no-consent, not implicit opt-in.
- **SSRF guard on webhooks.** `assertSafeUrl` is re-checked at send time (not just registration) to catch DNS rebinding. Redirects are disabled (`redirect: 'manual'`).
- **Variant field set validation.** If a variant is in play at submit time, required-field validation runs against the variant's fields, not the parent survey's fields.

---

## Planning Notes

- HOOK-02 (Phase 4): replace `lib/survey-webhooks/dispatcher.ts` inline retries with a BullMQ producer backed by Upstash Redis. The `dispatchSurveyResponseWebhooks` signature stays; only the body swaps.
- A/B variant stats endpoint (`/api/portal/surveys/[id]/variants/stats`) exists but conversion-rate analytics are basic — upgrade tracked separately.
- `publishResults` + aggregate endpoint deliberately expose no individual responses (DIST-03/DIST-04 privacy contract). Any future export from the public endpoint must go through the portal-authenticated `/api/portal/surveys/[id]/export` route.

---

## Related

- [[CRM]]
- [[CMS & Blocks]]
- [[Email Campaigns]]
- [[Pitch Decks]]
- [[Automations]]
