/**
 * Pure presentational primitives for the brain dashboard tiles. No state, no
 * fetching — safe to import from either server or client components. Kept as
 * a separate file so the cached RSC tiles in this directory don't drag a
 * `'use client'` boundary into the render tree.
 *
 * The interactive Link / hover affordances inside each row are still
 * client-side at the framework level (Next.js Link), but these wrappers
 * themselves don't need React state — so this file can stay server-friendly.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface DashboardTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  createdByAi: boolean;
  meetingId: number | null;
  companyId: number | null;
  dealId: number | null;
  linkedName: string | null;
}

export interface DashboardRelationship {
  overlayId: number;
  type: string;
  priority: string;
  name: string;
  underlying: 'company' | 'deal';
  lastTouchAt: string | null;
  nextReviewAt: string | null;
  daysSinceTouch: number | null;
  staleAfterDays: number | null;
  openTaskCount: number;
}

export function Counter({
  icon,
  tone,
  label,
  value,
  href,
}: {
  icon: string;
  tone: string;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-card border border-border rounded-lg p-3 flex items-center gap-3 hover:border-primary/50 transition-colors"
    >
      <span className={`material-icons text-2xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </Link>
  );
}

export function Tile<T>({
  title,
  icon,
  tone,
  action,
  empty,
  items,
  render,
}: {
  title: string;
  icon: string;
  tone: string;
  action?: ReactNode;
  empty: string;
  items: T[];
  render: (item: T) => ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className={`material-icons text-base ${tone}`}>{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i}>{render(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TaskRow({
  task,
  highlightDue = false,
}: {
  task: DashboardTask;
  highlightDue?: boolean;
}) {
  const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null;
  return (
    <div className="text-sm">
      <div className="text-foreground truncate flex items-center gap-2">
        <span className="truncate">{task.title}</span>
        {task.createdByAi && (
          <span className="material-icons text-sm text-muted-foreground" title="AI-created">
            auto_awesome
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
        {dueLabel && (
          <span className={highlightDue ? 'text-red-600 dark:text-red-400' : ''}>{dueLabel}</span>
        )}
        {task.priority !== 'medium' && <span>{task.priority}</span>}
        {task.linkedName && (
          <span className="inline-flex items-center gap-0.5 truncate max-w-[160px]">
            <span className="material-icons text-sm">{task.companyId ? 'business' : 'handshake'}</span>
            {task.linkedName}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton tile used as the Suspense fallback for any async server tile in
 * the dashboard. Matches the rendered tile's height + spacing so the layout
 * doesn't shift when the tile resolves.
 */
export function TileSkeleton({ title }: { title: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-icons text-base text-muted-foreground/40">progress_activity</span>
        <span className="text-sm font-semibold text-muted-foreground/60">{title}</span>
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-muted/40 rounded w-3/4" />
        <div className="h-4 bg-muted/40 rounded w-1/2" />
        <div className="h-4 bg-muted/40 rounded w-2/3" />
      </div>
    </div>
  );
}

export function CountersSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-3 animate-pulse">
          <div className="h-6 w-6 bg-muted/40 rounded mb-2" />
          <div className="h-5 bg-muted/40 rounded w-12 mb-1" />
          <div className="h-3 bg-muted/40 rounded w-20" />
        </div>
      ))}
    </div>
  );
}
