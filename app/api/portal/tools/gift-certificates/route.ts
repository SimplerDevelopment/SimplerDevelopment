import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { giftCertificates, giftCertificateRedemptions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import crypto from 'crypto';

function generateCertCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CERT-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const certs = await db.select().from(giftCertificates)
    .where(eq(giftCertificates.clientId, client.id))
    .orderBy(desc(giftCertificates.createdAt));

  return NextResponse.json({ success: true, data: certs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    amount, websiteId,
    purchaserName, purchaserEmail,
    recipientName, recipientEmail, personalMessage,
    redeemableAt,
  } = body;

  if (!amount || amount < 100) {
    return NextResponse.json({ success: false, message: 'Minimum amount is $1.00 (100 cents)' }, { status: 400 });
  }

  // Generate unique code
  let code = generateCertCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select({ id: giftCertificates.id }).from(giftCertificates)
      .where(eq(giftCertificates.code, code)).limit(1);
    if (!existing) break;
    code = generateCertCode();
  }

  // Admin-created certs are immediately active (no payment needed)
  const [cert] = await db.insert(giftCertificates).values({
    clientId: client.id,
    websiteId: websiteId || null,
    code,
    initialAmount: amount,
    remainingAmount: amount,
    status: 'active',
    paymentStatus: 'paid', // admin gift — no payment required
    purchaserName: purchaserName || client.company || 'Admin',
    purchaserEmail: purchaserEmail || '',
    recipientName: recipientName || null,
    recipientEmail: recipientEmail || null,
    personalMessage: personalMessage || null,
    redeemableAt: redeemableAt || 'both',
  }).returning();

  return NextResponse.json({ success: true, data: cert }, { status: 201 });
}
