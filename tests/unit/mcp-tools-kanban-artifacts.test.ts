// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/kanban-artifacts.ts.
 *
 * `registerKanbanArtifactsTools(server, ctx)` registers the tools split out
 * of lib/mcp/tools/kanban.ts to keep that file under the god-file ratchet:
 * card artifact links, card templates, the sprint-proposal planner, and
 * recurring card-creation rules.
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
      'storyPoints', 'cardType', 'sprintOrder',
    ]),
    kanbanColumns: table(['id', 'projectId', 'name', 'color', 'order', 'isDone']),
    kanbanCardDependencies: table(['blockedCardId', 'blockerCardId']),
    kanbanCardArtifacts: table(['id', 'cardId', 'artifactType', 'artifactId', 'displayTitle', 'pinned', 'createdBy', 'createdAt']),
    sprintScopeHistory: table(['sprintId', 'action', 'points', 'occurredAt']),
    cardTemplates: table(['id', 'clientId', 'projectId', 'name', 'description', 'payload']),
    cardRecurrences: table([
      'id', 'projectId', 'columnId', 'templateId', 'titlePattern', 'description',
      'cadence', 'dayOfWeek', 'dayOfMonth', 'hourUtc', 'nextFireAt', 'createdBy',
    ]),
    sprints: table(['id', 'projectId', 'name', 'endDate', 'status']),
    users: table(['id', 'name', 'email']),
    clientWebsites: table(['id', 'name', 'clientId']),
    emailCampaigns: table(['id', 'name', 'clientId']),
    pitchDecks: table(['id', 'title', 'clientId']),
    crmProposals: table(['id', 'title', 'clientId']),
    bookingPages: table(['id', 'title', 'clientId']),
    surveys: table(['id', 'title', 'clientId']),
    pathCharts: table(['id', 'projectId', 'title']),
    // remaining tables imported by @/lib/db/schema but not exercised — opaque stubs
    kanbanLabels: {}, kanbanCardLabels: {}, kanbanCardChecklistItems: {},
    kanbanCardAssignees: {}, kanbanCardWatchers: {}, kanbanCardComments: {},
    kanbanCardTimeLogs: {}, kanbanCardFiles: {},
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
    assertUserVisibleToClient: vi.fn(async (userId: number) => {
      if (userId === 6666) throw new OwnershipError('userId', userId);
    }),
  };
});

// next/cache (used by revalidateForWrite via lib/mcp/types)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// portal-auth (used transitively by lib/mcp/types for requireService)
vi.mock('@/lib/portal-auth', () => ({ hasServiceAccess: vi.fn(async () => true) }));

// projections re-exports — transitively imported but never invoked; stub minimally.
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
import { registerKanbanArtifactsTools } from '@/lib/mcp/tools/kanban-artifacts';

function registerAll(scopes: string[] = ['projects:read', 'projects:write']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerKanbanArtifactsTools(stub as any, ctxFor(scopes));
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

describe('registerKanbanArtifactsTools — registration', () => {
  beforeEach(resetState);

  it('registers the canonical kanban-artifacts tools', () => {
    const tools = registerAll();
    for (const name of [
      'kanban_card_artifacts_list',
      'kanban_card_artifact_link',
      'kanban_card_artifact_toggle_pin',
      'kanban_card_artifact_unlink',
      'kanban_card_templates_list',
      'kanban_card_templates_create',
      'kanban_propose_sprint',
      'kanban_recurrences_list',
      'kanban_recurrences_create',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
    // kanban_card_templates_delete and kanban_recurrences_delete require the
    // granular projects:delete scope, not projects:write.
    expect(tools.has('kanban_card_templates_delete')).toBe(false);
    expect(tools.has('kanban_recurrences_delete')).toBe(false);
  });

  it('registers the delete-scoped tools only under projects:delete', () => {
    const tools = registerAll(['projects:delete']);
    expect(tools.has('kanban_card_templates_delete')).toBe(true);
    expect(tools.has('kanban_recurrences_delete')).toBe(true);
    expect(tools.has('kanban_card_templates_create')).toBe(false);
  });

  it('skips write tools when scopes only contain projects:read', () => {
    const tools = registerAll(['projects:read']);
    expect(tools.has('kanban_card_artifacts_list')).toBe(true);
    expect(tools.has('kanban_card_artifact_link')).toBe(false);
    expect(tools.has('kanban_card_templates_create')).toBe(false);
  });

  it('skips all tools when no projects scopes are granted', () => {
    const tools = registerAll(['crm:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool exposes a title, description and inputSchema', () => {
    const tools = registerAll(['projects:read', 'projects:write', 'projects:delete']);
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name}.title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name}.description`).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
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

  it('link: resolves artifactType "post" via the clientWebsites join (PUX-034/JUL9-018)', async () => {
    // The enum has always advertised 'post', but the kanban registrar called
    // resolveArtifactTitle WITHOUT `{ handlePost: true }`. Posts carry no
    // clientId, so the generic table-dict branch had nothing to look them up
    // in and every attempt answered "not owned by this client".
    dbState.selectQueue = [
      [{ projectId: 1 }],                                  // card
      [{ id: 1 }],                                         // project
      [{ title: 'Launch Page', postType: 'landing' }],     // post via clientWebsites join
    ];
    dbState.insertReturningDefault = [{ id: 101 }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'post', artifactId: 42,
    });
    expect(parseJson(res)).not.toHaveProperty('error');
    expect((parseJson(res) as { id: number }).id).toBe(101);
    const v = dbState.lastInsertValues as { artifactType: string; displayTitle: string };
    expect(v.artifactType).toBe('post');
    // Non-blog posts get their type appended, so the label says what it is.
    expect(v.displayTitle).toBe('Launch Page (landing)');
  });

  it('link: still refuses a post that belongs to another client', async () => {
    // The join is the tenancy check, not just a title lookup — an empty result
    // must stay a refusal rather than linking an unowned post.
    dbState.selectQueue = [
      [{ projectId: 1 }],
      [{ id: 1 }],
      [],                 // join finds nothing for this clientId
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'post', artifactId: 42,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not owned/);
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

  it('link: handles path_chart artifact type via project join', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],           // card
      [{ id: 1 }],                  // project (authorizeCardForClient)
      [{ title: 'Checkout Flow' }], // path_chart + project join
    ];
    dbState.insertReturningDefault = [{ id: 200, artifactType: 'path_chart' }];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'path_chart', artifactId: 7,
    });
    const out = parseJson(res) as { id: number; artifactType: string };
    expect(out.id).toBe(200);
    expect(out.artifactType).toBe('path_chart');
    const v = dbState.lastInsertValues as { displayTitle: string };
    expect(v.displayTitle).toBe('Checkout Flow');
  });

  it('link: rejects path_chart when the chart is not owned by this client', async () => {
    dbState.selectQueue = [
      [{ projectId: 1 }],   // card
      [{ id: 1 }],          // project
      [],                   // path_chart join returns nothing
    ];
    const tools = registerAll();
    const res = await tools.get('kanban_card_artifact_link')!.handler({
      cardId: 1, artifactType: 'path_chart', artifactId: 7,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not owned/);
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
