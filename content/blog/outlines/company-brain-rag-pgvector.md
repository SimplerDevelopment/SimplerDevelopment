# Outline: Building a Company Brain with RAG and pgvector

---

## Meta

**SEO title:** Building a Company Brain: RAG with pgvector and Claude
**Meta description:** How we built a per-tenant AI knowledge base using OpenAI embeddings, pgvector HNSW indexes, a classifier-planner-grounder agent loop, and a human-review queue.
**URL slug:** `company-brain-rag-pgvector`
**Target audience:** Engineers building RAG systems on Postgres; AI application developers; teams evaluating multi-tenant knowledge base architectures.
**Primary keywords:** RAG pgvector, company knowledge base, multi-tenant AI, embeddings Postgres
**Secondary keywords:** HNSW index, OpenAI embeddings, Claude classifier planner, groundedness check, human review queue

---

## Outline

### H2: What Company Brain is — and what it is not

- **What it is:** A per-tenant, multi-modal knowledge base. Each tenant has their own Brain containing notes, decisions, documents, meetings, people, goals, playbooks, glossary terms, topics, and org structure. All of it is searchable via semantic + keyword RAG.
- **What it is not:** A general-purpose chatbot. The Brain is grounded in the tenant's own data — it never retrieves from a shared knowledge pool. If it doesn't know, it says so explicitly.
- **Scale:** `brain_*` is the largest MCP tool family — 156 tools spanning every knowledge sub-domain.
- **Code location:** `lib/ai/` (agent loop, classifiers, embedding pipeline) and `lib/brain/` (data layer, MCP SDK adapter).

### H2: The embedding pipeline

#### H3: What gets embedded

Every significant content item in the Brain gets an embedding on creation or update:
- Notes (create, update, restore)
- Documents and document versions
- Meetings and meeting summaries
- Decisions
- Goals, initiatives
- People records
- Glossary entries

#### H3: The embedding model

- Provider: OpenAI.
- Model family: `text-embedding-3-*` (the specific variant is configured per tenant via `resolveClientApiKey`).
- Storage: `brain_embeddings` table in Postgres with the `vector` column type from pgvector.

#### H3: The HNSW index

- The Brain's semantic search performance depends on an HNSW (Hierarchical Navigable Small World) index on the `vector` column in `brain_embeddings`.
- The index is managed via `drizzle/0061_brain_embeddings.sql` — outside the Drizzle schema definition, because Drizzle does not natively emit HNSW index DDL.
- **Critical footgun:** `drizzle-kit push --force` silently drops this index. Never run `push --force` against a database with real Brain data.
- After any database restore or migration, verify the index exists: `\d brain_embeddings` in psql.
- The pipeline is **asynchronous** — there is an intentional lag between creating a note and having it appear in semantic search results. Design UX around this (show a "indexing" state if needed).

### H2: The agent loop — classifier, planner, executor, grounder

```
Portal request (chat or Brain agent invocation)
      │
      ▼
lib/ai/brain-tools/classifier.ts
  ← classifies intent: is this a search, a write, a task, a CRM lookup?
      │
      ▼
lib/ai/brain-tools/planner.ts
  ← selects which Brain tools to call and in what order
      │
      ▼
executeBrainTool()
  ← calls lib/brain/* data layer (notes, search, decisions, etc.)
  → sanitizeToolResult()   ← ALWAYS: strips API keys, tokens, PII before LLM context
      │
      ▼
lib/ai/brain-tools/grounder.ts
  ← checkGroundedness(): if the answer can't be supported by retrieved documents → "I don't know"
      │
      ▼
Response streamed to portal
```

#### H3: Models used in the Brain loop (as of 2026-06)

| Component | Model |
|---|---|
| Brain classifier / planner / grounder | `claude-haiku-4-5-20251001` |
| Portal chatbot (complex route, which can invoke Brain) | `claude-sonnet-4-6` |
| Meeting transcript processor | `claude-sonnet-4-5` |
| Brain eval runner | `claude-sonnet-4-6` |
| Embeddings | OpenAI `text-embedding-3-*` |

Model assignments live in `lib/ai/` — change them there, not in environment variables (except for BYOK keys).

#### H3: The groundedness check — explicit "I don't know"

- `checkGroundedness()` evaluates whether the model's answer is supported by the documents retrieved from the Brain.
- If the retrieved context does not support a confident answer, the response explicitly says "I don't know" rather than hallucinating.
- This is load-bearing for enterprise trust: an AI that invents plausible-sounding facts about a company's own data erodes trust faster than one that admits uncertainty.

### H2: Semantic search — `brain_search`

- The `brain_search` MCP tool runs a hybrid search: semantic (pgvector cosine similarity against the HNSW index) + keyword (full-text `tsvector` match).
- Results are ranked by a combined score and returned with source attribution (which note, document, or record the excerpt came from).
- Scopes required: `brain:read`.
- The `brain_search` tool is the entry point for AI agents that need to retrieve context before writing or answering.

