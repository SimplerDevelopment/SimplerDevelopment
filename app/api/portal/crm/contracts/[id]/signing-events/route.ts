/**
 * GET /api/portal/crm/contracts/[id]/signing-events
 *
 * Returns the audit-trail events for a contract. Tenant-scoped.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigningEvents } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) {
    return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
  }

  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (Number.isNaN(contractId)) {
    return NextResponse.json({ success: false, error: 'Invalid contract id' }, { status: 400 });
  }

  // Tenant guard.
  const [contract] = await db
    .select({ id: crmContracts.id })
    .from(crmContracts)
    .where(and(eq(crmContracts.id, contractId), eq(crmContracts.clientId, client.id)));
  if (!contract) {
    return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
  }

  const events = await db
    .select()
    .from(crmContractSigningEvents)
    .where(eq(crmContractSigningEvents.contractId, contractId))
    .orderBy(desc(crmContractSigningEvents.occurredAt))
    .limit(200);

  return NextResponse.json({ success: true, data: events });
}
