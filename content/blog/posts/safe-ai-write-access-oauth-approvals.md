---
title: "Safe AI Write Access: OAuth 2.1 Scopes and Approval Links"
slug: "safe-ai-write-access-oauth-approvals"
description: "How we use OAuth 2.1 resource indicators, ~50 named scopes, and an approval-link pattern to let AI agents write to production data without human bypasses."
date: 2026-06-27
tags:
  - ai-agents
  - oauth
  - security
  - mcp
  - authorization
  - human-in-the-loop
author: "SimplerDevelopment Team"
draft: true
---

Read-only AI agents are a known quantity. They can summarize, search, and draft, and if they hallucinate a fact about your pipeline, the worst outcome is a wrong answer. Write-capable agents are a different risk class entirely: they can publish content to your site, send emails to your customers, move CRM deals, delete Brain notes, or schedule campaigns — all irreversibly, at machine speed, while you are not watching.

Scope-based authorization is necessary but not sufficient on its own. A correctly scoped token still lets an agent make errors at high velocity if every action executes immediately. The architecture that actually works combines two complementary mechanisms: **scope gating** (limit what an agent can call at all) and an **approval-link pattern** (require a human click-through before any live-content mutation takes effect).

This post explains both, covering the credential model, the ~50 named scopes, the OAuth 2.1 authorization server, and how the approval-link pattern fits into your integration.

---

## Two credential types — pick the right one

The MCP server at `POST /api/mcp` accepts two credential types. Both are sent as a standard Bearer token:

```
Authorization: Bearer <credential>
```

| Credential | Prefix | How to obtain | Best for |
|---|---|---|---|
| Portal API key | `sd_mcp_` | Portal → Settings → API Keys | Developer integrations; personal automation |
| OAuth 2.0 token | `sd_oauth_` | Authorization-code flow (`lib/oauth/server.ts`) | Third-party apps; delegated access on behalf of a user |

For personal automation and developer integrations, a portal API key (`sd_mcp_`) is the fastest path. Navigate to **Settings → API Keys**, create a key, pick your scopes, and you are done.

For third-party applications that act on behalf of a user, the OAuth 2.0 token (`sd_oauth_`) is the right choice. OAuth tokens bind scopes to a specific resource audience via RFC 8707 resource indicators. That binding is load-bearing: a token issued for one resource cannot be replayed against another, which closes a class of cross-tenant token confusion attacks that scoped keys alone do not prevent.

Both are stored securely. Portal API keys are SHA-256 hashed in the `portal_api_keys` table. OAuth tokens carry RFC 8707 audience binding at issuance time.

---

## The OAuth 2.1 authorization server

The full authorization-code flow lives in `lib/oauth/server.ts`. Three features are worth calling out explicitly.

**PKCE (RFC 7636).** Public clients — browser-based apps, native mobile apps, anything that cannot keep a client secret — must use PKCE. The server supports `code_challenge_method=S256`. Without PKCE, an authorization code intercepted in transit is redeemable by an attacker; with it, only the original requester can exchange the code for a token.

**RFC 8707 resource indicators.** The `resource` parameter in the authorization request tells the server which audience the token is for. The token is then cryptographically bound to that audience and will be rejected if presented to a different resource server. If you are building a multi-tenant integration — say, an app that connects to multiple portals — resource indicators prevent an `sd_oauth_` token issued for portal A from being silently accepted by portal B.

**Dynamic client registration.** Clients can be registered without a static pre-registration step. The OAuth client management API lives at `/api/portal/oauth-clients`.

> **Known gap:** there is no self-serve public developer console yet. Client registration currently requires a direct API call to `/api/portal/oauth-clients`. This is on the roadmap.

### Requesting a scoped token

A complete authorization request looks like this:

```
GET /oauth/authorize
  ?client_id=<your_client_id>
  &response_type=code
  &code_challenge=<PKCE_S256_challenge>
  &code_challenge_method=S256
  &scope=brain:read brain:write
  &resource=https://example.simplerdevelopment.com/api/mcp
  &redirect_uri=https://your-app.example.com/oauth/callback
```

1. The user is shown a consent screen listing the requested scopes.
2. After approval, the authorization server issues a short-lived code to your redirect URI.
3. Your app exchanges the code (plus the PKCE verifier) for an `sd_oauth_` token at the token endpoint.
4. The resulting token is scoped to exactly the requested scopes and bound to the `resource` audience.

