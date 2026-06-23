/**
 * MCP approval tools + apply-dispatcher for pending CMS changes.
 *
 * Staff-facing tools:
 *   - approvals_list
 *   - approvals_get
 *   - approvals_approve (re-runs the staged mutation)
 *   - approvals_reject
 *
 * All require the `approvals:manage` scope. A writer key with
 * `require_cms_approval=true` can create pending changes via the wrapped
 * CMS tools but cannot approve them — enforced by scope.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '@/lib/db';
import {
  mcpPendingChanges,
  posts,
  clientWebsites,
  pitchDecks,
  crmProposals,
  emailCampaigns,
  emailLists,
  siteNavigation,
  blockTemplates,
  blockTemplateUsages,
  categories,
  tags,
  postCategories,
  postTags,
  media,
} from '@/lib/db/schema';
import type {
  PitchDeckSlideV2,
  ProposalSection,
  ProposalLineItem,
  ProposalFee,
  SiteNavigationDraft,
  BlockTemplateDraft,
} from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { json, denied, serializePostContent } from '@/lib/mcp/types';
import { renderBlocksToEmailHtml } from '@/lib/email';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import { publishEntityFromDb } from '@/lib/realtime/internal-publisher';

/**
 * Per-slide publish helper. Mirrors `publishOneSlide` in
 * `lib/mcp/tools/pitch-decks.ts` — kept local to the apply file so the deck
 * tool and the approval dispatcher don't import each other.
 *
 *  - `pendingDelete` (and `pendingCreate && pendingDelete`) → drop the slide.
 *  - `pendingCreate` or regular update → copy `draft.{blocks,customCss,
 *    pageSettings,notes}` onto live fields and clear `draft`.
 */
