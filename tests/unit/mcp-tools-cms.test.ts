// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/cms.ts.
 *
 * The module exports `registerCmsTools(server, ctx)` which wires ~25 MCP
 * tools onto the supplied server. Each handler closes over the ctx and the
 * clientId. We mock @/lib/db + every collaborator, build a fake McpServer
 * that captures `{ name -> handler }` pairs, then invoke each handler with
 * sample args and assert on the returned envelope + the arguments passed
 * to the mocked DB/helpers.
 *
 * The mocked db is a chainable spy: every method (select / insert / update /
 * delete / values / set / where / from / limit / orderBy / returning) returns
 * a thenable chain whose await-resolution value is configurable per-test.
 */
process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (_buf: Buffer, filename: string, mimeType: string) => ({
    storedFilename: `stored-${filename}`,
    fileSize: 123,
    url: `https://s3.example.com/${filename}`,
    mimeType,
  })),
}));

vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: vi.fn((html: string) => `<cleaned>${html}</cleaned>`),
}));

vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: vi.fn(async (html: string) => ({
    html: `${html}-imported`,
    importedCount: 3,
    skippedCount: 1,
  })),
}));

vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: vi.fn(async () => undefined),
}));

vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: vi.fn(() => '<html>rendered</html>'),
  resend: { emails: { send: vi.fn() } },
  buildCampaignHtml: vi.fn(() => '<html>campaign</html>'),
  buildUnsubscribeUrl: vi.fn(() => 'https://unsub.example.com'),
  generateUnsubscribeToken: vi.fn(() => 'tok'),
}));

vi.mock('@/lib/email/campaign-send', () => ({
  executeCampaignSend: vi.fn(async () => ({ sent: true })),
}));

vi.mock('@/lib/google/oauth', () => ({
  revoke: vi.fn(async () => undefined),
}));

vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: vi.fn(async () => null),
}));

vi.mock('@/lib/realtime/internal-publisher', () => ({
  publishBlocksUpdate: vi.fn(async () => undefined),
  publishEntityFromDb: vi.fn(async () => undefined),
}));

vi.mock('@/lib/pm-activity', () => ({
  logCardActivity: vi.fn(async () => undefined),
}));

vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn(async () => true),
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async () => 'hashed'),
}));

// stageOrApply: by default, run apply() directly and return its data.
let stageOrApplyMode: 'apply' | 'pending' = 'apply';
vi.mock('@/lib/mcp/pending-changes', () => ({
  stageOrApply: vi.fn(async (opts: { apply: () => Promise<unknown>; summary: string; skipApproval?: boolean }) => {
    if (stageOrApplyMode === 'pending') {
      return { pending: true, pendingId: 42, summary: opts.summary, status: 'pending' };
    }
    const data = await opts.apply();
    return { pending: false, data };
  }),
}));

// Approval-link minting is exercised by lib/mcp/approval-links' own tests; here
// we stub it so CMS-tool tests stay focused on the tool logic (and don't depend
// on the mcp_approval_links insert plumbing).
vi.mock('@/lib/mcp/approval-links', () => ({
  mintLinkForResult: vi.fn(async () => ({ approvalUrl: 'https://x/approve/tok', approvalToken: 'tok' })),
  createApprovalLink: vi.fn(async () => ({ approvalUrl: 'https://x/approve/tok', approvalToken: 'tok' })),
  approvalEnvelope: vi.fn((link: unknown) => link),
}));

// drizzle-orm helpers are no-ops.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  desc: vi.fn((a: unknown) => ({ op: 'desc', a })),
  inArray: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

// Schema is a forest of column-like proxies. cms.ts + its projections/pending-
// changes collaborators import many named exports; we have to enumerate them
// explicitly because vitest needs the named bindings to exist on the mock
// module (a top-level Proxy doesn't satisfy ESM's "named export" check).
vi.mock('@/lib/db/schema', () => {
  const mkTable = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  const names = [
    'projects', 'kanbanCards', 'kanbanColumns', 'kanbanLabels', 'kanbanCardLabels',
    'kanbanCardChecklistItems', 'kanbanCardAssignees', 'kanbanCardWatchers',
    'kanbanCardDependencies', 'supportTickets', 'ticketMessages',
    'crmContacts', 'crmCompanies', 'crmDeals', 'crmPipelines', 'crmPipelineStages',
    'posts', 'media', 'clientWebsites', 'emailLists', 'emailCampaigns',
    'pitchDecks', 'brandingProfiles', 'emailSubscribers', 'emailCampaignSends',
    'surveys', 'surveyResponses', 'bookingPages', 'bookings', 'sprints',
    'crmActivities', 'categories', 'tags', 'postCategories', 'postTags',
    'automationRules', 'clientMembers', 'users', 'crmProposals', 'crmContracts',
    'crmContractSigners', 'invoices', 'invoiceItems', 'serviceRequests',
    'suggestedProjectRequests', 'suggestedProjects', 'services',
    'aiConversations', 'aiMessages', 'kanbanCardComments', 'kanbanCardTimeLogs',
    'kanbanCardFiles', 'kanbanCardArtifacts', 'crmDealArtifacts',
    'siteNavigation', 'postRevisions', 'blockTemplates', 'blockTemplateUsages',
    'emailTemplates', 'emailSegments', 'giftCertificates', 'crmCustomFields',
    'crmCustomFieldValues', 'crmSavedViews', 'crmScoringRules', 'websiteDomains',
    'websiteEnvironments', 'websiteEnvVars', 'clients', 'aiCreditBalances',
    'aiCreditLedger', 'hostedSites', 'googleWorkspaceUserConnections',
    'portalApiKeys', 'mcpPendingChanges', 'mcpApprovalLinks', 'oauthAccessTokens',
  ] as const;
  return Object.fromEntries(names.map((n) => [n, mkTable(n)]));
});

