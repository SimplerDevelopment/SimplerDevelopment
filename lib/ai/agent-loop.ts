/**
 * Agentic multi-turn tool-loop seam (non-streaming). Wraps the AI SDK's
 * multi-step `generateText` so a hand-rolled "while (loop) { messages.create;
 * run tools; feed results back }" becomes one call — provider-agnostic via the
 * registry, with usage aggregated across steps.
 *
 * Streaming agentic loops (brain agent, chat) are deliberately NOT covered here
 * yet — they need a `streamAgentLoop` that maps the AI SDK fullStream to each
 * route's bespoke SSE frame protocol; see the carve-out note in `models.ts`.
 */

import {
  generateText,
  tool,
  jsonSchema,
  stepCountIs,
  type ToolSet,
  type ModelMessage,
} from 'ai';
import { getModelForTask, type AiTask } from './models';

/** Minimal shape of an Anthropic-style tool definition (name + JSON input schema). */
export interface AnthropicStyleTool {
  name: string;
  description?: string;
  input_schema: unknown;
}

/**
 * Adapt an Anthropic-format tool array + an executor into an AI SDK `ToolSet`.
 * Reuses each tool's existing JSON `input_schema` verbatim via `jsonSchema()`,
 * so no per-tool Zod rewrite is needed. `execute` receives `(name, input)` and
 * returns the tool result (string or JSON-serializable).
 */
export function anthropicToolsToToolSet(
  tools: AnthropicStyleTool[],
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown> | unknown,
): ToolSet {
  const set: ToolSet = {};
  for (const t of tools) {
    set[t.name] = tool({
      description: t.description ?? '',
      // The Anthropic `input_schema` is already a JSON Schema — use it directly.
      inputSchema: jsonSchema(t.input_schema as Parameters<typeof jsonSchema>[0]),
      execute: async (input: unknown) =>
        execute(t.name, (input ?? {}) as Record<string, unknown>),
    });
  }
  return set;
}

export interface AgentLoopOpts {
  task: AiTask;
  clientId: number;
  system?: string;
  messages: ModelMessage[];
  tools: ToolSet;
  /** Max agent steps (model turn + tool round = up to this many). Default 8. */
  maxSteps?: number;
  maxTokens?: number;
}

/**
 * Run a provider-agnostic agentic tool loop to completion and return the final
 * text + aggregated usage + per-step trace. The AI SDK executes the tools (via
 * the ToolSet's `execute`) and feeds results back automatically until the model
 * stops or `maxSteps` is hit.
 */
export async function completeAgentLoop(opts: AgentLoopOpts) {
  const { model } = await getModelForTask(opts.task, opts.clientId);
  return generateText({
    model,
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxSteps ?? 8),
    maxOutputTokens: opts.maxTokens,
  });
}
