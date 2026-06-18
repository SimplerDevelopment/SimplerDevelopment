---
type: adr
domain: auth-security
status: accepted
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
  - lib/agentic-os/local-only.ts
---

# ADR: Adopt kagenti least-privilege + OBO principles, not its workload-identity infrastructure

## Status

Accepted

## Context

Evaluated whether to apply kagenti's multi-agent security model to SimplerDevelopment. Kagenti (IBM/Red Hat) secures multi-agent systems via cryptographic workload identity (SPIFFE/SPIRE), OAuth token-exchange / on-behalf-of delegation chains (RFC 8693), fine-grained per-tool scopes, a dedicated A2A gateway, and K8s namespace tenant isolation.

Assessment found the platform is single-agent-per-tenant with human-in-the-loop, not an agent-to-agent mesh:
- The MCP surface (`app/api/mcp/route.ts`, `lib/mcp-auth.ts`) is already scope-gated per tool via `hasScope()` with per-user-per-client bearer tokens.
- The plugin model (`lib/plugins/jwt.ts`, `lib/plugins/manifest.ts`, `lib/plugins/callback-auth.ts`) already enforces a `defaultScopes` ceiling with JTI replay dedup.
- The Brain AI path already routes writes through a human-review queue.
- The Agentic OS (`lib/agentic-os/local-only.ts`) is hard-gated to local dev only (404 in prod).

The genuine weakness is **authorization inconsistency across entry points**: the MCP path runs every tool through `hasScope()`; the automation engine (`lib/automation/engine.ts`) calls `executePortalTool(...)` with **no scope gate** — a misconfigured or compromised rule holds full tenant tool capability. This is an authorization-consistency problem, not a workload-identity problem.

Full trust-surface map: [[Multi-Agent Security Hardening (kagenti-inspired)]].

## Decision

Adopt kagenti's **principles** and reject its **infrastructure**.

**ADOPT:**
- Least-privilege scoping for every autonomous actor: add a `scopes` column to `automation_rules`; route every automation tool dispatch through the existing `hasScope()` from `lib/mcp-auth.ts`. Reuse existing scope vocabulary — no parallel system.
- On-behalf-of identity propagation as a **designed seam** only: document where RFC 8693 token exchange would slot into `lib/oauth/server.ts` + `lib/oauth/scopes.ts`; build only when a real agent-to-agent hop exists.
- Unified action audit: one append-only `agent_action_log` table (keyId, userId, clientId, tool, paramsHash, outcome, ts) fronting both the MCP dispatch path and the automation engine.
- Gateway enforcement via the **existing** `app/api/mcp/route.ts` boundary extended to front automations — do not build a second gateway.

**REJECT:**
- SPIFFE/SPIRE workload identity and mTLS mesh: assumes agents-as-K8s-workloads; per-caller bearer tokens already attribute identity on this monorepo.
- A second A2A gateway: `app/api/mcp/route.ts` + scope guards already are the gateway; extending it is cheaper and keeps the security model in one place.
- K8s namespace isolation: not the deployment topology; tenant isolation is already solid via token-resolved `clientId`, `lib/security/assert-owned.ts`, and `bun test:tenancy`.
- A speculative full RFC 8693 delegation stack: no real A2A hop exists today; building it now would be unused infrastructure with a maintenance cost.

## Consequences

**Easier:**
- Closes the highest-risk gap (un-scoped automation tool access) using existing machinery (`hasScope()`, existing scope vocabulary, existing token infrastructure) with no new infra.
- Keeps the security model legible: one scope vocabulary, one gateway, one audit table.
- Preserves a clear upgrade path to OBO if a real A2A feature is added.
- `bun test:tenancy` gate already covers tenant isolation; the new `agent_action_log` adds attribution without changing the tenancy model.

