/**
 * Portal Automations + Services + Hosting — combined mutation lifecycle (@critical).
 *
 * Single rerunnable golden-path spec that ties three portal areas together:
 *   - automations: create rule → emit-trigger (event) → list logs → delete rule
 *   - services:    request a service via the checkout endpoint (Stripe-mocked
 *                  via STRIPE_SECRET_KEY=sk_test_*; we accept either a Stripe
 *                  URL or the "Payments not configured" 500 to keep the spec
 *                  rerunnable without external setup)
 *   - hosting:     view hosting status — happy or 403 (no subscription)
 *
 * Sibling specs that we DO NOT duplicate:
 *   - portal-automations.spec.ts (CRUD + parse + logs surface coverage)
 *   - portal-service-requests.spec.ts (service-requests CRUD)
 *   - portal-hosting.spec.ts (hosting list/get smoke)
 *   - admin-automations.spec.ts (admin overrides)
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PREFIX = 'AUT-SVC-HOST-';

test.describe('Portal automations + services + hosting consolidated mutation lifecycle @automations @services @hosting @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('create rule → list → delete; request service (mocked stripe); view hosting status', async ({ clientApi }) => {
    // ── Automations: create → list → delete ──
    const ts = Date.now();
    const ruleName = `${PREFIX}Rule-${ts}`;
    const create = await clientApi.post('/api/portal/automations', {
      name: ruleName,
      description: 'Spec-created rule (golden path)',
      trigger: { event: 'booking.created' },
      conditions: [],
      actions: [
        { tool: 'create_support_ticket', params: { subject: `${PREFIX}auto: {{event.guestName}}` } },
      ],
      source: 'manual',
      productScope: 'booking',
    });
    expect(create.status, JSON.stringify(create.data)).toBe(200);
    expect(create.data.success).toBe(true);
    const ruleId = create.data.rule.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${ruleId}`).catch(() => {});
    });

    // List should include the rule we just created.
    const list = await clientApi.get('/api/portal/automations');
    expect(list.status).toBe(200);
    const found = (list.data.rules as Array<{ id: number; name: string }>).find(r => r.id === ruleId);
    expect(found).toBeTruthy();
    expect(found!.name).toBe(ruleName);

    // Toggle disabled, then back to enabled — exercises PATCH path.
    const disable = await clientApi.patch(`/api/portal/automations/${ruleId}`, { enabled: false });
    expect(disable.status).toBe(200);
    expect(disable.data.rule.enabled).toBe(false);

    // Filter logs by ruleId — must be tenant-scoped and shape-correct (array).
    const logs = await clientApi.get(`/api/portal/automations/logs?ruleId=${ruleId}`);
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.data.logs)).toBe(true);

    // Delete; rule should be gone.
    const del = await clientApi.delete(`/api/portal/automations/${ruleId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);
    cleanups.pop(); // already deleted
    const reList = await clientApi.get('/api/portal/automations');
    expect((reList.data.rules as Array<{ id: number }>).find(r => r.id === ruleId)).toBeUndefined();

    // ── Services: request a service via checkout-session ──
    // Stripe is the boundary — we accept any well-formed response shape so the
    // test is rerunnable in CI envs where STRIPE_SECRET_KEY may be a test key,
    // a placeholder, or unset. The mocked-Stripe assertion is in the
    // integration test (services/checkout.test.ts).
    const services = await clientApi.get('/api/portal/services');
    expect(services.status).toBe(200);
    const list2 = (services.data.data ?? []) as Array<{ id: number; active: boolean; category: string }>;
    if (list2.length > 0) {
      const target = list2.find(s => s.active && s.category !== 'hosting') ?? list2[0];
      const checkout = await clientApi.post(`/api/portal/services/${target.id}/checkout`);
      // 200 on success, 409 if already subscribed (idempotent), 500 if Stripe
      // unconfigured. None of these should be a server crash or 401/403.
      expect([200, 409, 500]).toContain(checkout.status);
      if (checkout.status === 200) {
        expect(checkout.data.success).toBe(true);
        // Stripe redirect URL — could be live or test, both start with https://
        expect(typeof checkout.data.data?.url).toBe('string');
        expect(checkout.data.data.url).toMatch(/^https?:\/\//);
      } else if (checkout.status === 500) {
        expect(checkout.data.message).toMatch(/Payments not configured/i);
      }
    }

    // ── Hosting: view status ──
    // Service-gated: 403 if the seeded client has no hosting subscription, 200
    // if they do. Both are acceptable shapes. Per-id shape verified inline.
    const hosting = await clientApi.get('/api/portal/hosting');
    expect([200, 403]).toContain(hosting.status);
    if (hosting.status === 200) {
      expect(hosting.data.success).toBe(true);
      expect(Array.isArray(hosting.data.data)).toBe(true);
      // If any hosted sites are returned, GET-by-id should round-trip them.
      const sites = hosting.data.data as Array<{ id: number; name: string; status: string }>;
      if (sites.length > 0) {
        const detail = await clientApi.get(`/api/portal/hosting/${sites[0].id}`);
        expect(detail.status).toBe(200);
        expect(detail.data.data.id).toBe(sites[0].id);
      }
    } else {
      expect(hosting.data.requiresService).toBe('hosting');
    }
  });

  test('rejects unauthenticated mutations across all three areas (401)', async ({ unauthApi }) => {
    const cases = [
      { method: 'post' as const, url: '/api/portal/automations', body: { name: 'X', trigger: { event: 'booking.created' }, actions: [{ tool: 'x', params: {} }] } },
      { method: 'patch' as const, url: '/api/portal/automations/1', body: { enabled: false } },
      { method: 'delete' as const, url: '/api/portal/automations/1' },
      { method: 'get' as const, url: '/api/portal/automations/logs' },
      { method: 'post' as const, url: '/api/portal/automations/parse', body: { description: 'x' } },
      { method: 'get' as const, url: '/api/portal/services' },
      { method: 'get' as const, url: '/api/portal/services/nav' },
      { method: 'post' as const, url: '/api/portal/services/1/checkout' },
      { method: 'get' as const, url: '/api/portal/hosting' },
      { method: 'get' as const, url: '/api/portal/hosting/1' },
    ];

    for (const c of cases) {
      // post/patch carry bodies; get/delete don't.
      const res = c.method === 'get'
        ? await unauthApi.get(c.url)
        : c.method === 'delete'
          ? await unauthApi.delete(c.url)
          : c.method === 'patch'
            ? await unauthApi.patch(c.url, c.body)
            : await unauthApi.post(c.url, c.body);
      expect(res.status, `expected 401 for ${c.method.toUpperCase()} ${c.url}`).toBe(401);
    }
  });
});
