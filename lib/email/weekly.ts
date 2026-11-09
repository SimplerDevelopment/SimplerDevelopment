/**
 * PUX-205 (design doc screen 69): a twelve-week trend built only from the
 * campaigns the analytics page already lists — bucketed by sentAt. There is
 * no history table; weeks with nothing sent are honest zeros.
 */
export interface WeekPoint { weekStart: Date; sent: number; opened: number; clicked: number }

export function weeklySeries(
  campaigns: { sentAt: string | null; totalSent: number; totalOpened: number; totalClicked: number }[],
  weeks = 12,
  now: Date = new Date(),
): WeekPoint[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay() - 7 * (weeks - 1));
  const points: WeekPoint[] = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + 7 * i);
    return { weekStart: d, sent: 0, opened: 0, clicked: 0 };
  });
  for (const c of campaigns) {
    if (!c.sentAt) continue;
    const t = new Date(c.sentAt).getTime();
    const i = Math.floor((t - start.getTime()) / (7 * 86_400_000));
    if (i < 0 || i >= weeks) continue;
    points[i].sent += c.totalSent; points[i].opened += c.totalOpened; points[i].clicked += c.totalClicked;
  }
  return points;
}

/** SVG polyline points for one metric, scaled to the series' own max. */
export function seriesPoints(points: WeekPoint[], key: 'sent' | 'opened' | 'clicked', width = 160, height = 36): string {
  const max = Math.max(1, ...points.map((p) => p[key]));
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  return points.map((p, i) => `${(i * step).toFixed(1)},${(height - (p[key] / max) * (height - 2) - 1).toFixed(1)}`).join(' ');
}
