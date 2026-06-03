// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/email.ts.
 *
 * `registerEmailTools(server, ctx)` registers ~14 MCP tools that gate writes on
 * scope + service subscription, and route mutations through stageOrApply for
 * keys that require approval. We mock the db chain, the stage-or-apply helper,
 * the email render/send helpers, and other collaborators so each tool handler
 * can be exercised in isolation with capture-and-assert tests.
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
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/email', () => ({
  resend: {},
  renderBlocksToEmailHtml: vi.fn((blocks: unknown[]) => `<html>rendered-${(blocks ?? []).length}</html>`),
  buildCampaignHtml: vi.fn((_html: string) => '<html>built</html>'),
  buildUnsubscribeUrl: vi.fn((token: string) => `https://example.com/unsub?t=${token}`),
  generateUnsubscribeToken: vi.fn(() => 'fake-unsub-token'),
}));

vi.mock('@/lib/email/campaign-send', () => ({
  executeCampaignSend: vi.fn(async () => ({ ok: true, sent: 5, skipped: 1 })),
}));

vi.mock('@/lib/google/oauth', () => ({
  revoke: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: vi.fn(async () => null),
}));

vi.mock('@/lib/pm-activity', () => ({
  logCardActivity: vi.fn(),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(),
}));

vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: vi.fn((html: string) => html),
}));

vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: vi.fn(async (html: string) => html),
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async () => 'hashed'),
}));

// stageOrApply mock — defaults to "apply immediately" (pending: false) and runs the
// apply() fn, returning its data. Tests can flip stageState.pending to simulate
// approval-required keys.
const stageState = {
  pending: false,
  pendingId: 42,
  summary: 'stub-summary',
};

vi.mock('@/lib/mcp/pending-changes', () => ({
  stageOrApply: vi.fn(async (opts: { apply: () => Promise<unknown> }) => {
    if (stageState.pending) {
      return { pending: true, pendingId: stageState.pendingId, summary: stageState.summary, status: 'pending' as const };
    }
    const data = await opts.apply();
    return { pending: false as const, data };
  }),
}));

// db mock with chainable proxies and a queue of select rows.
type QueryResult = unknown[];
const dbState: {
  selectRows: QueryResult;
  selectQueue: QueryResult[];
  insertReturning: QueryResult;
  updateReturning: QueryResult;
  deleteError: Error | null;
} = {
  selectRows: [],
  selectQueue: [],
  insertReturning: [{ id: 1 }],
  updateReturning: [{ id: 1 }],
  deleteError: null,
};

