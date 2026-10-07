import { NextResponse } from 'next/server';
import { processStorePayment, StorePaymentError, type StorePaymentEvent } from '@/lib/store/payment-events';
import { resolveSiteStripe, SiteStripeError, type SiteStripeContext } from '@/lib/stripe/site-stripe';
import { getStripeClient } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // `?siteId=N` is REQUIRED for BYOK (each tenant registers their own per-site URL)
  // and OPTIONAL for Connect (the platform webhook URL is shared across all connected
  // accounts and was registered before BYOK existed). When absent, we verify against
  // the platform's signing secret and then derive siteId from the event's metadata.
  const url = new URL(req.url);
  const siteIdRaw = url.searchParams.get('siteId');
  const querySiteId = siteIdRaw ? parseInt(siteIdRaw, 10) : NaN;
  const hasQuerySiteId = !!siteIdRaw && Number.isFinite(querySiteId) && querySiteId > 0;

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  // Pick the signing secret + Stripe client for signature verification:
  //  - With ?siteId: per-site BYOK secret OR per-site Connect (same platform secret)
  //  - Without ?siteId: platform-only path (legacy Connect URL still in Stripe dashboard)
  let ctx: SiteStripeContext | null = null;
  let signingSecret: string | null = null;
  let stripeForVerify: import('stripe').default;

  if (hasQuerySiteId) {
    try {
      ctx = await resolveSiteStripe(querySiteId);
    } catch (err) {
      if (err instanceof SiteStripeError) {
        return NextResponse.json(
          { success: false, message: err.message, code: err.code },
          { status: 400 },
        );
      }
      console.error('[stripe/webhook/ecommerce] resolveSiteStripe error:', err);
      return NextResponse.json(
        { success: false, message: 'Failed to resolve site Stripe context', code: 'resolver_error' },
        { status: 500 },
      );
    }
    signingSecret = ctx.mode === 'byok'
      ? ctx.webhookSecret
      : process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET ?? null;
    stripeForVerify = ctx.stripe;
  } else {
    // Legacy Connect path — siteId comes from event metadata after we verify.
    signingSecret = process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET ?? null;
    stripeForVerify = getStripeClient();
  }

  if (!signingSecret) {
    return NextResponse.json(
      { success: false, message: 'Webhook secret not configured', code: 'no_secret' },
      { status: 500 },
    );
  }

  // Verify signature. constructEvent is local HMAC — no network call.
  let event: import('stripe').default.Event;
  try {
    event = stripeForVerify.webhooks.constructEvent(body, sig, signingSecret);
  } catch (err) {
    const Stripe = (await import('stripe')).default;
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
      return NextResponse.json(
        { success: false, message: 'Invalid signature', code: 'invalid_signature' },
        { status: 401 },
      );
    }
    console.error('[stripe/webhook/ecommerce] constructEvent error:', err);
    return NextResponse.json(
      { success: false, message: 'Invalid signature', code: 'invalid_signature' },
      { status: 401 },
    );
  }

  // Derive the canonical websiteId. With ?siteId we already have it; without,
  // pull it from the event object's metadata (set by the checkout route).
  let websiteId: number;
  if (hasQuerySiteId) {
    websiteId = querySiteId;
  } else {
    const eventObj = event.data.object as { metadata?: { websiteId?: string } };
    const metaWebsiteId = eventObj?.metadata?.websiteId
      ? parseInt(eventObj.metadata.websiteId, 10)
      : NaN;
    if (!Number.isFinite(metaWebsiteId) || metaWebsiteId <= 0) {
      // Not an ecommerce-related event (or missing metadata). Acknowledge so Stripe
      // doesn't retry, but skip processing.
      return NextResponse.json({ received: true, skipped: 'no_website_id' });
    }
    websiteId = metaWebsiteId;

    // Resolve context lazily for the metadata-derived siteId. If this site is in
    // BYOK mode, that's a misrouted event (BYOK tenants should be using the
    // per-site URL, not the platform URL). Acknowledge & skip — do not process.
    try {
      ctx = await resolveSiteStripe(websiteId);
    } catch (err) {
      if (err instanceof SiteStripeError) {
        console.warn('[stripe/webhook/ecommerce] resolveSiteStripe after metadata derive:', err.code);
        return NextResponse.json({ received: true, skipped: err.code });
      }
      throw err;
    }
    if (ctx.mode === 'byok') {
      console.warn('[stripe/webhook/ecommerce] event arrived on platform URL for BYOK site', websiteId);
      return NextResponse.json({ received: true, skipped: 'byok_via_platform_url' });
    }
  }

  try {
    await processStorePayment(event as unknown as StorePaymentEvent, websiteId);
    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    if (err instanceof StorePaymentError) return NextResponse.json({ success: false, message: err.message, code: err.code }, { status: 400 });
    console.error('[stripe/webhook/ecommerce] error:', err instanceof Error ? err.message : 'unknown error');
    // No event claim survives a rolled-back transaction. Stripe can retry the
    // entire unit safely after DB/provider errors.
    return NextResponse.json({ error: 'webhook_error' }, { status: 500 });
  }
}
