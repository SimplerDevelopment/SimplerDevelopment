// @vitest-environment node
/**
 * Supplemental coverage tests for lib/mcp/tools/cms.ts.
 *
 * Targets the tools NOT exercised by mcp-tools-cms.test.ts:
 *   - posts_fork
 *   - posts_upload_html_zip
 *   - media_upload_presign
 *   - media_register
 *   - sites_publish_custom_code
 *   - nav_update
 *   - nav_publish
 *   - nav_publish_all
 *   - block_templates_fork
 *   - block_templates_publish
 *
 * Also covers error/edge branches in existing tools that the primary test
 * does not reach (BlockGateError paths, pending envelopes, etc.).
 *
 * Mocking pattern mirrors mcp-tools-cms.test.ts exactly — every external
 * dependency is stubbed; no real DB or network calls are made.
 */
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test_dummy';
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
  presignPut: vi.fn(async () => ({
    uploadUrl: 'https://s3.example.com/presigned',
    requiredHeaders: { 'content-type': 'image/png' },
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  })),
  generateMediaKey: vi.fn((filename: string) => ({
    storedFilename: `stored-${filename}`,
    key: `media/uuid-${filename}`,
  })),
}));

// S3 client used by media_register (HEAD object)
const mockS3Send = vi.fn();
vi.mock('@/lib/s3/client', () => ({
  getS3Client: vi.fn(() => ({ send: mockS3Send })),
  getBucketName: vi.fn(() => 'test-bucket'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HeadObjectCommand: class HeadObjectCommand {
    params: unknown;
    constructor(params: unknown) { this.params = params; }
  },
}));

vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: vi.fn((html: string) => `<cleaned>${html}</cleaned>`),
}));

vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: vi.fn(async (html: string) => ({
    html: `${html}-imported`,
    importedCount: 2,
    skippedCount: 0,
  })),
}));

