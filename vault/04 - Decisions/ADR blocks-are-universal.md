---
type: adr
domain: cms-blocks
status: accepted
date: 2026-06-09
sources:
  - CLAUDE.md (root) — "Blocks are universal, never client-specific"
  - lib/blocks/CLAUDE.md — "The cardinal rule"
  - .planning/agentic-os.md — simplerdev-block-type skill description
---

# ADR: Blocks are universal — never client-specific

## Status

Accepted — backfilled 2026-06-09 from root `CLAUDE.md` and `lib/blocks/CLAUDE.md`.

## Context

As client work accumulated, there was pressure to add quick "one-off" block types that
serve a single tenant's needs. This approach would have created a proliferation of
client-branded block types in the registry, render paths that conditionally activate
only for certain tenants, and coupling between the CMS layer and the multi-tenant
database layer.

The platform also had a history of hand-rolled block additions that consistently missed
one or more of the five required integration points (type definition, registry entry,
render component, production renderer switch case, `/api/blocks` metadata). Incomplete
block additions caused silent rendering failures or broken editor previews.

## Decision

**A block is a platform primitive, not a client deliverable.**

1. Every block type is available to every tenant. No `clientId` or `siteId` gates in
   block registration or rendering.
2. A new block type must land in all five integration points in lockstep:
   - TS interface in `types/blocks.ts`
   - Registry entry in `lib/blocks/registry.ts`
   - Render component in `components/blocks/`
   - Production renderer case in `app/sites/...`
   - `/api/blocks` metadata endpoint
3. Use the `simplerdev-block-type` skill to scaffold all five together. **Do not
   hand-roll** — every manually-rolled block in the project's history has missed at
   least one integration point.
4. The `icon:` field in a registry entry uses a Material Icon name string (e.g.
   `'title'`), not a rendered emoji glyph.

## Consequences

- Client-specific visual requirements are expressed through block *configuration*
  (field values, styles, conditional rendering within a block), not through separate
  block types.
- The `simplerdev-block-type` skill is mandatory for new block work; direct file edits
  without it are a process violation.
- Any block scaffolded correctly is automatically available in every tenant's editor
  and page renderer with no per-client configuration.

## Alternatives considered

Client-specific block types were implicitly tried (and found to cause drift) before the
universal rule was codified. The `lib/blocks/CLAUDE.md` notes: "every block we have
ever hand-rolled has missed at least one of the five."

## Related

- [[CMS & Blocks]]
- [[Visual Editor]]
- [[Route Trees & Audiences]]
