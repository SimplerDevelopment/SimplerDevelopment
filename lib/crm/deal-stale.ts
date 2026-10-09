/**
 * PUX-171 (design doc screen 30): when is a deal "stalled"?
 *
 * Same rule as the weekly stale-deals cron (app/api/cron/stale-crm-deals/route.ts):
 * an open deal with no CRM activity for 30 days — counted from the deal's
 * creation when it has never had an activity. The cron keeps its own raw SQL;
 * change both if the threshold moves.
 */

export const STALE_AFTER_DAYS = 30;

interface DealAge { lastActivityAt?: string | null; createdAt: string }

export function daysSinceActivity(d: DealAge, now: number = Date.now()): number {
  const last = new Date(d.lastActivityAt ?? d.createdAt).getTime();
  return Math.max(0, Math.floor((now - last) / 86_400_000));
}

export function isStale(d: DealAge & { status: string }, now: number = Date.now()): boolean {
  return d.status === 'open' && daysSinceActivity(d, now) >= STALE_AFTER_DAYS;
}
