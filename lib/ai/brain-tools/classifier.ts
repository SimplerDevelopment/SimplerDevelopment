/**
 * Brain intent classifier — runs before the main tool loop to route and
 * size the incoming user message so the agent can choose the right strategy.
 *
 * Uses the provider-agnostic `completeObject` seam (task: 'brainClassify'),
 * so the classifier's model can be swapped to a cheaper provider via the
 * registry / `AI_MODEL__brainClassify` env without touching this file.
 */

import { z } from 'zod';
import { completeObject } from '@/lib/ai/llm';

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

const classificationSchema = z.object({
  intent: z.enum(['lookup', 'capture', 'planning', 'people', 'procedural', 'summary']),
  complexity: z.enum(['simple', 'complex']),
  reasoning: z.string(),
});

export async function classifyIntent(
  message: string,
  clientId: number,
): Promise<Classification> {
  try {
    const { object } = await completeObject({
      task: 'brainClassify',
      clientId,
      maxTokens: 256,
      schema: classificationSchema,
      system:
        'You classify user questions directed at a Company Brain knowledge assistant. Return the most accurate intent and whether the question requires multiple tool calls to answer fully.',
      prompt: message,
    });
    return {
      intent: object.intent,
      complexity: object.complexity,
      reasoning: object.reasoning,
    };
  } catch {
    return { intent: 'lookup', complexity: 'simple', reasoning: 'fallback' };
  }
}
