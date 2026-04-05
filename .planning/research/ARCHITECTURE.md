# Architecture Research

**Domain:** Survey Platform Enhancement (Next.js 15 / Drizzle ORM / PostgreSQL)
**Researched:** 2026-04-05
**Confidence:** HIGH — based on direct codebase inspection

---

## Existing Architecture (Baseline)

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Public Layer                                   │
│  /s/[slug]/page.tsx (646 lines)     /api/surveys/[slug]/route.ts     │
│  /api/surveys/[slug]/results/route.ts                                │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────┐
│                        Portal Layer                                   │
│  /portal/surveys/[id]/page.tsx (984 lines, 6 tabs)                   │
│  /api/portal/surveys/route.ts                                        │
│  /api/portal/surveys/[id]/route.ts                                   │
│  /api/portal/surveys/[id]/responses/route.ts                         │
│  /api/portal/surveys/[id]/export/route.ts                            │
│  components/admin/SurveyBuilder.tsx (405 lines)                      │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────┐
│                        Service Layer                                  │
│  lib/automation/event-bus.ts (emitEvent, onEvent)                    │
│  lib/automation/engine.ts (rule matching + action execution)         │
│  lib/s3/upload.ts + client.ts + delete.ts                            │
│  lib/branding/ (getBrandingBySurveySlug, brandingToCssVars)          │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────┐
│                        Data Layer                                     │
│  surveys (JSON fields, JSON pages, branding_profile_id)              │
│  survey_responses (JSON answers, completedAt, source)                │
└──────────────────────────────────────────────────────────────────────┘
```

### Existing Component Responsibilities

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `SurveyBuilder.tsx` | Field CRUD, drag ordering, type selection | EXISTS — no conditional UI |
| `/s/[slug]/page.tsx` | Public survey rendering, multi-page nav, showIf, goToPage | EXISTS |
| `/portal/surveys/[id]/page.tsx` | 6-tab portal: overview, edit, responses, analytics, share, settings | EXISTS |
| `event-bus.ts` | In-process pub/sub for automation triggers | EXISTS |
| `lib/s3/upload.ts` | `uploadToS3(buffer, filename, mimeType)` returning URL | EXISTS |
| `SurveyFieldDef` (schema.ts) | showIf, conditionalOptions, goToPage, page already typed | EXISTS |

---

## New Feature Integration Map

### Feature 1: Conditional Visibility UI Builder

**What changes:** SurveyBuilder.tsx gains a UI panel for editing the existing `showIf` and `conditionalOptions` fields already on `SurveyField`.
**Schema:** No changes — `showIf` and `conditionalOptions` already in `SurveyFieldDef`.
**New component:** `ConditionalLogicPanel.tsx` — renders inside SurveyBuilder's field editor. Dropdown to pick a source field + multi-select for trigger values.
**Integration point:** `onChange(fields)` already propagates to the save handler in the portal detail page — no API changes needed.
**Confidence:** HIGH

### Feature 2: Response Filtering and Search

**What changes:** Portal responses tab gains filter controls. The responses API route gets query parameters.
**Schema:** No changes — filter in SQL using `WHERE answers @> '{"fieldId": "value"}'::jsonb` (requires converting `json` columns to `jsonb` in a migration, or filtering in application code).
**New API params:** `GET /api/portal/surveys/[id]/responses?search=&source=&dateFrom=&dateTo=&complete=`
**New component:** `ResponseFiltersBar.tsx` inside the portal detail page responses tab.
**Migration note:** Converting `answers` column from `json` to `jsonb` enables Postgres GIN indexes for JSON containment queries. Application-level filtering is the simpler first step.
**Confidence:** HIGH

### Feature 3: File Upload Field Type + S3

**What changes:** Add `file` and `image` to `SurveyFieldDef['type']` union. Public survey form renders a file input. On submit, upload to S3 first, store the returned URL in `answers[fieldId]`.
**Schema changes:**
- Add `'file' | 'image'` to `SurveyFieldDef.type` union in `schema.ts`
- Add optional `acceptedTypes?: string[]` and `maxFileSizeMb?: number` to `SurveyFieldDef`
**New API route:** `POST /api/surveys/[slug]/upload` — presigned URL generation or direct upload using existing `uploadToS3`. Store files under `survey-responses/{surveyId}/{responseId}/{fieldId}/`.
**Existing integration:** `lib/s3/upload.ts` is already in place. Pattern from `/api/portal/cms/websites/[siteId]/media/upload` can be reused.
**Confidence:** HIGH

### Feature 4: Partial Response Capture

**What changes:** Per-page saves so respondents who abandon mid-survey are captured.
**New table:**
```sql
survey_partial_responses (
  id           serial PRIMARY KEY,
  survey_id    integer NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  session_id   varchar(64) NOT NULL,   -- random UUID from browser sessionStorage
  answers      json NOT NULL DEFAULT '{}',
  last_page    integer NOT NULL DEFAULT 0,
  respondent_email varchar(255),
  source       varchar(30) DEFAULT 'link',
  source_id    varchar(255),
  ip_address   varchar(45),
  user_agent   text,
  completed    boolean DEFAULT false,  -- true when converted to full response
  created_at   timestamp DEFAULT now(),
  updated_at   timestamp DEFAULT now()
)
```
**New API routes:**
- `POST /api/surveys/[slug]/partial` — upsert by session_id + survey_id
- `GET /api/surveys/[slug]/partial?sessionId=` — restore in-progress answers on revisit
**Public page change:** Call partial save API on "Next page" click. On final submit, mark `completed = true`.
**Portal change:** New sub-tab or badge in Responses tab showing partial count and list.
**Confidence:** HIGH

### Feature 5: Per-Survey Webhook URLs

**What changes:** Surveys gain webhook config. On `survey.response_submitted` event, fire configured webhooks.
**New table:**
```sql
survey_webhooks (
  id          serial PRIMARY KEY,
  survey_id   integer NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  url         varchar(500) NOT NULL,
  secret      varchar(64),             -- HMAC signing secret
  events      json NOT NULL DEFAULT '["response.submitted"]',
  enabled     boolean DEFAULT true,
  created_at  timestamp DEFAULT now()
)
```
**New API routes:**
- `GET/POST /api/portal/surveys/[id]/webhooks`
- `DELETE /api/portal/surveys/[id]/webhooks/[webhookId]`
- `POST /api/portal/surveys/[id]/webhooks/[webhookId]/test`
**Integration:** Register a handler in `event-bus.ts` via `onEvent()` that queries `survey_webhooks` for matching surveys and fires `fetch()` POSTs with HMAC signatures.
**Portal change:** New "Webhooks" sub-section in the Settings tab of the survey detail page.
**Confidence:** HIGH

### Feature 6: Logic Branching Visualization (Flow Diagram)

**What changes:** New read-only view that renders the survey's `goToPage` and `showIf` rules as a directed graph.
**New component:** `SurveyFlowDiagram.tsx` — uses existing survey fields prop, computes edges from `goToPage` and `showIf`, renders via SVG or a lightweight graph library (react-flow-renderer or custom SVG).
**No new API or schema** — derives entirely from existing field data.
**Integration point:** Add as a new tab ("Flow") in the portal survey detail page.
**Note:** react-flow is the standard library for this. It is not currently a dependency. Alternative is custom SVG to avoid adding a dependency.
**Confidence:** HIGH for approach; MEDIUM for library choice (verify react-flow v11+ bundle size is acceptable)

### Feature 7: Scoring and Calculation Engine

**What changes:** Fields gain an optional `scoreMap` config. A score field type shows a calculated total.
**Schema additions to `SurveyFieldDef`:**
```typescript
scoreMap?: Record<string, number>;  // { "option_value": point_value }
scoreWeight?: number;               // multiplier, default 1
isScoreDisplay?: boolean;           // if true, renders calculated total
scoreFormula?: string;              // "sum" | "average" | expression string
```
**New field type:** Add `'score'` to the type union — renders calculated result, not an input.
**Score computation:** Run in the public survey form (client-side) and re-validate server-side in the submit handler. Store `totalScore` in the `answers` JSON alongside field answers, e.g. `answers["__score"] = 42`.
**Routing integration:** Extend `goToPage` to accept score threshold ranges alongside option values.
**Confidence:** MEDIUM — scoring logic is straightforward but score-based routing adds complexity to the `goToPage` evaluation in `/s/[slug]/page.tsx`

### Feature 8: Email Follow-Up Sequences

**What changes:** Surveys gain a configurable follow-up email sequence triggered on submission.
**Integration path:** The `survey.response_submitted` event already fires via `emitEvent()`. A new automation handler can match this event and schedule emails via Resend (already a dependency).
**New table:**
```sql
survey_email_sequences (
  id              serial PRIMARY KEY,
  survey_id       integer NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  subject         varchar(255) NOT NULL,
  body_html       text NOT NULL,
  delay_hours     integer NOT NULL DEFAULT 0,  -- 0 = immediate
  condition_field varchar(64),                 -- optional: only send if field = value
  condition_value varchar(255),
  enabled         boolean DEFAULT true,
  created_at      timestamp DEFAULT now()
)
```
**New API routes:**
- `GET/POST /api/portal/surveys/[id]/email-sequences`
- `PATCH/DELETE /api/portal/surveys/[id]/email-sequences/[seqId]`
**Automation engine:** On `survey.response_submitted`, query `survey_email_sequences` for the survey, filter by conditions, and enqueue sends. Immediate sends use Resend directly; delayed sends need a scheduling mechanism.
**Scheduling constraint:** No job queue exists in the current stack. Options: (a) store `send_at` timestamp and poll via a cron API route, (b) use Resend's scheduled send if supported, (c) accept "immediate only" for v1.
**Recommendation:** Start with `delay_hours = 0` only (immediate) in v1. Add scheduled sends in a later iteration using a `scheduled_jobs` table polled by a `/api/cron/process-jobs` route.
**Confidence:** MEDIUM — the immediate send path is straightforward; scheduling adds infra complexity

### Feature 9: A/B Testing (Variant Management)

**What changes:** Surveys gain variant support for field-level option testing.
**New table:**
```sql
survey_variants (
  id          serial PRIMARY KEY,
  survey_id   integer NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  name        varchar(100) NOT NULL,   -- "Variant A", "Variant B"
  fields      json NOT NULL DEFAULT '[]',  -- SurveyFieldDef[] override
  weight      integer NOT NULL DEFAULT 50, -- percentage allocation
  enabled     boolean DEFAULT true,
  created_at  timestamp DEFAULT now()
)
```
**Public survey flow:** On first load, assign variant by hashing session_id modulo total weight. Store assigned `variantId` in `sessionStorage`. Pass `variantId` in the submission payload.
**Schema addition to `survey_responses`:** Add `variant_id integer REFERENCES survey_variants(id)`.
**Analytics:** Response tab and analytics show per-variant completion rates and answer distributions.
**API routes:**
- `GET/POST /api/portal/surveys/[id]/variants`
- `PATCH/DELETE /api/portal/surveys/[id]/variants/[variantId]`
**Confidence:** MEDIUM — variant assignment is simple, but analytics comparison UI adds significant frontend work

### Feature 10: Mobile Survey Renderer (React Native)

**What changes:** React Native app gains survey screens that consume the existing public API.
**Existing API reuse:** `/api/surveys/[slug]` (GET survey) and `/api/surveys/[slug]` (POST response) are already public JSON endpoints — no API changes needed.
**New screens:**
- `screens/surveys/SurveyScreen.tsx` — renders fields, handles multi-page, showIf, goToPage
- `screens/surveys/SurveyThankYouScreen.tsx`
**Field renderers needed:** One React Native component per field type, mirroring the web form logic. Priority: text, textarea, radio, select, rating, toggle, slider.
**File upload constraint:** React Native file upload requires `FormData` with `expo-document-picker` or `expo-image-picker`. The existing S3 upload API would need a multipart-capable endpoint, or use presigned URLs.
**Navigation:** Survey is opened from a QR code deep link or in-app link. Parameter is the survey slug.
**Confidence:** HIGH for API reuse; MEDIUM for RN field component scope (15 field types is substantial work)

### Feature 11: Real-Time Response Dashboard

**What changes:** Portal analytics tab shows live response count updating without page refresh.
**Current state:** No WebSocket infrastructure found in the Next.js app code (only `ws` in node_modules, not in project files). The PROJECT.md references a "WebSocket server" but it is not yet wired to surveys.
**Recommended approach for Next.js:** Use Server-Sent Events (SSE) via a Next.js Route Handler rather than WebSockets. SSE is simpler, works with Vercel/serverless, and is sufficient for one-directional data push.
**New API route:** `GET /api/portal/surveys/[id]/stream` — SSE endpoint that polls `survey_responses` every N seconds and emits count updates.
**Alternative:** If a persistent WebSocket server already exists on a separate Node process, emit a `survey.response_submitted` broadcast to connected portal clients.
**Portal change:** Analytics tab subscribes to SSE on mount, updates response count/latest response display in real time.
**Confidence:** MEDIUM — SSE approach is validated for Next.js; the "existing WebSocket server" claim in PROJECT.md needs clarification before committing to WS

### Feature 12: AI Summarization Pipeline

**What changes:** Portal analytics tab gains an AI summary card.
**Existing infrastructure:** `@anthropic-ai/sdk` is already a dependency. `/app/api/portal/ai/chat/route.ts` exists.
**New API route:** `POST /api/portal/surveys/[id]/ai-summary`
- Fetches up to N responses from `survey_responses`
- Formats answers as structured text for each field
- Calls Anthropic Claude to produce: key themes, sentiment (positive/neutral/negative), top takeaways per question
- Returns structured JSON `{ summary, sentiment, themes[], perQuestion[] }`
**Caching:** Store summary with a `generated_at` timestamp in a new `survey_ai_summaries` table. Invalidate when `survey.responseCount` changes significantly.
```sql
survey_ai_summaries (
  id          serial PRIMARY KEY,
  survey_id   integer NOT NULL UNIQUE REFERENCES surveys(id) ON DELETE CASCADE,
  summary     text NOT NULL,
  sentiment   varchar(20),
  themes      json,
  per_question json,
  response_count_at_generation integer,
  generated_at timestamp DEFAULT now()
)
```
**Cost control:** Cap at 200 responses per summary call. Summarize text fields only; skip ratings/numeric (those have their own stats).
**Confidence:** HIGH — Anthropic SDK is present, pattern is straightforward

### Feature 13: Survey Piping (Answer Interpolation)

**What changes:** Field labels and help text support `{{fieldId}}` tokens that are replaced with prior answers at render time.
**Schema change:** No table changes. The token syntax lives in the existing `label` and `helpText` string fields of `SurveyFieldDef`.
**Public survey form:** Before rendering a field, run `label.replace(/\{\{([^}]+)\}\}/g, (_, id) => answers[id] ?? '')` — already have the `answers` state.
**SurveyBuilder:** Token insertion UI in the label/helpText editor. A field-picker dropdown that inserts `{{fieldId}}` at cursor position.
**Validation:** At save time, verify all referenced `fieldIds` exist in the survey's field list and appear on earlier pages.
**Confidence:** HIGH — pure frontend feature with minimal backend involvement

### Feature 14: Public Results Page

**What changes:** A public-facing URL shows aggregated survey results with charts.
**Existing infrastructure:** `GET /api/surveys/[slug]/results` already returns aggregated data (`QuestionResult[]` with `optionCounts`, `numericStats`, `textSamples`).
**New page:** `/s/[slug]/results/page.tsx` — renders charts from the results API. Bar charts for options, averages for ratings/sliders.
**Chart library:** No charting library currently in dependencies. Options: recharts (most popular, React 19 compatible), victory, or nivo. Recharts recommended.
**Survey setting:** Add `showPublicResults: boolean` column to `surveys` table. The results API checks this flag before returning data.
**Confidence:** HIGH — API already exists; page and charts are additive

### Feature 15: PDF Generation (Completion Certificates)

**What changes:** After survey completion, respondents can download a PDF certificate. Portal can export individual responses as PDF.
**PDF options given current stack:**
- `@react-pdf/renderer` — React-based PDF construction, works in Next.js API routes, no headless browser needed. Not currently a dependency but well-maintained.
- `html2canvas` is already a dependency — can screenshot a styled div server-side but not ideal for structured PDFs.
- Puppeteer/Playwright — too heavy for this use case.
**Recommendation:** Add `@react-pdf/renderer` for structured certificate PDFs.
**New API route:** `GET /api/surveys/[slug]/certificate?responseId=` — returns PDF buffer with `Content-Type: application/pdf`.
**Certificate data:** Survey title, respondent name, completion date, optional score.
**Portal route:** `GET /api/portal/surveys/[id]/responses/[responseId]/pdf` — response detail as PDF.
**Schema change:** None. Uses existing `survey_responses` data.
**Confidence:** MEDIUM — `@react-pdf/renderer` approach is validated in Next.js but adds a new dependency; verify App Router compatibility

---

## Recommended Project Structure (New Files)

```
app/
├── api/
│   ├── surveys/[slug]/
│   │   ├── upload/route.ts           # File upload for file/image field type
│   │   ├── partial/route.ts          # Per-page partial response saves
│   │   ├── certificate/route.ts      # PDF certificate generation
│   │   └── stream/route.ts           # SSE for public results live count
│   └── portal/surveys/[id]/
│       ├── webhooks/
│       │   ├── route.ts              # CRUD webhook configs
│       │   └── [webhookId]/
│       │       ├── route.ts          # Update/delete
│       │       └── test/route.ts     # Test fire
│       ├── email-sequences/
│       │   ├── route.ts
│       │   └── [seqId]/route.ts
│       ├── variants/
│       │   ├── route.ts
│       │   └── [variantId]/route.ts
│       ├── ai-summary/route.ts       # AI summarization
│       └── stream/route.ts           # SSE portal dashboard
├── s/[slug]/
│   └── results/page.tsx              # Public results page (new)
└── portal/surveys/[id]/
    └── page.tsx                      # Extend: add Flow, Webhooks, Sequences tabs

