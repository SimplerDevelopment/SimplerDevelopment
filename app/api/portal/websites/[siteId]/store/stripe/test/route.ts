import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/lib/auth';
import { resolveClientSite } from '@/lib/portal-client';
import { resolveSiteStripe, SiteStripeError } from '@/lib/stripe/site-stripe';

/**
 * Connection test for a tenant's BYOK Stripe configuration.
 *
 * Resolves the site-scoped Stripe client via `resolveSiteStripe`, then calls
 * `stripe.accounts.retrieve()` (no arg) so the API key authenticates against
 * the account it was issued for. Surfaces account-level signals (charges /
 * payouts enabled, default currency, country, business name) plus a boolean
 * `webhookConfigured` flag so the operator can confirm both halves of the
 * BYOK wiring before any real transactions flow through.
 *
 * Connect-mode sites are rejected with `code: 'not_byok'` — the existing
 * `/store/stripe-connect` GET handler is the source of truth for Connect
 * onboarding state.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  let ctx;
  try {
    ctx = await resolveSiteStripe(site.id);
  } catch (err) {
    if (err instanceof SiteStripeError) {
      return NextResponse.json(
        { success: false, message: err.message, code: err.code },
        { status: 400 },
      );
    }
    throw err;
  }

  if (ctx.mode === 'connect') {
    return NextResponse.json(
      {
        success: false,
        message: 'Stripe BYOK is not enabled for this site',
        code: 'not_byok',
      },
      { status: 400 },
    );
  }

  try {
    const account = await ctx.stripe.accounts.retrieve();
    return NextResponse.json({
      success: true,
      data: {
        account: {
          id: account.id,
          business_name:
            account.business_profile?.name ?? account.business_profile?.support_email ?? null,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          default_currency: account.default_currency,
          country: account.country,
        },
        webhookConfigured: !!ctx.webhookSecret,
      },
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeAuthenticationError) {
      return NextResponse.json(
        { success: false, message: 'Invalid Stripe secret key', code: 'auth' },
        { status: 400 },
      );
    }
    if (err instanceof Stripe.errors.StripePermissionError) {
      return NextResponse.json(
        {
          success: false,
          message: 'Stripe key is missing required permissions',
          code: 'permission',
        },
        { status: 400 },
      );
    }
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, message: err.message, code: 'stripe_error' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
