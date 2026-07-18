import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { brainAgent } from '../agents/brain-agent';
import {
  classifyIntent,
  generatePlan,
  checkGroundedness,
  intentSchema,
  groundednessSchema,
} from '../agents/brain-stages';

/**
 * Deterministic orchestration of the Company Brain pipeline, ported faithfully
 * from the parent app's imperative route:
 *
 *   classify → plan (complex only) → tool-loop agent → groundedness check
 *
 * Agents are non-deterministic (the model chooses tools); a Workflow makes the
 * surrounding stages explicit and inspectable. The tool-loop itself is still an
 * Agent — invoked inside the `answer` step — so this example shows both primitives
 * cooperating.
 *
 * Note: `plan` runs every time but no-ops (empty plan) for simple queries. Mastra
 * also has true branching (`.branch()`) and parallelism (`.parallel()`) if you'd
 * rather split the graph; we keep it linear here for teaching clarity.
 */

const inputSchema = z.object({
  query: z.string().describe('The user question for the Company Brain'),
});

const classifiedSchema = z.object({
  query: z.string(),
  intent: intentSchema,
});

const plannedSchema = classifiedSchema.extend({
  plan: z.array(z.string()),
});

const answeredSchema = plannedSchema.extend({
  answer: z.string(),
  toolsCalled: z.array(z.string()),
});

const outputSchema = z.object({
  answer: z.string(),
  intent: intentSchema,
  plan: z.array(z.string()),
  groundedness: groundednessSchema,
});

// 1. Classify intent + complexity.
const classify = createStep({
  id: 'classify',
  inputSchema,
  outputSchema: classifiedSchema,
  execute: async ({ inputData }) => ({
    query: inputData.query,
    intent: await classifyIntent(inputData.query),
  }),
});

// 2. Plan — only for complex queries; simple ones get an empty plan.
const plan = createStep({
  id: 'plan',
  inputSchema: classifiedSchema,
  outputSchema: plannedSchema,
  execute: async ({ inputData }) => ({
    ...inputData,
    plan:
      inputData.intent.complexity === 'complex'
        ? await generatePlan(inputData.query)
        : [],
  }),
});

// 3. Answer — the tool-loop agent. It pulls SD MCP tools via its own dynamic
//    `tools` function, so we don't pass toolsets here.
const answer = createStep({
  id: 'answer',
  inputSchema: plannedSchema,
  outputSchema: answeredSchema,
  execute: async ({ inputData }) => {
    const planNote = inputData.plan.length
      ? `\n\nSuggested plan:\n- ${inputData.plan.join('\n- ')}`
      : '';
    const res = await brainAgent.generate(`${inputData.query}${planNote}`, {
      maxSteps: 8, // same tool-loop ceiling as the parent brain agent
    });
    return {
      ...inputData,
      answer: res.text,
      toolsCalled: res.toolCalls?.map((c) => c.payload.toolName) ?? [],
    };
  },
});

// 4. Ground — a second model grades the answer against the tools it used.
const ground = createStep({
  id: 'ground',
  inputSchema: answeredSchema,
  outputSchema,
  execute: async ({ inputData }) => ({
    answer: inputData.answer,
    intent: inputData.intent,
    plan: inputData.plan,
    groundedness: await checkGroundedness({
      query: inputData.query,
      answer: inputData.answer,
      toolsCalled: inputData.toolsCalled,
    }),
  }),
});

export const brainWorkflow = createWorkflow({
  id: 'brain-workflow',
  inputSchema,
  outputSchema,
})
  .then(classify)
  .then(plan)
  .then(answer)
  .then(ground)
  .commit();
