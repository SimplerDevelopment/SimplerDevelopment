/**
 * Integration tests for the BYOK provider-key REST surface.
 *
 *   /api/portal/integrations/api-keys           — POST (create), GET (list)
 *   /api/portal/integrations/api-keys/[id]      — PATCH (label), DELETE
 *
 * Security invariants exercised here:
 *
 *   1. POST encrypts the raw key. Persisted `encrypted_key` is NEVER the
 *      plaintext — verify by decrypting via the existing crypto helper and
 *      asserting the round-trip restores the input.
 *   2. GET returns a redacted display string ("sk-ant-…AbCd"), never the
 *      raw key and never the encrypted blob.
 *   3. PATCH (label) only mutates the label.
 *   4. DELETE removes the row outright.
 *   5. Tenancy: a key uploaded under client A is invisible to client B's
 *      list, and B cannot PATCH or DELETE A's key (returns 404).
 *
 * Sibling spec `tests/integration/api/settings/api-keys.test.ts` covers the
 * older `/api/portal/api-keys` route (portal-issued MCP keys) — different
 * resource, different table.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { randomBytes } from 'node:crypto';

// MUST be set before any module that calls into encrypt/decrypt is imported.
// The route module pulls in `lib/crypto/api-key.ts` which reads ENCRYPTION_KEY
// from env at call time — but defensive-set here keeps every spec independent.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { decryptApiKey } from '@/lib/crypto/api-key';
import { callHandler } from '../../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

const ANTHROPIC_FIXTURE = `sk-ant-api03-${'A'.repeat(86)}AA`;
const OPENAI_FIXTURE = `sk-proj-${'B'.repeat(48)}`;

describe('POST /api/portal/integrations/api-keys (create) @byok @api-keys', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('byok-create');
  });

  it('encrypts the raw key — persisted encrypted_key decrypts to the input (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/integrations/api-keys/route');
    const res = await callHandler<{
      success: boolean;
      data: { id: number; provider: string; keyPreview: string };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'prod' },
    });

    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.provider).toBe('anthropic');
    // Response carries only a redacted preview — never the raw key.
    expect(res.data?.data.keyPreview).not.toBe(ANTHROPIC_FIXTURE);
    expect(res.data?.data.keyPreview.length).toBeLessThan(ANTHROPIC_FIXTURE.length);

    // The DB must NOT hold the plaintext anywhere — the column is base64
    // ciphertext and decrypts cleanly back to the original key.
    const sql = getTestSql();
    const [row] = await sql<{ encrypted_key: string; label: string | null }[]>`
      SELECT encrypted_key, label FROM ${sql(TEST_SCHEMA)}.client_api_keys
      WHERE id = ${res.data!.data.id}
    `;
    expect(row.encrypted_key).not.toBe(ANTHROPIC_FIXTURE);
    expect(row.encrypted_key).not.toContain(ANTHROPIC_FIXTURE);
    expect(decryptApiKey(row.encrypted_key)).toBe(ANTHROPIC_FIXTURE);
    expect(row.label).toBe('prod');
  });

  it('rejects unsupported providers (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/integrations/api-keys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'gemini', apiKey: 'sk-anything-' + 'X'.repeat(40) } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/integrations/api-keys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects too-short keys (400) without writing a row', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/integrations/api-keys/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: 'sk-ant-' } },
    );
    expect(res.status).toBe(400);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE client_id = ${A.client.id}
    `;
    expect(rows).toEqual([]);
  });
});

describe('GET /api/portal/integrations/api-keys (list) @byok @api-keys', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('byok-list');
  });

  it('returns the redacted display string and never the raw key', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/integrations/api-keys/route');

    // Seed two keys via the create endpoint so we exercise the encryption path.
    const a = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'A' } },
    );
    const b = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'openai', apiKey: OPENAI_FIXTURE, label: 'B' } },
    );
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const list = await callHandler<{
      success: boolean;
      data: Array<{
        id: number;
        provider: string;
        label: string | null;
        keyPreview: string;
      }>;
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(list.status).toBe(200);
    expect(list.data?.success).toBe(true);
    const items = list.data!.data;
    expect(items.length).toBe(2);

    const anth = items.find((k) => k.provider === 'anthropic')!;
    const oai = items.find((k) => k.provider === 'openai')!;

    // None of the items leak the raw key, the encrypted blob, or hidden columns.
    for (const it of items) {
      for (const v of Object.values(it)) {
        expect(v).not.toBe(ANTHROPIC_FIXTURE);
        expect(v).not.toBe(OPENAI_FIXTURE);
      }
      // No accidental projection of the encrypted blob to the wire.
      expect((it as Record<string, unknown>).encryptedKey).toBeUndefined();
      expect((it as Record<string, unknown>).encrypted_key).toBeUndefined();
    }

    // Preview matches the documented mask shape: first 6 chars + … + last 4.
    // For Anthropic ("sk-ant-…") the first 6 chars are "sk-ant".
    expect(anth.keyPreview.startsWith('sk-ant')).toBe(true);
    expect(anth.keyPreview).toContain('…'); // unicode horizontal ellipsis
    expect(anth.keyPreview.endsWith(ANTHROPIC_FIXTURE.slice(-4))).toBe(true);
    // OpenAI fixture is "sk-proj-…" → first 6 chars are "sk-pro".
    expect(oai.keyPreview.startsWith('sk-pro')).toBe(true);
    expect(oai.keyPreview.endsWith(OPENAI_FIXTURE.slice(-4))).toBe(true);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/integrations/api-keys/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/portal/integrations/api-keys/[id] (update label) @byok @api-keys', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('byok-patch');
  });

  it('updates the label and leaves encrypted_key untouched', async () => {
    await asTenant(A);
    const collection = await import('@/app/api/portal/integrations/api-keys/route');
    const created = await callHandler<{ data: { id: number } }>(
      collection as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'old' } },
    );
    const id = created.data!.data.id;

    const sql = getTestSql();
    const [pre] = await sql<{ encrypted_key: string }[]>`
      SELECT encrypted_key FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE id = ${id}
    `;

    const item = await import('@/app/api/portal/integrations/api-keys/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { id: number; label: string | null };
    }>(item as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(id) },
      body: { label: 'rotated-prod' },
    });

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.label).toBe('rotated-prod');

    const [post] = await sql<{ label: string | null; encrypted_key: string }[]>`
      SELECT label, encrypted_key FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE id = ${id}
    `;
    expect(post.label).toBe('rotated-prod');
    expect(post.encrypted_key).toBe(pre.encrypted_key);
    expect(decryptApiKey(post.encrypted_key)).toBe(ANTHROPIC_FIXTURE);
  });

  it('rejects empty body (400)', async () => {
    await asTenant(A);
    const collection = await import('@/app/api/portal/integrations/api-keys/route');
    const created = await callHandler<{ data: { id: number } }>(
      collection as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'x' } },
    );

    const item = await import('@/app/api/portal/integrations/api-keys/[id]/route');
    const res = await callHandler(
      item as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(created.data!.data.id) }, body: {} },
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/portal/integrations/api-keys/[id] @byok @api-keys', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('byok-delete');
  });

  it('removes the row outright (200)', async () => {
    await asTenant(A);
    const collection = await import('@/app/api/portal/integrations/api-keys/route');
    const created = await callHandler<{ data: { id: number } }>(
      collection as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'doomed' } },
    );
    const id = created.data!.data.id;

    const item = await import('@/app/api/portal/integrations/api-keys/[id]/route');
    const res = await callHandler(
      item as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE id = ${id}
    `;
    expect(rows).toEqual([]);
  });

  it('returns 404 for a non-existent id', async () => {
    await asTenant(A);
    const item = await import('@/app/api/portal/integrations/api-keys/[id]/route');
    const res = await callHandler(
      item as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '99999999' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Cross-tenant isolation @byok @api-keys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('byok-tenant-a'),
      sessionForNewClientUser('byok-tenant-b'),
    ]);
  });

  it("client B's list never contains client A's keys", async () => {
    const route = await import('@/app/api/portal/integrations/api-keys/route');

    await asTenant(A);
    const a = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'A' } },
    );
    expect(a.status).toBe(201);

    await asTenant(B);
    const list = await callHandler<{
      data: Array<{ id: number }>;
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(list.status).toBe(200);
    const ids = list.data!.data.map((k) => k.id);
    expect(ids).not.toContain(a.data!.data.id);
  });

  it("client B cannot PATCH client A's key (404)", async () => {
    const collection = await import('@/app/api/portal/integrations/api-keys/route');
    await asTenant(A);
    const a = await callHandler<{ data: { id: number } }>(
      collection as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'A-untouchable' } },
    );

    await asTenant(B);
    const item = await import('@/app/api/portal/integrations/api-keys/[id]/route');
    const res = await callHandler(
      item as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(a.data!.data.id) }, body: { label: 'pwn3d' } },
    );
    expect(res.status).toBe(404);

    // Verify the row is untouched.
    const sql = getTestSql();
    const [row] = await sql<{ label: string | null }[]>`
      SELECT label FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE id = ${a.data!.data.id}
    `;
    expect(row.label).toBe('A-untouchable');
  });

  it("client B cannot DELETE client A's key (404)", async () => {
    const collection = await import('@/app/api/portal/integrations/api-keys/route');
    await asTenant(A);
    const a = await callHandler<{ data: { id: number } }>(
      collection as unknown as Record<string, unknown>, 'POST',
      { body: { provider: 'anthropic', apiKey: ANTHROPIC_FIXTURE, label: 'A-survives' } },
    );

    await asTenant(B);
    const item = await import('@/app/api/portal/integrations/api-keys/[id]/route');
    const res = await callHandler(
      item as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(a.data!.data.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE id = ${a.data!.data.id}
    `;
    expect(rows.length).toBe(1);
  });
});
