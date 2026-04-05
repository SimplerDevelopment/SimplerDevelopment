# Feature Research

**Domain:** Survey platform — advanced features milestone
**Researched:** 2026-04-05
**Confidence:** MEDIUM-HIGH (major platforms verified via web, implementation details from official docs and established patterns)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist when they hear "advanced survey platform." Missing these makes the product feel unfinished against SurveyMonkey, Typeform, or Qualtrics.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Conditional visibility UI (showIf builder) | Every platform from Typeform to Google Forms has visual if/then rule builders — doing it in code is unacceptable for non-technical users | MEDIUM | Schema (`showIf`, `conditionalOptions`) already exists in types. Build UI on top. Rule builder: field + operator + value + action (show/hide). Support AND/OR compound conditions. |
| Response filtering / search / date range | Users need to find specific responses; raw paginated lists are unusable at scale | LOW-MEDIUM | Standard SaaS filter patterns: keyword search on text answers, field-level filters, date range picker with presets (Today, This Week, Last 30 Days). Qualtrics and QuestionPro both implement per-field response filtering. |
| File/image upload field type | Image receipts, document attachments, ID verification — all common survey use cases | MEDIUM | S3 presigned URL pattern (POST to S3 directly from browser). MIME type validation server-side (not just extension). Size limits configurable per survey. Store S3 key in JSON answer. Render thumbnail in response viewer. |
| Partial/incomplete response capture | 10–30% of respondents drop off mid-survey; losing that data is costly. Qualtrics auto-saves per page. | MEDIUM | Save to DB on each page navigation (already triggered by next/back). Distinguish `partial` vs `complete` status in responses table. Show abandonment rate per page in analytics. Configurable retention window. |
| Per-survey webhook URLs | Power users (developers, Zapier builders) expect a webhook endpoint they can point at their own systems | LOW | Store webhook URL + secret per survey. POST JSON payload on `response_submitted`. HMAC-SHA256 signature header. HTTPS only. Retry on failure (3x with exponential backoff). Log delivery attempts. |
| Response scoring / calculation fields | NPS, CSAT, quiz scores, weighted totals — all rely on auto-calculated values | MEDIUM | Two sub-features: (1) Score field type that computes from other fields using a formula; (2) Auto-routing after completion based on score ranges (e.g., NPS promoters get different thank-you). NPS formula: % promoters minus % detractors. CSAT: top-2-box percentage. |
| Survey piping (answer references in questions) | SurveyMonkey and Typeform both offer this. "Hi {{Q1}}, how did you enjoy {{Q3}}?" is expected personalization | MEDIUM | Token syntax like `{{field_id}}` or `{{field_label}}` in question text, answer labels, thank-you message. Resolved at render time from current response state. Pipe sender must be on a prior page (same-page piping not possible without real-time recalculation). |
| Public results page with live charts | SurveyMonkey Shared Data Pages, Typeform Response Summary — both offer shareable live dashboards | MEDIUM | Separate public route `/s/[slug]/results`. Toggle: share results on/off per survey. Charts match existing analytics dashboard. Password-protect option. Auto-updates as new responses arrive (polling or SSE is sufficient — full WebSocket not required here). |

### Differentiators (Competitive Advantage)

