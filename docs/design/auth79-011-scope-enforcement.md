# AUTH79-011 — Enforce OAuth consent scopes on the REST surface (DESIGN)

**Status:** proposal for review — no code changed yet. **Owner decision needed** on 3 points (§7).
**Finding:** `authorizePortal` authorizes on role + service subscription only; it never checks `ctx.scopes`, so an `sd_oauth_*` token consented to a narrow scope (e.g. `profile:read`) has full role-level REST access. The consent screen's scope granularity is enforced for MCP tools but is **cosmetic for the REST API**.

## 1. The real exposure is small (key finding from the call-site survey)

The scary number — "437 of 561 portal routes don't call `authorizePortal`" — is a **red herring for this finding**. Those 437 routes authenticate with raw `auth()` (the NextAuth **session**), which has no bearer bridge. An `sd_oauth_*` / `sd_mcp_*` token can't authenticate there — they return **401**. OAuth tokens only reach routes that call a bearer resolver.

**The complete bearer-accepting REST surface is:**
| Entry point | Routes | Notes |
|---|---|---|
| `lib/portal-auth.ts` → `authorizePortal` | 124 (+107 brain via `requireBrainEntitlement`) | The main surface |
| `app/api/portal/clients/route.ts` | 1 | Calls `resolvePortalFromCurrentRequest` directly |
| `app/api/mcp/route.ts` (MCP tools) | — | **Already enforces scopes** via `hasScope` in every tool registrar (verified OK) |

So enforcing scope in **`authorizePortal` + one direct route** closes the finding. The 437 session-only routes need nothing here.

> **Separate issue found, NOT this card:** those 437 routes do a *membership-only* check (`getPortalClient`) with **no role/action gate** — a `viewer` can hit a CRM/projects/cards *write* route. That's a real RBAC gap but orthogonal to OAuth scope. Filing as its own finding (proposed **AUTH79-020**), not folding it in here.

## 2. Mechanism — derive the required scope from what routes already pass

Every `authorizePortal({ action, requireService })` call already declares its `(service, action)`, and scopes are in `resource:action` format. So the required scope is **derivable** — almost no route files change:

```ts
// in authorizePortal, after resolving `bearer`, `role`, `action`:
const requiredScope =
  opts?.scope ??                                   // explicit override (for no-service routes)
  (opts?.requireService
    ? `${SERVICE_TO_SCOPE_RESOURCE[opts.requireService] ?? opts.requireService}:${action === 'read' ? 'read' : 'write'}`
    : null);

// Scope is a property of DELEGATED tokens only. A session user IS the user — no scope gate.
if (bearer && requiredScope && !hasScope(bearer.scopes, requiredScope)) {
  return { response: NextResponse.json(
    { success: false, error: 'insufficient_scope', required_scope: requiredScope },
    { status: 403 }) };
}
```

- **Sessions unaffected** — enforcement is inside `if (bearer …)`.
- **Existing `sd_mcp_*` keys unaffected** — portal + mobile keys are minted with `scopes: ['*']`; `hasScope(['*'], x)` is always true. Only narrowly-scoped `sd_oauth_*` tokens (the attack vector) get constrained.
- `write` covers `write`/`admin`/`owner` actions. Where a resource has no `:write` scope (e.g. `billing` is read-only), an OAuth token simply can't write there — fail-closed; sessions still can.

## 3. `SERVICE_TO_SCOPE_RESOURCE` (the slug map — needs your eyes)

Most are identity; these are **not**, and a couple have **no scope at all**:

| `requireService` | → scope resource | Note |
|---|---|---|
| `booking` | `bookings` | ⚠️ also a **pre-existing billing bug** (see §5) |
| `pitch-decks` | `decks` | slug mismatch |
| `help-desk` | `tickets` | slug mismatch |
| `websites` | `sites` | slug mismatch |
| `email`, `surveys`, `store`, `hosting`, `ai` | (identity) | fine |
| `esign` | **— none —** | no `esign:*` scope exists. Decision: add `esign:read/write`, or map to `crm` (routes live under `crm/contracts/**`). |

## 4. No-`requireService` routes (38 files) + brain (107)

