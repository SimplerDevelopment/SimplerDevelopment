// @vitest-environment node
/**
 * Unit tests for three small lib/mcp modules:
 *   - lib/mcp/expire-pending.ts   (TTL helper + drizzle update/execute)
 *   - lib/mcp/tools/index.ts      (registrar barrel — shape + order)
 *   - lib/mcp/tools/meta.ts       (registers `blocks-schema` resource + `whoami` tool)
 *
 * Strategy mirrors mcp-tools-bookings.test.ts: stub `db` and `drizzle-orm`,
 * use a fake McpServer that captures registered tools/resources, and exercise
 * pure helpers directly.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const dbState: {
  updateReturning: Row[];
  capturedUpdatePatch: Row | null;
  executeRows: Row[];
} = {
  updateReturning: [],
  capturedUpdatePatch: null,
  executeRows: [],
};

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn((patch: Row) => {
        dbState.capturedUpdatePatch = patch;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => dbState.updateReturning),
          })),
        };
      }),
    })),
    execute: vi.fn(async () => dbState.executeRows),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return new Proxy({
    mcpPendingChanges: make('id', 'status', 'createdAt', 'errorMessage'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ __tag: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ __tag: 'and', args })),
  inArray: vi.fn(() => ({ __tag: 'inArray' })),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ __tag: 'sql', args })),
    { raw: vi.fn((s: string) => ({ __tag: 'sql.raw', s })) },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') ||
    granted.includes(required) ||
    granted.includes(`${required.split(':')[0]}:*`),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/portal-auth', () => ({ hasServiceAccess: vi.fn(async () => true) }));

// Stub every per-domain registrar that tools/index.ts re-exports. Each gets a
// uniquely-named function so we can verify the barrel orders them correctly
// without pulling in the heavy schema/db/3rd-party dep graphs each one needs.
const stubRegistrar = (label: string) => {
  const fn = vi.fn(() => {});
  Object.defineProperty(fn, 'name', { value: label });
  return fn;
};
vi.mock('@/lib/mcp/tools/projects', () => ({ registerProjectsTools: stubRegistrar('registerProjectsTools') }));
vi.mock('@/lib/mcp/tools/kanban', () => ({ registerKanbanTools: stubRegistrar('registerKanbanTools') }));
vi.mock('@/lib/mcp/tools/sprints', () => ({ registerSprintsTools: stubRegistrar('registerSprintsTools') }));
vi.mock('@/lib/mcp/tools/tickets', () => ({ registerTicketsTools: stubRegistrar('registerTicketsTools') }));
vi.mock('@/lib/mcp/tools/crm', () => ({ registerCrmTools: stubRegistrar('registerCrmTools') }));
vi.mock('@/lib/mcp/tools/cms', () => ({ registerCmsTools: stubRegistrar('registerCmsTools') }));
vi.mock('@/lib/mcp/tools/email', () => ({ registerEmailTools: stubRegistrar('registerEmailTools') }));
vi.mock('@/lib/mcp/tools/pitch-decks', () => ({ registerPitchDecksTools: stubRegistrar('registerPitchDecksTools') }));
vi.mock('@/lib/mcp/tools/surveys', () => ({ registerSurveysTools: stubRegistrar('registerSurveysTools') }));
vi.mock('@/lib/mcp/tools/bookings', () => ({ registerBookingsTools: stubRegistrar('registerBookingsTools') }));
vi.mock('@/lib/mcp/tools/team', () => ({ registerTeamTools: stubRegistrar('registerTeamTools') }));
vi.mock('@/lib/mcp/tools/profile', () => ({ registerProfileTools: stubRegistrar('registerProfileTools') }));
vi.mock('@/lib/mcp/tools/integrations', () => ({ registerIntegrationsTools: stubRegistrar('registerIntegrationsTools') }));
vi.mock('@/lib/mcp/tools/billing', () => ({ registerBillingTools: stubRegistrar('registerBillingTools') }));
vi.mock('@/lib/mcp/tools/services', () => ({ registerServicesTools: stubRegistrar('registerServicesTools') }));
vi.mock('@/lib/mcp/tools/ai', () => ({ registerAiTools: stubRegistrar('registerAiTools') }));
vi.mock('@/lib/mcp/tools/automations', () => ({ registerAutomationsTools: stubRegistrar('registerAutomationsTools') }));
vi.mock('@/lib/mcp/tools/hosting', () => ({ registerHostingTools: stubRegistrar('registerHostingTools') }));
vi.mock('@/lib/mcp/tools/branding', () => ({ registerBrandingTools: stubRegistrar('registerBrandingTools') }));
vi.mock('@/lib/mcp/tools/storefront', () => ({ registerStorefrontTools: stubRegistrar('registerStorefrontTools') }));
vi.mock('@/lib/mcp/tools/brain', () => ({ registerBrainTools: stubRegistrar('registerBrainTools') }));
vi.mock('@/lib/mcp/tools/post-types', () => ({ registerPostTypesTools: stubRegistrar('registerPostTypesTools') }));
vi.mock('@/lib/mcp/tools/approvals', () => ({ registerApprovalsTools: stubRegistrar('registerApprovalsTools') }));
// NOTE: deliberately NOT mocking @/lib/mcp/tools/meta — we exercise the real
// implementation in the meta-specific describe block below.

// ── helpers ─────────────────────────────────────────────────────────────────

interface CapturedTool {
  name: string;
  config: { title?: string; description?: string; inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{ content: { text: string; type: string }[]; isError?: boolean }>;
}
interface CapturedResource {
  name: string;
  uri: string;
  config: { title?: string; description?: string; mimeType?: string };
  handler: (uri: { href: string }) => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const resources = new Map<string, CapturedResource>();
  const stub = {
    registerTool: vi.fn((name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
      tools.set(name, { name, config, handler });
      return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }),
    registerResource: vi.fn(
      (name: string, uri: string, config: CapturedResource['config'], handler: CapturedResource['handler']) => {
        resources.set(name, { name, uri, config, handler });
      },
    ),
  };
  return { stub, tools, resources };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 11,
    keyId: 1,
    scopes,
    client: { id: 42, company: 'Acme' } as PortalMcpContext['client'],
  };
}

beforeEach(() => {
  dbState.updateReturning = [];
  dbState.capturedUpdatePatch = null;
  dbState.executeRows = [];
});

// ──────────────────────────────────────────────────────────────────────────
// lib/mcp/expire-pending.ts
// ──────────────────────────────────────────────────────────────────────────

describe('expire-pending — getTtlDays', () => {
  const ORIGINAL = process.env.MCP_APPROVAL_TTL_DAYS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MCP_APPROVAL_TTL_DAYS;
    else process.env.MCP_APPROVAL_TTL_DAYS = ORIGINAL;
  });

  it('returns DEFAULT_TTL_DAYS (14) when env var unset', async () => {
    delete process.env.MCP_APPROVAL_TTL_DAYS;
    const { getTtlDays, DEFAULT_TTL_DAYS } = await import('@/lib/mcp/expire-pending');
    expect(DEFAULT_TTL_DAYS).toBe(14);
    expect(getTtlDays()).toBe(14);
  });

  it('parses a positive integer env override', async () => {
    process.env.MCP_APPROVAL_TTL_DAYS = '30';
    const { getTtlDays } = await import('@/lib/mcp/expire-pending');
    expect(getTtlDays()).toBe(30);
  });

  it('falls back to default on non-numeric env', async () => {
    process.env.MCP_APPROVAL_TTL_DAYS = 'not-a-number';
    const { getTtlDays } = await import('@/lib/mcp/expire-pending');
    expect(getTtlDays()).toBe(14);
  });

  it('falls back to default when env is zero/negative', async () => {
    process.env.MCP_APPROVAL_TTL_DAYS = '0';
    const { getTtlDays } = await import('@/lib/mcp/expire-pending');
    expect(getTtlDays()).toBe(14);
    process.env.MCP_APPROVAL_TTL_DAYS = '-7';
    expect(getTtlDays()).toBe(14);
  });
});

describe('expire-pending — expireStalePendings', () => {
  it('expires rows using default TTL and returns expiredCount/ttlDays/ttlSeconds', async () => {
    dbState.updateReturning = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const cutoffDate = new Date('2026-05-01T00:00:00Z');
    dbState.executeRows = [{ cutoff: cutoffDate }];
    delete process.env.MCP_APPROVAL_TTL_DAYS;
    const { expireStalePendings } = await import('@/lib/mcp/expire-pending');
    const result = await expireStalePendings();
    expect(result.expiredCount).toBe(3);
    expect(result.ttlDays).toBe(14);
    expect(result.ttlSeconds).toBe(14 * 24 * 60 * 60);
    expect(result.cutoff).toBe(cutoffDate.toISOString());
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.status).toBe('expired');
    expect(patch.errorMessage).toMatch(/Auto-expired after 14 days/);
  });

  it('honours ttlSeconds override (formats message in seconds)', async () => {
    dbState.updateReturning = [{ id: 10 }];
    dbState.executeRows = [{ cutoff: new Date('2026-05-15T00:00:00Z') }];
    const { expireStalePendings } = await import('@/lib/mcp/expire-pending');
    const result = await expireStalePendings({ ttlSeconds: 90 });
    expect(result.ttlSeconds).toBe(90);
    expect(result.expiredCount).toBe(1);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.errorMessage).toBe('Auto-expired after 90s without review');
  });

  it('honours ttlDays override', async () => {
    dbState.updateReturning = [];
    dbState.executeRows = [{ cutoff: new Date('2026-04-01T00:00:00Z') }];
    const { expireStalePendings } = await import('@/lib/mcp/expire-pending');
    const result = await expireStalePendings({ ttlDays: 7 });
    expect(result.ttlDays).toBe(7);
    expect(result.ttlSeconds).toBe(7 * 24 * 60 * 60);
    expect(result.expiredCount).toBe(0);
    expect(dbState.capturedUpdatePatch!.errorMessage).toMatch(/7 days/);
  });

  it('adds an inArray filter when ids supplied (and ignores empty ids array)', async () => {
    const drizzle = await import('drizzle-orm');
    (drizzle.inArray as ReturnType<typeof vi.fn>).mockClear();
    dbState.updateReturning = [{ id: 99 }];
    dbState.executeRows = [{ cutoff: new Date() }];
    const { expireStalePendings } = await import('@/lib/mcp/expire-pending');
    await expireStalePendings({ ids: [99, 100], ttlDays: 1 });
    expect(drizzle.inArray).toHaveBeenCalledTimes(1);

    (drizzle.inArray as ReturnType<typeof vi.fn>).mockClear();
    await expireStalePendings({ ids: [], ttlDays: 1 });
    expect(drizzle.inArray).not.toHaveBeenCalled();
  });

  it('falls back to a JS-computed cutoff when execute returns no row', async () => {
    dbState.updateReturning = [];
    dbState.executeRows = []; // no cutoff row
    const before = Date.now();
    const { expireStalePendings } = await import('@/lib/mcp/expire-pending');
    const result = await expireStalePendings({ ttlSeconds: 60 });
    const cutoffMs = new Date(result.cutoff).getTime();
    expect(cutoffMs).toBeLessThanOrEqual(before);
    // within sane bounds: approximately now - 60s
    expect(before - cutoffMs).toBeGreaterThanOrEqual(60_000 - 5_000);
  });

  it('handles a non-Date cutoff (raw timestamp) by coercing to ISO', async () => {
    dbState.updateReturning = [];
    // node-postgres can return ISO strings rather than Date instances.
    dbState.executeRows = [{ cutoff: '2026-01-15T08:00:00Z' }];
    const { expireStalePendings } = await import('@/lib/mcp/expire-pending');
    const result = await expireStalePendings({ ttlSeconds: 5 });
    // string fallback path → new Date(now - 5s).toISOString()
    expect(typeof result.cutoff).toBe('string');
    expect(() => new Date(result.cutoff)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// lib/mcp/tools/meta.ts
// ──────────────────────────────────────────────────────────────────────────

describe('tools/meta — registerMetaTools', () => {
  it('registers the blocks-schema resource with markdown mime + body', async () => {
    const { registerMetaTools } = await import('@/lib/mcp/tools/meta');
    const { stub, resources } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerMetaTools(stub as any, ctxFor(['*']));
    expect(resources.has('blocks-schema')).toBe(true);
    const r = resources.get('blocks-schema')!;
    expect(r.uri).toBe('blocks://schema');
    expect(r.config.mimeType).toBe('text/markdown');
    expect(r.config.title).toMatch(/block schema/i);
    const out = await r.handler({ href: 'blocks://schema' });
    expect(out.contents[0].uri).toBe('blocks://schema');
    expect(out.contents[0].mimeType).toBe('text/markdown');
    expect(typeof out.contents[0].text).toBe('string');
    expect(out.contents[0].text.length).toBeGreaterThan(10);
  });

  it('registers the unscoped whoami tool that echoes ctx fields', async () => {
    const { registerMetaTools } = await import('@/lib/mcp/tools/meta');
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['crm:read', 'cms:write']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerMetaTools(stub as any, ctx);
    expect(tools.has('whoami')).toBe(true);
    const t = tools.get('whoami')!;
    expect(t.config.title).toBeTruthy();
    expect(t.config.description).toMatch(/authenticated portal user/i);
    expect(t.config.inputSchema).toEqual({});
    const res = await t.handler({});
    const parsed = JSON.parse(res.content[0].text) as {
      userId: number;
      client: { id: number; company: string };
      scopes: string[];
    };
    expect(parsed.userId).toBe(11);
    expect(parsed.client).toEqual({ id: 42, company: 'Acme' });
    expect(parsed.scopes).toEqual(['crm:read', 'cms:write']);
  });

  it('registers whoami regardless of scopes (no gate)', async () => {
    const { registerMetaTools } = await import('@/lib/mcp/tools/meta');
    const { stub, tools, resources } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerMetaTools(stub as any, ctxFor([])); // no scopes at all
    expect(tools.has('whoami')).toBe(true);
    expect(resources.has('blocks-schema')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// lib/mcp/tools/index.ts
// ──────────────────────────────────────────────────────────────────────────

describe('tools/index — registrar barrel', () => {
  it('exports allToolRegistrars as a non-empty readonly array of functions', async () => {
    const mod = await import('@/lib/mcp/tools/index');
    expect(Array.isArray(mod.allToolRegistrars)).toBe(true);
    expect(mod.allToolRegistrars.length).toBeGreaterThan(15);
    for (const r of mod.allToolRegistrars) {
      expect(typeof r).toBe('function');
    }
  });

  it('lists registerMetaTools first so the unscoped tools win the order race', async () => {
    const mod = await import('@/lib/mcp/tools/index');
    expect(mod.allToolRegistrars[0]).toBe(mod.registerMetaTools);
  });

  it('re-exports every per-domain registrar by name', async () => {
    const mod = await import('@/lib/mcp/tools/index');
    const expected = [
      'registerProjectsTools',
      'registerKanbanTools',
      'registerSprintsTools',
      'registerTicketsTools',
      'registerCrmTools',
      'registerCmsTools',
      'registerEmailTools',
      'registerPitchDecksTools',
      'registerSurveysTools',
      'registerBookingsTools',
      'registerTeamTools',
      'registerProfileTools',
      'registerIntegrationsTools',
      'registerBillingTools',
      'registerServicesTools',
      'registerAiTools',
      'registerAutomationsTools',
      'registerHostingTools',
      'registerMetaTools',
      'registerBrandingTools',
      'registerStorefrontTools',
      'registerBrainTools',
      'registerPostTypesTools',
      'registerApprovalsTools',
    ];
    const m = mod as unknown as Record<string, unknown>;
    for (const name of expected) {
      expect(typeof m[name], `${name} should be a function`).toBe('function');
    }
  });

  it('includes every named export inside allToolRegistrars (no orphans)', async () => {
    const mod = await import('@/lib/mcp/tools/index');
    const exportedRegistrars = Object.entries(mod).filter(
      ([k, v]) => k.startsWith('register') && typeof v === 'function',
    );
    expect(exportedRegistrars.length).toBe(mod.allToolRegistrars.length);
    const inArrayRefs = new Set<unknown>(mod.allToolRegistrars);
    for (const [, fn] of exportedRegistrars) {
      expect(inArrayRefs.has(fn)).toBe(true);
    }
  });
});
