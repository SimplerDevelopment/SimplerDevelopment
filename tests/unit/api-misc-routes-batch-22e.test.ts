// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 22e):
 *   - app/api/portal/resolve-subdomain/route.ts   (GET)
 *   - app/api/portal/url-suggestions/route.ts     (GET)
 *   - app/api/portal/labels/[id]/route.ts         (PATCH, DELETE)
 *   - app/api/portal/brain/dataview/route.ts      (POST, GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const getPortalClientsMock = vi.fn();
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalClients: (...args: unknown[]) => getPortalClientsMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

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
    clientWebsites: wrap('clientWebsites'),
    clients: wrap('clients'),
    posts: wrap('posts'),
    pitchDecks: wrap('pitchDecks'),
    bookingPages: wrap('bookingPages'),
    crmProposals: wrap('crmProposals'),
    kanbanLabels: wrap('kanbanLabels'),
    projects: wrap('projects'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('@/lib/active-client', () => ({
  COOKIE_NAME: 'sd-active-client',
}));

// brain entitlement + dataview
const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

class FakeDataviewError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}
const validateQueryMock = vi.fn();
const runDataviewMock = vi.fn();
const listSupportedTypesMock = vi.fn(() => ['note', 'task']);
vi.mock('@/lib/brain/dataview', () => ({
  DataviewError: FakeDataviewError,
  validateQuery: (...args: unknown[]) => validateQueryMock(...args),
  runDataview: (...args: unknown[]) => runDataviewMock(...args),
  listSupportedTypes: () => listSupportedTypesMock(),
}));

// ---------------------------------------------------------------------------
// DB mock: thenable chain that resolves to a queued select result, plus
// recording updaters / deleters.
// ---------------------------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface DeleteCall {
  table: string;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = updateReturnQueue.shift() ?? [];
            const cloned = rows.map((r) => ({ ...r }));
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: cloned });
            return {
              returning() {
                return Promise.resolve(cloned);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return {
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---- modules under test ----
const subdomainRoute = await import('@/app/api/portal/resolve-subdomain/route');
const urlSuggestionsRoute = await import('@/app/api/portal/url-suggestions/route');
const labelsRoute = await import('@/app/api/portal/labels/[id]/route');
const dataviewRoute = await import('@/app/api/portal/brain/dataview/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalClientsMock.mockReset();
  resolveClientSiteMock.mockReset();
  requireBrainEntitlementMock.mockReset();
  validateQueryMock.mockReset();
  runDataviewMock.mockReset();
  listSupportedTypesMock.mockClear();
});

// ===========================================================================
// resolve-subdomain
// ===========================================================================

describe('GET /api/portal/resolve-subdomain', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await subdomainRoute.GET(makeReq('http://x?subdomain=acme'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when subdomain query param is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await subdomainRoute.GET(makeReq('http://x/api/portal/resolve-subdomain'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('subdomain parameter required');
  });

  it('returns 404 when no website matches the subdomain', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]); // site lookup -> empty
    const res = await subdomainRoute.GET(makeReq('http://x?subdomain=acme'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when user lacks access to the resolved client', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ clientId: 33 }]);
    getPortalClientsMock.mockResolvedValue([{ id: 99, company: 'Other' }]);
    const res = await subdomainRoute.GET(makeReq('http://x?subdomain=acme'));
    expect(res.status).toBe(403);
  });

  it('returns success and sets the active client cookie', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ clientId: 33 }]);
    getPortalClientsMock.mockResolvedValue([
      { id: 99, company: 'Other' },
      { id: 33, company: 'Acme' },
    ]);
    const res = await subdomainRoute.GET(makeReq('http://x?subdomain=acme'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, clientId: 33, company: 'Acme' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('sd-active-client=33');
    expect(setCookie.toLowerCase()).toContain('httponly');
  });
});

// ===========================================================================
// url-suggestions
// ===========================================================================

describe('GET /api/portal/url-suggestions', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await urlSuggestionsRoute.GET(makeReq('http://x/api/portal/url-suggestions'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await urlSuggestionsRoute.GET(makeReq('http://x/api/portal/url-suggestions'));
    expect(res.status).toBe(404);
  });

  it('returns decks/bookings/proposals with empty posts when no siteId param', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // Promise.all: decks, bookings, proposals
    selectQueue.push([
      { id: 1, title: 'Deck A', slug: 'deck-a', status: 'draft' },
    ]);
    selectQueue.push([{ id: 2, title: 'Booking A', slug: 'book-a' }]);
    selectQueue.push([
      { id: 3, title: 'Prop A', clientToken: 'tok-a', status: 'sent' },
    ]);
    const res = await urlSuggestionsRoute.GET(makeReq('http://x/api/portal/url-suggestions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.posts).toEqual([]);
    expect(body.data.decks[0]).toEqual({
      id: 1,
      label: 'Deck A',
      sublabel: 'draft',
      url: '/pitch-deck/deck-a',
    });
    expect(body.data.bookings[0]).toEqual({
      id: 2,
      label: 'Booking A',
      url: '/book/book-a',
    });
    expect(body.data.proposals[0]).toEqual({
      id: 3,
      label: 'Prop A',
      sublabel: 'sent',
      url: '/proposal/tok-a',
    });
  });

  it('includes posts when siteId resolves to a site', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    resolveClientSiteMock.mockResolvedValue({ id: 7 });
    // posts query runs first (before Promise.all)
    selectQueue.push([
      { id: 10, title: 'Hello', slug: 'hello', postType: 'post' },
    ]);
    // then decks, bookings, proposals
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    const res = await urlSuggestionsRoute.GET(
      makeReq('http://x/api/portal/url-suggestions?siteId=7'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.posts).toEqual([
      { id: 10, label: 'Hello', sublabel: 'post', url: '/hello' },
    ]);
    expect(resolveClientSiteMock).toHaveBeenCalledWith(7, 7);
  });

  it('skips posts when siteId is provided but site is not resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    resolveClientSiteMock.mockResolvedValue(null);
    // No posts query — only decks/bookings/proposals
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    const res = await urlSuggestionsRoute.GET(
      makeReq('http://x/api/portal/url-suggestions?siteId=999'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.posts).toEqual([]);
  });
});

