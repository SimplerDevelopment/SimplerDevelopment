/**
 * Pure CSS-variable emission for a ResolvedBranding.
 *
 * Extracted from lib/branding.ts so it's safe to import from non-server contexts
 * (tests, client components, edge runtime) without pulling in the DB.
 */

import type { ResolvedBranding } from '../branding-types';

export function brandingToCssVars(branding: ResolvedBranding): Record<string, string> {
  const vars: Record<string, string> = {
    '--brand-primary': branding.primaryColor,
    '--brand-secondary': branding.secondaryColor,
    '--brand-accent': branding.accentColor,
    '--brand-bg': branding.backgroundColor,
    '--brand-text': branding.textColor,
    '--brand-nav-bg': branding.navBackground,
    '--brand-nav-text': branding.navTextColor,
  };

  if (branding.headingFont) vars['--brand-heading-font'] = branding.headingFont;
  if (branding.bodyFont) vars['--brand-body-font'] = branding.bodyFont;
  if (branding.borderRadius) vars['--brand-border-radius'] = branding.borderRadius;
  if (branding.linkColor) vars['--brand-link-color'] = branding.linkColor;
  if (branding.linkHoverColor) vars['--brand-link-hover-color'] = branding.linkHoverColor;

  if (branding.buttonStyle) {
    const bs = branding.buttonStyle;
    if (bs.primaryBg) vars['--brand-btn-primary-bg'] = bs.primaryBg;
    if (bs.primaryText) vars['--brand-btn-primary-text'] = bs.primaryText;
    if (bs.primaryHoverBg) vars['--brand-btn-primary-hover-bg'] = bs.primaryHoverBg;
    if (bs.secondaryBg) vars['--brand-btn-secondary-bg'] = bs.secondaryBg;
    if (bs.secondaryText) vars['--brand-btn-secondary-text'] = bs.secondaryText;
    if (bs.secondaryHoverBg) vars['--brand-btn-secondary-hover-bg'] = bs.secondaryHoverBg;
    if (bs.borderRadius) vars['--brand-btn-border-radius'] = bs.borderRadius;
    if (bs.variant) vars['--brand-btn-variant'] = bs.variant;
  }

  // Per-element typography — emits --brand-<el>-size, -weight, -line-height,
  // -letter-spacing, -font. The base stylesheet (brand-typography.css) consumes
  // these with fallbacks so partial configurations are safe.
  if (branding.typography) {
    for (const [el, t] of Object.entries(branding.typography)) {
      if (!t) continue;
      const prefix = `--brand-${el}`;
      if (t.size) vars[`${prefix}-size`] = t.size;
      if (t.weight) vars[`${prefix}-weight`] = t.weight;
      if (t.lineHeight) vars[`${prefix}-line-height`] = t.lineHeight;
      if (t.letterSpacing) vars[`${prefix}-letter-spacing`] = t.letterSpacing;
      if (t.font) vars[`${prefix}-font`] = t.font;
    }
  }

  return vars;
}
