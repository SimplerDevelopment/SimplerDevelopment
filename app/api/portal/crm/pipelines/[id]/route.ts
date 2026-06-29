import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmPipelines, crmDeals } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';

// PUT /api/portal/crm/pipelines/[id] — rename a pipeline
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const pipelineId = parseInt(id, 10);
  if (Number.isNaN(pipelineId))
    return NextResponse.json({ success: false, message: 'Invalid pipeline id' }, { status: 400 });

  const body = await req.json();
  if (!body.name?.trim())
    return NextResponse.json({ success: false, message: 'Pipeline name is required' }, { status: 400 });

  // Scope the update by clientId so a tenant can only rename its own pipeline.
  const [updated] = await db
    .update(crmPipelines)
    .set({ name: body.name.trim() })
    .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, client.id)))
    .returning();

  if (!updated)
    return NextResponse.json({ success: false, message: 'Pipeline not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

// DELETE /api/portal/crm/pipelines/[id] — delete a pipeline.
// Guards: the default pipeline is protected, and deletion is refused while the
// pipeline still has deals (crm_deals.pipeline_id cascades, so an unguarded
// delete would silently destroy those deals).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const pipelineId = parseInt(id, 10);
  if (Number.isNaN(pipelineId))
    return NextResponse.json({ success: false, message: 'Invalid pipeline id' }, { status: 400 });

  const [pipeline] = await db
    .select()
    .from(crmPipelines)
    .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, client.id)))
    .limit(1);

  if (!pipeline)
    return NextResponse.json({ success: false, message: 'Pipeline not found' }, { status: 404 });

  if (pipeline.isDefault)
    return NextResponse.json(
      { success: false, message: 'Cannot delete the default pipeline' },
      { status: 409 }
    );

  const [{ value: dealCount }] = await db
    .select({ value: count() })
    .from(crmDeals)
    .where(eq(crmDeals.pipelineId, pipelineId));

  if (dealCount > 0)
    return NextResponse.json(
      { success: false, message: `Pipeline has ${dealCount} deal(s); move or delete them first` },
      { status: 409 }
    );

  await db
    .delete(crmPipelines)
    .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, client.id)));

  return NextResponse.json({ success: true });
}
