// @vitest-environment node
/**
 * Batch 30d — unit tests for 4 portal CRM contracts/[id]/* routes.
 *
 * Routes covered:
 *  - app/api/portal/crm/contracts/[id]/cancel-signature/route.ts  (POST)
 *  - app/api/portal/crm/contracts/[id]/route.ts                    (GET, PUT, DELETE)
 *  - app/api/portal/crm/contracts/[id]/send/route.ts               (POST)
 *  - app/api/portal/crm/contracts/[id]/signing-events/route.ts     (GET)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update/delete are mocked to
 * capture writes and emit the next queued return rows.
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
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const cancelSignatureRequestMock = vi.fn();
vi.mock('@/lib/esign/dropbox-sign', () => ({
  cancelSignatureRequest: (...args: unknown[]) => cancelSignatureRequestMock(...args),
}));

const resendSendMock = vi.fn();
vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => resendSendMock(...args),
    },
  },
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
  return {
    crmContracts: wrap('crmContracts'),
    crmContractSigners: wrap('crmContractSigners'),
    crmContractSigningEvents: wrap('crmContractSigningEvents'),
  };
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

const cancelSigRoute = await import(
  '@/app/api/portal/crm/contracts/[id]/cancel-signature/route'
);
const contractIdRoute = await import('@/app/api/portal/crm/contracts/[id]/route');
const sendRoute = await import('@/app/api/portal/crm/contracts/[id]/send/route');
const signingEventsRoute = await import(
  '@/app/api/portal/crm/contracts/[id]/signing-events/route'
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

const SESSION = { user: { id: '7', email: 'me@example.com' } };

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
  cancelSignatureRequestMock.mockReset();
  resendSendMock.mockReset().mockResolvedValue({ id: 'em_1' });
});

// ===========================================================================
// POST /api/portal/crm/contracts/[id]/cancel-signature
// ===========================================================================

describe('POST /api/portal/crm/contracts/[id]/cancel-signature', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns 400 when contract id is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/abc/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid contract id');
  });

  it('returns 404 when contract is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // contract lookup returns empty
    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Contract not found');
  });

  it('returns 409 when contract is in a terminal esign status', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, esignStatus: 'signed', esignProviderRequestId: 'r1' },
    ]);
    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Cannot cancel from status 'signed'/);
  });

  it('cancels contract with provider request id and inserts signing event', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, esignStatus: 'pending', esignProviderRequestId: 'req_abc' },
    ]);
    cancelSignatureRequestMock.mockResolvedValue({ ok: true });

    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.esignStatus).toBe('canceled');
    expect(cancelSignatureRequestMock).toHaveBeenCalledWith('req_abc');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('crmContracts');
    expect(updateCalls[0].patch).toMatchObject({ esignStatus: 'canceled' });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmContractSigningEvents');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.contractId).toBe(1);
    expect(inserted.clientId).toBe(5);
    expect(inserted.kind).toBe('canceled');
    expect(inserted.actorEmail).toBe('me@example.com');
    expect((inserted.payload as { providerRequestId: string }).providerRequestId).toBe(
      'req_abc',
    );
  });

  it('continues with local cancel even if provider cancel fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, esignStatus: 'pending', esignProviderRequestId: 'req_x' },
    ]);
    cancelSignatureRequestMock.mockRejectedValue(new Error('provider down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('skips provider cancel when no provider request id is set', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, esignStatus: 'pending', esignProviderRequestId: null },
    ]);
    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(cancelSignatureRequestMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
  });

  it('handles a session with no email by writing actorEmail=null', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, esignStatus: null, esignProviderRequestId: null },
    ]);
    const res = await cancelSigRoute.POST(
      makeReq('http://x/api/portal/crm/contracts/1/cancel-signature', { method: 'POST' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.actorEmail).toBeNull();
  });
});

// ===========================================================================
// GET /api/portal/crm/contracts/[id]
// ===========================================================================

describe('GET /api/portal/crm/contracts/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contractIdRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await contractIdRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when contract is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // contract lookup empty
    const res = await contractIdRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Contract not found');
  });

  it('returns contract with signers attached', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, title: 'Contract A' }]);
    selectQueue.push([
      { id: 11, contractId: 1, name: 'Alice', email: 'a@x.com', status: 'pending' },
      { id: 12, contractId: 1, name: 'Bob', email: 'b@x.com', status: 'signed' },
    ]);
    const res = await contractIdRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.signers).toHaveLength(2);
  });
});

// ===========================================================================
// PUT /api/portal/crm/contracts/[id]
// ===========================================================================

describe('PUT /api/portal/crm/contracts/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contractIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/contracts/1', 'PUT', { title: 'x' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await contractIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/contracts/1', 'PUT', { title: 'x' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when no matching contract is updated', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // updateReturnQueue empty → returning() yields []
    const res = await contractIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/contracts/1', 'PUT', { title: 'x' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('updates allowed fields, normalizes nullable refs, parses validUntil', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 1, title: 'Updated' }]);

    const res = await contractIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/contracts/1', 'PUT', {
        title: 'Updated',
        summary: 'sum',
        clauses: [{ heading: 'h' }],
        lineItems: [{ name: 'x' }],
        fees: { tax: 10 },
        currency: 'USD',
        validUntil: '2026-12-31T00:00:00.000Z',
        contactId: '',
        companyId: 0,
        dealId: 99,
        accentColor: '#abc',
        logoUrl: 'https://x/y.png',
        footerText: 'thanks',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    expect(patch.title).toBe('Updated');
    expect(patch.summary).toBe('sum');
    expect(patch.clauses).toEqual([{ heading: 'h' }]);
    expect(patch.lineItems).toEqual([{ name: 'x' }]);
    expect(patch.fees).toEqual({ tax: 10 });
    expect(patch.currency).toBe('USD');
    expect(patch.validUntil).toBeInstanceOf(Date);
    // Falsy contactId/companyId become null; truthy dealId passes through
    expect(patch.contactId).toBeNull();
    expect(patch.companyId).toBeNull();
    expect(patch.dealId).toBe(99);
    expect(patch.accentColor).toBe('#abc');
    expect(patch.logoUrl).toBe('https://x/y.png');
    expect(patch.footerText).toBe('thanks');
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('coerces null validUntil to null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 1 }]);

    const res = await contractIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/contracts/1', 'PUT', { validUntil: null }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.validUntil).toBeNull();
  });

  it('replaces pending signers and adds new signers, skipping ones already signed', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 1 }]);
    // existing signers fetched after update
    selectQueue.push([
      { id: 100, contractId: 1, email: 'pending@x.com', status: 'pending' },
      { id: 101, contractId: 1, email: 'signed@x.com', status: 'signed' },
    ]);
    // returning rows for signer inserts not consumed by the route; queue noop

    const res = await contractIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/contracts/1', 'PUT', {
        signers: [
          { name: 'Alice', email: 'alice@x.com', role: 'signer', order: 1 },
          { name: 'Signed Already', email: 'signed@x.com' }, // should be skipped
          { name: '   ', email: 'x@x.com' }, // empty name skipped
          { name: 'No email', email: '   ' }, // empty email skipped
          { name: 'Bob', email: 'bob@x.com' }, // role/order defaulted
        ],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    // 1 delete (pending signer), 2 inserts (Alice, Bob)
    expect(deleteCalls.filter((c) => c.table === 'crmContractSigners')).toHaveLength(1);
    const inserts = insertCalls.filter((c) => c.table === 'crmContractSigners');
    expect(inserts).toHaveLength(2);
    const aliceInsert = inserts[0].values as Record<string, unknown>;
    expect(aliceInsert.name).toBe('Alice');
    expect(aliceInsert.email).toBe('alice@x.com');
    expect(aliceInsert.role).toBe('signer');
    expect(aliceInsert.order).toBe(1);
    expect(typeof aliceInsert.token).toBe('string');
    expect((aliceInsert.token as string).length).toBe(64); // 32 bytes hex
    const bobInsert = inserts[1].values as Record<string, unknown>;
    expect(bobInsert.name).toBe('Bob');
    expect(bobInsert.role).toBe('signer'); // default
    expect(bobInsert.order).toBe(0); // default
  });

  it('does nothing extra when signers field is not provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 1 }]);

    const res = await contractIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/contracts/1', 'PUT', { title: 'T' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});

// ===========================================================================
// DELETE /api/portal/crm/contracts/[id]
// ===========================================================================

describe('DELETE /api/portal/crm/contracts/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contractIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/contracts/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await contractIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/contracts/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when contract id is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await contractIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/contracts/abc', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 404 when no contract was deleted', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // deleteReturnQueue empty
    const res = await contractIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/contracts/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Contract not found');
  });

  it('deletes and returns the removed contract', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    deleteReturnQueue.push([{ id: 1, title: 'gone' }]);
    const res = await contractIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/contracts/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('crmContracts');
  });
});

// ===========================================================================
// POST /api/portal/crm/contracts/[id]/send
// ===========================================================================

describe('POST /api/portal/crm/contracts/[id]/send', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await sendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await sendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when contract is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // contract empty
    const res = await sendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Contract not found');
  });

  it('returns 400 when contract is in a state that cannot be sent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        status: 'signed',
        title: 'X',
        summary: '',
        clauses: [],
        lineItems: [],
        fees: {},
      },
    ]);
    const res = await sendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/cannot be sent/i);
  });

  it('returns 400 when contract has no signers', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        status: 'draft',
        title: 'X',
        summary: '',
        clauses: [],
        lineItems: [],
        fees: {},
      },
    ]);
    selectQueue.push([]); // no signers
    const res = await sendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/at least one signer/i);
  });

  it('sends emails to each signer, persists hash + status, returns contractUrl', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, company: 'Acme' });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        status: 'draft',
        title: 'Project SOW',
        summary: 'Quick summary',
        clauses: [{ h: 'h' }],
        lineItems: [{ a: 1 }],
        fees: { tax: 2 },
        clientToken: 'CLIENT_TOK',
      },
    ]);
    selectQueue.push([
      { id: 11, contractId: 1, name: 'Alice', email: 'alice@x.com', token: 't1' },
      { id: 12, contractId: 1, name: 'Bob', email: 'bob@x.com', token: 't2' },
    ]);

    const origUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const origFrom = process.env.RESEND_FROM_EMAIL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example';
    process.env.RESEND_FROM_EMAIL = 'noreply@test.example';

    try {
      const res = await sendRoute.POST(
        makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
        { params: Promise.resolve({ id: '1' }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('sent');
      expect(body.data.signerCount).toBe(2);
      expect(body.data.contractUrl).toBe('https://test.example/contract/CLIENT_TOK');
      expect(resendSendMock).toHaveBeenCalledTimes(2);

      const firstCallArgs = resendSendMock.mock.calls[0][0];
      expect(firstCallArgs.from).toBe('Acme <noreply@test.example>');
      expect(firstCallArgs.to).toBe('alice@x.com');
      expect(firstCallArgs.subject).toBe('Contract for your signature: Project SOW');
      expect(firstCallArgs.html).toContain('https://test.example/contract/t1');
      expect(firstCallArgs.html).toContain('Project SOW');
      expect(firstCallArgs.html).toContain('Quick summary');

      expect(updateCalls).toHaveLength(1);
      const patch = updateCalls[0].patch;
      expect(patch.status).toBe('sent');
      expect(patch.sentAt).toBeInstanceOf(Date);
      expect(typeof patch.documentHash).toBe('string');
      expect((patch.documentHash as string).length).toBe(64);
      expect(patch.updatedAt).toBeInstanceOf(Date);
    } finally {
      if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = origUrl;
      if (origFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = origFrom;
    }
  });

  it('uses default site URL and from-email when env vars are unset, defaults company label', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, company: null });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        status: 'sent', // allowed state
        title: 'T',
        summary: '',
        clauses: [],
        lineItems: [],
        fees: {},
        clientToken: 'CT',
      },
    ]);
    selectQueue.push([{ id: 11, contractId: 1, name: 'Alice', email: 'a@x.com', token: 'tok' }]);

    const origUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const origFrom = process.env.RESEND_FROM_EMAIL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.RESEND_FROM_EMAIL;

    try {
      const res = await sendRoute.POST(
        makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
        { params: Promise.resolve({ id: '1' }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.contractUrl).toBe('https://simplerdevelopment.com/contract/CT');
      expect(resendSendMock).toHaveBeenCalledTimes(1);
      const args = resendSendMock.mock.calls[0][0];
      expect(args.from).toBe('Simpler Development <noreply@simplerdevelopment.com>');
      // No summary block expected since summary is empty string
      expect(args.html).not.toContain('<p style="margin:8px 0 0;color:#64748b;font-size:14px;">');
    } finally {
      if (origUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = origUrl;
      if (origFrom !== undefined) process.env.RESEND_FROM_EMAIL = origFrom;
    }
  });

  it('tolerates resend failure per-signer and still returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, company: 'Acme' });
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        status: 'draft',
        title: 'T',
        summary: 's',
        clauses: [],
        lineItems: [],
        fees: {},
        clientToken: 'CT',
      },
    ]);
    selectQueue.push([
      { id: 11, contractId: 1, name: 'Alice', email: 'a@x.com', token: 'tok' },
    ]);
    resendSendMock.mockReset().mockRejectedValue(new Error('rate limit'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await sendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/contracts/1/send', 'POST', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.signerCount).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/portal/crm/contracts/[id]/signing-events
// ===========================================================================

describe('GET /api/portal/crm/contracts/[id]/signing-events', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await signingEventsRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1/signing-events'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await signingEventsRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1/signing-events'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns 400 when contract id is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await signingEventsRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/abc/signing-events'),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid contract id');
  });

  it('returns 404 when contract is not found in tenant scope', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // tenant guard returns nothing
    const res = await signingEventsRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1/signing-events'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Contract not found');
  });

  it('returns ordered list of events when contract exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // tenant guard
    selectQueue.push([
      { id: 102, contractId: 1, kind: 'signed', occurredAt: '2026-03-01T00:00:00Z' },
      { id: 101, contractId: 1, kind: 'sent', occurredAt: '2026-02-01T00:00:00Z' },
    ]);
    const res = await signingEventsRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1/signing-events'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].kind).toBe('signed');
  });

  it('returns empty array when contract has no signing events', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([]);
    const res = await signingEventsRoute.GET(
      makeReq('http://x/api/portal/crm/contracts/1/signing-events'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
