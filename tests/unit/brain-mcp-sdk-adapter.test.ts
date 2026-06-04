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

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ── tests ───────────────────────────────────────────────────────────────────

describe('registerBrainToolsOnSdk — tool registration', () => {
  beforeEach(() => {
    dbState.insertReturning = [{ id: 700, status: 'pending', proposedType: 'task' }];
    dbState.selectRows = [];
    dbState.selectQueue = [];
    nextNoteId = 1000;
  });

  it('registers a large set of tools when scopes=*', () => {
    const tools = registerAll();
    expect(tools.size).toBeGreaterThanOrEqual(30);
  });

  it('registers the canonical read-only tools', () => {
    const tools = registerAll();
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
    const tools = registerAll();
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
    const tools = registerAll();
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
    const tools = registerAll();
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
    const tools = registerAll();
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
    const tools = registerAll();
    const res = await tools.get('brain_list_relationships')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1 }]);
  });

  it('returns 404-equiv error when relationship missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_relationship')!.handler({ overlayId: 999 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/i);
  });

  it('returns the overlay on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_relationship')!.handler({ overlayId: 4 });
    expect((parseJson(res) as { id: number }).id).toBe(4);
  });
});

// ── meetings ────────────────────────────────────────────────────────────────

describe('brain_list_meetings / brain_get_meeting', () => {
  it('lists meetings with optional filters', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_meetings')!.handler({ status: 'draft', limit: 5 });
    expect(parseJson(res)).toEqual([{ id: 1 }]);
  });

  it('returns not-found when meeting missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_meeting')!.handler({ meetingId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns the meeting on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_meeting')!.handler({ meetingId: 2 });
    expect((parseJson(res) as { id: number }).id).toBe(2);
  });
});

describe('brain_create_meeting', () => {
  it('rejects when both companyId and dealId are set', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_meeting')!.handler({
      transcript: 'x', companyId: 1, dealId: 2,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/company OR a deal/i);
  });

  it('creates a meeting via the paste adapter', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_meeting')!.handler({ transcript: 'hello world' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(100);
  });

  it('returns err when profile.enabled is false', async () => {
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
    const tools = registerAll();
    const res = await tools.get('brain_create_meeting')!.handler({ transcript: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });

  it('handles non-Error throws with a generic message', async () => {
    const meetings = await import('@/lib/brain/meetings');
    (meetings.createMeetingFromAdapter as ReturnType<typeof vi.fn>).mockRejectedValueOnce('weird-string');
    const tools = registerAll();
    const res = await tools.get('brain_create_meeting')!.handler({ transcript: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Failed to create meeting/);
  });
});

describe('brain_link_meeting', () => {
  it('rejects company+deal together', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_link_meeting')!.handler({ meetingId: 1, companyId: 2, dealId: 3 });
    expect(res.isError).toBe(true);
  });

  it('returns not-found when meeting missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_link_meeting')!.handler({ meetingId: 999, companyId: 5 });
    expect(res.isError).toBe(true);
  });

  it('updates link on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_link_meeting')!.handler({ meetingId: 2, companyId: 5 });
    expect((parseJson(res) as { companyId: number }).companyId).toBe(5);
  });
});

// ── tasks ───────────────────────────────────────────────────────────────────

describe('brain_list_tasks / brain_get_task', () => {
  it('lists tasks', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_tasks')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1 }]);
  });

  it('returns not-found for missing task', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_task')!.handler({ taskId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns the task on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_task')!.handler({ taskId: 5 });
    expect((parseJson(res) as { id: number }).id).toBe(5);
  });
});

describe('brain_create_task', () => {
  it('creates a task', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_task')!.handler({ title: 'Do thing' });
    expect((parseJson(res) as { id: number }).id).toBe(200);
  });

  it('returns OwnershipError as JSON error payload', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_task')!.handler({ title: 'X', ownerId: 9999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/Forbidden/);
  });

  it('propagates non-Ownership errors', async () => {
    const security = await import('@/lib/security/assert-owned');
    (security.assertUserVisibleToClient as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    const tools = registerAll();
    await expect(tools.get('brain_create_task')!.handler({ title: 'X', ownerId: 5 })).rejects.toThrow('db down');
  });

  it('parses ISO due date', async () => {
    const tasks = await import('@/lib/brain/tasks');
    (tasks.createTask as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_create_task')!.handler({ title: 'X', dueDate: '2026-12-25T00:00:00Z' });
    const callArgs = (tasks.createTask as ReturnType<typeof vi.fn>).mock.calls[0][0] as { dueDate: Date | null };
    expect(callArgs.dueDate).toBeInstanceOf(Date);
  });
});

