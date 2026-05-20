// Pure date arithmetic for card_recurrences. Given a cadence + the previous
// fire time, returns the next fire time at hour_utc on the configured day.
// Kept DB-free so it can be unit-tested without DATABASE_URL.

export type Cadence = 'daily' | 'weekly' | 'monthly';

export interface RecurrenceConfig {
  cadence: Cadence;
  /** 0=Sun..6=Sat. Required for weekly. */
  dayOfWeek?: number | null;
  /** 1..28. Required for monthly. (28 to avoid Feb edge cases.) */
  dayOfMonth?: number | null;
  /** 0..23 — fire hour in UTC. */
  hourUtc: number;
}

/**
 * Returns the next fire timestamp strictly after `from`. For weekly, it
 * advances to the next occurrence of dayOfWeek; for monthly, the next
 * occurrence of dayOfMonth (rolling to next month if today's that day has
 * passed). Daily simply adds one day.
 */
export function computeNextFireAt(from: Date, cfg: RecurrenceConfig): Date {
  const next = new Date(from.getTime());
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(cfg.hourUtc);

  if (cfg.cadence === 'daily') {
    if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (cfg.cadence === 'weekly') {
    const target = cfg.dayOfWeek ?? 1; // default Monday
    const currentDow = next.getUTCDay();
    let delta = (target - currentDow + 7) % 7;
    if (delta === 0 && next.getTime() <= from.getTime()) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
  }

  // monthly
  const targetDom = Math.min(28, Math.max(1, cfg.dayOfMonth ?? 1));
  next.setUTCDate(targetDom);
  if (next.getTime() <= from.getTime()) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(targetDom);
  }
  return next;
}

/**
 * Resolves the rendered title for a recurrence — replaces `{{date}}` in the
 * pattern with the YYYY-MM-DD form of the fire date so daily/weekly cards
 * get unique titles. Returns the pattern unchanged when no token is present.
 */
export function renderRecurrenceTitle(pattern: string, fireDate: Date): string {
  const iso = fireDate.toISOString().slice(0, 10);
  return pattern.replace(/\{\{\s*date\s*\}\}/g, iso);
}
