// @vitest-environment node
/**
 * Supplemental unit tests for lib/mcp/tools/kanban.ts.
 *
 * Covers tools NOT exercised in mcp-tools-kanban.test.ts:
 *   - kanban_card_templates_list / _create / _delete
 *   - kanban_propose_sprint (velocity + proposal path)
 *   - kanban_recurrences_list / _create / _delete
 *
 * Also covers uncovered branches in already-present tools:
 *   - kanban_create_card: fromTemplateId path, parentCardId validation,
 *     template labels + checklist seeding, WIP limit rejection
 *   - kanban_move_card: WIP limit rejection, column-move recording
 *   - kanban_update_card: sprint add/remove tracking
 *
 * Mocking strategy mirrors mcp-tools-kanban.test.ts exactly.
 */
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test_dummy';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── DB stub (same shape as mcp-tools-kanban.test.ts) ───────────────────────

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
            catch: vi.fn(() => Promise.resolve()),
          })),
          catch: vi.fn(() => Promise.resolve()),
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

// ── schema mock ─────────────────────────────────────────────────────────────

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
      'storyPoints', 'cardType', 'parentCardId', 'workflowState', 'sprintOrder',
      'campaignId', 'scheduledFor', 'createdAt',
    ]),
    kanbanColumns: table(['id', 'projectId', 'name', 'color', 'order', 'isDone']),
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
    sprints: table(['id', 'projectId', 'status', 'endDate', 'name']),
    sprintScopeHistory: table(['id', 'sprintId', 'action', 'points', 'occurredAt']),
    cardTemplates: table(['id', 'clientId', 'projectId', 'name', 'description', 'payload', 'createdBy']),
    cardRecurrences: table(['id', 'projectId', 'columnId', 'templateId', 'titlePattern', 'description', 'cadence', 'dayOfWeek', 'dayOfMonth', 'hourUtc', 'nextFireAt', 'createdBy']),
    users: table(['id', 'name', 'email']),
    clientWebsites: table(['id', 'name', 'clientId']),
    emailCampaigns: table(['id', 'name', 'clientId']),
    pitchDecks: table(['id', 'title', 'clientId']),
    crmProposals: table(['id', 'title', 'clientId']),
    bookingPages: table(['id', 'title', 'clientId']),
    surveys: table(['id', 'title', 'clientId']),
    // remaining tables: opaque stubs
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

// ── collaborator mocks ───────────────────────────────────────────────────────

vi.mock('@/lib/pm-activity', () => ({
  logCardActivity: vi.fn(async () => {}),
}));

vi.mock('@/lib/portal/sprint-snapshots', () => ({
  recordCardAddedToSprint: vi.fn(async () => {}),
  recordCardRemovedFromSprint: vi.fn(async () => {}),
  recordCardColumnMove: vi.fn(async () => {}),
}));

vi.mock('@/lib/portal/sprint-planner', () => ({
  computeSprintProposal: vi.fn((_cards: unknown, _opts: unknown) => ({
    recommended: [],
    skipped: [],
    blocked: [],
    unsized: [],
    warnings: [],
    totalPoints: 0,
  })),
}));

vi.mock('@/lib/portal/sprint-charts', () => ({
  computeSprintTotals: vi.fn(() => ({ committed: 0, completed: 0 })),
  computeVelocityAverages: vi.fn(() => ({ averageCommitted: 0, averageCompleted: 0 })),
}));

