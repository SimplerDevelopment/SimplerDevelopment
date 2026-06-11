import { db } from '@/lib/db';
import { aiCreditBalances, aiCreditLedger, aiCreditPackages, clientServices, services } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
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

/**
 * Get the current credit balance for a client.
 * Creates a balance record if one doesn't exist.
 */
export async function getBalance(clientId: number): Promise<CreditBalance> {
  const [row] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId)).limit(1);
  if (row) return { balance: row.balance, monthlyGrant: row.monthlyGrant, payAsYouGo: row.payAsYouGo };

  // Create initial balance record
  await db.insert(aiCreditBalances).values({ clientId, balance: 0, monthlyGrant: 0, payAsYouGo: false }).onConflictDoNothing();
  return { balance: 0, monthlyGrant: 0, payAsYouGo: false };
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
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { balance, payAsYouGo } = await getBalance(clientId);

  if (amount <= 0) return { success: true, newBalance: balance };

  if (!payAsYouGo && balance < amount) {
    return { success: false, newBalance: balance, error: 'Insufficient AI credits. Purchase more credits or enable pay-as-you-go.' };
  }

  const newBalance = balance - amount;

  // Atomic update: decrement balance and insert ledger entry
  await db.update(aiCreditBalances).set({
    balance: sql`${aiCreditBalances.balance} - ${amount}`,
    updatedAt: new Date(),
  }).where(eq(aiCreditBalances.clientId, clientId));

  await db.insert(aiCreditLedger).values({
    clientId,
    type: 'usage',
    amount: -amount,
    balanceAfter: newBalance,
    description: description || `AI usage: ${category}`,
    serviceCategory: category,
    referenceId,
  });

  invalidateCreditsCache(clientId);
  return { success: true, newBalance };
}

/**
 * Grant monthly credits based on active service subscriptions.
 * Calculates total included credits across all active services.
 */
export async function grantMonthlyCredits(clientId: number): Promise<{ granted: number; newBalance: number }> {
  // Get all active subscriptions with their service credit amounts
  const activeSubscriptions = await db
    .select({ serviceId: clientServices.serviceId, credits: services.includedAiCredits, category: services.category })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));

  const totalGrant = activeSubscriptions.reduce((sum, s) => sum + (s.credits ?? 0), 0);
  if (totalGrant === 0) return { granted: 0, newBalance: (await getBalance(clientId)).balance };

  const { balance } = await getBalance(clientId);
  const newBalance = balance + totalGrant;

  // Upsert balance
  await db.insert(aiCreditBalances).values({
    clientId, balance: totalGrant, monthlyGrant: totalGrant, payAsYouGo: false,
  }).onConflictDoUpdate({
    target: aiCreditBalances.clientId,
    set: {
      balance: sql`${aiCreditBalances.balance} + ${totalGrant}`,
      monthlyGrant: totalGrant,
      updatedAt: new Date(),
    },
  });

  // Record in ledger
  const categories = activeSubscriptions.filter(s => s.credits > 0).map(s => s.category).join(', ');
  await db.insert(aiCreditLedger).values({
    clientId,
    type: 'grant',
    amount: totalGrant,
    balanceAfter: newBalance,
    description: `Monthly credit grant (${categories})`,
    serviceCategory: 'system',
  });

  // Mark grants as applied
  await db.update(clientServices).set({ creditsGrantedAt: new Date() })
    .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));

  invalidateCreditsCache(clientId);
  return { granted: totalGrant, newBalance };
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
  const { balance } = await getBalance(clientId);
  const newBalance = balance + tokens;

  await db.insert(aiCreditBalances).values({
    clientId, balance: tokens, monthlyGrant: 0, payAsYouGo: false,
  }).onConflictDoUpdate({
    target: aiCreditBalances.clientId,
    set: {
      balance: sql`${aiCreditBalances.balance} + ${tokens}`,
      updatedAt: new Date(),
    },
  });

  await db.insert(aiCreditLedger).values({
    clientId,
    type: 'purchase',
    amount: tokens,
    balanceAfter: newBalance,
    description: `Purchased: ${packageName}`,
    serviceCategory: 'system',
    referenceId: stripePaymentId,
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
  const [already] = await db
    .select({ id: aiCreditLedger.id })
    .from(aiCreditLedger)
    .where(and(
      eq(aiCreditLedger.clientId, clientId),
      eq(aiCreditLedger.type, 'grant'),
      eq(aiCreditLedger.serviceCategory, 'signup'),
    ))
    .limit(1);
  if (already) return { granted: 0 };

  const { balance } = await getBalance(clientId);
  const newBalance = balance + SIGNUP_FREE_CREDITS;

  await db.insert(aiCreditBalances).values({
    clientId, balance: SIGNUP_FREE_CREDITS, monthlyGrant: 0, payAsYouGo: false,
  }).onConflictDoUpdate({
    target: aiCreditBalances.clientId,
    set: {
      balance: sql`${aiCreditBalances.balance} + ${SIGNUP_FREE_CREDITS}`,
      updatedAt: new Date(),
    },
  });

  await db.insert(aiCreditLedger).values({
    clientId,
    type: 'grant',
    amount: SIGNUP_FREE_CREDITS,
    balanceAfter: newBalance,
    description: 'Signup free credits (cardless trial)',
    serviceCategory: 'signup',
  });

  invalidateCreditsCache(clientId);
  return { granted: SIGNUP_FREE_CREDITS };
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
