/**
 * Brain decisions — POST/GET on /decisions, GET/PATCH/DELETE on
 * /decisions/[id], POST on /decisions/[id]/supersede.
 *
 * Contract:
 *   - 401 unauth, 404 cross-tenant on every route
 *   - POST: title / decision / rationale required (400 otherwise); 201 on success
 *   - GET (list): filters by status, reversibility, dateFrom/dateTo; sorted by
 *                 decidedAt desc
 *   - GET (by id): returns ancestors + descendants chain (both directions)
 *   - PATCH: succeeds for allowed fields (title, context, anchors, etc.);
 *           400 when caller tries to mutate decision / rationale / reversibility
 *   - DELETE: soft-rejects (status='rejected'); row preserved
 *   - SUPERSEDE: 201, old row flipped to status='superseded' and
 *                supersededByDecisionId=new.id; second supersede on the same
 *                old id is rejected
 *
 * Mirrors the canonical shape of `tests/integration/api/brain/knowledge.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

type DecisionRow = {
  id: number;
  client_id: number;
  title: string;
  decision: string;
  rationale: string;
  status: string;
  reversibility: string;
  superseded_by_decision_id: number | null;
};

async function seedDecision(
  ctx: TenantCtx,
  overrides: Partial<{
    title: string;
    decision: string;
    rationale: string;
    status: string;
    reversibility: string;
    decidedAt: string;
  }> = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_decisions
      (client_id, title, decision, rationale, status, reversibility, decided_at)
    VALUES (
      ${ctx.client.id},
      ${overrides.title ?? `decision-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.decision ?? 'use stripe'},
      ${overrides.rationale ?? 'already integrated'},
      ${overrides.status ?? 'accepted'},
      ${overrides.reversibility ?? 'two_way'},
      ${overrides.decidedAt ?? new Date().toISOString()}
    )
    RETURNING id
  `;
  return row;
}

// ─── POST /decisions ──────────────────────────────────────────────────────

describe('Brain decisions — POST /decisions @brain @decisions', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-dec-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 't', decision: 'd', rationale: 'r' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when title is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { decision: 'd', rationale: 'r' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/title/i);
  });

  it('400 when decision is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 't', rationale: 'r' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/decision/i);
  });

  it('400 when rationale is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 't', decision: 'd' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/rationale/i);
  });

  it('201 with the new decision scoped to the caller tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler<{
      success: boolean;
      data: { decision: { id: number; title: string; status: string; reversibility: string } };
    }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: {
          title: 'pick stripe',
          decision: 'use stripe for billing',
          rationale: 'we already integrate it',
          reversibility: 'one_way',
        },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.decision.title).toBe('pick stripe');
    expect(res.data?.data.decision.status).toBe('accepted');
    expect(res.data?.data.decision.reversibility).toBe('one_way');

    const sql = getTestSql();
    const [row] = await sql<DecisionRow[]>`
      SELECT * FROM ${sql(TEST_SCHEMA)}.brain_decisions WHERE id = ${res.data!.data.decision.id}
    `;
    expect(row.client_id).toBe(A.client.id);
  });
});

// ─── GET /decisions (list) ────────────────────────────────────────────────

describe('Brain decisions — GET /decisions @brain @decisions', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-dec-list'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('lists only the caller tenant decisions, newest-first', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const B = await sessionForNewClientUser('brain-dec-list-b');
    await seedDecision(A, { title: 'A-old', decidedAt: '2026-01-01T00:00:00.000Z' });
    const newer = await seedDecision(A, { title: 'A-new', decidedAt: '2026-05-01T00:00:00.000Z' });
    await seedDecision(B, { title: 'B-foreign' });

    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; title: string }> };
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    const titles = res.data!.data.items.map((i) => i.title);
    expect(titles).toContain('A-old');
    expect(titles).toContain('A-new');
    expect(titles).not.toContain('B-foreign'); // cross-tenant guard
    // Newest-first: A-new precedes A-old in this list (other ids might be
    // present from earlier tests in the file, so we assert ordering of the
    // two we just inserted).
    const idxNew = res.data!.data.items.findIndex((i) => i.id === newer.id);
    const idxOld = res.data!.data.items.findIndex((i) => i.title === 'A-old');
    expect(idxNew).toBeGreaterThanOrEqual(0);
    expect(idxNew).toBeLessThan(idxOld);
  });

  it('filters by status', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedDecision(A, { title: 'A-accepted', status: 'accepted' });
    await seedDecision(A, { title: 'A-rejected', status: 'rejected' });

    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler<{
      data: { items: Array<{ title: string; status: string }> };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { status: 'rejected' } },
    );
    expect(res.status).toBe(200);
    for (const item of res.data!.data.items) {
      expect(item.status).toBe('rejected');
    }
    const titles = res.data!.data.items.map((i) => i.title);
    expect(titles).toContain('A-rejected');
    expect(titles).not.toContain('A-accepted');
  });

  it('filters by reversibility', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedDecision(A, { title: 'A-one-way', reversibility: 'one_way' });
    await seedDecision(A, { title: 'A-two-way', reversibility: 'two_way' });

    const route = await import('@/app/api/portal/brain/decisions/route');
    const res = await callHandler<{
      data: { items: Array<{ title: string; reversibility: string }> };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { reversibility: 'one_way' } },
    );
    for (const item of res.data!.data.items) {
      expect(item.reversibility).toBe('one_way');
    }
    expect(res.data!.data.items.map((i) => i.title)).toContain('A-one-way');
  });
});

// ─── GET /decisions/[id] (chain) ──────────────────────────────────────────

describe('Brain decisions — GET /decisions/[id] @brain @decisions', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-dec-get'); });

  it('404 cross-tenant — never leaks foreign decisions', async () => {
    const B = await sessionForNewClientUser('brain-dec-get-b');
    const foreign = await seedDecision(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('returns the row + ancestors + descendants chain', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // Build a 3-deep chain v1 ← v2 ← v3 (v1 is the oldest).
    const v1 = await seedDecision(A, { title: 'v1', status: 'superseded' });
    const v2 = await seedDecision(A, { title: 'v2', status: 'superseded' });
    const v3 = await seedDecision(A, { title: 'v3', status: 'accepted' });

    const sql = getTestSql();
    await sql`UPDATE ${sql(TEST_SCHEMA)}.brain_decisions SET superseded_by_decision_id = ${v2.id} WHERE id = ${v1.id}`;
    await sql`UPDATE ${sql(TEST_SCHEMA)}.brain_decisions SET superseded_by_decision_id = ${v3.id} WHERE id = ${v2.id}`;

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        decision: { id: number; title: string };
        ancestors: Array<{ id: number; title: string }>;
        descendants: Array<{ id: number; title: string }>;
      };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(v2.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.decision.id).toBe(v2.id);
    expect(res.data?.data.ancestors.map((a) => a.title)).toEqual(['v1']);
    expect(res.data?.data.descendants.map((d) => d.title)).toEqual(['v3']);
  });
});

// ─── PATCH /decisions/[id] ────────────────────────────────────────────────

describe('Brain decisions — PATCH /decisions/[id] @brain @decisions', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-dec-patch'); });

  it('updates allowed fields (title, context, alternativesConsidered)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const d = await seedDecision(A, { title: 'before' });

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler<{
      data: { decision: { title: string; context: string | null; alternatives_considered?: string | null } };
    }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      {
        params: { id: String(d.id) },
        body: {
          title: 'after',
          context: 'because Q3',
          alternativesConsidered: 'looked at adyen, braintree',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.decision.title).toBe('after');

    const sql = getTestSql();
    const [row] = await sql<{ title: string; context: string | null; alternatives_considered: string | null }[]>`
      SELECT title, context, alternatives_considered FROM ${sql(TEST_SCHEMA)}.brain_decisions WHERE id = ${d.id}
    `;
    expect(row.title).toBe('after');
    expect(row.context).toBe('because Q3');
    expect(row.alternatives_considered).toBe('looked at adyen, braintree');
  });

  it('400 when caller tries to mutate decision text', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const d = await seedDecision(A);

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(d.id) }, body: { decision: 'something else' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/supersede/i);
  });

  it('400 when caller tries to mutate rationale', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const d = await seedDecision(A);

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(d.id) }, body: { rationale: 'new reason' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/supersede/i);
  });

  it('400 when caller tries to mutate reversibility', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const d = await seedDecision(A);

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(d.id) }, body: { reversibility: 'one_way' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/supersede/i);
  });

  it('404 when patching another tenant\'s decision', async () => {
    const B = await sessionForNewClientUser('brain-dec-patch-b');
    const foreign = await seedDecision(B, { title: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(foreign.id) }, body: { title: 'hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.brain_decisions WHERE id = ${foreign.id}
    `;
    expect(row.title).toBe('foreign');
  });
});

// ─── DELETE /decisions/[id] — soft reject ────────────────────────────────

describe('Brain decisions — DELETE /decisions/[id] @brain @decisions', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-dec-del'); });

  it('flips status to rejected; row is preserved', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const d = await seedDecision(A);

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler<{ data: { id: number; status: string } }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(d.id) }, body: { reason: 'no longer relevant' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('rejected');

    const sql = getTestSql();
    const [row] = await sql<{ id: number; status: string }[]>`
      SELECT id, status FROM ${sql(TEST_SCHEMA)}.brain_decisions WHERE id = ${d.id}
    `;
    expect(row.id).toBe(d.id);
    expect(row.status).toBe('rejected');
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-dec-del-b');
    const foreign = await seedDecision(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/decisions/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.brain_decisions WHERE id = ${foreign.id}
    `;
    expect(row.status).toBe('accepted');
  });
});

// ─── POST /decisions/[id]/supersede ───────────────────────────────────────

describe('Brain decisions — POST /decisions/[id]/supersede @brain @decisions', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-dec-sup'); });

  it('creates a new decision + links the old one + 201', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const v1 = await seedDecision(A, { title: 'v1', decision: 'old', rationale: 'old why' });

    const route = await import('@/app/api/portal/brain/decisions/[id]/supersede/route');
    const res = await callHandler<{
      data: {
        previous: { id: number; status: string };
        current: { id: number; title: string; status: string };
      };
    }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(v1.id) },
        body: { title: 'v2', decision: 'new', rationale: 'new why' },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.previous.status).toBe('superseded');
    expect(res.data?.data.current.title).toBe('v2');

    const sql = getTestSql();
    const [old] = await sql<DecisionRow[]>`
      SELECT * FROM ${sql(TEST_SCHEMA)}.brain_decisions WHERE id = ${v1.id}
    `;
    expect(old.status).toBe('superseded');
    expect(old.superseded_by_decision_id).toBe(res.data!.data.current.id);
  });

  it('400 when caller tries to supersede an already-superseded decision', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const v1 = await seedDecision(A, { title: 'v1' });

    const route = await import('@/app/api/portal/brain/decisions/[id]/supersede/route');
    // First supersede succeeds.
    await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(v1.id) },
        body: { title: 'v2', decision: 'd', rationale: 'r' },
      },
    );

    // Second supersede on the SAME old id should now 400.
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(v1.id) },
        body: { title: 'v3', decision: 'd', rationale: 'r' },
      },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/already superseded/i);
  });

  it('400 when caller passes supersededByDecisionId in body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const v1 = await seedDecision(A);

    const route = await import('@/app/api/portal/brain/decisions/[id]/supersede/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(v1.id) },
        body: { title: 't', decision: 'd', rationale: 'r', supersededByDecisionId: 99 },
      },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/automatically/i);
  });

  it('404 when superseding a foreign tenant\'s decision', async () => {
    const B = await sessionForNewClientUser('brain-dec-sup-b');
    const foreign = await seedDecision(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/decisions/[id]/supersede/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(foreign.id) },
        body: { title: 't', decision: 'd', rationale: 'r' },
      },
    );
    expect(res.status).toBe(404);
    expect(res.data?.message).toMatch(/not found/i);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.brain_decisions WHERE id = ${foreign.id}
    `;
    expect(row.status).toBe('accepted'); // untouched
  });
});
