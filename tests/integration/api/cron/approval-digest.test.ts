/**
 * Integration tests for `/api/cron/approval-digest` (BAR-003).
 *
 * Coverage:
 *   Auth surface:
 *     - 401 without credentials
 *     - 200 with `Authorization: Bearer ${CRON_SECRET}`
 *     - 200 with `x-vercel-cron: 1` (platform-signed)
 *   Core digest behavior:
 *     - A digest-marked, undigested `mcp_pending_change` notification whose
 *       underlying change is still pending → sends ONE digest email and
 *       stamps `metadata.digestedAt` on the row.
 *     - Two digest-marked notifications for the SAME user → still one email
 *       (grouped), both rows stamped.
 *     - A notification whose underlying mcp_pending_changes row is no longer
 *       'pending' (already approved) → excluded, no email.
 *     - A notification already carrying `metadata.digestedAt` → excluded
 *       from a second run (idempotent).
 *     - A non-digest (instant) notification → never picked up here (that's
 *       handled synchronously by sendApprovalEmails, not this cron).
 *
 * The actual email send is mocked — we only care that the cron *would have*
 * sent one email per (clientId, userId) group and correctly stamped the
 * digested rows so a re-run doesn't double-send.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resendSendMock = vi.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null });

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => resendSendMock(...args),
    },
  },
}));

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const CRON_SECRET = 'test-cron-secret-' + Math.random().toString(36).slice(2);

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.RESEND_API_KEY = 'rk_test';
  delete process.env.MCP_APPROVAL_EMAILS_ENABLED;
  resendSendMock.mockClear();
});

async function seedPendingChange(
  clientId: number,
  userId: number,
  opts: { status?: string; summary?: string } = {},
): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.mcp_pending_changes
      (client_id, user_id, entity_type, entity_id, operation, summary, payload, status)
    VALUES (
      ${clientId}, ${userId}, 'post', NULL, 'update',
      ${opts.summary ?? 'Update homepage hero copy'}, '{}'::json, ${opts.status ?? 'pending'}
    )
    RETURNING id
  `;
  return row.id;
}

async function seedDigestNotification(
  clientId: number,
  userId: number,
  pendingChangeId: number,
  opts: { digestedAt?: string | null } = {},
): Promise<number> {
  const sql = getTestSql();
  const metadata = opts.digestedAt
    ? { digest: true, digestedAt: opts.digestedAt }
    : { digest: true };
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_notifications
      (client_id, user_id, type, title, entity_type, entity_id, metadata)
    VALUES (
      ${clientId}, ${userId}, 'mcp_pending_change', 'MCP change awaiting approval',
      'mcp_approval', ${pendingChangeId}, ${sql.json(metadata)}
    )
    RETURNING id
  `;
  return row.id;
}

async function seedInstantNotification(
  clientId: number,
  userId: number,
  pendingChangeId: number,
): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_notifications
      (client_id, user_id, type, title, entity_type, entity_id, metadata)
    VALUES (
      ${clientId}, ${userId}, 'mcp_pending_change', 'MCP change awaiting approval',
      'mcp_approval', ${pendingChangeId}, NULL
    )
    RETURNING id
  `;
  return row.id;
}

async function getRoute() {
  return await import('@/app/api/cron/approval-digest/route');
}

describe('GET /api/cron/approval-digest — auth', () => {
  it('401 without auth', async () => {
    const route = await getRoute();
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', { headers: {} });
    expect(res.status).toBe(401);
  });

  it('200 with correct bearer', async () => {
    const route = await getRoute();
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status).toBe(200);
  });

  it('200 with x-vercel-cron header', async () => {
    const route = await getRoute();
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/cron/approval-digest — digest selection + stamping', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('approval-digest');
  });

  it('sends one digest email for a digest-marked, still-pending notification and stamps digestedAt', async () => {
    const pendingId = await seedPendingChange(A.client.id, A.user.id, {
      summary: 'Update homepage hero copy',
    });
    const notifId = await seedDigestNotification(A.client.id, A.user.id, pendingId);

    const route = await getRoute();
    const res = await callHandler<{
      success: boolean;
      data: { usersNotified: number; notificationsDigested: number };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.status).toBe(200);
    expect(res.data?.data.usersNotified).toBe(1);
    expect(res.data?.data.notificationsDigested).toBe(1);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(resendSendMock.mock.calls[0][0].to).toBe(A.user.email);
    expect(resendSendMock.mock.calls[0][0].html).toContain('Update homepage hero copy');

    const sql = getTestSql();
    const [row] = await sql<{ metadata: { digest?: boolean; digestedAt?: string } }[]>`
      SELECT metadata FROM ${sql(TEST_SCHEMA)}.crm_notifications WHERE id = ${notifId}
    `;
    expect(row.metadata.digestedAt).toBeTruthy();
  });

  it('groups two digest notifications for the same user into a single email, stamps both', async () => {
    const pendingId1 = await seedPendingChange(A.client.id, A.user.id, { summary: 'Change A' });
    const pendingId2 = await seedPendingChange(A.client.id, A.user.id, { summary: 'Change B' });
    const notif1 = await seedDigestNotification(A.client.id, A.user.id, pendingId1);
    const notif2 = await seedDigestNotification(A.client.id, A.user.id, pendingId2);

    const route = await getRoute();
    const res = await callHandler<{
      success: boolean;
      data: { usersNotified: number; notificationsDigested: number };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.data?.data.usersNotified).toBe(1);
    expect(res.data?.data.notificationsDigested).toBe(2);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const html = resendSendMock.mock.calls[0][0].html as string;
    expect(html).toContain('Change A');
    expect(html).toContain('Change B');

    const sql = getTestSql();
    const rows = await sql<{ id: number; metadata: { digestedAt?: string } }[]>`
      SELECT id, metadata FROM ${sql(TEST_SCHEMA)}.crm_notifications WHERE id IN (${notif1}, ${notif2})
    `;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.metadata.digestedAt).toBeTruthy();
  });

  it('excludes a notification whose underlying pending change is no longer pending', async () => {
    const pendingId = await seedPendingChange(A.client.id, A.user.id, { status: 'approved' });
    await seedDigestNotification(A.client.id, A.user.id, pendingId);

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { usersNotified: number; notificationsDigested: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );

    expect(res.data?.data.usersNotified).toBe(0);
    expect(res.data?.data.notificationsDigested).toBe(0);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('excludes a notification already stamped with digestedAt (idempotent re-run)', async () => {
    const pendingId = await seedPendingChange(A.client.id, A.user.id);
    await seedDigestNotification(A.client.id, A.user.id, pendingId, {
      digestedAt: new Date().toISOString(),
    });

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { usersNotified: number; notificationsDigested: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );

    expect(res.data?.data.usersNotified).toBe(0);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('ignores an instant (non-digest) notification — no metadata.digest flag', async () => {
    const pendingId = await seedPendingChange(A.client.id, A.user.id);
    await seedInstantNotification(A.client.id, A.user.id, pendingId);

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { usersNotified: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );

    expect(res.data?.data.usersNotified).toBe(0);
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
