// Usage snapshots, threshold evaluation, and alert orchestrator for the
// per-domain SaaS billing model.
//
// Three exported entry points:
//   computeUsageSnapshot(clientId)  — pure-ish: reads DB, returns snapshot rows
//   evaluateThresholds(snapshot, thresholdRows) — pure: decides which alerts fire
//   runUsageAlerts()                — orchestrator: runs all clients, fires notifications
//
// Tenancy: every query is scoped by clientId. No unscoped table reads.

import { db } from '@/lib/db';
import {
  clients,
  clientServices,
  services,
  users,
  usageMeterEvents,
  meteredSubscriptionItems,
  usageThresholds,
  usageAlertEvents,
  notifications,
} from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import { getClientEntitlements } from '@/lib/billing/entitlements';
import { getMonthlyUsage } from '@/lib/ai-credits';
import { getResend } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsageSnapshotRow {
  resource: string;
  label: string;
  unit: string;
  used: number;
  included: number;
  /** used / included * 100, clamped to 0 when included = 0 */
  pct: number;
  overageRateCents: number;
  overageUnitSize: number;
  waivedForByok: boolean;
}

export interface ThresholdRow {
  resource: string;
  warnAtPct: number;
  hardLimitQuantity: number | null;
  notifyEmail: boolean;
  notifyPortal: boolean;
}

export type AlertLevel = 'warning' | 'exceeded' | 'hard_limit';

