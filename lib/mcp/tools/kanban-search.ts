/**
 * MCP tools — kanban card search.
 *
 * Split out of `tools/kanban.ts` rather than added to it: that file is pinned by
 * the god-file ratchet (`.file-budget.baseline.json`) at 933 code lines and may
 * shrink, never grow. Same reason `kanban-artifacts.ts` exists.
 *
 * Why the tool exists at all: nothing on the MCP kanban surface could answer
 * "does a card for this already exist?". `kanban_get_card` needs an id you do
 * not have yet, and `kanban_list_board` returns a whole lane — ~370 cards /
 * ~56k tokens on the SD master board. So an agent about to file a ticket either
 * paid for a board read per ticket or guessed, and the guess is what produced
 * duplicate cards. This turns that check into a query.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanLabels,
  kanbanCardLabels,
} from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { assertProjectInClient, OwnershipError } from '@/lib/security/assert-owned';
import { json, denied, requireScope } from '../types';

/**
 * Escape LIKE metacharacters so a caller searching for a literal `%` or `_`
 * gets that, not a wildcard. A dedup lookup passes route fragments and error
 * strings — `100%` and `snake_case` are ordinary content here, not patterns.
 */
function likeTerm(value: string): string {
  return `%${value.replace(/([\\%_])/g, '\\$1')}%`;
}

export function registerKanbanSearchTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_cards_search',
    {
      title: 'Search kanban cards',
      description:
        "Find cards across this company's boards by title text, lane, label, type, priority or workflow state — without reading a whole board. Use it before creating a card to check whether one already exists; `kanban_list_board` on the SD master board is ~370 cards / ~56k tokens, which is why agents used to skip the check and file duplicates. Omit `projectId` to search every project the company owns. Returns a slim projection with the resolved lane name and labels — call `kanban_get_card` for a card's description. `truncated:true` means the cap was hit and more matches exist.",
      inputSchema: {
        query: z.string().min(1).optional().describe('Case-insensitive substring matched against the card title (and description when searchDescription is true).'),
        projectId: z.coerce.number().int().optional().describe('Restrict to one board. Omit to search every project this company owns.'),
        column: z.string().optional().describe('Lane name, case-insensitive (e.g. "In Progress"). Ignored if columnId is given. With no projectId this matches that lane on every board.'),
        columnId: z.coerce.number().int().optional().describe('Lane id — takes precedence over `column`.'),
        labels: z.array(z.string()).optional().describe('Label names, case-insensitive. A card matches if it carries ANY of them.'),
        cardType: z.enum(['task', 'story', 'epic', 'bug', 'spike']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        workflowState: z.enum(['todo', 'in_progress', 'in_review', 'done', 'canceled']).optional(),
        searchDescription: z.boolean().default(false).optional().describe('Also match `query` against the long-text description. Off by default: title matching is what dedup needs, and descriptions are the expensive column to scan.'),
        limit: z.coerce.number().int().min(1).max(200).default(25).optional(),
      },
    },
    async ({
      query, projectId, column, columnId, labels,
      cardType, priority, workflowState, searchDescription = false, limit = 25,
    }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');

      // An explicit board is checked against the company before it filters
      // anything, so a foreign id reads as "not yours" rather than as the empty
      // result a valid-but-someone-else's board would otherwise produce.
      if (projectId !== undefined) {
        try {
          await assertProjectInClient(projectId, clientId);
        } catch (e) {
          if (e instanceof OwnershipError) return json({ error: e.message });
          throw e;
        }
      }

      // The join to `projects` is the tenancy boundary. Every condition below
      // narrows within it; none of them replaces it.
      const conditions: SQL[] = [eq(projects.clientId, clientId)];
      if (projectId !== undefined) conditions.push(eq(kanbanCards.projectId, projectId));
      if (columnId !== undefined) conditions.push(eq(kanbanCards.columnId, columnId));
      else if (column) conditions.push(sql`lower(${kanbanColumns.name}) = ${column.trim().toLowerCase()}`);
      if (cardType) conditions.push(eq(kanbanCards.cardType, cardType));
      if (priority) conditions.push(eq(kanbanCards.priority, priority));
      if (workflowState) conditions.push(eq(kanbanCards.workflowState, workflowState));
      if (query) {
        const term = likeTerm(query);
        const onTitle = ilike(kanbanCards.title, term);
        conditions.push(searchDescription ? or(onTitle, ilike(kanbanCards.description, term))! : onTitle);
      }

      // Labels resolve to card ids first instead of joining into the main query:
      // a join across a many-to-many multiplies rows, which would make `limit`
      // count label rows rather than cards and silently drop matches.
      if (labels?.length) {
        const wanted = labels.map((l) => l.trim().toLowerCase()).filter(Boolean);
        if (!wanted.length) return json({ cards: [] });
        const tagged = await db
          .selectDistinct({ cardId: kanbanCardLabels.cardId })
          .from(kanbanCardLabels)
          .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
          .innerJoin(projects, eq(projects.id, kanbanLabels.projectId))
          .where(and(
            eq(projects.clientId, clientId),
            or(...wanted.map((w) => sql`lower(${kanbanLabels.name}) = ${w}`))!,
          ));
        if (!tagged.length) return json({ cards: [] });
        conditions.push(inArray(kanbanCards.id, tagged.map((t) => t.cardId)));
      }

      const rows = await db
        .select({
          id: kanbanCards.id,
          projectId: kanbanCards.projectId,
          projectName: projects.name,
          columnId: kanbanCards.columnId,
          columnName: kanbanColumns.name,
          title: kanbanCards.title,
          priority: kanbanCards.priority,
          cardType: kanbanCards.cardType,
          workflowState: kanbanCards.workflowState,
          dueDate: kanbanCards.dueDate,
          updatedAt: kanbanCards.updatedAt,
        })
        .from(kanbanCards)
        .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
        .innerJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
        .where(and(...conditions))
        // Most-recently-touched first: when a caller caps at 25 the cards it
        // actually wants are the live ones, not whichever the planner happened
        // to emit first.
        .orderBy(desc(kanbanCards.updatedAt))
        .limit(limit);

      // Second round trip for the same row-multiplication reason as above.
      const ids = rows.map((r) => r.id);
      const tags = ids.length
        ? await db
            .select({
              cardId: kanbanCardLabels.cardId,
              name: kanbanLabels.name,
              color: kanbanLabels.color,
            })
            .from(kanbanCardLabels)
            .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
            .where(inArray(kanbanCardLabels.cardId, ids))
        : [];
      const byCard = new Map<number, { name: string; color: string }[]>();
      for (const t of tags) {
        const list = byCard.get(t.cardId);
        if (list) list.push({ name: t.name, color: t.color });
        else byCard.set(t.cardId, [{ name: t.name, color: t.color }]);
      }

      const cards = rows.map((r) => ({ ...r, labels: byCard.get(r.id) ?? [] }));
      // No silent caps: a clipped result must not be readable as the whole result.
      const truncated = cards.length === limit;
      return json({ cards, ...(truncated ? { truncated: true, limit } : {}) });
    }
  );
}
