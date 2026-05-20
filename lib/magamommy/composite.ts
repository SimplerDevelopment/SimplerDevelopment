// Server-side image compositor for the magamommy autonomous-shop pipeline.
//
// Takes a transparent artwork PNG (from gpt-image-1) and stamps it onto a
// blank shirt mockup at the product's print-area bounds. Uses `sharp` so we
// stay on the same Buffer-in / Buffer-out contract the rest of the design
// pipeline already speaks (see `app/api/storefront/.../ai-image/route.ts`).
//
// Output is a PNG sized to the original baseMockup — important so the
// publisher can drop the result straight into product_images without a
// follow-up resize pass.

import sharp from 'sharp';

export interface PrintArea {
  /** Top-left X of the print area, in pixels of baseMockupPng. */
  x: number;
  /** Top-left Y of the print area, in pixels of baseMockupPng. */
  y: number;
  /** Print-area width in pixels. */
  width: number;
  /** Print-area height in pixels. */
  height: number;
}

export interface CompositeArtworkOnShirtArgs {
  /** Transparent 1024x1024 PNG from gpt-image-1. */
  artworkPng: Buffer;
  /** The blank shirt mockup (e.g. white tee with empty chest). */
  baseMockupPng: Buffer;
  /** Where on the base mockup the artwork should land, in mockup pixels. */
  printArea: PrintArea;
}

/**
 * Resize artwork to fit `printArea` preserving aspect ratio, then composite
 * at `printArea.x, printArea.y` onto baseMockupPng. Returns a PNG at the
 * original baseMockup dimensions.
 *
 * `fit: 'inside'` is the key choice: it scales the artwork down (or up) so
 * the LONGER axis hits the print-area edge, leaving the SHORTER axis with
 * empty transparent space inside the print area. That matches the customer-
 * facing canvas behaviour (LayerData.data.fit === 'contain') and avoids
 * cropping any of the slogan or visual.
 */
export async function compositeArtworkOnShirt(
  args: CompositeArtworkOnShirtArgs,
): Promise<Buffer> {
  const { artworkPng, baseMockupPng, printArea } = args;

  if (!Buffer.isBuffer(artworkPng) || artworkPng.length === 0) {
    throw new Error('[composite] artworkPng must be a non-empty Buffer');
  }
  if (!Buffer.isBuffer(baseMockupPng) || baseMockupPng.length === 0) {
    throw new Error('[composite] baseMockupPng must be a non-empty Buffer');
  }
  if (
    !Number.isFinite(printArea.x) ||
    !Number.isFinite(printArea.y) ||
    !Number.isFinite(printArea.width) ||
    !Number.isFinite(printArea.height) ||
    printArea.width <= 0 ||
    printArea.height <= 0
  ) {
    throw new Error(
      `[composite] invalid printArea: ${JSON.stringify(printArea)}`,
    );
  }

  // 1) Resize the artwork to fit inside the print area, preserving aspect.
  //    `withoutEnlargement: false` lets us scale a small AI image UP to fill
  //    the print area when needed — print quality is the publisher's problem.
  let resizedArtwork: Buffer;
  try {
    resizedArtwork = await sharp(artworkPng)
      .resize({
        width: Math.round(printArea.width),
        height: Math.round(printArea.height),
        fit: 'inside',
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();
  } catch (err) {
    throw new Error(
      `[composite] failed to resize artwork: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2) Composite onto the base mockup at the print-area top-left.
  //    Sharp's composite `top`/`left` are integers — round to be defensive.
  try {
    const out = await sharp(baseMockupPng)
      .composite([
        {
          input: resizedArtwork,
          top: Math.round(printArea.y),
          left: Math.round(printArea.x),
        },
      ])
      .png()
      .toBuffer();
    return out;
  } catch (err) {
    throw new Error(
      `[composite] failed to composite onto base mockup: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
