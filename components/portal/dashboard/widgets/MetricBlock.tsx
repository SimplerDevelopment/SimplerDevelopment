/**
 * Stark-Warm KPI tile primitive.
 *
 * Renders a micro-label, a big mono value, an optional delta line,
 * and an optional mini sparkline — matching the `.stat` archetype
 * from the portal-redesign mockup.
 */
export default function MetricBlock({
  icon,
  color,
  value,
  label,
  delta,
  deltaDirection,
  sparkBars,
}: {
  icon: string;
  /** Tailwind color class applied to the icon (kept for backward-compat) */
  color: string;
  value: string | number;
  label: string;
  /** e.g. "+12%" or "−3" */
  delta?: string;
  /** Controls the status-tone color of the delta line */
  deltaDirection?: 'up' | 'down' | 'flat';
  /** Array of 0–1 heights for a mini sparkline (7–10 values typical) */
  sparkBars?: number[];
}) {
  const deltaColors: Record<string, string> = {
    up:   'text-[var(--portal-ok)]',
    down: 'text-[var(--portal-bad)]',
    flat: 'text-muted-foreground',
  };
  const deltaIcons: Record<string, string> = {
    up: 'arrow_upward',
    down: 'arrow_downward',
    flat: 'remove',
  };

  return (
    <div className="relative overflow-hidden px-[15px] py-[14px]">
      {/* Micro label */}
      <div className="flex items-center gap-1.5">
        <span className={`material-icons text-[14px] leading-none text-muted-foreground ${color}`}>{icon}</span>
        <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
          {label}
        </span>
      </div>

      {/* Big mono value */}
      <p className="mt-[9px] font-mono tabular-nums tracking-tight text-[26px] font-medium text-foreground leading-none">
        {value}
      </p>

      {/* Delta line */}
      {delta && deltaDirection && (
        <p className={`mt-[5px] inline-flex items-center gap-0.5 text-[11.5px] font-medium font-mono ${deltaColors[deltaDirection] ?? 'text-muted-foreground'}`}>
          <span className="material-icons text-[13px] leading-none">{deltaIcons[deltaDirection] ?? 'remove'}</span>
          {delta}
        </p>
      )}

      {/* Mini sparkline */}
      {sparkBars && sparkBars.length > 0 && (
        <div className="absolute right-[13px] bottom-[12px] flex items-end gap-[2px] h-[26px] opacity-85">
          {sparkBars.map((h, i) => (
            <span
              key={i}
              className={[
                'w-[3px] rounded-sm',
                i === sparkBars.length - 1
                  ? 'bg-primary'
                  : 'bg-[var(--portal-border-strong)]',
              ].join(' ')}
              style={{ height: `${Math.round(h * 26)}px` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
