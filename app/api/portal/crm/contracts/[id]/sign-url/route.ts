/**
 * GET /api/portal/crm/contracts/[id]/sign-url
 *
 * Returns a one-time embedded sign URL for the active signer.
 * Authorized for either:
 *   - the contract owner (via getPortalClient → tenant match), or
 *   - the signer themselves (logged-in user whose email matches
 *     contract.esignSignerEmail).
 *
 * Only valid when esignStatus is 'sent' or 'viewed'.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigningEvents, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { getEmbeddedSignUrl } from '@/lib/esign/dropbox-sign';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (Number.isNaN(contractId)) {
    return NextResponse.json({ success: false, error: 'Invalid contract id' }, { status: 400 });
  }

  // Fetch the contract without the client filter so we can permission-check
  // both owner and signer paths.
  const [contract] = await db.select().from(crmContracts).where(eq(crmContracts.id, contractId));
  if (!contract) {
    return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
  }

  const userId = parseInt(session.user.id, 10);
  const portalClient = await getPortalClient(userId);
  const isOwner = portalClient?.id === contract.clientId;

  // Look up signer match by joining users → email.
  let isSigner = false;
  if (contract.esignSignerEmail) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (u?.email && u.email.toLowerCase() === contract.esignSignerEmail.toLowerCase()) {
      isSigner = true;
    }
  }

  if (!isOwner && !isSigner) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  if (!contract.esignProviderRequestId) {
    return NextResponse.json(
      { success: false, error: 'Contract has not been sent for signature yet' },
      { status: 409 },
    );
  }
  const allowedStatuses = new Set(['sent', 'viewed']);
  if (!contract.esignStatus || !allowedStatuses.has(contract.esignStatus)) {
    return NextResponse.json(
      { success: false, error: `Cannot fetch sign URL in status '${contract.esignStatus}'` },
      { status: 409 },
    );
  }

  // We need a signature_id. Pull it from the latest 'sent' signing event payload —
  // the createSignatureRequest writes it there.
  const sentEvent = await db
    .select()
    .from(crmContractSigningEvents)
    .where(
      and(
        eq(crmContractSigningEvents.contractId, contractId),
        eq(crmContractSigningEvents.kind, 'sent'),
      ),
    )
    .orderBy(crmContractSigningEvents.occurredAt)
    .limit(50);

  // Take the most recent.
  const latest = sentEvent[sentEvent.length - 1];
  const signatureId = (latest?.payload as { signatureId?: string } | undefined)?.signatureId;
  if (!signatureId) {
    return NextResponse.json(
      { success: false, error: 'Signature id missing — re-send the contract.' },
      { status: 500 },
    );
  }

  let result: { signUrl: string; expiresAt: Date };
  try {
    result = await getEmbeddedSignUrl(signatureId);
  } catch (err) {
    console.error('[contracts/sign-url] DropboxSign failed', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'DropboxSign request failed' },
      { status: 502 },
    );
  }

  // Audit: record a 'viewed' event when the signer fetches the URL.
  if (isSigner) {
    await db.insert(crmContractSigningEvents).values({
      contractId,
      clientId: contract.clientId,
      kind: 'opened',
      actorEmail: contract.esignSignerEmail,
      payload: { signatureId },
    });
    // Promote status to 'viewed' if still 'sent'.
    if (contract.esignStatus === 'sent') {
      await db
        .update(crmContracts)
        .set({ esignStatus: 'viewed', updatedAt: new Date() })
        .where(eq(crmContracts.id, contractId));
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      signUrl: result.signUrl,
      expiresAt: result.expiresAt.toISOString(),
    },
  });
}
