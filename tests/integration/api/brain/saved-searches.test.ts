/**
 * Brain saved-searches — tenant-scoped CRUD with personal/shared scope semantics.
 *
 * Routes covered:
 *   - GET    /api/portal/brain/saved-searches            (list, scoped by ?userId=mine|shared|all)
 *   - POST   /api/portal/brain/saved-searches            (create personal | shared)
 *   - GET    /api/portal/brain/saved-searches/[id]
 *   - PATCH  /api/portal/brain/saved-searches/[id]       (update; scope flip)
 *   - DELETE /api/portal/brain/saved-searches/[id]
 *
 * Personal pins:  user_id = caller userId.
 * Shared pins:    user_id IS NULL (visible to every tenant member).
 *
 * Multi-tenant isolation is the load-bearing thing — every endpoint has at
 * least one cross-tenant assertion that would catch a missing clientId
 * predicate.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, sessionFor, type TenantCtx, type TestSession } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

interface SeedSavedOpts {
  name?: string;
  userId?: number | null;
  icon?: string;
  filters?: Record<string, unknown>;
  sortOrder?: number;
}

async function seedSaved(ctx: TenantCtx, overrides: SeedSavedOpts = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const filters = JSON.stringify(overrides.filters ?? { search: 'x' });
  const userId = overrides.userId === undefined ? ctx.user.id : overrides.userId;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_saved_searches (
      client_id, user_id, name, icon, filters, sort_order
    ) VALUES (
      ${ctx.client.id},
      ${userId},
      ${overrides.name ?? `pin-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.icon ?? 'bookmark'},
      ${filters}::json,
      ${overrides.sortOrder ?? 0}
    )
    RETURNING id
  `;
  return row;
}

/**
 * Add a second member to an existing tenant so we can test "shared pin
 * visible to other tenant members" without spinning up a whole second
 * tenant. Returns the new user's session + id.
 */
