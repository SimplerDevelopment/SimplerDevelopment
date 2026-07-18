/**
 * MCP tools — integrations.
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

export function registerIntegrationsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── INTEGRATIONS (Google Workspace) ────────────────────────────────────
  // Currently the only integration surface. Mirrors GET /api/portal/integrations/google/status
  // and POST /api/portal/integrations/google/disconnect. We expose the list as
  // an array (keyed off provider='google') so future integrations slot in
  // without breaking callers.
  hasScope(ctx.scopes, 'integrations:read') && server.registerTool(
    'integrations_list',
    {
      title: 'List integrations',
      description:
        'List third-party integrations connected for the authenticated user under this client. Today returns at most one entry for Google Workspace; the shape is array-of-providers so future integrations can be added without breaking callers. `tier` is "standard" when this tenant has no Workspace credentials provisioned.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'integrations:read')) return denied('integrations:read');
      const tenant = await getTenantWorkspaceCredentialsByClientId(clientId);
      if (!tenant) {
        return json({ tier: 'standard', integrations: [] });
      }
      const rows = await db
        .select({
          googleAccountEmail: googleWorkspaceUserConnections.googleAccountEmail,
          scopes: googleWorkspaceUserConnections.scopes,
          expiresAt: googleWorkspaceUserConnections.expiresAt,
          lastSyncAt: googleWorkspaceUserConnections.lastSyncAt,
          createdAt: googleWorkspaceUserConnections.createdAt,
        })
        .from(googleWorkspaceUserConnections)
        .where(and(
          eq(googleWorkspaceUserConnections.clientId, clientId),
          eq(googleWorkspaceUserConnections.userId, ctx.userId),
          isNull(googleWorkspaceUserConnections.revokedAt),
        ))
        .limit(1);
      return json({
        tier: 'enterprise',
        tenantStatus: tenant.status,
        integrations: rows[0]
          ? [{ provider: 'google', connection: rows[0] }]
          : [],
      });
    }
  );

  hasScope(ctx.scopes, 'integrations:write') && server.registerTool(
    'integrations_revoke',
    {
      title: 'Revoke integration',
      description:
        'Disconnect a third-party integration for the authenticated user. Today only `provider="google"` is supported. Best-effort revoke at the provider, then mark the local row revoked. Idempotent: returns alreadyDisconnected:true if no active connection exists.',
      inputSchema: {
        provider: z.enum(['google']),
      },
    },
    async ({ provider }) => {
      if (!requireScope(ctx, 'integrations:write')) return denied('integrations:write');
      if (provider !== 'google') return json({ error: `Unsupported provider: ${provider}` });

      const tenant = await getTenantWorkspaceCredentialsByClientId(clientId);
      if (!tenant) return json({ error: 'workspace_not_provisioned' });

      const [connection] = await db
        .select()
        .from(googleWorkspaceUserConnections)
        .where(and(
          eq(googleWorkspaceUserConnections.clientId, clientId),
          eq(googleWorkspaceUserConnections.userId, ctx.userId),
          isNull(googleWorkspaceUserConnections.revokedAt),
        ))
        .limit(1);

      if (!connection) return json({ ok: true, alreadyDisconnected: true });

      let revokeError: string | null = null;
      try {
        await revokeGoogleToken(
          connection.refreshToken || connection.accessToken,
          tenant.oauth,
        );
      } catch (err) {
        revokeError = (err as Error)?.message ?? 'unknown_revoke_error';
        console.warn('[mcp] integrations_revoke: provider revoke failed:', revokeError);
      }

      await db.update(googleWorkspaceUserConnections).set({
        accessToken: '',
        refreshToken: '',
        revokedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(googleWorkspaceUserConnections.id, connection.id));

      revalidateForWrite('portal');
      return json({ ok: true, providerRevokeError: revokeError });
    }
  );
}
