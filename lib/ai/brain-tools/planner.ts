/**
 * Brain agent planner — called only for complexity === 'complex' queries.
 * Produces a concrete ordered step plan before the main tool loop executes.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { BrainIntent } from './classifier';

export interface PlanStep {
  action: string;    // human-readable description e.g. "Search for labor cost records"
  tool: string;      // expected tool name e.g. "brain_search"
  reasoning: string; // why this step is needed
}

export interface AgentPlan {
  steps: PlanStep[];
  estimatedTools: string[]; // deduplicated list of tool names
}

const PLAN_TOOL: Anthropic.Tool = {
  name: 'plan',
  description: 'Produce a step-by-step plan for answering a complex Company Brain question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      steps: {
        type: 'array',
        description: 'Ordered list of steps (2-5 maximum).',
        items: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Human-readable description of this step.',
            },
            tool: {
              type: 'string',
              description: 'The brain tool name to call for this step.',
            },
            reasoning: {
              type: 'string',
              description: 'Why this step is necessary.',
            },
          },
          required: ['action', 'tool', 'reasoning'],
        },
      },
      estimatedTools: {
        type: 'array',
        description: 'Deduplicated list of tool names that will be used across all steps.',
        items: { type: 'string' },
      },
    },
    required: ['steps', 'estimatedTools'],
  },
};

export async function generatePlan(
  message: string,
  intent: BrainIntent,
  anthropic: Anthropic,
): Promise<AgentPlan> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:
        'You are a planning step for a Company Brain AI agent. Given a user question, produce a concrete step-by-step plan using only these available tools: brain_search, brain_dashboard_summary, brain_get_note, brain_create_note, brain_list_decisions, brain_get_decision, brain_list_people, brain_lookup_glossary, brain_list_glossary, brain_list_initiatives, brain_list_tasks, brain_create_task. Return 2-5 steps maximum.',
      messages: [
        {
          role: 'user',
          content: `Intent: ${intent}\n\nQuestion: ${message}`,
        },
      ],
      tools: [PLAN_TOOL],
      tool_choice: { type: 'tool', name: 'plan' },
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'plan') {
        const input = block.input as Record<string, unknown>;
        const rawSteps = Array.isArray(input.steps) ? input.steps : [];
        const steps: PlanStep[] = rawSteps.map((s) => {
          const step = s as Record<string, unknown>;
          return {
            action: String(step.action ?? ''),
            tool: String(step.tool ?? ''),
            reasoning: String(step.reasoning ?? ''),
          };
        });
        const estimatedTools = Array.isArray(input.estimatedTools)
          ? (input.estimatedTools as unknown[]).map(String)
          : [];
        return { steps, estimatedTools };
      }
    }

    return { steps: [], estimatedTools: [] };
  } catch {
    return { steps: [], estimatedTools: [] };
  }
}
