/**
 * Security — Bulk Approval UX (project 200) @security
 *
 * Exhaustive coverage of the bulk-approval surface shipped this session:
 *   - GET /api/portal/approvals filters: status / entityType / keyId / since,
 *     plus a cross-tenant leak regression (a pending change belonging to
 *     another client must never appear in this client's list).
 *   - POST /api/portal/approvals/bulk-approve: applies N ids, per-item
 *     applied/failed/skipped results, batch-size cap (25), empty/non-array
 *     rejection, auth gate (401), role gate (403).
 *   - POST /api/portal/approvals/bulk-reject: same shape checks.
 *   - Browser flow: /portal/approvals multi-select + "Approve" moves rows
 *     from Pending to Applied (mirrors the API-level bulk-approve coverage
 *     but drives the actual React page — app/portal/approvals/page.tsx).
 *   - GET /api/cron/approval-digest: cron auth gate + response shape, and
 *     the digest_daily vs instant notification-preference branch (the
 *     deterministic piece — `metadata.digest` on the crm_notifications row
 *     — since real email delivery isn't observable from e2e).
 *
 * Companions: tests/e2e/portal-mcp-approvals.spec.ts (full MCP approval
 * workflow incl. entity coverage + notification integration),
 * tests/e2e/portal-approvals-mutations.spec.ts (@critical golden path),
 * tests/e2e/cron-expire-mcp-pendings.spec.ts (cron auth pattern mirrored
 * below for approval-digest).
 *
 * NOTE on the "browser flow" test: neither companion spec above actually
 * drives a `page` against /portal/approvals — both are pure `clientApi`
 * (API-request) specs. This file's browser test is authored directly from
 * app/portal/approvals/page.tsx (fully read, not guessed): the per-row
 * checkbox only renders when `canManage && isPending`, sits as a sibling of
 * the row's `<button>` inside a `div.hover:bg-accent` row, and the floating
 * bulk-action bar is the only `div.fixed.bottom-6.rounded-full` on the page
 * (the confirmation modal is `div.fixed.inset-0.z-50`; the result toast is
 * `div.fixed.bottom-6.right-6`, no `rounded-full`) — so these selectors are
 * unambiguous without needing `data-testid` (none exist on this page; adding
 * them is a source change out of scope here).
 *
 * Test data uses the SEC200- prefix; all fixtures are torn down via
 * runCleanups in afterEach. Idempotent and rerunnable.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestApiKey,
  createTestWebsite,
  createTestTeamMember,
  McpTestClient,
} from './setup/helpers';
import postgres from 'postgres';
import 'dotenv/config';

const PREFIX = 'SEC200-';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── Raw DB access for scenarios the API/MCP surface cannot produce ─────────
// (a cross-tenant pending-change row, and a notification-preference row for
// a type — 'mcp_pending_change' — that isn't in the portal's own
// NOTIFICATION_TYPES enum so the preferences PUT route 400s on it).
// Mirrors the pattern in gap-approve-token-tenancy-coverage.spec.ts.
let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not set; required for SEC200 raw-SQL setup.');
    }
    sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 5 });
  }
  return sql;
}

test.afterAll(async () => {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
});

interface ApiClientLike {
  get: (path: string) => Promise<{ data: unknown; status: number }>;
}

async function getActiveClientId(api: ApiClientLike): Promise<number> {
  const res = (await api.get('/api/portal/clients')) as { data: { activeClientId: number | null } | null };
  const id = res.data?.activeClientId;
  if (!id) throw new Error('No activeClientId returned for clientApi');
  return id;
}

/** Find any client row that is NOT `selfId` to play the "other tenant". */
async function findOtherClientId(selfId: number): Promise<number | null> {
  const rows = await db()<{ id: number }[]>`
    SELECT id FROM clients WHERE id <> ${selfId} ORDER BY id LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

// ── Filters ──────────────────────────────────────────────────────────────

test.describe('Bulk Approval — approvals list filters @security', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('status filter includes/excludes by resolved status', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staysPending = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}StatusPending-${ts}`, slug: `${PREFIX.toLowerCase()}status-pending-${ts}`, content: 'x',
    });
    const getsApplied = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}StatusApplied-${ts}`, slug: `${PREFIX.toLowerCase()}status-applied-${ts}`, content: 'x',
    });
    const pendingId = staysPending.data.pendingId as number;
    const appliedId = getsApplied.data.pendingId as number;

    const approveRes = await clientApi.post(`/api/portal/approvals/${appliedId}/approve`, {});
    expect(approveRes.status).toBe(200);

    const pendingList = await clientApi.get('/api/portal/approvals?status=pending');
    const pendingIds = (pendingList.data.data as Array<{ id: number }>).map(r => r.id);
    expect(pendingIds).toContain(pendingId);
    expect(pendingIds).not.toContain(appliedId);

    const appliedList = await clientApi.get('/api/portal/approvals?status=applied');
    const appliedIds = (appliedList.data.data as Array<{ id: number }>).map(r => r.id);
    expect(appliedIds).toContain(appliedId);
    expect(appliedIds).not.toContain(pendingId);
  });

  test('entityType filter isolates post vs pitch_deck rows', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const post = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}EntityPost-${ts}`, slug: `${PREFIX.toLowerCase()}entity-post-${ts}`, content: 'x',
    });
    const deck = await mcp.callTool('decks_create', { title: `${PREFIX}EntityDeck-${ts}` });
    const postId = post.data.pendingId as number;
    const deckId = deck.data.pendingId as number;
    expect(post.data.pending).toBe(true);
    expect(deck.data.pending).toBe(true);

    const postList = await clientApi.get('/api/portal/approvals?status=pending&entityType=post');
    const postListIds = (postList.data.data as Array<{ id: number; entityType: string }>);
    expect(postListIds.some(r => r.id === postId)).toBe(true);
    expect(postListIds.some(r => r.id === deckId)).toBe(false);
    expect(postListIds.every(r => r.entityType === 'post')).toBe(true);

    const deckList = await clientApi.get('/api/portal/approvals?status=pending&entityType=pitch_deck');
    const deckListIds = (deckList.data.data as Array<{ id: number; entityType: string }>);
    expect(deckListIds.some(r => r.id === deckId)).toBe(true);
    expect(deckListIds.some(r => r.id === postId)).toBe(false);
    expect(deckListIds.every(r => r.entityType === 'pitch_deck')).toBe(true);
  });

  test('keyId filter isolates changes staged by a specific key', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord: keyA, cleanup: cleanupA } = await createTestApiKey(clientApi, { requireCmsApproval: true, name: `${PREFIX}KeyA` });
    cleanups.push(cleanupA);
    const { keyRecord: keyB, cleanup: cleanupB } = await createTestApiKey(clientApi, { requireCmsApproval: true, name: `${PREFIX}KeyB` });
    cleanups.push(cleanupB);
    const mcpA = await new McpTestClient(keyA.key).init();
    cleanups.push(() => mcpA.dispose());
    const mcpB = await new McpTestClient(keyB.key).init();
    cleanups.push(() => mcpB.dispose());

    const ts = Date.now();
    const fromA = await mcpA.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}FromA-${ts}`, slug: `${PREFIX.toLowerCase()}from-a-${ts}`, content: 'x',
    });
    const fromB = await mcpB.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}FromB-${ts}`, slug: `${PREFIX.toLowerCase()}from-b-${ts}`, content: 'x',
    });
    const idFromA = fromA.data.pendingId as number;
    const idFromB = fromB.data.pendingId as number;

    const listA = await clientApi.get(`/api/portal/approvals?status=pending&keyId=${keyA.id}`);
    const idsA = (listA.data.data as Array<{ id: number; keyId: number }>);
    expect(idsA.some(r => r.id === idFromA)).toBe(true);
    expect(idsA.some(r => r.id === idFromB)).toBe(false);
    expect(idsA.every(r => r.keyId === keyA.id)).toBe(true);
  });

  test('since filter excludes rows created before the cutoff, includes rows after', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}Since-${ts}`, slug: `${PREFIX.toLowerCase()}since-${ts}`, content: 'x',
    });
    const pendingId = staged.data.pendingId as number;

    // Cutoff an hour in the FUTURE excludes the just-created row.
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const excluded = await clientApi.get(`/api/portal/approvals?status=pending&since=${encodeURIComponent(future)}`);
    const excludedIds = (excluded.data.data as Array<{ id: number }>).map(r => r.id);
    expect(excludedIds).not.toContain(pendingId);

    // Cutoff an hour in the PAST includes it.
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const included = await clientApi.get(`/api/portal/approvals?status=pending&since=${encodeURIComponent(past)}`);
    const includedIds = (included.data.data as Array<{ id: number }>).map(r => r.id);
    expect(includedIds).toContain(pendingId);
  });

  test('a pending change belonging to another client never appears in this client\'s list @tenancy', async ({ clientApi }) => {
    const clientA = await getActiveClientId(clientApi);
    const clientB = await findOtherClientId(clientA);
    test.skip(!clientB, 'Need a second client row to simulate cross-tenant access');
    if (!clientB) return;

    const ts = Date.now();
    const secretSummary = `${PREFIX}LeakCheck-${ts}`;
    // The MCP staging path always ties clientId to the caller's own tenant —
    // there's no API surface to produce a divergent row, so insert directly
    // (mirrors gap-approve-token-tenancy-coverage.spec.ts's approach for the
    // same class of "can't be produced through the app" cross-tenant setup).
    const rows = await db()<{ id: number }[]>`
      INSERT INTO mcp_pending_changes (client_id, entity_type, operation, summary, payload, status)
      VALUES (${clientB}, 'post', 'create', ${secretSummary}, ${'{}'}::json, 'pending')
      RETURNING id
    `;
    const leakedId = rows[0].id;
    cleanups.push(async () => { try { await db()`DELETE FROM mcp_pending_changes WHERE id = ${leakedId}`; } catch {} });

    const list = await clientApi.get('/api/portal/approvals?status=pending');
    expect(list.status).toBe(200);
    const summaries = (list.data.data as Array<{ id: number; summary: string | null }>);
    expect(summaries.some(r => r.id === leakedId)).toBe(false);
    expect(summaries.some(r => r.summary === secretSummary)).toBe(false);

    // Same leak check against the unfiltered ("all") view, and against a
    // direct-by-id detail fetch, since a leak could theoretically bypass
    // the list query but not the detail route (or vice versa).
    const allList = await clientApi.get('/api/portal/approvals?status=all');
    const allSummaries = (allList.data.data as Array<{ summary: string | null }>);
    expect(allSummaries.some(r => r.summary === secretSummary)).toBe(false);

    const detail = await clientApi.get(`/api/portal/approvals/${leakedId}`);
    expect(detail.status).not.toBe(200);
  });
});

// ── Batch approve ────────────────────────────────────────────────────────

test.describe('Bulk Approval — bulk-approve @security', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('applies N ids and returns per-item applied results', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const staged = await mcp.callTool('posts_create', {
        websiteId: website.id, title: `${PREFIX}Applies${i}-${ts}`, slug: `${PREFIX.toLowerCase()}applies-${i}-${ts}`, content: 'x',
      });
      expect(staged.data.pending).toBe(true);
      ids.push(staged.data.pendingId as number);
    }

    const bulk = await clientApi.post('/api/portal/approvals/bulk-approve', { ids, note: 'sec200 batch' });
    expect(bulk.status).toBe(200);
    expect(bulk.data.success).toBe(true);
    expect(bulk.data.data.total).toBe(3);
    expect(bulk.data.data.applied).toBe(3);
    expect(bulk.data.data.failed).toBe(0);
    expect(bulk.data.data.skipped).toBe(0);
    expect(bulk.data.data.results).toHaveLength(3);
    for (const id of ids) {
      const r = bulk.data.data.results.find((x: { id: number }) => x.id === id);
      expect(r).toBeTruthy();
      expect(r.status).toBe('applied');
    }
  });

  test('a non-pending id in the batch is reported skipped, others still apply', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const alreadyApplied = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}AlreadyApplied-${ts}`, slug: `${PREFIX.toLowerCase()}already-applied-${ts}`, content: 'x',
    });
    const alreadyId = alreadyApplied.data.pendingId as number;
    const preApprove = await clientApi.post(`/api/portal/approvals/${alreadyId}/approve`, {});
    expect(preApprove.status).toBe(200);

    const stillPending = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}StillPending-${ts}`, slug: `${PREFIX.toLowerCase()}still-pending-${ts}`, content: 'x',
    });
    const pendingId = stillPending.data.pendingId as number;

    const bulk = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: [alreadyId, pendingId] });
    expect(bulk.status).toBe(200);
    expect(bulk.data.data.total).toBe(2);
    expect(bulk.data.data.skipped).toBe(1);
    expect(bulk.data.data.applied).toBe(1);
    const skippedResult = bulk.data.data.results.find((r: { id: number }) => r.id === alreadyId);
    const appliedResult = bulk.data.data.results.find((r: { id: number }) => r.id === pendingId);
    expect(skippedResult.status).toBe('skipped');
    expect(skippedResult.error).toMatch(/status is applied/i);
    expect(appliedResult.status).toBe('applied');
  });

  test('an entity that vanishes before approval is reported failed, alongside a successful item', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord: directKey, cleanup: dc } = await createTestApiKey(clientApi, { requireCmsApproval: false });
    cleanups.push(dc);
    const directMcp = await new McpTestClient(directKey.key).init();
    cleanups.push(() => directMcp.dispose());

    const ts = Date.now();
    const proposal = await directMcp.callTool('proposals_create', { title: `${PREFIX}VanishBeforeApprove-${ts}`, summary: 'x' });
    expect(proposal.data.id).toBeDefined();
    const proposalId = proposal.data.id as number;

    const { keyRecord: approvalKey, cleanup: ac } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(ac);
    const approvalMcp = await new McpTestClient(approvalKey.key).init();
    cleanups.push(() => approvalMcp.dispose());

    const stagedSend = await approvalMcp.callTool('proposals_send', { id: proposalId });
    expect(stagedSend.data.pending).toBe(true);
    const sendPendingId = stagedSend.data.pendingId as number;

    const stagedPost = await approvalMcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}MixedBatchOk-${ts}`, slug: `${PREFIX.toLowerCase()}mixed-batch-ok-${ts}`, content: 'x',
    });
    expect(stagedPost.data.pending).toBe(true);
    const postPendingId = stagedPost.data.pendingId as number;

    // Delete the proposal out from under the staged send — apply must fail.
    const delRes = await clientApi.delete(`/api/portal/crm/proposals/${proposalId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);

    const bulk = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: [sendPendingId, postPendingId] });
    expect(bulk.status).toBe(200);
    expect(bulk.data.data.total).toBe(2);
    expect(bulk.data.data.applied).toBe(1);
    expect(bulk.data.data.failed).toBe(1);
    const sendResult = bulk.data.data.results.find((r: { id: number }) => r.id === sendPendingId);
    const postResult = bulk.data.data.results.find((r: { id: number }) => r.id === postPendingId);
    expect(sendResult.status).toBe('failed');
    expect(sendResult.error).toMatch(/not found/i);
    expect(postResult.status).toBe('applied');

    // The pending row itself flips to 'failed' with the error persisted.
    const detail = await clientApi.get(`/api/portal/approvals/${sendPendingId}`);
    expect(detail.data.data.change.status).toBe('failed');
    expect(detail.data.data.change.errorMessage).toMatch(/not found/i);
  });

  test('batch size over 25 returns 400', async ({ clientApi }) => {
    const fakeIds = Array.from({ length: 26 }, (_, i) => i + 1);
    const res = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: fakeIds });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/25/);
  });

  test('empty ids array returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: [] });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('non-array ids returns 400', async ({ clientApi }) => {
    const resString = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: 'not-an-array' as unknown as number[] });
    expect(resString.status).toBe(400);

    const resMissing = await clientApi.post('/api/portal/approvals/bulk-approve', {});
    expect(resMissing.status).toBe(400);
  });

  test('unauthenticated request returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/approvals/bulk-approve', { ids: [1] });
    expect(res.status).toBe(401);
  });

  test('member (non-admin) role returns 403', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi); // defaults to 'member'
    cleanups.push(member.cleanup);

    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}MemberForbidden-${ts}`, slug: `${PREFIX.toLowerCase()}member-forbidden-${ts}`, content: 'x',
    });
    const pendingId = staged.data.pendingId as number;

    const res = await member.memberApi.post('/api/portal/approvals/bulk-approve', { ids: [pendingId] });
    expect(res.status).toBe(403);

    // Confirm the member's forbidden attempt did NOT sneak the change through.
    const detail = await clientApi.get(`/api/portal/approvals/${pendingId}`);
    expect(detail.data.data.change.status).toBe('pending');
  });
});

