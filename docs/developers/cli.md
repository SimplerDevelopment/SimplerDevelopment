# `simpler` CLI

Token-lean, JSON-first command-line client for the SimplerDevelopment portal's MCP tool surface. It wraps `POST /api/mcp` (JSON-RPC 2.0 over streamable HTTP, stateless) with one generic dispatch path; per-tool commands are generated from a build-time manifest, not hand-written, so the CLI has 451-tool parity with the portal's MCP server **by construction**. It introduces **zero new API endpoints** — every write still goes through the same tool handlers, scope checks, and CMS-approval staging as an MCP client would hit.

For how AI agents should use this CLI (vs. connecting the MCP server directly) and the full parity matrix, see [`ai-agent-usage.md`](./ai-agent-usage.md).

## Installation

`simpler` is published to npm as [`@simplerdevelopment/cli`](https://www.npmjs.com/package/@simplerdevelopment/cli) (`npm install -g @simplerdevelopment/cli`); the public usage doc lives at [`docs/cli.md`](../cli.md). For working on the CLI itself, from the repo root:

```bash
bun install

# Run directly from source (no build step)
bun run cli whoami --json

# Or build once and link the compiled bin
bun run cli:build          # tsup -> packages/cli/dist/index.js
cd packages/cli && bun link
simpler whoami --json
```

`packages/cli` has its own `tsconfig.json` and is excluded from the root Next.js build; it has zero runtime dependencies (Node ≥22 native `fetch` and `process.loadEnvFile`).

## Authentication

Three ways to get the CLI a `{ apiUrl, apiKey }` pair:

1. **Environment variables** — set `SIMPLER_API_KEY` and `SIMPLER_API_URL` (or the fallback names `SD_MCP_API_KEY` / `SD_MCP_URL`, which match this repo's existing scripting convention, e.g. `scripts/smoke-sd-skills.ts`). Best for CI.
2. **`simpler auth login`** — interactive email + password sign-in against `POST /api/portal/auth/mobile-sign-in`, the same mobile-sign-in endpoint the portal mobile app uses. On success it mints a 90-day `sd_mcp_`-prefixed key and writes `{ apiUrl, apiKey }` to `~/.simpler/config.json` with file mode `0600`. Password is never accepted as an argv flag — it's read from an interactive hidden prompt, or piped via `--password-stdin`.
   ```bash
   simpler auth login --email you@example.com
   simpler auth login --email you@example.com --password-stdin < password.txt
   ```
3. **Mint a key in the portal UI** — Settings → API Keys (`app/portal/settings/api-keys`). Paste the resulting key into `SIMPLER_API_KEY` or `.simpler.json`.

Check what's active with `simpler auth status --json` or the broader `simpler doctor --json`. Sign out locally with `simpler auth logout` (clears the local file only — it does **not** revoke the key server-side; revoke from the portal UI if the key may be compromised).

### `requireCmsApproval` and the `pending` echo

Portal API keys default to `requireCmsApproval: true` (`lib/db/schema/auth.ts`). With that flag set, CMS write calls (posts, blocks, etc.) don't apply immediately — they're staged into `mcp_pending_changes` and require staff approval (via `approvals_*` tools or the portal UI) before they go live. The CLI does not hide this: the tool's JSON response is passed through untouched, so a staged write comes back with a `pending` field and/or an approval URL rather than the final applied object. **Treat a `pending` response as "not live yet"** — surface the approval URL rather than assuming the change took effect.

## Configuration

### Precedence (highest wins)

| # | Source | Notes |
|---|---|---|
| 1 | `--api-url` / `--api-key` flags | per-invocation override |
| 2 | `SIMPLER_API_URL` / `SIMPLER_API_KEY` env | primary env convention |
| 3 | `SD_MCP_URL` / `SD_MCP_API_KEY` env | fallback, matches existing repo scripts |
| 4 | `./.simpler.json` | project-level config file |
| 5 | `~/.simpler/config.json` | user-level, written by `auth login`, mode `0600` |

`apiUrl` and `apiKey` are resolved independently — e.g. the URL can come from `.simpler.json` while the key comes from an env var.

### `.env` loading

If a `.env` file exists in the current working directory, it's loaded via Node 22's `process.loadEnvFile` before resolution runs. It **never overrides** a variable already present in `process.env` — real environment variables always win over `.env` contents.

### `.simpler.json` (project file)

A plain JSON file at the repo/project root:

```json
{
  "apiUrl": "https://your-tenant.example.com",
  "apiKey": "sd_mcp_..."
}
```

Committing an API key to a project file is discouraged for anything beyond local scratch use — prefer env vars in CI and `auth login` for local dev.

### URL normalization

The configured URL is always the portal **origin** — the CLI appends `/api/mcp`, `/api/health`, etc. itself. If a full MCP endpoint URL is pasted in (e.g. `https://host/api/mcp`), the trailing `/api/mcp` and any trailing slash are stripped automatically (`normalizeUrl` in `packages/cli/src/config.ts`).

### Never printed

The API key is never printed in any output mode, including `--verbose` request logging — it's redacted to `sd_mcp_...<last4>` (or a generic `****...<last4>` mask for non-`sd_mcp_` keys).

## Command reference

### Grammar

```
simpler <domain> <action> [--arg value ...] [global flags]
```

**Mapping rule:** an MCP tool named `a_b_c_d` maps to `simpler a b-c-d` — the first `_`-segment is the domain, the rest becomes the action with `_` → `-`. This is deterministic and reversible:

- `posts_list` → `simpler posts list`
- `crm_deals_move_stage` → `simpler crm deals-move-stage`

A handful of oddball tool names don't decompose cleanly and are aliased explicitly: `whoami` → `simpler whoami`, `list_workflows` → `simpler workflows list`, `get_workflow` → `simpler workflows get`.

Every schema argument becomes a `--kebab-case` flag, coerced to the manifest-declared type (`string | number | boolean | json`; nested objects/arrays require a JSON string value). For a full payload instead of many flags, use `--args '<json>'` or `--file payload.json` — both are merged under explicit flags, and flags win on conflicting keys.

### Built-ins

| Command | Purpose |
|---|---|
| `simpler auth login --email <address> [--password-stdin]` | Interactive/piped sign-in; stores key in `~/.simpler/config.json` |
| `simpler auth status [--json]` | Resolved config source + redacted key + live `whoami` |
| `simpler auth logout` | Clear the local key (does not revoke server-side) |
| `simpler manifest [domain] [action] [--json]` | Tiered discovery — see below |
| `simpler doctor [--json]` | End-to-end health check |
| `simpler call <tool_name> [--args json\|--file f] [--flag value ...]` | Call any MCP tool by its raw name |
| `simpler mcp parity [--json]` | Compare shipped manifest vs. the live server's `tools/list` |
| `simpler version` | Print CLI version |
| `simpler help [command]` / `--help` | Usage help, generated from the manifest |

### Manifest tiering (discovery)

Built for both humans and agents to avoid dumping all 451 tool schemas at once:

```bash
simpler manifest --json                 # 44 domains + tool counts (~300 tokens)
simpler manifest posts --json            # posts domain's commands (cmd, desc, destructive)
simpler manifest posts get --json        # posts_get's full arg schema
```

> "Domain" here means one of the 44 tool-file namespaces in `packages/cli/manifest.json` (`crm`, `brain`, `kanban`, …) — a CLI/MCP grouping, not the 22 product domains in [Project Map](../agents/project-map.md). A product domain (e.g. CRM) can span several tool-file namespaces (`crm`, `contracts`, `proposals`).

### Global flags

| Flag | Effect |
|---|---|
| `--json` | Machine-readable envelope on stdout. Implicit default when stdout is not a TTY (CI/piped). |
| `--yes` | Skip the destructive-command confirmation prompt |
| `--dry-run` | Validate + coerce args, print the exact `{tool, arguments}` that would be sent, exit 0 — nothing is sent |
| `--verbose` | Log the request/response (with the key redacted) to stderr |
| `--fields a,b,c` | Client-side projection of the result object (or each object in a result array) down to named fields |
| `--api-url <url>` / `--api-key <key>` | Override resolved config for this invocation |
| `--timeout <ms>` | Request timeout (default 30000ms) |
| `--args '<json>'` | Full argument payload as a JSON object (merges under flags) |
| `--file <path>` | Full argument payload read from a JSON file (merges under flags) |
| `--help` | Show usage for the current command path |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Remote/tool error (JSON-RPC error, tool returned `isError`, non-2xx HTTP other than auth) |
| 2 | Usage/validation error (bad flag, missing required arg, unknown command, manifest missing) |
| 3 | Auth/config missing or rejected (no API URL/key, or a 401/403 from the server) |
| 4 | Destructive confirmation refused or absent |
| 5 | Network unreachable/timeout |

## JSON mode

In `--json` mode, stdout carries **exactly one** JSON document — no other program output shares stdout:

```json
{"success": true, "data": <payload>}
{"success": false, "error": {"message": "…", "code": "…"}}
```

- Human mode (TTY, no `--json`) pretty-prints the same envelope with 2-space indentation instead of a compact single line.
- `--fields a,b,c` projects `data` (an object, or each object in an array) down to the named keys before it's emitted — apply this instead of piping the full payload through `jq` for large list results.
- **stdout vs. stderr:** the envelope is the only thing ever written to stdout. `--verbose` request/response logs, and any other diagnostic output, always go to stderr. This makes `simpler ... --json | jq ...` safe even with `--verbose` turned on.
- MCP tool results are unwrapped: the CLI parses `content[0].text` as JSON when possible and emits only that payload — the outer JSON-RPC/MCP envelope (`content`, `isError`, etc.) is stripped. A tool result with `isError: true`, or a JSON-RPC-level `error`, becomes `success:false` with exit code 1.

## Safety

- **`--dry-run`** short-circuits before any network call: it validates and coerces the arguments and prints `{"dryRun": true, "tool": "<name>", "arguments": {...}}`, exit 0. Nothing is sent to the server. Use this to sanity-check a command before actually running it.
- **Destructive gating:** tools are flagged `destructive: true` in the manifest by a verb-pattern match (`_(delete|remove|void|cancel|revoke)($|_)`) plus an explicit list for oddballs (`bookings_cancel`, `contracts_void`, `team_remove_member`, etc.) — about 57 tools total.
  - Without `--yes`, in an interactive TTY: prompts `Run destructive command "<cmd>"? [y/N]` on stderr.
  - Without `--yes`, non-interactive (CI, piped, agent shell): fails immediately with **exit 4** and `error.code: "confirmation_required"` — no prompt, nothing sent.
  - With `--yes`: proceeds without prompting.
- **Server-side approval staging still applies** regardless of `--yes` — see [`requireCmsApproval` and the `pending` echo](#requirecmsapproval-and-the-pending-echo) above. `--yes` only bypasses the CLI's own confirmation prompt; it never bypasses the portal's own gates.

## Examples

### Local dev

```bash
export SIMPLER_API_URL=http://localhost:3000
export SIMPLER_API_KEY=sd_mcp_xxxxxxxxxxxxxxxx

simpler doctor --json
simpler posts list --status published --json --fields id,title,slug
```

### CI/CD — GitHub Actions step block

```yaml
- name: Simpler CLI health check
  run: bun run cli doctor --json
  env:
    SIMPLER_API_URL: ${{ vars.SIMPLER_API_URL }}
    SIMPLER_API_KEY: ${{ secrets.SIMPLER_API_KEY }}

- name: Nightly content export
  run: |
    bun run cli posts list --json --fields id,title,slug,updatedAt > posts-export.json
  env:
    SIMPLER_API_URL: ${{ vars.SIMPLER_API_URL }}
    SIMPLER_API_KEY: ${{ secrets.SIMPLER_API_KEY }}

- name: MCP/CLI parity gate
  run: bun run cli mcp parity --json
  env:
    SIMPLER_API_URL: ${{ vars.SIMPLER_API_URL }}
    SIMPLER_API_KEY: ${{ secrets.SIMPLER_API_KEY }}
```

`doctor` returns a non-zero exit code (1) when any check fails, so it's usable directly as a CI health gate without extra scripting.

### Scripting with `jq`

```bash
# List every open deal over $10k, id + title + value only
simpler crm deals-list --status open --json --fields id,title,value \
  | jq '[.data[] | select(.value > 10000)]'

# Confirm parity, fail the script if drifted
simpler mcp parity --json | jq -e '.data.inParity == true' > /dev/null
```

## Regenerating the manifest

`packages/cli/manifest.json` is generated, never hand-edited. It's produced by introspecting the live in-process MCP server (`buildMcpServer()`, same pattern as `tests/unit/mcp-tool-registry-baseline.test.ts`) and converting each tool's Zod schema via `z.toJSONSchema()`.

```bash
bun run cli:manifest   # regenerates packages/cli/manifest.json
```

`tests/unit/cli/manifest-drift.test.ts` builds the same in-process server and asserts the manifest's tool-name set matches the live registry exactly — it runs in the default unit gate, so **any new/removed/renamed MCP tool that isn't accompanied by a manifest regeneration fails CI**. When you add a new MCP tool under `lib/mcp/`, run `bun run cli:manifest` and commit the resulting `manifest.json` diff — the CLI command appears automatically with no other CLI code changes required.

## Troubleshooting

Always start with `simpler doctor --json` — it's a single cheap call that checks CLI version, config source + resolved origin, key presence (redacted), `/api/health` reachability, a live `whoami` call, and manifest load, in that order. Read the first failing check.

| Symptom | Likely cause | Next step |
|---|---|---|
| Exit 2, `usage_error` | Bad/missing flag, unknown command | `simpler manifest <domain> <action> --json` to check the real arg schema |
| Exit 2, `manifest_missing` | `packages/cli/manifest.json` not built/found | Run `bun run cli:manifest`, or rebuild (`bun run cli:build`) so `manifest.json` ships alongside `dist/` |
| Exit 3, HTTP 401 or 403 | Key missing, expired, or rejected | `simpler auth status --json`; re-run `simpler auth login` or rotate the key in Settings → API Keys |
| Exit 3, `no_api_url` / `no_api_key` | Nothing resolved from any config layer | Check `simpler doctor --json`'s `configSource` check; set an env var or run `auth login` |
| Exit 4, `confirmation_required` | Destructive command run non-interactively without `--yes` | Get explicit approval, then re-run with `--yes` |
| Exit 5, timeout/network error | Origin unreachable, wrong URL, or dev server down | Verify `SIMPLER_API_URL`, increase `--timeout`, confirm the portal is running |
| `mcp parity` reports `inParity: false` | Manifest drifted from the live server | Regenerate with `bun run cli:manifest` and commit |

401 vs 403 are both surfaced as CLI exit code 3 (`unauthorized`) — the CLI doesn't distinguish "no credentials" from "credentials rejected/insufficient scope" in its exit code, since both require the same remediation (check/rotate the key). Read `error.message` for the HTTP status if you need to tell them apart programmatically.

## MCP vs. CLI

The CLI is a strict, generated wrapper over the same MCP tool surface — there is no capability available over MCP that isn't available as a CLI command (see the parity matrix). Prefer the CLI in a terminal, script, or CI job: it avoids preloading MCP tool schemas into a model's context, since the manifest is paged in tier-by-tier on demand instead. For the agent-facing usage rule and the full domain-by-domain parity table, see [`ai-agent-usage.md`](./ai-agent-usage.md).
