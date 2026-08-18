# ADR: MCP credential reach = consent allowlist ∩ live membership

**Date:** 2026-08-13 · **Status:** Accepted (shipped in PR #45, commit cf0a598b3)

## Context

An MCP credential was pinned to one portal client (`oauth_access_tokens.client_id`),
so a user with three companies needed three tokens and three MCP connections. PR #45
ties the credential to the **user**, carrying a consent-time allowlist (`client_ids`
on all four credential tables), with each tool call naming the company it acts on.

## Decision

A credential's reach is **`client_ids` (consent allowlist) ∩ live `client_members`**,
re-resolved on every request (`hydrateReachable` in `lib/mcp/client-scope.ts`).
Neither side alone is sufficient: the allowlist is a ceiling set at consent, live
membership is the current truth.

- Losing a membership cuts access **immediately**, without revoking the token.
- Joining a new company does **not** widen an existing grant — that needs re-consent.
- The default company (`client_id`) must itself be reachable; a revoked default is
  re-pointed inside `hydrateReachable` so non-`tools/call` surfaces (initialize,
  resources, whoami) never serve a revoked tenant (adversarial-review finding, fixed
  same day).
- Resolution happens in `app/api/mcp/route.ts` **before** `buildMcpServer`, because
  31 registrars hoist `ctx.client.id` at registration time — resolving later would
  silently pin them to the default company.

## Alternatives rejected

- **Allowlist only** — a deleted membership would keep serving data until every
  outstanding token was found and revoked.
- **Live membership only** — joining any company would silently widen every existing
  grant, violating what the user consented to.
- **AsyncLocalStorage-backed `ctx.client` getter** — appears to honor the per-call
  `clientId` while the 31 hoisting registrars stay pinned to the default: a silent
  cross-tenant write.

## Consequences

- Per-request DB hit (`getPortalClientsWithRoles`) on every MCP call — accepted for
  correctness; the transport is stateless anyway.
- Follow-ups tracked on the master board: PUX-051…055 (consent UX for
  owner-restricted clients, cross-company revocation visibility, read/write
  classifier fixes, enabling `AUTH_ROLE_ENFORCE`, stripping the injected `clientId`).
- Migration `drizzle/9022_mcp_user_scoped_clients_manual.sql` is `json` (not
  `jsonb`) to match the Drizzle schema — the drift gate compares types verbatim.
  Hand-applied to metro before the merge (2026-08-13), backfilling 434 credentials.
