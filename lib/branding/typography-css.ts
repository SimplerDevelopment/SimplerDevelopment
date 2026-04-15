/**
 * Generate CSS that applies per-element typography from a branding profile
 * to the matching HTML elements. Scoped under a class so multiple
 * BrandingProvider instances on one page don't collide.
 *
 * Only emits rules for elements that have at least one property configured —
 * un-configured elements fall through to the stylesheet's normal cascade
 * (Tailwind defaults, reset, etc.) untouched.
 */

import type { ResolvedBranding } from '../branding-types';

interface ElementConfig {
  key: string;
  selector: string;
}

const TYPOGRAPHY_ELEMENTS: readonly ElementConfig[] = [
  { key: 'h1', selector: 'h1' },
  { key: 'h2', selector: 'h2' },
  { key: 'h3', selector: 'h3' },
  { key: 'h4', selector: 'h4' },
  { key: 'h5', selector: 'h5' },
  { key: 'h6', selector: 'h6' },
  { key: 'p', selector: 'p' },
  { key: 'blockquote', selector: 'blockquote' },
  { key: 'button', selector: 'button, .btn' },
  { key: 'nav', selector: 'nav, .nav' },
  { key: 'small', selector: 'small' },
  { key: 'caption', selector: 'caption, figcaption' },
] as const;

export const BRANDING_SCOPE_CLASS = 'brand-scope';

export function brandingTypographyCss(
  branding: ResolvedBranding,
  scopeClass: string = BRANDING_SCOPE_CLASS,
): string {
  const typography = branding.typography;
  if (!typography) return '';

  const rules: string[] = [];
  for (const { key, selector } of TYPOGRAPHY_ELEMENTS) {
    const t = typography[key];
    if (!t) continue;

    const decls: string[] = [];
    if (t.size) decls.push(`font-size: ${t.size}`);
    if (t.weight) decls.push(`font-weight: ${t.weight}`);
    if (t.lineHeight) decls.push(`line-height: ${t.lineHeight}`);
    if (t.letterSpacing) decls.push(`letter-spacing: ${t.letterSpacing}`);
    if (t.font) decls.push(`font-family: "${t.font}", sans-serif`);

    if (decls.length === 0) continue;

    const scoped = selector
      .split(',')
      .map((s) => `.${scopeClass} ${s.trim()}`)
      .join(', ');
    rules.push(`${scoped} { ${decls.join('; ')} }`);
  }

  return rules.join('\n');
}
