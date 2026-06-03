/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for lib/auth.ts (NextAuth configuration).
 *
 * Strategy: NextAuth is a top-level call in lib/auth.ts that consumes a
 * config object containing the providers + callbacks. We mock `next-auth`
 * (and the Credentials provider) so we can CAPTURE the config object and
 * then exercise its callbacks/authorize fn directly. Drizzle's `db`,
 * `users` table, `eq`, and `bcryptjs.compare` are also mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mocks ----------------------------------------------------------------

// Capture the config object passed to NextAuth so we can inspect/invoke
// its callbacks and providers in tests.
let capturedConfig: any = null;

vi.mock('next-auth', () => {
  return {
    default: vi.fn((config: any) => {
      capturedConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn(),
      };
    }),
  };
});

// Credentials provider — pass-through so the authorize fn is preserved on
// the captured config.providers[0].
vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((opts: any) => ({
    id: 'credentials',
    name: 'Credentials',
    type: 'credentials',
    credentials: opts.credentials,
    authorize: opts.authorize,
  })),
}));

// bcryptjs.compare
const compareMock = vi.fn();
vi.mock('bcryptjs', () => ({
  compare: (...args: unknown[]) => compareMock(...args),
}));

// Drizzle eq — return a tagged marker so we can sanity-check it's used.
vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: true, col, val }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// users table marker
vi.mock('@/lib/db/schema', () => ({
  users: { __table: 'users', email: { __col: 'email' } },
}));

// db.select().from().where().limit() — programmable fixture.
let nextDbUser: any = null;
let dbCallChain: any[] = [];
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      dbCallChain.push('select');
      return {
        from: (_t: unknown) => {
          dbCallChain.push('from');
          return {
            where: (_w: unknown) => {
              dbCallChain.push('where');
              return {
                limit: async (_n: number) => {
                  dbCallChain.push('limit');
                  return nextDbUser ? [nextDbUser] : [];
                },
              };
            },
          };
        },
      };
    },
  },
}));

// ---- Module load ----------------------------------------------------------

// Importing the module triggers NextAuth(config) which populates
// capturedConfig.
const authModule = await import('@/lib/auth');

