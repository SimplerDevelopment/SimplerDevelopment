// @vitest-environment node
/**
 * Unit tests for four miscellaneous API routes (batch 27c):
 *   - app/api/cron/brain-daily-notes/route.ts       (GET/POST shared)
 *   - app/api/cron/resend-usage-sync/route.ts       (GET)
 *   - app/api/custom-fields/route.ts                (GET, POST)
 *   - app/api/google-webhook/drive/route.ts         (POST)
 *
 * All external deps (db, drizzle-orm, schema, brain helpers, google helpers)
 * are stubbed. These are pure unit tests of the route branching + envelope
 * shape. Real SQL execution is covered at the integration layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth mock — cuts transitive next-auth import chain:
//   brain-daily-notes → isBrainEntitled → portal-auth → @/lib/auth → next-auth
// None of the routes under test call auth() themselves; mock is load-only.
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// drizzle-orm + schema mocks
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  count: () => ({ op: 'count' }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'raw', s }),
    },
  ),
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
    brainNoteTemplates: wrap('brainNoteTemplates'),
    emailCampaigns: wrap('emailCampaigns'),
    emailCampaignSends: wrap('emailCampaignSends'),
    usageMeterEvents: wrap('usageMeterEvents'),
    customFields: wrap('customFields'),
    googleWorkspaceUserConnections: wrap('googleWorkspaceUserConnections'),
    clientMembers: wrap('clientMembers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB chain mock — supports select/insert/update with thenables
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertQueue: Array<Array<Record<string, unknown>>> = [];
let updateQueue: Array<Array<Record<string, unknown>>> = [];

const insertCalls: Array<{ table: string; values: unknown }> = [];
const updateSetCalls: Array<{ table: string; values: Record<string, unknown>; where: unknown }> = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftInsert(): Array<Record<string, unknown>> {
  return insertQueue.shift() ?? [];
}
function shiftUpdate(): Array<Record<string, unknown>> {
  return updateQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftSelect());
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
        limit() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
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

  function buildInsert(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      values(values: unknown) {
        insertCalls.push({ table: tableName, values });
        let materialized: Array<Record<string, unknown>> | null = null;
        const getRows = () => {
          if (materialized === null) materialized = shiftInsert();
          return materialized;
        };
        const inner: Record<string, unknown> = {};
        inner.onConflictDoNothing = () => Promise.resolve(getRows());
        inner.onConflictDoUpdate = () => Promise.resolve(getRows());
        inner.returning = () => Promise.resolve(getRows());
        inner.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(getRows()).then(onF, onR);
        return inner;
      },
    };
  }

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    let pendingValues: Record<string, unknown> = {};
    return {
      set(values: Record<string, unknown>) {
        pendingValues = values;
        return {
          where(w: unknown) {
            updateSetCalls.push({ table: tableName, values: pendingValues, where: w });
            const rows = shiftUpdate();
            return {
              returning: () => Promise.resolve(rows),
              then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
                Promise.resolve(rows).then(onF, onR),
            };
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
      insert(table: { __table?: string } | undefined) {
        return buildInsert(table);
      },
      update(table: { __table?: string } | undefined) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Brain helpers mock (for brain-daily-notes)
// ---------------------------------------------------------------------------

const applyTemplate = vi.fn();
const createNote = vi.fn();
const getNoteBySourceUrl = vi.fn();

vi.mock('@/lib/brain/template', () => ({
  applyTemplate: (...args: unknown[]) => applyTemplate(...args),
}));

vi.mock('@/lib/brain/notes', () => ({
  createNote: (...args: unknown[]) => createNote(...args),
  getNoteBySourceUrl: (...args: unknown[]) => getNoteBySourceUrl(...args),
}));

// ---------------------------------------------------------------------------
// Google helpers mock (for google-webhook/drive)
// ---------------------------------------------------------------------------

const refreshIfExpired = vi.fn();
const getTenantWorkspaceCredentialsByClientId = vi.fn();
const syncDriveChangesForConnection = vi.fn();
const findMeetRecordingsFolderId = vi.fn();

vi.mock('@/lib/google/oauth', () => ({
  refreshIfExpired: (...args: unknown[]) => refreshIfExpired(...args),
}));

vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...args: unknown[]) =>
    getTenantWorkspaceCredentialsByClientId(...args),
}));

vi.mock('@/lib/google/drive-changes', () => ({
  syncDriveChangesForConnection: (...args: unknown[]) => syncDriveChangesForConnection(...args),
  findMeetRecordingsFolderId: (...args: unknown[]) => findMeetRecordingsFolderId(...args),
}));

// ---------------------------------------------------------------------------
// cron-health mock — withCronHealth wraps (opts, handler) => handler.
// Stub it to a pass-through so its db.insert/db.update calls don't pollute
// the module-scoped insertCalls / updateSetCalls arrays.
// ---------------------------------------------------------------------------

vi.mock('@/lib/cron-health', () => ({
  withCronHealth: (_opts: unknown, fn: (req: Request) => Promise<Response>) => fn,
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

const brainDailyNotesRoute = await import('@/app/api/cron/brain-daily-notes/route');
const resendUsageSyncRoute = await import('@/app/api/cron/resend-usage-sync/route');
const customFieldsRoute = await import('@/app/api/custom-fields/route');
const driveWebhookRoute = await import('@/app/api/google-webhook/drive/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeJsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeNextRequest(url: string, init?: RequestInit): import('next/server').NextRequest {
  // Provide a minimal shape that NextRequest extends so the route can read
  // headers/json. Next's runtime wraps Request — the unit-test surrogate is
  // sufficient for our handler code paths.
  const req = new Request(url, init) as unknown as import('next/server').NextRequest;
  // Attach a nextUrl with searchParams shim derived from the real URL.
  const u = new URL(url);
  Object.defineProperty(req, 'nextUrl', {
    value: { searchParams: u.searchParams },
    configurable: true,
  });
  return req;
}

beforeEach(() => {
  selectQueue = [];
  insertQueue = [];
  updateQueue = [];
  insertCalls.length = 0;
  updateSetCalls.length = 0;
  applyTemplate.mockReset();
  createNote.mockReset();
  getNoteBySourceUrl.mockReset();
  refreshIfExpired.mockReset();
  getTenantWorkspaceCredentialsByClientId.mockReset();
  syncDriveChangesForConnection.mockReset();
  findMeetRecordingsFolderId.mockReset();
});

// ===========================================================================
// /api/cron/brain-daily-notes
// ===========================================================================

describe('/api/cron/brain-daily-notes', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('returns 401 when CRON_SECRET set and no auth provided', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await brainDailyNotesRoute.GET(makeReq('http://x/api/cron/brain-daily-notes'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when CRON_SECRET set but bearer mismatches', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { authorization: 'Bearer nope' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when CRON_SECRET is not configured at all (env-less)', async () => {
    delete process.env.CRON_SECRET;
    const res = await brainDailyNotesRoute.GET(makeReq('http://x/api/cron/brain-daily-notes'));
    // When CRON_SECRET is missing, !cronSecret is true → returns Unauthorized.
    expect(res.status).toBe(401);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]); // no templates
    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.examined).toBe(0);
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.failed).toBe(0);
    expect(typeof body.date).toBe('string');
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]);
    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('skips a template when a note already exists for the day', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        name: 'Today',
        body: 'hello',
        trigger: 'daily',
        enabled: true,
        defaultTags: ['tag1'],
        createdBy: 99,
      },
    ]);
    getNoteBySourceUrl.mockResolvedValue({ id: 555 });
    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.examined).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.created).toBe(0);
    expect(createNote).not.toHaveBeenCalled();
  });

  it('creates a note with formatted title for "Today" templates and adds the daily tag', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        name: 'Today',
        body: 'template body',
        trigger: 'daily',
        enabled: true,
        defaultTags: ['custom'],
        createdBy: 99,
      },
    ]);
    getNoteBySourceUrl.mockResolvedValue(null);
    applyTemplate.mockResolvedValue('rendered body');
    createNote.mockResolvedValue({ id: 1234 });

    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(0);
    expect(createNote).toHaveBeenCalledTimes(1);
    const arg = createNote.mock.calls[0]![0] as {
      clientId: number;
      title: string;
      body: string;
      tags: string[];
      source: string;
      sourceUrl: string;
      createdBy: number | null;
    };
    expect(arg.clientId).toBe(10);
    expect(arg.title).toMatch(/^Today — \d{4}-\d{2}-\d{2}$/);
    expect(arg.body).toBe('rendered body');
    // tag dedupe: 'custom' + 'daily'
    expect(arg.tags.sort()).toEqual(['custom', 'daily']);
    expect(arg.source).toBe('document_import');
    expect(arg.sourceUrl).toMatch(/^daily:\/\/1\/\d{4}-\d{2}-\d{2}$/);
    expect(arg.createdBy).toBe(99);
  });

  it('uses non-"Today" template name in title and handles null defaultTags', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 7,
        clientId: 4,
        name: 'Weekly Review',
        body: 'b',
        trigger: 'daily',
        enabled: true,
        defaultTags: null,
        createdBy: null,
      },
    ]);
    getNoteBySourceUrl.mockResolvedValue(null);
    applyTemplate.mockResolvedValue('rendered');
    createNote.mockResolvedValue({ id: 1 });

    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(createNote).toHaveBeenCalledTimes(1);
    const arg = createNote.mock.calls[0]![0] as { title: string; tags: string[]; createdBy: number | null };
    expect(arg.title).toMatch(/^Weekly Review — \d{4}-\d{2}-\d{2}$/);
    expect(arg.tags).toEqual(['daily']);
    expect(arg.createdBy).toBeNull();
  });

  it('captures per-template failures without crashing the run', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        name: 'A',
        body: 'b',
        trigger: 'daily',
        enabled: true,
        defaultTags: [],
        createdBy: 1,
      },
      {
        id: 2,
        clientId: 20,
        name: 'B',
        body: 'b',
        trigger: 'daily',
        enabled: true,
        defaultTags: [],
        createdBy: 1,
      },
    ]);
    getNoteBySourceUrl.mockResolvedValue(null);
    applyTemplate.mockImplementationOnce(() => {
      throw new Error('template syntax error');
    });
    applyTemplate.mockResolvedValueOnce('ok');
    createNote.mockResolvedValue({ id: 1 });

    // Suppress console.error
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    errSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.examined).toBe(2);
    expect(body.created).toBe(1);
    expect(body.failed).toBe(1);
    expect(Array.isArray(body.failures)).toBe(true);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].templateId).toBe(1);
    expect(body.failures[0].clientId).toBe(10);
    expect(body.failures[0].reason).toMatch(/template syntax error/);
  });

  it('caps `failures` array at 20 entries when many templates fail', async () => {
    process.env.CRON_SECRET = 'shh';
    const templates = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      clientId: 99,
      name: 'T',
      body: 'b',
      trigger: 'daily',
      enabled: true,
      defaultTags: [],
      createdBy: 1,
    }));
    selectQueue.push(templates);
    getNoteBySourceUrl.mockResolvedValue(null);
    applyTemplate.mockRejectedValue(new Error('boom'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await brainDailyNotesRoute.GET(
      makeReq('http://x/api/cron/brain-daily-notes', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    errSpy.mockRestore();
    const body = await res.json();
    expect(body.failed).toBe(25);
    expect(body.failures).toHaveLength(20);
  });

  it('POST is aliased to GET', async () => {
    expect(brainDailyNotesRoute.POST).toBe(brainDailyNotesRoute.GET);
  });
});

// ===========================================================================
// /api/cron/resend-usage-sync
// ===========================================================================

describe('/api/cron/resend-usage-sync', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('returns 401 when CRON_SECRET set and no auth provided', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await resendUsageSyncRoute.GET(makeReq('http://x/api/cron/resend-usage-sync'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when CRON_SECRET set but bearer mismatches', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await resendUsageSyncRoute.GET(
      makeReq('http://x/api/cron/resend-usage-sync', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('passes auth gate when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([]); // no rows
    const res = await resendUsageSyncRoute.GET(makeReq('http://x/api/cron/resend-usage-sync'));
    expect(res.status).toBe(200);
  });

  it('accepts the Vercel cron header without bearer', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]); // grouped query returns empty
    const res = await resendUsageSyncRoute.GET(
      makeReq('http://x/api/cron/resend-usage-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe('stub-local-count');
    expect(body.data.clientsSynced).toBe(0);
    expect(body.data.upserted).toBe(0);
    expect(typeof body.data.durationMs).toBe('number');
    expect(body.data.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    selectQueue.push([]);
    const res = await resendUsageSyncRoute.GET(
      makeReq('http://x/api/cron/resend-usage-sync', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('inserts a new usage_meter_events row when none exists for the period', async () => {
    delete process.env.CRON_SECRET;
    // Grouped select: one client with 42 sends
    selectQueue.push([{ clientId: 5, sendCount: 42 }]);
    // Existing lookup → empty (no row yet)
    selectQueue.push([]);
    // Insert returning rows (unused; the route doesn't read them)
    insertQueue.push([{ id: 1 }]);

    const res = await resendUsageSyncRoute.GET(
      makeReq('http://x/api/cron/resend-usage-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clientsSynced).toBe(1);
    expect(body.data.upserted).toBe(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.table).toBe('usageMeterEvents');
    const v = insertCalls[0]!.values as Record<string, unknown>;
    expect(v.clientId).toBe(5);
    expect(v.resource).toBe('email_send');
    expect(v.amount).toBe('42');
    expect(v.source).toBe('resend');
    expect(typeof v.period).toBe('string');
  });

  it('updates the existing row when one already exists for the period', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([{ clientId: 8, sendCount: 100 }]);
    selectQueue.push([{ id: 777 }]); // existing usage_meter_events row
    updateQueue.push([{ id: 777 }]);

    const res = await resendUsageSyncRoute.GET(
      makeReq('http://x/api/cron/resend-usage-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.upserted).toBe(1);
    expect(insertCalls).toHaveLength(0);
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]!.table).toBe('usageMeterEvents');
    expect(updateSetCalls[0]!.values.amount).toBe('100');
    expect(updateSetCalls[0]!.values.recordedAt).toBeInstanceOf(Date);
  });

  it('skips rows where clientId is null', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      { clientId: null, sendCount: 50 },
      { clientId: 9, sendCount: 25 },
    ]);
    // For the second (non-null) row only: lookup, then insert
    selectQueue.push([]); // existing lookup → none
    insertQueue.push([{ id: 1 }]);

    const res = await resendUsageSyncRoute.GET(
      makeReq('http://x/api/cron/resend-usage-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clientsSynced).toBe(2); // rows.length from grouped query
    expect(body.data.upserted).toBe(1); // only non-null client
    expect(insertCalls).toHaveLength(1);
    expect((insertCalls[0]!.values as { clientId: number }).clientId).toBe(9);
  });

  it('handles multiple non-null clients (mixed insert + update)', async () => {
    delete process.env.CRON_SECRET;
    selectQueue.push([
      { clientId: 1, sendCount: 10 },
      { clientId: 2, sendCount: 20 },
    ]);
    selectQueue.push([]); // lookup for client 1 — none → insert
    insertQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 200 }]); // lookup for client 2 — existing → update
    updateQueue.push([{ id: 200 }]);

    const res = await resendUsageSyncRoute.GET(
      makeReq('http://x/api/cron/resend-usage-sync', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.upserted).toBe(2);
    expect(insertCalls).toHaveLength(1);
    expect(updateSetCalls).toHaveLength(1);
  });
});

// ===========================================================================
// /api/custom-fields
// ===========================================================================

describe('/api/custom-fields', () => {
  describe('GET', () => {
    it('returns 200 with all custom fields when no postTypeId param', async () => {
      selectQueue.push([
        { id: 1, postTypeId: 1, name: 'A', slug: 'a', fieldType: 'text', order: 0 },
        { id: 2, postTypeId: 2, name: 'B', slug: 'b', fieldType: 'number', order: 1 },
      ]);
      const res = await customFieldsRoute.GET(
        makeNextRequest('http://x/api/custom-fields'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].slug).toBe('a');
    });

    it('returns filtered results when postTypeId provided', async () => {
      selectQueue.push([
        { id: 1, postTypeId: 5, name: 'A', slug: 'a', fieldType: 'text', order: 0 },
      ]);
      const res = await customFieldsRoute.GET(
        makeNextRequest('http://x/api/custom-fields?postTypeId=5'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].postTypeId).toBe(5);
    });

    it('returns 400 when postTypeId is not numeric', async () => {
      const res = await customFieldsRoute.GET(
        makeNextRequest('http://x/api/custom-fields?postTypeId=abc'),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/Invalid post type ID/);
    });

    it('returns 200 with empty array when no rows', async () => {
      selectQueue.push([]);
      const res = await customFieldsRoute.GET(
        makeNextRequest('http://x/api/custom-fields'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('returns 500 when db.select throws', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // No selectQueue entry — but our chain.then returns [] for missing queue.
      // To force an error, monkeypatch: we re-mock via a single-call by making
      // the next select call throw. Easiest: push a Proxy that errors on .then.
      // Simpler: stub db.select to throw via mock once.
      const dbModule = await import('@/lib/db');
      const originalSelect = dbModule.db.select;
      (dbModule.db as { select: () => unknown }).select = () => {
        throw new Error('connection lost');
      };
      try {
        const res = await customFieldsRoute.GET(
          makeNextRequest('http://x/api/custom-fields'),
        );
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/Failed to fetch custom fields/);
      } finally {
        (dbModule.db as { select: unknown }).select = originalSelect;
        errSpy.mockRestore();
      }
    });
  });

  describe('POST', () => {
    it('creates a custom field with valid payload', async () => {
      insertQueue.push([
        {
          id: 9,
          postTypeId: 1,
          name: 'Color',
          slug: 'color',
          fieldType: 'text',
          required: false,
          order: 0,
        },
      ]);
      const res = await customFieldsRoute.POST(
        makeJsonReq('http://x/api/custom-fields', {
          postTypeId: 1,
          name: 'Color',
          slug: 'color',
          fieldType: 'text',
        }) as unknown as import('next/server').NextRequest,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(9);
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0]!.table).toBe('customFields');
      const v = insertCalls[0]!.values as Record<string, unknown>;
      expect(v.name).toBe('Color');
      expect(v.slug).toBe('color');
      expect(v.fieldType).toBe('text');
      // options omitted in payload → normalized to null
      expect(v.options).toBeNull();
      // zod default for required is false
      expect(v.required).toBe(false);
    });

    it('passes through options array', async () => {
      insertQueue.push([{ id: 10 }]);
      await customFieldsRoute.POST(
        makeJsonReq('http://x/api/custom-fields', {
          postTypeId: 2,
          name: 'Size',
          slug: 'size',
          fieldType: 'select',
          options: ['S', 'M', 'L'],
        }) as unknown as import('next/server').NextRequest,
      );
      expect(insertCalls).toHaveLength(1);
      const v = insertCalls[0]!.values as Record<string, unknown>;
      expect(v.options).toEqual(['S', 'M', 'L']);
    });

    it('returns 400 when name is missing', async () => {
      const res = await customFieldsRoute.POST(
        makeJsonReq('http://x/api/custom-fields', {
          postTypeId: 1,
          slug: 'color',
          fieldType: 'text',
        }) as unknown as import('next/server').NextRequest,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/Validation error/);
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it('returns 400 when fieldType is invalid', async () => {
      const res = await customFieldsRoute.POST(
        makeJsonReq('http://x/api/custom-fields', {
          postTypeId: 1,
          name: 'X',
          slug: 'x',
          fieldType: 'bogus',
        }) as unknown as import('next/server').NextRequest,
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when postTypeId is not a positive int', async () => {
      const res = await customFieldsRoute.POST(
        makeJsonReq('http://x/api/custom-fields', {
          postTypeId: 0,
          name: 'X',
          slug: 'x',
          fieldType: 'text',
        }) as unknown as import('next/server').NextRequest,
      );
      expect(res.status).toBe(400);
    });

    it('returns 500 when db.insert throws', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dbModule = await import('@/lib/db');
      const originalInsert = dbModule.db.insert;
      (dbModule.db as { insert: unknown }).insert = () => {
        throw new Error('db down');
      };
      try {
        const res = await customFieldsRoute.POST(
          makeJsonReq('http://x/api/custom-fields', {
            postTypeId: 1,
            name: 'Color',
            slug: 'color',
            fieldType: 'text',
          }) as unknown as import('next/server').NextRequest,
        );
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toMatch(/Failed to create custom field/);
      } finally {
        (dbModule.db as { insert: unknown }).insert = originalInsert;
        errSpy.mockRestore();
      }
    });
  });
});

// ===========================================================================
// /api/google-webhook/drive
// ===========================================================================

describe('POST /api/google-webhook/drive', () => {
  function makeDriveReq(headers: Record<string, string>): import('next/server').NextRequest {
    return makeNextRequest('http://x/api/google-webhook/drive', {
      method: 'POST',
      headers,
    });
  }

  it('returns 400 when X-Goog-Channel-Id missing', async () => {
    const res = await driveWebhookRoute.POST(makeDriveReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_channel_id');
  });

  it('returns 404 when channel id is not registered', async () => {
    selectQueue.push([]); // no connection
    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'unknown-chan',
        'x-goog-channel-token': 't',
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('unknown_channel');
  });

  it('returns 401 when channel token mismatches stored token', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'expected-secret',
        driveStartPageToken: '123',
      },
    ]);
    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'wrong',
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
  });

  it('returns 401 when channel token header missing entirely', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'expected',
        driveStartPageToken: '1',
      },
    ]);
    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('acks the initial "sync" handshake without running drive sync', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '999',
      },
    ]);
    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'sync',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe('sync_ack');
    expect(syncDriveChangesForConnection).not.toHaveBeenCalled();
    expect(getTenantWorkspaceCredentialsByClientId).not.toHaveBeenCalled();
  });

  it('returns tenant_unavailable when no tenant credentials', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '1',
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockResolvedValue(null);

    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'change',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe('tenant_unavailable');
    expect(syncDriveChangesForConnection).not.toHaveBeenCalled();
  });

  it('returns tenant_unavailable when tenant.status is revoked', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '1',
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockResolvedValue({
      status: 'revoked',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'u' },
    });

    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'change',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('tenant_unavailable');
  });

  it('returns no_watermark when driveStartPageToken is null', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: null,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'u' },
    });
    refreshIfExpired.mockResolvedValue({
      refreshed: false,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(),
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'change',
      }),
    );
    warnSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('no_watermark');
    expect(syncDriveChangesForConnection).not.toHaveBeenCalled();
  });

  it('persists refreshed tokens before syncing', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '42',
        accessToken: 'old',
        refreshToken: 'old-r',
        expiresAt: new Date(0),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'u' },
    });
    const newExpiry = new Date(Date.now() + 3600_000);
    refreshIfExpired.mockResolvedValue({
      refreshed: true,
      accessToken: 'new',
      refreshToken: 'new-r',
      expiresAt: newExpiry,
    });
    updateQueue.push([]); // for the refresh-persist UPDATE
    findMeetRecordingsFolderId.mockResolvedValue('folder-xyz');
    syncDriveChangesForConnection.mockResolvedValue({ ingested: 2, scanned: 5 });

    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'change',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe('change');
    expect(body.ingested).toBe(2);
    expect(body.scanned).toBe(5);

    // Persisted refreshed tokens before sync
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]!.table).toBe('googleWorkspaceUserConnections');
    expect(updateSetCalls[0]!.values.accessToken).toBe('new');
    expect(updateSetCalls[0]!.values.refreshToken).toBe('new-r');
    expect(updateSetCalls[0]!.values.expiresAt).toBe(newExpiry);
    expect(updateSetCalls[0]!.values.updatedAt).toBeInstanceOf(Date);

    // Sync was called with refreshed tokens
    expect(syncDriveChangesForConnection).toHaveBeenCalledTimes(1);
    const args = syncDriveChangesForConnection.mock.calls[0]![0] as {
      clientId: number;
      userId: number;
      meetRecordingsFolderId: string;
      connection: { accessToken: string; driveStartPageToken: string };
    };
    expect(args.clientId).toBe(7);
    expect(args.userId).toBe(11);
    expect(args.meetRecordingsFolderId).toBe('folder-xyz');
    expect(args.connection.accessToken).toBe('new');
    expect(args.connection.driveStartPageToken).toBe('42');
  });

  it('does not persist when refresh returns refreshed=false', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '42',
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'u' },
    });
    refreshIfExpired.mockResolvedValue({
      refreshed: false,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(),
    });
    findMeetRecordingsFolderId.mockResolvedValue(null);
    syncDriveChangesForConnection.mockResolvedValue({ ingested: 0, scanned: 0 });

    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'change',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSetCalls).toHaveLength(0);
    expect(syncDriveChangesForConnection).toHaveBeenCalledTimes(1);
  });

  it('returns error_logged (still 200) when sync throws', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '42',
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'u' },
    });
    refreshIfExpired.mockResolvedValue({
      refreshed: false,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(),
    });
    findMeetRecordingsFolderId.mockResolvedValue(null);
    syncDriveChangesForConnection.mockRejectedValue(new Error('drive api 503'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'change',
      }),
    );
    errSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe('error_logged');
  });

  it('returns error_logged when tenant lookup throws', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '42',
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockRejectedValue(new Error('boom'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'change',
      }),
    );
    errSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('error_logged');
  });

  it('echoes resourceState in the response body for change events', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 7,
        userId: 11,
        driveChannelId: 'chan-1',
        driveChannelToken: 'secret',
        driveStartPageToken: '42',
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
      },
    ]);
    getTenantWorkspaceCredentialsByClientId.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'g', clientSecret: 's', redirectUri: 'u' },
    });
    refreshIfExpired.mockResolvedValue({
      refreshed: false,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date(),
    });
    findMeetRecordingsFolderId.mockResolvedValue('folder-1');
    syncDriveChangesForConnection.mockResolvedValue({ ingested: 1, scanned: 3 });

    const res = await driveWebhookRoute.POST(
      makeDriveReq({
        'x-goog-channel-id': 'chan-1',
        'x-goog-channel-token': 'secret',
        'x-goog-resource-state': 'update',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('update');
  });
});