describe('brain_propose_task', () => {
  it('inserts a review item with manual source when no meeting', async () => {
    dbState.insertReturning = [{ id: 700, sourceType: 'manual', sourceId: 0, proposedType: 'task', status: 'pending' }];
    const tools = registerAll();
    const res = await tools.get('brain_propose_task')!.handler({ title: 'Suggest me' });
    const out = parseJson(res) as { id: number; sourceType: string };
    expect(out.id).toBe(700);
    expect(out.sourceType).toBe('manual');
  });

  it('attaches the source meeting when provided', async () => {
    dbState.insertReturning = [{ id: 701, sourceType: 'meeting', sourceId: 88 }];
    const tools = registerAll();
    const res = await tools.get('brain_propose_task')!.handler({ title: 'X', sourceMeetingId: 88 });
    const out = parseJson(res) as { sourceType: string; sourceId: number };
    expect(out.sourceType).toBe('meeting');
    expect(out.sourceId).toBe(88);
  });
});

describe('brain_update_task', () => {
  it('returns not-found for missing task', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_task')!.handler({ taskId: 999 });
    expect(res.isError).toBe(true);
  });

  it('parses ISO dueDate string', async () => {
    const tasks = await import('@/lib/brain/tasks');
    (tasks.updateTask as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_update_task')!.handler({ taskId: 3, dueDate: '2026-08-08' });
    const patch = (tasks.updateTask as ReturnType<typeof vi.fn>).mock.calls[0][2] as { dueDate: Date | null | undefined };
    expect(patch.dueDate).toBeInstanceOf(Date);
  });

  it('passes null when dueDate=null to clear', async () => {
    const tasks = await import('@/lib/brain/tasks');
    (tasks.updateTask as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_update_task')!.handler({ taskId: 3, dueDate: null });
    const patch = (tasks.updateTask as ReturnType<typeof vi.fn>).mock.calls[0][2] as { dueDate: Date | null | undefined };
    expect(patch.dueDate).toBeNull();
  });

  it('returns updated task on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_task')!.handler({ taskId: 5, title: 'New' });
    expect((parseJson(res) as { id: number }).id).toBe(5);
  });
});

// ── relationships (write) ──────────────────────────────────────────────────

describe('brain_create_relationship', () => {
  it('requires exactly one of companyId or dealId — rejects neither', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_relationship')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/exactly one/i);
  });

  it('rejects both companyId and dealId', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_relationship')!.handler({ companyId: 1, dealId: 2 });
    expect(res.isError).toBe(true);
  });

  it('creates with companyId', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_relationship')!.handler({ companyId: 1, nextReviewAt: '2026-12-01' });
    expect((parseJson(res) as { id: number }).id).toBe(300);
  });

  it('converts thrown errors to err()', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.createOverlay as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('overlay-conflict'));
    const tools = registerAll();
    const res = await tools.get('brain_create_relationship')!.handler({ companyId: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('overlay-conflict');
  });
});

// ── approve / reject review items ───────────────────────────────────────────

