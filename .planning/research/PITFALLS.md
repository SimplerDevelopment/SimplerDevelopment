# Pitfalls Research

**Domain:** Survey platform feature expansion (Next.js + Drizzle ORM + PostgreSQL)
**Researched:** 2026-04-05
**Confidence:** HIGH (codebase inspected directly; supplemented with web research)

---

## Critical Pitfalls

### Pitfall 1: responseCount Desync Under Concurrent Submissions

**What goes wrong:**
The existing submission handler does `UPDATE surveys SET responseCount = responseCount + 1` immediately after `INSERT INTO survey_responses`. At low traffic this appears correct. Under concurrent submissions — high-volume campaigns, embed links shared publicly — two requests read `responseCount = N` simultaneously, both write `N + 1`, and one increment is silently lost. After thousands of responses the stored count may be 10–30% lower than actual. Any feature that gates on `responseCount` (maxResponses limit, A/B test sample sizing, analytics totals) uses the wrong number.

**Why it happens:**
The increment is a separate statement outside a transaction. The two statements are not atomic. The current code path (`app/api/surveys/[slug]/route.ts` lines 93–108) relies on sequential execution that Postgres does not guarantee without explicit locking.

**How to avoid:**
Wrap the INSERT and UPDATE in a single transaction. Alternatively, drop `responseCount` entirely and derive it from `COUNT(*)` on `survey_responses` at query time with a covering index on `surveyId`. For features that need fast counts (maxResponses gate), use `SELECT COUNT(*) ... FOR UPDATE` inside the transaction that inserts the response.

**Warning signs:**
- `survey.responseCount` does not match `SELECT COUNT(*) FROM survey_responses WHERE survey_id = ?`
- maxResponses limit allows more submissions than configured

**Phase to address:**
Phase 1 (Foundation fixes) — before partial response capture and real-time dashboard are added, both of which increase write volume.

---

### Pitfall 2: Conditional Logic Evaluation Inconsistency Between Builder and Public Form

**What goes wrong:**
`showIf` and `conditionalOptions` are already in the TypeScript type in `SurveyBuilder.tsx`. The public form at `app/s/[slug]/page.tsx` must evaluate the same logic at render time. When the builder adds new condition operators (AND/OR groups, "contains", "not equal") as part of the conditional UI feature, the evaluation logic must be duplicated or shared. If the portal preview evaluates differently from the public form, a survey that tests fine in preview breaks for respondents.

**Why it happens:**
The builder and the public form are separate React trees with no shared evaluation module. Developers add new condition types in the builder first, ship it, and discover the public form still uses the old single-field equality check.

**How to avoid:**
Extract a pure `evaluateCondition(field, answers): boolean` function into a shared utility (`lib/survey-logic.ts`) before building the conditional UI. Both the builder preview and the public form import from this single location. Write unit tests for the evaluator — they are fast and catch every edge case.

**Warning signs:**
- `showIf` evaluation logic copied into both `SurveyBuilder.tsx` and `app/s/[slug]/page.tsx`
- Any new condition type added in only one place

**Phase to address:**
Phase 2 (Conditional visibility UI) — the shared evaluator must exist before the builder UI is built.

---

### Pitfall 3: JSON Field Storage Breaks Filtering, Scoring, and Piping at Scale

**What goes wrong:**
`survey_responses.answers` is a JSON blob keyed by field ID. This works fine for storing and displaying responses. It becomes a problem when response filtering, scoring, and piping all need to query or transform specific field values server-side. Postgres `jsonb` operators work but are slow without generated columns or GIN indexes. More critically, when a field is deleted and re-added (new ID), historical answers keyed to the old ID become orphaned — scoring formulas and piping references silently return empty.

**Why it happens:**
JSON blobs trade query flexibility for schema flexibility. The tradeoff is accepted deliberately in the project (per PROJECT.md), but its downstream consequences for these new features are not accounted for.

**How to avoid:**
- Add `jsonb` type to `answers` column (currently typed as plain `json`) and create a GIN index for survey IDs with high response volumes.
- For scoring and piping, resolve field references at write time: store `{ fieldId, fieldLabel, value }` triples, not just `{ fieldId: value }`. This makes historical answers self-describing.
- Treat field IDs as immutable. Never allow the builder to regenerate IDs on edit — only on field creation. The `genId()` function in `SurveyBuilder.tsx` must never be called on existing fields.

