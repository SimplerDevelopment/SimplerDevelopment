/**
 * MCP tools — hosting.
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

export function registerHostingTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── HOSTING ────────────────────────────────────────────────────────────
  // Surfaces the `hostedSites` table (Railway-backed managed app hosting).
  // Read-only — provisioning is a Stripe-driven flow that we don't expose
  // to MCP-issued credentials.
  hasScope(ctx.scopes, 'hosting:read') && server.registerTool(
    'hosting_list',
    {
      title: 'List hosted sites',
      description:
        "List Railway-hosted application sites for the authenticated client. Returns name, custom domain, Railway domain, status, plan, and renewal date.",
      inputSchema: {
        status: z.enum(['provisioning', 'active', 'suspended', 'cancelled']).optional(),
      },
    },
    async ({ status }) => {
      if (!requireScope(ctx, 'hosting:read')) return denied('hosting:read');
      const rows = await db
        .select({
          id: hostedSites.id,
          name: hostedSites.name,
          customDomain: hostedSites.customDomain,
          railwayDomain: hostedSites.railwayDomain,
          status: hostedSites.status,
          plan: hostedSites.plan,
          renewalDate: hostedSites.renewalDate,
          createdAt: hostedSites.createdAt,
        })
        .from(hostedSites)
        .where(
          status
            ? and(eq(hostedSites.clientId, clientId), eq(hostedSites.status, status))
            : eq(hostedSites.clientId, clientId)
        )
        .orderBy(hostedSites.createdAt);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'hosting:read') && server.registerTool(
    'hosting_get',
    {
      title: 'Get hosted site',
      description:
        'Get full details for a single hosted site including DNS instructions and operator notes.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'hosting:read')) return denied('hosting:read');
      const [row] = await db.select().from(hostedSites)
        .where(and(eq(hostedSites.id, id), eq(hostedSites.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Hosted site not found' });
      return json(row);
    }
  );
}
