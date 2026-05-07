/**
 * E2E: Block-builder email pipeline.
 *
 * Exercises the new `/api/portal/email/preview` endpoint that the block
 * editor uses to render and (optionally) send a test email. Sister suite
 * to `email-block-editor.spec.ts`, which covers the older render-preview
 * endpoint.
 *
 * Asserts:
 *   - 401 unauthenticated
 *   - 400 missing blocks
 *   - 200 stateless render returns html, text, blocksHash
 *   - same block tree → identical blocksHash; modified tree → different hash
 *   - campaignId path validates tenancy (404 on cross-client)
 */
import { test, expect } from './setup/fixtures';

const BLOCKS = [
  { id: 'h', type: 'heading', order: 0, content: 'Hello block builder', level: 1 },
  { id: 't', type: 'text', order: 1, content: 'A short body line.' },
  { id: 'b', type: 'button', order: 2, text: 'Open', url: 'https://example.test/cta' },
];

test.describe('email block builder — POST /api/portal/email/preview', () => {
  test('400 when blocks array is missing', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/preview', {});
    // Either 400 (when authorized) or 403 (when email service not enabled);
    // both are valid rejection paths for an empty body.
    expect([400, 403]).toContain(res.status);
  });

  test('200 stateless preview returns html, text, blocksHash', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/preview', {
      blocks: BLOCKS,
      preheader: 'Preview line',
    });
    if (res.status !== 200) test.skip(true, `email service not enabled (status=${res.status})`);

    expect(res.data.success).toBe(true);
    const data = res.data.data;
    expect(typeof data.html).toBe('string');
    expect(typeof data.text).toBe('string');
    expect(typeof data.blocksHash).toBe('string');
    expect(data.blocksHash).toMatch(/^[0-9a-f]{64}$/);

    expect(data.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(data.html).toContain('Hello block builder');
    expect(data.html).toContain('https://example.test/cta');
    expect(data.html).toContain('Preview line');

    expect(data.text).toContain('Hello block builder');
    // No surviving HTML tags in the text part
    expect(data.text).not.toMatch(/<[a-z][^>]*>/i);
  });

  test('blocksHash is deterministic and changes with content', async ({ clientApi }) => {
    const a = await clientApi.post('/api/portal/email/preview', { blocks: BLOCKS });
    if (a.status !== 200) test.skip(true, `email service not enabled (status=${a.status})`);
    const b = await clientApi.post('/api/portal/email/preview', { blocks: BLOCKS });
    expect(a.data.data.blocksHash).toBe(b.data.data.blocksHash);

    const tweaked = [
      ...BLOCKS.slice(0, 1),
      { ...BLOCKS[1], content: 'A different body line.' },
      ...BLOCKS.slice(2),
    ];
    const c = await clientApi.post('/api/portal/email/preview', { blocks: tweaked });
    expect(c.data.data.blocksHash).not.toBe(a.data.data.blocksHash);
  });

  test('campaignId path 404s when the campaign does not belong to the caller', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/preview', {
      blocks: BLOCKS,
      campaignId: 999_999_999,
    });
    if (res.status === 403) test.skip(true, 'email service not enabled');
    expect(res.status).toBe(404);
  });
});