vi.mock('@/lib/portal/wip-limit', () => ({
  checkWipLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/portal/recurrence-scheduler', () => ({
  computeNextFireAt: vi.fn((_now: Date, _cfg: unknown) => new Date('2026-07-01T09:00:00Z')),
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/portal-auth', () => ({ hasServiceAccess: vi.fn(async () => true) }));

vi.mock('../projections', () => ({
  postProjection: {}, deckProjection: {}, campaignProjection: {},
}));
vi.mock('@/lib/mcp/projections', () => ({
  postProjection: {}, deckProjection: {}, campaignProjection: {},
}));

vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed') }));

// ── server stub ──────────────────────────────────────────────────────────────

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

// import after all mocks
import { registerKanbanTools } from '@/lib/mcp/tools/kanban';
import { checkWipLimit } from '@/lib/portal/wip-limit';
import { computeSprintProposal } from '@/lib/portal/sprint-planner';
import { computeSprintTotals, computeVelocityAverages } from '@/lib/portal/sprint-charts';
import { recordCardAddedToSprint, recordCardRemovedFromSprint, recordCardColumnMove } from '@/lib/portal/sprint-snapshots';

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
  vi.mocked(checkWipLimit).mockResolvedValue({ allowed: true } as ReturnType<typeof checkWipLimit> extends Promise<infer T> ? T : never);
}

// ── Registration: newer tools ────────────────────────────────────────────────

describe('registerKanbanTools — newer tool registration', () => {
  beforeEach(resetState);

  it('registers templates + sprint-proposal + recurrences tools', () => {
    const tools = registerAll();
    for (const name of [
      'kanban_card_templates_list',
      'kanban_card_templates_create',
      'kanban_card_templates_delete',
      'kanban_propose_sprint',
      'kanban_recurrences_list',
      'kanban_recurrences_create',
      'kanban_recurrences_delete',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('templates write-tools not registered without projects:write scope', () => {
    const tools = registerAll(['projects:read']);
    expect(tools.has('kanban_card_templates_list')).toBe(true);
    expect(tools.has('kanban_card_templates_create')).toBe(false);
    expect(tools.has('kanban_card_templates_delete')).toBe(false);
    expect(tools.has('kanban_recurrences_create')).toBe(false);
    expect(tools.has('kanban_recurrences_delete')).toBe(false);
  });
});

// ── kanban_card_templates_list ───────────────────────────────────────────────

describe('kanban_card_templates_list', () => {
  beforeEach(resetState);

  it('returns Forbidden when assertProjectInClient throws OwnershipError', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_list')!.handler({ projectId: 7777 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('returns template rows for owned project', async () => {
    dbState.selectDefault = [
      { id: 5, name: 'Sprint Start', clientId: 1, projectId: 1 },
      { id: 6, name: 'Global Template', clientId: 1, projectId: null },
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_list')!.handler({ projectId: 1 });
    const rows = parseJson(res) as { id: number }[];
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(5);
  });

  it('returns empty array when no templates exist', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_list')!.handler({ projectId: 1 });
    expect(parseJson(res)).toEqual([]);
  });
});

// ── kanban_card_templates_create ─────────────────────────────────────────────

describe('kanban_card_templates_create', () => {
  beforeEach(resetState);

  it('returns Forbidden when assertProjectInClient throws', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_create')!.handler({
      projectId: 7777, name: 'Tpl',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('creates a project-scoped template', async () => {
    dbState.insertReturningDefault = [{ id: 10, name: 'Bug Report', projectId: 1 }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_create')!.handler({
      projectId: 1,
      name: '  Bug Report  ',
      payload: {},
    });
    expect((parseJson(res) as { id: number }).id).toBe(10);
    const v = dbState.lastInsertValues as { name: string; projectId: number | null; clientId: number };
    expect(v.name).toBe('Bug Report');
    expect(v.projectId).toBe(1); // project-scoped
    expect(v.clientId).toBe(1);
  });

  it('creates a client-wide template when clientWide=true', async () => {
    dbState.insertReturningDefault = [{ id: 11, projectId: null }];
    const tools = registerAll();
    await tools.get('kanban_card_templates_create')!.handler({
      projectId: 1, name: 'Global', clientWide: true, payload: {},
    });
    const v = dbState.lastInsertValues as { projectId: number | null };
    expect(v.projectId).toBeNull();
  });

  it('normalizes checklist order in payload', async () => {
    dbState.insertReturningDefault = [{ id: 12 }];
    const tools = registerAll();
    await tools.get('kanban_card_templates_create')!.handler({
      projectId: 1,
      name: 'With checklist',
      payload: {
        checklist: [
          { text: 'Step one' },
          { text: 'Step two', order: 99 },
        ],
      },
    });
    const v = dbState.lastInsertValues as {
      payload: { checklist: { text: string; order: number }[] };
    };
    expect(v.payload.checklist[0].order).toBe(0);   // idx-derived
    expect(v.payload.checklist[1].order).toBe(99);  // explicit
  });

  it('stores description slice up to 5000 chars', async () => {
    dbState.insertReturningDefault = [{ id: 13 }];
    const tools = registerAll();
    const longDesc = 'x'.repeat(6000);
    await tools.get('kanban_card_templates_create')!.handler({
      projectId: 1, name: 'Tpl', description: longDesc, payload: {},
    });
    const v = dbState.lastInsertValues as { description: string };
    expect(v.description.length).toBe(5000);
  });
});

// ── kanban_card_templates_delete ─────────────────────────────────────────────

describe('kanban_card_templates_delete', () => {
  beforeEach(resetState);

  it('returns Template not found when template is missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_delete')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Template not found/);
  });

  it('returns Template not found when clientId mismatch', async () => {
    dbState.selectDefault = [{ clientId: 999 }]; // different client
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_delete')!.handler({ id: 5 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Template not found/);
  });

  it('deletes and returns { ok: true } when authorized', async () => {
    dbState.selectDefault = [{ clientId: 1 }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_templates_delete')!.handler({ id: 5 });
    expect(parseJson(res)).toEqual({ ok: true });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── kanban_propose_sprint ────────────────────────────────────────────────────

describe('kanban_propose_sprint', () => {
  beforeEach(resetState);

  it('returns Forbidden when assertProjectInClient throws', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_propose_sprint')!.handler({ projectId: 7777 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('returns proposal with zero velocity when no completed sprints', async () => {
    // selectQueue: [completed sprints (empty), backlog cards, (no blocker rows since cardIds empty)]
    dbState.selectQueue = [
      [],  // no completed sprints
      [],  // no backlog cards
    ];
    vi.mocked(computeSprintProposal).mockReturnValueOnce({
      recommended: [],
      skipped: [],
      blocked: [],
      unsized: [],
      warnings: [],
      totalPoints: 0,
    });
    const tools = registerAll();
    const res = await tools.get('kanban_propose_sprint')!.handler({ projectId: 1 });
    const out = parseJson(res) as {
      velocityBaseline: number;
      velocityWindowSprints: number;
      backlogTotal: number;
    };
    expect(out.velocityBaseline).toBe(0);
    expect(out.velocityWindowSprints).toBe(0);
    expect(out.backlogTotal).toBe(0);
  });

  it('computes velocity from completed sprints and passes proposal result', async () => {
    const sprint = { id: 1, name: 'Sprint 1', endDate: '2026-05-01' };
    const backlogCard = {
      id: 10, number: 1, title: 'Fix bug', storyPoints: 3,
      cardType: 'bug', sprintOrder: null, order: 0,
    };
    // selectQueue: completed sprints, sprint scope history, backlog cards, blocker rows
    dbState.selectQueue = [
      [sprint],             // completed sprints
      [],                   // sprint scope history (empty => zero points)
      [backlogCard],        // backlog cards
      [],                   // blocker rows (cardIds non-empty so query runs, returns nothing)
    ];
    vi.mocked(computeSprintTotals).mockReturnValue({ committed: 5, completed: 3 });
    vi.mocked(computeVelocityAverages).mockReturnValue({
      averageCommitted: 5,
      averageCompleted: 3,
    });
    vi.mocked(computeSprintProposal).mockReturnValueOnce({
      recommended: [{ id: 10, number: 1, title: 'Fix bug', storyPoints: 3, cardType: 'bug', blockerCardIds: [] }],
      skipped: [],
      blocked: [],
      unsized: [],
      warnings: [],
      totalPoints: 3,
    });
    const tools = registerAll();
    const res = await tools.get('kanban_propose_sprint')!.handler({
      projectId: 1, targetPoints: 10, velocityWindow: 3,
    });
    const out = parseJson(res) as {
      velocityBaseline: number;
      velocityWindowSprints: number;
      backlogTotal: number;
      recommended: unknown[];
    };
    expect(out.velocityBaseline).toBe(3);
    expect(out.velocityWindowSprints).toBe(1);
    expect(out.backlogTotal).toBe(1);
    expect(out.recommended).toHaveLength(1);
  });

  it('passes requireCardIds through to computeSprintProposal', async () => {
    dbState.selectQueue = [[], []]; // no sprints, no backlog
    vi.mocked(computeSprintProposal).mockReturnValueOnce({
      recommended: [], skipped: [], blocked: [], unsized: [], warnings: [], totalPoints: 0,
    });
    const tools = registerAll();
    await tools.get('kanban_propose_sprint')!.handler({
      projectId: 1, requireCardIds: [5, 6],
    });
    expect(computeSprintProposal).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ requireCardIds: [5, 6] }),
    );
  });

  it('filters blocker rows: done-column blockers do not count as unresolved', async () => {
    const sprint = { id: 1, name: 'Sprint 1', endDate: '2026-05-01' };
    const card = { id: 20, number: 2, title: 'Task', storyPoints: 2, cardType: 'task', sprintOrder: 0, order: 0 };
    dbState.selectQueue = [
      [sprint],
      [],                   // scope history
      [card],               // backlog
      // blocker rows: one done (filtered out), one not done
      [
        { blockedCardId: 20, blockerCardId: 30, blockerColumnIsDone: true },   // done => skip
        { blockedCardId: 20, blockerCardId: 31, blockerColumnIsDone: false },  // not done => kept
      ],
    ];
    vi.mocked(computeSprintTotals).mockReturnValue({ committed: 0, completed: 0 });
    vi.mocked(computeVelocityAverages).mockReturnValue({ averageCommitted: 0, averageCompleted: 0 });
    vi.mocked(computeSprintProposal).mockReturnValueOnce({
      recommended: [], skipped: [], blocked: [], unsized: [], warnings: [], totalPoints: 0,
    });
    const tools = registerAll();
    await tools.get('kanban_propose_sprint')!.handler({ projectId: 1 });
    // The proposal should have been called with blockerCardIds: [31] (30 filtered)
    const callArgs = vi.mocked(computeSprintProposal).mock.calls.at(-1)!;
    const cards = callArgs[0] as { id: number; blockerCardIds: number[] }[];
    expect(cards[0].blockerCardIds).toEqual([31]);
  });
});

// ── kanban_recurrences_list ──────────────────────────────────────────────────

describe('kanban_recurrences_list', () => {
  beforeEach(resetState);

  it('returns Forbidden when assertProjectInClient throws', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_list')!.handler({ projectId: 7777 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('returns recurrence rows for owned project', async () => {
    dbState.selectDefault = [{ id: 1, cadence: 'weekly', projectId: 1 }];
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_list')!.handler({ projectId: 1 });
    const rows = parseJson(res) as { id: number }[];
    expect(rows[0].id).toBe(1);
  });

  it('returns empty array when no recurrences', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_list')!.handler({ projectId: 1 });
    expect(parseJson(res)).toEqual([]);
  });
});

// ── kanban_recurrences_create ────────────────────────────────────────────────

describe('kanban_recurrences_create', () => {
  beforeEach(resetState);

  it('returns Forbidden when assertProjectInClient throws', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_create')!.handler({
      projectId: 7777, columnId: 1, cadence: 'daily', titlePattern: 'Daily {{date}}',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('returns Forbidden when assertColumnInProject throws', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_create')!.handler({
      projectId: 1, columnId: 9999, cadence: 'daily', titlePattern: 'Daily',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('returns error when neither templateId nor titlePattern is provided', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_create')!.handler({
      projectId: 1, columnId: 1, cadence: 'weekly',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/templateId or titlePattern/);
  });

  it('returns error when titlePattern is whitespace-only', async () => {
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_create')!.handler({
      projectId: 1, columnId: 1, cadence: 'daily', titlePattern: '   ',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/templateId or titlePattern/);
  });

  it('creates recurrence with titlePattern and default hourUtc=9', async () => {
    dbState.insertReturningDefault = [{ id: 7, cadence: 'weekly' }];
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_create')!.handler({
      projectId: 1, columnId: 2, cadence: 'weekly', titlePattern: 'Weekly {{date}}',
    });
    expect((parseJson(res) as { id: number }).id).toBe(7);
    const v = dbState.lastInsertValues as {
      cadence: string; titlePattern: string; hourUtc: number; nextFireAt: Date;
    };
    expect(v.cadence).toBe('weekly');
    expect(v.titlePattern).toBe('Weekly {{date}}');
    expect(v.hourUtc).toBe(9);
    expect(v.nextFireAt).toBeInstanceOf(Date);
  });

  it('creates recurrence with templateId instead of titlePattern', async () => {
    dbState.insertReturningDefault = [{ id: 8, cadence: 'monthly' }];
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_create')!.handler({
      projectId: 1, columnId: 2, cadence: 'monthly', templateId: 42,
    });
    expect((parseJson(res) as { id: number }).id).toBe(8);
    const v = dbState.lastInsertValues as { templateId: number | null; titlePattern: string | null };
    expect(v.templateId).toBe(42);
    expect(v.titlePattern).toBeNull();
  });

  it('passes dayOfWeek and dayOfMonth through', async () => {
    dbState.insertReturningDefault = [{ id: 9 }];
    const tools = registerAll();
    await tools.get('kanban_recurrences_create')!.handler({
      projectId: 1, columnId: 1, cadence: 'weekly',
      titlePattern: 'Friday standup', dayOfWeek: 5, dayOfMonth: 15, hourUtc: 14,
    });
    const v = dbState.lastInsertValues as { dayOfWeek: number; dayOfMonth: number; hourUtc: number };
    expect(v.dayOfWeek).toBe(5);
    expect(v.dayOfMonth).toBe(15);
    expect(v.hourUtc).toBe(14);
  });
});

