// @vitest-environment node
/**
 * Unit tests for four admin-CRM API routes (batch 26e):
 *   - GET app/api/admin/portal/crm/companies/route.ts
 *   - GET app/api/admin/portal/crm/contacts/route.ts
 *   - GET app/api/admin/portal/crm/contracts/route.ts
 *   - GET app/api/admin/portal/crm/dashboard/route.ts
 *
 * Each route requires a staff session (admin or employee). All routes return
 * 401 otherwise. All collaborators (auth, db, drizzle helpers, schema columns)
 * are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  ilike: (a: unknown, b: unknown) => ({ op: 'ilike', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  count: () => ({ op: 'count' }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const obj: Record<string, unknown> = {
        __sql: true,
        strings: Array.from(strings),
        values,
      };
      obj.as = (alias: string) => ({ ...obj, __alias: alias });
      return obj;
    },
    {},
  ),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    crmCompanies: wrap('crmCompanies'),
    crmContacts: wrap('crmContacts'),
    crmContracts: wrap('crmContracts'),
    crmContractSigners: wrap('crmContractSigners'),
    crmDeals: wrap('crmDeals'),
    crmProposals: wrap('crmProposals'),
    crmActivities: wrap('crmActivities'),
    clients: wrap('clients'),
    users: wrap('users'),
  };
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain. We use a FIFO queue so each `await query`
// in the route under test consumes the next prepared rows.
// `$dynamic()` is treated as a passthrough.
// Any select chain that hasn't been explicitly told to throw will resolve.
// ---------------------------------------------------------------------------

let selectQueue: Array<
  Array<Record<string, unknown>> | { __throw: unknown }
> = [];

function nextRows(): Array<Record<string, unknown>> {
  const head = selectQueue.shift();
  if (head && !Array.isArray(head) && '__throw' in head) {
    throw head.__throw;
  }
  return (head as Array<Record<string, unknown>>) ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) {
        try {
          materialized = Promise.resolve(nextRows());
        } catch (e) {
          materialized = Promise.reject(e);
        }
      }
      return materialized;
    };

    // A single chain proxy where every method returns `chain` (passthrough),
    // EXCEPT `then` which materializes the next queued rows. This handles any
    // combination of from/join/where/orderBy/groupBy/limit/offset/$dynamic and
    // works whether the route awaits the chain directly or stashes it in a
    // variable and calls more methods later (the .$dynamic() pattern).
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'rightJoin',
      'fullJoin',
      'where',
      'groupBy',
      'having',
      'orderBy',
      'limit',
      'offset',
      '$dynamic',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// modules under test (imported after mocks)
// ---------------------------------------------------------------------------
const companiesRoute = await import('@/app/api/admin/portal/crm/companies/route');
const contactsRoute = await import('@/app/api/admin/portal/crm/contacts/route');
const contractsRoute = await import('@/app/api/admin/portal/crm/contracts/route');
const dashboardRoute = await import('@/app/api/admin/portal/crm/dashboard/route');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function makeReq(url: string): Request {
  return new Request(url);
}

const ADMIN_SESSION = { user: { id: '1', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '2', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  authMock.mockReset();
});

// ===========================================================================
// GET /api/admin/portal/crm/companies
// ===========================================================================

describe('GET /api/admin/portal/crm/companies', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await companiesRoute.GET(makeReq('http://x/api/admin/portal/crm/companies'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when the session has no user id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await companiesRoute.GET(makeReq('http://x/api/admin/portal/crm/companies'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when caller is not admin or employee', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await companiesRoute.GET(makeReq('http://x/api/admin/portal/crm/companies'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the session has no role at all', async () => {
    authMock.mockResolvedValue({ user: { id: '9' } });
    const res = await companiesRoute.GET(makeReq('http://x/api/admin/portal/crm/companies'));
    expect(res.status).toBe(401);
  });

  it('returns companies with merged contact counts (no search)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    // 1st select: companies
    selectQueue.push([
      {
        id: 1,
        name: 'Acme',
        domain: 'acme.com',
        industry: 'software',
        size: '10-50',
        phone: '555',
        website: 'https://acme.com',
        createdAt: new Date('2026-01-01'),
        clientCompany: 'AcmeCo',
        clientId: 10,
      },
      {
        id: 2,
        name: 'Beta',
        domain: 'beta.com',
        industry: null,
        size: null,
        phone: null,
        website: null,
        createdAt: new Date('2026-01-02'),
        clientCompany: 'BetaCo',
        clientId: 11,
      },
    ]);
    // 2nd select: contact counts
    selectQueue.push([
      { companyId: 1, count: '5' },
      { companyId: 2, count: 2 },
    ]);

    const res = await companiesRoute.GET(makeReq('http://x/api/admin/portal/crm/companies'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ id: 1, contactCount: 5 });
    expect(body.data[1]).toMatchObject({ id: 2, contactCount: 2 });
  });

  it('applies search filter when ?search= is provided', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([
      {
        id: 7,
        name: 'Searched',
        domain: 'searched.com',
        industry: 'x',
        size: null,
        phone: null,
        website: null,
        createdAt: new Date(),
        clientCompany: 'C',
        clientId: 22,
      },
    ]);
    selectQueue.push([]); // no contact-count rows

    const res = await companiesRoute.GET(
      makeReq('http://x/api/admin/portal/crm/companies?search=Acme'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].contactCount).toBe(0);
  });

  it('falls back to 0 contactCount when count map is empty', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 99,
        name: 'NoContacts',
        domain: null,
        industry: null,
        size: null,
        phone: null,
        website: null,
        createdAt: new Date(),
        clientCompany: null,
        clientId: 1,
      },
    ]);
    selectQueue.push([]);
    const res = await companiesRoute.GET(makeReq('http://x/api/admin/portal/crm/companies'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].contactCount).toBe(0);
  });

  it('trims an empty ?search= so the search branch is skipped', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]); // companies
    selectQueue.push([]); // counts
    const res = await companiesRoute.GET(
      makeReq('http://x/api/admin/portal/crm/companies?search=%20%20'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// GET /api/admin/portal/crm/contacts
// ===========================================================================

describe('GET /api/admin/portal/crm/contacts', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contactsRoute.GET(makeReq('http://x/api/admin/portal/crm/contacts'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when caller is a client (not staff)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await contactsRoute.GET(makeReq('http://x/api/admin/portal/crm/contacts'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await contactsRoute.GET(makeReq('http://x/api/admin/portal/crm/contacts'));
    expect(res.status).toBe(401);
  });

  it('returns rows directly when no search is provided', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        firstName: 'Alice',
        lastName: 'A',
        email: 'a@x.com',
        phone: null,
        title: null,
        status: 'active',
        source: 'web',
        lastContactedAt: null,
        createdAt: new Date(),
        companyName: 'Acme',
        clientCompany: 'AcmeCo',
        clientId: 10,
      },
    ]);
    const res = await contactsRoute.GET(makeReq('http://x/api/admin/portal/crm/contacts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].firstName).toBe('Alice');
  });

  it('returns rows when search is provided (applies the where branch)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([
      {
        id: 2,
        firstName: 'Bob',
        lastName: 'B',
        email: 'b@x.com',
        phone: '1',
        title: 't',
        status: 'lead',
        source: 'ref',
        lastContactedAt: null,
        createdAt: new Date(),
        companyName: null,
        clientCompany: 'C',
        clientId: 11,
      },
    ]);
    const res = await contactsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/contacts?search=Bob'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe('b@x.com');
  });

  it('returns empty array when no rows match', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await contactsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/contacts?search=nothing'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('treats whitespace-only search as absent (still 200 with rows)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await contactsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/contacts?search=%20'),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// GET /api/admin/portal/crm/contracts
// ===========================================================================

describe('GET /api/admin/portal/crm/contracts', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contractsRoute.GET(makeReq('http://x/api/admin/portal/crm/contracts'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when caller is not staff', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await contractsRoute.GET(makeReq('http://x/api/admin/portal/crm/contracts'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await contractsRoute.GET(makeReq('http://x/api/admin/portal/crm/contracts'));
    expect(res.status).toBe(401);
  });

  it('returns contracts with signer aggregates merged in', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    // 1st select: contracts
    selectQueue.push([
      {
        id: 1,
        title: 'MSA',
        status: 'sent',
        sentAt: new Date(),
        fullyExecutedAt: null,
        createdAt: new Date(),
        clientCompany: 'AcmeCo',
        clientId: 10,
      },
      {
        id: 2,
        title: 'SOW',
        status: 'draft',
        sentAt: null,
        fullyExecutedAt: null,
        createdAt: new Date(),
        clientCompany: 'BetaCo',
        clientId: 11,
      },
    ]);
    // 2nd select: signer counts
    selectQueue.push([
      { contractId: 1, total: '3', signed: 2 },
      { contractId: 2, total: 1, signed: 0 },
    ]);

    const res = await contractsRoute.GET(makeReq('http://x/api/admin/portal/crm/contracts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ id: 1, signerTotal: 3, signerSigned: 2 });
    expect(body.data[1]).toMatchObject({ id: 2, signerTotal: 1, signerSigned: 0 });
  });

  it('applies a status filter when ?status= is something other than "all"', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([
      {
        id: 5,
        title: 'Signed',
        status: 'executed',
        sentAt: new Date(),
        fullyExecutedAt: new Date(),
        createdAt: new Date(),
        clientCompany: 'CCo',
        clientId: 22,
      },
    ]);
    selectQueue.push([]); // no signer rows
    const res = await contractsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/contracts?status=executed'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].signerTotal).toBe(0);
    expect(body.data[0].signerSigned).toBe(0);
  });

  it('skips the status filter when ?status=all', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]); // contracts
    selectQueue.push([]); // signer counts
    const res = await contractsRoute.GET(
      makeReq('http://x/api/admin/portal/crm/contracts?status=all'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('swallows db errors and returns empty data (table-may-not-exist branch)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    // The route awaits the first query — make it throw.
    selectQueue.push({ __throw: new Error('relation crm_contracts does not exist') });
    const res = await contractsRoute.GET(makeReq('http://x/api/admin/portal/crm/contracts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });
});

// ===========================================================================
// GET /api/admin/portal/crm/dashboard
// ===========================================================================

describe('GET /api/admin/portal/crm/dashboard', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await dashboardRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when caller is a client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await dashboardRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await dashboardRoute.GET();
    expect(res.status).toBe(401);
  });

  it('aggregates contact / deal / proposal / activity stats', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    // Order matches Promise.all + the trailing contracts try-block:
    // 1) contactStats, 2) companyCount, 3) dealStats, 4) proposalStats,
    // 5) recentActivities, 6) contractStats
    selectQueue.push([
      { status: 'active', count: '4' },
      { status: 'lead', count: 2 },
    ]);
    selectQueue.push([{ count: '7' }]);
    selectQueue.push([
      { status: 'open', count: 3, totalValue: '1000' },
      { status: 'won', count: '2', totalValue: 2500 },
    ]);
    selectQueue.push([
      { status: 'draft', count: '1' },
      { status: 'sent', count: 4 },
    ]);
    selectQueue.push([
      {
        id: 100,
        type: 'call',
        title: 'Intro',
        description: null,
        dueDate: null,
        completedAt: null,
        createdAt: new Date(),
        clientCompany: 'AcmeCo',
      },
    ]);
    selectQueue.push([
      { status: 'sent', count: '1' },
      { status: 'executed', count: 2 },
    ]);

    const res = await dashboardRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalContacts).toBe(6);
    expect(body.data.contactsByStatus).toEqual({ active: 4, lead: 2 });
    expect(body.data.totalCompanies).toBe(7);
    expect(body.data.dealsByStatus).toEqual({
      open: { count: 3, value: 1000 },
      won: { count: 2, value: 2500 },
    });
    expect(body.data.proposalsByStatus).toEqual({ draft: 1, sent: 4 });
    expect(body.data.contractsByStatus).toEqual({ sent: 1, executed: 2 });
    expect(body.data.recentActivities).toHaveLength(1);
    expect(body.data.recentActivities[0].title).toBe('Intro');
  });

  it('handles a missing crm_contracts table (contractStats catch branch)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([]); // contactStats
    selectQueue.push([{ count: 0 }]); // companyCount
    selectQueue.push([]); // dealStats
    selectQueue.push([]); // proposalStats
    selectQueue.push([]); // recentActivities
    selectQueue.push({ __throw: new Error('relation crm_contracts does not exist') });

    const res = await dashboardRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalContacts).toBe(0);
    expect(body.data.totalCompanies).toBe(0);
    expect(body.data.dealsByStatus).toEqual({});
    expect(body.data.proposalsByStatus).toEqual({});
    expect(body.data.contractsByStatus).toEqual({});
    expect(body.data.recentActivities).toEqual([]);
  });

  it('falls back to 0 totalCompanies when count row is missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]); // contactStats
    selectQueue.push([]); // companyCount (empty -> undefined first row)
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]); // contractStats success but empty
    const res = await dashboardRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalCompanies).toBe(0);
  });
});
