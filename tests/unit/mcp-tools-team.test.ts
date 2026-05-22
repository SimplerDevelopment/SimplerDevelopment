// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/team.ts.
 *
 * The module exports a single function — `registerTeamTools(server, ctx)` —
 * that registers team-management and client-self-service MCP tools, each
 * gated by a scope check (`team:read` / `team:write`).
 *
 * Strategy mirrors mcp-tools-bookings.test.ts: stub `db`, mock schema +
 * drizzle helpers, mock auth/service collaborators, and pass in a fake
 * McpServer that captures `{ name -> handler }` so each handler can be
 * invoked directly. Tests cover happy paths plus the scope-denial /
 * not-found / owner-gate / already-member branches.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const dbState: {
  insertQueue: Row[][];
  insertDefault: Row[];
  selectQueue: Row[][];
  selectDefault: Row[];
  updateReturning: Row[];
  capturedInsertValues: Row[];
  capturedUpdatePatch: Row | null;
  deleteCalls: number;
} = {
  insertQueue: [],
  insertDefault: [],
  selectQueue: [],
  selectDefault: [],
  updateReturning: [],
  capturedInsertValues: [],
  capturedUpdatePatch: null,
  deleteCalls: 0,
};

function makeChain(rows: Row[]) {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: Row[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((vals: Row) => {
        dbState.capturedInsertValues.push(vals);
        return {
          returning: vi.fn(async () => {
            if (dbState.insertQueue.length > 0) return dbState.insertQueue.shift()!;
            return dbState.insertDefault;
          }),
        };
      }),
    })),
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
      return makeChain(next);
    }),
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
    delete: vi.fn(() => {
      dbState.deleteCalls += 1;
      return {
        where: vi.fn(async () => undefined),
      };
    }),
  },
}));

// schema objects — opaque column-like refs are fine.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return {
    projects: make('id'),
    kanbanCards: make('id'),
    kanbanColumns: make('id'),
    kanbanLabels: make('id'),
    kanbanCardLabels: make('id'),
    kanbanCardChecklistItems: make('id'),
    kanbanCardAssignees: make('id'),
    kanbanCardWatchers: make('id'),
    kanbanCardDependencies: make('id'),
    supportTickets: make('id'),
    ticketMessages: make('id'),
    crmContacts: make('id'),
    crmCompanies: make('id'),
    crmDeals: make('id'),
    crmPipelines: make('id'),
    crmPipelineStages: make('id'),
    posts: make('id'),
    media: make('id'),
    clientWebsites: make('id'),
    emailLists: make('id'),
    emailCampaigns: make('id'),
    pitchDecks: make('id'),
    brandingProfiles: make('id'),
    emailSubscribers: make('id'),
    emailCampaignSends: make('id'),
    surveys: make('id'),
    surveyResponses: make('id'),
    bookingPages: make('id'),
    bookings: make('id'),
    sprints: make('id'),
    crmActivities: make('id'),
    categories: make('id'),
    tags: make('id'),
    postCategories: make('id'),
    postTags: make('id'),
    automationRules: make('id'),
    clientMembers: make('id', 'clientId', 'userId', 'role', 'createdAt', 'invitedBy'),
    users: make('id', 'name', 'email', 'password', 'role', 'active'),
    crmProposals: make('id'),
    crmContracts: make('id'),
    crmContractSigners: make('id'),
    invoices: make('id'),
    invoiceItems: make('id'),
    serviceRequests: make('id'),
    suggestedProjectRequests: make('id'),
    suggestedProjects: make('id'),
    services: make('id'),
    aiConversations: make('id'),
    aiMessages: make('id'),
    kanbanCardComments: make('id'),
    kanbanCardTimeLogs: make('id'),
    kanbanCardFiles: make('id'),
    kanbanCardArtifacts: make('id'),
    crmDealArtifacts: make('id'),
    siteNavigation: make('id'),
    postRevisions: make('id'),
    blockTemplates: make('id'),
    blockTemplateUsages: make('id'),
    emailTemplates: make('id'),
    emailSegments: make('id'),
    giftCertificates: make('id'),
    crmCustomFields: make('id'),
    crmCustomFieldValues: make('id'),
    crmSavedViews: make('id'),
    crmScoringRules: make('id'),
    websiteDomains: make('id'),
    websiteEnvironments: make('id'),
    websiteEnvVars: make('id'),
    clients: make('id', 'company', 'phone', 'website', 'address', 'notes', 'updatedAt'),
    aiCreditBalances: make('id'),
    aiCreditLedger: make('id'),
    hostedSites: make('id'),
    googleWorkspaceUserConnections: make('id'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') ||
    granted.includes(required) ||
    granted.includes(`${required.split(':')[0]}:*`),
}));

