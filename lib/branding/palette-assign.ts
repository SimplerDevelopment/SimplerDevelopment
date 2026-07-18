/**
 * Heuristics for mapping an extracted palette to brand color roles.
 *
 * Pure: takes PaletteColor[] (hex + HSL + weight), returns role assignments.
 * The UI shows these as suggestions the user can override before applying.
 */

import type { PaletteColor } from './palette-extract';
import { hueDistance } from './palette-extract';

export interface RoleAssignment {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

const DEFAULTS = {
  backgroundColor: '#ffffff',
  textColor: '#111827',
};

export function autoAssignRoles(palette: PaletteColor[]): RoleAssignment {
  if (palette.length === 0) return {};

  const byWeight = [...palette].sort((a, b) => b.weight - a.weight);

  // Background: lightest color with weight — prefer near-white.
  const lightCandidates = palette.filter((c) => c.l > 0.85).sort((a, b) => b.l - a.l);
  const backgroundColor = lightCandidates[0]?.hex ?? DEFAULTS.backgroundColor;

  // Text: darkest color with weight — prefer near-black.
  const darkCandidates = palette.filter((c) => c.l < 0.2).sort((a, b) => a.l - b.l);
  const textColor = darkCandidates[0]?.hex ?? DEFAULTS.textColor;

  // Primary: most saturated mid-tone (not background/text).
  const used = new Set([backgroundColor, textColor]);
  const saturated = byWeight
    .filter((c) => !used.has(c.hex) && c.s >= 0.25 && c.l >= 0.2 && c.l <= 0.75)
    .sort((a, b) => scoreForPrimary(b) - scoreForPrimary(a));

  const primary = saturated[0];
  if (primary) used.add(primary.hex);

  // Accent: high-saturation color with a hue distinct from primary.
  const accent =
    saturated
      .slice(1)
      .filter((c) => !primary || hueDistance(c.h, primary.h) > 40)
      .sort((a, b) => b.s - a.s)[0] ?? saturated[1];
  if (accent) used.add(accent.hex);

  // Secondary: next mid-tone by prevalence, different from primary + accent.
  const secondary =
    byWeight.find((c) => !used.has(c.hex) && c.l >= 0.15 && c.l <= 0.9) ?? saturated[2];

  return {
    primaryColor: primary?.hex,
    secondaryColor: secondary?.hex,
    accentColor: accent?.hex,
    backgroundColor,
    textColor,
  };
}

/** Favor high saturation, moderate lightness, and meaningful weight. */
function scoreForPrimary(c: PaletteColor): number {
  const lightnessScore = 1 - Math.abs(0.5 - c.l) * 1.2; // peak at 0.5
  return c.s * 0.6 + Math.max(0, lightnessScore) * 0.25 + Math.min(c.weight * 5, 1) * 0.15;
}
