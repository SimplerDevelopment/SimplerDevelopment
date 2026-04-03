import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  let [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id))
    .limit(1);

  // Create default row if it doesn't exist
  if (!settings) {
    [settings] = await db
      .insert(storeSettings)
      .values({ websiteId: site.id })
      .returning();
  }

  return NextResponse.json({ success: true, data: settings });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    storeName, currency, taxRate, taxInclusive,
    requiresShipping, lowStockThreshold, orderPrefix, enableReviews, enabled,
    // Customer portal fields
    enableCustomerAccounts, enableGuestCheckout, enableWishlist,
    enableOrderTracking, enableCustomerSupport,
    customerPortalWelcomeMessage, supportEmail, returnPolicyUrl, shippingPolicyUrl,
  } = body;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (storeName !== undefined) updateData.storeName = storeName;
  if (currency !== undefined) updateData.currency = currency;
  if (taxRate !== undefined) updateData.taxRate = String(taxRate);
  if (taxInclusive !== undefined) updateData.taxInclusive = taxInclusive;
  if (requiresShipping !== undefined) updateData.requiresShipping = requiresShipping;
  if (lowStockThreshold !== undefined) updateData.lowStockThreshold = lowStockThreshold;
  if (orderPrefix !== undefined) updateData.orderPrefix = orderPrefix;
  if (enableReviews !== undefined) updateData.enableReviews = enableReviews;
  if (enabled !== undefined) updateData.enabled = enabled;
  // Customer portal
  if (enableCustomerAccounts !== undefined) updateData.enableCustomerAccounts = enableCustomerAccounts;
  if (enableGuestCheckout !== undefined) updateData.enableGuestCheckout = enableGuestCheckout;
  if (enableWishlist !== undefined) updateData.enableWishlist = enableWishlist;
  if (enableOrderTracking !== undefined) updateData.enableOrderTracking = enableOrderTracking;
  if (enableCustomerSupport !== undefined) updateData.enableCustomerSupport = enableCustomerSupport;
  if (customerPortalWelcomeMessage !== undefined) updateData.customerPortalWelcomeMessage = customerPortalWelcomeMessage;
  if (supportEmail !== undefined) updateData.supportEmail = supportEmail;
  if (returnPolicyUrl !== undefined) updateData.returnPolicyUrl = returnPolicyUrl;
  if (shippingPolicyUrl !== undefined) updateData.shippingPolicyUrl = shippingPolicyUrl;

  // Upsert: create if not exists, then update
  let [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id))
    .limit(1);

  if (!settings) {
    [settings] = await db
      .insert(storeSettings)
      .values({ websiteId: site.id, ...updateData })
      .returning();
  } else {
    [settings] = await db
      .update(storeSettings)
      .set(updateData)
      .where(eq(storeSettings.websiteId, site.id))
      .returning();
  }

  return NextResponse.json({ success: true, data: settings });
}
