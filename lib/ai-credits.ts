import { db } from '@/lib/db';
import { aiCreditBalances, aiCreditLedger, aiCreditPackages, clientServices, services } from '@/lib/db/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

/**
 * Invalidate the `credits:<clientId>` Next data-cache tag. Called from every
 * mutation entry-point in this module so the cached snapshot used by
 * `/api/portal/credits` (see app/api/portal/credits/route.ts) is refreshed
 * immediately rather than waiting out the 30s revalidate. Wrapped in try/catch
 * because `revalidateTag` throws if called outside a route/action context
 * (e.g. from the `grantMonthlyCredits` cron worker).
 */
function invalidateCreditsCache(clientId: number): void {
  try {
    revalidateTag(`credits:${clientId}`, 'max');
  } catch {
    // Out-of-context (e.g. cron). The 30s TTL will catch up.
  }
}

export interface CreditBalance {
  balance: number;
  monthlyGrant: number;
  payAsYouGo: boolean;
}

type CreditTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface CreditMutationResult {
  success: boolean;
  newBalance: number;
  error?: string;
}

const INSUFFICIENT_CREDITS = 'Insufficient AI credits. Purchase more credits or enable pay-as-you-go.';

function validAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0;
}

async function lockBalance(tx: CreditTransaction, clientId: number) {
  await tx.insert(aiCreditBalances).values({ clientId }).onConflictDoNothing();
  const [row] = await tx.select().from(aiCreditBalances)
    .where(eq(aiCreditBalances.clientId, clientId)).for('update');
  if (!row) throw new Error('AI credit balance unavailable');
  return row;
}

async function changeBalance(tx: CreditTransaction, clientId: number, delta: number): Promise<number> {
  const [row] = await tx.update(aiCreditBalances).set({
    balance: sql`${aiCreditBalances.balance} + ${delta}`,
    updatedAt: new Date(),
  }).where(eq(aiCreditBalances.clientId, clientId)).returning({ balance: aiCreditBalances.balance });
  return row.balance;
}

/** Hold credits BEFORE a provider request. UUID reference is per call, never a conversation ID.
 * All reservation mutations lock the tenant's balance first: both the balance
 * and ledger commit together, and retries cannot reserve/settle twice.
 */
export async function reserveCredits(
  clientId: number, amount: number, category: string, referenceId: string,
): Promise<CreditMutationResult> {
  if (!validAmount(amount) || !referenceId) throw new Error('Invalid AI credit reservation');
  const result = await db.transaction(async tx => {
    const balance = await lockBalance(tx, clientId);
    const [existing] = await tx.select().from(aiCreditLedger).where(and(
      eq(aiCreditLedger.clientId, clientId), eq(aiCreditLedger.serviceCategory, category),
      eq(aiCreditLedger.referenceId, referenceId),
    )).limit(1);
    if (existing) {
      const compatible = existing.type === 'reservation' && existing.amount === -amount;
      return { success: compatible, newBalance: balance.balance,
        ...(!compatible ? { error: 'AI credit operation already settled or reservation mismatch' } : {}) };
    }
    if (!balance.payAsYouGo && balance.balance < amount) {
      return { success: false, newBalance: balance.balance, error: INSUFFICIENT_CREDITS };
    }
    const newBalance = await changeBalance(tx, clientId, -amount);
    await tx.insert(aiCreditLedger).values({
      clientId, type: 'reservation', amount: -amount, balanceAfter: newBalance,
      serviceCategory: category, referenceId, description: 'AI provider request: pending usage reconciliation',
    });
    return { success: true, newBalance };
  });
  if (result.success) invalidateCreditsCache(clientId);
  return result;
}

/** Replace a hold with actual usage atomically. A repeated settlement is a no-op.
 * amount=0 releases a request the provider definitely rejected. Transport errors
 * keep a pending hold because the provider may still have consumed tokens.
 */
