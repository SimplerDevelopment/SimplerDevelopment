// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/sprints.ts.
 *
 * The module exports a single function — `registerSprintsTools(server, ctx)` —
 * which registers four MCP tools (sprints_list, sprints_create, sprints_update,
 * sprints_delete), each gated by a projects:read / projects:write scope.
 *
 * Strategy mirrors mcp-tools-bookings.test.ts: stub `db`, mock schema +
 * drizzle helpers, mock auth/service collaborators, and pass in a fake
 * McpServer that captures `{ name -> handler }` so each handler can be invoked
 * directly. Tests cover happy paths plus scope-denial / not-found branches and
 * the date-coercion + order-append logic.
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
  deleteCalls: number;
} = {
  insertReturning: [],
  selectQueue: [],
  selectDefault: [],
  updateReturning: [],
  capturedInsertValues: null,
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
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        dbState.deleteCalls += 1;
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
    sprints: make('id', 'projectId', 'status', 'order', 'name', 'goal', 'startDate', 'endDate', 'updatedAt'),
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

// Transitive imports that sprints.ts pulls through but does not call.
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

import { registerSprintsTools } from '@/lib/mcp/tools/sprints';

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
  registerSprintsTools(stub as any, ctxFor(scopes));
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
  dbState.deleteCalls = 0;
});

