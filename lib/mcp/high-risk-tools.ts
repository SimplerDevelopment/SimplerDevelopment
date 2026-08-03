/**
 * High-risk MCP tool classifier.
 *
 * Per the ADR "Reconstructable retained argument capture for high-risk agent
 * tools" (`vault/04 - Decisions/ADR high-risk-agent-arg-capture.md`), the
 * high-risk set mirrors the GATE side of `ADR agent-write-approval-gate-matrix`
 * — the operations worth a human's approval are the same ones worth
 * reconstructing after the fact from an encrypted, access-controlled capture
 * (see `lib/mcp/telemetry.ts` -> `agentActionCaptures`).
 *
 * Pure + dependency-free: no DB, no crypto — unit-testable in isolation and
 * safe to import from any layer without pulling in heavier modules.
 */

/**
 * Explicit authority-mutation tools that don't reduce to a clean suffix
 * pattern. `team_remove_member` and `integrations_revoke` also satisfy the
 * suffix regex below — listed here too for clarity/documentation and so the
 * set stays the single source of truth for "authority mutation" tools.
 */
export const HIGH_RISK_TOOL_SET: ReadonlySet<string> = new Set([
  'team_update_role',
  'team_remove_member',
  'integrations_revoke',
]);

/**
 * Suffix patterns covering:
 *   - hard deletes / voids / removals / revocations: `_delete`, `_void`,
 *     `_remove_member`, `_revoke`
 *   - outbound sends: `_send`, `_schedule` (email_campaigns_send/schedule,
 *     proposals_send, etc.)
 */
const HIGH_RISK_SUFFIX_RE = /(_delete|_void|_remove_member|_revoke|_send|_schedule)$/;

/**
 * Returns true when `toolName` is in the ADR's GATE set — i.e. this tool
 * call should ADDITIONALLY get an encrypted, reconstructable argument
 * capture (on top of the existing hash + redacted-summary audit logs, which
 * every tool gets regardless of risk tier).
 */
export function isHighRiskTool(toolName: string): boolean {
  if (HIGH_RISK_TOOL_SET.has(toolName)) return true;
  return HIGH_RISK_SUFFIX_RE.test(toolName);
}