Features that go beyond the standard playbook and create stickiness specific to the SimplerDevelopment platform context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Logic branching visualization | Most platforms bury branching in per-question settings menus. A visual flow diagram lets builders see all paths at once — orphaned questions, circular refs, dead ends all visible | HIGH | Render survey flow as a DAG (directed acyclic graph). Nodes = questions/pages, edges = conditions. React Flow or similar library. Read-only first (editing in diagram is v2). Highlights selected question's inbound/outbound connections. Detects and flags loops or orphaned nodes. |
| Email follow-up sequences post-submission | Closes the loop between survey data and CRM nurture. Competitors require Zapier; native integration is compelling | HIGH | Trigger: `response_submitted`. Rules: condition on answer values (e.g., NPS < 7 → send detractor sequence). Email templates with piped answer values. Configurable delays (send immediately / after N days). Integrates with existing email campaign system. |
| AI-powered response summarization / sentiment | Open-text analysis at scale is the most requested feature in survey platforms in 2026. GPT-4o-class LLMs outperform dedicated sentiment models on nuanced survey text. | HIGH | Per-survey summary generated on demand (not real-time per response). Send batched open-text answers to LLM API. Return: overall sentiment (positive/neutral/negative), key themes, notable quotes. Sentiment stored per-response as a field. Cache results; re-run on demand. Cost management: only process text fields. |
| Real-time response dashboard (WebSocket) | Live event screens (conferences, town halls) need real-time updates without page refresh | MEDIUM | WebSocket server already exists. Subscribe to survey-specific channel. Push `response_received` event with aggregated delta. Dashboard components re-render with new counts/charts. Throttle to max 1 update/second per survey to prevent render thrash. Initial load via REST, updates via WS. |
| A/B testing (field variants) | Testing question wording or answer order is a research methodology need — rare in consumer platforms, high value for professional researchers | HIGH | Randomly assign respondents to variant A or B at session start. Store `variant` on response. Show completion rate and average score per variant in analytics. Statistical significance indicator (simple chi-square). Constraints: variants must be on the same page, same field type. |
| Native mobile survey screens (React Native) | Surveys sent via CRM or email to mobile contacts get a native app experience instead of a mobile web fallback | HIGH | React Native new architecture is default as of 2025. Reuse existing survey schema/field types. Offline-first: queue responses locally, sync on reconnect. File upload uses device camera/gallery. Progress bar and page navigation match web behavior. |
| Completion certificates / PDF generation | Training surveys, event attendance, compliance checks — all need a printable proof of completion | MEDIUM | Puppeteer (server-side, headless Chrome) is the recommended approach for pixel-accurate PDF rendering. HTML template with branding profile styles, respondent name/email, survey title, timestamp, optional score. Generate on-demand, store in S3, email link or offer download. jsPDF is client-side only and flattens text — avoid for branded certs. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Same-page conditional logic (hide/show within a single page) | Feels more dynamic and app-like | Requires real-time field watching and re-validation on every keystroke; conflicts with page-level partial save; creates ambiguous skip logic when piping depends on hidden fields | Use page breaks to separate conditional branches; showIf operates at page-navigation time, not keystroke time |
| Offline survey mode (React Native) | Mobile users in low-connectivity areas | Full offline sync requires conflict resolution, response queuing, and complex merge logic — disproportionate to the use case. Out of scope per PROJECT.md | Queue responses locally and sync on reconnect (soft offline: write first, transmit when connected) |
| Payment collection within surveys | Clients want to collect fees inline | Introduces PCI compliance scope, complex error handling for failed payments, and receipt management. Already explicitly out of scope. | Route to dedicated booking/payment flows post-submission via redirect URL |
| AI-generated surveys from prompts | Reduces creation effort | LLM-generated survey questions have known biases and may not reflect client intent; creates support burden when output is wrong | Provide AI-assisted suggestions for individual fields, not full surveys |
| Real-time collaborative editing (multi-cursor) | Multiple team members editing simultaneously | Operational transform or CRDT complexity far exceeds value for a survey builder used by 1-2 people at a time | Last-write-wins is sufficient; add a "survey is being edited" lock warning |
| Branching diagram editing (drag-to-connect) | Feels like a premium feature | Diagram-as-source-of-truth requires a completely different data model; makes the existing JSON field schema the rendering output of a graph, not the source. Would require significant schema migration. | Diagram is read-only visualization; all editing stays in the question sidebar |

---

## Feature Dependencies

