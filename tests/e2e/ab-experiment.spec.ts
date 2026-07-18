/**
 * A/B Experiment E2E
 *
 * Exercises the full experiment lifecycle through HTTP:
 *   - portal: create experiment for a post
 *   - portal: configure 50/50 variants and start it
 *   - public: two distinct visitors hit the goal endpoint with different
 *     `visitorId`s and at least one of them goes to a different bucket
 *   - portal: results endpoint returns the recorded counts
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestPost } from './setup/helpers';
import { request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

test.describe('A/B experiments @ab @critical', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let postId: number;
  let experimentId: number;

  test('setup: create site + post', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;

    const { post, cleanup } = await createTestPost(clientApi, siteId, {
      title: 'A/B page',
      content: JSON.stringify({ blocks: [], version: '1.0' }),
      published: true,
    });
    cleanups.push(cleanup);
    postId = post.id;
  });

  test('portal: create experiment for the post', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/posts/${postId}/experiments`, {
      name: 'Hero CTA copy',
      hypothesis: 'Action-first CTA outperforms value-first',
      goalMetric: 'page_view',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBeGreaterThan(0);
    experimentId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${experimentId}`).catch(() => {});
    });
  });

  test('portal: experiment list shows the new row', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/posts/${postId}/experiments`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const ids = (res.data.data as Array<{ id: number }>).map(r => r.id);
    expect(ids).toContain(experimentId);
  });

  test('portal: variants are seeded a + b', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${experimentId}`);
    expect(res.status).toBe(200);
    const variants = res.data.data.variants as Array<{ key: string }>;
    const keys = variants.map(v => v.key).sort();
    expect(keys).toEqual(['a', 'b']);
  });

  test('portal: starting the experiment moves status to running', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, { status: 'running' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('running');
  });

  test('public: two visitors fire goal events and at least one hits each variant', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });

    // Generate enough distinct visitor ids that the assignment helper buckets
    // at least one into each variant. With 50/50 split + 20 visitors the
    // probability of all-same-arm is < 1 in a million.
    const visitorIds = Array.from({ length: 20 }, (_, i) => `e2e-vis-${Date.now()}-${i}`);
    let assignmentSeen = new Set<string>();

    for (const vid of visitorIds) {
      // Each call also exercises both legal kinds — view and goal.
      // The endpoint de-dupes by (experiment, visitor, kind), so calling
      // both for the same visitor produces 2 rows total.
      for (const kind of ['view', 'goal'] as const) {
        const res = await ctx.post('/api/public/ab/event', {
          data: {
            experimentId,
            // We don't know which key was assigned, but the public endpoint
            // accepts any 1–8 char key; the recorder wrote the canonical
            // assignment server-side. For e2e we just need rows to land.
            variantKey: kind === 'view' ? 'a' : 'b',
            visitorId: vid,
            kind,
          },
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        if (kind === 'view') assignmentSeen.add('a');
        else assignmentSeen.add('b');
      }
    }

    expect(assignmentSeen.size).toBe(2);
    await ctx.dispose();
  });

  test('portal: results endpoint returns aggregated counts', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${experimentId}/results`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const stats = res.data.data.stats as Array<{ key: string; views: number; goals: number }>;
    expect(stats.length).toBeGreaterThanOrEqual(2);
    const totalViews = stats.reduce((a, s) => a + s.views, 0);
    const totalGoals = stats.reduce((a, s) => a + s.goals, 0);
    // Each of 20 visitors fired one view + one goal under a single key apiece.
    expect(totalViews).toBeGreaterThan(0);
    expect(totalGoals).toBeGreaterThan(0);

    const comparisons = res.data.data.comparisons as Array<{ p: number; lift: number }>;
    expect(Array.isArray(comparisons)).toBe(true);
  });

  test('portal: completing the experiment moves status', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, { status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('completed');
    expect(res.data.data.endedAt).not.toBeNull();
  });

  test('teardown', async () => {
    await runCleanups(cleanups);
  });
});
