// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/pitch-decks.ts.
 *
 * The module exports `registerPitchDecksTools(server, ctx)` which registers
 * 8 MCP tools (decks_list, decks_get, decks_create, decks_update,
 * decks_replace_slides, decks_add_slide, decks_delete, decks_upload_html).
 *
 * Strategy mirrors brain-mcp-sdk-adapter.test.ts:
 *   - mock @/lib/db with a chainable proxy that resolves to a configurable
 *     `selectQueue` / `insertReturning`
 *   - mock @/lib/db/schema with column-shaped stubs so projections can be
 *     iterated and drizzle helpers can be passed opaque references
 *   - mock @/lib/mcp/pending-changes' stageOrApply to forward straight to
 *     `apply()` (no approval staging) so we exercise the real handler body
 *   - mock @/lib/s3/upload + realtime publisher + portal-auth gates
 *   - capture `(name, config, handler)` triples in a fake McpServer and
 *     invoke each handler with sample input.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── db mock state ──────────────────────────────────────────────────────────

type QueryResult = unknown[];

interface DbState {
  selectQueue: QueryResult[];
  selectDefault: QueryResult;
  insertReturning: QueryResult;
  insertCalls: Array<{ table: unknown; values: unknown }>;
  updateCalls: Array<{ table: unknown; patch: unknown }>;
  deleteCalls: Array<{ table: unknown }>;
}

const dbState: DbState = {
  selectQueue: [],
  selectDefault: [],
  insertReturning: [],
  insertCalls: [],
  updateCalls: [],
  deleteCalls: [],
};

function makeAwaitableChain(rows: QueryResult) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
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
    select: vi.fn(() => {
      const rows = dbState.selectQueue.length > 0
        ? dbState.selectQueue.shift()!
        : dbState.selectDefault;
      return makeAwaitableChain(rows);
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        dbState.insertCalls.push({ table, values });
        return {
          returning: vi.fn(async () => dbState.insertReturning),
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve(undefined).then(onFulfilled),
        };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((patch: unknown) => {
        dbState.updateCalls.push({ table, patch });
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => dbState.insertReturning),
          })),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => {
      dbState.deleteCalls.push({ table });
      return {
        where: vi.fn(async () => undefined),
      };
    }),
  },
}));

// Schema objects just need column-shaped placeholders.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  const table = (cols: string[]) => {
    const t: Record<string, unknown> = {};
    for (const c of cols) t[c] = col(c);
    return t;
  };
  return {
    pitchDecks: table([
      'id', 'clientId', 'title', 'slug', 'description', 'sourceUrl',
      'brandingProfileId', 'theme', 'formatVersion', 'slides', 'status',
      'createdBy', 'createdAt', 'updatedAt',
    ]),
    brandingProfiles: table([
      'id', 'clientId', 'isDefault', 'primaryColor', 'accentColor',
      'backgroundColor', 'textColor', 'headingFont', 'bodyFont', 'logoUrl',
    ]),
    media: table([
      'id', 'filename', 'storedFilename', 'mimeType', 'fileSize', 'url',
      'uploadedBy', 'clientId',
    ]),
    posts: {}, kanbanCards: {}, kanbanColumns: {}, kanbanLabels: {},
    kanbanCardLabels: {}, kanbanCardChecklistItems: {}, kanbanCardAssignees: {},
    kanbanCardWatchers: {}, kanbanCardDependencies: {}, supportTickets: {},
    ticketMessages: {}, crmContacts: {}, crmCompanies: {}, crmDeals: {},
    crmPipelines: {}, crmPipelineStages: {}, projects: {}, clientWebsites: {},
    emailLists: {}, emailCampaigns: {}, emailSubscribers: {},
    emailCampaignSends: {}, surveys: {}, surveyResponses: {}, bookingPages: {},
    bookings: {}, sprints: {}, crmActivities: {}, categories: {}, tags: {},
    postCategories: {}, postTags: {}, automationRules: {}, clientMembers: {},
    users: {}, crmProposals: {}, crmContracts: {}, crmContractSigners: {},
    invoices: {}, invoiceItems: {}, serviceRequests: {},
    suggestedProjectRequests: {}, suggestedProjects: {}, services: {},
    aiConversations: {}, aiMessages: {}, kanbanCardComments: {},
    kanbanCardTimeLogs: {}, kanbanCardFiles: {}, kanbanCardArtifacts: {},
    crmDealArtifacts: {}, siteNavigation: {}, postRevisions: {},
    blockTemplates: {}, blockTemplateUsages: {}, emailTemplates: {},
    emailSegments: {}, giftCertificates: {}, crmCustomFields: {},
    crmCustomFieldValues: {}, crmSavedViews: {}, crmScoringRules: {},
    websiteDomains: {}, websiteEnvironments: {}, websiteEnvVars: {},
    clients: {}, aiCreditBalances: {}, aiCreditLedger: {}, hostedSites: {},
    googleWorkspaceUserConnections: {},
    mcpApprovalLinks: table(['id', 'token', 'entityType', 'entityId', 'summary', 'status', 'clientId', 'createdBy', 'expiresAt']),
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

// stageOrApply: by default we want the *non-pending* branch so the handler's
// real `apply()` body runs. We can flip a flag to test the pending branch too.
const stageOrApplyState = { forcePending: false };
vi.mock('@/lib/mcp/pending-changes', () => ({
  stageOrApply: vi.fn(async (opts: { apply: () => Promise<unknown>; summary: string }) => {
    if (stageOrApplyState.forcePending) {
      return { pending: true, pendingId: 12345, summary: opts.summary, status: 'pending' };
    }
    const data = await opts.apply();
    return { pending: false, data };
  }),
}));

// Other collaborators — pure stubs.
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (_buf: Buffer, _name: string, _type: string) => ({
    storedFilename: 'stored-abc.html',
    fileSize: 42,
    url: 'https://cdn.example.com/decks/stored-abc.html',
  })),
}));