That token is what you send as `Authorization: Bearer sd_oauth_<token>` to `POST /api/mcp`.

---

## The ~50 named scopes

Every tool registration calls `hasScope(ctx.scopes, ...)` before executing. A missing scope guard is treated as a tenancy bug — the registry baseline test in `tests/unit/mcp-tool-registry-baseline.test.ts` asserts that every one of the 450 registered tools carries a guard, and the test runs as a pre-push gate. You cannot ship a tool without a scope check.

The canonical scope list lives in `lib/oauth/scopes.ts`. Approximately 50 named scopes are defined, following the pattern `<domain>:read` for read-only access and `<domain>:write` for mutations. A handful of scopes have narrower semantics:

| Scope | What it grants |
|---|---|
| `brain:read` | Read notes, documents, meetings, tasks, decisions, glossary, goals, and all other Brain content |
| `brain:write` | Create and update Brain records |
| `brain:approve` | Approve review queue items and decisions — required separately from `brain:write` |
| `crm:read` | Read contacts, companies, deals, pipelines |
| `crm:write` | Create and update CRM records |
| `email:read` | Read campaigns, subscriber lists, templates |
| `email:write` | Create and update email records |
| `email:send` | Send or schedule a campaign — intentionally separate from `email:write` |
| `posts:read` | Read CMS posts and pages |
| `posts:write` | Create and update posts |
| `kanban:read` | Read boards, cards, columns |
| `kanban:write` | Create, update, and delete Kanban records |
| `projects:read` | Read projects and artifacts |
| `approvals:manage` | Approve or reject pending approval records via MCP tools |
| `*` | All 450 tools — wildcard |

Three tools are callable without any scope: `whoami`, `list_workflows`, and `get_workflow`. These are read-only identity and discovery tools.

The `*` wildcard grants access to the full 450-tool surface. Reserve it for trusted internal automation. Never request it for a third-party integration.

### Minimal-privilege scope sets

Request only the scopes your agent actually needs. Some common task profiles:

| Task | Recommended scopes |
|---|---|
| Read-only research agent | `brain:read crm:read projects:read` |
| Content drafting agent | `posts:write brain:read` |
| CRM update agent | `crm:write crm:read` |
| Knowledge base agent | `brain:write brain:read brain:approve` |
| Full-access internal automation | `*` (trusted internal only) |

An agent scoped to `posts:write brain:read` cannot touch your CRM records. An agent scoped to `email:write` can create campaign drafts but cannot send them without `email:send`. These are hard guards enforced by `hasScope()`, not advisory conventions.

---

## The approval-link pattern — human-in-the-loop for mutations

Scope gating answers "can this agent call this tool at all?" The approval-link pattern answers "should this specific mutation take effect right now, without a human seeing it first?"

Most live-content write tools do not mutate immediately. Instead, when a tool is called for a live-content mutation, `lib/mcp/approvals.ts` mints a tokenized approval URL and returns it to the agent in the tool response:

```json
{
  "approvalUrl": "https://example.simplerdevelopment.com/approve/tk_a1b2c3d4e5f6"
}
```

The operation is **pending** — nothing has changed yet. The agent surfaces this URL to a human (in the Claude Desktop UI, in a Slack message, in your own application — wherever is appropriate). The human opens the URL, sees a WYSIWYG preview of exactly what will change, and clicks to confirm. If they do nothing, the change never applies.

### What skips the approval link

Metadata and draft operations mutate immediately — they do not require approval:

- Creating a Brain note (not publishing a document)
- Updating a Kanban card's description
- Creating a campaign draft
- Saving post content without publishing

Live-content mutations — publish, delete, send, move a deal to a closed stage — require approval. The rule is: if the action is immediately visible to end users or permanently removes data, it goes through the approval link.

### The approval lifecycle

Approval records are stored in the database with a page-scoped token. The reviewer does not need to be logged in to the portal — the token alone grants access to the approval review page, which makes it practical to share an approval URL with a stakeholder via email or Slack.

The approval UI at `app/approve/[token]/` shows:

- A desktop/mobile toggle preview of the change
- The agent that requested it and the scope it used
- Confirm and reject controls

The management API at `/api/approve/` lets you query and manage pending approvals programmatically. If you want an agent to manage the approval queue itself — for example, an orchestrating agent that routes approvals to the right reviewer — the MCP tools `approvals_list`, `approvals_get`, `approvals_approve`, and `approvals_reject` are available under the `approvals:manage` scope.

