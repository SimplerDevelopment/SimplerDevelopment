/**
 * Portal websites — environments listing + env vars CRUD.
 *
 * GET    /api/portal/websites/[siteId]/environments               — list envs
 * POST   /api/portal/websites/[siteId]/environments/[envId]/vars  — add var
 * PATCH  /.../vars/[varId]                                        — update
 * DELETE /.../vars/[varId]                                        — remove
 *
 * Cross-site rejection: A cannot list/seed envs through B's siteId, and the
 * envId guard blocks A from operating on B's environment vars even when
 * routing through their own siteId.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'env-site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedEnv(siteId: number, name = 'production'): Promise<{ id: number }> {
  const sql = getTestSql();
  const target = name === 'production' ? 'production' : 'preview';
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.website_environments (website_id, name, vercel_target)
    VALUES (${siteId}, ${name}, ${target})
    RETURNING id
  `;
  return row;
}

async function seedVar(envId: number, key: string, value = 'v'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.website_env_vars (environment_id, key, value)
    VALUES (${envId}, ${key}, ${value})
    RETURNING id
  `;
  return row;
}

describe('GET /api/portal/websites/[siteId]/environments @websites @environments', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('env-list'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(401);
  });

  it('happy path — returns envs for the caller\'s site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedEnv(siteId, 'production');
    await seedEnv(siteId, 'staging');
    const route = await import('@/app/api/portal/websites/[siteId]/environments/route');
    const res = await callHandler<{ success: boolean; data: { name: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.map(e => e.name).sort()).toEqual(['production', 'staging']);
  });

  it('cross-site rejection — A cannot list B\'s environments', async () => {
    const B = await sessionForNewClientUser('env-list-b');
    const { siteId: bSite } = await seedSite(B);
    await seedEnv(bSite);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(bSite) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/portal/websites/[siteId]/environments/[envId]/vars @websites @environments', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('env-var-create'); });

  it('400 when key missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const env = await seedEnv(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), envId: String(env.id) },
        body: { value: 'no-key' },
      },
    );
    expect(res.status).toBe(400);
  });

  it('400 when value is null/undefined', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const env = await seedEnv(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId), envId: String(env.id) }, body: { key: 'X' } },
    );
    expect(res.status).toBe(400);
  });

  it('happy path — creates a var bound to envId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const env = await seedEnv(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/route');
    const res = await callHandler<{ success: boolean; data: { key: string; environmentId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), envId: String(env.id) },
        body: { key: 'API_TOKEN', value: 'abc123' },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.key).toBe('API_TOKEN');
    expect(res.data?.data.environmentId).toBe(env.id);
  });

  it('cross-site rejection — A cannot create a var under B\'s envId', async () => {
    const B = await sessionForNewClientUser('env-var-create-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bEnv = await seedEnv(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(aSite), envId: String(bEnv.id) },
        body: { key: 'STOLEN', value: '1' },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.website_env_vars WHERE environment_id = ${bEnv.id}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('PATCH /api/portal/websites/[siteId]/environments/[envId]/vars/[varId] @websites @environments', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('env-var-patch'); });

  it('happy path — updates value', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const env = await seedEnv(siteId);
    const v = await seedVar(env.id, 'TOKEN', 'old');
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/[varId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { siteId: String(siteId), envId: String(env.id), varId: String(v.id) },
        body: { value: 'new' },
      },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [check] = await sql<{ value: string }[]>`
      SELECT value FROM ${sql(TEST_SCHEMA)}.website_env_vars WHERE id = ${v.id}
    `;
    expect(check.value).toBe('new');
  });

  it('cross-site rejection — A cannot patch B\'s var (env guard rejects before update)', async () => {
    const B = await sessionForNewClientUser('env-var-patch-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bEnv = await seedEnv(bSite);
    const bVar = await seedVar(bEnv.id, 'BTOKEN', 'btok-original');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/[varId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { siteId: String(aSite), envId: String(bEnv.id), varId: String(bVar.id) },
        body: { value: 'hijack' },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [check] = await sql<{ value: string }[]>`
      SELECT value FROM ${sql(TEST_SCHEMA)}.website_env_vars WHERE id = ${bVar.id}
    `;
    expect(check.value).toBe('btok-original');
  });
});

describe('DELETE /api/portal/websites/[siteId]/environments/[envId]/vars/[varId] @websites @environments', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('env-var-delete'); });

  it('happy path — removes the var', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const env = await seedEnv(siteId);
    const v = await seedVar(env.id, 'TOKEN');
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/[varId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), envId: String(env.id), varId: String(v.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.website_env_vars WHERE id = ${v.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('cross-site rejection — A cannot delete B\'s var', async () => {
    const B = await sessionForNewClientUser('env-var-delete-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bEnv = await seedEnv(bSite);
    const bVar = await seedVar(bEnv.id, 'BTOKEN');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/environments/[envId]/vars/[varId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(aSite), envId: String(bEnv.id), varId: String(bVar.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.website_env_vars WHERE id = ${bVar.id}
    `;
    expect(rows.length).toBe(1);
  });
});
