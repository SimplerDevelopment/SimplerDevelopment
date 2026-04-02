/**
 * Admin CRM API E2E Tests
 *
 * Tests for /api/admin/portal/crm/* endpoints.
 * All endpoints require admin/employee role.
 * Uses client API helpers to seed data, then verifies admin can see it.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestContact,
  createTestCompany,
  createTestPipeline,
  createTestDeal,
  createTestProposal,
  createTestContract,
} from './setup/helpers';

test.describe('Admin CRM Dashboard @admin @crm', () => {
  test('GET /crm/dashboard returns stats', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/crm/dashboard');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const d = res.data.data;
    expect(d).toHaveProperty('totalContacts');
    expect(d).toHaveProperty('contactsByStatus');
    expect(d).toHaveProperty('totalCompanies');
    expect(d).toHaveProperty('dealsByStatus');
    expect(d).toHaveProperty('proposalsByStatus');
    expect(d).toHaveProperty('contractsByStatus');
    expect(d).toHaveProperty('recentActivities');
    expect(typeof d.totalContacts).toBe('number');
    expect(typeof d.totalCompanies).toBe('number');
    expect(Array.isArray(d.recentActivities)).toBe(true);
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/crm/dashboard');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/crm/dashboard');
    expect(res.status).toBe(401);
  });
});

test.describe('Admin CRM Contacts @admin @crm', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /crm/contacts lists contacts', async ({ adminApi, clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await adminApi.get('/api/admin/portal/crm/contacts');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);

    // Verify item shape
    const item = res.data.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('firstName');
    expect(item).toHaveProperty('lastName');
    expect(item).toHaveProperty('email');
    expect(item).toHaveProperty('clientCompany');
  });

  test('GET /crm/contacts?search=... filters results', async ({ adminApi, clientApi }) => {
    const ts = Date.now();
    const uniqueName = `SearchTarget-${ts}`;
    const { cleanup } = await createTestContact(clientApi, { firstName: uniqueName });
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/admin/portal/crm/contacts?search=${uniqueName}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);
    expect(res.data.data.some((c: { firstName: string }) => c.firstName === uniqueName)).toBe(true);
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/crm/contacts');
    expect(res.status).toBe(401);
  });
});

test.describe('Admin CRM Companies @admin @crm', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /crm/companies lists all companies', async ({ adminApi, clientApi }) => {
    const { company, cleanup } = await createTestCompany(clientApi);
    cleanups.push(cleanup);

    const res = await adminApi.get('/api/admin/portal/crm/companies');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);

    const item = res.data.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('clientCompany');
    expect(item).toHaveProperty('contactCount');
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/crm/companies');
    expect(res.status).toBe(401);
  });
});

test.describe('Admin CRM Deals @admin @crm', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /crm/deals lists all deals', async ({ adminApi, clientApi }) => {
    // Seed a deal via client API
    const { pipeline } = await createTestPipeline(clientApi);
    const stageId = pipeline.stages?.[0]?.id ?? pipeline.defaultStageId;
    const { deal, cleanup } = await createTestDeal(clientApi, pipeline.id, stageId);
    cleanups.push(cleanup);

    const res = await adminApi.get('/api/admin/portal/crm/deals');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);

    const item = res.data.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('value');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('pipelineName');
    expect(item).toHaveProperty('stageName');
    expect(item).toHaveProperty('clientCompany');
  });

  test('GET /crm/deals?status=open filters by status', async ({ adminApi, clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const stageId = pipeline.stages?.[0]?.id ?? pipeline.defaultStageId;
    const { cleanup } = await createTestDeal(clientApi, pipeline.id, stageId);
    cleanups.push(cleanup);

    const res = await adminApi.get('/api/admin/portal/crm/deals?status=open');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // All returned deals should have status 'open'
    for (const deal of res.data.data) {
      expect(deal.status).toBe('open');
    }
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/crm/deals');
    expect(res.status).toBe(401);
  });
});

test.describe('Admin CRM Proposals @admin @crm', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /crm/proposals lists all proposals', async ({ adminApi, clientApi }) => {
    const { proposal, cleanup } = await createTestProposal(clientApi);
    cleanups.push(cleanup);

    const res = await adminApi.get('/api/admin/portal/crm/proposals');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);

    const item = res.data.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('clientCompany');
  });

  test('GET /crm/proposals?status=draft filters by status', async ({ adminApi, clientApi }) => {
    const { cleanup } = await createTestProposal(clientApi);
    cleanups.push(cleanup);

    const res = await adminApi.get('/api/admin/portal/crm/proposals?status=draft');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    for (const p of res.data.data) {
      expect(p.status).toBe('draft');
    }
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/crm/proposals');
    expect(res.status).toBe(401);
  });
});

test.describe('Admin CRM Contracts @admin @crm', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /crm/contracts returns success (empty if table not migrated)', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/crm/contracts');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/crm/contracts');
    expect(res.status).toBe(401);
  });
});
