import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/api-key';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

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

  // Stripe BYOK projection — never ship ciphertext or plaintext keys.
  let stripeSecretKeyLast4: string | null = null;
  if (s.stripeSecretKeyEncrypted) {
    try {
      const plaintext = decryptApiKey(s.stripeSecretKeyEncrypted);
      stripeSecretKeyLast4 = plaintext.slice(-4);
    } catch (err) {
      console.warn('[store/settings] stripe secret key decrypt failed', err);
      stripeSecretKeyLast4 = null;
    }
  }
  const stripeSecretKeyConfigured = !!s.stripeSecretKeyEncrypted;
  const stripeWebhookSecretConfigured = !!s.stripeWebhookSecretEncrypted;

  // Printful API key projection — never ship ciphertext or plaintext key.
  let printfulApiKeyConfigured = false;
  let printfulApiKeyLast4: string | null = null;
  if (s.printfulApiKeyEncrypted) {
    try {
      const plaintext = decryptApiKey(s.printfulApiKeyEncrypted);
      printfulApiKeyConfigured = true;
      printfulApiKeyLast4 = plaintext.slice(-4);
    } catch (err) {
      console.warn('[store/settings] printful api key decrypt failed', err);
      printfulApiKeyConfigured = false;
      printfulApiKeyLast4 = null;
    }
  }

  // Strip ciphertext columns from the response — never ship them to the client.
  const {
    easypostApiKeyEncrypted: _easypostCt,
    stripeSecretKeyEncrypted: _stripeSecretCt,
    stripeWebhookSecretEncrypted: _stripeWebhookCt,
    printfulApiKeyEncrypted: _printfulCt,
    ...rest
  } = s;
  void _easypostCt;
  void _stripeSecretCt;
  void _stripeWebhookCt;
  void _printfulCt;
  return {
    ...rest,
    easypostApiKeyConfigured,
    easypostApiKeyLast4,
    stripeSecretKeyConfigured,
    stripeSecretKeyLast4,
    stripeWebhookSecretConfigured,
    printfulApiKeyConfigured,
    printfulApiKeyLast4,
  };
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

  const authResult = await authorizePortal({ action: 'write', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

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
    // Stripe BYOK fields
    stripeMode,
    stripeSecretKeyPlaintext,
    stripeSecretKeyClear,
    stripePublishableKey,
    stripeWebhookSecretPlaintext,
    stripeWebhookSecretClear,
    // Printful fulfillment fields
    fulfillmentProvider,
    printfulApiKeyPlaintext,
    printfulApiKeyClear,
    printfulStoreId,
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

  // Stripe BYOK fields ──────────────────────────────────────────────────
  // Load existing settings first — we need stripeByokAllowed to gate stripeMode='byok'.
  let [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id))
    .limit(1);

  if (stripeMode !== undefined) {
    if (stripeMode !== 'connect' && stripeMode !== 'byok') {
      return NextResponse.json(
        { success: false, message: "stripeMode must be 'connect' or 'byok'" },
        { status: 400 },
      );
    }
    if (stripeMode === 'byok' && settings?.stripeByokAllowed !== true) {
      return NextResponse.json(
        { success: false, message: 'BYOK not enabled for this site by SimplerDevelopment admin' },
        { status: 403 },
      );
    }
    updateData.stripeMode = stripeMode;
  }

  if (stripeSecretKeyClear === true) {
    updateData.stripeSecretKeyEncrypted = null;
    if (typeof stripeSecretKeyPlaintext === 'string' && stripeSecretKeyPlaintext.length > 0) {
      warnings.push('stripeSecretKeyPlaintext was ignored because stripeSecretKeyClear=true was also set');
    }
  } else if (typeof stripeSecretKeyPlaintext === 'string' && stripeSecretKeyPlaintext.length > 0) {
    if (!stripeSecretKeyPlaintext.startsWith('sk_test_') && !stripeSecretKeyPlaintext.startsWith('sk_live_')) {
      return NextResponse.json(
        { success: false, message: 'stripeSecretKeyPlaintext must start with sk_test_ or sk_live_' },
        { status: 400 },
      );
    }
    updateData.stripeSecretKeyEncrypted = encryptApiKey(stripeSecretKeyPlaintext);
  }

  if (stripePublishableKey !== undefined) {
    if (stripePublishableKey === null || stripePublishableKey === '') {
      updateData.stripePublishableKey = null;
    } else if (typeof stripePublishableKey !== 'string') {
      return NextResponse.json(
        { success: false, message: 'stripePublishableKey must be a string or null' },
        { status: 400 },
      );
    } else if (!stripePublishableKey.startsWith('pk_test_') && !stripePublishableKey.startsWith('pk_live_')) {
      return NextResponse.json(
        { success: false, message: 'stripePublishableKey must start with pk_test_ or pk_live_' },
        { status: 400 },
      );
    } else {
      updateData.stripePublishableKey = stripePublishableKey;
    }
  }

  if (stripeWebhookSecretClear === true) {
    updateData.stripeWebhookSecretEncrypted = null;
    if (typeof stripeWebhookSecretPlaintext === 'string' && stripeWebhookSecretPlaintext.length > 0) {
      warnings.push('stripeWebhookSecretPlaintext was ignored because stripeWebhookSecretClear=true was also set');
    }
  } else if (typeof stripeWebhookSecretPlaintext === 'string' && stripeWebhookSecretPlaintext.length > 0) {
    if (!stripeWebhookSecretPlaintext.startsWith('whsec_')) {
      return NextResponse.json(
        { success: false, message: 'stripeWebhookSecretPlaintext must start with whsec_' },
        { status: 400 },
      );
    }
    updateData.stripeWebhookSecretEncrypted = encryptApiKey(stripeWebhookSecretPlaintext);
  }

  // Printful fulfillment fields ─────────────────────────────────────────────
  if (fulfillmentProvider !== undefined) {
    if (fulfillmentProvider !== 'manual' && fulfillmentProvider !== 'printful') {
      return NextResponse.json(
        { success: false, message: "fulfillmentProvider must be 'manual' or 'printful'" },
        { status: 400 },
      );
    }
    updateData.fulfillmentProvider = fulfillmentProvider;
  }

  if (printfulStoreId !== undefined) {
    updateData.printfulStoreId = printfulStoreId === '' ? null : printfulStoreId;
  }

  // Clear takes precedence over plaintext — if both arrive, clear wins.
  if (printfulApiKeyClear === true) {
    updateData.printfulApiKeyEncrypted = null;
    if (typeof printfulApiKeyPlaintext === 'string' && printfulApiKeyPlaintext.length > 0) {
      warnings.push('printfulApiKeyPlaintext was ignored because printfulApiKeyClear=true was also set');
    }
  } else if (typeof printfulApiKeyPlaintext === 'string' && printfulApiKeyPlaintext.length > 0) {
    updateData.printfulApiKeyEncrypted = encryptApiKey(printfulApiKeyPlaintext);
  }

  // Upsert: create if not exists, then update

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
