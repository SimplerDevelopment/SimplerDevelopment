// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/projects.ts.
 *
 * Module exports `registerProjectsTools(server, ctx)` which registers four
 * MCP tools (`projects_list`, `projects_create`, `projects_update`,
 * `my_tasks_list`) each gated by a `projects:read`/`projects:write` scope
 * check.
 *
 * Strategy mirrors tests/unit/mcp-tools-bookings.test.ts: stub `db`, mock
 * schema + drizzle helpers, stub auth / collaborators, and pass in a fake
 * McpServer that captures `{ name -> handler }` so each handler can be
 * invoked directly. Tests cover happy paths plus scope-denial / not-found
 * branches and the `my_tasks_list` openOnly filter.
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
  updateReturning: Row[];
  capturedInsertValues: Row | null;
  capturedUpdatePatch: Row | null;
} = {
  insertReturning: [],
  selectQueue: [],
  selectDefault: [],
  updateReturning: [],
  capturedInsertValues: null,
  capturedUpdatePatch: null,
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
  },
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return new Proxy({
    projects: make('id', 'clientId', 'name', 'description', 'status', 'createdAt', 'updatedAt', 'dueDate', 'isPrivate', 'createdBy', 'projectKey'),
    kanbanCards: make('id', 'number', 'title', 'priority', 'dueDate', 'projectId', 'columnId'),
    kanbanColumns: make('id', 'name', 'isDone'),
    kanbanLabels: make('id'),
    kanbanCardLabels: make('id'),
    kanbanCardChecklistItems: make('id'),
    kanbanCardAssignees: make('id', 'cardId', 'userId'),
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// Stubs for collaborators that projects.ts pulls transitively through its
// import block but never actually invokes from its handlers.
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

import { registerProjectsTools } from '@/lib/mcp/tools/projects';

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
    userId: 42,
    keyId: 1,
    scopes,
    client: { id: 7, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['*']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerProjectsTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.insertReturning = [];
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.updateReturning = [];
  dbState.capturedInsertValues = null;
  dbState.capturedUpdatePatch = null;
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

describe('registerProjectsTools — tool registration', () => {
  it('registers all four canonical tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'projects_list',
      'projects_create',
      'projects_update',
      'my_tasks_list',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only read tools when scopes=projects:read', () => {
    const tools = registerAll(['projects:read']);
    expect(tools.has('projects_list')).toBe(true);
    expect(tools.has('my_tasks_list')).toBe(true);
    expect(tools.has('projects_create')).toBe(false);
    expect(tools.has('projects_update')).toBe(false);
  });

  it('registers only write tools when scopes=projects:write', () => {
    const tools = registerAll(['projects:write']);
    expect(tools.has('projects_create')).toBe(true);
    expect(tools.has('projects_update')).toBe(true);
    expect(tools.has('projects_list')).toBe(false);
    expect(tools.has('my_tasks_list')).toBe(false);
  });

  it('registers nothing when ctx has no project scopes', () => {
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

// ── projects_list ───────────────────────────────────────────────────────────

describe('projects_list', () => {
  it('returns rows for the authenticated client when no status filter is supplied', async () => {
    dbState.selectDefault = [
      { id: 1, name: 'A', status: 'active' },
      { id: 2, name: 'B', status: 'paused' },
    ];
    const tools = registerAll();
    const res = await tools.get('projects_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('A');
  });

  it('applies a status filter when supplied', async () => {
    dbState.selectDefault = [{ id: 3, name: 'C', status: 'archived' }];
    const tools = registerAll();
    const res = await tools.get('projects_list')!.handler({ status: 'archived' });
    const out = parseJson(res) as Row[];
    expect(out[0].status).toBe('archived');
  });

  it('returns an empty array when the client has no projects', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('projects_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when ctx lacks projects:read at handler-call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('projects_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── projects_create ─────────────────────────────────────────────────────────

describe('projects_create', () => {
  it('inserts a project with defaults and returns the row', async () => {
    dbState.insertReturning = [{ id: 10, name: 'New Project', status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('projects_create')!.handler({ name: 'New Project' });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(10);
    const vals = dbState.capturedInsertValues!;
    expect(vals.name).toBe('New Project');
    expect(vals.description).toBeNull();
    expect(vals.clientId).toBe(7);
    expect(vals.status).toBe('active');
    expect(vals.isPrivate).toBe(true);
    expect(vals.createdBy).toBe(42);
  });

  it('passes description through when supplied', async () => {
    dbState.insertReturning = [{ id: 11 }];
    const tools = registerAll();
    await tools.get('projects_create')!.handler({
      name: 'With description',
      description: 'hello world',
    });
    const vals = dbState.capturedInsertValues!;
    expect(vals.description).toBe('hello world');
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('projects_create')!.handler({ name: 'Nope' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── projects_update ─────────────────────────────────────────────────────────

describe('projects_update', () => {
  it('updates only the fields supplied and stamps updatedAt', async () => {
    dbState.updateReturning = [{ id: 5, name: 'renamed' }];
    const tools = registerAll();
    const res = await tools.get('projects_update')!.handler({ id: 5, name: 'renamed' });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(5);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.name).toBe('renamed');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    // Untouched fields should not appear in the patch.
    expect('description' in patch).toBe(false);
    expect('status' in patch).toBe(false);
    expect('dueDate' in patch).toBe(false);
  });

  it('updates description and status when supplied', async () => {
    dbState.updateReturning = [{ id: 5, status: 'archived' }];
    const tools = registerAll();
    await tools.get('projects_update')!.handler({
      id: 5,
      description: 'new desc',
      status: 'archived',
    });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.description).toBe('new desc');
    expect(patch.status).toBe('archived');
  });

  it('parses dueDate ISO string into a Date', async () => {
    dbState.updateReturning = [{ id: 5 }];
    const tools = registerAll();
    await tools.get('projects_update')!.handler({ id: 5, dueDate: '2026-12-31T00:00:00Z' });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.dueDate).toBeInstanceOf(Date);
  });

  it('returns an error envelope when the project is missing', async () => {
    dbState.updateReturning = [];
    const tools = registerAll();
    const res = await tools.get('projects_update')!.handler({ id: 999, name: 'X' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('projects_update')!.handler({ id: 1, name: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── my_tasks_list ───────────────────────────────────────────────────────────

describe('my_tasks_list', () => {
  it('returns only open cards by default (filters out columnIsDone=true)', async () => {
    dbState.selectDefault = [
      { id: 1, title: 'Task A', columnIsDone: false },
      { id: 2, title: 'Task B', columnIsDone: true },
      { id: 3, title: 'Task C', columnIsDone: false },
    ];
    const tools = registerAll();
    const res = await tools.get('my_tasks_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id)).toEqual([1, 3]);
  });

  it('returns every row when openOnly=false', async () => {
    dbState.selectDefault = [
      { id: 1, columnIsDone: false },
      { id: 2, columnIsDone: true },
    ];
    const tools = registerAll();
    const res = await tools.get('my_tasks_list')!.handler({ openOnly: false });
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
  });

  it('returns [] when the user has no assigned cards', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('my_tasks_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when caller lacks projects:read at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('my_tasks_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