describe('brain_approve_review_item / brain_reject_review_item', () => {
  it('approves a pending item', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_approve_review_item')!.handler({ itemId: 7 });
    expect((parseJson(res) as { status: string }).status).toBe('approved');
  });

  it('returns err on approve failure', async () => {
    const review = await import('@/lib/brain/review');
    (review.approveReviewItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'));
    const tools = registerAll();
    const res = await tools.get('brain_approve_review_item')!.handler({ itemId: 7 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('bad');
  });

  it('rejects a pending item', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_reject_review_item')!.handler({ itemId: 7, reason: 'not relevant' });
    expect((parseJson(res) as { status: string }).status).toBe('rejected');
  });

  it('returns not-found when reject target missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_reject_review_item')!.handler({ itemId: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_update_relationship', () => {
  it('handles ISO nextReviewAt', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.updateOverlay as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_update_relationship')!.handler({ overlayId: 5, nextReviewAt: '2026-09-09' });
    const patch = (rel.updateOverlay as ReturnType<typeof vi.fn>).mock.calls[0][3] as { nextReviewAt: Date | null | undefined };
    expect(patch.nextReviewAt).toBeInstanceOf(Date);
  });

  it('passes null when nextReviewAt=null', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.updateOverlay as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_update_relationship')!.handler({ overlayId: 5, nextReviewAt: null });
    const patch = (rel.updateOverlay as ReturnType<typeof vi.fn>).mock.calls[0][3] as { nextReviewAt: Date | null | undefined };
    expect(patch.nextReviewAt).toBeNull();
  });

  it('returns err on throw', async () => {
    const rel = await import('@/lib/brain/relationships');
    (rel.updateOverlay as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const tools = registerAll();
    const res = await tools.get('brain_update_relationship')!.handler({ overlayId: 5 });
    expect(res.isError).toBe(true);
  });
});

// ── notes ───────────────────────────────────────────────────────────────────

describe('brain_list_notes', () => {
  it('trims body and returns pagination envelope', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_notes')!.handler({ limit: 10, offset: 0 });
    const out = parseJson(res) as { items: { bodyPreview: string; bodyLength: number }[]; total: number; limit: number; offset: number };
    expect(out.total).toBe(42);
    expect(out.limit).toBe(10);
    expect(out.offset).toBe(0);
    expect(out.items[0].bodyPreview.length).toBeLessThanOrEqual(400);
    expect(out.items[0].bodyLength).toBeGreaterThan(out.items[0].bodyPreview.length);
  });

  it('applies sensible defaults for limit/offset', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_notes')!.handler({});
    const out = parseJson(res) as { limit: number; offset: number };
    expect(out.limit).toBe(50);
    expect(out.offset).toBe(0);
  });
});

describe('brain_get_note', () => {
  it('returns the note when found', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_note')!.handler({ noteId: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });

  it('returns not-found error when missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_create_note', () => {
  it('defaults source to manual when no sourceUrl', async () => {
    const notes = await import('@/lib/brain/notes');
    (notes.createNote as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_create_note')!.handler({ title: 'T' });
    const arg = (notes.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0] as { source: string };
    expect(arg.source).toBe('manual');
  });

  it('defaults source to crawl when sourceUrl provided', async () => {
    const notes = await import('@/lib/brain/notes');
    (notes.createNote as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_create_note')!.handler({ title: 'T', sourceUrl: 'https://example.com/x' });
    const arg = (notes.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0] as { source: string };
    expect(arg.source).toBe('crawl');
  });

  it('respects explicit source override', async () => {
    const notes = await import('@/lib/brain/notes');
    (notes.createNote as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_create_note')!.handler({ title: 'T', source: 'document_import' });
    const arg = (notes.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0] as { source: string };
    expect(arg.source).toBe('document_import');
  });
});

describe('brain_upsert_note_by_url', () => {
  it('updates existing note when URL matches', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_upsert_note_by_url')!.handler({
      sourceUrl: 'https://exists.example.com/', title: 'X', body: 'B',
    });
    const out = parseJson(res) as { created: boolean };
    expect(out.created).toBe(false);
  });

  it('creates new note when URL is novel', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_upsert_note_by_url')!.handler({
      sourceUrl: 'https://new.example.com/', title: 'X', body: 'B',
    });
    const out = parseJson(res) as { created: boolean };
    expect(out.created).toBe(true);
  });
});

describe('brain_update_note', () => {
  it('returns not-found when note missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_note')!.handler({ noteId: 999, title: 'T' });
    expect(res.isError).toBe(true);
  });

  it('updates the note on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_note')!.handler({ noteId: 4, title: 'New' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(4);
  });
});

