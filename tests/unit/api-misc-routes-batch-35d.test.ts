// @vitest-environment node
/**
 * Batch 35d — unit tests for four small API route.ts files:
 *
 *   1. app/api/users/route.ts                              (GET, POST)
 *   2. app/api/v1/sites/[siteId]/blocks/route.ts           (GET)
 *   3. app/api/v1/sites/[siteId]/branding/route.ts         (GET)
 *   4. app/api/v1/sites/[siteId]/categories/route.ts       (GET)
 *
 * Everything underneath the routes is mocked: auth, withApiKeyAndCors
 * (made a passthrough), the @/lib/db fluent builder, schema column refs,
 * drizzle helpers, bcryptjs, verifySiteActive, and the branding helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const hashMock = vi.fn(async (pw: string) => `HASHED(${pw})`);
vi.mock('bcryptjs', () => ({
  hash: (...args: unknown[]) => hashMock(...(args as [string, number])),
}));

// withApiKeyAndCors becomes a passthrough so the underlying handler is
// exercised directly without any API-key validation.
vi.mock('@/lib/api-key-middleware', () => ({
  withApiKeyAndCors: (handler: unknown) => handler,
}));

const verifySiteActiveMock = vi.fn();
vi.mock('@/lib/data/posts', () => ({
  verifySiteActive: (...args: unknown[]) => verifySiteActiveMock(...args),
}));

const getBrandingByWebsiteIdMock = vi.fn();
const brandingToCssVarsMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandingByWebsiteId: (...args: unknown[]) =>
    getBrandingByWebsiteIdMock(...args),
  brandingToCssVars: (...args: unknown[]) => brandingToCssVarsMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) => {
    const target: Record<string, unknown> = {
      __table: name,
      __isTable: true,
      $inferSelect: {},
    };
    return new Proxy(target, {
      get(t: Record<string, unknown>, prop: string) {
        if (prop === '__table') return name;
        if (prop === '__isTable') return true;
        if (prop === '$inferSelect') return t.$inferSelect;
        if (prop === 'then') return undefined;
        if (typeof prop === 'symbol') return undefined;
        return { __col: prop, __table: name };
      },
    });
  };
  return {
    users: wrap('users'),
    categories: wrap('categories'),
  };
});

// ---- in-memory state ----

interface State {
  users: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  nextUserId: number;
  insertShouldThrow: boolean;
  selectShouldThrow: boolean;
}

const state: State = {
  users: [],
  categories: [],
  nextUserId: 1,
  insertShouldThrow: false,
  selectShouldThrow: false,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'users':
      return state.users;
    case 'categories':
      return state.categories;
    default:
      return [];
  }
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
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (state.selectShouldThrow) throw new Error('select failed');
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) =>
        evalPredicate(filter, r),
      );
      // Apply projection (mirror the keys requested)
      const out = rows.map((r) => {
        if (!projection) return { ...r };
        const proj: Record<string, unknown> = {};
        for (const key of Object.keys(projection)) {
          proj[key] = r[key];
        }
        return proj;
      });
      return Promise.resolve(out);
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: unknown) {
        if (state.insertShouldThrow) {
          return {
            returning() {
              return Promise.reject(new Error('insert failed'));
            },
          };
        }
        const arr = tableArray(table.__table);
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const v of list) {
          const row: Record<string, unknown> = {
            ...(v as Record<string, unknown>),
          };
          if (table.__table === 'users') {
            row.id = String(state.nextUserId++);
            row.createdAt = new Date('2026-03-01T00:00:00Z');
            row.updatedAt = new Date('2026-03-01T00:00:00Z');
          }
          arr.push(row);
          inserted.push(row);
        }
        return {
          returning(projection?: Record<string, unknown>) {
            const result = inserted.map((r) => {
              if (!projection) return { ...r };
              const proj: Record<string, unknown> = {};
              for (const key of Object.keys(projection)) {
                proj[key] = r[key];
              }
              return proj;
            });
            return Promise.resolve(result);
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const usersMod = await import('@/app/api/users/route');
const blocksV1Mod = await import('@/app/api/v1/sites/[siteId]/blocks/route');
const brandingV1Mod = await import(
  '@/app/api/v1/sites/[siteId]/branding/route'
);
const categoriesV1Mod = await import(
  '@/app/api/v1/sites/[siteId]/categories/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method: string, url: string, body?: unknown): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function siteCtx(siteId = '1') {
  return { params: Promise.resolve({ siteId }) };
}

beforeEach(() => {
  state.users.length = 0;
  state.categories.length = 0;
  state.nextUserId = 1;
  state.insertShouldThrow = false;
  state.selectShouldThrow = false;

  authMock.mockReset();
  hashMock.mockClear();
  verifySiteActiveMock.mockReset();
  getBrandingByWebsiteIdMock.mockReset();
  brandingToCssVarsMock.mockReset();

  // Default: a logged-in admin
  authMock.mockResolvedValue({
    user: { id: 'u1', role: 'admin' },
  });
});

// ---------------------------------------------------------------------------
// /api/users
// ---------------------------------------------------------------------------

describe('GET /api/users', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await usersMod.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await usersMod.GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not admin or editor', async () => {
    authMock.mockResolvedValueOnce({
      user: { id: 'u1', role: 'viewer' },
    });
    const res = await usersMod.GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Forbidden' });
  });

  it('returns 403 when role is missing', async () => {
    authMock.mockResolvedValueOnce({
      user: { id: 'u1' },
    });
    const res = await usersMod.GET();
    expect(res.status).toBe(403);
  });

  it('returns an empty list for admin when no users exist', async () => {
    const res = await usersMod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it('returns the list of users for an editor', async () => {
    authMock.mockResolvedValueOnce({
      user: { id: 'u1', role: 'editor' },
    });
    state.users.push({
      id: 'a',
      name: 'Alice',
      email: 'a@x.com',
      role: 'admin',
      active: true,
      password: 'should-not-leak',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
    state.users.push({
      id: 'b',
      name: 'Bob',
      email: 'b@x.com',
      role: 'editor',
      active: false,
      password: 'should-not-leak',
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
    });
    const res = await usersMod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).not.toHaveProperty('password');
    expect(body.data.map((u: { name: string }) => u.name)).toEqual([
      'Alice',
      'Bob',
    ]);
  });

  it('returns 500 when the DB throws', async () => {
    state.selectShouldThrow = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await usersMod.GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to fetch users' });
    errSpy.mockRestore();
  });
});

describe('POST /api/users', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', { name: 'N' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is insufficient', async () => {
    authMock.mockResolvedValueOnce({
      user: { id: 'u1', role: 'viewer' },
    });
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', { name: 'N' }) as never,
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when validation fails (missing fields)', async () => {
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', {}) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 400 when email is invalid', async () => {
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', {
        name: 'A',
        email: 'not-an-email',
        password: 'secret123',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', {
        name: 'A',
        email: 'a@x.com',
        password: '123',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is not in the enum', async () => {
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', {
        name: 'A',
        email: 'a@x.com',
        password: 'secret123',
        role: 'super-admin',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('creates a user with defaults (role=editor, active=true), hashes the password, and does not leak it', async () => {
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', {
        name: 'New User',
        email: 'new@x.com',
        password: 'secret123',
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New User');
    expect(body.data.email).toBe('new@x.com');
    expect(body.data.role).toBe('editor');
    expect(body.data.active).toBe(true);
    expect(body.data).not.toHaveProperty('password');
    expect(hashMock).toHaveBeenCalledWith('secret123', 10);
    // Persisted user should hold the HASHED password, not raw
    expect(state.users[0].password).toBe('HASHED(secret123)');
  });

  it('honors explicit role and active=false', async () => {
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', {
        name: 'Admin User',
        email: 'admin@x.com',
        password: 'secret123',
        role: 'admin',
        active: false,
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.role).toBe('admin');
    expect(body.data.active).toBe(false);
  });

  it('returns 500 when the insert throws', async () => {
    state.insertShouldThrow = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await usersMod.POST(
      makeReq('POST', 'http://x/users', {
        name: 'N',
        email: 'n@x.com',
        password: 'secret123',
      }) as never,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to create user' });
    errSpy.mockRestore();
  });

  it('returns 500 when the body is not JSON', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = new Request('http://x/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await usersMod.POST(req as never);
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// /api/v1/sites/[siteId]/blocks
// ---------------------------------------------------------------------------

describe('GET /api/v1/sites/[siteId]/blocks', () => {
  it('returns a 200 success envelope with the static blocks catalog', async () => {
    const res = await blocksV1Mod.GET(
      makeReq('GET', 'http://x/blocks'),
      siteCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('every catalog entry has type, name, category, and inputs', async () => {
    const res = await blocksV1Mod.GET(
      makeReq('GET', 'http://x/blocks'),
      siteCtx(),
    );
    const body = await res.json();
    for (const block of body.data) {
      expect(typeof block.type).toBe('string');
      expect(typeof block.name).toBe('string');
      expect(typeof block.category).toBe('string');
      expect(Array.isArray(block.inputs)).toBe(true);
    }
  });

  it('every catalog entry has a unique type', async () => {
    const res = await blocksV1Mod.GET(
      makeReq('GET', 'http://x/blocks'),
      siteCtx(),
    );
    const body = await res.json();
    const types = body.data.map((b: { type: string }) => b.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('exposes the expected categories', async () => {
    const res = await blocksV1Mod.GET(
      makeReq('GET', 'http://x/blocks'),
      siteCtx(),
    );
    const body = await res.json();
    const cats = new Set(body.data.map((b: { category: string }) => b.category));
    expect(cats.has('basic')).toBe(true);
    expect(cats.has('layout')).toBe(true);
    expect(cats.has('component')).toBe(true);
    expect(cats.has('media')).toBe(true);
    expect(cats.has('ecommerce')).toBe(true);
  });

  it('includes the core basic blocks', async () => {
    const res = await blocksV1Mod.GET(
      makeReq('GET', 'http://x/blocks'),
      siteCtx(),
    );
    const body = await res.json();
    const types = new Set(body.data.map((b: { type: string }) => b.type));
    for (const t of ['text', 'heading', 'image', 'button', 'spacer']) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('is deterministic across calls', async () => {
    const a = await (
      await blocksV1Mod.GET(makeReq('GET', 'http://x/blocks'), siteCtx())
    ).json();
    const b = await (
      await blocksV1Mod.GET(makeReq('GET', 'http://x/blocks'), siteCtx())
    ).json();
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// /api/v1/sites/[siteId]/branding
// ---------------------------------------------------------------------------

describe('GET /api/v1/sites/[siteId]/branding', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await brandingV1Mod.GET(
      makeReq('GET', 'http://x/branding'),
      siteCtx('abc'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid site ID');
  });

  it('returns 404 when the site is not active', async () => {
    verifySiteActiveMock.mockResolvedValueOnce(null);
    const res = await brandingV1Mod.GET(
      makeReq('GET', 'http://x/branding'),
      siteCtx('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns branding + cssVars when the site is active', async () => {
    verifySiteActiveMock.mockResolvedValueOnce({ id: 1, active: true });
    const fakeBranding = { primaryColor: '#000', logoUrl: 'x.png' };
    const fakeVars = { '--brand-primary': '#000' };
    getBrandingByWebsiteIdMock.mockResolvedValueOnce(fakeBranding);
    brandingToCssVarsMock.mockReturnValueOnce(fakeVars);

    const res = await brandingV1Mod.GET(
      makeReq('GET', 'http://x/branding'),
      siteCtx('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(fakeBranding);
    expect(body.cssVars).toEqual(fakeVars);
    expect(getBrandingByWebsiteIdMock).toHaveBeenCalledWith(1);
    expect(brandingToCssVarsMock).toHaveBeenCalledWith(fakeBranding);
  });

  it('parses the siteId before passing to verifySiteActive', async () => {
    verifySiteActiveMock.mockResolvedValueOnce({ id: 42 });
    getBrandingByWebsiteIdMock.mockResolvedValueOnce({});
    brandingToCssVarsMock.mockReturnValueOnce({});

    await brandingV1Mod.GET(
      makeReq('GET', 'http://x/branding'),
      siteCtx('42'),
    );
    expect(verifySiteActiveMock).toHaveBeenCalledWith(42);
  });
});

// ---------------------------------------------------------------------------
// /api/v1/sites/[siteId]/categories
// ---------------------------------------------------------------------------

describe('GET /api/v1/sites/[siteId]/categories', () => {
  it('returns 400 when siteId is not numeric', async () => {
    const res = await categoriesV1Mod.GET(
      makeReq('GET', 'http://x/categories'),
      siteCtx('notnum'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid site ID');
  });

  it('returns 404 when the site is not active', async () => {
    verifySiteActiveMock.mockResolvedValueOnce(null);
    const res = await categoriesV1Mod.GET(
      makeReq('GET', 'http://x/categories'),
      siteCtx('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns empty data when site has no categories', async () => {
    verifySiteActiveMock.mockResolvedValueOnce({ id: 1, active: true });
    const res = await categoriesV1Mod.GET(
      makeReq('GET', 'http://x/categories'),
      siteCtx('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it('returns only the categories scoped to the requested site', async () => {
    verifySiteActiveMock.mockResolvedValueOnce({ id: 5, active: true });
    state.categories.push({
      id: 1,
      name: 'A',
      slug: 'a',
      description: 'desc A',
      color: '#fff',
      websiteId: 5,
    });
    state.categories.push({
      id: 2,
      name: 'B',
      slug: 'b',
      description: 'desc B',
      color: '#000',
      websiteId: 5,
    });
    state.categories.push({
      id: 3,
      name: 'OtherSite',
      slug: 'other',
      description: '',
      color: '',
      websiteId: 999,
    });

    const res = await categoriesV1Mod.GET(
      makeReq('GET', 'http://x/categories'),
      siteCtx('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((c: { name: string }) => c.name).sort()).toEqual([
      'A',
      'B',
    ]);
    // Projection must exclude websiteId
    expect(body.data[0]).not.toHaveProperty('websiteId');
  });

  it('parses the siteId before passing to verifySiteActive', async () => {
    verifySiteActiveMock.mockResolvedValueOnce({ id: 7 });
    await categoriesV1Mod.GET(
      makeReq('GET', 'http://x/categories'),
      siteCtx('7'),
    );
    expect(verifySiteActiveMock).toHaveBeenCalledWith(7);
  });
});
