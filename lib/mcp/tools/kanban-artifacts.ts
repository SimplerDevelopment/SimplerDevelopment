/**
 * MCP tools — kanban artifacts, card templates, sprint proposal, recurrences.
 *
 * Split out of lib/mcp/tools/kanban.ts to keep that file under the god-file
 * ratchet (scripts/check-file-budget.ts). Holds: card artifact links (linking
 * websites/decks/proposals/etc to a card), reusable card templates, the
 * read-only sprint-proposal planner, and recurring card-creation rules.
 * Behavior is unchanged from before the split.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanCardDependencies,
  sprintScopeHistory,
  cardTemplates,
  cardRecurrences,
  sprints,
  kanbanCardArtifacts,
} from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { computeSprintProposal } from '@/lib/portal/sprint-planner';
import { computeSprintTotals, computeVelocityAverages, type SprintEvent, type VelocityRow } from '@/lib/portal/sprint-charts';
import { computeNextFireAt, type Cadence } from '@/lib/portal/recurrence-scheduler';
import {
  assertColumnInProject,
  assertProjectInClient,
  OwnershipError,
} from '@/lib/security/assert-owned';
import {
  json,
  denied,
  requireScope,
  revalidateForWrite,
} from '../types';
import { COMMON_ARTIFACT_TABLES, resolveArtifactTitle, type ArtifactTablesDict } from './artifact-vocab';

export function registerKanbanArtifactsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── KANBAN CARD ARTIFACTS ──────────────────────────────────────────────
  // Title resolution lives in ./artifact-vocab (shared with the projects
  // registrar); path_chart is special-cased there too.
  // `agent_flow_run` is the provenance edge: it records WHICH workflow run
  // produced the work on this card. A run already knows its project, so this
  // link is the only thing standing between "we log agent cost" and "we know
  // what a given card cost to deliver" — join it against kanban_card_time_logs
  // for the human half. Linked by the runner (see .claude/skills/sd-run-flow),
  // not hand-picked, which is why it stays out of the UI picker.
  const CARD_ARTIFACT_TYPE_ENUM = z.enum(['website', 'email_campaign', 'pitch_deck', 'proposal', 'booking', 'survey', 'project', 'post', 'path_chart', 'agent_flow_run']);
  const CARD_ARTIFACT_TABLES: ArtifactTablesDict = {
    ...COMMON_ARTIFACT_TABLES,
    project: { table: projects, titleField: 'name' },
  };

  async function authorizeCardForClient(cardId: number) {
    const [card] = await db.select({ projectId: kanbanCards.projectId }).from(kanbanCards)
      .where(eq(kanbanCards.id, cardId)).limit(1);
    if (!card) return null;
    const [proj] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
    return proj ? card : null;
  }

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_card_artifacts_list',
    {
      title: 'List artifacts linked to a kanban card',
      description: 'List every artifact (website, email campaign, pitch deck, proposal, booking, survey, project, path chart, agent flow run) linked to a kanban card.',
      inputSchema: { cardId: z.number() },
    },
    async ({ cardId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authorizeCardForClient(cardId))) return json({ error: 'Card not found' });
      const rows = await db.select().from(kanbanCardArtifacts)
        .where(eq(kanbanCardArtifacts.cardId, cardId))
        .orderBy(desc(kanbanCardArtifacts.pinned), desc(kanbanCardArtifacts.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_artifact_link',
    {
      title: 'Link an artifact to a kanban card',
      description: 'Attach a website, email campaign, pitch deck, proposal, booking, survey, project, path chart, or agent flow run to a kanban card. The artifact must belong to this client (path charts via their parent project). Link an agent_flow_run to record which workflow run produced this card\'s work.',
      inputSchema: {
        cardId: z.number(),
        artifactType: CARD_ARTIFACT_TYPE_ENUM,
        artifactId: z.number(),
        pinned: z.boolean().optional(),
      },
    },
    async ({ cardId, artifactType, artifactId, pinned }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeCardForClient(cardId))) return json({ error: 'Card not found' });

      const resolved = await resolveArtifactTitle(artifactType, artifactId, clientId, CARD_ARTIFACT_TABLES);
      if (!resolved.found) return json({ error: 'Artifact not found or not owned by this client' });

      const [row] = await db.insert(kanbanCardArtifacts).values({
        cardId,
        artifactType,
        artifactId,
        displayTitle: resolved.title || 'Untitled',
        pinned: pinned ?? false,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_artifact_toggle_pin',
    {
      title: 'Pin or unpin a kanban card artifact',
      description: 'Update the pinned flag on a linked card artifact.',
      inputSchema: { cardId: z.number(), artifactDbId: z.number(), pinned: z.boolean() },
    },
    async ({ cardId, artifactDbId, pinned }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeCardForClient(cardId))) return json({ error: 'Card not found' });
      const [row] = await db.update(kanbanCardArtifacts).set({ pinned })
        .where(and(eq(kanbanCardArtifacts.id, artifactDbId), eq(kanbanCardArtifacts.cardId, cardId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_artifact_unlink',
    {
      title: 'Unlink an artifact from a kanban card',
      description: 'Remove an artifact link from a card. Deletes the link row; the underlying artifact is not touched.',
      inputSchema: { cardId: z.number(), artifactDbId: z.number() },
    },
    async ({ cardId, artifactDbId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeCardForClient(cardId))) return json({ error: 'Card not found' });
      const [row] = await db.delete(kanbanCardArtifacts)
        .where(and(eq(kanbanCardArtifacts.id, artifactDbId), eq(kanbanCardArtifacts.cardId, cardId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── CARD TEMPLATES ──────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_card_templates_list',
    {
      title: 'List card templates',
      description: 'List card templates available to a project — both project-scoped templates and client-wide ones. Use kanban_create_card with fromTemplateId to apply.',
      inputSchema: {
        projectId: z.coerce.number(),
      },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      try { await assertProjectInClient(projectId, clientId); }
      catch (e) { if (e instanceof OwnershipError) return json({ error: e.message }); throw e; }

      const rows = await db.select().from(cardTemplates)
        .where(and(
          eq(cardTemplates.clientId, clientId),
          or(eq(cardTemplates.projectId, projectId), isNull(cardTemplates.projectId)),
        ))
        .orderBy(cardTemplates.name);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_templates_create',
    {
      title: 'Create a card template',
      description: 'Create a reusable card template. Set clientWide=true to make it available across every project in the tenancy. Payload supports titlePattern, description, cardType, priority, storyPoints, workflowState, labelIds, and a checklist array.',
      inputSchema: {
        projectId: z.coerce.number(),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        clientWide: z.boolean().optional(),
        payload: z.object({
          titlePattern: z.string().optional(),
          description: z.string().optional(),
          cardType: z.enum(['task', 'story', 'epic', 'bug', 'spike']).optional(),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          storyPoints: z.coerce.number().int().optional(),
          workflowState: z.enum(['todo', 'in_progress', 'in_review', 'done', 'canceled']).optional(),
          labelIds: z.array(z.coerce.number()).optional(),
          checklist: z.array(z.object({
            text: z.string(),
            order: z.coerce.number().optional(),
          })).optional(),
        }).default({}),
      },
    },
    async ({ projectId, name, description, clientWide, payload }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      try { await assertProjectInClient(projectId, clientId); }
      catch (e) { if (e instanceof OwnershipError) return json({ error: e.message }); throw e; }

      // Normalize checklist order so each item has a definite numeric order.
      const normalized = {
        ...payload,
        checklist: Array.isArray(payload.checklist)
          ? payload.checklist.map((it, idx) => ({ text: it.text, order: it.order ?? idx }))
          : undefined,
      };

      const [row] = await db.insert(cardTemplates).values({
        clientId,
        projectId: clientWide ? null : projectId,
        name: name.trim().slice(0, 100),
        description: description?.slice(0, 5000) ?? null,
        payload: normalized,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:delete') && server.registerTool(
    'kanban_card_templates_delete',
    {
      title: 'Delete a card template',
      description: 'Permanently delete a kanban card template by id. This action is irreversible.',
      inputSchema: { id: z.coerce.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'projects:delete')) return denied('projects:delete');
      const [tpl] = await db.select({ clientId: cardTemplates.clientId }).from(cardTemplates).where(eq(cardTemplates.id, id)).limit(1);
      if (!tpl || tpl.clientId !== clientId) return json({ error: 'Template not found' });
      await db.delete(cardTemplates).where(eq(cardTemplates.id, id));
      revalidateForWrite('portal');
      return json({ ok: true });
    }
  );

  // ── SPRINT PLANNER (read-only proposal) ─────────────────────────────────
  // Differentiates SimplerDevelopment from competitors: an AI agent can grab
  // a fully-formed sprint proposal in one tool call (capacity + dependencies +
  // sizing checks) and then commit individual cards via kanban_update_card.
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_propose_sprint',
    {
      title: 'Propose a sprint',
      description:
        'Greedy sprint-packing proposal for a project: takes the prioritized backlog (sprintId=null, ordered by sprintOrder/order) and packs cards up to targetPoints (or 1.1× recent velocity if not given), respecting unfinished blockers. Returns recommended/skipped/blocked/unsized buckets plus warnings. Read-only: the agent should commit picks via kanban_update_card with the chosen sprintId.',
      inputSchema: {
        projectId: z.coerce.number(),
        targetPoints: z.coerce.number().int().nullable().optional().describe('Hard cap on points to propose. If null, defaults to 1.1× recent velocity.'),
        velocityWindow: z.coerce.number().int().min(1).max(20).optional().describe('How many recent completed sprints to average. Default 6.'),
        requireCardIds: z.array(z.coerce.number()).optional().describe('Card ids the user already pinned for the sprint; bypasses capacity + blocker gates.'),
      },
    },
    async ({ projectId, targetPoints, velocityWindow = 6, requireCardIds }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      try {
        await assertProjectInClient(projectId, clientId);
      } catch (e) {
        if (e instanceof OwnershipError) return json({ error: e.message });
        throw e;
      }

      // 1. Velocity baseline: average completed points across the last N
      // completed sprints. Mirrors /api/portal/projects/[id]/velocity but
      // bounded to the request param.
      const completedSprints = await db
        .select({ id: sprints.id, name: sprints.name, endDate: sprints.endDate })
        .from(sprints)
        .where(and(eq(sprints.projectId, projectId), eq(sprints.status, 'completed')))
        .orderBy(desc(sprints.endDate), desc(sprints.id))
        .limit(velocityWindow);

      let velocityBaseline = 0;
      if (completedSprints.length > 0) {
        const sids = completedSprints.map(s => s.id);
        const evs = await db
          .select({
            sprintId: sprintScopeHistory.sprintId,
            action: sprintScopeHistory.action,
            points: sprintScopeHistory.points,
            occurredAt: sprintScopeHistory.occurredAt,
          })
          .from(sprintScopeHistory)
          .where(inArray(sprintScopeHistory.sprintId, sids));
        const bySprint = new Map<number, SprintEvent[]>();
        for (const ev of evs) {
          if (!bySprint.has(ev.sprintId)) bySprint.set(ev.sprintId, []);
          bySprint.get(ev.sprintId)!.push({
            action: ev.action as SprintEvent['action'],
            points: ev.points,
            occurredAt: ev.occurredAt,
          });
        }
        const rows: VelocityRow[] = completedSprints.map(s => {
          const totals = computeSprintTotals(bySprint.get(s.id) ?? []);
          return {
            sprintId: s.id,
            sprintName: s.name,
            endDate: s.endDate ? new Date(s.endDate).toISOString() : null,
            committed: totals.committed,
            completed: totals.completed,
          };
        });
        velocityBaseline = computeVelocityAverages(rows).averageCompleted;
      }

      // 2. Backlog cards (sprintId=null) ordered by sprintOrder NULLS LAST
      // then card.order. The Drizzle order helper picks up NULLS naturally.
      const backlogCards = await db
        .select({
          id: kanbanCards.id,
          number: kanbanCards.number,
          title: kanbanCards.title,
          storyPoints: kanbanCards.storyPoints,
          cardType: kanbanCards.cardType,
          sprintOrder: kanbanCards.sprintOrder,
          order: kanbanCards.order,
        })
        .from(kanbanCards)
        .where(and(eq(kanbanCards.projectId, projectId), isNull(kanbanCards.sprintId)));
      backlogCards.sort((a, b) => {
        const ao = a.sprintOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.sprintOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (a.order ?? 0) - (b.order ?? 0);
      });

      // 3. Unresolved blockers per backlog card. A blocker is "unresolved" if
      // its column has is_done=false (or null).
      const cardIds = backlogCards.map(c => c.id);
      const blockerMap = new Map<number, number[]>();
      if (cardIds.length > 0) {
        const blockerRows = await db
          .select({
            blockedCardId: kanbanCardDependencies.blockedCardId,
            blockerCardId: kanbanCardDependencies.blockerCardId,
            blockerColumnIsDone: kanbanColumns.isDone,
          })
          .from(kanbanCardDependencies)
          .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockerCardId))
          .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
          .where(inArray(kanbanCardDependencies.blockedCardId, cardIds));
        for (const r of blockerRows) {
          if (r.blockerColumnIsDone) continue;
          const arr = blockerMap.get(r.blockedCardId) ?? [];
          arr.push(r.blockerCardId);
          blockerMap.set(r.blockedCardId, arr);
        }
      }

      const proposal = computeSprintProposal(
        backlogCards.map(c => ({
          id: c.id,
          number: c.number,
          title: c.title,
          storyPoints: c.storyPoints,
          cardType: c.cardType ?? 'task',
          blockerCardIds: blockerMap.get(c.id) ?? [],
        })),
        {
          targetPoints: targetPoints ?? null,
          velocityBaseline,
          requireCardIds,
        },
      );

      return json({
        ...proposal,
        velocityBaseline,
        velocityWindowSprints: completedSprints.length,
        backlogTotal: backlogCards.length,
      });
    }
  );

  // ── RECURRING TASKS ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_recurrences_list',
    {
      title: 'List recurring tasks',
      description: 'List card_recurrences rows for a project — both active and paused — sorted by next fire time.',
      inputSchema: { projectId: z.coerce.number() },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      try { await assertProjectInClient(projectId, clientId); }
      catch (e) { if (e instanceof OwnershipError) return json({ error: e.message }); throw e; }

      const rows = await db.select().from(cardRecurrences)
        .where(eq(cardRecurrences.projectId, projectId))
        .orderBy(cardRecurrences.nextFireAt);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_recurrences_create',
    {
      title: 'Create a recurring task',
      description: 'Configure a recurring card-creation rule. {{date}} in titlePattern is replaced with the firing date (YYYY-MM-DD) so daily/weekly cards get unique titles. Provide either templateId or titlePattern.',
      inputSchema: {
        projectId: z.coerce.number(),
        columnId: z.coerce.number(),
        cadence: z.enum(['daily', 'weekly', 'monthly']),
        dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
        dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
        hourUtc: z.coerce.number().int().min(0).max(23).optional(),
        templateId: z.coerce.number().optional(),
        titlePattern: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      try {
        await assertProjectInClient(args.projectId, clientId);
        await assertColumnInProject(args.columnId, args.projectId);
      } catch (e) { if (e instanceof OwnershipError) return json({ error: e.message }); throw e; }
      if (!args.templateId && !args.titlePattern?.trim()) {
        return json({ error: 'Either templateId or titlePattern is required' });
      }
      const cfg = {
        cadence: args.cadence as Cadence,
        dayOfWeek: args.dayOfWeek ?? null,
        dayOfMonth: args.dayOfMonth ?? null,
        hourUtc: args.hourUtc ?? 9,
      };
      const nextFire = computeNextFireAt(new Date(), cfg);
      const [row] = await db.insert(cardRecurrences).values({
        projectId: args.projectId,
        columnId: args.columnId,
        templateId: args.templateId ?? null,
        titlePattern: args.titlePattern?.slice(0, 255) ?? null,
        description: args.description?.slice(0, 5000) ?? null,
        cadence: args.cadence,
        dayOfWeek: cfg.dayOfWeek,
        dayOfMonth: cfg.dayOfMonth,
        hourUtc: cfg.hourUtc,
        nextFireAt: nextFire,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:delete') && server.registerTool(
    'kanban_recurrences_delete',
    {
      title: 'Delete a recurring task',
      description: 'Permanently delete a recurring card-creation rule by id. This action is irreversible and stops future card generation.',
      inputSchema: { id: z.coerce.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'projects:delete')) return denied('projects:delete');
      const [rec] = await db.select({ projectId: cardRecurrences.projectId }).from(cardRecurrences).where(eq(cardRecurrences.id, id)).limit(1);
      if (!rec) return json({ error: 'Recurrence not found' });
      try { await assertProjectInClient(rec.projectId, clientId); }
      catch (e) { if (e instanceof OwnershipError) return json({ error: e.message }); throw e; }
      await db.delete(cardRecurrences).where(eq(cardRecurrences.id, id));
      revalidateForWrite('portal');
      return json({ ok: true });
    }
  );
}
