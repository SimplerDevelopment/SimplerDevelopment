// @vitest-environment node
/**
 * Unit tests for the storefront customer auth route handler (POST).
 *
 * Actions covered: register, login, logout, me, forgot-password,
 * reset-password, unknown action, and site-not-found.
 *
 * The route mixes direct drizzle queries (db.select().from().where().limit())
 * with calls into @/lib/storefront/customer-auth. We model db like the cart
 * test (FIFO `dbQueue` of canned results, thenable chain) and stub the
 * customer-auth + email + event-bus modules with vi.fn()s we can drive
 * per test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const dbQueue: unknown[] = [];

  function makeThenable(resolver: () => unknown) {
    const obj: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolver()).then(onFulfilled),
      where: vi.fn(() => makeThenable(resolver)),
      limit: vi.fn(() => makeThenable(resolver)),
      from: vi.fn(() => makeThenable(resolver)),
      values: vi.fn(() => makeThenable(resolver)),
      returning: vi.fn(() => makeThenable(resolver)),
      set: vi.fn(() => makeThenable(resolver)),
    };
    return obj;
  }

  function nextResult() {
    if (dbQueue.length === 0) {
      throw new Error('dbQueue exhausted — handler made more db calls than expected');
    }
    return dbQueue.shift();
  }

  const select = vi.fn(() => makeThenable(nextResult));
  const insert = vi.fn(() => makeThenable(nextResult));
  const update = vi.fn(() => makeThenable(nextResult));
  const del = vi.fn(() => makeThenable(nextResult));

  const db = { select, insert, update, delete: del };

  const registerCustomer = vi.fn();
  const loginCustomer = vi.fn();
  const validateSession = vi.fn();
  const destroySession = vi.fn();
  const extractToken = vi.fn();
  const createPasswordResetToken = vi.fn();
  const resetPassword = vi.fn();

  const sendTransactionalEmail = vi.fn(() => Promise.resolve());
  const emitEvent = vi.fn();

  return {
    dbQueue,
    db,
    select,
    insert,
    update,
    del,
    registerCustomer,
    loginCustomer,
    validateSession,
    destroySession,
    extractToken,
    createPasswordResetToken,
    resetPassword,
    sendTransactionalEmail,
    emitEvent,
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));

vi.mock('@/lib/db/schema', () => ({
  clientWebsites: {
    id: 'clientWebsites.id',
    domain: 'clientWebsites.domain',
    subdomain: 'clientWebsites.subdomain',
  },
  storeSettings: {
    websiteId: 'storeSettings.websiteId',
    enableCustomerAccounts: 'storeSettings.enableCustomerAccounts',
  },
  storeCustomers: {
    id: 'storeCustomers.id',
    websiteId: 'storeCustomers.websiteId',
    email: 'storeCustomers.email',
    firstName: 'storeCustomers.firstName',
    lastName: 'storeCustomers.lastName',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...conds: unknown[]) => ({ op: 'and', conds }),
}));

vi.mock('@/lib/storefront/customer-auth', () => ({
  registerCustomer: mocks.registerCustomer,
  loginCustomer: mocks.loginCustomer,
  validateSession: mocks.validateSession,
  destroySession: mocks.destroySession,
  extractToken: mocks.extractToken,
  createPasswordResetToken: mocks.createPasswordResetToken,
  resetPassword: mocks.resetPassword,
}));

vi.mock('@/lib/email/send-transactional', () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}));

vi.mock('@/lib/automation/event-bus', () => ({
  emitEvent: mocks.emitEvent,
}));

const { POST } = await import('@/app/api/storefront/[siteId]/auth/route');

const SITE = { id: 1 };

function queue(...items: unknown[]) {
  mocks.dbQueue.push(...items);
}

function paramsFor(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

function postReq(body: unknown) {
  return new Request('http://localhost/api/storefront/1/auth', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  mocks.dbQueue.length = 0;
  mocks.select.mockClear();
  mocks.insert.mockClear();
  mocks.update.mockClear();
  mocks.del.mockClear();
  mocks.registerCustomer.mockReset();
  mocks.loginCustomer.mockReset();
  mocks.validateSession.mockReset();
  mocks.destroySession.mockReset();
  mocks.extractToken.mockReset();
  mocks.createPasswordResetToken.mockReset();
  mocks.resetPassword.mockReset();
  mocks.sendTransactionalEmail.mockClear();
  mocks.sendTransactionalEmail.mockImplementation(() => Promise.resolve());
  mocks.emitEvent.mockClear();
});

// ---------- Site lookup ----------

describe('POST /api/storefront/[siteId]/auth — site lookup', () => {
  it('returns 404 when site does not exist', async () => {
    queue([]); // getSiteId returns no row
    const res = await POST(postReq({ action: 'login' }), paramsFor('999'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Site not found');
  });

  it('returns 400 for unknown action', async () => {
    queue([SITE]);
    const res = await POST(postReq({ action: 'nonsense' }), paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Unknown action: nonsense');
  });
});

// ---------- register ----------

describe('POST /api/storefront/[siteId]/auth — register', () => {
  it('returns 403 when customer accounts are not enabled', async () => {
    queue([SITE], [{ enabled: false }]);
    const res = await POST(
      postReq({ action: 'register', email: 'a@b.com', password: 'pw12345678' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Customer accounts are not enabled for this store');
  });

  it('treats missing settings row as disabled (defaults to false → 403)', async () => {
    queue([SITE], []);
    const res = await POST(
      postReq({ action: 'register', email: 'a@b.com', password: 'pw12345678' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when email or password missing', async () => {
    queue([SITE], [{ enabled: true }]);
    const res = await POST(
      postReq({ action: 'register', email: 'a@b.com' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Email and password are required');
  });

  it('returns 400 when password is too short', async () => {
    queue([SITE], [{ enabled: true }]);
    const res = await POST(
      postReq({ action: 'register', email: 'a@b.com', password: 'short' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Password must be at least 8 characters');
  });

  it('returns 409 when account already exists', async () => {
    queue([SITE], [{ enabled: true }], [{ id: 7 }]);
    const res = await POST(
      postReq({ action: 'register', email: 'a@b.com', password: 'pw12345678' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe('An account with this email already exists');
  });

  it('creates the account, fires the welcome email, emits an event, returns 201', async () => {
    queue([SITE], [{ enabled: true }], []); // site, settings, no existing
    const customer = {
      id: 42,
      email: 'a@b.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };
    mocks.registerCustomer.mockResolvedValue({ customer, token: 'tok-abc' });

    const res = await POST(
      postReq({
        action: 'register',
        email: 'A@B.com',
        password: 'pw12345678',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
      paramsFor('1'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('tok-abc');
    expect(body.data.customer).toEqual({
      id: 42,
      email: 'a@b.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendTransactionalEmail.mock.calls[0][0]).toMatchObject({
      websiteId: 1,
      event: 'account.welcome',
      to: 'a@b.com',
    });
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'crm.contact.created',
      1,
      0,
      expect.objectContaining({ customerId: 42, source: 'storefront_registration' }),
    );
  });

  it('swallows welcome email failures so the response is still 201', async () => {
    queue([SITE], [{ enabled: true }], []);
    const customer = { id: 43, email: 'c@d.com', firstName: null, lastName: null };
    mocks.registerCustomer.mockResolvedValue({ customer, token: 't' });
    mocks.sendTransactionalEmail.mockImplementation(() =>
      Promise.reject(new Error('smtp down')),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      postReq({ action: 'register', email: 'c@d.com', password: 'pw12345678' }),
      paramsFor('1'),
    );
    // Wait a microtask so the `.catch` on the dangling promise fires.
    await new Promise(r => setTimeout(r, 0));
    expect(res.status).toBe(201);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------- login ----------

describe('POST /api/storefront/[siteId]/auth — login', () => {
  it('returns 400 when email or password missing', async () => {
    queue([SITE]);
    const res = await POST(
      postReq({ action: 'login', email: 'a@b.com' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Email and password are required');
  });

  it('returns 401 when loginCustomer returns null', async () => {
    queue([SITE]);
    mocks.loginCustomer.mockResolvedValue(null);
    const res = await POST(
      postReq({ action: 'login', email: 'a@b.com', password: 'pw12345678' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Invalid email or password');
  });

  it('returns customer + token on success', async () => {
    queue([SITE]);
    mocks.loginCustomer.mockResolvedValue({
      token: 'tk',
      customer: { id: 9, email: 'a@b.com', firstName: 'A', lastName: 'B' },
    });
    const res = await POST(
      postReq({ action: 'login', email: 'a@b.com', password: 'pw12345678' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.token).toBe('tk');
    expect(body.data.customer).toEqual({
      id: 9,
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
    });
  });
});

// ---------- logout ----------

describe('POST /api/storefront/[siteId]/auth — logout', () => {
  it('succeeds with no token (no destroy call)', async () => {
    queue([SITE]);
    mocks.extractToken.mockReturnValue(null);
    const res = await POST(postReq({ action: 'logout' }), paramsFor('1'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mocks.destroySession).not.toHaveBeenCalled();
  });

  it('calls destroySession when a token is present', async () => {
    queue([SITE]);
    mocks.extractToken.mockReturnValue('tok-xyz');
    mocks.destroySession.mockResolvedValue(undefined);
    const res = await POST(postReq({ action: 'logout' }), paramsFor('1'));
    expect(res.status).toBe(200);
    expect(mocks.destroySession).toHaveBeenCalledWith('tok-xyz');
  });
});

// ---------- me ----------

describe('POST /api/storefront/[siteId]/auth — me', () => {
  it('returns 401 when no token is presented', async () => {
    queue([SITE]);
    mocks.extractToken.mockReturnValue(null);
    const res = await POST(postReq({ action: 'me' }), paramsFor('1'));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Not authenticated');
  });

  it('returns 401 when session is invalid', async () => {
    queue([SITE]);
    mocks.extractToken.mockReturnValue('tk');
    mocks.validateSession.mockResolvedValue(null);
    const res = await POST(postReq({ action: 'me' }), paramsFor('1'));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Invalid session');
  });

  it('returns 401 when session belongs to a different site', async () => {
    queue([SITE]);
    mocks.extractToken.mockReturnValue('tk');
    mocks.validateSession.mockResolvedValue({ websiteId: 99, customerId: 1 });
    const res = await POST(postReq({ action: 'me' }), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the customer row is missing', async () => {
    queue([SITE], []); // site lookup + customer lookup empty
    mocks.extractToken.mockReturnValue('tk');
    mocks.validateSession.mockResolvedValue({ websiteId: 1, customerId: 7 });
    const res = await POST(postReq({ action: 'me' }), paramsFor('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Customer not found');
  });

  it('returns the full customer profile when valid', async () => {
    const customer = {
      id: 7,
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      phone: '555',
      defaultShippingAddress: { city: 'NYC' },
      defaultBillingAddress: null,
      addressBook: [],
      orderCount: 3,
      totalSpent: 1234,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    queue([SITE], [customer]);
    mocks.extractToken.mockReturnValue('tk');
    mocks.validateSession.mockResolvedValue({ websiteId: 1, customerId: 7 });
    const res = await POST(postReq({ action: 'me' }), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id: 7,
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      phone: '555',
      defaultShippingAddress: { city: 'NYC' },
      defaultBillingAddress: null,
      addressBook: [],
      orderCount: 3,
      totalSpent: 1234,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

// ---------- forgot-password ----------

describe('POST /api/storefront/[siteId]/auth — forgot-password', () => {
  it('returns 400 when email is missing', async () => {
    queue([SITE]);
    const res = await POST(postReq({ action: 'forgot-password' }), paramsFor('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Email is required');
  });

  it('always returns success when no reset token is produced (does not reveal whether the email exists)', async () => {
    queue([SITE]);
    mocks.createPasswordResetToken.mockResolvedValue(null);
    const res = await POST(
      postReq({ action: 'forgot-password', email: 'a@b.com' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('uses custom domain when present in clientWebsites', async () => {
    queue(
      [SITE],
      [{ firstName: 'A', lastName: 'B' }],
      [{ domain: 'example.com', subdomain: null }],
    );
    mocks.createPasswordResetToken.mockResolvedValue('reset-tok');
    const res = await POST(
      postReq({ action: 'forgot-password', email: 'a@b.com' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = mocks.sendTransactionalEmail.mock.calls[0][0];
    expect(call.event).toBe('account.password_reset');
    expect(call.variables.resetUrl).toBe(
      'https://example.com/store/reset-password?token=reset-tok',
    );
  });

  it('falls back to subdomain when no custom domain', async () => {
    queue(
      [SITE],
      [], // no customer row → firstName/lastName empty
      [{ domain: null, subdomain: 'shop' }],
    );
    mocks.createPasswordResetToken.mockResolvedValue('reset-tok');
    const res = await POST(
      postReq({ action: 'forgot-password', email: 'a@b.com' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const call = mocks.sendTransactionalEmail.mock.calls[0][0];
    expect(call.variables.resetUrl).toBe(
      'https://shop.simplerdevelopment.com/store/reset-password?token=reset-tok',
    );
    expect(call.variables.fullName).toBe('a@b.com');
  });

  it('falls back to NEXTAUTH_URL when neither domain nor subdomain is set', async () => {
    const original = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = 'https://fallback.example';
    try {
      queue(
        [SITE],
        [{ firstName: null, lastName: null }],
        [{ domain: null, subdomain: null }],
      );
      mocks.createPasswordResetToken.mockResolvedValue('reset-tok');
      const res = await POST(
        postReq({ action: 'forgot-password', email: 'a@b.com' }),
        paramsFor('1'),
      );
      expect(res.status).toBe(200);
      const call = mocks.sendTransactionalEmail.mock.calls[0][0];
      expect(call.variables.resetUrl).toBe(
        'https://fallback.example/store/reset-password?token=reset-tok',
      );
    } finally {
      if (original === undefined) delete process.env.NEXTAUTH_URL;
      else process.env.NEXTAUTH_URL = original;
    }
  });

  it('falls back to the default URL when site row is missing and NEXTAUTH_URL is unset', async () => {
    const original = process.env.NEXTAUTH_URL;
    delete process.env.NEXTAUTH_URL;
    try {
      queue([SITE], [{ firstName: null, lastName: null }], []);
      mocks.createPasswordResetToken.mockResolvedValue('reset-tok');
      const res = await POST(
        postReq({ action: 'forgot-password', email: 'a@b.com' }),
        paramsFor('1'),
      );
      expect(res.status).toBe(200);
      const call = mocks.sendTransactionalEmail.mock.calls[0][0];
      expect(call.variables.resetUrl).toBe(
        'https://simplerdevelopment.com/store/reset-password?token=reset-tok',
      );
    } finally {
      if (original !== undefined) process.env.NEXTAUTH_URL = original;
    }
  });

  it('logs but swallows email send failures', async () => {
    queue(
      [SITE],
      [{ firstName: 'A', lastName: 'B' }],
      [{ domain: 'example.com', subdomain: null }],
    );
    mocks.createPasswordResetToken.mockResolvedValue('reset-tok');
    mocks.sendTransactionalEmail.mockImplementation(() =>
      Promise.reject(new Error('smtp down')),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(
      postReq({ action: 'forgot-password', email: 'a@b.com' }),
      paramsFor('1'),
    );
    await new Promise(r => setTimeout(r, 0));
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------- reset-password ----------

describe('POST /api/storefront/[siteId]/auth — reset-password', () => {
  it('returns 400 when token or password missing', async () => {
    queue([SITE]);
    const res = await POST(
      postReq({ action: 'reset-password', token: 'tk' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Token and password are required');
  });

  it('returns 400 when password is too short', async () => {
    queue([SITE]);
    const res = await POST(
      postReq({ action: 'reset-password', token: 'tk', password: 'short' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Password must be at least 8 characters');
  });

  it('returns 400 when resetPassword reports failure', async () => {
    queue([SITE]);
    mocks.resetPassword.mockResolvedValue(false);
    const res = await POST(
      postReq({ action: 'reset-password', token: 'tk', password: 'pw12345678' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid or expired reset token');
  });

  it('returns 200 when the password has been reset', async () => {
    queue([SITE]);
    mocks.resetPassword.mockResolvedValue(true);
    const res = await POST(
      postReq({ action: 'reset-password', token: 'tk', password: 'pw12345678' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Password has been reset.');
    expect(mocks.resetPassword).toHaveBeenCalledWith(1, 'tk', 'pw12345678');
  });
});
