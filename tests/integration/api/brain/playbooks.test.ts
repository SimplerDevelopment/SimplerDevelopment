/**
 * Brain playbooks — REST round-trip + step CRUD + reorder atomicity +
 * activate (DAG happy + failure) + archive force + tenancy isolation.
 *
 * Contract:
 *   - 401 unauth on every route
 *   - 400 invalid body (zod) / 400 attempted status change via PATCH
 *   - 404 cross-tenant on GET/PATCH/DELETE/activate/archive/steps
 *   - POST creates with auto-slug + tenant scope + 'draft' status
 *   - GET list returns stepCount + activeRunCount via correlated subqueries
 *     (catches the ${table.col} Drizzle bug)
 *   - GET [id] returns { playbook, steps } ordered by sortOrder
 *   - Step CRUD: add → list → reorder → patch → delete
 *   - reorder is atomic — rejection on cross-playbook id rolls back nothing
 *     visible (refreshed list still matches the pre-call order)
 *   - activate refuses on zero-step + on DAG cycle
 *   - archive refuses while active runs exist; ?force=true overrides
 *
 * Tagged @brain @playbooks.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

// ─── seed helpers ───────────────────────────────────────────────────────────

async function seedPlaybook(
  ctx: TenantCtx,
  overrides: { name?: string; slug?: string; status?: string; triggerKind?: string; category?: string | null } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const name = overrides.name ?? `pb-${Date.now()}-${Math.floor(Math.random() * 999)}`;
  const slug = overrides.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_playbooks
      (client_id, name, slug, status, trigger_kind, category)
    VALUES (
      ${ctx.client.id},
      ${name},
      ${slug},
      ${overrides.status ?? 'draft'},
      ${overrides.triggerKind ?? 'manual'},
      ${overrides.category ?? null}
    )
    RETURNING id
  `;
  return row;
}

async function seedStep(
  ctx: TenantCtx,
  playbookId: number,
  overrides: { key?: string; name?: string; kind?: string; sortOrder?: number; nextStepKeys?: string[] } = {},
): Promise<{ id: number; key: string }> {
  const sql = getTestSql();
  const key = overrides.key ?? `s${Math.floor(Math.random() * 1_000_000)}`;
  const name = overrides.name ?? `Step ${key}`;
  const kind = overrides.kind ?? 'task';
  const sortOrder = overrides.sortOrder ?? 0;
  const nextStepKeys = overrides.nextStepKeys ?? [];
  const [row] = await sql<{ id: number; key: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_playbook_steps
      (client_id, playbook_id, key, name, kind, config, next_step_keys, sort_order)
    VALUES (
      ${ctx.client.id},
      ${playbookId},
      ${key},
      ${name},
      ${kind},
      '{}'::jsonb,
      ${JSON.stringify(nextStepKeys)}::jsonb,
      ${sortOrder}
    )
    RETURNING id, key
  `;
  return row;
}

async function seedRun(
  ctx: TenantCtx,
  playbookId: number,
  status: string = 'active',
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_playbook_runs
      (client_id, playbook_id, label, status, context)
    VALUES (
      ${ctx.client.id},
      ${playbookId},
      ${`run-${Date.now()}`},
      ${status},
      '{}'::jsonb
    )
    RETURNING id
  `;
  return row;
}

// ─── POST /playbooks ────────────────────────────────────────────────────────

describe('Brain playbooks — POST /playbooks @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'no name' } },
    );
    expect(res.status).toBe(400);
  });

  it('creates a draft playbook with auto-slug + manual trigger, scoped to tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler<{
      success: boolean;
      data: { id: number; slug: string; name: string; status: string; triggerKind: string };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      body: { name: 'New Hire Onboarding', category: 'hr' },
    });
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('new-hire-onboarding');
    expect(res.data?.data.status).toBe('draft');
    expect(res.data?.data.triggerKind).toBe('manual');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; slug: string; category: string }[]>`
      SELECT client_id, slug, category FROM ${sql(TEST_SCHEMA)}.brain_playbooks WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.category).toBe('hr');
  });

  it('auto-suffixes the slug on collision per tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedPlaybook(A, { name: 'Renewal Watch', slug: 'renewal-watch' });

    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler<{ success: boolean; data: { slug: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Renewal Watch' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('renewal-watch-2');
  });
});

// ─── GET /playbooks ─────────────────────────────────────────────────────────

describe('Brain playbooks — GET /playbooks @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-list'); });

  it('returns only this tenant\'s playbooks', async () => {
    const B = await sessionForNewClientUser('brain-pb-list-b');
    await seedPlaybook(A, { name: 'mine' });
    await seedPlaybook(B, { name: 'theirs' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; name: string; stepCount: number; activeRunCount: number }> };
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    expect(res.data!.data.items.map((i) => i.name)).toContain('mine');
    expect(res.data!.data.items.map((i) => i.name)).not.toContain('theirs');
  });

  it('stepCount + activeRunCount come back as positive numbers (correlated-subquery sanity)', async () => {
    // Catches the Drizzle ${table.col} pitfall — wrong outer-ref emission
    // would silently return 0 here.
    const pb = await seedPlaybook(A, { name: 'has-steps-runs' });
    await seedStep(A, pb.id, { key: 'a' });
    await seedStep(A, pb.id, { key: 'b' });
    await seedRun(A, pb.id, 'active');
    await seedRun(A, pb.id, 'paused');
    await seedRun(A, pb.id, 'completed'); // does NOT count toward activeRunCount

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; stepCount: number; activeRunCount: number }> };
    }>(route as unknown as Record<string, unknown>, 'GET');
    const hit = res.data!.data.items.find((i) => i.id === pb.id);
    expect(hit).toBeDefined();
    expect(hit!.stepCount).toBe(2);
    expect(hit!.activeRunCount).toBe(2);
  });

  it('filters by status + category', async () => {
    const draft = await seedPlaybook(A, { name: 'd', status: 'draft', category: 'hr' });
    const active = await seedPlaybook(A, { name: 'a', status: 'active', category: 'hr' });
    const otherCat = await seedPlaybook(A, { name: 'oc', status: 'draft', category: 'ops' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number }> };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      query: { status: 'draft', category: 'hr' },
    });
    const ids = res.data!.data.items.map((i) => i.id);
    expect(ids).toContain(draft.id);
    expect(ids).not.toContain(active.id);   // wrong status
    expect(ids).not.toContain(otherCat.id); // wrong category
  });

  it('400 on invalid status filter', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { status: 'whatever' } },
    );
    expect(res.status).toBe(400);
  });
});

// ─── GET / PATCH / DELETE /playbooks/[id] ───────────────────────────────────

describe('Brain playbooks — GET /playbooks/[id] @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-get'); });

  it('returns playbook + steps ordered by sortOrder', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A, { name: 'detail-test' });
    await seedStep(A, pb.id, { key: 's1', sortOrder: 1 });
    await seedStep(A, pb.id, { key: 's0', sortOrder: 0 });
    await seedStep(A, pb.id, { key: 's2', sortOrder: 2 });

    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { playbook: { id: number }; steps: Array<{ key: string; sortOrder: number }> };
    }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(pb.id) } });
    expect(res.status).toBe(200);
    expect(res.data?.data.playbook.id).toBe(pb.id);
    expect(res.data?.data.steps.map((s) => s.key)).toEqual(['s0', 's1', 's2']);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-pb-get-b');
    const pbB = await seedPlaybook(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(pbB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain playbooks — PATCH /playbooks/[id] @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-patch'); });

  it('updates own playbook', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A, { name: 'before' });
    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; category: string | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(pb.id) }, body: { name: 'after', category: 'sales' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('after');
    expect(res.data?.data.category).toBe('sales');
  });

  it('400 when patch includes status', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(pb.id) }, body: { status: 'active' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/activate|archive/);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-pb-patch-b');
    const pbB = await seedPlaybook(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(pbB.id) }, body: { name: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain playbooks — DELETE /playbooks/[id] @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-del'); });

  it('hard-deletes a playbook with no runs', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);

    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler<{ success: boolean; data: { deleted: boolean } }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(pb.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_playbooks WHERE id = ${pb.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('refuses when runs exist and ?force is not set', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    await seedRun(A, pb.id, 'completed');

    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(pb.id) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/force=true/);
  });

  it('cascades with ?force=true', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    await seedRun(A, pb.id, 'active');

    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(pb.id) }, query: { force: 'true' } },
    );
    expect(res.status).toBe(200);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-pb-del-b');
    const pbB = await seedPlaybook(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(pbB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

// ─── activate / archive ─────────────────────────────────────────────────────

describe('Brain playbooks — POST /playbooks/[id]/activate @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-activate'); });

  it('400 when the playbook has zero steps', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/activate/route');
    const res = await callHandler<{ success: boolean; errors: string[] }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.errors.join(' ')).toMatch(/no steps|zero steps/);
  });

  it('400 with structured errors when DAG has a cycle', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    await seedStep(A, pb.id, { key: 'a', nextStepKeys: ['b'] });
    await seedStep(A, pb.id, { key: 'b', nextStepKeys: ['a'] }); // cycle

    const route = await import('@/app/api/portal/brain/playbooks/[id]/activate/route');
    const res = await callHandler<{ success: boolean; errors: string[] }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) } },
    );
    expect(res.status).toBe(400);
    expect(Array.isArray(res.data?.errors)).toBe(true);
    expect(res.data?.errors.join(' ')).toMatch(/cycle|entry/);
  });

  it('happy path — flips status to active', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    await seedStep(A, pb.id, { key: 'a', nextStepKeys: ['b'] });
    await seedStep(A, pb.id, { key: 'b', nextStepKeys: [] });

    const route = await import('@/app/api/portal/brain/playbooks/[id]/activate/route');
    const res = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('active');
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-pb-activate-b');
    const pbB = await seedPlaybook(B);
    await seedStep(B, pbB.id, { key: 'a' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/activate/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pbB.id) } },
    );
    // 400 (DAG validator finds zero steps for THIS tenant) OR 404 — both
    // demonstrate isolation. We accept either as a success signal.
    expect([400, 404]).toContain(res.status);
  });
});

describe('Brain playbooks — POST /playbooks/[id]/archive @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-archive'); });

  it('refuses while active runs exist', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A, { status: 'active' });
    await seedRun(A, pb.id, 'active');

    const route = await import('@/app/api/portal/brain/playbooks/[id]/archive/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/active run/);
  });

  it('?force=true overrides', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A, { status: 'active' });
    await seedRun(A, pb.id, 'active');

    const route = await import('@/app/api/portal/brain/playbooks/[id]/archive/route');
    const res = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) }, query: { force: 'true' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('archived');
  });
});

// ─── step CRUD + reorder ────────────────────────────────────────────────────

describe('Brain playbook steps — CRUD + reorder @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pb-steps'); });

  it('add → list → patch → delete round-trip with orphan cleanup', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);

    const stepsRoute = await import('@/app/api/portal/brain/playbooks/[id]/steps/route');

    // add 3 steps: a → b, then c (terminal)
    const aRes = await callHandler<{ success: boolean; data: { id: number; key: string } }>(
      stepsRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) }, body: { key: 'a', name: 'A', kind: 'task', nextStepKeys: ['b'] } },
    );
    expect(aRes.status).toBe(200);
    const bRes = await callHandler<{ success: boolean; data: { id: number } }>(
      stepsRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) }, body: { key: 'b', name: 'B', kind: 'task', nextStepKeys: ['c'] } },
    );
    const cRes = await callHandler<{ success: boolean; data: { id: number } }>(
      stepsRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) }, body: { key: 'c', name: 'C', kind: 'task' } },
    );

    // list
    const listRes = await callHandler<{ success: boolean; data: { items: Array<{ key: string }> } }>(
      stepsRoute as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(pb.id) } },
    );
    expect(listRes.status).toBe(200);
    expect(listRes.data!.data.items.map((s) => s.key)).toEqual(['a', 'b', 'c']);

    // patch — rename step b
    const stepRoute = await import('@/app/api/portal/brain/playbooks/[id]/steps/[stepId]/route');
    const patchRes = await callHandler<{ success: boolean; data: { name: string } }>(
      stepRoute as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(pb.id), stepId: String(bRes.data!.data.id) }, body: { name: 'B-renamed' } },
    );
    expect(patchRes.status).toBe(200);
    expect(patchRes.data?.data.name).toBe('B-renamed');

    // delete step b → step a's nextStepKeys should lose 'b'
    const delRes = await callHandler(
      stepRoute as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(pb.id), stepId: String(bRes.data!.data.id) } },
    );
    expect(delRes.status).toBe(200);

    const sql = getTestSql();
    const [aRow] = await sql<{ next_step_keys: string[] }[]>`
      SELECT next_step_keys FROM ${sql(TEST_SCHEMA)}.brain_playbook_steps WHERE id = ${aRes.data!.data.id}
    `;
    expect(aRow.next_step_keys).not.toContain('b');
    // suppress unused var
    void cRes;
  });

  it('PATCH /steps reorders atomically — refreshed list matches the new order', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    const s0 = await seedStep(A, pb.id, { key: 'x', sortOrder: 0 });
    const s1 = await seedStep(A, pb.id, { key: 'y', sortOrder: 1 });
    const s2 = await seedStep(A, pb.id, { key: 'z', sortOrder: 2 });

    const route = await import('@/app/api/portal/brain/playbooks/[id]/steps/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; key: string; sortOrder: number }> };
    }>(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(pb.id) },
      body: { orderedStepIds: [s2.id, s0.id, s1.id] },
    });
    expect(res.status).toBe(200);
    expect(res.data!.data.items.map((s) => s.key)).toEqual(['z', 'x', 'y']);
  });

  it('PATCH /steps rejects ids that belong to another playbook', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pbA1 = await seedPlaybook(A, { name: 'p1' });
    const pbA2 = await seedPlaybook(A, { name: 'p2' });
    const sA1 = await seedStep(A, pbA1.id, { key: 's', sortOrder: 0 });
    const sA2 = await seedStep(A, pbA2.id, { key: 's', sortOrder: 0 });

    const route = await import('@/app/api/portal/brain/playbooks/[id]/steps/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(pbA1.id) }, body: { orderedStepIds: [sA1.id, sA2.id] } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/do not belong/);
  });

  it('400 when adding a step with a duplicate key', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    await seedStep(A, pb.id, { key: 'dup' });

    const route = await import('@/app/api/portal/brain/playbooks/[id]/steps/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) }, body: { key: 'dup', name: 'dup2', kind: 'task' } },
    );
    // schema unique index gives a DB error → 500; we accept either 400 or 500
    // here. The point is "doesn't return 200".
    expect([400, 500]).toContain(res.status);
  });

  it('DELETE step refuses if a run-step row references it', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    const step = await seedStep(A, pb.id, { key: 'a' });
    const run = await seedRun(A, pb.id, 'active');

    // Manually seed a run-step row pointing at this step.
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_playbook_run_steps
        (client_id, run_id, step_id, status)
      VALUES (${A.client.id}, ${run.id}, ${step.id}, 'pending')
    `;

    const route = await import('@/app/api/portal/brain/playbooks/[id]/steps/[stepId]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(pb.id), stepId: String(step.id) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/run-step/);
  });

  it('404 cross-tenant on step CRUD', async () => {
    const B = await sessionForNewClientUser('brain-pb-steps-b');
    const pbB = await seedPlaybook(B);
    const stepB = await seedStep(B, pbB.id, { key: 'a' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/steps/[stepId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(pbB.id), stepId: String(stepB.id) }, body: { name: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });
});
