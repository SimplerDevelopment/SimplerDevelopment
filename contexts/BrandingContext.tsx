'use client';

import { createContext, useContext, ReactNode } from 'react';
import type { ResolvedBranding } from '@/lib/branding';

const BrandingContext = createContext<ResolvedBranding | null>(null);

interface BrandingProviderProps {
  branding: ResolvedBranding;
  children: ReactNode;
}

/**
 * Provides site branding to block renders and other components.
 * Wraps the page with CSS custom properties so blocks can reference
 * brand colors via var(--brand-primary), etc.
 */
export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  const cssVars: Record<string, string> = {
    '--brand-primary': branding.primaryColor,
    '--brand-secondary': branding.secondaryColor,
    '--brand-accent': branding.accentColor,
    '--brand-bg': branding.backgroundColor,
    '--brand-text': branding.textColor,
    '--brand-nav-bg': branding.navBackground,
    '--brand-nav-text': branding.navTextColor,
  };

  if (branding.headingFont) cssVars['--brand-heading-font'] = branding.headingFont;
  if (branding.bodyFont) cssVars['--brand-body-font'] = branding.bodyFont;
  if (branding.borderRadius) cssVars['--brand-border-radius'] = branding.borderRadius;
  if (branding.linkColor) cssVars['--brand-link-color'] = branding.linkColor;
  if (branding.linkHoverColor) cssVars['--brand-link-hover-color'] = branding.linkHoverColor;

  if (branding.buttonStyle) {
    const bs = branding.buttonStyle;
    if (bs.primaryBg) cssVars['--brand-btn-primary-bg'] = bs.primaryBg;
    if (bs.primaryText) cssVars['--brand-btn-primary-text'] = bs.primaryText;
    if (bs.primaryHoverBg) cssVars['--brand-btn-primary-hover-bg'] = bs.primaryHoverBg;
    if (bs.secondaryBg) cssVars['--brand-btn-secondary-bg'] = bs.secondaryBg;
    if (bs.secondaryText) cssVars['--brand-btn-secondary-text'] = bs.secondaryText;
    if (bs.secondaryHoverBg) cssVars['--brand-btn-secondary-hover-bg'] = bs.secondaryHoverBg;
    if (bs.borderRadius) cssVars['--brand-btn-border-radius'] = bs.borderRadius;
  }

  return (
    <BrandingContext.Provider value={branding}>
      <div style={cssVars as React.CSSProperties}>
        {children}
      </div>
    </BrandingContext.Provider>
  );
}

/** Access the current site's resolved branding. Returns null if outside provider. */
export function useBranding(): ResolvedBranding | null {
  return useContext(BrandingContext);
}
