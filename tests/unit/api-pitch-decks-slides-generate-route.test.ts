// @vitest-environment node
/**
 * Unit tests for POST /api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate.
 *
 * The route touches: auth, the portal-client resolver, the pitchDecks table,
 * branding helper, BYOK key resolver, AI plan gate, audit recorder, the
 * Anthropic SDK (must NEVER make a real network call), a version-snapshot
 * helper, slide-prompt-builder, slide-edit-optimizer, and the
 * validate-slide-response helper. Everything is mocked.
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

const classifyEditMock = vi.fn();
const minimizePayloadMock = vi.fn();
const applyPatchResponseMock = vi.fn();
const isPatchResponseMock = vi.fn();
vi.mock('@/lib/ai/slide-edit-optimizer', () => ({
  classifyEdit: (...args: unknown[]) => classifyEditMock(...args),
  minimizePayload: (...args: unknown[]) => minimizePayloadMock(...args),
  applyPatchResponse: (...args: unknown[]) => applyPatchResponseMock(...args),
  isPatchResponse: (...args: unknown[]) => isPatchResponseMock(...args),
}));

// ---- LLM seam — never let it touch the network ----
const completeMock = vi.fn();
vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => completeMock(...args),
}));

// ---- schema mock ----
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
    clientWebsites: wrap('clientWebsites'),
    siteBranding: wrap('siteBranding'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory DB shape ----
interface MockState {
  pitchDecks: Array<Record<string, unknown>>;
}
const state: MockState = { pitchDecks: [] };

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
    default:
      return true;
  }
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { POST } = await import(
  '@/app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route'
);

// ---------------------------------------------------------------------------
// Helpers
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
  return new Request('http://x/api/portal/tools/pitch-decks/1/slides/0/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string, slideIndex: string) {
  return { params: Promise.resolve({ id, slideIndex }) };
}

function makeSlide(over: Record<string, unknown> = {}) {
  return {
    id: 'slide-1',
    label: 'Cover',
    blocks: [
      { id: 'b-1', type: 'hero', order: 1, title: 'Hello', content: 'World' },
    ],
    notes: 'speaker notes',
    ...over,
  };
}

function defaultDeck(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    title: 'My Pitch Deck',
    description: 'A test deck',
    slides: [makeSlide(), makeSlide({ id: 'slide-2', label: 'Body' }), makeSlide({ id: 'slide-3', label: 'CTA' })],
    theme: DEFAULT_THEME,
    formatVersion: 2,
    ...over,
  };
}

function aiResponse(text: string, opts: { truncated?: boolean; input?: number; output?: number } = {}) {
  const inputTokens = opts.input ?? 100;
  const outputTokens = opts.output ?? 200;
  return {
    text,
    finishReason: opts.truncated ? 'length' : 'stop',
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  };
}

function fullSlideJson() {
  return JSON.stringify({
    id: 'slide-1',
    label: 'Updated Cover',
    blocks: [{ id: 'b-1', type: 'hero', order: 1, title: 'New Title' }],
  });
}

beforeEach(() => {
  state.pitchDecks.length = 0;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  saveVersionSnapshotMock.mockReset().mockResolvedValue(undefined);
  getBrandingByClientIdMock.mockReset();
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
  buildSlideEditPromptMock.mockReset().mockReturnValue('SYSTEM PROMPT');
  validateSlideResponseMock.mockReset();
  classifyEditMock.mockReset().mockReturnValue('full');
  minimizePayloadMock.mockReset().mockImplementation((slide: Record<string, unknown>) => ({
    slide,
    systemAddendum: '',
    userPrefix: 'Current slide:',
    maxTokens: 4096,
    skipAdjacentSlides: false,
  }));
  applyPatchResponseMock.mockReset();
  isPatchResponseMock.mockReset().mockReturnValue(false);
  completeMock.mockReset();

  // sane defaults
  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  getBrandingByClientIdMock.mockResolvedValue({
    primaryColor: '#ff0099',
    accentColor: '#222222',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    logoText: 'Acme',
  });
  validateSlideResponseMock.mockReturnValue({
    valid: true,
    slide: makeSlide({ label: 'Updated Cover' }),
    warnings: [],
  });
});

// ---------------------------------------------------------------------------
// Auth + early-exit branches
// ---------------------------------------------------------------------------

describe('POST /slides/[slideIndex]/generate — auth + early exits', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1', '0'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session user has no id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1', '0'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1', '0'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when no deck with the given id exists', async () => {
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('42', '0'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when the deck belongs to a different client', async () => {
    state.pitchDecks.push(defaultDeck({ clientId: 999 }));
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1', '0'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when slideIndex is negative', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1', '-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid slide index');
  });

  it('returns 400 when slideIndex is out of range (>= slides.length)', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await POST(makeRequest({ prompt: 'p' }), makeParams('1', '99'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid slide index');
  });

  it('returns 400 when prompt is missing', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await POST(makeRequest({}), makeParams('1', '0'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Prompt is required');
  });

  it('returns 400 when prompt is whitespace only', async () => {
    state.pitchDecks.push(defaultDeck());
    const res = await POST(makeRequest({ prompt: '   ' }), makeParams('1', '0'));
    expect(res.status).toBe(400);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    state.pitchDecks.push(defaultDeck());
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Upgrade required',
      reason: 'plan_lock',
    });
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Upgrade required', reason: 'plan_lock' });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('handles an empty slides array (out-of-range for index 0)', async () => {
    state.pitchDecks.push(defaultDeck({ slides: [] }));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Happy path — full-slide validation
// ---------------------------------------------------------------------------

describe('POST /slides/[slideIndex]/generate — happy path (full slide)', () => {
  it('returns 200 + updated deck on successful full-slide edit', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    const res = await POST(makeRequest({ prompt: 'rewrite this slide' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.editType).toBe('full');
    expect(Array.isArray(body.data.slides)).toBe(true);
    expect(body.data.slides[0].label).toBe('Updated Cover');
    expect(body.data.formatVersion).toBe(2);
  });

  it('resolveClientApiKey is called and seam receives the right clientId', async () => {
    state.pitchDecks.push(defaultDeck());
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok-123' });
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(resolveClientApiKeyMock).toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({ task: 'slideGen' }));
  });

  it('saves a version snapshot tagged ai_slide_edit before editing', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '1'));
    expect(saveVersionSnapshotMock).toHaveBeenCalledTimes(1);
    const args = saveVersionSnapshotMock.mock.calls[0]!;
    expect(args[0]).toBe(1);
    expect(Array.isArray(args[1])).toBe(true);
    expect((args[1] as unknown[]).length).toBe(3);
    expect(args[2]).toEqual(DEFAULT_THEME);
    expect(args[3]).toBe('ai_slide_edit');
    expect(args[4]).toBe(7);
  });

  it('strips ```json fences before parsing', async () => {
    state.pitchDecks.push(defaultDeck());
    const fenced = '```json\n' + fullSlideJson() + '\n```';
    completeMock.mockResolvedValueOnce(aiResponse(fenced));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
  });

  it('strips bare ``` fences (no language) before parsing', async () => {
    state.pitchDecks.push(defaultDeck());
    const fenced = '```\n' + fullSlideJson() + '\n```';
    completeMock.mockResolvedValueOnce(aiResponse(fenced));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
  });

  it('extracts JSON from prose-wrapped responses via regex fallback', async () => {
    state.pitchDecks.push(defaultDeck());
    const text = 'Here you go!\n' + fullSlideJson() + '\nThanks!';
    completeMock.mockResolvedValueOnce(aiResponse(text));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
  });

  it('returns 500 when no JSON can be parsed at all', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse('totally not json'));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/AI returned invalid JSON/);
  });

  it('returns 500 when the regex-extracted JSON is also malformed', async () => {
    state.pitchDecks.push(defaultDeck());
    // Contains braces, but invalid inside
    completeMock.mockResolvedValueOnce(aiResponse('prefix {oops not valid json} suffix'));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/AI returned invalid JSON/);
  });

  it('returns 500 when validateSlideResponse reports invalid', async () => {
    state.pitchDecks.push(defaultDeck());
    validateSlideResponseMock.mockReturnValueOnce({
      valid: false,
      slide: {} as never,
      warnings: ['bad shape'],
    });
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/validation/i);
  });

  it('includes warnings array in success response when validator emits warnings', async () => {
    state.pitchDecks.push(defaultDeck());
    validateSlideResponseMock.mockReturnValueOnce({
      valid: true,
      slide: makeSlide(),
      warnings: ['minor: defaulted color'],
    });
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warnings).toEqual(['minor: defaulted color']);
  });

  it('omits warnings field when validator returns no warnings', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    const body = await res.json();
    expect(body.warnings).toBeUndefined();
  });

  it('replaces only the targeted slide and preserves the others', async () => {
    state.pitchDecks.push(defaultDeck());
    validateSlideResponseMock.mockReturnValueOnce({
      valid: true,
      slide: makeSlide({ id: 'slide-2', label: 'BRAND NEW' }),
      warnings: [],
    });
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'edit middle' }), makeParams('1', '1'));
    const updated = state.pitchDecks[0].slides as Array<{ id: string; label: string }>;
    expect(updated).toHaveLength(3);
    expect(updated[0].id).toBe('slide-1');
    expect(updated[1].label).toBe('BRAND NEW');
    expect(updated[2].id).toBe('slide-3');
  });
});

// ---------------------------------------------------------------------------
// Patch (style / content) edit path
// ---------------------------------------------------------------------------

describe('POST /slides/[slideIndex]/generate — patch edit path', () => {
  it('applies a style patch when classifyEdit=style and response isPatchResponse', async () => {
    state.pitchDecks.push(defaultDeck());
    classifyEditMock.mockReturnValueOnce('style');
    minimizePayloadMock.mockReturnValueOnce({
      slide: makeSlide(),
      systemAddendum: '\n# STYLE PATCH',
      userPrefix: 'Style only:',
      maxTokens: 2048,
      skipAdjacentSlides: true,
    });
    isPatchResponseMock.mockReturnValueOnce(true);
    applyPatchResponseMock.mockReturnValueOnce(
      makeSlide({ label: 'Patched-Style' }),
    );

    completeMock.mockResolvedValueOnce(
      aiResponse(JSON.stringify({ patches: [{ id: 'b-1', style: { color: '#fff' } }] })),
    );

    const res = await POST(makeRequest({ prompt: 'make it blue' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.editType).toBe('style');
    expect(applyPatchResponseMock).toHaveBeenCalled();
    expect(validateSlideResponseMock).not.toHaveBeenCalled();
    expect(body.data.slides[0].label).toBe('Patched-Style');
  });

  it('applies a content patch when classifyEdit=content and response isPatchResponse', async () => {
    state.pitchDecks.push(defaultDeck());
    classifyEditMock.mockReturnValueOnce('content');
    minimizePayloadMock.mockReturnValueOnce({
      slide: makeSlide(),
      systemAddendum: '\n# CONTENT PATCH',
      userPrefix: 'Content only:',
      maxTokens: 4096,
      skipAdjacentSlides: false,
    });
    isPatchResponseMock.mockReturnValueOnce(true);
    applyPatchResponseMock.mockReturnValueOnce(makeSlide({ label: 'Patched-Content' }));

    completeMock.mockResolvedValueOnce(
      aiResponse(JSON.stringify({ patches: [{ id: 'b-1', content: 'new content' }] })),
    );

    const res = await POST(makeRequest({ prompt: 'rewrite copy' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.editType).toBe('content');
    expect(applyPatchResponseMock).toHaveBeenCalled();
  });

  it('falls back to full validation when classifyEdit=style but response is not a patch', async () => {
    state.pitchDecks.push(defaultDeck());
    classifyEditMock.mockReturnValueOnce('style');
    isPatchResponseMock.mockReturnValueOnce(false);
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    const res = await POST(makeRequest({ prompt: 'make it blue' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    expect(applyPatchResponseMock).not.toHaveBeenCalled();
    expect(validateSlideResponseMock).toHaveBeenCalled();
  });

  it('uses full validation when classifyEdit=structural (never tries patch path)', async () => {
    state.pitchDecks.push(defaultDeck());
    classifyEditMock.mockReturnValueOnce('structural');
    isPatchResponseMock.mockReturnValueOnce(true); // even if patch-shaped, should still validate
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    const res = await POST(makeRequest({ prompt: 'rebuild layout' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    expect(validateSlideResponseMock).toHaveBeenCalled();
    expect(applyPatchResponseMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Conversation history + adjacent slides
// ---------------------------------------------------------------------------

describe('POST /slides/[slideIndex]/generate — history + adjacency', () => {
  it('includes prior history (truncated to last 6) in messages', async () => {
    state.pitchDecks.push(defaultDeck());
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg-${i}`,
    }));
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go', history }), makeParams('1', '0'));

    const call = completeMock.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    // 6 history msgs + 1 current turn
    expect(call.messages).toHaveLength(7);
    expect(call.messages[0].content).toBe('msg-4'); // last 6 = idx 4..9
    expect(call.messages[5].content).toBe('msg-9');
  });

  it('omits adjacent slides from user message when skipAdjacentSlides=true', async () => {
    state.pitchDecks.push(defaultDeck());
    minimizePayloadMock.mockReturnValueOnce({
      slide: makeSlide(),
      systemAddendum: '',
      userPrefix: 'X:',
      maxTokens: 2048,
      skipAdjacentSlides: true,
    });
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '1')); // middle slide

    const call = completeMock.mock.calls[0]![0] as {
      messages: Array<{ content: string }>;
    };
    expect(call.messages[0].content).not.toContain('Adjacent slides');
  });

  it('includes adjacent slides section for middle slide when skipAdjacentSlides=false', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '1')); // middle of 3

    const call = completeMock.mock.calls[0]![0] as {
      messages: Array<{ content: string }>;
    };
    expect(call.messages[0].content).toContain('Adjacent slides');
    expect(call.messages[0].content).toContain('Previous slide');
    expect(call.messages[0].content).toContain('Next slide');
  });

  it('only includes "Previous slide" when editing the last slide', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '2')); // last of 3
    const call = completeMock.mock.calls[0]![0] as {
      messages: Array<{ content: string }>;
    };
    expect(call.messages[0].content).toContain('Previous slide');
    expect(call.messages[0].content).not.toContain('Next slide');
  });

  it('only includes "Next slide" when editing the first slide', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    const call = completeMock.mock.calls[0]![0] as {
      messages: Array<{ content: string }>;
    };
    expect(call.messages[0].content).toContain('Next slide');
    expect(call.messages[0].content).not.toContain('Previous slide');
  });
});

// ---------------------------------------------------------------------------
// Continuation on max_tokens
// ---------------------------------------------------------------------------

describe('POST /slides/[slideIndex]/generate — continuation', () => {
  it('makes a second LLM call and concatenates output when finishReason=length', async () => {
    state.pitchDecks.push(defaultDeck());
    const partial = fullSlideJson().slice(0, 20);
    const completion = fullSlideJson().slice(20);
    completeMock
      .mockResolvedValueOnce(aiResponse(partial, { truncated: true, input: 500, output: 800 }))
      .mockResolvedValueOnce(aiResponse(completion, { input: 600, output: 400 }));

    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    expect(completeMock).toHaveBeenCalledTimes(2);
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, source: 'platform', tokens: 500 + 800 + 600 + 400 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Branding context (non-critical swallow)
// ---------------------------------------------------------------------------

describe('POST /slides/[slideIndex]/generate — branding context', () => {
  it('proceeds normally when getBrandingByClientId throws (swallowed)', async () => {
    state.pitchDecks.push(defaultDeck());
    getBrandingByClientIdMock.mockRejectedValueOnce(new Error('branding service down'));
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(200);
    // buildSlideEditPrompt should have been called with brandInfo=null
    const call = buildSlideEditPromptMock.mock.calls[0]!;
    expect(call[1].brandInfo).toBeNull();
  });

  it('forwards branding fields into buildSlideEditPrompt when available', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));

    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    const call = buildSlideEditPromptMock.mock.calls[0]!;
    expect(call[1].brandInfo).toMatchObject({
      primaryColor: '#ff0099',
      accentColor: '#222222',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoText: 'Acme',
    });
  });
});

// ---------------------------------------------------------------------------
// Audit + top-level catch
// ---------------------------------------------------------------------------

describe('POST /slides/[slideIndex]/generate — audit + errors', () => {
  it('records AI usage with combined tokens', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockResolvedValueOnce(
      aiResponse(fullSlideJson(), { input: 11, output: 22 }),
    );
    await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, source: 'platform', tokens: 33 }),
    );
  });

  it('returns 500 with generic message on unexpected throw inside the route', async () => {
    state.pitchDecks.push(defaultDeck());
    completeMock.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Internal server error' });
  });

  it('returns 500 when saveVersionSnapshot rejects', async () => {
    state.pitchDecks.push(defaultDeck());
    saveVersionSnapshotMock.mockRejectedValueOnce(new Error('snapshot failure'));
    completeMock.mockResolvedValueOnce(aiResponse(fullSlideJson()));
    const res = await POST(makeRequest({ prompt: 'go' }), makeParams('1', '0'));
    expect(res.status).toBe(500);
  });
});
