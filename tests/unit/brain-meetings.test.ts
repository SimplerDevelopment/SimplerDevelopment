// @vitest-environment node
/**
 * Unit tests for lib/brain/meetings.ts.
 *
 * Covers the two pure helpers (`buildThreadTranscript`, `collectThreadParticipants`)
 * and the DB-coupled functions by mocking `@/lib/db`, `@/lib/db/schema`,
 * `drizzle-orm`, the audit logger, the adapter registry, and the quoted-reply
 * stripper. The DB mock uses a chainable in-memory builder seeded per test —
 * mirroring the pattern in `tests/unit/brain-relationships.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brainMeetings: Array<Record<string, unknown>>;
  brainMeetingParticipants: Array<Record<string, unknown>>;
  brainAiJobs: Array<Record<string, unknown>>;
  brainAiReviewItems: Array<Record<string, unknown>>;
  brainRelationshipOverlays: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  auditCalls: Array<Record<string, unknown>>;
  /** When set, the next select() that touches brainMeetings with a `sql` filter
   *  is treated as the "gmail thread siblings" lookup and returns this list. */
  forcedThreadSiblings: Array<Record<string, unknown>> | null;
  /** When set, the brainAiJobs select returns this row as the "latest job". */
  forcedLatestJob: Record<string, unknown> | null;
}

