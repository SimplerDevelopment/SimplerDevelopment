# AGENTS.md — Fallow code-quality integration

The full agent operating guide is **`CLAUDE.md`** (root + nested per-directory files). This file owns one thing only: how coding agents use **Fallow** — Rust-native codebase intelligence (dead code, duplication, circular deps, complexity hotspots, architecture boundaries). Scope config is `.fallowrc.json` (limited to product code; `scripts/`, `drizzle/`, `vault/`, and generated dirs are excluded).

Run via `bunx fallow` (this repo is Bun-only; `npx` mis-resolves the platform binary).

## When to run — advisory / report-only (non-blocking today)

Before committing AI-generated changes, self-check **the changed code only**:

```
bunx fallow audit --base <upstream-branch> --format json --quiet
```

Act on NEW regressions your diff introduces; pre-existing debt is grandfathered. Ratchet targets:
- no **new circular dependencies**
- no **new giant functions** (unit-size)
- no **new duplicated** blocks

## Targeted checks

```
bunx fallow dead-code --format json --quiet   # unused files/exports, cycles, unused deps
bunx fallow dupes     --format json --quiet   # copy-paste + structural duplication
bunx fallow health    --format json --quiet   # complexity, hotspots, maintainability, score
bunx fallow list --boundaries --format json --quiet   # architecture boundaries
```

## Known baseline (June 2026) — grandfathered, do NOT bulk-refactor

Scoped product-code grade: **61 / C**. Concentrated existing debt — only avoid *adding* to it; never refactor these in an unrelated PR:
- `lib/brain/mcp-sdk-adapter.ts` → `registerBrainToolsOnSdk` (~5,374-line function)
- `components/portal/VisualEditorShell.tsx` (god file / top churn-hotspot)
- 27 circular deps, mostly `components/blocks/render/*` + `lib/db/schema/auth.ts`

## Not yet enabled (deferred to the ratchet phase)
- Blocking commit gate: `fallow hooks install --target agent`
- CI PR comments: `fallow ci` → `--format pr-comment-github`