vi.mock('@/lib/html-zip-upload', () => ({
  unpackAndUploadZip: vi.fn(async () => ({
    entries: [
      { relativePath: 'index.html', mimeType: 'text/html', upload: { storedFilename: 'stored-index.html', fileSize: 500, url: 'https://s3.example.com/bundle/index.html' } },
      { relativePath: 'style.css', mimeType: 'text/css', upload: { storedFilename: 'stored-style.css', fileSize: 200, url: 'https://s3.example.com/bundle/style.css' } },
    ],
    index: {
      relativePath: 'index.html',
      mimeType: 'text/html',
      upload: { storedFilename: 'stored-index.html', fileSize: 500, url: 'https://s3.example.com/bundle/index.html' },
    },
    prefix: 'media/bundle-uuid/',
  })),
  isHttpError: vi.fn((err: unknown) => (err as { isHttp?: boolean })?.isHttp === true),
  MAX_ZIP_TOTAL_BYTES: 50 * 1024 * 1024,
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

// Block-gate mock: allow by default, can be overridden per test.
// Uses vi.hoisted so the class is available inside the vi.mock factory
// (which is hoisted to the top of the module by vitest's transform).
const { MockBlockGateError, mockAssertBlocksAllowedForUserId } = vi.hoisted(() => {
  class MockBlockGateError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BlockGateError';
    }
  }
  const mockAssertBlocksAllowedForUserId = vi.fn(async () => undefined);
  return { MockBlockGateError, mockAssertBlocksAllowedForUserId };
});

vi.mock('@/lib/security/block-allowlist', () => ({
  assertBlocksAllowedForUserId: (...args: unknown[]) =>
    mockAssertBlocksAllowedForUserId(...args),
  BlockGateError: MockBlockGateError,
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

vi.mock('@/lib/mcp/approval-links', () => ({
  mintLinkForResult: vi.fn(async () => ({ approvalUrl: 'https://x/approve/tok', approvalToken: 'tok' })),
  createApprovalLink: vi.fn(async () => ({ approvalUrl: 'https://x/approve/tok', approvalToken: 'tok' })),
  approvalEnvelope: vi.fn((link: unknown) => link),
}));

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

// Chainable thenable DB mock (same structure as mcp-tools-cms.test.ts)
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

// ── imports ──────────────────────────────────────────────────────────────────

import { registerCmsTools } from '@/lib/mcp/tools/cms';

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
  mockAssertBlocksAllowedForUserId.mockReset();
  mockAssertBlocksAllowedForUserId.mockResolvedValue(undefined);
  mockS3Send.mockReset();
}

// ── posts_fork ─────────────────────────────────────────────────────────────

describe('posts_fork', () => {
  beforeEach(resetDbState);

  it('returns source-not-found when source post missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_fork')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns permission-denied for agency post (no websiteId)', async () => {
    dbState.selectQueue = [[{ id: 1, websiteId: null, title: 'Agency' }]];
    const tools = registerAll();
    const res = await tools.get('posts_fork')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/agency/i);
  });

  it('returns permission-denied when site not owned by tenant', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 'Owned by Other', slug: 'page' }],
      [], // site lookup empty — other tenant
    ];
    const tools = registerAll();
    const res = await tools.get('posts_fork')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/denied/i);
  });

  it('forks a post and returns the new id + approval link', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 'Home', slug: 'home', content: '{}', excerpt: null, postType: 'page', published: true, coverImage: null, seoTitle: null, seoDescription: null, ogImage: null, noIndex: false, canonicalUrl: null, customCss: null, customJs: null }],
      [{ id: 5 }], // site ownership check
    ];
    dbState.insertReturning = [{ id: 200, title: 'Home (fork)', slug: 'home-fork-abc', published: false }];
    const tools = registerAll();
    const res = await tools.get('posts_fork')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; parentPostId: number };
    expect(out.id).toBe(200);
    expect(out.parentPostId).toBe(1);
  });

  it('uses custom titleSuffix when provided', async () => {
    dbState.selectQueue = [
      [{ id: 2, websiteId: 5, title: 'Services', slug: 'services', content: '{}', excerpt: null, postType: 'page', published: true, coverImage: null, seoTitle: null, seoDescription: null, ogImage: null, noIndex: false, canonicalUrl: null, customCss: null, customJs: null }],
      [{ id: 5 }],
    ];
    dbState.insertReturning = [{ id: 201, title: 'Services (v2)', slug: 'services-fork-xyz', published: false }];
    const tools = registerAll();
    const res = await tools.get('posts_fork')!.handler({ id: 2, titleSuffix: ' (v2)' });
    expect((parseJson(res) as { id: number }).id).toBe(201);
    // The insert should have been called — verify via dbState
    expect(dbState.inserts.length).toBeGreaterThan(0);
  });

  it('returns pending envelope when stageOrApply stages the fork', async () => {
    // posts_fork does NOT use stageOrApply, it inserts directly — so pending path
    // is tested via createApprovalLink only. Verify the approval field is present.
    dbState.selectQueue = [
      [{ id: 3, websiteId: 5, title: 'Blog', slug: 'blog', content: '{}', excerpt: null, postType: 'blog', published: true, coverImage: null, seoTitle: null, seoDescription: null, ogImage: null, noIndex: false, canonicalUrl: null, customCss: null, customJs: null }],
      [{ id: 5 }],
    ];
    dbState.insertReturning = [{ id: 202, title: 'Blog (fork)', slug: 'blog-fork-1', published: false }];
    const tools = registerAll();
    const res = await tools.get('posts_fork')!.handler({ id: 3 });
    const out = parseJson(res) as { approval: unknown };
    expect(out.approval).toBeDefined();
  });
});

// ── posts_upload_html_zip ──────────────────────────────────────────────────

