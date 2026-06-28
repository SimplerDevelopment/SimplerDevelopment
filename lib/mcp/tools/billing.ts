/**
 * MCP tools — billing.
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
  mcpToolCallDailyRollups,
} from '@/lib/db/schema';
import type { SurveyFieldDef, ProposalSection, ProposalLineItem, ProposalFee, ContractClause, PitchDeckSlideV2 } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { logCardActivity } from '@/lib/pm-activity';
import { tokensToUsd } from '@/lib/mcp/usage-stats';
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

export function registerBillingTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

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

  // ── MCP USAGE (self-serve audit — Journey-D gap) ───────────────────────
  // Returns the caller's OWN token/call spend for the past N days.
  // getSummary() in usage-stats.ts is GLOBAL (no clientId filter) — we write
  // a client-scoped query directly to satisfy the tenancy invariant.
  hasScope(ctx.scopes, 'billing:read') && server.registerTool(
    'usage_get',
    {
      title: 'Get MCP usage summary',
      description:
        'Return this client\'s own MCP tool-call and token-spend summary for the past N days (default 7, max 90). Covers totalCalls, totalErrors, errorRate, totalTokens, and estimated cost.',
      inputSchema: {
        days: z.number().min(1).max(90).default(7).optional(),
      },
    },
    async ({ days = 7 }) => {
      if (!requireScope(ctx, 'billing:read')) return denied('billing:read');

      const since = new Date();
      since.setUTCDate(since.getUTCDate() - (days - 1));
      since.setUTCHours(0, 0, 0, 0);

      // Tenant-scoped aggregate: always filter by clientId = ctx.clientId.
      const [row] = await db
        .select({
          totalCalls: sql<number>`coalesce(sum(${mcpToolCallDailyRollups.callCount}), 0)::int`,
          totalErrors: sql<number>`coalesce(sum(${mcpToolCallDailyRollups.errorCount}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${mcpToolCallDailyRollups.totalEstimatedTokens}), 0)::bigint`,
        })
        .from(mcpToolCallDailyRollups)
        .where(
          and(
            eq(mcpToolCallDailyRollups.clientId, clientId),
            gte(mcpToolCallDailyRollups.day, since),
          ),
        );

      const totalCalls = Number(row?.totalCalls ?? 0);
      const totalErrors = Number(row?.totalErrors ?? 0);
      const totalTokens = Number(row?.totalTokens ?? 0);

      return json({
        days,
        totalCalls,
        totalErrors,
        errorRate: totalCalls > 0 ? totalErrors / totalCalls : 0,
        totalTokens,
        estCostUsd: tokensToUsd(totalTokens),
      });
    }
  );
}
