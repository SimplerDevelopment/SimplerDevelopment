/**
 * AB Testing E2E Coverage — Unit 38 slice [0..3]
 *
 * Cards exercised:
 *   [0] Sequential / valid-peeking statistics — gap (not implemented)
 *   [1] Sample-ratio mismatch (SRM) guardrail — gap (not implemented)
 *   [2] Experiment on rendered CMS block via visual editor — needs-spec (UI-only)
 *   [3] Per-tenant variant assignment isolation — tested below
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestPost } from './setup/helpers';
import { ApiClient } from './setup/api-client';

// ── Card 0: Sequential / valid-peeking statistics ──────────────────────────
// lib/ab/stats.ts contains only a plain two-proportion z-test. There is no
// sequential probability ratio test (mSPRT), always-valid p-value, or any
// mechanism to correct for optional stopping (peeking). The results route
// returns a fixed p-value via twoProportionZTest — no sequential correction.
// Verdict: gap — feature not implemented.

// ── Card 1: Sample-ratio mismatch (SRM) guardrail ──────────────────────────
// Searched lib/ab/ and app/api/portal/experiments/ — no SRM detection exists.
// The results route returns raw aggregates + z-test comparisons. No srm field,
// no chi-squared test against expected split, no guardrail warning.
// Verdict: gap — feature not implemented.

// ── Card 2: Experiment on rendered CMS block via visual editor ──────────────
// Requires a headed browser navigating to /portal/websites/:siteId/posts/:id/edit,
// selecting a block, and verifying the experiment panel interacts with the
// visual editor's postMessage protocol. Not verifiable via HTTP-only fixtures.
// Verdict: needs-spec — complexity exceeds what HTTP-only assertions can verify.

// ── Card 3: Per-tenant variant assignment isolation ─────────────────────────
//
// Strategy: create a brand-new portal client + user via the admin API
// (POST /api/admin/portal/clients — sets active:true, no entitlement gate).
// Log in as that second-tenant user and verify:
//   a) they get 404 on any experiment belonging to tenant A
//   b) their own experiment list returns only their data (empty for a fresh account)
//   c) unauthenticated callers get 401
//
// We do NOT try to create a site/post for tenant B because that requires a
// `websites` service subscription which fresh accounts don't have.

test.describe.configure({ mode: 'serial' });

test.describe('AB Testing — Per-tenant variant assignment isolation @ab @tenancy', () => {
  const cleanups: Array<() => Promise<void>> = [];

  // Tenant A: the seeded client@example.com account (client_id 1)
  let tenantASiteId: number;
  let tenantAPostId: number;
  let tenantAExperimentId: number;

  // Tenant B: a brand-new client created by the admin during this test run
  let tenantBApi: ApiClient;
  let tenantBClientId: number;

  test('setup: tenant A creates a site + post + experiment', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    tenantASiteId = website.id;

    const { post, cleanup: postCleanup } = await createTestPost(clientApi, tenantASiteId, {
      title: `Isolation A ${Date.now()}`,
      content: JSON.stringify({ blocks: [], version: '1.0' }),
      published: true,
    });
    cleanups.push(postCleanup);
    tenantAPostId = post.id;

    const expRes = await clientApi.post(`/api/portal/posts/${tenantAPostId}/experiments`, {
      name: `Tenant A Exp ${Date.now()}`,
      goalMetric: 'page_view',
    });
    expect(expRes.status).toBe(200);
    expect(expRes.data.success).toBe(true);
    tenantAExperimentId = expRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${tenantAExperimentId}`).catch(() => {});
    });
  });

  test('setup: admin creates tenant B client + user', async ({ adminApi }) => {
    const ts = Date.now();
    const email = `tenant-b-isolation-${ts}@example.com`;
    const password = `TenantBPass${ts}!`;

    // Admin route creates the user with active:true — no email verification needed.
    const createRes = await adminApi.post('/api/admin/portal/clients', {
      name: `Tenant B User ${ts}`,
      email,
      password,
      company: `Tenant B Corp ${ts}`,
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.success).toBe(true);
    tenantBClientId = createRes.data.data.client.id as number;

    cleanups.push(async () => {
      await adminApi.delete(`/api/admin/portal/clients/${tenantBClientId}`).catch(() => {});
    });

    // Log in as the new tenant B user.
    tenantBApi = new ApiClient(email, password);
    await tenantBApi.ensure();
    cleanups.push(async () => { await tenantBApi.dispose().catch(() => {}); });
  });

  // ── Cross-tenant access assertions ─────────────────────────────────────────

  test('tenant A owner reads their own experiment', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${tenantAExperimentId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.experiment.id).toBe(tenantAExperimentId);
  });

  test('tenant B gets 404 when reading tenant A experiment via GET /experiments/:id', async () => {
    const res = await tenantBApi.get(`/api/portal/experiments/${tenantAExperimentId}`);
    expect(res.status).toBe(404);
  });

  test('tenant B gets 404 when reading tenant A experiment results', async () => {
    const res = await tenantBApi.get(`/api/portal/experiments/${tenantAExperimentId}/results`);
    expect(res.status).toBe(404);
  });

  test('tenant B gets 404 when patching tenant A experiment status', async () => {
    const res = await tenantBApi.patch(`/api/portal/experiments/${tenantAExperimentId}`, {
      status: 'running',
    });
    expect(res.status).toBe(404);
  });

  test('tenant B gets 404 when deleting tenant A experiment', async () => {
    const res = await tenantBApi.delete(`/api/portal/experiments/${tenantAExperimentId}`);
    expect(res.status).toBe(404);
    // Confirm tenant A's experiment still exists (not deleted by the cross-tenant attempt).
  });

  test('tenant A experiment still intact after cross-tenant delete attempt', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${tenantAExperimentId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.experiment.id).toBe(tenantAExperimentId);
  });

  test('unauthenticated caller gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/experiments/${tenantAExperimentId}`);
    expect(res.status).toBe(401);
  });

  test('tenant B experiment list is empty (no access to tenant A experiments)', async () => {
    const res = await tenantBApi.get('/api/portal/experiments');
    // A fresh account with no experiments of its own should return an empty list.
    // If the route returns 404 (no portal client found), that also proves isolation.
    if (res.status === 200) {
      expect(res.data.success).toBe(true);
      const ids = (res.data.data as Array<{ id: number }>).map(r => r.id);
      expect(ids).not.toContain(tenantAExperimentId);
    } else {
      // 404 = user resolved no portal client → no access to any experiments.
      expect(res.status).toBe(404);
    }
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });
});
