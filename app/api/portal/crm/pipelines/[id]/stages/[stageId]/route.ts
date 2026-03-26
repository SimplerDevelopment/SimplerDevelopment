import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmPipelines, crmPipelineStages, crmDeals } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const { id, stageId } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const pipelineId = parseInt(id, 10);
  const stageIdNum = parseInt(stageId, 10);
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
