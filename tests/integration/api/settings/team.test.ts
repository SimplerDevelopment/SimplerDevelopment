/**
 * Integration tests for portal settings team routes.
 *
 * Covers two route families:
 *   - /api/portal/settings/team           — owner-only invite + list
 *   - /api/portal/settings/team/[memberId] — owner-only delete
 *   - /api/portal/team                    — owner+admin invite (sends email)
 *   - /api/portal/team/[memberId]         — owner+admin role change + delete
 *
 * Tenancy contract: owner of tenant A must not be able to mutate clientMembers
 * rows that belong to tenant B (cross-tenant 404). Within a tenant, role +
 * authorisation rules are enforced (admins can't touch admins, owners can't
 * be removed, you can't remove yourself).
 *
 * `sendInviteEmail` is mocked so the Resend HTTP call never fires — the route
 * falls through that import dynamically.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Stub Resend wrapper — we assert it was called with the right shape, not
// that the network request succeeded.
const sendInviteEmailMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/email/invite-email', () => ({
  sendInviteEmail: sendInviteEmailMock,
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

/** Insert a non-owner member directly so we have a target for role/delete tests. */
async function seedMember(clientId: number, role: 'admin' | 'member' | 'viewer' = 'member') {
  const sql = getTestSql();
  const email = `m-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES ('Member', ${email}, 'x', 'editor', true)
    RETURNING id
  `;
  const [m] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
    VALUES (${clientId}, ${u.id}, ${role})
    RETURNING id
  `;
  return { memberId: m.id, userId: u.id, email };
}

describe('GET /api/portal/settings/team @settings @team @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('team-get');
  });

  it('returns members with isOwner flag (200)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/team/route');
    const res = await callHandler<{
      success: boolean;
      data: Array<{ userId: number; isOwner: boolean; isCurrentUser: boolean }>;
      isOwner: boolean;
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.isOwner).toBe(true);
    expect(res.data?.data.length).toBeGreaterThanOrEqual(1);
    const me = res.data?.data.find(m => m.userId === A.user.id);
    expect(me?.isOwner).toBe(true);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/settings/team/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/portal/settings/team (invite) @settings @team', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('team-invite');
  });

  it('happy path: owner invites a brand-new user, returns tempPassword (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/team/route');
    const email = `invitee-${Date.now()}@test.local`;
    const res = await callHandler<{
      success: boolean;
      data: { id: number; email: string; isNewUser: boolean; tempPassword: string | null };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'Invitee', email },
    });
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.isNewUser).toBe(true);
    expect(res.data?.data.tempPassword).toBeTruthy();
    expect(res.data?.data.email).toBe(email);
  });

  it('rejects missing fields (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/team/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: '', email: '' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects duplicate invite (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/team/route');
    const email = `dup-${Date.now()}@test.local`;
    const first = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'Dup', email } },
    );
    expect(first.status).toBe(201);
    const second = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'Dup', email } },
    );
    expect(second.status).toBe(400);
    expect(second.data?.message).toMatch(/already/i);
  });

  it('non-owner non-admin member cannot invite (403)', async () => {
    // Seed a plain member in A's tenant and forge their session.
    const member = await seedMember(A.client.id, 'member');
    mockedAuth.mockResolvedValue({
      user: { id: String(member.userId), email: member.email, name: 'Member', role: 'editor' },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    });
    const route = await import('@/app/api/portal/settings/team/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', email: `x-${Date.now()}@test.local` } },
    );
    // settings/team enforces strict owner-only via clients.userId OR clientMembers.role='owner'
    expect(res.status).toBe(403);
  });
});

describe('POST /api/portal/team (invite + email) @settings @team', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('team2-invite');
    sendInviteEmailMock.mockClear();
  });

  it('owner invites: sends email, sets inviteSent=true (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/team/route');
    const email = `r-${Date.now()}@test.local`;
    const res = await callHandler<{
      success: boolean;
      data: { id: number; email: string; isNewUser: boolean; inviteSent: boolean };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'Reson', email, role: 'member' },
    });
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.isNewUser).toBe(true);
    expect(res.data?.data.inviteSent).toBe(true);
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
    expect(sendInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: email,
        role: 'member',
        inviteToken: expect.any(String),
      }),
    );
  });

  it('admin cannot promote to admin (403)', async () => {
    const adminMember = await seedMember(A.client.id, 'admin');
    mockedAuth.mockResolvedValue({
      user: { id: String(adminMember.userId), email: adminMember.email, name: 'Admin', role: 'editor' },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    });
    const route = await import('@/app/api/portal/team/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', email: `x-${Date.now()}@test.local`, role: 'admin' } },
    );
    expect(res.status).toBe(403);
  });

  it('viewer cannot invite (403)', async () => {
    const viewer = await seedMember(A.client.id, 'viewer');
    mockedAuth.mockResolvedValue({
      user: { id: String(viewer.userId), email: viewer.email, name: 'V', role: 'editor' },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    });
    const route = await import('@/app/api/portal/team/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', email: `x-${Date.now()}@test.local` } },
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/portal/team/[memberId] (role change) @settings @team @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('team-role-a'),
      sessionForNewClientUser('team-role-b'),
    ]);
  });

  it('owner promotes a member to admin (200)', async () => {
    const m = await seedMember(A.client.id, 'member');
    await asTenant(A);
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { memberId: String(m.memberId) }, body: { role: 'admin' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [row] = await sql<{ role: string }[]>`
      SELECT role FROM ${sql(TEST_SCHEMA)}.client_members WHERE id = ${m.memberId}
    `;
    expect(row.role).toBe('admin');
  });

  it('rejects invalid role (400)', async () => {
    const m = await seedMember(A.client.id, 'member');
    await asTenant(A);
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { memberId: String(m.memberId) }, body: { role: 'overlord' } },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A cannot change role of B\'s member (404, role preserved)', async () => {
    const mB = await seedMember(B.client.id, 'member');
    await asTenant(A);
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { memberId: String(mB.memberId) }, body: { role: 'admin' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ role: string }[]>`
      SELECT role FROM ${sql(TEST_SCHEMA)}.client_members WHERE id = ${mB.memberId}
    `;
    expect(row.role).toBe('member');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { memberId: '1' }, body: { role: 'admin' } },
    );
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/portal/team/[memberId] @settings @team @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('team-del-a'),
      sessionForNewClientUser('team-del-b'),
    ]);
  });

  it('owner deletes a member (200)', async () => {
    const m = await seedMember(A.client.id, 'member');
    await asTenant(A);
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { memberId: String(m.memberId) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.client_members WHERE id = ${m.memberId}
    `;
    expect(rows.length).toBe(0);
  });

  it('cross-tenant: A cannot delete B\'s member (404, row preserved)', async () => {
    const mB = await seedMember(B.client.id, 'member');
    await asTenant(A);
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { memberId: String(mB.memberId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.client_members WHERE id = ${mB.memberId}
    `;
    expect(rows.length).toBe(1);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { memberId: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('admin cannot remove another admin (403)', async () => {
    const otherAdmin = await seedMember(A.client.id, 'admin');
    const callerAdmin = await seedMember(A.client.id, 'admin');
    mockedAuth.mockResolvedValue({
      user: { id: String(callerAdmin.userId), email: callerAdmin.email, name: 'Admin', role: 'editor' },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    });
    const route = await import('@/app/api/portal/team/[memberId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { memberId: String(otherAdmin.memberId) } },
    );
    expect(res.status).toBe(403);
  });
});