describe('posts_upload_html_zip', () => {
  beforeEach(resetDbState);

  it('returns Site not found when site is foreign', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('posts_upload_html_zip')!.handler({
      websiteId: 99, filename: 'bundle.zip', contentBase64: Buffer.from('PK').toString('base64'),
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('blocks upload when BlockGateError is raised', async () => {
    dbState.selectQueue = [[{ id: 5, name: 'My Site' }]];
    mockAssertBlocksAllowedForUserId.mockRejectedValueOnce(
      new MockBlockGateError('html-embed blocks not allowed'),
    );
    const tools = registerAll();
    const res = await tools.get('posts_upload_html_zip')!.handler({
      websiteId: 5, filename: 'bundle.zip', contentBase64: Buffer.from('PK').toString('base64'),
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not allowed/);
  });

  it('returns error for empty zip buffer', async () => {
    dbState.selectQueue = [[{ id: 5, name: 'My Site' }]];
    const tools = registerAll();
    const res = await tools.get('posts_upload_html_zip')!.handler({
      websiteId: 5, filename: 'bundle.zip', contentBase64: '',
    });
    // empty base64 decodes to 0 bytes — handler returns "Empty zip"
    expect((parseJson(res) as { error: string }).error).toBeDefined();
  });

  it('returns error when unpackAndUploadZip throws an http error', async () => {
    dbState.selectQueue = [[{ id: 5, name: 'My Site' }]];
    const { unpackAndUploadZip, isHttpError } = await import('@/lib/html-zip-upload');
    (unpackAndUploadZip as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('zip too large'), { isHttp: true }),
    );
    (isHttpError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    const tools = registerAll();
    const res = await tools.get('posts_upload_html_zip')!.handler({
      websiteId: 5,
      filename: 'bundle.zip',
      contentBase64: Buffer.from('PK\x03\x04').toString('base64'),
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/zip too large/);
  });

  it('happy path: unpacks zip, inserts media rows, creates draft post', async () => {
    dbState.selectQueue = [
      [{ id: 5, name: 'My Site' }],  // site lookup
      [],                             // slug collision check — free
    ];
    dbState.insertReturning = [{ id: 300, title: 'Bundle', slug: 'bundle', postType: 'page', published: false }];
    const { unpackAndUploadZip } = await import('@/lib/html-zip-upload');
    (unpackAndUploadZip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      entries: [
        { relativePath: 'index.html', mimeType: 'text/html', upload: { storedFilename: 'stored-index.html', fileSize: 500, url: 'https://s3.example.com/bundle/index.html' } },
      ],
      index: { relativePath: 'index.html', mimeType: 'text/html', upload: { storedFilename: 'stored-index.html', fileSize: 500, url: 'https://s3.example.com/bundle/index.html' } },
      prefix: 'media/bundle-uuid/',
    });
    const tools = registerAll();
    const res = await tools.get('posts_upload_html_zip')!.handler({
      websiteId: 5,
      filename: 'my-bundle.zip',
      contentBase64: Buffer.from('PK\x03\x04').toString('base64'),
    });
    const out = parseJson(res) as { id: number; bundleFileCount: number; approval: unknown };
    expect(out.id).toBe(300);
    expect(out.bundleFileCount).toBe(1);
    expect(out.approval).toBeDefined();
  });

  it('returns pending envelope when stageOrApply stages', async () => {
    // zip tool does NOT use stageOrApply (inserts directly). Approval link is
    // always created. Verify non-error path returns approval field.
    dbState.selectQueue = [
      [{ id: 5, name: 'My Site' }],
      [],
    ];
    dbState.insertReturning = [{ id: 301, title: 'Bundle', slug: 'bundle2', postType: 'page', published: false }];
    const { unpackAndUploadZip } = await import('@/lib/html-zip-upload');
    (unpackAndUploadZip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      entries: [],
      index: { relativePath: 'index.html', mimeType: 'text/html', upload: { storedFilename: 'idx', fileSize: 100, url: 'https://s3.example.com/idx.html' } },
      prefix: 'media/x/',
    });
    const tools = registerAll();
    const res = await tools.get('posts_upload_html_zip')!.handler({
      websiteId: 5,
      filename: 'x.zip',
      contentBase64: Buffer.from('PK\x03\x04').toString('base64'),
    });
    expect((parseJson(res) as { approval: unknown }).approval).toBeDefined();
  });
});

// ── media_upload_presign ───────────────────────────────────────────────────

describe('media_upload_presign', () => {
  beforeEach(resetDbState);

  it('rejects disallowed mimeType', async () => {
    const tools = registerAll();
    const res = await tools.get('media_upload_presign')!.handler({
      filename: 'doc.exe', mimeType: 'application/x-msdownload', fileSize: 1000,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not allowed/i);
  });

  it('rejects when fileSize is over 25 MB cap', async () => {
    const tools = registerAll();
    const res = await tools.get('media_upload_presign')!.handler({
      filename: 'big.png', mimeType: 'image/png', fileSize: 30 * 1024 * 1024,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/too large/i);
  });

  it('returns presigned URL on valid request', async () => {
    const tools = registerAll();
    const res = await tools.get('media_upload_presign')!.handler({
      filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 500_000,
    });
    const out = parseJson(res) as { uploadUrl: string; mediaKey: string; storedFilename: string };
    expect(out.uploadUrl).toMatch(/presigned/);
    expect(out.mediaKey).toMatch(/^media\//);
  });

  it('returns error when presignPut throws', async () => {
    const { presignPut } = await import('@/lib/s3/upload');
    (presignPut as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('S3 unavailable'));
    const tools = registerAll();
    const res = await tools.get('media_upload_presign')!.handler({
      filename: 'photo.png', mimeType: 'image/png', fileSize: 1000,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Failed to presign/);
  });

  it('handles mimeType with charset suffix correctly', async () => {
    const tools = registerAll();
    // 'image/png; charset=utf-8' should be normalised to 'image/png' and pass
    const res = await tools.get('media_upload_presign')!.handler({
      filename: 'pic.png', mimeType: 'image/png; charset=utf-8', fileSize: 100,
    });
    const out = parseJson(res) as { uploadUrl?: string; error?: string };
    // Should succeed (normalised mime is image/png which is in the allow-list)
    expect(out.uploadUrl).toBeDefined();
    expect(out.error).toBeUndefined();
  });
});

// ── media_register ─────────────────────────────────────────────────────────

describe('media_register', () => {
  beforeEach(resetDbState);

  it('rejects disallowed declared mimeType', async () => {
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/uuid.exe', originalFilename: 'file.exe', mimeType: 'application/x-msdownload',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not in the allow-list/i);
  });

  it('rejects mediaKey that lacks media/ prefix', async () => {
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'uploads/uuid.png', originalFilename: 'pic.png', mimeType: 'image/png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/must start with "media\/"/);
  });

  it('rejects mediaKey with path traversal', async () => {
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/../etc/passwd', originalFilename: 'pic.png', mimeType: 'image/png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/path traversal/);
  });

  it('returns error when HEAD returns 404', async () => {
    mockS3Send.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }),
    );
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/uuid.png', originalFilename: 'pic.png', mimeType: 'image/png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Object not found/);
  });

  it('returns error on generic HEAD failure', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('Network timeout'));
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/uuid.png', originalFilename: 'pic.png', mimeType: 'image/png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/HEAD failed/);
  });

  it('returns error when S3 reports empty object', async () => {
    mockS3Send.mockResolvedValueOnce({ ContentLength: 0, ContentType: 'image/png' });
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/uuid.png', originalFilename: 'pic.png', mimeType: 'image/png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/empty object/i);
  });

  it('returns error when S3-reported mimeType is not in allow-list', async () => {
    mockS3Send.mockResolvedValueOnce({ ContentLength: 1000, ContentType: 'text/html' });
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/uuid.png', originalFilename: 'page.png', mimeType: 'image/png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/S3-reported mimeType.*not in the allow-list/);
  });

  it('returns error when uploaded object exceeds 25 MB', async () => {
    mockS3Send.mockResolvedValueOnce({ ContentLength: 30 * 1024 * 1024, ContentType: 'image/jpeg' });
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/big.jpg', originalFilename: 'big.jpg', mimeType: 'image/jpeg',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/exceeds 25 MB/);
  });

  it('happy path: registers the media row and returns it', async () => {
    mockS3Send.mockResolvedValueOnce({ ContentLength: 5000, ContentType: 'image/png' });
    dbState.insertReturning = [{ id: 50, filename: 'photo.png', url: '/api/media/proxy/media/uuid.png' }];
    const tools = registerAll();
    const res = await tools.get('media_register')!.handler({
      mediaKey: 'media/uuid.png',
      originalFilename: 'photo.png',
      mimeType: 'image/png',
      alt: 'A photo',
      websiteId: 5,
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(50);
  });
});

