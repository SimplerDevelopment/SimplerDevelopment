/**
 * POST /api/portal/email/preview
 *
 * Block-builder render endpoint. Body:
 *   {
 *     blocks: Block[],
 *     subject?: string,
 *     preheader?: string,           // alias: previewText
 *     campaignId?: number,           // when supplied + tenant-owned, uses cache
 *     sendTest?: boolean,            // if true, also emails the rendered output
 *                                   //   to the current user's address
 *   }
 *
 * Returns:
 *   { success: true, data: { html, text, subject, blocksHash, cached } }
 *
 * Rendering goes through `lib/email/render-cache.ts` so the same block tree
 * always produces the same blocksHash and (when a campaignId is supplied)
 * is persisted in `email_renders` for the send path to reuse.
 *
 * Note: separate from `/api/portal/email/render-preview`, which is the older
 * surface used by the existing campaign editor's iframe preview. That
 * endpoint stays untouched for backwards-compat — this one is the canonical
 * entry point for the new block-builder.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { db } from '@/lib/db';
import { emailCampaigns } from '@/lib/db/schema';
import { resend, buildUnsubscribeUrl } from '@/lib/email';
import {
  getOrRenderCampaignHtml,
  renderCampaignPreview,
} from '@/lib/email/render-cache';
import type { Block } from '@/types/blocks';

interface PreviewBody {
  blocks?: Block[];
  subject?: string;
  preheader?: string;
  previewText?: string;
  campaignId?: number;
  sendTest?: boolean;
}

export async function POST(req: NextRequest) {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;
  const { client, userId } = authResult;

  let body: PreviewBody;
  try {
    body = (await req.json()) as PreviewBody;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const blocks = Array.isArray(body.blocks) ? body.blocks : null;
  if (!blocks) {
    return NextResponse.json(
      { success: false, message: 'blocks (Block[]) is required' },
      { status: 400 },
    );
  }

  const previewText = body.preheader ?? body.previewText ?? null;
  const subject = body.subject ?? null;

  // If a campaignId is provided, validate tenancy and use the cache.
  let html: string;
  let text: string;
  let blocksHash: string;
  let cached = false;

  if (body.campaignId) {
    const [campaign] = await db
      .select({ id: emailCampaigns.id })
      .from(emailCampaigns)
      .where(and(
        eq(emailCampaigns.id, body.campaignId),
        eq(emailCampaigns.clientId, client.id),
      ))
      .limit(1);
    if (!campaign) {
      return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 });
    }
    const result = await getOrRenderCampaignHtml(campaign.id, blocks, { previewText, subject });
    html = result.html;
    text = result.text;
    blocksHash = result.blocksHash;
    cached = result.cached;
  } else {
    const result = renderCampaignPreview(blocks, { previewText, unsubscribeUrl: '#' });
    html = result.html;
    text = result.text;
    blocksHash = result.blocksHash;
  }

  // Optional "Send test email" — emails the rendered output to the
  // current user's address. The test email uses a placeholder unsubscribe
  // URL so we don't accidentally create real subscriber tokens for staff.
  let testSent: { to: string; ok: boolean } | undefined;
  if (body.sendTest) {
    const userEmail = await getUserEmail(userId);
    if (!userEmail) {
      return NextResponse.json({
        success: false,
        message: 'Cannot send test: current user has no email on file',
      }, { status: 400 });
    }
    try {
      const placeholderUnsub = buildUnsubscribeUrl('test-' + Date.now());
      const testHtml = html.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, placeholderUnsub);
      const fromEmail = process.env.EMAIL_TEST_FROM ?? 'noreply@simplerdevelopment.com';
      await resend.emails.send({
        from: `Block Builder Test <${fromEmail}>`,
        to: userEmail,
        subject: subject ? `[TEST] ${subject}` : '[TEST] Email block builder preview',
        html: testHtml,
        text,
      });
      testSent = { to: userEmail, ok: true };
    } catch {
      testSent = { to: userEmail, ok: false };
    }
  }

  return NextResponse.json({
    success: true,
    data: { html, text, subject, blocksHash, cached, testSent },
  });
}

async function getUserEmail(userId: number): Promise<string | null> {
  const { users } = await import('@/lib/db/schema');
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.email ?? null;
}
