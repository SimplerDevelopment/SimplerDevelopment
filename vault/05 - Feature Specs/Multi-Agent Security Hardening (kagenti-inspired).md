---
type: spec
domain: auth-security
status: validating
date: 2026-06-17
sources:
  - lib/mcp-auth.ts
  - app/api/mcp/route.ts
  - lib/automation/engine.ts
  - lib/oauth/server.ts
  - lib/oauth/scopes.ts
  - lib/plugins/jwt.ts
  - lib/plugins/manifest.ts
  - lib/plugins/callback-auth.ts
  - lib/security/assert-owned.ts
  - lib/active-client.ts
  - lib/db/schema/approvals.ts
  - lib/db/schema/brain.ts
  - lib/agentic-os/local-only.ts
---

# Feature: Multi-Agent Security Hardening (kagenti-inspired)

## Overview

SimplerDevelopment does not yet have a true multi-agent (agent-to-agent) topology — it has a **multi-entry-point authorization-consistency** problem. The MCP surface is well-guarded with per-tool scope checks; the automation engine hits the same portal tool layer with **no scope gate**. This feature closes that gap by adopting kagenti's *principles* (least-privilege per autonomous actor, on-behalf-of identity propagation, unified audit, gateway enforcement) while explicitly rejecting its *infrastructure* (SPIFFE/SPIRE workload identity, K8s namespace isolation, Istio mesh, a second A2A gateway) as a mismatch for a Next/Railway monorepo. See the companion [[ADR kagenti-least-privilege-not-workload-identity]].

## Domain context

Read first: [[Auth & Security]], [[Automations & Workflows]], [[MCP & Agentic OS]].

Invariants that constrain this feature:
- Blocks are universal; tenant isolation is enforced at the data layer via `clientId`/`siteId` on every row. `lib/security/assert-owned.ts` + `lib/active-client.ts` are the enforcement points.
- The existing `hasScope()` gate in `lib/mcp-auth.ts` is the scope vocabulary. Extend it — do not invent a parallel system.
- `lib/agentic-os/local-only.ts` hard-gates all agentic-OS routes to local dev (404 in prod). Do not bypass.
- Never hand-edit `drizzle/*.sql`; schema changes go in `lib/db/schema/` then `bun run db:generate`.

## Background — what "kagenti approach" means

Kagenti (IBM/Red Hat cloud-native agent platform) secures multi-agent systems via: (1) cryptographic agent workload identity (SPIFFE/SPIRE), (2) OAuth token-exchange / on-behalf-of identity propagation through agent-to-agent-to-tool chains (RFC 8693), (3) fine-grained per-tool least-privilege, audience-restricted, time-bound scopes, (4) a gateway enforcing authN/authZ + audit at the boundary, (5) namespace/tenant isolation, (6) full action attributability. We adopt the principles; we reject the infrastructure. See [[ADR kagenti-least-privilege-not-workload-identity]].

## Current-state trust surface map

| Surface | Identity model | Scope / authZ | Audit | Isolation |
|---|---|---|---|---|
| MCP API (`app/api/mcp/route.ts`, `lib/mcp-auth.ts`) | Per-user-per-client bearer (`sd_mcp_*` from `portalApiKeys`, or `sd_oauth_*`); `userId` + `clientId` propagated | Per-tool `hasScope()` gate; under-scoped tools not even registered; CMS writes staged by default (`requireCmsApproval`) | `mcp_pending_changes` (userId, keyId); `lastUsedAt`; no general direct-call log | Tenant resolved from token, cookie-independent |
| OAuth 2.1 (`lib/oauth/server.ts`, `lib/oauth/scopes.ts`) | Auth-code + PKCE(S256); token bound to one `(userId, clientId, scopes)` | Consent-screen scope approval; default read-only | `oauthAccessTokens` (hash only) | No RFC 8693 token exchange / OBO |
| Plugins (`lib/plugins/jwt.ts`, `lib/plugins/manifest.ts`, `lib/plugins/callback-auth.ts`) | 60s HMAC-SHA256 JWT per request; `{clientId, siteId, scopes, userId}` claims; plugins echo, never self-sign | `defaultScopes` ceiling, subset-only (`lib/plugins/manifest.ts` rejects superset); entitlement-gated | `registeredAppCallbacksAudit` (JTI UNIQUE, replay 409) | Network boundary only; no code sandbox |
| Automations (`lib/automation/engine.ts`) | `clientId` from rule row; `userId` from event or rule creator | **NO per-run scope restriction — full tenant tool access via `executePortalTool`** | `automation_logs` per firing | Tenant-isolated at data layer only |
| Brain AI | `clientId`/`userId` from context | Read: direct; AI writes staged via `brain_ai_review_items` human-review queue (`lib/db/schema/brain.ts`) | `brain_audit_logs` | Per-tenant |
| Agentic OS (`lib/agentic-os/local-only.ts`) | Admin NextAuth session | Admin/employee role; dev-only hard gate (404 in prod) | `agentic_os_runs` (created_by) | Local dev only, never prod |

