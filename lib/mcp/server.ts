import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
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
} from '@/lib/db/schema';
import { logCardActivity } from '@/lib/pm-activity';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { BLOCKS_SCHEMA_REFERENCE, BLOCKS_SCHEMA_TLDR } from './blocks-schema';
import { registerBrandingToolsOnSdk } from '@/lib/branding/mcp-sdk-adapter';
import { registerStoreToolsOnSdk } from '@/lib/storefront/mcp-sdk-adapter';
import { registerApprovalToolsOnSdk } from './approvals';
import { stageOrApply } from './pending-changes';
import { uploadToS3 } from '@/lib/s3/upload';
import { renderBlocksToEmailHtml, resend, buildCampaignHtml, buildUnsubscribeUrl, generateUnsubscribeToken } from '@/lib/email';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import {
  emailSubscribers, emailCampaignSends,
  surveys, surveyResponses,
  bookingPages, bookings,
  sprints, crmActivities,
  categories, tags, postCategories, postTags,
  automationRules, clientMembers, users,
  crmProposals, crmContracts, crmContractSigners,
  invoices, invoiceItems,
  serviceRequests, suggestedProjectRequests, suggestedProjects, services,
  aiConversations, aiMessages,
  kanbanCardComments, kanbanCardTimeLogs, kanbanCardFiles,
  siteNavigation, postRevisions, blockTemplates,
  emailTemplates, emailSegments,
  giftCertificates,
  crmCustomFields, crmCustomFieldValues, crmSavedViews, crmScoringRules,
  websiteDomains, websiteEnvironments, websiteEnvVars,
  clients, aiCreditBalances, aiCreditLedger,
} from '@/lib/db/schema';
import type { SurveyFieldDef, ProposalSection, ProposalLineItem, ProposalFee, ContractClause } from '@/lib/db/schema';
import crypto from 'crypto';
import { gte, lte } from 'drizzle-orm';

// ─── helpers ──────────────────────────────────────────────────────────────

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

// Posts in this app store BlockEditorData JSON in the `content` column:
//   { blocks: Block[], version: '1.0' }
// The visual editor parses `content` as JSON; raw HTML/markdown renders as
// "No blocks yet". This helper accepts either a structured `blocks` array or a
// plain string (wrapped into a single text block) and serializes correctly.
function serializePostContent(args: { blocks?: unknown; content?: string }): string {
  if (Array.isArray(args.blocks) && args.blocks.length > 0) {
    return JSON.stringify({ blocks: args.blocks, version: '1.0' });
  }
  const raw = args.content ?? '';
  if (!raw.trim()) return JSON.stringify({ blocks: [], version: '1.0' });
  return JSON.stringify({
    blocks: [{ id: `block-${Date.now()}`, type: 'text', order: 0, content: raw }],
    version: '1.0',
  });
}

function denied(scope: string) {
  return {
    content: [{ type: 'text' as const, text: `Permission denied: this API key lacks the "${scope}" scope.` }],
    isError: true,
  };
}

function requireScope(ctx: PortalMcpContext, scope: string) {
  return hasScope(ctx.scopes, scope);
}

/**
 * Invalidate Next.js cache for paths affected by an MCP write.
 * Call after any DB mutation in a tool handler so the CMS (and public site,
 * for post changes) reflects the change on the next request without waiting
 * for the default revalidation interval.
 *
 * Scopes:
 *   'portal'  → /portal/** (projects, kanban, tickets, CRM, email, media)
 *   'posts'   → /portal/** + /sites/** (blocks render on public sites too)
 *   'sites'   → /sites/** only
 *
 * Errors are swallowed — revalidation is best-effort; a failure shouldn't
 * 500 the MCP tool response.
 */
function revalidateForWrite(scope: 'portal' | 'posts' | 'sites') {
  try {
    if (scope === 'portal' || scope === 'posts') {
      revalidatePath('/portal', 'layout');
    }
    if (scope === 'sites' || scope === 'posts') {
      revalidatePath('/sites', 'layout');
    }
  } catch (err) {
    console.warn('[mcp] revalidatePath failed:', err);
  }
}

// ─── server factory ───────────────────────────────────────────────────────

