// Five starter workflow templates for the visual builder. The "New from
// template" flow on the list page clones one of these into a fresh
// `workflows` row in 'draft' status, scoped to the active client.

import type { WorkflowGraph, WorkflowTriggerConfig } from './types';

export interface WorkflowTemplate {
  id: string;
  icon: string; // Material Icons name
  name: string;
  description: string;
  trigger: WorkflowTriggerConfig;
  graph: WorkflowGraph;
}

// Helper — keeps the template literals below readable.
function pos(x: number, y: number) {
  return { x, y };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // 1. New lead nurture
  {
    id: 'new-lead-nurture',
    icon: 'person_add',
    name: 'New lead nurture',
    description: 'When a contact is created, wait an hour, then send the welcome email.',
    trigger: { kind: 'contact.created' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'contact.created' } },
        { id: 'wait-1h', type: 'action', position: pos(50, 200), data: { kind: 'wait', ms: 60 * 60 * 1000 } },
        { id: 'welcome-email', type: 'action', position: pos(50, 350), data: { kind: 'send_email', templateId: 0, to: 'contact' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'wait-1h' },
        { id: 'e2', source: 'wait-1h', target: 'welcome-email' },
      ],
    },
  },

  // 2. Stale deal nudge — Monday 9am, branch on a stale-deal condition.
  {
    id: 'stale-deal-nudge',
    icon: 'schedule',
    name: 'Stale deal nudge',
    description: 'Every Monday at 9am, create a follow-up task for any deal that has sat in stage for over 7 days.',
    trigger: { kind: 'schedule', cron: '0 9 * * 1' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'schedule', cron: '0 9 * * 1' } },
        {
          id: 'check-stale',
          type: 'condition',
          position: pos(50, 200),
          data: { kind: 'condition', expression: 'deal.daysInStage > 7' },
        },
        {
          id: 'create-followup',
          type: 'action',
          position: pos(50, 350),
          data: { kind: 'create_task', title: 'Follow up on stale deal' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'check-stale' },
        { id: 'e2', source: 'check-stale', target: 'create-followup', label: 'true' },
      ],
    },
  },

  // 3. Form submission auto-task.
  {
    id: 'form-submission-auto-task',
    icon: 'assignment',
    name: 'Form submission auto-task',
    description: 'Whenever a form is submitted, create a task for the deal owner to follow up.',
    trigger: { kind: 'form.submitted' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'form.submitted' } },
        {
          id: 'task-followup',
          type: 'action',
          position: pos(50, 200),
          data: { kind: 'create_task', title: 'Follow up on form submission' },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'task-followup' }],
    },
  },

  // 4. Webhook to Slack.
  {
    id: 'webhook-to-slack',
    icon: 'webhook',
    name: 'Webhook to Slack',
    description: 'Receive an inbound webhook and forward the payload to a Slack incoming-webhook URL.',
    trigger: { kind: 'webhook.received', secret: 'change-me' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'webhook.received', secret: 'change-me' } },
        {
          id: 'forward-slack',
          type: 'action',
          position: pos(50, 200),
          data: {
            kind: 'webhook',
            url: 'https://hooks.slack.com/services/REPLACE/ME',
            payload: { text: 'Workflow fired: {{trigger.kind}}' },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'forward-slack' }],
    },
  },

  // 5. Stage advance celebration — fan-out from one trigger to two parallel actions.
  {
    id: 'stage-advance-celebration',
    icon: 'celebration',
    name: 'Stage advance celebration',
    description: 'When a deal moves to "won", create a thank-you task and ping a celebration webhook.',
    trigger: { kind: 'deal.stage_changed' },
    graph: {
      nodes: [
        { id: 'trigger', type: 'trigger', position: pos(50, 50), data: { kind: 'deal.stage_changed' } },
        {
          id: 'thank-you-task',
          type: 'action',
          position: pos(-100, 200),
          data: { kind: 'create_task', title: 'Send thank you to client' },
        },
        {
          id: 'celebrate-hook',
          type: 'action',
          position: pos(200, 200),
          data: {
            kind: 'webhook',
            url: 'https://hooks.example.com/celebrate',
            payload: { event: 'deal.won' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'thank-you-task' },
        { id: 'e2', source: 'trigger', target: 'celebrate-hook' },
      ],
    },
  },
];

export function findTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
