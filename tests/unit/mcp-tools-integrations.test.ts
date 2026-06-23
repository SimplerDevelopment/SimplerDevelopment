// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/integrations.ts.
 *
 * The module exports a single function — `registerIntegrationsTools(server, ctx)` —
 * that registers `integrations_list` (gated by `integrations:read`) and
 * `integrations_revoke` (gated by `integrations:write`). Both surfaces wrap
 * the Google Workspace tenant + per-user connection state.
 *
 * Strategy mirrors mcp-tools-bookings.test.ts: stub `db`, mock schema +
 * drizzle helpers, mock auth/google collaborators, and pass in a fake
 * McpServer that captures `{ name -> handler }` so each handler can be invoked
 * directly. Tests cover happy paths, scope denial, tenant absence, provider
 * revoke failure, idempotent already-disconnected, and unsupported provider.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const dbState: {
  selectQueue: Row[][];
  selectDefault: Row[];
  capturedUpdatePatch: Row | null;
  capturedUpdateCalls: number;
} = {
  selectQueue: [],
  selectDefault: [],
  capturedUpdatePatch: null,
  capturedUpdateCalls: 0,
};

function makeChain(rows: Row[]) {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: Row[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
      return makeChain(next);
    }),
    update: vi.fn(() => ({
      set: vi.fn((patch: Row) => {
        dbState.capturedUpdatePatch = patch;
        dbState.capturedUpdateCalls += 1;
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => []),
      })),
    })),
  },
}));

// schema objects — opaque column-like refs are fine.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return new Proxy({
    projects: make('id', 'clientId'),
    kanbanCards: make('id'),
    kanbanColumns: make('id'),
    kanbanLabels: make('id'),
    kanbanCardLabels: make('id'),
    kanbanCardChecklistItems: make('id'),
    kanbanCardAssignees: make('id'),
    kanbanCardWatchers: make('id'),
    kanbanCardDependencies: make('id'),
    supportTickets: make('id'),
    ticketMessages: make('id'),
    crmContacts: make('id'),
    crmCompanies: make('id'),
    crmDeals: make('id'),
    crmPipelines: make('id'),
    crmPipelineStages: make('id'),
    posts: make('id'),
    media: make('id'),
    clientWebsites: make('id'),
    emailLists: make('id'),
    emailCampaigns: make('id'),
    pitchDecks: make('id'),
    brandingProfiles: make('id'),
    emailSubscribers: make('id'),
    emailCampaignSends: make('id'),
    surveys: make('id'),
    surveyResponses: make('id'),
    bookingPages: make('id'),
    bookings: make('id'),
    sprints: make('id'),
    crmActivities: make('id'),
    categories: make('id'),
    tags: make('id'),
    postCategories: make('id'),
    postTags: make('id'),
    automationRules: make('id'),
    clientMembers: make('id'),
    users: make('id'),
    crmProposals: make('id'),
    crmContracts: make('id'),
    crmContractSigners: make('id'),
    invoices: make('id'),
    invoiceItems: make('id'),
    serviceRequests: make('id'),
    suggestedProjectRequests: make('id'),
    suggestedProjects: make('id'),
    services: make('id'),
    aiConversations: make('id'),
    aiMessages: make('id'),
    kanbanCardComments: make('id'),
    kanbanCardTimeLogs: make('id'),
    kanbanCardFiles: make('id'),
    kanbanCardArtifacts: make('id'),
    crmDealArtifacts: make('id'),
    siteNavigation: make('id'),
    postRevisions: make('id'),
    blockTemplates: make('id'),
    blockTemplateUsages: make('id'),
    emailTemplates: make('id'),
    emailSegments: make('id'),
    giftCertificates: make('id'),
    crmCustomFields: make('id'),
    crmCustomFieldValues: make('id'),
    crmSavedViews: make('id'),
    crmScoringRules: make('id'),
    websiteDomains: make('id'),
    websiteEnvironments: make('id'),
    websiteEnvVars: make('id'),
    clients: make('id'),
    aiCreditBalances: make('id'),
    aiCreditLedger: make('id'),
    hostedSites: make('id'),
    googleWorkspaceUserConnections: make(
      'id',
      'clientId',
      'userId',
      'googleAccountEmail',
      'scopes',
      'expiresAt',
      'lastSyncAt',
      'createdAt',
      'updatedAt',
      'revokedAt',
      'accessToken',
      'refreshToken',
    ),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
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

// auth helpers — hasScope reflects ctx.scopes; requireScope is mirrored.
vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') ||
    granted.includes(required) ||
    granted.includes(`${required.split(':')[0]}:*`),
}));

// portal-auth — integrations.ts doesn't gate on service access, but the
// barrel imports it transitively.
const hasServiceAccessMock = vi.fn(async () => true);
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: (...args: unknown[]) => hasServiceAccessMock(...args),
}));

