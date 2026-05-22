// @vitest-environment node
/**
 * Unit tests for `POST /api/webhooks/dropbox-sign`.
 *
 * DropboxSign (formerly HelloSign) posts signature lifecycle events to this
 * endpoint. The route:
 *   - Pulls the event from either a direct JSON body or a multipart `json` field
 *   - Verifies the HelloSign HMAC signature header (multiple aliases accepted)
 *   - Looks up the crmContracts row by provider request id
 *   - Branches on event_type to update esignStatus, esignSignedAt, etc.
 *   - Appends to esignWebhookEvents (capped at 50)
 *   - Records a crmContractSigningEvents row
 *   - Always responds with the literal "Hello API Event Received"
 *
 * Each test stubs the full dependency surface (db, schema, drizzle-orm,
 * dropbox-sign verifier + audit fetcher) — no live network or DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface DbState {
  selectQueue: unknown[][];
  inserts: Array<{ table: string; values: unknown }>;
  updates: Array<{ table: string; values: unknown }>;
}

const dbState: DbState = {
  selectQueue: [],
  inserts: [],
  updates: [],
};

interface EsignMockState {
  verifyWebhookSignature: ReturnType<typeof vi.fn>;
  getSignedFileUrl: ReturnType<typeof vi.fn>;
}

const esignState: EsignMockState = {
  verifyWebhookSignature: vi.fn(),
  getSignedFileUrl: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the route under test)
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
    crmContracts: tableProxy('crmContracts'),
    crmContractSigningEvents: tableProxy('crmContractSigningEvents'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      _op: 'sql',
      strings,
      vals,
    }),
    { raw: (s: string) => ({ _op: 'sql_raw', s }) },
  ),
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

  function makeInsertChain(table: string) {
    const insertChain: Record<string, unknown> = {};
    insertChain.values = (v: unknown) => {
      dbState.inserts.push({ table, values: v });
      return insertChain;
    };
    insertChain.returning = () => Promise.resolve([]);
    insertChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return insertChain;
  }

  function makeUpdateChain(table: string) {
    const updateChain: Record<string, unknown> = {};
    updateChain.set = (v: unknown) => {
      dbState.updates.push({ table, values: v });
      return updateChain;
    };
    updateChain.where = () => updateChain;
    updateChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
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
      insert: (t: unknown) => makeInsertChain(tableName(t)),
      update: (t: unknown) => makeUpdateChain(tableName(t)),
    },
  };
});

vi.mock('@/lib/esign/dropbox-sign', () => ({
  verifyWebhookSignature: (...args: unknown[]) =>
    esignState.verifyWebhookSignature(...args),
  getSignedFileUrl: (...args: unknown[]) => esignState.getSignedFileUrl(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUCCESS_BODY = 'Hello API Event Received';

const DEFAULT_CONTRACT = {
  id: 42,
  clientId: 7,
  esignProviderRequestId: 'sig_req_abc',
  esignStatus: 'sent',
  esignWebhookEvents: [] as Array<Record<string, unknown>>,
};

function makeJsonRequest(body: object | string, sigHeader: string | null = 'sig_ok'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sigHeader !== null) headers['hellosign-x-signature'] = sigHeader;
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('http://localhost/api/webhooks/dropbox-sign', {
    method: 'POST',
    headers,
    body: raw,
  });
}

function makeMultipartRequest(jsonField: string, sigHeader: string | null = 'sig_ok'): Request {
  const form = new FormData();
  form.append('json', jsonField);
  const headers: Record<string, string> = {};
  if (sigHeader !== null) headers['hellosign-x-signature'] = sigHeader;
  return new Request('http://localhost/api/webhooks/dropbox-sign', {
    method: 'POST',
    headers,
    body: form,
  });
}

function buildEvent(opts: {
  eventType?: string | null;
  requestId?: string | null;
  isComplete?: boolean;
  isDeclined?: boolean;
  signatures?: Array<{
    signature_id?: string;
    signer_email_address?: string;
    signer_name?: string;
    status_code?: string;
    signed_at?: number | null;
  }>;
} = {}): Record<string, unknown> {
  const sigReq: Record<string, unknown> = {};
  if (opts.requestId !== null) {
    sigReq.signature_request_id = opts.requestId ?? 'sig_req_abc';
  }
  if (opts.isComplete !== undefined) sigReq.is_complete = opts.isComplete;
  if (opts.isDeclined !== undefined) sigReq.is_declined = opts.isDeclined;
  if (opts.signatures !== undefined) sigReq.signatures = opts.signatures;
  const event: Record<string, unknown> = {};
  if (opts.eventType !== null) {
    event.event_type = opts.eventType ?? 'signature_request_signed';
  }
  event.event_time = '1700000000';
  return { event, signature_request: sigReq };
}

beforeEach(() => {
  vi.resetModules();
  dbState.selectQueue = [];
  dbState.inserts = [];
  dbState.updates = [];
  esignState.verifyWebhookSignature.mockReset();
  esignState.verifyWebhookSignature.mockResolvedValue(true);
  esignState.getSignedFileUrl.mockReset();
  esignState.getSignedFileUrl.mockResolvedValue('https://audit.example/abc.pdf');
  delete process.env.NODE_ENV;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/webhooks/dropbox-sign', () => {
  it('returns the literal success body on health-check pings', async () => {
    const { GET } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_BODY);
  });
});

describe('POST /api/webhooks/dropbox-sign — payload extraction', () => {
  it('returns 400 when the JSON body is unparseable', async () => {
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest('{not-json'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('invalid payload');
  });

  it('returns 400 when multipart body has no `json` field', async () => {
    const form = new FormData();
    form.append('not_json', 'oops');
    const req = new Request('http://localhost/api/webhooks/dropbox-sign', {
      method: 'POST',
      headers: { 'hellosign-x-signature': 'sig_ok' },
      body: form,
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('parses multipart form-data `json` field and verifies HMAC over that raw string', async () => {
    const evt = buildEvent({ eventType: 'signature_request_viewed' });
    const raw = JSON.stringify(evt);
    dbState.selectQueue.push([DEFAULT_CONTRACT]);

    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeMultipartRequest(raw, 'sig_ok'));
    expect(res.status).toBe(200);
    expect(esignState.verifyWebhookSignature).toHaveBeenCalledTimes(1);
    // The raw passed to the verifier must be the json field value, not the multipart envelope.
    expect(esignState.verifyWebhookSignature.mock.calls[0][0]).toBe(raw);
    expect(esignState.verifyWebhookSignature.mock.calls[0][1]).toBe('sig_ok');
  });
});

describe('POST /api/webhooks/dropbox-sign — signature verification', () => {
  it('returns 401 when the signature header is present but verification fails', async () => {
    esignState.verifyWebhookSignature.mockResolvedValueOnce(false);
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(buildEvent(), 'bad_sig'));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('invalid signature');
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
  });

  it('returns 401 when no signature header is present and NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(buildEvent(), null));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('missing signature');
    expect(esignState.verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it('accepts an unsigned request in non-production for local testing', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(buildEvent({ eventType: 'signature_request_viewed' }), null));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_BODY);
    expect(esignState.verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it('accepts the `Hellosign-X-Signature` cased alias header', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const req = new Request('http://localhost/api/webhooks/dropbox-sign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Note: Web Request normalizes header names to lowercase, so this still
        // exercises the lowercase lookup that comes first in the chain.
        'Hellosign-X-Signature': 'sig_alias',
      },
      body: JSON.stringify(buildEvent({ eventType: 'signature_request_viewed' })),
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(esignState.verifyWebhookSignature).toHaveBeenCalledTimes(1);
    expect(esignState.verifyWebhookSignature.mock.calls[0][1]).toBe('sig_alias');
  });

  it('falls back to the `x-dropbox-sign-signature` header when others are absent', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const req = new Request('http://localhost/api/webhooks/dropbox-sign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dropbox-sign-signature': 'sig_new',
      },
      body: JSON.stringify(buildEvent({ eventType: 'signature_request_viewed' })),
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(esignState.verifyWebhookSignature.mock.calls[0][1]).toBe('sig_new');
  });
});

describe('POST /api/webhooks/dropbox-sign — ack-and-move-on paths', () => {
  it('acks a ping with no event_type (no DB writes)', async () => {
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(
      makeJsonRequest({ event: { event_time: '1' }, signature_request: {} }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_BODY);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
  });

  it('acks an event with no signature_request_id', async () => {
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(
      makeJsonRequest({
        event: { event_type: 'signature_request_signed' },
        signature_request: {},
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_BODY);
    expect(dbState.updates).toHaveLength(0);
  });

  it('acks when no contract matches the provider request id', async () => {
    dbState.selectQueue.push([]); // contract lookup returns nothing
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(buildEvent({ eventType: 'signature_request_viewed' })));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_BODY);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
  });
});

describe('POST /api/webhooks/dropbox-sign — signature_request_viewed', () => {
  it('promotes esignStatus from `sent` to `viewed` and records the event', async () => {
    dbState.selectQueue.push([{ ...DEFAULT_CONTRACT, esignStatus: 'sent' }]);
    const evt = buildEvent({
      eventType: 'signature_request_viewed',
      signatures: [
        { signer_email_address: 'viewer@example.com', signature_id: 'sigA', signed_at: null },
      ],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    expect(contractUpdate).toBeDefined();
    const values = contractUpdate!.values as { esignStatus?: string; esignWebhookEvents?: unknown[] };
    expect(values.esignStatus).toBe('viewed');
    expect(values.esignWebhookEvents).toHaveLength(1);

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect(eventInsert).toBeDefined();
    const insertVals = eventInsert!.values as { kind: string; actorEmail: string | null };
    expect(insertVals.kind).toBe('viewed');
    expect(insertVals.actorEmail).toBe('viewer@example.com');
  });

  it('does NOT change esignStatus when contract is already past `sent`', async () => {
    dbState.selectQueue.push([{ ...DEFAULT_CONTRACT, esignStatus: 'signed' }]);
    const evt = buildEvent({ eventType: 'signature_request_viewed' });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    expect(contractUpdate).toBeDefined();
    const values = contractUpdate!.values as { esignStatus?: string };
    expect(values.esignStatus).toBeUndefined();
  });
});

describe('POST /api/webhooks/dropbox-sign — signature_request_signed', () => {
  it('does not flip to signed when is_complete is false (multi-signer mid-flight)', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const evt = buildEvent({
      eventType: 'signature_request_signed',
      isComplete: false,
      signatures: [
        { signer_email_address: 'a@x.com', signed_at: 1700000000, signature_id: 'sigA' },
      ],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as { esignStatus?: string; esignSignedAt?: unknown };
    expect(values.esignStatus).toBeUndefined();
    expect(values.esignSignedAt).toBeUndefined();

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { kind: string }).kind).toBe('signed');
  });

  it('flips to signed and stamps esignSignedAt when is_complete is true', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const evt = buildEvent({
      eventType: 'signature_request_signed',
      isComplete: true,
      signatures: [
        { signer_email_address: 'a@x.com', signed_at: 1700000000, signature_id: 'sigA' },
      ],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as { esignStatus?: string; esignSignedAt?: Date };
    expect(values.esignStatus).toBe('signed');
    expect(values.esignSignedAt).toBeInstanceOf(Date);
  });
});

describe('POST /api/webhooks/dropbox-sign — signature_request_all_signed', () => {
  it('marks signed, stamps esignSignedAt, and persists the audit PDF url', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    esignState.getSignedFileUrl.mockResolvedValueOnce('https://audit.example/x.pdf');
    const evt = buildEvent({
      eventType: 'signature_request_all_signed',
      signatures: [
        { signer_email_address: 'final@x.com', signed_at: 1700000111, signature_id: 'sigZ' },
      ],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as {
      esignStatus?: string;
      esignSignedAt?: Date;
      esignAuditFileUrl?: string;
    };
    expect(values.esignStatus).toBe('signed');
    expect(values.esignSignedAt).toBeInstanceOf(Date);
    expect(values.esignAuditFileUrl).toBe('https://audit.example/x.pdf');
    expect(esignState.getSignedFileUrl).toHaveBeenCalledWith('sig_req_abc');

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { kind: string }).kind).toBe('all_signed');
  });

  it('still marks signed when getSignedFileUrl throws (best-effort audit fetch)', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    esignState.getSignedFileUrl.mockRejectedValueOnce(new Error('S3 unavailable'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const evt = buildEvent({ eventType: 'signature_request_all_signed' });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as { esignStatus?: string; esignAuditFileUrl?: string };
    expect(values.esignStatus).toBe('signed');
    expect(values.esignAuditFileUrl).toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('skips setting esignAuditFileUrl when getSignedFileUrl returns null', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    esignState.getSignedFileUrl.mockResolvedValueOnce(null);

    const evt = buildEvent({ eventType: 'signature_request_all_signed' });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as { esignAuditFileUrl?: string };
    expect(values.esignAuditFileUrl).toBeUndefined();
  });
});

describe('POST /api/webhooks/dropbox-sign — declined + canceled', () => {
  it('marks the contract declined and stamps esignDeclinedAt', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const evt = buildEvent({ eventType: 'signature_request_declined' });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as { esignStatus?: string; esignDeclinedAt?: Date };
    expect(values.esignStatus).toBe('declined');
    expect(values.esignDeclinedAt).toBeInstanceOf(Date);

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { kind: string }).kind).toBe('declined');
  });

  it('marks the contract canceled', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const evt = buildEvent({ eventType: 'signature_request_canceled' });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as { esignStatus?: string };
    expect(values.esignStatus).toBe('canceled');

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { kind: string }).kind).toBe('canceled');
  });
});

describe('POST /api/webhooks/dropbox-sign — unknown event types', () => {
  it('still appends to the webhook log + signing-events table, no status change', async () => {
    dbState.selectQueue.push([{ ...DEFAULT_CONTRACT, esignStatus: 'sent' }]);
    const evt = buildEvent({ eventType: 'signature_request_some_future_event' });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const values = contractUpdate!.values as { esignStatus?: string; esignWebhookEvents?: unknown[] };
    expect(values.esignStatus).toBeUndefined();
    expect(values.esignWebhookEvents).toHaveLength(1);

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { kind: string }).kind).toBe('webhook');
  });
});

describe('POST /api/webhooks/dropbox-sign — webhook event log trimming', () => {
  it('caps esignWebhookEvents at 50 entries (oldest dropped)', async () => {
    const existing: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 50; i++) {
      existing.push({
        eventType: 'signature_request_viewed',
        receivedAt: new Date(i * 1000).toISOString(),
        signatureRequestId: 'sig_req_abc',
        signatureId: `sig_${i}`,
      });
    }
    dbState.selectQueue.push([
      { ...DEFAULT_CONTRACT, esignWebhookEvents: existing },
    ]);
    const evt = buildEvent({
      eventType: 'signature_request_viewed',
      signatures: [{ signature_id: 'sig_NEW', signed_at: null }],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const events = (contractUpdate!.values as { esignWebhookEvents: Array<{ signatureId: string }> })
      .esignWebhookEvents;
    expect(events).toHaveLength(50);
    expect(events[events.length - 1].signatureId).toBe('sig_NEW');
    // First (oldest) was dropped.
    expect(events[0].signatureId).toBe('sig_1');
  });

  it('handles a contract whose esignWebhookEvents is null without crashing', async () => {
    dbState.selectQueue.push([{ ...DEFAULT_CONTRACT, esignWebhookEvents: null }]);
    const evt = buildEvent({ eventType: 'signature_request_viewed' });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const contractUpdate = dbState.updates.find((u) => u.table === 'crmContracts');
    const events = (contractUpdate!.values as { esignWebhookEvents: unknown[] }).esignWebhookEvents;
    expect(events).toHaveLength(1);
  });
});

describe('POST /api/webhooks/dropbox-sign — actorEmail derivation', () => {
  it('prefers the signer with signed_at set when multiple signers are present', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const evt = buildEvent({
      eventType: 'signature_request_signed',
      isComplete: false,
      signatures: [
        { signer_email_address: 'pending@x.com', signed_at: null, signature_id: 'sigA' },
        { signer_email_address: 'signed@x.com', signed_at: 1700000000, signature_id: 'sigB' },
      ],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { actorEmail: string }).actorEmail).toBe('signed@x.com');
  });

  it('falls back to the first signer when none have signed_at', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const evt = buildEvent({
      eventType: 'signature_request_viewed',
      signatures: [
        { signer_email_address: 'first@x.com', signed_at: null, signature_id: 'sigA' },
        { signer_email_address: 'second@x.com', signed_at: null, signature_id: 'sigB' },
      ],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { actorEmail: string }).actorEmail).toBe('first@x.com');
  });

  it('sets actorEmail to null when the signatures array is empty', async () => {
    dbState.selectQueue.push([DEFAULT_CONTRACT]);
    const evt = buildEvent({
      eventType: 'signature_request_viewed',
      signatures: [],
    });
    const { POST } = await import('@/app/api/webhooks/dropbox-sign/route');
    const res = await POST(makeJsonRequest(evt));
    expect(res.status).toBe(200);

    const eventInsert = dbState.inserts.find((i) => i.table === 'crmContractSigningEvents');
    expect((eventInsert!.values as { actorEmail: string | null }).actorEmail).toBeNull();
  });
});
