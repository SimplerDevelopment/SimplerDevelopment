// @vitest-environment node
/**
 * Unit tests for lib/brain/profiles.ts.
 *
 * The module is entirely DB-coupled, so this file mocks `@/lib/db`,
 * `@/lib/db/schema`, `drizzle-orm`, and `./industry-templates`. The mock
 * implements a tiny chainable query builder backed by an in-memory state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface OverlayRow {
  id: number;
  clientId: number;
  name: string;
  industryTemplate?: string;
  enabled?: boolean;
  autoProcessEmail?: boolean;
  autoLinkCrm?: boolean;
  defaultConfidentiality?: string;
  enabledModules?: Record<string, boolean>;
  serviceLines?: string[];
  emailIngestToken?: string | null;
  updatedAt?: Date;
  createdAt?: Date;
}

interface MockState {
  brainProfiles: OverlayRow[];
}

const state: MockState = {
  brainProfiles: [],
};

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
  return new Proxy({
    brainProfiles: wrap('brainProfiles'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/brain/industry-templates', () => ({
  getIndustryTemplate: (id: string) => ({
    id,
    serviceLines: ['template-line-a', 'template-line-b'],
  }),
}));

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

function tableArray(name: string): OverlayRow[] {
  return (state as unknown as Record<string, OverlayRow[]>)[name] ?? [];
}

let idCounter = 1000;

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
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
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<OverlayRow[]> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r as unknown as Record<string, unknown>));
      let out = rows.map((r) => ({ ...r }));
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
          const row: OverlayRow = {
            id: idCounter++,
            createdAt: new Date(),
            updatedAt: new Date(),
            enabled: false,
            autoProcessEmail: false,
            autoLinkCrm: false,
            defaultConfidentiality: 'standard',
            enabledModules: {},
            serviceLines: [],
            industryTemplate: 'generic',
            ...(v as OverlayRow),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r as unknown as Record<string, unknown>));
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

  return {
    db: {
      select() {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

beforeEach(() => {
  state.brainProfiles.length = 0;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/brain/profiles');
}

// ---------------------------------------------------------------------------
// getBrainProfile
// ---------------------------------------------------------------------------

describe('getBrainProfile', () => {
  it('returns null when no profile exists for the client', async () => {
    const { getBrainProfile } = await importModule();
    const res = await getBrainProfile(1);
    expect(res).toBeNull();
  });

  it('returns the matching row for a client', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 7,
      name: 'Acme Brain',
      emailIngestToken: 'tok',
    });
    const { getBrainProfile } = await importModule();
    const res = await getBrainProfile(7);
    expect(res).not.toBeNull();
    expect(res!.name).toBe('Acme Brain');
  });

  it('does not return a profile belonging to a different client', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 7,
      name: 'Acme Brain',
      emailIngestToken: 'tok',
    });
    const { getBrainProfile } = await importModule();
    const res = await getBrainProfile(8);
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getOrCreateBrainProfile
// ---------------------------------------------------------------------------

describe('getOrCreateBrainProfile', () => {
  it('creates a new profile when none exists with a random emailIngestToken', async () => {
    const { getOrCreateBrainProfile } = await importModule();
    const created = await getOrCreateBrainProfile(1, 'Default Brain');
    expect(created.clientId).toBe(1);
    expect(created.name).toBe('Default Brain');
    expect(typeof created.emailIngestToken).toBe('string');
    expect((created.emailIngestToken ?? '').length).toBe(32); // 16 bytes hex = 32 chars
    expect(state.brainProfiles).toHaveLength(1);
  });

  it('returns the existing profile when one exists with an ingest token', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'Existing',
      emailIngestToken: 'preexisting-token',
    });
    const { getOrCreateBrainProfile } = await importModule();
    const result = await getOrCreateBrainProfile(1, 'New Name');
    expect(result.id).toBe(5);
    expect(result.name).toBe('Existing'); // name not changed
    expect(result.emailIngestToken).toBe('preexisting-token');
    expect(state.brainProfiles).toHaveLength(1);
  });

  it('backfills emailIngestToken on an existing profile that lacks one', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'Existing',
      emailIngestToken: null,
    });
    const { getOrCreateBrainProfile } = await importModule();
    const result = await getOrCreateBrainProfile(1, 'unused');
    expect(result.id).toBe(5);
    expect(typeof result.emailIngestToken).toBe('string');
    expect((result.emailIngestToken ?? '').length).toBe(32);
    // also persisted to state
    expect(state.brainProfiles[0].emailIngestToken).toBe(result.emailIngestToken);
  });

  it('produces unique tokens across separate creations', async () => {
    const { getOrCreateBrainProfile } = await importModule();
    const a = await getOrCreateBrainProfile(1, 'A');
    const b = await getOrCreateBrainProfile(2, 'B');
    expect(a.emailIngestToken).not.toBe(b.emailIngestToken);
  });
});

// ---------------------------------------------------------------------------
// rotateEmailIngestToken
// ---------------------------------------------------------------------------

describe('rotateEmailIngestToken', () => {
  it('returns null when there is no profile for the client', async () => {
    const { rotateEmailIngestToken } = await importModule();
    const res = await rotateEmailIngestToken(999);
    expect(res).toBeNull();
  });

  it('rotates the token in place and bumps updatedAt', async () => {
    const oldDate = new Date('2025-01-01');
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'Existing',
      emailIngestToken: 'old-token',
      updatedAt: oldDate,
    });
    const { rotateEmailIngestToken } = await importModule();
    const res = await rotateEmailIngestToken(1);
    expect(res).not.toBeNull();
    expect(res!.emailIngestToken).not.toBe('old-token');
    expect((res!.emailIngestToken ?? '').length).toBe(32);
    expect(res!.updatedAt).not.toBe(oldDate);
    expect(state.brainProfiles[0].emailIngestToken).toBe(res!.emailIngestToken);
  });
});

// ---------------------------------------------------------------------------
// updateBrainProfile
// ---------------------------------------------------------------------------

describe('updateBrainProfile', () => {
  it('returns null when there is no profile to update', async () => {
    const { updateBrainProfile } = await importModule();
    const res = await updateBrainProfile(1, { name: 'x' });
    expect(res).toBeNull();
  });

  it('updates only the provided scalar fields and preserves others', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'Old',
      enabled: false,
      autoProcessEmail: false,
      autoLinkCrm: false,
      defaultConfidentiality: 'standard',
      industryTemplate: 'generic',
      enabledModules: { tasks: true, notes: false },
      serviceLines: ['orig'],
      emailIngestToken: 'tok',
    });
    const { updateBrainProfile } = await importModule();
    const res = await updateBrainProfile(1, {
      name: 'New Name',
      enabled: true,
      autoProcessEmail: true,
    });
    expect(res).not.toBeNull();
    expect(res!.name).toBe('New Name');
    expect(res!.enabled).toBe(true);
    expect(res!.autoProcessEmail).toBe(true);
    // Untouched fields preserved
    expect(res!.autoLinkCrm).toBe(false);
    expect(res!.defaultConfidentiality).toBe('standard');
    expect(res!.serviceLines).toEqual(['orig']);
  });

  it('merges enabledModules rather than replacing them outright', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'p',
      enabledModules: { tasks: true, notes: false, meetings: true },
    });
    const { updateBrainProfile } = await importModule();
    const res = await updateBrainProfile(1, {
      enabledModules: { notes: true } as Partial<{ tasks: boolean; notes: boolean; meetings: boolean }>,
    });
    expect(res!.enabledModules).toEqual({
      tasks: true,
      notes: true, // overridden
      meetings: true,
    });
  });

  it('replaces serviceLines wholesale when provided', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'p',
      serviceLines: ['a', 'b'],
    });
    const { updateBrainProfile } = await importModule();
    const res = await updateBrainProfile(1, { serviceLines: ['x'] });
    expect(res!.serviceLines).toEqual(['x']);
  });

  it('updates the industryTemplate, autoLinkCrm, and defaultConfidentiality fields', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'p',
      industryTemplate: 'generic',
      autoLinkCrm: false,
      defaultConfidentiality: 'standard',
    });
    const { updateBrainProfile } = await importModule();
    const res = await updateBrainProfile(1, {
      industryTemplate: 'wealth_advisory',
      autoLinkCrm: true,
      defaultConfidentiality: 'confidential',
    });
    expect(res!.industryTemplate).toBe('wealth_advisory');
    expect(res!.autoLinkCrm).toBe(true);
    expect(res!.defaultConfidentiality).toBe('confidential');
  });

  it('bumps updatedAt on every call', async () => {
    const oldDate = new Date('2024-06-01');
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'p',
      updatedAt: oldDate,
    });
    const { updateBrainProfile } = await importModule();
    const res = await updateBrainProfile(1, {});
    expect(res!.updatedAt).not.toBe(oldDate);
    expect(res!.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// applyIndustryTemplateDefaults
// ---------------------------------------------------------------------------

describe('applyIndustryTemplateDefaults', () => {
  it('returns null when the client has no brain profile', async () => {
    const { applyIndustryTemplateDefaults } = await importModule();
    const res = await applyIndustryTemplateDefaults(1, 'generic');
    expect(res).toBeNull();
  });

  it('seeds serviceLines from the template when the profile has none', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'p',
      industryTemplate: 'generic',
      serviceLines: [],
    });
    const { applyIndustryTemplateDefaults } = await importModule();
    const res = await applyIndustryTemplateDefaults(1, 'wealth_advisory');
    expect(res).not.toBeNull();
    expect(res!.industryTemplate).toBe('wealth_advisory');
    expect(res!.serviceLines).toEqual(['template-line-a', 'template-line-b']);
  });

  it('keeps existing serviceLines when the profile has already customized them', async () => {
    state.brainProfiles.push({
      id: 5,
      clientId: 1,
      name: 'p',
      industryTemplate: 'generic',
      serviceLines: ['custom-1', 'custom-2'],
    });
    const { applyIndustryTemplateDefaults } = await importModule();
    const res = await applyIndustryTemplateDefaults(1, 'wealth_advisory');
    expect(res).not.toBeNull();
    expect(res!.industryTemplate).toBe('wealth_advisory');
    expect(res!.serviceLines).toEqual(['custom-1', 'custom-2']);
  });
});
