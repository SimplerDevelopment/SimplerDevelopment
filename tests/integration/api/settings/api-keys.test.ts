/**
 * Integration tests for portal API-keys route.
 *
 * Covers /api/portal/api-keys:
 *   - GET    list (returns hash-free projection)
 *   - POST   create (returns plaintext key ONCE; hash, not plaintext, persisted)
 *   - DELETE revoke by id (active=false + revokedAt set)
 *
 * Security invariants exercised here:
 *   1. The plaintext key is only ever in the create response — never in the
 *      list response, and never stored as `keyHash`. We assert
 *      `keyHash !== plaintext` and that keyHash matches sha256(plaintext).
 *   2. Cross-tenant: tenant A cannot list, revoke, or otherwise see tenant B's keys.
 *
 * Does not duplicate tests/e2e/portal-api-keys.spec.ts (which exercises the
 * same route through the live HTTP stack with a logged-in client session).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

describe('POST /api/portal/api-keys (create) @settings @api-keys @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('apikey-create');
  });

  it('returns plaintext key once and stores only its sha256 hash (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/api-keys/route');
    const res = await callHandler<{
      success: boolean;
      data: { id: number; key: string; keyPreview: string; scopes: string[] };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'Test Key', scopes: ['*'] },
    });
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    const plaintext = res.data!.data.key;
    expect(plaintext).toMatch(/^sd_mcp_/);
    expect(res.data?.data.keyPreview).toMatch(/^sd_mcp_/);

    // The DB must NOT hold the plaintext anywhere. It must hold the sha256.
    const sql = getTestSql();
    const [row] = await sql<{ key_hash: string; key_preview: string }[]>`
      SELECT key_hash, key_preview FROM ${sql(TEST_SCHEMA)}.portal_api_keys WHERE id = ${res.data!.data.id}
    `;
    const expectedHash = createHash('sha256').update(plaintext).digest('hex');
    expect(row.key_hash).toBe(expectedHash);
    expect(row.key_hash).not.toBe(plaintext);
    expect(row.key_preview.startsWith(plaintext.slice(0, 12))).toBe(true);
  });

  it('subsequent GET never re-exposes the plaintext key', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/api-keys/route');
    const create = await callHandler<{ data: { id: number; key: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'No-Reveal', scopes: ['*'] } },
    );
    const plaintext = create.data!.data.key;

    const list = await callHandler<{ success: boolean; data: Array<Record<string, unknown>> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(list.status).toBe(200);
    const found = list.data?.data.find(k => (k as { id: number }).id === create.data!.data.id);
    expect(found).toBeTruthy();
    // None of the projected fields should be the plaintext key.
    for (const v of Object.values(found!)) {
      expect(v).not.toBe(plaintext);
    }
    // Defensively, the projection must not include `key` or `keyHash` at all.
    expect((found as Record<string, unknown>).key).toBeUndefined();
    expect((found as Record<string, unknown>).keyHash).toBeUndefined();
  });

  it('rejects missing name (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/api-keys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { scopes: ['*'] } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/api-keys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', scopes: ['*'] } },
    );
    expect(res.status).toBe(401);
  });

  it('persists requireCmsApproval=true when requested', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/api-keys/route');
    const res = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'Approval', scopes: ['*'], requireCmsApproval: true } },
    );
    expect(res.status).toBe(201);

    const sql = getTestSql();
    const [row] = await sql<{ require_cms_approval: boolean }[]>`
      SELECT require_cms_approval FROM ${sql(TEST_SCHEMA)}.portal_api_keys WHERE id = ${res.data!.data.id}
    `;
    expect(row.require_cms_approval).toBe(true);
  });
});

describe('GET /api/portal/api-keys (list) @settings @api-keys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('apikey-list-a'),
      sessionForNewClientUser('apikey-list-b'),
    ]);
  });

  it('returns only the caller\'s keys (no cross-tenant leak)', async () => {
    // Seed one key for each tenant.
    const route = await import('@/app/api/portal/api-keys/route');
    await asTenant(A);
    const aKey = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'A-key', scopes: ['*'] } },
    );
    await asTenant(B);
    const bKey = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'B-key', scopes: ['*'] } },
    );

    await asTenant(A);
    const list = await callHandler<{ data: Array<{ id: number; name: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    const ids = list.data!.data.map(k => k.id);
    expect(ids).toContain(aKey.data!.data.id);
    expect(ids).not.toContain(bKey.data!.data.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/api-keys/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/portal/api-keys (revoke) @settings @api-keys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('apikey-rev-a'),
      sessionForNewClientUser('apikey-rev-b'),
    ]);
  });

  it('happy path: marks active=false + sets revokedAt (200)', async () => {
    const route = await import('@/app/api/portal/api-keys/route');
    await asTenant(A);
    const created = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'To Revoke', scopes: ['*'] } },
    );
    const id = created.data!.data.id;

    const del = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { url: `http://localhost:3000/?id=${id}` },
    );
    expect(del.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ active: boolean; revoked_at: Date | null }[]>`
      SELECT active, revoked_at FROM ${sql(TEST_SCHEMA)}.portal_api_keys WHERE id = ${id}
    `;
    expect(row.active).toBe(false);
    expect(row.revoked_at).not.toBeNull();
  });

  it('rejects missing id (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/api-keys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { url: 'http://localhost:3000/' },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A cannot revoke B\'s key (no-op + B\'s key still active)', async () => {
    const route = await import('@/app/api/portal/api-keys/route');
    await asTenant(B);
    const bKey = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'B-Key', scopes: ['*'] } },
    );
    const id = bKey.data!.data.id;

    await asTenant(A);
    const del = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { url: `http://localhost:3000/?id=${id}` },
    );
    // Route returns 200 for "no rows affected" — security comes from the AND
    // (clientId = caller's), not from a 404. Verify in DB the key is untouched.
    expect(del.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ active: boolean; revoked_at: Date | null }[]>`
      SELECT active, revoked_at FROM ${sql(TEST_SCHEMA)}.portal_api_keys WHERE id = ${id}
    `;
    expect(row.active).toBe(true);
    expect(row.revoked_at).toBeNull();
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/api-keys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { url: 'http://localhost:3000/?id=1' },
    );
    expect(res.status).toBe(401);
  });
});
