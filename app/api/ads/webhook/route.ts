/**
 * Ads inbound webhook — POST /api/ads/webhook
 *
 * Public provider callback (no session). Trust comes from
 * `x-ads-signature: hex(HMAC-SHA256(rawBody, ADS_WEBHOOK_SECRET))` plus an
 * explicit clientId inside the signed body. See lib/ads/webhook.ts.
 * Envelope: { success, data | message }.
 */

import { NextResponse } from 'next/server';
import { handleAdsWebhook } from '@/lib/ads/webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.ADS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, message: 'Ads webhook is not configured (ADS_WEBHOOK_SECRET missing)' },
      { status: 503 },
    );
  }

  const rawBody = await request.text().catch(() => null);
  if (rawBody === null) {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  try {
    const result = await handleAdsWebhook({
      rawBody,
      signature: request.headers.get('x-ads-signature'),
      secret,
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lead intake failed';
    const status = message === 'Invalid webhook signature' ? 403 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
