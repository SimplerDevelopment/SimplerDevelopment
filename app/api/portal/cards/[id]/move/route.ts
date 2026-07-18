import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanColumns, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { logCardActivity } from '@/lib/pm-activity';
import { recordCardColumnMove } from '@/lib/portal/sprint-snapshots';
import { checkWipLimit } from '@/lib/portal/wip-limit';
import {
  PUBLISHING_SYSTEM_KIND,
  type PublishingPermissionKey,
  type PublishingStageKey,
} from '@/lib/publishing/constants';
import { mapColumnNameToStageKey } from '@/lib/publishing/bootstrap';
import { checkPublishingPermission } from '@/lib/publishing/permissions';
import { syncCardStageToCampaign } from '@/lib/publishing/channels/email';

// Moving cards between columns is available to ANY user who can view the project
// (staff, or client-team member). It is intentionally not gated by canEdit —
// board triage is a common collaborative action.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const { columnId, order } = await req.json();

  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return NextResponse.json({ success: false, message: 'Card not found' }, { status: 404 });

  // Destination column must belong to the same project — prevents cross-project moves
  const [destCol] = await db.select().from(kanbanColumns).where(eq(kanbanColumns.id, columnId)).limit(1);
  if (!destCol || destCol.projectId !== card.projectId) {
    return NextResponse.json({ success: false, message: 'Destination column not in this project' }, { status: 400 });
  }

  // Authorize project visibility; also resolve the full project row so we can
  // check systemKind for publishing-project guards below.
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';
  let resolvedProject: { id: number; clientId: number; systemKind: string | null } | null = null;
  if (!isStaff) {
    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [project] = await db
      .select({ id: projects.id, clientId: projects.clientId, systemKind: projects.systemKind })
      .from(projects)
      .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
      .limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    resolvedProject = project;
  } else {
    const [project] = await db
      .select({ id: projects.id, clientId: projects.clientId, systemKind: projects.systemKind })
      .from(projects)
      .where(eq(projects.id, card.projectId))
      .limit(1);
    if (project) resolvedProject = project;
  }

  // Publishing-project per-stage move permission: only enforced when the card
  // is changing columns (reorders within same column skip the gate).
  const isPublishingProject = resolvedProject?.systemKind === PUBLISHING_SYSTEM_KIND;
  if (isPublishingProject && card.columnId !== columnId) {
    const stageKey = mapColumnNameToStageKey(destCol.name) as PublishingStageKey;
    const permKey = `move_to_${stageKey}` as const;
    const userId = parseInt(session.user.id, 10);
    const clientId = resolvedProject!.clientId;
    const { granted } = await checkPublishingPermission(
      { userId, clientId, isStaff },
      permKey as PublishingPermissionKey,
    );
    if (!granted) {
      return NextResponse.json(
        { success: false, message: `Not permitted to move cards to the "${destCol.name}" stage` },
        { status: 403 },
      );
    }
  }

  // WIP-limit check: skip if the card is already in the destination (reorder
  // within the same column). Otherwise check the destination's count
  // excluding the moving card.
  if (card.columnId !== columnId) {
    const wip = await checkWipLimit(columnId, cardId);
    if (!wip.allowed) {
      return NextResponse.json(
        { success: false, message: wip.reason, code: 'wip_limit', limit: wip.limit, currentCount: wip.currentCount },
        { status: 409 },
      );
    }
  }

  const before = card;
  const [srcCol] = await db.select({ isDone: kanbanColumns.isDone })
    .from(kanbanColumns)
    .where(eq(kanbanColumns.id, before.columnId))
    .limit(1);

  const [updated] = await db
    .update(kanbanCards)
    .set({ columnId, order, updatedAt: new Date() })
    .where(eq(kanbanCards.id, cardId))
    .returning();

  if (before.columnId !== columnId) {
    const actorId = parseInt(session.user.id, 10);
    await logCardActivity(cardId, actorId, 'card.column_changed', { from: before.columnId, to: columnId });
    if (srcCol) {
      await recordCardColumnMove(cardId, srcCol.isDone, destCol.isDone, actorId);
    }

    // Publishing-project stage→artifact sync: mirror the new stage onto any
    // linked email_campaign rows. Silently no-ops when the card has no linked
    // campaign or the stage is one the adapter intentionally ignores
    // (published / archived).
    if (isPublishingProject) {
      const stageKey = mapColumnNameToStageKey(destCol.name) as PublishingStageKey;
      await syncCardStageToCampaign(cardId, stageKey);
    }
  }

  return NextResponse.json({ success: true, data: updated });
}