38 `authorizePortal` call sites pass `action` but no `requireService` (media, automations, approvals, billing, workflows, ai/conversations, notifications, voice, devices, trigger-links, publishing…). A `profile:*` default would be **wrong** (a media-write route must not be satisfied by `profile:write`). Recommendation: give each an explicit one-line `scope:` opt — precise, ~38 tiny edits. Natural mappings: media→`media:*`, automations→`automations:*`, approvals→`approvals:read`/`approvals:manage`, billing→`billing:read`, ai/conversations→`ai:read`, notifications→`notifications:*`. A few (voice, devices, trigger-links, publishing) have **no scope** — decide per §7.

**Brain (107 routes)** go through `requireBrainEntitlement()` → `authorizePortal({ action })` (no service) + its own brain entitlement check. Fix: have `requireBrainEntitlement` pass `scope: 'brain:read' | 'brain:write'` (and `brain:approve` for approve actions). One change covers all 107.

## 5. Must-fix prerequisite: the `booking`/`bookings` slug bug (pre-existing)

37 booking routes gate on `requireService:'booking'` (singular), but the **live** checkout provisions `services.category = 'bookings'` (plural). So paying booking customers may already be 403'd unless a legacy `'booking'` row exists. This is independent of scope work but **must be resolved first** — otherwise wiring `bookings:*` scopes onto these routes compounds a broken gate. Verify which category value is live in prod, then standardize (recommend `'bookings'` everywhere + a data migration for legacy rows).

## 6. Companion — AUTH79-016 (RFC 8707 audience), optional fold-in

The bearer context also carries `resource`. The same central spot can enforce `resourceIndicatorMatches(bearer.resource, <REST audience>)` so a token minted for `/api/mcp` isn't silently accepted at REST. Small addition; can ship together or separately.

## 7. Decisions needed before implementation
1. **`esign` + the scope-less no-service routes** (voice/devices/trigger-links/publishing): add new scopes, or map to an existing resource, or leave those routes session-only (reject all bearer tokens)?
2. **Rollout:** log-only phase first (compute + `console.warn` on would-be denials against real `sd_oauth_*` traffic for ~1 week, then enforce), or enforce immediately (low risk given `['*']` defaults)?
3. **Approve the §3 slug map** and the plan to fix the `booking`/`bookings` bug as a prerequisite.

## 8. Surface to touch (once approved)
- `lib/portal-auth.ts` — add `scope?` opt + the derivation/enforcement block + `SERVICE_TO_SCOPE_RESOURCE` (1 file, central).
- `lib/brain/entitlement.ts` — pass `scope: brain:*` (1 file → covers 107 routes).
- ~38 no-service route files — one-line `scope:` opt each.
- `app/api/portal/clients/route.ts` — direct `hasScope` check (1 file).
- Booking slug fix (prerequisite, separate commit).
- Consent-screen labels: 14 scopes render as raw strings (transparency nit — add labels).

Net: **~42 small edits + 1 central change**, not 561 routes.

## 9. Implementation status (log-only phase 1 — shipped)

Shipped as the log-only rollout (`AUTH_SCOPE_ENFORCE` unset = warn only, set to `1` = enforce):
- ✅ `lib/portal-auth.ts` — `scope?` opt, `SERVICE_TO_SCOPE_RESOURCE`, `requiredScopeFor` (exported + unit-tested), and the log-only enforcement block in the bearer path. Covers **all service-gated routes** via derivation.
- ✅ `lib/brain/entitlement.ts` — passes `brain:read`/`brain:write` (covers all 107 brain routes).
- ✅ `app/api/portal/clients/route.ts` — log-only `profile:read` check.
- ✅ `lib/oauth/scopes.ts` — added `esign:read`/`esign:write` (+ default read grant).
- ✅ `app/oauth/authorize/page.tsx` — consent labels for the 18 previously-unlabeled scopes.

**Deferred to phase 2 (log-driven):** the ~38 no-`requireService` route annotations (media, automations, approvals, notifications, etc.). In log-only mode these are simply unmapped (no warn), harmless. Annotate them from what the `oauth.scope.insufficient` log actually shows getting hit by real `sd_oauth_` tokens, rather than guessing 38 scopes up front — several (voice, devices, trigger-links, publishing, billing-write, ai-write) have **no matching scope** and need a scope-catalog decision first.

**Still open before flipping `AUTH_SCOPE_ENFORCE=1`:** the `booking`/`bookings` billing slug bug (§5) — resolve so real booking customers aren't 403'd by the service gate before the scope gate is even reached.
