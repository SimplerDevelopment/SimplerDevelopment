// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 28d):
 *   - app/api/portal/brain/crm-suggestions/route.ts                   (GET)
 *   - app/api/portal/brain/dashboard/route.ts                         (GET)
 *   - app/api/portal/brain/communications/[id]/process/route.ts       (POST)
 *   - app/api/portal/brain/communications/[id]/review/route.ts        (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const suggestCrmTargetsMock = vi.fn();
vi.mock('@/lib/brain/relationships', () => ({
  suggestCrmTargets: (...args: unknown[]) => suggestCrmTargetsMock(...args),
  countRelationships: (..._args: unknown[]) => Promise.resolve(0),
}));

const getDashboardSummaryMock = vi.fn();
vi.mock('@/lib/brain/dashboard', () => ({
  getDashboardSummary: (...args: unknown[]) => getDashboardSummaryMock(...args),
}));

const getMeetingMock = vi.fn();
vi.mock('@/lib/brain/meetings', () => ({
  getMeeting: (...args: unknown[]) => getMeetingMock(...args),
}));

const processBrainMeetingMock = vi.fn();
vi.mock('@/lib/brain/process-meeting', () => ({
  processBrainMeeting: (...args: unknown[]) => processBrainMeetingMock(...args),
}));

const listReviewItemsMock = vi.fn();
vi.mock('@/lib/brain/review', () => ({
  listReviewItems: (...args: unknown[]) => listReviewItemsMock(...args),
}));

// ---- modules under test (loaded AFTER mocks) ----
const crmSuggestionsRoute = await import('@/app/api/portal/brain/crm-suggestions/route');
const dashboardRoute = await import('@/app/api/portal/brain/dashboard/route');
const processRoute = await import('@/app/api/portal/brain/communications/[id]/process/route');
const reviewRoute = await import('@/app/api/portal/brain/communications/[id]/review/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const FAIL_RESPONSE = NextResponse.json(
  { success: false, code: 'BRAIN_NOT_ENTITLED' },
  { status: 402 },
);

beforeEach(() => {
  requireBrainEntitlementMock.mockReset();
  suggestCrmTargetsMock.mockReset();
  getDashboardSummaryMock.mockReset();
  getMeetingMock.mockReset();
  processBrainMeetingMock.mockReset();
  listReviewItemsMock.mockReset();
});

// ===========================================================================
// brain/crm-suggestions
// ===========================================================================

describe('GET /api/portal/brain/crm-suggestions', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await crmSuggestionsRoute.GET(
      makeReq('http://x/api/portal/brain/crm-suggestions?q=acme'),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('passes q query and clientId to suggestCrmTargets and returns the result', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    suggestCrmTargetsMock.mockResolvedValue([
      { id: 1, name: 'Acme Co' },
      { id: 2, name: 'Acme LLC' },
    ]);
    const res = await crmSuggestionsRoute.GET(
      makeReq('http://x/api/portal/brain/crm-suggestions?q=acme'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      { id: 1, name: 'Acme Co' },
      { id: 2, name: 'Acme LLC' },
    ]);
    expect(suggestCrmTargetsMock).toHaveBeenCalledWith(5, 'acme', 20);
  });

  it('defaults q to empty string when not given', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    suggestCrmTargetsMock.mockResolvedValue([]);
    const res = await crmSuggestionsRoute.GET(
      makeReq('http://x/api/portal/brain/crm-suggestions'),
    );
    expect(res.status).toBe(200);
    expect(suggestCrmTargetsMock).toHaveBeenCalledWith(5, '', 20);
  });

  it('clamps q to 100 characters', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    suggestCrmTargetsMock.mockResolvedValue([]);
    const longQ = 'x'.repeat(250);
    await crmSuggestionsRoute.GET(
      makeReq(`http://x/api/portal/brain/crm-suggestions?q=${longQ}`),
    );
    const [, q, limit] = suggestCrmTargetsMock.mock.calls[0];
    expect((q as string).length).toBe(100);
    expect(limit).toBe(20);
  });
});

// ===========================================================================
// brain/dashboard
// ===========================================================================

describe('GET /api/portal/brain/dashboard', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await dashboardRoute.GET();
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('returns the dashboard summary wrapped in success envelope', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 11, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    const summary = {
      counts: { meetings: 5, notes: 2 },
      recent: [{ id: 1, title: 'Hi' }],
    };
    getDashboardSummaryMock.mockResolvedValue(summary);
    const res = await dashboardRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(summary);
    expect(getDashboardSummaryMock).toHaveBeenCalledWith(11);
  });
});

// ===========================================================================
// brain/communications/[id]/process
// ===========================================================================

