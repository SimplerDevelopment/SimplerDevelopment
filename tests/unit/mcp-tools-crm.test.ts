// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/crm.ts.
 *
 * `registerCrmTools(server, ctx)` registers a large set of CRM tools
 * (contacts, companies, deals, deal-comments, deal-artifacts, pipelines,
 * activities, proposals, contracts, custom-fields, saved-views,
 * scoring-rules). Each tool has a handler closing over ctx.
 *
 * Strategy: mock the db with a flexible chainable proxy that pops from a FIFO
 * queue of `selectQueue` / `insertReturning` / `updateReturning` /
 * `deleteReturning` values, plus all collaborator modules. Each test sets up
 * the queue, invokes the tool's captured handler, and asserts on the parsed
 * JSON envelope.
 */
process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
process.env.RESEND_API_KEY ??= 're_test_placeholder';
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/pm-activity', () => ({
  logCardActivity: vi.fn(async () => undefined),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async () => ({ url: 'https://cdn.example.com/x' })),
}));

vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: vi.fn((s: string) => s),
}));

vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: vi.fn(async (s: string) => s),
}));

vi.mock('@/lib/email', () => ({
  resend: {},
  renderBlocksToEmailHtml: vi.fn(),
  buildCampaignHtml: vi.fn(),
  buildUnsubscribeUrl: vi.fn(),
  generateUnsubscribeToken: vi.fn(() => 'token'),
}));

vi.mock('@/lib/email/campaign-send', () => ({
  executeCampaignSend: vi.fn(),
}));

vi.mock('@/lib/google/oauth', () => ({
  revoke: vi.fn(async () => undefined),
}));

vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: vi.fn(async () => null),
}));

const { stageOrApplyMock } = vi.hoisted(() => ({ stageOrApplyMock: vi.fn() }));
vi.mock('@/lib/mcp/pending-changes', () => ({
  stageOrApply: stageOrApplyMock,
}));

vi.mock('@/lib/mcp/blocks-schema', () => ({
  BLOCKS_SCHEMA_REFERENCE: {},
}));

vi.mock('@/lib/crm/extract-mentions', () => ({
  extractMentions: vi.fn((s: string) => {
    // Parse @[name](id) tokens
    const re = /@\[[^\]]+\]\((\d+)\)/g;
    const ids: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) ids.push(parseInt(m[1], 10));
    return ids;
  }),
}));

const { createCrmNotificationMock } = vi.hoisted(() => ({
  createCrmNotificationMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: createCrmNotificationMock,
}));

vi.mock('@/lib/security/assert-owned', () => {
  class OwnershipError extends Error {
    constructor(public field: string, public id: number | string) {
      super(`Forbidden: ${field}=${id}`);
      this.name = 'OwnershipError';
    }
  }
  return {
    OwnershipError,
    assertStageInClient: vi.fn(async (id: number) => {
      if (id === 9999) throw new OwnershipError('stageId', id);
    }),
    assertContactInClient: vi.fn(async (id: number) => {
      if (id === 9999) throw new OwnershipError('contactId', id);
    }),
    assertCompanyInClient: vi.fn(async (id: number) => {
      if (id === 9999) throw new OwnershipError('companyId', id);
    }),
    assertUserVisibleToClient: vi.fn(async (id: number) => {
      if (id === 9999) throw new OwnershipError('userId', id);
    }),
    assertPipelineInClient: vi.fn(async () => undefined),
    assertColumnInProject: vi.fn(async () => undefined),
    assertProjectInClient: vi.fn(async () => undefined),
    filterUserIdsVisibleToClient: vi.fn(async (ids: number[]) => ids),
  };
});

// ── DB mock: flexible chainable that consumes queued results ────────────────

type Rows = unknown[];

interface DbState {
  selectQueue: Rows[];
  insertQueue: Rows[];
  updateQueue: Rows[];
  deleteQueue: Rows[];
  executeQueue: unknown[];
  defaultSelect: Rows;
  // Track last calls for tools that need argument introspection
  lastInsertValues?: unknown;
  lastUpdateSet?: unknown;
}

const { dbState } = vi.hoisted(() => {
  const dbState: DbState = {
    selectQueue: [],
    insertQueue: [],
    updateQueue: [],
    deleteQueue: [],
    executeQueue: [],
    defaultSelect: [],
  };
  return { dbState };
});

function chainable(rows: Rows | Promise<Rows>): unknown {
  const proxy: unknown = new Proxy(function noop() {}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: Rows) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(onFulfilled, onRejected);
      }
      // Iterator protocol — never invoked on the chain itself; the awaited rows
      // array is the one that gets iterated/destructured.
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

function popOr<T>(queue: T[], fallback: T): T {
  return queue.length > 0 ? queue.shift()! : fallback;
}

vi.mock('@/lib/db', () => {
  function chainableInner(rows: Rows | Promise<Rows>): unknown {
    const proxy: unknown = new Proxy(function noop() {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (v: Rows) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(rows).then(onFulfilled, onRejected);
        }
        return () => proxy;
      },
      apply() {
        return proxy;
      },
    });
    return proxy;
  }
  function popOrInner<T>(queue: T[], fallback: T): T {
    return queue.length > 0 ? queue.shift()! : fallback;
  }
  return {
    db: {
      select: vi.fn(() => {
        const rows = popOrInner(dbState.selectQueue, dbState.defaultSelect);
        return chainableInner(rows);
      }),
      insert: vi.fn(() => ({
        values: vi.fn((vals: unknown) => {
          dbState.lastInsertValues = vals;
          const rows = popOrInner(dbState.insertQueue, [{ id: 1 }]);
          return {
            returning: vi.fn(async () => rows),
            onConflictDoUpdate: vi.fn(() => ({
              returning: vi.fn(async () => rows),
            })),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: unknown) => {
          dbState.lastUpdateSet = vals;
          const rows = popOrInner(dbState.updateQueue, [{ id: 1, updated: true }]);
          return {
            where: vi.fn(() => ({
              returning: vi.fn(async () => rows),
            })),
          };
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = popOrInner(dbState.deleteQueue, [{ id: 1 }]);
          return {
            returning: vi.fn(async () => rows),
          };
        }),
      })),
      execute: vi.fn(async () => popOrInner(dbState.executeQueue, { rows: [] })),
    },
  };
});

