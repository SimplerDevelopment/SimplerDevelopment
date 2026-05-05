/**
 * MCP tools — profile.
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

export function registerProfileTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── PROFILE ────────────────────────────────────────────────────────────
  // Self-update of the authenticated user. Mirrors PATCH /api/portal/settings/profile
  // — touches both `users` (name/email) and `clients` (company/phone/website/
  // address/emailPrefix). Email uniqueness is checked across users.
  hasScope(ctx.scopes, 'profile:read') && server.registerTool(
    'profile_get',
    {
      title: 'Get my profile',
      description: 'Return the authenticated user\'s profile and the linked client\'s public fields (company, phone, website, address, emailPrefix).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'profile:read')) return denied('profile:read');
      const [user] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      return json({
        user,
        client: {
          id: ctx.client.id,
          company: ctx.client.company,
          phone: ctx.client.phone,
          website: ctx.client.website,
          address: ctx.client.address,
          emailPrefix: ctx.client.emailPrefix,
        },
      });
    }
  );

  hasScope(ctx.scopes, 'profile:write') && server.registerTool(
    'profile_update',
    {
      title: 'Update my profile',
      description:
        'Update the authenticated user (name, email) and/or linked client public fields (company, phone, website, address, emailPrefix). All fields optional — only provided fields are written. Email must be unique across users.',
      inputSchema: {
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        company: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        emailPrefix: z.string().nullable().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'profile:write')) return denied('profile:write');

      const userPatch: Partial<{ name: string; email: string; updatedAt: Date }> = {};
      if (args.name !== undefined) userPatch.name = args.name.trim();
      if (args.email !== undefined) {
        const trimmed = args.email.trim();
        const [current] = await db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId)).limit(1);
        if (trimmed !== current?.email) {
          const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.email, trimmed)).limit(1);
          if (conflict) return json({ error: 'Email already in use' });
        }
        userPatch.email = trimmed;
      }
      if (Object.keys(userPatch).length > 0) {
        userPatch.updatedAt = new Date();
        await db.update(users).set(userPatch).where(eq(users.id, ctx.userId));
      }

      const clientPatch: Partial<{
        company: string | null;
        phone: string | null;
        website: string | null;
        address: string | null;
        emailPrefix: string | null;
        updatedAt: Date;
      }> = {};
      if (args.company !== undefined) clientPatch.company = args.company?.trim() || null;
      if (args.phone !== undefined) clientPatch.phone = args.phone?.trim() || null;
      if (args.website !== undefined) clientPatch.website = args.website?.trim() || null;
      if (args.address !== undefined) clientPatch.address = args.address?.trim() || null;
      if (args.emailPrefix !== undefined) {
        clientPatch.emailPrefix = args.emailPrefix?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || null;
      }
      if (Object.keys(clientPatch).length > 0) {
        clientPatch.updatedAt = new Date();
        await db.update(clients).set(clientPatch).where(eq(clients.id, clientId));
      }

      revalidateForWrite('portal');
      return json({ success: true });
    }
  );
}
