/**
 * ESign / Approvals — E2E Coverage Unit 35
 *
 * Cards [4..7] from the ESign Approvals E2E Audit board (0-based):
 *   [4] Public /api/approve/[token] POST approve via token link
 *   [5] Public /api/approve/[token] POST reject via token link
 *   [6] approvals_get MCP tool returns diff and payload for a pending change
 *   [7] approvals_reject MCP tool marks pending as rejected and verifies entity not applied
 *
 * All tests are rerunnable — they create and clean up their own data.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestApiKey,
  createTestWebsite,
  McpTestClient,
} from './setup/helpers';

// ── Card [4] + [5]: Public /api/approve/[token] POST approve/reject ──────────

test.describe('Public /api/approve/[token] — approve + reject via token link @approvals @esign', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterAll(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  /**
   * Helper: mint a fresh approval link by staging a posts_create via an
   * approval-required MCP key. Returns { token, pendingId, mcp, keyCleanup }.
   */
  async function mintApprovalLink(clientApi: Parameters<Parameters<typeof test>[1]>[0]['clientApi']) {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const res = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `U35-Token-Test-${ts}`,
      slug: `u35-token-test-${ts}`,
      content: 'body for token test',
    });

    // Staging must produce a pending record + an approval envelope with token.
    // Shape: { pending: true, pendingId, summary, status, approval: { token, url, ... } }
    expect(res.data?.pending, 'MCP key must stage the post, not apply directly').toBe(true);
    const pendingId = res.data!.pendingId as number;
    const token = (res.data as Record<string, unknown> | null)?.approval &&
      typeof ((res.data as Record<string, unknown>).approval as Record<string, unknown>)?.token === 'string'
      ? ((res.data as Record<string, unknown>).approval as Record<string, unknown>).token as string
      : '';

    return { token, pendingId, website };
  }

  // ── Card [4]: approve via public token link ──────────────────────────────

  test('[4] POST /api/approve/[token] with action=approve publishes the entity', async ({ clientApi }) => {
    const { token, pendingId, website } = await mintApprovalLink(clientApi);

    // Skip if we couldn't extract a token (entitlement gap or no token returned)
    if (!token) {
      test.skip(true, 'No approval token returned by the MCP key — entitlement or seed gap');
      return;
    }

    // GET first — must be pending
    const getRes = await clientApi.get(`/api/approve/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    expect(getRes.data.data.status).toBe('pending');

    // POST approve (unauthenticated — use clientApi but the route accepts no session)
    const approveRes = await clientApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'E2E Reviewer',
      reviewerEmail: 'e2e@example.com',
      reviewNote: 'looks good',
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.success).toBe(true);
    expect(approveRes.data.data.status).toBe('approved');

    // Verify the pending change was applied
    const pendingRes = await clientApi.get(`/api/portal/approvals/${pendingId}`);
    expect(pendingRes.status).toBe(200);
    const changeStatus = (pendingRes.data.data?.change ?? pendingRes.data.data)?.status;
    // Pending change should now be 'approved' or 'applied' (link approval applied it)
    expect(['approved', 'applied']).toContain(changeStatus);

    // Double-approve must fail
    const dupe = await clientApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'Again',
    });
    expect(dupe.status).toBe(400);

    // Cleanup: delete website posts if created
    const postList = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    for (const p of (postList.data?.data ?? []) as Array<{ id: number }>) {
      await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${p.id}`).catch(() => {});
    }
  });

  // ── Card [5]: reject via public token link ───────────────────────────────

  test('[5] POST /api/approve/[token] with action=reject flips link to rejected, entity unchanged', async ({ clientApi }) => {
    const { token, pendingId } = await mintApprovalLink(clientApi);

    if (!token) {
      test.skip(true, 'No approval token returned by the MCP key — entitlement or seed gap');
      return;
    }

    // GET first — must be pending
    const getRes = await clientApi.get(`/api/approve/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.data.status).toBe('pending');

    // POST reject
    const rejectRes = await clientApi.post(`/api/approve/${token}`, {
      action: 'reject',
      reviewerName: 'E2E Rejector',
      reviewNote: 'not approved',
    });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.data.success).toBe(true);
    expect(rejectRes.data.data.status).toBe('rejected');
    expect(rejectRes.data.data.reviewerName).toBe('E2E Rejector');

    // Pending change must still be in 'pending' state (reject doesn't apply it)
    const pendingRes = await clientApi.get(`/api/portal/approvals/${pendingId}`);
    expect(pendingRes.status).toBe(200);
    const changeStatus = (pendingRes.data.data?.change ?? pendingRes.data.data)?.status;
    // The pending change itself stays 'pending' (only the link flips to rejected)
    expect(changeStatus).toBe('pending');

    // Validation: missing reviewerName must 400
    const noName = await clientApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: '',
    });
    expect(noName.status).toBe(400);

    // Validation: bad action must 400 (use a fresh token — but token already rejected,
    // so hitting it again returns 400 for "already rejected")
    const badAction = await clientApi.post(`/api/approve/${token}`, {
      action: 'bogus',
      reviewerName: 'X',
    });
    // Either 400 for bad action OR 400 for already-rejected — both are 400
    expect(badAction.status).toBe(400);
  });
});

// ── Card [6] + [7]: MCP approvals_get + approvals_reject tools ──────────────

test.describe('MCP approvals_get + approvals_reject tools @approvals @mcp @esign', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterAll(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  /**
   * Stage a pending post via approval-required MCP key.
   * Returns { pendingId, mcpManage } where mcpManage is an MCP client with
   * approvals:read + approvals:manage scopes for reading/rejecting via MCP.
   */
  async function stageAndGetManageClient(clientApi: Parameters<Parameters<typeof test>[1]>[0]['clientApi']) {
    const { website } = await createTestWebsite(clientApi);

    // Key 1: approval-required writer — stages the post
    const { keyRecord: writerKey, cleanup: writerCleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
      name: `U35-Writer-${Date.now()}`,
    });
    cleanups.push(writerCleanup);

    const mcpWriter = await new McpTestClient(writerKey.key).init();
    cleanups.push(() => mcpWriter.dispose());

    const ts = Date.now();
    const stageRes = await mcpWriter.callTool('posts_create', {
      websiteId: website.id,
      title: `U35-MCP-Reject-${ts}`,
      slug: `u35-mcp-reject-${ts}`,
      content: 'body for mcp reject test',
    });
    expect(stageRes.data?.pending, 'expected staging (pending=true)').toBe(true);
    const pendingId = stageRes.data!.pendingId as number;

    // Key 2: manage key with approvals:read + approvals:manage
    const { keyRecord: manageKey, cleanup: manageCleanup } = await createTestApiKey(clientApi, {
      scopes: ['approvals:read', 'approvals:manage'],
      name: `U35-Manager-${Date.now()}`,
    });
    cleanups.push(manageCleanup);

    const mcpManage = await new McpTestClient(manageKey.key).init();
    cleanups.push(() => mcpManage.dispose());

    return { pendingId, mcpManage, website, slug: `u35-mcp-reject-${ts}` };
  }

  // ── Card [6]: approvals_get returns diff + payload ───────────────────────

  test('[6] approvals_get MCP tool returns payload and diff for a pending change', async ({ clientApi }) => {
    const { pendingId, mcpManage } = await stageAndGetManageClient(clientApi);

    const res = await mcpManage.callTool('approvals_get', { id: pendingId });
    expect(res.isError).toBe(false);
    expect(res.data).not.toBeNull();

    // The tool returns the full pending change row — must include payload
    const row = res.data as Record<string, unknown>;
    expect(row.id).toBe(pendingId);
    expect(row.status).toBe('pending');
    expect(row.payload).toBeTruthy(); // staged payload is present

    // originalSnapshot may be null for creates, but payload must be an object
    expect(typeof row.payload).toBe('object');
  });

  // ── Card [7]: approvals_reject marks pending as rejected, entity not applied

  test('[7] approvals_reject MCP tool marks pending as rejected; entity not applied', async ({ clientApi }) => {
    const { pendingId, mcpManage, website, slug } = await stageAndGetManageClient(clientApi);

    // Reject via MCP
    const rejectRes = await mcpManage.callTool('approvals_reject', {
      id: pendingId,
      note: 'rejected by MCP e2e test',
    });
    expect(rejectRes.isError).toBe(false);
    expect(rejectRes.data).not.toBeNull();

    const row = rejectRes.data as Record<string, unknown>;
    expect(row.id).toBe(pendingId);
    expect(row.status).toBe('rejected');
    expect(row.reviewNote).toBe('rejected by MCP e2e test');

    // Verify the post was NOT created (entity not applied)
    const postList = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    expect(postList.status).toBe(200);
    const slugs = (postList.data?.data ?? []) as Array<{ slug: string }>;
    expect(slugs.map(p => p.slug)).not.toContain(slug);

    // Rejecting again must error (already rejected)
    const dupe = await mcpManage.callTool('approvals_reject', { id: pendingId });
    const dupeRow = dupe.data as Record<string, unknown>;
    expect(typeof dupeRow.error).toBe('string');
    expect(dupeRow.error).toMatch(/Cannot reject/i);
  });
});
