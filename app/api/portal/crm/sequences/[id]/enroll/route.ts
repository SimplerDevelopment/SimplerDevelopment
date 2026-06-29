// Enroll a contact into a CRM email sequence. Phase 2 of
// [[Spec - CRM Email Sync + Sequences]]. POST { contactId }.
// The process-crm-sequences cron then advances the enrollment step by step.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmSequences, crmContacts, crmSequenceEnrollments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const seqId = parseInt((await params).id, 10);
  if (Number.isNaN(seqId)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const contactId = Number(body.contactId);
  if (!Number.isInteger(contactId))
    return NextResponse.json({ success: false, message: 'contactId is required' }, { status: 400 });

  // Both the sequence and the contact must belong to the caller's client.
  const [sequence] = await db
    .select({ id: crmSequences.id })
    .from(crmSequences)
    .where(and(eq(crmSequences.id, seqId), eq(crmSequences.clientId, client.id)))
    .limit(1);
  if (!sequence) return NextResponse.json({ success: false, message: 'Sequence not found' }, { status: 404 });

  const [contact] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, client.id)))
    .limit(1);
  if (!contact) return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });

  const [enrollment] = await db
    .insert(crmSequenceEnrollments)
    .values({ clientId: client.id, sequenceId: seqId, contactId, status: 'active', currentStep: 0 })
    .onConflictDoNothing() // UNIQUE (sequenceId, contactId)
    .returning();

  if (!enrollment)
    return NextResponse.json(
      { success: false, message: 'Contact is already enrolled in this sequence' },
      { status: 409 },
    );

  return NextResponse.json({ success: true, data: enrollment }, { status: 201 });
}
