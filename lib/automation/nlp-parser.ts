/**
 * NLP Automation Parser
 *
 * Takes a plain-English automation description and uses Claude
 * to parse it into structured trigger/condition/action JSON.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AUTOMATION_EVENTS } from './event-bus';
import { PORTAL_TOOLS } from '@/lib/ai/portal-tools';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
): Promise<{ parsed: ParsedAutomation; inputTokens: number; outputTokens: number }> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Parse this automation rule:\n\n"${description}"`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const parsed = JSON.parse(text) as ParsedAutomation;

  return {
    parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
