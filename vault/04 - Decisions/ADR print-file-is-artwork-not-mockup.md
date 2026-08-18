---
type: adr
domain: storefront
status: accepted
date: 2026-08-04
sources:
  - lib/fulfillment/pod.ts — submitPODOrder, print-file resolution
  - lib/printing/composite.ts — compositeArtworkOnShirt
  - app/api/storefront/[siteId]/designs/[designId]/route.ts — regenerateMockupForStaffSave
  - app/api/storefront/[siteId]/designs/[designId]/print-file/route.ts — validatePrintFile
  - drizzle/9016_product_designs_print_files_manual.sql
---

# ADR: A print file is artwork, never a mockup — fail the order rather than guess

## Status

Accepted 2026-08-04. Shipped in `b74aee45` (guard + tests) and `1d922945` (pipeline).

## Context

`submitPODOrder` needs one thing per order item: a file to send Printful. Before this
change it resolved that file in two steps — `orderItems.printReadyUrl`, and failing
that, `designs.renderedUrl`.

Both legs were wrong.

`orderItems.printReadyUrl` carried the comment *"populated by Stripe webhook"* and was
never written by anything. The only real source was therefore the fallback.

`designs.renderedUrl` does not hold a print file. It is written by
`regenerateMockupForStaffSave`, which calls `compositeArtworkOnShirt` — *"takes a
transparent artwork PNG and stamps it onto a blank mockup image"*, sized to drop
straight into `product_images`. It is a marketing mockup: the artwork already
composited onto a photograph of the garment.

Sending that to Printful prints a picture of a t-shirt onto a t-shirt. Not a rendering
glitch — scrap, on garments the store owner has paid for, discovered by the customer.

The fallback was also mostly unreachable. The regen is gated on
`isStaff && isTemplate`, so a customer's own design left `renderedUrl` null and
Printful received `files: []` instead.

## Decision

`orderItems.printReadyUrl` is the only accepted source. A missing print file throws
and the order records `printfulFulfillmentStatus: 'failed'` rather than submitting.

No fallback to any rendered, thumbnail, or composite image. There is no "close
enough" substitute for a print file.

## Consequences

A failed submission is now a visible support ticket instead of an invisible bad
print. That trade is deliberate and one-directional: the failure mode we accept costs
an email; the one we removed cost physical stock and a customer's trust.

Because the fallback is gone, *something* must write `printReadyUrl` before an order
can be fulfilled. That is the pipeline added alongside: the designer exports a
transparent, print-resolution PNG; the upload route validates it; checkout freezes the
URL onto the order item at purchase, so later edits or deletion of the design cannot
change what ships.

Validation treats the upload as a trust boundary, since whatever lands there gets
printed. Two checks carry most of the weight:

- **Alpha channel required.** A mockup is opaque; artwork on transparent is not. This
  is the cheapest reliable way to catch the exact mistake this ADR exists to prevent.
- **1500px long-edge floor.** `product_sides` records the print area in mockup-image
  pixels and nothing in the schema carries physical inches, so true DPI is not
  computable. One documented, tunable constant beats a formula pretending to know the
  physical size.

## Notes

The `MIN_PRINT_EDGE_PX` floor is a calibration knob, not a law. Raise it if garments
come back soft. It lives next to the validator so the number and its justification
stay together.

## Related

- [[Storefront & Commerce]]
- [[Print Designer]]
- [[ADR consolidate-on-product-designs-via-uuid]]
