// @vitest-environment node
/**
 * Unit tests for lib/magamommy/agents/concept-writer.ts
 *
 * Exports under test:
 *   - runConceptWriter (orchestrator — mocks db, resolveClientApiKey, Anthropic SDK)
 *
 * parseAndValidate is private but exercised indirectly through runConceptWriter by
 * varying the canned AI response text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── drizzle-orm stub ──────────────────────────────────────────────────────────
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual };
});

// ── schema stub ───────────────────────────────────────────────────────────────
vi.mock('@/lib/db/schema/magamommy', () => ({
  magamommyBriefs: {
    id: { __col: 'id' },
    topics: { __col: 'topics' },
  },
  magamommyConcepts: {
    id: { __col: 'id' },
  },
}));

// ── db mock ───────────────────────────────────────────────────────────────────
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

// ── AI seam mock (@/lib/ai/llm) ───────────────────────────────────────────────
// mockComplete is mutated per-test via mockResolvedValue / mockRejectedValue.
// We do NOT use vi.resetAllMocks() — vi.clearAllMocks() only clears call
// history, leaving the implementations intact, which is what we want.
const mockComplete = vi.fn();

vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => mockComplete(...args),
  completeObject: vi.fn(),
  streamComplete: vi.fn(),
}));

// ── module under test (after all vi.mock calls) ───────────────────────────────
const { runConceptWriter } = await import('@/lib/magamommy/agents/concept-writer');

// ── shared fixtures ───────────────────────────────────────────────────────────
const BASE_INPUT = { websiteId: 1, clientId: 2, briefId: 10 };

const VALID_TOPIC = {
  slug: 'supply-chain-shake',
  title: 'Supply Chain Shake-Up',
  summary: 'Grocery shelves emptying amid tariff changes.',
  relevance: 'Hits kitchen-table conservative moms directly.',
};

const VALID_CONCEPT_RESPONSE = {
  concepts: [
    {
      slogan: 'Made in America Always',
      tagline: 'Support home-grown goods',
      visualPrompt: 'Factory silhouette with waving flag behind it',
      palette: [
        { name: 'Red', hex: '#B22234' },
        { name: 'White', hex: '#FFFFFF' },
        { name: 'Blue', hex: '#3C3B6E' },
      ],
      placement: 'front',
      style: 'bold',
    },
    {
      slogan: 'Tariff Proof Mom',
      tagline: 'She stocks up smart',
      visualPrompt: 'Shopping cart overflowing with canned goods',
      palette: [
        { name: 'Navy', hex: '#001F5B' },
        { name: 'Gold', hex: '#F0C040' },
        { name: 'Cream', hex: '#FFFDD0' },
      ],
      placement: 'front',
      style: 'satire',
    },
    {
      slogan: 'Faith Family Freedom',
      tagline: 'Our values never import',
      visualPrompt: 'Eagle perched on a fence post at sunrise',
      palette: [
        { name: 'Crimson', hex: '#DC143C' },
        { name: 'Ivory', hex: '#FFFFF0' },
        { name: 'Steel', hex: '#708090' },
      ],
      placement: 'back',
      style: 'classic',
    },
  ],
  winnerIndex: 0,
  winnerReason: 'Boldest and most immediately wearable.',
  rejectionReasons: [
    'Too wordy for satire; caption needs context.',
    'Back-of-shirt limits impulse appeal.',
  ],
};

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
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

function makeCompleteResponse(text: string) {
  return {
    text,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // mockComplete needs a default resolved value; per-test overrides as needed.
});

// ── runConceptWriter — happy path ─────────────────────────────────────────────

describe('runConceptWriter — happy path', () => {
  it('returns conceptId and concept on success', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(VALID_CONCEPT_RESPONSE)),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 99 }]));

    const result = await runConceptWriter(BASE_INPUT);

    expect(result.conceptId).toBe(99);
    expect(result.concept.slogan).toBe('Made in America Always');
    expect(result.concept.topicSlug).toBe(VALID_TOPIC.slug);
  });

  it('picks the winner at the correct winnerIndex', async () => {
    const responseWinner1 = {
      ...VALID_CONCEPT_RESPONSE,
      winnerIndex: 1,
      rejectionReasons: ['Lost to satire.', 'Classic too subtle.'],
    };
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(responseWinner1)),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 77 }]));

    const result = await runConceptWriter(BASE_INPUT);
    expect(result.concept.slogan).toBe('Tariff Proof Mom');
    expect(result.concept.style).toBe('satire');
  });

  it('pairs rejection reasons with the correct losers (winner=0)', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(VALID_CONCEPT_RESPONSE)),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 99 }]));

    const result = await runConceptWriter(BASE_INPUT);
    expect(result.concept.alternatives).toHaveLength(2);
    expect(result.concept.alternatives[0].slogan).toBe('Tariff Proof Mom');
    expect(result.concept.alternatives[0].rejectionReason).toBe(
      'Too wordy for satire; caption needs context.',
    );
    expect(result.concept.alternatives[1].slogan).toBe('Faith Family Freedom');
    expect(result.concept.alternatives[1].rejectionReason).toBe(
      'Back-of-shirt limits impulse appeal.',
    );
  });

  it('calls complete() with the task tag, maxTokens, system prompt, and user prompt', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(VALID_CONCEPT_RESPONSE)),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 1 }]));

    await runConceptWriter(BASE_INPUT);

    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'magamommyConcept',
        maxTokens: 2048,
      }),
    );
    const call = mockComplete.mock.calls[0][0] as {
      task: string; clientId: number; system: string; prompt: string; maxTokens: number;
    };
    expect(call.system).toContain('Magamommy');
    expect(call.prompt).toContain(VALID_TOPIC.slug);
  });

  it('passes the correct clientId to complete()', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(VALID_CONCEPT_RESPONSE)),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 1 }]));

    await runConceptWriter({ ...BASE_INPUT, clientId: 42 });

    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 42 }),
    );
  });

  it('passes the top topic (index 0) to the user prompt even when multiple topics exist', async () => {
    const topics = [
      { ...VALID_TOPIC, slug: 'top-topic' },
      { ...VALID_TOPIC, slug: 'second-topic' },
    ];
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(VALID_CONCEPT_RESPONSE)),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 1 }]));

    const result = await runConceptWriter(BASE_INPUT);
    const call = mockComplete.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('top-topic');
    expect(result.concept.topicSlug).toBe('top-topic');
  });

  it('handles model response wrapped in ```json fences', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(
        '```json\n' + JSON.stringify(VALID_CONCEPT_RESPONSE) + '\n```',
      ),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 1 }]));

    const result = await runConceptWriter(BASE_INPUT);
    expect(result.conceptId).toBe(1);
  });

  it('handles model response with stray prose before/after the JSON object', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    const raw = 'Here are your concepts:\n' + JSON.stringify(VALID_CONCEPT_RESPONSE) + '\nHope that helps!';
    mockComplete.mockResolvedValue(makeCompleteResponse(raw));
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 1 }]));

    const result = await runConceptWriter(BASE_INPUT);
    expect(result.conceptId).toBe(1);
  });

  it('handles seam response that returns text directly (no multi-part content)', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    // The seam always returns a flat { text, usage } — no content array
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(VALID_CONCEPT_RESPONSE)),
    );
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 1 }]));

    const result = await runConceptWriter(BASE_INPUT);
    expect(result.conceptId).toBe(1);
  });
});

// ── runConceptWriter — brief loading failures ─────────────────────────────────

describe('runConceptWriter — brief loading failures', () => {
  it('throws when brief is not found', async () => {
    mockDbSelect.mockReturnValue(makeSelectChain([]));

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      'runConceptWriter: brief not found (briefId=10)',
    );
  });

  it('throws when brief has no topics', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [] }]),
    );

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      /brief has no topics/,
    );
  });

  it('treats null topics as empty array and throws', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: null }]),
    );

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      /brief has no topics/,
    );
  });
});


// ── runConceptWriter — SDK / key failures ─────────────────────────────────────

describe('runConceptWriter — AI seam failures', () => {
  it('throws when complete() rejects', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockRejectedValue(new Error('rate limit'));

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow('rate limit');
  });

  it('throws when model returns no text (empty string)', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue({ text: '', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      'runConceptWriter: model returned no text content',
    );
  });

  it('throws when model text is whitespace only (no JSON braces found)', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue({ text: '   ', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });

    // Whitespace-only text is truthy so it bypasses the empty-check; parseAndValidate
    // then fails because no '{...}' braces can be found in the trimmed string.
    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      'runConceptWriter: model output did not contain a JSON object',
    );
  });
});

// ── runConceptWriter — parseAndValidate failures ──────────────────────────────

describe('runConceptWriter — parseAndValidate: structural validation failures', () => {
  async function expectParseError(badResponse: unknown, pattern: RegExp | string) {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(badResponse)),
    );

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(pattern);
  }

  it('throws when model output has no JSON object braces', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse('Sorry, I cannot generate that content.'),
    );

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      'runConceptWriter: model output did not contain a JSON object',
    );
  });

  it('throws when model output is invalid JSON', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse('{bad json: [}'),
    );

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      'runConceptWriter: failed to parse model JSON',
    );
  });

  it('throws when concepts array has fewer than 3 entries', async () => {
    await expectParseError(
      {
        concepts: [VALID_CONCEPT_RESPONSE.concepts[0]],
        winnerIndex: 0,
        winnerReason: 'ok',
        rejectionReasons: ['x', 'y'],
      },
      'runConceptWriter: expected exactly 3 concepts',
    );
  });

  it('throws when concepts array has more than 3 entries', async () => {
    await expectParseError(
      {
        ...VALID_CONCEPT_RESPONSE,
        concepts: [
          ...VALID_CONCEPT_RESPONSE.concepts,
          VALID_CONCEPT_RESPONSE.concepts[0],
        ],
      },
      'runConceptWriter: expected exactly 3 concepts',
    );
  });

  it('throws when winnerIndex is out of range', async () => {
    await expectParseError(
      { ...VALID_CONCEPT_RESPONSE, winnerIndex: 3 },
      'runConceptWriter: winnerIndex must be 0, 1, or 2',
    );
  });

  it('throws when winnerIndex is a float', async () => {
    await expectParseError(
      { ...VALID_CONCEPT_RESPONSE, winnerIndex: 0.5 },
      'runConceptWriter: winnerIndex must be 0, 1, or 2',
    );
  });

  it('throws when winnerReason is missing', async () => {
    const bad = { ...VALID_CONCEPT_RESPONSE };
    // @ts-expect-error — intentionally removing required field for test
    delete bad.winnerReason;
    await expectParseError(bad, 'runConceptWriter: winnerReason must be a string');
  });

  it('throws when rejectionReasons has wrong count', async () => {
    await expectParseError(
      { ...VALID_CONCEPT_RESPONSE, rejectionReasons: ['only one'] },
      'runConceptWriter: rejectionReasons must be 2 strings',
    );
  });

  it('throws when rejectionReasons contains a non-string entry', async () => {
    await expectParseError(
      { ...VALID_CONCEPT_RESPONSE, rejectionReasons: ['ok', 42] },
      'runConceptWriter: rejectionReasons must be 2 strings',
    );
  });

  it('throws when a concept has an empty slogan', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    bad.concepts[0].slogan = '';
    await expectParseError(bad, 'runConceptWriter: concept[0].slogan invalid');
  });

  it('throws when a slogan exceeds 6 words', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    bad.concepts[1].slogan = 'One Two Three Four Five Six Seven';
    await expectParseError(bad, /concept\[1\].slogan exceeds 6 words/);
  });

  it('throws when a concept has an empty tagline', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    bad.concepts[2].tagline = '';
    await expectParseError(bad, 'runConceptWriter: concept[2].tagline invalid');
  });

  it('throws when a concept has an empty visualPrompt', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    bad.concepts[0].visualPrompt = '   ';
    await expectParseError(bad, 'runConceptWriter: concept[0].visualPrompt invalid');
  });

  it('throws when palette has fewer than 3 entries', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    bad.concepts[0].palette = [{ name: 'Red', hex: '#FF0000' }] as typeof bad.concepts[0]['palette'];
    await expectParseError(bad, 'runConceptWriter: concept[0].palette must have 3-5 entries');
  });

  it('throws when palette has more than 5 entries', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    bad.concepts[0].palette = Array(6).fill({ name: 'R', hex: '#FF0000' });
    await expectParseError(bad, 'runConceptWriter: concept[0].palette must have 3-5 entries');
  });

  it('throws when a palette entry has an invalid hex (5 chars)', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    bad.concepts[0].palette[0] = { name: 'Bad', hex: '#FF00' };
    await expectParseError(bad, /concept\[0\].palette\[0\].hex must be #RRGGBB/);
  });

  it('throws when placement is an invalid value', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    // @ts-expect-error — intentionally invalid placement
    bad.concepts[0].placement = 'sleeve';
    await expectParseError(bad, 'runConceptWriter: concept[0].placement must be front|back');
  });

  it('throws when style is an invalid value', async () => {
    const bad = structuredClone(VALID_CONCEPT_RESPONSE);
    // @ts-expect-error — intentionally invalid style
    bad.concepts[0].style = 'edgy';
    await expectParseError(bad, 'runConceptWriter: concept[0].style must be bold|satire|classic');
  });
});

// ── runConceptWriter — DB insert failure ──────────────────────────────────────

describe('runConceptWriter — DB insert failure', () => {
  it('throws when insert returns no row', async () => {
    mockDbSelect.mockReturnValue(
      makeSelectChain([{ id: 10, topics: [VALID_TOPIC] }]),
    );
    mockComplete.mockResolvedValue(
      makeCompleteResponse(JSON.stringify(VALID_CONCEPT_RESPONSE)),
    );
    // Insert returns empty array → no id
    mockDbInsert.mockReturnValue(makeInsertChain([]));

    await expect(runConceptWriter(BASE_INPUT)).rejects.toThrow(
      'runConceptWriter: insert returned no id',
    );
  });
});
