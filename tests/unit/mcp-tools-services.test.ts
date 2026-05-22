// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/services.ts.
 *
 * The module exports `registerServicesTools(server, ctx)`, which registers
 * five MCP tools for the services catalog + service requests + suggested
 * projects, each gated by `services:read` or `services:write` scopes.
 *
 * Strategy mirrors tests/unit/mcp-tools-bookings.test.ts: stub the drizzle
 * `db` builder with a Proxy, stub schema column refs as opaque objects, mock
 * drizzle-orm helpers + auth + transitive imports, then drive each handler
 * directly via a captured `{name -> handler}` map.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const dbState: {
  insertReturning: Row[];
  selectQueue: Row[][];
  selectDefault: Row[];
  capturedInsertValues: Row | null;
} = {
  insertReturning: [],
  selectQueue: [],
  selectDefault: [],
  capturedInsertValues: null,
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
        dbState.capturedInsertValues = vals;
        return {
          returning: vi.fn(async () => dbState.insertReturning),
        };
      }),
    })),
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
      return makeChain(next);
    }),
  },
}));

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
    clientMembers: make('id'),
    users: make('id'),
    crmProposals: make('id'),
    crmContracts: make('id'),
    crmContractSigners: make('id'),
    invoices: make('id'),
    invoiceItems: make('id'),
    serviceRequests: make('id', 'clientId', 'serviceId', 'status', 'message', 'answers', 'createdAt'),
    suggestedProjectRequests: make('id', 'clientId', 'suggestedProjectId', 'status', 'message', 'answers'),
    suggestedProjects: make('id', 'title', 'description', 'category', 'estimatedPrice', 'estimatedTimeline', 'features', 'icon', 'active', 'order'),
    services: make('id', 'name', 'slug', 'description', 'category', 'price', 'billingCycle', 'active'),
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
    hostedSites: make('id'),
    googleWorkspaceUserConnections: make('id'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...args) => ({ and: args })),
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

vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn(async () => true),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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

import { registerServicesTools } from '@/lib/mcp/tools/services';

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
  registerServicesTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.insertReturning = [];
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.capturedInsertValues = null;
});

