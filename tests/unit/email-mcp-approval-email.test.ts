// @vitest-environment node
/**
 * Unit tests for lib/email/mcp-approval-email.ts.
 *
 * The SUT loads a client row, a list of recipient users, and a cooldown count
 * per user from Drizzle, then dispatches per-recipient emails via Resend with
 * a per-user flurry cooldown. We mock @/lib/db with a chainable query builder
 * whose returned rows are seeded per test, plus drizzle-orm operators and the
 * resend client. Env-driven gates (EMAILS_ENABLED, RESEND_API_KEY) are
 * exercised by re-importing the module after mutating process.env via
 * vi.resetModules().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared state — vi.hoisted runs before all vi.mock factories so
// they can safely close over these references.
// ---------------------------------------------------------------------------
const H = vi.hoisted(() => {
  interface DbState {
    clientRow: Array<Record<string, unknown>>;
    recipientUsers: Array<Record<string, unknown>>;
    recentCounts: Array<Record<string, unknown>>;
    // If set, the next select() call that hits this table throws.
    throwOnTable: string | null;
  }
  const dbState: DbState = {
    clientRow: [],
    recipientUsers: [],
    recentCounts: [],
    throwOnTable: null,
  };
  return {
    dbState,
    resendSendMock: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    crmNotifications: wrap('crmNotifications'),
    users: wrap('users'),
    clients: wrap('clients'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  gt: (a: unknown, b: unknown) => ({ op: 'gt', a, b }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign(
    (...args: unknown[]) => ({ op: 'sql', args }),
    {},
  ),
}));

vi.mock('@/lib/db', () => {
  const makeQuery = (selection?: Record<string, unknown>) => {
    let table = '';
    const chain: Record<string, unknown> = {
      from(t: { __table: string }) {
        table = t.__table;
        if (H.dbState.throwOnTable === table) {
          throw new Error('db boom');
        }
        return chain;
      },
      where() {
        return chain;
      },
      groupBy() {
        // For crmNotifications group-by aggregate query, return the seeded rows.
        return H.dbState.recentCounts;
      },
      limit() {
        if (table === 'clients') return H.dbState.clientRow;
        return [];
      },
      then(onFulfilled: (rows: unknown) => unknown) {
        // Awaiting the chain directly (no .limit/.groupBy) — return the users list.
        if (table === 'users') return Promise.resolve(H.dbState.recipientUsers).then(onFulfilled);
        return Promise.resolve([]).then(onFulfilled);
      },
    };
    // Mark the chain so we can detect the field-selection.
    chain.__selection = selection;
    return chain;
  };
  return {
    db: {
      select(selection?: Record<string, unknown>) {
        return makeQuery(selection);
      },
    },
  };
});

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => H.resendSendMock(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Env restoration
// ---------------------------------------------------------------------------
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;
const ORIGINAL_FROM = process.env.RESEND_FROM_EMAIL;
const ORIGINAL_API_KEY = process.env.RESEND_API_KEY;
const ORIGINAL_ENABLED = process.env.MCP_APPROVAL_EMAILS_ENABLED;

async function importSut() {
  // Re-import the module so the top-level env-captured constants pick up the
  // current values of process.env.
  vi.resetModules();
  return await import('@/lib/email/mcp-approval-email');
}

beforeEach(() => {
  H.dbState.clientRow = [];
  H.dbState.recipientUsers = [];
  H.dbState.recentCounts = [];
  H.dbState.throwOnTable = null;
  H.resendSendMock.mockReset();
  H.resendSendMock.mockResolvedValue({ data: { id: 'msg_xyz' }, error: null });
  process.env.NEXTAUTH_URL = 'https://example.test';
  process.env.RESEND_FROM_EMAIL = 'portal@example.test';
  process.env.RESEND_API_KEY = 'rk_test';
  delete process.env.MCP_APPROVAL_EMAILS_ENABLED;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
  if (ORIGINAL_FROM === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = ORIGINAL_FROM;
  if (ORIGINAL_API_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_ENABLED === undefined) delete process.env.MCP_APPROVAL_EMAILS_ENABLED;
  else process.env.MCP_APPROVAL_EMAILS_ENABLED = ORIGINAL_ENABLED;
});

// ---------------------------------------------------------------------------
// sendApprovalEmails
// ---------------------------------------------------------------------------

describe('sendApprovalEmails — early returns', () => {
  it('returns immediately and sends nothing when EMAILS_ENABLED is "false"', async () => {
    process.env.MCP_APPROVAL_EMAILS_ENABLED = 'false';
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 99,
      summary: 's',
      entityType: 'page',
      operation: 'update',
    });

    expect(H.resendSendMock).not.toHaveBeenCalled();
  });

  it('returns immediately when userIds is empty', async () => {
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [],
      pendingId: 99,
      summary: 's',
      entityType: 'page',
      operation: 'update',
    });

    expect(H.resendSendMock).not.toHaveBeenCalled();
  });

  it('returns immediately when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 99,
      summary: 's',
      entityType: 'page',
      operation: 'update',
    });

    expect(H.resendSendMock).not.toHaveBeenCalled();
  });
});

describe('sendApprovalEmails — dispatch', () => {
  it('sends to each active recipient with rendered subject + html', async () => {
    H.dbState.clientRow = [{ company: 'Acme Inc' }];
    H.dbState.recipientUsers = [
      { id: 10, email: 'alice@example.test', name: 'Alice' },
      { id: 11, email: 'bob@example.test', name: 'Bob' },
    ];
    H.dbState.recentCounts = [
      { userId: 10, count: 1 },
      { userId: 11, count: 1 },
    ];
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10, 11],
      pendingId: 555,
      summary: 'Update homepage hero copy',
      entityType: 'page',
      operation: 'update',
    });

    expect(H.resendSendMock).toHaveBeenCalledTimes(2);
    const firstPayload = H.resendSendMock.mock.calls[0][0];
    expect(firstPayload.from).toBe('Simpler Development <portal@example.test>');
    expect([firstPayload.to, H.resendSendMock.mock.calls[1][0].to]).toEqual(
      expect.arrayContaining(['alice@example.test', 'bob@example.test']),
    );
    expect(firstPayload.subject).toBe('[Acme Inc] Review: Update homepage hero copy');
    expect(firstPayload.html).toContain('Acme Inc');
    expect(firstPayload.html).toContain('page');
    expect(firstPayload.html).toContain('update');
    expect(firstPayload.html).toContain('Update homepage hero copy');
    expect(firstPayload.html).toContain('https://example.test/portal/approvals?id=555');
  });

  it('falls back to "Client #<id>" when the clients row is missing', async () => {
    H.dbState.clientRow = [];
    H.dbState.recipientUsers = [
      { id: 10, email: 'alice@example.test', name: 'Alice' },
    ];
    H.dbState.recentCounts = [{ userId: 10, count: 1 }];
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 42,
      userIds: [10],
      pendingId: 1,
      summary: 'x',
      entityType: 'page',
      operation: 'update',
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject).toBe('[Client #42] Review: x');
    expect(payload.html).toContain('Client #42');
  });

  it('truncates the subject with an ellipsis when summary exceeds 80 chars', async () => {
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [{ id: 10, email: 'a@a.test', name: 'A' }];
    H.dbState.recentCounts = [{ userId: 10, count: 1 }];
    const long = 'x'.repeat(120);
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 1,
      summary: long,
      entityType: 'page',
      operation: 'update',
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject.endsWith('…')).toBe(true);
    expect(payload.subject).toContain('[Acme] Review: ');
    // 80 chars of x + ellipsis
    expect(payload.subject).toContain('x'.repeat(80) + '…');
  });

  it('does not truncate when summary is exactly the cutoff length', async () => {
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [{ id: 10, email: 'a@a.test', name: 'A' }];
    H.dbState.recentCounts = [{ userId: 10, count: 1 }];
    const summary = 'y'.repeat(80);
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 1,
      summary,
      entityType: 'page',
      operation: 'update',
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject.endsWith('…')).toBe(false);
    expect(payload.subject).toBe(`[Acme] Review: ${summary}`);
  });

  it('escapes html entities in summary/clientName/entityType/operation', async () => {
    H.dbState.clientRow = [{ company: '<Acme & Co>' }];
    H.dbState.recipientUsers = [{ id: 10, email: 'a@a.test', name: 'A' }];
    H.dbState.recentCounts = [{ userId: 10, count: 1 }];
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 1,
      summary: '<script>alert("x")</script>',
      entityType: '<page>',
      operation: "it's",
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    // Subject is built from raw summary slice (no escaping) — but html should escape.
    expect(payload.html).toContain('&lt;script&gt;');
    expect(payload.html).toContain('&quot;x&quot;');
    expect(payload.html).toContain('&lt;page&gt;');
    expect(payload.html).toContain('it&#39;s');
    expect(payload.html).toContain('&lt;Acme &amp; Co&gt;');
    // Raw payload subject still contains the raw summary.
    expect(payload.subject).toContain('<script>');
  });

  it('skips a recipient whose recent-count is greater than 1 (cooldown)', async () => {
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [
      { id: 10, email: 'alice@example.test', name: 'Alice' },
      { id: 11, email: 'bob@example.test', name: 'Bob' },
    ];
    // Alice had 3 recent → skip; Bob had 1 → send.
    H.dbState.recentCounts = [
      { userId: 10, count: 3 },
      { userId: 11, count: 1 },
    ];
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10, 11],
      pendingId: 1,
      summary: 's',
      entityType: 'page',
      operation: 'update',
    });

    expect(H.resendSendMock).toHaveBeenCalledTimes(1);
    expect(H.resendSendMock.mock.calls[0][0].to).toBe('bob@example.test');
  });

  it('sends when the recent-count entry is missing (treated as 0)', async () => {
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [
      { id: 10, email: 'alice@example.test', name: 'Alice' },
    ];
    H.dbState.recentCounts = []; // no entry for user 10
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 1,
      summary: 's',
      entityType: 'page',
      operation: 'update',
    });

    expect(H.resendSendMock).toHaveBeenCalledTimes(1);
  });

  it('uses the default BASE_URL when NEXTAUTH_URL is unset', async () => {
    delete process.env.NEXTAUTH_URL;
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [{ id: 10, email: 'a@a.test', name: 'A' }];
    H.dbState.recentCounts = [{ userId: 10, count: 1 }];
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 777,
      summary: 's',
      entityType: 'page',
      operation: 'update',
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.html).toContain('https://simplerdevelopment.com/portal/approvals?id=777');
  });

  it('uses the default FROM_EMAIL when RESEND_FROM_EMAIL is unset', async () => {
    delete process.env.RESEND_FROM_EMAIL;
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [{ id: 10, email: 'a@a.test', name: 'A' }];
    H.dbState.recentCounts = [{ userId: 10, count: 1 }];
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 1,
      summary: 's',
      entityType: 'page',
      operation: 'update',
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.from).toBe('Simpler Development <portal@simplerdevelopment.com>');
  });

  it('swallows per-recipient Resend errors via Promise.allSettled', async () => {
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [
      { id: 10, email: 'alice@example.test', name: 'Alice' },
      { id: 11, email: 'bob@example.test', name: 'Bob' },
    ];
    H.dbState.recentCounts = [
      { userId: 10, count: 1 },
      { userId: 11, count: 1 },
    ];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // First call throws, second resolves.
    H.resendSendMock.mockReset();
    H.resendSendMock
      .mockRejectedValueOnce(new Error('rate-limited'))
      .mockResolvedValueOnce({ data: { id: 'ok' }, error: null });
    const { sendApprovalEmails } = await importSut();

    await expect(
      sendApprovalEmails({
        clientId: 1,
        userIds: [10, 11],
        pendingId: 1,
        summary: 's',
        entityType: 'page',
        operation: 'update',
      }),
    ).resolves.toBeUndefined();

    expect(H.resendSendMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    const firstWarn = warnSpy.mock.calls[0];
    expect(String(firstWarn[0])).toContain('failed for user');
  });

  it('swallows a DB-level error from the outer try/catch and never throws', async () => {
    // Force the clients select() to throw at .from() time.
    H.dbState.throwOnTable = 'clients';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sendApprovalEmails } = await importSut();

    await expect(
      sendApprovalEmails({
        clientId: 1,
        userIds: [10],
        pendingId: 1,
        summary: 's',
        entityType: 'page',
        operation: 'update',
      }),
    ).resolves.toBeUndefined();

    expect(H.resendSendMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('dispatch failed');
  });

  it('renders the approval CTA link and footer copy in the email body', async () => {
    H.dbState.clientRow = [{ company: 'Acme' }];
    H.dbState.recipientUsers = [{ id: 10, email: 'a@a.test', name: 'A' }];
    H.dbState.recentCounts = [{ userId: 10, count: 1 }];
    const { sendApprovalEmails } = await importSut();

    await sendApprovalEmails({
      clientId: 1,
      userIds: [10],
      pendingId: 321,
      summary: 'Hello',
      entityType: 'deck',
      operation: 'create',
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.html).toContain('Review &amp; Approve');
    expect(payload.html).toContain('href="https://example.test/portal/approvals?id=321"');
    expect(payload.html).toContain('MCP_APPROVAL_EMAILS_ENABLED=false');
    expect(payload.html).toContain('Simpler Development');
  });
});
