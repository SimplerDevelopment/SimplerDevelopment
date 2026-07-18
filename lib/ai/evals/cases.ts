/**
 * DB-backed eval cases (datasets) — the editable test inputs for each suite.
 *
 * `loadCasesFromDb` is what the eval worker feeds into `runSuite` instead of the
 * in-code fixtures. `seedCasesFromSuites` bootstraps the DB from each suite's
 * current code `cases` so the dashboard starts with the existing fixtures.
 */
import { db } from '@/lib/db';
import { evalDatasets, evalCases } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { EvalCase } from './types';
import { ALL_SUITES } from './suites';

/**
 * Load enabled cases for a suite's dataset (the earliest/default dataset when
 * `datasetId` is omitted). Returns [] if the suite has no DB dataset yet — the
 * caller then falls back to the suite's in-code fixtures.
 */
export async function loadCasesFromDb(suiteId: string, datasetId?: number): Promise<EvalCase[]> {
  let dsId = datasetId;
  if (dsId == null) {
    const [ds] = await db
      .select({ id: evalDatasets.id })
      .from(evalDatasets)
      .where(eq(evalDatasets.suiteId, suiteId))
      .orderBy(asc(evalDatasets.id))
      .limit(1);
    if (!ds) return [];
    dsId = ds.id;
  }
  const rows = await db
    .select()
    .from(evalCases)
    .where(and(eq(evalCases.datasetId, dsId), eq(evalCases.enabled, true)))
    .orderBy(asc(evalCases.order), asc(evalCases.id));
  return rows.map((r) => ({
    id: r.caseKey,
    input: r.input,
    expected: r.expected ?? undefined,
    mockOutput: (r.mockOutput ?? undefined) as unknown,
  }));
}

/**
 * Seed eval_datasets/eval_cases from every suite's in-code fixtures. Idempotent:
 * upserts a 'default' dataset per suite and inserts each case by
 * (datasetId, caseKey), skipping ones that already exist.
 */
export async function seedCasesFromSuites(): Promise<{ datasets: number; cases: number }> {
  let datasets = 0;
  let cases = 0;
  for (const suite of ALL_SUITES) {
    let [ds] = await db
      .select({ id: evalDatasets.id })
      .from(evalDatasets)
      .where(and(eq(evalDatasets.suiteId, suite.id), eq(evalDatasets.name, 'default')))
      .limit(1);
    if (!ds) {
      [ds] = await db.insert(evalDatasets).values({ suiteId: suite.id, name: 'default' }).returning({ id: evalDatasets.id });
      datasets++;
    }
    for (const c of suite.cases) {
      const [exists] = await db
        .select({ id: evalCases.id })
        .from(evalCases)
        .where(and(eq(evalCases.datasetId, ds.id), eq(evalCases.caseKey, c.id)))
        .limit(1);
      if (exists) continue;
      await db.insert(evalCases).values({
        datasetId: ds.id,
        caseKey: c.id,
        input: c.input as unknown,
        expected: (c.expected ?? null) as unknown,
        mockOutput: (c.mockOutput ?? null) as unknown,
      });
      cases++;
    }
  }
  return { datasets, cases };
}
