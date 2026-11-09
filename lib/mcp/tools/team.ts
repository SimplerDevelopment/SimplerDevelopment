/**
 * MCP tools — team.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. The
 * registrar function below is invoked by buildMcpServer() and registers each
 * tool with its scope guard. Behavior is unchanged from the monolithic file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or, gte, lte } from 'drizzle-orm';
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

  // The caller's role on this company, resolved like the REST team routes
  // (app/api/portal/team/route.ts#getUserRole): the client owner, else their
  // client_members row. ctx.client IS the call's target company — it's resolved
  // before buildMcpServer (lib/mcp/CLAUDE.md), so its userId is the right owner.
  async function callerRole(): Promise<string | null> {
    if (ctx.client.userId === ctx.userId) return 'owner';
    const [row] = await db.select({ role: clientMembers.role }).from(clientMembers)
      .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, ctx.userId))).limit(1);
    return row?.role ?? null;
  }

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
        'Change a team member\'s role to admin, member or viewer. Requires team:write and an owner/admin caller; only owners can grant admin. You cannot change your own role or an owner\'s.',
      inputSchema: {
        memberId: z.number(),
        role: z.enum(['owner', 'admin', 'member', 'viewer']),
      },
    },
    async ({ memberId, role }) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      // PUX-233: mirror PATCH /api/portal/team/[memberId] exactly. The scope used to
      // be the only check, so any member with a team:write key could set their OWN
      // row to 'owner'. Owner rows can't be changed at all here, which also made the
      // old last-owner guard unreachable.
      const current = await callerRole();
      if (current !== 'owner' && current !== 'admin') return json({ error: 'Only owners and admins can update roles' });
      const [existing] = await db.select({ id: clientMembers.id, role: clientMembers.role, userId: clientMembers.userId })
        .from(clientMembers)
        .where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Member not found' });
      if (existing.userId === ctx.userId) return json({ error: 'You cannot change your own role' });
      if (existing.role === 'owner' || existing.userId === ctx.client.userId) return json({ error: 'Cannot change the owner role' });
      // The enum still accepts 'owner' for backwards-compatible schemas; it is never assignable.
      if (role === 'owner') return json({ error: 'Ownership cannot be assigned by a role change' });
      if (current === 'admin' && role === 'admin') return json({ error: 'Only owners can assign the admin role' });
      const [row] = await db.update(clientMembers).set({ role })
        .where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId))).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'team:write') && server.registerTool(
    'team_remove_member',
    {
      title: 'Remove team member',
      description: 'Remove a user\'s client_members row for this client. Does not delete the user account. Requires an owner/admin caller; only owners can remove admins; the owner and yourself cannot be removed.',
      inputSchema: { memberId: z.number() },
    },
    async ({ memberId }) => {
      if (!requireScope(ctx, 'team:write')) return denied('team:write');
      // PUX-233: mirror DELETE /api/portal/team/[memberId] — the scope used to be the only check.
      const current = await callerRole();
      if (current !== 'owner' && current !== 'admin') return json({ error: 'Only owners and admins can remove members' });
      const [existing] = await db.select({ id: clientMembers.id, role: clientMembers.role, userId: clientMembers.userId })
        .from(clientMembers)
        .where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Member not found' });
      if (existing.userId === ctx.userId) return json({ error: 'You cannot remove yourself' });
      if (existing.role === 'owner' || existing.userId === ctx.client.userId) return json({ error: 'Cannot remove the account owner' });
      if (current === 'admin' && existing.role === 'admin') return json({ error: 'Only owners can remove admins' });
      await db.delete(clientMembers).where(and(eq(clientMembers.id, memberId), eq(clientMembers.clientId, clientId)));
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
