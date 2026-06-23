// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 27h):
 *   - app/api/portal/brain/communications/route.ts       (GET, POST)
 *   - app/api/portal/brain/communications/[id]/route.ts  (GET, PUT, DELETE)
 *   - app/api/portal/brain/knowledge/route.ts            (GET, POST)
 *   - app/api/portal/brain/review/route.ts               (GET)
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

const getOrCreateBrainProfileMock = vi.fn();
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: (...args: unknown[]) => getOrCreateBrainProfileMock(...args),
}));

const listMeetingsMock = vi.fn();
const createMeetingFromAdapterMock = vi.fn();
const getMeetingMock = vi.fn();
const deleteMeetingMock = vi.fn();
const linkMeetingMock = vi.fn();
vi.mock('@/lib/brain/meetings', () => ({
  listMeetings: (...args: unknown[]) => listMeetingsMock(...args),
  createMeetingFromAdapter: (...args: unknown[]) => createMeetingFromAdapterMock(...args),
  getMeeting: (...args: unknown[]) => getMeetingMock(...args),
  deleteMeeting: (...args: unknown[]) => deleteMeetingMock(...args),
  linkMeeting: (...args: unknown[]) => linkMeetingMock(...args),
}));

const listEnabledAdaptersMock = vi.fn();
vi.mock('@/lib/brain/meeting-sources', () => ({
  listEnabledAdapters: (...args: unknown[]) => listEnabledAdaptersMock(...args),
}));

const logAuditMock = vi.fn();
vi.mock('@/lib/brain/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

const listNotesMock = vi.fn();
const countNotesMock = vi.fn();
const createNoteMock = vi.fn();
const listAllTagsMock = vi.fn();
const listTagsWithCountsMock = vi.fn();
vi.mock('@/lib/brain/notes', () => ({
  listNotes: (...args: unknown[]) => listNotesMock(...args),
  countNotes: (...args: unknown[]) => countNotesMock(...args),
  createNote: (...args: unknown[]) => createNoteMock(...args),
  listAllTags: (...args: unknown[]) => listAllTagsMock(...args),
  listTagsWithCounts: (...args: unknown[]) => listTagsWithCountsMock(...args),
}));

const listReviewItemsMock = vi.fn();
vi.mock('@/lib/brain/review', () => ({
  listReviewItems: (...args: unknown[]) => listReviewItemsMock(...args),
}));

// drizzle-orm — used by review route (eq, and, inArray)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

// Schema mock — wraps tables as Proxies returning column placeholders.
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    brainMeetings: wrap('brainMeetings'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// DB mock — thenable chain that pops the next queued result.
let selectQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(selectQueue.shift() ?? []);
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const terminalChain = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit: () => term,
        offset: () => term,
      };
      return term;
    };
    chain.limit = terminalChain;
    chain.offset = terminalChain;
    chain.orderBy = terminalChain;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---- modules under test (loaded AFTER mocks) ----
const communicationsRoute = await import('@/app/api/portal/brain/communications/route');
const communicationsIdRoute = await import('@/app/api/portal/brain/communications/[id]/route');
const knowledgeRoute = await import('@/app/api/portal/brain/knowledge/route');
const reviewRoute = await import('@/app/api/portal/brain/review/route');

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
  selectQueue = [];
  requireBrainEntitlementMock.mockReset();
  getOrCreateBrainProfileMock.mockReset();
  listMeetingsMock.mockReset();
  createMeetingFromAdapterMock.mockReset();
  getMeetingMock.mockReset();
  deleteMeetingMock.mockReset();
  linkMeetingMock.mockReset();
  listEnabledAdaptersMock.mockReset();
  logAuditMock.mockReset();
  listNotesMock.mockReset();
  countNotesMock.mockReset();
  createNoteMock.mockReset();
  listAllTagsMock.mockReset();
  listTagsWithCountsMock.mockReset();
  listReviewItemsMock.mockReset();
});

// ===========================================================================
// brain/communications
// ===========================================================================

describe('GET /api/portal/brain/communications', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await communicationsRoute.GET(
      makeReq('http://x/api/portal/brain/communications'),
    );
    expect(res.status).toBe(402);
  });

  it('returns all meetings when no status filter is given', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    listMeetingsMock.mockResolvedValue([{ id: 1, title: 'M1' }]);
    const res = await communicationsRoute.GET(
      makeReq('http://x/api/portal/brain/communications'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 1, title: 'M1' }]);
    expect(listMeetingsMock).toHaveBeenCalledWith(5, { status: undefined });
  });

  it('passes through the status filter', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    listMeetingsMock.mockResolvedValue([]);
    await communicationsRoute.GET(
      makeReq('http://x/api/portal/brain/communications?status=draft'),
    );
    expect(listMeetingsMock).toHaveBeenCalledWith(5, { status: 'draft' });
  });
});

