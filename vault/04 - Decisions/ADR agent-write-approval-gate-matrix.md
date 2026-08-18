---
type: adr
domain: auth-security
status: accepted
date: 2026-07-10
accepted: 2026-07-11
decision_card: MEB-005 (project 197)
sources:
  - lib/mcp/pending-changes.ts
  - lib/mcp/approvals.ts
  - lib/mcp/tools/crm.ts
  - lib/mcp/tools/email.ts
  - lib/ai/portal-tools/index.ts
  - app/api/email/inbound/route.ts
  - lib/automation/engine.ts
related_adr:
  - ADR kagenti-least-privilege-not-workload-identity
  - ADR approval-preview-page-scoped-token
---

# ADR: Which agent write-operations require human approval (op→gate matrix)

## Status

Accepted (2026-07-11) — adopted with the recommended defaults below when the operator directed completing project 197 (MEB-005), which the downstream cards depend on. Decision card MEB-005; unblocks MEB-001/002/004/006 and the Unattended & Internal-Agent Gating project (198). Revisit the specific op→gate assignments if real usage shows the friction/coverage balance is wrong.

## Context

Two distinct controls exist in this codebase and are easily conflated:

1. **Scope gate** (`hasScope()`) — decides *which tools* a credential may call at all. Already enforced on the MCP surface and, since the Phase-1 kagenti work (commit `2f10f49d`, [[ADR kagenti-least-privilege-not-workload-identity]]), on the automation engine via `PORTAL_TOOL_SCOPES`.
2. **Approval / staging gate** (`stageOrApply` → `mcp_pending_changes` → `applyPendingChange`) — decides whether a *permitted* write executes immediately or is deferred for a human to approve. This is the decision→execution boundary.

This ADR is about **control #2 only.** Today its coverage is narrow and inconsistent:

