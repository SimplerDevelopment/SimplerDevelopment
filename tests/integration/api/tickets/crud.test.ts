/**
 * Portal support tickets — list + create.
 *
 *   GET  /api/portal/tickets   (list within tenant, ordered by createdAt)
 *   POST /api/portal/tickets   (create with auto-incremented number + first message)
 *
 * NOTE: the recon listed PATCH/DELETE on this route, but the route file exports
 * only GET and POST. Per-ticket mutation endpoints would belong to a [id]/route.ts
 * which does not exist. We test what's there.
 *
 * Cross-tenant: GET only returns the caller's tickets; POST always creates
 * tickets scoped to the caller's clientId — there is no foreign-id surface to
 * attack on these endpoints, so we assert the listing isolation directly.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// Stub the automation event-bus so emitEvent doesn't try to read DB rules.
vi.mock('@/lib/automation', () => ({
  emitEvent: vi.fn(),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  twoTenants,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedTicket(ctx: TenantCtx, overrides: { subject?: string; status?: string } = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e6);
  // support_tickets.number is INTEGER (max ~2.1B) — keep within int4 range.
  const number = (ts % 100_000_000) + rand;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.support_tickets
      (number, client_id, subject, category, priority, status, created_by)
    VALUES
      (${number}, ${ctx.client.id},
       ${overrides.subject ?? `Subj-${ts}-${rand}`},
       'general', 'medium',
       ${overrides.status ?? 'open'},
       ${ctx.user.id})
    RETURNING id
  `;
  return { id: row.id };
}

describe('GET /api/portal/tickets @tickets @list', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tickets/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {});
    expect(res.status).toBe(401);
  });

  it('lists only the caller tenant tickets', async () => {
    await seedTicket(A, { subject: 'A-only' });
    await seedTicket(B, { subject: 'B-only' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tickets/route');
    const res = await callHandler<{ data: Array<{ subject: string; clientId: number }> }>(
      route as unknown as Record<string, unknown>, 'GET', {},
    );
    expect(res.status).toBe(200);
    const subjects = res.data?.data?.map(t => t.subject) ?? [];
    expect(subjects).toContain('A-only');
    expect(subjects).not.toContain('B-only');
    for (const t of res.data?.data ?? []) {
      expect(t.clientId).toBe(A.client.id);
    }
  });
});

describe('POST /api/portal/tickets @tickets @create', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tickets/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { body: { subject: 'x', body: 'y' } });
    expect(res.status).toBe(401);
  });

  it('400 when subject is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { body: { subject: '', body: 'has body' } });
    expect(res.status).toBe(400);
  });

  it('400 when body is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { body: { subject: 'has subject', body: '   ' } });
    expect(res.status).toBe(400);
  });

  it('200 creates ticket scoped to caller tenant + first message persisted', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/route');
    const res = await callHandler<{ data: { id: number; clientId: number; status: string; number: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { subject: 'Site is down', body: 'Cannot reach the site', priority: 'high', category: 'technical' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.clientId).toBe(A.client.id);
    expect(res.data?.data?.status).toBe('open');
    expect(typeof res.data?.data?.number).toBe('number');

    const sql = getTestSql();
    const msgs = await sql<{ body: string; author_id: number; ticket_id: number }[]>`
      SELECT body, author_id, ticket_id FROM ${sql(TEST_SCHEMA)}.ticket_messages
      WHERE ticket_id = ${res.data!.data!.id}
    `;
    expect(msgs.length).toBe(1);
    expect(msgs[0].body).toBe('Cannot reach the site');
    expect(msgs[0].author_id).toBe(A.user.id);
  });

  it("cross-tenant insulation: A's POST cannot land on B's clientId", async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/route');
    const res = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      // Even if the body tries to push another clientId, the route ignores it.
      { body: { subject: 'spoofed', body: 'spoofed', clientId: B.client.id } as unknown as Record<string, string> },
    );
    expect(res.status).toBe(200);
    const sql = getTestSql();
    const [row] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.support_tickets WHERE id = ${res.data!.data!.id}
    `;
    expect(row.client_id).toBe(A.client.id);
  });
});
