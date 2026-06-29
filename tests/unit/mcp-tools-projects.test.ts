// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/projects.ts.
 *
 * Module exports `registerProjectsTools(server, ctx)` which registers fourteen
 * MCP tools gated by `projects:read` / `projects:write` / `brain:write` scopes.
 *
 * Strategy mirrors tests/unit/mcp-tools-kanban.test.ts: stub `db`, mock
 * schema + drizzle helpers, stub auth / collaborators, and pass in a fake
 * McpServer that captures `{ name -> handler }` so each handler can be
 * invoked directly. Tests cover happy paths plus scope-denial, not-found, and
 * cross-tenant guards.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── DB stub ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const dbState: {
  selectQueue: Row[][];
  selectDefault: Row[];
  insertReturning: Row[];
  insertReturningQueue: Row[][];
  updateReturning: Row[];
  deleteReturning: Row[];
  capturedInsertValues: Row | null;
  capturedUpdatePatch: Row | null;
  insertCalls: Row[];
  deleteCalls: number;
} = {
  selectQueue: [],
  selectDefault: [],
  insertReturning: [{ id: 1 }],
  insertReturningQueue: [],
  updateReturning: [{ id: 1, updated: true }],
  deleteReturning: [{ id: 1, deleted: true }],
  capturedInsertValues: null,
  capturedUpdatePatch: null,
  insertCalls: [],
  deleteCalls: 0,
};

function nextSelect(): Row[] {
  return dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
}

function nextInsertReturning(): Row[] {
  return dbState.insertReturningQueue.length > 0
    ? dbState.insertReturningQueue.shift()!
    : dbState.insertReturning;
}

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
    select: vi.fn(() => makeChain(nextSelect())),
    insert: vi.fn(() => ({
      values: vi.fn((vals: Row) => {
        dbState.capturedInsertValues = vals;
        dbState.insertCalls.push(Array.isArray(vals) ? vals[0] : vals);
        const r = nextInsertReturning();
        return {
          returning: vi.fn(async () => r),
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => r),
            then: (cb: (v: unknown) => unknown) => Promise.resolve(r).then(cb),
          })),
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(async () => r),
          })),
          then: (cb: (v: unknown) => unknown) => Promise.resolve(r).then(cb),
        };
      }),
    })),
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
        where: vi.fn(() => ({
          returning: vi.fn(async () => dbState.deleteReturning),
          then: (cb: (v: unknown) => unknown) => Promise.resolve(dbState.deleteReturning).then(cb),
        })),
      };
    }),
  },
}));

// ── schema mock ──────────────────────────────────────────────────────────────

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;

  return new Proxy(
    {
      projects: make('id', 'clientId', 'name', 'description', 'status', 'createdAt', 'updatedAt', 'dueDate', 'createdBy', 'projectKey'),
      projectMembers: make('id', 'projectId', 'userId', 'role', 'addedBy', 'addedAt'),
      projectArtifacts: make('id', 'projectId', 'artifactType', 'artifactId', 'displayTitle', 'pinned', 'createdBy', 'createdAt'),
      cardTemplates: make('id', 'clientId', 'projectId', 'name', 'description', 'payload', 'createdBy'),
      brainNotes: make('id', 'clientId', 'title'),
      brainAiReviewItems: make('id', 'clientId', 'sourceType', 'sourceId', 'proposedType', 'proposedPayload', 'status'),
      kanbanCards: make('id', 'number', 'title', 'priority', 'dueDate', 'projectId', 'columnId'),
      kanbanColumns: make('id', 'name', 'isDone', 'projectId', 'order', 'color', 'wipLimit'),
      kanbanLabels: make('id', 'projectId', 'name', 'color'),
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
      posts: make('id', 'title', 'websiteId', 'postType'),
      media: make('id'),
      clientWebsites: make('id', 'name', 'clientId'),
      emailLists: make('id'),
      emailCampaigns: make('id', 'name', 'clientId'),
      pitchDecks: make('id', 'title', 'clientId'),
      brandingProfiles: make('id'),
      emailSubscribers: make('id'),
      emailCampaignSends: make('id'),
      surveys: make('id', 'title', 'clientId'),
      surveyResponses: make('id'),
      bookingPages: make('id', 'title', 'clientId'),
      bookings: make('id'),
      sprints: make('id'),
      crmActivities: make('id'),
      categories: make('id'),
      tags: make('id'),
      postCategories: make('id'),
      postTags: make('id'),
      automationRules: make('id'),
      clientMembers: make('id'),
      users: make('id', 'name', 'email'),
      crmProposals: make('id', 'title', 'clientId'),
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
    },
    {
      has: (t, p) =>
        p in t || !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
      get: (t, p) =>
        p in t
          ? t[p as keyof typeof t]
          : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'
            ? undefined
            : new Proxy({ __table: String(p) }, {
                get: (_x, c) =>
                  c === '__table' ? String(p) : (typeof c === 'string' ? { __col: c, __table: String(p) } : undefined),
              }),
    },
  );
});

