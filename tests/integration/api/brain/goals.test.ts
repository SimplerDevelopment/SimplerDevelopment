/**
 * Brain goals — POST/PATCH/DELETE on /goals + /goals/[id], POST on
 * /goals/[id]/checkin.
 *
 * Contract:
 *   - 401 unauth, 404 cross-tenant
 *   - POST: title + initiativeId required (400 otherwise)
 *   - POST: cross-tenant initiativeId returns 400 ("initiative not found in tenant")
 *   - PATCH: returns updated row, 404 when missing
 *   - DELETE: hard-deletes the leaf row
 *   - Checkin: bumps lastCheckedInAt; does NOT write an audit row (per PLAN.md)
 *   - Aggregate query reflects DB state (covered via two reads against the
 *     same fixture)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedInitiative(ctx: TenantCtx, overrides: { name?: string; slug?: string } = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_initiatives (client_id, name, slug)
    VALUES (
      ${ctx.client.id},
      ${overrides.name ?? `Initiative ${ts}`},
      ${overrides.slug ?? `init-${ts}-${Math.floor(Math.random() * 9999)}`}
    )
    RETURNING id
  `;
  return row;
}

async function seedGoal(
  ctx: TenantCtx,
  initiativeId: number,
  overrides: { title?: string; status?: string; targetMetric?: number; currentMetric?: number } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_goals (
      client_id, initiative_id, title, status, target_metric, current_metric
    )
    VALUES (
      ${ctx.client.id},
      ${initiativeId},
      ${overrides.title ?? `goal-${Date.now()}`},
      ${overrides.status ?? 'open'},
      ${overrides.targetMetric ?? null},
      ${overrides.currentMetric ?? null}
    )
    RETURNING id
  `;
  return row;
}

describe('Brain goals — POST /goals @brain @goals', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-goals-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/goals/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { initiativeId: 1, title: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when title is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const route = await import('@/app/api/portal/brain/goals/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { initiativeId: init.id } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/title/i);
  });

  it('400 when initiativeId is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/goals/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'orphan' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/initiativeId/i);
  });

  it('creates a goal scoped to the caller tenant + initiative', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const route = await import('@/app/api/portal/brain/goals/route');
    const res = await callHandler<{ success: boolean; data: { id: number; title: string; initiativeId: number; status: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { initiativeId: init.id, title: 'Ship M2', unit: 'count', targetMetric: 5 } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Ship M2');
    expect(res.data?.data.initiativeId).toBe(init.id);
    // status defaults to 'open'
    expect(res.data?.data.status).toBe('open');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; current_metric: number | null }[]>`
      SELECT client_id, current_metric FROM ${sql(TEST_SCHEMA)}.brain_goals WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    // unit set + no explicit current → defaults to 0
    expect(row.current_metric).toBe(0);
  });

  it('400 when initiativeId belongs to another tenant', async () => {
    const B = await sessionForNewClientUser('brain-goals-cross');
    const foreignInit = await seedInitiative(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/goals/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { initiativeId: foreignInit.id, title: 'hijack' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/initiative not found in tenant/);

    // No goal got created on either tenant.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_goals WHERE initiative_id = ${foreignInit.id}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('Brain goals — GET /goals + GET /goals/[id] @brain @goals', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-goals-read'); });

  it('lists goals scoped to caller tenant + filters by initiativeId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init1 = await seedInitiative(A);
    const init2 = await seedInitiative(A);
    await seedGoal(A, init1.id, { title: 'a' });
    await seedGoal(A, init1.id, { title: 'b' });
    await seedGoal(A, init2.id, { title: 'c' });

    const route = await import('@/app/api/portal/brain/goals/route');
    const res = await callHandler<{ success: boolean; data: { items: { id: number; title: string }[]; limit: number } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { initiativeId: init1.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items.map(g => g.title).sort()).toEqual(['a', 'b']);
    expect(res.data?.data.limit).toBeLessThanOrEqual(100);
  });

  it('GET /goals/[id] returns goal + slim initiative ref', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A, { name: 'Ship the platform', slug: 'platform' });
    const g = await seedGoal(A, init.id, { title: 'Hit MAU' });

    const route = await import('@/app/api/portal/brain/goals/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { goal: { id: number; title: string }; initiative: { initiativeId: number; name: string; slug: string; status: string } | null };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(g.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.goal.title).toBe('Hit MAU');
    expect(res.data?.data.initiative?.name).toBe('Ship the platform');
    expect(res.data?.data.initiative?.slug).toBe('platform');
  });

  it('404 cross-tenant on GET /goals/[id]', async () => {
    const B = await sessionForNewClientUser('brain-goals-read-b');
    const initB = await seedInitiative(B);
    const goalB = await seedGoal(B, initB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/goals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(goalB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain goals — PATCH /goals/[id] @brain @goals', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-goals-patch'); });

  it('updates own goal + 200', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const g = await seedGoal(A, init.id, { title: 'before' });

    const route = await import('@/app/api/portal/brain/goals/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string; status: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(g.id) }, body: { title: 'after', status: 'on_track' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('after');
    expect(res.data?.data.status).toBe('on_track');
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-goals-patch-b');
    const initB = await seedInitiative(B);
    const goalB = await seedGoal(B, initB.id, { title: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/goals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(goalB.id) }, body: { title: 'hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.brain_goals WHERE id = ${goalB.id}
    `;
    expect(row.title).toBe('foreign');
  });
});

describe('Brain goals — DELETE /goals/[id] @brain @goals', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-goals-del'); });

  it('hard-deletes the row', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const g = await seedGoal(A, init.id);

    const route = await import('@/app/api/portal/brain/goals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(g.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_goals WHERE id = ${g.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 on missing id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/goals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain goals — POST /goals/[id]/checkin @brain @goals', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-goals-checkin'); });

  it('updates lastCheckedInAt and does NOT write an audit row', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const g = await seedGoal(A, init.id, { targetMetric: 100, currentMetric: 10 });

    const route = await import('@/app/api/portal/brain/goals/[id]/checkin/route');
    const res = await callHandler<{ success: boolean; data: { lastCheckedInAt: string | null; currentMetric: number | null; status: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(g.id) }, body: { currentMetric: 40, note: 'sprint 3 done' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.currentMetric).toBe(40);
    expect(res.data?.data.lastCheckedInAt).not.toBeNull();

    const sql = getTestSql();
    const auditRows = await sql<{ action: string }[]>`
      SELECT action FROM ${sql(TEST_SCHEMA)}.brain_audit_logs
      WHERE client_id = ${A.client.id}
        AND entity_type = 'brain_goal'
        AND entity_id = ${g.id}
    `;
    // Per PLAN.md: checkin must not audit. The seed only created the row via
    // raw SQL (no audit row), so the bucket should be entirely empty.
    expect(auditRows.length).toBe(0);
  });

  it('returns 404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-goals-checkin-b');
    const initB = await seedInitiative(B);
    const goalB = await seedGoal(B, initB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/goals/[id]/checkin/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(goalB.id) }, body: { currentMetric: 99 } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain goals — aggregateGoalsForInitiative @brain @goals', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-goals-agg'); });

  it('counts goals by status matching the DB state', async () => {
    const { aggregateGoalsForInitiative } = await import('@/lib/brain/goals');
    const init = await seedInitiative(A);
    await seedGoal(A, init.id, { status: 'open' });
    await seedGoal(A, init.id, { status: 'on_track' });
    await seedGoal(A, init.id, { status: 'on_track' });
    await seedGoal(A, init.id, { status: 'at_risk' });
    await seedGoal(A, init.id, { status: 'achieved' });

    const agg = await aggregateGoalsForInitiative(A.client.id, init.id);
    expect(agg.total).toBe(5);
    expect(agg.byStatus.open).toBe(1);
    expect(agg.byStatus.on_track).toBe(2);
    expect(agg.byStatus.at_risk).toBe(1);
    expect(agg.byStatus.achieved).toBe(1);
    expect(agg.byStatus.off_track).toBe(0);
    expect(agg.byStatus.missed).toBe(0);
  });
});
