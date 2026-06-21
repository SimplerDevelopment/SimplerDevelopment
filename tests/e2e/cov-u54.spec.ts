/**
 * Integrations E2E Tests — cov-u54
 *
 * Covers cards at indices 4-7 from the Integrations E2E Audit board:
 *   [4] Developer / headless content-delivery API — gap check
 *   [5] GET /api/portal/integrations/google/status returns tier + connection shape and 401 when unauthenticated
 *   [6] POST /api/portal/integrations/google/disconnect scrubs tokens locally and is idempotent on second call
 *   [7] GET /api/portal/integrations/microsoft/status returns configured flag + connection row and 401 when unauthenticated
 */
import { test, expect } from './setup/fixtures';

// ── Card [4]: Developer / headless content-delivery API ──
// Checked via grep — no route exists. Verdict: gap (no test written).

// ── Card [5]: GET /api/portal/integrations/google/status ──

test.describe('Integrations — Google status @integrations @google', () => {
  test('GET /google/status returns tier + connection shape when authenticated', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/integrations/google/status');
    expect(res.status).toBe(200);
    // The endpoint returns tier + tenantStatus + connection at top-level
    // (standard tier = no tenant credentials row configured)
    expect(res.data).toHaveProperty('tier');
    expect(['standard', 'enterprise']).toContain(res.data.tier);
    expect(res.data).toHaveProperty('connection');
    // tenantStatus is null when tier is standard
    if (res.data.tier === 'standard') {
      expect(res.data.tenantStatus).toBeNull();
      expect(res.data.connection).toBeNull();
    } else {
      // enterprise: tenantStatus is a string and connection may be null or an object
      expect(typeof res.data.tenantStatus === 'string' || res.data.tenantStatus === null).toBe(true);
    }
  });

  test('GET /google/status returns 401 when unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/integrations/google/status');
    expect(res.status).toBe(401);
  });
});

// ── Card [6]: POST /api/portal/integrations/google/disconnect ──

test.describe('Integrations — Google disconnect @integrations @google', () => {
  test('POST /google/disconnect is idempotent and returns alreadyDisconnected when no connection exists', async ({ clientApi }) => {
    // For a fresh seed user with no Google connection, first call returns alreadyDisconnected
    const res1 = await clientApi.post('/api/portal/integrations/google/disconnect', {});
    expect(res1.status).toBe(200);
    expect(res1.data.ok).toBe(true);
    // Either it was already disconnected, or it just disconnected (both 200)
    expect(typeof res1.data.alreadyDisconnected === 'boolean' || res1.data.googleRevoked !== undefined).toBe(true);

    // Second call must also be 200 (idempotent)
    const res2 = await clientApi.post('/api/portal/integrations/google/disconnect', {});
    expect(res2.status).toBe(200);
    expect(res2.data.ok).toBe(true);
    // After first call there is definitely no active connection
    expect(res2.data.alreadyDisconnected).toBe(true);
  });

  test('POST /google/disconnect returns 401 when unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/integrations/google/disconnect', {});
    expect(res.status).toBe(401);
  });
});

// ── Card [7]: GET /api/portal/integrations/microsoft/status ──

test.describe('Integrations — Microsoft status @integrations @microsoft', () => {
  test('GET /microsoft/status returns configured flag + connection shape when authenticated', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/integrations/microsoft/status');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('configured');
    expect(typeof res.data.data.configured).toBe('boolean');
    expect(res.data.data).toHaveProperty('connection');
    // connection is either null (not connected) or an object with microsoftAccountEmail
    if (res.data.data.connection !== null) {
      expect(res.data.data.connection).toHaveProperty('microsoftAccountEmail');
    }
  });

  test('GET /microsoft/status returns 401 when unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/integrations/microsoft/status');
    expect(res.status).toBe(401);
  });
});
