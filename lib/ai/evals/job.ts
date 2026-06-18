/**
 * Eval-run executor — turns a queued `eval_runs` row into scored, persisted
 * results. This is the engine the background worker (and the CLI) call:
 *
 *   const runId = await enqueueEvalRun({ suiteId, promptVersionId, trigger })
 *   await runEvalJob(runId, { anthropicApiKey })
 *
 * It resolves the target prompt version body (so the run evaluates THAT version,
 * not the active one), loads the dataset's cases from the DB, scores them via
 * the suite, and writes `eval_case_results` + the `eval_runs` rollup.
 *
 * Normal app runtime — `new Date()` is fine here (the no-Date rule is workflow-
 * script only).
 */
import { db } from '@/lib/db';
import { evalRuns, evalCaseResults, type EvalRunTrigger } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSuite } from './suites';
import { getPromptVersionBody } from '@/lib/ai/prompt-registry';
import { loadCasesFromDb } from './cases';
import { runSuite } from './runner';
import type { EvalEnv } from './env';
import type { EvalSuite, CaseResult } from './types';

// Rough blended Anthropic pricing for the cost rollup (USD per token). The
// dedicated cost dashboard phase can refine this per-model.
const INPUT_RATE = 3 / 1_000_000;
const OUTPUT_RATE = 15 / 1_000_000;

export async function enqueueEvalRun(args: {
  suiteId: string;
  promptId?: number;
  promptVersionId?: number;
  datasetId?: number;
  trigger?: EvalRunTrigger;
  createdBy?: number;
}): Promise<number> {
  const [row] = await db
    .insert(evalRuns)
    .values({
      suiteId: args.suiteId,
      promptId: args.promptId ?? null,
      promptVersionId: args.promptVersionId ?? null,
      datasetId: args.datasetId ?? null,
      trigger: args.trigger ?? 'manual',
      status: 'queued',
      createdBy: args.createdBy ?? null,
    })
    .returning({ id: evalRuns.id });
  return row.id;
}

async function markFailed(runId: number, message: string): Promise<void> {
  await db
    .update(evalRuns)
    .set({ status: 'failed', finishedAt: new Date(), error: message.slice(0, 4000) })
    .where(eq(evalRuns.id, runId));
}

/**
 * Execute one eval run by id. Idempotency is the caller's concern (the worker
 * claims a queued row); this flips status running → done/failed and persists
 * results. `mock` scores against each case's mockOutput (no model calls).
 */
export async function runEvalJob(
  runId: number,
  opts: { anthropicApiKey?: string; clientId?: number; mock?: boolean; judgeModel?: string } = {},
): Promise<void> {
  const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, runId)).limit(1);
  if (!run) throw new Error(`eval run ${runId} not found`);

  const suite = getSuite(run.suiteId) as EvalSuite | undefined;
  if (!suite) {
    await markFailed(runId, `unknown suite "${run.suiteId}"`);
    return;
  }

  await db.update(evalRuns).set({ status: 'running', startedAt: new Date() }).where(eq(evalRuns.id, runId));

  try {
    // Target a specific version's body (eval THAT version), if the run pins one.
    // If a version was pinned but can't be found, FAIL rather than silently
    // scoring the default prompt (which would mislabel the results).
    let promptOverride: string | undefined;
    if (run.promptVersionId) {
      promptOverride = (await getPromptVersionBody(run.promptVersionId)) ?? undefined;
      if (promptOverride === undefined) {
        await markFailed(runId, `prompt version ${run.promptVersionId} not found`);
        return;
      }
    }

    // DB-backed cases for the dataset; fall back to the suite's code fixtures.
    const dbCases = await loadCasesFromDb(run.suiteId, run.datasetId ?? undefined);

    const env: EvalEnv = {
      anthropicApiKey: opts.anthropicApiKey,
      clientId: opts.clientId,
      mock: opts.mock,
      judgeModel: opts.judgeModel,
      promptOverride,
    };

    const result = await runSuite(suite, env, dbCases.length ? dbCases : undefined);
    const cases = result.cases as CaseResult[];

    // A run with nothing to score is a misconfiguration (no DB cases + no code
    // fixtures), not a clean pass — surface it rather than writing a vacuous 0/0.
    if (result.total === 0) {
      await markFailed(runId, `no cases to score for suite "${run.suiteId}"`);
      return;
    }

    if (cases.length) {
      await db.insert(evalCaseResults).values(
        cases.map((c) => ({
          runId,
          caseKey: c.caseId,
          passed: c.passed,
          aggregate: c.aggregate,
          latencyMs: c.latencyMs,
          inputTokens: c.inputTokens,
          outputTokens: c.outputTokens,
          output: (c.output ?? null) as unknown,
          scores: c.scores as unknown,
          error: c.error ?? null,
        })),
      );
    }

    const totalInput = cases.reduce((a, c) => a + c.inputTokens, 0);
    const totalOutput = cases.reduce((a, c) => a + c.outputTokens, 0);
    const costUsd = totalInput * INPUT_RATE + totalOutput * OUTPUT_RATE;

    await db
      .update(evalRuns)
      .set({
        status: 'done',
        finishedAt: new Date(),
        total: result.total,
        passed: result.passed,
        passRate: result.passRate,
        aggregate: result.aggregate,
        avgLatencyMs: result.avgLatencyMs,
        totalTokens: result.totalTokens,
        costUsd,
      })
      .where(eq(evalRuns.id, runId));
  } catch (err) {
    await markFailed(runId, err instanceof Error ? err.message : String(err));
  }
}