function makeChain(rows: QueryResult) {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectRows;
      return makeChain(next);
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => dbState.insertReturning),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => dbState.updateReturning),
          then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(undefined).then(onFulfilled),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        if (dbState.deleteError) throw dbState.deleteError;
        return undefined;
      }),
    })),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  const t = (cols: string[]) => Object.fromEntries(cols.map((c) => [c, col(c)]));
  return {
    emailLists: t(['id', 'clientId', 'name', 'description', 'createdAt', 'updatedAt']),
    emailCampaigns: t([
      'id', 'clientId', 'listId', 'name', 'subject', 'previewText', 'fromName', 'fromEmail', 'replyTo',
      'htmlContent', 'blockContent', 'status', 'scheduledAt', 'sentAt', 'createdBy', 'createdAt', 'updatedAt',
      'totalRecipients', 'totalSent', 'totalOpened', 'totalClicked', 'totalBounced', 'totalUnsubscribed',
    ]),
    emailSubscribers: t(['id', 'listId', 'email', 'name', 'status', 'metadata', 'unsubscribeToken', 'subscribedAt', 'unsubscribedAt']),
    emailCampaignSends: t(['campaignId', 'subscriberId']),
    emailTemplates: t([
      'id', 'clientId', 'name', 'description', 'category', 'subject', 'thumbnailUrl',
      'isGlobal', 'usageCount', 'htmlContent', 'blockContent', 'createdBy', 'createdAt', 'updatedAt',
    ]),
    emailSegments: t(['id', 'clientId', 'name', 'description', 'matchType', 'rules', 'createdAt', 'updatedAt']),
    // Remaining schema imports — not exercised by the email tools but pulled in by the source file.
    projects: t(['id']), kanbanCards: t(['id']), kanbanColumns: t(['id']), kanbanLabels: t(['id']),
    kanbanCardLabels: t(['id']), kanbanCardChecklistItems: t(['id']), kanbanCardAssignees: t(['id']),
    kanbanCardWatchers: t(['id']), kanbanCardDependencies: t(['id']), supportTickets: t(['id']),
    ticketMessages: t(['id']), crmContacts: t(['id']), crmCompanies: t(['id']), crmDeals: t(['id']),
    crmPipelines: t(['id']), crmPipelineStages: t(['id']), posts: t(['id']), media: t(['id']),
    clientWebsites: t(['id']), pitchDecks: t(['id']), brandingProfiles: t(['id']), surveys: t(['id']),
    surveyResponses: t(['id']), bookingPages: t(['id']), bookings: t(['id']), sprints: t(['id']),
    crmActivities: t(['id']), categories: t(['id']), tags: t(['id']), postCategories: t(['id']),
    postTags: t(['id']), automationRules: t(['id']), clientMembers: t(['id']), users: t(['id']),
    crmProposals: t(['id']), crmContracts: t(['id']), crmContractSigners: t(['id']), invoices: t(['id']),
    invoiceItems: t(['id']), serviceRequests: t(['id']), suggestedProjectRequests: t(['id']),
    suggestedProjects: t(['id']), services: t(['id']), aiConversations: t(['id']), aiMessages: t(['id']),
    kanbanCardComments: t(['id']), kanbanCardTimeLogs: t(['id']), kanbanCardFiles: t(['id']),
    kanbanCardArtifacts: t(['id']), crmDealArtifacts: t(['id']), siteNavigation: t(['id']),
    postRevisions: t(['id']), blockTemplates: t(['id']), blockTemplateUsages: t(['id']),
    giftCertificates: t(['id']), crmCustomFields: t(['id']), crmCustomFieldValues: t(['id']),
    crmSavedViews: t(['id']), crmScoringRules: t(['id']), websiteDomains: t(['id']),
    websiteEnvironments: t(['id']), websiteEnvVars: t(['id']), clients: t(['id']),
    aiCreditBalances: t(['id']), aiCreditLedger: t(['id']), hostedSites: t(['id']),
    googleWorkspaceUserConnections: t(['id']),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  or: vi.fn((...args: unknown[]) => ({ _or: args })),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

// Projections — the email registrar imports campaignProjection.
vi.mock('@/lib/mcp/projections', () => ({
  postProjection: vi.fn(() => ({ id: { name: 'id' } })),
  deckProjection: vi.fn(() => ({ id: { name: 'id' } })),
  campaignProjection: vi.fn((_include?: boolean) => ({ id: { name: 'id' } })),
}));

vi.mock('@/lib/mcp/blocks-schema', () => ({
  BLOCKS_SCHEMA_REFERENCE: 'fake-schema-ref',
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerEmailTools } from '@/lib/mcp/tools/email';

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

function registerAll(scopes: string[] = ['email:read', 'email:write', 'email:send']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerEmailTools(stub as any, ctxFor(scopes));
  return tools;
}

beforeEach(() => {
  dbState.selectRows = [];
  dbState.selectQueue = [];
  dbState.insertReturning = [{ id: 1 }];
  dbState.updateReturning = [{ id: 1 }];
  dbState.deleteError = null;
  stageState.pending = false;
});

// ── registration ──────────────────────────────────────────────────────────

describe('registerEmailTools — registration', () => {
  it('registers the canonical read tools when scopes include email:read', () => {
    const tools = registerAll();
    for (const name of [
      'email_lists',
      'email_campaigns_list',
      'email_subscribers_list',
      'email_templates_list',
      'email_segments_list',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers the canonical write tools when scopes include email:write', () => {
    const tools = registerAll();
    for (const name of [
      'email_campaigns_create',
      'email_campaigns_update',
      'email_campaigns_delete',
      'email_campaigns_schedule',
      'email_lists_create',
      'email_lists_update',
      'email_lists_delete',
      'email_subscribers_add',
      'email_subscribers_update',
      'email_subscribers_remove',
      'email_templates_create',
      'email_segments_create',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers email_campaigns_send only when email:send scope is granted', () => {
    expect(registerAll(['email:read', 'email:write']).has('email_campaigns_send')).toBe(false);
    expect(registerAll(['email:send']).has('email_campaigns_send')).toBe(true);
  });

  it('skips write tools when only read scope is present', () => {
    const tools = registerAll(['email:read']);
    expect(tools.has('email_lists')).toBe(true);
    expect(tools.has('email_lists_create')).toBe(false);
    expect(tools.has('email_campaigns_create')).toBe(false);
  });

  it('registers nothing when no email scopes are granted', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('every registered tool has title + description + inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name}.title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name}.description`).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── email_lists ──────────────────────────────────────────────────────────

describe('email_lists', () => {
  it('returns the lists for the client', async () => {
    dbState.selectRows = [{ id: 1, name: 'Newsletter' }, { id: 2, name: 'Promo' }];
    const tools = registerAll();
    const res = await tools.get('email_lists')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1, name: 'Newsletter' }, { id: 2, name: 'Promo' }]);
  });
});

// ── email_lists_create / update / delete ─────────────────────────────────

describe('email_lists_create', () => {
  it('inserts a list and returns the new row', async () => {
    dbState.insertReturning = [{ id: 5, name: 'New List' }];
    const tools = registerAll();
    const res = await tools.get('email_lists_create')!.handler({ name: '  New List  ', description: '  desc ' });
    expect((parseJson(res) as { id: number }).id).toBe(5);
  });

  it('returns serviceDenied when subscription gate fails', async () => {
    const portalAuth = await import('@/lib/portal-auth');
    (portalAuth.hasServiceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const tools = registerAll();
    const res = await tools.get('email_lists_create')!.handler({ name: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/email subscription/i);
  });
});

describe('email_lists_update', () => {
  it('returns not-found if list does not exist', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_lists_update')!.handler({ id: 99, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/List not found/);
  });

  it('updates the list when found', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.updateReturning = [{ id: 1, name: 'Renamed' }];
    const tools = registerAll();
    const res = await tools.get('email_lists_update')!.handler({ id: 1, name: 'Renamed', description: null });
    expect((parseJson(res) as { id: number; name: string }).name).toBe('Renamed');
  });
});

describe('email_lists_delete', () => {
  it('returns not-found if list missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_lists_delete')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/List not found/);
  });

  it('returns success on hit', async () => {
    dbState.selectQueue = [[{ id: 3 }]];
    const tools = registerAll();
    const res = await tools.get('email_lists_delete')!.handler({ id: 3 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out).toEqual({ success: true, id: 3 });
  });

  it('surfaces FK violation as error envelope', async () => {
    dbState.selectQueue = [[{ id: 3 }]];
    dbState.deleteError = new Error('foreign key violation');
    const tools = registerAll();
    const res = await tools.get('email_lists_delete')!.handler({ id: 3 });
    expect((parseJson(res) as { error: string }).error).toMatch(/foreign key/);
  });
});

// ── email_subscribers ────────────────────────────────────────────────────

describe('email_subscribers_list', () => {
  it('returns not-found when the list is missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_list')!.handler({ listId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/List not found/);
  });

  it('returns subscribers when list exists', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],                                          // list lookup
      [{ id: 100, email: 'a@x.com' }, { id: 101, email: 'b@x.com' }], // subscribers
    ];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_list')!.handler({ listId: 1, status: 'active', search: 'a' });
    expect(parseJson(res)).toEqual([{ id: 100, email: 'a@x.com' }, { id: 101, email: 'b@x.com' }]);
  });
});

describe('email_subscribers_add', () => {
  it('returns not-found if list missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_add')!.handler({ listId: 99, email: 'x@y.com' });
    expect((parseJson(res) as { error: string }).error).toMatch(/List not found/);
  });

  it('inserts a new subscriber with normalized email and unsubscribe token', async () => {
    dbState.selectQueue = [
      [{ id: 1 }], // list
      [],          // no existing subscriber
    ];
    dbState.insertReturning = [{ id: 10, email: 'foo@bar.com' }];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_add')!.handler({
      listId: 1, email: '  Foo@Bar.com  ', name: 'Foo',
    });
    expect((parseJson(res) as { id: number; email: string }).email).toBe('foo@bar.com');
  });

  it('returns existing row when no patch fields supplied', async () => {
    const existing = { id: 7, email: 'x@y.com', name: 'Existing', status: 'active' };
    dbState.selectQueue = [
      [{ id: 1 }],
      [existing],
    ];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_add')!.handler({ listId: 1, email: 'x@y.com' });
    expect(parseJson(res)).toEqual(existing);
  });

  it('updates existing subscriber when patch fields are supplied', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],
      [{ id: 7, email: 'x@y.com', status: 'unsubscribed' }],
    ];
    dbState.updateReturning = [{ id: 7, email: 'x@y.com', name: 'New', status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_add')!.handler({
      listId: 1, email: 'x@y.com', name: 'New', status: 'active',
    });
    expect((parseJson(res) as { name: string }).name).toBe('New');
  });
});

