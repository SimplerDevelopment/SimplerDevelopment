/**
 * GET /api/admin/agent-captures/[id] — AAF-001 high-risk-tool argument
 * capture decryption (vault/04 - Decisions/ADR high-risk-agent-arg-capture.md).
 *
 * Auth surface: mirrors app/api/admin/prompts/[id]/promote/route.ts's
 * requireAdmin() — admin role only, not employee/editor. There is no
 * dedicated super-admin role in this codebase; `admin` is the strictest tier.
 *
 * Critical invariant under test: every successful decrypt writes an
 * agent_action_logs row (toolName = 'audit:capture_decrypt') BEFORE the
 * plaintext is returned — no un-audited read path.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForStaff, sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { encryptApiKey } from '@/lib/crypto/api-key';

async function seedCapture(ctx: TenantCtx, args: Record<string, unknown>): Promise<number> {
  const sql = getTestSql();
  const ciphertext = encryptApiKey(JSON.stringify(args));
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.agent_action_captures (client_id, tool_name, key_id, user_id, ciphertext)
    VALUES (${ctx.client.id}, 'email_campaigns_send', NULL, ${ctx.user.id}, ${ciphertext})
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/admin/agent-captures/[id] @admin @security', () => {
  beforeEach(() => {
    mockedAuth.mockReset();
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/admin/agent-captures/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', { params: { id: '1' } });
    expect(res.status).toBe(401);
  });

  it('401 when the caller is a non-admin (tenant editor) user', async () => {
    const editor = await sessionForNewClientUser('captures-nonadmin');
    mockedAuth.mockResolvedValue(editor.session);

    const captureId = await seedCapture(editor, { to: 'x@example.com' });

    const route = await import('@/app/api/admin/agent-captures/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: String(captureId) },
    });
    expect(res.status).toBe(401);
  });

  it('404 for a capture id that does not exist', async () => {
    const staff = await sessionForStaff('captures-404');
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/admin/agent-captures/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: '999999999' },
    });
    expect(res.status).toBe(404);
  });

  it('admin decrypts a capture and the read is itself audit-logged', async () => {
    const staff = await sessionForStaff('captures-admin');
    mockedAuth.mockResolvedValue(staff.session);

    const args = { campaignId: 7, recipients: ['a@example.com', 'b@example.com'] };
    const captureId = await seedCapture(staff, args);

    const route = await import('@/app/api/admin/agent-captures/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { toolName: string; args: Record<string, unknown>; createdAt: string };
    }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(captureId) } });

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.toolName).toBe('email_campaigns_send');
    expect(res.data?.data.args).toEqual(args);

    // No un-audited read path: a matching agent_action_logs row must exist.
    const sql = getTestSql();
    const auditRows = await sql<{ tool_name: string; status: string; client_id: number }[]>`
      SELECT tool_name, status, client_id FROM ${sql(TEST_SCHEMA)}.agent_action_logs
      WHERE tool_name = 'audit:capture_decrypt' AND client_id = ${staff.client.id}
      ORDER BY id DESC LIMIT 1
    `;
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].status).toBe('success');
  });
});
