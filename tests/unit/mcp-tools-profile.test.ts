// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/profile.ts.
 *
 * The module exports `registerProfileTools(server, ctx)` which registers two
 * MCP tools — `profile_get` and `profile_update` — each gated by a scope check
 * (`profile:read` / `profile:write`).
 *
 * Pattern mirrors tests/unit/mcp-tools-bookings.test.ts: stub `db`, mock
 * schema + drizzle helpers, mock auth/service collaborators, and use a fake
 * McpServer that captures `{ name -> handler }` so each handler can be
 * invoked directly.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const dbState: {
  selectQueue: Row[][];
  selectDefault: Row[];
  capturedUpdatePatches: Row[];
  capturedUpdateTables: unknown[];
} = {
  selectQueue: [],
  selectDefault: [],
  capturedUpdatePatches: [],
  capturedUpdateTables: [],
};

function makeChain(rows: Row[]) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (onFulfilled: (v: Row[]) => unknown) =>
            Promise.resolve(rows).then(onFulfilled);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const next =
        dbState.selectQueue.length > 0
          ? dbState.selectQueue.shift()!
          : dbState.selectDefault;
      return makeChain(next);
    }),
    update: vi.fn((table: unknown) => {
      dbState.capturedUpdateTables.push(table);
      return {
        set: vi.fn((patch: Row) => {
          dbState.capturedUpdatePatches.push(patch);
          return {
            where: vi.fn(async () => undefined),
          };
        }),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(async () => []) })),
    })),
  },
}));

