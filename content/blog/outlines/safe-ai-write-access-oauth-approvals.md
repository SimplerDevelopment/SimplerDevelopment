# Outline: Giving an AI Agent Safe Write Access

---

## Meta

**SEO title:** Safe AI Write Access: OAuth 2.1 Scopes and Approval Links
**Meta description:** How we use OAuth 2.1 resource indicators, ~50 named scopes, and an approval-link pattern to let AI agents write to production data without human bypasses.
**URL slug:** `safe-ai-write-access-oauth-approvals`
**Target audience:** Engineers integrating AI agents into production SaaS; security engineers designing AI authorization models; developers connecting Claude or similar agents to business data.
**Primary keywords:** AI agent authorization, OAuth 2.1 scopes, approval-link pattern
**Secondary keywords:** RFC 8707 resource indicators, PKCE, MCP bearer token, human-in-the-loop AI, brain:approve scope

---

## Outline

### H2: The problem — agents with write access are a different risk class

- Read-only agents are low risk. Write-capable agents can delete data, publish content, send emails to customers, or move CRM deals — all irreversibly, at machine speed.
- Standard OAuth controls (scope gating) are necessary but not sufficient: a scoped token still allows an agent to make an error at high velocity if the action is immediate.
- Two complementary mechanisms solve this: **scope-based authorization** (limit what an agent can call at all) and the **approval-link pattern** (require human click-through for live-content mutations).

### H2: Credential types and when to use each

| Credential | Prefix | Auth path | Best for |
|---|---|---|---|
| Portal API key | `sd_mcp_` | Portal → Settings → API Keys | Developer integrations; personal automation |
| OAuth 2.0 bearer token | `sd_oauth_` | Auth-code flow (`lib/oauth/server.ts`) | Third-party apps; delegated access on behalf of a user |

- Both are sent as `Authorization: Bearer <credential>` to `POST /api/mcp`.
- OAuth tokens bind scopes to a specific resource audience via RFC 8707 resource indicators. This prevents a token issued for one resource from being replayed against another.

### H2: The OAuth 2.1 authorization server

- Full authorization-code flow implemented in `lib/oauth/server.ts`.
- PKCE (RFC 7636) is supported — required for public clients (browser-based, native apps).
- RFC 8707 resource indicators: the `resource` parameter in the authorization request binds the token to an audience.
- Dynamic client registration: clients can be registered without a static pre-registration step.
- OAuth client management API at `/api/portal/oauth-clients`. Note: there is no self-serve public developer console yet — this is a known gap.

#### H3: Requesting a scoped token

The authorization flow:

```
1. Redirect user to /oauth/authorize?
     client_id=<id>&
     response_type=code&
     code_challenge=<PKCE>&
     code_challenge_method=S256&
     scope=brain:read brain:write&
     resource=https://yourportal.simplerdevelopment.com/api/mcp

2. User reviews the consent screen and approves.

3. Auth server issues a code; client exchanges it for sd_oauth_ token.

4. Token is scoped to the requested scopes and audience.
```

### H2: The ~50 named scopes

Every tool call checks `hasScope(ctx.scopes, ...)` — a missing scope guard is a tenancy bug caught by the registry baseline test.

#### H3: Read vs. write vs. special scopes

- Pattern: `<domain>:read` grants read tools; `<domain>:write` grants mutation tools for that domain.
- Special scopes with narrower semantics:
  - `email:send` — required to send or schedule a campaign (separate from `email:write` which covers create/update)
  - `brain:approve` — required to approve review items and decisions in the Brain
  - `approvals:manage` — required to approve or reject pending approval records
- Wildcard `*` grants all 450 tools — use only for trusted internal automation, never for third-party integrations.
- Unscoped tools callable without any scope: `whoami`, `list_workflows`, `get_workflow`.

#### H3: Minimal-privilege scope selection

Recommended scope sets for common agent tasks:

| Task | Recommended scopes |
|---|---|
| Read-only research agent | `brain:read crm:read projects:read` |
| Content drafting agent | `posts:write brain:read` |
| CRM update agent | `crm:write crm:read` |
| Knowledge base agent | `brain:write brain:read brain:approve` |
| Full-access internal automation | `*` (trusted only) |

### H2: The approval-link pattern — human-in-the-loop for mutations

#### H3: How it works

- Most live-content write tools (`brain_*`, `crm_*`, CMS posts, email campaigns) do **not** mutate immediately.
- Instead, `lib/mcp/approvals.ts` mints a tokenized approval URL.
- The tool response includes `{ "approvalUrl": "https://yourportal.com/approve/<token>" }`.
- The operation is **pending** — it has not taken effect.
- A human opens the approval URL, sees a WYSIWYG preview of the change, and clicks to confirm.
- If the human does nothing, the change never applies.

