// @vitest-environment node
/**
 * Unit tests for app/api/proposals/[token]/route.ts
 *
 * GET  — public view of a proposal by client token; records view tracking and
 *        fires a one-time proposal_viewed notification on first view.
 * POST — accept or decline a proposal by client token, with expiration check.
 *
 * Everything below the route is mocked: @/lib/db (fluent builder), schema,
 * drizzle-orm helpers, and createCrmNotification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createCrmNotificationMock = vi.fn();
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) => createCrmNotificationMock(...args),
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
    crmProposals: wrap('crmProposals'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    strings: Array.from(strings),
    values,
  }),
}));

// ---- in-memory state ----

interface State {
  proposals: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  companies: Array<Record<string, unknown>>;
  deals: Array<Record<string, unknown>>;
}

const state: State = {
  proposals: [],
  contacts: [],
  companies: [],
  deals: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'crmProposals':
      return state.proposals;
    case 'crmContacts':
      return state.contacts;
    case 'crmCompanies':
      return state.companies;
    case 'crmDeals':
      return state.deals;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown };
  if (f.op === 'eq') {
    const col = f.a as { __col?: string } | undefined;
    if (!col?.__col) return true;
    return row[col.__col] === f.b;
  }
  return true;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    const joins: Array<{ table: string; on: unknown }> = [];

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin(table: { __table: string }, on: unknown) {
        joins.push({ table: table.__table, on });
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        const combined: Record<string, Record<string, unknown> | undefined> = {
          [activeTable]: r,
        };
        for (const j of joins) {
          const onF = j.on as { op?: string; a?: unknown; b?: unknown } | undefined;
          let match: Record<string, unknown> | undefined;
          if (onF?.op === 'eq') {
            const aRef = onF.a as { __col?: string; __table?: string } | undefined;
            const bRef = onF.b as { __col?: string; __table?: string } | undefined;
            if (aRef?.__col && bRef?.__col) {
              const leftRowTable = aRef.__table === j.table ? null : aRef.__table;
              match = tableArray(j.table).find((jr) => {
                const left =
                  aRef.__table === j.table
                    ? jr[aRef.__col!]
                    : combined[leftRowTable!]?.[aRef.__col!];
                const right =
                  bRef.__table === j.table
                    ? jr[bRef.__col!]
                    : combined[bRef.__table!]?.[bRef.__col!];
                return left === right;
              });
            }
          }
          combined[j.table] = match;
        }

        if (projection) {
          const projected: Record<string, unknown> = {};
          for (const [outKey, ref] of Object.entries(projection)) {
            const colRef = ref as { __col?: string; __table?: string } | undefined;
            if (colRef?.__col && colRef.__table) {
              projected[outKey] = combined[colRef.__table]?.[colRef.__col] ?? null;
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
            const arr = tableArray(table.__table);
            const matched = arr.filter((r) => evalPredicate(filter, r));
            for (const r of matched) {
              for (const [k, v] of Object.entries(patch)) {
                // Resolve sql increments like { __sql: true, ... } to a number
                const maybeSql = v as { __sql?: boolean } | undefined;
                if (maybeSql?.__sql) {
                  const current = (r[k] as number | undefined) ?? 0;
                  r[k] = current + 1;
                } else {
                  r[k] = v;
                }
              }
            }
            return {
              returning() {
                return Promise.resolve(matched.map((r) => ({ ...r })));
              },
              then(onFulfilled: (v: unknown) => unknown) {
                return Promise.resolve(undefined).then(onFulfilled);
              },
            };
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

const { GET, POST } = await import('@/app/api/proposals/[token]/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'a'.repeat(64);

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://x/api/proposals/' + VALID_TOKEN);
}

function makePostRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://x/api/proposals/' + VALID_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function defaultProposal(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    dealId: null,
    createdBy: 7,
    contactId: 100,
    companyId: 200,
    clientToken: VALID_TOKEN,
    title: 'Test Proposal',
    summary: 'A test',
    status: 'sent',
    sections: [],
    lineItems: [],
    fees: [],
    currency: 'USD',
    validUntil: null,
    signatureName: null,
    signatureData: null,
    signedAt: null,
    signedIp: null,
    acceptedAt: null,
    declinedAt: null,
    declineReason: null,
    accentColor: '#000',
    logoUrl: null,
    coverImageUrl: null,
    footerText: null,
    sentAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    viewCount: 0,
    lastViewedAt: null,
    firstViewedAt: null,
    ...over,
  };
}

beforeEach(() => {
  state.proposals.length = 0;
  state.contacts.length = 0;
  state.companies.length = 0;
  state.deals.length = 0;
  createCrmNotificationMock.mockReset();
  createCrmNotificationMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/proposals/[token]', () => {
  it('returns 400 when token is missing', async () => {
    const res = await GET(makeGetRequest(), makeParams(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Invalid token' });
  });

  it('returns 400 when token is not 64 chars', async () => {
    const res = await GET(makeGetRequest(), makeParams('short'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no proposal matches the token', async () => {
    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Proposal not found');
  });

  it('returns 404 when proposal exists but is still in draft', async () => {
    state.proposals.push(defaultProposal({ status: 'draft' }));
    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Proposal not available');
  });

  it('returns 200 with proposal data and bumps view tracking on first view', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    state.contacts.push({
      id: 100,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'a@x.test',
    });
    state.companies.push({ id: 200, name: 'Acme' });

    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Test Proposal');
    expect(body.data.contactFirstName).toBe('Alice');
    expect(body.data.contactLastName).toBe('Smith');
    expect(body.data.companyName).toBe('Acme');

    // status flipped to 'viewed' on first view; view count incremented
    expect(state.proposals[0].status).toBe('viewed');
    expect(state.proposals[0].firstViewedAt).toBeInstanceOf(Date);
    expect(state.proposals[0].lastViewedAt).toBeInstanceOf(Date);
    expect(state.proposals[0].viewCount).toBe(1);

    // notification fired on first view, addressed to createdBy
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
    const arg = createCrmNotificationMock.mock.calls[0][0];
    expect(arg.userId).toBe(7);
    expect(arg.type).toBe('proposal_viewed');
    expect(arg.entityType).toBe('proposal');
    expect(arg.entityId).toBe(1); // falls back to proposal id since no dealId
    expect(arg.body).toContain('Alice Smith');
  });

  it('does not re-fire notification on subsequent views', async () => {
    state.proposals.push(defaultProposal({ status: 'viewed', viewCount: 1 }));
    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(state.proposals[0].viewCount).toBe(2);
    expect(state.proposals[0].status).toBe('viewed');
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('falls back to deal owner when proposal has no createdBy', async () => {
    state.proposals.push(
      defaultProposal({ status: 'sent', createdBy: null, dealId: 500 }),
    );
    state.deals.push({ id: 500, ownerId: 42 });
    state.contacts.push({ id: 100, firstName: 'Bob', lastName: 'X', email: 'b@x.test' });

    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
    const arg = createCrmNotificationMock.mock.calls[0][0];
    expect(arg.userId).toBe(42);
    expect(arg.entityId).toBe(500); // dealId preferred when present
  });

  it('skips notification entirely when there is no createdBy and no deal owner', async () => {
    state.proposals.push(
      defaultProposal({ status: 'sent', createdBy: null, dealId: null }),
    );

    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('uses contact email when first/last names are missing', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    state.contacts.push({
      id: 100,
      firstName: null,
      lastName: null,
      email: 'only@email.test',
    });

    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    const arg = createCrmNotificationMock.mock.calls[0][0];
    expect(arg.body).toContain('only@email.test');
  });

  it('logs but does not crash when notification creation rejects', async () => {
    createCrmNotificationMock.mockRejectedValueOnce(new Error('boom'));
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.proposals.push(defaultProposal({ status: 'sent' }));
    state.contacts.push({ id: 100, firstName: 'A', lastName: 'B', email: 'x@y.test' });

    const res = await GET(makeGetRequest(), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    // wait for microtask of the catch
    await new Promise((r) => setTimeout(r, 0));
    expect(consoleErrSpy).toHaveBeenCalled();
    consoleErrSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/proposals/[token]', () => {
  it('returns 400 when token is missing', async () => {
    const res = await POST(makePostRequest({ action: 'accept' }), makeParams(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid token');
  });

  it('returns 400 when token is wrong length', async () => {
    const res = await POST(makePostRequest({ action: 'accept' }), makeParams('short'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no proposal matches', async () => {
    const res = await POST(makePostRequest({ action: 'accept' }), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Proposal not found');
  });

  it('returns 404 when proposal is still draft', async () => {
    state.proposals.push(defaultProposal({ status: 'draft' }));
    const res = await POST(makePostRequest({ action: 'accept' }), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
  });

  it('returns 400 when proposal is already accepted', async () => {
    state.proposals.push(defaultProposal({ status: 'accepted' }));
    const res = await POST(makePostRequest({ action: 'accept' }), makeParams(VALID_TOKEN));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Proposal has already been accepted');
  });

  it('returns 400 when proposal is already declined', async () => {
    state.proposals.push(defaultProposal({ status: 'declined' }));
    const res = await POST(makePostRequest({ action: 'decline' }), makeParams(VALID_TOKEN));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Proposal has already been declined');
  });

  it('returns 400 and marks expired when validUntil is in the past', async () => {
    state.proposals.push(
      defaultProposal({ status: 'sent', validUntil: new Date('2020-01-01') }),
    );
    const res = await POST(makePostRequest({ action: 'accept' }), makeParams(VALID_TOKEN));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Proposal has expired');
    expect(state.proposals[0].status).toBe('expired');
  });

  it('returns 400 when accept action is missing signatureName', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    const res = await POST(
      makePostRequest({ action: 'accept', signatureData: 'data:image/png;base64,...' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Signature name is required');
  });

  it('returns 400 when accept action has only whitespace signatureName', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    const res = await POST(
      makePostRequest({
        action: 'accept',
        signatureName: '   ',
        signatureData: 'data:image/png;base64,...',
      }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Signature name is required');
  });

  it('returns 400 when accept action is missing signatureData', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    const res = await POST(
      makePostRequest({ action: 'accept', signatureName: 'Alice' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Signature data is required');
  });

  it('accepts a valid proposal and returns acceptedAt + status', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    const res = await POST(
      makePostRequest(
        {
          action: 'accept',
          signatureName: '  Alice Signer  ',
          signatureData: 'data:image/png;base64,xxxx',
        },
        { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      ),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('accepted');
    expect(body.data.acceptedAt).toBeTruthy();

    // signature trimmed, status updated, ip captured from first forwarded-for entry
    expect(state.proposals[0].status).toBe('accepted');
    expect(state.proposals[0].signatureName).toBe('Alice Signer');
    expect(state.proposals[0].signedIp).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    await POST(
      makePostRequest(
        {
          action: 'accept',
          signatureName: 'A',
          signatureData: 'data:image/png;base64,xxxx',
        },
        { 'x-real-ip': '198.51.100.7' },
      ),
      makeParams(VALID_TOKEN),
    );
    expect(state.proposals[0].signedIp).toBe('198.51.100.7');
  });

  it('falls back to "unknown" when neither forwarding header is present', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    await POST(
      makePostRequest({
        action: 'accept',
        signatureName: 'A',
        signatureData: 'data:image/png;base64,xxxx',
      }),
      makeParams(VALID_TOKEN),
    );
    expect(state.proposals[0].signedIp).toBe('unknown');
  });

  it('declines a proposal with a trimmed reason', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    const res = await POST(
      makePostRequest({ action: 'decline', reason: '   not interested   ' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('declined');
    expect(state.proposals[0].declineReason).toBe('not interested');
  });

  it('declines a proposal with null reason when none provided', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    const res = await POST(makePostRequest({ action: 'decline' }), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(state.proposals[0].declineReason).toBeNull();
    expect(state.proposals[0].status).toBe('declined');
  });

  it('returns 400 on unknown action', async () => {
    state.proposals.push(defaultProposal({ status: 'sent' }));
    const res = await POST(
      makePostRequest({ action: 'launch-rockets' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('Invalid action');
  });

  it('accepts a viewed proposal (not just sent)', async () => {
    state.proposals.push(defaultProposal({ status: 'viewed' }));
    const res = await POST(
      makePostRequest({
        action: 'accept',
        signatureName: 'Alice',
        signatureData: 'data:image/png;base64,xxxx',
      }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    expect(state.proposals[0].status).toBe('accepted');
  });
});
