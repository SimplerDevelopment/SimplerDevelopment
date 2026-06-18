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

## Wired so far

| Suite | Prompt | Notes |
|---|---|---|
| `automation-parser` | NLP rule parser | contract + trigger/action correctness |
| `survey-summary` | survey synthesis | contract + rules + **LLM-judge** groundedness |
| `brain-classifier` | intent classifier | label accuracy (intent/complexity) |
| `brain-grounder` | hallucination checker | meta-eval: verdict correctness + self-consistency |
| `page-extractor` | extension extractor | needs `--clientId` (tenant key); no row seeding |
| `note-classifier` | note taxonomy | via pure `classifyNoteRow` core (no DB) |
| `meeting-extractor` | transcript → tasks/decisions | via pure `extractMeetingTranscript` core (no DB) |
| `branding-messaging` | messaging generator | contract + 3-5 differentiators + **LLM-judge** on-brand/no-fabrication |
| `branding-theme` | visual identity generator | contract + colors-are-valid-hex |

`note-classifier` and `meeting-extractor` were DB-coupled (took row ids,
persisted results). We extracted pure, apiKey-taking cores (`classifyNoteRow`,
`extractMeetingTranscript`) that the production orchestrators now call, so the
eval exercises the identical prompt path with no row seeding.

The branding generators' model logic was extracted from their API routes into
`lib/branding/generators.ts` (the routes call it too) so the eval exercises the
real path with just a key — same pattern as the brain cores.

Next candidates (from the prompt inventory): pitch-deck generator, block style
picker, CMS branding generator.
