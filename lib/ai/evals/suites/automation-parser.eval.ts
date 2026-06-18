/**
 * Eval suite — Automation NLP parser (`lib/automation/nlp-parser.ts`).
 *
 * Prompt turns a plain-English rule into structured trigger/conditions/actions
 * JSON. Today it uses raw JSON.parse with no validation, so the highest-value
 * checks are: (1) does it conform to the ParsedAutomation contract, and (2) did
 * it pick the right trigger event + a relevant action tool.
 */
import { z } from 'zod';
import { parseAutomationDescription, type ParsedAutomation } from '@/lib/automation/nlp-parser';
import type { EvalSuite } from '../types';
import { zodConformance, requiredFields, predicate, latencyUnder } from '../scorers';

interface Input {
  description: string;
}
interface Expected {
  /** AUTOMATION_EVENTS key the trigger should resolve to. */
  event: string;
  /** Substring that should appear in at least one action tool name. */
  actionToolIncludes: string;
}

const parsedSchema = z.object({
  name: z.string().min(1),
  trigger: z.object({
    event: z.string().min(1),
    filters: z.record(z.string(), z.unknown()).optional(),
  }),
  conditions: z.array(
    z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'gt', 'lt', 'exists', 'not_exists']),
      value: z.unknown().optional(),
    }),
  ),
  actions: z
    .array(
      z.object({
        tool: z.string().min(1),
        params: z.record(z.string(), z.unknown()),
        delay: z.number().optional(),
      }),
    )
    .min(1),
  productScope: z.string().nullable(),
});

const cases = [
  {
    id: 'new-contact-welcome-email',
    input: { description: 'When a new CRM contact is created, send them a welcome email.' },
    expected: { event: 'crm.contact.created', actionToolIncludes: 'email' } satisfies Expected,
    mockOutput: {
      name: 'Welcome new contacts',
      trigger: { event: 'crm.contact.created' },
      conditions: [],
      actions: [{ tool: 'send_email', params: { template: 'welcome' } }],
      productScope: null,
    },
  },
  {
    id: 'deal-won-create-project',
    input: { description: 'Once a deal is marked won, create a new project for the client.' },
    expected: { event: 'crm.deal.won', actionToolIncludes: 'project' } satisfies Expected,
    mockOutput: {
      name: 'Spin up project on won deal',
      trigger: { event: 'crm.deal.won' },
      conditions: [],
      actions: [{ tool: 'create_project', params: {} }],
      productScope: null,
    },
  },
  {
    id: 'invoice-overdue-reminder',
    input: { description: 'If an invoice becomes overdue, wait 2 days then send a reminder email.' },
    expected: { event: 'invoice.overdue', actionToolIncludes: 'email' } satisfies Expected,
    mockOutput: {
      name: 'Overdue invoice reminder',
      trigger: { event: 'invoice.overdue' },
      conditions: [],
      actions: [{ tool: 'send_email', params: { template: 'overdue' }, delay: 172800 }],
      productScope: null,
    },
  },
  {
    // Deliberately-wrong mock so the offline (--mock) demo shows a real FAILURE
    // row + scorer detail, proving the harness catches drift rather than always
    // printing green. The trigger event is mismatched against `expected`.
    id: 'ticket-created-notify',
    input: { description: 'When a support ticket is created, notify the team.' },
    expected: { event: 'ticket.created', actionToolIncludes: 'email' } satisfies Expected,
    mockOutput: {
      name: 'Notify on ticket',
      trigger: { event: 'ticket.replied' }, // wrong on purpose
      conditions: [],
      actions: [{ tool: 'send_email', params: {} }],
      productScope: null,
    },
  },
] as const;

export const automationParserSuite: EvalSuite<Input, ParsedAutomation> = {
  id: 'automation-parser',
  description: 'Plain-English automation rule → structured trigger/conditions/actions.',
  cases: cases as unknown as EvalSuite<Input, ParsedAutomation>['cases'],
  scorers: [
    zodConformance<ParsedAutomation>(parsedSchema),
    requiredFields<ParsedAutomation>(['name', 'trigger.event', 'actions.0.tool']),
    predicate<Input, ParsedAutomation>('trigger-event-correct', (o, ctx) => {
      const exp = ctx.expected as Expected;
      return { pass: o.trigger.event === exp.event, detail: `got ${o.trigger.event}, expected ${exp.event}` };
    }),
    predicate<Input, ParsedAutomation>('action-tool-relevant', (o, ctx) => {
      const exp = ctx.expected as Expected;
      const pass = o.actions.some((a) => a.tool.toLowerCase().includes(exp.actionToolIncludes));
      return { pass, detail: `tools: ${o.actions.map((a) => a.tool).join(', ')}` };
    }),
    latencyUnder(15_000),
  ],
  async run(input, env) {
    const { parsed, inputTokens, outputTokens } = await parseAutomationDescription(
      input.description,
      env.clientId ? { clientId: env.clientId } : {},
    );
    return { output: parsed, inputTokens, outputTokens };
  },
};
