// @vitest-environment node
/**
 * Unit tests for app/api/email/inbound/route.ts — the CF Worker → portal
 * inbound-email webhook. The handler:
 *   1. Verifies the shared secret header.
 *   2. Parses the `to` address (prefix + plus-tag).
 *   3. Either:
 *        a) routes brain+<token>@… into handleBrainIngest (which talks to
 *           brain_profiles + brain_meetings and optionally schedules an
 *           after() auto-process job), or
 *        b) looks up the client by emailPrefix, authenticates the sender,
 *           runs the plan-gate, picks BYOK-or-platform key, agent-loops
 *           Anthropic with portal tools, persists messages, deducts credits
 *           and sends a reply via Resend.
 *
 * Everything outside the route file is mocked. We exercise:
 *   - bad secret / missing fields / bad to address
 *   - brain path: no token, unknown token, disabled, ingest happy + auto-process
 *   - chat path: unknown prefix, unauthorized sender, plan-gate denial,
 *     out-of-credits, BYOK skips credit check, tool-loop happy path with
 *     a single tool call, MAX_TOOL_CALLS overflow → 500
 *   - DB throw → 500
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The module reads INBOUND_EMAIL_SECRET at import time and throws if it's
// missing or set to the placeholder string. Set it BEFORE the first import.
process.env.INBOUND_EMAIL_SECRET =
  process.env.INBOUND_EMAIL_SECRET && process.env.INBOUND_EMAIL_SECRET !== 'sd-inbound-secret-change-me'
    ? process.env.INBOUND_EMAIL_SECRET
    : 'test-inbound-secret';
process.env.RESEND_FROM_EMAIL = 'noreply@test.example';

const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET as string;

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

interface MockState {
  clients: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  clientMembers: Array<Record<string, unknown>>;
  aiConversations: Array<Record<string, unknown>>;
  aiMessages: Array<Record<string, unknown>>;
  brainProfiles: Array<Record<string, unknown>>;
  brainMeetings: Array<Record<string, unknown>>;
  afterCallbacks: Array<() => Promise<void> | void>;

  // Anthropic SDK behavior
  anthropicResponses: Array<unknown>;
  anthropicCalls: Array<Record<string, unknown>>;
  anthropicConstructorArgs: Array<Record<string, unknown>>;

  // executePortalTool capture
  toolCalls: Array<{ name: string; input: Record<string, unknown>; clientId: number; userId: number }>;
  toolResults: Array<unknown>;

  // resend
  resendCalls: Array<Record<string, unknown>>;

  // ai-credits
  hasCreditsResult: boolean;
  deductCreditsCalls: Array<unknown[]>;

  // plan-gate
  planGateResult: { allowed: boolean; message?: string };

  // resolve-client-key
  resolveResult: { key: string; source: 'platform' | 'byok' };

  // process-meeting
  processMeetingCalls: Array<Record<string, unknown>>;
}

const state: MockState = {
  clients: [],
  users: [],
  clientMembers: [],
  aiConversations: [],
  aiMessages: [],
  brainProfiles: [],
  brainMeetings: [],
  afterCallbacks: [],
  anthropicResponses: [],
  anthropicCalls: [],
  anthropicConstructorArgs: [],
  toolCalls: [],
  toolResults: [],
  resendCalls: [],
  hasCreditsResult: true,
  deductCreditsCalls: [],
  planGateResult: { allowed: true },
  resolveResult: { key: 'sk-platform', source: 'platform' },
  processMeetingCalls: [],
};

// Tests can also throw from db by setting a one-shot error.
let dbErrorOnNextSelect: Error | null = null;

// ---------------------------------------------------------------------------
// next/server mock — make NextResponse.json a passthrough that produces a
// real Response with `.json()` so tests can assert payload + status.
// Also stub `after()` to capture callbacks.
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => {
      return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  },
  after: (fn: () => Promise<void> | void) => {
    state.afterCallbacks.push(fn);
    void Promise.resolve().then(() => fn());
  },
}));

// ---------------------------------------------------------------------------
// Schema mock — each table is a Proxy whose property access returns a
// {__col, __table} marker the drizzle mock can introspect.
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    clients: wrap('clients'),
    clientMembers: wrap('clientMembers'),
    users: wrap('users'),
    aiConversations: wrap('aiConversations'),
    aiMessages: wrap('aiMessages'),
    brainProfiles: wrap('brainProfiles'),
    brainMeetings: wrap('brainMeetings'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// drizzle-orm mock — builders returning inspectable predicate objects.
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  sql: (..._args: unknown[]) => ({ op: 'sql' }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

function resolveOperand(operand: unknown, row: Record<string, unknown>): unknown {
  if (operand && typeof operand === 'object') {
    const op = operand as { __col?: string; __table?: string };
    if (op.__col) {
      // For column references, look up the merged row. For joined rows we
      // expose both `<table>__<col>` and bare `<col>` keys — prefer the
      // qualified form when present so users.id vs clientMembers.userId
      // resolve correctly.
      if (op.__table) {
        const qualified = `${op.__table}__${op.__col}`;
        if (qualified in row) return row[qualified];
      }
      return row[op.__col];
    }
  }
  return operand;
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const left = resolveOperand(f.a, row);
      const right = resolveOperand(f.b, row);
      return left === right;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string; __table?: string } | undefined;
    if (!r?.__col) {
      out[alias] = undefined;
      continue;
    }
    if (r.__table) {
      const qualified = `${r.__table}__${r.__col}`;
      if (qualified in row) {
        out[alias] = row[qualified];
        continue;
      }
    }
    out[alias] = row[r.__col];
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

// ---------------------------------------------------------------------------
// db mock — supports select / insert (with .returning + onConflictDoUpdate) /
// update / innerJoin. Selects honor projection so we can return joined rows.
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let joinedTable: string | null = null;
    let joinFilter: unknown = null;
    let filter: unknown = null;
    let limit: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      innerJoin(table: { __table: string }, onFilter: unknown) {
        joinedTable = table.__table;
        joinFilter = onFilter;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (dbErrorOnNextSelect) {
        const e = dbErrorOnNextSelect;
        dbErrorOnNextSelect = null;
        return Promise.reject(e);
      }
      if (!activeTable) return Promise.resolve([]);

      // Build a row whose keys are prefixed with `<table>__<col>` so the
      // predicate evaluator can disambiguate `users.id` from
      // `clientMembers.userId`. For convenience, also keep bare-keyed
      // copies (last writer wins) so the assertion helpers and the
      // route's projection logic still work for the non-join case.
      function qualify(table: string, row: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = { ...row };
        for (const [k, v] of Object.entries(row)) {
          out[`${table}__${k}`] = v;
        }
        return out;
      }

      const baseQualified = tableArray(activeTable).map((r) => qualify(activeTable!, r));
      const filteredBase = baseQualified.filter((r) => evalPredicate(filter, r));

      let rows = filteredBase;
      if (joinedTable) {
        rows = [];
        for (const left of filteredBase) {
          for (const right of tableArray(joinedTable)) {
            const rightQ = qualify(joinedTable, right);
            const merged: Record<string, unknown> = { ...left, ...rightQ };
            const passes = evalPredicate(joinFilter, merged);
            if (passes) rows.push(merged);
          }
        }
        // Re-apply outer .where on joined rows.
        rows = rows.filter((r) => evalPredicate(filter, r));
      }

      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });

        const ret = {
          onConflictDoUpdate(_args: unknown) {
            return {
              returning() {
                return Promise.resolve(inserted);
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(inserted).then(onFulfilled, onRejected);
              },
            };
          },
          returning() {
            return Promise.resolve(inserted);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
        return ret;
      },
    };
  }

  function buildUpdate(_table: { __table: string }) {
    return {
      set(_v: Record<string, unknown>) {
        return {
          where(_w: unknown) {
            return Promise.resolve({ rowCount: 1 });
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Anthropic SDK mock — the class shape `new Anthropic({apiKey}).messages.create()`
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    apiKey: string;
    constructor(args: { apiKey: string }) {
      this.apiKey = args.apiKey;
      state.anthropicConstructorArgs.push(args);
    }
    messages = {
      create: async (args: Record<string, unknown>) => {
        state.anthropicCalls.push(args);
        const next = state.anthropicResponses.shift();
        if (!next) {
          throw new Error('No anthropic response queued — test misconfigured');
        }
        return next;
      },
    };
  }
  return { default: Anthropic };
});

// ---------------------------------------------------------------------------
// Portal tools registry mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/ai/portal-tools', () => ({
  PORTAL_TOOLS: [{ name: 'mock_tool', description: 'mock', input_schema: { type: 'object', properties: {} } }],
  executePortalTool: vi.fn(
    async (name: string, input: Record<string, unknown>, clientId: number, userId: number) => {
      state.toolCalls.push({ name, input, clientId, userId });
      return state.toolResults.shift() ?? { ok: true };
    },
  ),
}));

// ---------------------------------------------------------------------------
// ai-credits mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/ai-credits', () => ({
  hasCredits: vi.fn(async (_clientId: number) => state.hasCreditsResult),
  deductCredits: vi.fn(async (...args: unknown[]) => {
    state.deductCreditsCalls.push(args);
  }),
}));

// ---------------------------------------------------------------------------
// resend mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: vi.fn(async (args: Record<string, unknown>) => {
        state.resendCalls.push(args);
        return { id: 'resend-id' };
      }),
    },
  },
}));

// ---------------------------------------------------------------------------
// brain/process-meeting mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/brain/process-meeting', () => ({
  processBrainMeeting: vi.fn(async (args: Record<string, unknown>) => {
    state.processMeetingCalls.push(args);
    return { attachmentsAnalyzed: 0, linksExtracted: 0, transcript: { reviewItemCount: 0 } };
  }),
}));

// ---------------------------------------------------------------------------
// AI helper mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: vi.fn(async (_args: { clientId: number; provider: string }) => state.resolveResult),
}));

vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: vi.fn(async () => undefined),
}));

vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: vi.fn(async (_args: { clientId: number; provider: string }) => state.planGateResult),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  state.clients.length = 0;
  state.users.length = 0;
  state.clientMembers.length = 0;
  state.aiConversations.length = 0;
  state.aiMessages.length = 0;
  state.brainProfiles.length = 0;
  state.brainMeetings.length = 0;
  state.afterCallbacks.length = 0;
  state.anthropicResponses.length = 0;
  state.anthropicCalls.length = 0;
  state.anthropicConstructorArgs.length = 0;
  state.toolCalls.length = 0;
  state.toolResults.length = 0;
  state.resendCalls.length = 0;
  state.deductCreditsCalls.length = 0;
  state.processMeetingCalls.length = 0;
  state.hasCreditsResult = true;
  state.planGateResult = { allowed: true };
  state.resolveResult = { key: 'sk-platform', source: 'platform' };
  dbErrorOnNextSelect = null;
  idCounter = 1000;
});

async function importHandler() {
  const mod = await import('@/app/api/email/inbound/route');
  return mod.POST;
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/email/inbound', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function flushAfter() {
  // Two microtask ticks: one for the mock's void Promise wrapper,
  // one for the wrapped async callback inside the route source.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Validation + auth tests
// ---------------------------------------------------------------------------

describe('POST /api/email/inbound — request validation', () => {
  it('rejects with 401 when secret does not match', async () => {
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: 'wrong',
        from: 'a@b.com',
        to: 'acme@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects with 400 when required fields are missing', async () => {
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: '',
        to: 'acme@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('accepts attachment-only emails (empty body but attachments present)', async () => {
    // No matching brain profile → rejected at the brain-token gate, but the
    // initial "missing fields" check has to pass. Use brain path with no
    // tag to trigger the "token required" branch (status 200, rejected).
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain@simplerdevelopment.com',
        subject: 's',
        body: '',
        attachments: [{ key: 'x', filename: 'f', contentType: 'application/pdf', size: 1 }],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'token required' });
  });

  it('rejects with 400 when destination address is not @simplerdevelopment.com', async () => {
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'acme@wrongdomain.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid destination address' });
  });

  it('returns 500 when the JSON body fails to parse', async () => {
    const POST = await importHandler();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await POST(
      new Request('http://localhost/api/email/inbound', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Brain ingestion path
// ---------------------------------------------------------------------------

describe('POST /api/email/inbound — brain ingestion', () => {
  it('rejects when brain+ has no token', async () => {
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'token required' });
  });

  it('rejects unknown brain tokens', async () => {
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain+unknown@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'unknown token' });
  });

  it('rejects when the brain profile is disabled', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 5,
      emailIngestToken: 'tok',
      enabled: false,
      autoProcessEmail: false,
    });
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain+tok@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'brain disabled' });
  });

  it('ingests successfully and skips auto-process when flag is off', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 5,
      emailIngestToken: 'tok',
      enabled: true,
      autoProcessEmail: false,
    });
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'Sender <sender@example.com>',
        to: 'brain+tok@simplerdevelopment.com',
        subject: 'Meeting notes',
        body: 'transcript text',
        messageId: '<msg-1@gmail.example>',
        attachments: [
          { key: 'k1', filename: 'f1.pdf', contentType: 'application/pdf', size: 100 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ingested', clientId: 5 });
    expect(state.brainMeetings).toHaveLength(1);
    const m = state.brainMeetings[0];
    expect(m.clientId).toBe(5);
    expect(m.title).toBe('Meeting notes');
    expect(m.transcript).toBe('transcript text');
    expect(m.source).toBe('email');
    // <> stripped from messageId
    expect(m.sourceRef).toBe('msg-1@gmail.example');
    const meta = m.sourceMetadata as Record<string, unknown>;
    expect(meta.senderEmail).toBe('sender@example.com');
    expect((meta.attachments as unknown[]).length).toBe(1);
    await flushAfter();
    expect(state.processMeetingCalls).toHaveLength(0);
  });

  it('falls back to subject "(email)" when subject is empty', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 5,
      emailIngestToken: 'tok',
      enabled: true,
      autoProcessEmail: false,
    });
    const POST = await importHandler();
    await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain+tok@simplerdevelopment.com',
        subject: '',
        body: 'b',
      }),
    );
    expect(state.brainMeetings[0].title).toBe('(email)');
  });

  it('generates a sourceRef when messageId is omitted', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 5,
      emailIngestToken: 'tok',
      enabled: true,
      autoProcessEmail: false,
    });
    const POST = await importHandler();
    await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain+tok@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(String(state.brainMeetings[0].sourceRef)).toMatch(/^gen-\d+$/);
  });

  it('schedules auto-process via after() when enabled and client exists', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 5,
      emailIngestToken: 'tok',
      enabled: true,
      autoProcessEmail: true,
    });
    state.clients.push({ id: 5, userId: 99, emailPrefix: 'acme', company: 'Acme', userId_dup: 99 });
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain+tok@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(200);
    await flushAfter();
    expect(state.afterCallbacks).toHaveLength(1);
    expect(state.processMeetingCalls).toHaveLength(1);
    expect(state.processMeetingCalls[0]).toMatchObject({ clientId: 5, userId: 99 });
  });

  it('logs and bails inside after() when client cannot be resolved', async () => {
    state.brainProfiles.push({
      id: 1,
      clientId: 999,
      emailIngestToken: 'tok',
      enabled: true,
      autoProcessEmail: true,
    });
    // No matching client row — the select inside after() returns [].
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const POST = await importHandler();
    await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'brain+tok@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    await flushAfter();
    expect(state.processMeetingCalls).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('client 999 not found'));
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Chat path
// ---------------------------------------------------------------------------

describe('POST /api/email/inbound — chat path', () => {
  function seedChatBaseline(overrides: { byok?: boolean } = {}) {
    state.clients.push({
      id: 1,
      emailPrefix: 'acme',
      userId: 10,
      company: 'Acme',
    });
    state.users.push({ id: 10, email: 'owner@acme.com' });
    if (overrides.byok) {
      state.resolveResult = { key: 'sk-byok', source: 'byok' };
    }
  }

  it('returns 404 when no client matches the prefix', async () => {
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'a@b.com',
        to: 'unknown@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/No company found for prefix: unknown/);
  });

  it('rejects (200) when sender is not the owner or a team member', async () => {
    seedChatBaseline();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'stranger@elsewhere.com',
        to: 'acme@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'rejected', reason: 'sender not authorized' });
    logSpy.mockRestore();
  });

  it('replies with the plan-gate message when AI is blocked on the current plan', async () => {
    seedChatBaseline();
    state.planGateResult = { allowed: false, message: 'Upgrade to enable AI.' };
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: 'hello',
        body: 'b',
        messageId: '<m1@x>',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'replied', reason: 'plan_gate' });
    expect(state.resendCalls).toHaveLength(1);
    expect(state.resendCalls[0].text).toBe('Upgrade to enable AI.');
    expect((state.resendCalls[0].headers as Record<string, unknown>)?.['In-Reply-To']).toBe('<m1@x>');
    // Anthropic never called.
    expect(state.anthropicCalls).toHaveLength(0);
  });

  it('uses the plan-gate fallback message when none is provided', async () => {
    seedChatBaseline();
    state.planGateResult = { allowed: false };
    const POST = await importHandler();
    await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: 'hello',
        body: 'b',
      }),
    );
    expect(state.resendCalls[0].text).toBe('AI access is not available on the current plan.');
  });

  it('replies with an out-of-credits notice when platform key has no balance', async () => {
    seedChatBaseline();
    state.hasCreditsResult = false;
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: 'hello',
        body: 'b',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'replied', reason: 'insufficient credits' });
    expect(state.resendCalls[0].text).toMatch(/AI credits are depleted/);
    expect(state.anthropicCalls).toHaveLength(0);
  });

  it('skips the credit check entirely when BYOK is in use', async () => {
    seedChatBaseline({ byok: true });
    state.hasCreditsResult = false; // would block if check ran
    state.anthropicResponses.push({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'BYOK reply' }],
      usage: { input_tokens: 5, output_tokens: 3 },
    });
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: 'hello',
        body: 'b',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('replied');
    expect(json.tokensUsed).toBe(8);
    expect(state.deductCreditsCalls).toHaveLength(0);
    expect(state.anthropicConstructorArgs[0]).toEqual({ apiKey: 'sk-byok' });
  });

  it('runs the full happy path: one tool call, persists messages, sends reply, deducts credits', async () => {
    seedChatBaseline();
    // First response: tool_use — invoke one tool.
    state.anthropicResponses.push({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'tu-1', name: 'mock_tool', input: { q: 'hi' } },
      ],
      usage: { input_tokens: 10, output_tokens: 4 },
    });
    // Second response: end_turn — final text.
    state.anthropicResponses.push({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hello from AI' }],
      usage: { input_tokens: 7, output_tokens: 2 },
    });
    state.toolResults.push({ ok: true });

    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'Owner Name <Owner@Acme.com>', // tests case-insensitive match + <addr> stripping
        to: 'acme@simplerdevelopment.com',
        subject: 'My subject',
        body: 'Please help',
        messageId: '<msg-1@x>',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('replied');
    expect(json.tokensUsed).toBe(10 + 4 + 7 + 2);
    expect(json.toolCalls).toBe(1);

    // Two Anthropic calls + two messages persisted + conversation created.
    expect(state.anthropicCalls).toHaveLength(2);
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0]).toMatchObject({ name: 'mock_tool', clientId: 1, userId: 10 });
    expect(state.aiConversations).toHaveLength(1);
    expect(state.aiConversations[0].title).toBe('[Email] My subject');
    expect(state.aiMessages).toHaveLength(2);
    const userMsg = state.aiMessages.find((m) => m.role === 'user');
    const asstMsg = state.aiMessages.find((m) => m.role === 'assistant');
    expect(userMsg?.content).toContain('Subject: My subject');
    expect(asstMsg?.content).toBe('Hello from AI');
    expect((asstMsg?.toolCalls as unknown[]).length).toBe(1);

    // Reply email sent with case-normalized recipient.
    expect(state.resendCalls).toHaveLength(1);
    expect(state.resendCalls[0].to).toBe('owner@acme.com');
    expect(state.resendCalls[0].subject).toBe('Re: My subject');
    expect(state.resendCalls[0].text).toBe('Hello from AI');
    expect((state.resendCalls[0].from as string)).toContain('Acme AI');

    // Credits deducted exactly once for platform-source.
    expect(state.deductCreditsCalls).toHaveLength(1);
  });

  it('falls back to "(no subject)" labels when subject is empty', async () => {
    seedChatBaseline();
    state.anthropicResponses.push({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const POST = await importHandler();
    await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: '',
        body: 'hi',
      }),
    );
    expect(state.aiConversations[0].title).toBe('[Email] No subject');
    expect(state.resendCalls[0].subject).toBe('Re: (no subject)');
  });

  it('accepts plus-tagged client addresses (client+anything@…) by stripping the tag', async () => {
    seedChatBaseline();
    state.anthropicResponses.push({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme+tag@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    const json = await res.json();
    expect(json.status).toBe('replied');
  });

  it('throws 500 when the agent loop exceeds MAX_TOOL_CALLS (>20)', async () => {
    seedChatBaseline();
    // Queue a tool_use response with 21 tool blocks → triggers the cap.
    state.anthropicResponses.push({
      stop_reason: 'tool_use',
      content: Array.from({ length: 21 }, (_, i) => ({
        type: 'tool_use',
        id: `tu-${i}`,
        name: 'mock_tool',
        input: {},
      })),
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    errSpy.mockRestore();
  });

  it('returns 500 when the DB throws during client lookup', async () => {
    state.clients.push({ id: 1, emailPrefix: 'acme', userId: 10, company: 'Acme' });
    dbErrorOnNextSelect = new Error('db boom');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'owner@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    errSpy.mockRestore();
  });

  it('authenticates team-member senders via the clientMembers join', async () => {
    state.clients.push({ id: 1, emailPrefix: 'acme', userId: 10, company: 'Acme' });
    state.users.push({ id: 10, email: 'owner@acme.com' });
    state.users.push({ id: 11, email: 'member@acme.com' });
    state.clientMembers.push({ clientId: 1, userId: 11 });
    state.anthropicResponses.push({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const POST = await importHandler();
    const res = await POST(
      makeReq({
        secret: INBOUND_SECRET,
        from: 'member@acme.com',
        to: 'acme@simplerdevelopment.com',
        subject: 's',
        body: 'b',
      }),
    );
    const json = await res.json();
    expect(json.status).toBe('replied');
    // executePortalTool wasn't invoked (no tool_use), but if it had been, the
    // userId would be the member's id, not the owner's. Verify the lookup
    // mechanism worked by confirming we got past the auth gate.
    expect(state.anthropicCalls).toHaveLength(1);
  });
});
