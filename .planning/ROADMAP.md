# Roadmap: Survey System Enhancement

## Overview

This milestone transforms the survey system from a basic data collection tool into a full-featured survey platform. Nine phases deliver in strict dependency order: schema stability and shared utilities first, then the conditional logic UI that depends on them, then response collection improvements, then the scoring and webhook processing layer, then distribution and follow-up, then visual and real-time features, then AI summarization, then A/B testing, and finally PDF certificate output. Every phase delivers a complete, independently verifiable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and Schema** - Fix responseCount race condition, extract shared condition evaluator, enforce immutable field IDs, and run all schema migrations
- [ ] **Phase 2: Conditional Logic UI and Piping** - Visual rule builder for showIf/conditionalOptions in SurveyBuilder and answer piping token support
- [ ] **Phase 3: Response Management** - Partial response capture, response filtering/search, and file/image upload field type
- [ ] **Phase 4: Scoring Engine and Webhooks** - Per-field scoring rules with CRM auto-routing and per-survey webhook delivery via BullMQ
- [ ] **Phase 5: Distribution and Email Follow-up** - Post-submission email sequences with opt-in gates and public results page with live charts
- [ ] **Phase 6: Visual and Real-Time Features** - Logic branching flow diagram and SSE-powered real-time response dashboard
- [ ] **Phase 7: AI Summarization** - On-demand AI summaries of text responses with PII stripping and result caching
- [ ] **Phase 8: A/B Testing** - Field variant assignment, completion rate comparison, and statistical validity indicators
- [ ] **Phase 9: PDF Certificates** - Branded PDF completion certificates generated via @react-pdf/renderer

## Phase Details

### Phase 1: Foundation and Schema
**Goal**: The survey system has a stable, correct foundation that all subsequent phases can depend on without risk of data corruption or logic divergence
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03
**Success Criteria** (what must be TRUE):
  1. Concurrent survey submissions do not desync the responseCount — submitting from two browser tabs simultaneously produces an accurate count
  2. The condition evaluator in SurveyBuilder preview and the public form produce identical visibility results for the same field/answer state
  3. Editing an existing survey field never reassigns its ID — the ID shown in the builder matches the ID stored against existing responses
  4. All five new schema tables (survey_partial_responses, survey_webhooks, survey_email_sequences, survey_variants, survey_ai_summaries) exist in the database with correct columns
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 2: Conditional Logic UI and Piping
**Goal**: Non-technical users can configure conditional field visibility rules visually in SurveyBuilder, and question text can reference prior answers using piping tokens
**Depends on**: Phase 1
**Requirements**: LOGIC-01, LOGIC-02, LOGIC-03
**Success Criteria** (what must be TRUE):
  1. User can open a "Conditional Logic" panel on any field and add a showIf rule (field + operator + value) without writing code — the field hides/shows in builder preview based on the rule
  2. User can type a piping token like `{Q3_answer}` in a question label and see the referenced answer substituted in the public form during live completion
  3. User can open a flow diagram tab that shows all pages and skip-logic branches as a visual DAG — each page is a node and each goToPage rule is a directed edge
  4. Compound AND/OR conditions can be configured in the conditional logic panel and evaluated correctly in both builder preview and public form
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 3: Response Management
**Goal**: Response data is complete, filterable, and extensible — partial completions are recovered, responses are searchable, and file attachments are supported
**Depends on**: Phase 1
**Requirements**: RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. A respondent who abandons a multi-page survey after page 2 appears in the responses table as a partial record with answers from pages 1 and 2 visible
  2. User can filter the responses list by date range, source type, and keyword — keyword search matches against answer values stored in the JSON blob
  3. User can add a file upload field to a survey and a respondent can upload an image or document — the file is stored in S3 under a tenant-isolated path and the response record contains the file URL
  4. Resuming a partial survey in the same browser session pre-populates previously entered answers
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 4: Scoring Engine and Webhooks
**Goal**: Survey responses can be automatically scored and routed, and external systems can receive response payloads reliably via webhook
**Depends on**: Phase 3
**Requirements**: SCORE-01, SCORE-02, HOOK-01, HOOK-02
**Success Criteria** (what must be TRUE):
  1. User can assign score values to a rating or select field in SurveyBuilder — after submission the response record shows a calculated total score
  2. User can configure a score threshold rule so that responses scoring above the threshold automatically create a CRM deal or update a contact
  3. User can add a webhook URL to a survey settings page — after each submission a signed POST payload arrives at that URL with full response data
  4. If a webhook endpoint returns a non-2xx response, delivery is retried automatically with exponential backoff and the delivery history is visible in the portal
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 5: Distribution and Email Follow-up
**Goal**: Survey submissions trigger configurable email sequences for opted-in respondents, and survey results can be shared publicly via a branded results page
**Depends on**: Phase 4
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. User can configure an email follow-up sequence on a survey — a respondent who checked the opt-in checkbox and submitted receives the configured follow-up email
  2. A respondent who did not check the opt-in checkbox does not receive follow-up emails regardless of sequence configuration
  3. User can enable public results on a survey and share the /s/[slug]/results URL — a visitor sees aggregated chart visualizations without any individual response data exposed
  4. The public results page updates to reflect new submissions without requiring a page reload (live chart data)
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 6: Visual and Real-Time Features
**Goal**: The survey portal shows a live response feed and a visual flow diagram of survey logic, giving users real-time operational awareness
**Depends on**: Phase 2, Phase 5
**Requirements**: REAL-01, REAL-02, LOGIC-03
**Success Criteria** (what must be TRUE):
  1. A user watching the real-time dashboard sees the response count increment within seconds of a new submission arriving — without refreshing the page
  2. The real-time dashboard shows running completion rate and per-question answer distributions that update live as new responses arrive
  3. The flow diagram correctly renders a multi-page survey with skip logic — pages appear as nodes, goToPage rules appear as directed edges, and orphaned nodes are visually flagged

