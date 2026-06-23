/**
 * MCP tools — sprints.
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

export function registerSprintsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

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
}
