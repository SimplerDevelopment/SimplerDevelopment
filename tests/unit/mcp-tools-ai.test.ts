// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/ai.ts.
 *
 * The module exports a single function — `registerAiTools(server, ctx)` —
 * that registers two read-only MCP tools for AI conversations + messages,
 * both gated by the `ai:read` scope.
 *
 * Strategy mirrors mcp-tools-bookings.test.ts: stub `db`, mock schema +
 * drizzle helpers, mock auth/service collaborators, and pass in a fake
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
    invoices: make('id'),
    invoiceItems: make('id'),
    serviceRequests: make('id'),
    suggestedProjectRequests: make('id'),
    suggestedProjects: make('id'),
    services: make('id'),
    aiConversations: make('id', 'clientId', 'flagged', 'updatedAt'),
    aiMessages: make('id', 'conversationId', 'createdAt'),
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// Transitive imports through ai.ts → keep mocks minimal.
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

import { registerAiTools } from '@/lib/mcp/tools/ai';

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
  registerAiTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
});

describe('registerAiTools — tool registration', () => {
  it('registers ai_conversations_list and ai_conversations_get with scopes=*', () => {
    const tools = registerAll();
    expect(tools.has('ai_conversations_list')).toBe(true);
    expect(tools.has('ai_conversations_get')).toBe(true);
  });

  it('registers both tools with the ai:read scope', () => {
    const tools = registerAll(['ai:read']);
    expect(tools.has('ai_conversations_list')).toBe(true);
    expect(tools.has('ai_conversations_get')).toBe(true);
  });

  it('registers both tools with the ai:* wildcard scope', () => {
    const tools = registerAll(['ai:*']);
    expect(tools.has('ai_conversations_list')).toBe(true);
    expect(tools.has('ai_conversations_get')).toBe(true);
  });

  it('registers nothing when ctx lacks any ai scope', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('registers nothing when ctx has empty scopes', () => {
    const tools = registerAll([]);
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

// ── ai_conversations_list ───────────────────────────────────────────────────

describe('ai_conversations_list', () => {
  it('returns conversations when scope is granted', async () => {
    dbState.selectDefault = [
      { id: 1, clientId: 1, flagged: false, title: 'Hello' },
      { id: 2, clientId: 1, flagged: true, title: 'Important' },
    ];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(1);
    expect(out[1].id).toBe(2);
  });

  it('returns an empty array when there are no conversations', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('accepts flagged=true filter', async () => {
    dbState.selectDefault = [{ id: 9, flagged: true }];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_list')!.handler({ flagged: true });
    const out = parseJson(res) as Row[];
    expect(out[0].flagged).toBe(true);
  });

  it('accepts flagged=false filter', async () => {
    dbState.selectDefault = [{ id: 10, flagged: false }];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_list')!.handler({ flagged: false });
    const out = parseJson(res) as Row[];
    expect(out[0].flagged).toBe(false);
  });

  it('accepts a custom limit', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_list')!.handler({ limit: 100 });
    expect(parseJson(res)).toEqual([]);
  });

  it('runs with no args (applies default limit + no flagged filter)', async () => {
    dbState.selectDefault = [{ id: 1 }];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(1);
  });

  it('denies when ctx lacks ai:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAiTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('ai_conversations_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── ai_conversations_get ────────────────────────────────────────────────────

describe('ai_conversations_get', () => {
  it('returns the conversation + its messages when found', async () => {
    const conv = { id: 5, clientId: 1, title: 'Strategy chat' };
    const messages = [
      { id: 100, conversationId: 5, role: 'user', content: 'Hi' },
      { id: 101, conversationId: 5, role: 'assistant', content: 'Hello!' },
    ];
    dbState.selectQueue = [[conv], messages];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_get')!.handler({ id: 5 });
    const out = parseJson(res) as { conversation: Row; messages: Row[] };
    expect(out.conversation.id).toBe(5);
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0].role).toBe('user');
    expect(out.messages[1].role).toBe('assistant');
  });

  it('returns an empty messages array when the conversation has none', async () => {
    dbState.selectQueue = [[{ id: 6, clientId: 1 }], []];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_get')!.handler({ id: 6 });
    const out = parseJson(res) as { conversation: Row; messages: Row[] };
    expect(out.conversation.id).toBe(6);
    expect(out.messages).toEqual([]);
  });

  it('returns an error envelope when the conversation is missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_get')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('does not query messages when conversation is not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('ai_conversations_get')!.handler({ id: 123 });
    const out = parseJson(res) as { error?: string; messages?: unknown };
    expect(out.error).toBeDefined();
    expect(out.messages).toBeUndefined();
  });

  it('denies when ctx lacks ai:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAiTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('ai_conversations_get')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
