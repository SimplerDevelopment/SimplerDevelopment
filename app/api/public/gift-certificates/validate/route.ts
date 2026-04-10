import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftCertificates } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, context } = body;
    // context: 'booking' | 'store' — determines if the cert is redeemable here

    if (!code) {
      return NextResponse.json({ success: false, message: 'Gift certificate code is required' }, { status: 400 });
    }

    const redeemContext = context === 'store' ? 'store' : 'booking';

    const [cert] = await db.select({
      id: giftCertificates.id,
      code: giftCertificates.code,
      initialAmount: giftCertificates.initialAmount,
      remainingAmount: giftCertificates.remainingAmount,
      status: giftCertificates.status,
      redeemableAt: giftCertificates.redeemableAt,
      expiresAt: giftCertificates.expiresAt,
    }).from(giftCertificates)
      .where(and(
        eq(giftCertificates.code, code.toUpperCase()),
        eq(giftCertificates.status, 'active'),
        sql`${giftCertificates.redeemableAt} IN (${redeemContext}, 'both')`,
      ))
      .limit(1);

    if (!cert) {
      return NextResponse.json({ success: false, message: 'Invalid or inactive gift certificate' }, { status: 400 });
    }

    if (cert.expiresAt && new Date() > cert.expiresAt) {
      return NextResponse.json({ success: false, message: 'This gift certificate has expired' }, { status: 400 });
    }

    if (cert.remainingAmount <= 0) {
      return NextResponse.json({ success: false, message: 'This gift certificate has been fully redeemed' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        code: cert.code,
        initialAmount: cert.initialAmount,
        remainingAmount: cert.remainingAmount,
      },
    });
  } catch (err) {
    console.error('Gift certificate validate error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
