// Per-period rollup of `usage_meter_events` -> Stripe usage records.
//
// Flow per (client, period):
//   1. SUM(amount) from `usage_meter_events` grouped by resource.
//   2. For each active `metered_subscription_items` row matching the
//      resource, compute billable = max(0, total - included).
//   3. Push usage to Stripe via `subscriptionItems.createUsageRecord`
//      (action='set', so re-runs replace, not add).
//   4. Upsert one `usage_billing_periods` row per (client, period, resource).
//      The unique index on those three columns makes the upsert idempotent —
//      re-running on the same period overwrites the audit row instead of
//      creating duplicates.
//
// Stripe push errors are caught: we still persist the audit row with
// `stripeUsageRecordId = null` so a retry later picks it back up.

import { db } from '@/lib/db';
import {
  usageMeterEvents,
  meteredSubscriptionItems,
  usageBillingPeriods,
} from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { reportUsage } from '@/lib/stripe';

export interface RollupResult {
  resource: string;
  total: number;
  included: number;
  billable: number;
  billedCents: number;
  stripeUsageRecordId: string | null;
  stripeSubscriptionItemId: string | null;
  error?: string;
}

export interface RollupOptions {
  /** When true, compute totals + billable but don't push to Stripe and don't persist the audit row. */
  dryRun?: boolean;
  /** Override the period-end timestamp (seconds since epoch). Defaults to "now or end-of-period whichever is earlier". */
  periodEndUnix?: number;
}

/**
 * Roll up a single client's usage for a given period (YYYY-MM).
 *
 * Returns one result entry per metered item. Resources with no matching
 * metered subscription item are NOT pushed to Stripe (we don't know which
 * Subscription Item to attach them to) and are omitted from the result.
 */
export async function rollupClientPeriod(
  clientId: number,
  period: string,
  opts: RollupOptions = {},
): Promise<RollupResult[]> {
  validatePeriod(period);

  // Step 1: SUM events per resource for this client/period.
  const totals = await db
    .select({
      resource: usageMeterEvents.resource,
      total: sql<string>`coalesce(sum(${usageMeterEvents.amount})::text, '0')`,
    })
    .from(usageMeterEvents)
    .where(and(
      eq(usageMeterEvents.clientId, clientId),
      eq(usageMeterEvents.period, period),
    ))
    .groupBy(usageMeterEvents.resource);

  const totalsByResource = new Map<string, number>();
  for (const t of totals) {
    totalsByResource.set(t.resource, parseFloat(t.total));
  }

  // Step 2: pull active metered items for this client.
  const items = await db
    .select()
    .from(meteredSubscriptionItems)
    .where(and(
      eq(meteredSubscriptionItems.clientId, clientId),
      eq(meteredSubscriptionItems.status, 'active'),
    ));

  if (items.length === 0) return [];

  const periodEndUnix = opts.periodEndUnix ?? defaultPeriodEndUnix(period);
  const results: RollupResult[] = [];

  for (const item of items) {
    const total = totalsByResource.get(item.resource) ?? 0;
    const included = parseFloat(item.includedQuantity);
    const billable = Math.max(0, total - included);
    const billedCents = Math.round(billable * item.unitPriceCents);

    let stripeUsageRecordId: string | null = null;
    let errorMessage: string | undefined;

    if (!opts.dryRun) {
      try {
        const { id } = await reportUsage(
          item.stripeSubscriptionItemId,
          billable,
          periodEndUnix,
        );
        stripeUsageRecordId = id;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        // Fall through; we still persist the audit row with id=null so a
        // future retry sees the gap.
      }

      // Step 4: upsert audit row. Unique index on (client_id, period, resource)
      // makes this safe to re-run.
      await upsertUsageBillingPeriod({
        clientId,
        period,
        resource: item.resource,
        totalQuantity: total,
        includedQuantity: included,
        billableQuantity: billable,
        unitPriceCents: item.unitPriceCents,
        billedAmountCents: billedCents,
        stripeUsageRecordId,
        reportedAt: stripeUsageRecordId ? new Date() : null,
      });
    }

    results.push({
      resource: item.resource,
      total,
      included,
      billable,
      billedCents,
      stripeUsageRecordId,
      stripeSubscriptionItemId: item.stripeSubscriptionItemId,
      ...(errorMessage ? { error: errorMessage } : {}),
    });
  }

  return results;
}

interface UpsertInput {
  clientId: number;
  period: string;
  resource: string;
  totalQuantity: number;
  includedQuantity: number;
  billableQuantity: number;
  unitPriceCents: number;
  billedAmountCents: number;
  stripeUsageRecordId: string | null;
  reportedAt: Date | null;
}

async function upsertUsageBillingPeriod(input: UpsertInput): Promise<void> {
  // Drizzle's onConflictDoUpdate needs the unique index target. The
  // composite unique index `usage_billing_periods_client_period_resource_unique`
  // covers (client_id, period, resource).
  await db
    .insert(usageBillingPeriods)
    .values({
      clientId: input.clientId,
      period: input.period,
      resource: input.resource,
      totalQuantity: input.totalQuantity.toString(),
      includedQuantity: input.includedQuantity.toString(),
      billableQuantity: input.billableQuantity.toString(),
      unitPriceCents: input.unitPriceCents,
      billedAmountCents: input.billedAmountCents,
      stripeUsageRecordId: input.stripeUsageRecordId,
      reportedAt: input.reportedAt,
    })
    .onConflictDoUpdate({
      target: [usageBillingPeriods.clientId, usageBillingPeriods.period, usageBillingPeriods.resource],
      set: {
        totalQuantity: input.totalQuantity.toString(),
        includedQuantity: input.includedQuantity.toString(),
        billableQuantity: input.billableQuantity.toString(),
        unitPriceCents: input.unitPriceCents,
        billedAmountCents: input.billedAmountCents,
        stripeUsageRecordId: input.stripeUsageRecordId,
        reportedAt: input.reportedAt,
      },
    });
}

function validatePeriod(period: string): void {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Invalid period "${period}", expected YYYY-MM`);
  }
}

/**
 * Default `periodEndUnix` for `reportUsage`: we want Stripe to attach the
 * usage to the billing period currently in flight. For a past period we use
 * the last second of that month. For the current month we use `now()` —
 * Stripe then puts the record in the active billing cycle.
 */
function defaultPeriodEndUnix(period: string): number {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-indexed
  const now = new Date();
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;

  if (isCurrentMonth) {
    return Math.floor(now.getTime() / 1000);
  }

  // Last second of the requested month, UTC.
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return Math.floor(monthEnd.getTime() / 1000);
}

/**
 * Helper for the cron worker: list all clients that have at least one
 * active `metered_subscription_items` row.
 */
export async function listClientsWithActiveMeteredItems(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ clientId: meteredSubscriptionItems.clientId })
    .from(meteredSubscriptionItems)
    .where(eq(meteredSubscriptionItems.status, 'active'));
  return rows.map(r => r.clientId);
}

/**
 * Returns the YYYY-MM string for the current UTC month.
 */
export function currentPeriodUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
