// @vitest-environment node
/**
 * Unit tests for deriveRuleScopes — the helper that maps an automation rule's
 * action list to the deduped, sorted union of required portal-tool scopes.
 */
import { describe, it, expect, vi } from 'vitest';

// deriveRuleScopes only imports requiredScopeFor which in turn reads the
// static PORTAL_TOOL_SCOPES map — no DB or network required.
vi.mock('@/lib/db', () => ({ db: {} }));

import { deriveRuleScopes } from '@/lib/ai/portal-tools/derive-rule-scopes';
import type { AutomationAction } from '@/lib/db/schema';

function action(tool: string): AutomationAction {
  return { tool, params: {} };
}

describe('deriveRuleScopes', () => {
  it('returns [] for an empty action list', () => {
    expect(deriveRuleScopes([])).toEqual([]);
  });

  it('returns the correct scope for a single known action', () => {
    expect(deriveRuleScopes([action('create_crm_contact')])).toEqual(['crm:write']);
  });

  it('dedupes identical scopes across multiple actions in the same domain', () => {
    // get_crm_deals → crm:read, get_crm_contacts → crm:read
    const result = deriveRuleScopes([action('get_crm_deals'), action('get_crm_contacts')]);
    expect(result).toEqual(['crm:read']);
  });

  it('returns a deduped sorted union for a multi-scope rule', () => {
    // create_crm_contact → crm:write
    // get_crm_deals      → crm:read
    // create_automation  → automations:write
    const result = deriveRuleScopes([
      action('create_crm_contact'),
      action('get_crm_deals'),
      action('create_automation'),
    ]);
    // sorted: automations:write < crm:read < crm:write
    expect(result).toEqual(['automations:write', 'crm:read', 'crm:write']);
  });

  it('skips unknown tool names (e.g. start_playbook sentinel) without throwing', () => {
    const result = deriveRuleScopes([
      action('start_playbook'),
      action('create_crm_contact'),
    ]);
    expect(result).toEqual(['crm:write']);
  });

  it('handles duplicate actions (same tool listed twice) correctly', () => {
    const result = deriveRuleScopes([
      action('create_crm_contact'),
      action('create_crm_contact'),
    ]);
    expect(result).toEqual(['crm:write']);
  });

  it('returns results in sorted order regardless of input order', () => {
    const result = deriveRuleScopes([
      action('get_my_invoices'),    // billing:read
      action('create_automation'),  // automations:write
      action('get_crm_contacts'),   // crm:read
    ]);
    expect(result).toEqual(['automations:write', 'billing:read', 'crm:read']);
  });
});
