// @vitest-environment node
/**
 * Batch 29h — unit tests for 4 portal CMS website route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/cms/websites/[siteId]/email-templates/route.ts               (GET, POST)
 *  - app/api/portal/cms/websites/[siteId]/email-templates/seed-defaults/route.ts (POST)
 *  - app/api/portal/cms/websites/[siteId]/media/route.ts                         (GET)
 *  - app/api/portal/cms/websites/[siteId]/media/[id]/route.ts                    (PUT, DELETE)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update/delete are mocked to capture
 * writes and emit the next queued return rows.
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

const renderBlocksToEmailHtmlMock = vi.fn();
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => renderBlocksToEmailHtmlMock(...args),
}));

const getEventDefinitionMock = vi.fn();
vi.mock('@/lib/email/website-email-events', () => ({
  getEventDefinition: (...args: unknown[]) => getEventDefinitionMock(...args),
}));

const getDefaultTemplatesMock = vi.fn();
vi.mock('@/lib/email/default-email-templates', () => ({
  getDefaultTemplates: (...args: unknown[]) => getDefaultTemplatesMock(...args),
}));

const applyBrandingToBlocksMock = vi.fn();
const brandingProfileToEmailBrandingMock = vi.fn();
vi.mock('@/lib/email/apply-branding-to-blocks', () => ({
  applyBrandingToBlocks: (...args: unknown[]) => applyBrandingToBlocksMock(...args),
  brandingProfileToEmailBranding: (...args: unknown[]) => brandingProfileToEmailBrandingMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
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
    websiteEmailTemplates: wrap('websiteEmailTemplates'),
    clientWebsites: wrap('clientWebsites'),
    brandingProfiles: wrap('brandingProfiles'),
    clients: wrap('clients'),
    media: wrap('media'),
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
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
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

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const rows = deleteReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        deleteCalls.push({ table: table.__table, filter, returnedRows: cloned });
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
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const emailTemplatesRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/email-templates/route'
);
const seedDefaultsRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/email-templates/seed-defaults/route'
);
const mediaRoute = await import('@/app/api/portal/cms/websites/[siteId]/media/route');
const mediaIdRoute = await import('@/app/api/portal/cms/websites/[siteId]/media/[id]/route');

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
  deleteReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
  renderBlocksToEmailHtmlMock.mockReset().mockReturnValue('<html>rendered</html>');
  getEventDefinitionMock.mockReset();
  getDefaultTemplatesMock.mockReset().mockReturnValue([]);
  applyBrandingToBlocksMock.mockReset().mockImplementation((blocks: unknown) => blocks);
  brandingProfileToEmailBrandingMock.mockReset().mockReturnValue({
    primaryColor: '#000',
    companyName: 'TestCo',
  });
});

// ===========================================================================
// GET /api/portal/cms/websites/[siteId]/email-templates
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/email-templates', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.GET(
      makeReq('http://x/api/portal/cms/websites/1/email-templates'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.GET(
      makeReq('http://x/api/portal/cms/websites/1/email-templates'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns existing templates ordered by event', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([
      { id: 1, event: 'welcome', websiteId: 42 },
      { id: 2, event: 'subscription_created', websiteId: 42 },
    ]);
    const res = await emailTemplatesRoute.GET(
      makeReq('http://x/api/portal/cms/websites/1/email-templates'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

// ===========================================================================
// POST /api/portal/cms/websites/[siteId]/email-templates
// ===========================================================================

describe('POST /api/portal/cms/websites/[siteId]/email-templates', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {
        event: 'welcome',
        name: 'Welcome',
        subject: 'Hi',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when required fields are missing', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {
        name: 'Welcome',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/event, name, and subject/i);
  });

  it('creates template with explicit branding profile and uses provided htmlContent', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getEventDefinitionMock.mockReturnValue({
      variables: [{ name: 'firstName', sample: 'Alice' }],
      isRequired: true,
    });
    // select sequence:
    //   1) brandingProfiles lookup by id
    //   2) clientWebsites for companyName branch (siteRow.clientId)
    //   3) clients lookup
    selectQueue.push([{ id: 99, primaryColor: '#abc' }]); // branding profile row
    selectQueue.push([{ clientId: 5 }]); // siteRow for client lookup
    selectQueue.push([{ company: 'Acme' }]); // client row
    insertReturnQueue.push([
      { id: 1001, event: 'welcome', websiteId: 42, htmlContent: '<p>raw</p>' },
    ]);

    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {
        event: 'welcome',
        name: 'Welcome',
        subject: 'Hi',
        description: 'desc',
        htmlContent: '<p>raw</p>',
        brandingProfileId: 99,
        enabled: false,
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1001);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('websiteEmailTemplates');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.event).toBe('welcome');
    expect(inserted.brandingProfileId).toBe(99);
    expect(inserted.enabled).toBe(false);
    expect(inserted.isRequired).toBe(true);
    expect(inserted.variables).toEqual([{ name: 'firstName', sample: 'Alice' }]);
    expect(inserted.htmlContent).toBe('<p>raw</p>'); // no blocks → kept as-is
  });

  it('resolves website branding profile, applies default-template blocks, and renders html', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getEventDefinitionMock.mockReturnValue({ variables: [], isRequired: false });
    getDefaultTemplatesMock.mockReturnValue([
      { event: 'welcome', blocks: [{ type: 'text', content: 'hi' }] },
    ]);
    // select sequence (no explicit brandingProfileId):
    //   1) clientWebsites for site brandingProfileId/clientId
    //   2) brandingProfiles lookup by id
    //   3) clientWebsites again for companyName branch
    //   4) clients lookup
    selectQueue.push([{ brandingProfileId: 77, clientId: 5 }]); // site row
    selectQueue.push([{ id: 77, primaryColor: '#aaa' }]); // profile row
    selectQueue.push([{ clientId: 5 }]); // siteRow again
    selectQueue.push([{ company: 'Acme' }]); // client row
    insertReturnQueue.push([{ id: 1002, event: 'welcome' }]);

    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {
        event: 'welcome',
        name: 'Welcome',
        subject: 'Hi',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(201);
    expect(applyBrandingToBlocksMock).toHaveBeenCalled();
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalled();
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.brandingProfileId).toBe(77);
    expect(inserted.htmlContent).toBe('<html>rendered</html>');
    expect((inserted.blockContent as { version: string }).version).toBe('1');
  });

  it('falls back to client-default branding profile when website has none', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getEventDefinitionMock.mockReturnValue(undefined);
    getDefaultTemplatesMock.mockReturnValue([]);
    // select sequence:
    //   1) clientWebsites — no brandingProfileId but clientId set
    //   2) brandingProfiles by clientId — return one
    //   3) brandingProfiles full row by id
    //   4) clientWebsites again for companyName
    //   5) clients
    selectQueue.push([{ brandingProfileId: null, clientId: 5 }]);
    selectQueue.push([{ id: 88 }]); // default profile id
    selectQueue.push([{ id: 88, primaryColor: '#bbb' }]); // full profile
    selectQueue.push([{ clientId: 5 }]);
    selectQueue.push([{ company: 'Acme' }]);
    insertReturnQueue.push([{ id: 1003, event: 'custom_event' }]);

    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {
        event: 'custom_event',
        name: 'C',
        subject: 'S',
        htmlContent: '<p>x</p>',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.brandingProfileId).toBe(88);
    expect(inserted.isRequired).toBe(false);
    expect(inserted.variables).toEqual([]);
  });

  it('handles case with no branding profile resolvable (no clientId)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getEventDefinitionMock.mockReturnValue({ variables: [], isRequired: false });
    getDefaultTemplatesMock.mockReturnValue([]);
    selectQueue.push([{ brandingProfileId: null, clientId: null }]); // no fallback path
    insertReturnQueue.push([{ id: 1004 }]);

    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {
        event: 'e',
        name: 'n',
        subject: 's',
        htmlContent: '<p>x</p>',
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.brandingProfileId).toBeNull();
    expect(applyBrandingToBlocksMock).not.toHaveBeenCalled();
  });

  it('uses caller-provided blockContent and renders html from it', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getEventDefinitionMock.mockReturnValue({ variables: [], isRequired: false });
    // No branding profile path
    selectQueue.push([{ brandingProfileId: null, clientId: null }]);
    insertReturnQueue.push([{ id: 1005 }]);

    const res = await emailTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates', 'POST', {
        event: 'e',
        name: 'n',
        subject: 's',
        blockContent: { blocks: [{ type: 'heading', text: 'Hi' }] },
      }),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(201);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalled();
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.htmlContent).toBe('<html>rendered</html>');
  });
});

// ===========================================================================
// POST /api/portal/cms/websites/[siteId]/email-templates/seed-defaults
// ===========================================================================

describe('POST /api/portal/cms/websites/[siteId]/email-templates/seed-defaults', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await seedDefaultsRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates/seed-defaults', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await seedDefaultsRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates/seed-defaults', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns success with created=0 when all templates already exist', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ event: 'welcome' }, { event: 'goodbye' }]); // existing events
    getDefaultTemplatesMock.mockReturnValue([
      { event: 'welcome', blocks: [], htmlContent: '<p>w</p>' },
      { event: 'goodbye', blocks: [], htmlContent: '<p>g</p>' },
    ]);

    const res = await seedDefaultsRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates/seed-defaults', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(0);
    expect(insertCalls).toHaveLength(0);
  });

  it('seeds missing templates using website branding profile and renders branded HTML', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // existing templates: none
    getDefaultTemplatesMock.mockReturnValue([
      {
        event: 'welcome',
        name: 'Welcome',
        subject: 'Hi',
        description: 'd',
        htmlContent: '<p>fallback</p>',
        blocks: [{ type: 'text', content: 'block' }],
        variables: [],
        isRequired: true,
      },
    ]);
    // siteRow w/ branding profile id
    selectQueue.push([{ brandingProfileId: 77, clientId: 5 }]);
    selectQueue.push([{ id: 77, primaryColor: '#aaa' }]); // profile
    selectQueue.push([{ company: 'Acme' }]); // client
    insertReturnQueue.push([
      { id: 1001, event: 'welcome', websiteId: 42 },
    ]);

    const res = await seedDefaultsRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates/seed-defaults', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(insertCalls).toHaveLength(1);
    expect(applyBrandingToBlocksMock).toHaveBeenCalled();
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalled();
    const insertVals = insertCalls[0].values as Array<Record<string, unknown>>;
    expect(insertVals).toHaveLength(1);
    expect(insertVals[0].event).toBe('welcome');
    expect(insertVals[0].brandingProfileId).toBe(77);
    expect(insertVals[0].htmlContent).toBe('<html>rendered</html>');
  });

  it('falls back to client default branding profile when website has none', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // existing
    getDefaultTemplatesMock.mockReturnValue([
      {
        event: 'evt',
        name: 'n',
        subject: 's',
        description: null,
        htmlContent: '<p>fallback</p>',
        blocks: [{ type: 'text', content: 'block' }],
        variables: [],
        isRequired: false,
      },
    ]);
    selectQueue.push([{ brandingProfileId: null, clientId: 5 }]); // site row
    selectQueue.push([{ id: 88 }]); // brandingProfiles by clientId
    selectQueue.push([{ id: 88, primaryColor: '#bbb' }]); // full profile
    selectQueue.push([{ company: 'Acme' }]); // client row
    insertReturnQueue.push([{ id: 2001, event: 'evt' }]);

    const res = await seedDefaultsRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates/seed-defaults', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const insertVals = insertCalls[0].values as Array<Record<string, unknown>>;
    expect(insertVals[0].brandingProfileId).toBe(88);
  });

  it('inserts unbranded HTML when no branding profile is resolvable and uses default htmlContent when no blocks', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // existing
    getDefaultTemplatesMock.mockReturnValue([
      {
        event: 'evt',
        name: 'n',
        subject: 's',
        description: null,
        htmlContent: '<p>fallback</p>',
        blocks: [], // empty blocks → use htmlContent fallback
        variables: [],
        isRequired: false,
      },
    ]);
    selectQueue.push([{ brandingProfileId: null, clientId: null }]); // no fallback
    insertReturnQueue.push([{ id: 3001, event: 'evt' }]);

    const res = await seedDefaultsRoute.POST(
      makeJsonReq('http://x/api/portal/cms/websites/1/email-templates/seed-defaults', 'POST', {}),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const insertVals = insertCalls[0].values as Array<Record<string, unknown>>;
    expect(insertVals[0].brandingProfileId).toBeNull();
    expect(insertVals[0].htmlContent).toBe('<p>fallback</p>'); // no blocks ⇒ no rendering
    expect(applyBrandingToBlocksMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/portal/cms/websites/[siteId]/media
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/media', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaRoute.GET(
      makeReq('http://x/api/portal/cms/websites/1/media'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await mediaRoute.GET(
      makeReq('http://x/api/portal/cms/websites/1/media'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getPortalClientMock.mockResolvedValue(null);
    const res = await mediaRoute.GET(
      makeReq('http://x/api/portal/cms/websites/1/media'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns rows with pagination metadata (default params)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // select sequence:
    //   1) brandingProfiles list
    //   2) media rows
    //   3) count
    selectQueue.push([
      { id: 11, name: 'Brand A' },
      { id: 12, name: 'Brand B' },
    ]);
    selectQueue.push([
      { id: 1, filename: 'a.png', mimeType: 'image/png', brandingProfileId: 11 },
      { id: 2, filename: 'b.jpg', mimeType: 'image/jpeg', brandingProfileId: null },
    ]);
    selectQueue.push([{ count: 2 }]);

    const res = await mediaRoute.GET(
      makeReq('http://x/api/portal/cms/websites/1/media'),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.brandingProfiles).toHaveLength(2);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
  });

  it('honors search, mimeType and unassigned brandingProfileId filters', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // profiles
    selectQueue.push([{ id: 7, filename: 'foo.png' }]); // rows
    selectQueue.push([{ count: 1 }]);

    const res = await mediaRoute.GET(
      makeReq(
        'http://x/api/portal/cms/websites/1/media?limit=5&offset=10&search=foo&mimeType=image&brandingProfileId=unassigned',
      ),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ limit: 5, offset: 10, total: 1 });
  });

  it('honors numeric brandingProfileId filter and mimeType=all (skips mime filter)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(
      makeReq(
        'http://x/api/portal/cms/websites/1/media?brandingProfileId=42&mimeType=all',
      ),
      { params: Promise.resolve({ siteId: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });
});

// ===========================================================================
// PUT /api/portal/cms/websites/[siteId]/media/[id]
// ===========================================================================

describe('PUT /api/portal/cms/websites/[siteId]/media/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1/media/9', 'PUT', { alt: 'x' }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1/media/9', 'PUT', { alt: 'x' }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when no matching media row is updated', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    // updateReturnQueue is empty → returning() yields []
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1/media/9', 'PUT', { alt: 'x' }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('updates alt + caption and returns the updated row', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    updateReturnQueue.push([{ id: 9, alt: 'new alt', caption: 'new caption' }]);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1/media/9', 'PUT', {
        alt: 'new alt',
        caption: 'new caption',
      }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('media');
    expect(updateCalls[0].patch).toMatchObject({ alt: 'new alt', caption: 'new caption' });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('converts empty-string alt/caption to null', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    updateReturnQueue.push([{ id: 9, alt: null, caption: null }]);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1/media/9', 'PUT', {
        alt: '',
        caption: '',
      }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({ alt: null, caption: null });
  });

  it('omits alt/caption from patch when not provided in body', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    updateReturnQueue.push([{ id: 9 }]);
    const res = await mediaIdRoute.PUT(
      makeJsonReq('http://x/api/portal/cms/websites/1/media/9', 'PUT', {}),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).not.toHaveProperty('alt');
    expect(updateCalls[0].patch).not.toHaveProperty('caption');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// DELETE /api/portal/cms/websites/[siteId]/media/[id]
// ===========================================================================

describe('DELETE /api/portal/cms/websites/[siteId]/media/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/cms/websites/1/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/cms/websites/1/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when no row was deleted', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    // deleteReturnQueue empty → returning() yields []
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/cms/websites/1/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('deletes and reports success when a row is removed', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 42 });
    deleteReturnQueue.push([{ id: 9, websiteId: 42 }]);
    const res = await mediaIdRoute.DELETE(
      makeReq('http://x/api/portal/cms/websites/1/media/9', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '1', id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/deleted/i);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('media');
  });
});
