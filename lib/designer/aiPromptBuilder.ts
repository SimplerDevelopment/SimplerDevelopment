/**
 * Prompt augmentation for AI-generated artwork that has to print well on
 * apparel. The customer types a casual idea ("a happy dachshund") and we
 * wrap it in style instructions that steer the model toward bold,
 * cuttable-outline imagery instead of soft photo-blur that looks terrible
 * once rasterised to plastisol ink on cotton.
 *
 * The four styles map to the dominant looks customers ask for:
 *
 *   illustration — flat, vector-style, strong outlines. Default for shirts
 *                  because it's the safest mode for screen / DTG printing.
 *   photo        — realistic subject on transparent background. Good when
 *                  the customer wants their pet's actual face on a tee.
 *   graphic      — bold poster / screen-print look, limited palette,
 *                  designed to read at 30+ feet.
 *   auto         — pass the user prompt through unaltered. Power-user mode.
 */
export type AiImageStyle = 'illustration' | 'photo' | 'graphic' | 'auto';

const STYLE_PREFIXES: Record<AiImageStyle, string> = {
  illustration:
    'Bold vector-style illustration, flat solid colors, strong black outlines, simple shapes, high contrast, no shading gradients, designed for screen printing on apparel. ',
  photo:
    'Photorealistic subject, sharp focus, studio lighting, isolated subject, clean cutout edges, no environmental clutter. ',
  graphic:
    'Bold graphic-design poster style, limited 2-3 color palette, heavy outlines, strong silhouette, screen-print aesthetic, designed to read from a distance. ',
  auto: '',
};

const TRANSPARENT_SUFFIX =
  ' Subject only, no background, no scenery, transparent background. The artwork must be cleanly cut out with no halos or fringing so it can be printed on a fabric of any color.';

const NO_TEXT_SUFFIX =
  ' Do not include any text, words, letters, watermarks, or signatures in the image.';

export interface BuildPromptOptions {
  /** Raw user input. Trimmed; empty input is rejected by the caller. */
  prompt: string;
  /** Style preset that drives the prefix instructions. */
  style: AiImageStyle;
  /** When true (the apparel default) ask for a transparent cut-out. */
  transparent: boolean;
  /** When true (default) explicitly forbid text — typography on AI imagery
   * is almost always garbled. Customers who want words should use the
   * Text layer instead. */
  forbidText?: boolean;
}

export function buildAiImagePrompt(opts: BuildPromptOptions): string {
  const trimmed = opts.prompt.trim();
  const prefix = STYLE_PREFIXES[opts.style] ?? '';
  const suffixes = [
    opts.transparent ? TRANSPARENT_SUFFIX : '',
    opts.forbidText !== false ? NO_TEXT_SUFFIX : '',
  ]
    .filter(Boolean)
    .join('');
  return `${prefix}${trimmed}.${suffixes}`.trim();
}
