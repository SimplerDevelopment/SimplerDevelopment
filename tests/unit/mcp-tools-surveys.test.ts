// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/surveys.ts.
 *
 * The module exports `registerSurveysTools(server, ctx)` which registers five
 * MCP tools — `surveys_list`, `surveys_get`, `surveys_list_responses`,
 * `surveys_create`, `surveys_update` — each gated by `surveys:read` or
 * `surveys:write` scopes. Write tools are additionally gated by
 * `requireService(clientId, 'surveys')`.
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
  insertReturning: Row[];
  selectQueue: Row[][];
  selectDefault: Row[];
  updateReturning: Row[];
  capturedInsertValues: Row | null;
  capturedUpdatePatch: Row | null;
  insertCalls: Row[];
} = {
  insertReturning: [],
  selectQueue: [],
  selectDefault: [],
  updateReturning: [],
  capturedInsertValues: null,
  capturedUpdatePatch: null,
  insertCalls: [],
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
        dbState.insertCalls.push(vals);
        return {
          returning: vi.fn(async () => dbState.insertReturning),
          onConflictDoNothing: vi.fn(async () => undefined),
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

// schema objects — opaque column-like refs are fine.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return new Proxy({
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
    surveys: make(
      'id', 'clientId', 'title', 'slug', 'description', 'status',
      'responseCount', 'closesAt', 'createdAt', 'updatedAt', 'fields',
      'thankYouTitle', 'thankYouMessage', 'requireEmail', 'allowMultiple',
      'createdBy', 'maxResponses',
    ),
    surveyResponses: make('id', 'surveyId', 'createdAt'),
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
    mcpApprovalLinks: make('id', 'token', 'entityType', 'entityId', 'summary', 'status', 'clientId', 'createdBy', 'expiresAt'),
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

// portal-auth — control service access per-test.
const hasServiceAccessMock = vi.fn(async () => true);
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: (...args: unknown[]) => hasServiceAccessMock(...args),
}));

// Stubs for revalidatePath (called inside revalidateForWrite).
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// Transitive imports pulled in by surveys.ts — keep mocks minimal.
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

