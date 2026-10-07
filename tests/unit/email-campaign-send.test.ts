// @vitest-environment node
/**
 * Unit tests for lib/email/campaign-send.ts.
 *
 * `executeCampaignSend` is a stateful dispatch loop: it queries the DB to find
 * already-sent recipients, fetches active subscribers, transitions the
 * campaign status to "sending", optionally renders a cached HTML body via the
 * block-render cache, sends to each remaining subscriber via Resend, and
 * finally transitions the campaign to "sent". We mock @/lib/db, drizzle-orm
 * operators, the resend client, the index helpers, and the render-cache so
 * each test can exercise a specific branch of the loop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared state — vi.hoisted runs before all vi.mock factories.
// ---------------------------------------------------------------------------
const H = vi.hoisted(() => {
  interface DbState {
    alreadySent: Array<{ subscriberId: number }>;
    activeSubs: Array<{
      id: number;
      email: string;
      unsubscribeToken: string;
    }>;
  }
  const dbState: DbState = {
    alreadySent: [],
    activeSubs: [],
  };
  const updateCalls: Array<Record<string, unknown>> = [];
  const insertCalls: Array<Record<string, unknown>> = [];
  let rejectReceipt = false;
  return {
    dbState,
    updateCalls,
    insertCalls,
    rejectReceipt: () => rejectReceipt,
    setRejectReceipt: (value: boolean) => { rejectReceipt = value; },
    resendSendMock: vi.fn(),
    // Batch mock: mimics resend.batch.send with permissive validation —
    // returns one id per payload in request order.
    resendBatchMock: vi.fn(async (payloads: unknown[]) => ({
      data: {
        data: (payloads as unknown[]).map((_, i) => ({ id: `batch-id-${i}` })),
        errors: [],
      },
      error: null,
    })),
    getOrRenderMock: vi.fn(),
    htmlToTextMock: vi.fn(),
    buildCampaignHtmlMock: vi.fn(),
    buildUnsubscribeUrlMock: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
  return new Proxy({
    emailCampaigns: wrap('emailCampaigns'),
    emailCampaignSends: wrap('emailCampaignSends'),
    emailSubscribers: wrap('emailSubscribers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  const makeSelectChain = () => {
    let table = '';
    const chain: Record<string, unknown> = {
      from(t: { __table: string }) {
        table = t.__table;
        return chain;
      },
      where() {
        if (table === 'emailCampaignSends') return H.dbState.alreadySent;
        if (table === 'emailSubscribers') return H.dbState.activeSubs;
        return [];
      },
    };
    return chain;
  };
  const makeUpdateChain = (table: string) => {
    const call: Record<string, unknown> = { table };
    const chain: Record<string, unknown> = {
      set(values: Record<string, unknown>) {
        call.values = values;
        return chain;
      },
      where(predicate: unknown) {
        call.where = predicate;
        H.updateCalls.push(call);
        return Promise.resolve(undefined);
      },
    };
    return chain;
  };
  const makeInsertChain = (table: string) => {
    const call: Record<string, unknown> = { table };
    return {
      values(values: Record<string, unknown>) {
        call.values = values;
        H.insertCalls.push(call);
        return { onConflictDoNothing: () => {
          if (H.rejectReceipt()) throw new Error('receipt database unavailable');
          H.dbState.alreadySent.push({ subscriberId: values.subscriberId as number });
          return Promise.resolve(undefined);
        } };
      },
    };
  };
  return {
    db: {
      select() {
        return makeSelectChain();
      },
      update(t: { __table: string }) {
        return makeUpdateChain(t.__table);
      },
      insert(t: { __table: string }) {
        return makeInsertChain(t.__table);
      },
    },
  };
});

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => H.resendSendMock(...args),
    },
  },
  buildCampaignHtml: (...args: unknown[]) => H.buildCampaignHtmlMock(...args),
  buildUnsubscribeUrl: (...args: unknown[]) => H.buildUnsubscribeUrlMock(...args),
}));

vi.mock('@/lib/email/render-cache', () => ({
  getOrRenderCampaignHtml: (...args: unknown[]) => H.getOrRenderMock(...args),
  htmlToText: (...args: unknown[]) => H.htmlToTextMock(...args),
}));

// Persistence invariants are exercised against Postgres in campaign-safety
// integration tests. These tests cover dispatch behavior at that boundary.
vi.mock('@/lib/email/campaign-safety', () => ({
  freezeCampaignRecipients: vi.fn(async (_id, campaign, active) => campaign.dispatchPlan ?? active.map(row => ({ ...row, variant: null }))),
  campaignDeliveryPayload: vi.fn(async (campaignId, subscriberId, payload) => ({ ...payload, idempotencyKey: `campaign:${campaignId}:subscriber:${subscriberId}` })),
}));

vi.mock('@/lib/email/campaign-finalize', () => ({
  finalizeCampaignDispatch: vi.fn(async (_id, totalRecipients, testing, failed) => {
    H.updateCalls.push({ table: 'emailCampaigns', values: {
      status: failed > 0 ? 'partial' : testing ? 'ab_testing' : 'sent',
      totalRecipients, totalSent: H.dbState.alreadySent.length, sentAt: failed > 0 ? null : new Date(),
    } });
  }),
}));

// Mock resolveResendKey — tests use campaigns with no clientId so this is
// only hit when clientId is set; mock it regardless to avoid real DB/crypto.
vi.mock('@/lib/email/resolve-resend', () => ({
  resolveResendKey: vi.fn().mockResolvedValue({ key: 'test-resend-key', source: 'platform' }),
}));

// Mock the Resend constructor so new Resend(key).emails.send routes to
// H.resendSendMock and .batch.send routes to H.resendBatchMock. The platform
// key path (clientId == null) and the BYOK path both call `new Resend(key)`
// now, so we intercept at the class level.
vi.mock('resend', () => {
  class MockResend {
    emails = { send: (...args: unknown[]) => H.resendSendMock(...args) };
    batch = { send: (...args: unknown[]) => H.resendBatchMock(...args) };
  }
  return { Resend: MockResend };
});

// ---------------------------------------------------------------------------
// SUT (after mocks)
// ---------------------------------------------------------------------------
import { executeCampaignSend } from '@/lib/email/campaign-send';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCampaign(overrides: Partial<Record<string, unknown>> = {}): {
  id: number;
  listId: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  previewText: string | null;
  htmlContent: string;
  useBlockEditor: boolean;
  contentBlocks: unknown[] | null;
  status: string;
} {
  return {
    id: 1,
    listId: 10,
    subject: 'Hello',
    fromName: 'Acme',
    fromEmail: 'noreply@acme.test',
    replyTo: null,
    previewText: null,
    htmlContent: '<p>Body</p>',
    useBlockEditor: false,
    contentBlocks: null,
    status: 'queued',
    ...overrides,
  } as ReturnType<typeof makeCampaign>;
}

beforeEach(() => {
  // Ensure the platform Resend key is present so the else-branch in
  // executeCampaignSend doesn't throw before reaching the mocked Resend ctor.
  process.env.RESEND_API_KEY = 'test-platform-key';
  process.env.EMAIL_TRANSPORT = 'resend';
  H.setRejectReceipt(false);
  H.dbState.alreadySent = [];
  H.dbState.activeSubs = [];
  H.updateCalls.length = 0;
  H.insertCalls.length = 0;
  H.resendSendMock.mockReset();
  H.resendSendMock.mockResolvedValue({ data: { id: 'msg_default' }, error: null });
  H.resendBatchMock.mockReset();
  H.resendBatchMock.mockImplementation(async (payloads: unknown[]) => ({
    data: {
      data: (payloads as unknown[]).map((_, i) => ({ id: `batch-id-${i}` })),
      errors: [],
    },
    error: null,
  }));
  H.getOrRenderMock.mockReset();
  H.htmlToTextMock.mockReset();
  H.htmlToTextMock.mockImplementation((html: string) => `TEXT:${html}`);
  H.buildCampaignHtmlMock.mockReset();
  H.buildCampaignHtmlMock.mockImplementation(
    (raw: string, unsubUrl: string) => `<wrapped raw="${raw}" unsub="${unsubUrl}"/>`,
  );
  H.buildUnsubscribeUrlMock.mockReset();
  H.buildUnsubscribeUrlMock.mockImplementation((tok: string) => `https://u.test/${tok}`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeCampaignSend', () => {
  it('throws when there are no active subscribers remaining', async () => {
    H.dbState.activeSubs = [];
    await expect(executeCampaignSend(1, makeCampaign())).rejects.toThrow(
      /No active subscribers remaining/,
    );
    // No status transitions when no targets
    expect(H.updateCalls).toHaveLength(0);
    expect(H.resendSendMock).not.toHaveBeenCalled();
  });

  it('recovers completion after every receipt was saved but the final status update was lost', async () => {
    H.dbState.activeSubs = [
      { id: 1, email: 'a@a.test', unsubscribeToken: 't1' },
      { id: 2, email: 'b@b.test', unsubscribeToken: 't2' },
    ];
    H.dbState.alreadySent = [{ subscriberId: 1 }, { subscriberId: 2 }];

    expect(await executeCampaignSend(1, makeCampaign({ status: 'partial' }))).toEqual({ sent: 0, failed: 0, total: 0 });
    expect(H.resendSendMock).not.toHaveBeenCalled();
    const final = H.updateCalls.at(-1)!.values as Record<string, unknown>;
    expect(final.status).toBe('sent'); expect(final.totalSent).toBe(2);
  });

  it('sends to the remaining subscribers and transitions status to sending then sent', async () => {
    H.dbState.activeSubs = [
      { id: 1, email: 'a@a.test', unsubscribeToken: 't1' },
      { id: 2, email: 'b@b.test', unsubscribeToken: 't2' },
      { id: 3, email: 'c@c.test', unsubscribeToken: 't3' },
    ];
    H.dbState.alreadySent = [{ subscriberId: 2 }];
    H.resendSendMock.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null });
    H.resendSendMock.mockResolvedValueOnce({ data: { id: 'msg_3' }, error: null });

    const result = await executeCampaignSend(1, makeCampaign());

    expect(result).toEqual({ sent: 2, failed: 0, total: 2 });
    expect(H.resendSendMock).toHaveBeenCalledTimes(2);
    expect(H.resendSendMock.mock.calls.map(call => call[1])).toEqual([
      { idempotencyKey: 'campaign:1:subscriber:1' }, { idempotencyKey: 'campaign:1:subscriber:3' },
    ]);
    expect(H.resendBatchMock).not.toHaveBeenCalled();

    // Two campaign-level update calls: status=sending, status=sent
    expect(H.updateCalls).toHaveLength(2);
    expect((H.updateCalls[0].values as Record<string, unknown>).status).toBe('sending');
    expect((H.updateCalls[0].values as Record<string, unknown>).totalRecipients).toBe(3);
    expect((H.updateCalls[1].values as Record<string, unknown>).status).toBe('sent');
    expect((H.updateCalls[1].values as Record<string, unknown>).totalSent).toBe(3);

    // Two insert rows into emailCampaignSends with resend ids
    expect(H.insertCalls).toHaveLength(2);
    expect((H.insertCalls[0].values as Record<string, unknown>).resendEmailId).toBe('msg_1');
    expect((H.insertCalls[1].values as Record<string, unknown>).resendEmailId).toBe('msg_3');

    // Skipped subscriber id=2 should not appear
    const subscriberIds = H.insertCalls.map(
      c => (c.values as Record<string, unknown>).subscriberId,
    );
    expect(subscriberIds).toEqual([1, 3]);

    // Each send used the buildCampaignHtml wrapper path (no block editor)
    expect(H.buildCampaignHtmlMock).toHaveBeenCalledTimes(2);
    expect(H.getOrRenderMock).not.toHaveBeenCalled();
  });

  it('renders via the cache once and substitutes the unsubscribe placeholder when useBlockEditor=true', async () => {
    H.dbState.activeSubs = [
      { id: 1, email: 'a@a.test', unsubscribeToken: 'tok1' },
      { id: 2, email: 'b@b.test', unsubscribeToken: 'tok2' },
    ];
    H.getOrRenderMock.mockResolvedValueOnce({
      html: '<p>hi</p><a href="{{UNSUBSCRIBE_URL}}">Unsub</a><a href="{{UNSUBSCRIBE_URL}}">Again</a>',
      text: 'cached-text',
    });

    const campaign = makeCampaign({
      useBlockEditor: true,
      contentBlocks: [{ id: 'h1', type: 'heading' }],
      previewText: 'preview',
      subject: 'Subj',
    });

    const result = await executeCampaignSend(7, campaign);

    expect(result).toEqual({ sent: 2, failed: 0, total: 2 });
    expect(H.getOrRenderMock).toHaveBeenCalledTimes(1);
    // Cache key derived from campaign id we passed in (7), not the campaign object's internal id
    expect(H.getOrRenderMock.mock.calls[0][0]).toBe(7);
    expect(H.buildCampaignHtmlMock).not.toHaveBeenCalled();
    expect(H.htmlToTextMock).not.toHaveBeenCalled();

    // Verify substitution: each placeholder replaced with the recipient's URL
    const batchPayloads = H.resendSendMock.mock.calls.map(call => call[0]) as Array<{ html: string; text: string }>;
    const firstSend = batchPayloads[0];
    expect(firstSend.html).not.toContain('{{UNSUBSCRIBE_URL}}');
    expect(firstSend.html).toContain('https://u.test/tok1');
    expect((firstSend.html.match(/https:\/\/u\.test\/tok1/g) || []).length).toBe(2);
    expect(firstSend.text).toBe('cached-text');

    const secondSend = batchPayloads[1];
    expect(secondSend.html).toContain('https://u.test/tok2');
    expect(secondSend.html).not.toContain('tok1');
  });

  it('skips block-editor rendering when contentBlocks is not an array', async () => {
    H.dbState.activeSubs = [{ id: 1, email: 'a@a.test', unsubscribeToken: 't1' }];

    await executeCampaignSend(
      1,
      makeCampaign({ useBlockEditor: true, contentBlocks: null }),
    );

    expect(H.getOrRenderMock).not.toHaveBeenCalled();
    expect(H.buildCampaignHtmlMock).toHaveBeenCalledTimes(1);
    expect(H.htmlToTextMock).toHaveBeenCalledTimes(1);
  });

  it('builds the Resend payload with from/replyTo/subject/list-unsubscribe headers', async () => {
    H.dbState.activeSubs = [{ id: 1, email: 'alice@a.test', unsubscribeToken: 'tok' }];

    await executeCampaignSend(
      1,
      makeCampaign({
        subject: 'My Subj',
        fromName: 'Acme Co',
        fromEmail: 'hi@acme.test',
        replyTo: 'reply@acme.test',
      }),
    );

    const payload = (
      H.resendSendMock.mock.calls[0][0] as {
        from: string;
        to: string;
        subject: string;
        replyTo?: string;
        headers: Record<string, string>;
      }
    );
    expect(payload.from).toBe('Acme Co <hi@acme.test>');
    expect(payload.to).toBe('alice@a.test');
    expect(payload.subject).toBe('My Subj');
    expect(payload.replyTo).toBe('reply@acme.test');
    expect(payload.headers['List-Unsubscribe']).toBe('<https://u.test/tok>');
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('omits replyTo from the payload when campaign.replyTo is falsy', async () => {
    H.dbState.activeSubs = [{ id: 1, email: 'a@a.test', unsubscribeToken: 't1' }];

    await executeCampaignSend(1, makeCampaign({ replyTo: null }));

    const payload = (
      H.resendSendMock.mock.calls[0][0] as {
        from: string;
        to: string;
        subject: string;
        replyTo?: string;
        headers: Record<string, string>;
      }
    );
    expect('replyTo' in payload).toBe(false);
  });

  it('counts a recipient provider error as failed without recording a send row', async () => {
    H.dbState.activeSubs = [{ id: 1, email: 'a@a.test', unsubscribeToken: 't1' }];
    H.resendSendMock.mockResolvedValueOnce({ data: null, error: { message: 'bad address' } });

    const result = await executeCampaignSend(1, makeCampaign());

    expect(result).toEqual({ sent: 0, failed: 1, total: 1 });
    expect(H.insertCalls).toHaveLength(0);
  });

  it('records partial delivery and continues after one provider rejection', async () => {
    H.dbState.activeSubs = [
      { id: 1, email: 'a@a.test', unsubscribeToken: 't1' },
      { id: 2, email: 'b@b.test', unsubscribeToken: 't2' },
      { id: 3, email: 'c@c.test', unsubscribeToken: 't3' },
    ];
    H.resendSendMock.mockResolvedValueOnce({ data: { id: 'm1' }, error: null });
    H.resendSendMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    H.resendSendMock.mockResolvedValueOnce({ data: { id: 'm3' }, error: null });

    const result = await executeCampaignSend(1, makeCampaign());

    expect(result).toEqual({ sent: 2, failed: 1, total: 3 });
    // Only successful sends produce inserts
    expect(H.insertCalls).toHaveLength(2);
    const ids = H.insertCalls.map(c => (c.values as Record<string, unknown>).subscriberId);
    expect(ids).toEqual([1, 3]);

    // Final status reflects sent count
    const finalUpdate = H.updateCalls[H.updateCalls.length - 1];
    expect((finalUpdate.values as Record<string, unknown>).totalSent).toBe(2);
    expect((finalUpdate.values as Record<string, unknown>).status).toBe('partial');
    expect((finalUpdate.values as Record<string, unknown>).sentAt).toBeNull();
  });

  it('isolates a recipient payload construction failure', async () => {
    H.dbState.activeSubs = [{ id: 1, email: 'a@a.test', unsubscribeToken: 't1' }];
    // The DB mock will succeed; force an insert-side failure by making resend ok
    // but stubbing the insert via the resend mock chain isn't possible. Instead
    // simulate by throwing inside buildUnsubscribeUrl which sits before send.
    H.buildUnsubscribeUrlMock.mockImplementationOnce(() => {
      throw new Error('url-broken');
    });

    const result = await executeCampaignSend(1, makeCampaign());

    expect(result).toEqual({ sent: 0, failed: 1, total: 1 });
    expect(H.resendSendMock).not.toHaveBeenCalled();
    expect(H.resendBatchMock).not.toHaveBeenCalled();
    expect(H.insertCalls).toHaveLength(0);
  });

  it('records failed delivery when every recipient transport call throws', async () => {
    H.dbState.activeSubs = [
      { id: 1, email: 'a@a.test', unsubscribeToken: 't1' },
      { id: 2, email: 'b@b.test', unsubscribeToken: 't2' },
    ];
    H.resendSendMock.mockRejectedValue(new Error('transport down'));

    const result = await executeCampaignSend(1, makeCampaign());

    expect(result).toEqual({ sent: 0, failed: 2, total: 2 });
    expect(H.insertCalls).toHaveLength(0);
  });

  it('retries only the failed recipient, preserving the provider key and cumulative delivered count', async () => {
    H.dbState.activeSubs = [
      { id: 1, email: 'one@example.test', unsubscribeToken: 'one' },
      { id: 2, email: 'two@example.test', unsubscribeToken: 'two' },
      { id: 3, email: 'three@example.test', unsubscribeToken: 'three' },
    ];
    H.resendSendMock.mockResolvedValueOnce({ data: { id: 'm1' }, error: null });
    H.resendSendMock.mockResolvedValueOnce({ data: null, error: { message: 'temporary outage' } });
    H.resendSendMock.mockResolvedValueOnce({ data: { id: 'm3' }, error: null });
    expect(await executeCampaignSend(1, makeCampaign())).toEqual({ sent: 2, failed: 1, total: 3 });
    expect((H.updateCalls.at(-1)!.values as Record<string, unknown>).status).toBe('partial');
    expect(await executeCampaignSend(1, makeCampaign({ status: 'partial' }))).toEqual({ sent: 1, failed: 0, total: 1 });
    expect(H.resendSendMock.mock.calls.map(call => call[0].to)).toEqual(['one@example.test', 'two@example.test', 'three@example.test', 'two@example.test']);
    expect(H.resendSendMock.mock.calls[1][1]).toEqual(H.resendSendMock.mock.calls[3][1]);
    const final = H.updateCalls.at(-1)!.values as Record<string, unknown>;
    expect(final.status).toBe('sent'); expect(final.totalSent).toBe(3);
  });

  it('a failed receipt insert retries with the same provider key after external acceptance', async () => {
    H.dbState.activeSubs = [{ id: 1, email: 'buyer@example.test', unsubscribeToken: 'one' }];
    H.setRejectReceipt(true);
    await expect(executeCampaignSend(1, makeCampaign())).rejects.toThrow('receipt database unavailable');
    expect(H.dbState.alreadySent).toHaveLength(0);
    expect((H.updateCalls.at(-1)!.values as Record<string, unknown>).status).toBe('partial');
    H.setRejectReceipt(false);
    expect(await executeCampaignSend(1, makeCampaign({ status: 'sending' }))).toEqual({ sent: 1, failed: 0, total: 1 });
    expect(H.resendSendMock.mock.calls[0][1]).toEqual({ idempotencyKey: 'campaign:1:subscriber:1' });
    expect(H.resendSendMock.mock.calls[1][1]).toEqual(H.resendSendMock.mock.calls[0][1]);
  });
});
