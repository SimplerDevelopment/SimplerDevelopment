---
type: domain-map
domain: brain-ai
status: active
date: 2026-06-09
sources:
  - lib/brain/
  - lib/ai/
  - lib/db/schema/brain.ts
---

# Domain: Company Brain & AI

## Purpose

Company Brain is the per-tenant AI knowledge base. Each tenant gets an isolated workspace of notes, decisions, people, documents, meetings, initiatives, goals, and glossary terms that are semantically indexed and searchable. An AI agent layer (`lib/ai/`) wraps Anthropic (Claude) and OpenAI (embeddings) calls, handles BYOK key resolution, plan-gating, usage metering, and a human review queue so AI output never auto-commits to canonical data without approval. A separate Portal AI assistant uses the same guard rails to drive cross-domain actions (CMS, CRM, billing, bookings, etc.) via a tool-based chat interface.

## Key entry points

| File / Directory | Role |
|---|---|
| `lib/brain/` | Data layer: search, notes, decisions, embeddings, meetings, people, playbooks, topics, org-units, glossary, documents, tasks |
| `lib/brain/index.ts` | Public re-exports: `getBrainProfile`, `getOrCreateBrainProfile`, `updateBrainProfile`, `applyIndustryTemplateDefaults` |
| `lib/ai/brain-tools/index.ts` | Brain agent tool definitions (`BRAIN_TOOLS`) and `executeBrainTool` dispatcher |
| `lib/ai/brain-tools/classifier.ts` | Pre-processing: intent classification (Haiku) |
| `lib/ai/brain-tools/planner.ts` | Multi-step plan synthesis (Haiku) |
| `lib/ai/brain-tools/grounder.ts` | Post-processing: groundedness check, hallucination guard |
| `lib/ai/brain-tools/sanitizer.ts` | `sanitizeToolResult` — strips secrets before tool results reach the model |
| `lib/ai/portal-tools/index.ts` | Portal AI tool registry (`PORTAL_TOOLS`, `HANDLERS`) aggregated from domain modules |
| `lib/ai/meeting-processor.ts` | Meeting transcript processor (Sonnet) |
| `lib/ai/resolve-client-key.ts` | `resolveClientApiKey` — BYOK vs. platform key resolver (60s cache, per-tenant) |
| `lib/ai/plan-gate.ts` | `checkAiPlanGate` — enforces Starter-tier gate before every AI call |
| `lib/ai/audit.ts` | `recordAiUsage` / `recordAiImageUsage` — fire-and-forget usage metering |
| `lib/brain/embeddings.ts` | `embedText`, `embedEntity`, `searchSemantic` — OpenAI `text-embedding-3-*` |
| `lib/brain/embedding-queue.ts` | `enqueueEmbedding`, `drainQueue` — async embedding pipeline |
| `lib/brain/mcp-sdk-adapter.ts` | Brain MCP adapter (5630 lines — god-file; never read inline) |
| `lib/mcp/tools/brain.ts` | MCP domain registrar — thin re-export of `registerBrainToolsOnSdk` |
| `lib/mcp/tools/ai.ts` | MCP registrar for cross-domain portal-AI tools |

## Data model

All tables live in `lib/db/schema/brain.ts` (1537 lines). Key tables:

| Table | Purpose |
|---|---|
| `brain_profiles` | Per-tenant Brain config; enabled modules, BYOK settings, auto-link flags |
| `brain_notes` | Core knowledge notes (Markdown, wikilinks, custom fields) |
| `brain_note_templates` | Reusable note templates with `{{variable}}` interpolation |
| `brain_meetings` | Meeting records; status: `draft / processing / needs_review / approved` |
| `brain_meeting_participants` | Attendees linked to `brain_people` |
| `brain_tasks` | Brain tasks (open / in_progress / blocked / done); promotable to Kanban |
| `brain_decisions` | Decision log; reversibility, supersede chains |
| `brain_ai_review_items` | Human review queue for AI-generated output before commit |
| `brain_ai_jobs` | Async job tracking: `process_meeting / embed / summarize_doc / crm_classify` |
| `brain_embeddings` | Vector embeddings keyed by `(clientId, entityType, entityId)` |
| `brain_embedding_jobs` | Embedding pipeline queue |
| `brain_people` | People directory (active / inactive / departed) |
| `brain_org_units` | Hierarchical org chart |
| `brain_person_org_units` | Junction: person ↔ org unit |
| `brain_expertise_tags` | Expertise taxonomy |
| `brain_glossary_terms` | Glossary (active / deprecated) |
| `brain_playbooks` | Step-by-step runbooks (draft / active / archived) |
| `brain_playbook_runs` | Live playbook execution instances |
| `brain_initiatives` | Strategic initiatives (planned / active / paused / completed / cancelled) |
| `brain_goals` | OKR-style goals linked to initiatives |
| `brain_documents` | Policy / reference documents (draft / published / archived) with version history |
| `brain_document_acknowledgments` | Required-read acknowledgment tracking |
| `brain_relationship_overlays` | Relationship metadata overlays for CRM contacts / people |
| `brain_saved_searches` | Persisted search filters per tenant |
| `brain_calendar_events` | Calendar events (manual or Google-synced) |
| `brain_audit_logs` | Append-only audit trail |
| `brain_entity_topics` | Junction: entity ↔ topic tags |
| `brain_kb_links` | Cross-entity knowledge graph links |

