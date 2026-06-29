/**
 * The provider-agnostic LLM seam. Call sites use `complete` / `completeObject`
 * / `streamComplete` with a `task` tag; the model is resolved from the registry
 * (`lib/ai/models.ts`) so swapping a provider/model for any aspect is config,
 * not a code change. Tool-calling + streaming are normalized by the Vercel AI
 * SDK across Anthropic / Hugging Face / OpenAI.
 */

import {
  generateText,
  generateObject,
  streamText,
  type ModelMessage,
  type ToolSet,
  type ToolChoice,
} from 'ai';
import type { z } from 'zod';
import { getModelForTask, type AiTask } from './models';

export interface BaseLlmOpts {
  /** Which aspect of AI use this is — selects the model via the registry. */
  task: AiTask;
  /** Tenant — drives BYOK key resolution. */
  clientId: number;
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * The AI SDK types the prompt as `prompt` XOR `messages` (a union), so we must
 * include exactly one key — never both, even set to undefined.
 */
function promptPart(opts: BaseLlmOpts): { messages: ModelMessage[] } | { prompt: string } {
  return opts.messages !== undefined
    ? { messages: opts.messages }
    : { prompt: opts.prompt ?? '' };
}

/** One-shot text (optionally with tools). Mirrors Anthropic `messages.create`. */
export async function complete(
  opts: BaseLlmOpts & { tools?: ToolSet; toolChoice?: ToolChoice<ToolSet> },
) {
  const { model } = await getModelForTask(opts.task, opts.clientId);
  return generateText({
    model,
    system: opts.system,
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
    ...promptPart(opts),
  });
}

/** Forced structured output — replaces the `tool_choice`-to-get-JSON pattern. */
export async function completeObject<T>(
  opts: BaseLlmOpts & { schema: z.ZodType<T> },
): Promise<{ object: T; usage: Awaited<ReturnType<typeof generateObject>>['usage'] }> {
  const { model } = await getModelForTask(opts.task, opts.clientId);
  const result = await generateObject({
    model,
    schema: opts.schema,
    system: opts.system,
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
    ...promptPart(opts),
  });
  return { object: result.object as T, usage: result.usage };
}

/** Streaming text (optionally agentic with tools + multi-step). */
export async function streamComplete(
  opts: BaseLlmOpts & { tools?: ToolSet; toolChoice?: ToolChoice<ToolSet> },
) {
  const { model } = await getModelForTask(opts.task, opts.clientId);
  return streamText({
    model,
    system: opts.system,
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
    ...promptPart(opts),
  });
}
