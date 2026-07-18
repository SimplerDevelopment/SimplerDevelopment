/**
 * Returns black or white — whichever has higher contrast against the supplied
 * hex tint. Uses the W3C WCAG YIQ-brightness heuristic. Returns null when the
 * tint can't be parsed; callers fall back to the base fill.
 */
export function contrastingInkForTint(
  tint: string | null | undefined,
): string | null {
  if (!tint) return null;
  const hex = tint.replace('#', '');
  const full = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128 ? '#ffffff' : '#111111';
}