## API surface

All routes under `app/api/portal/brain/` (Next.js App Router, `{ success, data | error }` envelope):

| Route group | Covers |
|---|---|
| `app/api/portal/brain/agent/route.ts` | Brain agent chat endpoint (classifier → planner → tool loop → grounder) |
| `app/api/portal/brain/search/route.ts` | Hybrid keyword + semantic search |
| `app/api/portal/brain/review-items/[id]/{approve,reject}` | Human review queue approval/rejection |
| `app/api/portal/brain/meetings/` | Meeting CRUD + transcript ingestion |
| `app/api/portal/brain/communications/[id]/process` | Inbound-email → brain meeting pipeline |
| `app/api/portal/brain/decisions/`, `documents/`, `tasks/`, `people/`, `org-units/` | Standard CRUD |
| `app/api/portal/brain/playbooks/[id]/start` | Kick off a playbook run |
| `app/api/portal/brain/playbook-runs/[id]/{advance,abort}` | Run lifecycle |
| `app/api/portal/brain/topics/`, `glossary/`, `initiatives/`, `goals/` | Taxonomy CRUD |
| `app/api/portal/brain/crm-suggestions/` | Brain → CRM auto-link suggestions |
| `app/api/portal/brain/settings/` | Per-tenant Brain settings |
| `app/api/portal/brain/dashboard/` | Dashboard summary data |
| `app/api/portal/ai/chat/route.ts` | Portal AI assistant (streaming tool-use chat) |
| `app/api/portal/ai/chat/stream/` | SSE stream variant |
| `app/api/admin/ai/conversations/` | Admin view of AI conversations |

Cron routes: `app/api/cron/brain-daily-notes/route.ts`, `app/api/cron/brain-12/route.ts`, `app/api/cron/brain-empty-old-trash/route.ts`.

## MCP tools

Brain tools are registered via `lib/mcp/tools/brain.ts` → `lib/brain/mcp-sdk-adapter.ts`. Named tools exposed (defined in `lib/ai/brain-tools/index.ts`):

`brain_search`, `brain_dashboard_summary`, `brain_get_note`, `brain_create_note`, `brain_list_decisions`, `brain_get_decision`, `brain_list_people`, `brain_lookup_glossary`, `brain_list_glossary`, `brain_list_initiatives`, `brain_list_tasks`, `brain_create_task`

Portal-AI tools (`lib/mcp/tools/ai.ts`) cover dashboard, projects, billing, support, services, CMS, email, pitch-decks, booking, team, navigation, CRM, surveys, automations. All tools are scope-guarded; registry is asserted in `tests/unit/mcp-tool-registry-baseline.test.ts`.

## UI surfaces

| Route | Surface |
|---|---|
| `app/portal/brain/ask/` | "Ask Brain" conversational interface |
| `app/portal/brain/knowledge/` | Note list, detail view, knowledge graph, treemap |
| `app/portal/brain/agent/` | Brain agent chat |
| `app/portal/brain/decisions/`, `documents/`, `tasks/`, `people/`, `playbooks/`, `playbook-runs/` | Resource management UIs |
| `app/portal/brain/initiatives/`, `goals/`, `glossary/`, `topics/`, `relationships/`, `org-chart/` | Strategy & taxonomy UIs |
| `app/portal/brain/communications/`, `review/` | Inbound-email review queue |
| `app/portal/brain/calendar/` | Calendar integration |
| `app/portal/brain/settings/` | Per-tenant Brain settings |
| `app/portal/settings/ai/` | Portal AI / BYOK key settings |
| `app/admin/portal-ai/page.tsx` | Admin view: portal AI conversations |
| `app/admin/ai-credits/` | Admin AI credit management |

