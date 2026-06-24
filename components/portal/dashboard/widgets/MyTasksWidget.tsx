import { db } from '@/lib/db';
import { projects, kanbanCards, kanbanCardAssignees } from '@/lib/db/schema';
import { eq, and, ne, count, asc, inArray, isNotNull } from 'drizzle-orm';
import Link from 'next/link';

export default async function MyTasksWidget({
  clientId,
  userId,
}: {
  clientId: number;
  userId: number;
}) {
  // Resolve project IDs owned by this client first (tenancy scoping).
  const clientProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.clientId, clientId));

  const projectIds = clientProjects.map((p) => p.id);

  if (projectIds.length === 0) {
    return (
      <div>
        <div className="mb-3">
          <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">0</span>
          <span className="ml-2 text-sm text-muted-foreground">open tasks</span>
        </div>
        <p className="text-sm text-muted-foreground py-2 text-center">
          No projects yet.{' '}
          <Link href="/portal/projects" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    );
  }

  // Cards assigned to this user within this client's projects, excluding done/canceled.
  const [countResult, topTasks] = await Promise.all([
    db
      .select({ count: count() })
      .from(kanbanCards)
      .innerJoin(kanbanCardAssignees, eq(kanbanCardAssignees.cardId, kanbanCards.id))
      .where(
        and(
          inArray(kanbanCards.projectId, projectIds),
          eq(kanbanCardAssignees.userId, userId),
          ne(kanbanCards.workflowState, 'done'),
          ne(kanbanCards.workflowState, 'canceled'),
        ),
      ),
    db
      .select({
        id: kanbanCards.id,
        title: kanbanCards.title,
        projectId: kanbanCards.projectId,
        dueDate: kanbanCards.dueDate,
        workflowState: kanbanCards.workflowState,
      })
      .from(kanbanCards)
      .innerJoin(kanbanCardAssignees, eq(kanbanCardAssignees.cardId, kanbanCards.id))
      .where(
        and(
          inArray(kanbanCards.projectId, projectIds),
          eq(kanbanCardAssignees.userId, userId),
          ne(kanbanCards.workflowState, 'done'),
          ne(kanbanCards.workflowState, 'canceled'),
          isNotNull(kanbanCards.dueDate),
        ),
      )
      .orderBy(asc(kanbanCards.dueDate))
      .limit(5),
  ]);

  const openCount = countResult[0]?.count ?? 0;
  const now = new Date();

  // Collect project IDs from topTasks to look up names.
  const taskProjectIds = [...new Set(topTasks.map((t) => t.projectId))];
  const projectNames: Record<number, string> = {};
  if (taskProjectIds.length > 0) {
    const rows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, taskProjectIds));
    rows.forEach((r) => {
      projectNames[r.id] = r.name;
    });
  }

  return (
    <div>
      <div className="mb-3">
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{openCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          open task{openCount !== 1 ? 's' : ''}
        </span>
      </div>
      {topTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No tasks due.{' '}
          <Link href="/portal/my-tasks" className="text-primary hover:underline">
            View all tasks
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {topTasks.map((task) => {
            const due = task.dueDate ? new Date(task.dueDate) : null;
            const isOverdue = due !== null && due < now;
            return (
              <li key={task.id}>
                <Link
                  href="/portal/my-tasks"
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {projectNames[task.projectId] ?? 'Unknown project'}
                    </p>
                  </div>
                  {due && (
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        isOverdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                      }`}
                    >
                      {due.toLocaleDateString()}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 pt-3 border-t border-border">
        <Link
          href="/portal/my-tasks"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <span className="material-icons text-sm">task_alt</span>
          View all my tasks
        </Link>
      </div>
    </div>
  );
}
