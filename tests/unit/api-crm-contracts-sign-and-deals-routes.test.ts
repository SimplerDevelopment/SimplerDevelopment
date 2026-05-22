// @vitest-environment node
/**
 * Unit tests for two CRM API routes:
 *
 *   1. POST app/api/portal/crm/contracts/[id]/send-for-signature/route.ts
 *      Generates a contract PDF, hands it off to DropboxSign, persists the
 *      provider request id + status on the contract, and logs a signing
 *      event. All collaborators (auth, getPortalClient, db, renderContractPdf,
 *      createSignatureRequest) are mocked.
 *
 *   2. GET + POST app/api/portal/crm/deals/route.ts
 *      Lists deals filtered by query string (pipelineId / stageId / status /
 *      search / ownerId / custom-field filters) and creates a new deal with
 *      validation + automation event emit.
 *
 * Drizzle column refs are wrapped in a Proxy marker so the db mock can walk
 * arbitrary chains without crashing. Tests queue rows on per-test queues.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (auth / portal-client / db / schema / drizzle / automation)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

const buildCustomFieldFiltersMock = vi.fn(() => [] as unknown[]);
vi.mock('@/lib/crm-custom-field-filter', () => ({
  buildCustomFieldFilters: (...args: unknown[]) => buildCustomFieldFiltersMock(...args),
}));

const renderContractPdfMock = vi.fn();
vi.mock('@/lib/esign/contract-pdf', () => ({
  renderContractPdf: (...args: unknown[]) => renderContractPdfMock(...args),
}));

const createSignatureRequestMock = vi.fn();
vi.mock('@/lib/esign/dropbox-sign', () => ({
  createSignatureRequest: (...args: unknown[]) => createSignatureRequestMock(...args),
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
  return {
    crmContracts: wrap('crmContracts'),
    crmContractSigningEvents: wrap('crmContractSigningEvents'),
    crmDeals: wrap('crmDeals'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmPipelineStages: wrap('crmPipelineStages'),
    users: wrap('users'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
}));

// ---- per-test DB queues ----------------------------------------------------

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{ table: string; set: Record<string, unknown> }> = [];
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
const insertReturnQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const chain: Record<string, unknown> = {
      from() {
        return chain;
      },
      leftJoin() {
        return chain;
      },
      where() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return Promise.resolve(selectQueue.shift() ?? []);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function makeUpdate(table: { __table: string }) {
    return {
      set(values: Record<string, unknown>) {
        updateCalls.push({ table: table.__table, set: values });
        return {
          where() {
            return Promise.resolve();
          },
        };
      },
    };
  }

  function makeInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown>) {
        insertCalls.push({ table: table.__table, values: vals });
        return Object.assign(Promise.resolve(), {
          returning() {
            return Promise.resolve(insertReturnQueue.shift() ?? []);
          },
        });
      },
    };
  }

  return {
    db: {
      select() {
        return makeSelectChain();
      },
      update(table: { __table: string }) {
        return makeUpdate(table);
      },
      insert(table: { __table: string }) {
        return makeInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test (dynamic import AFTER all mocks)
// ---------------------------------------------------------------------------

const { POST: signPOST } = await import(
  '@/app/api/portal/crm/contracts/[id]/send-for-signature/route'
);
const { GET: dealsGET, POST: dealsPOST } = await import('@/app/api/portal/crm/deals/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(body: unknown, url = 'http://localhost/api/portal'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBadJsonRequest(url = 'http://localhost/api/portal'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ not-json',
  });
}

// Minimal NextRequest stand-in — the route just reads `req.nextUrl.searchParams`.
function makeNextRequest(qs = ''): { nextUrl: URL } {
  return { nextUrl: new URL('http://localhost/api/portal/crm/deals' + (qs ? '?' + qs : '')) };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  insertReturnQueue.length = 0;
  buildCustomFieldFiltersMock.mockReturnValue([]);
});

// ===========================================================================
// POST /api/portal/crm/contracts/[id]/send-for-signature
// ===========================================================================

describe('POST /api/portal/crm/contracts/[id]/send-for-signature', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await signPOST(makeJsonRequest({}), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await signPOST(makeJsonRequest({}), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await signPOST(makeJsonRequest({}), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Client not found');
  });

  it('returns 400 for a non-numeric contract id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await signPOST(makeJsonRequest({}), makeParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid contract id');
  });

  it('returns 400 when JSON body is malformed', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await signPOST(makeBadJsonRequest(), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 400 when signerEmail or signerName are missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await signPOST(makeJsonRequest({ signerEmail: '' }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signerEmail and signerName are required/);
  });

  it('returns 404 when the contract is not found for this client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // contract lookup empty
    const res = await signPOST(
      makeJsonRequest({ signerEmail: 'a@b.com', signerName: 'Jane Doe' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Contract not found');
  });

  it('returns 409 when the contract is already in a blocking esign state', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        title: 'T',
        esignStatus: 'sent',
        clauses: [],
        lineItems: [],
        fees: [],
        currency: 'USD',
      },
    ]);
    const res = await signPOST(
      makeJsonRequest({ signerEmail: 'a@b.com', signerName: 'Jane' }),
      makeParams('1'),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/'sent' state/);
  });

  it('returns 500 when PDF rendering throws', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        title: 'T',
        summary: 's',
        esignStatus: null,
        clauses: null,
        lineItems: null,
        fees: null,
        currency: 'USD',
        footerText: null,
      },
    ]);
    renderContractPdfMock.mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await signPOST(
      makeJsonRequest({ signerEmail: 'a@b.com', signerName: 'Jane' }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to render contract PDF');
    errSpy.mockRestore();
  });

  it('returns 502 when DropboxSign throws an Error', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        title: 'T',
        summary: null,
        esignStatus: 'draft',
        clauses: [],
        lineItems: [],
        fees: [],
        currency: 'USD',
        footerText: null,
      },
    ]);
    renderContractPdfMock.mockResolvedValueOnce(Buffer.from('pdf'));
    createSignatureRequestMock.mockRejectedValueOnce(new Error('sign down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await signPOST(
      makeJsonRequest({ signerEmail: 'a@b.com', signerName: 'Jane' }),
      makeParams('1'),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('sign down');
    errSpy.mockRestore();
  });

  it('returns 502 with fallback message when DropboxSign throws a non-Error', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        title: 'T',
        summary: null,
        esignStatus: null,
        clauses: [],
        lineItems: [],
        fees: [],
        currency: 'USD',
        footerText: null,
      },
    ]);
    renderContractPdfMock.mockResolvedValueOnce(Buffer.from('pdf'));
    createSignatureRequestMock.mockRejectedValueOnce('weird string');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await signPOST(
      makeJsonRequest({ signerEmail: 'a@b.com', signerName: 'Jane' }),
      makeParams('1'),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('DropboxSign request failed');
    errSpy.mockRestore();
  });

  it('succeeds — renders PDF, sends to DropboxSign, updates contract, logs event', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        title: 'Master Services Agreement',
        summary: 'Top-level summary',
        esignStatus: null,
        clauses: [{ title: 'Term', body: '12mo' }],
        lineItems: [{ description: 'Setup', quantity: 1, unitPrice: '500' }],
        fees: [],
        currency: 'USD',
        footerText: 'see appendix A',
      },
    ]);
    renderContractPdfMock.mockResolvedValueOnce(Buffer.from('pdf-bytes'));
    createSignatureRequestMock.mockResolvedValueOnce({
      signatureRequestId: 'req_abc',
      signatureId: 'sig_xyz',
    });

    const res = await signPOST(
      makeJsonRequest({
        signerEmail: '  Counter@Party.io  ',
        signerName: '  Sam Vendor  ',
        subject: 'custom subject',
        message: 'custom message',
      }),
      makeParams('1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      esignStatus: 'sent',
      esignProviderRequestId: 'req_abc',
      signatureId: 'sig_xyz',
    });

    // PDF helper saw normalized signer email and trimmed name.
    expect(renderContractPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Master Services Agreement',
        signerEmail: 'counter@party.io',
        signerName: 'Sam Vendor',
      }),
    );

    // DropboxSign got the custom subject/message verbatim.
    expect(createSignatureRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'custom subject',
        message: 'custom message',
        signerEmail: 'counter@party.io',
        signerName: 'Sam Vendor',
        fileName: 'contract-1.pdf',
      }),
    );

    // Contract was updated with provider state.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('crmContracts');
    expect(updateCalls[0].set).toMatchObject({
      esignProvider: 'dropboxsign',
      esignProviderRequestId: 'req_abc',
      esignSignerEmail: 'counter@party.io',
      esignSignerName: 'Sam Vendor',
      esignStatus: 'sent',
    });

    // Signing event row was inserted.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmContractSigningEvents');
    expect(insertCalls[0].values).toMatchObject({
      contractId: 1,
      clientId: 10,
      kind: 'sent',
      actorEmail: 'counter@party.io',
      payload: { signatureRequestId: 'req_abc', signatureId: 'sig_xyz' },
    });
  });

  it('falls back to default subject + message when body omits them', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 7,
        title: 'NDA',
        summary: null,
        esignStatus: 'declined', // not blocking
        clauses: [],
        lineItems: [],
        fees: [],
        currency: 'USD',
        footerText: null,
      },
    ]);
    renderContractPdfMock.mockResolvedValueOnce(Buffer.from('p'));
    createSignatureRequestMock.mockResolvedValueOnce({
      signatureRequestId: 'r1',
      signatureId: 's1',
    });

    const res = await signPOST(
      makeJsonRequest({ signerEmail: 'a@b.com', signerName: 'Jane' }),
      makeParams('7'),
    );

    expect(res.status).toBe(200);
    expect(createSignatureRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Contract for your signature: NDA',
        message: expect.stringContaining('Please review and sign'),
      }),
    );
  });
});

// ===========================================================================
// GET /api/portal/crm/deals
// ===========================================================================

describe('GET /api/portal/crm/deals', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await dealsGET(makeNextRequest() as never);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await dealsGET(makeNextRequest() as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns an empty list when there are no deals', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([]); // db query returns nothing
    const res = await dealsGET(makeNextRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns deals merged with contactName derived from first + last name', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        title: 'Whale',
        contactFirstName: 'Jane',
        contactLastName: 'Doe',
        companyName: 'Acme',
      },
      {
        id: 2,
        title: 'Lead Only',
        contactFirstName: null,
        contactLastName: null,
        companyName: null,
      },
    ]);
    const res = await dealsGET(makeNextRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].contactName).toBe('Jane Doe');
    expect(body.data[1].contactName).toBeNull();
  });

  it('applies all supported query-string filters without exploding', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    buildCustomFieldFiltersMock.mockReturnValueOnce([
      { op: 'eq', a: { __col: 'id' }, b: 1 },
    ]);
    selectQueue.push([
      {
        id: 5,
        title: 'Filtered',
        contactFirstName: 'A',
        contactLastName: 'B',
        companyName: 'Co',
      },
    ]);

    const res = await dealsGET(
      makeNextRequest(
        'pipelineId=1&stageId=2&status=open&search=whale&ownerId=9',
      ) as never,
    );
    expect(res.status).toBe(200);
    expect(buildCustomFieldFiltersMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.data[0].contactName).toBe('A B');
  });
});

// ===========================================================================
// POST /api/portal/crm/deals
// ===========================================================================

describe('POST /api/portal/crm/deals', () => {
  function dealPostReq(body: unknown): Request {
    return new Request('http://localhost/api/portal/crm/deals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await dealsPOST(dealPostReq({ title: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await dealsPOST(dealPostReq({ title: 'x' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when the title is missing or blank', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await dealsPOST(dealPostReq({ title: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Deal title is required/);
  });

  it('returns 400 when pipeline or stage are missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await dealsPOST(dealPostReq({ title: 'Real' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Pipeline and stage are required/);
  });

  it('creates a deal, emits crm.deal.created, applies defaults', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    insertReturnQueue.push([
      {
        id: 99,
        title: 'New Deal',
        value: null,
        status: 'open',
        stageId: 200,
        contactId: null,
      },
    ]);

    const res = await dealsPOST(
      dealPostReq({
        title: '  New Deal  ',
        pipelineId: 100,
        stageId: 200,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);

    // Inserted with defaults: currency=USD, status=open, priority=medium,
    // ownerId fell back to userId (42), sortOrder=0.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmDeals');
    expect(insertCalls[0].values).toMatchObject({
      clientId: 10,
      title: 'New Deal',
      currency: 'USD',
      status: 'open',
      priority: 'medium',
      sortOrder: 0,
      ownerId: 42,
    });

    expect(emitEventMock).toHaveBeenCalledWith(
      'crm.deal.created',
      10,
      42,
      expect.objectContaining({ id: 99, title: 'New Deal' }),
    );
  });

  it('honors fully populated body — value, dates, ownerId, recurring fields', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    insertReturnQueue.push([
      {
        id: 100,
        title: 'Big',
        value: '12345',
        status: 'won',
        stageId: 200,
        contactId: 300,
      },
    ]);

    const res = await dealsPOST(
      dealPostReq({
        title: 'Big',
        pipelineId: 100,
        stageId: 200,
        contactId: 300,
        companyId: 400,
        value: '12345',
        currency: 'EUR',
        status: 'won',
        priority: 'high',
        expectedCloseDate: '2026-06-01',
        notes: '  notes here  ',
        sortOrder: 5,
        recurringValue: '999',
        billingCycle: 'monthly',
        ownerId: 88,
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({
      title: 'Big',
      contactId: 300,
      companyId: 400,
      currency: 'EUR',
      status: 'won',
      priority: 'high',
      notes: 'notes here',
      sortOrder: 5,
      recurringValue: '999',
      billingCycle: 'monthly',
      ownerId: 88,
    });
    expect(insertCalls[0].values.expectedCloseDate).toBeInstanceOf(Date);
  });
});