vi.mock('@/lib/realtime/internal-publisher', () => ({
  publishSlidesUpdate: vi.fn(async () => ({ ok: true })),
  publishEntityFromDb: vi.fn(async () => ({ ok: true })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// Email / html / pm-activity / google / brain modules — pitch-decks doesn't
// hit most at runtime, but the import side-effect needs to resolve.
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: vi.fn(),
  resend: { emails: { send: vi.fn() } },
  buildCampaignHtml: vi.fn(),
  buildUnsubscribeUrl: vi.fn(),
  generateUnsubscribeToken: vi.fn(),
}));
vi.mock('@/lib/email/campaign-send', () => ({ executeCampaignSend: vi.fn() }));
vi.mock('@/lib/email/mcp-approval-email', () => ({ sendApprovalEmails: vi.fn() }));
vi.mock('@/lib/google/oauth', () => ({ revoke: vi.fn() }));
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: vi.fn(),
}));
vi.mock('@/lib/pm-activity', () => ({ logCardActivity: vi.fn() }));
vi.mock('@/lib/html-embed-clean', () => ({ cleanEmbedHtml: vi.fn((s: string) => s) }));
vi.mock('@/lib/html-asset-import', () => ({ importHtmlAssets: vi.fn() }));
vi.mock('@/lib/crm/notifications', () => ({ notifyApprovers: vi.fn() }));
vi.mock('@/lib/mcp/blocks-schema', () => ({ BLOCKS_SCHEMA_REFERENCE: {} }));

// bcryptjs is imported at top of pitch-decks.ts (carried over from monolith)
vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed') }));

// ── server stub ────────────────────────────────────────────────────────────

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

import { registerPitchDecksTools } from '@/lib/mcp/tools/pitch-decks';

function registerAll(scopes: string[] = ['*']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerPitchDecksTools(stub as any, ctxFor(scopes));
  return tools;
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

// ── tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  // Default to a row with id so createApprovalLink (which always runs via
  // mintLinkForResult after stageOrApply) can destructure `row.id` without
  // throwing. Individual tests that verify the inserted row shape can override.
  dbState.insertReturning = [{ id: 1 }];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.deleteCalls = [];
  stageOrApplyState.forcePending = false;
});

