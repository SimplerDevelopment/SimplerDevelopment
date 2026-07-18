/**
 * Unit tests for the email render cache key + stateless preview helper.
 *
 * The DB-backed cache layer is exercised in integration tests; here we just
 * lock the contract that:
 *   - identical Block[] trees hash to the same key
 *   - any meaningful mutation (text, order, type) flips the hash
 *   - `renderCampaignPreview` emits a wrapped HTML document AND the
 *     plain-text fallback derived from htmlToText()
 */
import { describe, it, expect } from 'vitest';
import { hashBlocks, htmlToText, renderCampaignPreview } from '@/lib/email/render-cache-core';
import type { Block } from '@/types/blocks';

const sampleBlocks = (): Block[] => [
  { id: 'h', type: 'heading', order: 0, content: 'Welcome', level: 1 },
  { id: 't', type: 'text', order: 1, content: 'Body copy.' },
  { id: 'b', type: 'button', order: 2, text: 'Go', url: 'https://example.test/cta' },
];

describe('hashBlocks', () => {
  it('returns the same sha256 for identical block trees', () => {
    const a = sampleBlocks();
    const b = sampleBlocks();
    expect(hashBlocks(a)).toBe(hashBlocks(b));
    expect(hashBlocks(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('flips when any block content changes', () => {
    const base = sampleBlocks();
    const before = hashBlocks(base);

    const edited = sampleBlocks();
    edited[1] = { id: 't', type: 'text', order: 1, content: 'Updated body copy.' };
    expect(hashBlocks(edited)).not.toBe(before);
  });

  it('flips when order changes (different visual output)', () => {
    const a = sampleBlocks();
    const b = sampleBlocks();
    [b[0], b[1]] = [b[1], b[0]];
    expect(hashBlocks(a)).not.toBe(hashBlocks(b));
  });

  it('flips when a new block is appended', () => {
    const before = hashBlocks(sampleBlocks());
    const after = [
      ...sampleBlocks(),
      { id: 's', type: 'spacer' as const, order: 3, height: 'md' as const },
    ];
    expect(hashBlocks(after)).not.toBe(before);
  });
});

describe('htmlToText', () => {
  it('drops tags and preserves anchor URLs', () => {
    const txt = htmlToText('<p>Hi <a href="https://x.test">here</a></p>');
    expect(txt).toContain('Hi');
    expect(txt).toContain('here');
    expect(txt).toContain('https://x.test');
    expect(txt).not.toContain('<');
  });

  it('decodes the entities the renderer emits', () => {
    expect(htmlToText('<p>a&amp;b &lt;c&gt;</p>')).toBe('a&b <c>');
  });

  it('normalises whitespace between block-level elements', () => {
    const html = '<h1>Title</h1>\n<p>Body</p>\n<p>More</p>';
    const txt = htmlToText(html);
    expect(txt.split('\n').filter(Boolean).length).toBe(3);
  });
});

describe('renderCampaignPreview (stateless)', () => {
  it('returns a fully wrapped HTML document plus a non-empty text part', () => {
    const result = renderCampaignPreview(sampleBlocks(), { previewText: 'Hello' });
    expect(result.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(result.html).toContain('Welcome');
    expect(result.html).toContain('Hello');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain('Welcome');
    expect(result.cached).toBe(false);
    expect(result.blocksHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('replaces the unsubscribe placeholder with the supplied URL', () => {
    const out = renderCampaignPreview([
      { id: 'ef', type: 'email-footer', order: 0, companyName: 'Acme' },
    ], { unsubscribeUrl: 'https://example.test/unsub?t=preview' });
    expect(out.html).toContain('https://example.test/unsub?t=preview');
    expect(out.html).not.toContain('{{UNSUBSCRIBE_URL}}');
  });
});
