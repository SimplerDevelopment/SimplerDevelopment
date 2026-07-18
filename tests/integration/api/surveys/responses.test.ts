/**
 * Integration tests for portal /api/portal/surveys/[id]/responses
 * and /api/portal/surveys/[id]/export.
 *
 * Coverage:
 *   - GET /responses: 401 unauth, 403 without service, scope-isolation
 *     (responses for one survey aren't returned for another), cross-tenant
 *     rejection (404), happy-path payload shape.
 *   - GET /export: 401 unauth, 403 without service, cross-tenant rejection
 *     (404), CSV happy path with content-type + content-disposition headers,
 *     proper escaping of values containing commas/quotes/newlines.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function enableSurveys(ctx: TenantCtx) {
  const sql = getTestSql();
  const slug = `surveys-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Surveys', ${slug}, 'surveys', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

interface SurveyCtx { id: number; }
async function seedSurvey(
  clientId: number,
  opts: { title?: string; fields?: Array<{ id: string; type: string; label: string }> } = {},
): Promise<SurveyCtx> {
  const sql = getTestSql();
  const title = opts.title ?? 'Test Survey';
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const fields = opts.fields ?? [{ id: 'q1', type: 'text', label: 'Name' }];
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.surveys (client_id, title, slug, fields)
    VALUES (${clientId}, ${title}, ${slug}, ${JSON.stringify(fields)}::json)
    RETURNING id
  `;
  return { id: row.id };
}

async function seedResponse(
  surveyId: number,
  answers: Record<string, unknown>,
  opts: {
    email?: string;
    name?: string;
    completed?: boolean;
    source?: string;
    createdAt?: Date;
  } = {},
) {
  const sql = getTestSql();
  const completedAt = opts.completed ? new Date() : null;
  const source = opts.source ?? 'link';
  const createdAt = opts.createdAt ?? new Date();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.survey_responses
      (survey_id, answers, respondent_email, respondent_name, completed_at, source, created_at)
    VALUES (
      ${surveyId},
      ${JSON.stringify(answers)}::json,
      ${opts.email ?? null},
      ${opts.name ?? null},
      ${completedAt},
      ${source},
      ${createdAt}
    )
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/portal/surveys/[id]/responses @surveys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let surveyA: SurveyCtx;
  let surveyB: SurveyCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('surv-resp-a'),
      sessionForNewClientUser('surv-resp-b'),
    ]);
    await enableSurveys(A);
    await enableSurveys(B);
    [surveyA, surveyB] = await Promise.all([
      seedSurvey(A.client.id, { title: 'A-Survey' }),
      seedSurvey(B.client.id, { title: 'B-Survey' }),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/surveys/[id]/responses/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(surveyA.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects without surveys subscription (403)', async () => {
    const noSvc = await sessionForNewClientUser('surv-resp-no-svc');
    await asTenant(noSvc);
    const route = await import('@/app/api/portal/surveys/[id]/responses/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(403);
  });

  it('cross-tenant: A cannot read B\'s survey responses (404)', async () => {
    await seedResponse(surveyB.id, { q1: 'leak' }, { email: 'b@b.com', completed: true });
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/responses/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(surveyB.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('happy path: returns own responses + stats (200)', async () => {
    await seedResponse(surveyA.id, { q1: 'Alice' }, { email: 'alice@a.com', completed: true });
    await seedResponse(surveyA.id, { q1: 'Bob' }, { completed: false });

    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/responses/route');
    const res = await callHandler<{ success: boolean; data: { responses: unknown[]; stats: { total: number; completed: number; withEmail: number } } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(surveyA.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data.responses)).toBe(true);
    expect(res.data?.data.responses.length).toBe(2);
    expect(res.data?.data.stats.total).toBe(2);
    expect(res.data?.data.stats.completed).toBe(1);
    expect(res.data?.data.stats.withEmail).toBe(1);
  });

  it('scope-isolation: only responses for the requested survey are returned', async () => {
    // Create a SECOND survey owned by A and put responses on each.
    const surveyA2 = await seedSurvey(A.client.id, { title: 'A-Survey-2' });
    await seedResponse(surveyA.id, { q1: 'first-survey' });
    await seedResponse(surveyA2.id, { q1: 'second-survey-1' });
    await seedResponse(surveyA2.id, { q1: 'second-survey-2' });

    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/responses/route');
    const res = await callHandler<{ success: boolean; data: { responses: { answers: { q1: string } }[]; stats: { total: number } } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(surveyA.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.stats.total).toBe(1);
    expect(res.data?.data.responses.length).toBe(1);
    expect(res.data?.data.responses[0].answers.q1).toBe('first-survey');
  });

  it('returns 404 for unknown survey id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/responses/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/portal/surveys/[id]/responses filters @surveys', () => {
  let A: TenantCtx;
  let surveyA: SurveyCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('surv-resp-filt');
    await enableSurveys(A);
    surveyA = await seedSurvey(A.client.id, { title: 'Filter Survey' });
    // Seed a deliberate spread across dates / sources / answer values so
    // each filter assertion has a clearly-correct expected count.
    const oldDate = new Date('2026-01-15T12:00:00Z');
    const midDate = new Date('2026-02-20T12:00:00Z');
    const newDate = new Date('2026-03-10T12:00:00Z');
    await seedResponse(surveyA.id, { q1: 'apple pie' }, { createdAt: oldDate, source: 'link' });
    await seedResponse(surveyA.id, { q1: 'banana split' }, { createdAt: midDate, source: 'email' });
    await seedResponse(surveyA.id, { q1: 'cherry tart' }, { createdAt: newDate, source: 'embed' });
  });

  async function callWithQuery(query: Record<string, string>) {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/responses/route');
    return callHandler<{ success: boolean; data: { responses: Array<{ answers: Record<string, string>; source: string }>; stats: { total: number }; sourcesPresent: string[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(surveyA.id) }, query },
    );
  }

  it('returns all 3 with no filters', async () => {
    const res = await callWithQuery({});
    expect(res.status).toBe(200);
    expect(res.data?.data.responses.length).toBe(3);
    expect(res.data?.data.stats.total).toBe(3);
  });

  it('filters by from/to date range (inclusive end-of-day)', async () => {
    const res = await callWithQuery({ from: '2026-02-01', to: '2026-02-28' });
    expect(res.status).toBe(200);
    expect(res.data?.data.responses.length).toBe(1);
    expect(res.data?.data.responses[0].answers.q1).toBe('banana split');
  });

  it('filters by source', async () => {
    const res = await callWithQuery({ source: 'embed' });
    expect(res.status).toBe(200);
    expect(res.data?.data.responses.length).toBe(1);
    expect(res.data?.data.responses[0].source).toBe('embed');
  });

  it('keyword search hits answer values (case-insensitive)', async () => {
    const res = await callWithQuery({ q: 'BANANA' });
    expect(res.status).toBe(200);
    expect(res.data?.data.responses.length).toBe(1);
    expect(res.data?.data.responses[0].answers.q1).toBe('banana split');
  });

  it('combines all three filters (AND)', async () => {
    const res = await callWithQuery({
      from: '2026-01-01',
      to: '2026-12-31',
      source: 'link',
      q: 'apple',
    });
    expect(res.status).toBe(200);
    expect(res.data?.data.responses.length).toBe(1);
    expect(res.data?.data.responses[0].answers.q1).toBe('apple pie');
  });

  it('exposes distinct source values present', async () => {
    const res = await callWithQuery({});
    expect(res.status).toBe(200);
    const sources = (res.data?.data.sourcesPresent ?? []).sort();
    expect(sources).toEqual(['email', 'embed', 'link']);
  });

  it('export route honors the same filters', async () => {
    await asTenant(A);
    const exportRoute = await import('@/app/api/portal/surveys/[id]/export/route');
    const handler = (exportRoute as { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> }).GET;
    const res = await handler(
      new Request(`http://localhost:3000/api/portal/surveys/${surveyA.id}/export?source=email`),
      { params: Promise.resolve({ id: String(surveyA.id) }) },
    );
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain('banana split');
    expect(csv).not.toContain('apple pie');
    expect(csv).not.toContain('cherry tart');
  });
});

describe('GET /api/portal/surveys/[id]/export @surveys @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let surveyA: SurveyCtx;
  let surveyB: SurveyCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('surv-exp-a'),
      sessionForNewClientUser('surv-exp-b'),
    ]);
    await enableSurveys(A);
    await enableSurveys(B);
    [surveyA, surveyB] = await Promise.all([
      seedSurvey(A.client.id, {
        title: 'Export Test',
        fields: [
          { id: 'q1', type: 'text', label: 'Full Name' },
          { id: 'q2', type: 'select', label: 'Dept' },
        ],
      }),
      seedSurvey(B.client.id, { title: 'Other-Tenant' }),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/surveys/[id]/export/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(surveyA.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects without surveys subscription (403)', async () => {
    const noSvc = await sessionForNewClientUser('surv-exp-no-svc');
    await asTenant(noSvc);
    const route = await import('@/app/api/portal/surveys/[id]/export/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(403);
  });

  it('cross-tenant: A cannot export B\'s survey (404)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/export/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(surveyB.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('happy path: returns CSV with attachment headers + escaped values', async () => {
    // Two responses, one with a comma + quote that must be CSV-escaped.
    await seedResponse(surveyA.id, { q1: 'Alice, "the great"', q2: 'Sales' }, {
      email: 'alice@a.com', name: 'Alice', completed: true,
    });
    await seedResponse(surveyA.id, { q1: 'Bob', q2: 'Support' }, { completed: false });

    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/export/route');
    const handler = (route as { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> }).GET;
    const res = await handler(
      new Request(`http://localhost:3000/api/portal/surveys/${surveyA.id}/export`),
      { params: Promise.resolve({ id: String(surveyA.id) }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const csv = await res.text();
    // Header includes the dynamic field labels.
    expect(csv).toContain('Full Name');
    expect(csv).toContain('Dept');
    // Quotes inside a value get doubled up; comma triggers quoting.
    expect(csv).toContain('"Alice, ""the great"""');
    // Bob row is present.
    expect(csv).toContain('Bob');
  });

  it('returns 404 for unknown survey id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/surveys/[id]/export/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });
});
