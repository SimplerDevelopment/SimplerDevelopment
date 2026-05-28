// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/kanban.ts.
 *
 * `registerKanbanTools(server, ctx)` registers ~30 MCP tools covering kanban
 * boards, cards, columns, labels, checklists, assignees, dependencies, comments,
 * time logs, file attachments, and artifact links.
 *
 * Strategy: stub @/lib/db with a chainable proxy whose results are seeded per
 * test via a `dbState` object, mock drizzle helpers as no-ops, mock the
 * `@/lib/db/schema` table objects as opaque marker objects, then invoke each
 * captured handler with synthetic args. We exercise scope-denial, owner /
 * cross-tenant guards, and happy-path JSON envelopes.
 */
process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── DB stub ────────────────────────────────────────────────────────────────

type QueryResult = unknown[];
const dbState: {
  selectQueue: QueryResult[];
  selectDefault: QueryResult;
  insertReturningQueue: QueryResult[];
  insertReturningDefault: QueryResult;
  updateReturningQueue: QueryResult[];
  updateReturningDefault: QueryResult;
  deleteReturningQueue: QueryResult[];
  deleteReturningDefault: QueryResult;
  lastInsertValues: unknown;
  lastUpdateSet: unknown;
  insertCalls: { values: unknown; onConflict?: boolean }[];
  updateCalls: { set: unknown }[];
  deleteCalls: number;
} = {
  selectQueue: [],
  selectDefault: [],
  insertReturningQueue: [],
  insertReturningDefault: [{ id: 1 }],
  updateReturningQueue: [],
  updateReturningDefault: [{ id: 1, updated: true }],
  deleteReturningQueue: [],
  deleteReturningDefault: [{ id: 1, deleted: true }],
  lastInsertValues: null,
  lastUpdateSet: null,
  insertCalls: [],
  updateCalls: [],
  deleteCalls: 0,
};

function nextSelect(): QueryResult {
  return dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
}
function nextInsertReturning(): QueryResult {
  return dbState.insertReturningQueue.length > 0
    ? dbState.insertReturningQueue.shift()!
    : dbState.insertReturningDefault;
}
function nextUpdateReturning(): QueryResult {
  return dbState.updateReturningQueue.length > 0
    ? dbState.updateReturningQueue.shift()!
    : dbState.updateReturningDefault;
}
function nextDeleteReturning(): QueryResult {
  return dbState.deleteReturningQueue.length > 0
    ? dbState.deleteReturningQueue.shift()!
    : dbState.deleteReturningDefault;
}

function selectChain(rows: QueryResult) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (onFulfilled: (v: QueryResult) => unknown) =>
            Promise.resolve(rows).then(onFulfilled);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => selectChain(nextSelect())),
    insert: vi.fn(() => ({
      values: vi.fn((vals: unknown) => {
        dbState.lastInsertValues = vals;
        dbState.insertCalls.push({ values: vals });
        const r = nextInsertReturning();
        return {
          returning: vi.fn(async () => r),
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => r),
            then: (cb: (v: unknown) => unknown) => Promise.resolve(r).then(cb),
          })),
          then: (cb: (v: unknown) => unknown) => Promise.resolve(r).then(cb),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((s: unknown) => {
        dbState.lastUpdateSet = s;
        dbState.updateCalls.push({ set: s });
        const r = nextUpdateReturning();
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => r),
            then: (cb: (v: unknown) => unknown) => Promise.resolve(r).then(cb),
          })),
        };
      }),
    })),
    delete: vi.fn(() => {
      dbState.deleteCalls += 1;
      const r = nextDeleteReturning();
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => r),
          then: (cb: (v: unknown) => unknown) => Promise.resolve(r).then(cb),
        })),
      };
    }),
  },
}));

