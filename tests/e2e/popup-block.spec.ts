/**
 * Popup Block E2E
 *
 * Block lifecycle: create a post containing a popup block via the portal API,
 * verify it survives the public read, update its trigger + frequency, and
 * verify the update reflects on read. Mirrors the contract used elsewhere in
 * tests/e2e/visual-editor-blocks.spec.ts.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import { ApiClient } from './setup/api-client';

const SITE_ID = 1;

function blockContent(blocks: unknown[]) {
  return JSON.stringify({ blocks, version: '1.0' });
}

async function createPost(api: ApiClient, slug: string, blocks: unknown[]) {
  const res = await api.post(`/api/portal/cms/websites/${SITE_ID}/posts`, {
    title: `Popup Test ${slug}`,
    slug,
    content: blockContent(blocks),
    postType: 'blog',
    published: true,
  });
  return res.data?.data;
}

async function updatePost(api: ApiClient, postId: number, blocks: unknown[]) {
  return api.put(`/api/portal/cms/websites/${SITE_ID}/posts/${postId}`, {
    content: blockContent(blocks),
  });
}

async function getPublicPost(api: ApiClient, slug: string) {
  return api.get(`/api/public/websites/${SITE_ID}/posts/${slug}`);
}

async function deletePost(api: ApiClient, postId: number) {
  return api.delete(`/api/portal/cms/websites/${SITE_ID}/posts/${postId}`);
}

test.describe('Popup Block @blocks @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('add → save → public read round-trip', async ({ clientApi, unauthApi }) => {
    const slug = `popup-rt-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      {
        id: 'pop1',
        type: 'popup',
        order: 0,
        trigger: 'page-load',
        frequency: 'always',
        headline: 'Hello world',
        body: '<p>This is a test popup.</p>',
        ctaLabel: 'OK',
        ctaUrl: 'https://example.com/landing',
        dismissable: true,
      },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    expect(pub.status).toBe(200);
    const content = JSON.parse(pub.data.data.content);
    const block = content.blocks[0];
    expect(block.type).toBe('popup');
    expect(block.trigger).toBe('page-load');
    expect(block.frequency).toBe('always');
    expect(block.headline).toBe('Hello world');
    expect(block.body).toContain('<p>');
    expect(block.ctaLabel).toBe('OK');
    expect(block.ctaUrl).toBe('https://example.com/landing');
    expect(block.dismissable).toBe(true);
  });

  test('edit trigger + frequency round-trip', async ({ clientApi, unauthApi }) => {
    const slug = `popup-edit-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      {
        id: 'pop2',
        type: 'popup',
        order: 0,
        trigger: 'time-delay',
        delaySeconds: 5,
        frequency: 'once-per-session',
        headline: 'Original',
        ctaLabel: 'Click',
        ctaUrl: '#',
      },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    await updatePost(clientApi, post.id, [
      {
        id: 'pop2',
        type: 'popup',
        order: 0,
        trigger: 'scroll-percent',
        scrollPercent: 75,
        frequency: 'once-per-week',
        headline: 'Updated',
        ctaLabel: 'Now',
        ctaUrl: '/go/abc',
      },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(updated.data.data.content);
    const block = content.blocks[0];
    expect(block.trigger).toBe('scroll-percent');
    expect(block.scrollPercent).toBe(75);
    expect(block.frequency).toBe('once-per-week');
    expect(block.headline).toBe('Updated');
    expect(block.ctaUrl).toBe('/go/abc');
  });
});