describe('brain_delete_note', () => {
  it('returns not-found if the note does not exist', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });

  it('soft-deletes a fresh note by default', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 1 });
    const out = parseJson(res) as { id: number; deleted: 'soft' | 'hard' };
    expect(out.deleted).toBe('soft');
  });

  it('hard-deletes an already-trashed note', async () => {
    // getNote(555) returns deletedAt != null
    const tools = registerAll();
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 555 });
    const out = parseJson(res) as { deleted: string };
    expect(out.deleted).toBe('hard');
  });

  it('hard-deletes immediately with force=true', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_delete_note')!.handler({ noteId: 1, force: true });
    const out = parseJson(res) as { deleted: string };
    expect(out.deleted).toBe('hard');
  });
});

describe('brain_restore_note', () => {
  it('returns not-found when missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_restore_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });

  it('restores and returns a slim echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_restore_note')!.handler({ noteId: 4 });
    const out = parseJson(res) as { id: number; bodyLength: number };
    expect(out.id).toBe(4);
    expect(typeof out.bodyLength).toBe('number');
  });
});

describe('brain_bulk_update_notes', () => {
  it('returns updated/skipped counts', async () => {
    const tools = registerAll();
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
    const tools = registerAll();
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
    const tools = registerAll();
    const res = await tools.get('brain_list_note_history')!.handler({ noteId: 1, includeDiff: true });
    const out = parseJson(res) as { items: { metadata: unknown }[] };
    expect(out.items[0].metadata).toEqual({ diff: 'big' });
  });

  it('returns not-found if note missing', async () => {
    // getNote(999) returns null per the notes mock
    const tools = registerAll();
    const res = await tools.get('brain_list_note_history')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });
});

// ── saved searches ─────────────────────────────────────────────────────────

describe('brain_list_saved_searches', () => {
  it('returns shared-only when scope=shared', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_saved_searches')!.handler({ scope: 'shared' });
    const out = parseJson(res) as { items: { scope: string }[] };
    expect(out.items.every((r) => r.scope === 'shared')).toBe(true);
  });

  it('filters to mine when scope=mine', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_saved_searches')!.handler({ scope: 'mine' });
    const out = parseJson(res) as { items: { userId: number | null }[] };
    expect(out.items.every((r) => r.userId === 11)).toBe(true);
  });

  it('omits filters by default and includes them when includeFilters=true', async () => {
    const tools = registerAll();
    const without = parseJson(await tools.get('brain_list_saved_searches')!.handler({})) as { items: Record<string, unknown>[] };
    expect('filters' in without.items[0]).toBe(false);
    const withFilters = parseJson(await tools.get('brain_list_saved_searches')!.handler({ includeFilters: true })) as { items: Record<string, unknown>[] };
    expect('filters' in withFilters.items[0]).toBe(true);
  });
});

describe('brain_get_saved_search', () => {
  it('returns the saved search', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_saved_search')!.handler({ id: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });

  it('errors when missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_saved_search')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_create_saved_search', () => {
  it('creates a personal saved search by default', async () => {
    const ss = await import('@/lib/brain/saved-searches');
    (ss.createSavedSearch as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
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
    const tools = registerAll();
    const res = await tools.get('brain_create_saved_search')!.handler({ name: 's', filters: {}, scope: 'shared' });
    const arg = (ss.createSavedSearch as ReturnType<typeof vi.fn>).mock.calls[0][0] as { userId: number | null };
    expect(arg.userId).toBeNull();
    expect((parseJson(res) as { scope: string }).scope).toBe('shared');
  });
});

describe('brain_update_saved_search', () => {
  it('returns not-found when missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_saved_search')!.handler({ id: 999, name: 'new' });
    expect(res.isError).toBe(true);
  });

  it('applies the patch with mapped scope', async () => {
    const ss = await import('@/lib/brain/saved-searches');
    (ss.updateSavedSearch as ReturnType<typeof vi.fn>).mockClear();
    (ss.updateSavedSearch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 2, name: 'new', icon: null, userId: null, sortOrder: 0, updatedAt: 'now',
    });
    const tools = registerAll();
    await tools.get('brain_update_saved_search')!.handler({ id: 2, name: 'new', scope: 'shared', icon: 'i', sortOrder: 4 });
    const patch = (ss.updateSavedSearch as ReturnType<typeof vi.fn>).mock.calls[0][2] as { userId: number | null; name: string };
    expect(patch.userId).toBeNull();
    expect(patch.name).toBe('new');
  });
});

