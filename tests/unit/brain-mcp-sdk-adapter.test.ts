// @vitest-environment node
/**
 * Unit tests for lib/brain/mcp-sdk-adapter.ts.
 *
 * The adapter exports a single function — `registerBrainToolsOnSdk(server, ctx)` —
 * that registers ~40 tools on an MCP server. Each tool has a handler closing
 * over the ctx, the clientId, and the brain profile.
 *
 * Strategy: mock the @/lib/db module + every brain/* collaborator with vi.mock,
 * build a fake McpServer that captures `{ name -> handler }` pairs, then invoke
 * each handler with sample args and assert on the returned shape + the
 * arguments passed to the mocked collaborator. We cover both happy paths and
 * error/scope-denied branches.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

// The adapter registers 40+ tools with Zod schemas on every registerAll() call.
// With 321 registerAll() calls across the suite, sequential execution takes ~5 min total.
// Per-test 30s budget is insufficient for tests that run late in the file — bump to 90s.
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.setConfig({ testTimeout: 90_000 });
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: vi.fn(async () => ({ id: 7, clientId: 1, enabled: true })),
}));

vi.mock('@/lib/brain/search', () => ({
  searchBrain: vi.fn(async () => ({
    hits: [
      { id: 1, type: 'note', title: 'A', snippet: 's', url: '/portal/brain/knowledge/1', score: 0.9 },
      { id: 2, type: 'note', title: 'B', snippet: 's', url: 'https://other.example.com/x', score: 0.5 },
    ],
    total: 2,
  })),
}));

vi.mock('@/lib/brain/dashboard', () => ({
  getDashboardSummary: vi.fn(async () => ({ stats: { meetings: 3 } })),
}));

vi.mock('@/lib/brain/meetings', () => ({
  createMeetingFromAdapter: vi.fn(async () => ({ id: 100, title: 'Mtg' })),
  getMeeting: vi.fn(async (_clientId: number, id: number) => (id === 999 ? null : { id, title: 'M' })),
  linkMeeting: vi.fn(async (_clientId: number, id: number) => (id === 999 ? null : { id, companyId: 5 })),
  listMeetings: vi.fn(async () => [{ id: 1 }]),
}));

vi.mock('@/lib/brain/tasks', () => ({
  createTask: vi.fn(async (input: Record<string, unknown>) => ({ id: 200, ...input })),
  getTask: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, title: 'T' })),
  listTasks: vi.fn(async () => [{ id: 1 }]),
  updateTask: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, title: 'U' })),
  countTasks: (..._args: unknown[]) => Promise.resolve(0),
}));

vi.mock('@/lib/brain/relationships', () => ({
  createOverlay: vi.fn(async () => ({ id: 300, relationshipType: 'partner' })),
  getRelationship: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, type: 'r' })),
  listRelationships: vi.fn(async () => [{ id: 1 }]),
  updateOverlay: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, summary: 'x' })),
  countRelationships: (..._args: unknown[]) => Promise.resolve(0),
}));

vi.mock('@/lib/brain/review', () => ({
  approveReviewItem: vi.fn(async () => ({ id: 400, status: 'approved' })),
  getReviewItem: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, status: 'pending' })),
  listReviewItems: vi.fn(async () => [{ id: 1 }]),
  rejectReviewItem: vi.fn(async (input: { itemId: number }) => (input.itemId === 999 ? null : { id: input.itemId, status: 'rejected' })),
}));

let nextNoteId = 1000;
vi.mock('@/lib/brain/notes', () => ({
  bulkUpdateNotes: vi.fn(async () => ({ updated: 3, failed: 1 })),
  createNote: vi.fn(async (input: Record<string, unknown>) => ({
    id: ++nextNoteId,
    title: input.title,
    body: input.body ?? '',
    tags: input.tags ?? [],
    sourceUrl: input.sourceUrl ?? null,
    pinned: input.pinned ?? false,
    deletedAt: null,
    updatedAt: new Date('2026-01-01').toISOString(),
  })),
  countNotes: vi.fn(async () => 42),
  deleteNote: vi.fn(async (_c: number, id: number) => id !== 999),
  getNote: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    if (id === 555) return { id, title: 'soft', body: 'b', deletedAt: new Date('2026-01-01') };
    return { id, title: 't', body: 'body', deletedAt: null };
  }),
  getNoteBySourceUrl: vi.fn(async (_c: number, url: string) => (url === 'https://exists.example.com/' ? { id: 800, title: 'old' } : null)),
  listNotes: vi.fn(async () => [
    {
      id: 1, title: 't', body: 'Lorem '.repeat(120),
      tags: ['a'], sourceUrl: null, confidentialityLevel: 'standard', pinned: false,
      source: 'manual', relationshipOverlayId: null, companyId: null, dealId: null,
      contactId: null, meetingId: null, attachmentFilename: null, attachmentMimeType: null,
      deletedAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-02',
    },
  ]),
  restoreNote: vi.fn(async (_c: number, id: number) => (id === 999 ? null : {
    id, title: 't', body: 'b', tags: [], sourceUrl: null, pinned: false, deletedAt: null, updatedAt: 'now',
  })),
  updateNote: vi.fn(async (_c: number, id: number, patch: Record<string, unknown>) => (id === 999 ? null : { id, ...patch })),
}));

vi.mock('@/lib/brain/saved-searches', () => ({
  createSavedSearch: vi.fn(async (input: Record<string, unknown>) => ({
    id: 500, name: input.name, icon: input.icon ?? null,
    userId: input.userId, sortOrder: input.sortOrder ?? 0, createdAt: 'now',
  })),
  deleteSavedSearch: vi.fn(async (_c: number, id: number) => id !== 999),
  getSavedSearch: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, name: 's', filters: {} })),
  listSavedSearches: vi.fn(async (_c: number, opts: { userId: number | null }) => {
    if (opts.userId === null) {
      return [{ id: 1, name: 'shared', icon: null, userId: null, sortOrder: 0, createdAt: '', updatedAt: '', filters: {} }];
    }
    return [
      { id: 2, name: 'mine', icon: null, userId: 11, sortOrder: 1, createdAt: '', updatedAt: '', filters: {} },
      { id: 3, name: 'other', icon: null, userId: 99, sortOrder: 2, createdAt: '', updatedAt: '', filters: {} },
    ];
  }),
  updateSavedSearch: vi.fn(async (_c: number, id: number, patch: Record<string, unknown>) => {
    if (id === 999) return null;
    return { id, name: patch.name ?? 's', icon: patch.icon ?? null, userId: patch.userId ?? 11, sortOrder: 0, updatedAt: 'now' };
  }),
}));

vi.mock('@/lib/brain/templates', () => {
  class DuplicateTemplateNameError extends Error {
    constructor(public name_: string) {
      super(`Duplicate: ${name_}`);
      this.name = 'DuplicateTemplateNameError';
    }
  }
  return {
    DuplicateTemplateNameError,
    createTemplate: vi.fn(async (input: Record<string, unknown>) => {
      if (input.name === 'dupe') throw new DuplicateTemplateNameError('dupe');
      if (input.name === 'boom') throw new Error('boom');
      return { id: 600, name: input.name, trigger: input.trigger ?? 'manual', enabled: true, body: input.body, createdAt: 'now' };
    }),
    deleteTemplate: vi.fn(async (_c: number, id: number) => id !== 999),
    getTemplate: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, name: 'Tpl', body: 'Hello {{userName}}', defaultTags: ['x'], variables: ['userName'] })),
    listTemplates: vi.fn(async () => [
      { id: 1, name: 't', trigger: 'manual', enabled: true, variables: [], defaultTags: [], body: 'BODY', createdAt: '', updatedAt: '' },
    ]),
    updateTemplate: vi.fn(async (_c: number, id: number, patch: Record<string, unknown>) => {
      if (id === 999) return null;
      if (patch.name === 'dupe') throw new DuplicateTemplateNameError('dupe');
      if (patch.name === 'boom') throw new Error('boom');
      return { id, name: patch.name ?? 'T', trigger: patch.trigger ?? 'manual', enabled: true, body: patch.body ?? 'B', updatedAt: 'now' };
    }),
  };
});

vi.mock('@/lib/brain/template', () => ({
  applyTemplate: vi.fn(async (body: string) => `applied:${body}`),
}));

// `assertUserVisibleToClient` throws OwnershipError when ownerId === 9999.
vi.mock('@/lib/security/assert-owned', () => {
  class OwnershipError extends Error {
    constructor(public field: string, public id: number | string) {
      super(`Forbidden: ${field}=${id}`);
      this.name = 'OwnershipError';
    }
  }
  return {
    OwnershipError,
    assertUserVisibleToClient: vi.fn(async (userId: number) => {
      if (userId === 9999) throw new OwnershipError('userId', userId);
    }),
  };
});

// db mock: handles insert().values().returning(), select().from().where().limit(),
// orderBy(), Promise.all wrapping, etc.
type QueryResult = unknown[];
const dbState: {
  insertReturning: QueryResult;
  selectRows: QueryResult;
  // queue of pre-set return values for sequential select() calls
  selectQueue: QueryResult[];
} = {
  insertReturning: [{ id: 700, status: 'pending', proposedType: 'task' }],
  selectRows: [],
  selectQueue: [],
};

function makeChain(rows: QueryResult) {
  const chain: Record<string, (...args: unknown[]) => unknown> & { then?: unknown } = {} as never;
  // Make every chain method return chain itself, but each chain is also
  // thenable so callers can `await` directly (used by the post `then(r => r[0])` pattern).
  const proxy = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        // Resolve to the rows array when awaited
        return (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => dbState.insertReturning),
      })),
    })),
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectRows;
      return makeChain(next);
    }),
  },
}));

// Schema objects don't need real content — just referenceable column-like
// objects so the adapter can pass them to drizzle helpers it treats as opaque.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  return {
    portalApiKeys: { id: col('id'), keyHash: col('keyHash'), active: col('active') },
    oauthAccessTokens: { id: col('id') },
    clients: { id: col('id') },
    brainAiReviewItems: { id: col('id'), clientId: col('clientId') },
    brainAuditLogs: { id: col('id'), clientId: col('clientId'), entityType: col('e'), entityId: col('eid'), createdAt: col('createdAt') },
    users: { id: col('id'), name: col('name'), email: col('email') },
    crmCompanies: { id: col('id'), clientId: col('clientId'), name: col('name'), domain: col('domain'), industry: col('industry') },
    crmContacts: { id: col('id'), clientId: col('clientId'), companyId: col('companyId'), firstName: col('first'), lastName: col('last'), email: col('email'), status: col('status') },
    crmDeals: { id: col('id'), clientId: col('clientId'), companyId: col('companyId'), contactId: col('contactId'), status: col('status'), priority: col('priority'), stageId: col('stageId'), value: col('value') },
    crmPipelineStages: { id: col('id') },
    posts: { id: col('id'), websiteId: col('websiteId'), title: col('title'), slug: col('slug'), postType: col('postType'), excerpt: col('excerpt'), published: col('published'), publishedAt: col('publishedAt'), updatedAt: col('updatedAt') },
    clientWebsites: { id: col('id'), clientId: col('clientId') },
    brainDecisions: { id: col('id'), clientId: col('clientId'), status: col('status') },
    brainTopics: { id: col('id'), clientId: col('clientId') },
    brainEntityTopics: { topicId: col('topicId'), entityType: col('entityType'), entityId: col('entityId') },
    brainGlossaryTerms: { id: col('id'), clientId: col('clientId'), term: col('term'), definition: col('definition') },
    brainOrgUnits: { id: col('id'), clientId: col('clientId'), path: col('path'), parentId: col('parentId'), name: col('name') },
    brainPeople: { id: col('id'), clientId: col('clientId'), name: col('name'), email: col('email') },
    brainPersonOrgUnits: { personId: col('personId'), orgUnitId: col('orgUnitId'), primary: col('primary') },
    brainPlaybooks: { id: col('id'), clientId: col('clientId'), title: col('title'), status: col('status') },
    brainDocumentVersions: { id: col('id'), documentId: col('documentId'), body: col('body'), version: col('version') },
  };
});

// drizzle-orm helpers can be no-ops; only the chain methods get called.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerBrainToolsOnSdk } from '@/lib/brain/mcp-sdk-adapter';

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

function registerAll() {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerBrainToolsOnSdk(stub as any, ctxFor(['*']));
  return tools;
}

// ── shared tools instance ────────────────────────────────────────────────────
//
// registerBrainToolsOnSdk creates ~40 Zod-schema closures per call.  Calling it
// inside every it() block (321 times) exhausts the Node.js heap.  Instead we
// register once per suite in a beforeAll and share the resulting `tools` Map.
// The handlers close over the vi.fn() module mocks, so mockResolvedValueOnce /
// mockReturnValueOnce continue to work per-test exactly as before — the mock
// queue is on the module-level spy, not on the tools map.

let sharedTools: ReturnType<typeof registerAll>;

beforeAll(() => {
  sharedTools = registerAll();
});

// ── tests ───────────────────────────────────────────────────────────────────

describe('registerBrainToolsOnSdk — tool registration', () => {
  beforeEach(() => {
    dbState.insertReturning = [{ id: 700, status: 'pending', proposedType: 'task' }];
    dbState.selectRows = [];
    dbState.selectQueue = [];
    nextNoteId = 1000;
  });

  it('registers a large set of tools when scopes=*', () => {
    const tools = sharedTools;
    expect(tools.size).toBeGreaterThanOrEqual(30);
  });

  it('registers the canonical read-only tools', () => {
    const tools = sharedTools;
    for (const name of [
      'brain_search',
      'brain_dashboard_summary',
      'brain_list_relationships',
      'brain_get_relationship',
      'brain_list_meetings',
      'brain_get_meeting',
      'brain_list_tasks',
      'brain_get_task',
      'brain_list_review_items',
      'brain_get_review_item',
      'brain_list_notes',
      'brain_get_note',
      'brain_list_note_history',
      'brain_list_saved_searches',
      'brain_get_saved_search',
      'brain_list_note_templates',
      'brain_get_note_template',
      'brain_list_companies',
      'brain_get_company',
      'brain_list_contacts',
      'brain_get_contact',
      'brain_list_deals',
      'brain_get_deal',
      'brain_list_posts',
      'brain_get_post',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers the canonical write tools', () => {
    const tools = sharedTools;
    for (const name of [
      'brain_create_meeting',
      'brain_link_meeting',
      'brain_create_task',
      'brain_propose_task',
      'brain_update_task',
      'brain_create_relationship',
      'brain_create_note',
      'brain_upsert_note_by_url',
      'brain_update_note',
      'brain_delete_note',
      'brain_restore_note',
      'brain_bulk_update_notes',
      'brain_create_saved_search',
      'brain_update_saved_search',
      'brain_delete_saved_search',
      'brain_create_note_template',
      'brain_update_note_template',
      'brain_delete_note_template',
      'brain_create_note_from_template',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers the brain:approve tools', () => {
    const tools = sharedTools;
    expect(tools.has('brain_approve_review_item')).toBe(true);
    expect(tools.has('brain_reject_review_item')).toBe(true);
    expect(tools.has('brain_update_relationship')).toBe(true);
  });

  it('skips write tools when ctx lacks brain:write', () => {
    const { stub, tools } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBrainToolsOnSdk(stub as any, ctxFor(['brain:read']));
    expect(tools.has('brain_search')).toBe(true);
    expect(tools.has('brain_create_note')).toBe(false);
    expect(tools.has('brain_approve_review_item')).toBe(false);
  });

  it('skips approve tools when ctx lacks brain:approve', () => {
    const { stub, tools } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBrainToolsOnSdk(stub as any, ctxFor(['brain:read', 'brain:write']));
    expect(tools.has('brain_create_note')).toBe(true);
    expect(tools.has('brain_approve_review_item')).toBe(false);
    expect(tools.has('brain_reject_review_item')).toBe(false);
  });

  it('skips all brain tools when ctx has no brain scopes', () => {
    const { stub, tools } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBrainToolsOnSdk(stub as any, ctxFor(['other:read']));
    expect(tools.size).toBe(0);
  });
});

// ── search / dashboard ──────────────────────────────────────────────────────

describe('brain_search', () => {
  beforeEach(() => { dbState.selectQueue = []; });

  it('absolutizes relative URLs in hits', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_search')!.handler({ query: 'hello' });
    const out = parseJson(res) as { hits: { url: string }[]; total: number };
    expect(out.total).toBe(2);
    expect(out.hits[0].url).toMatch(/^http/);
    expect(out.hits[0].url).toContain('/portal/brain/knowledge/1');
    expect(out.hits[1].url).toBe('https://other.example.com/x'); // absolute passthrough
  });
});

describe('brain_dashboard_summary', () => {
  it('returns the dashboard summary (with brain-restructure decision + topic counts merged in)', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_dashboard_summary')!.handler({});
    // The handler now spreads the underlying getDashboardSummary() result and
    // appends decisionsCount + topicsCount derived from inline COUNT(*) queries.
    // With the db.select mock returning [] by default, both counts resolve to 0.
    expect(parseJson(res)).toMatchObject({ stats: { meetings: 3 } });
    expect(parseJson(res)).toMatchObject({ counts: { decisionsCount: 0, topicsCount: 0 } });
  });
});

// ── relationships ───────────────────────────────────────────────────────────

describe('brain_list_relationships / brain_get_relationship', () => {
  it('lists relationships', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_relationships')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1 }]);
  });

  it('returns 404-equiv error when relationship missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_relationship')!.handler({ overlayId: 999 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/i);
  });

  it('returns the overlay on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_relationship')!.handler({ overlayId: 4 });
    expect((parseJson(res) as { id: number }).id).toBe(4);
  });
});

// ── meetings ────────────────────────────────────────────────────────────────

describe('brain_list_meetings / brain_get_meeting', () => {
  it('lists meetings with optional filters', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_meetings')!.handler({ status: 'draft', limit: 5 });
    expect(parseJson(res)).toEqual([{ id: 1 }]);
  });

  it('returns not-found when meeting missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_meeting')!.handler({ meetingId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns the meeting on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_meeting')!.handler({ meetingId: 2 });
    expect((parseJson(res) as { id: number }).id).toBe(2);
  });
});

describe('brain_create_meeting', () => {
  it('rejects when both companyId and dealId are set', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_meeting')!.handler({
      transcript: 'x', companyId: 1, dealId: 2,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/company OR a deal/i);
  });

  it('creates a meeting via the paste adapter', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_meeting')!.handler({ transcript: 'hello world' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(100);
  });

  it('returns err when profile.enabled is false', async () => {
    // profilePromise is created at registerBrainToolsOnSdk() call time and cached.
    // To test the disabled-profile branch we need a fresh registration so that
    // the mockResolvedValueOnce is consumed by the new profilePromise.
    const profiles = await import('@/lib/brain/profiles');
    (profiles.getOrCreateBrainProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 7, clientId: 1, enabled: false });
    const tools = registerAll();
    const res = await tools.get('brain_create_meeting')!.handler({ transcript: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not enabled/i);
  });

  it('converts thrown errors to err()', async () => {
    const meetings = await import('@/lib/brain/meetings');
    (meetings.createMeetingFromAdapter as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const tools = sharedTools;
    const res = await tools.get('brain_create_meeting')!.handler({ transcript: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });

  it('handles non-Error throws with a generic message', async () => {
    const meetings = await import('@/lib/brain/meetings');
    (meetings.createMeetingFromAdapter as ReturnType<typeof vi.fn>).mockRejectedValueOnce('weird-string');
    const tools = sharedTools;
    const res = await tools.get('brain_create_meeting')!.handler({ transcript: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Failed to create meeting/);
  });
});

describe('brain_link_meeting', () => {
  it('rejects company+deal together', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_link_meeting')!.handler({ meetingId: 1, companyId: 2, dealId: 3 });
    expect(res.isError).toBe(true);
  });

  it('returns not-found when meeting missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_link_meeting')!.handler({ meetingId: 999, companyId: 5 });
    expect(res.isError).toBe(true);
  });

  it('updates link on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_link_meeting')!.handler({ meetingId: 2, companyId: 5 });
    expect((parseJson(res) as { companyId: number }).companyId).toBe(5);
  });
});

// ── tasks ───────────────────────────────────────────────────────────────────

describe('brain_list_tasks / brain_get_task', () => {
  it('lists tasks', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_tasks')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1 }]);
  });

  it('returns not-found for missing task', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_task')!.handler({ taskId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns the task on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_task')!.handler({ taskId: 5 });
    expect((parseJson(res) as { id: number }).id).toBe(5);
  });
});

describe('brain_create_task', () => {
  it('creates a task', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_task')!.handler({ title: 'Do thing' });
    expect((parseJson(res) as { id: number }).id).toBe(200);
  });

  it('returns OwnershipError as JSON error payload', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_task')!.handler({ title: 'X', ownerId: 9999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/Forbidden/);
  });

  it('propagates non-Ownership errors', async () => {
    const security = await import('@/lib/security/assert-owned');
    (security.assertUserVisibleToClient as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    const tools = sharedTools;
    await expect(tools.get('brain_create_task')!.handler({ title: 'X', ownerId: 5 })).rejects.toThrow('db down');
  });

  it('parses ISO due date', async () => {
    const tasks = await import('@/lib/brain/tasks');
    (tasks.createTask as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_create_task')!.handler({ title: 'X', dueDate: '2026-12-25T00:00:00Z' });
    const callArgs = (tasks.createTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as { dueDate: Date | null };
    expect(callArgs.dueDate).toBeInstanceOf(Date);
  });
});

describe('brain_propose_task', () => {
  it('inserts a review item with manual source when no meeting', async () => {
    dbState.insertReturning = [{ id: 700, sourceType: 'manual', sourceId: 0, proposedType: 'task', status: 'pending' }];
    const tools = sharedTools;
    const res = await tools.get('brain_propose_task')!.handler({ title: 'Suggest me' });
    const out = parseJson(res) as { id: number; sourceType: string };
    expect(out.id).toBe(700);
    expect(out.sourceType).toBe('manual');
  });

  it('attaches the source meeting when provided', async () => {
    dbState.insertReturning = [{ id: 701, sourceType: 'meeting', sourceId: 88 }];
    const tools = sharedTools;
    const res = await tools.get('brain_propose_task')!.handler({ title: 'X', sourceMeetingId: 88 });
    const out = parseJson(res) as { sourceType: string; sourceId: number };
    expect(out.sourceType).toBe('meeting');
    expect(out.sourceId).toBe(88);
  });
});

describe('brain_update_task', () => {
  it('returns not-found for missing task', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_task')!.handler({ taskId: 999 });
    expect(res.isError).toBe(true);
  });

  it('parses ISO dueDate string', async () => {
    const tasks = await import('@/lib/brain/tasks');
    (tasks.updateTask as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_update_task')!.handler({ taskId: 3, dueDate: '2026-08-08' });
    const patch = (tasks.updateTask as ReturnType<typeof vi.fn>).mock.calls[0][2] as { dueDate: Date | null | undefined };
    expect(patch.dueDate).toBeInstanceOf(Date);
  });

  it('passes null when dueDate=null to clear', async () => {
    const tasks = await import('@/lib/brain/tasks');
    (tasks.updateTask as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_update_task')!.handler({ taskId: 3, dueDate: null });
    const patch = (tasks.updateTask as ReturnType<typeof vi.fn>).mock.calls[0][2] as { dueDate: Date | null | undefined };
    expect(patch.dueDate).toBeNull();
  });

  it('returns updated task on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_task')!.handler({ taskId: 5, title: 'New' });
    expect((parseJson(res) as { id: number }).id).toBe(5);
  });
});

// ── relationships (write) ──────────────────────────────────────────────────

describe('brain_create_relationship', () => {
  it('requires exactly one of companyId or dealId — rejects neither', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_relationship')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/exactly one/i);
  });

  it('rejects both companyId and dealId', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_relationship')!.handler({ companyId: 1, dealId: 2 });
    expect(res.isError).toBe(true);
  });

  it('creates with companyId', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_relationship')!.handler({ companyId: 1, nextReviewAt: '2026-12-01' });
    expect((parseJson(res) as { id: number }).id).toBe(300);
  });

  it('converts thrown errors to err()', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.createOverlay as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('overlay-conflict'));
    const tools = sharedTools;
    const res = await tools.get('brain_create_relationship')!.handler({ companyId: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('overlay-conflict');
  });
});

// ── approve / reject review items ───────────────────────────────────────────

describe('brain_approve_review_item / brain_reject_review_item', () => {
  it('approves a pending item', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_approve_review_item')!.handler({ itemId: 7 });
    expect((parseJson(res) as { status: string }).status).toBe('approved');
  });

  it('returns err on approve failure', async () => {
    const review = await import('@/lib/brain/review');
    (review.approveReviewItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'));
    const tools = sharedTools;
    const res = await tools.get('brain_approve_review_item')!.handler({ itemId: 7 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('bad');
  });

  it('rejects a pending item', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_reject_review_item')!.handler({ itemId: 7, reason: 'not relevant' });
    expect((parseJson(res) as { status: string }).status).toBe('rejected');
  });

  it('returns not-found when reject target missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_reject_review_item')!.handler({ itemId: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_update_relationship', () => {
  it('handles ISO nextReviewAt', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.updateOverlay as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_update_relationship')!.handler({ overlayId: 5, nextReviewAt: '2026-09-09' });
    const patch = (rel.updateOverlay as ReturnType<typeof vi.fn>).mock.calls[0][3] as { nextReviewAt: Date | null | undefined };
    expect(patch.nextReviewAt).toBeInstanceOf(Date);
  });

  it('passes null when nextReviewAt=null', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.updateOverlay as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_update_relationship')!.handler({ overlayId: 5, nextReviewAt: null });
    const patch = (rel.updateOverlay as ReturnType<typeof vi.fn>).mock.calls[0][3] as { nextReviewAt: Date | null | undefined };
    expect(patch.nextReviewAt).toBeNull();
  });

  it('returns err on throw', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.updateOverlay as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const tools = sharedTools;
    const res = await tools.get('brain_update_relationship')!.handler({ overlayId: 5 });
    expect(res.isError).toBe(true);
  });
});

// ── notes ───────────────────────────────────────────────────────────────────

describe('brain_list_notes', () => {
  it('trims body and returns pagination envelope', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_notes')!.handler({ limit: 10, offset: 0 });
    const out = parseJson(res) as { items: { bodyPreview: string; bodyLength: number }[]; total: number; limit: number; offset: number };
    expect(out.total).toBe(42);
    expect(out.limit).toBe(10);
    expect(out.offset).toBe(0);
    expect(out.items[0].bodyPreview.length).toBeLessThanOrEqual(400);
    expect(out.items[0].bodyLength).toBeGreaterThan(out.items[0].bodyPreview.length);
  });

  it('applies sensible defaults for limit/offset', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_notes')!.handler({});
    const out = parseJson(res) as { limit: number; offset: number };
    expect(out.limit).toBe(50);
    expect(out.offset).toBe(0);
  });
});

describe('brain_get_note', () => {
  it('returns the note when found', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_note')!.handler({ noteId: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });

  it('returns not-found error when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_create_note', () => {
  it('defaults source to manual when no sourceUrl', async () => {
    const notes = await import('@/lib/brain/notes');
    (notes.createNote as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_create_note')!.handler({ title: 'T' });
    const arg = (notes.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0] as { source: string };
    expect(arg.source).toBe('manual');
  });

  it('defaults source to crawl when sourceUrl provided', async () => {
    const notes = await import('@/lib/brain/notes');
    (notes.createNote as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_create_note')!.handler({ title: 'T', sourceUrl: 'https://example.com/x' });
    const arg = (notes.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0] as { source: string };
    expect(arg.source).toBe('crawl');
  });

  it('respects explicit source override', async () => {
    const notes = await import('@/lib/brain/notes');
    (notes.createNote as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_create_note')!.handler({ title: 'T', source: 'document_import' });
    const arg = (notes.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0] as { source: string };
    expect(arg.source).toBe('document_import');
  });
});

describe('brain_upsert_note_by_url', () => {
  it('updates existing note when URL matches', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_upsert_note_by_url')!.handler({
      sourceUrl: 'https://exists.example.com/', title: 'X', body: 'B',
    });
    const out = parseJson(res) as { created: boolean };
    expect(out.created).toBe(false);
  });

  it('creates new note when URL is novel', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_upsert_note_by_url')!.handler({
      sourceUrl: 'https://new.example.com/', title: 'X', body: 'B',
    });
    const out = parseJson(res) as { created: boolean };
    expect(out.created).toBe(true);
  });
});

describe('brain_update_note', () => {
  it('returns not-found when note missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_note')!.handler({ noteId: 999, title: 'T' });
    expect(res.isError).toBe(true);
  });

  it('updates the note on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_note')!.handler({ noteId: 4, title: 'New' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(4);
  });
});

describe('brain_delete_note', () => {
  it('returns not-found if the note does not exist', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });

  it('soft-deletes a fresh note by default', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 1 });
    const out = parseJson(res) as { id: number; deleted: 'soft' | 'hard' };
    expect(out.deleted).toBe('soft');
  });

  it('hard-deletes an already-trashed note', async () => {
    // getNote(555) returns deletedAt != null
    const tools = sharedTools;
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 555 });
    const out = parseJson(res) as { deleted: string };
    expect(out.deleted).toBe('hard');
  });

  it('hard-deletes immediately with force=true', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 1, force: true });
    const out = parseJson(res) as { deleted: string };
    expect(out.deleted).toBe('hard');
  });
});

describe('brain_restore_note', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_restore_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });

  it('restores and returns a slim echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_restore_note')!.handler({ noteId: 4 });
    const out = parseJson(res) as { id: number; bodyLength: number };
    expect(out.id).toBe(4);
    expect(typeof out.bodyLength).toBe('number');
  });
});

describe('brain_bulk_update_notes', () => {
  it('returns updated/skipped counts', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_bulk_update_notes')!.handler({
      ids: [1, 2, 3, 4],
      op: { kind: 'soft_delete' },
    });
    const out = parseJson(res) as { updated: number; skipped: number };
    expect(out.updated).toBe(3);
    expect(out.skipped).toBe(1);
  });
});

describe('brain_list_note_history', () => {
  it('returns slim items by default (no metadata)', async () => {
    // getNote is the brain/notes mock and returns a hit for id=1; the next
    // db.select() call is the audit log query.
    dbState.selectQueue = [
      [
        { id: 10, action: 'created', actorId: 11, createdAt: 'now', metadata: { huge: true } },
        { id: 11, action: 'updated', actorId: 11, createdAt: 'now', metadata: { huge: true } },
      ],
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_list_note_history')!.handler({ noteId: 1 });
    const out = parseJson(res) as { items: { action: string; metadata?: unknown }[]; limit: number };
    expect(out.limit).toBe(50);
    expect(out.items[0].action).toBe('created');
    expect('metadata' in out.items[0]).toBe(false);
  });

  it('includes metadata when includeDiff=true', async () => {
    dbState.selectQueue = [
      [{ id: 10, action: 'updated', actorId: 11, createdAt: 'now', metadata: { diff: 'big' } }],
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_list_note_history')!.handler({ noteId: 1, includeDiff: true });
    const out = parseJson(res) as { items: { metadata: unknown }[] };
    expect(out.items[0].metadata).toEqual({ diff: 'big' });
  });

  it('returns not-found if note missing', async () => {
    // getNote(999) returns null per the notes mock
    const tools = sharedTools;
    const res = await tools.get('brain_list_note_history')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });
});

// ── saved searches ─────────────────────────────────────────────────────────

describe('brain_list_saved_searches', () => {
  it('returns shared-only when scope=shared', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_saved_searches')!.handler({ scope: 'shared' });
    const out = parseJson(res) as { items: { scope: string }[] };
    expect(out.items.every((r) => r.scope === 'shared')).toBe(true);
  });

  it('filters to mine when scope=mine', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_saved_searches')!.handler({ scope: 'mine' });
    const out = parseJson(res) as { items: { userId: number | null }[] };
    expect(out.items.every((r) => r.userId === 11)).toBe(true);
  });

  it('omits filters by default and includes them when includeFilters=true', async () => {
    const tools = sharedTools;
    const without = parseJson(await tools.get('brain_list_saved_searches')!.handler({})) as { items: Record<string, unknown>[] };
    expect('filters' in without.items[0]).toBe(false);
    const withFilters = parseJson(await tools.get('brain_list_saved_searches')!.handler({ includeFilters: true })) as { items: Record<string, unknown>[] };
    expect('filters' in withFilters.items[0]).toBe(true);
  });
});

describe('brain_get_saved_search', () => {
  it('returns the saved search', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_saved_search')!.handler({ id: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });

  it('errors when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_saved_search')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_create_saved_search', () => {
  it('creates a personal saved search by default', async () => {
    const ss = await import('@/lib/brain/saved-searches');
    (ss.createSavedSearch as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    const res = await tools.get('brain_create_saved_search')!.handler({ name: 's', filters: {} });
    const arg = (ss.createSavedSearch as ReturnType<typeof vi.fn>).mock.calls[0][0] as { userId: number | null };
    expect(arg.userId).toBe(11);
    expect((parseJson(res) as { scope: string }).scope).toBe('personal');
  });

  it('creates a shared search when scope=shared', async () => {
    const ss = await import('@/lib/brain/saved-searches');
    (ss.createSavedSearch as ReturnType<typeof vi.fn>).mockClear();
    (ss.createSavedSearch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 501, name: 's', icon: null, userId: null, sortOrder: 0, createdAt: 'now',
    });
    const tools = sharedTools;
    const res = await tools.get('brain_create_saved_search')!.handler({ name: 's', filters: {}, scope: 'shared' });
    const arg = (ss.createSavedSearch as ReturnType<typeof vi.fn>).mock.calls[0][0] as { userId: number | null };
    expect(arg.userId).toBeNull();
    expect((parseJson(res) as { scope: string }).scope).toBe('shared');
  });
});

describe('brain_update_saved_search', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_saved_search')!.handler({ id: 999, name: 'new' });
    expect(res.isError).toBe(true);
  });

  it('applies the patch with mapped scope', async () => {
    const ss = await import('@/lib/brain/saved-searches');
    (ss.updateSavedSearch as ReturnType<typeof vi.fn>).mockClear();
    (ss.updateSavedSearch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 2, name: 'new', icon: null, userId: null, sortOrder: 0, updatedAt: 'now',
    });
    const tools = sharedTools;
    await tools.get('brain_update_saved_search')!.handler({ id: 2, name: 'new', scope: 'shared', icon: 'i', sortOrder: 4 });
    const patch = (ss.updateSavedSearch as ReturnType<typeof vi.fn>).mock.calls[0][2] as { userId: number | null; name: string };
    expect(patch.userId).toBeNull();
    expect(patch.name).toBe('new');
  });
});

describe('brain_delete_saved_search', () => {
  it('returns not-found on missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_delete_saved_search')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns deleted echo on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_delete_saved_search')!.handler({ id: 2 });
    const out = parseJson(res) as { id: number; deleted: boolean };
    expect(out).toEqual({ id: 2, deleted: true });
  });
});

// ── templates ───────────────────────────────────────────────────────────────

describe('brain_list_note_templates / brain_get_note_template', () => {
  it('lists templates with bodyLength but no body by default', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_note_templates')!.handler({});
    const out = parseJson(res) as { items: { bodyLength: number; body?: string }[] };
    expect(out.items[0].bodyLength).toBe('BODY'.length);
    expect('body' in out.items[0]).toBe(false);
  });

  it('includes body when includeBody=true', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_list_note_templates')!.handler({ includeBody: true });
    const out = parseJson(res) as { items: { body: string }[] };
    expect(out.items[0].body).toBe('BODY');
  });

  it('returns not-found on missing template', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_note_template')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns the template on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_get_note_template')!.handler({ id: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });
});

describe('brain_create_note_template', () => {
  it('creates a template and returns a slim echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_note_template')!.handler({ name: 'T', body: 'B' });
    const out = parseJson(res) as { id: number; bodyLength: number };
    expect(out.id).toBe(600);
    expect(out.bodyLength).toBe(1);
  });

  it('emits a friendly duplicate-name error', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_note_template')!.handler({ name: 'dupe', body: 'B' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/already exists/);
  });

  it('emits a generic error for other failures', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_note_template')!.handler({ name: 'boom', body: 'B' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });
});

describe('brain_update_note_template', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_note_template')!.handler({ id: 999, name: 'X' });
    expect(res.isError).toBe(true);
  });

  it('handles duplicate-name error from updateTemplate', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_note_template')!.handler({ id: 1, name: 'dupe' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/already exists/);
  });

  it('handles other thrown errors with generic message', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_note_template')!.handler({ id: 1, name: 'boom' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });

  it('returns slim echo on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_update_note_template')!.handler({ id: 1, body: 'longer' });
    const out = parseJson(res) as { id: number; bodyLength: number };
    expect(out.id).toBe(1);
    expect(out.bodyLength).toBe('longer'.length);
  });
});

describe('brain_delete_note_template', () => {
  it('returns not-found on missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_delete_note_template')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns deleted echo on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_delete_note_template')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_create_note_from_template', () => {
  it('returns not-found when template missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_create_note_from_template')!.handler({ templateId: 999 });
    expect(res.isError).toBe(true);
  });

  it('materializes a note with applied body + dedupes tags', async () => {
    dbState.selectQueue = [
      [{ name: 'Alice', email: 'a@example.com' }], // users lookup
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_create_note_from_template')!.handler({ templateId: 1, titleOverride: 'Custom Title' });
    const out = parseJson(res) as { title: string; bodyLength: number; tags: string[] };
    expect(out.title).toBe('Custom Title');
    expect(out.bodyLength).toBeGreaterThan(0);
    expect(out.tags).toContain('from_template:1');
  });

  it('falls back to email when user.name is empty', async () => {
    dbState.selectQueue = [[{ name: '   ', email: 'fallback@example.com' }]];
    const template = await import('@/lib/brain/template');
    (template.applyTemplate as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_create_note_from_template')!.handler({ templateId: 1 });
    const args = (template.applyTemplate as ReturnType<typeof vi.fn>).mock.calls[0][1] as { userName: string | null };
    expect(args.userName).toBe('fallback@example.com');
  });

  it('passes null userName when no user row found', async () => {
    dbState.selectQueue = [[]];
    const template = await import('@/lib/brain/template');
    (template.applyTemplate as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_create_note_from_template')!.handler({ templateId: 1 });
    const args = (template.applyTemplate as ReturnType<typeof vi.fn>).mock.calls[0][1] as { userName: string | null };
    expect(args.userName).toBeNull();
  });
});

// ── CRM read tools (use dynamic schema imports + db.select chains) ──────────

describe('brain_list_companies / brain_get_company', () => {
  it('returns the company list', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'Acme' }]];
    const tools = sharedTools;
    const res = await tools.get('brain_list_companies')!.handler({ search: '  Ac  ', industry: 'tech', limit: 5 });
    expect(parseJson(res)).toEqual([{ id: 1, name: 'Acme' }]);
  });

  it('respects default and bound limits', async () => {
    dbState.selectQueue = [[]];
    const tools = sharedTools;
    const res = await tools.get('brain_list_companies')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('returns not-found if company missing', async () => {
    dbState.selectQueue = [[]]; // company lookup empty
    const tools = sharedTools;
    const res = await tools.get('brain_get_company')!.handler({ companyId: 999 });
    expect(res.isError).toBe(true);
  });

  it('joins contacts + deals when company present', async () => {
    dbState.selectQueue = [
      [{ id: 5, name: 'Acme', clientId: 1 }], // company
      [{ id: 11, firstName: 'A' }],            // contacts
      [{ id: 22, value: 100 }],                // deals
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_get_company')!.handler({ companyId: 5 });
    const out = parseJson(res) as { contacts: { id: number }[]; deals: { id: number }[] };
    expect(out.contacts[0].id).toBe(11);
    expect(out.deals[0].id).toBe(22);
  });
});

describe('brain_list_contacts / brain_get_contact', () => {
  it('lists contacts', async () => {
    dbState.selectQueue = [[{ id: 1, firstName: 'A' }]];
    const tools = sharedTools;
    const res = await tools.get('brain_list_contacts')!.handler({ search: 'a', companyId: 1, status: 'active' });
    expect(parseJson(res)).toEqual([{ id: 1, firstName: 'A' }]);
  });

  it('returns not-found if contact missing', async () => {
    dbState.selectQueue = [[]];
    const tools = sharedTools;
    const res = await tools.get('brain_get_contact')!.handler({ contactId: 999 });
    expect(res.isError).toBe(true);
  });

  it('joins company + deals when contact present and has companyId', async () => {
    dbState.selectQueue = [
      [{ id: 3, firstName: 'X', companyId: 7 }], // contact
      [{ id: 7, name: 'CompanyCo' }],            // company
      [{ id: 9, value: 50 }],                    // deals
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_get_contact')!.handler({ contactId: 3 });
    const out = parseJson(res) as { company: { id: number } | null; deals: { id: number }[] };
    expect(out.company?.id).toBe(7);
    expect(out.deals[0].id).toBe(9);
  });

  it('returns null company when contact has no companyId', async () => {
    dbState.selectQueue = [
      [{ id: 3, firstName: 'X', companyId: null }],
      [{ id: 9, value: 50 }],
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_get_contact')!.handler({ contactId: 3 });
    const out = parseJson(res) as { company: unknown };
    expect(out.company).toBeNull();
  });
});

describe('brain_list_deals / brain_get_deal', () => {
  it('lists deals with filters', async () => {
    dbState.selectQueue = [[{ id: 1, value: 100 }]];
    const tools = sharedTools;
    const res = await tools.get('brain_list_deals')!.handler({ status: 'open', priority: 'high', stageId: 2, companyId: 5, limit: 7 });
    expect(parseJson(res)).toEqual([{ id: 1, value: 100 }]);
  });

  it('returns not-found if deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = sharedTools;
    const res = await tools.get('brain_get_deal')!.handler({ dealId: 999 });
    expect(res.isError).toBe(true);
  });

  it('joins company/contact/stage when deal present', async () => {
    dbState.selectQueue = [
      [{ id: 1, companyId: 11, contactId: 12, stageId: 13, value: 100, clientId: 1 }], // deal
      [{ id: 11, name: 'Co' }],
      [{ id: 12, firstName: 'C' }],
      [{ id: 13, name: 'Stage' }],
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_get_deal')!.handler({ dealId: 1 });
    const out = parseJson(res) as { company: { id: number }; contact: { id: number }; stage: { id: number } };
    expect(out.company.id).toBe(11);
    expect(out.contact.id).toBe(12);
    expect(out.stage.id).toBe(13);
  });

  it('returns null company/contact when not linked', async () => {
    dbState.selectQueue = [
      [{ id: 2, companyId: null, contactId: null, stageId: 13, clientId: 1 }],
      [{ id: 13, name: 'Stage' }],
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_get_deal')!.handler({ dealId: 2 });
    const out = parseJson(res) as { company: unknown; contact: unknown; stage: { id: number } };
    expect(out.company).toBeNull();
    expect(out.contact).toBeNull();
    expect(out.stage.id).toBe(13);
  });
});

// ── posts ───────────────────────────────────────────────────────────────────

describe('brain_list_posts / brain_get_post', () => {
  it('returns empty list when tenant has no websites', async () => {
    dbState.selectQueue = [[]];
    const tools = sharedTools;
    const res = await tools.get('brain_list_posts')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('returns post list when websites exist', async () => {
    dbState.selectQueue = [
      [{ id: 1 }, { id: 2 }],         // websites for tenant
      [{ id: 50, title: 'Post 1' }],  // posts query
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_list_posts')!.handler({ websiteId: 1, published: true, postType: 'page', limit: 10 });
    expect(parseJson(res)).toEqual([{ id: 50, title: 'Post 1' }]);
  });

  it('returns not-found when post does not exist', async () => {
    dbState.selectQueue = [[]];
    const tools = sharedTools;
    const res = await tools.get('brain_get_post')!.handler({ postId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns not-found when post has no website (orphan)', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: null }]];
    const tools = sharedTools;
    const res = await tools.get('brain_get_post')!.handler({ postId: 1 });
    expect(res.isError).toBe(true);
  });

  it('returns not-found when website belongs to a different tenant', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 22 }],         // post
      [{ clientId: 999 }],                // wrong tenant
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_get_post')!.handler({ postId: 1 });
    expect(res.isError).toBe(true);
  });

  it('returns the post when ownership checks pass', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 22, title: 'Post' }],
      [{ clientId: 1 }],
    ];
    const tools = sharedTools;
    const res = await tools.get('brain_get_post')!.handler({ postId: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });
});

// ── tool metadata sanity ────────────────────────────────────────────────────

describe('tool metadata', () => {
  it('every tool has a non-empty title + description', () => {
    const tools = sharedTools;
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} should have a title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} should have a non-trivial description`).toBeGreaterThan(5);
    }
  });

  it('every tool registers an inputSchema (even if empty)', () => {
    const tools = sharedTools;
    for (const t of tools.values()) {
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENDED COVERAGE: decisions, topics, initiatives, goals, people, org-units,
// expertise tags, glossary, playbooks, playbook runs, documents, review routing,
// taxonomy classification
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('@/lib/brain/decisions', () => ({
  createDecision: vi.fn(async () => ({ id: 1, status: 'accepted', decidedAt: '2026-01-01' })),
  getDecisionById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      decision: {
        id, title: 'Decide X', status: 'accepted', reversibility: 'two_way',
        decidedAt: '2026-01-01', supersededByDecisionId: null,
        meetingId: null, noteId: null, companyId: null, dealId: null,
        decisionMakerId: null, context: 'ctx', rationale: 'r', decision: 'd',
        alternativesConsidered: null, confidentialityLevel: 'standard',
      },
      ancestors: [],
      descendants: [],
    };
  }),
  listDecisions: vi.fn(async () => [
    {
      id: 1, title: 'D1', status: 'accepted', reversibility: 'two_way',
      decidedAt: '2026-01-01', supersededByDecisionId: null,
      meetingId: null, noteId: null, companyId: null, dealId: null,
      decisionMakerId: null, context: null, rationale: null,
      decision: null, alternativesConsidered: null,
    },
  ]),
  softRejectDecision: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, status: 'rejected' })),
  supersedeDecision: vi.fn(async () => ({ id: 2, status: 'accepted', decidedAt: '2026-06-01' })),
  updateDecision: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    return { id, title: 'Updated', context: null, decisionMakerId: null, confidentialityLevel: 'standard', alternativesConsidered: null, meetingId: null, noteId: null, companyId: null, dealId: null };
  }),
}));

vi.mock('@/lib/brain/topics', () => ({
  attachTopics: vi.fn(async () => ({ attached: 2, alreadyAttached: 0 })),
  createTopic: vi.fn(async (_c: number, _a: number, input: Record<string, unknown>) => ({ id: 1, slug: 'my-topic', path: '/my-topic', parentId: input.parentId ?? null })),
  deleteTopic: vi.fn(async (_c: number, _a: number, id: number, opts: { force?: boolean }) => {
    if (id === 999) return { deleted: false, reason: 'not_found' };
    if (id === 888 && !opts.force) return { deleted: false, reason: 'has_entities' };
    if (id === 777) return { deleted: false, reason: 'has_children' };
    return { deleted: true };
  }),
  detachTopics: vi.fn(async () => ({ detached: 1 })),
  getTopicById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return { id, name: 'Topic', slug: 'topic', path: '/topic', parentId: null, sortOrder: 0, color: null, icon: null, description: null, breadcrumb: [] };
  }),
  getTopicTree: vi.fn(async () => [
    { id: 1, name: 'Root', slug: 'root', path: '/root', parentId: null, sortOrder: 0, color: null, icon: null, description: 'desc', childCount: 1, entityCount: 2, children: [] },
  ]),
  importTopicsFromTags: vi.fn(async () => ({ topicsCreated: 3, notesAttached: 7, perTopic: [{ topicId: 1, path: '/tag', noteCount: 7 }], dryRun: false })),
  listEntitiesForTopic: vi.fn(async () => ({
    items: [{ entityType: 'note', entityId: 1, title: 'N' }],
    byType: { note: [1], meeting: [], task: [], decision: [], relationship_overlay: [] },
  })),
  listTopics: vi.fn(async () => [
    { id: 1, name: 'T', slug: 't', path: '/t', parentId: null, sortOrder: 0, color: null, icon: null },
  ]),
  mergeTopic: vi.fn(async (_c: number, _a: number, srcId: number) => {
    if (srcId === 999) return null;
    return { targetId: 2, reattached: 3, reparented: 1 };
  }),
  moveTopic: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    return { id, path: '/new-path' };
  }),
  updateTopic: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    return { id, name: 'Updated', description: null, color: null, icon: null, sortOrder: 1 };
  }),
}));

vi.mock('@/lib/brain/initiatives', () => ({
  closeInitiative: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    return { initiative: { id, status: 'completed', closedAt: new Date('2026-01-01') }, lessonsLearnedNoteId: null };
  }),
  createInitiative: vi.fn(async () => ({ id: 10, slug: 'my-initiative', status: 'planned' })),
  getInitiativeById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      initiative: {
        id, name: 'Init', slug: 'init', status: 'active', priority: 'high',
        ownerId: null, sponsorId: null, startDate: null, targetDate: null,
        closedAt: null, closeReason: null, confidentialityLevel: 'standard',
        createdBy: 11, description: 'desc', lessonsLearned: null,
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
      },
      goals: [{ id: 1, title: 'G', status: 'open', ownerId: null, targetDate: null, sortOrder: 0, currentMetric: null, targetMetric: null, unit: null }],
      links: { byType: { task: 1 }, items: [{ entityType: 'task', entityId: 1, title: 'T', pinned: false, note: null }] },
    };
  }),
  linkEntity: vi.fn(async () => ({ linkId: 5, alreadyLinked: false })),
  listInitiatives: vi.fn(async () => [
    { id: 1, name: 'I', slug: 'i', status: 'active', priority: 'medium', ownerId: null, targetDate: null, goalCount: 0, description: null, lessonsLearned: null },
  ]),
  listInitiativeLinks: vi.fn(async () => [
    { entityType: 'task', entityId: 1, title: 'T', pinned: false, note: null },
  ]),
  reopenInitiative: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('cannot reopen from non-terminal status');
    return { id, status: 'active' };
  }),
  unlinkEntity: vi.fn(async () => true),
  updateInitiative: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('use closeInitiative or reopenInitiative');
    return { id, status: 'active', updatedFields: [] };
  }),
}));

vi.mock('@/lib/brain/goals', () => ({
  checkinGoal: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    return { id, status: 'on_track', currentMetric: 5, lastCheckedInAt: new Date('2026-01-01') };
  }),
  createGoal: vi.fn(async () => ({ id: 20, status: 'open', initiativeId: 10 })),
  deleteGoal: vi.fn(async (_c: number, _a: number, id: number) => id !== 999),
  getGoalById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      goal: {
        id, initiativeId: 10, title: 'G', status: 'open', ownerId: null,
        unit: null, targetMetric: null, currentMetric: null,
        targetDate: null, sortOrder: 0, lastCheckedInAt: null,
        description: null, lastProgressNote: null,
        createdBy: 11, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
      },
      initiative: { initiativeId: 10, name: 'Init', slug: 'init', status: 'active' },
    };
  }),
  listGoals: vi.fn(async () => [
    { id: 1, initiativeId: 10, title: 'G', status: 'open', ownerId: null, targetDate: null, sortOrder: 0, currentMetric: null, targetMetric: null, unit: null, description: null, lastProgressNote: null },
  ]),
  updateGoal: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    return { id, status: 'on_track', initiativeId: 10 };
  }),
}));

vi.mock('@/lib/brain/people', () => ({
  attachExpertise: vi.fn(async () => ({ alreadyAttached: false })),
  createExpertiseTag: vi.fn(async (_c: number, _a: number, input: Record<string, unknown>) => ({ id: 30, slug: String(input.name).toLowerCase().replace(/ /g, '-') })),
  createPerson: vi.fn(async () => ({ id: 40, status: 'active' })),
  deleteExpertiseTag: vi.fn(async (_c: number, _a: number, id: number, opts: { force?: boolean }) => {
    if (id === 999) return { deleted: false, reason: 'not_found' };
    if (id === 888 && !opts.force) return { deleted: false, reason: 'in_use' };
    return { deleted: true };
  }),
  deletePerson: vi.fn(async (_c: number, _a: number, id: number) => id !== 999),
  detachExpertise: vi.fn(async () => true),
  getPersonById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      person: {
        id, clientId: 1, userId: null, fullName: 'Alice', email: null,
        managerId: null, title: null, startDate: null, endDate: null,
        status: 'active', source: 'manual', createdBy: 11, notes: null, profileUrls: [],
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
      },
      manager: null,
      directReports: [],
      orgUnits: [],
      expertise: [],
    };
  }),
  listExpertiseTags: vi.fn(async () => [
    { id: 1, name: 'TypeScript', slug: 'typescript', source: 'manual', createdAt: 'now', peopleCount: 2, description: 'TS expert' },
  ]),
  listPeople: vi.fn(async () => [
    { id: 1, clientId: 1, userId: null, fullName: 'Alice', email: null, managerId: null, title: null, startDate: null, endDate: null, status: 'active', source: 'manual', createdBy: 11, createdAt: 'now', updatedAt: 'now' },
  ]),
  mergeExpertiseTags: vi.fn(async () => ({ reattached: 2 })),
  updateExpertiseTag: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, updatedFields: [] })),
  updatePerson: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('would create cycle in manager hierarchy');
    return { id, fullName: 'Updated' };
  }),
  whoKnows: vi.fn(async () => ({ matches: [{ personId: 1, fullName: 'Alice', matchedTags: [] }] })),
}));

vi.mock('@/lib/brain/org-units', () => ({
  addMember: vi.fn(async () => ({ id: 1, primary: false })),
  createOrgUnit: vi.fn(async () => ({ id: 50, slug: 'eng', path: '/eng' })),
  deleteOrgUnit: vi.fn(async (_c: number, _a: number, id: number, opts: { force?: boolean }) => {
    if (id === 999) return false;
    if (id === 888 && !opts.force) throw new Error('Org unit has 2 member(s) and 1 child unit(s). Pass force=true to cascade.');
    return true;
  }),
  getOrgUnitById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return { unit: { id, name: 'Eng', slug: 'eng', path: '/eng', parentId: null, leadPersonId: null, sortOrder: 0, color: null, icon: null, description: null }, ancestors: [], members: [] };
  }),
  getOrgUnitTree: vi.fn(async () => [
    { id: 1, name: 'Root', slug: 'root', path: '/root', parentId: null, leadPersonId: null, sortOrder: 0, color: null, icon: null, description: 'desc', memberCount: 2, children: [] },
  ]),
  listOrgUnits: vi.fn(async () => [
    { id: 1, name: 'Eng', slug: 'eng', path: '/eng', parentId: null, leadPersonId: null, sortOrder: 0, color: null, icon: null, description: 'desc' },
  ]),
  mergeOrgUnits: vi.fn(async (_c: number, _a: number, src: number) => (src === 999 ? null : { id: 2 })),
  moveOrgUnit: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, path: '/new' })),
  removeMember: vi.fn(async () => true),
  setPrimaryUnit: vi.fn(async (_c: number, _a: number, _p: number, unitId: number) => unitId !== 999),
  updateOrgUnit: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, name: 'Updated' })),
}));

vi.mock('@/lib/brain/glossary', () => ({
  bulkImportGlossary: vi.fn(async () => ({ created: 2, updated: 1, errors: [] })),
  createGlossaryTerm: vi.fn(async () => ({ id: 60, slug: 'term' })),
  deleteGlossaryTerm: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? { deleted: false } : { deleted: true, prunedRelatedTermFromCount: 0 })),
  getGlossaryTermById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return { term: { id, term: 'T', slug: 't', shortDefinition: 's', status: 'active', category: null, ownerId: null, source: 'manual', aliases: [], relatedTermIds: [], definition: 'def', createdAt: 'now', updatedAt: 'now' }, relatedTerms: [] };
  }),
  listGlossaryTerms: vi.fn(async () => ({ items: [{ id: 1, term: 'T', slug: 't', shortDefinition: 's', status: 'active', category: null, ownerId: null, aliasCount: 0 }], total: 1 })),
  lookupGlossary: vi.fn(async () => [{ id: 1, term: 'T', score: 10 }]),
  updateGlossaryTerm: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, updatedFields: [] })),
}));

vi.mock('@/lib/brain/playbooks', () => ({
  activatePlaybook: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('playbook DAG invalid: no entry point; cycle detected');
    if (id === 777) throw new Error('has zero steps');
    return { id, status: 'active' };
  }),
  addStep: vi.fn(async () => ({ id: 1, key: 'step-1' })),
  archivePlaybook: vi.fn(async (_c: number, _a: number, id: number, opts: { force?: boolean }) => {
    if (id === 999) return null;
    if (id === 888 && !opts.force) throw new Error('cannot archive playbook with active runs');
    return { id, status: 'archived' };
  }),
  createPlaybook: vi.fn(async () => ({ id: 70, slug: 'pb', status: 'draft' })),
  deletePlaybook: vi.fn(async (_c: number, _a: number, id: number, opts: { force?: boolean }) => {
    if (id === 999) return false;
    if (id === 888 && !opts.force) throw new Error('cannot delete playbook with active runs');
    return true;
  }),
  getPlaybookById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return { playbook: { id, name: 'PB', slug: 'pb', status: 'active', category: null, triggerKind: 'manual', triggerConfig: null, ownerId: null, defaultTopicIds: [], source: 'manual', createdBy: 11, description: 'desc', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }, steps: [] };
  }),
  listPlaybooks: vi.fn(async () => [
    { id: 1, name: 'PB', slug: 'pb', status: 'active', category: null, triggerKind: 'manual', ownerId: null, stepCount: 1, activeRunCount: 0 },
  ]),
  removeStep: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return false;
    if (id === 888) throw new Error('run-step row(s) reference this step');
    return true;
  }),
  reorderSteps: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
  updatePlaybook: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('use activatePlaybook or archivePlaybook');
    return { id, status: 'active', name: 'Updated' };
  }),
  updateStep: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, updatedFields: [] })),
}));

vi.mock('@/lib/brain/playbook-runs', () => ({
  abortRun: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, status: 'aborted' })),
  advanceRun: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { runId: id, newActiveStepKeys: [], newStatus: 'active' })),
  completeStep: vi.fn(async (_c: number, _a: number, _r: number, stepId: number) => (stepId === 999 ? null : { stepId, status: 'completed' })),
  getRunById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      run: { id, playbookId: 70, label: 'Run 1', status: 'active', startedBy: 11, startedAt: new Date('2026-01-01'), completedAt: null, abortedAt: null, abortReason: null, context: { foo: 1 }, triggerPayload: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
      playbook: { id: 70, name: 'PB', slug: 'pb', status: 'active' },
      steps: [],
      links: [],
    };
  }),
  listActiveRunsForEntity: vi.fn(async () => [
    { id: 1, playbookId: 70, playbookName: 'PB', label: 'R', status: 'active', startedAt: new Date('2026-01-01'), completedAt: null, stepProgress: { completed: 0, total: 1 } },
  ]),
  listRuns: vi.fn(async () => [
    { id: 1, playbookId: 70, playbookName: 'PB', label: 'R', status: 'active', startedAt: new Date('2026-01-01'), completedAt: null, stepProgress: { completed: 0, total: 1 } },
  ]),
  skipStep: vi.fn(async (_c: number, _a: number, _r: number, stepId: number) => (stepId === 999 ? null : { stepId, status: 'skipped' })),
  startRun: vi.fn(async () => ({ runId: 100, runStatus: 'active', firstStepKeys: ['step-1'] })),
}));

vi.mock('@/lib/brain/documents', () => ({
  archiveDocument: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, status: 'archived', archivedAt: new Date('2026-01-01') })),
  createDocument: vi.fn(async () => ({ document: { id: 80, slug: 'doc', status: 'draft' }, version: { id: 81 } })),
  deleteDocument: vi.fn(async (_c: number, _a: number, id: number, opts: { force?: boolean }) => {
    if (id === 999) return { deleted: false, refused: false };
    if (id === 888 && !opts.force) return { deleted: false, refused: true, ackCount: 5 };
    return { deleted: true };
  }),
  editDraftVersion: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { version: { id: 82, versionNumber: 2 } })),
  getDocumentById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return { document: { id, slug: 'd', status: 'published', currentPublishedVersionId: 82 }, currentPublishedVersion: null, currentDraftVersion: null, versions: [], links: [] };
  }),
  linkEntity: vi.fn(async () => ({ linkId: 1, alreadyLinked: false })),
  listDocumentLinks: vi.fn(async () => []),
  listDocuments: vi.fn(async () => [{ id: 1, title: 'Doc', slug: 'd', category: 'sop', status: 'published', ownerId: null, currentPublishedVersionId: 82, publishedAt: null, versionCount: 1, requiredReadCount: 0, ackCount: 0 }]),
  promoteFromNote: vi.fn(async (_c: number, _a: number, noteId: number) => (noteId === 999 ? null : { document: { id: 80, slug: 'doc' }, version: { id: 81 } })),
  publishDocument: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('empty body');
    return { document: { id, status: 'published', publishedAt: new Date('2026-01-01') }, version: { id: 82, versionNumber: 2 } };
  }),
  unarchiveDocument: vi.fn(async (_c: number, _a: number, id: number) => (id === 999 ? null : { id, status: 'published' })),
  unlinkEntity: vi.fn(async () => true),
  updateDocument: vi.fn(async (_c: number, _a: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('use publishDocument or archiveDocument');
    return { id, updatedFields: [] };
  }),
}));

vi.mock('@/lib/brain/document-acks', () => ({
  acknowledge: vi.fn(async () => ({ id: 1, documentId: 80, versionId: 82, personId: 40, acknowledgedAt: new Date('2026-01-01') })),
  assignRequiredRead: vi.fn(async () => ({ assigned: 1, alreadyAssigned: 0 })),
  complianceReport: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { documentId: id, acknowledged: [], pending: [], overdue: [] })),
  listAcknowledgmentsForDocument: vi.fn(async () => [{ ackId: 1, versionId: 82, versionNumber: 2, personId: 40, personName: 'Alice', acknowledgedAt: 'now', acknowledgmentNote: null }]),
  listAcknowledgmentsForPerson: vi.fn(async () => [{ ackId: 1, documentId: 80, documentTitle: 'Doc', versionNumber: 2, acknowledgedAt: 'now' }]),
  listRequiredReadsForDocument: vi.fn(async () => [{ id: 1, targetType: 'person', targetId: 40, targetName: 'Alice', pinnedVersionId: null, dueAt: null, assignedAt: 'now' }]),
  listRequiredReadsForPerson: vi.fn(async () => [{ id: 1, documentId: 80, documentTitle: 'Doc', versionId: 82, ackId: null, acknowledgedAt: null }]),
  removeRequiredRead: vi.fn(async (_c: number, _a: number, id: number, opts: { force?: boolean }) => {
    if (id === 999) return { removed: false, reason: 'not_found' };
    if (id === 888 && !opts.force) return { removed: false, reason: 'has_acks' };
    return { removed: true };
  }),
}));

vi.mock('@/lib/brain/classify-notes', () => ({
  classifyNotes: vi.fn(async () => ({
    classifications: [
      { noteId: 1, source: 'slate-kb', slateAreas: ['queries'], audiences: ['slate-admin'], contentType: 'how-to', recency: 'evergreen', competitor: null, status: 'canonical', confidence: 0.9, reasoning: 'r' },
    ],
    skipped: [],
    tokensUsed: 100,
    costUsd: 0.01,
  })),
}));

vi.mock('@/lib/brain/apply-classifications', () => ({
  applyClassifications: vi.fn(async () => ({
    notesUpdated: 1,
    topicsAttached: 2,
    attachmentsExisted: 0,
    routedToReview: 0,
    skipped: [],
  })),
}));

vi.mock('@/lib/brain/review-routing', () => ({
  applySuggestionToReviewItem: vi.fn(async () => {}),
  suggestReviewerForItem: vi.fn(async (_c: number, item: { id: number }) => {
    if (item.id === 999) return null;
    return { personId: 40, score: 4, reason: 'expertise match' };
  }),
}));

// ── review routing tools ─────────────────────────────────────────────────────

describe('brain_review_items_suggest_reviewer', () => {
  it('returns not-found when review item is missing', async () => {
    const review = await import('@/lib/brain/review');
    (review.getReviewItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const tools = sharedTools;
    const res = await tools.get('brain_review_items_suggest_reviewer')!.handler({ reviewItemId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns suggestion when reviewer found', async () => {
    const review = await import('@/lib/brain/review');
    (review.getReviewItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 10, proposedType: 'task', proposedPayload: {} });
    const tools = sharedTools;
    const res = await tools.get('brain_review_items_suggest_reviewer')!.handler({ reviewItemId: 10 });
    const out = parseJson(res) as { suggestedPersonId: number; score: number };
    expect(out.suggestedPersonId).toBe(40);
    expect(out.score).toBe(4);
  });

  it('returns { suggestion: null } when no match', async () => {
    const review = await import('@/lib/brain/review');
    (review.getReviewItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 999, proposedType: 'task', proposedPayload: {} });
    const routing = await import('@/lib/brain/review-routing');
    (routing.suggestReviewerForItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const tools = sharedTools;
    const res = await tools.get('brain_review_items_suggest_reviewer')!.handler({ reviewItemId: 999 });
    const out = parseJson(res) as { suggestion: null };
    expect(out.suggestion).toBeNull();
  });

  it('returns err on thrown error', async () => {
    const review = await import('@/lib/brain/review');
    (review.getReviewItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 1, proposedType: 'task', proposedPayload: {} });
    const routing = await import('@/lib/brain/review-routing');
    (routing.suggestReviewerForItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const tools = sharedTools;
    const res = await tools.get('brain_review_items_suggest_reviewer')!.handler({ reviewItemId: 1 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_review_items_list_for_reviewer', () => {
  it('returns slim items for a person', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_review_items_list_for_reviewer')!.handler({ personId: 40 });
    const out = parseJson(res) as { items: unknown[] };
    expect(Array.isArray(out.items)).toBe(true);
  });
});

// ── decisions ────────────────────────────────────────────────────────────────

describe('brain_decisions_list', () => {
  beforeEach(() => { dbState.selectQueue = []; });

  it('returns paginated items with total', async () => {
    dbState.selectQueue = [[{ count: 5 }]]; // count query
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_list')!.handler({ limit: 10, offset: 0 });
    const out = parseJson(res) as { items: unknown[]; total: number; limit: number; offset: number };
    expect(out.items).toHaveLength(1);
    expect(out.limit).toBe(10);
  });

  it('applies filters', async () => {
    dbState.selectQueue = [[{ count: 0 }]];
    const decisions = await import('@/lib/brain/decisions');
    (decisions.listDecisions as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_decisions_list')!.handler({ status: 'accepted', reversibility: 'one_way', decisionMakerId: 5, supersededOnly: true, dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    const opts = (decisions.listDecisions as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(opts.status).toBe('accepted');
    expect(opts.dateFrom).toBeInstanceOf(Date);
    expect(opts.dateTo).toBeInstanceOf(Date);
  });
});

describe('brain_decisions_get', () => {
  it('returns not-found for missing decision', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns slim decision with chain on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_get')!.handler({ id: 1 });
    const out = parseJson(res) as { decision: { id: number }; ancestors: unknown[]; descendants: unknown[] };
    expect(out.decision.id).toBe(1);
    expect(Array.isArray(out.ancestors)).toBe(true);
  });

  it('opts in context/rationale with include', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_get')!.handler({ id: 1, include: ['context', 'rationale'] });
    const out = parseJson(res) as { decision: Record<string, unknown> };
    expect(out.decision.context).toBe('ctx');
    expect(out.decision.rationale).toBe('r');
  });
});

describe('brain_decisions_create', () => {
  it('creates a decision and returns slim echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_create')!.handler({ title: 'D', decision: 'text', rationale: 'reason' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.id).toBe(1);
    expect(out.status).toBe('accepted');
  });

  it('returns err on thrown error', async () => {
    const decisions = await import('@/lib/brain/decisions');
    (decisions.createDecision as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db error'));
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_create')!.handler({ title: 'D', decision: 'd', rationale: 'r' });
    expect(res.isError).toBe(true);
  });
});

describe('brain_decisions_update', () => {
  it('returns not-found when decision missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns use_supersede structured error when trying to mutate immutable fields', async () => {
    const decisions = await import('@/lib/brain/decisions');
    (decisions.updateDecision as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('use supersedeDecision'));
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_update')!.handler({ id: 1, patch: { title: 'X' } });
    expect((parseJson(res) as { error: string }).error).toBe('use_supersede');
  });

  it('updates and returns echo on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_update')!.handler({ id: 1, patch: { title: 'New' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_decisions_supersede', () => {
  it('creates successor and returns previous + current', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_supersede')!.handler({ oldId: 1, title: 'New', decision: 'new text', rationale: 'new reason' });
    const out = parseJson(res) as { previous: { id: number; status: string }; current: { id: number } };
    expect(out.previous.status).toBe('superseded');
    expect(out.current.id).toBe(2);
  });

  it('returns err on thrown error', async () => {
    const decisions = await import('@/lib/brain/decisions');
    (decisions.supersedeDecision as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('not found'));
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_supersede')!.handler({ oldId: 999, title: 'X', decision: 'd', rationale: 'r' });
    expect(res.isError).toBe(true);
  });
});

describe('brain_decisions_reject', () => {
  it('returns not-found when decision missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_reject')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('rejects and returns { status: "rejected" }', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_decisions_reject')!.handler({ id: 1, reason: 'not relevant' });
    expect((parseJson(res) as { status: string }).status).toBe('rejected');
  });
});

// ── topics ───────────────────────────────────────────────────────────────────

describe('brain_topics_list', () => {
  it('returns flat list of topics', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_list')!.handler({});
    expect(Array.isArray(parseJson(res))).toBe(true);
  });

  it('filters by tagPrefix', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_list')!.handler({ tagPrefix: 'other' });
    expect(parseJson(res)).toEqual([]); // /t doesn't start with /other
  });

  it('includes entity counts when includeEntityCounts=true', async () => {
    dbState.selectQueue = [[{ topicId: 1, count: 3 }]];
    const tools = sharedTools;
    const res = await tools.get('brain_topics_list')!.handler({ includeEntityCounts: true });
    const out = parseJson(res) as { entityCount: number }[];
    expect(out[0].entityCount).toBe(3);
  });
});

describe('brain_topics_tree', () => {
  it('returns nested tree', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_tree')!.handler({});
    const out = parseJson(res) as { id: number; children: unknown[] }[];
    expect(out[0].id).toBe(1);
    expect(Array.isArray(out[0].children)).toBe(true);
  });

  it('includes descriptions when requested', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_tree')!.handler({ includeDescriptions: true });
    const out = parseJson(res) as { description?: string }[];
    expect('description' in out[0]).toBe(true);
  });
});

describe('brain_topics_get', () => {
  it('returns not-found when topic missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns topic and breadcrumb on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_get')!.handler({ id: 1 });
    const out = parseJson(res) as { topic: { id: number }; breadcrumb: unknown[] };
    expect(out.topic.id).toBe(1);
  });
});

describe('brain_topics_entities', () => {
  it('returns paginated entities for a topic', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_entities')!.handler({ id: 1 });
    const out = parseJson(res) as { items: unknown[]; total: number };
    expect(out.total).toBe(1);
  });

  it('filters by entityType', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_entities')!.handler({ id: 1, entityType: 'meeting' });
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(0); // mock returns only 'note' item
  });
});

describe('brain_topics_create', () => {
  it('creates a topic and returns id/slug/path', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_create')!.handler({ name: 'My Topic' });
    const out = parseJson(res) as { id: number; slug: string };
    expect(out.id).toBe(1);
    expect(out.slug).toBe('my-topic');
  });

  it('returns err on thrown error', async () => {
    const topics = await import('@/lib/brain/topics');
    (topics.createTopic as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('dup slug'));
    const tools = sharedTools;
    const res = await tools.get('brain_topics_create')!.handler({ name: 'T' });
    expect(res.isError).toBe(true);
  });
});

describe('brain_topics_update', () => {
  it('returns not-found before lookup when topic is missing', async () => {
    const topics = await import('@/lib/brain/topics');
    (topics.getTopicById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const tools = sharedTools;
    const res = await tools.get('brain_topics_update')!.handler({ id: 999, patch: { name: 'X' } });
    expect(res.isError).toBe(true);
  });

  it('updates and returns echo with changed fields', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_update')!.handler({ id: 1, patch: { name: 'NewName' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
    expect(out.updatedFields).toContain('name');
  });
});

describe('brain_topics_move', () => {
  it('returns not-found when topic missing', async () => {
    const topics = await import('@/lib/brain/topics');
    (topics.getTopicById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const tools = sharedTools;
    const res = await tools.get('brain_topics_move')!.handler({ id: 999, newParentId: null });
    expect(res.isError).toBe(true);
  });

  it('moves topic and returns new path + descendant count', async () => {
    dbState.selectQueue = [[{ count: 2 }]]; // descendant count
    const tools = sharedTools;
    const res = await tools.get('brain_topics_move')!.handler({ id: 1, newParentId: null });
    const out = parseJson(res) as { id: number; path: string; descendantsRepathed: number };
    expect(out.descendantsRepathed).toBe(2);
  });
});

describe('brain_topics_merge', () => {
  it('returns not-found when source missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_merge')!.handler({ sourceId: 999, targetId: 2 });
    expect(res.isError).toBe(true);
  });

  it('merges and returns reattach/reparent counts', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_merge')!.handler({ sourceId: 1, targetId: 2 });
    const out = parseJson(res) as { entitiesReattached: number; childrenReparented: number };
    expect(out.entitiesReattached).toBe(3);
    expect(out.childrenReparented).toBe(1);
  });
});

describe('brain_topics_delete', () => {
  it('returns not-found for missing topic', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns structured error when topic has children', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_delete')!.handler({ id: 777 });
    expect((parseJson(res) as { error: string }).error).toBe('has_children');
  });

  it('returns structured error when topic has entities and force not set', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('has_entities');
  });

  it('deletes and returns success echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });
});

describe('brain_topics_attach / brain_topics_detach', () => {
  it('attaches topics and returns counts', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_attach')!.handler({
      targetEntityType: 'note', targetEntityId: 1, topicIds: [1, 2],
    });
    const out = parseJson(res) as { attached: number; alreadyAttached: number };
    expect(out.attached).toBe(2);
  });

  it('detaches topics and returns count', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_detach')!.handler({
      targetEntityType: 'note', targetEntityId: 1, topicIds: [1],
    });
    expect((parseJson(res) as { detached: number }).detached).toBe(1);
  });
});

describe('brain_topics_import_from_tags', () => {
  it('returns import report', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_topics_import_from_tags')!.handler({ dryRun: false });
    const out = parseJson(res) as { topicsCreated: number; notesAttached: number };
    expect(out.topicsCreated).toBe(3);
    expect(out.notesAttached).toBe(7);
  });
});

// ── initiatives ───────────────────────────────────────────────────────────────

describe('brain_initiatives_list', () => {
  it('returns items with pagination', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_list')!.handler({});
    const out = parseJson(res) as { items: unknown[]; limit: number };
    expect(out.items).toHaveLength(1);
  });

  it('includes description when requested', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_list')!.handler({ include: ['description'] });
    const out = parseJson(res) as { items: Record<string, unknown>[] };
    expect('description' in out.items[0]).toBe(true);
  });
});

describe('brain_initiatives_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns initiative with goals and links on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_get')!.handler({ id: 1, includeGoals: true, includeLinks: true });
    const out = parseJson(res) as { initiative: { id: number }; goals: unknown[]; links: unknown };
    expect(out.initiative.id).toBe(1);
    expect(Array.isArray(out.goals)).toBe(true);
  });
});

describe('brain_initiatives_create', () => {
  it('creates an initiative and returns slim echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_create')!.handler({ name: 'Init Q1' });
    const out = parseJson(res) as { id: number; slug: string };
    expect(out.id).toBe(10);
    expect(out.slug).toBe('my-initiative');
  });

  it('returns err on thrown error', async () => {
    const initiatives = await import('@/lib/brain/initiatives');
    (initiatives.createInitiative as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_create')!.handler({ name: 'X' });
    expect(res.isError).toBe(true);
  });
});

describe('brain_initiatives_update', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns use_close_or_reopen when status change attempted', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_update')!.handler({ id: 888, patch: { name: 'X' } });
    expect((parseJson(res) as { error: string }).error).toBe('use_close_or_reopen');
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_update')!.handler({ id: 1, patch: { name: 'New Name' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_initiatives_close', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_close')!.handler({ id: 999, outcome: 'completed' });
    expect(res.isError).toBe(true);
  });

  it('closes initiative and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_close')!.handler({ id: 1, outcome: 'cancelled', reason: 'budget' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('completed');
  });
});

describe('brain_initiatives_reopen', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_reopen')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns non_terminal_status error when state not closable', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_reopen')!.handler({ id: 888 });
    expect((parseJson(res) as { error: string }).error).toBe('non_terminal_status');
  });

  it('reopens and returns { status: "active" }', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_reopen')!.handler({ id: 1 });
    expect((parseJson(res) as { status: string }).status).toBe('active');
  });
});

describe('brain_initiatives_link / brain_initiatives_unlink', () => {
  it('links entity and returns linkId', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_link')!.handler({ initiativeId: 1, entityType: 'task', entityId: 1 });
    const out = parseJson(res) as { linkId: number; alreadyLinked: boolean };
    expect(out.linkId).toBe(5);
    expect(out.alreadyLinked).toBe(false);
  });

  it('unlinks entity', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_unlink')!.handler({ initiativeId: 1, entityType: 'task', entityId: 1 });
    expect((parseJson(res) as { removed: boolean }).removed).toBe(true);
  });
});

describe('brain_initiatives_links', () => {
  it('returns links with byType tally', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_initiatives_links')!.handler({ id: 1 });
    const out = parseJson(res) as { items: unknown[]; total: number; byType: Record<string, number> };
    expect(out.total).toBe(1);
    expect(out.byType.task).toBe(1);
  });
});

// ── goals ────────────────────────────────────────────────────────────────────

describe('brain_goals_list', () => {
  it('returns paginated goals', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_list')!.handler({});
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });

  it('opts in description when requested', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_list')!.handler({ include: ['description'] });
    const out = parseJson(res) as { items: Record<string, unknown>[] };
    expect('description' in out.items[0]).toBe(true);
  });
});

describe('brain_goals_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns goal with initiative reference on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_get')!.handler({ id: 1 });
    const out = parseJson(res) as { goal: { id: number }; initiative: { id: number } };
    expect(out.goal.id).toBe(1);
    expect(out.initiative.id).toBe(10);
  });
});

describe('brain_goals_create', () => {
  it('creates a goal and returns slim echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_create')!.handler({ initiativeId: 10, title: 'G' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.id).toBe(20);
    expect(out.status).toBe('open');
  });
});

describe('brain_goals_update', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_update')!.handler({ id: 1, patch: { status: 'on_track' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_goals_checkin', () => {
  it('returns not-found when goal missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_checkin')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('records check-in and returns slim echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_checkin')!.handler({ id: 1, currentMetric: 5, note: 'progress!' });
    const out = parseJson(res) as { id: number; status: string; currentMetric: number };
    expect(out.status).toBe('on_track');
    expect(out.currentMetric).toBe(5);
  });
});

describe('brain_goals_delete', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('deletes and returns success echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_goals_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });
});

// ── people ───────────────────────────────────────────────────────────────────

describe('brain_people_list', () => {
  it('returns slim items', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_list')!.handler({});
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });

  it('hydrates heavy fields when include=["notes","profileUrls"]', async () => {
    dbState.selectQueue = [[{ id: 1, notes: 'notes text', profileUrls: [] }]];
    const tools = sharedTools;
    const res = await tools.get('brain_people_list')!.handler({ include: ['notes', 'profileUrls'] });
    const out = parseJson(res) as { items: Record<string, unknown>[] };
    expect(out.items[0].notes).toBe('notes text');
  });
});

describe('brain_people_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns person with org units and expertise', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_get')!.handler({ id: 1 });
    const out = parseJson(res) as { person: { id: number }; orgUnits: unknown[]; expertise: unknown[] };
    expect(out.person.id).toBe(1);
  });
});

describe('brain_people_create', () => {
  it('creates a person and returns slim echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_create')!.handler({ fullName: 'Alice' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.id).toBe(40);
    expect(out.status).toBe('active');
  });

  it('returns err on thrown error', async () => {
    const people = await import('@/lib/brain/people');
    (people.createPerson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('dup email'));
    const tools = sharedTools;
    const res = await tools.get('brain_people_create')!.handler({ fullName: 'X' });
    expect(res.isError).toBe(true);
  });
});

describe('brain_people_update', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns manager_cycle error', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_update')!.handler({ id: 888, patch: { managerId: 888 } });
    expect((parseJson(res) as { error: string }).error).toBe('manager_cycle');
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_update')!.handler({ id: 1, patch: { fullName: 'Bob' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_people_delete', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('deletes and returns success echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });
});

describe('brain_people_attach_expertise / brain_people_detach_expertise', () => {
  it('attaches expertise tag', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_attach_expertise')!.handler({ personId: 1, expertiseTagId: 10 });
    const out = parseJson(res) as { alreadyAttached: boolean };
    expect(out.alreadyAttached).toBe(false);
  });

  it('detaches expertise tag', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_people_detach_expertise')!.handler({ personId: 1, expertiseTagId: 10 });
    expect((parseJson(res) as { detached: boolean }).detached).toBe(true);
  });
});

describe('brain_who_knows', () => {
  it('returns ranked matches', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_who_knows')!.handler({ query: 'TypeScript', limit: 5 });
    const out = parseJson(res) as { matches: unknown[] };
    expect(out.matches).toHaveLength(1);
  });
});

// ── expertise tags ────────────────────────────────────────────────────────────

describe('brain_expertise_tags_list', () => {
  it('returns slim items by default', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_list')!.handler({});
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_expertise_tags_create', () => {
  it('creates and returns slug echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_create')!.handler({ name: 'React' });
    const out = parseJson(res) as { id: number; slug: string };
    expect(out.slug).toBe('react');
  });
});

describe('brain_expertise_tags_update', () => {
  it('returns not-found when tag missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_update')!.handler({ id: 1, patch: { name: 'TS' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_expertise_tags_delete', () => {
  it('returns not-found when tag missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns in_use structured error when force not set', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_delete')!.handler({ id: 888 });
    expect((parseJson(res) as { error: string }).error).toBe('in_use');
  });

  it('deletes on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });
});

describe('brain_expertise_tags_merge', () => {
  it('merges tags and returns reattach count', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_expertise_tags_merge')!.handler({ sourceTagId: 1, targetTagId: 2 });
    const out = parseJson(res) as { peopleReattached: number; sourceDeleted: boolean };
    expect(out.peopleReattached).toBe(2);
    expect(out.sourceDeleted).toBe(true);
  });
});

// ── org units ─────────────────────────────────────────────────────────────────

describe('brain_org_units_list', () => {
  it('returns flat list with memberCount', async () => {
    dbState.selectQueue = [[{ orgUnitId: 1, count: 3 }]]; // member count query
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_list')!.handler({});
    const out = parseJson(res) as { items: { memberCount: number }[] };
    expect(out.items[0].memberCount).toBe(3);
  });
});

describe('brain_org_units_tree', () => {
  it('returns nested tree', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_tree')!.handler({});
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_org_units_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns unit with members on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_get')!.handler({ id: 1 });
    const out = parseJson(res) as { unit: { id: number }; members: unknown[] };
    expect(out.unit.id).toBe(1);
  });
});

describe('brain_org_units_create', () => {
  it('creates and returns slug + path', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_create')!.handler({ name: 'Engineering' });
    const out = parseJson(res) as { id: number; slug: string; path: string };
    expect(out.slug).toBe('eng');
  });
});

describe('brain_org_units_update', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_update')!.handler({ id: 1, patch: { name: 'Eng2' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_org_units_move', () => {
  it('returns not-found when unit missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_move')!.handler({ id: 999, newParentId: null });
    expect(res.isError).toBe(true);
  });

  it('moves and returns new path', async () => {
    dbState.selectQueue = [[{ id: 5 }, { id: 6 }]]; // descendant rows
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_move')!.handler({ id: 1, newParentId: 2 });
    const out = parseJson(res) as { id: number; path: string; descendantsRepathed: number };
    expect(out.descendantsRepathed).toBe(2);
  });
});

describe('brain_org_units_merge', () => {
  it('returns not-found when source missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_merge')!.handler({ sourceId: 999, targetId: 2 });
    expect(res.isError).toBe(true);
  });

  it('merges and returns counts', async () => {
    dbState.selectQueue = [[]]; // children query → empty
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_merge')!.handler({ sourceId: 1, targetId: 2 });
    const out = parseJson(res) as { membersReattached: number; childrenReparented: number };
    expect(typeof out.membersReattached).toBe('number');
  });
});

describe('brain_org_units_delete', () => {
  it('returns not-found when unit missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns in_use structured error when conflicts exist', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string; memberCount: number; childCount: number };
    expect(out.error).toBe('in_use');
    expect(out.memberCount).toBe(2);
    expect(out.childCount).toBe(1);
  });

  it('deletes on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });
});

describe('brain_org_units_add_member / remove_member / set_primary', () => {
  beforeEach(() => { dbState.selectQueue = []; dbState.selectRows = []; });

  it('adds member and returns alreadyMember flag', async () => {
    dbState.selectRows = []; // no existing membership
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_add_member')!.handler({ orgUnitId: 1, personId: 40 });
    const out = parseJson(res) as { alreadyMember: boolean; primary: boolean };
    expect(out.alreadyMember).toBe(false);
  });

  it('detects existing membership', async () => {
    dbState.selectRows = [{ id: 5 }]; // existing membership row
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_add_member')!.handler({ orgUnitId: 1, personId: 40 });
    expect((parseJson(res) as { alreadyMember: boolean }).alreadyMember).toBe(true);
  });

  it('removes member', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_remove_member')!.handler({ orgUnitId: 1, personId: 40 });
    expect((parseJson(res) as { removed: boolean }).removed).toBe(true);
  });

  it('sets primary unit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_set_primary')!.handler({ personId: 1, orgUnitId: 1 });
    expect((parseJson(res) as { primary: boolean }).primary).toBe(true);
  });

  it('returns error when set_primary membership not found', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_org_units_set_primary')!.handler({ personId: 1, orgUnitId: 999 });
    expect(res.isError).toBe(true);
  });
});

// ── glossary ─────────────────────────────────────────────────────────────────

describe('brain_glossary_list', () => {
  it('returns slim items by default', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_list')!.handler({});
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });

  it('hydrates definition + aliases when include requested', async () => {
    dbState.selectQueue = [[{ id: 1, definition: 'full def', aliases: ['alias1'] }]];
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_list')!.handler({ include: ['definition', 'aliases'] });
    const out = parseJson(res) as { items: Record<string, unknown>[] };
    expect(out.items[0].definition).toBe('full def');
    expect((out.items[0].aliases as string[])[0]).toBe('alias1');
  });
});

describe('brain_glossary_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns term with opt-in fields on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_get')!.handler({ id: 1, include: ['definition'] });
    const out = parseJson(res) as { term: Record<string, unknown>; relatedTerms: unknown[] };
    expect(out.term.definition).toBe('def');
  });
});

describe('brain_glossary_lookup', () => {
  it('returns scored results', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_lookup')!.handler({ query: 'T' });
    const out = parseJson(res) as { id: number; score: number }[];
    expect(out[0].score).toBe(10);
  });
});

describe('brain_glossary_create', () => {
  it('creates a term and returns id + slug', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_create')!.handler({ term: 'SaaS', definition: 'Software as a Service' });
    const out = parseJson(res) as { id: number; slug: string };
    expect(out.id).toBe(60);
  });
});

describe('brain_glossary_update', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_update')!.handler({ id: 1, patch: { term: 'NewTerm' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_glossary_delete', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('deletes and returns echo with prune count', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean; prunedRelatedTermFromCount: number };
    expect(out.deleted).toBe(true);
    expect(out.prunedRelatedTermFromCount).toBe(0);
  });
});

describe('brain_glossary_bulk_import', () => {
  it('returns created/updated/errors counts', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_glossary_bulk_import')!.handler({ terms: [{ term: 'T1', definition: 'D1' }, { term: 'T2', definition: 'D2' }] });
    const out = parseJson(res) as { created: number; updated: number; errors: unknown[] };
    expect(out.created).toBe(2);
    expect(out.updated).toBe(1);
  });
});

// ── playbooks ────────────────────────────────────────────────────────────────

describe('brain_playbooks_list', () => {
  it('returns slim list of playbooks', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_list')!.handler({});
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });

  it('hydrates heavy fields when include requested', async () => {
    dbState.selectQueue = [[{ id: 1, description: 'Desc', triggerConfig: {}, defaultTopicIds: [1] }]];
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_list')!.handler({ include: ['description', 'triggerConfig', 'defaultTopicIds'] });
    const out = parseJson(res) as { items: Record<string, unknown>[] };
    expect(out.items[0].description).toBe('Desc');
  });
});

describe('brain_playbooks_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns playbook with steps on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_get')!.handler({ id: 1 });
    const out = parseJson(res) as { playbook: { id: number }; steps: unknown[] };
    expect(out.playbook.id).toBe(1);
    expect(Array.isArray(out.steps)).toBe(true);
  });
});

describe('brain_playbooks_create', () => {
  it('creates and returns slug + status', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_create')!.handler({ name: 'Onboarding' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('draft');
  });
});

describe('brain_playbooks_update', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns use_activate_or_archive when status change attempted', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_update')!.handler({ id: 888, patch: { name: 'X' } });
    expect((parseJson(res) as { error: string }).error).toBe('use_activate_or_archive');
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_update')!.handler({ id: 1, patch: { name: 'NewName' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_playbooks_activate', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns dag_invalid error on DAG failure', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string; errors: string[] };
    expect(out.error).toBe('dag_invalid');
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it('returns dag_invalid for zero steps', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 777 });
    expect((parseJson(res) as { error: string }).error).toBe('dag_invalid');
  });

  it('activates on success', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 1 });
    expect((parseJson(res) as { status: string }).status).toBe('active');
  });
});

describe('brain_playbooks_archive', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_archive')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns active_runs_exist when blocking runs exist', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_archive')!.handler({ id: 888 });
    expect((parseJson(res) as { error: string }).error).toBe('active_runs_exist');
  });

  it('archives on success', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_archive')!.handler({ id: 1 });
    expect((parseJson(res) as { status: string }).status).toBe('archived');
  });
});

describe('brain_playbooks_delete', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns runs_exist error when runs block delete', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_delete')!.handler({ id: 888 });
    expect((parseJson(res) as { error: string }).error).toBe('runs_exist');
  });

  it('deletes on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });
});

describe('brain_playbooks_add_step / update_step / remove_step / reorder_steps', () => {
  it('adds a step and returns id + key', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_add_step')!.handler({
      playbookId: 1, step: { key: 'step-1', name: 'Step One', kind: 'task' },
    });
    const out = parseJson(res) as { id: number; key: string };
    expect(out.key).toBe('step-1');
  });

  it('updates a step', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_update_step')!.handler({ stepId: 1, patch: { name: 'Renamed' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });

  it('returns not-found on missing step update', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_update_step')!.handler({ stepId: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('removes a step', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_remove_step')!.handler({ stepId: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });

  it('returns run_steps_reference error when step in active run', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_remove_step')!.handler({ stepId: 888 });
    expect((parseJson(res) as { error: string }).error).toBe('run_steps_reference');
  });

  it('reorders steps and returns count', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbooks_reorder_steps')!.handler({ playbookId: 1, orderedStepIds: [2, 1] });
    const out = parseJson(res) as { playbookId: number; count: number };
    expect(out.count).toBe(2);
  });
});

// ── playbook runs ─────────────────────────────────────────────────────────────

describe('brain_playbook_runs_list', () => {
  it('returns paginated run list', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_list')!.handler({});
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });
});

describe('brain_playbook_runs_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns run with playbook + steps + links on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_get')!.handler({ id: 1 });
    const out = parseJson(res) as { run: { id: number }; playbook: { id: number }; steps: unknown[]; links: unknown[] };
    expect(out.run.id).toBe(1);
    expect(out.playbook.id).toBe(70);
  });

  it('opts in context when include=["context"]', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_get')!.handler({ id: 1, include: ['context'] });
    const out = parseJson(res) as { run: Record<string, unknown> };
    expect(out.run.context).toEqual({ foo: 1 });
  });
});

describe('brain_playbook_runs_active_for_entity', () => {
  it('returns active runs for entity', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_active_for_entity')!.handler({ entityType: 'person', entityId: 40 });
    const out = parseJson(res) as { items: unknown[]; total: number };
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(1);
  });
});

describe('brain_playbook_runs_start', () => {
  it('starts a run and returns runId + firstStepKeys', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_start')!.handler({ playbookId: 70, label: 'Run 1' });
    const out = parseJson(res) as { runId: number; status: string; firstStepKeys: string[] };
    expect(out.runId).toBe(100);
    expect(out.firstStepKeys).toContain('step-1');
  });

  it('returns err on thrown error', async () => {
    const runs = await import('@/lib/brain/playbook-runs');
    (runs.startRun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('playbook not active'));
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_start')!.handler({ playbookId: 999, label: 'X' });
    expect(res.isError).toBe(true);
  });
});

describe('brain_playbook_runs_advance', () => {
  it('returns not-found when run missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_advance')!.handler({ runId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns new active step keys on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_advance')!.handler({ runId: 1 });
    const out = parseJson(res) as { runId: number; newActiveStepKeys: string[] };
    expect(out.runId).toBe(1);
  });
});

describe('brain_playbook_run_steps_complete / skip', () => {
  it('completes a run step', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_run_steps_complete')!.handler({ runId: 1, stepId: 1 });
    const out = parseJson(res) as { stepId: number; status: string };
    expect(out.status).toBe('completed');
  });

  it('returns not-found for missing step on complete', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_run_steps_complete')!.handler({ runId: 1, stepId: 999 });
    expect(res.isError).toBe(true);
  });

  it('skips a run step', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_run_steps_skip')!.handler({ runId: 1, stepId: 1, reason: 'not applicable' });
    expect((parseJson(res) as { status: string }).status).toBe('skipped');
  });

  it('returns not-found for missing step on skip', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_run_steps_skip')!.handler({ runId: 1, stepId: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_playbook_runs_abort', () => {
  it('returns not-found when run missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_abort')!.handler({ runId: 999 });
    expect(res.isError).toBe(true);
  });

  it('aborts and returns { status: "aborted" }', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_playbook_runs_abort')!.handler({ runId: 1, reason: 'cancelled by user' });
    expect((parseJson(res) as { status: string }).status).toBe('aborted');
  });
});

// ── documents ────────────────────────────────────────────────────────────────

describe('brain_documents_list', () => {
  it('returns document list', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_list')!.handler({});
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });

  it('hydrates body when include=["body"]', async () => {
    dbState.selectQueue = [[{ id: 82, body: 'markdown body' }]]; // version bodies
    const tools = sharedTools;
    const res = await tools.get('brain_documents_list')!.handler({ include: ['body'] });
    const out = parseJson(res) as { items: Record<string, unknown>[] };
    expect(out.items[0].body).toBe('markdown body');
  });
});

describe('brain_documents_get', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns document with versions and links on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_get')!.handler({ id: 1 });
    const out = parseJson(res) as { document: { id: number }; links: unknown[] };
    expect(out.document.id).toBe(1);
  });
});

describe('brain_document_versions_list', () => {
  it('returns not-found when document missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_versions_list')!.handler({ documentId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns slim version list on hit', async () => {
    dbState.selectQueue = [[{ id: 82, versionNumber: 2, isDraft: false, publishedAt: null, title: 'V2', body: 'B', changeNotes: null, summary: null }]];
    const tools = sharedTools;
    const res = await tools.get('brain_document_versions_list')!.handler({ documentId: 1 });
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(82);
  });
});

describe('brain_document_versions_get', () => {
  it('returns not-found when version missing', async () => {
    dbState.selectRows = [];
    const tools = sharedTools;
    const res = await tools.get('brain_document_versions_get')!.handler({ versionId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns version on hit', async () => {
    dbState.selectQueue = [[{ id: 82, documentId: 80, versionNumber: 2, isDraft: false, publishedAt: null, title: 'V2', body: 'body', createdBy: 11, createdAt: new Date(), updatedAt: new Date(), changeNotes: null, summary: null, publishedBy: null }]];
    const tools = sharedTools;
    const res = await tools.get('brain_document_versions_get')!.handler({ versionId: 82 });
    const out = parseJson(res) as { id: number; body: string };
    expect(out.id).toBe(82);
    expect(out.body).toBe('body');
  });
});

describe('brain_documents_create', () => {
  it('creates document and returns id + slug + version1Id', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_create')!.handler({ title: 'Onboarding SOP' });
    const out = parseJson(res) as { id: number; slug: string; version1Id: number };
    expect(out.id).toBe(80);
    expect(out.version1Id).toBe(81);
  });
});

describe('brain_documents_update', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns use_publish_or_archive when status change attempted', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_update')!.handler({ id: 888, patch: { title: 'X' } });
    expect((parseJson(res) as { error: string }).error).toBe('use_publish_or_archive');
  });

  it('updates and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_update')!.handler({ id: 1, patch: { title: 'New Title' } });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_document_versions_edit_draft', () => {
  it('returns not-found when document missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_versions_edit_draft')!.handler({ documentId: 999, patch: { body: 'x' } });
    expect(res.isError).toBe(true);
  });

  it('edits draft and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_versions_edit_draft')!.handler({ documentId: 1, patch: { body: 'updated content' } });
    const out = parseJson(res) as { documentId: number; versionId: number; isDraft: boolean };
    expect(out.documentId).toBe(1);
    expect(out.isDraft).toBe(true);
  });
});

describe('brain_documents_publish', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_publish')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns empty_draft_body on empty draft', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_publish')!.handler({ id: 888 });
    expect((parseJson(res) as { error: string }).error).toBe('empty_draft_body');
  });

  it('publishes and returns echo with publishedAt', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_publish')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('published');
  });
});

describe('brain_documents_archive / unarchive', () => {
  it('returns not-found on archive when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_archive')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('archives and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_archive')!.handler({ id: 1, reason: 'obsolete' });
    expect((parseJson(res) as { status: string }).status).toBe('archived');
  });

  it('returns not-found on unarchive when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_unarchive')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('unarchives and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_unarchive')!.handler({ id: 1 });
    expect((parseJson(res) as { status: string }).status).toBe('published');
  });
});

describe('brain_documents_delete', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns document_has_acks structured error', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string; ackCount: number };
    expect(out.error).toBe('document_has_acks');
    expect(out.ackCount).toBe(5);
  });

  it('deletes on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { deleted: boolean }).deleted).toBe(true);
  });
});

describe('brain_documents_promote_from_note', () => {
  it('returns not-found when note missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_promote_from_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });

  it('promotes and returns documentId + version1Id', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_promote_from_note')!.handler({ noteId: 1 });
    const out = parseJson(res) as { documentId: number; version1Id: number };
    expect(out.documentId).toBe(80);
    expect(out.version1Id).toBe(81);
  });
});

describe('brain_documents_link / unlink', () => {
  it('links entity and returns linkId', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_link')!.handler({ documentId: 1, entityType: 'topic', entityId: 1 });
    const out = parseJson(res) as { linkId: number; alreadyLinked: boolean };
    expect(out.linkId).toBe(1);
  });

  it('unlinks entity', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_unlink')!.handler({ documentId: 1, entityType: 'topic', entityId: 1 });
    expect((parseJson(res) as { removed: boolean }).removed).toBe(true);
  });
});

// ── document required-reads and acknowledgments ───────────────────────────────

describe('brain_document_required_reads_list_for_document', () => {
  it('returns required reads for a document', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_required_reads_list_for_document')!.handler({ documentId: 1 });
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });
});

describe('brain_document_required_reads_list_for_person', () => {
  it('returns required reads for a person', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_required_reads_list_for_person')!.handler({ personId: 40 });
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });
});

describe('brain_document_acknowledgments_list_for_document', () => {
  it('returns acknowledgments for a document', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_acknowledgments_list_for_document')!.handler({ documentId: 1 });
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });
});

describe('brain_document_acknowledgments_list_for_person', () => {
  it('returns acknowledgments for a person', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_acknowledgments_list_for_person')!.handler({ personId: 40 });
    const out = parseJson(res) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });
});

describe('brain_document_compliance_report', () => {
  it('returns not-found when document missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_compliance_report')!.handler({ documentId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns compliance report on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_compliance_report')!.handler({ documentId: 1 });
    const out = parseJson(res) as { documentId: number };
    expect(out.documentId).toBe(1);
  });
});

describe('brain_document_required_reads_assign', () => {
  it('assigns required read and returns counts', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_required_reads_assign')!.handler({ documentId: 1, targetType: 'person', targetId: 40 });
    const out = parseJson(res) as { assigned: number; alreadyAssigned: number };
    expect(out.assigned).toBe(1);
  });
});

describe('brain_document_required_reads_remove', () => {
  it('returns not-found when missing', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_required_reads_remove')!.handler({ requiredReadId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns has_acks structured error when acks block removal', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_required_reads_remove')!.handler({ requiredReadId: 888 });
    expect((parseJson(res) as { error: string }).error).toBe('has_acks');
  });

  it('removes on hit', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_document_required_reads_remove')!.handler({ requiredReadId: 1 });
    expect((parseJson(res) as { removed: boolean }).removed).toBe(true);
  });
});

describe('brain_documents_acknowledge', () => {
  it('records acknowledgment and returns echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_documents_acknowledge')!.handler({ documentId: 80, versionId: 82, personId: 40 });
    const out = parseJson(res) as { ackId: number; documentId: number; personId: number };
    expect(out.ackId).toBe(1);
    expect(out.documentId).toBe(80);
    expect(out.personId).toBe(40);
  });
});

// ── taxonomy classification ───────────────────────────────────────────────────

describe('brain_classify_notes', () => {
  it('requires noteIds or all:true', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_classify_notes')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/noteIds.*all/i);
  });

  it('rejects both noteIds and all:true together', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_classify_notes')!.handler({ noteIds: [1], all: true });
    expect(res.isError).toBe(true);
  });

  it('returns dry-run summary by default', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_classify_notes')!.handler({ noteIds: [1] });
    const out = parseJson(res) as { dryRun: boolean; classifiedCount: number; sampleClassifications: unknown[] };
    expect(out.dryRun).toBe(true);
    expect(out.classifiedCount).toBe(1);
    expect(Array.isArray(out.sampleClassifications)).toBe(true);
  });

  it('returns full classifications when dryRun=false', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_classify_notes')!.handler({ all: true, dryRun: false });
    const out = parseJson(res) as { dryRun: boolean; classifications: unknown[] };
    expect(out.dryRun).toBe(false);
    expect(out.classifications).toHaveLength(1);
  });

  it('calls classifyNotes with all:true when all=true', async () => {
    const classify = await import('@/lib/brain/classify-notes');
    (classify.classifyNotes as ReturnType<typeof vi.fn>).mockClear();
    const tools = sharedTools;
    await tools.get('brain_classify_notes')!.handler({ all: true });
    const callArgs = (classify.classifyNotes as ReturnType<typeof vi.fn>).mock.calls[0][0] as { all: boolean | undefined };
    expect(callArgs.all).toBe(true);
  });
});

describe('brain_apply_classifications', () => {
  it('applies classifications and returns summary echo', async () => {
    const tools = sharedTools;
    const res = await tools.get('brain_apply_classifications')!.handler({
      classifications: [{
        noteId: 1,
        source: 'slate-kb',
        slateAreas: ['queries'],
        audiences: ['slate-admin'],
        contentType: 'how-to',
        recency: 'evergreen',
        status: 'canonical',
        confidence: 0.9,
      }],
    });
    const out = parseJson(res) as { notesUpdated: number; topicsAttached: number };
    expect(out.notesUpdated).toBe(1);
    expect(out.topicsAttached).toBe(2);
  });
});
