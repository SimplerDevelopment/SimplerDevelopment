// @vitest-environment node
/**
 * Unit tests for /api/surveys/[slug]/results (DIST-03).
 *
 * The route was refactored this session to delegate the actual aggregation to
 * `lib/surveys/aggregate-results.ts`, which already has 100% unit coverage in
 * `aggregateSurveyResults.test.ts`. The route itself is essentially the gate:
 *   - 404 when the survey doesn't exist
 *   - 404 when publishResults is false (no existence leak)
 *   - 200 + delegated aggregate when both pass
 *
 * Anything else (SQL join shape, row counting) belongs to integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // db.select().from().where().limit() (survey lookup) — same chain for the
  // second call (responses fetch), but it has no `.limit()` so we let the
  // `where(...)` call itself be thenable for the responses query.
  const limitMock = vi.fn();

  // The responses query is `db.select(...).from(...).where(...)` (no limit),
  // and the route awaits it directly. Make `where` thenable in that case by
  // returning a function with both `.limit` and `.then`.
  const whereMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const aggregateSurveyResultsMock = vi.fn();

  return {
    limitMock,
    whereMock,
    fromMock,
    selectMock,
    aggregateSurveyResultsMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
  },
}));

vi.mock('@/lib/surveys/aggregate-results', () => ({
  aggregateSurveyResults: mocks.aggregateSurveyResultsMock,
}));

const {
  limitMock,
  whereMock,
  fromMock,
  selectMock,
  aggregateSurveyResultsMock,
} = mocks;

// Static import — vi.mock is hoisted, so by the time this evaluates, the
// `@/lib/db` and `@/lib/surveys/aggregate-results` modules are already the
// mocked versions. Importing once at module load avoids paying the per-test
// dynamic-import compile cost (which can blow the default 5 s test timeout
// when this file runs alongside the full unit suite).
import { GET } from '@/app/api/surveys/[slug]/results/route';

const PARAMS = { params: Promise.resolve({ slug: 'feedback-2026' }) };

beforeEach(() => {
  selectMock.mockClear();
  fromMock.mockClear();
  whereMock.mockReset();
  limitMock.mockReset();
  aggregateSurveyResultsMock.mockReset();
});

/**
 * Set up the two-call select pattern this route uses:
 *   1) survey lookup: select(...).from(...).where(...).limit(1)
 *   2) responses fetch: select(...).from(...).where(...)   (no .limit, awaited)
 *
 * We can't tell them apart by the chain shape, so route the survey result
 * through `.limit()` and the responses through `where()`'s own thenable.
 */
function setupSelectChain(surveyRows: unknown[], responseRows: unknown[]) {
  limitMock.mockResolvedValueOnce(surveyRows);
  // First call: chain reaches .limit(1) — already wired above.
  // Second call: chain awaits the `.where(...)` return. Make this call return
  // an awaitable that resolves to `responseRows`.
  let callCount = 0;
  whereMock.mockImplementation(() => {
    callCount += 1;
    if (callCount === 1) {
      // Survey lookup path — caller will call .limit(1) on this.
      return { limit: limitMock };
    }
    // Responses path — caller awaits this directly.
    return Promise.resolve(responseRows) as never;
  });
}

describe('GET /api/surveys/[slug]/results', () => {
  it('404s when the survey slug does not exist', async () => {
    setupSelectChain([], []);
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/results'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
    expect(aggregateSurveyResultsMock).not.toHaveBeenCalled();
  });

  it('404s when publishResults is false (no existence leak)', async () => {
    setupSelectChain(
      [
        {
          id: 1,
          title: 'Feedback',
          description: 'd',
          fields: [],
          publishResults: false,
        },
      ],
      [],
    );
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/results'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    // Body must be identical to the missing-survey response so callers can't
    // distinguish a private-results survey from a non-existent one.
    const json = (await res.json()) as { success: boolean; message?: string };
    expect(json.success).toBe(false);
    expect(json.message).toMatch(/not found/i);
    expect(aggregateSurveyResultsMock).not.toHaveBeenCalled();
  });

  it('200s with the delegated aggregate when published', async () => {
    const surveyRow = {
      id: 1,
      title: 'Feedback',
      description: 'd',
      fields: [{ id: 'q1', type: 'rating', label: 'NPS' }],
      publishResults: true,
    };
    const responseRows = [
      { answers: { q1: 9 } },
      { answers: { q1: 10 } },
    ];
    setupSelectChain([surveyRow], responseRows);
    aggregateSurveyResultsMock.mockReturnValueOnce({
      title: 'Feedback',
      description: 'd',
      totalResponses: 2,
      questions: [],
    });

    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/results'),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { totalResponses: number };
    };
    expect(json.success).toBe(true);
    expect(json.data.totalResponses).toBe(2);

    // The helper should have been called with the survey's `{title, description,
    // fields}` shape and the raw response rows. The actual aggregation logic
    // is covered in aggregateSurveyResults.test.ts.
    expect(aggregateSurveyResultsMock).toHaveBeenCalledTimes(1);
    const [surveyArg, responsesArg] = aggregateSurveyResultsMock.mock.calls[0]!;
    expect(surveyArg).toMatchObject({
      title: 'Feedback',
      description: 'd',
      fields: surveyRow.fields,
    });
    expect(responsesArg).toEqual(responseRows);
  });

  it('falls back to [] when survey.fields is null', async () => {
    setupSelectChain(
      [
        {
          id: 1,
          title: 'Feedback',
          description: null,
          fields: null,
          publishResults: true,
        },
      ],
      [],
    );
    aggregateSurveyResultsMock.mockReturnValueOnce({
      title: 'Feedback',
      description: null,
      totalResponses: 0,
      questions: [],
    });

    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/results'),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(aggregateSurveyResultsMock).toHaveBeenCalledTimes(1);
    const [surveyArg] = aggregateSurveyResultsMock.mock.calls[0]! as [
      { fields: unknown },
    ];
    expect(surveyArg.fields).toEqual([]);
  });
});