describe('brain_delete_saved_search', () => {
  it('returns not-found on missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_delete_saved_search')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns deleted echo on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_delete_saved_search')!.handler({ id: 2 });
    const out = parseJson(res) as { id: number; deleted: boolean };
    expect(out).toEqual({ id: 2, deleted: true });
  });
});

// ── templates ───────────────────────────────────────────────────────────────

describe('brain_list_note_templates / brain_get_note_template', () => {
  it('lists templates with bodyLength but no body by default', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_note_templates')!.handler({});
    const out = parseJson(res) as { items: { bodyLength: number; body?: string }[] };
    expect(out.items[0].bodyLength).toBe('BODY'.length);
    expect('body' in out.items[0]).toBe(false);
  });

  it('includes body when includeBody=true', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_list_note_templates')!.handler({ includeBody: true });
    const out = parseJson(res) as { items: { body: string }[] };
    expect(out.items[0].body).toBe('BODY');
  });

  it('returns not-found on missing template', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_note_template')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns the template on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_get_note_template')!.handler({ id: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });
});

describe('brain_create_note_template', () => {
  it('creates a template and returns a slim echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_note_template')!.handler({ name: 'T', body: 'B' });
    const out = parseJson(res) as { id: number; bodyLength: number };
    expect(out.id).toBe(600);
    expect(out.bodyLength).toBe(1);
  });

  it('emits a friendly duplicate-name error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_note_template')!.handler({ name: 'dupe', body: 'B' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/already exists/);
  });

  it('emits a generic error for other failures', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_note_template')!.handler({ name: 'boom', body: 'B' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });
});

describe('brain_update_note_template', () => {
  it('returns not-found when missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_note_template')!.handler({ id: 999, name: 'X' });
    expect(res.isError).toBe(true);
  });

  it('handles duplicate-name error from updateTemplate', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_note_template')!.handler({ id: 1, name: 'dupe' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/already exists/);
  });

  it('handles other thrown errors with generic message', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_note_template')!.handler({ id: 1, name: 'boom' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });

  it('returns slim echo on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_update_note_template')!.handler({ id: 1, body: 'longer' });
    const out = parseJson(res) as { id: number; bodyLength: number };
    expect(out.id).toBe(1);
    expect(out.bodyLength).toBe('longer'.length);
  });
});

describe('brain_delete_note_template', () => {
  it('returns not-found on missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_delete_note_template')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns deleted echo on hit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_delete_note_template')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_create_note_from_template', () => {
  it('returns not-found when template missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_create_note_from_template')!.handler({ templateId: 999 });
    expect(res.isError).toBe(true);
  });

  it('materializes a note with applied body + dedupes tags', async () => {
    dbState.selectQueue = [
      [{ name: 'Alice', email: 'a@example.com' }], // users lookup
    ];
    const tools = registerAll();
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
    const tools = registerAll();
    await tools.get('brain_create_note_from_template')!.handler({ templateId: 1 });
    const args = (template.applyTemplate as ReturnType<typeof vi.fn>).mock.calls[0][1] as { userName: string | null };
    expect(args.userName).toBe('fallback@example.com');
  });

  it('passes null userName when no user row found', async () => {
    dbState.selectQueue = [[]];
    const template = await import('@/lib/brain/template');
    (template.applyTemplate as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('brain_create_note_from_template')!.handler({ templateId: 1 });
    const args = (template.applyTemplate as ReturnType<typeof vi.fn>).mock.calls[0][1] as { userName: string | null };
    expect(args.userName).toBeNull();
  });
});

// ── CRM read tools (use dynamic schema imports + db.select chains) ──────────

