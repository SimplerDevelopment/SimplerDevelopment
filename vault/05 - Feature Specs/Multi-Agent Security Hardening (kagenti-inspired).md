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
  - app/oauth/token/route.ts
  - app/.well-known/oauth-authorization-server/route.ts
  - app/.well-known/oauth-protected-resource/route.ts
  - lib/db/schema/audit.ts
  - lib/ai/portal-tools/scopes.ts
  - lib/ai/portal-tools/derive-rule-scopes.ts
  - scripts/migrations/backfill-automation-rule-scopes.ts
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

#### Orthogonal finding — RESOLVED (commit 22084e61, PR #42)

**Original observation:** seeded automation rules call action tools (`assign_ticket`, `send_notification`, `send_email`) not in the 81-tool portal-tools registry, raising a vocabulary-gap concern.

**Audit result (reframing):** The flagged tool names are harmless no-ops. They are not registered portal-tool handlers, so they fall through to `executePortalTool` and return "Unknown tool" — they never executed real logic. They are seed-fixture names only, not a security gap.

**The real gap (discovered and shipped):** The automation engine's two special-case action branches — `start_playbook` and `run_plugin_script` in `lib/automation/engine.ts` — exited BEFORE the Phase-1 scope gate, so any rule (even one with `scopes: []`) could start a Brain playbook or enqueue a plugin script un-gated:
- `start_playbook` had no scope control of any kind.
- `run_plugin_script` had a client-entitlement check but no scope check.

**Fix shipped (commit 22084e61):**
- Added `AUTOMATION_ACTION_SCOPES` in `lib/ai/portal-tools/scopes.ts` mapping `start_playbook → brain:write` and `run_plugin_script → automations:write`; consulted by `requiredScopeFor()`.
- Kept `AUTOMATION_ACTION_SCOPES` separate from `PORTAL_TOOL_SCOPES` to preserve the 1:1 parity between `PORTAL_TOOL_SCOPES` and `HANDLERS` (the completeness drift test must not diverge).
- Hoisted the scope gate in `lib/automation/engine.ts` ABOVE both special-case branches so they are now gated before any execution. `run_plugin_script` retains its client-entitlement check as a second defense layer.
- `deriveRuleScopes` in `lib/ai/portal-tools/derive-rule-scopes.ts` automatically covers these action kinds — existing rules using `start_playbook` or `run_plugin_script` get their derived scopes on the next backfill run.
- Tests: special-case gating covered in `isActionAllowed` unit tests + a `runRule` integration test asserting `startRun` is NOT called without `brain:write`. 40/40 unit tests pass.

### Remaining before Phase 1 is fully done

1. ~~Run `bun test:tenancy`~~ DONE locally (9 pre-existing env-var failures, none on changed surfaces; see results above). Faithful run will re-confirm in CI.
2. Run `bun test:critical` in CI — local env has an auth-500 config gap that cannot be resolved without the full integration secrets; CI is the authoritative gate.
3. Hand-apply migration `drizzle/0011_agent_action_log_and_automation_scopes.sql` to prod.
4. Run `scripts/migrations/backfill-automation-rule-scopes.ts` against prod to populate `scopes` on existing rules. **Must be re-run after commit 22084e61** — `start_playbook` and `run_plugin_script` rules created before that commit will not yet carry their derived scopes (`brain:write` / `automations:write`); without the re-run they would be denied at the now-hoisted gate. Use `--dry-run` first to verify the diff before applying.

## Phase 2 — OBO / token-exchange seam (design)

**Status:** resource enforcement = implementing now (Phase 2 prerequisite); token-exchange grant = designed, deferred until first real A2A hop.

### Why this is a seam-design, not an implementation

No real agent-to-agent / on-behalf-of hop exists in the codebase today. The OAuth server (`app/oauth/token/route.ts`) supports only the `authorization_code` grant — a single equality check at line 57 (`if (grantType !== 'authorization_code')`) rejects everything else. The MCP server, automation engine, and Brain/RAG all act via direct DB queries or server-side credentials; none forward a user's token downstream to another agent. The only delegation surface is the plugin JWT (`lib/plugins/jwt.ts`, minted in middleware.ts) — a closed portal→plugin handshake that never calls back into the OAuth server. Building the full token-exchange grant now would be speculative machinery; this section records the exact seam so it can be assembled the day a real hop appears (most likely a plugin calling back into the MCP server on the user's behalf).

### Phase 2 prerequisite — RFC 8707 resource / audience enforcement (in progress)

