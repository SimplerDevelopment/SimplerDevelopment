/**
 * E2E coverage — Sites Hosting Publishing slice, cards 12-15 (0-based)
 *
 * Card 12: Custom code draft-then-publish lifecycle
 * Card 13: Preview code unlock (POST /api/preview-unlock)
 * Card 14: publicAccess gate — toggle field persists
 * Card 15: Site tracking settings — PATCH (PUT) persists GA/GTM ids
 *
 * Pattern: fixtures from ./setup/fixtures, helpers from ./setup/helpers.
 * All tests create and clean up their own data.
 */
import { test, expect } from './setup/fixtures';
import { createTestWebsite } from './setup/helpers';

// ── Card 12: Custom code draft-then-publish lifecycle ──────────────────────

test.describe('Sites — Custom code draft-then-publish @sites @custom-code', () => {
  let siteId: number;
  let cleanup: () => Promise<void>;

  test.beforeAll(async ({ clientApi }) => {
    const created = await createTestWebsite(clientApi);
    siteId = (created.website as { id: number }).id;
    cleanup = created.cleanup;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test('PUT /code writes draft, GET reflects hasDraft=true @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const css = `/* draft-${ts} */`;

    const put = await clientApi.put(`/api/portal/cms/websites/${siteId}/code`, {
      customCss: css,
    });
    expect(put.status).toBe(200);
    expect(put.data.success).toBe(true);
    expect(put.data.data.draftCustomCss).toBe(css);

    const get = await clientApi.get(`/api/portal/cms/websites/${siteId}/code`);
    expect(get.status).toBe(200);
    expect(get.data.success).toBe(true);
    expect(get.data.data.hasDraft).toBe(true);
    expect(get.data.data.draftCustomCss).toBe(css);
    // Live CSS unchanged until publish
    expect(get.data.data.customCss).not.toBe(css);
  });

  test('POST /code/publish promotes draft to live @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const css = `/* publish-${ts} */`;

    // Stage a draft
    const put = await clientApi.put(`/api/portal/cms/websites/${siteId}/code`, {
      customCss: css,
    });
    expect(put.status).toBe(200);

    // Publish it
    const pub = await clientApi.post(`/api/portal/cms/websites/${siteId}/code/publish`, {});
    expect(pub.status).toBe(200);
    expect(pub.data.success).toBe(true);
    expect(pub.data.data.customCss).toBe(css);
    expect(pub.data.data.draftCustomCss).toBeNull();
    expect(pub.data.data.hasDraft).toBe(false);
  });

  test('POST /code/publish returns 400 when no draft exists', async ({ clientApi }) => {
    // First discard any draft so the site has no pending draft
    await clientApi.put(`/api/portal/cms/websites/${siteId}/code`, {
      customCss: '',
      customJs: '',
    });
    // (empty string clears the draft col)

    // After clearing the draft, publish should be refused
    const pub = await clientApi.post(`/api/portal/cms/websites/${siteId}/code/publish`, {});
    expect(pub.status).toBe(400);
    expect(pub.data.success).toBe(false);
  });

  test('PUT /code rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.put(`/api/portal/cms/websites/${siteId}/code`, {
      customCss: '/* x */',
    });
    expect(res.status).toBe(401);
  });

  test('POST /code/publish rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/cms/websites/${siteId}/code/publish`, {});
    expect(res.status).toBe(401);
  });
});

// ── Card 13: Preview code unlock ───────────────────────────────────────────
//
// The card says "POST /api/sites/unlock" but the real unlock initiation is
// POST /api/preview-unlock (which validates the code and returns a redirect URL).
// GET /api/sites/unlock is the cookie-setting handoff endpoint (requires a
// time-limited signed token). We test the POST leg here.

