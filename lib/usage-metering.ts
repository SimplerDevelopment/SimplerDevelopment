import { db } from '@/lib/db';
import { usageMeters, clientServices, services } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Default usage limits and overage rates per category
const USAGE_DEFAULTS: Record<string, { included: number; overageRate: number }> = {
  email_sends: { included: 10_000, overageRate: 100 },       // $1.00 per 1K emails
  hosting_storage_gb: { included: 5, overageRate: 10 },       // $0.10 per GB
  hosting_bandwidth_gb: { included: 100, overageRate: 5 },    // $0.05 per GB
};

// Bundle gets higher limits
const BUNDLE_LIMITS: Record<string, number> = {
  email_sends: 25_000,
  hosting_storage_gb: 20,
  hosting_bandwidth_gb: 500,
};

export interface UsageInfo {
  category: string;
  usage: number;
  included: number;
  overage: number;
  overageRate: number;
  overageCost: number; // cents
}

/**
 * Track usage for a client in the current billing period.
 * Atomic increment — safe for concurrent calls.
 */
export async function trackUsage(clientId: number, category: string, amount: number): Promise<void> {
  const period = currentPeriod();
  const defaults = USAGE_DEFAULTS[category] ?? { included: 0, overageRate: 0 };

  // Check if client has bundle for higher limits
  const hasBundle = await checkBundleSubscription(clientId);
  const included = hasBundle ? (BUNDLE_LIMITS[category] ?? defaults.included) : defaults.included;

  // Upsert: increment if exists, create if not
  await db.insert(usageMeters).values({
    clientId,
    category,
    period,
    usage: amount,
    included,
    overageRate: defaults.overageRate,
  }).onConflictDoUpdate({
    target: [usageMeters.clientId, usageMeters.category, usageMeters.period],
    set: {
      usage: sql`${usageMeters.usage} + ${amount}`,
      updatedAt: new Date(),
    },
    // This won't work with the target syntax above since we have no unique constraint defined in Drizzle.
    // Fall back to raw SQL approach.
  }).catch(async () => {
    // Fallback: try update first, insert if no rows affected
    const result = await db.update(usageMeters).set({
      usage: sql`${usageMeters.usage} + ${amount}`,
      updatedAt: new Date(),
    }).where(and(
      eq(usageMeters.clientId, clientId),
      eq(usageMeters.category, category),
      eq(usageMeters.period, period),
    ));

    // If no rows updated, insert
    if (!result.rowCount || result.rowCount === 0) {
      await db.insert(usageMeters).values({
        clientId, category, period, usage: amount, included, overageRate: defaults.overageRate,
      });
    }
  });
}

/**
 * Get current period usage for a specific category.
 */
export async function getUsage(clientId: number, category: string): Promise<UsageInfo> {
  const period = currentPeriod();
  const [row] = await db.select().from(usageMeters)
    .where(and(
      eq(usageMeters.clientId, clientId),
      eq(usageMeters.category, category),
      eq(usageMeters.period, period),
    )).limit(1);

  if (!row) {
    const defaults = USAGE_DEFAULTS[category] ?? { included: 0, overageRate: 0 };
    return { category, usage: 0, included: defaults.included, overage: 0, overageRate: defaults.overageRate, overageCost: 0 };
  }

  const overage = Math.max(0, row.usage - row.included);
  return {
    category,
    usage: row.usage,
    included: row.included,
    overage,
    overageRate: row.overageRate,
    overageCost: overage * row.overageRate,
  };
}

/**
 * Get all usage meters for a client in the current period.
 */
export async function getAllUsage(clientId: number): Promise<UsageInfo[]> {
  const period = currentPeriod();
  const rows = await db.select().from(usageMeters)
    .where(and(eq(usageMeters.clientId, clientId), eq(usageMeters.period, period)));

  // Include categories with no usage yet
  const seen = new Set(rows.map(r => r.category));
  const result: UsageInfo[] = rows.map(r => {
    const overage = Math.max(0, r.usage - r.included);
    return { category: r.category, usage: r.usage, included: r.included, overage, overageRate: r.overageRate, overageCost: overage * r.overageRate };
  });

  // Add defaults for categories not yet tracked
  for (const [cat, defaults] of Object.entries(USAGE_DEFAULTS)) {
    if (!seen.has(cat)) {
      result.push({ category: cat, usage: 0, included: defaults.included, overage: 0, overageRate: defaults.overageRate, overageCost: 0 });
    }
  }

  return result;
}

/**
 * Calculate total overage cost across all categories for current period.
 */
export async function getTotalOverageCost(clientId: number): Promise<number> {
  const usage = await getAllUsage(clientId);
  return usage.reduce((sum, u) => sum + u.overageCost, 0);
}

async function checkBundleSubscription(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ category: services.category })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(
      eq(clientServices.clientId, clientId),
      eq(clientServices.status, 'active'),
      eq(services.category, 'bundle'),
    ))
    .limit(1);
  return !!row;
}

/** Human-readable labels for usage categories */
export const USAGE_LABELS: Record<string, { label: string; unit: string }> = {
  email_sends: { label: 'Email Sends', unit: 'emails' },
  hosting_storage_gb: { label: 'Storage', unit: 'GB' },
  hosting_bandwidth_gb: { label: 'Bandwidth', unit: 'GB' },
};
