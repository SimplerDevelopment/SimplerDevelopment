/**
 * MCP prompts — user-triggered guided workflows.
 *
 * A prompt is NOT executed server-side: it returns a templated message that the
 * client's model then carries out using the tool catalogue. Capable clients
 * surface these as slash-commands / a prompt picker. This repo already encodes
 * the same workflows as Claude Code *skills* (sd-create-page, etc.) — these MCP
 * prompts exist so clients WITHOUT those skills (Claude Desktop, third-party
 * agents) still get guided entry points. We deliberately expose only a handful
 * of high-value workflows, not the whole skill catalogue.
 *
 * Tenancy/consistency: each prompt is gated on a representative scope (the same
 * `hasScope` short-circuit the tool/resource registrars use) so a narrowly- or
 * empty-scoped key sees no prompt it couldn't act on. Prompt arguments are
 * always strings (the prompts/get protocol passes string args).
 *
 * Drift guard: the registered prompt-name set is locked by
 * `tests/unit/mcp-tool-registry-baseline.test.ts` (EXPECTED_PROMPTS).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';

/** Wrap a single user-role text message in the prompts/get result shape. */
function userText(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

export function registerPromptTemplates(server: McpServer, ctx: PortalMcpContext): void {

  // ── draft-page — author a brand-aware CMS page as a DRAFT ─────────────────
  hasScope(ctx.scopes, 'sites:write') && server.registerPrompt(
    'draft-page',
    {
      title: 'Draft a website page',
      description: 'Draft a brand-aware CMS page (blog post / landing page) as a DRAFT — never published.',
      argsSchema: {
        topic: z.string().describe('What the page is about.'),
        audience: z.string().optional().describe('Who the page is for (optional).'),
      },
    },
    ({ topic, audience }) => userText(
      `Draft a CMS page about "${topic}"${audience ? ` for ${audience}` : ''}.\n` +
      `1. Read the brand://default resource (or call branding_get_profile) so voice, colours, and fonts match the brand.\n` +
      `2. Read blocks://schema for the valid block shapes.\n` +
      `3. Create the page as a DRAFT via posts_create with a structured \`blocks\` array (do NOT set it published).\n` +
      `4. Return the post id and its approval URL for review. Do not publish.`,
    ),
  );

  // ── triage-tickets — classify open tickets and propose actions ───────────
  hasScope(ctx.scopes, 'tickets:read') && server.registerPrompt(
    'triage-tickets',
    {
      title: 'Triage open tickets',
      description: 'Classify open support tickets and propose the right next action for each.',
      argsSchema: {
        priority: z.string().optional().describe('Filter to a priority (e.g. "high"); omit for all.'),
      },
    },
    ({ priority }) => userText(
      `Triage open support tickets.\n` +
      `1. Call tickets_list (status open${priority ? `, priority ${priority}` : ''}).\n` +
      `2. Classify each as bug / billing / feature-request / spam.\n` +
      `3. Propose the next action per ticket (reply via tickets_reply, update via tickets_update, or escalate).\n` +
      `4. Present a table: ticket id · subject · classification · proposed action. Ask before sending any reply.`,
    ),
  );

  // ── weekly-digest — summarize recent activity across the portal ──────────
  hasScope(ctx.scopes, 'projects:read') && server.registerPrompt(
    'weekly-digest',
    {
      title: 'Weekly activity digest',
      description: 'Summarize recent project, ticket, and CRM activity into a concise digest.',
      argsSchema: {
        since: z.string().optional().describe('How far back to look, e.g. "7 days" (default: the last week).'),
      },
    },
    ({ since }) => userText(
      `Produce an activity digest for this client covering ${since ?? 'the last 7 days'}.\n` +
      `Pull recent activity from projects_list, kanban_list_board, tickets_list, and crm_activities_list.\n` +
      `Summarize: shipped / active projects, open tickets by status, and notable CRM movement.\n` +
      `Output concise markdown with section headings — no raw tool dumps.`,
    ),
  );
}
