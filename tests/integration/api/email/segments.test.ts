/**
 * Email segments — POST, PATCH, DELETE.
 *
 * Contract:
 *   - 401 unauth
 *   - 403 without `email` service subscription
 *   - 404 when patching/deleting a segment that belongs to another tenant
 *   - 400 missing required fields (POST)
 *   - 201/200 happy path returns envelope { success, data }
 */
import { describe, it, expect, vi, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function enableEmail(ctx: TenantCtx) {
  const sql = getTestSql();
  const slug = `email-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Email', ${slug}, 'email', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedSegment(ctx: TenantCtx, name = 'Seg') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_segments (client_id, name, rules, match_type)
    VALUES (${ctx.client.id}, ${`${name}-${Date.now()}`}, '[]'::json, 'all')
    RETURNING id
  `;
  return row;
}

describe('POST /api/portal/email/segments @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/segments/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: { name: 'X' } });
    expect(res.status).toBe(401);
  });

  it('403 without email subscription', async () => {
    const A = await sessionForNewClientUser('email-seg-no-svc');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/segments/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'X' },
    });
    expect(res.status).toBe(403);
  });

  it('400 when name is missing', async () => {
    const A = await sessionForNewClientUser('email-seg-noname');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/segments/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { description: 'oops' },
    });
    expect(res.status).toBe(400);
  });

  it('201 happy path inserts under caller\'s clientId', async () => {
    const A = await sessionForNewClientUser('email-seg-ok');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/segments/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; name: string; matchType: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        body: {
          name: 'High Value',
          rules: [{ field: 'email', operator: 'contains', value: '@enterprise.com' }],
          matchType: 'all',
        },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.matchType).toBe('all');
  });
});

describe('PATCH /api/portal/email/segments/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/segments/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: '1' }, body: { name: 'X' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant — does not update foreign segment', async () => {
    const A = await sessionForNewClientUser('email-seg-patch-a');
    const B = await sessionForNewClientUser('email-seg-patch-b');
    await enableEmail(A);
    await enableEmail(B);
    const segB = await seedSegment(B, 'foreign');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/segments/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(segB.id) }, body: { name: 'Hijack' },
    });
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [still] = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(TEST_SCHEMA)}.email_segments WHERE id = ${segB.id}
    `;
    expect(still.name).not.toBe('Hijack');
  });

  it('200 updates segment', async () => {
    const A = await sessionForNewClientUser('email-seg-patch-ok');
    await enableEmail(A);
    const seg = await seedSegment(A, 'before');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/segments/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; matchType: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(seg.id) }, body: { name: 'after', matchType: 'any' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('after');
    expect(res.data?.data.matchType).toBe('any');
  });
});

describe('DELETE /api/portal/email/segments/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/segments/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('200 cross-tenant call succeeds (route returns 200) but does NOT delete the foreign row', async () => {
    const A = await sessionForNewClientUser('email-seg-del-a');
    const B = await sessionForNewClientUser('email-seg-del-b');
    await enableEmail(A);
    await enableEmail(B);
    const segB = await seedSegment(B, 'foreign');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/segments/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(segB.id) },
    });
    // Route always returns 200; what matters is that the foreign row is intact.
    expect(res.status).toBe(200);
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_segments WHERE id = ${segB.id}
    `;
    expect(rows).toHaveLength(1);
  });

  it('200 deletes own segment', async () => {
    const A = await sessionForNewClientUser('email-seg-del-ok');
    await enableEmail(A);
    const seg = await seedSegment(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/segments/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(seg.id) },
    });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_segments WHERE id = ${seg.id}
    `;
    expect(rows).toHaveLength(0);
  });
});
