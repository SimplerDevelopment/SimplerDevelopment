// @vitest-environment node
/**
 * Unit tests for lib/mcp/high-risk-tools.ts
 *
 * Verifies the ADR's GATE-set classification (AAF-001):
 *   - deletes/voids/removes/revokes → true
 *   - outbound sends/schedules → true
 *   - explicit authority mutations → true
 *   - benign reads → false
 */
import { describe, it, expect } from 'vitest';
import { isHighRiskTool, HIGH_RISK_TOOL_SET } from '@/lib/mcp/high-risk-tools';

describe('isHighRiskTool', () => {
  it.each([
    'crm_deals_delete',
    'posts_delete',
    'contracts_void',
    'team_remove_member',
    'integrations_revoke',
  ])('classifies delete/void/remove/revoke tool "%s" as high-risk', (name) => {
    expect(isHighRiskTool(name)).toBe(true);
  });

  it.each([
    'email_campaigns_send',
    'email_campaigns_schedule',
    'proposals_send',
  ])('classifies outbound-send tool "%s" as high-risk', (name) => {
    expect(isHighRiskTool(name)).toBe(true);
  });

  it.each([
    'team_update_role',
    'team_remove_member',
    'integrations_revoke',
  ])('classifies explicit authority-mutation tool "%s" as high-risk', (name) => {
    expect(isHighRiskTool(name)).toBe(true);
    expect(HIGH_RISK_TOOL_SET.has(name)).toBe(true);
  });

  it.each([
    'crm_deals_list',
    'posts_get',
    'crm_deals_create',
    'crm_deals_update',
    'posts_list',
    'team_list_members',
    'kanban_create_card',
  ])('classifies benign read/write tool "%s" as NOT high-risk', (name) => {
    expect(isHighRiskTool(name)).toBe(false);
  });

  it('is case-sensitive and does not match a substring in the middle of a name', () => {
    // "sendMessage" contains "send" but not as a trailing "_send" suffix.
    expect(isHighRiskTool('chat_sendMessage')).toBe(false);
    // Exact suffix match only.
    expect(isHighRiskTool('email_campaigns_send')).toBe(true);
  });
});
