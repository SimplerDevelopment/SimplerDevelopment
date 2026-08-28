/**
 * PUX-212 (design doc screen 76): the server's z / p / lift / significant as
 * one plain pill. Same floor the detail page already applies before it
 * shows a green check — MIN_SAMPLE_PER_ARM visitors on both arms — so the
 * pill and the icon never disagree.
 */
export const MIN_SAMPLE_PER_ARM = 100;

export type Confidence = { label: string; tone: 'ok' | 'warn' | 'muted' };

export function confidencePill(
  c: { variantKey: string; controlKey: string; lift: number; significant: boolean },
  stats: { key: string; views: number }[],
  minPerArm = MIN_SAMPLE_PER_ARM,
): Confidence {
  const views = (k: string) => stats.find((s) => s.key === k)?.views ?? 0;
  if (views(c.variantKey) < minPerArm || views(c.controlKey) < minPerArm) return { label: 'Too early to call', tone: 'muted' };
  if (!c.significant) return { label: 'No clear difference', tone: 'muted' };
  const pct = `${Math.abs(c.lift * 100).toFixed(1)}%`;
  return c.lift > 0 ? { label: `Winning · +${pct}`, tone: 'ok' } : { label: `Losing · −${pct}`, tone: 'warn' };
}
