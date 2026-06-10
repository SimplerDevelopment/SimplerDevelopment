---
type: playbook
domain: validation
status: active
date: 2026-06-09
sources:
  - tests/CI-GATES.md
  - scripts/ci-local.sh
  - .githooks/pre-commit
  - .githooks/pre-push
  - tests/CLAUDE.md
---

# Gate Picking

**Question to answer in 30 seconds:** given my change, what do I run and when?

---

## Decision table

| Change kind | pre-commit (auto) | pre-push (auto) | Manual gate to add |
|---|---|---|---|
| Docs / comments only | lint (staged) + file-budget + doc-drift | ci-local default | nothing extra |
| UI-only (no data access) | lint (staged) + file-budget + doc-drift | ci-local default | `bun test:critical` before PR |
| New API route | lint (staged) + file-budget + doc-drift | ci-local + **tenancy** (auto-added) | `bun test:critical` |
| Data-access change (`lib/db/`, `app/api/`, `lib/active-client.ts`) | lint (staged) + file-budget + doc-drift | ci-local + **tenancy** (auto-added) | `bun test:tenancy` (verify locally) |
| Schema migration (`lib/db/schema/`) | lint (staged) + file-budget + doc-drift | ci-local + tenancy (auto-added) | regenerate migration first (`bun run db:generate`), then tenancy |
| New block type | lint (staged) + file-budget + doc-drift | ci-local default | `bun test:critical` |
| MCP tool change | lint (staged) + file-budget + doc-drift | ci-local default | unit tests for registry baseline + `bun test:critical` |
| Dependency add/remove | lint (staged) + file-budget + doc-drift | ci-local (includes typecheck + unit) | `bun run typecheck` locally before push |

---

## What each gate runs

### pre-commit (`.githooks/pre-commit`) — always automatic, fast

1. `bunx eslint` — staged `.ts` / `.tsx` files only (errors only; warnings are backlog)
2. `bun scripts/check-file-budget.ts` — file-size / god-file budget
3. `bun scripts/check-doc-drift.ts` — verifies repo paths cited in vault docs exist

Bypass once: `git commit --no-verify`

### pre-push (`.githooks/pre-push`) — always automatic, slow path

Calls `scripts/ci-local.sh`, which runs:

1. `bunx depcruise` — architecture boundary check
2. `bun scripts/check-file-budget.ts`
3. `bun scripts/check-doc-drift.ts`
4. `tsc --noEmit` on the **committed HEAD** in a tmp worktree (not the working tree)
5. `bun run test:unit` (`scripts/test.sh --layer=unit --no-coverage`)

If any of `lib/db/`, `app/api/`, or `lib/active-client.ts` appear in the push diff, the hook automatically appends `--tenancy`, adding:

6. `bun run test:tenancy` (`scripts/test.sh --layer=integration --tag=tenancy --no-coverage`)

No tenancy gate if `DATABASE_URL_TEST` / `DATABASE_URL` are unset — soft-skip with a loud warning.

Bypass once: `git push --no-verify`

### Manual gates (run by hand, not automatic)

| Command | When |
|---|---|
| `bun test:critical` | Before opening a PR; after any feature work |
| `bun test:tenancy` | After any data-access change (also auto on push) |
| `bun run typecheck` | After large non-trivial edit batches |
| `bun run lint` | Whole-repo lint; informational only (backlog exists) |
| `scripts/ci-local.sh --full` | Full gate: boundaries + typecheck + unit + tenancy + critical e2e |
| `scripts/promote-to-prod.sh` | Final gate before staging → production promotion |

### ci-local.sh modes

```bash
scripts/ci-local.sh            # default: boundaries, budgets, docs, typecheck, unit
scripts/ci-local.sh --quick    # cheap only (no tsc, no tests) — seconds
scripts/ci-local.sh --tenancy  # default + tenancy regression
scripts/ci-local.sh --full     # default + tenancy + critical e2e (needs DB + Playwright)
```

---

## Coverage thresholds

Coverage gates are **not currently blocking** (unit-only coverage is ~4%; vitest 4.0.18 emission bug).
Floors are defined in `vitest.config.ts` as aspirational targets — see [[Coverage Map]].
In CI (`CI=1`), `scripts/test.sh` enforces: lines 75%, functions 70%, branches 60% against `coverage/.v8-merged`.

---

## Install hooks (once per clone)

```bash
git config core.hooksPath .githooks
```
