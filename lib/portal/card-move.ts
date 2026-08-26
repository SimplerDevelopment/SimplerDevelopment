/**
 * Cross-board card moves.
 *
 * A kanban card carries three things scoped to the board it lives on, none of
 * which survive a move to another project:
 *
 * - `sprintId` — FK to a sprint owned by the old project.
 * - `parentCardId` — **no FK at all**. The column comment in `schema/pm.ts`
 *   already records that deleting an epic leaves its children pointing at a
 *   nonexistent id "with nothing at the DB layer to catch it". A board move is
 *   a second route to that same dangling state, and it opens from BOTH ends:
 *   the card can be a child whose parent stays behind (`parentCleared`), or a
 *   parent whose children stay behind (`childrenDetached`). Fixing only the
 *   first was PUX-115.
 * - labels — `kanban_card_labels` rows point at `kanban_labels`, which are
 *   per-project.
 *
 * This lives outside `lib/mcp/tools/kanban.ts` because that file is already a
 * god file the size budget refuses to let grow, and because the reconciliation
 * is worth reading on its own: it is the part that decides what a card loses.
 */

import { db } from '@/lib/db';
import { kanbanCards, kanbanLabels, kanbanCardLabels } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { recordCardRemovedFromSprint } from '@/lib/portal/sprint-snapshots';

export interface BoardMoveReconciliation {
  /** Labels re-pointed to a same-named label on the destination board. */
  labelsRemapped: string[];
  /** Labels with no counterpart on the destination. Reported, never silent. */
  labelsDropped: string[];
  /** True when the parent link was severed because the parent stayed behind. */
  parentCleared: boolean;
  /**
   * Children left on the old board whose `parentCardId` was nulled because the
   * parent they pointed at is the card that just left.
   */
  childrenDetached: number;
}

/**
 * Detach what cannot cross, and report it.
 *
 * Runs BEFORE the card's `projectId` changes — every lookup here reads against
 * the board the card is still on. The caller performs the actual update and is
 * responsible for applying `sprintId: null` and, when `parentCleared`,
 * `parentCardId: null`.
 */
export async function reconcileCardForBoardMove(
  cardId: number,
  destProjectId: number,
  card: { projectId: number; sprintId: number | null; parentCardId: number | null },
  userId: number | null,
): Promise<BoardMoveReconciliation> {
  const labelsRemapped: string[] = [];
  const labelsDropped: string[] = [];

  const attached = await db
    .select({ name: kanbanLabels.name })
    .from(kanbanCardLabels)
    .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
    .where(eq(kanbanCardLabels.cardId, cardId));

  if (attached.length) {
    const destLabels = await db
      .select({ id: kanbanLabels.id, name: kanbanLabels.name })
      .from(kanbanLabels)
      .where(eq(kanbanLabels.projectId, destProjectId));
    const byName = new Map(destLabels.map((l) => [l.name.toLowerCase(), l.id]));

    // Cleared wholesale first: every existing row points at a label on the old
    // board, so none of them can survive the move as-is.
    await db.delete(kanbanCardLabels).where(eq(kanbanCardLabels.cardId, cardId));
    for (const { name } of attached) {
      const destId = byName.get(name.toLowerCase());
      if (destId === undefined) {
        labelsDropped.push(name);
        continue;
      }
      await db.insert(kanbanCardLabels).values({ cardId, labelId: destId }).onConflictDoNothing();
      labelsRemapped.push(name);
    }
  }

  let parentCleared = false;
  if (card.parentCardId !== null) {
    const [parent] = await db
      .select({ projectId: kanbanCards.projectId })
      .from(kanbanCards)
      .where(eq(kanbanCards.id, card.parentCardId))
      .limit(1);
    parentCleared = !parent || parent.projectId !== destProjectId;
  }

  // The mirror image of the check above. `parentCleared` covers the moving card
  // losing a parent that stayed put; this covers the moving card BEING a parent
  // whose children stay put. Both end in the same dangling state, because
  // `parentCardId` has no FK — and the children query in
  // app/api/portal/cards/[id]/route.ts scopes candidates to the card's own
  // projectId, so a surviving link is unresolvable from either side: the old
  // board holds children pointing at a card it can no longer see, and the epic
  // arrives on the new board with an empty Children section.
  //
  // Unconditional: one UPDATE whose WHERE matches nothing is cheaper than the
  // SELECT it would take to decide whether to run it.
  //
  // Scoped to the board being LEFT, not to "any board that isn't the
  // destination" — those are equivalent for every legitimate child (a child on
  // a third board would have had this link cleared by `parentCleared` when it
  // moved there), but they are not equivalent under a hostile write.
  // PUX-116 closed the write path that made this urgent — all three callers
  // now go through `isParentCardInProject`, so no NEW cross-project parent link
  // can be created. The narrow predicate stays anyway: that guard is not
  // retroactive, and rows written before it can still point off-board, or off
  // -client. Matching on the source project keeps this sweep inside a projectId
  // the caller has already been ownership-checked against; a `ne(...)` predicate
  // would let it reach across the tenant boundary to null one of those legacy
  // foreign rows.
  const detached = await db
    .update(kanbanCards)
    .set({ parentCardId: null, updatedAt: new Date() })
    .where(and(eq(kanbanCards.parentCardId, cardId), eq(kanbanCards.projectId, card.projectId)))
    .returning({ id: kanbanCards.id });

  if (card.sprintId !== null) {
    await recordCardRemovedFromSprint(cardId, card.sprintId, userId);
  }

  return { labelsRemapped, labelsDropped, parentCleared, childrenDetached: detached.length };
}
