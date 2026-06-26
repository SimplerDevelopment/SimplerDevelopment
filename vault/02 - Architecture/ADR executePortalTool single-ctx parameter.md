---
type: adr
domain: brain-ai
status: accepted
date: 2026-06-17
sources:
  - lib/ai/portal-tools/index.ts
  - lib/automation/engine.ts
  - lib/mcp/approvals.ts
  - app/api/portal/ai/chat/route.ts
  - app/api/portal/ai/chat/stream/route.ts
---

# ADR: executePortalTool single-ctx parameter

## Status

Accepted — landed on `dev` branch, commit b6594d9a.

## Context

Two features were developed independently on separate branches and merged via `worktree/CCA`:

1. **Approval staging** (`feat/ai-tool-call-approvals`) — when a portal-AI tool call requires approval, the write is staged into the approval queue instead of committing. The staging path needed a `gateCtx` (a `PortalMcpContext`) passed through `executePortalTool` so the `stageOrApply` helper knew which approval queue to target.

2. **Agent-action audit logging** (CCA branch) — every tool invocation needed a `source` tag (`'automation'` | `'assistant'`) and, for automation runs, a `ruleId`, so the agent-action audit row could be attributed to the right caller.

The naive merge produced a 6-argument signature:

```ts
executePortalTool(name, input, clientId, userId, gateCtx?, ctx?)
```

This was awkward — callers had to pass `undefined` for `gateCtx` to reach `ctx` — and it broke the locked public contract encoded in two unit tests (`mcp-tool-registry-baseline.test.ts` and the agent-action-log test), both of which asserted arity 5 with a single optional `ctx` as the 5th parameter.

## Decision

Collapse `gateCtx` and `ctx` into a single optional parameter:

```ts
executePortalTool(
  name: string,
  input: Record<string, unknown>,
  clientId: number,
  userId: string,
  ctx?: PortalToolCtx
): Promise<PortalToolResult>
```

where:

```ts
type PortalToolCtx = {
  source?: 'automation' | 'assistant';
  ruleId?: number;
  gate?: PortalMcpContext | null;
}
```

**Semantics of each field:**

- `ctx.gate` — when set AND the target tool is a write requiring approval, the call is routed through `stageOrApply` into the approval queue rather than executing directly. Omit (or pass `null`) to execute directly.
- `ctx.source` / `ctx.ruleId` — populate the agent-action audit row. Automation calls pass `{ source: 'automation', ruleId }`. Assistant calls pass `{ source: 'assistant' }`. Direct/inbound calls omit ctx entirely and are logged with no source attribution.

## Consequences

**Call site mapping** (all verified against `lib/ai/portal-tools/index.ts` (244)):

| Call site | ctx value |
|---|---|
| `app/api/portal/ai/chat/route.ts` (301) | `{ source: 'assistant' }` |
| `app/api/portal/ai/chat/stream/route.ts` (463) | `{ source: 'assistant', gate }` |
| `lib/automation/engine.ts` (575) | `{ source: 'automation', ruleId }` |
| `lib/mcp/approvals.ts` (1206) — inbound email + approval-replay | 4-arg (no ctx; direct execution) |

**What becomes easier:** All callers have one optional parameter to worry about; no positional undefined padding. The registry-baseline + agent-action-log unit tests pass as authored (arity-5 contract preserved).

**New invariant:** `ctx.gate` is the sole switch for the staging path. Do not re-introduce a separate positional `gateCtx` argument. If a future feature needs additional per-call routing metadata, extend `PortalToolCtx` with a new optional field.

## Alternatives considered

- **Keep two params, reorder** (`ctx?` before `gateCtx?`): restores arity-5 contract but the logical grouping of approval staging vs. audit attribution remains separated. Rejected — single struct is cleaner and extensible.
- **Pass gate context through thread-local / AsyncLocalStorage**: avoids signature change entirely but introduces implicit coupling and is harder to test. Rejected — explicit is better.

## Related

- Domain map: [[Company Brain & AI]]
- ADR (related): [[ADR approval-preview-page-scoped-token]]
- Commits: b6594d9a (single-ctx collapse), 9ea5f408 (unit-test repair after AI seam merge)