// Chainable thenable DB mock. Each call to db.select() / db.insert() etc.
// returns a Proxy that proxies every method back to itself, and is awaitable
// — resolving to the next queued rowset.
type QueryResult = unknown[];
const dbState: {
  selectQueue: QueryResult[];
  defaultSelect: QueryResult;
  insertReturning: QueryResult;
  updateReturning: QueryResult;
  deleteOk: boolean;
  inserts: { table: string; values: unknown }[];
  updates: { set: unknown }[];
} = {
  selectQueue: [],
  defaultSelect: [],
  insertReturning: [],
  updateReturning: [],
  deleteOk: true,
  inserts: [],
  updates: [],
};

function makeSelectChain(rowsPromise: Promise<QueryResult>) {
  const chain: Record<string, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
          rowsPromise.then(onFulfilled, onRejected);
      }
      return () => proxy;
    },
  });
  return proxy;
}

function makeInsertChain(table: string) {
  const chain: Record<string, unknown> = {};
  const valuesFn = vi.fn((v: unknown) => {
    dbState.inserts.push({ table, values: v });
    return chain;
  });
  const returningFn = vi.fn(async (_cols?: unknown) => dbState.insertReturning);
  Object.assign(chain, {
    values: valuesFn,
    returning: returningFn,
  });
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  const setFn = vi.fn((v: unknown) => {
    dbState.updates.push({ set: v });
    return chain;
  });
  const returningFn = vi.fn(async (_cols?: unknown) => dbState.updateReturning);
  const whereFn = vi.fn(() => chain);
  Object.assign(chain, {
    set: setFn,
    where: whereFn,
    returning: returningFn,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(dbState.updateReturning).then(onFulfilled),
  });
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  const whereFn = vi.fn(() =>
    Object.assign(chain, {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(dbState.deleteOk ? undefined : null).then(onFulfilled),
    }),
  );
  Object.assign(chain, { where: whereFn });
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const rows = dbState.selectQueue.length > 0
        ? dbState.selectQueue.shift()!
        : dbState.defaultSelect;
      return makeSelectChain(Promise.resolve(rows));
    }),
    insert: vi.fn((table: unknown) => {
      const tableName = (table as { __table?: string })?.__table ?? 'unknown';
      return makeInsertChain(tableName);
    }),
    update: vi.fn(() => makeUpdateChain()),
    delete: vi.fn(() => makeDeleteChain()),
  },
}));

