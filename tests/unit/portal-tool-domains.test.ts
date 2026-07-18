// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/domains.ts.
 *
 * Covers:
 *  1. Completeness drift guard — PORTAL_TOOLS names vs TOOL_DOMAIN keys must
 *     stay in exact set-equality.
 *  2. toolsForDomains() — empty selection returns all tools; specific domains
 *     return only matching + baseline; baseline always present.
 *  3. domainOfTool() — known tools map correctly; unknown returns null.
 *  4. domainsOfToolCalls() — touched domains extracted, deduped, navigation excluded.
 */
import { describe, it, expect, vi } from 'vitest';

// `@/lib/db` throws at module load without DATABASE_URL. Stub it out so we
// can import the pure tool definitions in isolation (mirrors the pattern in
// ai-portal-tools-registry-baseline.test.ts and ai-portal-tools-domains.test.ts).
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: vi.fn() }));

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

import {
  TOOL_DOMAIN,
  BASELINE_TOOL_NAMES,
  toolsForDomains,
  domainOfTool,
  domainsOfToolCalls,
} from '@/lib/ai/portal-tools/domains';
import { PORTAL_TOOLS } from '@/lib/ai/portal-tools';

// ---------------------------------------------------------------------------
// 1. Completeness drift guard
// ---------------------------------------------------------------------------

describe('TOOL_DOMAIN completeness', () => {
  it('contains an entry for every tool in PORTAL_TOOLS and no extra keys', () => {
    const toolNames = new Set(PORTAL_TOOLS.map((t) => t.name));
    const domainKeys = new Set(Object.keys(TOOL_DOMAIN));

    const namesMissingFromMap = [...toolNames].filter((n) => !domainKeys.has(n));
    const keysMissingFromTools = [...domainKeys].filter((k) => !toolNames.has(k));

    expect(namesMissingFromMap).toEqual(
      [],
      `These PORTAL_TOOLS names are not in TOOL_DOMAIN — add them: ${namesMissingFromMap.join(', ')}`,
    );
    expect(keysMissingFromTools).toEqual(
      [],
      `These TOOL_DOMAIN keys have no matching tool in PORTAL_TOOLS — remove or rename them: ${keysMissingFromTools.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. toolsForDomains()
// ---------------------------------------------------------------------------

describe('toolsForDomains', () => {
  it('returns the full array unchanged when selected is empty', () => {
    const result = toolsForDomains([], PORTAL_TOOLS);

    // Fail-open path: same reference and same length
    expect(result).toBe(PORTAL_TOOLS);
    expect(result.length).toBe(PORTAL_TOOLS.length);
  });

  it("returns only billing tools + baseline when selected=['billing']", () => {
    const result = toolsForDomains(['billing'], PORTAL_TOOLS);

    // Every returned tool must be baseline or belong to billing
    for (const tool of result) {
      const domain = TOOL_DOMAIN[tool.name];
      const isBaseline = BASELINE_TOOL_NAMES.has(tool.name);
      expect(isBaseline || domain === 'billing').toBe(
        true,
        `Tool "${tool.name}" (domain: ${domain}) should not appear in a billing-only selection`,
      );
    }

    // A known billing tool must be present
    expect(result.map((t) => t.name)).toContain('get_my_invoices');

    // A non-billing tool must be absent
    expect(result.map((t) => t.name)).not.toContain('get_crm_contacts');
  });

  it("returns billing AND crm tools + baseline when selected=['billing','crm']", () => {
    const result = toolsForDomains(['billing', 'crm'], PORTAL_TOOLS);
    const names = result.map((t) => t.name);

    // Billing and CRM tools must both be present
    expect(names).toContain('get_my_invoices');
    expect(names).toContain('get_crm_contacts');

    // Every returned tool must be baseline, billing, or crm
    for (const tool of result) {
      const domain = TOOL_DOMAIN[tool.name];
      const isBaseline = BASELINE_TOOL_NAMES.has(tool.name);
      expect(isBaseline || domain === 'billing' || domain === 'crm').toBe(
        true,
        `Tool "${tool.name}" (domain: ${domain}) should not appear in a billing+crm selection`,
      );
    }
  });

  it("baseline tools always appear even when selecting ['surveys']", () => {
    const result = toolsForDomains(['surveys'], PORTAL_TOOLS);
    const names = result.map((t) => t.name);

    expect(names).toContain('get_dashboard_summary');
    expect(names).toContain('navigate_to');
  });
});

// ---------------------------------------------------------------------------
// 3. domainOfTool()
// ---------------------------------------------------------------------------

describe('domainOfTool', () => {
  it('returns "navigation" for navigate_to', () => {
    expect(domainOfTool('navigate_to')).toBe('navigation');
  });

  it('returns "billing" for get_my_invoices', () => {
    expect(domainOfTool('get_my_invoices')).toBe('billing');
  });

  it('returns null for an unknown tool name', () => {
    expect(domainOfTool('totally_fake_tool')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. domainsOfToolCalls()
// ---------------------------------------------------------------------------

describe('domainsOfToolCalls', () => {
  it('extracts unique domains, dedupes billing, and excludes navigation', () => {
    const calls = [
      { name: 'get_my_invoices' },   // billing
      { name: 'navigate_to' },        // navigation — should be excluded
      { name: 'get_crm_contacts' },   // crm
      { name: 'get_my_invoices' },    // billing duplicate
    ];

    const result = domainsOfToolCalls(calls);

    // Compare as sets: order is not guaranteed
    expect(new Set(result)).toEqual(new Set(['billing', 'crm']));

    // Length must be exactly 2 (deduped, navigation excluded)
    expect(result.length).toBe(2);
  });
});
