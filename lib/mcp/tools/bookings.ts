/**
 * MCP tools — bookings.
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
import { slugify } from '@/lib/publishing/slug';
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

export function registerBookingsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── BOOKINGS / APPOINTMENTS ────────────────────────────────────────────
  // Keywords: booking, appointment, calendar, schedule, meeting, reservation.
  // Mutating tools — create + update a bookable service. Page starts with
  // `active=false` so the public /book/<slug> URL returns 404 until the
  // approver flips it (the approval-link side-effect for entityType
  // 'booking_page' does this automatically — see app/api/approve/[token]).
  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'booking_pages_create',
    {
      title: 'Create booking page',
      description:
        'Create a new bookable service / appointment type. Defaults: 30-min duration, free, Mon–Fri 09–17 America/New_York, individual booking, fixed assignment. The page starts `active=false`; approve the returned URL (or pass `active:true` explicitly) to flip it live. Returns the slim row + approval envelope.',
      inputSchema: {
        title: z.string().min(1).max(100),
        slug: z.string().regex(/^[a-z0-9-]+$/i, 'Slug must be lowercase letters/digits/hyphens').optional(),
        description: z.string().nullable().optional(),
        websiteId: z.number().int().positive().nullable().optional(),
        brandingProfileId: z.number().int().positive().nullable().optional(),
        // Pricing
        price: z.number().int().nonnegative().optional().describe('Price in cents. 0 = free.'),
        priceLabel: z.string().optional().describe('Free-text price display (e.g. "Starts at $200").'),
        // Schedule
        duration: z.number().int().positive().optional().describe('Minutes. Default 30.'),
        bufferBefore: z.number().int().nonnegative().optional(),
        bufferAfter: z.number().int().nonnegative().optional(),
        maxAdvanceDays: z.number().int().positive().optional(),
        minNoticeMins: z.number().int().nonnegative().optional(),
        timezone: z.string().optional(),
        availability: z.any().optional().describe('Day-of-week + time-range schedule. Defaults to Mon–Fri 09–17 in `timezone`.'),
        // Booking type
        bookingType: z.enum(['individual', 'group', 'multi-attendee']).optional(),
        groupCapacity: z.number().int().positive().nullable().optional(),
        maxGuests: z.number().int().positive().nullable().optional(),
        // Assignment
        assignmentMode: z.enum(['fixed', 'round_robin', 'weighted_round_robin']).optional(),
        assignedMembers: z.array(z.number().int().positive()).optional().describe('User ids on the rotation.'),
        roundRobinPool: z.any().optional(),
        allowStaffSelection: z.boolean().optional(),
        // Conferencing
        conferenceType: z.enum(['none', 'google_meet', 'zoom']).optional(),
        googleCalendarSync: z.boolean().optional(),
        // Questions
        questions: z.array(z.any()).optional().describe('BookingQuestion[] — { id, label, type: text|textarea|select, required, options? }'),
        // Toggles
        enableAddOns: z.boolean().optional(),
        enableGiftCertificates: z.boolean().optional(),
        enableDiscountCodes: z.boolean().optional(),
        enableWaivers: z.boolean().optional(),
        waiverContent: z.string().nullable().optional(),
        requireWaiverBeforeBooking: z.boolean().optional(),
        checkinEnabled: z.boolean().optional(),
        // Display
        color: z.string().optional(),
        styling: z.any().optional().describe('BookingPageStyling — { primaryColor?, backgroundColor?, textColor?, headingFont?, bodyFont?, borderRadius?, buttonPrimary*?, hideTitle?, hideLogo? }'),
        thumbnail: z.string().nullable().optional(),
        // Gate the public URL until approved
        active: z.boolean().optional().describe('Whether the booking page is immediately public. Default false; approving the returned link flips it true.'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      // Slug uniqueness — auto-derive if not provided, then bump with date suffix on collision.
      const baseSlug = slugify(args.slug ?? args.title, 80) || 'booking';
      let slug = baseSlug;
      const [collide] = await db.select({ id: bookingPages.id }).from(bookingPages)
        .where(and(eq(bookingPages.slug, slug), eq(bookingPages.clientId, clientId))).limit(1);
      if (collide) slug = `${baseSlug}-${Date.now().toString(36)}`;

      const [row] = await db.insert(bookingPages).values({
        clientId,
        title: args.title.trim(),
        slug,
        description: args.description ?? null,
        websiteId: args.websiteId ?? null,
        brandingProfileId: args.brandingProfileId ?? null,
        price: args.price ?? 0,
        priceLabel: args.priceLabel,
        duration: args.duration ?? 30,
        bufferBefore: args.bufferBefore ?? 0,
        bufferAfter: args.bufferAfter ?? 15,
        maxAdvanceDays: args.maxAdvanceDays ?? 60,
        minNoticeMins: args.minNoticeMins ?? 60,
        timezone: args.timezone ?? 'America/New_York',
        availability: args.availability ?? undefined,
        bookingType: args.bookingType ?? 'individual',
        groupCapacity: args.groupCapacity,
        maxGuests: args.maxGuests,
        assignmentMode: args.assignmentMode ?? 'fixed',
        assignedMembers: args.assignedMembers ?? [],
        roundRobinPool: args.roundRobinPool,
        allowStaffSelection: args.allowStaffSelection ?? false,
        conferenceType: args.conferenceType ?? 'none',
        googleCalendarSync: args.googleCalendarSync ?? false,
        questions: (args.questions ?? []) as never[],
        enableAddOns: args.enableAddOns ?? false,
        enableGiftCertificates: args.enableGiftCertificates ?? false,
        enableDiscountCodes: args.enableDiscountCodes ?? false,
        enableWaivers: args.enableWaivers ?? false,
        waiverContent: args.waiverContent ?? null,
        requireWaiverBeforeBooking: args.requireWaiverBeforeBooking ?? false,
        checkinEnabled: args.checkinEnabled ?? false,
        color: args.color ?? '#2563eb',
        styling: args.styling ?? {},
        thumbnail: args.thumbnail ?? null,
        // Default to NOT-active so the public URL is gated behind approval.
        active: args.active ?? false,
      }).returning();

      const approval = approvalEnvelope(
        await createApprovalLink({
          ctx,
          entityType: 'booking_page',
          entityId: row.id,
          summary: `Booking page "${row.title}"`,
        }),
      );

      return json({ ...row, approval });
    }
  );

  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'booking_pages_update',
    {
      title: 'Update booking page',
      description:
        'Patch any combination of fields on a booking page. Same field set as booking_pages_create. Mints a fresh approval URL on every call — the old URL stays valid in whatever state it was already in. To delete a booking page, set `active=false` and flag it for cleanup; there is no destructive delete tool today.',
      inputSchema: {
        id: z.number().int().positive(),
        title: z.string().min(1).max(100).optional(),
        description: z.string().nullable().optional(),
        websiteId: z.number().int().positive().nullable().optional(),
        brandingProfileId: z.number().int().positive().nullable().optional(),
        price: z.number().int().nonnegative().optional(),
        priceLabel: z.string().nullable().optional(),
        duration: z.number().int().positive().optional(),
        bufferBefore: z.number().int().nonnegative().optional(),
        bufferAfter: z.number().int().nonnegative().optional(),
        maxAdvanceDays: z.number().int().positive().optional(),
        minNoticeMins: z.number().int().nonnegative().optional(),
        timezone: z.string().optional(),
        availability: z.any().optional(),
        bookingType: z.enum(['individual', 'group', 'multi-attendee']).optional(),
        groupCapacity: z.number().int().positive().nullable().optional(),
        maxGuests: z.number().int().positive().nullable().optional(),
        assignmentMode: z.enum(['fixed', 'round_robin', 'weighted_round_robin']).optional(),
        assignedMembers: z.array(z.number().int().positive()).optional(),
        roundRobinPool: z.any().optional(),
        allowStaffSelection: z.boolean().optional(),
        conferenceType: z.enum(['none', 'google_meet', 'zoom']).optional(),
        googleCalendarSync: z.boolean().optional(),
        questions: z.array(z.any()).optional(),
        enableAddOns: z.boolean().optional(),
        enableGiftCertificates: z.boolean().optional(),
        enableDiscountCodes: z.boolean().optional(),
        enableWaivers: z.boolean().optional(),
        waiverContent: z.string().nullable().optional(),
        requireWaiverBeforeBooking: z.boolean().optional(),
        checkinEnabled: z.boolean().optional(),
        color: z.string().optional(),
        styling: z.any().optional(),
        thumbnail: z.string().nullable().optional(),
        active: z.boolean().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      const [existing] = await db.select({ id: bookingPages.id, title: bookingPages.title })
        .from(bookingPages)
        .where(and(eq(bookingPages.id, id), eq(bookingPages.clientId, clientId)))
        .limit(1);
      if (!existing) return json({ error: 'Booking page not found' });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;

      const [row] = await db.update(bookingPages).set(patch)
        .where(eq(bookingPages.id, id)).returning();

      const approval = approvalEnvelope(
        await createApprovalLink({
          ctx,
          entityType: 'booking_page',
          entityId: row.id,
          summary: `Booking page "${row.title}" (rev)`,
        }),
      );

      return json({ ...row, approval });
    }
  );

  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'booking_pages_list',
    {
      title: 'List booking pages',
      description: 'List bookable services / appointment types (booking pages) for the client.',
      inputSchema: {
        activeOnly: z.boolean().optional().default(true),
      },
    },
    async ({ activeOnly = true }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const conds = [eq(bookingPages.clientId, clientId)];
      if (activeOnly) conds.push(eq(bookingPages.active, true));
      const rows = await db.select({
        id: bookingPages.id,
        title: bookingPages.title,
        slug: bookingPages.slug,
        description: bookingPages.description,
        price: bookingPages.price,
        duration: bookingPages.duration,
        timezone: bookingPages.timezone,
        maxGuests: bookingPages.maxGuests,
        active: bookingPages.active,
        websiteId: bookingPages.websiteId,
      }).from(bookingPages).where(and(...conds))
        .orderBy(desc(bookingPages.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'booking_pages_get',
    {
      title: 'Get booking page',
      description: 'Full booking page config including availability, questions, and feature toggles.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const [row] = await db.select().from(bookingPages)
        .where(and(eq(bookingPages.id, id), eq(bookingPages.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Booking page not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'bookings_list',
    {
      title: 'List appointments / bookings',
      description:
        'List scheduled bookings for the client. Filter by booking page, status, or date range. Use this to answer "what\'s on my calendar this week".',
      inputSchema: {
        bookingPageId: z.number().optional(),
        status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
        startAfter: z.string().optional().describe('ISO datetime — only bookings with startTime >= this.'),
        endBefore: z.string().optional().describe('ISO datetime — only bookings with startTime <= this.'),
        limit: z.number().min(1).max(500).default(100).optional(),
      },
    },
    async ({ bookingPageId, status, startAfter, endBefore, limit = 100 }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const conds = [eq(bookings.clientId, clientId)];
      if (bookingPageId) conds.push(eq(bookings.bookingPageId, bookingPageId));
      if (status) conds.push(eq(bookings.status, status));
      if (startAfter) conds.push(gte(bookings.startTime, new Date(startAfter)));
      if (endBefore) conds.push(lte(bookings.startTime, new Date(endBefore)));
      const rows = await db.select().from(bookings)
        .where(and(...conds))
        .orderBy(bookings.startTime).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'bookings_get',
    {
      title: 'Get booking',
      description: 'Fetch a single booking by id.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const [row] = await db.select().from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Booking not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'bookings_cancel',
    {
      title: 'Cancel booking / appointment',
      description:
        'Cancel a booking. Marks status=cancelled and stamps cancelledAt. This does NOT auto-refund payment or remove Google Calendar events — handle those in the UI or via separate tools when they exist.',
      inputSchema: {
        id: z.number(),
        reason: z.string().optional().describe('Internal note appended to booking.notes.'),
      },
    },
    async ({ id, reason }) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
      const [existing] = await db.select().from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Booking not found' });
      if (existing.status === 'cancelled') return json({ error: 'Booking already cancelled' });
      const patch: Record<string, unknown> = {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      };
      if (reason) {
        const prior = existing.notes?.trim();
        patch.notes = prior ? `${prior}\n[cancelled] ${reason}` : `[cancelled] ${reason}`;
      }
      const [row] = await db.update(bookings).set(patch)
        .where(eq(bookings.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'bookings_update',
    {
      title: 'Update booking',
      description:
        'Edit booking fields (times, status, notes, assignee, check-in). Time changes DO NOT automatically push to Google Calendar or notify the guest.',
      inputSchema: {
        id: z.number(),
        startTime: z.string().optional().describe('ISO datetime.'),
        endTime: z.string().optional().describe('ISO datetime.'),
        status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
        notes: z.string().nullable().optional(),
        assignedTo: z.number().nullable().optional(),
        guestName: z.string().min(1).optional(),
        guestEmail: z.string().email().optional(),
        guestPhone: z.string().nullable().optional(),
      },
    },
    async ({ id, startTime, endTime, ...rest }) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
      const [existing] = await db.select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Booking not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (startTime !== undefined) patch.startTime = new Date(startTime);
      if (endTime !== undefined) patch.endTime = new Date(endTime);
      if (rest.status === 'cancelled' && existing.status !== 'cancelled') {
        patch.cancelledAt = new Date();
      }
      const [row] = await db.update(bookings).set(patch)
        .where(eq(bookings.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── GIFT CERTIFICATES ──────────────────────────────────────────────────
  hasScope(ctx.scopes, 'bookings:read') && server.registerTool(
    'gift_certificates_list',
    {
      title: 'List gift certificates',
      description: 'List gift certificates for the client, optionally filtered by website or status.',
      inputSchema: {
        websiteId: z.number().optional(),
        status: z.enum(['pending_payment', 'active', 'fully_redeemed', 'expired', 'cancelled']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ websiteId, status, limit = 50 }) => {
      if (!requireScope(ctx, 'bookings:read')) return denied('bookings:read');
      const conds = [eq(giftCertificates.clientId, clientId)];
      if (websiteId) conds.push(eq(giftCertificates.websiteId, websiteId));
      if (status) conds.push(eq(giftCertificates.status, status));
      const rows = await db.select().from(giftCertificates)
        .where(and(...conds))
        .orderBy(desc(giftCertificates.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'bookings:write') && server.registerTool(
    'gift_certificates_issue',
    {
      title: 'Issue gift certificate',
      description:
        'Manually issue a gift certificate (bypasses Stripe payment). Starts as `active` and ready to redeem. Use cautiously.',
      inputSchema: {
        amount: z.number().int().min(1).describe('Amount in cents.'),
        purchaserName: z.string().min(1),
        purchaserEmail: z.string().email(),
        recipientName: z.string().optional(),
        recipientEmail: z.string().email().optional(),
        personalMessage: z.string().optional(),
        websiteId: z.number().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'bookings:write')) return denied('bookings:write');
      if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      const [row] = await db.insert(giftCertificates).values({
        clientId,
        websiteId: args.websiteId ?? null,
        code,
        initialAmount: args.amount,
        remainingAmount: args.amount,
        status: 'active',
        purchaserName: args.purchaserName.trim(),
        purchaserEmail: args.purchaserEmail.trim().toLowerCase(),
        recipientName: args.recipientName ?? null,
        recipientEmail: args.recipientEmail?.trim().toLowerCase() ?? null,
        personalMessage: args.personalMessage ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );
}