function publishOneSlideDraft(slide: PitchDeckSlideV2): PitchDeckSlideV2 | null {
  const draft = slide.draft;
  if (!draft) return slide;
  if (draft.pendingCreate && draft.pendingDelete) return null;
  if (draft.pendingDelete) return null;
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

/**
 * Re-run a staged mutation. Returns the resulting row or throws.
 * The switch cases mirror the apply-closures in the wrapped CMS tools.
 */
export async function applyPendingChange(change: typeof mcpPendingChanges.$inferSelect, clientId: number, applierUserId: number) {
  const payload = change.payload as Record<string, unknown>;
  const key = `${change.entityType}:${change.operation}`;

  switch (key) {
    // ── POSTS ────────────────────────────────────────────────────────────
    case 'post:create': {
      const websiteId = payload.websiteId as number;
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Site not found');
      const [row] = await db.insert(posts).values({
        websiteId,
        title: payload.title as string,
        slug: payload.slug as string,
        content: serializePostContent({ blocks: payload.blocks, content: payload.content as string | undefined }),
        excerpt: (payload.excerpt as string | undefined) ?? null,
        postType: (payload.postType as string | undefined) ?? 'blog',
        published: (payload.published as boolean | undefined) ?? false,
        publishedAt: payload.published ? new Date() : null,
      }).returning();
      return row;
    }
    case 'post:update': {
      const id = change.entityId!;
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts).where(eq(posts.id, id)).limit(1);
      if (!post) throw new Error('Post not found');
      if (!post.websiteId) throw new Error('Permission denied — agency post');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Permission denied');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (payload.title !== undefined) patch.title = payload.title;
      if (payload.blocks !== undefined || payload.content !== undefined) {
        patch.content = serializePostContent({ blocks: payload.blocks, content: payload.content as string | undefined });
      }
      if (payload.excerpt !== undefined) patch.excerpt = payload.excerpt;
      if (payload.published !== undefined) {
        patch.published = payload.published;
        if (payload.published) patch.publishedAt = new Date();
      }
      const [row] = await db.update(posts).set(patch).where(eq(posts.id, id)).returning();
      return row;
    }
    case 'post:delete': {
      const id = change.entityId!;
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts).where(eq(posts.id, id)).limit(1);
      if (!post || !post.websiteId) throw new Error('Post not found or permission denied');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Permission denied');
      await db.delete(posts).where(eq(posts.id, id));
      return { success: true, id };
    }

    // ── AI TOOL CALLS ────────────────────────────────────────────────────
    // A deferred AI-chat write. The payload carries the tool name + its args;
    // we replay by re-running the same tool WITHOUT a gate ctx so it executes
    // for real this time. Dynamic import avoids a static cycle (portal-tools
    // imports pending-changes; approvals imports portal-tools).
    case 'ai_tool_call:execute': {
      const tool = payload.tool as string | undefined;
      if (!tool) throw new Error('ai_tool_call payload missing tool name');
      const toolInput = (payload.input ?? {}) as Record<string, unknown>;
      const { executePortalTool } = await import('@/lib/ai/portal-tools');
      return executePortalTool(tool, toolInput, clientId, applierUserId);
    }

    // ── PITCH DECKS ──────────────────────────────────────────────────────
    case 'pitch_deck:create': {
      const title = payload.title as string;
      const baseSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const theme = payload.theme as Record<string, string> | undefined;
      const [row] = await db.insert(pitchDecks).values({
        clientId,
        title: title.trim(),
        slug,
        description: (payload.description as string | undefined)?.trim() || null,
        sourceUrl: (payload.sourceUrl as string | undefined) ?? null,
        brandingProfileId: (payload.brandingProfileId as number | undefined) ?? null,
        theme: theme
          ? {
              primaryColor: theme.primaryColor ?? '#2563eb',
              accentColor: theme.accentColor ?? '#60a5fa',
              backgroundColor: theme.backgroundColor ?? '#0f172a',
              textColor: theme.textColor ?? '#f8fafc',
              headingFont: theme.headingFont ?? 'Inter',
              bodyFont: theme.bodyFont ?? 'Inter',
              logo: theme.logo,
            }
          : undefined,
        formatVersion: 2,
        slides: [],
        createdBy: applierUserId,
      }).returning();
      return row;
    }
    case 'pitch_deck:update': {
      const id = change.entityId!;
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (payload.title !== undefined) patch.title = (payload.title as string).trim();
      if (payload.description !== undefined) patch.description = (payload.description as string | null)?.toString().trim() || null;
      if (payload.status !== undefined) patch.status = payload.status;
      if (payload.theme !== undefined) patch.theme = { ...existing.theme, ...(payload.theme as object) };
      if (payload.slug !== undefined) patch.slug = (payload.slug as string).trim();
      const [row] = await db.update(pitchDecks).set(patch).where(eq(pitchDecks.id, id)).returning();
      return row;
    }
    case 'pitch_deck:delete': {
      const id = change.entityId!;
      const [existing] = await db.select({ id: pitchDecks.id }).from(pitchDecks)
        .where(and(eq(pitchDecks.id, id), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      await db.delete(pitchDecks).where(eq(pitchDecks.id, id));
      return { success: true, id };
    }
    case 'pitch_deck_slides:replace_slides': {
      const deckId = change.entityId!;
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      const incomingSlides = (payload.slides as Array<{
        id: string;
        label: string;
        blocks: unknown[];
        notes?: string;
        pageSettings?: import('@/types/blocks').PageSettings;
        customCss?: string;
      }>) ?? [];
      const liveSlides: PitchDeckSlideV2[] = Array.isArray(existing.slides)
        ? (existing.slides as PitchDeckSlideV2[])
        : [];
      const liveById = new Map(liveSlides.map((s) => [s.id, s]));
      const incomingIds = new Set(incomingSlides.map((s) => s.id));
      const nowIso = new Date().toISOString();

      const next: PitchDeckSlideV2[] = [];
      for (const incoming of incomingSlides) {
        const live = liveById.get(incoming.id);
        if (live) {
          next.push({
            ...live,
            label: incoming.label,
            draft: {
              ...(live.draft ?? {}),
              blocks: incoming.blocks as import('@/types/blocks').Block[],
              customCss: incoming.customCss,
              pageSettings: incoming.pageSettings,
              notes: incoming.notes,
              updatedAt: nowIso,
              updatedBy: applierUserId,
              pendingCreate: live.draft?.pendingCreate ?? undefined,
              pendingDelete: undefined,
            },
          });
        } else {
          next.push({
            id: incoming.id,
            label: incoming.label,
            blocks: [],
            draft: {
              pendingCreate: true,
              blocks: incoming.blocks as import('@/types/blocks').Block[],
              customCss: incoming.customCss,
              pageSettings: incoming.pageSettings,
              notes: incoming.notes,
              updatedAt: nowIso,
              updatedBy: applierUserId,
            },
          });
        }
      }
      for (const live of liveSlides) {
        if (!incomingIds.has(live.id)) {
          next.push({
            ...live,
            draft: {
              ...(live.draft ?? {}),
              pendingDelete: true,
              updatedAt: nowIso,
              updatedBy: applierUserId,
            },
          });
        }
      }
      const [row] = await db.update(pitchDecks)
        .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
        .where(eq(pitchDecks.id, deckId)).returning();
      return row;
    }
    case 'pitch_deck_slides:add_slide': {
      const deckId = change.entityId!;
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      const current: PitchDeckSlideV2[] = Array.isArray(existing.slides)
        ? (existing.slides as PitchDeckSlideV2[])
        : [];
      const nowIso = new Date().toISOString();
      const newSlide: PitchDeckSlideV2 = {
        id: (payload.id as string | undefined) ?? `slide-${Date.now().toString(36)}`,
        label: payload.label as string,
        blocks: [],
        draft: {
          pendingCreate: true,
          blocks: (payload.blocks as import('@/types/blocks').Block[] | undefined) ?? [],
          customCss: payload.customCss as string | undefined,
          pageSettings: payload.pageSettings as import('@/types/blocks').PageSettings | undefined,
          notes: payload.notes as string | undefined,
          updatedAt: nowIso,
          updatedBy: applierUserId,
        },
      };
      const next = [...current, newSlide];
      const [row] = await db.update(pitchDecks)
        .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
        .where(eq(pitchDecks.id, deckId)).returning();
      return row;
    }

    case 'pitch_deck:upload_html': {
      // Re-runs decks_upload_html.apply — uploads to S3, inserts media row,
      // creates a new deck with a single html-embed slide (pendingCreate).
      // The original payload only persisted filename/title/byteLength because
      // the base64 body is large; we can't re-fetch the bytes, so we require
      // a re-submission via a fresh upload. Fail loudly.
      const filename = payload.filename as string | undefined;
      const contentBase64 = payload.contentBase64 as string | undefined;
      if (!filename || !contentBase64) {
        throw new Error(
          'Cannot replay pitch_deck:upload_html — original base64 payload was not retained. Re-run the upload after rejecting this pending change.',
        );
      }
      let buffer: Buffer;
      try {
        buffer = Buffer.from(contentBase64, 'base64');
      } catch {
        throw new Error('Invalid base64 content');
      }
      const MAX_HTML_SIZE = 1_000_000;
      if (buffer.byteLength === 0) throw new Error('Empty file');
      if (buffer.byteLength > MAX_HTML_SIZE) {
        throw new Error(`File exceeds ${MAX_HTML_SIZE} bytes`);
      }
      const uploadResult = await uploadToS3(buffer, filename, 'text/html');
      await db.insert(media).values({
        filename,
        storedFilename: uploadResult.storedFilename,
        mimeType: 'text/html',
        fileSize: uploadResult.fileSize,
        url: uploadResult.url,
        uploadedBy: applierUserId,
        clientId,
      });
      const filenameNoExt = filename.replace(/\.[^.]+$/, '');
      const titleArg = payload.title as string | undefined;
      const deckTitle = titleArg?.trim() || filenameNoExt || 'Uploaded HTML Deck';
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
          } as import('@/types/blocks').Block,
        ],
      };
      const [deck] = await db.insert(pitchDecks).values({
        clientId,
        title: deckTitle,
        slug,
        description: null,
        slides: [slide],
        formatVersion: 2,
        theme: {
          primaryColor: '#2563eb',
          accentColor: '#60a5fa',
          backgroundColor: '#0f172a',
          textColor: '#f8fafc',
          headingFont: 'Inter',
          bodyFont: 'Inter',
          showSlideNumber: false,
        },
        createdBy: applierUserId,
      }).returning();
      return { ...deck, url: uploadResult.url };
    }
    case 'pitch_deck:publish_all': {
      const deckId = change.entityId!;
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      const current: PitchDeckSlideV2[] = Array.isArray(existing.slides)
        ? (existing.slides as PitchDeckSlideV2[])
        : [];
      const next: PitchDeckSlideV2[] = [];
      for (const slide of current) {
        const published = publishOneSlideDraft(slide);
        if (published) next.push(published);
      }
      const [row] = await db.update(pitchDecks)
        .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
        .where(eq(pitchDecks.id, deckId)).returning();
      return row;
    }
    case 'pitch_deck_slide_draft:publish': {
      const deckId = (payload.deckId as number | undefined) ?? change.entityId!;
      const slideId = payload.slideId as string;
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      const current: PitchDeckSlideV2[] = Array.isArray(existing.slides)
        ? (existing.slides as PitchDeckSlideV2[])
        : [];
      const next: PitchDeckSlideV2[] = [];
      for (const slide of current) {
        if (slide.id !== slideId) {
          next.push(slide);
          continue;
        }
        const published = publishOneSlideDraft(slide);
        if (published) next.push(published);
      }
      const [row] = await db.update(pitchDecks)
        .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
        .where(eq(pitchDecks.id, deckId)).returning();
      return row;
    }

    // ── SITES ────────────────────────────────────────────────────────────
    case 'site:update': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Site not found');
      const customCodeWrite =
        Object.prototype.hasOwnProperty.call(payload, 'customCss') ||
        Object.prototype.hasOwnProperty.call(payload, 'customJs');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (customCodeWrite) {
        patch.draftUpdatedAt = new Date();
        patch.draftUpdatedBy = applierUserId;
        if (payload.customCss !== undefined) {
          patch.draftCustomCss = payload.customCss === '' ? null : payload.customCss;
        }
        if (payload.customJs !== undefined) {
          patch.draftCustomJs = payload.customJs === '' ? null : payload.customJs;
        }
      } else {
        for (const field of [
          'name', 'domain', 'description', 'active', 'publicAccess', 'brandingProfileId',
        ] as const) {
          if (payload[field] !== undefined) patch[field] = payload[field];
        }
      }
      const [row] = await db.update(clientWebsites).set(patch)
        .where(eq(clientWebsites.id, id)).returning();
      return row;
    }
    case 'site:publish': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Site not found');
      const [row] = await db.update(clientWebsites).set({
        customCss: existing.draftCustomCss,
        customJs: existing.draftCustomJs,
        draftCustomCss: null,
        draftCustomJs: null,
        draftUpdatedAt: null,
        draftUpdatedBy: null,
        updatedAt: new Date(),
      }).where(eq(clientWebsites.id, id)).returning();
      return row;
    }

    // ── SITE NAVIGATION ──────────────────────────────────────────────────
    case 'site_nav:create': {
      const websiteId = payload.websiteId as number;
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Site not found');
      const existing = await db.select({ id: siteNavigation.id }).from(siteNavigation)
        .where(eq(siteNavigation.websiteId, websiteId));
      const sortOrder = (payload.sortOrder as number | undefined) ?? existing.length;
      const draft: SiteNavigationDraft = {
        pendingCreate: true,
        label: payload.label as string,
        href: payload.href as string,
        parentId: (payload.parentId as number | undefined) ?? null,
        sortOrder,
        openInNewTab: (payload.openInNewTab as boolean | undefined) ?? false,
        isButton: (payload.isButton as boolean | undefined) ?? false,
        description: (payload.description as string | undefined) ?? null,
        icon: (payload.icon as string | undefined) ?? null,
        updatedAt: new Date().toISOString(),
        updatedBy: applierUserId,
      };
      const [row] = await db.insert(siteNavigation).values({
        websiteId,
        label: payload.label as string,
        href: payload.href as string,
        parentId: (payload.parentId as number | undefined) ?? null,
        sortOrder,
        openInNewTab: (payload.openInNewTab as boolean | undefined) ?? false,
        isButton: (payload.isButton as boolean | undefined) ?? false,
        description: (payload.description as string | undefined) ?? null,
        icon: (payload.icon as string | undefined) ?? null,
        draft,
      }).returning();
      return row;
    }
    case 'site_nav:update': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [nav] = await db
        .select({
          id: siteNavigation.id,
          websiteId: siteNavigation.websiteId,
          draft: siteNavigation.draft,
        })
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) throw new Error('Nav item not found');
      const prev: SiteNavigationDraft = nav.draft ?? {};
      const next: SiteNavigationDraft = {
        ...prev,
        updatedAt: new Date().toISOString(),
        updatedBy: applierUserId,
      };
      for (const [k, v] of Object.entries(payload)) {
        if (k === 'id') continue;
        if (v !== undefined) (next as Record<string, unknown>)[k] = v;
      }
      const [row] = await db.update(siteNavigation)
        .set({ draft: next, updatedAt: new Date() })
        .where(eq(siteNavigation.id, id)).returning();
      return row;
    }
    case 'site_nav:delete': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [nav] = await db
        .select({ id: siteNavigation.id, draft: siteNavigation.draft })
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) throw new Error('Nav item not found');
      const prev: SiteNavigationDraft = nav.draft ?? {};
      const next: SiteNavigationDraft = {
        ...prev,
        pendingDelete: true,
        updatedAt: new Date().toISOString(),
        updatedBy: applierUserId,
      };
      await db.update(siteNavigation)
        .set({ draft: next, updatedAt: new Date() })
        .where(eq(siteNavigation.id, id));
      return { success: true, id, pendingDelete: true };
    }
    case 'site_nav:publish': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [nav] = await db
        .select()
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) throw new Error('Nav item not found');
      const navRow = nav.site_navigation;
      const draft: SiteNavigationDraft | null = navRow.draft;
      if (!draft) return { success: true, id, noop: true };
      if (draft.pendingDelete) {
        await db.delete(siteNavigation).where(eq(siteNavigation.id, id));
        return { success: true, id, deleted: true };
      }
      const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
      if (draft.label !== undefined) patch.label = draft.label;
      if (draft.href !== undefined) patch.href = draft.href;
      if (draft.parentId !== undefined) patch.parentId = draft.parentId;
      if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
      if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
      if (draft.isButton !== undefined) patch.isButton = draft.isButton;
      if (draft.description !== undefined) patch.description = draft.description;
      if (draft.icon !== undefined) patch.icon = draft.icon;
      if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
      if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;
      const [row] = await db.update(siteNavigation).set(patch)
        .where(eq(siteNavigation.id, id)).returning();
      return row;
    }
    case 'site_nav:publish_all': {
      const websiteId = payload.websiteId as number;
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Site not found');
      const drafts = await db.select().from(siteNavigation)
        .where(and(
          eq(siteNavigation.websiteId, websiteId),
          sql`${siteNavigation.draft} IS NOT NULL`,
        ));
      let published = 0;
      for (const navRow of drafts) {
        const draft: SiteNavigationDraft | null = navRow.draft;
        if (!draft) continue;
        if (draft.pendingDelete) {
          await db.delete(siteNavigation).where(eq(siteNavigation.id, navRow.id));
          published += 1;
          continue;
        }
        const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
        if (draft.label !== undefined) patch.label = draft.label;
        if (draft.href !== undefined) patch.href = draft.href;
        if (draft.parentId !== undefined) patch.parentId = draft.parentId;
        if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
        if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
        if (draft.isButton !== undefined) patch.isButton = draft.isButton;
        if (draft.description !== undefined) patch.description = draft.description;
        if (draft.icon !== undefined) patch.icon = draft.icon;
        if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
        if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;
        await db.update(siteNavigation).set(patch).where(eq(siteNavigation.id, navRow.id));
        published += 1;
      }
      return { websiteId, published };
    }

    // ── BLOCK TEMPLATES ──────────────────────────────────────────────────
    case 'block_template:create': {
      const draft: BlockTemplateDraft = {
        name: payload.name as string,
        description: (payload.description as string | undefined) ?? null,
        category: (payload.category as string | undefined) ?? 'custom',
        scope: (payload.scope as string | undefined) ?? 'block',
        blocks: payload.blocks,
        thumbnail: (payload.thumbnail as string | undefined) ?? null,
        tags: (payload.tags as string[] | undefined) ?? [],
        lockedFields: (payload.lockedFields as string[] | undefined) ?? [],
        updatedAt: new Date().toISOString(),
        updatedBy: applierUserId,
      };
      // Mirror the create tool: also flag pendingCreate on the draft so the
      // picker hides the template until publish.
      (draft as BlockTemplateDraft & { pendingCreate: boolean }).pendingCreate = true;
      const [row] = await db.insert(blockTemplates).values({
        name: payload.name as string,
        slug: payload.slug as string,
        description: (payload.description as string | undefined) ?? null,
        category: (payload.category as string | undefined) ?? 'custom',
        scope: (payload.scope as string | undefined) ?? 'block',
        blocks: payload.blocks,
        thumbnail: (payload.thumbnail as string | undefined) ?? null,
        tags: (payload.tags as string[] | undefined) ?? [],
        lockedFields: (payload.lockedFields as string[] | undefined) ?? [],
        createdBy: applierUserId,
        draft,
      }).returning();
      return row;
    }
    case 'block_template:update': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) throw new Error('Template not found');
      const prev: BlockTemplateDraft = existing.draft ?? {};
      const next: BlockTemplateDraft = {
        ...prev,
        updatedAt: new Date().toISOString(),
        updatedBy: applierUserId,
      };
      for (const [k, v] of Object.entries(payload)) {
        if (k === 'id') continue;
        if (v !== undefined) (next as Record<string, unknown>)[k] = v;
      }
      const [row] = await db.update(blockTemplates)
        .set({ draft: next, updatedAt: new Date() })
        .where(eq(blockTemplates.id, id)).returning();
      return row;
    }
    case 'block_template:delete': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) throw new Error('Template not found');
      const usages = await db.select({ id: blockTemplateUsages.id }).from(blockTemplateUsages)
        .where(eq(blockTemplateUsages.templateId, id));
      if (usages.length > 0) {
        throw new Error(`Cannot delete: template is used in ${usages.length} post(s). Remove usages first or convert to non-global.`);
      }
      const prev: BlockTemplateDraft = existing.draft ?? {};
      const next: BlockTemplateDraft = {
        ...prev,
        pendingDelete: true,
        updatedAt: new Date().toISOString(),
        updatedBy: applierUserId,
      };
      await db.update(blockTemplates)
        .set({ draft: next, updatedAt: new Date() })
        .where(eq(blockTemplates.id, id));
      return { success: true, id, pendingDelete: true };
    }
    case 'block_template:publish': {
      const id = (payload.id as number | undefined) ?? change.entityId!;
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) throw new Error('Template not found');
      const draft: BlockTemplateDraft | null = existing.draft;
      if (!draft) return { success: true, id, noop: true };
      if (draft.pendingDelete) {
        // Re-check usage at apply time — a usage could have been created
        // between the stage and the approve.
        const usages = await db.select({ id: blockTemplateUsages.id }).from(blockTemplateUsages)
          .where(eq(blockTemplateUsages.templateId, id));
        if (usages.length > 0) {
          throw new Error(`Cannot delete: template is used in ${usages.length} post(s). Remove usages first or convert to non-global.`);
        }
        await db.delete(blockTemplates).where(eq(blockTemplates.id, id));
        return { success: true, id, deleted: true };
      }
      const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
      if (draft.name !== undefined) patch.name = draft.name;
      if (draft.description !== undefined) patch.description = draft.description;
      if (draft.category !== undefined) patch.category = draft.category;
      if (draft.scope !== undefined) patch.scope = draft.scope;
      if (draft.thumbnail !== undefined) patch.thumbnail = draft.thumbnail;
      if (draft.tags !== undefined) patch.tags = draft.tags;
      if (draft.lockedFields !== undefined) patch.lockedFields = draft.lockedFields;
      if (draft.blocks !== undefined) {
        patch.blocks = draft.blocks;
        patch.version = existing.version + 1;
      }
      const [row] = await db.update(blockTemplates).set(patch)
        .where(eq(blockTemplates.id, id)).returning();
      return row;
    }

    // ── TAXONOMIES ───────────────────────────────────────────────────────
    case 'taxonomy:create': {
      // The wrapped tools stage with `kind: 'category' | 'tag'` to discriminate
      // (see taxonomies_create_category / taxonomies_create_tag).
      const kind = payload.kind as 'category' | 'tag' | undefined;
      const websiteId = payload.websiteId as number;
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Site not found');
      if (kind === 'tag') {
        try {
          const [row] = await db.insert(tags).values({
            websiteId,
            name: (payload.name as string).trim(),
            slug: payload.slug as string,
          }).returning();
          return row;
        } catch (err) {
          throw new Error(`Could not create tag (likely duplicate slug): ${(err as Error).message}`);
        }
      }
      // Default to category when `kind` is omitted (defensive — the wrapped
      // tool always sends it, but older queued payloads may not).
      try {
        const [row] = await db.insert(categories).values({
          websiteId,
          name: (payload.name as string).trim(),
          slug: payload.slug as string,
          description: (payload.description as string | undefined) ?? null,
          color: (payload.color as string | undefined) ?? null,
        }).returning();
        return row;
      } catch (err) {
        throw new Error(`Could not create category (likely duplicate slug): ${(err as Error).message}`);
      }
    }
    case 'post_taxonomy:update': {
      const postId = (payload.postId as number | undefined) ?? change.entityId!;
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts)
        .where(eq(posts.id, postId)).limit(1);
      if (!post) throw new Error('Post not found');
      if (!post.websiteId) throw new Error('Permission denied — agency post');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Permission denied');
      const categoryIds = payload.categoryIds as number[] | undefined;
      const tagIds = payload.tagIds as number[] | undefined;
      if (categoryIds !== undefined) {
        await db.delete(postCategories).where(eq(postCategories.postId, postId));
        if (categoryIds.length > 0) {
          await db.insert(postCategories).values(categoryIds.map((cid) => ({ postId, categoryId: cid })));
        }
      }
      if (tagIds !== undefined) {
        await db.delete(postTags).where(eq(postTags.postId, postId));
        if (tagIds.length > 0) {
          await db.insert(postTags).values(tagIds.map((tid) => ({ postId, tagId: tid })));
        }
      }
      const assignedCats = await db.select({ categoryId: postCategories.categoryId })
        .from(postCategories).where(eq(postCategories.postId, postId));
      const assignedTags = await db.select({ tagId: postTags.tagId })
        .from(postTags).where(eq(postTags.postId, postId));
      return {
        postId,
        categoryIds: assignedCats.map((r) => r.categoryId),
        tagIds: assignedTags.map((r) => r.tagId),
      };
    }
    case 'post:upload_html': {
      // Same retention caveat as pitch_deck:upload_html — the base64 body is
      // captured in the staged payload by the wrapped tool, so we can replay.
      const websiteId = payload.websiteId as number;
      const filename = payload.filename as string;
      const contentBase64 = payload.contentBase64 as string | undefined;
      const sourceUrl = payload.sourceUrl as string | undefined;
      if (!filename || !contentBase64) {
        throw new Error(
          'Cannot replay post:upload_html — original base64 payload was not retained. Re-run the upload after rejecting this pending change.',
        );
      }
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) throw new Error('Site not found');
      let rawBuffer: Buffer;
      try {
        rawBuffer = Buffer.from(contentBase64, 'base64');
      } catch {
        throw new Error('Invalid base64 content');
      }
      const MAX_HTML_SIZE = 1_000_000;
      if (rawBuffer.byteLength === 0) throw new Error('Empty file');
      if (rawBuffer.byteLength > MAX_HTML_SIZE) {
        throw new Error(`File exceeds ${MAX_HTML_SIZE} bytes`);
      }
      const cleaned = cleanEmbedHtml(rawBuffer.toString('utf8'));
      const imported = await importHtmlAssets(cleaned, {
        websiteId: site.id,
        clientId,
        uploadedBy: applierUserId,
        baseUrl: sourceUrl,
      });
      const buffer = Buffer.from(imported.html, 'utf8');
      const uploadResult = await uploadToS3(buffer, filename, 'text/html');
      await db.insert(media).values({
        filename,
        storedFilename: uploadResult.storedFilename,
        mimeType: 'text/html',
        fileSize: uploadResult.fileSize,
        url: uploadResult.url,
        uploadedBy: applierUserId,
        clientId,
        websiteId: site.id,
      });
      const baseSlug = (filename.trim().toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 80)) || 'page';
      let slug = baseSlug;
      for (let i = 2; i < 100; i++) {
        const [collision] = await db.select({ id: posts.id }).from(posts)
          .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id))).limit(1);
        if (!collision) break;
        slug = `${baseSlug}-${i}`;
      }
      const filenameNoExt = filename.replace(/\.[^.]+$/, '');
      const ts = Date.now();
      const uploadedBlocks = [
        {
          id: `block-${ts}-html`,
          type: 'html-embed' as const,
          order: 1,
          url: uploadResult.url,
          filename,
          height: '100vh',
          width: 'full' as const,
          sandbox: 'scripts',
          iframeTitle: filenameNoExt,
        },
      ];
      const blockContent = JSON.stringify({ blocks: uploadedBlocks });
      const [post] = await db.insert(posts).values({
        title: filenameNoExt || 'Uploaded HTML',
        slug,
        postType: 'page',
        content: blockContent,
        published: false,
        websiteId: site.id,
      }).returning();
      return {
        ...post,
        importedAssets: imported.importedCount,
        skippedAssets: imported.skippedCount,
        url: uploadResult.url,
      };
    }

    // ── PROPOSALS ────────────────────────────────────────────────────────
    case 'proposal:create': {
      const [row] = await db.insert(crmProposals).values({
        clientId,
        title: (payload.title as string).trim(),
        summary: (payload.summary as string | undefined) ?? null,
        contactId: (payload.contactId as number | undefined) ?? null,
        companyId: (payload.companyId as number | undefined) ?? null,
        dealId: (payload.dealId as number | undefined) ?? null,
        sections: ((payload.sections as ProposalSection[] | undefined) ?? []) as ProposalSection[],
        lineItems: ((payload.lineItems as ProposalLineItem[] | undefined) ?? []) as ProposalLineItem[],
        fees: ((payload.fees as ProposalFee[] | undefined) ?? []) as ProposalFee[],
        currency: (payload.currency as string | undefined) ?? 'USD',
        validUntil: payload.validUntil ? new Date(payload.validUntil as string) : null,
        clientToken: crypto.randomBytes(32).toString('hex'),
        accentColor: (payload.accentColor as string | undefined) ?? '#2563eb',
        logoUrl: (payload.logoUrl as string | undefined) ?? null,
        coverImageUrl: (payload.coverImageUrl as string | undefined) ?? null,
        footerText: (payload.footerText as string | undefined) ?? null,
        createdBy: applierUserId,
      }).returning();
      return row;
    }
    case 'proposal:update': {
      const id = change.entityId!;
      const [existing] = await db.select().from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Proposal not found');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const field of [
        'title', 'summary', 'status', 'contactId', 'companyId', 'dealId',
        'currency', 'declineReason', 'accentColor', 'logoUrl', 'coverImageUrl', 'footerText',
      ] as const) {
        if (payload[field] !== undefined) patch[field] = payload[field];
      }
      if (payload.sections !== undefined) patch.sections = payload.sections as ProposalSection[];
      if (payload.lineItems !== undefined) patch.lineItems = payload.lineItems as ProposalLineItem[];
      if (payload.fees !== undefined) patch.fees = payload.fees as ProposalFee[];
      if (payload.validUntil !== undefined) patch.validUntil = payload.validUntil ? new Date(payload.validUntil as string) : null;
      if (payload.status === 'accepted' && existing.status !== 'accepted') patch.acceptedAt = new Date();
      if (payload.status === 'declined' && existing.status !== 'declined') patch.declinedAt = new Date();
      const [row] = await db.update(crmProposals).set(patch).where(eq(crmProposals.id, id)).returning();
      return row;
    }
    case 'proposal:send': {
      const id = change.entityId!;
      const [existing] = await db.select({ id: crmProposals.id, status: crmProposals.status })
        .from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Proposal not found');
      if (existing.status !== 'draft') throw new Error(`Cannot send — status is ${existing.status}`);
      const [row] = await db.update(crmProposals)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(crmProposals.id, id)).returning();
      return row;
    }

    // ── EMAIL CAMPAIGNS ──────────────────────────────────────────────────
    case 'email_campaign:create': {
      const listId = payload.listId as number;
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) throw new Error('List not found');
      let finalHtml = ((payload.htmlContent as string | undefined) ?? '').trim();
      let blockContent: { blocks: unknown[] } | null = null;
      const blocks = payload.blocks as unknown[] | undefined;
      if (Array.isArray(blocks) && blocks.length > 0) {
        blockContent = { blocks };
        finalHtml = renderBlocksToEmailHtml(blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
      }
      if (!finalHtml) throw new Error('Provide htmlContent or non-empty blocks');
      const [row] = await db.insert(emailCampaigns).values({
        name: (payload.name as string).trim(),
        subject: (payload.subject as string).trim(),
        previewText: (payload.previewText as string | undefined)?.trim() || null,
        fromName: (payload.fromName as string).trim(),
        fromEmail: (payload.fromEmail as string).trim(),
        replyTo: (payload.replyTo as string | undefined)?.trim() || null,
        listId,
        clientId,
        htmlContent: finalHtml,
        blockContent,
        status: 'draft',
        createdBy: applierUserId,
      }).returning();
      return row;
    }
    case 'email_campaign:update': {
      const id = change.entityId!;
      const [existing] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Campaign not found');
      if (existing.status !== 'draft') throw new Error(`Cannot edit — status is ${existing.status}`);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const field of ['name', 'subject', 'previewText', 'fromName', 'fromEmail', 'replyTo', 'listId', 'htmlContent'] as const) {
        if (payload[field] !== undefined) patch[field] = payload[field];
      }
      const blocks = payload.blocks as unknown[] | undefined;
      if (Array.isArray(blocks) && blocks.length > 0) {
        patch.blockContent = { blocks };
        patch.htmlContent = renderBlocksToEmailHtml(blocks as Parameters<typeof renderBlocksToEmailHtml>[0]);
      }
      const [row] = await db.update(emailCampaigns).set(patch).where(eq(emailCampaigns.id, id)).returning();
      return row;
    }
    case 'email_campaign:send': {
      const id = change.entityId!;
      const [campaign] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!campaign) throw new Error('Campaign not found');
      if (campaign.status === 'sent' || campaign.status === 'sending') {
        throw new Error(`Campaign is already ${campaign.status}`);
      }
      return await executeCampaignSend(id, campaign);
    }

    case 'email_campaign:delete': {
      const id = change.entityId!;
      const [existing] = await db.select({ id: emailCampaigns.id, status: emailCampaigns.status })
        .from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Campaign not found');
      if (existing.status === 'sent' || existing.status === 'sending') {
        throw new Error(`Cannot delete a campaign in status ${existing.status}`);
      }
      await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
      return { success: true, id };
    }

    default:
      throw new Error(`No apply handler for ${key}`);
  }
}

