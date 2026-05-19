// @vitest-environment node
/**
 * Unit tests for two email-adjacent portal API routes:
 *
 *   - app/api/portal/crm/contacts/[id]/send-email/route.ts
 *       POST: sends a one-off email to a CRM contact via Resend, logs an
 *       activity, and bumps `lastContactedAt` on the contact.
 *
 *   - app/api/portal/email/preview/route.ts
 *       POST: renders block-builder blocks to HTML/text (with optional
 *       campaign-scoped cache), and optionally sends a test copy to the
 *       logged-in user.
 *
 * Both routes are mocked end-to-end: the auth session, the portal-auth
 * helper, the resend client, the email render-cache helpers, and the
 * drizzle db.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared state — vi.hoisted runs before vi.mock factories so all
// mocks can share a single mock registry.
// ---------------------------------------------------------------------------

const H = vi.hoisted(() => ({
  // auth + portal-client mocks (used by the crm/send-email route)
  authMock: vi.fn(),
  getPortalClientMock: vi.fn(),

  // portal-auth mock (used by the email/preview route)
  authorizePortalMock: vi.fn(),

  // resend
  resendSendMock: vi.fn(),

  // email render-cache helpers (called by the preview route)
  getOrRenderCampaignHtmlMock: vi.fn(),
  renderCampaignPreviewMock: vi.fn(),

  // buildUnsubscribeUrl (from @/lib/email — preview test sets the value)
  buildUnsubscribeUrlMock: vi.fn((token: string) => `https://x/u?token=${token}`),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: () => H.authMock(),
}));

vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => H.getPortalClientMock(...args),
}));

vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => H.authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    !!r && typeof r === 'object' && 'response' in (r as Record<string, unknown>),
}));

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => H.resendSendMock(...args),
    },
  },
  buildUnsubscribeUrl: (...args: unknown[]) => H.buildUnsubscribeUrlMock(...(args as [string])),
}));

vi.mock('@/lib/email/render-cache', () => ({
  getOrRenderCampaignHtml: (...args: unknown[]) =>
    H.getOrRenderCampaignHtmlMock(...args),
  renderCampaignPreview: (...args: unknown[]) =>
    H.renderCampaignPreviewMock(...args),
}));

// Schema proxy so e.g. crmContacts.id, emailCampaigns.clientId resolve to
// uniquely-keyed column refs the drizzle-orm mock can pattern-match on.
vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    crmContacts: wrap('crmContacts'),
    crmActivities: wrap('crmActivities'),
    emailCampaigns: wrap('emailCampaigns'),
    users: wrap('users'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
}));

// ---------------------------------------------------------------------------
// In-memory drizzle-like db
// ---------------------------------------------------------------------------

interface State {
  contacts: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  campaigns: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  insertActivityThrow: Error | null;
  nextActivityId: number;
}

const state: State = {
  contacts: [],
  activities: [],
  campaigns: [],
  users: [],
  insertActivityThrow: null,
  nextActivityId: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'crmContacts':
      return state.contacts;
    case 'crmActivities':
      return state.activities;
    case 'emailCampaigns':
      return state.campaigns;
    case 'users':
      return state.users;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

function makeDbLike() {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitN: number | null = null;

    function project(row: Record<string, unknown>) {
      if (!projection) return { ...row };
      const out: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as { __col?: string } | undefined;
        out[outKey] = colRef?.__col ? row[colRef.__col] ?? null : null;
      }
      return out;
    }

    function run(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      if (limitN !== null) rows = rows.slice(0, limitN);
      return Promise.resolve(rows.map(project));
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    let setVals: Record<string, unknown> = {};
    let filter: unknown = null;

    function run(): Promise<Array<Record<string, unknown>>> {
      const arr = tableArray(table.__table);
      const updated: Array<Record<string, unknown>> = [];
      for (const r of arr) {
        if (evalPredicate(filter, r)) {
          Object.assign(r, setVals);
          updated.push(r);
        }
      }
      return Promise.resolve(updated);
    }

    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        setVals = v;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: unknown) {
        if (table.__table === 'crmActivities' && state.insertActivityThrow) {
          const err = state.insertActivityThrow;
          state.insertActivityThrow = null;
          return {
            returning: () => Promise.reject(err),
            then: (
              onFulfilled: (v: unknown) => unknown,
              onRejected?: (e: unknown) => unknown,
            ) => Promise.reject(err).then(onFulfilled, onRejected),
          };
        }
        const arr = tableArray(table.__table);
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const v of list) {
          const row = { ...(v as Record<string, unknown>) };
          if (table.__table === 'crmActivities' && row.id === undefined) {
            row.id = state.nextActivityId++;
          }
          arr.push(row);
          inserted.push(row);
        }
        return {
          returning: () => Promise.resolve(inserted.map((r) => ({ ...r }))),
          then: (
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => Promise.resolve(inserted).then(onFulfilled, onRejected),
        };
      },
    };
  }

  return {
    select(projection?: Record<string, unknown>) {
      return buildSelect(projection);
    },
    update(table: { __table: string }) {
      return buildUpdate(table);
    },
    insert(table: { __table: string }) {
      return buildInsert(table);
    },
  };
}

vi.mock('@/lib/db', () => ({
  db: makeDbLike(),
}));

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const { POST: SendEmailPOST } = await import(
  '@/app/api/portal/crm/contacts/[id]/send-email/route'
);
const { POST: PreviewPOST } = await import(
  '@/app/api/portal/email/preview/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawReq(url: string, raw: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
}

function callSendEmail(id: string, body: unknown) {
  return SendEmailPOST(
    makeJsonReq(`http://x/api/portal/crm/contacts/${id}/send-email`, body),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  state.contacts.length = 0;
  state.activities.length = 0;
  state.campaigns.length = 0;
  state.users.length = 0;
  state.insertActivityThrow = null;
  state.nextActivityId = 1;

  H.authMock.mockReset();
  H.getPortalClientMock.mockReset();
  H.authorizePortalMock.mockReset();
  H.resendSendMock.mockReset();
  H.getOrRenderCampaignHtmlMock.mockReset();
  H.renderCampaignPreviewMock.mockReset();
  H.buildUnsubscribeUrlMock.mockReset();
  H.buildUnsubscribeUrlMock.mockImplementation(
    (token: string) => `https://x/u?token=${token}`,
  );

  H.authMock.mockResolvedValue({ user: { id: '7' } });
  H.getPortalClientMock.mockResolvedValue({ id: 10, company: 'Acme Co' });
  H.resendSendMock.mockResolvedValue({ data: { id: 'msg_abc' }, error: null });

  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.EMAIL_TEST_FROM;
});

// ===========================================================================
// POST /api/portal/crm/contacts/[id]/send-email
// ===========================================================================

describe('POST /api/portal/crm/contacts/[id]/send-email', () => {
  // -- Auth / client guards -------------------------------------------------

  it('returns 401 when no session', async () => {
    H.authMock.mockResolvedValueOnce(null);
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    H.authMock.mockResolvedValueOnce({ user: {} });
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    H.getPortalClientMock.mockResolvedValueOnce(null);
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe('Client not found');
  });

  it('passes parsed userId to getPortalClient', async () => {
    H.authMock.mockResolvedValueOnce({ user: { id: '42' } });
    H.getPortalClientMock.mockResolvedValueOnce(null);
    await callSendEmail('1', { subject: 's', body: 'b' });
    expect(H.getPortalClientMock).toHaveBeenCalledWith(42);
  });

  // -- Param validation -----------------------------------------------------

  it('returns 400 when contact id is not a number', async () => {
    const res = await callSendEmail('abc', { subject: 's', body: 'b' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe('Invalid ID');
  });

  // -- Contact lookup -------------------------------------------------------

  it('returns 404 when contact does not exist', async () => {
    const res = await callSendEmail('999', { subject: 's', body: 'b' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe('Contact not found');
  });

  it('returns 404 when contact belongs to another client', async () => {
    state.contacts.push({
      id: 1,
      clientId: 999,
      email: 'c@x.test',
      firstName: 'A',
      lastName: 'B',
    });
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when contact has no email', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      email: null,
      firstName: 'A',
      lastName: 'B',
    });
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe('Contact does not have an email address');
  });

  // -- Body validation -----------------------------------------------------

  it('returns 400 when subject is missing', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    const res = await callSendEmail('1', { body: 'hi' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe('Subject and body are required');
  });

  it('returns 400 when subject is only whitespace', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    const res = await callSendEmail('1', { subject: '   ', body: 'hi' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    const res = await callSendEmail('1', { subject: 'hi' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is only whitespace', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    const res = await callSendEmail('1', { subject: 'hi', body: '   ' });
    expect(res.status).toBe(400);
  });

  // -- Happy path ----------------------------------------------------------

  it('sends email, logs activity, bumps lastContactedAt, returns 200', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      email: 'c@x.test',
      firstName: 'C',
      lastName: 'X',
      lastContactedAt: null,
      updatedAt: null,
    });
    const res = await callSendEmail('1', {
      subject: 'Hello',
      body: 'Some body content',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.messageId).toBe('msg_abc');
    expect(typeof json.data.activityId).toBe('number');

    // resend was called once with the right shape
    expect(H.resendSendMock).toHaveBeenCalledTimes(1);
    const sendArgs = H.resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(sendArgs.to).toBe('c@x.test');
    expect(sendArgs.subject).toBe('Hello');
    expect((sendArgs.from as string)).toContain('Acme Co');
    expect((sendArgs.from as string)).toContain('noreply@simplerdevelopment.com');
    expect(sendArgs.html).toContain('Some body content');

    // activity was logged + contact updated
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0]).toMatchObject({
      clientId: 10,
      contactId: 1,
      type: 'email',
      title: 'Hello',
      createdBy: 7,
    });
    const contact = state.contacts[0];
    expect(contact.lastContactedAt).toBeInstanceOf(Date);
    expect(contact.updatedAt).toBeInstanceOf(Date);
  });

  it('trims subject/body and converts newlines in body to <br />', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    await callSendEmail('1', {
      subject: '  Trimmed  ',
      body: '  line1\nline2  ',
    });
    const sendArgs = H.resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(sendArgs.subject).toBe('Trimmed');
    expect(sendArgs.html).toContain('line1<br />line2');
    expect(state.activities[0]).toMatchObject({ title: 'Trimmed' });
  });

  it('truncates the activity description at 200 chars and adds an ellipsis', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    const longBody = 'x'.repeat(250);
    await callSendEmail('1', { subject: 'subj', body: longBody });
    const desc = state.activities[0].description as string;
    expect(desc.length).toBe(203); // 200 chars + "..."
    expect(desc.endsWith('...')).toBe(true);
  });

  it('does NOT add an ellipsis when body is exactly 200 chars', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    const body = 'y'.repeat(200);
    await callSendEmail('1', { subject: 'subj', body });
    const desc = state.activities[0].description as string;
    expect(desc.endsWith('...')).toBe(false);
    expect(desc.length).toBe(200);
  });

  it('uses RESEND_FROM_EMAIL when set', async () => {
    process.env.RESEND_FROM_EMAIL = 'custom@from.test';
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    await callSendEmail('1', { subject: 's', body: 'b' });
    const sendArgs = H.resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect((sendArgs.from as string)).toContain('custom@from.test');
  });

  it('falls back to "Simpler Development" when client.company is missing', async () => {
    H.getPortalClientMock.mockResolvedValueOnce({ id: 10 }); // no company
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    await callSendEmail('1', { subject: 's', body: 'b' });
    const sendArgs = H.resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect((sendArgs.from as string).startsWith('Simpler Development <')).toBe(true);
  });

  // -- Error paths ---------------------------------------------------------

  it('returns 500 with the Resend error message when result.error is set', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    H.resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'bad sender' },
    });
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toBe('bad sender');
    // No activity logged on Resend error
    expect(state.activities).toHaveLength(0);
  });

  it('falls back to a generic 500 message when Resend error has no message', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    H.resendSendMock.mockResolvedValueOnce({ data: null, error: {} });
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toBe('Failed to send email');
  });

  it('returns 500 when Resend itself throws', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    H.resendSendMock.mockRejectedValueOnce(new Error('boom'));
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toBe('Failed to send email');
    expect(state.activities).toHaveLength(0);
  });

  it('returns 500 when Resend rejects with a non-Error value', async () => {
    state.contacts.push({ id: 1, clientId: 10, email: 'c@x.test' });
    H.resendSendMock.mockRejectedValueOnce('string-rejection');
    const res = await callSendEmail('1', { subject: 's', body: 'b' });
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// POST /api/portal/email/preview
// ===========================================================================

describe('POST /api/portal/email/preview', () => {
  beforeEach(() => {
    // Default: authorized as user 7 for client 10
    H.authorizePortalMock.mockResolvedValue({
      client: { id: 10 },
      userId: 7,
      role: 'admin',
    });

    H.renderCampaignPreviewMock.mockReturnValue({
      html: '<html>preview</html>',
      text: 'preview',
      blocksHash: 'hash-preview',
    });

    H.getOrRenderCampaignHtmlMock.mockResolvedValue({
      html: '<html>cached</html>',
      text: 'cached',
      blocksHash: 'hash-cached',
      cached: true,
    });
  });

  function callPreview(body: unknown) {
    return PreviewPOST(
      makeJsonReq('http://x/api/portal/email/preview', body) as never,
    );
  }

  // -- Auth ---------------------------------------------------------------

  it('returns the portal-auth error response when unauthorized', async () => {
    const errResp = new Response(
      JSON.stringify({ success: false, message: 'nope' }),
      { status: 401 },
    );
    H.authorizePortalMock.mockResolvedValueOnce({ response: errResp });
    const res = await callPreview({ blocks: [] });
    expect(res).toBe(errResp);
  });

  it('passes the right service requirement to authorizePortal', async () => {
    await callPreview({ blocks: [] });
    expect(H.authorizePortalMock).toHaveBeenCalledWith({
      action: 'read',
      requireService: 'email',
    });
  });

  // -- Body validation ----------------------------------------------------

  it('returns 400 on invalid JSON body', async () => {
    const req = makeRawReq('http://x/api/portal/email/preview', '{not-json');
    const res = await PreviewPOST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe('Invalid JSON body');
  });

  it('returns 400 when blocks is missing', async () => {
    const res = await callPreview({});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('blocks');
  });

  it('returns 400 when blocks is not an array', async () => {
    const res = await callPreview({ blocks: 'nope' });
    expect(res.status).toBe(400);
  });

  // -- Preview (no campaignId) -------------------------------------------

  it('renders a fresh preview when no campaignId is supplied', async () => {
    const res = await callPreview({
      blocks: [{ id: 'a', type: 'text' }],
      subject: 'Subj',
      previewText: 'Preview here',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.html).toBe('<html>preview</html>');
    expect(json.data.text).toBe('preview');
    expect(json.data.blocksHash).toBe('hash-preview');
    expect(json.data.cached).toBe(false);
    expect(json.data.subject).toBe('Subj');

    expect(H.renderCampaignPreviewMock).toHaveBeenCalledTimes(1);
    const args = H.renderCampaignPreviewMock.mock.calls[0];
    expect(args[0]).toEqual([{ id: 'a', type: 'text' }]);
    expect(args[1]).toEqual({ previewText: 'Preview here', unsubscribeUrl: '#' });
    expect(H.getOrRenderCampaignHtmlMock).not.toHaveBeenCalled();
  });

  it('treats `preheader` as an alias for `previewText`', async () => {
    await callPreview({
      blocks: [],
      preheader: 'from preheader',
    });
    const args = H.renderCampaignPreviewMock.mock.calls[0];
    expect(args[1]).toEqual({ previewText: 'from preheader', unsubscribeUrl: '#' });
  });

  it('prefers `preheader` over `previewText` when both are supplied', async () => {
    await callPreview({
      blocks: [],
      preheader: 'first',
      previewText: 'second',
    });
    const args = H.renderCampaignPreviewMock.mock.calls[0];
    expect((args[1] as Record<string, unknown>).previewText).toBe('first');
  });

  // -- Campaign-scoped cache ---------------------------------------------

  it('uses the cache when a valid campaignId is supplied', async () => {
    state.campaigns.push({ id: 55, clientId: 10 });
    const res = await callPreview({
      blocks: [{ id: 'a', type: 'text' }],
      campaignId: 55,
      subject: 'Subj',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.html).toBe('<html>cached</html>');
    expect(json.data.cached).toBe(true);
    expect(json.data.blocksHash).toBe('hash-cached');

    expect(H.getOrRenderCampaignHtmlMock).toHaveBeenCalledTimes(1);
    const [cid, blocks, opts] = H.getOrRenderCampaignHtmlMock.mock.calls[0];
    expect(cid).toBe(55);
    expect(blocks).toEqual([{ id: 'a', type: 'text' }]);
    expect(opts).toEqual({ previewText: null, subject: 'Subj' });
    expect(H.renderCampaignPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 404 when campaignId is not owned by the calling client', async () => {
    state.campaigns.push({ id: 55, clientId: 999 });
    const res = await callPreview({ blocks: [], campaignId: 55 });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe('Campaign not found');
    expect(H.getOrRenderCampaignHtmlMock).not.toHaveBeenCalled();
  });

  it('returns 404 when campaignId does not exist', async () => {
    const res = await callPreview({ blocks: [], campaignId: 9999 });
    expect(res.status).toBe(404);
  });

  // -- sendTest flag ------------------------------------------------------

  it('returns 400 sendTest when the user has no email on file', async () => {
    // no users.push for userId=7
    const res = await callPreview({ blocks: [], sendTest: true });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('current user has no email');
  });

  it('sends a test email when sendTest=true and user has an email', async () => {
    state.users.push({ id: 7, email: 'me@x.test' });
    H.renderCampaignPreviewMock.mockReturnValueOnce({
      html: 'before {{UNSUBSCRIBE_URL}} after',
      text: 'plain',
      blocksHash: 'h1',
    });
    const res = await callPreview({
      blocks: [],
      subject: 'My Subj',
      sendTest: true,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.testSent).toEqual({ to: 'me@x.test', ok: true });

    expect(H.resendSendMock).toHaveBeenCalledTimes(1);
    const args = H.resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.to).toBe('me@x.test');
    expect(args.subject).toBe('[TEST] My Subj');
    expect(args.text).toBe('plain');
    // {{UNSUBSCRIBE_URL}} token was replaced by buildUnsubscribeUrl
    expect((args.html as string)).toContain('https://x/u?token=test-');
    expect((args.html as string)).not.toContain('{{UNSUBSCRIBE_URL}}');
    expect((args.from as string)).toContain('Block Builder Test');
    expect((args.from as string)).toContain('noreply@simplerdevelopment.com');
  });

  it('falls back to a default subject when subject is missing on test send', async () => {
    state.users.push({ id: 7, email: 'me@x.test' });
    await callPreview({ blocks: [], sendTest: true });
    const args = H.resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.subject).toBe('[TEST] Email block builder preview');
  });

  it('uses EMAIL_TEST_FROM when set for the test send', async () => {
    state.users.push({ id: 7, email: 'me@x.test' });
    process.env.EMAIL_TEST_FROM = 'from@test.test';
    await callPreview({ blocks: [], sendTest: true });
    const args = H.resendSendMock.mock.calls[0][0] as Record<string, unknown>;
    expect((args.from as string)).toContain('from@test.test');
  });

  it('reports testSent ok=false when resend throws', async () => {
    state.users.push({ id: 7, email: 'me@x.test' });
    H.resendSendMock.mockRejectedValueOnce(new Error('smtp down'));
    const res = await callPreview({ blocks: [], sendTest: true });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.testSent).toEqual({ to: 'me@x.test', ok: false });
  });

  it('does not call resend when sendTest is not set', async () => {
    const res = await callPreview({ blocks: [] });
    expect(res.status).toBe(200);
    expect(H.resendSendMock).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.data.testSent).toBeUndefined();
  });
});
