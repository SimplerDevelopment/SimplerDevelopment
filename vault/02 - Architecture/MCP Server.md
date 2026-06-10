---
type: architecture
domain: mcp
status: active
date: 2026-06-09
sources:
  - lib/mcp/CLAUDE.md
  - lib/mcp/server.ts
  - lib/mcp-auth.ts
  - app/api/mcp/route.ts
  - tests/unit/mcp-tool-registry-baseline.test.ts
  - lib/mcp/tools/index.ts
---

# MCP Server

The portal-side MCP server exposes the SimplerDevelopment platform as a tool catalogue to AI clients (Claude Code, Claude Desktop, custom agents). It is a standard MCP-protocol server implemented with the `@modelcontextprotocol/sdk` package, built on demand per-request and scoped to a single authenticated portal client.

## Entry point

`app/api/mcp/route.ts` is the Next.js route that surfaces the server over HTTP. It is stateless and serverless-safe: each POST builds a fresh server, connects a `WebStandardStreamableHTTPServerTransport` with `enableJsonResponse: true`, handles the request, then closes. GET returns 405 to prevent SSE-channel confusion with `mcp-remote`. Auth resolution happens before the server is built — a missing or invalid token produces a 401 with an RFC-9728 `WWW-Authenticate` challenge pointing to the OAuth protected-resource metadata.

## Server bootstrap

`lib/mcp/server.ts` exports `buildMcpServer(ctx: PortalMcpContext)`. It creates an `McpServer` with per-client instructions baked into the capabilities block, then iterates `allToolRegistrars` from `lib/mcp/tools/index.ts` to compose the full tool catalogue. Each registrar is responsible for its own scope gates — the dispatcher applies no extra logic. This pattern means adding a domain is a one-line change in the barrel, not an edit to the monolith.

## Auth and scopes

`lib/mcp-auth.ts` owns all authentication. It exposes two token prefixes:

- `sd_mcp_` — long-lived portal API keys stored as SHA-256 hashes in `portal_api_keys`
- `sd_oauth_` — OAuth-issued short-lived tokens in `oauth_access_tokens`

`resolvePortalFromRequest` reads the `Authorization: Bearer` header and dispatches to `resolvePortalApiKey` or `resolveOAuthToken` depending on prefix. Both paths resolve the active `client` row and return a `PortalMcpContext` carrying `{ userId, client, scopes, keyId }`. Usage is fire-and-forget updated on each valid call.

`hasScope(granted, required)` enforces the scope model: `"*"` grants all, `"projects:*"` grants all sub-scopes, `"projects:read"` grants exactly one. Every tool handler must call `hasScope` before executing — missing a guard is a tenancy/permission leak. See [[Auth & Roles]] for the broader auth architecture.

## Registrar pattern

Each file under `lib/mcp/tools/` exports a single `register*Tools(server, ctx)` function. Handlers are registered via `server.tool()` with Zod input schemas inline. The lockstep invariant (enforced by `lib/mcp/CLAUDE.md` and the `simplerdev-mcp-tool` skill) is:

1. Handler in `lib/mcp/tools/<domain>.ts`
2. Zod input schema
3. `hasScope` guard
4. Telemetry pass-through via `lib/mcp/telemetry.ts`

`lib/mcp/projections.ts` and `lib/mcp/rollup.ts` provide slim projections for list responses. New tools must default to these and expose heavy fields (`body`, `html`, `blocks`, JSON blobs) only via an explicit `include` opt-in flag. The `simplerdev-mcp-token-budget` skill audits responses that have grown heavy over time.

## Approval workflow

Most write tools are deliberately non-destructive on first call. `lib/mcp/approvals.ts`, `lib/mcp/approval-links.ts`, and `lib/mcp/pending-changes.ts` implement the approval primitive: a write tool mints a signed approval URL and returns it; the human must visit `app/approve/` to commit the change. This prevents runaway AI mutations.

## Tool inventory

| File | Tool count | Domain |
|---|---|---|
| `lib/mcp/tools/cms.ts` | 42 | [[CMS & Pages]] |
| `lib/mcp/tools/crm.ts` | 43 | [[CRM]] |
| `lib/mcp/tools/kanban.ts` | 39 | [[Kanban]] |
| `lib/mcp/tools/brain.ts` | (delegate) | [[Company Brain]] |
| `lib/mcp/tools/email.ts` | 19 | [[Email]] |
| `lib/mcp/tools/bookings.ts` | 10 | [[Bookings]] |
| `lib/mcp/tools/pitch-decks.ts` | 12 | [[Pitch Decks]] |
| `lib/mcp/tools/projects.ts` | 12 | [[Projects]] |
| `lib/mcp/tools/tickets.ts` | 6 | [[Tickets]] |
| `lib/mcp/tools/team.ts` | 6 | [[Team]] |
| `lib/mcp/tools/surveys.ts` | 6 | [[Surveys]] |
| `lib/mcp/tools/services.ts` | 5 | [[Services]] |
| `lib/mcp/tools/automations.ts` | 5 | [[Automations]] |
| `lib/mcp/tools/billing.ts` | 4 | [[Billing]] |
| `lib/mcp/tools/sprints.ts` | 4 | [[Sprints]] |
| `lib/mcp/tools/ai.ts` | 2 | [[AI Credits]] |
| `lib/mcp/tools/profile.ts` | 2 | [[Profile]] |
| `lib/mcp/tools/integrations.ts` | 2 | [[Integrations]] |
| `lib/mcp/tools/hosting.ts` | 2 | [[Hosting]] |
| `lib/mcp/tools/branding.ts` | (delegate) | [[Branding]] |
| `lib/mcp/tools/storefront.ts` | (delegate) | [[Storefront]] |
| `lib/mcp/tools/post-types.ts` | (delegate) | [[Post Types]] |
| `lib/mcp/tools/approvals.ts` | (delegate) | [[Approvals]] |
| `lib/mcp/tools/meta.ts` | 1 | meta / whoami |

Brain tools delegate to `lib/brain/mcp-sdk-adapter.ts` (5 630 lines — god file; do not read into main thread). Branding, storefront, post-types, and approvals use similar adapter delegates.

## Registry baseline test (drift protection)

`tests/unit/mcp-tool-registry-baseline.test.ts` locks in the exact set of tool names produced by `buildMcpServer` under a `"*"` scope key. It lives in the unit layer (no DB needed — `@/lib/db` is mocked) so it runs in the default `bun test` gate and in the pre-push hook. Any tool add, remove, or rename that does not also update `EXPECTED_TOOLS` fails the gate immediately. The test also asserts that every tool is gated by `hasScope` via scope-filter sub-tests. This is the primary guard against the "131 tools drifted red unseen" failure mode that occurred when the test lived in the integration layer.

## Workflows

| Task | Use |
|---|---|
| New MCP tool | `simplerdev-mcp-tool` skill |
| Heavy tool response | `simplerdev-mcp-token-budget` skill |
| Cross-cutting tool questions | Spawn `Explore` subagent — `lib/mcp/tools/cms.ts` and `lib/mcp/tools/crm.ts` are >1 600 lines each |
