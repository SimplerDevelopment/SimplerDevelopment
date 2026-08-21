# lib/mcp — Agent Notes

The portal-side MCP server: tool catalogue exposed to AI clients (Claude Code, Claude Desktop, custom agents) so they can drive the SimplerDevelopment portal.

> Token budget: keep this file <80 lines.

## Layout

- `server.ts` — `buildMcpServer(ctx)` bootstraps an McpServer for the authenticated **user**; dispatches to per-domain registrars via `allToolRegistrars` from `./tools`.
- `client-scope.ts` — which company a call acts on. A credential carries a consent-time client allowlist (`client_ids`), intersected with live `client_members` per request; a multi-company credential gets a `clientId` param injected into every tool schema and must pass it (omitting it is refused with the roster, never defaulted). **The target is resolved in `app/api/mcp/route.ts` BEFORE `buildMcpServer` — 31 registrars hoist `const clientId = ctx.client.id` at registration time, so resolving any later leaves them pinned to the default company while appearing to honour the argument.** Also holds the per-company role gate (`AUTH_ROLE_ENFORCE=1` to enforce; log-only until then).
- `tools/<domain>.ts` — one file per domain (cms, crm, brain, kanban, billing, …). Each registrar guards every tool with `hasScope(ctx.scopes, …)`.
- `tools/resources.ts` — read-only MCP **resources** (context docs, not tools): `blocks://schema`, `brand://default`, `catalog://services`, `portal://capabilities`. Tenant-scoped resources gate registration on `hasScope` just like tools; unscoped ones (block schema, capabilities) carry no tenant data.
- `tools/prompts.ts` — user-triggered MCP **prompts** (guided workflows, surfaced as slash-commands in capable clients): `draft-page`, `triage-tickets`, `weekly-digest`. Each gated on a representative scope; the callback returns a message *template* the client's model then runs via the tools (the prompt does not execute). These exist for clients WITHOUT the Claude Code skill library — keep the set small, don't mirror the whole skill catalogue. Capability declared in `server.ts` (`prompts: {}`). Resources/prompts are an enhancement for capable clients — never the *only* path to a capability.
- `approvals.ts` / `approval-links.ts` / `pending-changes.ts` — the approval-workflow primitive: most write tools mint an approval URL instead of mutating directly. **Many MCP tools are deliberately not-immediately-destructive** — they produce an approval the user must click.
- `projections.ts` / `rollup.ts` — slim projections for list responses. **Use these when adding tools.**
- `telemetry.ts` / `usage-stats.ts` — per-call telemetry (latency, token cost). Don't bypass.
- `decks-publish.ts` / `blocks-schema.ts` / `types.ts` — supporting helpers.

## Load-bearing invariants

- **Adding a tool requires lockstep changes** across (a) handler in `tools/<domain>.ts`, (b) input schema (Zod), (c) scope guard, (d) telemetry, (e) `EXPECTED_TOOLS` in the registry baseline test, and (f) **the CLI manifest — `bun run cli:manifest`**. (f) is the one that gets missed: it lives outside `lib/mcp/` entirely (`packages/cli/manifest.json`), so nothing in this directory hints at it, and `tests/unit/cli/manifest-drift.test.ts` fails the build on a count mismatch — a red unit shard whose message names a tool you just added correctly. Regenerate, don't hand-edit. (The `simplerdev-mcp-tool` skill this file used to defer to does not exist on disk; do the six by hand until it does.)
- **Registry baseline test:** `tests/unit/mcp-tool-registry-baseline.test.ts` fails if a tool is added/removed/renamed without updating `EXPECTED_TOOLS` (and `EXPECTED_RESOURCES` / `EXPECTED_PROMPTS` for resources/prompts). It builds the server and asserts the exact registered tool-name set; handlers never run and `@/lib/db` is mocked, so it needs no DB — which is why it lives in the **unit layer and runs in the default `bun test` / pre-push gate** (so drift fails on every commit). After a deliberate tool add/remove/rename, run `bun test:unit -- tests/unit/mcp-tool-registry-baseline` and reconcile `EXPECTED_TOOLS`. New tools must also pass the scope-filter sub-tests (every tool gated by `hasScope`).
- **Token budget per tool response is real.** Default to slim projections (`projections.ts`); add an `include` opt-in flag for heavy fields (body/html/blocks/json blobs). Echoes on write should be compact — the `simplerdev-mcp-token-budget` skill audits these.
- **Every tool must check scope.** Missing `hasScope(...)` = a tenancy/permission leak.
- **A new tool's name decides whether a viewer may call it.** `isReadOnlyTool` in `client-scope.ts` classifies by name segment and fails CLOSED — anything with no read verb counts as a write. Name reads `*_list` / `*_get` / `*_search`, or add the segment there.
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
- `tools/cms.ts` (2216), `tools/crm.ts` (1670), `approvals.ts` (1193)
- `tools/kanban.ts` is now 988 — it was split under the file-size ratchet; card
  artifacts / templates / propose-sprint / recurrences live in
  `tools/kanban-artifacts.ts` (472). Adding a kanban tool means checking the
  budget again (`bun scripts/check-file-budget.ts`).

## Pointers

- MCP protocol: https://modelcontextprotocol.io/
- Approval flow: `app/approve/`, `app/api/approve/`
- Tool registration test: `tests/unit/mcp-tool-registry-baseline.test.ts`
