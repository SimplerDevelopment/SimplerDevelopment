# Project Research Summary

**Project:** SimplerDevelopment Survey System Enhancement — Advanced Features Milestone
**Domain:** Survey platform — logic, analytics, automation, AI, and mobile expansion
**Researched:** 2026-04-05
**Confidence:** HIGH (stack npm-verified; architecture from direct codebase inspection; features from live competitor platforms)

## Executive Summary

This milestone adds 15 advanced features to an existing, functional survey system built on Next.js 16, Drizzle ORM, and PostgreSQL. The codebase already has the core primitives — multi-page surveys, `showIf`/`goToPage` schema, S3 uploads, Resend email, Anthropic SDK, and an event-bus automation engine — so virtually all new features are additive extensions rather than greenfield builds. The recommended approach is to layer features in dependency order: schema and shared logic utilities first, then data capture improvements, then scoring/experimentation, then external integrations, then visual/AI features, and finally output generation and mobile.

The six most impactful features for the current client base are the conditional visibility UI builder, response filtering/search, file upload field, partial response capture, per-survey webhooks, and response scoring. These six are high-user-value at low-to-medium implementation cost and unblock all downstream features. They should ship as a single cohesive v1 milestone before any of the differentiator features (AI summarization, A/B testing, mobile, PDF certificates) are started.

The primary risks in this build are not feature complexity — most patterns are well-established — but implementation sequencing mistakes. Three non-negotiable early fixes prevent cascading damage later: (1) wrap the `responseCount` increment in a transaction to prevent desync under concurrent load, (2) extract a shared `evaluateCondition()` utility before building any conditional UI so the builder and public form never diverge, and (3) define immutable field IDs before scoring and piping depend on them. Skip any of these in Phase 1 and the cost of recovery scales with every feature added afterward.

## Key Findings

### Recommended Stack

The existing stack (Next.js 16, React 19, Drizzle, PostgreSQL, Resend, Anthropic SDK, S3, Expo/React Native) covers the majority of what is needed. Seven new packages address specific gaps. All versions were verified against the npm registry on 2026-04-05.

**Core new technologies:**
- `@xyflow/react@^12.10.2`: Interactive flow diagram for logic visualization — industry standard, React 19 compatible, replaces the deprecated `reactflow` package
- `@react-pdf/renderer@^4.3.3`: Server-side PDF certificate generation — pure JS, no Chromium binary, works in Next.js Route Handlers on Node.js runtime; Puppeteer is explicitly ruled out due to serverless deployment incompatibility
- `recharts@^3.8.1`: Real-time charting for response dashboards and public results — built on D3/SVG, React 19 compatible, integrates naturally with state-driven WebSocket or SSE data
- `ai@^6.0.146` + `@ai-sdk/anthropic@^3.0.66`: Vercel AI SDK 6 adds `generateObject()` for typed structured output (sentiment scores, theme arrays) — required over raw `@anthropic-ai/sdk` which lacks this capability
- `posthog-js@^1.364.7` + `posthog-node@^4.x`: A/B testing, feature flags, and analytics in one tool — first-class Next.js 15 support, open-source, no need for Statsig at this scale
- `bullmq@^5.73.0`: Reliable webhook delivery queue backed by Redis — prevents slow external endpoints from blocking survey submission; requires Upstash Redis (serverless, free tier sufficient)
- `expo-image-picker@~55.0.14` + `expo-document-picker@~55.0.11`: Native file selection for mobile survey file upload fields — first-party Expo SDK 54 packages, zero config on managed workflow

Key constraint: `@react-pdf/renderer`, `bullmq`, and `ai` SDK all require Node.js runtime — they are incompatible with Next.js Edge runtime. Route handlers using these must explicitly set `export const runtime = 'nodejs'`.

### Expected Features

**Must have (table stakes — v1 launch):**
- Conditional visibility UI builder — the `showIf`/`conditionalOptions` schema already exists; this adds the visual rule-building interface non-technical users require
- Response filtering / search / date range — raw paginated response lists are unusable at scale; keyword search + field filters + date presets are baseline expectations
- File / image upload field type — S3 presigned POST pattern already exists in the codebase; adds intake forms, compliance, and ID verification use cases
- Partial / incomplete response capture — 10–30% of respondents drop off mid-survey; per-page saves recover that data
- Per-survey webhook URLs — low complexity, high developer demand; HMAC-signed POST on submission
- Response scoring / calculation fields — enables NPS, CSAT, quiz scoring workflows that existing templates already anticipate

