// @vitest-environment node
/**
 * Unit tests for four portal email routes (batch 31a):
 *
 *  1. GET  /api/portal/email/analytics
 *     - Service gate, session/client gate
 *     - Aggregates campaign stats, list stats, subscriber breakdown,
 *       recent campaigns; computes openRate / clickRate
 *
 *  2. POST /api/portal/email/campaigns/[id]/send
 *     - Auth gate, campaign ownership
 *     - Refuses to send when status is already 'sent' or 'sending'
 *     - Filters out subscribers that were already sent to
 *     - Block-editor path renders once via render-cache and reuses HTML
 *     - Counts successes vs failures
 *
 *  3. GET  /api/portal/email/campaigns  +  POST /api/portal/email/campaigns
 *     - Service + session gates
 *     - POST trims fields, requires list ownership, renders blocks via
 *       renderBlocksToEmailHtml, emits 'email.campaign.sent' event
 *
 *  4. GET  /api/portal/email/lists      +  POST /api/portal/email/lists
 *     - Service + session gates
 *     - POST requires name, trims fields, returns 201
 *
 * All externals (auth, db, drizzle aggregates, portal-client, portal-auth,
 * email helpers, render-cache, automation event bus, Resend) are mocked.
 * No DB, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// drizzle-orm mock (aggregate helpers included)
// ===========================================================================

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  count: (a?: unknown) => ({ op: 'count', a }),
  sum: (a: unknown) => ({ op: 'sum', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql-raw', s }),
    },
  ),
}));

// ===========================================================================
// Schema mock
// ===========================================================================

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect' || prop === '$inferInsert') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    emailCampaigns: wrap('emailCampaigns'),
    emailCampaignSends: wrap('emailCampaignSends'),
    emailSubscribers: wrap('emailSubscribers'),
    emailLists: wrap('emailLists'),
  };
});

// ===========================================================================
// Auth + portal-client + portal-auth mocks
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn((r: unknown) => !!(r as { response?: unknown })?.response);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

// ===========================================================================
// Email helpers
// ===========================================================================

const renderBlocksToEmailHtmlMock = vi.fn((blocks: unknown) =>
  `<rendered:${Array.isArray(blocks) ? blocks.length : 0}>`,
);
const buildCampaignHtmlMock = vi.fn(
  (html: string, unsub: string, _preview?: unknown) =>
    `<wrap unsub=${unsub}>${html}</wrap>`,
);
const buildUnsubscribeUrlMock = vi.fn((tok: string) => `https://example.test/u/${tok}`);
const resendSendMock = vi.fn();

vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (b: unknown) => renderBlocksToEmailHtmlMock(b),
  buildCampaignHtml: (h: string, u: string, p?: unknown) => buildCampaignHtmlMock(h, u, p),
  buildUnsubscribeUrl: (t: string) => buildUnsubscribeUrlMock(t),
  resend: {
    emails: {
      send: (args: unknown) => resendSendMock(args),
    },
  },
}));

const getOrRenderCampaignHtmlMock = vi.fn();
const htmlToTextMock = vi.fn((h: string) => `text:${h}`);
vi.mock('@/lib/email/render-cache', () => ({
  getOrRenderCampaignHtml: (...args: unknown[]) => getOrRenderCampaignHtmlMock(...args),
  htmlToText: (h: string) => htmlToTextMock(h),
}));

// ===========================================================================
// Automation event bus
// ===========================================================================

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

// ===========================================================================
// DB mock: thenable select chain + insert/update chains, queue-driven
// ===========================================================================

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturningQueue: Array<Array<Record<string, unknown>>> = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftInsertReturning(): Array<Record<string, unknown>> {
  return insertReturningQueue.shift() ?? [];
}

const insertValuesCalls: Array<{ table: string; values: unknown }> = [];
const updateSetCalls: Array<{ table: string; set: Record<string, unknown> }> = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) materialized = Promise.resolve(shiftSelect());
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materialized!.then(onF, onR);
        },
        limit() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materialized!.then(onF, onR);
            },
          };
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materialized!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: unknown) {
        insertValuesCalls.push({ table: table.__table, values: v });
        return {
          returning() {
            return Promise.resolve(shiftInsertReturning());
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(shiftInsertReturning()).then(onF, onR);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(v: Record<string, unknown>) {
        updateSetCalls.push({ table: table.__table, set: v });
        return {
          where() {
            return Promise.resolve([]);
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      insert(t: { __table: string }) {
        return buildInsert(t);
      },
      update(t: { __table: string }) {
        return buildUpdate(t);
      },
    },
  };
});

// ===========================================================================
// Modules under test (after mocks)
// ===========================================================================

const analyticsRoute = await import('@/app/api/portal/email/analytics/route');
const analyticsGET = analyticsRoute.GET;

const sendRoute = await import('@/app/api/portal/email/campaigns/[id]/send/route');
const sendPOST = sendRoute.POST;

const campaignsRoute = await import('@/app/api/portal/email/campaigns/route');
const campaignsGET = campaignsRoute.GET;
const campaignsPOST = campaignsRoute.POST;

const listsRoute = await import('@/app/api/portal/email/lists/route');
const listsGET = listsRoute.GET;
const listsPOST = listsRoute.POST;

// ===========================================================================
// Shared helpers
// ===========================================================================

const OK_AUTH = { ok: true };

function makeReq(url = 'http://x/route', init?: RequestInit): Request {
  return new Request(url, init);
}
function makeJsonReq(body: unknown, method = 'POST'): Request {
  return new Request('http://x/route', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  selectQueue = [];
  insertReturningQueue = [];
  insertValuesCalls.length = 0;
  updateSetCalls.length = 0;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockClear();

  renderBlocksToEmailHtmlMock
    .mockReset()
    .mockImplementation((blocks: unknown) =>
      `<rendered:${Array.isArray(blocks) ? blocks.length : 0}>`,
    );
  buildCampaignHtmlMock
    .mockReset()
    .mockImplementation((html: string, unsub: string) => `<wrap unsub=${unsub}>${html}</wrap>`);
  buildUnsubscribeUrlMock
    .mockReset()
    .mockImplementation((tok: string) => `https://example.test/u/${tok}`);
  resendSendMock.mockReset().mockResolvedValue({ data: { id: 'resend-id' } });
  getOrRenderCampaignHtmlMock.mockReset();
  htmlToTextMock.mockReset().mockImplementation((h: string) => `text:${h}`);
  emitEventMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  authorizePortalMock.mockResolvedValue(OK_AUTH);
});

// ===========================================================================
// GET /api/portal/email/analytics
// ===========================================================================

describe('GET /api/portal/email/analytics', () => {
  it('returns the service gate error response when authorize denies', async () => {
    const denied = new Response(JSON.stringify({ message: 'denied' }), { status: 403 });
    authorizePortalMock.mockResolvedValueOnce({ response: denied });
    const res = await analyticsGET();
    expect(res).toBe(denied);
  });

  it('returns 401 when no session user', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await analyticsGET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await analyticsGET();
    expect(res.status).toBe(404);
  });

  it('aggregates stats, builds list breakdown, and computes rates', async () => {
    // Queue order matches route source:
    //  1. campaignStats (single row)
    //  2. listStats (single row)
    //  3. lists rows
    //  4. for each list: total then active subscriber counts
    //  5. recentCampaigns rows
    selectQueue.push([
      {
        totalCampaigns: 4,
        totalSent: '100',
        totalOpened: '50',
        totalClicked: '25',
        totalBounced: '5',
        totalUnsubscribed: '2',
      },
    ]);
    selectQueue.push([{ totalLists: 2 }]);
    selectQueue.push([
      { id: 11, name: 'List A' },
      { id: 12, name: 'List B' },
    ]);
    // List A: total=20, active=15
    selectQueue.push([{ count: 20 }]);
    selectQueue.push([{ count: 15 }]);
    // List B: total=10, active=8
    selectQueue.push([{ count: 10 }]);
    selectQueue.push([{ count: 8 }]);
    selectQueue.push([
      {
        id: 91,
        name: 'Recent 1',
        subject: 'subj',
        sentAt: new Date('2026-05-10'),
        totalSent: 50,
        totalOpened: 25,
        totalClicked: 10,
        totalBounced: 3,
      },
    ]);

    const res = await analyticsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.overview.totalCampaigns).toBe(4);
    expect(body.data.overview.totalSent).toBe(100);
    expect(body.data.overview.totalOpened).toBe(50);
    expect(body.data.overview.totalClicked).toBe(25);
    expect(body.data.overview.openRate).toBe('50.0');
    expect(body.data.overview.clickRate).toBe('25.0');
    expect(body.data.subscribers.total).toBe(30);
    expect(body.data.subscribers.active).toBe(23);
    expect(body.data.subscribers.totalLists).toBe(2);
    expect(body.data.subscribers.listBreakdown).toEqual([
      { id: 11, name: 'List A', total: 20, active: 15 },
      { id: 12, name: 'List B', total: 10, active: 8 },
    ]);
    expect(body.data.recentCampaigns).toHaveLength(1);
    expect(body.data.recentCampaigns[0].name).toBe('Recent 1');
  });

  it('reports 0.0 rates when totalSent is 0 and no lists', async () => {
    selectQueue.push([
      {
        totalCampaigns: 0,
        totalSent: null,
        totalOpened: null,
        totalClicked: null,
        totalBounced: null,
        totalUnsubscribed: null,
      },
    ]);
    selectQueue.push([{ totalLists: 0 }]);
    selectQueue.push([]); // no lists
    selectQueue.push([]); // recentCampaigns

    const res = await analyticsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.overview.openRate).toBe('0.0');
    expect(body.data.overview.clickRate).toBe('0.0');
    expect(body.data.subscribers.total).toBe(0);
    expect(body.data.subscribers.active).toBe(0);
    expect(body.data.subscribers.listBreakdown).toEqual([]);
    expect(body.data.recentCampaigns).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/email/campaigns/[id]/send
// ===========================================================================

describe('POST /api/portal/email/campaigns/[id]/send', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when campaign is not found / not owned', async () => {
    selectQueue.push([]); // campaign lookup empty
    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/not found/i);
  });

  it('returns 400 when the campaign is already sent', async () => {
    selectQueue.push([{ id: 1, clientId: 10, status: 'sent', listId: 77 }]);
    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/already sent/);
  });

  it('returns 400 when the campaign is currently sending', async () => {
    selectQueue.push([{ id: 1, clientId: 10, status: 'sending', listId: 77 }]);
    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/already sending/);
  });

  it('returns 400 when there are no remaining targets after dedupe', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        listId: 77,
        status: 'draft',
        subject: 'subj',
        fromName: 'me',
        fromEmail: 'me@x.test',
        replyTo: null,
        htmlContent: '<p>hi</p>',
        useBlockEditor: false,
        contentBlocks: null,
        previewText: null,
      },
    ]);
    // alreadySentSubIds
    selectQueue.push([{ subscriberId: 500 }]);
    // active subscribers list — all of which were already sent
    selectQueue.push([
      { id: 500, email: 'a@x.test', unsubscribeToken: 'tok-a' },
    ]);

    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/no active subscribers/i);
  });

  it('non-block-editor path: builds html via buildCampaignHtml, sends + counts successes', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        listId: 77,
        status: 'draft',
        subject: 'subj',
        fromName: 'me',
        fromEmail: 'me@x.test',
        replyTo: 'reply@x.test',
        htmlContent: '<p>hi</p>',
        useBlockEditor: false,
        contentBlocks: null,
        previewText: 'preview',
      },
    ]);
    selectQueue.push([]); // no prior sends
    selectQueue.push([
      { id: 501, email: 'a@x.test', unsubscribeToken: 'tok-a' },
      { id: 502, email: 'b@x.test', unsubscribeToken: 'tok-b' },
    ]);

    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ sent: 2, failed: 0, total: 2 });

    expect(getOrRenderCampaignHtmlMock).not.toHaveBeenCalled();
    expect(buildCampaignHtmlMock).toHaveBeenCalledTimes(2);
    expect(resendSendMock).toHaveBeenCalledTimes(2);
    // Each send insert recorded
    const sendsInserts = insertValuesCalls.filter((c) => c.table === 'emailCampaignSends');
    expect(sendsInserts).toHaveLength(2);
    // status updates: sending then sent
    const campaignUpdates = updateSetCalls.filter((u) => u.table === 'emailCampaigns');
    expect(campaignUpdates).toHaveLength(2);
    expect(campaignUpdates[0].set.status).toBe('sending');
    expect(campaignUpdates[0].set.totalRecipients).toBe(2);
    expect(campaignUpdates[1].set.status).toBe('sent');
    expect(campaignUpdates[1].set.totalSent).toBe(2);

    // Resend args include reply-to and List-Unsubscribe headers
    const firstCall = resendSendMock.mock.calls[0][0] as {
      headers: Record<string, string>;
      replyTo: string;
      from: string;
    };
    expect(firstCall.from).toBe('me <me@x.test>');
    expect(firstCall.replyTo).toBe('reply@x.test');
    expect(firstCall.headers['List-Unsubscribe']).toContain('https://example.test/u/tok-a');
  });

  it('block-editor path: renders once via getOrRenderCampaignHtml and substitutes unsubscribe url per recipient', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        listId: 77,
        status: 'draft',
        subject: 'subj',
        fromName: 'me',
        fromEmail: 'me@x.test',
        replyTo: null,
        htmlContent: '<p>fallback</p>',
        useBlockEditor: true,
        contentBlocks: [{ type: 'heading' }, { type: 'p' }],
        previewText: 'preview',
      },
    ]);
    selectQueue.push([]); // no prior sends
    selectQueue.push([
      { id: 501, email: 'a@x.test', unsubscribeToken: 'tok-a' },
    ]);
    getOrRenderCampaignHtmlMock.mockResolvedValueOnce({
      html: '<p>hi {{UNSUBSCRIBE_URL}}</p>',
      text: 'hi {{UNSUBSCRIBE_URL}}',
    });

    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ sent: 1, failed: 0, total: 1 });

    expect(getOrRenderCampaignHtmlMock).toHaveBeenCalledTimes(1);
    // The unsubscribe placeholder must have been replaced with the recipient URL
    const sendArgs = resendSendMock.mock.calls[0][0] as { html: string; text: string };
    expect(sendArgs.html).toContain('https://example.test/u/tok-a');
    expect(sendArgs.html).not.toContain('{{UNSUBSCRIBE_URL}}');
    // buildCampaignHtml NOT used in block-editor path
    expect(buildCampaignHtmlMock).not.toHaveBeenCalled();
  });

  it('counts failures from Resend without aborting the loop', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        listId: 77,
        status: 'draft',
        subject: 'subj',
        fromName: 'me',
        fromEmail: 'me@x.test',
        replyTo: null,
        htmlContent: '<p>hi</p>',
        useBlockEditor: false,
        contentBlocks: null,
        previewText: null,
      },
    ]);
    selectQueue.push([]);
    selectQueue.push([
      { id: 501, email: 'a@x.test', unsubscribeToken: 'tok-a' },
      { id: 502, email: 'b@x.test', unsubscribeToken: 'tok-b' },
    ]);
    resendSendMock
      .mockResolvedValueOnce({ data: { id: 'ok-1' } })
      .mockRejectedValueOnce(new Error('boom'));

    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ sent: 1, failed: 1, total: 2 });
  });

  it('filters out subscribers already in the sends table', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        listId: 77,
        status: 'draft',
        subject: 'subj',
        fromName: 'me',
        fromEmail: 'me@x.test',
        replyTo: null,
        htmlContent: '<p>hi</p>',
        useBlockEditor: false,
        contentBlocks: null,
        previewText: null,
      },
    ]);
    selectQueue.push([{ subscriberId: 501 }]); // 501 already sent
    selectQueue.push([
      { id: 501, email: 'a@x.test', unsubscribeToken: 'tok-a' },
      { id: 502, email: 'b@x.test', unsubscribeToken: 'tok-b' },
    ]);

    const res = await sendPOST(makeReq(), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ sent: 1, failed: 0, total: 1 });
    // Only one subscriber should have been emailed
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const toArg = (resendSendMock.mock.calls[0][0] as { to: string }).to;
    expect(toArg).toBe('b@x.test');
  });
});

// ===========================================================================
// GET /api/portal/email/campaigns
// ===========================================================================

describe('GET /api/portal/email/campaigns', () => {
  it('returns the gate response when authorize denies', async () => {
    const denied = new Response(JSON.stringify({ m: 'no' }), { status: 403 });
    authorizePortalMock.mockResolvedValueOnce({ response: denied });
    const res = await campaignsGET();
    expect(res).toBe(denied);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsGET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await campaignsGET();
    expect(res.status).toBe(401);
  });

  it('returns the campaign list on success', async () => {
    selectQueue.push([
      { id: 1, name: 'Camp A', status: 'draft', listName: 'List A' },
      { id: 2, name: 'Camp B', status: 'sent', listName: 'List B' },
    ]);
    const res = await campaignsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Camp A');
  });
});

// ===========================================================================
// POST /api/portal/email/campaigns
// ===========================================================================

describe('POST /api/portal/email/campaigns', () => {
  function validBody(over: Partial<Record<string, unknown>> = {}) {
    return {
      name: 'Camp',
      subject: 'subj',
      fromName: 'Sender',
      fromEmail: 'me@x.test',
      listId: 77,
      htmlContent: '<p>hi</p>',
      ...over,
    };
  }

  it('returns gate response when authorize denies', async () => {
    const denied = new Response(JSON.stringify({ m: 'no' }), { status: 403 });
    authorizePortalMock.mockResolvedValueOnce({ response: denied });
    const res = await campaignsPOST(makeJsonReq({}));
    expect(res).toBe(denied);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsPOST(makeJsonReq(validBody()));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await campaignsPOST(makeJsonReq({ name: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/i);
  });

  it('returns 404 when listId does not belong to client', async () => {
    selectQueue.push([]); // list lookup empty
    const res = await campaignsPOST(makeJsonReq(validBody()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/list not found/i);
  });

  it('creates a campaign with raw htmlContent and emits event', async () => {
    selectQueue.push([{ id: 77 }]); // list owned
    insertReturningQueue.push([
      { id: 91, name: 'Camp', subject: 'subj', listId: 77 },
    ]);

    const res = await campaignsPOST(makeJsonReq(validBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(91);

    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
    expect(emitEventMock).toHaveBeenCalledTimes(1);
    expect(emitEventMock.mock.calls[0][0]).toBe('email.campaign.sent');
    expect(emitEventMock.mock.calls[0][1]).toBe(10);
    expect(emitEventMock.mock.calls[0][3]).toEqual(
      expect.objectContaining({ campaignId: 91, name: 'Camp' }),
    );

    const insert = insertValuesCalls.find((c) => c.table === 'emailCampaigns');
    expect(insert).toBeTruthy();
    const inserted = insert!.values as Record<string, unknown>;
    expect(inserted.htmlContent).toBe('<p>hi</p>');
    expect(inserted.clientId).toBe(10);
    expect(inserted.useBlockEditor).toBe(false);
  });

  it('renders blockContent.blocks into htmlContent', async () => {
    selectQueue.push([{ id: 77 }]);
    insertReturningQueue.push([{ id: 92, name: 'Camp', subject: 'subj', listId: 77 }]);

    const res = await campaignsPOST(
      makeJsonReq(
        validBody({
          htmlContent: undefined,
          blockContent: { blocks: [{ type: 'h' }, { type: 'p' }] },
        }),
      ),
    );
    expect(res.status).toBe(201);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith([
      { type: 'h' },
      { type: 'p' },
    ]);
    const insert = insertValuesCalls.find((c) => c.table === 'emailCampaigns');
    const inserted = insert!.values as Record<string, unknown>;
    expect(inserted.htmlContent).toBe('<rendered:2>');
  });

  it('contentBlocks takes precedence over blockContent for the final html', async () => {
    selectQueue.push([{ id: 77 }]);
    insertReturningQueue.push([{ id: 93, name: 'Camp', subject: 'subj', listId: 77 }]);

    const res = await campaignsPOST(
      makeJsonReq(
        validBody({
          htmlContent: undefined,
          blockContent: { blocks: [{ type: 'old' }] },
          contentBlocks: [{ type: 'a' }, { type: 'b' }, { type: 'c' }],
          useBlockEditor: true,
        }),
      ),
    );
    expect(res.status).toBe(201);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenLastCalledWith([
      { type: 'a' },
      { type: 'b' },
      { type: 'c' },
    ]);
    const insert = insertValuesCalls.find((c) => c.table === 'emailCampaigns');
    const inserted = insert!.values as Record<string, unknown>;
    expect(inserted.htmlContent).toBe('<rendered:3>');
    expect(inserted.useBlockEditor).toBe(true);
    expect(inserted.contentBlocks).toEqual([
      { type: 'a' },
      { type: 'b' },
      { type: 'c' },
    ]);
  });

  it('trims previewText and replyTo, persisting null when blank', async () => {
    selectQueue.push([{ id: 77 }]);
    insertReturningQueue.push([{ id: 94, name: 'Camp', subject: 'subj', listId: 77 }]);

    const res = await campaignsPOST(
      makeJsonReq(
        validBody({ previewText: '   ', replyTo: '  reply@x.test  ' }),
      ),
    );
    expect(res.status).toBe(201);
    const insert = insertValuesCalls.find((c) => c.table === 'emailCampaigns');
    const inserted = insert!.values as Record<string, unknown>;
    expect(inserted.previewText).toBeNull();
    expect(inserted.replyTo).toBe('reply@x.test');
  });
});

// ===========================================================================
// GET /api/portal/email/lists
// ===========================================================================

describe('GET /api/portal/email/lists', () => {
  it('returns gate response when authorize denies', async () => {
    const denied = new Response(JSON.stringify({ m: 'no' }), { status: 403 });
    authorizePortalMock.mockResolvedValueOnce({ response: denied });
    const res = await listsGET();
    expect(res).toBe(denied);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await listsGET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await listsGET();
    expect(res.status).toBe(401);
  });

  it('returns the list of email lists with subscriber counts', async () => {
    selectQueue.push([
      { id: 11, name: 'A', description: 'a-desc', subscriberCount: 12 },
      { id: 12, name: 'B', description: null, subscriberCount: 0 },
    ]);
    const res = await listsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].subscriberCount).toBe(12);
  });
});

// ===========================================================================
// POST /api/portal/email/lists
// ===========================================================================

describe('POST /api/portal/email/lists', () => {
  it('returns gate response when authorize denies', async () => {
    const denied = new Response(JSON.stringify({ m: 'no' }), { status: 403 });
    authorizePortalMock.mockResolvedValueOnce({ response: denied });
    const res = await listsPOST(makeJsonReq({ name: 'x' }));
    expect(res).toBe(denied);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await listsPOST(makeJsonReq({ name: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing or blank', async () => {
    const res = await listsPOST(makeJsonReq({ name: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name is required/i);
  });

  it('creates a list with trimmed name and description', async () => {
    insertReturningQueue.push([{ id: 50, name: 'List X', description: 'desc' }]);
    const res = await listsPOST(
      makeJsonReq({ name: '  List X  ', description: '  desc  ' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(50);

    const insert = insertValuesCalls.find((c) => c.table === 'emailLists');
    const inserted = insert!.values as Record<string, unknown>;
    expect(inserted.name).toBe('List X');
    expect(inserted.description).toBe('desc');
    expect(inserted.clientId).toBe(10);
  });

  it('stores null description when blank', async () => {
    insertReturningQueue.push([{ id: 51, name: 'List Y', description: null }]);
    const res = await listsPOST(
      makeJsonReq({ name: 'List Y', description: '   ' }),
    );
    expect(res.status).toBe(201);
    const insert = insertValuesCalls.find((c) => c.table === 'emailLists');
    const inserted = insert!.values as Record<string, unknown>;
    expect(inserted.description).toBeNull();
  });
});
