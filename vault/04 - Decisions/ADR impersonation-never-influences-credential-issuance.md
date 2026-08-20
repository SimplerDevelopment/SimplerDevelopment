# ADR: Impersonation never influences credential issuance

**Date:** 2026-08-20
**Status:** Accepted
**Context:** Claude.ai connector re-authorization failed for a staff user who
was impersonating a client ("Authorization with Simpler Development failed"),
and the adversarial review of that fix found the same bug class minting durable
cross-tenant credentials.

## Problem

Staff impersonation (`sd_impersonate_client_id`, an 8-hour HMAC cookie) makes
`getPortalClient()` resolve to the impersonated tenant. That is correct for
*viewing* a tenant's portal — it is the feature — but three credential-issuing
surfaces consumed the same resolver, each with a different failure:

1. **OAuth consent** (`app/oauth/authorize/page.tsx`) leaked the impersonated
   id into the hidden `active_client_id`/`client_ids` form fields; the decision
   route verifies real membership and refused the whole grant → connector
   showed a generic "Authorization failed".
2. **Portal API keys** (`app/api/portal/api-keys/route.ts` POST) minted a
   full-scope `sd_mcp_` key **against the impersonated tenant** on its implicit
   path — while 403-ing the very same tenant on its explicit `clientIds` path.
   The key outlives the 8-hour impersonation window and is invisible to
   membership revocation (`resolvePortalApiKey` never re-checks membership).
3. **Confidential OAuth clients** (`app/api/portal/oauth-clients/route.ts`
   POST) stamped `ownerClientId` = the impersonated tenant.

## Decision

**An impersonating staff session may never mint or authorize a durable
credential for the impersonated tenant.** Credentials (OAuth grants, API keys,
confidential OAuth client registrations) belong to the USER; their tenant set
comes from real membership/ownership only.

Enforced by one shared resolver — `getPortalClientForCredentials()` in
`lib/portal-client.ts` — which resolves `sd-active-client` ∩ membership, else
the first (id-ordered) client, and never reads the impersonation cookie. All
three issuance sites use it. The OAuth consent page additionally shows an
explicit notice when the impersonation cookie is present, so the "why is this
authorizing MY portals, I'm viewing tenant B" moment is named rather than
silent.

**Reads stay impersonation-aware.** Listing a tenant's API keys or OAuth
clients while impersonating is what impersonation is for; only issuance is
carved out.

## Alternatives rejected

- **Hard-block consent while impersonating** ("exit impersonation first").
  Louder, but breaks a legitimate flow for no safety gain — the grant is
  membership-bounded either way, and the notice covers the confusion.
- **Grant impersonators an elevated role on the impersonated tenant** (make
  the credential paths "work"). Directly violates the MCP scope model
  (allowlist ∩ live `client_members` on every call — see ADR
  mcp-user-scoped-credentials-allowlist-intersect-membership) and would turn an
  8-hour support veneer into permanent cross-tenant credentials.
- **Patch each route locally without a shared resolver.** That is how the
  three-answers-in-three-routes divergence happened; the shared helper is the
  policy.

## Consequences

- `getPortalClients()` is now id-ordered, so `[0]` fallbacks are deterministic.
- Unit coverage: the consent page test asserts an impersonated (non-member)
  client can never appear in the grant fields — the repo's first test that
  exercises the impersonation cookie at all.
- Known remaining gap (out of scope here): `requirePortalTenant`-style route
  guards still have no role gate for impersonated *writes* generally — the
  role ladder resolves impersonators to `viewer`, which fails closed, but the
  policy for non-credential impersonated writes is undecided.
