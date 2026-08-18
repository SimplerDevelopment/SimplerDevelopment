---
type: spec
domain: agent-harness
status: draft
date: 2026-06-10
sources:
  - lib/mcp/tools/index.ts
  - lib/mcp-auth.ts
  - lib/brain/mcp-sdk-adapter.ts
  - lib/ai/brain-tools/index.ts
  - lib/ai/portal-tools/index.ts
  - lib/ai/portal-tools/classifier.ts
  - tests/unit/mcp-tool-registry-baseline.test.ts
---

# Feature: Unify AI Tool Surfaces

## Overview

Three independently-maintained tool surfaces — the external MCP registry, the Company Brain agent tool array, and the portal chatbot tool array — define overlapping capabilities with divergent schemas and no shared validation. This spec tracks consolidation toward a single source of truth per tool, projected into all three consumers, so the surfaces cannot silently drift. Audience: internal (affects both the staff Brain agent in `app/portal/` and the client-facing portal chatbot), with side-effects visible to external MCP clients. This is a multi-day, multi-PR effort.

## Domain context

Read first: [[Company Brain & AI]] and [[MCP Server]]. Architecture decision: [[ADR agent-topology-router-not-domain-mesh]] (router-not-mesh; this spec is the tool-surface follow-up item recorded there).

Invariants that constrain this feature:

- Blocks are not involved; this is purely an agent/tool concern.
- Every tool handler must stay `clientId`-scoped. Tenancy is the hardest invariant — a unification that strips or loosens scoping is worse than the status quo.
- The MCP baseline count (431 tools, 24 adapters) is locked in `tests/unit/mcp-tool-registry-baseline.test.ts`. Any change to the MCP projection must deliberately update that count and the rationale.
- `lib/brain/mcp-sdk-adapter.ts` (5,630 lines) is a god-file. Changes there must go via subagent only; never edit inline on the main thread.
- Coverage floor on `lib/ai` is 70% — new shared code must be covered.
- See also [[Building Custom Agents — Principles]] §7 on cost discipline — shared schema must not add latency to the hot path.

## Problem

Three tool surfaces maintain the same capabilities independently:

1. **External MCP registry** — 431 tools across 24 domain adapter files in `lib/mcp/tools/` (barrel: `lib/mcp/tools/index.ts`). Scope-gated via `hasScope` in `lib/mcp-auth.ts`. Wrapped for Brain domain by the god-file `lib/brain/mcp-sdk-adapter.ts`. Consumed exclusively by external MCP clients (Claude Code, Claude Desktop).

2. **Brain agent tool array** — 12-tool `BRAIN_TOOLS` array hand-maintained in `lib/ai/brain-tools/index.ts`. Used by `app/api/portal/brain/agent/route.ts`. Defined independently of the MCP registry.

3. **Portal chatbot tool array** — ~15 tools spread across `lib/ai/portal-tools/` (automations, billing, booking, cms, crm, dashboard, email, navigation, pitch-decks, projects, services, support, surveys, team), assembled in `lib/ai/portal-tools/index.ts`. Used by `app/api/portal/ai/chat/route.ts` (and will be wired into `app/api/portal/ai/chat/stream/route.ts` in Phase 4).

The same capability — for example `brain_search` — is defined two or three times with subtly different input schemas. When one surface adds a parameter or tightens validation, the others do not follow automatically. There is no mechanism to detect this drift today.

## Goal

One source of truth per tool: a single object that carries the tool's name, input schema (Zod or equivalent), handler function, required scope, and audience (MCP / Brain / portal / all). The three consumers — MCP registry, `BRAIN_TOOLS`, `PORTAL_TOOLS` — become projections generated from that registry at startup, not hand-maintained arrays.

Scope-guard gating and the tenancy `clientId`-first handler contract must survive unchanged.

## User stories

- As a developer adding a new tool capability, I want to define it once and have it appear in all appropriate surfaces, so I cannot accidentally omit it from one consumer.
- As a developer fixing a schema bug, I want to fix it in one place and have the fix propagate, so surfaces cannot re-diverge silently.
- As a code reviewer, I want a test that fails if tool counts diverge between surfaces, so drift is caught at CI rather than at runtime.

## Requirements

### Must have