**Should have (competitive differentiators — v1.x):**
- Survey piping (answer interpolation via `{{fieldId}}` tokens) — adds personalization; depends on stable field IDs and conditional UI
- Logic branching visualization (read-only DAG) — highest UX differentiation; requires conditional UI to be useful; `@xyflow/react` is the correct library
- Email follow-up sequences — native CRM integration without Zapier; requires scoring for routing; immediate-send only in v1, scheduled sends in v1.x
- Real-time response dashboard — SSE-based; existing WebSocket claim in PROJECT.md needs validation before committing to WS approach
- Public results page with live charts — API endpoint already exists; page + recharts is additive

**Defer (v2+):**
- AI response summarization / sentiment — high value but LLM cost/latency design needed; defer until response volume justifies it
- A/B testing (field variants) — niche audience, high analytics UI complexity; defer until base analytics mature
- Native mobile survey screens — substantial React Native sprint; defer until web features are complete and stable
- Completion certificates / PDF generation — low-frequency use case; confirmed defer until client demand establishes ROI

### Architecture Approach

The existing architecture cleanly separates public layer (`/s/[slug]/*`), portal layer (`/portal/surveys/[id]/*`), service layer (automation engine, S3, branding), and data layer (surveys + survey_responses JSON blobs). New features integrate at well-defined points: new DB tables, additive field type extensions, new event registrations on the existing `onEvent()` bus, and new Route Handler files. The 984-line portal detail page is at the edge of maintainability and must be refactored into per-tab components before new tabs are added — this is a prerequisite, not a nice-to-have.

**Major components and their extension points:**
1. `SurveyBuilder.tsx` — gains `ConditionalLogicPanel.tsx` component; `SurveyFieldDef` type union extended with `file`, `image`, `score` types
2. `/s/[slug]/page.tsx` — gains partial save calls per page advance; piping token resolution; score calculation; variant assignment
3. `lib/automation/event-bus.ts` — gains `survey.response_submitted` and `survey.partial_saved` event types; webhook dispatcher and email sequence handler register via `onEvent()`
4. `lib/db/schema.ts` — gains 5 new tables: `survey_partial_responses`, `survey_webhooks`, `survey_email_sequences`, `survey_variants`, `survey_ai_summaries`; plus column additions to `surveys` (`show_public_results`, `ab_test_enabled`) and `survey_responses` (`variant_id`)
5. New portal tab components — `ResponsesTab`, `AnalyticsTab`, `LogicTab`, `SettingsTab` (extracted from the monolithic detail page before new tabs are added)
6. New lib utilities — `lib/survey/scoring.ts`, `lib/survey/piping.ts`, `lib/survey/webhook-dispatcher.ts`, `lib/survey/ai-summary.ts`

The real-time dashboard recommendation is SSE (Server-Sent Events) via a Next.js Route Handler, not WebSockets — SSE is simpler, serverless-compatible, and sufficient for one-directional count updates. The PROJECT.md claim of an existing WebSocket server needs clarification before any WS-dependent work begins.

### Critical Pitfalls

1. **responseCount desync under concurrent submissions** — Fix in Phase 1: wrap the INSERT + UPDATE in a single transaction, or derive count from `COUNT(*)` with a covering index. Recovery after the fact requires a one-time correction query. Any feature that gates on `responseCount` (maxResponses, A/B sample sizing, analytics) uses wrong data if this is not fixed first.

2. **Conditional logic evaluator split between builder and public form** — Extract `lib/survey-logic.ts` with a pure `evaluateCondition(field, answers): boolean` function before any conditional UI is built. Both the builder preview and `/s/[slug]/page.tsx` must import from this single location. If the evaluators diverge, every new condition type requires two fixes and behavior differences are invisible until a respondent reports them.

3. **JSON field ID instability breaks scoring, piping, and filtering** — `genId()` in `SurveyBuilder.tsx` must never be called on existing fields — only on field creation. Historical answers keyed to an old ID become orphaned. This rule must be enforced before scoring formulas and piping references are built to depend on IDs.

