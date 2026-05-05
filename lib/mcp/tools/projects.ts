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
} from '@/lib/db/schema';
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
