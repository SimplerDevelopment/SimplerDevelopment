/**
 * MCP tools — automations.
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

export function registerAutomationsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── AUTOMATIONS ────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'automations:read') && server.registerTool(
    'automations_list',
    {
      title: 'List automation rules',
      description: 'List automation rules configured for the client, including trigger + condition + action blobs.',
      inputSchema: {
        enabled: z.boolean().optional(),
        productScope: z.string().optional(),
      },
    },
    async ({ enabled, productScope }) => {
      if (!requireScope(ctx, 'automations:read')) return denied('automations:read');
      const conds = [eq(automationRules.clientId, clientId)];
      if (enabled !== undefined) conds.push(eq(automationRules.enabled, enabled));
      if (productScope) conds.push(eq(automationRules.productScope, productScope));
      const rows = await db.select().from(automationRules)
        .where(and(...conds))
        .orderBy(desc(automationRules.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_toggle',
    {
      title: 'Enable / disable automation rule',
      description: 'Flip the `enabled` flag on an automation rule without touching its trigger/conditions/actions.',
      inputSchema: {
        id: z.number(),
        enabled: z.boolean(),
      },
    },
    async ({ id, enabled }) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [existing] = await db.select({ id: automationRules.id }).from(automationRules)
        .where(and(eq(automationRules.id, id), eq(automationRules.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Rule not found' });
      const [row] = await db.update(automationRules)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(automationRules.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── AUTOMATION RULES CRUD ──────────────────────────────────────────────
  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_create',
    {
      title: 'Create automation rule',
      description:
        'Define a new automation rule. Trigger = { event: string, ...metadata }; conditions = [{ field, operator, value }]; actions = [{ tool: string, params: object }]. Rule starts enabled.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        trigger: z.record(z.string(), z.any()).describe('{ event: "email.campaign.sent", ... }'),
        conditions: z.array(z.any()).optional(),
        actions: z.array(z.any()),
        enabled: z.boolean().optional(),
        productScope: z.string().optional(),
        source: z.enum(['nlp', 'settings', 'manual']).optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [row] = await db.insert(automationRules).values({
        clientId,
        name: args.name.trim(),
        description: args.description ?? null,
        trigger: args.trigger as never,
        conditions: (args.conditions ?? []) as never,
        actions: args.actions as never,
        enabled: args.enabled ?? true,
        source: args.source ?? 'manual',
        productScope: args.productScope ?? null,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_update',
    {
      title: 'Update automation rule',
      description: 'Update name, description, trigger, conditions, actions, or productScope. Use automations_toggle for just the enabled flag.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        trigger: z.record(z.string(), z.any()).optional(),
        conditions: z.array(z.any()).optional(),
        actions: z.array(z.any()).optional(),
        productScope: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [existing] = await db.select({ id: automationRules.id }).from(automationRules)
        .where(and(eq(automationRules.id, id), eq(automationRules.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Rule not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(automationRules).set(patch)
        .where(eq(automationRules.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'automations:write') && server.registerTool(
    'automations_delete',
    {
      title: 'Delete automation rule',
      description: 'Permanently delete an automation rule. Logs are retained.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'automations:write')) return denied('automations:write');
      const [existing] = await db.select({ id: automationRules.id }).from(automationRules)
        .where(and(eq(automationRules.id, id), eq(automationRules.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Rule not found' });
      await db.delete(automationRules).where(eq(automationRules.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );
}
