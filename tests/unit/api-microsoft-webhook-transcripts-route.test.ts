// @vitest-environment node
/**
 * Unit tests for `POST /api/microsoft-webhook/transcripts`.
 *
 * This is Microsoft Graph's change-notification receiver for transcript
 * subscriptions. Two distinct request shapes hit it:
 *   1. Validation handshake — `?validationToken=<x>` echoed back as plain text.
 *   2. Change notification — JSON body with a `value` array; each entry is
 *      validated against the stored clientState keyed by subscriptionId.
 *
 * All external dependencies (db, drizzle-orm, schema, transcripts-sync) are
 * stubbed — pure unit coverage of the route's branching logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface DbState {
  selectQueue: unknown[][];
}

const dbState: DbState = {
  selectQueue: [],
};

interface MsMockState {
  syncTranscriptForSubscription: ReturnType<typeof vi.fn>;
  parseTranscriptResource: ReturnType<typeof vi.fn>;
}

const msState: MsMockState = {
  syncTranscriptForSubscription: vi.fn(),
  parseTranscriptResource: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks — declared before importing the route under test
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
    microsoftTeamsUserConnections: tableProxy('microsoftTeamsUserConnections'),
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
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = dbState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = [
      'from',
      'where',
      'innerJoin',
      'leftJoin',
      'orderBy',
      'limit',
      'groupBy',
      'offset',
    ];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }

  return {
    db: {
      select: () => makeSelectChain(),
    },
  };
});

// Re-export a fake NotConnectedError so the route's `err instanceof
// NotConnectedError` check fires when we want it to. syncTranscriptForSubscription
// and parseTranscriptResource are stubbed via msState.
class FakeNotConnectedError extends Error {
  constructor(message = 'not_connected') {
    super(message);
    this.name = 'NotConnectedError';
  }
}

vi.mock('@/lib/microsoft/transcripts-sync', () => ({
  syncTranscriptForSubscription: (...args: unknown[]) =>
    msState.syncTranscriptForSubscription(...args),
  parseTranscriptResource: (...args: unknown[]) =>
    msState.parseTranscriptResource(...args),
  NotConnectedError: FakeNotConnectedError,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Notification {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  resourceData?: { id?: string };
}

interface RouteJson {
  error?: string;
  success?: boolean;
  data?: { processed: number; rejected: number; unknown: number };
}

function makeRequest(
  body: string | { value: Notification[] | unknown } | null,
  opts: { validationToken?: string; rawText?: string } = {},
): NextRequest {
  const url = opts.validationToken
    ? `http://localhost/api/microsoft-webhook/transcripts?validationToken=${encodeURIComponent(opts.validationToken)}`
    : 'http://localhost/api/microsoft-webhook/transcripts';
  const bodyStr =
    opts.rawText !== undefined
      ? opts.rawText
      : typeof body === 'string'
        ? body
        : JSON.stringify(body);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: bodyStr,
  }) as unknown as NextRequest;
}

const CONN_BASE = {
  id: 42,
  clientId: 7,
  userId: 'user-1',
  clientState: 'expected_state',
};

beforeEach(() => {
  vi.resetModules();
  dbState.selectQueue = [];
  msState.syncTranscriptForSubscription.mockReset();
  msState.parseTranscriptResource.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/microsoft-webhook/transcripts — validation handshake', () => {
  it('echoes the validationToken as plain text with 200', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(makeRequest(null, { validationToken: 'tok-123' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(await res.text()).toBe('tok-123');
  });

  it('does not parse the body during validation handshake', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    // Body is intentionally invalid JSON — should still 200 because
    // validation handshake short-circuits before json parsing.
    const res = await POST(
      makeRequest(null, { validationToken: 'tok-x', rawText: 'not-json' }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('tok-x');
  });
});

describe('POST /api/microsoft-webhook/transcripts — envelope parsing', () => {
  it('returns 400 invalid_json when body is not JSON', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(makeRequest(null, { rawText: 'not-json' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('invalid_json');
  });

  it('returns 400 missing_value_array when body lacks a value array', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(makeRequest({ foo: 'bar' } as unknown as { value: unknown }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('missing_value_array');
  });

  it('returns 400 missing_value_array when value is not an array', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(makeRequest({ value: 'nope' as unknown as Notification[] }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('missing_value_array');
  });

  it('returns 400 missing_value_array when body parses to null', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(makeRequest(null as unknown as { value: unknown }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as RouteJson).error).toBe('missing_value_array');
  });

  it('returns 202 with zeroed counts on empty value array', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(makeRequest({ value: [] }));
    expect(res.status).toBe(202);
    const json = (await res.json()) as RouteJson;
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ processed: 0, rejected: 0, unknown: 0 });
  });
});

describe('POST /api/microsoft-webhook/transcripts — per-notification validation', () => {
  it('rejects notifications that are not objects', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({ value: [null, 'string', 42] as unknown as Notification[] }),
    );
    expect(res.status).toBe(202);
    const json = (await res.json()) as RouteJson;
    expect(json.data).toEqual({ processed: 0, rejected: 3, unknown: 0 });
  });

  it('rejects notifications missing subscriptionId or clientState', async () => {
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          { clientState: 's' }, // no subscriptionId
          { subscriptionId: 'sub-1' }, // no clientState
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 0,
      rejected: 2,
      unknown: 0,
    });
  });

  it('counts unknown when no connection row matches subscriptionId', async () => {
    dbState.selectQueue.push([]); // no rows
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          {
            subscriptionId: 'sub-missing',
            clientState: 'anything',
            resource: 'r',
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 0,
      rejected: 0,
      unknown: 1,
    });
  });

  it('rejects with a warn log when clientState mismatches', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          {
            subscriptionId: 'sub-1',
            clientState: 'wrong_state',
            resource: 'r',
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 0,
      rejected: 1,
      unknown: 0,
    });
    expect(warnSpy).toHaveBeenCalled();
    expect((warnSpy.mock.calls[0][0] as string)).toContain('clientState mismatch');
    warnSpy.mockRestore();
  });

  it('rejects with a warn log when resource path cannot be parsed', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    msState.parseTranscriptResource.mockReturnValue(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          {
            subscriptionId: 'sub-1',
            clientState: 'expected_state',
            resource: 'bogus/path',
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 0,
      rejected: 1,
      unknown: 0,
    });
    expect(warnSpy).toHaveBeenCalled();
    expect((warnSpy.mock.calls[0][0] as string)).toContain('could not parse resource');
    warnSpy.mockRestore();
  });

  it('rejects when notification has no resource field (parseTranscriptResource not called)', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          {
            subscriptionId: 'sub-1',
            clientState: 'expected_state',
            // no resource
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 0,
      rejected: 1,
      unknown: 0,
    });
    expect(msState.parseTranscriptResource).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('POST /api/microsoft-webhook/transcripts — sync execution', () => {
  it('counts a successful sync as processed and logs ingestion', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    msState.parseTranscriptResource.mockReturnValue({
      meetingId: 'meet-1',
      transcriptId: 'tr-1',
    });
    msState.syncTranscriptForSubscription.mockResolvedValue({
      brainMeetingId: 99,
      reimported: false,
      byteCount: 1234,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          {
            subscriptionId: 'sub-1',
            clientState: 'expected_state',
            resource: 'r',
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 1,
      rejected: 0,
      unknown: 0,
    });
    expect(msState.syncTranscriptForSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      meetingId: 'meet-1',
      transcriptId: 'tr-1',
    });
    expect(logSpy).toHaveBeenCalled();
    expect((logSpy.mock.calls[0][0] as string)).toContain('ingested');
    logSpy.mockRestore();
  });

  it('counts a NotConnectedError as rejected and warns (not errors)', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    msState.parseTranscriptResource.mockReturnValue({
      meetingId: 'meet-1',
      transcriptId: 'tr-1',
    });
    msState.syncTranscriptForSubscription.mockRejectedValue(
      new FakeNotConnectedError('connection revoked'),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          {
            subscriptionId: 'sub-1',
            clientState: 'expected_state',
            resource: 'r',
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 0,
      rejected: 1,
      unknown: 0,
    });
    expect(warnSpy).toHaveBeenCalled();
    expect((warnSpy.mock.calls[0][0] as string)).toContain('sync skipped');
    expect(errSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('counts a generic sync error as rejected and logs to console.error', async () => {
    dbState.selectQueue.push([{ ...CONN_BASE }]);
    msState.parseTranscriptResource.mockReturnValue({
      meetingId: 'meet-1',
      transcriptId: 'tr-1',
    });
    msState.syncTranscriptForSubscription.mockRejectedValue(
      new Error('transient graph 503'),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          {
            subscriptionId: 'sub-1',
            clientState: 'expected_state',
            resource: 'r',
          },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 0,
      rejected: 1,
      unknown: 0,
    });
    expect(errSpy).toHaveBeenCalled();
    expect((errSpy.mock.calls[0][0] as string)).toContain('sync failed');
    errSpy.mockRestore();
  });

  it('processes multiple notifications and aggregates counts across mixed outcomes', async () => {
    // Three queued select() calls — one row per notification in order.
    dbState.selectQueue.push([{ ...CONN_BASE }]); // n1 — happy path
    dbState.selectQueue.push([]); // n2 — unknown subscription
    dbState.selectQueue.push([{ ...CONN_BASE, clientState: 'expected_state' }]); // n3 — sync fails

    msState.parseTranscriptResource
      .mockReturnValueOnce({ meetingId: 'm1', transcriptId: 't1' })
      .mockReturnValueOnce({ meetingId: 'm3', transcriptId: 't3' });

    msState.syncTranscriptForSubscription
      .mockResolvedValueOnce({ brainMeetingId: 1, reimported: false, byteCount: 10 })
      .mockRejectedValueOnce(new Error('boom'));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/microsoft-webhook/transcripts/route');
    const res = await POST(
      makeRequest({
        value: [
          { subscriptionId: 'sub-1', clientState: 'expected_state', resource: 'r1' },
          { subscriptionId: 'sub-missing', clientState: 'anything', resource: 'r2' },
          { subscriptionId: 'sub-3', clientState: 'expected_state', resource: 'r3' },
        ],
      }),
    );
    expect(res.status).toBe(202);
    expect(((await res.json()) as RouteJson).data).toEqual({
      processed: 1,
      rejected: 1,
      unknown: 1,
    });
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
