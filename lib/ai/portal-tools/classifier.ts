/**
 * Portal request classifier — a single cheap Haiku call that runs before the
 * main tool loop and does two jobs at once (no extra hop / latency):
 *
 *  1. Complexity routing (cost control):
 *       simple  → handled by Haiku (fast, cheap)
 *       complex → handled by Sonnet (multi-tool / write / multi-step reasoning)
 *
 *  2. Intent routing (tool-surface narrowing — the hub of hub-and-spoke):
 *       domains → which portal domain(s) the request touches, so the loop can
 *       be handed just that tool subset instead of all ~80 tools.
 *
 * On any failure we default to `complex` (route to the capable model) and
 * `domains: []` (load every tool). A classifier hiccup degrades cost, never
 * capability. See ADR agent-topology-router-not-domain-mesh.
 */

import Anthropic from '@anthropic-ai/sdk';
import { PORTAL_DOMAINS, type PortalDomain } from './domains';

export interface PortalClassification {
  complexity: 'simple' | 'complex';
  // Domains the request is predicted to touch. Empty = "could not narrow" →
  // caller should fail open to the full tool surface.
  domains: PortalDomain[];
  reasoning: string;
  // Usage is surfaced so the caller can fold it into credit accounting — the
  // classifier call is real spend on platform keys.
  inputTokens: number;
  outputTokens: number;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: 'classify',
  description:
    'Classify a client-portal request so it can be routed to the right model and the right tool subset.',
  input_schema: {
    type: 'object' as const,
    properties: {
      complexity: {
        type: 'string',
        enum: ['simple', 'complex'],
        description:
          'simple = a single read/lookup or a one-line answer a single tool call can satisfy; complex = multiple tool calls, a data-modifying (create/update/move/send) action that needs confirmation, or multi-step reasoning.',
      },
      domains: {
        type: 'array',
        items: { type: 'string', enum: [...PORTAL_DOMAINS] },
        description:
          'The portal domain(s) this request touches. Pick every domain whose tools are plausibly needed — err toward including a domain rather than omitting it. Leave empty ONLY if the request is too vague to attribute to any domain.',
      },
      reasoning: {
        type: 'string',
        description: 'One sentence explaining the choice.',
      },
    },
    required: ['complexity', 'domains', 'reasoning'],
  },
};

function parseDomains(value: unknown): PortalDomain[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(PORTAL_DOMAINS);
  const out: PortalDomain[] = [];
  for (const v of value) {
    if (typeof v === 'string' && allowed.has(v) && !out.includes(v as PortalDomain)) {
      out.push(v as PortalDomain);
    }
  }
  return out;
}

export async function classifyPortalRequest(
  message: string,
  anthropic: Anthropic,
): Promise<PortalClassification> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 192,
      system:
        'You classify requests sent to a client-portal AI assistant that manages projects, invoices/billing, support tickets, websites (cms), CRM, email campaigns, booking pages, pitch decks, surveys, automations, services, team/profile, and a dashboard overview. For each request decide (1) whether it is simple (a single lookup or one-line answer) or complex (multiple tool calls, a data-modifying action, or multi-step reasoning), and (2) which domain(s) its tools belong to.',
      messages: [{ role: 'user', content: message }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify' },
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'classify') {
        const input = block.input as Record<string, unknown>;
        return {
          complexity: input.complexity === 'simple' ? 'simple' : 'complex',
          domains: parseDomains(input.domains),
          reasoning: String(input.reasoning ?? ''),
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      }
    }

    // tool_choice forced the tool but no block came back — bill what we spent,
    // route conservatively to the capable model + full tool surface.
    return {
      complexity: 'complex',
      domains: [],
      reasoning: 'fallback (no classification block)',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch {
    return {
      complexity: 'complex',
      domains: [],
      reasoning: 'fallback (classifier error)',
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

/**
 * Back-compat alias. The classifier originally only did complexity routing;
 * the name is kept so existing imports/tests keep working.
 * @deprecated use classifyPortalRequest
 */
export const classifyPortalComplexity = classifyPortalRequest;
