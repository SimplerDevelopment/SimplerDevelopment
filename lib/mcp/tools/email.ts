/**
 * MCP tools — email.
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

export function registerEmailTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── EMAIL ──────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_lists',
    {
      title: 'List email lists',
      description: 'List email marketing lists for the client.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const rows = await db.select().from(emailLists)
        .where(eq(emailLists.clientId, clientId))
        .orderBy(desc(emailLists.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_campaigns_list',
    {
      title: 'List email campaigns',
      description: 'List email campaigns for the client. Returns the slim projection by default (no rendered HTML body or block JSON). Pass `includeContent: true` if you need to inspect the full body — but it can be hundreds of KB per row.',
      inputSchema: {
        status: z.string().optional(),
        includeContent: z.boolean().default(false).optional().describe('Include the full htmlContent + blockContent fields. Default false.'),
      },
    },
    async ({ status, includeContent }) => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const conds = [eq(emailCampaigns.clientId, clientId)];
      if (status) conds.push(eq(emailCampaigns.status, status));
      const rows = await db.select(campaignProjection(includeContent)).from(emailCampaigns)
        .where(and(...conds))
        .orderBy(desc(emailCampaigns.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_create',
    {
      title: 'Create email campaign (draft)',
      description:
        'Create a draft email campaign tied to a list. Provide either `htmlContent` directly or `blocks` (visual-editor Block array — see blocks://schema). Campaign starts in `draft` status; use the portal UI to send/schedule. Returns the slim projection by default (no htmlContent / blockContent echo); pass `includeContent: true` only if you need the body in the response.',
      inputSchema: {
        name: z.string().min(1).describe('Internal name for the campaign.'),
        subject: z.string().min(1),
        listId: z.number().describe('Target email list id (must belong to this client).'),
        fromName: z.string().min(1),
        fromEmail: z.string().email(),
        replyTo: z.string().email().optional(),
        previewText: z.string().optional(),
        htmlContent: z.string().optional().describe('Pre-rendered HTML body.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects; rendered to HTML server-side.'),
        includeContent: z.boolean().default(false).optional().describe('Echo back htmlContent + blockContent in the response. Default false.'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, args.listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) return json({ error: 'List not found' });
      const includeContent = args.includeContent;
      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'create',
        entityId: null,
        summary: `Create draft campaign "${args.name}" → list #${args.listId}`,
        payload: args,
        apply: async () => {
          let finalHtml = args.htmlContent?.trim() ?? '';
          let blockContent: { blocks: unknown[] } | null = null;
          if (Array.isArray(args.blocks) && args.blocks.length > 0) {
            blockContent = { blocks: args.blocks };
            finalHtml = renderBlocksToEmailHtml(args.blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
          }
          if (!finalHtml) throw new Error('Provide htmlContent or non-empty blocks');
          const [row] = await db.insert(emailCampaigns).values({
            name: args.name.trim(),
            subject: args.subject.trim(),
            previewText: args.previewText?.trim() || null,
            fromName: args.fromName.trim(),
            fromEmail: args.fromEmail.trim(),
            replyTo: args.replyTo?.trim() || null,
            listId: args.listId,
            clientId,
            htmlContent: finalHtml,
            blockContent,
            status: 'draft',
            createdBy: ctx.userId,
          }).returning(campaignProjection(includeContent));
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'email:send') && server.registerTool(
    'email_campaigns_send',
    {
      title: 'Send email campaign NOW',
      description:
        'Dispatch a draft/scheduled campaign to every active subscriber on its list, skipping subscribers who have already received it (resume-safe). Synchronous — large lists will block the MCP call; use dryRun first to preview. Gated on the `email:send` scope, which should be granted separately from `email:write`.',
      inputSchema: {
        id: z.number(),
        dryRun: z.boolean().optional().describe('If true, return target counts without sending.'),
      },
    },
    async ({ id, dryRun }) => {
      if (!requireScope(ctx, 'email:send')) return denied('email:send');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [campaign] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!campaign) return json({ error: 'Campaign not found' });
      if (campaign.status === 'sent' || campaign.status === 'sending') {
        return json({ error: `Campaign is already ${campaign.status}` });
      }

      if (dryRun) {
        const already = await db.select({ subscriberId: emailCampaignSends.subscriberId })
          .from(emailCampaignSends).where(eq(emailCampaignSends.campaignId, id));
        const sentIds = new Set(already.map(s => s.subscriberId));
        const activeSubs = await db.select({ id: emailSubscribers.id }).from(emailSubscribers)
          .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));
        const willSend = activeSubs.filter(s => !sentIds.has(s.id)).length;
        return json({
          dryRun: true,
          campaignId: id,
          listId: campaign.listId,
          totalActive: activeSubs.length,
          alreadySent: sentIds.size,
          willSend,
        });
      }

      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'send',
        entityId: id,
        summary: `Send campaign #${id} "${campaign.name}" (subject: "${campaign.subject}") to list #${campaign.listId}`,
        payload: { id },
        originalSnapshot: {
          name: campaign.name,
          subject: campaign.subject,
          fromEmail: campaign.fromEmail,
          listId: campaign.listId,
        },
        apply: async () => {
          return await executeCampaignSend(id, campaign);
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // Email lists CRUD
  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_lists_create',
    {
      title: 'Create email list',
      description: 'Create a new email list owned by this client.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async ({ name, description }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [row] = await db.insert(emailLists).values({
        clientId,
        name: name.trim(),
        description: description?.trim() || null,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_lists_update',
    {
      title: 'Update email list',
      description: 'Rename an email list or update its description.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      },
    },
    async ({ id, name, description }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [existing] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, id), eq(emailLists.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'List not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) patch.name = name.trim();
      if (description !== undefined) patch.description = description;
      const [row] = await db.update(emailLists).set(patch)
        .where(eq(emailLists.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_lists_delete',
    {
      title: 'Delete email list',
      description: 'Permanently delete an email list and every subscriber in it. Campaigns referencing the list will block deletion.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [existing] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, id), eq(emailLists.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'List not found' });
      try {
        await db.delete(emailLists).where(eq(emailLists.id, id));
      } catch (err) {
        return json({ error: `Cannot delete: ${(err as Error).message}` });
      }
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );

  // Email subscribers CRUD
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_subscribers_list',
    {
      title: 'List email subscribers',
      description: 'List subscribers on a list, optionally filtered by status. Returns up to `limit` rows newest-first.',
      inputSchema: {
        listId: z.number(),
        status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
        search: z.string().optional().describe('Case-insensitive match on email or name.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ listId, status, search, limit = 100 }) => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) return json({ error: 'List not found' });
      const conds = [eq(emailSubscribers.listId, listId)];
      if (status) conds.push(eq(emailSubscribers.status, status));
      if (search) {
        const q = `%${search}%`;
        const fuzzy = or(ilike(emailSubscribers.email, q), ilike(emailSubscribers.name, q));
        if (fuzzy) conds.push(fuzzy);
      }
      const rows = await db.select().from(emailSubscribers)
        .where(and(...conds))
        .orderBy(desc(emailSubscribers.subscribedAt))
        .limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_subscribers_add',
    {
      title: 'Add email subscriber',
      description:
        'Add a subscriber to a list. If email already exists on the list, updates name/metadata/status instead of creating a duplicate. Generates a fresh unsubscribe token for new rows.',
      inputSchema: {
        listId: z.number(),
        email: z.string().email(),
        name: z.string().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
        status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
      },
    },
    async ({ listId, email, name, metadata, status }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) return json({ error: 'List not found' });
      const normalizedEmail = email.trim().toLowerCase();
      const [existing] = await db.select().from(emailSubscribers)
        .where(and(eq(emailSubscribers.listId, listId), eq(emailSubscribers.email, normalizedEmail)))
        .limit(1);
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (name !== undefined) patch.name = name;
        if (metadata !== undefined) patch.metadata = metadata;
        if (status !== undefined) patch.status = status;
        if (Object.keys(patch).length === 0) return json(existing);
        const [row] = await db.update(emailSubscribers).set(patch)
          .where(eq(emailSubscribers.id, existing.id)).returning();
        revalidateForWrite('portal');
        return json(row);
      }
      const [row] = await db.insert(emailSubscribers).values({
        listId,
        email: normalizedEmail,
        name: name ?? null,
        metadata: metadata ?? null,
        status: status ?? 'active',
        unsubscribeToken: generateUnsubscribeToken(),
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_subscribers_update',
    {
      title: 'Update email subscriber',
      description: 'Update a subscriber\'s name, status, or metadata.',
      inputSchema: {
        id: z.number(),
        name: z.string().nullable().optional(),
        status: z.enum(['active', 'unsubscribed', 'bounced', 'complained']).optional(),
        metadata: z.record(z.string(), z.string()).nullable().optional(),
      },
    },
    async ({ id, name, status, metadata }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [sub] = await db
        .select({ id: emailSubscribers.id, listId: emailSubscribers.listId, status: emailSubscribers.status })
        .from(emailSubscribers)
        .innerJoin(emailLists, eq(emailLists.id, emailSubscribers.listId))
        .where(and(eq(emailSubscribers.id, id), eq(emailLists.clientId, clientId)))
        .limit(1);
      if (!sub) return json({ error: 'Subscriber not found' });
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (metadata !== undefined) patch.metadata = metadata;
      if (status !== undefined) {
        patch.status = status;
        if (status === 'unsubscribed' && sub.status !== 'unsubscribed') patch.unsubscribedAt = new Date();
      }
      const [row] = await db.update(emailSubscribers).set(patch)
        .where(eq(emailSubscribers.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_subscribers_remove',
    {
      title: 'Remove email subscriber',
      description:
        'Remove a subscriber. By default marks them as `unsubscribed` (soft-remove). Pass `hardDelete: true` to permanently delete the row — this loses the audit trail.',
      inputSchema: {
        id: z.number(),
        hardDelete: z.boolean().optional(),
      },
    },
    async ({ id, hardDelete }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [sub] = await db
        .select({ id: emailSubscribers.id })
        .from(emailSubscribers)
        .innerJoin(emailLists, eq(emailLists.id, emailSubscribers.listId))
        .where(and(eq(emailSubscribers.id, id), eq(emailLists.clientId, clientId)))
        .limit(1);
      if (!sub) return json({ error: 'Subscriber not found' });
      if (hardDelete) {
        await db.delete(emailSubscribers).where(eq(emailSubscribers.id, id));
        revalidateForWrite('portal');
        return json({ success: true, id, mode: 'hard' });
      }
      await db.update(emailSubscribers)
        .set({ status: 'unsubscribed', unsubscribedAt: new Date() })
        .where(eq(emailSubscribers.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id, mode: 'soft' });
    }
  );


  // ── EMAIL TEMPLATES ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_templates_list',
    {
      title: 'List email templates',
      description: 'List reusable email templates available to this client (plus global agency templates).',
      inputSchema: {
        category: z.enum(['welcome', 'newsletter', 'promotion', 'transactional', 'custom']).optional(),
      },
    },
    async ({ category }) => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const conds = [or(eq(emailTemplates.clientId, clientId), eq(emailTemplates.isGlobal, true))!];
      if (category) conds.push(eq(emailTemplates.category, category));
      const rows = await db.select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        description: emailTemplates.description,
        category: emailTemplates.category,
        subject: emailTemplates.subject,
        thumbnailUrl: emailTemplates.thumbnailUrl,
        isGlobal: emailTemplates.isGlobal,
        usageCount: emailTemplates.usageCount,
        updatedAt: emailTemplates.updatedAt,
      }).from(emailTemplates).where(and(...conds))
        .orderBy(desc(emailTemplates.usageCount));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_templates_create',
    {
      title: 'Create email template',
      description: 'Save a reusable email template. Provide htmlContent OR blocks (rendered to HTML).',
      inputSchema: {
        name: z.string().min(1),
        category: z.enum(['welcome', 'newsletter', 'promotion', 'transactional', 'custom']).optional(),
        subject: z.string().optional(),
        description: z.string().optional(),
        htmlContent: z.string().optional(),
        blocks: z.array(z.any()).optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      let finalHtml = args.htmlContent?.trim() ?? '';
      let blockContent: { blocks: unknown[] } | null = null;
      if (Array.isArray(args.blocks) && args.blocks.length > 0) {
        blockContent = { blocks: args.blocks };
        finalHtml = renderBlocksToEmailHtml(args.blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
      }
      if (!finalHtml) return json({ error: 'Provide htmlContent or non-empty blocks' });
      const [row] = await db.insert(emailTemplates).values({
        clientId,
        name: args.name.trim(),
        category: args.category ?? 'custom',
        subject: args.subject ?? null,
        description: args.description ?? null,
        htmlContent: finalHtml,
        blockContent,
        createdBy: ctx.userId,
      }).returning({
        id: emailTemplates.id,
        name: emailTemplates.name,
        category: emailTemplates.category,
        subject: emailTemplates.subject,
        description: emailTemplates.description,
        thumbnailUrl: emailTemplates.thumbnailUrl,
        isGlobal: emailTemplates.isGlobal,
        usageCount: emailTemplates.usageCount,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
      });
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── EMAIL SEGMENTS ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:read') && server.registerTool(
    'email_segments_list',
    {
      title: 'List email segments',
      description: 'List segmented audience definitions (rule-based subscriber filters).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'email:read')) return denied('email:read');
      const rows = await db.select().from(emailSegments)
        .where(eq(emailSegments.clientId, clientId))
        .orderBy(desc(emailSegments.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_segments_create',
    {
      title: 'Create email segment',
      description:
        'Define a subscriber segment by rules. Each rule: { field, operator, value }. matchType="all" (AND) or "any" (OR).',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        matchType: z.enum(['all', 'any']).optional(),
        rules: z.array(z.object({
          field: z.string(),
          operator: z.string(),
          value: z.string(),
        })),
      },
    },
    async ({ name, description, matchType, rules }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [row] = await db.insert(emailSegments).values({
        clientId,
        name: name.trim(),
        description: description ?? null,
        matchType: matchType ?? 'all',
        rules,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── EMAIL CAMPAIGN SCHEDULE ────────────────────────────────────────────
  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_schedule',
    {
      title: 'Schedule email campaign',
      description:
        'Mark a draft campaign as scheduled for a future send. Sets status=scheduled and scheduledAt. Pass unschedule:true to revert to draft. Does NOT dispatch — a scheduler or manual send is still required.',
      inputSchema: {
        id: z.number(),
        scheduledAt: z.string().optional().describe('ISO datetime of intended send.'),
        unschedule: z.boolean().optional(),
      },
    },
    async ({ id, scheduledAt, unschedule }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [existing] = await db.select({ id: emailCampaigns.id, status: emailCampaigns.status })
        .from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Campaign not found' });
      if (unschedule) {
        if (existing.status !== 'scheduled') return json({ error: `Cannot unschedule — current status is ${existing.status}` });
        const [row] = await db.update(emailCampaigns)
          .set({ status: 'draft', scheduledAt: null, updatedAt: new Date() })
          .where(eq(emailCampaigns.id, id)).returning();
        return json(row);
      }
      if (!scheduledAt) return json({ error: 'scheduledAt required unless unschedule=true' });
      if (existing.status !== 'draft' && existing.status !== 'scheduled') {
        return json({ error: `Cannot schedule — current status is ${existing.status}` });
      }
      const when = new Date(scheduledAt);
      if (when.getTime() <= Date.now()) return json({ error: 'scheduledAt must be in the future' });
      const [row] = await db.update(emailCampaigns)
        .set({ status: 'scheduled', scheduledAt: when, updatedAt: new Date() })
        .where(eq(emailCampaigns.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_update',
    {
      title: 'Update draft email campaign',
      description:
        'Update metadata or content of a draft campaign. Refuses to edit campaigns in sending/sent/scheduled state (use unschedule first).',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        subject: z.string().min(1).optional(),
        previewText: z.string().nullable().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
        replyTo: z.string().email().nullable().optional(),
        listId: z.number().optional(),
        htmlContent: z.string().optional(),
        blocks: z.array(z.any()).optional().describe('Re-renders HTML if provided.'),
      },
    },
    async ({ id, blocks, ...rest }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [existing] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Campaign not found' });
      if (existing.status !== 'draft') return json({ error: `Cannot edit — status is ${existing.status}` });
      if (rest.listId !== undefined && rest.listId !== existing.listId) {
        const [list] = await db.select({ id: emailLists.id }).from(emailLists)
          .where(and(eq(emailLists.id, rest.listId), eq(emailLists.clientId, clientId))).limit(1);
        if (!list) return json({ error: 'Target list not found' });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'update',
        entityId: id,
        summary: `Update draft campaign #${id} "${existing.name}"`,
        payload: { id, blocks, ...rest },
        originalSnapshot: { name: existing.name, subject: existing.subject, listId: existing.listId },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
          if (Array.isArray(blocks) && blocks.length > 0) {
            patch.blockContent = { blocks };
            patch.htmlContent = renderBlocksToEmailHtml(blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
          }
          const [row] = await db.update(emailCampaigns).set(patch)
            .where(eq(emailCampaigns.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'email:write') && server.registerTool(
    'email_campaigns_delete',
    {
      title: 'Delete email campaign',
      description: 'Permanently delete a campaign. Refuses if the campaign has already sent.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'email:write')) return denied('email:write');
      if (!(await requireService(clientId, 'email'))) return serviceDenied('email');
      const [existing] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Campaign not found' });
      if (existing.status === 'sent' || existing.status === 'sending') {
        return json({ error: `Cannot delete a campaign in status ${existing.status}` });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'email_campaign',
        operation: 'delete',
        entityId: id,
        summary: `Delete campaign #${id} "${existing.name}"`,
        payload: { id },
        originalSnapshot: { name: existing.name, subject: existing.subject, status: existing.status },
        apply: async () => {
          await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
          return { success: true, id };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );
}
