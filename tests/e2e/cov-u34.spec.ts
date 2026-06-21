/**
 * ESign Approvals E2E — coverage unit 34
 *
 * Slice: "To Test" cards [0..3] from the ESign Approvals E2E Audit board.
 *
 * Card 0: Signer identity verification (OTP / KBA) — gap, no implementation.
 * Card 1: Automated reminder nudges for pending approvals — gap, no implementation.
 * Card 2: All 6 approval entity types via public /approve/[token] — exercises
 *          the public POST /api/approve/[token] route. Tests the 'post' entity
 *          type (requires 'websites' service, reliably seeded) to prove the
 *          end-to-end: MCP create → entity approval link minted → public
 *          approve → post marked published.
 * Card 3: Orphaned/stale pending-change graceful error state — the audit
 *          board documents this as a known bug: "Public /approve endpoint 500s
 *          on orphaned/stale pending-change dependency (stale email_lists row)".
 *          Test confirms it 500s instead of returning a graceful error.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestApiKey,
  createTestWebsite,
  McpTestClient,
} from './setup/helpers';

// ── Card 2: All 6 entity types via public /approve/[token] ──────────────────
//
// We exercise the 'post' entity type as the representative path:
//   1. Create a site + MCP key (no requireCmsApproval — apply path, entity link).
//   2. Call posts_create via MCP; the response embeds approval.token.
//   3. GET /api/approve/[token]  → 200, status=pending.
//   4. POST /api/approve/[token] { action:'approve', reviewerName } → 200, status=approved.
//   5. Verify the post row is now published via the portal CMS API.
//   6. POST again → 400 (already approved, link no longer pending).
//
// The other 5 entity types (pitch_deck, email_campaign, block_template, survey,
// booking_page) require entitlements not reliably present in the e2e seed
// ('pitch-decks', 'email', 'surveys', 'booking'). Rather than skip the entire
// card, we cover the shared route logic with the 'post' type and note the
// entitlement gap for the remainder.

test.describe('Public /api/approve/[token] — post entity type @approvals @public', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'APPR-TOKEN-01: GET returns pending, POST approve publishes the post, second POST returns 400',
    async ({ clientApi, unauthApi }) => {
      // ── Setup: a website + a regular (non-approval-required) MCP key ──
      const { website, cleanup: siteCleanup } = await createTestWebsite(clientApi);
      cleanups.push(siteCleanup);

      const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
        requireCmsApproval: false,
      });
      cleanups.push(keyCleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      const ts = Date.now();
      const slug = `cov-u34-post-${ts}`;

      // ── Create the post via MCP (apply path) ──
      const createRes = await mcp.callTool('posts_create', {
        websiteId: website.id,
        title: `CovU34 Post ${ts}`,
        slug,
        content: 'E2E approval test body',
        published: false,
      });

      // If the seed client lacks the 'websites' entitlement, the MCP tool
      // returns serviceDenied. Skip rather than fail.
      if (createRes.isError || (createRes.data as { error?: string } | null)?.error) {
        const msg = createRes.text ?? JSON.stringify(createRes.data);
        test.skip(true, `MCP posts_create blocked (entitlement/seed issue): ${msg}`);
        return;
      }

      const postData = createRes.data as {
        id: number;
        approval?: { token: string; status: string } | null;
      } | null;

      expect(postData).toBeTruthy();
      expect(typeof postData?.id).toBe('number');

      // The apply path ALWAYS mints an entity approval link.
      const token = postData?.approval?.token;
      expect(token, 'Expected approval.token in posts_create response').toBeTruthy();

      if (!token) return; // guard — expect above would have failed

      const postId = postData!.id;

      // Cleanup: delete the post after the test
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postId}`).catch(() => {});
      });

      // ── GET /api/approve/[token] — verify pending ──
      const getRes = await unauthApi.get(`/api/approve/${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.data.success).toBe(true);
      expect(getRes.data.data.status).toBe('pending');
      expect(getRes.data.data.entityType).toBe('post');
      expect(getRes.data.data.entityId).toBe(postId);

      // ── POST approve ──
      const approveRes = await unauthApi.post(`/api/approve/${token}`, {
        action: 'approve',
        reviewerName: 'E2E Reviewer',
        reviewerEmail: 'reviewer@example.com',
        reviewNote: 'Approved by cov-u34 E2E test',
      });
      expect(approveRes.status).toBe(200);
      expect(approveRes.data.success).toBe(true);
      expect(approveRes.data.data.status).toBe('approved');

      // ── Verify the post is now published in the CMS ──
      const postDetail = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts/${postId}`);
      expect(postDetail.status).toBe(200);
      expect(postDetail.data.data.published).toBe(true);

      // ── Second approve → 400 (link already consumed) ──
      const doubleApprove = await unauthApi.post(`/api/approve/${token}`, {
        action: 'approve',
        reviewerName: 'Second Reviewer',
      });
      expect(doubleApprove.status).toBe(400);
    }
  );

  test(
    'APPR-TOKEN-02: POST reject sets status=rejected; entity stays unpublished',
    async ({ clientApi, unauthApi }) => {
      const { website, cleanup: siteCleanup } = await createTestWebsite(clientApi);
      cleanups.push(siteCleanup);

      const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
        requireCmsApproval: false,
      });
      cleanups.push(keyCleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      const ts = Date.now();
      const slug = `cov-u34-reject-${ts}`;

      const createRes = await mcp.callTool('posts_create', {
        websiteId: website.id,
        title: `CovU34 Reject ${ts}`,
        slug,
        content: 'Reject path test',
        published: false,
      });

      if (createRes.isError || (createRes.data as { error?: string } | null)?.error) {
        const msg = createRes.text ?? JSON.stringify(createRes.data);
        test.skip(true, `MCP posts_create blocked: ${msg}`);
        return;
      }

      const postData = createRes.data as {
        id: number;
        approval?: { token: string } | null;
      } | null;
      const token = postData?.approval?.token;
      expect(token).toBeTruthy();
      if (!token) return;

      const postId = postData!.id;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postId}`).catch(() => {});
      });

      // ── POST reject ──
      const rejectRes = await unauthApi.post(`/api/approve/${token}`, {
        action: 'reject',
        reviewerName: 'E2E Rejector',
        reviewNote: 'Not approved by test',
      });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.data.success).toBe(true);
      expect(rejectRes.data.data.status).toBe('rejected');

      // ── Entity should still be unpublished ──
      const postDetail = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts/${postId}`);
      expect(postDetail.status).toBe(200);
      expect(postDetail.data.data.published).toBe(false);
    }
  );

  test(
    'APPR-TOKEN-03: unknown token returns 404 for both GET and POST',
    async ({ unauthApi }) => {
      const fakeToken = 'a'.repeat(64);

      const getRes = await unauthApi.get(`/api/approve/${fakeToken}`);
      expect(getRes.status).toBe(404);

      const postRes = await unauthApi.post(`/api/approve/${fakeToken}`, {
        action: 'approve',
        reviewerName: 'Ghost',
      });
      expect(postRes.status).toBe(404);
    }
  );

  test(
    'APPR-TOKEN-04: POST with missing/invalid action returns 400',
    async ({ clientApi, unauthApi }) => {
      // Mint a real token so validation is reached (not short-circuited by 404)
      const { website, cleanup: siteCleanup } = await createTestWebsite(clientApi);
      cleanups.push(siteCleanup);

      const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
        requireCmsApproval: false,
      });
      cleanups.push(keyCleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      const ts = Date.now();
      const createRes = await mcp.callTool('posts_create', {
        websiteId: website.id,
        title: `CovU34 Validation ${ts}`,
        slug: `cov-u34-valid-${ts}`,
        content: 'Validation test',
      });

      if (createRes.isError || (createRes.data as { error?: string } | null)?.error) {
        test.skip(true, `MCP posts_create blocked — skip validation sub-test`);
        return;
      }

      const postData = createRes.data as { id: number; approval?: { token: string } | null } | null;
      const token = postData?.approval?.token;
      expect(token).toBeTruthy();
      if (!token) return;

      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${postData!.id}`).catch(() => {});
      });

      // Missing action
      const noAction = await unauthApi.post(`/api/approve/${token}`, {
        reviewerName: 'Tester',
      });
      expect(noAction.status).toBe(400);

      // Invalid action value
      const badAction = await unauthApi.post(`/api/approve/${token}`, {
        action: 'maybe',
        reviewerName: 'Tester',
      });
      expect(badAction.status).toBe(400);

      // Missing reviewerName
      const noName = await unauthApi.post(`/api/approve/${token}`, {
        action: 'approve',
      });
      expect(noName.status).toBe(400);
    }
  );
});

// ── Card 3: Orphaned/stale pending-change graceful error state ───────────────
//
// The audit board documents this as a bug:
//   "Public /approve endpoint 500s on orphaned/stale pending-change dependency
//    (stale email_lists row) — robustness gap, not just env artifact"
//
// Simulate: create a pending_change approval link, delete/invalidate the
// underlying pending change row, then attempt to approve it. The route
// currently returns 500 instead of a graceful 4xx.
//
// We test the closest simulatable variant: a pending_change link whose
// pending change has already been applied (status='applied') — the route's
// applyApproval throws "Pending change is applied" which it catches and
// re-surfaces as 500. A 400 or 410 would be more appropriate.

test.describe('Stale pending-change approval link error behaviour @approvals @stale', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'APPR-STALE-01: approving a link whose pending-change is already applied returns 500 (known bug)',
    async ({ clientApi, unauthApi }) => {
      // ── Setup: site + approval-required MCP key (stages → pending_change link) ──
      const { website, cleanup: siteCleanup } = await createTestWebsite(clientApi);
      cleanups.push(siteCleanup);

      const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
        requireCmsApproval: true,
      });
      cleanups.push(keyCleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      const ts = Date.now();
      const createRes = await mcp.callTool('posts_create', {
        websiteId: website.id,
        title: `CovU34 Stale ${ts}`,
        slug: `cov-u34-stale-${ts}`,
        content: 'Stale link test',
      });

      if (createRes.isError || (createRes.data as { error?: string } | null)?.error) {
        test.skip(true, `MCP posts_create blocked — skip stale sub-test`);
        return;
      }

      const staged = createRes.data as {
        pending?: boolean;
        pendingId?: number;
        approval?: { token: string } | null;
      } | null;

      // Must be staged (pending_change link type)
      expect(staged?.pending).toBe(true);
      if (!staged?.pending || !staged?.pendingId || !staged?.approval?.token) {
        test.skip(true, 'Not staged as pending — cannot test stale path');
        return;
      }

      const pendingId = staged.pendingId;
      const token = staged.approval.token;

      // ── Approve the pending change via the portal (makes it 'applied') ──
      const firstApprove = await clientApi.post(`/api/portal/approvals/${pendingId}/approve`, {
        note: 'pre-consumed by E2E to make it stale',
      });
      expect(firstApprove.status).toBe(200);

      // The portal-side post that got created:
      const postList = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
      const posts = (postList.data.data ?? []) as Array<{ id: number; slug: string }>;
      const createdPost = posts.find(p => p.slug === `cov-u34-stale-${ts}`);
      if (createdPost) {
        cleanups.push(async () => {
          await clientApi.delete(`/api/portal/cms/websites/${website.id}/posts/${createdPost.id}`).catch(() => {});
        });
      }

      // ── Now try to approve via the public token — pending change is already 'applied' ──
      // The route catches the error and returns 500. A graceful 400/410 would be
      // the correct behaviour — this test documents the bug.
      const staleApprove = await unauthApi.post(`/api/approve/${token}`, {
        action: 'approve',
        reviewerName: 'Stale Tester',
      });

      // BUG: returns 500 instead of a graceful 4xx. We assert 500 to pin the
      // current (broken) behaviour and detect if/when it's fixed.
      expect(staleApprove.status).toBe(500);
    }
  );
});
