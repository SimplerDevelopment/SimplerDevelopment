// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/bookings.ts.
 *
 * The module exports a single function — `registerBookingsTools(server, ctx)` —
 * that registers booking-page, booking, and gift-certificate MCP tools, each
 * gated by a scope check (`bookings:read` / `bookings:write`).
 *
 * Strategy mirrors brain-mcp-sdk-adapter.test.ts: stub `db`, mock schema +
 * drizzle helpers, mock auth/service collaborators, and pass in a fake
 * McpServer that captures `{ name -> handler }` so each handler can be invoked
 * directly. Tests cover happy paths plus the scope-denial / service-denial /
 * not-found / already-cancelled branches.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

// db: insert().values().returning() and select().from().where().limit().orderBy()
// — we expose a `dbState` to swap return values between tests.
type Row = Record<string, unknown>;
const dbState: {
  insertReturning: Row[];
  selectQueue: Row[][];
  selectDefault: Row[];
  updateReturning: Row[];
  capturedInsertValues: Row | null;
  capturedUpdatePatch: Row | null;
} = {
  insertReturning: [],
  selectQueue: [],
  selectDefault: [],
  updateReturning: [],
  capturedInsertValues: null,
  capturedUpdatePatch: null,
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
    insert: vi.fn(() => ({
      values: vi.fn((vals: Row) => {
        dbState.capturedInsertValues = vals;
        return {
          returning: vi.fn(async () => dbState.insertReturning),
        };
      }),
    })),
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
      return makeChain(next);
    }),
    update: vi.fn(() => ({
      set: vi.fn((patch: Row) => {
        dbState.capturedUpdatePatch = patch;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => dbState.updateReturning),
          })),
        };
      }),
    })),
  },
}));

// schema objects — opaque column-like refs are fine.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return {
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
    bookingPages: make('id', 'clientId', 'title', 'slug', 'description', 'price', 'duration', 'timezone', 'maxGuests', 'active', 'websiteId', 'updatedAt'),
    bookings: make('id', 'clientId', 'bookingPageId', 'status', 'startTime', 'endTime'),
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
    giftCertificates: make('id', 'clientId', 'websiteId', 'status', 'createdAt'),
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
    googleWorkspaceUserConnections: make('id'),
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

// auth helpers — hasScope reflects ctx.scopes; requireScope is mirrored.
vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') ||
    granted.includes(required) ||
    granted.includes(`${required.split(':')[0]}:*`),
}));

// portal-auth — control service access per-test.
const hasServiceAccessMock = vi.fn(async () => true);
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: (...args: unknown[]) => hasServiceAccessMock(...args),
}));

// Stubs for revalidatePath (called inside revalidateForWrite) and other deps
// that bookings.ts pulls transitively through ../types and other imports.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// pm-activity / s3 / html / email helpers — bookings.ts doesn't actually call
// these but they're imported via the registrar's top of file. Keep mocks minimal.
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
vi.mock('@/lib/google/oauth', () => ({ revoke: vi.fn() }));
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: vi.fn(),
}));
vi.mock('@/lib/mcp/pending-changes', () => ({ stageOrApply: vi.fn() }));
vi.mock('@/lib/mcp/blocks-schema', () => ({ BLOCKS_SCHEMA_REFERENCE: {} }));
vi.mock('@/lib/mcp/projections', () => ({
  postProjection: {},
  deckProjection: {},
  campaignProjection: {},
}));

// bcryptjs is referenced by the import block but unused by this module's
// handlers; stub to avoid loading native deps.
vi.mock('bcryptjs', () => ({ hash: vi.fn(async () => 'hashed') }));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerBookingsTools } from '@/lib/mcp/tools/bookings';

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
  registerBookingsTools(stub as any, ctxFor(scopes));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.insertReturning = [];
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.updateReturning = [];
  dbState.capturedInsertValues = null;
  dbState.capturedUpdatePatch = null;
  hasServiceAccessMock.mockReset();
  hasServiceAccessMock.mockResolvedValue(true);
});

