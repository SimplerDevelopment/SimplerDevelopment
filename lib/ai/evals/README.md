# Prompt evals (`lib/ai/evals`)

A generic harness for evaluating any runtime LLM prompt in the codebase and
pulling metrics you can optimize against. Generalizes the one-off Company Brain
runner (`lib/ai/brain-tools/eval/runner.ts`) into reusable parts.

## Model

```
suite = { run(input) → output }  +  cases[]  +  scorers[]
runner → for each case: get output (or mockOutput), apply scorers, aggregate
report → pass-rate · per-scorer mean quality · latency · token spend
```

A **scorer** returns a normalized 0..1 score + pass/fail. Mix cheap deterministic
checks with an LLM-judge and get one metrics surface. Built-ins (`scorers.ts`):

| Scorer | Use |
|---|---|
| `zodConformance(schema)` | output parses + conforms (biggest reliability win — most prompts use raw `JSON.parse`) |
| `requiredFields(paths)` | listed fields present + non-empty (dotted/indexed: `actions.0.tool`) |
| `predicate(name, fn)` | task-specific assertion (right enum, count in range, expected item present) |
| `latencyUnder(ms)` | latency budget (weight 0 — informational, doesn't drag the quality aggregate) |
| `llmJudge({dimensions, buildPrompt})` | LLM grades 1–5 per dimension; **skipped** (not failed) under `--mock` / no key |

## Run it

```bash
# offline smoke test — scores canned mockOutputs, no key, no network
bun run lib/ai/evals/runner.ts --mock

# one suite, live
bun run lib/ai/evals/runner.ts --suite=survey-summary --key=sk-ant-...

# all suites, write artifacts (report.md + report.json), live
bun run lib/ai/evals/runner.ts --key=sk-ant-... --out=evals-out
```

Exit code is non-zero if any case fails, so CI can gate. The framework itself is
covered offline by `tests/unit/ai-evals-framework.test.ts` (runs in the default
unit gate).

## Add a suite

1. Create `suites/<prompt>.eval.ts` exporting an `EvalSuite`:
   - `run(input, env)` calls the real prompt fn (return token counts if available).
   - `cases[]` with `input`, `expected` (for scorers), and `mockOutput` (for `--mock`).
   - `scorers[]` — start with `zodConformance` + `requiredFields`, add `predicate`/`llmJudge`.
2. Register it in `suites/index.ts`.

DB-coupled prompts (note classifier, page extractor) resolve a tenant key and
read rows, so their suites take `--clientId=<id>` against a seeded tenant — same
pattern as the Brain runner.

## Wired so far (POC)

- `automation-parser` — plain-English rule → structured automation JSON (contract + trigger/action correctness).
- `survey-summary` — free-text answers → themes/sentiment/per-question (contract + rules + LLM-judge groundedness).

Next candidates (from the prompt inventory): note classifier, meeting extractor,
branding generators, pitch-deck generator, block style picker.
