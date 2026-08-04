import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanColumns, kanbanCards, kanbanCardFiles, kanbanCardLabels, kanbanLabels, kanbanCardChecklistItems, kanbanCardAssignees, kanbanCardDependencies, kanbanCardComments, kanbanCardWatchers, notifications, users, sprints } from '@/lib/db/schema';
import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import dynamic from 'next/dynamic';
import ProjectFilesArtifactsTab from '@/components/portal/ProjectFilesArtifactsTab';
import ProjectDescription from '@/components/portal/ProjectDescription';
import ProjectStatusControl from '@/components/portal/ProjectStatusControl';
import ProjectWebhooksPanel from '@/components/portal/ProjectWebhooksPanel';
import SetUpBoardButton from '@/components/portal/SetUpBoardButton';
import ProjectMembersTab from '@/components/portal/ProjectMembersTab';
import ProjectRecurrencesPanel from '@/components/portal/ProjectRecurrencesPanel';
import ProjectCustomFieldsPanel from '@/components/portal/ProjectCustomFieldsPanel';
import ProjectGoalsPanel from '@/components/portal/ProjectGoalsPanel';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';
import { getProjectRole } from '@/lib/portal/project-access';
import { canEditProject, canManageProject } from '@/lib/portal/project-permissions';
// KanbanBoard/PlanningTab opt out of SSR (dnd-kit + window). `ssr: false` is
// not allowed with next/dynamic inside a Server Component, so those two live in
// a Client Component wrapper. The SSR-safe tabs below stay code-split here.
import { KanbanBoard, PlanningTab, AgentFlowTab, FlowExecutionsTab, PathVizTab } from './dynamic-tabs';

// Heavy tab components are code-split — only the bundle for the active tab
// ships down to the client. These are pure React (useEffect + fetch), so they
// can SSR fine and we just want the chunk split.
const ProjectReportsTab = dynamic(() => import('@/components/portal/ProjectReportsTab'), {
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading reports…</div>,
});

