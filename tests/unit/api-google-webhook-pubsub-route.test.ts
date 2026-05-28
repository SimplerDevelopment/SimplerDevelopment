// @vitest-environment node
/**
 * Unit tests for `POST /api/google-webhook/pubsub`.
 *
 * This route is Google Cloud Pub/Sub's push receiver for Gmail watch
 * notifications. It is auth'd by a per-tenant verification token in the
 * `?token=` query param and processes the base64-encoded Pub/Sub envelope.
 *
 * The route's response policy is "stay at 200 whenever possible so Pub/Sub
 * stops retrying," so these tests assert both the status code AND the JSON
 * `reason` shape — that's the contract callers (us, debugging in prod) rely on.
 *
 * All external dependencies (db, drizzle-orm, schema, oauth refresh, tenant
 * credentials lookup, gmail history sync, gmail watch, gmail attachments,
 * brain ingest) are stubbed — this is a pure unit test of the route's
 * branching logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface DbState {
  selectQueue: unknown[][];
  updates: Array<{ table: string; values: Record<string, unknown> }>;
}

const dbState: DbState = {
  selectQueue: [],
  updates: [],
};

interface GoogleMockState {
  getTenantByToken: ReturnType<typeof vi.fn>;
  refreshIfExpired: ReturnType<typeof vi.fn>;
  syncHistorySince: ReturnType<typeof vi.fn>;
  startGmailWatch: ReturnType<typeof vi.fn>;
  fetchAndUploadGmailAttachments: ReturnType<typeof vi.fn>;
  ingestGmailMessageIntoBrain: ReturnType<typeof vi.fn>;
}

const googleState: GoogleMockState = {
  getTenantByToken: vi.fn(),
  refreshIfExpired: vi.fn(),
  syncHistorySince: vi.fn(),
  startGmailWatch: vi.fn(),
  fetchAndUploadGmailAttachments: vi.fn(),
  ingestGmailMessageIntoBrain: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  function tableProxy(name: string) {
    return new Proxy(
      { _name: name },
      {
        get(_target, prop) {
          if (prop === '_name') return name;
          return `${name}.${String(prop)}`;
        },
      },
    );
  }
  return {
    googleWorkspaceUserConnections: tableProxy('googleWorkspaceUserConnections'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  isNull: (a: unknown) => ({ _op: 'isNull', a }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    _op: 'sql',
    strings,
    vals,
  }),
}));

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = dbState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'groupBy', 'offset'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }

  function makeUpdateChain(table: string) {
    let captured: Record<string, unknown> = {};
    const updateChain: Record<string, unknown> = {};
    updateChain.set = (v: Record<string, unknown>) => {
      captured = v;
      return updateChain;
    };
    updateChain.where = () => {
      dbState.updates.push({ table, values: captured });
      return Promise.resolve(undefined);
    };
    return updateChain;
  }

  function tableName(t: unknown): string {
    if (t && typeof t === 'object' && '_name' in t) {
      return String((t as { _name: unknown })._name);
    }
    return 'unknown';
  }

  return {
    db: {
      select: () => makeSelectChain(),
      update: (t: unknown) => makeUpdateChain(tableName(t)),
    },
  };
});

vi.mock('@/lib/google/oauth', () => ({
  refreshIfExpired: (...args: unknown[]) => googleState.refreshIfExpired(...args),
}));

vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByPubsubToken: (...args: unknown[]) =>
    googleState.getTenantByToken(...args),
}));

// Re-export the real HistoryTooOldError class so the route can `err instanceof
// HistoryTooOldError` correctly. syncHistorySince itself is stubbed.
class FakeHistoryTooOldError extends Error {
  constructor() {
    super('history_too_old');
    this.name = 'HistoryTooOldError';
  }
}
vi.mock('@/lib/google/gmail-history', () => ({
  syncHistorySince: (...args: unknown[]) => googleState.syncHistorySince(...args),
  HistoryTooOldError: FakeHistoryTooOldError,
}));

vi.mock('@/lib/google/gmail-watch', () => ({
  startGmailWatch: (...args: unknown[]) => googleState.startGmailWatch(...args),
}));

vi.mock('@/lib/google/gmail-attachments', () => ({
  fetchAndUploadGmailAttachments: (...args: unknown[]) =>
    googleState.fetchAndUploadGmailAttachments(...args),
}));

vi.mock('@/lib/brain/ingest-gmail-message', () => ({
  ingestGmailMessageIntoBrain: (...args: unknown[]) =>
    googleState.ingestGmailMessageIntoBrain(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PubsubMessageBody {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

function encodeData(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function makeRequest(
  body: string | PubsubMessageBody,
  token: string | null = 'valid_token',
): NextRequest {
  const url = token === null
    ? 'http://localhost/api/google-webhook/pubsub'
    : `http://localhost/api/google-webhook/pubsub?token=${encodeURIComponent(token)}`;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: bodyStr,
  }) as unknown as NextRequest;
}

interface RouteJson {
  ok?: boolean;
  error?: string;
  reason?: string;
  fetched?: number;
  inserted?: number;
  skipped?: number;
  attachmentsUploaded?: number;
  latestHistoryId?: string;
}

const TENANT = {
  clientId: 1,
  pubsubTopic: 'projects/p/topics/t',
  oauth: { clientId: 'c', clientSecret: 's', redirectUri: 'r' },
};

const CONN_BASE = {
  id: 42,
  clientId: 1,
  googleAccountEmail: 'alice@example.com',
  accessToken: 'old_access',
  refreshToken: 'old_refresh',
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  gmailHistoryId: '1000',
  gmailWatchExpiration: null,
  revokedAt: null,
  syncSettings: null as unknown,
};

beforeEach(() => {
  vi.resetModules();
  dbState.selectQueue = [];
  dbState.updates = [];
  googleState.getTenantByToken.mockReset();
  googleState.refreshIfExpired.mockReset();
  googleState.syncHistorySince.mockReset();
  googleState.startGmailWatch.mockReset();
  googleState.fetchAndUploadGmailAttachments.mockReset();
  googleState.ingestGmailMessageIntoBrain.mockReset();
  googleState.refreshIfExpired.mockResolvedValue({ refreshed: false });
  googleState.fetchAndUploadGmailAttachments.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/google-webhook/pubsub — token validation', () => {
  it('returns 401 missing_token when ?token is absent', async () => {
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest('{}', null));
    expect(res.status).toBe(401);
    expect(((await res.json()) as RouteJson).error).toBe('missing_token');
    expect(googleState.getTenantByToken).not.toHaveBeenCalled();
  });

  it('returns 401 unknown_token when the lookup returns null', async () => {
    googleState.getTenantByToken.mockResolvedValue(null);
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest('{}', 'bad_token'));
    expect(res.status).toBe(401);
    expect(((await res.json()) as RouteJson).error).toBe('unknown_token');
    expect(googleState.getTenantByToken).toHaveBeenCalledWith('bad_token');
  });
});

describe('POST /api/google-webhook/pubsub — envelope parsing', () => {
  beforeEach(() => {
    googleState.getTenantByToken.mockResolvedValue(TENANT);
  });

  it('returns 400 invalid_json when body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest('not-json'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('invalid_json');
  });

  it('returns 200 empty_data when envelope has no message.data (subscription setup ping)', async () => {
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { messageId: 'm1' } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.ok).toBe(true);
    expect(json.reason).toBe('empty_data');
  });

  it('returns 400 invalid_data_payload when base64 decodes to invalid JSON', async () => {
    const badB64 = Buffer.from('not-json-here', 'utf8').toString('base64');
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data: badB64 } }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('invalid_data_payload');
  });

  it('returns 400 missing_fields when emailAddress is absent', async () => {
    const data = encodeData({ historyId: '1234' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('missing_fields');
  });

  it('returns 400 missing_fields when historyId is absent', async () => {
    const data = encodeData({ emailAddress: 'alice@example.com' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('missing_fields');
  });
});

describe('POST /api/google-webhook/pubsub — connection lookup', () => {
  beforeEach(() => {
    googleState.getTenantByToken.mockResolvedValue(TENANT);
  });

  it('returns 200 no_connection when no active connection exists for the mailbox', async () => {
    dbState.selectQueue.push([]); // no rows
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '2000' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.ok).toBe(true);
    expect(json.reason).toBe('no_connection');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('lowercases emailAddress before lookup', async () => {
    dbState.selectQueue.push([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = encodeData({ emailAddress: 'ALICE@EXAMPLE.COM', historyId: '2000' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    // Warning message contains the lowercased address
    expect((warnSpy.mock.calls[0][0] as string)).toContain('alice@example.com');
    warnSpy.mockRestore();
  });
});

describe('POST /api/google-webhook/pubsub — first-push watermark', () => {
  it('initializes gmailHistoryId without backfill when stored watermark is null', async () => {
    googleState.getTenantByToken.mockResolvedValue(TENANT);
    dbState.selectQueue.push([{ ...CONN_BASE, gmailHistoryId: null }]);
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '5000' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.reason).toBe('watermark_initialized');
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].table).toBe('googleWorkspaceUserConnections');
    expect(dbState.updates[0].values.gmailHistoryId).toBe('5000');
    expect(googleState.syncHistorySince).not.toHaveBeenCalled();
  });

  it('coerces a numeric historyId to a string in the watermark', async () => {
    googleState.getTenantByToken.mockResolvedValue(TENANT);
    dbState.selectQueue.push([{ ...CONN_BASE, gmailHistoryId: null }]);
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: 7777 });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    expect(dbState.updates[0].values.gmailHistoryId).toBe('7777');
  });
});

describe('POST /api/google-webhook/pubsub — token refresh', () => {
  beforeEach(() => {
    googleState.getTenantByToken.mockResolvedValue(TENANT);
  });

  it('persists rotated access/refresh tokens after a successful refresh', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.refreshIfExpired.mockResolvedValue({
      refreshed: true,
      accessToken: 'new_access',
      refreshToken: 'new_refresh',
      expiresAt: new Date('2031-01-01T00:00:00Z'),
    });
    googleState.syncHistorySince.mockResolvedValue({ messages: [], latestHistoryId: '1001' });
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1001' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    // Two updates: token refresh + final watermark advance
    expect(dbState.updates).toHaveLength(2);
    expect(dbState.updates[0].values.accessToken).toBe('new_access');
    expect(dbState.updates[0].values.refreshToken).toBe('new_refresh');
  });

  it('keeps existing refresh token when refresh returns no new refresh_token', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.refreshIfExpired.mockResolvedValue({
      refreshed: true,
      accessToken: 'new_access',
      expiresAt: new Date('2031-01-01T00:00:00Z'),
      // no refreshToken
    });
    googleState.syncHistorySince.mockResolvedValue({ messages: [], latestHistoryId: '1001' });
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1001' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    expect(dbState.updates[0].values.refreshToken).toBe('old_refresh');
  });

  it('returns 200 refresh_failed when refresh throws', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.refreshIfExpired.mockRejectedValue(new Error('refresh boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1001' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.reason).toBe('refresh_failed');
    expect(googleState.syncHistorySince).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('POST /api/google-webhook/pubsub — history sync error paths', () => {
  beforeEach(() => {
    googleState.getTenantByToken.mockResolvedValue(TENANT);
  });

  it('restarts gmail watch when history is too old and returns history_too_old_rewatched', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.syncHistorySince.mockRejectedValue(new FakeHistoryTooOldError());
    googleState.startGmailWatch.mockResolvedValue({
      historyId: '9999',
      expiration: new Date('2030-06-01T00:00:00Z'),
    });
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1001' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.reason).toBe('history_too_old_rewatched');
    expect(googleState.startGmailWatch).toHaveBeenCalledTimes(1);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].values.gmailHistoryId).toBe('9999');
  });

  it('returns 200 rewatch_failed when re-watch itself throws', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.syncHistorySince.mockRejectedValue(new FakeHistoryTooOldError());
    googleState.startGmailWatch.mockRejectedValue(new Error('rewatch boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1001' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as RouteJson).reason).toBe('rewatch_failed');
    errSpy.mockRestore();
  });

  it('returns 200 sync_failed for any other syncHistorySince error', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.syncHistorySince.mockRejectedValue(new Error('transient gmail 503'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1001' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as RouteJson).reason).toBe('sync_failed');
    errSpy.mockRestore();
  });
});

describe('POST /api/google-webhook/pubsub — message ingestion', () => {
  beforeEach(() => {
    googleState.getTenantByToken.mockResolvedValue(TENANT);
  });

  it('reports zero counts when sync returns no messages', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.syncHistorySince.mockResolvedValue({
      messages: [],
      latestHistoryId: '1500',
    });
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1500' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.ok).toBe(true);
    expect(json.fetched).toBe(0);
    expect(json.inserted).toBe(0);
    expect(json.skipped).toBe(0);
    expect(json.attachmentsUploaded).toBe(0);
    expect(json.latestHistoryId).toBe('1500');
    // Final watermark update should have landed
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].values.gmailHistoryId).toBe('1500');
  });

  it('counts inserted vs skipped messages and totals attachment uploads', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    const messages = [
      { id: 'm1', attachments: [{ attachmentId: 'a1' }] },
      { id: 'm2', attachments: [] },
      { id: 'm3', attachments: [] },
    ];
    googleState.syncHistorySince.mockResolvedValue({ messages, latestHistoryId: '1600' });
    googleState.fetchAndUploadGmailAttachments
      .mockResolvedValueOnce([{ s3Key: 'k1' }, { s3Key: 'k2' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ s3Key: 'k3' }]);
    googleState.ingestGmailMessageIntoBrain
      .mockResolvedValueOnce({ status: 'inserted' })
      .mockResolvedValueOnce({ status: 'skipped' })
      .mockResolvedValueOnce({ status: 'inserted' });
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1600' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.fetched).toBe(3);
    expect(json.inserted).toBe(2);
    expect(json.skipped).toBe(1);
    expect(json.attachmentsUploaded).toBe(3);
    expect(json.latestHistoryId).toBe('1600');
  });

  it('counts a per-message ingest throw as skipped and still 200s', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    googleState.syncHistorySince.mockResolvedValue({
      messages: [
        { id: 'm1', attachments: [] },
        { id: 'm2', attachments: [] },
      ],
      latestHistoryId: '1700',
    });
    googleState.ingestGmailMessageIntoBrain
      .mockResolvedValueOnce({ status: 'inserted' })
      .mockRejectedValueOnce(new Error('brain insert blew up'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1700' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as RouteJson;
    expect(json.inserted).toBe(1);
    expect(json.skipped).toBe(1);
    errSpy.mockRestore();
  });

  it('passes storeBodies=true through to brain ingest when syncSettings sets it', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE, syncSettings: { storeBodies: true } }]);
    googleState.syncHistorySince.mockResolvedValue({
      messages: [{ id: 'm1', attachments: [] }],
      latestHistoryId: '1800',
    });
    googleState.ingestGmailMessageIntoBrain.mockResolvedValue({ status: 'inserted' });
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1800' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    expect(googleState.ingestGmailMessageIntoBrain).toHaveBeenCalledTimes(1);
    const ingestArg = googleState.ingestGmailMessageIntoBrain.mock.calls[0][0] as {
      storeBodies: boolean;
      clientId: number;
    };
    expect(ingestArg.storeBodies).toBe(true);
    expect(ingestArg.clientId).toBe(TENANT.clientId);
  });

  it('defaults storeBodies to false when syncSettings is null', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE, syncSettings: null }]);
    googleState.syncHistorySince.mockResolvedValue({
      messages: [{ id: 'm1', attachments: [] }],
      latestHistoryId: '1900',
    });
    googleState.ingestGmailMessageIntoBrain.mockResolvedValue({ status: 'inserted' });
    const data = encodeData({ emailAddress: 'alice@example.com', historyId: '1900' });
    const { POST } = await import('@/app/api/google-webhook/pubsub/route');
    const res = await POST(makeRequest({ message: { data } }));
    expect(res.status).toBe(200);
    const ingestArg = googleState.ingestGmailMessageIntoBrain.mock.calls[0][0] as {
      storeBodies: boolean;
    };
    expect(ingestArg.storeBodies).toBe(false);
  });
});
