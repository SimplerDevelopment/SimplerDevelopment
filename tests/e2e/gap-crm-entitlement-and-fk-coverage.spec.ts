/**
 * Gap coverage — CRM REST write entitlement + cross-tenant FK scoping
 *
 * Closes three adversarial-audit findings on the portal CRM REST surface
 * (docs/audits/portal-e2e-adversarial-audit-2026-06-25.md):
 *
 *   1. crm-rest-api-no-service-entitlement-gate
 *      The POST/PUT/DELETE CRM routes that back the portal UI did NOT call the
 *      `hasServiceAccess(clientId, 'crm')` gate the MCP layer enforces via
 *      requireService. A tenant without the CRM subscription could create
 *      contacts/companies/deals/sequences and bulk-import via direct REST.
 *      → assert an UNENTITLED tenant gets 403 on every write route, and an
 *        entitled (bundle) tenant still gets 201.
 *
 *   2. crm-contact-put-tag-ids-no-scope-check
 *      PUT/POST /crm/contacts accepted an arbitrary `tagIds` array and linked
 *      `crmContactTags` rows without verifying the tags belong to the caller's
 *      client — letting tenant A attach tenant B's tag and read its name/color.
 *      → assert a foreign tagId is rejected (400) and never appears on the
 *        contact, while the caller's own tag attaches (200).
 *
 *   3. crm-activity-post-no-fk-ownership-check
 *      POST /crm/activities inserted `contactId` / `dealId` / `companyId` from
 *      the body with no ownership verification.
 *      → assert a foreign contact/company/deal id is rejected (403) and the
 *        caller's own ids are accepted (201).
 *
 * All three are tenant-isolation / entitlement invariants, so the suite is
 * tagged @tenancy in addition to @gap @crm.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestContact,
  createTestCompany,
  createTestCrmTag,
  createTestPipeline,
  createTestDeal,
} from './setup/helpers';
import { ApiClient } from './setup/api-client';

const ENTITLEMENT_403 = {
  status: 403,
  requiresService: 'crm',
};

/** Grant the all-access bundle (covers every category incl. CRM) to a client. */
async function entitleCrm(adminApi: ApiClient, clientId: number) {
  const svcRes = await adminApi.get('/api/admin/portal/services');
  expect(svcRes.status).toBe(200);
  const services = svcRes.data.data as Array<{ id: number; category: string }>;
  const svc =
    services.find((s) => s.category === 'bundle') ??
    services.find((s) => s.category === 'crm');
  if (!svc) throw new Error('No bundle/crm service seeded to entitle the test client');
  const subRes = await adminApi.post('/api/admin/portal/subscriptions', {
    clientId,
    serviceId: svc.id,
  });
  expect(subRes.status).toBe(201);
}

/**
 * Provision a fresh portal tenant via the admin API and return a logged-in
 * ApiClient for it. Client rows can't be deleted (no endpoint) — acceptable
 * test-DB leak with a timestamped email, matching gap-esign-coverage.
 */
async function provisionClient(
  adminApi: ApiClient,
  cleanups: Array<() => Promise<void>>,
  label: string,
  opts: { entitle: boolean }
): Promise<{ clientId: number; api: ApiClient }> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `crm-${label}-${ts}-${rand}@example.com`;
  const password = 'password123';
  const res = await adminApi.post('/api/admin/portal/clients', {
    name: `CRM ${label} ${ts}`,
    email,
    password,
    company: `CRM ${label} Co ${ts}`,
  });
  expect(res.status).toBe(200);
  const clientId = res.data.data.client.id as number;
  if (opts.entitle) await entitleCrm(adminApi, clientId);
  const api = new ApiClient(email, password);
  await api.ensure();
  cleanups.push(async () => {
    await api.dispose();
  });
  return { clientId, api };
}

// ─── Finding 1: entitlement gate on CRM REST writes ──────────────────────────