// Stubs for revalidatePath (called inside revalidateForWrite).
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// Unused-by-integrations.ts but imported transitively via the top of file.
vi.mock('@/lib/pm-activity', () => ({ logCardActivity: vi.fn() }));
vi.mock('@/lib/s3/upload', () => ({ uploadToS3: vi.fn() }));
vi.mock('@/lib/html-embed-clean', () => ({ cleanEmbedHtml: vi.fn() }));
vi.mock('@/lib/html-asset-import', () => ({ importHtmlAssets: vi.fn() }));
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: vi.fn(),
  resend: { emails: { send: vi.fn() } },
  buildCampaignHtml: vi.fn(),
  buildUnsubscribeUrl: vi.fn(),
  generateUnsubscribeToken: vi.fn(),
}));
vi.mock('@/lib/email/campaign-send', () => ({ executeCampaignSend: vi.fn() }));

// google oauth + tenant credentials — these ARE called by integrations.ts.
const revokeGoogleMock = vi.fn(async () => undefined);
vi.mock('@/lib/google/oauth', () => ({
  revoke: (...args: unknown[]) => revokeGoogleMock(...args),
}));

const getTenantMock = vi.fn();
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...args: unknown[]) => getTenantMock(...args),
}));

vi.mock('@/lib/mcp/pending-changes', () => ({ stageOrApply: vi.fn() }));
vi.mock('@/lib/mcp/blocks-schema', () => ({ BLOCKS_SCHEMA_REFERENCE: {} }));
vi.mock('@/lib/mcp/projections', () => ({
  postProjection: {},
  deckProjection: {},
  campaignProjection: {},
}));

vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed') }));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerIntegrationsTools } from '@/lib/mcp/tools/integrations';

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
  registerIntegrationsTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.capturedUpdatePatch = null;
  dbState.capturedUpdateCalls = 0;
  getTenantMock.mockReset();
  revokeGoogleMock.mockReset();
  revokeGoogleMock.mockResolvedValue(undefined);
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

