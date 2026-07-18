// @vitest-environment node
/**
 * Unit tests for lib/blocks/prefetch-embeds.ts
 *
 * Covers the public `prefetchHtmlEmbeds` walker:
 *  - JSON parse failure -> original string returned
 *  - non-object / missing blocks -> original string returned
 *  - happy path: html-embed at top level gets inlineHtml populated
 *  - nested via b.blocks
 *  - nested via b.columns[*].blocks
 *  - url with query string -> s3 key has query stripped
 *  - non-matching url -> skipped (no fetch, no inlineHtml)
 *  - s3 fetch throws -> warns, leaves block untouched
 *  - multiple embeds prefetched in parallel
 *  - non-html-embed blocks are ignored
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/cache so unstable_cache is a passthrough wrapper around the inner fn.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

// Mock the s3 fetch module — we control what it returns/throws per test.
const getFromS3Mock = vi.fn();
vi.mock('@/lib/s3/fetch', () => ({
  getFromS3: (...args: unknown[]) => getFromS3Mock(...args),
}));

// Import AFTER mocks are registered.
import { prefetchHtmlEmbeds } from '@/lib/blocks/prefetch-embeds';

const PROXY = '/api/media/proxy/';

beforeEach(() => {
  getFromS3Mock.mockReset();
});

describe('prefetchHtmlEmbeds — input handling', () => {
  it('returns the original string when JSON is invalid', async () => {
    const garbage = '{not json';
    const out = await prefetchHtmlEmbeds(garbage);
    expect(out).toBe(garbage);
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('returns the original string when parsed value is null', async () => {
    const input = 'null';
    const out = await prefetchHtmlEmbeds(input);
    expect(out).toBe(input);
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('returns the original string when blocks is missing', async () => {
    const input = JSON.stringify({ foo: 'bar' });
    const out = await prefetchHtmlEmbeds(input);
    expect(out).toBe(input);
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('returns the original string when blocks is not an array', async () => {
    const input = JSON.stringify({ blocks: 'oops' });
    const out = await prefetchHtmlEmbeds(input);
    expect(out).toBe(input);
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('re-stringifies (no inline) when blocks is an empty array', async () => {
    const input = JSON.stringify({ blocks: [] });
    const out = await prefetchHtmlEmbeds(input);
    expect(JSON.parse(out)).toEqual({ blocks: [] });
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });
});

describe('prefetchHtmlEmbeds — happy path', () => {
  it('inlines an html-embed at the top level', async () => {
    getFromS3Mock.mockResolvedValueOnce({
      buffer: Buffer.from('<h1>hello</h1>', 'utf8'),
      contentType: 'text/html',
    });
    const input = JSON.stringify({
      blocks: [
        { type: 'html-embed', url: `${PROXY}abc123.html` },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].inlineHtml).toBe('<h1>hello</h1>');
    expect(parsed.blocks[0].url).toBe(`${PROXY}abc123.html`);
    expect(getFromS3Mock).toHaveBeenCalledWith('abc123.html');
  });

  it('strips a query string from the proxy URL when deriving the s3 key', async () => {
    getFromS3Mock.mockResolvedValueOnce({
      buffer: Buffer.from('<p>q</p>', 'utf8'),
      contentType: 'text/html',
    });
    const input = JSON.stringify({
      blocks: [
        { type: 'html-embed', url: `${PROXY}with-query.html?v=2` },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    expect(JSON.parse(out).blocks[0].inlineHtml).toBe('<p>q</p>');
    expect(getFromS3Mock).toHaveBeenCalledWith('with-query.html');
  });

  it('inlines an embed nested inside a parent block via .blocks', async () => {
    getFromS3Mock.mockResolvedValueOnce({
      buffer: Buffer.from('<nested/>', 'utf8'),
      contentType: 'text/html',
    });
    const input = JSON.stringify({
      blocks: [
        {
          type: 'container',
          blocks: [
            { type: 'html-embed', url: `${PROXY}nested.html` },
          ],
        },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].blocks[0].inlineHtml).toBe('<nested/>');
    expect(getFromS3Mock).toHaveBeenCalledWith('nested.html');
  });

  it('inlines an embed nested inside columns[].blocks', async () => {
    getFromS3Mock.mockResolvedValueOnce({
      buffer: Buffer.from('<col/>', 'utf8'),
      contentType: 'text/html',
    });
    const input = JSON.stringify({
      blocks: [
        {
          type: 'columns',
          columns: [
            { blocks: [{ type: 'html-embed', url: `${PROXY}col.html` }] },
            { /* no blocks key — should be tolerated */ },
          ],
        },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].columns[0].blocks[0].inlineHtml).toBe('<col/>');
    expect(getFromS3Mock).toHaveBeenCalledWith('col.html');
  });

  it('prefetches multiple embeds in parallel', async () => {
    getFromS3Mock.mockImplementation(async (key: string) => ({
      buffer: Buffer.from(`<x>${key}</x>`, 'utf8'),
      contentType: 'text/html',
    }));
    const input = JSON.stringify({
      blocks: [
        { type: 'html-embed', url: `${PROXY}a.html` },
        { type: 'html-embed', url: `${PROXY}b.html` },
        { type: 'html-embed', url: `${PROXY}c.html` },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks.map((b: { inlineHtml?: string }) => b.inlineHtml)).toEqual([
      '<x>a.html</x>',
      '<x>b.html</x>',
      '<x>c.html</x>',
    ]);
    expect(getFromS3Mock).toHaveBeenCalledTimes(3);
  });
});

