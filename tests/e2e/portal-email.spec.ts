/**
 * Portal Email Marketing API E2E Tests
 *
 * Tests for /api/portal/email/lists, /campaigns, /subscribers
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Email Lists @email @lists', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /email/lists returns client lists', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/lists');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /email/lists creates a new list', async ({ clientApi }) => {
    const name = `Test List ${Date.now()}`;
    const res = await clientApi.post('/api/portal/email/lists', {
      name,
      description: 'E2E test email list',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);

    const listId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/lists/${listId}`).catch(() => {});
    });
  });

  test('POST /email/lists rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/lists', {
      description: 'No name provided',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PATCH /email/lists/:id updates a list', async ({ clientApi }) => {
    const { listId, cleanup } = await createTestList(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.patch(`/api/portal/email/lists/${listId}`, {
      name: 'Updated List Name',
      description: 'Updated description',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Updated List Name');
  });

  test('DELETE /email/lists/:id removes a list', async ({ clientApi }) => {
    const { listId } = await createTestList(clientApi);

    const res = await clientApi.delete(`/api/portal/email/lists/${listId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET /email/lists rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/lists');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Email Subscribers @email @subscribers', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /email/subscribers adds a subscriber to a list', async ({ clientApi }) => {
    const { listId, cleanup } = await createTestList(clientApi);
    cleanups.push(cleanup);

    const email = `test-${Date.now()}@example.com`;
    const res = await clientApi.post('/api/portal/email/subscribers', {
      listId,
      email,
      name: 'Test Subscriber',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.email).toBe(email);
  });

  test('POST /email/subscribers rejects duplicate email in same list', async ({ clientApi }) => {
    const { listId, cleanup } = await createTestList(clientApi);
    cleanups.push(cleanup);

    const email = `dup-${Date.now()}@example.com`;
    await clientApi.post('/api/portal/email/subscribers', { listId, email });

    const res = await clientApi.post('/api/portal/email/subscribers', { listId, email });
    expect(res.status).toBe(409);
  });

  test('PUT /email/subscribers bulk imports subscribers', async ({ clientApi }) => {
    const { listId, cleanup } = await createTestList(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.put('/api/portal/email/subscribers', {
      listId,
      subscribers: [
        { email: `bulk1-${Date.now()}@example.com`, name: 'Bulk One' },
        { email: `bulk2-${Date.now()}@example.com`, name: 'Bulk Two' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.imported).toBeGreaterThanOrEqual(2);
  });

  test('GET /email/lists/:id returns subscribers for a list', async ({ clientApi }) => {
    const { listId, cleanup } = await createTestList(clientApi);
    cleanups.push(cleanup);

    // Add a subscriber
    await clientApi.post('/api/portal/email/subscribers', {
      listId,
      email: `view-${Date.now()}@example.com`,
    });

    const res = await clientApi.get(`/api/portal/email/lists/${listId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Portal Email Campaigns @email @campaigns', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /email/campaigns lists campaigns', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/campaigns');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /email/campaigns creates a campaign', async ({ clientApi }) => {
    const { listId, cleanup: listCleanup } = await createTestList(clientApi);
    cleanups.push(listCleanup);

    const name = `Test Campaign ${Date.now()}`;
    const res = await clientApi.post('/api/portal/email/campaigns', {
      name,
      subject: 'Test Subject',
      fromName: 'Test Sender',
      fromEmail: 'test@example.com',
      listId,
      htmlContent: '<h1>Hello</h1><p>Test email content</p>',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.status).toBe('draft');

    const campaignId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
    });
  });

  test('POST /email/campaigns rejects missing required fields', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/campaigns', {
      name: 'Incomplete',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /email/campaigns/:id returns campaign with sends', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/email/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('campaign');
    expect(res.data.data).toHaveProperty('sends');
  });

  test('PATCH /email/campaigns/:id updates a draft campaign', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      subject: 'Updated Subject',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.subject).toBe('Updated Subject');
  });

  test('DELETE /email/campaigns/:id removes a draft campaign', async ({ clientApi }) => {
    const { campaignId } = await createTestCampaign(clientApi);

    const res = await clientApi.delete(`/api/portal/email/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET /email/campaigns rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/campaigns');
    expect(res.status).toBe(401);
  });
});

// --- Helpers ---

async function createTestList(api: import('./setup/api-client').ApiClient) {
  const name = `Test List ${Date.now()}`;
  const res = await api.post('/api/portal/email/lists', {
    name,
    description: 'E2E test list',
  });
  if (!res.data?.success) throw new Error(`Failed to create test list: ${res.data?.message}`);
  const listId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/email/lists/${listId}`).catch(() => {});
  };
  return { listId, cleanup };
}

async function createTestCampaign(api: import('./setup/api-client').ApiClient) {
  const { listId, cleanup: listCleanup } = await createTestList(api);
  const name = `Test Campaign ${Date.now()}`;
  const res = await api.post('/api/portal/email/campaigns', {
    name,
    subject: 'Test Subject',
    fromName: 'Test Sender',
    fromEmail: 'test@example.com',
    listId,
    htmlContent: '<h1>Test</h1>',
  });
  if (!res.data?.success) throw new Error(`Failed to create test campaign: ${res.data?.message}`);
  const campaignId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
    await listCleanup();
  };
  return { campaignId, listId, cleanup };
}