**Warning signs:**
- Scoring formulas referencing a field return 0 for responses submitted before the field was last saved
- Filtering by a specific answer value requires loading all responses into memory

**Phase to address:**
Phase 1 (Foundation) — the index and ID stability rules must be in place before scoring and filtering features are built.

---

### Pitfall 4: File Upload Field Creates Public S3 Path Without Tenant Isolation

**What goes wrong:**
The existing S3 upload at `app/api/media/upload/route.ts` uploads to a shared prefix. Survey file uploads from anonymous public respondents must be isolated by survey and tenant. If the S3 key is derived naively from the filename or a timestamp, files from one tenant's survey are accessible to anyone with a direct URL, and a respondent can guess or enumerate other submissions.

**Why it happens:**
The existing upload route was built for authenticated portal users uploading their own media. Extending it to unauthenticated survey respondents introduces a new trust model that is easy to miss.

**How to avoid:**
- S3 keys for survey file uploads must follow the pattern: `surveys/{clientId}/{surveyId}/responses/{uuid}/{filename}`.
- Use presigned PUT URLs with a 15-minute expiry. Never proxy the binary through the Next.js API route — that will hit the 4.5 MB body limit on Vercel's edge runtime and create unnecessary bandwidth.
- Store only the S3 key in `answers`, not the full URL. Construct signed GET URLs at display time to enforce access control.
- Validate file type and size server-side before issuing the presigned URL, not just on the client.

**Warning signs:**
- Upload endpoint accessible without authentication and without survey context validation
- S3 keys contain only timestamp or original filename
- Full public S3 URL stored in `answers` JSON

**Phase to address:**
Phase 3 (File upload field type) — security model must be defined before the first line of upload code is written.

---

### Pitfall 5: Partial Response Capture Creates Orphaned and Duplicate Records

**What goes wrong:**
Per-page saves for partial responses are deceptively complex. A naive implementation inserts a new row on every page navigation and inserts another completed row on final submission — leaving both in the database. `responseCount` then double-counts. The analytics page shows inflated numbers. The responses tab shows duplicate entries. If the respondent refreshes and restarts, a third partial record is created.

**Why it happens:**
The simplest implementation of "save on page advance" is an INSERT. It takes one extra step to recognize that partial saves are updates to a single in-progress record.

**How to avoid:**
- On first page advance, insert a row with `completedAt = NULL` and return the response ID to the client (store in `sessionStorage`).
- Subsequent page advances PATCH the existing row by ID.
- On final submission, set `completedAt = NOW()`.
- `responseCount` increments only on final submission (completedAt set), not on partial saves.
- The public form API must accept an optional `responseId` param to identify an in-progress session.
- Add a DB-level partial index: `CREATE INDEX ON survey_responses (survey_id) WHERE completed_at IS NULL` to make partial response cleanup queries fast.

**Warning signs:**
- Multiple rows in `survey_responses` with the same `respondentEmail` and sequential `createdAt` within minutes
- `responseCount` does not match `COUNT(*) WHERE completed_at IS NOT NULL`

**Phase to address:**
Phase 4 (Partial response capture) — data model must be defined before any API route is written.

---

### Pitfall 6: Portal Detail Page Grows Past Maintainability Threshold

**What goes wrong:**
`app/portal/surveys/[id]/page.tsx` is already 984 lines with 6 tabs. Adding response filtering UI, a flow diagram, scoring config, webhook settings, A/B testing controls, and a real-time dashboard will push it past 2,500 lines. At that size: state variables for each tab interfere, every render re-evaluates all tab logic, tab-switching causes visible jank, and new developers cannot reason about the file.

**Why it happens:**
The initial implementation put all tab content inline in one file because it was fast to build. Each feature addition continues the pattern without refactoring.

**How to avoid:**
Before adding any new tab content, extract each tab into its own component:
- `<ResponsesTab surveyId={id} />`
- `<AnalyticsTab surveyId={id} />`
- `<LogicTab fields={fields} />`
- `<SettingsTab survey={survey} />`

Each tab component fetches its own data only when the tab is active (not on initial page load). The parent page owns minimal state: `activeTab`, `survey` metadata, `saving`.

