import { Resend } from 'resend';
import type { BlockEditorData } from '@/types/blocks';
import { renderBlocksToEmailHtml } from './render-blocks-to-email';
import { buildCampaignHtmlString } from './build-campaign-html';

export { renderBlocksToEmailHtml } from './render-blocks-to-email';
export { EMAIL_BLOCK_TYPES, isEmailBlockType } from './email-block-types';

/**
 * Lazy Resend client.
 *
 * Construction is deferred until first property access so that simply
 * importing this module (e.g. transitively from a route under test) does
 * not throw when RESEND_API_KEY is unset. The Resend constructor reads
 * the key eagerly, so eager construction at module-load time made every
 * downstream import of `@/lib/email` fail in environments without the
 * env var (notably integration tests that don't actually send mail).
 *
 * Prefer `getResend()` in new code; the `resend` export is kept as a
 * Proxy so existing `resend.emails.send(...)` / `resend.domains.*` call
 * sites continue to work unchanged.
 */
let _resend: Resend | null = null;

export function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    _resend = new Resend(key);
  }
  return _resend;
}

export const resend: Resend = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    return Reflect.get(getResend() as object, prop, receiver);
  },
});

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
