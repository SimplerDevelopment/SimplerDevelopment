# lib/ai — Agent Notes

AI orchestration layer: key resolution, plan-gating, tool execution for the Company Brain agent and Portal AI assistant, plus pitch-deck and meeting-processing pipelines.

## Key invariants

- **Coverage floor: 70%.** `tests/CI-GATES.md` groups `lib/ai` with `lib/billing,agency,esign,chat`. Do not let coverage drop below this floor.
- **Always call `resolveClientApiKey` before any Anthropic/OpenAI call.** Never read `process.env.ANTHROPIC_API_KEY` / `OPENAI_API_KEY` directly in a feature — the resolver handles BYOK vs platform and per-tenant key rotation. Source: `resolve-client-key.ts`.
- **Always check `checkAiPlanGate` before making AI calls on behalf of a client.** Starter-tier clients without a BYOK key must be rejected (402/403). Skipping this silently bills the platform. Source: `plan-gate.ts`.
- **Record usage after every call.** Call `recordAiUsage` / `recordAiImageUsage` (best-effort fire-and-forget, never await in the critical path). Source: `audit.ts`.
- **Tool results must pass through `sanitizeToolResult` before reaching the LLM context.** Strips API keys, tokens, passwords, SSNs, CC numbers. Brain tools do this automatically via `executeBrainTool`; portal tools do not (they return structured data to the API layer, not directly to the model). Source: `brain-tools/sanitizer.ts`.
- **All handlers receive `clientId` as first resolved argument and must scope every DB call to it.** No cross-tenant data must flow to a model context. This is structural, not optional.
- **AI is never the source of truth.** Meeting extractions, slide edits, and brain notes flow through a human-review queue (`brainAiReviewItems`) before being committed. Never auto-commit AI output to canonical data without a review step.
- **Eval suites shadow AI signatures — update them in the same edit batch.** `lib/ai/evals/suites/*.eval.ts` (brain-classifier, survey-summary, note-classifier) call the real classifiers with hand-written args/enums; `tsc` does NOT auto-fix those call sites. After ANY change to a classifier signature or its enum literals, run `tsc --noEmit` (it covers these files) and update the matching `*.eval.ts` together — they have drifted repeatedly. This is a 70%-floor domain; the suites are load-bearing.

## Model assignments (as of 2026-06)

| Surface | Model | File |
|---|---|---|
| Brain classifier / planner / grounder | `claude-haiku-4-5-20251001` | `brain-tools/classifier.ts`, `planner.ts`, `grounder.ts` |
| Portal chatbot classifier + intent router | `claude-haiku-4-5-20251001` | `portal-tools/classifier.ts` (one call returns both `complexity` for model routing and `domains[]` for tool-surface narrowing; domain map in `portal-tools/domains.ts`) |
| Portal chatbot loop (routed) | `claude-haiku-4-5-20251001` (simple) / `claude-sonnet-4-6` (complex) | `app/api/portal/ai/chat/route.ts` |
| Portal chatbot stream (mobile, text-only) | `claude-opus-4-7` | `app/api/portal/ai/chat/stream/route.ts` |
| Meeting transcript processor | `claude-sonnet-4-5` | `meeting-processor.ts` |
| Brain eval runner | `claude-sonnet-4-6` | `brain-tools/eval/runner.ts` |
| Embeddings | `text-embedding-3-*` (OpenAI) | `resolve-client-key.ts` (provider `'embedding'` maps to OpenAI) |

## God-files (>500 lines — never read inline; spawn a subagent)

| File | Lines | Contents |
|---|---|---|
| `block-schemas.ts` | 623 | Machine-readable JSON schemas for every block type; drives slide AI prompt assembly |
| `portal-tools/cms.ts` | 529 | Tool definitions + handlers for CMS-related portal AI actions |
| `portal-tools/crm.ts` | 523 | Tool definitions + handlers for CRM-related portal AI actions |

## Sub-directory map

- `brain-tools/` — Company Brain agent: tool definitions (`BRAIN_TOOLS`), executor (`executeBrainTool`), plus classifier → planner → grounder pre/post-processing pipeline. Consumed by `app/api/portal/brain/agent/route.ts`.
- `portal-tools/` — Portal AI assistant tools split by domain (dashboard, projects, billing, support, services, cms, email, pitch-decks, booking, team, navigation, crm, surveys, automations). Consumed by `app/api/portal/ai/chat/route.ts` and `stream/route.ts`.
- `style-variants/` — Design-philosophy library + prompt assembly + validation for the AI block-style picker (3-variant generation).

## Adding a new AI capability

**New Brain tool:**
1. Add the `Anthropic.Tool` definition and handler to `brain-tools/index.ts`.
2. Add the tool name to the planner's allowed-tools list in `brain-tools/planner.ts`.
3. Write unit tests; keep coverage ≥70%.

**New Portal AI tool:**
1. Create (or extend) a domain module under `portal-tools/` exporting `*Tools: Anthropic.Tool[]` and `*Handlers: Record<string, Handler>`.
2. Import and spread both into `portal-tools/index.ts` (`PORTAL_TOOLS` + `HANDLERS`).
3. Tool ordering in `PORTAL_TOOLS` is intentional (read block at top of `portal-tools/index.ts`); preserve the read/write grouping.
4. **Add the tool name to `TOOL_DOMAIN` in `portal-tools/domains.ts`** (the intent-router map). `tests/unit/portal-tool-domains.test.ts` asserts exact set-equality with `PORTAL_TOOLS`, so a tool with no domain fails CI. If it's cross-cutting like `navigate_to`, add it to `BASELINE_TOOL_NAMES` instead.

**New standalone AI pipeline (e.g., another processor like `meeting-processor.ts`):**
1. Call `resolveClientApiKey` → `checkAiPlanGate` → make the AI call → `recordAiUsage` — in that order, every time.
2. Cap input with a `MAX_*_CHARS` constant to bound costs; add a truncation note in the prompt.
3. Never `await recordAiUsage` — fire-and-forget only.

## Security / safety notes

- **Prompt injection risk:** User-controlled strings (note bodies, meeting transcripts, CRM content) flow into model prompts. `sanitizeToolResult` handles the LLM-output direction; for LLM-input, truncate at `MAX_*_CHARS` and use structured tool-use (not freeform text) to extract outputs.
- **BYOK key isolation:** `resolveClientApiKey` is keyed by `(clientId, provider)` with a 60s in-process cache. Keys are encrypted at rest (`lib/crypto/api-key.ts`). A decrypt failure falls through to the platform key — it never exposes another tenant's key.
- **Groundedness:** The Brain agent runs `checkGroundedness` after every tool loop to detect hallucination. If `uncertain === true`, the agent should surface an explicit "I don't know" rather than a confident but unsupported claim.
- **Tracing:** `lib/ai/tracer.ts` (shared by the Brain agent + portal chatbot) emits real Sentry performance spans in prod (`sentry.server.config.ts`, `tracesSampleRate` 0.1) and falls back to structured `console.warn` JSON in dev. Wrap any new agent operation in `withSpan(name, attrs, fn)`; attrs are normalized to Sentry-safe primitives. Use `portal.*` / brain span names so traces group by agent.

## Pointers

- `lib/brain/` — the underlying data layer the brain tools call (search, notes, decisions, people, etc.)
- `lib/ai-credits.ts` — platform credit balance; `meeting-processor.ts` checks this before Sonnet calls
- `lib/crypto/api-key.ts` — BYOK encrypt/decrypt
- `tests/unit/brain-process-meeting.test.ts` — representative coverage for the meeting pipeline
- `tests/CI-GATES.md` — coverage floor (70%) and gate commands