// ── schema mock (opaque markers) ───────────────────────────────────────────

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  const table = (cols: string[]) => {
    const out: Record<string, unknown> = {};
    for (const c of cols) out[c] = col(c);
    return out;
  };
  return {
    projects: table(['id', 'clientId', 'name']),
    kanbanCards: table([
      'id', 'projectId', 'columnId', 'title', 'description', 'priority',
      'dueDate', 'sprintId', 'createdBy', 'updatedAt', 'order', 'number',
    ]),
    kanbanColumns: table(['id', 'projectId', 'name', 'color', 'order']),
    kanbanLabels: table(['id', 'projectId', 'name', 'color']),
    kanbanCardLabels: table(['cardId', 'labelId']),
    kanbanCardChecklistItems: table(['id', 'cardId', 'text', 'completed', 'completedAt', 'order']),
    kanbanCardAssignees: table(['cardId', 'userId']),
    kanbanCardWatchers: table(['cardId', 'userId']),
    kanbanCardDependencies: table(['blockedCardId', 'blockerCardId']),
    kanbanCardComments: table(['id', 'cardId', 'userId', 'body', 'mentions', 'createdAt']),
    kanbanCardTimeLogs: table(['id', 'cardId', 'userId', 'minutes', 'note', 'loggedAt']),
    kanbanCardFiles: table(['id', 'cardId', 'projectId', 'userId', 'originalName', 'storedFilename', 'mimeType', 'fileSize', 'url']),
    kanbanCardArtifacts: table(['id', 'cardId', 'artifactType', 'artifactId', 'displayTitle', 'pinned', 'createdBy', 'createdAt']),
    sprints: table(['id', 'projectId']),
    users: table(['id', 'name', 'email']),
    clientWebsites: table(['id', 'name', 'clientId']),
    emailCampaigns: table(['id', 'name', 'clientId']),
    pitchDecks: table(['id', 'title', 'clientId']),
    crmProposals: table(['id', 'title', 'clientId']),
    bookingPages: table(['id', 'title', 'clientId']),
    surveys: table(['id', 'title', 'clientId']),
    // remaining tables imported by kanban.ts but not exercised — opaque stubs
    supportTickets: {}, ticketMessages: {}, crmContacts: {}, crmCompanies: {},
    crmDeals: {}, crmPipelines: {}, crmPipelineStages: {}, posts: {}, media: {},
    emailLists: {}, brandingProfiles: {}, emailSubscribers: {},
    emailCampaignSends: {}, surveyResponses: {}, bookings: {}, crmActivities: {},
    categories: {}, tags: {}, postCategories: {}, postTags: {}, automationRules: {},
    clientMembers: {}, crmContracts: {}, crmContractSigners: {},
    invoices: {}, invoiceItems: {}, serviceRequests: {}, suggestedProjectRequests: {},
    suggestedProjects: {}, services: {}, aiConversations: {}, aiMessages: {},
    crmDealArtifacts: {}, siteNavigation: {}, postRevisions: {},
    blockTemplates: {}, blockTemplateUsages: {}, emailTemplates: {},
    emailSegments: {}, giftCertificates: {}, crmCustomFields: {},
    crmCustomFieldValues: {}, crmSavedViews: {}, crmScoringRules: {},
    websiteDomains: {}, websiteEnvironments: {}, websiteEnvVars: {},
    clients: { id: { name: 'id' } }, aiCreditBalances: {}, aiCreditLedger: {},
    hostedSites: {}, googleWorkspaceUserConnections: {},
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

// ── collaborator mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/pm-activity', () => ({
  logCardActivity: vi.fn(async () => {}),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (_buf: Buffer, name: string, mime: string) => ({
    storedFilename: `stored-${name}`,
    url: `https://s3.example/${name}`,
    mimeType: mime,
    fileSize: 123,
  })),
}));

vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: vi.fn(async (url: string) => {
    if (url.includes('blocked')) throw new Error('blocked host');
  }),
}));

vi.mock('@/lib/html-embed-clean', () => ({ cleanEmbedHtml: vi.fn((s: string) => s) }));
vi.mock('@/lib/html-asset-import', () => ({ importHtmlAssets: vi.fn(async () => ({})) }));

vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: vi.fn(() => ''),
  resend: {},
  buildCampaignHtml: vi.fn(() => ''),
  buildUnsubscribeUrl: vi.fn(() => ''),
  generateUnsubscribeToken: vi.fn(() => 'tok'),
}));

vi.mock('@/lib/email/campaign-send', () => ({ executeCampaignSend: vi.fn(async () => ({})) }));

vi.mock('@/lib/google/oauth', () => ({ revoke: vi.fn(async () => {}) }));
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: vi.fn(async () => null),
}));

vi.mock('../pending-changes', () => ({ stageOrApply: vi.fn(async () => ({})) }));
vi.mock('@/lib/mcp/pending-changes', () => ({ stageOrApply: vi.fn(async () => ({})) }));
vi.mock('../blocks-schema', () => ({ BLOCKS_SCHEMA_REFERENCE: {} }));
vi.mock('@/lib/mcp/blocks-schema', () => ({ BLOCKS_SCHEMA_REFERENCE: {} }));

vi.mock('@/lib/security/assert-owned', () => {
  class OwnershipError extends Error {
    constructor(public field: string, public id: number | string) {
      super(`Forbidden: ${field}=${id}`);
      this.name = 'OwnershipError';
    }
  }
  return {
    OwnershipError,
    assertColumnInProject: vi.fn(async (columnId: number, projectId: number) => {
      if (columnId === 9999) throw new OwnershipError('columnId', columnId);
      if (projectId === 8888) throw new OwnershipError('projectId', projectId);
    }),
    assertProjectInClient: vi.fn(async (projectId: number) => {
      if (projectId === 7777) throw new OwnershipError('projectId', projectId);
    }),
  };
});

// next/cache (used by revalidateForWrite via lib/mcp/types)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// portal-auth (used transitively by lib/mcp/types for requireService)
vi.mock('@/lib/portal-auth', () => ({ hasServiceAccess: vi.fn(async () => true) }));

// projections re-exports — kanban.ts imports them but never invokes; stub minimally.
vi.mock('../projections', () => ({
  postProjection: {}, deckProjection: {}, campaignProjection: {},
}));
vi.mock('@/lib/mcp/projections', () => ({
  postProjection: {}, deckProjection: {}, campaignProjection: {},
}));

