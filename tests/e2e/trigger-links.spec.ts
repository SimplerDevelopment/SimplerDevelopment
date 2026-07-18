/**
 * Trigger Links E2E
 *
 * Covers the headline path: portal API can create a tracked shortlink,
 * the public /go/<slug> route 302-redirects to the destination, and the
 * click is logged.
 *
 * The redirect is intentionally not followed (`maxRedirects: 0`) so we
 * can assert the 302 + Location header. Click row presence is verified
 * via the detail endpoint, which also exercises the count + recent-clicks
 * projections.
 */

import { test, expect } from './setup/coverage-fixture';
import { runCleanups } from './setup/helpers';
import { request as pwRequest } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Trigger Links @automations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('create → redirect → click logged', async ({ clientApi }) => {
    // 1. Create a link
    const dest = 'https://example.com/landing';
    const createRes = await clientApi.post('/api/portal/trigger-links', {
      destinationUrl: dest,
      label: 'E2E Test Link',
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.success).toBe(true);
    const link = createRes.data.data.link;
    expect(link.id).toBeGreaterThan(0);
    expect(link.slug).toMatch(/^[a-z0-9-]{3,64}$/);
    expect(link.destinationUrl).toBe(dest);
    expect(link.label).toBe('E2E Test Link');
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/trigger-links/${link.id}`).catch(() => {});
    });

    // 2. Hit /go/<slug> as an unauthenticated client; expect 302.
    const browserCtx = await pwRequest.newContext({
      baseURL: BASE_URL,
      maxRedirects: 0,
      extraHTTPHeaders: {
        'user-agent': 'sd2026-e2e/1.0',
        referer: 'https://referrer.example.com/',
      },
    });
    const goRes = await browserCtx.get(`/go/${link.slug}`);
    expect(goRes.status()).toBe(302);
    expect(goRes.headers()['location']).toBe(dest);
    await browserCtx.dispose();

    // 3. Verify the click row landed in the detail response. The redirect
    //    fires-and-forgets the insert, so we briefly retry rather than race.
    let clickCount = 0;
    let recentClicks: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      const detailRes = await clientApi.get(`/api/portal/trigger-links/${link.id}`);
      expect(detailRes.status).toBe(200);
      clickCount = detailRes.data.data.clickCount;
      recentClicks = detailRes.data.data.recentClicks;
      if (clickCount >= 1) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(clickCount).toBeGreaterThanOrEqual(1);
    expect(recentClicks.length).toBeGreaterThanOrEqual(1);
    const click = recentClicks[0] as { userAgent: string | null; referer: string | null };
    expect(click.userAgent).toBe('sd2026-e2e/1.0');
    expect(click.referer).toBe('https://referrer.example.com/');
  });

  test('GET /go/<missing-slug> returns 404', async () => {
    const browserCtx = await pwRequest.newContext({
      baseURL: BASE_URL,
      maxRedirects: 0,
    });
    const res = await browserCtx.get(`/go/this-slug-definitely-does-not-exist-${Date.now()}`);
    expect(res.status()).toBe(404);
    await browserCtx.dispose();
  });

  test('POST /trigger-links validates destinationUrl', async ({ clientApi }) => {
    // Missing
    const res1 = await clientApi.post('/api/portal/trigger-links', {});
    expect(res1.status).toBe(400);
    // Invalid scheme
    const res2 = await clientApi.post('/api/portal/trigger-links', {
      destinationUrl: 'javascript:alert(1)',
    });
    expect(res2.status).toBe(400);
  });

  test('PATCH updates destination, DELETE removes link', async ({ clientApi }) => {
    const createRes = await clientApi.post('/api/portal/trigger-links', {
      destinationUrl: 'https://example.com/initial',
    });
    const id = createRes.data.data.link.id;

    const patchRes = await clientApi.patch(`/api/portal/trigger-links/${id}`, {
      destinationUrl: 'https://example.com/updated',
      label: 'Updated label',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.data.link.destinationUrl).toBe('https://example.com/updated');
    expect(patchRes.data.data.link.label).toBe('Updated label');

    const delRes = await clientApi.delete(`/api/portal/trigger-links/${id}`);
    expect(delRes.status).toBe(200);

    const afterRes = await clientApi.get(`/api/portal/trigger-links/${id}`);
    expect(afterRes.status).toBe(404);
  });

  test('unauthenticated requests return 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/trigger-links');
    expect(res.status).toBe(401);
  });
});
