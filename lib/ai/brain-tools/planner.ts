/**
 * Brain agent planner — called only for complexity === 'complex' queries.
 * Produces a concrete ordered step plan before the main tool loop executes.
 *
 * Uses the provider-agnostic `completeObject` seam (task: 'brainPlan'),
 * so the planner's model can be swapped to a cheaper provider via the
 * registry / `AI_MODEL__brainPlan` env without touching this file.
 */

import { z } from 'zod';
import { completeObject } from '@/lib/ai/llm';
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

const planStepSchema = z.object({
  action: z.string(),
  tool: z.string(),
  reasoning: z.string(),
});

const agentPlanSchema = z.object({
  steps: z.array(planStepSchema).max(5),
  estimatedTools: z.array(z.string()),
});

export async function generatePlan(
  message: string,
  intent: BrainIntent,
  clientId: number,
): Promise<AgentPlan> {
  try {
    const { object } = await completeObject({
      task: 'brainPlan',
      clientId,
      maxTokens: 512,
      schema: agentPlanSchema,
      system:
        'You are a planning step for a Company Brain AI agent. Given a user question, produce a concrete step-by-step plan using only these available tools: brain_search, brain_dashboard_summary, brain_get_note, brain_create_note, brain_list_decisions, brain_get_decision, brain_list_people, brain_lookup_glossary, brain_list_glossary, brain_list_initiatives, brain_list_tasks, brain_create_task. Return 2-5 steps maximum.',
      prompt: `Intent: ${intent}\n\nQuestion: ${message}`,
    });

    return {
      steps: object.steps.map((s) => ({
        action: s.action,
        tool: s.tool,
        reasoning: s.reasoning,
      })),
      estimatedTools: object.estimatedTools,
    };
  } catch {
    return { steps: [], estimatedTools: [] };
  }
}