components/
├── admin/
│   ├── SurveyBuilder.tsx             # Extend: add ConditionalLogicPanel
│   ├── ConditionalLogicPanel.tsx     # NEW: showIf/conditionalOptions editor
│   ├── SurveyFlowDiagram.tsx         # NEW: goToPage/showIf flow visualization
│   ├── ResponseFiltersBar.tsx        # NEW: filter controls for responses tab
│   └── SurveyAiSummary.tsx           # NEW: AI summary card for analytics tab
└── survey/
    ├── SurveyResultsCharts.tsx       # NEW: recharts components for public results
    └── SurveyCertificate.tsx         # NEW: @react-pdf/renderer certificate

lib/
├── db/schema.ts                      # Extend: new tables + field type additions
└── survey/
    ├── scoring.ts                    # NEW: score calculation logic
    ├── piping.ts                     # NEW: {{fieldId}} token resolution
    ├── webhook-dispatcher.ts         # NEW: HMAC-signed webhook firing
    └── ai-summary.ts                 # NEW: Anthropic summarization logic

drizzle/
└── 0042_survey_enhancements.sql      # Migration: all new tables
```

---

## Architectural Patterns

### Pattern 1: Schema Extension Without Breaking Changes

**What:** Add new columns to `surveys` table as nullable with defaults; add new fields to `SurveyFieldDef` interface as optional (`?:`).
**When to use:** For all schema additions in this milestone.
**Trade-offs:** Old survey data remains valid. Existing API routes keep working. No data migration needed for the `fields` JSON column since TypeScript optional fields are absent from stored JSON.

**Example (schema.ts additions):**
```typescript
// In surveys table
showPublicResults: boolean('show_public_results').default(false).notNull(),
abTestEnabled: boolean('ab_test_enabled').default(false).notNull(),

