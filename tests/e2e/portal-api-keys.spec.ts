/**
 * Portal API Keys E2E Tests
 *
 * Covers the /api/portal/api-keys endpoint with the new requireCmsApproval flag.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey } from './setup/helpers';

test.describe('Portal API keys @api-keys @mcp', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a key with requireCmsApproval=false by default', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi);
    cleanups.push(cleanup);

    expect(keyRecord.id).toBeDefined();
    expect(typeof keyRecord.key).toBe('string');
    expect(keyRecord.key).toMatch(/^sd_mcp_/);
    expect(keyRecord.keyPreview).toMatch(/^sd_mcp_/);
    expect(keyRecord.scopes).toContain('*');
  });

  test('POST accepts requireCmsApproval=true', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/api-keys', {
      name: `Approval Flag Test ${Date.now()}`,
      scopes: ['*'],
      requireCmsApproval: true,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    const keyId = res.data.data.id;

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/api-keys?id=${keyId}`).catch(() => {});
    });

    // GET should reflect the flag
    const list = await clientApi.get('/api/portal/api-keys');
    expect(list.status).toBe(200);
    const found = list.data.data.find((k: { id: number }) => k.id === keyId);
    expect(found).toBeTruthy();
    expect(found.requireCmsApproval).toBe(true);
  });

  test('POST defaults requireCmsApproval to false when omitted', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/api-keys', {
      name: `Default Flag Test ${Date.now()}`,
      scopes: ['*'],
    });
    expect(res.status).toBe(201);
    const keyId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/api-keys?id=${keyId}`).catch(() => {});
    });

    const list = await clientApi.get('/api/portal/api-keys');
    const found = list.data.data.find((k: { id: number }) => k.id === keyId);
    expect(found.requireCmsApproval).toBe(false);
  });

  test('POST rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/api-keys', { scopes: ['*'] });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('DELETE revokes a key', async ({ clientApi }) => {
    const { keyRecord } = await createTestApiKey(clientApi);
    const del = await clientApi.delete(`/api/portal/api-keys?id=${keyRecord.id}`);
    expect(del.status).toBe(200);

    const list = await clientApi.get('/api/portal/api-keys');
    const found = list.data.data.find((k: { id: number }) => k.id === keyRecord.id);
    // Revoked keys may still appear in list but with active=false
    if (found) {
      expect(found.active).toBe(false);
    }
  });

  test('GET/POST/DELETE require auth', async ({ unauthApi }) => {
    const list = await unauthApi.get('/api/portal/api-keys');
    expect(list.status).toBe(401);

    const create = await unauthApi.post('/api/portal/api-keys', { name: 'x', scopes: ['*'] });
    expect(create.status).toBe(401);

    const del = await unauthApi.delete('/api/portal/api-keys?id=1');
    expect(del.status).toBe(401);
  });
});
