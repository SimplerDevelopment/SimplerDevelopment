/**
 * Server-rendered brain dashboard counters + tile grid. Streams in via
 * Suspense — the cached `getDashboardSummary` call replaces the old client
 * useEffect fetch, so the initial HTML can include the real data instead of
 * a loading spinner. When this component is wrapped in `<Suspense>`, Next
 * streams the surrounding shell immediately and patches in this subtree
 * once the cached query resolves.
 */
import Link from 'next/link';
import { getDashboardSummary } from '@/lib/brain/dashboard';
import { Counter, Tile, TaskRow } from './parts';

interface Props {
  clientId: number;
}

export async function BrainDashboardSummaryTile({ clientId }: Props) {
  const data = await getDashboardSummary(clientId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Counter
          icon="reviews"
          tone="text-blue-600 dark:text-blue-400"
          label="Pending review"
          value={data.counts.pendingReviewItems}
          href="/portal/brain/communications?status=needs_review"
        />
        <Counter
          icon="checklist"
          tone="text-foreground"
          label="Open tasks"
          value={data.counts.openTasks}
          href="/portal/brain/tasks"
        />
        <Counter
          icon="auto_awesome"
          tone="text-primary"
          label="AI-created tasks"
          value={data.counts.aiCreatedTasks}
          href="/portal/brain/tasks?filter=ai"
        />
        <Counter
          icon="group_work"
          tone="text-cyan-600 dark:text-cyan-400"
          label="Relationships"
          value={data.counts.relationships}
          href="/portal/brain/relationships"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Tile
          title="Needs review"
          icon="reviews"
          tone="text-blue-600 dark:text-blue-400"
          action={
            <Link href="/portal/brain/communications" className="text-xs text-primary hover:underline">
              View all
            </Link>
          }
          empty="Nothing waiting for review."
          items={data.needsReviewMeetings}
          render={(m) => (
            <Link
              href={`/portal/brain/communications/${m.id}/review`}
              className="block hover:text-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{m.title}</span>
                {m.pendingReviewItems > 0 && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
                    {m.pendingReviewItems}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(m.meetingDate || m.createdAt).toLocaleDateString()}
              </span>
            </Link>
          )}
        />

        <Tile
          title="Overdue"
          icon="event_busy"
          tone="text-red-600 dark:text-red-400"
          action={
            <Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">
              All tasks
            </Link>
          }
          empty="Nothing overdue."
          items={data.overdueTasks}
          render={(t) => <TaskRow task={t} highlightDue />}
        />

        <Tile
          title="Stale prospects"
          icon="schedule"
          tone="text-amber-600 dark:text-amber-400"
          action={
            <Link
              href="/portal/brain/relationships?view=stale"
              className="text-xs text-primary hover:underline"
            >
              All
            </Link>
          }
          empty="No stale prospects."
          items={data.staleProspects}
          render={(r) => (
            <Link
              href={`/portal/brain/relationships/${r.overlayId}`}
              className="block hover:text-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{r.name}</span>
                <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">
                  {r.daysSinceTouch}d
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {r.type.replace(/_/g, ' ')} · stale after {r.staleAfterDays}d
              </span>
            </Link>
          )}
        />

        <Tile
          title="Priority relationships"
          icon="flag"
          tone="text-red-600 dark:text-red-400"
          action={
            <Link
              href="/portal/brain/relationships?priority=high"
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          }
          empty="No high-priority relationships."
          items={data.priorityRelationships}
          render={(r) => (
            <Link
              href={`/portal/brain/relationships/${r.overlayId}`}
              className="block hover:text-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{r.name}</span>
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    r.priority === 'critical'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {r.priority}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {r.type.replace(/_/g, ' ')}
                {r.openTaskCount > 0 && ` · ${r.openTaskCount} open`}
              </span>
            </Link>
          )}
        />

        <Tile
          title="Blocked"
          icon="block"
          tone="text-muted-foreground"
          action={
            <Link
              href="/portal/brain/tasks?status=blocked"
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          }
          empty="Nothing blocked."
          items={data.blockedTasks}
          render={(t) => <TaskRow task={t} />}
        />

        <Tile
          title="Upcoming"
          icon="event"
          tone="text-foreground"
          action={
            <Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">
              View all
            </Link>
          }
          empty="No upcoming due dates."
          items={data.upcomingTasks}
          render={(t) => <TaskRow task={t} />}
        />
      </div>

      {/* Recent communication */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">forum</span>
            Recent Communication
          </h2>
          <Link
            href="/portal/brain/communications/new"
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            <span className="material-icons text-sm">add</span>
            New note
          </Link>
        </div>
        {data.recentMeetings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No notes yet. Paste your first transcript or forward an email to get started.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recentMeetings.map((m) => (
              <li key={m.id} className="py-2">
                <Link
                  href={`/portal/brain/communications/${m.id}`}
                  className="flex items-center justify-between hover:text-primary"
                >
                  <span className="text-sm text-foreground truncate">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.status.replace(/_/g, ' ')} · {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