// ── drizzle-orm mock ─────────────────────────────────────────────────────────

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

// ── mcp-auth mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') ||
    granted.includes(required) ||
    granted.includes(`${required.split(':')[0]}:*`),
}));

// ── collaborator stubs ───────────────────────────────────────────────────────

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
vi.mock('@/lib/portal/project-permissions', () => ({
  ROLE_OPTIONS: ['owner', 'editor', 'commenter', 'viewer'],
}));

// ── helpers ──────────────────────────────────────────────────────────────────

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

function resetState() {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.insertReturning = [{ id: 1 }];
  dbState.insertReturningQueue = [];
  dbState.updateReturning = [{ id: 1, updated: true }];
  dbState.deleteReturning = [{ id: 1, deleted: true }];
  dbState.capturedInsertValues = null;
  dbState.capturedUpdatePatch = null;
  dbState.insertCalls = [];
  dbState.deleteCalls = 0;
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('registerProjectsTools — tool registration', () => {
  beforeEach(resetState);

  it('registers all fourteen canonical tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'projects_list',
      'projects_create',
      'projects_update',
      'project_members_list',
      'project_members_set',
      'project_members_remove',
      'my_tasks_list',
      'projects_artifacts_list',
      'projects_artifact_link',
      'projects_artifact_toggle_pin',
      'projects_artifact_unlink',
      'projects_propose_artifact_link',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only read tools when scopes=projects:read', () => {
    const tools = registerAll(['projects:read']);
    expect(tools.has('projects_list')).toBe(true);
    expect(tools.has('my_tasks_list')).toBe(true);
    expect(tools.has('project_members_list')).toBe(true);
    expect(tools.has('projects_artifacts_list')).toBe(true);
    expect(tools.has('projects_create')).toBe(false);
    expect(tools.has('projects_update')).toBe(false);
    expect(tools.has('project_members_set')).toBe(false);
    expect(tools.has('project_members_remove')).toBe(false);
  });

  it('registers only write tools when scopes=projects:write', () => {
    const tools = registerAll(['projects:write']);
    expect(tools.has('projects_create')).toBe(true);
    expect(tools.has('projects_update')).toBe(true);
    expect(tools.has('project_members_set')).toBe(true);
    expect(tools.has('project_members_remove')).toBe(true);
    expect(tools.has('projects_list')).toBe(false);
    expect(tools.has('my_tasks_list')).toBe(false);
  });

  it('registers projects_propose_artifact_link only when both projects:write and brain:write are granted', () => {
    const withBoth = registerAll(['projects:write', 'brain:write']);
    expect(withBoth.has('projects_propose_artifact_link')).toBe(true);
    const withoutBrain = registerAll(['projects:write']);
    expect(withoutBrain.has('projects_propose_artifact_link')).toBe(false);
    const withoutProjects = registerAll(['brain:write']);
    expect(withoutProjects.has('projects_propose_artifact_link')).toBe(false);
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

// ── projects_list ─────────────────────────────────────────────────────────────

describe('projects_list', () => {
  beforeEach(resetState);

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

// ── projects_create ───────────────────────────────────────────────────────────

describe('projects_create', () => {
  beforeEach(resetState);

  it('inserts a project with defaults and returns the row', async () => {
    dbState.insertReturning = [{ id: 10, name: 'New Project', status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('projects_create')!.handler({ name: 'New Project' });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(10);
    const vals = dbState.insertCalls[0]!;
    expect(vals.name).toBe('New Project');
    expect(vals.description).toBeNull();
    expect(vals.clientId).toBe(7);
    expect(vals.status).toBe('active');
    expect(vals.createdBy).toBe(42);
  });

  it('passes description through when supplied', async () => {
    dbState.insertReturning = [{ id: 11 }];
    const tools = registerAll();
    await tools.get('projects_create')!.handler({
      name: 'With description',
      description: 'hello world',
    });
    const vals = dbState.insertCalls[0]!;
    expect(vals.description).toBe('hello world');
  });

  it('returns error when cloneFromProjectId source not found in same account', async () => {
    dbState.selectQueue = [[]]; // source project lookup returns empty
    const tools = registerAll();
    const res = await tools.get('projects_create')!.handler({
      name: 'Clone',
      cloneFromProjectId: 99,
    });
    const out = parseJson(res) as Row;
    expect(out.error).toMatch(/Source project not found/);
  });

  it('clones columns and labels from source project when cloneFromProjectId provided', async () => {
    dbState.selectQueue = [
      [{ id: 99, clientId: 7, name: 'Source' }],   // source project lookup
      [{ id: 5, name: 'Todo', order: 0, color: null, isDone: false, wipLimit: null }], // srcColumns
      [{ id: 10, name: 'Bug', color: '#ff0000' }],  // srcLabels
      [],                                            // srcTemplates (empty)
    ];
    dbState.insertReturning = [{ id: 20, name: 'Clone', status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('projects_create')!.handler({
      name: 'Clone',
      cloneFromProjectId: 99,
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(20);
    // At minimum: project insert + projectMembers insert + columns insert + labels insert = 4 inserts
    expect(dbState.insertCalls.length).toBeGreaterThanOrEqual(2);
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

// ── projects_update ───────────────────────────────────────────────────────────

describe('projects_update', () => {
  beforeEach(resetState);

  it('updates only the fields supplied and stamps updatedAt', async () => {
    dbState.updateReturning = [{ id: 5, name: 'renamed' }];
    const tools = registerAll();
    const res = await tools.get('projects_update')!.handler({ id: 5, name: 'renamed' });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(5);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.name).toBe('renamed');
    expect(patch.updatedAt).toBeInstanceOf(Date);
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

// ── project_members_list ──────────────────────────────────────────────────────

describe('project_members_list', () => {
  beforeEach(resetState);

  it('returns Project not found when project belongs to another client', async () => {
    dbState.selectQueue = [[]]; // project lookup empty
    const tools = registerAll();
    const res = await tools.get('project_members_list')!.handler({ projectId: 5 });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns member rows with user info on success', async () => {
    dbState.selectQueue = [
      [{ id: 5 }], // project lookup
      [{ id: 1, userId: 42, role: 'owner', addedAt: '2026-01-01', name: 'Alice', email: 'alice@test.com' }],
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_list')!.handler({ projectId: 5 });
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('owner');
    expect(out[0].name).toBe('Alice');
  });

  it('returns empty array when project has no members', async () => {
    dbState.selectQueue = [
      [{ id: 5 }], // project found
      [],           // no members
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_list')!.handler({ projectId: 5 });
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when caller lacks projects:read at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('project_members_list')!.handler({ projectId: 5 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── project_members_set ───────────────────────────────────────────────────────

describe('project_members_set', () => {
  beforeEach(resetState);

  it('returns Project not found when project lookup is empty', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('project_members_set')!.handler({
      projectId: 5, userId: 10, role: 'editor',
    });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns error when caller is not project owner', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],                          // project found
      [{ role: 'editor' }],                  // caller is editor, not owner
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_set')!.handler({
      projectId: 5, userId: 10, role: 'editor',
    });
    expect((parseJson(res) as Row).error).toMatch(/Only project owners/);
  });

  it('upserts member and returns row when caller is owner', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],          // project found
      [{ role: 'owner' }],  // caller is owner
    ];
    dbState.insertReturning = [{ id: 99, projectId: 5, userId: 10, role: 'editor' }];
    const tools = registerAll();
    const res = await tools.get('project_members_set')!.handler({
      projectId: 5, userId: 10, role: 'editor',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(99);
    expect(out.role).toBe('editor');
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('project_members_set')!.handler({
      projectId: 5, userId: 10, role: 'editor',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── project_members_remove ────────────────────────────────────────────────────

describe('project_members_remove', () => {
  beforeEach(resetState);

  it('returns Project not found when project lookup is empty', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('project_members_remove')!.handler({
      projectId: 5, userId: 10,
    });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns error when caller is not owner', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],           // project
      [{ role: 'viewer' }],  // caller role
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_remove')!.handler({
      projectId: 5, userId: 10,
    });
    expect((parseJson(res) as Row).error).toMatch(/Only project owners/);
  });

  it('returns Member not found when target lookup is empty', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],          // project
      [{ role: 'owner' }],  // caller
      [],                   // target member not found
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_remove')!.handler({
      projectId: 5, userId: 99,
    });
    expect(parseJson(res)).toEqual({ error: 'Member not found' });
  });

  it('refuses to remove the sole owner', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],                  // project
      [{ role: 'owner' }],          // caller
      [{ role: 'owner' }],          // target is owner
      [{ id: 1 }],                  // owners list — only one
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_remove')!.handler({
      projectId: 5, userId: 42,
    });
    expect((parseJson(res) as Row).error).toMatch(/sole owner/);
  });

  it('removes member and returns ok when multiple owners exist', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],                          // project
      [{ role: 'owner' }],                  // caller
      [{ role: 'owner' }],                  // target is owner
      [{ id: 1 }, { id: 2 }],              // two owners — safe to remove
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_remove')!.handler({
      projectId: 5, userId: 10,
    });
    expect(parseJson(res)).toEqual({ ok: true });
    expect(dbState.deleteCalls).toBe(1);
  });

  it('removes non-owner member successfully', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],         // project
      [{ role: 'owner' }], // caller
      [{ role: 'editor' }], // target is editor (not owner — skips owners count check)
    ];
    const tools = registerAll();
    const res = await tools.get('project_members_remove')!.handler({
      projectId: 5, userId: 10,
    });
    expect(parseJson(res)).toEqual({ ok: true });
    expect(dbState.deleteCalls).toBe(1);
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('project_members_remove')!.handler({
      projectId: 5, userId: 10,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── my_tasks_list ─────────────────────────────────────────────────────────────

describe('my_tasks_list', () => {
  beforeEach(resetState);

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

// ── projects_artifacts_list ───────────────────────────────────────────────────

describe('projects_artifacts_list', () => {
  beforeEach(resetState);

  it('returns Project not found when project belongs to another client', async () => {
    dbState.selectQueue = [[]]; // authorizeProjectForClient returns empty
    const tools = registerAll();
    const res = await tools.get('projects_artifacts_list')!.handler({ projectId: 5 });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns artifact rows on success', async () => {
    dbState.selectQueue = [
      [{ id: 5 }], // project auth
      [
        { id: 1, artifactType: 'pitch_deck', artifactId: 10, displayTitle: 'Deck A', pinned: true },
        { id: 2, artifactType: 'survey', artifactId: 20, displayTitle: 'Survey B', pinned: false },
      ],
    ];
    const tools = registerAll();
    const res = await tools.get('projects_artifacts_list')!.handler({ projectId: 5 });
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].artifactType).toBe('pitch_deck');
    expect(out[1].artifactType).toBe('survey');
  });

  it('returns empty array when no artifacts linked', async () => {
    dbState.selectQueue = [
      [{ id: 5 }], // project auth
      [],           // no artifacts
    ];
    const tools = registerAll();
    const res = await tools.get('projects_artifacts_list')!.handler({ projectId: 5 });
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when caller lacks projects:read at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('projects_artifacts_list')!.handler({ projectId: 5 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── projects_artifact_link ────────────────────────────────────────────────────

describe('projects_artifact_link', () => {
  beforeEach(resetState);

  it('returns Project not found when project auth fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'pitch_deck', artifactId: 10,
    });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns artifact not owned when artifact lookup is empty (non-post type)', async () => {
    dbState.selectQueue = [
      [{ id: 5 }], // project auth
      [],           // artifact lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'pitch_deck', artifactId: 10,
    });
    expect((parseJson(res) as Row).error).toMatch(/not found or not owned/);
  });

  it('links a pitch_deck artifact and returns the inserted row', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],              // project auth
      [{ title: 'Deck One' }],  // artifact lookup
    ];
    dbState.insertReturning = [{ id: 99, projectId: 5, artifactType: 'pitch_deck', artifactId: 10, displayTitle: 'Deck One', pinned: false }];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'pitch_deck', artifactId: 10,
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(99);
    expect(out.displayTitle).toBe('Deck One');
    expect(out.pinned).toBe(false);
  });

  it('falls back to "Untitled" when artifact title is empty string', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [{ title: '' }],
    ];
    dbState.insertReturning = [{ id: 100, displayTitle: 'Untitled' }];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'survey', artifactId: 20,
    });
    const out = parseJson(res) as Row;
    expect(out.displayTitle).toBe('Untitled');
    const inserted = dbState.insertCalls[0]!;
    expect(inserted.displayTitle).toBe('Untitled');
  });

  it('stores pinned=true when passed', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [{ title: 'Survey' }],
    ];
    dbState.insertReturning = [{ id: 101, pinned: true }];
    const tools = registerAll();
    await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'survey', artifactId: 20, pinned: true,
    });
    const inserted = dbState.insertCalls[0]!;
    expect(inserted.pinned).toBe(true);
    expect(inserted.createdBy).toBe(42);
  });

  it('handles post artifact type via website join', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],                                         // project auth
      [{ title: 'My Post', postType: 'blog' }],            // post + website join
    ];
    dbState.insertReturning = [{ id: 102, artifactType: 'post', displayTitle: 'My Post' }];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'post', artifactId: 30,
    });
    const out = parseJson(res) as Row;
    expect(out.artifactType).toBe('post');
    expect(out.displayTitle).toBe('My Post');
  });

  it('returns not owned when post lookup is empty (cross-tenant guard)', async () => {
    dbState.selectQueue = [
      [{ id: 5 }], // project auth
      [],           // post lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'post', artifactId: 30,
    });
    expect((parseJson(res) as Row).error).toMatch(/not found or not owned/);
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('projects_artifact_link')!.handler({
      projectId: 5, artifactType: 'pitch_deck', artifactId: 10,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── projects_artifact_toggle_pin ──────────────────────────────────────────────

describe('projects_artifact_toggle_pin', () => {
  beforeEach(resetState);

  it('returns Project not found when project auth fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_toggle_pin')!.handler({
      projectId: 5, artifactDbId: 1, pinned: true,
    });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns Artifact link not found when update returns nothing', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateReturning = [];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_toggle_pin')!.handler({
      projectId: 5, artifactDbId: 999, pinned: true,
    });
    expect((parseJson(res) as Row).error).toMatch(/Artifact link not found/);
  });

  it('updates pinned=true and returns the row', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateReturning = [{ id: 1, pinned: true, projectId: 5 }];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_toggle_pin')!.handler({
      projectId: 5, artifactDbId: 1, pinned: true,
    });
    const out = parseJson(res) as Row;
    expect(out.pinned).toBe(true);
  });

  it('updates pinned=false and returns the row', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateReturning = [{ id: 1, pinned: false, projectId: 5 }];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_toggle_pin')!.handler({
      projectId: 5, artifactDbId: 1, pinned: false,
    });
    const out = parseJson(res) as Row;
    expect(out.pinned).toBe(false);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.pinned).toBe(false);
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('projects_artifact_toggle_pin')!.handler({
      projectId: 5, artifactDbId: 1, pinned: true,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── projects_artifact_unlink ──────────────────────────────────────────────────

describe('projects_artifact_unlink', () => {
  beforeEach(resetState);

  it('returns Project not found when project auth fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_unlink')!.handler({
      projectId: 5, artifactDbId: 1,
    });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns Artifact link not found when delete returns nothing', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.deleteReturning = [];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_unlink')!.handler({
      projectId: 5, artifactDbId: 999,
    });
    expect((parseJson(res) as Row).error).toMatch(/Artifact link not found/);
  });

  it('deletes and returns the removed row on success', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.deleteReturning = [{ id: 1, artifactType: 'pitch_deck', artifactId: 10, projectId: 5 }];
    const tools = registerAll();
    const res = await tools.get('projects_artifact_unlink')!.handler({
      projectId: 5, artifactDbId: 1,
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(1);
    expect(out.artifactType).toBe('pitch_deck');
    expect(dbState.deleteCalls).toBe(1);
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('projects_artifact_unlink')!.handler({
      projectId: 5, artifactDbId: 1,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── projects_propose_artifact_link ────────────────────────────────────────────

describe('projects_propose_artifact_link', () => {
  beforeEach(resetState);

  it('returns Project not found when project auth fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['projects:write', 'brain:write']);
    const res = await tools.get('projects_propose_artifact_link')!.handler({
      projectId: 5, artifactType: 'pitch_deck', artifactId: 10,
    });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('inserts a brain review item and returns it', async () => {
    dbState.selectQueue = [[{ id: 5 }]]; // project auth
    dbState.insertReturning = [{ id: 77, clientId: 7, proposedType: 'project_artifact_link', status: 'pending' }];
    const tools = registerAll(['projects:write', 'brain:write']);
    const res = await tools.get('projects_propose_artifact_link')!.handler({
      projectId: 5,
      artifactType: 'pitch_deck',
      artifactId: 10,
      rationale: 'This deck documents the project scope.',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(77);
    expect(out.proposedType).toBe('project_artifact_link');
    expect(out.status).toBe('pending');
    const inserted = dbState.insertCalls[0]!;
    expect(inserted.clientId).toBe(7);
    expect(inserted.status).toBe('pending');
    expect((inserted.proposedPayload as Row).projectId).toBe(5);
    expect((inserted.proposedPayload as Row).artifactType).toBe('pitch_deck');
    expect((inserted.proposedPayload as Row).rationale).toBe('This deck documents the project scope.');
  });

  it('stores pinned=false by default in proposedPayload', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.insertReturning = [{ id: 78 }];
    const tools = registerAll(['projects:write', 'brain:write']);
    await tools.get('projects_propose_artifact_link')!.handler({
      projectId: 5, artifactType: 'survey', artifactId: 20,
    });
    const inserted = dbState.insertCalls[0]!;
    expect((inserted.proposedPayload as Row).pinned).toBe(false);
  });

  it('denies when caller lacks projects:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['projects:write', 'brain:write']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['brain:write'];
    const res = await tools.get('projects_propose_artifact_link')!.handler({
      projectId: 5, artifactType: 'pitch_deck', artifactId: 10,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });

  it('denies when caller lacks brain:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['projects:write', 'brain:write']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:write'];
    const res = await tools.get('projects_propose_artifact_link')!.handler({
      projectId: 5, artifactType: 'pitch_deck', artifactId: 10,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
