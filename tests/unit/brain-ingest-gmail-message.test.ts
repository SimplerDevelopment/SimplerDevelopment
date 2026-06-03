// @vitest-environment node
/**
 * Unit tests for lib/brain/ingest-gmail-message.ts.
 *
 * The module is fully DB-coupled and additionally schedules a deferred AI
 * pipeline via Next's `after()` helper. We mock:
 *   - `@/lib/db`          — chainable select/insert builder backed by in-memory state
 *   - `@/lib/db/schema`   — Proxy-wrapped tables so column refs become inspectable markers
 *   - `drizzle-orm`       — `eq` builder + no-op predicate ops (the mock evaluates filters)
 *   - `next/server`       — `after()` invokes its callback synchronously so we can assert
 *   - `@/lib/brain/process-meeting` — captures auto-process invocations
 *
 * Mirrors the pattern in tests/unit/brain-relationships.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brainProfiles: Array<Record<string, unknown>>;
  brainMeetings: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  /**
   * When non-null, the next insert into brainMeetings returns this array
   * from `.returning()` instead of the real inserted rows. Set to `[]` to
   * simulate the "insert returned no row" edge case.
   */
  forcedInsertReturning: Array<Record<string, unknown>> | null;
  processMeetingCalls: Array<Record<string, unknown>>;
  processMeetingThrow: Error | null;
  afterCallbacks: Array<() => Promise<void> | void>;
}

const state: MockState = {
  brainProfiles: [],
  brainMeetings: [],
  clients: [],
  forcedInsertReturning: null,
  processMeetingCalls: [],
  processMeetingThrow: null,
  afterCallbacks: [],
};

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
    brainProfiles: wrap('brainProfiles'),
    brainMeetings: wrap('brainMeetings'),
    clients: wrap('clients'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// Capture `after()` callbacks. Default behavior: invoke immediately so the
// branch where autoProcessEmail is true can be asserted within the same tick.
vi.mock('next/server', () => ({
  after: (fn: () => Promise<void> | void) => {
    state.afterCallbacks.push(fn);
    // Fire-and-forget; tests can await `flushAfter()` if they need ordering.
    void Promise.resolve().then(() => fn());
  },
}));

vi.mock('@/lib/brain/process-meeting', () => ({
  processBrainMeeting: vi.fn(async (args: Record<string, unknown>) => {
    state.processMeetingCalls.push(args);
    if (state.processMeetingThrow) throw state.processMeetingThrow;
  }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
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

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string } | undefined;
    out[alias] = r?.__col ? row[r.__col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

let idCounter = 1;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
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
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
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
        const finalizer = () => {
          if (table.__table === 'brainMeetings' && state.forcedInsertReturning !== null) {
            return state.forcedInsertReturning;
          }
          return inserted;
        };
        return {
          onConflictDoUpdate(_args: unknown) {
            return {
              returning() {
                return Promise.resolve(finalizer());
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(finalizer()).then(onFulfilled, onRejected);
              },
            };
          },
          returning() {
            return Promise.resolve(finalizer());
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(finalizer()).then(onFulfilled, onRejected);
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
    },
  };
});

beforeEach(() => {
  state.brainProfiles.length = 0;
  state.brainMeetings.length = 0;
  state.clients.length = 0;
  state.forcedInsertReturning = null;
  state.processMeetingCalls.length = 0;
  state.processMeetingThrow = null;
  state.afterCallbacks.length = 0;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/brain/ingest-gmail-message');
}

/** Wait for all queued `after()` callbacks to settle. */
async function flushAfter() {
  // Two microtask ticks: one to fire the void Promise inside the mock, one
  // for the wrapped async callback inside the source to resolve.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'gmail-msg-1',
    threadId: 'thread-1',
    internetMessageId: '<abc@gmail.example>',
    from: 'Sender Name <sender@example.com>',
    to: 'client@example.com',
    subject: 'Hello',
    bodyText: 'Full body text content',
    snippet: 'snippet preview',
    receivedAt: new Date('2026-05-15T12:00:00Z'),
    labelIds: ['INBOX', 'UNREAD'],
    attachments: [],
    ...overrides,
  } as Parameters<
    Awaited<ReturnType<typeof importModule>>['ingestGmailMessageIntoBrain']
  >[0]['message'];
}

// ---------------------------------------------------------------------------
// Profile gating
// ---------------------------------------------------------------------------

describe('ingestGmailMessageIntoBrain — profile gating', () => {
  it('skips with reason=no_brain_profile when no profile row exists', async () => {
    const { ingestGmailMessageIntoBrain } = await importModule();
    const res = await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    expect(res).toEqual({ meetingId: null, status: 'skipped', reason: 'no_brain_profile' });
    expect(state.brainMeetings).toHaveLength(0);
  });

  it('skips with reason=brain_disabled when the profile is not enabled', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: false, autoProcessEmail: false });
    const { ingestGmailMessageIntoBrain } = await importModule();
    const res = await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    expect(res).toEqual({ meetingId: null, status: 'skipped', reason: 'brain_disabled' });
    expect(state.brainMeetings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Insertion path — snippet vs full body, sourceMetadata shape, defaults
// ---------------------------------------------------------------------------

describe('ingestGmailMessageIntoBrain — insertion', () => {
  it('inserts a brain meeting using the snippet when storeBodies is false', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: false });
    const { ingestGmailMessageIntoBrain } = await importModule();
    const res = await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    expect(res.status).toBe('inserted');
    expect(res.meetingId).toBe(state.brainMeetings[0].id);
    const row = state.brainMeetings[0];
    expect(row.transcript).toBe('snippet preview');
    expect(row.source).toBe('gmail-api');
    expect(row.status).toBe('draft');
    expect(row.title).toBe('Hello');
    expect(row.sourceRef).toBe('<abc@gmail.example>');
  });

  it('inserts using full body text when storeBodies is true', async () => {
    state.brainProfiles.push({ id: 2, clientId: 7, enabled: true, autoProcessEmail: false });
    const { ingestGmailMessageIntoBrain } = await importModule();
    await ingestGmailMessageIntoBrain({
      clientId: 7,
      message: makeMessage(),
      storeBodies: true,
    });
    const row = state.brainMeetings[0];
    expect(row.transcript).toBe('Full body text content');
    const meta = row.sourceMetadata as Record<string, unknown>;
    expect(meta.storedBody).toBe(true);
  });

  it('falls back to "(email)" when subject is empty', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: false });
    const { ingestGmailMessageIntoBrain } = await importModule();
    await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage({ subject: '' }),
      storeBodies: false,
    });
    expect(state.brainMeetings[0].title).toBe('(email)');
  });

  it('builds sourceMetadata with gmail-specific identifiers and a normalized senderEmail', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: false });
    const { ingestGmailMessageIntoBrain } = await importModule();
    await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage({
        from: 'Display Name <UPPER@Example.com>',
        labelIds: ['INBOX'],
      }),
      storeBodies: false,
      attachments: [
        { key: 'attachments/foo.pdf', filename: 'foo.pdf', contentType: 'application/pdf', size: 1024 },
      ],
    });
    const meta = state.brainMeetings[0].sourceMetadata as Record<string, unknown>;
    expect(meta.source).toBe('gmail-api');
    expect(meta.gmailMessageId).toBe('gmail-msg-1');
    expect(meta.gmailThreadId).toBe('thread-1');
    expect(meta.labelIds).toEqual(['INBOX']);
    // The replace() regex extracts the address from <...> and lowercases it.
    expect(meta.senderEmail).toBe('upper@example.com');
    expect(meta.receivedAt).toBe(new Date('2026-05-15T12:00:00Z').toISOString());
    expect(meta.storedBody).toBe(false);
    expect(meta.attachments).toEqual([
      { key: 'attachments/foo.pdf', filename: 'foo.pdf', contentType: 'application/pdf', size: 1024 },
    ]);
  });

  it('defaults attachments to [] in sourceMetadata when caller omits them', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: false });
    const { ingestGmailMessageIntoBrain } = await importModule();
    await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    const meta = state.brainMeetings[0].sourceMetadata as Record<string, unknown>;
    expect(meta.attachments).toEqual([]);
  });

  it('returns skipped/insert_returned_no_row when returning() yields no rows', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: false });
    state.forcedInsertReturning = [];
    const { ingestGmailMessageIntoBrain } = await importModule();
    const res = await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    expect(res).toEqual({ meetingId: null, status: 'skipped', reason: 'insert_returned_no_row' });
  });
});

