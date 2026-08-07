/**
 * Shared shape for portal AI tool definitions.
 *
 * A `PortalTool` is an `Anthropic.Tool` plus optional local metadata that never
 * goes over the wire. The barrel strips the metadata when it assembles
 * `PORTAL_TOOLS`, so the payload the model sees is exactly `Anthropic.Tool`.
 */
import type Anthropic from '@anthropic-ai/sdk';

export type PortalTool = Anthropic.Tool & {
  /**
   * Marks this tool as high-blast-radius per the gate matrix in
   * `vault/04 - Decisions/ADR agent-write-approval-gate-matrix.md`: irreversible,
   * outbound, an authority/access change, or financial.
   *
   * Declare it HERE, on the tool, not in a list somewhere else. The set that
   * `./gating` enforces is derived from these flags — see the comment there for
   * why the list moved. Two behaviours key off it:
   *
   *  - **Attended** agents (portal AI chat, human in the loop) stage the call
   *    for approval instead of executing it.
   *  - **Unattended** agents (inbound email, automation engine) refuse it
   *    outright — there is no interactive approver, and queuing an approval per
   *    inbound email would just fill the queue with injection attempts.
   *
   * Benign, reversible edits (content/field updates, drafts, notes, reads) leave
   * this unset and execute directly on every path.
   */
  requiresApproval?: true;
};
