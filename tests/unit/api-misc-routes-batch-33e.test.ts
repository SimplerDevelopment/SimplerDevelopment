// @vitest-environment node
/**
 * Batch 33e — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route.ts (POST)
 *  - app/api/portal/websites/[siteId]/api-keys/[keyId]/route.ts                  (DELETE)
 *  - app/api/portal/websites/[siteId]/branding-profile/route.ts                  (PATCH)
 *  - app/api/portal/websites/[siteId]/collaborators/route.ts                     (POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal .limit
 * / .orderBy). db.insert/update/delete are mocked to capture writes and emit
 * the next queued return rows. lib/auth, lib/portal-client, lib/github,
 * lib/pitch-deck-migration are all mocked so no network or DB I/O occurs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

const addCollaboratorMock = vi.fn();
vi.mock('@/lib/github', () => ({
  addCollaborator: (...args: unknown[]) => addCollaboratorMock(...args),
}));

const convertAllSlidesToV2Mock = vi.fn();
const isV2SlidesMock = vi.fn();
vi.mock('@/lib/pitch-deck-migration', () => ({
  convertAllSlidesToV2: (...args: unknown[]) => convertAllSlidesToV2Mock(...args),
  isV2Slides: (...args: unknown[]) => isV2SlidesMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    pitchDecks: wrap('pitchDecks'),
    pitchDeckVersions: wrap('pitchDeckVersions'),
    apiKeys: wrap('apiKeys'),
    clientWebsites: wrap('clientWebsites'),
    brandingProfiles: wrap('brandingProfiles'),
    githubConnections: wrap('githubConnections'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
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
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
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
                return Promise.resolve(cloned).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const call: InsertCall = { table: table.__table, values: v };
        insertCalls.push(call);
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        const tail = {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
          },
        };
        return tail;
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return Promise.resolve();
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const restoreRoute = await import(
  '@/app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route'
);
const apiKeyRoute = await import(
  '@/app/api/portal/websites/[siteId]/api-keys/[keyId]/route'
);
const brandingProfileRoute = await import(
  '@/app/api/portal/websites/[siteId]/branding-profile/route'
);
const collaboratorsRoute = await import(
  '@/app/api/portal/websites/[siteId]/collaborators/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
  addCollaboratorMock.mockReset();
  convertAllSlidesToV2Mock.mockReset();
  isV2SlidesMock.mockReset();
});

// ===========================================================================
// POST /api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore
// ===========================================================================

describe('POST /api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/2/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '2' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session.user.id is missing', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/2/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '2' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/2/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
  });

  it('returns 404 when the deck does not belong to this client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // deck lookup empty
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/2/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/deck not found/i);
  });

  it('returns 404 when the version is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, slides: [], theme: {}, formatVersion: 2 }]); // deck
    selectQueue.push([]); // version empty
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/2/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/version not found/i);
  });

  it('saves current state as a backup version and restores v2 slides untouched', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const deck = {
      id: 1,
      clientId: 5,
      slides: [{ id: 's-deck', type: 'title' }],
      theme: { background: 'white' },
      formatVersion: 2,
    };
    const versionSlides = [{ id: 's-v', type: 'title' }];
    selectQueue.push([deck]);
    selectQueue.push([{ id: 99, deckId: 1, slides: versionSlides, theme: { background: 'black' }, formatVersion: 2 }]);
    isV2SlidesMock.mockReturnValue(true);
    updateReturnQueue.push([{ id: 1, slides: versionSlides, theme: { background: 'black' }, formatVersion: 2 }]);

    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/99/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '99' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);

    // Backup insert
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('pitchDeckVersions');
    const ivals = insertCalls[0].values as Record<string, unknown>;
    expect(ivals.deckId).toBe(1);
    expect(ivals.label).toBe('Before restore');
    expect(ivals.trigger).toBe('manual');
    expect(ivals.createdBy).toBe(7);

    // Update with restored data
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('pitchDecks');
    expect(updateCalls[0].patch.slides).toEqual(versionSlides);
    expect(updateCalls[0].patch.theme).toEqual({ background: 'black' });
    expect(updateCalls[0].patch.formatVersion).toBe(2);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);

    expect(convertAllSlidesToV2Mock).not.toHaveBeenCalled();
  });

  it('converts v1 version slides to v2 when restoring legacy versions', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const deck = {
      id: 1,
      clientId: 5,
      slides: [{ id: 's-deck' }],
      theme: {},
      formatVersion: 2,
    };
    const v1Slides = [{ id: 's-v1', layout: 'old' }];
    const v2Slides = [{ id: 's-v1-converted', type: 'title' }];
    selectQueue.push([deck]);
    selectQueue.push([{ id: 99, deckId: 1, slides: v1Slides, theme: {}, formatVersion: 1 }]);
    isV2SlidesMock.mockReturnValue(false);
    convertAllSlidesToV2Mock.mockReturnValue(v2Slides);
    updateReturnQueue.push([{ id: 1 }]);

    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/99/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '99' }) },
    );
    expect(res.status).toBe(200);
    expect(convertAllSlidesToV2Mock).toHaveBeenCalledTimes(1);
    expect(updateCalls[0].patch.slides).toEqual(v2Slides);
    expect(updateCalls[0].patch.formatVersion).toBe(2);
  });

  it('skips conversion when the version has no slides', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, slides: [], theme: {}, formatVersion: 2 },
    ]);
    selectQueue.push([
      { id: 99, deckId: 1, slides: [], theme: { foo: 'bar' }, formatVersion: 1 },
    ]);
    isV2SlidesMock.mockReturnValue(false);
    updateReturnQueue.push([{ id: 1 }]);

    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/99/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '99' }) },
    );
    expect(res.status).toBe(200);
    // empty slides → !isV2Slides path skipped because length==0, conversion not called
    expect(convertAllSlidesToV2Mock).not.toHaveBeenCalled();
    // formatVersion preserved from the version (1) because conversion path skipped
    expect(updateCalls[0].patch.formatVersion).toBe(1);
  });

  it('uses empty theme default when deck.theme is null/falsy in backup insert', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const deck = {
      id: 1,
      clientId: 5,
      slides: [{ id: 's-deck' }],
      theme: null,
      formatVersion: 2,
    };
    selectQueue.push([deck]);
    selectQueue.push([{ id: 99, deckId: 1, slides: [{ id: 's' }], theme: {}, formatVersion: 2 }]);
    isV2SlidesMock.mockReturnValue(true);
    updateReturnQueue.push([{ id: 1 }]);

    const res = await restoreRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions/99/restore', 'POST', {}),
      { params: Promise.resolve({ id: '1', versionId: '99' }) },
    );
    expect(res.status).toBe(200);
    const ivals = insertCalls[0].values as Record<string, unknown>;
    expect(ivals.theme).toEqual({});
  });
});

// ===========================================================================
// DELETE /api/portal/websites/[siteId]/api-keys/[keyId]
// ===========================================================================

describe('DELETE /api/portal/websites/[siteId]/api-keys/[keyId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeyRoute.DELETE(
      makeReq('http://x/api/portal/websites/1/api-keys/2', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', keyId: '2' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session.user.id is missing', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await apiKeyRoute.DELETE(
      makeReq('http://x/api/portal/websites/1/api-keys/2', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', keyId: '2' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await apiKeyRoute.DELETE(
      makeReq('http://x/api/portal/websites/1/api-keys/2', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', keyId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/not found/i);
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes the api key scoped to the site and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 11 });
    const res = await apiKeyRoute.DELETE(
      makeReq('http://x/api/portal/websites/1/api-keys/2', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', keyId: '2' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('apiKeys');
    // resolveClientSite called with parsed ints
    expect(resolveClientSiteMock).toHaveBeenCalledWith(7, 1);
  });
});

// ===========================================================================
// PATCH /api/portal/websites/[siteId]/branding-profile
// ===========================================================================

describe('PATCH /api/portal/websites/[siteId]/branding-profile', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {}) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session.user.id is missing', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {}) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {}) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
  });

  it('returns 404 when the website does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // site empty
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {}) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/website not found/i);
  });

  it('returns 404 when brandingProfileId does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // site found
    selectQueue.push([]); // branding profile not found
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {
        brandingProfileId: 88,
      }) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/branding profile not found/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('clears the branding profile when brandingProfileId is null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // site found
    updateReturnQueue.push([{ id: 1, brandingProfileId: null }]);
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {
        brandingProfileId: null,
      }) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.brandingProfileId).toBeNull();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('clientWebsites');
    expect(updateCalls[0].patch.brandingProfileId).toBeNull();
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('sets the branding profile when a valid brandingProfileId is supplied', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 88 }]); // profile exists for this client
    updateReturnQueue.push([{ id: 1, brandingProfileId: 88 }]);
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {
        brandingProfileId: 88,
      }) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.brandingProfileId).toBe(88);
  });

  it('treats omitted brandingProfileId in body as null (no validation lookup)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // site
    updateReturnQueue.push([{ id: 1, brandingProfileId: null }]);
    const res = await brandingProfileRoute.PATCH(
      makeJsonReq('http://x/api/portal/websites/1/branding-profile', 'PATCH', {}) as never,
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.brandingProfileId).toBeNull();
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/collaborators
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/collaborators', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session.user.id is missing', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/client not found/i);
  });

  it('returns 404 when the website does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // site empty
    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/website not found/i);
  });

  it('returns 400 when the website repo has not been provisioned', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, githubRepoName: null }]); // site without repo
    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/has not been provisioned/i);
  });

  it('returns 400 when the user has not connected GitHub', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, githubRepoName: 'org/repo' }]); // site
    selectQueue.push([]); // no github connection
    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/connect your github/i);
    expect(addCollaboratorMock).not.toHaveBeenCalled();
  });

  it('adds the user as a "push" collaborator by default', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, githubRepoName: 'org/repo' }]); // site
    selectQueue.push([{ userId: 7, githubUsername: 'testuser' }]);
    addCollaboratorMock.mockResolvedValue(undefined);

    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/added testuser/i);
    expect(addCollaboratorMock).toHaveBeenCalledWith('org/repo', 'testuser', 'push');
  });

  it('adds the user as an "admin" collaborator when requested', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, githubRepoName: 'org/repo' }]);
    selectQueue.push([{ userId: 7, githubUsername: 'testuser' }]);
    addCollaboratorMock.mockResolvedValue(undefined);

    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {
        permission: 'admin',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(addCollaboratorMock).toHaveBeenCalledWith('org/repo', 'testuser', 'admin');
  });

  it('coerces unknown permission values to "push"', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, githubRepoName: 'org/repo' }]);
    selectQueue.push([{ userId: 7, githubUsername: 'testuser' }]);
    addCollaboratorMock.mockResolvedValue(undefined);

    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {
        permission: 'maintain',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(addCollaboratorMock).toHaveBeenCalledWith('org/repo', 'testuser', 'push');
  });

  it('returns 500 with the error message when addCollaborator throws an Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, githubRepoName: 'org/repo' }]);
    selectQueue.push([{ userId: 7, githubUsername: 'testuser' }]);
    addCollaboratorMock.mockRejectedValue(new Error('github boom'));

    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('github boom');
  });

  it('returns 500 with a generic message when addCollaborator throws a non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, githubRepoName: 'org/repo' }]);
    selectQueue.push([{ userId: 7, githubUsername: 'testuser' }]);
    addCollaboratorMock.mockRejectedValue('plain string');

    const res = await collaboratorsRoute.POST(
      makeJsonReq('http://x/api/portal/websites/1/collaborators', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/failed to add collaborator/i);
  });
});