describe('brain_list_companies / brain_get_company', () => {
  it('returns the company list', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'Acme' }]];
    const tools = registerAll();
    const res = await tools.get('brain_list_companies')!.handler({ search: '  Ac  ', industry: 'tech', limit: 5 });
    expect(parseJson(res)).toEqual([{ id: 1, name: 'Acme' }]);
  });

  it('respects default and bound limits', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('brain_list_companies')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('returns not-found if company missing', async () => {
    dbState.selectQueue = [[]]; // company lookup empty
    const tools = registerAll();
    const res = await tools.get('brain_get_company')!.handler({ companyId: 999 });
    expect(res.isError).toBe(true);
  });

  it('joins contacts + deals when company present', async () => {
    dbState.selectQueue = [
      [{ id: 5, name: 'Acme', clientId: 1 }], // company
      [{ id: 11, firstName: 'A' }],            // contacts
      [{ id: 22, value: 100 }],                // deals
    ];
    const tools = registerAll();
    const res = await tools.get('brain_get_company')!.handler({ companyId: 5 });
    const out = parseJson(res) as { contacts: { id: number }[]; deals: { id: number }[] };
    expect(out.contacts[0].id).toBe(11);
    expect(out.deals[0].id).toBe(22);
  });
});

describe('brain_list_contacts / brain_get_contact', () => {
  it('lists contacts', async () => {
    dbState.selectQueue = [[{ id: 1, firstName: 'A' }]];
    const tools = registerAll();
    const res = await tools.get('brain_list_contacts')!.handler({ search: 'a', companyId: 1, status: 'active' });
    expect(parseJson(res)).toEqual([{ id: 1, firstName: 'A' }]);
  });

  it('returns not-found if contact missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('brain_get_contact')!.handler({ contactId: 999 });
    expect(res.isError).toBe(true);
  });

  it('joins company + deals when contact present and has companyId', async () => {
    dbState.selectQueue = [
      [{ id: 3, firstName: 'X', companyId: 7 }], // contact
      [{ id: 7, name: 'CompanyCo' }],            // company
      [{ id: 9, value: 50 }],                    // deals
    ];
    const tools = registerAll();
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
    const tools = registerAll();
    const res = await tools.get('brain_get_contact')!.handler({ contactId: 3 });
    const out = parseJson(res) as { company: unknown };
    expect(out.company).toBeNull();
  });
});

describe('brain_list_deals / brain_get_deal', () => {
  it('lists deals with filters', async () => {
    dbState.selectQueue = [[{ id: 1, value: 100 }]];
    const tools = registerAll();
    const res = await tools.get('brain_list_deals')!.handler({ status: 'open', priority: 'high', stageId: 2, companyId: 5, limit: 7 });
    expect(parseJson(res)).toEqual([{ id: 1, value: 100 }]);
  });

  it('returns not-found if deal missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
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
    const tools = registerAll();
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
    const tools = registerAll();
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
    const tools = registerAll();
    const res = await tools.get('brain_list_posts')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('returns post list when websites exist', async () => {
    dbState.selectQueue = [
      [{ id: 1 }, { id: 2 }],         // websites for tenant
      [{ id: 50, title: 'Post 1' }],  // posts query
    ];
    const tools = registerAll();
    const res = await tools.get('brain_list_posts')!.handler({ websiteId: 1, published: true, postType: 'page', limit: 10 });
    expect(parseJson(res)).toEqual([{ id: 50, title: 'Post 1' }]);
  });

  it('returns not-found when post does not exist', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('brain_get_post')!.handler({ postId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns not-found when post has no website (orphan)', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: null }]];
    const tools = registerAll();
    const res = await tools.get('brain_get_post')!.handler({ postId: 1 });
    expect(res.isError).toBe(true);
  });

  it('returns not-found when website belongs to a different tenant', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 22 }],         // post
      [{ clientId: 999 }],                // wrong tenant
    ];
    const tools = registerAll();
    const res = await tools.get('brain_get_post')!.handler({ postId: 1 });
    expect(res.isError).toBe(true);
  });

  it('returns the post when ownership checks pass', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 22, title: 'Post' }],
      [{ clientId: 1 }],
    ];
    const tools = registerAll();
    const res = await tools.get('brain_get_post')!.handler({ postId: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });
});

// ── tool metadata sanity ────────────────────────────────────────────────────

describe('tool metadata', () => {
  it('every tool has a non-empty title + description', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} should have a title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} should have a non-trivial description`).toBeGreaterThan(5);
    }
  });

  it('every tool registers an inputSchema (even if empty)', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});
