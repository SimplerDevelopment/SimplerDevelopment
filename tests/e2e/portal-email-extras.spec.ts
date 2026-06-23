/**
 * Portal Email Extras API E2E Tests
 *
 * Covers email portal endpoints not exercised by portal-email.spec.ts or
 * portal-email-segments.spec.ts:
 *   - GET    /api/portal/email/analytics
 *   - POST   /api/portal/email/render-preview
 *   - GET    /api/portal/email/templates
 *   - POST   /api/portal/email/templates
 *   - PATCH  /api/portal/email/templates/[id]
 *   - DELETE /api/portal/email/templates/[id]
 *
 * All routes are service-gated behind an `email` subscription. Tests pass in
 * both subscribed (200/201) and unsubscribed (403 + upsell envelope)
 * scenarios, mirroring the pattern in portal-email-segments.spec.ts.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

// ── Email Analytics ──

test.describe('Portal Email — Analytics Service Gate @email @analytics', () => {
  test('returns 403 with upsell envelope when no email subscription', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/analytics');
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data.message).toContain('subscription');
      expect(res.data).toHaveProperty('requiresService', 'email');
      expect(res.data).toHaveProperty('upsellUrl');
    } else {
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    }
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/analytics');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Email — Analytics Shape @email @analytics', () => {
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/analytics');
    hasAccess = res.status === 200;
  });

  test('GET /analytics returns overview, subscribers, and recentCampaigns', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.get('/api/portal/email/analytics');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('overview');
    expect(res.data.data).toHaveProperty('subscribers');
    expect(res.data.data).toHaveProperty('recentCampaigns');
    expect(res.data.data.overview).toHaveProperty('totalCampaigns');
    expect(res.data.data.overview).toHaveProperty('openRate');
    expect(res.data.data.overview).toHaveProperty('clickRate');
    expect(res.data.data.subscribers).toHaveProperty('total');
    expect(res.data.data.subscribers).toHaveProperty('active');
    expect(res.data.data.subscribers).toHaveProperty('listBreakdown');
    expect(Array.isArray(res.data.data.subscribers.listBreakdown)).toBe(true);
    expect(Array.isArray(res.data.data.recentCampaigns)).toBe(true);
  });
});

// ── Email Render Preview ──

test.describe('Portal Email — Render Preview Service Gate @email @render-preview', () => {
  test('returns 403 with upsell envelope when no email subscription', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: { blocks: [] },
    });
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data).toHaveProperty('requiresService', 'email');
      expect(res.data).toHaveProperty('upsellUrl');
    } else {
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    }
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/email/render-preview', {
      blockContent: { blocks: [] },
    });
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Email — Render Preview @email @render-preview', () => {
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const probe = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: { blocks: [] },
    });
    hasAccess = probe.status === 200;
  });

  test('POST returns rendered HTML for a small block array', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        previewText: 'A quick hello',
        blocks: [
          { type: 'heading', props: { text: 'Hello world' } },
          { type: 'text', props: { text: 'This is a preview render.' } },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('html');
    expect(typeof res.data.data.html).toBe('string');
    expect(res.data.data.html.length).toBeGreaterThan(0);
  });

  test('POST rejects when blockContent.blocks is missing', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {},
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toContain('blocks');
  });

  test('POST rejects when body has no blockContent', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.post('/api/portal/email/render-preview', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── Email Templates (collection) ──

test.describe('Portal Email — Templates Service Gate @email @templates', () => {
  test('returns 403 with upsell envelope when no email subscription', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/templates');
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data).toHaveProperty('requiresService', 'email');
      expect(res.data).toHaveProperty('upsellUrl');
    } else {
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    }
  });

  test('GET rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/templates');
    expect(res.status).toBe(401);
  });

  test('POST rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/email/templates', {
      name: 'Should not create',
      htmlContent: '<p>nope</p>',
    });
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Email — Templates CRUD @email @templates', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/templates');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /templates lists templates as an array', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.get('/api/portal/email/templates');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /templates creates a template from htmlContent', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const name = `Test Template ${ts}`;
    const res = await clientApi.post('/api/portal/email/templates', {
      name,
      description: 'E2E test template',
      category: 'custom',
      subject: 'Hello from E2E',
      htmlContent: '<h1>Hello</h1><p>Body</p>',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.htmlContent).toContain('<h1>Hello</h1>');
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/templates/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /templates creates a template from blockContent (htmlContent derived)', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/email/templates', {
      name: `Block Template ${ts}`,
      blockContent: {
        blocks: [
          { type: 'heading', props: { text: 'From blocks' } },
          { type: 'text', props: { text: 'Rendered server-side.' } },
        ],
      },
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.data.htmlContent).toBe('string');
    expect(res.data.data.htmlContent.length).toBeGreaterThan(0);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/templates/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /templates rejects when name is missing', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.post('/api/portal/email/templates', {
      htmlContent: '<p>No name</p>',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toContain('name');
  });

  test('POST /templates rejects when content is missing', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/email/templates', {
      name: `Empty Template ${ts}`,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── Email Templates [id] (full lifecycle) ──

test.describe('Portal Email — Template [id] Service Gate @email @templates', () => {
  test('PATCH rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.patch('/api/portal/email/templates/1', {
      name: 'Unauth update',
    });
    expect(res.status).toBe(401);
  });

  test('DELETE rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/email/templates/1');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Email — Template [id] Lifecycle @email @templates', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/templates');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('PATCH /templates/[id] updates name, subject, and category', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/email/templates', {
      name: `Updatable Template ${ts}`,
      htmlContent: '<p>v1</p>',
    });
    expect(create.status).toBe(201);
    const id = create.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/templates/${id}`).catch(() => {});
    });

    const renamed = `Renamed Template ${ts}`;
    const res = await clientApi.patch(`/api/portal/email/templates/${id}`, {
      name: renamed,
      subject: 'Updated subject',
      category: 'newsletter',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(renamed);
    expect(res.data.data.subject).toBe('Updated subject');
    expect(res.data.data.category).toBe('newsletter');
  });

  test('PATCH /templates/[id] re-renders htmlContent from blockContent', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/email/templates', {
      name: `Block-Patch Template ${ts}`,
      htmlContent: '<p>placeholder</p>',
    });
    const id = create.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/templates/${id}`).catch(() => {});
    });

    const res = await clientApi.patch(`/api/portal/email/templates/${id}`, {
      blockContent: {
        blocks: [{ type: 'heading', props: { text: 'Patched heading' } }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.data.htmlContent).toBe('string');
    expect(res.data.data.htmlContent.length).toBeGreaterThan(0);
  });

  test('PATCH /templates/[id] returns 404 for unknown id', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.patch('/api/portal/email/templates/999999999', {
      name: 'Nope',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('DELETE /templates/[id] removes a template (idempotent on second call)', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/email/templates', {
      name: `Deletable Template ${ts}`,
      htmlContent: '<p>bye</p>',
    });
    const id = create.data.data.id;

    const first = await clientApi.delete(`/api/portal/email/templates/${id}`);
    expect(first.status).toBe(200);
    expect(first.data.success).toBe(true);

    // Second call should still respond 200 (route does not 404 on missing rows)
    const second = await clientApi.delete(`/api/portal/email/templates/${id}`);
    expect(second.status).toBe(200);
  });

  test('full create → patch → delete lifecycle', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/email/templates', {
      name: `Lifecycle Template ${ts}`,
      htmlContent: '<p>lifecycle</p>',
    });
    expect(create.status).toBe(201);
    const id = create.data.data.id;

    const patch = await clientApi.patch(`/api/portal/email/templates/${id}`, {
      description: 'Lifecycle updated',
    });
    expect(patch.status).toBe(200);
    expect(patch.data.data.description).toBe('Lifecycle updated');

    const del = await clientApi.delete(`/api/portal/email/templates/${id}`);
    expect(del.status).toBe(200);
  });
});
