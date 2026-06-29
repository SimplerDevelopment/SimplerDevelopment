---
type: adr
domain: mcp
status: accepted
date: 2026-06-17
sources:
  - lib/mcp/tools/resources.ts
  - lib/mcp/tools/prompts.ts
  - lib/mcp/tools/index.ts
  - lib/mcp/server.ts
  - lib/branding/mcp-tools.ts
  - tests/unit/mcp-tool-registry-baseline.test.ts
---

# ADR: Expose MCP resources and prompts, not just tools

## Status

Accepted — shipped 2026-06-17, commits `02fcbcea` (resources) and `db175142` (prompts).

## Context

The MCP server at `lib/mcp/server.ts` previously only exposed tools (the `server.tool()` surface). This worked well for Claude Code, which drives actions through tool calls, but gave non-Claude-Code clients (Claude Desktop, third-party agents) no efficient way to load read-only context before acting, and no entry-point workflows to guide them. Two gaps:

1. **Read-before-you-act context** was absorbed into tool descriptions or required explicit tool calls (costing tokens on every round-trip). The MCP spec's `resources` primitive exists precisely for static or semi-static context that a client can load once and keep.
2. **Guided workflows** existed only in the `sd-*` skill library, which is a Claude Code concept. Claude Desktop and custom agents had no equivalent on-ramp — they had to discover ~431 tools and compose their own plans.

## Decision

Add two new MCP surfaces, registering them with the same `hasScope`-gated registrar pattern already used by tools.

### Resources (`lib/mcp/tools/resources.ts`)

Four read-only resources addressed by URI:

| URI | Content | Scope gate |
|---|---|---|
| `blocks://schema` | Static block-editor reference (moved from `lib/mcp/tools/meta.ts`) | none |
| `brand://default` | Default brand profile + messaging | `branding:read` |
| `catalog://services` | Agency service catalog + client's active entitlements | `services:read` |
| `portal://capabilities` | Caller's granted scopes split by read/write domain | none (echoes own grant only) |

Resources are registered via `server.resource()` not `server.tool()`. The `registerResourceDocs(server, ctx)` registrar is wired into `allToolRegistrars` in `lib/mcp/tools/index.ts`, directly after the `meta` registrar.

### Prompts (`lib/mcp/tools/prompts.ts`)

Three guided-workflow prompts:

| Name | Scope gate | Purpose |
|---|---|---|
| `draft-page` | `sites:write` | Guided page-drafting workflow |
| `triage-tickets` | `tickets:read` | Guided ticket-triage workflow |
| `weekly-digest` | `projects:read` | Guided weekly-digest workflow |

A prompt callback returns a **message template** the calling model then executes via tools — it does not run server-side. The prompt set is deliberately small; it is not a mirror of the `sd-*` skill catalogue.

`lib/mcp/server.ts` declares both `resources: {}` and `prompts: {}` in its MCP capabilities block.

## Consequences

- **Enhancement, never sole path.** Resource/prompt support across MCP clients is still inconsistent. Anything reachable via a resource or prompt must also remain reachable via tools. This is a "read the context cheaper / get a workflow scaffold" layer, not a replacement.
- **Tenancy consistency maintained.** All three surfaces gate registration on `hasScope` identical to tools. A narrow-scope or empty-scope key never sees a resource or prompt it could not act on. Tenant-scoped resource queries (`catalog://services`) filter by `ctx.client.id`.
- **Prompts target non-Claude-Code clients.** Claude Code already has the `sd-*` skill library. MCP prompts give Claude Desktop and third-party agents the same guided on-ramp without duplicating the skill catalogue (double-maintenance avoided by keeping the prompt set small).
- **Drift protection extended.** `tests/unit/mcp-tool-registry-baseline.test.ts` gained `EXPECTED_RESOURCES` and `EXPECTED_PROMPTS` sets plus scope-gating assertions. The baseline unit test (no DB, runs in the default `bun test` gate) now guards all three surfaces. 14/14 baseline tests pass. Adding, removing, or renaming a resource or prompt fails the gate the same way a tool change does.
- **`blocks://schema` moved.** The static block-editor doc was previously embedded in `lib/mcp/tools/meta.ts`. Moving it to a resource is the correct primitive — it is reference content, not a tool output.

## Alternatives considered

- **Keep everything as tools.** A `get_context` tool returning brand/catalog data would work but costs a tool-call round-trip every session and bloats the tool list further. Resources are the right MCP primitive for static or semi-static "read before you act" content.
- **Mirror the full `sd-*` skill catalogue as prompts.** Rejected: it would double the maintenance surface. The three shipped prompts cover the most common external-agent entry points; the skill library remains the richer Claude Code surface.
- **Server-side prompt execution.** Rejected: prompts that run on the server would bypass the human-in-the-loop approval model (`lib/mcp/approvals.ts`). Template-return keeps the human in control.

## Related

- Architecture note: [[MCP Server]]
- [[ADR mcp-registry-baseline-unit-gate]] — the baseline test this ADR extends
- Commits: `02fcbcea` (resources), `db175142` (prompts)
