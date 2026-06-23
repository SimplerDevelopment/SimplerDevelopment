import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmPipelines, crmPipelineStages, crmDeals } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

async function resolveParams(params: Promise<{ id: string; stageId: string }>) {
  const { id, stageId } = await params;
  const pipelineId = parseInt(id, 10);
  const stageIdNum = parseInt(stageId, 10);
  return { pipelineId, stageIdNum };
}

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id)
    return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client };
}

// PUT /api/portal/crm/pipelines/[id]/stages/[stageId]
// Update an individual pipeline stage (name, color, sortOrder, probability).
// Tenant-scoped: verifies pipeline ownership via clientId before updating.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const { pipelineId, stageIdNum } = await resolveParams(params);
  if (isNaN(pipelineId) || isNaN(stageIdNum))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Verify pipeline ownership — tenant gate
  const [pipeline] = await db
    .select({ id: crmPipelines.id })
    .from(crmPipelines)
    .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, client.id)));

  if (!pipeline)
    return NextResponse.json({ success: false, message: 'Pipeline not found' }, { status: 404 });

  const body = await req.json();

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  const [updated] = await db
    .update(crmPipelineStages)
    .set({
      name: body.name.trim(),
      color: body.color ?? '#6366f1',
      sortOrder: body.sortOrder ?? 0,
      probability: body.probability ?? null,
    })
    .where(
      and(
        eq(crmPipelineStages.id, stageIdNum),
        eq(crmPipelineStages.pipelineId, pipelineId)
      )
    )
    .returning();

  if (!updated)
    return NextResponse.json({ success: false, message: 'Stage not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

// DELETE /api/portal/crm/pipelines/[id]/stages/[stageId]
// Remove an individual pipeline stage. Blocked if deals exist in that stage.
// Tenant-scoped: verifies pipeline ownership via clientId before deleting.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const { pipelineId, stageIdNum } = await resolveParams(params);
  if (isNaN(pipelineId) || isNaN(stageIdNum))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Verify pipeline ownership
  const [pipeline] = await db
    .select({ id: crmPipelines.id })
    .from(crmPipelines)
    .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, client.id)));

  if (!pipeline)
    return NextResponse.json({ success: false, message: 'Pipeline not found' }, { status: 404 });

  // Check if any deals are in this stage
  const [dealCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmDeals)
    .where(eq(crmDeals.stageId, stageIdNum));

  if (dealCount.count > 0) {
    return NextResponse.json(
      {
        success: false,
        message: `Cannot delete stage: ${dealCount.count} deal(s) are currently in this stage. Move them first.`,
      },
      { status: 409 }
    );
  }

  const [deleted] = await db
    .delete(crmPipelineStages)
    .where(
      and(
        eq(crmPipelineStages.id, stageIdNum),
        eq(crmPipelineStages.pipelineId, pipelineId)
      )
    )
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Stage not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