describe('registerPitchDecksTools — registration & scope gating', () => {
  it('registers all 13 deck tools when scopes=*', () => {
    const tools = registerAll(['*']);
    expect(tools.size).toBe(13);
    for (const name of [
      'decks_list', 'decks_get', 'decks_create', 'decks_update',
      'decks_fork', 'decks_replace_slides', 'decks_add_slide', 'decks_delete',
      'decks_upload_html', 'decks_upload_html_zip',
      'decks_publish_slide', 'decks_publish_all',
      'deck_analytics_get',
    ]) {
      expect(tools.has(name), `expected ${name}`).toBe(true);
    }
  });

  it('registers only read tools with decks:read', () => {
    const tools = registerAll(['decks:read']);
    expect(tools.has('decks_list')).toBe(true);
    expect(tools.has('decks_get')).toBe(true);
    expect(tools.has('decks_create')).toBe(false);
    expect(tools.has('decks_update')).toBe(false);
    expect(tools.has('decks_replace_slides')).toBe(false);
    expect(tools.has('decks_add_slide')).toBe(false);
    expect(tools.has('decks_delete')).toBe(false);
    expect(tools.has('decks_upload_html')).toBe(false);
  });

  it('registers only write tools with decks:write', () => {
    const tools = registerAll(['decks:write']);
    expect(tools.has('decks_list')).toBe(false);
    expect(tools.has('decks_get')).toBe(false);
    expect(tools.has('decks_create')).toBe(true);
    expect(tools.has('decks_update')).toBe(true);
    expect(tools.has('decks_replace_slides')).toBe(true);
    expect(tools.has('decks_add_slide')).toBe(true);
    expect(tools.has('decks_delete')).toBe(true);
    expect(tools.has('decks_upload_html')).toBe(true);
  });

  it('registers the resource-wildcard decks:*', () => {
    const tools = registerAll(['decks:*']);
    expect(tools.size).toBe(13);
  });

  it('registers nothing when ctx has no deck scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });
});

describe('tool metadata', () => {
  it('every tool has title + description + inputSchema', () => {
    const tools = registerAll(['*']);
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} desc`).toBeGreaterThan(10);
      expect(t.config.inputSchema, `${t.name} inputSchema`).toBeDefined();
    }
  });
});

// ── decks_list ─────────────────────────────────────────────────────────────

describe('decks_list', () => {
  it('returns rows from the db', async () => {
    dbState.selectDefault = [
      { id: 1, title: 'Pitch A', slug: 'pitch-a', status: 'draft' },
      { id: 2, title: 'Pitch B', slug: 'pitch-b', status: 'published' },
    ];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_list')!.handler({});
    expect(parseJson(res)).toHaveLength(2);
  });

  it('passes through status + limit filters without throwing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_list')!.handler({ status: 'published', limit: 5 });
    expect(parseJson(res)).toEqual([]);
  });

  it('handler runs cleanly with decks:read scope', async () => {
    // Registration AND requireScope() both gate on the same scopes — so the
    // meaningful coverage here is that the read-only scope is sufficient.
    const { stub, tools } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPitchDecksTools(stub as any, {
      userId: 11, keyId: 1, scopes: ['decks:read'], client: { id: 1 } as PortalMcpContext['client'],
    });
    dbState.selectDefault = [];
    const res = await tools.get('decks_list')!.handler({});
    expect(res.isError).toBeUndefined();
  });
});

// ── decks_get ──────────────────────────────────────────────────────────────

describe('decks_get', () => {
  it('returns the deck row when found', async () => {
    dbState.selectDefault = [{ id: 42, title: 'Found', slides: [] }];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_get')!.handler({ id: 42 });
    expect((parseJson(res) as { id: number }).id).toBe(42);
  });

  it('returns { error } when deck missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_get')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });
});

// ── decks_create ───────────────────────────────────────────────────────────

describe('decks_create', () => {
  it('creates a deck inheriting the default branding profile', async () => {
    dbState.selectQueue = [
      [{
        id: 7, clientId: 1, isDefault: true,
        primaryColor: '#brand', accentColor: '#a', backgroundColor: '#bg',
        textColor: '#text', headingFont: 'Hf', bodyFont: 'Bf', logoUrl: 'logo.png',
      }],
    ];
    dbState.insertReturning = [{ id: 100, title: 'My Deck' }];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_create')!.handler({ title: 'My Deck' });
    expect((parseJson(res) as { id: number }).id).toBe(100);
    // Branding profile auto-resolution should result in an insert with
    // brandingProfileId=7 + theme inherited from profile.
    const insert = dbState.insertCalls.find((c) => (c.values as Record<string, unknown>).title === 'My Deck');
    expect(insert).toBeTruthy();
    const v = insert!.values as Record<string, unknown>;
    expect(v.brandingProfileId).toBe(7);
    expect((v.theme as Record<string, unknown>).primaryColor).toBe('#brand');
  });

  it('falls back to hard-coded defaults when no profile and no theme arg', async () => {
    dbState.selectQueue = [[]]; // no default profile
    dbState.insertReturning = [{ id: 101, title: 'No Profile' }];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_create')!.handler({ title: 'No Profile' });
    expect((parseJson(res) as { id: number }).id).toBe(101);
    const v = dbState.insertCalls[0].values as Record<string, unknown>;
    // With neither profile nor theme args, `theme` is undefined.
    expect(v.theme).toBeUndefined();
    expect(v.brandingProfileId).toBeNull();
  });

  it('resolves an explicit brandingProfileId and rejects unknown ones', async () => {
    dbState.selectQueue = [[]]; // profile lookup misses
    const tools = registerAll(['*']);
    const res = await tools.get('decks_create')!.handler({ title: 'X', brandingProfileId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('uses explicit theme overrides over the profile theme', async () => {
    dbState.selectQueue = [
      [{
        id: 8, clientId: 1, isDefault: true, primaryColor: '#profile',
        accentColor: '#a', backgroundColor: '#bg', textColor: '#t',
        headingFont: 'H', bodyFont: 'B', logoUrl: 'l.png',
      }],
    ];
    dbState.insertReturning = [{ id: 200, title: 'T', theme: {} }];
    const tools = registerAll(['*']);
    await tools.get('decks_create')!.handler({
      title: 'T',
      theme: { primaryColor: '#override' },
    });
    const v = dbState.insertCalls[0].values as Record<string, unknown>;
    expect((v.theme as Record<string, unknown>).primaryColor).toBe('#override');
    // Other fields fall back to profile values
    expect((v.theme as Record<string, unknown>).accentColor).toBe('#a');
  });

  it('emits a pending envelope when stageOrApply forces pending', async () => {
    stageOrApplyState.forcePending = true;
    dbState.selectQueue = [[]]; // no profile
    const tools = registerAll(['*']);
    const res = await tools.get('decks_create')!.handler({ title: 'Pending Deck' });
    const out = parseJson(res) as { pending: boolean; pendingId: number; status: string };
    expect(out.pending).toBe(true);
    expect(out.pendingId).toBe(12345);
    expect(out.status).toBe('pending');
  });

  it('returns serviceDenied when pitch-decks subscription missing', async () => {
    const portalAuth = await import('@/lib/portal-auth');
    (portalAuth.hasServiceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const tools = registerAll(['*']);
    const res = await tools.get('decks_create')!.handler({ title: 'No sub' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/subscription/i);
  });
});

// ── decks_update ───────────────────────────────────────────────────────────

describe('decks_update', () => {
  it('returns not-found when deck missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_update')!.handler({ id: 999, title: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('merges theme patch onto existing theme', async () => {
    dbState.selectDefault = [{
      id: 1, title: 'Old', description: 'd', status: 'draft',
      theme: { primaryColor: '#old', accentColor: '#a' },
      slides: [],
    }];
    dbState.insertReturning = [{ id: 1, title: 'New', theme: {} }];
    const tools = registerAll(['*']);
    await tools.get('decks_update')!.handler({
      id: 1, title: 'New', theme: { primaryColor: '#new' },
    });
    const patch = dbState.updateCalls[0].patch as Record<string, unknown>;
    expect(patch.title).toBe('New');
    expect((patch.theme as Record<string, unknown>).primaryColor).toBe('#new');
    // existing accentColor should still be present
    expect((patch.theme as Record<string, unknown>).accentColor).toBe('#a');
  });

  it('normalizes empty description to null and trims slug', async () => {
    dbState.selectDefault = [{ id: 1, title: 'Old', description: 'd', status: 'draft', theme: {} }];
    dbState.insertReturning = [{ id: 1 }];
    const tools = registerAll(['*']);
    await tools.get('decks_update')!.handler({ id: 1, description: '   ', slug: '  my-slug ' });
    const patch = dbState.updateCalls[0].patch as Record<string, unknown>;
    expect(patch.description).toBeNull();
    expect(patch.slug).toBe('my-slug');
  });

  it('rolls into pending branch under stageOrApply', async () => {
    stageOrApplyState.forcePending = true;
    dbState.selectDefault = [{ id: 1, title: 'X', status: 'draft', theme: {} }];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_update')!.handler({ id: 1, status: 'published' });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });
});

// ── decks_replace_slides ───────────────────────────────────────────────────

describe('decks_replace_slides', () => {
  it('returns not-found when deck missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_replace_slides')!.handler({ id: 999, slides: [] });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('assigns block IDs and writes formatVersion 2', async () => {
    dbState.selectDefault = [{ id: 1, title: 'D', slides: [], formatVersion: 2 }];
    dbState.insertReturning = [{ id: 1, title: 'D' }];
    const tools = registerAll(['*']);
    await tools.get('decks_replace_slides')!.handler({
      id: 1,
      slides: [
        { id: 'slide-a', label: 'Cover', blocks: [{ type: 'text', content: 'hi' }] },
        { id: 'slide-b', label: 'Body', blocks: [{ type: 'heading', level: 1, content: 'T' }] },
      ],
    });
    const patch = dbState.updateCalls[0].patch as Record<string, unknown>;
    expect(patch.formatVersion).toBe(2);
    const slides = patch.slides as Array<{ blocks: Array<{ id: string }> }>;
    expect(slides).toHaveLength(2);
    // assignBlockIds should backfill ids onto every block
    for (const s of slides) {
      for (const b of s.blocks) expect(typeof b.id).toBe('string');
    }
  });

  it('supports empty slides array (tombstones live slides for deferred publish)', async () => {
    // When called with slides: [] the implementation does NOT immediately clear
    // the live array. Instead live slides that are absent from the incoming list
    // receive a `draft.pendingDelete: true` tombstone — they stay visible to the
    // renderer until decks_publish_all is called. The test asserts that shape.
    dbState.selectDefault = [{ id: 1, title: 'D', slides: [{ id: 's' }], formatVersion: 2 }];
    dbState.insertReturning = [{ id: 1 }];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_replace_slides')!.handler({ id: 1, slides: [] });
    expect(res.isError).toBeUndefined();
    const patch = dbState.updateCalls[0].patch as Record<string, unknown>;
    const slides = patch.slides as Array<{ id: string; draft: { pendingDelete: boolean } }>;
    expect(slides).toHaveLength(1);
    expect(slides[0].id).toBe('s');
    expect(slides[0].draft.pendingDelete).toBe(true);
  });
});

// ── decks_add_slide ────────────────────────────────────────────────────────

describe('decks_add_slide', () => {
  it('returns not-found when deck missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_add_slide')!.handler({
      deckId: 999, label: 'X', blocks: [],
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('appends a slide preserving the existing slides array', async () => {
    dbState.selectDefault = [{
      id: 1, title: 'D',
      slides: [{ id: 'existing', label: 'Existing', blocks: [] }],
    }];
    dbState.insertReturning = [{ id: 1, title: 'D' }];
    const tools = registerAll(['*']);
    await tools.get('decks_add_slide')!.handler({
      deckId: 1, label: 'NewSlide', blocks: [{ type: 'text', content: 'x' }],
    });
    const patch = dbState.updateCalls[0].patch as Record<string, unknown>;
    const slides = patch.slides as Array<{ id: string; label: string }>;
    expect(slides).toHaveLength(2);
    expect(slides[0].label).toBe('Existing');
    expect(slides[1].label).toBe('NewSlide');
    // Auto-generated id when omitted
    expect(slides[1].id).toMatch(/^slide-/);
  });

  it('respects an explicitly-supplied slide id and stores notes in draft', async () => {
    // notes go into draft.notes (the draft/live split); they are not a top-level
    // property on the slide object.
    dbState.selectDefault = [{ id: 1, title: 'D', slides: [] }];
    dbState.insertReturning = [{ id: 1 }];
    const tools = registerAll(['*']);
    await tools.get('decks_add_slide')!.handler({
      deckId: 1, label: 'X', blocks: [], id: 'my-slide-id', notes: 'spkn',
    });
    const slides = (dbState.updateCalls[0].patch as { slides: Array<{ id: string; draft: { notes: string } }> }).slides;
    expect(slides[0].id).toBe('my-slide-id');
    expect(slides[0].draft.notes).toBe('spkn');
  });

  it('starts from empty when existing.slides is not an array', async () => {
    dbState.selectDefault = [{ id: 1, title: 'D', slides: null }];
    dbState.insertReturning = [{ id: 1 }];
    const tools = registerAll(['*']);
    await tools.get('decks_add_slide')!.handler({ deckId: 1, label: 'X', blocks: [] });
    const slides = (dbState.updateCalls[0].patch as { slides: unknown[] }).slides;
    expect(slides).toHaveLength(1);
  });
});

// ── decks_delete ───────────────────────────────────────────────────────────

describe('decks_delete', () => {
  it('returns not-found when deck missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_delete')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('deletes a present deck and echoes success', async () => {
    dbState.selectDefault = [{ id: 5, title: 'Doomed', status: 'draft', slides: [] }];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_delete')!.handler({ id: 5 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out.success).toBe(true);
    expect(out.id).toBe(5);
    expect(dbState.deleteCalls.length).toBe(1);
  });

  it('rolls into pending under stageOrApply', async () => {
    stageOrApplyState.forcePending = true;
    dbState.selectDefault = [{ id: 5, title: 'Doomed', status: 'draft', slides: [] }];
    const tools = registerAll(['*']);
    const res = await tools.get('decks_delete')!.handler({ id: 5 });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });
});

// ── decks_upload_html ──────────────────────────────────────────────────────

describe('decks_upload_html', () => {
  function toB64(s: string): string {
    return Buffer.from(s, 'utf-8').toString('base64');
  }

  it('rejects when decoded buffer is empty (uses padding-only base64)', async () => {
    // We're calling the handler directly so the zod min(1) on
    // contentBase64 is bypassed; pass a base64 string that decodes to zero
    // bytes to hit the byteLength === 0 guard.
    const tools = registerAll(['*']);
    const res = await tools.get('decks_upload_html')!.handler({
      filename: 'foo.html', contentBase64: '====',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/empty/i);
  });

  it('rejects when decoded size exceeds 1 MB', async () => {
    const big = 'A'.repeat(1_500_000);
    const tools = registerAll(['*']);
    const res = await tools.get('decks_upload_html')!.handler({
      filename: 'big.html', contentBase64: toB64(big),
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/exceeds/i);
  });

  it('uploads HTML, inserts media + deck, returns deck w/ url', async () => {
    dbState.insertReturning = [{ id: 999, title: 'mypage', slug: 'mypage-abc' }];
    const tools = registerAll(['*']);
    const html = '<html><body>hello</body></html>';
    const res = await tools.get('decks_upload_html')!.handler({
      filename: 'mypage.html', contentBase64: toB64(html),
    });
    const out = parseJson(res) as { id: number; url: string };
    expect(out.id).toBe(999);
    expect(out.url).toBe('https://cdn.example.com/decks/stored-abc.html');
    // Insert ordering: media then pitch_decks
    expect(dbState.insertCalls.length).toBe(2);
    // pitch deck insert carries slides with one html-embed block
    const deckValues = dbState.insertCalls[1].values as Record<string, unknown>;
    const slides = deckValues.slides as Array<{ blocks: Array<Record<string, unknown>> }>;
    expect(slides).toHaveLength(1);
    expect(slides[0].blocks[0].type).toBe('html-embed');
    // The theme has showSlideNumber: false to suppress slide-counter chrome
    expect((deckValues.theme as Record<string, unknown>).showSlideNumber).toBe(false);
  });

  it('uses an override title when provided', async () => {
    dbState.insertReturning = [{ id: 1000, title: 'My Title', slug: 'mypage-abc' }];
    const tools = registerAll(['*']);
    await tools.get('decks_upload_html')!.handler({
      filename: 'mypage.html', contentBase64: toB64('<p>x</p>'), title: 'My Title',
    });
    const deckValues = dbState.insertCalls[1].values as Record<string, unknown>;
    expect(deckValues.title).toBe('My Title');
  });

  it('returns serviceDenied when pitch-decks subscription missing', async () => {
    const portalAuth = await import('@/lib/portal-auth');
    (portalAuth.hasServiceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const tools = registerAll(['*']);
    const res = await tools.get('decks_upload_html')!.handler({
      filename: 'foo.html', contentBase64: toB64('<p>x</p>'),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/subscription/i);
  });
});
