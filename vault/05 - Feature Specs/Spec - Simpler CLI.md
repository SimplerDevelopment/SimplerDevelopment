---
status: validating
created: 2026-07-02
domain: "[[Agentic OS]]"
---

# Spec — Simpler CLI (`simpler`)

Token-lean, JSON-first CLI exposing the portal's full MCP capability surface (451 tools) to humans, CI, and coding agents. Wraps `POST /api/mcp` (JSON-RPC over streamable HTTP, stateless) — it does **not** duplicate business logic and needs **zero new API endpoints**.

## Architecture (decided, grilled 2026-07-02)

- **Hybrid MCP-client.** All capabilities go through `/api/mcp` (`tools/call`). REST is used only where MCP cannot self-bootstrap: `POST /api/portal/auth/mobile-sign-in` (login → 90-day `sd_mcp_` key) and `GET /api/health` (doctor).
- **Manifest-driven command surface.** A build-time generator introspects `buildMcpServer()` (same in-process pattern as `tests/unit/mcp-tool-registry-baseline.test.ts`) and emits `packages/cli/manifest.json`. The CLI has ONE generic dispatch path; per-tool commands are data, not code. Parity with MCP is by construction; a drift test fails CI when the registry changes without regenerating.
- **Zero runtime dependencies.** Node ≥22 (native fetch, `process.loadEnvFile`). Hand-rolled `--flag value|--flag=value` parsing (matches `scripts/smoke-sd-skills.ts` prior art). No commander/chalk/etc.
- **Not exposed:** `deploy` (hosting is Vercel/Railway-side; nearest reads are `hosting get|list`). OAuth 2.1 PKCE login deferred (portal keys + mobile-sign-in cover v1); revisit if the CLI is distributed outside the org.

## Command grammar

```
simpler <domain> <action> [--arg value ...] [global flags]
```

- Mapping rule: tool `a_b_c_d` → domain = first `_` segment, action = rest with `_`→`-`. `posts_list` → `simpler posts list`; `crm_deals_move_stage` → `simpler crm deals-move-stage`. Deterministic and reversible.
- Alias map (oddballs only): `whoami` → `simpler whoami`, `list_workflows` → `simpler workflows list`, `get_workflow` → `simpler workflows get`.
- Built-ins (hand-written): `auth login|status|logout`, `manifest [domain] [action]`, `doctor`, `call <tool_name>`, `mcp parity`, `version`, `help`.
- Every schema arg becomes `--kebab-case`. Scalars coerced per manifest type; object/array args take a JSON string. Full payload alternatives: `--args '<json>'` or `--file payload.json` (merged under flags, flags win).

### Global flags

`--json` (machine output; default when stdout is not a TTY) · `--yes` (skip destructive confirm) · `--dry-run` (validate + print the exact tools/call that WOULD be sent; exit 0; nothing sent) · `--verbose` (request/response logging → stderr) · `--fields a,b,c` (client-side projection of result objects) · `--api-url` / `--api-key` (override config) · `--timeout <ms>`.

## Config resolution (highest wins)

1. Flags → 2. env `SIMPLER_API_URL` / `SIMPLER_API_KEY` (fallback: `SD_MCP_URL` / `SD_MCP_API_KEY` — existing repo conventions) → 3. `./.simpler.json` → 4. `~/.simpler/config.json` (0600, written by `auth login`).
- `.env` in cwd loaded via `process.loadEnvFile` if present (never overrides real env).
- URL is the portal **origin**; CLI appends `/api/mcp` etc. (strip a trailing `/api/mcp` if the user pastes it).
- Never print the key; redact in `--verbose`.

## Output contract

- `--json`: exactly one JSON doc on stdout — `{"success":true,"data":<payload>}` or `{"success":false,"error":{"message":"…","code":"…"}}` (matches the repo envelope). Logs go to stderr only.
- Human mode: pretty-printed payload (compact key rendering; no table framework).
- MCP tool results: parse `content[0].text` as JSON when possible and emit only that payload (strip the JSON-RPC/MCP envelope). `isError: true` or JSON-RPC error → `success:false`, exit 1.

## Exit codes

0 ok · 1 remote/tool error · 2 usage/validation error · 3 auth/config missing or rejected · 4 destructive confirmation refused/absent · 5 network unreachable/timeout.