---

## Sanitizing tool results before they reach the model

There is one more line of defense that belongs in every Brain tool handler: `sanitizeToolResult()`.

```typescript
const raw = await fetchBrainNote(noteId, ctx)
return sanitizeToolResult(raw)
```

This function strips API keys, OAuth tokens, and PII fields from the tool result before the output enters the LLM's context window. It runs on every brain tool result. Skipping it opens a prompt-injection path: a malicious note body could instruct the model to repeat a token it observed in a previous tool response, exfiltrating credentials through the model's output.

The rule is simple: every brain tool handler calls `sanitizeToolResult()` before returning. If you are writing a custom handler, make this the last step.

---

## The AI plan gate — protecting platform costs

Before any AI call executes on behalf of a tenant, three steps run in order:

```typescript
const apiKey = await resolveClientApiKey(clientId, 'anthropic')
await checkAiPlanGate(clientId)
// ... make the AI call ...
recordAiUsage(clientId, usage) // fire-and-forget — do not await
```

`resolveClientApiKey` resolves whether the tenant has a Bring Your Own Key (BYOK) configuration or should use the platform key. Never read `process.env.ANTHROPIC_API_KEY` directly in a handler — always go through this resolver.

`checkAiPlanGate` rejects tenants on starter tier without BYOK with a 402/403 before any tokens are spent. Skipping this step silently bills the platform for tenant usage that was never authorized.

`recordAiUsage` is fire-and-forget. Do not `await` it in the critical path — letting it block the response adds latency without benefit. Partial compliance — missing the plan gate, or missing usage recording — produces either a security gap or incorrect billing.

---

## Human review for AI-generated content

The approval-link pattern handles mutation approval. A parallel mechanism handles the AI review queue for AI-generated content: `brainAiReviewItems`.

AI output is never committed directly to canonical data as a source of truth. Meeting transcript summaries, slide edits, and Brain note suggestions flow through this review queue. Reviewers approve or reject each AI-authored item via the portal review UI before it becomes a permanent record. The `brain:approve` scope is required for the MCP tools that manage this queue: `brain_approve_review_item` and `brain_reject_review_item`.

This separation matters. The approval-link pattern is about write authorization — "should this action happen?" The review queue is about content quality — "should this AI-generated text become the canonical record?"

---

## End-to-end checklist for a new AI integration

Before you ship an integration that uses write-capable tools, work through this list:

```
[ ] Choose credential type
    sd_mcp_  → Portal → Settings → API Keys (developer / personal automation)
    sd_oauth_ → authorization-code flow via /api/portal/oauth-clients (third-party)

[ ] Request minimal-privilege scopes
    No wildcard * for external integrations

[ ] If building a public OAuth client, implement PKCE (code_challenge_method=S256)

[ ] Include the resource parameter in your authorization request (RFC 8707)

[ ] Handle { approvalUrl } responses
    Surface the URL to a human — do not auto-approve, do not discard

[ ] Verify sanitizeToolResult() is called in any custom Brain tool handlers

[ ] Sequence AI calls correctly:
    resolveClientApiKey → checkAiPlanGate → AI call → recordAiUsage (fire-and-forget)

[ ] After any new data-access path, run:
    bun test:tenancy
```

---

## What this gets you

The combination of scope gating, OAuth 2.1 resource indicators, and the approval-link pattern lets you give an AI agent genuine write access to your platform without giving it unchecked autonomy. The agent can draft, propose, and queue changes at machine speed. The human decides which of those changes actually land.

That is the right division of labor. Agents are fast and tireless; humans are accountable. Design your authorization model to keep both properties.

---

**Get started:** create an API key in the portal under **Settings → API Keys**, or register an OAuth client via `POST /api/portal/oauth-clients`. See the [full tool and scope reference](/docs/agents/tool-reference) for the complete catalogue of 450 tools and all named scopes, or the [API Index](/docs/agents/api-index) for the credential types and auth model in detail.

<!-- SEO block -->
<!--
Primary: AI agent authorization, OAuth 2.1 scopes, approval-link pattern
Secondary: RFC 8707 resource indicators, PKCE, MCP bearer token, human-in-the-loop AI, brain:approve scope
Internal links:
  /docs/agents/tool-reference#scopes
  /docs/agents/tool-reference#approval-link-pattern
  /docs/agents/api-index
  /docs/agents/architecture-for-agents#6-auth
-->