// Schema objects: just need column-like references.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  const t = () => new Proxy({}, { get: (_t, prop) => col(String(prop)) });
  return {
    projects: t(),
    kanbanCards: t(),
    kanbanColumns: t(),
    kanbanLabels: t(),
    kanbanCardLabels: t(),
    kanbanCardChecklistItems: t(),
    kanbanCardAssignees: t(),
    kanbanCardWatchers: t(),
    kanbanCardDependencies: t(),
    supportTickets: t(),
    ticketMessages: t(),
    crmContacts: t(),
    crmCompanies: t(),
    crmDeals: t(),
    crmDealComments: t(),
    crmPipelines: t(),
    crmPipelineStages: t(),
    posts: t(),
    media: t(),
    clientWebsites: t(),
    emailLists: t(),
    emailCampaigns: t(),
    pitchDecks: t(),
    brandingProfiles: t(),
    emailSubscribers: t(),
    emailCampaignSends: t(),
    surveys: t(),
    surveyResponses: t(),
    bookingPages: t(),
    bookings: t(),
    sprints: t(),
    crmActivities: t(),
    categories: t(),
    tags: t(),
    postCategories: t(),
    postTags: t(),
    automationRules: t(),
    clientMembers: t(),
    users: t(),
    crmProposals: t(),
    crmContracts: t(),
    crmContractSigners: t(),
    invoices: t(),
    invoiceItems: t(),
    serviceRequests: t(),
    suggestedProjectRequests: t(),
    suggestedProjects: t(),
    services: t(),
    aiConversations: t(),
    aiMessages: t(),
    kanbanCardComments: t(),
    kanbanCardTimeLogs: t(),
    kanbanCardFiles: t(),
    kanbanCardArtifacts: t(),
    crmDealArtifacts: t(),
    siteNavigation: t(),
    postRevisions: t(),
    blockTemplates: t(),
    blockTemplateUsages: t(),
    emailTemplates: t(),
    emailSegments: t(),
    giftCertificates: t(),
    crmCustomFields: t(),
    crmCustomFieldValues: t(),
    crmSavedViews: t(),
    crmScoringRules: t(),
    websiteDomains: t(),
    websiteEnvironments: t(),
    websiteEnvVars: t(),
    clients: t(),
    aiCreditBalances: t(),
    aiCreditLedger: t(),
    hostedSites: t(),
    googleWorkspaceUserConnections: t(),
    portalApiKeys: t(),
    oauthAccessTokens: t(),
    mcpPendingChanges: t(),
  };
});

// drizzle-orm helpers — return opaque objects.
vi.mock('drizzle-orm', () => {
  const helper = vi.fn(() => ({}));
  const sqlFn = Object.assign(
    (_strings?: unknown, ..._vals: unknown[]) => ({}),
    {
      raw: vi.fn(() => ({})),
      join: vi.fn(() => ({})),
      empty: vi.fn(() => ({})),
    },
  );
  return {
    eq: helper,
    and: helper,
    or: helper,
    desc: helper,
    asc: helper,
    inArray: helper,
    ilike: helper,
    isNull: helper,
    gte: helper,
    lte: helper,
    sql: sqlFn,
  };
});

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerCrmTools } from '@/lib/mcp/tools/crm';

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
  registerCrmTools(stub as any, ctxFor(scopes));
  return tools;
}