export function registerApprovalToolsOnSdk(server: McpServer, ctx: PortalMcpContext) {
  const clientId = ctx.client.id;
  const readGate = () => (hasScope(ctx.scopes, 'approvals:read') ? null : denied('approvals:read'));
  const manageGate = () => (hasScope(ctx.scopes, 'approvals:manage') ? null : denied('approvals:manage'));

  hasScope(ctx.scopes, 'approvals:read') && server.registerTool(
    'approvals_list',
    {
      title: 'List pending MCP changes',
      description: 'List staged MCP writes awaiting review. Filter by status or entity type.',
      inputSchema: {
        status: z.enum(['pending', 'approved', 'rejected', 'applied', 'failed']).optional(),
        entityType: z.enum([
          'post',
          'pitch_deck',
          'pitch_deck_slides',
          'pitch_deck_slide_draft',
          'proposal',
          'email_campaign',
          'site',
          'site_nav',
          'block_template',
          'taxonomy',
          'post_taxonomy',
        ]).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, entityType, limit = 50 }) => {
      const blocked = readGate(); if (blocked) return blocked;
      const conds = [eq(mcpPendingChanges.clientId, clientId)];
      if (status) conds.push(eq(mcpPendingChanges.status, status));
      if (entityType) conds.push(eq(mcpPendingChanges.entityType, entityType));
      const rows = await db.select({
        id: mcpPendingChanges.id,
        entityType: mcpPendingChanges.entityType,
        entityId: mcpPendingChanges.entityId,
        operation: mcpPendingChanges.operation,
        summary: mcpPendingChanges.summary,
        status: mcpPendingChanges.status,
        keyId: mcpPendingChanges.keyId,
        userId: mcpPendingChanges.userId,
        reviewerId: mcpPendingChanges.reviewerId,
        reviewedAt: mcpPendingChanges.reviewedAt,
        appliedAt: mcpPendingChanges.appliedAt,
        errorMessage: mcpPendingChanges.errorMessage,
        createdAt: mcpPendingChanges.createdAt,
      }).from(mcpPendingChanges)
        .where(and(...conds))
        .orderBy(desc(mcpPendingChanges.createdAt)).limit(limit);
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'approvals:read') && server.registerTool(
    'approvals_get',
    {
      title: 'Get pending change with payload + diff',
      description: 'Full detail of a pending change including payload and original snapshot (for review).',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      const blocked = readGate(); if (blocked) return blocked;
      const [row] = await db.select().from(mcpPendingChanges)
        .where(and(eq(mcpPendingChanges.id, id), eq(mcpPendingChanges.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Pending change not found' });
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'approvals:manage') && server.registerTool(
    'approvals_approve',
    {
      title: 'Approve & apply pending MCP change',
      description:
        'Apply a pending MCP-staged write. Re-runs the original mutation with the stored payload, marks status=applied. If the apply fails, marks status=failed with errorMessage.',
      inputSchema: {
        id: z.number(),
        note: z.string().optional().describe('Optional review note recorded on the change.'),
      },
    },
    async ({ id, note }) => {
      const blocked = manageGate(); if (blocked) return blocked;
      const [change] = await db.select().from(mcpPendingChanges)
        .where(and(eq(mcpPendingChanges.id, id), eq(mcpPendingChanges.clientId, clientId))).limit(1);
      if (!change) return json({ error: 'Pending change not found' });
      if (change.status !== 'pending') return json({ error: `Cannot approve — status is ${change.status}` });
      try {
        const result = await applyPendingChange(change, clientId, ctx.userId);
        const [row] = await db.update(mcpPendingChanges)
          .set({
            status: 'applied',
            reviewerId: ctx.userId,
            reviewedAt: new Date(),
            reviewNote: note ?? null,
            appliedAt: new Date(),
          })
          .where(eq(mcpPendingChanges.id, id)).returning();
        try { revalidatePath('/portal', 'layout'); } catch { /* ignore */ }
        // Fan out to any open editors. The applied row may have a fresh id
        // (create) or match `change.entityId` (update). Prefer the apply
        // result's id when present. Fire-and-forget — never block approve.
        const realtimeEntityId =
          (result && typeof result === 'object' && 'id' in result &&
            (typeof (result as { id: unknown }).id === 'number' ||
              typeof (result as { id: unknown }).id === 'string'))
            ? (result as { id: number | string }).id
            : change.entityId;
        void publishEntityFromDb({
          entityType: change.entityType,
          entityId: realtimeEntityId,
        }).catch((err) => {
          console.warn('[mcp/approvals] realtime publish failed:', err);
        });
        return json({ change: row, result });
      } catch (err) {
        const msg = (err as Error).message;
        await db.update(mcpPendingChanges)
          .set({
            status: 'failed',
            reviewerId: ctx.userId,
            reviewedAt: new Date(),
            reviewNote: note ?? null,
            errorMessage: msg,
          })
          .where(eq(mcpPendingChanges.id, id));
        return json({ error: `Apply failed: ${msg}` });
      }
    },
  );

  hasScope(ctx.scopes, 'approvals:manage') && server.registerTool(
    'approvals_reject',
    {
      title: 'Reject pending MCP change',
      description: 'Mark a pending change as rejected. The staged mutation is NOT applied.',
      inputSchema: {
        id: z.number(),
        note: z.string().optional().describe('Reason shown to the original submitter.'),
      },
    },
    async ({ id, note }) => {
      const blocked = manageGate(); if (blocked) return blocked;
      const [change] = await db.select({ id: mcpPendingChanges.id, status: mcpPendingChanges.status })
        .from(mcpPendingChanges)
        .where(and(eq(mcpPendingChanges.id, id), eq(mcpPendingChanges.clientId, clientId))).limit(1);
      if (!change) return json({ error: 'Pending change not found' });
      if (change.status !== 'pending') return json({ error: `Cannot reject — status is ${change.status}` });
      const [row] = await db.update(mcpPendingChanges)
        .set({
          status: 'rejected',
          reviewerId: ctx.userId,
          reviewedAt: new Date(),
          reviewNote: note ?? null,
        })
        .where(eq(mcpPendingChanges.id, id)).returning();
      return json(row);
    },
  );
}
