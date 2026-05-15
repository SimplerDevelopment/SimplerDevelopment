/**
 * Public approval page — non-authenticated reviewer flow for MCP-authored
 * drafts. URL shape: /approve/<64-hex-token>. The token is the only
 * credential; everything else is loaded server-side and scoped by the link's
 * clientId.
 *
 * Renders four entity shapes in their own preview style:
 *   - post           → blocks via BlockRenderer
 *   - block_template → draft.blocks (or live blocks) via BlockRenderer
 *   - pitch_deck     → slide-by-slide block render
 *   - email_campaign → iframe srcDoc with htmlContent
 *
 * For pending_change links (linkType='pending_change'), there's no fully
 * materialized entity yet — we render the payload as a JSON summary and
 * the staff can approve in confidence that the staged mutation is correct.
 */

import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import {
  posts,
  pitchDecks,
  emailCampaigns,
  blockTemplates,
  mcpPendingChanges,
} from '@/lib/db/schema';
import type {
  BlockTemplateDraft,
  PitchDeckSlideV2,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { lookupApprovalLink } from '@/lib/mcp/approval-links';
import { ApprovalReviewer, type ApprovalEntityPreview } from './ApprovalReviewer';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ApprovalPage({ params }: PageProps) {
  const { token } = await params;
  const link = await lookupApprovalLink(token);
  if (!link) notFound();

  const preview = await loadPreview(link.clientId, link.linkType, link.entityType, link.entityId, link.pendingChangeId);

  return (
    <ApprovalReviewer
      token={link.token}
      linkType={link.linkType}
      entityType={link.entityType}
      status={link.status}
      summary={link.summary}
      reviewerName={link.reviewerName}
      reviewedAt={link.reviewedAt?.toISOString() ?? null}
      expiresAt={link.expiresAt?.toISOString() ?? null}
      preview={preview}
    />
  );
}

async function loadPreview(
  clientId: number,
  linkType: 'entity' | 'pending_change',
  entityType: string,
  entityId: number | null,
  pendingChangeId: number | null,
): Promise<ApprovalEntityPreview> {
  if (linkType === 'pending_change') {
    if (!pendingChangeId) return { kind: 'missing', message: 'Pending change ref missing' };
    const [change] = await db
      .select()
      .from(mcpPendingChanges)
      .where(
        and(eq(mcpPendingChanges.id, pendingChangeId), eq(mcpPendingChanges.clientId, clientId)),
      )
      .limit(1);
    if (!change) return { kind: 'missing', message: 'Pending change not found' };
    return {
      kind: 'pending_change',
      title: change.summary ?? `${change.entityType}:${change.operation}`,
      entityType: change.entityType,
      operation: change.operation,
      payloadJson: JSON.stringify(change.payload, null, 2),
    };
  }

  if (!entityId) return { kind: 'missing', message: 'Entity ref missing' };

  switch (entityType) {
    case 'post': {
      const [row] = await db.select().from(posts).where(eq(posts.id, entityId)).limit(1);
      if (!row) return { kind: 'missing', message: 'Post not found' };
      return {
        kind: 'post',
        title: row.title,
        slug: row.slug,
        published: row.published,
        content: row.content,
        siteId: row.websiteId,
      };
    }
    case 'pitch_deck': {
      const [row] = await db
        .select()
        .from(pitchDecks)
        .where(and(eq(pitchDecks.id, entityId), eq(pitchDecks.clientId, clientId)))
        .limit(1);
      if (!row) return { kind: 'missing', message: 'Deck not found' };
      const slides = (row.slides ?? []) as PitchDeckSlideV2[];
      return {
        kind: 'pitch_deck',
        title: row.title,
        slug: row.slug,
        status: row.status,
        slides: slides.map((s) => ({
          id: s.id,
          label: s.label ?? null,
          // V2 stores draft + live separately; show draft if present, else live.
          blocks: (s.draft?.blocks ?? s.blocks ?? []) as unknown,
        })),
      };
    }
    case 'email_campaign': {
      const [row] = await db
        .select()
        .from(emailCampaigns)
        .where(eq(emailCampaigns.id, entityId))
        .limit(1);
      if (!row) return { kind: 'missing', message: 'Campaign not found' };
      return {
        kind: 'email_campaign',
        title: row.name,
        subject: row.subject,
        previewText: row.previewText ?? null,
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        htmlContent: row.htmlContent,
        status: row.status,
      };
    }
    case 'block_template': {
      const [row] = await db
        .select()
        .from(blockTemplates)
        .where(eq(blockTemplates.id, entityId))
        .limit(1);
      if (!row) return { kind: 'missing', message: 'Template not found' };
      const draft = (row.draft ?? null) as BlockTemplateDraft | null;
      const blocks = (draft?.blocks ?? row.blocks ?? []) as unknown;
      const blockEditorJson = JSON.stringify({ blocks, version: '1.0' });
      return {
        kind: 'block_template',
        title: draft?.name ?? row.name,
        slug: row.slug,
        category: draft?.category ?? row.category,
        scope: draft?.scope ?? row.scope,
        description: draft?.description ?? row.description ?? null,
        content: blockEditorJson,
        pendingDelete: draft?.pendingDelete === true,
      };
    }
    default:
      return { kind: 'missing', message: `Unknown entity type: ${entityType}` };
  }
}
