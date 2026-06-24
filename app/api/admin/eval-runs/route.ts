import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, evalDatasets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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

  let body: { promptId?: number; mock?: boolean };
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

  const [prompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!prompt) return NextResponse.json({ success: false, message: 'Prompt not found' }, { status: 404 });
  if (!prompt.activeVersionId) {
    return NextResponse.json({ success: false, message: 'Prompt has no active version to run' }, { status: 409 });
  }

  // Default dataset for this suite (executor falls back to code fixtures if none).
  const [dataset] = await db
    .select({ id: evalDatasets.id })
    .from(evalDatasets)
    .where(eq(evalDatasets.suiteId, prompt.key))
    .limit(1);

  const createdBy = Number.parseInt(session.user.id as string, 10);

  const runId = await enqueueEvalRun({
    suiteId: prompt.key,
    promptId: prompt.id,
    promptVersionId: prompt.activeVersionId,
    datasetId: dataset?.id,
    trigger: 'manual',
    createdBy: Number.isNaN(createdBy) ? undefined : createdBy,
  });

  // Fire-and-forget: dev drain. Safe on the isolated local DB (no competing
  // cron worker to double-claim this run).
  void runEvalJob(runId, {
    mock,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  }).catch((err) => {
    console.error(`[eval-runs] runEvalJob(${runId}) failed:`, err);
  });

  return NextResponse.json({ success: true, data: { runId, mock } });
}