describe('prefetchHtmlEmbeds — skip / failure paths', () => {
  it('skips html-embed without a url', async () => {
    const input = JSON.stringify({
      blocks: [{ type: 'html-embed' }],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].inlineHtml).toBeUndefined();
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('skips html-embed whose url does not match the proxy pattern', async () => {
    const input = JSON.stringify({
      blocks: [
        { type: 'html-embed', url: 'https://example.test/not-a-proxy.html' },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].inlineHtml).toBeUndefined();
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('ignores non html-embed blocks at the top level', async () => {
    const input = JSON.stringify({
      blocks: [
        { type: 'heading', content: 'hi' },
        { type: 'text', content: 'body' },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].inlineHtml).toBeUndefined();
    expect(parsed.blocks[1].inlineHtml).toBeUndefined();
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('leaves the block untouched and warns when s3 fetch throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getFromS3Mock.mockRejectedValueOnce(new Error('boom'));
    const input = JSON.stringify({
      blocks: [
        { type: 'html-embed', url: `${PROXY}broken.html` },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].inlineHtml).toBeUndefined();
    expect(parsed.blocks[0].url).toBe(`${PROXY}broken.html`);
    expect(warn).toHaveBeenCalled();
    const [, key, message] = warn.mock.calls[0];
    expect(key).toBe('broken.html');
    expect(message).toBe('boom');
    warn.mockRestore();
  });

  it('warns with the raw thrown value when a non-Error is thrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getFromS3Mock.mockRejectedValueOnce('string-error');
    const input = JSON.stringify({
      blocks: [
        { type: 'html-embed', url: `${PROXY}weird.html` },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].inlineHtml).toBeUndefined();
    const lastCall = warn.mock.calls[0];
    expect(lastCall[2]).toBe('string-error');
    warn.mockRestore();
  });

  it('continues processing siblings when one embed fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getFromS3Mock.mockImplementation(async (key: string) => {
      if (key === 'fail.html') throw new Error('nope');
      return { buffer: Buffer.from(`<ok>${key}</ok>`, 'utf8'), contentType: 'text/html' };
    });
    const input = JSON.stringify({
      blocks: [
        { type: 'html-embed', url: `${PROXY}ok1.html` },
        { type: 'html-embed', url: `${PROXY}fail.html` },
        { type: 'html-embed', url: `${PROXY}ok2.html` },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].inlineHtml).toBe('<ok>ok1.html</ok>');
    expect(parsed.blocks[1].inlineHtml).toBeUndefined();
    expect(parsed.blocks[2].inlineHtml).toBe('<ok>ok2.html</ok>');
    warn.mockRestore();
  });
});

describe('prefetchHtmlEmbeds — robustness', () => {
  it('tolerates null entries in the blocks array without throwing', async () => {
    const input = JSON.stringify({
      // The walker reads `b?.type`, so null/undefined entries must be safe.
      blocks: [null, { type: 'heading', content: 'x' }],
    });
    const out = await prefetchHtmlEmbeds(input);
    expect(JSON.parse(out).blocks.length).toBe(2);
    expect(getFromS3Mock).not.toHaveBeenCalled();
  });

  it('walks deeply nested combinations of blocks + columns', async () => {
    getFromS3Mock.mockImplementation(async (key: string) => ({
      buffer: Buffer.from(`[${key}]`, 'utf8'),
      contentType: 'text/html',
    }));
    const input = JSON.stringify({
      blocks: [
        {
          type: 'columns',
          columns: [
            {
              blocks: [
                {
                  type: 'container',
                  blocks: [
                    { type: 'html-embed', url: `${PROXY}deep.html` },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const out = await prefetchHtmlEmbeds(input);
    const parsed = JSON.parse(out);
    expect(parsed.blocks[0].columns[0].blocks[0].blocks[0].inlineHtml).toBe('[deep.html]');
    expect(getFromS3Mock).toHaveBeenCalledWith('deep.html');
  });
});