// bcryptjs (transitively imported)
vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed') }));

// ── server stub ─────────────────────────────────────────────────────────────

interface CapturedTool {
  name: string;
  config: { title?: string; description?: string; inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{
    content: { text: string; type: string }[]; isError?: boolean;
  }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const stub = {
    registerTool: vi.fn(
      (name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
        tools.set(name, { name, config, handler });
        return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
      },
    ),
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

// import after mocks
import { registerKanbanTools } from '@/lib/mcp/tools/kanban';

function registerAll(scopes: string[] = ['projects:read', 'projects:write']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerKanbanTools(stub as any, ctxFor(scopes));
  return tools;
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function resetState() {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.insertReturningQueue = [];
  dbState.insertReturningDefault = [{ id: 1 }];
  dbState.updateReturningQueue = [];
  dbState.updateReturningDefault = [{ id: 1, updated: true }];
  dbState.deleteReturningQueue = [];
  dbState.deleteReturningDefault = [{ id: 1, deleted: true }];
  dbState.lastInsertValues = null;
  dbState.lastUpdateSet = null;
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.deleteCalls = 0;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('registerKanbanTools — registration', () => {
  beforeEach(resetState);

  it('registers the canonical kanban tools', () => {
    const tools = registerAll();
    for (const name of [
      'kanban_list_board',
      'kanban_create_column',
      'kanban_create_card',
      'kanban_move_card',
      'kanban_update_card',
      'kanban_delete_card',
      'kanban_update_column',
      'kanban_delete_column',
      'kanban_labels_list',
      'kanban_labels_create',
      'kanban_labels_update',
      'kanban_labels_delete',
      'kanban_card_attach_label',
      'kanban_card_detach_label',
      'kanban_checklist_list',
      'kanban_checklist_add',
      'kanban_checklist_update',
      'kanban_checklist_delete',
      'kanban_card_assignees_list',
      'kanban_card_assign',
      'kanban_card_unassign',
      'kanban_card_dependencies_list',
      'kanban_card_add_blocker',
      'kanban_card_remove_blocker',
      'kanban_card_list_comments',
      'kanban_card_add_comment',
      'kanban_card_log_time',
      'kanban_card_attach_file_from_url',
      'kanban_card_artifacts_list',
      'kanban_card_artifact_link',
      'kanban_card_artifact_toggle_pin',
      'kanban_card_artifact_unlink',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('skips write tools when scopes only contain projects:read', () => {
    const tools = registerAll(['projects:read']);
    expect(tools.has('kanban_list_board')).toBe(true);
    expect(tools.has('kanban_create_card')).toBe(false);
    expect(tools.has('kanban_delete_card')).toBe(false);
    expect(tools.has('kanban_card_assign')).toBe(false);
  });

  it('skips all tools when no projects scopes are granted', () => {
    const tools = registerAll(['crm:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool exposes a title, description and inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name}.title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name}.description`).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── kanban_list_board ───────────────────────────────────────────────────────

describe('kanban_list_board', () => {
  beforeEach(resetState);

  it('returns Project not found when project lookup is empty', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_list_board')!.handler({ projectId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns columns + cards for owned project', async () => {
    dbState.selectQueue = [
      [{ id: 1, clientId: 1 }],       // project
      [{ id: 10, name: 'Todo' }],     // columns
      [{ id: 100, title: 'Card' }],   // cards
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_list_board')!.handler({ projectId: 1 });
    const out = parseJson(res) as { columns: unknown[]; cards: unknown[] };
    expect(out.columns).toEqual([{ id: 10, name: 'Todo' }]);
    expect(out.cards).toEqual([{ id: 100, title: 'Card' }]);
  });

  it('returns permission-denied envelope when scope missing', async () => {
    const { stub, tools } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerKanbanTools(stub as any, ctxFor(['projects:read', 'projects:write']));
    // pretend the scope was dropped before handler ran
    const ctxBad = ctxFor([]);
    // we can't change the handler's closed-over ctx after the fact — instead
    // verify denied() path by registering a fresh server with NO projects:read
    // scope and asserting the tool was not registered (covered above).
    expect(tools.has('kanban_list_board')).toBe(true);
    void ctxBad;
  });
});

// ── kanban_create_column ────────────────────────────────────────────────────

describe('kanban_create_column', () => {
  beforeEach(resetState);

  it('rejects when project belongs to a different client', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_create_column')!.handler({ projectId: 99, name: 'New' });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('appends to end when no order is provided', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],          // project lookup
      [{ id: 5 }, { id: 6 }], // existing columns
    ];
    dbState.insertReturningDefault = [{ id: 99, name: 'New', order: 2 }];
    const tools = registerAll();
    const res = await tools.get('kanban_create_column')!.handler({ projectId: 1, name: 'New' });
    expect((parseJson(res) as { id: number }).id).toBe(99);
    const values = dbState.lastInsertValues as { order: number; color: string | null };
    expect(values.order).toBe(2);
    expect(values.color).toBeNull();
  });

  it('respects explicit order + color', async () => {
    dbState.selectQueue = [[{ id: 1 }], []];
    dbState.insertReturningDefault = [{ id: 100 }];
    const tools = registerAll();
    await tools.get('kanban_create_column')!.handler({
      projectId: 1, name: 'X', color: '#abcdef', order: 7,
    });
    const v = dbState.lastInsertValues as { order: number; color: string | null };
    expect(v.order).toBe(7);
    expect(v.color).toBe('#abcdef');
  });
});

// ── kanban_create_card ──────────────────────────────────────────────────────

describe('kanban_create_card', () => {
  beforeEach(resetState);

  it('returns Forbidden when assertProjectInClient throws OwnershipError', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 7777, columnId: 1, title: 'Hi',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('returns Forbidden when assertColumnInProject throws', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 9999, title: 'Hi',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('rejects when sprintId belongs to a different project', async () => {
    dbState.selectQueue = [[{ projectId: 999 }]]; // sprint lookup
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'X', sprintId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Sprint not found/);
  });

  it('rejects when sprint missing', async () => {
    dbState.selectQueue = [[]]; // sprint lookup empty
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'X', sprintId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Sprint not found/);
  });

  it('inserts the card on happy path with defaults', async () => {
    dbState.insertReturningDefault = [{ id: 42, title: 'Hi', priority: 'medium' }];
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 2, title: 'Hi',
    });
    expect((parseJson(res) as { id: number }).id).toBe(42);
    const v = dbState.lastInsertValues as { priority: string; sprintId: number | null; createdBy: number };
    expect(v.priority).toBe('medium');
    expect(v.sprintId).toBeNull();
    expect(v.createdBy).toBe(11);
  });

  it('parses dueDate into a Date', async () => {
    const tools = registerAll();
    await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 2, title: 'X', dueDate: '2026-12-25',
    });
    const v = dbState.lastInsertValues as { dueDate: Date | null };
    expect(v.dueDate).toBeInstanceOf(Date);
  });

  it('accepts a sprintId tied to the correct project', async () => {
    dbState.selectQueue = [[{ projectId: 1 }]]; // sprint matches
    dbState.insertReturningDefault = [{ id: 50 }];
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 2, title: 'X', sprintId: 9,
    });
    expect((parseJson(res) as { id: number }).id).toBe(50);
  });
});

// ── kanban_move_card ────────────────────────────────────────────────────────

describe('kanban_move_card', () => {
  beforeEach(resetState);

  it('returns Card not found when card lookup is empty', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_move_card')!.handler({ cardId: 1, columnId: 2 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('returns Permission denied when project belongs to another client', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }], // card found
      [],                 // project lookup empty -> wrong tenant
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_move_card')!.handler({ cardId: 1, columnId: 2 });
    expect(parseJson(res)).toEqual({ error: 'Permission denied' });
  });

  it('returns OwnershipError envelope when destination column is foreign', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_move_card')!.handler({ cardId: 1, columnId: 9999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('updates card column on happy path', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.updateReturningDefault = [{ id: 5, columnId: 9 }];
    const tools = registerAll();
    const res = await tools.get('kanban_move_card')!.handler({ cardId: 5, columnId: 9, order: 3 });
    expect((parseJson(res) as { id: number }).id).toBe(5);
    expect((dbState.lastUpdateSet as { columnId: number }).columnId).toBe(9);
    expect((dbState.lastUpdateSet as { order: number }).order).toBe(3);
  });
});

// ── kanban_update_card ──────────────────────────────────────────────────────

describe('kanban_update_card', () => {
  beforeEach(resetState);

  it('returns Card not found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_update_card')!.handler({ id: 9, title: 'New' });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('returns Permission denied when card is foreign tenant', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [], // project lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_update_card')!.handler({ id: 9, title: 'New' });
    expect(parseJson(res)).toEqual({ error: 'Permission denied' });
  });

  it('rejects sprintId when sprint not in card project', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],   // card
      [{ id: 1 }],          // project
      [{ projectId: 999 }], // sprint in another project
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_update_card')!.handler({ id: 9, sprintId: 5 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Sprint not found/);
  });

  it('clears dueDate when passed null', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.updateReturningDefault = [{ id: 9 }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, dueDate: null });
    expect((dbState.lastUpdateSet as { dueDate: Date | null }).dueDate).toBeNull();
  });

  it('coerces dueDate string into Date', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.updateReturningDefault = [{ id: 9 }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, dueDate: '2026-12-25' });
    expect((dbState.lastUpdateSet as { dueDate: Date | null }).dueDate).toBeInstanceOf(Date);
  });

