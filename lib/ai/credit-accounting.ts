import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { reserveCredits, settleCredits } from '@/lib/ai-credits';
import { recordAiUsage } from '@/lib/ai/audit';

export interface AiCreditContext {
  clientId: number;
  source: 'platform' | 'byok';
  category: string;
  /** Older meeting pipelines price input/output differently from chat. */
  price?: (input: number, output: number) => number;
}

export class AiCreditError extends Error {
  constructor(message: string, public readonly creditsRemaining?: number) {
    super(message);
    this.name = 'AiCreditError';
  }
}

export function isAiCreditError(error: unknown): error is AiCreditError {
  return error instanceof AiCreditError;
}

function definitelyRejected(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = Number(error.status);
  // Timeouts, connection errors and 5xx can happen AFTER inference started.
  return status >= 400 && status < 500 && status !== 408;
}

export async function beginAiCreditRequest(context: AiCreditContext, input: number, output: number) {
  const referenceId = `request:${randomUUID()}`;
  const price = context.price ?? ((i: number, o: number) => i + o);
  if (context.source === 'platform') {
    const result = await reserveCredits(context.clientId, price(input, output), context.category, referenceId);
    if (!result.success) throw new AiCreditError(result.error ?? 'Insufficient AI credits', result.newBalance);
  }
  return {
    async settle(inputTokens: number, outputTokens: number) {
      if (context.source !== 'platform') return;
      const result = await settleCredits(context.clientId, price(inputTokens, outputTokens), context.category, referenceId);
      if (!result.success) throw new AiCreditError(result.error ?? 'AI credit reconciliation failed', result.newBalance);
    },
    async rejected(error: unknown) {
      if (context.source === 'platform' && definitelyRejected(error)) {
        const result = await settleCredits(context.clientId, 0, context.category, referenceId, 'Provider rejected request');
        if (!result.success) throw new AiCreditError(result.error ?? 'AI credit release failed', result.newBalance);
      }
      // Uncertain consumption stays as a visible pending reservation, including
      // process death/disconnect. Never silently release potentially spent money.
    },
  };
}

/** Conservative byte bound for SDK providers without a token-count endpoint.
 * Includes structured schemas/tool definitions. Set explicit output caps.
 */
export async function creditTrackedCompletion<T extends { usage?: { inputTokens?: number; outputTokens?: number } }>(
  context: AiCreditContext, input: unknown, maxOutputTokens: number, execute: () => Promise<T>,
): Promise<T> {
  const hold = await beginAiCreditRequest(context, Buffer.byteLength(JSON.stringify(input), 'utf8') + 4096, maxOutputTokens);
  let result: T;
  try { result = await execute(); }
  catch (error) { await hold.rejected(error); throw error; }
  const inputTokens = result.usage?.inputTokens;
  const outputTokens = result.usage?.outputTokens;
  if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens)) {
    throw new AiCreditError('Provider usage unavailable; credit reservation pending reconciliation');
  }
  try { await hold.settle(inputTokens!, outputTokens!); }
  finally { void recordAiUsage({ clientId: context.clientId, source: context.source, tokens: inputTokens! + outputTokens! }); }
  return result;
}

type MessageParams = Anthropic.MessageCreateParamsNonStreaming;

export function anthropicInputTokens(usage: Anthropic.Usage): number {
  return usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
}

async function reserveAnthropicRequest(anthropic: Anthropic, params: MessageParams, context: AiCreditContext) {
  if (context.source === 'byok') return beginAiCreditRequest(context, 0, 0);
  const { input_tokens: input } = await anthropic.messages.countTokens({
    model: params.model, messages: params.messages, system: params.system,
    tools: params.tools, tool_choice: params.tool_choice,
  });
  // Provider token counts are estimates. Hold a margin and all possible output;
  // actual usage refunds the unused hold after every call (including tool turns).
  return beginAiCreditRequest(context, Math.ceil(input * 1.2) + 1024, params.max_tokens);
}

/** Per-call accounting also covers classifiers/grounders that use this SDK. */
export function creditTrackedAnthropic(anthropic: Anthropic, context: AiCreditContext): Anthropic {
  const messages = new Proxy(anthropic.messages, {
    get(target, key) {
      if (key !== 'create') {
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (params: MessageParams) => {
        const hold = await reserveAnthropicRequest(anthropic, params, context);
        let response: Anthropic.Message;
        try { response = await target.create(params); }
        catch (error) { await hold.rejected(error); throw error; }
        const usage = response.usage;
        if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) {
          throw new AiCreditError('Provider usage unavailable; credit reservation pending reconciliation');
        }
        const input = anthropicInputTokens(usage);
        try { await hold.settle(input, usage.output_tokens); }
        finally { void recordAiUsage({ clientId: context.clientId, source: context.source, tokens: input + usage.output_tokens }); }
        return response;
      };
    },
  });
  return new Proxy(anthropic, { get: (target, key) => key === 'messages' ? messages : Reflect.get(target, key) });
}

/** Streaming SDK creation is synchronous, so routes explicitly await the hold. */
export async function creditTrackedStream(anthropic: Anthropic, params: MessageParams, context: AiCreditContext) {
  const hold = await reserveAnthropicRequest(anthropic, params, context);
  const stream = anthropic.messages.stream(params);
  return new Proxy(stream, {
    get(target, key) {
      if (key !== Symbol.asyncIterator) {
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async function* () {
        let input = 0;
        let output = 0;
        let complete = false;
        try {
          for await (const event of target) {
            if (event.type === 'message_start') {
              const usage = event.message.usage;
              input = anthropicInputTokens(usage);
              output = usage.output_tokens;
            } else if (event.type === 'message_delta') {
              output = event.usage.output_tokens;
            } else if (event.type === 'message_stop') {
              complete = true;
            }
            yield event;
          }
        } catch (error) {
          await hold.rejected(error);
          throw error;
        } finally {
          if (complete) {
            try { await hold.settle(input, output); }
            finally { void recordAiUsage({ clientId: context.clientId, source: context.source, tokens: input + output }); }
          }
          else target.abort(); // retain pending hold until provider reconciliation
        }
      };
    },
  });
}