- Gated (stage-eligible): a curated set of CMS, pitch-deck, email-campaign, and CRM-*proposal* writes.
- **Ungated (execute inline, no staging path exists):** all CRM deal/contact/company writes (`crm_deal`/`crm_contact` aren't even in the `EntityType` union), `email_campaigns_schedule`, `team_invite`/`update_role`/`remove_member`, `integrations_revoke`, plus every internal-agent path (Portal AI web/stream chat, Brain agent, inbound-email handler, automation engine).

"Gate everything" is unusable — it would put an approval click in front of every description edit, which is the friction that kept CRM out of the gate in the first place. "Gate nothing" is the current hole. We need one canonical, path-independent policy for **which operations are stage-eligible.**

## Decision

Adopt a **blast-radius gating matrix.** An operation is gate-eligible (stages for human approval when the caller's approval policy is active) if it is **irreversible, outbound, or an authority change.** Benign, reversible, internal edits execute directly.

**GATE (stage for approval):**

| Category | Operations |
|---|---|
| Hard deletes / voids | `crm_deals_delete`, `posts_delete`, `decks_delete`, `block_templates_delete`, `contracts_void`, `crm_deal_comments_delete`, `email_campaigns_delete` |
| Outbound sends | `email_campaigns_send`, `email_campaigns_schedule`, `proposals_send`, `send_crm_proposal` (when it triggers dispatch), any future `email:send`-scoped tool |
| Irreversible state changes | `crm_deals_move_stage` → **closed_won / closed_lost only**, `sites_publish_custom_code`, `nav_publish_all`, publishing a post/deck to a live public site |
| Authority / access changes | `team_invite`, `team_update_role`, `team_remove_member`, `integrations_revoke` |

**PASS-THROUGH (execute directly):**

- Field/description/metadata updates on deals, contacts, companies, posts (draft), decks (draft)
- Add note / comment / activity / artifact link
- Create a **draft** (campaign, post, deck, proposal) — the *send/publish* is the gated step, not the drafting
- Taxonomy create (category/tag), custom-field definition edits

**The matrix is path-independent.** The same op→gate decision applies whether the caller is the external MCP agent, Portal AI chat, the Brain agent, the inbound-email handler, or the automation engine. What differs per path is only whether the gate is *armed*:

- External MCP: armed by the credential's `require_cms_approval` flag (see MEB-006).
- Internal chat / inbound-email / automation: armed by the per-client / per-op policy that replaces the binary `AI_TOOL_APPROVALS_ENABLED` flag (UAG-003), with a **default-armed** posture for the inbound-email and automation paths because their input is outside-controllable (UAG-001/002).

`crm_deals_move_stage` to a non-terminal stage is pass-through; only the terminal (won/lost) transitions gate, because those are the ones with revenue/reporting consequences and are effectively irreversible in downstream automations.

## Consequences

**Easier:**
- One matrix answers "does this stage?" for every implementation card across projects 197 and 198 — no per-card re-litigation of the friction tradeoff.
- Routine CRM/CMS editing stays friction-free, which is what keeps gating from being switched off.
- The dangerous, injection-relevant operations (send a client email, delete a deal, change access) are the ones that get a human — directly answering the "what enforces the boundary?" question.

**Harder / accepted trade-offs:**
- A determined operator doing many legitimate deletes/sends now hits approval friction — mitigated by the Bulk Approval Review UX project (200), which is a prerequisite for gating at volume.
- The won/lost carve-out on `move_stage` adds a value-dependent branch to the gate check rather than a flat per-tool rule; accepted because a flat rule would either gate all stage moves (friction) or none (miss the irreversible ones).

**New invariants:**
- Any new write tool must be classified into this matrix (gate vs pass-through) at registration time; the classification lives beside the tool, not in a separate list that drifts.
- The matrix is the single source of truth for stage-eligibility across all agent execution paths. Do not add a path-specific gating policy that diverges from it.

## Alternatives considered

**Gate by scope tier only (write vs delete):** insufficient — an `email_campaigns_send` is a `write`, not a delete, yet it's the highest-blast-radius outbound op. Blast radius, not CRUD verb, is the right axis. (The delete/write scope split in MEB-004 is complementary least-privilege, not a substitute for this matrix.)

**Gate everything, rely on bulk-approve to manage friction:** rejected as the default — even with bulk approve, a click-per-benign-edit trains reviewers to rubber-stamp, which destroys the signal on the operations that actually matter.

**Per-client fully-configurable matrix from day one:** deferred — ship this fixed default first; a per-client override surface can come later if a client demands looser or stricter posture. Over-configurability now is unused machinery.

## Related

- [[ADR kagenti-least-privilege-not-workload-identity]] — the scope-gate layer this sits on top of
- [[ADR approval-preview-page-scoped-token]] — the tokenized no-login approval path staged changes can use
- Projects: 197 (MCP External-Agent Boundary), 198 (Unattended & Internal-Agent Gating), 200 (Bulk Approval Review UX)
- Gate: `bun test:tenancy` (data-access changes), `mcp-tool-registry-baseline` (tool registration)

## Amendment — 2026-08-06: the invariant is now enforced, not just stated

This ADR's invariant read: *"the classification lives beside the tool, not in a
separate list that drifts."* The code did not do that. `lib/ai/portal-tools/gating.ts`
held a hand-maintained `Set` of nine tool-name strings in its own module, under a
comment instructing the reader to keep the list beside the tools it classified.
Nothing connected the two. Adding a high-risk tool to a domain module and
forgetting `gating.ts` produced a tool that executed ungated on **every** path,
including the unattended ones — silently.

The decision is unchanged; the implementation caught up:

- `requiresApproval: true` is declared on the tool definition itself (`./types`),
  so the classification appears in the diff that introduces the tool.
- `APPROVAL_REQUIRED_TOOLS` is **derived** from those flags in `./index`. There is
  no hand-maintained list left to drift.
- `PORTAL_TOOLS` strips the flag, so the wire shape sent to the model is
  unchanged — the gate matrix never enters the model's context.
- `tests/unit/portal-tools-gating.test.ts` pins the derived set to this matrix by
  exact equality, so widening or narrowing the gate is a deliberate edit.

It also closes the failure mode neither the old list nor the annotation alone
could catch — **forgetting to classify at all**. A completeness test requires every
tool whose name starts with a mutating verb to be either annotated or present in a
reviewed-benign allowlist. A new mutating tool fails CI until someone picks a
bucket. The 29 currently-benign entries are each a recorded decision that an AI
agent — including an unattended one on the inbound-email path — may perform that
action without approval.

`unattendedRefusal` stays in `gating.ts`, which is now import-free so the refusal
payload does not drag in the tool registry and its DB dependencies. The audit
trail (`logAgentAction`) and approval staging (`stageOrApply`) are untouched.
