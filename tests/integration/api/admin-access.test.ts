/**
 * Admin endpoint access control.
 *
 * /api/admin/* routes use a flat `requireStaff()` gate: only users with
 * role in {'admin', 'employee'} get in. Everyone else — including client-owned
 * accounts — receives 401 (the admin endpoints don't distinguish
 * unauthenticated from unauthorised, deliberately).
 *
 * This spec exercises the gate across several representative admin endpoints
 * and also confirms that staff SEE data from every tenant (cross-client
 * visibility is the whole point of these endpoints).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../helpers/call-handler';
import {
  sessionForNewClientUser,
  sessionForStaff,
  type TenantCtx,
} from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

function uniq(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

async function seedInvoicesAndTickets(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.invoices (number, client_id, status, subtotal, tax, total)
    VALUES (${`INV-${uniq()}`}, ${ctx.client.id}, 'sent', 1000, 0, 1000)
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.support_tickets (number, client_id, subject, status, priority)
    VALUES (${Math.floor(Math.random() * 2_000_000_000)}, ${ctx.client.id}, 'Help', 'open', 'medium')
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
    VALUES ('Project A', ${ctx.client.id}, 'active', true, ${ctx.user.id})
  `;
}

describe('Admin endpoint access — unauthenticated @admin @security', () => {
  beforeEach(() => { mockedAuth.mockResolvedValue(null); });

  it.each([
    ['clients', 'GET'],
    ['tickets', 'GET'],
    ['tickets', 'PATCH'],
    ['projects', 'GET'],
    ['invoices', 'GET'],
  ] as const)('unauth %s %s returns 401', async (resource, method) => {
    const route = await import(`@/app/api/admin/portal/${resource}/route`);
    const res = await callHandler(
      route as unknown as Record<string, unknown>, method,
      method === 'PATCH' ? { body: { id: 1, status: 'resolved' } } : {},
    );
    expect(res.status).toBe(401);
  });
});

describe('Admin endpoint access — client (non-staff) @admin @security', () => {
  it.each([
    ['clients', 'GET'],
    ['tickets', 'GET'],
    ['projects', 'GET'],
    ['invoices', 'GET'],
  ] as const)('client role → %s %s is 401 (staff-only)', async (resource, method) => {
    const A = await sessionForNewClientUser(`admin-client-${resource}`);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import(`@/app/api/admin/portal/${resource}/route`);
    const res = await callHandler(
      route as unknown as Record<string, unknown>, method,
    );
    expect(res.status).toBe(401);
  });
});

describe('Admin endpoint access — staff sees every tenant @admin', () => {
  it('GET /api/admin/portal/clients includes all clients, not just staff\'s own', async () => {
    const [A, B, staff] = await Promise.all([
      sessionForNewClientUser('admin-list-a'),
      sessionForNewClientUser('admin-list-b'),
      sessionForStaff('admin-list-staff'),
    ]);
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/admin/portal/clients/route');
    const res = await callHandler<{ success: boolean; data: { id: number }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const ids = new Set(res.data!.data.map(r => r.id));
    expect(ids.has(A.client.id)).toBe(true);
    expect(ids.has(B.client.id)).toBe(true);
    expect(ids.has(staff.client.id)).toBe(true);
  });

  it('GET /api/admin/portal/tickets returns tickets from every tenant', async () => {
    const [A, B, staff] = await Promise.all([
      sessionForNewClientUser('admin-tix-a'),
      sessionForNewClientUser('admin-tix-b'),
      sessionForStaff('admin-tix-staff'),
    ]);
    await Promise.all([seedInvoicesAndTickets(A), seedInvoicesAndTickets(B)]);

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/tickets/route');
    const res = await callHandler<{ success: boolean; data: { id: number }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/admin/portal/projects returns projects from every tenant', async () => {
    const [A, B, staff] = await Promise.all([
      sessionForNewClientUser('admin-proj-a'),
      sessionForNewClientUser('admin-proj-b'),
      sessionForStaff('admin-proj-staff'),
    ]);
    await Promise.all([seedInvoicesAndTickets(A), seedInvoicesAndTickets(B)]);

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/projects/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const clientIds = new Set(res.data!.data.map(p => p.clientId));
    expect(clientIds.has(A.client.id)).toBe(true);
    expect(clientIds.has(B.client.id)).toBe(true);
  });

  it('GET /api/admin/portal/invoices returns invoices from every tenant', async () => {
    const [A, B, staff] = await Promise.all([
      sessionForNewClientUser('admin-inv-a'),
      sessionForNewClientUser('admin-inv-b'),
      sessionForStaff('admin-inv-staff'),
    ]);
    await Promise.all([seedInvoicesAndTickets(A), seedInvoicesAndTickets(B)]);

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/invoices/route');
    const res = await callHandler<{ success: boolean; data: { id: number }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Admin endpoint writes — staff only @admin @security', () => {
  it('PATCH /api/admin/portal/tickets updates status + stamps resolvedAt on resolve', async () => {
    const A = await sessionForNewClientUser('admin-patch-client');
    const staff = await sessionForStaff('admin-patch-staff');

    const sql = getTestSql();
    const [ticket] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.support_tickets (number, client_id, subject, status, priority)
      VALUES (${Math.floor(Math.random() * 999999)}, ${A.client.id}, 'Resolve me', 'open', 'medium')
      RETURNING id
    `;

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/tickets/route');
    const res = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { body: { id: ticket.id, status: 'resolved', priority: 'low' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('resolved');

    const [after] = await sql<{ status: string; priority: string; resolved_at: Date | null }[]>`
      SELECT status, priority, resolved_at FROM ${sql(TEST_SCHEMA)}.support_tickets WHERE id = ${ticket.id}
    `;
    expect(after.status).toBe('resolved');
    expect(after.priority).toBe('low');
    expect(after.resolved_at).not.toBeNull();
  });

  it('PATCH /api/admin/portal/tickets as a client user returns 401 and does NOT mutate', async () => {
    const A = await sessionForNewClientUser('admin-patch-denied');

    const sql = getTestSql();
    const [ticket] = await sql<{ id: number; status: string }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.support_tickets (number, client_id, subject, status, priority)
      VALUES (${Math.floor(Math.random() * 999999)}, ${A.client.id}, 'Should not change', 'open', 'medium')
      RETURNING id, status
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/admin/portal/tickets/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { body: { id: ticket.id, status: 'resolved' } },
    );
    expect(res.status).toBe(401);

    const [after] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.support_tickets WHERE id = ${ticket.id}
    `;
    expect(after.status).toBe('open');   // unchanged
  });

  it('POST /api/admin/portal/clients requires staff; creates user + client + clientMembers', async () => {
    const staff = await sessionForStaff('admin-create-staff');
    mockedAuth.mockResolvedValue(staff.session);

    const email = `brand-new-${Date.now()}@test.local`;
    const route = await import('@/app/api/admin/portal/clients/route');
    const res = await callHandler<{ success: boolean; data: { user: { id: number }; client: { id: number } } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'New Client', email, password: 'passw0rd!', company: 'NewCo' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [u] = await sql<{ id: number; email: string; role: string }[]>`
      SELECT id, email, role FROM ${sql(TEST_SCHEMA)}.users WHERE email = ${email}
    `;
    expect(u.role).toBe('client');
    const [member] = await sql<{ role: string }[]>`
      SELECT role FROM ${sql(TEST_SCHEMA)}.client_members
      WHERE user_id = ${u.id} AND client_id = ${res.data!.data.client.id}
    `;
    expect(member.role).toBe('owner');
  });

  it('POST /api/admin/portal/clients rejects duplicate email', async () => {
    const staff = await sessionForStaff('admin-dup');
    mockedAuth.mockResolvedValue(staff.session);

    const email = `dup-${Date.now()}@test.local`;
    const route = await import('@/app/api/admin/portal/clients/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'First', email, password: 'pw12345678' } },
    );
    const second = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'Second', email, password: 'pw12345678' } },
    );
    expect(second.status).toBe(400);
    expect(second.data?.message).toMatch(/already exists/i);
  });

  it('POST /api/admin/portal/clients as client (non-staff) returns 401', async () => {
    const A = await sessionForNewClientUser('admin-create-denied');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/admin/portal/clients/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', email: 'x@test.local', password: 'pw12345678' } },
    );
    expect(res.status).toBe(401);
  });
});
