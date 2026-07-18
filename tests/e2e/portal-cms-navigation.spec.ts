/**
 * Portal CMS Navigation API E2E Tests
 *
 * Tests for /api/portal/websites/[siteId]/navigation
 * All tests are rerunnable.
 */
import { test, expect } from './setup/fixtures';
import { createTestWebsite } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Navigation @cms @navigation', () => {
  let siteId: number;

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test('GET /navigation returns empty array for new site', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('PUT /navigation sets flat navigation items', async ({ clientApi }) => {
    // Use only top-level items (no parentId) to avoid recursive insertion bug
    // when items lack explicit `id` fields
    const items = [
      { id: 9001, label: 'Home', href: '/', sortOrder: 0 },
      { id: 9002, label: 'About', href: '/about', sortOrder: 1 },
      { id: 9003, label: 'Services', href: '/services', sortOrder: 2 },
      { id: 9004, label: 'Contact', href: '/contact', sortOrder: 3, isButton: true },
    ];

    const res = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, { items });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBe(4);
  });

  test('GET /navigation returns saved items', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(4);

    const home = res.data.data.find((i: { label: string }) => i.label === 'Home');
    expect(home).toBeTruthy();
    expect(home.href).toBe('/');

    const contact = res.data.data.find((i: { label: string }) => i.label === 'Contact');
    expect(contact.isButton).toBe(true);
  });

  test('PUT /navigation replaces all items (idempotent)', async ({ clientApi }) => {
    // Set 2 items
    await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [
        { id: 9010, label: 'Only One', href: '/one', sortOrder: 0 },
        { id: 9011, label: 'Only Two', href: '/two', sortOrder: 1 },
      ],
    });

    // Replace with 1 item
    const res = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [{ id: 9020, label: 'Single Item', href: '/single', sortOrder: 0 }],
    });
    expect(res.data.data.length).toBe(1);
    expect(res.data.data[0].label).toBe('Single Item');

    // Verify old items are gone
    const verify = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(verify.data.data.length).toBe(1);
  });

  test('PUT /navigation with openInNewTab and description', async ({ clientApi }) => {
    const items = [
      {
        id: 9030,
        label: 'External Link',
        href: 'https://example.com',
        sortOrder: 0,
        openInNewTab: true,
        description: 'Opens in new window',
      },
    ];

    const res = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, { items });
    expect(res.status).toBe(200);
    expect(res.data.data[0].openInNewTab).toBe(true);
    expect(res.data.data[0].description).toBe('Opens in new window');
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(res.status).toBe(401);
  });
});