// ── kanban_recurrences_delete ────────────────────────────────────────────────

describe('kanban_recurrences_delete', () => {
  beforeEach(resetState);

  it('returns Recurrence not found when record is missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_delete')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Recurrence not found/);
  });

  it('returns Forbidden when project is foreign tenant', async () => {
    dbState.selectDefault = [{ projectId: 7777 }];
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_delete')!.handler({ id: 5 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Forbidden/);
  });

  it('deletes and returns { ok: true } when authorized', async () => {
    dbState.selectDefault = [{ projectId: 1 }];
    const tools = registerAll();
    const res = await tools.get('kanban_recurrences_delete')!.handler({ id: 5 });
    expect(parseJson(res)).toEqual({ ok: true });
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ── kanban_create_card: fromTemplateId paths ─────────────────────────────────

describe('kanban_create_card — fromTemplateId paths', () => {
  beforeEach(resetState);

  it('returns Template not available when template missing', async () => {
    // cardTemplates lookup empty
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, fromTemplateId: 99,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Template not available/);
  });

  it('returns Template not available when template belongs to another client', async () => {
    dbState.selectDefault = [{ id: 5, clientId: 999, payload: {} }]; // different client
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, fromTemplateId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Template not available/);
  });

  it('returns error when template has no titlePattern and no title arg', async () => {
    dbState.selectDefault = [{ id: 5, clientId: 1, payload: {} }]; // payload has no titlePattern
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, fromTemplateId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/title is required/);
  });

  it('uses template titlePattern when no title arg is given', async () => {
    dbState.selectQueue = [
      [{ id: 5, clientId: 1, payload: { titlePattern: 'Template Card', priority: 'high' } }],
    ];
    dbState.insertReturningDefault = [{ id: 20, title: 'Template Card' }];
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, fromTemplateId: 5,
    });
    expect((parseJson(res) as { id: number }).id).toBe(20);
    const v = dbState.lastInsertValues as { title: string; priority: string };
    expect(v.title).toBe('Template Card');
    expect(v.priority).toBe('high'); // from template
  });

  it('explicit title wins over template titlePattern', async () => {
    dbState.selectQueue = [
      [{ id: 5, clientId: 1, payload: { titlePattern: 'Template Title' } }],
    ];
    dbState.insertReturningDefault = [{ id: 21, title: 'Explicit Title' }];
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, fromTemplateId: 5, title: 'Explicit Title',
    });
    expect((parseJson(res) as { id: number }).id).toBe(21);
    const v = dbState.lastInsertValues as { title: string };
    expect(v.title).toBe('Explicit Title');
  });

  it('seeds label inserts from template.labelIds', async () => {
    dbState.selectQueue = [
      [{ id: 5, clientId: 1, payload: { titlePattern: 'Tpl', labelIds: [10, 11] } }],
    ];
    // card insert + 2 label inserts
    dbState.insertReturningDefault = [{ id: 30, sprintId: null }];
    const tools = registerAll();
    await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, fromTemplateId: 5,
    });
    // At least card + label inserts happened
    expect(dbState.insertCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('seeds checklist inserts from template.checklist', async () => {
    dbState.selectQueue = [
      [{
        id: 5, clientId: 1, payload: {
          titlePattern: 'Checklist Card',
          checklist: [{ text: 'Step 1', order: 0 }, { text: 'Step 2', order: 1 }],
        },
      }],
    ];
    dbState.insertReturningDefault = [{ id: 31, sprintId: null }];
    const tools = registerAll();
    await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, fromTemplateId: 5,
    });
    // card insert + checklist insert
    expect(dbState.insertCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ── kanban_create_card: parentCardId validation ──────────────────────────────

describe('kanban_create_card — parentCardId validation', () => {
  beforeEach(resetState);

  it('rejects when parentCardId is not found', async () => {
    dbState.selectDefault = []; // parent card lookup returns empty
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'Child', parentCardId: 999,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Parent card not found/);
  });

  it('rejects when parent belongs to a different project', async () => {
    dbState.selectDefault = [{ projectId: 999 }]; // parent in another project
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'Child', parentCardId: 5,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Parent card not found/);
  });

  it('succeeds when parentCardId is in the same project', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }], // parent card lookup
    ];
    dbState.insertReturningDefault = [{ id: 50, parentCardId: 5 }];
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'Child', parentCardId: 5,
    });
    expect((parseJson(res) as { id: number }).id).toBe(50);
  });
});

