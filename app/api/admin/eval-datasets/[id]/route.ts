import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { evalDatasets } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin } from '../../prompts/_auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/eval-datasets/[id] — rename a dataset. Body: { name }.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const datasetId = parseInt(id, 10);
  if (Number.isNaN(datasetId)) {
    return NextResponse.json({ success: false, message: 'Invalid dataset id' }, { status: 400 });
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });

  const [updated] = await db
    .update(evalDatasets)
    .set({ name, updatedAt: new Date() })
    .where(eq(evalDatasets.id, datasetId))
    .returning();
  if (!updated) return NextResponse.json({ success: false, message: 'Dataset not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

/**
 * DELETE /api/admin/eval-datasets/[id] — delete a dataset (its cases cascade).
 * Refuses to delete a suite's LAST dataset so the suite always has a case set.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const datasetId = parseInt(id, 10);
  if (Number.isNaN(datasetId)) {
    return NextResponse.json({ success: false, message: 'Invalid dataset id' }, { status: 400 });
  }

  const [dataset] = await db.select().from(evalDatasets).where(eq(evalDatasets.id, datasetId)).limit(1);
  if (!dataset) return NextResponse.json({ success: false, message: 'Dataset not found' }, { status: 404 });

  // Guard: a suite must keep at least one dataset.
  const [sibling] = await db
    .select({ id: evalDatasets.id })
    .from(evalDatasets)
    .where(and(eq(evalDatasets.suiteId, dataset.suiteId), ne(evalDatasets.id, datasetId)))
    .limit(1);
  if (!sibling) {
    return NextResponse.json(
      { success: false, message: 'Cannot delete the only dataset for this suite' },
      { status: 409 },
    );
  }

  await db.delete(evalDatasets).where(eq(evalDatasets.id, datasetId));
  return NextResponse.json({ success: true, data: { id: datasetId } });
}
