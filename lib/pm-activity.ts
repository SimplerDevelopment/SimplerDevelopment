import { db } from '@/lib/db';
import { kanbanCardActivities, kanbanCards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fireProjectEvent } from '@/lib/pm-webhooks';
import { notifyCardEvent } from '@/lib/pm-notifications';

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
  | 'card.dependency_removed';

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
    // Fire project webhooks (async, fire-and-forget)
    const [card] = await db
      .select({ projectId: kanbanCards.projectId })
      .from(kanbanCards)
      .where(eq(kanbanCards.id, cardId))
      .limit(1);
    if (card) {
      fireProjectEvent(card.projectId, type, { cardId, userId, ...payload });
    }
    notifyCardEvent(cardId, type, userId, payload);
  } catch (err) {
    console.error('[logCardActivity]', err);
  }
}
