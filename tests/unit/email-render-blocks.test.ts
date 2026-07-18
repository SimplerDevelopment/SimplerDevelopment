/**
 * Unit tests for the block-builder email renderer.
 *
 * `renderBlocksToEmailHtml` walks a Block[] tree and emits inlined-style,
 * email-safe HTML. Sister to `lib/email/index.ts:buildCampaignHtml` which
 * wraps the inner output in a full document.
 *
 * Asserts here are intentionally loose — the renderer is allowed to evolve
 * its exact markup so long as the contract holds:
 *   - every block contributes some output
 *   - styles are inlined via style="..." attributes (no <style> blocks)
 *   - link URLs and link text round-trip through the output
 *   - the buildCampaignHtml wrapper produces a `<!DOCTYPE html>` document
 *     and embeds a plain-text fallback via htmlToText
 */
import { describe, it, expect } from 'vitest';
import { renderBlocksToEmailHtml } from '@/lib/email/render-blocks-to-email';
import { buildCampaignHtmlString } from '@/lib/email/build-campaign-html';
import { htmlToText } from '@/lib/email/render-cache-core';
import type { Block } from '@/types/blocks';

describe('renderBlocksToEmailHtml', () => {
  it('renders a 5-block email tree end-to-end', () => {
    const blocks: Block[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Welcome aboard', level: 1 },
      { id: 't', type: 'text', order: 1, content: 'Thanks for signing up.' },
      { id: 'b', type: 'button', order: 2, text: 'Get started', url: 'https://example.test/start' },
      { id: 'd', type: 'divider', order: 3, lineStyle: 'solid' },
      { id: 's', type: 'spacer', order: 4, height: 'md' },
    ];
    const html = renderBlocksToEmailHtml(blocks);

    // Each block produced output
    expect(html).toContain('Welcome aboard');
    expect(html).toContain('Thanks for signing up.');
    expect(html).toContain('https://example.test/start');
    expect(html).toContain('Get started');
    expect(html).toContain('<hr');
    expect(html).toMatch(/height:\s*32px/); // md spacer
  });

  it('uses inlined style="..." attributes — no <style> blocks', () => {
    const blocks: Block[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Inline me', level: 2 },
      { id: 't', type: 'text', order: 1, content: 'Body copy.' },
    ];
    const html = renderBlocksToEmailHtml(blocks);

    expect(html).toContain('style="');
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/<\/style>/i);
  });

  it('escapes HTML control characters in plain (non-HTML) block content', () => {
    // The renderer auto-detects HTML content and renders it as-is; pure
    // plain-text content has its &/</> escaped.
    const blocks: Block[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Plain ampersand & here', level: 1 },
      { id: 't', type: 'text', order: 1, content: 'a & b' },
    ];
    const html = renderBlocksToEmailHtml(blocks);
    expect(html).toContain('Plain ampersand &amp; here');
    expect(html).toContain('a &amp; b');
  });

  it('renders email-header logo + tagline', () => {
    const blocks: Block[] = [
      {
        id: 'eh', type: 'email-header', order: 0,
        logoUrl: 'https://example.test/logo.png',
        logoWidth: 200,
        tagline: 'Hello world',
      },
    ];
    const html = renderBlocksToEmailHtml(blocks);
    expect(html).toContain('https://example.test/logo.png');
    expect(html).toContain('Hello world');
    expect(html).toContain('width="200"');
  });

  it('renders email-footer with unsubscribe placeholder', () => {
    const blocks: Block[] = [
      {
        id: 'ef', type: 'email-footer', order: 0,
        companyName: 'Acme Corp',
        address: '123 Main St',
      },
    ];
    const html = renderBlocksToEmailHtml(blocks);
    expect(html).toContain('Acme Corp');
    expect(html).toContain('123 Main St');
    // Unsubscribe URL is left as a placeholder — the send path replaces it.
    expect(html).toContain('{{UNSUBSCRIBE_URL}}');
    expect(html).toContain('Unsubscribe');
  });

  it('skips block types it cannot render in email (no popup leakage)', () => {
    const blocks: Block[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Real', level: 1 },
      // Popup is page-only; the email renderer should treat it as a no-op.
      // Using 'as unknown as Block' since popup isn't in the email-safe union.
      { id: 'p', type: 'popup', order: 1 } as unknown as Block,
    ];
    const html = renderBlocksToEmailHtml(blocks);
    expect(html).toContain('Real');
    expect(html).not.toContain('popup');
  });

  it('buildCampaignHtml wraps the inner HTML in a full document with footer', () => {
    const blocks: Block[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Hello', level: 1 },
    ];
    const inner = renderBlocksToEmailHtml(blocks);
    const wrapped = buildCampaignHtmlString(inner, 'https://example.test/unsub?t=abc', 'Preview line');

    expect(wrapped.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(wrapped).toContain('<html lang="en">');
    expect(wrapped).toContain('Hello');
    expect(wrapped).toContain('Preview line');
    expect(wrapped).toContain('https://example.test/unsub?t=abc');
    expect(wrapped).toContain('Unsubscribe');
  });

  it('htmlToText produces a plain-text fallback that contains the visible copy', () => {
    const blocks: Block[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Welcome', level: 1 },
      { id: 't', type: 'text', order: 1, content: 'Thanks for signing up.' },
      { id: 'b', type: 'button', order: 2, text: 'Click here', url: 'https://example.test/cta' },
    ];
    const inner = renderBlocksToEmailHtml(blocks);
    const wrapped = buildCampaignHtmlString(inner, 'https://example.test/unsub', null);
    const text = htmlToText(wrapped);

    expect(text).toContain('Welcome');
    expect(text).toContain('Thanks for signing up.');
    // anchor labels round-trip with their URL in parens
    expect(text).toContain('Click here');
    expect(text).toContain('https://example.test/cta');
    // no surviving HTML tags
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
  });
});
