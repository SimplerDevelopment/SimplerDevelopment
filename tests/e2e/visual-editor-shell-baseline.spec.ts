/**
 * Visual Editor Shell — pre-refactor baseline (@critical).
 *
 * The shell at components/portal/VisualEditorShell.tsx is being refactored
 * into focused modules. To gate the work we pin the API surface that the
 * shell drives: create a post with blocks, read it back, mutate via the
 * "save" path the editor uses, and confirm the public site picks up the
 * change. If this passes pre-refactor and post-refactor without changes,
 * the shell's externally observable behaviour was preserved.
 *
 * UI-level Playwright coverage is intentionally light here — see
 * `tests/integration/visual-editor/shell-baseline.test.tsx` for the
 * component-level structural pins. Running a browser harness against the
 * iframe-driven editor needs a dev server + seeded site, which is out of
 * scope for the auto-loop CI gate.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, resolveClientSiteId } from './setup/helpers';
import { ApiClient } from './setup/api-client';

test.describe.configure({ mode: 'serial' });

// SITE_ID was hard-coded to 1 (which belongs to a different client than
// client@example.com in many local DB states), so every CMS request 404'd.
// Resolve dynamically from the logged-in client's first website instead.
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

async function createPost(api: ApiClient, slug: string, blocks: unknown[]) {
  const res = await api.post(`/api/portal/cms/websites/${SITE_ID}/posts`, {
    title: `Shell Baseline ${slug}`,
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

test.describe('Visual Editor Shell — refactor baseline @critical @visual-editor', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('shell save path round-trips a multi-block document', async ({ clientApi, unauthApi }) => {
    const slug = `ve-shell-baseline-${Date.now()}`;
    const initialBlocks = [
      { id: 'h1', type: 'heading', order: 1, content: 'Original Title', level: 2 },
      { id: 't1', type: 'text', order: 2, content: 'Lead paragraph.', size: 'base' },
      { id: 'b1', type: 'button', order: 3, text: 'Click me', url: '/about', variant: 'primary' },
    ];

    const post = await createPost(clientApi, slug, initialBlocks);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    // Verify the public surface — the iframe inside the shell pulls from
    // the same envelope, so this is the contract the editor renders against.
    const pub = await getPublicPost(unauthApi, slug);
    expect(pub.status).toBe(200);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks).toHaveLength(3);
    expect(content.blocks[0].type).toBe('heading');
    expect(content.blocks[2].type).toBe('button');

    // Apply a "save" — the same endpoint the shell's right-panel edits and
    // post-form save button hit when the user commits a change.
    await updatePost(clientApi, post.id, [
      { id: 'h1', type: 'heading', order: 1, content: 'Renamed Title', level: 1 },
      { id: 't1', type: 'text', order: 2, content: 'Updated lead paragraph.', size: 'lg', alignment: 'center' },
      { id: 'b1', type: 'button', order: 3, text: 'Click me', url: '/about', variant: 'primary' },
      { id: 's1', type: 'spacer', order: 4, height: 'lg' },
    ]);

    const updated = await getPublicPost(unauthApi, slug);
    const updatedContent = JSON.parse(updated.data.data.content);
    expect(updatedContent.blocks).toHaveLength(4);
    expect(updatedContent.blocks[0].content).toBe('Renamed Title');
    expect(updatedContent.blocks[0].level).toBe(1);
    expect(updatedContent.blocks[1].alignment).toBe('center');
    expect(updatedContent.blocks[3].type).toBe('spacer');
  });

  test('shell save path preserves nested column layouts', async ({ clientApi, unauthApi }) => {
    const slug = `ve-shell-cols-${Date.now()}`;
    const post = await createPost(clientApi, slug, [
      {
        id: 'cols1',
        type: 'columns',
        order: 1,
        columns: [
          { id: 'col-a', width: 50, blocks: [{ id: 'col-a-text', type: 'text', order: 1, content: 'Left' }] },
          { id: 'col-b', width: 50, blocks: [{ id: 'col-b-text', type: 'text', order: 1, content: 'Right' }] },
        ],
      },
    ]);
    cleanups.push(async () => { await deletePost(clientApi, post.id); });

    const pub = await getPublicPost(unauthApi, slug);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].type).toBe('columns');
    expect(content.blocks[0].columns).toHaveLength(2);
    expect(content.blocks[0].columns[0].blocks[0].content).toBe('Left');
    expect(content.blocks[0].columns[1].blocks[0].content).toBe('Right');
  });
});