describe('registerIntegrationsTools — tool registration', () => {
  it('registers both integration tools when scopes=*', () => {
    const tools = registerAll();
    expect(tools.has('integrations_list')).toBe(true);
    expect(tools.has('integrations_revoke')).toBe(true);
  });

  it('registers only the read tool when scopes=integrations:read', () => {
    const tools = registerAll(['integrations:read']);
    expect(tools.has('integrations_list')).toBe(true);
    expect(tools.has('integrations_revoke')).toBe(false);
  });

  it('registers only the write tool when scopes=integrations:write', () => {
    const tools = registerAll(['integrations:write']);
    expect(tools.has('integrations_list')).toBe(false);
    expect(tools.has('integrations_revoke')).toBe(true);
  });

  it('registers nothing when ctx has no integrations scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('registers both via wildcard `integrations:*` scope', () => {
    const tools = registerAll(['integrations:*']);
    expect(tools.has('integrations_list')).toBe(true);
    expect(tools.has('integrations_revoke')).toBe(true);
  });

  it('every tool has a title, description, and inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} should have a title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} description`).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── integrations_list ───────────────────────────────────────────────────────

describe('integrations_list', () => {
  it('returns tier=standard with empty integrations when tenant lacks Workspace credentials', async () => {
    getTenantMock.mockResolvedValueOnce(null);
    const tools = registerAll();
    const res = await tools.get('integrations_list')!.handler({});
    const out = parseJson(res) as { tier: string; integrations: unknown[] };
    expect(out.tier).toBe('standard');
    expect(out.integrations).toEqual([]);
  });

  it('returns tier=enterprise with a google entry when a connection exists', async () => {
    getTenantMock.mockResolvedValueOnce({ status: 'active', oauth: { clientId: 'x', clientSecret: 'y' } });
    dbState.selectDefault = [{
      googleAccountEmail: 'user@example.com',
      scopes: ['https://www.googleapis.com/auth/calendar'],
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      lastSyncAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }];
    const tools = registerAll();
    const res = await tools.get('integrations_list')!.handler({});
    const out = parseJson(res) as {
      tier: string;
      tenantStatus: string;
      integrations: { provider: string; connection: { googleAccountEmail: string } }[];
    };
    expect(out.tier).toBe('enterprise');
    expect(out.tenantStatus).toBe('active');
    expect(out.integrations).toHaveLength(1);
    expect(out.integrations[0].provider).toBe('google');
    expect(out.integrations[0].connection.googleAccountEmail).toBe('user@example.com');
  });

  it('returns tier=enterprise with empty integrations when tenant exists but user has no active connection', async () => {
    getTenantMock.mockResolvedValueOnce({ status: 'active', oauth: {} });
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('integrations_list')!.handler({});
    const out = parseJson(res) as { tier: string; integrations: unknown[] };
    expect(out.tier).toBe('enterprise');
    expect(out.integrations).toEqual([]);
  });

  it('denies when ctx lacks integrations:read at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerIntegrationsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('integrations_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
    expect(res.content[0].text).toMatch(/integrations:read/);
  });
});

// ── integrations_revoke ─────────────────────────────────────────────────────

describe('integrations_revoke', () => {
  it('rejects unsupported providers via the schema-validated branch', async () => {
    // The Zod input schema constrains provider to 'google', but the handler
    // still defensively short-circuits with an error envelope. Exercise the
    // guard directly by bypassing zod (handlers in this test harness are
    // invoked without the SDK's validation pipeline).
    const tools = registerAll();
    const res = await tools.get('integrations_revoke')!.handler({ provider: 'slack' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/unsupported provider/i);
  });

  it('returns workspace_not_provisioned when tenant has no Workspace credentials', async () => {
    getTenantMock.mockResolvedValueOnce(null);
    const tools = registerAll();
    const res = await tools.get('integrations_revoke')!.handler({ provider: 'google' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('workspace_not_provisioned');
  });

  it('is idempotent: returns alreadyDisconnected when no active connection exists', async () => {
    getTenantMock.mockResolvedValueOnce({ status: 'active', oauth: {} });
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('integrations_revoke')!.handler({ provider: 'google' });
    const out = parseJson(res) as { ok: boolean; alreadyDisconnected: boolean };
    expect(out.ok).toBe(true);
    expect(out.alreadyDisconnected).toBe(true);
    expect(dbState.capturedUpdateCalls).toBe(0);
    expect(revokeGoogleMock).not.toHaveBeenCalled();
  });

  it('revokes at the provider with the refresh token, then marks the row revoked', async () => {
    getTenantMock.mockResolvedValueOnce({ status: 'active', oauth: { clientId: 'cid', clientSecret: 'sec' } });
    dbState.selectDefault = [{
      id: 42,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    }];
    const tools = registerAll();
    const res = await tools.get('integrations_revoke')!.handler({ provider: 'google' });
    const out = parseJson(res) as { ok: boolean; providerRevokeError: string | null };
    expect(out.ok).toBe(true);
    expect(out.providerRevokeError).toBeNull();
    expect(revokeGoogleMock).toHaveBeenCalledWith('refresh-1', { clientId: 'cid', clientSecret: 'sec' });
    expect(dbState.capturedUpdateCalls).toBe(1);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.accessToken).toBe('');
    expect(patch.refreshToken).toBe('');
    expect(patch.revokedAt).toBeInstanceOf(Date);
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('falls back to the access token when no refresh token is stored', async () => {
    getTenantMock.mockResolvedValueOnce({ status: 'active', oauth: { clientId: 'cid' } });
    dbState.selectDefault = [{
      id: 99,
      accessToken: 'access-only',
      refreshToken: null,
    }];
    const tools = registerAll();
    await tools.get('integrations_revoke')!.handler({ provider: 'google' });
    expect(revokeGoogleMock).toHaveBeenCalledWith('access-only', { clientId: 'cid' });
  });

  it('still marks the row revoked when the provider revoke call throws', async () => {
    getTenantMock.mockResolvedValueOnce({ status: 'active', oauth: {} });
    dbState.selectDefault = [{
      id: 7,
      accessToken: 'a',
      refreshToken: 'r',
    }];
    revokeGoogleMock.mockRejectedValueOnce(new Error('google says no'));
    // Silence the console.warn the handler emits on provider failure.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tools = registerAll();
    const res = await tools.get('integrations_revoke')!.handler({ provider: 'google' });
    const out = parseJson(res) as { ok: boolean; providerRevokeError: string };
    expect(out.ok).toBe(true);
    expect(out.providerRevokeError).toBe('google says no');
    expect(dbState.capturedUpdateCalls).toBe(1);
    warnSpy.mockRestore();
  });

  it('surfaces a fallback error message when the thrown value has no message', async () => {
    getTenantMock.mockResolvedValueOnce({ status: 'active', oauth: {} });
    dbState.selectDefault = [{ id: 8, accessToken: 'a', refreshToken: 'r' }];
    // Reject with an object whose `.message` is missing.
    revokeGoogleMock.mockRejectedValueOnce({} as Error);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tools = registerAll();
    const res = await tools.get('integrations_revoke')!.handler({ provider: 'google' });
    const out = parseJson(res) as { providerRevokeError: string };
    expect(out.providerRevokeError).toBe('unknown_revoke_error');
    warnSpy.mockRestore();
  });

  it('denies when ctx lacks integrations:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerIntegrationsTools(stub as any, ctx);
    ctx.scopes = ['integrations:read'];
    const res = await tools.get('integrations_revoke')!.handler({ provider: 'google' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
    expect(res.content[0].text).toMatch(/integrations:write/);
  });
});
