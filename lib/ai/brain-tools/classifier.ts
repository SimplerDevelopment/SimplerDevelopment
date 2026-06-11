/**
 * Brain intent classifier — runs before the main tool loop to route and
 * size the incoming user message so the agent can choose the right strategy.
 */

import Anthropic from '@anthropic-ai/sdk';

export type BrainIntent =
  | 'lookup'      // find/retrieve existing knowledge
  | 'capture'     // create/record new info
  | 'planning'    // OKR, initiatives, goals questions
  | 'people'      // find experts, org chart, who-knows
  | 'procedural'  // playbook, process, runbook questions
  | 'summary';    // dashboard, overview, status questions

export interface Classification {
  intent: BrainIntent;
  complexity: 'simple' | 'complex'; // complex = multi-step, needs a plan
  reasoning: string;                  // one sentence why
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: 'classify',
  description: 'Classify the user intent and complexity of a Company Brain question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string',
        enum: ['lookup', 'capture', 'planning', 'people', 'procedural', 'summary'],
        description: 'The primary intent of the user message.',
      },
      complexity: {
        type: 'string',
        enum: ['simple', 'complex'],
        description:
          'simple = a single tool call can answer it; complex = multiple tool calls or reasoning steps are needed.',
      },
      reasoning: {
        type: 'string',
        description: 'One sentence explaining why this intent and complexity was chosen.',
      },
    },
    required: ['intent', 'complexity', 'reasoning'],
  },
};

export async function classifyIntent(
  message: string,
  anthropic: Anthropic,
): Promise<Classification> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:
        'You classify user questions directed at a Company Brain knowledge assistant. Return the most accurate intent and whether the question requires multiple tool calls to answer fully.',
      messages: [{ role: 'user', content: message }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify' },
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'classify') {
        const input = block.input as Record<string, unknown>;
        return {
          intent: input.intent as BrainIntent,
          complexity: input.complexity as 'simple' | 'complex',
          reasoning: String(input.reasoning ?? ''),
        };
      }
    }

    // Unexpected: tool_choice forced the model but no tool_use block found
    return { intent: 'lookup', complexity: 'simple', reasoning: 'fallback' };
  } catch {
    return { intent: 'lookup', complexity: 'simple', reasoning: 'fallback' };
  }
}
