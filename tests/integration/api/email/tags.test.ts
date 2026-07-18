/**
 * Email subscriber tags — POST, DELETE.
 *
 * Note: there is no PATCH endpoint for tags; the recon assumed one but the
 * route file `tags/[id]/route.ts` only exports DELETE.
 *
 * Contract:
 *   - 401 unauth
 *   - 403 without `email` service subscription
 *   - 400 missing required fields (POST)
 *   - cross-tenant DELETE does NOT remove the foreign row
 *   - 201/200 happy path
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

async function seedTag(ctx: TenantCtx, name = 'Tag') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_subscriber_tags (client_id, name, color)
    VALUES (${ctx.client.id}, ${`${name}-${Date.now()}`}, '#abcdef')
    RETURNING id
  `;
  return row;
}

describe('POST /api/portal/email/tags @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/tags/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: { name: 'X' } });
    expect(res.status).toBe(401);
  });

  it('403 without email subscription', async () => {
    const A = await sessionForNewClientUser('email-tag-no-svc');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/tags/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: { name: 'X' } });
    expect(res.status).toBe(403);
  });

  it('400 when name missing', async () => {
    const A = await sessionForNewClientUser('email-tag-noname');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/tags/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(400);
  });

  it('201 creates a tag scoped to the caller', async () => {
    const A = await sessionForNewClientUser('email-tag-ok');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/tags/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; color: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'VIP', color: '#10b981' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.color).toBe('#10b981');
  });
});

describe('DELETE /api/portal/email/tags/[id] @email', () => {
  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/email/tags/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('cross-tenant DELETE does NOT remove the foreign row', async () => {
    const A = await sessionForNewClientUser('email-tag-del-a');
    const B = await sessionForNewClientUser('email-tag-del-b');
    await enableEmail(A);
    await enableEmail(B);
    const tagB = await seedTag(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/tags/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(tagB.id) },
    });
    expect(res.status).toBe(200); // route always 200s; what matters is that the foreign row is intact

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_subscriber_tags WHERE id = ${tagB.id}
    `;
    expect(rows).toHaveLength(1);
  });

  it('200 deletes own tag', async () => {
    const A = await sessionForNewClientUser('email-tag-del-ok');
    await enableEmail(A);
    const tag = await seedTag(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/tags/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(tag.id) },
    });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_subscriber_tags WHERE id = ${tag.id}
    `;
    expect(rows).toHaveLength(0);
  });
});
