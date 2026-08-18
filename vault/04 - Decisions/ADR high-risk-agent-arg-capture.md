---
type: adr
domain: auth-security
status: accepted
date: 2026-07-10
accepted_date: 2026-07-12
retention_days: 90
decision_card: AAF-002 (project 199)
sources:
  - lib/audit/agent-action-log.ts
  - lib/mcp/audit-redact.ts
  - lib/mcp/telemetry.ts
  - lib/crypto/api-key.ts
  - lib/db/schema/audit.ts
related_adr:
  - ADR kagenti-least-privilege-not-workload-identity
---

# ADR: Reconstructable retained argument capture for high-risk agent tools

## Status

Accepted 2026-07-12 (Dan, via decision card AAF-002). Confirmed decisions: high-risk set =
the GATE set of [[ADR agent-write-approval-gate-matrix]] (`APPROVAL_REQUIRED_TOOLS` + the MCP
`:delete`/destructive scope tier); envelope encryption via `lib/crypto/api-key.ts`; decryption
restricted to owner/super-admin (security role) with every read audit-logged; **90-day** retention
then hard-purge the ciphertext. Feeds AAF-001 (implementation).

## Context

The kagenti Phase-1 work ([[ADR kagenti-least-privilege-not-workload-identity]]) established the invariant: **agent tool-call params are SHA-256 hashed, never stored raw** (`lib/audit/agent-action-log.ts`, `hashParams()`). A parallel operational log (`agent_audit_logs` via `lib/mcp/audit-redact.ts`) keeps a redacted, 4096-byte-truncated copy. Both are fire-and-forget (`void db.insert(...).catch(...)`) so logging never blocks a tool call.

This is correct for privacy and availability but leaves a forensics gap that matters precisely in the scenario this whole security effort is about — a suspected prompt-injection incident. With a hash you can **verify** a guessed argument set (re-hash and compare) but you cannot **reconstruct** what the agent actually sent: the full recipient list and body of a campaign it was tricked into sending, the exact fields of a deal it overwrote. "What precisely did the agent do?" is unanswerable from the audit trail alone.

The tension is real: storing raw args for *every* tool call re-introduces exactly the PII/secret-sprawl the hash-only rule was designed to prevent.

## Decision

Carve out a **high-risk tool set** for which we additionally store a **reversible, encrypted, access-controlled, retention-bounded** full-argument record. The hash log and redacted log are unchanged for everything (including high-risk tools — the encrypted record is *additive*, not a replacement).

This **amends** the kagenti invariant, narrowly:

> ~~params are never stored raw~~ → params are never stored raw **in plaintext**; high-risk tools additionally store an **encrypted** reconstructable record readable only by an authorized security role, purged on a retention schedule.

**High-risk tool set (initial):**
- Outbound sends: `email_campaigns_send`/`schedule`, `proposals_send`, any `email:send` tool
- Hard deletes / voids: `crm_deals_delete`, `posts_delete`, `contracts_void`, `team_remove_member`
- Financial / authority mutations: billing/invoice changes, `integrations_revoke`, `team_update_role`

This set mirrors the "GATE" side of the [[ADR agent-write-approval-gate-matrix]] — the operations worth a human's approval are the same ones worth reconstructing after the fact.

**Mechanism:**
- Encrypt with the existing envelope pattern (`lib/crypto/api-key.ts`), not a new crypto system. Store ciphertext in a new column/table keyed to the `agent_action_log` row.
- **Preserve fire-and-forget** — the encrypted write is `void ... .catch()` like the existing logs; a capture failure must never block or delay the tool call.
- **Access control:** decryption is available only to a super-admin / security role, and every read is itself audit-logged.
- **Retention:** **90 days** (confirmed via AAF-002), then hard-purge the ciphertext (hash + redacted logs persist longer for trend/attribution). A purge cron (mirroring `expire-mcp-pendings`) enforces the window. Confirm against any DPA / compliance obligation before ship.

## Consequences

**Easier:**
- Post-incident, an authorized responder can reconstruct exactly what a high-risk call sent — the difference between "an email went out" and "here is the email that went out."
- Scope is bounded to the operations that warrant it, so the privacy blast radius is small and enumerable.

**Harder / accepted trade-offs:**
- Reversible plaintext (even encrypted) is a higher-value target than a hash — mitigated by envelope encryption at rest, role-gated + audit-logged decryption, and bounded retention.
- Compliance surface: the captured args may contain client PII, so this must be reflected in the privacy policy / DPA and the retention window honored by a purge job. This is a prerequisite, not an afterthought.
- One more schema object and a purge job to maintain.

**New invariants:**
- The encrypted capture is additive and fire-and-forget; it never gates a tool call.
- Decryption is role-gated and every access is logged. No un-audited read path.
- The high-risk set is defined here; adding a tool to it is a deliberate, reviewed change, not a default.

## Alternatives considered

**Store raw args for all tools:** rejected — reinstates the secret/PII sprawl the hash-only rule prevents, across hundreds of tools.

**Keep hash-only, reconstruct from DB state after an incident:** rejected as sole strategy — DB state shows the *result* (a deal's current values, a campaign row) but not the *exact submitted arguments*, and for a send the outbound content may not be fully recoverable from state at all.

**Widen the redacted `agent_audit_logs` cap and stop redacting:** rejected — that log is operational/queryable and not access-gated; loosening it exposes args broadly rather than to a security role under audit.

## Related

- [[ADR kagenti-least-privilege-not-workload-identity]] — establishes the hash-only invariant this amends
- [[ADR agent-write-approval-gate-matrix]] — the high-risk set here mirrors the GATE set there
- Project: 199 (Agent Audit & Forensics), card AAF-001 implements this
