/**
 * POST /api/portal/crm/contracts/[id]/cancel-signature
 *
 * Cancels an in-flight DropboxSign signature request. Marks the
 * contract row as canceled and inserts a signing event. Tenant-scoped.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigningEvents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { cancelSignatureRequest } from '@/lib/esign/dropbox-sign';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
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

  const [contract] = await db
    .select()
    .from(crmContracts)
    .where(and(eq(crmContracts.id, contractId), eq(crmContracts.clientId, client.id)));
  if (!contract) {
    return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
  }

  // Already terminal — nothing to do.
  const terminal = new Set(['signed', 'declined', 'canceled', 'not_sent']);
  if (contract.esignStatus && terminal.has(contract.esignStatus)) {
    return NextResponse.json(
      { success: false, error: `Cannot cancel from status '${contract.esignStatus}'` },
      { status: 409 },
    );
  }

  if (contract.esignProviderRequestId) {
    try {
      await cancelSignatureRequest(contract.esignProviderRequestId);
    } catch (err) {
      // Don't block the local cancel on a provider failure — log and proceed.
      console.error('[contracts/cancel-signature] DropboxSign cancel failed (continuing)', err);
    }
  }

  const now = new Date();
  await db
    .update(crmContracts)
    .set({ esignStatus: 'canceled', updatedAt: now })
    .where(eq(crmContracts.id, contractId));

  await db.insert(crmContractSigningEvents).values({
    contractId,
    clientId: client.id,
    kind: 'canceled',
    actorEmail: session.user.email ?? null,
    payload: { providerRequestId: contract.esignProviderRequestId },
  });

  return NextResponse.json({ success: true, data: { esignStatus: 'canceled' } });
}
