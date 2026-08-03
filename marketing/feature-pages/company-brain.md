---
phase: 8
feature: Company Brain
slug: /features/company-brain
status: spec-draft
date: 2026-06-27
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domain 5)
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
---

# Company Brain — Marketing Spec

## Hero

**Headline:** Your team's knowledge, decisions, and processes — searchable by AI, not buried in chat.

**Subhead:** Company Brain is a per-tenant AI knowledge base that captures notes, decisions, versioned documents, playbooks, goals, and org structure — then answers questions against that context using semantic search.

---

## Problem

Team knowledge scatters across Slack threads, email chains, and personal notes. When someone needs to know why a decision was made six months ago, what the client onboarding process is, or who owns a particular relationship, there is no reliable place to look. Institutional knowledge walks out the door when people leave.

When teams do try to capture knowledge in wikis or shared docs, those documents go stale and search returns too many irrelevant results to be useful.

---

## Solution

Company Brain gives each tenant a structured, searchable knowledge base stored in Postgres and indexed with OpenAI embeddings. Notes, decisions (with rationale and outcome history), versioned documents, playbooks, goals, initiatives, and org chart are all connected.

A Brain agent classifies intent, retrieves semantically relevant content via pgvector similarity search, plans a response, and checks it for groundedness before answering. The same knowledge surface is available to external AI agents through 156 MCP tools — the largest single namespace in the platform.

---

## Key Benefits

- **Semantic search** finds related notes, documents, and decisions even when exact words don't match — powered by OpenAI embeddings stored in pgvector.
- **Decision log** captures rationale, outcome, and context; decisions can be superseded or rejected, so the history of "why we did this" is preserved and queryable.
- **Versioned documents** with draft/publish workflow and required-read acknowledgment tracking per team member — know who has read a policy and when.
- **Playbooks with run history** turn repeatable processes into tracked, step-by-step workflows — each run records which steps were completed, skipped, or aborted.
- **156 MCP tools** under the `brain_*` namespace; inbound email is routed to a human review queue via Cloudflare Email Worker for triage and action.

---

## How It Works

1. **Add knowledge:** Create notes, log decisions, upload documents, define glossary terms, record meetings, and map people and org structure from the Brain portal or via MCP tools.
2. **Organize with topics:** A tree-structured topic taxonomy links related knowledge across notes, documents, and decisions. Tag any entity to a topic; navigate the tree to browse all connected content.
3. **Ask:** Type a question in the Brain chat interface. The agent classifies intent, retrieves semantically similar documents, plans a response, and returns a grounded answer with citations.
4. **Act:** Create tasks, start playbook runs, update goals and initiatives, and route inbound emails to the review queue — all triggered from the same Brain context without switching tools.

---

## FAQs

**Q: What content types does Company Brain store?**
Notes, decisions, documents (with version history and required-read tracking), tasks, meetings, people, goals, initiatives, playbooks (with run history), a glossary, a topic tree, an org chart, and relationships between entities.

**Q: How does the semantic search work?**
Text is converted to embedding vectors via the OpenAI Embeddings API and stored in Postgres using the pgvector extension. Questions are also embedded and matched by cosine similarity — so "why did we change vendors" finds the decision about a supplier switch even if those exact words aren't in the decision record.

**Q: Is there a delay between adding a note and it being searchable?**
The embedding pipeline is asynchronous. Keyword search is immediate; vector similarity search may lag note creation by a short interval while the embedding is generated.

**Q: Can I drive Company Brain from an AI agent or automation?**
Yes. 156 MCP tools cover the full Brain surface — notes, decisions, documents, people, tasks, meetings, goals, initiatives, playbooks, glossary, topics, org units, and relationships. Tokens scoped to `brain:read` or `brain:write` restrict access appropriately.

**Q: Does the voice meeting-mode feature work?**
The voice assistant is built but is not currently mounted in the portal. Do not rely on voice features in the current release.

---

## SEO Block

| Field | Value |
|---|---|
| **Page title** | AI Knowledge Base for Teams \| SimplerDevelopment |
| **Meta description** | Per-tenant knowledge base with semantic search, decision logs, versioned documents, playbooks, and 156 AI tools — answers grounded in your team's actual context. |
| **URL slug** | /features/company-brain |
| **Primary keyword** | AI knowledge base for teams |
| **Secondary keywords** | semantic search knowledge base, team decision log, RAG knowledge management, company playbook software, AI knowledge management SaaS |

---

## Structured Data

Apply both types to this page:

**SoftwareApplication**
- `name`: "SimplerDevelopment – Company Brain"
- `applicationCategory`: "BusinessApplication"
- `featureList`: ["Semantic search via OpenAI embeddings and pgvector", "Decision log with rationale and supersede history", "Versioned documents with required-read acknowledgments", "Playbooks with step run tracking", "Goals, initiatives, and org chart", "156 MCP tools for AI agents", "Inbound email review queue"]
- `operatingSystem`: "Web"

**FAQPage**
- Wrap each FAQ Q&A pair in `mainEntity` → `Question` / `acceptedAnswer` → `Answer`.

---

## Internal Links

- [AI overview — Company Brain / RAG section](../../docs/agents/ai-overview.md)
- [Glossary: Company Brain](../../docs/agents/glossary.md#company-brain)
- [Glossary: RAG](../../docs/agents/glossary.md#rag-retrieval-augmented-generation)
- [Glossary: Embedding](../../docs/agents/glossary.md#embedding)
- [Glossary: Playbook](../../docs/agents/glossary.md#playbook)
- Sibling feature pages: [CRM](./crm.md) · [Sites, CMS & Visual Editor](./websites-cms-visual-editor.md) · [Storefront & Commerce](./storefront-commerce.md)

---

## Media Requirements

Capture these assets in Phase 5/6:

| Asset | Screen / Workflow | Notes |
|---|---|---|
| Screenshot | Brain "Ask" chat interface — question typed, cited answer returned | Show citation references to source notes/documents |
| Screenshot | Knowledge list — notes, decisions, and documents shown in a mixed feed | Illustrate content variety |
| Screenshot | Decision detail — decision with rationale, outcome, and supersede history visible | |
| Screenshot | Document detail — version history panel open, acknowledgment status shown | |
| Screenshot | Playbook run in progress — steps checklist with some checked, one in progress | |
| Screenshot | Org chart view — tree of people and org units | |
| Screenshot | Topic tree panel — expand/collapse topic hierarchy | |
| GIF | Typing a question in the Brain chat and watching the agent retrieve and answer | ~6 seconds; shows the "retrieving…" state then the grounded answer |

---

## CTA

**Primary:** "Connect your team's knowledge" → `[portal URL]/brain`

**Secondary:** "Explore Brain MCP tools" → `[docs URL]/agents/tool-reference.md` (filter to `brain_*`)