describe('POST /api/portal/brain/communications/[id]/process', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/1/process', { method: 'POST' }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'write' });
  });

  it('returns 400 for a non-numeric meeting id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 7,
      role: 'write',
    });
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/abc/process', { method: 'POST' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid meeting id/i);
  });

  it('returns 404 when getMeeting returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 7,
      role: 'write',
    });
    getMeetingMock.mockResolvedValue(null);
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/42/process', { method: 'POST' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/meeting not found/i);
    expect(getMeetingMock).toHaveBeenCalledWith(5, 42);
  });

  it('returns 409 when the meeting is already processing', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 7,
      role: 'write',
    });
    getMeetingMock.mockResolvedValue({ id: 42, status: 'processing' });
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/42/process', { method: 'POST' }),
      makeParams('42'),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already processing/i);
  });

  it('processes the meeting and returns the transcript/attachment summary', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    getMeetingMock.mockResolvedValue({ id: 42, status: 'pending' });
    processBrainMeetingMock.mockResolvedValue({
      transcript: { jobId: 'job-1', reviewItemCount: 3, summary: 'Big summary' },
      attachmentsAnalyzed: 2,
      attachmentTokens: 1500,
      linksExtracted: 4,
    });
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/42/process', { method: 'POST' }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      jobId: 'job-1',
      reviewItemCount: 3,
      summary: 'Big summary',
      attachmentsAnalyzed: 2,
      attachmentTokens: 1500,
      linksExtracted: 4,
    });
    expect(processBrainMeetingMock).toHaveBeenCalledWith({
      clientId: 5,
      meetingId: 42,
      userId: 99,
    });
  });

  it('handles a null transcript safely with default values', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    getMeetingMock.mockResolvedValue({ id: 42, status: 'pending' });
    processBrainMeetingMock.mockResolvedValue({
      transcript: null,
      attachmentsAnalyzed: 0,
      attachmentTokens: 0,
      linksExtracted: 0,
    });
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/42/process', { method: 'POST' }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      jobId: null,
      reviewItemCount: 0,
      summary: null,
      attachmentsAnalyzed: 0,
      attachmentTokens: 0,
      linksExtracted: 0,
    });
  });

  it('returns 400 when processBrainMeeting throws the no-transcript error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 7,
      role: 'write',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getMeetingMock.mockResolvedValue({ id: 42, status: 'pending' });
    processBrainMeetingMock.mockRejectedValue(
      new Error('Meeting has no transcript or attachments to process.'),
    );
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/42/process', { method: 'POST' }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(
      'Meeting has no transcript or attachments to process.',
    );
  });

  it('returns 500 when processBrainMeeting throws a generic error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 7,
      role: 'write',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getMeetingMock.mockResolvedValue({ id: 42, status: 'pending' });
    processBrainMeetingMock.mockRejectedValue(new Error('whatever'));
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/42/process', { method: 'POST' }),
      makeParams('42'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('whatever');
  });

  it('returns 500 + fallback message when a non-Error is thrown', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 7,
      role: 'write',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getMeetingMock.mockResolvedValue({ id: 42, status: 'pending' });
    processBrainMeetingMock.mockRejectedValue('string-thrown');
    const res = await processRoute.POST(
      makeReq('http://x/api/portal/brain/communications/42/process', { method: 'POST' }),
      makeParams('42'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Failed to process meeting');
  });
});

// ===========================================================================
// brain/communications/[id]/review
// ===========================================================================

describe('GET /api/portal/brain/communications/[id]/review', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/communications/1/review'),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('returns 400 for a non-numeric meeting id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/communications/abc/review'),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid meeting id/i);
  });

  it('returns review items for a meeting (no status filter)', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([
      { id: 1, sourceType: 'meeting', sourceId: 42 },
      { id: 2, sourceType: 'meeting', sourceId: 42 },
    ]);
    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/communications/42/review'),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(listReviewItemsMock).toHaveBeenCalledWith(5, {
      sourceType: 'meeting',
      sourceId: 42,
      status: undefined,
    });
  });

  it('passes the status filter through to listReviewItems', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([]);
    await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/communications/42/review?status=pending'),
      makeParams('42'),
    );
    expect(listReviewItemsMock).toHaveBeenCalledWith(5, {
      sourceType: 'meeting',
      sourceId: 42,
      status: 'pending',
    });
  });

  it('passes status=approved through', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([]);
    await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/communications/42/review?status=approved'),
      makeParams('42'),
    );
    expect(listReviewItemsMock).toHaveBeenCalledWith(5, {
      sourceType: 'meeting',
      sourceId: 42,
      status: 'approved',
    });
  });
});
