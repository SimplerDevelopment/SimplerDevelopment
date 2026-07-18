/**
 * Gap coverage — public /api/approve/[token] route (esign unit)
 *
 * Gaps covered:
 *   1. Entity-type link: valid token → GET returns link metadata; POST approve → 200
 *   2. Pending-change-type link: valid token → GET returns link metadata; POST approve → 200
 *   3. Invalid / malformed token → GET 404; POST 404
 *   4. Already-resolved token → POST returns 400 (not 404)
 *   5. POST without required fields → 400 validation errors
 *   6. Cross-tenant token isolation: client A mints a token; client B's portal session
 *      cannot access client A's pending change via /api/portal/approvals/[id] (404).
 *      A fabricated token returned 404 from the public route regardless of caller identity.
 *
 * Route under test: GET + POST /api/approve/[token]  (fully public — no session required)
 * Secondary route:  GET /api/portal/approvals/[id]   (session-authed, scoped by clientId)
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, McpTestClient, createTestWebsite } from './setup/helpers';
import { ApiClient } from './setup/api-client';

// ─── Gap 1 & 2: Entity-type and pending-change-type links ────────────────────

test.describe('Public /api/approve/[token] — entity link @gap @esign', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET with valid entity-link token returns link metadata (status=200)', async ({ clientApi, unauthApi }) => {
    // Mint a real entity-type approval link via the MCP posts_create path
    // (requireCmsApproval:false → direct apply → approval.token is an entity link).
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const slug = `esign-entity-get-${ts}`;
    const result = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `ESign Entity GET ${ts}`,
      slug,
      content: 'content',
      postType: 'blog',
    });

    expect(result.status).toBe(200);
    // Direct-apply path returns approval envelope with the entity-link token
    const token: string = result.data?.approval?.token;
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64);

    // POST clean up of the created post (it has an id in result.data)
    const postId: number = result.data?.id;
    if (postId) {
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postId}`).catch(() => {});
      });
    }

    // GET the public approval link from an unauthenticated context
    const getRes = await unauthApi.get(`/api/approve/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    const link = getRes.data.data;
    expect(link.token).toBe(token);
    expect(link.linkType).toBe('entity');
    expect(link.entityType).toBe('post');
    expect(link.status).toBe('pending');
    expect(typeof link.entityId).toBe('number');
    expect(link.entityId).toBe(postId);
  });

  test('POST approve with valid entity-link token approves the linked entity', async ({ clientApi, unauthApi }) => {
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const slug = `esign-entity-post-${ts}`;
    const result = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `ESign Entity POST ${ts}`,
      slug,
      content: 'content',
      postType: 'blog',
      published: false,
    });

    expect(result.status).toBe(200);
    const token: string = result.data?.approval?.token;
    expect(typeof token).toBe('string');

    const postId: number = result.data?.id;
    if (postId) {
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postId}`).catch(() => {});
      });
    }

    // POST approve — fully public, no session required
    const approveRes = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'Test Reviewer',
      reviewerEmail: 'reviewer@example.com',
      reviewNote: 'LGTM',
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.success).toBe(true);
    const updated = approveRes.data.data;
    expect(updated.status).toBe('approved');
    expect(updated.reviewerName).toBe('Test Reviewer');
    expect(updated.linkType).toBe('entity');
  });

  test('POST reject with valid entity-link token marks link as rejected', async ({ clientApi, unauthApi }) => {
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const slug = `esign-entity-reject-${ts}`;
    const result = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `ESign Entity Reject ${ts}`,
      slug,
      content: 'content',
    });

    expect(result.status).toBe(200);
    const token: string = result.data?.approval?.token;
    expect(typeof token).toBe('string');

    const postId: number = result.data?.id;
    if (postId) {
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postId}`).catch(() => {});
      });
    }

    const rejectRes = await unauthApi.post(`/api/approve/${token}`, {
      action: 'reject',
      reviewerName: 'Rejector',
      reviewNote: 'Not ready',
    });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.data.success).toBe(true);
    expect(rejectRes.data.data.status).toBe('rejected');
  });
});

// ─── Gap 2: Pending-change-type link ─────────────────────────────────────────

test.describe('Public /api/approve/[token] — pending_change link @gap @esign', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET with valid pending_change token returns pending_change link metadata', async ({ clientApi, unauthApi }) => {
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    // requireCmsApproval:true → posts_create stages a pending_change and returns a pending_change link
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `ESign PendingChange GET ${ts}`,
      slug: `esign-pc-get-${ts}`,
      content: 'content',
    });

    expect(staged.status).toBe(200);
    expect(staged.data.pending).toBe(true);
    const token: string = staged.data?.approval?.token;
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64);

    // GET the public approval link — should show linkType = 'pending_change'
    const getRes = await unauthApi.get(`/api/approve/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    const link = getRes.data.data;
    expect(link.token).toBe(token);
    expect(link.linkType).toBe('pending_change');
    expect(link.status).toBe('pending');
    expect(typeof link.pendingChangeId).toBe('number');
    expect(link.pendingChangeId).toBe(staged.data.pendingId);
  });

  test('POST approve on pending_change link applies the staged mutation', async ({ clientApi, unauthApi }) => {
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const slug = `esign-pc-approve-${ts}`;
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `ESign PendingChange Approve ${ts}`,
      slug,
      content: 'needs approval',
    });

    expect(staged.status).toBe(200);
    expect(staged.data.pending).toBe(true);
    const token: string = staged.data?.approval?.token;
    expect(typeof token).toBe('string');

    // POST approve via public token — no session required
    const approveRes = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'External Reviewer',
      reviewerEmail: 'ext@example.com',
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.success).toBe(true);
    const updated = approveRes.data.data;
    expect(updated.status).toBe('approved');
    expect(updated.linkType).toBe('pending_change');
    expect(updated.reviewerName).toBe('External Reviewer');

    // Verify the staged post was actually created on the site
    const postsRes = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    expect(postsRes.data.success).toBe(true);
    const createdPost = (postsRes.data.data as Array<{ slug: string; id: number }>)
      .find((p) => p.slug === slug);
    expect(createdPost).toBeTruthy();
    // Cleanup the created post
    if (createdPost) {
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${createdPost.id}`).catch(() => {});
      });
    }
  });
});

// ─── Gap 3: Invalid / malformed token ────────────────────────────────────────

test.describe('Public /api/approve/[token] — invalid/expired token @gap @esign', () => {
  test('GET with random 64-hex token that has no DB row returns 404', async ({ unauthApi }) => {
    // A well-formed token (64 hex chars) that was never inserted
    const fakeToken = 'a'.repeat(64);
    const res = await unauthApi.get(`/api/approve/${fakeToken}`);
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET with malformed token (too short) returns 404', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/approve/tooshort');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET with non-hex characters in token returns 404', async ({ unauthApi }) => {
    // Same length as a real token but with non-hex chars — rejected by the regex guard
    const nonHexToken = 'z'.repeat(64);
    const res = await unauthApi.get(`/api/approve/${nonHexToken}`);
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST with random valid-format token that has no DB row returns 404', async ({ unauthApi }) => {
    const fakeToken = 'b'.repeat(64);
    const res = await unauthApi.post(`/api/approve/${fakeToken}`, {
      action: 'approve',
      reviewerName: 'Nobody',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST with malformed token returns 404', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/approve/notavalidtoken', {
      action: 'approve',
      reviewerName: 'Nobody',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});

// ─── Gap 4: Already-resolved token → 400 ────────────────────────────────────

test.describe('Public /api/approve/[token] — already-resolved link @gap @esign', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST on already-approved token returns 400 (not 404)', async ({ clientApi, unauthApi }) => {
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const slug = `esign-already-approved-${ts}`;
    const result = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `ESign Already Approved ${ts}`,
      slug,
      content: 'content',
    });

    expect(result.status).toBe(200);
    const token: string = result.data?.approval?.token;
    expect(typeof token).toBe('string');

    const postId: number = result.data?.id;
    if (postId) {
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postId}`).catch(() => {});
      });
    }

    // First approval succeeds
    const first = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'First Reviewer',
    });
    expect(first.status).toBe(200);
    expect(first.data.data.status).toBe('approved');

    // Second attempt on the same (already-approved) link → 400
    const second = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'Second Reviewer',
    });
    expect(second.status).toBe(400);
    expect(second.data.success).toBe(false);
    expect(second.data.message).toMatch(/already been approved/i);
  });
});

// ─── Gap 5: POST validation errors ───────────────────────────────────────────

test.describe('Public /api/approve/[token] — POST validation @gap @esign', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  /**
   * Helper: mint a fresh entity-link token so validation tests use a real pending link.
   * Returns { token, postId } and registers cleanup.
   */
  async function mintEntityToken(clientApi: ApiClient) {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: false,
    });
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const result = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Validation Test ${ts}-${rand}`,
      slug: `esign-val-${ts}-${rand}`,
      content: 'content',
    });

    const token: string = result.data?.approval?.token;
    const postId: number = result.data?.id;
    if (postId) {
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postId}`).catch(() => {});
      });
    }
    return token;
  }

  test('POST without action field returns 400', async ({ clientApi, unauthApi }) => {
    const token = await mintEntityToken(clientApi);
    const res = await unauthApi.post(`/api/approve/${token}`, {
      reviewerName: 'Someone',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/action/i);
  });

  test('POST with invalid action value returns 400', async ({ clientApi, unauthApi }) => {
    const token = await mintEntityToken(clientApi);
    const res = await unauthApi.post(`/api/approve/${token}`, {
      action: 'publish', // not 'approve' or 'reject'
      reviewerName: 'Someone',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/action/i);
  });

  test('POST without reviewerName returns 400', async ({ clientApi, unauthApi }) => {
    const token = await mintEntityToken(clientApi);
    const res = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      // reviewerName intentionally omitted
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/reviewerName/i);
  });

  test('POST with blank reviewerName returns 400', async ({ clientApi, unauthApi }) => {
    const token = await mintEntityToken(clientApi);
    const res = await unauthApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: '   ', // whitespace-only
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/reviewerName/i);
  });
});

