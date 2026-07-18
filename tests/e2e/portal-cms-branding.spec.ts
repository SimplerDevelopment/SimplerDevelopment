/**
 * Portal CMS Branding API E2E Tests
 *
 * Tests for /api/portal/websites/[siteId]/branding
 * All tests are rerunnable.
 */
import { test, expect } from './setup/fixtures';
import { createTestWebsite } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Branding @cms @branding', () => {
  let siteId: number;

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test('GET /branding returns defaults for new site', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/branding`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('primaryColor');
    expect(res.data.data).toHaveProperty('secondaryColor');
    expect(res.data.data).toHaveProperty('backgroundColor');
    expect(res.data.data).toHaveProperty('textColor');
    expect(res.data.data).toHaveProperty('navTemplate');
    expect(res.data.data).toHaveProperty('navPosition');
  });

  test('PUT /branding updates colors', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/websites/${siteId}/branding`, {
      primaryColor: '#10b981',
      secondaryColor: '#059669',
      accentColor: '#f97316',
      backgroundColor: '#fafafa',
      textColor: '#1a1a1a',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const verify = await clientApi.get(`/api/portal/websites/${siteId}/branding`);
    expect(verify.data.data.primaryColor).toBe('#10b981');
    expect(verify.data.data.secondaryColor).toBe('#059669');
    expect(verify.data.data.accentColor).toBe('#f97316');
  });

  test('PUT /branding updates logo fields', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/websites/${siteId}/branding`, {
      logoUrl: 'https://example.com/logo.png',
      logoAlt: 'Test Logo',
      logoText: 'TestBrand',
      logoSquareUrl: 'https://example.com/logo-sq.png',
      logoRectUrl: 'https://example.com/logo-rect.png',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/websites/${siteId}/branding`);
    expect(verify.data.data.logoUrl).toBe('https://example.com/logo.png');
    expect(verify.data.data.logoAlt).toBe('Test Logo');
    expect(verify.data.data.logoText).toBe('TestBrand');
  });

  test('PUT /branding updates navigation styling', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/websites/${siteId}/branding`, {
      navTemplate: 'modern',
      navPosition: 'top',
      navBackground: '#111827',
      navTextColor: '#ffffff',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/websites/${siteId}/branding`);
    expect(verify.data.data.navTemplate).toBe('modern');
    expect(verify.data.data.navBackground).toBe('#111827');
    expect(verify.data.data.navTextColor).toBe('#ffffff');
  });

  test('PUT /branding updates fonts', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/websites/${siteId}/branding`, {
      headingFont: 'Inter',
      bodyFont: 'Roboto',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/websites/${siteId}/branding`);
    expect(verify.data.data.headingFont).toBe('Inter');
    expect(verify.data.data.bodyFont).toBe('Roboto');
  });

  test('PUT /branding is idempotent (upsert)', async ({ clientApi }) => {
    // First update
    await clientApi.put(`/api/portal/websites/${siteId}/branding`, { primaryColor: '#3b82f6' });

    // Second update — should update, not fail
    const res = await clientApi.put(`/api/portal/websites/${siteId}/branding`, { primaryColor: '#8b5cf6' });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/websites/${siteId}/branding`);
    expect(verify.data.data.primaryColor).toBe('#8b5cf6');
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/branding`);
    expect(res.status).toBe(401);
  });
});
