---
title: "Building a Company Brain: RAG with pgvector and Claude"
slug: "company-brain-rag-pgvector"
description: "How we built a per-tenant knowledge base using OpenAI embeddings, pgvector HNSW, a classifier-planner-grounder agent loop, and a human-review queue."
date: 2026-06-27
tags:
  - rag
  - pgvector
  - multi-tenant
  - embeddings
  - agent-loop
  - company-brain
  - ai-knowledge-base
author: "SimplerDevelopment Team"
draft: true
---

Most knowledge management software makes the same quiet mistake: it optimizes for *storing* information, not *finding* it. You put in a decision record, a meeting summary, a process document — and three months later, when someone needs to know why the team made that call or how the onboarding flow works, the answer is buried under 40 pages of search results with no reliable way to tell which one is right.

We built Company Brain to solve this differently. Rather than a general-purpose chatbot bolted onto a note store, it is a per-tenant AI knowledge base: structured, grounded in the tenant's own data, and explicit about what it does not know. This post covers the technical choices that make it work — the async embedding pipeline into pgvector, the hybrid semantic-plus-keyword retrieval, the classifier-planner-executor-grounder agent loop, the human-review gate, and the per-tenant isolation model that keeps every tenant's knowledge entirely separate.

---

## What Company Brain is — and what it is not

Company Brain is a structured, searchable knowledge base scoped to a single tenant. Each tenant's Brain contains notes, decisions (with rationale and outcome history), versioned documents, meetings, people, goals, initiatives, playbooks, a glossary, a topic taxonomy, and an org chart. All of it is searchable via semantic and keyword retrieval, and all of it is private to that tenant.

It is not a shared knowledge pool. When Brain answers a question about example.com's vendor selection rationale, it retrieves from example.com's data only — never from another tenant's notes, never from generic web knowledge. If the answer is not in the tenant's Brain, it says so explicitly.

The `brain_*` MCP tool namespace has 156 tools — the largest single namespace in the platform, spanning every knowledge sub-domain. The implementation lives in `lib/ai/` (agent loop, classifiers, embedding pipeline) and `lib/brain/` (data layer, MCP adapter).

---

## The embedding pipeline

### What gets embedded

Every significant content item in the Brain gets an embedding on creation or update. The list currently includes notes, documents and document versions, meetings and meeting summaries, decisions, goals, initiatives, people records, and glossary entries.

Embeddings are generated via the OpenAI Embeddings API using the `text-embedding-3-*` model family. The specific variant is configured per tenant via `resolveClientApiKey` — meaning tenants with a Bring Your Own Key setup can point the embedding step at their own OpenAI organization, and the platform key is used as the fallback.

### Storage in pgvector

Embeddings are stored in a `brain_embeddings` table in Postgres. The vector column uses the `pgvector` extension's `vector` type:

```sql
-- Simplified from lib/db/schema/brain.ts
vector  vector(1536)  -- dimension matches the text-embedding-3-small output
```

The table carries a `clientId` column. Every embedding lookup filters on it — a cross-tenant similarity search would return another tenant's private documents, so this filter is not optional.

### The HNSW index — and its footgun

Semantic search performance depends on an HNSW (Hierarchical Navigable Small World) index on the vector column. HNSW indexes support approximate nearest-neighbor lookup in sublinear time, which is what makes similarity search across thousands of embeddings feel fast instead of sequential.

The index is managed via a raw SQL migration (`drizzle/0061_brain_embeddings.sql`) rather than through the Drizzle schema definition, because Drizzle does not natively emit HNSW index DDL. This creates one critical footgun: `drizzle-kit push --force` silently drops the index. Running it against a database with real Brain data removes the HNSW index without warning and degrades every similarity query to a full table scan until the index is rebuilt. Never run `push --force` against a database with real Brain data. After any database restore or migration, verify the index exists with `\d brain_embeddings` in psql.

### The pipeline is asynchronous