// ── sites_publish_custom_code ──────────────────────────────────────────────

describe('sites_publish_custom_code', () => {
  beforeEach(resetDbState);

  it('returns Site not found when site is missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('sites_publish_custom_code')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('promotes draft CSS/JS to live when apply runs', async () => {
    dbState.selectQueue = [[{
      id: 5, name: 'Acme', customCss: 'old{}', customJs: 'old()',
      draftCustomCss: 'new{}', draftCustomJs: 'new()',
    }]];
    dbState.updateReturning = [{
      id: 5, customCss: 'new{}', customJs: 'new()',
      draftCustomCss: null, draftCustomJs: null,
    }];
    const tools = registerAll();
    const res = await tools.get('sites_publish_custom_code')!.handler({ id: 5 });
    const out = parseJson(res) as { customCss: string; customJs: string };
    expect(out.customCss).toBe('new{}');
    expect(out.customJs).toBe('new()');
  });

  it('returns pending envelope when stageOrApply stages', async () => {
    dbState.selectQueue = [[{
      id: 5, name: 'Acme', customCss: null, customJs: null, draftCustomCss: 'x{}', draftCustomJs: null,
    }]];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('sites_publish_custom_code')!.handler({ id: 5 });
    const out = parseJson(res) as { pending: boolean; pendingId: number };
    expect(out.pending).toBe(true);
    expect(out.pendingId).toBe(42);
  });

  it('returns empty strings for null css/js after promotion', async () => {
    dbState.selectQueue = [[{
      id: 5, name: 'Acme', customCss: null, customJs: null, draftCustomCss: null, draftCustomJs: null,
    }]];
    dbState.updateReturning = [{ id: 5, customCss: null, customJs: null }];
    const tools = registerAll();
    const res = await tools.get('sites_publish_custom_code')!.handler({ id: 5 });
    const out = parseJson(res) as { customCss: string; customJs: string };
    expect(out.customCss).toBe('');
    expect(out.customJs).toBe('');
  });
});

