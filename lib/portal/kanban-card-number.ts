// Atomic, project-scoped allocation of kanban_cards.number (JUL9-008).
//
// kanban_cards.number carries no unique constraint (see the comment in
// app/api/portal/cards/route.ts), and that route's own allocator is a bare
// "SELECT MAX() then INSERT" with no transaction or lock — an admitted race
// under concurrency. This module exists so MCP-driven card creation does NOT
// copy that race: an MCP tool is far more likely to be driven concurrently
// (multiple agents/sessions) than a human clicking one button.
//
// Fix: a per-project pg_advisory_xact_lock serializes allocators without a
// schema migration — same idiom as ACTIVATION_LOCK_NS in
// lib/billing/activate-modules.ts, which solved an identical
// SELECT-then-INSERT race for client_services. The lock key is scoped by
// projectId (numbering is per-project, matching app/api/portal/projects/route.ts's
// `${projectKey}-${number}` card-key format) and auto-releases on
// commit/rollback — no explicit unlock needed.
//
// NOTE: this does NOT fix the portal route's existing race — that stays a
// separate concern (its own card). This only guarantees MCP-created cards
// don't introduce a second, more-likely-to-fire copy of it.

import { db } from '@/lib/db';
import { kanbanCards } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// Arbitrary but stable; distinct from lib/billing/activate-modules.ts's
// ACTIVATION_LOCK_NS (74014) so the two lock domains can never collide.
const CARD_NUMBER_LOCK_NS = 82041;

/**
 * Insert a kanban card with an atomically-allocated `number`, unique per
 * `values.projectId`. tests/unit/mcp-tools-kanban.test.ts exercises the
 * allocation logic across two back-to-back creates in the same project and
 * asserts distinct numbers; the pg_advisory_xact_lock above is what makes
 * that hold under real concurrent callers, which a mocked-db unit test can't
 * itself simulate.
 */
export async function insertKanbanCardWithNumber(
  values: typeof kanbanCards.$inferInsert,
): Promise<typeof kanbanCards.$inferSelect> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CARD_NUMBER_LOCK_NS}, ${values.projectId})`);
    const [maxRow] = await tx
      .select({ max: sql<number | null>`MAX(${kanbanCards.number})` })
      .from(kanbanCards)
      .where(eq(kanbanCards.projectId, values.projectId));
    const [row] = await tx.insert(kanbanCards).values({ ...values, number: (maxRow?.max ?? 0) + 1 }).returning();
    return row;
  });
}