```
[Conditional Visibility UI]
    └──requires──> [Existing showIf schema in types] (already done)
    └──enhances──> [Logic Branching Visualization]

[Survey Piping]
    └──requires──> [Multi-page surveys] (already done)
    └──requires──> [Field ID system] (already done)
    └──enhances──> [Email Follow-up Sequences] (pipe answers into emails)

[Response Scoring]
    └──requires──> [Rating/slider/number field types] (already done)
    └──enhances──> [Email Follow-up Sequences] (route by score)
    └──enhances──> [A/B Testing] (compare scores per variant)

[Partial Response Capture]
    └──requires──> [Multi-page surveys] (already done)
    └──enhances──> [Email Follow-up Sequences] (trigger on abandonment)
    └──enhances──> [Real-time Dashboard] (show in-progress count)

[File/Image Upload]
    └──requires──> [Existing S3 integration in platform]
    └──requires──> [Presigned URL API endpoint]

[Logic Branching Visualization]
    └──requires──> [Conditional Visibility UI] (needs conditions to visualize)
    └──requires──> [Existing skip logic (goToPage)] (already done)

[Email Follow-up Sequences]
    └──requires──> [Existing email campaign system]
    └──requires──> [Response Scoring] (for score-based routing — optional)
    └──requires──> [Survey Piping] (to personalize emails — optional)
    └──enhances──> [Partial Response Capture] (abandonment sequences)

[AI Response Summarization]
    └──requires──> [Responses stored with text field answers] (already done)
    └──enhances──> [Response Filtering] (filter by sentiment)

[A/B Testing]
    └──requires──> [Response collection with variant tagging]
    └──enhances──> [Analytics Dashboard] (split by variant)
    └──conflicts──> [Survey Piping on variant fields] (pipe source ambiguous if field is A/B variant)

[Native Mobile Screens]
    └──requires──> [Existing React Native app shell]
    └──requires──> [Survey public URL API] (already done)
    └──enhances──> [File Upload] (camera/gallery access)
    └──enhances──> [Partial Response Capture] (offline queue)

[Real-time Dashboard]
    └──requires──> [Existing WebSocket server]
    └──enhances──> [Analytics Dashboard] (live counts)
    └──enhances──> [Partial Response Capture] (show in-progress)

[Public Results Page]
    └──requires──> [Analytics data] (already done)
    └──requires──> [Per-survey toggle in settings]

[Completion Certificates / PDF]
    └──requires──> [Response completion record] (already done)
    └──requires──> [Puppeteer or PDF generation service]
    └──requires──> [Branding profiles] (already done)
    └──enhances──> [Response Scoring] (show score on cert)

[Per-survey Webhooks]
    └──requires──> [Response submitted event] (already done)
    └──enhances──> [Partial Response Capture] (webhook on partial save — optional)

[Response Filtering / Search]
    └──requires──> [Responses stored in DB] (already done)
    └──enhances──> [AI Summarization] (filter before summarizing)
```

### Dependency Notes

- **Logic Branching Visualization requires Conditional Visibility UI first:** There is nothing to visualize until users can build conditions via the UI. Build the rule builder first, then layer in the diagram.
- **A/B Testing conflicts with Survey Piping on variant fields:** If a field is a variant (A/B), piping its answer into a later question creates ambiguity about which variant's answer to pipe. Enforce: variant fields cannot be pipe sources.
- **Email Follow-up Sequences benefit from but do not require Scoring and Piping:** Sequences can trigger on raw answers (NPS < 7) without a scoring field; piping makes emails more personal but is additive.
- **Native Mobile requires the existing React Native app shell:** Not a greenfield mobile app. Adds survey screens to the existing app. Dependency is on app architecture, not survey data model.

---

## MVP Definition

### Launch With (v1 — highest ROI, unlocks other features)

