---
type: index
date: 2026-06-09
---

# Architecture

System-level design notes. Repo paths in these notes are drift-checked by `scripts/check-doc-drift.ts` — keep them current.

Core set:
- [[Route Trees & Audiences]] — admin / portal / sites split
- [[Tenancy & Site Resolution]] — clientId/siteId keying, `lib/active-client.ts`, middleware
- [[Auth & Roles]] — NextAuth v5, role model, scopes
- [[Data Model Overview]] — per-domain Drizzle schema modules, migration flow
- [[API Envelope & Route Patterns]] — `{ success, data | error }`, scaffold lockstep
- [[MCP Server]] — registrar pattern, scope guards, token budgets
- [[Deployment Topology]] — Vercel, crons, workers, realtime server
- [[Agent Harness]] — CLAUDE.md system, gates, hooks, orchestration
- [[Building Custom Agents — Principles]] — seven production-agent principles mapped to this repo's implementation

```dataview
TABLE status, date
FROM "02 - Architecture"
WHERE type = "architecture"
SORT file.name ASC
```
