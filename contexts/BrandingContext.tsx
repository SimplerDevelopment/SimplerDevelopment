'use client';

import { createContext, useContext, ReactNode } from 'react';
import type { ResolvedBranding } from '@/lib/branding';
import { brandingToCssVars } from '@/lib/branding/css-vars';
import { brandingTypographyCss, BRANDING_SCOPE_CLASS } from '@/lib/branding/typography-css';

const BrandingContext = createContext<ResolvedBranding | null>(null);

interface BrandingProviderProps {
  branding: ResolvedBranding;
  children: ReactNode;
}

/**
 * Provides site branding to block renders and other components.
 * Wraps the page with CSS custom properties so blocks can reference
 * brand colors via var(--brand-primary), per-element typography via
 * var(--brand-h1-size) etc.
 */
export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  const cssVars = brandingToCssVars(branding);
  const typographyCss = brandingTypographyCss(branding);

  return (
    <BrandingContext.Provider value={branding}>
      <div className={BRANDING_SCOPE_CLASS} style={cssVars as React.CSSProperties}>
        {typographyCss && (
          <style dangerouslySetInnerHTML={{ __html: typographyCss }} />
        )}
        {children}
      </div>
    </BrandingContext.Provider>
  );
}

/** Access the current site's resolved branding. Returns null if outside provider. */
export function useBranding(): ResolvedBranding | null {
  return useContext(BrandingContext);
}
