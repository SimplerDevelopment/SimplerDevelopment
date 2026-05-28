// @vitest-environment node
/**
 * Unit tests for lib/branding/mcp-tools.ts.
 *
 * The module is DB-coupled — every handler scopes by `clientId` and reads
 * from `brandingProfiles` / `brandingMessaging`. We mock `@/lib/db`,
 * `@/lib/db/schema`, and `drizzle-orm` with a minimal in-memory store so
 * each test can seed rows and exercise the handlers end-to-end. The
 * pure modules (`./audit`, `./block-defaults`, `./mcp-schemas`) are NOT
 * mocked — we want them in the call chain so an audit invocation actually
 * produces a real report.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brandingProfiles: Array<Record<string, unknown>>;
  brandingMessaging: Array<Record<string, unknown>>;
}

const state: MockState = {
  brandingProfiles: [],
  brandingMessaging: [],
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
  return {
    brandingProfiles: wrap('brandingProfiles'),
    brandingMessaging: wrap('brandingMessaging'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
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

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string } | undefined;
    out[alias] = r?.__col ? row[r.__col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
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
      orderBy() {
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

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
    },
  };
});

beforeEach(() => {
  state.brandingProfiles.length = 0;
  state.brandingMessaging.length = 0;
});

async function importModule() {
  return await import('@/lib/branding/mcp-tools');
}

// ---------------------------------------------------------------------------
// handleBrandingListProfiles
// ---------------------------------------------------------------------------

describe('handleBrandingListProfiles', () => {
  it('returns an empty list when the client has no profiles', async () => {
    const { handleBrandingListProfiles } = await importModule();
    const res = await handleBrandingListProfiles({ clientId: 1 });
    expect(res).toEqual({ profiles: [] });
  });

  it('returns only profiles for the caller clientId — tenant isolation', async () => {
    state.brandingProfiles.push(
      { id: 1, clientId: 1, name: 'A', isDefault: true, primaryColor: '#111', accentColor: '#222', logoUrl: 'a.png' },
      { id: 2, clientId: 2, name: 'B', isDefault: true, primaryColor: '#aaa', accentColor: '#bbb', logoUrl: 'b.png' },
      { id: 3, clientId: 1, name: 'C', isDefault: false, primaryColor: '#333', accentColor: '#444', logoUrl: 'c.png' },
    );
    const { handleBrandingListProfiles } = await importModule();
    const res = await handleBrandingListProfiles({ clientId: 1 });
    expect(res.profiles).toHaveLength(2);
    const names = res.profiles.map((p) => p.name).sort();
    expect(names).toEqual(['A', 'C']);
  });

  it('projects only the listing columns', async () => {
    state.brandingProfiles.push({
      id: 1,
      clientId: 1,
      name: 'A',
      isDefault: true,
      primaryColor: '#111',
      secondaryColor: '#999',
      accentColor: '#222',
      logoUrl: 'a.png',
      textColor: '#000',
    });
    const { handleBrandingListProfiles } = await importModule();
    const res = await handleBrandingListProfiles({ clientId: 1 });
    expect(Object.keys(res.profiles[0]).sort()).toEqual(
      ['accentColor', 'id', 'isDefault', 'logoUrl', 'name', 'primaryColor'].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// handleBrandingGetProfile
// ---------------------------------------------------------------------------

describe('handleBrandingGetProfile', () => {
  it('returns null + message when the client has zero profiles', async () => {
    const { handleBrandingGetProfile } = await importModule();
    const res = await handleBrandingGetProfile({ clientId: 1 }, {});
    expect(res).toEqual({ profile: null, message: 'No branding profile found' });
  });

  it('returns the requested profileId when provided', async () => {
    state.brandingProfiles.push(
      { id: 10, clientId: 1, name: 'Wanted', isDefault: false, primaryColor: '#fff' },
      { id: 11, clientId: 1, name: 'Other', isDefault: true, primaryColor: '#000' },
    );
    const { handleBrandingGetProfile } = await importModule();
    const res = await handleBrandingGetProfile({ clientId: 1 }, { profileId: 10 });
    expect(res.profile).not.toBeNull();
    expect(res.profile!.id).toBe(10);
    expect(res.profile!.name).toBe('Wanted');
  });

  it('refuses to leak another client\'s profile via profileId', async () => {
    state.brandingProfiles.push({ id: 10, clientId: 2, name: 'Other tenant', isDefault: true });
    const { handleBrandingGetProfile } = await importModule();
    const res = await handleBrandingGetProfile({ clientId: 1 }, { profileId: 10 });
    expect(res.profile).toBeNull();
    expect(res.message).toBe('No branding profile found');
  });

  it('falls back to the default profile when profileId is omitted', async () => {
    state.brandingProfiles.push(
      { id: 1, clientId: 1, name: 'Not default', isDefault: false },
      { id: 2, clientId: 1, name: 'Default one', isDefault: true, primaryColor: '#0a0' },
    );
    const { handleBrandingGetProfile } = await importModule();
    const res = await handleBrandingGetProfile({ clientId: 1 }, {});
    expect(res.profile!.id).toBe(2);
    expect(res.profile!.name).toBe('Default one');
  });

  it('falls back to the first profile when none is marked default', async () => {
    state.brandingProfiles.push(
      { id: 1, clientId: 1, name: 'First', isDefault: false },
      { id: 2, clientId: 1, name: 'Second', isDefault: false },
    );
    const { handleBrandingGetProfile } = await importModule();
    const res = await handleBrandingGetProfile({ clientId: 1 }, {});
    expect(res.profile).not.toBeNull();
    expect(res.profile!.id).toBe(1);
  });

  it('returns the full column set with all the brand fields', async () => {
    state.brandingProfiles.push({
      id: 5,
      clientId: 1,
      name: 'Full',
      isDefault: true,
      primaryColor: '#111',
      secondaryColor: '#222',
      accentColor: '#333',
      backgroundColor: '#fff',
      textColor: '#000',
      navBackground: '#eee',
      navTextColor: '#000',
      linkColor: '#00f',
      linkHoverColor: '#005',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      borderRadius: '8px',
      logoUrl: 'l.png',
      logoSquareUrl: 'sq.png',
      logoRectUrl: 'r.png',
      logoIconUrl: 'i.png',
      faviconUrl: 'f.png',
      ogImageUrl: 'og.png',
      buttonStyle: { primaryBg: '#111', primaryText: '#fff' },
      typography: { scale: 1.25 },
    });
    const { handleBrandingGetProfile } = await importModule();
    const res = await handleBrandingGetProfile({ clientId: 1 }, {});
    expect(res.profile).toMatchObject({
      id: 5,
      name: 'Full',
      isDefault: true,
      primaryColor: '#111',
      secondaryColor: '#222',
      accentColor: '#333',
      backgroundColor: '#fff',
      textColor: '#000',
      navBackground: '#eee',
      navTextColor: '#000',
      linkColor: '#00f',
      linkHoverColor: '#005',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      borderRadius: '8px',
      logoUrl: 'l.png',
      logoSquareUrl: 'sq.png',
      logoRectUrl: 'r.png',
      logoIconUrl: 'i.png',
      faviconUrl: 'f.png',
      ogImageUrl: 'og.png',
      buttonStyle: { primaryBg: '#111', primaryText: '#fff' },
      typography: { scale: 1.25 },
    });
  });
});

// ---------------------------------------------------------------------------
// handleBrandingGetMessaging
// ---------------------------------------------------------------------------

describe('handleBrandingGetMessaging', () => {
  it('returns null + message when no messaging row exists', async () => {
    const { handleBrandingGetMessaging } = await importModule();
    const res = await handleBrandingGetMessaging({ clientId: 1 }, {});
    expect(res).toEqual({ messaging: null, message: 'No messaging row configured for this client.' });
  });

  it('returns the profile-scoped messaging row when one matches', async () => {
    state.brandingMessaging.push(
      { id: 1, clientId: 1, brandingProfileId: 7, companyName: 'Scoped', tagline: 't-scoped' },
      { id: 2, clientId: 1, brandingProfileId: null, companyName: 'Global', tagline: 't-global' },
    );
    const { handleBrandingGetMessaging } = await importModule();
    const res = await handleBrandingGetMessaging({ clientId: 1 }, { profileId: 7 });
    expect(res.messaging).not.toBeNull();
    expect(res.messaging!.companyName).toBe('Scoped');
    expect(res.messaging!.tagline).toBe('t-scoped');
  });

  it('falls back to the first messaging row when scoped lookup misses', async () => {
    state.brandingMessaging.push({
      id: 9,
      clientId: 1,
      brandingProfileId: null,
      companyName: 'Fallback Co',
      tagline: 'Fallback tag',
    });
    const { handleBrandingGetMessaging } = await importModule();
    const res = await handleBrandingGetMessaging({ clientId: 1 }, { profileId: 999 });
    expect(res.messaging).not.toBeNull();
    expect(res.messaging!.companyName).toBe('Fallback Co');
  });

  it('does not leak another tenant\'s messaging', async () => {
    state.brandingMessaging.push({
      id: 1,
      clientId: 2,
      brandingProfileId: null,
      companyName: 'Other tenant',
      tagline: 'leak',
    });
    const { handleBrandingGetMessaging } = await importModule();
    const res = await handleBrandingGetMessaging({ clientId: 1 }, {});
    expect(res.messaging).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleBrandingAudit
// ---------------------------------------------------------------------------

describe('handleBrandingAudit', () => {
  it('returns an error when the profile is not found', async () => {
    const { handleBrandingAudit } = await importModule();
    const res = await handleBrandingAudit({ clientId: 1 }, { profileId: 42 });
    expect(res).toEqual({ error: 'Profile 42 not found for this client.' });
  });

  it('returns a real audit report for a sparse profile (catches missing-color errors)', async () => {
    state.brandingProfiles.push({
      id: 1,
      clientId: 1,
      name: 'Sparse',
      isDefault: true,
      // primary, background, text intentionally missing → audit produces errors
      primaryColor: null,
      backgroundColor: null,
      textColor: null,
      buttonStyle: null,
    });
    const { handleBrandingAudit } = await importModule();
    const res = await handleBrandingAudit({ clientId: 1 }, { profileId: 1 });
    expect('report' in res).toBe(true);
    const r = (res as { report: { issues: Array<{ id: string }>; counts: Record<string, number> } }).report;
    const ids = r.issues.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['missing-primary', 'missing-bg', 'missing-text']));
    expect(r.counts.error).toBeGreaterThan(0);
  });

  it('includes messaging-driven audit issues when no messaging row exists', async () => {
    state.brandingProfiles.push({
      id: 1,
      clientId: 1,
      name: 'OK',
      isDefault: true,
      primaryColor: '#111111',
      backgroundColor: '#ffffff',
      textColor: '#000000',
      buttonStyle: null,
    });
    const { handleBrandingAudit } = await importModule();
    const res = await handleBrandingAudit({ clientId: 1 }, { profileId: 1 });
    expect('report' in res).toBe(true);
    const r = (res as { report: { issues: Array<{ id: string }> } }).report;
    expect(r.issues.map((i) => i.id)).toContain('no-messaging');
  });

  it('hydrates messaging from the matching row and drops the "no messaging" warning', async () => {
    state.brandingProfiles.push({
      id: 1,
      clientId: 1,
      name: 'OK',
      isDefault: true,
      primaryColor: '#111111',
      backgroundColor: '#ffffff',
      textColor: '#000000',
      buttonStyle: null,
    });
    state.brandingMessaging.push({
      id: 99,
      clientId: 1,
      brandingProfileId: 1,
      companyName: 'Acme',
      tagline: 'We sell anvils',
      valueProposition: 'Premium iron',
      elevatorPitch: 'Anvils for the modern roadrunner.',
      keyDifferentiators: ['durable', 'heavy'],
    });
    const { handleBrandingAudit } = await importModule();
    const res = await handleBrandingAudit({ clientId: 1 }, { profileId: 1 });
    expect('report' in res).toBe(true);
    const r = (res as { report: { issues: Array<{ id: string }> } }).report;
    expect(r.issues.map((i) => i.id)).not.toContain('no-messaging');
  });

  it('refuses to audit another tenant\'s profile', async () => {
    state.brandingProfiles.push({ id: 1, clientId: 2, name: 'Other', isDefault: true });
    const { handleBrandingAudit } = await importModule();
    const res = await handleBrandingAudit({ clientId: 1 }, { profileId: 1 });
    expect(res).toEqual({ error: 'Profile 1 not found for this client.' });
  });
});

// ---------------------------------------------------------------------------
// re-exports + handleBrandingCheckContrast pass-through
// ---------------------------------------------------------------------------

describe('module re-exports', () => {
  it('re-exports brandingToolSchemas with all five tool schemas', async () => {
    const { brandingToolSchemas } = await importModule();
    expect(Object.keys(brandingToolSchemas).sort()).toEqual(
      [
        'branding_audit',
        'branding_check_contrast',
        'branding_get_messaging',
        'branding_get_profile',
        'branding_list_profiles',
      ].sort(),
    );
  });

  it('re-exports handleBrandingCheckContrast as a pure function', async () => {
    const { handleBrandingCheckContrast } = await importModule();
    const res = handleBrandingCheckContrast(
      { clientId: 1 },
      { foreground: '#000000', background: '#ffffff' },
    );
    expect(res.ratio).toBeGreaterThan(15);
    expect(res.passesAA).toBe(true);
    expect(res.passesAAA).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// registerBrandingTools
// ---------------------------------------------------------------------------

describe('registerBrandingTools', () => {
  it('registers exactly the five branding tools on the server', async () => {
    const { registerBrandingTools } = await importModule();
    const calls: Array<{ name: string; description: string; schema: unknown }> = [];
    const handlers: Record<string, (input: unknown) => Promise<unknown>> = {};
    const server = {
      tool(
        name: string,
        description: string,
        inputSchema: unknown,
        handler: (input: unknown) => Promise<unknown>,
      ) {
        calls.push({ name, description, schema: inputSchema });
        handlers[name] = handler;
      },
    };
    registerBrandingTools(server, () => ({ clientId: 1 }));
    const names = calls.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'branding_audit',
        'branding_check_contrast',
        'branding_get_messaging',
        'branding_get_profile',
        'branding_list_profiles',
      ].sort(),
    );
    // Every registration carries the schema description + inputSchema.
    for (const c of calls) {
      expect(typeof c.description).toBe('string');
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.schema).toBeTruthy();
    }
  });

  it('wired handlers resolve ctx via getCtx and call into the DB-backed handler', async () => {
    state.brandingProfiles.push({
      id: 1,
      clientId: 7,
      name: 'Tenant 7',
      isDefault: true,
      primaryColor: '#abc',
      accentColor: '#def',
      logoUrl: null,
    });
    const { registerBrandingTools } = await importModule();
    const handlers: Record<string, (input: unknown) => Promise<unknown>> = {};
    const server = {
      tool(
        name: string,
        _description: string,
        _inputSchema: unknown,
        handler: (input: unknown) => Promise<unknown>,
      ) {
        handlers[name] = handler;
      },
    };
    let ctxRequested = 0;
    registerBrandingTools(server, () => {
      ctxRequested += 1;
      return { clientId: 7 };
    });

    const list = (await handlers.branding_list_profiles({})) as {
      profiles: Array<{ id: number; name: string }>;
    };
    expect(list.profiles).toHaveLength(1);
    expect(list.profiles[0].name).toBe('Tenant 7');
    expect(ctxRequested).toBe(1);
  });

  it('supports async getCtx', async () => {
    const { registerBrandingTools } = await importModule();
    const handlers: Record<string, (input: unknown) => Promise<unknown>> = {};
    const server = {
      tool(
        name: string,
        _description: string,
        _inputSchema: unknown,
        handler: (input: unknown) => Promise<unknown>,
      ) {
        handlers[name] = handler;
      },
    };
    registerBrandingTools(server, async () => {
      await Promise.resolve();
      return { clientId: 42 };
    });
    const res = (await handlers.branding_list_profiles({})) as { profiles: unknown[] };
    expect(res).toEqual({ profiles: [] });
  });

  it('wired branding_check_contrast handler runs the pure contrast computation', async () => {
    const { registerBrandingTools } = await importModule();
    const handlers: Record<string, (input: unknown) => Promise<unknown>> = {};
    const server = {
      tool(
        name: string,
        _description: string,
        _inputSchema: unknown,
        handler: (input: unknown) => Promise<unknown>,
      ) {
        handlers[name] = handler;
      },
    };
    registerBrandingTools(server, () => ({ clientId: 1 }));
    const res = (await handlers.branding_check_contrast({
      foreground: '#000',
      background: '#fff',
    })) as { ratio: number; passesAA: boolean };
    expect(res.passesAA).toBe(true);
    expect(res.ratio).toBeGreaterThan(15);
  });

  it('wired branding_audit handler returns an error envelope for missing profiles', async () => {
    const { registerBrandingTools } = await importModule();
    const handlers: Record<string, (input: unknown) => Promise<unknown>> = {};
    const server = {
      tool(
        name: string,
        _description: string,
        _inputSchema: unknown,
        handler: (input: unknown) => Promise<unknown>,
      ) {
        handlers[name] = handler;
      },
    };
    registerBrandingTools(server, () => ({ clientId: 1 }));
    const res = (await handlers.branding_audit({ profileId: 999 })) as { error?: string };
    expect(res.error).toMatch(/not found/i);
  });
});