const state: MockState = {
  brainMeetings: [],
  brainMeetingParticipants: [],
  brainAiJobs: [],
  brainAiReviewItems: [],
  brainRelationshipOverlays: [],
  crmCompanies: [],
  crmDeals: [],
  auditCalls: [],
  forcedThreadSiblings: null,
  forcedLatestJob: null,
};

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
    brainMeetings: wrap('brainMeetings'),
    brainMeetingParticipants: wrap('brainMeetingParticipants'),
    brainAiJobs: wrap('brainAiJobs'),
    brainAiReviewItems: wrap('brainAiReviewItems'),
    brainRelationshipOverlays: wrap('brainRelationshipOverlays'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

// Adapter registry — meetings.ts imports getMeetingAdapter from
// './meeting-sources'. We expose a small in-memory registry the tests can poke.
const adapterRegistry: Record<string, unknown> = {};

vi.mock('@/lib/brain/meeting-sources', () => ({
  getMeetingAdapter: (id: string) => adapterRegistry[id] ?? null,
}));

// stripQuotedReply — pass through the body unchanged so the thread-transcript
// tests have predictable output. We re-export the real shape.
vi.mock('@/lib/brain/strip-quoted', () => ({
  stripQuotedReply: (input: string | null | undefined) => {
    if (!input) return { body: '', quoted: null };
    return { body: input.trim(), quoted: null };
  },
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; list?: unknown[]; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
    }
    case 'sql':
      return true;
    default:
      return true;
  }
}

function hasSqlFragment(filter: unknown): boolean {
  if (!filter || typeof filter !== 'object') return false;
  const f = filter as { op?: string; args?: unknown[] };
  if (f.op === 'sql') return true;
  if (f.op === 'and' || f.op === 'or') {
    return (f.args ?? []).some((a) => hasSqlFragment(a));
  }
  return false;
}

function projectRow(row: Record<string, unknown>, projection: Record<string, unknown> | null): Record<string, unknown> {
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

let idCounter = 5000;
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
      orderBy() {
        return chain;
      },
      groupBy() {
        return runQuery();
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

      // Gmail-thread siblings: a `select` on brainMeetings that includes a
      // sql`` fragment (the gmailThreadId match) and has a projection.
      if (
        activeTable === 'brainMeetings' &&
        projection &&
        hasSqlFragment(filter) &&
        state.forcedThreadSiblings !== null
      ) {
        const rows = state.forcedThreadSiblings.map((r) => projectRow(r, projection));
        return Promise.resolve(rows);
      }

      // Latest AI job: a select on brainAiJobs with a forcedLatestJob set.
      if (activeTable === 'brainAiJobs' && state.forcedLatestJob !== null) {
        const row = projectRow(state.forcedLatestJob, projection);
        let out = [row];
        if (limit !== null) out = out.slice(0, limit);
        return Promise.resolve(out);
      }

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
        return {
          returning() {
            return Promise.resolve(inserted);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const all = tableArray(table.__table);
        const matched: Array<Record<string, unknown>> = [];
        const remaining: Array<Record<string, unknown>> = [];
        for (const r of all) {
          if (evalPredicate(filter, r)) matched.push(r);
          else remaining.push(r);
        }
        all.length = 0;
        all.push(...remaining);
        return {
          returning() {
            return Promise.resolve(matched.map((r) => ({ id: r.id })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(matched.map((r) => ({ id: r.id }))).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  const dbObj = {
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
    delete(table: { __table: string }) {
      return buildDelete(table);
    },
    transaction<T>(fn: (tx: typeof dbObj) => Promise<T>): Promise<T> {
      return fn(dbObj);
    },
  };

  return { db: dbObj };
});

beforeEach(() => {
  state.brainMeetings.length = 0;
  state.brainMeetingParticipants.length = 0;
  state.brainAiJobs.length = 0;
  state.brainAiReviewItems.length = 0;
  state.brainRelationshipOverlays.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.auditCalls.length = 0;
  state.forcedThreadSiblings = null;
  state.forcedLatestJob = null;
  for (const k of Object.keys(adapterRegistry)) delete adapterRegistry[k];
  idCounter = 5000;
});

async function importModule() {
  return await import('@/lib/brain/meetings');
}

// ---------------------------------------------------------------------------
// buildThreadTranscript (pure)
// ---------------------------------------------------------------------------

describe('buildThreadTranscript', () => {
  it('returns empty string for an empty thread', async () => {
    const { buildThreadTranscript } = await importModule();
    expect(buildThreadTranscript([])).toBe('');
  });

  it('skips segments with no transcript body', async () => {
    const { buildThreadTranscript } = await importModule();
    const result = buildThreadTranscript([
      {
        id: 1,
        title: 't',
        meetingDate: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        transcript: null,
        sourceMetadata: { from: 'a@x' },
      },
    ]);
    expect(result).toBe('');
  });

  it('joins segments with From/Date/To headers', async () => {
    const { buildThreadTranscript } = await importModule();
    const result = buildThreadTranscript([
      {
        id: 1,
        title: 'subj',
        meetingDate: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        transcript: 'hello world',
        sourceMetadata: { from: 'Ada <ada@x>', to: 'bob@y' },
      },
      {
        id: 2,
        title: 'subj',
        meetingDate: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        transcript: 'reply body',
        sourceMetadata: { from: 'Bob <bob@y>' },
      },
    ]);
    expect(result).toContain('From: Ada <ada@x>');
    expect(result).toContain('Date: 2026-01-01T00:00:00.000Z');
    expect(result).toContain('To: bob@y');
    expect(result).toContain('hello world');
    expect(result).toContain('From: Bob <bob@y>');
    // No To: line on the second segment.
    const secondHalf = result.split('reply body')[0];
    expect(secondHalf.split('To: ').length - 1).toBe(1);
  });

  it('falls back to createdAt when meetingDate is null', async () => {
    const { buildThreadTranscript } = await importModule();
    const result = buildThreadTranscript([
      {
        id: 1,
        title: 't',
        meetingDate: null,
        createdAt: new Date('2026-03-15T12:00:00Z'),
        transcript: 'body',
        sourceMetadata: null,
      },
    ]);
    expect(result).toContain('Date: 2026-03-15T12:00:00.000Z');
    expect(result).toContain('From: (unknown sender)');
  });
});

// ---------------------------------------------------------------------------
// collectThreadParticipants (pure)
// ---------------------------------------------------------------------------

describe('collectThreadParticipants', () => {
  it('returns empty array when nothing in thread', async () => {
    const { collectThreadParticipants } = await importModule();
    expect(collectThreadParticipants([])).toEqual([]);
  });

  it('skips segments with no from/senderEmail metadata', async () => {
    const { collectThreadParticipants } = await importModule();
    const result = collectThreadParticipants([
      {
        id: 1,
        title: 't',
        meetingDate: null,
        createdAt: new Date(),
        transcript: 'hi',
        sourceMetadata: {},
      },
    ]);
    expect(result).toEqual([]);
  });

  it('parses "Name <email>" form into name + email', async () => {
    const { collectThreadParticipants } = await importModule();
    const result = collectThreadParticipants([
      {
        id: 1,
        title: 't',
        meetingDate: null,
        createdAt: new Date(),
        transcript: 'hi',
        sourceMetadata: { from: 'Ada Lovelace <ada@example.com>' },
      },
    ]);
    expect(result).toEqual([{ name: 'Ada Lovelace', email: 'ada@example.com' }]);
  });

  it('de-dupes case-insensitively across segments by email', async () => {
    const { collectThreadParticipants } = await importModule();
    const result = collectThreadParticipants([
      {
        id: 1,
        title: 't',
        meetingDate: null,
        createdAt: new Date(),
        transcript: 'hi',
        sourceMetadata: { from: 'Ada <ada@example.com>' },
      },
      {
        id: 2,
        title: 't',
        meetingDate: null,
        createdAt: new Date(),
        transcript: 'hi',
        sourceMetadata: { from: 'ADA L. <ADA@EXAMPLE.COM>' },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('ada@example.com');
  });

  it('honors senderEmail when present even if from lacks <>', async () => {
    const { collectThreadParticipants } = await importModule();
    const result = collectThreadParticipants([
      {
        id: 1,
        title: 't',
        meetingDate: null,
        createdAt: new Date(),
        transcript: 'hi',
        sourceMetadata: { from: 'Bob', senderEmail: 'BOB@x.test' },
      },
    ]);
    expect(result).toEqual([{ name: 'Bob', email: 'bob@x.test' }]);
  });

  it('strips quoted name and falls back to "Unknown" only when truly empty', async () => {
    const { collectThreadParticipants } = await importModule();
    const result = collectThreadParticipants([
      {
        id: 1,
        title: 't',
        meetingDate: null,
        createdAt: new Date(),
        transcript: 'hi',
        sourceMetadata: { from: '"Quoted Name" <q@x>' },
      },
    ]);
    expect(result[0].name).toBe('Quoted Name');
    expect(result[0].email).toBe('q@x');
  });
});

// ---------------------------------------------------------------------------
// listMeetings
// ---------------------------------------------------------------------------

describe('listMeetings', () => {
  it('returns an empty array when there are no rows for the client', async () => {
    const { listMeetings } = await importModule();
    const rows = await listMeetings(1);
    expect(rows).toEqual([]);
  });

  it('returns only rows for the given client', async () => {
    state.brainMeetings.push(
      { id: 1, clientId: 1, title: 'A', status: 'draft', createdAt: new Date() },
      { id: 2, clientId: 2, title: 'B', status: 'draft', createdAt: new Date() },
    );
    const { listMeetings } = await importModule();
    const rows = await listMeetings(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it('filters by status when provided', async () => {
    state.brainMeetings.push(
      { id: 1, clientId: 1, title: 'A', status: 'draft', createdAt: new Date() },
      { id: 2, clientId: 1, title: 'B', status: 'approved', createdAt: new Date() },
    );
    const { listMeetings } = await importModule();
    const rows = await listMeetings(1, { status: 'approved' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getMeeting
// ---------------------------------------------------------------------------

describe('getMeeting', () => {
  it('returns null when the meeting does not exist', async () => {
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 999);
    expect(res).toBeNull();
  });

  it('hydrates a meeting with no link and no participants', async () => {
    state.brainMeetings.push({
      id: 1,
      clientId: 1,
      title: 'Solo',
      status: 'draft',
      companyId: null,
      dealId: null,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 1);
    expect(res).not.toBeNull();
    expect(res!.participants).toEqual([]);
    expect(res!.link).toBeUndefined();
    expect(res!.thread).toBeUndefined();
    expect(res!.latestJob).toBeUndefined();
  });

  it('attaches participants for the meeting', async () => {
    state.brainMeetings.push({
      id: 5,
      clientId: 1,
      title: 'Kickoff',
      status: 'draft',
      companyId: null,
      dealId: null,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    state.brainMeetingParticipants.push(
      { id: 100, meetingId: 5, name: 'Ada', email: 'ada@x' },
      { id: 101, meetingId: 5, name: 'Bob', email: 'bob@x' },
      { id: 102, meetingId: 999, name: 'Other', email: 'other@x' },
    );
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 5);
    expect(res!.participants).toHaveLength(2);
  });

  it('hydrates a company link with overlayId when the overlay exists', async () => {
    state.brainMeetings.push({
      id: 10,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: 200,
      dealId: null,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    state.crmCompanies.push({ id: 200, name: 'Acme' });
    state.brainRelationshipOverlays.push({
      id: 9000,
      clientId: 1,
      companyId: 200,
      dealId: null,
    });
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 10);
    expect(res!.link).toEqual({ type: 'company', id: 200, name: 'Acme', overlayId: 9000 });
  });

  it('hydrates a company link with overlayId=null when no overlay exists', async () => {
    state.brainMeetings.push({
      id: 11,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: 201,
      dealId: null,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    state.crmCompanies.push({ id: 201, name: 'Beta' });
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 11);
    expect(res!.link).toEqual({ type: 'company', id: 201, name: 'Beta', overlayId: null });
  });

  it('hydrates a deal link', async () => {
    state.brainMeetings.push({
      id: 12,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: null,
      dealId: 300,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    state.crmDeals.push({ id: 300, title: 'Big Deal' });
    state.brainRelationshipOverlays.push({
      id: 9100,
      clientId: 1,
      companyId: null,
      dealId: 300,
    });
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 12);
    expect(res!.link).toEqual({ type: 'deal', id: 300, name: 'Big Deal', overlayId: 9100 });
  });

  it('omits link when company lookup misses', async () => {
    state.brainMeetings.push({
      id: 13,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: 9999,
      dealId: null,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 13);
    expect(res!.link).toBeUndefined();
  });

  it('surfaces gmail thread siblings when more than one exists', async () => {
    state.brainMeetings.push({
      id: 20,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: null,
      dealId: null,
      source: 'gmail-api',
      sourceMetadata: { gmailThreadId: 'thread-abc' },
      createdAt: new Date(),
    });
    state.forcedThreadSiblings = [
      {
        id: 20,
        title: 't',
        meetingDate: new Date('2026-01-01'),
        createdAt: new Date(),
        transcript: 'first',
        sourceMetadata: { gmailThreadId: 'thread-abc', from: 'a@x' },
      },
      {
        id: 21,
        title: 't',
        meetingDate: new Date('2026-01-02'),
        createdAt: new Date(),
        transcript: 'second',
        sourceMetadata: { gmailThreadId: 'thread-abc', from: 'b@x' },
      },
    ];
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 20);
    expect(res!.thread).toHaveLength(2);
  });

  it('does not surface a single-segment thread', async () => {
    state.brainMeetings.push({
      id: 21,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: null,
      dealId: null,
      source: 'gmail-api',
      sourceMetadata: { gmailThreadId: 'thread-solo' },
      createdAt: new Date(),
    });
    state.forcedThreadSiblings = [
      {
        id: 21,
        title: 't',
        meetingDate: new Date('2026-01-01'),
        createdAt: new Date(),
        transcript: 'only',
        sourceMetadata: { gmailThreadId: 'thread-solo' },
      },
    ];
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 21);
    expect(res!.thread).toBeUndefined();
  });

  it('surfaces the latest AI job when one exists', async () => {
    state.brainMeetings.push({
      id: 30,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: null,
      dealId: null,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    const createdAt = new Date('2026-02-01T00:00:00Z');
    const completedAt = new Date('2026-02-01T00:01:00Z');
    state.forcedLatestJob = {
      id: 7,
      jobType: 'process_meeting',
      status: 'failed',
      error: 'boom',
      createdAt,
      completedAt,
    };
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 30);
    expect(res!.latestJob).toEqual({
      id: 7,
      jobType: 'process_meeting',
      status: 'failed',
      error: 'boom',
      createdAt: createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
  });

  it('serializes a null completedAt as null on latestJob', async () => {
    state.brainMeetings.push({
      id: 31,
      clientId: 1,
      title: 't',
      status: 'draft',
      companyId: null,
      dealId: null,
      source: 'paste',
      sourceMetadata: null,
      createdAt: new Date(),
    });
    const createdAt = new Date('2026-02-01T00:00:00Z');
    state.forcedLatestJob = {
      id: 8,
      jobType: 'crm_classify',
      status: 'running',
      error: null,
      createdAt,
      completedAt: null,
    };
    const { getMeeting } = await importModule();
    const res = await getMeeting(1, 31);
    expect(res!.latestJob!.completedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createMeetingFromAdapter
// ---------------------------------------------------------------------------

interface FakeAdapter {
  id: string;
  enabledFor: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
}

function registerAdapter(id: string, opts: { enabled?: boolean; normalized?: Record<string, unknown> } = {}): FakeAdapter {
  const adapter: FakeAdapter = {
    id,
    enabledFor: vi.fn(async () => opts.enabled ?? true),
    fetch: vi.fn(async () => ({
      transcript: 'transcript body',
      title: 'A Meeting',
      meetingDate: new Date('2026-04-01T00:00:00Z'),
      participants: [],
      sourceRef: 'ref-1',
      sourceMetadata: { kind: 'test' },
      ...opts.normalized,
    })),
  };
  adapterRegistry[id] = adapter;
  return adapter;
}

describe('createMeetingFromAdapter', () => {
  it('throws when the adapter is unknown', async () => {
    const { createMeetingFromAdapter } = await importModule();
    await expect(
      createMeetingFromAdapter({
        adapterId: 'nope',
        input: {},
        ctx: { clientId: 1, userId: 2, profile: { defaultConfidentiality: 'internal' } as never },
      }),
    ).rejects.toThrow(/Unknown meeting source adapter/);
  });

  it('throws when the adapter is not enabled for the workspace', async () => {
    registerAdapter('paste', { enabled: false });
    const { createMeetingFromAdapter } = await importModule();
    await expect(
      createMeetingFromAdapter({
        adapterId: 'paste',
        input: {},
        ctx: { clientId: 1, userId: 2, profile: { defaultConfidentiality: 'internal' } as never },
      }),
    ).rejects.toThrow(/not enabled/);
  });

  it('creates a new meeting + participants and writes an "imported" audit', async () => {
    registerAdapter('paste', {
      normalized: {
        participants: [
          { name: 'Ada', email: 'ada@x' },
          { name: 'Bob', email: 'bob@x', roleInMeeting: 'organizer', contactId: 77 },
        ],
      },
    });
    const { createMeetingFromAdapter } = await importModule();
    const m = await createMeetingFromAdapter({
      adapterId: 'paste',
      input: {},
      ctx: { clientId: 1, userId: 2, profile: { defaultConfidentiality: 'internal' } as never },
      link: { companyId: 50 },
    });
    expect(m.title).toBe('A Meeting');
    expect((m as { companyId?: number }).companyId).toBe(50);
    expect(state.brainMeetings).toHaveLength(1);
    expect(state.brainMeetingParticipants).toHaveLength(2);
    const audit = state.auditCalls.find((a) => a.action === 'meeting.imported');
    expect(audit).toBeDefined();
    expect((audit!.metadata as { byteCount: number }).byteCount).toBe('transcript body'.length);
  });

  it('falls back to a generated title when the adapter returns no title', async () => {
    registerAdapter('paste', { normalized: { title: undefined } });
    const { createMeetingFromAdapter } = await importModule();
    const m = await createMeetingFromAdapter({
      adapterId: 'paste',
      input: {},
      ctx: { clientId: 1, userId: 2, profile: { defaultConfidentiality: 'internal' } as never },
    });
    expect(m.title).toMatch(/^Meeting — /);
  });

  it('truncates titles longer than 255 chars to "...255"', async () => {
    const long = 'x'.repeat(300);
    registerAdapter('paste', { normalized: { title: long } });
    const { createMeetingFromAdapter } = await importModule();
    const m = await createMeetingFromAdapter({
      adapterId: 'paste',
      input: {},
      ctx: { clientId: 1, userId: 2, profile: { defaultConfidentiality: 'internal' } as never },
    });
    expect(m.title.length).toBe(255);
    expect(m.title.endsWith('...')).toBe(true);
  });

  it('skips participant inserts when normalized.participants is empty', async () => {
    registerAdapter('paste', { normalized: { participants: [] } });
    const { createMeetingFromAdapter } = await importModule();
    await createMeetingFromAdapter({
      adapterId: 'paste',
      input: {},
      ctx: { clientId: 1, userId: 2, profile: { defaultConfidentiality: 'internal' } as never },
    });
    expect(state.brainMeetingParticipants).toHaveLength(0);
  });

  it('is idempotent on (clientId, sourceRef) — re-imports update + emit "reimported"', async () => {
    state.brainMeetings.push({
      id: 9999,
      clientId: 1,
      sourceRef: 'ref-1',
      title: 'old',
      transcript: 'old body',
      meetingDate: new Date('2025-12-01'),
      sourceMetadata: { kind: 'old' },
      companyId: null,
      dealId: null,
      status: 'draft',
      source: 'paste',
    });
    registerAdapter('paste', {
      normalized: {
        sourceRef: 'ref-1',
        title: 'fresh title',
        transcript: 'new body',
      },
    });
    const { createMeetingFromAdapter } = await importModule();
    const m = await createMeetingFromAdapter({
      adapterId: 'paste',
      input: {},
      ctx: { clientId: 1, userId: 2, profile: { defaultConfidentiality: 'internal' } as never },
    });
    expect(m.id).toBe(9999);
    expect(m.title).toBe('fresh title');
    expect((m as { transcript?: string }).transcript).toBe('new body');
    expect(state.brainMeetings).toHaveLength(1);
    const audit = state.auditCalls.find((a) => a.action === 'meeting.reimported');
    expect(audit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// linkMeeting
// ---------------------------------------------------------------------------

describe('linkMeeting', () => {
  it('returns null when no row matches', async () => {
    const { linkMeeting } = await importModule();
    const res = await linkMeeting(1, 999, { companyId: 5 });
    expect(res).toBeNull();
  });

  it('sets the companyId when provided', async () => {
    state.brainMeetings.push({ id: 1, clientId: 1, companyId: null, dealId: null });
    const { linkMeeting } = await importModule();
    const res = await linkMeeting(1, 1, { companyId: 50 });
    expect(res!.companyId).toBe(50);
    expect(state.brainMeetings[0].companyId).toBe(50);
  });

  it('sets the dealId when provided', async () => {
    state.brainMeetings.push({ id: 2, clientId: 1, companyId: null, dealId: null });
    const { linkMeeting } = await importModule();
    const res = await linkMeeting(1, 2, { dealId: 77 });
    expect(res!.dealId).toBe(77);
  });

  it('clears links when nulls are explicitly passed', async () => {
    state.brainMeetings.push({ id: 3, clientId: 1, companyId: 9, dealId: 10 });
    const { linkMeeting } = await importModule();
    const res = await linkMeeting(1, 3, { companyId: null, dealId: null });
    expect(res!.companyId).toBeNull();
    expect(res!.dealId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateMeetingStatus
// ---------------------------------------------------------------------------

describe('updateMeetingStatus', () => {
  it('returns null when no row matches', async () => {
    const { updateMeetingStatus } = await importModule();
    const res = await updateMeetingStatus(1, 999, 'approved' as never);
    expect(res).toBeNull();
  });

  it('updates the status and stamps reviewer fields on approval', async () => {
    state.brainMeetings.push({ id: 1, clientId: 1, status: 'draft', reviewedBy: null, reviewedAt: null });
    const { updateMeetingStatus } = await importModule();
    const res = await updateMeetingStatus(1, 1, 'approved' as never, 42);
    expect(res!.status).toBe('approved');
    expect(res!.reviewedBy).toBe(42);
    expect(res!.reviewedAt).toBeInstanceOf(Date);
  });

  it('does not stamp reviewer fields for non-approved status', async () => {
    state.brainMeetings.push({ id: 2, clientId: 1, status: 'draft', reviewedBy: null, reviewedAt: null });
    const { updateMeetingStatus } = await importModule();
    const res = await updateMeetingStatus(1, 2, 'draft' as never);
    expect(res!.status).toBe('draft');
    expect(res!.reviewedBy).toBeNull();
    expect(res!.reviewedAt).toBeNull();
  });

  it('approves with reviewerId=null when none is provided', async () => {
    state.brainMeetings.push({ id: 3, clientId: 1, status: 'draft', reviewedBy: null, reviewedAt: null });
    const { updateMeetingStatus } = await importModule();
    const res = await updateMeetingStatus(1, 3, 'approved' as never);
    expect(res!.reviewedBy).toBeNull();
    expect(res!.reviewedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// setMeetingAiSummary
// ---------------------------------------------------------------------------

describe('setMeetingAiSummary', () => {
  it('returns null when no row matches', async () => {
    const { setMeetingAiSummary } = await importModule();
    const res = await setMeetingAiSummary(1, 999, 'sum');
    expect(res).toBeNull();
  });

  it('writes the aiSummary onto the matching row', async () => {
    state.brainMeetings.push({ id: 1, clientId: 1, aiSummary: null });
    const { setMeetingAiSummary } = await importModule();
    const res = await setMeetingAiSummary(1, 1, 'A short summary.');
    expect(res!.aiSummary).toBe('A short summary.');
    expect(state.brainMeetings[0].aiSummary).toBe('A short summary.');
  });
});

// ---------------------------------------------------------------------------
// deleteMeeting
// ---------------------------------------------------------------------------

describe('deleteMeeting', () => {
  it('returns false when there is nothing to delete', async () => {
    const { deleteMeeting } = await importModule();
    const ok = await deleteMeeting(1, 999);
    expect(ok).toBe(false);
  });

  it('deletes the meeting and orphaned review items', async () => {
    state.brainMeetings.push({ id: 1, clientId: 1, title: 't' });
    state.brainAiReviewItems.push(
      { id: 100, clientId: 1, sourceType: 'meeting', sourceId: 1 },
      { id: 101, clientId: 1, sourceType: 'meeting', sourceId: 2 },
      { id: 102, clientId: 1, sourceType: 'task', sourceId: 1 },
    );
    const { deleteMeeting } = await importModule();
    const ok = await deleteMeeting(1, 1);
    expect(ok).toBe(true);
    expect(state.brainMeetings).toHaveLength(0);
    // Only the matching review item (sourceType=meeting, sourceId=1) is gone.
    expect(state.brainAiReviewItems.map((r) => r.id).sort()).toEqual([101, 102]);
  });
});