// In SurveyFieldDef interface
scoreMap?: Record<string, number>;
scoreWeight?: number;
isScoreDisplay?: boolean;
acceptedTypes?: string[];
maxFileSizeMb?: number;
```

### Pattern 2: Automation Event Extension

**What:** Register new survey-specific event types in `AUTOMATION_EVENTS` and emit them from API routes.
**When to use:** Webhooks feature and email follow-up sequences both need to react to survey events.

**Example (event-bus.ts addition):**
```typescript
'survey.response_submitted': 'A survey response is submitted',
'survey.partial_saved': 'A partial survey response is saved',
```

**Integration:** Webhook dispatcher registers via `onEvent()` at app startup alongside the automation engine, both listening to all events and filtering by type.

### Pattern 3: SSE for Real-Time (Not WebSockets)

**What:** Server-Sent Events via a Next.js Route Handler for one-directional data push.
**When to use:** Real-time response dashboard — portal needs live count updates.
**Trade-offs:** SSE is simpler than WebSockets and works in serverless environments. Sufficient for this use case since only server-to-client updates are needed.

**Example route structure:**
```typescript
// GET /api/portal/surveys/[id]/stream
export async function GET(req, { params }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Send initial count immediately
      const count = await getResponseCount(params.id);
      send({ type: 'count', count });

      // Poll every 5 seconds
      const interval = setInterval(async () => {
        const count = await getResponseCount(params.id);
        send({ type: 'count', count });
      }, 5000);

      req.signal.addEventListener('abort', () => clearInterval(interval));
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
```

### Pattern 4: JSON Column Field Type Extension

**What:** Adding new field types (`file`, `image`, `score`) to the `SurveyFieldDef.type` union without a migration.
**When to use:** Any time a new field type is added.
**How it works:** The `fields` column stores `SurveyFieldDef[]` as JSON. TypeScript enforces the type union at compile time. Old surveys have no fields of the new types — no runtime breakage. New field types just need renderer support in `SurveyBuilder`, `/s/[slug]/page.tsx`, and the mobile app.

---

## Data Flow Changes

### Response Submission Flow (Extended)

```
[Public Form] → /api/surveys/[slug]/partial (per-page save)
                         ↓
              survey_partial_responses (upsert by session_id)

[Final Submit] → /api/surveys/[slug]/
                    1. Validate required fields
                    2. Upload files (if any file fields)
                    3. Calculate score (if scoring enabled)
                    4. INSERT survey_responses
                    5. Mark partial response as completed
                    6. Increment responseCount
                    7. emitEvent('survey.response_submitted', ...)
                         ↓
                    [Automation Engine] + [Webhook Dispatcher]
                         ↓
                    Email sequences (Resend) + External webhooks (fetch)
```

### A/B Variant Assignment Flow

```
[Browser] → GET /api/surveys/[slug]
              → Returns: survey + variants[]

[Browser] → hash(sessionId + surveyId) % totalWeight
              → Select variant
              → Store variantId in sessionStorage

[Submit] → POST /api/surveys/[slug]  { answers, variantId }
              → Store in survey_responses.variant_id
```

### AI Summary Flow

```
[Portal] → POST /api/portal/surveys/[id]/ai-summary
              1. Check survey_ai_summaries for cached result
              2. If fresh (responseCount unchanged), return cache
              3. Fetch up to 200 text responses from survey_responses
              4. Format prompt (field labels + answers)
              5. Call Anthropic Claude API
              6. Parse structured response
              7. Upsert survey_ai_summaries
              8. Return { summary, sentiment, themes, perQuestion }
```

---

## New Tables Summary

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `survey_partial_responses` | Per-page draft saves | survey_id, session_id, answers (json), last_page, completed |
| `survey_webhooks` | Per-survey webhook endpoints | survey_id, url, secret, events (json), enabled |
| `survey_email_sequences` | Post-submission email steps | survey_id, subject, body_html, delay_hours, condition_field |
| `survey_variants` | A/B test variant configs | survey_id, name, fields (json), weight |
| `survey_ai_summaries` | Cached AI analysis | survey_id (unique), summary, sentiment, themes (json), per_question (json) |

Column additions to existing tables:
- `surveys`: `show_public_results boolean`, `ab_test_enabled boolean`
- `survey_responses`: `variant_id integer`

---

## New API Routes Summary

| Route | Method | Feature | Auth |
|-------|--------|---------|------|
| `/api/surveys/[slug]/upload` | POST | File upload field | Public |
| `/api/surveys/[slug]/partial` | POST | Partial response | Public |
| `/api/surveys/[slug]/partial` | GET | Restore session | Public |
| `/api/surveys/[slug]/certificate` | GET | PDF cert download | Public |
| `/api/surveys/[slug]/stream` | GET | SSE public results | Public |
| `/api/portal/surveys/[id]/webhooks` | GET, POST | Webhook CRUD | Portal |
| `/api/portal/surveys/[id]/webhooks/[wId]` | DELETE | Remove webhook | Portal |
| `/api/portal/surveys/[id]/webhooks/[wId]/test` | POST | Test fire | Portal |
| `/api/portal/surveys/[id]/email-sequences` | GET, POST | Sequence CRUD | Portal |
| `/api/portal/surveys/[id]/email-sequences/[sId]` | PATCH, DELETE | Update/remove | Portal |
| `/api/portal/surveys/[id]/variants` | GET, POST | Variant CRUD | Portal |
| `/api/portal/surveys/[id]/variants/[vId]` | PATCH, DELETE | Update/remove | Portal |
| `/api/portal/surveys/[id]/ai-summary` | POST | Generate AI summary | Portal |
| `/api/portal/surveys/[id]/stream` | GET | SSE live dashboard | Portal |
| `/api/portal/surveys/[id]/responses/[rId]/pdf` | GET | Response PDF export | Portal |

---

## Suggested Build Order

Dependencies drive this ordering: schema must precede API routes; API routes before UI; core logic before advanced features.

### Phase 1 — Core Logic and Schema Foundation
**Goal:** Lay the database + field type groundwork everything else depends on.

1. **Schema migration** — All new tables and column additions in one migration file
2. **Field type union extension** — Add `file`, `image`, `score` to `SurveyFieldDef`
3. **Conditional visibility UI** — `ConditionalLogicPanel.tsx` in SurveyBuilder (purely additive, no schema needed, unblocks testing the entire logic layer)
4. **Survey piping** — `lib/survey/piping.ts` + token rendering in `/s/[slug]/page.tsx` (zero schema changes, high value, verifiable immediately)

### Phase 2 — Response Management
**Goal:** Capture more data and make existing data queryable.

5. **Partial response capture** — `survey_partial_responses` table + two API routes + public form per-page save calls
6. **Response filtering/search** — Add query params to existing responses API + `ResponseFiltersBar.tsx` component
7. **File upload field type** — `/api/surveys/[slug]/upload` route using existing `lib/s3/upload.ts`

### Phase 3 — Scoring and A/B Testing
**Goal:** Add computation and experimentation capabilities.

8. **Scoring engine** — `lib/survey/scoring.ts` + `score` field type + score storage in answers JSON + score-based `goToPage` routing
9. **A/B testing** — `survey_variants` table + assignment logic in public form + `variant_id` on responses + variant CRUD API + comparison analytics

### Phase 4 — Distribution and External Integrations
**Goal:** Push survey data outward to external systems and respondents.

10. **Webhook system** — `survey_webhooks` table + `lib/survey/webhook-dispatcher.ts` registered with `onEvent()` + webhook CRUD API routes + Settings tab UI
11. **Email follow-up sequences** — `survey_email_sequences` table + immediate send handler + email sequence CRUD API + portal UI
12. **Public results page** — `/s/[slug]/results/page.tsx` + add recharts dependency + `show_public_results` flag on surveys

### Phase 5 — Visual and Advanced UI
**Goal:** Surface complexity and insights visually.

13. **Flow diagram visualization** — `SurveyFlowDiagram.tsx` as a new portal tab (pure frontend, no backend)
14. **Real-time dashboard** — SSE route + portal analytics tab live updates
15. **AI summarization** — `survey_ai_summaries` table + `lib/survey/ai-summary.ts` + POST route + `SurveyAiSummary.tsx`

### Phase 6 — Output and Mobile
**Goal:** Export and cross-platform delivery.

16. **PDF generation** — Add `@react-pdf/renderer` + certificate API route + portal response PDF export
17. **Mobile survey renderer** — React Native survey screens consuming existing public API

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Portal Page Growth

**What people do:** Continue adding tabs and state variables to the 984-line portal detail page.
**Why it's wrong:** Already at the edge of maintainability. Adding 5+ more tabs (webhooks, sequences, variants, flow, AI) will make it unmanageable.
**Do this instead:** Extract each tab into its own component file (`SurveyResponsesTab.tsx`, `SurveyWebhooksTab.tsx`, etc.) and lazy-load them. The parent page becomes a tab shell only.

### Anti-Pattern 2: Blocking the Submit Route on Webhook Delivery

**What people do:** Call external webhooks synchronously inside the POST response submission handler.
**Why it's wrong:** External webhook endpoints can be slow or down. Respondent waits indefinitely.
**Do this instead:** Fire webhooks via `emitEvent()` — the existing fire-and-forget pattern. The submission returns immediately; webhooks fire asynchronously.

### Anti-Pattern 3: Fetching All Responses for Client-Side Aggregation

**What people do:** Fetch all `survey_responses` rows to the browser, then compute aggregates in JavaScript.
**Why it's wrong:** Surveys with thousands of responses will time out or OOM. Already partially present in the results API.
**Do this instead:** Aggregate in SQL (`count`, `avg`, JSON aggregation) or in the API route with streaming. The existing results route does this correctly — maintain that pattern.

### Anti-Pattern 4: Storing File Contents in the JSON Answers Column

**What people do:** Base64-encode uploaded files and store them directly in `answers[fieldId]`.
**Why it's wrong:** Bloats the JSON column, destroys query performance, hits Postgres row size limits.
**Do this instead:** Upload to S3 via the dedicated upload route, store only the URL string in `answers[fieldId]`.

### Anti-Pattern 5: Duplicating SurveyFieldDef in Multiple Files

**What people do:** Copy the `SurveyField` interface into `SurveyBuilder.tsx`, `/s/[slug]/page.tsx`, and mobile screens separately (already partially happening — `SurveyBuilder.tsx` has its own `SurveyField` type).
**Why it's wrong:** Schema changes must be applied in multiple places; they drift over time.
**Do this instead:** Import `SurveyFieldDef` from `lib/db/schema.ts` everywhere. Resolve the current duplication between `SurveyFieldDef` (schema.ts) and `SurveyField` (SurveyBuilder.tsx) — they are identical.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| S3 / Backblaze | `lib/s3/upload.ts` (PutObjectCommand) | Already integrated; reuse for file upload field |
| Anthropic Claude | `@anthropic-ai/sdk` (already installed) | Follow pattern in `/app/api/portal/ai/chat/route.ts` |
| Resend | Already integrated for emails | Email sequences use same send pattern |
| External Webhooks | `fetch()` with HMAC-SHA256 signature | New `lib/survey/webhook-dispatcher.ts` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Public form ↔ Survey API | REST JSON, no auth | `/api/surveys/[slug]/*` routes |
| Survey API ↔ Automation Engine | `emitEvent()` fire-and-forget | Add `survey.response_submitted` to AUTOMATION_EVENTS |
| Webhook Dispatcher ↔ Event Bus | `onEvent()` registration at app startup | Same pattern as automation engine |
| Portal ↔ AI Summary | REST POST, portal auth | Anthropic API call server-side only |
| Public Form ↔ S3 | Via API route (server-side upload) | Do not expose S3 credentials to browser |

---

## Scaling Considerations

| Scale | Architecture Adjustment |
|-------|------------------------|
| Current (small tenants) | Current approach is fine. All queries are tenant-scoped by `survey_id` / `clientId`. |
| 10k responses/survey | Add index on `survey_responses(survey_id, created_at)`. Convert `answers` from `json` to `jsonb` for containment queries. |
| 100k responses/survey | Pre-aggregate analytics into a `survey_analytics_cache` table updated on each submission. Don't compute from raw rows on each page load. |
| High-frequency webhooks | Batch webhook deliveries or add a `webhook_delivery_queue` table with retry logic instead of inline `fetch()`. |

---

## Sources

- Direct codebase inspection: `lib/db/schema.ts` (SurveyFieldDef, surveys, surveyResponses tables)
- Direct codebase inspection: `lib/automation/event-bus.ts` (event patterns)
- Direct codebase inspection: `lib/s3/upload.ts` (S3 integration pattern)
- Direct codebase inspection: `app/api/surveys/[slug]/route.ts` (public submit flow)
- Direct codebase inspection: `app/portal/surveys/[id]/page.tsx` (6-tab portal structure)
- Direct codebase inspection: `components/admin/SurveyBuilder.tsx` (field editor)
- `package.json` dependency audit: @anthropic-ai/sdk, @aws-sdk/client-s3, resend, html2canvas confirmed present
- Next.js 15 SSE pattern: App Router Route Handlers support ReadableStream natively (HIGH confidence)

---

*Architecture research for: Survey Platform Enhancement — SimplerDevelopment*
*Researched: 2026-04-05*
