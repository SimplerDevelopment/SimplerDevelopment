// @vitest-environment node
/**
 * Unit tests for app/api/portal/crm/companies/[id]/route.ts
 *
 * GET   — load company by id, scoped by client, with contacts, deals, custom
 *         fields and lat/lng from a raw SQL execute.
 * PUT   — partial update; geocode side-effects + explicit lat/lng overrides.
 * DELETE — scoped delete by id.
 *
 * Everything below the route is mocked: auth, getPortalClient, the @/lib/db
 * fluent builder (select / update / delete / execute), drizzle helpers,
 * geocode, schema column refs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const geocodeAddressMock = vi.fn();
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: (...args: unknown[]) => geocodeAddressMock(...args),
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
    crmCompanies: wrap('crmCompanies'),
    crmContacts: wrap('crmContacts'),
    crmDeals: wrap('crmDeals'),
    crmPipelineStages: wrap('crmPipelineStages'),
    crmCustomFields: wrap('crmCustomFields'),
    crmCustomFieldValues: wrap('crmCustomFieldValues'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    strings: Array.from(strings),
    values,
  }),
}));

// ---- in-memory state ----

interface State {
  companies: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  deals: Array<Record<string, unknown>>;
  stages: Array<Record<string, unknown>>;
  customFields: Array<Record<string, unknown>>;
  customFieldValues: Array<Record<string, unknown>>;
  coords: Map<number, { latitude: string | null; longitude: string | null }>;
}

const state: State = {
  companies: [],
  contacts: [],
  deals: [],
  stages: [],
  customFields: [],
  customFieldValues: [],
  coords: new Map(),
};

// Execute behavior knobs
let executeShouldThrow = false;
let executeUpdateShouldThrow = false;
const executeCalls: unknown[] = [];

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'crmCompanies':
      return state.companies;
    case 'crmContacts':
      return state.contacts;
    case 'crmDeals':
      return state.deals;
    case 'crmPipelineStages':
      return state.stages;
    case 'crmCustomFields':
      return state.customFields;
    case 'crmCustomFieldValues':
      return state.customFieldValues;
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
    const joins: Array<{
      table: string;
      on: unknown;
    }> = [];

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
        return chain;
      },
      orderBy() {
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      // Apply joins — best-effort. For each row, find matching join rows.
      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        // Build a combined row including join data.
        const combined: Record<string, Record<string, unknown> | undefined> = {
          [activeTable]: r,
        };
        for (const j of joins) {
          // The on clause is either a single eq or an and(...) of eqs.
          // Each eq has a:{__col,__table} on one side and either
          //   - b:{__col,__table} → cross-table ref, OR
          //   - b: primitive literal
          // We need to find a row in j.table that satisfies all eqs.
          const eqClauses: Array<{
            a: { __col?: string; __table?: string };
            b: unknown;
          }> = [];
          const collectEqs = (node: unknown) => {
            const n = node as
              | { op?: string; a?: unknown; b?: unknown; args?: unknown[] }
              | undefined;
            if (!n) return;
            if (n.op === 'eq') {
              eqClauses.push({
                a: n.a as { __col?: string; __table?: string },
                b: n.b,
              });
            } else if (n.op === 'and' && Array.isArray(n.args)) {
              n.args.forEach(collectEqs);
            }
          };
          collectEqs(j.on);

          const match = tableArray(j.table).find((jr) => {
            return eqClauses.every((clause) => {
              const aRef = clause.a;
              const bRef = clause.b as { __col?: string; __table?: string } | unknown;
              if (!aRef?.__col) return true;
              // Resolve left side (a). Could refer to j.table or another table.
              let leftVal: unknown;
              if (aRef.__table === j.table) {
                leftVal = jr[aRef.__col];
              } else {
                leftVal = combined[aRef.__table!]?.[aRef.__col];
              }
              // Resolve right side (b). Could be cross-table ref or literal.
              let rightVal: unknown;
              const bAsRef = bRef as { __col?: string; __table?: string } | undefined;
              if (bAsRef && typeof bAsRef === 'object' && bAsRef.__col) {
                if (bAsRef.__table === j.table) {
                  rightVal = jr[bAsRef.__col];
                } else {
                  rightVal = combined[bAsRef.__table!]?.[bAsRef.__col];
                }
              } else {
                rightVal = bRef;
              }
              return leftVal === rightVal;
            });
          });
          combined[j.table] = match;
        }

        // Apply projection if present
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
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
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
        const arr = tableArray(table.__table);
        const matched = arr.filter((r) => evalPredicate(filter, r));
        const remaining = arr.filter((r) => !evalPredicate(filter, r));
        arr.length = 0;
        arr.push(...remaining);
        return {
          returning() {
            return Promise.resolve(matched.map((r) => ({ ...r })));
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      async execute(query: unknown) {
        executeCalls.push(query);
        const q = query as {
          __sql?: boolean;
          strings?: string[];
          values?: unknown[];
        };
        const joined = (q?.strings ?? []).join(' ').toUpperCase();
        if (joined.includes('SELECT LATITUDE')) {
          if (executeShouldThrow) {
            throw new Error('execute select boom');
          }
          // Find company id (first value)
          const companyId = q.values?.[0] as number;
          const coords = state.coords.get(companyId);
          return coords ? [coords] : [];
        }
        if (joined.includes('UPDATE CRM_COMPANIES') || joined.includes('UPDATE')) {
          if (executeUpdateShouldThrow) {
            throw new Error('execute update boom');
          }
          // values are [lat, lng, companyId]
          const lat = q.values?.[0] as number | null;
          const lng = q.values?.[1] as number | null;
          const companyId = q.values?.[2] as number;
          state.coords.set(companyId, {
            latitude: lat == null ? null : String(lat),
            longitude: lng == null ? null : String(lng),
          });
          return [];
        }
        return [];
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { GET, PUT, DELETE } = await import('@/app/api/portal/crm/companies/[id]/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown): Request {
  return new Request('http://x/api/portal/crm/companies/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultCompany(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    name: 'Acme Co',
    domain: 'acme.test',
    industry: 'SaaS',
    size: 'mid',
    phone: '555-1234',
    address: '123 Main St',
    website: 'https://acme.test',
    logoUrl: null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

beforeEach(() => {
  state.companies.length = 0;
  state.contacts.length = 0;
  state.deals.length = 0;
  state.stages.length = 0;
  state.customFields.length = 0;
  state.customFieldValues.length = 0;
  state.coords.clear();
  executeShouldThrow = false;
  executeUpdateShouldThrow = false;
  executeCalls.length = 0;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  geocodeAddressMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/crm/companies/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when id is not a number', async () => {
    const res = await GET(new Request('http://x'), makeParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when the company does not exist for the client', async () => {
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Company not found');
  });

  it('returns 404 when company exists but is owned by a different client', async () => {
    state.companies.push(defaultCompany({ id: 1, clientId: 999 }));
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with company + contacts + deals + customFields on success', async () => {
    state.companies.push(defaultCompany());
    state.coords.set(1, { latitude: '40.7128', longitude: '-74.0060' });
    state.contacts.push({
      id: 100,
      companyId: 1,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'a@x.test',
      phone: '111',
      title: 'CTO',
      status: 'active',
      createdAt: new Date('2026-02-01'),
    });
    state.stages.push({ id: 5, name: 'Discovery' });
    state.deals.push({
      id: 200,
      companyId: 1,
      contactId: 100,
      stageId: 5,
      title: 'Big Deal',
      value: 5000,
      status: 'open',
      expectedCloseDate: new Date('2026-06-01'),
      createdAt: new Date('2026-03-01'),
    });
    state.customFields.push({
      id: 300,
      clientId: 10,
      entityType: 'company',
      fieldName: 'Tier',
      fieldType: 'text',
    });
    state.customFieldValues.push({
      customFieldId: 300,
      entityId: 1,
      entityType: 'company',
      value: 'Gold',
    });

    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.company.id).toBe(1);
    expect(body.data.company.latitude).toBe('40.7128');
    expect(body.data.company.longitude).toBe('-74.0060');
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contacts[0].firstName).toBe('Alice');
    expect(body.data.deals).toHaveLength(1);
    expect(body.data.deals[0].title).toBe('Big Deal');
    expect(body.data.deals[0].value).toBe(5000);
    expect(body.data.deals[0].contactName).toBe('Alice Smith');
    expect(body.data.deals[0].stageName).toBe('Discovery');
    expect(body.data.customFields[300]).toEqual({
      name: 'Tier',
      type: 'text',
      value: 'Gold',
    });
  });

  it('returns null lat/lng when coord lookup fails', async () => {
    state.companies.push(defaultCompany());
    executeShouldThrow = true;
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.company.latitude).toBeNull();
    expect(body.data.company.longitude).toBeNull();
  });

  it('returns null lat/lng when no coord row is found', async () => {
    state.companies.push(defaultCompany());
    // no coord row inserted
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.company.latitude).toBeNull();
    expect(body.data.company.longitude).toBeNull();
  });

  it('handles deals with missing stage/contact (unknown stage, null contact)', async () => {
    state.companies.push(defaultCompany());
    state.deals.push({
      id: 201,
      companyId: 1,
      contactId: null,
      stageId: null,
      title: 'Orphan Deal',
      value: null,
      status: 'open',
      expectedCloseDate: null,
      createdAt: new Date(),
    });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deals[0].contactName).toBeNull();
    expect(body.data.deals[0].stageName).toBe('Unknown');
    expect(body.data.deals[0].value).toBe(0);
  });

  it('returns customField with null value when no value row exists', async () => {
    state.companies.push(defaultCompany());
    state.customFields.push({
      id: 301,
      clientId: 10,
      entityType: 'company',
      fieldName: 'Region',
      fieldType: 'text',
    });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.customFields[301]).toEqual({
      name: 'Region',
      type: 'text',
      value: null,
    });
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/portal/crm/companies/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PUT(makeRequest({ name: 'X' }), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await PUT(makeRequest({ name: 'X' }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid id', async () => {
    const res = await PUT(makeRequest({ name: 'X' }), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when no company exists for that id+client', async () => {
    const res = await PUT(makeRequest({ name: 'X' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Company not found');
  });

  it('updates name + domain + phone trimming and returns success', async () => {
    state.companies.push(defaultCompany());
    state.coords.set(1, { latitude: '1.1', longitude: '2.2' });
    const res = await PUT(
      makeRequest({ name: '  New Name  ', domain: '  new.test  ', phone: '  999  ' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Name');
    expect(body.data.domain).toBe('new.test');
    expect(body.data.phone).toBe('999');
    // coords come back unchanged via loadCompanyCoords path
    expect(body.data.latitude).toBe('1.1');
    expect(body.data.longitude).toBe('2.2');
  });

  it('coerces empty strings to null for optional fields', async () => {
    state.companies.push(defaultCompany());
    const res = await PUT(
      makeRequest({
        domain: '',
        industry: '',
        size: '',
        phone: '',
        website: '',
        logoUrl: '',
        notes: '',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.domain).toBeNull();
    expect(body.data.industry).toBeNull();
    expect(body.data.size).toBeNull();
    expect(body.data.phone).toBeNull();
    expect(body.data.website).toBeNull();
    expect(body.data.logoUrl).toBeNull();
    expect(body.data.notes).toBeNull();
  });

  it('applies explicit latitude+longitude verbatim without geocoding', async () => {
    state.companies.push(defaultCompany());
    const res = await PUT(
      makeRequest({ latitude: '12.34', longitude: '56.78' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.latitude).toBe(12.34);
    expect(body.data.longitude).toBe(56.78);
    expect(geocodeAddressMock).not.toHaveBeenCalled();
  });

  it('parses non-finite explicit coords to null', async () => {
    state.companies.push(defaultCompany());
    const res = await PUT(
      makeRequest({ latitude: 'not-a-number', longitude: 'nope' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.latitude).toBeNull();
    expect(body.data.longitude).toBeNull();
  });

  it('re-geocodes when the address changes and geocode returns coords', async () => {
    state.companies.push(defaultCompany({ address: '123 Main St' }));
    geocodeAddressMock.mockResolvedValueOnce({ latitude: 1.5, longitude: 2.5 });
    const res = await PUT(
      makeRequest({ address: '999 Different Ave' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(geocodeAddressMock).toHaveBeenCalledWith('999 Different Ave');
    const body = await res.json();
    expect(body.data.latitude).toBe(1.5);
    expect(body.data.longitude).toBe(2.5);
  });

  it('clears coords when address changes and geocode returns null', async () => {
    state.companies.push(defaultCompany({ address: '123 Main St' }));
    state.coords.set(1, { latitude: '5', longitude: '6' });
    geocodeAddressMock.mockResolvedValueOnce(null);
    const res = await PUT(
      makeRequest({ address: 'Unknown place' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.latitude).toBeNull();
    expect(body.data.longitude).toBeNull();
  });

  it('continues without crashing when geocode throws', async () => {
    state.companies.push(defaultCompany({ address: '123 Main St' }));
    state.coords.set(1, { latitude: '5', longitude: '6' });
    geocodeAddressMock.mockRejectedValueOnce(new Error('geocode boom'));
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await PUT(
      makeRequest({ address: 'New Address' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Coords unchanged from loadCompanyCoords (loaded from state)
    expect(body.data.latitude).toBe('5');
    expect(body.data.longitude).toBe('6');
    consoleErrSpy.mockRestore();
  });

  it('clears coords when address is set to empty string', async () => {
    state.companies.push(defaultCompany({ address: '123 Main St' }));
    state.coords.set(1, { latitude: '5', longitude: '6' });
    const res = await PUT(
      makeRequest({ address: '' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.latitude).toBeNull();
    expect(body.data.longitude).toBeNull();
  });

  it('does not re-geocode when address is unchanged', async () => {
    state.companies.push(defaultCompany({ address: '123 Main St' }));
    state.coords.set(1, { latitude: '7', longitude: '8' });
    const res = await PUT(
      makeRequest({ address: '123 Main St', name: 'Renamed' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(geocodeAddressMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.latitude).toBe('7');
    expect(body.data.longitude).toBe('8');
  });

  it('logs but does not crash when SQL coord persistence throws', async () => {
    state.companies.push(defaultCompany());
    executeUpdateShouldThrow = true;
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await PUT(
      makeRequest({ latitude: '1', longitude: '2' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(consoleErrSpy).toHaveBeenCalled();
    consoleErrSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/crm/companies/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid id', async () => {
    const res = await DELETE(new Request('http://x'), makeParams('xx'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when no matching company exists', async () => {
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Company not found');
  });

  it('returns 404 when the company belongs to a different client', async () => {
    state.companies.push(defaultCompany({ id: 1, clientId: 999 }));
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('successfully deletes a scoped company and returns the deleted row', async () => {
    state.companies.push(defaultCompany());
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(state.companies).toHaveLength(0);
  });
});
