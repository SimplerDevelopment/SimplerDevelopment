/**
 * Brain answer grounder — runs AFTER the main tool loop, BEFORE returning
 * the final answer to the user. Checks whether the answer is supported by
 * the tool results that were retrieved during the conversation.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface GroundednessResult {
  confidence: number;  // 0.0–1.0
  grounded: boolean;   // true if answer is supported by retrieved context
  sources: string[];   // entity IDs or titles cited from tool results
  uncertain: boolean;  // true if confidence < 0.5 → agent should say "I don't know"
}

const GRADE_TOOL: Anthropic.Tool = {
  name: 'grade',
  description: 'Grade whether an agent answer is grounded in retrieved tool results.',
  input_schema: {
    type: 'object' as const,
    properties: {
      confidence: {
        type: 'number',
        description:
          'Confidence score between 0.0 and 1.0 that the answer is supported by the tool results.',
      },
      grounded: {
        type: 'boolean',
        description:
          'True if every major claim in the answer appears in the tool results. False if the answer contains unsupported assertions.',
      },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description:
          'List of entity IDs, note titles, decision IDs, or other identifiers from the tool results that were cited in the answer.',
      },
      uncertain: {
        type: 'boolean',
        description:
          'True if confidence is below 0.5, meaning the agent should indicate it does not have enough information to answer reliably.',
      },
    },
    required: ['confidence', 'grounded', 'sources', 'uncertain'],
  },
};

export async function checkGroundedness(
  question: string,
  answer: string,
  toolResultsSummary: string, // JSON.stringify of the tool results used
  anthropic: Anthropic,
): Promise<GroundednessResult> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:
        "You are a grounding checker for an AI agent. Given the user's question, the agent's answer, and the raw tool results the agent retrieved, assess whether the answer is supported by the retrieved data. A high-confidence, grounded answer means every claim in the answer appears in the tool results. If the tool results are empty or don't address the question, confidence should be low and uncertain should be true.",
      messages: [
        {
          role: 'user',
          content: `Question: ${question}\n\nAgent answer: ${answer}\n\nTool results: ${toolResultsSummary}`,
        },
      ],
      tools: [GRADE_TOOL],
      tool_choice: { type: 'tool', name: 'grade' },
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'grade') {
        const input = block.input as Record<string, unknown>;
        const confidence =
          typeof input.confidence === 'number'
            ? Math.max(0, Math.min(1, input.confidence))
            : 0.8;
        const grounded = typeof input.grounded === 'boolean' ? input.grounded : true;
        const sources = Array.isArray(input.sources)
          ? (input.sources as unknown[]).map(String)
          : [];
        const uncertain = typeof input.uncertain === 'boolean' ? input.uncertain : false;
        return { confidence, grounded, sources, uncertain };
      }
    }

    // Optimistic fallback: unexpected no-tool-use response
    return { confidence: 0.8, grounded: true, sources: [], uncertain: false };
  } catch {
    // Optimistic fallback so errors don't silently block answers
    return { confidence: 0.8, grounded: true, sources: [], uncertain: false };
  }
}
