---
kanban-plugin: board
type: spec
domain: surveys
status: active
date: 2026-06-17
sources:
  - lib/db/schema/surveys.ts
---

## To Test

- [ ] In-form payment field (Stripe)
- [ ] In-form e-signature field
- [ ] Route-to-CRM on submit
- [ ] Scoring + conditional logic
- [ ] A/B variant assignment on survey
- [ ] Post-submit sequence trigger
- [ ] Webhook CRUD + delivery audit log (register, update, delete; view delivery history)
- [ ] Email sequence CRUD (create sequence, update delay/condition, delete)
- [ ] AI summary trigger and retrieval (POST + GET /ai-summary)
- [ ] Partial response upsert persists in-progress answers (POST /api/surveys/[slug]/partial)
- [ ] Public aggregate results page renders when publishResults=true
- [ ] PDF completion certificate endpoint returns PDF when certificateEnabled=true
- [ ] Fork survey creates draft with parentSurveyId pointer
- [ ] closesAt enforcement: submission rejected after survey closes
- [ ] maxResponses cap: submission rejected when responseCount >= maxResponses
- [ ] allowMultiple=false blocks same-email second submission
- [ ] File field upload round-trip (POST /api/surveys/[slug]/upload → answer records S3 key)
- [ ] Cross-tenant isolation: survey from another tenant returns 404/403 on portal routes

## Testing


## Blocked


## Passed

- [ ] Survey CRUD for entitled tenant ✓
- [ ] Native CRM routing, scoring, A/B ✓ (no Zapier hop required)
- [ ] ✓ verified 2026-06-20: responses endpoint verified; analytics tab verified (TAB_INDEX fix applied)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No in-form payment field — see [[Competitive Gap Analysis 2026-06]]
- [ ] No in-form e-signature field — see [[Competitive Gap Analysis 2026-06]]
- [ ] No E2E coverage for webhook dispatcher fire-and-forget path (HOOK-02 BullMQ migration pending; current inline-retry path has only unit tests)
- [ ] No E2E covering survey-level branding override (SurveyStyling jsonb) — branding QA spec uses a hardcoded production slug, not a fixture survey


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