test.describe('Sites — Preview code unlock @sites @preview-unlock', () => {
  let siteId: number;
  let cleanup: () => Promise<void>;
  // Generate the code inside beforeAll so each test run gets a fresh value
  let previewCode: string;

  test.beforeAll(async ({ clientApi }) => {
    previewCode = `TC${Date.now()}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const created = await createTestWebsite(clientApi);
    siteId = (created.website as { id: number }).id;
    cleanup = created.cleanup;

    // Set publicAccess=false + a previewCode on the site
    await clientApi.put(`/api/portal/cms/websites/${siteId}`, {
      publicAccess: false,
      previewCode,
    });
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test('POST /api/preview-unlock with valid code returns redirect URL @critical', async ({ clientApi }) => {
    const res = await clientApi.post('/api/preview-unlock', { code: previewCode, path: '/' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('url');
    // URL must contain a site id param and a token param
    expect(res.data.data.url).toMatch(/s=\d+/);
    expect(res.data.data.url).toContain('t=');
    expect(res.data.data).toHaveProperty('name');
  });

  test('POST /api/preview-unlock with wrong code returns 404', async ({ clientApi }) => {
    const res = await clientApi.post('/api/preview-unlock', { code: 'WRONGCODE9999', path: '/' });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST /api/preview-unlock with missing code returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/preview-unlock', { path: '/' });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── Card 14: publicAccess gate ─────────────────────────────────────────────

test.describe('Sites — publicAccess flag @sites @public-access', () => {
  let siteId: number;
  let cleanup: () => Promise<void>;

  test.beforeAll(async ({ clientApi }) => {
    const created = await createTestWebsite(clientApi);
    siteId = (created.website as { id: number }).id;
    cleanup = created.cleanup;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test('PUT /websites/:id with publicAccess=false persists the field @critical', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/cms/websites/${siteId}`, {
      publicAccess: false,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.publicAccess).toBe(false);
  });

  test('PUT /websites/:id with publicAccess=true persists the field', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/cms/websites/${siteId}`, {
      publicAccess: true,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.publicAccess).toBe(true);
  });

  test('PUT /websites/:id rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.put(`/api/portal/cms/websites/${siteId}`, {
      publicAccess: false,
    });
    expect(res.status).toBe(401);
  });
});

// ── Card 15: Site tracking settings ────────────────────────────────────────

test.describe('Sites — Tracking settings @sites @tracking', () => {
  let siteId: number;
  let cleanup: () => Promise<void>;

  test.beforeAll(async ({ clientApi }) => {
    const created = await createTestWebsite(clientApi);
    siteId = (created.website as { id: number }).id;
    cleanup = created.cleanup;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test('PUT /tracking persists gaMeasurementId @critical', async ({ clientApi }) => {
    const gaId = `G-TEST${Date.now()}`.slice(0, 16);

    const put = await clientApi.put(`/api/portal/cms/websites/${siteId}/tracking`, {
      gaMeasurementId: gaId,
    });
    expect(put.status).toBe(200);
    expect(put.data.success).toBe(true);
    expect(put.data.data.gaMeasurementId).toBe(gaId);
  });

  test('GET /tracking reflects persisted values', async ({ clientApi }) => {
    const gaId = `G-READ${Date.now()}`.slice(0, 16);

    await clientApi.put(`/api/portal/cms/websites/${siteId}/tracking`, {
      gaMeasurementId: gaId,
    });

    const get = await clientApi.get(`/api/portal/cms/websites/${siteId}/tracking`);
    expect(get.status).toBe(200);
    expect(get.data.success).toBe(true);
    expect(get.data.data.gaMeasurementId).toBe(gaId);
  });

  test('PUT /tracking persists gtmContainerId', async ({ clientApi }) => {
    const gtmId = `GTM-TEST${Date.now()}`.slice(0, 16);

    const put = await clientApi.put(`/api/portal/cms/websites/${siteId}/tracking`, {
      gtmContainerId: gtmId,
    });
    expect(put.status).toBe(200);
    expect(put.data.success).toBe(true);
    expect(put.data.data.gtmContainerId).toBe(gtmId);
  });

  test('PUT /tracking with invalid enabled value returns 400', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/cms/websites/${siteId}/tracking`, {
      enabled: 'yes',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PUT /tracking rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.put(`/api/portal/cms/websites/${siteId}/tracking`, {
      gaMeasurementId: 'G-UNAUTH',
    });
    expect(res.status).toBe(401);
  });

  test('GET /tracking rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/cms/websites/${siteId}/tracking`);
    expect(res.status).toBe(401);
  });
});
