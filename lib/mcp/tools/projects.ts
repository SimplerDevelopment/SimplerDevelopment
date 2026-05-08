/**
 * MCP tools — projects.
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
  projectMembers,
} from '@/lib/db/schema';
import { ROLE_OPTIONS, type ProjectRole } from '@/lib/portal/project-permissions';
import type { SurveyFieldDef, ProposalSection, ProposalLineItem, ProposalFee, ContractClause, PitchDeckSlideV2 } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { logCardActivity } from '@/lib/pm-activity';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
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

export function registerProjectsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

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
      // Creator becomes owner; mirrors the REST POST /projects behavior so
      // the unified permission model holds whether the project is created via
      // UI or MCP.
      if (ctx.userId) {
        await db.insert(projectMembers).values({
          projectId: row.id,
          userId: ctx.userId,
          role: 'owner',
          addedBy: ctx.userId,
        }).onConflictDoNothing();
      }
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


  // ── PROJECT MEMBERS ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'project_members_list',
    {
      title: 'List project members',
      description: "List members and their roles for a project. Roles are owner, editor, commenter, viewer. Staff users (admin/employee) have implicit owner-equivalent access on every project regardless of membership rows.",
      inputSchema: {
        projectId: z.coerce.number(),
      },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      const rows = await db
        .select({
          id: projectMembers.id,
          userId: projectMembers.userId,
          role: projectMembers.role,
          addedAt: projectMembers.addedAt,
          name: users.name,
          email: users.email,
        })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'project_members_set',
    {
      title: 'Add or update a project member',
      description: 'Add a user to a project, or change their role if already a member. Idempotent. Only owners can call this.',
      inputSchema: {
        projectId: z.coerce.number(),
        userId: z.coerce.number(),
        role: z.enum(['owner', 'editor', 'commenter', 'viewer']),
      },
    },
    async ({ projectId, userId, role }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!ROLE_OPTIONS.includes(role)) return json({ error: 'Invalid role' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      // Caller must be project owner. Staff users skip the check (implicit owner).
      if (ctx.userId) {
        const [callerMember] = await db.select({ role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, ctx.userId)))
          .limit(1);
        if (callerMember?.role !== 'owner') return json({ error: 'Only project owners can manage members' });
      }
      const [row] = await db.insert(projectMembers).values({
        projectId,
        userId,
        role: role as ProjectRole,
        addedBy: ctx.userId,
      }).onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role: role as ProjectRole, addedBy: ctx.userId },
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'project_members_remove',
    {
      title: 'Remove a project member',
      description: 'Remove a user from a project. Refuses to remove the last owner.',
      inputSchema: {
        projectId: z.coerce.number(),
        userId: z.coerce.number(),
      },
    },
    async ({ projectId, userId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      if (ctx.userId) {
        const [callerMember] = await db.select({ role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, ctx.userId)))
          .limit(1);
        if (callerMember?.role !== 'owner') return json({ error: 'Only project owners can manage members' });
      }
      const [target] = await db.select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!target) return json({ error: 'Member not found' });
      if (target.role === 'owner') {
        const owners = await db.select({ id: projectMembers.id })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
        if (owners.length <= 1) return json({ error: 'Cannot remove the sole owner; promote another member first' });
      }
      await db.delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
      revalidateForWrite('portal');
      return json({ ok: true });
    }
  );

  // ── MY TASKS ───────────────────────────────────────────────────────────
  // Convenience read for the authenticated user's own kanban work across the
  // client's projects — mirrors the /portal/my-tasks page.
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'my_tasks_list',
    {
      title: 'List my assigned tasks',
      description:
        "List kanban cards assigned to the authenticated user across the client's projects. Includes project, column, priority, and due date.",
      inputSchema: {
        openOnly: z.boolean().optional().describe('Default true — exclude cards in done columns.'),
      },
    },
    async ({ openOnly = true }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const rows = await db
        .select({
          id: kanbanCards.id,
          number: kanbanCards.number,
          title: kanbanCards.title,
          priority: kanbanCards.priority,
          dueDate: kanbanCards.dueDate,
          projectId: kanbanCards.projectId,
          projectName: projects.name,
          projectKey: projects.projectKey,
          columnId: kanbanCards.columnId,
          columnName: kanbanColumns.name,
          columnIsDone: kanbanColumns.isDone,
        })
        .from(kanbanCardAssignees)
        .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardAssignees.cardId))
        .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
        .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
        .where(and(
          eq(kanbanCardAssignees.userId, ctx.userId),
          eq(projects.clientId, clientId),
        ));
      const filtered = openOnly ? rows.filter(r => !r.columnIsDone) : rows;
      return json(filtered);
    }
  );
}
