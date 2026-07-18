/**
 * Portal CMS — gap-close lifecycle (@critical)
 *
 * Single rerunnable golden-path spec that exercises:
 *   1. Scheduled-publish lifecycle  — schedule a future publish, then clear it
 *   2. Revision revert lifecycle    — edit a post twice, fetch revisions,
 *                                     revert to an older revision
 *
 * Tagged @critical so it runs as part of the QA gate.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestPost } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS — scheduled-publish + revision-revert @cms @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;

  test.setTimeout(120_000);

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('schedule a future publish, then clear it', async ({ clientApi }) => {
    const { post, cleanup } = await createTestPost(clientApi, siteId, {
      title: `Sched ${Date.now()}`,
      published: false,
    });
    cleanups.push(cleanup);

    // Schedule for an hour from now via PATCH /api/posts/[id]/schedule
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sched = await clientApi.patch(`/api/posts/${post.id}/schedule`, {
      publishedAt: future,
      published: false,
    });
    expect(sched.status).toBe(200);
    expect(sched.data.success).toBe(true);
    expect(sched.data.data.published).toBe(false);
    expect(new Date(sched.data.data.publishedAt).getTime()).toBeGreaterThan(Date.now());

    // It should appear on the calendar with status='scheduled'
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const cal = await clientApi.get(`/api/posts/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&websiteId=${siteId}`);
    expect(cal.status).toBe(200);
    const calRow = cal.data.data.find((p: { id: number; status: string }) => p.id === post.id);
    expect(calRow).toBeTruthy();
    expect(calRow.status).toBe('scheduled');

    // Clear the schedule
    const clear = await clientApi.patch(`/api/posts/${post.id}/schedule`, { publishedAt: null });
    expect(clear.status).toBe(200);
    expect(clear.data.data.publishedAt).toBeNull();
  });

  test('edit twice, list revisions, revert to the earliest revision', async ({ clientApi }) => {
    const { post, cleanup } = await createTestPost(clientApi, siteId, {
      title: `Original ${Date.now()}`,
      published: false,
    });
    cleanups.push(cleanup);

    // Edit #1 — content + title change → triggers a revision row
    const edit1 = await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, {
      title: 'After edit 1',
      content: JSON.stringify({ blocks: [{ type: 'text', value: 'edit-1' }], version: '1.0' }),
      revisionTrigger: 'manual',
    });
    expect(edit1.status).toBe(200);

    // Edit #2 — second revision row
    const edit2 = await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, {
      title: 'After edit 2',
      content: JSON.stringify({ blocks: [{ type: 'text', value: 'edit-2' }], version: '1.0' }),
      revisionTrigger: 'manual',
    });
    expect(edit2.status).toBe(200);

    // List revisions — must contain at least 2, ordered desc by createdAt
    const list = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts/${post.id}/revisions`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.data.data)).toBe(true);
    expect(list.data.data.length).toBeGreaterThanOrEqual(2);

    // The OLDEST revision is the one captured during edit #1 (because the
    // PUT route stores the post's content AS IT IS RIGHT NOW — i.e. AFTER
    // the update — so the row from edit #1 captures "edit-1" content).
    const oldest = list.data.data[list.data.data.length - 1];
    expect(oldest).toHaveProperty('id');

    // Revert to it
    const revert = await clientApi.post(`/api/portal/cms/websites/${siteId}/posts/${post.id}/revisions`, {
      revisionId: oldest.id,
    });
    expect(revert.status).toBe(200);
    expect(revert.data.success).toBe(true);

    // Confirm the post now reflects the reverted state
    const after = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts/${post.id}`);
    expect(after.status).toBe(200);
    expect(after.data.data.title).toBe('After edit 1');

    // The revert itself should have created a new revision row capturing
    // the pre-revert state (edit #2). So total revisions ≥ 3.
    const list2 = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts/${post.id}/revisions`);
    expect(list2.status).toBe(200);
    expect(list2.data.data.length).toBeGreaterThanOrEqual(3);
  });
});
