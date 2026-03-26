import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmPipelines, crmPipelineStages } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const pipelineId = parseInt(id, 10);
  if (isNaN(pipelineId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Verify pipeline ownership
  const [pipeline] = await db
    .select({ id: crmPipelines.id })
    .from(crmPipelines)
    .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, client.id)));

  if (!pipeline)
    return NextResponse.json({ success: false, message: 'Pipeline not found' }, { status: 404 });

  const body = await req.json();

  if (!body.stages || !Array.isArray(body.stages)) {
    return NextResponse.json(
      { success: false, message: 'stages array is required' },
      { status: 400 }
    );
  }

  // Bulk update: each stage object should have { id?, name, color?, sortOrder, probability? }
  // Stages with an id are updated; stages without an id are created
  const updatedStages: (typeof crmPipelineStages.$inferSelect)[] = [];

  for (const stage of body.stages) {
    if (stage.id) {
      // Update existing stage
      const [updated] = await db
        .update(crmPipelineStages)
        .set({
          name: stage.name,
          color: stage.color ?? '#6366f1',
          sortOrder: stage.sortOrder,
          probability: stage.probability ?? null,
        })
        .where(
          and(
            eq(crmPipelineStages.id, stage.id),
            eq(crmPipelineStages.pipelineId, pipelineId)
          )
        )
        .returning();
      if (updated) updatedStages.push(updated);
    } else {
      // Create new stage
      const [created] = await db
        .insert(crmPipelineStages)
        .values({
          pipelineId,
          name: stage.name,
          color: stage.color ?? '#6366f1',
          sortOrder: stage.sortOrder,
          probability: stage.probability ?? null,
        })
        .returning();
      updatedStages.push(created);
    }
  }

  return NextResponse.json({ success: true, data: updatedStages });
}
