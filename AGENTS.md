# AGENTS.md — Fallow code-quality integration

The full agent operating guide is **`CLAUDE.md`** (root + nested per-directory files). This file owns one thing only: how coding agents use **Fallow** — Rust-native codebase intelligence (dead code, duplication, circular deps, complexity hotspots, architecture boundaries). Scope config is `.fallowrc.json` (limited to product code; `scripts/`, `drizzle/`, `vault/`, and generated dirs are excluded).

Run via `bunx fallow` (this repo is Bun-only; `npx` mis-resolves the platform binary).

## Where the gate actually fires — pre-push to deploy branches only

There is **no GitHub Actions check** (deliberately — avoids CI cost) and **no per-commit gate**. The single enforced gate is a **git pre-push hook** that runs **only when you push to `staging` or `main`**:

- Hook: `.githooks/pre-push` (active via `core.hooksPath=.githooks`) → calls `scripts/fallow-gate.sh`.
- It audits the commits being pushed **against what's already on the remote** (`--base <remote-sha>`) and blocks the push on **NET-NEW** issues only. Pre-existing debt is grandfathered by `fallow-baselines/`.
- Cost: ~100s on top of the existing `ci-local.sh` (tsc + tests) that the same hook runs. Deploy pushes are infrequent, so this is acceptable.
- One-off bypass (whole push): `git push --no-verify`.
- Fails **open** on any tooling problem (missing binary / jq / runtime error) so it never wedges a push silently — skips print to stderr.

`scripts/fallow-gate.sh [BASE]` is the **single source of truth** for the audit (runner detection, baselines, version floor, verdict). Exit `0` = pass/fail-open, `1` = blocked. Run it manually any time: `scripts/fallow-gate.sh HEAD`.

## Self-check before you push (advisory)

Pushes to non-deploy branches are **not** gated, so self-check the changed code before you open a PR toward `staging`/`main`:

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

The grandfather snapshots live in `fallow-baselines/{dead-code,health,dupes}.json`. Regenerate them only on purpose (e.g. after a sanctioned cleanup) with `fallow <analysis> --save-baseline <path>`.
