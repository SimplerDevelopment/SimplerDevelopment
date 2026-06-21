/**
 * cov-u12.spec.ts — Sites Hosting Publishing E2E coverage (unit 12)
 *
 * Cards covered (indices 8–11 from the "## To Test" backlog):
 *   8.  Environment copy: POST /environments/:envId/copy duplicates env vars to another environment
 *   9.  Domain DNS verify: POST /websites/:id/domains/:domainId/verify returns verified:false not 5xx
 *   10. Domain PATCH/DELETE: update isPrimary flag and remove a domain record
 *   11. API key delete: DELETE /websites/:id/api-keys/:keyId removes key from masked list
 */
import { test, expect } from './setup/fixtures';
import { resolveClientSiteId } from './setup/helpers';

// ── Card 8: Environment copy ──────────────────────────────────────────────────

test.describe('Sites Publishing — Environment copy @sites-publishing', () => {
  let siteId: number;
  let envs: Array<{ id: number; name: string }> = [];

  test.beforeAll(async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);
    const res = await clientApi.get(`/api/portal/websites/${siteId}/environments`);
    if (res.status === 200 && Array.isArray(res.data?.data)) {
      envs = res.data.data;
    }
  });

  test('POST /environments/:envId/copy copies vars from source to target env', async ({
    clientApi,
  }) => {
    if (envs.length < 2) {
      test.skip(
        true,
        'PREREQ: site needs ≥2 environments (provisioned via website-provisioner). ' +
          'Seeded test site has none — run provision flow to create production+staging envs.'
      );
      return;
    }

    const [target, source] = envs;

    // Seed a var in the source environment
    const ts = Date.now();
    const varKey = `COPY_TEST_${ts}`;
    const varRes = await clientApi.post(
      `/api/portal/websites/${siteId}/environments/${source.id}/vars`,
      { key: varKey, value: 'copy-value' }
    );
    // Only proceed if we could insert a var
    if (varRes.status !== 200 && varRes.status !== 201) {
      test.skip(true, `Could not seed env var: ${varRes.status}`);
      return;
    }

    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/environments/${target.id}/copy`,
      { fromEnvironmentId: source.id }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.message).toBe('string');

    // Verify the var was copied to the target
    const getVars = await clientApi.get(
      `/api/portal/websites/${siteId}/environments/${target.id}/vars`
    );
    expect(getVars.status).toBe(200);
    const copied = (getVars.data.data as Array<{ key: string }> | undefined)?.find(
      (v) => v.key === varKey
    );
    expect(copied).toBeTruthy();
  });

  test('POST /environments/:envId/copy rejects missing fromEnvironmentId', async ({
    clientApi,
  }) => {
    if (envs.length < 1) {
      test.skip(true, 'PREREQ: site needs ≥1 environment.');
      return;
    }
    const [target] = envs;
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/environments/${target.id}/copy`,
      {}
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /environments/:envId/copy rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      `/api/portal/websites/1/environments/1/copy`,
      { fromEnvironmentId: 2 }
    );
    expect(res.status).toBe(401);
  });

  test('POST /environments/999999/copy returns 404 for unknown environment', async ({
    clientApi,
  }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/environments/999999/copy`,
      { fromEnvironmentId: 1 }
    );
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});

// ── Card 9: Domain DNS verify ─────────────────────────────────────────────────

test.describe('Sites Publishing — Domain DNS verify @sites-publishing', () => {
  let siteId: number;
  let domainId: number | null = null;
  const testDomain = `e2e-verify-${Date.now()}.testdomain.invalid`;

  test.beforeAll(async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);

    // Try to create a domain record for this site.
    // If POST fails (Vercel issues) we fall through; the skip guard
    // inside each test protects against null domainId.
    const postRes = await clientApi.post(`/api/portal/websites/${siteId}/domains`, {
      domain: testDomain,
    });
    if (postRes.status === 200 || postRes.status === 201) {
      domainId = postRes.data?.data?.id ?? null;
    }
  });

  test.afterAll(async ({ clientApi }) => {
    if (domainId != null) {
      await clientApi
        .delete(`/api/portal/websites/${siteId}/domains/${domainId}`)
        .catch(() => {});
    }
  });

  test('POST /domains/:domainId/verify returns success shape not 5xx', async ({
    clientApi,
  }) => {
    if (domainId == null) {
      test.skip(
        true,
        'PREREQ: Could not create a domain record (Vercel may have rejected the POST). ' +
          'Verify PLATFORM_VERCEL_PROJECT_ID is configured for test env.'
      );
      return;
    }

    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/domains/${domainId}/verify`,
      {}
    );

    // Must NOT be a 5xx error — the card explicitly calls this out
    // Must NOT be a 5xx error — the card explicitly calls this out
    expect(res.status).toBeLessThan(500);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('verified');
    expect(typeof res.data.data.verified).toBe('boolean');
    // Shape is correct — verified may be true or false depending on Vercel's response
    expect(res.data.data).toHaveProperty('domain');
    expect(res.data.data).toHaveProperty('status');
  });

  test('POST /domains/999999/verify returns 404 for unknown domain', async ({ clientApi }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/domains/999999/verify`,
      {}
    );
    expect(res.status).toBe(404);
  });

  test('POST /domains/:domainId/verify rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      `/api/portal/websites/1/domains/1/verify`,
      {}
    );
    expect(res.status).toBe(401);
  });
});

// ── Card 10: Domain PATCH/DELETE ──────────────────────────────────────────────

test.describe('Sites Publishing — Domain PATCH/DELETE @sites-publishing', () => {
  let siteId: number;
  let patchDomainId: number | null = null;
  let deleteDomainId: number | null = null;
  const patchDomain = `e2e-patch-${Date.now()}.testdomain.invalid`;
  const deleteDomain = `e2e-delete-${Date.now()}.testdomain.invalid`;

  test.beforeAll(async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);

    // Create two domain records — one to patch, one to delete
    const r1 = await clientApi.post(`/api/portal/websites/${siteId}/domains`, {
      domain: patchDomain,
    });
    if (r1.status === 200 || r1.status === 201) {
      patchDomainId = r1.data?.data?.id ?? null;
    }

    const r2 = await clientApi.post(`/api/portal/websites/${siteId}/domains`, {
      domain: deleteDomain,
    });
    if (r2.status === 200 || r2.status === 201) {
      deleteDomainId = r2.data?.data?.id ?? null;
    }
  });

  test.afterAll(async ({ clientApi }) => {
    // Clean up any leftover patch domain (delete domain is consumed in the test)
    if (patchDomainId != null) {
      await clientApi
        .delete(`/api/portal/websites/${siteId}/domains/${patchDomainId}`)
        .catch(() => {});
    }
  });

  test('PATCH /domains/:domainId sets isPrimary flag', async ({ clientApi }) => {
    if (patchDomainId == null) {
      test.skip(
        true,
        'PREREQ: Could not create a domain record via POST /domains (Vercel may have rejected it).'
      );
      return;
    }

    const res = await clientApi.patch(
      `/api/portal/websites/${siteId}/domains/${patchDomainId}`,
      { isPrimary: true }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify via GET list that our domain is now primary
    const list = await clientApi.get(`/api/portal/websites/${siteId}/domains`);
    expect(list.status).toBe(200);
    const found = (list.data.data as Array<{ id: number; isPrimary: boolean }> | undefined)?.find(
      (d) => d.id === patchDomainId
    );
    expect(found).toBeTruthy();
    expect(found?.isPrimary).toBe(true);
  });

  test('DELETE /domains/:domainId removes the domain record', async ({ clientApi }) => {
    if (deleteDomainId == null) {
      test.skip(
        true,
        'PREREQ: Could not create a domain record via POST /domains (Vercel may have rejected it).'
      );
      return;
    }

    const res = await clientApi.delete(
      `/api/portal/websites/${siteId}/domains/${deleteDomainId}`
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Domain should no longer appear in list
    const list = await clientApi.get(`/api/portal/websites/${siteId}/domains`);
    expect(list.status).toBe(200);
    const found = (list.data.data as Array<{ id: number }> | undefined)?.find(
      (d) => d.id === deleteDomainId
    );
    expect(found).toBeUndefined();

    // Mark as consumed so afterAll doesn't try to re-delete
    deleteDomainId = null;
  });

  test('PATCH /domains/999999 returns 404 for unknown domain', async ({ clientApi }) => {
    const res = await clientApi.patch(
      `/api/portal/websites/${siteId}/domains/999999`,
      { isPrimary: true }
    );
    expect(res.status).toBe(404);
  });

  test('DELETE /domains/999999 returns 404 for unknown domain', async ({ clientApi }) => {
    const res = await clientApi.delete(
      `/api/portal/websites/${siteId}/domains/999999`
    );
    expect(res.status).toBe(404);
  });

  test('PATCH /domains/:domainId rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.patch(
      `/api/portal/websites/1/domains/1`,
      { isPrimary: true }
    );
    expect(res.status).toBe(401);
  });

  test('DELETE /domains/:domainId rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.delete(`/api/portal/websites/1/domains/1`);
    expect(res.status).toBe(401);
  });
});

// ── Card 11: API key delete ───────────────────────────────────────────────────

test.describe('Sites Publishing — API key delete @sites-publishing', () => {
  let siteId: number;

  test.beforeAll(async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);
  });

  // FIXED: api_keys.key widened varchar(64) → varchar(255) so generateApiKey()'s
  // 72-char `sd_live_…` key no longer overflows on insert. Full lifecycle now works.
  test('create → list (masked) → delete removes the key @critical', async ({ clientApi }) => {
    const name = `Key-${Date.now()}`;
    const create = await clientApi.post(`/api/portal/websites/${siteId}/api-keys`, { name });
    expect(create.status).toBe(200);
    expect(create.data.success).toBe(true);
    const keyId: number = create.data.data.id;
    expect(create.data.data.key).toMatch(/^sd_live_[0-9a-f]{64}$/);

    const list = await clientApi.get(`/api/portal/websites/${siteId}/api-keys`);
    expect(list.status).toBe(200);
    const row = (list.data.data as Array<{ id: number; keyPrefix: string }>).find(k => k.id === keyId);
    expect(row, 'created key appears in the masked list').toBeTruthy();
    expect(row!.keyPrefix).toContain('...'); // masked, not the full key

    const del = await clientApi.delete(`/api/portal/websites/${siteId}/api-keys/${keyId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    const after = await clientApi.get(`/api/portal/websites/${siteId}/api-keys`);
    expect((after.data.data as Array<{ id: number }>).find(k => k.id === keyId)).toBeFalsy();
  });

  test('DELETE /api-keys/:keyId rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.delete(`/api/portal/websites/1/api-keys/1`);
    expect(res.status).toBe(401);
  });

  test('DELETE /api-keys/999999 is a safe no-op (key not found for site)', async ({
    clientApi,
  }) => {
    // DELETE with an id that doesn't belong to this site is a no-op — drizzle
    // delete returns without error even if 0 rows were deleted
    const res = await clientApi.delete(
      `/api/portal/websites/${siteId}/api-keys/999999`
    );
    // Route currently doesn't check row count — it always returns 200
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});
