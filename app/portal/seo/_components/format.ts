// Formatting + tiny classification helpers shared across the SEO Intelligence
// tab components. No shared portal-wide relativeTime util exists yet (each
// page that needs one hand-rolls a small copy — see NotificationBell.tsx) so
// this follows the same house pattern rather than inventing a new shared lib.

export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return 'never';
  const diff = Math.max(0, Date.now() - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export type HealthTier = 'good' | 'ok' | 'bad' | 'none';

export function healthScoreTier(score: number | null): HealthTier {
  if (score == null) return 'none';
  if (score >= 90) return 'good';
  if (score >= 70) return 'ok';
  return 'bad';
}

export const healthScoreClasses: Record<HealthTier, string> = {
  good: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ok: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  bad: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  none: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export type IssueSeverity = 'critical' | 'warning' | 'notice';

export const severityClasses: Record<IssueSeverity, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  notice: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export const severityIcons: Record<IssueSeverity, string> = {
  critical: 'error',
  warning: 'warning',
  notice: 'info',
};

export function isRunActive(status: string | null | undefined): boolean {
  return status === 'queued' || status === 'running';
}

// ── Search Performance formatting ───────────────────────────────────────────
// GSC's ctr/avgCtr come through the API as a 0-1 fraction; position as a
// float (1-based rank). Both are display-only concerns local to this tab.

/** 0-1 fraction → "12.3%". */
export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** GSC's 1-based average rank → one decimal place, e.g. "4.2". */
export function formatPosition(position: number): string {
  return position.toFixed(1);
}

export type DeltaTone = 'up' | 'down' | 'flat';

export function deltaTone(delta: number): DeltaTone {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

export const deltaClasses: Record<DeltaTone, string> = {
  up: 'text-green-600 dark:text-green-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-muted-foreground',
};

/** Signed, comma-grouped delta, e.g. "+128" / "-42" / "0". */
export function formatSignedNumber(n: number): string {
  return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}