export interface PendingAlert {
  resource: string;
  label: string;
  unit: string;
  level: AlertLevel;
  used: number;
  included: number;
  pct: number;
  notifyEmail: boolean;
  notifyPortal: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Current billing period as 'YYYY-MM'. */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── computeUsageSnapshot ─────────────────────────────────────────────────────

/**
 * Build a usage snapshot for the given client covering every meter they're
 * entitled to plus a synthetic ai_tokens row.
 *
 * Rules for includedQuantity:
 *   1. Active meteredSubscriptionItems.includedQuantity for this resource (overrides catalog).
 *   2. Otherwise: bundleIncludedPerMonth if hasBundle, else includedPerMonth.
 *
 * For agency clients (gatingBypassed): only include meters that have at least
 * one usageMeterEvent row for the current period (don't alert on empty meters).
 *
 * ai_tokens: uses getMonthlyUsage() for `used` and sum of active
 * services.includedAiCredits for `included`.
 */
export async function computeUsageSnapshot(clientId: number): Promise<UsageSnapshotRow[]> {
  const period = currentPeriod();
  const entitlements = await getClientEntitlements(clientId);

  // ── Step 1: gather all meters this client might need ─────────────────────

  // Collect every metered resource from entitled domains (or all domains for bypass).
  const relevantDomains = entitlements.gatingBypassed
    ? FEATURE_DOMAINS
    : FEATURE_DOMAINS.filter((d) => entitlements.domains.has(d.key));

  // Flat list of meters, excluding ai_tokens (handled separately below).
  type MeterSpec = {
    resource: string;
    label: string;
    unit: string;
    includedPerMonth: number;
    bundleIncludedPerMonth: number;
    overageRateCents: number;
    overageUnitSize: number;
    waivedForByok: boolean;
  };

  const meterMap = new Map<string, MeterSpec>();
  for (const domain of relevantDomains) {
    for (const meter of domain.meters) {
      if (meter.resource === 'ai_tokens') continue; // handled separately
      if (!meterMap.has(meter.resource)) {
        meterMap.set(meter.resource, meter);
      }
    }
  }

  // ── Step 2: fetch usage totals for current period ─────────────────────────

  const resourceList = [...meterMap.keys()];

  const usageTotals = new Map<string, number>();
  if (resourceList.length > 0) {
    const rows = await db
      .select({
        resource: usageMeterEvents.resource,
        total: sql<string>`SUM(${usageMeterEvents.amount})`,
      })
      .from(usageMeterEvents)
      .where(
        and(
          eq(usageMeterEvents.clientId, clientId),
          eq(usageMeterEvents.period, period),
          inArray(usageMeterEvents.resource, resourceList),
        ),
      )
      .groupBy(usageMeterEvents.resource);
    for (const r of rows) {
      usageTotals.set(r.resource, Number(r.total ?? 0));
    }
  }

  // ── Step 3: fetch active meteredSubscriptionItems overrides ───────────────

  const overrideMap = new Map<string, number>();
  if (resourceList.length > 0) {
    const overrides = await db
      .select({
        resource: meteredSubscriptionItems.resource,
        includedQuantity: meteredSubscriptionItems.includedQuantity,
      })
      .from(meteredSubscriptionItems)
      .where(
        and(
          eq(meteredSubscriptionItems.clientId, clientId),
          eq(meteredSubscriptionItems.status, 'active'),
          inArray(meteredSubscriptionItems.resource, resourceList),
        ),
      );
    for (const o of overrides) {
      overrideMap.set(o.resource, Number(o.includedQuantity ?? 0));
    }
  }

  // ── Step 4: build snapshot rows for infra meters ─────────────────────────

  const snapshot: UsageSnapshotRow[] = [];

  for (const [resource, meter] of meterMap) {
    const used = usageTotals.get(resource) ?? 0;

    // For bypassed clients (agency) only report meters that have actual usage.
    if (entitlements.gatingBypassed && used === 0) continue;

    const included = overrideMap.has(resource)
      ? overrideMap.get(resource)!
      : entitlements.hasBundle
        ? meter.bundleIncludedPerMonth
        : meter.includedPerMonth;

    const pct = included > 0 ? (used / included) * 100 : 0;

    snapshot.push({
      resource,
      label: meter.label,
      unit: meter.unit,
      used,
      included,
      pct,
      overageRateCents: meter.overageRateCents,
      overageUnitSize: meter.overageUnitSize,
      waivedForByok: meter.waivedForByok,
    });
  }

  // ── Step 5: synthetic ai_tokens row ──────────────────────────────────────

  // included = sum of active services.includedAiCredits
  const aiServiceRows = await db
    .select({ credits: services.includedAiCredits })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));

  const aiIncluded = aiServiceRows.reduce((sum, r) => sum + (r.credits ?? 0), 0);
  const aiUsed = await getMonthlyUsage(clientId);

  // Include ai_tokens when the client has an allowance OR has usage.
  if (aiIncluded > 0 || aiUsed > 0) {
    const aiPct = aiIncluded > 0 ? (aiUsed / aiIncluded) * 100 : 0;
    snapshot.push({
      resource: 'ai_tokens',
      label: 'AI usage',
      unit: 'tokens',
      used: aiUsed,
      included: aiIncluded,
      pct: aiPct,
      overageRateCents: 100, // $1.00 per 100k
      overageUnitSize: 100_000,
      waivedForByok: true,
    });
  }

  return snapshot;
}

// ── evaluateThresholds ────────────────────────────────────────────────────────

/**
 * Pure function: given a usage snapshot and the client's saved threshold rows,
 * return the list of alerts that should be fired.
 *
 * Default thresholds (when no row exists for a resource):
 *   warnAtPct = 80, hardLimitQuantity = null, notifyEmail = true, notifyPortal = true
 *
 * Skips resources where included = 0 (no allowance → no meaningful threshold).
 */
