---
name: simpler-cli
description: Teach an agent to use the `simpler` CLI to call the SimplerDevelopment portal's MCP tool surface (450+ tools — posts, CRM, kanban, brain, store, bookings, email, sites, and more) from a terminal or CI job, without loading MCP tool schemas into context. Use when the user says "use the simpler cli", "sd cli", "call the portal from the terminal", is working in a repo where `simpler` is installed (a `packages/cli` bin, `.simpler.json`, or `simpler` on PATH), or needs portal data inside a CI/CD job or script. Prefer this over connecting the SD MCP server directly whenever working from a terminal/repo context.
user-invocable: true
allowed-tools: Bash, Read
---

# simpler-cli

`simpler` is a token-lean, JSON-first CLI that wraps the SimplerDevelopment portal's MCP surface (`POST /api/mcp`, JSON-RPC over streamable HTTP). It exposes the same 450+ tools available over MCP, but as `simpler <domain> <action>` commands with a manifest an agent can page through tier by tier instead of preloading every tool schema.

Full reference: `commands.md` (grammar, flags, exit codes) in this skill directory. Copy-pasteable flows: `examples.md`.

## Decision rule — CLI vs. MCP

**Prefer the CLI when working in a terminal or repo context.** Reasoning: connecting the SD MCP server preloads ~50-100k tokens of tool schemas up front; the CLI's manifest is fetched on demand, tier by tier, so a session that only ever touches `posts` and `crm` never pays for the other 40 domains.

Fall back to the MCP server connection only when:
- `simpler` is not installed or cannot be authenticated in this environment, or
- a capable client already has the MCP connection loaded for this session (no cost to reuse it), or
- the task needs MCP-only behavior the CLI doesn't surface (there isn't one today — the CLI is a strict wrapper).

## Discovery flow — never dump the full manifest

The manifest is tiered specifically so an agent doesn't have to read all 450+ tool schemas to make one call. Drill down:

```bash
simpler manifest --json                    # domains + tool counts only, ~300 tokens
simpler manifest posts --json               # one domain's commands (cmd, desc, destructive)
simpler manifest posts get --json           # one command's full arg schema
```

Do not run a bare `simpler manifest --json` and then read every domain — go straight to the domain you need. If you don't know the domain, skim the top-level list once, then commit to a domain and go one level deeper.

## Always use `--json`

Every command supports `--json` for a single machine-readable envelope on stdout:

```json
{"success": true, "data": <payload>}
{"success": false, "error": {"message": "…", "code": "…"}}
```

`--json` is implicit whenever stdout isn't a TTY (CI, piped output), but pass it explicitly in scripts/agent contexts so behavior doesn't depend on how the shell is invoked. All logs (`--verbose`, warnings) go to stderr — stdout is always exactly one JSON document in `--json` mode.

Narrow large results with `--fields a,b,c` (client-side projection over the result object or array of objects) instead of parsing and discarding columns yourself:

```bash
simpler posts list --json --fields id,title,slug
```

## Auth

Config resolves in this order (highest wins): CLI flags (`--api-url`/`--api-key`) → env `SIMPLER_API_URL`/`SIMPLER_API_KEY` → env `SD_MCP_URL`/`SD_MCP_API_KEY` (fallback, matches existing repo convention) → `./.simpler.json` (project) → `~/.simpler/config.json` (user, written by `simpler auth login`).

- `simpler auth status --json` — shows resolved config source, redacted key, and a live `whoami` call. Use this first when unsure what identity/client you're operating as.
- `simpler doctor --json` — broader health check: CLI version, config source + origin, key presence, `/api/health` reachability, `whoami`, manifest load. Run this when anything is failing and you don't know why.
- **Never echo the API key.** The CLI redacts it everywhere (`sd_mcp_...last4`); do the same in any output you produce (logs, comments, commit messages).
- If no key is configured, tell the user to run `simpler auth login --email <address>` (interactive password prompt, or `--password-stdin` piped) or set `SIMPLER_API_KEY`. Don't try to guess or fabricate a key.

## Safety model

- Before any write when unsure of the effect, run the same command with `--dry-run` first. It validates arguments and prints the exact `{tool, arguments}` that *would* be sent — nothing is sent, exit 0.
- Destructive commands (verbs matching delete/remove/void/cancel/revoke, ~57 tools total — e.g. `posts delete`, `bookings cancel`, `contracts void`, `team remove-member`) refuse to run without `--yes`:
  - Interactive TTY: prompts `y/N`.
  - Non-interactive (CI, agent shell): exits **4** immediately with `error.code: "confirmation_required"` — no prompt, no partial action.
- **Never pass `--yes` on a destructive command without the user's explicit approval in the current conversation.** Getting a 4 back is expected and correct when you haven't asked — surface the command and its effect to the user, wait for a yes, then re-run with `--yes`.
- Some writes are gated server-side regardless of `--yes`: CMS-approval-staged tools return a `pending` status and/or an approval URL instead of applying immediately. If a response contains a `pending` field or an approval URL, **surface that URL to the user** — the change is not live until they approve it in the portal.

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | success | — |
| 1 | remote/tool error (RPC error, tool returned `isError`, non-2xx HTTP) | Read `error.message`; likely a bad id/state, not a usage mistake |
| 2 | usage/validation error (bad flag, missing required arg, unknown command, manifest missing) | Re-run `simpler manifest <domain> <action> --json` to check the real arg schema before retrying |
| 3 | auth/config missing or rejected | Run `simpler doctor --json`; if key is genuinely missing/expired, ask the user for one — don't guess |
| 4 | destructive confirmation refused/absent | Ask the user for explicit approval, then re-run with `--yes` |
| 5 | network unreachable/timeout | Check the configured origin/network; retry is reasonable once |

## Raw escape hatch

Any tool can be called by its literal MCP name when there's no comfortable flag form (e.g. a rarely-used tool, or you already have a JSON payload from elsewhere):

```bash
simpler call posts_list --args '{"websiteId": 12, "limit": 5}' --json
```

`simpler call` goes through the exact same coercion, dry-run, and destructive-gating path as a generated `<domain> <action>` command — it is not a bypass.

## Quotable onboarding prompt

Paste this into any agent (this one or another) to bring it up to speed on the CLI in one shot:

```
This repo/environment has the `simpler` CLI installed for the SimplerDevelopment
portal MCP surface (450+ tools). Rules:
1. Discover tier by tier — `simpler manifest --json` (domains only), then
   `simpler manifest <domain> --json`, then `simpler manifest <domain> <action>
   --json`. Never dump the full manifest.
2. Always pass `--json`; parse `{success, data|error}`. Use `--fields a,b,c`
   to narrow output.
3. Auth via env `SIMPLER_API_KEY` + `SIMPLER_API_URL` (or `SD_MCP_API_KEY`/
   `SD_MCP_URL`). Run `simpler auth status --json` or `simpler doctor --json`
   to diagnose. Never print the key.
4. Use `--dry-run` before any write you're unsure of. Destructive commands
   (delete/remove/void/cancel/revoke) need `--yes` — NEVER pass `--yes`
   without the user's explicit approval in this conversation; without it,
   expect exit 4.
5. Watch for `pending`/approval-URL fields in responses — surface them to
   the user, the change isn't live yet.
6. Exit codes: 0 ok, 1 remote error, 2 usage error (re-check the manifest),
   3 auth (run doctor), 4 confirmation needed, 5 network.
7. Prefer this CLI over connecting the MCP server directly in a terminal/
   repo context — it costs far fewer tokens.
See `.claude/skills/simpler-cli/commands.md` and `examples.md` for details.
```
