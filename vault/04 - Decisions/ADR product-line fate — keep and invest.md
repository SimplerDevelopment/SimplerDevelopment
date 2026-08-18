---
type: adr
domain: product
status: accepted
date: 2026-08-05
sources:
  - components/product-designer/ — the Print Designer subsystem
  - lib/decks/, lib/mcp/tools/pitch-decks.ts — the Pitch Decks subsystem
  - vault/04 - Decisions/ADR consolidate-on-product-designs-via-uuid.md
---

# ADR: Print Designer and Pitch Decks — keep and invest

## Status

Accepted. Print Designer decided 2026-08-04; Pitch Decks standing directive,
recorded here 2026-08-05 while migrating the domain maps into code.

## Context

Both subsystems were at one point open questions — invest, defer, or cut. Both
have commodity competitors, and either could reasonably have been dropped in
favour of a third-party integration.

This ADR exists because these are the only two facts from those domain maps
with **no code home**. "We chose to keep building this, and here is what we
weighed" cannot live in a comment on a schema file — it explains market
position, not behaviour. Without this note the directive would simply lapse,
and someone could later cut either subsystem without knowing it had already
been argued.

## Decision

**Print Designer — INVEST.** The cart and order path were consolidated onto it
and the legacy Fabric designer was removed. The deciding evidence was data, not
preference: `product_designs` held zero customer designs while
`product_styles` / `product_sides` held 875 rows of hand-built colourway and
printable-area configuration; the legacy side had 11 QA rows and 22 surfaces.
Throwing away the side with the real configuration would have been the
expensive mistake. See `ADR consolidate-on-product-designs-via-uuid`.

Competitors: Canva, Adobe Express, and the designers built into Printful /
Printify / Gelato. The last of these is the live risk — if tenants adopt a
print-on-demand partner, that partner's hosted designer may make ours
redundant. Revisit if that happens.

**Pitch Decks — KEEP AND INVEST.** This is the strategic AI-agent showcase
capability: the thing an agent can build end-to-end and hand to a human, which
is the platform's whole argument. Competitors: Gamma, Tome, Pitch,
Beautiful.ai — all stronger as standalone editors, none of them drivable by an
MCP agent against the tenant's own CRM and brand profile. That integration is
the differentiator, not the editor.

## Consequences

- Neither subsystem should be cut without revisiting this note first.
- The Print Designer's competitive risk is concrete and monitorable: watch
  whether tenants start fulfilling through a POD partner's own designer.
- If either directive changes, supersede this ADR rather than deleting it —
  the reasoning is the point.

## Related

- [[ADR consolidate-on-product-designs-via-uuid]]
- [[ADR code-is-the-source-of-truth]]
