/**
 * ESign Approvals — E2E Coverage Unit 36
 *
 * Cards 8–11 (0-based) from "## To Test" in the ESign Approvals audit board:
 *   8. Survey entity type via public /approve/[token]: approval flips survey status to active
 *   9. Booking page entity type via public /approve/[token]: approval flips booking_page active=true
 *  10. Block template entity type via public /approve/[token]: draft overlay is promoted to live on approval
 *  11. mcp_approval_links expiresAt enforcement: expired token returns 400/410, cannot be used to approve
 *
 * All tests create and clean up their own data.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, McpTestClient } from './setup/helpers';
import { execSync } from 'child_process';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/simplerdev_test';

// ── helpers ──────────────────────────────────────────────────────────────────

/** POST to the public /api/approve/[token] endpoint (no auth required). */
async function publicApprove(
  unauthApi: { post: (url: string, body: unknown) => Promise<{ status: number; data: unknown }> },
  token: string,
  action: 'approve' | 'reject',
) {
  return unauthApi.post(`/api/approve/${token}`, {
    action,
    reviewerName: 'E2E Reviewer',
    reviewerEmail: 'e2e-reviewer@example.com',
    reviewNote: 'automated test',
  });
}

// ── Card 8: Survey entity type ────────────────────────────────────────────────

test.describe('ESign Approvals — Survey approval via token link @approvals @survey', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'Card 8: POST /api/approve/[token] approve flips survey status to active',
    async ({ clientApi, unauthApi }) => {
      // Create an MCP API key for this client
      const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
        scopes: ['*'],
        requireCmsApproval: false,
      });
      cleanups.push(keyCleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      const ts = Date.now();
      // surveys_create mints an approval link automatically — survey starts in draft
      const createResult = await mcp.callTool('surveys_create', {
        title: `E2E Survey Approval ${ts}`,
        description: 'Created for approval e2e test',
        fields: [{ id: 'q1', type: 'text', label: 'Name', required: false, order: 0 }],
      });

      expect(createResult.isError).toBe(false);
      const surveyData = createResult.data as Record<string, unknown>;
      const surveyId = surveyData.id as number;
      const approval = surveyData.approval as { token: string; status: string } | null;

      expect(typeof surveyId).toBe('number');
      expect(approval).toBeTruthy();
      expect(approval!.token).toBeTruthy();

      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/surveys/${surveyId}`).catch(() => {});
      });

      // Verify survey starts as draft
      const beforeRes = await clientApi.get(`/api/portal/surveys/${surveyId}`);
      expect(beforeRes.status).toBe(200);
      expect((beforeRes.data as { data: { status: string } }).data.status).toBe('draft');

      // Approve via public token link (no portal session)
      const approveRes = await publicApprove(unauthApi, approval!.token, 'approve');
      expect(approveRes.status).toBe(200);
      expect((approveRes.data as { success: boolean }).success).toBe(true);

      // Survey status should now be 'active'
      const afterRes = await clientApi.get(`/api/portal/surveys/${surveyId}`);
      expect(afterRes.status).toBe(200);
      expect((afterRes.data as { data: { status: string } }).data.status).toBe('active');
    },
  );
});

// ── Card 9: Booking page entity type ─────────────────────────────────────────

test.describe('ESign Approvals — Booking page approval via token link @approvals @booking', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'Card 9: POST /api/approve/[token] approve flips booking_page active=true',
    async ({ clientApi, unauthApi }) => {
      const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
        scopes: ['*'],
        requireCmsApproval: false,
      });
      cleanups.push(keyCleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      const ts = Date.now();
      // booking_pages_create mints an approval link — page starts inactive
      const createResult = await mcp.callTool('booking_pages_create', {
        title: `E2E Booking Approval ${ts}`,
        slug: `e2e-booking-approval-${ts}`,
        description: 'Created for approval e2e test',
        durationMinutes: 30,
        active: false,
      });

      expect(createResult.isError).toBe(false);
      const pageData = createResult.data as Record<string, unknown>;
      const pageId = pageData.id as number;
      const approval = pageData.approval as { token: string } | null;

      expect(typeof pageId).toBe('number');
      expect(approval).toBeTruthy();
      expect(approval!.token).toBeTruthy();

      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/tools/booking/${pageId}`).catch(() => {});
      });

      // Verify booking page starts inactive
      const beforeRes = await clientApi.get(`/api/portal/tools/booking/${pageId}`);
      expect(beforeRes.status).toBe(200);
      const beforePage = (beforeRes.data as { data: { active: boolean } }).data;
      expect(beforePage.active).toBe(false);

      // Approve via public token link
      const approveRes = await publicApprove(unauthApi, approval!.token, 'approve');
      expect(approveRes.status).toBe(200);
      expect((approveRes.data as { success: boolean }).success).toBe(true);

      // Booking page should now be active
      const afterRes = await clientApi.get(`/api/portal/tools/booking/${pageId}`);
      expect(afterRes.status).toBe(200);
      const afterPage = (afterRes.data as { data: { active: boolean } }).data;
      expect(afterPage.active).toBe(true);
    },
  );
});

