// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/tickets.ts.
 *
 * The module exports a single function — `registerTicketsTools(server, ctx)` —
 * that registers support-ticket MCP tools, each gated by a scope check
 * (`tickets:read` / `tickets:write`).
 *
 * Strategy mirrors mcp-tools-bookings.test.ts: stub `db`, mock schema +
 * drizzle helpers, mock auth/service collaborators, and pass in a fake
 * McpServer that captures `{ name -> handler }` so each handler can be invoked
 * directly. Tests cover happy paths plus scope-denial / not-found / attachment
 * branches.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const dbState: {
  insertReturnings: Row[][]; // queue per insert call
  insertDefault: Row[];
  selectQueue: Row[][];
  selectDefault: Row[];
  updateReturning: Row[];
  capturedInsertValues: Row[]; // every insert in order
  capturedUpdatePatches: Row[]; // every update in order
} = {
  insertReturnings: [],
  insertDefault: [],
  selectQueue: [],
  selectDefault: [],
  updateReturning: [],
  capturedInsertValues: [],
  capturedUpdatePatches: [],
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
        const rows = dbState.insertReturnings.length > 0
          ? dbState.insertReturnings.shift()!
          : dbState.insertDefault;
        return {
          returning: vi.fn(async () => rows),
          // bare insert without returning() — bookings tests rely on awaiting
          // the values() call directly via the proxy chain. For tickets.ts,
          // some inserts are awaited without .returning() (e.g. the second
          // ticketMessages insert in tickets_create), so values() must itself
          // be thenable.
          then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(rows).then(onFulfilled),
        };
      }),
    })),
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
      return makeChain(next);
    }),
    update: vi.fn(() => ({
      set: vi.fn((patch: Row) => {
        dbState.capturedUpdatePatches.push(patch);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => dbState.updateReturning),
            then: (onFulfilled: (v: unknown) => unknown) =>
              Promise.resolve(dbState.updateReturning).then(onFulfilled),
          })),
        };
      }),
    })),
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
    supportTickets: make('id', 'clientId', 'status', 'number', 'createdAt', 'updatedAt'),
    ticketMessages: make('id', 'ticketId', 'isInternal', 'createdAt'),
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

// portal-auth — control service access per-test (tickets.ts doesn't call it
// but it's transitively imported by ../types).
const hasServiceAccessMock = vi.fn(async () => true);
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: (...args: unknown[]) => hasServiceAccessMock(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ssrf-guard — control allow/deny per-test for tickets_attach_file_from_url.
const assertSafeUrlMock = vi.fn(async (_url: string) => {});
vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: (url: string) => assertSafeUrlMock(url),
}));

// s3 upload — return a stable artifact descriptor.
const uploadToS3Mock = vi.fn(async (_buf: Buffer, name: string, mime: string) => ({
  url: `https://s3.example.com/${name}`,
  filename: name,
  mimeType: mime,
  fileSize: _buf.length,
}));
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...(args as Parameters<typeof uploadToS3Mock>)),
}));

// other deps transitively imported via the top-of-file import block.
vi.mock('@/lib/pm-activity', () => ({ logCardActivity: vi.fn() }));
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

import { registerTicketsTools } from '@/lib/mcp/tools/tickets';

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
  registerTicketsTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.insertReturnings = [];
  dbState.insertDefault = [];
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.updateReturning = [];
  dbState.capturedInsertValues = [];
  dbState.capturedUpdatePatches = [];
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
  assertSafeUrlMock.mockReset();
  assertSafeUrlMock.mockResolvedValue(undefined);
  uploadToS3Mock.mockClear();
});

