import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/api-key';

type StoreSettingsRow = typeof storeSettings.$inferSelect;

function shapeShipFromAddress(input: unknown): { ok: true; value: StoreSettingsRow['shipFromAddress'] | null } | { ok: false; reason: string } {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'shipFromAddress must be an object or null' };
  }
  const obj = input as Record<string, unknown>;
  const required = ['line1', 'city', 'state', 'postalCode', 'country'] as const;
  for (const key of required) {
    if (typeof obj[key] !== 'string' || (obj[key] as string).trim().length === 0) {
      return { ok: false, reason: `shipFromAddress.${key} is required` };
    }
  }
  const out: Record<string, unknown> = {
    line1: obj.line1,
    city: obj.city,
    state: obj.state,
    postalCode: obj.postalCode,
    country: obj.country,
  };
  for (const opt of ['name', 'company', 'line2', 'phone'] as const) {
    if (obj[opt] !== undefined && obj[opt] !== null) {
      if (typeof obj[opt] !== 'string') {
        return { ok: false, reason: `shipFromAddress.${opt} must be a string` };
      }
      out[opt] = obj[opt];
    }
  }
  return { ok: true, value: out as StoreSettingsRow['shipFromAddress'] };
}

function projectSettings(s: StoreSettingsRow) {
  let easypostApiKeyConfigured = false;
  let easypostApiKeyLast4: string | null = null;
  if (s.easypostApiKeyEncrypted) {
    try {
      const plaintext = decryptApiKey(s.easypostApiKeyEncrypted);
      easypostApiKeyConfigured = true;
      easypostApiKeyLast4 = plaintext.slice(-4);
    } catch (err) {
      console.warn('[store/settings] easypost api key decrypt failed', err);
      easypostApiKeyConfigured = false;
      easypostApiKeyLast4 = null;
    }
  }
  // Strip the ciphertext from the response — never ship it to the client.
  const { easypostApiKeyEncrypted: _ciphertext, ...rest } = s;
  void _ciphertext;
  return {
    ...rest,
    easypostApiKeyConfigured,
    easypostApiKeyLast4,
  };
}

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

  return NextResponse.json({ success: true, data: projectSettings(settings) });
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
    // Shipping provider fields
    shippingProvider,
    easypostApiKeyPlaintext,
    easypostApiKeyClear,
    easypostMode,
    easypostWebhookSecret,
    shipFromAddress,
    defaultParcelLengthIn,
    defaultParcelWidthIn,
    defaultParcelHeightIn,
    defaultParcelWeightOz,
    liveRatesFallback,
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

  // Shipping provider fields ────────────────────────────────────────────
  const warnings: string[] = [];

  if (shippingProvider !== undefined) {
    if (shippingProvider !== 'manual' && shippingProvider !== 'easypost') {
      return NextResponse.json(
        { success: false, message: "shippingProvider must be 'manual' or 'easypost'" },
        { status: 400 },
      );
    }
    updateData.shippingProvider = shippingProvider;
  }

  if (easypostMode !== undefined) {
    if (easypostMode !== 'test' && easypostMode !== 'production') {
      return NextResponse.json(
        { success: false, message: "easypostMode must be 'test' or 'production'" },
        { status: 400 },
      );
    }
    updateData.easypostMode = easypostMode;
  }

  if (easypostWebhookSecret !== undefined) {
    updateData.easypostWebhookSecret = easypostWebhookSecret;
  }

  // Clear takes precedence over plaintext — if both arrive, clear wins.
  if (easypostApiKeyClear === true) {
    updateData.easypostApiKeyEncrypted = null;
    if (typeof easypostApiKeyPlaintext === 'string' && easypostApiKeyPlaintext.length > 0) {
      warnings.push('easypostApiKeyPlaintext was ignored because easypostApiKeyClear=true was also set');
    }
  } else if (typeof easypostApiKeyPlaintext === 'string' && easypostApiKeyPlaintext.length > 0) {
    // Don't trim — keys can have specific format and trailing chars
    updateData.easypostApiKeyEncrypted = encryptApiKey(easypostApiKeyPlaintext);
  }

  if (shipFromAddress !== undefined) {
    const shaped = shapeShipFromAddress(shipFromAddress);
    if (!shaped.ok) {
      return NextResponse.json({ success: false, message: shaped.reason }, { status: 400 });
    }
    updateData.shipFromAddress = shaped.value;
  }

  const numericFields = [
    ['defaultParcelLengthIn', defaultParcelLengthIn],
    ['defaultParcelWidthIn', defaultParcelWidthIn],
    ['defaultParcelHeightIn', defaultParcelHeightIn],
    ['defaultParcelWeightOz', defaultParcelWeightOz],
  ] as const;
  for (const [key, value] of numericFields) {
    if (value === undefined) continue;
    if (value === null) {
      updateData[key] = null;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return NextResponse.json(
        { success: false, message: `${key} must be a non-negative number or null` },
        { status: 400 },
      );
    }
    updateData[key] = String(value);
  }

  if (liveRatesFallback !== undefined) {
    if (typeof liveRatesFallback !== 'boolean') {
      return NextResponse.json(
        { success: false, message: 'liveRatesFallback must be a boolean' },
        { status: 400 },
      );
    }
    updateData.liveRatesFallback = liveRatesFallback;
  }

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

  return NextResponse.json({
    success: true,
    data: projectSettings(settings),
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
