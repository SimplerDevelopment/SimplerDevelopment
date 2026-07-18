# Saved dynamic workflows

Reusable multi-agent orchestration scripts for the `Workflow` tool, invokable by name (`{ name: "<file>" }`). See the **Dynamic workflows** section in the repo-root `CLAUDE.md` for when to reach for one vs. a single `/delegate` worker — and remember they are **opt-in only** (the user must ask, or type `ultracode`). They are token-heavy; reserve for genuinely large/layered work.

| Workflow | Pattern | Use when | Args |
|---|---|---|---|
| `tenant-leak-review` | Adversarial verification | Before merging a data-access change — 3 skeptics per changed file hunt for a `clientId`/`siteId` scoping gap. Pairs with `bun test:tenancy`. | `{ base?, files? }` |
| `block-controls-audit` | Fan out & synthesize | Audit every block type for editor-controls coverage (one agent per block → merged report). Cf. `.planning/audits/blocks-controls-coverage.json`. | `{ types? }` |
| `flaky-test-hunt` | Loop until done | Chase an intermittently-failing test in its own worktree until a root cause is confirmed. | `{ test (required), runs?, maxRounds? }` |
| `distill-guardrails` | Fan out & synthesize → judge | Periodically turn captured dev feedback (learnings.md QA-log, git reverts/fixups, claude-mem) into proposed guardrails — a human-review report, nothing auto-applied. Harness-engineering: never give the same review feedback twice. Nightly trigger: `scripts/distill-guardrails.sh` (launchd/cron). | `{ sinceDays?, minOccurrences?, out? }` |

Each script is plain JS (not TS), begins with a literal `export const meta`, and uses the `agent()` / `parallel()` / `pipeline()` hooks. Agents inherit the session model — keep Opus on judge/synthesis steps, let Sonnet workers fan out.
