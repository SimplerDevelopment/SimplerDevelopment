/**
 * Curated design-philosophy library for the AI Style Picker.
 *
 * Inspired by the huashu-design skill's 20-philosophy library, narrowed to
 * vocabularies that produce visually distinct, non-AI-slop outcomes for
 * marketing-page blocks (hero, cta, etc.). Each philosophy is a *prompt-time
 * hint* — vocabulary the model uses to differentiate variants — not a hard
 * style preset.
 *
 * Variants do NOT lock the user into a philosophy: the user picks a variant
 * by feel, not by name. Philosophies just keep the three options from
 * collapsing into "the same look with different colors".
 *
 * Pure: no DB, no network, no React.
 */

export interface DesignPhilosophy {
  /** Stable id; safe to persist. */
  id: string;
  /** User-facing label shown above each variant preview. */
  label: string;
  /** One-sentence description shown below the label. */
  blurb: string;
  /**
   * Prompt directive — the model's "what does this philosophy want" brief.
   * Written in the imperative ("favor X, avoid Y"). Kept terse so three of
   * these fit comfortably in one prompt.
   */
  promptDirective: string;
  /** Block types this philosophy is suitable for. Empty = all. */
  appliesTo?: ReadonlyArray<string>;
}

export const PHILOSOPHIES: ReadonlyArray<DesignPhilosophy> = [
  {
    id: 'editorial',
    label: 'Editorial',
    blurb: 'Magazine-style typography, generous whitespace, asymmetric calm.',
    promptDirective:
      'Favor large display type, tight tracking, and asymmetric composition. Use whitespace as a structural element. CTAs are restrained — text-link or thin-bordered, not glossy. Avoid centered-everything; prefer left-aligned with one strong focal column.',
  },
  {
    id: 'brutalist',
    label: 'Brutalist',
    blurb: 'Raw, high-contrast, hard edges. Says what it means.',
    promptDirective:
      'Favor monospaced or grotesk type, sharp edges (borderRadius 0–4px), heavy weights, and stark contrast. Backgrounds are solid blocks. CTAs are filled rectangles with thick borders or no border. Avoid gradients, soft shadows, and rounded corners.',
  },
  {
    id: 'soft-modern',
    label: 'Soft Modern',
    blurb: 'Warm neutrals, gentle gradients, calm confidence.',
    promptDirective:
      'Favor warm off-white backgrounds, generous border-radius (12–20px), soft gradients between brand colors, and medium-weight type. CTAs are pill-shaped with subtle shadow. Avoid harsh contrast and solid black.',
  },
  {
    id: 'swiss',
    label: 'Swiss Grid',
    blurb: 'Strict grid, hierarchy through size, no decoration.',
    promptDirective:
      'Favor a clean sans-serif (Helvetica/Inter family), strict left alignment, hierarchy through size and weight only — never color or ornament. Generous line-height. CTAs are simple rectangles. Avoid centered text, gradients, and soft shadows.',
  },
  {
    id: 'minimal',
    label: 'Quiet Minimal',
    blurb: 'Vast whitespace, single focal point, low-contrast type.',
    promptDirective:
      'Favor extreme whitespace, a single small focal element, and low-contrast secondary text. Type stays at body weights — no heavy display. CTAs are text-only or hairline-bordered. Avoid filled backgrounds, gradients, and decorative elements entirely.',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    blurb: 'Dark, photographic, large display title with depth.',
    promptDirective:
      'Favor dark backgrounds with a photographic or gradient overlay, oversized display title (5rem+), and dramatic vertical rhythm. CTAs are high-contrast filled buttons or ghost-bordered. Use blendMode (multiply/overlay) when a background image is present. Avoid pastels and centered alignment.',
  },
  {
    id: 'expressive',
    label: 'Expressive',
    blurb: 'Bold color, unexpected type, playful confidence.',
    promptDirective:
      'Favor saturated brand colors, mixed type weights for emphasis (e.g. one word much heavier or italic), and unconventional layout (slight rotation via letter-spacing or asymmetry). CTAs can be vivid, oversized, or unusually shaped. Avoid generic gradients and "tech-startup blue".',
  },
];

export function getPhilosophy(id: string): DesignPhilosophy | null {
  return PHILOSOPHIES.find((p) => p.id === id) ?? null;
}

/**
 * Pick three diverse philosophies for a given block type.
 *
 * Naive but good enough for MVP: shuffle the eligible list and take 3.
 * Caller can override by passing explicit ids.
 */
export function pickPhilosophies(
  blockType: string,
  opts?: { explicitIds?: ReadonlyArray<string>; rng?: () => number },
): ReadonlyArray<DesignPhilosophy> {
  if (opts?.explicitIds && opts.explicitIds.length > 0) {
    const picked = opts.explicitIds
      .map((id) => getPhilosophy(id))
      .filter((p): p is DesignPhilosophy => p !== null);
    if (picked.length >= 3) return picked.slice(0, 3);
  }

  const eligible = PHILOSOPHIES.filter((p) => !p.appliesTo || p.appliesTo.includes(blockType));
  const rng = opts?.rng ?? Math.random;
  const shuffled = [...eligible].sort(() => rng() - 0.5);
  return shuffled.slice(0, 3);
}