## Tests & gates

Coverage floor: **70%** on `lib/ai/**/*.ts` (see `tests/CI-GATES.md`, line 57). No explicit floor listed for `lib/brain/` in CI gates, but the domain has extensive unit coverage.

| Layer | Location | Examples |
|---|---|---|
| Unit (lib) | `tests/unit/brain-*.test.ts` | `brain-process-meeting.test.ts`, `brain-embeddings.test.ts`, `brain-search.test.ts`, `brain-mcp-sdk-adapter.test.ts` |
| Unit (components) | `tests/unit/components-brain-*.test.tsx` | note editor, org-unit tree, topic tree, expertise editor |
| Unit (pages) | `tests/unit/app-brain-*.test.tsx`, `tests/unit/app-portal-brain-*.test.tsx` | decisions, documents, playbooks, communications |
| Integration | `tests/integration/api/brain/*.test.ts` | decisions, documents, glossary, playbooks, relationships |
| E2E | `tests/e2e/brain-*.spec.ts` | decisions, documents, glossary, initiatives, knowledge |
| Registry gate | `tests/unit/mcp-tool-registry-baseline.test.ts` | fails on any tool add/remove/rename |

Run: `scripts/test.sh --layer=unit --no-coverage` / `bun test:critical` (critical E2E gate).

## Cross-domain dependencies

- **CRM** (`lib/db/schema/`) — `lib/brain/classify-crm.ts` reads `crmContacts`, `crmCompanies`, `crmDeals`; auto-links brain meetings to CRM records
- **Google Workspace** — `lib/brain/ingest-gmail-message.ts` ingests Gmail; `brain_calendar_events` syncs Google Calendar
- **Automations** — `lib/db/schema/brain.ts` hosts `automationRules` / `automationLogs`; playbooks bridge to automation triggers
- **Billing / Credits** — `lib/ai/plan-gate.ts` gates AI calls by plan tier; `lib/ai-credits.ts` tracks platform credit balance used by `meeting-processor.ts`
- **Crypto** — `lib/crypto/api-key.ts` encrypts/decrypts BYOK keys fetched by `lib/ai/resolve-client-key.ts`
- **Kanban** — `brain_tasks` can be promoted to Kanban cards via `app/api/portal/brain/tasks/[id]/promote-to-kanban/`

## Invariants & gotchas

- **Always call `resolveClientApiKey` before any LLM call** — never read env vars directly. See `lib/ai/resolve-client-key.ts`.
- **Always call `checkAiPlanGate` before any LLM call on behalf of a client** — Starter-tier without BYOK gets 402/403. Silently skipping bills the platform.
- **Always `recordAiUsage` after every call, fire-and-forget** — never `await` it in the critical path.
- **`sanitizeToolResult` is mandatory before any tool result enters the model context** — Brain tools do this automatically; portal tools do not (they return data to the API layer).
- **AI is never the source of truth** — all AI-extracted content enters `brainAiReviewItems` and requires human approval before being committed.
- **Every DB call inside Brain tools must be scoped to `clientId`** — structural, not optional. The Brain agent receives `clientId` as its first resolved argument.
- **`lib/brain/mcp-sdk-adapter.ts` is the largest file in the repo at 5630 lines** — never read inline; spawn a subagent.
- **Groundedness check runs after every tool loop** — `lib/ai/brain-tools/grounder.ts`; `uncertain === true` forces an "I don't know" response rather than a confident unsupported claim.
- **Tracing emits real Sentry spans** — `lib/ai/tracer.ts` (shared by the Brain agent + portal chatbot) wraps operations in `withSpan`, sending Sentry performance spans in prod (`tracesSampleRate` 0.1) with a `console.warn` JSON fallback in dev. Shipped 2026-06-10, replacing the old stdout shim.
- **Industry templates** (`lib/brain/industry-templates/`) bootstrap a new tenant's Brain taxonomy. Adding a template requires updating `lib/brain/industry-templates/index.ts`.

## Planning notes

- Embedding pipeline is async (`drainQueue`) and can lag behind note creation; semantic search results may be stale until the queue drains.
- BYOK decrypt failure falls through to platform key silently — monitor for decrypt errors in logs.
- No real OTEL instrumentation yet; `tracer.ts` is a placeholder.
- Known gaps listed in `docs/guides/BRAIN.md` section 9.

## Related

[[CRM]], [[Automations & Workflows]]
