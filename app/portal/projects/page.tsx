import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
};

const statusIcon: Record<string, string> = {
  active: 'play_circle',
  paused: 'pause_circle',
  completed: 'check_circle',
  archived: 'archive',
};

export default async function PortalProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const clientProjects = await db.select().from(projects).where(eq(projects.clientId, client.id)).orderBy(projects.createdAt);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Track progress on your active projects.</p>
        </div>
        <Link
          href="/portal/suggested-projects"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <span className="material-icons text-base">rocket_launch</span>
          Suggested Projects
        </Link>
      </div>

      {clientProjects.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">view_kanban</span>
          <h3 className="mt-4 font-semibold text-foreground">No projects yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Your projects will appear here once your team sets them up.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientProjects.map((project) => (
            <Link
              key={project.id}
              href={`/portal/projects/${project.id}`}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="material-icons text-2xl text-primary group-hover:scale-110 transition-transform">view_kanban</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusColor[project.status] ?? 'bg-muted text-muted-foreground'}`}>
                  <span className="material-icons text-xs">{statusIcon[project.status] ?? 'circle'}</span>
                  {project.status}
                </span>
              </div>
              <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
              {project.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{project.description}</p>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                {project.startDate && (
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-xs">calendar_today</span>
                    {new Date(project.startDate).toLocaleDateString()}
                  </span>
                )}
                {project.dueDate && (
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-xs">event</span>
                    Due {new Date(project.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