describe('registerTicketsTools — tool registration', () => {
  it('registers all canonical ticket tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'tickets_list',
      'tickets_get',
      'tickets_create',
      'tickets_reply',
      'tickets_update',
      'tickets_attach_file_from_url',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only read tools when scopes=tickets:read', () => {
    const tools = registerAll(['tickets:read']);
    expect(tools.has('tickets_list')).toBe(true);
    expect(tools.has('tickets_get')).toBe(true);
    expect(tools.has('tickets_create')).toBe(false);
    expect(tools.has('tickets_reply')).toBe(false);
    expect(tools.has('tickets_update')).toBe(false);
    expect(tools.has('tickets_attach_file_from_url')).toBe(false);
  });

  it('registers only write tools when scopes=tickets:write (read tools omitted)', () => {
    const tools = registerAll(['tickets:write']);
    expect(tools.has('tickets_list')).toBe(false);
    expect(tools.has('tickets_get')).toBe(false);
    expect(tools.has('tickets_create')).toBe(true);
    expect(tools.has('tickets_reply')).toBe(true);
    expect(tools.has('tickets_update')).toBe(true);
    expect(tools.has('tickets_attach_file_from_url')).toBe(true);
  });

  it('registers all tools under a tickets:* wildcard scope', () => {
    const tools = registerAll(['tickets:*']);
    expect(tools.size).toBe(6);
  });

  it('registers nothing when ctx has no tickets scopes', () => {
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

// ── tickets_list ────────────────────────────────────────────────────────────

describe('tickets_list', () => {
  it('returns the list when scope is granted (no status filter)', async () => {
    dbState.selectDefault = [{ id: 1, subject: 'Hi', status: 'open' }];
    const tools = registerAll();
    const res = await tools.get('tickets_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out[0].subject).toBe('Hi');
  });

  it('returns the list when status filter is supplied', async () => {
    dbState.selectDefault = [{ id: 2, status: 'closed' }];
    const tools = registerAll();
    const res = await tools.get('tickets_list')!.handler({ status: 'closed', limit: 25 });
    const out = parseJson(res) as Row[];
    expect(out[0].id).toBe(2);
  });

  it('uses default limit of 50 when limit omitted', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('tickets_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when ctx lacks tickets:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTicketsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('tickets_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── tickets_get ─────────────────────────────────────────────────────────────

describe('tickets_get', () => {
  it('returns the ticket plus its message thread', async () => {
    dbState.selectQueue = [
      [{ id: 4, subject: 'A' }], // ticket lookup
      [{ id: 10, body: 'hello' }, { id: 11, body: 'follow up' }], // messages
    ];
    const tools = registerAll();
    const res = await tools.get('tickets_get')!.handler({ id: 4 });
    const out = parseJson(res) as { ticket: Row; messages: Row[] };
    expect(out.ticket.id).toBe(4);
    expect(out.messages).toHaveLength(2);
  });

  it('returns an error envelope when the ticket is missing', async () => {
    dbState.selectQueue = [[]]; // ticket lookup empty
    const tools = registerAll();
    const res = await tools.get('tickets_get')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when scope removed at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTicketsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('tickets_get')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
  });
});

// ── tickets_create ──────────────────────────────────────────────────────────

describe('tickets_create', () => {
  it('creates a ticket with the next sequential number and inserts an initial message', async () => {
    // First select returns the max ticket number for the client.
    dbState.selectQueue = [[{ maxNum: 7 }]];
    // First insert returns the new ticket row.
    dbState.insertReturnings = [[{ id: 50, number: 8, subject: 'Help' }]];
    const tools = registerAll();
    const res = await tools.get('tickets_create')!.handler({
      subject: 'Help',
      body: 'Need assistance',
      priority: 'high',
      category: 'technical',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(50);
    // First insert was the ticket itself with number=8.
    const ticketVals = dbState.capturedInsertValues[0];
    expect(ticketVals.subject).toBe('Help');
    expect(ticketVals.number).toBe(8);
    expect(ticketVals.priority).toBe('high');
    expect(ticketVals.category).toBe('technical');
    expect(ticketVals.createdBy).toBe(11);
    // Second insert was the initial ticketMessages row.
    const msgVals = dbState.capturedInsertValues[1];
    expect(msgVals.ticketId).toBe(50);
    expect(msgVals.body).toBe('Need assistance');
    expect(msgVals.authorId).toBe(11);
  });

  it('starts numbering at 1 when there are no existing tickets', async () => {
    dbState.selectQueue = [[{ maxNum: null }]];
    dbState.insertReturnings = [[{ id: 1, number: 1 }]];
    const tools = registerAll();
    await tools.get('tickets_create')!.handler({ subject: 'First', body: 'b' });
    const ticketVals = dbState.capturedInsertValues[0];
    expect(ticketVals.number).toBe(1);
  });

  it('defaults priority=medium and category=general when omitted', async () => {
    dbState.selectQueue = [[{ maxNum: 0 }]];
    dbState.insertReturnings = [[{ id: 2 }]];
    const tools = registerAll();
    await tools.get('tickets_create')!.handler({ subject: 's', body: 'b' });
    const vals = dbState.capturedInsertValues[0];
    expect(vals.priority).toBe('medium');
    expect(vals.category).toBe('general');
  });

  it('denies when scope removed at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTicketsTools(stub as any, ctx);
    ctx.scopes = ['tickets:read'];
    const res = await tools.get('tickets_create')!.handler({ subject: 's', body: 'b' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── tickets_reply ───────────────────────────────────────────────────────────

describe('tickets_reply', () => {
  it('appends a message and stamps updatedAt on the parent ticket', async () => {
    dbState.selectQueue = [[{ id: 5 }]]; // ticket lookup
    dbState.insertReturnings = [[{ id: 200, ticketId: 5, body: 'reply' }]];
    const tools = registerAll();
    const res = await tools.get('tickets_reply')!.handler({ id: 5, body: 'reply' });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(200);
    const msgVals = dbState.capturedInsertValues[0];
    expect(msgVals.ticketId).toBe(5);
    expect(msgVals.body).toBe('reply');
    expect(msgVals.authorId).toBe(11);
    // Update patch should set updatedAt to a Date.
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('errors when ticket not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('tickets_reply')!.handler({ id: 999, body: 'x' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
    // No insert should have happened.
    expect(dbState.capturedInsertValues).toHaveLength(0);
  });

  it('denies when scope removed at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTicketsTools(stub as any, ctx);
    ctx.scopes = ['tickets:read'];
    const res = await tools.get('tickets_reply')!.handler({ id: 1, body: 'x' });
    expect(res.isError).toBe(true);
  });
});

// ── tickets_update ──────────────────────────────────────────────────────────

describe('tickets_update', () => {
  it('updates status, priority, category, subject, and assignedTo when supplied', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'open' }]];
    dbState.updateReturning = [{ id: 1, status: 'in_progress' }];
    const tools = registerAll();
    const res = await tools.get('tickets_update')!.handler({
      id: 1,
      status: 'in_progress',
      priority: 'urgent',
      category: 'billing',
      subject: 'New subject',
      assignedTo: 42,
    });
    const out = parseJson(res) as Row;
    expect(out.status).toBe('in_progress');
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.status).toBe('in_progress');
    expect(patch.priority).toBe('urgent');
    expect(patch.category).toBe('billing');
    expect(patch.subject).toBe('New subject');
    expect(patch.assignedTo).toBe(42);
    expect(patch.updatedAt).toBeInstanceOf(Date);
    // Status was 'open' → 'in_progress' (not resolved), so no resolvedAt.
    expect('resolvedAt' in patch).toBe(false);
  });

  it('stamps resolvedAt when transitioning to resolved from non-resolved', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'open' }]];
    dbState.updateReturning = [{ id: 1, status: 'resolved' }];
    const tools = registerAll();
    await tools.get('tickets_update')!.handler({ id: 1, status: 'resolved' });
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.status).toBe('resolved');
    expect(patch.resolvedAt).toBeInstanceOf(Date);
  });

  it('does NOT re-stamp resolvedAt when ticket was already resolved', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'resolved' }]];
    dbState.updateReturning = [{ id: 1, status: 'resolved' }];
    const tools = registerAll();
    await tools.get('tickets_update')!.handler({ id: 1, status: 'resolved' });
    const patch = dbState.capturedUpdatePatches[0];
    expect('resolvedAt' in patch).toBe(false);
  });

  it('supports unassign via assignedTo=null', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'open' }]];
    dbState.updateReturning = [{ id: 1 }];
    const tools = registerAll();
    await tools.get('tickets_update')!.handler({ id: 1, assignedTo: null });
    const patch = dbState.capturedUpdatePatches[0];
    expect(patch.assignedTo).toBeNull();
  });

  it('omits unspecified fields from the patch (only updatedAt always present)', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'open' }]];
    dbState.updateReturning = [{ id: 1 }];
    const tools = registerAll();
    await tools.get('tickets_update')!.handler({ id: 1 });
    const patch = dbState.capturedUpdatePatches[0];
    expect(Object.keys(patch).sort()).toEqual(['updatedAt']);
  });

  it('errors when ticket not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('tickets_update')!.handler({ id: 999, status: 'closed' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when scope removed at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTicketsTools(stub as any, ctx);
    ctx.scopes = ['tickets:read'];
    const res = await tools.get('tickets_update')!.handler({ id: 1, status: 'closed' });
    expect(res.isError).toBe(true);
  });
});

