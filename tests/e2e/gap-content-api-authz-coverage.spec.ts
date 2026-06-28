/**
 * Content API authz-bypass regression spec @gap @content-api-authz @critical
 *
 * Gaps covered:
 *  Five admin-only content API routes previously had ZERO auth checks and
 *  were reachable unauthenticated. They are now guarded by requireAdminOrEditor()
 *  from lib/admin/auth.ts. This spec asserts that an unauthenticated caller
 *  receives 401 from every handler on every route.
 *
 *  Routes covered:
 *   GET  /api/categories
 *   POST /api/categories
 *   GET  /api/categories/1
 *   PUT  /api/categories/1
 *   DELETE /api/categories/1
 *   GET  /api/tags/1
 *   PUT  /api/tags/1
 *   DELETE /api/tags/1
 *   GET  /api/post-types
 *   POST /api/post-types
 *   GET  /api/post-types/1
 *   PUT  /api/post-types/1
 *   DELETE /api/post-types/1
 */

import { test, expect } from './setup/fixtures';

test.describe('Content API authz-bypass regression @gap @content-api-authz @critical', () => {

  // ── /api/categories (collection) ─────────────────────────────────────────────

  test('GET /api/categories returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.get('/api/categories');
    expect(res.status()).toBe(401);
  });

  test('POST /api/categories returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.post('/api/categories', {
      data: { name: 'e2e-unauth', slug: 'e2e-unauth' },
    });
    expect(res.status()).toBe(401);
  });

  // ── /api/categories/[id] (item) ───────────────────────────────────────────────

  test('GET /api/categories/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.get('/api/categories/1');
    expect(res.status()).toBe(401);
  });

  test('PUT /api/categories/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.put('/api/categories/1', {
      data: { name: 'e2e-unauth-put' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/categories/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.delete('/api/categories/1');
    expect(res.status()).toBe(401);
  });

  // ── /api/tags/[id] (item) ─────────────────────────────────────────────────────

  test('GET /api/tags/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.get('/api/tags/1');
    expect(res.status()).toBe(401);
  });

  test('PUT /api/tags/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.put('/api/tags/1', {
      data: { name: 'e2e-unauth-put' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/tags/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.delete('/api/tags/1');
    expect(res.status()).toBe(401);
  });

  // ── /api/post-types (collection) ──────────────────────────────────────────────

  test('GET /api/post-types returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.get('/api/post-types');
    expect(res.status()).toBe(401);
  });

  test('POST /api/post-types returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.post('/api/post-types', {
      data: { name: 'e2e-unauth', slug: 'e2e-unauth', icon: 'article', active: true },
    });
    expect(res.status()).toBe(401);
  });

  // ── /api/post-types/[id] (item) ───────────────────────────────────────────────

  test('GET /api/post-types/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.get('/api/post-types/1');
    expect(res.status()).toBe(401);
  });

  test('PUT /api/post-types/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.put('/api/post-types/1', {
      data: { name: 'e2e-unauth-put' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/post-types/1 returns 401 for unauthenticated caller', async ({ request }) => {
    const res = await request.delete('/api/post-types/1');
    expect(res.status()).toBe(401);
  });
});
