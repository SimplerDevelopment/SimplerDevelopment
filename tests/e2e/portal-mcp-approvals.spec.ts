/**
 * MCP Approval Workflow E2E Tests
 *
 * Covers staging, approval, rejection, bulk actions, listing, and role gating
 * for MCP writes flagged with require_cms_approval=true.
 *
 * Tests create their own API keys + websites — idempotent and re-runnable.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, createTestTeamMember, createTestWebsite, McpTestClient } from './setup/helpers';

test.describe('MCP approval workflow @mcp @approvals', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('direct-apply key creates posts immediately (no staging)', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const result = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Direct Apply Post ${ts}`,
      slug: `direct-apply-${ts}`,
      content: 'Created directly',
      postType: 'blog',
    });

    expect(result.status).toBe(200);
    expect(result.data).toBeTruthy();
    expect(result.data.pending).toBeFalsy(); // no staging
    expect(result.data.id).toBeDefined();
    expect(result.data.title).toBe(`Direct Apply Post ${ts}`);
  });

  test('approval-required key stages posts_create instead of applying', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const title = `Staged Post ${ts}`;
    const result = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title,
      slug: `staged-${ts}`,
      content: 'Needs approval',
    });

    expect(result.status).toBe(200);
    expect(result.data.pending).toBe(true);
    expect(typeof result.data.pendingId).toBe('number');
    expect(result.data.summary).toContain(title);
    expect(result.data.status).toBe('pending');
  });

  test('GET /api/portal/approvals lists pending changes with meta.canManage', async ({ clientApi }) => {
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
      title: `List-Test ${ts}`,
      slug: `list-test-${ts}`,
      content: 'x',
    });
    expect(staged.data.pending).toBe(true);

    const list = await clientApi.get('/api/portal/approvals?status=pending');
    expect(list.status).toBe(200);
    expect(list.data.success).toBe(true);
    expect(Array.isArray(list.data.data)).toBe(true);
    expect(list.data.meta).toBeDefined();
    expect(list.data.meta.canManage).toBe(true); // client is owner
    expect(list.data.meta.role).toBe('owner');

    const found = list.data.data.find((r: { id: number }) => r.id === staged.data.pendingId);
    expect(found).toBeTruthy();
    expect(found.entityType).toBe('post');
    expect(found.operation).toBe('create');
    expect(found.status).toBe('pending');
  });

  test('GET /api/portal/approvals?count=true returns integer count', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/approvals?count=true');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.data.count).toBe('number');
    expect(res.data.data.count).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/portal/approvals/:id returns payload + snapshot detail', async ({ clientApi }) => {
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
      title: `Detail Test ${ts}`,
      slug: `detail-${ts}`,
      content: 'detail body',
    });
    expect(staged.data.pending).toBe(true);

    const detail = await clientApi.get(`/api/portal/approvals/${staged.data.pendingId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.success).toBe(true);
    expect(detail.data.data.change).toBeDefined();
    expect(detail.data.data.change.id).toBe(staged.data.pendingId);
    expect(detail.data.data.change.payload).toBeDefined();
    expect((detail.data.data.change.payload as { title: string }).title).toBe(`Detail Test ${ts}`);
    // Create op → originalSnapshot null
    expect(detail.data.data.change.originalSnapshot).toBeNull();
  });

  test('POST /api/portal/approvals/:id/approve applies the staged mutation', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const title = `Approve-Applied ${ts}`;
    const slug = `approve-applied-${ts}`;
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title,
      slug,
      content: 'original',
    });
    const pendingId = staged.data.pendingId;

    const approveRes = await clientApi.post(`/api/portal/approvals/${pendingId}/approve`, {
      note: 'looks fine',
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.success).toBe(true);
    expect(approveRes.data.data.change.status).toBe('applied');
    expect(approveRes.data.data.change.reviewNote).toBe('looks fine');
    expect(approveRes.data.data.result).toBeDefined();

    // Post should now actually exist on the website
    const listRes = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    expect(listRes.data.success).toBe(true);
    const createdPost = listRes.data.data.find((p: { slug: string }) => p.slug === slug);
    expect(createdPost).toBeTruthy();
    expect(createdPost.title).toBe(title);
  });

  test('POST /api/portal/approvals/:id/reject marks rejected and does NOT apply', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const slug = `rejected-${ts}`;
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Rejected Post ${ts}`,
      slug,
      content: 'should not appear',
    });
    const pendingId = staged.data.pendingId;

    const rejectRes = await clientApi.post(`/api/portal/approvals/${pendingId}/reject`, {
      note: 'not needed',
    });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.data.success).toBe(true);
    expect(rejectRes.data.data.status).toBe('rejected');
    expect(rejectRes.data.data.reviewNote).toBe('not needed');

    // Post should NOT exist
    const listRes = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    const rejectedPost = listRes.data.data.find((p: { slug: string }) => p.slug === slug);
    expect(rejectedPost).toBeUndefined();
  });

  test('approve refuses if already applied', async ({ clientApi }) => {
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
      title: `Double-Approve ${ts}`,
      slug: `double-approve-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;

    const first = await clientApi.post(`/api/portal/approvals/${pendingId}/approve`, {});
    expect(first.status).toBe(200);

    const second = await clientApi.post(`/api/portal/approvals/${pendingId}/approve`, {});
    expect(second.status).toBe(400);
    expect(second.data.success).toBe(false);
    expect(second.data.message).toMatch(/status is applied/);
  });

  test('reject refuses if already applied', async ({ clientApi }) => {
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
      title: `Reject-After-Apply ${ts}`,
      slug: `reject-after-apply-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;

    await clientApi.post(`/api/portal/approvals/${pendingId}/approve`, {});
    const rejectRes = await clientApi.post(`/api/portal/approvals/${pendingId}/reject`, {});
    expect(rejectRes.status).toBe(400);
    expect(rejectRes.data.message).toMatch(/status is applied/);
  });

  test('unauthenticated requests get 401 on list/get/approve/reject', async ({ unauthApi }) => {
    const list = await unauthApi.get('/api/portal/approvals');
    expect(list.status).toBe(401);

    const get = await unauthApi.get('/api/portal/approvals/1');
    expect(get.status).toBe(401);

    const approve = await unauthApi.post('/api/portal/approvals/1/approve', {});
    expect(approve.status).toBe(401);

    const reject = await unauthApi.post('/api/portal/approvals/1/reject', {});
    expect(reject.status).toBe(401);
  });
});

test.describe('MCP approval — bulk actions @mcp @approvals @bulk', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('bulk-approve applies multiple and returns per-item results', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const pendingIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const staged = await mcp.callTool('posts_create', {
        websiteId: website.id,
        title: `Bulk Approve ${ts}-${i}`,
        slug: `bulk-approve-${ts}-${i}`,
        content: 'bulk',
      });
      expect(staged.data.pending).toBe(true);
      pendingIds.push(staged.data.pendingId);
    }

    const bulk = await clientApi.post('/api/portal/approvals/bulk-approve', {
      ids: pendingIds,
      note: 'batch ok',
    });
    expect(bulk.status).toBe(200);
    expect(bulk.data.success).toBe(true);
    expect(bulk.data.data.total).toBe(3);
    expect(bulk.data.data.applied).toBe(3);
    expect(bulk.data.data.failed).toBe(0);
    expect(bulk.data.data.results).toHaveLength(3);
    bulk.data.data.results.forEach((r: { status: string }) => expect(r.status).toBe('applied'));
  });

  test('bulk-approve caps batch at 25', async ({ clientApi }) => {
    const fakeIds = Array.from({ length: 26 }, (_, i) => i + 1);
    const res = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: fakeIds });
    expect(res.status).toBe(400);
    expect(res.data.message).toMatch(/25/);
  });

  test('bulk-reject rejects multiple pendings at once', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const pendingIds: number[] = [];
    for (let i = 0; i < 2; i++) {
      const staged = await mcp.callTool('posts_create', {
        websiteId: website.id,
        title: `Bulk Reject ${ts}-${i}`,
        slug: `bulk-reject-${ts}-${i}`,
        content: 'x',
      });
      pendingIds.push(staged.data.pendingId);
    }

    const bulk = await clientApi.post('/api/portal/approvals/bulk-reject', {
      ids: pendingIds,
      note: 'all wrong',
    });
    expect(bulk.status).toBe(200);
    expect(bulk.data.data.total).toBe(2);
    expect(bulk.data.data.rejected).toBe(2);

    // Verify none were applied — posts should not exist
    const listRes = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    const matches = listRes.data.data.filter((p: { slug: string }) => p.slug.startsWith(`bulk-reject-${ts}`));
    expect(matches).toHaveLength(0);
  });

  test('bulk-approve skips already-applied items with status=skipped', async ({ clientApi }) => {
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
      title: `Skip Test ${ts}`,
      slug: `skip-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;

    await clientApi.post(`/api/portal/approvals/${pendingId}/approve`, {});

    const bulk = await clientApi.post('/api/portal/approvals/bulk-approve', {
      ids: [pendingId],
    });
    expect(bulk.status).toBe(200);
    expect(bulk.data.data.skipped).toBe(1);
    expect(bulk.data.data.results[0].status).toBe('skipped');
  });

  test('bulk routes reject empty ids', async ({ clientApi }) => {
    const approveRes = await clientApi.post('/api/portal/approvals/bulk-approve', { ids: [] });
    expect(approveRes.status).toBe(400);

    const rejectRes = await clientApi.post('/api/portal/approvals/bulk-reject', { ids: [] });
    expect(rejectRes.status).toBe(400);
  });

  test('bulk routes require auth', async ({ unauthApi }) => {
    const approveRes = await unauthApi.post('/api/portal/approvals/bulk-approve', { ids: [1] });
    expect(approveRes.status).toBe(401);

    const rejectRes = await unauthApi.post('/api/portal/approvals/bulk-reject', { ids: [1] });
    expect(rejectRes.status).toBe(401);
  });
});

test.describe('MCP approval — update & send operations @mcp @approvals', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('posts_update with originalSnapshot preserves prior state', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);

    // Direct-apply key creates a post first
    const { keyRecord: directKey, cleanup: directCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: false,
    });
    cleanups.push(directCleanup);
    const directMcp = await new McpTestClient(directKey.key).init();
    cleanups.push(() => directMcp.dispose());

    const ts = Date.now();
    const created = await directMcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Original Title ${ts}`,
      slug: `original-${ts}`,
      content: 'original content',
    });
    expect(created.data.id).toBeDefined();
    const postId = created.data.id;

    // Approval-required key updates it
    const { keyRecord: approvalKey, cleanup: approvalCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(approvalCleanup);
    const approvalMcp = await new McpTestClient(approvalKey.key).init();
    cleanups.push(() => approvalMcp.dispose());

    const staged = await approvalMcp.callTool('posts_update', {
      id: postId,
      title: `Updated Title ${ts}`,
    });
    expect(staged.data.pending).toBe(true);

    // Detail should include snapshot capturing old title
    const detail = await clientApi.get(`/api/portal/approvals/${staged.data.pendingId}`);
    const snapshot = detail.data.data.change.originalSnapshot as { title: string };
    expect(snapshot).toBeTruthy();
    expect(snapshot.title).toBe(`Original Title ${ts}`);
  });
});

test.describe('MCP approval — entity coverage @mcp @approvals @entities', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('pitch_deck:create stages and applies correctly', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const title = `Staged Deck ${ts}`;
    const staged = await mcp.callTool('decks_create', {
      title,
      description: 'E2E staged pitch deck',
    });
    expect(staged.data.pending).toBe(true);
    expect(staged.data.summary).toContain(title);

    const approveRes = await clientApi.post(`/api/portal/approvals/${staged.data.pendingId}/approve`, {});
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.data.change.status).toBe('applied');
    expect(approveRes.data.data.result.id).toBeDefined();
    const deckId = approveRes.data.data.result.id;

    // Deck should exist now
    const listRes = await clientApi.get('/api/portal/tools/pitch-decks');
    const found = listRes.data.data.find((d: { id: number }) => d.id === deckId);
    expect(found).toBeTruthy();
    expect(found.title).toBe(title);

    // Clean up the created deck
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/pitch-decks/${deckId}`).catch(() => {});
    });
  });

  test('pitch_deck_slides:add_slide stages and applies', async ({ clientApi }) => {
    // Create deck with a direct-apply key first
    const { keyRecord: directKey, cleanup: dc } = await createTestApiKey(clientApi, {
      requireCmsApproval: false,
    });
    cleanups.push(dc);
    const directMcp = await new McpTestClient(directKey.key).init();
    cleanups.push(() => directMcp.dispose());

    const ts = Date.now();
    const deck = await directMcp.callTool('decks_create', { title: `Slide Parent ${ts}` });
    const deckId = deck.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/pitch-decks/${deckId}`).catch(() => {});
    });

    // Stage a slide add via approval-required key
    const { keyRecord: approvalKey, cleanup: ac } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(ac);
    const approvalMcp = await new McpTestClient(approvalKey.key).init();
    cleanups.push(() => approvalMcp.dispose());

    const staged = await approvalMcp.callTool('decks_add_slide', {
      deckId,
      label: 'Staged Slide',
      blocks: [{ id: 'b1', type: 'text', order: 0, content: 'hello' }],
    });
    expect(staged.data.pending).toBe(true);

    const approveRes = await clientApi.post(`/api/portal/approvals/${staged.data.pendingId}/approve`, {});
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.data.change.status).toBe('applied');

    // Verify slide attached
    const deckRes = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
    const slides = deckRes.data.data.slides as Array<{ label: string }>;
    expect(slides.some(s => s.label === 'Staged Slide')).toBe(true);
  });

  test('proposal:create stages and applies', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const title = `Staged Proposal ${ts}`;
    const staged = await mcp.callTool('proposals_create', {
      title,
      summary: 'E2E test proposal',
      lineItems: [{ id: 'li1', description: 'Consulting', quantity: 1, unitPrice: 5000 }],
    });
    expect(staged.data.pending).toBe(true);

    const approveRes = await clientApi.post(`/api/portal/approvals/${staged.data.pendingId}/approve`, {});
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.data.change.status).toBe('applied');
    const proposalId = approveRes.data.data.result.id;

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/proposals/${proposalId}`).catch(() => {});
    });

    const listRes = await clientApi.get('/api/portal/crm/proposals');
    const found = listRes.data.data.find((p: { id: number }) => p.id === proposalId);
    expect(found).toBeTruthy();
    expect(found.title).toBe(title);
    expect(found.status).toBe('draft');
  });

  test('proposal:send stages status transition and applies', async ({ clientApi }) => {
    // Create proposal directly first
    const { keyRecord: directKey, cleanup: dc } = await createTestApiKey(clientApi, {
      requireCmsApproval: false,
    });
    cleanups.push(dc);
    const directMcp = await new McpTestClient(directKey.key).init();
    cleanups.push(() => directMcp.dispose());

    const ts = Date.now();
    const created = await directMcp.callTool('proposals_create', {
      title: `Pre-send Proposal ${ts}`,
      summary: 'draft',
    });
    const proposalId = created.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/proposals/${proposalId}`).catch(() => {});
    });

    // Stage send via approval key
    const { keyRecord: approvalKey, cleanup: ac } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(ac);
    const approvalMcp = await new McpTestClient(approvalKey.key).init();
    cleanups.push(() => approvalMcp.dispose());

    const staged = await approvalMcp.callTool('proposals_send', { id: proposalId });
    expect(staged.data.pending).toBe(true);
    expect(staged.data.summary).toContain('Send proposal');

    const approveRes = await clientApi.post(`/api/portal/approvals/${staged.data.pendingId}/approve`, {});
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.data.result.status).toBe('sent');
  });

  test('email_campaign:create stages and applies', async ({ clientApi }) => {
    // Need an email list first
    const listCreate = await clientApi.post('/api/portal/email/lists', {
      name: `Approval List ${Date.now()}`,
      description: 'E2E',
    });
    expect(listCreate.status === 200 || listCreate.status === 201).toBe(true);
    const listId = listCreate.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/lists/${listId}`).catch(() => {});
    });

    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const name = `Staged Campaign ${ts}`;
    const staged = await mcp.callTool('email_campaigns_create', {
      name,
      subject: `Subject ${ts}`,
      listId,
      fromName: 'E2E',
      fromEmail: 'e2e@example.com',
      htmlContent: '<p>hi</p>',
    });
    expect(staged.data.pending).toBe(true);

    const approveRes = await clientApi.post(`/api/portal/approvals/${staged.data.pendingId}/approve`, {});
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.data.change.status).toBe('applied');
    const campaignId = approveRes.data.data.result.id;

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
    });

    const listRes = await clientApi.get('/api/portal/email/campaigns');
    const found = listRes.data.data.find((c: { id: number }) => c.id === campaignId);
    expect(found).toBeTruthy();
    expect(found.status).toBe('draft');
  });
});

test.describe('MCP approval — CRM notification integration @mcp @approvals @notifications', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('admin team member receives mcp_pending_change notification with deep link', async ({ clientApi }) => {
    // 1. Owner creates an MCP key with * scope (needed to promote via team_update_role)
    const { keyRecord: ownerKey, cleanup: ownerKeyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
    });
    cleanups.push(ownerKeyCleanup);

    // 2. Invite a member + promote to admin so they qualify as an approver
    const member = await createTestTeamMember(clientApi, {
      role: 'admin',
      mcpKey: ownerKey.key,
    });
    cleanups.push(member.cleanup);

    // 3. Owner creates a staging key and stages a CMS write
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord: stageKey, cleanup: stageKeyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(stageKeyCleanup);
    const mcp = await new McpTestClient(stageKey.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const title = `Notif Test ${ts}`;
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title,
      slug: `notif-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;
    expect(pendingId).toBeDefined();

    // Notifications fire-and-forget — give Postgres + the fetch chain a moment.
    await new Promise(r => setTimeout(r, 1500));

    // 4. The admin should see the notification on their own notifications feed.
    const notifRes = await member.memberApi.get('/api/portal/crm/notifications');
    expect(notifRes.status).toBe(200);
    expect(notifRes.data.success).toBe(true);
    const all = notifRes.data.data as Array<{
      type: string; entityType: string | null; entityId: number | null; body: string | null; title: string;
    }>;
    const match = all.find(n =>
      n.type === 'mcp_pending_change' &&
      n.entityType === 'mcp_approval' &&
      n.entityId === pendingId,
    );
    expect(match).toBeTruthy();
    expect(match!.title).toMatch(/awaiting approval/i);
    expect(match!.body).toContain(title);
  });

  test('the submitter of a staged change does NOT receive their own notification', async ({ clientApi }) => {
    // Owner stages as themselves → excluded from notifyApprovers
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Self-exclude ${ts}`,
      slug: `self-exclude-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;
    await new Promise(r => setTimeout(r, 1500));

    const notifRes = await clientApi.get('/api/portal/crm/notifications');
    const all = notifRes.data.data as Array<{ type: string; entityId: number | null }>;
    const selfNotif = all.find(n => n.type === 'mcp_pending_change' && n.entityId === pendingId);
    expect(selfNotif).toBeUndefined();
  });

  test('member role (non-admin) does NOT receive mcp_pending_change notifications', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi); // defaults to 'member'
    cleanups.push(member.cleanup);

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
      title: `Member Skip ${ts}`,
      slug: `member-skip-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;
    await new Promise(r => setTimeout(r, 1500));

    const notifRes = await member.memberApi.get('/api/portal/crm/notifications');
    const all = notifRes.data.data as Array<{ type: string; entityId: number | null }>;
    const memberNotif = all.find(n => n.type === 'mcp_pending_change' && n.entityId === pendingId);
    expect(memberNotif).toBeUndefined();
  });

  test('member-role viewer of /api/portal/approvals gets canManage=false and approve returns 403', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi); // 'member' role
    cleanups.push(member.cleanup);

    // Owner stages a change
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
      title: `Role 403 ${ts}`,
      slug: `role-403-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;

    // Member can list but canManage is false
    const listRes = await member.memberApi.get('/api/portal/approvals');
    expect(listRes.status).toBe(200);
    expect(listRes.data.meta.canManage).toBe(false);
    expect(listRes.data.meta.role).toBe('member');

    // Approve should 403
    const approveRes = await member.memberApi.post(`/api/portal/approvals/${pendingId}/approve`, {});
    expect(approveRes.status).toBe(403);

    // Reject should 403 too
    const rejectRes = await member.memberApi.post(`/api/portal/approvals/${pendingId}/reject`, {});
    expect(rejectRes.status).toBe(403);

    // Bulk should 403
    const bulkApproveRes = await member.memberApi.post('/api/portal/approvals/bulk-approve', { ids: [pendingId] });
    expect(bulkApproveRes.status).toBe(403);
  });
});

test.describe('MCP-side approvals_* tools @mcp @approvals', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('approvals_list returns staged changes for the authed client', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);

    const { keyRecord: writerKey, cleanup: wc } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(wc);
    const writerMcp = await new McpTestClient(writerKey.key).init();
    cleanups.push(() => writerMcp.dispose());

    const ts = Date.now();
    const staged = await writerMcp.callTool('posts_create', {
      websiteId: website.id,
      title: `MCP-side list ${ts}`,
      slug: `mcp-list-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;

    // Reader key uses approvals:read scope
    const { keyRecord: readerKey, cleanup: rc } = await createTestApiKey(clientApi, {
      scopes: ['*'],
    });
    cleanups.push(rc);
    const readerMcp = await new McpTestClient(readerKey.key).init();
    cleanups.push(() => readerMcp.dispose());

    const listRes = await readerMcp.callTool('approvals_list', { status: 'pending' });
    expect(Array.isArray(listRes.data)).toBe(true);
    const found = (listRes.data as Array<{ id: number }>).find(r => r.id === pendingId);
    expect(found).toBeTruthy();
  });

  test('approvals_approve via MCP applies the mutation', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);

    const { keyRecord: writerKey, cleanup: wc } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(wc);
    const writerMcp = await new McpTestClient(writerKey.key).init();
    cleanups.push(() => writerMcp.dispose());

    const ts = Date.now();
    const slug = `mcp-approve-${ts}`;
    const staged = await writerMcp.callTool('posts_create', {
      websiteId: website.id,
      title: `MCP Approve ${ts}`,
      slug,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;

    // Admin key with * scope (includes approvals:manage)
    const { keyRecord: adminKey, cleanup: ac } = await createTestApiKey(clientApi, {
      scopes: ['*'],
    });
    cleanups.push(ac);
    const adminMcp = await new McpTestClient(adminKey.key).init();
    cleanups.push(() => adminMcp.dispose());

    const approveRes = await adminMcp.callTool('approvals_approve', {
      id: pendingId,
      note: 'via mcp',
    });
    expect(approveRes.data.change?.status).toBe('applied');
    expect(approveRes.data.result).toBeDefined();

    // Post now exists
    const listRes = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    const found = listRes.data.data.find((p: { slug: string }) => p.slug === slug);
    expect(found).toBeTruthy();
  });

  test('approvals_approve denied without approvals:manage scope', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);

    const { keyRecord: writerKey, cleanup: wc } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(wc);
    const writerMcp = await new McpTestClient(writerKey.key).init();
    cleanups.push(() => writerMcp.dispose());

    const ts = Date.now();
    const staged = await writerMcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Scope Test ${ts}`,
      slug: `scope-${ts}`,
      content: 'x',
    });
    const pendingId = staged.data.pendingId;

    // Limited-scope key: only approvals:read, NOT approvals:manage
    const { keyRecord: limitedKey, cleanup: lc } = await createTestApiKey(clientApi, {
      scopes: ['approvals:read'],
    });
    cleanups.push(lc);
    const limitedMcp = await new McpTestClient(limitedKey.key).init();
    cleanups.push(() => limitedMcp.dispose());

    const res = await limitedMcp.callTool('approvals_approve', { id: pendingId });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('approvals:manage');
  });
});
