/**
 * Automation-rule AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { automationRules } from '@/lib/db/schema';
import type { AutomationTrigger, AutomationCondition, AutomationAction } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { deriveRuleScopes } from './derive-rule-scopes';

export const automationTools: Anthropic.Tool[] = [
  {
    name: 'get_my_automations',
    description: 'Get all automation rules for this client.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_automation',
    description: 'Create an automation rule. Confirm with user first. Use get_my_automations to see examples of trigger/action format.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Rule name' },
        description: { type: 'string', description: 'What this rule does' },
        trigger: { type: 'string', description: 'JSON: {event: "crm.deal.won"} — event name from automation events' },
        conditions: { type: 'string', description: 'JSON array: [{field, operator, value}]' },
        actions: { type: 'string', description: 'JSON array: [{tool: "create_support_ticket", params: {subject: "...", body: "...", priority: "medium", category: "general"}}]' },
      },
      required: ['name', 'trigger', 'actions'],
    },
  },
  {
    name: 'toggle_automation',
    description: 'Enable or disable an automation rule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'number', description: 'Automation rule ID' },
        enabled: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['rule_id', 'enabled'],
    },
  },
];

export type AutomationHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const automationHandlers: Record<string, AutomationHandler> = {
  get_my_automations: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: automationRules.id, name: automationRules.name, description: automationRules.description,
      trigger: automationRules.trigger, conditions: automationRules.conditions, actions: automationRules.actions,
      enabled: automationRules.enabled, executionCount: automationRules.executionCount,
      lastExecutedAt: automationRules.lastExecutedAt,
    }).from(automationRules).where(eq(automationRules.clientId, clientId)).orderBy(desc(automationRules.createdAt));
    return rows;
  },

  create_automation: async (input, clientId, userId) => {
    let trigger: AutomationTrigger, conditions: AutomationCondition[] = [], actions: AutomationAction[];
    try { trigger = JSON.parse(input.trigger as string); } catch { return { error: 'Invalid trigger JSON' }; }
    try { actions = JSON.parse(input.actions as string); } catch { return { error: 'Invalid actions JSON' }; }
    if (input.conditions) { try { conditions = JSON.parse(input.conditions as string); } catch { return { error: 'Invalid conditions JSON' }; } }
    if (!Array.isArray(actions) || actions.length === 0) return { error: 'At least one action is required' };
    const [rule] = await db.insert(automationRules).values({
      clientId, name: (input.name as string).trim(),
      description: (input.description as string)?.trim() || null,
      trigger, conditions, actions,
      scopes: deriveRuleScopes(actions),
      source: 'ai', createdBy: userId,
    }).returning();
    return { success: true, ruleId: rule.id, message: `Automation "${rule.name}" created and enabled.` };
  },

  toggle_automation: async (input, clientId, _userId) => {
    const ruleId = input.rule_id as number;
    const enabled = input.enabled as boolean;
    const [rule] = await db.select({ id: automationRules.id }).from(automationRules)
      .where(and(eq(automationRules.id, ruleId), eq(automationRules.clientId, clientId)));
    if (!rule) return { error: 'Automation rule not found' };
    await db.update(automationRules).set({ enabled, updatedAt: new Date() }).where(eq(automationRules.id, ruleId));
    return { success: true, message: `Automation ${enabled ? 'enabled' : 'disabled'}.` };
  },
};
