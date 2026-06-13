---
type: adr
domain: billing
status: accepted
date: 2026-06-13
sources:
  - lib/ai/plan-gate.ts
  - lib/ai/resolve-client-key.ts
  - lib/billing/entitlements.ts
  - lib/billing/domain-catalog.ts
  - app/api/portal/integrations/api-keys/route.ts
  - app/portal/integrations/api-keys/page.tsx
  - app/api/portal/billing/byok-status/route.ts
---

# ADR: BYOK AI keys are a Scale-only unlock (the BYOK inversion)

## Status

Accepted — shipped in commit 8669039b on branch `feat/market-ready-makeover`.

## Context

Two parts of the codebase contradicted each other after earlier "BYOK plumbing" work:

- `lib/ai/plan-gate.ts` (128) returned `allowed: false, reason: 'starter_requires_byok'` for Starter-tier clients — treating BYOK as a *lowest-tier necessity*, i.e. Starter clients must supply their own key or be blocked from AI features entirely.
- `lib/billing/entitlements.ts` (101) and `lib/billing/domain-catalog.ts` (563) modeled BYOK as a *Scale-only unlock* via the `byokEligible` flag — lower tiers pay metered platform AI (marked-up, profit-centre); BYOK (spend-at-cost directly with Anthropic/OpenAI) is the premium reward for the highest tier.

The product owner confirmed the latter model: "Bring your own AI key should only be on the Scale package." The earlier `plan-gate.ts` implementation was incorrect product logic, not an intentional design.

The inversion: lower tiers *must* use platform AI (metered revenue); Scale earns the right to bypass that metering by supplying their own key.

## Decision

1. **Every paid tier (Starter / Growth / Scale) gets platform AI.** `checkAiPlanGate` in `lib/ai/plan-gate.ts` (128) no longer blocks any tier — it now always returns `{ allowed: true }`. The `starter_requires_byok` path is removed. Lower tiers run on credit-billed or metered platform AI.

2. **BYOK is gated exclusively to `entitlements.byokEligible`.** The flag resolves to `true` only for Scale-tier plans, plus all-access bypass paths: `agency` billingMode, the all-modules bundle, and legacy `subscription` rows. Source of truth: `lib/billing/entitlements.ts` (101) and the `byokEligible` per-tier field in `lib/billing/domain-catalog.ts` (563).

3. **Enforcement is three-layer (defense in depth):**

   | Layer | Location | Mechanism |
   |---|---|---|
   | Storage | `app/api/portal/integrations/api-keys/route.ts` (155) POST | Returns 403 for non-`byokEligible` clients attempting to store a key for providers `anthropic` or `openai`. Keys for `resend` and `dropbox_sign` are NOT gated by this flag. |
   | Inference | `lib/ai/resolve-client-key.ts` (199) | Only reads a stored BYOK key while the client is `byokEligible`. If the flag is false (e.g. after a Scale → lower-tier downgrade), falls back to the platform key. Fails closed: if the entitlement check itself errors, the stored key is not used. |
   | UI | `app/portal/integrations/api-keys/page.tsx` (372) | Hides the add/edit BYOK form for non-`byokEligible` clients; renders an upgrade-to-Scale prompt card instead. |

## Consequences

- A client downgraded from Scale stops using their stored BYOK key automatically — no manual revocation or key deletion required. The key remains in `client_api_keys` but is not used until `byokEligible` is restored.
- `byokEligible` from `lib/billing/entitlements.ts` is the single source of truth for all three layers. The `byok-status` route (`app/api/portal/billing/byok-status/route.ts` (50)) already surfaces this flag for admin tooling.
- `checkAiPlanGate` is now a no-op pass-through for all tiers. It is retained as an extension point (future non-tier AI gates could use it), but currently adds no restriction.
- Platform AI metering (credit ledger + usage rollup) becomes the revenue path for Starter and Growth tiers. BYOK shifts AI COGS entirely to the client on Scale tier.
- There is no integration test yet asserting the 403 storage gate for a non-eligible, non-agency client. Existing CRUD integration tests use agency-mode clients (which are `byokEligible` via the agency bypass). Unit coverage exists for the resolver gate (`tests/unit/ai-resolve-client-key.test.ts`) and the plan gate (`tests/unit/ai-plan-gate.test.ts`).

## Alternatives considered

- **BYOK as a lowest-tier necessity (the old model):** Rejected by the product owner. It inverts the profit logic — Starter/Growth should generate metered AI revenue; spending at-cost is the Scale reward.
- **Gate only at the UI layer:** Rejected. UI-only gates are trivially bypassed via direct API calls. Defense in depth (storage + inference + UI) is required for a billing-sensitive gate.
- **Remove `checkAiPlanGate` entirely:** Considered but rejected. The function is a defined extension point; removing it would require callers to be updated if a non-tier AI gate is ever needed. Leaving it as a pass-through is zero-cost.

## Related

- Domain map: [[Billing & Stripe]]
- Related ADR: [[ADR per-domain-billing-rides-services-catalog]]
- Commit: `8669039b` (branch `feat/market-ready-makeover`)
- Test files: `tests/unit/ai-resolve-client-key.test.ts`, `tests/unit/ai-plan-gate.test.ts`
