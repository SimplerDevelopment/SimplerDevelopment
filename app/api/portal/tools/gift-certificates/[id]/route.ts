import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { giftCertificates, giftCertificateRedemptions } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [cert] = await db.select().from(giftCertificates)
    .where(and(eq(giftCertificates.id, parseInt(id)), eq(giftCertificates.clientId, client.id)))
    .limit(1);

  if (!cert) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Get redemption history
  const redemptions = await db.select().from(giftCertificateRedemptions)
    .where(eq(giftCertificateRedemptions.giftCertificateId, cert.id))
    .orderBy(desc(giftCertificateRedemptions.createdAt));

  return NextResponse.json({
    success: true,
    data: { ...cert, redemptions },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [cert] = await db.select().from(giftCertificates)
    .where(and(eq(giftCertificates.id, parseInt(id)), eq(giftCertificates.clientId, client.id)))
    .limit(1);

  if (!cert) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.status !== undefined) updates.status = body.status;
  if (body.recipientName !== undefined) updates.recipientName = body.recipientName;
  if (body.recipientEmail !== undefined) updates.recipientEmail = body.recipientEmail;
  if (body.personalMessage !== undefined) updates.personalMessage = body.personalMessage;
  if (body.redeemableAt !== undefined) updates.redeemableAt = body.redeemableAt;
  if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const [updated] = await db.update(giftCertificates)
    .set(updates)
    .where(eq(giftCertificates.id, cert.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
