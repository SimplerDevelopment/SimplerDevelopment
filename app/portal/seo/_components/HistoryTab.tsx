// History tab — reads straight off the project detail's `runs` (last 10,
// already fetched by the dashboard shell), no extra request needed.

import { pCard } from '@/components/portal/portal-ui';
import { HealthScoreBadge } from './HealthScoreBadge';
import { RunStatusPill } from './RunStatusPill';
import { relativeTime } from './format';
import type { SeoRun } from './types';

export function HistoryTab({ runs }: { runs: SeoRun[] }) {
  if (runs.length === 0) {
    return (
      <div className={`${pCard} p-10 text-center`}>
        <span className="material-icons text-4xl text-muted-foreground/50 mb-2">history</span>
        <p className="text-sm text-muted-foreground">No crawl history yet.</p>
      </div>
    );
  }

  return (
    <div className={`${pCard} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Pages</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Score</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Critical</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Warning</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Notice</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{relativeTime(run.createdAt)}</td>
              <td className="px-4 py-2.5">
                <RunStatusPill status={run.status} />
                {run.status === 'failed' && run.error && (
                  <p className="text-xs text-destructive mt-1 max-w-xs truncate" title={run.error}>
                    {run.error}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{run.pagesCrawled}</td>
              <td className="px-4 py-2.5">
                <HealthScoreBadge score={run.healthScore} />
              </td>
              <td className="px-4 py-2.5 text-red-600 dark:text-red-400">{run.criticalCount}</td>
              <td className="px-4 py-2.5 text-yellow-600 dark:text-yellow-400">{run.warningCount}</td>
              <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400">{run.noticeCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