4. **PDF generation failure in serverless production** — Puppeteer requires a Chromium binary that exceeds Vercel's serverless function constraints. Use `@react-pdf/renderer` exclusively. This decision must be made before any certificate implementation begins — the wrong choice here is non-trivial to undo post-deployment.

5. **Email follow-up sequences sent without explicit opt-in** — Survey `requireEmail` collection is not marketing opt-in. Add an explicit `emailFollowUpOptIn` boolean field to `survey_responses`. The sequence engine must gate all sends on this field. Sending without opt-in risks CAN-SPAM/GDPR violations that damage the platform's sending domain reputation.

6. **Portal detail page state explosion** — The 984-line portal detail page must be decomposed into per-tab components before the third new tab is added. Each tab component fetches its own data on activation; the parent owns only `activeTab`, `survey` metadata, and `saving` state.

## Implications for Roadmap

Based on research, the architecture research recommends a 6-phase build order driven by dependency chains. The FEATURES.md MVP definition aligns with Phases 1–4. The following is the recommended phase structure with rationale derived from combined research.

### Phase 1: Foundation and Schema
**Rationale:** All features in subsequent phases depend on a stable schema, immutable field IDs, a shared condition evaluator, and a correct `responseCount`. These fixes cost little now and prevent exponentially expensive recoveries later.
**Delivers:** Database migrations for all 5 new tables; field type union extended; `lib/survey-logic.ts` shared evaluator with unit tests; `responseCount` transaction fix; immutable field ID enforcement in `SurveyBuilder.tsx`
**Addresses:** Table stakes prerequisite work (not user-visible, but enables everything)
**Avoids:** responseCount desync (Pitfall 1), conditional evaluator split (Pitfall 2), field ID instability (Pitfall 3)
**Research flag:** Standard patterns — no additional research needed

### Phase 2: Conditional Visibility UI and Survey Piping
**Rationale:** `showIf` and `conditionalOptions` are already in the schema; this phase adds the visual builder interface that makes those fields usable by non-technical users. Piping is a zero-schema-change frontend feature that pairs naturally here. Both must be complete before the logic flow diagram is built.
**Delivers:** `ConditionalLogicPanel.tsx` in SurveyBuilder (AND/OR compound conditions, field + operator + value UI); `{{fieldId}}` piping token resolution in public form and token insertion UI in builder; portal detail page refactored into per-tab components
**Addresses:** Conditional Visibility UI (P1 table stakes), Survey Piping (P2 differentiator)
**Avoids:** Portal detail page state explosion (Pitfall 6); piping + conditional interaction (Pitfall 9)
**Research flag:** Standard patterns — well-documented; no additional research needed

### Phase 3: Response Management
**Rationale:** These three features — partial capture, filtering, and file upload — share the response data model and should be delivered together as a coherent improvement to how response data is collected and queried.
**Delivers:** Per-page partial saves with session resume; `survey_partial_responses` table; response filtering/search UI with JSONB query params; file/image upload field type with S3 presigned PUT and tenant-isolated key paths
**Uses:** Existing `lib/s3/upload.ts`, existing responses API route (extended), `survey_partial_responses` table from Phase 1 migration
**Implements:** Response Management layer
**Addresses:** Partial response capture (P1), Response filtering/search (P1), File/image upload field type (P1)
**Avoids:** Partial response duplicate records (Pitfall 5), S3 file upload tenant isolation failure (Pitfall 4)
**Research flag:** Standard patterns for filtering and S3; partial capture state machine warrants careful design review during planning

### Phase 4: Scoring Engine and Webhooks
**Rationale:** Response scoring is a P1 feature that enables NPS/CSAT workflows and is required for score-based routing in email sequences. Webhooks are the lowest-complexity P1 item; they are placed here because they depend on the event bus being in good shape (Phase 1) and the response submission flow being complete (Phase 3).
**Delivers:** `score` field type with `scoreMap`, `scoreWeight`, `scoreFormula`; score calculation in public form and server-side validation; score-based `goToPage` routing; per-survey webhook endpoints with HMAC-SHA256 signatures; BullMQ queue for reliable async delivery; SSRF protection on webhook URL validation; webhook CRUD UI in Settings tab
**Uses:** `bullmq` + Upstash Redis (new), existing `lib/automation/event-bus.ts`, existing `onEvent()` pattern
**Addresses:** Response scoring (P1), Per-survey webhooks (P1)
**Avoids:** Blocking submission handler on webhook delivery (ARCHITECTURE anti-pattern 2)
**Research flag:** BullMQ + Upstash Redis integration is well-documented but Redis provisioning may need coordination with infrastructure — verify before implementation