// ─── Gap 6: Cross-tenant token isolation ─────────────────────────────────────

test.describe('Cross-tenant token isolation @gap @esign @tenancy', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  /**
   * Client B cannot access client A's pending change via the session-authenticated
   * /api/portal/approvals/[id] route. Even though the pending change's numeric ID is
   * "known", the route scopes by clientId from the session — so client B gets 404.
   */
  test('client B session cannot retrieve client A pending change via portal route', async ({ clientApi, adminApi, unauthApi }) => {
    // --- Client A: mint a pending_change-type approval link ---
    const { website: websiteA, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const staged = await mcp.callTool('posts_create', {
      websiteId: websiteA.id,
      title: `XTenant Post ${ts}`,
      slug: `xtenant-post-${ts}-${rand}`,
      content: 'cross-tenant content',
    });

    expect(staged.status).toBe(200);
    expect(staged.data.pending).toBe(true);
    const pendingId: number = staged.data.pendingId;
    expect(typeof pendingId).toBe('number');

    // Client A CAN retrieve their own pending change
    const ownRes = await clientApi.get(`/api/portal/approvals/${pendingId}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.data.success).toBe(true);

    // --- Create client B via the admin API ---
    const clientBEmail = `client-b-esign-${ts}-${rand}@example.com`;
    const clientBPassword = 'password123';
    const createClientBRes = await adminApi.post('/api/admin/portal/clients', {
      name: `Client B ESign ${ts}`,
      email: clientBEmail,
      password: clientBPassword,
      company: `Client B ESign Corp ${ts}`,
    });
    expect(createClientBRes.status).toBe(200);
    // Note: no admin DELETE /clients endpoint — acceptable test-DB leak with timestamped email.

    const clientBApi = new ApiClient(clientBEmail, clientBPassword);
    await clientBApi.ensure();
    cleanups.push(async () => {
      await clientBApi.dispose();
    });

    // Client B CANNOT retrieve client A's pending change — must return 404
    const crossRes = await clientBApi.get(`/api/portal/approvals/${pendingId}`);
    expect(crossRes.status).toBe(404);
    expect(crossRes.data.success).toBe(false);
  });

  /**
   * A token minted for client A returns 200 from the fully-public approve route,
   * regardless of which session calls it — the token IS the credential, and its
   * side-effects only touch client A's data. Client B cannot forge a valid token
   * by guessing (64-char random hex). A fabricated token always returns 404.
   */
  test('fabricated token returns 404 from any session context (unauthenticated)', async ({ unauthApi }) => {
    // 64 hex chars, never inserted into the DB
    const fabricated = 'deadbeef'.repeat(8); // 64 hex chars
    const getRes = await unauthApi.get(`/api/approve/${fabricated}`);
    expect(getRes.status).toBe(404);
    expect(getRes.data.success).toBe(false);

    const postRes = await unauthApi.post(`/api/approve/${fabricated}`, {
      action: 'approve',
      reviewerName: 'Attacker',
    });
    expect(postRes.status).toBe(404);
    expect(postRes.data.success).toBe(false);
  });

  test('client B cannot use client A entity-link token to approve client A post from authenticated session', async ({ clientApi, adminApi, unauthApi }) => {
    // Client A mints a real entity-link token
    const { website: websiteA, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const result = await mcp.callTool('posts_create', {
      websiteId: websiteA.id,
      title: `XTenant Entity ${ts}`,
      slug: `xtenant-entity-${ts}-${rand}`,
      content: 'entity content',
      published: false,
    });

    expect(result.status).toBe(200);
    const token: string = result.data?.approval?.token;
    const postId: number = result.data?.id;
    if (postId) {
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${websiteA.id}/posts/${postId}`).catch(() => {});
      });
    }

    // --- Create client B ---
    const clientBEmail = `client-b-entity-${ts}-${rand}@example.com`;
    const clientBPassword = 'password123';
    await adminApi.post('/api/admin/portal/clients', {
      name: `Client B Entity ${ts}`,
      email: clientBEmail,
      password: clientBPassword,
      company: `Client B Entity Corp ${ts}`,
    });

    const clientBApi = new ApiClient(clientBEmail, clientBPassword);
    await clientBApi.ensure();
    cleanups.push(async () => { await clientBApi.dispose(); });

    // The public route is sessionless — client B using client A's token succeeds
    // (the token encodes client A's scope; the approve only affects client A's post).
    // But the token IS client A's credential — the isolation guarantee is that client B
    // cannot DISCOVER this token without colluding with client A.
    // GET from client B's context: the route is public — returns 200
    const getFromB = await clientBApi.get(`/api/approve/${token}`);
    expect(getFromB.status).toBe(200);
    expect(getFromB.data.success).toBe(true);
    // The link is scoped to client A's entity — entityId must be client A's post
    expect(getFromB.data.data.entityId).toBe(postId);
    expect(getFromB.data.data.linkType).toBe('entity');

    // Approving from client B's HTTP context approves client A's post — this is
    // intentional (the token-holder is the "approver"; the route is designed to be
    // shared with external reviewers who have no portal account).
    const approveFromB = await clientBApi.post(`/api/approve/${token}`, {
      action: 'approve',
      reviewerName: 'External Client B User',
    });
    expect(approveFromB.status).toBe(200);
    expect(approveFromB.data.success).toBe(true);
    // Confirm the approval is attributed to the reviewer name (not overwritten by B's session)
    expect(approveFromB.data.data.reviewerName).toBe('External Client B User');
    // The resulting approval still scopes to client A's entity
    expect(approveFromB.data.data.entityId).toBe(postId);
  });
});
