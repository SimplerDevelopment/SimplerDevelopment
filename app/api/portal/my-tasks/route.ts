import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { collectKanbanTasks, collectBrainTasks } from '@/lib/portal/my-tasks-collect';
import {
  cardMatchesFilters,
  compareCardsByDue,
  groupKey,
  parseMyTasksParams,
  type MyTaskCard,
  type MyTaskGroup,
} from '@/lib/portal/my-tasks-shape';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  const url = new URL(req.url);
  const params = parseMyTasksParams(url.searchParams);

  // Source filter at the collector level — saves work for single-source views.
  const wantKanban = params.source === 'all' || params.source === 'kanban';
  const wantBrain = params.source === 'all' || params.source === 'brain';

  const [kanbanGroupsRaw, brainGroupsRaw] = await Promise.all([
    wantKanban
      ? collectKanbanTasks({ userId, isStaff, openOnly: params.openOnly, projectIds: params.projectIds })
      : Promise.resolve([] as MyTaskGroup[]),
    wantBrain
      ? collectBrainTasks({ userId, isStaff, openOnly: params.openOnly })
      : Promise.resolve([] as MyTaskGroup[]),
  ]);

  // The full set of kanban projects this user has tasks in — used to populate
  // the project filter dropdown on the page. Always derived from the unfiltered
  // kanban result (so the user can re-select a project they just filtered out).
  const allProjects = wantKanban
    ? (params.projectIds.length > 0
        ? await collectKanbanTasks({ userId, isStaff, openOnly: params.openOnly })
        : kanbanGroupsRaw
      )
    : [];
  const projectsAvailable = allProjects
    .filter((g) => g.source === 'kanban' && typeof g.id === 'number')
    .map((g) => ({ id: g.id as number, name: g.name, projectKey: g.projectKey }));

  // Apply card-level filters (priority / overdue) and reassemble groups.
  const allGroups = [...kanbanGroupsRaw, ...brainGroupsRaw];
  type IndexedCard = MyTaskCard & { __groupKey: string; __group: MyTaskGroup };
  const indexedCards: IndexedCard[] = [];
  for (const g of allGroups) {
    for (const c of g.cards) {
      if (!cardMatchesFilters(c, { priorities: params.priorities, overdue: params.overdue })) continue;
      indexedCards.push({ ...c, __groupKey: groupKey(g), __group: g });
    }
  }

  // Stable global ordering (mirrors per-group sort but applied across the
  // unified inbox so pagination is deterministic).
  indexedCards.sort(compareCardsByDue);

  const total = indexedCards.length;
  const start = Math.min(params.cursor, total);
  const end = Math.min(start + params.limit, total);
  const slice = indexedCards.slice(start, end);

  // Reassemble groups for just the page slice, preserving group order based on
  // first-card position within the slice. This keeps the visual grouping the
  // page expects without inventing a new shape.
  const groupOrder: string[] = [];
  const groupBuckets = new Map<string, MyTaskGroup>();
  for (const c of slice) {
    if (!groupBuckets.has(c.__groupKey)) {
      groupOrder.push(c.__groupKey);
      groupBuckets.set(c.__groupKey, { ...c.__group, cards: [] });
    }
    const bucket = groupBuckets.get(c.__groupKey)!;
    // strip private indexing fields before serializing
    const { __groupKey: _gk, __group: _g, ...card } = c;
    void _gk; void _g;
    bucket.cards.push(card);
  }
  const projects: MyTaskGroup[] = groupOrder.map((k) => groupBuckets.get(k)!);

  const nextCursor = end < total ? end : null;

  return NextResponse.json({
    success: true,
    data: {
      projects,
      nextCursor,
      total,
      projectsAvailable,
      filters: {
        source: params.source,
        projectIds: params.projectIds,
        priorities: params.priorities,
        overdue: params.overdue,
        openOnly: params.openOnly,
      },
    },
  });
}