- A shared tool-definition record type: `{ name, description, inputSchema, handler, requiredScope?, audience }`.
- Projection functions that filter + transform the shared registry into the MCP tool list, `BRAIN_TOOLS`, and `PORTAL_TOOLS` arrays.
- `bun test:tenancy` stays green — all handlers retain `clientId` scoping.
- MCP baseline test updated (or kept green) to reflect the new structure; count must not silently drop.
- 70% coverage floor on `lib/ai` maintained.
- A pilot migration of one domain (brain tools recommended as the smallest well-understood set, 12 tools) before fanning out.

### Nice to have

- A CI assertion that surfaces cannot diverge: if a tool is in `BRAIN_TOOLS` projection it must also exist in the shared registry.
- Shared Zod schemas validated at startup (fail-fast if a projection produces a malformed tool).
- God-file `lib/brain/mcp-sdk-adapter.ts` scope reduced as MCP tools migrate to the shared registry.

## Technical design

### Database changes

None. Tools are in-process; no schema changes required.

### API changes

No route changes in Phase 1 (pilot). The projection functions are called at module load time; the routes see the same `BRAIN_TOOLS` / `PORTAL_TOOLS` arrays they do today, just sourced from a shared registry instead of hand-maintained files.

Tenancy: handler signatures stay `(args, context: { clientId: string }) => Promise<ToolResult>` — no change to the calling convention.

### Portal / Admin UI

None in scope.

### Public site / blocks

None in scope. Blocks are universal and not involved.

### MCP exposure

The MCP registry is a consumer of the shared source of truth, not the source. The existing `lib/mcp/server.ts` and `lib/mcp-auth.ts` scope-guard mechanism is preserved unchanged. The god-file `lib/brain/mcp-sdk-adapter.ts` is touched only in later phases and only via subagent.

## Scaffolds to use

No standard scaffold applies (`simplerdev-feature-scaffold` is for CRUD resources). This is a refactor of the tool layer. Plan: write the shared registry module in `lib/ai/tools/` (new directory), pilot with brain tools, add projection + CI assertion, then fan out domain by domain.

## Validation plan

Per [[06 - Validation/Gate Picking|Gate Picking]]:

- **Unit** — shared registry projection tests; schema validation tests; at least one test per pilot domain verifying the projected tool array matches the legacy hand-maintained array element-for-element. Must cover 70% of `lib/ai`.
- **Tenancy** — `bun test:tenancy` after any change to a handler's call path. Non-negotiable.
- **MCP baseline** — `tests/unit/mcp-tool-registry-baseline.test.ts` must pass (update count deliberately if projection changes the MCP surface).
- **Critical E2E** — `bun test:critical` before declaring any phase done. Brain agent and portal chatbot are both on the golden path.
- **No integration tests required** for Phase 1 (pilot is in-process, no new DB queries).

## Approach sketch (planning only — not a commitment)

This is a multi-day, multi-PR effort. Rough phases:

1. **Define the shared record type + projection functions** in `lib/ai/tools/` (new module). No migration yet — just the shape and projectors.
2. **Pilot: migrate brain tools** — replace the 12-entry `BRAIN_TOOLS` array in `lib/ai/brain-tools/index.ts` with a projection from the shared registry. Keep the existing test coverage green.
3. **Add drift-detection CI assertion** — a unit test that compares brain projection output to the legacy array to prove parity, then remove the legacy array.
4. **Fan out** — migrate portal chatbot tools domain by domain. Each domain is one PR.
5. **MCP alignment** — evaluate whether MCP adapter tool definitions can reference the shared registry schemas (without touching the god-file in early phases).

Do not attempt phases 2–5 in a single PR. Do not touch `lib/brain/mcp-sdk-adapter.ts` before phase 5 and never on the main agent thread.

## Open questions

- Should the shared registry live in `lib/ai/tools/` or at a higher level (e.g. `lib/tools/`) given that MCP is also a consumer? Recommend starting in `lib/ai/tools/` for the pilot and promoting to `lib/tools/` only if the MCP alignment phase warrants it.
- MCP uses Anthropic SDK tool types; Brain and portal use a slightly different shape. Confirm the projection function can bridge both without a runtime cost.
- Does the god-file `lib/brain/mcp-sdk-adapter.ts` re-derive tool schemas from a different source (not `lib/mcp/tools/`)? Needs a read pass by a subagent before phase 5 planning.
