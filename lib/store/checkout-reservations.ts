import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { db } from '@/lib/db';
import { discountCodes, giftCertificates, giftCertificateRedemptions, internalJobs,
  products, productVariants, storeCheckoutReservations } from '@/lib/db/schema';

type StoreTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface ReservedStock { productId: number; variantId: number | null; quantity: number }
const RESERVATION_MS = 30 * 60_000;
export class CheckoutReservationError extends Error {}
const variantOwnedBy = (websiteId: number) => sql`EXISTS (SELECT 1 FROM products AS owned_product WHERE owned_product.id = product_variants.product_id AND owned_product.website_id = ${websiteId})`;

/** Aggregate repeated cart lines before the conditional stock update. */
export function aggregateStock(items: ReservedStock[]): ReservedStock[] {
  const quantities = new Map<string, ReservedStock>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error('Invalid item quantity');
    const key = `${item.productId}:${item.variantId ?? ''}`;
    const existing = quantities.get(key);
    quantities.set(key, { ...item, quantity: (existing?.quantity ?? 0) + item.quantity });
  }
  // Every checkout takes locks in the same order to avoid crossed-cart deadlocks.
  return [...quantities.values()].sort((a, b) => a.productId - b.productId || (a.variantId ?? 0) - (b.variantId ?? 0));
}

export async function reserveCheckout(tx: StoreTx, params: {
  orderId: number; websiteId: number; clientId: number; items: ReservedStock[];
  giftCertificateId: number | null; giftCertificateAmount: number; discountCode: string | null;
}): Promise<void> {
  const items = aggregateStock(params.items);
  await consumeCheckoutStock(tx, params.websiteId, items);
  await reserveCheckoutBalances(tx, params);
  const expiresAt = new Date(Date.now() + RESERVATION_MS);
  await tx.insert(storeCheckoutReservations).values({ ...params, items, expiresAt });
  await tx.insert(internalJobs).values({ clientId: params.clientId, type: 'store.reservation_expire',
    payload: { orderId: params.orderId, clientId: params.clientId }, dedupeKey: `store.reservation_expire:${params.orderId}`, nextRetryAt: expiresAt });
}

export async function consumeCheckoutStock(tx: StoreTx, websiteId: number, items: ReservedStock[]): Promise<void> {
  for (const item of aggregateStock(items)) {
    const rows = item.variantId
      ? await tx.update(productVariants).set({ quantity: sql`${productVariants.quantity} - ${item.quantity}`, updatedAt: new Date() })
        .where(and(eq(productVariants.id, item.variantId), eq(productVariants.productId, item.productId), variantOwnedBy(websiteId), gte(productVariants.quantity, item.quantity))).returning({ id: productVariants.id })
      : await tx.update(products).set({ quantity: sql`${products.quantity} - ${item.quantity}`, updatedAt: new Date() })
        .where(and(eq(products.id, item.productId), eq(products.websiteId, websiteId), gte(products.quantity, item.quantity))).returning({ id: products.id });
    if (!rows.length) throw new CheckoutReservationError('Insufficient stock. Please refresh your cart.');
  }
}