// ── Batch reject ─────────────────────────────────────────────────────────

test.describe('Bulk Approval — bulk-reject @security', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('rejects multiple pendings, none applied', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const ids: number[] = [];
    const slugs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const slug = `${PREFIX.toLowerCase()}reject-batch-${i}-${ts}`;
      slugs.push(slug);
      const staged = await mcp.callTool('posts_create', {
        websiteId: website.id, title: `${PREFIX}RejectBatch${i}-${ts}`, slug, content: 'x',
      });
      ids.push(staged.data.pendingId as number);
    }

    const bulk = await clientApi.post('/api/portal/approvals/bulk-reject', { ids, note: 'sec200 reject' });
    expect(bulk.status).toBe(200);
    expect(bulk.data.data.total).toBe(2);
    expect(bulk.data.data.rejected).toBe(2);
    bulk.data.data.results.forEach((r: { status: string }) => expect(r.status).toBe('rejected'));

    const postList = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    const createdSlugs = (postList.data.data as Array<{ slug: string }>).map(p => p.slug);
    for (const slug of slugs) {
      expect(createdSlugs).not.toContain(slug);
    }
  });

  test('a non-pending id is reported skipped', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}RejectSkip-${ts}`, slug: `${PREFIX.toLowerCase()}reject-skip-${ts}`, content: 'x',
    });
    const pendingId = staged.data.pendingId as number;
    await clientApi.post(`/api/portal/approvals/${pendingId}/reject`, {});

    const bulk = await clientApi.post('/api/portal/approvals/bulk-reject', { ids: [pendingId] });
    expect(bulk.status).toBe(200);
    expect(bulk.data.data.skipped).toBe(1);
    expect(bulk.data.data.rejected).toBe(0);
    expect(bulk.data.data.results[0].status).toBe('skipped');
  });

  test('batch size over 25 returns 400', async ({ clientApi }) => {
    const fakeIds = Array.from({ length: 26 }, (_, i) => i + 1);
    const res = await clientApi.post('/api/portal/approvals/bulk-reject', { ids: fakeIds });
    expect(res.status).toBe(400);
    expect(res.data.message).toMatch(/25/);
  });

  test('empty ids array returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/approvals/bulk-reject', { ids: [] });
    expect(res.status).toBe(400);
  });

  test('non-array ids returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/approvals/bulk-reject', { ids: 'nope' as unknown as number[] });
    expect(res.status).toBe(400);
  });

  test('unauthenticated request returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/approvals/bulk-reject', { ids: [1] });
    expect(res.status).toBe(401);
  });

  test('member (non-admin) role returns 403', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi);
    cleanups.push(member.cleanup);

    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id, title: `${PREFIX}RejectMemberForbidden-${ts}`, slug: `${PREFIX.toLowerCase()}reject-member-forbidden-${ts}`, content: 'x',
    });
    const pendingId = staged.data.pendingId as number;

    const res = await member.memberApi.post('/api/portal/approvals/bulk-reject', { ids: [pendingId] });
    expect(res.status).toBe(403);

    const detail = await clientApi.get(`/api/portal/approvals/${pendingId}`);
    expect(detail.data.data.change.status).toBe('pending');
  });
});

// ── Browser flow: /portal/approvals multi-select + Approve ────────────────

test.describe('Bulk Approval — browser flow @security @ui', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('multi-select two pending rows, Approve applies both', async ({ page, clientApi, loginAsOtherClient }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const titles: string[] = [];
    for (let i = 0; i < 2; i++) {
      const title = `${PREFIX}Browser${i}-${ts}`;
      titles.push(title);
      const staged = await mcp.callTool('posts_create', {
        websiteId: website.id, title, slug: `${PREFIX.toLowerCase()}browser-${i}-${ts}`, content: 'browser bulk',
      });
      expect(staged.data.pending).toBe(true);
      // Summary is guaranteed to contain the title (see portal-mcp-approvals
      // .spec.ts: "expect(staged.data.summary).toContain(title)").
    }

    // loginAsOtherClient authenticates the SAME client@example.com tenant
    // that `clientApi` is scoped to (see setup/fixtures.ts) — the seeded
    // client user is 'owner', so canManage is true and the per-row
    // checkboxes + bulk bar render.
    await loginAsOtherClient(page);
    await page.goto('/portal/approvals');
    await page.waitForLoadState('networkidle');

    // Filter defaults to 'Pending' on mount — no tab click needed.
    for (const title of titles) {
      const summary = page.locator('p.line-clamp-2', { hasText: title }).first();
      await expect(summary).toBeVisible({ timeout: 15_000 });
      // Checkbox is a sibling of the row's <button>, inside the row's outer
      // flex div (`hover:bg-accent`) — walk up to that row, then down to
      // its checkbox. The checkbox's own onClick stops propagation, so
      // checking it does not open the detail pane (which would otherwise
      // render an unrelated "Approve & Apply" button).
      const row = summary.locator('xpath=ancestor::div[contains(@class,"hover:bg-accent")][1]');
      const checkbox = row.locator('input[type="checkbox"]');
      await checkbox.check();
      await expect(checkbox).toBeChecked();
    }

    // The floating bulk-action bar is the only `.fixed.bottom-6.rounded-full`
    // element on the page (bulk-result toast is `.fixed.bottom-6.right-6`,
    // no rounded-full; the confirm modal is `.fixed.inset-0.z-50`).
    const bulkBar = page.locator('div.fixed.bottom-6.rounded-full');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar).toContainText('2 selected');
    await bulkBar.locator('button', { hasText: 'Approve' }).click();

    const modal = page.locator('div.fixed.inset-0.z-50');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Approve 2 changes');

    const [bulkResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/portal/approvals/bulk-approve')),
      modal.locator('button', { hasText: /confirm approve/i }).click(),
    ]);
    expect(bulkResponse.status()).toBe(200);
    const bulkBody = await bulkResponse.json();
    expect(bulkBody.success).toBe(true);
    expect(bulkBody.data.applied).toBe(2);

    await page.waitForLoadState('networkidle');

    // Both rows have left the Pending list.
    for (const title of titles) {
      await expect(page.locator('p.line-clamp-2', { hasText: title })).toHaveCount(0);
    }

    // Switching to the Applied tab surfaces both.
    const tabs = page.locator('div.border-b.border-border button');
    await tabs.filter({ hasText: 'Applied' }).click();
    await page.waitForLoadState('networkidle');
    for (const title of titles) {
      await expect(page.locator('p.line-clamp-2', { hasText: title }).first()).toBeVisible({ timeout: 15_000 });
    }
  });
});

// ── Digest cron ─────────────────────────────────────────────────────────

test.describe('Bulk Approval — approval-digest cron @security @cron', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('rejects unauthenticated / bogus-bearer requests', async ({ unauthApi, request }) => {
    const noAuth = await unauthApi.get('/api/cron/approval-digest');
    expect(noAuth.status).toBe(401);

    const bogusBearer = await request.get(`${BASE_URL}/api/cron/approval-digest`, {
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    expect(bogusBearer.status()).toBe(401);
  });

  test('accepts the Vercel cron header and returns the summary shape', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cron/approval-digest`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.usersNotified).toBe('number');
    expect(typeof body.data.notificationsDigested).toBe('number');
  });

  test('digest_daily-preference recipient is batched (metadata.digest=true); instant recipient is not, and the cron reports them', async ({ clientApi, request }) => {
    // 1. Owner mints a wildcard-scope key to promote a fresh member to admin
    //    (only owner/admin qualify as approvers — see notifyApprovers).
    const { keyRecord: ownerKey, cleanup: ownerKeyCleanup } = await createTestApiKey(clientApi, { scopes: ['*'] });
    cleanups.push(ownerKeyCleanup);

    const digestAdmin = await createTestTeamMember(clientApi, { role: 'admin', mcpKey: ownerKey.key });
    cleanups.push(digestAdmin.cleanup);
    const instantAdmin = await createTestTeamMember(clientApi, { role: 'admin', mcpKey: ownerKey.key });
    cleanups.push(instantAdmin.cleanup);

    const clientId = await getActiveClientId(clientApi);

    // 2. Set the digest admin's 'mcp_pending_change' preference to
    //    digest_daily via raw SQL — 'mcp_pending_change' isn't a member of
    //    the portal's own NOTIFICATION_TYPES enum (lib/db/schema/crm.ts), so
    //    PUT /api/portal/notifications/preferences 400s on it; the column
    //    itself is an unconstrained varchar(64), so the row is legal.
    //    (instantAdmin gets no row at all — shouldDeliverNotification
    //    treats "no row" as 'instant', which is exactly the contrast case.)
    await db()`
      INSERT INTO notification_preferences (client_id, user_id, notification_type, delivery)
      VALUES (${clientId}, ${digestAdmin.userId}, 'mcp_pending_change', 'digest_daily')
      ON CONFLICT (client_id, user_id, notification_type)
      DO UPDATE SET delivery = 'digest_daily'
    `;
    cleanups.push(async () => {
      try {
        await db()`DELETE FROM notification_preferences WHERE client_id = ${clientId} AND user_id = ${digestAdmin.userId} AND notification_type = 'mcp_pending_change'`;
      } catch { /* best effort */ }
    });

    // 3. Owner (submitter) stages a change via a separate approval-required
    //    key. notifyApprovers excludes the submitter, so both admins — who
    //    are neither the submitter nor 'member' role — are notified.
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord: stageKey, cleanup: stageKeyCleanup } = await createTestApiKey(clientApi, { requireCmsApproval: true });
    cleanups.push(stageKeyCleanup);
    const mcp = await new McpTestClient(stageKey.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const title = `${PREFIX}DigestPref-${ts}`;
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id, title, slug: `${PREFIX.toLowerCase()}digest-pref-${ts}`, content: 'x',
    });
    const pendingId = staged.data.pendingId as number;
    expect(pendingId).toBeDefined();

    // notifyApprovers is fire-and-forget from the staging call.
    await new Promise(r => setTimeout(r, 1500));

    // 4. Deterministic piece #1: the digest admin's own notification row is
    //    marked digest=true; the instant admin's is not.
    const digestNotifs = await digestAdmin.memberApi.get('/api/portal/crm/notifications');
    expect(digestNotifs.status).toBe(200);
    const digestMatch = (digestNotifs.data.data as Array<{ type: string; entityId: number | null; metadata: { digest?: boolean } | null }>)
      .find(n => n.type === 'mcp_pending_change' && n.entityId === pendingId);
    expect(digestMatch).toBeTruthy();
    expect(digestMatch!.metadata?.digest).toBe(true);

    const instantNotifs = await instantAdmin.memberApi.get('/api/portal/crm/notifications');
    expect(instantNotifs.status).toBe(200);
    const instantMatch = (instantNotifs.data.data as Array<{ type: string; entityId: number | null; metadata: { digest?: boolean } | null }>)
      .find(n => n.type === 'mcp_pending_change' && n.entityId === pendingId);
    expect(instantMatch).toBeTruthy();
    expect(instantMatch!.metadata?.digest).not.toBe(true);

    // 5. Deterministic piece #2: the cron batches the digest-marked row.
    //    RESEND_API_KEY may not be configured in this environment — the
    //    route then no-ops safely (`skipped: 'emails disabled'`) without
    //    touching any rows. Assert the shape unconditionally, and the
    //    positive counts only when email sending is actually wired up.
    const cronRes = await request.get(`${BASE_URL}/api/cron/approval-digest`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(cronRes.status()).toBe(200);
    const cronBody = await cronRes.json();
    expect(cronBody.success).toBe(true);
    expect(typeof cronBody.data.usersNotified).toBe('number');
    expect(typeof cronBody.data.notificationsDigested).toBe('number');

    if (cronBody.data.skipped) {
      expect(cronBody.data.usersNotified).toBe(0);
      expect(cronBody.data.notificationsDigested).toBe(0);
    } else {
      expect(cronBody.data.usersNotified).toBeGreaterThanOrEqual(1);
      expect(cronBody.data.notificationsDigested).toBeGreaterThanOrEqual(1);

      // The digested row is now stamped so a second run excludes it.
      const digestNotifsAfter = await digestAdmin.memberApi.get('/api/portal/crm/notifications');
      const afterMatch = (digestNotifsAfter.data.data as Array<{ type: string; entityId: number | null; metadata: { digestedAt?: string } | null }>)
        .find(n => n.type === 'mcp_pending_change' && n.entityId === pendingId);
      expect(afterMatch?.metadata?.digestedAt).toBeTruthy();
    }
  });
});