#### H3: RAG retrieval pattern for agents

```
1. Agent calls brain_search with the user's question as the query.
2. brain_search returns top-N excerpts with source references.
3. Agent uses the excerpts as context for its response.
4. checkGroundedness() verifies the response against the excerpts.
5. If grounded → respond. If not → "I don't know."
```

### H2: The human-review queue — AI is not the source of truth

- AI output is never committed directly to canonical Brain data.
- Meeting transcript extractions, AI-suggested notes, and AI-authored decisions flow into `brainAiReviewItems` first.
- A human reviewer sees each item in the portal at `app/portal/brain/review/` and approves or rejects it.
- Only approved items become permanent records.
- MCP tools for the review queue: `brain_get_review_item`, `brain_list_review_items`, `brain_approve_review_item`, `brain_reject_review_item`, `brain_review_items_list_for_reviewer`, `brain_review_items_suggest_reviewer`.
- The `brain:approve` scope is required to call approve/reject tools.

### H2: Per-tenant isolation in the AI stack

Three mandatory steps before any AI call on behalf of a tenant:

1. **`resolveClientApiKey(clientId, provider)`** — resolves BYOK vs. platform key. Never read `process.env.ANTHROPIC_API_KEY` or `process.env.OPENAI_API_KEY` directly.
2. **`checkAiPlanGate(clientId)`** — rejects starter-tier tenants without BYOK (402/403). Skipping this silently bills the platform for another tenant's usage.
3. AI call executes.
4. **`recordAiUsage()`** — fire-and-forget after the call (never `await` in the critical path).

Tenancy isolation also applies to the embedding lookup: `brain_embeddings` queries must filter by `clientId` — a cross-tenant embedding search would return another tenant's private documents.

### H2: Knowledge sub-domains in the Brain

The Brain is not a flat note store. It has typed sub-domains that provide structure for search and classification:

| Sub-domain | Purpose |
|---|---|
| Notes | Free-form records; the most common input |
| Documents | Versioned, publishable documents with required-read and acknowledgment tracking |
| Decisions | Logged decisions with supersede and rejection history |
| Goals / Initiatives | OKR-style tracking linked to Brain content |
| Glossary | Canonical definitions for lookup (`brain_glossary_lookup`) |
| People + Expertise tags | Who knows what — `brain_who_knows` surfaces experts by topic |
| Playbooks | Step-by-step procedures; runs tracked with step completion |
| Topics | Hierarchical taxonomy tree for classifying all Brain content |
| Org units | Org chart structure tied to People records |
| Review queue | AI-authored items awaiting human approval |
| CRM read-lens | `brain_get_deal`, `brain_get_contact` — read CRM data inside Brain context |

### H2: What's not yet wired

- **Embedding pipeline lag:** the pipeline is async. A note created at T+0 may not appear in semantic search at T+0. No "indexing" state indicator exists in the current portal UI — this is flagged as a known gap.
- **OTEL instrumentation:** no real OpenTelemetry instrumentation yet; latency data is not exported to an observability backend.
- **Voice assistant meeting mode:** the voice assistant is built (`OpenAI Realtime API`, meeting-mode transcript ingestion) but the widget is not mounted in the portal layout. Not shipped.

---

## Key code / concepts to show

- Embedding storage column: `vector(1536)` (or appropriate dimension) in `brain_embeddings` table
- HNSW index creation statement from `drizzle/0061_brain_embeddings.sql` (concept, not verbatim if large)
- `brain_search` MCP tool call example: query string → top-N results with source attribution
- `sanitizeToolResult(result)` call site
- `resolveClientApiKey(clientId, 'openai')` → embedding generation → store in `brain_embeddings`
- `checkGroundedness()` — where it sits in the pipeline (after planner/executor, before response)

---

## Internal links

- `/docs/agents/tool-reference#brain_` — full Brain MCP tool catalogue
- `/docs/agents/architecture-for-agents#8-ai-and-rag-layer` — AI layer overview
- `/docs/agents/api-index` — MCP endpoint and credential reference
- Feature inventory: Company Brain & AI (`vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` §5)
- Self-hosting guide (`content/blog/outlines/self-hosting-guide.md`) — pgvector setup

---

## CTA

**Primary:** "Explore the Brain — create your first note and run `brain_search` to see semantic retrieval in action."
**Secondary:** Link to `/docs/agents/tool-reference#brain_` for the complete 156-tool Brain catalogue.

---

## Screenshot / GIF requirements

1. Diagram: Embedding pipeline — content creation → OpenAI embedding → pgvector HNSW storage → semantic search retrieval.
2. Diagram: Agent loop — classifier → planner → executeBrainTool → sanitize → grounder → response.
3. Screenshot: Brain portal UI — knowledge graph list view and the review queue.
4. Screenshot: `brain_search` MCP tool call returning excerpts with source attribution in Claude Desktop.
5. No fabricated retrieval accuracy numbers or latency benchmarks.
