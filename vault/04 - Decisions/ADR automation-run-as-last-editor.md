---
type: adr
domain: automation
status: accepted
date: 2026-09-30
sources:
  - lib/automation/engine.ts
  - app/api/portal/automations/
  - lib/ai/portal-tools/index.ts
---

# ADR: An automation runs with the authority of whoever last edited it, and high-risk tools need its approval gate

## Status
Accepted — 2026-09-30 by the owner. Tracked as PUX-235.

## Context
Automation rules execute portal tools. The engine ran each tool as `payload._userId` (whoever fired the event), falling back to `rule.createdBy` (`lib/automation/engine.ts:457-468`). Meanwhile:
- any member could PATCH any rule's `actions`;
- `createdBy` was left unchanged;
- `requiresApproval` defaulted to false.

So a member could rewrite an owner-created scheduled rule to call `invite_team_member { role: 'admin' }`, and it would run *as the owner* — every caller check, including the PUX-229 fix, sees an owner. Automations were a way to borrow someone else's authority.

## Decision
- **Run as the last editor.** Every PATCH that changes a rule's trigger, conditions or actions re-stamps the rule's run identity to the editing user. The engine runs every tool with exactly that identity — never the original creator, never the event's triggering user. A rule cannot do anything its last editor couldn't do by hand.
- **High-risk tools need the rule's approval gate.** A tool flagged `requiresApproval` (irreversible, outbound, access-changing or financial — the same set `APPROVAL_REQUIRED_TOOLS` derives) only executes inside an automation when that rule's approval gate is on. Otherwise the run stages it for approval. This mirrors UAG-001 for inbound email.
- Editing automations is `admin` under the role matrix (ADR portal-role-matrix) once enforcement is on. That limits *who* can edit; this ADR limits *what* an edit can borrow. Both are needed.

## Rejected alternatives
- **Run as a capped system identity.** Stricter, but it silently changes what every existing rule can do, and it still needs the approval gate for high-risk tools.
- **Run as the triggering user.** Anyone who can cause an event (a form submission, an inbound email) would decide the authority a rule runs with.

## Consequences
- Existing rules keep running as their creator until first edited; a one-off backfill sets the run identity to `createdBy` explicitly so there is no NULL path.
- Approval summaries must show what the high-risk call will actually do (for an invite: the email AND the role), because the approver's click is now the authority (PUX-235 B5).
