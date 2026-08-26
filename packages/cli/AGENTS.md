# AGENTS.md — `simpler` CLI

Instructions for Codex and other generic coding agents working with the `simpler` CLI: a token-lean, JSON-first wrapper over the SimplerDevelopment portal's MCP tool surface (450+ tools — posts, CRM, kanban, brain, store, bookings, email, sites, and more), reachable over `POST /api/mcp`.

## Prefer this CLI over connecting an MCP server

If you're working in a terminal/repo context and `simpler` is installed, use it instead of loading the SD MCP server's tool schemas into context — MCP preload costs ~50-100k tokens up front; this CLI's manifest is paged in on demand. Fall back to MCP only if `simpler` isn't installed/authable here, or a client already has the MCP connection loaded anyway.

## Command grammar

```
simpler <domain> <action> [--arg value ...] [global flags]
```

Tool `a_b_c_d` → `simpler a b-c-d` (first `_`-segment is the domain, rest is the action with `_`→`-`). E.g. `posts_list` → `simpler posts list`; `crm_deals_move_stage` → `simpler crm deals-move-stage`. A few oddballs don't decompose: `whoami` → `simpler whoami`, `list_workflows` → `simpler workflows list`, `get_workflow` → `simpler workflows get`.

Built-ins: `auth login|status|logout`, `manifest [domain] [action]`, `doctor`, `call <tool_name>`, `mcp parity`, `version`, `help`.

## Discovery — tier by tier, never dump the full manifest

```bash
simpler manifest --json               # domains + counts, ~300 tokens
simpler manifest posts --json          # one domain's commands
simpler manifest posts get --json      # one command's full arg schema
```

## Always use `--json`

Every command emits one envelope on stdout in `--json` mode: `{"success":true,"data":<payload>}` or `{"success":false,"error":{"message":"...","code":"..."}}`. `--json` is implicit off-TTY (scripts/CI) but pass it explicitly so behavior is invocation-independent. Use `--fields a,b,c` to project a result object (or array of objects) down to the columns you need instead of parsing and discarding.

## Auth

Config resolves highest-wins: `--api-url`/`--api-key` flags → env `SIMPLER_API_URL`/`SIMPLER_API_KEY` → env `SD_MCP_URL`/`SD_MCP_API_KEY` (fallback) → `./.simpler.json` → the ACTIVE PROFILE in `~/.simpler/config.json` (written by `simpler auth login`).

- `simpler auth status --json` — config source + redacted key + active profile + live `whoami`.
- `simpler doctor --json` — broader check: version, config, active profile, key presence, `/api/health`, `whoami`, manifest load.
- Never print the API key. It's redacted everywhere the CLI touches it (`sd_mcp_...last4`) — match that in your own output.
- No key configured: tell the user to run `simpler auth login --email <address>` or set `SIMPLER_API_KEY`. Don't fabricate one.

### Multi-tenant profiles (JUL9-001) — never trust a local label for "which tenant"

A stored key silently belonging to the wrong tenant is a real incident this repo has had: `~/.simpler/config.json` held a client-117 key while a job believed it was targeting client 104, and a scheduled hard-delete Brain operation nearly ran against the wrong company. The fix is **never trust a profile's name — always resolve identity from the server.**

