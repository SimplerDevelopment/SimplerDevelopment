// @vitest-environment node
/**
 * Unit tests for app/api/contracts/[token]/route.ts
 *
 * GET  — fetch contract by signer token; 400 invalid, 404 missing/draft,
 *        410 expired, 200 with embedded signer + allSigners + companyName.
 * POST — sign or decline; same precondition errors, plus per-action validation
 *        + transition into fully_executed / partially_signed.
 *
 * Everything below the route is mocked: db (fluent builder), schema,
 * drizzle-orm, automation emitter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

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
  return new Proxy({
    crmContracts: wrap('crmContracts'),
    crmContractSigners: wrap('crmContractSigners'),
    clients: wrap('clients'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory state ----

interface SignerRow {
  id: number;
  contractId: number;
  token: string;
  name: string;
  email: string;
  role: string | null;
  status: string;
  viewedAt: Date | null;
  signedAt: Date | null;
  signatureName: string | null;
  signatureData: string | null;
  signedIp: string | null;
  declinedAt: Date | null;
  declineReason: string | null;
  [key: string]: unknown;
}

interface ContractRow {
  id: number;
  clientId: number;
  title: string;
  summary: string | null;
  clauses: unknown;
  lineItems: unknown;
  fees: unknown;
  currency: string;
  accentColor: string | null;
  logoUrl: string | null;
  footerText: string | null;
  status: string;
  validUntil: Date | null;
  fullyExecutedAt: Date | null;
  updatedAt: Date;
  [key: string]: unknown;
}

interface ClientRow {
  id: number;
  company: string | null;
  [key: string]: unknown;
}

interface State {
  contracts: ContractRow[];
  signers: SignerRow[];
  clients: ClientRow[];
}

const state: State = {
  contracts: [],
  signers: [],
  clients: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'crmContracts':
      return state.contracts as unknown as Array<Record<string, unknown>>;
    case 'crmContractSigners':
      return state.signers as unknown as Array<Record<string, unknown>>;
    case 'clients':
      return state.clients as unknown as Array<Record<string, unknown>>;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
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
    let limited: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limited = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      if (limited != null) rows = rows.slice(0, limited);

      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        if (projection) {
          const projected: Record<string, unknown> = {};
          for (const [outKey, ref] of Object.entries(projection)) {
            const colRef = ref as { __col?: string; __table?: string } | undefined;
            if (colRef?.__col) {
              projected[outKey] = (r as Record<string, unknown>)[colRef.__col] ?? null;
            } else {
              projected[outKey] = null;
            }
          }
          out.push(projected);
        } else {
          out.push({ ...r });
        }
      }
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return Promise.resolve(rows.map((r) => ({ ...r })));
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { GET, POST } = await import('@/app/api/contracts/[token]/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'a'.repeat(64);
const OTHER_TOKEN = 'b'.repeat(64);

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

function makePostRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://x/api/contracts/${VALID_TOKEN}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function defaultContract(over: Partial<ContractRow> = {}): ContractRow {
  return {
    id: 1,
    clientId: 10,
    title: 'Test Contract',
    summary: 'A summary',
    clauses: [{ heading: 'h', body: 'b' }],
    lineItems: [{ description: 'item', amount: 100 }],
    fees: [],
    currency: 'USD',
    accentColor: '#000',
    logoUrl: null,
    footerText: 'Footer',
    status: 'sent',
    validUntil: null,
    fullyExecutedAt: null,
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

function defaultSigner(over: Partial<SignerRow> = {}): SignerRow {
  return {
    id: 100,
    contractId: 1,
    token: VALID_TOKEN,
    name: 'Alice Signer',
    email: 'alice@example.test',
    role: 'client',
    status: 'pending',
    viewedAt: null,
    signedAt: null,
    signatureName: null,
    signatureData: null,
    signedIp: null,
    declinedAt: null,
    declineReason: null,
    ...over,
  };
}

beforeEach(() => {
  state.contracts.length = 0;
  state.signers.length = 0;
  state.clients.length = 0;
  emitEventMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/contracts/[token]', () => {
  it('returns 400 for malformed (too short) token', async () => {
    const res = await GET(new Request('http://x'), makeParams('short'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Invalid token' });
  });

  it('returns 400 when token has uppercase chars (regex requires lowercase hex)', async () => {
    const res = await GET(new Request('http://x'), makeParams('A'.repeat(64)));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no signer matches the token', async () => {
    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Contract not found');
  });

  it('returns 404 when contract for signer does not exist', async () => {
    state.signers.push(defaultSigner({ contractId: 999 }));
    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the parent contract is still a draft', async () => {
    state.contracts.push(defaultContract({ status: 'draft' }));
    state.signers.push(defaultSigner());
    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
  });

  it('returns 410 when the contract has expired', async () => {
    state.contracts.push(
      defaultContract({ validUntil: new Date('2020-01-01') }),
    );
    state.signers.push(defaultSigner());
    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.expired).toBe(true);
  });

  it('returns 200 with full payload and marks pending signer as viewed', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    state.signers.push(
      defaultSigner({
        id: 101,
        token: OTHER_TOKEN,
        name: 'Bob Other',
        email: 'bob@example.test',
        role: 'agency',
      }),
    );
    state.clients.push({ id: 10, company: 'Acme Inc' });

    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Test Contract');
    expect(body.data.companyName).toBe('Acme Inc');
    expect(body.data.signer.id).toBe(100);
    expect(body.data.signer.email).toBe('alice@example.test');
    expect(body.data.allSigners).toHaveLength(2);
    expect(body.data.allSigners.map((s: { id: number }) => s.id).sort()).toEqual([100, 101]);

    // Signer should have been marked viewed
    expect(state.signers[0].viewedAt).toBeInstanceOf(Date);
    expect(state.signers[0].status).toBe('viewed');
  });

  it('does NOT update viewedAt when signer already viewed', async () => {
    const alreadyViewedAt = new Date('2026-01-01T00:00:00Z');
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner({ viewedAt: alreadyViewedAt, status: 'viewed' }));

    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    // viewedAt unchanged
    expect(state.signers[0].viewedAt).toBe(alreadyViewedAt);
  });

  it('falls back to "Simpler Development" when client row has no company', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    // No clients row pushed
    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.companyName).toBe('Simpler Development');
  });

  it('falls back to default company name when client.company is null', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    state.clients.push({ id: 10, company: null });
    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.companyName).toBe('Simpler Development');
  });

  it('returns 200 when validUntil is in the future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    state.contracts.push(defaultContract({ validUntil: future }));
    state.signers.push(defaultSigner());
    const res = await GET(new Request('http://x'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/contracts/[token]', () => {
  it('returns 400 for invalid token', async () => {
    const res = await POST(makePostRequest({ action: 'sign' }), makeParams('nope'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid token');
  });

  it('returns 404 when signer is not found', async () => {
    const res = await POST(
      makePostRequest({ action: 'sign' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when contract is missing', async () => {
    state.signers.push(defaultSigner({ contractId: 9999 }));
    const res = await POST(
      makePostRequest({ action: 'sign' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Contract not available');
  });

  it('returns 400 when contract is draft', async () => {
    state.contracts.push(defaultContract({ status: 'draft' }));
    state.signers.push(defaultSigner());
    const res = await POST(
      makePostRequest({ action: 'sign' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when contract is voided', async () => {
    state.contracts.push(defaultContract({ status: 'voided' }));
    state.signers.push(defaultSigner());
    const res = await POST(
      makePostRequest({ action: 'sign' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
  });

  it('returns 410 when contract has expired', async () => {
    state.contracts.push(
      defaultContract({ validUntil: new Date('2020-01-01') }),
    );
    state.signers.push(defaultSigner());
    const res = await POST(
      makePostRequest({ action: 'sign' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(410);
  });

  it('returns 400 when signer already signed', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner({ status: 'signed' }));
    const res = await POST(
      makePostRequest({ action: 'sign' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Already signed');
  });

  it('returns 400 when signer already declined', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner({ status: 'declined' }));
    const res = await POST(
      makePostRequest({ action: 'decline' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Already declined');
  });

  it('returns 400 when signatureName is missing on a sign action', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    const res = await POST(
      makePostRequest({ action: 'sign', signatureName: '   ', signatureData: 'data' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Full name is required');
  });

  it('returns 400 when signatureData is missing on a sign action', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    const res = await POST(
      makePostRequest({ action: 'sign', signatureName: 'Alice' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Signature is required');
  });

  it('signs the only signer, marks contract fully_executed, emits proposal.accepted', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());

    const res = await POST(
      makePostRequest(
        { action: 'sign', signatureName: '  Alice Real  ', signatureData: 'sig-blob' },
        { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      ),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.fullyExecuted).toBe(true);

    expect(state.signers[0].status).toBe('signed');
    expect(state.signers[0].signatureName).toBe('Alice Real');
    expect(state.signers[0].signatureData).toBe('sig-blob');
    expect(state.signers[0].signedIp).toBe('1.2.3.4');
    expect(state.contracts[0].status).toBe('fully_executed');
    expect(state.contracts[0].fullyExecutedAt).toBeInstanceOf(Date);

    expect(emitEventMock).toHaveBeenCalledTimes(1);
    expect(emitEventMock).toHaveBeenCalledWith(
      'proposal.accepted',
      10,
      0,
      expect.objectContaining({ id: 1, title: 'Test Contract', type: 'contract' }),
    );
  });

  it('signs one of two signers, sets contract status to partially_signed, no emit', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner({ id: 100, token: VALID_TOKEN }));
    state.signers.push(
      defaultSigner({ id: 101, token: OTHER_TOKEN, name: 'Bob', email: 'b@x.test' }),
    );

    const res = await POST(
      makePostRequest({ action: 'sign', signatureName: 'Alice', signatureData: 'sig' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fullyExecuted).toBe(false);
    expect(state.contracts[0].status).toBe('partially_signed');
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it('uses x-real-ip when x-forwarded-for is absent', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    await POST(
      makePostRequest(
        { action: 'sign', signatureName: 'Alice', signatureData: 'sig' },
        { 'x-real-ip': '9.9.9.9' },
      ),
      makeParams(VALID_TOKEN),
    );
    expect(state.signers[0].signedIp).toBe('9.9.9.9');
  });

  it('falls back to "unknown" IP when no headers are present', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    await POST(
      makePostRequest({ action: 'sign', signatureName: 'Alice', signatureData: 'sig' }),
      makeParams(VALID_TOKEN),
    );
    expect(state.signers[0].signedIp).toBe('unknown');
  });

  it('declines with a reason and records declinedAt', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());

    const res = await POST(
      makePostRequest({ action: 'decline', reason: '  not a fit  ' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(state.signers[0].status).toBe('declined');
    expect(state.signers[0].declineReason).toBe('not a fit');
    expect(state.signers[0].declinedAt).toBeInstanceOf(Date);
    expect(state.contracts[0].status).toBe('sent'); // unchanged
  });

  it('declines without a reason, stores null declineReason', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    const res = await POST(
      makePostRequest({ action: 'decline' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    expect(state.signers[0].declineReason).toBeNull();
  });

  it('returns 400 for an unknown action', async () => {
    state.contracts.push(defaultContract());
    state.signers.push(defaultSigner());
    const res = await POST(
      makePostRequest({ action: 'something-else' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid action');
  });
});
