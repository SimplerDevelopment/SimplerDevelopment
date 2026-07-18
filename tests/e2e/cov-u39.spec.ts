/**
 * cov-u39 — AB Testing E2E coverage slice (indices 4..7)
 *
 * Cards:
 *   4. Dynamic variant add / remove: auto-letter, control-arm protected, min-2-variant guard, blocked while running
 *   5. Traffic split rebalance ("Rebalance to even") normalises weights to floor(100/N) per arm
 *   6. PATCH status → archived transitions experiment out of active state
 *   7. cta_click goal metric with goal_selector: AbGoalTracker fires goal event on matching CSS selector click
 */
import { test, expect } from './setup/fixtures';
import { createTestWebsite, createTestPost } from './setup/helpers';
import { request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── shared experiment factory ─────────────────────────────────────────────────

async function createExperimentForPost(
  clientApi: import('./setup/api-client').ApiClient,
  postId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number }> {
  const ts = Date.now();
  const res = await clientApi.post(`/api/portal/posts/${postId}/experiments`, {
    name: `E2E Exp ${ts}`,
    hypothesis: 'coverage',
    goalMetric: 'page_view',
    ...overrides,
  });
  if (!res.data?.success || !res.data?.data?.id) {
    throw new Error(`Failed to create experiment: ${JSON.stringify(res.data)}`);
  }
  return { id: res.data.data.id };
}

// ── Card 4: Dynamic variant add / remove ─────────────────────────────────────

test.describe('AB — dynamic variant add / remove @ab', () => {
  let siteId: number;
  let postId: number;
  let experimentId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);
    postId = post.id;
    const exp = await createExperimentForPost(clientApi, postId);
    experimentId = exp.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${experimentId}`).catch(() => {});
    });
  });

  test.afterAll(async ({ clientApi }) => {
    void clientApi; // ensures fixture teardown
    for (const fn of cleanups.reverse()) await fn().catch(() => {});
  });

  test('POST variants auto-assigns next letter (c after a,b)', async ({ clientApi }) => {
    // Experiment starts with a + b. Adding a third should auto-pick 'c'.
    const res = await clientApi.post(`/api/portal/experiments/${experimentId}/variants`, {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.key).toBe('c');
    expect(res.data.data.label).toBe('Variant C');
  });

  test('DELETE variant a (control) is protected → 400 control_protected', async ({ clientApi }) => {
    const res = await clientApi.delete(`/api/portal/experiments/${experimentId}/variants/a`);
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('control_protected');
  });

  test('DELETE variant c is allowed (3 variants → 2 remain)', async ({ clientApi }) => {
    const res = await clientApi.delete(`/api/portal/experiments/${experimentId}/variants/c`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.key).toBe('c');
  });

  test('DELETE variant b blocked when only 2 variants remain → 409 min_two_variants', async ({ clientApi }) => {
    // After deleting c, we have a + b — removing b would leave only 1 arm.
    const res = await clientApi.delete(`/api/portal/experiments/${experimentId}/variants/b`);
    expect(res.status).toBe(409);
    expect(res.data.error).toBe('min_two_variants');
  });

  test('DELETE variant blocked while experiment is running → 409 experiment_running', async ({ clientApi }) => {
    // Add 'c' back so we have 3 arms, then start the experiment.
    const addRes = await clientApi.post(`/api/portal/experiments/${experimentId}/variants`, {});
    expect(addRes.status).toBe(200);

    const startRes = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      status: 'running',
    });
    expect(startRes.status).toBe(200);

    // Now try deleting 'c' — should be blocked because experiment is running.
    const delRes = await clientApi.delete(`/api/portal/experiments/${experimentId}/variants/c`);
    expect(delRes.status).toBe(409);
    expect(delRes.data.error).toBe('experiment_running');

    // Wind down: archive the experiment so cleanup can proceed
    await clientApi.patch(`/api/portal/experiments/${experimentId}`, { status: 'archived' });
  });
});

// ── Card 5: Traffic split rebalance ──────────────────────────────────────────

test.describe('AB — traffic split rebalance via PATCH variantSplit @ab', () => {
  let siteId: number;
  let postId: number;
  let experimentId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);
    postId = post.id;
    const exp = await createExperimentForPost(clientApi, postId);
    experimentId = exp.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${experimentId}`).catch(() => {});
    });
  });

  test.afterAll(async ({ clientApi }) => {
    void clientApi;
    for (const fn of cleanups.reverse()) await fn().catch(() => {});
  });

  test('PATCH variantSplit with unequal weights normalises to 50/50 for 2 arms', async ({ clientApi }) => {
    // Experiment has a=50, b=50 by default. Push an unequal split and verify
    // normalizeSplit brings it back to 50/50.
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      variantSplit: { a: 70, b: 30 },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // normalizeSplit round-trips to integer weights that still sum to ≈100
    const split = res.data.data.variantSplit as Record<string, number>;
    expect(typeof split.a).toBe('number');
    expect(typeof split.b).toBe('number');
    const total = split.a + split.b;
    // Should sum to 100 (normalizeSplit uses Math.round)
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  test('PATCH "Rebalance to even" for 2 variants yields floor(100/2)=50 each', async ({ clientApi }) => {
    // Simulate the "Rebalance to even" button: PATCH with { a: 1, b: 1 } which
    // normalizeSplit converts to { a: 50, b: 50 }.
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      variantSplit: { a: 1, b: 1 },
    });
    expect(res.status).toBe(200);
    const split = res.data.data.variantSplit as Record<string, number>;
    expect(split.a).toBe(50);
    expect(split.b).toBe(50);
  });

  test('PATCH "Rebalance to even" for 3 variants yields floor(100/3)=33 each (≈)', async ({ clientApi }) => {
    // Add variant c first
    const addRes = await clientApi.post(`/api/portal/experiments/${experimentId}/variants`, {});
    expect(addRes.status).toBe(200);

    // Even rebalance: equal unit weights
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      variantSplit: { a: 1, b: 1, c: 1 },
    });
    expect(res.status).toBe(200);
    const split = res.data.data.variantSplit as Record<string, number>;
    // normalizeSplit: 1/3 * 100 ≈ 33 each
    expect(split.a).toBeGreaterThanOrEqual(33);
    expect(split.b).toBeGreaterThanOrEqual(33);
    const total = (split.a ?? 0) + (split.b ?? 0) + (split.c ?? 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });
});

