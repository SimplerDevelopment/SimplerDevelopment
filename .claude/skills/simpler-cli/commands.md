# simpler CLI — command reference

Reference only. See `SKILL.md` for how/why to use this; `examples.md` for copy-pasteable flows.

## Grammar

```
simpler <domain> <action> [--arg value ...] [global flags]
```

- Tool-name mapping: MCP tool `a_b_c_d` → domain = first `_`-segment, action = the rest with `_` → `-`.
  Examples: `posts_list` → `simpler posts list`; `crm_deals_move_stage` → `simpler crm deals-move-stage`; `store_orders_update_status` → `simpler store orders-update-status`.
- Alias map (the few tool names that don't decompose as `<domain>_<action>`):
  | Tool name | Command |
  |---|---|
  | `whoami` | `simpler whoami` |
  | `list_workflows` | `simpler workflows list` |
  | `get_workflow` | `simpler workflows get` |
- Every Zod arg on a tool becomes a `--kebab-case` flag (`requireCmsApproval` → `--require-cms-approval`). Scalars are coerced per the manifest's declared type (`string|number|boolean|json`); `json`-typed args (objects/arrays) take a JSON string.
- Whole-payload alternatives to individual flags: `--args '<json>'` or `--file payload.json` (a JSON object file). Precedence when combined: `--file` < `--args` < individual `--flag`s (flags win).

## Built-in commands

| Command | Purpose |
|---|---|
| `simpler auth login --email <address> [--password-stdin]` | Interactive (or piped) login via `/api/portal/auth/mobile-sign-in`; writes `~/.simpler/config.json` (mode 0600) |
| `simpler auth status` | Resolved config source + redacted key + live `whoami` |
| `simpler auth logout` | Clears the local key file (does **not** revoke server-side — revoke from the portal if compromised) |
| `simpler manifest [domain] [action]` | Tiered discovery: no args → domain counts; `<domain>` → its commands; `<domain> <action>` → full arg schema |
| `simpler doctor` | Version, config source/origin, key presence, `/api/health` reachability, `whoami`, manifest load — cheap end-to-end check |
| `simpler call <tool_name> [--args json|--file f] [--flag value ...]` | Raw escape hatch: call any MCP tool by its literal name; same coercion/dry-run/destructive gating as generated commands |
| `simpler mcp parity` | Shipped `manifest.json` tool names vs. live `tools/list` → `{ inParity, missing[], extra[], live, manifest }` |
| `simpler version` | Print CLI version |
| `simpler help [command...]` / `--help` | Usage text; with no args, global help; with a builtin or `<domain> [action]`, that command's help |

## Global flags

| Flag | Effect |
|---|---|
| `--json` | Force machine JSON envelope on stdout. Default when stdout is not a TTY (CI/pipes); pass explicitly in scripts/agents |
| `--yes` | Skip the destructive-command confirmation prompt/deny |
| `--dry-run` | Validate + coerce args, print `{dryRun:true, tool, arguments}`, send nothing, exit 0 |
| `--verbose` | Log request/response detail to stderr (Authorization header redacted) |
| `--fields a,b,c` | Client-side projection of the result object (or each object in a result array) to just these keys |
| `--api-url <url>` | Override resolved API origin for this call |
| `--api-key <key>` | Override resolved API key for this call |
| `--timeout <ms>` | Override request timeout (default 30000) |
| `--help` | Show help for the given command path (or global help with none) |

Tool-specific flags come from the manifest's `args[]` for that command; run `simpler manifest <domain> <action> --json` to see them, or `simpler <domain> <action> --help`.

## Config precedence (highest wins)

1. `--api-url` / `--api-key` flags
2. env `SIMPLER_API_URL` / `SIMPLER_API_KEY`
3. env `SD_MCP_URL` / `SD_MCP_API_KEY` (fallback — existing repo convention)
4. `./.simpler.json` (project, `{ "apiUrl": "...", "apiKey": "..." }`)
5. `~/.simpler/config.json` (user, written by `simpler auth login`, mode 0600)

Notes: a `.env` file in cwd is loaded (via `process.loadEnvFile`) but never overrides an already-set real env var. The configured URL is the portal **origin** — the CLI appends `/api/mcp` etc. itself; pasting the full `/api/mcp` URL is tolerated (stripped).

## Output envelope

`--json` mode emits exactly one JSON document on stdout:

```json
{"success": true, "data": <payload>}
{"success": false, "error": {"message": "...", "code": "..."}}
```

Human mode (TTY, no `--json`) pretty-prints the same envelope. All logging (`--verbose`, warnings) goes to stderr only — stdout is reserved for the envelope.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Remote/tool error (JSON-RPC error, tool `isError`, non-2xx HTTP) |
| 2 | Usage/validation error (bad or missing flag, unknown command/domain, manifest missing/corrupt) |
| 3 | Auth/config missing or rejected (no API URL/key, 401/403) |
| 4 | Destructive confirmation refused or absent |
| 5 | Network unreachable/timeout |

## Error codes (`error.code` in the failure envelope)

`no_api_url` · `no_api_key` · `network_error` · `timeout` · `unauthorized` · `rpc_error` · `tool_error` · `http_error` · `usage_error` · `confirmation_required` · `manifest_missing` · `not_found`

## Manifest tiers (agent discovery)

| Call | Approx size | Returns |
|---|---|---|
| `simpler manifest --json` | ~300 tokens | `{ toolCount, domains: [{name, tools}], builtins[] }` |
| `simpler manifest <domain> --json` | domain-sized | `{ domain, commands: [{cmd, desc, destructive}] }` |
| `simpler manifest <domain> <action> --json` | one command | full `{ name, cmd, domain, desc, destructive, scope, args[] }` |

450+ tools across 40+ domains — discover the live count via `simpler manifest --json`, don't hardcode it.

## Safety / destructive gating

Manifest flags `destructive: true` on tools matching the verb pattern `_(delete|remove|void|cancel|revoke)($|_)` plus an explicit list (~57 tools total, e.g. `bookings_cancel`, `contracts_void`, `team_remove_member`).

- Destructive + no `--yes`: TTY → interactive `y/N` prompt; non-TTY (CI/agent) → exit 4, `error.code: "confirmation_required"`.
- `--dry-run` always short-circuits before the destructive check — it never sends anything and never prompts.
- Server-side gates are independent of the CLI: CMS writes on approval-staged keys land in `mcp_pending_changes` and the CLI passes that `pending` echo through untouched; many tools mint an approval URL instead of publishing directly.
