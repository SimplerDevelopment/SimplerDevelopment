/**
 * Scheduled post auto-publish @gap @scheduled-publish
 *
 * A post with scheduledPublishAt in the past is auto-published by the
 * process-scheduled-posts cron; a future-scheduled post is left alone.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, resolveClientSiteId, createTestPost } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Scheduled post auto-publish @gap @scheduled-publish', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let siteId: number;

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('PUT accepts scheduledPublishAt', async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);
    const { post, cleanup } = await createTestPost(clientApi, siteId, { published: false });
    cleanups.push(cleanup);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, {
      scheduledPublishAt: future,
    });
    expect(res.status).toBe(200);
    expect(sql(`SELECT scheduled_publish_at IS NOT NULL FROM posts WHERE id=${post.id}`)).toBe('t');
  });

  test('cron publishes a post scheduled in the past + clears the schedule', async ({ clientApi, request }) => {
    const { post, cleanup } = await createTestPost(clientApi, siteId, { published: false });
    cleanups.push(cleanup);
    // Schedule in the past via PUT.
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, { scheduledPublishAt: past });
    expect(sql(`SELECT published FROM posts WHERE id=${post.id}`)).toBe('f');

    const tick = await request.get('/api/cron/process-scheduled-posts', {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(tick.status()).toBe(200);

    expect(sql(`SELECT published FROM posts WHERE id=${post.id}`)).toBe('t');
    expect(sql(`SELECT scheduled_publish_at IS NULL FROM posts WHERE id=${post.id}`)).toBe('t');
    expect(sql(`SELECT published_at IS NOT NULL FROM posts WHERE id=${post.id}`)).toBe('t');
  });

  test('cron leaves a future-scheduled post unpublished', async ({ clientApi, request }) => {
    const { post, cleanup } = await createTestPost(clientApi, siteId, { published: false });
    cleanups.push(cleanup);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, { scheduledPublishAt: future });

    await request.get('/api/cron/process-scheduled-posts', { headers: { 'x-vercel-cron': '1' } });

    expect(sql(`SELECT published FROM posts WHERE id=${post.id}`)).toBe('f');
    expect(sql(`SELECT scheduled_publish_at IS NOT NULL FROM posts WHERE id=${post.id}`)).toBe('t');
  });

  test('cron requires auth', async ({ request }) => {
    const res = await request.get('/api/cron/process-scheduled-posts');
    expect(res.status()).toBe(401);
  });
});