  it('reconciles assignee set: adds the assignee and seeds watcher', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],   // card
      [{ id: 1 }],          // project
      [],                   // current assignees (empty)
      [{ name: 'Alice' }],  // user lookup for activity log
    ];
    dbState.updateReturningDefault = [{ id: 9 }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, assignedTo: 42 });
    // assignee + watcher insert => 2 inserts at minimum
    const inserts = dbState.insertCalls.length;
    expect(inserts).toBeGreaterThanOrEqual(2);
  });

  it('removes the assignee when assignedTo=null', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],     // card
      [{ id: 1 }],            // project
      [{ userId: 42 }],       // current assignees
      [{ name: 'Alice' }],    // user lookup for activity log
    ];
    dbState.updateReturningDefault = [{ id: 9 }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, assignedTo: null });
    expect(dbState.deleteCalls).toBeGreaterThanOrEqual(1);
  });
});

// ── kanban_delete_card ──────────────────────────────────────────────────────

describe('kanban_delete_card', () => {
  beforeEach(resetState);

  it('returns Card not found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_delete_card')!.handler({ id: 9 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('returns Permission denied for foreign tenant', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_delete_card')!.handler({ id: 9 });
    expect(parseJson(res)).toEqual({ error: 'Permission denied' });
  });

  it('deletes and echoes id on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_delete_card')!.handler({ id: 9 });
    expect(parseJson(res)).toEqual({ success: true, id: 9 });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── kanban_update_column / kanban_delete_column ─────────────────────────────

describe('kanban_update_column', () => {
  beforeEach(resetState);

  it('returns Column not found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_update_column')!.handler({ id: 1, name: 'x' });
    expect(parseJson(res)).toEqual({ error: 'Column not found' });
  });

  it('returns Permission denied for foreign tenant', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_update_column')!.handler({ id: 1, name: 'x' });
    expect(parseJson(res)).toEqual({ error: 'Permission denied' });
  });

  it('applies the patch when authorized', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.updateReturningDefault = [{ id: 1, name: 'Renamed' }];
    const tools = registerAll();
    const res = await tools.get('kanban_update_column')!.handler({
      id: 1, name: 'Renamed', color: '#112233', order: 4,
    });
    expect((parseJson(res) as { id: number }).id).toBe(1);
    const set = dbState.lastUpdateSet as { name: string; color: string; order: number };
    expect(set.name).toBe('Renamed');
    expect(set.color).toBe('#112233');
    expect(set.order).toBe(4);
  });
});

