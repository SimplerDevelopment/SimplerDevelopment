// Publishing board view — reuses the existing KanbanBoard component, pointed
// at the per-client Publishing project (system_kind='publishing'). Data
// fetching mirrors app/portal/projects/[id]/page.tsx but scoped to the single
// bootstrapped project.

import { db } from '@/lib/db';
import {
  kanbanColumns,
  kanbanCards,
  kanbanCardFiles,
  kanbanCardLabels,
  kanbanLabels,
  kanbanCardChecklistItems,
  kanbanCardAssignees,
  kanbanCardDependencies,
  kanbanCardComments,
  kanbanCardWatchers,
  kanbanCardArtifacts,
  publishingCampaigns,
  notifications,
  users,
  sprints,
} from '@/lib/db/schema';
import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import KanbanBoard from '@/components/portal/KanbanBoard';
import { getPublishingSession } from '@/lib/publishing/active-client';

export const dynamic = 'force-dynamic';

export default async function PublishingBoardPage() {
  const session = await getPublishingSession();
  const projectId = session.project.id;
  const canEdit =
    session.isStaff || session.role === 'owner' || session.role === 'admin';

  // Columns are the 6 fixed publishing stages — bootstrap already wrote them.
  const columns = await db
    .select()
    .from(kanbanColumns)
    .where(eq(kanbanColumns.projectId, projectId))
    .orderBy(kanbanColumns.order);

  const cards = await db
    .select()
    .from(kanbanCards)
    .where(eq(kanbanCards.projectId, projectId))
    .orderBy(kanbanCards.order);

  // Sprints aren't used on the publishing board (every card is workflow-state
  // not points-in-a-sprint) — but KanbanBoard accepts it as an optional prop.
  const projectSprints = await db
    .select({ id: sprints.id, name: sprints.name, status: sprints.status })
    .from(sprints)
    .where(eq(sprints.projectId, projectId))
    .orderBy(sprints.order);

  const cardIds = cards.map((c) => c.id);

  // All the same joins the regular project page uses, so KanbanBoard's card
  // chrome renders identically (attachments, labels, checklist, assignees,
  // blocked count, comment count, watcher state, unread alerts).
  const files = cardIds.length
    ? await db
        .select({
          cardId: kanbanCardFiles.cardId,
          url: kanbanCardFiles.url,
          mimeType: kanbanCardFiles.mimeType,
        })
        .from(kanbanCardFiles)
        .where(inArray(kanbanCardFiles.cardId, cardIds))
    : [];
  const filesByCard = files.reduce<Record<number, { url: string; mimeType: string }[]>>(
    (acc, f) => {
      (acc[f.cardId] ??= []).push({ url: f.url, mimeType: f.mimeType });
      return acc;
    },
    {},
  );

  const cardLabels = cardIds.length
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
  const labelsByCard = cardLabels.reduce<Record<number, { id: number; name: string; color: string }[]>>(
    (acc, l) => {
      (acc[l.cardId] ??= []).push({ id: l.id, name: l.name, color: l.color });
      return acc;
    },
    {},
  );

  const checklistRows = cardIds.length
    ? await db
        .select({ cardId: kanbanCardChecklistItems.cardId, completed: kanbanCardChecklistItems.completed })
        .from(kanbanCardChecklistItems)
        .where(inArray(kanbanCardChecklistItems.cardId, cardIds))
    : [];
  const checklistByCard = checklistRows.reduce<Record<number, { total: number; done: number }>>(
    (acc, r) => {
      const c = (acc[r.cardId] ??= { total: 0, done: 0 });
      c.total += 1;
      if (r.completed) c.done += 1;
      return acc;
    },
    {},
  );

  const assigneeRows = cardIds.length
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
  const assigneesByCard = assigneeRows.reduce<Record<number, { id: number; name: string }[]>>(
    (acc, r) => {
      (acc[r.cardId] ??= []).push({ id: r.id, name: r.name });
      return acc;
    },
    {},
  );

  const blockedRows = cardIds.length
    ? await db
        .select({ cardId: kanbanCardDependencies.blockedCardId })
        .from(kanbanCardDependencies)
        .where(inArray(kanbanCardDependencies.blockedCardId, cardIds))
    : [];
  const blockedCountByCard = blockedRows.reduce<Record<number, number>>((acc, r) => {
    acc[r.cardId] = (acc[r.cardId] ?? 0) + 1;
    return acc;
  }, {});

  const commentCountRows = cardIds.length
    ? await db
        .select({ cardId: kanbanCardComments.cardId, count: sql<number>`count(*)::int` })
        .from(kanbanCardComments)
        .where(inArray(kanbanCardComments.cardId, cardIds))
        .groupBy(kanbanCardComments.cardId)
    : [];
  const commentCountByCard = commentCountRows.reduce<Record<number, number>>((acc, r) => {
    acc[r.cardId] = Number(r.count) || 0;
    return acc;
  }, {});

  const unreadAlertRows = cardIds.length
    ? await db
        .select({ cardId: notifications.cardId, count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, session.userId),
            isNull(notifications.readAt),
            inArray(notifications.cardId, cardIds),
          ),
        )
        .groupBy(notifications.cardId)
    : [];
  const unreadAlertsByCard = unreadAlertRows.reduce<Record<number, number>>((acc, r) => {
    if (r.cardId == null) return acc;
    acc[r.cardId] = Number(r.count) || 0;
    return acc;
  }, {});

  const watcherRows = cardIds.length
    ? await db
        .select({ cardId: kanbanCardWatchers.cardId })
        .from(kanbanCardWatchers)
        .where(
          and(
            eq(kanbanCardWatchers.userId, session.userId),
            inArray(kanbanCardWatchers.cardId, cardIds),
          ),
        )
    : [];
  const watchedCardIds = new Set<number>(watcherRows.map((r) => r.cardId));

  // Linked artifacts per card — surface the channel icon + display title on
  // each card's chrome. The KanbanBoard card type doesn't have a slot for
  // artifacts yet; PUB-11 (drawer) renders them. For board chrome we lean on
  // the existing label slot (set by the user) for now and a channel hint
  // chip we may add in a followup.
  const artifactRows = cardIds.length
    ? await db
        .select({
          cardId: kanbanCardArtifacts.cardId,
          artifactType: kanbanCardArtifacts.artifactType,
          artifactId: kanbanCardArtifacts.artifactId,
          displayTitle: kanbanCardArtifacts.displayTitle,
        })
        .from(kanbanCardArtifacts)
        .where(inArray(kanbanCardArtifacts.cardId, cardIds))
    : [];
  const artifactsByCard = artifactRows.reduce<
    Record<number, { artifactType: string; artifactId: number; displayTitle: string }[]>
  >((acc, r) => {
    (acc[r.cardId] ??= []).push({
      artifactType: r.artifactType,
      artifactId: r.artifactId,
      displayTitle: r.displayTitle,
    });
    return acc;
  }, {});

  // Campaigns referenced by any card on this board — load once and merge into
  // each card so the chip can render without an extra round-trip.
  const referencedCampaignIds = Array.from(
    new Set(cards.map((c) => c.campaignId).filter((id): id is number => id != null)),
  );
  const campaignRows = referencedCampaignIds.length
    ? await db
        .select({
          id: publishingCampaigns.id,
          name: publishingCampaigns.name,
          color: publishingCampaigns.color,
        })
        .from(publishingCampaigns)
        .where(inArray(publishingCampaigns.id, referencedCampaignIds))
    : [];
  const campaignsById = new Map<number, { id: number; name: string; color: string }>(
    campaignRows.map((c) => [c.id, c]),
  );

  const columnsWithCards = columns.map((col) => ({
    ...col,
    cards: cards
      .filter((c) => c.columnId === col.id)
      .map((c) => {
        const linkedCampaign = c.campaignId != null ? campaignsById.get(c.campaignId) ?? null : null;
        const artifacts = artifactsByCard[c.id] ?? [];
        // KanbanBoard's Card interface doesn't carry these yet — we sneak the
        // primary artifact's channel label into the description prefix so it
        // shows on the card chrome without the component changing. PUB-11
        // will replace this by widening the Card interface and adding a
        // dedicated chip slot.
        const channelHint =
          artifacts.length === 1
            ? `[${artifacts[0].artifactType.replace(/_/g, ' ')}] `
            : artifacts.length > 1
              ? `[${artifacts.length} artifacts] `
              : '';
        const campaignHint = linkedCampaign ? `{${linkedCampaign.name}} ` : '';
        const synthDescription = c.description ?? null;
        return {
          ...c,
          key: null,
          attachments: filesByCard[c.id] ?? [],
          labels: labelsByCard[c.id] ?? [],
          checklist: checklistByCard[c.id] ?? null,
          assignees: assigneesByCard[c.id] ?? [],
          blockedCount: blockedCountByCard[c.id] ?? 0,
          commentCount: commentCountByCard[c.id] ?? 0,
          unreadAlerts: unreadAlertsByCard[c.id] ?? 0,
          isWatching: watchedCardIds.has(c.id),
          // hint prefixes only affect the title row in card chrome
          title: `${campaignHint}${channelHint}${c.title}`,
          description: synthDescription,
        };
      }),
  }));

  return (
    <KanbanBoard
      projectId={projectId}
      initialColumns={columnsWithCards}
      isStaff={session.isStaff}
      canEdit={canEdit}
      currentUserId={session.userId}
      sprints={projectSprints}
    />
  );
}