// ── kanban_create_card: WIP limit rejection ──────────────────────────────────

describe('kanban_create_card — WIP limit', () => {
  beforeEach(resetState);

  it('returns wip_limit error when column is at capacity', async () => {
    vi.mocked(checkWipLimit).mockResolvedValueOnce({
      allowed: false,
      reason: 'Column is at WIP limit (3)',
      limit: 3,
      currentCount: 3,
    } as Awaited<ReturnType<typeof checkWipLimit>>);
    const tools = registerAll();
    const res = await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'Blocked card',
    });
    const out = parseJson(res) as { error: string; code: string; limit: number };
    expect(out.code).toBe('wip_limit');
    expect(out.limit).toBe(3);
  });
});

// ── kanban_move_card: WIP limit and column-move recording ────────────────────

describe('kanban_move_card — WIP limit and column-move', () => {
  beforeEach(resetState);

  it('returns wip_limit error when destination column is at capacity', async () => {
    dbState.selectQueue = [
      [{ projectId: 1, columnId: 5 }],  // card found (different column)
      [{ id: 1 }],                       // project ok
      // assertColumnInProject succeeds (columnId != 9999)
    ];
    vi.mocked(checkWipLimit).mockResolvedValueOnce({
      allowed: false,
      reason: 'Column at WIP limit (2)',
      limit: 2,
      currentCount: 2,
    } as Awaited<ReturnType<typeof checkWipLimit>>);
    const tools = registerAll();
    const res = await tools.get('kanban_move_card')!.handler({
      cardId: 1, columnId: 10, order: 0,
    });
    const out = parseJson(res) as { error: string; code: string };
    expect(out.code).toBe('wip_limit');
  });

  it('records column move when card changes column and both column rows returned', async () => {
    dbState.selectQueue = [
      [{ projectId: 1, columnId: 5 }],   // card (columnId=5)
      [{ id: 1 }],                        // project
      // assertColumnInProject passes
      [{ isDone: false }],                // srcCol (id=5)
      [{ isDone: true }],                 // destCol (id=10)
    ];
    dbState.updateReturningDefault = [{ id: 1, columnId: 10 }];
    vi.mocked(checkWipLimit).mockResolvedValueOnce({ allowed: true } as Awaited<ReturnType<typeof checkWipLimit>>);
    const tools = registerAll();
    await tools.get('kanban_move_card')!.handler({ cardId: 1, columnId: 10 });
    expect(recordCardColumnMove).toHaveBeenCalledWith(1, false, true, 11);
  });

  it('does NOT record column move when card stays in same column', async () => {
    vi.mocked(recordCardColumnMove).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1, columnId: 10 }],  // card already in col 10
      [{ id: 1 }],                        // project
      [{ isDone: false }],                // srcCol
      [{ isDone: false }],                // destCol
    ];
    dbState.updateReturningDefault = [{ id: 1, columnId: 10 }];
    const tools = registerAll();
    await tools.get('kanban_move_card')!.handler({ cardId: 1, columnId: 10 });
    expect(recordCardColumnMove).not.toHaveBeenCalled();
  });
});

