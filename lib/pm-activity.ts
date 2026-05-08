import { db } from '@/lib/db';
import { kanbanCardActivities, kanbanCards, kanbanColumns, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fireProjectEvent } from '@/lib/pm-webhooks';
import { notifyCardEvent } from '@/lib/pm-notifications';
import { emitEvent } from '@/lib/automation';

export type CardActivityType =
  | 'card.created'
  | 'card.title_changed'
  | 'card.description_changed'
  | 'card.priority_changed'
  | 'card.due_date_changed'
  | 'card.assigned'
  | 'card.unassigned'
  | 'card.sprint_changed'
  | 'card.column_changed'
  | 'card.label_added'
  | 'card.label_removed'
  | 'card.commented'
  | 'card.file_added'
  | 'card.deleted'
  | 'card.checklist_item_added'
  | 'card.checklist_item_completed'
  | 'card.checklist_item_uncompleted'
  | 'card.checklist_item_removed'
  | 'card.assignee_added'
  | 'card.assignee_removed'
  | 'card.dependency_added'
  | 'card.dependency_removed'
  | 'card.story_points_changed'
  | 'card.type_changed'
  | 'card.parent_changed'
  | 'card.workflow_state_changed';

export async function logCardActivity(
  cardId: number,
  userId: number | null,
  type: CardActivityType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(kanbanCardActivities).values({
      cardId,
      userId,
      type,
      payload,
    });
    // Resolve the project + tenancy in one query so webhooks, notifications,
    // and the automation engine all share the same lookup.
    const [card] = await db
      .select({ projectId: kanbanCards.projectId, clientId: projects.clientId })
      .from(kanbanCards)
      .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
      .where(eq(kanbanCards.id, cardId))
      .limit(1);
    if (card) {
      fireProjectEvent(card.projectId, type, { cardId, userId, ...payload });

      // Bridge to the automation engine. Only the events that correspond to
      // engine-known triggers fire — the rest are audit-only. `task.completed`
      // requires the move to land in a `is_done` column, otherwise we'd fire
      // on every drag-around. The to-column id sits in payload.to for
      // card.column_changed.
      if (type === 'card.created') {
        emitEvent('task.created', card.clientId, userId ?? 0, { cardId, projectId: card.projectId, ...payload });
      } else if (type === 'card.assignee_added') {
        emitEvent('task.assigned', card.clientId, userId ?? 0, { cardId, projectId: card.projectId, ...payload });
      } else if (type === 'card.column_changed' && typeof payload.to === 'number') {
        const [col] = await db
          .select({ isDone: kanbanColumns.isDone })
          .from(kanbanColumns)
          .where(eq(kanbanColumns.id, payload.to))
          .limit(1);
        if (col?.isDone) {
          emitEvent('task.completed', card.clientId, userId ?? 0, { cardId, projectId: card.projectId, ...payload });
        }
      }
    }
    notifyCardEvent(cardId, type, userId, payload);
  } catch (err) {
    console.error('[logCardActivity]', err);
  }
}
