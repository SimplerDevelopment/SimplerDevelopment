# HANDOFF — Claude Code agent-harness hardening

_Last updated: 2026-06-04. Author: Opus 4.8 session. This is a continuation doc for a fresh-context agent._

## Update — session 2 (5 commits now on the branch)

Since the original write-up, the open decisions were answered and executed (commits 4 & 5):

- **TS LSP plugin** installed + `/reload-plugins` run — active.
- **MCP registry test refactored to DB-free unit-layer** (`tests/unit/mcp-tool-registry-baseline.test.ts`, mocks `@/lib/db`) — now runs in the DEFAULT `bun test` / pre-push gate, verified green 6/6 with no DB. The integration copy was removed; path refs updated in `server.ts`, `lib/mcp/CLAUDE.md`, `mcpToolDomains.test.ts`, `SKILLS_E2E_GUIDE.md`. **This is the durable fix for the silent-drift class.**
- **Surveys milestone retired** — `.planning/STATE.md` is now a RETIRED tombstone.
- **dev-block repointed** off STATE.md to GitHub issues (`label:claude`) as primary task source (`.claude/skills/dev-block/SKILL.md` in the parent repo); strict per-iteration QA gate wired into `scripts/dev-block-loop.sh` (`SIMPLERDEV_QA_GATE_TESTS=1 + SIMPLERDEV_QA_GATE_BLOCK=1`).
- **Tenancy `.claude/rules/tenancy.md`** added (scoped to `app/api/**`, `lib/db/**`, `lib/active-client.ts`).

**Only remaining open item: PR delivery** — user chose to keep the branch local (`chore/agent-harness-hardening`, 5 commits). Everything else is done. A local test Postgres may still be running from this session.

## Goal

Improve the day-to-day quality / efficiency / speed / validation of working in this repo with Claude Code. Started as a review + best-practices research task, became a concrete harness-hardening effort: kill agent-doc drift, adopt verified-real Claude Code features, and make validation actually enforce.

## Current Progress

All work is **committed locally** on branch **`chore/agent-harness-hardening`** (based on `content/solutions-groom-pass1`, which is 141 commits ahead of `main`). **Not pushed** — user chose to keep it local (see Next Steps for why a clean PR is non-trivial). Three commits:

