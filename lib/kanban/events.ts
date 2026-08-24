/**
 * Kanban boards — live NOTIFY so an open board reflects another writer's change
 * without a manual refresh.
 *
 * Mirrors lib/agent-flows/events.ts and lib/pathviz/events.ts: this module only
 * ever NOTIFIes (one short statement), so it reuses the Drizzle pool rather than
 * parking a dedicated connection. lib/kanban/stream.ts is the one that LISTENs,
 * on its own. `pg_notify` takes the channel as a plain text argument, not a SQL
 * identifier, so the parameterized template is safe with no quoting concern.
 *
 * The payload is deliberately EMPTY. This is a wakeup, not a diff: the SSE route
 * forwards a bare ping and the client refetches the board's REST projection, so
 * the board's shape keeps exactly one source of truth — the same reasoning the
 * flow-runs stream route gives for not shipping payloads. It also makes a missed
 * NOTIFY harmless, which matters because Vercel caps function duration and an
 * EventSource reconnect leaves a gap no NOTIFY will replay; the client refetches
 * on `ready` as well as on ping, so the gap self-heals.
 *
 * WHY BOTH WRITE PATHS MUST CALL THIS: the browser mutates through the API
 * routes under app/api/portal/{cards,projects}, while the MCP tools in
 * lib/mcp/tools/kanban.ts write to Drizzle directly. Neither goes through a
 * shared service layer, so hooking only the routes would silently miss every
 * agent write — the exact case this feature exists for. Precedent for an MCP
 * tool publishing its own notify: lib/mcp/tools/pathviz.ts.
 *
 * WHAT COUNTS AS A CHANGE: mutations that alter the board projection every
 * viewer shares — cards, columns, and the card-face fields (labels, assignees,
 * checklist rollup, comment/blocked counts, attachments). Per-viewer state is
 * deliberately excluded: `isWatching` and `unreadAlerts` differ per user, so
 * waking every viewer because one person hit Watch would be pure noise.
 */

import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanbanCards, kanbanColumns } from '@/lib/db/schema';

/** Keep in sync with lib/kanban/stream.ts, which duplicates this rather than
 *  importing it — see that module for why it must not pull in Drizzle. */
export function boardChannel(projectId: number): string {
  return `kanban_board_${projectId}`;
}

function validId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

/**
 * Wake every viewer of one project's board. Best-effort by design: a realtime
 * nicety must never fail the write that triggered it, so every path here
 * swallows and logs. Callers do not await correctness, only politeness.
 */
export async function publishBoardChanged(projectId: number): Promise<void> {
  if (!validId(projectId)) return;
  try {
    await db.execute(sql`select pg_notify(${boardChannel(projectId)}, '')`);
  } catch (err) {
    console.warn('[kanban] pg_notify failed for project', projectId, err);
  }
}

/**
 * Resolve a card's project, then wake its board.
 *
 * NOTE FOR DELETES: this reads the card row, so it must be called BEFORE the
 * row is removed. For a delete, capture `projectId` while the row still exists
 * and call `publishBoardChanged` directly — most delete handlers already select
 * the row to authorize it, so the value is usually in scope already.
 */
export async function publishBoardChangedForCard(cardId: number): Promise<void> {
  if (!validId(cardId)) return;
  try {
    const [row] = await db
      .select({ projectId: kanbanCards.projectId })
      .from(kanbanCards)
      .where(eq(kanbanCards.id, cardId))
      .limit(1);
    if (row) await publishBoardChanged(row.projectId);
  } catch (err) {
    console.warn('[kanban] could not resolve project for card', cardId, err);
  }
}

/** Resolve a column's project, then wake its board. Same delete caveat as above. */
export async function publishBoardChangedForColumn(columnId: number): Promise<void> {
  if (!validId(columnId)) return;
  try {
    const [row] = await db
      .select({ projectId: kanbanColumns.projectId })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.id, columnId))
      .limit(1);
    if (row) await publishBoardChanged(row.projectId);
  } catch (err) {
    console.warn('[kanban] could not resolve project for column', columnId, err);
  }
}