**Warning signs:**
- The page component has more than 20 `useState` declarations
- Any `useEffect` that is only relevant to one tab

**Phase to address:**
Phase 2 or before — refactor the detail page before adding the third new tab's worth of content.

---

### Pitfall 7: A/B Testing Without Statistical Validity Yields Misleading Conclusions

**What goes wrong:**
A/B testing at the field-variant level means each survey collects variants in parallel. Without minimum sample enforcement, clients will declare a winner after 12 responses and ship the "better" variant. The winning variant is noise. The feature generates false confidence rather than insight.

**Why it happens:**
Most product teams ship the UI (show variant A vs B, show completion rates) and leave statistical validity as "the client's responsibility." Survey platforms with proper A/B testing enforce minimum sample sizes at the platform level.

**How to avoid:**
- Do not show completion rate comparison until each variant has at least N responses (configurable, default 50 per variant).
- Show a "not enough data" state with a sample-size progress indicator until the threshold is reached.
- When selecting which variant to show a respondent, use deterministic assignment (hash respondentId or sessionId + surveyId) — not random per request. This prevents the same respondent seeing both variants across sessions.
- Store the variant assignment in the response row, not just in client state.

**Warning signs:**
- Variant assignment happens purely client-side
- Completion rate comparison visible with < 30 responses per variant
- No variant assignment stored in `survey_responses`

**Phase to address:**
Phase 6 (A/B testing) — the schema for variant assignment must be decided before the first variant is created.

---

### Pitfall 8: PDF Certificate Generation Fails on Vercel/Serverless

**What goes wrong:**
Puppeteer requires a Chromium binary (~170 MB). Vercel's serverless function size limit is 250 MB compressed and the Lambda execution environment lacks required system libraries (`libnss3`, etc.). A PDF generation endpoint that works locally fails silently or crashes on production. The compressed bundle may also exceed Vercel's limits, preventing deployment entirely.

**Why it happens:**
PDF generation is commonly developed locally where Chromium is installed system-wide. The developer sees it work in `next dev`, deploys, and the route returns 500.

**How to avoid:**
- Use `@sparticuz/chromium-min` (not full `puppeteer`) paired with `puppeteer-core`. Host the Chromium binary in S3 and reference it via `CHROMIUM_PATH` env var at runtime.
- Alternatively, use `@react-pdf/renderer` for certificate generation — it is pure JS with no binary dependency, works in any serverless environment, and is better suited for structured certificate layouts.
- Do not use Puppeteer to render React components — the HTML-based approach is fragile and environment-dependent. Use `@react-pdf/renderer` to compose the certificate as PDF primitives directly.
- Generate PDFs asynchronously: accept the request, queue the generation job, return a job ID, deliver the PDF via signed S3 URL when ready.

**Warning signs:**
- `import puppeteer from 'puppeteer'` (full package) in any API route
- PDF generation tested only in `next dev`
- No Chromium binary hosting strategy defined

**Phase to address:**
Phase 8 (PDF certificates) — library decision must be made before any implementation starts.

---

### Pitfall 9: Survey Piping Breaks When Source Field Is Skipped Via Conditional Logic

**What goes wrong:**
Survey piping inserts the answer to Field A into the label or help text of Field B. When conditional logic hides Field A for some respondents (because `showIf` evaluates false), the piped reference renders as empty string or as the raw token (e.g., `{{field_abc123}}`). This looks like a bug to respondents and cannot be caught in the builder because the builder previewer shows the happy path.

**Why it happens:**
Piping and conditional logic are built as separate features. Their interaction is not explicitly designed — it surfaces only when both are active in the same survey.

**How to avoid:**
- Enforce a constraint in the builder: fields used as piping sources cannot have `showIf` conditions applied to them, unless a fallback value is explicitly configured.
- The piping evaluator must check whether the source field was shown to this respondent before substituting the value. If not shown, substitute the configured fallback, not empty string.
- Piping from open-ended text fields should be explicitly warned against in the builder UI — a 200-word answer piped into a question title is unreadable.

**Warning signs:**
- Piping source fields can also have `showIf` conditions with no fallback configured
- Piping substitution happens purely at render time with no fallback handling

**Phase to address:**
Phase 7 (Survey piping) — the interaction model with conditional logic must be documented before implementation.

---