describe('POST /api/portal/brain/communications', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 when the brain profile is not enabled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: false });
    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({ adapterId: 'paste', input: { text: 'hi' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/not enabled/i);
  });

  it('returns 400 when the body is not a JSON object', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: true });
    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid/i);
  });

  it('returns 400 when input is missing', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: true });
    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({ adapterId: 'paste' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/adapter input/i);
  });

  it('returns 400 when adapter is not enabled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: true });
    listEnabledAdaptersMock.mockResolvedValue([{ id: 'paste' }]);
    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({ adapterId: 'upload', input: { x: 1 } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/not available/i);
  });

  it('returns 400 when linking to BOTH company and deal', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: true });
    listEnabledAdaptersMock.mockResolvedValue([{ id: 'paste' }]);
    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({
          adapterId: 'paste',
          input: { text: 'hi' },
          companyId: 1,
          dealId: 2,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/company OR a deal/i);
  });

  it('creates a meeting via the adapter and returns it', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 11,
      role: 'write',
    });
    const profile = { id: 9, enabled: true };
    getOrCreateBrainProfileMock.mockResolvedValue(profile);
    listEnabledAdaptersMock.mockResolvedValue([{ id: 'paste' }]);
    createMeetingFromAdapterMock.mockResolvedValue({ id: 77, title: 'New' });

    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({
          adapterId: 'paste',
          input: { text: 'hi' },
          companyId: 42,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 77, title: 'New' });
    const arg = createMeetingFromAdapterMock.mock.calls[0][0];
    expect(arg.adapterId).toBe('paste');
    expect(arg.input).toEqual({ text: 'hi' });
    expect(arg.ctx).toEqual({ clientId: 5, userId: 11, profile });
    expect(arg.link).toEqual({ companyId: 42 });
  });

  it('omits link when neither companyId nor dealId is given', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 11,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: true });
    listEnabledAdaptersMock.mockResolvedValue([{ id: 'paste' }]);
    createMeetingFromAdapterMock.mockResolvedValue({ id: 1 });
    await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({ adapterId: 'paste', input: { text: 'hi' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const arg = createMeetingFromAdapterMock.mock.calls[0][0];
    expect(arg.link).toBeUndefined();
  });

  it('returns 400 when createMeetingFromAdapter throws', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 11,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: true });
    listEnabledAdaptersMock.mockResolvedValue([{ id: 'paste' }]);
    createMeetingFromAdapterMock.mockRejectedValue(new Error('boom'));
    const res = await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({ adapterId: 'paste', input: { text: 'hi' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('boom');
  });

  it('falls back to "Company Brain" when client.company is empty', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: null },
      userId: 11,
      role: 'write',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, enabled: false });
    await communicationsRoute.POST(
      makeReq('http://x/api/portal/brain/communications', {
        method: 'POST',
        body: JSON.stringify({ adapterId: 'paste', input: { text: 'hi' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(getOrCreateBrainProfileMock).toHaveBeenCalledWith(5, 'Company Brain');
  });
});

// ===========================================================================
// brain/communications/[id]
// ===========================================================================

describe('GET /api/portal/brain/communications/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await communicationsIdRoute.GET(
      makeReq('http://x/api/portal/brain/communications/1'),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await communicationsIdRoute.GET(
      makeReq('http://x/api/portal/brain/communications/abc'),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when getMeeting returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getMeetingMock.mockResolvedValue(null);
    const res = await communicationsIdRoute.GET(
      makeReq('http://x/api/portal/brain/communications/42'),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the meeting when found', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getMeetingMock.mockResolvedValue({ id: 42, title: 'Hi' });
    const res = await communicationsIdRoute.GET(
      makeReq('http://x/api/portal/brain/communications/42'),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect(getMeetingMock).toHaveBeenCalledWith(5, 42);
    expect((await res.json()).data).toEqual({ id: 42, title: 'Hi' });
  });
});

describe('PUT /api/portal/brain/communications/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await communicationsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/communications/1', {
        method: 'PUT',
        body: '{}',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await communicationsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/communications/zzz', {
        method: 'PUT',
        body: '{}',
      }),
      makeParams('zzz'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid body', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await communicationsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/communications/42', {
        method: 'PUT',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when linking both company and deal', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await communicationsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/communications/42', {
        method: 'PUT',
        body: JSON.stringify({ companyId: 1, dealId: 2 }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/company OR a deal/i);
  });

  it('returns 404 when linkMeeting returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    linkMeetingMock.mockResolvedValue(null);
    const res = await communicationsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/communications/42', {
        method: 'PUT',
        body: JSON.stringify({ companyId: 7 }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('updates the link and logs audit on success', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    linkMeetingMock.mockResolvedValue({ id: 42, companyId: 7, dealId: null });
    const res = await communicationsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/communications/42', {
        method: 'PUT',
        body: JSON.stringify({ companyId: 7, dealId: null }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 42, companyId: 7, dealId: null });
    expect(linkMeetingMock).toHaveBeenCalledWith(5, 42, { companyId: 7, dealId: null });
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 5,
      actorId: 99,
      action: 'meeting.linked',
      entityType: 'brain_meeting',
      entityId: 42,
    }));
  });
});

