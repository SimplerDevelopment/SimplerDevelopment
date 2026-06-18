---
type: runbook
domain: operations
status: active
date: 2026-06-09
sources:
  - scripts/promote-to-prod.sh
  - scripts/ci-local.sh
  - .githooks/pre-push
  - vercel.json
  - next.config.ts
---

# Deployment

How code travels from a feature branch through staging to production.

## Branch and deploy flow

```
feature branch  →  PR  →  staging branch  →  staging.simplerdevelopment.com
                                           ↓ (after gates pass)
                                         main / production
```

- The `staging` branch auto-deploys to Vercel (project connected to the `staging` branch).
- Production is currently a **manual promotion** — no production branch push is wired yet. The `scripts/promote-to-prod.sh` script is the gate; the actual push command is a TODO placeholder inside it.

## Pre-push local CI gate

The `.githooks/pre-push` hook fires automatically on every `git push`. It runs `scripts/ci-local.sh` and, if `lib/db/`, `app/api/`, or `lib/active-client.ts` changed, adds `--tenancy`.

### What ci-local.sh runs (default gate)

```bash
scripts/ci-local.sh
```

1. **Boundaries** — `bunx depcruise app lib components --config .dependency-cruiser.cjs`
2. **File-size budget** — `bun scripts/check-file-budget.ts`
3. **Doc drift** — `bun scripts/check-doc-drift.ts`
4. **Typecheck (committed HEAD)** — isolates a git worktree of HEAD so untracked WIP cannot influence the result, then runs `tsc --noEmit` inside it
5. **Unit tests** — `bun run test:unit`
6. **Dead code (informational)** — `bunx knip --no-exit-code`

### Quick mode (skip tsc + tests)

```bash
scripts/ci-local.sh --quick
```

### One-off bypass (use sparingly)

```bash
git push --no-verify
```

## Vercel build configuration (`vercel.json`)

| Setting | Value |
|---|---|
| Framework | `nextjs` |
| Install command | `bun install --frozen-lockfile` |
| Build command | `next build` |
| Region | `iad1` (us-east-1) |

TypeScript errors are intentionally suppressed inside `next build` (`typescript.ignoreBuildErrors: true` in `next.config.ts`). Type safety is enforced by the pre-push `tsc --noEmit` gate instead — the in-build pass OOMs on the ~357k-line codebase.

Static generation workers are capped at 4 CPUs (`experimental.cpus: 4`) to avoid exhausting Postgres connections during build.

## Staging to production promotion

Run after deploying to staging and verifying manually:

```bash
scripts/promote-to-prod.sh
```

This script runs two gates in order:

1. **Gate 1** — `bun run test:critical` (golden-path E2E suite tagged `@critical`)
2. **Gate 2** — `bun run test:tenancy` (multi-tenant leak regression)

Both must pass with exit 0. If either fails, fix and re-deploy to staging before re-running.

After the script exits 0, the **actual production push is manual** until a production target is configured. The suggested future command is:

```bash
git push origin staging:production
```

### Verify promotion gate passed

```bash
echo $?   # must be 0 immediately after scripts/promote-to-prod.sh
```

## Rollback options

| Scenario | Action |
|---|---|
| Bad deploy on Vercel | Vercel dashboard > Deployments > previous deployment > Redeploy |
| Bad code in staging branch | `git revert <sha>` on staging, push |
| Production (once wired) | Revert commit or redeploy previous Vercel deployment from dashboard |

Vercel retains all previous deployments; a prior build can be promoted to production alias in one click from the Vercel dashboard.
