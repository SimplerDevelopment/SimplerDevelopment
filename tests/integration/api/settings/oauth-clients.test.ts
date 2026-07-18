/**
 * Integration tests for portal OAuth-clients API.
 *
 * Covers:
 *   GET    /api/portal/oauth-clients          — list owned clients
 *   POST   /api/portal/oauth-clients          — create (returns plaintext secret once)
 *   PATCH  /api/portal/oauth-clients/[id]     — rotate_secret
 *   DELETE /api/portal/oauth-clients/[id]     — remove
 *
 * Security invariants exercised here:
 *   1. The plaintext client_secret is only ever in the create/rotate response —
 *      never in the list response, never stored as client_secret_hash.
 *      We assert client_secret_hash !== plaintext and that it equals sha256(plaintext).
 *   2. Cross-tenant: tenant A cannot rotate or delete tenant B's client.
 *      Both cross-tenant mutation cases must return 404 and leave B's row untouched.
 *   3. GET projection must never include client_secret or client_secret_hash.
 *   4. owner_client_id in DB must equal the caller's tenant client id.
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

const CREATE_BODY = {
  client_name: 'Test OAuth Client',
  redirect_uris: ['https://example.com/cb'],
  token_endpoint_auth_method: 'client_secret_basic',
};

// ─── POST (create) ────────────────────────────────────────────────────────────

describe('POST /api/portal/oauth-clients (create) @settings @oauth-clients @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('oauth-create');
  });

  it('returns plaintext client_secret once and stores only its sha256 hash (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/oauth-clients/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        client_id: string;
        client_secret: string;
        client_secret_preview: string;
        client_name: string;
        redirect_uris: string[];
        token_endpoint_auth_method: string;
      };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      body: CREATE_BODY,
    });

    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);

    const plaintext = res.data!.data.client_secret;
    expect(plaintext).toMatch(/^sd_cs_/);

    const preview = res.data!.data.client_secret_preview;
    expect(preview).toBeTruthy();
    expect(preview).not.toBe(plaintext);

    // The DB must NOT hold the plaintext. It must hold the sha256.
    const sql = getTestSql();
    const [row] = await sql<{
      client_secret_hash: string;
      client_secret_preview: string;
      owner_client_id: number;
    }[]>`
      SELECT client_secret_hash, client_secret_preview, owner_client_id
      FROM ${sql(TEST_SCHEMA)}.oauth_clients
      WHERE client_id = ${res.data!.data.client_id}
    `;

    const expectedHash = createHash('sha256').update(plaintext).digest('hex');
    expect(row.client_secret_hash).toBe(expectedHash);
    expect(row.client_secret_hash).not.toBe(plaintext);
    expect(row.client_secret_preview).toBeTruthy();
    expect(row.client_secret_preview).not.toBe(plaintext);

    // owner_client_id must be the caller's tenant client id.
    expect(row.owner_client_id).toBe(A.client.id);
  });

  it('rejects missing client_name (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/oauth-clients/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { redirect_uris: ['https://example.com/cb'], token_endpoint_auth_method: 'client_secret_basic' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty redirect_uris (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/oauth-clients/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { client_name: 'X', redirect_uris: [], token_endpoint_auth_method: 'client_secret_basic' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/oauth-clients/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: CREATE_BODY },
    );
    expect(res.status).toBe(401);
  });
});

// ─── GET (list) ───────────────────────────────────────────────────────────────

describe('GET /api/portal/oauth-clients (list) @settings @oauth-clients @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('oauth-list-a'),
      sessionForNewClientUser('oauth-list-b'),
    ]);
  });

  it('returns only the caller\'s owned clients — no cross-tenant leak', async () => {
    const route = await import('@/app/api/portal/oauth-clients/route');

    await asTenant(A);
    const aCreate = await callHandler<{ data: { client_id: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ...CREATE_BODY, client_name: 'A-client' } },
    );
    expect(aCreate.status).toBe(201);
    const aClientId = aCreate.data!.data.client_id;

    await asTenant(B);
    const bCreate = await callHandler<{ data: { client_id: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ...CREATE_BODY, client_name: 'B-client' } },
    );
    expect(bCreate.status).toBe(201);
    const bClientId = bCreate.data!.data.client_id;

    // List as A — must see A's client, must NOT see B's client.
    await asTenant(A);
    const list = await callHandler<{ success: boolean; data: Array<{ client_id: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(list.status).toBe(200);
    expect(list.data?.success).toBe(true);

    const ids = list.data!.data.map(c => c.client_id);
    expect(ids).toContain(aClientId);
    expect(ids).not.toContain(bClientId);
  });

  it('GET projection never includes client_secret or client_secret_hash', async () => {
    const route = await import('@/app/api/portal/oauth-clients/route');

    await asTenant(A);
    const create = await callHandler<{ data: { client_id: string; client_secret: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ...CREATE_BODY, client_name: 'No-Reveal' } },
    );
    expect(create.status).toBe(201);
    const plaintext = create.data!.data.client_secret;

    const list = await callHandler<{ data: Array<Record<string, unknown>> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(list.status).toBe(200);

    const found = list.data?.data.find(c => c.client_id === create.data!.data.client_id);
    expect(found).toBeTruthy();

    // Defensive: projection must not include raw secret or hash.
    for (const v of Object.values(found!)) {
      expect(v).not.toBe(plaintext);
    }
    expect((found as Record<string, unknown>).client_secret).toBeUndefined();
    expect((found as Record<string, unknown>).client_secret_hash).toBeUndefined();
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/oauth-clients/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

// ─── PATCH (rotate_secret) ────────────────────────────────────────────────────

describe('PATCH /api/portal/oauth-clients/[id] (rotate_secret) @settings @oauth-clients @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('oauth-rotate-a'),
      sessionForNewClientUser('oauth-rotate-b'),
    ]);
  });

  it('happy path: returns a new secret; DB hash changed and rotated_at set (200)', async () => {
    const collRoute = await import('@/app/api/portal/oauth-clients/route');
    await asTenant(A);
    const created = await callHandler<{
      data: { client_id: string; client_secret: string };
    }>(
      collRoute as unknown as Record<string, unknown>, 'POST',
      { body: { ...CREATE_BODY, client_name: 'Rotate Me' } },
    );
    expect(created.status).toBe(201);
    const originalSecret = created.data!.data.client_secret;
    const clientId = created.data!.data.client_id;

    // Get the DB row id for the [id] route.
    const sql = getTestSql();
    const [dbRow] = await sql<{ id: number; client_secret_hash: string }[]>`
      SELECT id, client_secret_hash
      FROM ${sql(TEST_SCHEMA)}.oauth_clients
      WHERE client_id = ${clientId}
    `;
    const rowId = dbRow.id;
    const originalHash = dbRow.client_secret_hash;

    const idRoute = await import('@/app/api/portal/oauth-clients/[id]/route');
    const patch = await callHandler<{
      success: boolean;
      data: { client_secret: string; client_secret_rotated_at: string };
    }>(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      {
        body: { action: 'rotate_secret' },
        params: { id: String(rowId) },
      },
    );
    expect(patch.status).toBe(200);
    expect(patch.data?.success).toBe(true);

    const newSecret = patch.data!.data.client_secret;
    expect(newSecret).toMatch(/^sd_cs_/);
    expect(newSecret).not.toBe(originalSecret);
    expect(patch.data!.data.client_secret_rotated_at).toBeTruthy();

    const [after] = await sql<{ client_secret_hash: string; client_secret_rotated_at: Date | null }[]>`
      SELECT client_secret_hash, client_secret_rotated_at
      FROM ${sql(TEST_SCHEMA)}.oauth_clients
      WHERE id = ${rowId}
    `;
    expect(after.client_secret_hash).not.toBe(originalHash);
    expect(after.client_secret_rotated_at).not.toBeNull();

    const expectedNewHash = createHash('sha256').update(newSecret).digest('hex');
    expect(after.client_secret_hash).toBe(expectedNewHash);
  });

  it('cross-tenant: A cannot rotate B\'s client — 404; B\'s hash unchanged', async () => {
    const collRoute = await import('@/app/api/portal/oauth-clients/route');

    await asTenant(B);
    const bCreated = await callHandler<{ data: { client_id: string } }>(
      collRoute as unknown as Record<string, unknown>, 'POST',
      { body: { ...CREATE_BODY, client_name: 'B-private' } },
    );
    expect(bCreated.status).toBe(201);
    const bClientId = bCreated.data!.data.client_id;

    const sql = getTestSql();
    const [bRow] = await sql<{ id: number; client_secret_hash: string }[]>`
      SELECT id, client_secret_hash
      FROM ${sql(TEST_SCHEMA)}.oauth_clients
      WHERE client_id = ${bClientId}
    `;
    const bRowId = bRow.id;
    const bOriginalHash = bRow.client_secret_hash;

    // A attempts to rotate B's client.
    await asTenant(A);
    const idRoute = await import('@/app/api/portal/oauth-clients/[id]/route');
    const patch = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      {
        body: { action: 'rotate_secret' },
        params: { id: String(bRowId) },
      },
    );
    expect(patch.status).toBe(404);

    // B's hash must be unchanged.
    const [bAfter] = await sql<{ client_secret_hash: string }[]>`
      SELECT client_secret_hash
      FROM ${sql(TEST_SCHEMA)}.oauth_clients
      WHERE id = ${bRowId}
    `;
    expect(bAfter.client_secret_hash).toBe(bOriginalHash);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/portal/oauth-clients/[id] @settings @oauth-clients @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('oauth-delete-a'),
      sessionForNewClientUser('oauth-delete-b'),
    ]);
  });

  it('happy path: removes the row from DB (200)', async () => {
    const collRoute = await import('@/app/api/portal/oauth-clients/route');
    await asTenant(A);
    const created = await callHandler<{ data: { client_id: string } }>(
      collRoute as unknown as Record<string, unknown>, 'POST',
      { body: { ...CREATE_BODY, client_name: 'To Delete' } },
    );
    expect(created.status).toBe(201);
    const clientId = created.data!.data.client_id;

    const sql = getTestSql();
    const [dbRow] = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.oauth_clients WHERE client_id = ${clientId}
    `;
    const rowId = dbRow.id;

    const idRoute = await import('@/app/api/portal/oauth-clients/[id]/route');
    const del = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(rowId) } },
    );
    expect(del.status).toBe(200);

    const remaining = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.oauth_clients WHERE id = ${rowId}
    `;
    expect(remaining).toHaveLength(0);
  });

  it('cross-tenant: A cannot delete B\'s client — 404; B\'s row still exists', async () => {
    const collRoute = await import('@/app/api/portal/oauth-clients/route');

    await asTenant(B);
    const bCreated = await callHandler<{ data: { client_id: string } }>(
      collRoute as unknown as Record<string, unknown>, 'POST',
      { body: { ...CREATE_BODY, client_name: 'B-keep' } },
    );
    expect(bCreated.status).toBe(201);
    const bClientId = bCreated.data!.data.client_id;

    const sql = getTestSql();
    const [bRow] = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.oauth_clients WHERE client_id = ${bClientId}
    `;
    const bRowId = bRow.id;

    // A attempts to delete B's client.
    await asTenant(A);
    const idRoute = await import('@/app/api/portal/oauth-clients/[id]/route');
    const del = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(bRowId) } },
    );
    expect(del.status).toBe(404);

    // B's row must still be in the DB.
    const stillThere = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.oauth_clients WHERE id = ${bRowId}
    `;
    expect(stillThere).toHaveLength(1);
  });
});
