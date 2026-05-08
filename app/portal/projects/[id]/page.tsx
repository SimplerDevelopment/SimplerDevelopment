import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanColumns, kanbanCards, kanbanCardFiles, kanbanCardLabels, kanbanLabels, kanbanCardChecklistItems, kanbanCardAssignees, kanbanCardDependencies, users, sprints } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import KanbanBoard from '@/components/portal/KanbanBoard';
import ProjectFilesTab from '@/components/portal/ProjectFilesTab';
import ProjectDescription from '@/components/portal/ProjectDescription';
import ProjectStatusControl from '@/components/portal/ProjectStatusControl';
import ProjectWebhooksPanel from '@/components/portal/ProjectWebhooksPanel';
import SprintPlanning from '@/components/portal/SprintPlanning';
import ProjectMembersTab from '@/components/portal/ProjectMembersTab';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';
import { getProjectRole } from '@/lib/portal/project-access';
import { canEditProject, canManageProject } from '@/lib/portal/project-permissions';

export default async function ProjectKanbanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === 'files' ? 'files'
    : tab === 'sprints' ? 'sprints'
    : tab === 'members' ? 'members'
    : tab === 'settings' ? 'settings'
    : 'board';
  const projectId = parseInt(id, 10);
  const [staff, userId] = [await isPortalStaff(), parseInt(session.user.id, 10)];

  // Get client (clients see only their projects; staff can see any).
  // Use getPortalClient so team-membership users (clientMembers) resolve too,
  // and the active-client cookie is respected for multi-client users.
  let clientId: number | null = null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client) redirect('/portal/dashboard');
    clientId = client.id;
  }

  const projectQuery = staff
    ? db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    : db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.clientId, clientId!))).limit(1);

  const [project] = await projectQuery;
  if (!project) notFound();

  // Resolve the caller's role on this project. Staff resolve to 'owner' and skip
  // the per-project members lookup; non-staff users with no membership row
  // inherit 'viewer' so they can read the board but not mutate.
  const role = staff ? 'owner' : (await getProjectRole(userId, projectId)) ?? 'viewer';
  const canEdit = canEditProject(role);
  const canManage = canManageProject(role);

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

  const cardLabels = cardIds.length > 0
    ? await db
        .select({
          cardId: kanbanCardLabels.cardId,
          id: kanbanLabels.id,
          name: kanbanLabels.name,
          color: kanbanLabels.color,
        })
        .from(kanbanCardLabels)
        .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
        .where(inArray(kanbanCardLabels.cardId, cardIds))
    : [];

  const labelsByCard = cardLabels.reduce<Record<number, { id: number; name: string; color: string }[]>>((acc, l) => {
    (acc[l.cardId] ??= []).push({ id: l.id, name: l.name, color: l.color });
    return acc;
  }, {});

  const checklistItems = cardIds.length > 0
    ? await db.select({ cardId: kanbanCardChecklistItems.cardId, completed: kanbanCardChecklistItems.completed })
        .from(kanbanCardChecklistItems)
        .where(inArray(kanbanCardChecklistItems.cardId, cardIds))
    : [];

  const checklistByCard = checklistItems.reduce<Record<number, { total: number; done: number }>>((acc, i) => {
    const r = (acc[i.cardId] ??= { total: 0, done: 0 });
    r.total += 1;
    if (i.completed) r.done += 1;
    return acc;
  }, {});

  const assigneeRows = cardIds.length > 0
    ? await db
        .select({
          cardId: kanbanCardAssignees.cardId,
          id: users.id,
          name: users.name,
        })
        .from(kanbanCardAssignees)
        .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
        .where(inArray(kanbanCardAssignees.cardId, cardIds))
    : [];

  const assigneesByCard = assigneeRows.reduce<Record<number, { id: number; name: string }[]>>((acc, a) => {
    (acc[a.cardId] ??= []).push({ id: a.id, name: a.name });
    return acc;
  }, {});

  // Active blockers (the blocker card is NOT in a "done" column)
  const blockerRows = cardIds.length > 0
    ? await db
        .select({
          blockedCardId: kanbanCardDependencies.blockedCardId,
          blockerIsDone: kanbanColumns.isDone,
        })
        .from(kanbanCardDependencies)
        .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockerCardId))
        .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
        .where(inArray(kanbanCardDependencies.blockedCardId, cardIds))
    : [];

  const blockedCountByCard = blockerRows.reduce<Record<number, number>>((acc, r) => {
    if (!r.blockerIsDone) acc[r.blockedCardId] = (acc[r.blockedCardId] ?? 0) + 1;
    return acc;
  }, {});

  const columnsWithCards = columns.map((col) => ({
    ...col,
    cards: cards.filter((c) => c.columnId === col.id).map(c => ({
      ...c,
      key: project.projectKey && c.number != null ? `${project.projectKey}-${c.number}` : null,
      attachments: filesByCard[c.id] ?? [],
      labels: labelsByCard[c.id] ?? [],
      checklist: checklistByCard[c.id] ?? null,
      assignees: assigneesByCard[c.id] ?? [],
      blockedCount: blockedCountByCard[c.id] ?? 0,
    })),
  }));


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
          {(project.description || canEdit) && (
            <ProjectDescription
              projectId={projectId}
              title={project.name}
              description={project.description ?? ''}
              canEdit={canEdit}
            />
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ProjectStatusControl
            projectId={projectId}
            status={project.status}
            canEdit={canEdit}
          />
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
          { key: 'board',    href: `/portal/projects/${projectId}`,                 label: 'Board',    icon: 'view_kanban' },
          { key: 'sprints',  href: `/portal/projects/${projectId}?tab=sprints`,     label: 'Sprints',  icon: 'sprint' },
          { key: 'files',    href: `/portal/projects/${projectId}?tab=files`,       label: 'Files',    icon: 'folder' },
          { key: 'members',  href: `/portal/projects/${projectId}?tab=members`,     label: 'Members',  icon: 'group' },
          { key: 'settings', href: `/portal/projects/${projectId}?tab=settings`,    label: 'Settings', icon: 'settings' },
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
        <SprintPlanning projectId={projectId} canEdit={canEdit} />
      ) : activeTab === 'members' ? (
        <ProjectMembersTab projectId={projectId} canManage={canManage} />
      ) : activeTab === 'settings' ? (
        <div className="space-y-4 max-w-3xl">
          <ProjectWebhooksPanel projectId={projectId} canEdit={canEdit} />
        </div>
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
          canEdit={canEdit}
          currentUserId={userId}
          sprints={projectSprints}
        />
      )}
    </div>
  );
}
