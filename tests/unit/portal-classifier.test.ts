// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/classifier.ts.
 *
 * The function accepts an already-constructed Anthropic instance, so we do not
 * need to mock the SDK constructor — we pass in a fake object shaped like
 * `{ messages: { create: vi.fn() } }` directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Module under test (dynamic import — matches project conventions)
// ---------------------------------------------------------------------------

const { classifyPortalComplexity } = await import(
  '@/lib/ai/portal-tools/classifier'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal response shape for a successful tool_use block. */
function toolUseResponse(
  complexity: 'simple' | 'complex',
  reasoning: string,
  inputTokens = 50,
  outputTokens = 20,
) {
  return {
    content: [
      {
        type: 'tool_use',
        id: 'tu_001',
        name: 'classify',
        input: { complexity, reasoning },
      },
    ],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classifyPortalComplexity', () => {
  let messagesCreate: ReturnType<typeof vi.fn>;
  let anthropic: Anthropic;

  beforeEach(() => {
    messagesCreate = vi.fn();
    anthropic = { messages: { create: messagesCreate } } as unknown as Anthropic;
  });

  // -------------------------------------------------------------------------
  // (a) simple classification — tool_use block parsed + usage propagated
  // -------------------------------------------------------------------------

  it('returns complexity=simple from a tool_use block and propagates usage', async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse('simple', 'Single lookup', 40, 10),
    );

    const result = await classifyPortalComplexity('List my projects', anthropic);

    expect(result.complexity).toBe('simple');
    expect(result.reasoning).toBe('Single lookup');
    expect(result.inputTokens).toBe(40);
    expect(result.outputTokens).toBe(10);
  });

  // -------------------------------------------------------------------------
  // (b) complex classification — tool_use block parsed + usage propagated
  // -------------------------------------------------------------------------

  it('returns complexity=complex from a tool_use block and propagates usage', async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse('complex', 'Multi-step: create + send', 80, 30),
    );

    const result = await classifyPortalComplexity(
      'Create a project and email the client',
      anthropic,
    );

    expect(result.complexity).toBe('complex');
    expect(result.reasoning).toBe('Multi-step: create + send');
    expect(result.inputTokens).toBe(80);
    expect(result.outputTokens).toBe(30);
  });

  // -------------------------------------------------------------------------
  // (c) no tool_use block in content → defaults to complex, propagates usage
  // -------------------------------------------------------------------------

  it('defaults to complex with usage when no tool_use block is present', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I was unable to classify.' }],
      usage: { input_tokens: 15, output_tokens: 5 },
    });

    const result = await classifyPortalComplexity('What is the weather?', anthropic);

    expect(result.complexity).toBe('complex');
    expect(result.reasoning).toBe('fallback (no classification block)');
    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(5);
  });

  it('defaults to complex with usage when content array is empty', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 12, output_tokens: 3 },
    });

    const result = await classifyPortalComplexity('anything', anthropic);

    expect(result.complexity).toBe('complex');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(3);
  });

  // -------------------------------------------------------------------------
  // (d) messages.create throws → defaults to complex with 0/0 tokens
  // -------------------------------------------------------------------------

  it('returns complex with 0/0 tokens when messages.create throws', async () => {
    messagesCreate.mockRejectedValueOnce(new Error('rate limit exceeded'));

    const result = await classifyPortalComplexity('What is my balance?', anthropic);

    expect(result.complexity).toBe('complex');
    expect(result.reasoning).toBe('fallback (classifier error)');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('returns complex with 0/0 tokens when a non-Error value is thrown', async () => {
    messagesCreate.mockRejectedValueOnce('unexpected string error');

    const result = await classifyPortalComplexity('Do something', anthropic);

    expect(result.complexity).toBe('complex');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Misc: tool_use block with unknown name is skipped; classify name required
  // -------------------------------------------------------------------------

  it('skips tool_use blocks with a name other than "classify" and falls back', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu_002',
          name: 'some_other_tool',
          input: { complexity: 'simple', reasoning: 'irrelevant' },
        },
      ],
      usage: { input_tokens: 20, output_tokens: 8 },
    });

    const result = await classifyPortalComplexity('some request', anthropic);

    expect(result.complexity).toBe('complex');
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(8);
  });

  // -------------------------------------------------------------------------
  // Verify the call is made with the expected model / tool_choice
  // -------------------------------------------------------------------------

  it('calls anthropic.messages.create with the forced classify tool_choice', async () => {
    messagesCreate.mockResolvedValueOnce(
      toolUseResponse('simple', 'ok', 1, 1),
    );

    await classifyPortalComplexity('hello', anthropic);

    expect(messagesCreate).toHaveBeenCalledOnce();
    const callArg = messagesCreate.mock.calls[0][0] as {
      model: string;
      tool_choice: { type: string; name: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(callArg.model).toMatch(/haiku/);
    expect(callArg.tool_choice).toEqual({ type: 'tool', name: 'classify' });
    expect(callArg.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });
});
