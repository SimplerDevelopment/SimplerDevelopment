import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Check if there's already a Stripe account
  let [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id))
    .limit(1);

  if (!settings) {
    [settings] = await db
      .insert(storeSettings)
      .values({ websiteId: site.id })
      .returning();
  }

  let accountId = settings.stripeAccountId;

  if (!accountId) {
    // Create a new Stripe Connect account
    const account = await stripe.accounts.create({
      type: 'standard',
      metadata: { websiteId: String(site.id) },
    });
    accountId = account.id;

    await db
      .update(storeSettings)
      .set({ stripeAccountId: accountId, updatedAt: new Date() })
      .where(eq(storeSettings.websiteId, site.id));
  }

  const body = await req.json().catch(() => ({}));
  const returnUrl = body.returnUrl || `${process.env.NEXT_PUBLIC_URL}/portal/websites/${site.id}/store/settings`;
  const refreshUrl = body.refreshUrl || returnUrl;

  // Create an account link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return NextResponse.json({
    success: true,
    data: { url: accountLink.url, accountId },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id))
    .limit(1);

  if (!settings?.stripeAccountId) {
    return NextResponse.json({
      success: true,
      data: { connected: false, onboardingComplete: false, accountId: null },
    });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const account = await stripe.accounts.retrieve(settings.stripeAccountId);

  const onboardingComplete = !!(account.charges_enabled && account.payouts_enabled);

  // Update local flag if onboarding has been completed
  if (onboardingComplete && !settings.stripeOnboardingComplete) {
    await db
      .update(storeSettings)
      .set({ stripeOnboardingComplete: true, updatedAt: new Date() })
      .where(eq(storeSettings.websiteId, site.id));
  }

  return NextResponse.json({
    success: true,
    data: {
      connected: true,
      onboardingComplete,
      accountId: settings.stripeAccountId,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    },
  });
}
