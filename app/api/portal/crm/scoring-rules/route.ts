import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmScoringRules } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const rules = await db
    .select()
    .from(crmScoringRules)
    .where(eq(crmScoringRules.clientId, client.id))
    .orderBy(asc(crmScoringRules.eventType));

  return NextResponse.json({ success: true, data: rules });
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

  if (!body.eventType?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Event type is required' },
      { status: 400 }
    );
  }

  if (typeof body.points !== 'number') {
    return NextResponse.json(
      { success: false, message: 'Points must be a number' },
      { status: 400 }
    );
  }

  const [rule] = await db
    .insert(crmScoringRules)
    .values({
      clientId: client.id,
      eventType: body.eventType.trim(),
      points: body.points,
      description: body.description?.trim() || null,
      enabled: body.enabled ?? true,
    })
    .returning();

  return NextResponse.json({ success: true, data: rule }, { status: 201 });
}
