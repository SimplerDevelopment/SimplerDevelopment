// @vitest-environment node
/**
 * Unit tests for lib/magamommy/agents/researcher.ts
 *
 * Exports under test:
 *   - runResearcher (orchestrator — mocks db, resolveClientApiKey, Anthropic SDK)
 *
 * Internal helpers (formatWeekOf, extractJsonBlob, coerceTopic) are exercised
 * indirectly by varying the canned AI response text fed through runResearcher.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── drizzle-orm stub ──────────────────────────────────────────────────────────
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual };
});

// ── schema stub ───────────────────────────────────────────────────────────────
vi.mock('@/lib/db/schema', () => ({
  magamommyBriefs: {
    id: { __col: 'id' },
    websiteId: { __col: 'websiteId' },
    weekOf: { __col: 'weekOf' },
    topics: { __col: 'topics' },
    rawModelResponse: { __col: 'rawModelResponse' },
  },
}));

// ── db mock ───────────────────────────────────────────────────────────────────
const mockDbInsert = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

// ── resolveClientApiKey mock ──────────────────────────────────────────────────
const mockResolveClientApiKey = vi.fn();

vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => mockResolveClientApiKey(...args),
}));

// ── Anthropic SDK mock ────────────────────────────────────────────────────────
// mockMessagesCreate is mutated per-test via mockResolvedValue / mockRejectedValue.
const mockMessagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: (...args: unknown[]) => mockMessagesCreate(...args),
    };
  },
}));

// ── module under test (after all vi.mock calls) ───────────────────────────────
const { runResearcher } = await import('@/lib/magamommy/agents/researcher');

// ── shared fixtures ───────────────────────────────────────────────────────────

const BASE_INPUT = {
  clientId: 1,
  websiteId: 2,
  weekOf: new Date('2025-06-02T00:00:00.000Z'),
};

const VALID_TOPICS_JSON = JSON.stringify({
  topics: [
    {
      slug: 'economy-tariffs',
      headline: 'Rising grocery prices hit families hard',
      context: 'Grocery prices spiked again in May 2025 as tariffs expanded. Families at school pickup are buzzing about it.',
      sourceUrls: ['https://foxnews.com/story-1', 'https://breitbart.com/story-2'],
    },
    {
      slug: 'parental-rights-schools',
      headline: 'Parents push back on school curricula',
      context: 'State legislatures debated new bills in May 2025. Local Facebook groups saw surge of posts.',
      sourceUrls: ['https://dailywire.com/story-3'],
    },
    {
      slug: 'border-security',
      headline: 'Border policies dominate suburban conversation',
      context: 'Polling from early June 2025 shows border as top concern. Fox News dominated coverage.',
      sourceUrls: ['https://foxnews.com/border-1', 'https://newsmax.com/border-2'],
    },
  ],
});

function makeEndTurnResponse(text: string): object {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
  };
}

function makeInsertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);
  return chain;
}

// ── happy path ────────────────────────────────────────────────────────────────

describe('runResearcher — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-test', source: 'client' });
    mockMessagesCreate.mockResolvedValue(makeEndTurnResponse(VALID_TOPICS_JSON));
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 42 }]));
  });

  it('returns briefId, topics, and rawModelResponse on success', async () => {
    const result = await runResearcher(BASE_INPUT);
    expect(result.briefId).toBe(42);
    expect(result.topics).toHaveLength(3);
    expect(result.rawModelResponse).toBe(VALID_TOPICS_JSON);
  });

  it('parses topic slugs correctly', async () => {
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].slug).toBe('economy-tariffs');
    expect(result.topics[1].slug).toBe('parental-rights-schools');
    expect(result.topics[2].slug).toBe('border-security');
  });

  it('parses topic headlines correctly', async () => {
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].headline).toBe('Rising grocery prices hit families hard');
    expect(result.topics[2].headline).toBe('Border policies dominate suburban conversation');
  });

  it('parses sourceUrls arrays correctly', async () => {
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].sourceUrls).toEqual([
      'https://foxnews.com/story-1',
      'https://breitbart.com/story-2',
    ]);
  });

  it('calls resolveClientApiKey with correct clientId and provider', async () => {
    await runResearcher(BASE_INPUT);
    expect(mockResolveClientApiKey).toHaveBeenCalledWith({
      clientId: BASE_INPUT.clientId,
      provider: 'anthropic',
    });
  });

  it('calls messages.create with end_turn model response', async () => {
    await runResearcher(BASE_INPUT);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const callArg = mockMessagesCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.model).toBe('claude-opus-4-7');
    expect(callArg.max_tokens).toBe(4096);
  });

  it('includes week-of date in user message', async () => {
    await runResearcher(BASE_INPUT);
    const callArg = mockMessagesCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callArg.messages[0].content;
    expect(userContent).toContain('2025-06-02');
  });

  it('inserts brief into db with correct fields', async () => {
    await runResearcher(BASE_INPUT);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    const insertChain = mockDbInsert.mock.results[0].value as {
      values: ReturnType<typeof vi.fn>;
    };
    const insertedValues = insertChain.values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.websiteId).toBe(BASE_INPUT.websiteId);
    expect(insertedValues.weekOf).toBe('2025-06-02');
    expect(insertedValues.rawModelResponse).toBe(VALID_TOPICS_JSON);
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    const fenced = '```json\n' + VALID_TOPICS_JSON + '\n```';
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(fenced));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics).toHaveLength(3);
  });

  it('handles JSON wrapped in plain code fences (no json specifier)', async () => {
    const fenced = '```\n' + VALID_TOPICS_JSON + '\n```';
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(fenced));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics).toHaveLength(3);
  });

  it('handles leading prose before JSON object', async () => {
    const withProse = 'Here are the results:\n\n' + VALID_TOPICS_JSON;
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(withProse));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics).toHaveLength(3);
  });

  it('truncates slug to 60 chars when model returns too-long slug', async () => {
    const longSlugJson = JSON.stringify({
      topics: [
        {
          slug: 'a'.repeat(80),
          headline: 'Some headline',
          context: 'Context text here.',
          sourceUrls: ['https://example.com'],
        },
      ],
    });
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(longSlugJson));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].slug.length).toBe(60);
  });

  it('truncates headline to 120 chars when model returns too-long headline', async () => {
    const longHeadlineJson = JSON.stringify({
      topics: [
        {
          slug: 'valid-slug',
          headline: 'B'.repeat(200),
          context: 'Context text.',
          sourceUrls: ['https://example.com'],
        },
      ],
    });
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(longHeadlineJson));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].headline.length).toBe(120);
  });

  it('limits sourceUrls to max 5 entries', async () => {
    const manyUrlsJson = JSON.stringify({
      topics: [
        {
          slug: 'test-slug',
          headline: 'Test headline',
          context: 'Context.',
          sourceUrls: [
            'https://a.com', 'https://b.com', 'https://c.com',
            'https://d.com', 'https://e.com', 'https://f.com',
            'https://g.com',
          ],
        },
      ],
    });
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(manyUrlsJson));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].sourceUrls).toHaveLength(5);
  });

  it('filters out non-string sourceUrls', async () => {
    const mixedUrlsJson = JSON.stringify({
      topics: [
        {
          slug: 'test-slug',
          headline: 'Test headline',
          context: 'Context.',
          sourceUrls: ['https://good.com', 123, null, 'https://also-good.com'],
        },
      ],
    });
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(mixedUrlsJson));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].sourceUrls).toEqual([
      'https://good.com',
      'https://also-good.com',
    ]);
  });

  it('skips topics with empty slug', async () => {
    const partialJson = JSON.stringify({
      topics: [
        { slug: '', headline: 'No slug topic', context: 'X.', sourceUrls: [] },
        {
          slug: 'valid-topic',
          headline: 'Valid topic',
          context: 'Context.',
          sourceUrls: ['https://example.com'],
        },
      ],
    });
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(partialJson));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].slug).toBe('valid-topic');
  });

  it('skips topics with empty headline', async () => {
    const partialJson = JSON.stringify({
      topics: [
        { slug: 'topic-a', headline: '', context: 'X.', sourceUrls: [] },
        {
          slug: 'topic-b',
          headline: 'Valid',
          context: 'Context.',
          sourceUrls: ['https://example.com'],
        },
      ],
    });
    mockMessagesCreate.mockResolvedValueOnce(makeEndTurnResponse(partialJson));
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].slug).toBe('topic-b');
  });

  it('handles multiple text blocks in response content (concatenation)', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: '{"topics":[{"slug":"multi-block","headline":"Multi block",' },
        { type: 'text', text: '"context":"Continuation.","sourceUrls":["https://fox.com"]}]}' },
      ],
    });
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics[0].slug).toBe('multi-block');
  });

  it('loops to end_turn when initial stop_reason is tool_use', async () => {
    // First call: not end_turn — push assistant turn and retry
    mockMessagesCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'web_search', input: {} }],
      })
      .mockResolvedValueOnce(makeEndTurnResponse(VALID_TOPICS_JSON));

    const result = await runResearcher(BASE_INPUT);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    expect(result.topics).toHaveLength(3);
  });

  it('breaks early on unknown stop_reason after adding assistant turn', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: VALID_TOPICS_JSON }],
      });
    // max_tokens is neither end_turn/tool_use/pause_turn — should break and use that response
    const result = await runResearcher(BASE_INPUT);
    expect(result.topics).toHaveLength(3);
  });
});

// ── error branches ────────────────────────────────────────────────────────────

describe('runResearcher — error branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-test', source: 'client' });
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 99 }]));
  });

  it('throws when resolveClientApiKey rejects', async () => {
    mockResolveClientApiKey.mockRejectedValue(new Error('no api key configured'));
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow('no api key configured');
  });

  it('throws when model returns no text content', async () => {
    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'web_search', input: {} }],
    });
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow(
      '[researcher] model returned no text content in final turn',
    );
  });

  it('throws when model returns empty string text', async () => {
    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '   ' }],
    });
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow(
      '[researcher] model returned no text content in final turn',
    );
  });

  it('throws when model response is not valid JSON', async () => {
    mockMessagesCreate.mockResolvedValue(makeEndTurnResponse('not valid json at all'));
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow(
      '[researcher] failed to parse model JSON',
    );
  });

  it('throws when parsed JSON has no "topics" key', async () => {
    mockMessagesCreate.mockResolvedValue(
      makeEndTurnResponse(JSON.stringify({ result: [] })),
    );
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow(
      '[researcher] model JSON missing "topics" array',
    );
  });

  it('throws when "topics" is not an array', async () => {
    mockMessagesCreate.mockResolvedValue(
      makeEndTurnResponse(JSON.stringify({ topics: 'not-an-array' })),
    );
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow(
      '[researcher] model JSON missing "topics" array',
    );
  });

  it('throws when topics array is empty', async () => {
    mockMessagesCreate.mockResolvedValue(
      makeEndTurnResponse(JSON.stringify({ topics: [] })),
    );
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow(
      '[researcher] model returned 0 valid topics',
    );
  });

  it('throws when all topics fail coercion (no valid slug/headline)', async () => {
    const badTopics = JSON.stringify({
      topics: [
        { slug: '', headline: '', context: 'X', sourceUrls: [] },
        { slug: null, headline: null, context: 'Y', sourceUrls: [] },
      ],
    });
    mockMessagesCreate.mockResolvedValue(makeEndTurnResponse(badTopics));
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow(
      '[researcher] model returned 0 valid topics',
    );
  });

  it('throws when messages.create itself rejects', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('Anthropic API unavailable'));
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow('Anthropic API unavailable');
  });

  it('throws when db insert rejects', async () => {
    mockMessagesCreate.mockResolvedValue(makeEndTurnResponse(VALID_TOPICS_JSON));
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      }),
    });
    await expect(runResearcher(BASE_INPUT)).rejects.toThrow('DB connection lost');
  });

  it('correctly formats weekOf as YYYY-MM-DD UTC in the db insert', async () => {
    mockMessagesCreate.mockResolvedValue(makeEndTurnResponse(VALID_TOPICS_JSON));
    const capturedValues: Record<string, unknown>[] = [];
    mockDbInsert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        capturedValues.push(vals);
        return { returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
      }),
    }));

    await runResearcher({
      clientId: 1,
      websiteId: 2,
      weekOf: new Date('2025-12-29T00:00:00.000Z'),
    });

    expect(capturedValues[0].weekOf).toBe('2025-12-29');
  });
});