- [x] Conditional Visibility UI — unblocks logic branching visualization; core product gap
- [x] Response Filtering / Search / Date Range — quality-of-life for all clients with >50 responses
- [x] File/Image Upload Field Type — expands use cases (intake forms, compliance)
- [x] Partial/Incomplete Response Capture — reduces data loss, 10–30% of respondents affected
- [x] Per-survey Webhook URLs — developer integrations; low complexity, high demand
- [x] Response Scoring / Calculation Fields — enables NPS/CSAT workflows already in templates

### Add After Validation (v1.x)

- [ ] Survey Piping — adds personalization once core logic is proven stable
- [ ] Logic Branching Visualization — builds on conditional UI; high UX value
- [ ] Email Follow-up Sequences — requires scoring to be useful for routing
- [ ] Real-time Response Dashboard — requires WebSocket wiring; high wow factor
- [ ] Public Results Page — low complexity once analytics exist

### Future Consideration (v2+)

- [ ] AI Response Summarization — high value but LLM cost/latency needs design; defer until response volume justifies it
- [ ] A/B Testing — niche audience (researchers); high complexity; defer until base analytics mature
- [ ] Native Mobile Survey Screens — requires React Native sprint; defer until web features complete
- [ ] Completion Certificates / PDF — low frequency use case; defer until client demand confirmed

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Conditional visibility UI | HIGH | MEDIUM | P1 |
| Response filtering / search / date range | HIGH | LOW | P1 |
| File/image upload field type | HIGH | MEDIUM | P1 |
| Partial response capture | HIGH | MEDIUM | P1 |
| Per-survey webhook URLs | MEDIUM | LOW | P1 |
| Response scoring / calculation fields | HIGH | MEDIUM | P1 |
| Survey piping | MEDIUM | MEDIUM | P2 |
| Logic branching visualization | MEDIUM | HIGH | P2 |
| Email follow-up sequences | HIGH | HIGH | P2 |
| Real-time response dashboard | MEDIUM | MEDIUM | P2 |
| Public results page with live charts | MEDIUM | MEDIUM | P2 |
| AI response summarization / sentiment | HIGH | HIGH | P3 |
| A/B testing (field variants) | LOW-MEDIUM | HIGH | P3 |
| Native mobile survey screens | MEDIUM | HIGH | P3 |
| Completion certificates / PDF generation | LOW-MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when P1 is stable
- P3: Future milestone — defer

---

## Competitor Feature Analysis

| Feature | SurveyMonkey | Typeform | Qualtrics | Our Approach |
|---------|--------------|----------|-----------|--------------|
| Conditional visibility | Visual rule builder, AND/OR, question or section level | One question at a time, linear flow | Advanced branching with embedded logic | Visual rule builder on existing showIf schema; support field-level AND/OR |
| File upload | Yes, with size/type limits | Yes, via file block | Yes, enterprise tier | S3 presigned POST; MIME validation; configurable limits |
| Partial saves | Auto-save per page, configurable retention | No explicit partial save | Auto-save, resume link | Auto-save on page navigation; `partial` status; completion reminder emails |
| Webhooks | Account-level only (not per-survey on base plan) | Per-form webhooks on paid plan | Enterprise webhooks | Per-survey webhooks with HMAC signing; more granular than SurveyMonkey |
| Response scoring | Quiz mode with scoring | Calculator fields (via hidden fields + logic) | Full scoring engine | Score field type; formula builder; auto-routing by score range |
| Piping | Question and answer piping; token syntax | Recall answers with @ syntax | Full piping + custom variables | `{{field_id}}` token; resolved per-page; pipe into questions, answers, thank-you |
| Public results page | Shared Data Pages; password-optional; live update (few min delay) | Response Summary; shareable link | Shared reports; configurable | Public `/results` route; toggle per survey; optional password |
| AI summarization | Word cloud, text analytics (basic) | No | Text iQ (enterprise sentiment) | On-demand LLM summarization; sentiment + themes + notable quotes; cached |
| A/B testing | Via branching workaround | No native A/B | Survey flow randomization | First-class variant field with random assignment and completion rate comparison |
| Mobile | Responsive web only | Responsive web only | Responsive + SDK | Native React Native screens; camera/gallery for file upload |
| PDF certificates | No | No | No | Puppeteer-based; branded; includes score; stored in S3 |
| Logic flow diagram | No | No | Survey Flow (tree view, not DAG) | React Flow DAG; read-only; highlights orphaned nodes and circular refs |