Note: LOGIC-03 (flow diagram) is included here because it depends on the conditional UI from Phase 2 being complete to have meaningful content to render.
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 7: AI Summarization
**Goal**: Users can generate on-demand AI summaries of text responses that identify themes and sentiment without sending PII to the LLM
**Depends on**: Phase 5
**Requirements**: AI-01, AI-02
**Success Criteria** (what must be TRUE):
  1. User can click "Generate Summary" in the analytics tab and receive a structured summary of open-text responses showing extracted themes and a sentiment breakdown
  2. Email, phone, and name field values are stripped from the text sent to the LLM — only free-text answer content reaches the AI API
  3. Running "Generate Summary" a second time with no new responses returns the cached result instantly without making a new API call
  4. The summary card shows the number of responses it analyzed and a "regenerate" option that refreshes when new responses have arrived since last generation
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 8: A/B Testing
**Goal**: Users can create field variants for a survey and compare completion rates and answer distributions per variant with statistical validity indicators
**Depends on**: Phase 5
**Requirements**: AB-01, AB-02
**Success Criteria** (what must be TRUE):
  1. User can configure two variants of a field in SurveyBuilder — respondents are assigned to variant A or B deterministically based on session, not randomly per page load
  2. The A/B results panel shows completion rate per variant — if either variant has fewer than 50 responses a "not statistically significant" label is shown instead of a winner
  3. Answer distributions per variant are shown as side-by-side charts allowing direct comparison of response patterns
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

### Phase 9: PDF Certificates
**Goal**: Respondents can receive a branded PDF completion certificate after submitting a survey, generated server-side without Chromium dependencies
**Depends on**: Phase 1
**Requirements**: PDF-01, PDF-02
**Success Criteria** (what must be TRUE):
  1. User can enable completion certificates on a survey — after a respondent submits, a "Download Certificate" link appears on the thank-you page
  2. The downloaded PDF displays the survey's branding profile colors, logo, and fonts alongside the respondent's name and completion date
  3. The certificate generation route runs on Node.js runtime (not Edge) and produces a valid PDF without Puppeteer or Chromium
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Code fixes: transaction wrap, shared evaluator, field ID guard
- [ ] 01-02-PLAN.md — Schema migration: five new tables + drizzle-kit push

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Schema | 0/2 | Planned | - |
| 2. Conditional Logic UI and Piping | 0/TBD | Not started | - |
| 3. Response Management | 0/TBD | Not started | - |
| 4. Scoring Engine and Webhooks | 0/TBD | Not started | - |
| 5. Distribution and Email Follow-up | 0/TBD | Not started | - |
| 6. Visual and Real-Time Features | 0/TBD | Not started | - |
| 7. AI Summarization | 0/TBD | Not started | - |
| 8. A/B Testing | 0/TBD | Not started | - |
| 9. PDF Certificates | 0/TBD | Not started | - |