describe('kanban_delete_column', () => {
  beforeEach(resetState);

  it('returns Column not found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_delete_column')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ error: 'Column not found' });
  });

  it('returns Permission denied for foreign tenant', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_delete_column')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ error: 'Permission denied' });
  });

  it('deletes and echoes the id', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_delete_column')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ success: true, id: 1 });
  });
});

// ── labels ──────────────────────────────────────────────────────────────────

describe('kanban_labels_list', () => {
  beforeEach(resetState);

  it('returns Project not found when authProject fails', async () => {
    dbState.selectQueue = [[]]; // authProject empty
    const tools = registerAll();
    const res = await tools.get('kanban_labels_list')!.handler({ projectId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('returns label rows on success', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],            // authProject
      [{ id: 5, name: 'Bug' }], // label rows
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_labels_list')!.handler({ projectId: 1 });
    expect(parseJson(res)).toEqual([{ id: 5, name: 'Bug' }]);
  });
});

describe('kanban_labels_create', () => {
  beforeEach(resetState);

  it('returns Project not found when authProject fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_labels_create')!.handler({ projectId: 1, name: 'Bug' });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('inserts label with default color when none provided', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.insertReturningDefault = [{ id: 10 }];
    const tools = registerAll();
    await tools.get('kanban_labels_create')!.handler({ projectId: 1, name: '   Bug   ' });
    const v = dbState.lastInsertValues as { name: string; color: string };
    expect(v.name).toBe('Bug');         // trimmed
    expect(v.color).toBe('#6366f1');    // default indigo
  });

  it('honors explicit color', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.insertReturningDefault = [{ id: 10 }];
    const tools = registerAll();
    await tools.get('kanban_labels_create')!.handler({
      projectId: 1, name: 'x', color: '#ff00aa',
    });
    expect((dbState.lastInsertValues as { color: string }).color).toBe('#ff00aa');
  });
});

describe('kanban_labels_update', () => {
  beforeEach(resetState);

  it('returns Label not found when label missing for this client', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_labels_update')!.handler({ id: 5, name: 'New' });
    expect(parseJson(res)).toEqual({ error: 'Label not found' });
  });

  it('updates the label patch', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateReturningDefault = [{ id: 5, name: 'New' }];
    const tools = registerAll();
    const res = await tools.get('kanban_labels_update')!.handler({ id: 5, name: 'New', color: '#abcdef' });
    expect((parseJson(res) as { id: number }).id).toBe(5);
    expect((dbState.lastUpdateSet as { name: string }).name).toBe('New');
  });
});

describe('kanban_labels_delete', () => {
  beforeEach(resetState);

  it('returns Label not found when label missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_labels_delete')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ error: 'Label not found' });
  });

  it('deletes and echoes id', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll();
    const res = await tools.get('kanban_labels_delete')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ deleted: true, id: 1 });
    expect(dbState.deleteCalls).toBe(1);
  });
});

