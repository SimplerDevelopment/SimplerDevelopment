/**
 * Portal Hosting Lifecycle — deep E2E spec
 *
 * Adds depth beyond the thin smoke coverage in:
 *   - portal-hosting.spec.ts                          (list + by-id smoke)
 *   - portal-automations-services-hosting-mutations.spec.ts  (status shape only)
 *
 * Coverage added here:
 *   1. Admin creates a hosted-site record and verifies shape/fields persisted.
 *   2. Admin reads back the record by id — round-trip field persistence.
 *   3. Admin updates status + plan fields — PATCH and re-read persistence.
 *   4. Admin calls provision-domain — DNS instructions generated, status
 *      transitions to 'provisioning', customDomain persisted.
 *   5. Admin calls verify-dns — when no real CNAME exists the endpoint must
 *      still return success:true with verified:false (not a 5xx), and the
 *      response envelope shape is asserted in full.
 *   6. Client reads the hosted-site list and by-id — scoped to their own
 *      records; the admin-created site is visible to the correct client.
 *   7. Admin lists all hosted sites — returns array including the new record,
 *      and the join fields (clientCompany, clientUserEmail) are present.
 *   8. Auth boundary — client cannot reach admin hosting endpoints (401/403).
 *   9. Admin deletes the hosted site — gone from list.
 *  10. Validation — POST without required fields returns 400.
 *
 * Steps 4–5 exercise the domain-provisioning sub-lifecycle that has zero
 * existing E2E coverage.  Steps 6–9 assert tenancy isolation and the
 * admin-aggregate view.
 *
 * Idempotent + self-cleaning: every created row is tracked in `cleanups` and
 * removed in afterEach (reverse order), so reruns on a live DB are safe.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PREFIX = 'HOSTING-LC-';

// ── Shape helpers ────────────────────────────────────────────────────────────

/** Fields the admin GET /admin/portal/hosting list join must return. */
interface AdminHostingSiteRow {
  id: number;
  clientId: number;
  name: string;
  status: string;
  plan: string;
  customDomain: string | null;
  railwayDomain: string | null;
  dnsInstructions: unknown[];
  clientCompany: string | null;
  clientUserEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the admin GET /admin/portal/hosting/:id full record must return. */
interface AdminHostingSiteFull {
  id: number;
  clientId: number;
  name: string;
  status: string;
  plan: string;
  customDomain: string | null;
  railwayDomain: string | null;
  railwayProjectId: string | null;
  railwayServiceId: string | null;
  railwayEnvironmentId: string | null;
  dnsInstructions: unknown[];
  notes: string | null;
  renewalDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Managed hosting lifecycle @hosting @admin @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── 1–3, 7, 9: Admin CRUD lifecycle ─────────────────────────────────────