describe('DELETE /api/portal/brain/communications/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await communicationsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/communications/1', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'admin',
    });
    const res = await communicationsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/communications/abc', { method: 'DELETE' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleteMeeting returns false', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'admin',
    });
    deleteMeetingMock.mockResolvedValue(false);
    const res = await communicationsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/communications/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 + logs audit on successful delete', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    deleteMeetingMock.mockResolvedValue(true);
    const res = await communicationsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/communications/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 5,
      actorId: 99,
      action: 'meeting.deleted',
      entityId: 42,
    }));
  });

  it('returns 500 when deleteMeeting throws', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deleteMeetingMock.mockRejectedValue(new Error('db dead'));
    const res = await communicationsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/communications/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('db dead');
  });
});

// ===========================================================================
// brain/knowledge
// ===========================================================================

describe('GET /api/portal/brain/knowledge', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await knowledgeRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge'),
    );
    expect(res.status).toBe(402);
  });

  it('returns tag counts when tags=counts', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listTagsWithCountsMock.mockResolvedValue([
      { tag: 'a', count: 3 },
      { tag: '__untagged__', count: 2 },
    ]);
    const res = await knowledgeRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge?tags=counts'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([
      { tag: 'a', count: 3 },
      { tag: '__untagged__', count: 2 },
    ]);
    expect(listTagsWithCountsMock).toHaveBeenCalledWith(5);
  });

  it('returns all tags when tags=true', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listAllTagsMock.mockResolvedValue(['a', 'b']);
    const res = await knowledgeRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge?tags=true'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ tags: ['a', 'b'] });
  });

  it('returns 400 for an invalid sort param', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await knowledgeRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge?sort=bogus'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid sort/i);
  });

  it('returns 400 for an invalid order param', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await knowledgeRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge?order=sideways'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid order/i);
  });

  it('returns items + total + clamped pagination', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listNotesMock.mockResolvedValue([{ id: 1, title: 'N1' }]);
    countNotesMock.mockResolvedValue(99);
    const res = await knowledgeRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge?limit=500&offset=-3'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([{ id: 1, title: 'N1' }]);
    expect(body.data.total).toBe(99);
    expect(body.data.limit).toBe(200); // clamped
    expect(body.data.offset).toBe(0);  // clamped
  });

  it('passes filters through to listNotes/countNotes', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listNotesMock.mockResolvedValue([]);
    countNotesMock.mockResolvedValue(0);
    await knowledgeRoute.GET(
      makeReq(
        'http://x/api/portal/brain/knowledge?companyId=42&dealId=7&tag=foo&tagPrefix=%20bar%20&search=hi&pinned=true&trashed=true&untagged=true&orphans=true&sourceUrl=https%3A%2F%2Fa&sourceUrlStartsWith=https%3A%2F%2Fb&sort=title&order=asc',
      ),
    );
    expect(listNotesMock).toHaveBeenCalled();
    const filters = listNotesMock.mock.calls[0][1];
    expect(filters.companyId).toBe(42);
    expect(filters.dealId).toBe(7);
    expect(filters.tag).toBe('foo');
    expect(filters.tagPrefix).toBe('bar'); // trimmed
    expect(filters.search).toBe('hi');
    expect(filters.pinnedOnly).toBe(true);
    expect(filters.trashed).toBe(true);
    expect(filters.untagged).toBe(true);
    expect(filters.orphans).toBe(true);
    expect(filters.sourceUrl).toBe('https://a');
    expect(filters.sourceUrlStartsWith).toBe('https://b');
    expect(filters.sort).toBe('title');
    expect(filters.order).toBe('asc');
  });
});