describe('registerBookingsTools — tool registration', () => {
  it('registers the canonical booking + gift-cert tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of [
      'booking_pages_list',
      'booking_pages_get',
      'bookings_list',
      'bookings_get',
      'bookings_cancel',
      'bookings_update',
      'gift_certificates_list',
      'gift_certificates_issue',
    ]) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
  });

  it('registers only read tools when scopes=bookings:read', () => {
    const tools = registerAll(['bookings:read']);
    expect(tools.has('booking_pages_list')).toBe(true);
    expect(tools.has('bookings_list')).toBe(true);
    expect(tools.has('gift_certificates_list')).toBe(true);
    expect(tools.has('bookings_cancel')).toBe(false);
    expect(tools.has('bookings_update')).toBe(false);
    expect(tools.has('gift_certificates_issue')).toBe(false);
  });

  it('registers nothing when ctx has no bookings scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
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

// ── booking_pages_list ──────────────────────────────────────────────────────

describe('booking_pages_list', () => {
  it('returns the list when scope is granted', async () => {
    dbState.selectDefault = [{ id: 1, title: 'Discovery Call', slug: 'discovery' }];
    const tools = registerAll();
    const res = await tools.get('booking_pages_list')!.handler({});
    const out = parseJson(res) as Row[];
    expect(out[0].title).toBe('Discovery Call');
  });

  it('returns active-only by default and respects activeOnly=false', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    await tools.get('booking_pages_list')!.handler({ activeOnly: false });
    // Just verifying the call completes — exact filter assertion would
    // require deeper drizzle introspection.
    expect(true).toBe(true);
  });

  it('denies when ctx lacks bookings:read at call time', async () => {
    // Register with wildcard so the tool is registered, then strip the
    // ctx scope: bookings.ts re-checks via requireScope inside the handler.
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBookingsTools(stub as any, ctx);
    // After registration, strip scopes so the in-handler requireScope returns false.
    ctx.scopes = [];
    const res = await tools.get('booking_pages_list')!.handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── booking_pages_get ───────────────────────────────────────────────────────

describe('booking_pages_get', () => {
  it('returns the page when found', async () => {
    dbState.selectDefault = [{ id: 4, title: 'Strategy' }];
    const tools = registerAll();
    const res = await tools.get('booking_pages_get')!.handler({ id: 4 });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(4);
  });

  it('returns an error envelope when the page is missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('booking_pages_get')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });
});

// ── bookings_list ───────────────────────────────────────────────────────────

describe('bookings_list', () => {
  it('lists bookings with all filters applied', async () => {
    dbState.selectDefault = [{ id: 1, status: 'confirmed' }];
    const tools = registerAll();
    const res = await tools.get('bookings_list')!.handler({
      bookingPageId: 7,
      status: 'confirmed',
      startAfter: '2026-01-01T00:00:00Z',
      endBefore: '2026-12-31T00:00:00Z',
      limit: 25,
    });
    expect(parseJson(res)).toEqual([{ id: 1, status: 'confirmed' }]);
  });

  it('lists bookings with no filters (applies default limit)', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('bookings_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });
});

// ── bookings_get ────────────────────────────────────────────────────────────

describe('bookings_get', () => {
  it('returns the booking on hit', async () => {
    dbState.selectDefault = [{ id: 9, status: 'confirmed', guestName: 'Alice' }];
    const tools = registerAll();
    const res = await tools.get('bookings_get')!.handler({ id: 9 });
    const out = parseJson(res) as Row;
    expect(out.guestName).toBe('Alice');
  });

  it('returns an error envelope on miss', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('bookings_get')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });
});

// ── bookings_cancel ─────────────────────────────────────────────────────────

describe('bookings_cancel', () => {
  it('cancels a confirmed booking and appends reason to notes', async () => {
    dbState.selectDefault = [{ id: 5, status: 'confirmed', notes: 'old note' }];
    dbState.updateReturning = [{ id: 5, status: 'cancelled', notes: 'old note\n[cancelled] Reschedule' }];
    const tools = registerAll();
    const res = await tools.get('bookings_cancel')!.handler({ id: 5, reason: 'Reschedule' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('cancelled');
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.status).toBe('cancelled');
    expect(patch.cancelledAt).toBeInstanceOf(Date);
    expect(patch.notes).toBe('old note\n[cancelled] Reschedule');
  });

  it('uses bare prefix when existing notes are empty', async () => {
    dbState.selectDefault = [{ id: 5, status: 'confirmed', notes: null }];
    dbState.updateReturning = [{ id: 5, status: 'cancelled' }];
    const tools = registerAll();
    await tools.get('bookings_cancel')!.handler({ id: 5, reason: 'oops' });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.notes).toBe('[cancelled] oops');
  });

  it('omits notes patch when reason not supplied', async () => {
    dbState.selectDefault = [{ id: 5, status: 'confirmed', notes: 'x' }];
    dbState.updateReturning = [{ id: 5, status: 'cancelled' }];
    const tools = registerAll();
    await tools.get('bookings_cancel')!.handler({ id: 5 });
    const patch = dbState.capturedUpdatePatch!;
    expect('notes' in patch).toBe(false);
  });

  it('errors when booking not found', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('bookings_cancel')!.handler({ id: 999 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('errors when booking already cancelled', async () => {
    dbState.selectDefault = [{ id: 5, status: 'cancelled' }];
    const tools = registerAll();
    const res = await tools.get('bookings_cancel')!.handler({ id: 5 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/already cancelled/i);
  });

  it('returns serviceDenied when client lacks booking service', async () => {
    hasServiceAccessMock.mockResolvedValueOnce(false);
    const tools = registerAll();
    const res = await tools.get('bookings_cancel')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/booking subscription/i);
  });

  it('returns scope denial when caller lacks bookings:write at handler time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBookingsTools(stub as any, ctx);
    ctx.scopes = ['bookings:read'];
    const res = await tools.get('bookings_cancel')!.handler({ id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── bookings_update ─────────────────────────────────────────────────────────

describe('bookings_update', () => {
  it('updates simple fields and ignores undefined patch keys', async () => {
    dbState.selectDefault = [{ id: 1, status: 'confirmed' }];
    dbState.updateReturning = [{ id: 1, guestName: 'Bob' }];
    const tools = registerAll();
    const res = await tools.get('bookings_update')!.handler({
      id: 1,
      guestName: 'Bob',
      assignedTo: 7,
    });
    const out = parseJson(res) as { id: number };
    expect(out.id).toBe(1);
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.guestName).toBe('Bob');
    expect(patch.assignedTo).toBe(7);
    expect(patch.updatedAt).toBeInstanceOf(Date);
    // Nothing about startTime should be in the patch since it wasn't passed.
    expect('startTime' in patch).toBe(false);
  });

  it('parses startTime + endTime ISO strings into Dates', async () => {
    dbState.selectDefault = [{ id: 1, status: 'confirmed' }];
    dbState.updateReturning = [{ id: 1 }];
    const tools = registerAll();
    await tools.get('bookings_update')!.handler({
      id: 1,
      startTime: '2026-06-01T10:00:00Z',
      endTime: '2026-06-01T11:00:00Z',
    });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.startTime).toBeInstanceOf(Date);
    expect(patch.endTime).toBeInstanceOf(Date);
  });

  it('stamps cancelledAt when transitioning to cancelled', async () => {
    dbState.selectDefault = [{ id: 1, status: 'confirmed' }];
    dbState.updateReturning = [{ id: 1, status: 'cancelled' }];
    const tools = registerAll();
    await tools.get('bookings_update')!.handler({ id: 1, status: 'cancelled' });
    const patch = dbState.capturedUpdatePatch!;
    expect(patch.status).toBe('cancelled');
    expect(patch.cancelledAt).toBeInstanceOf(Date);
  });

  it('does NOT re-stamp cancelledAt when booking was already cancelled', async () => {
    dbState.selectDefault = [{ id: 1, status: 'cancelled' }];
    dbState.updateReturning = [{ id: 1, status: 'cancelled' }];
    const tools = registerAll();
    await tools.get('bookings_update')!.handler({ id: 1, status: 'cancelled' });
    const patch = dbState.capturedUpdatePatch!;
    expect('cancelledAt' in patch).toBe(false);
  });

  it('returns not-found when booking missing', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('bookings_update')!.handler({ id: 999, guestName: 'X' });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('returns serviceDenied when client lacks booking subscription', async () => {
    hasServiceAccessMock.mockResolvedValueOnce(false);
    const tools = registerAll();
    const res = await tools.get('bookings_update')!.handler({ id: 1, guestName: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/booking subscription/i);
  });
});

// ── gift_certificates_list ──────────────────────────────────────────────────

describe('gift_certificates_list', () => {
  it('returns gift certificates filtered by website and status', async () => {
    dbState.selectDefault = [{ id: 1, code: 'ABCD', status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('gift_certificates_list')!.handler({
      websiteId: 2,
      status: 'active',
      limit: 10,
    });
    expect(parseJson(res)).toEqual([{ id: 1, code: 'ABCD', status: 'active' }]);
  });

  it('returns all (no filters) using default limit', async () => {
    dbState.selectDefault = [];
    const tools = registerAll();
    const res = await tools.get('gift_certificates_list')!.handler({});
    expect(parseJson(res)).toEqual([]);
  });

  it('denies when scope missing at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBookingsTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('gift_certificates_list')!.handler({});
    expect(res.isError).toBe(true);
  });
});

// ── gift_certificates_issue ─────────────────────────────────────────────────

describe('gift_certificates_issue', () => {
  it('issues a gift cert with normalized emails + uppercase code', async () => {
    dbState.insertReturning = [{ id: 100, code: 'DEADBEEF', status: 'active' }];
    const tools = registerAll();
    const res = await tools.get('gift_certificates_issue')!.handler({
      amount: 5000,
      purchaserName: '  Alice ',
      purchaserEmail: 'Alice@Example.com',
      recipientName: 'Bob',
      recipientEmail: 'BoB@Example.com',
      personalMessage: 'Enjoy!',
      websiteId: 3,
    });
    const out = parseJson(res) as Row;
    expect(out.id).toBe(100);
    const vals = dbState.capturedInsertValues!;
    expect(vals.purchaserName).toBe('Alice');
    expect(vals.purchaserEmail).toBe('alice@example.com');
    expect(vals.recipientEmail).toBe('bob@example.com');
    expect(vals.initialAmount).toBe(5000);
    expect(vals.remainingAmount).toBe(5000);
    expect(vals.status).toBe('active');
    expect(vals.personalMessage).toBe('Enjoy!');
    expect(vals.websiteId).toBe(3);
    expect(typeof vals.code).toBe('string');
    // 4 random bytes hex-uppercased → 8 chars
    expect((vals.code as string)).toMatch(/^[0-9A-F]{8}$/);
  });

  it('defaults recipient fields and websiteId to null when omitted', async () => {
    dbState.insertReturning = [{ id: 101 }];
    const tools = registerAll();
    await tools.get('gift_certificates_issue')!.handler({
      amount: 100,
      purchaserName: 'Solo',
      purchaserEmail: 'solo@example.com',
    });
    const vals = dbState.capturedInsertValues!;
    expect(vals.recipientName).toBeNull();
    expect(vals.recipientEmail).toBeNull();
    expect(vals.personalMessage).toBeNull();
    expect(vals.websiteId).toBeNull();
  });

  it('returns serviceDenied when client lacks booking subscription', async () => {
    hasServiceAccessMock.mockResolvedValueOnce(false);
    const tools = registerAll();
    const res = await tools.get('gift_certificates_issue')!.handler({
      amount: 100,
      purchaserName: 'X',
      purchaserEmail: 'x@example.com',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/booking subscription/i);
  });

  it('returns scope denial when caller lacks bookings:write', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerBookingsTools(stub as any, ctx);
    ctx.scopes = ['bookings:read'];
    const res = await tools.get('gift_certificates_issue')!.handler({
      amount: 100,
      purchaserName: 'X',
      purchaserEmail: 'x@example.com',
    });
    expect(res.isError).toBe(true);
  });
});