test.describe('CRM REST write entitlement gate @gap @crm @tenancy', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('unentitled tenant is blocked (403) on every CRM write route', async ({ adminApi }) => {
    const { api: uApi } = await provisionClient(adminApi, cleanups, 'unentitled', { entitle: false });

    const cases: Array<{ path: string; body: Record<string, unknown> }> = [
      { path: '/api/portal/crm/contacts', body: { firstName: 'Blocked' } },
      { path: '/api/portal/crm/companies', body: { name: 'Blocked Co' } },
      { path: '/api/portal/crm/deals', body: { title: 'Blocked Deal', pipelineId: 1, stageId: 1 } },
      { path: '/api/portal/crm/activities', body: { type: 'note', title: 'Blocked', contactId: 1 } },
      { path: '/api/portal/crm/sequences', body: { name: 'Blocked Seq' } },
      // Import gate runs before the multipart parse, so a JSON body still 403s.
      { path: '/api/portal/crm/import', body: {} },
    ];

    for (const c of cases) {
      const res = await uApi.post(c.path, c.body);
      expect(res.status, `${c.path} should be entitlement-gated`).toBe(ENTITLEMENT_403.status);
      expect(res.data.success).toBe(false);
      expect(res.data.requiresService).toBe(ENTITLEMENT_403.requiresService);
    }
  });

  test('entitled (bundle) tenant can still create a CRM contact (201)', async ({ clientApi }) => {
    // clientApi is the seeded all-access-bundle tenant — the legit caller must
    // remain unaffected by the new gate.
    const res = await clientApi.post('/api/portal/crm/contacts', {
      firstName: 'Entitled',
      lastName: `Caller-${Date.now()}`,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    const id = res.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/contacts/${id}`).catch(() => {});
    });
  });
});

// ─── Finding 2: contact tagIds must be tenant-scoped ─────────────────────────

test.describe('CRM contact tag assignment is tenant-scoped @gap @crm @tenancy', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('PUT accepts own tag (200) but rejects a foreign tenant tag (400)', async ({ clientApi, adminApi }) => {
    // Tenant A = the seeded entitled clientApi.
    const { contact, cleanup: contactCleanup } = await createTestContact(clientApi);
    cleanups.push(contactCleanup);
    const { tag: tagA, cleanup: tagACleanup } = await createTestCrmTag(clientApi);
    cleanups.push(tagACleanup);

    // Tenant B owns its own tag (leaked — timestamped).
    const { api: bApi } = await provisionClient(adminApi, cleanups, 'tagowner', { entitle: true });
    const { tag: tagB } = await createTestCrmTag(bApi);

    // A attaches its OWN tag → 200, and it shows up on the contact.
    const ok = await clientApi.put(`/api/portal/crm/contacts/${contact.id}`, {
      tagIds: [tagA.id],
    });
    expect(ok.status).toBe(200);
    const afterOk = await clientApi.get(`/api/portal/crm/contacts/${contact.id}`);
    expect((afterOk.data.data.tags as Array<{ id: number }>).map((t) => t.id)).toContain(tagA.id);

    // A tries to attach tenant B's tag → 400, and it must NOT appear.
    const blocked = await clientApi.put(`/api/portal/crm/contacts/${contact.id}`, {
      tagIds: [tagB.id],
    });
    expect(blocked.status).toBe(400);
    expect(blocked.data.success).toBe(false);

    const afterBlocked = await clientApi.get(`/api/portal/crm/contacts/${contact.id}`);
    const tagIds = (afterBlocked.data.data.tags as Array<{ id: number }>).map((t) => t.id);
    expect(tagIds).not.toContain(tagB.id);
    // The rejected PUT must not have wiped the legitimately-attached tag either.
    expect(tagIds).toContain(tagA.id);
  });

  test('POST contact rejects a foreign tenant tag (400)', async ({ clientApi, adminApi }) => {
    const { api: bApi } = await provisionClient(adminApi, cleanups, 'tagowner2', { entitle: true });
    const { tag: tagB } = await createTestCrmTag(bApi);

    const res = await clientApi.post('/api/portal/crm/contacts', {
      firstName: 'TagInjection',
      tagIds: [tagB.id],
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    // No contact should have been created with the foreign tag.
    if (res.data?.data?.id) {
      const id = res.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/crm/contacts/${id}`).catch(() => {});
      });
    }
  });
});

// ─── Finding 3: activity FK ownership ────────────────────────────────────────

test.describe('CRM activity FK ownership is tenant-scoped @gap @crm @tenancy', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('rejects a foreign contactId (403) and accepts the caller own contactId (201)', async ({ clientApi, adminApi }) => {
    const { contact: contactA, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const { api: bApi } = await provisionClient(adminApi, cleanups, 'fkowner', { entitle: true });
    const { contact: contactB } = await createTestContact(bApi);

    // Caller (A) links to tenant B's contact → 403.
    const blocked = await clientApi.post('/api/portal/crm/activities', {
      type: 'note',
      title: 'Cross-tenant link attempt',
      contactId: contactB.id,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.data.success).toBe(false);

    // Caller (A) links to its OWN contact → 201.
    const ok = await clientApi.post('/api/portal/crm/activities', {
      type: 'note',
      title: 'Own contact link',
      contactId: contactA.id,
    });
    expect(ok.status).toBe(201);
    expect(ok.data.success).toBe(true);
  });

  test('rejects a foreign companyId (403)', async ({ clientApi, adminApi }) => {
    const { api: bApi } = await provisionClient(adminApi, cleanups, 'fkcompany', { entitle: true });
    const { company: companyB } = await createTestCompany(bApi);

    const blocked = await clientApi.post('/api/portal/crm/activities', {
      type: 'note',
      title: 'Cross-tenant company link',
      companyId: companyB.id,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.data.success).toBe(false);
  });

  test('rejects a foreign dealId (403)', async ({ clientApi, adminApi }) => {
    const { api: bApi } = await provisionClient(adminApi, cleanups, 'fkdeal', { entitle: true });
    const { pipeline } = await createTestPipeline(bApi);
    const stageId = (pipeline.stages as Array<{ id: number }>)[0].id;
    const { deal: dealB } = await createTestDeal(bApi, pipeline.id, stageId);

    const blocked = await clientApi.post('/api/portal/crm/activities', {
      type: 'note',
      title: 'Cross-tenant deal link',
      dealId: dealB.id,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.data.success).toBe(false);
  });
});
