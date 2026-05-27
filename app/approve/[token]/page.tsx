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
  surveys,
  bookingPages,
} from '@/lib/db/schema';
import type {
  BlockTemplateDraft,
  PitchDeckSlideV2,
  SurveyFieldDef,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { lookupApprovalLink } from '@/lib/mcp/approval-links';
import { auth } from '@/lib/auth';
import { users } from '@/lib/db/schema';
import { ApprovalReviewer, type ApprovalEntityPreview } from './ApprovalReviewer';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ApprovalPage({ params }: PageProps) {
  const { token } = await params;
  const link = await lookupApprovalLink(token);
  if (!link) notFound();

  const [preview, currentUser] = await Promise.all([
    loadPreview(link.clientId, link.linkType, link.entityType, link.entityId, link.pendingChangeId),
    loadCurrentUser(),
  ]);

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
      currentUser={currentUser}
    />
  );
}

async function loadCurrentUser(): Promise<{ name: string; email: string } | null> {
  const session = await auth();
  const userIdRaw = session?.user?.id;
  if (!userIdRaw) return null;
  const userId = parseInt(String(userIdRaw), 10);
  if (Number.isNaN(userId)) return null;
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { name: row.name, email: row.email };
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
        customCss: row.customCss ?? null,
        customJs: row.customJs ?? null,
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
          // Ticket #19: forward pageSettings + customCss so the approval card
          // mirrors the published renderer's slide-stage chrome (bg image /
          // color / size / position / repeat + scoped custom CSS) instead of
          // dropping them on the floor.
          pageSettings: (s.draft?.pageSettings ?? s.pageSettings ?? null) as unknown,
          customCss: (s.draft?.customCss ?? s.customCss ?? null) as string | null,
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
    case 'survey': {
      const [row] = await db
        .select()
        .from(surveys)
        .where(and(eq(surveys.id, entityId), eq(surveys.clientId, clientId)))
        .limit(1);
      if (!row) return { kind: 'missing', message: 'Survey not found' };
      return {
        kind: 'survey',
        title: row.title,
        slug: row.slug,
        description: row.description ?? null,
        status: row.status,
        publicUrl: `/s/${row.slug}`,
        // SurveyFieldDef from lib/db/schema is a superset of what the client
        // preview renders — cast through unknown to avoid the structural-
        // assignability mismatch on optional-field shapes.
        fields: ((row.fields ?? []) as SurveyFieldDef[]) as unknown as Array<{
          id: string;
          type: string;
          label: string;
          required?: boolean;
          order?: number;
          options?: Array<{ id?: string; label: string; value?: string }>;
          showIf?: unknown;
          page?: number;
        }>,
        thankYouTitle: row.thankYouTitle ?? null,
        thankYouMessage: row.thankYouMessage ?? null,
        requireEmail: row.requireEmail ?? false,
      };
    }
    case 'booking_page': {
      const [row] = await db
        .select()
        .from(bookingPages)
        .where(and(eq(bookingPages.id, entityId), eq(bookingPages.clientId, clientId)))
        .limit(1);
      if (!row) return { kind: 'missing', message: 'Booking page not found' };
      return {
        kind: 'booking_page',
        title: row.title,
        slug: row.slug,
        active: row.active,
        publicUrl: `/book/${row.slug}`,
        duration: row.duration,
        price: row.price,
        priceLabel: row.priceLabel ?? null,
        timezone: row.timezone,
        bookingType: row.bookingType,
        assignmentMode: row.assignmentMode,
        description: row.description ?? null,
      };
    }
    default:
      return { kind: 'missing', message: `Unknown entity type: ${entityType}` };
  }
}