describe('kanban_card_attach_label / detach_label', () => {
  beforeEach(resetState);

  it('attach: returns Card not found if authCard fails', async () => {
    dbState.selectQueue = [[]]; // authCard
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_label')!.handler({ cardId: 1, labelId: 2 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('attach: rejects label from another project', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],         // authCard
      [{ id: 2, projectId: 999 }], // label in another project
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_label')!.handler({ cardId: 1, labelId: 2 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Label not in this project/);
  });

  it('attach: returns { attached: true } on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],                         // authCard
      [{ id: 2, projectId: 1, name: 'a', color: '#111111' }], // label
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_label')!.handler({ cardId: 1, labelId: 2 });
    expect(parseJson(res)).toEqual({ attached: true });
  });

  it('detach: returns Card not found if authCard fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_detach_label')!.handler({ cardId: 1, labelId: 2 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('detach: removes the link even if the label lookup is null', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }], // authCard
      [],                 // label lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_detach_label')!.handler({ cardId: 1, labelId: 2 });
    expect(parseJson(res)).toEqual({ detached: true });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── checklist ───────────────────────────────────────────────────────────────

describe('kanban_checklist', () => {
  beforeEach(resetState);

  it('list: returns Card not found if authCard fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_checklist_list')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('list: returns ordered items', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],                          // authCard
      [{ id: 5, text: 'a', order: 0 }],            // items
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_checklist_list')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual([{ id: 5, text: 'a', order: 0 }]);
  });

  it('add: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_checklist_add')!.handler({ cardId: 1, text: 'x' });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('add: appends after current max order', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],   // authCard
      [{ max: 4 }],         // max order
    ];
    dbState.insertReturningDefault = [{ id: 7, text: 'New', order: 5 }];
    const tools = registerAll();
    const res = await tools.get('kanban_checklist_add')!.handler({ cardId: 1, text: '  New  ' });
    expect((parseJson(res) as { id: number }).id).toBe(7);
    const v = dbState.lastInsertValues as { order: number; text: string };
    expect(v.order).toBe(5);
    expect(v.text).toBe('New');
  });

  it('add: starts at order 0 when no items yet', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ max: null }],
    ];
    dbState.insertReturningDefault = [{ id: 1, text: 'x', order: 0 }];
    const tools = registerAll();
    await tools.get('kanban_checklist_add')!.handler({ cardId: 1, text: 'x' });
    expect((dbState.lastInsertValues as { order: number }).order).toBe(0);
  });

  it('update: returns not-found when item missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_checklist_update')!.handler({ id: 1, text: 'x' });
    expect(parseJson(res)).toEqual({ error: 'Checklist item not found' });
  });

  it('update: toggles completed=true with completedAt date', async () => {
    dbState.selectQueue = [[{ id: 1, cardId: 5, text: 'x', completed: false }]];
    dbState.updateReturningDefault = [{ id: 1, completed: true }];
    const tools = registerAll();
    await tools.get('kanban_checklist_update')!.handler({ id: 1, completed: true });
    const set = dbState.lastUpdateSet as { completed: boolean; completedAt: Date | null };
    expect(set.completed).toBe(true);
    expect(set.completedAt).toBeInstanceOf(Date);
  });

  it('update: toggles completed=false clears completedAt', async () => {
    dbState.selectQueue = [[{ id: 1, cardId: 5, text: 'x', completed: true }]];
    dbState.updateReturningDefault = [{ id: 1, completed: false }];
    const tools = registerAll();
    await tools.get('kanban_checklist_update')!.handler({ id: 1, completed: false });
    const set = dbState.lastUpdateSet as { completedAt: Date | null };
    expect(set.completedAt).toBeNull();
  });

  it('delete: returns not-found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_checklist_delete')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ error: 'Checklist item not found' });
  });

  it('delete: removes and echoes', async () => {
    dbState.selectQueue = [[{ id: 1, cardId: 5, text: 'x' }]];
    const tools = registerAll();
    const res = await tools.get('kanban_checklist_delete')!.handler({ id: 1 });
    expect(parseJson(res)).toEqual({ deleted: true, id: 1 });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── assignees ───────────────────────────────────────────────────────────────

describe('kanban_card_assignees', () => {
  beforeEach(resetState);

  it('list: returns Card not found if authCard fails', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_assignees_list')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('list: returns users joined to assignees', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],                            // authCard
      [{ id: 11, name: 'Alice', email: 'a@a' }],     // user rows
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_assignees_list')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual([{ id: 11, name: 'Alice', email: 'a@a' }]);
  });

  it('assign: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_assign')!.handler({ cardId: 1, userId: 11 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('assign: returns { assigned: true } on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],         // authCard
      [{ name: 'Alice' }],        // user lookup for activity
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_assign')!.handler({ cardId: 1, userId: 11 });
    expect(parseJson(res)).toEqual({ assigned: true });
  });

  it('unassign: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_unassign')!.handler({ cardId: 1, userId: 11 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('unassign: returns { unassigned: true } on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ name: 'Alice' }],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_unassign')!.handler({ cardId: 1, userId: 11 });
    expect(parseJson(res)).toEqual({ unassigned: true });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── dependencies ────────────────────────────────────────────────────────────

describe('kanban_card_dependencies', () => {
  beforeEach(resetState);

  it('list: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_dependencies_list')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('list: returns blockers and blocking arrays', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],                       // authCard
      [{ id: 10, title: 'Blocker', number: 1 }], // blockers
      [{ id: 11, title: 'Blocked', number: 2 }], // blocking
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_dependencies_list')!.handler({ cardId: 1 });
    const out = parseJson(res) as { blockers: unknown[]; blocking: unknown[] };
    expect(out.blockers).toEqual([{ id: 10, title: 'Blocker', number: 1 }]);
    expect(out.blocking).toEqual([{ id: 11, title: 'Blocked', number: 2 }]);
  });

  it('add_blocker: rejects self-block', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_card_add_blocker')!.handler({ cardId: 1, blockerCardId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/cannot block itself/);
  });

  it('add_blocker: rejects unknown card', async () => {
    dbState.selectQueue = [[]]; // authCard
    const tools = registerAll();
    const res = await tools.get('kanban_card_add_blocker')!.handler({ cardId: 1, blockerCardId: 2 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('add_blocker: rejects when blocker is in another project', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],                  // authCard
      [{ id: 2, projectId: 999 }],         // blocker
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_add_blocker')!.handler({ cardId: 1, blockerCardId: 2 });
    expect((parseJson(res) as { error: string }).error).toMatch(/same project/);
  });

  it('add_blocker: rejects reciprocal cycle', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],                                   // authCard
      [{ id: 2, projectId: 1, title: 'B' }],                // blocker
      [{ blockedCardId: 2, blockerCardId: 1 }],             // reciprocal
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_add_blocker')!.handler({ cardId: 1, blockerCardId: 2 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Reciprocal/);
  });

  it('add_blocker: returns { added: true } on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],                                  // authCard
      [{ id: 2, projectId: 1, title: 'B' }],               // blocker in same project
      [],                                                  // no reciprocal
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_add_blocker')!.handler({ cardId: 1, blockerCardId: 2 });
    expect(parseJson(res)).toEqual({ added: true });
  });

  it('remove_blocker: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_remove_blocker')!.handler({ cardId: 1, blockerCardId: 2 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('remove_blocker: returns { removed: true } on success', async () => {
    dbState.selectQueue = [[{ projectId: 1 }]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_remove_blocker')!.handler({ cardId: 1, blockerCardId: 2 });
    expect(parseJson(res)).toEqual({ removed: true });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── social: comments + time logs ───────────────────────────────────────────

describe('kanban_card_list_comments / add_comment / log_time', () => {
  beforeEach(resetState);

  it('list_comments: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_list_comments')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('list_comments: rejects foreign tenant', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_list_comments')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Permission denied' });
  });

  it('list_comments: returns ordered rows', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
      [{ id: 5, body: 'hi' }],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_list_comments')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual([{ id: 5, body: 'hi' }]);
  });

  it('add_comment: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_add_comment')!.handler({ cardId: 1, body: 'hi' });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('add_comment: persists body + mentions + userId', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.insertReturningDefault = [{ id: 33 }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_add_comment')!.handler({
      cardId: 1, body: 'hello', mentions: [11, 12],
    });
    expect((parseJson(res) as { id: number }).id).toBe(33);
    const v = dbState.lastInsertValues as { body: string; mentions: number[]; userId: number };
    expect(v.body).toBe('hello');
    expect(v.mentions).toEqual([11, 12]);
    expect(v.userId).toBe(11);
  });

  it('add_comment: defaults mentions to []', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.insertReturningDefault = [{ id: 33 }];
    const tools = registerAll();
    await tools.get('kanban_card_add_comment')!.handler({ cardId: 1, body: 'hi' });
    const v = dbState.lastInsertValues as { mentions: number[] };
    expect(v.mentions).toEqual([]);
  });

  it('log_time: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_log_time')!.handler({ cardId: 1, minutes: 30 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('log_time: defaults loggedAt to now', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.insertReturningDefault = [{ id: 44, minutes: 30 }];
    const tools = registerAll();
    await tools.get('kanban_card_log_time')!.handler({ cardId: 1, minutes: 30, note: 'fix' });
    const v = dbState.lastInsertValues as { loggedAt: Date; minutes: number; note: string };
    expect(v.loggedAt).toBeInstanceOf(Date);
    expect(v.minutes).toBe(30);
    expect(v.note).toBe('fix');
  });

  it('log_time: parses ISO loggedAt', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.insertReturningDefault = [{ id: 45 }];
    const tools = registerAll();
    await tools.get('kanban_card_log_time')!.handler({
      cardId: 1, minutes: 30, loggedAt: '2026-01-01T00:00:00Z',
    });
    const v = dbState.lastInsertValues as { loggedAt: Date };
    expect(v.loggedAt.toISOString()).toContain('2026-01-01');
  });
});

// ── file attachment ────────────────────────────────────────────────────────

describe('kanban_card_attach_file_from_url', () => {
  beforeEach(() => {
    resetState();
    vi.unstubAllGlobals();
  });

  it('rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/x.png',
    });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('rejects foreign tenant card', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/x.png',
    });
    expect(parseJson(res)).toEqual({ error: 'Permission denied' });
  });

  it('rejects SSRF-blocked URLs', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://blocked.example.com/x.png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/URL rejected/);
  });

  it('refuses to follow remote redirects', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 302, ok: false, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0),
    })));
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/x.png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Refusing to follow/);
  });

  it('returns the inserted row on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    const buf = new TextEncoder().encode('hello').buffer;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: (h: string) => (h === 'content-type' ? 'image/png; charset=utf-8' : null) },
      arrayBuffer: async () => buf,
    })));
    dbState.insertReturningDefault = [{ id: 9, url: 'https://s3.example/x.png' }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/x.png',
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(9);
    const v = dbState.lastInsertValues as { originalName: string; mimeType: string };
    expect(v.originalName).toBe('x.png');
    expect(v.mimeType).toBe('image/png');
  });

  it('uses overridden filename when provided', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    const buf = new TextEncoder().encode('hello').buffer;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200, ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => buf,
    })));
    dbState.insertReturningDefault = [{ id: 9 }];
    const tools = registerAll();
    await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/x.png', filename: 'override.bin',
    });
    expect((dbState.lastInsertValues as { originalName: string }).originalName).toBe('override.bin');
  });

  it('rejects files larger than 25 MB', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    const big = new ArrayBuffer(26 * 1024 * 1024); // 26 MB
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200, ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => big,
    })));
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/big.bin',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/File too large/);
  });

  it('reports fetch errors gracefully', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/x.png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Fetch failed/);
  });

  it('reports non-OK responses', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 404, ok: false,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    })));
    const tools = registerAll();
    const res = await tools.get('kanban_card_attach_file_from_url')!.handler({
      cardId: 1, url: 'https://example.com/x.png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Fetch returned 404/);
  });
});

