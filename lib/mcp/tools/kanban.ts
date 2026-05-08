/**
 * MCP tools — kanban.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. The
 * registrar function below is invoked by buildMcpServer() and registers each
 * tool with its scope guard. Behavior is unchanged from the monolithic file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or, sql, gte, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { hash as hashPassword } from 'bcryptjs';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanLabels,
  kanbanCardLabels,
  kanbanCardChecklistItems,
  kanbanCardAssignees,
  kanbanCardWatchers,
  kanbanCardDependencies,
  sprintScopeHistory,
  supportTickets,
  ticketMessages,
  crmContacts,
  crmCompanies,
  crmDeals,
  crmPipelines,
  crmPipelineStages,
  posts,
  media,
  clientWebsites,
  emailLists,
  emailCampaigns,
  pitchDecks,
  brandingProfiles,
  emailSubscribers,
  emailCampaignSends,
  surveys,
  surveyResponses,
  bookingPages,
  bookings,
  sprints,
  crmActivities,
  categories,
  tags,
  postCategories,
  postTags,
  automationRules,
  clientMembers,
  users,
  crmProposals,
  crmContracts,
  crmContractSigners,
  invoices,
  invoiceItems,
  serviceRequests,
  suggestedProjectRequests,
  suggestedProjects,
  services,
  aiConversations,
  aiMessages,
  kanbanCardComments,
  kanbanCardTimeLogs,
  kanbanCardFiles,
  kanbanCardArtifacts,
  crmDealArtifacts,
  siteNavigation,
  postRevisions,
  blockTemplates,
  blockTemplateUsages,
  emailTemplates,
  emailSegments,
  giftCertificates,
  crmCustomFields,
  crmCustomFieldValues,
  crmSavedViews,
  crmScoringRules,
  websiteDomains,
  websiteEnvironments,
  websiteEnvVars,
  clients,
  aiCreditBalances,
  aiCreditLedger,
  hostedSites,
  googleWorkspaceUserConnections,
} from '@/lib/db/schema';
import type { SurveyFieldDef, ProposalSection, ProposalLineItem, ProposalFee, ContractClause, PitchDeckSlideV2 } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { logCardActivity } from '@/lib/pm-activity';
import { recordCardAddedToSprint, recordCardRemovedFromSprint, recordCardColumnMove } from '@/lib/portal/sprint-snapshots';
import { computeSprintProposal } from '@/lib/portal/sprint-planner';
import { computeSprintTotals, computeVelocityAverages, type SprintEvent, type VelocityRow } from '@/lib/portal/sprint-charts';
import { checkWipLimit } from '@/lib/portal/wip-limit';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import {
  renderBlocksToEmailHtml,
  resend,
  buildCampaignHtml,
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
} from '@/lib/email';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import { revoke as revokeGoogleToken } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import { stageOrApply } from '../pending-changes';
import { BLOCKS_SCHEMA_REFERENCE } from '../blocks-schema';
import {
  assertColumnInProject,
  assertProjectInClient,
  OwnershipError,
} from '@/lib/security/assert-owned';
import {
  json,
  serializePostContent,
  denied,
  extractRows,
  dbErrorEnvelope,
  requireScope,
  serviceDenied,
  requireService,
  assignBlockIds,
  revalidateForWrite,
} from '../types';
import {
  postProjection,
  deckProjection,
  campaignProjection,
} from '../projections';

export function registerKanbanTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── KANBAN CARDS ───────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_list_board',
    {
      title: 'Get kanban board',
      description: 'Get columns + cards for a project.',
      inputSchema: { projectId: z.number() },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const [proj] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      const cols = await db.select().from(kanbanColumns)
        .where(eq(kanbanColumns.projectId, projectId))
        .orderBy(kanbanColumns.order);
      const cards = await db.select().from(kanbanCards)
        .where(eq(kanbanCards.projectId, projectId))
        .orderBy(kanbanCards.order);
      return json({ columns: cols, cards });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_create_column',
    {
      title: 'Create kanban column',
      description: 'Add a column to a project kanban board. Appends to the end unless `order` is specified.',
      inputSchema: {
        projectId: z.number(),
        name: z.string().min(1),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color like #3b82f6'),
        order: z.number().optional().describe('Sort position; defaults to end of board.'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, args.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      const existing = await db.select({ id: kanbanColumns.id }).from(kanbanColumns)
        .where(eq(kanbanColumns.projectId, args.projectId));
      const [row] = await db.insert(kanbanColumns).values({
        projectId: args.projectId,
        name: args.name,
        color: args.color ?? null,
        order: args.order ?? existing.length,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_create_card',
    {
      title: 'Create kanban card',
      description: 'Add a card to a kanban column. Pass sprintId to assign the card to a sprint at creation time; omit or pass null to leave it in the sprint dock. Agile fields: storyPoints, cardType (epic/story/task/bug/spike), parentCardId for hierarchy, workflowState (todo/in_progress/in_review/done/canceled).',
      inputSchema: {
        projectId: z.coerce.number(),
        columnId: z.coerce.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().optional(),
        sprintId: z.coerce.number().nullable().optional().describe('Assign the card to a sprint on create. Must belong to the same project.'),
        storyPoints: z.coerce.number().int().nullable().optional(),
        cardType: z.enum(['task', 'story', 'epic', 'bug', 'spike']).optional(),
        parentCardId: z.coerce.number().nullable().optional().describe('Parent card id for hierarchy (e.g. story under epic). Must belong to the same project.'),
        workflowState: z.enum(['todo', 'in_progress', 'in_review', 'done', 'canceled']).optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      try {
        await assertProjectInClient(args.projectId, clientId);
        await assertColumnInProject(args.columnId, args.projectId);
      } catch (e) {
        if (e instanceof OwnershipError) return json({ error: e.message });
        throw e;
      }
      if (args.sprintId != null) {
        const [sprint] = await db.select({ projectId: sprints.projectId })
          .from(sprints).where(eq(sprints.id, args.sprintId)).limit(1);
        if (!sprint || sprint.projectId !== args.projectId) {
          return json({ error: 'Sprint not found in this project' });
        }
      }
      if (args.parentCardId != null) {
        const [parent] = await db.select({ projectId: kanbanCards.projectId })
          .from(kanbanCards).where(eq(kanbanCards.id, args.parentCardId)).limit(1);
        if (!parent || parent.projectId !== args.projectId) {
          return json({ error: 'Parent card not found in this project' });
        }
      }
      const wip = await checkWipLimit(args.columnId);
      if (!wip.allowed) {
        return json({ error: wip.reason, code: 'wip_limit', limit: wip.limit, currentCount: wip.currentCount });
      }
      const [row] = await db.insert(kanbanCards).values({
        projectId: args.projectId,
        columnId: args.columnId,
        title: args.title,
        description: args.description ?? null,
        priority: args.priority ?? 'medium',
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
        sprintId: args.sprintId ?? null,
        storyPoints: args.storyPoints ?? null,
        cardType: args.cardType ?? 'task',
        parentCardId: args.parentCardId ?? null,
        workflowState: args.workflowState ?? 'todo',
        createdBy: ctx.userId,
      }).returning();
      if (row.sprintId) {
        await recordCardAddedToSprint(row.id, row.sprintId, ctx.userId ?? null);
      }
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_move_card',
    {
      title: 'Move kanban card',
      description: 'Move a card to a different column and/or position.',
      inputSchema: {
        cardId: z.coerce.number(),
        columnId: z.coerce.number(),
        order: z.coerce.number().optional(),
      },
    },
    async ({ cardId, columnId, order }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId, columnId: kanbanCards.columnId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      try {
        await assertColumnInProject(columnId, card.projectId);
      } catch (e) {
        if (e instanceof OwnershipError) return json({ error: e.message });
        throw e;
      }
      const [srcCol] = await db.select({ isDone: kanbanColumns.isDone })
        .from(kanbanColumns).where(eq(kanbanColumns.id, card.columnId)).limit(1);
      const [destCol] = await db.select({ isDone: kanbanColumns.isDone })
        .from(kanbanColumns).where(eq(kanbanColumns.id, columnId)).limit(1);
      if (card.columnId !== columnId) {
        const wip = await checkWipLimit(columnId, cardId);
        if (!wip.allowed) {
          return json({ error: wip.reason, code: 'wip_limit', limit: wip.limit, currentCount: wip.currentCount });
        }
      }
      const [row] = await db.update(kanbanCards)
        .set({ columnId, order: order ?? 0, updatedAt: new Date() })
        .where(eq(kanbanCards.id, cardId))
        .returning();
      if (card.columnId !== columnId && srcCol && destCol) {
        await recordCardColumnMove(cardId, srcCol.isDone, destCol.isDone, ctx.userId ?? null);
      }
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_update_card',
    {
      title: 'Update kanban card',
      description: 'Update card fields (title, description, priority, due date, assignee, sprint, agile fields). Use kanban_move_card to change column/order. Pass sprintId=null to send the card back to the sprint dock. Agile fields: storyPoints, cardType, parentCardId, workflowState.',
      inputSchema: {
        id: z.coerce.number(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().nullable().optional().describe('ISO date, or null to clear.'),
        assignedTo: z.coerce.number().nullable().optional(),
        sprintId: z.coerce.number().nullable().optional().describe('Assign the card to a sprint; null removes the assignment.'),
        storyPoints: z.coerce.number().int().nullable().optional(),
        cardType: z.enum(['task', 'story', 'epic', 'bug', 'spike']).optional(),
        parentCardId: z.coerce.number().nullable().optional(),
        workflowState: z.enum(['todo', 'in_progress', 'in_review', 'done', 'canceled']).optional(),
      },
    },
    async ({ id, dueDate, sprintId, assignedTo, ...rest }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId, sprintId: kanbanCards.sprintId })
        .from(kanbanCards).where(eq(kanbanCards.id, id)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (dueDate !== undefined) patch.dueDate = dueDate ? new Date(dueDate) : null;
      if (sprintId !== undefined) {
        if (sprintId !== null) {
          const [sprint] = await db.select({ projectId: sprints.projectId })
            .from(sprints).where(eq(sprints.id, sprintId)).limit(1);
          if (!sprint || sprint.projectId !== card.projectId) {
            return json({ error: 'Sprint not found in this project' });
          }
        }
        patch.sprintId = sprintId;
      }
      const [row] = await db.update(kanbanCards).set(patch)
        .where(eq(kanbanCards.id, id)).returning();
      if (sprintId !== undefined && (sprintId ?? null) !== card.sprintId) {
        if (card.sprintId) await recordCardRemovedFromSprint(id, card.sprintId, ctx.userId ?? null);
        if (row.sprintId) await recordCardAddedToSprint(id, row.sprintId, ctx.userId ?? null);
      }
      if (assignedTo !== undefined) {
        const current = await db
          .select({ userId: kanbanCardAssignees.userId })
          .from(kanbanCardAssignees)
          .where(eq(kanbanCardAssignees.cardId, id));
        const currentSet = new Set(current.map(r => r.userId));
        const nextSet = new Set<number>(typeof assignedTo === 'number' ? [assignedTo] : []);
        for (const userId of currentSet) {
          if (nextSet.has(userId)) continue;
          await db.delete(kanbanCardAssignees)
            .where(and(eq(kanbanCardAssignees.cardId, id), eq(kanbanCardAssignees.userId, userId)));
          const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
          await logCardActivity(id, ctx.userId ?? null, 'card.assignee_removed', { userId, name: u?.name ?? null });
        }
        for (const userId of nextSet) {
          if (currentSet.has(userId)) continue;
          await db.insert(kanbanCardAssignees).values({ cardId: id, userId }).onConflictDoNothing();
          await db.insert(kanbanCardWatchers).values({ cardId: id, userId }).onConflictDoNothing();
          const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
          await logCardActivity(id, ctx.userId ?? null, 'card.assignee_added', { userId, name: u?.name ?? null });
        }
      }
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_delete_card',
    {
      title: 'Delete kanban card',
      description: 'Permanently delete a kanban card.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, id)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      await db.delete(kanbanCards).where(eq(kanbanCards.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_update_column',
    {
      title: 'Update kanban column',
      description: 'Rename, recolor, or reorder a kanban column.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        order: z.number().optional(),
      },
    },
    async ({ id, name, color, order }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [col] = await db.select({ projectId: kanbanColumns.projectId })
        .from(kanbanColumns).where(eq(kanbanColumns.id, id)).limit(1);
      if (!col) return json({ error: 'Column not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, col.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (color !== undefined) patch.color = color;
      if (order !== undefined) patch.order = order;
      const [row] = await db.update(kanbanColumns).set(patch)
        .where(eq(kanbanColumns.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_delete_column',
    {
      title: 'Delete kanban column',
      description: 'Permanently delete a kanban column and every card inside it (cascade).',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [col] = await db.select({ projectId: kanbanColumns.projectId })
        .from(kanbanColumns).where(eq(kanbanColumns.id, id)).limit(1);
      if (!col) return json({ error: 'Column not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, col.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      await db.delete(kanbanColumns).where(eq(kanbanColumns.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );


  // ── KANBAN LABELS ──────────────────────────────────────────────────────
  // Shared: authorize that a card belongs to a project owned by this client.
  async function authCard(cardId: number): Promise<{ projectId: number } | null> {
    const [row] = await db
      .select({ projectId: kanbanCards.projectId })
      .from(kanbanCards)
      .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
      .where(and(eq(kanbanCards.id, cardId), eq(projects.clientId, clientId))).limit(1);
    return row ?? null;
  }
  async function authProject(projectId: number): Promise<boolean> {
    const [row] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
    return !!row;
  }

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_labels_list',
    {
      title: 'List project labels',
      description: 'List all labels defined on a project.',
      inputSchema: { projectId: z.number() },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authProject(projectId))) return json({ error: 'Project not found' });
      const rows = await db.select().from(kanbanLabels)
        .where(eq(kanbanLabels.projectId, projectId))
        .orderBy(kanbanLabels.name);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_labels_create',
    {
      title: 'Create label',
      description: 'Create a label on a project. Color must be a 6-digit hex (default indigo).',
      inputSchema: {
        projectId: z.number(),
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      },
    },
    async ({ projectId, name, color }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authProject(projectId))) return json({ error: 'Project not found' });
      const [row] = await db.insert(kanbanLabels).values({
        projectId,
        name: name.trim().slice(0, 50),
        color: color ?? '#6366f1',
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_labels_update',
    {
      title: 'Update label',
      description: 'Rename or recolor a label.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).max(50).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [label] = await db
        .select({ id: kanbanLabels.id })
        .from(kanbanLabels)
        .innerJoin(projects, eq(projects.id, kanbanLabels.projectId))
        .where(and(eq(kanbanLabels.id, id), eq(projects.clientId, clientId))).limit(1);
      if (!label) return json({ error: 'Label not found' });
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(kanbanLabels).set(patch).where(eq(kanbanLabels.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_labels_delete',
    {
      title: 'Delete label',
      description: 'Delete a label. Removes it from all cards.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [label] = await db
        .select({ id: kanbanLabels.id })
        .from(kanbanLabels)
        .innerJoin(projects, eq(projects.id, kanbanLabels.projectId))
        .where(and(eq(kanbanLabels.id, id), eq(projects.clientId, clientId))).limit(1);
      if (!label) return json({ error: 'Label not found' });
      await db.delete(kanbanLabels).where(eq(kanbanLabels.id, id));
      revalidateForWrite('portal');
      return json({ deleted: true, id });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_attach_label',
    {
      title: 'Attach label to card',
      description: 'Add a project label to a card.',
      inputSchema: { cardId: z.number(), labelId: z.number() },
    },
    async ({ cardId, labelId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const card = await authCard(cardId);
      if (!card) return json({ error: 'Card not found' });
      const [label] = await db.select().from(kanbanLabels).where(eq(kanbanLabels.id, labelId)).limit(1);
      if (!label || label.projectId !== card.projectId) return json({ error: 'Label not in this project' });
      await db.insert(kanbanCardLabels).values({ cardId, labelId }).onConflictDoNothing();
      await logCardActivity(cardId, null, 'card.label_added', { labelId, name: label.name, color: label.color });
      revalidateForWrite('portal');
      return json({ attached: true });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_detach_label',
    {
      title: 'Detach label from card',
      description: 'Remove a label from a card.',
      inputSchema: { cardId: z.number(), labelId: z.number() },
    },
    async ({ cardId, labelId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const card = await authCard(cardId);
      if (!card) return json({ error: 'Card not found' });
      const [label] = await db.select().from(kanbanLabels).where(eq(kanbanLabels.id, labelId)).limit(1);
      await db.delete(kanbanCardLabels)
        .where(and(eq(kanbanCardLabels.cardId, cardId), eq(kanbanCardLabels.labelId, labelId)));
      if (label) await logCardActivity(cardId, null, 'card.label_removed', { labelId, name: label.name });
      revalidateForWrite('portal');
      return json({ detached: true });
    }
  );


  // ── KANBAN CHECKLIST ───────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_checklist_list',
    {
      title: 'List checklist items',
      description: 'List checklist items for a card.',
      inputSchema: { cardId: z.number() },
    },
    async ({ cardId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authCard(cardId))) return json({ error: 'Card not found' });
      const rows = await db.select().from(kanbanCardChecklistItems)
        .where(eq(kanbanCardChecklistItems.cardId, cardId))
        .orderBy(kanbanCardChecklistItems.order, kanbanCardChecklistItems.id);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_checklist_add',
    {
      title: 'Add checklist item',
      description: 'Append a checklist item to a card.',
      inputSchema: { cardId: z.number(), text: z.string().min(1).max(500) },
    },
    async ({ cardId, text }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authCard(cardId))) return json({ error: 'Card not found' });
      const [{ max }] = await db
        .select({ max: sql<number | null>`MAX(${kanbanCardChecklistItems.order})` })
        .from(kanbanCardChecklistItems)
        .where(eq(kanbanCardChecklistItems.cardId, cardId));
      const [item] = await db.insert(kanbanCardChecklistItems).values({
        cardId,
        text: text.trim().slice(0, 500),
        order: (max ?? -1) + 1,
      }).returning();
      await logCardActivity(cardId, null, 'card.checklist_item_added', { itemId: item.id, text: item.text });
      revalidateForWrite('portal');
      return json(item);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_checklist_update',
    {
      title: 'Update checklist item',
      description: 'Rename, toggle complete, or reorder a checklist item.',
      inputSchema: {
        id: z.number(),
        text: z.string().min(1).max(500).optional(),
        completed: z.boolean().optional(),
        order: z.number().optional(),
      },
    },
    async ({ id, text, completed, order }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [item] = await db
        .select({ id: kanbanCardChecklistItems.id, cardId: kanbanCardChecklistItems.cardId, text: kanbanCardChecklistItems.text, completed: kanbanCardChecklistItems.completed })
        .from(kanbanCardChecklistItems)
        .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardChecklistItems.cardId))
        .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
        .where(and(eq(kanbanCardChecklistItems.id, id), eq(projects.clientId, clientId))).limit(1);
      if (!item) return json({ error: 'Checklist item not found' });

      const patch: Record<string, unknown> = {};
      if (text !== undefined) patch.text = text.trim().slice(0, 500);
      if (order !== undefined) patch.order = order;
      if (completed !== undefined) {
        patch.completed = completed;
        patch.completedAt = completed ? new Date() : null;
      }
      const [row] = await db.update(kanbanCardChecklistItems).set(patch)
        .where(eq(kanbanCardChecklistItems.id, id)).returning();

      if (completed !== undefined && completed !== item.completed) {
        await logCardActivity(item.cardId, null,
          completed ? 'card.checklist_item_completed' : 'card.checklist_item_uncompleted',
          { itemId: id, text: item.text });
      }
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_checklist_delete',
    {
      title: 'Delete checklist item',
      description: 'Permanently remove a checklist item.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [item] = await db
        .select({ id: kanbanCardChecklistItems.id, cardId: kanbanCardChecklistItems.cardId, text: kanbanCardChecklistItems.text })
        .from(kanbanCardChecklistItems)
        .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardChecklistItems.cardId))
        .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
        .where(and(eq(kanbanCardChecklistItems.id, id), eq(projects.clientId, clientId))).limit(1);
      if (!item) return json({ error: 'Checklist item not found' });
      await db.delete(kanbanCardChecklistItems).where(eq(kanbanCardChecklistItems.id, id));
      await logCardActivity(item.cardId, null, 'card.checklist_item_removed', { itemId: id, text: item.text });
      revalidateForWrite('portal');
      return json({ deleted: true, id });
    }
  );


  // ── KANBAN ASSIGNEES ───────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_card_assignees_list',
    {
      title: 'List card assignees',
      description: 'Return all users assigned to a card.',
      inputSchema: { cardId: z.number() },
    },
    async ({ cardId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authCard(cardId))) return json({ error: 'Card not found' });
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(kanbanCardAssignees)
        .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
        .where(eq(kanbanCardAssignees.cardId, cardId))
        .orderBy(users.name);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_assign',
    {
      title: 'Assign user to card',
      description: 'Add a user as a card assignee. Also adds them as a watcher.',
      inputSchema: { cardId: z.number(), userId: z.number() },
    },
    async ({ cardId, userId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authCard(cardId))) return json({ error: 'Card not found' });
      await db.insert(kanbanCardAssignees).values({ cardId, userId }).onConflictDoNothing();
      // Auto-watch
      const { kanbanCardWatchers } = await import('@/lib/db/schema');
      await db.insert(kanbanCardWatchers).values({ cardId, userId }).onConflictDoNothing();
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      await logCardActivity(cardId, null, 'card.assignee_added', { userId, name: u?.name ?? null });
      revalidateForWrite('portal');
      return json({ assigned: true });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_unassign',
    {
      title: 'Unassign user from card',
      description: 'Remove a user from a card.',
      inputSchema: { cardId: z.number(), userId: z.number() },
    },
    async ({ cardId, userId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authCard(cardId))) return json({ error: 'Card not found' });
      await db.delete(kanbanCardAssignees)
        .where(and(eq(kanbanCardAssignees.cardId, cardId), eq(kanbanCardAssignees.userId, userId)));
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      await logCardActivity(cardId, null, 'card.assignee_removed', { userId, name: u?.name ?? null });
      revalidateForWrite('portal');
      return json({ unassigned: true });
    }
  );


  // ── KANBAN DEPENDENCIES ────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_card_dependencies_list',
    {
      title: 'List card dependencies',
      description: 'Return the blockers (cards blocking this one) and blocking (cards this one blocks).',
      inputSchema: { cardId: z.number() },
    },
    async ({ cardId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authCard(cardId))) return json({ error: 'Card not found' });
      const blockers = await db
        .select({ id: kanbanCards.id, title: kanbanCards.title, number: kanbanCards.number })
        .from(kanbanCardDependencies)
        .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockerCardId))
        .where(eq(kanbanCardDependencies.blockedCardId, cardId));
      const blocking = await db
        .select({ id: kanbanCards.id, title: kanbanCards.title, number: kanbanCards.number })
        .from(kanbanCardDependencies)
        .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockedCardId))
        .where(eq(kanbanCardDependencies.blockerCardId, cardId));
      return json({ blockers, blocking });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_add_blocker',
    {
      title: 'Add blocker',
      description: 'Mark this card as blocked by another card in the same project.',
      inputSchema: { cardId: z.number(), blockerCardId: z.number() },
    },
    async ({ cardId, blockerCardId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (cardId === blockerCardId) return json({ error: 'A card cannot block itself' });
      const card = await authCard(cardId);
      if (!card) return json({ error: 'Card not found' });
      const [blocker] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, blockerCardId)).limit(1);
      if (!blocker || blocker.projectId !== card.projectId) return json({ error: 'Blocker must be in the same project' });
      // Reject direct reciprocal cycle
      const [reciprocal] = await db.select().from(kanbanCardDependencies)
        .where(and(
          eq(kanbanCardDependencies.blockedCardId, blockerCardId),
          eq(kanbanCardDependencies.blockerCardId, cardId),
        )).limit(1);
      if (reciprocal) return json({ error: 'Reciprocal dependency would create a cycle' });
      await db.insert(kanbanCardDependencies).values({ blockedCardId: cardId, blockerCardId }).onConflictDoNothing();
      await logCardActivity(cardId, null, 'card.dependency_added', { blockerCardId, title: blocker.title });
      revalidateForWrite('portal');
      return json({ added: true });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_remove_blocker',
    {
      title: 'Remove blocker',
      description: 'Remove a blocker dependency from this card.',
      inputSchema: { cardId: z.number(), blockerCardId: z.number() },
    },
    async ({ cardId, blockerCardId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authCard(cardId))) return json({ error: 'Card not found' });
      await db.delete(kanbanCardDependencies).where(and(
        eq(kanbanCardDependencies.blockedCardId, cardId),
        eq(kanbanCardDependencies.blockerCardId, blockerCardId),
      ));
      await logCardActivity(cardId, null, 'card.dependency_removed', { blockerCardId });
      revalidateForWrite('portal');
      return json({ removed: true });
    }
  );


  // ── KANBAN SOCIAL ──────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'kanban_card_list_comments',
    {
      title: 'List card comments',
      description: 'List comments on a kanban card.',
      inputSchema: { cardId: z.number() },
    },
    async ({ cardId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const [card] = await db.select({ projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      const rows = await db.select().from(kanbanCardComments)
        .where(eq(kanbanCardComments.cardId, cardId))
        .orderBy(kanbanCardComments.createdAt);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_add_comment',
    {
      title: 'Comment on kanban card',
      description: 'Add a comment to a kanban card. Supports @mentions as user id array.',
      inputSchema: {
        cardId: z.number(),
        body: z.string().min(1),
        mentions: z.array(z.number()).optional(),
      },
    },
    async ({ cardId, body, mentions }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      const [row] = await db.insert(kanbanCardComments).values({
        cardId,
        userId: ctx.userId,
        body,
        mentions: mentions ?? [],
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_log_time',
    {
      title: 'Log time on kanban card',
      description: 'Log minutes worked on a card with optional note.',
      inputSchema: {
        cardId: z.number(),
        minutes: z.number().int().min(1),
        note: z.string().optional(),
        loggedAt: z.string().optional().describe('ISO datetime; defaults to now.'),
      },
    },
    async ({ cardId, minutes, note, loggedAt }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      const [row] = await db.insert(kanbanCardTimeLogs).values({
        cardId,
        userId: ctx.userId,
        minutes,
        note: note ?? null,
        loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── KANBAN CARD FILE ATTACHMENTS ───────────────────────────────────────
  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_card_attach_file_from_url',
    {
      title: 'Attach file to kanban card from URL',
      description:
        'Download a remote file (http/https, 25 MB cap) and attach it to a kanban card. Stored in S3 via the same pipeline as media uploads.',
      inputSchema: {
        cardId: z.number(),
        url: z.string().url(),
        filename: z.string().optional().describe('Override; defaults to URL basename.'),
      },
    },
    async ({ cardId, url, filename }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      try {
        await assertSafeUrl(url);
      } catch (err) {
        return json({ error: `URL rejected: ${(err as Error).message}` });
      }
      let resp: Response;
      try {
        resp = await fetch(url, { redirect: 'manual' });
        if (resp.status >= 300 && resp.status < 400) {
          return json({ error: 'Refusing to follow redirects on remote upload (SSRF guard).' });
        }
      } catch (err) {
        return json({ error: `Fetch failed: ${(err as Error).message}` });
      }
      if (!resp.ok) return json({ error: `Fetch returned ${resp.status}` });
      const buf = Buffer.from(await resp.arrayBuffer());
      const MAX_BYTES = 25 * 1024 * 1024;
      if (buf.length > MAX_BYTES) return json({ error: `File too large (${buf.length} bytes).` });
      const mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
      const derivedName = filename
        ?? decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'upload');
      const result = await uploadToS3(buf, derivedName, mimeType);
      const [row] = await db.insert(kanbanCardFiles).values({
        cardId,
        projectId: card.projectId,
        userId: ctx.userId,
        originalName: derivedName,
        storedFilename: result.storedFilename,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        url: result.url,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── KANBAN CARD ARTIFACTS ──────────────────────────────────────────────
  const CARD_ARTIFACT_TABLES: Record<string, { table: any; titleField: string }> = {
    website: { table: clientWebsites, titleField: 'name' },
    email_campaign: { table: emailCampaigns, titleField: 'name' },
    pitch_deck: { table: pitchDecks, titleField: 'title' },
    proposal: { table: crmProposals, titleField: 'title' },
    booking: { table: bookingPages, titleField: 'title' },
    survey: { table: surveys, titleField: 'title' },
    project: { table: projects, titleField: 'name' },
  };
  const CARD_ARTIFACT_TYPE_ENUM = z.enum(['website', 'email_campaign', 'pitch_deck', 'proposal', 'booking', 'survey', 'project']);

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
      description: 'List every artifact (website, email campaign, pitch deck, proposal, booking, survey, project) linked to a kanban card.',
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
      description: 'Attach a website, email campaign, pitch deck, proposal, booking, survey, or project to a kanban card. The artifact must belong to this client.',
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

      const config = CARD_ARTIFACT_TABLES[artifactType];
      const [source] = await db.select({ title: config.table[config.titleField] })
        .from(config.table)
        .where(and(eq(config.table.id, artifactId), eq(config.table.clientId, clientId)));
      if (!source) return json({ error: 'Artifact not found or not owned by this client' });

      const [row] = await db.insert(kanbanCardArtifacts).values({
        cardId,
        artifactType,
        artifactId,
        displayTitle: source.title || 'Untitled',
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
      let blockerMap = new Map<number, number[]>();
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
}