beforeEach(() => {
  nextDbUser = null;
  dbCallChain = [];
  compareMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---- Tests ----------------------------------------------------------------

describe('lib/auth — module exports', () => {
  it('exports handlers, signIn, signOut, auth', () => {
    expect(authModule.handlers).toBeDefined();
    expect(authModule.signIn).toBeDefined();
    expect(authModule.signOut).toBeDefined();
    expect(authModule.auth).toBeDefined();
  });

  it('captured the NextAuth config object', () => {
    expect(capturedConfig).toBeTruthy();
    expect(capturedConfig.providers).toHaveLength(1);
    expect(capturedConfig.callbacks).toBeTruthy();
  });
});

describe('lib/auth — session config', () => {
  it('uses jwt strategy with 7-day maxAge and 1-day updateAge', () => {
    expect(capturedConfig.session.strategy).toBe('jwt');
    expect(capturedConfig.session.maxAge).toBe(60 * 60 * 24 * 7);
    expect(capturedConfig.session.updateAge).toBe(60 * 60 * 24);
  });

  it('points signIn page to /portal/login', () => {
    // Default redirect target for unauthenticated /portal/* requests — the
    // admin shell opts into `/admin/login` via explicit signIn/signOut calls.
    expect(capturedConfig.pages.signIn).toBe('/portal/login');
  });
});

describe('lib/auth — cookie config', () => {
  it('sets sessionToken cookie options', () => {
    const c = capturedConfig.cookies.sessionToken;
    expect(c.options.httpOnly).toBe(true);
    expect(c.options.sameSite).toBe('lax');
    expect(c.options.path).toBe('/');
    // NODE_ENV is 'test' under vitest, so secure should be false and the
    // cookie name should be the non-secure variant.
    expect(c.options.secure).toBe(false);
    expect(c.name).toBe('authjs.session-token');
    expect(c.options.domain).toBeUndefined();
  });
});

describe('lib/auth — Credentials.authorize', () => {
  const authorize = () => capturedConfig.providers[0].authorize;

  it('returns null when credentials are missing', async () => {
    expect(await authorize()(undefined)).toBeNull();
    expect(await authorize()({})).toBeNull();
    expect(await authorize()({ email: '' })).toBeNull();
    expect(await authorize()({ email: 'a@b.com' })).toBeNull();
    expect(await authorize()({ password: 'pw' })).toBeNull();
  });

  it('returns null when user is not found in the database', async () => {
    nextDbUser = null;
    const result = await authorize()({ email: 'missing@test.com', password: 'pw' });
    expect(result).toBeNull();
    expect(dbCallChain).toEqual(['select', 'from', 'where', 'limit']);
  });

  it('returns null when user is inactive', async () => {
    nextDbUser = {
      id: 1,
      email: 'inactive@test.com',
      name: 'Inactive',
      role: 'editor',
      password: 'hashed',
      active: false,
    };
    const result = await authorize()({ email: 'inactive@test.com', password: 'pw' });
    expect(result).toBeNull();
    // Should short-circuit before bcrypt
    expect(compareMock).not.toHaveBeenCalled();
  });

  it('returns null when password is invalid', async () => {
    nextDbUser = {
      id: 2,
      email: 'a@test.com',
      name: 'A',
      role: 'editor',
      password: 'hashed',
      active: true,
    };
    compareMock.mockResolvedValueOnce(false);
    const result = await authorize()({ email: 'a@test.com', password: 'wrong' });
    expect(result).toBeNull();
    expect(compareMock).toHaveBeenCalledWith('wrong', 'hashed');
  });

  it('returns the user payload (id stringified) on success', async () => {
    nextDbUser = {
      id: 42,
      email: 'ok@test.com',
      name: 'Ok User',
      role: 'admin',
      password: 'hashed',
      active: true,
    };
    compareMock.mockResolvedValueOnce(true);
    const result = await authorize()({ email: 'ok@test.com', password: 'right' });
    expect(result).toEqual({
      id: '42',
      email: 'ok@test.com',
      name: 'Ok User',
      role: 'admin',
    });
  });
});

describe('lib/auth — jwt callback', () => {
  it('copies user.role onto token when user is provided', async () => {
    const out = await capturedConfig.callbacks.jwt({
      token: { sub: 'x' } as any,
      user: { role: 'client' } as any,
    });
    expect(out.role).toBe('client');
    expect(out.sub).toBe('x');
  });

  it('leaves token unchanged when no user is provided', async () => {
    const out = await capturedConfig.callbacks.jwt({
      token: { sub: 'y', role: 'admin' } as any,
      user: undefined as any,
    });
    expect(out).toEqual({ sub: 'y', role: 'admin' });
  });
});

describe('lib/auth — session callback', () => {
  it('hydrates session.user.id and role from token', async () => {
    const out = await capturedConfig.callbacks.session({
      session: { user: { email: 'a@b.com' } } as any,
      token: { sub: '7', role: 'editor' } as any,
    });
    expect(out.user.id).toBe('7');
    expect(out.user.role).toBe('editor');
    expect(out.user.email).toBe('a@b.com');
  });

  it('leaves session intact when session.user is missing', async () => {
    const session = {} as any;
    const out = await capturedConfig.callbacks.session({
      session,
      token: { sub: '7', role: 'editor' } as any,
    });
    expect(out).toBe(session);
    expect(out.user).toBeUndefined();
  });
});

// Helper to build the authorized callback param shape.
function authReq(pathname: string, opts: { user?: any; search?: string } = {}) {
  const url = new URL(`http://example.com${pathname}${opts.search ?? ''}`);
  return {
    auth: opts.user ? ({ user: opts.user } as any) : null,
    request: { nextUrl: url } as any,
  };
}

describe('lib/auth — authorized callback (admin paths)', () => {
  const authorized = () => capturedConfig.callbacks.authorized;

  it('allows /admin/login without auth', () => {
    const r = authorized()(authReq('/admin/login'));
    expect(r).toBe(true);
  });

  it('blocks unauthenticated /admin/*', () => {
    const r = authorized()(authReq('/admin/clients'));
    expect(r).toBe(false);
  });

  it('redirects client-role users away from admin', () => {
    const r = authorized()(authReq('/admin/clients', { user: { role: 'client' } }));
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBeGreaterThanOrEqual(300);
    expect((r as Response).headers.get('location')).toContain('/portal/dashboard');
  });

  it('allows admin-role users on admin paths', () => {
    const r = authorized()(authReq('/admin/clients', { user: { role: 'admin' } }));
    expect(r).toBe(true);
  });

  it('allows editor-role users on admin paths', () => {
    const r = authorized()(authReq('/admin/clients', { user: { role: 'editor' } }));
    expect(r).toBe(true);
  });
});

describe('lib/auth — authorized callback (portal paths)', () => {
  const authorized = () => capturedConfig.callbacks.authorized;

  it('redirects unauthenticated /portal/* to /portal/login with callbackUrl', () => {
    const r = authorized()(authReq('/portal/dashboard'));
    expect(r).toBeInstanceOf(Response);
    const loc = (r as Response).headers.get('location') ?? '';
    expect(loc).toContain('/portal/login');
    expect(loc).toContain('callbackUrl=');
    expect(decodeURIComponent(loc)).toContain('/portal/dashboard');
  });

  it('allows authenticated user on /portal/dashboard', () => {
    const r = authorized()(authReq('/portal/dashboard', { user: { role: 'client' } }));
    expect(r).toBe(true);
  });

  it('allows /portal/login without auth', () => {
    const r = authorized()(authReq('/portal/login'));
    expect(r).toBe(true);
  });

  it('allows /portal/forgot-password without auth', () => {
    const r = authorized()(authReq('/portal/forgot-password'));
    expect(r).toBe(true);
  });

  it('allows /portal/reset-password without auth', () => {
    const r = authorized()(authReq('/portal/reset-password'));
    expect(r).toBe(true);
  });

  it('allows /portal/invite/<token> without auth', () => {
    const r = authorized()(authReq('/portal/invite/abc123'));
    expect(r).toBe(true);
  });

  it('redirects logged-in user away from /portal/login', () => {
    const r = authorized()(authReq('/portal/login', { user: { role: 'client' } }));
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).headers.get('location')).toContain('/portal/dashboard');
  });

  it('honors a safe relative callbackUrl when redirecting from /portal/login', () => {
    const r = authorized()(
      authReq('/portal/login', {
        user: { role: 'client' },
        search: '?callbackUrl=%2Fportal%2Fbrain',
      }),
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).headers.get('location')).toContain('/portal/brain');
  });

  it('rejects absolute http callbackUrl and falls back to /portal/dashboard', () => {
    const r = authorized()(
      authReq('/portal/login', {
        user: { role: 'client' },
        search: '?callbackUrl=' + encodeURIComponent('https://evil.example.com'),
      }),
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).headers.get('location')).toContain('/portal/dashboard');
  });

  it('rejects protocol-relative callbackUrl and falls back to /portal/dashboard', () => {
    const r = authorized()(
      authReq('/portal/login', {
        user: { role: 'client' },
        search: '?callbackUrl=' + encodeURIComponent('//evil.example.com'),
      }),
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).headers.get('location')).toContain('/portal/dashboard');
  });

  it('rejects non-slash-prefixed callbackUrl', () => {
    const r = authorized()(
      authReq('/portal/login', {
        user: { role: 'client' },
        search: '?callbackUrl=evil',
      }),
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).headers.get('location')).toContain('/portal/dashboard');
  });
});

describe('lib/auth — authorized callback (other paths)', () => {
  const authorized = () => capturedConfig.callbacks.authorized;

  it('allows unauthenticated access to non-admin / non-portal paths', () => {
    expect(authorized()(authReq('/'))).toBe(true);
    expect(authorized()(authReq('/about'))).toBe(true);
    expect(authorized()(authReq('/pricing'))).toBe(true);
  });

  it('allows authenticated access to public paths', () => {
    expect(
      authorized()(authReq('/', { user: { role: 'admin' } })),
    ).toBe(true);
  });
});
