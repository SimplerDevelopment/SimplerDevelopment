/**
 * Task → model registry: the single place that decides WHICH model serves WHICH
 * aspect of the platform's AI. Everything defaults to Claude (preserving today's
 * exact model IDs); flip any one aspect to a cheaper/different provider with a
 * one-line edit here or an env override — no call-site change needed.
 *
 * Per-aspect env override:  AI_MODEL__<task>="<provider>:<modelId>"
 *   e.g.  AI_MODEL__brainClassify="huggingface:meta-llama/Llama-3.3-70B-Instruct"
 *         AI_MODEL__nlpParse="openai:gpt-4o-mini"
 *
 * Providers resolve through `resolveClientApiKey` so BYOK + platform-key fallback
 * + the Scale-tier BYOK gate all keep working unchanged.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { resolveClientApiKey, type AiProvider } from './resolve-client-key';

export type LlmProvider = 'anthropic' | 'huggingface' | 'openai';

/** Every distinct "aspect" of AI use in the codebase. Add one per call site. */
export type AiTask =
  | 'chat'                 // portal chat assistant
  | 'brainAgentSimple'     // brain agent, simple intent (was Haiku)
  | 'brainAgentComplex'    // brain agent, complex intent (was Sonnet)
  | 'brainClassify'        // intent classifier
  | 'brainPlan'            // plan generator
  | 'classifyCrm'
  | 'classifyNotes'
  | 'analyzeAttachment'
  | 'meetingProcess'
  | 'nlpParse'             // automation rule NLP parser
  | 'surveySummary'
  | 'brandingTheme'
  | 'brandingMessaging'
  | 'brandingRewrite'
  | 'brandingBlockCopy'
  | 'siteBrandingGen'
  | 'blockRestyle'
  | 'deckGen'
  | 'slideGen'
  | 'slideBatchEdit'
  | 'inboundEmail'
  | 'extensionExtract';

export interface ModelChoice {
  provider: LlmProvider;
  model: string;
}

/**
 * CARVE-OUTS (still on raw @anthropic-ai/sdk — NOT routed through this seam):
 *
 * STREAMING tool loops — need a `streamAgentLoop` (streamText + tools mapped to
 * each route's bespoke SSE frame protocol). Deliberately deferred to be built
 * ONCE, aligned with the `feat/ai-stream-tool-calling` branch, so the codebase
 * gets a single streaming-tool-loop pattern rather than two divergent ones:
 *   - app/api/portal/brain/agent/route.ts    — streaming SSE tool loop
 *   - app/api/portal/ai/chat/route.ts         — streaming SSE tool loop
 *   - app/api/portal/ai/chat/stream/route.ts  — streaming (the active branch's file)
 *
 * DONE: the non-streaming agentic loop (app/api/email/inbound/route.ts) now uses
 * `completeAgentLoop` (lib/ai/agent-loop.ts) — extend that with a streaming
 * variant when the streaming routes migrate.
 */

/**
 * DEFAULTS — all Claude, matching the model each call site uses today so the
 * migration is behavior-preserving. Edit a line (or set AI_MODEL__<task>) to
 * move that one aspect to a cheaper model.
 */
export const MODELS: Record<AiTask, ModelChoice> = {
  chat:              { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  brainAgentSimple:  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  brainAgentComplex: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  brainClassify:     { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  brainPlan:         { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  classifyCrm:       { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  classifyNotes:     { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  analyzeAttachment: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  meetingProcess:    { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  nlpParse:          { provider: 'anthropic', model: 'claude-sonnet-4-6-20250514' },
  surveySummary:     { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  brandingTheme:     { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  brandingMessaging: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  brandingRewrite:   { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  brandingBlockCopy: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  siteBrandingGen:   { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  blockRestyle:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  deckGen:           { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  slideGen:          { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  slideBatchEdit:    { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  inboundEmail:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  extensionExtract:  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
};

const HF_BASE_URL = process.env.HUGGINGFACE_BASE_URL ?? 'https://router.huggingface.co/v1';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

/** Resolve a task to its model choice, applying the `AI_MODEL__<task>` env override. */
export function resolveChoice(task: AiTask): ModelChoice {
  const override = process.env[`AI_MODEL__${task}`];
  if (override && override.includes(':')) {
    const idx = override.indexOf(':');
    const provider = override.slice(0, idx) as LlmProvider;
    const model = override.slice(idx + 1);
    if (provider && model) return { provider, model };
  }
  return MODELS[task];
}

/**
 * Build a provider-agnostic AI-SDK `LanguageModel` for a task + tenant. Resolves
 * the right API key (BYOK → platform) for the chosen provider.
 */
export async function getModelForTask(
  task: AiTask,
  clientId: number,
): Promise<{ model: LanguageModel; choice: ModelChoice; keySource: 'byok' | 'platform' }> {
  const choice = resolveChoice(task);
  const keyProvider: AiProvider =
    choice.provider === 'anthropic' ? 'anthropic'
    : choice.provider === 'openai' ? 'openai'
    : 'huggingface';

  const { key, source } = await resolveClientApiKey({ clientId, provider: keyProvider });

  let model: LanguageModel;
  if (choice.provider === 'anthropic') {
    model = createAnthropic({ apiKey: key }).languageModel(choice.model);
  } else {
    // HF + OpenAI both speak the OpenAI-compatible chat-completions protocol.
    const baseURL = choice.provider === 'huggingface' ? HF_BASE_URL : OPENAI_BASE_URL;
    model = createOpenAICompatible({ name: choice.provider, apiKey: key, baseURL }).chatModel(choice.model);
  }
  return { model, choice, keySource: source };
}
