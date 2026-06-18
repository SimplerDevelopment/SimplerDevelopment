/**
 * POST /api/portal/crm/contracts/[id]/send-for-signature
 *
 * Body: { signerEmail: string; signerName: string }
 *
 * Generates a contract PDF, hands it to DropboxSign as an embedded
 * signature request, and persists the provider request id + status
 * on the contract row. Multi-tenant: the contract must belong to the
 * caller's active client.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigningEvents, brandingProfiles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { createSignatureRequest } from '@/lib/esign/dropbox-sign';
import { renderContractPdf } from '@/lib/esign/contract-pdf';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const authResult = await authorizePortal({ action: 'write', requireService: 'esign' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) {
    return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
  }

  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (Number.isNaN(contractId)) {
    return NextResponse.json({ success: false, error: 'Invalid contract id' }, { status: 400 });
  }

  let body: { signerEmail?: string; signerName?: string; subject?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const signerEmail = (body.signerEmail || '').trim().toLowerCase();
  const signerName = (body.signerName || '').trim();
  if (!signerEmail || !signerName) {
    return NextResponse.json(
      { success: false, error: 'signerEmail and signerName are required' },
      { status: 400 },
    );
  }

  const [contract] = await db
    .select()
    .from(crmContracts)
    .where(and(eq(crmContracts.id, contractId), eq(crmContracts.clientId, client.id)));
  if (!contract) {
    return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
  }

  // Don't re-send if already in-flight or signed.
  const blockingStatuses = new Set(['sent', 'viewed', 'signed']);
  if (contract.esignStatus && blockingStatuses.has(contract.esignStatus)) {
    return NextResponse.json(
      {
        success: false,
        error: `Contract is already in '${contract.esignStatus}' state. Cancel before re-sending.`,
      },
      { status: 409 },
    );
  }

  // Fetch default branding for the client — best-effort; PDF renders fine without it.
  const [defaultBranding] = await db
    .select({
      logoUrl: brandingProfiles.logoUrl,
      primaryColor: brandingProfiles.primaryColor,
      accentColor: brandingProfiles.accentColor,
      logoText: brandingProfiles.logoText,
    })
    .from(brandingProfiles)
    .where(and(eq(brandingProfiles.clientId, client.id), eq(brandingProfiles.isDefault, true)))
    .limit(1);

  // Render the PDF.
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderContractPdf({
      title: contract.title,
      summary: contract.summary,
      clauses: contract.clauses ?? [],
      lineItems: contract.lineItems ?? [],
      fees: contract.fees ?? [],
      currency: contract.currency,
      signerName,
      signerEmail,
      footerText: contract.footerText,
      // Contract-level overrides take precedence; fall back to client branding.
      accentColor: contract.accentColor ?? defaultBranding?.primaryColor ?? undefined,
      logoUrl: contract.logoUrl ?? defaultBranding?.logoUrl ?? undefined,
      brandName: client.company ?? defaultBranding?.logoText ?? undefined,
    });
  } catch (err) {
    console.error('[contracts/send-for-signature] PDF render failed', err);
    return NextResponse.json({ success: false, error: 'Failed to render contract PDF' }, { status: 500 });
  }

  // Create the embedded signature request.
  let providerResult: { signatureRequestId: string; signatureId: string };
  try {
    providerResult = await createSignatureRequest({
      fileBuffer: pdfBuffer,
      fileName: `contract-${contract.id}.pdf`,
      signerEmail,
      signerName,
      title: contract.title,
      subject: body.subject || `Contract for your signature: ${contract.title}`,
      message:
        body.message ||
        `Please review and sign the attached contract. If you have questions, reply to this email.`,
    });
  } catch (err) {
    console.error('[contracts/send-for-signature] DropboxSign create failed', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'DropboxSign request failed' },
      { status: 502 },
    );
  }

  const now = new Date();
  await db
    .update(crmContracts)
    .set({
      esignProvider: 'dropboxsign',
      esignProviderRequestId: providerResult.signatureRequestId,
      esignSignerEmail: signerEmail,
      esignSignerName: signerName,
      esignStatus: 'sent',
      esignSentAt: now,
      // Clear any previous terminal timestamps from a prior cycle.
      esignSignedAt: null,
      esignDeclinedAt: null,
      updatedAt: now,
    })
    .where(eq(crmContracts.id, contractId));

  await db.insert(crmContractSigningEvents).values({
    contractId,
    clientId: client.id,
    kind: 'sent',
    actorEmail: signerEmail,
    payload: {
      signatureRequestId: providerResult.signatureRequestId,
      signatureId: providerResult.signatureId,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      esignStatus: 'sent',
      esignProviderRequestId: providerResult.signatureRequestId,
      signatureId: providerResult.signatureId,
    },
  });
}