describe('POST /api/portal/brain/knowledge', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await knowledgeRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 when title is missing', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await knowledgeRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge', {
        method: 'POST',
        body: JSON.stringify({ body: 'no title' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/title is required/i);
  });

  it('returns 400 when title is whitespace-only', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await knowledgeRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge', {
        method: 'POST',
        body: JSON.stringify({ title: '   ' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a note with sanitized inputs', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createNoteMock.mockResolvedValue({ id: 7, title: 'Hi' });
    const res = await knowledgeRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Hi',
          body: 'hello',
          tags: ['a', 1, 'b'],
          meetingId: 42,
          companyId: 11,
          dealId: 22,
          contactId: 33,
          relationshipOverlayId: 55,
          confidentialityLevel: 'restricted',
          pinned: true,
          sourceUrl: '  https://x  ',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 7, title: 'Hi' });

    const arg = createNoteMock.mock.calls[0][0];
    expect(arg.clientId).toBe(5);
    expect(arg.title).toBe('Hi');
    expect(arg.body).toBe('hello');
    expect(arg.tags).toEqual(['a', 'b']); // non-strings filtered
    expect(arg.meetingId).toBe(42);
    expect(arg.companyId).toBe(11);
    expect(arg.dealId).toBe(22);
    expect(arg.contactId).toBe(33);
    expect(arg.relationshipOverlayId).toBe(55);
    expect(arg.confidentialityLevel).toBe('restricted');
    expect(arg.pinned).toBe(true);
    expect(arg.sourceUrl).toBe('https://x');
    expect(arg.source).toBe('manual');
    expect(arg.createdBy).toBe(99);
  });

  it('falls back to safe defaults when optional fields are omitted/invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createNoteMock.mockResolvedValue({ id: 8 });
    await knowledgeRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Hi',
          tags: 'not-an-array',
          confidentialityLevel: 'top-secret',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const arg = createNoteMock.mock.calls[0][0];
    expect(arg.body).toBe('');
    expect(arg.tags).toEqual([]);
    expect(arg.meetingId).toBeNull();
    expect(arg.companyId).toBeNull();
    expect(arg.dealId).toBeNull();
    expect(arg.contactId).toBeNull();
    expect(arg.relationshipOverlayId).toBeNull();
    expect(arg.confidentialityLevel).toBe('standard'); // unknown -> default
    expect(arg.pinned).toBe(false);
    expect(arg.sourceUrl).toBeNull();
  });
});

// ===========================================================================
// brain/review
// ===========================================================================

describe('GET /api/portal/brain/review', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/review'),
    );
    expect(res.status).toBe(402);
  });

  it('defaults to status=pending when omitted', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([]);
    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/review'),
    );
    expect(res.status).toBe(200);
    expect(listReviewItemsMock).toHaveBeenCalledWith(5, { status: 'pending' });
    const body = await res.json();
    expect(body.data).toEqual({ items: [], meetings: {} });
  });

  it('accepts status=all (omits status filter)', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([]);
    await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/review?status=all'),
    );
    expect(listReviewItemsMock).toHaveBeenCalledWith(5, { status: undefined });
  });

  it('falls back to pending for an unknown status', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([]);
    await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/review?status=garbage'),
    );
    expect(listReviewItemsMock).toHaveBeenCalledWith(5, { status: 'pending' });
  });

  it('enriches items with meeting metadata', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([
      { id: 1, sourceType: 'meeting', sourceId: 100 },
      { id: 2, sourceType: 'note', sourceId: 200 },
      { id: 3, sourceType: 'meeting', sourceId: 100 }, // dup id, dedup in set
    ]);
    const meetingDate = new Date('2025-01-01T00:00:00Z');
    selectQueue.push([
      {
        id: 100,
        title: 'Kickoff',
        status: 'approved',
        meetingDate,
        source: 'gmail',
        sourceMetadata: { gmailThreadId: 'thread-1' },
      },
    ]);

    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/review?status=pending'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(3);
    expect(body.data.meetings[100]).toEqual({
      id: 100,
      title: 'Kickoff',
      status: 'approved',
      meetingDate: '2025-01-01T00:00:00.000Z',
      source: 'gmail',
      gmailThreadId: 'thread-1',
    });
  });

  it('handles null meetingDate and missing sourceMetadata', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([
      { id: 1, sourceType: 'meeting', sourceId: 7 },
    ]);
    selectQueue.push([
      {
        id: 7,
        title: 'No date',
        status: 'draft',
        meetingDate: null,
        source: 'manual',
        sourceMetadata: null,
      },
    ]);
    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/review'),
    );
    const body = await res.json();
    expect(body.data.meetings[7]).toEqual({
      id: 7,
      title: 'No date',
      status: 'draft',
      meetingDate: null,
      source: 'manual',
      gmailThreadId: null,
    });
  });

  it('skips the meeting query when no items reference meetings', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listReviewItemsMock.mockResolvedValue([
      { id: 1, sourceType: 'note', sourceId: 1 },
    ]);
    // selectQueue intentionally empty — if route called db.select, it would
    // return [] anyway, but we just want to confirm no crash + empty meetings.
    const res = await reviewRoute.GET(
      makeReq('http://x/api/portal/brain/review'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.meetings).toEqual({});
  });
});
