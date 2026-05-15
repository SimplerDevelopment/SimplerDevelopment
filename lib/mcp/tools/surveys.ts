/**
 * MCP tools — surveys.
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
import { createApprovalLink, approvalEnvelope } from '../approval-links';
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

export function registerSurveysTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── SURVEYS / FORMS ────────────────────────────────────────────────────
  // Keywords: survey, form, intake, questionnaire, poll, feedback, NPS.
  hasScope(ctx.scopes, 'surveys:read') && server.registerTool(
    'surveys_list',
    {
      title: 'List surveys / forms',
      description: 'List surveys (forms, intake questionnaires, feedback polls) for the client.',
      inputSchema: {
        status: z.enum(['draft', 'active', 'closed']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, limit = 50 }) => {
      if (!requireScope(ctx, 'surveys:read')) return denied('surveys:read');
      const conds = [eq(surveys.clientId, clientId)];
      if (status) conds.push(eq(surveys.status, status));
      const rows = await db.select({
        id: surveys.id,
        title: surveys.title,
        slug: surveys.slug,
        description: surveys.description,
        status: surveys.status,
        responseCount: surveys.responseCount,
        closesAt: surveys.closesAt,
        createdAt: surveys.createdAt,
        updatedAt: surveys.updatedAt,
      }).from(surveys).where(and(...conds))
        .orderBy(desc(surveys.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'surveys:read') && server.registerTool(
    'surveys_get',
    {
      title: 'Get survey with fields',
      description: 'Fetch a survey\'s full definition including fields, pages, and settings.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'surveys:read')) return denied('surveys:read');
      const [row] = await db.select().from(surveys)
        .where(and(eq(surveys.id, id), eq(surveys.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Survey not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'surveys:read') && server.registerTool(
    'surveys_list_responses',
    {
      title: 'List survey responses',
      description:
        'List submitted responses for a survey. Returns answers as a JSON object keyed by field id. Useful for AI analysis of form submissions.',
      inputSchema: {
        surveyId: z.number(),
        since: z.string().optional().describe('ISO date — return responses submitted after this time.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ surveyId, since, limit = 100 }) => {
      if (!requireScope(ctx, 'surveys:read')) return denied('surveys:read');
      const [survey] = await db.select({ id: surveys.id }).from(surveys)
        .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId))).limit(1);
      if (!survey) return json({ error: 'Survey not found' });
      const conds = [eq(surveyResponses.surveyId, surveyId)];
      if (since) conds.push(gte(surveyResponses.createdAt, new Date(since)));
      const rows = await db.select().from(surveyResponses)
        .where(and(...conds))
        .orderBy(desc(surveyResponses.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'surveys:write') && server.registerTool(
    'surveys_create',
    {
      title: 'Create survey / form',
      description:
        'Create a new survey. Fields are SurveyFieldDef objects: { id, type: "text"|"textarea"|"email"|"phone"|"select"|"radio"|"checkbox"|"toggle"|"date"|"rating"|"number"|"url"|"heading"|"slider", label, required, order, options? }. Survey starts in `draft` — use surveys_update to activate.',
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        fields: z.array(z.any()).optional().describe('SurveyFieldDef[]'),
        thankYouTitle: z.string().optional(),
        thankYouMessage: z.string().optional(),
        requireEmail: z.boolean().optional(),
        allowMultiple: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'surveys:write')) return denied('surveys:write');
      if (!(await requireService(clientId, 'surveys'))) return serviceDenied('surveys');
      const baseSlug = args.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const [row] = await db.insert(surveys).values({
        clientId,
        title: args.title.trim(),
        slug,
        description: args.description?.trim() || null,
        fields: (args.fields ?? []) as SurveyFieldDef[],
        thankYouTitle: args.thankYouTitle,
        thankYouMessage: args.thankYouMessage,
        requireEmail: args.requireEmail ?? false,
        allowMultiple: args.allowMultiple ?? true,
        createdBy: ctx.userId,
      }).returning();
      // Mint an approval URL — survey starts in `draft` and approving flips
      // status to `active` so the public /s/<slug> route accepts responses.
      const approval = approvalEnvelope(
        await createApprovalLink({
          ctx,
          entityType: 'survey',
          entityId: row.id,
          summary: `Survey "${row.title}"`,
        }),
      );
      revalidateForWrite('portal');
      return json({ ...row, approval });
    }
  );

  hasScope(ctx.scopes, 'surveys:write') && server.registerTool(
    'surveys_update',
    {
      title: 'Update survey',
      description:
        'Update any combination of: title, description, status (draft/active/closed), fields, thank-you copy, close date, max responses, brandingProfileId, styling, pages (titled page-break sections), publishResults, certificateEnabled, scoringConfig (autoRouteToCrm), and recommendation (offerings/questions/overrides/narrative). Passing only a subset is fine — unspecified fields stay as-is. Mints a fresh approval URL on every update.',
      inputSchema: {
        id: z.number().int().positive(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(['draft', 'active', 'closed']).optional(),
        fields: z.array(z.any()).optional().describe('SurveyFieldDef[]'),
        thankYouTitle: z.string().optional(),
        thankYouMessage: z.string().optional(),
        closesAt: z.string().nullable().optional(),
        maxResponses: z.number().int().positive().nullable().optional(),
        // ─ branding / styling ─
        brandingProfileId: z.number().int().positive().nullable().optional(),
        styling: z.record(z.string(), z.any()).optional()
          .describe('SurveyStyling — { primaryColor?, backgroundColor?, textColor?, headingFont?, bodyFont?, borderRadius?, showLogo?, hideTitle?, buttonPrimary*? }'),
        color: z.string().optional().describe('Legacy single-color override (hex). Prefer styling.primaryColor.'),
        // ─ pages ─
        pages: z.array(z.object({
          title: z.string().optional(),
          description: z.string().optional(),
        })).optional().describe('Per-page metadata. Page boundaries inferred from fields with type=page_break.'),
        // ─ public results / certificate ─
        publishResults: z.boolean().optional(),
        certificateEnabled: z.boolean().optional(),
        consentField: z.string().nullable().optional()
          .describe('Field id that gates response submission via explicit consent checkbox.'),
        // ─ notifications ─
        notifyOnResponse: z.boolean().optional(),
        notifyDigest: z.enum(['off', 'daily', 'weekly']).optional(),
        // ─ scoring + CRM auto-route ─
        scoringConfig: z.any().optional()
          .describe('SurveyScoringConfig — { autoRouteToCrm?: { enabled, minScore, pipelineId, stageId, dealTitleTemplate? } }'),
        // ─ recommendation engine ─
        recommendation: z.any().optional()
          .describe('SurveyRecommendationConfig — { offerings[], questions[], overrides[], hybrid?, alwaysAlsoOfferingKey?, bookUrl?, narrativeTemplate? }'),
        // ─ linking (to another artifact) ─
        linkedType: z.enum(['email_campaign', 'crm_deal', 'crm_proposal', 'booking_page', 'website', 'pitch_deck']).nullable().optional(),
        linkedId: z.number().int().positive().nullable().optional(),
        redirectUrl: z.string().nullable().optional()
          .describe('Send respondents here after submit. Overrides the thank-you screen.'),
      },
    },
    async ({ id, closesAt, fields, ...rest }) => {
      if (!requireScope(ctx, 'surveys:write')) return denied('surveys:write');
      if (!(await requireService(clientId, 'surveys'))) return serviceDenied('surveys');
      const [existing] = await db.select({ id: surveys.id }).from(surveys)
        .where(and(eq(surveys.id, id), eq(surveys.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Survey not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (fields !== undefined) patch.fields = fields as SurveyFieldDef[];
      if (closesAt !== undefined) patch.closesAt = closesAt ? new Date(closesAt) : null;
      const [row] = await db.update(surveys).set(patch)
        .where(eq(surveys.id, id)).returning();
      // Re-mint approval URL on every update — author may have edited fields
      // / scoring / etc. between the previous mint and this update. The old
      // URL stays valid in whatever state it was already in.
      const approval = approvalEnvelope(
        await createApprovalLink({
          ctx,
          entityType: 'survey',
          entityId: row.id,
          summary: `Survey "${row.title}" (rev)`,
        }),
      );
      revalidateForWrite('portal');
      return json({ ...row, approval });
    }
  );
}
