/**
 * Cron endpoint tests for /api/cron/expire-mcp-pendings.
 *
 * Validates auth guard and the response contract. Does not verify the DB
 * transition itself (that's covered implicitly — the endpoint returns
 * expiredCount when rows exist).
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, createTestWebsite, McpTestClient } from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Cron: expire stale MCP pendings @cron @mcp @approvals', () => {
  test('rejects unauthenticated requests', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/cron/expire-mcp-pendings');
    expect(res.status).toBe(401);
  });

  test('rejects bogus bearer token', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cron/expire-mcp-pendings`, {
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    expect(res.status()).toBe(401);
  });

  test('accepts valid CRON_SECRET and returns expiry report shape', async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, 'CRON_SECRET not set — skipping positive auth test');

    const res = await request.post(`${BASE_URL}/api/cron/expire-mcp-pendings`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.expiredCount).toBe('number');
    expect(typeof body.ttlDays).toBe('number');
    expect(typeof body.cutoff).toBe('string');
    expect(body.ttlDays).toBeGreaterThan(0);
  });

  test('accepts Vercel cron header', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cron/expire-mcp-pendings`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.expiredCount).toBe('number');
  });

  test('is idempotent — calling twice returns zero or same count on second call', async ({ request }) => {
    const first = await request.get(`${BASE_URL}/api/cron/expire-mcp-pendings`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(first.status()).toBe(200);

    const second = await request.get(`${BASE_URL}/api/cron/expire-mcp-pendings`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    // Second call should find nothing new to expire (first one already did it)
    expect(secondBody.expiredCount).toBe(0);
  });
});

test.describe('Cron: actual expiration transition @cron @mcp @approvals', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('stale pending transitions to expired with errorMessage', async ({ clientApi, request }) => {
    // Stage a pending change
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Expire Me ${ts}`,
      slug: `expire-me-${ts}`,
      content: 'x',
    });
    const pendingId = (staged.data as { pendingId: number }).pendingId;
    expect(pendingId).toBeDefined();

    // Wait 3 seconds so the pending is older than our 2-second TTL threshold.
    await new Promise(r => setTimeout(r, 3000));

    // Trigger cron with ttlSeconds=2, scoped to this pending id only.
    const cronRes = await request.get(
      `${BASE_URL}/api/cron/expire-mcp-pendings?ttlSeconds=2&ids=${pendingId}`,
      { headers: { 'x-vercel-cron': '1' } },
    );
    expect(cronRes.status()).toBe(200);
    const cronBody = await cronRes.json();
    expect(cronBody.success).toBe(true);
    expect(cronBody.expiredCount).toBe(1);
    expect(cronBody.ttlSeconds).toBe(2);

    // Verify via the approvals detail endpoint: status=expired, errorMessage set.
    const detail = await clientApi.get(`/api/portal/approvals/${pendingId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.data.change.status).toBe('expired');
    expect(detail.data.data.change.errorMessage).toMatch(/auto-expired/i);
    expect(detail.data.data.change.errorMessage).toContain('2s');

    // Expired pendings can no longer be approved.
    const approveRes = await clientApi.post(`/api/portal/approvals/${pendingId}/approve`, {});
    expect(approveRes.status).toBe(400);
    expect(approveRes.data.message).toMatch(/status is expired/);
  });

  test('recent pending (younger than TTL) is NOT expired', async ({ clientApi, request }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Too Fresh ${ts}`,
      slug: `too-fresh-${ts}`,
      content: 'x',
    });
    const pendingId = (staged.data as { pendingId: number }).pendingId;

    // Call immediately with ttlSeconds=3600 — the pending is well within TTL.
    const cronRes = await request.get(
      `${BASE_URL}/api/cron/expire-mcp-pendings?ttlSeconds=3600&ids=${pendingId}`,
      { headers: { 'x-vercel-cron': '1' } },
    );
    expect(cronRes.status()).toBe(200);
    const cronBody = await cronRes.json();
    expect(cronBody.expiredCount).toBe(0);

    // Still pending
    const detail = await clientApi.get(`/api/portal/approvals/${pendingId}`);
    expect(detail.data.data.change.status).toBe('pending');
  });

  test('ids filter scopes expiration — non-listed rows stay pending', async ({ clientApi, request }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const a = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `Expire A ${ts}`, slug: `expire-a-${ts}`, content: 'x',
    });
    const b = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `Keep B ${ts}`, slug: `keep-b-${ts}`, content: 'x',
    });
    const idA = (a.data as { pendingId: number }).pendingId;
    const idB = (b.data as { pendingId: number }).pendingId;

    await new Promise(r => setTimeout(r, 2000));

    const cronRes = await request.get(
      `${BASE_URL}/api/cron/expire-mcp-pendings?ttlSeconds=1&ids=${idA}`,
      { headers: { 'x-vercel-cron': '1' } },
    );
    const cronBody = await cronRes.json();
    expect(cronBody.expiredCount).toBe(1);

    const detailA = await clientApi.get(`/api/portal/approvals/${idA}`);
    const detailB = await clientApi.get(`/api/portal/approvals/${idB}`);
    expect(detailA.data.data.change.status).toBe('expired');
    expect(detailB.data.data.change.status).toBe('pending');
  });
});
