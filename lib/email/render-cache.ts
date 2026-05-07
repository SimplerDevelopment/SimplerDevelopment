/**
 * Email render cache.
 *
 * The block-builder send path wants to render once per (campaign, blocks)
 * tuple, then reuse that HTML across every recipient. This module owns:
 *
 *   - the canonical sha256 hash function used as a cache key
 *   - a thin DB-backed cache (`email_renders`) keyed by (campaignId, blocksHash)
 *   - a plain-text fallback derived from the rendered HTML for the text/plain
 *     part of the multipart email
 *
 * Multi-tenant: callers MUST pass a campaignId that already has its
 * `clientId` validated upstream — this module does not re-check tenancy.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { Block } from '@/types/blocks';
import { db } from '@/lib/db';
import { emailRenders } from '@/lib/db/schema';
import { renderBlocksToEmailHtml } from './render-blocks-to-email';
import { buildCampaignHtmlString } from './build-campaign-html';
import { hashBlocks, htmlToText, type RenderCacheEntry } from './render-cache-core';

// Re-export pure helpers so existing callers can keep importing from
// `@/lib/email/render-cache` without taking a DB dependency for cases
// they only use the pure helpers.
export { hashBlocks, htmlToText, renderCampaignPreview, type RenderCacheEntry } from './render-cache-core';

/**
 * Read-through cache: look up by (campaignId, blocksHash); if missing, render
 * fresh and persist. Returns the wrapped HTML document plus the plain-text
 * fallback. The unsubscribe URL is a literal `{{UNSUBSCRIBE_URL}}` token in
 * the cached HTML — the send path replaces it per-recipient.
 *
 * `subject` is stored alongside the HTML so a campaign-level rename forces a
 * cache miss when the subject is part of the rendered footer/header.
 */
export async function getOrRenderCampaignHtml(
  campaignId: number,
  blocks: Block[],
  opts: { previewText?: string | null; subject?: string | null } = {},
): Promise<RenderCacheEntry> {
  const blocksHash = hashBlocks(blocks);

  const [hit] = await db
    .select({ html: emailRenders.html })
    .from(emailRenders)
    .where(and(eq(emailRenders.campaignId, campaignId), eq(emailRenders.blocksHash, blocksHash)))
    .orderBy(desc(emailRenders.generatedAt))
    .limit(1);

  if (hit) {
    return { html: hit.html, text: htmlToText(hit.html), blocksHash, cached: true };
  }

  const innerHtml = renderBlocksToEmailHtml(blocks);
  // Use the placeholder for the unsubscribe URL — the per-recipient send
  // step rewrites it. The preview endpoint uses the same shape and renders
  // a "#" link for the dummy preview by replacing the token before display.
  const html = buildCampaignHtmlString(innerHtml, '{{UNSUBSCRIBE_URL}}', opts.previewText ?? null);

  await db
    .insert(emailRenders)
    .values({ campaignId, blocksHash, html, subject: opts.subject ?? null });

  return { html, text: htmlToText(html), blocksHash, cached: false };
}