async function addTenantMember(ctx: TenantCtx, label = 'member'): Promise<{ session: TestSession; userId: number }> {
  const sql = getTestSql();
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES (${label}, ${email}, 'x', 'editor', true)
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
    VALUES (${ctx.client.id}, ${u.id}, 'member')
  `;
  return {
    session: sessionFor({ id: u.id, role: 'editor', email, name: label }),
    userId: u.id,
  };
}

async function readRow(id: number): Promise<{ id: number; client_id: number; user_id: number | null; name: string; icon: string } | undefined> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number; client_id: number; user_id: number | null; name: string; icon: string }[]>`
    SELECT id, client_id, user_id, name, icon
    FROM ${sql(TEST_SCHEMA)}.brain_saved_searches
    WHERE id = ${id}
  `;
  return row;
}

// ─── POST /saved-searches ────────────────────────────────────────────────────

describe('POST /api/portal/brain/saved-searches @brain @saved-searches', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('saved-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'x', filters: { search: 'a' } } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { filters: { search: 'a' } } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/name/i);
  });

  it('400 when filters is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'no-filters' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/filters/i);
  });

  it('200 creates personal pin (default scope) — user_id = caller', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ success: boolean; data: { id: number; userId: number | null; updatedAt: string; createdBy: number | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'My pin', filters: { search: 'priority' }, icon: 'star' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.id).toBeGreaterThan(0);
    expect(res.data?.data.userId).toBe(A.user.id);
    // Identity + updatedAt are present on the response
    expect(res.data?.data.updatedAt).toBeTruthy();
    expect(res.data?.data.createdBy).toBe(A.user.id);

    const row = await readRow(res.data!.data.id);
    expect(row?.client_id).toBe(A.client.id);
    expect(row?.user_id).toBe(A.user.id);
  });

  it('200 creates shared pin when scope=shared — user_id IS NULL', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ data: { id: number; userId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Team pin', filters: { search: 'team' }, scope: 'shared' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.userId).toBeNull();

    const row = await readRow(res.data!.data.id);
    expect(row?.user_id).toBeNull();
    expect(row?.client_id).toBe(A.client.id);
  });
});

// ─── GET /saved-searches (list) ──────────────────────────────────────────────

describe('GET /api/portal/brain/saved-searches @brain @saved-searches', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('saved-list'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(401);
  });

  it('returns empty list for a brand-new tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ data: { items: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items).toEqual([]);
  });

  it('lists own personal pins', async () => {
    const own = await seedSaved(A, { name: 'mine', userId: A.user.id });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ data: { items: Array<{ id: number; userId: number | null }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data.items ?? []).map(r => r.id);
    expect(ids).toContain(own.id);
  });

  it('?userId=mine returns only caller\'s personal pins (excludes shared)', async () => {
    const personal = await seedSaved(A, { name: 'personal', userId: A.user.id });
    const shared = await seedSaved(A, { name: 'shared', userId: null });
    const other = await addTenantMember(A);
    const teammates = await seedSaved(A, { name: 'teammate-personal', userId: other.userId });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ data: { items: Array<{ id: number; userId: number | null }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { userId: 'mine' } },
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data.items ?? []).map(r => r.id);
    expect(ids).toContain(personal.id);
    expect(ids).not.toContain(shared.id);
    expect(ids).not.toContain(teammates.id);
  });

  it('?userId=shared returns only shared pins (user_id IS NULL)', async () => {
    const personal = await seedSaved(A, { name: 'personal', userId: A.user.id });
    const shared1 = await seedSaved(A, { name: 'shared1', userId: null });
    const shared2 = await seedSaved(A, { name: 'shared2', userId: null });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ data: { items: Array<{ id: number; userId: number | null }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { userId: 'shared' } },
    );
    expect(res.status).toBe(200);
    const items = res.data?.data.items ?? [];
    const ids = items.map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining([shared1.id, shared2.id]));
    expect(ids).not.toContain(personal.id);
    for (const i of items) expect(i.userId).toBeNull();
  });

  it('default (?userId=all) returns own personal + shared, excludes other users\' personal', async () => {
    const personal = await seedSaved(A, { name: 'personal', userId: A.user.id });
    const shared = await seedSaved(A, { name: 'shared', userId: null });
    const other = await addTenantMember(A);
    const otherPersonal = await seedSaved(A, { name: 'other-personal', userId: other.userId });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data.items ?? []).map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining([personal.id, shared.id]));
    expect(ids).not.toContain(otherPersonal.id);
  });

  it('cross-tenant: tenant A never sees tenant B\'s personal OR shared pins', async () => {
    const B = await sessionForNewClientUser('saved-list-b');
    const bPersonal = await seedSaved(B, { name: 'b-personal', userId: B.user.id });
    const bShared = await seedSaved(B, { name: 'b-shared', userId: null });
    const aOwn = await seedSaved(A, { name: 'a-own', userId: A.user.id });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');

    const all = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(all.status).toBe(200);
    const allIds = (all.data?.data.items ?? []).map(r => r.id);
    expect(allIds).toContain(aOwn.id);
    expect(allIds).not.toContain(bPersonal.id);
    expect(allIds).not.toContain(bShared.id);

    const sharedOnly = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { userId: 'shared' } },
    );
    const sharedIds = (sharedOnly.data?.data.items ?? []).map(r => r.id);
    expect(sharedIds).not.toContain(bShared.id);
  });

  it('orders by sortOrder asc then createdAt asc', async () => {
    // Insert with explicit sort_order so we can assert deterministic ordering.
    const last = await seedSaved(A, { name: 'last', userId: A.user.id, sortOrder: 30 });
    const first = await seedSaved(A, { name: 'first', userId: A.user.id, sortOrder: 10 });
    const middle = await seedSaved(A, { name: 'middle', userId: A.user.id, sortOrder: 20 });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/route');
    const res = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data.items ?? []).map(r => r.id);
    const idxFirst = ids.indexOf(first.id);
    const idxMiddle = ids.indexOf(middle.id);
    const idxLast = ids.indexOf(last.id);
    expect(idxFirst).toBeGreaterThanOrEqual(0);
    expect(idxFirst).toBeLessThan(idxMiddle);
    expect(idxMiddle).toBeLessThan(idxLast);
  });
});

// ─── GET /saved-searches/[id] ────────────────────────────────────────────────

describe('GET /api/portal/brain/saved-searches/[id] @brain @saved-searches', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('saved-get'); });

  it('200 for own personal pin', async () => {
    const own = await seedSaved(A, { name: 'pp', userId: A.user.id });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler<{ data: { id: number } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(own.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBe(own.id);
  });

  it('200 shared pin is visible to another tenant member', async () => {
    const shared = await seedSaved(A, { name: 'team', userId: null });
    const other = await addTenantMember(A);
    mockedAuth.mockResolvedValue(other.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler<{ data: { id: number; userId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(shared.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBe(shared.id);
    expect(res.data?.data.userId).toBeNull();
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('saved-get-b');
    const foreign = await seedSaved(B, { name: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /saved-searches/[id] ──────────────────────────────────────────────

describe('PATCH /api/portal/brain/saved-searches/[id] @brain @saved-searches', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('saved-patch'); });

  it('200 updates own personal — name/filters/icon', async () => {
    const own = await seedSaved(A, { name: 'before', icon: 'bookmark', userId: A.user.id });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler<{ data: { name: string; icon: string; filters: { search?: string } } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      {
        params: { id: String(own.id) },
        body: { name: 'after', icon: 'star', filters: { search: 'updated' } },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('after');
    expect(res.data?.data.icon).toBe('star');
    expect(res.data?.data.filters.search).toBe('updated');
  });

  // Shared pins (userId IS NULL) are mutable by any tenant member —
  // assertSavedSearchMutable in lib/brain/saved-searches.ts only enforces
  // ownership on personal pins. Tenancy is still enforced by clientId scoping.
  it('200 shared pin: any tenant member may update it', async () => {
    const shared = await seedSaved(A, { name: 'team-pin', userId: null });
    const other = await addTenantMember(A);
    mockedAuth.mockResolvedValue(other.session);

    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler<{ data: { name: string; userId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(shared.id) }, body: { name: 'team-pin-renamed' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('team-pin-renamed');
    expect(res.data?.data.userId).toBeNull();
  });

  it('scope flip: scope=shared sets user_id=null', async () => {
    const own = await seedSaved(A, { name: 'flip-to-shared', userId: A.user.id });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler<{ data: { userId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(own.id) }, body: { scope: 'shared' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.userId).toBeNull();
    const row = await readRow(own.id);
    expect(row?.user_id).toBeNull();
  });

  it('scope flip: scope=personal sets user_id to caller', async () => {
    const shared = await seedSaved(A, { name: 'flip-to-personal', userId: null });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler<{ data: { userId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(shared.id) }, body: { scope: 'personal' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.userId).toBe(A.user.id);
    const row = await readRow(shared.id);
    expect(row?.user_id).toBe(A.user.id);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('saved-patch-b');
    const foreign = await seedSaved(B, { name: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(foreign.id) }, body: { name: 'hijack' } },
    );
    expect(res.status).toBe(404);

    const row = await readRow(foreign.id);
    expect(row?.name).toBe('foreign');
  });
});

// ─── DELETE /saved-searches/[id] ─────────────────────────────────────────────

describe('DELETE /api/portal/brain/saved-searches/[id] @brain @saved-searches', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('saved-del'); });

  it('200 own — row removed', async () => {
    const own = await seedSaved(A, { name: 'doomed', userId: A.user.id });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(own.id) } },
    );
    expect(res.status).toBe(200);
    expect(await readRow(own.id)).toBeUndefined();
  });

  it('404 cross-tenant — foreign row untouched', async () => {
    const B = await sessionForNewClientUser('saved-del-b');
    const foreign = await seedSaved(B, { name: 'foreign-del' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);

    expect(await readRow(foreign.id)).toBeDefined();
  });

  // Permission check enforced by lib/brain/saved-searches.ts:assertSavedSearchMutable
  // — only the personal pin's owner (or anyone, for shared pins) may delete it.
  it('403 when a same-tenant non-author tries to delete another\'s personal pin', async () => {
    const own = await seedSaved(A, { name: 'mine', userId: A.user.id });
    const other = await addTenantMember(A);
    mockedAuth.mockResolvedValue(other.session);
    const route = await import('@/app/api/portal/brain/saved-searches/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(own.id) } },
    );
    expect(res.status).toBe(403);
    expect(await readRow(own.id)).toBeDefined();
  });
});
