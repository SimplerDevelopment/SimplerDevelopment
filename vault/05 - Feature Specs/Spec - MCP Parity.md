---
type: spec
domain: mcp
status: planned
date: 2026-06-23
sources:
  - docs/audits/portal-layer-audit-2026-06.md
  - lib/mcp/tools/tickets.ts
  - lib/mcp/tools/prompts.ts
  - lib/mcp/tools/surveys.ts
  - lib/mcp/projections.ts
  - lib/mcp/telemetry.ts
  - lib/mcp/usage-stats.ts
  - lib/mcp-auth.ts
  - lib/oauth/scopes.ts
  - lib/db/schema/pm.ts
  - lib/db/schema/chat.ts
  - lib/db/schema/surveys.ts
  - lib/storefront/mcp-sdk-adapter.ts
  - tests/unit/mcp-tool-registry-baseline.test.ts
  - app/api/portal/tickets/route.ts
  - app/api/portal/chat/conversations
  - app/api/portal/notifications/route.ts
  - app/api/surveys/[slug]
---

# Spec - MCP Parity (Tickets, Chat, Notifications, Surveys, Analytics)

## Overview

Five domains have full API and portal UI coverage but zero MCP tools: tickets/helpdesk, live chat, notifications, surveys (response submission), and analytics readback. This spec closes that gap with 15–18 new tools across five groups. Source of gap analysis: `docs/audits/portal-layer-audit-2026-06.md` §5 (MCP audit).

Audience: portal tenants whose agents or OAuth integrations need to triage tickets, read/reply to chat conversations, consume notifications, submit survey responses on behalf of contacts, or pull analytics aggregates — all operations that currently require brittle HTML scraping or undocumented internal API calls.

## Domain context

Read first: [[MCP Tools & Protocols]], [[Company Brain & AI]].

### Implementation invariants (from `lib/mcp/CLAUDE.md`)

Every tool requires four lockstep changes — use the `simplerdev-mcp-tool` skill to scaffold all four together:

1. Handler in `lib/mcp/tools/<domain>.ts`
2. Zod input schema in the same file
3. `hasScope(ctx.scopes, '...')` guard via `lib/mcp-auth.ts`
4. Slim projection from `lib/mcp/projections.ts`

Telemetry is automatic: `lib/mcp/telemetry.ts` wraps `registerTool` and records every call.

The registry baseline test at `tests/unit/mcp-tool-registry-baseline.test.ts` (`EXPECTED_TOOLS` constant + scope-filter sub-tests) **must be updated** for every new tool.

Grantable scopes live in `lib/oauth/scopes.ts` (`SUPPORTED_SCOPES` + `DEFAULT_GRANTED_SCOPES`). `hasScope` (in `lib/mcp-auth.ts`) supports `*`, `resource:*`, and exact matching.

## Tool groups

### 1. tickets_* (effort M) — Cheapest win

**Scopes:** `tickets:read` / `tickets:write` — both are ALREADY in `lib/oauth/scopes.ts` (reserved, never used). A `triage-tickets` prompt exists in `lib/mcp/tools/prompts.ts` but the tools it implies are absent.

**Data:** API at `app/api/portal/tickets/` and `app/api/portal/tickets/[id]`; tables `supportTickets`, `ticketMessages` in `lib/db/schema/pm.ts` (no separate assignees table — assignee is a field on `supportTickets`).

| Tool | Scope | Input | Slim projection |
|---|---|---|---|
| `tickets_list` | tickets:read | status, priority, assignee, overdue flag | {id, subject, status, priority, requester, updatedAt} |
| `tickets_get` | tickets:read | ticketId | ticket + message thread |
| `tickets_create` | tickets:write | {subject, body, priority, requesterEmail?} | {ticketId} |
| `tickets_reply` | tickets:write | {ticketId, body, internal?} | {messageId} |
| `tickets_update` | tickets:write | {ticketId, status?, priority?, assigneeId?, slaNote?} | {ticketId, updatedAt} |

**Value:** enables the Classify-and-Act multi-agent pattern for support triage — a fleet agent reads `tickets_list`, classifies each, and dispatches sub-agents to draft replies.

### 2. surveys_submit_response (effort S)

**Scope:** reuse `surveys:write` (already in `SUPPORTED_SCOPES`).

**Data:** mirrors the public `app/api/surveys/[slug]` POST but authenticated + tenant-scoped via `ctx.clientId`; table `surveyResponses` in `lib/db/schema/surveys.ts`.

| Tool | Scope | Input |
|---|---|---|
| `surveys_submit_response` | surveys:write | {surveyId or slug, answers, respondentEmail?, respondentName?} |

Implementation notes:
- Reuse the route's existing validation and `computeSurveyScore` from `lib/surveys/score.ts`.
- Respect `allowMultiple` flag and required-field validation.
- Set `source='mcp'` on the response row for attribution.
- Return `{responseId}`.

### 3. notifications_* (effort S)

