// @vitest-environment node
/**
 * Unit tests for /api/surveys/[slug]/partial (RESP-02).
 *
 * Scope mirrors `cron-failing-automations-notify.test.ts`: the SQL semantics
 * (drizzle chain shape, real `onConflictDoUpdate` target columns at the DB
 * layer) belong to the integration suite. Here we lock in:
 *   - CORS preflight (sandboxed-iframe respondents send `Origin: null`)
 *   - sessionId validation (length cap, charset)
 *   - missing / inactive survey gates (POST 403 vs GET 404)
 *   - completed-partial → GET returns null (don't let the client resume)
 *   - upsert path called with the expected conflict target on POST
 *
 * The db chain itself is stubbed (`select → from → where → limit`) so the
 * route's branches can be exercised without a live Postgres.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // select chain: db.select(...).from(...).where(...).limit(...)
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  // insert chain: db.insert(...).values(...).onConflictDoUpdate(...)
  const onConflictDoUpdateMock = vi.fn(() => Promise.resolve());
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  return {
    limitMock,
    whereMock,
    fromMock,
    selectMock,
    insertMock,
    valuesMock,
    onConflictDoUpdateMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () =>
    new Headers({
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'unit-test/1.0',
    }),
  ),
}));

const {
  limitMock,
  whereMock,
  fromMock,
  selectMock,
  insertMock,
  valuesMock,
  onConflictDoUpdateMock,
} = mocks;

// Static import — vi.mock is hoisted, so by the time this evaluates the
// `@/lib/db` and `next/headers` modules are already the mocked versions.
// Importing once at module load avoids paying the per-test dynamic-import
// compile cost (which can blow the default 5 s timeout when this file runs
// alongside the full unit suite).
import { OPTIONS, GET, POST } from '@/app/api/surveys/[slug]/partial/route';

const PARAMS = { params: Promise.resolve({ slug: 'feedback-2026' }) };

function makePostBody(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'a-b_C.1234567890',
    answers: { q1: 'hello' },
    lastPage: 2,
    ...overrides,
  };
}

beforeEach(() => {
  selectMock.mockClear();
  fromMock.mockClear();
  whereMock.mockClear();
  limitMock.mockReset();
  insertMock.mockClear();
  valuesMock.mockClear();
  onConflictDoUpdateMock.mockClear();
  onConflictDoUpdateMock.mockImplementation(() => Promise.resolve());
});

describe('OPTIONS /api/surveys/[slug]/partial', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });
});

describe('GET /api/surveys/[slug]/partial', () => {
  it('returns data: null when sessionId is missing / invalid', async () => {
    // No DB call should happen — the validator short-circuits.
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/partial'),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown };
    expect(json).toEqual({ success: true, data: null });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns data: null for sessionId with invalid charset (no DB roundtrip)', async () => {
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/partial?sessionId=' + encodeURIComponent('bad id with spaces')),
      PARAMS,
    );
    const json = (await res.json()) as { data: unknown };
    expect(json.data).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('404s when the survey slug does not exist', async () => {
    // First (and only) select.from.where.limit → no survey row.
    limitMock.mockResolvedValueOnce([]);
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/partial?sessionId=valid_session-123'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('returns data: null when the partial row is already completed', async () => {
    limitMock
      .mockResolvedValueOnce([{ id: 42, status: 'active' }]) // survey lookup
      .mockResolvedValueOnce([
        {
          answers: { q1: 'done' },
          lastPage: 5,
          respondentEmail: null,
          completed: true,
          updatedAt: new Date('2026-05-01T00:00:00Z'),
        },
      ]);
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/partial?sessionId=valid_session-123'),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown };
    expect(json).toEqual({ success: true, data: null });
  });

  it('returns the partial payload when present and not completed', async () => {
    const updatedAt = new Date('2026-05-01T12:34:56Z');
    limitMock
      .mockResolvedValueOnce([{ id: 42, status: 'active' }])
      .mockResolvedValueOnce([
        {
          answers: { q1: 'hello' },
          lastPage: 2,
          respondentEmail: 'r@example.com',
          completed: false,
          updatedAt,
        },
      ]);
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/partial?sessionId=valid_session-123'),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { answers: unknown; lastPage: number; respondentEmail: string };
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      answers: { q1: 'hello' },
      lastPage: 2,
      respondentEmail: 'r@example.com',
    });
  });
});

describe('POST /api/surveys/[slug]/partial', () => {
  it('400s on invalid JSON body', async () => {
    const res = await POST(
      new Request('http://x/api/surveys/feedback-2026/partial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; message?: string };
    expect(json.success).toBe(false);
    expect(json.message).toMatch(/invalid json/i);
  });

  it('400s when sessionId is too long (> 64 chars)', async () => {
    const res = await POST(
      new Request('http://x/api/surveys/feedback-2026/partial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makePostBody({ sessionId: 'a'.repeat(65) })),
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { message?: string };
    expect(json.message).toMatch(/sessionid/i);
    // The validator runs before any DB hit.
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('400s when sessionId contains disallowed characters', async () => {
    const res = await POST(
      new Request('http://x/api/surveys/feedback-2026/partial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makePostBody({ sessionId: 'has spaces!' })),
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('404s when the survey slug does not exist', async () => {
    limitMock.mockResolvedValueOnce([]); // no survey row
    const res = await POST(
      new Request('http://x/api/surveys/feedback-2026/partial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makePostBody()),
      }),
      PARAMS,
    );
    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('403s when the survey is not active (no upsert)', async () => {
    limitMock.mockResolvedValueOnce([{ id: 42, status: 'draft' }]);
    const res = await POST(
      new Request('http://x/api/surveys/feedback-2026/partial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makePostBody()),
      }),
      PARAMS,
    );
    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('upserts via onConflictDoUpdate with the (surveyId, sessionId) conflict target', async () => {
    limitMock.mockResolvedValueOnce([{ id: 42, status: 'active' }]);
    const res = await POST(
      new Request('http://x/api/surveys/feedback-2026/partial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          makePostBody({
            respondentEmail: '  user@example.com  ',
            source: 'email',
            sourceId: 'seq-1',
          }),
        ),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);

    // values(...) called with the parsed body (including trimmed email + ip/ua
    // pulled from our mocked `headers()`).
    const valuesArg = valuesMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(valuesArg).toMatchObject({
      surveyId: 42,
      sessionId: 'a-b_C.1234567890',
      answers: { q1: 'hello' },
      lastPage: 2,
      respondentEmail: 'user@example.com',
      source: 'email',
      sourceId: 'seq-1',
      ipAddress: '203.0.113.7',
      userAgent: 'unit-test/1.0',
    });

    // onConflictDoUpdate(...) called with a `target` array containing the two
    // schema columns and a `set` patch — the exact column identity belongs to
    // the integration layer, so just shape-check here.
    const conflictArg = onConflictDoUpdateMock.mock.calls[0]![0] as {
      target: unknown;
      set: Record<string, unknown>;
    };
    expect(Array.isArray(conflictArg.target)).toBe(true);
    expect((conflictArg.target as unknown[]).length).toBe(2);
    expect(conflictArg.set).toMatchObject({
      answers: { q1: 'hello' },
      lastPage: 2,
      respondentEmail: 'user@example.com',
      source: 'email',
      sourceId: 'seq-1',
    });
    expect(conflictArg.set.updatedAt).toBeInstanceOf(Date);
  });
});