async function reserveCheckoutBalances(tx: StoreTx, params: {
  websiteId: number; giftCertificateId: number | null; giftCertificateAmount: number; discountCode: string | null;
}): Promise<void> {
  if (params.discountCode) {
    const used = await tx.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1`, updatedAt: new Date() })
      .where(and(eq(discountCodes.websiteId, params.websiteId), eq(discountCodes.code, params.discountCode), eq(discountCodes.active, true),
        or(isNull(discountCodes.maxUses), sql`${discountCodes.maxUses} = 0`, sql`${discountCodes.usedCount} < ${discountCodes.maxUses}`)))
      .returning({ id: discountCodes.id });
    if (!used.length) throw new CheckoutReservationError('Discount code is no longer available');
  }
  if (params.giftCertificateId && params.giftCertificateAmount > 0) {
    const reserved = await tx.update(giftCertificates).set({ remainingAmount: sql`${giftCertificates.remainingAmount} - ${params.giftCertificateAmount}`, updatedAt: new Date() })
      .where(and(eq(giftCertificates.id, params.giftCertificateId), eq(giftCertificates.websiteId, params.websiteId), eq(giftCertificates.status, 'active'),
        or(isNull(giftCertificates.expiresAt), gte(giftCertificates.expiresAt, new Date())), gte(giftCertificates.remainingAmount, params.giftCertificateAmount)))
      .returning({ id: giftCertificates.id });
    if (!reserved.length) throw new CheckoutReservationError('Gift certificate balance is no longer available');
  }
}

/** Caller locks the order first, so release and payment commit cannot race. */
export async function releaseCheckout(tx: StoreTx, orderId: number): Promise<void> {
  const [reservation] = await tx.update(storeCheckoutReservations).set({ state: 'released', updatedAt: new Date() })
    .where(and(eq(storeCheckoutReservations.orderId, orderId), eq(storeCheckoutReservations.state, 'reserved'))).returning();
  if (!reservation) return;
  for (const item of aggregateStock(reservation.items)) {
    if (item.variantId) await tx.update(productVariants).set({ quantity: sql`${productVariants.quantity} + ${item.quantity}`, updatedAt: new Date() }).where(and(eq(productVariants.id, item.variantId), eq(productVariants.productId, item.productId), variantOwnedBy(reservation.websiteId)));
    else await tx.update(products).set({ quantity: sql`${products.quantity} + ${item.quantity}`, updatedAt: new Date() }).where(and(eq(products.id, item.productId), eq(products.websiteId, reservation.websiteId)));
  }
  if (reservation.discountCode) await tx.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} - 1`, updatedAt: new Date() })
    .where(and(eq(discountCodes.websiteId, reservation.websiteId), eq(discountCodes.code, reservation.discountCode), gte(discountCodes.usedCount, 1)));
  if (reservation.giftCertificateId && reservation.giftCertificateAmount > 0) await tx.update(giftCertificates)
    .set({ remainingAmount: sql`${giftCertificates.remainingAmount} + ${reservation.giftCertificateAmount}`,
      status: sql`CASE WHEN ${giftCertificates.status} = 'fully_redeemed' THEN 'active' ELSE ${giftCertificates.status} END`, updatedAt: new Date() })
    .where(and(eq(giftCertificates.id, reservation.giftCertificateId), eq(giftCertificates.websiteId, reservation.websiteId)));
}

export async function commitCheckout(tx: StoreTx, orderId: number): Promise<boolean> {
  const [reservation] = await tx.select().from(storeCheckoutReservations).where(eq(storeCheckoutReservations.orderId, orderId)).limit(1);
  if (!reservation) return false; // Legacy orders have not reserved stock.
  if (reservation.state === 'released') throw new Error('Payment arrived after reservation release; reconciliation required');
  if (reservation.state === 'committed') return true;
  await tx.update(storeCheckoutReservations).set({ state: 'committed', updatedAt: new Date() }).where(eq(storeCheckoutReservations.id, reservation.id));
  if (reservation.giftCertificateId && reservation.giftCertificateAmount > 0) {
    await tx.insert(giftCertificateRedemptions).values({ giftCertificateId: reservation.giftCertificateId, amount: reservation.giftCertificateAmount, context: 'store', referenceId: orderId, referenceType: 'order' });
    await tx.update(giftCertificates).set({ status: 'fully_redeemed', updatedAt: new Date() })
      .where(and(eq(giftCertificates.id, reservation.giftCertificateId), eq(giftCertificates.websiteId, reservation.websiteId), eq(giftCertificates.status, 'active'), eq(giftCertificates.remainingAmount, 0)));
  }
  return true;
}

/** Refund gift credit only on a full cash refund; never treat this as a goods return. */
export async function refundCheckoutGift(tx: StoreTx, orderId: number): Promise<void> {
  const [reservation] = await tx.update(storeCheckoutReservations).set({ state: 'refunded', updatedAt: new Date() })
    .where(and(eq(storeCheckoutReservations.orderId, orderId), eq(storeCheckoutReservations.state, 'committed'))).returning();
  if (!reservation?.giftCertificateId || reservation.giftCertificateAmount <= 0) return;
  await tx.update(giftCertificates).set({ remainingAmount: sql`${giftCertificates.remainingAmount} + ${reservation.giftCertificateAmount}`,
    status: sql`CASE WHEN ${giftCertificates.status} = 'fully_redeemed' THEN 'active' ELSE ${giftCertificates.status} END`, updatedAt: new Date() })
    .where(and(eq(giftCertificates.id, reservation.giftCertificateId), eq(giftCertificates.websiteId, reservation.websiteId)));
  await tx.insert(giftCertificateRedemptions).values({ giftCertificateId: reservation.giftCertificateId,
    amount: -reservation.giftCertificateAmount, context: 'store', referenceId: orderId, referenceType: 'order' });
}