## Gap analysis & requirements

### Must have

#### Gap 1 — Automation engine: per-run least-privilege scopes (highest value, low effort)
`lib/automation/engine.ts` calls `executePortalTool(...)` with no `hasScope()` equivalent. A misconfigured or compromised rule has full tenant tool capability.

- Add a `scopes` column to `automation_rules` (new Drizzle migration in `lib/db/schema/`).
- Route every automation tool dispatch through the existing `hasScope()` from `lib/mcp-auth.ts`.
- Default a rule's scope set to the minimum required by its configured actions (auto-derive + allow tightening).
- Run `bun run db:generate` after schema change; never hand-edit `drizzle/*.sql`.

#### Gap 3 — Unified agent-action audit log (medium value, cheap — ship with Gap 1)
Attribution is partial: `mcp_pending_changes` (staged CMS), `brain_audit_logs` (brain), `registeredAppCallbacksAudit` (plugins) — but direct non-staged MCP tool calls leave no row-level trace beyond `lastUsedAt`.

- Add an append-only `agent_action_log` table: `(keyId, userId, clientId, tool, paramsHash, outcome, ts)`.
- Front both the MCP dispatch path and the automation engine with a write to this table.
- Postgres (not a separate append store): enables attribution JOINs to `portalApiKeys` and `users`.

### Nice to have

#### Gap 2 — On-behalf-of / RFC 8693 token exchange (medium value, build when A2A appears)
OAuth server issues single-pair tokens with no delegation chain. The kagenti OBO pattern only earns its cost when a real agent-to-agent hop exists. Today no genuine delegation chain exists.

- Design the seam now: document where a token-exchange grant would slot into `lib/oauth/server.ts` + `lib/oauth/scopes.ts` and how `resource` (RFC 8707) audience indicators would be enforced.
- Build only when the second autonomous agent appears. Defer the implementation to Phase 2.

## Technical design

### Database changes
- `lib/db/schema/` — add `scopes` column to `automation_rules` (text array, nullable → default to auto-derived minimum).
- `lib/db/schema/` — new `agent_action_log` table (see Gap 3 above).
- Generate: `bun run db:generate`, apply: `bun run db:migrate`.

### API changes
- `lib/automation/engine.ts` — inject `hasScope()` check before each `executePortalTool(...)` call; read `rule.scopes`; reject out-of-scope actions with a log row.
- `app/api/mcp/route.ts` (and/or the dispatcher it calls) — add `agent_action_log` write for direct (non-staged) tool calls.
- No new routes required; `app/api/mcp/route.ts` already IS the gateway — extend it, do not build a second one.

### Portal / Admin UI
- Automation rule editor: expose the `scopes` field; show auto-derived minimum; allow author to restrict further.
- Audit UI: surface `agent_action_log` entries per key/client (nice-to-have for Phase 1, required for Phase 2).

### Public site / blocks
Not applicable. Blocks are universal; this feature adds no block types.

### MCP exposure
Not applicable. This feature tightens the existing MCP gate; it does not add new MCP tools.

## Scaffolds to use
- `simplerdev-feature-scaffold` for the `agent_action_log` CRUD resource (schema + route + e2e lockstep).
- No new block types; `simplerdev-block-type` not needed.

## Suggested phasing
- **Phase 1 (now-ready):** Gap 1 (automation scope gate) + Gap 3 (unified audit log) — related, ship together.
- **Phase 2 (when A2A appears):** Gap 2 (OBO token-exchange grant implementation).
- **Phase 3 (conditional):** Plugin code sandbox — only if third-party plugin code execution is introduced.

## Phase 1 implementation — commit 2f10f49d (IMPLEMENTED, unit-verified 122/122)

### Artifacts

- **Schema + migration:** `lib/db/schema/brain.ts` — added `automation_rules.scopes` (json string[]) + new `agent_action_log` table; migration `drizzle/0011_agent_action_log_and_automation_scopes.sql`.
- **Scope registry:** `lib/ai/portal-tools/scopes.ts` — `PORTAL_TOOL_SCOPES` map + `requiredScopeFor()` covering all 81 portal-tool handlers; completeness drift test at `tests/unit/portal-tools-scopes.test.ts`.
- **Enforcement:** `lib/automation/engine.ts` — `isActionAllowed()` helper + scope gate before `executePortalTool`; denials recorded to audit log and never executed.
- **Defaults + backfill:** `lib/ai/portal-tools/derive-rule-scopes.ts` — `deriveRuleScopes()` wired into all rule write-paths: `lib/ai/portal-tools/automations.ts`, `app/api/portal/automations/route.ts`, `app/api/portal/automations/[id]/route.ts`, `lib/mcp/tools/automations.ts`; idempotent backfill script at `scripts/migrations/backfill-automation-rule-scopes.ts` (supports `--dry-run`).
- **Audit log:** `lib/audit/agent-action-log.ts` — `logAgentAction()` + `hashParams()` at two choke points: `executePortalTool` in `lib/ai/portal-tools/index.ts` (automation/assistant context) and a `registerTool` wrapper in `lib/mcp/server.ts` (MCP context).

