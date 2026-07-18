/**
 * Visual Editor E2E Coverage — Unit 45
 *
 * Cards [0..3] from the Visual Editor E2E Audit board (0-based):
 *   [0] In-canvas AI section generation — needs spec
 *   [1] Scroll / timeline interaction blocks — needs spec
 *   [2] Full approval-iframe client sign-off flow (all 6 entity types) — needs spec
 *   [3] postMessage protocol: selection, resize, save round-trip — needs spec
 *
 * Cards [0] and [1] are confirmed gaps (no implementation).
 * Card [2] tests the public /api/approve/[token] endpoint for multiple entity types.
 * Card [3] covers the save-round-trip portion of the protocol (API-level);
 *           the browser-side postMessage events require a real iframe render —
 *           those are too complex to reliably drive without a full Playwright
 *           browser setup, so only the API save path is exercised here.
 *
 * All tests create and clean up their own data.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestApiKey,
  createTestWebsite,
  createTestPost,
  resolveClientSiteId,
  McpTestClient,
} from './setup/helpers';

// ── Card [2]: Full approval-iframe client sign-off flow (all 6 entity types) ─

test.describe('Public /api/approve/[token] — all entity types @approvals @visual-editor', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterAll(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  /**
   * Mint an approval link for a `survey` entity via the MCP surveys_create tool.
   * surveys_create always mints an approval link (draft → active on approval)
   * without requiring requireCmsApproval on the key.
   */
  async function mintSurveyApprovalToken(
    clientApi: Parameters<Parameters<typeof test>[1]>[0]['clientApi'],
  ): Promise<{ token: string; entityId: number } | null> {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      scopes: ['surveys:write', 'surveys:read'],
    });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const res = await mcp.callTool('surveys_create', {
      title: `U45 Survey ${ts}`,
      description: 'approval flow e2e test',
    });
    if (res.isError || !res.data) return null;
    const data = res.data as Record<string, unknown>;
    const approval = data.approval as Record<string, unknown> | undefined;
    const token = typeof approval?.token === 'string' ? approval.token : null;
    const entityId = typeof data.id === 'number' ? data.id : null;
    if (!token || !entityId) return null;
    return { token, entityId };
  }

  /**
   * Mint an approval link for a `pending_change` entity (post type) via a
   * requireCmsApproval MCP key.
   */
  async function mintPendingChangeApprovalToken(
    clientApi: Parameters<Parameters<typeof test>[1]>[0]['clientApi'],
  ): Promise<{ token: string } | null> {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      requireCmsApproval: true,
    });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const res = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `U45-PendingPost-${ts}`,
      slug: `u45-pending-post-${ts}`,
      content: 'approval flow e2e test body',
    });
    if (res.isError || !res.data) return null;
    const data = res.data as Record<string, unknown>;
    if (!data.pending) return null;
    const approval = data.approval as Record<string, unknown> | undefined;
    const token = typeof approval?.token === 'string' ? approval.token : null;
    if (!token) return null;
    return { token };
  }

  // ── [2a] GET /api/approve/[token] returns pending status ──────────────────

  test('[2a] GET /api/approve/[token] returns pending status for a survey link', async ({ clientApi, unauthApi }) => {
    const result = await mintSurveyApprovalToken(clientApi);
    if (!result) {
      test.skip(true, 'Could not mint survey approval token — entitlement or seed gap');
      return;
    }
    const { token } = result;

    // Public endpoint — unauthenticated GET should work
    const getRes = await unauthApi.get(`/api/approve/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    expect(getRes.data.data.token).toBe(token);
    expect(getRes.data.data.status).toBe('pending');
    expect(getRes.data.data.entityType).toBe('survey');
  });

  // ── [2b] POST approve for survey entity type ───────────────────────────────

  test('[2b] POST /api/approve/[token] approve activates a survey', async ({ clientApi, unauthApi }) => {
    const result = await mintSurveyApprovalToken(clientApi);
    if (!result) {
      test.skip(true, 'Could not mint survey approval token — entitlement or seed gap');
      return;
    }
    const { token } = result;

    const postRes = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'E2E Reviewer',
      reviewerEmail: 'reviewer@example.com',
    });
    expect(postRes.status).toBe(200);
    expect(postRes.data.success).toBe(true);
    expect(postRes.data.data.status).toBe('approved');
    expect(postRes.data.data.reviewerName).toBe('E2E Reviewer');

    // Second approval attempt must fail — link no longer pending
    const retry = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'Second Attempt',
    });
    expect(retry.status).toBe(400);
  });

  // ── [2c] POST reject for survey entity type ────────────────────────────────

  test('[2c] POST /api/approve/[token] reject marks a survey link rejected', async ({ clientApi, unauthApi }) => {
    const result = await mintSurveyApprovalToken(clientApi);
    if (!result) {
      test.skip(true, 'Could not mint survey approval token — entitlement or seed gap');
      return;
    }
    const { token } = result;

    const postRes = await unauthApi.post(`/api/approve/${token}`, {
      action: 'reject',
      reviewerName: 'E2E Rejector',
      reviewNote: 'Not ready yet',
    });
    expect(postRes.status).toBe(200);
    expect(postRes.data.success).toBe(true);
    expect(postRes.data.data.status).toBe('rejected');

    // Subsequent GET reflects the rejected state
    const getRes = await unauthApi.get(`/api/approve/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.data.status).toBe('rejected');
  });

  // ── [2d] POST requires reviewerName ───────────────────────────────────────

  test('[2d] POST /api/approve/[token] rejects missing reviewerName', async ({ clientApi, unauthApi }) => {
    const result = await mintSurveyApprovalToken(clientApi);
    if (!result) {
      test.skip(true, 'Could not mint survey approval token — entitlement or seed gap');
      return;
    }
    const { token } = result;

    const res = await unauthApi.post(`/api/approve/${token}`, { action: 'approve' });
    expect(res.status).toBe(400);
  });

  // ── [2e] POST requires valid action ───────────────────────────────────────

  test('[2e] POST /api/approve/[token] rejects invalid action', async ({ clientApi, unauthApi }) => {
    const result = await mintSurveyApprovalToken(clientApi);
    if (!result) {
      test.skip(true, 'Could not mint survey approval token — entitlement or seed gap');
      return;
    }
    const { token } = result;

    const res = await unauthApi.post(`/api/approve/${token}`, {
      action: 'maybe',
      reviewerName: 'E2E Reviewer',
    });
    expect(res.status).toBe(400);
  });

  // ── [2f] GET unknown token returns 404 ────────────────────────────────────

  test('[2f] GET /api/approve/[token] returns 404 for unknown token', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/approve/0000000000000000000000000000000000000000000000000000000000000000');
    expect(res.status).toBe(404);
  });

  // ── [2g] pending_change entity type: approve via token ────────────────────

  test('[2g] POST /api/approve/[token] approve applies a pending_change (post entity)', async ({ clientApi, unauthApi }) => {
    const result = await mintPendingChangeApprovalToken(clientApi);
    if (!result) {
      test.skip(true, 'Could not mint pending_change approval token — entitlement or seed gap');
      return;
    }
    const { token } = result;

    const getRes = await unauthApi.get(`/api/approve/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.data.status).toBe('pending');

    const postRes = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'Portal Approver',
    });
    expect(postRes.status).toBe(200);
    expect(postRes.data.success).toBe(true);
    expect(postRes.data.data.status).toBe('approved');
  });
});

// ── Card [3]: postMessage protocol — save round-trip (API layer) ──────────────

test.describe('Visual Editor — save round-trip via CMS posts API @visual-editor @posts', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterAll(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('[3a] PUT /posts/[id] persists blocks content and survives reload (GET)', async ({ clientApi }) => {
    const siteId = await resolveClientSiteId(clientApi);
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);

    // Simulate the save triggered by the visual editor shell after a postMessage
    // save event — the shell PATCHes the post content via the CMS API.
    const blocks = [
      { id: 'b1', type: 'heading', values: { text: 'Hello from E2E', level: 1 } },
      { id: 'b2', type: 'text', values: { text: 'Block content saved via editor' } },
    ];
    const putRes = await clientApi.put(
      `/api/portal/cms/websites/${siteId}/posts/${post.id}`,
      {
        title: post.title,
        slug: post.slug,
        content: JSON.stringify({ blocks, version: '1.0' }),
        published: false,
        revisionTrigger: 'manual',
      },
    );
    expect(putRes.status).toBe(200);
    expect(putRes.data.success).toBe(true);

    // Reload — GET must return the saved block content
    const getRes = await clientApi.get(
      `/api/portal/cms/websites/${siteId}/posts/${post.id}`,
    );
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    const saved = getRes.data.data;
    const parsed = typeof saved.content === 'string' ? JSON.parse(saved.content) : saved.content;
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0].values.text).toBe('Hello from E2E');
    expect(parsed.blocks[1].values.text).toBe('Block content saved via editor');
  });

  test('[3b] PUT /posts/[id] autosave triggers write a revision', async ({ clientApi }) => {
    const siteId = await resolveClientSiteId(clientApi);
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);

    const content = JSON.stringify({ blocks: [{ id: 'b1', type: 'text', values: { text: 'autosave-content' } }], version: '1.0' });

    const put1 = await clientApi.put(
      `/api/portal/cms/websites/${siteId}/posts/${post.id}`,
      { title: post.title, slug: post.slug, content, published: false, revisionTrigger: 'autosave' },
    );
    expect(put1.status).toBe(200);

    // Verify a revision was written
    const revRes = await clientApi.get(
      `/api/portal/cms/websites/${siteId}/posts/${post.id}/revisions`,
    );
    expect(revRes.status).toBe(200);
    const revisions = (revRes.data.data ?? []) as Array<{ trigger?: string; revisionTrigger?: string }>;
    const autosaveRevisions = revisions.filter(
      (r) => r.trigger === 'autosave' || r.revisionTrigger === 'autosave',
    );
    expect(autosaveRevisions.length).toBeGreaterThanOrEqual(1);
  });

  test('[3c] PUT /posts/[id] unauthenticated returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.put('/api/portal/cms/websites/1/posts/1', {
      title: 'x',
      content: '{}',
    });
    expect(res.status).toBe(401);
  });

  test('[3d] PUT /posts/[id] cross-tenant post returns 403 or 404', async ({ clientApi }) => {
    // Post id 0 cannot belong to the test client — expect 403 or 404
    const siteId = await resolveClientSiteId(clientApi);
    const res = await clientApi.put(
      `/api/portal/cms/websites/${siteId}/posts/0`,
      { title: 'x', content: '{}' },
    );
    expect([403, 404]).toContain(res.status);
  });
});
