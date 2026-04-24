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
import { and, desc, eq } from 'drizzle-orm';
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
} from '@/lib/db/schema';
import type { PitchDeckSlideV2, ProposalSection, ProposalLineItem, ProposalFee } from '@/lib/db/schema';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { renderBlocksToEmailHtml } from '@/lib/email';
import { executeCampaignSend } from '@/lib/email/campaign-send';

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function denied(scope: string) {
  return {
    content: [{ type: 'text' as const, text: `Permission denied: this API key lacks the "${scope}" scope.` }],
    isError: true,
  };
}

function serializePostContent(args: { blocks?: unknown; content?: string }): string {
  if (Array.isArray(args.blocks) && args.blocks.length > 0) {
    return JSON.stringify({ blocks: args.blocks, version: '1.0' });
  }
  const raw = args.content ?? '';
  if (!raw.trim()) return JSON.stringify({ blocks: [], version: '1.0' });
  return JSON.stringify({
    blocks: [{ id: `block-${Date.now()}`, type: 'text', order: 0, content: raw }],
    version: '1.0',
  });
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
      const [existing] = await db.select({ id: pitchDecks.id }).from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      const slides = payload.slides as PitchDeckSlideV2[];
      const [row] = await db.update(pitchDecks)
        .set({ slides, formatVersion: 2, updatedAt: new Date() })
        .where(eq(pitchDecks.id, deckId)).returning();
      return row;
    }
    case 'pitch_deck_slides:add_slide': {
      const deckId = change.entityId!;
      const [existing] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!existing) throw new Error('Deck not found');
      const current = Array.isArray(existing.slides) ? (existing.slides as unknown[]) : [];
      const newSlide = {
        id: (payload.id as string | undefined) ?? `slide-${Date.now().toString(36)}`,
        label: payload.label as string,
        blocks: payload.blocks as unknown[],
        notes: payload.notes as string | undefined,
      };
      const next = [...current, newSlide] as PitchDeckSlideV2[];
      const [row] = await db.update(pitchDecks)
        .set({ slides: next, formatVersion: 2, updatedAt: new Date() })
        .where(eq(pitchDecks.id, deckId)).returning();
      return row;
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
        entityType: z.enum(['post', 'pitch_deck', 'pitch_deck_slides', 'proposal', 'email_campaign']).optional(),
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