export async function settleCredits(
  clientId: number, amount: number, category: string, referenceId: string, description?: string,
): Promise<CreditMutationResult> {
  if (!validAmount(amount)) throw new Error('Invalid AI credit settlement');
  const result = await db.transaction(async tx => {
    const balance = await lockBalance(tx, clientId);
    const [entry] = await tx.select().from(aiCreditLedger).where(and(
      eq(aiCreditLedger.clientId, clientId), eq(aiCreditLedger.serviceCategory, category),
      eq(aiCreditLedger.referenceId, referenceId),
    )).limit(1);
    if (!entry) return { success: false, newBalance: balance.balance, error: 'AI credit reservation not found' };
    if (entry.type !== 'reservation') {
      return { success: (entry.type === 'usage' || entry.type === 'released') && entry.amount === -amount,
        newBalance: balance.balance, ...(entry.amount !== -amount ? { error: 'AI credit settlement mismatch' } : {}) };
    }
    const refund = -entry.amount - amount;
    if (!balance.payAsYouGo && balance.balance + refund < 0) {
      return { success: false, newBalance: balance.balance, error: 'AI usage exceeded reserved credits; reconciliation required' };
    }
    const newBalance = await changeBalance(tx, clientId, refund);
    await tx.update(aiCreditLedger).set({
      type: amount === 0 ? 'released' : 'usage', amount: -amount, balanceAfter: newBalance,
      description: description ?? 'AI provider request usage',
    }).where(and(eq(aiCreditLedger.id, entry.id), eq(aiCreditLedger.clientId, clientId)));
    return { success: true, newBalance };
  });
  if (result.success) invalidateCreditsCache(clientId);
  return result;
}

/**
 * Get the current credit balance for a client.
 * Creates a balance record if one doesn't exist.
 */
export async function getBalance(clientId: number): Promise<CreditBalance> {
  const [row] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId)).limit(1);
  if (row) return { balance: row.balance, monthlyGrant: row.monthlyGrant, payAsYouGo: row.payAsYouGo };

  // Create initial balance record
  await db.insert(aiCreditBalances).values({ clientId, balance: 0, monthlyGrant: 0, payAsYouGo: false }).onConflictDoNothing();
  const [created] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId)).limit(1);
  return { balance: created.balance, monthlyGrant: created.monthlyGrant, payAsYouGo: created.payAsYouGo };
}

/**
 * Quick check if client has enough credits for an AI operation.
 */
export async function hasCredits(clientId: number, estimatedAmount: number = 1000): Promise<boolean> {
  const { balance, payAsYouGo } = await getBalance(clientId);
  return payAsYouGo || balance >= estimatedAmount;
}

/**
 * Deduct credits after an AI operation. Returns the new balance.
 * If pay-as-you-go is enabled, allows negative balance (flagged for billing).
 * If not, rejects deduction if insufficient balance.
 */
export async function deductCredits(
  clientId: number,
  amount: number,
  category: string,
  referenceId: string,
  description?: string,
): Promise<CreditMutationResult> {
  if (!validAmount(amount)) throw new Error('Invalid AI credit amount');
  const result = await db.transaction(async tx => {
    const balance = await lockBalance(tx, clientId);
    if (!balance.payAsYouGo && balance.balance < amount) {
      return { success: false, newBalance: balance.balance, error: INSUFFICIENT_CREDITS };
    }
    if (amount === 0) return { success: true, newBalance: balance.balance };
    const newBalance = await changeBalance(tx, clientId, -amount);
    await tx.insert(aiCreditLedger).values({
      clientId, type: 'usage', amount: -amount, balanceAfter: newBalance,
      description: description || `AI usage: ${category}`, serviceCategory: category, referenceId,
    });
    return { success: true, newBalance };
  });
  if (result.success) invalidateCreditsCache(clientId);
  return result;
}

/**
 * Grant monthly credits based on active service subscriptions.
 * Calculates total included credits across all active services.
 */
export async function grantMonthlyCredits(clientId: number): Promise<{ granted: number; newBalance: number }> {
  const result = await db.transaction(async tx => {
    const balance = await lockBalance(tx, clientId);
    const subscriptions = await tx.select({
      id: clientServices.id, credits: services.includedAiCredits,
      category: services.category, grantedAt: clientServices.creditsGrantedAt,
    }).from(clientServices).innerJoin(services, eq(services.id, clientServices.serviceId))
      .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // Existing subscriptions have already received this month's grant; a new
    // module still receives its initial grant without regranting its siblings.
    const eligible = subscriptions.filter(subscription => !subscription.grantedAt || subscription.grantedAt < monthStart);
    const totalGrant = eligible.reduce((sum, subscription) => sum + (subscription.credits ?? 0), 0);
    if (totalGrant === 0) return { granted: 0, newBalance: balance.balance };
    const newBalance = await changeBalance(tx, clientId, totalGrant);
    await tx.update(aiCreditBalances).set({ monthlyGrant: subscriptions.reduce((sum, subscription) => sum + (subscription.credits ?? 0), 0) })
      .where(eq(aiCreditBalances.clientId, clientId));
    await tx.insert(aiCreditLedger).values({
      clientId, type: 'grant', amount: totalGrant, balanceAfter: newBalance,
      description: `Monthly credit grant (${eligible.filter(subscription => (subscription.credits ?? 0) > 0).map(subscription => subscription.category).join(', ')})`,
      serviceCategory: 'system', referenceId: `monthly:${monthStart.toISOString().slice(0, 7)}`,
    });
    await tx.update(clientServices).set({ creditsGrantedAt: now }).where(and(
      eq(clientServices.clientId, clientId), inArray(clientServices.id, eligible.map(subscription => subscription.id)),
    ));
    return { granted: totalGrant, newBalance };
  });
  if (result.granted) invalidateCreditsCache(clientId);
  return result;
}