describe('email_subscribers_update', () => {
  it('returns not-found when subscriber missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_update')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Subscriber not found/);
  });

  it('sets unsubscribedAt when status flips to unsubscribed', async () => {
    dbState.selectQueue = [[{ id: 1, listId: 1, status: 'active' }]];
    dbState.updateReturning = [{ id: 1, status: 'unsubscribed' }];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_update')!.handler({ id: 1, status: 'unsubscribed' });
    expect((parseJson(res) as { status: string }).status).toBe('unsubscribed');
  });

  it('updates name + metadata', async () => {
    dbState.selectQueue = [[{ id: 1, listId: 1, status: 'active' }]];
    dbState.updateReturning = [{ id: 1, name: 'Updated' }];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_update')!.handler({ id: 1, name: 'Updated', metadata: { src: 'web' } });
    expect((parseJson(res) as { name: string }).name).toBe('Updated');
  });
});

describe('email_subscribers_remove', () => {
  it('returns not-found when subscriber missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_remove')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Subscriber not found/);
  });

  it('soft-deletes by default (marks unsubscribed)', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_remove')!.handler({ id: 5 });
    const out = parseJson(res) as { success: boolean; mode: string };
    expect(out).toEqual({ success: true, id: 5, mode: 'soft' });
  });

  it('hard-deletes when hardDelete=true', async () => {
    dbState.selectQueue = [[{ id: 5 }]];
    const tools = registerAll();
    const res = await tools.get('email_subscribers_remove')!.handler({ id: 5, hardDelete: true });
    const out = parseJson(res) as { success: boolean; mode: string };
    expect(out.mode).toBe('hard');
  });
});