### Phase 5: Distribution and Email Sequences
**Rationale:** Email follow-up sequences require scoring (Phase 4) to be useful for score-based routing and require the event bus webhook patterns established in Phase 4. The public results page is additive and low complexity once recharts is available.
**Delivers:** `survey_email_sequences` table; immediate-send follow-up triggered on `survey.response_submitted`; opt-in checkbox field for sequences; unsubscribe handling; `survey_email_sequences` CRUD API and portal UI; `/s/[slug]/results` public results page with recharts bar/line charts; `showPublicResults` flag on surveys
**Uses:** Resend (existing), `recharts` (new), existing `GET /api/surveys/[slug]/results` endpoint
**Addresses:** Email follow-up sequences (P2), Public results page (P2)
**Avoids:** Email sent without opt-in (Pitfall 11 — CAN-SPAM/GDPR)
**Research flag:** Email opt-in compliance model needs legal/product review before implementation; scheduled send (delayed sequences) deferred to v1.x and needs job queue design

### Phase 6: Visual and Real-Time Features
**Rationale:** Logic visualization requires conditional UI (Phase 2) to have meaningful content to render. Real-time dashboard is placed here after the response pipeline is stable so the SSE stream is emitting reliable data.
**Delivers:** `SurveyFlowDiagram.tsx` read-only DAG visualization of goToPage/showIf rules using `@xyflow/react`; detection and highlighting of orphaned nodes and circular references; SSE `/api/portal/surveys/[id]/stream` endpoint; analytics tab live count updates; room-scoped event broadcasting
**Uses:** `@xyflow/react` (new), SSE via Next.js ReadableStream (no new dependency)
**Addresses:** Logic branching visualization (P2), Real-time response dashboard (P2)
**Avoids:** WebSocket room scoping failure (Pitfall 10); flow diagram DOM overload on large surveys (virtualize off-screen nodes)
**Research flag:** Confirm whether PROJECT.md's referenced "WebSocket server" exists and is wired to surveys before committing to SSE vs WS approach — this is the one unresolved architecture question

### Phase 7: AI Summarization
**Rationale:** Deferred from v1 deliberately — high value but LLM cost and latency require design. Placed here after response volume from earlier phases can justify the compute cost and inform prompt design.
**Delivers:** `survey_ai_summaries` caching table; `lib/survey/ai-summary.ts` using `generateObject()` from Vercel AI SDK 6; `POST /api/portal/surveys/[id]/ai-summary`; `SurveyAiSummary.tsx` card in analytics tab; PII stripping before LLM API calls; cache invalidation on new response thresholds; 200-response batch cap
**Uses:** `ai@^6.0.146` + `@ai-sdk/anthropic@^3.0.66` (new), existing `@anthropic-ai/sdk`
**Addresses:** AI response summarization / sentiment (P3)
**Avoids:** AI summarization called per response save (performance trap); PII sent to LLM (security mistake)
**Research flag:** PII handling strategy needs documented decision before implementation; LLM cost model needs review against expected response volumes

### Phase 8: A/B Testing
**Rationale:** Niche audience (professional researchers), complex analytics UI, and statistical validity requirements make this the highest-complexity non-mobile feature. Placed last among web features to allow base analytics to mature.
**Delivers:** `survey_variants` table; deterministic session-based variant assignment (hash-based, not random per request); `variant_id` on `survey_responses`; variant CRUD API; completion rate comparison with statistical confidence suppressed below 50 responses per variant; PostHog experiment integration
**Uses:** `posthog-js` + `posthog-node` (new)
**Addresses:** A/B testing (P3)
**Avoids:** Client-side-only variant assignment (Pitfall 7), A/B testing without statistical validity (Pitfall 7)
**Research flag:** Statistical significance display logic needs design review; PostHog experiment SDK integration pattern for Next.js 16 needs validation

