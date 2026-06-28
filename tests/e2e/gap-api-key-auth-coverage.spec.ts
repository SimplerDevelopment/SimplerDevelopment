/**
 * Headless API key auth (security fix) @gap @api-key-auth
 *
 * The v1 headless content API now REQUIRES a valid key (was open on missing
 * key), and keys are stored HASHED at rest (was plaintext).
 */
import { test, expect } from './setup/fixtures';
import { resolveClientSiteId } from './setup/helpers';
import { execSync } from 'child_process';
import crypto from 'crypto';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Headless API key auth @gap @api-key-auth', () => {
  let siteId: number;
  let rawKey: string;
  let keyId: number;

  const extraKeyIds: number[] = [];

  test.afterAll(async () => {
    const ids = [keyId, ...extraKeyIds].filter(Boolean);
    if (ids.length) sql(`DELETE FROM api_keys WHERE id IN (${ids.join(',')})`);
  });

  test('creating a key returns the raw key once and stores only a hash', async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);
    const res = await clientApi.post(`/api/portal/websites/${siteId}/api-keys`, { name: 'e2e-test-key' });
    expect([200, 201]).toContain(res.status);
    rawKey = res.data.data.key;
    keyId = res.data.data.id;
    expect(rawKey).toMatch(/^sd_live_[0-9a-f]{64}$/);

    // Stored hashed, not plaintext: key_hash = sha256(raw); no `key` column exists.
    const expectedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    expect(sql(`SELECT key_hash FROM api_keys WHERE id=${keyId}`)).toBe(expectedHash);
    expect(sql(`SELECT key_preview FROM api_keys WHERE id=${keyId}`)).toContain('...');
    expect(sql(`SELECT count(*) FROM information_schema.columns WHERE table_name='api_keys' AND column_name='key'`)).toBe('0');
  });

  test('the v1 headless API requires a valid key', async ({ request }) => {
    // No key → 401 (this used to fall through to the handler — the security hole).
    expect((await request.get(`/api/v1/sites/${siteId}/posts`)).status()).toBe(401);
    // Bad key → 401.
    expect((await request.get(`/api/v1/sites/${siteId}/posts`, { headers: { Authorization: 'Bearer sd_live_deadbeef' } })).status()).toBe(401);
    // Valid key (Bearer) → 200.
    expect((await request.get(`/api/v1/sites/${siteId}/posts`, { headers: { Authorization: `Bearer ${rawKey}` } })).status()).toBe(200);
    // Valid key (x-api-key header) → 200.
    expect((await request.get(`/api/v1/sites/${siteId}/posts`, { headers: { 'x-api-key': rawKey } })).status()).toBe(200);
  });

  test('a revoked (inactive) key is rejected', async ({ request }) => {
    sql(`UPDATE api_keys SET active=false WHERE id=${keyId}`);
    expect((await request.get(`/api/v1/sites/${siteId}/posts`, { headers: { Authorization: `Bearer ${rawKey}` } })).status()).toBe(401);
    sql(`UPDATE api_keys SET active=true WHERE id=${keyId}`);
  });

  test('per-key scopes are enforced on the v1 surface', async ({ clientApi, request }) => {
    const create = (scopes: string[]) =>
      clientApi.post(`/api/portal/websites/${siteId}/api-keys`, { name: `scoped-${scopes.join('-') || 'full'}`, scopes });

    const contentRes = await create(['content:read']);
    extraKeyIds.push(contentRes.data.data.id);
    const contentKey = contentRes.data.data.key;
    const storeRes = await create(['store:read']);
    extraKeyIds.push(storeRes.data.data.id);
    const storeKey = storeRes.data.data.key;

    const get = (path: string, key: string) =>
      request.get(`/api/v1/sites/${siteId}${path}`, { headers: { Authorization: `Bearer ${key}` } });

    // content:read key — posts ok, products forbidden.
    expect((await get('/posts', contentKey)).status()).toBe(200);
    expect((await get('/products', contentKey)).status()).toBe(403);
    // store:read key — products ok, posts forbidden.
    expect((await get('/products', storeKey)).status()).toBe(200);
    expect((await get('/posts', storeKey)).status()).toBe(403);
    // The unscoped key from the first test is full-access — both ok.
    expect((await get('/posts', rawKey)).status()).toBe(200);
    expect((await get('/products', rawKey)).status()).toBe(200);
  });
});
