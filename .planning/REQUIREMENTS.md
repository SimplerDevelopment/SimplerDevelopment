# Requirements: Survey System Enhancement

**Defined:** 2026-04-05
**Core Value:** Clients can collect structured feedback and data from their audiences through branded, multi-channel surveys with actionable analytics.

## v1.0 Requirements

Requirements for initial milestone. Each maps to roadmap phases.

### Foundation & Schema

- [ ] **FOUND-01**: Response submission is wrapped in a database transaction to prevent responseCount race conditions
- [ ] **FOUND-02**: Shared condition evaluator (lib/survey-logic.ts) evaluates showIf and conditionalOptions consistently across builder preview and public form
- [ ] **FOUND-03**: Field IDs are immutable after a survey has received responses, preventing analytics corruption

### Conditional Logic & Piping

- [ ] **LOGIC-01**: User can configure conditional visibility rules (showIf) for any field via a visual rule builder in SurveyBuilder
- [ ] **LOGIC-02**: User can reference prior answers in question labels and help text using piping syntax (e.g., "You said {Q3_answer}")
- [ ] **LOGIC-03**: User can view a flow diagram visualizing page flow, skip logic, and conditional branching for multi-page surveys

### Response Management

- [ ] **RESP-01**: User can filter responses by date range, source type, and keyword search across answer values
- [ ] **RESP-02**: Partial responses are captured per-page so incomplete submissions are recoverable in the responses table
- [ ] **RESP-03**: User can add a file/image upload field type that accepts files via S3 presigned URLs with MIME validation and tenant isolation

### Scoring & Webhooks

- [ ] **SCORE-01**: User can define scoring rules per field so responses are auto-scored (NPS 0-10 categorization, CSAT averages, custom weighted scores)
- [ ] **SCORE-02**: Scored responses can auto-route leads to CRM deals based on configurable score thresholds
- [ ] **HOOK-01**: User can configure per-survey webhook URLs that receive response payloads with retry logic and delivery status tracking
- [ ] **HOOK-02**: Webhook deliveries are queued asynchronously (BullMQ) with exponential backoff retries

### Distribution & Follow-up

- [ ] **DIST-01**: User can configure email follow-up sequences triggered after survey submission with configurable delays
- [ ] **DIST-02**: Email follow-ups respect opt-in gates (respondent must have provided email and consented)
- [ ] **DIST-03**: User can publish a branded public results page at /s/[slug]/results with live chart visualizations (recharts)
- [ ] **DIST-04**: Public results page displays aggregated data only (no individual response data exposed)

### Real-Time & AI

- [ ] **REAL-01**: User can view a real-time response dashboard that updates via SSE as new responses arrive
- [ ] **REAL-02**: Real-time dashboard shows running totals, completion rate, and per-question distributions updating live
- [ ] **AI-01**: User can generate AI-powered summaries of text responses with theme extraction and sentiment analysis
- [ ] **AI-02**: AI summarization strips PII before sending to the LLM and caches results to avoid redundant API calls

### A/B Testing

- [ ] **AB-01**: User can create field variants for A/B testing with deterministic respondent assignment
- [ ] **AB-02**: A/B test results show completion rates and answer distributions per variant with statistical validity indicators

### PDF Output

- [ ] **PDF-01**: User can enable completion certificates that generate a branded PDF after survey submission
- [ ] **PDF-02**: PDF certificates use the survey's branding profile (colors, logo, fonts) and include respondent name and completion date

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Mobile

- **MOB-01**: Native React Native survey renderer screens with all field types
- **MOB-02**: Mobile-optimized file upload using expo-image-picker and expo-document-picker
- **MOB-03**: Offline survey completion with sync-on-reconnect

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile survey screens | Deferred to v2 -- high complexity, web surveys are mobile-responsive |
| Payment collection in surveys | Use dedicated booking/payment flows |
| Survey marketplace / template sharing | Too complex, low demand |
| Offline survey mode | Web-first platform, connectivity assumed |
| Real-time collaborative survey editing | Different domain than survey responses |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | -- | Pending |
| FOUND-02 | -- | Pending |
| FOUND-03 | -- | Pending |
| LOGIC-01 | -- | Pending |
| LOGIC-02 | -- | Pending |
| LOGIC-03 | -- | Pending |
| RESP-01 | -- | Pending |
| RESP-02 | -- | Pending |
| RESP-03 | -- | Pending |
| SCORE-01 | -- | Pending |
| SCORE-02 | -- | Pending |
| HOOK-01 | -- | Pending |
| HOOK-02 | -- | Pending |
| DIST-01 | -- | Pending |
| DIST-02 | -- | Pending |
| DIST-03 | -- | Pending |
| DIST-04 | -- | Pending |
| REAL-01 | -- | Pending |
| REAL-02 | -- | Pending |
| AI-01 | -- | Pending |
| AI-02 | -- | Pending |
| AB-01 | -- | Pending |
| AB-02 | -- | Pending |
| PDF-01 | -- | Pending |
| PDF-02 | -- | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 0
- Unmapped: 25

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after initial definition*
