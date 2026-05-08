// Writes events to sprint_scope_history. These rows are the input to the
// burndown / velocity charts in Wave 3. Every API route that mutates a card's
// sprint association, completion state, or that transitions a sprint to
// active must call one of these helpers.

import { db } from '@/lib/db';
import { sprintScopeHistory, kanbanCards, sprints } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type SprintAction = 'sprint_started' | 'added' | 'removed' | 'completed' | 'reopened';

interface RecordOpts {
  sprintId: number;
  cardId: number | null;
  action: SprintAction;
  points: number | null;
  occurredBy: number | null;
}

export async function recordSprintEvent(opts: RecordOpts) {
  await db.insert(sprintScopeHistory).values({
    sprintId: opts.sprintId,
    cardId: opts.cardId,
    action: opts.action,
    points: opts.points,
    occurredBy: opts.occurredBy,
  });
}

/**
 * Card moved into a sprint (either at creation or via PATCH sprintId). Captures
 * the card's current point estimate as the snapshot value.
 */
export async function recordCardAddedToSprint(cardId: number, sprintId: number, userId: number | null) {
  const [card] = await db
    .select({ points: kanbanCards.storyPoints })
    .from(kanbanCards)
    .where(eq(kanbanCards.id, cardId))
    .limit(1);
  await recordSprintEvent({
    sprintId,
    cardId,
    action: 'added',
    points: card?.points ?? null,
    occurredBy: userId,
  });
}

/** Card removed from a sprint (sprintId set to null or to a different sprint). */
export async function recordCardRemovedFromSprint(cardId: number, sprintId: number, userId: number | null) {
  const [card] = await db
    .select({ points: kanbanCards.storyPoints })
    .from(kanbanCards)
    .where(eq(kanbanCards.id, cardId))
    .limit(1);
  await recordSprintEvent({
    sprintId,
    cardId,
    action: 'removed',
    points: card?.points ?? null,
    occurredBy: userId,
  });
}

/**
 * Card transitioned into a `is_done = true` column. Idempotency is the caller's
 * responsibility — recording a card as completed twice will produce two events
 * and skew the burndown. The card-mutation route should compare the previous
 * column's isDone with the new column's isDone before calling.
 */
export async function recordCardCompletedInSprint(cardId: number, sprintId: number, userId: number | null) {
  const [card] = await db
    .select({ points: kanbanCards.storyPoints })
    .from(kanbanCards)
    .where(eq(kanbanCards.id, cardId))
    .limit(1);
  await recordSprintEvent({
    sprintId,
    cardId,
    action: 'completed',
    points: card?.points ?? null,
    occurredBy: userId,
  });
}

/** Card moved back out of a done column while still in the sprint. */
export async function recordCardReopenedInSprint(cardId: number, sprintId: number, userId: number | null) {
  const [card] = await db
    .select({ points: kanbanCards.storyPoints })
    .from(kanbanCards)
    .where(eq(kanbanCards.id, cardId))
    .limit(1);
  await recordSprintEvent({
    sprintId,
    cardId,
    action: 'reopened',
    points: card?.points ?? null,
    occurredBy: userId,
  });
}

/**
 * Sprint transitioned from `planning` to `active`. Writes one synthetic
 * `sprint_started` row plus one `added` row for each card already in the sprint
 * — those `added` rows represent the committed scope at start, which the
 * burndown chart reads as the day-zero baseline.
 */
export async function recordSprintStarted(sprintId: number, userId: number | null) {
  await recordSprintEvent({
    sprintId,
    cardId: null,
    action: 'sprint_started',
    points: null,
    occurredBy: userId,
  });
  const cards = await db
    .select({ id: kanbanCards.id, points: kanbanCards.storyPoints })
    .from(kanbanCards)
    .where(eq(kanbanCards.sprintId, sprintId));
  for (const c of cards) {
    await recordSprintEvent({
      sprintId,
      cardId: c.id,
      action: 'added',
      points: c.points ?? null,
      occurredBy: userId,
    });
  }
}

/**
 * Helper for card-move handlers. Caller passes the isDone flag from each side
 * of the move so this helper makes one DB read instead of two. No-op if the
 * card isn't in a sprint, the column didn't change done-ness, or the card is
 * unknown.
 */
export async function recordCardColumnMove(
  cardId: number,
  prevIsDone: boolean,
  nextIsDone: boolean,
  userId: number | null,
) {
  if (prevIsDone === nextIsDone) return;
  const [card] = await db
    .select({ sprintId: kanbanCards.sprintId, points: kanbanCards.storyPoints })
    .from(kanbanCards)
    .where(eq(kanbanCards.id, cardId))
    .limit(1);
  if (!card?.sprintId) return;

  await recordSprintEvent({
    sprintId: card.sprintId,
    cardId,
    action: !prevIsDone && nextIsDone ? 'completed' : 'reopened',
    points: card.points ?? null,
    occurredBy: userId,
  });
}

/** Confirms the sprint exists; useful in routes that take a sprintId from request body. */
export async function sprintExists(sprintId: number): Promise<boolean> {
  const [row] = await db.select({ id: sprints.id }).from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  return !!row;
}