#### H3: What skips the approval link

Metadata and draft operations mutate immediately — they do not require click-through approval. Examples:
- Creating a draft post (not publishing it)
- Updating a kanban card's description
- Creating a Brain note (not publishing a document)

Live-content mutations — publish, delete, send, move to a stage — require approval.

#### H3: Approval lifecycle

- Approval record created in DB with a page-scoped token (not a session-scoped token — the reviewer does not need to be logged in if the token is shared correctly).
- Public reviewer UI at `app/approve/[token]/` — shows a desktop/mobile toggle preview of the change.
- Management API at `/api/approve/` — query and manage pending approvals.
- MCP tools for programmatic approval management: `approvals_list`, `approvals_get`, `approvals_approve`, `approvals_reject` (requires `approvals:manage` scope).

### H2: Sanitizing tool results before they reach the model

- `sanitizeToolResult()` is called on every brain tool result before the output enters the LLM context.
- Strips API keys, OAuth tokens, and PII fields so they are never visible in model context windows.
- This is mandatory — skipping it risks credential exfiltration via prompt injection.

### H2: The BYOK and plan gate — protecting platform AI costs

Before any AI call on behalf of a tenant:

1. **`resolveClientApiKey(clientId, provider)`** — resolves whether the tenant has a Bring Your Own Key (BYOK) configured or should use the platform key. Never read `process.env.ANTHROPIC_API_KEY` directly.
2. **`checkAiPlanGate(clientId)`** — rejects tenants on starter tier without BYOK with 402/403. Skipping this silently bills the platform.
3. AI call executes.
4. **`recordAiUsage()`** — fire-and-forget (never `await` in the critical path).

These three steps are required in this order for every AI call. Partial compliance produces either a security gap (missing plan gate) or incorrect billing (missing usage recording).

### H2: The human-review queue for AI output

- AI output is never committed directly to canonical data as the source of truth.
- Meeting transcripts, slide edits, and Brain note suggestions flow through `brainAiReviewItems` — a human-review queue.
- Reviewers approve or reject each AI-authored item via the portal review UI before it becomes a permanent record.
- `brain:approve` scope is required for the MCP tools that manage this queue.

### H2: End-to-end authorization checklist for a new AI integration

```
[ ] Choose credential type (sd_mcp_ for personal; sd_oauth_ for third-party)
[ ] Request minimal-privilege scopes — no wildcard for external integrations
[ ] Implement PKCE if building a public OAuth client
[ ] Handle { approvalUrl } responses — surface the URL to a human, do not auto-approve
[ ] Verify sanitizeToolResult is wired for any custom Brain tool handlers
[ ] resolveClientApiKey → checkAiPlanGate → AI call → recordAiUsage (in order)
[ ] Test with bun test:tenancy after any new data-access path
```

---

## Key code / concepts to show

- `hasScope(ctx.scopes, 'crm:write')` — guard call signature
- OAuth authorization request URL with PKCE and resource indicator parameters
- Tool response shape when approval is required: `{ "approvalUrl": "https://..." }`
- `sanitizeToolResult(result)` — call site in a brain tool handler
- `resolveClientApiKey(clientId, 'anthropic')` → `checkAiPlanGate(clientId)` sequence

---

## Internal links

- `/docs/agents/tool-reference#scopes` — full scope list
- `/docs/agents/tool-reference#approval-link-pattern` — approval-link detail
- `/docs/agents/api-index` — credential types and auth model
- `/docs/agents/architecture-for-agents#6-auth` — OAuth server and role model
- Feature inventory: Auth & Security (`vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` §17)
- Feature inventory: E-Sign & Approvals (`vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` §13)

---

## CTA

**Primary:** "Connect your AI agent — get an API key in the portal under Settings → API Keys, or configure OAuth via `/api/portal/oauth-clients`."
**Secondary:** Link to `/docs/agents/tool-reference` for the full scope and tool catalogue.

---

## Screenshot / GIF requirements

1. Screenshot: OAuth consent screen showing requested scopes.
2. GIF: AI agent returns `approvalUrl` in Claude Desktop → human opens the URL → approval review page → clicks approve.
3. Diagram: Credential → scope check → tool handler → immediate mutation OR approval-link branch.
4. Screenshot: Portal approvals queue with pending AI-authored changes.
5. No fabricated scope counts or approval rates.
