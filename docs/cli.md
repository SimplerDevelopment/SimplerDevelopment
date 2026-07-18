# `simpler` CLI

The `simpler` CLI is a token-lean, JSON-first command-line client for the entire SimplerDevelopment portal — posts, media, CRM, projects, email, commerce, Company Brain, and more. Its commands are generated from the portal's MCP tool manifest, so it has **451-tool parity with the MCP server by construction**: every write goes through the same tool handlers, scope checks, and approval staging an AI agent would hit.

## Installation

```bash
npm install -g @simplerdevelopment/cli
simpler --help
```

Requires Node ≥ 22. The package has zero runtime dependencies.

## Authentication

**Browser sign-in (default)** — just run:

```bash
simpler auth login
```

Your browser opens the portal's consent page: sign in (or reuse your existing portal session), pick which client workspace the CLI should operate on if you belong to several, and approve. The CLI stores a rotating OAuth token pair in `~/.simpler/config.json` (mode `0600`) and refreshes it automatically — sessions last up to 60 days without re-login.

Other credential paths, highest precedence first:

1. **Flags** — `--api-url <url> --api-key <key>` on any command.
2. **Environment variables** — `SIMPLER_API_URL` and `SIMPLER_API_KEY`. Best for CI.
3. **Password flow** — for headless machines where a browser can't open:

   ```bash
   simpler auth login --email you@example.com                      # hidden prompt
   simpler auth login --email you@example.com --password-stdin < pw.txt
   ```

You can also mint a key in the portal UI under **Settings → API Keys** and paste it into `SIMPLER_API_KEY`.

Verify your setup at any time:

```bash
simpler doctor        # config source, connectivity, auth, manifest health
simpler auth status   # which key is active (redacted)
```

## Finding commands

Commands follow `simpler <domain> <action> [--arg value ...]`:

```bash
simpler --help              # top-level menu: built-ins + global flags
simpler manifest            # list every domain and its command count
simpler help posts          # all commands in a domain
simpler help posts list     # one command's arguments + an example
```

Tool arguments become kebab-case flags: `posts_list`'s `websiteId` is `--website-id`.

```bash
simpler posts list --limit 10
simpler crm contacts-search --query "acme"
simpler kanban list-board --project-id 150
```

## Output contract

On a terminal, help renders as a readable menu and results are pretty-printed. When piped, or with `--json`, stdout carries **exactly one** JSON document — nothing else shares stdout:

```json
{"success": true, "data": <payload>}
{"success": false, "error": {"message": "…", "code": "…"}}
```

Use `--fields a,b,c` to project only the fields you need:

```bash
simpler posts list --json --fields id,title,slug | jq '.data'
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Remote/tool error |
| 2 | Usage/validation error (bad flag, missing arg, unknown command) |
| 3 | Auth/config missing or rejected |
| 4 | Destructive confirmation refused |
| 5 | Network unreachable/timeout |

## Destructive commands

Commands that delete or irreversibly change data prompt for confirmation on a terminal and **refuse to run non-interactively** unless you pass `--yes`. Add `--dry-run` to see what would be sent without executing.

```bash
simpler posts delete --id 42            # prompts [y/N]
simpler posts delete --id 42 --yes      # CI-safe explicit consent
```

## Using it in CI

```yaml
- run: npx @simplerdevelopment/cli doctor --json
  env:
    SIMPLER_API_URL: ${{ vars.SIMPLER_API_URL }}
    SIMPLER_API_KEY: ${{ secrets.SIMPLER_API_KEY }}

- run: npx @simplerdevelopment/cli posts list --json --fields id,title,updatedAt > posts.json
```

## Relationship to the MCP server

The CLI wraps the same `POST /api/mcp` endpoint AI agents connect to — it introduces zero new API surface. If you're wiring up Claude or another MCP client instead, see [Connect an AI Agent](./mcp.md).
