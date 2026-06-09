import Link from 'next/link';
import { getDashboardSummary } from '@/lib/brain/dashboard';

export default async function BrainTasksWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const data = await getDashboardSummary(clientId);
  const { openTasks, aiCreatedTasks } = data.counts;

  // Merge overdue + upcoming, sort overdue first then by dueDate, take top 3
  const now = new Date();
  const overdueTasks = data.overdueTasks;
  const upcomingTasks = data.upcomingTasks;
  const allSorted = [
    ...overdueTasks,
    ...upcomingTasks.filter(
      (t) => !overdueTasks.some((o) => o.id === t.id),
    ),
  ].slice(0, 3);

  const overdueCount = overdueTasks.length;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 flex-wrap">
        <div>
          <span className="text-2xl font-bold text-foreground">{openTasks}</span>
          <span className="ml-1.5 text-sm text-muted-foreground">open</span>
        </div>
        {overdueCount > 0 && (
          <div>
            <span className="text-2xl font-bold text-red-600 dark:text-red-400">
              {overdueCount}
            </span>
            <span className="ml-1.5 text-sm text-muted-foreground">overdue</span>
          </div>
        )}
        <div>
          <span className="text-2xl font-bold text-primary">{aiCreatedTasks}</span>
          <span className="ml-1.5 text-sm text-muted-foreground">AI-created</span>
        </div>
      </div>

      {allSorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No open tasks.{' '}
          <Link href="/portal/brain/tasks" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {allSorted.map((t) => {
            const isOverdue =
              t.dueDate !== null && new Date(t.dueDate) < now;
            return (
              <li key={t.id}>
                <Link
                  href="/portal/brain/tasks"
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0 flex items-start gap-2">
                    <span className="material-icons text-base text-muted-foreground shrink-0 mt-0.5">
                      {t.createdByAi ? 'auto_awesome' : 'checklist'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                      {t.dueDate && (
                        <p
                          className={`text-xs ${
                            isOverdue
                              ? 'text-red-600 dark:text-red-400 font-medium'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {isOverdue ? 'Overdue · ' : 'Due '}
                          {new Date(t.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.priority === 'urgent'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                        : t.priority === 'high'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t.priority}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {allSorted.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <Link
            href="/portal/brain/tasks"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <span className="material-icons text-sm">arrow_forward</span>
            View all tasks
          </Link>
        </div>
      )}
    </div>
  );
}
