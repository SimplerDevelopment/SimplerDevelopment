/**
 * Shared blast-radius classification for AI-agent portal tools.
 *
 * Single source of truth for "which write operations are high-risk" per
 * the internal ADR "agent-write-approval-gate-matrix" (not part of this
 * public release). A tool is approval-required when it is irreversible, outbound, an authority/access
 * change, or financial. The SAME classification drives two behaviours:
 *
 *  - **Attended** agents (Portal AI chat, where a human is in the loop) STAGE
 *    these for approval instead of executing (see `executePortalTool` gate).
 *  - **Unattended** agents (inbound-email handler, automation engine) run on
 *    untrusted / third-party input with no interactive approver, so they must
 *    REFUSE these outright — path-level least-privilege. Queuing an approval
 *    per inbound email would just flood the queue with injection attempts.
 *
 * Benign, reversible edits (content/field updates, drafts, notes, reads) are
 * absent here and execute directly on every path.
 */

/**
 * Portal-tool names (see `PORTAL_TOOLS` in ./index.ts) whose blast radius
 * warrants human approval. Keep this list beside the tools it classifies; a new
 * high-risk tool must be added here at registration time.
 */
export const APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
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
]);

/** True when the named portal tool is high-blast-radius (see matrix ADR). */
export function isApprovalRequired(name: string): boolean {
  return APPROVAL_REQUIRED_TOOLS.has(name);
}

/**
 * Refusal payload returned to an unattended agent that attempts a high-risk
 * tool. Shaped like a normal tool result (carries `error`) so the agent loop
 * surfaces it to the user and moves on rather than crashing.
 */
export function unattendedRefusal(name: string): { error: string } {
  return {
    error:
      `The "${name}" action can't be completed automatically here. ` +
      `Publishing, sending, billing, team, and deal changes must be done in the ` +
      `portal by a signed-in user for security reasons.`,
  };
}
