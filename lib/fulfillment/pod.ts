// POD (print-on-demand) fulfillment service — Printful integration.
//
// Entry points:
//   submitPODOrder    — called from the Stripe webhook after payment; idempotent.
//   getPODShippingRates — called from the checkout route to surface Printful rates.

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import {
  orders,
  orderItems,
  storeSettings,
  products,
  productVariants,
} from '@/lib/db/schema';
import { decryptApiKey } from '@/lib/crypto/api-key';
import {
  PrintfulProvider,
  type PrintfulRecipient,
  type PrintfulShippingRate,
} from './providers/printful';

// ─── side → Printful placement ───────────────────────────────────────────────

/**
 * Map our side slug onto Printful's placement name.
 *
 * `product_sides.side` uses the slugs inherited from the catalog import
 * (`front`, `back`, `sleeveleft`, `sleeveright`); Printful names its placements
 * with underscores and leading side (`left_sleeve`). Anything unrecognised is
 * passed through unchanged so a new catalog side reaches Printful and fails
 * loudly there rather than being silently dropped here.
 *
 * Exported for unit testing.
 */
export function printfulPlacement(side: string): string {
  const map: Record<string, string> = {
    front: 'front',
    back: 'back',
    sleeveleft: 'left_sleeve',
    sleeveright: 'right_sleeve',
    left_sleeve: 'left_sleeve',
    right_sleeve: 'right_sleeve',
  };
  return map[side] ?? side;
}

// ─── submitPODOrder ──────────────────────────────────────────────────────────

/**
 * Submit a paid order to Printful for POD fulfillment.
 *
 * Idempotent: if `orders.printfulOrderId` is already set, returns immediately.
 * Only acts when `storeSettings.fulfillmentProvider === 'printful'`.
 *
 * On success: writes printfulOrderId, status='pending', submittedAt.
 * On Printful error: writes printfulFulfillmentError, status='failed', re-throws.
 */
export async function submitPODOrder(
  orderId: number,
  db: typeof defaultDb = defaultDb,
): Promise<void> {
  // 1. Load the order.
  const [order] = await db.select().from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    throw new Error(`submitPODOrder: order ${orderId} not found`);
  }

  // 2. Idempotency guard — already submitted.
  if (order.printfulOrderId) {
    return;
  }

  // 3. Load store settings and check fulfillment provider.
  const [settings] = await db.select().from(storeSettings)
    .where(eq(storeSettings.websiteId, order.websiteId))
    .limit(1);

  if (!settings || settings.fulfillmentProvider !== 'printful') {
    return;
  }

  // 4. Verify Printful is configured.
  if (!settings.printfulApiKeyEncrypted || !settings.printfulStoreId) {
    throw new Error('Printful not configured for this store');
  }

  // 5. Decrypt API key.
  const apiKey = decryptApiKey(settings.printfulApiKeyEncrypted);

  // 6. Load order items.
  const items = await db.select().from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  // 7 & 8. Resolve Printful variant IDs and print-file URLs per item.
  const printfulItems: Array<{
    variant_id: number;
    quantity: number;
    name: string;
    retail_price: string;
    files: Array<{ type: string; url: string }>;
  }> = [];

  for (const item of items) {
    // 7. Determine Printful variant ID.
    let printfulVariantId: number | null = null;

    if (item.variantId) {
      const [variant] = await db.select().from(productVariants)
        .where(eq(productVariants.id, item.variantId))
        .limit(1);
      printfulVariantId = variant?.printfulVariantId ?? null;
    } else if (item.productId) {
      const [product] = await db.select().from(products)
        .where(eq(products.id, item.productId))
        .limit(1);
      printfulVariantId = product?.printfulVariantId ?? null;
    }

    if (printfulVariantId === null) {
      throw new Error(`Product '${item.productName}' has no Printful variant ID configured`);
    }

    // 8. Determine print files, one per designed side.
    //
    // `orderItems.printFiles` / `printReadyUrl` are the ONLY valid sources. Both
    // hold transparent, artwork-only renders at print DPI, frozen at checkout.
    //
    // This deliberately does NOT fall back to a design's rendered/thumbnail
    // image. Those are composite MOCKUPS (artwork stamped onto a blank
    // product photo — see lib/printing/composite.ts). Sending one to Printful
    // prints a picture of a t-shirt onto the t-shirt. A hard failure here
    // costs a support ticket; the fallback cost real garments.
    const sideFiles: Record<string, string> = {
      ...(item.printFiles ?? {}),
      // printReadyUrl is the front-side shorthand; the map wins if both exist.
      ...(item.printReadyUrl && !item.printFiles?.front ? { front: item.printReadyUrl } : {}),
    };

    const files = Object.entries(sideFiles)
      .filter(([, url]) => !!url)
      .map(([side, url]) => ({ type: printfulPlacement(side), url }));

    if (files.length === 0) {
      throw new Error(
        `Order item ${item.id} ('${item.productName}') has no print-ready file. ` +
        'Refusing to submit to Printful — a design mockup is not a print file.',
      );
    }

    // 9. Build PrintfulOrderItem.
    printfulItems.push({
      variant_id: printfulVariantId,
      quantity: item.quantity,
      name: item.productName,
      retail_price: (item.unitPrice / 100).toFixed(2),
      files,
    });
  }

  // 10. Map shipping address to PrintfulRecipient.
  const addr = order.shippingAddress;
  if (!addr) {
    throw new Error(`submitPODOrder: order ${orderId} has no shipping address`);
  }

  const recipient: PrintfulRecipient = {
    name: order.customerName,
    address1: addr.line1,
    address2: addr.line2,
    city: addr.city,
    state_code: addr.state,
    country_code: addr.country || 'US',
    zip: addr.postalCode,
    email: order.customerEmail,
    phone: order.customerPhone ?? undefined,
  };

  // 11. Determine shipping method.
  const shippingMethod = order.shippingMethod || 'STANDARD';

  // 12–14. Submit to Printful, write result back.
  const printful = new PrintfulProvider({ apiKey, storeId: settings.printfulStoreId });

  try {
    const result = await printful.createOrder({
      recipient,
      items: printfulItems,
      externalId: order.id.toString(),
      shippingMethod,
      confirm: true,
    });

    // 13. On success.
    await db.update(orders).set({
      printfulOrderId: result.id.toString(),
      printfulFulfillmentStatus: 'pending',
      printfulSubmittedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));
  } catch (err) {
    // 14. On error — record and re-throw.
    const message = err instanceof Error ? err.message : String(err);
    await db.update(orders).set({
      printfulFulfillmentError: message,
      printfulFulfillmentStatus: 'failed',
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));
    throw err;
  }
}

// ─── getPODShippingRates ─────────────────────────────────────────────────────

/**
 * Fetch live Printful shipping rates for the given recipient + items.
 * Thin wrapper: instantiates PrintfulProvider and delegates to estimateShipping.
 */
export async function getPODShippingRates(params: {
  recipient: PrintfulRecipient;
  items: Array<{ variantId: number; quantity: number }>;
  apiKey: string;
  storeId: string;
}): Promise<PrintfulShippingRate[]> {
  const printful = new PrintfulProvider({
    apiKey: params.apiKey,
    storeId: params.storeId,
  });
  return printful.estimateShipping(params.recipient, params.items);
}