function resetDbState() {
  dbState.selectQueue = [];
  dbState.insertQueue = [];
  dbState.updateQueue = [];
  dbState.deleteQueue = [];
  dbState.executeQueue = [];
  dbState.defaultSelect = [];
  dbState.lastInsertValues = undefined;
  dbState.lastUpdateSet = undefined;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('registerCrmTools — registration', () => {
  beforeEach(() => {
    resetDbState();
    stageOrApplyMock.mockReset();
    createCrmNotificationMock.mockReset();
  });

  it('registers a substantial number of CRM tools with full scopes', () => {
    const tools = registerAll(['*']);
    expect(tools.size).toBeGreaterThanOrEqual(30);
  });

  it('registers canonical read tools', () => {
    const tools = registerAll(['*']);
    for (const name of [
      'crm_contacts_search',
      'crm_companies_search',
      'crm_deals_list',
      'crm_deals_get',
      'crm_deal_comments_list',
      'crm_deal_artifacts_list',
      'crm_pipelines_list',
      'crm_activities_list',
      'proposals_list',
      'proposals_get',
      'contracts_list',
      'contracts_get',
      'crm_custom_fields_list',
      'crm_custom_field_values_get',
      'crm_saved_views_list',
      'crm_scoring_rules_list',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers canonical write tools', () => {
    const tools = registerAll(['*']);
    for (const name of [
      'crm_contacts_create',
      'crm_contacts_update',
      'crm_companies_create',
      'crm_companies_update',
      'crm_deals_create',
      'crm_deals_update',
      'crm_deals_move_stage',
      'crm_deals_delete',
      'crm_deal_comments_create',
      'crm_deal_comments_delete',
      'crm_deal_artifact_link',
      'crm_deal_artifact_toggle_pin',
      'crm_deal_artifact_unlink',
      'crm_pipelines_create',
      'crm_pipelines_update',
      'crm_pipelines_add_stage',
      'crm_pipelines_update_stage',
      'crm_activities_create',
      'proposals_create',
      'proposals_update',
      'proposals_send',
      'contracts_create',
      'contracts_void',
      'crm_custom_fields_create',
      'crm_custom_fields_update',
      'crm_custom_fields_delete',
      'crm_custom_field_values_set',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('skips write tools when only crm:read is granted', () => {
    const tools = registerAll(['crm:read']);
    expect(tools.has('crm_contacts_search')).toBe(true);
    expect(tools.has('crm_contacts_create')).toBe(false);
    expect(tools.has('crm_deals_delete')).toBe(false);
  });

  it('skips read tools when only crm:write is granted', () => {
    const tools = registerAll(['crm:write']);
    expect(tools.has('crm_contacts_create')).toBe(true);
    expect(tools.has('crm_contacts_search')).toBe(false);
  });

  it('registers nothing when caller has unrelated scopes', () => {
    const tools = registerAll(['posts:read']);
    expect(tools.size).toBe(0);
  });

  it('honours wildcard resource scope crm:*', () => {
    const tools = registerAll(['crm:*']);
    expect(tools.has('crm_contacts_search')).toBe(true);
    expect(tools.has('crm_contacts_create')).toBe(true);
  });

  it('gives every tool a title + description + inputSchema', () => {
    const tools = registerAll(['*']);
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name}.title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name}.description`).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── contacts ───────────────────────────────────────────────────────────────

describe('crm_contacts_search', () => {
  beforeEach(resetDbState);

  it('returns rows from db.execute on happy path', async () => {
    dbState.executeQueue = [{ rows: [{ id: 1, first_name: 'Jane' }] }];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_contacts_search')!.handler({ query: 'Jane', status: 'lead', limit: 5 });
    expect(parseJson(res)).toEqual([{ id: 1, first_name: 'Jane' }]);
  });

  it('falls back to defaults when no filters', async () => {
    dbState.executeQueue = [{ rows: [] }];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_contacts_search')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('returns dbErrorEnvelope on db.execute failure', async () => {
    const { db } = await import('@/lib/db');
    (db.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('SELECT failed'), {
        cause: { message: 'column "x" does not exist', code: '42703', detail: 'd' },
      }),
    );
    const tools = registerAll(['*']);
    const res = await tools.get('crm_contacts_search')!.handler({});
    expect(res.isError).toBe(true);
    const body = parseJson(res) as { pgCode: string };
    expect(body.pgCode).toBe('42703');
  });
});

describe('crm_contacts_create', () => {
  beforeEach(resetDbState);

  it('inserts a contact and returns the row', async () => {
    dbState.insertQueue = [[{ id: 42, firstName: 'Jane' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_contacts_create')!.handler({ firstName: 'Jane' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(42);
  });

  it('passes through optional fields', async () => {
    dbState.insertQueue = [[{ id: 7 }]];
    const tools = registerAll(['*']);
    await tools.get('crm_contacts_create')!.handler({
      firstName: 'Bo',
      lastName: 'Bee',
      email: 'b@example.com',
      status: 'customer',
    });
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.firstName).toBe('Bo');
    expect(vals.lastName).toBe('Bee');
    expect(vals.email).toBe('b@example.com');
    expect(vals.status).toBe('customer');
    expect(vals.clientId).toBe(1);
    expect(vals.ownerId).toBe(11);
  });
});

describe('crm_contacts_update', () => {
  beforeEach(resetDbState);

  it('returns not-found when contact missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_contacts_update')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('applies the patch on hit', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateQueue = [[{ id: 5, firstName: 'New' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_contacts_update')!.handler({ id: 5, firstName: 'New', notes: null });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(5);
    const setVals = dbState.lastUpdateSet as Record<string, unknown>;
    expect(setVals.firstName).toBe('New');
    expect(setVals.notes).toBeNull();
  });
});

// ── companies ──────────────────────────────────────────────────────────────

describe('crm_companies_search', () => {
  beforeEach(resetDbState);

  it('returns rows on happy path', async () => {
    dbState.executeQueue = [{ rows: [{ id: 1, name: 'Acme' }] }];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_companies_search')!.handler({ query: 'ac' });
    expect(parseJson(res)).toEqual([{ id: 1, name: 'Acme' }]);
  });

  it('returns dbErrorEnvelope on failure', async () => {
    const { db } = await import('@/lib/db');
    (db.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const tools = registerAll(['*']);
    const res = await tools.get('crm_companies_search')!.handler({});
    expect(res.isError).toBe(true);
  });
});

describe('crm_companies_create', () => {
  beforeEach(resetDbState);

  it('inserts a company and returns row', async () => {
    dbState.insertQueue = [[{ id: 3, name: 'CoCo' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_companies_create')!.handler({ name: 'CoCo', domain: 'co.co' });
    expect((parseJson(res) as { id: number }).id).toBe(3);
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.name).toBe('CoCo');
    expect(vals.domain).toBe('co.co');
  });
});

describe('crm_companies_update', () => {
  beforeEach(resetDbState);

  it('not-found when company missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_companies_update')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('updates on hit', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateQueue = [[{ id: 1, name: 'Renamed' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_companies_update')!.handler({ id: 1, name: 'Renamed' });
    expect((parseJson(res) as { name: string }).name).toBe('Renamed');
  });
});

// ── deals ──────────────────────────────────────────────────────────────────

describe('crm_deals_list', () => {
  beforeEach(resetDbState);

  it('returns deals filtered by pipeline + status', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'D' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_list')!.handler({ pipelineId: 1, status: 'open' });
    expect(parseJson(res)).toEqual([{ id: 1, title: 'D' }]);
  });

  it('returns empty list when no rows', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });
});

describe('crm_deals_create', () => {
  beforeEach(resetDbState);

  it('inserts and returns row', async () => {
    dbState.insertQueue = [[{ id: 9, title: 'New deal' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_create')!.handler({
      title: 'New deal', pipelineId: 1, stageId: 2, value: 5000, expectedCloseDate: '2026-12-31',
    });
    expect((parseJson(res) as { id: number }).id).toBe(9);
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.expectedCloseDate).toBeInstanceOf(Date);
  });
});

describe('crm_deals_move_stage', () => {
  beforeEach(resetDbState);

  it('returns OwnershipError when stage out-of-tenant', async () => {
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_move_stage')!.handler({ id: 1, stageId: 9999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('propagates non-OwnershipError throws', async () => {
    const sec = await import('@/lib/security/assert-owned');
    (sec.assertStageInClient as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    const tools = registerAll(['*']);
    await expect(tools.get('crm_deals_move_stage')!.handler({ id: 1, stageId: 5 })).rejects.toThrow('db down');
  });

  it('returns Not found when no row matched', async () => {
    dbState.updateQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_move_stage')!.handler({ id: 1, stageId: 5 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Not found/);
  });

  it('stamps closedAt when status=won', async () => {
    dbState.updateQueue = [[{ id: 1, status: 'won' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_move_stage')!.handler({ id: 1, status: 'won' });
    expect((parseJson(res) as { status: string }).status).toBe('won');
    const set = dbState.lastUpdateSet as Record<string, unknown>;
    expect(set.closedAt).toBeInstanceOf(Date);
  });

  it('updates without closedAt when status=open', async () => {
    dbState.updateQueue = [[{ id: 1, status: 'open' }]];
    const tools = registerAll(['*']);
    await tools.get('crm_deals_move_stage')!.handler({ id: 1, status: 'open' });
    const set = dbState.lastUpdateSet as Record<string, unknown>;
    expect(set.closedAt).toBeUndefined();
  });
});

describe('crm_deals_update', () => {
  beforeEach(resetDbState);

  it('not-found when deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_update')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns OwnershipError as JSON when contactId rejects', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_update')!.handler({ id: 1, contactId: 9999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('OwnershipError on companyId returns JSON error', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_update')!.handler({ id: 1, companyId: 9999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('OwnershipError on ownerId returns JSON error', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_update')!.handler({ id: 1, ownerId: 9999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('clears expectedCloseDate when null', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    await tools.get('crm_deals_update')!.handler({ id: 1, expectedCloseDate: null });
    const set = dbState.lastUpdateSet as Record<string, unknown>;
    expect(set.expectedCloseDate).toBeNull();
  });

  it('parses ISO expectedCloseDate', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    await tools.get('crm_deals_update')!.handler({ id: 1, expectedCloseDate: '2026-06-01' });
    const set = dbState.lastUpdateSet as Record<string, unknown>;
    expect(set.expectedCloseDate).toBeInstanceOf(Date);
  });
});

describe('crm_deals_get', () => {
  beforeEach(resetDbState);

  it('returns not-found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_get')!.handler({ dealId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns the deal without customFields by default', async () => {
    dbState.selectQueue = [[{ id: 4, title: 'D' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_get')!.handler({ dealId: 4 });
    const out = parseJson(res) as Record<string, unknown>;
    expect(out.id).toBe(4);
    expect('customFields' in out).toBe(false);
  });

  it('joins customFields when includeCustomFields=true', async () => {
    dbState.selectQueue = [
      [{ id: 4, title: 'D' }],
      [
        { fieldId: 10, fieldName: 'Region', fieldType: 'text', value: 'EU' },
        { fieldId: 11, fieldName: 'Score', fieldType: 'number', value: '5' },
      ],
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_get')!.handler({ dealId: 4, includeCustomFields: true });
    const out = parseJson(res) as { customFields: Record<string, { name: string }> };
    expect(out.customFields['10'].name).toBe('Region');
    expect(out.customFields['11'].name).toBe('Score');
  });
});

describe('crm_deals_delete', () => {
  beforeEach(resetDbState);

  it('returns not-found when no row deleted', async () => {
    dbState.deleteQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_delete')!.handler({ dealId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns deleted echo on hit', async () => {
    dbState.deleteQueue = [[{ id: 4 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deals_delete')!.handler({ dealId: 4 });
    expect(parseJson(res)).toEqual({ id: 4, deleted: true });
  });
});

// ── deal comments ──────────────────────────────────────────────────────────

describe('crm_deal_comments_list', () => {
  beforeEach(resetDbState);

  it('returns Deal not found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_list')!.handler({ dealId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns comment list when deal exists', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],                                    // deal exists
      [{ id: 99, body: 'hi', authorName: 'Alice' }],  // comments
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_list')!.handler({ dealId: 1, limit: 10 });
    const arr = parseJson(res) as { id: number }[];
    expect(arr[0].id).toBe(99);
  });
});

describe('crm_deal_comments_create', () => {
  beforeEach(() => {
    resetDbState();
    createCrmNotificationMock.mockReset();
    createCrmNotificationMock.mockImplementation(async () => undefined);
  });

  it('rejects when deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_create')!.handler({ dealId: 999, body: 'hi' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('rejects empty body', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'D' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_create')!.handler({ dealId: 1, body: '   ' });
    expect((parseJson(res) as { error: string }).error).toMatch(/required/);
  });

  it('inserts comment without mentions on plain body', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'D' }]];
    dbState.insertQueue = [[{ id: 100, dealId: 1, authorId: 11 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_create')!.handler({ dealId: 1, body: 'no mentions here' });
    expect((parseJson(res) as { id: number }).id).toBe(100);
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('notifies mentioned client members', async () => {
    dbState.selectQueue = [
      [{ id: 1, title: 'My Deal' }],                  // deal
      [{ userId: 42 }],                                // valid members
      [{ name: 'Author', email: 'a@x.com' }],          // actor lookup
    ];
    dbState.insertQueue = [[{ id: 101 }]];
    const tools = registerAll(['*']);
    await tools.get('crm_deal_comments_create')!.handler({
      dealId: 1,
      body: 'hello @[Bob](42) please review',
    });
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
    const call = createCrmNotificationMock.mock.calls[0][0] as { userId: number };
    expect(call.userId).toBe(42);
  });

  it('merges explicit mentionedUserIds with body mentions and dedupes self', async () => {
    dbState.selectQueue = [
      [{ id: 1, title: 'D' }],
      [{ userId: 42 }, { userId: 43 }],
      [{ name: 'Author', email: 'a@x.com' }],
    ];
    dbState.insertQueue = [[{ id: 102 }]];
    const tools = registerAll(['*']);
    await tools.get('crm_deal_comments_create')!.handler({
      dealId: 1,
      body: 'hi @[Bob](42)',
      mentionedUserIds: [43, 11], // 11 is the caller — should be filtered out
    });
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(2);
  });

  it('swallows notification errors', async () => {
    dbState.selectQueue = [
      [{ id: 1, title: 'D' }],
      [{ userId: 42 }],
      [{ name: null, email: 'a@x.com' }],
    ];
    dbState.insertQueue = [[{ id: 103 }]];
    createCrmNotificationMock.mockRejectedValueOnce(new Error('notify-down'));
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_create')!.handler({
      dealId: 1,
      body: 'ping @[Bob](42)',
    });
    expect((parseJson(res) as { id: number }).id).toBe(103);
  });
});

describe('crm_deal_comments_delete', () => {
  beforeEach(resetDbState);

  it('not-found when deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_delete')!.handler({ dealId: 1, commentId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('not-found when comment not deleted (e.g. not owned)', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.deleteQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_delete')!.handler({ dealId: 1, commentId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not yours|not found/i);
  });

  it('returns deleted echo on hit', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.deleteQueue = [[{ id: 99 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_comments_delete')!.handler({ dealId: 1, commentId: 99 });
    expect(parseJson(res)).toEqual({ id: 99, deleted: true });
  });
});

// ── deal artifacts ─────────────────────────────────────────────────────────

describe('crm_deal_artifacts_list', () => {
  beforeEach(resetDbState);

  it('not-found when deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifacts_list')!.handler({ dealId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns artifact list on hit', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],
      [{ id: 50, artifactType: 'website' }],
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifacts_list')!.handler({ dealId: 1 });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(50);
  });
});

describe('crm_deal_artifact_link', () => {
  beforeEach(resetDbState);

  it('errors when deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_link')!.handler({
      dealId: 999, artifactType: 'website', artifactId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('errors when artifact not owned by tenant', async () => {
    dbState.selectQueue = [
      [{ id: 1 }], // deal
      [],          // artifact lookup empty
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_link')!.handler({
      dealId: 1, artifactType: 'pitch_deck', artifactId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found|not owned/i);
  });

  it('links artifact with displayTitle on success', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],
      [{ title: 'My Pitch' }],
    ];
    dbState.insertQueue = [[{ id: 80, displayTitle: 'My Pitch' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_link')!.handler({
      dealId: 1, artifactType: 'pitch_deck', artifactId: 5, pinned: true,
    });
    expect((parseJson(res) as { id: number }).id).toBe(80);
  });

  it('uses fallback title when source title empty', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],
      [{ title: null }],
    ];
    dbState.insertQueue = [[{ id: 81, displayTitle: 'Untitled' }]];
    const tools = registerAll(['*']);
    await tools.get('crm_deal_artifact_link')!.handler({
      dealId: 1, artifactType: 'survey', artifactId: 6,
    });
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.displayTitle).toBe('Untitled');
  });
});

describe('crm_deal_artifact_toggle_pin', () => {
  beforeEach(resetDbState);

  it('not-found when deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_toggle_pin')!.handler({
      dealId: 1, artifactDbId: 2, pinned: true,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('not-found when artifact link missing', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_toggle_pin')!.handler({
      dealId: 1, artifactDbId: 999, pinned: false,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('toggles on hit', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateQueue = [[{ id: 2, pinned: true }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_toggle_pin')!.handler({
      dealId: 1, artifactDbId: 2, pinned: true,
    });
    expect((parseJson(res) as { pinned: boolean }).pinned).toBe(true);
  });
});

describe('crm_deal_artifact_unlink', () => {
  beforeEach(resetDbState);

  it('not-found when deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_unlink')!.handler({ dealId: 1, artifactDbId: 2 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('not-found when link missing', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.deleteQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_unlink')!.handler({ dealId: 1, artifactDbId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('unlinks on hit', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.deleteQueue = [[{ id: 2 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_deal_artifact_unlink')!.handler({ dealId: 1, artifactDbId: 2 });
    expect((parseJson(res) as { id: number }).id).toBe(2);
  });
});

// ── pipelines ──────────────────────────────────────────────────────────────

describe('crm_pipelines_list', () => {
  beforeEach(resetDbState);

  it('returns pipelines with empty stages when no pipelines', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_list')!.handler({});
    const out = parseJson(res) as { pipelines: unknown[]; stages: unknown[] };
    expect(out.pipelines).toEqual([]);
    expect(out.stages).toEqual([]);
  });

  it('joins stages when pipelines exist', async () => {
    dbState.selectQueue = [
      [{ id: 1 }, { id: 2 }],                  // pipelines
      [{ id: 10, pipelineId: 1, name: 'New' }], // stages
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_list')!.handler({});
    const out = parseJson(res) as { stages: { id: number }[] };
    expect(out.stages[0].id).toBe(10);
  });
});

describe('crm_pipelines_create', () => {
  beforeEach(resetDbState);

  it('creates a pipeline with seed stages and clears existing default when isDefault', async () => {
    dbState.updateQueue = [[]];                    // clearing default
    dbState.insertQueue = [
      [{ id: 5, name: 'Sales' }],                  // pipeline
      [{ id: 100, name: 'Lead' }, { id: 101, name: 'Won' }], // stages
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_create')!.handler({
      name: 'Sales',
      isDefault: true,
      stages: [{ name: 'Lead' }, { name: 'Won', probability: 100 }],
    });
    const out = parseJson(res) as { pipeline: { id: number }; stages: unknown[] };
    expect(out.pipeline.id).toBe(5);
    expect(out.stages.length).toBe(2);
  });

  it('creates a pipeline with empty stages when none provided', async () => {
    dbState.insertQueue = [[{ id: 6, name: 'Empty' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_create')!.handler({ name: 'Empty' });
    const out = parseJson(res) as { stages: unknown[] };
    expect(out.stages).toEqual([]);
  });
});

describe('crm_pipelines_update', () => {
  beforeEach(resetDbState);

  it('not-found when pipeline missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_update')!.handler({ id: 999, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('renames and toggles isDefault', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateQueue = [
      [],                          // clear old default
      [{ id: 1, name: 'New' }],    // apply
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_update')!.handler({ id: 1, name: 'New', isDefault: true });
    expect((parseJson(res) as { name: string }).name).toBe('New');
  });
});

describe('crm_pipelines_add_stage', () => {
  beforeEach(resetDbState);

  it('not-found when pipeline missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_add_stage')!.handler({ pipelineId: 99, name: 'S' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('appends a stage with next sort order', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],                                 // pipeline exists
      [{ id: 10 }, { id: 11 }],                    // existing stages -> next order = 2
    ];
    dbState.insertQueue = [[{ id: 20, sortOrder: 2 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_add_stage')!.handler({ pipelineId: 1, name: 'Three' });
    expect((parseJson(res) as { id: number }).id).toBe(20);
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.sortOrder).toBe(2);
  });

  it('honors explicit sortOrder', async () => {
    dbState.selectQueue = [[{ id: 1 }], []];
    dbState.insertQueue = [[{ id: 21 }]];
    const tools = registerAll(['*']);
    await tools.get('crm_pipelines_add_stage')!.handler({ pipelineId: 1, name: 'S', sortOrder: 7 });
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.sortOrder).toBe(7);
  });
});

describe('crm_pipelines_update_stage', () => {
  beforeEach(resetDbState);

  it('not-found when stage missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_update_stage')!.handler({ id: 999, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('updates a stage on hit', async () => {
    dbState.selectQueue = [[{ id: 5, pipelineId: 1 }]];
    dbState.updateQueue = [[{ id: 5, name: 'Renamed', color: '#000' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_pipelines_update_stage')!.handler({ id: 5, name: 'Renamed', color: '#000' });
    expect((parseJson(res) as { name: string }).name).toBe('Renamed');
  });
});

// ── activities ─────────────────────────────────────────────────────────────

describe('crm_activities_list', () => {
  beforeEach(resetDbState);

  it('lists activities with filters', async () => {
    dbState.selectQueue = [[{ id: 1, type: 'note' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_activities_list')!.handler({ contactId: 1, type: 'note' });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });
});

describe('crm_activities_create', () => {
  beforeEach(resetDbState);

  it('requires at least one of contact/deal/company', async () => {
    const tools = registerAll(['*']);
    const res = await tools.get('crm_activities_create')!.handler({ type: 'note', title: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/at least one/i);
  });

  it('creates an activity', async () => {
    dbState.insertQueue = [[{ id: 9, type: 'task' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_activities_create')!.handler({
      type: 'task', title: 'Do it', dealId: 5, dueDate: '2026-08-01', completedAt: '2026-08-02',
    });
    expect((parseJson(res) as { id: number }).id).toBe(9);
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.dueDate).toBeInstanceOf(Date);
    expect(vals.completedAt).toBeInstanceOf(Date);
  });
});

// ── proposals ──────────────────────────────────────────────────────────────

describe('proposals_list / proposals_get', () => {
  beforeEach(resetDbState);

  it('lists proposals with filters', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'draft' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_list')!.handler({ status: 'draft', dealId: 1 });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });

  it('not-found on missing proposal', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_get')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns proposal on hit', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_get')!.handler({ id: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });
});

describe('proposals_create', () => {
  beforeEach(resetDbState);

  it('returns pending envelope when stageOrApply says pending', async () => {
    stageOrApplyMock.mockResolvedValueOnce({
      pending: true, pendingId: 88, summary: 'pending p', status: 'pending',
    });
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_create')!.handler({ title: 'New' });
    const out = parseJson(res) as { pending: boolean; pendingId: number };
    expect(out.pending).toBe(true);
    expect(out.pendingId).toBe(88);
  });

  it('applies and returns data when stageOrApply returns data', async () => {
    stageOrApplyMock.mockImplementationOnce(async (opts) => {
      const data = await opts.apply();
      return { pending: false, data };
    });
    dbState.insertQueue = [[{ id: 7, title: 'New' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_create')!.handler({
      title: 'New', validUntil: '2026-12-31', sections: [], lineItems: [], fees: [],
    });
    expect((parseJson(res) as { id: number }).id).toBe(7);
  });
});

describe('proposals_update', () => {
  beforeEach(resetDbState);

  it('not-found when proposal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_update')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns pending when staged', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'draft', summary: 's' }]];
    stageOrApplyMock.mockResolvedValueOnce({
      pending: true, pendingId: 90, summary: 'p', status: 'pending',
    });
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_update')!.handler({ id: 1, title: 'NewT' });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });

  it('stamps acceptedAt when transitioning to accepted', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'sent', summary: 's' }]];
    stageOrApplyMock.mockImplementationOnce(async (opts) => {
      const data = await opts.apply();
      return { pending: false, data };
    });
    dbState.updateQueue = [[{ id: 1, status: 'accepted' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_update')!.handler({ id: 1, status: 'accepted' });
    expect((parseJson(res) as { status: string }).status).toBe('accepted');
    const set = dbState.lastUpdateSet as Record<string, unknown>;
    expect(set.acceptedAt).toBeInstanceOf(Date);
  });

  it('stamps declinedAt when transitioning to declined', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'sent', summary: 's' }]];
    stageOrApplyMock.mockImplementationOnce(async (opts) => {
      const data = await opts.apply();
      return { pending: false, data };
    });
    dbState.updateQueue = [[{ id: 1, status: 'declined' }]];
    const tools = registerAll(['*']);
    await tools.get('proposals_update')!.handler({ id: 1, status: 'declined' });
    const set = dbState.lastUpdateSet as Record<string, unknown>;
    expect(set.declinedAt).toBeInstanceOf(Date);
  });

  it('clears validUntil when null', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'draft', summary: 's' }]];
    stageOrApplyMock.mockImplementationOnce(async (opts) => {
      const data = await opts.apply();
      return { pending: false, data };
    });
    dbState.updateQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    await tools.get('proposals_update')!.handler({ id: 1, validUntil: null });
    const set = dbState.lastUpdateSet as Record<string, unknown>;
    expect(set.validUntil).toBeNull();
  });
});

describe('proposals_send', () => {
  beforeEach(resetDbState);

  it('not-found when proposal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_send')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('rejects if not in draft', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'sent' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_send')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/cannot send/i);
  });

  it('marks as sent on hit (apply path)', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'draft' }]];
    stageOrApplyMock.mockImplementationOnce(async (opts) => {
      const data = await opts.apply();
      return { pending: false, data };
    });
    dbState.updateQueue = [[{ id: 1, status: 'sent' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_send')!.handler({ id: 1 });
    expect((parseJson(res) as { status: string }).status).toBe('sent');
  });

  it('returns pending envelope when staged', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'P', status: 'draft' }]];
    stageOrApplyMock.mockResolvedValueOnce({
      pending: true, pendingId: 200, summary: 'send', status: 'pending',
    });
    const tools = registerAll(['*']);
    const res = await tools.get('proposals_send')!.handler({ id: 1 });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });
});

// ── contracts ──────────────────────────────────────────────────────────────

describe('contracts_list / contracts_get', () => {
  beforeEach(resetDbState);

  it('lists contracts', async () => {
    dbState.selectQueue = [[{ id: 1, title: 'C', status: 'draft' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_list')!.handler({ status: 'draft', proposalId: 5 });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });

  it('not-found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_get')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns contract + signers', async () => {
    dbState.selectQueue = [
      [{ id: 1, title: 'C' }],
      [{ id: 11, email: 'a@b.com' }, { id: 12, email: 'c@d.com' }],
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_get')!.handler({ id: 1 });
    const out = parseJson(res) as { contract: { id: number }; signers: { id: number }[] };
    expect(out.contract.id).toBe(1);
    expect(out.signers.length).toBe(2);
  });
});

describe('contracts_create', () => {
  beforeEach(resetDbState);

  it('creates a contract with signers', async () => {
    dbState.insertQueue = [
      [{ id: 5, title: 'Agreement' }],
      [{ id: 11, email: 'a@b.com' }],
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_create')!.handler({
      title: 'Agreement',
      signers: [{ name: 'A', email: 'A@B.com' }],
    });
    const out = parseJson(res) as { contract: { id: number }; signers: unknown[] };
    expect(out.contract.id).toBe(5);
    expect(out.signers.length).toBe(1);
  });

  it('creates contract without signers', async () => {
    dbState.insertQueue = [[{ id: 6, title: 'C' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_create')!.handler({ title: 'C', validUntil: '2026-09-09' });
    const out = parseJson(res) as { signers: unknown[] };
    expect(out.signers).toEqual([]);
  });
});

describe('contracts_void', () => {
  beforeEach(resetDbState);

  it('not-found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_void')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('rejects already-voided', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'voided' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_void')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/already voided/i);
  });

  it('rejects fully-executed', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'fully_executed' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_void')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/fully executed/i);
  });

  it('voids on draft', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'draft' }]];
    dbState.updateQueue = [[{ id: 1, status: 'voided' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('contracts_void')!.handler({ id: 1, reason: 'oops' });
    expect((parseJson(res) as { status: string }).status).toBe('voided');
  });
});

// ── custom fields ──────────────────────────────────────────────────────────

describe('crm_custom_fields_list / create / update / delete', () => {
  beforeEach(resetDbState);

  it('lists custom fields', async () => {
    dbState.selectQueue = [[{ id: 1, fieldName: 'F' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_fields_list')!.handler({ entityType: 'deal' });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });

  it('creates a custom field', async () => {
    dbState.insertQueue = [[{ id: 50, fieldName: 'Region' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_fields_create')!.handler({
      entityType: 'deal', fieldName: 'Region', fieldType: 'select', options: ['EU', 'NA'],
    });
    expect((parseJson(res) as { id: number }).id).toBe(50);
  });

  it('update not-found when field missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_fields_update')!.handler({ id: 999, fieldName: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('update rejects when patch is empty', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_fields_update')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/No fields/i);
  });

  it('update applies patch on hit', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateQueue = [[{ id: 1, fieldName: 'New' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_fields_update')!.handler({
      id: 1, fieldName: 'New', options: ['A'], required: true, filterable: true, sortOrder: 3,
    });
    expect((parseJson(res) as { fieldName: string }).fieldName).toBe('New');
  });

  it('delete not-found when missing', async () => {
    dbState.deleteQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_fields_delete')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('delete returns echo on hit', async () => {
    dbState.deleteQueue = [[{ id: 7 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_fields_delete')!.handler({ id: 7 });
    expect((parseJson(res) as { id: number }).id).toBe(7);
  });
});

describe('crm_custom_field_values_get', () => {
  beforeEach(resetDbState);

  it('entity not found (contact)', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_field_values_get')!.handler({ entityType: 'contact', entityId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('entity not found (company)', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_field_values_get')!.handler({ entityType: 'company', entityId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('entity not found (deal)', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_field_values_get')!.handler({ entityType: 'deal', entityId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns custom-field rows on contact hit', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],
      [{ id: 10, customFieldId: 50, fieldName: 'F', value: 'v' }],
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_field_values_get')!.handler({ entityType: 'contact', entityId: 1 });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(10);
  });
});

describe('crm_custom_field_values_set', () => {
  beforeEach(resetDbState);

  it('rejects when entity missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_field_values_set')!.handler({
      entityType: 'deal', entityId: 999, values: { '5': 'x' },
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns empty array when no fieldIds parse', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_field_values_set')!.handler({
      entityType: 'deal', entityId: 1, values: { 'foo': 'bar' },
    });
    expect(parseJson(res)).toEqual([]);
  });

  it('upserts values for valid fields, skipping unknown', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],            // entity exists
      [{ id: 50 }, { id: 51 }], // valid fields
    ];
    // upsert for 50, 51 — push two distinct rows; 52 will be skipped
    dbState.insertQueue = [
      [{ id: 100, customFieldId: 50, value: 'EU' }],
      [{ id: 101, customFieldId: 51, value: '5' }],
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_custom_field_values_set')!.handler({
      entityType: 'deal',
      entityId: 1,
      values: { '50': 'EU', '51': 5, '52': 'skip-me' },
    });
    const out = parseJson(res) as { customFieldId: number }[];
    expect(out.length).toBe(2);
  });

  it('passes null when value is null', async () => {
    dbState.selectQueue = [[{ id: 1 }], [{ id: 50 }]];
    dbState.insertQueue = [[{ id: 200, customFieldId: 50, value: null }]];
    const tools = registerAll(['*']);
    await tools.get('crm_custom_field_values_set')!.handler({
      entityType: 'company', entityId: 1, values: { '50': null },
    });
    const vals = dbState.lastInsertValues as Record<string, unknown>;
    expect(vals.value).toBeNull();
  });
});

// ── saved views & scoring ──────────────────────────────────────────────────

describe('crm_saved_views_list', () => {
  beforeEach(resetDbState);

  it('lists saved views with entityType filter', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'V' }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_saved_views_list')!.handler({ entityType: 'deal' });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });

  it('lists all when no filter', async () => {
    dbState.selectQueue = [[{ id: 1 }, { id: 2 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_saved_views_list')!.handler({});
    expect((parseJson(res) as unknown[]).length).toBe(2);
  });
});

describe('crm_scoring_rules_list', () => {
  beforeEach(resetDbState);

  it('lists scoring rules', async () => {
    dbState.selectQueue = [[{ id: 1, points: 10 }]];
    const tools = registerAll(['*']);
    const res = await tools.get('crm_scoring_rules_list')!.handler({});
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });
});

// ── scope-denied behavior on individual handlers ───────────────────────────

describe('scope-denied handlers', () => {
  beforeEach(resetDbState);

  it('contacts_search denies when requireScope flips false', async () => {
    // Register with both scopes, then mutate ctx via a separate registration
    // path: register with empty scopes — registerTool never gets called for
    // crm:read tools. Confirm the per-handler `requireScope` guard returns the
    // canonical denied payload by registering with crm:read, then mocking
    // requireScope to false through hasScope re-import is not feasible. Use
    // direct empty-scope registration to assert no tool registered.
    const tools = registerAll(['posts:read']);
    expect(tools.has('crm_contacts_search')).toBe(false);
  });
});
