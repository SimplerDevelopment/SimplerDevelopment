import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, projects, kanbanColumns, kanbanCards, kanbanCardFiles, sprints } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import KanbanBoard from '@/components/portal/KanbanBoard';
import ProjectFilesTab from '@/components/portal/ProjectFilesTab';
import SprintPlanning from '@/components/portal/SprintPlanning';
import { isPortalStaff } from '@/lib/portal';

export default async function ProjectKanbanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === 'files' ? 'files' : tab === 'sprints' ? 'sprints' : 'board';
  const projectId = parseInt(id, 10);
  const [staff, userId] = [await isPortalStaff(), parseInt(session.user.id, 10)];

  // Get client (clients see only their projects; staff can see any)
  let clientId: number | null = null;
  if (!staff) {
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!client) redirect('/portal/dashboard');
    clientId = client.id;
  }

  const projectQuery = staff
    ? db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    : db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.clientId, clientId!))).limit(1);

  const [project] = await projectQuery;
  if (!project) notFound();

  const columns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, projectId)).orderBy(kanbanColumns.order);
  const cards = await db.select().from(kanbanCards).where(eq(kanbanCards.projectId, projectId)).orderBy(kanbanCards.order);

  const projectSprints = await db
    .select({ id: sprints.id, name: sprints.name, status: sprints.status })
    .from(sprints)
    .where(eq(sprints.projectId, projectId))
    .orderBy(sprints.order);

  const cardIds = cards.map(c => c.id);
  const files = cardIds.length > 0
    ? await db.select({ cardId: kanbanCardFiles.cardId, url: kanbanCardFiles.url, mimeType: kanbanCardFiles.mimeType })
        .from(kanbanCardFiles)
        .where(inArray(kanbanCardFiles.cardId, cardIds))
    : [];

  const filesByCard = files.reduce<Record<number, { url: string; mimeType: string }[]>>((acc, f) => {
    (acc[f.cardId] ??= []).push({ url: f.url, mimeType: f.mimeType });
    return acc;
  }, {});

  const columnsWithCards = columns.map((col) => ({
    ...col,
    cards: cards.filter((c) => c.columnId === col.id).map(c => ({
      ...c,
      attachments: filesByCard[c.id] ?? [],
    })),
  }));

  const statusColor: Record<string, string> = {
    active: 'text-green-600',
    paused: 'text-yellow-600',
    completed: 'text-blue-600',
    archived: 'text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/portal/projects" className="hover:text-foreground transition-colors">Projects</Link>
            <span className="material-icons text-sm">chevron_right</span>
            <span className="text-foreground">{project.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`flex items-center gap-1 text-sm font-medium ${statusColor[project.status] ?? 'text-muted-foreground'}`}>
            <span className="material-icons text-base">circle</span>
            {project.status}
          </span>
          {project.dueDate && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <span className="material-icons text-base">event</span>
              Due {new Date(project.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'board',   href: `/portal/projects/${projectId}`,                label: 'Board',   icon: 'view_kanban' },
          { key: 'sprints', href: `/portal/projects/${projectId}?tab=sprints`,    label: 'Sprints', icon: 'sprint' },
          { key: 'files',   href: `/portal/projects/${projectId}?tab=files`,      label: 'Files',   icon: 'folder' },
        ] as const).map(t => (
          <Link key={t.key} href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <span className="material-icons text-sm align-middle mr-1">{t.icon}</span>{t.label}
          </Link>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'files' ? (
        <ProjectFilesTab projectId={projectId} />
      ) : activeTab === 'sprints' ? (
        <SprintPlanning projectId={projectId} isStaff={staff} />
      ) : columnsWithCards.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">view_kanban</span>
          <h3 className="mt-4 font-semibold text-foreground">Board not set up yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Your team will set up the project board shortly.</p>
        </div>
      ) : activeTab === 'board' && (
        <KanbanBoard
          projectId={projectId}
          initialColumns={columnsWithCards}
          isStaff={staff}
          currentUserId={userId}
          sprints={projectSprints}
        />
      )}
    </div>
  );
}
