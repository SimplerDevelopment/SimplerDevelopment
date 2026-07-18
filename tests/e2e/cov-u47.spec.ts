/**
 * Visual Editor — context menu duplicate, block reorder persistence, and
 * page-settings survival across reload (cards 8–10 of the Visual Editor E2E
 * audit, unit 47).
 *
 * All three features ultimately persist through the same POST/PUT endpoints
 * that the editor shell uses. The browser-side postMessage wiring is already
 * covered by unit tests (visual-editor-use-parent.test.tsx); here we pin the
 * server-side contract that the editor writes to and reads from.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, resolveClientSiteId, createTestPost } from './setup/helpers';
import { ApiClient } from './setup/api-client';

test.describe.configure({ mode: 'serial' });

let SITE_ID: number;

test.beforeAll(async () => {
  const bootstrap = new ApiClient('client@example.com', 'client123');
  await bootstrap.ensure();
  try {
    SITE_ID = await resolveClientSiteId(bootstrap);
  } finally {
    await bootstrap.dispose();
  }
});

function blockContent(blocks: unknown[]) {
  return JSON.stringify({ blocks, version: '1.0' });
}

// ── Card 8: Context menu duplicate block ──────────────────────────────────────

test.describe('Visual Editor — context-menu duplicate block @visual-editor', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'duplicate block: PUT with duplicated block appended after original persists @critical',
    async ({ clientApi }) => {
      const ts = Date.now();
      const slug = `ve-dup-block-${ts}`;

      // Create a post with one heading block
      const original = { id: 'h1', type: 'heading', order: 1, content: 'Original Heading', level: 2 };
      const { post, cleanup } = await createTestPost(clientApi, SITE_ID, {
        title: `Dup Block Test ${ts}`,
        slug,
        content: blockContent([original]),
      });
      cleanups.push(cleanup);

      // Simulate what bulkDuplicate does: deep-clone with a new id, splice after source
      const duplicate = {
        ...JSON.parse(JSON.stringify(original)),
        id: `block-dup-${ts}`,
        order: 2,
      };
      const updatedBlocks = [original, duplicate];

      // This is the same PUT the editor shell fires when blocks change
      const putRes = await clientApi.put(
        `/api/portal/cms/websites/${SITE_ID}/posts/${post.id}`,
        { content: blockContent(updatedBlocks) }
      );
      expect(putRes.status).toBe(200);
      expect(putRes.data.success).toBe(true);

      // GET confirms persistence
      const getRes = await clientApi.get(
        `/api/portal/cms/websites/${SITE_ID}/posts/${post.id}`
      );
      expect(getRes.status).toBe(200);
      const saved = JSON.parse(getRes.data.data.content);
      expect(saved.blocks).toHaveLength(2);

      // Both blocks carry the original type and content
      expect(saved.blocks[0].type).toBe('heading');
      expect(saved.blocks[0].content).toBe('Original Heading');
      expect(saved.blocks[1].type).toBe('heading');
      expect(saved.blocks[1].content).toBe('Original Heading');

      // The duplicate has a distinct id and follows the original
      expect(saved.blocks[1].id).not.toBe(saved.blocks[0].id);
      expect(saved.blocks[1].id).toBe(`block-dup-${ts}`);
    }
  );
});

// ── Card 9: BLOCKS_REORDERED postMessage → persists new order ────────────────

test.describe('Visual Editor — BLOCKS_REORDERED persistence @visual-editor', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'reordered block tree PUT persists new order and GET returns it @critical',
    async ({ clientApi }) => {
      const ts = Date.now();
      const slug = `ve-reorder-${ts}`;

      const blockA = { id: 'blk-a', type: 'heading', order: 1, content: 'Block A', level: 1 };
      const blockB = { id: 'blk-b', type: 'text', order: 2, content: 'Block B', size: 'base' };
      const blockC = { id: 'blk-c', type: 'button', order: 3, text: 'Block C', url: '/c', variant: 'primary' };

      const { post, cleanup } = await createTestPost(clientApi, SITE_ID, {
        title: `Reorder Test ${ts}`,
        slug,
        content: blockContent([blockA, blockB, blockC]),
      });
      cleanups.push(cleanup);

      // Confirm initial order
      const initial = await clientApi.get(
        `/api/portal/cms/websites/${SITE_ID}/posts/${post.id}`
      );
      expect(initial.status).toBe(200);
      const initParsed = JSON.parse(initial.data.data.content);
      expect(initParsed.blocks.map((b: { id: string }) => b.id)).toEqual([
        'blk-a', 'blk-b', 'blk-c',
      ]);

      // Simulate BLOCKS_REORDERED → editor calls PUT with reordered tree
      // (order C → A → B)
      const reordered = [
        { ...blockC, order: 1 },
        { ...blockA, order: 2 },
        { ...blockB, order: 3 },
      ];
      const putRes = await clientApi.put(
        `/api/portal/cms/websites/${SITE_ID}/posts/${post.id}`,
        { content: blockContent(reordered) }
      );
      expect(putRes.status).toBe(200);
      expect(putRes.data.success).toBe(true);

      // GET must return the new order
      const getRes = await clientApi.get(
        `/api/portal/cms/websites/${SITE_ID}/posts/${post.id}`
      );
      expect(getRes.status).toBe(200);
      const saved = JSON.parse(getRes.data.data.content);
      expect(saved.blocks.map((b: { id: string }) => b.id)).toEqual([
        'blk-c', 'blk-a', 'blk-b',
      ]);
    }
  );
});

// ── Card 10: Page settings (title, SEO meta, slug) survive reload ─────────────

test.describe('Visual Editor — page settings persist across reload @visual-editor', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'PUT title + slug + seoTitle + seoDescription → GET returns updated values @critical',
    async ({ clientApi }) => {
      const ts = Date.now();
      const origSlug = `ve-page-settings-orig-${ts}`;
      const { post, cleanup } = await createTestPost(clientApi, SITE_ID, {
        title: `Original Title ${ts}`,
        slug: origSlug,
        content: blockContent([]),
      });
      cleanups.push(cleanup);

      const newTitle = `Updated Title ${ts}`;
      const newSlug = `ve-page-settings-upd-${ts}`;
      const newSeoTitle = `SEO Title ${ts}`;
      const newSeoDescription = `SEO description for post ${ts}`;

      const putRes = await clientApi.put(
        `/api/portal/cms/websites/${SITE_ID}/posts/${post.id}`,
        {
          title: newTitle,
          slug: newSlug,
          seoTitle: newSeoTitle,
          seoDescription: newSeoDescription,
        }
      );
      expect(putRes.status).toBe(200);
      expect(putRes.data.success).toBe(true);
      expect(putRes.data.data.title).toBe(newTitle);
      expect(putRes.data.data.slug).toBe(newSlug);
      expect(putRes.data.data.seoTitle).toBe(newSeoTitle);
      expect(putRes.data.data.seoDescription).toBe(newSeoDescription);

      // Simulate "reload": fresh GET must return the saved values
      const getRes = await clientApi.get(
        `/api/portal/cms/websites/${SITE_ID}/posts/${post.id}`
      );
      expect(getRes.status).toBe(200);
      const data = getRes.data.data;
      expect(data.title).toBe(newTitle);
      expect(data.slug).toBe(newSlug);
      expect(data.seoTitle).toBe(newSeoTitle);
      expect(data.seoDescription).toBe(newSeoDescription);
    }
  );

  test('PUT slug collision returns 400', async ({ clientApi }) => {
    const ts = Date.now();
    // Create two posts; try to give the second one the first's slug
    const slugA = `ve-slug-a-${ts}`;
    const slugB = `ve-slug-b-${ts}`;

    const { post: postA, cleanup: cleanA } = await createTestPost(clientApi, SITE_ID, {
      title: `Slug A ${ts}`, slug: slugA, content: blockContent([]),
    });
    const { post: postB, cleanup: cleanB } = await createTestPost(clientApi, SITE_ID, {
      title: `Slug B ${ts}`, slug: slugB, content: blockContent([]),
    });
    cleanups.push(cleanA, cleanB);

    // Try to rename postB's slug to slugA (collision)
    const collideRes = await clientApi.put(
      `/api/portal/cms/websites/${SITE_ID}/posts/${postB.id}`,
      { slug: slugA }
    );
    expect(collideRes.status).toBe(400);
    expect(collideRes.data.success).toBe(false);
  });

  test('unauthenticated PUT returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.put(
      `/api/portal/cms/websites/${SITE_ID}/posts/999999`,
      { title: 'Hack' }
    );
    expect(res.status).toBe(401);
  });
});
