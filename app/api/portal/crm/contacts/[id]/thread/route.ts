// GET /api/portal/crm/contacts/[id]/thread — the unified email thread for a
// contact (inbound Gmail + outbound), chronological. Phase 1 of
// [[Spec - CRM Email Sync + Sequences]]. Tenant-scoped via the contact's clientId.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmContacts, crmEmailMessages } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const contactId = parseInt(id, 10);
  if (Number.isNaN(contactId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Ownership check → a contact from another tenant 404s (no thread leak).
  const [contact] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, client.id)))
    .limit(1);
  if (!contact) return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });

  const messages = await db
    .select()
    .from(crmEmailMessages)
    .where(and(eq(crmEmailMessages.clientId, client.id), eq(crmEmailMessages.contactId, contactId)))
    .orderBy(asc(crmEmailMessages.sentAt));

  return NextResponse.json({ success: true, data: messages });
}
