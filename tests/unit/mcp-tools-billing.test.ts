// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/billing.ts.
 *
 * The module exports a single function — `registerBillingTools(server, ctx)` —
 * that registers four read-only tools (invoices_list, invoices_get,
 * ai_credits_balance, ai_credits_ledger), each gated by `billing:read`.
 *
 * Strategy mirrors mcp-tools-bookings.test.ts: stub `db`, mock schema +
 * drizzle helpers, mock auth collaborators, and pass in a fake McpServer that
 * captures `{ name -> handler }` so each handler can be invoked directly.
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
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
      })),
    })),
  },
}));

// schema objects — opaque column refs.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return new Proxy({
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
    invoices: make('id', 'clientId', 'status', 'createdAt'),
    invoiceItems: make('id', 'invoiceId'),
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
    aiCreditBalances: make('id', 'clientId'),
    aiCreditLedger: make('id', 'clientId', 'type', 'createdAt'),
    hostedSites: make('id'),
    googleWorkspaceUserConnections: make('id'),
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// Heavy transitive deps from billing.ts top-of-file imports — stub them out.
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

import { registerBillingTools } from '@/lib/mcp/tools/billing';

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
  registerBillingTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

describe('registerBillingTools — tool registration', () => {
  it('registers the canonical billing tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'invoices_list',
      'invoices_get',
      'ai_credits_balance',
      'ai_credits_ledger',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers all four tools with billing:read scope', () => {
    const tools = registerAll(['billing:read']);
    expect(tools.has('invoices_list')).toBe(true);
    expect(tools.has('invoices_get')).toBe(true);
    expect(tools.has('ai_credits_balance')).toBe(true);
    expect(tools.has('ai_credits_ledger')).toBe(true);
  });

  it('registers nothing when ctx has no billing scopes', () => {
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

// ── invoices_list ───────────────────────────────────────────────────────────

describe('invoices_list', () => {
  it('returns the invoice list when scope is granted', async () => {
    dbState.selectDefault = [
      { id: 1, status: 'sent', total: 1000 },
      { id: 2, status: 'paid', total: 500 },
    ];
    const tools = registerAll();
    const res = await tools.get('invoices_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(1);
  });

  it('accepts a status filter', async () => {
    dbState.selectDefault = [{ id: 7, status: 'overdue' }];
    const tools = registerAll();
    const res = await tools.get('invoices_list')!.handler({ status: 'overdue' });
    const out = parseJson(res) as Row[];
    expect(out[0].status).toBe('overdue');
  });

  it('honors a custom limit', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('invoices_list')!.handler({ limit: 10 });
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when ctx lacks billing:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBillingTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('invoices_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
    expect(res.content[0].text).toMatch(/billing:read/);
  });
});

// ── invoices_get ────────────────────────────────────────────────────────────

describe('invoices_get', () => {
  it('returns invoice + line items when found', async () => {
    dbState.selectQueue = [
      [{ id: 5, status: 'sent', total: 1000 }],
      [
        { id: 11, invoiceId: 5, description: 'Design', amount: 600 },
        { id: 12, invoiceId: 5, description: 'Dev', amount: 400 },
      ],
    ];
    const tools = registerAll();
    const res = await tools.get('invoices_get')!.handler({ id: 5 });
    const out = parseJson(res) as { invoice: Row; items: Row[] };
    expect(out.invoice.id).toBe(5);
    expect(out.items).toHaveLength(2);
    expect(out.items[0].description).toBe('Design');
  });

  it('returns an error envelope when invoice missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('invoices_get')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when scope missing at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBillingTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('invoices_get')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── ai_credits_balance ──────────────────────────────────────────────────────

describe('ai_credits_balance', () => {
  it('returns the existing balance row when present', async () => {
    dbState.selectDefault = [
      { clientId: 1, balance: 12345, monthlyGrant: 5000, payAsYouGo: true },
    ];
    const tools = registerAll();
    const res = await tools.get('ai_credits_balance')!.handler({});
    const out = parseJson(res) as Row;
    expect(out.balance).toBe(12345);
    expect(out.payAsYouGo).toBe(true);
  });

  it('returns a synthesized zero-balance row when no record exists', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('ai_credits_balance')!.handler({});
    const out = parseJson(res) as Row;
    expect(out.clientId).toBe(1);
    expect(out.balance).toBe(0);
    expect(out.monthlyGrant).toBe(0);
    expect(out.payAsYouGo).toBe(false);
  });

  it('denies when scope missing at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBillingTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('ai_credits_balance')!.handler({});
    expect(res.isError).toBe(true);
  });
});

// ── ai_credits_ledger ───────────────────────────────────────────────────────

describe('ai_credits_ledger', () => {
  it('returns recent ledger entries with default limit', async () => {
    dbState.selectDefault = [
      { id: 1, type: 'grant', amount: 5000 },
      { id: 2, type: 'usage', amount: -300 },
    ];
    const tools = registerAll();
    const res = await tools.get('ai_credits_ledger')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('grant');
  });

  it('filters by ledger type when supplied', async () => {
    dbState.selectDefault = [{ id: 3, type: 'purchase', amount: 10000 }];
    const tools = registerAll();
    const res = await tools.get('ai_credits_ledger')!.handler({ type: 'purchase', limit: 25 });
    const out = parseJson(res) as Row[];
    expect(out[0].type).toBe('purchase');
  });

  it('handles each documented type value', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    for (const type of ['grant', 'usage', 'purchase', 'refund', 'expiry']) {
      const res = await tools.get('ai_credits_ledger')!.handler({ type });
      expect(parseJson(res)).toEqual([]);
    }
  });

  it('denies when scope missing at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBillingTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('ai_credits_ledger')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/billing:read/);
  });
});