### Pitfall 10: Real-Time Dashboard WebSocket Connections Not Scoped to Survey

**What goes wrong:**
The existing WebSocket server is a general event bus. Connecting the real-time response dashboard naively means every portal user in the tenant receives every survey event, and the client must filter. At high response volumes this floods clients with events they discard. Worse: if the WebSocket room is keyed by `clientId` only, a user viewing Survey A's dashboard receives events from Survey B and C.

**Why it happens:**
The existing event bus pattern (`lib/automation/event-bus.ts`) was designed for automation engine events, not for UI data synchronization. It is tempting to reuse it without adding room-level scoping.

**How to avoid:**
- WebSocket rooms for the real-time dashboard must be scoped to `survey:{surveyId}`.
- The server emits response events only to the room for that specific survey.
- Dashboard clients subscribe only to their survey's room on mount and unsubscribe on unmount.
- Implement a rate-limiting throttle (emit at most one update per 2 seconds per survey) to prevent UI thrashing during high-volume bursts.
- For the public results page (live charts), treat it as a separate, unauthenticated subscription with no personally identifiable data in the payload.

**Warning signs:**
- WebSocket events keyed only by `clientId`
- Dashboard client filtering events by `surveyId` in the browser

**Phase to address:**
Phase 9 (Real-time dashboard) — room scoping must be the first design decision.

---

### Pitfall 11: Email Follow-Up Sequences Send to Respondents Who Never Opted In

**What goes wrong:**
A survey respondent submits their email to complete the survey. An email follow-up sequence is triggered post-submission. The respondent did not consent to marketing emails — they only agreed to submit a survey response. Sending a sequence to them without explicit opt-in violates CAN-SPAM (for US recipients) and GDPR (for EU recipients). Complaints generate spam flags that degrade the sending domain's reputation for all outgoing platform email.

**Why it happens:**
Survey response email collection (`requireEmail`) is conflated with email marketing opt-in. The distinction is easy to miss when building the follow-up sequence UI.

**How to avoid:**
- Add an explicit opt-in checkbox field to surveys when a follow-up sequence is configured. This field must be separate from `requireEmail`.
- Store opt-in status on the `survey_responses` row: `emailFollowUpOptIn: boolean`.
- The sequence engine must gate sends on `emailFollowUpOptIn = true`. No opt-in = no sequence, regardless of what the survey creator configured.
- Include a one-click unsubscribe link in every sequence email. Process unsubscribes within 10 business days (CAN-SPAM minimum) but aim for immediate.

**Warning signs:**
- Follow-up sequence triggers for all responses where `respondentEmail IS NOT NULL` with no opt-in check
- No unsubscribe handling in the sequence email templates

