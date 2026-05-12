// @vitest-environment node
/**
 * Unit tests for /api/surveys/[slug]/certificate (PDF-01/02).
 *
 * The actual PDF layout (fonts / colors / coords) is a visual concern and is
 * not exercised here — we stub `@react-pdf/renderer.renderToBuffer` so the
 * route's branches can run without spinning up the renderer. The properties
 * that *are* load-bearing for security (no-existence-leak on bad / missing /
 * cross-survey responseId) are the focus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // db.select(...).from(...).where(...).limit(...) — runs twice per request:
  //   1) survey lookup by slug
  //   2) response lookup by (id, surveyId)
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const getBrandingBySurveySlugMock = vi.fn();
  const renderToBufferMock = vi.fn();

  return {
    limitMock,
    whereMock,
    fromMock,
    selectMock,
    getBrandingBySurveySlugMock,
    renderToBufferMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
  },
}));

vi.mock('@/lib/branding', () => ({
  getBrandingBySurveySlug: mocks.getBrandingBySurveySlugMock,
}));

// Stub @react-pdf/renderer so we don't actually generate a PDF. We only need
// `renderToBuffer` for the success path; the other named exports are passed
// through `React.createElement` and never evaluated for behavior.
vi.mock('@react-pdf/renderer', () => {
  // The route only uses these as React.createElement args; their identity
  // doesn't matter for the test because renderToBuffer is mocked.
  const passthrough = () => function StubComponent() { return null; };
  return {
    Document: passthrough(),
    Page: passthrough(),
    View: passthrough(),
    Text: passthrough(),
    Image: passthrough(),
    StyleSheet: {
      create: <T,>(s: T) => s,
    },
    renderToBuffer: mocks.renderToBufferMock,
  };
});

const {
  limitMock,
  whereMock,
  fromMock,
  selectMock,
  getBrandingBySurveySlugMock,
  renderToBufferMock,
} = mocks;

// Static import — vi.mock is hoisted, so by the time this evaluates the
// mocked `@/lib/db`, `@/lib/branding`, and `@react-pdf/renderer` are already
// in place. Importing once at module load avoids paying the per-test
// dynamic-import compile cost (which can blow the default 5 s test timeout
// when this file runs alongside the full unit suite).
import { GET } from '@/app/api/surveys/[slug]/certificate/route';

const PARAMS = { params: Promise.resolve({ slug: 'feedback-2026' }) };

beforeEach(() => {
  selectMock.mockClear();
  fromMock.mockClear();
  whereMock.mockClear();
  limitMock.mockReset();
  getBrandingBySurveySlugMock.mockReset();
  renderToBufferMock.mockReset();
});

describe('GET /api/surveys/[slug]/certificate', () => {
  it('404s when responseId is missing / non-numeric (no DB roundtrip)', async () => {
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/certificate'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('404s when responseId is <= 0', async () => {
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/certificate?responseId=0'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('404s when the survey is missing', async () => {
    limitMock.mockResolvedValueOnce([]); // survey lookup empty
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/certificate?responseId=1'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    // No 2nd query (response lookup) and no branding/renderer call.
    expect(limitMock).toHaveBeenCalledTimes(1);
    expect(getBrandingBySurveySlugMock).not.toHaveBeenCalled();
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it('404s when certificateEnabled is false (no existence leak)', async () => {
    limitMock.mockResolvedValueOnce([
      { id: 42, title: 'Customer Feedback', certificateEnabled: false },
    ]);
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/certificate?responseId=99'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    // Body text must be identical to the missing-survey case — both return
    // the plain string "Not found" so callers can't distinguish.
    expect(await res.text()).toBe('Not found');
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it('404s when the responseId belongs to a different survey (no leak)', async () => {
    limitMock
      .mockResolvedValueOnce([
        { id: 42, title: 'Customer Feedback', certificateEnabled: true },
      ])
      .mockResolvedValueOnce([]); // response not found scoped to (id, surveyId=42)
    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/certificate?responseId=12345'),
      PARAMS,
    );
    expect(res.status).toBe(404);
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it('returns application/pdf with attachment Content-Disposition on success', async () => {
    limitMock
      .mockResolvedValueOnce([
        { id: 42, title: 'Customer Feedback', certificateEnabled: true },
      ])
      .mockResolvedValueOnce([
        {
          id: 12345,
          respondentName: 'Jane Doe',
          completedAt: new Date('2026-05-01T12:00:00Z'),
          createdAt: new Date('2026-04-30T12:00:00Z'),
        },
      ]);
    getBrandingBySurveySlugMock.mockResolvedValueOnce({
      primaryColor: '#000000',
      accentColor: '#ffffff',
      headingFont: null,
      bodyFont: null,
      logoUrl: null,
      logoRectUrl: null,
    });
    renderToBufferMock.mockResolvedValueOnce(Buffer.from('%PDF-1.4 stub'));

    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/certificate?responseId=12345'),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="[^"]+\.pdf"$/,
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    // Branding is resolved via the survey slug, NOT clientId — the route is
    // public, the slug is the only handle the caller has, and the helper does
    // its own join from slug → site → branding profile.
    expect(getBrandingBySurveySlugMock).toHaveBeenCalledWith('feedback-2026');
    expect(renderToBufferMock).toHaveBeenCalledTimes(1);
  });

  it('tolerates a null branding profile (falls back to defaults)', async () => {
    limitMock
      .mockResolvedValueOnce([
        { id: 42, title: 'Customer Feedback', certificateEnabled: true },
      ])
      .mockResolvedValueOnce([
        {
          id: 12345,
          respondentName: null,
          completedAt: null,
          createdAt: new Date('2026-04-30T12:00:00Z'),
        },
      ]);
    getBrandingBySurveySlugMock.mockResolvedValueOnce(null);
    renderToBufferMock.mockResolvedValueOnce(Buffer.from('%PDF stub'));

    const res = await GET(
      new Request('http://x/api/surveys/feedback-2026/certificate?responseId=12345'),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});
