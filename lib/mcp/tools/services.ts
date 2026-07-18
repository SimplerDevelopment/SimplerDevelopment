/**
 * MCP tools — services.
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

export function registerServicesTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

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
}
