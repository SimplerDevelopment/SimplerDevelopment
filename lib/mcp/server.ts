import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
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
} from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { BLOCKS_SCHEMA_REFERENCE, BLOCKS_SCHEMA_TLDR } from './blocks-schema';
import { registerBrandingToolsOnSdk } from '@/lib/branding/mcp-sdk-adapter';

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
  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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
  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  // ── SUPPORT TICKETS ────────────────────────────────────────────────────
  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  // ── CRM ────────────────────────────────────────────────────────────────
  server.registerTool(
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

  server.registerTool(
    'crm_contacts_create',
    {
      title: 'Create CRM contact',
      description: 'Create a new CRM contact.',
      inputSchema: {
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  // ── WEBSITES / POSTS ───────────────────────────────────────────────────
  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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
      revalidateForWrite('posts');
      return json(row);
    }
  );

  server.registerTool(
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
      // Verify ownership via website
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts)
        .where(eq(posts.id, id)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      }
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
      revalidateForWrite('posts');
      return json(row);
    }
  );

  // ── MEDIA ──────────────────────────────────────────────────────────────
  server.registerTool(
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

  // ── EMAIL ──────────────────────────────────────────────────────────────
  server.registerTool(
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

  server.registerTool(
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

  return server;
}
