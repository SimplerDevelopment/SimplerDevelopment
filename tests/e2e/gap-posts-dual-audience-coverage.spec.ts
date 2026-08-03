/**
 * Posts dual-audience authz / tenant-scope regression
 *   @gap @posts-dual-audience @critical
 *
 * Closes four adversarial-audit findings (docs/audits/portal-e2e-adversarial-audit-2026-06-25.md):
 *   admin-post-schedule-no-auth      → PATCH /api/posts/[id]/schedule had zero auth
 *   admin-custom-fields-no-auth      → GET/PUT /api/posts/[id]/custom-fields had zero auth
 *   admin-calendar-no-auth           → GET /api/posts/calendar leaked all tenants' posts
 *   admin-posts-global-no-tenant-scope → GET /api/posts returned every tenant's posts
 *
 * These routes are DUAL-AUDIENCE: the shared ContentCalendar + post-form
 * components render in BOTH the global admin panel and the per-tenant portal.
 * The fix allows admin/editor staff OR a portal user scoped to the post's own
 * site/client. This spec fails if any hole reopens:
 *   - unauthenticated  → 401
 *   - portal user on a post/website they do NOT own → 403
 *   - portal owner / admin (legit callers) → 200, and a portal list excludes
 *     posts belonging to other tenants.
 */

import { test, expect } from './setup/fixtures';
import { runCleanups, resolveClientSiteId, createTestPost } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

// A wide window so seeded posts always fall inside the calendar range.
const RANGE =
  `start=${new Date(Date.now() - 30 * 864e5).toISOString()}` +
  `&end=${new Date(Date.now() + 30 * 864e5).toISOString()}`;

test.describe('Posts dual-audience authz regression @gap @posts-dual-audience @critical', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let ownedPostId: number; // post on the portal client's own website
  let foreignPostId: number; // global/admin post the portal client does NOT own

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('setup: seed an owned post (portal) and a foreign global post (admin)', async ({
    clientApi,
    adminApi,
  }) => {
    siteId = await resolveClientSiteId(clientApi);
    const { post, cleanup } = await createTestPost(clientApi, siteId, { published: false });
    ownedPostId = post.id;
    cleanups.push(cleanup);

    const ts = Date.now();
    const created = await adminApi.post('/api/posts', {
      title: `e2e-global-${ts}`,
      slug: `e2e-global-${ts}`,
      content: JSON.stringify({ blocks: [], version: '1.0' }),
      postType: 'blog',
      published: false,
    });
    expect(created.status).toBe(201);
    foreignPostId = created.data.data.id as number;
    cleanups.push(async () => {
      await adminApi.delete(`/api/posts/${foreignPostId}`).catch(() => {});
    });
  });

  // ── PATCH /api/posts/[id]/schedule ────────────────────────────────────────
  test('schedule: unauthenticated → 401', async ({ unauthApi }) => {
    const res = await unauthApi.patch(`/api/posts/${ownedPostId}/schedule`, { publishedAt: null });
    expect(res.status).toBe(401);
  });

  test('schedule: portal owner → 200', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/posts/${ownedPostId}/schedule`, { publishedAt: null });
    expect(res.status).toBe(200);
  });

  test('schedule: portal user on a post they do not own → 403', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/posts/${foreignPostId}/schedule`, { publishedAt: null });
    expect(res.status).toBe(403);
  });

  test('schedule: admin on any post → 200', async ({ adminApi }) => {
    const res = await adminApi.patch(`/api/posts/${foreignPostId}/schedule`, { publishedAt: null });
    expect(res.status).toBe(200);
  });

  // ── GET/PUT /api/posts/[id]/custom-fields ─────────────────────────────────
  test('custom-fields GET: unauthenticated → 401', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/posts/${ownedPostId}/custom-fields`);
    expect(res.status).toBe(401);
  });

  test('custom-fields GET: portal owner → 200', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/posts/${ownedPostId}/custom-fields`);
    expect(res.status).toBe(200);
  });

  test('custom-fields GET: portal user on a foreign post → 403', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/posts/${foreignPostId}/custom-fields`);
    expect(res.status).toBe(403);
  });

  test('custom-fields PUT: unauthenticated → 401', async ({ unauthApi }) => {
    const res = await unauthApi.put(`/api/posts/${ownedPostId}/custom-fields`, {
      customFieldId: 999999,
      value: 'x',
    });
    expect(res.status).toBe(401);
  });

  test('custom-fields PUT: portal user on a foreign post → 403', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/posts/${foreignPostId}/custom-fields`, {
      customFieldId: 999999,
      value: 'x',
    });
    expect(res.status).toBe(403);
  });

  // ── GET /api/posts/calendar ───────────────────────────────────────────────
  test('calendar: unauthenticated → 401', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/posts/calendar?${RANGE}`);
    expect(res.status).toBe(401);
  });

  test('calendar: portal user without websiteId → 403', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/posts/calendar?${RANGE}`);
    expect(res.status).toBe(403);
  });

  test('calendar: portal user on an owned websiteId → 200', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/posts/calendar?${RANGE}&websiteId=${siteId}`);
    expect(res.status).toBe(200);
  });

  test('calendar: portal user on a websiteId they do not own → 403', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/posts/calendar?${RANGE}&websiteId=99999999`);
    expect(res.status).toBe(403);
  });

  test('calendar: admin without websiteId → 200', async ({ adminApi }) => {
    const res = await adminApi.get(`/api/posts/calendar?${RANGE}`);
    expect(res.status).toBe(200);
  });

  // ── GET /api/posts (list) ─────────────────────────────────────────────────
  test('list: unauthenticated → 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/posts');
    expect(res.status).toBe(401);
  });

  test('list: admin → 200 and sees the global post', async ({ adminApi }) => {
    const res = await adminApi.get('/api/posts?limit=100');
    expect(res.status).toBe(200);
    const ids = ((res.data?.data ?? []) as Array<{ id: number }>).map((p) => p.id);
    expect(ids).toContain(foreignPostId);
  });

  test('list: portal user → 200 and does NOT see another tenant/global post', async ({
    clientApi,
  }) => {
    const res = await clientApi.get('/api/posts?limit=100');
    expect(res.status).toBe(200);
    const ids = ((res.data?.data ?? []) as Array<{ id: number }>).map((p) => p.id);
    expect(ids).not.toContain(foreignPostId);
  });
});
