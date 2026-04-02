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
