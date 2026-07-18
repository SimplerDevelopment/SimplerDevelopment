// @vitest-environment node
/**
 * Unit tests for lib/branding/mcp-sdk-adapter.ts.
 *
 * The adapter exports `registerBrandingToolsOnSdk(server, ctx)` which
 * registers branding tools on an MCP server. Each tool closes over the ctx,
 * clientId, and uses handlers from `./mcp-tools` or `@/lib/db` directly.
 *
 * Strategy: mock @/lib/db + every collaborator with vi.mock, build a fake
 * McpServer that captures `{ name -> handler }` pairs, then invoke each
 * handler with sample args and assert on the returned shape. We cover both
 * happy paths and scope-denied branches.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/branding/mcp-tools', () => ({
  handleBrandingListProfiles: vi.fn(async () => [{ id: 1, name: 'Default', isDefault: true }]),
  handleBrandingGetProfile: vi.fn(async (_ctx: unknown, args: { profileId?: number }) => ({
    id: args.profileId ?? 1, name: 'Default', primaryColor: '#000',
  })),
  handleBrandingGetMessaging: vi.fn(async (_ctx: unknown, args: { profileId?: number }) => ({
    id: 5, brandingProfileId: args.profileId ?? null, tagline: 'Hi',
  })),
  handleBrandingAudit: vi.fn(async (_ctx: unknown, args: { profileId: number }) => ({
    profileId: args.profileId, issues: [], warnings: [],
  })),
  handleBrandingCheckContrast: vi.fn((_ctx: unknown, args: { foreground: string; background: string }) => ({
    foreground: args.foreground, background: args.background, ratio: 4.6, aaPasses: true,
  })),
}));

// db mock: handles update().set().where(), insert().values().returning(),
// select().from().where().limit(), delete().where(), etc.
type QueryResult = unknown[];
const dbState: {
  insertReturning: QueryResult;
  updateReturning: QueryResult;
  selectQueue: QueryResult[];
} = {
  insertReturning: [{ id: 100, name: 'NewProfile', isDefault: false }],
  updateReturning: [{ id: 1, name: 'Updated', isDefault: false }],
  selectQueue: [],
};

function makeChain(rows: QueryResult) {
  const chain: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => dbState.insertReturning),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn((..._args: unknown[]) => ({
          returning: vi.fn(async () => dbState.updateReturning),
          // also allow await-able (for the "unset other defaults" branch with no returning())
          then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(undefined).then(onFulfilled),
        })),
      })),
    })),
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : [];
      return makeChain(next);
    }),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  },
}));

// Schema objects don't need real content.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  return {
    brandingProfiles: {
      id: col('id'), clientId: col('clientId'), name: col('name'), isDefault: col('isDefault'),
      primaryColor: col('primaryColor'), secondaryColor: col('secondaryColor'),
      accentColor: col('accentColor'), backgroundColor: col('backgroundColor'),
      textColor: col('textColor'), headingFont: col('headingFont'), bodyFont: col('bodyFont'),
      logoUrl: col('logoUrl'), logoText: col('logoText'), logoSquareUrl: col('logoSquareUrl'),
      logoRectUrl: col('logoRectUrl'), logoIconUrl: col('logoIconUrl'), logoAlt: col('logoAlt'),
      updatedAt: col('updatedAt'),
    },
    brandingMessaging: {
      id: col('id'), clientId: col('clientId'), brandingProfileId: col('brandingProfileId'),
      updatedAt: col('updatedAt'),
      $inferInsert: {} as Record<string, unknown>,
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerBrandingToolsOnSdk } from '@/lib/branding/mcp-sdk-adapter';

interface CapturedTool {
  name: string;
  config: { title?: string; description?: string; inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{ content: { text: string; type: string }[]; isError?: boolean }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const stub = {
    registerTool: vi.fn((name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
      tools.set(name, { name, config, handler });
      return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }),
    registerResource: vi.fn(),
  };
  return { stub, tools };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 11,
    keyId: 1,
    scopes,
    client: { id: 1, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['*']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerBrandingToolsOnSdk(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('registerBrandingToolsOnSdk — tool registration', () => {
  beforeEach(() => {
    dbState.insertReturning = [{ id: 100, name: 'NewProfile', isDefault: false }];
    dbState.updateReturning = [{ id: 1, name: 'Updated', isDefault: false }];
    dbState.selectQueue = [];
  });

  it('registers the read-only tools when scopes=branding:read', () => {
    const tools = registerAll(['branding:read']);
    expect(tools.has('branding_list_profiles')).toBe(true);
    expect(tools.has('branding_get_profile')).toBe(true);
    expect(tools.has('branding_get_messaging')).toBe(true);
    expect(tools.has('branding_audit')).toBe(true);
    expect(tools.has('branding_check_contrast')).toBe(true);
    // No writes
    expect(tools.has('branding_create_profile')).toBe(false);
    expect(tools.has('branding_update_profile')).toBe(false);
    expect(tools.has('branding_delete_profile')).toBe(false);
    expect(tools.has('branding_update_messaging')).toBe(false);
  });

  it('registers write tools when ctx has branding:write', () => {
    const tools = registerAll(['branding:read', 'branding:write']);
    expect(tools.has('branding_create_profile')).toBe(true);
    expect(tools.has('branding_update_profile')).toBe(true);
    expect(tools.has('branding_delete_profile')).toBe(true);
    expect(tools.has('branding_update_messaging')).toBe(true);
  });

  it('registers all tools with scopes=*', () => {
    const tools = registerAll(['*']);
    // 5 reads + 4 writes
    expect(tools.size).toBe(9);
  });

  it('registers nothing when ctx has unrelated scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool has a non-empty title + description', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} should have a title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} description`).toBeGreaterThan(5);
    }
  });

  it('every tool registers an inputSchema (even if empty)', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── read-only tools ─────────────────────────────────────────────────────────

describe('branding_list_profiles', () => {
  it('returns profiles via the read handler', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_list_profiles')!.handler({});
    const out = parseJson(res) as Array<{ id: number; name: string }>;
    expect(out[0].id).toBe(1);
    expect(out[0].name).toBe('Default');
  });
});

describe('branding_get_profile', () => {
  it('returns the profile with explicit id', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_get_profile')!.handler({ profileId: 7 });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(7);
  });

  it('falls back to default profile when no id passed', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_get_profile')!.handler({});
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('branding_get_messaging', () => {
  it('returns messaging row', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_get_messaging')!.handler({ profileId: 3 });
    const out = parseJson(res) as { id: number; brandingProfileId: number | null };
    expect(out.id).toBe(5);
    expect(out.brandingProfileId).toBe(3);
  });
});

describe('branding_audit', () => {
  it('returns audit result', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_audit')!.handler({ profileId: 10 });
    const out = parseJson(res) as { profileId: number; issues: unknown[] };
    expect(out.profileId).toBe(10);
    expect(Array.isArray(out.issues)).toBe(true);
  });
});

describe('branding_check_contrast', () => {
  it('returns contrast ratio computation', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_check_contrast')!.handler({ foreground: '#000', background: '#fff' });
    const out = parseJson(res) as { ratio: number; aaPasses: boolean };
    expect(out.ratio).toBe(4.6);
    expect(out.aaPasses).toBe(true);
  });
});

// ── scope gating on read tools ──────────────────────────────────────────────
// When a user's scopes contain branding:read at registration but later don't
// satisfy the inner `gate()` check (e.g. mismatched broader scope), the
// handler returns a denied payload. Because hasScope() uses the same scope
// list at both points, the gate denies only in unusual race scenarios — but
// the registerTool truthy-and-short-circuit means tools are skipped entirely
// without that scope. Test the negative registration path here:
describe('read-tool gating', () => {
  it('does not register read tools when no branding:read scope', () => {
    const tools = registerAll(['branding:write']);
    expect(tools.has('branding_list_profiles')).toBe(false);
    expect(tools.has('branding_get_profile')).toBe(false);
    expect(tools.has('branding_get_messaging')).toBe(false);
    expect(tools.has('branding_audit')).toBe(false);
    expect(tools.has('branding_check_contrast')).toBe(false);
  });
});

// ── write tools ─────────────────────────────────────────────────────────────

describe('branding_create_profile', () => {
  it('inserts a new profile with defaults', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_create_profile')!.handler({ name: 'Brand A' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(100);
  });

  it('unsets other defaults when isDefault=true', async () => {
    const { db } = await import('@/lib/db');
    (db.update as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('branding_create_profile')!.handler({
      name: 'Brand B', isDefault: true,
      primaryColor: '#abcdef', logoUrl: 'https://example.com/logo.png',
    });
    // Update was called to unset existing defaults
    expect((db.update as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('accepts all optional color/font/logo fields', async () => {
    const tools = registerAll();
    const res = await tools.get('branding_create_profile')!.handler({
      name: 'Full',
      primaryColor: '#111', secondaryColor: '#222', accentColor: '#333',
      backgroundColor: '#444', textColor: '#555',
      headingFont: 'Inter', bodyFont: 'Sans',
      logoUrl: 'u', logoText: 't', logoSquareUrl: 's', logoRectUrl: 'r', logoIconUrl: 'i', logoAlt: 'a',
    });
    expect(parseJson(res)).toHaveProperty('id');
  });
});

describe('branding_update_profile', () => {
  it('returns "Profile not found" when row does not exist', async () => {
    dbState.selectQueue = [[]]; // existing lookup empty
    const tools = registerAll();
    const res = await tools.get('branding_update_profile')!.handler({ profileId: 999, name: 'X' });
    const out = parseJson(res) as { error?: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('updates an existing profile', async () => {
    dbState.selectQueue = [[{ id: 4, isDefault: false }]];
    dbState.updateReturning = [{ id: 4, name: 'Renamed', isDefault: false }];
    const tools = registerAll();
    const res = await tools.get('branding_update_profile')!.handler({ profileId: 4, name: 'Renamed' });
    const out = parseJson(res) as { id: number; name: string };
    expect(out.id).toBe(4);
    expect(out.name).toBe('Renamed');
  });

  it('promotes profile to default and unsets siblings', async () => {
    dbState.selectQueue = [[{ id: 4, isDefault: false }]];
    dbState.updateReturning = [{ id: 4, name: 'Now Default', isDefault: true }];
    const { db } = await import('@/lib/db');
    (db.update as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('branding_update_profile')!.handler({ profileId: 4, isDefault: true });
    // At least two update calls: one for unset siblings, one for the patch
    expect((db.update as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not unset siblings when row is already default', async () => {
    dbState.selectQueue = [[{ id: 4, isDefault: true }]];
    dbState.updateReturning = [{ id: 4, name: 'Still Default', isDefault: true }];
    const { db } = await import('@/lib/db');
    (db.update as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('branding_update_profile')!.handler({ profileId: 4, isDefault: true });
    // Only the patch update — no sibling-unset
    expect((db.update as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('only patches fields that are defined', async () => {
    dbState.selectQueue = [[{ id: 4, isDefault: false }]];
    dbState.updateReturning = [{ id: 4, name: 'X', isDefault: false }];
    const tools = registerAll();
    const res = await tools.get('branding_update_profile')!.handler({
      profileId: 4, primaryColor: '#abc', headingFont: null, logoUrl: null,
    });
    expect((parseJson(res) as { id: number }).id).toBe(4);
  });

  it('supports the isDefault=false explicit toggle', async () => {
    dbState.selectQueue = [[{ id: 4, isDefault: true }]];
    dbState.updateReturning = [{ id: 4, name: 'No Longer Default', isDefault: false }];
    const tools = registerAll();
    const res = await tools.get('branding_update_profile')!.handler({ profileId: 4, isDefault: false });
    expect((parseJson(res) as { isDefault: boolean }).isDefault).toBe(false);
  });
});

describe('branding_delete_profile', () => {
  it('returns not-found when profile missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('branding_delete_profile')!.handler({ profileId: 999 });
    const out = parseJson(res) as { error?: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('deletes an existing profile and returns success envelope', async () => {
    dbState.selectQueue = [[{ id: 4 }]];
    const tools = registerAll();
    const res = await tools.get('branding_delete_profile')!.handler({ profileId: 4 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out.success).toBe(true);
    expect(out.id).toBe(4);
  });
});

describe('branding_update_messaging', () => {
  it('updates an existing messaging row when found', async () => {
    dbState.selectQueue = [[{ id: 9 }]];
    dbState.updateReturning = [{ id: 9, tagline: 'New tagline' }];
    const tools = registerAll();
    const res = await tools.get('branding_update_messaging')!.handler({ tagline: 'New tagline' });
    const out = parseJson(res) as { id: number; tagline: string };
    expect(out.id).toBe(9);
    expect(out.tagline).toBe('New tagline');
  });

  it('inserts a new messaging row when none exists', async () => {
    dbState.selectQueue = [[]]; // existing lookup empty
    dbState.insertReturning = [{ id: 50, tagline: 'Fresh' }];
    const tools = registerAll();
    const res = await tools.get('branding_update_messaging')!.handler({ tagline: 'Fresh' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(50);
  });

  it('scopes messaging to profileId when provided', async () => {
    dbState.selectQueue = [[{ id: 9 }]];
    dbState.updateReturning = [{ id: 9, tagline: 't' }];
    const tools = registerAll();
    const res = await tools.get('branding_update_messaging')!.handler({
      profileId: 2, tagline: 't', companyName: 'Acme', toneOfVoice: 'friendly',
      keyDifferentiators: ['fast', 'smart'],
    });
    expect((parseJson(res) as { id: number }).id).toBe(9);
  });

  it('inserts with profileId=null when omitted', async () => {
    dbState.selectQueue = [[]];
    dbState.insertReturning = [{ id: 51, brandingProfileId: null }];
    const tools = registerAll();
    const res = await tools.get('branding_update_messaging')!.handler({
      missionStatement: 'mission', valueProposition: 'vp', elevatorPitch: 'ep',
      visionStatement: 'vision', boilerplate: 'bp', brandPersonality: 'bp',
      writingStyle: 'casual', targetAudience: 'devs', industry: 'tech',
    });
    expect((parseJson(res) as { id: number }).id).toBe(51);
  });

  it('ignores undefined fields in the patch', async () => {
    dbState.selectQueue = [[{ id: 9 }]];
    dbState.updateReturning = [{ id: 9 }];
    const tools = registerAll();
    const res = await tools.get('branding_update_messaging')!.handler({
      tagline: undefined, companyName: 'Set',
    });
    expect((parseJson(res) as { id: number }).id).toBe(9);
  });
});

// ── write-tool gating ───────────────────────────────────────────────────────

describe('write-tool gating', () => {
  it('does not register write tools without branding:write', () => {
    const tools = registerAll(['branding:read']);
    expect(tools.has('branding_create_profile')).toBe(false);
    expect(tools.has('branding_update_profile')).toBe(false);
    expect(tools.has('branding_delete_profile')).toBe(false);
    expect(tools.has('branding_update_messaging')).toBe(false);
  });
});