1. **`db7a2d5f` — kill agent-doc drift + harden drift checker**
   - Fixed the agent-breaking stale `lib/db/schema.ts` monolith reference across 8 skill/doc files (schema is now per-domain modules under `lib/db/schema/`, barrel at `index.ts`; the `@/lib/db/schema` *import* was always valid and was preserved).
   - Corrected drifted god-file line counts in `app/portal/CLAUDE.md` + `lib/mcp/CLAUDE.md`; surfaced the unlisted `lib/brain/mcp-sdk-adapter.ts` (5,630 lines, biggest file in repo).
   - Reconciled + stale-bannered `.planning/STATE.md` (it claimed 100% AND 0% simultaneously; it's a paused *surveys* milestone the `dev-block` loop reads).
   - **Hardened `scripts/check-doc-drift.ts`**: added a relocated-path blocklist (scans skills too) + god-file line-count validation (tolerance max(75 lines, 10%)). Negative-tested — both new checks confirmed to fire.

2. **`f982a3240` — guardrails + nested nav docs + audits**
   - `.claude/settings.json`: native `Edit/Write(drizzle/**)` deny; Stop-hook timeout 120→300s.
   - `.claude/hooks/stop-qa-gate.sh`: opt-in unit-test layer via `SIMPLERDEV_QA_GATE_TESTS=1` (OFF by default — does not slow interactive sessions); documented the 8-block Stop cap.
   - New nested `CLAUDE.md` for `components/brain/` + `components/blocks/visual/` (homes the `NoteListPane.tsx` 2140 + `SectionsPanel.tsx` 1499 god files; line counts validated by the drift checker).
   - `.planning/audits/cc-features-2026-audit.md` (Claude Code features verified vs official docs) and `.planning/audits/mcp-tool-surface-audit.md`.

3. **`54c765422` — fix(mcp): reconcile tool-registry baseline (300→431)**
   - The `@critical` test `tests/integration/api/mcp-tool-registry-baseline.test.ts` was **silently failing**: 131 real-but-unlocked tools (brain documents/playbooks/org-units/glossary/decisions/goals/initiatives/topics/people, kanban templates+recurrences, project members+artifacts, media, nav, deck publishing). Rebuilt `EXPECTED_TOOLS` from the authoritative registered set (431) via a real DB run; test now green 6/6.
   - **Security-verified** every drift domain gates registration on `hasScope` (brain:read/write, projects:read, media:write, sites:write); scope-filter sub-tests pass.
   - `lib/mcp/CLAUDE.md`: documented that this test is integration-layer and NOT in the default gate, so it drifts silently — run `bun test:integration:local` after any tool add/remove/rename.

Also added two standing rules to **`~/.claude/CLAUDE.md`** (global): a TLDR response wrap-up, and an approximate per-commit token annotation.

## What Worked

- **Verify-before-build:** dispatched a Sonnet worker to confirm each newer Claude Code feature against official docs before adopting any. Caught that `disable-model-invocation` would *defeat* the `sd-create-*` skills' natural-language auto-trigger (so it was NOT applied) and that MCP Tool Search is client-side + already active.
- **Refusing to auto-fix off a static count:** initially declined to add 131 tools from a static grep; verified with a real DB run instead. (See the cautionary note below — the verification, not the static count, was the thing that mattered.)
- **Deterministic regeneration:** rebuilt `EXPECTED_TOOLS` by briefly instrumenting the test to dump the real registered set to `/tmp/registered-tools.txt`, then a throwaway script (`/tmp/gen-expected.ts`) grouped + emitted the array. Avoided hand-transcribing 431 names.
- **Native deny over hook script:** `permissions.deny` already worked for `bun.lock`, so `drizzle/**` was a one-line extension — no new hook.
- Parallel Sonnet workers for independent units (repo inventory, feature verification, nested CLAUDE.mds, MCP audit) kept the Opus thread lean.

## What Didn't Work / Cautions

- **Truncated vitest diffs misled me.** The first failing run showed only 41 extra tools (vitest truncates large diffs); I wrongly concluded the MCP audit (W3) had over-counted at "431". It had NOT — the real drift was 131 and 431 was exactly right. **Lesson: dump the authoritative set, don't read tool lists off a truncated assertion diff.**
- **A masked exit code fooled me once:** a background command ending in `echo` reported "exit 0" while vitest had actually failed. **Always grep the real `Tests N passed/failed` line, not the wrapper exit.**
- **`timeout` is not on macOS** (use background tasks or the Bash `timeout` param instead).
- **The guard hook blocks `node -e`** (by design) — use `python3` or a script file for JSON validation.
- **Cherry-picking the harness commits onto `main` is risky:** the god-file line counts (now validated by the drift checker) were measured against THIS branch's file states; on `main` those files may be different sizes and the check would fail. The harness work belongs on top of the content branch, not rebased to main.

## Next Steps (all require the user / a decision)

1. **`/reload-plugins`** — the official `typescript-lsp@claude-plugins-official` plugin was just installed; reload to activate. (Biggest navigation/efficiency win for this 357k-LOC TS repo; net-reduces context vs grep.)
2. **PR delivery:** currently local-only. A clean PR is awkward because the branch sits 141 commits past `main` on the content branch. Options: leave local (current choice), or PR with base=`content/solutions-groom-pass1` (shows only the 3 commits) once that branch is on origin.
3. **`.planning/STATE.md`:** decide resume-vs-retire the surveys milestone; it's stale-bannered for now. If retiring, repoint the `dev-block` loop's task source to open GitHub issues.
4. **Flip the gate levers for autonomous/nightly runs only:** `SIMPLERDEV_QA_GATE_TESTS=1` + `SIMPLERDEV_QA_GATE_BLOCK=1` (wire into the `dev-block` loop env, not global, so interactive sessions stay fast).
5. **Optional `.claude/rules/` tenancy rule** (verified-real feature): a cross-cutting "scope by clientId/siteId, never trust URL siteId, run `bun test:tenancy`" rule. Held off because the `paths:` globs need careful scoping to avoid loading on too many files (noise). Needs a decision on which data-access paths to match.
6. **Deeper MCP-test fix (recommended):** make the registry baseline runnable without a DB (it's effectively a unit test wearing integration clothes — only the integration global-setup forces the DB) so it can join the *default* gate and stop drifting silently. This is a real refactor, not done.

## Key facts for a fresh agent

- Branch: `chore/agent-harness-hardening`. Git root is the **parent** monorepo `/Users/dancoyle/simplerdevelopment`; this project is the `simplerdevelopment2026/` subdir. Origin = `github.com/DanielPCoyle/simplerdevelopment`.
- A local test Postgres is running (`postgresql://$USER@localhost:5432/simplerdev_test`, started via `scripts/start-local-db.sh`, idempotent). Integration tests need `DATABASE_URL`/`DATABASE_URL_TEST` pointing at it.
- Run the MCP baseline test: `DATABASE_URL=... DATABASE_URL_TEST=... bunx vitest run --project integration-api tests/integration/api/mcp-tool-registry-baseline.test.ts --no-coverage` (~210s).
- Gates: `bun scripts/check-doc-drift.ts` (now hardened), `bun scripts/check-file-budget.ts`, `scripts/ci-local.sh` (full, runs on pre-push). No remote CI exists.