// ── Card 10: Block template entity type ──────────────────────────────────────

test.describe('ESign Approvals — Block template approval via token link @approvals @block-template', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'Card 10: POST /api/approve/[token] approve promotes block template draft overlay to live',
    async ({ clientApi, unauthApi }) => {
      const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
        scopes: ['*'],
        requireCmsApproval: false,
      });
      cleanups.push(keyCleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      const ts = Date.now();
      const slug = `e2e-bt-approval-${ts}`;

      // block_templates_create stages everything in draft overlay
      const createResult = await mcp.callTool('block_templates_create', {
        name: `E2E Block Template ${ts}`,
        slug,
        description: 'Created for approval e2e test',
        category: 'custom',
        scope: 'block',
        blocks: [{ id: `b-${ts}`, type: 'text', content: 'Hello' }],
        tags: ['e2e'],
      });

      expect(createResult.isError).toBe(false);
      const tplData = createResult.data as Record<string, unknown>;
      const tplId = tplData.id as number;
      const approval = tplData.approval as { token: string } | null;

      expect(typeof tplId).toBe('number');
      expect(approval).toBeTruthy();
      expect(approval!.token).toBeTruthy();

      // Cleanup via psql since there's no portal DELETE for block templates
      cleanups.push(async () => {
        try {
          execSync(
            `psql "${DB_URL}" -c "DELETE FROM block_templates WHERE id = ${tplId};"`,
            { stdio: 'pipe' },
          );
        } catch {
          // best-effort
        }
      });

      // Approve via public token link — should clear the draft overlay
      const approveRes = await publicApprove(unauthApi, approval!.token, 'approve');
      expect(approveRes.status).toBe(200);
      expect((approveRes.data as { success: boolean }).success).toBe(true);

      // GET the approval link status to confirm it's now 'approved'
      const linkRes = await unauthApi.get(`/api/approve/${approval!.token}`);
      expect(linkRes.status).toBe(200);
      const linkData = linkRes.data as { data: { status: string } };
      expect(linkData.data.status).toBe('approved');

      // Verify the draft overlay was cleared in the DB
      const rows = execSync(
        `psql "${DB_URL}" -t -A -c "SELECT draft IS NULL FROM block_templates WHERE id = ${tplId};"`,
        { stdio: 'pipe' },
      )
        .toString()
        .trim();
      expect(rows).toBe('t');
    },
  );
});

// ── Card 11: expiresAt enforcement ───────────────────────────────────────────

test.describe('ESign Approvals — Expired token enforcement @approvals @expiry', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'Card 11: Expired approval token returns 400 from POST and status=expired from GET',
    async ({ unauthApi }) => {
      // Insert a stale expired token directly into the test DB
      const expiredToken = 'a'.repeat(64); // 64-char hex-like string (all 'a's = valid format)
      const clientId = 1; // seeded test client

      try {
        execSync(
          `psql "${DB_URL}" -c "DELETE FROM mcp_approval_links WHERE token = '${expiredToken}';"`,
          { stdio: 'pipe' },
        );
        // Use a heredoc-style -c argument to avoid shell quoting issues with INTERVAL
        execSync(
          `psql "${DB_URL}" -c "INSERT INTO mcp_approval_links (token, client_id, link_type, entity_type, entity_id, status, summary, expires_at) VALUES ('${expiredToken}', ${clientId}, 'entity', 'survey', NULL, 'pending', 'Expired token test', NOW() - INTERVAL '1 day');"`,
          { stdio: 'pipe', shell: '/bin/bash' },
        );
      } catch (err) {
        throw new Error(`Failed to seed expired token: ${err}`);
      }

      cleanups.push(async () => {
        try {
          execSync(
            `psql "${DB_URL}" -c "DELETE FROM mcp_approval_links WHERE token = '${expiredToken}';"`,
            { stdio: 'pipe' },
          );
        } catch {
          // best-effort
        }
      });

      // GET should return the link (as expired, not 404)
      const getRes = await unauthApi.get(`/api/approve/${expiredToken}`);
      expect(getRes.status).toBe(200);
      const getLinkData = getRes.data as { data: { status: string } };
      expect(getLinkData.data.status).toBe('expired');

      // POST approve should be rejected with 400 (status !== 'pending')
      const postRes = await unauthApi.post(`/api/approve/${expiredToken}`, {
        action: 'approve',
        reviewerName: 'Attacker',
      });
      expect(postRes.status).toBe(400);
    },
  );
});
