/**
 * MCP tools — ai.
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

export function registerAiTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

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
}