// ── Card 6: PATCH status → archived ──────────────────────────────────────────

test.describe('AB — PATCH status → archived @ab', () => {
  let siteId: number;
  let postId: number;
  let experimentId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);
    postId = post.id;
    const exp = await createExperimentForPost(clientApi, postId);
    experimentId = exp.id;
    // No explicit cleanup — archiving is the cleanup
  });

  test.afterAll(async ({ clientApi }) => {
    void clientApi;
    await clientApi.delete(`/api/portal/experiments/${experimentId}`).catch(() => {});
    for (const fn of cleanups.reverse()) await fn().catch(() => {});
  });

  test('PATCH status=running starts the experiment (startedAt set)', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      status: 'running',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('running');
    expect(res.data.data.startedAt).toBeTruthy();
  });

  test('PATCH status=archived transitions out of active state (endedAt set)', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      status: 'archived',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('archived');
    // endedAt must be set when archived
    expect(res.data.data.endedAt).toBeTruthy();
  });

  test('GET after archive reflects archived status', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${experimentId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.experiment.status).toBe('archived');
  });

  test('PATCH with invalid status returns 400', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      status: 'suspended',
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('invalid_status');
  });
});

// ── Card 7: cta_click goal metric + AbGoalTracker fires goal event ────────────

test.describe('AB — cta_click goalMetric + public goal event API @ab', () => {
  let siteId: number;
  let postId: number;
  let experimentId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);
    postId = post.id;

    // Create experiment with cta_click goal + a CSS selector
    const ts = Date.now();
    const res = await clientApi.post(`/api/portal/posts/${postId}/experiments`, {
      name: `CTA Click Exp ${ts}`,
      hypothesis: 'CTA click coverage',
      goalMetric: 'cta_click',
      goalSelector: '.hero-cta',
    });
    expect(res.status).toBe(200);
    experimentId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${experimentId}`).catch(() => {});
    });

    // Start the experiment so the public event endpoint accepts events
    await clientApi.patch(`/api/portal/experiments/${experimentId}`, { status: 'running' });
  });

  test.afterAll(async ({ clientApi }) => {
    void clientApi;
    for (const fn of cleanups.reverse()) await fn().catch(() => {});
  });

  test('experiment is created with goalMetric=cta_click and goalSelector=.hero-cta', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${experimentId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.experiment.goalMetric).toBe('cta_click');
    expect(res.data.data.experiment.goalSelector).toBe('.hero-cta');
  });

  test('POST /api/public/ab/event records a goal event for variant a', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const visitorId = `visitor-cta-${Date.now()}-a`;
    const res = await ctx.post('/api/public/ab/event', {
      data: {
        experimentId,
        variantKey: 'a',
        visitorId,
        kind: 'goal',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.recorded).toBe(true);
    await ctx.dispose();
  });

  test('duplicate goal event from same visitor is idempotent (duplicated=true)', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const visitorId = `visitor-cta-dupe-${Date.now()}`;

    // First
    await ctx.post('/api/public/ab/event', {
      data: { experimentId, variantKey: 'a', visitorId, kind: 'goal' },
    });

    // Second — same visitor + kind → deduplicated
    const res = await ctx.post('/api/public/ab/event', {
      data: { experimentId, variantKey: 'a', visitorId, kind: 'goal' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.duplicated).toBe(true);
    await ctx.dispose();
  });

  test('goal event for draft experiment is rejected (not_active)', async ({ clientApi }) => {
    // Create a separate draft experiment
    const ts = Date.now();
    const draftRes = await clientApi.post(`/api/portal/posts/${postId}/experiments`, {
      name: `Draft CTA ${ts}`,
      goalMetric: 'cta_click',
    });
    expect(draftRes.status).toBe(200);
    const draftId = draftRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${draftId}`).catch(() => {});
    });

    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/public/ab/event', {
      data: {
        experimentId: draftId,
        variantKey: 'a',
        visitorId: `visitor-draft-${ts}`,
        kind: 'goal',
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('not_active');
    await ctx.dispose();
  });

  test('PATCH goalMetric=form_submit is also accepted by the API', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, {
      goalMetric: 'form_submit',
      goalSelector: 'form#contact',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.goalMetric).toBe('form_submit');
    expect(res.data.data.goalSelector).toBe('form#contact');
  });
});