**Phase to address:**
Phase 10 (Email follow-up sequences) — opt-in model must be defined before any sequence email is sent.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Duplicate `showIf` evaluation in builder and public form | Faster first-ship | Every new condition type requires two fixes; divergence is inevitable | Never — extract shared utility before first condition type ships |
| Inline tab content in 984-line detail page | No refactor needed now | Unmaintainable past 3 new tabs; state explosion; render performance degrades | Never for new tab additions — refactor first |
| Store S3 full public URL in `answers` JSON | No signed URL generation needed | No access control on uploads; exposes bucket structure; can't revoke | Never for user-submitted files |
| Increment `responseCount` outside transaction | Simple increment statement | Desync under concurrent load; wrong maxResponses gate; wrong analytics | Acceptable only for dev/staging (single-user load) |
| A/B variant selection client-side | No DB schema change needed | Same respondent sees both variants; variants can't be analyzed per-response | Never — variant assignment must be server-side and persisted |
| Use `puppeteer` full package for PDF | Works locally | Deployment bloat; fails on Vercel; CI/CD may break | Never on Vercel — use `@sparticuz/chromium-min` or `@react-pdf/renderer` |
| AI summarization on every response save | Simplest trigger | LLM API costs scale linearly with response volume; rate limits under bursts | Acceptable only if summarization is explicitly triggered, not automatic |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| S3 file upload (survey field) | Proxying binary through Next.js API route | Issue presigned PUT URL from API; client uploads directly to S3; store only the S3 key |
| Webhook per survey | Sending webhook synchronously in submission handler | Queue the webhook delivery; return 201 to respondent immediately; retry failed webhooks with exponential backoff |
| Email follow-up via existing automation engine | Reusing `survey.response_submitted` event without opt-in check | Add `emailFollowUpOptIn` field to event payload; automation engine rules must gate on it |
| React Native survey screens | Fetching full survey JSON including all branding fields | Define a mobile-specific API response shape that omits CSS vars and portal-only fields |
| AI summarization | Sending full response text directly to LLM per submission | Batch: collect responses, summarize on demand or on schedule, cache the result |
| Public results page WebSocket | Using the authenticated portal WebSocket room | Create a separate unauthenticated subscription endpoint that emits only aggregate counts (no PII) |
| CRM integration source tracking | Storing `sourceId` as a loose string with no validation | Validate that `sourceId` references an existing CRM deal or contact before storing; prevents orphaned source references |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Results route loads all responses into memory for aggregation | `/api/surveys/[slug]/results` is slow; memory spike on large surveys | Stream aggregation via Postgres `GROUP BY` and `json_each` instead of JS-side loop | ~500 responses |
| GIN index missing on `answers` jsonb column | Response filtering by answer value is full-table scan | `CREATE INDEX CONCURRENTLY ON survey_responses USING GIN (answers)` | ~1,000 responses |
| Flow diagram renders all fields as DOM nodes | Diagram lags on surveys with 50+ fields | Virtualize the diagram canvas; only render visible nodes | 40+ fields |
| AI summarization called synchronously per response | Submission latency spikes to 3–8 seconds | Async job queue; return submission confirmation immediately | First AI call |
| Partial response cleanup not pruned | `survey_responses` table grows with abandoned partials; analytics skew | Scheduled job: delete partials older than 30 days where `completed_at IS NULL` | ~10,000 abandoned partials |
| Real-time WebSocket emitting full response payload | High bandwidth on active surveys; sensitive PII in transit | Emit only `{ surveyId, responseCount, updatedAt }` — never full answers over WebSocket | 10+ concurrent viewers |
| A/B variant allocation on every request | DB read on every survey load to check variant assignment | Cache variant assignment in `sessionStorage`; only write to DB once per session | High-traffic embed surveys |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| File upload field accepts any MIME type | Malicious file (SVG with script, HTML file) stored in S3 and served | Allowlist: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`; validate magic bytes server-side, not just Content-Type header |
| S3 keys for response files are predictable (timestamp + filename) | Respondent can enumerate other submissions | Use `crypto.randomUUID()` as the key prefix; store key in DB, never expose it directly |
| Webhook URL per survey accepts any URL | SSRF: survey creator points webhook at internal metadata endpoint (e.g., AWS instance metadata `169.254.169.254`) | Validate webhook URLs against a blocklist of private IP ranges and AWS metadata endpoints before saving |
| Public results page exposes individual respondent answers | PII leak for text responses | Public results API returns only aggregated counts and anonymized numeric stats — never text samples or respondent identifiers |
| Piped answer values rendered as raw HTML | XSS if respondent injects `<script>` in text field that is piped into a later question label | Sanitize all piped values with `textContent` assignment or an HTML sanitizer — never `innerHTML` |
| AI summarization sends full response text including PII | PII sent to third-party LLM API; compliance issue | Strip or pseudonymize PII fields (email, phone, name) before sending to LLM; log what was sent |
| Per-survey webhook fires for partial (incomplete) responses | External system receives incomplete data; hard to deduplicate | Webhook fires only on `completedAt IS NOT NULL` — never on partial save events |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Conditional logic builder UI shows field IDs instead of labels | Builder is unusable; developers can't map IDs to questions | Always display field label in condition dropdowns; store fieldId internally, display label in UI |
| Flow diagram auto-routes edges and makes them cross | Diagram is unreadable on complex surveys | Use a DAG layout algorithm (e.g., ELK or dagre) with explicit layer assignment by page number |
| Partial save feedback is silent | Respondent unsure if progress was saved; refreshes and loses nothing but doesn't know | Show a subtle "Progress saved" toast on each successful partial save |
| A/B variant switcher visible to survey creator during edit | Creator inadvertently tests with their own views | Preview mode always shows Variant A; A/B assignment only applies to the public `/s/[slug]` URL |
| File upload field on mobile has no progress indicator | Large file upload stalls; respondent taps submit thinking upload failed | Show upload progress bar; disable Next button until upload completes |
| PDF certificate download triggers immediately without generation feedback | User clicks "Download Certificate" and sees nothing for 4 seconds | Show generation spinner; generate async; provide download link when ready |
| Response scoring formula visible to respondents | Scoring games can be reverse-engineered | Scoring fields and formulas are admin-only; never expose score calculation logic in the public survey payload |

---

## "Looks Done But Isn't" Checklist

- [ ] **Conditional visibility UI:** Verify the public form (`app/s/[slug]/page.tsx`) imports and uses the shared evaluator — not a copy of the logic. Check that `page_break` fields with `showIf` correctly skip the page, not just hide the break marker.
- [ ] **Response filtering:** Verify filters work against the `answers` JSONB column via Postgres query, not by loading all responses into JS and filtering in memory.
- [ ] **File upload field:** Verify upload fails gracefully when the respondent closes the browser mid-upload. Verify orphaned S3 objects are cleaned up for abandoned partial responses.
- [ ] **Partial response capture:** Verify `responseCount` only increments on `completedAt` being set. Verify a respondent who refreshes resumes their in-progress response, not a new one.
- [ ] **Webhook per survey:** Verify the webhook fires only on completed submissions. Verify SSRF protection rejects internal IP ranges. Verify retry logic exists for failed deliveries.
- [ ] **Flow diagram:** Verify the diagram renders correctly for surveys with 30+ fields and 5+ pages. Verify that orphaned `goToPage` references (pointing to a deleted page) are caught and highlighted.
- [ ] **A/B testing:** Verify variant assignment is deterministic and stored in the response row. Verify statistical confidence indicators are suppressed below minimum sample size.
- [ ] **Email follow-up sequences:** Verify no email is sent unless `emailFollowUpOptIn = true` on the response row. Verify unsubscribe link is present in every template.
- [ ] **PDF certificates:** Verify generation works in the production deployment environment (not just `next dev`). Verify the PDF is not regenerated on every download request — cache in S3.
- [ ] **AI summarization:** Verify PII fields are stripped before LLM API call. Verify cached summaries are invalidated when new responses arrive after the last summarization run.
- [ ] **Survey piping:** Verify that piping a field hidden by `showIf` uses the fallback value, not empty string or the raw token. Verify open-ended text piping truncates at a reasonable length.
- [ ] **Public results page:** Verify the endpoint returns zero text samples. Verify it respects a `publicResults` flag on the survey — results are not public unless the survey creator enables it.
- [ ] **React Native screens:** Verify the mobile API response shape does not include fields only relevant to the web portal (CSS vars, branding profile IDs). Verify conditional logic and piping evaluation works in the React Native JavaScript environment.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| responseCount desync discovered in production | MEDIUM | Run `UPDATE surveys s SET response_count = (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id AND completed_at IS NOT NULL)` as a one-time correction; add transaction wrapper to submission handler going forward |
| Duplicate partial response records in DB | MEDIUM | Identify duplicates by `(survey_id, respondent_email, created_at range)`; keep the most complete row; delete orphans; add unique constraint on `(survey_id, session_token)` |
| S3 files uploaded without tenant isolation | HIGH | Audit all existing file-field responses; move objects to correct prefixed paths; update stored keys in `answers` JSON; restrict bucket policy to require path prefix |
| Conditional logic evaluator diverged between builder and public form | MEDIUM | Extract shared evaluator; run diff against both implementations to find behavior differences; add test coverage for every condition type; deploy evaluator update |
| PDF generation broken in production | LOW-MEDIUM | Switch to `@react-pdf/renderer` if using Puppeteer; or configure `@sparticuz/chromium-min` with S3-hosted binary; test in production-equivalent environment before re-enabling endpoint |
| Follow-up emails sent without opt-in | HIGH | Immediately pause the sequence; audit sent emails against opt-in records; implement suppression list for affected respondents; add opt-in gate to sequence trigger |
| A/B variant data not stored per response | HIGH | Cannot recover historical variant attribution; future tests must restart from zero; add variant column to `survey_responses` before any new tests begin |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| responseCount desync | Phase 1 (Foundation) | `SELECT s.response_count, COUNT(r.id) FROM surveys s LEFT JOIN survey_responses r ON r.survey_id = s.id AND r.completed_at IS NOT NULL GROUP BY s.id` — values must match |
| Conditional logic evaluator split | Phase 2 (Conditional UI) | Both builder and public form import from `lib/survey-logic.ts`; no inline condition evaluation in either component |
| JSON field ID stability | Phase 1 (Foundation) | `genId()` never called on field update — only on field creation; existing IDs never change on save |
| File upload tenant isolation | Phase 3 (File upload) | S3 keys follow `surveys/{clientId}/{surveyId}/responses/{uuid}/` pattern; no direct public URLs in `answers` |
| Partial response duplicate records | Phase 4 (Partial capture) | `SELECT COUNT(*) FROM survey_responses WHERE completed_at IS NULL GROUP BY survey_id` is monitored; no duplicates for same session |
| Detail page state explosion | Phase 2 or 3 | Page component has fewer than 20 `useState` hooks; each tab is a separate component file |
| A/B without statistical validity | Phase 6 (A/B testing) | Completion rate comparison hidden below 50 responses per variant; variant assignment stored on response row |
| PDF serverless failure | Phase 8 (Certificates) | PDF generation endpoint tested against production-equivalent serverless environment before feature flag enabled |
| Piping + conditional interaction | Phase 7 (Piping) | Integration test: survey with piped field hidden by showIf renders fallback, not empty token |
| WebSocket room scoping | Phase 9 (Real-time) | Dashboard subscriber receives events only for its own `surveyId`; verified with two concurrent survey dashboards open |
| Email opt-in missing | Phase 10 (Follow-up) | Sequence trigger query includes `WHERE email_followup_opt_in = true`; verified with DB-level assertion in integration test |
| S3 file SSRF via webhook | Phase 5 (Webhooks) | Webhook URL validation rejects `10.x.x.x`, `172.16.x.x`, `192.168.x.x`, `169.254.169.254` before save |

---

## Sources

- Codebase: `/app/api/surveys/[slug]/route.ts`, `/components/admin/SurveyBuilder.tsx`, `/app/s/[slug]/page.tsx`, `/lib/db/schema.ts` — direct inspection
- [Survey Branching Logic: Common Pitfalls](https://lensym.com/blog/survey-branching-logic-guide)
- [SurveyJS Conditional Logic Documentation](https://surveyjs.io/form-library/documentation/design-survey/conditional-logic)
- [Question Piping Common Pitfalls](https://lensym.com/blog/question-piping-surveys-guide)
- [SurveyJS File Upload Patterns](https://surveyjs.io/form-library/examples/file-upload/documentation)
- [AWS S3 Secure Upload Patterns](https://aws.amazon.com/blogs/networking-and-content-delivery/implementing-secure-file-uploads-to-amazon-s3-at-the-edge-choosing-the-right-pattern/)
- [PDF Generation on Serverless — Chromium-min approach](https://dev.to/martindanielson/generate-html-as-pdf-using-nextjs-puppeteer-running-on-serverless-vercelaws-lambda-martin-4jkp)
- [A/B Testing Common Mistakes](https://www.figpii.com/blog/ab-testing-mistakes-to-avoid/)
- [A/B Testing Statistical Significance Guide](https://blog.analytics-toolkit.com/2017/statistical-significance-ab-testing-complete-guide/)
- [PostgreSQL Race Conditions — SELECT FOR UPDATE](https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/)
- [CAN-SPAM Compliance for Survey Follow-Up Emails](https://www.suped.com/knowledge/email-deliverability/compliance/are-follow-up-surveys-considered-transactional-emails-and-what-are-the-best-practices)
- [Email Sequence Compliance — GDPR and CAN-SPAM](https://instantly.ai/blog/email-sequence-compliance-gdpr-can-spam-and-data-privacy-for-outreach/)
- [LLM Costs and Sentiment Analysis Tradeoffs](https://nhsjs.com/2025/a-case-study-of-sentiment-analysis-on-survey-data-using-llms-versus-dedicated-neural-networks/)
- [WebSocket Scaling Pitfalls](https://www.videosdk.live/developer-hub/websocket/websocket-scale)

---
*Pitfalls research for: Survey platform feature expansion (Next.js/Drizzle/PostgreSQL)*
*Researched: 2026-04-05*
