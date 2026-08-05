'use client';

import { pInput, pSectionTitle } from '@/components/portal/portal-ui';

/**
 * The product editor's "Print" tab.
 *
 * Extracted from the product page, which is a god file already sitting on the
 * file-size ratchet — this panel is self-contained and has no business growing
 * it further.
 *
 * Its whole job is to stop `printfulVariantId` being silently absent. Printful
 * cannot fulfil a line without one: `submitPODOrder` throws, and that happens at
 * fulfilment time, long after the customer has paid. There is no catalog sync
 * yet (PODR-006), so the id is typed in by hand — which makes "you forgot one"
 * the default failure, and worth shouting about here rather than discovering it
 * on a paid order.
 */

/** Printful's variant ids are discoverable in their Catalog API reference. */
const PRINTFUL_CATALOG_URL = 'https://developers.printful.com/docs/#tag/Catalog-API';

export interface PrintfulFulfillmentPanelProps {
  /** Only `active` and `printfulVariantId` matter here. */
  variants: Array<{ active: boolean; printfulVariantId: number | null }>;
  /** Used only when the product has no variants. */
  productPrintfulVariantId: number | null;
  onProductPrintfulVariantIdChange: (value: number | null) => void;
}

export function PrintfulFulfillmentPanel({
  variants,
  productPrintfulVariantId,
  onProductPrintfulVariantIdChange,
}: PrintfulFulfillmentPanelProps) {
  const hasVariants = variants.length > 0;

  // Variants win when they exist — the product-level id is unused then.
  const unmappedCount = hasVariants
    ? variants.filter((v) => v.active && !v.printfulVariantId).length
    : productPrintfulVariantId
      ? 0
      : 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className={`${pSectionTitle} flex items-center gap-2`}>
        <span className="material-icons text-lg text-muted-foreground">print</span>
        Fulfillment
      </h2>

      {hasVariants ? (
        <p className="text-sm text-muted-foreground">
          Set the Printful Variant ID per variant in the Options &amp; Variants section
          below. Required for automatic print-on-demand fulfillment via Printful.
        </p>
      ) : (
        <div className="space-y-1.5 max-w-xs">
          <label className="text-sm font-medium text-foreground" htmlFor="printful-variant-id">
            Printful Variant ID
          </label>
          <input
            id="printful-variant-id"
            type="number"
            min="1"
            value={productPrintfulVariantId ?? ''}
            onChange={(e) =>
              onProductPrintfulVariantIdChange(e.target.value ? parseInt(e.target.value) : null)
            }
            placeholder="e.g. 4012"
            className={pInput}
          />
          <p className="text-xs text-muted-foreground">
            Printful catalog variant ID. Required for automatic print-on-demand
            fulfillment via Printful.
          </p>
        </div>
      )}

      {unmappedCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <span className="material-icons text-base text-amber-600">warning</span>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {hasVariants
                ? `${unmappedCount} active ${unmappedCount === 1 ? 'variant has' : 'variants have'} no Printful ID`
                : 'No Printful ID set for this product'}
            </p>
            <p className="text-xs text-muted-foreground">
              Printful cannot fulfil an order without it. The failure happens at
              fulfillment — after the customer has already paid.
            </p>
          </div>
        </div>
      )}

      <a
        href={PRINTFUL_CATALOG_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <span className="material-icons text-sm">open_in_new</span>
        Look up variant IDs in Printful&apos;s catalog
      </a>
    </div>
  );
}