## Safety model

- Manifest flags `destructive: true` on verb pattern `_(delete|remove|void|cancel|revoke)($|_)` plus explicit list (e.g. `bookings_cancel`, `contracts_void`, `team_remove_member`). ~57 tools.
- Destructive + no `--yes`: TTY → interactive `y/N`; non-TTY → exit 4 with a machine-readable error telling the agent to re-run with `--yes` after user approval.
- Server-side gates remain: CMS writes on keys with `requireCmsApproval` stage into `mcp_pending_changes` (CLI surfaces the `pending` echo untouched); many tools mint approval URLs instead of publishing.
- `--dry-run` never sends anything.

## Manifest (`packages/cli/manifest.json`, committed, generated)

Generator: `scripts/generate-cli-manifest.ts` (bun). Builds the MCP server in-process with `'*'` scopes and a dummy `DATABASE_URL` (drizzle lazy-connects; if import-time DB access breaks this, fall back to `bun:test` `mock.module` like the baseline test mocks `@/lib/db` — escalate if neither works). Zod v4 `z.toJSONSchema()` per tool, compacted to:

```json
{ "manifestVersion": 1, "toolCount": 451,
  "domains": [{ "name": "posts", "tools": 10 }],
  "tools": [{ "name": "posts_list", "cmd": "posts list", "domain": "posts",
    "desc": "…", "destructive": false, "scope": "sites:read",
    "args": [{ "name": "status", "type": "string", "required": false, "enum": ["…"], "desc": "…" }] }] }
```

- `type` ∈ `string|number|boolean|json` (nested objects/arrays → `json`).
- `scope`: attribute by rebuilding the server once per scope from `lib/oauth/scopes.ts` and recording which tools register (optional if slow — omit rather than guess).
- Drift test `tests/unit/cli/manifest-drift.test.ts`: builds the server (baseline-test pattern) and asserts registered tool names === manifest names. Regenerate with `bun run cli:manifest`.
- Tiered discovery for agents: `simpler manifest --json` → domains + counts only (~300 tokens); `simpler manifest posts --json` → that domain's commands; `simpler manifest posts get --json` → one command's full arg schema.

## Package layout

```
packages/cli/                    # bun workspace member (add to root package.json workspaces)
  package.json                   # @simplerdevelopment/cli, bin { "simpler": "./dist/index.js" }, tsup build
  tsconfig.json                  # node22, own project (root tsconfig already excludes packages/)
  manifest.json                  # generated
  src/index.ts                   # argv → dispatch
  src/config.ts  src/client.ts  src/manifest.ts  src/output.ts
  src/commands/{auth,doctor,manifest,call,parity}.ts
```

- Tests: `tests/unit/cli/*.test.ts` at repo root (auto-included in the `unit` vitest project → default gate). Import CLI internals via relative paths.
- Root scripts: `"cli": "bun packages/cli/src/index.ts"`, `"cli:build"`, `"cli:test"`, `"cli:manifest"`.
- ESLint: add `packages/cli/**` to `eslint.config.mjs` global ignores (Next ruleset is wrong for a Node CLI; package can carry its own later if wanted).

## doctor / parity

- `simpler doctor --json`: CLI version, config source + resolved origin, key present (redacted), `GET /api/health` reachability, `whoami` (auth + client + scopes), manifest tool count. Cheap calls only.
- `simpler mcp parity --json`: shipped manifest names vs live `tools/list` → `{ missing: [], extra: [], inParity: true }`.

## AI assets

- `.claude/skills/simpler-cli/SKILL.md` (+ `commands.md`, `examples.md`) — repo convention over the prompt's `/skills/` path.
- `packages/cli/AGENTS.md` — Codex/generic agent instructions (picked up by Codex convention).
- `docs/developers/cli.md` (install/auth/config/reference/CI examples/troubleshooting) + `docs/developers/ai-agent-usage.md` (agent playbook, CLI-vs-MCP decision rule, parity matrix rollup).

## Gates

`tsc` in packages/cli · `bunx vitest run --project unit tests/unit/cli` · manifest drift test green · `bun run lint` · no data-access changes → tenancy gate N/A · live smoke: `simpler doctor` against local dev if a dev DB is available (else mark unverified).
