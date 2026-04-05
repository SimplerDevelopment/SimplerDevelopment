import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmScoringRules } from '@/lib/db/schema';
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

  const ruleId = parseInt(id, 10);
  if (isNaN(ruleId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.eventType !== undefined) updates.eventType = body.eventType.trim();
  if (body.points !== undefined) updates.points = body.points;
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, message: 'No fields to update' },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(crmScoringRules)
    .set(updates)
    .where(and(eq(crmScoringRules.id, ruleId), eq(crmScoringRules.clientId, client.id)))
    .returning();

  if (!updated)
    return NextResponse.json({ success: false, message: 'Rule not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: Request,
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

  const ruleId = parseInt(id, 10);
  if (isNaN(ruleId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmScoringRules)
    .where(and(eq(crmScoringRules.id, ruleId), eq(crmScoringRules.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Rule not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