**Scopes:** NEW `notifications:read` / `notifications:write` — add both to `SUPPORTED_SCOPES`; add `notifications:read` to `DEFAULT_GRANTED_SCOPES` (least-privilege; preferred over reusing `profile:*`).

**Data:** API at `app/api/portal/notifications/`; table `notifications` in `lib/db/schema/pm.ts`.

| Tool | Scope | Input |
|---|---|---|
| `notifications_list` | notifications:read | {unreadOnly?, limit?} |
| `notifications_mark_read` | notifications:write | {notificationId or all: true} |

### 4. usage_get (effort S)

**Scope:** reuse `billing:read` (already in `SUPPORTED_SCOPES`).

**Data:** `lib/mcp/usage-stats.ts` — `getSummary()` reads `mcpToolCallDailyRollups`, already scoped by `clientId`.

| Tool | Scope | Input |
|---|---|---|
| `usage_get` | billing:read | {days?: number (default 30)} |

Returns the caller's own MCP usage and token-spend, scoped to `ctx.clientId`. Closes the audit's "Journey D" gap: clients and their agents cannot currently see their own MCP cost.

### 5. chat_* (effort M)

**Scopes:** NEW `chat:read` / `chat:write` — add both to `SUPPORTED_SCOPES`; add `chat:read` to `DEFAULT_GRANTED_SCOPES`.

**Data:** API at `app/api/portal/chat/conversations` and `app/api/portal/chat/widgets`; tables `chatWidgets`, `chatConversations`, `chatMessages` in `lib/db/schema/chat.ts`.

| Tool | Scope | Input |
|---|---|---|
| `chat_conversations_list` | chat:read | {widgetId?, status?} |
| `chat_conversations_get` | chat:read | {conversationId} — returns conversation + messages |
| `chat_conversation_reply` | chat:write | {conversationId, body} |
| `chat_conversation_update` | chat:write | {conversationId, status?, assigneeId?} |
| `chat_widgets_list` | chat:read | — |

**SSE caveat:** the realtime inbox stream at `app/api/portal/chat/inbox-stream` is not MCP-shaped (MCP is request/response). Expose polling `list`/`get` only — do not attempt to bridge the SSE stream.

### 6. Analytics readback (effort M)

**Recommendation:** split per-domain to reuse existing read scopes rather than minting a broad `analytics:read`. This avoids over-privileged grants.

| Tool | Scope | Data source |
|---|---|---|
| `email_analytics_get` | email:read | `emailCampaigns` aggregates |
| `booking_analytics_get` | bookings:read | booking analytics tables |
| `store_analytics_get` | store:read | store analytics tables |
| `deck_analytics_get` | decks:read | `pitchDeckViews`, `abEvents` |

Each tool returns the same aggregates shown in the corresponding UI analytics page.

## Suggested build order

1. `tickets_*` — scopes already exist, highest agent value (triage pattern), prompt already references them
2. `surveys_submit_response` — S-effort, scope already exists
3. `notifications_*` — S-effort, straightforward new scopes
4. `usage_get` — S-effort, closes Journey D audit gap
5. `chat_*` — M-effort, new scopes needed, SSE caveat to navigate
6. Analytics per-domain — M-effort, multiple data sources, define projection shape per domain first

## Related fixes

These side-findings from `docs/audits/portal-layer-audit-2026-06.md` §5 should be resolved in the same initiative:

- **`tickets:read`/`tickets:write` reserved but unused** (`lib/oauth/scopes.ts` lines 11–12): these scopes exist but have no tools. Building tickets_* above closes this.
- **`store:read`/`store:write` missing from `SUPPORTED_SCOPES`** (`lib/oauth/scopes.ts`): `lib/storefront/mcp-sdk-adapter.ts` uses these scopes as guards, but they are not registered in `SUPPORTED_SCOPES` or `DEFAULT_GRANTED_SCOPES`. OAuth users can only access storefront tools today via a wildcard grant (`*`). Fix: add both to `SUPPORTED_SCOPES`; add `store:read` to defaults. This is a Backlog item on [[MCP Parity Board]] (effort S, independent of the tool work).
- **`triage-tickets` prompt without tools** (`lib/mcp/tools/prompts.ts`): the prompt was written speculatively. Building `tickets_*` removes the dead-reference concern.

## Validation plan

Per [[Gate Picking]]:

- Unit: update `EXPECTED_TOOLS` in `tests/unit/mcp-tool-registry-baseline.test.ts` for each new tool; add scope-filter sub-tests.
- Integration: per-tool happy-path + scope-denied cases; `bun test:tenancy` after any data-access changes (all tools read/write by `ctx.clientId`).
- E2E: `bun test:critical` before declaring done.
- Manual: verify `usage_get` returns correctly scoped data; verify `chat_conversation_reply` does not leak cross-tenant conversations.

## Open questions

- Should `notifications:read` auto-grant to all new OAuth apps, or require explicit grant? (Recommendation above is auto-grant; confirm with product.)
- `analytics_get` domain split — confirm the four domains above cover what the platform analytics pages expose, or add more.
- `tickets_update` SLA field: confirm `supportTickets` schema column name before scaffolding.
