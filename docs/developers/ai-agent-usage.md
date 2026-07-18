# AI agent usage of `simpler`

How coding agents (Claude Code, Codex, or any terminal-driving agent) should use the `simpler` CLI against the SimplerDevelopment portal, and the parity guarantee between it and the portal's MCP tool surface.

## How agents should use the CLI

Full operating instructions live in two places — this section is a pointer, not a duplicate:

- **`.claude/skills/simpler-cli/SKILL.md`** (+ `commands.md`, `examples.md`) — the Claude Code skill: decision rule for CLI-vs-MCP, discovery flow, safety model, exit codes, a copy-pasteable onboarding prompt.
- **`packages/cli/AGENTS.md`** — the same operating rules in Codex/generic-agent convention (picked up automatically by tools that read `AGENTS.md`).

Summary, condensed:

1. **Prefer the CLI over connecting the MCP server directly** when working in a terminal or repo context. Connecting the MCP server preloads ~50-100k tokens of tool schemas up front; the CLI's manifest is paged in tier by tier, on demand.
2. **Discover tier by tier, never dump the full manifest:**
   ```bash
   simpler manifest --json               # 44 domains + counts (~300 tokens)
   simpler manifest <domain> --json       # that domain's commands
   simpler manifest <domain> <action> --json   # one command's full arg schema
   ```
3. **Always pass `--json`** and parse `{success, data|error}`. Use `--fields a,b,c` to narrow large results instead of parsing and discarding.
4. **Use `--dry-run`** before any write you're unsure of. Destructive commands (delete/remove/void/cancel/revoke verbs, ~57 tools) require `--yes` — never pass `--yes` without the user's explicit approval in the current conversation; a bare exit 4 is the expected, correct outcome when you haven't asked yet.
5. **Watch for `pending` / approval-URL fields** in write responses — the portal's server-side CMS-approval staging (`requireCmsApproval`, default `true` on API keys) still applies regardless of `--yes`. Surface the approval URL; the change is not live until a human approves it.
6. **Exit codes:** 0 ok · 1 remote/tool error · 2 usage error (re-check the manifest) · 3 auth (run `doctor`) · 4 confirmation needed · 5 network.

See `docs/developers/cli.md` for the full human-facing command reference, config precedence, and troubleshooting.

## Parity matrix

Parity between the CLI and the MCP tool surface is **by construction**, not maintained by hand: `packages/cli/manifest.json` is generated from the same live `buildMcpServer()` registry that the MCP endpoint serves (`scripts/generate-cli-manifest.ts`), and every registered tool becomes exactly one generated `simpler <domain> <action>` command. There is no tool present over MCP that is absent from the CLI, and no CLI command that doesn't correspond to a real registered tool.

Per-domain rollup, generated from `packages/cli/manifest.json` (`toolCount: 451`, `domains: 44`):

| Domain | MCP tools | CLI commands | Status | Notes |
|---|---|---|---|---|
| ai | 4 | 4 | parity (by construction) | – |
| approvals | 4 | 4 | parity (by construction) | – |
| automations | 5 | 5 | parity (by construction) | – |
| block | 7 | 7 | parity (by construction) | `block_templates_*` tools |
| booking | 5 | 5 | parity (by construction) | `booking_pages_*`, `booking_analytics_get` |
| bookings | 4 | 4 | parity (by construction) | `bookings_*` (reservation CRUD), distinct from `booking` |
| brain | 156 | 156 | parity (by construction) | largest domain — Company Brain/RAG, notes, docs, playbooks, org units, topics |
| branding | 9 | 9 | parity (by construction) | – |
| chat | 5 | 5 | parity (by construction) | – |
| client | 2 | 2 | parity (by construction) | – |
| contracts | 4 | 4 | parity (by construction) | – |
| crm | 34 | 34 | parity (by construction) | – |
| deck | 1 | 1 | parity (by construction) | `deck_analytics_get`, distinct from `decks` |
| decks | 12 | 12 | parity (by construction) | – |
| email | 20 | 20 | parity (by construction) | campaigns, lists, segments, subscribers, templates, analytics |
| gift | 2 | 2 | parity (by construction) | `gift_certificates_*` |
| hosting | 2 | 2 | parity (by construction) | read-only; see `deploy` exception below |
| integrations | 2 | 2 | parity (by construction) | – |
| invoices | 2 | 2 | parity (by construction) | – |
| kanban | 39 | 39 | parity (by construction) | boards, cards, checklists, labels, sprints, recurrences |
| linkedin | 4 | 4 | parity (by construction) | – |
| media | 5 | 5 | parity (by construction) | – |
| my | 1 | 1 | parity (by construction) | `my_tasks_list` |
| nav | 6 | 6 | parity (by construction) | – |
| notifications | 2 | 2 | parity (by construction) | – |
| post | 13 | 13 | parity (by construction) | `post_types_*`, distinct from `posts` |
| posts | 10 | 10 | parity (by construction) | post CRUD, revisions, taxonomies, HTML upload |
| profile | 2 | 2 | parity (by construction) | – |
| project | 3 | 3 | parity (by construction) | `project_members_*` |
| projects | 8 | 8 | parity (by construction) | – |
| proposals | 5 | 5 | parity (by construction) | – |
| service | 3 | 3 | parity (by construction) | `service_catalog_list`, `service_requests_*` |
| sites | 6 | 6 | parity (by construction) | – |
| sprints | 4 | 4 | parity (by construction) | – |
| store | 28 | 28 | parity (by construction) | products, variants, orders, discounts, customers, reviews |
| suggested | 2 | 2 | parity (by construction) | `suggested_project_requests_create`, `suggested_projects_list` |
| surveys | 7 | 7 | parity (by construction) | – |
| taxonomies | 3 | 3 | parity (by construction) | – |
| team | 4 | 4 | parity (by construction) | – |
| tickets | 6 | 6 | parity (by construction) | – |
| usage | 1 | 1 | parity (by construction) | `usage_get` |
| website | 6 | 6 | parity (by construction) | domains, env vars |
| whoami | 1 | 1 | parity (by construction) | aliased: `simpler whoami` (no `simpler whoami whoami`) |
| workflows | 2 | 2 | parity (by construction) | aliased: `list_workflows`→`simpler workflows list`, `get_workflow`→`simpler workflows get` |

