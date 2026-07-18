/**
 * MCP tools — team.
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

export function registerTeamTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── TEAM ───────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'team:read') && server.registerTool(
    'team_list_members',
    {
      title: 'List team members',
      description: 'List users with access to this client (via client_members). Returns user name, email, and role.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'team:read')) return denied('team:read');
      const rows = await db
        .select({
          memberId: clientMembers.id,
          role: clientMembers.role,
          userId: users.id,
          name: users.name,
          email: users.email,
          joinedAt: clientMembers.createdAt,
        })
        .from(clientMembers)
        .innerJoin(users, eq(users.id, clientMembers.userId))
        .where(eq(clientMembers.clientId, clientId))
        .orderBy(clientMembers.createdAt);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'team_update_role',
    {
      title: 'Change team member role',
      description:
        'Change a team member\'s role (owner/admin/member/viewer). Requires team:write. Demoting the last remaining owner is rejected server-side to avoid orphaning the account.',
      inputSchema: {
        memberId: z.number(),
        role: z.enum(['owner', 'admin', 'member', 'viewer']),
      },
    },
    async ({ memberId, role }) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      const [existing] = await db.select({ id: clientMembers.id, role: clientMembers.role }).from(clientMembers)
        .where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Member not found' });
      // Sole-owner orphan guard: don't let the last owner be demoted out of
      // 'owner', which would leave the client with no one able to perform
      // owner-only operations (lock-out).
      if (existing.role === 'owner' && role !== 'owner') {
        const [{ ownerCount }] = await db
          .select({ ownerCount: sql<number>`count(*)::int` })
          .from(clientMembers)
          .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.role, 'owner')));
        if (ownerCount <= 1) {
          return json({ error: 'Cannot demote the last owner — assign another owner first' });
        }
      }
      const [row] = await db.update(clientMembers).set({ role })
        .where(eq(clientMembers.id, memberId)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'team_remove_member',
    {
      title: 'Remove team member',
      description: 'Remove a user\'s client_members row for this client. Does not delete the user account.',
      inputSchema: { memberId: z.number() },
    },
    async ({ memberId }) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      const [existing] = await db.select({ id: clientMembers.id }).from(clientMembers)
        .where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Member not found' });
      await db.delete(clientMembers).where(eq(clientMembers.id, memberId));
      revalidateForWrite('portal');
      return json({ success: true, memberId });
    }
  );

  // Mirrors POST /api/portal/settings/team. Creates a user row (or reuses an
  // existing email match) and a `member`-role client_members link. Returns a
  // generated temp password only when a new user row was created — caller is
  // responsible for delivering it. The HTTP route only allows the client owner
  // to invite; we mirror that here by checking ctx.userId against client.userId
  // or an explicit owner role in client_members.
  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'team_invite',
    {
      title: 'Invite team member',
      description:
        'Invite a user to this client by email. If the email is unknown, creates a new user with a generated temp password (returned in the response). If the email exists, links them as a member without changing their password. Only the account owner may invite — non-owners get a permission error.',
      inputSchema: {
        name: z.string().min(1),
        email: z.string().email(),
      },
    },
    async ({ name, email }) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');

      const isOwner = ctx.client.userId === ctx.userId;
      if (!isOwner) {
        const [ownerMember] = await db
          .select({ id: clientMembers.id })
          .from(clientMembers)
          .where(and(
            eq(clientMembers.clientId, clientId),
            eq(clientMembers.userId, ctx.userId),
            eq(clientMembers.role, 'owner'),
          ))
          .limit(1);
        if (!ownerMember) return json({ error: 'Only the account owner can invite members' });
      }

      const trimmedEmail = email.trim();
      const trimmedName = name.trim();
      const [existing] = await db.select().from(users).where(eq(users.email, trimmedEmail)).limit(1);

      const tempPassword = crypto.randomBytes(6).toString('hex');
      let invitedUser = existing;
      if (!invitedUser) {
        const hashed = await hashPassword(tempPassword, 12);
        [invitedUser] = await db.insert(users).values({
          name: trimmedName,
          email: trimmedEmail,
          password: hashed,
          role: 'client',
          active: true,
        }).returning();
      }

      const [alreadyMember] = await db
        .select({ id: clientMembers.id })
        .from(clientMembers)
        .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, invitedUser.id)))
        .limit(1);
      if (alreadyMember) return json({ error: 'User is already a team member' });

      const [member] = await db.insert(clientMembers).values({
        clientId,
        userId: invitedUser.id,
        role: 'member',
        invitedBy: ctx.userId,
      }).returning();

      revalidateForWrite('portal');
      return json({
        member,
        user: { id: invitedUser.id, name: invitedUser.name, email: invitedUser.email },
        isNewUser: !existing,
        tempPassword: !existing ? tempPassword : null,
      });
    }
  );


  // ── CLIENT SELF-SERVICE ────────────────────────────────────────────────
  hasScope(ctx.scopes, 'team:read') && server.registerTool(
    'client_get',
    {
      title: 'Get authenticated client record',
      description: 'Return the full client row (company, phone, website, address, email prefix, notes).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'team:read')) return denied('team:read');
      const [row] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      return json(row ?? { error: 'Client not found' });
    }
  );

  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'client_update',
    {
      title: 'Update client profile',
      description:
        'Update the authenticated client\'s profile (company name, phone, public website URL, address, notes). Cannot change email or stripe customer id via MCP.',
      inputSchema: {
        company: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(args)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(clients).set(patch)
        .where(eq(clients.id, clientId)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );
}
