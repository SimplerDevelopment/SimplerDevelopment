/**
 * Public A/B goal-event endpoint — POST /api/public/ab/event
 *
 * Contract under test:
 *   - Records a goal event row in `ab_events` for a running experiment
 *   - Idempotent: a duplicate (experimentId, visitorId, kind) returns
 *     `success: true` with `duplicated: true` and does NOT insert a 2nd row
 *   - Unknown experimentId → 404
 *   - Inactive experiment ('draft' or 'archived') → 409 (status route guard;
 *     the route accepts both 'running' and 'completed' so dashboards loaded
 *     just after a stop don't lose late events)
 *   - Validation: invalid visitor format / missing kind / unknown kind → 400
 */
import { describe, it, expect } from 'vitest';
import { callHandler } from '../../../../helpers/call-handler';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedExperiment(opts: {
  status?: 'draft' | 'running' | 'completed' | 'archived';
  goalMetric?: 'page_view' | 'cta_click' | 'form_submit';
} = {}): Promise<{ experimentId: number; postId: number; siteId: number; clientId: number }> {
  const sql = getTestSql();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const status = opts.status ?? 'running';

  // Minimum tenancy chain — clients → client_websites → posts → ab_experiments.
  // The public event endpoint does NOT require a session, but FK constraints
  // do require these rows to exist.
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES ('AB Owner', ${`abowner-${stamp}@test.local`}, 'x', 'editor', true)
    RETURNING id
  `;
  const [c] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.clients (user_id, company)
    VALUES (${u.id}, ${`AB Co ${stamp}`})
    RETURNING id
  `;
  const [w] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${c.id}, ${`ab-site-${stamp}`}, ${`ab-${stamp}.test`})
    RETURNING id
  `;
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (
      website_id, title, slug, post_type, content, published
    ) VALUES (
      ${w.id}, 'AB Page', ${`ab-page-${stamp}`}, 'blog',
      ${JSON.stringify({ blocks: [], version: '1.0' })}, true
    ) RETURNING id
  `;
  const [exp] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.ab_experiments (
      post_id, name, status, variant_split, goal_metric, created_by
    ) VALUES (
      ${p.id}, 'Test Experiment', ${status},
      ${JSON.stringify({ a: 50, b: 50 })}::jsonb,
      ${opts.goalMetric ?? 'page_view'}, ${u.id}
    ) RETURNING id
  `;
  // Default a/b variants so variantKey lookups succeed.
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.ab_variants (experiment_id, key, label)
    VALUES (${exp.id}, 'a', 'Control'), (${exp.id}, 'b', 'Variant B')
  `;
  return { experimentId: exp.id, postId: p.id, siteId: w.id, clientId: c.id };
}

const VISITOR_A = '11111111-2222-3333-4444-555555555555';
const VISITOR_B = '66666666-7777-8888-9999-aaaaaaaaaaaa';

describe('POST /api/public/ab/event @ab @public', () => {
  it('records a goal event row for a running experiment', async () => {
    const { experimentId } = await seedExperiment({ status: 'running' });
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; data?: { recorded?: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.recorded).toBe(true);

    const sql = getTestSql();
    const rows = await sql<{ kind: string; variant_key: string; visitor_id: string }[]>`
      SELECT kind, variant_key, visitor_id
      FROM ${sql(TEST_SCHEMA)}.ab_events
      WHERE experiment_id = ${experimentId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('goal');
    expect(rows[0].variant_key).toBe('a');
    expect(rows[0].visitor_id).toBe(VISITOR_A);
  });

  it('is idempotent on duplicate (experimentId, visitorId, kind)', async () => {
    const { experimentId } = await seedExperiment({ status: 'running' });
    const route = await import('@/app/api/public/ab/event/route');

    const first = await callHandler<{ success: boolean; data?: { recorded?: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'b', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data?.recorded).toBe(true);

    const second = await callHandler<{ success: boolean; data?: { duplicated?: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'b', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.success).toBe(true);
    expect(second.data?.data?.duplicated).toBe(true);

    const sql = getTestSql();
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM ${sql(TEST_SCHEMA)}.ab_events
      WHERE experiment_id = ${experimentId} AND visitor_id = ${VISITOR_A} AND kind = 'goal'
    `;
    expect(count).toBe(1);
  });

  it('still records when a different visitor fires the same goal kind', async () => {
    const { experimentId } = await seedExperiment({ status: 'running' });
    const route = await import('@/app/api/public/ab/event/route');

    await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'goal' },
    });
    const second = await callHandler<{ success: boolean; data?: { recorded?: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: VISITOR_B, kind: 'goal' } },
    );
    expect(second.data?.data?.recorded).toBe(true);

    const sql = getTestSql();
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM ${sql(TEST_SCHEMA)}.ab_events
      WHERE experiment_id = ${experimentId} AND kind = 'goal'
    `;
    expect(count).toBe(2);
  });

  it('also de-dupes view events from the same visitor', async () => {
    const { experimentId } = await seedExperiment({ status: 'running' });
    const route = await import('@/app/api/public/ab/event/route');
    await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'view' },
    });
    const dup = await callHandler<{ success: boolean; data?: { duplicated?: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'view' } },
    );
    expect(dup.data?.data?.duplicated).toBe(true);
  });

  it('returns 404 for an unknown experimentId', async () => {
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId: 99999999, variantKey: 'a', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
    expect(res.data?.error).toBe('not_found');
  });

  it('rejects an event for a draft experiment (409 not_active)', async () => {
    const { experimentId } = await seedExperiment({ status: 'draft' });
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.error).toBe('not_active');
  });

  it('rejects an event for an archived experiment (409 not_active)', async () => {
    const { experimentId } = await seedExperiment({ status: 'archived' });
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.error).toBe('not_active');
  });

  it('STILL accepts events for completed experiments (late-arriving clients)', async () => {
    // Per the route comment: completed is allowed so dashboards loaded just
    // after a stop don't lose in-flight events.
    const { experimentId } = await seedExperiment({ status: 'completed' });
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; data?: { recorded?: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.recorded).toBe(true);
  });

  it('rejects malformed visitor id (400)', async () => {
    const { experimentId } = await seedExperiment({ status: 'running' });
    const route = await import('@/app/api/public/ab/event/route');
    // Route rule: ^[a-zA-Z0-9-]{8,64}$ — empty / containing illegal chars / too short fails.
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: 'has spaces and !chars', kind: 'goal' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_visitor');
  });

  it('rejects unknown event kind (400)', async () => {
    const { experimentId } = await seedExperiment({ status: 'running' });
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId, variantKey: 'a', visitorId: VISITOR_A, kind: 'click' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_payload');
  });

  it('rejects invalid experimentId (400)', async () => {
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { experimentId: 0, variantKey: 'a', visitorId: VISITOR_A, kind: 'goal' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_experiment_id');
  });

  it('rejects bodies that are not JSON (400)', async () => {
    const route = await import('@/app/api/public/ab/event/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: 'not json{', headers: { 'content-type': 'application/json' } },
    );
    expect(res.status).toBe(400);
  });
});