// ── tickets_attach_file_from_url ────────────────────────────────────────────

describe('tickets_attach_file_from_url', () => {
  function mockFetchOk(opts: { bodyBytes?: number; contentType?: string; status?: number } = {}) {
    const { bodyBytes = 16, contentType = 'image/png', status = 200 } = opts;
    const buf = Buffer.alloc(bodyBytes, 1);
    globalThis.fetch = vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => (k === 'content-type' ? contentType : null) } as Headers,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    })) as unknown as typeof fetch;
  }

  it('downloads, uploads to S3, posts a message, and stamps the ticket updatedAt', async () => {
    dbState.selectQueue = [[{ id: 7 }]]; // ticket lookup
    dbState.insertReturnings = [[{ id: 99, ticketId: 7, body: 'Attached: file.png' }]];
    mockFetchOk({ bodyBytes: 100, contentType: 'image/png' });
    const tools = registerAll();
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/path/file.png',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(99);
    expect(assertSafeUrlMock).toHaveBeenCalledWith('https://example.com/path/file.png');
    expect(uploadToS3Mock).toHaveBeenCalled();
    const uploadArgs = uploadToS3Mock.mock.calls[0];
    expect(uploadArgs[1]).toBe('file.png');
    expect(uploadArgs[2]).toBe('image/png');
    const msgVals = dbState.capturedInsertValues[0];
    expect(msgVals.ticketId).toBe(7);
    expect(msgVals.body).toBe('Attached: file.png');
    expect(Array.isArray(msgVals.attachments)).toBe(true);
    const updatePatch = dbState.capturedUpdatePatches[0];
    expect(updatePatch.updatedAt).toBeInstanceOf(Date);
  });

  it('uses supplied body and filename overrides when present', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    dbState.insertReturnings = [[{ id: 100 }]];
    mockFetchOk();
    const tools = registerAll();
    await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/raw/asset',
      body: 'Custom message',
      filename: 'override.bin',
    });
    const msgVals = dbState.capturedInsertValues[0];
    expect(msgVals.body).toBe('Custom message');
    const uploadArgs = uploadToS3Mock.mock.calls[0];
    expect(uploadArgs[1]).toBe('override.bin');
  });

  it('falls back to "upload" when URL path has no basename', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    dbState.insertReturnings = [[{ id: 101 }]];
    mockFetchOk();
    const tools = registerAll();
    await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/',
    });
    const uploadArgs = uploadToS3Mock.mock.calls[0];
    expect(uploadArgs[1]).toBe('upload');
  });

  it('defaults content-type to application/octet-stream when header missing', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    dbState.insertReturnings = [[{ id: 102 }]];
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null } as unknown as Headers,
      arrayBuffer: async () => new ArrayBuffer(4),
    })) as unknown as typeof fetch;
    const tools = registerAll();
    await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/file',
    });
    const uploadArgs = uploadToS3Mock.mock.calls[0];
    expect(uploadArgs[2]).toBe('application/octet-stream');
  });

  it('strips content-type charset suffix', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    dbState.insertReturnings = [[{ id: 103 }]];
    mockFetchOk({ contentType: 'text/plain; charset=utf-8' });
    const tools = registerAll();
    await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/file.txt',
    });
    const uploadArgs = uploadToS3Mock.mock.calls[0];
    expect(uploadArgs[2]).toBe('text/plain');
  });

  it('errors when ticket not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 999,
      url: 'https://example.com/x.png',
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('rejects when assertSafeUrl throws (SSRF)', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    assertSafeUrlMock.mockRejectedValueOnce(new Error('blocked host'));
    const tools = registerAll();
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://internal.example.com/x',
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/URL rejected/i);
    expect(out.error).toMatch(/blocked host/);
  });

  it('refuses to follow redirects (3xx response)', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: { get: () => null } as unknown as Headers,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch;
    const tools = registerAll();
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/x',
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/redirect/i);
  });

  it('reports fetch failure when fetch throws', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const tools = registerAll();
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/x',
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/Fetch failed/);
    expect(out.error).toMatch(/network down/);
  });

  it('reports non-OK fetch status', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null } as unknown as Headers,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch;
    const tools = registerAll();
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/x',
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/Fetch returned 404/);
  });

  it('rejects files over the 25 MB cap', async () => {
    dbState.selectQueue = [[{ id: 7 }]];
    const huge = new ArrayBuffer(26 * 1024 * 1024);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/octet-stream' } as unknown as Headers,
      arrayBuffer: async () => huge,
    })) as unknown as typeof fetch;
    const tools = registerAll();
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 7,
      url: 'https://example.com/big.bin',
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/too large/i);
  });

  it('denies when scope removed at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTicketsTools(stub as any, ctx);
    ctx.scopes = ['tickets:read'];
    const res = await tools.get('tickets_attach_file_from_url')!.handler({
      ticketId: 1,
      url: 'https://example.com/x',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
