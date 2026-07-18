// @vitest-environment node
/**
 * Portal-tools scope registry — completeness + vocabulary tests.
 *
 * (a) COMPLETENESS: every key in HANDLERS has an entry in PORTAL_TOOL_SCOPES.
 * (b) VOCABULARY:   every value in PORTAL_TOOL_SCOPES is a member of the
 *                   canonical scope string set.
 *
 * If a new handler is added to any domain module without a corresponding scope
 * entry this test will fail, preventing silent drift in CI.
 */
import { describe, it, expect, vi } from 'vitest';

// Stub DB-touching imports so the handler modules can be loaded in isolation.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: vi.fn() }));

import { HANDLERS } from '@/lib/ai/portal-tools';
import { PORTAL_TOOL_SCOPES, requiredScopeFor } from '@/lib/ai/portal-tools/scopes';

// ---------------------------------------------------------------------------
// Canonical scope vocabulary — only values from this set are valid.
// ---------------------------------------------------------------------------
const VALID_SCOPES = new Set([
  'ai:read',
  'automations:read',
  'automations:write',
  'billing:read',
  'bookings:read',
  'bookings:write',
  'brain:write',
  'crm:read',
  'crm:write',
  'decks:read',
  'decks:write',
  'email:read',
  'email:send',
  'email:write',
  'hosting:read',
  'integrations:read',
  'integrations:write',
  'media:read',
  'media:write',
  'profile:read',
  'profile:write',
  'projects:read',
  'projects:write',
  'services:read',
  'services:write',
  'sites:read',
  'sites:write',
  'surveys:read',
  'surveys:write',
  'team:read',
  'team:write',
  'tickets:read',
  'tickets:write',
]);

describe('PORTAL_TOOL_SCOPES — completeness', () => {
  it('every key in HANDLERS has an entry in PORTAL_TOOL_SCOPES', () => {
    const handlerKeys = Object.keys(HANDLERS).sort();
    const scopeKeys = Object.keys(PORTAL_TOOL_SCOPES).sort();

    const missing = handlerKeys.filter(k => !(k in PORTAL_TOOL_SCOPES));
    expect(
      missing,
      `These handler keys are missing from PORTAL_TOOL_SCOPES: ${missing.join(', ')}`,
    ).toEqual([]);

    const extra = scopeKeys.filter(k => !(k in HANDLERS));
    expect(
      extra,
      `These scope keys have no matching handler (stale entries): ${extra.join(', ')}`,
    ).toEqual([]);
  });

  it('PORTAL_TOOL_SCOPES has exactly as many entries as HANDLERS', () => {
    expect(Object.keys(PORTAL_TOOL_SCOPES).length).toBe(Object.keys(HANDLERS).length);
  });
});

describe('PORTAL_TOOL_SCOPES — vocabulary', () => {
  it('every scope value is a member of the canonical vocabulary', () => {
    const invalid: Array<[string, string]> = [];
    for (const [tool, scope] of Object.entries(PORTAL_TOOL_SCOPES)) {
      if (!VALID_SCOPES.has(scope)) {
        invalid.push([tool, scope]);
      }
    }
    expect(
      invalid,
      `Invalid scope values: ${invalid.map(([t, s]) => `${t}→"${s}"`).join(', ')}`,
    ).toEqual([]);
  });
});

describe('requiredScopeFor helper', () => {
  it('returns the correct scope for a known tool', () => {
    expect(requiredScopeFor('get_my_projects')).toBe('projects:read');
    expect(requiredScopeFor('create_project_card')).toBe('projects:write');
    expect(requiredScopeFor('get_my_invoices')).toBe('billing:read');
    expect(requiredScopeFor('create_support_ticket')).toBe('tickets:write');
    expect(requiredScopeFor('get_crm_contacts')).toBe('crm:read');
    expect(requiredScopeFor('create_automation')).toBe('automations:write');
  });

  it('returns null for an unknown tool name', () => {
    expect(requiredScopeFor('nonexistent_tool')).toBeNull();
    expect(requiredScopeFor('')).toBeNull();
  });
});