### Phase 9: PDF Certificates and Mobile
**Rationale:** Both features deliver output/access to a different surface (print, native device) and are independent of each other and of earlier phases. PDF is low-frequency but has a clear implementation path; mobile is high-effort but reuses existing public APIs entirely.
**Delivers:** `GET /api/surveys/[slug]/certificate?responseId=` using `@react-pdf/renderer`; branding-profile-integrated certificate layout (colors, logo, font, score); async generation with S3 storage and signed download URL; React Native survey screens (`SurveyScreen.tsx`, `SurveyThankYouScreen.tsx`) consuming existing `/api/surveys/[slug]` endpoints; native file upload via `expo-image-picker` / `expo-document-picker`; 7 priority field type renderers (text, textarea, radio, select, rating, toggle, slider)
**Uses:** `@react-pdf/renderer@^4.3.3` (new), `expo-image-picker@~55.0.14` + `expo-document-picker@~55.0.11` (new, Expo project)
**Addresses:** Completion certificates / PDF generation (P3), Native mobile survey screens (P3)
**Avoids:** PDF generation failure in serverless (Pitfall 8 — never use Puppeteer); mobile API response including CSS vars and portal-only fields (integration gotcha)
**Research flag:** `@react-pdf/renderer` App Router compatibility warrants a proof-of-concept before full implementation; React Native field renderer scope (15 field types) should be validated against client demand before committing to all types

### Phase Ordering Rationale

- Schema and shared utilities must precede every feature that depends on them — this is the core lesson from the pitfalls research. Deferring the `evaluateCondition` extraction or the `responseCount` transaction fix to "whenever it becomes a problem" means the problem will appear mid-sprint on a feature that is twice as hard to debug.
- Features are grouped by the data model layer they operate on: schema/utilities (Phase 1), builder UI (Phase 2), response collection (Phase 3), response processing (Phase 4), response distribution (Phase 5), response visualization (Phase 6), response intelligence (Phase 7), experimentation (Phase 8), output/mobile (Phase 9).
- The P1 features (FEATURES.md MVP definition) map to Phases 1–4. All six P1 features can ship as a cohesive milestone before any P2/P3 work begins.
- A/B testing is intentionally last among web features because it generates the most analytics debt and requires the most mature response pipeline to be useful.

### Research Flags

Phases needing deeper research during planning:
- **Phase 4:** BullMQ + Upstash Redis provisioning — verify infrastructure requirements and Upstash connection string pattern in Next.js environment before writing webhook queue code
- **Phase 6:** WebSocket server existence — confirm whether the "existing WebSocket server" referenced in PROJECT.md is wired to the survey domain before choosing SSE vs WS for the real-time dashboard
- **Phase 7:** PII handling for AI summarization — requires a documented decision on what fields are stripped before the LLM API call; has compliance implications
- **Phase 8:** PostHog experiment SDK for Next.js 16 — the instrumentation-client.ts pattern is documented for Next.js 15.3+; verify compatibility with Next.js 16.1.1
- **Phase 9 (PDF):** `@react-pdf/renderer` App Router proof-of-concept — build a minimal certificate endpoint before building the full feature; the library is validated but App Router streaming behavior with PDF bytes needs confirmation

Phases with well-established patterns (skip research-phase):
- **Phase 1:** Database migrations, transaction patterns, TypeScript type unions — standard Drizzle ORM patterns
- **Phase 2:** Conditional UI builder and token-based piping — well-documented patterns with multiple reference implementations
- **Phase 3:** S3 presigned PUT uploads, partial save state machine, JSONB filtering — all have established patterns with existing codebase references
- **Phase 5:** Resend transactional email and public results page — existing email infrastructure in place; recharts integration is additive

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified against npm registry on 2026-04-05; React 19 / Next.js 16 compatibility confirmed for all new packages |
| Features | MEDIUM-HIGH | Competitor feature analysis from live platforms (SurveyMonkey, Typeform, Qualtrics); implementation details from official docs and established patterns; some edge cases flagged in FEATURES.md need per-feature design decisions |
| Architecture | HIGH | Based on direct codebase inspection of all referenced files; integration points mapped to actual file paths; one unresolved question (WebSocket server) explicitly flagged |
| Pitfalls | HIGH | 11 critical/moderate pitfalls identified from both codebase inspection and web research; recovery costs and phases specified; this research file has the highest actionability of the four |