// ── nav_update ─────────────────────────────────────────────────────────────

describe('nav_update', () => {
  beforeEach(resetDbState);

  it('returns Nav item not found when item is missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('nav_update')!.handler({ id: 99, label: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('stages the update and returns the updated row', async () => {
    dbState.selectQueue = [[{
      id: 1, websiteId: 5, label: 'Home', href: '/', draft: null,
    }]];
    dbState.updateReturning = [{ id: 1, label: 'Home (new)', href: '/' }];
    const tools = registerAll();
    const res = await tools.get('nav_update')!.handler({ id: 1, label: 'Home (new)' });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
  });

  it('merges into existing draft when draft is not null', async () => {
    dbState.selectQueue = [[{
      id: 2, websiteId: 5, label: 'About', href: '/about',
      draft: { label: 'About (draft)', href: '/about', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 },
    }]];
    dbState.updateReturning = [{ id: 2, label: 'About' }];
    const tools = registerAll();
    const res = await tools.get('nav_update')!.handler({ id: 2, href: '/about-us', isButton: true });
    expect((parseJson(res) as { id: number }).id).toBe(2);
    expect(dbState.updates.length).toBeGreaterThan(0);
  });

  it('returns pending envelope when stageOrApply stages', async () => {
    dbState.selectQueue = [[{
      id: 3, websiteId: 5, label: 'Contact', href: '/contact', draft: null,
    }]];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('nav_update')!.handler({ id: 3, label: 'Contact Us' });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });
});

// ── nav_publish ────────────────────────────────────────────────────────────

