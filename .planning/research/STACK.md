# Stack Research

**Domain:** Advanced survey platform — logic visualization, PDF certificates, real-time analytics, AI summarization, A/B testing, mobile, webhooks
**Researched:** 2026-04-05
**Confidence:** HIGH (all versions verified against npm registry)

---

## Context: What Already Exists

The following are already in package.json and should NOT be re-added:

| Already Present | Used For |
|-----------------|----------|
| `next@16.1.1` | App framework |
| `drizzle-orm@^0.45.1` | Database ORM |
| `@anthropic-ai/sdk@^0.80.0` | Direct Anthropic API access |
| `@aws-sdk/client-s3@^3.968.0` | S3 file uploads |
| `react-hook-form@^7.71.0` | Form management |
| `resend@^6.7.0` | Transactional email |
| `framer-motion@^12.26.2` | Animations |
| `zod@^4.3.5` | Schema validation |
| `react@19.2.3` | UI framework |
| `react-native@0.81.5` | Mobile app |
| `expo@~54.0.33` | Mobile toolchain |

---

## New Libraries Required

### Flow Diagram (Logic Branching Visualization)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@xyflow/react` | `^12.10.2` | Interactive node-based flow diagram for survey skip logic visualization | Industry standard for this exact use case — Typeform uses it for logic visualization. Actively maintained (published 8 days ago), 17.6k stars. The old `reactflow` package is deprecated in favor of this package name. |

**Integration point:** Render-only in the SurveyBuilder for the "Logic" tab. Nodes = pages/questions, edges = skip logic rules. Store layout as JSON alongside the existing `showIf` schema — no schema migration needed.

### PDF Certificate Generation

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@react-pdf/renderer` | `^4.3.3` | Generate completion certificates as downloadable PDFs | React-first approach — define PDF layout in JSX. 860k+ weekly downloads, 15.9k stars, actively maintained (published 19 hours ago). Works in Next.js server actions (Node.js runtime). Integrates with existing branding profile system (colors, fonts, logos). |

**Integration point:** Next.js Route Handler (`/api/surveys/[id]/certificate`) that accepts `responseId`, fetches response + branding profile, renders `<Document>` with `@react-pdf/renderer`, streams PDF bytes. No browser rendering required — pure server-side generation.

**Do NOT use Puppeteer** for this — it launches a full Chromium instance, adds 300MB+ to the deployment, and is overkill for static certificate layouts. Reserve Puppeteer only if pixel-perfect CSS rendering is non-negotiable.

### Real-Time Charting (Response Dashboard)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `recharts` | `^3.8.1` | Charts for real-time response dashboard and public results page | Recharts 3.x is stable, maintained (published 11 days ago), built on SVG + D3. Best choice when you already have a React/Tailwind stack and don't need exotic chart types. Lightweight, works seamlessly with WebSocket data streams via state updates. |

**Integration point:** Survey response dashboard polls or subscribes via WebSocket to new response events. Chart data is derived from response aggregation queries in Drizzle. The existing WebSocket server handles real-time push — recharts just re-renders on state change.

**Tremor is NOT recommended** here — it's built on recharts under the hood, adds abstraction weight, and the project already has Tailwind + its own design system. Go direct to recharts.

### AI Summarization + Sentiment Analysis

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `ai` | `^6.0.146` | Vercel AI SDK for streaming text generation, structured output, and multi-provider support | AI SDK 6 (released April 2026) provides `generateText()` and `streamText()` with structured output. More ergonomic than raw `@anthropic-ai/sdk` calls for server actions. Supports `@ai-sdk/anthropic` provider. Enables model swapping without rewriting call sites. |
| `@ai-sdk/anthropic` | `^3.0.66` | AI SDK Anthropic provider (wraps the existing SDK) | Required peer for using Vercel AI SDK with Claude models. Abstracts token streaming and error normalization. |

**Why AI SDK over raw `@anthropic-ai/sdk` directly:** The project already has `@anthropic-ai/sdk` but AI SDK 6 adds structured output (`generateObject`), which is critical for returning sentiment scores and categorized summaries as typed JSON — not just raw text. Use `generateText()` for summary prose, `generateObject()` for sentiment/scoring schemas.

**Integration point:** Next.js Server Action `/app/api/portal/surveys/[id]/summarize`. Input: aggregated text responses. Output: `{ summary: string, sentiment: 'positive'|'neutral'|'negative', themes: string[] }`. Cache results per survey + response-count fingerprint to avoid re-running on every page load.

### A/B Testing (Survey Field Variants)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `posthog-js` | `^1.364.7` | A/B experiment assignment, feature flags, analytics event capture | PostHog has first-class Next.js 15 support (instrumentation-client.ts integration). Open-source, self-hostable. Provides experiment SDKs for React hooks (`useFeatureFlagPayload`) so variants can be assigned per-respondent. Unifies A/B testing with analytics in one tool rather than adding Statsig as a separate service. |
| `posthog-node` | `^4.x` | Server-side flag evaluation for Next.js API routes | Required for bootstrapping flags server-side in Next.js to prevent layout shift on first render. |

**Scope note:** The A/B testing here is internal — testing which survey question wording produces higher completion rates. PostHog experiment flags are assigned to respondents at survey load. Flag variant maps to which `fields` JSON variant to serve. Completion events are captured as PostHog events. No need for Statsig's enterprise statistical analysis at this scale.

**Do NOT use Statsig** unless the business requires sequential testing, CUPED variance reduction, or 1T+ event volumes. PostHog is sufficient and already battle-tested with Next.js.

### Webhook Delivery Queue

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `bullmq` | `^5.73.0` | Reliable async webhook delivery with retries, exponential backoff, dead-letter queues | BullMQ 5.x is the production standard for Node.js job queues backed by Redis. Survey response submission enqueues a webhook job rather than firing HTTP synchronously — this prevents slow/failing external endpoints from blocking the respondent's submission. Built-in retry with exponential backoff + jitter. |

**Prerequisite:** Redis instance required. If the project doesn't have Redis yet, use Upstash Redis (serverless, free tier sufficient for webhook volumes at this scale). BullMQ has documented Upstash compatibility.

**Integration point:** On `survey_response.created`, enqueue `{ webhookUrl, payload, surveyId, responseId }` to BullMQ. Worker retries up to 5 times with exponential backoff. Failed jobs land in dead-letter queue visible in the portal.

### Mobile File Upload (React Native / Expo)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `expo-image-picker` | `~55.0.14` | Native image/media selection for file upload field in mobile surveys | First-party Expo library, zero configuration on managed workflow. SDK 54 compatible (project uses expo ~54). Handles permissions, cropping, compression. |
| `expo-document-picker` | `~55.0.11` | Non-image file selection (PDFs, etc.) for file upload field type | Companion to image-picker for non-image file fields. Both work with the existing S3 upload pattern. |

**Integration point:** Upload flow: `expo-image-picker` → presigned S3 URL (existing `@aws-sdk/s3-request-presigner` pattern already in codebase) → store S3 key in response JSON answers. Same pattern as existing image uploads elsewhere in the platform.

---

## Installation

```bash
# Flow diagram visualization
npm install @xyflow/react

