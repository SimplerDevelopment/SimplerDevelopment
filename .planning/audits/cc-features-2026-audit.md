# Claude Code Features Verification Audit — June 2026

**Purpose:** Confirm whether six claimed Claude Code features are real, document exact syntax from official sources, and assess fit for this 357k-LOC Next.js/TS monorepo.
**Sources:** [code.claude.com/docs](https://code.claude.com/docs), [docs.anthropic.com](https://docs.anthropic.com), official GitHub changelog.
**Methodology:** WebFetch of canonical docs pages + WebSearch cross-check + changelog verification. No implementation — read/verify only.

---

## Feature 1: `.claude/rules/` Path-Scoped Rules

**Verdict: REAL**

### Confirmed behavior

The `.claude/rules/` directory is documented at [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) under "Organize rules with `.claude/rules/`". It is a first-class feature for breaking large `CLAUDE.md` content into topic-scoped files.

**Key doc quotes:**

> "For larger projects, you can organize instructions into multiple files using the `.claude/rules/` directory. This keeps instructions modular and easier for teams to maintain. Rules can also be scoped to specific file paths, so they only load into context when Claude works with matching files, reducing noise and saving context space."

> "Rules without a `paths` field are loaded unconditionally and apply to all files. Path-scoped rules trigger when Claude reads files matching the pattern, not on every tool use."

### Exact frontmatter schema

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules
- All API endpoints must include input validation
```

Multi-pattern + brace expansion supported:

```markdown
---
paths:
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "tests/**/*.test.ts"
---
```

Supported glob patterns (from docs):

| Pattern | Matches |
|---|---|
| `**/*.ts` | All TypeScript files in any directory |
| `src/**/*` | All files under `src/` directory |
| `*.md` | Markdown files in the project root |
| `src/components/*.tsx` | React components in a specific directory |

**Rules without `paths` frontmatter** load at launch with the same priority as `.claude/CLAUDE.md` — no lazy-loading benefit.

### How it differs from nested `CLAUDE.md`

| Mechanism | Load trigger | File organization |
|---|---|---|
| Nested `CLAUDE.md` in subdirectory | Triggered when Claude reads any file in that subdirectory | One file per directory, matches the directory tree |
| `.claude/rules/*.md` with `paths:` | Triggered when Claude reads files matching the glob | Topic-based, lives in one flat (or nested) location |

The two mechanisms are **complementary, not redundant**. Rules with `paths:` allow cross-cutting concerns (e.g., "all `.ts` files anywhere") to be expressed independently of directory structure.

### Version requirements

None stated in official docs. Feature is in current stable docs without a min-version callout.

### Fit assessment for this repo

**Net-additive.** The existing nested `CLAUDE.md` tree (`app/portal/`, `lib/blocks/`, etc.) handles directory-scoped context well. Path-scoped rules are useful for cross-cutting TypeScript conventions (e.g., rules for all `**/*.test.ts`, all `drizzle/*.ts`, or all MCP handler files) that span multiple directories and don't belong neatly in any one nested `CLAUDE.md`. Low friction to adopt incrementally — the two systems coexist.

---

## Feature 2: `disable-model-invocation: true` Skill Frontmatter

**Verdict: REAL**

### Confirmed behavior

Documented in [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) in the frontmatter reference table.

**Exact doc quote:**

> "`disable-model-invocation` | No | Set to `true` to prevent Claude from automatically loading this skill. Use for workflows you want to trigger manually with `/name`. Also prevents the skill from being [preloaded into subagents]. Default: `false`."

Exact YAML example from docs:

```yaml
---
name: deploy
description: Deploy the application to production
context: fork
disable-model-invocation: true
---

Deploy the application:
1. Run the test suite
2. Build the application
3. Push to the deployment target
```

Context of use from docs:

> "**Task content** gives Claude step-by-step instructions for a specific action, like deployments, commits, or code generation. These are often actions you want to invoke directly with `/skill-name` rather than letting Claude decide when to run them. Add `disable-model-invocation: true` to prevent Claude from triggering it automatically."

### Context-cost semantics confirmed

The docs confirm that a skill's body only enters context when invoked:

> "Unlike CLAUDE.md content, a skill's body loads only when it's used, so long reference material costs almost nothing until you need it."

When `disable-model-invocation: true` is set, the skill description is still exposed in the skill listing (truncated to 1,536 combined `description`+`when_to_use` characters), but the body never loads unless explicitly invoked. So the description does have a small upfront cost, but it is bounded and shared with the full skill listing.

### Caveat confirmed: auto-trigger defeat

**Yes, confirmed — disabling model invocation defeats auto-triggering.** The purpose of the field is exactly to prevent Claude from deciding to load the skill based on natural-language context. If a skill's value comes from being auto-triggered (e.g., "draft a page about X" → site-content skill runs automatically), setting `disable-model-invocation: true` removes that behavior. Manual-only (`/name`) invocation is the trade-off.

**Known bug:** GitHub issue [#26251](https://github.com/anthropics/claude-code/issues/26251) documents cases where `disable-model-invocation: true` + `user-invocable: true` sometimes blocked slash-command invocation too. Check current version before relying on the combination.

### Fit assessment for this repo

**High value for deployment/commit/destructive skills.** Skills in this repo like `sd-create-page`, `sd-create-deck`, `site-migration` that make API calls or write content are excellent candidates. The existing skills that use natural-language triggers (e.g., `site-content` auto-fires on "draft content about X") should NOT get this flag — it would defeat their design. Apply selectively to side-effect-heavy skills only.

---

## Feature 3: MCP Tool Search / Deferred Tool Loading

**Verdict: REAL**

### Confirmed behavior

Documented at [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp) under "Scale with MCP Tool Search".

**Exact doc quotes:**

> "Tool search keeps MCP context usage low by deferring tool definitions until Claude needs them. Only tool names and server instructions load at session start, so adding more MCP servers has minimal impact on your context window."

> "Tool search is enabled by default. MCP tools are deferred rather than loaded into context upfront, and Claude uses a search tool to discover relevant ones when a task needs them. Only the tools Claude actually uses enter context."

### Client-side or server-side?

**Entirely client-side (Claude Code).** The client defers tool schema loading. The server author can influence behavior via optional annotations but cannot enable/disable the feature. No server-side changes are required.

**Model requirement:** Requires a model that supports `tool_reference` blocks — Sonnet 4 and later, or Opus 4 and later. Haiku models do not support it.

### Configuration options

`ENABLE_TOOL_SEARCH` environment variable (or `env` field in `settings.json`):

| Value | Behavior |
|---|---|
| (unset) | All MCP tools deferred. Falls back to upfront on Vertex AI or non-first-party `ANTHROPIC_BASE_URL` |
| `true` | Force all deferred, even on Vertex AI / proxies (will fail if proxy doesn't support `tool_reference`) |
| `auto` | Threshold mode: load upfront if schemas fit within 10% of context window, defer otherwise |
| `auto:N` | Custom percentage threshold (0-100). E.g., `auto:5` = 5% |
| `false` | Disable — all tools loaded upfront |

Can also deny the tool specifically:
```json
{ "permissions": { "deny": ["ToolSearch"] } }
```

### What server authors can do (optional)

1. **`alwaysLoad: true`** in `.mcp.json` server config — bypasses deferral for an entire server. Available on all server types. **Requires v2.1.121+.**
   ```json
   {
     "mcpServers": {
       "core-tools": { "type": "http", "url": "...", "alwaysLoad": true }
     }
   }
   ```

2. **`"anthropic/alwaysLoad": true` in tool's `_meta` object** — always-loads a single tool within a server:
   ```json
   { "name": "my_tool", "_meta": { "anthropic/alwaysLoad": true } }
   ```

3. **Server instructions** — helps Claude decide when to search for the server's tools. Truncated at 2KB.

### Fit assessment for this repo

**Highly relevant — already active.** This repo already uses the `ToolSearch` / deferred tool loading system (as seen from the `system-reminder` in this conversation listing deferred tools). With ~300 in-repo MCP tools, this is load-bearing, not optional. Server authors on this project should: (a) keep tool descriptions under 2KB, (b) use clear server-level instructions so Claude searches the right server, and (c) mark 5–10 highest-frequency tools `alwaysLoad` per server if they should be immediately available on every turn. No opt-in needed — it's on by default.

---

## Feature 4: TypeScript LSP Plugin for Claude Code

**Verdict: REAL (official Anthropic-verified plugin)**

### Confirmed status

- **Publisher:** Anthropic (verified "Made by Anthropic" on [claude.com/plugins/typescript-lsp](https://claude.com/plugins/typescript-lsp))
- **Plugin name:** TypeScript LSP
- **Listed at:** [claude.com/plugins](https://claude.com/plugins) (official plugin marketplace)
- **Installation:** Via Claude Code plugin system (install button / `/plugin install` command). Based on the marketplace pattern for other official plugins, the install command is: `/plugin install typescript-lsp@claude-plugins-official` (same pattern as `mcp-server-dev@claude-plugins-official` per MCP docs).

### What it provides

From official plugin page and plugins reference:

- Go-to-definition, find references, hover info for `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`
- Real-time type error diagnostics — Claude sees errors and warnings immediately after edits
- Call hierarchy and symbol navigation
- The plugin exposes these as Claude Code tools (LSP is an MCP server bundled in the plugin)

**Key distinction from grep-based navigation:** Symbol-level search uses the TypeScript language server's semantic understanding rather than string matching — resolves generics, handles re-exports, follows type aliases. For a 357k-LOC monorepo this reduces hallucinated or stale cross-references.

### Scope: official vs. third-party

Both official and community LSP plugins exist. The TypeScript LSP at `claude.com/plugins/typescript-lsp` is **Anthropic-verified**. The GitHub repo [Piebald-AI/claude-code-lsps](https://github.com/Piebald-AI/claude-code-lsps) is a separate third-party marketplace of community-contributed LSP servers and should not be confused with the official one.

### Version requirements

Not explicitly stated in official docs. Plugins require a Claude Code version that supports the plugin system (current stable).

### Fit assessment for this repo

**High value, especially for cross-cutting refactors.** A 357k-LOC TS monorepo with a complex block registry, visual editor postMessage protocol, and ~300-tool MCP server benefits meaningfully from semantic symbol navigation. The existing nested `CLAUDE.md` tree reduces speculative file reads, but when Claude needs to find all callers of a shared utility or verify a type change propagates correctly, LSP beats grep. Low installation cost — one `/plugin install` command.

---

## Feature 5: Hook `if` Field (v2.1.85+) and `PreToolUse` `permissionDecision: "deny"`

**Verdict: REAL for both. Version confirmed for `if` field.**

### `if` field — confirmed

**Version from changelog:** Added in **v2.1.85**. Official changelog entry:

> Conditional hooks: the `if` field on hook handlers uses permission rule syntax (e.g., `Bash(git *)`) to filter when they run, reducing process spawning overhead.

Current docs ([code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)) describe it in the "Common fields" section:

> "`if` | no | Permission rule syntax to filter when this hook runs, such as `"Bash(git *)"` or `"Edit(*.ts)"`. The hook only spawns if the tool call matches the pattern, or if a Bash command is too complex to parse. Only evaluated on tool events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, and `PermissionDenied`. On other events, a hook with `if` set never runs."

**Exact syntax:** Single permission rule string. No `&&`, `||`, or list syntax supported per hook handler. Pattern matches tool name + arguments together.

```json
{ "if": "Bash(git push *)" }
{ "if": "Edit(*.ts)" }
{ "if": "Bash(rm *)" }
```

For Bash: the rule matches each subcommand after stripping leading `VAR=value` assignments. The hook runs if any subcommand matches, and **always runs when the command is too complex to parse**.

### `permissionDecision: "deny"` — confirmed

Documented in the PreToolUse decision control section. Exact output schema:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Destructive command blocked by hook"
  }
}
```

All four allowed `permissionDecision` values: `"allow"` | `"deny"` | `"ask"` | `"defer"`

- `"allow"` — approves the tool call, bypasses normal permission flow
- `"deny"` — blocks the tool call
- `"ask"` — escalates to a user permission dialog
- `"defer"` — defers to normal permission flow (same as not returning a decision)

Optional additional fields: `modifiedInput` (modify tool input before execution), `additionalContext` (inject context for Claude).

Complete working example from docs:

```bash
#!/bin/bash
# .claude/hooks/block-rm.sh
COMMAND=$(jq -r '.tool_input.command')

if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Destructive command blocked by hook"
    }
  }'
else
  exit 0  # no decision; normal permission flow applies
fi
```

### Fit assessment for this repo

**High value.** The `if` field is a performance optimization that matters for large repos: hooks currently fire on every matched tool event, so without `if`, a Bash hook fires on every shell command. With `if: "Bash(git push *)"` or `if: "Bash(bun run db:migrate *)"`, hooks only spawn for the specific commands that need guarding. For a monorepo with tenancy invariants and DB migration guardrails, `permissionDecision: "deny"` is the enforcement layer (vs. CLAUDE.md which is advisory only). Both are production-ready at current Claude Code versions.

---

## Feature 6: Stop Hook Blocking + Override Threshold

**Verdict: REAL — both the blocking mechanism and the 8-block override cap are confirmed.**

### Blocking mechanism — confirmed

From hooks reference ([code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)):

The `Stop` event fires when Claude finishes responding and can block.

| Event | Can block? | Exit code 2 behavior |
|---|---|---|
| `Stop` | Yes | Prevents Claude from stopping, continues the conversation |

**Two ways to block:**

1. Exit code 2: `exit 2` in a shell hook
2. JSON output: `{ "decision": "block", "reason": "Tests still running" }`

If no blocking condition, exit 0 or return no output to allow Claude to stop normally.

### Override threshold — CONFIRMED from changelog v2.1.143

**Exact changelog quote (v2.1.143):**

> "Fixed stop hooks that block repeatedly looping forever — the turn now ends with a warning after **8 consecutive blocks** (override via `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`)"

This confirms:
- The hard cap is **8 consecutive blocks**
- It is **configurable** via `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` env var
- Before v2.1.143 there was no cap — Stop hook could loop forever (this was a bug, not a feature)
- The behavior the claim described is accurate, with the clarification that it was introduced as a *fix* in v2.1.143

### Known issue

GitHub issue [#55754](https://github.com/anthropics/claude-code/issues/55754) (closed as duplicate) confirms a pre-v2.1.143 bug where a Stop hook returning `{"ok": false}` could consume an entire session quota. The v2.1.143 fix closes this gap.

**Important: the "8 blocks" override was NOT documented in the hooks reference page itself** at time of audit — it was found only in the changelog. The hooks reference says "exit 2 prevents stopping" but does not mention the cap. The cap is real and operational but not prominently documented.

### Fit assessment for this repo

**Useful for QA gates, but use with explicit `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` tuning.** The Stop hook + 8-block cap is appropriate for enforcing "run `bun test:critical` before declaring done" workflows in dev-block/hands-off sessions. Set `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` explicitly in your hooks `.env` context (e.g., `=3`) to fail fast rather than wait for 8 rounds. Do not rely on a Stop hook that blocks indefinitely — the pre-v2.1.143 bug is patched, but building on the default cap is safer than assuming infinite retries.

---

## Source URLs

- [How Claude remembers your project (Memory + .claude/rules/)](https://code.claude.com/docs/en/memory)
- [Extend Claude with skills (disable-model-invocation frontmatter)](https://code.claude.com/docs/en/skills)
- [Connect Claude Code to tools via MCP (Tool Search)](https://code.claude.com/docs/en/mcp)
- [Hooks reference (if field, permissionDecision, Stop hook)](https://code.claude.com/docs/en/hooks)
- [TypeScript LSP plugin (official Anthropic)](https://claude.com/plugins/typescript-lsp)
- [Claude Code Changelog](https://code.claude.com/docs/en/changelog)
- [GitHub issue #55754 — Stop hook infinite loop (pre-v2.1.143)](https://github.com/anthropics/claude-code/issues/55754)
- [GitHub issue #26251 — disable-model-invocation slash command bug](https://github.com/anthropics/claude-code/issues/26251)

---

## Executive Summary

All six features are confirmed real from official Anthropic documentation. Recommended prioritization for this repo: **(1) MCP Tool Search** is already active and critical — the team should mark 5–10 high-frequency tools `alwaysLoad` per server and keep descriptions under 2KB (no opt-in needed, it runs by default). **(2) Hook `if` field + `permissionDecision: "deny"`** are high-ROI for this repo's tenancy and migration guardrails — use `if` to reduce hook spawn overhead and `deny` to enforce hard invariants (never `bun run db:migrate` targeting prod URLs) rather than relying on advisory CLAUDE.md text. **(3) Stop hook with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`** is worth adding to hands-off/dev-block sessions as a QA gate, but tune the cap to 3 rather than relying on the default 8. **(4) TypeScript LSP plugin** is a single `/plugin install` for meaningful semantic navigation gains in a 357k-LOC monorepo. **(5) `.claude/rules/` path-scoped rules** are net-additive alongside the existing nested `CLAUDE.md` tree — best used for cross-cutting TS conventions that span multiple directories. **(6) `disable-model-invocation: true`** should be applied selectively to deployment/commit/destructive skills only; skills that depend on auto-triggering must not get this flag.
