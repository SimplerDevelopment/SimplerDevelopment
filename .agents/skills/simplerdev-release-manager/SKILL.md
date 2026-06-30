---
name: simplerdev-release-manager
description: Prepare SimplerDevelopment changes for commit, push, PR, staging, or main release. Use for release readiness, pre-push checks, Fallow gate guidance, changelog/release notes, dependency upgrades, docs sync, "ship this", "prepare release", "before I push", "make this PR-ready", "dependency update", "release checklist", or when changes are headed to `staging` or `main`.
---

# SimplerDev Release Manager

Use this for the final mile: make a change understandable, validated, documented, and safe to push. It does not replace code review; run `simplerdev-code-review` first for risky diffs.

## Workflow

1. Inspect `git status -sb`, branch, remote, and diff scope. Separate unrelated work before staging or committing.
2. Confirm target: local commit, feature branch push, PR, `staging`, or `main`.
3. Run or recommend gates using `simplerdev-test-gate-picker`.
4. For deploy branches (`staging` or `main`), account for the pre-push hook: `scripts/ci-local.sh` plus `scripts/fallow-gate.sh` for net-new Fallow issues. The Fallow hook is deploy-branch-only and fails open on tooling problems.
5. Check docs sync: README, `docs/`, nested `CLAUDE.md`, and vault/domain maps only when the change affects public behavior, architecture, workflows, or contributor guidance.
6. For dependency upgrades, read `references/release-checklist.md` and treat package manager/lockfile changes as release-risk changes.
7. Produce a short release note or PR summary with impact, validation, and known risks.

## Commit And Push Rules

- Use conventional commits with repo scopes: `feat`, `fix`, `docs`, `chore`, `refactor`, `ui`, etc.
- Never stage unrelated user changes.
- Never force-push, amend, or rewrite history unless explicitly requested.
- Do not bypass hooks unless the user explicitly accepts the risk and reason.

## Reference

Read `references/release-checklist.md` for branch-specific gates, Fallow guidance, docs sync, dependency upgrade handling, and rollback notes.
