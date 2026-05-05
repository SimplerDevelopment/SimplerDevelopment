/**
 * Portal Approvals — Mutation Lifecycle Golden Path (@critical)
 *
 * Single rerunnable spec that exercises the staging + decision lifecycle for
 * MCP-issued pending changes from the portal HTTP API perspective:
 *   - stage a posts_create via an approval-required key
 *   - read the queue (list, count, detail)
 *   - approve one + verify it lands in the underlying CMS
 *   - reject another + verify the post was NOT created
 *   - bulk-approve + bulk-reject batches
 *
 * Companion to tests/integration/api/approvals/{queue,decisions,bulk}.test.ts,
 * which pin per-route auth + cross-tenant + 403 + edge-case shape. This spec
 * proves the full HTTP stack + auth cookies + apply-dispatcher work together
 * end-to-end, but is intentionally narrow to keep wall-clock time low for
 * the @critical gate.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestApiKey,
  createTestWebsite,
  McpTestClient,
} from './setup/helpers';

const PREFIX = 'APPR-MUT-';

test.describe('Portal Approvals — staging + decision lifecycle @approvals @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  // Wraps multiple MCP staging calls + bulk operations.
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('APPR-full-lifecycle: stage → list → approve / reject / bulk', async ({ clientApi }) => {
    // ── Setup: a website + an approval-required MCP key ──────────────
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    async function stagePost(suffix: string) {
      const res = await mcp.callTool('posts_create', {
        websiteId: website.id,
        title: `${PREFIX}${suffix}-${ts}`,
        slug: `${PREFIX.toLowerCase()}${suffix.toLowerCase()}-${ts}`,
        content: `body-${suffix}`,
      });
      expect(res.data?.pending, `expected ${suffix} to stage`).toBe(true);
      return res.data!.pendingId as number;
    }

    const approveId = await stagePost('Approve');
    const rejectId = await stagePost('Reject');
    const bulkApproveIds = await Promise.all([
      stagePost('BulkA1'),
      stagePost('BulkA2'),
    ]);
    const bulkRejectIds = await Promise.all([
      stagePost('BulkR1'),
      stagePost('BulkR2'),
    ]);

    // ── List + count ─────────────────────────────────────────────────
    const list = await clientApi.get('/api/portal/approvals?status=pending');
    expect(list.status).toBe(200);
    expect(list.data.success).toBe(true);
    expect(list.data.meta.canManage).toBe(true);
    const ids = (list.data.data as Array<{ id: number }>).map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining([approveId, rejectId, ...bulkApproveIds, ...bulkRejectIds]));

    const count = await clientApi.get('/api/portal/approvals?count=true');
    expect(count.status).toBe(200);
    expect(typeof count.data.data.count).toBe('number');
    expect(count.data.data.count).toBeGreaterThanOrEqual(6);

    // ── Detail ───────────────────────────────────────────────────────
    const detail = await clientApi.get(`/api/portal/approvals/${approveId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.data.change.id).toBe(approveId);
    expect(detail.data.data.change.payload).toBeTruthy();

    // ── Approve one ──────────────────────────────────────────────────
    const approveRes = await clientApi.post(`/api/portal/approvals/${approveId}/approve`, {
      note: 'approved by E2E',
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.data.change.status).toBe('applied');
    expect(approveRes.data.data.change.reviewNote).toBe('approved by E2E');

    // Approving a second time is rejected with 400.
    const doubleApprove = await clientApi.post(`/api/portal/approvals/${approveId}/approve`, {});
    expect(doubleApprove.status).toBe(400);

    // ── Reject one ───────────────────────────────────────────────────
    const rejectRes = await clientApi.post(`/api/portal/approvals/${rejectId}/reject`, {
      note: 'rejected by E2E',
    });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.data.data.status).toBe('rejected');

    // Rejecting after rejected → 400.
    const doubleReject = await clientApi.post(`/api/portal/approvals/${rejectId}/reject`, {});
    expect(doubleReject.status).toBe(400);

    // ── Bulk approve ─────────────────────────────────────────────────
    const bulkApprove = await clientApi.post('/api/portal/approvals/bulk-approve', {
      ids: bulkApproveIds,
      note: 'batch approved',
    });
    expect(bulkApprove.status).toBe(200);
    expect(bulkApprove.data.data.total).toBe(2);
    expect(bulkApprove.data.data.applied).toBe(2);
    expect(bulkApprove.data.data.failed).toBe(0);

    // ── Bulk reject ──────────────────────────────────────────────────
    const bulkReject = await clientApi.post('/api/portal/approvals/bulk-reject', {
      ids: bulkRejectIds,
      note: 'batch rejected',
    });
    expect(bulkReject.status).toBe(200);
    expect(bulkReject.data.data.total).toBe(2);
    expect(bulkReject.data.data.rejected).toBe(2);

    // ── Verify in CMS: approved post exists, rejected does NOT ───────
    const postList = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    expect(postList.status).toBe(200);
    const slugs = (postList.data.data as Array<{ slug: string }>).map(p => p.slug);
    expect(slugs).toContain(`${PREFIX.toLowerCase()}approve-${ts}`);
    expect(slugs).not.toContain(`${PREFIX.toLowerCase()}reject-${ts}`);
  });

  test('rejects unauthenticated mutations (401)', async ({ unauthApi }) => {
    const cases = [
      { method: 'get' as const, url: '/api/portal/approvals', body: undefined },
      { method: 'get' as const, url: '/api/portal/approvals/1', body: undefined },
      { method: 'post' as const, url: '/api/portal/approvals/1/approve', body: {} },
      { method: 'post' as const, url: '/api/portal/approvals/1/reject', body: {} },
      { method: 'post' as const, url: '/api/portal/approvals/bulk-approve', body: { ids: [1] } },
      { method: 'post' as const, url: '/api/portal/approvals/bulk-reject', body: { ids: [1] } },
    ];

    for (const c of cases) {
      const res = c.method === 'get'
        ? await unauthApi.get(c.url)
        : await unauthApi.post(c.url, c.body);
      expect(res.status, `expected 401 for ${c.method.toUpperCase()} ${c.url}`).toBe(401);
    }
  });

  test('bulk routes reject empty + oversized batches with 400', async ({ clientApi }) => {
    const empty = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: [] });
    expect(empty.status).toBe(400);

    const oversized = await clientApi.post('/api/portal/approvals/bulk-approve', {
      ids: Array.from({ length: 26 }, (_, i) => i + 1),
    });
    expect(oversized.status).toBe(400);

    const emptyRej = await clientApi.post('/api/portal/approvals/bulk-reject', { ids: [] });
    expect(emptyRej.status).toBe(400);
  });
});