// ── kanban_update_card: sprint tracking ─────────────────────────────────────

describe('kanban_update_card — sprint tracking', () => {
  beforeEach(resetState);

  it('calls recordCardRemovedFromSprint when clearing sprintId', async () => {
    vi.mocked(recordCardRemovedFromSprint).mockClear();
    vi.mocked(recordCardAddedToSprint).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1, sprintId: 5 }],  // card has sprint 5
      [{ id: 1 }],                       // project
    ];
    dbState.updateReturningDefault = [{ id: 9, sprintId: null }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, sprintId: null });
    expect(recordCardRemovedFromSprint).toHaveBeenCalledWith(9, 5, 11);
    expect(recordCardAddedToSprint).not.toHaveBeenCalled();
  });

  it('calls recordCardAddedToSprint when assigning a new sprint', async () => {
    vi.mocked(recordCardRemovedFromSprint).mockClear();
    vi.mocked(recordCardAddedToSprint).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1, sprintId: null }],   // card has no sprint
      [{ id: 1 }],                           // project
      [{ projectId: 1 }],                    // sprint lookup (same project)
    ];
    dbState.updateReturningDefault = [{ id: 9, sprintId: 7 }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, sprintId: 7 });
    expect(recordCardAddedToSprint).toHaveBeenCalledWith(9, 7, 11);
    expect(recordCardRemovedFromSprint).not.toHaveBeenCalled();
  });

  it('calls both remove and add when switching sprints', async () => {
    vi.mocked(recordCardRemovedFromSprint).mockClear();
    vi.mocked(recordCardAddedToSprint).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1, sprintId: 5 }],   // card has sprint 5
      [{ id: 1 }],                        // project
      [{ projectId: 1 }],                 // sprint 7 lookup (valid)
    ];
    dbState.updateReturningDefault = [{ id: 9, sprintId: 7 }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, sprintId: 7 });
    expect(recordCardRemovedFromSprint).toHaveBeenCalledWith(9, 5, 11);
    expect(recordCardAddedToSprint).toHaveBeenCalledWith(9, 7, 11);
  });

  it('does not call sprint tracking when sprintId is not in the args', async () => {
    vi.mocked(recordCardRemovedFromSprint).mockClear();
    vi.mocked(recordCardAddedToSprint).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1, sprintId: 5 }],
      [{ id: 1 }],
    ];
    dbState.updateReturningDefault = [{ id: 9, sprintId: 5 }];
    const tools = registerAll();
    await tools.get('kanban_update_card')!.handler({ id: 9, title: 'Just a title change' });
    expect(recordCardRemovedFromSprint).not.toHaveBeenCalled();
    expect(recordCardAddedToSprint).not.toHaveBeenCalled();
  });
});

