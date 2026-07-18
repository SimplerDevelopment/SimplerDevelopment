# Extending the MCP server — adding a tool

The platform ships an in-repo [Model Context Protocol](https://modelcontextprotocol.io) server so AI clients (Claude Code, Claude Desktop, Cursor, or any MCP client) can drive the portal — content, CRM, Company Brain, commerce, email, bookings, billing. This guide is for **contributors extending** that server. To *connect a client* to an existing server instead, see [`docs/mcp.md`](../mcp.md); for the catalog of existing tools, see [`docs/api/mcp/overview.md`](../api/mcp/overview.md).

## How it's wired

| File | Role |
|---|---|
| `app/api/mcp/route.ts` | The HTTP endpoint (MCP Streamable HTTP transport, stateless). Authenticates the `sd_mcp_…` key / OAuth token and resolves the calling client + scopes. |
| `lib/mcp/server.ts` | `buildMcpServer(ctx)` — builds an `McpServer` scoped to the authenticated client and dispatches to per-domain registrars via `allToolRegistrars` from `./tools`. |
| `lib/mcp/tools/<domain>.ts` | One registrar per domain (cms, crm, brain, kanban, billing, …). Each registrar declares its tools and **guards every one** with `hasScope(ctx.scopes, …)`. |
| `lib/mcp/projections.ts` | Slim projections for list/echo responses — keep responses small. |
| `lib/mcp/telemetry.ts` | Per-call telemetry (latency, token cost). Don't bypass it. |
| `lib/mcp/approvals.ts`, `approval-links.ts`, `pending-changes.ts` | The approval-workflow primitive — most **write** tools mint an approval URL instead of mutating directly. |
| `tests/unit/mcp-tool-registry-baseline.test.ts` | Baseline test that asserts the exact registered tool-name set. Fails on any add/remove/rename until you update `EXPECTED_TOOLS`. |

Authoritative, always-current reference: [`lib/mcp/CLAUDE.md`](../../lib/mcp/CLAUDE.md).

## Adding a tool — the four lockstep pieces

A tool is not done until **all four** move together. (Internal contributors have a `simplerdev-mcp-tool` scaffolding skill that emits these in lockstep; the manual steps are below.)

1. **Handler** — add the tool in the right `lib/mcp/tools/<domain>.ts` registrar. Echo compactly: a create/update returns `{ id, slug, status }`, not the whole row.
2. **Input schema** — define a Zod schema for the arguments. Validate at the boundary; never trust client input.
3. **Scope guard** — wrap the registration in `hasScope(ctx.scopes, '<domain>:<read|write|*>')`. **A missing scope check is a tenancy/permission leak** — every tool is scoped to the client that owns the key, with no cross-tenant access.
4. **Telemetry** — go through the existing telemetry path so the call is metered.

Then reconcile the baseline test:

```bash
bun test:unit -- tests/unit/mcp-tool-registry-baseline
```

Add your tool name to `EXPECTED_TOOLS` (and `EXPECTED_RESOURCES` / `EXPECTED_PROMPTS` if you added a resource or prompt). The test builds the server with `@/lib/db` mocked — handlers never run, so it needs no database and runs in the default `bun test` / pre-push gate, catching drift on every commit. It also asserts every tool is gated by `hasScope`.

## Token budget — keep responses small

Response size is a real cost for the calling model. Defaults:

- Use the slim **projections** in `lib/mcp/projections.ts` for list responses.
- Put heavy fields (body / html / blocks / large JSON) behind an opt-in `include` flag, off by default.
- Echo data, not the world.

(Internal contributors have a `simplerdev-mcp-token-budget` skill that audits tool responses for this.)

## Write tools and the approval workflow

Many write tools are **deliberately not immediately destructive**. When the calling key has `require_cms_approval = true`, covered tools stage the mutation into `mcp_pending_changes` and return `{ pending: true, pendingId, summary }` plus an approval URL a human clicks to apply it. See [`docs/mcp.md`](../mcp.md#cms-approval-workflow) and `app/approve/` / `app/api/approve/`. Writer keys cannot self-approve — it's enforced by scope.

## Resources and prompts (optional)

Beyond tools, the server exposes read-only **resources** (`lib/mcp/tools/resources.ts` — e.g. `blocks://schema`, `portal://capabilities`) and guided **prompts** (`lib/mcp/tools/prompts.ts`, surfaced as slash-commands in capable clients). Tenant-scoped resources gate on `hasScope` exactly like tools. These are enhancements for clients that lack a richer skill library — never the *only* path to a capability.

## Don't

- Don't add a tool without a scope guard.
- Don't return full rows / large blobs by default.
- Don't hand-edit generated migrations to back a tool — change `lib/db/schema/` then `bun run db:generate`.
- Don't bypass telemetry.

See also: [`docs/guides/BRAIN.md`](BRAIN.md) for the Company Brain / RAG (embeddings over pgvector) that powers the `brain_*` tools.
