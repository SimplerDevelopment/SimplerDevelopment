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

- [ ] Post-submit sequence trigger — needs spec

## Testing


## Blocked


## Passed

- [ ] ✓ verified 2026-06-20 — Route-to-CRM on submit (cov-u4.spec.ts)
- [ ] Survey CRUD for entitled tenant ✓
- [ ] Native CRM routing, scoring, A/B ✓ (no Zapier hop required)
- [ ] ✓ verified 2026-06-20: responses endpoint verified; analytics tab verified (TAB_INDEX fix applied)
- [ ] ✓ verified 2026-06-20 — A/B variant assignment on survey (survey-variants-lifecycle.spec.ts)
- [ ] ✓ verified 2026-06-20 — Webhook CRUD + delivery audit log (register, update, delete; view delivery history) (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Email sequence CRUD (create sequence, update delay/condition, delete) (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — AI summary trigger and retrieval (POST + GET /ai-summary) (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Partial response upsert persists in-progress answers (POST /api/surveys/[slug]/partial) (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public aggregate results page renders when publishResults=true (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — PDF completion certificate endpoint returns PDF when certificateEnabled=true (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — closesAt enforcement: submission rejected after survey closes (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — maxResponses cap: submission rejected when responseCount >= maxResponses (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Cross-tenant isolation: survey from another tenant returns 404/403 on portal routes (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Scoring + conditional logic (surveys-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — allowMultiple=false blocks same-email second submission (surveys-coverage.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No in-form payment field — see [[Competitive Gap Analysis 2026-06]]
- [ ] No in-form e-signature field — see [[Competitive Gap Analysis 2026-06]]
- [ ] No E2E coverage for webhook dispatcher fire-and-forget path (HOOK-02 BullMQ migration pending; current inline-retry path has only unit tests)
- [ ] No E2E covering survey-level branding override (SurveyStyling jsonb) — branding QA spec uses a hardcoded production slug, not a fixture survey
- [ ] GAP (no implementation): Fork survey creates draft with parentSurveyId pointer — fork is implemented only as MCP tool `surveys_fork`, no portal REST endpoint; portal E2E cannot exercise this path
- [ ] GAP (no portal E2E path): File field upload round-trip (POST /api/surveys/[slug]/upload → answer records S3 key) — requires S3 credentials not available in test environment


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