describe('registerSprintsTools — tool registration', () => {
  it('registers all four sprint tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'sprints_list',
      'sprints_create',
      'sprints_update',
      'sprints_delete',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only the list tool when scopes=projects:read', () => {
    const tools = registerAll(['projects:read']);
    expect(tools.has('sprints_list')).toBe(true);
    expect(tools.has('sprints_create')).toBe(false);
    expect(tools.has('sprints_update')).toBe(false);
    expect(tools.has('sprints_delete')).toBe(false);
  });

  it('registers only write tools when scopes=projects:write', () => {
    const tools = registerAll(['projects:write']);
    expect(tools.has('sprints_list')).toBe(false);
    expect(tools.has('sprints_create')).toBe(true);
    expect(tools.has('sprints_update')).toBe(true);
    expect(tools.has('sprints_delete')).toBe(true);
  });

  it('registers nothing when ctx has no projects scopes', () => {
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

// ── sprints_list ────────────────────────────────────────────────────────────

describe('sprints_list', () => {
  it('returns sprint rows for an owned project', async () => {
    // first select = project lookup; second select = sprint rows
    dbState.selectQueue = [
      [{ id: 7 }],
      [{ id: 1, name: 'Sprint 1', status: 'planning' }, { id: 2, name: 'Sprint 2', status: 'active' }],
    ];
    const tools = registerAll();
    const res = await tools.get('sprints_list')!.handler({ projectId: 7 });
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Sprint 1' });
  });

  it('filters by status when provided', async () => {
    dbState.selectQueue = [
      [{ id: 7 }],
      [{ id: 2, name: 'Active Sprint', status: 'active' }],
    ];
    const tools = registerAll();
    const res = await tools.get('sprints_list')!.handler({ projectId: 7, status: 'active' });
    const out = parseJson(res) as Row[];
    expect(out[0].status).toBe('active');
  });

  it('returns "Project not found" envelope when the project lookup misses', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sprints_list')!.handler({ projectId: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when ctx loses projects:read at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSprintsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('sprints_list')!.handler({ projectId: 7 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── sprints_create ──────────────────────────────────────────────────────────

describe('sprints_create', () => {
  it('creates a sprint, defaulting status to planning and order to existing length', async () => {
    // selects: 1) project lookup, 2) existing sprints (length determines order)
    dbState.selectQueue = [
      [{ id: 7 }],
      [{ id: 1 }, { id: 2 }, { id: 3 }],
    ];
    dbState.insertReturning = [{ id: 50, name: 'Sprint 4', status: 'planning', order: 3 }];
    const tools = registerAll();
    const res = await tools.get('sprints_create')!.handler({
      projectId: 7,
      name: '  Sprint 4  ',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(50);
    const vals = dbState.capturedInsertValues!;
    expect(vals.projectId).toBe(7);
    expect(vals.name).toBe('Sprint 4'); // trimmed
    expect(vals.goal).toBeNull();
    expect(vals.startDate).toBeNull();
    expect(vals.endDate).toBeNull();
    expect(vals.status).toBe('planning');
    expect(vals.order).toBe(3); // length of existing
  });

  it('coerces ISO date strings to Date instances + honors explicit order/status/goal', async () => {
    dbState.selectQueue = [
      [{ id: 7 }],
      [],
    ];
    dbState.insertReturning = [{ id: 60 }];
    const tools = registerAll();
    await tools.get('sprints_create')!.handler({
      projectId: 7,
      name: 'Kickoff',
      goal: 'Land MVP',
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-06-14T00:00:00Z',
      status: 'active',
      order: 99,
    });
    const vals = dbState.capturedInsertValues!;
    expect(vals.goal).toBe('Land MVP');
    expect(vals.startDate).toBeInstanceOf(Date);
    expect(vals.endDate).toBeInstanceOf(Date);
    expect(vals.status).toBe('active');
    expect(vals.order).toBe(99);
  });

  it('returns not-found when project lookup misses', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sprints_create')!.handler({ projectId: 999, name: 'Nope' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
    expect(dbState.capturedInsertValues).toBeNull();
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSprintsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('sprints_create')!.handler({ projectId: 7, name: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── sprints_update ──────────────────────────────────────────────────────────

describe('sprints_update', () => {
  it('updates simple fields and stamps updatedAt; ignores undefined patch keys', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 7 }],
    ];
    dbState.updateReturning = [{ id: 5, name: 'Renamed' }];
    const tools = registerAll();
    const res = await tools.get('sprints_update')!.handler({
      id: 5,
      name: 'Renamed',
      status: 'active',
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(5);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.name).toBe('Renamed');
    expect(patch.status).toBe('active');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    // Not provided → must not be in patch.
    expect('goal' in patch).toBe(false);
    expect('order' in patch).toBe(false);
  });

  it('coerces startDate/endDate ISO strings to Dates', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 7 }],
    ];
    dbState.updateReturning = [{ id: 5 }];
    const tools = registerAll();
    await tools.get('sprints_update')!.handler({
      id: 5,
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-06-14T00:00:00Z',
    });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.startDate).toBeInstanceOf(Date);
    expect(patch.endDate).toBeInstanceOf(Date);
  });

  it('clears dates to null when explicitly passed null', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 7 }],
    ];
    dbState.updateReturning = [{ id: 5 }];
    const tools = registerAll();
    await tools.get('sprints_update')!.handler({
      id: 5,
      startDate: null,
      endDate: null,
    });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.startDate).toBeNull();
    expect(patch.endDate).toBeNull();
  });

  it('passes through nullable goal', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 7 }],
    ];
    dbState.updateReturning = [{ id: 5 }];
    const tools = registerAll();
    await tools.get('sprints_update')!.handler({ id: 5, goal: null });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.goal).toBeNull();
  });

  it('returns not-found when the sprint join misses (wrong client)', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sprints_update')!.handler({ id: 999, name: 'X' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
    expect(dbState.capturedUpdatePatch).toBeNull();
  });

  it('denies when caller lacks projects:write', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSprintsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('sprints_update')!.handler({ id: 5 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── sprints_delete ──────────────────────────────────────────────────────────

describe('sprints_delete', () => {
  it('deletes a sprint owned by the client', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
    ];
    const tools = registerAll();
    const res = await tools.get('sprints_delete')!.handler({ id: 5 });
    const out = parseJson(res) as { deleted: boolean; id: number };
    expect(out.deleted).toBe(true);
    expect(out.id).toBe(5);
    expect(dbState.deleteCalls).toBe(1);
  });

  it('returns not-found when the sprint is missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sprints_delete')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
    expect(dbState.deleteCalls).toBe(0);
  });

  it('denies when caller lacks projects:write', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSprintsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('sprints_delete')!.handler({ id: 5 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