**44 domains, 451 tools, 451 CLI commands — sums match.**

## Exceptions and notes

A few things intentionally have no CLI command, none of which reduce the parity guarantee above (they're not MCP *tools*):

- **MCP resources are not CLI commands.** `blocks://schema`, `brand://default`, `catalog://services`, `portal://capabilities` (`lib/mcp/tools/resources.ts`) are read-only context documents, not callable tools — there's no `tools/call` equivalent to wrap. Per `lib/mcp/CLAUDE.md`: "Resources/prompts are an enhancement for capable clients — never the *only* path to a capability." Every piece of data a resource exposes is also reachable through an ordinary tool (and therefore an ordinary CLI command).
- **MCP prompts are not CLI commands.** `draft-page`, `triage-tickets`, `weekly-digest` (`lib/mcp/tools/prompts.ts`) are guided-workflow templates surfaced as slash-commands in capable MCP clients — the callback returns a message template that the *client's own model* then executes via ordinary tools; the prompt itself performs no action. They exist for MCP clients without a skill library (i.e., not Claude Code, which already has richer skills for the same workflows). Same "never the only path" rule applies.
- **`deploy` is intentionally absent.** Hosting is Vercel/Railway-side, not a portal-owned action — there's nothing for an MCP tool or CLI command to wrap. The nearest reads are `simpler hosting get` / `simpler hosting list`.
- **OAuth 2.1 PKCE login is deferred.** Portal API keys plus `simpler auth login`'s mobile-sign-in flow cover v1; PKCE is revisited only if the CLI is distributed outside the org.

### Live parity check

The table above is a point-in-time rollup from the committed manifest. To confirm the *running* server still matches it:

```bash
simpler mcp parity --json
```

Compares the shipped `manifest.json` tool names against a live `tools/list` call and returns `{ missing: [], extra: [], inParity: true }`. `missing` = tools registered on the live server but absent from the manifest (regenerate); `extra` = tools in the manifest no longer live (also regenerate, or investigate a removal).

## How parity stays true

Three layers keep the CLI from silently drifting out of sync with the MCP registry:

1. **Manifest regeneration** — `bun run cli:manifest` (`scripts/generate-cli-manifest.ts`) rebuilds `packages/cli/manifest.json` from the live in-process server (`buildMcpServer()`, `'*'` scopes). A new MCP tool becomes a new CLI command purely by running this — no CLI code changes.
2. **`tests/unit/cli/manifest-drift.test.ts`** — builds the same in-process server and asserts the manifest's tool-name set exactly equals the registry's. Runs in the default unit gate, so any tool added/removed/renamed without a manifest regeneration fails CI immediately.
3. **`tests/unit/mcp-tool-registry-baseline.test.ts`** — the upstream guard the drift test mirrors: fails if a tool (or resource/prompt) is added/removed/renamed without updating `EXPECTED_TOOLS`/`EXPECTED_RESOURCES`/`EXPECTED_PROMPTS`. This is what forces a deliberate acknowledgment every time the registry itself changes, which is what the CLI manifest then picks up.

Net effect: a new MCP tool requires touching the registry baseline test (acknowledging the change) and regenerating the CLI manifest (picking it up) — both enforced by CI — before it can ship. There is no path for the CLI to fall behind the MCP surface undetected.
