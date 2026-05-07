import { Resend } from 'resend';
import type { BlockEditorData } from '@/types/blocks';
import { renderBlocksToEmailHtml } from './render-blocks-to-email';
import { buildCampaignHtmlString } from './build-campaign-html';

export { renderBlocksToEmailHtml } from './render-blocks-to-email';
export { EMAIL_BLOCK_TYPES, isEmailBlockType } from './email-block-types';

export const resend = new Resend(process.env.RESEND_API_KEY);

export function generateUnsubscribeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function buildUnsubscribeUrl(token: string): string {
  const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  return `${base}/api/email/unsubscribe?token=${token}`;
}

/**
 * Render block editor data to email HTML, then wrap in campaign document.
 * Replaces {{UNSUBSCRIBE_URL}} in footer blocks with the actual URL.
 */
export function buildCampaignHtmlFromBlocks(
  blockContent: BlockEditorData,
  unsubscribeUrl: string,
  previewText?: string | null,
): string {
  const innerHtml = renderBlocksToEmailHtml(blockContent.blocks);
  const withUnsub = innerHtml.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);
  return buildCampaignHtml(withUnsub, unsubscribeUrl, previewText);
}

export function buildCampaignHtml(
  htmlContent: string,
  unsubscribeUrl: string,
  previewText?: string | null,
): string {
  return buildCampaignHtmlString(htmlContent, unsubscribeUrl, previewText);
}