// ---------------------------------------------------------------------------
// Auto-process branch (after() callback)
// ---------------------------------------------------------------------------

describe('ingestGmailMessageIntoBrain — auto-process', () => {
  it('does NOT schedule auto-process when autoProcessEmail is false', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: false });
    const { ingestGmailMessageIntoBrain } = await importModule();
    await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    await flushAfter();
    expect(state.afterCallbacks).toHaveLength(0);
    expect(state.processMeetingCalls).toHaveLength(0);
  });

  it('schedules and invokes processBrainMeeting when autoProcessEmail is true', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: true });
    state.clients.push({ id: 1, userId: 42 });
    const { ingestGmailMessageIntoBrain } = await importModule();
    const res = await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    await flushAfter();
    expect(state.afterCallbacks).toHaveLength(1);
    expect(state.processMeetingCalls).toHaveLength(1);
    expect(state.processMeetingCalls[0]).toEqual({
      clientId: 1,
      meetingId: res.meetingId,
      userId: 42,
    });
  });

  it('logs and bails when the client row is missing during auto-process', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: true });
    // No client row inserted → the select returns [] and the branch logs.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ingestGmailMessageIntoBrain } = await importModule();
    await ingestGmailMessageIntoBrain({
      clientId: 1,
      message: makeMessage(),
      storeBodies: false,
    });
    await flushAfter();
    expect(state.processMeetingCalls).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('client 1 not found'));
    errSpy.mockRestore();
  });

  it('swallows + logs errors thrown by processBrainMeeting', async () => {
    state.brainProfiles.push({ id: 1, clientId: 1, enabled: true, autoProcessEmail: true });
    state.clients.push({ id: 1, userId: 42 });
    state.processMeetingThrow = new Error('pipeline boom');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ingestGmailMessageIntoBrain } = await importModule();
    await expect(
      ingestGmailMessageIntoBrain({
        clientId: 1,
        message: makeMessage(),
        storeBodies: false,
      }),
    ).resolves.toMatchObject({ status: 'inserted' });
    await flushAfter();
    expect(errSpy).toHaveBeenCalled();
    const firstArg = errSpy.mock.calls[0][0];
    expect(String(firstArg)).toMatch(/auto-process failed/);
    errSpy.mockRestore();
  });
});
