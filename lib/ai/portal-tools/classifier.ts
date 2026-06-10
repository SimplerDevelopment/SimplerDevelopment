/**
 * Portal complexity classifier — a cheap Haiku call that runs before the main
 * tool loop to route the request to the right model (cost control).
 *
 * simple  → handled by Haiku (fast, cheap)
 * complex → handled by Sonnet (multi-tool / write / multi-step reasoning)
 *
 * On any failure we default to `complex` so a classifier hiccup degrades cost,
 * never capability.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface PortalClassification {
  complexity: 'simple' | 'complex';
  reasoning: string;
  // Usage is surfaced so the caller can fold it into credit accounting — the
  // classifier call is real spend on platform keys.
  inputTokens: number;
  outputTokens: number;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: 'classify',
  description:
    'Classify the complexity of a client-portal request so it can be routed to the right model.',
  input_schema: {
    type: 'object' as const,
    properties: {
      complexity: {
        type: 'string',
        enum: ['simple', 'complex'],
        description:
          'simple = a single read/lookup or a one-line answer a single tool call can satisfy; complex = multiple tool calls, a data-modifying (create/update/move/send) action that needs confirmation, or multi-step reasoning.',
      },
      reasoning: {
        type: 'string',
        description: 'One sentence explaining the choice.',
      },
    },
    required: ['complexity', 'reasoning'],
  },
};

export async function classifyPortalComplexity(
  message: string,
  anthropic: Anthropic,
): Promise<PortalClassification> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      system:
        'You classify requests sent to a client-portal AI assistant that manages projects, invoices, tickets, websites, CRM, email campaigns, booking pages, pitch decks, surveys, and automations. Decide whether the request is simple (a single lookup or one-line answer) or complex (multiple tool calls, a data-modifying action, or multi-step reasoning).',
      messages: [{ role: 'user', content: message }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify' },
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'classify') {
        const input = block.input as Record<string, unknown>;
        return {
          complexity: input.complexity === 'simple' ? 'simple' : 'complex',
          reasoning: String(input.reasoning ?? ''),
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      }
    }

    // tool_choice forced the tool but no block came back — bill what we spent,
    // route conservatively to the capable model.
    return {
      complexity: 'complex',
      reasoning: 'fallback (no classification block)',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch {
    return { complexity: 'complex', reasoning: 'fallback (classifier error)', inputTokens: 0, outputTokens: 0 };
  }
}