**Overall confidence:** HIGH

### Gaps to Address

- **WebSocket server claim in PROJECT.md:** Before Phase 6, verify whether a persistent WebSocket server process exists and is connected to survey events, or whether SSE is the correct default approach. This affects the real-time dashboard design significantly.
- **Scheduled email sends in follow-up sequences:** Phase 5 implements immediate-send only. A `scheduled_jobs` table with a cron API route (`/api/cron/process-jobs`) is the recommended next step for v1.x. This needs a design decision on whether to use a database-backed scheduler or integrate BullMQ's delayed jobs (already required for webhooks in Phase 4).
- **PII redaction strategy for AI summarization:** Phase 7 requires a documented decision on which fields are considered PII (email, phone, name, free-text fields) and how they are handled before the LLM API call. This has GDPR implications and should be reviewed before Phase 7 begins.
- **Mobile field renderer scope:** Phase 9 specifies 7 priority field type renderers for React Native. A client demand validation should determine whether the remaining 8 field types (file, image, score, date, matrix, ranking, signature, NPS) are needed at launch or can ship incrementally.
- **Recharts `Cell` component deprecation:** STACK.md notes that `recharts@3.x` deprecates the `Cell` component in favor of a `shape` prop. Any chart implementation using `Cell` for custom bar colors will need to use the updated API.

## Sources

### Primary (HIGH confidence)
- npm registry (live, 2026-04-05) — all new package versions and React 19 / Next.js 16 compatibility
- Direct codebase inspection: `lib/db/schema.ts`, `lib/automation/event-bus.ts`, `lib/s3/upload.ts`, `app/api/surveys/[slug]/route.ts`, `app/portal/surveys/[id]/page.tsx`, `components/admin/SurveyBuilder.tsx`, `app/s/[slug]/page.tsx`, `package.json`
- [xyflow.com](https://xyflow.com/) — @xyflow/react migration from reactflow, React 19 support
- [react-pdf.org](https://react-pdf.org/) — @react-pdf/renderer v4 docs, Next.js Route Handler compatibility
- [ai-sdk.dev](https://ai-sdk.dev/docs/introduction) — Vercel AI SDK 6 `generateObject()` API
- [posthog.com/docs/libraries/next-js](https://posthog.com/docs/libraries/next-js) — Next.js 15 integration (instrumentation-client.ts pattern)
- [docs.bullmq.io](https://docs.bullmq.io/) — BullMQ 5.x Upstash Redis compatibility
- [docs.expo.dev](https://docs.expo.dev/versions/latest/sdk/imagepicker/) — Expo SDK 54 image/document picker

### Secondary (MEDIUM confidence)
- SurveyMonkey, Typeform, Qualtrics help documentation — competitor feature analysis for table stakes definition
- [SurveyJS conditional logic docs](https://surveyjs.io/form-library/documentation/design-survey/conditional-logic) — condition operator patterns
- [NHSJS: LLM sentiment analysis on survey data](https://nhsjs.com/2025/a-case-study-of-sentiment-analysis-on-survey-data-using-llms-versus-dedicated-neural-networks/) — AI summarization approach validation
- [WebSockets vs SSE analysis](https://dev.to/crit3cal/websockets-vs-server-sent-events-vs-polling-a-full-stack-developers-guide-to-real-time-3312) — real-time dashboard approach rationale
- [PostgreSQL SELECT FOR UPDATE](https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/) — responseCount concurrency fix

### Tertiary (needs validation during planning)
- PROJECT.md claim of existing WebSocket server — not verified in codebase; affects Phase 6 design
- Next.js 16.1.1 + PostHog instrumentation-client.ts — documented for 15.3+, needs confirmation for 16.x
- `@react-pdf/renderer` App Router streaming — multiple community reports of successful use, no official Next.js 16 guide

---
*Research completed: 2026-04-05*
*Ready for roadmap: yes*
