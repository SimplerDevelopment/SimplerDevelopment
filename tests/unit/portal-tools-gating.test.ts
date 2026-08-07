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

// The barrel imports every domain handler → `@/lib/db`. `vi.mock` is hoisted
// above the imports below, so the static import is safe.
vi.mock('@/lib/db', () => ({ db: {} }));

import { APPROVAL_REQUIRED_TOOLS, isApprovalRequired, PORTAL_TOOLS } from '@/lib/ai/portal-tools';
import { unattendedRefusal } from '@/lib/ai/portal-tools/gating';

/**
 * The gate matrix, pinned. Since 2026-08-06 the classification is declared as
 * `requiresApproval: true` on each tool at its definition site and the set is
 * DERIVED from those flags — which means a stray annotation silently widens the
 * gate, and a deleted one silently opens a hole. This list is the deliberate
 * record from `vault/04 - Decisions/ADR agent-write-approval-gate-matrix.md`;
 * exact-set equality below forces any change to be an intentional edit here.
 */
const GATE_MATRIX = [
  // Publish-to-live (makes content publicly visible)
  'publish_page',
  // Outbound sends
  'send_crm_proposal',
  // Authority / access changes
  'invite_team_member',
  // Financial / billable commitments
  'pay_invoice',
  'request_service',
  // Creating or enabling autonomous authority — an agent that can author a
  // persistent automation rule can grant itself ongoing unattended reach.
  'create_automation',
  'toggle_automation',
  // Deal records — the "critical deal record" an injection would target.
  'create_crm_deal',
  'update_crm_deal',
];

describe('portal-tool gating classifier', () => {
  it('derives EXACTLY the gate matrix from the tool annotations', () => {
    // Not a subset check: an extra `requiresApproval` annotation anywhere in
    // lib/ai/portal-tools/ fails here, and so does a removed one.
    expect([...APPROVAL_REQUIRED_TOOLS].sort()).toEqual([...GATE_MATRIX].sort());
  });

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

  it('strips requiresApproval before the registry reaches the API', async () => {
    // `requiresApproval` is local metadata. The Anthropic tools API rejects
    // unknown keys in a tool definition, so leaking it would break every chat
    // call — and it would leak the gate matrix into the model's context.
    const { PORTAL_TOOLS } = await import('@/lib/ai/portal-tools');
    for (const t of PORTAL_TOOLS) {
      expect(t).not.toHaveProperty('requiresApproval');
    }
    expect(PORTAL_TOOLS.length).toBeGreaterThan(0);
  });

  it('returns an error-shaped refusal payload', () => {
    const r = unattendedRefusal('publish_page');
    expect(r).toHaveProperty('error');
    expect(r.error).toContain('publish_page');
  });
});

/**
 * Names starting with a mutating verb. Deliberately broad — this is a net for
 * catching new writes, not a classifier. Anything it catches must land in one
 * of the two buckets below.
 */
const MUTATING_VERB = /^(create|update|delete|move|send|publish|invite|request|toggle|log|reply|add)_/;

/**
 * Mutating tools reviewed against the gate matrix and judged benign: reversible,
 * internal, non-financial, no authority change. Each entry is a decision, not a
 * default — adding a name here means someone accepted that an AI agent (and an
 * unattended one, on the inbound-email path) may perform it without approval.
 */
const REVIEWED_BENIGN = new Set([
  // Draft/content edits — reversible, not publicly visible until publish_page
  'create_website_page', 'create_website_category', 'create_website_tag',
  'update_page_blocks', 'update_block_by_id', 'update_page_metadata',
  'create_booking_page', 'update_booking_page',
  'create_pitch_deck', 'update_pitch_deck_slide',
  'create_survey', 'update_survey',
  // CRM records — data entry, not the deal records the gate matrix protects
  'create_crm_contact', 'update_crm_contact', 'create_crm_company',
  'log_crm_activity', 'create_crm_proposal',
  // Email — authoring only; the outbound send is a separate, gated action
  'create_email_campaign', 'update_email_campaign',
  'add_email_subscriber', 'create_email_segment',
  // Internal collaboration — visible only inside the workspace
  'add_card_comment', 'create_project_card', 'update_project_card', 'move_project_card',
  'create_support_ticket', 'reply_to_ticket',
  'request_suggested_project', 'update_profile',
]);

describe('gate-matrix completeness', () => {
  /**
   * The hole the old hand-maintained list could not close: forgetting to
   * classify a new high-risk tool was SILENT. It shipped ungated on every path,
   * including the unattended ones. Now a new mutating tool fails CI until
   * someone puts it in a bucket deliberately.
   */
  it('leaves no mutating tool unclassified', () => {
    const unclassified = PORTAL_TOOLS.map((t) => t.name)
      .filter((n) => MUTATING_VERB.test(n))
      .filter((n) => !APPROVAL_REQUIRED_TOOLS.has(n) && !REVIEWED_BENIGN.has(n));
    expect(unclassified).toEqual([]);
  });

  it('carries no stale allowlist entries', () => {
    const live = new Set(PORTAL_TOOLS.map((t) => t.name));
    expect([...REVIEWED_BENIGN].filter((n) => !live.has(n))).toEqual([]);
  });

  it('never lets a tool sit in both buckets', () => {
    expect([...APPROVAL_REQUIRED_TOOLS].filter((n) => REVIEWED_BENIGN.has(n))).toEqual([]);
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