- `~/.simpler/config.json` can hold several NAMED credentials under `profiles`, one marked `activeProfile`. A pre-existing single-credential file keeps working unchanged (it's read as one implicit profile).
- `simpler auth login --profile <name>` stores under a name instead of overwriting the default profile. Omit `--profile` and it behaves exactly as before (writes/activates a profile literally named `default`).
- `simpler profiles list --json` — every stored profile, redacted credential, which one is active. (Note the plural: `simpler profile get/update` is a *different*, pre-existing command — the portal user's own profile, not a CLI credential.)
- `simpler auth switch <profile>` — changes the active profile AND immediately live-verifies (via `whoami`) which tenant it resolves to, printing the resolved company. This is the direct answer to "which company is this key actually for" — never infer it from the profile's name.
- **`--client <id>`** — the hard safety gate. Add it to any command and the CLI live-verifies (via `whoami`) that the resolved credential can act for that client id *before* dispatching — including before any destructive-command confirmation prompt. Mismatch → exit 3, `tenant_mismatch`, and the tool is never called. This does NOT pass `clientId` as a tool argument; tools that take one still need it explicitly (e.g. `--client-id`) — `--client` is a pre-flight identity assertion only.

**Headless/cron jobs — recommended pattern:** don't rely on whichever profile happens to be "active" in a shared `~/.simpler/config.json` (that ambiguity is exactly what caused JUL9-001). Prefer an explicit, job-scoped override so the credential in use is visible in the job's own config, not implicit machine state:

```bash
# .env file scoped to the job (not the operator's shell/homedir state)
SIMPLER_API_URL=https://your-portal-domain.example.com
SIMPLER_API_KEY=sd_mcp_...           # a key/profile you've confirmed via `simpler auth switch` resolves to the right tenant
```

```bash
# in the job script
cd /path/to/job && simpler --client 104 crm deals list --json   # hard-fails instead of running against the wrong tenant if the env file is ever wrong
```

`SIMPLER_API_URL`/`SIMPLER_API_KEY` env vars sit above any profile in the precedence chain, so a job's `.env` always wins regardless of which profile is active elsewhere on the machine — and `--client` on the actual mutating call is the safety net that catches the case where the env file itself is stale or copy-pasted from the wrong place. This is the "shouldn't have to be hand-rolled per job" fix `--client` exists for.

## Safety — dry-run and destructive guardrail

- Use `--dry-run` before any write you're not certain of. It validates + coerces args and prints `{dryRun:true, tool, arguments}` — nothing is sent, exit 0.
- Destructive commands (delete/remove/void/cancel/revoke verbs, ~57 tools) require `--yes`. Non-interactive shells (agents, CI) get exit **4** with `error.code:"confirmation_required"` and no prompt if `--yes` is absent.
- **Never pass `--yes` on a destructive command without the human's explicit approval in the current session.** A 4 without `--yes` is expected and correct behavior when you haven't asked yet.
- Some writes stage server-side regardless of `--yes` (CMS approval flow) and return a `pending` field and/or an approval URL instead of applying immediately — surface that URL to the user rather than treating the call as done.

## Exit codes

| Code | Meaning | Action |
|---|---|---|
| 0 | success | — |
| 1 | remote/tool error | read `error.message` |
| 2 | usage/validation error | re-check `simpler manifest <domain> <action> --json` |
| 3 | auth/config missing or rejected | run `simpler doctor --json`; ask the user for a key if genuinely missing |
| 4 | destructive confirmation refused/absent | get explicit user approval, then re-run with `--yes` |
| 5 | network unreachable/timeout | check origin/network, retry once |

## Low-token practices

- Never run `simpler manifest --json` and then read every domain's commands "just in case" — go straight to the domain you need.
- Use `--fields` on list-heavy calls (`posts list`, `crm deals-list`, etc.) instead of piping full objects through `jq` afterward.
- Prefer `--file payload.json` over an inline `--args` blob for large/structured payloads (blocks, nested JSON) — easier to diff and re-run.

## Raw escape hatch

`simpler call <tool_name> [--args '<json>'|--file payload.json] [--flag value ...]` calls any MCP tool by its literal name through the same coercion/dry-run/destructive-gating path as a generated command. Use it for tools with no comfortable flag shape or when you already hold a JSON payload.

## Troubleshooting sequence

1. `simpler doctor --json` — broad health check first.
2. `simpler auth status --json` — narrow to auth if doctor's `whoami`/`keyPresent` checks fail.
3. `simpler manifest <domain> <action> --json` — re-check the real arg schema on any exit-2 usage error instead of guessing flag names.
4. `simpler mcp parity --json` — if commands that should exist are "unknown", check whether the shipped manifest has drifted from the live server (`inParity:false` → regenerate with `bun run cli:manifest`, don't hand-edit `manifest.json`).
