// @vitest-environment node
/**
 * Unit tests for four unrelated portal API routes packed into one file:
 *
 *  1. GET / POST /api/portal/cms/websites/[siteId]/taxonomies
 *     - Auth gate (no session)
 *     - Site access gate (wrong tenant)
 *     - GET returns taxonomies (site-specific + global built-ins)
 *     - POST validation: name + slug required
 *     - POST conflict: slug already exists on that site
 *     - POST success: inserts new taxonomy
 *
 *  2. GET / POST /api/portal/cms/websites
 *     - Auth gate
 *     - "client not found" gate
 *     - GET returns sites for client
 *     - POST validation: name required
 *     - POST custom subdomain: validation error
 *     - POST custom subdomain: taken
 *     - POST custom subdomain: success
 *     - POST auto subdomain: generates from company/name
 *
 *  3. POST /api/portal/credits/pay-as-you-go
 *     - Auth gate
 *     - Client not found
 *     - Validation: enabled must be boolean
 *     - Success: flips flag + returns new balance
 *
 *  4. POST /api/portal/credits/purchase
 *     - Auth gate
 *     - Client not found
 *     - Stripe not configured
 *     - Validation: packageId required
 *     - Package not found
 *     - Existing stripe customer reused
 *     - Stripe customer created and persisted
 *
 * Everything external (auth, db, drizzle, portal client, subdomain helpers,
 * ai-credits helpers, Stripe) is mocked. No network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Shared schema + drizzle mocks
// ===========================================================================

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    clientWebsites: wrap('clientWebsites'),
    taxonomies: wrap('taxonomies'),
    clients: wrap('clients'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: () => ({ op: 'sql' }),
}));

// ===========================================================================
// Auth + portal client mocks
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// ===========================================================================
// Subdomain helpers
// ===========================================================================

const generateUniqueSubdomainMock = vi.fn();
const validateSubdomainMock = vi.fn();
const isSubdomainAvailableMock = vi.fn();
vi.mock('@/lib/subdomain', () => ({
  generateUniqueSubdomain: (...args: unknown[]) =>
    generateUniqueSubdomainMock(...args),
  validateSubdomain: (...args: unknown[]) => validateSubdomainMock(...args),
  isSubdomainAvailable: (...args: unknown[]) =>
    isSubdomainAvailableMock(...args),
}));

// ===========================================================================
// AI credits helpers
// ===========================================================================

const setPayAsYouGoMock = vi.fn();
const getBalanceMock = vi.fn();
const getCreditPackagesMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  setPayAsYouGo: (...args: unknown[]) => setPayAsYouGoMock(...args),
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
  getCreditPackages: (...args: unknown[]) => getCreditPackagesMock(...args),
}));

// ===========================================================================
// Stripe
// ===========================================================================

const stripeCustomersCreateMock = vi.fn();
const stripeCheckoutSessionsCreateMock = vi.fn();
vi.mock('stripe', () => {
  return {
    default: class FakeStripe {
      customers = { create: stripeCustomersCreateMock };
      checkout = { sessions: { create: stripeCheckoutSessionsCreateMock } };
      constructor(_key: string) {}
    },
  };
});

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  clientWebsites: Array<Record<string, unknown>>;
  taxonomies: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
}

const state: MockState = {
  clientWebsites: [],
  taxonomies: [],
  clients: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      // Coerce both sides for numeric id comparisons (parseInt + raw)
      const left = row[col.__col];
      const right = f.b;
      if (typeof left === 'number' && typeof right === 'string') {
        return left === parseInt(right, 10);
      }
      return left === right;
    }
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === null || row[col.__col] === undefined;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy(_arg: unknown) {
        return runQuery();
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => ({ ...r }));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = {
            ...v,
            id: v.id ?? nextId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        const result: Record<string, unknown> = {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        return result;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setValues: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(vals: Record<string, unknown>) {
        setValues = vals;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  return {
    db: {
      select() {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ===========================================================================
// Modules under test
// ===========================================================================

const taxonomiesRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/taxonomies/route'
);
const TAX_GET = taxonomiesRoute.GET;
const TAX_POST = taxonomiesRoute.POST;

const websitesRoute = await import('@/app/api/portal/cms/websites/route');
const SITES_GET = websitesRoute.GET;
const SITES_POST = websitesRoute.POST;

const payAsYouGoRoute = await import(
  '@/app/api/portal/credits/pay-as-you-go/route'
);
const PAYG_POST = payAsYouGoRoute.POST;

const purchaseRoute = await import('@/app/api/portal/credits/purchase/route');
const PURCHASE_POST = purchaseRoute.POST;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.clientWebsites.length = 0;
  state.taxonomies.length = 0;
  state.clients.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  getPortalClientMock.mockReset();

  generateUniqueSubdomainMock.mockReset();
  validateSubdomainMock.mockReset();
  isSubdomainAvailableMock.mockReset();

  setPayAsYouGoMock.mockReset();
  getBalanceMock.mockReset();
  getCreditPackagesMock.mockReset();

  stripeCustomersCreateMock.mockReset();
  stripeCheckoutSessionsCreateMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7', email: 'u@example.com' } });
  getPortalClientMock.mockResolvedValue({ id: 10, company: 'Acme Inc' });

  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

// ===========================================================================
// 1. /api/portal/cms/websites/[siteId]/taxonomies
// ===========================================================================

function taxParams(siteId: string): { params: Promise<{ siteId: string }> } {
  return { params: Promise.resolve({ siteId }) };
}

function makeTaxGetReq(): Request {
  return new Request('http://x/api/portal/cms/websites/55/taxonomies', {
    method: 'GET',
  });
}

function makeTaxPostReq(body: unknown): Request {
  return new Request('http://x/api/portal/cms/websites/55/taxonomies', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/portal/cms/websites/[siteId]/taxonomies', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await TAX_GET(makeTaxGetReq(), taxParams('55'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 401 when site does not belong to caller client', async () => {
    // No site row inserted for this client, so verifySiteAccess fails
    const res = await TAX_GET(makeTaxGetReq(), taxParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns site-specific + global built-in taxonomies', async () => {
    state.clientWebsites.push({ id: 55, clientId: 10 });
    state.taxonomies.push({
      id: 1,
      name: 'Category',
      slug: 'category',
      websiteId: null,
      builtIn: true,
    });
    state.taxonomies.push({
      id: 2,
      name: 'Custom',
      slug: 'custom',
      websiteId: 55,
      builtIn: false,
    });
    // unrelated site
    state.taxonomies.push({
      id: 3,
      name: 'Other site only',
      slug: 'other',
      websiteId: 999,
      builtIn: false,
    });

    const res = await TAX_GET(makeTaxGetReq(), taxParams('55'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const ids = json.data.map((r: { id: number }) => r.id).sort();
    expect(ids).toEqual([1, 2]);
  });
});

describe('POST /api/portal/cms/websites/[siteId]/taxonomies', () => {
  beforeEach(() => {
    state.clientWebsites.push({ id: 55, clientId: 10 });
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await TAX_POST(makeTaxPostReq({ name: 'x', slug: 'x' }), taxParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name or slug missing', async () => {
    const res1 = await TAX_POST(makeTaxPostReq({ slug: 'only-slug' }), taxParams('55'));
    expect(res1.status).toBe(400);
    const res2 = await TAX_POST(makeTaxPostReq({ name: 'only name' }), taxParams('55'));
    expect(res2.status).toBe(400);
  });

  it('returns 409 when slug already exists on this site', async () => {
    state.taxonomies.push({ id: 7, slug: 'tag', websiteId: 55 });
    const res = await TAX_POST(
      makeTaxPostReq({ name: 'Tag', slug: 'tag' }),
      taxParams('55'),
    );
    expect(res.status).toBe(409);
  });

  it('inserts and returns created taxonomy on success', async () => {
    const res = await TAX_POST(
      makeTaxPostReq({
        name: 'Genre',
        slug: 'genre',
        description: 'genres of stuff',
        icon: 'star',
        hierarchical: true,
      }),
      taxParams('55'),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Genre');
    expect(json.data.slug).toBe('genre');
    expect(json.data.websiteId).toBe(55);
    expect(json.data.builtIn).toBe(false);
    expect(json.data.hierarchical).toBe(true);
    expect(state.taxonomies.find((t) => t.slug === 'genre')).toBeTruthy();
  });

  it('defaults icon to "label" and description to null when omitted', async () => {
    const res = await TAX_POST(
      makeTaxPostReq({ name: 'Mood', slug: 'mood' }),
      taxParams('55'),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.icon).toBe('label');
    expect(json.data.description).toBeNull();
    expect(json.data.hierarchical).toBe(false);
  });
});

// ===========================================================================
// 2. /api/portal/cms/websites
// ===========================================================================

function makeSitesGetReq(): Request {
  return new Request('http://x/api/portal/cms/websites', { method: 'GET' });
}

function makeSitesPostReq(body: unknown): Request {
  return new Request('http://x/api/portal/cms/websites', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/portal/cms/websites', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await SITES_GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no client for user', async () => {
    getPortalClientMock.mockResolvedValue(null);
    const res = await SITES_GET();
    expect(res.status).toBe(404);
  });

  it('returns sites belonging to the client', async () => {
    state.clientWebsites.push({ id: 1, clientId: 10, name: 'a' });
    state.clientWebsites.push({ id: 2, clientId: 10, name: 'b' });
    state.clientWebsites.push({ id: 3, clientId: 999, name: 'other' });

    const res = await SITES_GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data.map((d: { id: number }) => d.id).sort()).toEqual([1, 2]);
  });
});

describe('POST /api/portal/cms/websites', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await SITES_POST(makeSitesPostReq({ name: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client missing', async () => {
    getPortalClientMock.mockResolvedValue(null);
    const res = await SITES_POST(makeSitesPostReq({ name: 'x' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    const res = await SITES_POST(makeSitesPostReq({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/name/i);
  });

  it('returns 400 when requested subdomain fails validation', async () => {
    validateSubdomainMock.mockReturnValue('bad subdomain');
    const res = await SITES_POST(
      makeSitesPostReq({ name: 'Site', subdomain: 'BAD!' }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe('bad subdomain');
  });

  it('returns 409 when requested subdomain is taken', async () => {
    validateSubdomainMock.mockReturnValue(null);
    isSubdomainAvailableMock.mockResolvedValue(false);
    const res = await SITES_POST(
      makeSitesPostReq({ name: 'Site', subdomain: 'taken' }),
    );
    expect(res.status).toBe(409);
  });

  it('inserts site with requested subdomain on success', async () => {
    validateSubdomainMock.mockReturnValue(null);
    isSubdomainAvailableMock.mockResolvedValue(true);
    const res = await SITES_POST(
      makeSitesPostReq({
        name: 'Site',
        subdomain: 'mysite',
        domain: 'example.com',
        description: 'hi',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.subdomain).toBe('mysite');
    expect(json.data.vercelDomain).toBe('mysite.simplerdevelopment.com');
    expect(json.data.domain).toBe('example.com');
    expect(json.data.deploymentStatus).toBe('active');
    expect(json.data.active).toBe(true);
    expect(json.data.clientId).toBe(10);
  });

  it('auto-generates subdomain when not provided', async () => {
    generateUniqueSubdomainMock.mockResolvedValue('acme-blog');
    const res = await SITES_POST(makeSitesPostReq({ name: 'Blog' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(generateUniqueSubdomainMock).toHaveBeenCalledWith('Acme Inc', 'Blog');
    expect(json.data.subdomain).toBe('acme-blog');
    expect(json.data.vercelDomain).toBe('acme-blog.simplerdevelopment.com');
    expect(json.data.domain).toBeNull();
    expect(json.data.description).toBeNull();
  });

  it('falls back to "site" when client has no company name', async () => {
    getPortalClientMock.mockResolvedValue({ id: 10, company: null });
    generateUniqueSubdomainMock.mockResolvedValue('site-blog');
    const res = await SITES_POST(makeSitesPostReq({ name: 'Blog' }));
    expect(res.status).toBe(200);
    expect(generateUniqueSubdomainMock).toHaveBeenCalledWith('site', 'Blog');
  });
});

// ===========================================================================
// 3. /api/portal/credits/pay-as-you-go
// ===========================================================================

function makePaygReq(body: unknown): Request {
  return new Request('http://x/api/portal/credits/pay-as-you-go', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/portal/credits/pay-as-you-go', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await PAYG_POST(makePaygReq({ enabled: true }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no client', async () => {
    getPortalClientMock.mockResolvedValue(null);
    const res = await PAYG_POST(makePaygReq({ enabled: true }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when enabled is not a boolean', async () => {
    const res = await PAYG_POST(makePaygReq({ enabled: 'yes' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/boolean/);
    expect(setPayAsYouGoMock).not.toHaveBeenCalled();
  });

  it('flips flag and returns new payAsYouGo value (true)', async () => {
    setPayAsYouGoMock.mockResolvedValue(undefined);
    getBalanceMock.mockResolvedValue({ balance: 0, payAsYouGo: true });
    const res = await PAYG_POST(makePaygReq({ enabled: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payAsYouGo).toBe(true);
    expect(setPayAsYouGoMock).toHaveBeenCalledWith(10, true);
    expect(getBalanceMock).toHaveBeenCalledWith(10);
  });

  it('flips flag and returns new payAsYouGo value (false)', async () => {
    setPayAsYouGoMock.mockResolvedValue(undefined);
    getBalanceMock.mockResolvedValue({ balance: 100, payAsYouGo: false });
    const res = await PAYG_POST(makePaygReq({ enabled: false }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payAsYouGo).toBe(false);
    expect(setPayAsYouGoMock).toHaveBeenCalledWith(10, false);
  });
});

// ===========================================================================
// 4. /api/portal/credits/purchase
// ===========================================================================

function makePurchaseReq(body: unknown): Request {
  return new Request('http://x/api/portal/credits/purchase', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/portal/credits/purchase', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await PURCHASE_POST(makePurchaseReq({ packageId: 'p1' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client missing', async () => {
    getPortalClientMock.mockResolvedValue(null);
    const res = await PURCHASE_POST(makePurchaseReq({ packageId: 'p1' }));
    expect(res.status).toBe(404);
  });

  it('returns 500 when STRIPE_SECRET_KEY is not configured', async () => {
    const res = await PURCHASE_POST(makePurchaseReq({ packageId: 'p1' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Stripe/);
  });

  it('returns 400 when packageId missing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    const res = await PURCHASE_POST(makePurchaseReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when package not found', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    getCreditPackagesMock.mockResolvedValue([
      { id: 'other', name: 'Other', tokens: 1000, price: 100 },
    ]);
    const res = await PURCHASE_POST(makePurchaseReq({ packageId: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('reuses existing stripe customer id and returns checkout url', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
    getPortalClientMock.mockResolvedValue({
      id: 10,
      company: 'Acme Inc',
      stripeCustomerId: 'cus_existing',
    });
    getCreditPackagesMock.mockResolvedValue([
      { id: 'p1', name: '100K Tokens', tokens: 100000, price: 1500 },
    ]);
    stripeCheckoutSessionsCreateMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/sess_abc',
    });

    const res = await PURCHASE_POST(makePurchaseReq({ packageId: 'p1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://checkout.stripe.test/sess_abc');
    // Did NOT create a new customer
    expect(stripeCustomersCreateMock).not.toHaveBeenCalled();
    expect(stripeCheckoutSessionsCreateMock).toHaveBeenCalledTimes(1);
    const arg = stripeCheckoutSessionsCreateMock.mock.calls[0][0];
    expect(arg.customer).toBe('cus_existing');
    expect(arg.mode).toBe('payment');
    expect(arg.line_items[0].price_data.unit_amount).toBe(1500);
    expect(arg.line_items[0].price_data.product_data.name).toBe('100K Tokens');
    expect(arg.line_items[0].price_data.product_data.description).toBe(
      '100K AI tokens',
    );
    expect(arg.metadata.type).toBe('credit_purchase');
    expect(arg.metadata.clientId).toBe('10');
    expect(arg.metadata.packageId).toBe('p1');
    expect(arg.metadata.tokens).toBe('100000');
    expect(arg.success_url).toBe(
      'https://example.test/portal/dashboard?credits=purchased',
    );
    expect(arg.cancel_url).toBe('https://example.test/portal/dashboard');
  });

  it('creates a new stripe customer and persists when missing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    getPortalClientMock.mockResolvedValue({
      id: 10,
      company: 'Acme Inc',
      stripeCustomerId: null,
    });
    state.clients.push({ id: 10, stripeCustomerId: null });
    getCreditPackagesMock.mockResolvedValue([
      { id: 'p1', name: '50K Tokens', tokens: 50000, price: 800 },
    ]);
    stripeCustomersCreateMock.mockResolvedValue({ id: 'cus_new_xyz' });
    stripeCheckoutSessionsCreateMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/sess_new',
    });

    const res = await PURCHASE_POST(makePurchaseReq({ packageId: 'p1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://checkout.stripe.test/sess_new');
    expect(stripeCustomersCreateMock).toHaveBeenCalledWith({
      email: 'u@example.com',
      name: 'Acme Inc',
    });
    // Persisted customer id back to clients row
    expect(state.clients[0].stripeCustomerId).toBe('cus_new_xyz');
    // Used new customer id for checkout
    const arg = stripeCheckoutSessionsCreateMock.mock.calls[0][0];
    expect(arg.customer).toBe('cus_new_xyz');
    // Default site url when env is unset
    expect(arg.success_url).toBe(
      'https://simplerdevelopment.com/portal/dashboard?credits=purchased',
    );
  });

  it('omits email and name when not present on session/client', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    authMock.mockResolvedValue({ user: { id: '7' } }); // no email
    getPortalClientMock.mockResolvedValue({
      id: 10,
      company: null,
      stripeCustomerId: null,
    });
    state.clients.push({ id: 10, stripeCustomerId: null });
    getCreditPackagesMock.mockResolvedValue([
      { id: 'p1', name: '10K Tokens', tokens: 10000, price: 200 },
    ]);
    stripeCustomersCreateMock.mockResolvedValue({ id: 'cus_bare' });
    stripeCheckoutSessionsCreateMock.mockResolvedValue({ url: 'u' });

    const res = await PURCHASE_POST(makePurchaseReq({ packageId: 'p1' }));
    expect(res.status).toBe(200);
    expect(stripeCustomersCreateMock).toHaveBeenCalledWith({});
  });
});