// ===========================================================================
// labels/[id]
// ===========================================================================

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/portal/labels/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await labelsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when label does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]); // label lookup
    const res = await labelsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('admin role can edit and applies trimmed name + valid color', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 5, projectId: 100 }]); // label lookup
    updateReturnQueue.push([{ id: 5, name: 'Trimmed', color: '#abcdef', projectId: 100 }]);
    const res = await labelsRoute.PATCH(
      makeReq('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ name: '  Trimmed  ', color: '#abcdef' }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Trimmed');
    expect(updateCalls[0].patch).toEqual({ name: 'Trimmed', color: '#abcdef' });
  });

  it('client user gets canEdit only when project is private and belongs to them', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 5, projectId: 100 }]); // label
    selectQueue.push([{ id: 100, clientId: 33, isPrivate: true }]); // project
    selectQueue.push([{ role: 'editor' }]); // projectMembers (canUserEditProject)
    getPortalClientMock.mockResolvedValue({ id: 33 });
    updateReturnQueue.push([{ id: 5, name: 'X', projectId: 100 }]);
    const res = await labelsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
  });

  it('returns 403 when client owns the project but it is not private', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 5, projectId: 100 }]);
    selectQueue.push([{ id: 100, clientId: 33, isPrivate: false }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await labelsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
      paramsFor('5'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when project clientId does not match the user client', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 5, projectId: 100 }]);
    selectQueue.push([{ id: 100, clientId: 999, isPrivate: true }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await labelsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('ignores invalid color formats and clamps name length', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    selectQueue.push([{ id: 5, projectId: 100 }]);
    updateReturnQueue.push([{ id: 5 }]);
    const longName = 'A'.repeat(120);
    await labelsRoute.PATCH(
      makeReq('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ name: longName, color: 'not-a-color' }),
      }),
      paramsFor('5'),
    );
    expect(updateCalls[0].patch.color).toBeUndefined();
    expect((updateCalls[0].patch.name as string).length).toBe(50);
  });
});

describe('DELETE /api/portal/labels/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await labelsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when label not found', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]);
    const res = await labelsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when client cannot edit', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 5, projectId: 100 }]);
    selectQueue.push([{ id: 100, clientId: 33, isPrivate: false }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await labelsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(403);
  });

  it('admin role deletes the label', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 5, projectId: 100 }]);
    const res = await labelsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('kanbanLabels');
  });
});

// ===========================================================================
// brain/dataview
// ===========================================================================

describe('POST /api/portal/brain/dataview', () => {
  it('returns the entitlement response when the user is not entitled', async () => {
    const denied = new Response('no', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: denied });
    const res = await dataviewRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res).toBe(denied);
  });

  it('returns a DataviewError status when validateQuery throws DataviewError', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 } });
    validateQueryMock.mockImplementation(() => {
      throw new FakeDataviewError('bad query', 422);
    });
    const res = await dataviewRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ junk: true }),
      }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe('bad query');
  });

  it('returns 400 when validateQuery throws a non-DataviewError', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 } });
    validateQueryMock.mockImplementation(() => {
      throw new Error('whatever');
    });
    const res = await dataviewRoute.POST(
      makeReq('http://x', { method: 'POST', body: 'not-json' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('invalid dataview query');
  });

  it('returns runDataview result on success', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 } });
    validateQueryMock.mockReturnValue({ type: 'note' });
    runDataviewMock.mockResolvedValue({
      rows: [{ id: 1 }],
      columns: ['id'],
    });
    const res = await dataviewRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ type: 'note' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { rows: [{ id: 1 }], columns: ['id'] },
    });
    expect(runDataviewMock).toHaveBeenCalledWith(33, { type: 'note' });
  });

  it('maps DataviewError from runDataview to its status', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 } });
    validateQueryMock.mockReturnValue({ type: 'task' });
    runDataviewMock.mockRejectedValue(new FakeDataviewError('row limit', 413));
    const res = await dataviewRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).message).toBe('row limit');
  });

  it('returns 500 with the error message for generic runDataview failures', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 } });
    validateQueryMock.mockReturnValue({ type: 'note' });
    runDataviewMock.mockRejectedValue(new Error('boom'));
    const res = await dataviewRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('boom');
  });

  it('returns 500 with a default message for non-Error throws', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 } });
    validateQueryMock.mockReturnValue({ type: 'note' });
    runDataviewMock.mockRejectedValue('not-an-error');
    const res = await dataviewRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('dataview query failed');
  });
});

describe('GET /api/portal/brain/dataview', () => {
  it('returns entitlement response when unentitled', async () => {
    const denied = new Response('no', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: denied });
    const res = await dataviewRoute.GET();
    expect(res).toBe(denied);
  });

  it('returns the list of supported types', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 } });
    const res = await dataviewRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { types: ['note', 'task'] },
    });
    expect(listSupportedTypesMock).toHaveBeenCalled();
  });
});
