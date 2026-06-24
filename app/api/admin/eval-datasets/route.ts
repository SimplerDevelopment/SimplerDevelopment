import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { evalDatasets, evalCases } from '@/lib/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { requireStaff, requireAdmin } from '../prompts/_auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/eval-datasets?suiteId=key — list a suite's datasets (with case
 * counts). A suite can carry multiple case sets (e.g. baseline vs. edge-cases).
 */
export async function GET(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const suiteId = new URL(req.url).searchParams.get('suiteId');
  if (!suiteId) {
    return NextResponse.json({ success: false, message: 'suiteId query param required' }, { status: 400 });
  }

  const rows = await db
    .select({
      id: evalDatasets.id,
      suiteId: evalDatasets.suiteId,
      name: evalDatasets.name,
      createdAt: evalDatasets.createdAt,
      updatedAt: evalDatasets.updatedAt,
      caseCount: sql<number>`count(${evalCases.id})::int`,
    })
    .from(evalDatasets)
    .leftJoin(evalCases, eq(evalCases.datasetId, evalDatasets.id))
    .where(eq(evalDatasets.suiteId, suiteId))
    .groupBy(evalDatasets.id)
    .orderBy(asc(evalDatasets.id));

  return NextResponse.json({ success: true, data: rows });
}

/**
 * POST /api/admin/eval-datasets — create a new dataset for a suite.
 * Body: { suiteId: string, name: string }
 */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let body: { suiteId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const suiteId = typeof body.suiteId === 'string' ? body.suiteId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!suiteId || !name) {
    return NextResponse.json({ success: false, message: 'suiteId and name are required' }, { status: 400 });
  }

  const [row] = await db.insert(evalDatasets).values({ suiteId, name }).returning();
  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