describe('registerServicesTools — tool registration', () => {
  it('registers all five services tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'service_requests_list',
      'service_requests_create',
      'service_catalog_list',
      'suggested_projects_list',
      'suggested_project_requests_create',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only read tools when scopes=services:read', () => {
    const tools = registerAll(['services:read']);
    expect(tools.has('service_requests_list')).toBe(true);
    expect(tools.has('service_catalog_list')).toBe(true);
    expect(tools.has('suggested_projects_list')).toBe(true);
    expect(tools.has('service_requests_create')).toBe(false);
    expect(tools.has('suggested_project_requests_create')).toBe(false);
  });

  it('registers only write tools when scopes=services:write', () => {
    const tools = registerAll(['services:write']);
    expect(tools.has('service_requests_create')).toBe(true);
    expect(tools.has('suggested_project_requests_create')).toBe(true);
    expect(tools.has('service_requests_list')).toBe(false);
    expect(tools.has('service_catalog_list')).toBe(false);
    expect(tools.has('suggested_projects_list')).toBe(false);
  });

  it('registers nothing when ctx has no services scopes', () => {
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

// ── service_requests_list ───────────────────────────────────────────────────

describe('service_requests_list', () => {
  it('returns rows when called without filters', async () => {
    dbState.selectDefault = [
      { id: 1, serviceId: 4, status: 'pending', message: 'hi', answers: null, createdAt: '2026-01-01' },
    ];
    const tools = registerAll();
    const res = await tools.get('service_requests_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it('accepts a status filter without throwing', async () => {
    dbState.selectDefault = [{ id: 2, status: 'approved' }];
    const tools = registerAll();
    const res = await tools.get('service_requests_list')!.handler({ status: 'approved' });
    const out = parseJson(res) as Row[];
    expect(out[0].status).toBe('approved');
  });

  it('denies when ctx lacks services:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerServicesTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('service_requests_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── service_requests_create ─────────────────────────────────────────────────

describe('service_requests_create', () => {
  it('creates a service request when service exists and is active', async () => {
    // first select() resolves service lookup → found
    dbState.selectQueue = [[{ id: 10 }]];
    dbState.insertReturning = [
      { id: 50, clientId: 1, serviceId: 10, status: 'pending', message: 'please', answers: null },
    ];
    const tools = registerAll();
    const res = await tools.get('service_requests_create')!.handler({
      serviceId: 10,
      message: 'please',
      answers: { color: 'blue' },
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(50);
    const vals = dbState.capturedInsertValues!;
    expect(vals.clientId).toBe(1);
    expect(vals.serviceId).toBe(10);
    expect(vals.status).toBe('pending');
    expect(vals.message).toBe('please');
    expect(vals.answers).toEqual({ color: 'blue' });
  });

  it('defaults message and answers to null when omitted', async () => {
    dbState.selectQueue = [[{ id: 10 }]];
    dbState.insertReturning = [{ id: 51 }];
    const tools = registerAll();
    await tools.get('service_requests_create')!.handler({ serviceId: 10 });
    const vals = dbState.capturedInsertValues!;
    expect(vals.message).toBeNull();
    expect(vals.answers).toBeNull();
  });

  it('returns error envelope when service not found or inactive', async () => {
    dbState.selectQueue = [[]]; // service lookup empty
    const tools = registerAll();
    const res = await tools.get('service_requests_create')!.handler({ serviceId: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found or inactive/i);
    // no insert should have been captured
    expect(dbState.capturedInsertValues).toBeNull();
  });

  it('denies when ctx lacks services:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerServicesTools(stub as any, ctx);
    ctx.scopes = ['services:read'];
    const res = await tools.get('service_requests_create')!.handler({ serviceId: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── service_catalog_list ────────────────────────────────────────────────────

describe('service_catalog_list', () => {
  it('returns the active service catalog', async () => {
    dbState.selectDefault = [
      { id: 1, name: 'Web Design', slug: 'web-design', active: true },
      { id: 2, name: 'SEO', slug: 'seo', active: true },
    ];
    const tools = registerAll();
    const res = await tools.get('service_catalog_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Web Design');
  });

  it('denies when scope missing at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerServicesTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('service_catalog_list')!.handler({});
    expect(res.isError).toBe(true);
  });
});

// ── suggested_projects_list ─────────────────────────────────────────────────

describe('suggested_projects_list', () => {
  it('returns the suggested project templates', async () => {
    dbState.selectDefault = [
      { id: 1, title: 'Build a Blog', category: 'web' },
      { id: 2, title: 'Mobile App', category: 'mobile' },
    ];
    const tools = registerAll();
    const res = await tools.get('suggested_projects_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[1].title).toBe('Mobile App');
  });

  it('accepts a category filter', async () => {
    dbState.selectDefault = [{ id: 3, title: 'Shop', category: 'commerce' }];
    const tools = registerAll();
    const res = await tools.get('suggested_projects_list')!.handler({ category: 'commerce' });
    const out = parseJson(res) as Row[];
    expect(out[0].category).toBe('commerce');
  });

  it('denies when scope missing at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerServicesTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('suggested_projects_list')!.handler({});
    expect(res.isError).toBe(true);
  });
});

// ── suggested_project_requests_create ───────────────────────────────────────

describe('suggested_project_requests_create', () => {
  it('creates a suggested-project request when template exists', async () => {
    dbState.selectQueue = [[{ id: 20 }]];
    dbState.insertReturning = [
      { id: 80, clientId: 1, suggestedProjectId: 20, status: 'pending' },
    ];
    const tools = registerAll();
    const res = await tools.get('suggested_project_requests_create')!.handler({
      suggestedProjectId: 20,
      message: 'sounds good',
      answers: { budget: 'medium' },
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(80);
    const vals = dbState.capturedInsertValues!;
    expect(vals.clientId).toBe(1);
    expect(vals.suggestedProjectId).toBe(20);
    expect(vals.status).toBe('pending');
    expect(vals.message).toBe('sounds good');
    expect(vals.answers).toEqual({ budget: 'medium' });
  });

  it('defaults message and answers to null when omitted', async () => {
    dbState.selectQueue = [[{ id: 20 }]];
    dbState.insertReturning = [{ id: 81 }];
    const tools = registerAll();
    await tools.get('suggested_project_requests_create')!.handler({ suggestedProjectId: 20 });
    const vals = dbState.capturedInsertValues!;
    expect(vals.message).toBeNull();
    expect(vals.answers).toBeNull();
  });

  it('returns error envelope when suggested project not found or inactive', async () => {
    dbState.selectQueue = [[]]; // template lookup empty
    const tools = registerAll();
    const res = await tools.get('suggested_project_requests_create')!.handler({
      suggestedProjectId: 999,
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found or inactive/i);
    expect(dbState.capturedInsertValues).toBeNull();
  });

  it('denies when ctx lacks services:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerServicesTools(stub as any, ctx);
    ctx.scopes = ['services:read'];
    const res = await tools.get('suggested_project_requests_create')!.handler({
      suggestedProjectId: 1,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
