import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq, and, ne, count, desc } from 'drizzle-orm';
import Link from 'next/link';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  archived: 'bg-muted text-muted-foreground',
};

export default async function ProjectsOverviewWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [countResult, recent] = await Promise.all([
    db
      .select({ count: count() })
      .from(projects)
      .where(
        and(
          eq(projects.clientId, clientId),
          eq(projects.status, 'active'),
          ne(projects.status, 'archived'),
        ),
      ),
    db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(
        and(
          eq(projects.clientId, clientId),
          ne(projects.status, 'archived'),
        ),
      )
      .orderBy(desc(projects.updatedAt))
      .limit(3),
  ]);

  const activeCount = countResult[0]?.count ?? 0;

  return (
    <div>
      <div className="mb-3">
        <span className="text-2xl font-bold text-foreground">{activeCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          active project{activeCount !== 1 ? 's' : ''}
        </span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No projects yet.{' '}
          <Link href="/portal/projects" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {recent.map((p) => (
            <li key={p.id}>
              <Link
                href={`/portal/projects/${p.id}`}
                className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <p className="text-sm font-medium text-foreground truncate min-w-0">{p.name}</p>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                    statusColors[p.status] ?? statusColors.archived
                  }`}
                >
                  {p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 pt-3 border-t border-border">
        <Link
          href="/portal/projects"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <span className="material-icons text-sm">folder_open</span>
          View all projects
        </Link>
      </div>
    </div>
  );
}
