// @vitest-environment node
/**
 * Unit tests covering two unrelated routes in one file for coverage:
 *  1. POST /api/portal/tools/pitch-decks/[id]/slides/batch-edit
 *  2. GET  /api/public/booking/[slug]/slots
 *
 * Both routes are exercised via dynamic imports inside their describe blocks
 * so the mock state can be tuned per-route. The Anthropic SDK is mocked so
 * no real network call ever happens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared BEFORE route imports — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

// auth + portal-client + branding + AI helpers (pitch-deck route)
const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const saveVersionSnapshotMock = vi.fn();
vi.mock('@/lib/pitch-deck-versions', () => ({
  saveVersionSnapshot: (...args: unknown[]) => saveVersionSnapshotMock(...args),
}));

const getBrandingByClientIdMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandingByClientId: (...args: unknown[]) => getBrandingByClientIdMock(...args),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args),
}));

const recordAiUsageMock = vi.fn();
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsageMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

const buildSlideEditPromptMock = vi.fn();
vi.mock('@/lib/ai/slide-prompt-builder', () => ({
  buildSlideEditPrompt: (...args: unknown[]) => buildSlideEditPromptMock(...args),
}));

const validateSlideResponseMock = vi.fn();
vi.mock('@/lib/ai/validate-slide-response', () => ({
  validateSlideResponse: (...args: unknown[]) => validateSlideResponseMock(...args),
}));

// Anthropic SDK
const messagesCreateMock = vi.fn();
const anthropicCtorSpy = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    public messages: { create: typeof messagesCreateMock };
    constructor(opts: { apiKey: string }) {
      anthropicCtorSpy(opts);
      this.messages = { create: messagesCreateMock };
    }
  }
  return { default: Anthropic };
});

// drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ kind: 'sql', strings, values }),
    {},
  ),
}));

// schema — proxy tables so `table.col` is inert
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    pitchDecks: wrap('pitchDecks'),
    bookingPages: wrap('bookingPages'),
    bookings: wrap('bookings'),
    bookingAttendees: wrap('bookingAttendees'),
    bookingDateOverrides: wrap('bookingDateOverrides'),
    bookingPageMembers: wrap('bookingPageMembers'),
  };
});

// ---- db mock — supports both a scripted select queue (for booking slots)
// and an in-memory pitchDecks table (for batch-edit).
type Row = Record<string, unknown>;

interface MockState {
  pitchDecks: Row[];
  selectQueue: Row[][];
}
const state: MockState = { pitchDecks: [], selectQueue: [] };

function tableArray(name: string): Row[] {
  if (name === 'pitchDecks') return state.pitchDecks;
  return [];
}

function evalPredicate(filter: unknown, row: Row): boolean {
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

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    let useQueue = false;

    function runQuery(): Promise<Row[]> {
      if (useQueue) {
        return Promise.resolve(state.selectQueue.shift() ?? []);
      }
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => ({ ...r }));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        // booking-slots route hits these tables; route the result via the queue
        if (
          table.__table === 'bookingPages' ||
          table.__table === 'bookingDateOverrides' ||
          table.__table === 'bookingPageMembers' ||
          table.__table === 'bookings' ||
          table.__table === 'bookingAttendees'
        ) {
          useQueue = true;
        }
        return chain;
      },
      innerJoin() {
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
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
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Row) {
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

  return {
    db: {
      select(_proj?: unknown) {
        return buildSelect();
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Dynamic imports (after all mocks)
// ---------------------------------------------------------------------------

const { POST: batchEditPOST } = await import(
  '@/app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route'
);
const { GET: slotsGET } = await import('@/app/api/public/booking/[slug]/slots/route');

// ---------------------------------------------------------------------------
// Pitch-deck batch-edit helpers + suite
// ---------------------------------------------------------------------------

const DEFAULT_THEME = {
  primaryColor: '#1a2744',
  accentColor: '#c9a84c',
  backgroundColor: '#0f1b2d',
  textColor: '#ffffff',
  headingFont: 'Cormorant Garamond',
  bodyFont: 'Plus Jakarta Sans',
};

function makeDeckRequest(body: Record<string, unknown>): Request {
  return new Request('http://x/api/portal/tools/pitch-decks/1/slides/batch-edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeckParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeSlide(over: Row = {}): Row {
  return {
    id: 'slide-1',
    label: 'Cover',
    blocks: [{ id: 'b-1', type: 'hero', order: 1, title: 'Hello', content: 'World' }],
    notes: 'speaker notes',
    ...over,
  };
}

function defaultDeck(over: Row = {}): Row {
  return {
    id: 1,
    clientId: 10,
    title: 'My Pitch Deck',
    description: 'A test deck',
    slides: [
      makeSlide(),
      makeSlide({ id: 'slide-2', label: 'Body' }),
      makeSlide({ id: 'slide-3', label: 'CTA' }),
    ],
    theme: DEFAULT_THEME,
    formatVersion: 2,
    ...over,
  };
}

function aiResponse(
  text: string,
  opts: { stop?: string; input?: number; output?: number } = {},
) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: opts.stop ?? 'end_turn',
    usage: { input_tokens: opts.input ?? 100, output_tokens: opts.output ?? 200 },
  };
}

function batchSlidesJson() {
  return JSON.stringify({
    slides: [
      { id: 'slide-1', label: 'New 1', blocks: [{ id: 'b-1', type: 'hero', order: 1, title: 'A' }] },
      { id: 'slide-2', label: 'New 2', blocks: [{ id: 'b-1', type: 'hero', order: 1, title: 'B' }] },
    ],
  });
}

describe('POST /api/portal/tools/pitch-decks/[id]/slides/batch-edit', () => {
  beforeEach(() => {
    state.pitchDecks.length = 0;
    state.selectQueue.length = 0;

    authMock.mockReset();
    getPortalClientMock.mockReset();
    saveVersionSnapshotMock.mockReset().mockResolvedValue(undefined);
    getBrandingByClientIdMock.mockReset();
    resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
    recordAiUsageMock.mockReset().mockResolvedValue(undefined);
    checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
    buildSlideEditPromptMock.mockReset().mockReturnValue(
      'You modify individual slides based on natural language instructions.',
    );
    validateSlideResponseMock.mockReset();
    messagesCreateMock.mockReset();
    anthropicCtorSpy.mockReset();

    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    getBrandingByClientIdMock.mockResolvedValue({
      primaryColor: '#ff0099',
      accentColor: '#222222',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoText: 'Acme',
    });
    validateSlideResponseMock.mockImplementation((_raw: unknown, id: string) => ({
      valid: true,
      slide: makeSlide({ id, label: 'validated' }),
      warnings: [],
    }));
  });

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await batchEditPOST(makeDeckRequest({ prompt: 'p', slideIndices: [0] }), makeDeckParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await batchEditPOST(makeDeckRequest({ prompt: 'p', slideIndices: [0] }), makeDeckParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await batchEditPOST(makeDeckRequest({ prompt: 'p', slideIndices: [0] }), makeDeckParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when the deck does not exist', async () => {
    const res = await batchEditPOST(makeDeckRequest({ prompt: 'p', slideIndices: [0] }), makeDeckParams('999'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when the deck belongs to a different client', async () => {
    state.pitchDecks.push(defaultDeck({ clientId: 999 }));
    const res = await batchEditPOST(makeDeckRequest({ prompt: 'p', slideIndices: [0] }), makeDeckParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when prompt is missing', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await batchEditPOST(makeDeckRequest({ slideIndices: [0] }), makeDeckParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Prompt is required');
  });

  it('returns 400 when prompt is whitespace only', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await batchEditPOST(makeDeckRequest({ prompt: '   ', slideIndices: [0] }), makeDeckParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when slideIndices is empty', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await batchEditPOST(makeDeckRequest({ prompt: 'p', slideIndices: [] }), makeDeckParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('No slides selected');
  });

  it('returns 400 when slideIndices is missing', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await batchEditPOST(makeDeckRequest({ prompt: 'p' }), makeDeckParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    state.pitchDecks.push(defaultDeck());
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Upgrade required',
      reason: 'plan_lock',
    });
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'edit', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Upgrade required', reason: 'plan_lock' });
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when all slideIndices are out of range', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'p', slideIndices: [99, -1, 50] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid slide indices');
  });

  it('passes the resolved Anthropic key to the SDK ctor', async () => {
    state.pitchDecks.push(defaultDeck());
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok-xyz' });
    messagesCreateMock.mockResolvedValueOnce(aiResponse(batchSlidesJson()));
    await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-byok-xyz' });
  });

  it('saves a version snapshot tagged ai_slide_edit before editing', async () => {
    state.pitchDecks.push(defaultDeck());
    messagesCreateMock.mockResolvedValueOnce(aiResponse(batchSlidesJson()));
    await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(saveVersionSnapshotMock).toHaveBeenCalledTimes(1);
    const args = saveVersionSnapshotMock.mock.calls[0]!;
    expect(args[0]).toBe(1);
    expect(args[2]).toEqual(DEFAULT_THEME);
    expect(args[3]).toBe('ai_slide_edit');
    expect(args[4]).toBe(7);
  });

  it('returns 200 + updated deck on successful batch edit', async () => {
    state.pitchDecks.push(defaultDeck());
    messagesCreateMock.mockResolvedValueOnce(aiResponse(batchSlidesJson()));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'shorten', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.editedCount).toBe(2);
    expect(body.data.formatVersion).toBe(2);
    expect(body.data.slides).toHaveLength(3);
  });

  it('strips ```json fences from AI text before parsing', async () => {
    state.pitchDecks.push(defaultDeck());
    const fenced = '```json\n' + batchSlidesJson() + '\n```';
    messagesCreateMock.mockResolvedValueOnce(aiResponse(fenced));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(200);
  });

  it('accepts a bare JSON array (not wrapped in {slides})', async () => {
    state.pitchDecks.push(defaultDeck());
    const arr = JSON.stringify([
      { id: 'slide-1', label: 'A', blocks: [] },
      { id: 'slide-2', label: 'B', blocks: [] },
    ]);
    messagesCreateMock.mockResolvedValueOnce(aiResponse(arr));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.editedCount).toBe(2);
  });

  it('returns 500 with invalid-JSON message when text is not parsable', async () => {
    state.pitchDecks.push(defaultDeck());
    messagesCreateMock.mockResolvedValueOnce(aiResponse('not json at all'));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/AI returned invalid JSON/);
  });

  it('returns 500 when parsed payload is not an array', async () => {
    state.pitchDecks.push(defaultDeck());
    // Object without `.slides`, parsed but not an array
    messagesCreateMock.mockResolvedValueOnce(aiResponse(JSON.stringify({ foo: 'bar' })));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(500);
  });

  it('emits a continuation call on stop_reason=max_tokens and sums tokens', async () => {
    state.pitchDecks.push(defaultDeck());
    const partial = batchSlidesJson().slice(0, 20);
    const completion = batchSlidesJson().slice(20);
    messagesCreateMock
      .mockResolvedValueOnce(aiResponse(partial, { stop: 'max_tokens', input: 500, output: 800 }))
      .mockResolvedValueOnce(aiResponse(completion, { stop: 'end_turn', input: 600, output: 400 }));

    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(200);
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, source: 'platform', tokens: 500 + 800 + 600 + 400 }),
    );
  });

  it('includes warnings when a slide fails validation', async () => {
    state.pitchDecks.push(defaultDeck());
    let callIdx = 0;
    validateSlideResponseMock.mockImplementation((_raw: unknown, id: string) => {
      callIdx += 1;
      if (callIdx === 1) {
        return { valid: false, slide: {} as Row, warnings: ['bad shape'] };
      }
      return { valid: true, slide: makeSlide({ id, label: 'ok' }), warnings: [] };
    });
    messagesCreateMock.mockResolvedValueOnce(aiResponse(batchSlidesJson()));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.join(' ')).toMatch(/validation failed|bad shape/);
  });

  it('proceeds when getBrandingByClientId throws (non-critical)', async () => {
    state.pitchDecks.push(defaultDeck());
    getBrandingByClientIdMock.mockRejectedValueOnce(new Error('branding down'));
    messagesCreateMock.mockResolvedValueOnce(aiResponse(batchSlidesJson()));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(200);
    const promptCall = buildSlideEditPromptMock.mock.calls[0]!;
    expect(promptCall[1].brandInfo).toBeNull();
  });

  it('records AI usage with combined tokens on a single-shot response', async () => {
    state.pitchDecks.push(defaultDeck());
    messagesCreateMock.mockResolvedValueOnce(
      aiResponse(batchSlidesJson(), { input: 11, output: 22 }),
    );
    await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, source: 'platform', tokens: 33 }),
    );
  });

  it('returns 500 with generic message when Anthropic call throws', async () => {
    state.pitchDecks.push(defaultDeck());
    messagesCreateMock.mockRejectedValueOnce(new Error('boom'));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Internal server error' });
  });

  it('filters out invalid slide indices but proceeds with the valid ones', async () => {
    state.pitchDecks.push(defaultDeck());
    messagesCreateMock.mockResolvedValueOnce(aiResponse(batchSlidesJson()));
    const res = await batchEditPOST(
      makeDeckRequest({ prompt: 'go', slideIndices: [0, 99, -2, 1] }),
      makeDeckParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Valid indices = [0, 1] → editedCount=2 (AI returned 2 slides)
    expect(body.editedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Booking-slots helpers + suite
// ---------------------------------------------------------------------------

function makeSlotsReq(date: string | null, staffId?: string | null): Request {
  const url = new URL('http://test/api/public/booking/test-slug/slots');
  if (date !== null) url.searchParams.set('date', date);
  if (staffId) url.searchParams.set('staffId', staffId);
  return new Request(url.toString());
}

function slotsParams(slug = 'test-slug'): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

function basePage(over: Row = {}): Row {
  return {
    id: 100,
    slug: 'test-slug',
    active: true,
    bookingType: 'individual',
    duration: 30,
    bufferBefore: 0,
    bufferAfter: 0,
    minNoticeMins: 0,
    maxAdvanceDays: 365,
    maxGuests: null,
    groupCapacity: null,
    availability: [
      // Monday..Friday 09:00-10:00 = 2 slots of 30m each
      ...[1, 2, 3, 4, 5].map((d) => ({
        day: d,
        enabled: true,
        startTime: '09:00',
        endTime: '10:00',
      })),
      // Also Sunday (day=0) and Saturday (day=6) for safety
      { day: 0, enabled: true, startTime: '09:00', endTime: '10:00' },
      { day: 6, enabled: true, startTime: '09:00', endTime: '10:00' },
    ],
    ...over,
  };
}

// Returns a YYYY-MM-DD string for `daysFromNow` days from today (UTC-safe).
function dateNDaysFromNow(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  // Avoid TZ pitfalls — build from local Y/M/D
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('GET /api/public/booking/[slug]/slots', () => {
  beforeEach(() => {
    state.selectQueue.length = 0;
  });

  it('returns 400 when date param is missing', async () => {
    const res = await slotsGET(makeSlotsReq(null), slotsParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/date parameter/i);
  });

  it('returns 400 when date param is malformed', async () => {
    const res = await slotsGET(makeSlotsReq('2026/01/01'), slotsParams());
    expect(res.status).toBe(400);
  });

  it('returns 404 when the booking page is not found or not active', async () => {
    state.selectQueue.push([]); // bookingPages lookup empty
    const res = await slotsGET(makeSlotsReq('2026-12-01'), slotsParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/not found/i);
  });

  it('returns empty data when requested date is beyond maxAdvanceDays', async () => {
    state.selectQueue.push([basePage({ maxAdvanceDays: 1 })]);
    const farDate = dateNDaysFromNow(60);
    const res = await slotsGET(makeSlotsReq(farDate), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it('returns empty data when requested date is in the past', async () => {
    state.selectQueue.push([basePage()]);
    const past = dateNDaysFromNow(-3);
    const res = await slotsGET(makeSlotsReq(past), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it('returns empty data when the date is blocked via an override', async () => {
    state.selectQueue.push([basePage()]);
    state.selectQueue.push([{ type: 'blocked' }]);
    const future = dateNDaysFromNow(2);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('uses override start/end times when override.type=available', async () => {
    state.selectQueue.push([basePage({ availability: [] })]); // no day-of-week availability
    state.selectQueue.push([
      { type: 'available', startTime: '13:00', endTime: '14:00' },
    ]);
    state.selectQueue.push([]); // existingBookings
    const future = dateNDaysFromNow(2);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    // 1 hour, 30-min slot → 2 slots
    expect(body.data).toHaveLength(2);
  });

  it('returns empty data when no time windows exist for the requested day', async () => {
    // Build a page whose availability is completely disabled
    state.selectQueue.push([basePage({ availability: [] })]);
    state.selectQueue.push([]); // no override
    const future = dateNDaysFromNow(2);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 1:1 slots filtered by conflicts (no buffer)', async () => {
    state.selectQueue.push([basePage()]);
    state.selectQueue.push([]); // no override
    // Two 30-min slots; mark the first as already booked
    const future = dateNDaysFromNow(2);
    const slot1Start = new Date(future + 'T09:00:00Z');
    const slot1End = new Date(future + 'T09:30:00Z');
    state.selectQueue.push([
      { startTime: slot1Start, endTime: slot1End, groupSize: 1 },
    ]);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    // 09:00 conflicts → only 09:30 remains
    expect(body.data).toHaveLength(1);
    expect(body.data[0].remainingCapacity).toBeNull();
  });

  it('honors minNoticeMins by skipping slots starting too soon', async () => {
    // Set window to start 1 minute from now; minNoticeMins=10
    const now = new Date();
    const startHour = String(now.getUTCHours()).padStart(2, '0');
    const startMin = String(now.getUTCMinutes()).padStart(2, '0');
    state.selectQueue.push([
      basePage({
        minNoticeMins: 60 * 24, // 1 day
        availability: [
          { day: now.getUTCDay(), enabled: true, startTime: `${startHour}:${startMin}`, endTime: '23:59' },
        ],
      }),
    ]);
    state.selectQueue.push([]); // no override
    state.selectQueue.push([]); // existingBookings
    const todayStr = dateNDaysFromNow(0);
    const res = await slotsGET(makeSlotsReq(todayStr), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Every slot today is less than 24h ahead — should be empty
    expect(body.data).toEqual([]);
  });

  it('uses member-specific availability when a staffId is provided', async () => {
    state.selectQueue.push([basePage({ availability: [] })]);
    state.selectQueue.push([]); // no override
    state.selectQueue.push([
      {
        availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
          day: d,
          enabled: true,
          startTime: '10:00',
          endTime: '11:00',
        })),
      },
    ]); // bookingPageMember row
    state.selectQueue.push([]); // existingBookings
    const future = dateNDaysFromNow(2);
    const res = await slotsGET(makeSlotsReq(future, '42'), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it('falls back to page availability if member has no availability', async () => {
    state.selectQueue.push([basePage()]);
    state.selectQueue.push([]); // no override
    state.selectQueue.push([{ availability: null }]); // member exists but has no availability
    state.selectQueue.push([]); // bookings
    const future = dateNDaysFromNow(2);
    const res = await slotsGET(makeSlotsReq(future, '42'), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it('returns capacity-aware slots for group bookings', async () => {
    state.selectQueue.push([
      basePage({
        bookingType: 'group',
        groupCapacity: 5,
        maxGuests: null,
      }),
    ]);
    state.selectQueue.push([]); // no override
    state.selectQueue.push([]); // existingBookings (1:1 select still runs)
    // Group attendees query: zero rows → all slots have full capacity
    state.selectQueue.push([]);
    const future = dateNDaysFromNow(2);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    for (const s of body.data) {
      expect(s.remainingCapacity).toBe(5);
    }
  });

  it('subtracts existing attendees from remaining group capacity', async () => {
    state.selectQueue.push([
      basePage({ bookingType: 'group', groupCapacity: 5, maxGuests: null }),
    ]);
    state.selectQueue.push([]); // no override
    state.selectQueue.push([]); // existingBookings
    const future = dateNDaysFromNow(2);
    const slot1 = new Date(future + 'T09:00:00Z');
    state.selectQueue.push([{ startTime: slot1, cnt: 3 }]); // 3 seats taken at 09:00
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    const slot09 = body.data.find((s: { time: string }) => s.time.endsWith('T09:00:00.000Z'));
    expect(slot09.remainingCapacity).toBe(2);
  });

  it('returns capacity-aware slots for legacy maxGuests (non-group)', async () => {
    state.selectQueue.push([basePage({ maxGuests: 4 })]);
    state.selectQueue.push([]); // override
    // existingBookings: 1 booking @ 09:00 with groupSize 2
    const future = dateNDaysFromNow(2);
    const slot1 = new Date(future + 'T09:00:00Z');
    state.selectQueue.push([{ startTime: slot1, endTime: new Date(slot1.getTime() + 30 * 60000), groupSize: 2 }]);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    const slot09 = body.data.find((s: { time: string }) => s.time.endsWith('T09:00:00.000Z'));
    expect(slot09.remainingCapacity).toBe(2);
  });

  it('omits slots with zero remaining capacity', async () => {
    state.selectQueue.push([basePage({ maxGuests: 1 })]);
    state.selectQueue.push([]); // override
    const future = dateNDaysFromNow(2);
    const slot1 = new Date(future + 'T09:00:00Z');
    state.selectQueue.push([{ startTime: slot1, endTime: new Date(slot1.getTime() + 30 * 60000), groupSize: 1 }]);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    // 09:00 should be dropped, 09:30 remains
    expect(body.data).toHaveLength(1);
    expect(body.data[0].time).toMatch(/T09:30:00/);
  });

  it('applies buffer windows to 1:1 conflict detection', async () => {
    // 15-minute buffer on either side → an existing booking close by should block
    state.selectQueue.push([
      basePage({
        bufferBefore: 60,
        bufferAfter: 60,
        availability: [
          ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({
            day: d,
            enabled: true,
            startTime: '09:00',
            endTime: '11:00',
          })),
        ],
      }),
    ]);
    state.selectQueue.push([]); // override
    const future = dateNDaysFromNow(2);
    // A booking 10:00-10:30 buffered by 60min → blocks slots 09:00, 09:30, 10:00, 10:30
    state.selectQueue.push([
      {
        startTime: new Date(future + 'T10:00:00Z'),
        endTime: new Date(future + 'T10:30:00Z'),
        groupSize: 1,
      },
    ]);
    const res = await slotsGET(makeSlotsReq(future), slotsParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    // 4 raw slots; all blocked by 60m buffer
    expect(body.data).toEqual([]);
  });
});
