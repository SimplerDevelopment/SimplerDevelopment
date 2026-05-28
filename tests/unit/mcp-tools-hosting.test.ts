// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/hosting.ts.
 *
 * The module exports `registerHostingTools(server, ctx)` which registers two
 * read-only tools (`hosting_list`, `hosting_get`), both gated by the
 * `hosting:read` scope. Strategy mirrors mcp-tools-bookings.test.ts: stub `db`,
 * mock schema + drizzle helpers + auth, and capture registered tools.
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
} = {
  selectQueue: [],
  selectDefault: [],
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
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
      return makeChain(next);
    }),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// schema objects — opaque column-like refs are fine.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return {
    projects: make('id', 'clientId'),
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
    clientMembers: make('id'),
    users: make('id'),
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
    clients: make('id'),
    aiCreditBalances: make('id'),
    aiCreditLedger: make('id'),
    hostedSites: make(
      'id',
      'clientId',
      'name',
      'customDomain',
      'railwayDomain',
      'status',
      'plan',
      'renewalDate',
      'createdAt',
    ),
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

// auth helpers — hasScope reflects ctx.scopes; requireScope is mirrored.
vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') ||
    granted.includes(required) ||
    granted.includes(`${required.split(':')[0]}:*`),
}));

vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn(async () => true),
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

vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed') }));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerHostingTools } from '@/lib/mcp/tools/hosting';

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
  registerHostingTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
});

describe('registerHostingTools — tool registration', () => {
  it('registers both hosting tools when scopes=*', () => {
    const tools = registerAll();
    expect(tools.has('hosting_list')).toBe(true);
    expect(tools.has('hosting_get')).toBe(true);
  });

  it('registers both hosting tools when scopes=hosting:read', () => {
    const tools = registerAll(['hosting:read']);
    expect(tools.has('hosting_list')).toBe(true);
    expect(tools.has('hosting_get')).toBe(true);
  });

  it('registers nothing when ctx has no hosting scopes', () => {
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

  it('registers via hosting-scoped wildcard (hosting:*)', () => {
    const tools = registerAll(['hosting:*']);
    expect(tools.has('hosting_list')).toBe(true);
    expect(tools.has('hosting_get')).toBe(true);
  });
});

// ── hosting_list ────────────────────────────────────────────────────────────

describe('hosting_list', () => {
  it('returns hosted sites for the client when scope is granted', async () => {
    dbState.selectDefault = [
      { id: 1, name: 'app-one', customDomain: 'app1.example.com', status: 'active' },
      { id: 2, name: 'app-two', customDomain: null, status: 'provisioning' },
    ];
    const tools = registerAll();
    const res = await tools.get('hosting_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('app-one');
    expect(out[1].status).toBe('provisioning');
  });

  it('returns an empty list when the client has no hosted sites', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('hosting_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('accepts an optional status filter', async () => {
    dbState.selectDefault = [{ id: 5, name: 'live-app', status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('hosting_list')!.handler({ status: 'active' });
    const out = parseJson(res) as Row[];
    expect(out[0].status).toBe('active');
  });

  it('accepts each valid status enum value', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    for (const status of ['provisioning', 'active', 'suspended', 'cancelled']) {
      const res = await tools.get('hosting_list')!.handler({ status });
      expect(parseJson(res)).toEqual([]);
    }
  });

  it('denies when ctx lacks hosting:read at call time', async () => {
    // Register with wildcard so the tool is registered, then strip the
    // ctx scope: hosting.ts re-checks via requireScope inside the handler.
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerHostingTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('hosting_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── hosting_get ─────────────────────────────────────────────────────────────

describe('hosting_get', () => {
  it('returns the hosted site row when found', async () => {
    dbState.selectDefault = [
      {
        id: 42,
        clientId: 1,
        name: 'my-site',
        customDomain: 'foo.example.com',
        railwayDomain: 'foo.up.railway.app',
        status: 'active',
        plan: 'pro',
        renewalDate: '2027-01-01',
      },
    ];
    const tools = registerAll();
    const res = await tools.get('hosting_get')!.handler({ id: 42 });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(42);
    expect(out.name).toBe('my-site');
    expect(out.railwayDomain).toBe('foo.up.railway.app');
  });

  it('returns an error envelope when the site is not found', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('hosting_get')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when ctx lacks hosting:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerHostingTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('hosting_get')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
