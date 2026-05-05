/**
 * Email lists + subscribers — POST /lists, PATCH /lists/[id], DELETE /lists/[id],
 * POST /subscribers (add), DELETE /subscribers (remove), GET /lists/[id] (read).
 *
 * Note: the recon listed `/lists/[id]/subscribers/route.ts` but that file does
 * not exist; subscribers are managed via the top-level `/subscribers` route
 * with the `listId` carried in the body.
 *
 * Contract covered:
 *   - 401 on every verb
 *   - 404 cross-tenant on PATCH/DELETE/[id], POST/DELETE /subscribers
 *   - 400 missing required fields
 *   - 409 duplicate subscriber email per list
 *   - 200/201 happy path with proper tenant scoping
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

async function enableEmailService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `email-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Email Marketing', ${slug}, 'email', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedList(ctx: TenantCtx, name = 'List'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${ctx.client.id}, ${`${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`})
    RETURNING id
  `;
  return row;
}

// ── /api/portal/email/lists POST ──────────────────────────────────────────

describe('POST /api/portal/email/lists @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/lists/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'X' },
    });
    expect(res.status).toBe(401);
  });

  it('403 without email service subscription', async () => {
    const A = await sessionForNewClientUser('email-list-no-svc');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'X' },
    });
    expect(res.status).toBe(403);
  });

  it('400 when name missing', async () => {
    const A = await sessionForNewClientUser('email-list-noname');
    await enableEmailService(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { description: 'no name' },
    });
    expect(res.status).toBe(400);
  });

  it('201 creates a list owned by the caller', async () => {
    const A = await sessionForNewClientUser('email-list-create');
    await enableEmailService(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; name: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'My List', description: 'desc' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.name).toBe('My List');
  });
});

// ── /api/portal/email/lists/[id] PATCH ─────────────────────────────────

describe('PATCH /api/portal/email/lists/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/lists/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: '1' }, body: { name: 'X' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const A = await sessionForNewClientUser('email-list-patch-a');
    const B = await sessionForNewClientUser('email-list-patch-b');
    const listB = await seedList(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(listB.id) }, body: { name: 'Hijack' },
    });
    expect(res.status).toBe(404);
  });

  it('400 when name missing', async () => {
    const A = await sessionForNewClientUser('email-list-patch-noname');
    const list = await seedList(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(list.id) }, body: { description: 'only' },
    });
    expect(res.status).toBe(400);
  });

  it('200 updates name and description', async () => {
    const A = await sessionForNewClientUser('email-list-patch-ok');
    const list = await seedList(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(list.id) }, body: { name: 'Renamed', description: 'New' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Renamed');
  });
});

// ── /api/portal/email/lists/[id] DELETE ───────────────────────────────

describe('DELETE /api/portal/email/lists/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/lists/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant — does not delete the foreign row', async () => {
    const A = await sessionForNewClientUser('email-list-del-a');
    const B = await sessionForNewClientUser('email-list-del-b');
    const listB = await seedList(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(listB.id) },
    });
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_lists WHERE id = ${listB.id}
    `;
    expect(rows).toHaveLength(1);
  });

  it('200 deletes the row', async () => {
    const A = await sessionForNewClientUser('email-list-del-ok');
    const list = await seedList(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/lists/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(list.id) },
    });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_lists WHERE id = ${list.id}
    `;
    expect(rows).toHaveLength(0);
  });
});

// ── /api/portal/email/subscribers ─────────────────────────────────────

describe('POST /api/portal/email/subscribers @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/subscribers/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { listId: 1, email: 'x@y.test' },
    });
    expect(res.status).toBe(401);
  });

  it('400 when listId or email missing', async () => {
    const A = await sessionForNewClientUser('email-sub-bad');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/subscribers/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { listId: 1 },
    });
    expect(res.status).toBe(400);
  });

  it('404 when listId belongs to another tenant', async () => {
    const A = await sessionForNewClientUser('email-sub-foreign-a');
    const B = await sessionForNewClientUser('email-sub-foreign-b');
    const listB = await seedList(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/subscribers/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { listId: listB.id, email: 'leak@y.test' },
    });
    expect(res.status).toBe(404);
  });

  it('201 happy path: creates subscriber tied to the list', async () => {
    const A = await sessionForNewClientUser('email-sub-ok');
    const list = await seedList(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/subscribers/route');
    const res = await callHandler<{ success: boolean; data: { id: number; listId: number; email: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { listId: list.id, email: 'NEW@example.test', name: 'New' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.email).toBe('new@example.test'); // lowercased
    expect(res.data?.data.listId).toBe(list.id);
  });

  it('409 duplicate email on the same list', async () => {
    const A = await sessionForNewClientUser('email-sub-dup');
    const list = await seedList(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/subscribers/route');
    const first = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { listId: list.id, email: 'dup@y.test' },
    });
    expect(first.status).toBe(201);
    const second = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { listId: list.id, email: 'dup@y.test' },
    });
    expect(second.status).toBe(409);
  });
});

describe('DELETE /api/portal/email/subscribers @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/subscribers/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      query: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('400 when id is missing', async () => {
    const A = await sessionForNewClientUser('email-sub-del-noid');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/subscribers/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE');
    expect(res.status).toBe(400);
  });

  it('404 cross-tenant — subscriber on another tenant\'s list cannot be deleted', async () => {
    const A = await sessionForNewClientUser('email-sub-del-foreign-a');
    const B = await sessionForNewClientUser('email-sub-del-foreign-b');
    const listB = await seedList(B);

    // Seed subscriber on B's list directly via SQL.
    const sql = getTestSql();
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const [sub] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.email_subscribers (list_id, email, status, unsubscribe_token)
      VALUES (${listB.id}, 'foreign@y.test', 'active', ${token})
      RETURNING id
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/subscribers/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      query: { id: String(sub.id) },
    });
    expect(res.status).toBe(404);

    // Subscriber must still exist.
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_subscribers WHERE id = ${sub.id}
    `;
    expect(rows).toHaveLength(1);
  });

  it('200 happy path: deletes the subscriber row', async () => {
    const A = await sessionForNewClientUser('email-sub-del-ok');
    const list = await seedList(A);
    mockedAuth.mockResolvedValue(A.session);

    const postRoute = await import('@/app/api/portal/email/subscribers/route');
    const created = await callHandler<{ success: boolean; data: { id: number } }>(
      postRoute as unknown as Record<string, unknown>, 'POST',
      { body: { listId: list.id, email: 'kill@y.test' } },
    );
    expect(created.status).toBe(201);
    const subId = created.data!.data.id;

    const res = await callHandler(postRoute as unknown as Record<string, unknown>, 'DELETE', {
      query: { id: String(subId) },
    });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_subscribers WHERE id = ${subId}
    `;
    expect(rows).toHaveLength(0);
  });
});
