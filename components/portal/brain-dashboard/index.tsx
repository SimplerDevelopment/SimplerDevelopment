/**
 * Streaming RSC version of the brain dashboard widgets. The shell renders
 * synchronously; each tile is wrapped in its own `<Suspense>` so the cached
 * data fetches resolve and stream in independently rather than blocking
 * each other. Previously this whole subtree was a single client component
 * that fetched after hydration — three round-trips in a waterfall.
 *
 * Drop-in for `<BrainDashboardWidgets />` from server-rendered pages (e.g.
 * `app/portal/dashboard/page.tsx`). The legacy client component is still
 * present at `components/portal/BrainDashboardWidgets.tsx` because the
 * `/portal/brain` page is `'use client'` and can't render an async server
 * component directly — that page-level conversion is tracked as TODO.
 */
import { Suspense } from 'react';
import { BrainDashboardSummaryTile } from './SummaryTile';
import { BrainAutomationsTile } from './AutomationsTile';
import { TileSkeleton, CountersSkeleton } from './parts';

interface Props {
  clientId: number;
}

export function BrainDashboardWidgetsServer({ clientId }: Props) {
  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <div className="space-y-4">
            <CountersSkeleton />
            <div className="grid md:grid-cols-2 gap-4">
              <TileSkeleton title="Needs review" />
              <TileSkeleton title="Overdue" />
              <TileSkeleton title="Stale prospects" />
              <TileSkeleton title="Priority relationships" />
              <TileSkeleton title="Blocked" />
              <TileSkeleton title="Upcoming" />
            </div>
            <TileSkeleton title="Recent Communication" />
          </div>
        }
      >
        <BrainDashboardSummaryTile clientId={clientId} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid md:grid-cols-2 gap-4">
            <TileSkeleton title="Active automations" />
            <TileSkeleton title="Recent automation runs" />
          </div>
        }
      >
        <BrainAutomationsTile clientId={clientId} />
      </Suspense>
    </div>
  );
}