/**
 * Add purchased credits to balance.
 */
export async function addPurchasedCredits(
  clientId: number,
  tokens: number,
  stripePaymentId: string,
  packageName: string,
): Promise<number> {
  if (!validAmount(tokens) || !stripePaymentId) throw new Error('Invalid AI credit purchase');
  const newBalance = await db.transaction(async tx => {
    const balance = await lockBalance(tx, clientId);
    const [already] = await tx.select().from(aiCreditLedger).where(and(
      eq(aiCreditLedger.clientId, clientId), eq(aiCreditLedger.type, 'purchase'),
      eq(aiCreditLedger.referenceId, stripePaymentId),
    )).limit(1);
    if (already) return balance.balance;
    const updated = await changeBalance(tx, clientId, tokens);
    await tx.insert(aiCreditLedger).values({
      clientId, type: 'purchase', amount: tokens, balanceAfter: updated,
      description: `Purchased: ${packageName}`, serviceCategory: 'system', referenceId: stripePaymentId,
    });
    return updated;
  });

  invalidateCreditsCache(clientId);
  return newBalance;
}

/**
 * One-time free AI credit grant for a brand-new self-serve account — the
 * cardless trial / viral "$0 door": the account can use the agent before
 * subscribing. Idempotent per client (guards on the ledger), so a repeat call
 * is a no-op. Granted only after email verification (or at Google signup,
 * which is pre-verified) so accounts that never verify never receive credits.
 *
 * PROVISIONAL amount — tune once the credit->$ rate + per-tier allowances are
 * locked (GTM open decision #1).
 */
export const SIGNUP_FREE_CREDITS = 250_000; // tokens — a few agent runs

export async function grantSignupCredits(clientId: number): Promise<{ granted: number }> {
  const result = await db.transaction(async tx => {
  await lockBalance(tx, clientId);
  const [already] = await tx
    .select({ id: aiCreditLedger.id })
    .from(aiCreditLedger)
    .where(and(
      eq(aiCreditLedger.clientId, clientId),
      eq(aiCreditLedger.type, 'grant'),
      eq(aiCreditLedger.serviceCategory, 'signup'),
    ))
    .limit(1);
  if (already) return { granted: 0 };

  const newBalance = await changeBalance(tx, clientId, SIGNUP_FREE_CREDITS);

  await tx.insert(aiCreditLedger).values({
    clientId,
    type: 'grant',
    amount: SIGNUP_FREE_CREDITS,
    balanceAfter: newBalance,
    description: 'Signup free credits (cardless trial)',
    serviceCategory: 'signup',
  });

  return { granted: SIGNUP_FREE_CREDITS };
  });
  if (result.granted) invalidateCreditsCache(clientId);
  return result;
}

/**
 * Toggle pay-as-you-go mode.
 */
export async function setPayAsYouGo(clientId: number, enabled: boolean): Promise<void> {
  await db.insert(aiCreditBalances).values({
    clientId, balance: 0, monthlyGrant: 0, payAsYouGo: enabled,
  }).onConflictDoUpdate({
    target: aiCreditBalances.clientId,
    set: { payAsYouGo: enabled, updatedAt: new Date() },
  });
  invalidateCreditsCache(clientId);
}

/**
 * Get credit transaction history (paginated).
 */
export async function getLedger(clientId: number, opts?: { limit?: number; offset?: number }) {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const rows = await db.select().from(aiCreditLedger)
    .where(eq(aiCreditLedger.clientId, clientId))
    .orderBy(desc(aiCreditLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

/**
 * Get available credit packages for purchase.
 */
export async function getCreditPackages() {
  return db.select().from(aiCreditPackages).where(eq(aiCreditPackages.active, true)).orderBy(aiCreditPackages.tokens);
}

/**
 * Get usage summary for current month.
 */
export async function getMonthlyUsage(clientId: number): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [row] = await db.select({
    total: sql<number>`COALESCE(SUM(ABS(${aiCreditLedger.amount})), 0)`,
  }).from(aiCreditLedger)
    .where(and(
      eq(aiCreditLedger.clientId, clientId),
      eq(aiCreditLedger.type, 'usage'),
      sql`${aiCreditLedger.createdAt} >= ${startOfMonth.toISOString()}`,
    ));

  return Number(row?.total ?? 0);
}
