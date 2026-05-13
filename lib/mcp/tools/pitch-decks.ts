/**
 * MCP tools — pitch-decks.
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
import { publishSlidesUpdate } from '@/lib/realtime/internal-publisher';
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

export function registerPitchDecksTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── PITCH DECKS ────────────────────────────────────────────────────────
  // Keywords for tool-search discovery: pitch deck, presentation, slideshow,
  // slides, pptx, sales deck, proposal, investor deck.
  hasScope(ctx.scopes, 'decks:read') && server.registerTool(
    'decks_list',
    {
      title: 'List pitch decks / presentations',
      description:
        'List pitch decks (a.k.a. presentations, slideshows, sales decks, proposals, investor decks) for the client. Use this to find an existing deck before creating a new one.',
      inputSchema: {
        status: z.enum(['draft', 'published', 'archived']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, limit = 50 }) => {
      if (!requireScope(ctx, 'decks:read')) return denied('decks:read');
      const conds = [eq(pitchDecks.clientId, clientId)];
      if (status) conds.push(eq(pitchDecks.status, status));
      const rows = await db.select({
        id: pitchDecks.id,
        title: pitchDecks.title,
        slug: pitchDecks.slug,
        description: pitchDecks.description,
        status: pitchDecks.status,
        formatVersion: pitchDecks.formatVersion,
        brandingProfileId: pitchDecks.brandingProfileId,
        createdAt: pitchDecks.createdAt,
        updatedAt: pitchDecks.updatedAt,
      }).from(pitchDecks).where(and(...conds))
        .orderBy(desc(pitchDecks.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'decks:read') && server.registerTool(
    'decks_get',
    {
      title: 'Get pitch deck with slides',
      description:
        'Fetch a full pitch deck / presentation including its slides, theme, and metadata. Slides use the V2 block-editor format — see the blocks://schema resource for slide block shapes.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'decks:read')) return denied('decks:read');
      const [deck] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!deck) return json({ error: 'Deck not found' });
      return json(deck);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_create',
    {
      title: 'Create pitch deck / presentation',
      description:
        'Create a new pitch deck (presentation, slideshow, sales deck, proposal). Starts empty — immediately follow with decks_replace_slides (preferred: one round-trip with all slides) or decks_add_slide. The deck inherits the client\'s default branding profile automatically; do NOT pass `theme` unless the user explicitly wants to override brand colors. When authoring slides, READ blocks://schema first — it documents block `style` / `elementStyles` fields, per-slide `customCss`, and includes a styled-slide example. Unstyled `text`+`heading` blocks will look bare; always add an eyebrow + styled heading + body pattern, and fully populate Hero blocks (title + subtitle + description + CTA). Returns the slim deck projection by default (no slides array); pass `includeSlides: true` if you need them echoed back.',
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        sourceUrl: z.string().url().optional().describe('Optional reference site used for branding inspiration.'),
        brandingProfileId: z.number().optional().describe('Optional branding profile to inherit theme from. If omitted, the client\'s is_default branding profile is used automatically.'),
        theme: z.object({
          primaryColor: z.string().optional(),
          accentColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          textColor: z.string().optional(),
          headingFont: z.string().optional(),
          bodyFont: z.string().optional(),
          logo: z.string().optional(),
        }).partial().optional(),
        includeSlides: z.boolean().default(false).optional().describe('Echo back the slides array. Default false — saves bandwidth on round-trips that already know slides=[].'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');
      const includeSlides = args.includeSlides;
      // Resolve branding profile:
      //   1. Explicit brandingProfileId → must exist for this client
      //   2. No ID passed → auto-pick the client's is_default profile
      //   3. No default → no profile (fall back to theme args / hard defaults)
      let profile: typeof brandingProfiles.$inferSelect | null = null;
      if (args.brandingProfileId != null) {
        const [row] = await db.select().from(brandingProfiles)
          .where(and(eq(brandingProfiles.id, args.brandingProfileId), eq(brandingProfiles.clientId, clientId)))
          .limit(1);
        if (!row) return json({ error: 'Branding profile not found for this client' });
        profile = row;
      } else {
        const [row] = await db.select().from(brandingProfiles)
          .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)))
          .limit(1);
        profile = row ?? null;
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'create',
        entityId: null,
        summary: `Create pitch deck "${args.title}"`,
        payload: args,
        apply: async () => {
          const baseSlug = args.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const slug = `${baseSlug}-${Date.now().toString(36)}`;
          // Precedence: explicit args.theme > branding profile > defaults.
          const themeFromProfile = profile ? {
            primaryColor: profile.primaryColor ?? undefined,
            accentColor: profile.accentColor ?? undefined,
            backgroundColor: profile.backgroundColor ?? undefined,
            textColor: profile.textColor ?? undefined,
            headingFont: profile.headingFont ?? undefined,
            bodyFont: profile.bodyFont ?? undefined,
            logo: profile.logoUrl ?? undefined,
          } : {};
          const theme = (args.theme || profile) ? {
            primaryColor: args.theme?.primaryColor ?? themeFromProfile.primaryColor ?? '#2563eb',
            accentColor: args.theme?.accentColor ?? themeFromProfile.accentColor ?? '#60a5fa',
            backgroundColor: args.theme?.backgroundColor ?? themeFromProfile.backgroundColor ?? '#0f172a',
            textColor: args.theme?.textColor ?? themeFromProfile.textColor ?? '#f8fafc',
            headingFont: args.theme?.headingFont ?? themeFromProfile.headingFont ?? 'Inter',
            bodyFont: args.theme?.bodyFont ?? themeFromProfile.bodyFont ?? 'Inter',
            logo: args.theme?.logo ?? themeFromProfile.logo,
          } : undefined;
          const [deck] = await db.insert(pitchDecks).values({
            clientId,
            title: args.title.trim(),
            slug,
            description: args.description?.trim() || null,
            sourceUrl: args.sourceUrl ?? null,
            // Persist the resolved profile id (auto-default lookup included)
            // so later reads can re-inherit from the same profile.
            brandingProfileId: profile?.id ?? args.brandingProfileId ?? null,
            theme,
            formatVersion: 2,
            slides: [],
            createdBy: ctx.userId,
          }).returning(deckProjection(includeSlides));
          return deck;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_update',
    {
      title: 'Update pitch deck metadata / theme',
      description: 'Update title, description, status, theme, or slug on a deck. For slide content use decks_replace_slides or decks_add_slide. Returns the slim deck projection by default (no slides array); pass `includeSlides: true` to echo them back.',
      inputSchema: {
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        theme: z.object({
          primaryColor: z.string().optional(),
          accentColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          textColor: z.string().optional(),
          headingFont: z.string().optional(),
          bodyFont: z.string().optional(),
          logo: z.string().optional(),
        }).partial().optional(),
        slug: z.string().optional(),
        includeSlides: z.boolean().default(false).optional().describe('Echo back the full slides array. Default false — slides are unchanged here, so re-sending them wastes bandwidth.'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, args.id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const includeSlides = args.includeSlides;
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'update',
        entityId: args.id,
        summary: `Update deck #${args.id} "${existing.title}"${args.status ? ` → ${args.status}` : ''}`,
        payload: args,
        originalSnapshot: { title: existing.title, description: existing.description, status: existing.status, theme: existing.theme },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          if (args.title !== undefined) patch.title = args.title.trim();
          if (args.description !== undefined) patch.description = args.description?.trim() || null;
          if (args.status !== undefined) patch.status = args.status;
          if (args.theme !== undefined) patch.theme = { ...existing.theme, ...args.theme };
          if (args.slug !== undefined) patch.slug = args.slug.trim();
          const [row] = await db.update(pitchDecks).set(patch)
            .where(eq(pitchDecks.id, args.id)).returning(deckProjection(includeSlides));
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_replace_slides',
    {
      title: 'Replace all deck slides (writes to drafts)',
      description:
        'Replace the entire slide array of a deck with a new V2 slide list. Writes land in slide drafts — the public renderer keeps showing the previous live slides until you call `decks_publish_slide` or `decks_publish_all` to make them live. Existing slides that match by `id` get their `draft.{blocks,customCss,pageSettings,notes}` updated. New slide ids become slides with `draft.pendingCreate = true` and empty live fields. Existing slides missing from the incoming list become tombstones with `draft.pendingDelete = true` until publish. Each slide = { id, label, blocks[], notes?, pageSettings?, customCss? }. Blocks follow the visual-editor schema — you MUST read blocks://schema before calling this (it documents block `style`, `elementStyles`, and per-slide `customCss` used for polished slides). Rules: (1) use `heading` blocks with explicit `level` for titles — never a big `text` block; (2) pair every heading with a small uppercase eyebrow `text` block above it for branded feel; (3) if you use a hero block, populate title + subtitle + description + ctaText/ctaLink — a title-only hero looks broken; (4) apply `style` (color, fontSize, fontWeight, letterSpacing) to add visual hierarchy instead of relying on defaults. Returns the slim deck projection by default — pass `includeSlides: true` only if you need the slides echoed back (you just sent them, so usually you do not).',
      inputSchema: {
        id: z.number(),
        slides: z.array(z.object({
          id: z.string(),
          label: z.string(),
          blocks: z.array(z.any()),
          notes: z.string().optional(),
          pageSettings: z.any().optional(),
          customCss: z.string().optional(),
        })),
        includeSlides: z.boolean().default(false).optional().describe('Echo back the full slides array. Default false — the caller just supplied them, so re-sending is normally pure waste.'),
      },
    },
    async ({ id, slides, includeSlides }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck_slides',
        operation: 'replace_slides',
        entityId: id,
        summary: `Replace all slides on deck #${id} "${existing.title}" (${slides.length} slide${slides.length === 1 ? '' : 's'}) → drafts`,
        payload: { id, slides },
        originalSnapshot: { slides: existing.slides, formatVersion: existing.formatVersion },
        apply: async () => {
          // Re-read inside apply so a long pending-window doesn't lose
          // concurrent updates.
          const [row0] = await db.select().from(pitchDecks)
            .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
          const liveSlides: PitchDeckSlideV2[] = Array.isArray(row0?.slides)
            ? (row0!.slides as PitchDeckSlideV2[])
            : [];
          const liveById = new Map(liveSlides.map((s) => [s.id, s]));
          const incomingIds = new Set(slides.map((s) => s.id));
          const nowIso = new Date().toISOString();

          const next: PitchDeckSlideV2[] = [];

          // 1. Walk incoming list in order — update existing or stage create
          for (const incoming of slides) {
            const normalizedBlocks = assignBlockIds(incoming.blocks as unknown[]) as import('@/types/blocks').Block[];
            const live = liveById.get(incoming.id);
            if (live) {
              // Update existing slide — write into draft, keep live fields untouched
              next.push({
                ...live,
                label: incoming.label, // label is sidebar-only; safe to update live
                draft: {
                  ...(live.draft ?? {}),
                  blocks: normalizedBlocks,
                  customCss: (incoming as { customCss?: string }).customCss,
                  pageSettings: (incoming as { pageSettings?: import('@/types/blocks').PageSettings }).pageSettings,
                  notes: incoming.notes,
                  updatedAt: nowIso,
                  updatedBy: ctx.userId ?? undefined,
                  // preserve a pendingCreate flag if the slide was still
                  // pending-created from an earlier draft (not yet published)
                  pendingCreate: live.draft?.pendingCreate ?? undefined,
                  // dropping any prior pendingDelete since we're updating it
                  pendingDelete: undefined,
                },
              });
            } else {
              // New slide — live fields empty, payload lands in draft.* with pendingCreate
              next.push({
                id: incoming.id,
                label: incoming.label,
                blocks: [],
                draft: {
                  pendingCreate: true,
                  blocks: normalizedBlocks,
                  customCss: (incoming as { customCss?: string }).customCss,
                  pageSettings: (incoming as { pageSettings?: import('@/types/blocks').PageSettings }).pageSettings,
                  notes: incoming.notes,
                  updatedAt: nowIso,
                  updatedBy: ctx.userId ?? undefined,
                },
              });
            }
          }

          // 2. Append tombstones (in original position) for live slides missing
          //    from incoming. We keep them in the slides array so the public
          //    renderer continues to show them until publish.
          for (const live of liveSlides) {
            if (!incomingIds.has(live.id)) {
              next.push({
                ...live,
                draft: {
                  ...(live.draft ?? {}),
                  pendingDelete: true,
                  updatedAt: nowIso,
                  updatedBy: ctx.userId ?? undefined,
                },
              });
            }
          }

          const [row] = await db.update(pitchDecks)
            .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
            .where(eq(pitchDecks.id, id)).returning(deckProjection(includeSlides));
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_add_slide',
    {
      title: 'Append a slide to a deck (writes to draft)',
      description:
        'Append a single V2 slide to the end of a deck. Writes land in the slide draft — the appended slide has empty live fields and `draft.pendingCreate = true` until you call `decks_publish_slide` or `decks_publish_all` to make it live. Slide = { label, blocks[], notes?, pageSettings?, customCss? }. An id will be generated if omitted. Blocks follow the visual-editor schema — read blocks://schema for `style`/`elementStyles`/`customCss` docs and a styled-slide example. Same styling rules as decks_replace_slides: use `heading` blocks (not styled text) for titles, pair with uppercase eyebrows, populate all hero fields, apply `style` for hierarchy. Returns the slim deck projection by default; pass `includeSlides: true` to echo the full slides array back.',
      inputSchema: {
        deckId: z.number(),
        label: z.string().min(1).describe('Slide name shown in the sidebar (e.g. "Cover", "Problem", "Solution").'),
        blocks: z.array(z.any()).describe('Array of Block objects (hero, text, columns, card-grid, etc.)'),
        notes: z.string().optional().describe('Speaker notes.'),
        pageSettings: z.any().optional().describe('Optional page-level settings (backgroundColor, padding, etc).'),
        customCss: z.string().optional().describe('Optional per-slide custom CSS scoped to this slide.'),
        id: z.string().optional(),
        includeSlides: z.boolean().default(false).optional().describe('Echo back the full slides array (now including the new slide). Default false.'),
      },
    },
    async ({ deckId, label, blocks, notes, pageSettings, customCss, id, includeSlides }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck_slides',
        operation: 'add_slide',
        entityId: deckId,
        summary: `Add slide "${label}" to deck #${deckId} "${existing.title}" → draft`,
        payload: { deckId, label, blocks, notes, pageSettings, customCss, id },
        apply: async () => {
          const [row0] = await db.select().from(pitchDecks)
            .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
          const currentSlides: PitchDeckSlideV2[] = Array.isArray(row0?.slides)
            ? (row0!.slides as PitchDeckSlideV2[])
            : [];
          const nowIso = new Date().toISOString();
          const newSlide: PitchDeckSlideV2 = {
            id: id ?? `slide-${Date.now().toString(36)}`,
            label,
            blocks: [],
            draft: {
              pendingCreate: true,
              blocks: assignBlockIds(blocks) as import('@/types/blocks').Block[],
              customCss,
              pageSettings,
              notes,
              updatedAt: nowIso,
              updatedBy: ctx.userId ?? undefined,
            },
          };
          const nextSlides = [...currentSlides, newSlide];
          const [row] = await db.update(pitchDecks)
            .set({ slides: nextSlides, formatVersion: 2, updatedAt: new Date() })
            .where(eq(pitchDecks.id, deckId)).returning(deckProjection(includeSlides));
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_delete',
    {
      title: 'Delete pitch deck',
      description: 'Permanently delete a pitch deck and all its versions.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'delete',
        entityId: id,
        summary: `Delete deck #${id} "${existing.title}"`,
        payload: { id },
        originalSnapshot: { title: existing.title, status: existing.status, slideCount: Array.isArray(existing.slides) ? existing.slides.length : 0 },
        apply: async () => {
          await db.delete(pitchDecks).where(eq(pitchDecks.id, id));
          return { success: true, id };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // Upload an HTML file as a single-slide pitch deck wrapping an html-embed
  // block. Mirrors POST /api/portal/tools/pitch-decks/upload-html. Body must
  // be base64 — MCP can't carry multipart. Slide-counter chrome is suppressed
  // so the embedded HTML can present without overlay.
  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_upload_html',
    {
      title: 'Upload HTML as pitch deck',
      description: 'Upload an HTML/XHTML file (base64-encoded) as a single-slide pitch deck wrapping an html-embed block. The slide-counter is suppressed so the embed can present full-bleed. Max 1 MB. Requires an active pitch-decks subscription. Writes land in slide drafts (single slide, pendingCreate). Call `decks_publish_slide` or `decks_publish_all` to make them live.',
      inputSchema: {
        filename: z.string().min(1).regex(/\.(html?|xhtml)$/i, 'File must be .html, .htm, or .xhtml'),
        contentBase64: z.string().min(1).describe('Base64-encoded HTML body. Decoded size must be ≤ 1 MB.'),
        title: z.string().optional().describe('Override the deck title; defaults to the filename without extension.'),
      },
    },
    async ({ filename, contentBase64, title }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');

      let buffer: Buffer;
      try {
        buffer = Buffer.from(contentBase64, 'base64');
      } catch {
        return json({ error: 'Invalid base64 content' });
      }
      const MAX_HTML_SIZE = 1_000_000;
      if (buffer.byteLength === 0) return json({ error: 'Empty file' });
      if (buffer.byteLength > MAX_HTML_SIZE) {
        return json({ error: `File exceeds ${MAX_HTML_SIZE} bytes` });
      }

      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'upload_html',
        entityId: null,
        summary: `Upload HTML "${filename}" as new pitch deck`,
        // Retain the full base64 body so approval-time replay (in
        // `applyPendingChange`) can re-run the S3 upload + DB insert.
        // The wrapped tool's MAX_HTML_SIZE cap (1 MB raw → ~1.4 MB encoded)
        // fits comfortably inside mcp_pending_changes.payload.
        payload: { filename, title, contentBase64, byteLength: buffer.byteLength },
        apply: async () => {
          const uploadResult = await uploadToS3(buffer, filename, 'text/html');

          await db.insert(media).values({
            filename,
            storedFilename: uploadResult.storedFilename,
            mimeType: 'text/html',
            fileSize: uploadResult.fileSize,
            url: uploadResult.url,
            uploadedBy: ctx.userId,
            clientId,
          });

          const filenameNoExt = filename.replace(/\.[^.]+$/, '');
          const deckTitle = title?.trim() || filenameNoExt || 'Uploaded HTML Deck';
          const baseSlug = (filename.trim().toLowerCase()
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 80)) || 'deck';
          const slug = `${baseSlug}-${Date.now().toString(36)}`;
          const ts = Date.now();

          const slide: PitchDeckSlideV2 = {
            id: `slide-${ts}`,
            label: filenameNoExt || 'HTML',
            blocks: [
              {
                id: `block-${ts}-html`,
                type: 'html-embed',
                order: 1,
                url: uploadResult.url,
                filename,
                height: '100vh',
                width: 'full',
                sandbox: 'scripts',
                iframeTitle: filenameNoExt || 'Embedded HTML slide',
              },
            ],
          };

          const [deck] = await db.insert(pitchDecks).values({
            clientId,
            title: deckTitle,
            slug,
            description: null,
            slides: [slide],
            formatVersion: 2,
            // Suppress slide-counter chrome — single uploaded HTML decks present
            // full-bleed so the embed isn't visually overlapped.
            theme: {
              primaryColor: '#2563eb',
              accentColor: '#60a5fa',
              backgroundColor: '#0f172a',
              textColor: '#f8fafc',
              headingFont: 'Inter',
              bodyFont: 'Inter',
              showSlideNumber: false,
            },
            createdBy: ctx.userId,
          }).returning(deckProjection(false));
          // Fan out to any editor that already opened this deck id. Brand-new
          // upload so the listener set is usually empty, but the publisher is
          // cheap and idempotent. Fire-and-forget.
          void publishSlidesUpdate({
            entityId: deck.id,
            slides: [slide],
          }).catch((err) => {
            console.warn('[mcp/decks_upload_html] realtime publish failed:', err);
          });
          return { ...deck, url: uploadResult.url };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // ── Per-slide draft publish ──────────────────────────────────────────────
  // Promote `slide.draft.*` → live slide fields (and clear `draft`) for a
  // single slide. Used after `decks_replace_slides` / `decks_add_slide` /
  // `decks_upload_html` (which all stage into drafts now) to flip changes
  // live for end-viewers.
  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_publish_slide',
    {
      title: 'Publish a single slide draft → live',
      description: 'Promote one slide\'s draft to live. If the slide\'s draft has `pendingDelete: true` the slide is removed from the deck; if it has `pendingCreate: true` (or a regular update draft) the draft\'s `blocks/customCss/pageSettings/notes` are copied onto the live fields and `draft` is cleared. Use after `decks_replace_slides`, `decks_add_slide`, or `decks_upload_html` to make changes visible in the public renderer.',
      inputSchema: {
        deckId: z.number(),
        slideId: z.string(),
      },
    },
    async ({ deckId, slideId }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const liveSlides: PitchDeckSlideV2[] = Array.isArray(existing.slides)
        ? (existing.slides as PitchDeckSlideV2[])
        : [];
      const targetSlide = liveSlides.find((s) => s.id === slideId);
      if (!targetSlide) return json({ error: 'Slide not found' });

      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck_slide_draft',
        operation: 'publish',
        entityId: deckId,
        summary: `Publish slide "${targetSlide.label}" on deck "${existing.title}"`,
        payload: { deckId, slideId },
        apply: async () => {
          const [row0] = await db.select().from(pitchDecks)
            .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
          const current: PitchDeckSlideV2[] = Array.isArray(row0?.slides)
            ? (row0!.slides as PitchDeckSlideV2[])
            : [];
          const next = applyPublishToSlides(current, slideId);
          const [row] = await db.update(pitchDecks)
            .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
            .where(eq(pitchDecks.id, deckId)).returning(deckProjection(false));
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'decks:write') && server.registerTool(
    'decks_publish_all',
    {
      title: 'Publish all slide drafts on a deck',
      description: 'Walks every slide on a deck and publishes any that have a non-null `draft`. Removes `pendingDelete` tombstones, materializes `pendingCreate` slides, and merges regular update drafts into live fields. Use after a batch of `decks_replace_slides` / `decks_add_slide` calls to flip the whole deck live in one shot.',
      inputSchema: {
        deckId: z.number(),
      },
    },
    async ({ deckId }) => {
      if (!requireScope(ctx, 'decks:write')) return denied('decks:write');
      if (!(await requireService(clientId, 'pitch-decks'))) return serviceDenied('pitch-decks');
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deck not found' });
      const liveSlides: PitchDeckSlideV2[] = Array.isArray(existing.slides)
        ? (existing.slides as PitchDeckSlideV2[])
        : [];
      const draftCount = liveSlides.filter((s) => s.draft != null).length;

      const result = await stageOrApply({
        ctx,
        entityType: 'pitch_deck',
        operation: 'publish_all',
        entityId: deckId,
        summary: `Publish all draft slides on deck "${existing.title}" (${draftCount} draft${draftCount === 1 ? '' : 's'})`,
        payload: { deckId },
        apply: async () => {
          const [row0] = await db.select().from(pitchDecks)
            .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
          const current: PitchDeckSlideV2[] = Array.isArray(row0?.slides)
            ? (row0!.slides as PitchDeckSlideV2[])
            : [];
          const next = applyPublishAllToSlides(current);
          const [row] = await db.update(pitchDecks)
            .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
            .where(eq(pitchDecks.id, deckId)).returning(deckProjection(false));
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );
}

// ─── Slide-draft publish helpers ─────────────────────────────────────────────
// Pure functions over the slides array. Centralized so `decks_publish_slide`
// and `decks_publish_all` share identical logic.

function publishOneSlide(slide: PitchDeckSlideV2): PitchDeckSlideV2 | null {
  const draft = slide.draft;
  if (!draft) return slide;
  // Defensive: pendingCreate + pendingDelete simultaneously → drop the slide
  // (it was created and deleted before publish — net no-op).
  if (draft.pendingCreate && draft.pendingDelete) return null;
  if (draft.pendingDelete) return null;
  // pendingCreate or regular update — copy draft.* onto live fields.
  // `draft.blocks ?? slide.blocks` keeps live values when the draft omitted
  // that field (e.g. a notes-only edit).
  const next: PitchDeckSlideV2 = {
    ...slide,
    blocks: draft.blocks ?? slide.blocks,
    customCss: draft.customCss ?? slide.customCss,
    pageSettings: draft.pageSettings ?? slide.pageSettings,
    notes: draft.notes ?? slide.notes,
  };
  delete next.draft;
  return next;
}

function applyPublishToSlides(slides: PitchDeckSlideV2[], slideId: string): PitchDeckSlideV2[] {
  const out: PitchDeckSlideV2[] = [];
  for (const s of slides) {
    if (s.id !== slideId) {
      out.push(s);
      continue;
    }
    const published = publishOneSlide(s);
    if (published) out.push(published);
  }
  return out;
}

function applyPublishAllToSlides(slides: PitchDeckSlideV2[]): PitchDeckSlideV2[] {
  const out: PitchDeckSlideV2[] = [];
  for (const s of slides) {
    if (!s.draft) {
      out.push(s);
      continue;
    }
    const published = publishOneSlide(s);
    if (published) out.push(published);
  }
  return out;
}