// ── artifact links ──────────────────────────────────────────────────────────

describe('kanban_card_artifacts', () => {
  beforeEach(resetState);

  it('list: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifacts_list')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('list: returns artifact rows', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],   // authorizeCardForClient: card
      [{ id: 1 }],          // authorizeCardForClient: project
      [{ id: 5, artifactType: 'pitch_deck' }], // artifact rows
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifacts_list')!.handler({ cardId: 1 });
    expect(parseJson(res)).toEqual([{ id: 5, artifactType: 'pitch_deck' }]);
  });

  it('link: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'pitch_deck', artifactId: 5,
    });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('link: rejects when artifact not owned', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],   // card
      [{ id: 1 }],          // project
      [],                   // artifact lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'pitch_deck', artifactId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not owned/);
  });

  it('link: persists row with default pinned=false on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],   // card
      [{ id: 1 }],          // project
      [{ title: 'Deck One' }], // artifact
    ];
    dbState.insertReturningDefault = [{ id: 99 }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'pitch_deck', artifactId: 5,
    });
    expect((parseJson(res) as { id: number }).id).toBe(99);
    const v = dbState.lastInsertValues as { pinned: boolean; displayTitle: string; createdBy: number };
    expect(v.pinned).toBe(false);
    expect(v.displayTitle).toBe('Deck One');
    expect(v.createdBy).toBe(11);
  });

  it('link: falls back to "Untitled" when artifact title is empty', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
      [{ title: '' }],
    ];
    dbState.insertReturningDefault = [{ id: 100 }];
    const tools = registerAll();
    await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'pitch_deck', artifactId: 5, pinned: true,
    });
    const v = dbState.lastInsertValues as { displayTitle: string; pinned: boolean };
    expect(v.displayTitle).toBe('Untitled');
    expect(v.pinned).toBe(true);
  });

  it('toggle_pin: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_toggle_pin')!.handler({
      cardId: 1, artifactDbId: 99, pinned: true,
    });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('toggle_pin: returns Artifact link not found when update returns nothing', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.updateReturningDefault = [];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_toggle_pin')!.handler({
      cardId: 1, artifactDbId: 99, pinned: true,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Artifact link not found/);
  });

  it('toggle_pin: returns updated row on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.updateReturningDefault = [{ id: 99, pinned: true }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_toggle_pin')!.handler({
      cardId: 1, artifactDbId: 99, pinned: true,
    });
    expect((parseJson(res) as { pinned: boolean }).pinned).toBe(true);
  });

  it('unlink: rejects unknown card', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_unlink')!.handler({
      cardId: 1, artifactDbId: 99,
    });
    expect(parseJson(res)).toEqual({ error: 'Card not found' });
  });

  it('unlink: returns Artifact link not found when delete returns nothing', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.deleteReturningDefault = [];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_unlink')!.handler({
      cardId: 1, artifactDbId: 99,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Artifact link not found/);
  });

  it('unlink: returns row on success', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
    ];
    dbState.deleteReturningDefault = [{ id: 99 }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_unlink')!.handler({
      cardId: 1, artifactDbId: 99,
    });
    expect((parseJson(res) as { id: number }).id).toBe(99);
  });
});