import { registerSurveysTools } from '@/lib/mcp/tools/surveys';

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
  registerSurveysTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Default to [{ id: 1 }] so createApprovalLink (called by surveys_create and
  // surveys_update via db.insert(mcpApprovalLinks).returning()) can read row.id.
  // Tests that check a specific returning row override this themselves.
  dbState.insertReturning = [{ id: 1 }];
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.updateReturning = [];
  dbState.capturedInsertValues = null;
  dbState.capturedUpdatePatch = null;
  dbState.insertCalls = [];
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

describe('registerSurveysTools — tool registration', () => {
  it('registers all five canonical survey tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'surveys_list',
      'surveys_get',
      'surveys_list_responses',
      'surveys_create',
      'surveys_update',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only read tools when scopes=surveys:read', () => {
    const tools = registerAll(['surveys:read']);
    expect(tools.has('surveys_list')).toBe(true);
    expect(tools.has('surveys_get')).toBe(true);
    expect(tools.has('surveys_list_responses')).toBe(true);
    expect(tools.has('surveys_create')).toBe(false);
    expect(tools.has('surveys_update')).toBe(false);
  });

  it('registers only write tools when scopes=surveys:write', () => {
    const tools = registerAll(['surveys:write']);
    expect(tools.has('surveys_create')).toBe(true);
    expect(tools.has('surveys_update')).toBe(true);
    expect(tools.has('surveys_list')).toBe(false);
  });

  it('registers nothing when ctx has no surveys scopes', () => {
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

// ── surveys_list ────────────────────────────────────────────────────────────

describe('surveys_list', () => {
  it('returns the list when scope is granted', async () => {
    dbState.selectDefault = [{ id: 1, title: 'Lead Intake', slug: 'lead-intake' }];
    const tools = registerAll();
    const res = await tools.get('surveys_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out[0].title).toBe('Lead Intake');
  });

  it('filters by status when supplied', async () => {
    dbState.selectDefault = [{ id: 2, status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('surveys_list')!.handler({ status: 'active', limit: 25 });
    const out = parseJson(res) as Row[];
    expect(out[0].status).toBe('active');
  });

  it('uses default limit when none supplied', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('surveys_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when ctx lacks surveys:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSurveysTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('surveys_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── surveys_get ─────────────────────────────────────────────────────────────

describe('surveys_get', () => {
  it('returns the survey when found', async () => {
    dbState.selectDefault = [{ id: 4, title: 'NPS', fields: [] }];
    const tools = registerAll();
    const res = await tools.get('surveys_get')!.handler({ id: 4 });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(4);
    expect(out.title).toBe('NPS');
  });

  it('returns an error envelope when the survey is missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('surveys_get')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when ctx lacks surveys:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSurveysTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('surveys_get')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
  });
});

// ── surveys_list_responses ──────────────────────────────────────────────────

describe('surveys_list_responses', () => {
  it('lists responses when survey exists', async () => {
    dbState.selectQueue = [
      [{ id: 7 }], // survey existence check
      [{ id: 1, surveyId: 7, answers: { a: 1 } }], // responses query
    ];
    const tools = registerAll();
    const res = await tools.get('surveys_list_responses')!.handler({
      surveyId: 7,
      limit: 50,
    });
    const out = parseJson(res) as Row[];
    expect(out[0].surveyId).toBe(7);
  });

  it('applies since filter when supplied', async () => {
    dbState.selectQueue = [
      [{ id: 7 }],
      [{ id: 2 }],
    ];
    const tools = registerAll();
    const res = await tools.get('surveys_list_responses')!.handler({
      surveyId: 7,
      since: '2026-01-01T00:00:00Z',
    });
    expect((parseJson(res) as Row[])[0].id).toBe(2);
  });

  it('returns not-found when survey is missing', async () => {
    dbState.selectQueue = [[]]; // survey existence check returns empty
    const tools = registerAll();
    const res = await tools.get('surveys_list_responses')!.handler({ surveyId: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('uses default limit when none supplied', async () => {
    dbState.selectQueue = [[{ id: 7 }], []];
    const tools = registerAll();
    const res = await tools.get('surveys_list_responses')!.handler({ surveyId: 7 });
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when ctx lacks surveys:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSurveysTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('surveys_list_responses')!.handler({ surveyId: 1 });
    expect(res.isError).toBe(true);
  });
});

// ── surveys_create ──────────────────────────────────────────────────────────

describe('surveys_create', () => {
  it('creates a survey with a slug derived from the title plus a timestamp suffix', async () => {
    dbState.insertReturning = [{ id: 100, title: 'Lead Intake Form' }];
    const tools = registerAll();
    const res = await tools.get('surveys_create')!.handler({
      title: '  Lead Intake Form!  ',
      description: '  for new prospects  ',
      fields: [{ id: 'f1', type: 'text', label: 'Name', required: true, order: 0 }],
      thankYouTitle: 'Thanks!',
      thankYouMessage: 'Got it.',
      requireEmail: true,
      allowMultiple: false,
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(100);
    // insertCalls[0] = survey row; insertCalls[1] = mcpApprovalLinks row.
    // Use [0] so the approval-link insert does not overwrite our assertion target.
    const vals = dbState.insertCalls[0]!;
    expect(vals.clientId).toBe(1);
    expect(vals.title).toBe('Lead Intake Form!');
    // baseSlug normalizes punctuation+spaces; suffix is base36 of Date.now()
    expect((vals.slug as string)).toMatch(/^lead-intake-form-[a-z0-9]+$/);
    expect(vals.description).toBe('for new prospects');
    expect(Array.isArray(vals.fields)).toBe(true);
    expect(vals.thankYouTitle).toBe('Thanks!');
    expect(vals.thankYouMessage).toBe('Got it.');
    expect(vals.requireEmail).toBe(true);
    expect(vals.allowMultiple).toBe(false);
    expect(vals.createdBy).toBe(11);
  });

  it('defaults description to null and fields to [] when omitted', async () => {
    dbState.insertReturning = [{ id: 101 }];
    const tools = registerAll();
    await tools.get('surveys_create')!.handler({ title: 'Quick Poll' });
    // insertCalls[0] = survey row; [1] = mcpApprovalLinks. Use [0].
    const vals = dbState.insertCalls[0]!;
    expect(vals.description).toBeNull();
    expect(vals.fields).toEqual([]);
    expect(vals.requireEmail).toBe(false);
    expect(vals.allowMultiple).toBe(true);
  });

  it('returns serviceDenied when client lacks surveys subscription', async () => {
    hasServiceAccessMock.mockResolvedValueOnce(false);
    const tools = registerAll();
    const res = await tools.get('surveys_create')!.handler({ title: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/surveys subscription/i);
  });

  it('returns scope denial when caller lacks surveys:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSurveysTools(stub as any, ctx);
    ctx.scopes = ['surveys:read'];
    const res = await tools.get('surveys_create')!.handler({ title: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── surveys_update ──────────────────────────────────────────────────────────

describe('surveys_update', () => {
  it('updates simple fields and ignores undefined patch keys', async () => {
    dbState.selectDefault = [{ id: 5 }];
    dbState.updateReturning = [{ id: 5, title: 'Renamed' }];
    const tools = registerAll();
    const res = await tools.get('surveys_update')!.handler({
      id: 5,
      title: 'Renamed',
      status: 'active',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(5);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.title).toBe('Renamed');
    expect(patch.status).toBe('active');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect('fields' in patch).toBe(false);
    expect('closesAt' in patch).toBe(false);
  });

  it('coerces closesAt ISO string to Date and supports null clears', async () => {
    dbState.selectDefault = [{ id: 5 }];
    dbState.updateReturning = [{ id: 5 }];
    const tools = registerAll();
    await tools.get('surveys_update')!.handler({
      id: 5,
      closesAt: '2026-12-31T23:59:59Z',
    });
    let patch = dbState.capturedUpdatePatch!;
    expect(patch.closesAt).toBeInstanceOf(Date);

    dbState.selectDefault = [{ id: 5 }];
    dbState.updateReturning = [{ id: 5 }];
    await tools.get('surveys_update')!.handler({ id: 5, closesAt: null });
    patch = dbState.capturedUpdatePatch!;
    expect(patch.closesAt).toBeNull();
  });

  it('writes fields when supplied', async () => {
    dbState.selectDefault = [{ id: 5 }];
    dbState.updateReturning = [{ id: 5 }];
    const tools = registerAll();
    await tools.get('surveys_update')!.handler({
      id: 5,
      fields: [{ id: 'a', type: 'text', label: 'A', required: false, order: 0 }],
    });
    const patch = dbState.capturedUpdatePatch!;
    expect(Array.isArray(patch.fields)).toBe(true);
    expect((patch.fields as unknown[]).length).toBe(1);
  });

  it('returns not-found when survey missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('surveys_update')!.handler({ id: 999, title: 'X' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('returns serviceDenied when client lacks surveys subscription', async () => {
    hasServiceAccessMock.mockResolvedValueOnce(false);
    const tools = registerAll();
    const res = await tools.get('surveys_update')!.handler({ id: 1, title: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/surveys subscription/i);
  });

  it('returns scope denial when caller lacks surveys:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSurveysTools(stub as any, ctx);
    ctx.scopes = ['surveys:read'];
    const res = await tools.get('surveys_update')!.handler({ id: 1, title: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