Embedding generation is intentionally async. A note created at T+0 is available in keyword search immediately, but it will not appear in vector similarity results until the embedding job completes — which typically happens within seconds but is not instantaneous. Any UX that presents results immediately after a write should account for this lag. The current portal UI does not yet show an "indexing" indicator; this is a known gap.

---

## The agent loop: classifier, planner, executor, grounder

When a portal user asks a question through the Brain chat interface, the request passes through a four-stage agent loop:

```
Portal request (chat or Brain agent invocation)
      │
      ▼
lib/ai/brain-tools/classifier.ts
  ← classifies intent: search / write / task / CRM lookup?
      │
      ▼
lib/ai/brain-tools/planner.ts
  ← selects which Brain tools to call and in what order
      │
      ▼
executeBrainTool()
  ← calls lib/brain/* data layer (notes, search, decisions, etc.)
  → sanitizeToolResult()   ← strips API keys, tokens, PII before LLM context
      │
      ▼
lib/ai/brain-tools/grounder.ts
  ← checkGroundedness(): if the answer can't be supported by retrieved
    documents → returns "I don't know"
      │
      ▼
Response streamed to portal
```

The classifier, planner, and grounder all run on `claude-haiku-4-5-20251001` — a deliberate choice to keep the orchestration overhead light. The portal chatbot uses `claude-sonnet-4-6` for complex routes where the Brain may be one of several tool sources, but the internal Brain loop stays on Haiku. Meeting transcript processing runs on `claude-sonnet-4-5`. Model assignments live in `lib/ai/`; they are not environment variables and should not be moved there.

The `sanitizeToolResult()` call after every `executeBrainTool()` is load-bearing. Brain tools can return records that include stored API keys, OAuth tokens, or PII — none of which should appear in the LLM's context window. Sanitization happens before any tool result reaches the model.

### The groundedness check

`checkGroundedness()` evaluates whether the model's answer is actually supported by the documents retrieved from the Brain. If the retrieved context does not support a confident answer, the response explicitly says "I don't know" rather than generating a plausible-sounding answer from prior training weights.

This behavior is deliberately conservative. An AI that invents plausible-sounding facts about a company's own data — wrong dates, wrong decision rationale, wrong policy details — erodes trust faster than one that admits uncertainty. The groundedness gate exists to make Brain's confidence calibration explicit rather than leaving it implicit in the model's output.

---

## Hybrid semantic + keyword search

The `brain_search` MCP tool runs a hybrid retrieval: semantic similarity via pgvector cosine distance against the HNSW index, combined with full-text keyword matching via Postgres `tsvector`. Results are ranked by a combined score and returned with source attribution — which note, document, decision, or record the excerpt came from.

The retrieval pattern for agents is straightforward:

```
1. Agent calls brain_search with the user's question as the query.
2. brain_search embeds the query and returns top-N excerpts with source references.
3. Agent uses the excerpts as context for its response.
4. checkGroundedness() verifies the response is supported by those excerpts.
5. If grounded → respond. If not → "I don't know."
```

Hybrid retrieval matters because semantic search and keyword search fail in complementary ways. Semantic search finds conceptually related content even when no words overlap — "why did we change vendors" finds the decision record about a supplier switch even if those exact words do not appear. Keyword search catches precise terms, acronyms, and proper nouns that embedding similarity tends to dilute. Running both and merging the ranked results covers more ground than either alone.

`brain_search` requires the `brain:read` scope on the API key or OAuth token. It is the entry point any external AI agent should use before writing to or reasoning about a tenant's Brain.

---

## The human-review queue

AI output is never committed directly to canonical Brain data. This is a hard architectural constraint, not a configuration option.

When the meeting transcript processor extracts entities, generates a decision record, or proposes a note based on a meeting, those items flow into `brainAiReviewItems` — a pending queue. A human reviewer sees each item in the portal at `app/portal/brain/review/` and approves or rejects it. Only approved items become permanent records in the Brain.

