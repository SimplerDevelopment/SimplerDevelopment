---
type: spec
domain: agentic-os
status: proposed
date: 2026-06-22
sources:
  - lib/agentic-os/executor.ts
  - lib/agentic-os/registry.ts
  - lib/agentic-os/types.ts
  - lib/db/schema/agenticOs.ts
  - lib/db/schema/tools.ts
  - lib/db/schema/approvals.ts
  - lib/mcp/telemetry.ts
  - lib/mcp/server.ts
  - lib/mcp/pending-changes.ts
  - lib/mcp/approvals.ts
  - lib/mcp-auth.ts
  - app/api/admin/agentic-os/run/route.ts
---

# Feature: Agentic OS — Agent-Action Audit Trail

## Overview

A durable, per-tenant log of every MCP tool invocation by an AI agent: who asked, what tool, redacted inputs, result summary, duration, and the originating `agentic_os_runs` run. Includes a portal/admin review UI and a reversibility link to `mcp_pending_changes` for writes.

## Domain context

Read first: [[00 - E2E Audit Index]]. Two partial pieces exist:
- **`mcp_tool_calls`** (`lib/db/schema/tools.ts`) — per-call telemetry written fire-and-forget by `wrapRegisterTool()` in `lib/mcp/telemetry.ts`, which monkey-patches `server.registerTool` before all domain registrars. Records clientId/toolName/bytes/estimatedTokens/durationMs/success/errorMessage. **Gaps:** no `runId` correlation, no inputs/outputs, 14-day TTL then daily rollups (non-reversible).
- **`agentic_os_runs`** (`lib/db/schema/agenticOs.ts`) — row per `claude -p` subprocess, keyed only by `createdBy` (users.id), **no `clientId`**; captures prompt/vars/status/stdout but is admin-only.
- **Approvals** (`lib/mcp/pending-changes.ts`, `lib/db/schema/approvals.ts`) — `stageOrApply()` mints `mcp_pending_changes` with `originalSnapshot` (pre-mutation state) + `payload` (re-apply args) — the reversibility primitives.

**Instrumentation choke point:** `wrapRegisterTool()` — already the single pass-through for every tool call.

## Problem

1. Runs and individual tool calls are unjoined — can't answer "what did run #47 do?"
2. `mcp_tool_calls` stores byte counts, not actual inputs/output — can't reconstruct what an agent sent/received.
3. 14-day TTL ⇒ audit records disappear; rollups too coarse.
4. No tenant-facing view of agent activity.
5. `agentic_os_runs` has no `clientId` — can't scope run history per tenant.
6. Staged writes (`mcp_pending_changes`) aren't linked back to the originating call.

## Goal

- Every agent tool call durably logged with enough context to answer what happened, why, and (for writes) what changed.
- Per-tenant (`clientId`), retained (90-day floor), never raw secrets.
- Portal clients review their activity; admins see across tenants.
- Applied writes carry a forward link from the audit row to `mcp_pending_changes.id`.

## Design

### Phase 1 — schema

- `agentic_os_runs`: + `clientId` (→ clients, set null) + `runId` varchar(36) (UUID generated at `POST /api/admin/agentic-os/run`, injected as `AGENTIC_RUN_ID` env into the child, read by the MCP server into `PortalMcpContext`).
- New `agent_action_logs` (`lib/db/schema/agenticOs.ts`): id, clientId (NOT NULL → clients cascade), runId varchar(36) (by-value to runs; null for non-agent key calls), apiKeyId, userId, toolName, scopeUsed, inputsSummary jsonb (redacted), outputSummary text (first 2KB), status ('success'|'denied'|'error'), errorMessage, durationMs, pendingChangeId (→ mcp_pending_changes, set null), createdAt. Indexes: (clientId, createdAt), (runId), (clientId, toolName, createdAt), (pendingChangeId) partial. No TTL.
- `lib/mcp/audit-redact.ts`: redact top-level + nested keys matching `/password|secret|token|key|credential|auth|bearer/i` → `[REDACTED]`; 4KB cap with `{_truncated:true}`.

### Phase 2 — instrumentation

Extend `wrapRegisterTool()` to also write `agent_action_logs` (replace `logToolCall` with `logAgentAction` writing both telemetry + audit in one fire-and-forget `Promise.all` — failures never propagate). Add `runId` + `scopeUsed` to `PortalMcpContext` (`lib/mcp-auth.ts`). In `pending-changes.ts`, after `stageOrApply()` inserts a row, call `linkAuditToPendingChange(agentActionLogId, pendingChangeId)`.

### Phase 3 — views + retention

- Admin: `app/admin/agentic-os/runs/[id]/actions/page.tsx` + `GET /api/admin/agentic-os/runs/[id]/actions` (join logs + pending changes).
- Portal (tenant): `app/portal/agentic-os/activity/page.tsx` + `GET /api/portal/agentic-os/activity` (always filter by `clientId`), slim list projection, "View change" link when `pendingChangeId` set.
- Cold-storage archive (S3/Tigris) for rows > 90 days (external-dep).

## Phasing

- **Phase 1 (local)** — schema + `runId` wired into the run route + redact helper.
- **Phase 2 (local)** — redact + context + augment `wrapRegisterTool` + pending-change link; `bun test:tenancy`.
- **Phase 3 (local views; cold-archive is external)** — admin + portal views; archival cron later.

## Key decisions (ADR-style)

- **Log ALL MCP key calls** (not only runId-carrying) — an interactive Claude Desktop user with a portal key deserves an audit trail too; `runId IS NOT NULL` filters agent-only.
- **Dual-write, don't merge** — `mcp_tool_calls` (telemetry, rollups, TTL) vs `agent_action_logs` (audit, permanent) differ in shape/retention/consumers.
- **Redacted 4KB inputs + 2KB output summary** — enough to understand; full bodies live in conversation history; avoids PII/secret/storage bloat.
- **`scopeUsed` via a context side-effect** — tools calling `requireScope` set `ctx.lastScopeAsserted`; the wrapper reads it (avoids editing 176 handlers).

## Open questions

1. Should tenants trigger their own agent runs? (If yes, the `clientId` addition is load-bearing; if admin-only, the portal view shows tool calls only.)
2. Retire the `mcp_tool_calls` rollup once durable per-call history exists, or keep both?
3. Is there a canonical secret-field-name list to drive redaction beyond the regex?
4. Cold-storage target + IAM provisioning for Phase 3 archive.

## Verification plan

- `bun run db:generate` clean (no unexpected drops).
- `bun test:tenancy`: two clients each fire a tool call ⇒ `agent_action_logs` not visible cross-tenant.
- Unit: `audit-redact` (password redacted; non-secret passes; >4KB truncated).
- Integration: fire `brain_create_note` via test MCP server ⇒ one log row with correct clientId/toolName/status/inputsSummary; fire a CMS write through `stageOrApply()` ⇒ `pendingChangeId` set to the created change id.
- `bun test:critical` — golden paths unchanged (instrumentation is fire-and-forget).
