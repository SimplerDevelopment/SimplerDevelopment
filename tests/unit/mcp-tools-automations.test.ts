// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/automations.ts.
 *
 * Mirrors the strategy used in mcp-tools-bookings.test.ts: stub `db`, mock
 * schema + drizzle helpers, pass in a fake McpServer that captures
 * `{ name -> handler }`, and exercise each handler directly. Covers happy
 * paths plus the scope-denial and not-found branches.
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
    delete: vi.fn(() => {
      dbState.deleteCalls += 1;
      return {
        where: vi.fn(async () => undefined),
      };
    }),
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
    automationRules: make('id', 'clientId', 'enabled', 'productScope', 'updatedAt', 'name', 'description', 'trigger', 'conditions', 'actions', 'source', 'createdBy'),
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

const hasServiceAccessMock = vi.fn(async () => true);
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: (...args: unknown[]) => hasServiceAccessMock(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Transitive imports that automations.ts pulls in via the top-of-file block.
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

import { registerAutomationsTools } from '@/lib/mcp/tools/automations';

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
  registerAutomationsTools(stub as any, ctxFor(scopes));
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
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

describe('registerAutomationsTools — tool registration', () => {
  it('registers the canonical automation tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'automations_list',
      'automations_toggle',
      'automations_create',
      'automations_update',
      'automations_delete',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only the list tool when scopes=automations:read', () => {
    const tools = registerAll(['automations:read']);
    expect(tools.has('automations_list')).toBe(true);
    expect(tools.has('automations_toggle')).toBe(false);
    expect(tools.has('automations_create')).toBe(false);
    expect(tools.has('automations_update')).toBe(false);
    expect(tools.has('automations_delete')).toBe(false);
  });

  it('registers only write tools when scopes=automations:write', () => {
    const tools = registerAll(['automations:write']);
    expect(tools.has('automations_list')).toBe(false);
    expect(tools.has('automations_toggle')).toBe(true);
    expect(tools.has('automations_create')).toBe(true);
    expect(tools.has('automations_update')).toBe(true);
    expect(tools.has('automations_delete')).toBe(true);
  });

  it('registers nothing when ctx has no automations scopes', () => {
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

// ── automations_list ────────────────────────────────────────────────────────

describe('automations_list', () => {
  it('returns rows when scope is granted', async () => {
    dbState.selectDefault = [
      { id: 1, name: 'Send welcome', enabled: true },
      { id: 2, name: 'Notify ops', enabled: false },
    ];
    const tools = registerAll();
    const res = await tools.get('automations_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Send welcome');
  });

  it('accepts enabled + productScope filters without error', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('automations_list')!.handler({
      enabled: true,
      productScope: 'email',
    });
    expect(parseJson(res)).toEqual([]);
  });

  it('accepts enabled=false filter', async () => {
    dbState.selectDefault = [{ id: 9, enabled: false }];
    const tools = registerAll();
    const res = await tools.get('automations_list')!.handler({ enabled: false });
    expect(parseJson(res)).toEqual([{ id: 9, enabled: false }]);
  });

  it('denies when ctx lacks automations:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAutomationsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('automations_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── automations_toggle ──────────────────────────────────────────────────────

describe('automations_toggle', () => {
  it('toggles enabled flag and stamps updatedAt', async () => {
    dbState.selectDefault = [{ id: 5 }];
    dbState.updateReturning = [{ id: 5, enabled: false }];
    const tools = registerAll();
    const res = await tools.get('automations_toggle')!.handler({ id: 5, enabled: false });
    const out = parseJson(res) as { id: number; enabled: boolean };
    expect(out.id).toBe(5);
    expect(out.enabled).toBe(false);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.enabled).toBe(false);
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('errors when rule is missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('automations_toggle')!.handler({ id: 404, enabled: true });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when ctx lacks automations:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAutomationsTools(stub as any, ctx);
    ctx.scopes = ['automations:read'];
    const res = await tools.get('automations_toggle')!.handler({ id: 1, enabled: true });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── automations_create ──────────────────────────────────────────────────────

describe('automations_create', () => {
  it('inserts a rule with trimmed name and supplied trigger/actions', async () => {
    dbState.insertReturning = [{ id: 10, name: 'New rule' }];
    const tools = registerAll();
    const res = await tools.get('automations_create')!.handler({
      name: '  New rule  ',
      description: 'desc',
      trigger: { event: 'email.campaign.sent' },
      conditions: [{ field: 'status', operator: 'eq', value: 'sent' }],
      actions: [{ tool: 'slack_notify', params: {} }],
      enabled: false,
      productScope: 'email',
      source: 'nlp',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(10);
    const vals = dbState.capturedInsertValues!;
    expect(vals.clientId).toBe(1);
    expect(vals.name).toBe('New rule');
    expect(vals.description).toBe('desc');
    expect(vals.enabled).toBe(false);
    expect(vals.productScope).toBe('email');
    expect(vals.source).toBe('nlp');
    expect(vals.createdBy).toBe(11);
    expect((vals.actions as unknown[])).toHaveLength(1);
  });

  it('applies defaults when optional fields are omitted', async () => {
    dbState.insertReturning = [{ id: 11 }];
    const tools = registerAll();
    await tools.get('automations_create')!.handler({
      name: 'Plain',
      trigger: { event: 'x' },
      actions: [],
    });
    const vals = dbState.capturedInsertValues!;
    expect(vals.description).toBeNull();
    expect(vals.conditions).toEqual([]);
    expect(vals.enabled).toBe(true);
    expect(vals.source).toBe('manual');
    expect(vals.productScope).toBeNull();
  });

  it('denies when ctx lacks automations:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAutomationsTools(stub as any, ctx);
    ctx.scopes = ['automations:read'];
    const res = await tools.get('automations_create')!.handler({
      name: 'X',
      trigger: { event: 'y' },
      actions: [],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── automations_update ──────────────────────────────────────────────────────

describe('automations_update', () => {
  it('updates only supplied fields and ignores undefined keys', async () => {
    dbState.selectDefault = [{ id: 1 }];
    dbState.updateReturning = [{ id: 1, name: 'Renamed' }];
    const tools = registerAll();
    const res = await tools.get('automations_update')!.handler({
      id: 1,
      name: 'Renamed',
      description: undefined,
      productScope: 'crm',
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(1);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.name).toBe('Renamed');
    expect(patch.productScope).toBe('crm');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect('description' in patch).toBe(false);
  });

  it('passes through null values for nullable fields', async () => {
    dbState.selectDefault = [{ id: 1 }];
    dbState.updateReturning = [{ id: 1 }];
    const tools = registerAll();
    await tools.get('automations_update')!.handler({
      id: 1,
      description: null,
      productScope: null,
    });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.description).toBeNull();
    expect(patch.productScope).toBeNull();
  });

  it('updates trigger/conditions/actions blobs', async () => {
    dbState.selectDefault = [{ id: 1 }];
    dbState.updateReturning = [{ id: 1 }];
    const tools = registerAll();
    await tools.get('automations_update')!.handler({
      id: 1,
      trigger: { event: 'new' },
      conditions: [{ field: 'a', operator: 'eq', value: 1 }],
      actions: [{ tool: 'x', params: {} }],
    });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.trigger).toEqual({ event: 'new' });
    expect((patch.conditions as unknown[])).toHaveLength(1);
    expect((patch.actions as unknown[])).toHaveLength(1);
  });

  it('errors when rule missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('automations_update')!.handler({ id: 999, name: 'X' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when ctx lacks automations:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAutomationsTools(stub as any, ctx);
    ctx.scopes = ['automations:read'];
    const res = await tools.get('automations_update')!.handler({ id: 1, name: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── automations_delete ──────────────────────────────────────────────────────

describe('automations_delete', () => {
  it('deletes an existing rule and returns success', async () => {
    dbState.selectDefault = [{ id: 5 }];
    const tools = registerAll();
    const res = await tools.get('automations_delete')!.handler({ id: 5 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out.success).toBe(true);
    expect(out.id).toBe(5);
    expect(dbState.deleteCalls).toBe(1);
  });

  it('errors when rule missing without invoking delete', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('automations_delete')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
    expect(dbState.deleteCalls).toBe(0);
  });

  it('denies when ctx lacks automations:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAutomationsTools(stub as any, ctx);
    ctx.scopes = ['automations:read'];
    const res = await tools.get('automations_delete')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
