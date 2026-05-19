// @vitest-environment node
/**
 * Unit tests for four unrelated admin API routes, packed together so the
 * shared schema / drizzle / auth / db mocks only have to be wired up once:
 *
 *  1. POST /api/admin/ai/conversations/[id]/inject
 *     - Auth + role gates
 *     - 404 when conversation missing
 *     - 400 when message empty
 *     - Inserts an assistant message and bumps conv.updatedAt
 *     - 500 path when db throws
 *
 *  2. GET /api/admin/ai/conversations
 *     - Auth + role gates
 *     - Returns rows projected from a leftJoin of conversations -> clients -> users
 *     - 500 path when db throws
 *
 *  3. POST /api/admin/email/campaigns/[id]/send
 *     - Auth + role gate (Unauthorized when missing)
 *     - 404 when campaign missing
 *     - 400 when campaign already sent / sending
 *     - 400 when no eligible subscribers
 *     - Happy path: filters out already-sent subscribers, calls resend per
 *       remaining subscriber, records sends, flips status to 'sent'
 *     - Failure path: counts a failed send but still finishes
 *
 *  4. GET /api/admin/email/campaigns
 *     - Auth + role gate
 *     - Returns campaigns (with optional clientId filter)
 *  4b. POST /api/admin/email/campaigns
 *     - Auth + role gate
 *     - 400 on missing required fields
 *     - 201 with the new row on success
 *
 * Everything external (auth, db, drizzle, schema, resend, helpers) is
 * mocked. No DB, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Schema + drizzle-orm mocks
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
    aiConversations: wrap('aiConversations'),
    aiMessages: wrap('aiMessages'),
    clients: wrap('clients'),
    users: wrap('users'),
    emailCampaigns: wrap('emailCampaigns'),
    emailCampaignSends: wrap('emailCampaignSends'),
    emailSubscribers: wrap('emailSubscribers'),
    emailLists: wrap('emailLists'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  count: () => ({ op: 'count' }),
  sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
    __sql: true,
    raw: strings.join('?'),
  }),
}));

// ===========================================================================
// Auth mock
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// ===========================================================================
// Email lib mock (only the bits the send route uses)
// ===========================================================================

const resendSendMock = vi.fn();
const buildCampaignHtmlMock = vi.fn(
  (html: string, unsub: string, preview: string | null) =>
    `<wrapped html="${html}" unsub="${unsub}" preview="${preview ?? ''}">`,
);
const buildUnsubscribeUrlMock = vi.fn(
  (token: string) => `https://unsub.example/?t=${token}`,
);

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => resendSendMock(...args),
    },
  },
  buildCampaignHtml: (...args: unknown[]) =>
    // @ts-expect-error -- forwarding
    buildCampaignHtmlMock(...args),
  buildUnsubscribeUrl: (...args: unknown[]) =>
    // @ts-expect-error -- forwarding
    buildUnsubscribeUrlMock(...args),
}));

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  aiConversations: Array<Record<string, unknown>>;
  aiMessages: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  emailCampaigns: Array<Record<string, unknown>>;
  emailCampaignSends: Array<Record<string, unknown>>;
  emailSubscribers: Array<Record<string, unknown>>;
  emailLists: Array<Record<string, unknown>>;
}

const state: MockState = {
  aiConversations: [],
  aiMessages: [],
  clients: [],
  users: [],
  emailCampaigns: [],
  emailCampaignSends: [],
  emailSubscribers: [],
  emailLists: [],
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
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      const byTable = (row as { __byTable?: Record<string, Record<string, unknown> | null> }).__byTable;
      if (col.__table && byTable && byTable[col.__table]) {
        return byTable[col.__table]![col.__col] === f.b;
      }
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

// Hook so individual tests can force db.select to throw (covers 500 paths)
let throwOnSelect = false;

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, { __col?: string; __table?: string }>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const joins: Array<{
      table: string;
      kind: 'left' | 'inner';
      on: { aCol?: string; aTable?: string; bCol?: string; bTable?: string };
    }> = [];

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        if (throwOnSelect) throw new Error('forced select failure');
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
      leftJoin(table: { __table: string }, on: unknown) {
        joins.push({ table: table.__table, kind: 'left', on: parseJoinOn(on) });
        return chain;
      },
      innerJoin(table: { __table: string }, on: unknown) {
        joins.push({ table: table.__table, kind: 'inner', on: parseJoinOn(on) });
        return chain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function parseJoinOn(on: unknown): {
      aCol?: string;
      aTable?: string;
      bCol?: string;
      bTable?: string;
    } {
      const o = on as { op?: string; a?: { __col?: string; __table?: string }; b?: { __col?: string; __table?: string } };
      if (o?.op !== 'eq') return {};
      return {
        aCol: o.a?.__col,
        aTable: o.a?.__table,
        bCol: o.b?.__col,
        bTable: o.b?.__table,
      };
    }

    function joinedRows(): Array<Record<string, unknown> & { __byTable: Record<string, Record<string, unknown> | null> }> {
      if (!activeTable) return [];
      const baseRows = tableArray(activeTable).map((r) => ({
        ...r,
        __byTable: { [activeTable!]: { ...r } } as Record<string, Record<string, unknown> | null>,
      }));
      let current = baseRows;
      for (const j of joins) {
        const next: typeof current = [];
        for (const row of current) {
          const matches = tableArray(j.table).filter((other) => {
            const leftVal = j.on.aTable && row.__byTable[j.on.aTable]
              ? (row.__byTable[j.on.aTable] as Record<string, unknown>)[j.on.aCol!]
              : row[j.on.aCol!];
            const rightVal = (other as Record<string, unknown>)[j.on.bCol!];
            return leftVal === rightVal;
          });
          if (matches.length === 0) {
            if (j.kind === 'left') {
              next.push({
                ...row,
                __byTable: { ...row.__byTable, [j.table]: null },
              });
            }
          } else {
            for (const m of matches) {
              next.push({
                ...row,
                ...(m as Record<string, unknown>),
                __byTable: {
                  ...row.__byTable,
                  [j.table]: { ...(m as Record<string, unknown>) },
                },
              });
            }
          }
        }
        current = next;
      }
      return current;
    }

    function project(row: Record<string, unknown> & { __byTable: Record<string, Record<string, unknown> | null> }): Record<string, unknown> {
      if (!projection) {
        const out = { ...row } as Record<string, unknown>;
        delete out.__byTable;
        return out;
      }
      const slim: Record<string, unknown> = {};
      for (const [alias, col] of Object.entries(projection)) {
        const colInfo = col as { __col?: string; __table?: string };
        if (colInfo?.__table && row.__byTable[colInfo.__table] !== undefined) {
          const t = row.__byTable[colInfo.__table];
          slim[alias] = t ? t[colInfo.__col!] : null;
        } else {
          slim[alias] = row[colInfo?.__col ?? alias];
        }
      }
      return slim;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      const joined = joinedRows();
      const filtered = joined.filter((r) => evalPredicate(filter, r));
      let out = filtered.map(project);
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
            createdAt: v.createdAt ?? new Date(),
            updatedAt: v.updatedAt ?? new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
          },
        };
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

  function buildDelete(table: { __table: string }) {
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      where(arg: unknown) {
        filter = arg;
        return runDelete();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runDelete().then(onFulfilled, onRejected);
      },
    };
    function runDelete(): Promise<unknown[]> {
      const rows = tableArray(table.__table);
      const remaining = rows.filter((r) => !evalPredicate(filter, r));
      const removed = rows.length - remaining.length;
      rows.length = 0;
      rows.push(...remaining);
      return Promise.resolve([{ removed }]);
    }
    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, { __col?: string; __table?: string }>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
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

// ===========================================================================
// Modules under test (import AFTER mocks are in place)
// ===========================================================================

const injectRoute = await import(
  '@/app/api/admin/ai/conversations/[id]/inject/route'
);
const injectPOST = injectRoute.POST;

const convListRoute = await import('@/app/api/admin/ai/conversations/route');
const convListGET = convListRoute.GET;

const campaignSendRoute = await import(
  '@/app/api/admin/email/campaigns/[id]/send/route'
);
const campaignSendPOST = campaignSendRoute.POST;

const campaignListRoute = await import('@/app/api/admin/email/campaigns/route');
const campaignListGET = campaignListRoute.GET;
const campaignListPOST = campaignListRoute.POST;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.aiConversations.length = 0;
  state.aiMessages.length = 0;
  state.clients.length = 0;
  state.users.length = 0;
  state.emailCampaigns.length = 0;
  state.emailCampaignSends.length = 0;
  state.emailSubscribers.length = 0;
  state.emailLists.length = 0;
  idCounter = 1000;
  throwOnSelect = false;

  authMock.mockReset();
  resendSendMock.mockReset().mockResolvedValue({ data: { id: 'resend_default' } });
  buildCampaignHtmlMock.mockClear();
  buildUnsubscribeUrlMock.mockClear();

  authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
});

// ===========================================================================
// Helpers
// ===========================================================================

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePostReq(body: unknown, url = 'http://x/route'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(method: string, url = 'http://x/route'): Request {
  return new Request(url, { method });
}

// ===========================================================================
// 1. POST /api/admin/ai/conversations/[id]/inject
// ===========================================================================

describe('POST /api/admin/ai/conversations/[id]/inject', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await injectPOST(makePostReq({ message: 'hi' }), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: { role: 'admin' } });
    const res = await injectPOST(makePostReq({ message: 'hi' }), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not admin or employee', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await injectPOST(makePostReq({ message: 'hi' }), paramsFor('1'));
    expect(res.status).toBe(403);
  });

  it('allows employee role', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    state.aiConversations.push({ id: 42, updatedAt: new Date('2026-01-01') });
    const res = await injectPOST(
      makePostReq({ message: 'yo' }),
      paramsFor('42'),
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when conversation not found', async () => {
    const res = await injectPOST(
      makePostReq({ message: 'hi' }),
      paramsFor('999'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when message is missing', async () => {
    state.aiConversations.push({ id: 42 });
    const res = await injectPOST(makePostReq({}), paramsFor('42'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is whitespace only', async () => {
    state.aiConversations.push({ id: 42 });
    const res = await injectPOST(
      makePostReq({ message: '   ' }),
      paramsFor('42'),
    );
    expect(res.status).toBe(400);
  });

  it('inserts the assistant message and bumps conv.updatedAt', async () => {
    state.aiConversations.push({
      id: 42,
      updatedAt: new Date('2026-01-01'),
    });
    const before = (state.aiConversations[0] as Record<string, unknown>).updatedAt;
    const res = await injectPOST(
      makePostReq({ message: '  Hello there  ' }),
      paramsFor('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('assistant');
    expect(body.data.content).toBe('Hello there');
    expect(body.data.conversationId).toBe(42);
    expect(body.data.injectedBy).toBe(7);
    expect(body.data.inputTokens).toBe(0);
    expect(body.data.outputTokens).toBe(0);
    expect(state.aiMessages).toHaveLength(1);

    const after = (state.aiConversations[0] as Record<string, unknown>).updatedAt;
    expect(after).not.toBe(before);
    expect(after).toBeInstanceOf(Date);
  });

  it('returns 500 when db.select throws', async () => {
    throwOnSelect = true;
    const res = await injectPOST(
      makePostReq({ message: 'hi' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// 2. GET /api/admin/ai/conversations
// ===========================================================================

describe('GET /api/admin/ai/conversations', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await convListGET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: { role: 'admin' } });
    const res = await convListGET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not admin/employee', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await convListGET();
    expect(res.status).toBe(403);
  });

  it('returns conversations with joined client + user info', async () => {
    state.users.push({ id: 100, name: 'Alice', email: 'alice@example.com' });
    state.clients.push({ id: 50, userId: 100, company: 'Acme' });
    state.aiConversations.push({
      id: 1,
      title: 'Chat 1',
      flagged: false,
      totalInputTokens: 100,
      totalOutputTokens: 200,
      createdAt: new Date('2026-05-01'),
      updatedAt: new Date('2026-05-02'),
      clientId: 50,
    });
    state.aiConversations.push({
      id: 2,
      title: 'Orphan chat',
      flagged: true,
      totalInputTokens: 5,
      totalOutputTokens: 10,
      createdAt: new Date('2026-05-03'),
      updatedAt: new Date('2026-05-04'),
      clientId: null,
    });

    const res = await convListGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);

    const withClient = body.data.find((r: { id: number }) => r.id === 1);
    expect(withClient.clientCompany).toBe('Acme');
    expect(withClient.clientUserName).toBe('Alice');
    expect(withClient.clientUserEmail).toBe('alice@example.com');

    const orphan = body.data.find((r: { id: number }) => r.id === 2);
    expect(orphan.clientCompany).toBeNull();
    expect(orphan.clientUserName).toBeNull();
    expect(orphan.clientUserEmail).toBeNull();
  });

  it('returns 500 on internal error', async () => {
    throwOnSelect = true;
    const res = await convListGET();
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// 3. POST /api/admin/email/campaigns/[id]/send
// ===========================================================================

describe('POST /api/admin/email/campaigns/[id]/send', () => {
  function seedCampaign(over: Partial<Record<string, unknown>> = {}) {
    const row = {
      id: 1,
      clientId: 10,
      listId: 77,
      name: 'Camp',
      subject: 'subj',
      previewText: null,
      fromName: 'Marketing',
      fromEmail: 'noreply@example.com',
      replyTo: null,
      htmlContent: '<p>hello</p>',
      status: 'draft',
      totalRecipients: 0,
      totalSent: 0,
      sentAt: null,
      updatedAt: new Date('2026-05-01'),
      ...over,
    };
    state.emailCampaigns.push(row);
    return row;
  }
  function seedSubscriber(over: Partial<Record<string, unknown>> = {}) {
    const row = {
      id: nextId(),
      listId: 77,
      email: `s${idCounter}@example.com`,
      status: 'active',
      unsubscribeToken: `tok-${idCounter}`,
      ...over,
    };
    state.emailSubscribers.push(row);
    return row;
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not staff', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: { role: 'admin' } });
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when campaign not found', async () => {
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('999'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when campaign already sent', async () => {
    seedCampaign({ status: 'sent' });
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/already sent/);
  });

  it('returns 400 when campaign currently sending', async () => {
    seedCampaign({ status: 'sending' });
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/already sending/);
  });

  it('returns 400 when no active subscribers', async () => {
    seedCampaign();
    // No subscribers seeded
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No active subscribers/);
  });

  it('returns 400 when only subscribers are inactive', async () => {
    seedCampaign();
    seedSubscriber({ status: 'unsubscribed' });
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when only remaining targets have already been sent to', async () => {
    seedCampaign();
    const s = seedSubscriber({ status: 'active' });
    state.emailCampaignSends.push({
      id: nextId(),
      campaignId: 1,
      subscriberId: s.id,
      sentAt: new Date(),
    });
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(400);
  });

  it('sends to active subscribers, records sends, flips status to sent', async () => {
    seedCampaign({ replyTo: 'reply@example.com', previewText: 'preview!' });
    const s1 = seedSubscriber({ email: 'a@example.com' });
    const s2 = seedSubscriber({ email: 'b@example.com' });
    seedSubscriber({ email: 'c@example.com', status: 'unsubscribed' });
    resendSendMock
      .mockResolvedValueOnce({ data: { id: 'r1' } })
      .mockResolvedValueOnce({ data: { id: 'r2' } });

    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sent).toBe(2);
    expect(body.data.failed).toBe(0);
    expect(body.data.total).toBe(2);

    // Resend invoked twice with correct args
    expect(resendSendMock).toHaveBeenCalledTimes(2);
    const firstCall = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(firstCall.from).toBe('Marketing <noreply@example.com>');
    expect([s1.email, s2.email]).toContain(firstCall.to);
    expect(firstCall.subject).toBe('subj');
    expect(firstCall.replyTo).toBe('reply@example.com');
    expect(typeof firstCall.html).toBe('string');
    const headers = firstCall.headers as Record<string, string>;
    expect(headers['List-Unsubscribe']).toMatch(/^<https:\/\/unsub\.example/);
    expect(headers['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click',
    );

    // Helpers received expected inputs
    expect(buildUnsubscribeUrlMock).toHaveBeenCalledTimes(2);
    expect(buildCampaignHtmlMock).toHaveBeenCalledTimes(2);
    const lastBuildArgs = buildCampaignHtmlMock.mock.calls[0];
    expect(lastBuildArgs[0]).toBe('<p>hello</p>');
    expect(lastBuildArgs[2]).toBe('preview!');

    // Campaign row updated
    const camp = state.emailCampaigns[0] as Record<string, unknown>;
    expect(camp.status).toBe('sent');
    expect(camp.totalSent).toBe(2);
    expect(camp.totalRecipients).toBe(2);
    expect(camp.sentAt).toBeInstanceOf(Date);

    // 2 send-records inserted
    expect(state.emailCampaignSends).toHaveLength(2);
    const resendIds = state.emailCampaignSends
      .map((r) => r.resendEmailId)
      .sort();
    expect(resendIds).toEqual(['r1', 'r2']);
  });

  it('omits replyTo when not set on campaign', async () => {
    seedCampaign({ replyTo: null });
    seedSubscriber({ email: 'a@example.com' });
    await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    const call = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.replyTo).toBeUndefined();
  });

  it('falls back to null resendEmailId when resend returns no data.id', async () => {
    seedCampaign();
    seedSubscriber({ email: 'a@example.com' });
    resendSendMock.mockResolvedValueOnce({ data: undefined });
    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(200);
    expect(state.emailCampaignSends[0].resendEmailId).toBeNull();
  });

  it('counts failures from resend but still completes', async () => {
    seedCampaign();
    seedSubscriber({ email: 'a@example.com' });
    seedSubscriber({ email: 'b@example.com' });
    resendSendMock
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce({ data: { id: 'r2' } });

    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.sent).toBe(1);
    expect(body.data.failed).toBe(1);
    expect(body.data.total).toBe(2);

    const camp = state.emailCampaigns[0] as Record<string, unknown>;
    expect(camp.status).toBe('sent');
    expect(camp.totalSent).toBe(1);
  });

  it('excludes subscribers who already received this campaign', async () => {
    seedCampaign();
    const already = seedSubscriber({ email: 'already@example.com' });
    const fresh = seedSubscriber({ email: 'fresh@example.com' });
    state.emailCampaignSends.push({
      id: nextId(),
      campaignId: 1,
      subscriberId: already.id,
      sentAt: new Date('2026-05-01'),
    });

    const res = await campaignSendPOST(makeReq('POST'), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.sent).toBe(1);

    // Only fresh@example.com should have been emailed
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const args = resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.to).toBe(fresh.email);
  });
});

// ===========================================================================
// 4. GET / POST /api/admin/email/campaigns
// ===========================================================================

describe('GET /api/admin/email/campaigns', () => {
  function seedCampaign(over: Partial<Record<string, unknown>> = {}) {
    const row = {
      id: nextId(),
      clientId: 10,
      listId: 77,
      name: 'C',
      subject: 's',
      fromName: 'f',
      fromEmail: 'f@example.com',
      status: 'draft',
      scheduledAt: null,
      sentAt: null,
      totalRecipients: 0,
      totalSent: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      createdAt: new Date('2026-05-01'),
      ...over,
    };
    state.emailCampaigns.push(row);
    return row;
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignListGET(makeReq('GET', 'http://x/api/admin/email/campaigns'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not staff', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await campaignListGET(
      makeReq('GET', 'http://x/api/admin/email/campaigns'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValueOnce({ user: { role: 'admin' } });
    const res = await campaignListGET(
      makeReq('GET', 'http://x/api/admin/email/campaigns'),
    );
    expect(res.status).toBe(401);
  });

  it('returns all campaigns when no clientId filter, joined with listName', async () => {
    state.emailLists.push({ id: 77, name: 'My List' });
    state.emailLists.push({ id: 88, name: 'Other' });
    seedCampaign({ clientId: 10, listId: 77 });
    seedCampaign({ clientId: 20, listId: 88 });

    const res = await campaignListGET(
      makeReq('GET', 'http://x/api/admin/email/campaigns'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const names = body.data.map((r: { listName: string }) => r.listName).sort();
    expect(names).toEqual(['My List', 'Other']);
  });

  it('filters by clientId when provided', async () => {
    state.emailLists.push({ id: 77, name: 'My List' });
    seedCampaign({ clientId: 10, listId: 77 });
    seedCampaign({ clientId: 20, listId: 77 });

    const res = await campaignListGET(
      makeReq('GET', 'http://x/api/admin/email/campaigns?clientId=10'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].listName).toBe('My List');
  });
});

describe('POST /api/admin/email/campaigns', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignListPOST(makePostReq({}));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not staff', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await campaignListPOST(makePostReq({}));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await campaignListPOST(makePostReq({ name: 'x' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/);
  });

  it('returns 400 when fields are whitespace-only', async () => {
    const res = await campaignListPOST(
      makePostReq({
        name: '   ',
        subject: 'subj',
        fromName: 'f',
        fromEmail: 'f@example.com',
        listId: 1,
        htmlContent: '<p/>',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a campaign with required fields and trims them', async () => {
    const res = await campaignListPOST(
      makePostReq({
        name: '  Camp  ',
        subject: '  Subj  ',
        previewText: '  preview  ',
        fromName: '  Me  ',
        fromEmail: '  me@example.com  ',
        replyTo: '  reply@example.com  ',
        listId: '77',
        clientId: '10',
        htmlContent: '  <p>x</p>  ',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Camp');
    expect(body.data.subject).toBe('Subj');
    expect(body.data.previewText).toBe('preview');
    expect(body.data.fromName).toBe('Me');
    expect(body.data.fromEmail).toBe('me@example.com');
    expect(body.data.replyTo).toBe('reply@example.com');
    expect(body.data.listId).toBe(77);
    expect(body.data.clientId).toBe(10);
    expect(body.data.htmlContent).toBe('<p>x</p>');
    expect(body.data.createdBy).toBe(7);
    expect(state.emailCampaigns).toHaveLength(1);
  });

  it('coerces previewText / replyTo / clientId to null when empty', async () => {
    const res = await campaignListPOST(
      makePostReq({
        name: 'C',
        subject: 'S',
        fromName: 'F',
        fromEmail: 'f@example.com',
        listId: '77',
        htmlContent: '<p>x</p>',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.previewText).toBeNull();
    expect(body.data.replyTo).toBeNull();
    expect(body.data.clientId).toBeNull();
  });
});
