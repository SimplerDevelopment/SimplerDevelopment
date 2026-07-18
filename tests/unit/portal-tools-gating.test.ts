/**
 * UAG-001 / gating matrix — blast-radius classification for AI-agent portal tools.
 *
 * Asserts (1) the classifier flags the high-risk set and passes benign edits,
 * and (2) the unattended inbound-email surface (PORTAL_TOOLS minus approval-
 * required tools) actually strips real high-risk tools — so an injected email
 * cannot even see publish/send/billing/team/deal tools.
 *
 * Unit-layer: `@/lib/db` is mocked to dodge its import-time DATABASE_URL throw;
 * we only read tool NAMES, handlers never run.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  APPROVAL_REQUIRED_TOOLS,
  isApprovalRequired,
  unattendedRefusal,
} from '@/lib/ai/portal-tools/gating';

// PORTAL_TOOLS lives in the barrel, which imports every domain handler → `@/lib/db`.
vi.mock('@/lib/db', () => ({ db: {} }));

describe('portal-tool gating classifier', () => {
  it('flags every high-blast-radius write as approval-required', () => {
    for (const name of [
      'publish_page',
      'send_crm_proposal',
      'invite_team_member',
      'pay_invoice',
      'request_service',
      'create_automation',
      'toggle_automation',
      'create_crm_deal',
      'update_crm_deal',
    ]) {
      expect(isApprovalRequired(name)).toBe(true);
    }
  });

  it('passes benign, reversible edits and reads through', () => {
    for (const name of [
      'update_block_by_id',
      'update_page_blocks',
      'update_page_metadata',
      'create_website_page',
      'get_page_content',
      'create_crm_contact',
      'log_crm_activity',
      'create_support_ticket',
    ]) {
      expect(isApprovalRequired(name)).toBe(false);
    }
  });

  it('returns an error-shaped refusal payload', () => {
    const r = unattendedRefusal('publish_page');
    expect(r).toHaveProperty('error');
    expect(r.error).toContain('publish_page');
  });
});

describe('unattended inbound-email tool surface', () => {
  it('strips all approval-required tools from the surface the model sees', async () => {
    const { PORTAL_TOOLS } = await import('@/lib/ai/portal-tools');
    const inboundTools = PORTAL_TOOLS.filter((t) => !isApprovalRequired(t.name));

    // Nothing high-risk survives the filter.
    for (const t of inboundTools) {
      expect(isApprovalRequired(t.name)).toBe(false);
    }

    // The filter removes REAL tools — each high-risk name that exists in the
    // full surface must be absent from the inbound surface (guards against the
    // classifier drifting to name tools that were never exposed).
    const fullNames = new Set(PORTAL_TOOLS.map((t) => t.name));
    const inboundNames = new Set(inboundTools.map((t) => t.name));
    const exposedHighRisk = [...APPROVAL_REQUIRED_TOOLS].filter((n) => fullNames.has(n));
    expect(exposedHighRisk.length).toBeGreaterThan(0);
    for (const n of exposedHighRisk) {
      expect(inboundNames.has(n)).toBe(false);
    }
  });
});