export function evaluateThresholds(
  snapshot: UsageSnapshotRow[],
  thresholdRows: ThresholdRow[],
): PendingAlert[] {
  const thresholdMap = new Map<string, ThresholdRow>();
  for (const t of thresholdRows) {
    thresholdMap.set(t.resource, t);
  }

  const alerts: PendingAlert[] = [];

  for (const row of snapshot) {
    if (row.included <= 0) continue; // no allowance to threshold against

    const threshold = thresholdMap.get(row.resource) ?? {
      resource: row.resource,
      warnAtPct: 80,
      hardLimitQuantity: null,
      notifyEmail: true,
      notifyPortal: true,
    };

    const base = {
      resource: row.resource,
      label: row.label,
      unit: row.unit,
      used: row.used,
      included: row.included,
      pct: row.pct,
      notifyEmail: threshold.notifyEmail,
      notifyPortal: threshold.notifyPortal,
    };

    // Hard limit check (most severe — evaluate first).
    if (
      threshold.hardLimitQuantity !== null &&
      row.used >= threshold.hardLimitQuantity
    ) {
      alerts.push({ ...base, level: 'hard_limit' });
      continue; // one level per resource per run (most severe wins)
    }

    // Exceeded (100% of included).
    if (row.used >= row.included) {
      alerts.push({ ...base, level: 'exceeded' });
      continue;
    }

    // Warning (warnAtPct% of included).
    if (row.pct >= threshold.warnAtPct) {
      alerts.push({ ...base, level: 'warning' });
    }
  }

  return alerts;
}

// ── runUsageAlerts ────────────────────────────────────────────────────────────

/** Summary returned by the orchestrator for logging / cron response. */
export interface UsageAlertsResult {
  clientsProcessed: number;
  alertsFired: number;
  emailsSent: number;
  errors: string[];
}

function alertSubject(alert: PendingAlert): string {
  const pctStr = Math.round(alert.pct);
  switch (alert.level) {
    case 'warning':
      return `You've used ${pctStr}% of your included ${alert.label.toLowerCase()}`;
    case 'exceeded':
      return `You've exceeded your included ${alert.label.toLowerCase()} allowance`;
    case 'hard_limit':
      return `Hard limit reached for ${alert.label.toLowerCase()}`;
  }
}

function alertBody(alert: PendingAlert, clientEmail: string): string {
  const subject = alertSubject(alert);
  const usedFmt = alert.used.toLocaleString();
  const inclFmt = alert.included.toLocaleString();
  const billingUrl = 'https://app.simplerdevelopment.com/portal/settings/billing';

  return `
<p>Hi,</p>
<p><strong>${subject}.</strong></p>
<p>Current usage: <strong>${usedFmt} ${alert.unit}</strong> out of <strong>${inclFmt} ${alert.unit}</strong> included this month.</p>
${alert.level === 'exceeded'
  ? `<p>Additional usage is being billed at the overage rate. Visit your billing page to review charges or upgrade your plan.</p>`
  : alert.level === 'hard_limit'
    ? `<p>Usage has been stopped at your configured hard limit. Contact support or adjust your limit to resume.</p>`
    : `<p>You can upgrade or purchase additional capacity from your billing page.</p>`
}
<p><a href="${billingUrl}" style="color:#6366f1;">View billing &amp; plans →</a></p>
<p style="color:#6b7280;font-size:12px;">This alert was sent to ${clientEmail}. To change your notification preferences, visit your billing settings.</p>
`.trim();
}

/**
 * Main orchestrator: iterate all non-agency clients, compute snapshots,
 * evaluate thresholds, insert deduped alert records, and notify.
 *
 * Email is wrapped in try/catch so a Resend failure never prevents the
 * alert record from landing.
 */
