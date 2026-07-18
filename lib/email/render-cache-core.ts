/**
 * Pure (no-DB, no-Resend) helpers for the email render cache.
 *
 * Lives separately from `render-cache.ts` so unit tests can import the hash
 * + plain-text helpers without dragging in `lib/db` (DATABASE_URL required)
 * or `lib/email/index.ts` (RESEND_API_KEY required).
 */

import { createHash } from 'node:crypto';
import type { Block } from '@/types/blocks';
import { renderBlocksToEmailHtml } from './render-blocks-to-email';
import { buildCampaignHtmlString } from './build-campaign-html';

export interface RenderCacheEntry {
  html: string;
  text: string;
  blocksHash: string;
  cached: boolean;
}

/** sha256 hex digest of the canonical JSON form of a Block[] tree. */
export function hashBlocks(blocks: Block[]): string {
  const canonical = JSON.stringify(blocks);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Strip an HTML string to a plain-text fallback. Intentionally simple —
 * preserves block-level breaks and link URLs, drops everything else.
 *
 * No new dep; downstream callers want a "good enough" multipart fallback
 * for the deliverability bump, not a perfect rendering.
 */
export function htmlToText(html: string): string {
  return html
    // anchors → "label (url)"
    .replace(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, url, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      if (!text) return url;
      return `${text} (${url})`;
    })
    // block-level breaks
    .replace(/<\/(?:p|div|h[1-6]|li|tr|table|section|article|header|footer|hr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // strip remaining tags
    .replace(/<[^>]+>/g, '')
    // decode the entities we emit
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    // collapse runs of whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Stateless preview render — used by the public preview endpoint when no
 * campaignId is supplied (e.g. rendering a draft from the new-campaign form).
 * Does NOT persist to the email_renders cache.
 */
export function renderCampaignPreview(
  blocks: Block[],
  opts: { previewText?: string | null; unsubscribeUrl?: string } = {},
): RenderCacheEntry {
  const blocksHash = hashBlocks(blocks);
  const innerHtml = renderBlocksToEmailHtml(blocks);
  const unsubUrl = opts.unsubscribeUrl ?? '#';
  const html = buildCampaignHtmlString(innerHtml, unsubUrl, opts.previewText ?? null)
    .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubUrl);
  return { html, text: htmlToText(html), blocksHash, cached: false };
}