---

## Edge Cases to Address Per Feature

### Conditional Visibility UI
- Condition references a field that was deleted → validate and warn on save
- Circular conditions (A shows B, B shows A) → detect and block
- Multiple conditions on same field with conflicting operators → last rule wins, or surface conflict warning
- Conditions on multi-select checkboxes → support "contains" operator, not just "equals"

### File/Image Upload
- Upload abandonment (file selected, tab closed) → presigned URL expires; temp S3 key auto-purged after 24h
- Duplicate file names in same survey response → use UUID-prefixed S3 keys
- Virus/malware scanning → flag for later (not MVP); document the gap
- Survey closed after file chosen but before submitted → reject upload with "survey closed" error

### Partial Response Capture
- User completes page 3, closes, comes back — which page do they resume at? → store `lastCompletedPage` index
- Privacy: some respondents don't want partial saves → add disclosure on first page; allow opt-out if survey is configured to do so
- Partial response retention policy → configurable per survey (24h / 7d / 30d / forever)
- Partial counted in maxResponses limit? → No; only complete responses count against limit

### Per-survey Webhooks
- Target endpoint returns 500 or times out → retry 3x with exponential backoff (1s, 5s, 30s); log failure
- Endpoint permanently fails → mark webhook as erroring; notify survey owner via email after N consecutive failures
- Webhook payload with file upload answers → include S3 URL, not raw file content

### Response Scoring
- Score formula references a field not answered (field was hidden by conditional logic) → treat as 0 or null; document behavior
- NPS calculation requires minimum response count to be meaningful → show "not enough responses" if n < 10
- Score used in routing + A/B test variant → routing should evaluate after variant assignment

### Survey Piping
- Pipe token references unanswered question → render empty string; do not show raw token to respondent
- Pipe from a file upload field → not supported; validate and warn in builder
- Pipe in answer options (not just question text) → supported; resolve at page-render time
- Pipe references a field on a skipped page → treat as unanswered

### Logic Branching Visualization
- Very large surveys (50+ questions) → paginated or zoom-to-fit view; lazy render off-screen nodes
- Survey with no conditions → show linear flow (still useful for overview)
- Diagram state vs builder state diverge → diagram is always derived from builder state; no independent editing

### Email Follow-up Sequences
- Respondent unsubscribes from follow-up → honor immediately; do not re-send
- Trigger condition uses a field that was conditionally hidden → evaluate on stored answer; if null, treat condition as false
- Multiple sequences for same survey → allow; respondent matches first sequence whose conditions pass

### A/B Testing
- Odd number of respondents → round-robin assignment ensures even split over time
- Variant field deleted mid-collection → freeze split; mark affected responses as "variant_deleted"
- Statistical significance calculation → display confidence interval only when n ≥ 30 per variant (warn otherwise)

### Native Mobile Screens
- Survey requires file upload on mobile → use ImagePicker / DocumentPicker
- Push notification for survey invite → deep link to survey screen with pre-filled respondent info
- Survey with 20+ pages → swipe navigation with summary progress indicator, not full progress bar

### Real-time Dashboard
- High-volume survey (100+ simultaneous respondents) → throttle WebSocket broadcasts to 1/second per survey; aggregate deltas on server
- Dashboard tab left open overnight → reconnect on visibility change; re-fetch state via REST on reconnect
- Multiple admin tabs open → all subscribe to same channel; each independently renders state