const hasServiceAccessMock = vi.fn(async () => true);
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: (...args: unknown[]) => hasServiceAccessMock(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/pm-activity', () => ({ logCardActivity: vi.fn() }));
vi.mock('@/lib/s3/upload', () => ({ uploadToS3: vi.fn() }));
vi.mock('@/lib/html-embed-clean', () => ({ cleanEmbedHtml: vi.fn() }));
vi.mock('@/lib/html-asset-import', () => ({ importHtmlAssets: vi.fn() }));
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: vi.fn(),
  resend: { emails: { send: vi.fn() } },
  buildCampaignHtml: vi.fn(),
  buildUnsubscribeUrl: vi.fn(),
  generateUnsubscribeToken: vi.fn(),
}));
vi.mock('@/lib/email/campaign-send', () => ({ executeCampaignSend: vi.fn() }));
vi.mock('@/lib/google/oauth', () => ({ revoke: vi.fn() }));
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: vi.fn(),
}));
vi.mock('@/lib/mcp/pending-changes', () => ({ stageOrApply: vi.fn() }));
vi.mock('@/lib/mcp/blocks-schema', () => ({ BLOCKS_SCHEMA_REFERENCE: {} }));
vi.mock('@/lib/mcp/projections', () => ({
  postProjection: {},
  deckProjection: {},
  campaignProjection: {},
}));

vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed-password') }));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerTeamTools } from '@/lib/mcp/tools/team';

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

