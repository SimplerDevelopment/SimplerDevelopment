import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmPipelines, crmPipelineStages } from '@/lib/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { ensureDefaultPipeline } from '@/lib/crm/default-pipeline';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  // Auto-seed a default pipeline for clients who don't have one yet
  await ensureDefaultPipeline(client.id);

  const pipelines = await db
    .select()
    .from(crmPipelines)
    .where(eq(crmPipelines.clientId, client.id))
    .orderBy(asc(crmPipelines.createdAt));

  const pipelineIds = pipelines.map((p) => p.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stagesMap: Record<number, any[]> = {};

  if (pipelineIds.length > 0) {
    const allStages = await db
      .select()
      .from(crmPipelineStages)
      .where(inArray(crmPipelineStages.pipelineId, pipelineIds))
      .orderBy(asc(crmPipelineStages.sortOrder));

    for (const stage of allStages) {
      if (!stagesMap[stage.pipelineId]) stagesMap[stage.pipelineId] = [];
      stagesMap[stage.pipelineId].push(stage);
    }
  }

  const data = pipelines.map((p) => ({
    ...p,
    stages: stagesMap[p.id] || [],
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Pipeline name is required' },
      { status: 400 }
    );
  }

  // Check if this is the first pipeline (make it default)
  const existingPipelines = await db
    .select({ id: crmPipelines.id })
    .from(crmPipelines)
    .where(eq(crmPipelines.clientId, client.id))
    .limit(1);

  const isDefault = existingPipelines.length === 0;

  const [pipeline] = await db
    .insert(crmPipelines)
    .values({
      clientId: client.id,
      name: body.name.trim(),
      isDefault,
    })
    .returning();

  // Create default stages
  const defaultStages = [
    { name: 'Lead', color: '#94a3b8', sortOrder: 0, probability: 10 },
    { name: 'Qualified', color: '#3b82f6', sortOrder: 1, probability: 25 },
    { name: 'Proposal', color: '#8b5cf6', sortOrder: 2, probability: 50 },
    { name: 'Negotiation', color: '#f59e0b', sortOrder: 3, probability: 75 },
    { name: 'Closed Won', color: '#22c55e', sortOrder: 4, probability: 100 },
    { name: 'Closed Lost', color: '#ef4444', sortOrder: 5, probability: 0 },
  ];

  const stages = await db
    .insert(crmPipelineStages)
    .values(
      defaultStages.map((s) => ({
        pipelineId: pipeline.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sortOrder,
        probability: s.probability,
      }))
    )
    .returning();

  return NextResponse.json(
    { success: true, data: { ...pipeline, stages } },
    { status: 201 }
  );
}