export default async function ProjectKanbanPage({ params, searchParams }: { params: Promise<{ id: string; card?: string[] }>; searchParams: Promise<{ tab?: string }> }) {
  // Auth gate happens first — every query below depends on a logged-in user.
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const [{ id, card }, { tab }] = await Promise.all([params, searchParams]);
  // Optional catch-all `[[...card]]`: /portal/projects/<id>/<cardId> opens that
  // card on load. Anything non-numeric is ignored (board renders normally).
  const initialCardId = (() => {
    const seg = Array.isArray(card) ? card[0] : undefined;
    const n = seg ? parseInt(seg, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const activeTab = tab === 'files' ? 'files'
    // Old ?tab=artifacts links (Files and Artifacts are now one consolidated
    // "Files & Artifacts" tab — PUX-012) alias to the same 'files' tab so
    // bookmarked/shared artifact links don't 404.
    : tab === 'artifacts' ? 'files'
    // Old ?tab=backlog / ?tab=sprints / ?tab=roadmap links (and the new
    // ?tab=planning) all resolve to the single consolidated Planning tab.
    : tab === 'sprints' || tab === 'backlog' || tab === 'roadmap' || tab === 'planning' ? 'planning'
    : tab === 'reports' ? 'reports'
    : tab === 'members' ? 'members'
    : tab === 'settings' ? 'settings'
    : tab === 'flow' ? 'flow'
    : tab === 'runs' ? 'runs'
    : tab === 'visualizations' ? 'visualizations'
    : 'board';
  const projectId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);

  // Wave 1: staff check + portal client run in parallel. The portal client
  // result is only used when staff is false; running it speculatively for
  // staff users is a cheap one-row lookup and saves a round-trip when not.
  const [staff, portalClient] = await Promise.all([
    isPortalStaff(),
    getPortalClient(userId),
  ]);

  let clientId: number | null = null;
  if (!staff) {
    if (!portalClient) redirect('/portal/dashboard');
    clientId = portalClient.id;
  }

  // Wave 2: project row + role lookup + everything else that only needs
  // (clientId, projectId, userId) and not card IDs. These all run in parallel.
  const projectQuery = staff
    ? db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    : db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.clientId, clientId!))).limit(1);

  const [
    projectRows,
    columns,
    cards,
    projectSprints,
    rolePre,
  ] = await Promise.all([
    projectQuery,
    db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, projectId)).orderBy(kanbanColumns.order),
    // Slim projection: omit kanbanCards.description from list/board views.
    // The card detail drawer hydrates description on demand. Keeping every
    // other column so downstream UI (priority, sprintId, workflowState, etc.)
    // still works.
    db
      .select({
        id: kanbanCards.id,
        columnId: kanbanCards.columnId,
        projectId: kanbanCards.projectId,
        number: kanbanCards.number,
        title: kanbanCards.title,
        description: kanbanCards.description,
        dueDate: kanbanCards.dueDate,
        priority: kanbanCards.priority,
        order: kanbanCards.order,
        sprintId: kanbanCards.sprintId,
        sprintOrder: kanbanCards.sprintOrder,
        storyPoints: kanbanCards.storyPoints,
        cardType: kanbanCards.cardType,
        parentCardId: kanbanCards.parentCardId,
        workflowState: kanbanCards.workflowState,
        campaignId: kanbanCards.campaignId,
        scheduledFor: kanbanCards.scheduledFor,
        createdBy: kanbanCards.createdBy,
        createdAt: kanbanCards.createdAt,
        updatedAt: kanbanCards.updatedAt,
      })
      .from(kanbanCards)
      .where(eq(kanbanCards.projectId, projectId))
      .orderBy(kanbanCards.order),
    db
      .select({ id: sprints.id, name: sprints.name, status: sprints.status })
      .from(sprints)
      .where(eq(sprints.projectId, projectId))
      .orderBy(sprints.order),
    // Role lookup runs in parallel with everything else; staff short-circuits
    // inside getProjectRole. React.cache dedupes if a nested server component
    // later asks for the same role.
    staff ? Promise.resolve('owner' as const) : getProjectRole(userId, projectId),
  ]);

  const [project] = projectRows;
  if (!project) notFound();

  const role = staff ? 'owner' : (rolePre ?? 'viewer');
  const canEdit = canEditProject(role);
  const canManage = canManageProject(role);

  // Wave 3: per-card fan-out queries that all key off cardIds. Independent of
  // each other, so a single Promise.all collapses what used to be ~7 sequential
  // round trips down to one wave. Each entry returns an empty array when there
  // are no cards (matches the original short-circuit), preserving inferred
  // result types from drizzle.
  const cardIds = cards.map(c => c.id);
  const hasCards = cardIds.length > 0;

  const [
    files,
    cardLabels,
    checklistItems,
    assigneeRows,
    blockerRows,
    commentCountRows,
    unreadAlertRows,
    watcherRows,
  ] = await Promise.all([
    hasCards
      ? db
          .select({ cardId: kanbanCardFiles.cardId, url: kanbanCardFiles.url, mimeType: kanbanCardFiles.mimeType })
          .from(kanbanCardFiles)
          .where(inArray(kanbanCardFiles.cardId, cardIds))
      : Promise.resolve([] as { cardId: number; url: string; mimeType: string }[]),
    hasCards
      ? db
          .select({
            cardId: kanbanCardLabels.cardId,
            id: kanbanLabels.id,
            name: kanbanLabels.name,
            color: kanbanLabels.color,
          })
          .from(kanbanCardLabels)
          .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
          .where(inArray(kanbanCardLabels.cardId, cardIds))
      : Promise.resolve([] as { cardId: number; id: number; name: string; color: string }[]),
    hasCards
      ? db
          .select({ cardId: kanbanCardChecklistItems.cardId, completed: kanbanCardChecklistItems.completed })
          .from(kanbanCardChecklistItems)
          .where(inArray(kanbanCardChecklistItems.cardId, cardIds))
      : Promise.resolve([] as { cardId: number; completed: boolean | null }[]),
    hasCards
      ? db
          .select({
            cardId: kanbanCardAssignees.cardId,
            id: users.id,
            name: users.name,
          })
          .from(kanbanCardAssignees)
          .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
          .where(inArray(kanbanCardAssignees.cardId, cardIds))
      : Promise.resolve([] as { cardId: number; id: number; name: string | null }[]),
    // Active blockers (the blocker card is NOT in a "done" column)
    hasCards
      ? db
          .select({
            blockedCardId: kanbanCardDependencies.blockedCardId,
            blockerIsDone: kanbanColumns.isDone,
          })
          .from(kanbanCardDependencies)
          .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockerCardId))
          .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
          .where(inArray(kanbanCardDependencies.blockedCardId, cardIds))
      : Promise.resolve([] as { blockedCardId: number; blockerIsDone: boolean | null }[]),
    // Comment counts per card (project-scoped via cardIds filter).
    hasCards
      ? db
          .select({
            cardId: kanbanCardComments.cardId,
            count: sql<number>`count(*)::int`,
          })
          .from(kanbanCardComments)
          .where(inArray(kanbanCardComments.cardId, cardIds))
          .groupBy(kanbanCardComments.cardId)
      : Promise.resolve([] as { cardId: number; count: number }[]),
    // Unread alerts per card for the current user. notifications.cardId scoped
    // to this project's cardIds so notifications attached to cards in other
    // projects can never inflate this count.
    hasCards
      ? db
          .select({
            cardId: notifications.cardId,
            count: sql<number>`count(*)::int`,
          })
          .from(notifications)
          .where(and(
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
            inArray(notifications.cardId, cardIds),
          ))
          .groupBy(notifications.cardId)
      : Promise.resolve([] as { cardId: number | null; count: number }[]),
    // Cards the current user is watching.
    hasCards
      ? db
          .select({ cardId: kanbanCardWatchers.cardId })
          .from(kanbanCardWatchers)
          .where(and(
            eq(kanbanCardWatchers.userId, userId),
            inArray(kanbanCardWatchers.cardId, cardIds),
          ))
      : Promise.resolve([] as { cardId: number }[]),
  ]);

  const filesByCard = files.reduce<Record<number, { url: string; mimeType: string }[]>>((acc, f) => {
    (acc[f.cardId] ??= []).push({ url: f.url, mimeType: f.mimeType });
    return acc;
  }, {});

  const labelsByCard = cardLabels.reduce<Record<number, { id: number; name: string; color: string }[]>>((acc, l) => {
    (acc[l.cardId] ??= []).push({ id: l.id, name: l.name, color: l.color });
    return acc;
  }, {});

  const checklistByCard = checklistItems.reduce<Record<number, { total: number; done: number }>>((acc, i) => {
    const r = (acc[i.cardId] ??= { total: 0, done: 0 });
    r.total += 1;
    if (i.completed) r.done += 1;
    return acc;
  }, {});

  const assigneesByCard = assigneeRows.reduce<Record<number, { id: number; name: string }[]>>((acc, a) => {
    (acc[a.cardId] ??= []).push({ id: a.id, name: a.name ?? '' });
    return acc;
  }, {});

  const blockedCountByCard = blockerRows.reduce<Record<number, number>>((acc, r) => {
    if (!r.blockerIsDone) acc[r.blockedCardId] = (acc[r.blockedCardId] ?? 0) + 1;
    return acc;
  }, {});

  const commentCountByCard = commentCountRows.reduce<Record<number, number>>((acc, r) => {
    acc[r.cardId] = Number(r.count) || 0;
    return acc;
  }, {});

  const unreadAlertsByCard = unreadAlertRows.reduce<Record<number, number>>((acc, r) => {
    if (r.cardId == null) return acc;
    acc[r.cardId] = Number(r.count) || 0;
    return acc;
  }, {});

  const watchedCardIds = new Set<number>(watcherRows.map(r => r.cardId));

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
      commentCount: commentCountByCard[c.id] ?? 0,
      unreadAlerts: unreadAlertsByCard[c.id] ?? 0,
      isWatching: watchedCardIds.has(c.id),
    })),
  }));


  return (
    <div className="space-y-6">
      {/* Back to projects — top-left, above the header */}
      <div>
        <Link href="/portal/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <span className="material-icons text-sm">arrow_back</span>
          Projects
        </Link>
        <PortalPageHeader
          eyebrow="Projects"
          title={project.name}
          subtitle={
            (project.description || canEdit) ? (
              <ProjectDescription
                projectId={projectId}
                title={project.name}
                description={project.description ?? ''}
                canEdit={canEdit}
              />
            ) : undefined
          }
          actions={
            <div className="flex items-center gap-3">
              <ProjectStatusControl
                projectId={projectId}
                status={project.status}
                canEdit={canEdit}
              />
              {project.dueDate && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <span className="material-icons text-base">event</span>
                  Due {new Date(project.dueDate).toLocaleDateString('en-US')}
                </span>
              )}
            </div>
          }
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {([
          { key: 'board',    href: `/portal/projects/${projectId}`,                 label: 'Board',    icon: 'view_kanban' },
          { key: 'planning', href: `/portal/projects/${projectId}?tab=planning`,    label: 'Planning', icon: 'event_note' },
          { key: 'reports',  href: `/portal/projects/${projectId}?tab=reports`,     label: 'Reports',  icon: 'analytics' },
          { key: 'files',    href: `/portal/projects/${projectId}?tab=files`,       label: 'Files & Artifacts', icon: 'folder' },
          { key: 'flow',     href: `/portal/projects/${projectId}?tab=flow`,        label: 'Workflow Designer', icon: 'account_tree' },
          { key: 'runs',     href: `/portal/projects/${projectId}?tab=runs`,        label: 'Executions', icon: 'history' },
          { key: 'visualizations', href: `/portal/projects/${projectId}?tab=visualizations`, label: 'Visualizations', icon: 'device_hub' },
          { key: 'members',  href: `/portal/projects/${projectId}?tab=members`,     label: 'Members',  icon: 'group' },
          { key: 'settings', href: `/portal/projects/${projectId}?tab=settings`,    label: 'Settings', icon: 'settings' },
        ] as const).map(t => (
          <Link key={t.key} href={t.href}
            aria-label={t.label}
            className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <span className="material-icons text-sm align-middle sm:mr-1">{t.icon}</span><span className="hidden sm:inline">{t.label}</span>
          </Link>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'files' ? (
        <ProjectFilesArtifactsTab projectId={projectId} canEdit={canEdit} />
      ) : activeTab === 'planning' ? (
        <PlanningTab projectId={projectId} projectKey={project.projectKey} canEdit={canEdit} isStaff={staff} currentUserId={userId} />
      ) : activeTab === 'reports' ? (
        <ProjectReportsTab projectId={projectId} projectKey={project.projectKey} />
      ) : activeTab === 'runs' ? (
        <FlowExecutionsTab projectId={projectId} />
      ) : activeTab === 'flow' ? (
        <AgentFlowTab projectId={projectId} canEdit={canEdit} />
      ) : activeTab === 'visualizations' ? (
        <PathVizTab projectId={projectId} />
      ) : activeTab === 'members' ? (
        <ProjectMembersTab projectId={projectId} canManage={canManage} />
      ) : activeTab === 'settings' ? (
        <div className="space-y-4 max-w-3xl">
          <ProjectGoalsPanel projectId={projectId} canEdit={canEdit} />
          <ProjectCustomFieldsPanel projectId={projectId} canEdit={canEdit} />
          <ProjectRecurrencesPanel projectId={projectId} canEdit={canEdit} />
          <ProjectWebhooksPanel projectId={projectId} canEdit={canEdit} />
        </div>
      ) : columnsWithCards.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">view_kanban</span>
          <h3 className="mt-4 font-semibold text-foreground">Board not set up yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {canEdit ? 'Create the default columns to start adding cards.' : 'Your team will set up the project board shortly.'}
          </p>
          {canEdit && <SetUpBoardButton projectId={projectId} />}
        </div>
      ) : activeTab === 'board' && (
        <KanbanBoard
          projectId={projectId}
          initialColumns={columnsWithCards}
          isStaff={staff}
          canEdit={canEdit}
          currentUserId={userId}
          sprints={projectSprints}
          initialCardId={initialCardId}
        />
      )}
    </div>
  );
}