**Harder / accepted trade-offs:**
- No cryptographic workload identity: mitigated because per-caller bearer tokens already attribute every call to a `(userId, clientId, keyId)` triple.
- Plugin code isolation remains network-boundary-only: acceptable while all plugins are first-party. Revisit only if third-party plugin code execution is introduced.
- OBO deferred: a future agent-to-agent feature carries the Phase 2 build cost for the token-exchange grant.

**New invariants created:**
- Every autonomous actor (automation rule, MCP key, plugin) must be gated by the `hasScope()` machinery from `lib/mcp-auth.ts` before touching any portal tool. Do not introduce new `executePortalTool(...)` call sites without a scope check.
- `agent_action_log` is the single attribution source for all autonomous tool calls. Do not add per-surface audit tables for new actor types; route them here.
- `app/api/mcp/route.ts` is the gateway. Do not build a parallel gateway.

## Alternatives considered

**Full kagenti adoption (SPIRE + mesh + A2A gateway + RFC 8693):** Rejected. The infra mismatch is fundamental — we do not run agents as K8s workloads, we are not operating an agent mesh, and the platform is a Next/Railway monorepo. The build and operational cost is large; it solves problems we do not have.

**Do nothing:** Rejected. The automation engine has un-scoped full-tenant tool access. Any misconfigured or compromised automation rule can invoke any portal tool on behalf of the tenant. This is a clear least-privilege violation with no compensating control.

**Build a new dedicated agent-authZ service:** Rejected. The existing `hasScope()` gate and scope vocabulary are proven and centralized. A parallel service would diverge, require dual maintenance, and add a network hop with no security benefit over extending the existing check.

## Related

- Feature spec: [[Multi-Agent Security Hardening (kagenti-inspired)]]
- Domain maps: [[Auth & Security]] · [[Automations & Workflows]] · [[MCP & Agentic OS]]
- Gate: `bun test:tenancy` (any data-access change); `mcp-tool-registry-baseline` (no tool registration changes expected)

## Implementation notes — Phase 1 (commit 2f10f49d, 2026-06-17)

Non-obvious decisions recorded here so they are not re-litigated:

**Two separate tool layers, not one.** The automation engine calls `executePortalTool` in `lib/ai/portal-tools/index.ts`, which dispatches 81 named handlers. The MCP registrars in `lib/mcp/tools/*` use a different registration path through `lib/mcp/server.ts` and operate on a 33-scope vocabulary. There was no central `toolName → scope` map before this work. One was built as `lib/ai/portal-tools/scopes.ts` (`PORTAL_TOOL_SCOPES`, `requiredScopeFor`) to cover the portal-tools layer. This structural gap — not captured in the original spec — was the key architectural finding that shaped the Phase 1 build.

**MCP audit hook via a single `registerTool` wrapper.** The MCP audit was applied by wrapping `server.registerTool` on the `McpServer` instance inside `buildMcpServer`, applied once before any registrar runs. This required one contained `as any` cast to bypass the SDK's overloaded generic signature. The cast is safe: the wrapper is applied before registrars run, substitutes only the callback, and returns the original result unchanged. No per-tool edits were needed.

**Gate placement relative to early-return branches.** The scope gate in `lib/automation/engine.ts` sits after the `start_playbook` / `run_plugin_script` early-return branches. This means the gate only covers registered portal-tool dispatches; `requiredScopeFor` returns `null` for unknown / non-portal tool names and those pass through. This was deliberate: gating only what the scope map covers prevents false denials on any bypass path.

**Audit writes are fire-and-forget.** `logAgentAction()` calls are `void` and internally `try/catch`'d. A logging failure cannot break a tool call. Params are SHA-256 hashed via `hashParams()` — never stored raw.

**`executePortalTool` function signature change.** A fifth optional `ctx` argument (`{ source, ruleId }`) was added for attribution. This bumped `Function.length` from 4 to 5, which required updating the `mcp-tool-registry-baseline` test assertion. Any caller that inspects the function's arity should be checked against the new value.
