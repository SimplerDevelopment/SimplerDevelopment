---
type: adr
domain: sites-hosting
status: accepted
date: 2026-06-12
sources:
  - scripts/migrations/goscribble/setup-client.ts
---

# ADR: A store_settings row must be inserted at client setup time to prevent designer-route 404s

## Status

Accepted — established during Scribble (goscribble.ai) migration, 2026-06-12.

## Context

The portal's designer route queries `store_settings` for the active client when loading the site customization interface. If no `store_settings` row exists for a new client, the route returns a 404 before the designer can be opened — blocking all visual editing for that client immediately after provisioning.

During the Scribble migration this was encountered as soon as the portal was first opened for clientId 4. The fix (inserting a default `store_settings` row) was incorporated into `setup-client.ts`, making it part of the idempotent provisioning step.

## Decision

**Every `setup-client.ts` provisioner (or equivalent new-client setup script) must insert a default `store_settings` row for the new client before returning.**

The insert should use an upsert pattern so the provisioner remains idempotent when re-run. The row requires at minimum: `clientId`, and whatever non-nullable columns the schema enforces. Values are defaults (empty/null); the client will configure them via the designer UI.

`scripts/migrations/goscribble/setup-client.ts` (206 lines) demonstrates the pattern.

## Consequences

- New clients can open the designer immediately after provisioning without a 404.
- The `setup-client.ts` file is the canonical template for future migrations; this step must not be removed when copying it.
- If the `store_settings` schema adds new non-nullable columns in the future, the default-row insert in the provisioner must be updated in lockstep (add to the `lib/db/schema/` migration, regenerate via `bun run db:generate`, update the provisioner).

## Alternatives considered

- **Lazy-create in the designer route handler** — rejected: adds error-handling complexity to the read path; cleaner to guarantee the row exists at provisioning time.
- **Make the designer route tolerate a missing row** — rejected: the route is shared across all clients; making it defensive adds noise to every request rather than fixing the root cause at provisioning time.

## Related

- [[Sites, Hosting & Publishing]]
- [[Agency, Onboarding & Branding]]
- [[Scribble Site Migration]]
