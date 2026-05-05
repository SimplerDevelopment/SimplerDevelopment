/**
 * Responsive CSS generation for block styles.
 *
 * Bridges `block.responsive` (mobile/tablet/desktop margin/padding/visibility/fontSize)
 * to a real <style> element with media queries scoped to a per-block class.
 *
 * This is the canonical consumer of `block.responsive`. The legacy
 * `combineResponsiveClasses()` Tailwind-class path silently dropped raw
 * px/% values (e.g. `lg:mt-87px` is not a real class) and only worked for
 * the SpacingSize tokens. This module accepts BOTH and produces real CSS.
 */
import type { Block } from '@/types/blocks';
import type { Breakpoint, ResponsiveSpacing, ResponsiveTypography, ResponsiveVisibility, SpacingValue } from '@/types/responsive';

// SpacingSize → CSS length. Custom values (px/%/rem/etc.) pass through.
const SPACING_TO_CSS: Record<string, string> = {
  none: '0',
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
};

// Typography token → CSS length (mirrors Tailwind text-* sizes).
const FONT_SIZE_TO_CSS: Record<string, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
  '6xl': '3.75rem',
};

// min-width thresholds for the breakpoints, matching Tailwind defaults.
const BREAKPOINT_MIN_WIDTH: Record<Breakpoint, number> = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

function spacingToCss(value: SpacingValue | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value);
  return SPACING_TO_CSS[v] ?? v;
}

/**
 * Decompose a CSS box shorthand (margin/padding) value into a single side.
 * Mirrors CSS rules:
 *   1 token : top=right=bottom=left
 *   2 tokens: top/bottom, right/left
 *   3 tokens: top, right/left, bottom
 *   4 tokens: top, right, bottom, left
 *
 * Returns null when the input is empty/undefined or no token resolves for
 * the requested side (treat as unset rather than "0").
 */
export function parseShorthandSide(
  shorthand: string | undefined,
  side: 'top' | 'right' | 'bottom' | 'left',
): string | null {
  if (!shorthand) return null;
  const tokens = String(shorthand).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let value: string | undefined;
  if (tokens.length === 1) {
    value = tokens[0];
  } else if (tokens.length === 2) {
    value = side === 'top' || side === 'bottom' ? tokens[0] : tokens[1];
  } else if (tokens.length === 3) {
    if (side === 'top') value = tokens[0];
    else if (side === 'bottom') value = tokens[2];
    else value = tokens[1];
  } else {
    const idx = side === 'top' ? 0 : side === 'right' ? 1 : side === 'bottom' ? 2 : 3;
    value = tokens[idx];
  }

  return value && value.length > 0 ? value : null;
}

function fontSizeToCss(value: string | undefined): string | null {
  if (!value) return null;
  return FONT_SIZE_TO_CSS[value] ?? value;
}

interface BreakpointDecls {
  decls: string[];
}

function breakpointDecls(
  bp: Breakpoint,
  spacing: {
    marginTop?: ResponsiveSpacing;
    marginBottom?: ResponsiveSpacing;
    marginLeft?: ResponsiveSpacing;
    marginRight?: ResponsiveSpacing;
    paddingTop?: ResponsiveSpacing;
    paddingBottom?: ResponsiveSpacing;
    paddingLeft?: ResponsiveSpacing;
    paddingRight?: ResponsiveSpacing;
    fontSize?: ResponsiveTypography;
    visibility?: ResponsiveVisibility;
  },
): BreakpointDecls {
  const decls: string[] = [];

  const mt = spacingToCss(spacing.marginTop?.[bp]);
  if (mt !== null) decls.push(`margin-top: ${mt}`);
  const mb = spacingToCss(spacing.marginBottom?.[bp]);
  if (mb !== null) decls.push(`margin-bottom: ${mb}`);
  const ml = spacingToCss(spacing.marginLeft?.[bp]);
  if (ml !== null) decls.push(`margin-left: ${ml}`);
  const mr = spacingToCss(spacing.marginRight?.[bp]);
  if (mr !== null) decls.push(`margin-right: ${mr}`);

  const pt = spacingToCss(spacing.paddingTop?.[bp]);
  if (pt !== null) decls.push(`padding-top: ${pt}`);
  const pb = spacingToCss(spacing.paddingBottom?.[bp]);
  if (pb !== null) decls.push(`padding-bottom: ${pb}`);
  const pl = spacingToCss(spacing.paddingLeft?.[bp]);
  if (pl !== null) decls.push(`padding-left: ${pl}`);
  const pr = spacingToCss(spacing.paddingRight?.[bp]);
  if (pr !== null) decls.push(`padding-right: ${pr}`);

  const fs = fontSizeToCss(spacing.fontSize?.[bp]);
  if (fs !== null) decls.push(`font-size: ${fs}`);

  if (spacing.visibility?.[bp] === false) decls.push(`display: none`);

  return { decls };
}

export interface ResponsiveCssResult {
  /** Class name to attach to the wrapper element. */
  className: string;
  /** Raw CSS string to inject inside a <style> element. */
  css: string;
}

/**
 * Sanitize a block id for use in a CSS class name. Block ids are usually
 * short alphanumeric (e.g. `b1`, `block-1700000000-abc`); we still defensively
 * strip anything not [a-zA-Z0-9_-].
 */
function sanitizeId(id: string | undefined): string {
  if (!id) return 'noid';
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Build the CSS string + class name for a block's responsive settings.
 * Returns null when the block has no responsive values worth emitting.
 */
export function generateResponsiveStyles(block: Block): ResponsiveCssResult | null {
  const r = block.responsive;
  if (!r) return null;

  const hasAnyValue =
    !!r.marginTop || !!r.marginBottom || !!r.marginLeft || !!r.marginRight ||
    !!r.paddingTop || !!r.paddingBottom || !!r.paddingLeft || !!r.paddingRight ||
    !!r.fontSize || !!r.visibility;
  if (!hasAnyValue) return null;

  const className = `bsr-${sanitizeId(block.id)}`;

  const parts: string[] = [];

  // mobile = base, no media query (mobile-first)
  const mobile = breakpointDecls('mobile', r);
  if (mobile.decls.length > 0) {
    parts.push(`.${className}{${mobile.decls.join(';')}}`);
  }

  const tablet = breakpointDecls('tablet', r);
  if (tablet.decls.length > 0) {
    parts.push(
      `@media (min-width: ${BREAKPOINT_MIN_WIDTH.tablet}px){.${className}{${tablet.decls.join(';')}}}`,
    );
  }

  const desktop = breakpointDecls('desktop', r);
  if (desktop.decls.length > 0) {
    parts.push(
      `@media (min-width: ${BREAKPOINT_MIN_WIDTH.desktop}px){.${className}{${desktop.decls.join(';')}}}`,
    );
  }

  if (parts.length === 0) return null;

  return { className, css: parts.join('') };
}
