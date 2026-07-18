import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { evalCases, evalDatasets } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireStaff, requireAdmin } from '../prompts/_auth';
import { logPromptAudit } from '@/lib/ai/evals/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/eval-cases?datasetId=N
 * GET /api/admin/eval-cases?suiteId=key  (resolves the first dataset for that suite)
 *
 * Returns all cases for the dataset, ordered by `order` then id. Requires staff.
 */
export async function GET(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const datasetIdParam = searchParams.get('datasetId');
  const suiteId = searchParams.get('suiteId');

  let datasetId: number | null = null;

  if (datasetIdParam != null) {
    datasetId = parseInt(datasetIdParam, 10);
    if (Number.isNaN(datasetId)) {
      return NextResponse.json({ success: false, message: 'Invalid datasetId' }, { status: 400 });
    }
  } else if (suiteId) {
    // Resolve the default (first) dataset for this suiteId
    const [dataset] = await db
      .select({ id: evalDatasets.id })
      .from(evalDatasets)
      .where(eq(evalDatasets.suiteId, suiteId))
      .limit(1);
    if (!dataset) {
      return NextResponse.json({ success: false, message: 'Dataset not found for suiteId' }, { status: 404 });
    }
    datasetId = dataset.id;
  } else {
    return NextResponse.json({ success: false, message: 'datasetId or suiteId query param required' }, { status: 400 });
  }

  const cases = await db
    .select()
    .from(evalCases)
    .where(eq(evalCases.datasetId, datasetId))
    .orderBy(asc(evalCases.order), asc(evalCases.id));

  return NextResponse.json({ success: true, data: cases });
}

/**
 * POST /api/admin/eval-cases — create a new eval case.
 *
 * Body: { datasetId: number; caseKey: string; input: unknown; expected?: unknown; mockOutput?: unknown; order?: number }
 * Requires admin.
 */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    datasetId: datasetIdRaw,
    caseKey,
    input,
    expected,
    mockOutput,
    order,
  } = body as {
    datasetId?: unknown;
    caseKey?: unknown;
    input?: unknown;
    expected?: unknown;
    mockOutput?: unknown;
    order?: unknown;
  };

  if (typeof datasetIdRaw !== 'number' || !Number.isInteger(datasetIdRaw)) {
    return NextResponse.json({ success: false, message: 'datasetId must be an integer' }, { status: 400 });
  }
  if (typeof caseKey !== 'string' || caseKey.trim() === '') {
    return NextResponse.json({ success: false, message: 'caseKey is required' }, { status: 400 });
  }
  if (input === undefined) {
    return NextResponse.json({ success: false, message: 'input is required' }, { status: 400 });
  }

  // Verify dataset exists
  const [dataset] = await db
    .select({ id: evalDatasets.id })
    .from(evalDatasets)
    .where(eq(evalDatasets.id, datasetIdRaw))
    .limit(1);
  if (!dataset) {
    return NextResponse.json({ success: false, message: 'Dataset not found' }, { status: 404 });
  }

  const [newCase] = await db
    .insert(evalCases)
    .values({
      datasetId: datasetIdRaw,
      caseKey: caseKey.trim(),
      input: input as never,
      expected: expected !== undefined ? (expected as never) : null,
      mockOutput: mockOutput !== undefined ? (mockOutput as never) : null,
      enabled: true,
      order: typeof order === 'number' ? order : 0,
    })
    .returning();

  const actorId = parseInt((session.user as { id: string }).id, 10);
  await logPromptAudit({
    actorUserId: Number.isNaN(actorId) ? null : actorId,
    action: 'create_case',
    promptId: null,
    versionId: null,
    detail: { datasetId: datasetIdRaw, caseKey: newCase.caseKey, caseId: newCase.id },
  });

  return NextResponse.json({ success: true, data: newCase }, { status: 201 });
}
