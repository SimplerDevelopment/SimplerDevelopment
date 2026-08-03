# PORTAL-E — Company Brain QA Report
**Date:** 2026-05-14 | **Server:** localhost:3100 | **DB:** simplerdev_qa_walk

## Summary

Brain API layer is functional. All 12 core endpoints return 200 with correct JSON envelopes; all input-validation edge cases pass (empty title→400, invalid template→400, end-before-start→400, reversed agenda range→400). Unauthenticated requests return 401 across the board. Tenancy isolation is enforced at the ORM layer (`clientId` scoped queries).

Parallel Playwright run: 54 passed / 26 failed / 5 flaky / 2 skipped. All 26 failures and 5 flakies were auth-contention errors ("Login failed: 404") from 4 concurrent workers hitting the NextAuth CSRF+callback flow. No product-level bugs hidden behind those failures.

Two architectural gaps: (1) `/portal/brain/ask` serves the MCP Connect page, not a RAG Q&A interface — the `ask` module is disabled (`enabledModules.ask: false`) with no API route; (2) `brain_embeddings` table is empty for all notes because embedding generation requires an OpenAI key per client, so semantic search is unreachable without AI credentials.

## Coverage Table

| Route | Coverage | Status |
|---|---|---|
| settings GET/PUT | portal-brain.spec.ts | COVERED |
| dashboard | portal-brain.spec.ts | COVERED |
| adapters | portal-brain.spec.ts | COVERED |
| knowledge CRUD | portal-brain.spec.ts + brain-knowledge.spec.ts | COVERED |
| knowledge bulk/restore/history/backlinks | brain-knowledge.spec.ts | COVERED |
| templates CRUD + from-template | brain-knowledge.spec.ts | COVERED |
| knowledge/graph | manual only | PARTIAL |
| knowledge/upload | portal-brain.spec.ts (skipped w/o S3) | PARTIAL |
| tasks CRUD | portal-brain.spec.ts | COVERED |
| relationships CRUD | portal-brain.spec.ts | COVERED |
| communications CRUD + review | portal-brain.spec.ts + mutations | COVERED |
| review queue | portal-brain.spec.ts | COVERED |
| review-items approve/reject | none | GAP |
| search | portal-brain.spec.ts | COVERED |
| calendar agenda + events | portal-brain.spec.ts | COVERED |
| saved-searches | integration tests only | PARTIAL |
| drive-sync | portal-brain.spec.ts | COVERED |
| crm-suggestions | portal-brain.spec.ts | COVERED |
| dataview | none | GAP |
| /portal/brain/ask (page) | none | GAP — is MCP Connect, not RAG |
| /portal/brain/knowledge/treemap | none | GAP |
| /portal/brain/automations | none | GAP |
| /portal/brain/prospects | none | GAP |

## Performance (warm server, authenticated)

| Endpoint | TTFB |
|---|---|
| settings, knowledge, tasks, relationships, communications, adapters | 238–291 ms |
| dashboard, calendar events/agenda, graph | 318–409 ms |
| search (lexical, 9 notes) | 1850 ms |
| /portal/brain/automations (cold page) | 11.7 s |
| /portal/brain/settings (cold page) | 16.9 s |
| /portal/brain/prospects (cold page + redirect) | 39.8 s |

No API endpoint exceeded 3s on a warm server. Cold page loads are Turbopack first-compile overhead, not runtime regressions.

## Issues

**ISSUE-E-01 — Parallel E2E auth contention [HIGH, test infra]**  
26 tests fail with login 404 under 4-worker Playwright. Dev server serializes NextAuth CSRF+callback; concurrent sessions overwhelm it. Fix: set `workers: 1` for brain specs or implement a shared-session fixture.

**ISSUE-E-02 — /portal/brain/ask serves MCP Connect, not RAG Q&A [MEDIUM]**  
`enabledModules.ask: false` in brain profile; no `/api/portal/brain/ask` route exists. The URL was repurposed for the MCP integration. Either implement the RAG endpoint + UI, or rename the route to `/portal/brain/connect` and clarify the module flag.

**ISSUE-E-03 — Embeddings never populated for manual notes [MEDIUM, RAG quality]**  
Zero rows in `brain_embeddings`. `resolveClientApiKey` requires an OpenAI key per client; without one, embedding silently skips. Tag-based search also returns 0 hits (tags stored as JSON, not ILIKE-searchable). Lexical search on title/body works correctly.

**ISSUE-E-04 — Raw query string echoed in search response [LOW]**  
`GET /api/portal/brain/search?q=<script>alert(1)</script>` returns the unescaped string in `data.query`. Not exploitable via React text nodes, but any consumer using `data.query` as innerHTML would be vulnerable. Apply `sanitizeHtml` from `lib/security/sanitize-html.ts` to the echoed field.

**ISSUE-E-05 — history.userId is null for created notes [LOW, audit]**  
History rows have `userId: null`. Attribution is lost. Required before compliance templates (wealth advisory) go live.

## Recommendations

1. **Implement or formally defer RAG ask.** The `enabledModules.ask` flag and UI nav create an expectation. Either ship a minimal `/api/portal/brain/ask` (POST question → RAG over `brain_embeddings`) or remove the nav entry and deprecate the flag.
2. **Dev embedding fallback.** When no AI key is configured, log a warning and skip embedding gracefully rather than silently. Enables E2E testing of search plumbing.
3. **Index tags for text search.** Add `jsonb_array_elements_text(tags)` to the note FTS index or use a tsvector column that includes tags.
4. **Fix Playwright workers.** Auth contention causes 26/87 false failures on every parallel CI run. Set `workers: 1` in the brain spec group.
5. **History attribution.** Populate `userId` in `createNote` + `updateNote` history writes before compliance features ship.
6. **Graph E2E coverage.** Add tests for `/knowledge/graph` with 0 nodes, cycle detection (circular wiki-links), and 100+ nodes. The HNSW index is in place but the graph traversal has no automated regression guard.
