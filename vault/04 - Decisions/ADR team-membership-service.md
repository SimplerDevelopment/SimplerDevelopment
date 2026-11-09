---
type: adr
domain: auth
status: accepted
date: 2026-09-30
sources:
  - app/api/portal/team/
  - app/api/portal/settings/team/
  - lib/mcp/tools/team.ts
  - lib/ai/portal-tools/team.ts
  - lib/billing/seats.ts
---

# ADR: One team-membership service owns invites, role changes and removals

## Status
Accepted — 2026-09-30 by the owner. Tracked with PUX-227 (per-membership invites) and PUX-228 (seats).

## Context
"Who may invite, promote or remove whom" was written five times:
- REST `team/route.ts`, `settings/team/route.ts`, `team/[memberId]/route.ts`;
- the portal AI tool `invite_team_member`;
- the MCP tools `team_invite` / `team_update_role` / `team_remove_member`.

The copies disagreed, and on 2026-09-30 two of them turned out to have no caller check at all. Any member could make themselves **owner** through MCP `team_update_role` (PUX-233, P0), and invite an **admin** through the AI tool (PUX-229). Each was fixed by copying the REST rules into one more place — which is exactly how the drift started.

Separately, invite state lives on the *user* (`users.invite_token`), not the membership. That causes the accept race, the password-history bypass, dead invite links across companies, and wrong seat counts (PUX-227/228).

## Decision
A single module (e.g. `lib/team/membership.ts`) owns every membership mutation and its rules. All five surfaces call it, and none re-implements a rule:
- `invite(company, actor, { email, name, role })`
- `changeRole(company, actor, memberId, role)`
- `removeMember(company, actor, memberId)`
- `acceptInvite(token, …)`

The rules it encodes (today's REST behaviour, now the only copy):
- Only an owner or admin may invite, change roles, or remove.
- Nobody changes or removes themselves.
- Owner rows are immutable through these operations; `owner` is never assignable by a role change.
- Only owners grant `admin` or remove admins.
- Roles are `admin | member | viewer`; anything else is refused, never coerced into the database.

It is built together with per-membership invite state (PUX-227):
- Token hash, expiry and `accepted_at` live on the membership.
- Existing users accept by logging in — there is no password-reset path.
- Accept is an atomic consume.
- Seats count accepted memberships.

Callers translate the service's typed refusal into their own envelope: REST `{ success:false }`, MCP `{ error }`, AI tool `{ error }`.

## Rejected alternatives
- **Keep five copies, add parity tests.** Cheaper now, but every new surface (the next AI tool, an automation action) must remember the rules, and the tests only cover the surfaces someone thought to list.

## Consequences
- A new team surface is a call, not a re-implementation; a reviewer should treat any direct `insert/update/delete` on `client_members` outside the service as a bug.
- The PUX-233/229 fixes (rules copied into the MCP and AI tools) are interim and are replaced by calls to the service.
