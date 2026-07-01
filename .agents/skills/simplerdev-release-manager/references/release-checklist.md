# Release Checklist

## Branch Targets

- Feature branches: validate relevant gates and push normally.
- `staging` / `main`: pre-push hook runs local CI and Fallow gate. Expect extra time.
- `dev` / `dev/*`: hooks may self-skip; do not treat that as release validation.

## Fallow

- Deploy-branch pre-push calls `scripts/fallow-gate.sh`.
- It blocks net-new issues only; baseline debt is grandfathered.
- Manual check: `scripts/fallow-gate.sh HEAD` or `bunx fallow audit --base <upstream-branch> --format json --quiet`.
- Focus on no new circular deps, giant functions, or duplicate blocks.

## Docs Sync

Update docs when changing:

- public setup or deploy workflow: `README.md`, `docs/deploy/**`
- MCP surface: `docs/mcp.md`, `docs/api/mcp/**`, skill docs if client-facing behavior changes
- block/editor behavior: block/editor guides and nested `CLAUDE.md` when invariants shift
- testing/release rules: `tests/CI-GATES.md`, `AGENTS.md`, `CLAUDE.md`

Do not add docs churn for purely internal mechanical fixes.

## Dependency Upgrades

- Use Bun for root package changes: `bun add`, `bun remove`, or explicit package-manager commands consistent with the repo.
- Do not hand-edit `bun.lock`.
- Check `overrides` comments before changing pinned packages, especially `jsdom`.
- Run `bun install` if needed, then `bun run typecheck` and targeted tests.
- For security bumps, document vulnerable package, fixed version, and validation.

## Release Notes

Include:

- what changed
- why it matters
- user/developer impact
- validation run
- known risks or follow-ups

## Rollback Notes

For migrations, billing, auth, MCP scopes, or public-route changes, mention how to roll forward or disable the feature if release validation fails.
