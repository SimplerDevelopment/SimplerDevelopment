/**
 * Site (tenant-level) outbound webhooks @gap @site-webhooks
 *
 * Covers the new public-developer-surface feature:
 *   - CRUD   /api/portal/settings/site-webhooks (+ /[id])
 *   - rotate /api/portal/settings/webhooks/site/[id]/rotate
 *   - log    /api/portal/settings/webhooks/site/[id]/deliveries
 *   - unified console /api/portal/settings/webhooks (source='site')
 *   - LIVE FIRE: emitting a real automation event (crm.contact.created) drives
 *     the dispatcher → writes a delivery row.
 *
 * Cross-tenant isolation uses a throwaway client seeded via psql.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import { execSync } from 'child_process';

const TEST_DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${TEST_DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

const PUB_URL = 'https://example.com/sd-site-webhook-test';

test.describe('Site webhooks — management @gap @site-webhooks', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let otherClientId: number;
  let otherUserId: number;
  let otherHookId: number;

  test.beforeAll(async () => {
    // Throwaway tenant for cross-tenant checks.
    const tag = Date.now().toString(36);
    otherUserId = parseInt(
      sql(`INSERT INTO users (name, email, password) VALUES ('Other', 'other-${tag}@example.com', 'x') RETURNING id`),
      10,
    );
    otherClientId = parseInt(
      sql(`INSERT INTO clients (user_id, company) VALUES (${otherUserId}, 'Other Co') RETURNING id`),
      10,
    );
    otherHookId = parseInt(
      sql(`INSERT INTO site_webhooks (client_id, url, secret, events, enabled) VALUES (${otherClientId}, '${PUB_URL}', 'othersecret', '["*"]'::json, true) RETURNING id`),
      10,
    );
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
    sql(`DELETE FROM site_webhooks WHERE client_id=${otherClientId}`);
    sql(`DELETE FROM clients WHERE id=${otherClientId}`);
    sql(`DELETE FROM users WHERE id=${otherUserId}`);
  });

  test('POST creates a webhook and returns the full secret once', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/settings/site-webhooks', {
      url: PUB_URL,
      events: ['crm.contact.created', 'order.paid'],
    });
    expect(res.status).toBe(201);
    expect(res.data.data.id).toBeGreaterThan(0);
    expect(res.data.data.secret).toMatch(/^[0-9a-f]{64}$/); // full secret on create
    expect(res.data.data.events).toEqual(['crm.contact.created', 'order.paid']);
    const id = res.data.data.id;
    cleanups.push(async () => { sql(`DELETE FROM site_webhooks WHERE id=${id}`); });
  });

  test('POST rejects missing url (400) and invalid url (400)', async ({ clientApi }) => {
    expect((await clientApi.post('/api/portal/settings/site-webhooks', {})).status).toBe(400);
    expect((await clientApi.post('/api/portal/settings/site-webhooks', { url: 'ftp://nope' })).status).toBe(400);
  });

  test('GET lists webhooks with the secret redacted', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/settings/site-webhooks', { url: PUB_URL });
    const id = create.data.data.id;
    cleanups.push(async () => { sql(`DELETE FROM site_webhooks WHERE id=${id}`); });

    const res = await clientApi.get('/api/portal/settings/site-webhooks');
    expect(res.status).toBe(200);
    const row = (res.data.data as Array<{ id: number; secret: string | null }>).find((r) => r.id === id);
    expect(row).toBeTruthy();
    expect(row!.secret).toContain('…'); // redacted, not the full 64-char secret
  });

  test('PATCH updates events + enabled', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/settings/site-webhooks', { url: PUB_URL });
    const id = create.data.data.id;
    cleanups.push(async () => { sql(`DELETE FROM site_webhooks WHERE id=${id}`); });

    const res = await clientApi.patch(`/api/portal/settings/site-webhooks/${id}`, {
      events: ['order.paid'],
      enabled: false,
    });
    expect(res.status).toBe(200);
    expect(res.data.data.events).toEqual(['order.paid']);
    expect(res.data.data.enabled).toBe(false);
  });

  test('PATCH 404 for unknown id; 404 cross-tenant', async ({ clientApi }) => {
    expect((await clientApi.patch('/api/portal/settings/site-webhooks/999999', { enabled: false })).status).toBe(404);
    const res = await clientApi.patch(`/api/portal/settings/site-webhooks/${otherHookId}`, { enabled: false });
    expect(res.status).toBe(404);
    // unchanged
    expect(sql(`SELECT enabled FROM site_webhooks WHERE id=${otherHookId}`)).toBe('t');
  });

  test('DELETE removes the webhook; 404 unknown; 404 cross-tenant', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/settings/site-webhooks', { url: PUB_URL });
    const id = create.data.data.id;
    expect((await clientApi.delete(`/api/portal/settings/site-webhooks/${id}`)).status).toBe(200);
    expect(sql(`SELECT count(*) FROM site_webhooks WHERE id=${id}`)).toBe('0');
    expect((await clientApi.delete('/api/portal/settings/site-webhooks/999999')).status).toBe(404);
    expect((await clientApi.delete(`/api/portal/settings/site-webhooks/${otherHookId}`)).status).toBe(404);
    expect(sql(`SELECT count(*) FROM site_webhooks WHERE id=${otherHookId}`)).toBe('1');
  });

  test('rotate returns a fresh secret; 404 cross-tenant', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/settings/site-webhooks', { url: PUB_URL });
    const id = create.data.data.id;
    const firstSecret = create.data.data.secret;
    cleanups.push(async () => { sql(`DELETE FROM site_webhooks WHERE id=${id}`); });

    const res = await clientApi.post(`/api/portal/settings/webhooks/site/${id}/rotate`, {});
    expect(res.status).toBe(200);
    expect(res.data.data.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(res.data.data.secret).not.toBe(firstSecret);

    expect((await clientApi.post(`/api/portal/settings/webhooks/site/${otherHookId}/rotate`, {})).status).toBe(404);
  });

  test('deliveries returns an array; 404 cross-tenant', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/settings/site-webhooks', { url: PUB_URL });
    const id = create.data.data.id;
    cleanups.push(async () => { sql(`DELETE FROM site_webhooks WHERE id=${id}`); });

    const res = await clientApi.get(`/api/portal/settings/webhooks/site/${id}/deliveries`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);

    expect((await clientApi.get(`/api/portal/settings/webhooks/site/${otherHookId}/deliveries`)).status).toBe(404);
  });

  test('unified console lists the site webhook under source=site', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/settings/site-webhooks', { url: PUB_URL });
    const id = create.data.data.id;
    cleanups.push(async () => { sql(`DELETE FROM site_webhooks WHERE id=${id}`); });

    const res = await clientApi.get('/api/portal/settings/webhooks');
    expect(res.status).toBe(200);
    const row = (res.data.data as Array<{ source: string; id: number; secretLast4: string | null }>)
      .find((r) => r.source === 'site' && r.id === id);
    expect(row).toBeTruthy();
    expect(row!.secretLast4).toMatch(/^[0-9a-f]{4}$/);
  });

  test('auth: every site-webhook route is 401 unauthenticated', async ({ unauthApi }) => {
    expect((await unauthApi.get('/api/portal/settings/site-webhooks')).status).toBe(401);
    expect((await unauthApi.post('/api/portal/settings/site-webhooks', { url: PUB_URL })).status).toBe(401);
    expect((await unauthApi.patch('/api/portal/settings/site-webhooks/1', { enabled: false })).status).toBe(401);
    expect((await unauthApi.delete('/api/portal/settings/site-webhooks/1')).status).toBe(401);
    expect((await unauthApi.post('/api/portal/settings/webhooks/site/1/rotate', {})).status).toBe(401);
  });
});

test.describe('Site webhooks — live fire from the event bus @gap @site-webhooks', () => {
  test('creating a CRM contact drives the dispatcher → a delivery row is logged', async ({ clientApi }) => {
    // Webhook subscribed to the contact event. example.com is reachable+public
    // (passes SSRF); the delivery row is written regardless of the HTTP outcome,
    // which is what proves event-bus → onEvent → dispatcher → log.
    const create = await clientApi.post('/api/portal/settings/site-webhooks', {
      url: PUB_URL,
      events: ['crm.contact.created'],
    });
    expect(create.status).toBe(201);
    const hookId = create.data.data.id;

    const contact = await clientApi.post('/api/portal/crm/contacts', {
      firstName: 'Hook',
      lastName: `Fire${Date.now().toString(36)}`,
      email: `hookfire-${Date.now().toString(36)}@example.com`,
    });
    expect([200, 201]).toContain(contact.status);
    const contactId = contact.data?.data?.id ?? contact.data?.id;

    // Poll the deliveries endpoint — the dispatch is fire-and-forget; attempt 1
    // to example.com resolves within a couple seconds.
    let found: { event: string } | undefined;
    for (let i = 0; i < 12; i++) {
      const res = await clientApi.get(`/api/portal/settings/webhooks/site/${hookId}/deliveries`);
      const rows = (res.data?.data ?? []) as Array<{ event: string }>;
      found = rows.find((r) => r.event === 'crm.contact.created');
      if (found) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(found, 'expected a crm.contact.created delivery row from the dispatcher').toBeTruthy();

    // cleanup
    sql(`DELETE FROM site_webhooks WHERE id=${hookId}`);
    if (contactId) await clientApi.delete(`/api/portal/crm/contacts/${contactId}`).catch(() => {});
  });
});
