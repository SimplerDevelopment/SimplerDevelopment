/**
 * MCP tools — guided workflows (lazy-loaded "skills").
 *
 * Progressive disclosure over MCP, host-agnostic: because these are *tools*,
 * they work in Claude Desktop AND ChatGPT (unlike Claude skills, which are
 * Claude-only, or MCP prompts, which ChatGPT doesn't surface).
 *
 *   - `list_workflows` advertises the guided content workflows (cheap, always
 *     callable) — the "metadata" tier the model needs to know they exist.
 *   - `get_workflow(name)` returns the full step-by-step instructions on
 *     demand — the "body" tier, loaded only when actually needed.
 *
 * The model then performs the work by calling the portal's domain tools
 * (decks_*, posts_*, email_campaigns_*, …) per the loaded guide.
 *
 * Guidance is seeded from the bundled `sd-create-*` skill bodies under
 * `.claude/skills/`, read at runtime and cached per process.
 *
 * NOTE (content): the seeded bodies are authored for the Claude Code skill
 * runtime (they reference `.sd/config.json`, sibling docs, local files). For
 * polished client-facing delivery these should be curated down to the
 * portable "use these MCP tools to produce X" steps — tracked separately. The
 * mechanism here is the deliverable.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { json, type ToolEnvelope } from '../types';

// Public workflow ids (the `get_workflow` arg). `as const` so z.enum gets the
// literal union.
const WORKFLOW_NAMES = [
  'create-page',
  'create-deck',
  'create-email',
  'create-survey',
  'create-website',
  'create-booking-page',
] as const;

type WorkflowName = (typeof WORKFLOW_NAMES)[number];

const WORKFLOWS: Record<WorkflowName, { title: string; skillDir: string }> = {
  'create-page': { title: 'Create a CMS page', skillDir: 'sd-create-page' },
  'create-deck': { title: 'Create a pitch deck', skillDir: 'sd-create-deck' },
  'create-email': { title: 'Create an email campaign', skillDir: 'sd-create-email' },
  'create-survey': { title: 'Create a survey', skillDir: 'sd-create-survey' },
  'create-website': { title: 'Create a multi-page website', skillDir: 'sd-create-website' },
  'create-booking-page': { title: 'Create a booking page', skillDir: 'sd-create-booking-page' },
};

const cache = new Map<string, { description: string; body: string }>();

/** Read a bundled SKILL.md, splitting YAML frontmatter from the markdown body. */
function readSkill(skillDir: string): { description: string; body: string } {
  const hit = cache.get(skillDir);
  if (hit) return hit;
  const raw = readFileSync(
    join(process.cwd(), '.claude', 'skills', skillDir, 'SKILL.md'),
    'utf8',
  );
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const front = m ? m[1] : '';
  const body = (m ? m[2] : raw).trim();
  const descMatch = front.match(/^description:\s*(.+)$/m);
  const result = { description: descMatch ? descMatch[1].trim() : '', body };
  cache.set(skillDir, result);
  return result;
}

function textResult(text: string, isError = false): ToolEnvelope {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
}

export function registerWorkflowTools(server: McpServer, _ctx: PortalMcpContext): void {
  server.registerTool(
    'list_workflows',
    {
      title: 'List guided workflows',
      description:
        'List the guided content workflows this portal supports (create a page, deck, email, ' +
        'survey, website, or booking page). Call this to discover what you can produce, then call ' +
        '`get_workflow` to load the step-by-step instructions BEFORE creating anything.',
      inputSchema: {},
    },
    async () => {
      const workflows = WORKFLOW_NAMES.map((name) => {
        let whenToUse = '';
        try {
          whenToUse = readSkill(WORKFLOWS[name].skillDir).description;
        } catch {
          /* body unavailable — still advertise the name/title */
        }
        return { name, title: WORKFLOWS[name].title, whenToUse };
      });
      return json({ workflows });
    },
  );

  server.registerTool(
    'get_workflow',
    {
      title: 'Load a workflow guide',
      description:
        'Load the full step-by-step instructions for a guided content workflow. ALWAYS call this ' +
        'BEFORE attempting to create a page / deck / email / survey / website / booking page, then ' +
        `follow the returned steps using the portal's tools. name must be one of: ${WORKFLOW_NAMES.join(', ')}.`,
      inputSchema: { name: z.enum(WORKFLOW_NAMES) },
    },
    async ({ name }): Promise<ToolEnvelope> => {
      const wf = WORKFLOWS[name];
      let body: string;
      try {
        body = readSkill(wf.skillDir).body;
      } catch {
        return textResult(`Workflow "${name}" guide is unavailable on this server.`, true);
      }
      const header =
        `# Workflow: ${wf.title} (${name})\n\n` +
        `Follow these steps using the portal's tools. Ask the user for any missing inputs.\n\n---\n\n`;
      return textResult(header + body);
    },
  );
}