function ctxFor(scopes: string[], opts: { userId?: number; clientUserId?: number; clientId?: number } = {}): PortalMcpContext {
  return {
    userId: opts.userId ?? 11,
    keyId: 1,
    scopes,
    client: { id: opts.clientId ?? 1, userId: opts.clientUserId ?? 11, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['*'], ctxOpts?: Parameters<typeof ctxFor>[1]) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTeamTools(stub as any, ctxFor(scopes, ctxOpts));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.insertQueue = [];
  dbState.insertDefault = [];
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.updateReturning = [];
  dbState.capturedInsertValues = [];
  dbState.capturedUpdatePatch = null;
  dbState.deleteCalls = 0;
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

describe('registerTeamTools — tool registration', () => {
  it('registers the canonical team + client tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'team_list_members',
      'team_update_role',
      'team_remove_member',
      'team_invite',
      'client_get',
      'client_update',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only read tools when scopes=team:read', () => {
    const tools = registerAll(['team:read']);
    expect(tools.has('team_list_members')).toBe(true);
    expect(tools.has('client_get')).toBe(true);
    expect(tools.has('team_update_role')).toBe(false);
    expect(tools.has('team_remove_member')).toBe(false);
    expect(tools.has('team_invite')).toBe(false);
    expect(tools.has('client_update')).toBe(false);
  });

  it('registers only write tools when scopes=team:write', () => {
    const tools = registerAll(['team:write']);
    expect(tools.has('team_update_role')).toBe(true);
    expect(tools.has('team_remove_member')).toBe(true);
    expect(tools.has('team_invite')).toBe(true);
    expect(tools.has('client_update')).toBe(true);
    expect(tools.has('team_list_members')).toBe(false);
    expect(tools.has('client_get')).toBe(false);
  });

  it('registers nothing when ctx has no team scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool has a title, description, and inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} should have a title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} description`).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── team_list_members ──────────────────────────────────────────────────────

describe('team_list_members', () => {
  it('returns rows when scope granted', async () => {
    dbState.selectDefault = [
      { memberId: 1, role: 'owner', userId: 11, name: 'Alice', email: 'alice@example.com', joinedAt: new Date() },
    ];
    const tools = registerAll();
    const res = await tools.get('team_list_members')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Alice');
  });

  it('denies when ctx lacks team:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTeamTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('team_list_members')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── team_update_role ───────────────────────────────────────────────────────

describe('team_update_role', () => {
  it('updates a member role', async () => {
    dbState.selectDefault = [{ id: 5 }];
    dbState.updateReturning = [{ id: 5, role: 'admin' }];
    const tools = registerAll();
    const res = await tools.get('team_update_role')!.handler({ memberId: 5, role: 'admin' });
    const out = parseJson(res) as Row;
    expect(out.role).toBe('admin');
    expect(dbState.capturedUpdatePatch).toEqual({ role: 'admin' });
  });

  it('returns error when member not found', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('team_update_role')!.handler({ memberId: 999, role: 'admin' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when scope missing at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTeamTools(stub as any, ctx);
    ctx.scopes = ['team:read'];
    const res = await tools.get('team_update_role')!.handler({ memberId: 1, role: 'member' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── team_remove_member ─────────────────────────────────────────────────────

describe('team_remove_member', () => {
  it('removes an existing member', async () => {
    dbState.selectDefault = [{ id: 7 }];
    const tools = registerAll();
    const res = await tools.get('team_remove_member')!.handler({ memberId: 7 });
    const out = parseJson(res) as { success: boolean; memberId: number };
    expect(out.success).toBe(true);
    expect(out.memberId).toBe(7);
    expect(dbState.deleteCalls).toBe(1);
  });

  it('returns error when member not found', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('team_remove_member')!.handler({ memberId: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
    expect(dbState.deleteCalls).toBe(0);
  });

  it('denies when scope missing at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTeamTools(stub as any, ctx);
    ctx.scopes = ['team:read'];
    const res = await tools.get('team_remove_member')!.handler({ memberId: 1 });
    expect(res.isError).toBe(true);
  });
});

// ── team_invite ────────────────────────────────────────────────────────────

describe('team_invite', () => {
  it('creates a new user (returns tempPassword) when email is unknown — caller is client owner via ctx', async () => {
    // ctx.userId === ctx.client.userId, so owner check passes without DB hit.
    // selectQueue: [users-lookup (empty)], [alreadyMember-check (empty)]
    dbState.selectQueue = [
      [], // user lookup — no existing user
      [], // already-member check — not a member
    ];
    dbState.insertQueue = [
      [{ id: 42, name: 'New Person', email: 'new@example.com' }], // users insert
      [{ id: 100, clientId: 1, userId: 42, role: 'member' }], // clientMembers insert
    ];
    const tools = registerAll(['*'], { userId: 11, clientUserId: 11 });
    const res = await tools.get('team_invite')!.handler({ name: '  New Person  ', email: '  new@example.com  ' });
    const out = parseJson(res) as { member: Row; user: Row; isNewUser: boolean; tempPassword: string | null };
    expect(out.isNewUser).toBe(true);
    expect(typeof out.tempPassword).toBe('string');
    expect((out.tempPassword as string).length).toBeGreaterThan(0);
    expect(out.user.email).toBe('new@example.com');
    // Two inserts: users + clientMembers
    expect(dbState.capturedInsertValues).toHaveLength(2);
    const userInsert = dbState.capturedInsertValues[0]!;
    expect(userInsert.name).toBe('New Person');
    expect(userInsert.email).toBe('new@example.com');
    expect(userInsert.password).toBe('hashed-password');
    expect(userInsert.role).toBe('client');
    expect(userInsert.active).toBe(true);
    const memberInsert = dbState.capturedInsertValues[1]!;
    expect(memberInsert.clientId).toBe(1);
    expect(memberInsert.userId).toBe(42);
    expect(memberInsert.role).toBe('member');
    expect(memberInsert.invitedBy).toBe(11);
  });

  it('reuses an existing user when email matches (no tempPassword)', async () => {
    dbState.selectQueue = [
      [{ id: 50, name: 'Existing', email: 'exists@example.com' }], // user found
      [], // not already member
    ];
    dbState.insertQueue = [
      [{ id: 101, clientId: 1, userId: 50, role: 'member' }], // clientMembers insert only
    ];
    const tools = registerAll();
    const res = await tools.get('team_invite')!.handler({ name: 'Existing', email: 'exists@example.com' });
    const out = parseJson(res) as { isNewUser: boolean; tempPassword: string | null };
    expect(out.isNewUser).toBe(false);
    expect(out.tempPassword).toBeNull();
    // Only one insert — the clientMembers row.
    expect(dbState.capturedInsertValues).toHaveLength(1);
    expect(dbState.capturedInsertValues[0]!.userId).toBe(50);
  });

  it('returns error when user is already a member', async () => {
    dbState.selectQueue = [
      [{ id: 50, name: 'Existing', email: 'exists@example.com' }], // user found
      [{ id: 200 }], // already member!
    ];
    const tools = registerAll();
    const res = await tools.get('team_invite')!.handler({ name: 'Existing', email: 'exists@example.com' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/already a team member/i);
    expect(dbState.capturedInsertValues).toHaveLength(0);
  });

  it('allows non-owner caller when they have an owner role in client_members', async () => {
    // ctx.userId !== ctx.client.userId, but the ownerMember lookup returns a row.
    dbState.selectQueue = [
      [{ id: 99 }], // ownerMember check — passes
      [], // user lookup — new user
      [], // already-member check
    ];
    dbState.insertQueue = [
      [{ id: 60, name: 'X', email: 'x@example.com' }],
      [{ id: 102, clientId: 1, userId: 60, role: 'member' }],
    ];
    const tools = registerAll(['*'], { userId: 22, clientUserId: 11 });
    const res = await tools.get('team_invite')!.handler({ name: 'X', email: 'x@example.com' });
    const out = parseJson(res) as { isNewUser: boolean };
    expect(out.isNewUser).toBe(true);
  });

  it('rejects non-owner caller when they have no owner role in client_members', async () => {
    dbState.selectQueue = [
      [], // ownerMember check — empty → forbidden
    ];
    const tools = registerAll(['*'], { userId: 22, clientUserId: 11 });
    const res = await tools.get('team_invite')!.handler({ name: 'X', email: 'x@example.com' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/only the account owner/i);
    expect(dbState.capturedInsertValues).toHaveLength(0);
  });

  it('denies when scope missing at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTeamTools(stub as any, ctx);
    ctx.scopes = ['team:read'];
    const res = await tools.get('team_invite')!.handler({ name: 'X', email: 'x@example.com' });
    expect(res.isError).toBe(true);
  });
});

// ── client_get ─────────────────────────────────────────────────────────────

describe('client_get', () => {
  it('returns the client row when found', async () => {
    dbState.selectDefault = [{ id: 1, company: 'Acme', phone: '555-1212' }];
    const tools = registerAll();
    const res = await tools.get('client_get')!.handler({});
    const out = parseJson(res) as Row;
    expect(out.company).toBe('Acme');
  });

  it('returns an error envelope when no client row exists', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('client_get')!.handler({});
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when scope missing at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTeamTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('client_get')!.handler({});
    expect(res.isError).toBe(true);
  });
});

// ── client_update ──────────────────────────────────────────────────────────

describe('client_update', () => {
  it('updates only the provided fields and stamps updatedAt', async () => {
    dbState.updateReturning = [{ id: 1, company: 'New Co', phone: '555-9999' }];
    const tools = registerAll();
    const res = await tools.get('client_update')!.handler({
      company: 'New Co',
      phone: '555-9999',
      website: undefined,
      address: undefined,
      notes: undefined,
    });
    const out = parseJson(res) as Row;
    expect(out.company).toBe('New Co');
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.company).toBe('New Co');
    expect(patch.phone).toBe('555-9999');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect('website' in patch).toBe(false);
    expect('address' in patch).toBe(false);
    expect('notes' in patch).toBe(false);
  });

  it('allows explicit null to clear a nullable field', async () => {
    dbState.updateReturning = [{ id: 1, phone: null }];
    const tools = registerAll();
    await tools.get('client_update')!.handler({ phone: null });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.phone).toBeNull();
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('with no patch fields still stamps updatedAt', async () => {
    dbState.updateReturning = [{ id: 1 }];
    const tools = registerAll();
    await tools.get('client_update')!.handler({});
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(patch)).toEqual(['updatedAt']);
  });

  it('denies when scope missing at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTeamTools(stub as any, ctx);
    ctx.scopes = ['team:read'];
    const res = await tools.get('client_update')!.handler({ company: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