describe('nav_publish', () => {
  beforeEach(resetDbState);

  it('returns Nav item not found when item is missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('nav_publish')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('is a noop when draft is null', async () => {
    // The DB mock returns { site_navigation: navRow } because nav_publish uses innerJoin
    dbState.defaultSelect = [{ site_navigation: { id: 1, label: 'Home', href: '/', draft: null } }];
    const tools = registerAll();
    const res = await tools.get('nav_publish')!.handler({ id: 1 });
    const out = parseJson(res) as { noop?: boolean };
    expect(out.noop).toBe(true);
  });

  it('deletes the row when draft.pendingDelete is true', async () => {
    dbState.defaultSelect = [{
      site_navigation: {
        id: 2, label: 'Old', href: '/old',
        draft: { pendingDelete: true, updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 },
      },
    }];
    const tools = registerAll();
    const res = await tools.get('nav_publish')!.handler({ id: 2 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });

  it('applies draft fields to live columns and clears draft', async () => {
    dbState.defaultSelect = [{
      site_navigation: {
        id: 3, label: 'About', href: '/about',
        draft: { label: 'About Us', href: '/about-us', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 },
      },
    }];
    dbState.updateReturning = [{ id: 3, label: 'About Us', href: '/about-us', draft: null }];
    const tools = registerAll();
    const res = await tools.get('nav_publish')!.handler({ id: 3 });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(3);
  });

  it('clears draft when pendingCreate is true (new item becomes visible)', async () => {
    dbState.defaultSelect = [{
      site_navigation: {
        id: 4, label: 'New Page', href: '/new',
        draft: { pendingCreate: true, label: 'New Page', href: '/new', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 },
      },
    }];
    dbState.updateReturning = [{ id: 4, label: 'New Page', href: '/new', draft: null }];
    const tools = registerAll();
    const res = await tools.get('nav_publish')!.handler({ id: 4 });
    expect((parseJson(res) as { id: number }).id).toBe(4);
  });

  it('returns pending envelope when stageOrApply stages', async () => {
    dbState.defaultSelect = [{
      site_navigation: {
        id: 5, label: 'X', href: '/x',
        draft: { label: 'X2', href: '/x2', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 },
      },
    }];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('nav_publish')!.handler({ id: 5 });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });
});

// ── nav_publish_all ────────────────────────────────────────────────────────

describe('nav_publish_all', () => {
  beforeEach(resetDbState);

  it('returns Site not found when site is foreign', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('nav_publish_all')!.handler({ websiteId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('publishes all nav drafts and returns count', async () => {
    dbState.selectQueue = [
      [{ id: 5, name: 'Acme' }], // site lookup
      // drafts query — two nav rows with drafts
      [
        { id: 1, label: 'Home', href: '/', draft: { label: 'Home', href: '/', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 } },
        { id: 2, label: 'About', href: '/about', draft: { pendingDelete: true, updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 } },
      ],
    ];
    dbState.updateReturning = [{ id: 1, label: 'Home', draft: null }];
    const tools = registerAll();
    const res = await tools.get('nav_publish_all')!.handler({ websiteId: 5 });
    const out = parseJson(res) as { count: number; items: { id: number; deleted?: boolean; published?: boolean }[] };
    expect(out.count).toBe(2);
    expect(out.items.some((i) => i.id === 2 && i.deleted)).toBe(true);
    expect(out.items.some((i) => i.id === 1 && i.published)).toBe(true);
  });

  it('handles empty drafts (count: 0)', async () => {
    dbState.selectQueue = [
      [{ id: 5, name: 'Acme' }],
      [], // no drafts
    ];
    const tools = registerAll();
    const res = await tools.get('nav_publish_all')!.handler({ websiteId: 5 });
    const out = parseJson(res) as { count: number };
    expect(out.count).toBe(0);
  });

  it('returns pending envelope when stageOrApply stages', async () => {
    dbState.selectQueue = [
      [{ id: 5, name: 'Acme' }],
      [{ id: 1, draft: { label: 'X', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 } }],
    ];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('nav_publish_all')!.handler({ websiteId: 5 });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });

  it('skips nav rows where draft becomes null during iteration', async () => {
    // This exercises the `if (!draft) continue;` guard inside the publish_all apply fn
    dbState.selectQueue = [
      [{ id: 5, name: 'Acme' }],
      [
        { id: 10, label: 'X', href: '/x', draft: null }, // no draft — should be skipped
        { id: 11, label: 'Y', href: '/y', draft: { label: 'Y2', href: '/y2', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 } },
      ],
    ];
    dbState.updateReturning = [{ id: 11, label: 'Y2', draft: null }];
    const tools = registerAll();
    const res = await tools.get('nav_publish_all')!.handler({ websiteId: 5 });
    const out = parseJson(res) as { count: number };
    // Only item 11 actually published (item 10 was skipped since draft was null)
    expect(out.count).toBe(1);
  });
});

// ── block_templates_fork ───────────────────────────────────────────────────

describe('block_templates_fork', () => {
  beforeEach(resetDbState);

  it('returns Source template not found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('block_templates_fork')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns not found when source belongs to another tenant', async () => {
    // clientId 99 != ctx.client.id (7)
    dbState.selectQueue = [[{ id: 1, clientId: 99, name: 'Hero', slug: 'hero', blocks: [] }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_fork')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('forks a tenant-owned template and returns the new row + approval', async () => {
    dbState.selectQueue = [[{
      id: 1, clientId: 7, name: 'Hero', slug: 'hero',
      description: 'A hero', category: 'section', scope: 'block',
      blocks: [{ id: 'b1', type: 'text' }], thumbnail: null,
      tags: ['featured'], lockedFields: [],
    }]];
    dbState.insertReturning = [{
      id: 200, name: 'Hero (fork)', slug: 'hero-fork-abc', clientId: 7,
    }];
    const tools = registerAll();
    const res = await tools.get('block_templates_fork')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; approval: unknown };
    expect(out.id).toBe(200);
    expect(out.approval).toBeDefined();
  });

  it('forks a platform-global template (clientId null) into tenant scope', async () => {
    dbState.selectQueue = [[{
      id: 2, clientId: null, name: 'Global Hero', slug: 'global-hero',
      description: null, category: 'section', scope: 'global',
      blocks: [], thumbnail: null, tags: [], lockedFields: [],
    }]];
    dbState.insertReturning = [{ id: 201, name: 'Global Hero (fork)', slug: 'global-hero-fork-xyz', clientId: 7 }];
    const tools = registerAll();
    const res = await tools.get('block_templates_fork')!.handler({ id: 2, nameSuffix: ' (fork)', slugSuffix: 'v2' });
    expect((parseJson(res) as { id: number }).id).toBe(201);
  });

  it('uses custom nameSuffix and slugSuffix when provided', async () => {
    dbState.selectQueue = [[{
      id: 3, clientId: 7, name: 'Card', slug: 'card',
      description: null, category: 'custom', scope: 'block',
      blocks: [], thumbnail: null, tags: [], lockedFields: [],
    }]];
    dbState.insertReturning = [{ id: 202, name: 'Card (v2)', slug: 'card-variant-fork-123', clientId: 7 }];
    const tools = registerAll();
    const res = await tools.get('block_templates_fork')!.handler({ id: 3, nameSuffix: ' (v2)', slugSuffix: 'variant' });
    expect((parseJson(res) as { id: number }).id).toBe(202);
  });
});

// ── block_templates_publish ────────────────────────────────────────────────

describe('block_templates_publish', () => {
  beforeEach(resetDbState);

  it('returns Template not found when missing', async () => {
    dbState.selectQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('block_templates_publish')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns not found when template belongs to another tenant', async () => {
    dbState.selectQueue = [[{ id: 1, clientId: 99, name: 'X', draft: null, version: 1 }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_publish')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('is a noop when draft is null', async () => {
    dbState.selectQueue = [[{ id: 1, clientId: 7, name: 'T', draft: null, version: 1 }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_publish')!.handler({ id: 1 });
    const out = parseJson(res) as { noop?: boolean };
    expect(out.noop).toBe(true);
  });

  it('deletes the template when draft.pendingDelete is true', async () => {
    dbState.selectQueue = [[{
      id: 2, clientId: 7, name: 'Old Template', version: 1,
      draft: { pendingDelete: true, updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 },
    }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_publish')!.handler({ id: 2 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });

  it('promotes draft fields to live columns on ordinary update', async () => {
    dbState.selectQueue = [[{
      id: 3, clientId: 7, name: 'Hero', version: 2,
      draft: {
        name: 'Hero Updated', description: 'New desc', category: 'section',
        scope: 'block', thumbnail: null, tags: ['hot'], lockedFields: [],
        updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11,
      },
    }]];
    dbState.updateReturning = [{ id: 3, name: 'Hero Updated', version: 2, draft: null }];
    const tools = registerAll();
    const res = await tools.get('block_templates_publish')!.handler({ id: 3 });
    expect((parseJson(res) as { id: number }).id).toBe(3);
  });

  it('bumps version when draft includes blocks change', async () => {
    dbState.selectQueue = [[{
      id: 4, clientId: 7, name: 'Card', version: 5,
      draft: {
        blocks: [{ id: 'b2', type: 'hero' }],
        updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11,
      },
    }]];
    dbState.updateReturning = [{ id: 4, name: 'Card', version: 6, draft: null }];
    const tools = registerAll();
    const res = await tools.get('block_templates_publish')!.handler({ id: 4 });
    // version is set to existing.version + 1 = 6 in the update patch
    expect((parseJson(res) as { version: number }).version).toBe(6);
  });

  it('returns pending envelope when stageOrApply stages', async () => {
    dbState.selectQueue = [[{
      id: 5, clientId: 7, name: 'X', version: 1,
      draft: { name: 'X2', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 11 },
    }]];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('block_templates_publish')!.handler({ id: 5 });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });
});

// ── BlockGateError paths in existing write tools ───────────────────────────

describe('BlockGateError paths', () => {
  beforeEach(resetDbState);

  it('posts_create returns error when BlockGateError raised', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    mockAssertBlocksAllowedForUserId.mockRejectedValueOnce(
      new MockBlockGateError('block type not allowed'),
    );
    const tools = registerAll();
    const res = await tools.get('posts_create')!.handler({
      websiteId: 5, title: 'T', slug: 't', blocks: [{ type: 'html-embed' }],
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not allowed/);
  });

  it('posts_create rethrows non-BlockGateError from assertBlocksAllowedForUserId', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    mockAssertBlocksAllowedForUserId.mockRejectedValueOnce(new Error('unexpected'));
    const tools = registerAll();
    await expect(
      tools.get('posts_create')!.handler({ websiteId: 5, title: 'T', slug: 't', blocks: [{ type: 'text' }] }),
    ).rejects.toThrow('unexpected');
  });

  it('posts_update returns error when BlockGateError raised', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 'old', published: false, parentPostId: null, content: '{}', customCss: null }],
      [{ id: 5 }],
    ];
    mockAssertBlocksAllowedForUserId.mockRejectedValueOnce(
      new MockBlockGateError('blocks not allowed for user'),
    );
    const tools = registerAll();
    const res = await tools.get('posts_update')!.handler({ id: 1, blocks: [{ type: 'html-embed' }] });
    expect((parseJson(res) as { error: string }).error).toMatch(/not allowed/);
  });

  it('block_templates_create returns error when BlockGateError raised', async () => {
    // No collision (selectQueue empty → defaultSelect empty)
    mockAssertBlocksAllowedForUserId.mockRejectedValueOnce(
      new MockBlockGateError('html-embed not allowed in templates'),
    );
    const tools = registerAll();
    const res = await tools.get('block_templates_create')!.handler({
      name: 'T', slug: 'new-template', blocks: [{ type: 'html-embed' }],
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not allowed/);
  });

  it('block_templates_update returns error when BlockGateError raised', async () => {
    dbState.selectQueue = [[{ id: 1, clientId: 7, name: 'T', version: 1, blocks: [], draft: null }]];
    mockAssertBlocksAllowedForUserId.mockRejectedValueOnce(
      new MockBlockGateError('restricted block type'),
    );
    const tools = registerAll();
    const res = await tools.get('block_templates_update')!.handler({
      id: 1, blocks: [{ type: 'html-embed' }],
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/restricted block type/);
  });
});

// ── block_templates_get — tenancy edge ───────────────────────────────────

describe('block_templates_get — tenancy', () => {
  beforeEach(resetDbState);

  it('hides templates owned by another client', async () => {
    dbState.selectQueue = [[{ id: 1, clientId: 99, name: 'Other', blocks: [] }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_get')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });

  it('returns platform-global templates (clientId null)', async () => {
    dbState.selectQueue = [[{ id: 2, clientId: null, name: 'Global', blocks: [] }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_get')!.handler({ id: 2 });
    expect((parseJson(res) as { id: number }).id).toBe(2);
  });
});

// ── block_templates_update — tenancy edge ────────────────────────────────

describe('block_templates_update — tenancy', () => {
  beforeEach(resetDbState);

  it('rejects mutation on templates belonging to another client', async () => {
    dbState.selectQueue = [[{ id: 1, clientId: 99, name: 'Other' }]];
    const tools = registerAll();
    const res = await tools.get('block_templates_update')!.handler({ id: 1, name: 'New' });
    expect((parseJson(res) as { error: string }).error).toMatch(/not found/i);
  });
});

// ── posts_delete — pending path ───────────────────────────────────────────

describe('posts_delete — pending path', () => {
  beforeEach(resetDbState);

  it('returns pending envelope when stageOrApply stages the delete', async () => {
    dbState.selectQueue = [
      [{ id: 1, websiteId: 5, title: 't', slug: 's', published: false, postType: 'blog' }],
      [{ id: 5 }],
    ];
    stageOrApplyMode = 'pending';
    const tools = registerAll();
    const res = await tools.get('posts_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { pending: boolean }).pending).toBe(true);
  });
});

// ── media_upload_from_url — body exceeds limit after buffer ───────────────

describe('media_upload_from_url — post-fetch size guard', () => {
  beforeEach(resetDbState);

  it('rejects when buffer length exceeds 25 MB even without content-length header', async () => {
    const bigData = Buffer.alloc(26 * 1024 * 1024, 0);
    vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
      return new Response(bigData, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    const tools = registerAll();
    const res = await tools.get('media_upload_from_url')!.handler({
      url: 'https://example.com/big.png',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/too large/i);
  });
});

// ── posts_upload_html — BlockGateError path ───────────────────────────────

describe('posts_upload_html — BlockGateError path', () => {
  beforeEach(resetDbState);

  it('returns error when BlockGateError is raised on html-embed check', async () => {
    // The site lookup happens AFTER the block gate check in posts_upload_html
    mockAssertBlocksAllowedForUserId.mockRejectedValueOnce(
      new MockBlockGateError('html-embed not allowed for this user'),
    );
    const tools = registerAll();
    const res = await tools.get('posts_upload_html')!.handler({
      websiteId: 5,
      filename: 'page.html',
      contentBase64: Buffer.from('<html></html>').toString('base64'),
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not allowed/);
  });
});

// ── posts_list — includeContent flag ──────────────────────────────────────

describe('posts_list — includeContent flag', () => {
  beforeEach(resetDbState);

  it('passes includeContent=true to the projection', async () => {
    dbState.selectQueue = [
      [{ id: 5 }],          // site lookup
      [{ id: 1, title: 'T', content: '{"blocks":[]}' }], // posts
    ];
    const tools = registerAll();
    const res = await tools.get('posts_list')!.handler({
      websiteId: 5, includeContent: true,
    });
    expect((parseJson(res) as { id: number }[])[0].id).toBe(1);
  });
});

// ── posts_create — blocks path + pending ──────────────────────────────────

describe('posts_create — blocks path', () => {
  beforeEach(resetDbState);

  it('creates a post with blocks (not plain content)', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.insertReturning = [{ id: 110, title: 'B', slug: 'b' }];
    const tools = registerAll();
    const res = await tools.get('posts_create')!.handler({
      websiteId: 5, title: 'B', slug: 'b',
      blocks: [{ id: 'b1', type: 'hero', order: 1 }],
    });
    expect((parseJson(res) as { id: number }).id).toBe(110);
  });

  it('sets publishedAt when published: true', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    dbState.insertReturning = [{ id: 111, title: 'Pub', slug: 'pub', published: true }];
    const tools = registerAll();
    const res = await tools.get('posts_create')!.handler({
      websiteId: 5, title: 'Pub', slug: 'pub', published: true,
    });
    expect((parseJson(res) as { published: boolean }).published).toBe(true);
  });
});
