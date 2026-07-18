# @simplerdevelopment/cli

`simpler` is a token-lean, JSON-first command-line client for the [SimplerDevelopment](https://github.com/SimplerDevelopment/SimplerDevelopment) portal's MCP tool surface — 450+ tools covering posts, CRM, kanban, the Company Brain, store, bookings, email, sites, and more. It's a manifest-driven generic dispatcher: every MCP tool `a_b_c_d` is reachable as `simpler a b-c-d` with no hand-written per-command code, so the CLI stays in lockstep with the server's tool list. It's built for both humans (a real terminal UX with `--help`, tab-shaped errors, dry-run) and coding agents (every command emits one `{success, data|error}` JSON envelope on stdout).

## Install

```bash
npm install -g @simplerdevelopment/cli
# or
bun add -g @simplerdevelopment/cli
```

Requires Node.js >= 22.

## Quick start

Point the CLI at your portal and sign in once — the key is cached locally in `~/.simpler/config.json` (mode `0600`):

```bash
export SIMPLER_API_URL=https://your-portal-domain.example.com
simpler auth login --email you@example.com
```

Then call a tool. Every generated command mirrors an MCP tool name (`posts_list` → `simpler posts list`):

```bash
simpler posts list --json
# {"success":true,"data":{"data":[...],"pagination":{...}}}
```

Discover what's available without dumping the whole manifest:

```bash
simpler manifest --json               # domains + tool counts
simpler manifest posts --json         # one domain's commands
simpler manifest posts list --json    # one command's full arg schema
```

Check everything is wired up correctly:

```bash
simpler doctor --json
```

## Stability

This package is **pre-1.0**. The command grammar (`<domain> <action>`), envelope shape (`{success, data|error}`), and exit codes are expected to stay stable, but flag names and manifest structure may still shift between minor versions without a deprecation cycle. Pin an **exact** version (no `^`/`~`) in anything you automate against, and check `CHANGELOG.md` before bumping. `1.0.0` will signal a frozen command surface and semver-honored breaking-change policy going forward.

## Full command reference

The complete grammar, discovery workflow, auth/config precedence, safety rules (`--dry-run`, destructive-command gating), and exit codes are documented for coding agents in [AGENTS.md](./AGENTS.md) — it applies equally to humans reading it directly.

## License

Apache-2.0 — see the [repository LICENSE](../../LICENSE).