### Validation results (Phase 1 — local run, 2026-06-17, code 2f10f49d / docs e4c6a028)

#### Unit (bun test — 5 specs)

122/122 pass. Specs: `tests/unit/portal-tools-scopes.test.ts`, `tests/unit/derive-rule-scopes.test.ts`, `tests/unit/agent-action-log.test.ts`, `tests/unit/automation-scope-gate.test.ts`, `tests/unit/ai-portal-tools-registry-baseline.test.ts`. **Green.**

#### Tenancy gate (bun test:tenancy, local isolated DB)

406 passed / 9 failed. All 9 failures are pre-existing missing-env-var config gaps (`WORKSPACE_TENANT_SECRETS_KEY`, `RESEND_API_KEY`) in unrelated domains (integrations/google, oauth-clients, public booking). None touch the changed surfaces (`agent_action_log`, `automation_rules`, `executePortalTool`, `logAgentAction`). **Verdict: no regression.**

#### Critical E2E (bun test:critical, local improvised env against simplerdev_e2e DB)

281 passed / 149 failed. All 149 failures cascade from a single environmental fault: login returns HTTP 500 for the seeded client, causing every authenticated test to fail downstream (e.g. "Cannot destructure property 'clients' of res.data.data"). The auth/login path imports none of the changed surfaces; grep for automation/audit/scope in failures is empty. **Verdict: no regression attributable to Phase 1.** Faithful critical-e2e sign-off is deferred to CI — the local env lacks several integration secrets and has an auth-500 config gap.

Positive signals from this run: migration `drizzle/0011_agent_action_log_and_automation_scopes.sql` applies cleanly to a real Postgres (264 tables built via drizzle-kit push), the app builds and boots (281 passing tests prove brain.ts/imports are sound), and `scripts/migrations/backfill-automation-rule-scopes.ts` ran correctly against seeded rules.

#### Orthogonal finding (Phase-1 follow-up consideration)

Seeded automation rules call action tools (`assign_ticket`, `send_notification`, `send_email`) that are not in the 81-tool portal-tools registry, so `requiredScopeFor()` returns `null` and the scope gate passes them through without a false denial. This reveals a vocabulary gap: the automation action set can diverge from the portal-tools handler set — the scope gate only covers actions that are real portal-tools handlers. No security regression today (unrecognized tools pass through as before), but a future phase may need to reconcile the two vocabularies or extend scope coverage to non-portal-tools action kinds.

### Remaining before Phase 1 is fully done

1. ~~Run `bun test:tenancy`~~ DONE locally (9 pre-existing env-var failures, none on changed surfaces; see results above). Faithful run will re-confirm in CI.
2. Run `bun test:critical` in CI — local env has an auth-500 config gap that cannot be resolved without the full integration secrets; CI is the authoritative gate.
3. Hand-apply migration `drizzle/0011_agent_action_log_and_automation_scopes.sql` to prod.
4. Run `scripts/migrations/backfill-automation-rule-scopes.ts` against prod to populate `scopes` on existing rules.

## Out of scope (rejected — see ADR)
- SPIFFE/SPIRE workload identity and mTLS mesh.
- A second A2A gateway (`app/api/mcp/route.ts` + scope guards already are the gateway).
- A new tenant-isolation layer (already solid: token-resolved tenant, `lib/security/assert-owned.ts`, `bun test:tenancy` gate).
- Full RFC 8693 implementation (premature; no A2A hop today).

## Open questions
- Should automation `scopes` default to the union of its actions' required scopes (auto-derived) or be explicitly author-set with validation? (Recommendation: auto-derive + allow tightening.)
- Does the unified audit log belong in Postgres (queryable, JOINs to keys/users) or a cheaper append store? (Recommendation: Postgres for attribution JOINs.)
- For OBO (Phase 2): adopt full RFC 8693 or a lighter internal attenuated-token scheme? Defer until Phase 2.

## Validation plan
Per [[06 - Validation/Gate Picking|Gate Picking]]:
- `bun test:tenancy` after any data-access change (new `automation_rules.scopes` column and `agent_action_log` table both qualify).
- Unit coverage on the new `hasScope()` injection in the automation engine.
- `mcp-tool-registry-baseline` test must still pass (extending dispatch, not adding/removing tools).
- `bun test:critical` before declaring Phase 1 done.