# PDF certificate generation
npm install @react-pdf/renderer

# Real-time charting
npm install recharts

# AI SDK (for structured AI output — summarization + sentiment)
npm install ai @ai-sdk/anthropic

# A/B testing + feature flags
npm install posthog-js posthog-node

# Webhook delivery queue
npm install bullmq

# Mobile (add to Expo project, not Next.js)
npx expo install expo-image-picker expo-document-picker
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Flow diagram | `@xyflow/react` | `react-diagrams` | react-diagrams is less actively maintained, smaller community, less suited for survey-logic node patterns |
| Flow diagram | `@xyflow/react` | GoJS / yFiles | Commercial licenses with per-seat pricing — unnecessary for an internal builder UI |
| PDF generation | `@react-pdf/renderer` | Puppeteer | Adds ~300MB Chromium binary, serverless cold starts increase dramatically, overkill for certificate layouts |
| PDF generation | `@react-pdf/renderer` | pdfme | pdfme targets template workflows, less flexible for branded dynamic layouts with custom fonts/colors |
| Charting | `recharts` | Tremor | Tremor is built on recharts, adds abstraction weight with no benefit when project has its own design system |
| Charting | `recharts` | Chart.js | Chart.js is canvas-based, less idiomatic in React, worse real-time update story |
| AI integration | `ai` + `@ai-sdk/anthropic` | Raw `@anthropic-ai/sdk` only | Raw SDK lacks `generateObject()` for typed structured output — necessary for sentiment scores + theme extraction |
| A/B testing | `posthog-js` | Statsig | Statsig is enterprise-scale. PostHog is sufficient, open-source, and has better Next.js 15 integration |
| A/B testing | `posthog-js` | LaunchDarkly | LaunchDarkly is expensive at scale and doesn't bundle analytics |
| Webhook queue | `bullmq` | Native `setTimeout` retries | No persistence, no dead-letter queue, lost on server restart |
| Webhook queue | `bullmq` | Inngest / Trigger.dev | Managed services add cost and external dependency; BullMQ + Redis keeps it in-stack |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `reactflow` (old package) | Deprecated in favor of `@xyflow/react` — no new versions being published | `@xyflow/react` |
| `puppeteer` / `playwright` for PDF | Adds Chromium binary (300MB+), serverless hostile, overkill for static certificate layouts | `@react-pdf/renderer` |
| `chart.js` | Canvas-based, harder to sync with React state for real-time updates, less idiomatic | `recharts` |
| `d3` (direct) | Already have D3 types; recharts handles charting abstraction — raw D3 is significant implementation overhead for standard bar/line/pie charts | `recharts` |
| SurveyJS library | Would conflict with the custom-built survey engine — the platform IS the survey system | n/a — build on existing schema |
| Any serverless PDF service (Apryse, Nutrient) | External API dependency, cost per generation, data leaves the platform | `@react-pdf/renderer` server-side |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@xyflow/react@^12.10.2` | `react@19.x` | v12 supports React 19, uses new React package structure |
| `@react-pdf/renderer@^4.3.3` | `react@19.x`, Node.js runtime | v4 supports React 19; works in Next.js Route Handlers (Node.js runtime), NOT Edge runtime |
| `recharts@^3.8.1` | `react@19.x` | v3 released with React 19 compatibility; `Cell` component deprecated (use `shape` prop instead) |
| `ai@^6.0.146` | `next@16.x`, `react@19.x` | AI SDK 6 targets Next.js 15+; requires Node.js runtime for server actions |
| `@ai-sdk/anthropic@^3.0.66` | `ai@^6.x` | Peer dependency of ai@6; version mismatch will cause type errors |
| `bullmq@^5.73.0` | Node.js 18+, Redis 7+ | Requires persistent Redis connection; not compatible with Edge runtime |
| `posthog-js@^1.364.7` | `next@16.x` | Use `instrumentation-client.ts` init pattern for Next.js 15.3+ |
| `expo-image-picker@~55.0.14` | `expo@~54.x` | SDK 55 package version ships with Expo SDK 54 apps |
| `expo-document-picker@~55.0.11` | `expo@~54.x` | Same Expo SDK 54 alignment |

---

## Stack Patterns by Feature

**For logic branching visualization:**
- `@xyflow/react` in the SurveyBuilder `Logic` tab
- Nodes are read-only (no drag-to-connect needed for v1) — just visualize existing `goToPage` rules
- Store node positions in survey JSON if user repositions them

**For PDF certificates:**
- Server-only generation in a Next.js Route Handler with `runtime = 'nodejs'`
- `@react-pdf/renderer` `renderToBuffer()` → stream as `application/pdf`
- Use the existing `brandingProfiles` table for colors, logo URL, font family

**For real-time dashboard:**
- `recharts` `LineChart` / `BarChart` for response volume over time
- Connect to existing WebSocket server; update chart data via `useState` on new response events
- For public results page: same component, but read-only + auto-refresh every 30s as fallback

**For AI summarization:**
- `generateObject()` from `ai` SDK for typed output (sentiment, themes, NPS summary)
- Wrap in Next.js Server Action; cache by `[surveyId, responseCount]` key
- Use `claude-sonnet-4-6` (available via `@ai-sdk/anthropic`) — faster and cheaper than Opus for summarization

**For webhooks:**
- BullMQ worker in the existing WebSocket server process (both are Node.js long-running processes)
- Enqueue on `survey_response.created` automation event (hook into existing automation engine)
- Retry policy: 5 attempts, exponential backoff starting at 1s, dead-letter after exhaustion

**For A/B testing:**
- PostHog experiment: flag name per survey (e.g., `survey_[id]_field_[fieldIndex]_variant`)
- Variant payload is the alternate field config JSON
- Capture `survey_completed` and `survey_abandoned` events to PostHog for statistical analysis

---

## Sources

- npm registry (live) — `@xyflow/react@12.10.2`, `recharts@3.8.1`, `@react-pdf/renderer@4.3.3`, `posthog-js@1.364.7`, `bullmq@5.73.0`, `ai@6.0.146`, `@ai-sdk/anthropic@3.0.66`, `expo-image-picker@55.0.14`, `expo-document-picker@55.0.11` — all verified 2026-04-05
- [xyflow.com](https://xyflow.com/) — React Flow current package name and migration guide
- [react-pdf.org](https://react-pdf.org/) — @react-pdf/renderer documentation
- [recharts.org via GitHub](https://github.com/recharts/recharts/releases) — v3 release timeline and React 19 compatibility
- [ai-sdk.dev](https://ai-sdk.dev/docs/introduction) — Vercel AI SDK 6 documentation, `generateObject()` API
- [posthog.com/docs/libraries/next-js](https://posthog.com/docs/libraries/next-js) — Next.js 15 integration pattern
- [docs.bullmq.io](https://docs.bullmq.io/) — BullMQ 5.x features and Redis requirements
- [docs.expo.dev/versions/latest/sdk/imagepicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) — Expo 54 compatibility confirmed

---
*Stack research for: SimplerDevelopment Survey System Enhancement — Advanced Features Milestone*
*Researched: 2026-04-05*