The MCP surface for the review queue includes `brain_list_review_items`, `brain_get_review_item`, `brain_approve_review_item`, `brain_reject_review_item`, `brain_review_items_list_for_reviewer`, and `brain_review_items_suggest_reviewer`. The approve and reject tools require the `brain:approve` scope — a deliberate scope split that allows read-only agent access to the Brain without granting the ability to push AI-generated content into production records.

The principle is simple: AI is a good drafter, not a reliable committer. The review queue makes the human the final authority on what goes into the knowledge base.

---

## Per-tenant isolation in the AI stack

Every AI call in the Brain stack follows a mandatory three-step sequence before execution:

1. **`resolveClientApiKey(clientId, provider)`** — resolves whether to use the tenant's BYOK key or the platform key. Direct reads from `process.env.ANTHROPIC_API_KEY` or `process.env.OPENAI_API_KEY` are forbidden in Brain code; the resolver handles key selection, rotation, and BYOK validation.

2. **`checkAiPlanGate(clientId)`** — rejects starter-tier tenants who have not configured BYOK with a 402/403 before making any AI call. Skipping this gate silently bills the platform for another tenant's usage.

3. **`recordAiUsage()`** — fire-and-forget after the call completes. This must never be `await`-ed in the critical path; it runs asynchronously so it does not add latency to the response.

Tenancy isolation also applies to the embedding layer. Every query against `brain_embeddings` must include a `clientId` filter. The pgvector similarity search does not have a tenant concept — the application layer is responsible for scoping every query. Omitting the filter returns results from all tenants.

---

## Knowledge sub-domains

Brain is not a flat note store. Typed sub-domains provide structure for classification and search:

| Sub-domain | What it stores |
|---|---|
| Notes | Free-form records; the most common input |
| Documents | Versioned, publishable documents with required-read and acknowledgment tracking |
| Decisions | Logged decisions with rationale, outcomes, and supersede/rejection history |
| Goals / Initiatives | OKR-style progress tracking linked to Brain content |
| Glossary | Canonical definitions; `brain_glossary_lookup` resolves terms for agents |
| People + Expertise tags | Who knows what; `brain_who_knows` surfaces experts by topic |
| Playbooks | Step-by-step procedures; each run tracks step completion, skips, and aborts |
| Topics | Hierarchical taxonomy tree for classifying all Brain content |
| Org units | Org chart structure tied to People records |
| Review queue | AI-authored items awaiting human approval before commit |

---

## What is still being wired

A few things are built but not yet complete:

- **Embedding lag indicator.** The async pipeline means a newly created note does not appear in semantic search immediately. The portal UI does not yet show an "indexing" state. This is a known gap being tracked.
- **Observability.** There is no OpenTelemetry instrumentation yet. Latency and token usage for Brain calls are not exported to an observability backend.
- **Voice meeting-mode.** The voice assistant is built on the OpenAI Realtime API with meeting-mode transcript ingestion, but the widget is not mounted in the portal layout. It is not available in the current release.

---

## Try it

The fastest way to see semantic retrieval working is to create a few notes in the Brain portal, wait for the embedding pipeline to process them, and call `brain_search` with a question that is conceptually related to your notes but uses different words. The source attribution in the results shows exactly which records backed the retrieval.

The full 156-tool Brain catalogue is documented in the [Brain MCP tool reference](/docs/agents/tool-reference#brain_). The [AI layer architecture overview](/docs/agents/architecture-for-agents#8-ai-and-rag-layer) covers the full agent stack and how Brain fits alongside the portal chatbot.

---

<!-- SEO block -->
<!--
page_title: "Building a Company Brain: RAG with pgvector and Claude | SimplerDevelopment"
meta_description: "How we built a per-tenant AI knowledge base using OpenAI embeddings, pgvector HNSW indexes, a classifier-planner-grounder agent loop, and a human-review queue."
primary_keyword: "RAG pgvector"
secondary_keywords: "company knowledge base, multi-tenant AI, embeddings Postgres, HNSW index, OpenAI embeddings, Claude classifier planner, groundedness check, human review queue"
canonical_url: "/blog/company-brain-rag-pgvector"
-->
