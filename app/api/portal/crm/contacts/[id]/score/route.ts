import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmContacts, crmScoringRules } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(
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

  const contactId = parseInt(id, 10);
  if (isNaN(contactId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Verify the contact belongs to this client
  const [contact] = await db
    .select({ id: crmContacts.id, score: crmContacts.score })
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, client.id)));

  if (!contact)
    return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });

  const body = await req.json();

  if (!body.eventType?.trim()) {
    return NextResponse.json(
      { success: false, message: 'eventType is required' },
      { status: 400 }
    );
  }

  // Find the matching scoring rule
  const [rule] = await db
    .select()
    .from(crmScoringRules)
    .where(
      and(
        eq(crmScoringRules.clientId, client.id),
        eq(crmScoringRules.eventType, body.eventType.trim()),
        eq(crmScoringRules.enabled, true)
      )
    );

  if (!rule) {
    return NextResponse.json(
      { success: false, message: 'No enabled scoring rule found for this event type' },
      { status: 404 }
    );
  }

  const newScore = contact.score + rule.points;

  const [updated] = await db
    .update(crmContacts)
    .set({ score: newScore, updatedAt: new Date() })
    .where(eq(crmContacts.id, contactId))
    .returning();

  return NextResponse.json({
    success: true,
    data: {
      contactId: updated.id,
      previousScore: contact.score,
      pointsAdded: rule.points,
      newScore: updated.score,
      eventType: body.eventType,
    },
  });
}