// ── email_campaigns_list ────────────────────────────────────────────────

describe('email_campaigns_list', () => {
  it('returns campaign list', async () => {
    dbState.selectRows = [{ id: 1, name: 'C1' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_list')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1, name: 'C1' }]);
  });

  it('passes includeContent through to the projection', async () => {
    const proj = await import('@/lib/mcp/projections');
    (proj.campaignProjection as ReturnType<typeof vi.fn>).mockClear();
    dbState.selectRows = [];
    const tools = registerAll();
    await tools.get('email_campaigns_list')!.handler({ status: 'draft', includeContent: true });
    expect((proj.campaignProjection as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(true);
  });
});

// ── email_campaigns_create ──────────────────────────────────────────────

describe('email_campaigns_create', () => {
  const baseArgs = {
    name: 'My Campaign',
    subject: 'Hello',
    listId: 1,
    fromName: 'Acme',
    fromEmail: 'hi@acme.com',
  };

  it('returns not-found when list missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_create')!.handler({ ...baseArgs, htmlContent: '<p>Hi</p>' });
    expect((parseJson(res) as { error: string }).error).toMatch(/List not found/);
  });

  it('inserts using provided htmlContent', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.insertReturning = [{ id: 50, name: 'My Campaign' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_create')!.handler({ ...baseArgs, htmlContent: '<p>Hello</p>' });
    expect((parseJson(res) as { id: number }).id).toBe(50);
  });

  it('renders blocks to HTML when blocks supplied', async () => {
    const email = await import('@/lib/email');
    (email.renderBlocksToEmailHtml as ReturnType<typeof vi.fn>).mockClear();
    dbState.selectQueue = [[{ id: 1 }]];
    dbState.insertReturning = [{ id: 51 }];
    const tools = registerAll();
    await tools.get('email_campaigns_create')!.handler({
      ...baseArgs,
      blocks: [{ id: 'b1', type: 'text', content: 'Hi' }],
    });
    expect(email.renderBlocksToEmailHtml).toHaveBeenCalled();
  });

  it('throws (and surfaces) when neither html nor blocks supplied', async () => {
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll();
    await expect(tools.get('email_campaigns_create')!.handler({ ...baseArgs })).rejects.toThrow(
      /htmlContent or non-empty blocks/,
    );
  });

  it('returns pending envelope when stageOrApply stages instead of applying', async () => {
    stageState.pending = true;
    dbState.selectQueue = [[{ id: 1 }]];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_create')!.handler({ ...baseArgs, htmlContent: '<p>Hi</p>' });
    const out = parseJson(res) as { pending: boolean; pendingId: number; status: string };
    expect(out.pending).toBe(true);
    expect(out.pendingId).toBe(42);
    expect(out.status).toBe('pending');
  });
});

// ── email_campaigns_send ────────────────────────────────────────────────

describe('email_campaigns_send', () => {
  it('returns not-found when campaign missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_send')!.handler({ id: 999 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Campaign not found/);
  });

  it('refuses to resend a campaign that is already sent', async () => {
    dbState.selectRows = [{ id: 1, status: 'sent', listId: 1, name: 'X', subject: 'S', fromEmail: 'a@b.com' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_send')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/already sent/);
  });

  it('refuses to send a campaign in sending status', async () => {
    dbState.selectRows = [{ id: 1, status: 'sending', listId: 1, name: 'X', subject: 'S', fromEmail: 'a@b.com' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_send')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/already sending/);
  });

  it('returns dryRun summary without sending', async () => {
    dbState.selectQueue = [
      [{ id: 1, status: 'draft', listId: 2, name: 'C', subject: 'S', fromEmail: 'a@b.com' }],
      [{ subscriberId: 100 }],                            // already-sent rows
      [{ id: 100 }, { id: 101 }, { id: 102 }],            // active subscribers
    ];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_send')!.handler({ id: 1, dryRun: true });
    const out = parseJson(res) as {
      dryRun: boolean; willSend: number; totalActive: number; alreadySent: number;
    };
    expect(out.dryRun).toBe(true);
    expect(out.totalActive).toBe(3);
    expect(out.alreadySent).toBe(1);
    expect(out.willSend).toBe(2);
  });

  it('dispatches via executeCampaignSend on real send', async () => {
    dbState.selectRows = [{ id: 1, status: 'draft', listId: 2, name: 'C', subject: 'S', fromEmail: 'a@b.com' }];
    const campaign = await import('@/lib/email/campaign-send');
    (campaign.executeCampaignSend as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    const res = await tools.get('email_campaigns_send')!.handler({ id: 1 });
    expect(campaign.executeCampaignSend).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'C' }));
    expect((parseJson(res) as { ok: boolean }).ok).toBe(true);
  });
});

// ── email_campaigns_schedule ────────────────────────────────────────────

describe('email_campaigns_schedule', () => {
  it('returns not-found when campaign missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_schedule')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Campaign not found/);
  });

  it('unschedules a scheduled campaign', async () => {
    dbState.selectRows = [{ id: 1, status: 'scheduled' }];
    dbState.updateReturning = [{ id: 1, status: 'draft' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_schedule')!.handler({ id: 1, unschedule: true });
    expect((parseJson(res) as { status: string }).status).toBe('draft');
  });

  it('refuses to unschedule when campaign is not scheduled', async () => {
    dbState.selectRows = [{ id: 1, status: 'draft' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_schedule')!.handler({ id: 1, unschedule: true });
    expect((parseJson(res) as { error: string }).error).toMatch(/Cannot unschedule/);
  });

  it('requires scheduledAt when not unscheduling', async () => {
    dbState.selectRows = [{ id: 1, status: 'draft' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_schedule')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/scheduledAt required/);
  });

  it('rejects past scheduledAt', async () => {
    dbState.selectRows = [{ id: 1, status: 'draft' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_schedule')!.handler({
      id: 1, scheduledAt: '2000-01-01T00:00:00Z',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/must be in the future/);
  });

  it('rejects scheduling when campaign is sent', async () => {
    dbState.selectRows = [{ id: 1, status: 'sent' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_schedule')!.handler({
      id: 1, scheduledAt: '2099-01-01T00:00:00Z',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Cannot schedule/);
  });

  it('schedules a future send', async () => {
    dbState.selectRows = [{ id: 1, status: 'draft' }];
    dbState.updateReturning = [{ id: 1, status: 'scheduled' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_schedule')!.handler({
      id: 1, scheduledAt: '2099-01-01T00:00:00Z',
    });
    expect((parseJson(res) as { status: string }).status).toBe('scheduled');
  });
});

// ── email_campaigns_update ──────────────────────────────────────────────

describe('email_campaigns_update', () => {
  it('returns not-found when campaign missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_update')!.handler({ id: 99, name: 'X' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Campaign not found/);
  });

  it('refuses to edit non-draft campaigns', async () => {
    dbState.selectRows = [{ id: 1, status: 'sending', listId: 1, name: 'X', subject: 'S' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_update')!.handler({ id: 1, name: 'New' });
    expect((parseJson(res) as { error: string }).error).toMatch(/Cannot edit/);
  });

  it('rejects when listId switch points to a list owned by another tenant', async () => {
    dbState.selectQueue = [
      [{ id: 1, status: 'draft', listId: 5, name: 'X', subject: 'S' }],
      [],                                                  // target list lookup empty
    ];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_update')!.handler({ id: 1, listId: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Target list not found/);
  });

  it('renders supplied blocks to HTML during update', async () => {
    dbState.selectQueue = [[{ id: 1, status: 'draft', listId: 5, name: 'X', subject: 'S' }]];
    dbState.updateReturning = [{ id: 1, name: 'New' }];
    const email = await import('@/lib/email');
    (email.renderBlocksToEmailHtml as ReturnType<typeof vi.fn>).mockClear();
    const tools = registerAll();
    await tools.get('email_campaigns_update')!.handler({
      id: 1, blocks: [{ id: 'b', type: 'text', content: 'Hi' }],
    });
    expect(email.renderBlocksToEmailHtml).toHaveBeenCalled();
  });
});

// ── email_campaigns_delete ──────────────────────────────────────────────

describe('email_campaigns_delete', () => {
  it('returns not-found when campaign missing', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_delete')!.handler({ id: 99 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Campaign not found/);
  });

  it('refuses to delete a sent campaign', async () => {
    dbState.selectRows = [{ id: 1, status: 'sent', name: 'X', subject: 'S' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Cannot delete/);
  });

  it('refuses to delete a sending campaign', async () => {
    dbState.selectRows = [{ id: 1, status: 'sending', name: 'X', subject: 'S' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_delete')!.handler({ id: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Cannot delete/);
  });

  it('deletes a draft campaign', async () => {
    dbState.selectRows = [{ id: 1, status: 'draft', name: 'X', subject: 'S' }];
    const tools = registerAll();
    const res = await tools.get('email_campaigns_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out).toEqual({ success: true, id: 1 });
  });
});

// ── email_templates ─────────────────────────────────────────────────────

describe('email_templates_list', () => {
  it('returns templates', async () => {
    dbState.selectRows = [{ id: 1, name: 'T', usageCount: 3 }];
    const tools = registerAll();
    const res = await tools.get('email_templates_list')!.handler({ category: 'welcome' });
    expect(parseJson(res)).toEqual([{ id: 1, name: 'T', usageCount: 3 }]);
  });

  it('returns templates without category filter', async () => {
    dbState.selectRows = [];
    const tools = registerAll();
    const res = await tools.get('email_templates_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });
});

describe('email_templates_create', () => {
  it('rejects when neither html nor blocks are supplied', async () => {
    const tools = registerAll();
    const res = await tools.get('email_templates_create')!.handler({ name: 'T' });
    expect((parseJson(res) as { error: string }).error).toMatch(/htmlContent or non-empty blocks/);
  });

  it('inserts a template from htmlContent', async () => {
    dbState.insertReturning = [{ id: 9, name: 'T', category: 'newsletter' }];
    const tools = registerAll();
    const res = await tools.get('email_templates_create')!.handler({
      name: 'T', category: 'newsletter', subject: 'S', htmlContent: '<p>hi</p>',
    });
    expect((parseJson(res) as { id: number }).id).toBe(9);
  });

  it('renders blocks for template body when provided', async () => {
    const email = await import('@/lib/email');
    (email.renderBlocksToEmailHtml as ReturnType<typeof vi.fn>).mockClear();
    dbState.insertReturning = [{ id: 10 }];
    const tools = registerAll();
    await tools.get('email_templates_create')!.handler({
      name: 'T', blocks: [{ id: 'b', type: 'text', content: 'Hi' }],
    });
    expect(email.renderBlocksToEmailHtml).toHaveBeenCalled();
  });
});

// ── email_segments ─────────────────────────────────────────────────────

describe('email_segments_list', () => {
  it('returns segments', async () => {
    dbState.selectRows = [{ id: 1, name: 'Engaged', matchType: 'all', rules: [] }];
    const tools = registerAll();
    const res = await tools.get('email_segments_list')!.handler({});
    expect(parseJson(res)).toEqual([{ id: 1, name: 'Engaged', matchType: 'all', rules: [] }]);
  });
});

describe('email_segments_create', () => {
  it('inserts with defaults (matchType=all)', async () => {
    dbState.insertReturning = [{ id: 4, name: 'Seg', matchType: 'all' }];
    const tools = registerAll();
    const res = await tools.get('email_segments_create')!.handler({
      name: 'Seg',
      rules: [{ field: 'status', operator: 'eq', value: 'active' }],
    });
    expect((parseJson(res) as { matchType: string }).matchType).toBe('all');
  });

  it('respects explicit matchType=any', async () => {
    dbState.insertReturning = [{ id: 5, name: 'AnySeg', matchType: 'any' }];
    const tools = registerAll();
    const res = await tools.get('email_segments_create')!.handler({
      name: 'AnySeg', matchType: 'any', rules: [],
    });
    expect((parseJson(res) as { matchType: string }).matchType).toBe('any');
  });
});
