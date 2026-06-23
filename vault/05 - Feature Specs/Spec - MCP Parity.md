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

# Spec - MCP Parity (Chat, Notifications, Surveys-submit, Analytics)

## Overview

**Correction (2026-06-23):** The original audit incorrectly listed tickets/helpdesk as a missing group. `lib/mcp/tools/tickets.ts` has existed since commit `000195cd4` with `tickets_list`, `tickets_get`, `tickets_create`, `tickets_reply`, `tickets_update`, `tickets_attach_file_from_url` — all scope-guarded and `clientId`-scoped. That file was hardened on 2026-06-23 (status-enum `waiting` → `waiting_on_customer` bug fix + slim projections). Section 1 below is kept for the record but is DONE, not a build target.

Four domains have full API and portal UI coverage but zero MCP tools: live chat, notifications, surveys (response submission), and analytics readback. This spec closes that gap with 12–15 new tools across four build groups. Source of gap analysis: `docs/audits/portal-layer-audit-2026-06.md` §5 (MCP audit).

Audience: portal tenants whose agents or OAuth integrations need to read/reply to chat conversations, consume notifications, submit survey responses on behalf of contacts, or pull analytics aggregates — all operations that currently require brittle HTML scraping or undocumented internal API calls.

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

### 1. tickets_* — DONE (audit error corrected)

> **STATUS: ALREADY SHIPPED.** `lib/mcp/tools/tickets.ts` has existed since commit `000195cd4`. The original audit incorrectly listed this group as missing. Section kept for the record only — not a build target.

**Tools present in `lib/mcp/tools/tickets.ts`:** `tickets_list`, `tickets_get`, `tickets_create`, `tickets_reply`, `tickets_update`, `tickets_attach_file_from_url`.

**Scopes:** `tickets:read` / `tickets:write` — both in `lib/oauth/scopes.ts`; all tools scope-guarded and `clientId`-scoped.

**Hardening applied 2026-06-23:**
- Status-enum bug fixed: `waiting` → `waiting_on_customer` to match schema.
- Slim projections applied to list/get responses.
- Breaking reply-param rename was reverted.

**Data:** `app/api/portal/tickets/` and `app/api/portal/tickets/[id]`; tables `supportTickets`, `ticketMessages` in `lib/db/schema/pm.ts`.

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

1. `surveys_submit_response` — S-effort, scope already exists
2. `notifications_*` — S-effort, straightforward new scopes
3. `usage_get` — S-effort, closes Journey D audit gap
4. `chat_*` — M-effort, new scopes needed, SSE caveat to navigate
5. Analytics per-domain — M-effort, multiple data sources, define projection shape per domain first

(tickets_* was originally #1 but is already shipped — see Section 1 above.)

## Related fixes

These side-findings from `docs/audits/portal-layer-audit-2026-06.md` §5 should be resolved in the same initiative:

- **`tickets:read`/`tickets:write`** (`lib/oauth/scopes.ts`): these scopes exist and ARE used by `lib/mcp/tools/tickets.ts`. No action needed — resolved by the pre-existing implementation.
- **`store:read`/`store:write` missing from `SUPPORTED_SCOPES`** (`lib/oauth/scopes.ts`): `lib/storefront/mcp-sdk-adapter.ts` uses these scopes as guards, but they are not registered in `SUPPORTED_SCOPES` or `DEFAULT_GRANTED_SCOPES`. OAuth users can only access storefront tools today via a wildcard grant (`*`). Fix: add both to `SUPPORTED_SCOPES`; add `store:read` to defaults. This is a Backlog item on [[MCP Parity Board]] (effort S, independent of the tool work).
- **`triage-tickets` prompt** (`lib/mcp/tools/prompts.ts`): the prompt references the tickets tools that now exist in `lib/mcp/tools/tickets.ts`. No dead-reference concern.

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