export function buildMcpServer(ctx: PortalMcpContext): McpServer {
  const server = new McpServer(
    { name: 'simplerdevelopment-portal', version: '0.1.0' },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: `You are connected to the SimplerDevelopment portal for client "${ctx.client.company ?? `#${ctx.client.id}`}" (id ${ctx.client.id}). Use these tools to manage projects, tickets, CRM, content, media, websites, and email campaigns. All operations are automatically scoped to this client.`,
    }
  );

  const clientId = ctx.client.id;

  // ── RESOURCES ──────────────────────────────────────────────────────────
  // Visual-editor block schema — used by AI clients to author valid `blocks`
  // arrays for posts_create / posts_update.
  server.registerResource(
    'blocks-schema',
    'blocks://schema',
    {
      title: 'Visual editor block schema',
      description:
        'Reference for the Block types accepted by posts_create and posts_update. Includes field shapes for hero, cta, stats, columns, card-grid, etc., plus a working example.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BLOCKS_SCHEMA_REFERENCE }],
    })
  );

  // ── PROJECTS ───────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'projects_list',
    {
      title: 'List projects',
      description: 'List all projects for the authenticated client.',
      inputSchema: {
        status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const rows = await db.select().from(projects)
        .where(args.status
          ? and(eq(projects.clientId, clientId), eq(projects.status, args.status))
          : eq(projects.clientId, clientId))
        .orderBy(desc(projects.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'projects_create',
    {
      title: 'Create project',
      description: 'Create a new project.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [row] = await db.insert(projects).values({
        name: args.name,
        description: args.description ?? null,
        clientId,
        status: 'active',
        isPrivate: true,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'projects_update',
    {
      title: 'Update project',
      description: 'Update a project by id (name, description, status, dates).',
      inputSchema: {
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
        dueDate: z.string().optional().describe('ISO date'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (args.name !== undefined) patch.name = args.name;
      if (args.description !== undefined) patch.description = args.description;
      if (args.status !== undefined) patch.status = args.status;
      if (args.dueDate !== undefined) patch.dueDate = new Date(args.dueDate);
      const [row] = await db.update(projects).set(patch)
        .where(and(eq(projects.id, args.id), eq(projects.clientId, clientId)))
        .returning();
      if (row) revalidateForWrite('portal');
      return json(row ?? { error: 'Not found' });
    }
  );

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
      description: 'Add a card to a kanban column.',
      inputSchema: {
        projectId: z.number(),
        columnId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, args.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      const [row] = await db.insert(kanbanCards).values({
        projectId: args.projectId,
        columnId: args.columnId,
        title: args.title,
        description: args.description ?? null,
        priority: args.priority ?? 'medium',
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
        createdBy: ctx.userId,
      }).returning();
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
        cardId: z.number(),
        columnId: z.number(),
        order: z.number().optional(),
      },
    },
    async ({ cardId, columnId, order }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return json({ error: 'Card not found' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Permission denied' });
      const [row] = await db.update(kanbanCards)
        .set({ columnId, order: order ?? 0, updatedAt: new Date() })
        .where(eq(kanbanCards.id, cardId))
        .returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'kanban_update_card',
    {
      title: 'Update kanban card',
      description: 'Update card fields (title, description, priority, due date, assignee, sprint). Use kanban_move_card to change column/order. Pass sprintId=null to send the card back to the sprint dock.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().nullable().optional().describe('ISO date, or null to clear.'),
        assignedTo: z.number().nullable().optional(),
        sprintId: z.number().nullable().optional().describe('Assign the card to a sprint; null removes the assignment.'),
      },
    },
    async ({ id, dueDate, sprintId, assignedTo, ...rest }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [card] = await db.select({ projectId: kanbanCards.projectId })
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

  // ── SUPPORT TICKETS ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'tickets:read') && server.registerTool(
    'tickets_list',
    {
      title: 'List support tickets',
      description: 'List support tickets for the client.',
      inputSchema: {
        status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, limit = 50 }) => {
      if (!requireScope(ctx, 'tickets:read')) return denied('tickets:read');
      const rows = await db.select().from(supportTickets)
        .where(status
          ? and(eq(supportTickets.clientId, clientId), eq(supportTickets.status, status))
          : eq(supportTickets.clientId, clientId))
        .orderBy(desc(supportTickets.createdAt))
        .limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'tickets:read') && server.registerTool(
    'tickets_get',
    {
      title: 'Get ticket with messages',
      description: 'Fetch a support ticket and its message thread.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'tickets:read')) return denied('tickets:read');
      const [ticket] = await db.select().from(supportTickets)
        .where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, clientId))).limit(1);
      if (!ticket) return json({ error: 'Ticket not found' });
      const messages = await db.select().from(ticketMessages)
        .where(and(eq(ticketMessages.ticketId, id), eq(ticketMessages.isInternal, false)))
        .orderBy(ticketMessages.createdAt);
      return json({ ticket, messages });
    }
  );

  hasScope(ctx.scopes, 'tickets:write') && server.registerTool(
    'tickets_create',
    {
      title: 'Create support ticket',
      description: 'Open a new support ticket.',
      inputSchema: {
        subject: z.string().min(1),
        body: z.string().min(1),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        category: z.enum(['general', 'billing', 'technical', 'domain', 'hosting']).optional(),
      },
    },
    async ({ subject, body, priority = 'medium', category = 'general' }) => {
      if (!requireScope(ctx, 'tickets:write')) return denied('tickets:write');
      const [{ maxNum }] = await db
        .select({ maxNum: sql<number>`coalesce(max(${supportTickets.number}), 0)` })
        .from(supportTickets).where(eq(supportTickets.clientId, clientId));
      const [ticket] = await db.insert(supportTickets).values({
        clientId,
        number: (maxNum ?? 0) + 1,
        subject,
        priority,
        category,
        createdBy: ctx.userId,
      }).returning();
      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        authorId: ctx.userId,
        body,
      });
      revalidateForWrite('portal');
      return json(ticket);
    }
  );

  hasScope(ctx.scopes, 'tickets:write') && server.registerTool(
    'tickets_reply',
    {
      title: 'Reply to ticket',
      description: 'Append a message to a support ticket.',
      inputSchema: { id: z.number(), body: z.string().min(1) },
    },
    async ({ id, body }) => {
      if (!requireScope(ctx, 'tickets:write')) return denied('tickets:write');
      const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets)
        .where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, clientId))).limit(1);
      if (!ticket) return json({ error: 'Ticket not found' });
      const [msg] = await db.insert(ticketMessages).values({
        ticketId: id,
        authorId: ctx.userId,
        body,
      }).returning();
      await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, id));
      revalidateForWrite('portal');
      return json(msg);
    }
  );

  hasScope(ctx.scopes, 'tickets:write') && server.registerTool(
    'tickets_update',
    {
      title: 'Update support ticket',
      description: 'Change ticket status, priority, category, or assignee. Setting status to "resolved" stamps resolvedAt.',
      inputSchema: {
        id: z.number(),
        status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        category: z.enum(['general', 'billing', 'technical', 'domain', 'hosting']).optional(),
        subject: z.string().min(1).optional(),
        assignedTo: z.number().nullable().optional().describe('User id; pass null to unassign.'),
      },
    },
    async ({ id, status, priority, category, subject, assignedTo }) => {
      if (!requireScope(ctx, 'tickets:write')) return denied('tickets:write');
      const [existing] = await db.select({ id: supportTickets.id, status: supportTickets.status })
        .from(supportTickets)
        .where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Ticket not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (status !== undefined) {
        patch.status = status;
        if (status === 'resolved' && existing.status !== 'resolved') patch.resolvedAt = new Date();
      }
      if (priority !== undefined) patch.priority = priority;
      if (category !== undefined) patch.category = category;
      if (subject !== undefined) patch.subject = subject;
      if (assignedTo !== undefined) patch.assignedTo = assignedTo;
      const [row] = await db.update(supportTickets).set(patch)
        .where(eq(supportTickets.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── CRM ────────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_contacts_search',
    {
      title: 'Search CRM contacts',
      description: 'Search CRM contacts by name or email.',
      inputSchema: {
        query: z.string().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ query, status, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmContacts.clientId, clientId)];
      if (status) conds.push(eq(crmContacts.status, status));
      if (query) {
        const q = `%${query}%`;
        const fuzzy = or(
          ilike(crmContacts.firstName, q),
          ilike(crmContacts.lastName, q),
          ilike(crmContacts.email, q)
        );
        if (fuzzy) conds.push(fuzzy);
      }
      const rows = await db.select().from(crmContacts).where(and(...conds))
        .orderBy(desc(crmContacts.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_contacts_create',
    {
      title: 'Create CRM contact',
      description: 'Create a new CRM contact.',
      inputSchema: {
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        linkedinUrl: z.string().url().optional(),
        title: z.string().optional(),
        companyId: z.number().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmContacts).values({
        clientId,
        firstName: args.firstName,
        lastName: args.lastName ?? null,
        email: args.email ?? null,
        phone: args.phone ?? null,
        linkedinUrl: args.linkedinUrl ?? null,
        title: args.title ?? null,
        companyId: args.companyId ?? null,
        status: args.status ?? 'active',
        notes: args.notes ?? null,
        ownerId: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_contacts_update',
    {
      title: 'Update CRM contact',
      description: 'Update any mutable field on a CRM contact. Pass null to clear nullable fields.',
      inputSchema: {
        id: z.number(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        linkedinUrl: z.string().url().nullable().optional(),
        title: z.string().nullable().optional(),
        companyId: z.number().nullable().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        source: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        score: z.number().optional(),
        ownerId: z.number().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmContacts.id }).from(crmContacts)
        .where(and(eq(crmContacts.id, id), eq(crmContacts.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Contact not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmContacts).set(patch)
        .where(eq(crmContacts.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_companies_search',
    {
      title: 'Search CRM companies',
      description: 'Search CRM companies by name or domain.',
      inputSchema: { query: z.string().optional(), limit: z.number().default(50).optional() },
    },
    async ({ query, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmCompanies.clientId, clientId)];
      if (query) {
        const q = `%${query}%`;
        const fuzzy = or(ilike(crmCompanies.name, q), ilike(crmCompanies.domain, q));
        if (fuzzy) conds.push(fuzzy);
      }
      const rows = await db.select().from(crmCompanies).where(and(...conds))
        .orderBy(desc(crmCompanies.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_companies_create',
    {
      title: 'Create CRM company',
      description: 'Create a new CRM company.',
      inputSchema: {
        name: z.string().min(1),
        domain: z.string().optional(),
        industry: z.string().optional(),
        website: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmCompanies).values({
        clientId,
        name: args.name,
        domain: args.domain ?? null,
        industry: args.industry ?? null,
        website: args.website ?? null,
        phone: args.phone ?? null,
        notes: args.notes ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_companies_update',
    {
      title: 'Update CRM company',
      description: 'Update any mutable field on a CRM company.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        domain: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        size: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
        .where(and(eq(crmCompanies.id, id), eq(crmCompanies.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Company not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmCompanies).set(patch)
        .where(eq(crmCompanies.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_deals_list',
    {
      title: 'List CRM deals',
      description: 'List deals in a pipeline, or across all pipelines for the client.',
      inputSchema: {
        pipelineId: z.number().optional(),
        status: z.enum(['open', 'won', 'lost']).optional(),
      },
    },
    async ({ pipelineId, status }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmDeals.clientId, clientId)];
      if (pipelineId) conds.push(eq(crmDeals.pipelineId, pipelineId));
      if (status) conds.push(eq(crmDeals.status, status));
      const rows = await db.select().from(crmDeals).where(and(...conds))
        .orderBy(desc(crmDeals.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_create',
    {
      title: 'Create CRM deal',
      description: 'Create a new deal in a pipeline stage.',
      inputSchema: {
        title: z.string().min(1),
        pipelineId: z.number(),
        stageId: z.number(),
        value: z.number().optional().describe('Amount in cents'),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        expectedCloseDate: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmDeals).values({
        clientId,
        title: args.title,
        pipelineId: args.pipelineId,
        stageId: args.stageId,
        value: args.value ?? null,
        contactId: args.contactId ?? null,
        companyId: args.companyId ?? null,
        expectedCloseDate: args.expectedCloseDate ? new Date(args.expectedCloseDate) : null,
        notes: args.notes ?? null,
        ownerId: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_move_stage',
    {
      title: 'Move deal to stage',
      description: 'Move a deal to a different pipeline stage (or close it as won/lost).',
      inputSchema: {
        id: z.number(),
        stageId: z.number().optional(),
        status: z.enum(['open', 'won', 'lost']).optional(),
      },
    },
    async ({ id, stageId, status }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (stageId !== undefined) patch.stageId = stageId;
      if (status !== undefined) {
        patch.status = status;
        if (status === 'won' || status === 'lost') patch.closedAt = new Date();
      }
      const [row] = await db.update(crmDeals).set(patch)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.clientId, clientId)))
        .returning();
      if (row) revalidateForWrite('portal');
      return json(row ?? { error: 'Not found' });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_update',
    {
      title: 'Update CRM deal',
      description: 'Update any mutable field on a CRM deal (title, value, dates, contact/company links, priority, notes). Use crm_deals_move_stage to change stageId/status.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        value: z.number().nullable().optional().describe('Amount in cents.'),
        currency: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        contactId: z.number().nullable().optional(),
        companyId: z.number().nullable().optional(),
        expectedCloseDate: z.string().nullable().optional().describe('ISO date string, or null to clear.'),
        notes: z.string().nullable().optional(),
        recurringValue: z.number().nullable().optional(),
        billingCycle: z.enum(['monthly', 'quarterly', 'annual', 'one-time']).nullable().optional(),
        ownerId: z.number().nullable().optional(),
      },
    },
    async ({ id, expectedCloseDate, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deal not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (expectedCloseDate !== undefined) {
        patch.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
      }
      const [row] = await db.update(crmDeals).set(patch)
        .where(eq(crmDeals.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_pipelines_list',
    {
      title: 'List pipelines',
      description: 'List CRM pipelines and stages.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const pipelines = await db.select().from(crmPipelines)
        .where(eq(crmPipelines.clientId, clientId));
      const stages = pipelines.length
        ? await db.select().from(crmPipelineStages)
            .where(sql`${crmPipelineStages.pipelineId} IN (${sql.join(pipelines.map(p => sql`${p.id}`), sql`, `)})`)
            .orderBy(crmPipelineStages.sortOrder)
        : [];
      return json({ pipelines, stages });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_create',
    {
      title: 'Create CRM pipeline',
      description: 'Create a new pipeline. Optionally seed it with an ordered list of stages.',
      inputSchema: {
        name: z.string().min(1),
        isDefault: z.boolean().optional(),
        stages: z.array(z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          probability: z.number().int().min(0).max(100).optional(),
        })).optional().describe('Optional initial stages in sort order.'),
      },
    },
    async ({ name, isDefault, stages }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (isDefault) {
        await db.update(crmPipelines)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(crmPipelines.clientId, clientId), eq(crmPipelines.isDefault, true)));
      }
      const [pipeline] = await db.insert(crmPipelines).values({
        clientId,
        name: name.trim(),
        isDefault: isDefault ?? false,
      }).returning();
      const insertedStages = stages && stages.length > 0
        ? await db.insert(crmPipelineStages).values(stages.map((s, i) => ({
            pipelineId: pipeline.id,
            name: s.name.trim(),
            color: s.color ?? '#6366f1',
            sortOrder: i,
            probability: s.probability ?? 0,
          }))).returning()
        : [];
      revalidateForWrite('portal');
      return json({ pipeline, stages: insertedStages });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_update',
    {
      title: 'Update CRM pipeline',
      description: 'Rename a pipeline or toggle its default flag. For stage edits use crm_pipelines_add_stage / crm_pipelines_update_stage / crm_pipelines_delete_stage.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        isDefault: z.boolean().optional(),
      },
    },
    async ({ id, name, isDefault }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
        .where(and(eq(crmPipelines.id, id), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Pipeline not found' });
      if (isDefault) {
        await db.update(crmPipelines)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(crmPipelines.clientId, clientId), eq(crmPipelines.isDefault, true)));
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) patch.name = name.trim();
      if (isDefault !== undefined) patch.isDefault = isDefault;
      const [row] = await db.update(crmPipelines).set(patch)
        .where(eq(crmPipelines.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_add_stage',
    {
      title: 'Add stage to CRM pipeline',
      description: 'Append a stage to a pipeline. Uses next sortOrder unless specified.',
      inputSchema: {
        pipelineId: z.number(),
        name: z.string().min(1),
        color: z.string().optional(),
        probability: z.number().int().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ pipelineId, name, color, probability, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [pipeline] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
        .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!pipeline) return json({ error: 'Pipeline not found' });
      const existing = await db.select({ id: crmPipelineStages.id }).from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipelineId));
      const [row] = await db.insert(crmPipelineStages).values({
        pipelineId,
        name: name.trim(),
        color: color ?? '#6366f1',
        sortOrder: sortOrder ?? existing.length,
        probability: probability ?? 0,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_update_stage',
    {
      title: 'Update CRM pipeline stage',
      description: 'Rename, recolor, reorder, or update win-probability on a pipeline stage.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        probability: z.number().int().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [stage] = await db
        .select({ id: crmPipelineStages.id, pipelineId: crmPipelineStages.pipelineId })
        .from(crmPipelineStages)
        .innerJoin(crmPipelines, eq(crmPipelines.id, crmPipelineStages.pipelineId))
        .where(and(eq(crmPipelineStages.id, id), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!stage) return json({ error: 'Stage not found' });
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmPipelineStages).set(patch)
        .where(eq(crmPipelineStages.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── WEBSITES / POSTS ───────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'sites_list',
    {
      title: 'List websites',
      description: 'List all websites owned by the client.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const rows = await db.select().from(clientWebsites)
        .where(eq(clientWebsites.clientId, clientId))
        .orderBy(desc(clientWebsites.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_list',
    {
      title: 'List posts',
      description: 'List content posts for a website (or agency site if websiteId omitted).',
      inputSchema: {
        websiteId: z.number().optional(),
        postType: z.string().optional().describe('blog, page, etc.'),
        publishedOnly: z.boolean().optional(),
        limit: z.number().default(50).optional(),
      },
    },
    async ({ websiteId, postType, publishedOnly, limit = 50 }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Site not found' });
      }
      const conds = [] as ReturnType<typeof eq>[];
      if (websiteId) conds.push(eq(posts.websiteId, websiteId));
      if (postType) conds.push(eq(posts.postType, postType));
      if (publishedOnly) conds.push(eq(posts.published, true));
      const rows = await db.select().from(posts)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(posts.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_create',
    {
      title: 'Create post',
      description:
        `Create a content post (blog entry or page) on a website. ${BLOCKS_SCHEMA_TLDR}`,
      inputSchema: {
        websiteId: z.number(),
        title: z.string().min(1),
        slug: z.string().min(1),
        content: z.string().optional().describe('Plain text/HTML — wrapped in a single text block. Prefer `blocks` for structured pages.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects matching the visual editor schema (e.g. {id, type:"hero", order, title, ...}).'),
        excerpt: z.string().optional(),
        postType: z.string().default('blog').optional(),
        published: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, args.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'create',
        entityId: null,
        summary: `Create post "${args.title}" on website ${args.websiteId}`,
        payload: args,
        apply: async () => {
          const [row] = await db.insert(posts).values({
            websiteId: args.websiteId,
            title: args.title,
            slug: args.slug,
            content: serializePostContent({ blocks: args.blocks, content: args.content }),
            excerpt: args.excerpt ?? null,
            postType: args.postType ?? 'blog',
            published: args.published ?? false,
            publishedAt: args.published ? new Date() : null,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_update',
    {
      title: 'Update post',
      description:
        `Update a content post. ${BLOCKS_SCHEMA_TLDR}`,
      inputSchema: {
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional().describe('Plain text/HTML — wrapped in a single text block. Prefer `blocks`.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects matching the visual editor schema.'),
        excerpt: z.string().optional(),
        published: z.boolean().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'update',
        entityId: id,
        summary: `Update post #${id}${rest.title ? ` → "${rest.title}"` : ''}${rest.published === true ? ' + publish' : ''}`,
        payload: { id, ...rest },
        originalSnapshot: { title: post.title, published: post.published, excerpt: post.excerpt, content: post.content },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          if (rest.title !== undefined) patch.title = rest.title;
          if (rest.blocks !== undefined || rest.content !== undefined) {
            patch.content = serializePostContent({ blocks: rest.blocks, content: rest.content });
          }
          if (rest.excerpt !== undefined) patch.excerpt = rest.excerpt;
          if (rest.published !== undefined) {
            patch.published = rest.published;
            if (rest.published) patch.publishedAt = new Date();
          }
          const [row] = await db.update(posts).set(patch).where(eq(posts.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_delete',
    {
      title: 'Delete post',
      description: 'Permanently delete a post. Revisions cascade. Only posts that belong to a website owned by this client can be deleted.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'delete',
        entityId: id,
        summary: `Delete post #${id} "${post.title}"`,
        payload: { id },
        originalSnapshot: { title: post.title, slug: post.slug, published: post.published, postType: post.postType },
        apply: async () => {
          await db.delete(posts).where(eq(posts.id, id));
          return { success: true, id };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  // ── MEDIA ──────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'media:read') && server.registerTool(
    'media_list',
    {
      title: 'List media assets',
      description: 'List uploaded media assets for the client.',
      inputSchema: { limit: z.number().default(50).optional() },
    },
    async ({ limit = 50 }) => {
      if (!requireScope(ctx, 'media:read')) return denied('media:read');
      const rows = await db.select().from(media)
        .where(eq(media.clientId, clientId))
        .orderBy(desc(media.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_upload_from_url',
    {
      title: 'Upload media from URL',
      description:
        'Download a remote image/file (http/https) and store it in the client\'s media library. Returns the media row including the internal `url` that can be used in posts, decks, and emails.',
      inputSchema: {
        url: z.string().url().describe('Public http(s) URL to fetch.'),
        filename: z.string().optional().describe('Override filename; otherwise derived from the URL path.'),
        alt: z.string().optional(),
        caption: z.string().optional(),
        websiteId: z.number().optional().describe('Scope the asset to a specific site.'),
        brandingProfileId: z.number().optional(),
      },
    },
    async ({ url, filename, alt, caption, websiteId, brandingProfileId }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      let resp: Response;
      try {
        resp = await fetch(url);
      } catch (err) {
        return json({ error: `Fetch failed: ${(err as Error).message}` });
      }
      if (!resp.ok) return json({ error: `Fetch returned ${resp.status}` });
      const contentLength = Number(resp.headers.get('content-length') ?? 0);
      const MAX_BYTES = 25 * 1024 * 1024;
      if (contentLength && contentLength > MAX_BYTES) {
        return json({ error: `File too large (${contentLength} bytes; max ${MAX_BYTES}).` });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_BYTES) return json({ error: `File too large (${buf.length} bytes).` });
      const mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
      const derivedName = filename
        ?? decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'upload')
        ?? 'upload';
      const result = await uploadToS3(buf, derivedName, mimeType);
      const [row] = await db.insert(media).values({
        filename: derivedName,
        storedFilename: result.storedFilename,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        url: result.url,
        alt: alt ?? null,
        caption: caption ?? null,
        uploadedBy: ctx.userId,
        clientId,
        websiteId: websiteId ?? null,
        brandingProfileId: brandingProfileId ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_delete',
    {
      title: 'Delete media asset',
      description: 'Delete a media row from the client\'s library. NOTE: this removes the DB record; the S3 object itself is not purged.',
      inputSchema: {
        id: z.number(),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      const [existing] = await db.select({ id: media.id }).from(media)
        .where(and(eq(media.id, id), eq(media.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Media not found' });
      await db.delete(media).where(eq(media.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );

  // ── EMAIL ──────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_lists',
    {
      title: 'List email lists',
      description: 'List email marketing lists for the client.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const rows = await db.select().from(emailLists)
        .where(eq(emailLists.clientId, clientId))
        .orderBy(desc(emailLists.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_campaigns_list',
    {
      title: 'List email campaigns',
      description: 'List email campaigns for the client.',
      inputSchema: {
        status: z.string().optional(),
      },
    },
    async ({ status }) => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const conds = [eq(emailCampaigns.clientId, clientId)];
      if (status) conds.push(eq(emailCampaigns.status, status));
      const rows = await db.select().from(emailCampaigns)
        .where(and(...conds))
        .orderBy(desc(emailCampaigns.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_create',
    {
      title: 'Create email campaign (draft)',
      description:
        'Create a draft email campaign tied to a list. Provide either `htmlContent` directly or `blocks` (visual-editor Block array — see blocks://schema). Campaign starts in `draft` status; use the portal UI to send/schedule.',
      inputSchema: {
        name: z.string().min(1).describe('Internal name for the campaign.'),
        subject: z.string().min(1),
        listId: z.number().describe('Target email list id (must belong to this client).'),
        fromName: z.string().min(1),
        fromEmail: z.string().email(),
        replyTo: z.string().email().optional(),
        previewText: z.string().optional(),
        htmlContent: z.string().optional().describe('Pre-rendered HTML body.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects; rendered to HTML server-side.'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, args.listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) return json({ error: 'List not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'create',
        entityId: null,
        summary: `Create draft campaign "${args.name}" → list #${args.listId}`,
        payload: args,
        apply: async () => {
          let finalHtml = args.htmlContent?.trim() ?? '';
          let blockContent: { blocks: unknown[] } | null = null;
          if (Array.isArray(args.blocks) && args.blocks.length > 0) {
            blockContent = { blocks: args.blocks };
            finalHtml = renderBlocksToEmailHtml(args.blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
          }
          if (!finalHtml) throw new Error('Provide htmlContent or non-empty blocks');
          const [row] = await db.insert(emailCampaigns).values({
            name: args.name.trim(),
            subject: args.subject.trim(),
            previewText: args.previewText?.trim() || null,
            fromName: args.fromName.trim(),
            fromEmail: args.fromEmail.trim(),
            replyTo: args.replyTo?.trim() || null,
            listId: args.listId,
            clientId,
            htmlContent: finalHtml,
            blockContent,
            status: 'draft',
            createdBy: ctx.userId,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'email:send') && server.registerTool(
    'email_campaigns_send',
    {
      title: 'Send email campaign NOW',
      description:
        'Dispatch a draft/scheduled campaign to every active subscriber on its list, skipping subscribers who have already received it (resume-safe). Synchronous — large lists will block the MCP call; use dryRun first to preview. Gated on the `email:send` scope, which should be granted separately from `email:write`.',
      inputSchema: {
        id: z.number(),
        dryRun: z.boolean().optional().describe('If true, return target counts without sending.'),
      },
    },
    async ({ id, dryRun }) => {
      if (!requireScope(ctx, 'email:send')) return denied('email:send');
      const [campaign] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!campaign) return json({ error: 'Campaign not found' });
      if (campaign.status === 'sent' || campaign.status === 'sending') {
        return json({ error: `Campaign is already ${campaign.status}` });
      }

      if (dryRun) {
        const already = await db.select({ subscriberId: emailCampaignSends.subscriberId })
          .from(emailCampaignSends).where(eq(emailCampaignSends.campaignId, id));
        const sentIds = new Set(already.map(s => s.subscriberId));
        const activeSubs = await db.select({ id: emailSubscribers.id }).from(emailSubscribers)
          .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));
        const willSend = activeSubs.filter(s => !sentIds.has(s.id)).length;
        return json({
          dryRun: true,
          campaignId: id,
          listId: campaign.listId,
          totalActive: activeSubs.length,
          alreadySent: sentIds.size,
          willSend,
        });
      }

      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'send',
        entityId: id,
        summary: `Send campaign #${id} "${campaign.name}" (subject: "${campaign.subject}") to list #${campaign.listId}`,
        payload: { id },
        originalSnapshot: {
          name: campaign.name,
          subject: campaign.subject,
          fromEmail: campaign.fromEmail,
          listId: campaign.listId,
        },
        apply: async () => {
          return await executeCampaignSend(id, campaign);
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // Email lists CRUD
  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_lists_create',
    {
      title: 'Create email list',
      description: 'Create a new email list owned by this client.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async ({ name, description }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [row] = await db.insert(emailLists).values({
        clientId,
        name: name.trim(),
        description: description?.trim() || null,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_lists_update',
    {
      title: 'Update email list',
      description: 'Rename an email list or update its description.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      },
    },
    async ({ id, name, description }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [existing] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, id), eq(emailLists.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'List not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) patch.name = name.trim();
      if (description !== undefined) patch.description = description;
      const [row] = await db.update(emailLists).set(patch)
        .where(eq(emailLists.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_lists_delete',
    {
      title: 'Delete email list',
      description: 'Permanently delete an email list and every subscriber in it. Campaigns referencing the list will block deletion.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [existing] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, id), eq(emailLists.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'List not found' });
      try {
        await db.delete(emailLists).where(eq(emailLists.id, id));
      } catch (err) {
        return json({ error: `Cannot delete: ${(err as Error).message}` });
      }
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );

  // Email subscribers CRUD
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_subscribers_list',
    {
      title: 'List email subscribers',
      description: 'List subscribers on a list, optionally filtered by status. Returns up to `limit` rows newest-first.',
      inputSchema: {
        listId: z.number(),
        status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
        search: z.string().optional().describe('Case-insensitive match on email or name.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ listId, status, search, limit = 100 }) => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) return json({ error: 'List not found' });
      const conds = [eq(emailSubscribers.listId, listId)];
      if (status) conds.push(eq(emailSubscribers.status, status));
      if (search) {
        const q = `%${search}%`;
        const fuzzy = or(ilike(emailSubscribers.email, q), ilike(emailSubscribers.name, q));
        if (fuzzy) conds.push(fuzzy);
      }
      const rows = await db.select().from(emailSubscribers)
        .where(and(...conds))
        .orderBy(desc(emailSubscribers.subscribedAt))
        .limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_subscribers_add',
    {
      title: 'Add email subscriber',
      description:
        'Add a subscriber to a list. If email already exists on the list, updates name/metadata/status instead of creating a duplicate. Generates a fresh unsubscribe token for new rows.',
      inputSchema: {
        listId: z.number(),
        email: z.string().email(),
        name: z.string().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
        status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
      },
    },
    async ({ listId, email, name, metadata, status }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) return json({ error: 'List not found' });
      const normalizedEmail = email.trim().toLowerCase();
      const [existing] = await db.select().from(emailSubscribers)
        .where(and(eq(emailSubscribers.listId, listId), eq(emailSubscribers.email, normalizedEmail)))
        .limit(1);
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (name !== undefined) patch.name = name;
        if (metadata !== undefined) patch.metadata = metadata;
        if (status !== undefined) patch.status = status;
        if (Object.keys(patch).length === 0) return json(existing);
        const [row] = await db.update(emailSubscribers).set(patch)
          .where(eq(emailSubscribers.id, existing.id)).returning();
        revalidateForWrite('portal');
        return json(row);
      }
      const [row] = await db.insert(emailSubscribers).values({
        listId,
        email: normalizedEmail,
        name: name ?? null,
        metadata: metadata ?? null,
        status: status ?? 'active',
        unsubscribeToken: generateUnsubscribeToken(),
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_subscribers_update',
    {
      title: 'Update email subscriber',
      description: 'Update a subscriber\'s name, status, or metadata.',
      inputSchema: {
        id: z.number(),
        name: z.string().nullable().optional(),
        status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
        metadata: z.record(z.string(), z.string()).nullable().optional(),
      },
    },
    async ({ id, name, status, metadata }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [sub] = await db
        .select({ id: emailSubscribers.id, listId: emailSubscribers.listId, status: emailSubscribers.status })
        .from(emailSubscribers)
        .innerJoin(emailLists, eq(emailLists.id, emailSubscribers.listId))
        .where(and(eq(emailSubscribers.id, id), eq(emailLists.clientId, clientId)))
        .limit(1);
      if (!sub) return json({ error: 'Subscriber not found' });
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (metadata !== undefined) patch.metadata = metadata;
      if (status !== undefined) {
        patch.status = status;
        if (status === 'unsubscribed' && sub.status !== 'unsubscribed') patch.unsubscribedAt = new Date();
      }
      const [row] = await db.update(emailSubscribers).set(patch)
        .where(eq(emailSubscribers.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_subscribers_remove',
    {
      title: 'Remove email subscriber',
      description:
        'Remove a subscriber. By default marks them as `unsubscribed` (soft-remove). Pass `hardDelete: true` to permanently delete the row — this loses the audit trail.',
      inputSchema: {
        id: z.number(),
        hardDelete: z.boolean().optional(),
      },
    },
    async ({ id, hardDelete }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [sub] = await db
        .select({ id: emailSubscribers.id })
        .from(emailSubscribers)
        .innerJoin(emailLists, eq(emailLists.id, emailSubscribers.listId))
        .where(and(eq(emailSubscribers.id, id), eq(emailLists.clientId, clientId)))
        .limit(1);
      if (!sub) return json({ error: 'Subscriber not found' });
      if (hardDelete) {
        await db.delete(emailSubscribers).where(eq(emailSubscribers.id, id));
        revalidateForWrite('portal');
        return json({ success: true, id, mode: 'hard' });
      }
      await db.update(emailSubscribers)
        .set({ status: 'unsubscribed', unsubscribedAt: new Date() })
        .where(eq(emailSubscribers.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id, mode: 'soft' });
    }
  );

  // ── PITCH DECKS ────────────────────────────────────────────────────────
  // Keywords for tool-search discovery: pitch deck, presentation, slideshow,
  // slides, pptx, sales deck, proposal, investor deck.
  hasScope(ctx.scopes, 'decks:read') && server.registerTool(
    'decks_list',
    {
      title: 'List pitch decks / presentations',
      description:
        'List pitch decks (a.k.a. presentations, slideshows, sales decks, proposals, investor decks) for the client. Use this to find an existing deck before creating a new one.',
      inputSchema: {
        status: z.enum(['draft', 'published', 'archived']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, limit = 50 }) => {
      if (!requireScope(ctx, 'decks:read')) return denied('decks:read');
      const conds = [eq(pitchDecks.clientId, clientId)];
      if (status) conds.push(eq(pitchDecks.status, status));
      const rows = await db.select({
        id: pitchDecks.id,
        title: pitchDecks.title,
        slug: pitchDecks.slug,
        description: pitchDecks.description,
        status: pitchDecks.status,
        formatVersion: pitchDecks.formatVersion,
        brandingProfileId: pitchDecks.brandingProfileId,
        createdAt: pitchDecks.createdAt,
        updatedAt: pitchDecks.updatedAt,
      }).from(pitchDecks).where(and(...conds))
        .orderBy(desc(pitchDecks.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'decks:read') && server.registerTool(
    'decks_get',
    {
      title: 'Get pitch deck with slides',
      description:
        'Fetch a full pitch deck / presentation including its slides, theme, and metadata. Slides use the V2 block-editor format — see the blocks://schema resource for slide block shapes.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'decks:read')) return denied('decks:read');
      const [deck] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!deck) return json({ error: 'Deck not found' });
      return json(deck);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_create',
    {
      title: 'Create pitch deck / presentation',
      description:
        'Create a new pitch deck (presentation, slideshow, sales deck, proposal). Starts empty — use decks_replace_slides or decks_add_slide to add content.',
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        sourceUrl: z.string().url().optional().describe('Optional reference site used for branding inspiration.'),
        brandingProfileId: z.number().optional().describe('Optional branding profile to inherit theme from.'),
        theme: z.object({
          primaryColor: z.string().optional(),
          accentColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          textColor: z.string().optional(),
          headingFont: z.string().optional(),
          bodyFont: z.string().optional(),
          logo: z.string().optional(),
        }).partial().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'create',
        entityId: null,
        summary: `Create pitch deck "${args.title}"`,
        payload: args,
        apply: async () => {
          const baseSlug = args.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const slug = `${baseSlug}-${Date.now().toString(36)}`;
          const [deck] = await db.insert(pitchDecks).values({
            clientId,
            title: args.title.trim(),
            slug,
            description: args.description?.trim() || null,
            sourceUrl: args.sourceUrl ?? null,
            brandingProfileId: args.brandingProfileId ?? null,
            theme: args.theme
              ? {
                  primaryColor: args.theme.primaryColor ?? '#2563eb',
                  accentColor: args.theme.accentColor ?? '#60a5fa',
                  backgroundColor: args.theme.backgroundColor ?? '#0f172a',
                  textColor: args.theme.textColor ?? '#f8fafc',
                  headingFont: args.theme.headingFont ?? 'Inter',
                  bodyFont: args.theme.bodyFont ?? 'Inter',
                  logo: args.theme.logo,
                }
              : undefined,
            formatVersion: 2,
            slides: [],
            createdBy: ctx.userId,
          }).returning();
          return deck;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_update',
    {
      title: 'Update pitch deck metadata / theme',
      description: 'Update title, description, status, theme, or slug on a deck. For slide content use decks_replace_slides or decks_add_slide.',
      inputSchema: {
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        theme: z.object({
          primaryColor: z.string().optional(),
          accentColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          textColor: z.string().optional(),
          headingFont: z.string().optional(),
          bodyFont: z.string().optional(),
          logo: z.string().optional(),
        }).partial().optional(),
        slug: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, args.id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'update',
        entityId: args.id,
        summary: `Update deck #${args.id} "${existing.title}"${args.status ? ` → ${args.status}` : ''}`,
        payload: args,
        originalSnapshot: { title: existing.title, description: existing.description, status: existing.status, theme: existing.theme },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          if (args.title !== undefined) patch.title = args.title.trim();
          if (args.description !== undefined) patch.description = args.description?.trim() || null;
          if (args.status !== undefined) patch.status = args.status;
          if (args.theme !== undefined) patch.theme = { ...existing.theme, ...args.theme };
          if (args.slug !== undefined) patch.slug = args.slug.trim();
          const [row] = await db.update(pitchDecks).set(patch)
            .where(eq(pitchDecks.id, args.id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_replace_slides',
    {
      title: 'Replace all deck slides',
      description:
        'Replace the entire slide array of a deck with a new V2 slide list. Each slide = { id, label, blocks[], notes? }. Blocks follow the visual-editor schema (see blocks://schema).',
      inputSchema: {
        id: z.number(),
        slides: z.array(z.object({
          id: z.string(),
          label: z.string(),
          blocks: z.array(z.any()),
          notes: z.string().optional(),
          pageSettings: z.any().optional(),
        })),
      },
    },
    async ({ id, slides }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck_slides',
        operation: 'replace_slides',
        entityId: id,
        summary: `Replace all slides on deck #${id} "${existing.title}" (${slides.length} slide${slides.length === 1 ? '' : 's'})`,
        payload: { id, slides },
        originalSnapshot: { slides: existing.slides, formatVersion: existing.formatVersion },
        apply: async () => {
          const [row] = await db.update(pitchDecks)
            .set({ slides: slides as PitchDeckSlideV2[], formatVersion: 2, updatedAt: new Date() })
            .where(eq(pitchDecks.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_add_slide',
    {
      title: 'Append a slide to a deck',
      description:
        'Append a single V2 slide to the end of a deck. Slide = { label, blocks[], notes? }. An id will be generated if omitted. Blocks follow the visual-editor schema (see blocks://schema).',
      inputSchema: {
        deckId: z.number(),
        label: z.string().min(1).describe('Slide name shown in the sidebar (e.g. "Cover", "Problem", "Solution").'),
        blocks: z.array(z.any()).describe('Array of Block objects (hero, text, columns, card-grid, etc.)'),
        notes: z.string().optional().describe('Speaker notes.'),
        id: z.string().optional(),
      },
    },
    async ({ deckId, label, blocks, notes, id }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck_slides',
        operation: 'add_slide',
        entityId: deckId,
        summary: `Add slide "${label}" to deck #${deckId} "${existing.title}"`,
        payload: { deckId, label, blocks, notes, id },
        apply: async () => {
          const currentSlides = Array.isArray(existing.slides) ? (existing.slides as unknown[]) : [];
          const newSlide = {
            id: id ?? `slide-${Date.now().toString(36)}`,
            label,
            blocks,
            notes,
          };
          const nextSlides = [...currentSlides, newSlide] as PitchDeckSlideV2[];
          const [row] = await db.update(pitchDecks)
            .set({ slides: nextSlides, formatVersion: 2, updatedAt: new Date() })
            .where(eq(pitchDecks.id, deckId)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_delete',
    {
      title: 'Delete pitch deck',
      description: 'Permanently delete a pitch deck and all its versions.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'delete',
        entityId: id,
        summary: `Delete deck #${id} "${existing.title}"`,
        payload: { id },
        originalSnapshot: { title: existing.title, status: existing.status, slideCount: Array.isArray(existing.slides) ? existing.slides.length : 0 },
        apply: async () => {
          await db.delete(pitchDecks).where(eq(pitchDecks.id, id));
          return { success: true, id };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // ── SURVEYS / FORMS ────────────────────────────────────────────────────
  // Keywords: survey, form, intake, questionnaire, poll, feedback, NPS.
  hasScope(ctx.scopes, 'surveys:read') && server.registerTool(
    'surveys_list',
    {
      title: 'List surveys / forms',
      description: 'List surveys (forms, intake questionnaires, feedback polls) for the client.',
      inputSchema: {
        status: z.enum(['draft', 'active', 'closed']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, limit = 50 }) => {
      if (!requireScope(ctx, 'surveys:read')) return denied('surveys:read');
      const conds = [eq(surveys.clientId, clientId)];
      if (status) conds.push(eq(surveys.status, status));
      const rows = await db.select({
        id: surveys.id,
        title: surveys.title,
        slug: surveys.slug,
        description: surveys.description,
        status: surveys.status,
        responseCount: surveys.responseCount,
        closesAt: surveys.closesAt,
        createdAt: surveys.createdAt,
        updatedAt: surveys.updatedAt,
      }).from(surveys).where(and(...conds))
        .orderBy(desc(surveys.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'surveys:read') && server.registerTool(
    'surveys_get',
    {
      title: 'Get survey with fields',
      description: 'Fetch a survey\'s full definition including fields, pages, and settings.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'surveys:read')) return denied('surveys:read');
      const [row] = await db.select().from(surveys)
        .where(and(eq(surveys.id, id), eq(surveys.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Survey not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'surveys:read') && server.registerTool(
    'surveys_list_responses',
    {
      title: 'List survey responses',
      description:
        'List submitted responses for a survey. Returns answers as a JSON object keyed by field id. Useful for AI analysis of form submissions.',
      inputSchema: {
        surveyId: z.number(),
        since: z.string().optional().describe('ISO date — return responses submitted after this time.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ surveyId, since, limit = 100 }) => {
      if (!requireScope(ctx, 'surveys:read')) return denied('surveys:read');
      const [survey] = await db.select({ id: surveys.id }).from(surveys)
        .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId))).limit(1);
      if (!survey) return json({ error: 'Survey not found' });
      const conds = [eq(surveyResponses.surveyId, surveyId)];
      if (since) conds.push(gte(surveyResponses.createdAt, new Date(since)));
      const rows = await db.select().from(surveyResponses)
        .where(and(...conds))
        .orderBy(desc(surveyResponses.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'surveys:write') && server.registerTool(
    'surveys_create',
    {
      title: 'Create survey / form',
      description:
        'Create a new survey. Fields are SurveyFieldDef objects: { id, type: "text"|"textarea"|"email"|"phone"|"select"|"radio"|"checkbox"|"toggle"|"date"|"rating"|"number"|"url"|"heading"|"slider", label, required, order, options? }. Survey starts in `draft` — use surveys_update to activate.',
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        fields: z.array(z.any()).optional().describe('SurveyFieldDef[]'),
        thankYouTitle: z.string().optional(),
        thankYouMessage: z.string().optional(),
        requireEmail: z.boolean().optional(),
        allowMultiple: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'surveys:write')) return denied('surveys:write');
      const baseSlug = args.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const [row] = await db.insert(surveys).values({
        clientId,
        title: args.title.trim(),
        slug,
        description: args.description?.trim() || null,
        fields: (args.fields ?? []) as SurveyFieldDef[],
        thankYouTitle: args.thankYouTitle,
        thankYouMessage: args.thankYouMessage,
        requireEmail: args.requireEmail ?? false,
        allowMultiple: args.allowMultiple ?? true,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'surveys:write') && server.registerTool(
    'surveys_update',
    {
      title: 'Update survey',
      description: 'Update title, description, status (draft/active/closed), or fields of a survey.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(['draft', 'active', 'closed']).optional(),
        fields: z.array(z.any()).optional(),
        thankYouTitle: z.string().optional(),
        thankYouMessage: z.string().optional(),
        closesAt: z.string().nullable().optional(),
        maxResponses: z.number().nullable().optional(),
      },
    },
    async ({ id, closesAt, fields, ...rest }) => {
      if (!requireScope(ctx, 'surveys:write')) return denied('surveys:write');
      const [existing] = await db.select({ id: surveys.id }).from(surveys)
        .where(and(eq(surveys.id, id), eq(surveys.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Survey not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (fields !== undefined) patch.fields = fields as SurveyFieldDef[];
      if (closesAt !== undefined) patch.closesAt = closesAt ? new Date(closesAt) : null;
      const [row] = await db.update(surveys).set(patch)
        .where(eq(surveys.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── BOOKINGS / APPOINTMENTS ────────────────────────────────────────────
  // Keywords: booking, appointment, calendar, schedule, meeting, reservation.
  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'booking_pages_list',
    {
      title: 'List booking pages',
      description: 'List bookable services / appointment types (booking pages) for the client.',
      inputSchema: {
        activeOnly: z.boolean().optional().default(true),
      },
    },
    async ({ activeOnly = true }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const conds = [eq(bookingPages.clientId, clientId)];
      if (activeOnly) conds.push(eq(bookingPages.active, true));
      const rows = await db.select({
        id: bookingPages.id,
        title: bookingPages.title,
        slug: bookingPages.slug,
        description: bookingPages.description,
        price: bookingPages.price,
        duration: bookingPages.duration,
        timezone: bookingPages.timezone,
        maxGuests: bookingPages.maxGuests,
        active: bookingPages.active,
        websiteId: bookingPages.websiteId,
      }).from(bookingPages).where(and(...conds))
        .orderBy(desc(bookingPages.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'booking_pages_get',
    {
      title: 'Get booking page',
      description: 'Full booking page config including availability, questions, and feature toggles.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const [row] = await db.select().from(bookingPages)
        .where(and(eq(bookingPages.id, id), eq(bookingPages.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Booking page not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'bookings_list',
    {
      title: 'List appointments / bookings',
      description:
        'List scheduled bookings for the client. Filter by booking page, status, or date range. Use this to answer "what\'s on my calendar this week".',
      inputSchema: {
        bookingPageId: z.number().optional(),
        status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
        startAfter: z.string().optional().describe('ISO datetime — only bookings with startTime >= this.'),
        endBefore: z.string().optional().describe('ISO datetime — only bookings with startTime <= this.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ bookingPageId, status, startAfter, endBefore, limit = 100 }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const conds = [eq(bookings.clientId, clientId)];
      if (bookingPageId) conds.push(eq(bookings.bookingPageId, bookingPageId));
      if (status) conds.push(eq(bookings.status, status));
      if (startAfter) conds.push(gte(bookings.startTime, new Date(startAfter)));
      if (endBefore) conds.push(lte(bookings.startTime, new Date(endBefore)));
      const rows = await db.select().from(bookings)
        .where(and(...conds))
        .orderBy(bookings.startTime).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'bookings_get',
    {
      title: 'Get booking',
      description: 'Fetch a single booking by id.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const [row] = await db.select().from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Booking not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'bookings_cancel',
    {
      title: 'Cancel booking / appointment',
      description:
        'Cancel a booking. Marks status=cancelled and stamps cancelledAt. This does NOT auto-refund payment or remove Google Calendar events — handle those in the UI or via separate tools when they exist.',
      inputSchema: {
        id: z.number(),
        reason: z.string().optional().describe('Internal note appended to booking.notes.'),
      },
    },
    async ({ id, reason }) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      const [existing] = await db.select().from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Booking not found' });
      if (existing.status === 'cancelled') return json({ error: 'Booking already cancelled' });
      const patch: Record<string, unknown> = {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      };
      if (reason) {
        const prior = existing.notes?.trim();
        patch.notes = prior ? `${prior}\n[cancelled] ${reason}` : `[cancelled] ${reason}`;
      }
      const [row] = await db.update(bookings).set(patch)
        .where(eq(bookings.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'bookings_update',
    {
      title: 'Update booking',
      description:
        'Edit booking fields (times, status, notes, assignee, check-in). Time changes DO NOT automatically push to Google Calendar or notify the guest.',
      inputSchema: {
        id: z.number(),
        startTime: z.string().optional().describe('ISO datetime.'),
        endTime: z.string().optional().describe('ISO datetime.'),
        status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
        notes: z.string().nullable().optional(),
        assignedTo: z.number().nullable().optional(),
        guestName: z.string().min(1).optional(),
        guestEmail: z.string().email().optional(),
        guestPhone: z.string().nullable().optional(),
      },
    },
    async ({ id, startTime, endTime, ...rest }) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      const [existing] = await db.select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Booking not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (startTime !== undefined) patch.startTime = new Date(startTime);
      if (endTime !== undefined) patch.endTime = new Date(endTime);
      if (rest.status === 'cancelled' && existing.status !== 'cancelled') {
        patch.cancelledAt = new Date();
      }
      const [row] = await db.update(bookings).set(patch)
        .where(eq(bookings.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── SPRINTS ────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'sprints_list',
    {
      title: 'List project sprints',
      description: 'List sprints on a project (planning/active/completed).',
      inputSchema: {
        projectId: z.number(),
        status: z.enum(['planning', 'active', 'completed']).optional(),
      },
    },
    async ({ projectId, status }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      const conds = [eq(sprints.projectId, projectId)];
      if (status) conds.push(eq(sprints.status, status));
      const rows = await db.select().from(sprints)
        .where(and(...conds))
        .orderBy(sprints.order);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'sprints_create',
    {
      title: 'Create sprint',
      description: 'Add a sprint to a project. Appends to the end unless `order` specified.',
      inputSchema: {
        projectId: z.number(),
        name: z.string().min(1),
        goal: z.string().optional(),
        startDate: z.string().optional().describe('ISO date'),
        endDate: z.string().optional().describe('ISO date'),
        status: z.enum(['planning', 'active', 'completed']).optional(),
        order: z.number().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, args.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      const existing = await db.select({ id: sprints.id }).from(sprints)
        .where(eq(sprints.projectId, args.projectId));
      const [row] = await db.insert(sprints).values({
        projectId: args.projectId,
        name: args.name.trim(),
        goal: args.goal ?? null,
        startDate: args.startDate ? new Date(args.startDate) : null,
        endDate: args.endDate ? new Date(args.endDate) : null,
        status: args.status ?? 'planning',
        order: args.order ?? existing.length,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'sprints_update',
    {
      title: 'Update sprint',
      description: 'Update sprint name, goal, dates, status, or order.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        goal: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        status: z.enum(['planning', 'active', 'completed']).optional(),
        order: z.number().optional(),
      },
    },
    async ({ id, startDate, endDate, ...rest }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [sprint] = await db
        .select({ id: sprints.id, projectId: sprints.projectId })
        .from(sprints)
        .innerJoin(projects, eq(projects.id, sprints.projectId))
        .where(and(eq(sprints.id, id), eq(projects.clientId, clientId))).limit(1);
      if (!sprint) return json({ error: 'Sprint not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (startDate !== undefined) patch.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) patch.endDate = endDate ? new Date(endDate) : null;
      const [row] = await db.update(sprints).set(patch)
        .where(eq(sprints.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'sprints_delete',
    {
      title: 'Delete sprint',
      description: 'Permanently delete a sprint. Cards currently assigned to it are sent back to the sprint dock (sprintId cleared).',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [sprint] = await db
        .select({ id: sprints.id })
        .from(sprints)
        .innerJoin(projects, eq(projects.id, sprints.projectId))
        .where(and(eq(sprints.id, id), eq(projects.clientId, clientId))).limit(1);
      if (!sprint) return json({ error: 'Sprint not found' });
      await db.delete(sprints).where(eq(sprints.id, id));
      revalidateForWrite('portal');
      return json({ deleted: true, id });
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

  // ── CRM ACTIVITIES ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_activities_list',
    {
      title: 'List CRM activities / notes',
      description:
        'List logged activities (calls, emails, meetings, notes, tasks) filtered by contact/deal/company.',
      inputSchema: {
        contactId: z.number().optional(),
        dealId: z.number().optional(),
        companyId: z.number().optional(),
        type: z.enum(['call', 'email', 'meeting', 'note', 'task']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ contactId, dealId, companyId, type, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmActivities.clientId, clientId)];
      if (contactId) conds.push(eq(crmActivities.contactId, contactId));
      if (dealId) conds.push(eq(crmActivities.dealId, dealId));
      if (companyId) conds.push(eq(crmActivities.companyId, companyId));
      if (type) conds.push(eq(crmActivities.type, type));
      const rows = await db.select().from(crmActivities)
        .where(and(...conds))
        .orderBy(desc(crmActivities.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_activities_create',
    {
      title: 'Log CRM activity / note',
      description:
        'Log an activity against a contact, deal, or company. Type "note" captures a plain observation; "task" supports dueDate; "completedAt" marks it done.',
      inputSchema: {
        type: z.enum(['call', 'email', 'meeting', 'note', 'task']),
        title: z.string().min(1),
        description: z.string().optional(),
        contactId: z.number().optional(),
        dealId: z.number().optional(),
        companyId: z.number().optional(),
        dueDate: z.string().optional().describe('ISO datetime (for tasks).'),
        completedAt: z.string().optional().describe('ISO datetime — mark activity as complete.'),
      },
    },
    async ({ type, title, description, contactId, dealId, companyId, dueDate, completedAt }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!contactId && !dealId && !companyId) {
        return json({ error: 'Provide at least one of contactId, dealId, or companyId' });
      }
      const [row] = await db.insert(crmActivities).values({
        clientId,
        type,
        title: title.trim(),
        description: description ?? null,
        contactId: contactId ?? null,
        dealId: dealId ?? null,
        companyId: companyId ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completedAt: completedAt ? new Date(completedAt) : null,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── CATEGORIES / TAGS ──────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'taxonomies_list',
    {
      title: 'List categories and tags',
      description: 'List categories and tags scoped to a website (the client must own it).',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const [cats, tgs] = await Promise.all([
        db.select().from(categories).where(eq(categories.websiteId, websiteId)).orderBy(categories.name),
        db.select().from(tags).where(eq(tags.websiteId, websiteId)).orderBy(tags.name),
      ]);
      return json({ categories: cats, tags: tgs });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'taxonomies_create_category',
    {
      title: 'Create post category',
      description: 'Create a category on a website. Slug must be unique per website.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().min(1).optional().describe('Derived from name if omitted.'),
        description: z.string().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      },
    },
    async ({ websiteId, name, slug, description, color }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const finalSlug = (slug ?? name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      try {
        const [row] = await db.insert(categories).values({
          websiteId,
          name: name.trim(),
          slug: finalSlug,
          description: description ?? null,
          color: color ?? null,
        }).returning();
        revalidateForWrite('posts');
        return json(row);
      } catch (err) {
        return json({ error: `Could not create category (likely duplicate slug): ${(err as Error).message}` });
      }
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'taxonomies_create_tag',
    {
      title: 'Create post tag',
      description: 'Create a tag on a website. Slug must be unique per website.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().min(1).optional(),
      },
    },
    async ({ websiteId, name, slug }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const finalSlug = (slug ?? name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      try {
        const [row] = await db.insert(tags).values({
          websiteId,
          name: name.trim(),
          slug: finalSlug,
        }).returning();
        revalidateForWrite('posts');
        return json(row);
      } catch (err) {
        return json({ error: `Could not create tag (likely duplicate slug): ${(err as Error).message}` });
      }
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_set_taxonomies',
    {
      title: 'Set post categories and tags',
      description:
        'Replace the categories and/or tags assigned to a post. Pass arrays of category/tag ids (not names) — call taxonomies_list first to look them up. Omitted arrays are left unchanged.',
      inputSchema: {
        postId: z.number(),
        categoryIds: z.array(z.number()).optional(),
        tagIds: z.array(z.number()).optional(),
      },
    },
    async ({ postId, categoryIds, tagIds }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts)
        .where(eq(posts.id, postId)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (!post.websiteId) return json({ error: 'Permission denied — agency post' });
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Permission denied' });
      if (categoryIds !== undefined) {
        await db.delete(postCategories).where(eq(postCategories.postId, postId));
        if (categoryIds.length > 0) {
          await db.insert(postCategories).values(categoryIds.map(cid => ({ postId, categoryId: cid })));
        }
      }
      if (tagIds !== undefined) {
        await db.delete(postTags).where(eq(postTags.postId, postId));
        if (tagIds.length > 0) {
          await db.insert(postTags).values(tagIds.map(tid => ({ postId, tagId: tid })));
        }
      }
      revalidateForWrite('posts');
      const assignedCats = await db.select({ categoryId: postCategories.categoryId })
        .from(postCategories).where(eq(postCategories.postId, postId));
      const assignedTags = await db.select({ tagId: postTags.tagId })
        .from(postTags).where(eq(postTags.postId, postId));
      return json({
        postId,
        categoryIds: assignedCats.map(r => r.categoryId),
        tagIds: assignedTags.map(r => r.tagId),
      });
    }
  );

  // ── SITES WRITE ────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_update',
    {
      title: 'Update website settings',
      description:
        'Update metadata on a client website (name, domain, description, active flag, public access gating). DNS/Vercel provisioning is not triggered by this tool — changes are persisted to the portal only.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        domain: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        active: z.boolean().optional(),
        publicAccess: z.boolean().optional(),
        brandingProfileId: z.number().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [existing] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Site not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(clientWebsites).set(patch)
        .where(eq(clientWebsites.id, id)).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  // ── AUTOMATIONS ────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'automations:read') && server.registerTool(
    'automations_list',
    {
      title: 'List automation rules',
      description: 'List automation rules configured for the client, including trigger + condition + action blobs.',
      inputSchema: {
        enabled: z.boolean().optional(),
        productScope: z.string().optional(),
      },
    },
    async ({ enabled, productScope }) => {
      if (!requireScope(ctx, 'automations:read')) return denied('automations:read');
      const conds = [eq(automationRules.clientId, clientId)];
      if (enabled !== undefined) conds.push(eq(automationRules.enabled, enabled));
      if (productScope) conds.push(eq(automationRules.productScope, productScope));
      const rows = await db.select().from(automationRules)
        .where(and(...conds))
        .orderBy(desc(automationRules.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_toggle',
    {
      title: 'Enable / disable automation rule',
      description: 'Flip the `enabled` flag on an automation rule without touching its trigger/conditions/actions.',
      inputSchema: {
        id: z.number(),
        enabled: z.boolean(),
      },
    },
    async ({ id, enabled }) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [existing] = await db.select({ id: automationRules.id }).from(automationRules)
        .where(and(eq(automationRules.id, id), eq(automationRules.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Rule not found' });
      const [row] = await db.update(automationRules)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(automationRules.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── TEAM ───────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'team:read') && server.registerTool(
    'team_list_members',
    {
      title: 'List team members',
      description: 'List users with access to this client (via client_members). Returns user name, email, and role.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'team:read')) return denied('team:read');
      const rows = await db
        .select({
          memberId: clientMembers.id,
          role: clientMembers.role,
          userId: users.id,
          name: users.name,
          email: users.email,
          joinedAt: clientMembers.createdAt,
        })
        .from(clientMembers)
        .innerJoin(users, eq(users.id, clientMembers.userId))
        .where(eq(clientMembers.clientId, clientId))
        .orderBy(clientMembers.createdAt);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'team_update_role',
    {
      title: 'Change team member role',
      description:
        'Change a team member\'s role (owner/admin/member/viewer). Requires team:write. The caller is responsible for not demoting the last owner — no server-side guard here.',
      inputSchema: {
        memberId: z.number(),
        role: z.enum(['owner', 'admin', 'member', 'viewer']),
      },
    },
    async ({ memberId, role }) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      const [existing] = await db.select({ id: clientMembers.id }).from(clientMembers)
        .where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Member not found' });
      const [row] = await db.update(clientMembers).set({ role })
        .where(eq(clientMembers.id, memberId)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'team_remove_member',
    {
      title: 'Remove team member',
      description: 'Remove a user\'s client_members row for this client. Does not delete the user account.',
      inputSchema: { memberId: z.number() },
    },
    async ({ memberId }) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      const [existing] = await db.select({ id: clientMembers.id }).from(clientMembers)
        .where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Member not found' });
      await db.delete(clientMembers).where(eq(clientMembers.id, memberId));
      revalidateForWrite('portal');
      return json({ success: true, memberId });
    }
  );

  // ── CRM PROPOSALS ──────────────────────────────────────────────────────
  // Keywords: proposal, quote, estimate, SOW, statement of work, bid.
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'proposals_list',
    {
      title: 'List CRM proposals / quotes',
      description: 'List proposals (quotes, estimates, SOWs) for the client. Filter by status or deal.',
      inputSchema: {
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']).optional(),
        dealId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, dealId, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmProposals.clientId, clientId)];
      if (status) conds.push(eq(crmProposals.status, status));
      if (dealId) conds.push(eq(crmProposals.dealId, dealId));
      const rows = await db.select({
        id: crmProposals.id,
        title: crmProposals.title,
        status: crmProposals.status,
        contactId: crmProposals.contactId,
        companyId: crmProposals.companyId,
        dealId: crmProposals.dealId,
        sentAt: crmProposals.sentAt,
        acceptedAt: crmProposals.acceptedAt,
        declinedAt: crmProposals.declinedAt,
        viewCount: crmProposals.viewCount,
        validUntil: crmProposals.validUntil,
        createdAt: crmProposals.createdAt,
        updatedAt: crmProposals.updatedAt,
      }).from(crmProposals).where(and(...conds))
        .orderBy(desc(crmProposals.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'proposals_get',
    {
      title: 'Get CRM proposal',
      description: 'Fetch a proposal with full sections, line items, fees, and signature status.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [row] = await db.select().from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Proposal not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_create',
    {
      title: 'Create CRM proposal',
      description:
        'Create a new proposal (quote/estimate/SOW). Sections are { id, type: "text"|"heading"|"image"|"divider"|"pricing"|"terms"|"signature", title?, content?, imageUrl? }. Line items are { id, description, quantity, unitPrice (cents), optional? }. Fees are { label, type: "flat"|"percent", amount }. Starts in draft; use proposals_send to dispatch.',
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional(),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        dealId: z.number().optional(),
        sections: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().optional().describe('ISO date'),
        accentColor: z.string().optional(),
        logoUrl: z.string().optional(),
        coverImageUrl: z.string().optional(),
        footerText: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'create',
        entityId: null,
        summary: `Create proposal "${args.title}"${args.dealId ? ` (deal #${args.dealId})` : ''}`,
        payload: args,
        apply: async () => {
          const [row] = await db.insert(crmProposals).values({
            clientId,
            title: args.title.trim(),
            summary: args.summary ?? null,
            contactId: args.contactId ?? null,
            companyId: args.companyId ?? null,
            dealId: args.dealId ?? null,
            sections: (args.sections ?? []) as ProposalSection[],
            lineItems: (args.lineItems ?? []) as ProposalLineItem[],
            fees: (args.fees ?? []) as ProposalFee[],
            currency: args.currency ?? 'USD',
            validUntil: args.validUntil ? new Date(args.validUntil) : null,
            clientToken: crypto.randomBytes(32).toString('hex'),
            accentColor: args.accentColor ?? '#2563eb',
            logoUrl: args.logoUrl ?? null,
            coverImageUrl: args.coverImageUrl ?? null,
            footerText: args.footerText ?? null,
            createdBy: ctx.userId,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_update',
    {
      title: 'Update CRM proposal',
      description: 'Update any field on a proposal. Use proposals_send to transition to sent; use status="declined"/"accepted" to record the outcome.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        summary: z.string().nullable().optional(),
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']).optional(),
        contactId: z.number().nullable().optional(),
        companyId: z.number().nullable().optional(),
        dealId: z.number().nullable().optional(),
        sections: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().nullable().optional(),
        declineReason: z.string().nullable().optional(),
        accentColor: z.string().optional(),
        logoUrl: z.string().nullable().optional(),
        coverImageUrl: z.string().nullable().optional(),
        footerText: z.string().nullable().optional(),
      },
    },
    async ({ id, validUntil, sections, lineItems, fees, status, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select().from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Proposal not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'update',
        entityId: id,
        summary: `Update proposal #${id} "${existing.title}"${status ? ` → ${status}` : ''}`,
        payload: { id, validUntil, sections, lineItems, fees, status, ...rest },
        originalSnapshot: { title: existing.title, status: existing.status, summary: existing.summary },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
          if (sections !== undefined) patch.sections = sections as ProposalSection[];
          if (lineItems !== undefined) patch.lineItems = lineItems as ProposalLineItem[];
          if (fees !== undefined) patch.fees = fees as ProposalFee[];
          if (validUntil !== undefined) patch.validUntil = validUntil ? new Date(validUntil) : null;
          if (status !== undefined) {
            patch.status = status;
            if (status === 'accepted' && existing.status !== 'accepted') patch.acceptedAt = new Date();
            if (status === 'declined' && existing.status !== 'declined') patch.declinedAt = new Date();
          }
          const [row] = await db.update(crmProposals).set(patch)
            .where(eq(crmProposals.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_send',
    {
      title: 'Mark proposal as sent',
      description:
        'Transition a proposal from draft to sent. Stamps sentAt. NOTE: this updates portal state only — it does NOT email the proposal. Use the portal UI for email delivery or fetch the proposal URL via get and share it manually.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmProposals.id, title: crmProposals.title, status: crmProposals.status })
        .from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Proposal not found' });
      if (existing.status !== 'draft') return json({ error: `Cannot send — current status is ${existing.status}` });
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'send',
        entityId: id,
        summary: `Send proposal #${id} "${existing.title}"`,
        payload: { id },
        originalSnapshot: { status: existing.status },
        apply: async () => {
          const [row] = await db.update(crmProposals)
            .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
            .where(eq(crmProposals.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // ── CRM CONTRACTS ──────────────────────────────────────────────────────
  // Keywords: contract, agreement, MSA, e-signature, signature, sign.
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'contracts_list',
    {
      title: 'List CRM contracts',
      description: 'List contracts / agreements for the client. Filter by status or linked proposal.',
      inputSchema: {
        status: z.enum(['draft', 'sent', 'partially_signed', 'fully_executed', 'voided', 'expired']).optional(),
        proposalId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, proposalId, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmContracts.clientId, clientId)];
      if (status) conds.push(eq(crmContracts.status, status));
      if (proposalId) conds.push(eq(crmContracts.proposalId, proposalId));
      const rows = await db.select({
        id: crmContracts.id,
        title: crmContracts.title,
        status: crmContracts.status,
        proposalId: crmContracts.proposalId,
        dealId: crmContracts.dealId,
        sentAt: crmContracts.sentAt,
        fullyExecutedAt: crmContracts.fullyExecutedAt,
        voidedAt: crmContracts.voidedAt,
        validUntil: crmContracts.validUntil,
        createdAt: crmContracts.createdAt,
        updatedAt: crmContracts.updatedAt,
      }).from(crmContracts).where(and(...conds))
        .orderBy(desc(crmContracts.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'contracts_get',
    {
      title: 'Get CRM contract with signers',
      description: 'Fetch contract + all signer records (name, email, status, signedAt).',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [contract] = await db.select().from(crmContracts)
        .where(and(eq(crmContracts.id, id), eq(crmContracts.clientId, clientId))).limit(1);
      if (!contract) return json({ error: 'Contract not found' });
      const signers = await db.select().from(crmContractSigners)
        .where(eq(crmContractSigners.contractId, id))
        .orderBy(crmContractSigners.order);
      return json({ contract, signers });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'contracts_create',
    {
      title: 'Create CRM contract',
      description:
        'Create a contract / agreement. Clauses = { id, title, content, required }. Signers = { name, email, role?, order? } — each gets a unique signing token. Starts in draft.',
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional(),
        proposalId: z.number().optional(),
        dealId: z.number().optional(),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        clauses: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().optional(),
        signers: z.array(z.object({
          name: z.string().min(1),
          email: z.string().email(),
          role: z.enum(['signer', 'witness', 'approver']).optional(),
          order: z.number().optional(),
        })).optional(),
        accentColor: z.string().optional(),
        logoUrl: z.string().optional(),
        footerText: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [contract] = await db.insert(crmContracts).values({
        clientId,
        proposalId: args.proposalId ?? null,
        dealId: args.dealId ?? null,
        contactId: args.contactId ?? null,
        companyId: args.companyId ?? null,
        title: args.title.trim(),
        summary: args.summary ?? null,
        clauses: (args.clauses ?? []) as ContractClause[],
        lineItems: (args.lineItems ?? []) as ProposalLineItem[],
        fees: (args.fees ?? []) as ProposalFee[],
        currency: args.currency ?? 'USD',
        validUntil: args.validUntil ? new Date(args.validUntil) : null,
        clientToken: crypto.randomBytes(32).toString('hex'),
        accentColor: args.accentColor ?? '#2563eb',
        logoUrl: args.logoUrl ?? null,
        footerText: args.footerText ?? null,
        createdBy: ctx.userId,
      }).returning();
      const insertedSigners = args.signers && args.signers.length > 0
        ? await db.insert(crmContractSigners).values(args.signers.map((s, i) => ({
            contractId: contract.id,
            name: s.name.trim(),
            email: s.email.trim().toLowerCase(),
            role: s.role ?? 'signer',
            order: s.order ?? i,
            token: crypto.randomBytes(32).toString('hex'),
          }))).returning()
        : [];
      revalidateForWrite('portal');
      return json({ contract, signers: insertedSigners });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'contracts_void',
    {
      title: 'Void contract',
      description: 'Mark a contract as voided (not executable). Stamps voidedAt + reason. Cannot be undone via MCP.',
      inputSchema: {
        id: z.number(),
        reason: z.string().optional(),
      },
    },
    async ({ id, reason }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmContracts.id, status: crmContracts.status })
        .from(crmContracts)
        .where(and(eq(crmContracts.id, id), eq(crmContracts.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Contract not found' });
      if (existing.status === 'voided') return json({ error: 'Already voided' });
      if (existing.status === 'fully_executed') return json({ error: 'Cannot void — already fully executed' });
      const [row] = await db.update(crmContracts)
        .set({ status: 'voided', voidedAt: new Date(), voidReason: reason ?? null, updatedAt: new Date() })
        .where(eq(crmContracts.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── INVOICES / BILLING ─────────────────────────────────────────────────
  hasScope(ctx.scopes, 'billing:read') && server.registerTool(
    'invoices_list',
    {
      title: 'List invoices',
      description: 'List invoices issued to this client. Useful for "what\'s outstanding" / "who owes me what" queries.',
      inputSchema: {
        status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, limit = 50 }) => {
      if (!requireScope(ctx, 'billing:read')) return denied('billing:read');
      const conds = [eq(invoices.clientId, clientId)];
      if (status) conds.push(eq(invoices.status, status));
      const rows = await db.select().from(invoices)
        .where(and(...conds))
        .orderBy(desc(invoices.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'billing:read') && server.registerTool(
    'invoices_get',
    {
      title: 'Get invoice with line items',
      description: 'Fetch an invoice + its line items.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'billing:read')) return denied('billing:read');
      const [invoice] = await db.select().from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.clientId, clientId))).limit(1);
      if (!invoice) return json({ error: 'Invoice not found' });
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      return json({ invoice, items });
    }
  );

  // ── SERVICE REQUESTS / SUGGESTED PROJECTS ──────────────────────────────
  hasScope(ctx.scopes, 'services:read') && server.registerTool(
    'service_requests_list',
    {
      title: 'List service requests',
      description: 'List service requests submitted by this client (asking the agency to spin up a new service).',
      inputSchema: {
        status: z.enum(['pending', 'reviewed', 'approved', 'rejected']).optional(),
      },
    },
    async ({ status }) => {
      if (!requireScope(ctx, 'services:read')) return denied('services:read');
      const conds = [eq(serviceRequests.clientId, clientId)];
      if (status) conds.push(eq(serviceRequests.status, status));
      const rows = await db.select({
        id: serviceRequests.id,
        serviceId: serviceRequests.serviceId,
        status: serviceRequests.status,
        message: serviceRequests.message,
        answers: serviceRequests.answers,
        createdAt: serviceRequests.createdAt,
      }).from(serviceRequests).where(and(...conds))
        .orderBy(desc(serviceRequests.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'services:write') && server.registerTool(
    'service_requests_create',
    {
      title: 'Request a service',
      description:
        'Submit a new service request on behalf of this client. The agency will review. Look up service ids via service_catalog_list.',
      inputSchema: {
        serviceId: z.number(),
        message: z.string().optional(),
        answers: z.record(z.string(), z.any()).optional().describe('Answers to the service\'s survey fields.'),
      },
    },
    async ({ serviceId, message, answers }) => {
      if (!requireScope(ctx, 'services:write')) return denied('services:write');
      const [svc] = await db.select({ id: services.id }).from(services)
        .where(and(eq(services.id, serviceId), eq(services.active, true))).limit(1);
      if (!svc) return json({ error: 'Service not found or inactive' });
      const [row] = await db.insert(serviceRequests).values({
        clientId,
        serviceId,
        status: 'pending',
        message: message ?? null,
        answers: answers ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'services:read') && server.registerTool(
    'service_catalog_list',
    {
      title: 'List available services',
      description:
        'List services the agency offers (catalog). Useful before calling service_requests_create — tells agents which serviceId values are valid.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'services:read')) return denied('services:read');
      const rows = await db.select({
        id: services.id,
        name: services.name,
        slug: services.slug,
        description: services.description,
        category: services.category,
        price: services.price,
        billingCycle: services.billingCycle,
        active: services.active,
      }).from(services).where(eq(services.active, true))
        .orderBy(services.name);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'services:read') && server.registerTool(
    'suggested_projects_list',
    {
      title: 'List suggested projects',
      description: 'List suggested project templates the agency offers (e.g. "Build me a mobile app", "Add a blog").',
      inputSchema: {
        category: z.string().optional(),
      },
    },
    async ({ category }) => {
      if (!requireScope(ctx, 'services:read')) return denied('services:read');
      const conds = [eq(suggestedProjects.active, true)];
      if (category) conds.push(eq(suggestedProjects.category, category));
      const rows = await db.select({
        id: suggestedProjects.id,
        title: suggestedProjects.title,
        description: suggestedProjects.description,
        category: suggestedProjects.category,
        estimatedPrice: suggestedProjects.estimatedPrice,
        estimatedTimeline: suggestedProjects.estimatedTimeline,
        features: suggestedProjects.features,
        icon: suggestedProjects.icon,
      }).from(suggestedProjects)
        .where(and(...conds))
        .orderBy(suggestedProjects.order);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'services:write') && server.registerTool(
    'suggested_project_requests_create',
    {
      title: 'Request a suggested project',
      description: 'Request one of the agency\'s suggested project templates. Agency reviews and may convert to a real project.',
      inputSchema: {
        suggestedProjectId: z.number(),
        message: z.string().optional(),
        answers: z.record(z.string(), z.any()).optional(),
      },
    },
    async ({ suggestedProjectId, message, answers }) => {
      if (!requireScope(ctx, 'services:write')) return denied('services:write');
      const [sp] = await db.select({ id: suggestedProjects.id }).from(suggestedProjects)
        .where(and(eq(suggestedProjects.id, suggestedProjectId), eq(suggestedProjects.active, true))).limit(1);
      if (!sp) return json({ error: 'Suggested project not found or inactive' });
      const [row] = await db.insert(suggestedProjectRequests).values({
        clientId,
        suggestedProjectId,
        status: 'pending',
        message: message ?? null,
        answers: answers ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── AI CONVERSATIONS ───────────────────────────────────────────────────
  hasScope(ctx.scopes, 'ai:read') && server.registerTool(
    'ai_conversations_list',
    {
      title: 'List AI conversations',
      description: 'List AI chat conversations for this client (in-app portal AI assistant history).',
      inputSchema: {
        flagged: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ flagged, limit = 50 }) => {
      if (!requireScope(ctx, 'ai:read')) return denied('ai:read');
      const conds = [eq(aiConversations.clientId, clientId)];
      if (flagged !== undefined) conds.push(eq(aiConversations.flagged, flagged));
      const rows = await db.select().from(aiConversations)
        .where(and(...conds))
        .orderBy(desc(aiConversations.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'ai:read') && server.registerTool(
    'ai_conversations_get',
    {
      title: 'Get AI conversation with messages',
      description: 'Fetch a conversation + full message history. Useful for auditing what the in-app AI assistant has been doing.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'ai:read')) return denied('ai:read');
      const [conv] = await db.select().from(aiConversations)
        .where(and(eq(aiConversations.id, id), eq(aiConversations.clientId, clientId))).limit(1);
      if (!conv) return json({ error: 'Conversation not found' });
      const messages = await db.select().from(aiMessages)
        .where(eq(aiMessages.conversationId, id))
        .orderBy(aiMessages.createdAt);
      return json({ conversation: conv, messages });
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

  // ── SITE NAVIGATION ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'nav_list',
    {
      title: 'List website navigation items',
      description: 'List nav items for a website, sorted by sortOrder. Hierarchical via parentId.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const rows = await db.select().from(siteNavigation)
        .where(eq(siteNavigation.websiteId, websiteId))
        .orderBy(siteNavigation.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_create',
    {
      title: 'Create navigation item',
      description: 'Add a nav item to a website. Use parentId for nested items.',
      inputSchema: {
        websiteId: z.number(),
        label: z.string().min(1),
        href: z.string().min(1),
        parentId: z.number().optional(),
        sortOrder: z.number().optional(),
        openInNewTab: z.boolean().optional(),
        isButton: z.boolean().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, args.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const existing = await db.select({ id: siteNavigation.id }).from(siteNavigation)
        .where(eq(siteNavigation.websiteId, args.websiteId));
      const [row] = await db.insert(siteNavigation).values({
        websiteId: args.websiteId,
        label: args.label,
        href: args.href,
        parentId: args.parentId ?? null,
        sortOrder: args.sortOrder ?? existing.length,
        openInNewTab: args.openInNewTab ?? false,
        isButton: args.isButton ?? false,
        description: args.description ?? null,
        icon: args.icon ?? null,
      }).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_delete',
    {
      title: 'Delete navigation item',
      description: 'Delete a nav item. Child items (parentId) are not auto-deleted.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [nav] = await db
        .select({ id: siteNavigation.id, websiteId: siteNavigation.websiteId })
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) return json({ error: 'Nav item not found' });
      await db.delete(siteNavigation).where(eq(siteNavigation.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );

  // ── POST REVISIONS ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_list_revisions',
    {
      title: 'List post revisions',
      description: 'Revision history for a post (autosaves, manual saves, publishes).',
      inputSchema: {
        postId: z.number(),
        limit: z.number().min(1).max(100).default(25).optional(),
      },
    },
    async ({ postId, limit = 25 }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts)
        .where(eq(posts.id, postId)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      const rows = await db.select().from(postRevisions)
        .where(eq(postRevisions.postId, postId))
        .orderBy(desc(postRevisions.createdAt)).limit(limit);
      return json(rows);
    }
  );

  // ── BLOCK TEMPLATES ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'block_templates_list',
    {
      title: 'List block templates',
      description: 'List reusable CMS block templates. Global templates are shared across clients.',
      inputSchema: {
        category: z.enum(['custom', 'section', 'global']).optional(),
        scope: z.enum(['block', 'section', 'global']).optional(),
      },
    },
    async ({ category, scope }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const conds = [] as ReturnType<typeof eq>[];
      if (category) conds.push(eq(blockTemplates.category, category));
      if (scope) conds.push(eq(blockTemplates.scope, scope));
      const rows = await db.select({
        id: blockTemplates.id,
        name: blockTemplates.name,
        slug: blockTemplates.slug,
        description: blockTemplates.description,
        category: blockTemplates.category,
        scope: blockTemplates.scope,
        thumbnail: blockTemplates.thumbnail,
        tags: blockTemplates.tags,
        version: blockTemplates.version,
        updatedAt: blockTemplates.updatedAt,
      }).from(blockTemplates)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(blockTemplates.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'block_templates_get',
    {
      title: 'Get block template with blocks',
      description: 'Fetch full template including its blocks JSON.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [row] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!row) return json({ error: 'Template not found' });
      return json(row);
    }
  );

  // ── EMAIL TEMPLATES ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_templates_list',
    {
      title: 'List email templates',
      description: 'List reusable email templates available to this client (plus global agency templates).',
      inputSchema: {
        category: z.enum(['welcome', 'newsletter', 'promotion', 'transactional', 'custom']).optional(),
      },
    },
    async ({ category }) => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const conds = [or(eq(emailTemplates.clientId, clientId), eq(emailTemplates.isGlobal, true))!];
      if (category) conds.push(eq(emailTemplates.category, category));
      const rows = await db.select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        description: emailTemplates.description,
        category: emailTemplates.category,
        subject: emailTemplates.subject,
        thumbnailUrl: emailTemplates.thumbnailUrl,
        isGlobal: emailTemplates.isGlobal,
        usageCount: emailTemplates.usageCount,
        updatedAt: emailTemplates.updatedAt,
      }).from(emailTemplates).where(and(...conds))
        .orderBy(desc(emailTemplates.usageCount));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_templates_create',
    {
      title: 'Create email template',
      description: 'Save a reusable email template. Provide htmlContent OR blocks (rendered to HTML).',
      inputSchema: {
        name: z.string().min(1),
        category: z.enum(['welcome', 'newsletter', 'promotion', 'transactional', 'custom']).optional(),
        subject: z.string().optional(),
        description: z.string().optional(),
        htmlContent: z.string().optional(),
        blocks: z.array(z.any()).optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      let finalHtml = args.htmlContent?.trim() ?? '';
      let blockContent: { blocks: unknown[] } | null = null;
      if (Array.isArray(args.blocks) && args.blocks.length > 0) {
        blockContent = { blocks: args.blocks };
        finalHtml = renderBlocksToEmailHtml(args.blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
      }
      if (!finalHtml) return json({ error: 'Provide htmlContent or non-empty blocks' });
      const [row] = await db.insert(emailTemplates).values({
        clientId,
        name: args.name.trim(),
        category: args.category ?? 'custom',
        subject: args.subject ?? null,
        description: args.description ?? null,
        htmlContent: finalHtml,
        blockContent,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── EMAIL SEGMENTS ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_segments_list',
    {
      title: 'List email segments',
      description: 'List segmented audience definitions (rule-based subscriber filters).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const rows = await db.select().from(emailSegments)
        .where(eq(emailSegments.clientId, clientId))
        .orderBy(desc(emailSegments.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_segments_create',
    {
      title: 'Create email segment',
      description:
        'Define a subscriber segment by rules. Each rule: { field, operator, value }. matchType="all" (AND) or "any" (OR).',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        matchType: z.enum(['all', 'any']).optional(),
        rules: z.array(z.object({
          field: z.string(),
          operator: z.string(),
          value: z.string(),
        })),
      },
    },
    async ({ name, description, matchType, rules }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [row] = await db.insert(emailSegments).values({
        clientId,
        name: name.trim(),
        description: description ?? null,
        matchType: matchType ?? 'all',
        rules,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── EMAIL CAMPAIGN SCHEDULE ────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_schedule',
    {
      title: 'Schedule email campaign',
      description:
        'Mark a draft campaign as scheduled for a future send. Sets status=scheduled and scheduledAt. Pass unschedule:true to revert to draft. Does NOT dispatch — a scheduler or manual send is still required.',
      inputSchema: {
        id: z.number(),
        scheduledAt: z.string().optional().describe('ISO datetime of intended send.'),
        unschedule: z.boolean().optional(),
      },
    },
    async ({ id, scheduledAt, unschedule }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [existing] = await db.select({ id: emailCampaigns.id, status: emailCampaigns.status })
        .from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Campaign not found' });
      if (unschedule) {
        if (existing.status !== 'scheduled') return json({ error: `Cannot unschedule — current status is ${existing.status}` });
        const [row] = await db.update(emailCampaigns)
          .set({ status: 'draft', scheduledAt: null, updatedAt: new Date() })
          .where(eq(emailCampaigns.id, id)).returning();
        return json(row);
      }
      if (!scheduledAt) return json({ error: 'scheduledAt required unless unschedule=true' });
      if (existing.status !== 'draft' && existing.status !== 'scheduled') {
        return json({ error: `Cannot schedule — current status is ${existing.status}` });
      }
      const when = new Date(scheduledAt);
      if (when.getTime() <= Date.now()) return json({ error: 'scheduledAt must be in the future' });
      const [row] = await db.update(emailCampaigns)
        .set({ status: 'scheduled', scheduledAt: when, updatedAt: new Date() })
        .where(eq(emailCampaigns.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_update',
    {
      title: 'Update draft email campaign',
      description:
        'Update metadata or content of a draft campaign. Refuses to edit campaigns in sending/sent/scheduled state (use unschedule first).',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        subject: z.string().min(1).optional(),
        previewText: z.string().nullable().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
        replyTo: z.string().email().nullable().optional(),
        listId: z.number().optional(),
        htmlContent: z.string().optional(),
        blocks: z.array(z.any()).optional().describe('Re-renders HTML if provided.'),
      },
    },
    async ({ id, blocks, ...rest }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [existing] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Campaign not found' });
      if (existing.status !== 'draft') return json({ error: `Cannot edit — status is ${existing.status}` });
      if (rest.listId !== undefined && rest.listId !== existing.listId) {
        const [list] = await db.select({ id: emailLists.id }).from(emailLists)
          .where(and(eq(emailLists.id, rest.listId), eq(emailLists.clientId, clientId))).limit(1);
        if (!list) return json({ error: 'Target list not found' });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'update',
        entityId: id,
        summary: `Update draft campaign #${id} "${existing.name}"`,
        payload: { id, blocks, ...rest },
        originalSnapshot: { name: existing.name, subject: existing.subject, listId: existing.listId },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
          if (Array.isArray(blocks) && blocks.length > 0) {
            patch.blockContent = { blocks };
            patch.htmlContent = renderBlocksToEmailHtml(blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
          }
          const [row] = await db.update(emailCampaigns).set(patch)
            .where(eq(emailCampaigns.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_delete',
    {
      title: 'Delete email campaign',
      description: 'Permanently delete a campaign. Refuses if the campaign has already sent.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      const [existing] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Campaign not found' });
      if (existing.status === 'sent' || existing.status === 'sending') {
        return json({ error: `Cannot delete a campaign in status ${existing.status}` });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'delete',
        entityId: id,
        summary: `Delete campaign #${id} "${existing.name}"`,
        payload: { id },
        originalSnapshot: { name: existing.name, subject: existing.subject, status: existing.status },
        apply: async () => {
          await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
          return { success: true, id };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // ── GIFT CERTIFICATES ──────────────────────────────────────────────────
  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'gift_certificates_list',
    {
      title: 'List gift certificates',
      description: 'List gift certificates for the client, optionally filtered by website or status.',
      inputSchema: {
        websiteId: z.number().optional(),
        status: z.enum(['pending_payment', 'active', 'fully_redeemed', 'expired', 'cancelled']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ websiteId, status, limit = 50 }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const conds = [eq(giftCertificates.clientId, clientId)];
      if (websiteId) conds.push(eq(giftCertificates.websiteId, websiteId));
      if (status) conds.push(eq(giftCertificates.status, status));
      const rows = await db.select().from(giftCertificates)
        .where(and(...conds))
        .orderBy(desc(giftCertificates.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'gift_certificates_issue',
    {
      title: 'Issue gift certificate',
      description:
        'Manually issue a gift certificate (bypasses Stripe payment). Starts as `active` and ready to redeem. Use cautiously.',
      inputSchema: {
        amount: z.number().int().min(1).describe('Amount in cents.'),
        purchaserName: z.string().min(1),
        purchaserEmail: z.string().email(),
        recipientName: z.string().optional(),
        recipientEmail: z.string().email().optional(),
        personalMessage: z.string().optional(),
        websiteId: z.number().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      const [row] = await db.insert(giftCertificates).values({
        clientId,
        websiteId: args.websiteId ?? null,
        code,
        initialAmount: args.amount,
        remainingAmount: args.amount,
        status: 'active',
        purchaserName: args.purchaserName.trim(),
        purchaserEmail: args.purchaserEmail.trim().toLowerCase(),
        recipientName: args.recipientName ?? null,
        recipientEmail: args.recipientEmail?.trim().toLowerCase() ?? null,
        personalMessage: args.personalMessage ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // ── CRM CUSTOM FIELDS / SAVED VIEWS / SCORING ──────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_custom_fields_list',
    {
      title: 'List CRM custom fields',
      description: 'List custom field definitions attached to contact/company/deal entities.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']).optional(),
      },
    },
    async ({ entityType }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmCustomFields.clientId, clientId)];
      if (entityType) conds.push(eq(crmCustomFields.entityType, entityType));
      const rows = await db.select().from(crmCustomFields)
        .where(and(...conds))
        .orderBy(crmCustomFields.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_create',
    {
      title: 'Create CRM custom field',
      description: 'Define a custom field on contact/company/deal. For select/multiselect types, provide options[].',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        fieldName: z.string().min(1),
        fieldType: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'url', 'email', 'phone', 'boolean']),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        filterable: z.boolean().optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ entityType, fieldName, fieldType, options, required, filterable, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmCustomFields).values({
        clientId,
        entityType,
        fieldName: fieldName.trim(),
        fieldType,
        options: options ?? null,
        required: required ?? false,
        filterable: filterable ?? false,
        sortOrder: sortOrder ?? 0,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_update',
    {
      title: 'Update CRM custom field',
      description: 'Rename, toggle required, reorder, or update options on an existing custom field definition.',
      inputSchema: {
        id: z.number().int().positive(),
        fieldName: z.string().min(1).optional(),
        options: z.array(z.string()).nullable().optional(),
        required: z.boolean().optional(),
        filterable: z.boolean().optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ id, fieldName, options, required, filterable, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmCustomFields.id }).from(crmCustomFields)
        .where(and(eq(crmCustomFields.id, id), eq(crmCustomFields.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Custom field not found' });
      const patch: Record<string, unknown> = {};
      if (fieldName !== undefined) patch.fieldName = fieldName.trim();
      if (options !== undefined) patch.options = options;
      if (required !== undefined) patch.required = required;
      if (filterable !== undefined) patch.filterable = filterable;
      if (sortOrder !== undefined) patch.sortOrder = sortOrder;
      if (Object.keys(patch).length === 0) return json({ error: 'No fields to update' });
      const [row] = await db.update(crmCustomFields).set(patch)
        .where(eq(crmCustomFields.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_delete',
    {
      title: 'Delete CRM custom field',
      description: 'Remove a custom field definition. All stored values for this field are cascaded.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.delete(crmCustomFields)
        .where(and(eq(crmCustomFields.id, id), eq(crmCustomFields.clientId, clientId)))
        .returning();
      if (!row) return json({ error: 'Custom field not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_custom_field_values_get',
    {
      title: 'Read CRM custom field values',
      description: 'Fetch custom field values (joined with their definitions) for a given contact, company, or deal.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        entityId: z.number().int().positive(),
      },
    },
    async ({ entityType, entityId }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      let entityOk = false;
      if (entityType === 'contact') {
        const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
          .where(and(eq(crmContacts.id, entityId), eq(crmContacts.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else if (entityType === 'company') {
        const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
          .where(and(eq(crmCompanies.id, entityId), eq(crmCompanies.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else {
        const [row] = await db.select({ id: crmDeals.id }).from(crmDeals)
          .where(and(eq(crmDeals.id, entityId), eq(crmDeals.clientId, clientId))).limit(1);
        entityOk = !!row;
      }
      if (!entityOk) return json({ error: 'Entity not found' });
      const rows = await db.select({
        id: crmCustomFieldValues.id,
        customFieldId: crmCustomFieldValues.customFieldId,
        entityId: crmCustomFieldValues.entityId,
        entityType: crmCustomFieldValues.entityType,
        value: crmCustomFieldValues.value,
        fieldName: crmCustomFields.fieldName,
        fieldType: crmCustomFields.fieldType,
        options: crmCustomFields.options,
        required: crmCustomFields.required,
      })
        .from(crmCustomFieldValues)
        .innerJoin(crmCustomFields, eq(crmCustomFieldValues.customFieldId, crmCustomFields.id))
        .where(and(
          eq(crmCustomFieldValues.entityType, entityType),
          eq(crmCustomFieldValues.entityId, entityId),
          eq(crmCustomFields.clientId, clientId),
        ));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_field_values_set',
    {
      title: 'Upsert CRM custom field values',
      description: 'Set (insert or update) custom field values on a contact/company/deal. Pass values as { [fieldId]: stringValue }. Pass empty string or null to clear.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        entityId: z.number().int().positive(),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      },
    },
    async ({ entityType, entityId, values }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      let entityOk = false;
      if (entityType === 'contact') {
        const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
          .where(and(eq(crmContacts.id, entityId), eq(crmContacts.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else if (entityType === 'company') {
        const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
          .where(and(eq(crmCompanies.id, entityId), eq(crmCompanies.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else {
        const [row] = await db.select({ id: crmDeals.id }).from(crmDeals)
          .where(and(eq(crmDeals.id, entityId), eq(crmDeals.clientId, clientId))).limit(1);
        entityOk = !!row;
      }
      if (!entityOk) return json({ error: 'Entity not found' });

      const fieldIds = Object.keys(values).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
      if (fieldIds.length === 0) return json([]);

      const validFields = await db.select({ id: crmCustomFields.id }).from(crmCustomFields)
        .where(and(eq(crmCustomFields.clientId, clientId), inArray(crmCustomFields.id, fieldIds)));
      const validFieldIds = new Set(validFields.map(f => f.id));

      const results = [];
      for (const [fieldIdStr, raw] of Object.entries(values)) {
        const fieldId = parseInt(fieldIdStr, 10);
        if (!validFieldIds.has(fieldId)) continue;
        const stringValue = raw === null || raw === undefined ? null : String(raw);
        const [row] = await db.insert(crmCustomFieldValues).values({
          customFieldId: fieldId,
          entityId,
          entityType,
          value: stringValue,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [crmCustomFieldValues.customFieldId, crmCustomFieldValues.entityId, crmCustomFieldValues.entityType],
          set: { value: stringValue, updatedAt: new Date() },
        }).returning();
        results.push(row);
      }
      revalidateForWrite('portal');
      return json(results);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_saved_views_list',
    {
      title: 'List CRM saved views',
      description: 'List saved filter/view configurations for contacts, companies, or deals.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']).optional(),
      },
    },
    async ({ entityType }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmSavedViews.clientId, clientId)];
      if (entityType) conds.push(eq(crmSavedViews.entityType, entityType));
      const rows = await db.select().from(crmSavedViews)
        .where(and(...conds))
        .orderBy(crmSavedViews.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_scoring_rules_list',
    {
      title: 'List CRM scoring rules',
      description: 'List lead-scoring rules (events that award points to contacts/deals).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const rows = await db.select().from(crmScoringRules)
        .where(eq(crmScoringRules.clientId, clientId))
        .orderBy(desc(crmScoringRules.points));
      return json(rows);
    }
  );

  // ── WEBSITE DOMAINS / ENV VARS ─────────────────────────────────────────
  async function requireClientSite(websiteId: number) {
    const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    return site ?? null;
  }

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'website_domains_list',
    {
      title: 'List website custom domains',
      description: 'List custom domains attached to a website.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const rows = await db.select().from(websiteDomains)
        .where(eq(websiteDomains.websiteId, websiteId));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_domains_add',
    {
      title: 'Attach domain to website',
      description:
        'Add a custom domain to a website (starts pending until DNS verification). This does NOT provision DNS records — user must configure them externally.',
      inputSchema: {
        websiteId: z.number(),
        domain: z.string().min(3),
        isPrimary: z.boolean().optional(),
      },
    },
    async ({ websiteId, domain, isPrimary }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      if (isPrimary) {
        await db.update(websiteDomains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(websiteDomains.websiteId, websiteId), eq(websiteDomains.isPrimary, true)));
      }
      const [row] = await db.insert(websiteDomains).values({
        websiteId,
        domain: domain.trim().toLowerCase(),
        isPrimary: isPrimary ?? false,
      }).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_domains_remove',
    {
      title: 'Detach domain from website',
      description: 'Remove a custom domain attachment. Does not affect external DNS.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [domain] = await db
        .select({ id: websiteDomains.id, websiteId: websiteDomains.websiteId })
        .from(websiteDomains)
        .innerJoin(clientWebsites, eq(clientWebsites.id, websiteDomains.websiteId))
        .where(and(eq(websiteDomains.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!domain) return json({ error: 'Domain not found' });
      await db.delete(websiteDomains).where(eq(websiteDomains.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'website_env_vars_list',
    {
      title: 'List website environment variables',
      description:
        'List env vars for a website environment (defaults to production). Values ARE included — treat output as secrets.',
      inputSchema: {
        websiteId: z.number(),
        environment: z.string().optional().default('production'),
      },
    },
    async ({ websiteId, environment = 'production' }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const [env] = await db.select({ id: websiteEnvironments.id }).from(websiteEnvironments)
        .where(and(eq(websiteEnvironments.websiteId, websiteId), eq(websiteEnvironments.name, environment))).limit(1);
      if (!env) return json({ error: `Environment "${environment}" not found` });
      const rows = await db.select().from(websiteEnvVars)
        .where(eq(websiteEnvVars.environmentId, env.id))
        .orderBy(websiteEnvVars.key);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_env_vars_set',
    {
      title: 'Set website environment variable',
      description:
        'Upsert an env var on a website environment (production/staging). Marks syncedToVercel=false — actual Vercel sync happens via portal UI.',
      inputSchema: {
        websiteId: z.number(),
        environment: z.string().optional().default('production'),
        key: z.string().min(1),
        value: z.string(),
      },
    },
    async ({ websiteId, environment = 'production', key, value }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const [env] = await db.select({ id: websiteEnvironments.id }).from(websiteEnvironments)
        .where(and(eq(websiteEnvironments.websiteId, websiteId), eq(websiteEnvironments.name, environment))).limit(1);
      if (!env) return json({ error: `Environment "${environment}" not found` });
      const [existing] = await db.select({ id: websiteEnvVars.id }).from(websiteEnvVars)
        .where(and(eq(websiteEnvVars.environmentId, env.id), eq(websiteEnvVars.key, key))).limit(1);
      if (existing) {
        const [row] = await db.update(websiteEnvVars)
          .set({ value, syncedToVercel: false })
          .where(eq(websiteEnvVars.id, existing.id)).returning();
        return json(row);
      }
      const [row] = await db.insert(websiteEnvVars).values({
        environmentId: env.id,
        key,
        value,
        syncedToVercel: false,
      }).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_env_vars_delete',
    {
      title: 'Delete website environment variable',
      description: 'Remove an env var by id.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      const [envVar] = await db
        .select({ id: websiteEnvVars.id, websiteId: websiteEnvironments.websiteId })
        .from(websiteEnvVars)
        .innerJoin(websiteEnvironments, eq(websiteEnvironments.id, websiteEnvVars.environmentId))
        .innerJoin(clientWebsites, eq(clientWebsites.id, websiteEnvironments.websiteId))
        .where(and(eq(websiteEnvVars.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!envVar) return json({ error: 'Env var not found' });
      await db.delete(websiteEnvVars).where(eq(websiteEnvVars.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );

  // ── CLIENT SELF-SERVICE ────────────────────────────────────────────────
  hasScope(ctx.scopes, 'team:read') && server.registerTool(
    'client_get',
    {
      title: 'Get authenticated client record',
      description: 'Return the full client row (company, phone, website, address, email prefix, notes).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'team:read')) return denied('team:read');
      const [row] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      return json(row ?? { error: 'Client not found' });
    }
  );

  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'client_update',
    {
      title: 'Update client profile',
      description:
        'Update the authenticated client\'s profile (company name, phone, public website URL, address, notes). Cannot change email or stripe customer id via MCP.',
      inputSchema: {
        company: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(args)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(clients).set(patch)
        .where(eq(clients.id, clientId)).returning();
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
      let resp: Response;
      try {
        resp = await fetch(url);
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

  // ── AI CREDITS ─────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'billing:read') && server.registerTool(
    'ai_credits_balance',
    {
      title: 'Get AI credits balance',
      description: 'Return current AI token balance, monthly grant, and pay-as-you-go status.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'billing:read')) return denied('billing:read');
      const [row] = await db.select().from(aiCreditBalances)
        .where(eq(aiCreditBalances.clientId, clientId)).limit(1);
      return json(row ?? { clientId, balance: 0, monthlyGrant: 0, payAsYouGo: false });
    }
  );

  hasScope(ctx.scopes, 'billing:read') && server.registerTool(
    'ai_credits_ledger',
    {
      title: 'List AI credit ledger entries',
      description: 'Recent credit ledger entries (grants, usage, purchases, refunds) with running balances.',
      inputSchema: {
        limit: z.number().min(1).max(200).default(50).optional(),
        type: z.enum(['grant', 'usage', 'purchase', 'refund', 'expiry']).optional(),
      },
    },
    async ({ limit = 50, type }) => {
      if (!requireScope(ctx, 'billing:read')) return denied('billing:read');
      const conds = [eq(aiCreditLedger.clientId, clientId)];
      if (type) conds.push(eq(aiCreditLedger.type, type));
      const rows = await db.select().from(aiCreditLedger)
        .where(and(...conds))
        .orderBy(desc(aiCreditLedger.createdAt)).limit(limit);
      return json(rows);
    }
  );

  // ── AUTOMATION RULES CRUD ──────────────────────────────────────────────
  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_create',
    {
      title: 'Create automation rule',
      description:
        'Define a new automation rule. Trigger = { event: string, ...metadata }; conditions = [{ field, operator, value }]; actions = [{ tool: string, params: object }]. Rule starts enabled.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        trigger: z.record(z.string(), z.any()).describe('{ event: "email.campaign.sent", ... }'),
        conditions: z.array(z.any()).optional(),
        actions: z.array(z.any()),
        enabled: z.boolean().optional(),
        productScope: z.string().optional(),
        source: z.enum(['nlp', 'settings', 'manual']).optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [row] = await db.insert(automationRules).values({
        clientId,
        name: args.name.trim(),
        description: args.description ?? null,
        trigger: args.trigger as never,
        conditions: (args.conditions ?? []) as never,
        actions: args.actions as never,
        enabled: args.enabled ?? true,
        source: args.source ?? 'manual',
        productScope: args.productScope ?? null,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_update',
    {
      title: 'Update automation rule',
      description: 'Update name, description, trigger, conditions, actions, or productScope. Use automations_toggle for just the enabled flag.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        trigger: z.record(z.string(), z.any()).optional(),
        conditions: z.array(z.any()).optional(),
        actions: z.array(z.any()).optional(),
        productScope: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [existing] = await db.select({ id: automationRules.id }).from(automationRules)
        .where(and(eq(automationRules.id, id), eq(automationRules.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Rule not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(automationRules).set(patch)
        .where(eq(automationRules.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_delete',
    {
      title: 'Delete automation rule',
      description: 'Permanently delete an automation rule. Logs are retained.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [existing] = await db.select({ id: automationRules.id }).from(automationRules)
        .where(and(eq(automationRules.id, id), eq(automationRules.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Rule not found' });
      await db.delete(automationRules).where(eq(automationRules.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );

  // ── META ───────────────────────────────────────────────────────────────
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Return the authenticated portal user and client context.',
      inputSchema: {},
    },
    async () => {
      return json({
        userId: ctx.userId,
        client: { id: ctx.client.id, company: ctx.client.company },
        scopes: ctx.scopes,
      });
    }
  );

  // ── BRANDING ───────────────────────────────────────────────────────────
  // Registers branding_list_profiles, _get_profile, _get_messaging,
  // _audit, _check_contrast. All guarded by `branding:read` scope.
  registerBrandingToolsOnSdk(server, ctx);

  // ── STORE / COMMERCE ───────────────────────────────────────────────────
  // Registers store_products_*, store_categories_*, store_orders_*,
  // store_customers_*, store_discounts_*, store_reviews_*,
  // store_customer_messages_*, store_settings_get.
  // Scopes: `store:read` / `store:write`.
  registerStoreToolsOnSdk(server, ctx);

  // ── APPROVALS ──────────────────────────────────────────────────────────
  // approvals_list / get / approve / reject. Gated on approvals:read and
  // approvals:manage scopes. Works with CMS-write tools that call
  // stageOrApply() when the current key has require_cms_approval=true.
  registerApprovalToolsOnSdk(server, ctx);

  return server;
}
