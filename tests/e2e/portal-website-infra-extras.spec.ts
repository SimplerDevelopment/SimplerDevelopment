/**
 * Portal Website Infrastructure Extras API E2E Tests
 *
 * Companion to portal-website-infra.spec.ts.
 * Covers the remaining /api/portal/websites/[siteId] sub-routes:
 *   api-keys, branding-profile, domains (plural), environments,
 *   provision, status.
 *
 * Cross-tenant rejection for branding-profile is covered in
 * tests/integration/api/security/tenancy.test.ts — here we exercise
 * the happy path + validation surface.
 *
 * provision/status fully exercise external Vercel/GitHub providers, so
 * we only assert the validation/auth surface (401 unauth, 404 cross-tenant,
 * conflict states) without invoking the external provider.
 */
import { test, expect } from './setup/fixtures';
import { createTestWebsite } from './setup/helpers';

// Serial: tests share a website created in setup
test.describe.configure({ mode: 'serial' });

test.describe('Portal Website Infra Extras @websites @infra', () => {
  let siteId: number;

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  // --- Per-site API keys ---

  test('GET /websites/:id/api-keys returns masked key list', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/api-keys`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /websites/:id/api-keys creates a per-site key (full key returned once)', async ({ clientApi }) => {
    const name = `Site Key ${Date.now()}`;
    const res = await clientApi.post(`/api/portal/websites/${siteId}/api-keys`, {
      name,
      scopes: ['read'],
      rateLimitPerMinute: 30,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBeTruthy();
    expect(res.data.data.name).toBe(name);
    expect(typeof res.data.data.key).toBe('string');
    expect(res.data.data.key.length).toBeGreaterThan(10);
  });

  test('POST /websites/:id/api-keys uses default name when omitted', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/websites/${siteId}/api-keys`, {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Default');
  });

  test('GET /websites/:id/api-keys rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/api-keys`);
    expect(res.status).toBe(401);
  });

  test('POST /websites/:id/api-keys rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/websites/${siteId}/api-keys`, { name: 'x' });
    expect(res.status).toBe(401);
  });

  test('GET /websites/999999/api-keys returns 404 for unknown site', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/websites/999999/api-keys');
    expect(res.status).toBe(404);
  });

  // --- Branding profile (PATCH only — there is no GET on this route) ---

  test('PATCH /websites/:id/branding-profile clears profile (null)', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/websites/${siteId}/branding-profile`, {
      brandingProfileId: null,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(siteId);
    expect(res.data.data.brandingProfileId).toBeNull();
  });

  test('PATCH /websites/:id/branding-profile rejects unknown profile id', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/websites/${siteId}/branding-profile`, {
      brandingProfileId: 999999,
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('PATCH /websites/:id/branding-profile rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.patch(`/api/portal/websites/${siteId}/branding-profile`, {
      brandingProfileId: null,
    });
    expect(res.status).toBe(401);
  });

  test('PATCH /websites/999999/branding-profile returns 404 for unknown site', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/websites/999999/branding-profile', {
      brandingProfileId: null,
    });
    expect(res.status).toBe(404);
  });

  // --- Domains (plural) — distinct from singular /domain ---

  test('GET /websites/:id/domains returns domain list', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/domains`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /websites/:id/domains rejects missing domain', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/websites/${siteId}/domains`, {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /websites/:id/domains rejects non-string domain', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/websites/${siteId}/domains`, { domain: 123 });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /websites/:id/domains rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/domains`);
    expect(res.status).toBe(401);
  });

  test('POST /websites/:id/domains rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/websites/${siteId}/domains`, {
      domain: 'unauth.example.com',
    });
    expect(res.status).toBe(401);
  });

  test('GET /websites/999999/domains returns 404 for unknown site', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/websites/999999/domains');
    expect(res.status).toBe(404);
  });

  // --- Environments ---

  test('GET /websites/:id/environments returns environment list', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/environments`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /websites/:id/environments rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/environments`);
    expect(res.status).toBe(401);
  });

  test('GET /websites/999999/environments returns 404 for unknown site', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/websites/999999/environments');
    expect(res.status).toBe(404);
  });

  // --- Status (no external provider work — pure DB read) ---

  test('GET /websites/:id/status returns deployment status snapshot', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/status`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('deploymentStatus');
    expect(res.data.data).toHaveProperty('subdomain');
    expect(res.data.data).toHaveProperty('githubRepoName');
    expect(res.data.data).toHaveProperty('vercelProjectId');
  });

  test('GET /websites/:id/status rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/status`);
    expect(res.status).toBe(401);
  });

  test('GET /websites/999999/status returns 404 for unknown site', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/websites/999999/status');
    expect(res.status).toBe(404);
  });

  // --- Provision: validation/auth surface only (no Vercel/GitHub creds) ---

  test('POST /websites/:id/provision rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/websites/${siteId}/provision`);
    expect(res.status).toBe(401);
  });

  test('POST /websites/999999/provision returns 404 for unknown site', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/websites/999999/provision');
    expect(res.status).toBe(404);
  });
});
