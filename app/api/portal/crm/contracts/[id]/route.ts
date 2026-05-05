import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigners } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import crypto from 'crypto';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const [contract] = await db.select().from(crmContracts)
    .where(and(eq(crmContracts.id, parseInt(id, 10)), eq(crmContracts.clientId, client.id)));

  if (!contract) return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });

  const signers = await db.select().from(crmContractSigners)
    .where(eq(crmContractSigners.contractId, contract.id));

  return NextResponse.json({ success: true, data: { ...contract, signers } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const contractId = parseInt(id, 10);
  const body = await req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.clauses !== undefined) updates.clauses = body.clauses;
  if (body.lineItems !== undefined) updates.lineItems = body.lineItems;
  if (body.fees !== undefined) updates.fees = body.fees;
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.validUntil !== undefined) updates.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  if (body.contactId !== undefined) updates.contactId = body.contactId || null;
  if (body.companyId !== undefined) updates.companyId = body.companyId || null;
  if (body.dealId !== undefined) updates.dealId = body.dealId || null;
  if (body.accentColor !== undefined) updates.accentColor = body.accentColor;
  if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;
  if (body.footerText !== undefined) updates.footerText = body.footerText;

  const [updated] = await db.update(crmContracts)
    .set(updates)
    .where(and(eq(crmContracts.id, contractId), eq(crmContracts.clientId, client.id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });

  // Update signers if provided
  if (body.signers && Array.isArray(body.signers)) {
    // Remove existing signers that aren't signed yet
    const existing = await db.select().from(crmContractSigners)
      .where(eq(crmContractSigners.contractId, contractId));

    for (const s of existing) {
      if (s.status === 'pending') {
        await db.delete(crmContractSigners).where(eq(crmContractSigners.id, s.id));
      }
    }

    // Add new signers
    for (const signer of body.signers) {
      if (!signer.name?.trim() || !signer.email?.trim()) continue;
      // Skip if already exists and signed
      const alreadySigned = existing.find(e => e.email === signer.email && e.status === 'signed');
      if (alreadySigned) continue;

      const signerToken = crypto.randomBytes(32).toString('hex');
      await db.insert(crmContractSigners).values({
        contractId,
        name: signer.name.trim(),
        email: signer.email.trim(),
        role: signer.role || 'signer',
        order: signer.order || 0,
        token: signerToken,
      });
    }
  }

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (isNaN(contractId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmContracts)
    .where(and(eq(crmContracts.id, contractId), eq(crmContracts.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
