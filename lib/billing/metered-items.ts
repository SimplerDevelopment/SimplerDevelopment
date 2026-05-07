// Data-access helpers for `metered_subscription_items`. Kept separate from
// the Stripe wrapper so the wrapper stays Stripe-only and so the rollup
// worker can DI-mock these in unit tests.

import { db } from '@/lib/db';
import { meteredSubscriptionItems } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export type MeteredItem = typeof meteredSubscriptionItems.$inferSelect;
export type NewMeteredItem = typeof meteredSubscriptionItems.$inferInsert;

export async function listMeteredItemsForClient(clientId: number): Promise<MeteredItem[]> {
  return db
    .select()
    .from(meteredSubscriptionItems)
    .where(eq(meteredSubscriptionItems.clientId, clientId));
}

export async function listActiveMeteredItemsForClient(clientId: number): Promise<MeteredItem[]> {
  return db
    .select()
    .from(meteredSubscriptionItems)
    .where(and(
      eq(meteredSubscriptionItems.clientId, clientId),
      eq(meteredSubscriptionItems.status, 'active'),
    ));
}

export async function getMeteredItem(id: number): Promise<MeteredItem | null> {
  const [row] = await db
    .select()
    .from(meteredSubscriptionItems)
    .where(eq(meteredSubscriptionItems.id, id))
    .limit(1);
  return row ?? null;
}

export async function insertMeteredItem(input: {
  clientId: number;
  stripeSubscriptionId: string;
  stripeSubscriptionItemId: string;
  resource: string;
  unitPriceCents: number;
  includedQuantity?: number;
  status?: string;
}): Promise<MeteredItem> {
  const [row] = await db
    .insert(meteredSubscriptionItems)
    .values({
      clientId: input.clientId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeSubscriptionItemId: input.stripeSubscriptionItemId,
      resource: input.resource,
      unitPriceCents: input.unitPriceCents,
      includedQuantity: (input.includedQuantity ?? 0).toString(),
      status: input.status ?? 'active',
    })
    .returning();
  return row;
}

export async function updateMeteredItem(
  id: number,
  patch: Partial<{ status: string; unitPriceCents: number; includedQuantity: number }>,
): Promise<MeteredItem | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.unitPriceCents !== undefined) set.unitPriceCents = patch.unitPriceCents;
  if (patch.includedQuantity !== undefined) set.includedQuantity = patch.includedQuantity.toString();

  const [row] = await db
    .update(meteredSubscriptionItems)
    .set(set)
    .where(eq(meteredSubscriptionItems.id, id))
    .returning();
  return row ?? null;
}

export async function deleteMeteredItem(id: number): Promise<boolean> {
  const rows = await db
    .delete(meteredSubscriptionItems)
    .where(eq(meteredSubscriptionItems.id, id))
    .returning({ id: meteredSubscriptionItems.id });
  return rows.length > 0;
}
