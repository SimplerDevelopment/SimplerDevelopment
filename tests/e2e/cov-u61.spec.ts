/**
 * Agentic OS E2E Coverage — unit 61 slice [0..3]
 *
 * Cards covered:
 *   0. sd_mcp_* scoped token issuance + expiry
 *   1. Agent action audit trail            → gap (no read API)
 *   2. Governed agent ops loop             → needs-spec (MCP-layer; can't exercise via HTTP)
 *   3. GET /api/admin/agentic-os/runs      → gated by isLocalDev(); returns 404 on prod server
 */
import { test, expect } from './setup/fixtures';

// ── Card 0: sd_mcp_* scoped token issuance + expiry ──────────────────────────
//
// Route: /api/portal/api-keys  (GET / POST / DELETE)
// Keys are prefixed sd_mcp_*. POST accepts `scopes` and `expiresAt`.
// The raw key is only returned once at creation time.
// Expired keys are rejected by resolvePortalApiKey() (checked client-side via
// the lastUsedAt path; we verify the shape here rather than live expiry which
// would require waiting or time-mocking).

test.describe('Agentic OS — sd_mcp_* scoped token issuance + expiry @agentic-os', () => {
  const createdKeyIds: number[] = [];

  test.afterAll(async ({ clientApi }) => {
    for (const id of createdKeyIds) {
      await clientApi.delete(`/api/portal/api-keys?id=${id}`).catch(() => {});
    }
  });

  test('POST /api/portal/api-keys issues an sd_mcp_* key with scopes @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/api-keys', {
      name: `e2e-key-${ts}`,
      scopes: ['posts:read', 'posts:write'],
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data).toHaveProperty('key');
    // Key must start with the sd_mcp_ prefix
    expect(res.data.data.key).toMatch(/^sd_mcp_/);
    expect(res.data.data.scopes).toEqual(['posts:read', 'posts:write']);
    createdKeyIds.push(res.data.data.id);
  });

  test('POST /api/portal/api-keys accepts expiresAt and stores it', async ({ clientApi }) => {
    const ts = Date.now();
    // Set expiry 1 hour in the future
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const res = await clientApi.post('/api/portal/api-keys', {
      name: `e2e-expiring-${ts}`,
      expiresAt,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.expiresAt).toBeTruthy();
    // The stored expiresAt should be close to what we sent
    const storedExpiry = new Date(res.data.data.expiresAt).getTime();
    const sentExpiry = new Date(expiresAt).getTime();
    expect(Math.abs(storedExpiry - sentExpiry)).toBeLessThan(2000);
    createdKeyIds.push(res.data.data.id);
  });

  test('POST /api/portal/api-keys rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/api-keys', {
      scopes: ['*'],
    });
    expect(res.status).toBe(400);
  });

  test('GET /api/portal/api-keys lists previously created keys (keyPreview, no raw key)', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/api-keys', {
      name: `e2e-list-${ts}`,
      scopes: ['crm:read'],
    });
    expect(create.status).toBe(201);
    const createdId = create.data.data.id;
    createdKeyIds.push(createdId);

    const listRes = await clientApi.get('/api/portal/api-keys');
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    expect(Array.isArray(listRes.data.data)).toBe(true);

    const found = listRes.data.data.find((k: { id: number }) => k.id === createdId);
    expect(found).toBeTruthy();
    // keyPreview (masked) should be present; raw key must NOT be in list
    expect(found).toHaveProperty('keyPreview');
    expect(found).not.toHaveProperty('key');
    expect(found.scopes).toEqual(['crm:read']);
  });

  test('DELETE /api/portal/api-keys revokes a key', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/api-keys', {
      name: `e2e-revoke-${ts}`,
    });
    expect(create.status).toBe(201);
    const id = create.data.data.id;

    const del = await clientApi.delete(`/api/portal/api-keys?id=${id}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    // After revocation the key should show as inactive in the list
    const listRes = await clientApi.get('/api/portal/api-keys');
    const found = listRes.data.data.find((k: { id: number; active: boolean }) => k.id === id);
    // Key may be present but marked inactive, or absent
    if (found) {
      expect(found.active).toBe(false);
    }
  });

  test('rejects unauthenticated POST', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/api-keys', { name: 'hax' });
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated GET', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/api-keys');
    expect(res.status).toBe(401);
  });
});

// ── Card 3: GET /api/admin/agentic-os/runs ───────────────────────────────────
//
// The implementation exists (app/api/admin/agentic-os/runs/route.ts) but is
// gated by isLocalDev() which returns process.env.NODE_ENV === 'development'.
// The stable test server at :3000 is a Next.js production build (next-server),
// so NODE_ENV is 'production' and the route short-circuits to 404.
//
// We exercise the auth layer (401 for anonymous) as well as confirming that
// the localDev gate is active in the test environment (404 for authenticated
// admin rather than 200) so CI can detect if someone accidentally removes
// the gate.

test.describe('Agentic OS — GET /api/admin/agentic-os/runs (localDev gate) @agentic-os', () => {
  test('returns 404 for anonymous requests (localDev gate active on prod build)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/agentic-os/runs');
    // Route is either 404 (localDev gate) or 401 (auth gate before local gate).
    // Both are acceptable — the route MUST NOT return 200 on a production build.
    expect([401, 404]).toContain(res.status);
  });

  test('admin user also receives 404 — localDev gate blocks even staff on prod @critical', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/agentic-os/runs');
    // On a production build isLocalDev() returns false, so the handler returns
    // 404 before it ever evaluates the session. On a dev build it would be 200.
    // This test will flip to a different assertion if someone re-runs against
    // a dev server — that is intentional and expected.
    expect(res.status).toBe(404);
  });
});
