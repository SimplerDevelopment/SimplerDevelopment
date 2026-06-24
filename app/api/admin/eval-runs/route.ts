import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, evalDatasets, evalRuns } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { enqueueEvalRun, runEvalJob } from '@/lib/ai/evals/job';
import { requireStaff } from '../prompts/_auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/eval-runs — enqueue a manual eval run for a prompt's ACTIVE
 * version and kick it off.
 *
 * Body: { promptId: number, mock?: boolean }  (mock defaults to true — free,
 * scores against each case's seeded mockOutput; mock:false hits the model.)
 *
 * ponytail: production drains the queue via the cron worker
 * (app/api/cron/eval-runs). In dev there's no cron, so we drive the same
 * engine (`runEvalJob`) inline as fire-and-forget and let the client poll
 * GET /api/admin/eval-runs/[runId]. The mock flag is intentionally NOT
 * persisted on the run row (the schema has no such column) — it's an
 * execution-time choice passed straight to the executor here.
 */
export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let body: { promptId?: number; mock?: boolean; datasetId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const promptId = Number(body.promptId);
  if (!Number.isInteger(promptId)) {
    return NextResponse.json({ success: false, message: 'promptId (number) is required' }, { status: 400 });
  }
  const mock = body.mock !== false; // default: mock

  // A real (non-mock) run spends the platform Anthropic key — admins only.
  // Mock runs are free, so any staff member may trigger them.
  if (!mock && (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Real (non-mock) runs require an admin' }, { status: 403 });
  }

  const [prompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!prompt) return NextResponse.json({ success: false, message: 'Prompt not found' }, { status: 404 });
  if (!prompt.activeVersionId) {
    return NextResponse.json({ success: false, message: 'Prompt has no active version to run' }, { status: 409 });
  }

  // Target a specific dataset if asked (must belong to this suite); otherwise
  // the suite's first dataset. Executor falls back to code fixtures if none.
  let dataset: { id: number } | undefined;
  if (Number.isInteger(Number(body.datasetId))) {
    [dataset] = await db
      .select({ id: evalDatasets.id })
      .from(evalDatasets)
      .where(and(eq(evalDatasets.id, Number(body.datasetId)), eq(evalDatasets.suiteId, prompt.key)))
      .limit(1);
    if (!dataset) {
      return NextResponse.json({ success: false, message: 'datasetId does not belong to this prompt' }, { status: 400 });
    }
  } else {
    [dataset] = await db
      .select({ id: evalDatasets.id })
      .from(evalDatasets)
      .where(eq(evalDatasets.suiteId, prompt.key))
      .limit(1);
  }

  const createdBy = Number.parseInt(session.user.id as string, 10);

  const runId = await enqueueEvalRun({
    suiteId: prompt.key,
    promptId: prompt.id,
    promptVersionId: prompt.activeVersionId,
    datasetId: dataset?.id,
    trigger: 'manual',
    createdBy: Number.isNaN(createdBy) ? undefined : createdBy,
  });

  // Drive the run inline so the UI can poll it immediately (dev has no cron).
  // Atomically CLAIM the row first (queued → running) so a concurrent cron
  // worker can't also execute it — whoever wins the CAS runs it; the other skips.
  void (async () => {
    const [claimed] = await db
      .update(evalRuns)
      .set({ status: 'running', startedAt: new Date() })
      .where(and(eq(evalRuns.id, runId), eq(evalRuns.status, 'queued')))
      .returning({ id: evalRuns.id });
    if (!claimed) return; // the cron worker claimed it first
    await runEvalJob(runId, { mock, anthropicApiKey: process.env.ANTHROPIC_API_KEY }).catch((err) => {
      console.error(`[eval-runs] runEvalJob(${runId}) failed:`, err);
    });
  })();

  return NextResponse.json({ success: true, data: { runId, mock } });
}