### AI Response Summarization
- Survey with no open-text fields → show "No text responses to summarize"
- LLM API unavailable or rate-limited → queue the job; show "Analysis pending" state
- Respondent PII in text answers → consider prompt-level redaction; document risk in implementation phase
- Re-running summary after new responses → invalidate cache and re-process; show "Last summarized: [date]"

### Public Results Page
- Survey owner disables results sharing after URL has been shared → return 404 with polite message
- Password-protected page → password stored as bcrypt hash; no brute-force protection needed at this scale
- Charts on public page vs admin analytics → public page shows aggregate only; no individual response data exposed

### Completion Certificates / PDF
- Respondent name not collected → use email or "Respondent [ID]"
- Survey has no score → omit score section from template
- Certificate for partial response → not issued; only complete responses qualify
- PDF generation timeout (>30s) → async job; email download link when ready

---

## Sources

- [SurveyMonkey: Question & Answer Piping](https://help.surveymonkey.com/en/surveymonkey/create/question-answer-piping/)
- [SurveyMonkey: Shared Data Pages](https://help.surveymonkey.com/en/surveymonkey/analyze/shared-data-pages/)
- [Qualtrics: Filtering Responses](https://www.qualtrics.com/support/survey-platform/data-and-analysis-module/data/filtering-responses/)
- [Qualtrics: Incomplete Survey Responses](https://www.qualtrics.com/support/survey-platform/survey-module/survey-options/partial-completion/)
- [SurveyJS: Conditional Logic and Dynamic Texts](https://surveyjs.io/form-library/documentation/design-survey/conditional-logic)
- [SurveyJS: Text Piping](https://surveyjs.io/stay-updated/blog/how-to-use-text-piping-in-surveys)
- [AWS: Implementing Secure File Uploads to S3 at the Edge](https://aws.amazon.com/blogs/networking-and-content-delivery/implementing-secure-file-uploads-to-amazon-s3-at-the-edge-choosing-the-right-pattern/)
- [AWS: Presigned POST for File Uploads](https://www.webiny.com/blog/upload-files-to-aws-s3-using-pre-signed-post-data-and-a-lambda-function-7a9fb06d56c1)
- [involve.me: Partial Submissions Feature](https://www.involve.me/blog/partial-submissions)
- [QuestionPro: Prevent Partial Responses](https://www.questionpro.com/blog/prevent-partial-and-incomplete-survey-responses/)
- [Alchemer: Account Webhooks](https://help.alchemer.com/help/account-webhooks)
- [Webhook Security: HMAC Signing](https://www.hookbase.app/blog/webhook-security-guide)
- [Survalyzer: A/B Testing in Surveys](https://survalyzer.com/ab-testing-surveys/)
- [QuestionPro: A/B Testing](https://www.questionpro.com/help/A-B-Testing.html)
- [NHSJS: LLMs vs Neural Networks for Sentiment Analysis on Survey Data](https://nhsjs.com/2025/a-case-study-of-sentiment-analysis-on-survey-data-using-llms-versus-dedicated-neural-networks/)
- [Puppeteer: PDF Generation](https://pptr.dev/guides/pdf-generation)
- [Medium: Dynamic HTML to PDF in Next.js with Puppeteer](https://medium.com/front-end-weekly/dynamic-html-to-pdf-generation-in-next-js-a-step-by-step-guide-with-puppeteer-dbcf276375d7)
- [WebSockets vs SSE for Real-time Dashboards](https://dev.to/crit3cal/websockets-vs-server-sent-events-vs-polling-a-full-stack-developers-guide-to-real-time-3312)
- [React Native: State of React Native 2025](https://results.stateofreactnative.com/en-US/)
- [Retently: NPS, CSAT, CES Metric Calculations](https://www.retently.com/blog/customer-satisfaction-metrics/)
- [Lensym: Survey Branching Logic Guide 2026](https://lensym.com/blog/survey-branching-logic-guide)

---

*Feature research for: Survey platform advanced features milestone*
*Researched: 2026-04-05*
