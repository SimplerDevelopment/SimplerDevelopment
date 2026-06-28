# lib/mcp — Agent Notes

The portal-side MCP server: tool catalogue exposed to AI clients (Claude Code, Claude Desktop, custom agents) so they can drive the SimplerDevelopment portal.

> Token budget: keep this file <80 lines.

## Layout

- `server.ts` — `buildMcpServer(ctx)` bootstraps an McpServer scoped to the authenticated portal client; dispatches to per-domain registrars via `allToolRegistrars` from `./tools`.
- `tools/<domain>.ts` — one file per domain (cms, crm, brain, kanban, billing, …). Each registrar guards every tool with `hasScope(ctx.scopes, …)`.
- `tools/resources.ts` — read-only MCP **resources** (context docs, not tools): `blocks://schema`, `brand://default`, `catalog://services`, `portal://capabilities`. Tenant-scoped resources gate registration on `hasScope` just like tools; unscoped ones (block schema, capabilities) carry no tenant data.
- `tools/prompts.ts` — user-triggered MCP **prompts** (guided workflows, surfaced as slash-commands in capable clients): `draft-page`, `triage-tickets`, `weekly-digest`. Each gated on a representative scope; the callback returns a message *template* the client's model then runs via the tools (the prompt does not execute). These exist for clients WITHOUT the Claude Code skill library — keep the set small, don't mirror the whole skill catalogue. Capability declared in `server.ts` (`prompts: {}`). Resources/prompts are an enhancement for capable clients — never the *only* path to a capability.
- `approvals.ts` / `approval-links.ts` / `pending-changes.ts` — the approval-workflow primitive: most write tools mint an approval URL instead of mutating directly. **Many MCP tools are deliberately not-immediately-destructive** — they produce an approval the user must click.
- `projections.ts` / `rollup.ts` — slim projections for list responses. **Use these when adding tools.**
- `telemetry.ts` / `usage-stats.ts` — per-call telemetry (latency, token cost). Don't bypass.
- `decks-publish.ts` / `blocks-schema.ts` / `types.ts` — supporting helpers.

## Load-bearing invariants

- **Adding a tool requires lockstep changes** across (a) handler in `tools/<domain>.ts`, (b) input schema (Zod), (c) scope guard, (d) telemetry. The `simplerdev-mcp-tool` skill produces all four together — use it.
- **Registry baseline test:** `tests/unit/mcp-tool-registry-baseline.test.ts` fails if a tool is added/removed/renamed without updating `EXPECTED_TOOLS` (and `EXPECTED_RESOURCES` / `EXPECTED_PROMPTS` for resources/prompts). It builds the server and asserts the exact registered tool-name set; handlers never run and `@/lib/db` is mocked, so it needs no DB — which is why it lives in the **unit layer and runs in the default `bun test` / pre-push gate** (so drift fails on every commit). After a deliberate tool add/remove/rename, run `bun test:unit -- tests/unit/mcp-tool-registry-baseline` and reconcile `EXPECTED_TOOLS`. New tools must also pass the scope-filter sub-tests (every tool gated by `hasScope`).
- **Token budget per tool response is real.** Default to slim projections (`projections.ts`); add an `include` opt-in flag for heavy fields (body/html/blocks/json blobs). Echoes on write should be compact — the `simplerdev-mcp-token-budget` skill audits these.
- **Every tool must check scope.** Missing `hasScope(...)` = a tenancy/permission leak.
- **Echo data, not the world.** A create/update tool should echo `{ id, slug, status }` not the entire row.

## Workflow

| Task | Use |
|---|---|
| New MCP tool | `simplerdev-mcp-tool` skill |
| Tool response feels heavy | `simplerdev-mcp-token-budget` skill (audit + slim projections) |
| Cross-cutting question over all tools | Spawn `Explore` subagent — `tools/cms.ts` and `tools/crm.ts` are >1600 lines each |

## God-file warning

Don't Read these into the main thread:

- `lib/brain/mcp-sdk-adapter.ts` (5630) — the brain MCP adapter; largest file in the repo. Consumed by the brain registrar.
- `tools/cms.ts` (2216), `tools/crm.ts` (1670), `tools/kanban.ts` (1484), `approvals.ts` (1193)

## Pointers

- MCP protocol: https://modelcontextprotocol.io/
- Approval flow: `app/approve/`, `app/api/approve/`
- Tool registration test: `tests/unit/mcp-tool-registry-baseline.test.ts`