// schema objects — opaque column-like refs (with `name` so we can identify
// which table got passed into `db.update(...)`).
vi.mock('@/lib/db/schema', () => {
  const make = (name: string, ...cols: string[]) =>
    Object.assign(
      { __tableName: name },
      Object.fromEntries(cols.map((c) => [c, { name: c, table: name }])),
    ) as Record<string, unknown>;
  const blank = (name: string) => make(name, 'id');
  return new Proxy({
    projects: blank('projects'),
    kanbanCards: blank('kanbanCards'),
    kanbanColumns: blank('kanbanColumns'),
    kanbanLabels: blank('kanbanLabels'),
    kanbanCardLabels: blank('kanbanCardLabels'),
    kanbanCardChecklistItems: blank('kanbanCardChecklistItems'),
    kanbanCardAssignees: blank('kanbanCardAssignees'),
    kanbanCardWatchers: blank('kanbanCardWatchers'),
    kanbanCardDependencies: blank('kanbanCardDependencies'),
    supportTickets: blank('supportTickets'),
    ticketMessages: blank('ticketMessages'),
    crmContacts: blank('crmContacts'),
    crmCompanies: blank('crmCompanies'),
    crmDeals: blank('crmDeals'),
    crmPipelines: blank('crmPipelines'),
    crmPipelineStages: blank('crmPipelineStages'),
    posts: blank('posts'),
    media: blank('media'),
    clientWebsites: blank('clientWebsites'),
    emailLists: blank('emailLists'),
    emailCampaigns: blank('emailCampaigns'),
    pitchDecks: blank('pitchDecks'),
    brandingProfiles: blank('brandingProfiles'),
    emailSubscribers: blank('emailSubscribers'),
    emailCampaignSends: blank('emailCampaignSends'),
    surveys: blank('surveys'),
    surveyResponses: blank('surveyResponses'),
    bookingPages: blank('bookingPages'),
    bookings: blank('bookings'),
    sprints: blank('sprints'),
    crmActivities: blank('crmActivities'),
    categories: blank('categories'),
    tags: blank('tags'),
    postCategories: blank('postCategories'),
    postTags: blank('postTags'),
    automationRules: blank('automationRules'),
    clientMembers: blank('clientMembers'),
    users: make('users', 'id', 'name', 'email', 'updatedAt'),
    crmProposals: blank('crmProposals'),
    crmContracts: blank('crmContracts'),
    crmContractSigners: blank('crmContractSigners'),
    invoices: blank('invoices'),
    invoiceItems: blank('invoiceItems'),
    serviceRequests: blank('serviceRequests'),
    suggestedProjectRequests: blank('suggestedProjectRequests'),
    suggestedProjects: blank('suggestedProjects'),
    services: blank('services'),
    aiConversations: blank('aiConversations'),
    aiMessages: blank('aiMessages'),
    kanbanCardComments: blank('kanbanCardComments'),
    kanbanCardTimeLogs: blank('kanbanCardTimeLogs'),
    kanbanCardFiles: blank('kanbanCardFiles'),
    kanbanCardArtifacts: blank('kanbanCardArtifacts'),
    crmDealArtifacts: blank('crmDealArtifacts'),
    siteNavigation: blank('siteNavigation'),
    postRevisions: blank('postRevisions'),
    blockTemplates: blank('blockTemplates'),
    blockTemplateUsages: blank('blockTemplateUsages'),
    emailTemplates: blank('emailTemplates'),
    emailSegments: blank('emailSegments'),
    giftCertificates: blank('giftCertificates'),
    crmCustomFields: blank('crmCustomFields'),
    crmCustomFieldValues: blank('crmCustomFieldValues'),
    crmSavedViews: blank('crmSavedViews'),
    crmScoringRules: blank('crmScoringRules'),
    websiteDomains: blank('websiteDomains'),
    websiteEnvironments: blank('websiteEnvironments'),
    websiteEnvVars: blank('websiteEnvVars'),
    clients: make(
      'clients',
      'id',
      'company',
      'phone',
      'website',
      'address',
      'emailPrefix',
      'updatedAt',
    ),
    aiCreditBalances: blank('aiCreditBalances'),
    aiCreditLedger: blank('aiCreditLedger'),
    hostedSites: blank('hostedSites'),
    googleWorkspaceUserConnections: blank('googleWorkspaceUserConnections'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
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
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => ({})) },
  ),
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

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

vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed') }));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerProfileTools } from '@/lib/mcp/tools/profile';

interface CapturedTool {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ content: { text: string; type: string }[]; isError?: boolean }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const stub = {
    registerTool: vi.fn(
      (
        name: string,
        config: CapturedTool['config'],
        handler: CapturedTool['handler'],
      ) => {
        tools.set(name, { name, config, handler });
        return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
      },
    ),
    registerResource: vi.fn(),
  };
  return { stub, tools };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 42,
    keyId: 1,
    scopes,
    client: {
      id: 7,
      company: 'Acme Inc',
      phone: '555-1234',
      website: 'acme.test',
      address: '1 Main St',
      emailPrefix: 'hello',
    } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['*']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerProfileTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.capturedUpdatePatches = [];
  dbState.capturedUpdateTables = [];
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

// ── tool registration ──────────────────────────────────────────────────────

describe('registerProfileTools — tool registration', () => {
  it('registers both profile tools when scopes=*', () => {
    const tools = registerAll();
    expect(tools.has('profile_get')).toBe(true);
    expect(tools.has('profile_update')).toBe(true);
    expect(tools.size).toBe(2);
  });

  it('registers only profile_get when scopes=profile:read', () => {
    const tools = registerAll(['profile:read']);
    expect(tools.has('profile_get')).toBe(true);
    expect(tools.has('profile_update')).toBe(false);
  });

  it('registers only profile_update when scopes=profile:write', () => {
    const tools = registerAll(['profile:write']);
    expect(tools.has('profile_get')).toBe(false);
    expect(tools.has('profile_update')).toBe(true);
  });

  it('registers profile_* when scopes=profile:*', () => {
    const tools = registerAll(['profile:*']);
    expect(tools.has('profile_get')).toBe(true);
    expect(tools.has('profile_update')).toBe(true);
  });

  it('registers nothing when ctx has no profile scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool exposes title, description, and inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} title`).toBeTruthy();
      expect(
        (t.config.description ?? '').length,
        `${t.name} description`,
      ).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name} inputSchema`).toBeDefined();
    }
  });
});

// ── profile_get ─────────────────────────────────────────────────────────────

describe('profile_get', () => {
  it('returns user + client public fields when scope is granted', async () => {
    dbState.selectDefault = [
      { id: 42, name: 'Ada', email: 'ada@example.com' },
    ];
    const tools = registerAll();
    const res = await tools.get('profile_get')!.handler({});
    const out = parseJson(res) as {
      user: Row;
      client: Row;
    };
    expect(out.user).toEqual({ id: 42, name: 'Ada', email: 'ada@example.com' });
    expect(out.client).toEqual({
      id: 7,
      company: 'Acme Inc',
      phone: '555-1234',
      website: 'acme.test',
      address: '1 Main St',
      emailPrefix: 'hello',
    });
  });

  it('returns undefined user when DB has no row', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('profile_get')!.handler({});
    const out = parseJson(res) as { user: Row | undefined; client: Row };
    expect(out.user).toBeUndefined();
    expect(out.client.id).toBe(7);
  });

  it('denies when ctx loses profile:read between registration and call', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProfileTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('profile_get')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
    expect(res.content[0].text).toMatch(/profile:read/);
  });
});

// ── profile_update ──────────────────────────────────────────────────────────

describe('profile_update', () => {
  it('returns success and writes nothing when no fields supplied', async () => {
    const tools = registerAll();
    const res = await tools.get('profile_update')!.handler({});
    expect(parseJson(res)).toEqual({ success: true });
    expect(dbState.capturedUpdatePatches.length).toBe(0);
  });

  it('updates user name and stamps updatedAt', async () => {
    const tools = registerAll();
    const res = await tools
      .get('profile_update')!
      .handler({ name: '  Ada Lovelace  ' });
    expect(parseJson(res)).toEqual({ success: true });
    expect(dbState.capturedUpdatePatches.length).toBe(1);
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.name).toBe('Ada Lovelace');
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('skips the email-uniqueness check when email matches current user', async () => {
    // First select call inside the handler returns the current user email.
    dbState.selectQueue = [[{ email: 'ada@example.com' }]];
    const tools = registerAll();
    const res = await tools
      .get('profile_update')!
      .handler({ email: ' ada@example.com ' });
    expect(parseJson(res)).toEqual({ success: true });
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.email).toBe('ada@example.com');
  });

  it('runs uniqueness check and writes when email is unused', async () => {
    // 1st select: current user email; 2nd select: conflict check (no row).
    dbState.selectQueue = [
      [{ email: 'old@example.com' }],
      [],
    ];
    const tools = registerAll();
    const res = await tools
      .get('profile_update')!
      .handler({ email: 'new@example.com' });
    expect(parseJson(res)).toEqual({ success: true });
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.email).toBe('new@example.com');
  });

  it('returns an error envelope when the email is taken by another user', async () => {
    dbState.selectQueue = [
      [{ email: 'old@example.com' }],
      [{ id: 999 }],
    ];
    const tools = registerAll();
    const res = await tools
      .get('profile_update')!
      .handler({ email: 'taken@example.com' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/already in use/i);
    // No write should be issued on conflict.
    expect(dbState.capturedUpdatePatches.length).toBe(0);
  });

  it('writes client fields and trims values', async () => {
    const tools = registerAll();
    await tools.get('profile_update')!.handler({
      company: '  Acme Co  ',
      phone: ' 555-9999 ',
      website: ' https://acme.test ',
      address: ' 1 Loop ',
    });
    expect(dbState.capturedUpdatePatches.length).toBe(1);
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.company).toBe('Acme Co');
    expect(patch.phone).toBe('555-9999');
    expect(patch.website).toBe('https://acme.test');
    expect(patch.address).toBe('1 Loop');
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('coerces blank client strings to null', async () => {
    const tools = registerAll();
    await tools.get('profile_update')!.handler({
      company: '   ',
      phone: '',
      website: null,
      address: null,
    });
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.company).toBeNull();
    expect(patch.phone).toBeNull();
    expect(patch.website).toBeNull();
    expect(patch.address).toBeNull();
  });

  it('normalizes emailPrefix — lowercase + strip non [a-z0-9-]', async () => {
    const tools = registerAll();
    await tools
      .get('profile_update')!
      .handler({ emailPrefix: '  Hello_World!42-x  ' });
    const patch = dbState.capturedUpdatePatches[0];
    // Allowed: [a-z0-9-]. '_' and '!' stripped. Letters lowercased.
    expect(patch.emailPrefix).toBe('helloworld42-x');
  });

  it('coerces empty emailPrefix to null', async () => {
    const tools = registerAll();
    await tools.get('profile_update')!.handler({ emailPrefix: '   ' });
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.emailPrefix).toBeNull();
  });

  it('coerces explicit null emailPrefix to null', async () => {
    const tools = registerAll();
    await tools.get('profile_update')!.handler({ emailPrefix: null });
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.emailPrefix).toBeNull();
  });

  it('issues TWO updates when both user and client fields change', async () => {
    const tools = registerAll();
    await tools
      .get('profile_update')!
      .handler({ name: 'Grace', company: 'Hopper Inc' });
    expect(dbState.capturedUpdatePatches.length).toBe(2);
    // First update is users (name), second is clients (company).
    const userPatch = dbState.capturedUpdatePatches[0];
    const clientPatch = dbState.capturedUpdatePatches[1];
    expect(userPatch.name).toBe('Grace');
    expect(clientPatch.company).toBe('Hopper Inc');
  });

  it('denies when caller loses profile:write between registration and call', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProfileTools(stub as any, ctx);
    ctx.scopes = ['profile:read'];
    const res = await tools.get('profile_update')!.handler({ name: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
    expect(res.content[0].text).toMatch(/profile:write/);
  });
});