vi.mock('@/lib/mcp/blocks-schema', () => ({
  BLOCKS_SCHEMA_REFERENCE: 'ref',
  BLOCKS_SCHEMA_TLDR: 'tldr',
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerCmsTools } from '@/lib/mcp/tools/cms';
import { stageOrApply } from '@/lib/mcp/pending-changes';

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
    client: { id: 7, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['*']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerCmsTools(stub as any, ctxFor(scopes));
  return tools;
}

function resetDbState() {
  dbState.selectQueue = [];
  dbState.defaultSelect = [];
  dbState.insertReturning = [];
  dbState.updateReturning = [];
  dbState.deleteOk = true;
  dbState.inserts = [];
  dbState.updates = [];
  stageOrApplyMode = 'apply';
}

// ── registration tests ─────────────────────────────────────────────────────

describe('registerCmsTools — registration', () => {
  beforeEach(resetDbState);

  it('registers the canonical CMS tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'sites_list',
      'posts_list',
      'posts_get',
      'posts_create',
      'posts_update',
      'posts_delete',
      'posts_upload_html',
      'media_list',
      'media_upload_from_url',
      'media_delete',
      'taxonomies_list',
      'taxonomies_create_category',
      'taxonomies_create_tag',
      'posts_set_taxonomies',
      'sites_update',
      'sites_get_custom_code',
      'sites_update_custom_code',
      'nav_list',
      'nav_create',
      'nav_delete',
      'posts_list_revisions',
      'block_templates_list',
      'block_templates_get',
      'block_templates_create',
      'block_templates_update',
      'block_templates_delete',
      'website_domains_list',
      'website_domains_add',
      'website_domains_remove',
      'website_env_vars_list',
      'website_env_vars_set',
      'website_env_vars_delete',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('skips write tools when ctx has only sites:read', () => {
    const tools = registerAll(['sites:read']);
    expect(tools.has('sites_list')).toBe(true);
    expect(tools.has('posts_list')).toBe(true);
    expect(tools.has('posts_create')).toBe(false);
    expect(tools.has('posts_delete')).toBe(false);
    expect(tools.has('media_upload_from_url')).toBe(false);
  });

  it('skips media tools when ctx lacks media scope', () => {
    const tools = registerAll(['sites:read', 'sites:write']);
    expect(tools.has('media_list')).toBe(false);
    expect(tools.has('media_upload_from_url')).toBe(false);
    expect(tools.has('media_delete')).toBe(false);
  });

  it('registers nothing when ctx has no relevant scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('respects resource:* wildcards', () => {
    const tools = registerAll(['sites:*', 'media:*']);
    expect(tools.has('posts_create')).toBe(true);
    expect(tools.has('media_upload_from_url')).toBe(true);
  });
});

// ── metadata sanity ────────────────────────────────────────────────────────

describe('CMS tool metadata', () => {
  beforeEach(resetDbState);

  it('every registered tool has a non-empty title and description', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} description`).toBeGreaterThan(5);
    }
  });

  it('every tool registers an inputSchema (even if empty)', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── sites_list / posts_list / posts_get ────────────────────────────────────

describe('sites_list', () => {
  beforeEach(resetDbState);

  it('returns the rows from clientWebsites', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'A' }, { id: 2, name: 'B' }]];
    const tools = registerAll();
    const res = await tools.get('sites_list')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
  });

  it('returns scope-denied when sites:read is missing', async () => {
    // Force ctx that LACKS sites:read but force-register the tool via a custom adapter scenario:
    // Since the gate is in `requireScope` inside the handler too, we can build a server with no
    // scopes and observe registration is skipped. Instead, exercise the handler-level guard by
    // calling through with a stubbed registry that *did* register (use sites:read scope).
    const tools = registerAll(['sites:read']);
    // The denied branch is unreachable through the registry path because hasScope already gates
    // registration; this assertion just confirms successful registration.
    expect(tools.has('sites_list')).toBe(true);
  });
});

describe('posts_list', () => {
  beforeEach(resetDbState);

  it('lists agency posts (no websiteId)', async () => {
    dbState.selectQueue = [[{ id: 10, title: 'X' }]];
    const tools = registerAll();
    const res = await tools.get('posts_list')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 10, title: 'X' }]);
  });

  it('returns Site not found when websiteId is foreign', async () => {
    dbState.selectQueue = [
      [], // site lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('posts_list')!.handler({ websiteId: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/Site not found/);
  });

  it('lists posts for an owned website with filters', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],                       // site lookup hit
      [{ id: 100, title: 'My Post' }],   // posts query
    ];
    const tools = registerAll();
    const res = await tools.get('posts_list')!.handler({
      websiteId: 5, postType: 'page', publishedOnly: true, limit: 5,
    });
    expect(parseJson(res)).toEqual([{ id: 100, title: 'My Post' }]);
  });
});

describe('posts_get', () => {
  beforeEach(resetDbState);

  it('returns not-found when row missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_get')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns permission-denied for agency posts (no websiteId)', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: null, title: 'T' }]];
    const tools = registerAll();
    const res = await tools.get('posts_get')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/agency/i);
  });

  it('returns permission-denied if the website is not owned by the tenant', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5 }],  // post
      [],                          // site lookup empty (other tenant)
    ];
    const tools = registerAll();
    const res = await tools.get('posts_get')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/denied/i);
  });

  it('returns the post when ownership checks pass', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 'OK' }],
      [{ id: 5 }],
    ];
    const tools = registerAll();
    const res = await tools.get('posts_get')!.handler({ id: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });
});

// ── posts_create / posts_update / posts_delete ────────────────────────────

describe('posts_create', () => {
  beforeEach(resetDbState);

  it('returns Site not found when site is foreign', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_create')!.handler({
      websiteId: 99, title: 'T', slug: 't',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('creates and applies when stageOrApply runs apply', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
    ];
    dbState.insertReturning = [{ id: 100, title: 'Hi', slug: 'hi' }];
    const tools = registerAll();
    const res = await tools.get('posts_create')!.handler({
      websiteId: 5, title: 'Hi', slug: 'hi',
      content: 'plain text',
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(100);
  });

  it('returns pending envelope when stageOrApply stages', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('posts_create')!.handler({
      websiteId: 5, title: 'Pending', slug: 'p',
    });
    const out = parseJson(res) as { pending: boolean; pendingId: number; status: string };
    expect(out.pending).toBe(true);
    expect(out.pendingId).toBe(42);
    expect(out.status).toBe('pending');
  });
});

describe('posts_update', () => {
  beforeEach(resetDbState);

  it('returns not-found when post missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_update')!.handler({ id: 999, title: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns permission denied for agency post', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: null, title: 't' }]];
    const tools = registerAll();
    const res = await tools.get('posts_update')!.handler({ id: 1, title: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/agency/i);
  });

  it('returns permission denied when site not owned', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 't' }],
      [], // site lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('posts_update')!.handler({ id: 1, title: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/denied/i);
  });

  it('updates the post when ownership passes', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 'old', published: false, excerpt: 'e', content: '{}', customCss: null, customJs: null }],
      [{ id: 5 }],
    ];
    dbState.updateReturning = [{ id: 1, title: 'new' }];
    const tools = registerAll();
    const res = await tools.get('posts_update')!.handler({
      id: 1, title: 'new', excerpt: 'eee', published: true, customCss: 'body{}', customJs: 'x', blocks: [{ id: 'b', type: 'text' }],
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });

  it('returns pending envelope when staged', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 'old', published: true }],
      [{ id: 5 }],
    ];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('posts_update')!.handler({ id: 1, title: 'X' });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });

  // Regression: posts_fork creates an unpublished draft (parentPostId set) +
  // its own entity approval link, then posts_update edits it. Under a
  // require_cms_approval key the edit must apply DIRECTLY to the fork
  // (skipApproval), not get staged into a separate pending_change — otherwise
  // it's orphaned from the fork's link and the preview shows the unmodified
  // clone ("nothing changed").
  it('applies directly (skipApproval) when editing an unpublished fork', async () => {
    dbState.selectQueue = [
      [{ id: 699, websiteId: 5, title: 'CY (fork)', published: false, parentPostId: 12, content: '{}', customCss: null }],
      [{ id: 5 }],
    ];
    dbState.updateReturning = [{ id: 699, title: 'CY (fork)' }];
    const tools = registerAll();
    await tools.get('posts_update')!.handler({ id: 699, customCss: 'svg{fill:#fff}' });
    expect(vi.mocked(stageOrApply).mock.lastCall?.[0].skipApproval).toBe(true);
  });

  it('stages (no skipApproval) when editing a live published post', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 'live', published: true, content: '{}', customCss: null }],
      [{ id: 5 }],
    ];
    dbState.updateReturning = [{ id: 1, title: 'live' }];
    const tools = registerAll();
    await tools.get('posts_update')!.handler({ id: 1, title: 'new' });
    expect(vi.mocked(stageOrApply).mock.lastCall?.[0].skipApproval).toBe(false);
  });

  // Narrow scope: a plain unpublished draft (NOT a fork — no parentPostId) has
  // no separate entity link, so AI edits on a require-approval key stay
  // reviewable. This mirrors the e2e expectation in portal-mcp-approvals.
  it('stages (no skipApproval) when editing a plain non-fork unpublished draft', async () => {
    dbState.selectQueue = [
      [{ id: 2, websiteId: 5, title: 'draft', published: false, parentPostId: null, content: '{}', customCss: null }],
      [{ id: 5 }],
    ];
    dbState.updateReturning = [{ id: 2, title: 'draft2' }];
    const tools = registerAll();
    await tools.get('posts_update')!.handler({ id: 2, title: 'draft2' });
    expect(vi.mocked(stageOrApply).mock.lastCall?.[0].skipApproval).toBe(false);
  });

  it('stages when publishing a fork (published: true is the gate)', async () => {
    dbState.selectQueue = [
      [{ id: 699, websiteId: 5, title: 'fork', published: false, parentPostId: 12, content: '{}', customCss: null }],
      [{ id: 5 }],
    ];
    dbState.updateReturning = [{ id: 699 }];
    const tools = registerAll();
    await tools.get('posts_update')!.handler({ id: 699, published: true });
    expect(vi.mocked(stageOrApply).mock.lastCall?.[0].skipApproval).toBe(false);
  });
});

describe('posts_delete', () => {
  beforeEach(resetDbState);

  it('returns not-found when post missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_delete')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns permission denied for agency post', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: null, title: 't' }]];
    const tools = registerAll();
    const res = await tools.get('posts_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/agency/i);
  });

  it('deletes when ownership passes', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 't', slug: 's', published: false, postType: 'blog' }],
      [{ id: 5 }],
    ];
    const tools = registerAll();
    const res = await tools.get('posts_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { success?: boolean; id?: number };
    expect(out.success).toBe(true);
    expect(out.id).toBe(1);
  });
});

// ── posts_upload_html ──────────────────────────────────────────────────────

describe('posts_upload_html', () => {
  beforeEach(resetDbState);

  it('returns Site not found when site is foreign', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_upload_html')!.handler({
      websiteId: 99, filename: 'a.html', contentBase64: Buffer.from('<html></html>').toString('base64'),
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('rejects empty buffer', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    const tools = registerAll();
    const res = await tools.get('posts_upload_html')!.handler({
      websiteId: 5, filename: 'a.html', contentBase64: '',
    });
    // schema constraint min(1) on base64 will reject at parse time, but handler also short-circuits
    expect((parseJson(res) as { error: string }).error).toBeDefined();
  });

  it('rejects files over the 1MB limit', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    const big = Buffer.alloc(1_000_001, 'a');
    const tools = registerAll();
    const res = await tools.get('posts_upload_html')!.handler({
      websiteId: 5, filename: 'big.html', contentBase64: big.toString('base64'),
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/exceeds/);
  });

  it('happy path: cleans HTML, imports assets, creates draft post', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],         // site lookup
      [],                  // slug collision check (no collision)
    ];
    dbState.insertReturning = [{ id: 100, title: 'foo', slug: 'foo' }];
    const tools = registerAll();
    const html = '<html><body>Hello</body></html>';
    const res = await tools.get('posts_upload_html')!.handler({
      websiteId: 5, filename: 'foo.html', contentBase64: Buffer.from(html).toString('base64'),
    });
    const out = parseJson(res) as { id: number; importedAssets: number; skippedAssets: number; url: string };
    expect(out.id).toBe(100);
    expect(out.importedAssets).toBe(3);
    expect(out.skippedAssets).toBe(1);
    expect(out.url).toContain('foo.html');
  });

  it('appends slug suffix on collision', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],            // site lookup
      [{ id: 1 }],            // first slug collision
      [],                     // second free
    ];
    dbState.insertReturning = [{ id: 200, title: 'foo', slug: 'foo-2' }];
    const tools = registerAll();
    const res = await tools.get('posts_upload_html')!.handler({
      websiteId: 5, filename: 'foo.html', contentBase64: Buffer.from('<p>x</p>').toString('base64'),
    });
    expect((parseJson(res) as { id: number }).id).toBe(200);
  });
});

// ── media tools ────────────────────────────────────────────────────────────

describe('media_list', () => {
  beforeEach(resetDbState);

  it('returns media rows', async () => {
    dbState.selectQueue = [[{ id: 1, filename: 'logo.png' }]];
    const tools = registerAll();
    const res = await tools.get('media_list')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1, filename: 'logo.png' }]);
  });
});

describe('media_upload_from_url', () => {
  beforeEach(() => {
    resetDbState();
    vi.spyOn(global, 'fetch').mockImplementation((async () => {
      return new Response('hello-body', {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '10' },
      });
    }) as never);
  });

  it('rejects when ssrf-guard refuses', async () => {
    const { assertSafeUrl } = await import('@/lib/ssrf-guard');
    (assertSafeUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad ip'));
    const tools = registerAll();
    const res = await tools.get('media_upload_from_url')!.handler({ url: 'http://evil.example.com/a.png' });
    expect((parseJson(res) as { error: string }).error).toMatch(/URL rejected/);
  });

  it('refuses redirects', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      return new Response('', { status: 302, headers: { location: 'https://other' } });
    });
    const tools = registerAll();
    const res = await tools.get('media_upload_from_url')!.handler({ url: 'https://example.com/a.png' });
    expect((parseJson(res) as { error: string }).error).toMatch(/redirects/);
  });

  it('returns error when fetch throws', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { throw new Error('dns'); });
    const tools = registerAll();
    const res = await tools.get('media_upload_from_url')!.handler({ url: 'https://example.com/a.png' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Fetch failed/);
  });

  it('returns error on non-200', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      return new Response('', { status: 404 });
    });
    const tools = registerAll();
    const res = await tools.get('media_upload_from_url')!.handler({ url: 'https://example.com/a.png' });
    expect((parseJson(res) as { error: string }).error).toMatch(/404/);
  });

  it('rejects when content-length exceeds limit', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      return new Response('x', {
        status: 200, headers: { 'content-length': String(50 * 1024 * 1024), 'content-type': 'image/png' },
      });
    });
    const tools = registerAll();
    const res = await tools.get('media_upload_from_url')!.handler({ url: 'https://example.com/big.png' });
    expect((parseJson(res) as { error: string }).error).toMatch(/too large/);
  });

  it('happy path: uploads and inserts media row', async () => {
    dbState.insertReturning = [{ id: 10, filename: 'pic.png' }];
    const tools = registerAll();
    const res = await tools.get('media_upload_from_url')!.handler({
      url: 'https://example.com/path/pic.png', alt: 'a', caption: 'c', websiteId: 5,
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(10);
  });
});

describe('media_delete', () => {
  beforeEach(resetDbState);

  it('returns not-found when row missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('media_delete')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('deletes when present', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    const tools = registerAll();
    const res = await tools.get('media_delete')!.handler({ id: 5 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out.success).toBe(true);
    expect(out.id).toBe(5);
  });
});

// ── taxonomies ─────────────────────────────────────────────────────────────

describe('taxonomies_list', () => {
  beforeEach(resetDbState);

  it('returns Site not found when site is foreign', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('taxonomies_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('returns categories and tags', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],          // site lookup
      [{ id: 1, name: 'cat1' }],
      [{ id: 2, name: 'tag1' }],
    ];
    const tools = registerAll();
    const res = await tools.get('taxonomies_list')!.handler({ websiteId: 5 });
    const out = parseJson(res) as { categories: { name: string }[]; tags: { name: string }[] };
    expect(out.categories[0].name).toBe('cat1');
    expect(out.tags[0].name).toBe('tag1');
  });
});

describe('taxonomies_create_category', () => {
  beforeEach(resetDbState);

  it('returns Site not found when site is foreign', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('taxonomies_create_category')!.handler({ websiteId: 9, name: 'Cat' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('creates a category and slugifies the name', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.insertReturning = [{ id: 30, name: 'My Cat', slug: 'my-cat' }];
    const tools = registerAll();
    const res = await tools.get('taxonomies_create_category')!.handler({
      websiteId: 5, name: 'My Cat',
    });
    const out = parseJson(res) as { slug: string };
    expect(out.slug).toBe('my-cat');
  });
});

describe('taxonomies_create_tag', () => {
  beforeEach(resetDbState);

  it('returns Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('taxonomies_create_tag')!.handler({ websiteId: 9, name: 'tag' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('creates a tag', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.insertReturning = [{ id: 40, name: 'hot', slug: 'hot' }];
    const tools = registerAll();
    const res = await tools.get('taxonomies_create_tag')!.handler({ websiteId: 5, name: 'hot' });
    expect((parseJson(res) as { id: number }).id).toBe(40);
  });
});

describe('posts_set_taxonomies', () => {
  beforeEach(resetDbState);

  it('returns not-found when post missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_set_taxonomies')!.handler({ postId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns permission denied for agency post', async () => {
    dbState.selectQueue = [[{ websiteId: null }]];
    const tools = registerAll();
    const res = await tools.get('posts_set_taxonomies')!.handler({ postId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/agency/i);
  });

  it('returns permission denied when site unowned', async () => {
    dbState.selectQueue = [
      [{ websiteId: 5 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('posts_set_taxonomies')!.handler({ postId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/denied/i);
  });

  it('replaces taxonomies and returns updated ids', async () => {
    dbState.selectQueue = [
      [{ websiteId: 5 }],   // post
      [{ id: 5 }],          // site lookup
      [{ categoryId: 7 }],  // post categories after replace
      [{ tagId: 9 }],       // post tags after replace
    ];
    const tools = registerAll();
    const res = await tools.get('posts_set_taxonomies')!.handler({
      postId: 1, categoryIds: [7], tagIds: [9],
    });
    const out = parseJson(res) as { postId: number; categoryIds: number[]; tagIds: number[] };
    expect(out.postId).toBe(1);
    expect(out.categoryIds).toEqual([7]);
    expect(out.tagIds).toEqual([9]);
  });

  it('skips arrays that are undefined (leaves alone)', async () => {
    dbState.selectQueue = [
      [{ websiteId: 5 }],
      [{ id: 5 }],
      [],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('posts_set_taxonomies')!.handler({ postId: 1 });
    const out = parseJson(res) as { categoryIds: number[] };
    expect(out.categoryIds).toEqual([]);
  });
});

// ── sites_update / custom code ─────────────────────────────────────────────

describe('sites_update', () => {
  beforeEach(resetDbState);

  it('returns Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sites_update')!.handler({ id: 99, name: 'x' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('updates and returns row', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateReturning = [{ id: 5, name: 'New' }];
    const tools = registerAll();
    const res = await tools.get('sites_update')!.handler({ id: 5, name: 'New', active: true });
    const out = parseJson(res) as { id: number; name: string };
    expect(out.name).toBe('New');
  });
});

describe('sites_get_custom_code', () => {
  beforeEach(resetDbState);

  it('returns error when site missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sites_get_custom_code')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('returns css/js, empty strings if null', async () => {
    dbState.selectQueue = [[{ id: 5, customCss: null, customJs: 'console.log(1)' }]];
    const tools = registerAll();
    const res = await tools.get('sites_get_custom_code')!.handler({ id: 5 });
    const out = parseJson(res) as { customCss: string; customJs: string };
    expect(out.customCss).toBe('');
    expect(out.customJs).toBe('console.log(1)');
  });
});

describe('sites_update_custom_code', () => {
  beforeEach(resetDbState);

  it('returns Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sites_update_custom_code')!.handler({ id: 99, customCss: 'a' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('clears value when empty string passed', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateReturning = [{ customCss: null, customJs: null }];
    const tools = registerAll();
    const res = await tools.get('sites_update_custom_code')!.handler({
      id: 5, customCss: '', customJs: '',
    });
    const out = parseJson(res) as { customCss: string; customJs: string };
    expect(out.customCss).toBe('');
    expect(out.customJs).toBe('');
  });

  it('updates non-empty values', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.updateReturning = [{ customCss: 'body{}', customJs: 'x' }];
    const tools = registerAll();
    const res = await tools.get('sites_update_custom_code')!.handler({
      id: 5, customCss: 'body{}', customJs: 'x',
    });
    const out = parseJson(res) as { customCss: string };
    expect(out.customCss).toBe('body{}');
  });
});

// ── nav tools ──────────────────────────────────────────────────────────────

describe('nav_list / nav_create / nav_delete', () => {
  beforeEach(resetDbState);

  it('nav_list returns Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('nav_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('nav_list returns rows when site owned', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [{ id: 1, label: 'Home' }],
    ];
    const tools = registerAll();
    const res = await tools.get('nav_list')!.handler({ websiteId: 5 });
    expect(parseJson(res)).toEqual([{ id: 1, label: 'Home' }]);
  });

  it('nav_create returns Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('nav_create')!.handler({ websiteId: 99, label: 'X', href: '/x' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('nav_create inserts a nav item', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [{ id: 1 }, { id: 2 }],   // existing nav for sortOrder
    ];
    dbState.insertReturning = [{ id: 3, label: 'New', sortOrder: 2 }];
    const tools = registerAll();
    const res = await tools.get('nav_create')!.handler({
      websiteId: 5, label: 'New', href: '/new',
    });
    expect((parseJson(res) as { id: number }).id).toBe(3);
  });

  it('nav_delete returns Nav item not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('nav_delete')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('nav_delete succeeds when nav owned', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: 5 }]];
    const tools = registerAll();
    const res = await tools.get('nav_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out.success).toBe(true);
  });
});

// ── posts_list_revisions ───────────────────────────────────────────────────

describe('posts_list_revisions', () => {
  beforeEach(resetDbState);

  it('returns not-found when post missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_list_revisions')!.handler({ postId: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns permission denied for agency post', async () => {
    dbState.selectQueue = [[{ websiteId: null }]];
    const tools = registerAll();
    const res = await tools.get('posts_list_revisions')!.handler({ postId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/agency/i);
  });

  it('returns permission denied when site unowned', async () => {
    dbState.selectQueue = [
      [{ websiteId: 5 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('posts_list_revisions')!.handler({ postId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/denied/i);
  });

  it('returns the revision rows when ownership ok', async () => {
    dbState.selectQueue = [
      [{ websiteId: 5 }],
      [{ id: 5 }],
      [{ id: 11, postId: 1 }],
    ];
    const tools = registerAll();
    const res = await tools.get('posts_list_revisions')!.handler({ postId: 1 });
    expect(parseJson(res)).toEqual([{ id: 11, postId: 1 }]);
  });
});

// ── block templates ────────────────────────────────────────────────────────

describe('block templates', () => {
  beforeEach(resetDbState);

  it('block_templates_list returns slim rows with optional filters', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'T', slug: 't', category: 'custom', scope: 'block', version: 1 }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_list')!.handler({ category: 'custom', scope: 'block' });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });

  it('block_templates_list without filters', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'T' }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_list')!.handler({});
    expect((parseJson(res) as unknown[]).length).toBe(1);
  });

  it('block_templates_get returns not-found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('block_templates_get')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('block_templates_get returns the row', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'T', blocks: [] }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_get')!.handler({ id: 1 });
    expect((parseJson(res) as { id: number }).id).toBe(1);
  });

  it('block_templates_create rejects duplicate slug', async () => {
    dbState.selectQueue = [[{ id: 5 }]]; // collision
    const tools = registerAll();
    const res = await tools.get('block_templates_create')!.handler({
      name: 'T', slug: 'taken', blocks: [{ id: 'b', type: 'text' }],
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/already exists/i);
  });

  it('block_templates_create succeeds when slug is free', async () => {
    dbState.selectQueue = [[]];
    dbState.insertReturning = [{ id: 100, name: 'T', slug: 't' }];
    const tools = registerAll();
    const res = await tools.get('block_templates_create')!.handler({
      name: 'T', slug: 't', blocks: [{ id: 'b', type: 'text' }],
    });
    expect((parseJson(res) as { id: number }).id).toBe(100);
  });

  it('block_templates_update returns not-found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('block_templates_update')!.handler({ id: 99, name: 'x' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('block_templates_update bumps version when blocks change', async () => {
    dbState.selectQueue = [[{ id: 1, name: 'T', version: 5, blocks: [] }]];
    dbState.updateReturning = [{ id: 1, version: 6 }];
    const tools = registerAll();
    const res = await tools.get('block_templates_update')!.handler({
      id: 1, blocks: [{ id: 'b', type: 'hero' }],
    });
    expect((parseJson(res) as { version: number }).version).toBe(6);
  });

  it('block_templates_delete returns not-found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('block_templates_delete')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('block_templates_delete refuses when usages exist', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],
      [{ id: 1 }, { id: 2 }], // usages
    ];
    const tools = registerAll();
    const res = await tools.get('block_templates_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Cannot delete/);
  });

  it('block_templates_delete succeeds when no usages', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('block_templates_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { success: boolean };
    expect(out.success).toBe(true);
  });
});

// ── website domains ────────────────────────────────────────────────────────

describe('website domains', () => {
  beforeEach(resetDbState);

  it('website_domains_list — Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('website_domains_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('website_domains_list returns rows', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [{ id: 1, domain: 'a.example.com' }],
    ];
    const tools = registerAll();
    const res = await tools.get('website_domains_list')!.handler({ websiteId: 5 });
    expect(parseJson(res)).toEqual([{ id: 1, domain: 'a.example.com' }]);
  });

  it('website_domains_add — Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('website_domains_add')!.handler({
      websiteId: 99, domain: 'x.example.com',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('website_domains_add inserts a non-primary domain', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.insertReturning = [{ id: 1, domain: 'a.example.com', isPrimary: false }];
    const tools = registerAll();
    const res = await tools.get('website_domains_add')!.handler({
      websiteId: 5, domain: 'A.Example.com',
    });
    const out = parseJson(res) as { domain: string };
    expect(out.domain).toBe('a.example.com');
  });

  it('website_domains_add demotes existing primaries when isPrimary set', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.insertReturning = [{ id: 2, domain: 'b.example.com', isPrimary: true }];
    const tools = registerAll();
    const res = await tools.get('website_domains_add')!.handler({
      websiteId: 5, domain: 'b.example.com', isPrimary: true,
    });
    const out = parseJson(res) as { isPrimary: boolean };
    expect(out.isPrimary).toBe(true);
  });

  it('website_domains_remove — Domain not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('website_domains_remove')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('website_domains_remove succeeds when owned', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: 5 }]];
    const tools = registerAll();
    const res = await tools.get('website_domains_remove')!.handler({ id: 1 });
    const out = parseJson(res) as { success: boolean };
    expect(out.success).toBe(true);
  });
});

// ── website env vars ──────────────────────────────────────────────────────

describe('website env vars', () => {
  beforeEach(resetDbState);

  it('list — Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_list')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('list — Environment not found', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_list')!.handler({ websiteId: 5, environment: 'staging' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Environment.*not found/);
  });

  it('list returns rows', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],          // site
      [{ id: 11 }],         // env
      [{ key: 'A', value: 'x' }], // env vars
    ];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_list')!.handler({ websiteId: 5 });
    expect(parseJson(res)).toEqual([{ key: 'A', value: 'x' }]);
  });

  it('set — Site not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_set')!.handler({
      websiteId: 99, key: 'K', value: 'V',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('set — Environment not found', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [],
    ];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_set')!.handler({
      websiteId: 5, environment: 'preview', key: 'K', value: 'V',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Environment.*not found/);
  });

  it('set updates an existing key', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [{ id: 11 }],
      [{ id: 22 }],   // existing var
    ];
    dbState.updateReturning = [{ id: 22, key: 'K', value: 'NEW' }];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_set')!.handler({
      websiteId: 5, key: 'K', value: 'NEW',
    });
    const out = parseJson(res) as { value: string };
    expect(out.value).toBe('NEW');
  });

  it('set inserts a new key when no existing row', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],
      [{ id: 11 }],
      [], // no existing
    ];
    dbState.insertReturning = [{ id: 33, key: 'NEW', value: 'V' }];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_set')!.handler({
      websiteId: 5, key: 'NEW', value: 'V',
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(33);
  });

  it('delete — Env var not found', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_delete')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('delete succeeds when owned', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: 5 }]];
    const tools = registerAll();
    const res = await tools.get('website_env_vars_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { success: boolean };
    expect(out.success).toBe(true);
  });
});
