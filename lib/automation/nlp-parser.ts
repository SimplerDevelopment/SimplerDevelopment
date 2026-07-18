/**
 * NLP Automation Parser
 *
 * Takes a plain-English automation description and uses Claude
 * to parse it into structured trigger/condition/action JSON.
 */

import { AUTOMATION_EVENTS } from './event-bus';
import { PORTAL_TOOLS } from '@/lib/ai/portal-tools';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { complete } from '@/lib/ai/llm';

export interface ParsedAutomation {
  name: string;
  trigger: {
    event: string;
    filters?: Record<string, unknown>;
  };
  conditions: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'exists' | 'not_exists';
    value?: unknown;
  }[];
  actions: {
    tool: string;
    params: Record<string, unknown>;
    delay?: number;
  }[];
  productScope: string | null;
}

const AVAILABLE_EVENTS = Object.entries(AUTOMATION_EVENTS)
  .map(([key, desc]) => `  ${key} — ${desc}`)
  .join('\n');

const AVAILABLE_TOOLS = PORTAL_TOOLS
  .filter((t) => !t.name.startsWith('get_') && t.name !== 'navigate_to')
  .map((t) => `  ${t.name} — ${t.description}`)
  .join('\n');

const READ_TOOLS = PORTAL_TOOLS
  .filter((t) => t.name.startsWith('get_'))
  .map((t) => `  ${t.name} — ${t.description}`)
  .join('\n');

const SYSTEM_PROMPT = `You are an automation rule parser. Given a plain-English description of an automation, you produce a structured JSON rule.

## Available Trigger Events
${AVAILABLE_EVENTS}

## Available Action Tools (write operations)
${AVAILABLE_TOOLS}

## Available Read Tools (for conditions/context)
${READ_TOOLS}

## Brain Playbook Bridge
In addition to portal tools, automations can kick off a multi-step Brain
playbook via the special action tool name "start_playbook". Use this when
the user says things like "start the X playbook", "kick off the X playbook",
"run the X playbook", or "trigger the X onboarding/renewal/incident-response
playbook". Prefer start_playbook over a chain of portal-tool actions when the
described process has multiple steps, waits, branches, or human checkpoints.

Shape:
{
  "tool": "start_playbook",
  "params": {
    "playbookSlug": "<kebab-case slug guessed from the playbook name>",
    "label": "<human label, may include {{event.field}}>",
    "context": { /* optional — defaults to the event payload */ }
  }
}

Resolution: the engine resolves playbookSlug to a real playbookId at
execution time by querying brain_playbooks for the current tenant. This
means a parse-time DB lookup is NOT required — emit the slug verbatim and
let the engine resolve it. If the user names the playbook explicitly (e.g.
"the new-hire-onboarding playbook"), slugify it to lowercase-kebab-case.
Never invent a numeric playbookId.

## Template Variables
Action params can reference event payload fields using {{event.fieldName}} syntax.
Common payload fields vary by event:
- booking.*: id, pageId, guestName, guestEmail, date, time, status
- crm.contact.*: id, name, email, phone, company
- crm.deal.*: id, title, value, stage, contactId
- ticket.*: id, subject, category, priority, status
- email.*: campaignId, listId, email
- order.*: id, total, customerEmail, items
- form.*: formId, pageId, fields (object of submitted values)
- project.*: id, name, status
- task.*: id, title, columnId, assignedTo, priority
- invoice.*: id, number, total, status
- proposal.*: id, title, contactId, status

## Response Format
Return ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "name": "Short descriptive name for the automation",
  "trigger": {
    "event": "event.name",
    "filters": {}  // optional, omit if none
  },
  "conditions": [],  // optional array of conditions
  "actions": [
    {
      "tool": "tool_name",
      "params": { "key": "value or {{event.field}}" },
      "delay": 0  // seconds, omit or 0 for immediate
    }
  ],
  "productScope": null  // or "booking", "crm", "email", etc.
}

## Rules
- Pick the most specific trigger event that matches
- Use template variables ({{event.field}}) to pass data between trigger and actions
- For cross-product automations, set productScope to null
- For delayed actions (e.g. "send a follow-up after 2 days"), set delay in seconds
- If the description is ambiguous, make the best reasonable interpretation
- Keep action params minimal — only include what's needed`;

export async function parseAutomationDescription(
  description: string,
  opts: { clientId?: number } = {},
): Promise<{ parsed: ParsedAutomation; inputTokens: number; outputTokens: number; source: 'byok' | 'platform' }> {
  // Resolve source (byok vs platform) for credit accounting. The AI call
  // goes through the provider-agnostic seam; clientId is required there.
  // Legacy callers that omit clientId get a platform-key fallback for source.
  let source: 'byok' | 'platform' = 'platform';
  const clientId = opts.clientId;
  if (typeof clientId === 'number') {
    const resolved = await resolveClientApiKey({ clientId, provider: 'anthropic' });
    source = resolved.source;
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
    }
  }

  // Legacy callers without clientId cannot use the provider-agnostic seam
  // (which requires a tenant). Require clientId going forward.
  if (typeof clientId !== 'number') {
    throw new Error('parseAutomationDescription requires clientId.');
  }

  const response = await complete({
    task: 'nlpParse',
    clientId,
    maxTokens: 1024,
    system: SYSTEM_PROMPT,
    prompt: `Parse this automation rule:\n\n"${description}"`,
  });

  const parsed = JSON.parse(response.text) as ParsedAutomation;

  void recordAiUsage({
    clientId,
    source,
    tokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
  });

  return {
    parsed,
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
    source,
  };
}
