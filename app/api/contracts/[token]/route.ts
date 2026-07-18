import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigners, clients } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';

// GET — fetch contract for public signing view (signer token)
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 400 });
  }

  // Try as signer token first
  const [signer] = await db.select().from(crmContractSigners)
    .where(eq(crmContractSigners.token, token)).limit(1);

  if (!signer) {
    return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
  }

  const [contract] = await db.select().from(crmContracts)
    .where(eq(crmContracts.id, signer.contractId)).limit(1);

  if (!contract || contract.status === 'draft') {
    return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
  }

  // Check expiration
  if (contract.validUntil && new Date(contract.validUntil) < new Date()) {
    return NextResponse.json({ success: false, message: 'Contract has expired', expired: true }, { status: 410 });
  }

  // Track view
  if (!signer.viewedAt) {
    await db.update(crmContractSigners).set({ viewedAt: new Date(), status: 'viewed' })
      .where(eq(crmContractSigners.id, signer.id));
  }

  // Get all signers for status display
  const allSigners = await db.select({
    id: crmContractSigners.id,
    name: crmContractSigners.name,
    role: crmContractSigners.role,
    status: crmContractSigners.status,
    signedAt: crmContractSigners.signedAt,
  }).from(crmContractSigners)
    .where(eq(crmContractSigners.contractId, contract.id));

  // Get company name
  const [clientRow] = await db.select({ company: clients.company })
    .from(clients).where(eq(clients.id, contract.clientId)).limit(1);

  return NextResponse.json({
    success: true,
    data: {
      title: contract.title,
      summary: contract.summary,
      clauses: contract.clauses,
      lineItems: contract.lineItems,
      fees: contract.fees,
      currency: contract.currency,
      accentColor: contract.accentColor,
      logoUrl: contract.logoUrl,
      footerText: contract.footerText,
      status: contract.status,
      companyName: clientRow?.company || 'Simpler Development',
      signer: {
        id: signer.id,
        name: signer.name,
        email: signer.email,
        role: signer.role,
        status: signer.status,
        signedAt: signer.signedAt,
      },
      allSigners,
    },
  });
}

// POST — sign or decline the contract
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 400 });
  }

  const [signer] = await db.select().from(crmContractSigners)
    .where(eq(crmContractSigners.token, token)).limit(1);

  if (!signer) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [contract] = await db.select().from(crmContracts)
    .where(eq(crmContracts.id, signer.contractId)).limit(1);

  if (!contract || contract.status === 'draft' || contract.status === 'voided') {
    return NextResponse.json({ success: false, message: 'Contract not available' }, { status: 400 });
  }

  if (contract.validUntil && new Date(contract.validUntil) < new Date()) {
    return NextResponse.json({ success: false, message: 'Contract has expired' }, { status: 410 });
  }

  if (signer.status === 'signed') {
    return NextResponse.json({ success: false, message: 'Already signed' }, { status: 400 });
  }

  if (signer.status === 'declined') {
    return NextResponse.json({ success: false, message: 'Already declined' }, { status: 400 });
  }

  const body = await req.json();
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  if (body.action === 'sign') {
    if (!body.signatureName?.trim()) {
      return NextResponse.json({ success: false, message: 'Full name is required' }, { status: 400 });
    }
    if (!body.signatureData) {
      return NextResponse.json({ success: false, message: 'Signature is required' }, { status: 400 });
    }

    // Sign
    await db.update(crmContractSigners).set({
      status: 'signed',
      signatureName: body.signatureName.trim(),
      signatureData: body.signatureData,
      signedAt: new Date(),
      signedIp: clientIp,
    }).where(eq(crmContractSigners.id, signer.id));

    // Check if all signers have signed
    const allSigners = await db.select({ status: crmContractSigners.status })
      .from(crmContractSigners)
      .where(eq(crmContractSigners.contractId, contract.id));

    const allSigned = allSigners.every(s =>
      s.status === 'signed' || (s.status === 'pending' && false) // only count after our update
    );

    // Re-check after our update
    const updatedSigners = await db.select({ status: crmContractSigners.status })
      .from(crmContractSigners)
      .where(eq(crmContractSigners.contractId, contract.id));

    const fullyExecuted = updatedSigners.every(s => s.status === 'signed');

    if (fullyExecuted) {
      await db.update(crmContracts).set({
        status: 'fully_executed',
        fullyExecutedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(crmContracts.id, contract.id));

      emitEvent('proposal.accepted', contract.clientId, 0, {
        id: contract.id,
        title: contract.title,
        type: 'contract',
      });
    } else {
      await db.update(crmContracts).set({
        status: 'partially_signed',
        updatedAt: new Date(),
      }).where(eq(crmContracts.id, contract.id));
    }

    return NextResponse.json({ success: true, fullyExecuted });
  }

  if (body.action === 'decline') {
    await db.update(crmContractSigners).set({
      status: 'declined',
      declinedAt: new Date(),
      declineReason: body.reason?.trim() || null,
    }).where(eq(crmContractSigners.id, signer.id));

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
}