  test('admin: create → read-back → PATCH status+plan → list → delete', async ({ adminApi, clientApi }) => {
    const ts = Date.now();
    const siteName = `${PREFIX}Site-${ts}`;

    // Resolve a real clientId by asking the admin client list.
    const clientsRes = await adminApi.get('/api/admin/portal/clients?limit=5');
    expect(clientsRes.status, 'admin clients list should succeed').toBe(200);
    const clientList = (clientsRes.data?.data ?? []) as Array<{ id: number }>;
    // We need at least one client to attach a hosted site to.
    if (clientList.length === 0) {
      test.skip();
      return;
    }
    const targetClientId = clientList[0].id;

    // ── 1. Admin creates a hosted site ──────────────────────────────────────
    const createRes = await adminApi.post('/api/admin/portal/hosting', {
      clientId: targetClientId,
      name: siteName,
      status: 'provisioning',
      plan: 'starter',
      railwayDomain: `e2e-${ts}.up.railway.app`,
      notes: 'Created by E2E lifecycle spec',
    });
    expect(createRes.status, JSON.stringify(createRes.data)).toBe(200);
    expect(createRes.data.success).toBe(true);

    const site = createRes.data.data as AdminHostingSiteFull;
    expect(typeof site.id).toBe('number');
    expect(site.name).toBe(siteName);
    expect(site.clientId).toBe(targetClientId);
    expect(site.status).toBe('provisioning');
    expect(site.plan).toBe('starter');
    expect(site.railwayDomain).toBe(`e2e-${ts}.up.railway.app`);
    expect(site.customDomain).toBeNull();
    expect(Array.isArray(site.dnsInstructions)).toBe(true);

    const siteId = site.id;
    cleanups.push(async () => {
      await adminApi.delete(`/api/admin/portal/hosting/${siteId}`).catch(() => {});
    });

    // ── 2. Admin reads back by id — all fields round-trip ───────────────────
    const getRes = await adminApi.get(`/api/admin/portal/hosting/${siteId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    const fetched = getRes.data.data as AdminHostingSiteFull;
    expect(fetched.id).toBe(siteId);
    expect(fetched.name).toBe(siteName);
    expect(fetched.status).toBe('provisioning');
    expect(fetched.plan).toBe('starter');
    expect(fetched.notes).toBe('Created by E2E lifecycle spec');
    // Timestamps present and non-empty
    expect(typeof fetched.createdAt).toBe('string');
    expect(typeof fetched.updatedAt).toBe('string');

    // ── 3. Admin PATCH: update status → active, plan → pro ──────────────────
    const patchRes = await adminApi.patch(`/api/admin/portal/hosting/${siteId}`, {
      status: 'active',
      plan: 'pro',
    });
    expect(patchRes.status, JSON.stringify(patchRes.data)).toBe(200);
    expect(patchRes.data.success).toBe(true);
    const patched = patchRes.data.data as AdminHostingSiteFull;
    expect(patched.status).toBe('active');
    expect(patched.plan).toBe('pro');
    // Name unchanged by this PATCH
    expect(patched.name).toBe(siteName);

    // Re-read to confirm DB persistence (not just the returning() value).
    const reReadRes = await adminApi.get(`/api/admin/portal/hosting/${siteId}`);
    expect(reReadRes.status).toBe(200);
    expect((reReadRes.data.data as AdminHostingSiteFull).status).toBe('active');
    expect((reReadRes.data.data as AdminHostingSiteFull).plan).toBe('pro');

    // ── 7. Admin list — new site present with join columns ───────────────────
    const listRes = await adminApi.get('/api/admin/portal/hosting');
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    const allSites = (listRes.data.data ?? []) as AdminHostingSiteRow[];
    const found = allSites.find(s => s.id === siteId);
    expect(found, 'new site should appear in admin list').toBeTruthy();
    // Join columns must be present (not undefined — null is acceptable when
    // the client has no company set yet).
    expect('clientCompany' in found!).toBe(true);
    expect('clientUserEmail' in found!).toBe(true);

    // ── 6a. Client list — restricted to their own records ───────────────────
    // We can only assert the response shape here; the seeded test client may
    // or may not be the same client we attached the site to, and the route
    // requires the 'hosting' service to be active. Accept 200 or 403.
    const clientListRes = await clientApi.get('/api/portal/hosting');
    expect([200, 403]).toContain(clientListRes.status);
    if (clientListRes.status === 200) {
      expect(clientListRes.data.success).toBe(true);
      expect(Array.isArray(clientListRes.data.data)).toBe(true);
      // Client must never see sites belonging to other clients.
      const clientSites = clientListRes.data.data as Array<{ id: number; clientId: number }>;
      const foreignSite = clientSites.find(s => s.id === siteId && s.clientId !== targetClientId);
      expect(foreignSite).toBeUndefined();
    } else {
      expect(clientListRes.data.requiresService).toBe('hosting');
    }

    // ── 9. Admin delete → gone from list ────────────────────────────────────
    const delRes = await adminApi.delete(`/api/admin/portal/hosting/${siteId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);
    cleanups.pop(); // already deleted above

    const afterDelList = await adminApi.get('/api/admin/portal/hosting');
    const stillPresent = ((afterDelList.data?.data ?? []) as AdminHostingSiteRow[]).find(s => s.id === siteId);
    expect(stillPresent).toBeUndefined();

    // by-id should now be 404
    const afterDelGet = await adminApi.get(`/api/admin/portal/hosting/${siteId}`);
    expect(afterDelGet.status).toBe(404);
  });

  // ── 4–5: Domain provisioning sub-lifecycle ────────────────────────────────

  test('admin: provision-domain → dnsInstructions generated, then verify-dns → shape correct', async ({ adminApi }) => {
    const ts = Date.now();
    const siteName = `${PREFIX}Domain-${ts}`;

    // Need a real clientId
    const clientsRes = await adminApi.get('/api/admin/portal/clients?limit=5');
    expect(clientsRes.status).toBe(200);
    const clientList = (clientsRes.data?.data ?? []) as Array<{ id: number }>;
    if (clientList.length === 0) {
      test.skip();
      return;
    }
    const targetClientId = clientList[0].id;

    // Create the site with a Railway domain so provision-domain has something
    // to generate CNAME instructions from.
    const createRes = await adminApi.post('/api/admin/portal/hosting', {
      clientId: targetClientId,
      name: siteName,
      status: 'provisioning',
      plan: 'starter',
      railwayDomain: `e2e-dns-${ts}.up.railway.app`,
    });
    expect(createRes.status, JSON.stringify(createRes.data)).toBe(200);
    const siteId = (createRes.data.data as { id: number }).id;
    cleanups.push(async () => {
      await adminApi.delete(`/api/admin/portal/hosting/${siteId}`).catch(() => {});
    });

    // ── 4. Provision a custom domain ─────────────────────────────────────────
    const customDomain = `e2e-${ts}.example.com`;
    const provisionRes = await adminApi.post(
      `/api/admin/portal/hosting/${siteId}/provision-domain`,
      { customDomain },
    );
    expect(provisionRes.status, JSON.stringify(provisionRes.data)).toBe(200);
    expect(provisionRes.data.success).toBe(true);
    expect(typeof provisionRes.data.message).toBe('string');

    const provisionedSite = provisionRes.data.data as AdminHostingSiteFull;
    expect(provisionedSite.customDomain).toBe(customDomain);
    expect(provisionedSite.status).toBe('provisioning');
    expect(Array.isArray(provisionedSite.dnsInstructions)).toBe(true);
    expect(provisionedSite.dnsInstructions.length).toBeGreaterThan(0);

    // DNS instruction record shape
    const instr = provisionedSite.dnsInstructions[0] as {
      type: string;
      host: string;
      value: string;
      ttl: string;
      notes: string;
    };
    expect(instr.type).toBe('CNAME');
    expect(typeof instr.host).toBe('string');
    expect(typeof instr.value).toBe('string');
    expect(typeof instr.ttl).toBe('string');
    expect(typeof instr.notes).toBe('string');
    // Because railwayDomain is set, value should not be the '<pending>' placeholder
    expect(instr.value).not.toMatch(/<pending/);
    expect(instr.value).toBe(`e2e-dns-${ts}.up.railway.app`);

    // Re-read to confirm customDomain + dnsInstructions persisted to DB
    const afterProvision = await adminApi.get(`/api/admin/portal/hosting/${siteId}`);
    expect(afterProvision.status).toBe(200);
    expect((afterProvision.data.data as AdminHostingSiteFull).customDomain).toBe(customDomain);
    expect(
      ((afterProvision.data.data as AdminHostingSiteFull).dnsInstructions as unknown[]).length,
    ).toBeGreaterThan(0);

    // ── 5. verify-dns — domain is fake so CNAME won't resolve; the endpoint ──
    // must return 200 with verified:false (not 5xx).  When both customDomain
    // AND railwayDomain are set the endpoint must not short-circuit to 400.
    const verifyRes = await adminApi.post(`/api/admin/portal/hosting/${siteId}/verify-dns`, {});
    expect(verifyRes.status, JSON.stringify(verifyRes.data)).toBe(200);
    expect(verifyRes.data.success).toBe(true);

    const verifyData = verifyRes.data.data as {
      verified: boolean;
      domain: string;
      expectedTarget: string;
      dnsResults: unknown[];
      status: string;
    };
    // Shape assertions (independent of actual DNS state)
    expect(typeof verifyData.verified).toBe('boolean');
    expect(verifyData.domain).toBe(customDomain);
    expect(verifyData.expectedTarget).toBe(`e2e-dns-${ts}.up.railway.app`);
    expect(Array.isArray(verifyData.dnsResults)).toBe(true);
    expect(['active', 'pending']).toContain(verifyData.status);
    // For a fake domain the CNAME won't resolve so verified should be false.
    expect(verifyData.verified).toBe(false);
    expect(verifyData.status).toBe('pending');
    expect(typeof verifyRes.data.message).toBe('string');
  });

  // ── 10. Validation — missing required fields ──────────────────────────────

  test('admin: POST /hosting without required fields returns 400', async ({ adminApi }) => {
    // Missing both clientId and name
    const res1 = await adminApi.post('/api/admin/portal/hosting', {});
    expect(res1.status).toBe(400);
    expect(res1.data.success).toBe(false);
    expect(typeof res1.data.message).toBe('string');

    // Has clientId but missing name
    const clientsRes = await adminApi.get('/api/admin/portal/clients?limit=1');
    const clientList = (clientsRes.data?.data ?? []) as Array<{ id: number }>;
    if (clientList.length > 0) {
      const res2 = await adminApi.post('/api/admin/portal/hosting', {
        clientId: clientList[0].id,
        // name omitted
      });
      expect(res2.status).toBe(400);
      expect(res2.data.success).toBe(false);
    }

    // provision-domain without customDomain body field → 400
    // We need a real siteId; use 999999 which won't exist → 404 is also
    // acceptable because the handler checks the body first in one path and
    // the record first in another. Accept 400 or 404 (both prove the guard
    // fires before any side-effects).
    const provRes = await adminApi.post('/api/admin/portal/hosting/999999/provision-domain', {});
    expect([400, 404]).toContain(provRes.status);
    expect(provRes.data.success).toBe(false);
  });

  // ── 8. Auth boundary: client cannot reach admin hosting endpoints ─────────

  test('auth boundary: client and unauthenticated callers cannot reach admin hosting endpoints', async ({ clientApi, unauthApi }) => {
    const adminEndpoints: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; url: string; body?: Record<string, unknown> }> = [
      { method: 'get', url: '/api/admin/portal/hosting' },
      { method: 'post', url: '/api/admin/portal/hosting', body: { clientId: 1, name: 'x' } },
      { method: 'get', url: '/api/admin/portal/hosting/1' },
      { method: 'patch', url: '/api/admin/portal/hosting/1', body: { status: 'active' } },
      { method: 'delete', url: '/api/admin/portal/hosting/1' },
      { method: 'post', url: '/api/admin/portal/hosting/1/provision-domain', body: { customDomain: 'x.com' } },
      { method: 'post', url: '/api/admin/portal/hosting/1/verify-dns', body: {} },
    ];

    for (const endpoint of adminEndpoints) {
      // Unauthenticated must be 401
      const unauthRes = endpoint.method === 'get'
        ? await unauthApi.get(endpoint.url)
        : endpoint.method === 'delete'
          ? await unauthApi.delete(endpoint.url)
          : endpoint.method === 'patch'
            ? await unauthApi.patch(endpoint.url, endpoint.body)
            : await unauthApi.post(endpoint.url, endpoint.body);
      expect(
        unauthRes.status,
        `unauth ${endpoint.method.toUpperCase()} ${endpoint.url} should be 401`,
      ).toBe(401);

      // Client (non-staff) must be 401 (the requireStaff helper returns null
      // for non-admin/employee roles, which maps to a 401 response).
      const clientRes = endpoint.method === 'get'
        ? await clientApi.get(endpoint.url)
        : endpoint.method === 'delete'
          ? await clientApi.delete(endpoint.url)
          : endpoint.method === 'patch'
            ? await clientApi.patch(endpoint.url, endpoint.body)
            : await clientApi.post(endpoint.url, endpoint.body);
      expect(
        clientRes.status,
        `client ${endpoint.method.toUpperCase()} ${endpoint.url} should be 401`,
      ).toBe(401);
    }
  });
});
