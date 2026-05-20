// WIP-limit guard. Refuses to add a card to a column if the column's
// wip_limit would be exceeded. The check excludes one card id (used during a
// move so the moving card doesn't count against its own destination).

import { db } from '@/lib/db';
import { kanbanCards, kanbanColumns } from '@/lib/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';

export interface WipCheck {
  allowed: boolean;
  reason?: string;
  limit?: number;
  currentCount?: number;
}

/**
 * @param columnId destination column id
 * @param excludeCardId optional — the moving card; excluded so a move within
 *                       a full column doesn't false-trigger.
 */
export async function checkWipLimit(columnId: number, excludeCardId?: number): Promise<WipCheck> {
  const [col] = await db
    .select({ wipLimit: kanbanColumns.wipLimit, name: kanbanColumns.name })
    .from(kanbanColumns)
    .where(eq(kanbanColumns.id, columnId))
    .limit(1);
  if (!col || col.wipLimit == null) return { allowed: true };

  const where = excludeCardId
    ? and(eq(kanbanCards.columnId, columnId), ne(kanbanCards.id, excludeCardId))
    : eq(kanbanCards.columnId, columnId);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kanbanCards)
    .where(where);

  if (count >= col.wipLimit) {
    return {
      allowed: false,
      reason: `WIP limit of ${col.wipLimit} reached on column "${col.name}". Resolve a card already in the column before adding more.`,
      limit: col.wipLimit,
      currentCount: count,
    };
  }
  return { allowed: true, limit: col.wipLimit, currentCount: count };
}
