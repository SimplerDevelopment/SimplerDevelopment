/**
 * Blast-radius classification for AI-agent portal tools — the refusal side.
 *
 * The classification itself is no longer a list in this file. It is declared on
 * each tool, at its definition site, via `requiresApproval` (see `./types`), and
 * `APPROVAL_REQUIRED_TOOLS` in `./index` is derived from those flags.
 *
 * Why it moved: this file used to hold a hand-maintained `Set` of nine tool
 * names, under a comment instructing the reader to "keep this list beside the
 * tools it classifies". It was not beside them — it was a separate module
 * listing bare strings, and nothing connected the two. Adding a high-risk tool
 * to `crm.ts` and forgetting this file produced a tool that silently executed on
 * every path, including the unattended ones. The flag now lives on the tool, so
 * the classification is visible in the diff that introduces the tool.
 *
 * The policy is unchanged and still governed by
 * `vault/04 - Decisions/ADR agent-write-approval-gate-matrix.md`: a tool is
 * approval-required when it is irreversible, outbound, an authority/access
 * change, or financial. `tests/unit/portal-tools-gating.test.ts` pins the
 * resulting set against that matrix, so annotating (or un-annotating) a tool
 * fails CI until the matrix is updated deliberately.
 *
 * This module stays free of imports so the refusal payload can be used without
 * pulling in the tool registry and its DB dependencies.
 */

/**
 * Refusal payload returned to an unattended agent that attempts a high-risk
 * tool. Shaped like a normal tool result (carries `error`) so the agent loop
 * surfaces it to the user and moves on rather than crashing.
 *
 * Unattended agents (inbound-email handler, automation engine) run on untrusted
 * third-party input with no interactive approver, so they refuse outright rather
 * than staging: queuing an approval per inbound email would just flood the queue
 * with injection attempts.
 */
export function unattendedRefusal(name: string): { error: string } {
  return {
    error:
      `The "${name}" action can't be completed automatically here. ` +
      `Publishing, sending, billing, team, and deal changes must be done in the ` +
      `portal by a signed-in user for security reasons.`,
  };
}
