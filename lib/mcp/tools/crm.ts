/**
 * MCP tools — crm.
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

export function registerCrmTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── CRM ────────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_contacts_search',
    {
      title: 'Search CRM contacts',
      description: 'Search CRM contacts by name or email.',
      inputSchema: {
        query: z.string().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ query, status, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      // Raw `SELECT *` so Postgres returns whatever columns actually exist on
      // the live table — avoids Drizzle expanding the SELECT list to every
      // column declared in the TS schema, which has previously drifted ahead
      // of the DB and broken this handler (pg 42703). Filters compose safely
      // via Drizzle's sql`` template (parameterized).
      const q = query ? `%${query}%` : null;
      const statusFilter = status ? sql`AND status = ${status}` : sql``;
      const searchFilter = q
        ? sql`AND (first_name ILIKE ${q} OR last_name ILIKE ${q} OR email ILIKE ${q})`
        : sql``;
      try {
        const result = await db.execute<Record<string, unknown>>(sql`
          SELECT *
          FROM crm_contacts
          WHERE client_id = ${clientId}
            ${statusFilter}
            ${searchFilter}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        const rows = extractRows(result);
        return json(rows);
      } catch (err) {
        return dbErrorEnvelope(err, 'crm_contacts_search');
      }
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_contacts_create',
    {
      title: 'Create CRM contact',
      description: 'Create a new CRM contact.',
      inputSchema: {
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        linkedinUrl: z.string().url().optional(),
        title: z.string().optional(),
        companyId: z.number().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmContacts).values({
        clientId,
        firstName: args.firstName,
        lastName: args.lastName ?? null,
        email: args.email ?? null,
        phone: args.phone ?? null,
        linkedinUrl: args.linkedinUrl ?? null,
        title: args.title ?? null,
        companyId: args.companyId ?? null,
        status: args.status ?? 'active',
        notes: args.notes ?? null,
        ownerId: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_contacts_update',
    {
      title: 'Update CRM contact',
      description: 'Update any mutable field on a CRM contact. Pass null to clear nullable fields.',
      inputSchema: {
        id: z.number(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        linkedinUrl: z.string().url().nullable().optional(),
        title: z.string().nullable().optional(),
        companyId: z.number().nullable().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        source: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        score: z.number().optional(),
        ownerId: z.number().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmContacts.id }).from(crmContacts)
        .where(and(eq(crmContacts.id, id), eq(crmContacts.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Contact not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmContacts).set(patch)
        .where(eq(crmContacts.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_companies_search',
    {
      title: 'Search CRM companies',
      description: 'Search CRM companies by name or domain.',
      inputSchema: { query: z.string().optional(), limit: z.number().default(50).optional() },
    },
    async ({ query, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      // See crm_contacts_search for rationale: raw SELECT * insulates this
      // handler from TS/DB column drift and lets pg return exactly what exists.
      const q = query ? `%${query}%` : null;
      const searchFilter = q
        ? sql`AND (name ILIKE ${q} OR domain ILIKE ${q})`
        : sql``;
      try {
        const result = await db.execute<Record<string, unknown>>(sql`
          SELECT *
          FROM crm_companies
          WHERE client_id = ${clientId}
            ${searchFilter}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        const rows = extractRows(result);
        return json(rows);
      } catch (err) {
        return dbErrorEnvelope(err, 'crm_companies_search');
      }
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_companies_create',
    {
      title: 'Create CRM company',
      description: 'Create a new CRM company.',
      inputSchema: {
        name: z.string().min(1),
        domain: z.string().optional(),
        industry: z.string().optional(),
        website: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmCompanies).values({
        clientId,
        name: args.name,
        domain: args.domain ?? null,
        industry: args.industry ?? null,
        website: args.website ?? null,
        phone: args.phone ?? null,
        notes: args.notes ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_companies_update',
    {
      title: 'Update CRM company',
      description: 'Update any mutable field on a CRM company.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        domain: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        size: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
        .where(and(eq(crmCompanies.id, id), eq(crmCompanies.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Company not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmCompanies).set(patch)
        .where(eq(crmCompanies.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_deals_list',
    {
      title: 'List CRM deals',
      description: 'List deals in a pipeline, or across all pipelines for the client.',
      inputSchema: {
        pipelineId: z.number().optional(),
        status: z.enum(['open', 'won', 'lost']).optional(),
      },
    },
    async ({ pipelineId, status }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmDeals.clientId, clientId)];
      if (pipelineId) conds.push(eq(crmDeals.pipelineId, pipelineId));
      if (status) conds.push(eq(crmDeals.status, status));
      const rows = await db.select().from(crmDeals).where(and(...conds))
        .orderBy(desc(crmDeals.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_create',
    {
      title: 'Create CRM deal',
      description: 'Create a new deal in a pipeline stage.',
      inputSchema: {
        title: z.string().min(1),
        pipelineId: z.number(),
        stageId: z.number(),
        value: z.number().optional().describe('Amount in cents'),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        expectedCloseDate: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmDeals).values({
        clientId,
        title: args.title,
        pipelineId: args.pipelineId,
        stageId: args.stageId,
        value: args.value ?? null,
        contactId: args.contactId ?? null,
        companyId: args.companyId ?? null,
        expectedCloseDate: args.expectedCloseDate ? new Date(args.expectedCloseDate) : null,
        notes: args.notes ?? null,
        ownerId: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_move_stage',
    {
      title: 'Move deal to stage',
      description: 'Move a deal to a different pipeline stage (or close it as won/lost).',
      inputSchema: {
        id: z.number(),
        stageId: z.number().optional(),
        status: z.enum(['open', 'won', 'lost']).optional(),
      },
    },
    async ({ id, stageId, status }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (stageId !== undefined) patch.stageId = stageId;
      if (status !== undefined) {
        patch.status = status;
        if (status === 'won' || status === 'lost') patch.closedAt = new Date();
      }
      const [row] = await db.update(crmDeals).set(patch)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.clientId, clientId)))
        .returning();
      if (row) revalidateForWrite('portal');
      return json(row ?? { error: 'Not found' });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_update',
    {
      title: 'Update CRM deal',
      description: 'Update any mutable field on a CRM deal (title, value, dates, contact/company links, priority, notes). Use crm_deals_move_stage to change stageId/status.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        value: z.number().nullable().optional().describe('Amount in cents.'),
        currency: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        contactId: z.number().nullable().optional(),
        companyId: z.number().nullable().optional(),
        expectedCloseDate: z.string().nullable().optional().describe('ISO date string, or null to clear.'),
        notes: z.string().nullable().optional(),
        recurringValue: z.number().nullable().optional(),
        billingCycle: z.enum(['monthly', 'quarterly', 'annual', 'one-time']).nullable().optional(),
        ownerId: z.number().nullable().optional(),
      },
    },
    async ({ id, expectedCloseDate, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deal not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (expectedCloseDate !== undefined) {
        patch.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
      }
      const [row] = await db.update(crmDeals).set(patch)
        .where(eq(crmDeals.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── CRM DEAL ARTIFACTS ─────────────────────────────────────────────────
  const DEAL_ARTIFACT_TABLES: Record<string, { table: any; titleField: string }> = {
    website: { table: clientWebsites, titleField: 'name' },
    email_campaign: { table: emailCampaigns, titleField: 'name' },
    pitch_deck: { table: pitchDecks, titleField: 'title' },
    proposal: { table: crmProposals, titleField: 'title' },
    booking: { table: bookingPages, titleField: 'title' },
    survey: { table: surveys, titleField: 'title' },
    project: { table: projects, titleField: 'name' },
  };

  const ARTIFACT_TYPE_ENUM = z.enum(['website', 'email_campaign', 'pitch_deck', 'proposal', 'booking', 'survey', 'project']);

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_deal_artifacts_list',
    {
      title: 'List artifacts linked to a deal',
      description: 'List every artifact (website, email campaign, pitch deck, proposal, booking, survey, project) linked to a CRM deal.',
      inputSchema: { dealId: z.number() },
    },
    async ({ dealId }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const rows = await db.select().from(crmDealArtifacts)
        .where(eq(crmDealArtifacts.dealId, dealId))
        .orderBy(desc(crmDealArtifacts.pinned), desc(crmDealArtifacts.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deal_artifact_link',
    {
      title: 'Link an artifact to a deal',
      description: 'Attach a website, email campaign, pitch deck, proposal, booking, survey, or project to a CRM deal. The artifact must belong to this client.',
      inputSchema: {
        dealId: z.number(),
        artifactType: ARTIFACT_TYPE_ENUM,
        artifactId: z.number(),
        pinned: z.boolean().optional(),
      },
    },
    async ({ dealId, artifactType, artifactId, pinned }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });

      const config = DEAL_ARTIFACT_TABLES[artifactType];
      const [source] = await db.select({ title: config.table[config.titleField] })
        .from(config.table)
        .where(and(eq(config.table.id, artifactId), eq(config.table.clientId, clientId)));
      if (!source) return json({ error: 'Artifact not found or not owned by this client' });

      const [row] = await db.insert(crmDealArtifacts).values({
        dealId,
        artifactType,
        artifactId,
        displayTitle: source.title || 'Untitled',
        pinned: pinned ?? false,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deal_artifact_toggle_pin',
    {
      title: 'Pin or unpin a deal artifact',
      description: 'Update the pinned flag on a linked deal artifact.',
      inputSchema: { dealId: z.number(), artifactDbId: z.number(), pinned: z.boolean() },
    },
    async ({ dealId, artifactDbId, pinned }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const [row] = await db.update(crmDealArtifacts).set({ pinned })
        .where(and(eq(crmDealArtifacts.id, artifactDbId), eq(crmDealArtifacts.dealId, dealId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deal_artifact_unlink',
    {
      title: 'Unlink an artifact from a deal',
      description: 'Remove an artifact link from a deal. Deletes the link row; the underlying artifact is not touched.',
      inputSchema: { dealId: z.number(), artifactDbId: z.number() },
    },
    async ({ dealId, artifactDbId }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const [row] = await db.delete(crmDealArtifacts)
        .where(and(eq(crmDealArtifacts.id, artifactDbId), eq(crmDealArtifacts.dealId, dealId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_pipelines_list',
    {
      title: 'List pipelines',
      description: 'List CRM pipelines and stages.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const pipelines = await db.select().from(crmPipelines)
        .where(eq(crmPipelines.clientId, clientId));
      const stages = pipelines.length
        ? await db.select().from(crmPipelineStages)
            .where(sql`${crmPipelineStages.pipelineId} IN (${sql.join(pipelines.map(p => sql`${p.id}`), sql`, `)})`)
            .orderBy(crmPipelineStages.sortOrder)
        : [];
      return json({ pipelines, stages });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_create',
    {
      title: 'Create CRM pipeline',
      description: 'Create a new pipeline. Optionally seed it with an ordered list of stages.',
      inputSchema: {
        name: z.string().min(1),
        isDefault: z.boolean().optional(),
        stages: z.array(z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          probability: z.number().int().min(0).max(100).optional(),
        })).optional().describe('Optional initial stages in sort order.'),
      },
    },
    async ({ name, isDefault, stages }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (isDefault) {
        await db.update(crmPipelines)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(crmPipelines.clientId, clientId), eq(crmPipelines.isDefault, true)));
      }
      const [pipeline] = await db.insert(crmPipelines).values({
        clientId,
        name: name.trim(),
        isDefault: isDefault ?? false,
      }).returning();
      const insertedStages = stages && stages.length > 0
        ? await db.insert(crmPipelineStages).values(stages.map((s, i) => ({
            pipelineId: pipeline.id,
            name: s.name.trim(),
            color: s.color ?? '#6366f1',
            sortOrder: i,
            probability: s.probability ?? 0,
          }))).returning()
        : [];
      revalidateForWrite('portal');
      return json({ pipeline, stages: insertedStages });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_update',
    {
      title: 'Update CRM pipeline',
      description: 'Rename a pipeline or toggle its default flag. For stage edits use crm_pipelines_add_stage / crm_pipelines_update_stage / crm_pipelines_delete_stage.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        isDefault: z.boolean().optional(),
      },
    },
    async ({ id, name, isDefault }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
        .where(and(eq(crmPipelines.id, id), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Pipeline not found' });
      if (isDefault) {
        await db.update(crmPipelines)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(crmPipelines.clientId, clientId), eq(crmPipelines.isDefault, true)));
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) patch.name = name.trim();
      if (isDefault !== undefined) patch.isDefault = isDefault;
      const [row] = await db.update(crmPipelines).set(patch)
        .where(eq(crmPipelines.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_add_stage',
    {
      title: 'Add stage to CRM pipeline',
      description: 'Append a stage to a pipeline. Uses next sortOrder unless specified.',
      inputSchema: {
        pipelineId: z.number(),
        name: z.string().min(1),
        color: z.string().optional(),
        probability: z.number().int().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ pipelineId, name, color, probability, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [pipeline] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
        .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!pipeline) return json({ error: 'Pipeline not found' });
      const existing = await db.select({ id: crmPipelineStages.id }).from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipelineId));
      const [row] = await db.insert(crmPipelineStages).values({
        pipelineId,
        name: name.trim(),
        color: color ?? '#6366f1',
        sortOrder: sortOrder ?? existing.length,
        probability: probability ?? 0,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_update_stage',
    {
      title: 'Update CRM pipeline stage',
      description: 'Rename, recolor, reorder, or update win-probability on a pipeline stage.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        probability: z.number().int().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [stage] = await db
        .select({ id: crmPipelineStages.id, pipelineId: crmPipelineStages.pipelineId })
        .from(crmPipelineStages)
        .innerJoin(crmPipelines, eq(crmPipelines.id, crmPipelineStages.pipelineId))
        .where(and(eq(crmPipelineStages.id, id), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!stage) return json({ error: 'Stage not found' });
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmPipelineStages).set(patch)
        .where(eq(crmPipelineStages.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── CRM ACTIVITIES ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_activities_list',
    {
      title: 'List CRM activities / notes',
      description:
        'List logged activities (calls, emails, meetings, notes, tasks) filtered by contact/deal/company.',
      inputSchema: {
        contactId: z.number().optional(),
        dealId: z.number().optional(),
        companyId: z.number().optional(),
        type: z.enum(['call', 'email', 'meeting', 'note', 'task']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ contactId, dealId, companyId, type, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmActivities.clientId, clientId)];
      if (contactId) conds.push(eq(crmActivities.contactId, contactId));
      if (dealId) conds.push(eq(crmActivities.dealId, dealId));
      if (companyId) conds.push(eq(crmActivities.companyId, companyId));
      if (type) conds.push(eq(crmActivities.type, type));
      const rows = await db.select().from(crmActivities)
        .where(and(...conds))
        .orderBy(desc(crmActivities.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_activities_create',
    {
      title: 'Log CRM activity / note',
      description:
        'Log an activity against a contact, deal, or company. Type "note" captures a plain observation; "task" supports dueDate; "completedAt" marks it done.',
      inputSchema: {
        type: z.enum(['call', 'email', 'meeting', 'note', 'task']),
        title: z.string().min(1),
        description: z.string().optional(),
        contactId: z.number().optional(),
        dealId: z.number().optional(),
        companyId: z.number().optional(),
        dueDate: z.string().optional().describe('ISO datetime (for tasks).'),
        completedAt: z.string().optional().describe('ISO datetime — mark activity as complete.'),
      },
    },
    async ({ type, title, description, contactId, dealId, companyId, dueDate, completedAt }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!contactId && !dealId && !companyId) {
        return json({ error: 'Provide at least one of contactId, dealId, or companyId' });
      }
      const [row] = await db.insert(crmActivities).values({
        clientId,
        type,
        title: title.trim(),
        description: description ?? null,
        contactId: contactId ?? null,
        dealId: dealId ?? null,
        companyId: companyId ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completedAt: completedAt ? new Date(completedAt) : null,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── CRM PROPOSALS ──────────────────────────────────────────────────────
  // Keywords: proposal, quote, estimate, SOW, statement of work, bid.
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'proposals_list',
    {
      title: 'List CRM proposals / quotes',
      description: 'List proposals (quotes, estimates, SOWs) for the client. Filter by status or deal.',
      inputSchema: {
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']).optional(),
        dealId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, dealId, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmProposals.clientId, clientId)];
      if (status) conds.push(eq(crmProposals.status, status));
      if (dealId) conds.push(eq(crmProposals.dealId, dealId));
      const rows = await db.select({
        id: crmProposals.id,
        title: crmProposals.title,
        status: crmProposals.status,
        contactId: crmProposals.contactId,
        companyId: crmProposals.companyId,
        dealId: crmProposals.dealId,
        sentAt: crmProposals.sentAt,
        acceptedAt: crmProposals.acceptedAt,
        declinedAt: crmProposals.declinedAt,
        viewCount: crmProposals.viewCount,
        validUntil: crmProposals.validUntil,
        createdAt: crmProposals.createdAt,
        updatedAt: crmProposals.updatedAt,
      }).from(crmProposals).where(and(...conds))
        .orderBy(desc(crmProposals.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'proposals_get',
    {
      title: 'Get CRM proposal',
      description: 'Fetch a proposal with full sections, line items, fees, and signature status.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [row] = await db.select().from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Proposal not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_create',
    {
      title: 'Create CRM proposal',
      description:
        'Create a new proposal (quote/estimate/SOW). Sections are { id, type: "text"|"heading"|"image"|"divider"|"pricing"|"terms"|"signature", title?, content?, imageUrl? }. Line items are { id, description, quantity, unitPrice (cents), optional? }. Fees are { label, type: "flat"|"percent", amount }. Starts in draft; use proposals_send to dispatch.',
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional(),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        dealId: z.number().optional(),
        sections: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().optional().describe('ISO date'),
        accentColor: z.string().optional(),
        logoUrl: z.string().optional(),
        coverImageUrl: z.string().optional(),
        footerText: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'create',
        entityId: null,
        summary: `Create proposal "${args.title}"${args.dealId ? ` (deal #${args.dealId})` : ''}`,
        payload: args,
        apply: async () => {
          const [row] = await db.insert(crmProposals).values({
            clientId,
            title: args.title.trim(),
            summary: args.summary ?? null,
            contactId: args.contactId ?? null,
            companyId: args.companyId ?? null,
            dealId: args.dealId ?? null,
            sections: (args.sections ?? []) as ProposalSection[],
            lineItems: (args.lineItems ?? []) as ProposalLineItem[],
            fees: (args.fees ?? []) as ProposalFee[],
            currency: args.currency ?? 'USD',
            validUntil: args.validUntil ? new Date(args.validUntil) : null,
            clientToken: crypto.randomBytes(32).toString('hex'),
            accentColor: args.accentColor ?? '#2563eb',
            logoUrl: args.logoUrl ?? null,
            coverImageUrl: args.coverImageUrl ?? null,
            footerText: args.footerText ?? null,
            createdBy: ctx.userId,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_update',
    {
      title: 'Update CRM proposal',
      description: 'Update any field on a proposal. Use proposals_send to transition to sent; use status="declined"/"accepted" to record the outcome.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        summary: z.string().nullable().optional(),
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']).optional(),
        contactId: z.number().nullable().optional(),
        companyId: z.number().nullable().optional(),
        dealId: z.number().nullable().optional(),
        sections: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().nullable().optional(),
        declineReason: z.string().nullable().optional(),
        accentColor: z.string().optional(),
        logoUrl: z.string().nullable().optional(),
        coverImageUrl: z.string().nullable().optional(),
        footerText: z.string().nullable().optional(),
      },
    },
    async ({ id, validUntil, sections, lineItems, fees, status, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select().from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Proposal not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'update',
        entityId: id,
        summary: `Update proposal #${id} "${existing.title}"${status ? ` → ${status}` : ''}`,
        payload: { id, validUntil, sections, lineItems, fees, status, ...rest },
        originalSnapshot: { title: existing.title, status: existing.status, summary: existing.summary },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
          if (sections !== undefined) patch.sections = sections as ProposalSection[];
          if (lineItems !== undefined) patch.lineItems = lineItems as ProposalLineItem[];
          if (fees !== undefined) patch.fees = fees as ProposalFee[];
          if (validUntil !== undefined) patch.validUntil = validUntil ? new Date(validUntil) : null;
          if (status !== undefined) {
            patch.status = status;
            if (status === 'accepted' && existing.status !== 'accepted') patch.acceptedAt = new Date();
            if (status === 'declined' && existing.status !== 'declined') patch.declinedAt = new Date();
          }
          const [row] = await db.update(crmProposals).set(patch)
            .where(eq(crmProposals.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_send',
    {
      title: 'Mark proposal as sent',
      description:
        'Transition a proposal from draft to sent. Stamps sentAt. NOTE: this updates portal state only — it does NOT email the proposal. Use the portal UI for email delivery or fetch the proposal URL via get and share it manually.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmProposals.id, title: crmProposals.title, status: crmProposals.status })
        .from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Proposal not found' });
      if (existing.status !== 'draft') return json({ error: `Cannot send — current status is ${existing.status}` });
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'send',
        entityId: id,
        summary: `Send proposal #${id} "${existing.title}"`,
        payload: { id },
        originalSnapshot: { status: existing.status },
        apply: async () => {
          const [row] = await db.update(crmProposals)
            .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
            .where(eq(crmProposals.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );


  // ── CRM CONTRACTS ──────────────────────────────────────────────────────
  // Keywords: contract, agreement, MSA, e-signature, signature, sign.
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'contracts_list',
    {
      title: 'List CRM contracts',
      description: 'List contracts / agreements for the client. Filter by status or linked proposal.',
      inputSchema: {
        status: z.enum(['draft', 'sent', 'partially_signed', 'fully_executed', 'voided', 'expired']).optional(),
        proposalId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, proposalId, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmContracts.clientId, clientId)];
      if (status) conds.push(eq(crmContracts.status, status));
      if (proposalId) conds.push(eq(crmContracts.proposalId, proposalId));
      const rows = await db.select({
        id: crmContracts.id,
        title: crmContracts.title,
        status: crmContracts.status,
        proposalId: crmContracts.proposalId,
        dealId: crmContracts.dealId,
        sentAt: crmContracts.sentAt,
        fullyExecutedAt: crmContracts.fullyExecutedAt,
        voidedAt: crmContracts.voidedAt,
        validUntil: crmContracts.validUntil,
        createdAt: crmContracts.createdAt,
        updatedAt: crmContracts.updatedAt,
      }).from(crmContracts).where(and(...conds))
        .orderBy(desc(crmContracts.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'contracts_get',
    {
      title: 'Get CRM contract with signers',
      description: 'Fetch contract + all signer records (name, email, status, signedAt).',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [contract] = await db.select().from(crmContracts)
        .where(and(eq(crmContracts.id, id), eq(crmContracts.clientId, clientId))).limit(1);
      if (!contract) return json({ error: 'Contract not found' });
      const signers = await db.select().from(crmContractSigners)
        .where(eq(crmContractSigners.contractId, id))
        .orderBy(crmContractSigners.order);
      return json({ contract, signers });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'contracts_create',
    {
      title: 'Create CRM contract',
      description:
        'Create a contract / agreement. Clauses = { id, title, content, required }. Signers = { name, email, role?, order? } — each gets a unique signing token. Starts in draft.',
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional(),
        proposalId: z.number().optional(),
        dealId: z.number().optional(),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        clauses: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().optional(),
        signers: z.array(z.object({
          name: z.string().min(1),
          email: z.string().email(),
          role: z.enum(['signer', 'witness', 'approver']).optional(),
          order: z.number().optional(),
        })).optional(),
        accentColor: z.string().optional(),
        logoUrl: z.string().optional(),
        footerText: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [contract] = await db.insert(crmContracts).values({
        clientId,
        proposalId: args.proposalId ?? null,
        dealId: args.dealId ?? null,
        contactId: args.contactId ?? null,
        companyId: args.companyId ?? null,
        title: args.title.trim(),
        summary: args.summary ?? null,
        clauses: (args.clauses ?? []) as ContractClause[],
        lineItems: (args.lineItems ?? []) as ProposalLineItem[],
        fees: (args.fees ?? []) as ProposalFee[],
        currency: args.currency ?? 'USD',
        validUntil: args.validUntil ? new Date(args.validUntil) : null,
        clientToken: crypto.randomBytes(32).toString('hex'),
        accentColor: args.accentColor ?? '#2563eb',
        logoUrl: args.logoUrl ?? null,
        footerText: args.footerText ?? null,
        createdBy: ctx.userId,
      }).returning();
      const insertedSigners = args.signers && args.signers.length > 0
        ? await db.insert(crmContractSigners).values(args.signers.map((s, i) => ({
            contractId: contract.id,
            name: s.name.trim(),
            email: s.email.trim().toLowerCase(),
            role: s.role ?? 'signer',
            order: s.order ?? i,
            token: crypto.randomBytes(32).toString('hex'),
          }))).returning()
        : [];
      revalidateForWrite('portal');
      return json({ contract, signers: insertedSigners });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'contracts_void',
    {
      title: 'Void contract',
      description: 'Mark a contract as voided (not executable). Stamps voidedAt + reason. Cannot be undone via MCP.',
      inputSchema: {
        id: z.number(),
        reason: z.string().optional(),
      },
    },
    async ({ id, reason }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmContracts.id, status: crmContracts.status })
        .from(crmContracts)
        .where(and(eq(crmContracts.id, id), eq(crmContracts.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Contract not found' });
      if (existing.status === 'voided') return json({ error: 'Already voided' });
      if (existing.status === 'fully_executed') return json({ error: 'Cannot void — already fully executed' });
      const [row] = await db.update(crmContracts)
        .set({ status: 'voided', voidedAt: new Date(), voidReason: reason ?? null, updatedAt: new Date() })
        .where(eq(crmContracts.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── CRM CUSTOM FIELDS / SAVED VIEWS / SCORING ──────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_custom_fields_list',
    {
      title: 'List CRM custom fields',
      description: 'List custom field definitions attached to contact/company/deal entities.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']).optional(),
      },
    },
    async ({ entityType }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmCustomFields.clientId, clientId)];
      if (entityType) conds.push(eq(crmCustomFields.entityType, entityType));
      const rows = await db.select().from(crmCustomFields)
        .where(and(...conds))
        .orderBy(crmCustomFields.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_create',
    {
      title: 'Create CRM custom field',
      description: 'Define a custom field on contact/company/deal. For select/multiselect types, provide options[].',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        fieldName: z.string().min(1),
        fieldType: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'url', 'email', 'phone', 'boolean']),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        filterable: z.boolean().optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ entityType, fieldName, fieldType, options, required, filterable, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.insert(crmCustomFields).values({
        clientId,
        entityType,
        fieldName: fieldName.trim(),
        fieldType,
        options: options ?? null,
        required: required ?? false,
        filterable: filterable ?? false,
        sortOrder: sortOrder ?? 0,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_update',
    {
      title: 'Update CRM custom field',
      description: 'Rename, toggle required, reorder, or update options on an existing custom field definition.',
      inputSchema: {
        id: z.number().int().positive(),
        fieldName: z.string().min(1).optional(),
        options: z.array(z.string()).nullable().optional(),
        required: z.boolean().optional(),
        filterable: z.boolean().optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ id, fieldName, options, required, filterable, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [existing] = await db.select({ id: crmCustomFields.id }).from(crmCustomFields)
        .where(and(eq(crmCustomFields.id, id), eq(crmCustomFields.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Custom field not found' });
      const patch: Record<string, unknown> = {};
      if (fieldName !== undefined) patch.fieldName = fieldName.trim();
      if (options !== undefined) patch.options = options;
      if (required !== undefined) patch.required = required;
      if (filterable !== undefined) patch.filterable = filterable;
      if (sortOrder !== undefined) patch.sortOrder = sortOrder;
      if (Object.keys(patch).length === 0) return json({ error: 'No fields to update' });
      const [row] = await db.update(crmCustomFields).set(patch)
        .where(eq(crmCustomFields.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_delete',
    {
      title: 'Delete CRM custom field',
      description: 'Remove a custom field definition. All stored values for this field are cascaded.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      const [row] = await db.delete(crmCustomFields)
        .where(and(eq(crmCustomFields.id, id), eq(crmCustomFields.clientId, clientId)))
        .returning();
      if (!row) return json({ error: 'Custom field not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_custom_field_values_get',
    {
      title: 'Read CRM custom field values',
      description: 'Fetch custom field values (joined with their definitions) for a given contact, company, or deal.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        entityId: z.number().int().positive(),
      },
    },
    async ({ entityType, entityId }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      let entityOk = false;
      if (entityType === 'contact') {
        const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
          .where(and(eq(crmContacts.id, entityId), eq(crmContacts.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else if (entityType === 'company') {
        const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
          .where(and(eq(crmCompanies.id, entityId), eq(crmCompanies.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else {
        const [row] = await db.select({ id: crmDeals.id }).from(crmDeals)
          .where(and(eq(crmDeals.id, entityId), eq(crmDeals.clientId, clientId))).limit(1);
        entityOk = !!row;
      }
      if (!entityOk) return json({ error: 'Entity not found' });
      const rows = await db.select({
        id: crmCustomFieldValues.id,
        customFieldId: crmCustomFieldValues.customFieldId,
        entityId: crmCustomFieldValues.entityId,
        entityType: crmCustomFieldValues.entityType,
        value: crmCustomFieldValues.value,
        fieldName: crmCustomFields.fieldName,
        fieldType: crmCustomFields.fieldType,
        options: crmCustomFields.options,
        required: crmCustomFields.required,
      })
        .from(crmCustomFieldValues)
        .innerJoin(crmCustomFields, eq(crmCustomFieldValues.customFieldId, crmCustomFields.id))
        .where(and(
          eq(crmCustomFieldValues.entityType, entityType),
          eq(crmCustomFieldValues.entityId, entityId),
          eq(crmCustomFields.clientId, clientId),
        ));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_field_values_set',
    {
      title: 'Upsert CRM custom field values',
      description: 'Set (insert or update) custom field values on a contact/company/deal. Pass values as { [fieldId]: stringValue }. Pass empty string or null to clear.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        entityId: z.number().int().positive(),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      },
    },
    async ({ entityType, entityId, values }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      let entityOk = false;
      if (entityType === 'contact') {
        const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
          .where(and(eq(crmContacts.id, entityId), eq(crmContacts.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else if (entityType === 'company') {
        const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
          .where(and(eq(crmCompanies.id, entityId), eq(crmCompanies.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else {
        const [row] = await db.select({ id: crmDeals.id }).from(crmDeals)
          .where(and(eq(crmDeals.id, entityId), eq(crmDeals.clientId, clientId))).limit(1);
        entityOk = !!row;
      }
      if (!entityOk) return json({ error: 'Entity not found' });

      const fieldIds = Object.keys(values).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
      if (fieldIds.length === 0) return json([]);

      const validFields = await db.select({ id: crmCustomFields.id }).from(crmCustomFields)
        .where(and(eq(crmCustomFields.clientId, clientId), inArray(crmCustomFields.id, fieldIds)));
      const validFieldIds = new Set(validFields.map(f => f.id));

      const results = [];
      for (const [fieldIdStr, raw] of Object.entries(values)) {
        const fieldId = parseInt(fieldIdStr, 10);
        if (!validFieldIds.has(fieldId)) continue;
        const stringValue = raw === null || raw === undefined ? null : String(raw);
        const [row] = await db.insert(crmCustomFieldValues).values({
          customFieldId: fieldId,
          entityId,
          entityType,
          value: stringValue,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [crmCustomFieldValues.customFieldId, crmCustomFieldValues.entityId, crmCustomFieldValues.entityType],
          set: { value: stringValue, updatedAt: new Date() },
        }).returning();
        results.push(row);
      }
      revalidateForWrite('portal');
      return json(results);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_saved_views_list',
    {
      title: 'List CRM saved views',
      description: 'List saved filter/view configurations for contacts, companies, or deals.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']).optional(),
      },
    },
    async ({ entityType }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmSavedViews.clientId, clientId)];
      if (entityType) conds.push(eq(crmSavedViews.entityType, entityType));
      const rows = await db.select().from(crmSavedViews)
        .where(and(...conds))
        .orderBy(crmSavedViews.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_scoring_rules_list',
    {
      title: 'List CRM scoring rules',
      description: 'List lead-scoring rules (events that award points to contacts/deals).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const rows = await db.select().from(crmScoringRules)
        .where(eq(crmScoringRules.clientId, clientId))
        .orderBy(desc(crmScoringRules.points));
      return json(rows);
    }
  );
}
