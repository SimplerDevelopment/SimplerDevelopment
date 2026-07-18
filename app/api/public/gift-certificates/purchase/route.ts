import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftCertificates, clientWebsites, storeSettings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

function generateCertCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CERT-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      websiteId: rawWebsiteId,
      amount, // cents
      purchaserName, purchaserEmail,
      recipientName, recipientEmail, personalMessage,
      redeemableAt, // 'booking' | 'store' | 'both'
    } = body;

    const websiteId = parseInt(String(rawWebsiteId), 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'websiteId is required' }, { status: 400 });
    }
    if (!amount || amount < 100) {
      return NextResponse.json({ success: false, message: 'Minimum amount is $1.00' }, { status: 400 });
    }
    if (!purchaserName?.trim() || !purchaserEmail?.trim()) {
      return NextResponse.json({ success: false, message: 'Purchaser name and email are required' }, { status: 400 });
    }

    // Resolve website and client
    const [website] = await db.select().from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.active, true)))
      .limit(1);

    if (!website) {
      return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });
    }

    // Generate unique code
    let code = generateCertCode();
    // Ensure uniqueness (unlikely collision but be safe)
    for (let i = 0; i < 5; i++) {
      const [existing] = await db.select({ id: giftCertificates.id }).from(giftCertificates)
        .where(eq(giftCertificates.code, code)).limit(1);
      if (!existing) break;
      code = generateCertCode();
    }

    // Create the certificate record
    const [cert] = await db.insert(giftCertificates).values({
      clientId: website.clientId,
      websiteId: website.id,
      code,
      initialAmount: amount,
      remainingAmount: amount,
      status: 'pending_payment',
      purchaserName: purchaserName.trim(),
      purchaserEmail: purchaserEmail.trim(),
      recipientName: recipientName?.trim() || null,
      recipientEmail: recipientEmail?.trim() || null,
      personalMessage: personalMessage?.trim() || null,
      redeemableAt: redeemableAt || 'both',
    }).returning();

    // Create Stripe PaymentIntent
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // Check if website has Stripe Connect
    const [store] = await db.select().from(storeSettings)
      .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
      .limit(1);

    let stripeParams: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount,
      currency: 'usd',
      metadata: {
        type: 'gift_certificate',
        giftCertificateId: String(cert.id),
        websiteId: String(websiteId),
        clientId: String(website.clientId),
      },
    };

    if (store?.stripeAccountId && store.stripeOnboardingComplete) {
      const platformFeePercent = store.platformFeePercent ? parseFloat(store.platformFeePercent) : 5;
      const applicationFee = Math.round(amount * (platformFeePercent / 100));

      stripeParams = {
        ...stripeParams,
        currency: store.currency?.toLowerCase() || 'usd',
        application_fee_amount: applicationFee,
        transfer_data: { destination: store.stripeAccountId },
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(stripeParams);

    await db.update(giftCertificates)
      .set({ stripePaymentIntentId: paymentIntent.id })
      .where(eq(giftCertificates.id, cert.id));

    return NextResponse.json({
      success: true,
      data: {
        id: cert.id,
        code: cert.code,
        amount: cert.initialAmount,
        clientSecret: paymentIntent.client_secret,
      },
    });
  } catch (err) {
    console.error('Gift certificate purchase error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