// ── kanban_create_card: recordCardAddedToSprint after insert ─────────────────

describe('kanban_create_card — sprint snapshot on creation', () => {
  beforeEach(resetState);

  it('calls recordCardAddedToSprint when card is created with a sprintId', async () => {
    vi.mocked(recordCardAddedToSprint).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1 }], // sprint lookup
    ];
    dbState.insertReturningDefault = [{ id: 55, sprintId: 9 }];
    const tools = registerAll();
    await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'Sprint card', sprintId: 9,
    });
    expect(recordCardAddedToSprint).toHaveBeenCalledWith(55, 9, 11);
  });

  it('does not call recordCardAddedToSprint when card has no sprint', async () => {
    vi.mocked(recordCardAddedToSprint).mockClear();
    dbState.insertReturningDefault = [{ id: 56, sprintId: null }];
    const tools = registerAll();
    await tools.get('kanban_create_card')!.handler({
      projectId: 1, columnId: 1, title: 'No sprint',
    });
    expect(recordCardAddedToSprint).not.toHaveBeenCalled();
  });
});

// ── kanban_card_detach_label: label activity log when label exists ────────────

describe('kanban_card_detach_label — activity logging', () => {
  beforeEach(resetState);

  it('logs card.label_removed when label row exists', async () => {
    const { logCardActivity } = await import('@/lib/pm-activity');
    vi.mocked(logCardActivity).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1 }],                              // authCard
      [{ id: 2, projectId: 1, name: 'Bug', color: '#ff0000' }], // label found
    ];
    const tools = registerAll();
    await tools.get('kanban_card_detach_label')!.handler({ cardId: 1, labelId: 2 });
    expect(logCardActivity).toHaveBeenCalledWith(
      1, null, 'card.label_removed', expect.objectContaining({ labelId: 2, name: 'Bug' }),
    );
  });

  it('does not log activity when label row is null', async () => {
    const { logCardActivity } = await import('@/lib/pm-activity');
    vi.mocked(logCardActivity).mockClear();
    dbState.selectQueue = [
      [{ projectId: 1 }], // authCard
      [],                 // label not found
    ];
    const tools = registerAll();
    await tools.get('kanban_card_detach_label')!.handler({ cardId: 1, labelId: 99 });
    expect(logCardActivity).not.toHaveBeenCalled();
  });
});
