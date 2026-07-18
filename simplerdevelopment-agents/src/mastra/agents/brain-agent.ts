import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { sdTools } from '../mcp/sd-mcp';
import { toolGroundingScorer, groundednessScorer } from '../scorers/brain-scorer';

/**
 * The Company Brain tool-loop agent — the Mastra rebuild of the parent app's
 * hand-rolled streaming agent at `app/api/portal/brain/agent/route.ts`.
 *
 * Where the parent drove the Anthropic SDK directly, this is a plain Mastra
 * `Agent`: instructions + model + tools + memory. The tools are pulled live from
 * the SimplerDevelopment portal MCP server (see ../mcp/sd-mcp.ts), so the agent
 * inherits the portal's scoped tool catalogue instead of re-declaring it.
 */
const MAIN_MODEL = process.env.SD_BRAIN_MODEL ?? 'anthropic/claude-sonnet-4-6';

export const brainAgent = new Agent({
  id: 'brain-agent',
  name: 'Company Brain Agent',
  instructions: `You are the Company Brain assistant for SimplerDevelopment — an agency's
internal knowledge base (notes, decisions, people/expertise, glossary, initiatives, tasks).

How to work:
- Use the brain_* tools to ground every factual claim. Never answer org-specific
  questions from memory — search first.
- Prefer brain_search for open lookups; use the specific getters (brain_get_note,
  brain_get_decision, etc.) when you already have an id.
- Cite what you used: name the notes/decisions/people your answer rests on.
- For "who knows X" / expertise questions, use the people tools.
- Be concise. Answer the question asked; don't dump everything you found.

Writes (create note / task, etc.):
- Confirm intent in plain language before calling a write tool.
- Writes route through the portal's approval flow — the tool returns an approval URL
  rather than mutating immediately. Surface that URL to the user; do not claim the
  change is live until it's approved.

If the tools return nothing relevant, say so plainly rather than guessing.`,
  model: MAIN_MODEL,
  // Lazy/dynamic tools: resolved per request from the SD MCP server. This means the
  // agent works in Mastra Studio and inside the workflow, and fails with a clear
  // message (not at import) when no portal API key is configured.
  // The Brain agent only wants the brain_* slice — a broad/full-scope key can expose
  // ~450 tools, which bloats the prompt and dilutes tool selection.
  tools: async () => {
    const all = await sdTools();
    return Object.fromEntries(Object.entries(all).filter(([name]) => name.startsWith('brain_')));
  },
  memory: new Memory(),
  // Eval layer: grade a sample of runs for tool-grounding + groundedness.
  scorers: {
    toolGrounding: { scorer: toolGroundingScorer, sampling: { type: 'ratio', rate: 1 } },
    groundedness: { scorer: groundednessScorer, sampling: { type: 'ratio', rate: 0.5 } },
  },
});
