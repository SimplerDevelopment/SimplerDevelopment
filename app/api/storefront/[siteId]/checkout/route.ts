import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  carts, cartItems, products, productVariants,
  bulkPricingRules, shippingRates, shippingZones, discountCodes,
  orders, orderItems, orderStatusHistory,
  giftCertificates, giftCertificateRedemptions,
} from '@/lib/db/schema';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { resolveSiteStripe, SiteStripeError, type SiteStripeContext } from '@/lib/stripe/site-stripe';
import { revalidateAdminDashboard } from '@/lib/admin/dashboard-cache';

function generateOrderNumber(prefix: string, lastNumber: string | null): string {
  if (!lastNumber) {
    return `${prefix}-0001`;
  }
  // Extract numeric part after the prefix
  const parts = lastNumber.split('-');
  const num = parseInt(parts[parts.length - 1], 10) || 0;
  return `${prefix}-${String(num + 1).padStart(4, '0')}`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    // Resolve per-site Stripe context (Connect vs BYOK). Resolver throws
    // SiteStripeError for resolver-fatal conditions (no_settings,
    // byok_no_key, byok_decrypt_failed) — surface those as 400s.
    let ctx: SiteStripeContext;
    try {
      ctx = await resolveSiteStripe(websiteId);
    } catch (err) {
      if (err instanceof SiteStripeError) {
        const status = err.code === 'no_settings' ? 404 : 400;
        return NextResponse.json(
          { success: false, message: err.message, code: err.code },
          { status },
        );
      }
      throw err;
    }

    const store = ctx.settings;
    if (!store.enabled) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    // Connect mode: still require completed onboarding + destination acct.
    // BYOK mode: resolver already verified key presence; no extra gating here.
    if (ctx.mode === 'connect') {
      if (!ctx.stripeAccountId || !store.stripeOnboardingComplete) {
        return NextResponse.json(
          { success: false, message: 'Store has not completed Stripe Connect onboarding' },
          { status: 400 },
        );
      }
    }

    const body = await req.json();
    const {
      sessionId, customerEmail, customerName, customerPhone,
      shippingAddress, billingAddress, shippingRateId,
      discountCode, customerNote, giftCertificateCode,
    } = body;

    if (!sessionId || !customerEmail || !customerName) {
      return NextResponse.json({ success: false, message: 'sessionId, customerEmail, and customerName are required' }, { status: 400 });
    }

    // 1. Load cart
    const [cart] = await db.select().from(carts)
      .where(and(
        eq(carts.websiteId, websiteId),
        eq(carts.sessionId, sessionId),
        eq(carts.status, 'active'),
      ))
      .limit(1);

    if (!cart) {
      return NextResponse.json({ success: false, message: 'Cart not found' }, { status: 404 });
    }

    const items = await db.select({
      id: cartItems.id,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      designId: cartItems.designId,
      quantity: cartItems.quantity,
      unitPrice: cartItems.unitPrice,
    })
      .from(cartItems)
      .where(eq(cartItems.cartId, cart.id));

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: 'Cart is empty' }, { status: 400 });
    }

    // Load product details for each item
    const productIds = [...new Set(items.map(i => i.productId))];
    const productRows = await db.select().from(products)
      .where(sql`${products.id} IN ${productIds}`);
    const productMap = Object.fromEntries(productRows.map(p => [p.id, p]));

    // Load variant details
    const variantIds = items.filter(i => i.variantId).map(i => i.variantId!);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let variantMap: Record<number, any> = {};
    if (variantIds.length > 0) {
      const variantRows = await db.select().from(productVariants)
        .where(sql`${productVariants.id} IN ${variantIds}`);
      variantMap = Object.fromEntries(variantRows.map(v => [v.id, v]));
    }

    // 2. Calculate subtotal with bulk pricing
    let subtotal = 0;
    const orderItemsData: {
      productId: number;
      variantId: number | null;
      designId: string | null;
      productName: string;
      variantName: string | null;
      sku: string | null;
      unitPrice: number;
      quantity: number;
      total: number;
    }[] = [];

    for (const item of items) {
      const product = productMap[item.productId];
      if (!product || product.status !== 'active') {
        return NextResponse.json({
          success: false,
          message: `Product "${product?.name || item.productId}" is no longer available`,
        }, { status: 400 });
      }

      // Validate stock
      if (product.trackInventory) {
        const stock = item.variantId
          ? (variantMap[item.variantId]?.quantity ?? 0)
          : product.quantity;
        if (item.quantity > stock) {
          return NextResponse.json({
            success: false,
            message: `Insufficient stock for "${product.name}". Only ${stock} available.`,
          }, { status: 400 });
        }
      }

      let unitPrice = item.variantId
        ? (variantMap[item.variantId]?.price ?? item.unitPrice)
        : product.price;

      // Check bulk pricing
      const bulkRules = await db.select().from(bulkPricingRules)
        .where(and(
          eq(bulkPricingRules.productId, item.productId),
          item.variantId
            ? eq(bulkPricingRules.variantId, item.variantId)
            : sql`${bulkPricingRules.variantId} IS NULL`,
        ))
        .orderBy(desc(bulkPricingRules.minQuantity));

      for (const rule of bulkRules) {
        const maxOk = rule.maxQuantity === null || item.quantity <= rule.maxQuantity;
        if (item.quantity >= rule.minQuantity && maxOk) {
          if (rule.priceType === 'fixed') {
            unitPrice = rule.amount;
          } else if (rule.priceType === 'percent_off') {
            unitPrice = Math.round(unitPrice * (1 - rule.amount / 10000));
          }
          break;
        }
      }

      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      const variant = item.variantId ? variantMap[item.variantId] : null;
      orderItemsData.push({
        productId: item.productId,
        variantId: item.variantId,
        designId: item.designId,
        productName: product.name,
        variantName: variant?.name || null,
        sku: variant?.sku || product.sku || null,
        unitPrice,
        quantity: item.quantity,
        total: lineTotal,
      });
    }

    // 3. Calculate shipping
    let shippingTotal = 0;
    let shippingMethodName: string | null = null;

    if (shippingRateId) {
      const [rate] = await db.select({
        id: shippingRates.id,
        name: shippingRates.name,
        price: shippingRates.price,
        rateType: shippingRates.rateType,
        freeAbove: shippingRates.freeAbove,
        zoneWebsiteId: shippingZones.websiteId,
      })
        .from(shippingRates)
        .innerJoin(shippingZones, eq(shippingZones.id, shippingRates.zoneId))
        .where(and(
          eq(shippingRates.id, shippingRateId),
          eq(shippingZones.websiteId, websiteId),
          eq(shippingRates.active, true),
        ))
        .limit(1);

      if (!rate) {
        return NextResponse.json({ success: false, message: 'Invalid shipping rate' }, { status: 400 });
      }

      shippingMethodName = rate.name;

      if (rate.rateType === 'free' || (rate.freeAbove && subtotal >= rate.freeAbove)) {
        shippingTotal = 0;
      } else {
        shippingTotal = rate.price;
      }
    }

    // 4. Apply discount code
    let discountTotal = 0;
    let appliedDiscountCode: string | null = null;

    if (discountCode) {
      const [discount] = await db.select().from(discountCodes)
        .where(and(
          eq(discountCodes.websiteId, websiteId),
          eq(discountCodes.code, discountCode),
          eq(discountCodes.active, true),
          sql`${discountCodes.applicableTo} IN ('store', 'both')`,
        ))
        .limit(1);

      if (!discount) {
        return NextResponse.json({ success: false, message: 'Invalid discount code' }, { status: 400 });
      }

      const now = new Date();
      if (discount.startsAt && now < discount.startsAt) {
        return NextResponse.json({ success: false, message: 'Discount code is not yet active' }, { status: 400 });
      }
      if (discount.expiresAt && now > discount.expiresAt) {
        return NextResponse.json({ success: false, message: 'Discount code has expired' }, { status: 400 });
      }
      if (discount.maxUses && discount.usedCount >= discount.maxUses) {
        return NextResponse.json({ success: false, message: 'Discount code has been fully redeemed' }, { status: 400 });
      }
      if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
        return NextResponse.json({
          success: false,
          message: `Minimum order amount of ${discount.minOrderAmount} not met`,
        }, { status: 400 });
      }

      appliedDiscountCode = discount.code;

      if (discount.discountType === 'percent') {
        discountTotal = Math.round(subtotal * (discount.amount / 10000));
      } else if (discount.discountType === 'fixed_amount') {
        discountTotal = Math.min(discount.amount, subtotal);
      } else if (discount.discountType === 'free_shipping') {
        discountTotal = shippingTotal;
        shippingTotal = 0;
      }
    }

    // 4b. Apply gift certificate
    let giftCertAmount = 0;
    let appliedGiftCertCode: string | null = null;
    let appliedGiftCertId: number | null = null;

    if (giftCertificateCode) {
      const [cert] = await db.select().from(giftCertificates)
        .where(and(
          eq(giftCertificates.code, giftCertificateCode.toUpperCase()),
          eq(giftCertificates.status, 'active'),
          eq(giftCertificates.websiteId, websiteId),
          sql`${giftCertificates.redeemableAt} IN ('store', 'both')`,
        ))
        .limit(1);

      if (cert && cert.remainingAmount > 0) {
        const afterDiscount = subtotal - discountTotal;
        giftCertAmount = Math.min(cert.remainingAmount, afterDiscount);
        appliedGiftCertCode = cert.code;
        appliedGiftCertId = cert.id;
      }
    }

    // 5. Calculate tax
    const taxableAmount = subtotal - discountTotal - giftCertAmount;
    const taxRate = store.taxRate ? parseFloat(store.taxRate) : 0;
    const taxTotal = store.taxInclusive ? 0 : Math.round(Math.max(0, taxableAmount) * taxRate);

    // 6. Calculate total
    const total = subtotal - discountTotal - giftCertAmount + shippingTotal + taxTotal;

    if (total <= 0) {
      return NextResponse.json({ success: false, message: 'Order total must be greater than zero' }, { status: 400 });
    }

    // 7. Create Stripe PaymentIntent. Connect mode adds platform fee +
    // transfer destination; BYOK mode omits both (Stripe rejects them when
    // the call is not against a Connect platform context).
    const stripe = ctx.stripe;

    // Connect: derive application fee from resolver bps (preserves current
    // behavior — bps = platformFeePercent * 100, so `total * bps / 10000`
    // ≡ `total * (platformFeePercent / 100)`). Null bps falls back to 500
    // (5%) to match the pre-resolver default. BYOK: zero, never sent.
    const applicationFee =
      ctx.mode === 'connect'
        ? Math.round(total * ((ctx.applicationFeeBps ?? 500) / 10000))
        : 0;

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: total,
      currency: store.currency.toLowerCase(),
      metadata: {
        websiteId: String(websiteId),
        storeId: String(store.id),
      },
    };
    if (ctx.mode === 'connect') {
      paymentIntentParams.application_fee_amount = applicationFee;
      paymentIntentParams.transfer_data = { destination: ctx.stripeAccountId! };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // 8. Generate order number
    const prefix = store.orderPrefix || 'ORD';
    const [lastOrder] = await db.select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.websiteId, websiteId))
      .orderBy(desc(orders.id))
      .limit(1);

    const orderNumber = generateOrderNumber(prefix, lastOrder?.orderNumber || null);

    // 9. Create order
    const [order] = await db.insert(orders).values({
      websiteId,
      orderNumber,
      customerEmail,
      customerName,
      customerPhone: customerPhone || null,
      shippingAddress: shippingAddress || null,
      billingAddress: billingAddress || null,
      subtotal,
      shippingTotal,
      taxTotal,
      discountTotal,
      total,
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: 'pending',
      status: 'pending',
      shippingMethod: shippingMethodName,
      customerNote: customerNote || null,
      platformFee: applicationFee,
      discountCode: appliedDiscountCode,
    }).returning();

    // E2 — new order shows up in the dashboard recent-orders panel.
    revalidateAdminDashboard();

    // 10. Create order items
    await db.insert(orderItems).values(
      orderItemsData.map(item => ({
        orderId: order.id,
        productId: item.productId,
        variantId: item.variantId,
        // Carry the saved-design FK forward so the order detail (admin
        // + storefront) can render the design thumbnail and the
        // fulfillment team has a permanent link back to the customer's
        // canvas.
        designId: item.designId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        total: item.total,
      }))
    );

    // Insert initial status history
    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: 'pending',
      note: 'Order created, awaiting payment',
    });

    // Redeem gift certificate if used
    if (appliedGiftCertId && appliedGiftCertCode && giftCertAmount > 0) {
      const [cert] = await db.select().from(giftCertificates)
        .where(eq(giftCertificates.id, appliedGiftCertId)).limit(1);
      if (cert) {
        const newRemaining = cert.remainingAmount - giftCertAmount;
        await db.update(giftCertificates)
          .set({
            remainingAmount: newRemaining,
            status: newRemaining <= 0 ? 'fully_redeemed' : 'active',
            updatedAt: new Date(),
          })
          .where(eq(giftCertificates.id, cert.id));

        await db.insert(giftCertificateRedemptions).values({
          giftCertificateId: cert.id,
          amount: giftCertAmount,
          context: 'store',
          referenceId: order.id,
          referenceType: 'order',
        });
      }
    }

    // Update PaymentIntent metadata with orderId
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        websiteId: String(websiteId),
        storeId: String(store.id),
        orderId: String(order.id),
        orderNumber,
      },
    });

    // Provide the publishable key so the client can initialise Stripe.js
    // without hard-coding a key in the browser bundle.
    // Connect mode → platform NEXT_PUBLIC key (callers confirm against the
    //   platform account which then splits to the connected account).
    // BYOK mode → the tenant's own pk_… stored plaintext in store_settings;
    //   null falls back to the platform key (e.g. before the merchant saves
    //   their publishable key during BYOK setup).
    const publishableKey =
      ctx.mode === 'byok'
        ? (store.stripePublishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null)
        : (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null);

    return NextResponse.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        publishableKey,
        orderId: order.id,
        orderNumber,
        total,
        currency: store.currency,
      },
    });
  } catch (err) {
    console.error('Storefront checkout error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
