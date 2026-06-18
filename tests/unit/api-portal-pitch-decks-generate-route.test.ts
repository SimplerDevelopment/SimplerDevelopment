// @vitest-environment node
/**
 * Unit tests for POST /api/portal/tools/pitch-decks/[id]/generate.
 *
 * The route touches: auth, the portal-client resolver, the pitchDecks /
 * aiConversations / aiMessages / brandingMessaging tables, branding helpers,
 * BYOK key resolver, AI plan gate, credit ledger, an SSRF guard, the
 * Anthropic SDK (must NEVER make a real network call), and a version-snapshot
 * helper. Everything is mocked. We drive the route purely through return
 * values + an in-memory DB shape (just the rows we read/write per test).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (declared BEFORE the route import — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

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

const hasCreditsMock = vi.fn();
const deductCreditsMock = vi.fn();
const getBalanceMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsMock(...args),
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
}));

const getBrandingByClientIdMock = vi.fn();
const getBrandingByProfileIdMock = vi.fn();
const brandingToPitchDeckThemeMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandingByClientId: (...args: unknown[]) => getBrandingByClientIdMock(...args),
  getBrandingByProfileId: (...args: unknown[]) => getBrandingByProfileIdMock(...args),
  brandingToPitchDeckTheme: (...args: unknown[]) => brandingToPitchDeckThemeMock(...args),
}));

const assertSafeUrlMock = vi.fn();
vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: (...args: unknown[]) => assertSafeUrlMock(...args),
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

// ---- LLM seam — never let it touch the network ----

const completeMock = vi.fn();
vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => completeMock(...args),
}));

// ---- schema — wrap so column refs round-trip through our DB mock ----

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
    pitchDecks: wrap('pitchDecks'),
    aiConversations: wrap('aiConversations'),
    aiMessages: wrap('aiMessages'),
    brandingMessaging: wrap('brandingMessaging'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory DB shape — only the tables this route reads/writes ----

interface MockState {
  pitchDecks: Array<Record<string, unknown>>;
  aiConversations: Array<Record<string, unknown>>;
  aiMessages: Array<Record<string, unknown>>;
  brandingMessaging: Array<Record<string, unknown>>;
}

const state: MockState = {
  pitchDecks: [],
  aiConversations: [],
  aiMessages: [],
  brandingMessaging: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

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
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === null || row[col.__col] === undefined;
    }
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
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
      let out = rows.map((r) => ({ ...r }));
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
            return Promise.resolve(inserted.map((r) => ({ ...r })));
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

  return {
    db: {
      select() {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
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
// Module under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { POST } = await import('@/app/api/portal/tools/pitch-decks/[id]/generate/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DEFAULT_THEME = {
  primaryColor: '#1a2744',
  accentColor: '#c9a84c',
  backgroundColor: '#0f1b2d',
  textColor: '#ffffff',
  headingFont: 'Cormorant Garamond',
  bodyFont: 'Plus Jakarta Sans',
};

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://x/api/portal/tools/pitch-decks/1/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function defaultDeck(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    title: 'My Pitch Deck',
    slides: [],
    theme: DEFAULT_THEME,
    formatVersion: 1,
    sourceUrl: null,
    brandingProfileId: null,
    ...over,
  };
}

function makeAiSlidesJson(slides = 1): string {
  const arr = Array.from({ length: slides }, (_, i) => ({
    id: `slide-${i + 1}`,
    label: 'Cover',
    blocks: [{ id: `b-${i + 1}`, type: 'hero', order: 1, title: `T${i + 1}` }],
  }));
  return JSON.stringify({ slides: arr });
}

function aiResponse(text: string, opts: { stop?: string; input?: number; output?: number } = {}) {
  const inputTokens = opts.input ?? 100;
  const outputTokens = opts.output ?? 200;
  // Map Anthropic stop_reason 'max_tokens' to the seam's finishReason 'length'
  const finishReason = opts.stop === 'max_tokens' ? 'length' : 'stop';
  return {
    text,
    finishReason,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  };
}

beforeEach(() => {
  state.pitchDecks.length = 0;
  state.aiConversations.length = 0;
  state.aiMessages.length = 0;
  state.brandingMessaging.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  saveVersionSnapshotMock.mockReset().mockResolvedValue(undefined);
  hasCreditsMock.mockReset().mockResolvedValue(true);
  deductCreditsMock.mockReset().mockResolvedValue(undefined);
  getBalanceMock.mockReset().mockResolvedValue({ balance: 0 });
  getBrandingByClientIdMock.mockReset();
  getBrandingByProfileIdMock.mockReset();
  brandingToPitchDeckThemeMock.mockReset().mockReturnValue(DEFAULT_THEME);
  assertSafeUrlMock.mockReset().mockResolvedValue(undefined);
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
  completeMock.mockReset();

  // sane defaults
  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  getBrandingByClientIdMock.mockResolvedValue({
    primaryColor: '#2563eb', // sentinel "no branding configured"
    accentColor: null,
    headingFont: null,
    bodyFont: null,
    logoUrl: null,
  });
  getBrandingByProfileIdMock.mockResolvedValue({
    primaryColor: '#2563eb',
    accentColor: null,
    headingFont: null,
    bodyFont: null,
    logoUrl: null,
  });
  process.env.NODE_ENV = 'test';
});

// ---------------------------------------------------------------------------
// Auth + early-exit branches
// ---------------------------------------------------------------------------

describe('POST /generate — auth + early exits', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when the deck does not belong to the client', async () => {
    state.pitchDecks.push(defaultDeck({ id: 1, clientId: 999 }));
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when no deck with the given id exists', async () => {
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('42'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when the prompt is missing', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await POST(makeRequest({}), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Prompt is required');
  });

  it('returns 400 when the prompt is whitespace only', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await POST(makeRequest({ prompt: '   ' }), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    state.pitchDecks.push(defaultDeck());
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Upgrade required',
      reason: 'plan_lock',
    });
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Upgrade required', reason: 'plan_lock' });
    // We never reached Anthropic
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns 402 with creditsRemaining when on platform key + production + no credits', async () => {
    process.env.NODE_ENV = 'production';
    state.pitchDecks.push(defaultDeck());
    hasCreditsMock.mockResolvedValueOnce(false);
    getBalanceMock.mockResolvedValueOnce({ balance: 123 });
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.creditsRemaining).toBe(123);
    expect(body.message).toMatch(/Insufficient AI credits/);
  });

  it('skips credit check entirely when source=byok even in production', async () => {
    process.env.NODE_ENV = 'production';
    state.pitchDecks.push(defaultDeck());
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok' });
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(2)));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(hasCreditsMock).not.toHaveBeenCalled();
    // BYOK should NOT trigger credit deduction either
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(resolveClientApiKeyMock).toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({ task: 'deckGen' }));
  });
});

// ---------------------------------------------------------------------------
// Happy path — slide generation, save, and bookkeeping
// ---------------------------------------------------------------------------

describe('POST /generate — happy path', () => {
  it('returns 200 + updated deck with new slides on success', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(3)));

    const res = await POST(makeRequest({ prompt: 'Make a deck' }), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.slides)).toBe(true);
    expect(body.data.slides).toHaveLength(3);
    expect(body.data.formatVersion).toBe(2);
  });

  it('strips ```json fences from the AI response before parsing', async () => {
    state.pitchDecks.push(defaultDeck());
    const fenced = '```json\n' + makeAiSlidesJson(2) + '\n```';
    completeMock.mockResolvedValueOnce(aiResponse(fenced));

    const res = await POST(makeRequest({ prompt: 'Make a deck' }), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slides).toHaveLength(2);
  });

  it('strips bare ``` fences (no language) from the AI response', async () => {
    state.pitchDecks.push(defaultDeck());
    const fenced = '```\n' + makeAiSlidesJson(1) + '\n```';
    completeMock.mockResolvedValueOnce(aiResponse(fenced));

    const res = await POST(makeRequest({ prompt: 'Make a deck' }), makeParams('1'));
    expect(res.status).toBe(200);
  });

  it('accepts a bare array as the "slides" payload (parsed.slides || parsed)', async () => {
    state.pitchDecks.push(defaultDeck());
    const bare = JSON.stringify([
      { id: 's-1', label: 'Cover', blocks: [{ id: 'b-1', type: 'hero', order: 1, title: 'X' }] },
    ]);
    completeMock.mockResolvedValueOnce(aiResponse(bare));

    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slides).toHaveLength(1);
  });

  it('returns 500 with friendly message when AI returns malformed JSON', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse('not json {{{'));

    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/AI returned invalid JSON/);
  });

  it('saves a version snapshot tagged ai_generate on first generation (no existing slides)', async () => {
    state.pitchDecks.push(defaultDeck({ slides: [] }));
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));
    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(saveVersionSnapshotMock).toHaveBeenCalledWith(
      1,
      [],
      expect.any(Object),
      'ai_generate',
      7,
    );
  });

  it('saves a version snapshot tagged ai_regenerate when slides already exist', async () => {
    const existingSlides = [{ id: 'old-1', label: 'Cover', blocks: [] }];
    state.pitchDecks.push(defaultDeck({ slides: existingSlides }));
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));
    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(saveVersionSnapshotMock).toHaveBeenCalledWith(
      1,
      existingSlides,
      expect.any(Object),
      'ai_regenerate',
      7,
    );
  });

  it('records a user + assistant message pair in aiMessages', async () => {
    state.pitchDecks.push(defaultDeck());
    // Configure branding so the URL branch is skipped — keep the test focused on
    // message bookkeeping, not the SSRF fetch path.
    getBrandingByClientIdMock.mockResolvedValueOnce({
      primaryColor: '#ff0099', accentColor: null, headingFont: 'Inter', bodyFont: null, logoUrl: null,
    });
    completeMock.mockResolvedValueOnce(
      aiResponse(makeAiSlidesJson(2), { input: 1000, output: 2000 }),
    );
    await POST(
      makeRequest({ prompt: 'cool deck please', websiteUrl: 'https://acme.test' }),
      makeParams('1'),
    );
    expect(state.aiMessages).toHaveLength(2);
    const [user, assistant] = state.aiMessages;
    expect(user.role).toBe('user');
    expect(user.content).toContain('cool deck please');
    expect(user.content).toContain('https://acme.test');
    expect(assistant.role).toBe('assistant');
    expect(assistant.content).toContain('Generated 2 slides');
    expect(assistant.inputTokens).toBe(1000);
    expect(assistant.outputTokens).toBe(2000);
  });

  it('writes the conversation row with the deck title', async () => {
    state.pitchDecks.push(defaultDeck({ title: 'Series A Deck' }));
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));
    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(state.aiConversations).toHaveLength(1);
    expect(state.aiConversations[0].title).toBe('Pitch Deck: Series A Deck');
    expect(state.aiConversations[0].clientId).toBe(10);
  });

  it('updates the deck row with new slides, theme, formatVersion=2, and sourceUrl', async () => {
    state.pitchDecks.push(defaultDeck());
    // Pre-configure branding so the URL-branding fallback is skipped (this test
    // is about the deck row update, not the SSRF fetch path).
    getBrandingByClientIdMock.mockResolvedValueOnce({
      primaryColor: '#ff0099', accentColor: null, headingFont: 'Inter', bodyFont: null, logoUrl: null,
    });
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));
    await POST(
      makeRequest({ prompt: 'go', websiteUrl: 'https://acme.test' }),
      makeParams('1'),
    );
    const deck = state.pitchDecks[0];
    expect(deck.formatVersion).toBe(2);
    expect(deck.sourceUrl).toBe('https://acme.test');
    expect(Array.isArray(deck.slides)).toBe(true);
  });

  it('preserves the existing sourceUrl when no websiteUrl is provided', async () => {
    state.pitchDecks.push(defaultDeck({ sourceUrl: 'https://existing.test' }));
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));
    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(state.pitchDecks[0].sourceUrl).toBe('https://existing.test');
  });
});

// ---------------------------------------------------------------------------
// Truncation / continuation
// ---------------------------------------------------------------------------

describe('POST /generate — continuation when stop_reason=max_tokens', () => {
  it('makes a second Anthropic call and concatenates the output', async () => {
    state.pitchDecks.push(defaultDeck());
    // First call truncates — return partial JSON (open brace). Second call
    // completes the JSON so we can parse.
    const partial = '{"slides":[';
    const completion =
      '{"id":"s-1","label":"Cover","blocks":[{"id":"b-1","type":"hero","order":1,"title":"X"}]}]}';
    completeMock
      .mockResolvedValueOnce(aiResponse(partial, { stop: 'max_tokens', input: 500, output: 800 }))
      .mockResolvedValueOnce(aiResponse(completion, { stop: 'end_turn', input: 600, output: 400 }));

    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(completeMock).toHaveBeenCalledTimes(2);
    // Token totals across both calls were recorded
    const assistant = state.aiMessages.find((m) => m.role === 'assistant');
    expect(assistant!.inputTokens).toBe(1100);
    expect(assistant!.outputTokens).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// Branding paths — configured branding vs. URL-fallback brand extraction
// ---------------------------------------------------------------------------

describe('POST /generate — branding selection', () => {
  it('uses configured client branding (primaryColor != default sentinel) and skips brand-extract call', async () => {
    state.pitchDecks.push(defaultDeck());
    getBrandingByClientIdMock.mockResolvedValueOnce({
      primaryColor: '#ff0099', // not the sentinel → "configured"
      accentColor: '#000000',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoUrl: null,
    });
    const themed = { ...DEFAULT_THEME, primaryColor: '#ff0099' };
    brandingToPitchDeckThemeMock.mockReturnValueOnce(themed);
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(brandingToPitchDeckThemeMock).toHaveBeenCalled();
    expect(state.pitchDecks[0].theme).toEqual(themed);
    // Only one Anthropic call — no brand-extract step
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('uses the deck-attached branding profile when brandingProfileId is set', async () => {
    state.pitchDecks.push(defaultDeck({ brandingProfileId: 42 }));
    getBrandingByProfileIdMock.mockResolvedValueOnce({
      primaryColor: '#abcdef',
      accentColor: '#fedcba',
      headingFont: 'Custom',
      bodyFont: 'Custom',
      logoUrl: 'https://cdn/logo.png',
    });
    brandingToPitchDeckThemeMock.mockReturnValueOnce(DEFAULT_THEME);
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(getBrandingByProfileIdMock).toHaveBeenCalledWith(42);
    expect(getBrandingByClientIdMock).not.toHaveBeenCalled();
  });

  it('falls back to fetching the website + AI brand-extract when no branding is configured', async () => {
    state.pitchDecks.push(defaultDeck());
    // Default branding mocks already return the "#2563eb" sentinel — no branding configured.
    const html = '<html><body>About Acme</body></html>';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );
    // First Anthropic call = brand extract. Second = slide generation.
    completeMock
      .mockResolvedValueOnce(
        aiResponse(
          JSON.stringify({
            primaryColor: '#111111',
            accentColor: '#222222',
            backgroundColor: '#000000',
            textColor: '#ffffff',
            headingFont: 'Custom Head',
            bodyFont: 'Custom Body',
            companyName: 'Acme Co',
            industry: 'SaaS',
            tagline: 'We do stuff',
          }),
          { input: 50, output: 60 },
        ),
      )
      .mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1), { input: 70, output: 80 }));

    const res = await POST(
      makeRequest({ prompt: 'go', websiteUrl: 'https://acme.test' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(assertSafeUrlMock).toHaveBeenCalledWith('https://acme.test');
    expect(fetchSpy).toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalledTimes(2);
    // Theme should have inherited from extract
    expect(state.pitchDecks[0].theme).toMatchObject({ primaryColor: '#111111' });
    fetchSpy.mockRestore();
  });

  it('swallows brand-extract failures (e.g. SSRF reject) and proceeds with deck generation', async () => {
    state.pitchDecks.push(defaultDeck());
    assertSafeUrlMock.mockRejectedValueOnce(new Error('private network'));
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));

    const res = await POST(
      makeRequest({ prompt: 'go', websiteUrl: 'https://10.0.0.1' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    // Generation still went through — exactly one Anthropic call (brand-extract failed early)
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('refuses to follow redirects from the brand-fetch (SSRF guard 3xx check)', async () => {
    state.pitchDecks.push(defaultDeck());
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 302 }),
    );
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));

    const res = await POST(
      makeRequest({ prompt: 'go', websiteUrl: 'https://acme.test' }),
      makeParams('1'),
    );
    // Should still 200 — fetch failure is caught silently
    expect(res.status).toBe(200);
    // Only the slide-generation call happened — brand-extract bailed out
    expect(completeMock).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Messaging context loading
// ---------------------------------------------------------------------------

describe('POST /generate — messaging context', () => {
  it('weaves messaging fields into the prompt when present for the client', async () => {
    state.pitchDecks.push(defaultDeck());
    state.brandingMessaging.push({
      clientId: 10,
      brandingProfileId: null,
      companyName: 'Acme',
      tagline: 'Best in class',
      industry: 'SaaS',
      missionStatement: 'Build cool stuff',
      visionStatement: null,
      valueProposition: null,
      elevatorPitch: null,
      boilerplate: null,
      targetAudience: 'CTOs',
      toneOfVoice: 'witty',
      brandPersonality: null,
      writingStyle: null,
      keyDifferentiators: ['fast', 'cheap'],
      socialProof: null,
      keyClients: null,
      certifications: null,
      yearFounded: null,
      companySize: null,
      headquarters: null,
      additionalContext: null,
    });
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));

    await POST(makeRequest({ prompt: 'investor deck' }), makeParams('1'));

    const call = completeMock.mock.calls[0]![0] as {
      task: string; clientId: number; system: string; prompt?: string; messages?: unknown[];
    };
    const userMsg = call.prompt ?? '';
    expect(userMsg).toContain('Acme');
    expect(userMsg).toContain('Best in class');
    expect(userMsg).toContain('CTOs');
    expect(userMsg).toContain('fast; cheap');
    expect(userMsg).toContain('investor deck');
  });

  it('falls back to default-profile messaging when profile-specific row is absent', async () => {
    state.pitchDecks.push(defaultDeck({ brandingProfileId: 99 }));
    // Only a default-profile messaging row exists (profileId=null)
    state.brandingMessaging.push({
      clientId: 10,
      brandingProfileId: null,
      companyName: 'Default Co',
      tagline: null,
      industry: null,
      missionStatement: null,
      visionStatement: null,
      valueProposition: null,
      elevatorPitch: null,
      boilerplate: null,
      targetAudience: null,
      toneOfVoice: null,
      brandPersonality: null,
      writingStyle: null,
      keyDifferentiators: null,
      socialProof: null,
      keyClients: null,
      certifications: null,
      yearFounded: null,
      companySize: null,
      headquarters: null,
      additionalContext: null,
    });
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    const call = completeMock.mock.calls[0]![0] as {
      task: string; clientId: number; system: string; prompt?: string; messages?: unknown[];
    };
    expect(call.prompt ?? '').toContain('Default Co');
  });

  it('proceeds normally when there is no messaging row at all', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Credits / audit bookkeeping
// ---------------------------------------------------------------------------

describe('POST /generate — credits + audit', () => {
  it('deducts platform credits in production using total tokens across all calls', async () => {
    process.env.NODE_ENV = 'production';
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(
      aiResponse(makeAiSlidesJson(1), { input: 3000, output: 5000 }),
    );

    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(deductCreditsMock).toHaveBeenCalledWith(
      10,
      8000,
      'pitch-decks',
      '1',
      expect.stringContaining('My Pitch Deck'),
    );
  });

  it('does NOT deduct credits when NODE_ENV is not production (skip in dev)', async () => {
    process.env.NODE_ENV = 'development';
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(makeAiSlidesJson(1)));
    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(deductCreditsMock).not.toHaveBeenCalled();
  });

  it('always records AI usage regardless of source', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(
      aiResponse(makeAiSlidesJson(1), { input: 11, output: 22 }),
    );
    await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, source: 'platform', tokens: 33 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Top-level catch-all
// ---------------------------------------------------------------------------

describe('POST /generate — error envelope', () => {
  it('returns 500 with the error message when an unexpected failure happens', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockRejectedValueOnce(new Error('boom from Anthropic'));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('boom from Anthropic');
  });

  it('handles a thrown non-Error value (stringifies it into the 500 envelope)', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockRejectedValueOnce('string-not-error');
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain('string-not-error');
  });
});
