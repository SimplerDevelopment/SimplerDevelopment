/**
 * Brain playbook runs — REST round-trip across the start → advance →
 * complete-step → abort lifecycle.
 *
 * Contract:
 *   - 401 unauth on every route
 *   - 400 invalid id / body
 *   - 404 cross-tenant on GET/advance/abort/complete/skip
 *   - POST /playbooks/[id]/start creates a run, scoped to caller tenant
 *   - GET /playbook-runs lists only this tenant's runs
 *   - GET /playbook-runs/[id] returns run + steps + links
 *   - complete-step advances the run; abort halts mid-flight
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

async function seedPlaybook(
  ctx: TenantCtx,
  opts: { name?: string; status?: 'draft' | 'active' | 'archived' } = {},
): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const name = opts.name ?? `pb-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_playbooks
      (client_id, name, slug, status, trigger_kind, default_topic_ids, source)
    VALUES
      (${ctx.client.id}, ${name}, ${slug}, ${opts.status ?? 'active'}, 'manual', '[]'::jsonb, 'manual')
    RETURNING id, slug
  `;
  return row;
}

async function seedStep(
  ctx: TenantCtx,
  playbookId: number,
  step: {
    key: string;
    name: string;
    kind: 'task' | 'note' | 'meeting' | 'decision' | 'review_item' | 'wait' | 'branch';
    config?: Record<string, unknown>;
    condition?: Record<string, unknown> | null;
    nextStepKeys?: string[];
    sortOrder?: number;
  },
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_playbook_steps
      (client_id, playbook_id, key, name, kind, config, condition, next_step_keys, sort_order)
    VALUES (
      ${ctx.client.id},
      ${playbookId},
      ${step.key},
      ${step.name},
      ${step.kind},
      ${sql.json((step.config ?? {}) as unknown as Parameters<typeof sql.json>[0])},
      ${step.condition === undefined || step.condition === null ? null : sql.json(step.condition as unknown as Parameters<typeof sql.json>[0])},
      ${sql.json((step.nextStepKeys ?? []) as unknown as Parameters<typeof sql.json>[0])},
      ${step.sortOrder ?? 0}
    )
    RETURNING id
  `;
  return row;
}

// ─── Auth gate ─────────────────────────────────────────────────────────────

describe('Brain playbook runs — auth @brain @playbooks', () => {
  it('GET /playbook-runs 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/playbook-runs/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('POST /playbooks/[id]/start 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: '1' },
      body: { label: 'x' },
    });
    expect(res.status).toBe(401);
  });
});

// ─── Lifecycle ─────────────────────────────────────────────────────────────

describe('Brain playbook runs — start lifecycle @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pbrun-start'); });

  it('400 on invalid playbook id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: 'abc' },
      body: { label: 'x' },
    });
    expect(res.status).toBe(400);
  });

  it('400 when label is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(pb.id) },
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it('404 when playbook is in another tenant', async () => {
    const B = await sessionForNewClientUser('brain-pbrun-start-b');
    const pbB = await seedPlaybook(B);
    await seedStep(B, pbB.id, { key: 'a', name: 'A', kind: 'note', config: { title: 'x', body: 'y' } });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(pbB.id) },
      body: { label: 'attempted cross-tenant' },
    });
    expect(res.status).toBe(404);
  });

  it('starts a run, then GET /playbook-runs/[id] returns its detail', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A, { name: 'Onboarding' });
    await seedStep(A, pb.id, {
      key: 'welcome',
      name: 'Welcome note',
      kind: 'note',
      config: { title: 'Welcome {{person.name}}', body: 'Hi {{person.name}}' },
      nextStepKeys: ['wait_7d'],
    });
    await seedStep(A, pb.id, {
      key: 'wait_7d',
      name: 'Wait a week',
      kind: 'wait',
      config: { untilOffsetDays: 7 },
      nextStepKeys: [],
      sortOrder: 1,
    });

    const startRoute = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const startRes = await callHandler<{
      success: boolean;
      data: { runId: number; firstStepKeys: string[]; runStatus: string };
    }>(startRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(pb.id) },
      body: {
        label: 'Onboarding: Jane',
        context: { person: { name: 'Jane' } },
      },
    });
    expect(startRes.status).toBe(200);
    expect(startRes.data?.data.firstStepKeys).toContain('welcome');
    expect(startRes.data?.data.runStatus).toBe('active');
    const runId = startRes.data!.data.runId;

    // Detail
    const detailRoute = await import('@/app/api/portal/brain/playbook-runs/[id]/route');
    const detailRes = await callHandler<{
      success: boolean;
      data: {
        run: { id: number; status: string; clientId: number };
        steps: Array<{ key: string; status: string; kind: string }>;
      };
    }>(detailRoute as unknown as Record<string, unknown>, 'GET', { params: { id: String(runId) } });
    expect(detailRes.status).toBe(200);
    expect(detailRes.data?.data.run.clientId).toBe(A.client.id);
    const stepStatuses = Object.fromEntries(detailRes.data!.data.steps.map((s) => [s.key, s.status]));
    expect(stepStatuses.welcome).toBe('completed');
    expect(stepStatuses.wait_7d).toBe('active');

    // The note step should have produced a brain_note row.
    const sql = getTestSql();
    const noteRows = await sql<{ title: string; body: string }[]>`
      SELECT title, body FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE client_id = ${A.client.id}
    `;
    expect(noteRows.length).toBeGreaterThanOrEqual(1);
    const welcomeNote = noteRows.find((n) => n.title === 'Welcome Jane');
    expect(welcomeNote).toBeDefined();
    expect(welcomeNote!.body).toBe('Hi Jane');
  });

  it('refuses to start a draft playbook', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A, { status: 'draft' });
    await seedStep(A, pb.id, { key: 'a', name: 'A', kind: 'note', config: { title: 'x', body: 'y' } });
    const route = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(pb.id) },
      body: { label: 'attempt' },
    });
    expect(res.status).toBe(400);
  });
});

// ─── List + tenancy ────────────────────────────────────────────────────────

describe('Brain playbook runs — list + tenancy @brain @playbooks', () => {
  it("returns only this tenant's runs", async () => {
    const A = await sessionForNewClientUser('brain-pbrun-list-a');
    const B = await sessionForNewClientUser('brain-pbrun-list-b');

    const pbA = await seedPlaybook(A, { name: 'A-pb' });
    await seedStep(A, pbA.id, { key: 'a', name: 'A', kind: 'note', config: { title: 't', body: 'b' } });
    const pbB = await seedPlaybook(B, { name: 'B-pb' });
    await seedStep(B, pbB.id, { key: 'b', name: 'B', kind: 'note', config: { title: 't', body: 'b' } });

    // Start one run in each tenant.
    mockedAuth.mockResolvedValue(A.session);
    let startRoute = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    await callHandler(startRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(pbA.id) },
      body: { label: 'A-run' },
    });

    mockedAuth.mockResolvedValue(B.session);
    startRoute = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    await callHandler(startRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(pbB.id) },
      body: { label: 'B-run' },
    });

    mockedAuth.mockResolvedValue(A.session);
    const listRoute = await import('@/app/api/portal/brain/playbook-runs/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; label: string; playbookName: string }> };
    }>(listRoute as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    const labels = res.data!.data.items.map((i) => i.label);
    expect(labels).toContain('A-run');
    expect(labels).not.toContain('B-run');
  });
});

// ─── Abort ─────────────────────────────────────────────────────────────────

describe('Brain playbook runs — abort @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pbrun-abort'); });

  it('abort halts mid-flight, sets status=aborted, skips active steps', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    await seedStep(A, pb.id, {
      key: 'wait',
      name: 'Wait step',
      kind: 'wait',
      config: { untilOffsetDays: 7 },
    });

    const startRoute = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const startRes = await callHandler<{ success: boolean; data: { runId: number } }>(
      startRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) }, body: { label: 'r' } },
    );
    const runId = startRes.data!.data.runId;

    const abortRoute = await import('@/app/api/portal/brain/playbook-runs/[id]/abort/route');
    const abortRes = await callHandler<{ success: boolean; data: { id: number; status: string } }>(
      abortRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(runId) }, body: { reason: 'cancel' } },
    );
    expect(abortRes.status).toBe(200);
    expect(abortRes.data?.data.status).toBe('aborted');

    // DB confirms
    const sql = getTestSql();
    const [runRow] = await sql<{ status: string; abort_reason: string | null }[]>`
      SELECT status, abort_reason FROM ${sql(TEST_SCHEMA)}.brain_playbook_runs WHERE id = ${runId}
    `;
    expect(runRow.status).toBe('aborted');
    expect(runRow.abort_reason).toBe('cancel');

    // The wait step that was previously active should now be 'skipped'.
    const stepRows = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.brain_playbook_run_steps WHERE run_id = ${runId}
    `;
    expect(stepRows.every((r) => r.status !== 'active')).toBe(true);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-pbrun-abort-b');
    const pbB = await seedPlaybook(B);
    await seedStep(B, pbB.id, { key: 'a', name: 'A', kind: 'wait', config: { untilOffsetDays: 1 } });
    mockedAuth.mockResolvedValue(B.session);
    const startRoute = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const startRes = await callHandler<{ success: boolean; data: { runId: number } }>(
      startRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pbB.id) }, body: { label: 'r' } },
    );
    const runId = startRes.data!.data.runId;

    mockedAuth.mockResolvedValue(A.session);
    const abortRoute = await import('@/app/api/portal/brain/playbook-runs/[id]/abort/route');
    const res = await callHandler(
      abortRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(runId) }, body: {} },
    );
    expect(res.status).toBe(404);
  });
});

// ─── complete-step lifecycle ───────────────────────────────────────────────

describe('Brain playbook runs — complete step advances the run @brain @playbooks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-pbrun-complete'); });

  it('completing the only active step completes the run', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const pb = await seedPlaybook(A);
    // A single 'task' step — stays active until explicit completion.
    const step1 = await seedStep(A, pb.id, {
      key: 'do_thing',
      name: 'Do the thing',
      kind: 'task',
      config: { title: 'A task' },
    });

    const startRoute = await import('@/app/api/portal/brain/playbooks/[id]/start/route');
    const startRes = await callHandler<{ success: boolean; data: { runId: number } }>(
      startRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(pb.id) }, body: { label: 'r' } },
    );
    const runId = startRes.data!.data.runId;

    const completeRoute = await import('@/app/api/portal/brain/playbook-runs/[id]/steps/[stepId]/complete/route');
    const compRes = await callHandler<{ success: boolean; data: { stepId: number; status: string } }>(
      completeRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(runId), stepId: String(step1.id) }, body: {} },
    );
    expect(compRes.status).toBe(200);
    expect(compRes.data?.data.status).toBe('completed');

    // Run is now completed.
    const sql = getTestSql();
    const [runRow] = await sql<{ status: string; completed_at: Date | null }[]>`
      SELECT status, completed_at FROM ${sql(TEST_SCHEMA)}.brain_playbook_runs WHERE id = ${runId}
    `;
    expect(runRow.status).toBe('completed');
    expect(runRow.completed_at).not.toBeNull();
  });
});