export async function runUsageAlerts(): Promise<UsageAlertsResult> {
  const period = currentPeriod();
  const result: UsageAlertsResult = {
    clientsProcessed: 0,
    alertsFired: 0,
    emailsSent: 0,
    errors: [],
  };

  // Fetch all saas + byok clients with their owner's email.
  const clientRows = await db
    .select({
      clientId: clients.id,
      billingMode: clients.billingMode,
      userId: clients.userId,
    })
    .from(clients)
    .where(inArray(clients.billingMode, ['saas', 'byok']));

  if (clientRows.length === 0) return result;

  // Batch-fetch owner emails in one query.
  const ownerIds = [...new Set(clientRows.map((r) => r.userId).filter(Boolean))] as number[];
  const userRows =
    ownerIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];
  const userEmailMap = new Map(userRows.map((u) => [u.id, u.email]));

  for (const clientRow of clientRows) {
    result.clientsProcessed++;

    try {
      // ── Compute snapshot ──────────────────────────────────────────────────
      const snapshot = await computeUsageSnapshot(clientRow.clientId);
      if (snapshot.length === 0) continue;

      // ── Load threshold config for this client ─────────────────────────────
      const thresholdRows = await db
        .select({
          resource: usageThresholds.resource,
          warnAtPct: usageThresholds.warnAtPct,
          hardLimitQuantity: usageThresholds.hardLimitQuantity,
          notifyEmail: usageThresholds.notifyEmail,
          notifyPortal: usageThresholds.notifyPortal,
        })
        .from(usageThresholds)
        .where(eq(usageThresholds.clientId, clientRow.clientId));

      const mappedThresholds: ThresholdRow[] = thresholdRows.map((t) => ({
        resource: t.resource,
        warnAtPct: t.warnAtPct,
        hardLimitQuantity:
          t.hardLimitQuantity !== null ? Number(t.hardLimitQuantity) : null,
        notifyEmail: t.notifyEmail,
        notifyPortal: t.notifyPortal,
      }));

      // ── Evaluate ──────────────────────────────────────────────────────────
      const pendingAlerts = evaluateThresholds(snapshot, mappedThresholds);
      if (pendingAlerts.length === 0) continue;

      // ── Fire alerts (deduped via DB unique index) ─────────────────────────
      const ownerEmail = clientRow.userId ? userEmailMap.get(clientRow.userId) : undefined;

      for (const alert of pendingAlerts) {
        const snapshotRow = snapshot.find((s) => s.resource === alert.resource);
        if (!snapshotRow) continue;

        // Attempt insert — onConflictDoNothing is the dedupe guard.
        const inserted = await db
          .insert(usageAlertEvents)
          .values({
            clientId: clientRow.clientId,
            resource: alert.resource,
            period,
            level: alert.level,
            usageAtAlert: String(alert.used),
            includedQuantity: String(alert.included),
          })
          .onConflictDoNothing()
          .returning({ id: usageAlertEvents.id });

        // Only notify when the row was actually new (returning() is non-empty).
        if (inserted.length === 0) continue;

        result.alertsFired++;

        // ── Portal notification ───────────────────────────────────────────
        if (alert.notifyPortal && clientRow.userId) {
          try {
            await db.insert(notifications).values({
              userId: clientRow.userId,
              kind: 'billing.usage_alert',
              title: alertSubject(alert),
              body: `${alert.used.toLocaleString()} / ${alert.included.toLocaleString()} ${alert.unit} used (${Math.round(alert.pct)}%)`,
              payload: {
                resource: alert.resource,
                level: alert.level,
                period,
                pct: Math.round(alert.pct),
              },
            });
          } catch (err) {
            result.errors.push(
              `Portal notify failed for client ${clientRow.clientId} resource ${alert.resource}: ${String(err)}`,
            );
          }
        }

        // ── Email notification ────────────────────────────────────────────
        if (alert.notifyEmail && ownerEmail) {
          try {
            const resend = getResend();
            await resend.emails.send({
              from: 'SimplerDevelopment <billing@simplerdevelopment.com>',
              to: ownerEmail,
              subject: alertSubject(alert),
              html: alertBody(alert, ownerEmail),
            });
            result.emailsSent++;
          } catch (err) {
            // Email failure must not abort the run.
            result.errors.push(
              `Email failed for client ${clientRow.clientId} resource ${alert.resource}: ${String(err)}`,
            );
          }
        }
      }
    } catch (err) {
      result.errors.push(`Client ${clientRow.clientId} failed: ${String(err)}`);
    }
  }

  return result;
}
