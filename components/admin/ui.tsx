// Shared admin UI primitives — the stark (Geist/Vercel) design system in code.
//
// Presentational only (no hooks), so they work in both RSC and client pages.
// Every primitive reads the semantic tokens that `.admin-shell` overrides in
// globals.css, plus the `--admin-*` extras for accent / status colors. Pages
// compose these instead of hand-rolling card/table/badge markup.

import Link from 'next/link';
import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'accent';

const TONE_FG: Record<Tone, string> = {
  ok: 'var(--admin-ok)',
  warn: 'var(--admin-warn)',
  bad: 'var(--admin-bad)',
  neutral: 'var(--admin-neutral)',
  accent: 'var(--admin-accent)',
};
const TONE_BG: Record<Tone, string> = {
  ok: 'var(--admin-ok-bg)',
  warn: 'var(--admin-warn-bg)',
  bad: 'var(--admin-bad-bg)',
  neutral: 'transparent',
  accent: 'var(--admin-accent-glow)',
};

/** Page title + optional subtitle, with action slot pinned right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[25px] font-semibold tracking-tight text-foreground leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children && <div className="ml-auto flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

/** Button — renders a Link when `href` is set, otherwise a <button>. */
export function Button({
  href, onClick, type, variant = 'default', size = 'md', icon, children, disabled,
}: {
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'default' | 'primary';
  size?: 'md' | 'sm';
  icon?: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors border disabled:opacity-50';
  const sizes = { md: 'h-[34px] px-3 text-[13px]', sm: 'h-[30px] px-2.5 text-[12.5px]' };
  const variants = {
    default: 'bg-card text-foreground border-border hover:bg-[var(--admin-hover)] hover:border-[var(--admin-border-strong)]',
    primary: 'bg-primary text-primary-foreground border-[var(--primary)] hover:opacity-90',
  };
  const cls = `${base} ${sizes[size]} ${variants[variant]}`;
  const inner = <>{icon && <span className="material-icons text-[17px]">{icon}</span>}{children}</>;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type={type ?? 'button'} onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

/** A 7px status dot with a soft ring. */
export function StatusDot({ tone = 'neutral' }: { tone?: Tone }) {
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-full shrink-0"
      style={{ background: TONE_FG[tone], boxShadow: tone === 'neutral' ? undefined : `0 0 0 3px ${TONE_BG[tone]}` }}
    />
  );
}

/** Small pill. Pass a `tone` for token colors, or `className` to bring your own
 *  (e.g. the semantic status-color helpers in lib/portal-utils). */
export function Badge({ children, tone, className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  const toneCls = tone
    ? {
        ok: 'text-[var(--admin-ok)] bg-[var(--admin-ok-bg)]',
        warn: 'text-[var(--admin-warn)] bg-[var(--admin-warn-bg)]',
        bad: 'text-[var(--admin-bad)] bg-[var(--admin-bad-bg)]',
        neutral: 'text-muted-foreground bg-[var(--admin-surface-2)] border border-border',
        accent: 'text-[var(--admin-accent)] bg-[var(--admin-accent-glow)]',
      }[tone]
    : '';
  return <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full leading-tight ${toneCls} ${className}`}>{children}</span>;
}

/** KPI / metric card. `value` is rendered in tabular mono. `size='sm'` for the
 *  denser secondary tiles. `tone='bad'` flags an urgent metric. */
export function Stat({
  label, value, sub, icon, href, tone, size = 'md', trend,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: string;
  href?: string;
  tone?: 'bad';
  size?: 'md' | 'sm';
  /** Optional real series — renders a sparkline. Only pass when history exists. */
  trend?: number[];
}) {
  const cls = `block rounded-[7px] bg-card border ${size === 'sm' ? 'p-3.5' : 'p-4'} transition-colors ${
    href ? 'hover:border-[var(--admin-border-strong)]' : ''
  } ${tone === 'bad' ? 'border-[color-mix(in_srgb,var(--admin-bad)_45%,var(--border))]' : 'border-border'}`;
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.05em] font-semibold text-muted-foreground">
        {icon && <span className="material-icons text-[14px] text-muted-foreground/70">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className={`font-mono tabular-nums tracking-tight mt-2 ${size === 'sm' ? 'text-xl' : 'text-[26px]'} ${tone === 'bad' ? 'text-[var(--admin-bad)]' : 'text-foreground'}`}>
          {value}
        </div>
        {trend && trend.length > 1 && (
          <Sparkline values={trend} className={`shrink-0 mb-1 ${tone === 'bad' ? 'text-[var(--admin-bad)]' : 'text-[var(--admin-accent)]'} opacity-80`} />
        )}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </>
  );
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/** Tiny inline sparkline (SVG polyline). Inherits `currentColor`. */
export function Sparkline({ values, width = 60, height = 20, className = '' }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Segmented control — filter pills with optional counts. Controlled. */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-[6px] border border-border bg-[var(--admin-surface-2)]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12.5px] font-medium transition-colors ${
            value === o.value ? 'bg-card text-foreground border border-border' : 'text-muted-foreground hover:text-foreground border border-transparent'
          }`}
        >
          {o.label}
          {typeof o.count === 'number' && <span className="font-mono text-[10.5px] text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Search input with a leading icon. Controlled. */
export function SearchField({ value, onChange, placeholder = 'Search…', className = '' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 h-8 px-2.5 rounded-[6px] border border-border bg-[var(--admin-surface-2)] focus-within:border-[var(--admin-border-strong)] transition-colors ${className}`}>
      <span className="material-icons text-base text-muted-foreground">search</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent outline-none text-[13px] text-foreground placeholder:text-muted-foreground w-full"
      />
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  /** extra classes on the body cell */
  cellClass?: string;
  render: (row: T) => ReactNode;
}

/** Presentational data table. Compose Links inside `render` for navigation —
 *  kept router-free so the primitive stays usable in RSC pages. */
export function DataTable<T>({ columns, rows, rowKey, empty }: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: ReactNode;
}) {
  const align = { left: 'text-left', right: 'text-right', center: 'text-center' };
  if (rows.length === 0 && empty) {
    return <div className="border border-border rounded-[7px] bg-card">{empty}</div>;
  }
  return (
    <div className="border border-border rounded-[7px] bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${align[c.align ?? 'left']} text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold px-4 py-2.5 bg-[var(--admin-surface-2)] border-b border-border whitespace-nowrap`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-[var(--admin-hover)] transition-colors [&:last-child>td]:border-b-0">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-[13.5px] text-foreground border-b border-border ${align[c.align ?? 'left']} ${c.cellClass ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** CSS bar chart for a short series. Last bar is emphasised (current period). */
export function BarChart({ values, labels, format }: { values: number[]; labels?: string[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="flex items-end gap-1.5 h-32 px-4 pt-4">
        {values.map((v, i) => {
          const last = i === values.length - 1;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-[3px] transition-colors ${last ? 'bg-foreground' : 'bg-[var(--admin-border-strong)] hover:bg-[var(--admin-accent)]'}`}
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
              title={`${labels?.[i] ?? ''}${labels ? ' · ' : ''}${format ? format(v) : v}`}
            />
          );
        })}
      </div>
      {labels && (
        <div className="flex gap-1.5 px-4 pb-3">
          {labels.map((l, i) => <span key={i} className="flex-1 text-center font-mono text-[9.5px] text-muted-foreground">{l}</span>)}
        </div>
      )}
    </div>
  );
}

/** Bordered card with a header row (title + optional icon + right-aligned action). */
export function Panel({
  title, icon, action, children, className = '',
}: {
  title: string;
  icon?: string;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-border rounded-[7px] bg-card overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {icon && <span className="material-icons text-base text-muted-foreground">{icon}</span>}
        <h3 className="text-[13.5px] font-semibold text-foreground tracking-tight">{title}</h3>
        {action && (
          <Link href={action.href} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

/** Centered empty / error state for inside a Panel or a full page. */
export function EmptyState({
  icon, title, message, tone = 'neutral', action,
}: {
  icon: string;
  title: string;
  message?: string;
  tone?: 'neutral' | 'bad';
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <div
        className="w-12 h-12 rounded-[11px] grid place-items-center mb-4 border"
        style={tone === 'bad'
          ? { color: 'var(--admin-bad)', background: 'var(--admin-bad-bg)', borderColor: 'transparent' }
          : { color: 'var(--muted-foreground)', background: 'var(--admin-surface-2)', borderColor: 'var(--border)' }}
      >
        <span className="material-icons text-2xl">{icon}</span>
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {message && <p className="text-[13px] text-muted-foreground mt-1.5 max-w-sm">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
