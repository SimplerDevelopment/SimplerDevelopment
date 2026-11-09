/**
 * PUX-174 (design doc screen 33): campaign rates as numbers a bar can draw.
 * Pure. `rate` is a whole percent or null when nothing was sent yet;
 * `scheduledLabel` is the send time a Scheduled pill sits next to.
 */

export function rate(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export function scheduledLabel(scheduledAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!scheduledAt) return null;
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return null;
  const sameWeek = Math.abs(d.getTime() - now.getTime()) < 7 * 86_400_000;
  return sameWeek
    ? d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