`oauthAccessTokens.resource` (`lib/db/schema/audit.ts` line 80) is STORED at issuance (propagated from the authorization code through the token insert at `app/oauth/token/route.ts` lines 160–169) but is NOT enforced in `lib/mcp-auth.ts` `resolveOAuthToken`. A token bound to one audience is accepted at any MCP endpoint today. The comment in `app/.well-known/oauth-authorization-server/route.ts` (lines 27–28) explicitly notes this: "We persist and echo it but don't currently constrain tokens by audience beyond that."

The Phase 2 prerequisite closes this gap: in `lib/mcp-auth.ts` `resolveOAuthToken`, after the token row is fetched, enforce that if `token.resource` is non-null it must match the MCP endpoint's canonical resource URL. `null` resource = unrestricted (backward-compatible with tokens issued before this enforcement). This standalone hardening ships independently of the token-exchange grant and is also the prerequisite for token-exchange resource-downscoping.

### The seam — where token-exchange slots in when built

#### 1. Grant dispatch — `app/oauth/token/route.ts`

Replace the single equality check at line 57 with a dispatch map:

```
// today (line 57):
if (grantType !== 'authorization_code') { ... }

// when built:
const SUPPORTED_GRANTS = ['authorization_code', 'urn:ietf:params:oauth:grant-type:token-exchange'];
if (!SUPPORTED_GRANTS.includes(grantType)) { ... }
// then route to handleAuthorizationCodeGrant() or handleTokenExchangeGrant()
```

The `handleTokenExchangeGrant` handler must:
- Validate `subject_token` — an existing `sd_oauth_*` or `sd_mcp_*` token, looked up via the same hash path as `resolveOAuthToken` / `resolvePortalApiKey` in `lib/mcp-auth.ts`.
- Accept optional `actor_token` — the requesting agent's own bearer token (RFC 8693 §2.1).
- Enforce scope downscoping: `requested_scopes ⊆ subject_token.scopes` — the exchange cannot elevate privilege.
- Enforce resource downscoping: if `resource` is present, it must be a subset of the subject token's bound resource — links directly to the RFC 8707 enforcement prerequisite above.
- Insert a new `oauthAccessTokens` row for the issued delegation token.

#### 2. Schema additions — `lib/db/schema/audit.ts`

Two NULLABLE columns on `oauthAccessTokens` suffice for single-hop delegation:

- `subjectTokenId` — FK → `oauthAccessTokens.id` (the token being exchanged; enables audit lineage: "this token was derived from that token").
- `actorClientId` — `varchar` carrying the `client_id` of the agent that performed the exchange (RFC 8693 `act` claim analogue; FK to `oauthClients.clientId`).

A separate `oauthDelegationChain` join table is only warranted for queryable multi-hop lineage, which is out of scope until multi-hop is real.

Schema change requires: edit `lib/db/schema/audit.ts`, then `bun run db:generate`, never hand-edit `drizzle/*.sql`.

#### 3. Discovery — `app/.well-known/oauth-authorization-server/route.ts`

At line 20, `grant_types_supported: ['authorization_code']` — add the token-exchange grant URN when the handler is implemented:

```
grant_types_supported: ['authorization_code', 'urn:ietf:params:oauth:grant-type:token-exchange'],
```

Do not add it before the handler exists; discovery truthfully reflects capability.

#### 4. Scopes — `lib/oauth/scopes.ts`

Optionally add a `delegation:use` or `agent:act` scope to gate which tokens are eligible as `subject_token` or `actor_token` in an exchange. Tokens without this scope cannot be used as the subject of an exchange. This is optional — the downscoping enforcement at the handler level is the primary guard.

#### 5. Plugin JWT — `lib/plugins/jwt.ts`

`PluginJwtClaims` (lines 51–60) has no `act` claim today. When a plugin calls back into the MCP server on a user's behalf, add an optional `act` field to carry delegation provenance per RFC 8693 §4.4:

```typescript
export interface PluginJwtClaims {
  // ... existing fields ...
  /** RFC 8693 §4.4 — present when the plugin is acting on behalf of a user.
   *  sub carries the user; act.sub carries the plugin's own identity. */
  act?: { sub: string; client_id?: string };
}
```

`signPluginJwt` would accept and embed this claim; `verifyPluginJwt` would surface it in the returned claims object for the callback-auth layer to propagate.

### Open questions (Phase 2 scope)

- Adopt full RFC 8693 (standard `act` / `may_act` claims, token chaining) or a lighter internal attenuated-token scheme? Full RFC 8693 is recommended — the seam above already follows it, and it keeps the OAuth server standards-conformant.
- Should `delegation:use` be a new scope or should all `sd_oauth_*` tokens be eligible as subject tokens by default (guarded only by downscoping logic)? Defer until the first caller.
- Multi-hop (agent A exchanges → agent B exchanges → tool): a second NULLABLE `actorTokenId` FK and/or a `oauthDelegationChain` table would be needed. Out of scope until a concrete multi-hop topology exists.

---

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
